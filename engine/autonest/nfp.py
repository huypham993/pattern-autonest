"""No-fit polygons by convex decomposition.

For two regions P (fixed) and Q (moving, reference point at its local origin),
the moving part placed at ``x`` overlaps P iff ``x`` lies in the interior of

    NFP(P, Q) = P (+) (-Q)                (Minkowski sum)

Minkowski sums distribute over union, so with convex decompositions
P = U P_i and Q = U Q_j

    NFP = U_ij  P_i (+) (-Q_j)

and the sum of two convex polygons is their edges merged by angle.  Holes are never triangulated (the decomposition covers exactly the
region), so the NFP keeps its holes: a hole in the NFP is a position where Q
sits inside a hole of P (part-in-hole) without touching it.

Everything is exact up to floating point; the union and the later feasible
region computation are done by Clipper in integer coordinates
(``regions.CLIPPER_SCALE`` units per mm).
"""
from __future__ import annotations

import math
import numpy as np
import pyclipper
import shapely
from shapely.geometry import Polygon
from shapely.geometry.polygon import orient

from . import regions

S = regions.CLIPPER_SCALE


# ---------------------------------------------------------------- convex decomposition
def _cross(o, a, b) -> float:
    return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])


def _is_convex(pts: list[tuple[float, float]], eps: float) -> bool:
    n = len(pts)
    for i in range(n):
        if _cross(pts[i - 1], pts[i], pts[(i + 1) % n]) < -eps:
            return False
    return True


def _strictly_convex(p: np.ndarray) -> np.ndarray:
    """Drop collinear and barely reflex vertices: the edge merge in _convex_sums needs edge angles that
    strictly increase around the piece (rotation noise would otherwise wrap a ~0 angle to ~2pi)."""
    scale = max(1.0, float(np.abs(p).max()))
    eps = 1e-9 * scale * scale
    while len(p) > 3:
        keep = [i for i in range(len(p)) if _cross(p[i - 1], p[i], p[(i + 1) % len(p)]) > eps]
        if len(keep) == len(p) or len(keep) < 3:
            break
        p = p[keep]
    return p


def convex_decompose(poly: Polygon) -> list[np.ndarray]:
    """Convex pieces (CCW vertex arrays) whose union is exactly ``poly``.

    Constrained Delaunay triangulation (GEOS) followed by Hertel-Mehlhorn
    merging: a diagonal is removed when the merged piece stays convex.
    """
    poly = orient(poly, 1.0)
    if poly.is_empty or poly.area <= 0:
        return []
    ext = np.asarray(poly.exterior.coords)[:-1]
    if not poly.interiors and _is_convex([tuple(p) for p in ext], 1e-12):
        return [_strictly_convex(ext.copy())]
    tris = shapely.constrained_delaunay_triangles(poly)
    key: dict[tuple[float, float], int] = {}
    verts: list[tuple[float, float]] = []

    def vid(p) -> int:
        k = (round(p[0], 9), round(p[1], 9))
        i = key.get(k)
        if i is None:
            i = key[k] = len(verts)
            verts.append((float(p[0]), float(p[1])))
        return i

    pieces: dict[int, list[int]] = {}
    for t in tris.geoms:
        c = list(orient(t, 1.0).exterior.coords)[:-1]
        ids = [vid(p) for p in c]
        if len(set(ids)) == 3:
            pieces[len(pieces)] = ids
    edge_owner: dict[tuple[int, int], int] = {}
    for pid, ids in pieces.items():
        for k in range(len(ids)):
            edge_owner[(ids[k], ids[(k + 1) % len(ids)])] = pid
    scale = max(1.0, float(np.abs(ext).max()))
    eps = 1e-12 * scale * scale
    diagonals = [e for e in edge_owner if (e[1], e[0]) in edge_owner and e[0] < e[1]]
    # longest diagonals first gives fewer, fatter pieces
    diagonals.sort(key=lambda e: -math.dist(verts[e[0]], verts[e[1]]))
    for u, v in diagonals:
        a = edge_owner.get((u, v))
        b = edge_owner.get((v, u))
        if a is None or b is None or a == b:
            continue
        pa, pb = pieces[a], pieces[b]
        ia = pa.index(v)
        ra = pa[ia:] + pa[:ia]           # v ... u
        ib = pb.index(u)
        rb = pb[ib:] + pb[:ib]           # u ... v
        merged = ra + rb[1:-1]
        if not _is_convex([verts[i] for i in merged], eps):
            continue
        pieces[a] = merged
        del pieces[b]
        edge_owner.pop((u, v), None)
        edge_owner.pop((v, u), None)
        for k in range(len(merged)):
            e = (merged[k], merged[(k + 1) % len(merged)])
            if e in edge_owner:
                edge_owner[e] = a
    return [_strictly_convex(np.asarray([verts[i] for i in ids])) for ids in pieces.values()]


def decompose(geom) -> list[np.ndarray]:
    out: list[np.ndarray] = []
    for p in regions.polygons_of(geom):
        out.extend(convex_decompose(p))
    return out


def rotate_pieces(pieces: list[np.ndarray], angle_deg: float) -> list[np.ndarray]:
    t = math.radians(angle_deg)
    c, s = math.cos(t), math.sin(t)
    R = np.array([[c, s], [-s, c]])  # row-vector form of [[c,-s],[s,c]]
    return [p @ R for p in pieces]


# ---------------------------------------------------------------- integer paths
def to_paths(geom) -> list[list[tuple[int, int]]]:
    """MultiPolygon (mm) -> Clipper paths, outers CCW, holes CW."""
    out = []
    for p in regions.polygons_of(geom):
        p = orient(p, 1.0)
        for ring in [p.exterior] + list(p.interiors):
            pts = [(round(x * S), round(y * S)) for x, y in list(ring.coords)[:-1]]
            if len(pts) >= 3:
                out.append(pts)
    return out


def translate_paths(paths, dx: int, dy: int):
    return [[(x + dx, y + dy) for x, y in p] for p in paths]


def union_paths(paths) -> list:
    if not paths:
        return []
    pc = pyclipper.Pyclipper()
    pc.AddPaths(paths, pyclipper.PT_SUBJECT, True)
    return pc.Execute(pyclipper.CT_UNION, pyclipper.PFT_NONZERO, pyclipper.PFT_NONZERO)


def _edges(pieces: list[np.ndarray]):
    """Per piece: bottom-left vertex, edge vectors and their angles in [0, 2pi) (CCW convex pieces)."""
    V = np.vstack(pieces)
    lens = np.array([len(p) for p in pieces])
    first = np.concatenate([[0], np.cumsum(lens)[:-1]])
    nxt = np.arange(len(V)) + 1
    nxt[first + lens - 1] = first
    E = V[nxt] - V
    ang = np.mod(np.arctan2(E[:, 1], E[:, 0]), 2 * math.pi)
    start = np.array([p[np.lexsort((p[:, 0], p[:, 1]))[0]] for p in pieces])
    return start, E, ang, lens, first


def _convex_sums(pieces_a: list[np.ndarray], pieces_b: list[np.ndarray]):
    """Integer points of every ring P_i (+) Q_j, as one list, and where each ring ends (ring i * nb + j).

    The sum of two convex polygons is their edges merged by angle, starting at the sum of their bottom-left
    vertices: O(n + m) per pair, all pairs in one vectorised sort (no pairwise point clouds, no hulls)."""
    sa, ea, aa, la, fa = _edges(pieces_a)
    sb, eb, ab, lb, fb = _edges(pieces_b)
    na, nb = len(pieces_a), len(pieces_b)
    # edge indices of A_i for every j, and of B_j for every i, each tagged with its pair i * nb + j
    ia = np.concatenate([np.tile(np.arange(fa[i], fa[i] + la[i]), nb) for i in range(na)])
    pa = np.repeat(np.arange(na * nb), np.repeat(la, nb))
    ib = np.tile(np.concatenate([np.arange(fb[j], fb[j] + lb[j]) for j in range(nb)]), na)
    pb = np.tile(np.repeat(np.arange(nb), lb), na) + np.repeat(np.arange(na) * nb, lb.sum())
    pair = np.concatenate([pa, pb])
    E = np.concatenate([ea[ia], eb[ib]])
    order = np.lexsort((np.concatenate([aa[ia], ab[ib]]), pair))
    pair, E = pair[order], E[order]
    C = np.cumsum(E, axis=0)
    counts = np.bincount(pair, minlength=na * nb)
    ends = np.cumsum(counts)
    base = np.vstack([[0.0, 0.0], C[ends[:-1] - 1]])          # cumsum before each pair
    starts = (sa[:, None, :] + sb[None, :, :]).reshape(-1, 2)  # pair i * nb + j
    pts = starts[pair] + C - base[pair]
    return np.round(pts * S).astype(np.int64).tolist(), ends.tolist()   # plain lists: Clipper takes them directly


def nfp(pieces_a: list[np.ndarray], pieces_b: list[np.ndarray]) -> list:
    """Integer NFP paths of fixed A and moving B (both in their local frames)."""
    if not pieces_a or not pieces_b:
        return []
    neg_b = [-q for q in pieces_b]   # point reflection keeps the pieces CCW and convex
    pts, ends = _convex_sums(pieces_a, neg_b)
    starts = [0] + ends[:-1]
    nb = len(pieces_b)
    # every sum is CCW, which is all NONZERO union needs.
    # Union hierarchically (one row per piece of A, then pairwise): much faster than one
    # big union of heavily overlapping polygons. The last vertex of a ring is its start again;
    # Clipper closes the ring itself.
    level = []
    for i in range(len(pieces_a)):
        row = [pts[starts[k]:ends[k]] for k in range(i * nb, (i + 1) * nb) if ends[k] - starts[k] >= 3]
        if row:
            level.append(union_paths(row))
    while len(level) > 1:
        nxt = []
        for j in range(0, len(level), 2):
            nxt.append(union_paths(level[j] + level[j + 1]) if j + 1 < len(level) else level[j])
        level = nxt
    return level[0] if level else []


def nfp_pair(pieces_ab) -> list:
    """nfp() for a process pool (one picklable argument)."""
    return nfp(*pieces_ab)


def feasible_points(region: list[tuple[int, int, int, int]], obstacles: list) -> list[tuple[int, int]]:
    """Vertices of (union of rectangles - union of obstacle paths)."""
    rects = [[(x0, y0), (x1, y0), (x1, y1), (x0, y1)] for x0, y0, x1, y1 in region]
    if not obstacles and len(rects) == 1:
        return rects[0]
    pc = pyclipper.Pyclipper()
    pc.AddPaths(rects, pyclipper.PT_SUBJECT, True)
    pc.AddPaths(obstacles, pyclipper.PT_CLIP, True)
    res = pc.Execute(pyclipper.CT_DIFFERENCE, pyclipper.PFT_NONZERO, pyclipper.PFT_NONZERO)
    pts = []
    for path in res:
        pts.extend((int(x), int(y)) for x, y in path)
    return pts

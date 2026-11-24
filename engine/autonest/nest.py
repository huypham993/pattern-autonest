"""Phase 3A: true-shape nesting on a fixed artboard.

Pipeline
    geometry.json --analysis (Phase 2)--> silhouettes / envelopes (mm, sheet frame)
                  --collision shapes-->   envelope (+) disk(spacing/2 + eps), part_in_hole aware
                  --NFP placement-->      rotation + translation per group
                  --independent verify--> placement.json (status "failed" and no placements if
                                          the verifier finds any violation)

Geometry used for collision is never a bounding box: the moving part is
placed at a vertex of  IFP - U NFP(placed_j, part)  where the no-fit polygons
come from the exact convex decomposition of the true-shape collision regions
(see ``nfp.py``).  Bounding boxes are only used for the inner-fit rectangle,
which is exact for a rectangular artboard: a shape lies inside an axis-aligned
rectangle iff its axis-aligned bounds do.

Spacing: every part is grown by spacing/2 (+ ``EPS_MM``) with an offset that
contains the exact Minkowski sum with a disk, so two non-overlapping collision
regions are at least ``spacing`` apart.  Curved parts are grown from their
conservative envelope (flattened outline + curve tolerance), so the real
Bezier outline is covered too.
"""
from __future__ import annotations

import hashlib
import math
import multiprocessing
import os
import random
import threading
import time
from concurrent.futures import ProcessPoolExecutor
from concurrent.futures.process import BrokenProcessPool
from dataclasses import dataclass, field
from typing import Any

import numpy as np
import pyclipper

from . import nfp, regions
from .analyze import ENGINE_VERSION, analyze_document
from .contract import PLACEMENT_SCHEMA
from .rotation import candidate_orientations, signed
from .transform import apply_matrix, to_illustrator_matrix
from .units import SheetFrame

EPS_MM = 0.002          # extra clearance so that "touching" collision shapes still keep spacing
def simplify_mm(spacing: float) -> float:
    """Collision shapes are simplified, then grown back by this much (outer approximation).

    Measured on a real 78-part job (spacing 5 mm, 300-600 vertices per part): 0.05 mm placed 25 parts
    in 60 s, 0.2 mm placed 65 (the sheet was full).  The extra gap is at most this value, so keep it
    small relative to the spacing.
    """
    return min(0.2, max(FINE_SIMPLIFY_MM, 0.04 * spacing))


FINE_SIMPLIFY_MM = 0.05  # retry tolerance for a part that found no space with the coarser shapes
S = regions.CLIPPER_SCALE

# below this many parts the pool's start-up costs more than it saves
PARALLEL_MIN_PARTS = 12

QUALITY = {
    #               coarse angles, refine, max restarts
    "fast":         (8, False, 1),
    "balanced":     (12, True, 6),
    "high_quality": (36, True, 40),
}


@dataclass
class NestPart:
    id: str
    uuid: str | None
    name: str
    index: int
    pivot_mm: tuple[float, float]
    area_mm2: float                 # true silhouette area
    collision_area_mm2: float
    shape_key: str                  # identical shapes share NFP cache entries
    pieces: list[np.ndarray]        # convex pieces of the collision region, local frame
    env_bounds: list[float]         # envelope bounds, local frame (for the inner-fit rectangle)
    env_hull: np.ndarray            # envelope convex hull, local frame
    angles: list[float]
    single: bool = True             # envelope is one polygon (enables free-pocket pruning)
    pieces_fine: list | None = None # same region simplified at FINE_SIMPLIFY_MM, if that differs
    rot_cache: dict = field(default_factory=dict)

    def rotated(self, angle: float, fine: bool = False):
        fine = fine and self.pieces_fine is not None
        r = self.rot_cache.get((angle, fine))
        if r is None:
            pieces = nfp.rotate_pieces(self.pieces_fine if fine else self.pieces, angle)
            hull = nfp.rotate_pieces([self.env_hull], angle)[0]
            bx = (float(hull[:, 0].min()), float(hull[:, 1].min()), float(hull[:, 0].max()), float(hull[:, 1].max()))
            allp = np.vstack(pieces)
            cb = (math.floor(allp[:, 0].min() * S) - 2, math.floor(allp[:, 1].min() * S) - 2,
                  math.ceil(allp[:, 0].max() * S) + 2, math.ceil(allp[:, 1].max() * S) + 2)
            r = self.rot_cache[(angle, fine)] = (pieces, bx, cb)
        return r


@dataclass
class Placed:
    part: NestPart
    angle: float
    x: int        # pivot position, Clipper units (mm * S)
    y: int
    bounds: tuple[float, float, float, float]   # envelope bounds in mm, sheet frame
    blocked: dict = field(default_factory=dict)

    def collision_box(self, fine: bool = False) -> tuple[int, int, int, int]:
        cb = self.part.rotated(self.angle, fine)[2]
        return cb[0] + self.x, cb[1] + self.y, cb[2] + self.x, cb[3] + self.y

    def blocked_paths(self, grow: int, fine: bool = False) -> list:
        """Collision shape grown by ``grow`` units: no other envelope can enter it."""
        if fine not in self.blocked:
            pieces = self.part.rotated(self.angle, fine)[0]
            co = pyclipper.PyclipperOffset()
            co.AddPaths(nfp.union_paths([np.round(q * S).astype(np.int64).tolist() for q in pieces]),
                        pyclipper.JT_ROUND, pyclipper.ET_CLOSEDPOLYGON)
            # round joins are chords of the true arcs, i.e. inside the exact offset: never over-blocks
            self.blocked[fine] = nfp.translate_paths(co.Execute(grow), self.x, self.y)
        return self.blocked[fine]


def _shape_key(geom) -> str:
    h = hashlib.sha256()
    for p in regions.polygons_of(geom):
        for ring in [p.exterior] + list(p.interiors):
            h.update(np.round(np.asarray(ring.coords), 5).tobytes())
            h.update(b"|")
    return h.hexdigest()[:16]


def outer_simplify(geom, delta: float):
    """Fewer vertices, never smaller: simplify by ``delta`` then grow by ``delta`` (mitre joins).

    Douglas-Peucker keeps every original vertex (hence every original edge) within ``delta``
    of the simplified outline, so the mitre offset by ``delta`` contains the original region.
    The containment is checked numerically too; on any doubt the original is returned.
    """
    if delta <= 0 or geom.is_empty:
        return geom
    simp = regions.clean(geom.simplify(delta, preserve_topology=True))
    grown = regions.clean(simp.buffer(delta, join_style="mitre", mitre_limit=10.0))
    n0 = sum(len(q.exterior.coords) + sum(len(h.coords) for h in q.interiors) for q in regions.polygons_of(geom))
    n1 = sum(len(q.exterior.coords) + sum(len(h.coords) for h in q.interiors) for q in regions.polygons_of(grown))
    if grown.is_empty or n1 >= n0 or geom.difference(grown).area > 1e-9:
        return geom
    return grown


def build_parts(analysis: dict, settings: dict) -> tuple[list[NestPart], list[dict]]:
    """Analysis parts -> nestable parts (local frame around the envelope bbox centre)."""
    spacing = float(settings["spacing_mm"])
    allow_holes = bool(settings.get("part_in_hole", True))
    angles_all = [o.angle_deg for o in candidate_orientations(settings["rotation"]) if not o.mirror]
    parts: list[NestPart] = []
    unplaced: list[dict] = []
    for i, p in enumerate(analysis["parts"]):
        codes = {x["code"] for x in p["issues"] if x["severity"] == "error"}
        if p["status"] == "error" or not p["silhouette"]:
            reason = "DOES_NOT_FIT" if codes == {"PART_TOO_LARGE"} else "INVALID_GEOMETRY"
            unplaced.append({"id": p["id"], "reason": reason, "detail": ",".join(sorted(codes)) or "no silhouette"})
            continue
        sil = regions.geometry_from_json(p["silhouette"])
        env = regions.geometry_from_json(p["envelope"]) if p.get("envelope") else sil
        bx = env.bounds
        pivot = ((bx[0] + bx[2]) / 2.0, (bx[1] + bx[3]) / 2.0)
        from shapely import affinity
        env_l = affinity.translate(env, -pivot[0], -pivot[1])
        coll = regions.safe_offset(env_l, spacing / 2.0 + EPS_MM)
        if not allow_holes:
            from shapely.geometry import MultiPolygon, Polygon
            coll = regions.clean(MultiPolygon([Polygon(q.exterior) for q in regions.polygons_of(coll)]))
        fine = None
        if simplify_mm(spacing) > FINE_SIMPLIFY_MM:
            fine = nfp.decompose(outer_simplify(coll, FINE_SIMPLIFY_MM))
        coll = outer_simplify(coll, simplify_mm(spacing))
        pieces = nfp.decompose(coll)
        parts.append(NestPart(
            id=p["id"], uuid=p.get("uuid"), name=p.get("name", ""), index=i, pivot_mm=pivot,
            area_mm2=sil.area, collision_area_mm2=coll.area, shape_key=_shape_key(coll),
            pieces=pieces, env_bounds=list(env_l.bounds),
            env_hull=np.asarray(env_l.convex_hull.exterior.coords)[:-1], angles=angles_all,
            single=len(regions.polygons_of(env)) == 1, pieces_fine=fine,
        ))
    return parts, unplaced


class Solver:
    def __init__(self, parts: list[NestPart], usable: tuple[float, float, float, float], quality: str,
                 deadline: float, prefer_original: bool, reach: float = 0.0, pool=None, overrun_s: float = 0.0,
                 start_corner: str = "bottom_left"):
        self.parts = parts
        self.from_top = start_corner.startswith("top")
        self.from_right = start_corner.endswith("right")
        self.pool = pool          # optional process pool: NFPs of one placement step are computed in parallel
        self.pool_error = None    # why the pool was dropped (the rest is computed serially)
        self._fresh: set = set()  # keys computed by the pool and not yet read
        self.usable = usable
        self.coarse_n, self.refine, self.max_starts = QUALITY.get(quality, QUALITY["balanced"])
        self.deadline = deadline
        self.hard_deadline = deadline + overrun_s   # the first start gives up here even if parts remain
        self.prefer_original = prefer_original
        self.reach = reach
        self.fine = False  # True during a start that uses the finer collision shapes
        self.cache: dict = {}
        self.nfp_computed = 0
        self.nfp_hits = 0
        self.timed_out = False
        # the first start must place every part that fits: after the deadline it finishes with few angles
        self.must_finish = False
        self.rushed = False
        self.part_rushed = False
        for p in parts:
            # only orientations whose rotated envelope fits the usable rectangle (exact test for a rectangle)
            p.angles = [a for a in p.angles if self._ifp(p.rotated(a)[1]) is not None]


    # -------------------------------------------------------------- geometry helpers
    def _nfp(self, fixed: Placed, part: NestPart, angle: float):
        key = (fixed.part.shape_key, fixed.angle, part.shape_key, angle, self.fine)
        base = self.cache.get(key)
        if key in self._fresh:
            self._fresh.discard(key)
        elif base is None:
            self.nfp_computed += 1
            base = self.cache[key] = nfp.nfp(fixed.part.rotated(fixed.angle, self.fine)[0],
                                             part.rotated(angle, self.fine)[0])
        else:
            self.nfp_hits += 1
        return nfp.translate_paths(base, fixed.x, fixed.y)

    def _prefetch(self, steps) -> None:
        """Compute the missing NFPs of some (near, part, angle) steps in the pool, all in one batch so every worker
        stays busy (same function, so the same result as serial)."""
        keys, tasks, seen = [], [], set()
        for near, part, angle in steps:
            for q in near:
                key = (q.part.shape_key, q.angle, part.shape_key, angle, self.fine)
                if key not in self.cache and key not in seen:
                    seen.add(key)
                    keys.append(key)
                    tasks.append((q.part.rotated(q.angle, self.fine)[0], part.rotated(angle, self.fine)[0]))
        if len(tasks) < 2:
            return
        chunk = max(1, len(tasks) // (4 * self.pool._max_workers))
        try:
            results = list(self.pool.map(nfp.nfp_pair, tasks, chunksize=chunk))
        except BrokenProcessPool as e:   # a worker died (killed, out of memory): same NFPs, serially
            self.pool_error = f"parallel NFP stopped ({e}); finished serially"
            self.pool.shutdown(wait=False, cancel_futures=True)
            self.pool = None
            return
        for key, base in zip(keys, results):
            self.cache[key] = base
            self._fresh.add(key)
            self.nfp_computed += 1

    def _ifp(self, bx) -> tuple[int, int, int, int] | None:
        ux0, uy0, ux1, uy1 = self.usable
        x0, x1 = ux0 - bx[0], ux1 - bx[2]
        y0, y1 = uy0 - bx[1], uy1 - bx[3]
        if x1 < x0 - 1e-9 or y1 < y0 - 1e-9:
            return None
        # integer rectangle strictly inside the real-valued one
        ix0, iy0 = math.ceil(x0 * S), math.ceil(y0 * S)
        ix1, iy1 = math.floor(x1 * S), math.floor(y1 * S)
        if ix1 < ix0 or iy1 < iy0:
            return None
        # Clipper drops zero-area regions; a part that fits exactly gets a 1-unit wide strip,
        # i.e. it may stick out by at most 1e-4 mm (verified against BOUNDARY_TOL_MM)
        if ix1 == ix0:
            ix1 = ix0 + 1
        if iy1 == iy0:
            iy1 = iy0 + 1
        return ix0, iy0, ix1, iy1

    def _pockets(self, placed: list[Placed]) -> list[tuple[int, int, int, int]] | None:
        """Boxes of the connected regions where an envelope may lie; None = no pruning.

        An envelope E placed legally satisfies E + R inside its collision shape (R = spacing/2 + EPS), and
        collision shapes do not overlap, so E avoids every placed collision shape grown by R and stays in
        the usable rectangle.  A connected envelope therefore lies in one component of that free set.
        """
        if not placed:
            return None
        grow = math.floor(self.reach * S) - 2
        ux0, uy0, ux1, uy1 = self.usable
        x0, y0, x1, y1 = math.floor(ux0 * S) - 2, math.floor(uy0 * S) - 2, math.ceil(ux1 * S) + 2, math.ceil(uy1 * S) + 2
        pc = pyclipper.Pyclipper()
        pc.AddPath([(x0, y0), (x1, y0), (x1, y1), (x0, y1)], pyclipper.PT_SUBJECT, True)
        pc.AddPaths([path for q in placed for path in q.blocked_paths(grow, self.fine)], pyclipper.PT_CLIP, True)
        boxes = []
        for path in pc.Execute(pyclipper.CT_DIFFERENCE, pyclipper.PFT_NONZERO, pyclipper.PFT_NONZERO):
            if pyclipper.Area(path) > 0:  # outer ring = one component (its holes only make it smaller)
                xs = [x for x, _ in path]
                ys = [y for _, y in path]
                boxes.append((min(xs) - 2, min(ys) - 2, max(xs) + 2, max(ys) + 2))
        return boxes

    def _region(self, part: NestPart, angle: float, pockets):
        """(ifp, region, bx, cb): rectangles where the reference point may lie at this angle, or None."""
        pieces, bx, cb = part.rotated(angle, self.fine)
        ifp = self._ifp(bx)
        if ifp is None:
            return None
        region = [ifp]
        if part.single and pockets is not None:
            # A connected envelope lies inside one free pocket, so the reference point lies in a rectangle
            # where the envelope box fits that pocket's box.  Exact pruning: positions outside these
            # rectangles are infeasible anyway, and NFPs that cannot reach them are skipped.
            region = []
            ex = [math.floor(bx[0] * S), math.floor(bx[1] * S), math.ceil(bx[2] * S), math.ceil(bx[3] * S)]
            for px0, py0, px1, py1 in pockets:
                r = (max(ifp[0], px0 - ex[0]), max(ifp[1], py0 - ex[1]), min(ifp[2], px1 - ex[2]), min(ifp[3], py1 - ex[3]))
                if r[0] <= r[2] and r[1] <= r[3]:
                    # Clipper drops zero-area rectangles: widen an exact fit by 1 unit, inside the IFP
                    r = (r[0] - (r[0] == r[2] == ifp[2]), r[1] - (r[1] == r[3] == ifp[3]),
                         r[2] + (r[0] == r[2] < ifp[2]), r[3] + (r[1] == r[3] < ifp[3]))
                    region.append(r)
            if not region:
                return None
        return ifp, region, bx, cb

    def _near(self, region, cb, placed: list[Placed]) -> list[Placed]:
        near = []
        for q in placed:
            qb = q.collision_box(self.fine)
            # reference positions where the two collision boxes overlap
            nb = (qb[0] - cb[2], qb[1] - cb[3], qb[2] - cb[0], qb[3] - cb[1])
            if any(nb[0] < r[2] and r[0] < nb[2] and nb[1] < r[3] and r[1] < nb[3] for r in region):
                near.append(q)
        return near

    def _best_at_angle(self, part: NestPart, angle: float, placed: list[Placed], pockets=None):
        rg = self._region(part, angle, pockets)
        if rg is None:
            return None
        ifp, region, bx, cb = rg
        near = self._near(region, cb, placed)
        if self.pool is not None:
            self._prefetch([(near, part, angle)])
        obstacles = []
        for q in near:
            obstacles.extend(self._nfp(q, part, angle))
        pts = nfp.feasible_points(region, obstacles)
        best = None
        for (x, y) in pts:
            if not (ifp[0] <= x <= ifp[2] and ifp[1] <= y <= ifp[3]):
                continue
            # bottom-left: lowest top edge, then leftmost; from the top or right the mirrored edges
            v = -(y / S + bx[1]) if self.from_top else y / S + bx[3]
            h = -(x / S + bx[2]) if self.from_right else x / S + bx[0]
            key = (round(v, 4), round(h, 4))
            if best is None or key < best[0]:
                best = (key, x, y)
        if best is None:
            return None
        pref = abs(signed(angle)) if self.prefer_original else 0.0
        return (best[0][0], best[0][1], pref), best[1], best[2], bx

    def _place_part(self, part: NestPart, placed: list[Placed]):
        angles = part.angles
        n = len(angles)
        if n == 0:
            return None
        if n <= self.coarse_n:
            coarse = list(range(n))
        else:
            # angles are sorted by preference (0, small |a| first); spread the coarse set evenly
            by_value = sorted(range(n), key=lambda k: angles[k] % 360.0)
            step = n / self.coarse_n
            coarse = sorted({by_value[int(round(k * step)) % n] for k in range(self.coarse_n)} |
                            {k for k in range(n) if angles[k] % 90.0 == 0})
        tried: dict[int, Any] = {}
        pockets = self._pockets(placed)

        def evaluate(k):
            if k not in tried:
                tried[k] = self._best_at_angle(part, angles[k], placed, pockets)
            return tried[k]

        # past the deadline the first start still places the part, trying only 0 and the multiples of 90
        rush = self.must_finish and time.perf_counter() > self.deadline
        quick = [k for k in range(n) if k == 0 or angles[k] % 90.0 == 0]
        if self.pool is not None:   # the NFPs of every angle about to be tried, in one parallel batch
            steps = []
            for k in (quick if rush else coarse):
                rg = self._region(part, angles[k], pockets)
                if rg is not None:
                    steps.append((self._near(rg[1], rg[3], placed), part, angles[k]))
            self._prefetch(steps)
        for k in (quick if rush else coarse):
            if not rush and time.perf_counter() > self.deadline:
                if not self.must_finish or time.perf_counter() > self.hard_deadline:
                    self.timed_out = True
                    break
                rush = True
                for q in quick:
                    evaluate(q)
                break
            evaluate(k)
        self.rushed = self.rushed or rush
        self.part_rushed = rush and len(quick) < n   # some allowed angles were never tried
        if self.refine and n > len(coarse) and not self.timed_out and not rush:
            by_value = sorted(range(n), key=lambda k: angles[k] % 360.0)
            pos = {k: i for i, k in enumerate(by_value)}
            improved = True
            while improved and time.perf_counter() <= self.deadline:
                improved = False
                cands = [k for k, r in tried.items() if r is not None]
                if not cands:
                    break
                bestk = min(cands, key=lambda k: tried[k][0])
                for d in (-1, 1):
                    nk = by_value[(pos[bestk] + d) % n]
                    if nk not in tried:
                        r = evaluate(nk)
                        if r is not None and r[0] < tried[bestk][0]:
                            improved = True
        cands = [(r[0], k, r) for k, r in tried.items() if r is not None]
        if not cands:
            return None
        _, k, r = min(cands, key=lambda c: c[0])
        _, x, y, bx = r
        return Placed(part, angles[k], x, y, (x / S + bx[0], y / S + bx[1], x / S + bx[2], y / S + bx[3]))

    def run_order(self, order: list[NestPart]):
        placed: list[Placed] = []
        failed: list[tuple[NestPart, str]] = []
        for part in order:
            now = time.perf_counter()
            if now > self.deadline and (not self.must_finish or now > self.hard_deadline):
                self.timed_out = True
                failed.append((part, "TIME_LIMIT"))
                continue
            if not part.angles:
                failed.append((part, "DOES_NOT_FIT"))
                continue
            self.part_rushed = False
            pl = self._place_part(part, placed)
            if pl is None:
                failed.append((part, "TIME_LIMIT" if self.timed_out or self.part_rushed else "NO_SPACE_LEFT"))
            else:
                placed.append(pl)
        return placed, failed

    def score(self, placed: list[Placed]):
        """More parts, then more area, then the least length and width used from the start corner."""
        if not placed:
            return (0, 0.0, 0.0, 0.0)
        v = -min(p.bounds[1] for p in placed) if self.from_top else max(p.bounds[3] for p in placed)
        h = -min(p.bounds[0] for p in placed) if self.from_right else max(p.bounds[2] for p in placed)
        return (len(placed), round(sum(p.part.area_mm2 for p in placed), 3), -round(v, 3), -round(h, 3))

    def solve(self, seed: int):
        rng = random.Random(seed)
        base = sorted(self.parts, key=lambda p: (-p.collision_area_mm2, p.index))
        orders = [("area_desc", base)]
        hdesc = sorted(self.parts, key=lambda p: (-max(p.env_bounds[2] - p.env_bounds[0],
                                                       p.env_bounds[3] - p.env_bounds[1]), p.index))
        orders.append(("longest_side_desc", hdesc))
        if any(p.pieces_fine is not None for p in self.parts):
            # coarse shapes keep up to simplify_mm extra clearance, which can block designed tight fits
            orders.append(("area_desc_fine", base))
        best = None
        starts = 0
        history = []
        k = 0
        while starts < self.max_starts:
            if k < len(orders):
                name, order = orders[k]
            else:
                order = list(best[2]) if best else list(base)
                # perturbation: a few random swaps of nearby parts in the best order
                for _ in range(max(1, len(order) // 8)):
                    i = rng.randrange(len(order))
                    j = min(len(order) - 1, i + rng.randint(1, 3))
                    order[i], order[j] = order[j], order[i]
                name = f"perturb_{k}" + ("_fine" if best_name.endswith("_fine") else "")
            k += 1
            if starts > 0 and time.perf_counter() > self.deadline:
                break
            self.timed_out = False
            self.rushed = False
            self.must_finish = best is None
            self.fine = name.endswith("_fine")
            placed, failed = self.run_order(order)
            self.fine = False
            self.must_finish = False
            sc = self.score(placed)
            history.append({"order": name, "placed": sc[0], "top_mm": -sc[2], "timed_out": self.timed_out,
                            "finished_with_few_angles": self.rushed})
            starts += 1
            if best is None or sc > best[0]:
                best = (sc, placed, order, failed, self.timed_out)
                best_name = name
            if len(self.parts) <= 1:
                break
        return best, history


def _transform_points_mm(points: np.ndarray, angle: float, pivot, target) -> np.ndarray:
    t = math.radians(angle)
    c, s = math.cos(t), math.sin(t)
    d = points - np.asarray(pivot)
    return np.column_stack([target[0] + c * d[:, 0] - s * d[:, 1], target[1] + s * d[:, 0] + c * d[:, 1]])


def _exit_with_parent() -> None:
    """Pool worker start-up: end when the nesting process ends (Cancel kills it) instead of waiting forever."""
    parent = multiprocessing.parent_process()
    if parent is not None:
        threading.Thread(target=lambda: (parent.join(), os._exit(1)), daemon=True).start()


def default_workers() -> int:
    return max(0, min(8, (os.cpu_count() or 1) - 1))


def nest_document(doc: dict, sha256: str | None = None, overrides: dict | None = None,
                  analysis: dict | None = None, verify: bool = True, workers: int | None = None) -> dict[str, Any]:
    """Nest the groups of a geometry document; returns an autonest.placement/1 document.

    workers: processes for NFP computation (None = default_workers(), 0/1 = serial). Same result either way."""
    t0 = time.perf_counter()
    if analysis is None:
        analysis = analyze_document(doc, sha256, overrides)
    settings = analysis["settings"]
    corner = settings["optimization"].get("start_corner") or "bottom_left"
    if corner not in ("bottom_left", "bottom_right", "top_left", "top_right"):
        raise ValueError(f"Unknown start_corner {corner!r}.")
    if settings["rotation"].get("allow_mirror"):
        raise ValueError("Mirroring is not supported by the Phase 3A solver (rotation.allow_mirror must be false).")
    opt = settings["optimization"]
    seed = int(opt.get("seed", 1) or 1)
    time_limit = float(opt.get("time_limit_s") or 60.0)
    quality = opt.get("quality", "balanced")
    frame = SheetFrame.from_artboard_rect(doc["artboard"]["rect_pt"], doc["coordinate_system"]["y_axis"])
    usable = tuple(analysis["frame"]["usable_mm"])
    global_errors = [i for i in analysis["issues"] if i["severity"] == "error"]

    parts, unplaced = build_parts(analysis, settings)
    workers = default_workers() if workers is None else workers
    pool = ProcessPoolExecutor(workers, initializer=_exit_with_parent) if workers > 1 and len(parts) >= PARALLEL_MIN_PARTS and not global_errors else None
    solver = Solver(parts, usable, quality, t0 + time_limit, bool(settings["rotation"].get("prefer_original", True)),
                    reach=float(settings["spacing_mm"]) / 2.0 + EPS_MM, pool=pool,
                    overrun_s=max(2.0 * time_limit, 30.0), start_corner=corner)
    placed: list[Placed] = []
    history: list = []
    if parts and not global_errors:
        try:
            best, history = solver.solve(seed)
        finally:
            if solver.pool is not None:
                solver.pool.shutdown()
        _, placed, _, failed, _ = best
        for part, reason in failed:
            unplaced.append({"id": part.id, "reason": reason,
                             "detail": {"NO_SPACE_LEFT": "no collision-free position on the fabric",
                                        "DOES_NOT_FIT": "larger than the usable area at every allowed rotation",
                                        }.get(reason, f"time limit {time_limit:g} s reached before every angle was tried")})
    elif global_errors:
        for part in parts:
            unplaced.append({"id": part.id, "reason": "INVALID_GEOMETRY",
                             "detail": ",".join(i["code"] for i in global_errors)})

    entries = [(p.part, p.angle, (p.x / S, p.y / S)) for p in placed]
    engine = {"name": "autonest", "version": ENGINE_VERSION, "solver": "nfp-bottom-left", "quality": quality,
              "collision_shape": f"envelope (+) disk(spacing/2 + {EPS_MM} mm), outer-simplified {simplify_mm(float(settings['spacing_mm']))} mm"}
    extra = {"seed": seed, "nfp_computed": solver.nfp_computed, "nfp_cache_hits": solver.nfp_hits,
             "restarts": history}
    if solver.pool_error:
        extra["parallel_error"] = solver.pool_error
    return assemble(doc, sha256, analysis, entries, unplaced, engine, extra, verify, t0)


def assemble(doc: dict, sha256: str | None, analysis: dict, entries, unplaced: list[dict], engine: dict,
             extra_metrics: dict, verify: bool, t0: float) -> dict[str, Any]:
    """Build the autonest.placement/1 document from (part, angle, target_mm) entries and verify it."""
    from .verify import verify_placement

    settings = analysis["settings"]
    frame = SheetFrame.from_artboard_rect(doc["artboard"]["rect_pt"], doc["coordinate_system"]["y_axis"])
    usable = tuple(analysis["frame"]["usable_mm"])
    analysis_parts = analysis["parts"]
    groups = {g["id"]: g for g in doc["groups"]}
    placements = []
    placed_area = 0.0
    top = bottom = None
    for part, angle, target_mm in sorted(entries, key=lambda e: e[0].index):
        angle = round(angle % 360.0, 9)
        pivot_pt = [round(v, 6) for v in frame.to_pt(*part.pivot_mm)]
        target_pt = [round(v, 6) for v in frame.to_pt(*target_mm)]
        sil = regions.geometry_from_json(analysis_parts[part.index]["silhouette"])
        coords = np.vstack([np.asarray(q.exterior.coords) for q in regions.polygons_of(sil)])
        moved = _transform_points_mm(coords, angle, part.pivot_mm, target_mm)
        eb = [round(float(v), 4) for v in (moved[:, 0].min(), moved[:, 1].min(), moved[:, 0].max(), moved[:, 1].max())]
        placed_area += part.area_mm2
        top = eb[3] if top is None else max(top, eb[3])
        bottom = eb[1] if bottom is None else min(bottom, eb[1])
        matrix = [round(v, 12) for v in to_illustrator_matrix(pivot_pt, target_pt, angle, False)]
        placements.append({
            "id": part.id,
            "uuid": part.uuid,
            "name": part.name,
            "rotation_deg": angle,
            "mirror": False,
            "pivot_pt": pivot_pt,
            "target_pt": target_pt,
            "matrix": matrix,
            # where the group's tracker anchors (geometry.json "trackers") must land after Apply
            "expected_trackers_pt": [[round(v, 6) for v in apply_matrix(matrix, t["anchor_pt"])]
                                     for t in groups[part.id].get("trackers", [])],
            "pivot_mm": [round(v, 6) for v in part.pivot_mm],
            "target_mm": [round(v, 6) for v in target_mm],
            "expected_bounds_mm": eb,
        })
    order = {g["id"]: i for i, g in enumerate(doc["groups"])}
    unplaced = sorted(unplaced, key=lambda u: order.get(u["id"], 1 << 30))
    usable_w, usable_h = usable[2] - usable[0], usable[3] - usable[1]
    if top is None:
        used_h = 0.0
    elif (settings["optimization"].get("start_corner") or "").startswith("top"):
        used_h = usable[3] - bottom   # filled downward from the top
    else:
        used_h = top - usable[1]
    if analysis["settings"]["material"]["mode"] == "roll":
        usable_h = used_h   # a roll is only used up to the nested length
    total = len(doc["groups"])
    status = "complete" if placements and not unplaced else ("partial" if placements else "failed")
    metrics = {
        "total_groups": total,
        "placed": len(placements),
        "unplaced": len(unplaced),
        "used_length_mm": round(used_h, 3),
        "utilization": round(placed_area / (usable_w * usable_h), 5) if usable_w > 0 and usable_h > 0 else None,
        "utilization_used_height": round(placed_area / (usable_w * used_h), 5) if used_h > 0 else None,
        "placed_area_mm2": round(placed_area, 3),
        "min_gap_mm": None,
        "collisions": 0,
        "boundary_violations": 0,
        "elapsed_s": 0.0,
    }
    metrics.update(extra_metrics)
    result = {
        "schema": PLACEMENT_SCHEMA,
        "engine": engine,
        "source": {"geometry_sha256": sha256, "document": doc.get("document", {}), "artboard": doc["artboard"]},
        "transform_convention": {
            "space": "illustrator_document", "units": "pt", "y_axis": "up",
            "rotation": "counter_clockwise_degrees", "formula": "p' = target + R(theta) * F * (p - pivot)",
        },
        "status": status,
        "settings": settings,
        "placements": placements,
        "unplaced": unplaced,
        "metrics": metrics,
    }
    if verify:
        ver = verify_placement(doc, result)
        result["verification"] = ver
        metrics["min_gap_mm"] = ver["min_gap_mm"]
        metrics["collisions"] = ver["collisions"]
        metrics["boundary_violations"] = ver["boundary_violations"]
        if not ver["ok"]:
            # Never hand a wrong layout to Illustrator.
            ids = [p["id"] for p in placements]
            result["status"] = "failed"
            result["placements"] = []
            result["unplaced"] = sorted(
                [{"id": i, "reason": "VERIFICATION_FAILED", "detail": "; ".join(ver["problems"][:5])} for i in ids]
                + unplaced, key=lambda u: order.get(u["id"], 1 << 30))
            metrics["placed"] = 0
            metrics["unplaced"] = total
    metrics["elapsed_s"] = round(time.perf_counter() - t0, 3)
    return result

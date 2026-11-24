"""Robust polygon region construction and offsetting.

* Fill regions are built with Clipper (integer arithmetic, exact fill rules
  nonzero / even-odd), which is what Illustrator uses to decide which areas of
  a self-intersecting or compound path are painted.
* Strokes and safety offsets use GEOS (Shapely) buffers.  Round joins are
  approximated by chords *inscribed* in the arc, so the radius is enlarged by
  1/cos(pi / (4*quad_segs)) to make the polygon *circumscribe* the true arc:
  the offset region then always contains the exact Minkowski sum with a disk,
  which is what guarantees a real minimum gap.
"""
from __future__ import annotations

import math
from typing import Iterable, Sequence

import pyclipper
import shapely
from shapely.geometry import GeometryCollection, LinearRing, LineString, MultiPolygon, Polygon
from shapely.geometry.base import BaseGeometry

CLIPPER_SCALE = 10_000.0  # 1 unit = 0.1 micrometre when coordinates are mm
QUAD_SEGS = 8

Point = tuple[float, float]


def empty() -> MultiPolygon:
    return MultiPolygon()


def polygons_of(geom: BaseGeometry | None) -> list[Polygon]:
    """Flatten any geometry to its list of non-empty Polygons."""
    if geom is None or geom.is_empty:
        return []
    if isinstance(geom, Polygon):
        return [geom]
    if isinstance(geom, (MultiPolygon, GeometryCollection)):
        out: list[Polygon] = []
        for g in geom.geoms:
            out.extend(polygons_of(g))
        return out
    return []


def as_multipolygon(geom: BaseGeometry | None) -> MultiPolygon:
    return MultiPolygon(polygons_of(geom))


def union(geoms) -> MultiPolygon:
    """Union of areal geometries (skips the GEOS call for 0/1 inputs)."""
    gs = [g for g in geoms if g is not None and not g.is_empty]
    if not gs:
        return empty()
    if len(gs) == 1:
        return clean(gs[0])
    return clean(shapely.union_all(gs))


def clean(geom: BaseGeometry | None) -> MultiPolygon:
    """Make valid and keep only areal parts."""
    if geom is None or geom.is_empty:
        return empty()
    if not geom.is_valid:
        geom = shapely.make_valid(geom)
    return as_multipolygon(geom)


def _polytree_to_polygons(node, out: list[Polygon]) -> None:
    for child in node.Childs:
        # child is an outer contour; its children are holes
        shell = [(x / CLIPPER_SCALE, y / CLIPPER_SCALE) for x, y in child.Contour]
        holes = []
        for hole in child.Childs:
            holes.append([(x / CLIPPER_SCALE, y / CLIPPER_SCALE) for x, y in hole.Contour])
            _polytree_to_polygons(hole, out)  # islands inside holes
        if len(shell) >= 3:
            out.append(Polygon(shell, [h for h in holes if len(h) >= 3]))


def region_from_rings(rings: Iterable[Sequence[Point]], fill_rule: str = "nonzero") -> MultiPolygon:
    """Painted region of a set of closed rings under Illustrator's fill rule."""
    ft = pyclipper.PFT_EVENODD if fill_rule == "evenodd" else pyclipper.PFT_NONZERO
    pc = pyclipper.Pyclipper()
    # Strictly simple output: no self-touching rings, which GEOS would reject
    # as invalid (and repairing with make_valid is slow on large inputs).
    pc.StrictlySimple = True
    added = 0
    for ring in rings:
        scaled = [(round(x * CLIPPER_SCALE), round(y * CLIPPER_SCALE)) for x, y in ring]
        # drop consecutive duplicates after quantisation
        dedup = [scaled[0]] if scaled else []
        for p in scaled[1:]:
            if p != dedup[-1]:
                dedup.append(p)
        if len(dedup) > 1 and dedup[0] == dedup[-1]:
            dedup.pop()
        if len(dedup) < 3:
            continue
        try:
            pc.AddPath(dedup, pyclipper.PT_SUBJECT, True)
            added += 1
        except pyclipper.ClipperException:
            continue  # collinear / zero-area ring
    if not added:
        return empty()
    tree = pc.Execute2(pyclipper.CT_UNION, ft, ft)
    polys: list[Polygon] = []
    _polytree_to_polygons(tree, polys)
    if not polys:
        return empty()
    mp = MultiPolygon(polys)
    if mp.is_valid:
        return mp
    return clean(shapely.union_all([p if p.is_valid else shapely.make_valid(p) for p in polys]))


def _circumscribe(r: float, join: str) -> float:
    if join == "round":
        return r / math.cos(math.pi / (4 * QUAD_SEGS))
    return r


def _cap_radius(r: float, cap: str) -> float:
    return r / math.cos(math.pi / (4 * QUAD_SEGS)) if cap == "round" else r


def stroke_region(
    vertices: Sequence[Point],
    closed: bool,
    width: float,
    join: str = "miter",
    cap: str = "butt",
    miter_limit: float = 10.0,
) -> MultiPolygon:
    """Area painted by a centred stroke of ``width`` along a polyline."""
    if width <= 0 or len(vertices) < 2:
        return empty()
    r = width / 2.0
    join_style = {"round": "round", "bevel": "bevel"}.get(join, "mitre")
    cap_style = {"round": "round", "projecting": "square"}.get(cap, "flat")
    radius = max(_circumscribe(r, join), _cap_radius(r, cap) if not closed else 0.0)
    if closed and len(vertices) >= 3:
        line: BaseGeometry = LinearRing(vertices)
    else:
        line = LineString(vertices)
    geom = line.buffer(
        radius,
        quad_segs=QUAD_SEGS,
        cap_style=cap_style,
        join_style=join_style,
        mitre_limit=max(1.0, float(miter_limit)),
    )
    return clean(geom)


def safe_offset(geom: BaseGeometry, distance: float, join: str = "round") -> MultiPolygon:
    """Outward offset that contains the exact Minkowski sum with a disk.

    Used for spacing (distance = spacing/2 per part) and for the curve
    flattening envelope.  ``distance <= 0`` returns the geometry unchanged
    (inward offsets are not needed by the engine).
    """
    geom = clean(geom)
    if distance <= 0 or geom.is_empty:
        return geom
    join_style = {"round": "round", "bevel": "bevel"}.get(join, "mitre")
    return clean(
        geom.buffer(
            _circumscribe(distance, join) if join == "round" else distance,
            quad_segs=QUAD_SEGS,
            join_style=join_style,
            mitre_limit=10.0,
        )
    )


def rect_polygon(minx: float, miny: float, maxx: float, maxy: float) -> Polygon:
    return Polygon([(minx, miny), (maxx, miny), (maxx, maxy), (minx, maxy)])


def ring_is_simple(vertices: Sequence[Point]) -> bool:
    if len(vertices) < 3:
        return False
    return LinearRing(vertices).is_simple


def signed_area(vertices: Sequence[Point]) -> float:
    a = 0.0
    n = len(vertices)
    for i in range(n):
        x0, y0 = vertices[i]
        x1, y1 = vertices[(i + 1) % n]
        a += x0 * y1 - x1 * y0
    return a / 2.0


def geometry_to_json(geom: BaseGeometry, ndigits: int = 4) -> list[dict]:
    """MultiPolygon -> [{"exterior": [[x,y],...], "holes": [[[x,y],...], ...]}]."""
    out = []
    for p in polygons_of(geom):
        ext = shapely.geometry.polygon.orient(p, 1.0)  # CCW exterior, CW holes
        out.append(
            {
                "exterior": [[round(x, ndigits), round(y, ndigits)] for x, y in list(ext.exterior.coords)[:-1]],
                "holes": [
                    [[round(x, ndigits), round(y, ndigits)] for x, y in list(h.coords)[:-1]]
                    for h in ext.interiors
                ],
            }
        )
    return out


def geometry_from_json(polys: list[dict]) -> MultiPolygon:
    return clean(MultiPolygon([Polygon(p["exterior"], p.get("holes") or []) for p in polys]))

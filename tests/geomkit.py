"""Build autonest.geometry/1 documents directly from millimetre polygons (for engine tests).

Shapes are given in the sheet frame (mm from the artboard bottom-left, y up) and
written as Illustrator document points exactly like the JSX exporter does.
"""
from __future__ import annotations

import math

from autonest.contract import validate_geometry_doc
from autonest.units import PT_PER_MM


def _pt(x, y):
    return [round(x * PT_PER_MM, 6), round(y * PT_PER_MM, 6)]


def _path(ring, name=""):
    pts = []
    for x, y in ring:
        p = _pt(x, y)
        pts.append(p + p + p)
    return {"kind": "path", "typename": "PathItem", "name": name, "hidden": False, "locked": False,
            "opacity": 100, "closed": True, "filled": True, "stroked": False, "clipping": False,
            "guides": False, "fill_rule": "nonzero", "points": pts}


def _bounds(rings):
    xs = [x for r in rings for x, _ in r]
    ys = [y for r in rings for _, y in r]
    l, b = _pt(min(xs), min(ys))
    r, t = _pt(max(xs), max(ys))
    return [l, t, r, b]


def group(gid, rings, name=None):
    """rings[0] = outer ring, rings[1:] = holes (written as an even-odd compound path)."""
    name = name or gid
    if len(rings) == 1:
        child = _path(rings[0], name)
    else:
        child = {"kind": "compound", "typename": "CompoundPathItem", "name": name, "hidden": False,
                 "locked": False, "opacity": 100, "filled": True, "stroked": False, "clipping": False,
                 "guides": False, "fill_rule": "evenodd", "geometric_bounds_pt": _bounds(rings),
                 "paths": [_path(r) for r in rings]}
    gb = _bounds(rings)
    return {"id": gid, "uuid": None, "name": name, "layer": "Layer 1", "geometric_bounds_pt": gb,
            "visible_bounds_pt": gb,
            "root": {"kind": "group", "typename": "GroupItem", "name": name, "hidden": False, "locked": False,
                     "opacity": 100, "clipped": False, "children": [child]},
            "trackers": [{"node_path": [0], "point_index": 0, "anchor_pt": _pt(*rings[0][0])}],
            "export_issues": []}


def document(width_mm, height_mm, groups, **settings):
    doc = {
        "schema": "autonest.geometry/1",
        "generator": {"name": "tests/geomkit.py", "version": "test"},
        "document": {"name": "test.ai"},
        "coordinate_system": {"space": "illustrator_document", "units": "pt", "y_axis": "up"},
        "artboard": {"index": 0, "name": "A", "rect_pt": [0.0, height_mm * PT_PER_MM, width_mm * PT_PER_MM, 0.0]},
        "settings": settings,
        "skipped_selection": [],
        "groups": groups,
    }
    return validate_geometry_doc(doc)


# ------------------------------------------------------------------ shapes (mm)
def translate(ring, dx, dy):
    return [(x + dx, y + dy) for x, y in ring]


def L_shape(w=100.0, h=100.0, t=30.0):
    return [(0, 0), (w, 0), (w, t), (t, t), (t, h), (0, h)]


def U_shape(w=100.0, h=120.0, t=30.0):
    return [(0, 0), (w, 0), (w, h), (w - t, h), (w - t, t), (t, t), (t, h), (0, h)]


def rect(w, h):
    return [(0, 0), (w, 0), (w, h), (0, h)]


def regular(n, r, cx=0.0, cy=0.0, phase=0.0):
    return [(cx + r * math.cos(phase + 2 * math.pi * k / n), cy + r * math.sin(phase + 2 * math.pi * k / n))
            for k in range(n)]


def star(n, r_out, r_in, cx=0.0, cy=0.0):
    pts = []
    for k in range(2 * n):
        r = r_out if k % 2 == 0 else r_in
        a = math.pi * k / n
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts

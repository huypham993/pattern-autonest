"""Builders for autonest.geometry/1 documents used by unit tests (mm input)."""
from __future__ import annotations

import math

K = 72.0 / 25.4
ARTBOARD_W, ARTBOARD_H = 600.0, 400.0


def P(x, y, L=0.0, B=-ARTBOARD_H * K):
    return (L + x * K, B + y * K)


def pts(points_mm, **frame):
    out = []
    for x, y in points_mm:
        X, Y = P(x, y, **frame)
        out.append([X, Y, X, Y, X, Y])
    return out


def circle_points(cx, cy, r, **frame):
    k = 0.5522847498 * r
    rows = [((cx + r, cy), (cx + r, cy - k), (cx + r, cy + k)),
            ((cx, cy + r), (cx + k, cy + r), (cx - k, cy + r)),
            ((cx - r, cy), (cx - r, cy + k), (cx - r, cy - k)),
            ((cx, cy - r), (cx - k, cy - r), (cx + k, cy - r))]
    out = []
    for a, l, rr in rows:
        out.append([*P(*a, **frame), *P(*l, **frame), *P(*rr, **frame)])
    return out


def path(points, closed=True, filled=True, stroked=False, **kw):
    n = {"kind": "path", "closed": closed, "filled": filled, "stroked": stroked, "points": points}
    n.update(kw)
    return n


def rect(x, y, w, h, **kw):
    return path(pts([(x, y), (x + w, y), (x + w, y + h), (x, y + h)]), **kw)


def compound(paths, **kw):
    n = {"kind": "compound", "paths": [{"kind": "path", "closed": p.get("closed", True), "points": p["points"]}
                                       for p in paths], "filled": True, "stroked": False}
    n.update(kw)
    return n


def group(children, clipped=False, **kw):
    n = {"kind": "group", "clipped": clipped, "children": children}
    n.update(kw)
    return n


def opaque(typename, x0, y0, x1, y1):
    (l, b), (r, t) = P(x0, y0), P(x1, y1)
    return {"kind": "opaque", "typename": typename, "geometric_bounds_pt": [l, t, r, b],
            "visible_bounds_pt": [l, t, r, b]}


def doc(*roots, settings=None, rect_pt=None):
    return {
        "schema": "autonest.geometry/1",
        "coordinate_system": {"space": "illustrator_document", "units": "pt", "y_axis": "up"},
        "artboard": {"index": 0, "name": "A", "rect_pt": rect_pt or [0, 0, ARTBOARD_W * K, -ARTBOARD_H * K]},
        "settings": settings or {},
        "groups": [{"id": f"g{i+1:03d}", "root": r} for i, r in enumerate(roots)],
    }


def codes(part):
    return {i["code"] for i in part["issues"]}


def star(cx, cy, R, r, n=5):
    out = []
    for i in range(2 * n):
        rad = R if i % 2 == 0 else r
        a = math.pi / 2 + i * math.pi / n
        out.append((cx + rad * math.cos(a), cy + rad * math.sin(a)))
    return out

"""Adaptive flattening of Illustrator cubic Bézier paths.

Illustrator stores a path as a list of PathPoints, each with an ``anchor`` and
two direction handles (``leftDirection`` = incoming, ``rightDirection`` =
outgoing).  Segment i -> i+1 is the cubic

    P0 = anchor[i], P1 = right[i], P2 = left[i+1], P3 = anchor[i+1]

Flattening criterion: a cubic lies inside the convex hull of its control
points, so if both inner control points are within ``tol`` of the chord
P0-P3, every point of the curve is within ``tol`` of that chord.  We subdivide
(de Casteljau at t=0.5) until this holds.  The resulting polyline therefore
has a *guaranteed* Hausdorff distance <= tol from the true curve, which lets the
engine add ``tol`` to the safety envelope and still guarantee clearance against
the real Bézier geometry.
"""
from __future__ import annotations

import math
from typing import Sequence

Point = tuple[float, float]

MAX_DEPTH = 24  # 2^24 sub-segments: unreachable for sane tolerances


def _dist_to_chord(px: float, py: float, ax: float, ay: float, bx: float, by: float) -> float:
    dx, dy = bx - ax, by - ay
    L2 = dx * dx + dy * dy
    if L2 <= 1e-24:
        return math.hypot(px - ax, py - ay)
    # distance to the *segment* (not the infinite line): handles loops/cusps
    t = ((px - ax) * dx + (py - ay) * dy) / L2
    if t < 0.0:
        return math.hypot(px - ax, py - ay)
    if t > 1.0:
        return math.hypot(px - bx, py - by)
    return abs((px - ax) * dy - (py - ay) * dx) / math.sqrt(L2)


def flatten_cubic(p0: Point, p1: Point, p2: Point, p3: Point, tol: float, out: list[Point]) -> None:
    """Append flattened points of one cubic to ``out`` (P0 excluded, P3 included)."""
    if tol <= 0:
        raise ValueError("tolerance must be > 0")
    stack = [(p0, p1, p2, p3, 0)]
    while stack:
        a, b, c, d, depth = stack.pop()
        flat = max(
            _dist_to_chord(b[0], b[1], a[0], a[1], d[0], d[1]),
            _dist_to_chord(c[0], c[1], a[0], a[1], d[0], d[1]),
        )
        if flat <= tol or depth >= MAX_DEPTH:
            out.append(d)
            continue
        # de Casteljau split at t = 0.5
        ab = ((a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5)
        bc = ((b[0] + c[0]) * 0.5, (b[1] + c[1]) * 0.5)
        cd = ((c[0] + d[0]) * 0.5, (c[1] + d[1]) * 0.5)
        abc = ((ab[0] + bc[0]) * 0.5, (ab[1] + bc[1]) * 0.5)
        bcd = ((bc[0] + cd[0]) * 0.5, (bc[1] + cd[1]) * 0.5)
        m = ((abc[0] + bcd[0]) * 0.5, (abc[1] + bcd[1]) * 0.5)
        # push second half first so the first half is processed first (LIFO)
        stack.append((m, bcd, cd, d, depth + 1))
        stack.append((a, ab, abc, m, depth + 1))


def flatten_path(points: Sequence[Sequence[float]], closed: bool, tol: float) -> list[Point]:
    """Flatten an exported Illustrator path.

    ``points`` rows are ``[ax, ay, lx, ly, rx, ry]`` (anchor, left/in handle,
    right/out handle).  Returns the polyline vertices; for closed paths the
    closing vertex is *not* repeated.
    """
    n = len(points)
    if n == 0:
        return []
    out: list[Point] = [(float(points[0][0]), float(points[0][1]))]
    seg_count = n if closed else n - 1
    for i in range(seg_count):
        a = points[i]
        b = points[(i + 1) % n]
        p0 = (float(a[0]), float(a[1]))
        p1 = (float(a[4]), float(a[5]))
        p2 = (float(b[2]), float(b[3]))
        p3 = (float(b[0]), float(b[1]))
        if p1 == p0 and p2 == p3:
            out.append(p3)  # straight segment, no handles
        else:
            flatten_cubic(p0, p1, p2, p3, tol, out)
    if closed and len(out) > 1 and out[-1] == out[0]:
        out.pop()
    return out


def raw_control_bounds(points: Sequence[Sequence[float]]) -> tuple[float, float, float, float] | None:
    """Bounds of anchors *and* handles (a superset of the curve bounds)."""
    if not points:
        return None
    xs = [p[0] for p in points] + [p[2] for p in points] + [p[4] for p in points]
    ys = [p[1] for p in points] + [p[3] for p in points] + [p[5] for p in points]
    return (min(xs), min(ys), max(xs), max(ys))

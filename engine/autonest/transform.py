"""Rigid transform convention shared by the engine and the JSX Apply step.

    p' = target + R(theta) · F · (p - pivot)

* all coordinates are Illustrator document points, y axis up;
* theta is counter-clockwise, degrees;
* F = diag(-1, 1) (horizontal reflection about the pivot) when mirror=True.

``to_illustrator_matrix`` returns ``[a, b, c, d, tx, ty]`` with Illustrator's
Matrix semantics ``x' = a·x + c·y + tx``, ``y' = b·x + d·y + ty``.  The JSX
side applies the rotation, then measures tracker anchors and corrects the
translation, so it does not depend on which pivot Illustrator uses internally.
"""
from __future__ import annotations

import math
from typing import Sequence


def to_illustrator_matrix(pivot: Sequence[float], target: Sequence[float], angle_deg: float,
                          mirror: bool = False) -> list[float]:
    t = math.radians(angle_deg)
    c, s = math.cos(t), math.sin(t)
    fx = -1.0 if mirror else 1.0
    m00, m01 = c * fx, -s
    m10, m11 = s * fx, c
    tx = target[0] - (m00 * pivot[0] + m01 * pivot[1])
    ty = target[1] - (m10 * pivot[0] + m11 * pivot[1])
    return [m00, m10, m01, m11, tx, ty]


def apply_matrix(m: Sequence[float], p: Sequence[float]) -> tuple[float, float]:
    a, b, c, d, tx, ty = m
    return (a * p[0] + c * p[1] + tx, b * p[0] + d * p[1] + ty)


def invert_matrix(m: Sequence[float]) -> list[float]:
    a, b, c, d, tx, ty = m
    det = a * d - b * c
    if abs(det) < 1e-12:
        raise ValueError("singular matrix")
    ia, ib, ic, id_ = d / det, -b / det, -c / det, a / det
    return [ia, ib, ic, id_, -(ia * tx + ic * ty), -(ib * tx + id_ * ty)]

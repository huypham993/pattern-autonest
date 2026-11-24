"""Rotation candidate sets.

Angles are degrees, counter-clockwise in the y-up sheet/document frame,
normalised to [0, 360).  Lists are ordered by preference: 0 first, then by
increasing absolute rotation (|a| with a in (-180, 180]), so that "prefer the
original orientation" is a stable tie-breaker for the optimiser.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

PRESETS = ("fixed", "0_180", "0_90_180_270", "step", "custom")


@dataclass(frozen=True)
class Orientation:
    angle_deg: float
    mirror: bool = False


def signed(a: float) -> float:
    a = math.fmod(a, 360.0)
    if a > 180.0:
        a -= 360.0
    elif a <= -180.0:
        a += 360.0
    return a


def norm(a: float) -> float:
    a = math.fmod(a, 360.0)
    if a < 0:
        a += 360.0
    if abs(a - 360.0) < 1e-9:
        a = 0.0
    return round(a, 9)


def candidate_angles(cfg: dict) -> list[float]:
    preset = cfg.get("preset", "step")
    if preset not in PRESETS:
        raise ValueError(f"unknown rotation preset '{preset}'")
    if preset == "fixed":
        angles = [0.0]
    elif preset == "0_180":
        angles = [0.0, 180.0]
    elif preset == "0_90_180_270":
        angles = [0.0, 90.0, 180.0, 270.0]
    elif preset == "custom":
        angles = [float(a) for a in cfg.get("custom_angles_deg") or [0.0]]
    else:
        step = float(cfg.get("step_deg", 5.0))
        if not (0 < step <= 360):
            raise ValueError("step_deg must be in (0, 360]")
        n = max(1, int(math.floor(360.0 / step + 1e-9)))
        angles = [i * step for i in range(n)]

    if not cfg.get("allow_full_360", True):
        lim = abs(float(cfg.get("max_abs_deg", 180.0)))
        angles = [a for a in angles if abs(signed(a)) <= lim + 1e-9]
    if cfg.get("grain_lock"):
        angles = [a for a in angles if abs(signed(a)) < 1e-9 or abs(abs(signed(a)) - 180.0) < 1e-9]

    uniq = sorted({norm(a) for a in angles}, key=lambda a: (abs(signed(a)), signed(a) < 0, a))
    return uniq or [0.0]


def grain_angles(tolerance_deg: float, step_deg: float) -> list[float]:
    """0 and 180 degrees (fabric grain kept parallel) plus every multiple of step within +-tolerance of them."""
    if tolerance_deg < 0 or tolerance_deg >= 90:
        raise ValueError("grain tolerance must be in [0, 90) degrees")
    if step_deg <= 0:
        raise ValueError("step_deg must be > 0")
    k = int(math.floor(tolerance_deg / step_deg + 1e-9))
    offsets = [i * step_deg for i in range(-k, k + 1)]
    return [base + o for base in (0.0, 180.0) for o in offsets]


def candidate_orientations(cfg: dict) -> list[Orientation]:
    out = [Orientation(a, False) for a in candidate_angles(cfg)]
    if cfg.get("allow_mirror"):
        out += [Orientation(o.angle_deg, True) for o in out]
    return out

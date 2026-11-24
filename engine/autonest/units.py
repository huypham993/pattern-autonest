"""Units and the sheet coordinate frame.

Illustrator scripting reports geometry in *points* (1 pt = 1/72 inch) in the
document coordinate system (y axis pointing up, origin at the document ruler
origin).  The engine works in millimetres in a *sheet frame*:

    origin  = bottom-left corner of the target artboard
    x axis  = to the right
    y axis  = up            (same handedness as Illustrator scripting, so a
                             counter-clockwise rotation means the same thing
                             in both frames and no reflection is involved)

Because the frame is anchored on the artboard rectangle, artboards that are
not at the document origin (negative or large offsets) are handled exactly.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Sequence

PT_PER_INCH = 72.0
MM_PER_INCH = 25.4
MM_PER_PT = MM_PER_INCH / PT_PER_INCH  # 0.352777... exact rational 127/360
PT_PER_MM = PT_PER_INCH / MM_PER_INCH


def pt_to_mm(v: float) -> float:
    return v * MM_PER_PT


def mm_to_pt(v: float) -> float:
    return v * PT_PER_MM


@dataclass(frozen=True)
class SheetFrame:
    """Maps Illustrator document points <-> sheet millimetres."""

    left_pt: float
    top_pt: float
    right_pt: float
    bottom_pt: float

    @classmethod
    def from_artboard_rect(cls, rect_pt: Sequence[float], y_axis: str = "up") -> "SheetFrame":
        if y_axis != "up":
            raise ValueError(
                "Only y_axis='up' document coordinates are supported "
                "(Illustrator scripting DOCUMENTCOORDINATESYSTEM)."
            )
        left, top, right, bottom = (float(v) for v in rect_pt)
        if not (right > left and top > bottom):
            raise ValueError(f"Degenerate or inverted artboard rect {list(rect_pt)}")
        return cls(left, top, right, bottom)

    @property
    def width_mm(self) -> float:
        return (self.right_pt - self.left_pt) * MM_PER_PT

    @property
    def height_mm(self) -> float:
        return (self.top_pt - self.bottom_pt) * MM_PER_PT

    def to_mm(self, x_pt: float, y_pt: float) -> tuple[float, float]:
        return ((x_pt - self.left_pt) * MM_PER_PT, (y_pt - self.bottom_pt) * MM_PER_PT)

    def to_pt(self, x_mm: float, y_mm: float) -> tuple[float, float]:
        return (x_mm * PT_PER_MM + self.left_pt, y_mm * PT_PER_MM + self.bottom_pt)

    def points_to_mm(self, pts: Iterable[Sequence[float]]) -> list[tuple[float, float]]:
        l, b = self.left_pt, self.bottom_pt
        return [((x - l) * MM_PER_PT, (y - b) * MM_PER_PT) for x, y in pts]

    def bounds_to_mm(self, rect_pt: Sequence[float]) -> tuple[float, float, float, float]:
        """Illustrator [left, top, right, bottom] -> (minx, miny, maxx, maxy) in mm."""
        l, t, r, b = rect_pt
        x0, y0 = self.to_mm(l, b)
        x1, y1 = self.to_mm(r, t)
        return (min(x0, x1), min(y0, y1), max(x0, x1), max(y0, y1))

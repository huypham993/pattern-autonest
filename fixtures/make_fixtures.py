#!/usr/bin/env python3
"""Generate test scenes (mock Illustrator documents) + expected diagnostics.

    python fixtures/make_fixtures.py            # writes fixtures/scenes/*.scene.json
                                                #        fixtures/geometry/*.expect.json
    node tests/jsx_harness/run_extract.js fixtures/scenes/X.scene.json fixtures/geometry/X.geometry.json

``tests/test_fixtures.py`` regenerates geometry through the real JSX
extraction code (via Node) when Node is available and checks it against the
committed geometry files.

Scenes are authored in millimetres in the *sheet frame* (origin = artboard
bottom-left, y up) and converted to Illustrator document points, so that
offset artboards are exercised exactly as Illustrator would report them.
All randomness is seeded: output is deterministic.
"""
from __future__ import annotations

import json
import math
import random
from pathlib import Path

K = 72.0 / 25.4  # pt per mm
HERE = Path(__file__).resolve().parent
SCENES = HERE / "scenes"
GEOM = HERE / "geometry"

_uuid = [1000]


def next_uuid() -> str:
    _uuid[0] += 1
    return str(_uuid[0])


class Sheet:
    def __init__(self, w_mm, h_mm, left_pt=0.0, top_pt=0.0):
        self.w, self.h = w_mm, h_mm
        self.L = left_pt
        self.T = top_pt
        self.B = top_pt - h_mm * K

    @property
    def rect(self):
        return [round(self.L, 4), round(self.T, 4), round(self.L + self.w * K, 4), round(self.B, 4)]

    def pt(self, x, y):
        return (self.L + x * K, self.B + y * K)


# ----------------------------------------------------------------- primitives
def _pp(sheet, a, l=None, r=None):
    ax, ay = sheet.pt(*a)
    lx, ly = sheet.pt(*l) if l else (ax, ay)
    rx, ry = sheet.pt(*r) if r else (ax, ay)
    return [round(v, 4) for v in (ax, ay, lx, ly, rx, ry)]


def path(sheet, pts, closed=True, filled=True, stroked=False, **kw):
    spec = {"typename": "PathItem", "closed": closed, "filled": filled, "stroked": stroked,
            "pathPoints": [_pp(sheet, p) for p in pts]}
    spec.update(kw)
    return spec


def bezier_path(sheet, anchors, tension=1.0, closed=True, filled=True, stroked=False, **kw):
    """Smooth closed path through anchors (Catmull-Rom -> cubic Bézier)."""
    n = len(anchors)
    pts = []
    for i in range(n):
        p_prev, p, p_next = anchors[i - 1], anchors[i], anchors[(i + 1) % n]
        tx, ty = (p_next[0] - p_prev[0]) / 2 * tension, (p_next[1] - p_prev[1]) / 2 * tension
        pts.append(_pp(sheet, p, (p[0] - tx / 3, p[1] - ty / 3), (p[0] + tx / 3, p[1] + ty / 3)))
    spec = {"typename": "PathItem", "closed": closed, "filled": filled, "stroked": stroked, "pathPoints": pts}
    spec.update(kw)
    return spec


def circle_pts(sheet, cx, cy, r, reverse=False):
    k = 0.5522847498 * r
    pts = [
        _pp(sheet, (cx + r, cy), (cx + r, cy - k), (cx + r, cy + k)),
        _pp(sheet, (cx, cy + r), (cx + k, cy + r), (cx - k, cy + r)),
        _pp(sheet, (cx - r, cy), (cx - r, cy + k), (cx - r, cy - k)),
        _pp(sheet, (cx, cy - r), (cx - k, cy - r), (cx + k, cy - r)),
    ]
    if reverse:  # reverse direction: swap handles and order
        pts = [[p[0], p[1], p[4], p[5], p[2], p[3]] for p in reversed(pts)]
    return pts


def circle(sheet, cx, cy, r, filled=True, **kw):
    spec = {"typename": "PathItem", "closed": True, "filled": filled, "stroked": False,
            "pathPoints": circle_pts(sheet, cx, cy, r)}
    spec.update(kw)
    return spec


def compound(paths, **kw):
    spec = {"typename": "CompoundPathItem", "pathItems": paths}
    spec.update(kw)
    return spec


def group(children, name="", clipped=False, expect=None, **kw):
    spec = {"typename": "GroupItem", "name": name, "clipped": clipped, "uuid": next_uuid(), "pageItems": children}
    spec.update(kw)
    if expect:
        spec["_expect"] = expect
    return spec


def opaque(sheet, typename, x0, y0, x1, y1, **kw):
    l, b = sheet.pt(x0, y0)
    r, t = sheet.pt(x1, y1)
    spec = {"typename": typename, "bounds": [round(l, 4), round(t, 4), round(r, 4), round(b, 4)]}
    spec.update(kw)
    return spec


def rect_pts(x, y, w, h):
    return [(x, y), (x + w, y), (x + w, y + h), (x, y + h)]


def L_shape(x, y, w, h, t):
    return [(x, y), (x + w, y), (x + w, y + t), (x + t, y + t), (x + t, y + h), (x, y + h)]


def U_shape(x, y, w, h, t):
    return [(x, y), (x + w, y), (x + w, y + h), (x + w - t, y + h), (x + w - t, y + t),
            (x + t, y + t), (x + t, y + h), (x, y + h)]


def radial_concave(rng, cx, cy, R, n):
    pts = []
    for i in range(n):
        a = 2 * math.pi * i / n + rng.uniform(-0.15, 0.15) * (2 * math.pi / n)
        r = R * (rng.uniform(0.9, 1.0) if i % 2 == 0 else rng.uniform(0.35, 0.7))
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def blob(rng, cx, cy, R, n):
    return [(cx + R * rng.uniform(0.6, 1.0) * math.cos(2 * math.pi * i / n),
             cy + R * rng.uniform(0.6, 1.0) * math.sin(2 * math.pi * i / n)) for i in range(n)]


def grid(n, cols, cell_w, cell_h, x0=20, y0=20):
    for i in range(n):
        yield x0 + (i % cols) * cell_w, y0 + (i // cols) * cell_h


OK = {"status": "ok"}


def scene(name, sheet, groups, settings=None, extra_selection=None, global_expect=None):
    sel = list(groups) + list(extra_selection or [])
    return name, {
        "document": {"name": f"{name}.ai", "artboards": [{"name": "Artboard 1", "artboardRect": sheet.rect}],
                     "activeArtboard": 0},
        "settings": settings or {},
        "selection": sel,
        "_global_expect": global_expect or {},
    }


# ------------------------------------------------------------------- scenes
def s01_LU():
    sh = Sheet(600, 400)
    gs = []
    for i, (x, y) in enumerate(grid(10, 5, 115, 180)):
        if i % 2 == 0:
            p = path(sh, L_shape(x, y, 90, 140, 30), name="L")
        else:
            p = path(sh, U_shape(x, y, 100, 120, 25), name="U", stroked=(i % 4 == 1), strokeWidth=2.0)
        gs.append(group([p], name=f"LU{i+1}", expect=OK))
    return scene("01_LU_10", sh, gs)


def s02_concave():
    rng = random.Random(2)
    sh = Sheet(800, 600)
    gs = [group([path(sh, radial_concave(rng, x + 40, y + 40, rng.uniform(25, 45), rng.randint(7, 14)))],
                name=f"C{i+1}", expect=OK)
          for i, (x, y) in enumerate(grid(20, 5, 150, 140, 20, 20))]
    return scene("02_concave_20", sh, gs)


def s03_bezier():
    rng = random.Random(3)
    sh = Sheet(1000, 800)
    gs = []
    for i, (x, y) in enumerate(grid(40, 8, 120, 95, 30, 30)):
        R = rng.uniform(12, 40)
        kw = {}
        if i % 5 == 0:
            kw = dict(stroked=True, strokeWidth=1.5, strokeJoin="ROUNDENDJOIN")
        gs.append(group([bezier_path(sh, blob(rng, x + 45, y + 40, R, rng.randint(5, 9)), **kw)],
                        name=f"B{i+1}", expect={"status": "ok", "has_curves": True}))
    return scene("03_bezier_40", sh, gs, settings={"curve_tolerance_mm": 0.25})


def s04_clip_raster():
    sh = Sheet(700, 500)
    gs = [
        # a) circle clipping mask over a larger raster texture
        group([circle(sh, 60, 60, 40, filled=False, clipping=True),
               opaque(sh, "RasterItem", 10, 10, 120, 110)],
              name="clip_circle_raster", clipped=True,
              expect={"status": "ok", "source": "clip_path", "codes": ["CLIP_BOUNDS_OPAQUE_CONTENT"]}),
        # b) compound clipping path with a hole (ring) over a raster
        group([compound([{"closed": True, "filled": False, "clipping": True, "evenodd": True,
                          "pathPoints": circle_pts(sh, 200, 60, 45)},
                         {"closed": True, "pathPoints": circle_pts(sh, 200, 60, 20)}]),
               opaque(sh, "PlacedItem", 140, 0, 260, 120)],
              name="clip_ring_placed", clipped=True,
              expect={"status": "ok", "source": "clip_path", "codes": ["HAS_HOLES"]}),
        # c) raster alone: silhouette unknown -> must ask for NEST_OUTLINE
        group([opaque(sh, "RasterItem", 300, 20, 380, 100)], name="raster_only",
              expect={"status": "error", "codes": ["NEEDS_NEST_OUTLINE"]}),
        # d) raster + NEST_OUTLINE (invisible Bézier outline)
        group([opaque(sh, "RasterItem", 420, 20, 500, 100),
               bezier_path(sh, [(415, 15), (505, 15), (505, 105), (460, 112), (415, 105)], tension=0.4,
                           filled=False, name="NEST_OUTLINE")],
              name="raster_with_outline", expect={"status": "ok", "source": "nest_outline"}),
        # e) raster and text fully inside a filled star -> covered, vector union ok
        group([path(sh, radial_concave(random.Random(4), 600, 70, 60, 10)),
               opaque(sh, "RasterItem", 590, 60, 610, 80),
               opaque(sh, "TextFrame", 585, 66, 615, 74)],
              name="covered_opaque", expect={"status": "ok", "source": "vector_union", "codes": ["OPAQUE_COVERED"]}),
        # f) clip larger than vector content -> silhouette = clip ∩ content (the square)
        group([circle(sh, 80, 250, 60, filled=False, clipping=True),
               path(sh, rect_pts(60, 230, 40, 40))],
              name="clip_bigger_than_content", clipped=True, expect={"status": "ok", "source": "clip_path"}),
        # g) nested clip group with raster + a vector badge next to it
        group([group([circle(sh, 230, 250, 35, filled=False, clipping=True),
                      opaque(sh, "RasterItem", 180, 200, 280, 300)], clipped=True),
               path(sh, rect_pts(262, 240, 50, 20))],
              name="nested_clip", expect={"status": "ok", "source": "vector_union"}),
        # h) NEST_OUTLINE drawn too small for the artwork
        group([path(sh, rect_pts(380, 200, 100, 80)),
               path(sh, rect_pts(390, 210, 60, 50), filled=False, name="NEST_OUTLINE")],
              name="outline_too_small",
              expect={"status": "warning", "source": "nest_outline", "codes": ["OUTLINE_SMALLER_THAN_ARTWORK"]}),
        # i) text alone
        group([opaque(sh, "TextFrame", 520, 220, 640, 250)], name="text_only",
              expect={"status": "error", "codes": ["NEEDS_NEST_OUTLINE"]}),
    ]
    return scene("04_clip_raster", sh, gs)


def s05_compound():
    sh = Sheet(600, 400)
    letters = []
    for k in range(6):
        x = 20 + k * 14
        letters.append({"closed": True, "pathPoints": [_pp(sh, p) for p in rect_pts(x, 220, 10, 40)]})
        letters.append({"closed": True, "pathPoints": [_pp(sh, p) for p in rect_pts(x + 3, 245, 4, 10)][::-1]})
    letters[0].update(filled=True)
    gs = [
        group([compound([{"closed": True, "filled": True, "evenodd": True, "pathPoints": circle_pts(sh, 70, 80, 50)},
                         {"closed": True, "pathPoints": circle_pts(sh, 70, 80, 25)}])],
              name="ring_evenodd", expect={"status": "ok", "codes": ["HAS_HOLES"]}),
        group([compound([{"closed": True, "filled": True, "pathPoints": circle_pts(sh, 200, 80, 50)},
                         {"closed": True, "pathPoints": circle_pts(sh, 200, 80, 25, reverse=True)}])],
              name="ring_nonzero_reversed", expect={"status": "ok", "codes": ["HAS_HOLES"]}),
        group([compound([{"closed": True, "filled": True, "pathPoints": circle_pts(sh, 320, 80, 40)},
                         {"closed": True, "pathPoints": circle_pts(sh, 350, 80, 40)}])],
              name="overlap_nonzero_union", expect={"status": "ok"}),
        group([path(sh, rect_pts(420, 40, 30, 30)), circle(sh, 490, 55, 15), path(sh, L_shape(530, 40, 40, 40, 10))],
              name="three_islands", expect={"status": "ok", "codes": ["MULTIPLE_ISLANDS"]}),
        group([compound(letters)], name="many_subpaths", expect={"status": "ok", "codes": ["HAS_HOLES"]}),
        group([group([group([path(sh, rect_pts(220, 220, 40, 40))]), circle(sh, 290, 240, 20)]),
               path(sh, U_shape(330, 210, 60, 60, 15))],
              name="deep_nesting", expect={"status": "ok"}),
    ]
    return scene("05_compound_multi", sh, gs)


def s06_small_edge():
    sh = Sheet(500, 300)
    gs = []
    spots = [(0.5, 0.5), (497, 1), (1, 297), (495, 295), (250, 0.2), (0.2, 150), (12, 12), (480, 150)]
    for i, (x, y) in enumerate(spots):
        size = 1.5 + i * 0.5
        if i % 2:
            gs.append(group([circle(sh, x + size / 2, y + size / 2, size / 2)], name=f"tiny{i}", expect=OK))
        else:
            gs.append(group([path(sh, rect_pts(x, y, size, size))], name=f"tiny{i}", expect=OK))
    return scene("06_small_near_edge", sh, gs)


def s07_overflow():
    rng = random.Random(7)
    sh = Sheet(500, 400)
    gs = [group([path(sh, U_shape(x, y, rng.uniform(90, 130), rng.uniform(70, 100), 20))], name=f"O{i+1}", expect=OK)
          for i, (x, y) in enumerate(grid(59, 10, 50, 40, 0, 0))]
    gs.append(group([path(sh, rect_pts(10, 10, 700, 30))], name="too_long",
                    expect={"status": "error", "codes": ["PART_TOO_LARGE"]}))
    return scene("07_overflow", sh, gs, global_expect={"codes": ["TOTAL_AREA_EXCEEDS_SHEET"]})


def s08_offset_artboard():
    rng = random.Random(8)
    sh = Sheet(900, 600, left_pt=-12345.678, top_pt=8765.4321)
    gs = [group([bezier_path(sh, blob(rng, x + 50, y + 50, 40, 7))], name=f"OA{i+1}",
                expect={"status": "ok", "has_curves": True})
          for i, (x, y) in enumerate(grid(12, 6, 140, 140, 20, 40))]
    return scene("08_offset_artboard", sh, gs)


def s09_rotation():
    sh = Sheet(600, 400)
    rng = random.Random(9)
    gs = [group([path(sh, rect_pts(20, 300, 680, 4))], name="diag_bar",
                expect={"status": "ok", "codes": ["FITS_ONLY_SOME_ORIENTATIONS"]})]
    gs += [group([path(sh, radial_concave(rng, x + 40, y + 40, 35, 9))], name=f"R{i+1}", expect=OK)
           for i, (x, y) in enumerate(grid(8, 4, 140, 120, 20, 20))]
    return scene("09_rotation_1deg", sh, gs, settings={"rotation": {"preset": "step", "step_deg": 1}})


def s10_invalid():
    sh = Sheet(800, 500)
    nan_pt = _pp(sh, (300, 50))
    nan_pt[0] = None  # ExtendScript NaN is exported as null
    gs = [
        group([compound([{"closed": True, "filled": True, "evenodd": True, "pathPoints": circle_pts(sh, 60, 60, 40)},
                         {"closed": True, "pathPoints": [_pp(sh, p) for p in rect_pts(45, 45, 30, 30)]}])],
              name="hole", expect={"status": "ok", "codes": ["HAS_HOLES"]}),
        group([path(sh, [(130, 20), (200, 20), (200, 90), (130, 90)], closed=False)], name="open_filled",
              expect={"status": "warning", "codes": ["OPEN_FILLED_PATH"]}),
        group([path(sh, [(230, 20), (300, 90), (330, 30)], closed=False, filled=False, stroked=True,
                    strokeWidth=6, strokeCap="ROUNDENDCAP", strokeJoin="ROUNDENDJOIN")],
              name="open_stroke_only", expect={"status": "ok"}),
        group([path(sh, [(360, 20), (440, 90), (440, 20), (360, 90)])], name="bowtie",
              expect={"status": "warning", "codes": ["SELF_INTERSECTION"]}),
        group([path(sh, [(520 + 40 * math.cos(math.pi / 2 + i * 4 * math.pi / 5),
                          60 + 40 * math.sin(math.pi / 2 + i * 4 * math.pi / 5)) for i in range(5)],
                    evenodd=True)], name="pentagram_evenodd",
              expect={"status": "warning", "codes": ["SELF_INTERSECTION"]}),
        group([path(sh, [(620 + 40 * math.cos(math.pi / 2 + i * 4 * math.pi / 5),
                          60 + 40 * math.sin(math.pi / 2 + i * 4 * math.pi / 5)) for i in range(5)])],
              name="pentagram_nonzero", expect={"status": "warning", "codes": ["SELF_INTERSECTION"]}),
        group([path(sh, rect_pts(20, 150, 60, 60)),
               path(sh, [(15, 145), (85, 215), (85, 145), (15, 215)], filled=False, name="NEST_OUTLINE")],
              name="outline_selfx", expect={"status": "error", "codes": ["OUTLINE_SELF_INTERSECTION"]}),
        group([path(sh, rect_pts(120, 150, 60, 60)),
               path(sh, [(115, 145), (185, 145), (185, 215), (115, 215)], closed=False, filled=False,
                    name="NEST_OUTLINE")],
              name="outline_open", expect={"status": "error", "codes": ["OUTLINE_NOT_CLOSED"]}),
        group([path(sh, [(220, 150), (260, 190)]), path(sh, rect_pts(230, 160, 30, 30))],
              name="degenerate_plus_valid", expect={"status": "ok", "codes": ["DEGENERATE_FILL"]}),
        group([path(sh, [(300, 150), (340, 190)])], name="degenerate_only",
              expect={"status": "error", "codes": ["EMPTY_SILHOUETTE"]}),
        group([{"typename": "PathItem", "closed": True, "filled": True,
                "pathPoints": [_pp(sh, (280, 20)), nan_pt, _pp(sh, (300, 80))]}],
              name="nan_coordinates", expect={"status": "error", "codes": ["BAD_COORDINATES"]}),
        group([path(sh, rect_pts(380, 150, 50, 50)),
               path(sh, [(360, 140), (460, 140)], closed=False, filled=False, guides=True),
               path(sh, [(370, 130), (470, 230)], closed=False, filled=False, stroked=False),
               path(sh, rect_pts(360, 130, 120, 100), filled=False, stroked=False)],
              name="guides_and_tech_lines", expect={"status": "ok", "codes": ["GUIDE_IGNORED", "INVISIBLE_PATH_IGNORED"],
                                                    "area_mm2": 2500.0}),
        group([path(sh, rect_pts(500, 150, 50, 50)), path(sh, rect_pts(560, 150, 20, 20), locked=True)],
              name="locked_child", expect={"status": "error", "codes": ["LOCKED_CHILD"]}),
        group([path(sh, rect_pts(620, 150, 50, 50))], name="effect_exceeds",
              visibleBounds=[round(v, 4) for v in (sh.pt(612, 0)[0], sh.pt(0, 208)[1],
                                                    sh.pt(682, 0)[0], sh.pt(0, 140)[1])],
              expect={"status": "warning", "codes": ["APPEARANCE_EXCEEDS_GEOMETRY"]}),
        group([path(sh, rect_pts(20, 300, 50, 50))], name="coordinate_mismatch",
              geometricBounds=[round(v, 4) for v in (sh.pt(320, 0)[0], sh.pt(0, 450)[1],
                                                      sh.pt(370, 0)[0], sh.pt(0, 400)[1])],
              expect={"status": "error", "codes": ["COORDINATE_MISMATCH"]}),
        group([path(sh, rect_pts(120, 300, 150, 150), hidden=True), path(sh, rect_pts(130, 310, 30, 30))],
              name="hidden_child", expect={"status": "ok", "codes": ["HIDDEN_IGNORED"], "area_mm2": 900.0}),
        group([path(sh, [(300, 300), (360, 300), (360, 360), (300, 360), (300, 300)], closed=False)],
              name="open_coincident", expect={"status": "ok", "codes": ["OPEN_PATH_COINCIDENT_ENDS"]}),
    ]
    extra = [path(sh, rect_pts(700, 400, 20, 20)), opaque(sh, "TextFrame", 700, 450, 760, 470)]
    return scene("10_invalid_geometry", sh, gs, extra_selection=extra,
                 global_expect={"skipped_selection": 2})


ALL = [s01_LU, s02_concave, s03_bezier, s04_clip_raster, s05_compound, s06_small_edge, s07_overflow,
       s08_offset_artboard, s09_rotation, s10_invalid]


def main():
    SCENES.mkdir(parents=True, exist_ok=True)
    GEOM.mkdir(parents=True, exist_ok=True)
    for fn in ALL:
        name, sc = fn()
        expect = {"global": sc.pop("_global_expect"), "groups": {}}
        idx = 0
        for item in sc["selection"]:
            if item["typename"] == "GroupItem":
                idx += 1
                expect["groups"][f"g{idx:03d}"] = dict(item.pop("_expect", {}), name=item["name"])
        (SCENES / f"{name}.scene.json").write_text(json.dumps(sc, indent=1), encoding="utf-8")
        (GEOM / f"{name}.expect.json").write_text(json.dumps(expect, indent=1, ensure_ascii=False), encoding="utf-8")
        print("scene", name, "groups:", idx)


if __name__ == "__main__":
    main()

"""Silhouette priority rules and geometry validation on hand-built documents."""
import math

import pytest

from autonest.analyze import analyze_document
from autonest.contract import ContractError, validate_geometry_doc
from helpers import (K, P, circle_points, codes, compound, doc, group, opaque, path, pts, rect, star)


def run(*roots, **kw):
    return analyze_document(validate_geometry_doc(doc(*roots, **kw)))


def part(*roots, **kw):
    return run(*roots, **kw)["parts"][0]


def test_filled_rect_is_exact_true_shape():
    p = part(group([rect(10, 10, 100, 50)]))
    assert p["status"] == "ok" and p["source"] == "vector_union"
    assert p["metrics"]["area_mm2"] == pytest.approx(5000, abs=1e-3)
    assert p["metrics"]["bbox_mm"] == pytest.approx([10, 10, 110, 60], abs=1e-4)
    assert not p["has_curves"] and p["envelope"] is None


def test_concave_L_not_bbox():
    L = path(pts([(0, 0), (90, 0), (90, 30), (30, 30), (30, 140), (0, 140)]))
    p = part(group([L]))
    assert p["metrics"]["area_mm2"] == pytest.approx(90 * 30 + 30 * 110, abs=1e-3)
    assert p["metrics"]["bbox_fill_ratio"] < 0.5


def test_curves_get_conservative_envelope():
    p = part(group([path(circle_points(100, 100, 50))]), settings={"curve_tolerance_mm": 0.25})
    assert p["has_curves"]
    # flattened polygon is inscribed: area slightly below the true disk; envelope covers it
    assert p["metrics"]["area_mm2"] <= math.pi * 2500 * 1.0003
    assert p["metrics"]["envelope_area_mm2"] >= math.pi * 2500


def test_nest_outline_has_priority():
    art = rect(0, 0, 100, 100)
    outline = path(circle_points(50, 50, 75), filled=False, name="NEST_OUTLINE")
    p = part(group([art, outline]))
    assert p["source"] == "nest_outline"
    assert p["metrics"]["area_mm2"] > 100 * 100


def test_outline_lowercase_accepted_with_warning():
    p = part(group([rect(0, 0, 10, 10), rect(-1, -1, 12, 12, filled=False, name="nest_outline")]))
    assert p["source"] == "nest_outline" and "OUTLINE_NAME_CASE" in codes(p)


def test_clip_priority_and_intersection():
    clip = path(circle_points(50, 50, 40), filled=False, clipping=True)
    content = rect(40, 40, 20, 20)
    p = part(group([clip, content], clipped=True))
    assert p["source"] == "clip_path"
    assert p["metrics"]["area_mm2"] == pytest.approx(400, abs=1e-3)  # clip ∩ content


def test_clip_with_raster_uses_clip_shape():
    clip = path(circle_points(50, 50, 40), filled=False, clipping=True)
    p = part(group([clip, opaque("RasterItem", 0, 0, 100, 100)], clipped=True))
    assert p["status"] == "ok" and p["source"] == "clip_path"
    assert p["metrics"]["area_mm2"] == pytest.approx(math.pi * 1600, rel=0.01)


def test_raster_without_outline_is_rejected():
    p = part(group([opaque("RasterItem", 0, 0, 50, 50)]))
    assert p["status"] == "error" and "NEEDS_NEST_OUTLINE" in codes(p)


def test_raster_with_cut_line():
    # print-and-cut artwork: a large image, a stroked cut line inside it, a small stroked mark
    cut = path(circle_points(50, 50, 30), filled=False, stroked=True)
    mark = path(pts([(45, 50), (55, 50)]), closed=False, filled=False, stroked=True)
    g = group([opaque("RasterItem", 0, 0, 100, 100), group([cut]), mark])
    p = part(g, settings={"opaque_policy": "cut_line"})
    assert p["status"] == "warning" and p["source"] == "cut_line"
    assert p["metrics"]["area_mm2"] == pytest.approx(math.pi * 900, rel=0.01)
    over = [i for i in p["issues"] if (i.get("data") or {}).get("overflow_mm")]
    assert len(over) == 1 and over[0]["data"]["overflow_mm"] == pytest.approx(50 * math.sqrt(2) - 30, abs=0.6)
    assert part(g, settings={"opaque_policy": "require_outline"})["status"] == "error"


def test_cut_line_is_the_largest_stroked_path_and_needs_one():
    small = path(circle_points(50, 50, 10), filled=False, stroked=True)
    big = path(circle_points(50, 50, 40), filled=False, stroked=True)
    p = part(group([opaque("RasterItem", 0, 0, 100, 100), small, big]), settings={"opaque_policy": "cut_line"})
    assert p["metrics"]["area_mm2"] == pytest.approx(math.pi * 1600, rel=0.01)
    p = part(group([opaque("RasterItem", 0, 0, 100, 100)]), settings={"opaque_policy": "cut_line"})
    assert p["status"] == "error" and "NEEDS_NEST_OUTLINE" in codes(p)


def test_raster_use_bounds_opt_in():
    p = part(group([opaque("PlacedItem", 0, 0, 50, 50)]), settings={"opaque_policy": "use_bounds"})
    assert p["status"] == "warning" and "OPAQUE_BOUNDS_USED" in codes(p)
    assert p["metrics"]["area_mm2"] == pytest.approx(2500, abs=1e-3)


def test_text_inside_vector_is_covered():
    p = part(group([rect(0, 0, 100, 100), opaque("TextFrame", 10, 10, 90, 20)]))
    assert p["status"] == "ok" and "OPAQUE_COVERED" in codes(p)


def test_text_clipping_mask_unsupported():
    clip = {"kind": "opaque", "typename": "TextFrame", "clipping": True,
            "geometric_bounds_pt": [*P(0, 10), *P(10, 0)]}
    p = part(group([clip, rect(0, 0, 10, 10)], clipped=True))
    assert p["status"] == "error" and "CLIP_PATH_UNSUPPORTED" in codes(p)


def test_stroke_adds_width():
    p = part(group([rect(0, 0, 100, 100, filled=False, stroked=True,
                         stroke={"width_pt": 10 * K, "join": "miter", "cap": "butt", "miter_limit": 10})]))
    assert p["metrics"]["bbox_mm"] == pytest.approx([-5, -5, 105, 105], abs=1e-4)
    assert len(p["silhouette"][0]["holes"]) == 1  # unfilled stroked square is a frame


def test_outside_stroke_detected_from_visible_bounds():
    r = rect(0, 0, 100, 100, filled=True, stroked=True,
             stroke={"width_pt": 10 * K, "join": "miter", "cap": "butt", "miter_limit": 10})
    (l, b), (rr, t) = P(-10, -10), P(110, 110)
    r["visible_bounds_pt"] = [l, t, rr, b]  # outside-aligned 10 mm stroke
    p = part(group([r]))
    assert "STROKE_ALIGNMENT_ASSUMED_OUTSIDE" in codes(p)
    assert p["metrics"]["bbox_mm"] == pytest.approx([-10, -10, 110, 110], abs=1e-4)


def test_guides_hidden_invisible_ignored():
    p = part(group([rect(0, 0, 10, 10), rect(-50, -50, 200, 200, guides=True),
                    rect(-40, -40, 150, 150, hidden=True), rect(-30, -30, 120, 120, filled=False)]))
    assert p["metrics"]["area_mm2"] == pytest.approx(100, abs=1e-6)
    assert {"GUIDE_IGNORED", "HIDDEN_IGNORED", "INVISIBLE_PATH_IGNORED"} <= codes(p)


def test_zero_opacity_ignored():
    p = part(group([rect(0, 0, 10, 10), rect(20, 0, 10, 10, opacity=0)]))
    assert p["metrics"]["area_mm2"] == pytest.approx(100, abs=1e-6)


def test_zero_opacity_group_ignored():
    p = part(group([rect(0, 0, 10, 10), group([rect(20, 0, 10, 10)], opacity=0)]))
    assert p["metrics"]["area_mm2"] == pytest.approx(100, abs=1e-6)


def test_compound_with_hole_and_islands():
    outer = path(circle_points(50, 50, 40))
    inner = path(pts([(40, 40), (60, 40), (60, 60), (40, 60)]))
    island = path(pts([(200, 0), (210, 0), (210, 10), (200, 10)]))
    p = part(group([compound([outer, inner, island], fill_rule="evenodd")]))
    assert p["metrics"]["holes"] == 1 and p["metrics"]["polygons"] == 2
    assert {"HAS_HOLES", "MULTIPLE_ISLANDS"} <= codes(p)


def test_self_intersection_warning_and_fill_rule():
    s = [(math.cos(math.pi / 2 + i * 4 * math.pi / 5) * 50 + 60, math.sin(math.pi / 2 + i * 4 * math.pi / 5) * 50 + 60)
         for i in range(5)]
    nz = part(group([path(pts(s))]))
    eo = part(group([path(pts(s), fill_rule="evenodd")]))
    assert "SELF_INTERSECTION" in codes(nz) and nz["status"] == "warning"
    assert eo["metrics"]["area_mm2"] < nz["metrics"]["area_mm2"]


def test_outline_errors():
    bow = path(pts([(0, 0), (10, 10), (10, 0), (0, 10)]), filled=False, name="NEST_OUTLINE")
    assert "OUTLINE_SELF_INTERSECTION" in codes(part(group([rect(2, 2, 2, 2), bow])))
    opn = path(pts([(0, 0), (10, 0), (10, 10), (0, 10)]), closed=False, filled=False, name="NEST_OUTLINE")
    assert "OUTLINE_NOT_CLOSED" in codes(part(group([rect(2, 2, 2, 2), opn])))
    flat = path(pts([(0, 0), (10, 0), (20, 0)]), filled=False, name="NEST_OUTLINE")
    assert "OUTLINE_DEGENERATE" in codes(part(group([rect(2, 2, 2, 2), flat])))


def test_open_path_rules():
    p = part(group([path(pts([(0, 0), (50, 0), (50, 50)]), closed=False)]))
    assert "OPEN_FILLED_PATH" in codes(p) and p["metrics"]["area_mm2"] == pytest.approx(1250, abs=1e-3)
    line = path(pts([(0, 0), (50, 0)]), closed=False, filled=False, stroked=True,
                stroke={"width_pt": 2 * K, "join": "miter", "cap": "butt", "miter_limit": 4})
    assert part(group([line]))["metrics"]["area_mm2"] == pytest.approx(100, abs=1e-3)


def test_bad_coordinates_and_empty():
    bad = path([[0, 0, 0, 0, 0, 0], [None, 1, 1, 1, 1, 1], [5, 5, 5, 5, 5, 5]])
    p = part(group([bad]))
    assert p["status"] == "error" and "BAD_COORDINATES" in codes(p)
    p = part(group([path(pts([(0, 0)]))]))
    assert "EMPTY_SILHOUETTE" in codes(p) and "STRAY_POINT" in codes(p)


def test_locked_child_error():
    assert "LOCKED_CHILD" in codes(part(group([rect(0, 0, 10, 10), rect(20, 0, 5, 5, locked=True)])))


def test_bounds_checks():
    g = group([rect(0, 0, 50, 50)])
    d = doc(g)
    (l, b), (r, t) = P(0, 0), P(50, 50)
    d["groups"][0]["geometric_bounds_pt"] = [l, t, r, b]
    d["groups"][0]["visible_bounds_pt"] = [l - 20, t + 20, r + 20, b - 20]
    p = analyze_document(validate_geometry_doc(d))["parts"][0]
    assert "APPEARANCE_EXCEEDS_GEOMETRY" in codes(p) and "BOUNDS_MISMATCH" not in codes(p)
    d["groups"][0]["geometric_bounds_pt"] = [l + 100 * K, t, r + 100 * K, b]
    p = analyze_document(validate_geometry_doc(d))["parts"][0]
    assert "COORDINATE_MISMATCH" in codes(p) and p["status"] == "error"


def test_offset_artboard_mapping():
    L, T = -5000.0, 3000.0
    W, H = 300.0, 200.0
    B = T - H * K
    frame = dict(L=L, B=B)
    sq = path(pts([(10, 10), (20, 10), (20, 20), (10, 20)], **frame))
    p = run(group([sq]), rect_pt=[L, T, L + W * K, B])["parts"][0]
    assert p["metrics"]["bbox_mm"] == pytest.approx([10, 10, 20, 20], abs=1e-6)


def test_fit_check_rotation_dependent():
    # usable 580 x 380; a 680 x 4 bar fits only around 32-33 degrees
    bar = rect(0, 0, 680, 4)
    p5 = part(group([bar]), settings={"rotation": {"preset": "step", "step_deg": 5}})
    p1 = part(group([bar]), settings={"rotation": {"preset": "step", "step_deg": 1}})
    assert "PART_TOO_LARGE" in codes(p5)
    assert p1["status"] == "ok" and "FITS_ONLY_SOME_ORIENTATIONS" in codes(p1)
    assert part(group([rect(0, 0, 700, 10)]), settings={"rotation": {"preset": "step", "step_deg": 1}})["status"] == "error"


def test_roll_mode_only_width_matters():
    long = rect(0, 0, 100, 2000)
    assert part(group([long]), settings={"rotation": {"preset": "fixed"}})["status"] == "error"
    p = part(group([long]), settings={"rotation": {"preset": "fixed"}, "material": {"mode": "roll"}})
    assert p["status"] == "ok"


def test_total_area_warning_and_margin():
    many = [group([rect(0, 0, 200, 200)]) for _ in range(10)]
    res = run(*many)
    assert any(i["code"] == "TOTAL_AREA_EXCEEDS_SHEET" for i in res["issues"])
    res = run(group([rect(0, 0, 1, 1)]), settings={"margin_mm": 250})
    assert any(i["code"] == "MARGIN_TOO_LARGE" for i in res["issues"])


def test_star_concavity_metric():
    p = part(group([path(pts(star(100, 100, 50, 20)))]))
    assert p["metrics"]["convexity"] < 0.7


def test_contract_errors():
    with pytest.raises(ContractError):
        validate_geometry_doc({"schema": "other"})
    d = doc(group([rect(0, 0, 1, 1)]), group([rect(0, 0, 1, 1)]))
    d["groups"][1]["id"] = d["groups"][0]["id"]
    with pytest.raises(ContractError, match="duplicate"):
        validate_geometry_doc(d)
    d = doc(group([{"kind": "path", "closed": True, "points": [[1, 2, 3]]}]))
    with pytest.raises(ContractError, match="points"):
        validate_geometry_doc(d)


def test_cut_line_shape_includes_vector_labels_outside_it():
    # a piece number drawn as thin strokes 0.5 mm outside the cut line must not be overlapped by other parts
    cut = path(pts([(0, 0), (100, 0), (100, 100), (0, 100)]), filled=False, stroked=True)
    label = [path(pts([(10 + 3 * k, -0.5), (10 + 3 * k, -5.5)]), closed=False, filled=False, stroked=True,
                  stroke={"width_pt": 0.28, "cap": "round"})
             for k in range(3)]
    g = group([opaque("RasterItem", 0, 0, 100, 100), cut, group(label)])
    p = part(g, settings={"opaque_policy": "cut_line"})
    assert p["source"] == "cut_line" and p["status"] == "ok"
    assert p["metrics"]["bbox_mm"][1] < -5.5
    assert not [i for i in p["issues"] if (i.get("data") or {}).get("outside_area_mm2")]


def test_cut_line_marks_within_half_the_spacing_are_not_added():
    # a mark 1 mm outside the cut line cannot reach another part when cut lines are 5 mm apart
    cut = path(pts([(0, 0), (100, 0), (100, 100), (0, 100)]), filled=False, stroked=True)
    mark = path(pts([(50, 1), (50, -1.5)]), closed=False, filled=False, stroked=True, stroke={"width_pt": 0.28})
    g = group([opaque("RasterItem", 0, 0, 100, 100), cut, mark])
    p = part(g, settings={"opaque_policy": "cut_line", "spacing_mm": 5})
    assert p["metrics"]["bbox_mm"] == pytest.approx([0, 0, 100, 100], abs=1e-6)
    p = part(g, settings={"opaque_policy": "cut_line", "spacing_mm": 0})
    assert p["metrics"]["bbox_mm"][1] < -1.4

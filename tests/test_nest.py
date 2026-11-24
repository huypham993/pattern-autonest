"""Phase 3A: true-shape nesting, independent verifier, bbox baseline."""
import copy
import json
import math
import random
import subprocess
import sys
from pathlib import Path

import numpy as np
import pytest
import shapely
from shapely import affinity
from shapely.geometry import Point, Polygon

import geomkit as gk
from autonest import nfp, regions
from autonest.baseline import baseline_document
from autonest.contract import load_geometry
from autonest.nest import nest_document
from autonest.verify import transformed_shapes, verify_placement

ROOT = Path(__file__).resolve().parents[1]
GEOM = ROOT / "fixtures" / "geometry"

try:
    import jsonschema
except ImportError:
    jsonschema = None

FAST = {"optimization": {"quality": "fast", "time_limit_s": 120.0}}


def _nest(doc, **over):
    o = copy.deepcopy(FAST)
    for k, v in over.items():
        if isinstance(v, dict) and isinstance(o.get(k), dict):
            o[k].update(v)
        else:
            o[k] = v
    return nest_document(doc, None, o)


def _independent_min_gap(doc, placement):
    """Re-measure gaps directly with shapely (no verifier code path)."""
    shapes = transformed_shapes(doc, placement)
    envs = [s["envelope"] for s in shapes.values()]
    gaps = [envs[i].distance(envs[j]) for i in range(len(envs)) for j in range(i + 1, len(envs))]
    overlaps = [envs[i].intersection(envs[j]).area for i in range(len(envs)) for j in range(i + 1, len(envs))]
    return (min(gaps) if gaps else None), (max(overlaps) if overlaps else 0.0), shapes


# ------------------------------------------------------------------ NFP / decomposition
def _random_polygon(rng, n=12, r=40):
    angles = sorted(rng.uniform(0, 2 * math.pi) for _ in range(n))
    return Polygon([(rng.uniform(0.3, 1.0) * r * math.cos(a), rng.uniform(0.3, 1.0) * r * math.sin(a))
                    for a in angles])


@pytest.mark.parametrize("seed", range(8))
def test_convex_decomposition_is_exact(seed):
    rng = random.Random(seed)
    poly = _random_polygon(rng)
    if not poly.is_valid:
        poly = regions.clean(poly)
    pieces = nfp.decompose(poly)
    union = shapely.union_all([Polygon(p) for p in pieces])
    assert abs(union.area - poly.area) < 1e-6
    assert union.symmetric_difference(poly).area < 1e-6
    for p in pieces:  # every piece convex
        P = Polygon(p)
        assert abs(P.convex_hull.area - P.area) < 1e-6


def _brute_nfp_check(A, B, n=1500, seed=0):
    paths = nfp.nfp(nfp.decompose(A), nfp.decompose(B))
    N = regions.region_from_rings([[(x / 1e4, y / 1e4) for x, y in p] for p in paths], "nonzero")
    rng = np.random.default_rng(seed)
    bx = N.bounds
    bad = 0
    for _ in range(n):
        x, y = rng.uniform(bx[0] - 5, bx[2] + 5), rng.uniform(bx[1] - 5, bx[3] + 5)
        overlap = affinity.translate(B, x, y).intersection(A).area > 1e-6
        if overlap != N.contains(Point(x, y)) and N.boundary.distance(Point(x, y)) > 1e-3:
            bad += 1
    return bad, N


def test_nfp_matches_brute_force_concave():
    A = Polygon(gk.L_shape())
    B = Polygon(gk.U_shape())
    bad, _ = _brute_nfp_check(A, B)
    assert bad == 0


def test_nfp_keeps_holes_for_part_in_hole():
    ring = Polygon(gk.regular(32, 45), [gk.regular(32, 20)])
    disk = Polygon(gk.regular(16, 10))
    bad, N = _brute_nfp_check(ring, disk)
    assert bad == 0
    assert sum(len(p.interiors) for p in regions.polygons_of(N)) == 1  # disk fits in the hole


@pytest.mark.parametrize("angle", [90.0, 180.0, 270.0])
def test_nfp_of_rotated_pieces_with_collinear_vertices(angle):
    # collinear vertices plus rotation noise used to wrap a ~0 edge angle to ~2pi in the edge merge,
    # shifting the NFP by tens of mm
    rect = Polygon([(0, 0), (25, 0), (50, 0), (75, 0), (100, 0), (100, 30), (100, 60), (50, 60), (0, 60), (0, 30)])
    H = Polygon([(0, 0), (20, 0), (20, 40), (80, 40), (80, 0), (100, 0), (100, 100), (80, 100), (80, 60),
                 (20, 60), (20, 100), (0, 100)])
    square = Polygon([(0, 0), (10, 0), (10, 10), (0, 10)])
    for A, B in ((rect, square), (H, square), (H, H)):
        pa, pb = nfp.rotate_pieces(nfp.decompose(A), angle), nfp.decompose(B)
        got = regions.region_from_rings([[(x / 1e4, y / 1e4) for x, y in r] for r in nfp.nfp(pa, pb)], "nonzero")
        ref = shapely.union_all([shapely.MultiPoint([tuple(u - v) for u in a for v in b]).convex_hull
                                 for a in pa for b in pb])
        assert got.symmetric_difference(ref).area < 0.05


# ------------------------------------------------------------------ concave interlocking
def _two_L_doc(**settings):
    # usable 136 x 136: two 100x100 L (arm 30) fit only interlocked (combined box 135 x 135);
    # side by side their boxes need 205 x 100.
    s = {"spacing_mm": 5.0, "margin_mm": 10.0, "rotation": {"preset": "0_90_180_270"}}
    s.update(settings)
    return gk.document(156, 156, [gk.group("g1", [gk.translate(gk.L_shape(), 200, 0)]),
                                  gk.group("g2", [gk.translate(gk.L_shape(), 320, 0)])], **s)


def test_concave_parts_interlock_where_bbox_cannot():
    doc = _two_L_doc()
    res = _nest(doc)
    assert res["status"] == "complete", res["unplaced"]
    assert res["verification"]["ok"], res["verification"]["problems"]
    gap, overlap, shapes = _independent_min_gap(doc, res)
    assert overlap == 0 and gap >= 5.0 - 1e-6
    # the two bounding boxes overlap: this layout is impossible for any bbox packer
    b1, b2 = (s["silhouette"].bounds for s in shapes.values())
    assert b1[0] < b2[2] and b2[0] < b1[2] and b1[1] < b2[3] and b2[1] < b1[3]
    base = baseline_document(doc, None, FAST)
    assert base["metrics"]["placed"] == 1 and base["verification"]["ok"]


def test_concave_nesting_by_translation_only():
    # with rotation fixed, two equal L shapes still nest diagonally (second L in the first one's corner)
    doc = _two_L_doc(rotation={"preset": "fixed"})
    res = _nest(doc)
    assert res["status"] == "complete" and res["verification"]["ok"]
    assert {pl["rotation_deg"] for pl in res["placements"]} == {0.0}
    gap, overlap, shapes = _independent_min_gap(doc, res)
    assert overlap == 0 and gap >= 5.0 - 1e-6
    b1, b2 = (s["silhouette"].bounds for s in shapes.values())
    assert b1[0] < b2[2] and b2[0] < b1[2] and b1[1] < b2[3] and b2[1] < b1[3]


def test_too_tight_sheet_reports_no_space():
    # 120 x 120 usable: one L fits, a second one cannot fit in any orientation
    doc = gk.document(140, 140, [gk.group("g1", [gk.translate(gk.L_shape(), 200, 0)]),
                                 gk.group("g2", [gk.translate(gk.L_shape(), 320, 0)])],
                      spacing_mm=5.0, margin_mm=10.0, rotation={"preset": "0_90_180_270"})
    res = _nest(doc)
    assert res["metrics"]["placed"] == 1
    assert res["unplaced"][0]["reason"] == "NO_SPACE_LEFT"
    assert res["verification"]["ok"]


# ------------------------------------------------------------------ holes
def _frame_doc(part_in_hole=True):
    outer = gk.rect(120, 120)
    hole = gk.translate(gk.rect(80, 80), 20, 20)
    return gk.document(150, 150, [
        gk.group("frame", [gk.translate(outer, 300, 0), gk.translate(hole, 300, 0)]),
        gk.group("small", [gk.translate(gk.rect(40, 40), 500, 0)]),
    ], spacing_mm=4.0, margin_mm=10.0, part_in_hole=part_in_hole, rotation={"preset": "0_90_180_270"})


def test_part_in_hole():
    doc = _frame_doc(True)
    res = _nest(doc)
    assert res["status"] == "complete", res["unplaced"]
    assert res["verification"]["ok"]
    gap, overlap, shapes = _independent_min_gap(doc, res)
    assert overlap == 0 and gap >= 4.0 - 1e-6
    frame = shapes["frame"]["silhouette"]
    small = shapes["small"]["silhouette"]
    hole = Polygon(frame.geoms[0].interiors[0]) if frame.geom_type == "MultiPolygon" else Polygon(frame.interiors[0])
    assert hole.contains(small)


def test_part_in_hole_disabled():
    res = _nest(_frame_doc(False), part_in_hole=False)
    assert res["metrics"]["placed"] == 1
    assert {u["id"]: u["reason"] for u in res["unplaced"]} == {"small": "NO_SPACE_LEFT"}


# ------------------------------------------------------------------ spacing / boundary / rigidity
def _mixed_doc(spacing, n=14, seed=3, preset="step", step=15.0):
    rng = random.Random(seed)
    groups = []
    for i in range(n):
        kind = i % 4
        if kind == 0:
            ring = gk.L_shape(rng.uniform(40, 80), rng.uniform(40, 80), rng.uniform(10, 20))
        elif kind == 1:
            ring = gk.U_shape(rng.uniform(50, 80), rng.uniform(50, 80), rng.uniform(10, 18))
        elif kind == 2:
            ring = gk.star(5, rng.uniform(25, 35), rng.uniform(10, 15))
        else:
            ring = gk.regular(7, rng.uniform(15, 25))
        groups.append(gk.group(f"p{i:02d}", [gk.translate(ring, 1000 + 120 * i, 0)]))
    return gk.document(400, 300, groups, spacing_mm=spacing, margin_mm=8.0,
                       rotation={"preset": preset, "step_deg": step})


@pytest.mark.parametrize("spacing", [0.0, 2.0, 7.5])
def test_spacing_boundary_and_rigidity(spacing):
    doc = _mixed_doc(spacing)
    res = _nest(doc)
    ver = res["verification"]
    assert ver["ok"], ver["problems"]
    assert res["metrics"]["placed"] >= 10
    gap, overlap, shapes = _independent_min_gap(doc, res)
    assert overlap == 0.0
    assert gap >= spacing - 1e-6
    usable = (8.0, 8.0, 392.0, 292.0)
    for s in shapes.values():
        x0, y0, x1, y1 = s["envelope"].bounds
        assert x0 >= usable[0] - 1e-3 and y0 >= usable[1] - 1e-3 and x1 <= usable[2] + 1e-3 and y1 <= usable[3] + 1e-3
    for pl in res["placements"]:
        a, b, c, d = pl["matrix"][:4]
        assert a * d - b * c == pytest.approx(1.0, abs=1e-9)        # no mirror, no scale
        assert math.hypot(a, b) == pytest.approx(1.0, abs=1e-9)
        assert pl["mirror"] is False
        assert round(pl["rotation_deg"] / 15.0, 6) == round(pl["rotation_deg"] / 15.0)  # allowed angle


def test_rotation_set_is_respected():
    res = _nest(_mixed_doc(3.0, preset="0_180"))
    assert {pl["rotation_deg"] for pl in res["placements"]} <= {0.0, 180.0}
    res = _nest(_mixed_doc(3.0, preset="fixed"))
    assert {pl["rotation_deg"] for pl in res["placements"]} == {0.0}


def test_area_and_shape_preserved_by_matrices():
    doc = _mixed_doc(3.0, n=8)
    res = _nest(doc)
    from autonest.verify import part_envelopes
    orig = part_envelopes(doc, res["settings"])
    moved = transformed_shapes(doc, res)
    for gid, sh in moved.items():
        o = orig[gid]["silhouette"]
        assert sh["silhouette"].area == pytest.approx(o.area, rel=1e-9)
        assert sh["silhouette"].length == pytest.approx(o.length, rel=1e-9)


def test_mirror_is_refused():
    doc = _mixed_doc(3.0, n=4)
    with pytest.raises(ValueError):
        nest_document(doc, None, {"rotation": {"allow_mirror": True}})


# ------------------------------------------------------------------ overflow / determinism / failure
def test_overflow_partial_and_verified():
    groups = [gk.group(f"s{i}", [gk.translate(gk.star(5, 30, 12), 500 + 70 * i, 0)]) for i in range(30)]
    doc = gk.document(220, 160, groups, spacing_mm=3.0, margin_mm=5.0, rotation={"preset": "0_90_180_270"})
    res = _nest(doc)
    assert res["status"] == "partial"
    assert 0 < res["metrics"]["placed"] < 30
    assert all(u["reason"] == "NO_SPACE_LEFT" for u in res["unplaced"])
    assert res["metrics"]["placed"] + res["metrics"]["unplaced"] == 30
    assert res["verification"]["ok"]


def test_fabric_size_limits_the_nest_area():
    """Fabric width x length starting at the artboard's bottom-left: every part inside it, the rest unplaced;
    the verifier enforces the same rectangle; a fabric larger than the artboard extends past it."""
    doc = _mixed_doc(3.0)                       # artboard 400 x 300 mm, margin 8
    res = _nest(doc, material={"sheet_width_mm": 200.0, "sheet_length_mm": 150.0})
    assert res["verification"]["ok"], res["verification"]["problems"]
    assert res["verification"]["usable_mm"] == [8.0, 8.0, 192.0, 142.0]
    assert res["metrics"]["placed"] >= 1 and res["unplaced"]
    _, overlap, shapes = _independent_min_gap(doc, res)
    assert overlap == 0.0
    for s in shapes.values():
        x0, y0, x1, y1 = s["envelope"].bounds
        assert x0 >= 8 - 1e-3 and y0 >= 8 - 1e-3 and x1 <= 192 + 1e-3 and y1 <= 142 + 1e-3
    full = _nest(doc)                           # the same placement checked against a smaller fabric fails
    small = copy.deepcopy(full)
    small["settings"]["material"].update(sheet_width_mm=200.0, sheet_length_mm=150.0)
    assert verify_placement(doc, small)["boundary_violations"] >= 1
    wide = _nest(doc, material={"sheet_width_mm": 1400.0, "sheet_length_mm": 100.0})   # wider, lower than the artboard
    assert wide["verification"]["ok"] and wide["verification"]["usable_mm"] == [8.0, 8.0, 1392.0, 92.0]
    assert max(s["envelope"].bounds[2] for s in transformed_shapes(doc, wide).values()) > 400   # past the artboard


def test_zero_fabric_size_is_refused_not_ignored():
    from autonest.contract import sheet_rect_mm
    assert sheet_rect_mm({"material": {"sheet_width_mm": None}}, 100.0, 50.0) == (0.0, 0.0, 100.0, 50.0)
    top = {"material": {"sheet_length_mm": 80.0}, "optimization": {"start_corner": "top_right"}}
    assert sheet_rect_mm(top, 100.0, 50.0) == (0.0, -30.0, 100.0, 50.0)   # hangs from the artboard top
    for key in ("sheet_width_mm", "sheet_length_mm"):
        with pytest.raises(ValueError):
            sheet_rect_mm({"material": {key: 0}}, 100.0, 50.0)


def test_roll_extends_upward_past_the_artboard():
    """'Extend length upward': roll mode packs within the fabric width as high as needed (verified)."""
    doc = _mixed_doc(3.0, n=14)
    fixed = _nest(doc, material={"sheet_width_mm": 150.0, "sheet_length_mm": 100.0})
    roll = _nest(doc, material={"mode": "roll", "sheet_width_mm": 150.0})
    assert roll["verification"]["ok"], roll["verification"]["problems"]
    assert roll["metrics"]["placed"] == 14 > fixed["metrics"]["placed"]
    top = max(p["expected_bounds_mm"][3] for p in roll["placements"])
    assert top > 300 - 8                                    # beyond the 300 mm artboard
    assert max(p["expected_bounds_mm"][2] for p in roll["placements"]) <= 150 - 8 + 1e-3
    assert roll["metrics"]["utilization"] == roll["metrics"]["utilization_used_height"]


def test_time_limit_never_drops_parts_that_fit():
    """A very short time limit still places every part in the first start (with fewer angles)."""
    doc = _mixed_doc(3.0, n=14)
    res = nest_document(doc, None, {"optimization": {"quality": "balanced", "time_limit_s": 0.001}}, workers=0)
    assert res["verification"]["ok"]
    assert not [u for u in res["unplaced"] if u["reason"] == "TIME_LIMIT"]
    assert res["metrics"]["placed"] == 14
    assert res["metrics"]["restarts"][0]["finished_with_few_angles"]


def test_parallel_nfp_gives_the_same_result():
    doc = _mixed_doc(3.0, n=16)
    serial = nest_document(doc, None, FAST, workers=0)
    parallel = nest_document(doc, None, FAST, workers=2)
    assert parallel["placements"] == serial["placements"] and parallel["unplaced"] == serial["unplaced"]
    assert parallel["metrics"]["nfp_computed"] == serial["metrics"]["nfp_computed"]


def test_parallel_workers_end_with_the_nesting_process(tmp_path):
    """Cancel kills the engine: its pool workers must not live on (on Windows they lock autonest.exe)."""
    if not Path("/proc").is_dir():
        pytest.skip("needs /proc")
    import os, signal, time
    root = Path(__file__).resolve().parents[1]
    p = subprocess.Popen([sys.executable, str(root / "engine/nest_engine.py"), "nest",
                          str(root / "fixtures/geometry/03_bezier_40.geometry.json"), "-o", str(tmp_path / "p.json"),
                          "--quality", "high_quality", "--time-limit", "60", "--workers", "2"],
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    def children():
        out = []
        for d in Path("/proc").iterdir():
            try:
                if d.name.isdigit() and (d / "stat").read_text().rsplit(")", 1)[1].split()[1] == str(p.pid):
                    out.append(int(d.name))
            except OSError:
                pass
        return out
    try:
        t = time.time()
        while len(children()) < 2 and time.time() - t < 30:
            time.sleep(0.2)
        kids = children()
        assert len(kids) >= 2, "the pool never started"
    finally:
        p.send_signal(signal.SIGKILL)
        p.wait()
    def running(k):   # a zombie has ended; only its parent's reaping is missing
        try:
            return Path(f"/proc/{k}/stat").read_text().rsplit(")", 1)[1].split()[0] != "Z"
        except OSError:
            return False
    t = time.time()
    while any(map(running, kids)) and time.time() - t < 15:
        time.sleep(0.2)
    alive = [k for k in kids if running(k)]
    for k in alive:   # leave nothing behind even when the test fails
        os.kill(k, signal.SIGKILL)
    assert not alive


def test_deterministic_for_same_seed():
    doc = _mixed_doc(2.0, n=10)
    a = _nest(doc, optimization={"seed": 7})
    b = _nest(doc, optimization={"seed": 7})
    strip = lambda r: [(p["id"], p["rotation_deg"], p["matrix"]) for p in r["placements"]]  # noqa: E731
    assert strip(a) == strip(b)


def test_balanced_quality_never_worse_than_first_start():
    doc = _mixed_doc(2.0, n=10)
    res = nest_document(doc, None, {"optimization": {"quality": "balanced", "time_limit_s": 60, "seed": 3}})
    first = res["metrics"]["restarts"][0]
    assert res["metrics"]["placed"] >= first["placed"]
    assert res["verification"]["ok"]


def _overflow_stars():
    groups = [gk.group(f"s{i}", [gk.translate(gk.star(5, 30, 12), 500 + 70 * i, 0)]) for i in range(30)]
    return gk.document(220, 160, groups, spacing_mm=3.0, margin_mm=5.0, rotation={"preset": "0_90_180_270"})


@pytest.mark.parametrize("make", [lambda: _mixed_doc(2.0, n=24), lambda: _mixed_doc(0.0, n=24), _overflow_stars])
def test_free_pocket_pruning_is_exact(monkeypatch, make):
    """Pruning may only skip work: placements must be identical with it switched off."""
    import autonest.nest as N
    doc = make()
    strip = lambda r: [(p["id"], p["rotation_deg"], p["matrix"]) for p in r["placements"]]  # noqa: E731
    pruned = _nest(doc)
    monkeypatch.setattr(N.Solver, "_pockets", lambda self, placed: None)
    full = _nest(doc)
    assert strip(pruned) == strip(full)
    assert pruned["metrics"]["nfp_computed"] <= full["metrics"]["nfp_computed"]
    if make is _overflow_stars:  # a full sheet: parts that fit no free pocket cost no NFP
        assert pruned["metrics"]["nfp_computed"] < full["metrics"]["nfp_computed"]


def test_balanced_also_tries_fine_collision_shapes():
    # spacing 5 mm simplifies collision shapes by 0.2 mm; one start uses 0.05 mm for tight designed fits
    doc = _mixed_doc(5.0, n=6)
    res = nest_document(doc, None, {"optimization": {"quality": "balanced", "time_limit_s": 60, "seed": 1}})
    assert "area_desc_fine" in [r["order"] for r in res["metrics"]["restarts"]]
    assert res["verification"]["ok"]


def test_verification_failure_returns_no_placements(monkeypatch):
    import autonest.verify as V
    real = V.verify_placement

    def broken(doc, placement):
        r = real(doc, placement)
        r["ok"] = False
        r["collisions"] = 1
        r["problems"] = ["injected failure"]
        return r

    monkeypatch.setattr(V, "verify_placement", broken)
    doc = _mixed_doc(2.0, n=4)
    res = _nest(doc)
    assert res["status"] == "failed"
    assert res["placements"] == []
    assert {u["reason"] for u in res["unplaced"]} == {"VERIFICATION_FAILED"}
    assert res["metrics"]["placed"] == 0


# ------------------------------------------------------------------ the verifier catches tampering
@pytest.fixture(scope="module")
def good():
    doc = _mixed_doc(4.0, n=8)
    res = nest_document(doc, None, FAST)
    assert res["verification"]["ok"]
    return doc, res


def _tamper(res, fn):
    r = copy.deepcopy(res)
    fn(r)
    return r


def test_verifier_detects_collision(good):
    doc, res = good

    def move(r):
        a, b = r["placements"][0], r["placements"][1]
        dx, dy = b["target_pt"][0] - a["target_pt"][0], b["target_pt"][1] - a["target_pt"][1]
        a["target_pt"] = list(b["target_pt"])
        a["matrix"][4] += dx
        a["matrix"][5] += dy
    v = verify_placement(doc, _tamper(res, move))
    assert not v["ok"] and v["collisions"] >= 1


def test_verifier_detects_spacing_violation(good):
    doc, res = good
    gap_pair = res["verification"]["min_gap_pair"]
    gap = res["verification"]["min_gap_mm"]
    pls = {p["id"]: p for p in res["placements"]}
    a, b = pls[gap_pair[0]], pls[gap_pair[1]]
    sa = transformed_shapes(doc, res)[a["id"]]["envelope"]
    sb = transformed_shapes(doc, res)[b["id"]]["envelope"]
    from shapely.ops import nearest_points
    p1, p2 = nearest_points(sa, sb)
    vx, vy = p2.x - p1.x, p2.y - p1.y
    n = math.hypot(vx, vy)
    shift_mm = (gap - 2.0) / n  # bring the pair to a 2 mm gap (< 4 mm spacing)
    from autonest.units import PT_PER_MM

    def move(r):
        q = next(p for p in r["placements"] if p["id"] == a["id"])
        q["target_pt"][0] += vx * shift_mm * PT_PER_MM
        q["target_pt"][1] += vy * shift_mm * PT_PER_MM
        q["matrix"][4] += vx * shift_mm * PT_PER_MM
        q["matrix"][5] += vy * shift_mm * PT_PER_MM
    v = verify_placement(doc, _tamper(res, move))
    assert not v["ok"] and (v["spacing_violations"] >= 1 or v["collisions"] >= 1)


def test_verifier_detects_boundary_violation(good):
    doc, res = good

    def move(r):
        r["placements"][0]["target_pt"][0] -= 2000
        r["placements"][0]["matrix"][4] -= 2000
    v = verify_placement(doc, _tamper(res, move))
    assert not v["ok"] and v["boundary_violations"] >= 1


def test_verifier_detects_scale_and_mirror(good):
    doc, res = good

    def scale(r):
        m = r["placements"][0]["matrix"]
        m[:4] = [v * 1.01 for v in m[:4]]  # uniform 1 % scale
    v = verify_placement(doc, _tamper(res, scale))
    assert not v["ok"] and v["rigidity_violations"] >= 1

    def mirror(r):
        m = r["placements"][0]["matrix"]
        m[0], m[1] = -m[0], -m[1]
    v = verify_placement(doc, _tamper(res, mirror))
    assert not v["ok"] and v["rigidity_violations"] >= 1


def test_verifier_detects_disallowed_angle_and_missing_group(good):
    doc, res = good

    def angle(r):
        r["placements"][0]["rotation_deg"] = 7.0
    v = verify_placement(doc, _tamper(res, angle))
    assert not v["ok"] and v["rigidity_violations"] >= 1

    def drop(r):
        r["placements"].pop()
    v = verify_placement(doc, _tamper(res, drop))
    assert not v["ok"] and any("neither placed nor unplaced" in p for p in v["problems"])


# ------------------------------------------------------------------ fixtures + baseline + contract
FIXTURES = sorted(p.name[: -len(".geometry.json")] for p in GEOM.glob("*.geometry.json"))


@pytest.mark.parametrize("name", FIXTURES)
def test_fixture_nest_is_verified(name):
    doc, sha = load_geometry(GEOM / f"{name}.geometry.json")
    res = nest_document(doc, sha, FAST)
    ver = res["verification"]
    assert ver["ok"], ver["problems"]
    assert ver["collisions"] == 0 and ver["boundary_violations"] == 0 and ver["spacing_violations"] == 0
    assert res["metrics"]["min_gap_mm"] is None or res["metrics"]["min_gap_mm"] >= res["settings"]["spacing_mm"]
    # parts with errors are never placed
    from autonest.analyze import analyze_document
    errs = {p["id"] for p in analyze_document(doc, sha)["parts"] if p["status"] == "error"}
    assert errs.isdisjoint({p["id"] for p in res["placements"]})
    assert errs <= {u["id"] for u in res["unplaced"]}
    if jsonschema is not None:
        jsonschema.validate(res, json.loads((ROOT / "schema/placement.schema.json").read_text()))


@pytest.mark.parametrize("name", ["01_LU_10", "02_concave_20"])
def test_true_shape_beats_bbox_baseline_on_concave_sets(name):
    doc, sha = load_geometry(GEOM / f"{name}.geometry.json")
    ts = nest_document(doc, sha, FAST)
    bb = baseline_document(doc, sha, FAST)
    assert bb["verification"]["ok"] and ts["verification"]["ok"]
    assert ts["metrics"]["placed"] >= bb["metrics"]["placed"]
    assert ts["metrics"]["used_length_mm"] < bb["metrics"]["used_length_mm"]


# ------------------------------------------------------------------ CLI
ENGINE = ROOT / "engine" / "nest_engine.py"


def test_cli_nest_verify_baseline(tmp_path):
    g = GEOM / "01_LU_10.geometry.json"
    out, svg = tmp_path / "placement.json", tmp_path / "placement.svg"
    r = subprocess.run([sys.executable, str(ENGINE), "nest", str(g), "-o", str(out), "--svg", str(svg),
                        "--quality", "fast", "--seed", "2"], capture_output=True, text=True)
    assert r.returncode == 0, r.stderr
    assert "verified=True" in r.stderr and svg.read_text().startswith("<svg")
    r = subprocess.run([sys.executable, str(ENGINE), "verify", str(g), str(out), "-o", str(tmp_path / "v.json")],
                       capture_output=True, text=True)
    assert r.returncode == 0, r.stderr
    # tamper -> verify exits 5
    p = json.loads(out.read_text())
    p["placements"][1]["matrix"] = p["placements"][0]["matrix"]
    p["placements"][1]["target_pt"] = p["placements"][0]["target_pt"]
    p["placements"][1]["pivot_pt"] = p["placements"][0]["pivot_pt"]
    p["placements"][1]["rotation_deg"] = p["placements"][0]["rotation_deg"]
    (tmp_path / "bad.json").write_text(json.dumps(p))
    r = subprocess.run([sys.executable, str(ENGINE), "verify", str(g), str(tmp_path / "bad.json")],
                       capture_output=True, text=True)
    assert r.returncode == 5
    r = subprocess.run([sys.executable, str(ENGINE), "baseline", str(g), "-o", str(tmp_path / "b.json")],
                       capture_output=True, text=True)
    assert r.returncode == 0, r.stderr


def test_cli_partial_exit_code(tmp_path):
    g = GEOM / "07_overflow.geometry.json"
    r = subprocess.run([sys.executable, str(ENGINE), "nest", str(g), "-o", str(tmp_path / "p.json"),
                        "--quality", "fast"], capture_output=True, text=True)
    assert r.returncode == 4, r.stderr
    assert json.loads((tmp_path / "p.json").read_text())["verification"]["ok"]

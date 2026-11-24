"""Phase 4 Apply: the real ExtendScript Apply code (jsx/lib/an_apply.jsxinc) run in the mock DOM (Node).

Each test: fixture scene -> committed geometry.json -> real engine placement -> Apply -> every anchor and
handle of every placed group is compared with matrix * exported point (independent of the trackers Apply uses).
These prove the logic and the bundle; they are NOT a test of Adobe Illustrator.
"""
import copy
import json
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

from autonest.contract import load_geometry
from autonest.nest import nest_document

ROOT = Path(__file__).resolve().parents[1]
NODE = shutil.which("node")
RUN = ROOT / "tests/jsx_harness/run_apply.js"
SCENES = ROOT / "fixtures/scenes"
GEOM = ROOT / "fixtures/geometry"
APPLY_BUNDLE = ROOT / "dist/AutoNesting_Apply_Standalone.jsx"
PANEL_BUNDLE = ROOT / "dist/AutoNesting_PanelHost.jsx"
pytestmark = pytest.mark.skipif(NODE is None, reason="node not installed")

_PLACEMENTS: dict = {}


def _placement(name):
    """Real engine output for a fixture (cached per session; fast quality, short limit)."""
    if name not in _PLACEMENTS:
        doc, sha = load_geometry(str(GEOM / f"{name}.geometry.json"))
        _PLACEMENTS[name] = nest_document(doc, sha, {"optimization": {"quality": "fast", "time_limit_s": 3}})
    return copy.deepcopy(_PLACEMENTS[name])


def _job(tmp_path, name, placement=None, scene=None, geometry=None):
    d = tmp_path / name
    d.mkdir()
    if geometry is None:
        shutil.copy(GEOM / f"{name}.geometry.json", d / "geometry.json")
    else:
        (d / "geometry.json").write_text(json.dumps(geometry))
    (d / "placement.json").write_text(json.dumps(placement if placement is not None else _placement(name)))
    (d / "scene.json").write_text(json.dumps(scene if scene is not None else _scene(name)))
    return d


def _scene(name):
    return json.loads((SCENES / f"{name}.scene.json").read_text())


def _run(d, *extra):
    r = subprocess.run([NODE, str(RUN), str(d / "scene.json"), str(d / "geometry.json"), str(d / "placement.json"),
                        *map(str, extra)], capture_output=True, text=True)
    assert r.returncode == 0, r.stdout + r.stderr
    return json.loads(r.stdout.strip().splitlines()[-1])


def _assert_untouched(res):
    assert res["max_doc_change_pt"] == 0, res
    assert res["coordinate_system"] == "CoordinateSystem.ARTBOARDCOORDINATESYSTEM"


SCENE_NAMES = ["01_LU_10", "03_bezier_40", "04_clip_raster", "05_compound_multi", "08_offset_artboard",
               "09_rotation_1deg"]


@pytest.mark.parametrize("name", SCENE_NAMES)
@pytest.mark.parametrize("bundle", [None, APPLY_BUNDLE, PANEL_BUNDLE], ids=["modules", "apply_bundle", "panel_bundle"])
def test_apply_moves_every_point_rigidly(tmp_path, name, bundle):
    pl = _placement(name)
    assert pl["placements"], "fixture produced no placement"
    d = _job(tmp_path, name, pl)
    res = _run(d, *(["--bundle", bundle] if bundle else []))
    assert res["status"] == "applied", res
    assert res["applied"] == len(pl["placements"])
    assert res["max_point_err_pt"] < 1e-3          # every anchor + handle, not only the trackers
    assert res["unplaced_max_move_pt"] < 1e-6       # unplaced groups only translated...
    if pl["unplaced"]:                                # ...to the right of the artboard, not overlapping each other
        assert res["parked"] == len(pl["unplaced"])
        assert res["parked_min_gap_to_artboard_pt"] > 28 and res["parked_overlaps"] == 0
        assert "unplaced -> moved right of the artboard" in Path(res["diagnosticsPath"]).read_text()
    assert res["coordinate_system"] == "CoordinateSystem.ARTBOARDCOORDINATESYSTEM"
    assert Path(res["diagnosticsPath"]).parent == d
    assert "result        : OK" in Path(res["diagnosticsPath"]).read_text()
    rotated = [p for p in pl["placements"] if p["rotation_deg"] % 360]
    if name == "09_rotation_1deg":
        assert rotated, "the rotation fixture must exercise rotation"


def test_unplaced_are_parked_right_of_a_wider_fabric(tmp_path):
    pl = _placement("01_LU_10")
    assert pl["placements"]
    pl["unplaced"].append({"id": pl["placements"][-1]["id"], "reason": "NO_SPACE_LEFT", "detail": "test"})
    pl["placements"].pop()
    ab = _scene("01_LU_10")["document"]["artboards"][0]["artboardRect"]
    extra_mm = 300.0
    pl["settings"]["material"]["sheet_width_mm"] = (ab[2] - ab[0]) * 25.4 / 72 + extra_mm
    res = _run(_job(tmp_path, "01_LU_10", pl), "--bundle", PANEL_BUNDLE, "--panel", pl["source"]["geometry_sha256"])
    assert res["status"] == "applied" and res["parked"] == 1, res
    assert res["parked_min_gap_to_artboard_pt"] > extra_mm * 72 / 25.4 + 28
    assert "(and of the fabric)" in res["message"]


def test_unplaced_are_parked_right_of_every_artboard(tmp_path):
    pl = _placement("01_LU_10")
    pl["unplaced"].append({"id": pl["placements"][-1]["id"], "reason": "NO_SPACE_LEFT", "detail": "test"})
    pl["placements"].pop()
    scene = _scene("01_LU_10")
    ab = scene["document"]["artboards"][0]["artboardRect"]
    scene["document"]["artboards"].append({"name": "Artboard 2", "artboardRect": [ab[2] + 100, ab[1], ab[2] + 900, ab[3]]})
    res = _run(_job(tmp_path, "01_LU_10", pl, scene=scene), "--bundle", PANEL_BUNDLE, "--panel", pl["source"]["geometry_sha256"])
    assert res["status"] == "applied" and res["parked"] == 1, res
    assert res["parked_min_gap_to_artboard_pt"] > 900 + 28    # not onto the second artboard's artwork


@pytest.mark.parametrize("fail_after", [None, 2, "clamp"])
def test_resize_artboard_to_fabric_and_nested_length(tmp_path, fail_after):
    pl = _placement("01_LU_10")
    ab = _scene("01_LU_10")["document"]["artboards"][0]["artboardRect"]
    pl["settings"]["material"]["sheet_width_mm"] = 700.0 if fail_after == "clamp" else 250.0   # artboard: 600 mm
    top = max(p["expected_bounds_mm"][3] for p in pl["placements"]) + pl["settings"]["margin_mm"]
    extra = ["--resize-artboard"] + (["--fail-after", fail_after] if fail_after == 2 else []) + \
        (["--artboard-max-pt", ab[2] - ab[0]] if fail_after == "clamp" else [])
    res = _run(_job(tmp_path, "01_LU_10", pl), *extra)
    got = res["artboard_rect_after"]
    if fail_after:   # a failure (in the groups, or Illustrator not taking the size) restores everything
        assert res["status"] == "rolled_back" and got == ab, res
        assert res["max_doc_change_pt"] < 0.02
        if fail_after == "clamp":
            assert "resizing the artboard is off by" in res["problems"][0]
        return
    assert res["status"] == "applied", res
    pt = 72 / 25.4
    want = [ab[0], ab[3] + top * pt, ab[0] + 250 * pt, ab[3]]   # bottom-left corner kept
    assert max(abs(a - b) for a, b in zip(got, want)) < 1e-6
    assert res["artboard_mm"][0] == pytest.approx(250.0) and res["artboard_mm"][1] == pytest.approx(top)


def test_nest_from_the_top_right_and_resize_cuts_the_empty_bottom(tmp_path):
    doc, sha = load_geometry(str(GEOM / "01_LU_10.geometry.json"))
    pl = nest_document(doc, sha, {"optimization": {"quality": "fast", "time_limit_s": 3, "start_corner": "top_right"}})
    assert pl["status"] == "complete"
    ab = _scene("01_LU_10")["document"]["artboards"][0]["artboardRect"]
    pt = 72 / 25.4
    W, H = (ab[2] - ab[0]) / pt, (ab[1] - ab[3]) / pt
    m = pl["settings"]["margin_mm"]
    eb = [p["expected_bounds_mm"] for p in pl["placements"]]
    assert max(b[3] for b in eb) == pytest.approx(H - m, abs=0.01)    # packed against the top...
    assert max(b[2] for b in eb) == pytest.approx(W - m, abs=0.01)    # ...and the right edge
    bottom = min(b[1] for b in eb)
    assert pl["metrics"]["used_length_mm"] == pytest.approx(H - m - bottom, abs=0.01)
    res = _run(_job(tmp_path, "01_LU_10", pl), "--resize-artboard")
    assert res["status"] == "applied", res
    want = [ab[0], ab[1], ab[2], ab[3] + (bottom - m) * pt]             # same top, empty bottom cut off
    assert max(abs(a - b) for a, b in zip(res["artboard_rect_after"], want)) < 0.01


def test_roll_from_the_top_grows_downward_and_resize_follows(tmp_path):
    doc, sha = load_geometry(str(GEOM / "01_LU_10.geometry.json"))
    pl = nest_document(doc, sha, {"material": {"mode": "roll", "sheet_width_mm": 200.0},
                                  "optimization": {"quality": "fast", "time_limit_s": 3, "start_corner": "top_left"}})
    assert pl["status"] == "complete" and pl["verification"]["ok"]
    ab = _scene("01_LU_10")["document"]["artboards"][0]["artboardRect"]
    pt = 72 / 25.4
    H, m = (ab[1] - ab[3]) / pt, pl["settings"]["margin_mm"]
    eb = [p["expected_bounds_mm"] for p in pl["placements"]]
    bottom = min(b[1] for b in eb)
    assert max(b[3] for b in eb) == pytest.approx(H - m, abs=0.01)   # starts at the artboard top...
    assert bottom < 0                                                 # ...and runs below the artboard
    assert pl["metrics"]["used_length_mm"] == pytest.approx(H - m - bottom, abs=0.01)
    res = _run(_job(tmp_path, "01_LU_10", pl), "--resize-artboard")
    assert res["status"] == "applied", res
    want = [ab[0], ab[1], ab[0] + 200 * pt, ab[3] + (bottom - m) * pt]   # same top, grown downward
    assert max(abs(a - b) for a, b in zip(res["artboard_rect_after"], want)) < 0.01


def test_panel_apply_checks_geometry_sha(tmp_path):
    pl = _placement("01_LU_10")
    d = _job(tmp_path, "01_LU_10", pl)
    ok = _run(d, "--bundle", PANEL_BUNDLE, "--panel", pl["source"]["geometry_sha256"])
    assert ok["status"] == "applied" and "Moved" in ok["message"]
    (tmp_path / "x").mkdir()
    d2 = _job(tmp_path / "x", "01_LU_10", pl)
    bad = _run(d2, "--bundle", PANEL_BUNDLE, "--panel", "0" * 64)
    assert bad["status"] == "refused" and any("sha256" in p for p in bad["problems"])
    assert "was not changed" in bad["message"]
    _assert_untouched(bad)


@pytest.mark.parametrize("fail_after", [1, 4])
def test_failure_mid_apply_restores_everything(tmp_path, fail_after):
    pl = _placement("09_rotation_1deg")
    d = _job(tmp_path, "09_rotation_1deg", pl)
    res = _run(d, "--fail-after", fail_after)
    assert res["status"] == "rolled_back", res
    assert res["rollback"]["restored"] == fail_after and not res["rollback"]["failed"]
    assert "result        : NOT APPLIED (rolled_back)" in Path(res["diagnosticsPath"]).read_text()
    assert res["max_doc_change_pt"] < 0.02
    assert res["coordinate_system"] == "CoordinateSystem.ARTBOARDCOORDINATESYSTEM"


def _scene_group(scene, uuid):
    return next(g for g in scene["selection"] if g.get("uuid") == uuid)


def test_dom_error_in_rotate_rolls_back(tmp_path):
    pl = _placement("09_rotation_1deg")
    rot = [p for p in pl["placements"] if abs(p["rotation_deg"]) > 1e-9]
    assert len(rot) >= 2 and pl["placements"][0] is not rot[-1]
    sc = _scene("09_rotation_1deg")
    _scene_group(sc, rot[-1]["uuid"])["throwOnRotate"] = True
    res = _run(_job(tmp_path, "09_rotation_1deg", pl, scene=sc))
    assert res["status"] == "rolled_back", res
    assert "mock DOM failure in rotate" in res["problems"][0]
    assert res["max_doc_change_pt"] < 0.02


def test_wrong_translate_is_caught_by_tracker_check(tmp_path):
    pl = _placement("01_LU_10")
    sc = _scene("01_LU_10")
    _scene_group(sc, pl["placements"][2]["uuid"])["translateGain"] = 0.5
    res = _run(_job(tmp_path, "01_LU_10", pl, scene=sc))
    # the faulty group cannot be restored by the same faulty translate: reported as such, not hidden
    assert res["status"] == "rollback_failed", res
    assert "tracker points are off" in res["problems"][0]
    assert res["rollback"]["restored"] == 2 and len(res["rollback"]["failed"]) == 1


def _shift_points(node, dx):
    if node.get("pathPoints"):
        node["pathPoints"] = [[p[0] + dx, p[1], p[2] + dx, p[3], p[4] + dx, p[5]] for p in node["pathPoints"]]
    for c in node.get("pageItems", []) + node.get("pathItems", []):
        _shift_points(c, dx)


def _refusal(tmp_path, name="01_LU_10", placement=None, scene=None, geometry=None):
    res = _run(_job(tmp_path, name, placement if placement is not None else _placement(name), scene, geometry))
    assert res["status"] == "refused", res
    assert res["applied"] == 0
    _assert_untouched(res)
    return " | ".join(res["problems"])


def test_refuses_when_group_moved_after_export(tmp_path):
    pl = _placement("01_LU_10")
    sc = _scene("01_LU_10")
    _shift_points(_scene_group(sc, pl["placements"][0]["uuid"]), 0.5)
    assert "moved or edited after" in _refusal(tmp_path, placement=pl, scene=sc)


def test_refuses_other_document(tmp_path):
    sc = _scene("01_LU_10")
    sc["document"]["name"] = "other.ai"
    assert "active document" in _refusal(tmp_path, scene=sc)


def test_refuses_changed_artboard(tmp_path):
    sc = _scene("01_LU_10")
    sc["document"]["artboards"][0]["artboardRect"][2] += 10
    assert "artboard" in _refusal(tmp_path, scene=sc)


def test_refuses_unverified_placement(tmp_path):
    pl = _placement("01_LU_10")
    pl["verification"]["ok"] = False
    assert "verification.ok" in _refusal(tmp_path, placement=pl)


def test_refuses_mirror(tmp_path):
    pl = _placement("01_LU_10")
    pl["placements"][1]["mirror"] = True
    assert "mirror" in _refusal(tmp_path, placement=pl)


def test_refuses_inconsistent_matrix(tmp_path):
    pl = _placement("01_LU_10")
    pl["placements"][1]["target_pt"][0] += 3
    assert "matrix does not match" in _refusal(tmp_path, placement=pl)


def test_refuses_missing_group(tmp_path):
    pl = _placement("01_LU_10")
    sc = _scene("01_LU_10")
    sc["selection"] = [g for g in sc["selection"] if g.get("uuid") != pl["placements"][0]["uuid"]]
    assert "group not found" in _refusal(tmp_path, placement=pl, scene=sc)


def test_refuses_locked_layer(tmp_path):
    sc = _scene("01_LU_10")
    sc["document"]["layerLocked"] = True
    assert "is locked" in _refusal(tmp_path, scene=sc)


def test_refuses_group_without_two_trackers(tmp_path):
    geo = json.loads((GEOM / "01_LU_10.geometry.json").read_text())
    pl = _placement("01_LU_10")
    g = next(x for x in geo["groups"] if x["id"] == pl["placements"][0]["id"])
    g["trackers"] = g["trackers"][:1]
    assert "fewer than 2 vector anchor" in _refusal(tmp_path, placement=pl, geometry=geo)


@pytest.mark.parametrize("fail_after", [None, 3])
def test_check_apply_tool_confirms_mock_runs(tmp_path, fail_after):
    """tools/check_apply.py (used on real Illustrator) agrees with the mock: placed groups moved rigidly,
    after a rollback nothing moved; and it fails when given the wrong expectation."""
    pl = _placement("03_bezier_40")
    d = _job(tmp_path, "03_bezier_40", pl)
    extra = ["--export-after", d / "after.json"] + (["--fail-after", fail_after] if fail_after else [])
    res = _run(d, *extra)
    assert res["status"] == ("rolled_back" if fail_after else "applied")
    check = [sys.executable, str(ROOT / "tools/check_apply.py"), str(d / "geometry.json"), str(d / "after.json")]
    good = check + ([] if fail_after else [str(d / "placement.json")])
    wrong = check + ([str(d / "placement.json")] if fail_after else [])
    r = subprocess.run(good, capture_output=True, text=True)
    assert r.returncode == 0 and "-> OK" in r.stdout, r.stdout + r.stderr
    r = subprocess.run(wrong, capture_output=True, text=True)
    assert r.returncode == 1 and "-> FAIL" in r.stdout

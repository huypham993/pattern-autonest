"""End-to-end Phase 2 checks on the 10 fixture scenes.

scene (mock Illustrator DOM) --JSX extractor (Node)--> geometry.json --engine--> analysis
"""
import json
import math
import shutil
import subprocess
from pathlib import Path

import pytest

from autonest.analyze import analyze_document
from autonest.contract import load_geometry
from autonest.transform import apply_matrix, invert_matrix, to_illustrator_matrix

ROOT = Path(__file__).resolve().parents[1]
GEOM = ROOT / "fixtures" / "geometry"
SCENES = ROOT / "fixtures" / "scenes"
NAMES = sorted(p.name[: -len(".expect.json")] for p in GEOM.glob("*.expect.json"))

try:
    import jsonschema
except ImportError:  # optional dev dependency
    jsonschema = None


def _analysis(name):
    doc, sha = load_geometry(GEOM / f"{name}.geometry.json")
    return analyze_document(doc, sha)


@pytest.mark.parametrize("name", NAMES)
def test_fixture_expectations(name):
    expect = json.loads((GEOM / f"{name}.expect.json").read_text(encoding="utf-8"))
    res = _analysis(name)
    parts = {p["id"]: p for p in res["parts"]}
    assert set(parts) == set(expect["groups"])
    for gid, ex in expect["groups"].items():
        p = parts[gid]
        codes = {i["code"] for i in p["issues"]}
        ctx = f"{name}/{gid} ({ex.get('name')}): status={p['status']} codes={sorted(codes)}"
        if "status" in ex:
            assert p["status"] == ex["status"], ctx
        for c in ex.get("codes", []):
            assert c in codes, ctx
        if "source" in ex:
            assert p["source"] == ex["source"], ctx
        if "has_curves" in ex:
            assert p["has_curves"] == ex["has_curves"], ctx
        if "area_mm2" in ex:
            assert p["metrics"]["area_mm2"] == pytest.approx(ex["area_mm2"], rel=1e-6), ctx
        assert p["name"] == ex["name"]
    gcodes = {i["code"] for i in res["issues"]}
    for c in expect["global"].get("codes", []):
        assert c in gcodes
    if "skipped_selection" in expect["global"]:
        assert res["summary"]["skipped_selection"] == expect["global"]["skipped_selection"]


@pytest.mark.parametrize("name", NAMES)
def test_silhouettes_inside_frame_and_valid(name):
    """Every nestable silhouette is a valid polygon in the artboard mm frame
    (offset artboards included) and never larger than its bounding box."""
    from autonest import regions
    res = _analysis(name)
    W, H = res["frame"]["artboard_mm"][2:]
    for p in res["parts"]:
        if p["status"] == "error" or not p["silhouette"]:
            continue
        g = regions.geometry_from_json(p["silhouette"])
        assert g.is_valid and g.area > 0
        minx, miny, maxx, maxy = g.bounds
        assert -50 < minx and maxx < W + 800 and -50 < miny and maxy < H + 50, (name, p["id"], g.bounds)
        assert p["metrics"]["area_mm2"] <= p["metrics"]["bbox_area_mm2"] + 1e-6


def test_true_shape_smaller_than_bbox_on_concave_sets():
    # sanity of the *input* to nesting: concave sets carry much less area than their boxes
    for name in ("01_LU_10", "02_concave_20"):
        assert _analysis(name)["summary"]["silhouette_to_bbox_ratio"] < 0.6


def test_offset_artboard_matches_reference_scene():
    """Same shapes on an artboard at a large negative offset map to the same mm frame."""
    res = _analysis("08_offset_artboard")
    scene = json.loads((SCENES / "08_offset_artboard.scene.json").read_text())
    L, T, R, B = scene["document"]["artboards"][0]["artboardRect"]
    assert L < -10000 and T > 8000
    assert res["frame"]["artboard_mm"] == pytest.approx([0, 0, 900, 600], abs=1e-3)
    for p in res["parts"]:
        x0, y0, x1, y1 = p["metrics"]["bbox_mm"]
        assert 0 < x0 < x1 < 900 and 0 < y0 < y1 < 600


NODE = shutil.which("node")


@pytest.mark.skipif(NODE is None, reason="node not installed")
@pytest.mark.parametrize("name", NAMES)
def test_jsx_extractor_reproduces_fixture(name, tmp_path):
    """Re-run the real JSX extraction code (mock DOM) and compare with the committed geometry."""
    out = tmp_path / "g.json"
    subprocess.run([NODE, str(ROOT / "tests/jsx_harness/run_extract.js"),
                    str(SCENES / f"{name}.scene.json"), str(out)], check=True, capture_output=True)
    assert json.loads(out.read_text()) == json.loads((GEOM / f"{name}.geometry.json").read_text())


@pytest.mark.skipif(NODE is None, reason="node not installed")
def test_jsx_json_codec():
    r = subprocess.run([NODE, str(ROOT / "tests/jsx_harness/run_extract.js"), "--json-selftest"],
                       capture_output=True, text=True)
    assert r.returncode == 0, r.stdout + r.stderr


# ------------------------------------------------------------- contract
def _schema(name):
    return json.loads((ROOT / "schema" / name).read_text())


@pytest.mark.skipif(jsonschema is None, reason="jsonschema not installed")
@pytest.mark.parametrize("name", NAMES)
def test_geometry_and_analysis_match_schema(name):
    jsonschema.validate(json.loads((GEOM / f"{name}.geometry.json").read_text()), _schema("geometry.schema.json"))
    jsonschema.validate(_analysis(name), _schema("analysis.schema.json"))


@pytest.mark.skipif(jsonschema is None, reason="jsonschema not installed")
def test_samples_match_schema():
    s = ROOT / "samples"
    jsonschema.validate(json.loads((s / "sample_geometry.json").read_text()), _schema("geometry.schema.json"))
    jsonschema.validate(json.loads((s / "sample_analysis.json").read_text()), _schema("analysis.schema.json"))
    placement = json.loads((s / "sample_placement.json").read_text())
    jsonschema.validate(placement, _schema("placement.schema.json"))
    for pl in placement["placements"]:
        m = to_illustrator_matrix(pl["pivot_pt"], pl["target_pt"], pl["rotation_deg"], pl["mirror"])
        assert m == pytest.approx(pl["matrix"], abs=1e-6)


def test_transform_convention():
    m = to_illustrator_matrix((10, 20), (110, 220), 90)
    assert apply_matrix(m, (10, 20)) == pytest.approx((110, 220))
    assert apply_matrix(m, (11, 20)) == pytest.approx((110, 221))  # +x rotates to +y (CCW, y up)
    mm = to_illustrator_matrix((0, 0), (0, 0), 0, mirror=True)
    assert apply_matrix(mm, (5, 3)) == pytest.approx((-5, 3))
    inv = invert_matrix(m)
    for p in [(0, 0), (123.4, -56.7)]:
        assert apply_matrix(inv, apply_matrix(m, p)) == pytest.approx(p)
    a, b, c, d = m[:4]
    assert a * d - b * c == pytest.approx(1.0)  # rigid: no scaling
    assert math.hypot(a, b) == pytest.approx(1.0)

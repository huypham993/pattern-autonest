"""Place labels (jsx/lib/an_labels.jsxinc) in the live mock DOM: pairing, edge choice, gap, rotation, re-run, undo,
resize and grouping, in selection mode and in layer mode (a pattern export with PatternNumber / OffsetLine layers).

Proves the logic only; Illustrator's text bounds and rotate behaviour still need a run on a real document.
"""
import json
import math
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
NODE = shutil.which("node")
pytestmark = pytest.mark.skipif(NODE is None, reason="node not installed")


def _run(*args):
    r = subprocess.run([NODE, "tests/jsx_harness/run_labels.js", *args], cwd=ROOT, capture_output=True, text=True)
    assert r.returncode == 0, r.stdout + r.stderr
    return json.loads(r.stdout.strip().splitlines()[-1])


@pytest.mark.parametrize("bundle", [None, "dist/AutoNesting_PanelHost.jsx", "dist/AutoNesting_PlaceLabels_Standalone.jsx"])
def test_place_labels(bundle):
    out = _run(*([bundle] if bundle else []))
    first = out["first"]
    assert first["status"] == "done" and first["placed"] == 2 and first["pieces"] == 2
    assert [n["reason"] for n in first["not_placed"]] == ["no piece near it"]
    assert out["message"].startswith("1 label was not placed")
    # a progress palette shows each step while the script runs, and closes at the end
    assert out["progress_ui"] == ["new palette AutoNesting: Place labels", "shown", "Reading cut lines... | Step 1 of 2      s",
                                  "Placing labels: 0 / 3 | Step 2 of 2      s", "close"]
    assert out["progress_file"] == {"writes": [{"value": 0, "total": 200, "text": "Reading cut lines...", "sub": "Step 1 of 2"},
                                               {"value": 100, "total": 200, "text": "Placing labels: 0 / 3", "sub": "Step 2 of 2"}],
                                    "left": False}
    # outlined label (upright reference 180) under the 20 degree edge: turned by 20, 0.5 mm + half its height below
    assert out["before"]["lab1_angle"] == 180 and out["after"]["lab1_angle"] == -160
    mm = 72 / 25.4
    x, y = out["after"]["lab1"]
    n = (x - 100) * math.sin(math.radians(20)) - (y - 100) * math.cos(math.radians(20))
    assert abs(n - (0.5 + 2) * mm) < 0.01
    assert out["after"]["lab2_angle"] == -20          # 160 degree edge, read the right way up
    assert out["after"]["far"] == out["before"]["far"]
    assert out["after_again"] == out["after"]         # running twice changes nothing
    assert out["failed"]["status"] == "rolled_back" and out["after_fail_same"]
    assert out["inside"] == "done" and out["after_inside"]["lab1"] != out["after"]["lab1"]
    assert out["coordinate_system"] == "CoordinateSystem.ARTBOARDCOORDINATESYSTEM"
    assert out["nothing"].startswith("Select the pieces")
    assert out["text_tagged"]                          # text labels are marked too, so grouped ones are found again
    assert out["single"] == {"first": "done", "second": "done", "same": True, "turned": True}   # one-path label
    arc = out["arc"]
    assert arc["placed"] == arc["tried"] and arc["inside_hits"] == 0 and arc["upside_down"] == 0
    assert 0.499 < arc["min_gap"] and arc["max_gap"] < 0.75
    assert 0.49 < arc["circle_gap_mm"] < 0.6                         # gap to the true curve, not to the chords
    assert 239.2 < arc["bulge_max_x"] <= 239.44                       # handles beyond an anchor: curve kept (max 239.43)

    sv = out["svg"]
    assert sv["count"] == 6 and sv["bad"] == [None, None, None]
    assert sv["path"] == [[100, 100, 100, 100, 110, 100], [120, 120, 120, 110, 120, 130], [100, 140, 110, 140, 100, 140],
                          [80, 140, 80, 140, 80, 140], [80, 100, 80, 100, 80, 100]]
    assert sv["closed_curve"] == [[0, 0, 5, 5, 1, 1], [3, 3, 2, 2, 4, 4]]
    assert sv["aligned_first"] == [[37.5, 499.5] * 3, [47, 498] * 3, [40, 496] * 3]
    assert sv["aligned_curve"] == [157, 380, 157, 390, 157, 370]          # y flipped, handles too
    assert sv["misaligned"] is None and sv["wrong_count"] is None

    part = out["partial"]
    assert part["layer"]["grouped"] == 1 and len(part["layer"]["group_errors"]) == 2
    errs = " | ".join(part["layer"]["group_errors"])
    assert "not selected" in errs and "cut line is locked" in errs and part["layer_selected"] == [True]
    assert part["locked_label_stays"]
    assert "2 pieces were not grouped" in part["layer_message"]       # the panel shows grouping errors
    assert part["pair"]["grouped"] == 0 and len(part["pair"]["group_errors"]) == 1 and part["pair_same"]
    assert part["pair_selection"] == 0
    assert part["untagged"]["grouped"] == 0 and len(part["untagged"]["group_errors"]) == 1 and part["untagged_label_kept"]
    assert part["resize"] == "rolled_back" and part["resize_same"]   # a refused resize is not undone
    assert part["hidden"] == 0

    lay = out["layers"]
    assert lay["first"]["status"] == "done" and lay["first"]["placed"] == 1 and lay["first"]["grouped"] == 1
    assert lay["first_selected"] == 1                                 # one label selected: one piece grouped
    assert lay["rest"]["status"] == "done" and lay["rest"]["placed"] == 1 and lay["rest"]["grouped"] == 1
    assert lay["rest"]["labels"] == 1 and lay["locked_and_hidden_stay"]
    assert lay["locked"] == [True, True, True, True, False]          # locked layers locked again
    g1, g2 = lay["groups"]
    assert sorted(g1["members"]) == ["cut", "image", "label", "mark", "notch"] and g1["members"][0] == "label"
    assert g1["members"][-1] == "image" and g2["members"] == ["label", "cut", "notch", "image"]
    assert g1["layer"] == g2["layer"] == "PatternNumber" and g2["in_selection"]
    assert g1["piece_tag"] and g2["piece_tag"]                        # a re-run knows them by one tag read
    assert out["grouped_piece"] == [True, True, False, False]
    assert lay["frame_stays"]                                         # a frame around both pieces is no part
    assert lay["containers_left"] == [0, 1, 0, 2, 1]                  # emptied containers removed (Notch keeps the locked one)
    # 5 mm high, along the left edge (x = 100 pt) next to the bottom-left corner, reading upwards
    for g, x in ((g1, 100), (g2, 400)):
        assert g["size_mm"][0] == 5 and g["angle"] == 90
        assert abs(x - g["center"][0] - 3 * mm) < 0.01 and g["center"][1] < 100 + 20 * mm
    assert lay["second"]["status"] == "done" and lay["second"]["placed"] == 2 and lay["second"]["grouped"] == 0
    assert abs(g1["center"][0] - lay["second_centers"][0][0] - 0.5 * mm) < 0.01   # gap 0.5 -> 1 mm
    if "Standalone" in str(bundle):
        assert "panel" not in lay
        return
    assert lay["panel"]["status"] == "done" and lay["panel"]["placed"] == 2 and lay["panel"]["message"] == ""
    for (x, y), right in zip(lay["panel_centers"], (200, 500)):       # next to each piece's top right corner (y 400)
        assert math.hypot(x - right, y - 400) < 20 * mm
    assert lay["bad_corner"]["status"] == "error" and "middle" in lay["bad_corner"]["message"]
    # Place labels then Group pieces, as two buttons: the same labels and groups as one run with grouping, placing
    # groups nothing and grouping moves no label
    spl = out["layers_split"]
    assert spl["split"] == [{"place_grouped": False, "moved": False}] * 3
    for k in ("first", "rest", "second"):
        assert {f: spl[k][f] for f in ("status", "placed", "grouped", "labels")} == {f: lay[k][f] for f in ("status", "placed", "grouped", "labels")}
    for k in ("first_selected", "groups", "second_centers", "locked", "containers_left", "frame_stays", "locked_and_hidden_stay"):
        assert spl[k] == lay[k], k
    sp = out["split_pair"]
    assert sp["place"]["status"] == "done" and sp["place"]["placed"] == 1 and sp["place"]["grouped"] == 0 and not sp["place_grouped"]
    assert sp["group"]["status"] == "done" and sp["group"]["placed"] == 0 and sp["group"]["grouped"] == 1
    assert not sp["moved"] and sp["together"]
    assert sp["steps"] == ["Reading cut lines... | Step 1 of 2", "Grouping pieces... | Step 2 of 2", "Grouping pieces: 0 / 1 | Step 2 of 2"]
    assert sp["again"]["grouped"] == 0 and sp["again"]["group_errors"] == [] and sp["again_same"]
    gd = out["group_distance"]
    assert gd["short"]["grouped"] == 0 and gd["short"]["group_errors"][0].endswith(": no piece within 1 mm") and gd["short_kept"]
    assert gd["run"]["grouped"] == 2 and gd["grouped"] == [True, True] and gd["left"] == [False] * 4
    assert sorted(e.split(": ", 1)[1] for e in gd["run"]["group_errors"]) == [
        "2 labels near the same piece", "2 labels near the same piece", "near 2 pieces", "no label, not grouped",
        "no label, not grouped", "no label, not grouped", "no piece within 2 mm"]   # pieces A, B, C have no label
    assert gd["bad"]["status"] == "error" and "Piece spacing" in gd["bad"]["error"]
    ins = out["inside_piece"]
    assert ins["place"]["placed"] == 1 and [n["reason"] for n in ins["place"]["not_placed"]] == ["another label is inside the same piece"]
    assert ins["l2_still_inside"]
    assert ins["group"]["grouped"] == 1 and ins["l3_with_C"]
    assert [e.split(": ", 1)[1] for e in ins["group"]["group_errors"]] == ["no label, not grouped"]   # D
    c5 = out["mixed5"]
    assert c5["frame_run"]["grouped"] == 2 and c5["frame_stays"]
    assert c5["first"]["grouped"] == 1
    assert c5["occupied"]["grouped"] == 0 and [e.split(": ", 1)[1] for e in c5["occupied"]["group_errors"]] == ["its piece already has a label", "no label, not grouped"]   # B
    assert c5["extra_alone"] and c5["occupied_place"] == ["its piece already has a label"]
    errs = sorted(e.split(": ", 1)[1] for e in c5["two"]["group_errors"])
    assert c5["two"]["grouped"] == 0 and errs == ["2 labels near the same piece", "2 labels near the same piece", "no label, not grouped"]
    assert c5["two_cut_stays"] and c5["two_selected"] == 0
    assert c5["untagged_first"] == 1 and c5["tagged"] and c5["again"] == [1, 1, 0, 0]
    assert c5["sel"]["grouped"] == 1 and [e.split(": ", 1)[1] for e in c5["sel"]["group_errors"]] == ["no label, not grouped"]
    assert c5["raster_tag"] == ["none"] and c5["raster_again"] == [1, 1, 0, 0]
    po = out["parts_out"]
    assert po["run"]["grouped"] == 2 and po["with_piece"] == [True, True, False] and po["label_with_piece"]
    assert po["cluster"] == [True, True]

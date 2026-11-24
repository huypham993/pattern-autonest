"""CEP panel logic (panel/js/core.js) and the panel's Nest -> Apply flow, run in Node without CEP.

Proves the panel's logic, the engine command line and the host-script calls; NOT that the panel loads in
Illustrator (that needs a manual check in Illustrator).
"""
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
NODE = shutil.which("node")
pytestmark = pytest.mark.skipif(NODE is None, reason="node not installed")
ENV = dict(os.environ, AUTONEST_ENGINE_CMD=json.dumps([sys.executable, str(ROOT / "engine/nest_engine.py")]))


def _node(code, env=ENV):
    r = subprocess.run([NODE, "-e", code], cwd=ROOT, capture_output=True, text=True, env=env)
    assert r.returncode == 0, r.stdout + r.stderr
    return json.loads(r.stdout.strip().splitlines()[-1])


@pytest.mark.parametrize("scene", ["01_LU_10", "09_rotation_1deg"])
def test_panel_flow_export_nest_apply(tmp_path, scene):
    r = subprocess.run([NODE, "tests/jsx_harness/run_panel_flow.js", f"fixtures/scenes/{scene}.scene.json", str(tmp_path)],
                       cwd=ROOT, capture_output=True, text=True, env=ENV)
    assert r.returncode == 0, r.stderr
    out = json.loads(r.stdout.strip().splitlines()[-1])
    assert "error" not in out, out
    assert out["export"]["status"] == "ok" and Path(out["export"]["geometryPath"]).parent == tmp_path / "AutoNesting"
    assert out["nest"]["code"] in (0, 4) and out["nest"]["svg"]
    assert out["apply"]["status"] == "applied", out["apply"]
    assert out["apply"]["applied"] == out["nest"]["summary"]["placed"] > 0
    assert out["apply"]["message"].startswith("Moved ")
    assert out["export_file_same"] and out["apply_file_same"]     # reply-file fallback carries the same text
    # progress for the panel: one entry per group, counting up to the total, file removed at the end
    for k, n in (("export", out["export"]["groups"]), ("apply", out["apply"]["applied"])):
        p = out[k + "_progress"]
        assert [e["value"] for e in p] == list(range(1, len(p) + 1)) and len(p) >= n and {e["total"] for e in p} == {len(p)}
        assert p[-1]["text"] and not out[k + "_progress_left"]
    assert out["recheck"] == "unchanged"            # re-nest of the same selection skips the export
    assert out["inner_edit"] == {"bounds_same": True, "seen": True, "undone": True}   # reshape inside the bounds
    assert out["after_apply_check"] == "ok"         # groups moved by Apply: exported again
    assert out["coordinate_system"] == "CoordinateSystem.ARTBOARDCOORDINATESYSTEM"


def test_engine_command_and_settings_args():
    out = _node("""
var core = require('./panel/js/core.js');
var missing = null;
try { core.engineCommand('/nowhere', {}); } catch (e) { missing = e.message; }
console.log(JSON.stringify({
  missing: missing,
  args: core.settingsArgs({sheet_width_mm: '1500', sheet_length_mm: '', spacing_mm: '3', margin_mm: '', rotation_preset: 'step', rotation_step_deg: '15',
                           quality: 'balanced', time_limit_s: '20'}),
  fixed: core.settingsArgs({rotation_preset: 'fixed', rotation_step_deg: '15'}),
  grain: core.settingsArgs({rotation_preset: '0_180', grain_tolerance_deg: '3', rotation_step_deg: '1'}),
  grain0: core.settingsArgs({rotation_preset: '0_180', grain_tolerance_deg: '0', rotation_step_deg: '1'}),
  roll: core.settingsArgs({sheet_width_mm: '1400', sheet_length_mm: '800', extend_length: true}),
  corner: core.settingsArgs({start_corner: 'top_right'})
}));""", env={"PATH": os.environ["PATH"]})
    assert "Nesting engine not found" in out["missing"]
    assert out["args"] == ["--sheet-width", "1500", "--spacing", "3", "--rotation-preset", "step", "--rotation-step", "15",
                           "--quality", "balanced", "--time-limit", "20"]
    assert out["fixed"] == ["--rotation-preset", "fixed"]
    assert out["grain"] == ["--rotation-preset", "0_180", "--grain-tolerance", "3", "--rotation-step", "1"]
    assert out["grain0"] == ["--rotation-preset", "0_180"]
    assert out["roll"] == ["--sheet-width", "1400", "--material", "roll", "--sheet-length", "800"]
    assert out["corner"] == ["--start-corner", "top_right"]


def test_host_call_text_is_es3_and_round_trips():
    out = _node("""
var core = require('./panel/js/core.js');
var S = require('./tools/build/jsx_static');
var p = 'D:\\\\\\u4F5C\\u696D\\\\job "A"\\u2028.json';
var call = core.jsxCall('f', [p, 'abc']);
var got = null;
new Function('f', call)(function (a, b) { got = [a, b]; });
var bad = [];
['', 'EvalScript error.', 'undefined'].forEach(function (t) { try { core.parseHostResult(t); } catch (e) { bad.push(t); } });
console.log(JSON.stringify({es3: S.parseES3(call).error, same: got[0] === p && got[1] === 'abc', bad: bad.length}));""")
    assert out == {"es3": None, "same": True, "bad": 3}

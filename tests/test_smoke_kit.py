"""Windows smoke-test kit: JSX smoke script (mock DOM) -> tools/check_smoke.py (real engine).

This proves the two halves of the kit agree on file names and formats.  The geometry
comes from the mock DOM, so it is NOT evidence about real Illustrator behaviour.
"""
import json
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
NODE = shutil.which("node")


@pytest.mark.skipif(NODE is None or not (ROOT / "node_modules" / "acorn").exists(), reason="node/acorn missing")
def test_smoke_bundle_then_python_check(tmp_path):
    r = subprocess.run([NODE, str(ROOT / "tests/jsx_harness/run_extract.js"), "--smoke", "--bundle",
                        str(ROOT / "dist/AutoNesting_SmokeTest_Standalone.jsx"), "--docs", str(tmp_path)],
                       capture_output=True, text=True)
    assert r.returncode == 0, r.stdout + r.stderr
    folder = tmp_path / "AutoNesting_SmokeTest"
    assert (folder / "geometry.json").exists() and (folder / "smoke_expected.json").exists()
    r = subprocess.run([sys.executable, str(ROOT / "tools/check_smoke.py"), str(folder)], capture_output=True, text=True)
    assert r.returncode == 0, r.stdout + r.stderr
    report = (folder / "smoke_check_report.txt").read_text(encoding="utf-8")
    assert "FAIL 0" in report and "PASS S06" in report
    placement = json.loads((folder / "placement.json").read_text(encoding="utf-8"))
    assert placement["status"] == "complete" and placement["verification"]["ok"]
    assert (folder / "placement.svg").exists() and (folder / "analysis.svg").exists()


def test_check_smoke_missing_folder(tmp_path):
    r = subprocess.run([sys.executable, str(ROOT / "tools/check_smoke.py"), str(tmp_path)], capture_output=True, text=True)
    assert r.returncode == 2


def test_check_smoke_detects_wrong_geometry(tmp_path):
    """A wrong expected bbox must fail the check (the checker is not a rubber stamp)."""
    if NODE is None or not (ROOT / "node_modules" / "acorn").exists():
        pytest.skip("node/acorn missing")
    subprocess.run([NODE, str(ROOT / "tests/jsx_harness/run_extract.js"), "--smoke", "--docs", str(tmp_path)],
                   capture_output=True, text=True, check=True)
    folder = tmp_path / "AutoNesting_SmokeTest"
    exp = json.loads((folder / "smoke_expected.json").read_text(encoding="utf-8"))
    exp["groups"][0]["bbox_mm"][0] += 0.5
    (folder / "smoke_expected.json").write_text(json.dumps(exp), encoding="utf-8")
    r = subprocess.run([sys.executable, str(ROOT / "tools/check_smoke.py"), str(folder)], capture_output=True, text=True)
    assert r.returncode == 1
    assert "FAIL S03.1" in r.stdout

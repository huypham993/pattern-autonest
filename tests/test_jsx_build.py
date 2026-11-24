"""Build pipeline + ExtendScript regression tests (Error 4, Error 48, main flow, smoke kit).

All JSX cases run the real ExtendScript code in Node with a mock Illustrator DOM.
They prove the JavaScript logic and the bundle; they are NOT a test of Adobe Illustrator.
"""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
NODE = shutil.which("node")
HAVE_ACORN = (ROOT / "node_modules" / "acorn").exists()
pytestmark = pytest.mark.skipif(NODE is None or not HAVE_ACORN,
                                reason="needs node + `npm install` (acorn) in the repository root")


def _cases():
    if NODE is None or not HAVE_ACORN:
        return []
    out = subprocess.run([NODE, "tests/jsx_harness/cases.js", "--list"], cwd=ROOT, capture_output=True, text=True)
    return out.stdout.split()


def test_build_check_dist_up_to_date():
    """Runs the whole build verification (source checks, bundle, ES3, segments, smoke, equivalence)
    and fails if dist/ differs from what the sources produce."""
    r = subprocess.run([NODE, "tools/build/build_jsx.js", "--check"], cwd=ROOT, capture_output=True, text=True)
    assert r.returncode == 0, r.stdout + r.stderr
    assert "dist/ is up to date" in r.stdout


@pytest.mark.parametrize("case", _cases())
def test_jsx_case(case):
    r = subprocess.run([NODE, "tests/jsx_harness/cases.js", case], cwd=ROOT, capture_output=True, text=True)
    assert r.returncode == 0, r.stdout + r.stderr
    assert json.loads(r.stdout.strip().splitlines()[-1])["ok"]


def _build_in_copy(tmp_path, mutate):
    root = tmp_path / "repo"
    shutil.copytree(ROOT / "jsx", root / "jsx")
    mutate(root)
    return subprocess.run([NODE, str(ROOT / "tools/build/build_jsx.js")], cwd=ROOT, capture_output=True, text=True,
                          env={"AN_BUILD_ROOT": str(root), "PATH": "/usr/bin:/bin"})


def test_error48_missing_dependency_fails_build(tmp_path):
    r = _build_in_copy(tmp_path, lambda root: (root / "jsx/lib/an_json.jsxinc").unlink())
    assert r.returncode == 1
    assert "missing dependency jsx/lib/an_json.jsxinc" in r.stderr and "Error 48" in r.stderr
    assert not (tmp_path / "repo/dist").exists()


def test_error4_raw_bom_fails_build(tmp_path):
    def inject(root):
        p = root / "jsx/lib/an_json.jsxinc"
        p.write_bytes(p.read_bytes().replace(b'"\\uFEFF"', '"﻿"'.encode("utf-8")))
    r = _build_in_copy(tmp_path, inject)
    assert r.returncode == 1
    assert "an_json.jsxinc:66" in r.stderr and "U+FEFF" in r.stderr


def test_syntax_error_fails_build(tmp_path):
    def inject(root):
        p = root / "jsx/lib/an_extract.jsxinc"
        p.write_text(p.read_text().replace('return { run: run', 'return { run: run,,'))
    r = _build_in_copy(tmp_path, inject)
    assert r.returncode == 1 and "ES3 syntax" in r.stderr


def test_undeclared_global_fails_build(tmp_path):
    def inject(root):
        p = root / "jsx/lib/an_main.jsxinc"
        p.write_text(p.read_text().replace("AN_JSON.stringify(geo)", "AN_JSONN.stringify(geo)"))
    r = _build_in_copy(tmp_path, inject)
    assert r.returncode == 1 and "undeclared global 'AN_JSONN'" in r.stderr

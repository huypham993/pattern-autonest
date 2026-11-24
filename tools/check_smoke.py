#!/usr/bin/env python3
"""Check the output of AutoNesting_SmokeTest_Standalone.jsx (run in real Illustrator).

    python tools/check_smoke.py [folder]

``folder`` defaults to ``Documents/AutoNesting_SmokeTest`` (OneDrive Documents is tried too).
It must contain ``geometry.json`` and ``smoke_expected.json`` written by the smoke script.

The check runs the real engine on the exported geometry and compares the result with
the known shapes the smoke script drew:

* analysis status: every group ok, no COORDINATE_MISMATCH / BOUNDS_MISMATCH;
* silhouette bounds within ``tolerance_mm`` (straight parts) or the curve tolerance (curved parts);
* silhouette area within 0.01 % (straight parts) or 2 % (curved parts, flattening error);
* nest + independent verification of the smoke groups (placement.json, placement.svg).

It writes ``smoke_check_report.txt``, ``analysis.json``, ``analysis.svg``, ``placement.json`` and
``placement.svg`` in the same folder.  Exit code 0 when every check passes, 1 otherwise,
2 when the input files are missing.
"""
from __future__ import annotations

import json
import os
import platform
import sys
import traceback
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "engine"))

from autonest.analyze import analyze_document  # noqa: E402
from autonest.contract import load_geometry  # noqa: E402
from autonest.svg import analysis_to_svg  # noqa: E402

AREA_REL_STRAIGHT = 1e-4
AREA_REL_CURVED = 0.02


def default_folder() -> Path | None:
    home = Path(os.environ.get("USERPROFILE") or Path.home())
    cands = [home / "Documents" / "AutoNesting_SmokeTest"]
    for env in ("OneDrive", "OneDriveConsumer", "OneDriveCommercial"):
        if os.environ.get(env):
            cands.append(Path(os.environ[env]) / "Documents" / "AutoNesting_SmokeTest")
    for c in cands:
        if (c / "geometry.json").exists():
            return c
    return None


class Report:
    def __init__(self) -> None:
        self.rows: list[str] = []
        self.failed = 0
        self.passed = 0

    def check(self, code: str, title: str, ok: bool, detail: str = "") -> bool:
        self.rows.append(f"{'PASS' if ok else 'FAIL'} {code:<6} {title}" + (f" : {detail}" if detail else ""))
        if ok:
            self.passed += 1
        else:
            self.failed += 1
        return ok

    def note(self, text: str) -> None:
        self.rows.append("     " + text)


def run(folder: Path) -> int:
    rep = Report()
    geo_path = folder / "geometry.json"
    exp_path = folder / "smoke_expected.json"
    if not geo_path.exists() or not exp_path.exists():
        print(f"[smoke-check] geometry.json / smoke_expected.json not found in {folder}", file=sys.stderr)
        return 2
    expected = json.loads(exp_path.read_text(encoding="utf-8"))
    tol_mm = float(expected.get("tolerance_mm", 0.01))

    doc, sha = load_geometry(geo_path)
    rep.note(f"geometry.json sha256={sha}")
    gen = doc.get("generator", {})
    rep.note(f"exported by {gen.get('name', '?')} {gen.get('version', '?')} "
             f"in Illustrator {gen.get('illustrator_version', '?')}")
    analysis = analyze_document(doc, sha)
    (folder / "analysis.json").write_text(json.dumps(analysis, ensure_ascii=False, indent=1), encoding="utf-8")
    (folder / "analysis.svg").write_text(analysis_to_svg(analysis), encoding="utf-8")
    curve_tol = float(analysis["settings"]["curve_tolerance_mm"])

    parts = {p["name"]: p for p in analysis["parts"]}
    rep.check("S01", "all smoke groups exported",
              all(g["name"] in parts for g in expected["groups"]) and len(parts) == len(expected["groups"]),
              f"exported={sorted(parts)}")
    bad_codes = {"COORDINATE_MISMATCH", "BOUNDS_MISMATCH"}
    for i, exp in enumerate(expected["groups"], 1):
        p = parts.get(exp["name"])
        if p is None:
            rep.check(f"S02.{i}", f"{exp['name']} analysed", False, "missing from geometry.json")
            continue
        codes = sorted({x["code"] for x in p["issues"] if x["severity"] != "info"})
        rep.check(f"S02.{i}", f"{exp['name']} status ok, no coordinate/bounds mismatch",
                  p["status"] == "ok" and not bad_codes.intersection(codes), f"status={p['status']} codes={codes}")
        curved = bool(exp.get("curved"))
        btol = curve_tol + tol_mm if curved else tol_mm
        got = p["metrics"]["bbox_mm"]
        d = max(abs(a - b) for a, b in zip(got, exp["bbox_mm"])) if got else float("inf")
        rep.check(f"S03.{i}", f"{exp['name']} silhouette bounds within {btol:g} mm", d <= btol,
                  f"got={got} expected={exp['bbox_mm']} max delta={d:.4f} mm")
        area = p["metrics"]["area_mm2"]
        rel = abs(area - exp["area_mm2"]) / exp["area_mm2"]
        atol = AREA_REL_CURVED if curved else AREA_REL_STRAIGHT
        rep.check(f"S04.{i}", f"{exp['name']} silhouette area within {atol * 100:g} %", rel <= atol,
                  f"got={area:.3f} expected={exp['area_mm2']:.3f} rel={rel * 100:.4f} %")

    # Full engine path on real Illustrator data: nest, then verify independently.
    try:
        from autonest.nest import nest_document
        from autonest.svg import placement_to_svg
        from autonest.verify import verify_placement
        placement = nest_document(doc, sha, {"optimization": {"time_limit_s": 30.0}})
        (folder / "placement.json").write_text(json.dumps(placement, ensure_ascii=False, indent=1), encoding="utf-8")
        ver = verify_placement(doc, placement)
        (folder / "placement.svg").write_text(placement_to_svg(doc, placement), encoding="utf-8")
        m = placement["metrics"]
        rep.check("S05", "nest places every smoke group", placement["status"] == "complete",
                  f"status={placement['status']} placed={m['placed']}/{m['total_groups']}")
        rep.check("S06", "independent verifier: no collision, spacing, boundary or rigidity violation",
                  ver["ok"], f"collisions={ver['collisions']} spacing={ver['spacing_violations']} "
                  f"boundary={ver['boundary_violations']} rigid={ver['rigidity_violations']} "
                  f"min_gap={ver['min_gap_mm']}")
    except Exception as e:  # report the failure in the file, do not hide it
        rep.check("S05", "nest + verify on smoke geometry", False, f"{type(e).__name__}: {e}")
        rep.note(traceback.format_exc().replace("\n", "\n     "))

    head = [
        "Illustrator Auto Nesting - smoke check (Python side)",
        f"folder: {folder}",
        f"python {platform.python_version()} on {platform.platform()}",
        "",
    ]
    tail = ["", f"PASS {rep.passed} / FAIL {rep.failed}",
            "geometry.json above was checked with the real engine (analyze, nest, independent verify).",
            "Send smoke_report.txt and smoke_check_report.txt back if anything FAILs."]
    text = "\n".join(head + rep.rows + tail) + "\n"
    (folder / "smoke_check_report.txt").write_text(text, encoding="utf-8")
    sys.stdout.write(text)
    return 0 if rep.failed == 0 else 1


def main(argv=None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    folder = Path(argv[0]) if argv else default_folder()
    if folder is None:
        print("[smoke-check] Documents\\AutoNesting_SmokeTest not found. Run AutoNesting_SmokeTest_Standalone.jsx "
              "in Illustrator first, or pass the folder as an argument.", file=sys.stderr)
        return 2
    if folder.is_file():
        folder = folder.parent
    return run(folder)


if __name__ == "__main__":
    sys.exit(main())

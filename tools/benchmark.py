#!/usr/bin/env python3
"""Benchmark: true-shape NFP solver vs. bounding-box MaxRects baseline.

    python tools/benchmark.py [--quality balanced] [--time-limit 30] [--out docs/benchmark]

Every layout (both solvers) is checked by the independent verifier; the table reports
what the verifier measured, not what the solver believes.  Scenarios:

* the 10 fixture scenes (geometry produced by the real JSX extractor on the mock DOM);
* synthetic sets built from millimetre polygons (tests/geomkit.py): interlocking L pairs,
  mixed concave parts on a sheet that cannot hold all of them, frames with holes + small parts.

Writes results.json, BENCHMARK.md and one SVG per layout in --out.
"""
from __future__ import annotations

import argparse
import json
import platform
import random
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "engine"))
sys.path.insert(0, str(ROOT / "tests"))

import geomkit as gk  # noqa: E402
import numpy  # noqa: E402
import pyclipper  # noqa: E402
import shapely  # noqa: E402
from autonest.baseline import baseline_document  # noqa: E402
from autonest.contract import load_geometry  # noqa: E402
from autonest.nest import nest_document  # noqa: E402
from autonest.svg import placement_to_svg  # noqa: E402


def synthetic():
    out = []
    # 1. 12 L shapes (interlocking pairs) on a 420 x 300 sheet
    groups = [gk.group(f"L{i:02d}", [gk.translate(gk.L_shape(100, 100, 30), 1000 + 150 * i, 0)]) for i in range(12)]
    out.append(("S1_L_pairs_12", gk.document(420, 300, groups, spacing_mm=5.0, margin_mm=10.0,
                                              rotation={"preset": "0_90_180_270"})))
    # 2. 40 mixed concave parts, sheet too small for all of them
    rng = random.Random(11)
    groups = []
    for i in range(40):
        k = i % 5
        if k == 0:
            ring = gk.L_shape(rng.uniform(50, 90), rng.uniform(50, 90), rng.uniform(12, 22))
        elif k == 1:
            ring = gk.U_shape(rng.uniform(50, 90), rng.uniform(60, 90), rng.uniform(12, 20))
        elif k == 2:
            ring = gk.star(5, rng.uniform(28, 40), rng.uniform(11, 16))
        elif k == 3:
            ring = gk.star(3, rng.uniform(35, 45), rng.uniform(10, 14))
        else:
            ring = gk.regular(6, rng.uniform(18, 28))
        groups.append(gk.group(f"M{i:02d}", [gk.translate(ring, 2000 + 120 * i, 0)]))
    out.append(("S2_mixed_40_overflow", gk.document(500, 350, groups, spacing_mm=3.0, margin_mm=10.0,
                                                     rotation={"preset": "step", "step_deg": 15.0})))
    # 3. frames with holes + small parts that fit inside the holes
    groups = []
    for i in range(4):
        groups.append(gk.group(f"F{i}", [gk.translate(gk.rect(140, 140), 2000 + 200 * i, 0),
                                         gk.translate(gk.rect(100, 100), 2020 + 200 * i, 20)]))
    for i in range(8):
        groups.append(gk.group(f"s{i}", [gk.translate(gk.rect(40, 40), 3000 + 60 * i, 0)]))
    out.append(("S3_frames_with_holes", gk.document(330, 330, groups, spacing_mm=4.0, margin_mm=10.0,
                                                     rotation={"preset": "0_90_180_270"})))
    return out


def row(name, kind, res, total):
    m = res["metrics"]
    v = res.get("verification", {})
    return {
        "scenario": name, "solver": kind, "status": res["status"], "placed": m["placed"], "total": total,
        "used_height_mm": m["used_length_mm"], "utilization": m["utilization"],
        "utilization_used_height": m.get("utilization_used_height"), "min_gap_mm": v.get("min_gap_mm"),
        "spacing_mm": res["settings"]["spacing_mm"], "collisions": v.get("collisions"),
        "spacing_violations": v.get("spacing_violations"), "boundary_violations": v.get("boundary_violations"),
        "rigidity_violations": v.get("rigidity_violations"), "verified": v.get("ok"),
        "elapsed_s": m["elapsed_s"],
        "unplaced_reasons": sorted({u["reason"] for u in res["unplaced"]}),
    }


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--quality", default="balanced")
    ap.add_argument("--time-limit", type=float, default=30.0)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--out", default=str(ROOT / "docs" / "benchmark"))
    ap.add_argument("--only", help="substring filter on scenario names")
    args = ap.parse_args(argv)
    out = Path(args.out)
    (out / "svg").mkdir(parents=True, exist_ok=True)

    scenarios = []
    for f in sorted((ROOT / "fixtures" / "geometry").glob("*.geometry.json")):
        doc, sha = load_geometry(f)
        scenarios.append((f.name[: -len(".geometry.json")], doc, sha))
    for name, doc in synthetic():
        scenarios.append((name, doc, None))
    if args.only:
        scenarios = [s for s in scenarios if args.only in s[0]]

    over = {"optimization": {"quality": args.quality, "time_limit_s": args.time_limit, "seed": args.seed}}
    rows = []
    t_all = time.perf_counter()
    for name, doc, sha in scenarios:
        total = len(doc["groups"])
        ts = nest_document(doc, sha, over)
        bb = baseline_document(doc, sha, over)
        for kind, res in (("true_shape", ts), ("bbox_baseline", bb)):
            rows.append(row(name, kind, res, total))
            (out / "svg" / f"{name}.{kind}.svg").write_text(placement_to_svg(doc, res), encoding="utf-8")
        r1, r2 = rows[-2], rows[-1]
        print(f"{name:<26} true-shape {r1['placed']:>3}/{total:<3} h={r1['used_height_mm']:>8} "
              f"gap={r1['min_gap_mm']} ok={r1['verified']} t={r1['elapsed_s']}s | "
              f"bbox {r2['placed']:>3}/{total:<3} h={r2['used_height_mm']:>8} ok={r2['verified']}", flush=True)

    env = {
        "python": platform.python_version(), "platform": platform.platform(), "processor": platform.processor(),
        "shapely": shapely.__version__, "geos": shapely.geos_version_string, "numpy": numpy.__version__,
        "pyclipper": getattr(pyclipper, "__version__", "?"), "quality": args.quality,
        "time_limit_s": args.time_limit, "seed": args.seed, "total_elapsed_s": round(time.perf_counter() - t_all, 1),
    }
    (out / "results.json").write_text(json.dumps({"environment": env, "rows": rows}, indent=1), encoding="utf-8")

    lines = [
        "# Benchmark: true-shape NFP solver vs bounding-box baseline",
        "",
        "Generated by `python tools/benchmark.py "
        f"--quality {args.quality} --time-limit {args.time_limit:g} --seed {args.seed}`. "
        "Every number in the verification columns comes from the independent verifier "
        "(`engine/autonest/verify.py`), applied to the placement matrices and the original geometry.",
        "",
        f"Environment: Python {env['python']} on {env['platform']}, Shapely {env['shapely']} / GEOS {env['geos']}, "
        f"pyclipper {env['pyclipper']}, NumPy {env['numpy']}. Linux container, not Windows.",
        "",
        "| scenario | solver | placed | used height mm | util. (used height) | min gap / spacing mm | "
        "collisions | spacing viol. | boundary viol. | verified | time s |",
        "|---|---|---|---|---|---|---|---|---|---|---|",
    ]
    for r in rows:
        lines.append(
            f"| {r['scenario']} | {r['solver']} | {r['placed']}/{r['total']} | {r['used_height_mm']} | "
            f"{r['utilization_used_height']} | {r['min_gap_mm']} / {r['spacing_mm']} | {r['collisions']} | "
            f"{r['spacing_violations']} | {r['boundary_violations']} | {r['verified']} | {r['elapsed_s']} |")
    ts_rows = [r for r in rows if r["solver"] == "true_shape"]
    bb_rows = [r for r in rows if r["solver"] == "bbox_baseline"]
    lines += [
        "",
        "## Totals",
        "",
        f"* placed: true-shape {sum(r['placed'] for r in ts_rows)}, bbox baseline {sum(r['placed'] for r in bb_rows)} "
        f"(of {sum(r['total'] for r in ts_rows)} groups, including groups with invalid geometry that neither solver places)",
        f"* collisions / spacing / boundary / rigidity violations (both solvers, all scenarios): "
        f"{sum(r['collisions'] or 0 for r in rows)} / {sum(r['spacing_violations'] or 0 for r in rows)} / "
        f"{sum(r['boundary_violations'] or 0 for r in rows)} / {sum(r['rigidity_violations'] or 0 for r in rows)}",
        f"* layouts that failed verification: {sum(1 for r in rows if not r['verified'])}",
        f"* total run time: {env['total_elapsed_s']} s",
        "",
        "SVG previews of every layout are in `svg/` (filled = silhouette, dashed = conservative envelope).",
    ]
    (out / "BENCHMARK.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    bad = sum(1 for r in rows if not r["verified"])
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())

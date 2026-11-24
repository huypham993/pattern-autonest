#!/usr/bin/env python3
"""Command line entry point of the Illustrator True-Shape Auto Nesting engine.

    python nest_engine.py analyze  geometry.json [-o analysis.json] [--svg preview.svg]
    python nest_engine.py nest     geometry.json [-o placement.json] [--svg placement.svg]
                                   [--quality fast|balanced|high_quality] [--time-limit S] [--seed N]
    python nest_engine.py baseline geometry.json [-o placement.json] [--svg ...]   (bbox MaxRects reference)
    python nest_engine.py verify   geometry.json placement.json

Exit codes: 0 success (nest/baseline: every group placed and verified; verify: no violation),
1 contract/usage error, 3 analysis finished but every part has errors,
4 nest finished with some groups unplaced (layout verified), 5 verification failed
(nest writes status "failed" with no placements; verify found a violation).
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from autonest.analyze import analyze_document  # noqa: E402
from autonest.contract import ContractError, load_geometry  # noqa: E402
from autonest.svg import analysis_to_svg, placement_to_svg  # noqa: E402


def _overrides(args) -> dict:
    o: dict = {}
    if args.spacing is not None:
        o["spacing_mm"] = args.spacing
    if args.margin is not None:
        o["margin_mm"] = args.margin
    if args.tolerance is not None:
        o["curve_tolerance_mm"] = args.tolerance
    rot: dict = {}
    if args.rotation_preset:
        rot["preset"] = args.rotation_preset
    if args.rotation_step is not None:
        rot["step_deg"] = args.rotation_step
        rot.setdefault("preset", "step")
    if getattr(args, "grain_tolerance", None) is not None:
        # expressed with the existing contract: an explicit custom angle list (recorded in placement.settings)
        from autonest.rotation import grain_angles
        rot = {"preset": "custom", "custom_angles_deg": grain_angles(args.grain_tolerance, args.rotation_step or 1.0)}
    if rot:
        o["rotation"] = rot
    mat: dict = {}
    if args.material:
        mat["mode"] = args.material
    if getattr(args, "sheet_width", None) is not None:
        mat["sheet_width_mm"] = args.sheet_width
    if getattr(args, "sheet_length", None) is not None:
        mat["sheet_length_mm"] = args.sheet_length
    if mat:
        o["material"] = mat
    opt: dict = {}
    if getattr(args, "quality", None):
        opt["quality"] = args.quality
    if getattr(args, "time_limit", None) is not None:
        opt["time_limit_s"] = args.time_limit
    if getattr(args, "seed", None) is not None:
        opt["seed"] = args.seed
    if getattr(args, "start_corner", None):
        opt["start_corner"] = args.start_corner
    if opt:
        o["optimization"] = opt
    if getattr(args, "no_part_in_hole", False):
        o["part_in_hole"] = False
    if args.opaque_policy:
        o["opaque_policy"] = args.opaque_policy
    return o


def _write_json(path: str | None, data: dict) -> None:
    text = json.dumps(data, ensure_ascii=False, indent=1)
    if path:
        Path(path).write_text(text, encoding="utf-8")
    else:
        sys.stdout.write(text + "\n")


def cmd_analyze(args) -> int:
    doc, sha = load_geometry(args.geometry)
    result = analyze_document(doc, sha, _overrides(args))
    _write_json(args.output, result)
    if args.svg:
        Path(args.svg).write_text(analysis_to_svg(result), encoding="utf-8")
    s = result["summary"]
    print(
        f"[autonest] groups={s['total_groups']} ok={s['ok']} warning={s['warning']} error={s['error']} "
        f"nestable={s['nestable']} silhouette/bbox={s['silhouette_to_bbox_ratio']} time={s['elapsed_s']}s",
        file=sys.stderr,
    )
    for p in result["parts"]:
        if p["status"] != "ok":
            codes = ",".join(sorted({i["code"] for i in p["issues"] if i["severity"] != "info"}))
            print(f"  {p['id']:>8} {p['status']:<7} {codes}", file=sys.stderr)
    return 3 if s["total_groups"] and s["nestable"] == 0 else 0


def _placement_exit(result: dict) -> int:
    if result["status"] == "failed" and any(u["reason"] == "VERIFICATION_FAILED" for u in result["unplaced"]):
        return 5
    if result["status"] == "failed" and not result["placements"]:
        return 3 if result["metrics"]["total_groups"] else 0
    return 0 if result["status"] == "complete" else 4


def _report_placement(result: dict) -> None:
    m = result["metrics"]
    v = result.get("verification", {})
    print(f"[autonest] {result['engine'].get('solver')} status={result['status']} placed={m['placed']}/"
          f"{m['total_groups']} used_height={m['used_length_mm']} mm utilization={m['utilization']} "
          f"min_gap={m['min_gap_mm']} mm collisions={m['collisions']} boundary={m['boundary_violations']} "
          f"verified={v.get('ok')} time={m['elapsed_s']}s", file=sys.stderr)
    for u in result["unplaced"]:
        print(f"  unplaced {u['id']:>8} {u['reason']:<20} {u.get('detail', '')}", file=sys.stderr)
    for prob in v.get("problems", [])[:20]:
        print(f"  VERIFY: {prob}", file=sys.stderr)


def cmd_nest(args, baseline: bool = False) -> int:
    doc, sha = load_geometry(args.geometry)
    if baseline:
        from autonest.baseline import baseline_document
        result = baseline_document(doc, sha, _overrides(args))
    else:
        from autonest.nest import nest_document
        result = nest_document(doc, sha, _overrides(args), workers=args.workers)
    _write_json(args.output, result)
    if args.svg:
        Path(args.svg).write_text(placement_to_svg(doc, result), encoding="utf-8")
    _report_placement(result)
    return _placement_exit(result)


def cmd_verify(args) -> int:
    from autonest.verify import verify_placement
    doc, sha = load_geometry(args.geometry)
    placement = json.loads(Path(args.placement).read_text(encoding="utf-8-sig"))
    ver = verify_placement(doc, placement)
    if placement.get("source", {}).get("geometry_sha256") not in (None, sha):
        ver["ok"] = False
        ver["problems"].insert(0, "placement was computed for a different geometry.json (sha256 mismatch)")
    _write_json(args.output, ver)
    print(f"[autonest] verify ok={ver['ok']} placed={ver['placed']} collisions={ver['collisions']} "
          f"spacing={ver['spacing_violations']} boundary={ver['boundary_violations']} "
          f"rigidity={ver['rigidity_violations']} min_gap={ver['min_gap_mm']} mm", file=sys.stderr)
    for prob in ver["problems"][:20]:
        print(f"  VERIFY: {prob}", file=sys.stderr)
    return 0 if ver["ok"] else 5


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="nest_engine", description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    vp = sub.add_parser("verify")
    vp.add_argument("geometry")
    vp.add_argument("placement")
    vp.add_argument("-o", "--output", help="verification report JSON (default: stdout)")
    for name in ("analyze", "nest", "baseline"):
        sp = sub.add_parser(name)
        sp.add_argument("geometry", help="autonest.geometry/1 JSON exported by Illustrator_AutoNesting.jsx")
        sp.add_argument("-o", "--output", help="output JSON path (default: stdout)")
        sp.add_argument("--spacing", type=float, help="part spacing in mm")
        sp.add_argument("--margin", type=float, help="artboard edge margin in mm")
        sp.add_argument("--tolerance", type=float, help="curve flattening tolerance in mm")
        sp.add_argument("--rotation-preset", choices=["fixed", "0_180", "0_90_180_270", "step", "custom"])
        sp.add_argument("--rotation-step", type=float, help="rotation step in degrees")
        sp.add_argument("--grain-tolerance", type=float, metavar="DEG",
                        help="fabric grain: only 0/180 degrees +- DEG (in --rotation-step steps, default 1)")
        sp.add_argument("--material", choices=["fixed_artboard", "roll"])
        sp.add_argument("--sheet-width", type=float, metavar="MM",
                        help="fabric width in mm, from the artboard's bottom-left corner (default: artboard width)")
        sp.add_argument("--sheet-length", type=float, metavar="MM",
                        help="fabric length in mm, upward from the artboard's bottom edge (default: artboard height)")
        sp.add_argument("--opaque-policy", choices=["require_outline", "use_bounds", "cut_line"])
        sp.add_argument("--svg", help="also write an SVG preview")
        if name != "analyze":
            sp.add_argument("--quality", choices=["fast", "balanced", "high_quality"])
            sp.add_argument("--time-limit", type=float, help="seconds (default: settings, 60)")
            sp.add_argument("--seed", type=int)
            sp.add_argument("--start-corner", choices=["bottom_left", "bottom_right", "top_left", "top_right"],
                            help="corner where nesting starts (default bottom_left)")
            sp.add_argument("--workers", type=int, help="processes for NFP computation (default: CPU cores - 1, max 8; "
                            "0 = none). The result is the same, only faster.")
            sp.add_argument("--no-part-in-hole", action="store_true", help="do not place parts inside holes")
    args = ap.parse_args(argv)
    try:
        if args.cmd == "analyze":
            return cmd_analyze(args)
        if args.cmd == "verify":
            return cmd_verify(args)
        return cmd_nest(args, baseline=args.cmd == "baseline")
    except (ContractError, ValueError) as e:
        print(f"[autonest] ERROR: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    import multiprocessing
    multiprocessing.freeze_support()   # the PyInstaller exe starts its pool workers through main
    sys.exit(main())

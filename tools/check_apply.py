#!/usr/bin/env python3
"""Independent check of an Apply run, from two exports of the same groups (before / after Apply).

    python tools/check_apply.py before/geometry.json after/geometry.json [placement.json]

With placement.json: every anchor and handle of every placed group must equal matrix * its exported
position before Apply, and every other (unplaced) group must have been translated, unrotated, to the right
of the artboard.  Without it (rollback check): no
point may have moved.  Groups are matched by uuid.  Prints one line per problem and a summary;
exit 0 when every point is within --tol pt (default 0.02).
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "engine"))
from autonest.transform import apply_matrix  # noqa: E402


def _rows(node, out):
    if node["kind"] == "group":
        for c in node["children"]:
            _rows(c, out)
    elif node["kind"] == "compound":
        for p in node["paths"]:
            _rows(p, out)
    elif node["kind"] == "path":
        out.extend(node["points"])
    return out


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("before")
    ap.add_argument("after")
    ap.add_argument("placement", nargs="?")
    ap.add_argument("--tol", type=float, default=0.02)
    a = ap.parse_args(argv)
    load = lambda p: json.loads(Path(p).read_text(encoding="utf-8-sig"))  # noqa: E731
    before, after = load(a.before), load(a.after)
    mats = {p["uuid"]: p["matrix"] for p in load(a.placement)["placements"]} if a.placement else {}
    after_by = {g["uuid"]: g for g in after["groups"]}
    worst = {"placed": 0.0, "other": 0.0}
    problems = []
    for g in before["groups"]:
        h = after_by.get(g["uuid"])
        if h is None:
            problems.append(f"{g['id']} {g['name']!r}: missing in the second export")
            continue
        r0, r1 = _rows(g["root"], []), _rows(h["root"], [])
        if len(r0) != len(r1):
            problems.append(f"{g['id']} {g['name']!r}: point count {len(r0)} -> {len(r1)}")
            continue
        m = mats.get(g["uuid"], [1, 0, 0, 1, 0, 0])
        key = "placed" if g["uuid"] in mats else "other"
        if mats and key == "other":
            # an unplaced group is moved off the artboard by a pure translation
            dx, dy = r1[0][0] - r0[0][0], r1[0][1] - r0[0][1]
            m = [1, 0, 0, 1, dx, dy]
            ab = after["artboard"]["rect_pt"]
            if h["visible_bounds_pt"][0] <= ab[2]:
                problems.append(f"{g['id']} {g['name']!r}: unplaced group still overlaps the artboard")
        err = 0.0
        for p0, p1 in zip(r0, r1):
            for k in (0, 2, 4):
                x, y = apply_matrix(m, (p0[k], p0[k + 1]))
                err = max(err, math.hypot(p1[k] - x, p1[k + 1] - y))
        worst[key] = max(worst[key], err)
        if err > a.tol:
            problems.append(f"{g['id']} {g['name']!r}: off by {err:.4f} pt")
    for p in problems:
        print("PROBLEM", p)
    print(f"groups={len(before['groups'])} placed={len(mats)} max_err_placed_pt={worst['placed']:.5f} "
          f"max_err_other_pt={worst['other']:.5f} tol={a.tol} -> {'OK' if not problems else 'FAIL'}")
    return 0 if not problems else 1


if __name__ == "__main__":
    sys.exit(main())

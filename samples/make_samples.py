#!/usr/bin/env python3
"""Build samples/ from fixture 04 (clipping masks + raster).

sample_geometry.json   – real output of the JSX extractor (mock DOM), pretty-printed
sample_analysis.json   – real output of `nest_engine.py analyze`
sample_placement.json  – real output of `nest_engine.py nest --quality fast` (Phase 3A solver,
                         checked by the independent verifier)
sample_placement.svg   – the placement rendered from geometry + matrices
"""
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "engine"))

from autonest.analyze import analyze_document  # noqa: E402
from autonest.contract import load_geometry  # noqa: E402
from autonest.nest import nest_document  # noqa: E402
from autonest.svg import placement_to_svg  # noqa: E402

S = ROOT / "samples"
src = json.loads((ROOT / "fixtures/geometry/04_clip_raster.geometry.json").read_text())
(S / "sample_geometry.json").write_text(json.dumps(src, indent=1, ensure_ascii=False), encoding="utf-8")
doc, sha = load_geometry(S / "sample_geometry.json")
analysis = analyze_document(doc, sha)
(S / "sample_analysis.json").write_text(json.dumps(analysis, indent=1, ensure_ascii=False), encoding="utf-8")

placement = nest_document(doc, sha, {"optimization": {"quality": "fast", "time_limit_s": 60.0}}, analysis=analysis)
(S / "sample_placement.json").write_text(json.dumps(placement, indent=1, ensure_ascii=False), encoding="utf-8")
(S / "sample_placement.svg").write_text(placement_to_svg(doc, placement), encoding="utf-8")
print("samples written; geometry sha256", sha, "placement", placement["status"],
      "verified", placement["verification"]["ok"])

# Pattern AutoNest for Adobe Illustrator

True-shape auto nesting for Adobe Illustrator on Windows. It packs the selected Groups onto the artboard or a fabric
sheet by their real outlines, not their bounding boxes, using only rotation and translation. It is built for
print-and-cut pattern pieces (a printed image plus a stroked cut line), and works for any vector artwork.

Pipeline: an ExtendScript export (read-only) writes `geometry.json`, a Python engine nests the shapes and writes
`placement.json`, and an ExtendScript Apply rotates and moves the Groups. A CEP panel drives the whole flow.

## Features

- True-shape collision from fills, strokes, compound paths, clipping masks, or a `NEST_OUTLINE` path. Concave
  shapes and holes are handled (part-in-hole).
- No-fit-polygon (NFP) nesting with parallel workers and an independent verifier: a layout with any overlap is
  never written.
- Fabric settings: width and length, auto-extend length (roll), part spacing, border gap, start corner, and
  grain-safe rotation (0/180° ± tolerance, a fixed step, or none).
- Safe Apply: everything is checked before the document changes, and any failure rolls back every Group and the
  artboard. Parts that do not fit are parked to the right of the sheet.
- Piece labels: puts each piece number snug against the cut line, rotated along the edge, then groups each piece
  with its label, notches and image, ready to nest.

## Requirements

- Windows 10/11 (64-bit), Adobe Illustrator 2025 or 2026 (CEP panels enabled).
- To build from source: Python 3.10+ and Node.js 18+.

## Install

**One-file installer.** On a build PC with Python, run `Build_Setup.cmd`. The first run asks to install
[Inno Setup 6](https://jrsoftware.org/isinfo.php) with winget. The result is `dist\AutoNesting_Setup.exe`: copy it to
any Windows PC, double-click it, and restart Illustrator. That PC needs no Python. The installer is not code-signed,
so SmartScreen may ask you to choose **More info → Run anyway**. To uninstall: Windows Settings → Apps →
"AutoNesting for Illustrator".

**From source on this PC.** Run `Install_AutoNesting.cmd`. It sets up the Python engine the first time, builds the
panel with `autonest.exe` (PyInstaller), and installs it for the current user.

Then open `Window > Extensions > AutoNesting` in Illustrator.

## Using the panel

The panel has three tabs, usually used in this order:

1. **Labels → Place labels.** Each piece number (layer `PatternNumber`) is moved next to the outside of the nearest
   cut line (layer `OffsetLine`), rotated along the edge and never upside down. *Label height* scales the labels
   first (empty keeps their size). *Label gap* is the distance to the cut line. *Label position* picks the straight
   edge nearest to a corner of the piece. A failure moves every label back.
2. **Group → Group pieces.** One group per piece: its label, cut line, notches and image, ready to nest.
3. **Nesting.** On *Settings*, set the fabric and rotation, then click **Nest selected**. *Result* shows a preview
   and any parts that did not fit. **Apply to document** moves the Groups. A diagnostics file is written next to
   `placement.json`.

Without the two layers, select the piece Groups together with their numbers.

## Using it without the panel

1. Select the Groups to nest and make the target artboard active.
2. Run `File > Scripts > Other Script…` → `dist\Illustrator_AutoNesting_Standalone.jsx`. It does not change the
   document. It writes `geometry.json` to `<document>_autonest\` next to the .ai file.
3. Nest it from the command line (below), check `placement.svg`, then run `dist\AutoNesting_Apply_Standalone.jsx`
   and pick `placement.json`.

The files in `dist\` are single-file bundles that run from anywhere. `jsx\` holds the sources, which need
`jsx\lib` next to them.

## Command line

```powershell
python engine\nest_engine.py analyze  geometry.json -o analysis.json  --svg analysis.svg
python engine\nest_engine.py nest     geometry.json -o placement.json --svg placement.svg --quality balanced --time-limit 60
python engine\nest_engine.py baseline geometry.json -o baseline.json  --svg baseline.svg
python engine\nest_engine.py verify   geometry.json placement.json
```

Main options:

- Sheet: `--sheet-width MM`, `--sheet-length MM`, `--material fixed_artboard|roll`, `--start-corner bottom_left|...`.
- Spacing: `--spacing MM`, `--margin MM`.
- Rotation: `--rotation-preset fixed|0_180|0_90_180_270|step|custom`, `--rotation-step DEG`, `--grain-tolerance DEG`.
- Search: `--quality fast|balanced|high_quality`, `--time-limit S`, `--workers N`, `--no-part-in-hole`.
- Shapes: `--opaque-policy cut_line|require_outline|use_bounds`.

Exit codes of `nest`:

| Code | Meaning |
|---|---|
| 0 | Every part placed and verified. |
| 4 | Some parts unplaced; the layout is verified. |
| 5 | The verifier found a violation; no placement is written. |
| 3 | No valid Group. |
| 1 | Input or usage error. |

### Shapes and outlines

- **Cut line (default).** With `cut_line`, a Group holding an image and a closed, stroked, unfilled path is nested
  by that cut line. Image areas outside it are treated as transparent and reported. Vector artwork outside the cut
  line, such as piece numbers, is part of the collision shape when it lies more than half the spacing away.
- **`NEST_OUTLINE`.** Add a closed path named `NEST_OUTLINE` to a Group to set its shape yourself. It can be hidden,
  with no fill and no stroke. You need one for rasters or text outside a clipping mask, and for effects the script
  cannot read, such as drop shadows, brushes and opacity masks.

## Repository layout

```
engine/            Python engine: nest_engine.py (CLI) and the autonest package
jsx/               ExtendScript (ES3) sources: entry scripts and lib/*.jsxinc
dist/              generated single-file JSX bundles (do not edit; rebuild)
panel/             CEP panel (manifest, HTML, JS)
installer/         Inno Setup script for AutoNesting_Setup.exe
schema/            JSON Schemas of geometry, analysis and placement
samples/           example geometry, analysis and placement
fixtures/          synthetic Illustrator scenes and their exported geometry
tests/             pytest suite plus a Node harness that runs the JSX on a mock Illustrator DOM
tools/             build, benchmark and check scripts; tools/windows has the .cmd helpers
docs/              design notes and benchmarks (in Vietnamese)
```

## Development

```bash
python -m pip install -r requirements-dev.txt
npm install                              # acorn, used by the ES3 checks
node tools/build/build_jsx.js            # rebuild dist/; fails on any problem
node tools/build/build_jsx.js --check    # dist/ matches the sources
python -m pytest -q tests
python tools/benchmark.py --quality balanced --time-limit 30
```

JSX source rules, enforced by the build:

- ASCII only. Write other characters as `\uXXXX`.
- ES3 syntax only.
- No `JSON`, no ES5 array methods, no `String.prototype.trim`, no `Object.keys`.

The Node harness runs the real JSX code on a mock DOM, which does not replace a run in real Illustrator.

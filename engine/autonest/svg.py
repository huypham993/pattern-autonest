"""Dependency-free SVG rendering of an analysis (for visual inspection)."""
from __future__ import annotations

from xml.sax.saxutils import escape

STATUS_FILL = {"ok": "#3b82f6", "warning": "#f59e0b", "error": "#ef4444"}


def _path_d(polys, H):
    d = []
    for p in polys:
        for ring in [p["exterior"]] + p.get("holes", []):
            if not ring:
                continue
            d.append("M" + " L".join(f"{x:.3f},{H - y:.3f}" for x, y in ring) + " Z")
    return " ".join(d)


def analysis_to_svg(analysis: dict, show_nest_offset: bool = True) -> str:
    from . import regions  # local import keeps module import cheap

    W = analysis["frame"]["artboard_mm"][2]
    H = analysis["frame"]["artboard_mm"][3]
    ux0, uy0, ux1, uy1 = analysis["frame"]["usable_mm"]
    spacing = analysis["settings"]["spacing_mm"]
    out = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="-5 -5 {W + 10:.3f} {H + 10:.3f}" '
        f'width="{min(1600, W * 2):.0f}" font-family="sans-serif">',
        f'<rect x="0" y="0" width="{W:.3f}" height="{H:.3f}" fill="#fff" stroke="#111" stroke-width="0.5"/>',
        f'<rect x="{ux0:.3f}" y="{H - uy1:.3f}" width="{ux1 - ux0:.3f}" height="{uy1 - uy0:.3f}" '
        'fill="none" stroke="#888" stroke-width="0.3" stroke-dasharray="3 2"/>',
    ]
    for p in analysis["parts"]:
        if not p["silhouette"]:
            continue
        if show_nest_offset and spacing > 0:
            base = regions.geometry_from_json(p["envelope"] or p["silhouette"])
            off = regions.geometry_to_json(regions.safe_offset(base, spacing / 2.0), 3)
            out.append(f'<path d="{_path_d(off, H)}" fill="none" stroke="#999" stroke-width="0.2" '
                       'stroke-dasharray="1 1" fill-rule="evenodd"/>')
        fill = STATUS_FILL.get(p["status"], "#999")
        out.append(f'<path d="{_path_d(p["silhouette"], H)}" fill="{fill}" fill-opacity="0.45" '
                   f'stroke="{fill}" stroke-width="0.3" fill-rule="evenodd"><title>{escape(p["id"])} '
                   f'{escape(p["status"])} {escape(p["source"])}</title></path>')
        if p.get("centroid_mm"):
            cx, cy = p["centroid_mm"]
            out.append(f'<text x="{cx:.2f}" y="{H - cy:.2f}" font-size="4" text-anchor="middle" '
                       f'fill="#111">{escape(p["id"])}</text>')
    out.append("</svg>")
    return "\n".join(out)


PALETTE = ["#2563eb", "#16a34a", "#d97706", "#9333ea", "#db2777", "#0891b2", "#65a30d", "#dc2626"]


def placement_to_svg(doc: dict, placement: dict) -> str:
    """Render a placement by applying its matrices to the original geometry.

    Shapes come from ``verify.transformed_shapes`` (geometry.json + placement
    matrices), not from the solver, so the picture shows what Illustrator would get.
    """
    from . import regions
    from .contract import deep_merge, sheet_rect_mm
    from .units import SheetFrame
    from .verify import transformed_shapes

    settings = deep_merge(doc["settings"], placement.get("settings"))
    frame = SheetFrame.from_artboard_rect(doc["artboard"]["rect_pt"], doc["coordinate_system"]["y_axis"])
    W, H = frame.width_mm, frame.height_mm
    m = float(settings["margin_mm"])
    shapes = transformed_shapes(doc, placement, settings)
    # the view shows the artboard and the fabric (which may be larger); a roll is cut at the used length
    sx0, sy0, sx1, sy1 = sheet_rect_mm(settings, W, H)
    if settings["material"]["mode"] == "roll":
        b = [sh["envelope"].bounds for sh in shapes.values() if not sh["envelope"].is_empty]
        if sy0 < 0:   # nested from the top: the roll grows downward
            sy0 = min(x[1] for x in b) - m if b else 0.0
        else:
            sy1 = max(x[3] for x in b) + m if b else H
    T = max(H, sy1)               # top of the view; y is flipped at it
    VW, VH = max(W, sx1), T - min(0.0, sy0)
    names = {g["id"]: g.get("name", "") for g in doc["groups"]}
    out = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="-5 -5 {VW + 10:.3f} {VH + 10:.3f}" '
        f'width="{min(1600, VW * 2):.0f}" font-family="sans-serif">',
        f'<rect x="0" y="0" width="{VW:.3f}" height="{VH:.3f}" fill="#fff"/>',
        f'<rect x="{sx0:.3f}" y="{T - sy1:.3f}" width="{sx1 - sx0:.3f}" height="{sy1 - sy0:.3f}" fill="#f4efe4" '
        'stroke="#a07c3c" stroke-width="0.4"><title>fabric</title></rect>',
        f'<rect x="0" y="{T - H:.3f}" width="{W:.3f}" height="{H:.3f}" fill="none" stroke="#111" stroke-width="0.5">'
        '<title>artboard</title></rect>',
        f'<rect x="{sx0 + m:.3f}" y="{T - sy1 + m:.3f}" width="{sx1 - sx0 - 2 * m:.3f}" height="{sy1 - sy0 - 2 * m:.3f}" '
        'fill="none" stroke="#888" stroke-width="0.3" stroke-dasharray="3 2"/>',
    ]
    H = T    # shapes below are drawn in the view frame (y flipped at its top)
    for k, pl in enumerate(placement["placements"]):
        sh = shapes.get(pl["id"])
        if sh is None:
            continue
        color = PALETTE[k % len(PALETTE)]
        env = regions.geometry_to_json(sh["envelope"], 3)
        sil = regions.geometry_to_json(sh["silhouette"], 3)
        out.append(f'<path d="{_path_d(env, H)}" fill="none" stroke="{color}" stroke-width="0.15" '
                   'stroke-dasharray="0.8 0.8" fill-rule="evenodd"/>')
        out.append(f'<path d="{_path_d(sil, H)}" fill="{color}" fill-opacity="0.5" stroke="{color}" '
                   f'stroke-width="0.25" fill-rule="evenodd"><title>{escape(pl["id"])} {escape(names.get(pl["id"], ""))} '
                   f'rot={pl["rotation_deg"]:g}</title></path>')
        c = sh["silhouette"].representative_point() if not sh["silhouette"].is_empty else None
        if c is not None:
            out.append(f'<text x="{c.x:.2f}" y="{H - c.y:.2f}" font-size="3.5" text-anchor="middle" '
                       f'fill="#111">{escape(pl["id"])}</text>')
    if placement["unplaced"]:
        txt = "unplaced: " + ", ".join(f"{u['id']} ({u['reason']})" for u in placement["unplaced"][:12])
        if len(placement["unplaced"]) > 12:
            txt += f", ... (+{len(placement['unplaced']) - 12})"
        out.append(f'<text x="0" y="{VH + 4:.2f}" font-size="3.5" fill="#b91c1c">{escape(txt)}</text>')
    out.append("</svg>")
    return "\n".join(out)

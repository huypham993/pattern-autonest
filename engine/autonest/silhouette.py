"""True-shape silhouette extraction from an exported Illustrator group tree.

Priority (per selected group):

1. Closed path(s) named ``NEST_OUTLINE`` anywhere inside the group.
2. The group's clipping path (clip region, intersected with the content
   region when every content element has known vector geometry).
3. Union of the painted area of visible vector paths: fills (by fill rule,
   compound paths with holes, implicitly-closed open fills) plus strokes.
   Nested clipping groups contribute ``clip ∩ content``.

Elements whose painted area cannot be derived from vector data (raster and
placed images, text, symbols, meshes, plugin art) are *opaque*.  An opaque
element is accepted only when it is provably inside the vector silhouette or
inside a clipping path.  Otherwise the part is rejected with NEEDS_NEST_OUTLINE
(or, if the user explicitly opts in with opaque_policy="use_bounds", its
bounding rectangle is added to the silhouette — a conservative superset).
With opaque_policy="cut_line" (print-and-cut artwork: an image plus a stroked
cut line) the largest closed, stroked, unfilled path is used like a
NEST_OUTLINE, united with the group's vector artwork lying more than spacing/2 outside
it (piece numbers are printed, so they collide too); whatever of the image
lies outside it is reported, not nested.

The bounding box is never used as nesting geometry by default.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any

import shapely
from shapely.geometry import MultiPolygon, Polygon

from . import regions
from .bezier import flatten_path
from .issues import ERROR, INFO, WARNING, Issue
from .units import PT_PER_MM, SheetFrame

OUTLINE_NAME = "NEST_OUTLINE"
CLOSE_EPS_MM = 0.01  # open path whose ends are closer than this is treated as closed


@dataclass
class Opaque:
    typename: str
    name: str
    node_path: list[int]
    bounds_mm: tuple[float, float, float, float] | None


@dataclass
class Sub:
    region: MultiPolygon = field(default_factory=regions.empty)
    unresolved: list[Opaque] = field(default_factory=list)
    # Bounds as Illustrator would report geometricBounds for this node,
    # computed with and without hidden children (Illustrator's treatment of
    # hidden items in bounds is not documented; we accept either).
    bounds_all: tuple | None = None
    bounds_visible: tuple | None = None


def _union_bounds(a, b):
    if a is None:
        return b
    if b is None:
        return a
    return (min(a[0], b[0]), min(a[1], b[1]), max(a[2], b[2]), max(a[3], b[3]))


def _vertex_bounds(verts):
    if not verts:
        return None
    xs = [v[0] for v in verts]
    ys = [v[1] for v in verts]
    return (min(xs), min(ys), max(xs), max(ys))


def _finite_points(points) -> bool:
    for p in points:
        for v in p:
            if v is None or not isinstance(v, (int, float)) or not math.isfinite(v):
                return False
    return True


@dataclass
class PartGeometry:
    silhouette: MultiPolygon
    source: str
    issues: list[Issue]
    had_curves: bool
    bounds_all_mm: tuple | None
    bounds_visible_mm: tuple | None
    artwork_region: MultiPolygon  # known vector paint region (for outline checks)


class Extractor:
    def __init__(self, frame: SheetFrame, tol_mm: float, opaque_policy: str = "require_outline"):
        self.frame = frame
        self.tol_mm = tol_mm
        self.tol_pt = tol_mm * PT_PER_MM
        self.opaque_policy = opaque_policy
        self.issues: list[Issue] = []
        self.had_curves = False

    # ------------------------------------------------------------------ utils
    def _issue(self, code, severity, message, path=None, **data):
        self.issues.append(Issue(code, severity, message, list(path) if path is not None else None, data))

    def _flatten(self, node, path) -> tuple[list[tuple[float, float]], bool] | None:
        """Flatten a path node to mm vertices. Returns (verts, closed) or None."""
        pts = node.get("points") or []
        if not _finite_points(pts):
            self._issue("BAD_COORDINATES", ERROR, "Path has invalid coordinates (NaN/infinite/missing).", path)
            return None
        if len(pts) == 0:
            self._issue("EMPTY_PATH", INFO, "Skipped empty path (0 points).", path)
            return None
        if len(pts) == 1:
            self._issue("STRAY_POINT", INFO, "Skipped stray anchor point.", path)
            return None
        if any(p[0] != p[4] or p[1] != p[5] or p[0] != p[2] or p[1] != p[3] for p in pts):
            self.had_curves = True
        closed = bool(node.get("closed"))
        verts_pt = flatten_path(pts, closed, self.tol_pt)
        verts = self.frame.points_to_mm(verts_pt)
        if not closed and len(verts) >= 3:
            (x0, y0), (x1, y1) = verts[0], verts[-1]
            if math.hypot(x1 - x0, y1 - y0) <= CLOSE_EPS_MM:
                verts = verts[:-1]
                closed = True
                self._issue("OPEN_PATH_COINCIDENT_ENDS", INFO,
                            "Open path with coincident endpoints; treated as closed.", path)
        return verts, closed

    def _quiet_bounds(self, node):
        b = None
        for sp in ([node] if node["kind"] == "path" else node.get("paths", [])):
            pts = sp.get("points") or []
            if pts and _finite_points(pts):
                verts = self.frame.points_to_mm(flatten_path(pts, bool(sp.get("closed")), self.tol_pt))
                b = _union_bounds(b, _vertex_bounds(verts))
        return b

    @staticmethod
    def _stroke_params(node):
        st = node.get("stroke") or {}
        return (
            float(st.get("width_pt", 0.0) or 0.0) / PT_PER_MM,
            st.get("join", "miter"),
            st.get("cap", "butt"),
            float(st.get("miter_limit", 10.0) or 10.0),
        )

    # ---------------------------------------------------------------- shapes
    def _closed_region(self, rings, fill_rule, path, what: str) -> MultiPolygon:
        for r in rings:
            if len(r) >= 3 and not regions.ring_is_simple(r):
                self._issue("SELF_INTERSECTION", WARNING,
                            f"{what} self-intersects; fill area computed with fill rule '{fill_rule}', "
                            "matching how Illustrator renders it.", path, fill_rule=fill_rule)
                break
        return regions.region_from_rings([r for r in rings if len(r) >= 3], fill_rule)

    def _path_paint(self, node, path, flattened) -> MultiPolygon:
        """Painted area of a single path node (fill + stroke)."""
        verts, closed = flattened
        filled = bool(node.get("filled"))
        stroked = bool(node.get("stroked"))
        parts = []
        if filled:
            if not closed:
                self._issue("OPEN_FILLED_PATH", WARNING,
                            "Filled open path: Illustrator fills it as if closed; the silhouette uses the same rule.",
                            path)
            fill = self._closed_region([verts], node.get("fill_rule", "nonzero"), path, "Path")
            if fill.is_empty:
                self._issue("DEGENERATE_FILL", INFO, "Fill area is zero; skipped.", path)
            parts.append(fill)
        if stroked:
            w, join, cap, ml = self._stroke_params(node)
            if w > 0:
                stroke = regions.stroke_region(verts, closed, w, join, cap, ml)
                vb = node.get("visible_bounds_pt")
                if vb:
                    vis = self.frame.bounds_to_mm(vb)
                    comp = _union_bounds(stroke.bounds if not stroke.is_empty else None,
                                         regions.union(parts).bounds if parts else None)
                    if comp and self._exceeds(vis, comp) > max(0.2, 2 * self.tol_mm):
                        # Stroke alignment (inside/outside) is not exposed to scripting.
                        # Assume an outside-aligned stroke: full width outward.
                        stroke = regions.stroke_region(verts, closed, 2 * w, join, cap, ml)
                        self._issue("STROKE_ALIGNMENT_ASSUMED_OUTSIDE", WARNING,
                                    "Stroke visible bounds exceed a center-aligned stroke; assuming an outside-aligned stroke "
                                    "(full stroke width used).", path)
                parts.append(stroke)
        if not filled and not stroked:
            self._issue("INVISIBLE_PATH_IGNORED", INFO,
                        "Path with no fill and no stroke (construction line) is excluded from the silhouette.", path)
        return regions.union(parts)

    @staticmethod
    def _exceeds(outer, inner) -> float:
        """How far box ``outer`` sticks out of box ``inner`` (max over sides, mm)."""
        return max(inner[0] - outer[0], inner[1] - outer[1], outer[2] - inner[2], outer[3] - inner[3], 0.0)

    def _clip_region(self, node, path) -> MultiPolygon | None:
        if node["kind"] == "path":
            f = self._flatten(node, path)
            if f is None:
                return regions.empty()
            verts, closed = f
            if not closed:
                self._issue("OPEN_CLIP_PATH", INFO, "Open clipping path; Illustrator closes it automatically when clipping.", path)
            return self._closed_region([verts], node.get("fill_rule", "nonzero"), path, "Clipping path")
        if node["kind"] == "compound":
            rings = []
            for j, sp in enumerate(node.get("paths", [])):
                f = self._flatten(sp, path + [j])
                if f is not None:
                    rings.append(f[0])
            return self._closed_region(rings, node.get("fill_rule", "nonzero"), path, "Clipping compound path")
        return None  # text used as clipping mask etc.

    # ------------------------------------------------------------------ walk
    def walk(self, node: dict, path: list[int], hidden: bool = False) -> Sub:
        kind = node["kind"]
        hidden = hidden or bool(node.get("hidden"))
        if node.get("locked"):
            self._issue("LOCKED_CHILD", ERROR,
                        "Group contains a locked object; Illustrator may not move it with the Group.",
                        path)
        if kind != "group" and node.get("guides"):
            self._issue("GUIDE_IGNORED", INFO, "Skipped guide.", path)
            return Sub()
        if kind != "group" and _is_outline(node):
            return Sub(bounds_all=self._quiet_bounds(node))  # region handled separately
        opacity = node.get("opacity", 100.0)
        invisible = hidden or (opacity is not None and opacity <= 0)

        if kind == "group":
            # a group at 0 % opacity prints nothing: treat its content like hidden content
            return self._walk_group(node, path, hidden or invisible)

        if kind == "opaque":
            gb = node.get("geometric_bounds_pt")
            vb = node.get("visible_bounds_pt") or gb
            b = self.frame.bounds_to_mm(vb) if vb else None
            bg = self.frame.bounds_to_mm(gb) if gb else b
            sub = Sub(bounds_all=bg, bounds_visible=None if invisible else bg)
            if not invisible:
                sub.unresolved.append(Opaque(node["typename"], node.get("name", ""), list(path), b))
            return sub

        if kind == "path":
            f = self._flatten(node, path)
            if f is None:
                return Sub()
            vb = _vertex_bounds(f[0])
            if invisible:
                if hidden:
                    self._issue("HIDDEN_IGNORED", INFO, "Skipped hidden object.", path)
                return Sub(bounds_all=vb)
            return Sub(region=self._path_paint(node, path, f), bounds_all=vb, bounds_visible=vb)

        if kind == "compound":
            rings, flats, vb = [], [], None
            for j, sp in enumerate(node.get("paths", [])):
                f = self._flatten(sp, path + [j])
                if f is None:
                    continue
                flats.append((sp, f))
                rings.append(f[0])
                vb = _union_bounds(vb, _vertex_bounds(f[0]))
            cgb = node.get("geometric_bounds_pt")
            if cgb and vb:
                ill = self.frame.bounds_to_mm(cgb)
                if max(abs(ill[i] - vb[i]) for i in range(4)) > max(0.5, 3 * self.tol_mm):
                    # e.g. compound paths built from groups: pathItems does not list every part
                    self._issue("COMPOUND_INCOMPLETE", WARNING,
                                "Compound path bounds differ from the combined subpaths that were read; components may be missing. "
                                "Consider adding a NEST_OUTLINE.", path)
            if invisible:
                return Sub(bounds_all=vb)
            parts = []
            if node.get("filled"):
                if any(not f[1] for _, f in flats):
                    self._issue("OPEN_FILLED_PATH", WARNING,
                                "Compound path has a filled open subpath; treated as closed.", path)
                parts.append(self._closed_region(rings, node.get("fill_rule", "nonzero"), path, "Compound path"))
            if node.get("stroked"):
                w, join, cap, ml = self._stroke_params(node)
                for sp, (verts, closed) in flats:
                    parts.append(regions.stroke_region(verts, closed, w, join, cap, ml))
            if not node.get("filled") and not node.get("stroked"):
                self._issue("INVISIBLE_PATH_IGNORED", INFO,
                            "Compound path with no fill and no stroke is excluded from the silhouette.", path)
            region = regions.union(parts)
            return Sub(region=region, bounds_all=vb, bounds_visible=vb)

        raise AssertionError(kind)

    def _walk_group(self, node, path, hidden) -> Sub:
        children = node.get("children", [])
        clip_idx = None
        if node.get("clipped"):
            for i, ch in enumerate(children):
                if ch.get("clipping"):
                    clip_idx = i
                    break
            if clip_idx is None:
                self._issue("CLIP_PATH_MISSING", WARNING,
                            "Group is marked as clipped but no clipping path was found.", path)

        subs = []
        for i, ch in enumerate(children):
            if i == clip_idx:
                continue
            subs.append(self.walk(ch, path + [i], hidden))

        content_region = regions.union([s.region for s in subs])
        unresolved = [o for s in subs for o in s.unresolved]
        b_all = b_vis = None
        for s in subs:
            b_all = _union_bounds(b_all, s.bounds_all)
            b_vis = _union_bounds(b_vis, s.bounds_visible)

        if clip_idx is None:
            return Sub(content_region, unresolved, b_all, b_vis)

        clip_node = children[clip_idx]
        cpath = path + [clip_idx]
        clip = self._clip_region(clip_node, cpath)
        if clip is None:
            self._issue("CLIP_PATH_UNSUPPORTED", ERROR,
                        f"Clipping mask is a {clip_node.get('typename', clip_node['kind'])}; the clip outline cannot be "
                        "extracted. Add a NEST_OUTLINE.", cpath)
            gb = clip_node.get("geometric_bounds_pt")
            b = self.frame.bounds_to_mm(gb) if gb else None
            return Sub(regions.empty(), [Opaque(clip_node.get("typename", "clip"), "", cpath, b)], b, b)
        cb = clip.bounds if not clip.is_empty else None
        if clip.is_empty:
            self._issue("EMPTY_CLIP", WARNING, "Clipping path has zero area; the group prints nothing.", cpath)
            return Sub(regions.empty(), [], cb, cb)
        if hidden:
            return Sub(regions.empty(), [], cb, None)
        if unresolved:
            self._issue("CLIP_BOUNDS_OPAQUE_CONTENT", INFO,
                        "Content includes raster/text/objects whose shape cannot be read; using the clipping path itself "
                        "as the silhouette (safe, but may be larger than what actually prints).", path,
                        opaque=[o.typename for o in unresolved])
            region = clip
        else:
            region = regions.clean(clip.intersection(content_region))
        # Illustrator 30.7 reports a clip group's geometricBounds as the clipped content's bounds
        # (smoke test C08), older versions may report the clip path: bounds_all covers the first, bounds_visible the second
        return Sub(region, [], _union_bounds(cb, b_all), cb)


def _is_outline(node) -> bool:
    return node.get("kind") in ("path", "compound") and str(node.get("name", "")).strip().upper() == OUTLINE_NAME


def _find_outlines(node, path, out):
    if node.get("kind") == "group":
        for i, ch in enumerate(node.get("children", [])):
            _find_outlines(ch, path + [i], out)
    elif _is_outline(node):
        out.append((node, path))


def _outline_region(ex: Extractor, outlines) -> MultiPolygon | None:
    """Region of NEST_OUTLINE path(s); None if any outline is invalid (errors recorded)."""
    regs = []
    ok = True
    for node, path in outlines:
        if node.get("name") != OUTLINE_NAME:
            ex._issue("OUTLINE_NAME_CASE", WARNING,
                      f"Name '{node.get('name')}' was read as {OUTLINE_NAME}; use the exact uppercase name.", path)
        subpaths = [node] if node["kind"] == "path" else node.get("paths", [])
        rings = []
        for j, sp in enumerate(subpaths):
            spath = path if node["kind"] == "path" else path + [j]
            f = ex._flatten(sp, spath)
            if f is None:
                ok = False
                continue
            verts, closed = f
            if not closed:
                ex._issue("OUTLINE_NOT_CLOSED", ERROR, f"{OUTLINE_NAME} is not closed.", spath)
                ok = False
                continue
            if len(verts) < 3 or regions.region_from_rings([verts]).area < 1e-6:
                ex._issue("OUTLINE_DEGENERATE", ERROR, f"{OUTLINE_NAME} is degenerate (zero area).", spath)
                ok = False
                continue
            if not regions.ring_is_simple(verts):
                ex._issue("OUTLINE_SELF_INTERSECTION", ERROR,
                          f"{OUTLINE_NAME} self-intersects; redraw it so the outline does not cross itself.", spath)
                ok = False
                continue
            rings.append(verts)
        if rings:
            rule = node.get("fill_rule", "nonzero") if node["kind"] == "compound" else "nonzero"
            regs.append(regions.region_from_rings(rings, rule))
    if not ok:
        return None
    return regions.union(regs) if regs else None


def _check_outline_covers(ex: Extractor, outline, sub: Sub, artwork, label: str) -> None:
    """Warn about artwork (vector or opaque) lying outside a user-chosen outline."""
    grown = outline.buffer(ex.tol_mm + 1e-6)
    if not artwork.is_empty:
        outside = artwork.difference(grown)
        if outside.area > 1e-3:
            ex._issue("OUTLINE_SMALLER_THAN_ARTWORK", WARNING,
                      f"About {outside.area:.2f} mm² of vector artwork lies outside {label}; "
                      "it may overlap other parts when printed.", None, outside_area_mm2=round(outside.area, 3))
    for o in sub.unresolved:
        if o.bounds_mm and not grown.covers(regions.rect_polygon(*o.bounds_mm)):
            # shortcut: overflow sampled on the frame's boundary every 1 mm, not an exact max distance
            ring = regions.rect_polygon(*o.bounds_mm).exterior.segmentize(1.0)
            over = float(shapely.distance(outline, shapely.points(list(ring.coords))).max())
            ex._issue("OUTLINE_SMALLER_THAN_ARTWORK", WARNING,
                      f"{o.typename} extends up to {over:.1f} mm beyond {label}; that part is treated as transparent "
                      "and may overlap another Group.", o.node_path, overflow_mm=round(over, 3))


def _cut_line_region(ex: Extractor, root) -> tuple[MultiPolygon, list] | None:
    """Interior of the largest (by anchor bounds) visible closed, stroked, unfilled path, or None."""
    best = None
    stack = [(root, [])]
    while stack:
        node, path = stack.pop()
        if node.get("hidden"):
            continue
        if node.get("kind") == "group":
            stack.extend((ch, path + [i]) for i, ch in enumerate(node.get("children", [])))
        elif node.get("kind") == "path" and node.get("stroked") and not node.get("filled") \
                and not node.get("clipping") and not node.get("guides") and len(node.get("points") or []) >= 3:
            xs = [q[0] for q in node["points"]]
            ys = [q[1] for q in node["points"]]
            area = (max(xs) - min(xs)) * (max(ys) - min(ys))
            if best is None or area > best[0]:
                best = (area, node, path)
    if best is None:
        return None
    n_issues = len(ex.issues)
    f = ex._flatten(best[1], best[2])
    del ex.issues[n_issues:]  # already reported while walking the group
    if f is None or not f[1] or len(f[0]) < 3 or not regions.ring_is_simple(f[0]):
        return None
    region = regions.region_from_rings([f[0]])
    return (region, best[2]) if region.area > 1e-6 else None


def extract_part(group: dict, frame: SheetFrame, tol_mm: float, opaque_policy: str = "require_outline",
                 spacing_mm: float = 0.0) -> PartGeometry:
    ex = Extractor(frame, tol_mm, opaque_policy)
    root = group["root"]
    sub = ex.walk(root, [])
    artwork = sub.region

    outlines: list = []
    _find_outlines(root, [], outlines)
    if outlines:
        outline = _outline_region(ex, outlines)
        if outline is None or outline.is_empty:
            return PartGeometry(regions.empty(), "nest_outline", ex.issues, ex.had_curves,
                                sub.bounds_all, sub.bounds_visible, artwork)
        _check_outline_covers(ex, outline, sub, artwork, OUTLINE_NAME)
        return PartGeometry(outline, "nest_outline", ex.issues, ex.had_curves,
                            sub.bounds_all, sub.bounds_visible, artwork)

    if opaque_policy == "cut_line" and sub.unresolved:
        cut = _cut_line_region(ex, root)
        if cut is not None:
            ex._issue("CUT_LINE_AS_OUTLINE", INFO,
                      "Using the cut line (largest closed path with stroke and no fill) as the outline.", cut[1])
            # Vector artwork outside the cut line (piece numbers, notches) is printed, so it collides too.
            # Within spacing/2 of the cut line it can never meet another part (cut lines are >= spacing apart),
            # so only what lies beyond is added; pieces by convex hull, holes filled: far fewer vertices.
            clear = max(ex.tol_mm, spacing_mm / 2.0)
            outside = artwork.difference(cut[0].buffer(clear)) if not artwork.is_empty else artwork
            shape = cut[0]
            if outside.area > 1e-3:
                shape = regions.union([cut[0]] + [p.convex_hull for p in regions.polygons_of(outside)])
                shape = regions.union([Polygon(p.exterior) for p in regions.polygons_of(shape)])
            # vector artwork left outside `shape` lies within `clear` of the cut line: no warning for it
            _check_outline_covers(ex, shape, sub, regions.empty(), "the cut line")
            return PartGeometry(shape, "cut_line", ex.issues, ex.had_curves,
                                sub.bounds_all, sub.bounds_visible, artwork)

    source = "clip_path" if root.get("clipped") else "vector_union"
    silhouette = artwork
    extra = []
    for o in sub.unresolved:
        if o.bounds_mm is None:
            ex._issue("NEEDS_NEST_OUTLINE", ERROR,
                      f"{o.typename} has no bounds; add a {OUTLINE_NAME}.", o.node_path)
            continue
        rect = regions.rect_polygon(*o.bounds_mm)
        if not artwork.is_empty and artwork.buffer(1e-6).covers(rect):
            ex._issue("OPAQUE_COVERED", INFO,
                      f"{o.typename} lies entirely inside the vector area and does not affect the silhouette.", o.node_path)
            continue
        if opaque_policy == "use_bounds":
            ex._issue("OPAQUE_BOUNDS_USED", WARNING,
                      f"{o.typename}: using the object's bounding rectangle (per user setting) — "
                      "safe but uses more material.", o.node_path)
            extra.append(rect)
        else:
            ex._issue("NEEDS_NEST_OUTLINE", ERROR,
                      f"{o.typename} (raster/text/special object): exact silhouette cannot be determined; "
                      f"add a closed path named {OUTLINE_NAME} to the Group.", o.node_path)
    if extra:
        silhouette = regions.union([silhouette] + extra)
        source += "+opaque_bounds"
    return PartGeometry(silhouette, source, ex.issues, ex.had_curves,
                        sub.bounds_all, sub.bounds_visible, artwork)

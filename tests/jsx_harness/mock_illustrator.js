/*
 * Minimal mock of the Illustrator scripting DOM, built from a "scene" JSON.
 *
 * It exists to run the real JSX extraction code (jsx/lib/*.jsxinc) outside
 * Illustrator, so the extraction logic and the JSON contract can be tested
 * on Linux/CI.  It does NOT prove anything about Illustrator's own behaviour
 * (coordinate conventions, bounds semantics, performance): that still has to
 * be verified inside Illustrator.
 *
 * Scene item spec (coordinates in points, document space, y up):
 *   {typename:"GroupItem", name, clipped, hidden, locked, uuid, pageItems:[...]}
 *   {typename:"PathItem", name, closed, filled, stroked, strokeWidth, strokeJoin,
 *    strokeCap, strokeMiterLimit, evenodd, clipping, guides, hidden, locked, opacity,
 *    pathPoints:[[ax,ay,lx,ly,rx,ry], ...]}
 *   {typename:"CompoundPathItem", name, pathItems:[PathItem spec...]}
 *   {typename:"RasterItem"|"PlacedItem"|"TextFrame"|..., bounds:[l,t,r,b]}
 * Optional overrides on any item: geometricBounds, visibleBounds.
 */
"use strict";

function makeEnum(name, keys) {
    var e = {};
    keys.forEach(function (k) { e[k] = name + "." + k; });
    return e;
}

var ENUMS = {
    CoordinateSystem: makeEnum("CoordinateSystem", ["DOCUMENTCOORDINATESYSTEM", "ARTBOARDCOORDINATESYSTEM"]),
    StrokeJoin: makeEnum("StrokeJoin", ["MITERENDJOIN", "ROUNDENDJOIN", "BEVELENDJOIN"]),
    StrokeCap: makeEnum("StrokeCap", ["BUTTENDCAP", "ROUNDENDCAP", "PROJECTINGENDCAP"]),
    RulerUnits: makeEnum("RulerUnits", ["Millimeters", "Points"]),
    DocumentColorSpace: makeEnum("DocumentColorSpace", ["CMYK", "RGB"]),
    Transformation: makeEnum("Transformation", ["CENTER", "DOCUMENTORIGIN", "TOPLEFT", "BOTTOMLEFT"]),
    ElementPlacement: makeEnum("ElementPlacement", ["PLACEATBEGINNING", "PLACEATEND", "PLACEBEFORE", "PLACEAFTER", "INSIDE"])
};

function cubicBounds(p0, p1, p2, p3, acc) {
    for (var i = 0; i <= 64; i++) {
        var t = i / 64, u = 1 - t;
        var x = u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0];
        var y = u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1];
        acc.push([x, y]);
    }
}

/* PathItem.area / .length from the anchors (the mock ignores curvature) */
function anchorArea(anchors) {
    var a = 0;
    for (var i = 0; i < anchors.length; i++) {
        var p = anchors[i], q = anchors[(i + 1) % anchors.length];
        a += p[0] * q[1] - q[0] * p[1];
    }
    return a / 2;
}
function anchorLength(anchors, closed) {
    var l = 0;
    for (var i = 0; i < (closed ? anchors.length : anchors.length - 1); i++) {
        var p = anchors[i], q = anchors[(i + 1) % anchors.length];
        l += Math.sqrt((q[0] - p[0]) * (q[0] - p[0]) + (q[1] - p[1]) * (q[1] - p[1]));
    }
    return l;
}
function definePathMeasures(o, anchors) {
    Object.defineProperty(o, "area", { configurable: true, get: function () { return anchorArea(anchors()); } });
    Object.defineProperty(o, "length", { configurable: true, get: function () { return anchorLength(anchors(), o.closed); } });
}

function pathBounds(pts, closed) {
    var acc = [];
    var n = pts.length;
    if (n === 0) { return null; }
    if (n === 1) { acc.push([pts[0][0], pts[0][1]]); }
    var segs = closed ? n : n - 1;
    for (var i = 0; i < segs; i++) {
        var a = pts[i], b = pts[(i + 1) % n];
        cubicBounds([a[0], a[1]], [a[4], a[5]], [b[2], b[3]], [b[0], b[1]], acc);
    }
    var l = Infinity, t = -Infinity, r = -Infinity, b = Infinity, any = false;
    for (var k = 0; k < acc.length; k++) {
        var p = acc[k];
        if (!isFinite(p[0]) || !isFinite(p[1])) { continue; }
        any = true;
        if (p[0] < l) { l = p[0]; } if (p[0] > r) { r = p[0]; }
        if (p[1] < b) { b = p[1]; } if (p[1] > t) { t = p[1]; }
    }
    // Illustrator order: [left, top, right, bottom], y up -> top is max y
    return any ? [l, t, r, b] : null;
}

function unionRect(a, b) {
    if (!a) { return b; }
    if (!b) { return a; }
    return [Math.min(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2]), Math.min(a[3], b[3])];
}

function grow(r, d) {
    return r ? [r[0] - d, r[1] + d, r[2] + d, r[3] - d] : r;
}

/* Rigid transform of a static item (Apply tests): every anchor and handle, then bounds bottom-up. */
function transformStatic(o, f) {
    var kids = o.pageItems || o.pathItems;
    if (kids) {
        var gb = null, vb = null;
        kids.forEach(function (c) {
            transformStatic(c, f);
            if (c.guides) { return; }
            gb = unionRect(gb, c.geometricBounds);
            vb = unionRect(vb, c.visibleBounds);
        });
        o.geometricBounds = gb;
        o.visibleBounds = vb;
    } else if (o.typename === "PathItem") {
        var raw = o.pathPoints.map(function (pp) {
            pp.anchor = f(pp.anchor); pp.leftDirection = f(pp.leftDirection); pp.rightDirection = f(pp.rightDirection);
            return pp.anchor.concat(pp.leftDirection, pp.rightDirection);
        });
        o.geometricBounds = pathBounds(raw, o.closed);
        o.visibleBounds = o.stroked ? grow(o.geometricBounds, o.strokeWidth / 2) : o.geometricBounds;
    } else if (o.geometricBounds) {
        // opaque item: axis-aligned box of its rotated frame (what Illustrator reports for a rotated image)
        var b = o.geometricBounds;
        var cs = [[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]].map(f);
        var xs = cs.map(function (p) { return p[0]; }), ys = cs.map(function (p) { return p[1]; });
        o.geometricBounds = o.visibleBounds = [Math.min.apply(null, xs), Math.max.apply(null, ys),
                                               Math.max.apply(null, xs), Math.min.apply(null, ys)];
    }
}

/* spec.throwOnRotate: rotate fails like a DOM error; spec.translateGain: translate moves gain * delta (silent bug) */
function addStaticTransforms(o, spec) {
    var gain = spec.translateGain === undefined ? 1 : spec.translateGain;
    o.translate = function (dx, dy) {
        transformStatic(o, function (p) { return [p[0] + gain * (dx || 0), p[1] + gain * (dy || 0)]; });
    };
    // counter-clockwise about the geometric bounds centre (smoke test: rotate(90) is CCW about the centre)
    o.rotate = function (angle) {
        if (spec.throwOnRotate) { throw new Error("mock DOM failure in rotate"); }
        var b = o.geometricBounds, cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
        var t = angle * Math.PI / 180, c = Math.cos(t), s = Math.sin(t);
        transformStatic(o, function (p) { return [cx + c * (p[0] - cx) - s * (p[1] - cy), cy + s * (p[0] - cx) + c * (p[1] - cy)]; });
    };
}

function build(spec, parent, layer) {
    var o = {
        typename: spec.typename,
        name: spec.name || "",
        hidden: !!spec.hidden,
        locked: !!spec.locked,
        opacity: spec.opacity === undefined ? 100 : spec.opacity,
        parent: parent,
        layer: layer
    };
    if (spec.uuid !== undefined) { o.uuid = spec.uuid; }
    var t = spec.typename;
    if (t === "GroupItem") {
        o.clipped = !!spec.clipped;
        o.pageItems = (spec.pageItems || []).map(function (c) { return build(c, o, layer); });
        // like Illustrator 30.7 (smoke test C08): clipped groups report the bounds of all content, clip path included
        var gb = null, vb = null;
        o.pageItems.forEach(function (c) {
            if (c.guides) { return; }
            gb = unionRect(gb, c.geometricBounds);
            vb = unionRect(vb, c.visibleBounds);
        });
        o.geometricBounds = gb;
        o.visibleBounds = vb;
    } else if (t === "PathItem") {
        ["closed", "filled", "stroked", "evenodd", "clipping", "guides"].forEach(function (k) { o[k] = !!spec[k]; });
        o.strokeWidth = spec.strokeWidth === undefined ? 1 : spec.strokeWidth;
        o.strokeJoin = ENUMS.StrokeJoin[spec.strokeJoin || "MITERENDJOIN"];
        o.strokeCap = ENUMS.StrokeCap[spec.strokeCap || "BUTTENDCAP"];
        o.strokeMiterLimit = spec.strokeMiterLimit === undefined ? 10 : spec.strokeMiterLimit;
        o.pathPoints = (spec.pathPoints || []).map(function (p) {
            return { anchor: [p[0], p[1]], leftDirection: [p[2], p[3]], rightDirection: [p[4], p[5]] };
        });
        o.geometricBounds = pathBounds(spec.pathPoints || [], o.closed);
        o.visibleBounds = o.stroked ? grow(o.geometricBounds, o.strokeWidth / 2) : o.geometricBounds;
        definePathMeasures(o, function () { return o.pathPoints.map(function (pp) { return pp.anchor; }); });
    } else if (t === "CompoundPathItem") {
        o.pathItems = (spec.pathItems || []).map(function (c) {
            var cs = Object.assign({ typename: "PathItem" }, c);
            return build(cs, o, layer);
        });
        var b = null, v = null;
        o.pathItems.forEach(function (c) { b = unionRect(b, c.geometricBounds); v = unionRect(v, c.visibleBounds); });
        o.geometricBounds = b;
        o.visibleBounds = v;
    } else {
        o.geometricBounds = spec.bounds || null;
        o.visibleBounds = spec.bounds || null;
        if (t === "RasterItem" || t === "PlacedItem") { o.embedded = !!spec.embedded; }
    }
    if (spec.throwOnPoints) {
        // simulates a DOM call failing inside Illustrator (e.g. a corrupt item)
        Object.defineProperty(o, "pathPoints", { get: function () { throw new Error("mock DOM failure reading pathPoints"); } });
    }
    if (spec.geometricBounds) { o.geometricBounds = spec.geometricBounds; }
    if (spec.visibleBounds) { o.visibleBounds = spec.visibleBounds; }
    addStaticTransforms(o, spec);
    return o;
}

function buildApp(scene, opts) {
    opts = opts || {};
    var d = scene.document;
    var layer = { typename: "Layer", name: d.layerName || "Layer 1", printable: d.layerPrintable !== false,
                  locked: !!d.layerLocked, visible: d.layerVisible !== false };
    var doc = {
        typename: "Document",
        name: d.name,
        fullName: { fsName: (opts.docPath || "C:\\mock") + "/" + d.name },
        path: { fsName: opts.docPath || "" },
        rulerUnits: ENUMS.RulerUnits.Millimeters,
        documentColorSpace: ENUMS.DocumentColorSpace.CMYK,
        artboards: d.artboards.map(function (a) { return { name: a.name, artboardRect: a.artboardRect }; })
    };
    layer.parent = doc;
    doc.artboards.getActiveArtboardIndex = function () { return d.activeArtboard || 0; };
    doc.selection = (scene.selection || []).map(function (s) { return build(s, layer, layer); });
    doc.getPageItemFromUuid = function (u) {
        function find(items) {
            for (var i = 0; i < items.length; i++) {
                if (items[i].uuid === u) { return items[i]; }
                var hit = find(items[i].pageItems || items[i].pathItems || []);
                if (hit) { return hit; }
            }
            return null;
        }
        var it = find(doc.selection);
        if (!it) { throw new Error("No such element"); }  // shortcut: assumes Illustrator throws for an unknown uuid; Apply handles null too
        return it;
    };
    return {
        app: { version: "29.0.0-mock", activeDocument: doc, documents: { length: 1 },
               coordinateSystem: ENUMS.CoordinateSystem.ARTBOARDCOORDINATESYSTEM },
        doc: doc
    };
}

function emptyApp() {
    return { app: { version: "29.0.0-mock", documents: { length: 0 },
                    coordinateSystem: ENUMS.CoordinateSystem.ARTBOARDCOORDINATESYSTEM }, doc: null };
}

/* ------------------------------------------------------------------ live mock
 * A small mutable DOM for the smoke test: documents.add, groupItems.add,
 * pathItems.add/rectangle/ellipse, setEntirePath, compoundPathItems.add,
 * selection, uuid + getPageItemFromUuid, rotate (counter-clockwise about the
 * bounds centre, as documented for Transformation.CENTER), translate, remove.
 */
var KAPPA = 0.5522847498;
var uuidSeq = 5000;

function liveCollection(owner, kind) {
    var arr = [];
    arr.add = function () {
        var it = kind === "group" ? new LiveGroup(owner) : (kind === "compound" ? new LiveCompound(owner) : new LivePath(owner));
        arr.unshift(it);               // Illustrator adds new items on top (index 0)
        owner._register(it);
        return it;
    };
    if (kind === "path") {
        arr.rectangle = function (top, left, w, h) {
            var p = arr.add();
            p.setEntirePath([[left, top], [left + w, top], [left + w, top - h], [left, top - h]]);
            p.closed = true;
            return p;
        };
        arr.ellipse = function (top, left, w, h) {
            var p = arr.add();
            var cx = left + w / 2, cy = top - h / 2, rx = w / 2, ry = h / 2, kx = KAPPA * rx, ky = KAPPA * ry;
            p._pts = [[cx + rx, cy, cx + rx, cy - ky, cx + rx, cy + ky], [cx, cy + ry, cx + kx, cy + ry, cx - kx, cy + ry],
                      [cx - rx, cy, cx - rx, cy + ky, cx - rx, cy - ky], [cx, cy - ry, cx - kx, cy - ry, cx + kx, cy - ry]];
            p.closed = true;
            return p;
        };
    }
    return arr;
}

function LiveBase(parent) {
    this.parent = parent;
    this.name = "";
    this.hidden = false;
    this.locked = false;
    this.opacity = 100;
    this.uuid = String(uuidSeq++);
    this._doc = parent._doc || parent;
    this.layer = parent.typename === "Layer" ? parent : parent.layer;
}
LiveBase.prototype._register = function (it) { this._doc._all.push(it); };
Object.defineProperty(LiveBase.prototype, "selected", {
    get: function () { return this._doc._sel.indexOf(this) >= 0; },
    set: function (v) {
        var i = this._doc._sel.indexOf(this);
        if (v && i < 0) { this._doc._sel.push(this); }
        if (!v && i >= 0) { this._doc._sel.splice(i, 1); }
    }
});
LiveBase.prototype.remove = function () {
    var self = this;
    var c = this.parent.pageItems || this.parent.pathItems;
    var i = c.indexOf(self);
    if (i >= 0) { c.splice(i, 1); }
    this.selected = false;
};
LiveBase.prototype._rect = function () {
    var acc = [];
    this._allPoints(acc);
    if (!acc.length) { return null; }
    var xs = acc.map(function (p) { return p[0]; }), ys = acc.map(function (p) { return p[1]; });
    return [Math.min.apply(null, xs), Math.max.apply(null, ys), Math.max.apply(null, xs), Math.min.apply(null, ys)];
};
Object.defineProperty(LiveBase.prototype, "geometricBounds", { get: function () { return this._rect(); } });
Object.defineProperty(LiveBase.prototype, "visibleBounds", { get: function () { return this._rect(); } });
LiveBase.prototype._transform = function (f) {
    this._eachPath(function (p) {
        p._pts = p._pts.map(function (r) {
            var a = f(r[0], r[1]), l = f(r[2], r[3]), rr = f(r[4], r[5]);
            return [a[0], a[1], l[0], l[1], rr[0], rr[1]];
        });
    });
};
LiveBase.prototype.translate = function (dx, dy) {
    this._transform(function (x, y) { return [x + (dx || 0), y + (dy || 0)]; });
};
LiveBase.prototype.rotate = function (angle) {
    var b = this._rect();
    var cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
    var t = angle * Math.PI / 180, c = Math.cos(t), s = Math.sin(t);
    this._transform(function (x, y) { return [cx + c * (x - cx) - s * (y - cy), cy + s * (x - cx) + c * (y - cy)]; });
};

Object.defineProperty(LiveBase.prototype, "height", { get: function () { var b = this._rect(); return b[1] - b[3]; } });
Object.defineProperty(LiveBase.prototype, "tags", { get: function () {
    if (!this._tags) {
        var arr = [];
        arr.add = function () { var t = { name: "", value: "" }; arr.push(t); return t; };
        this._tags = arr;
    }
    return this._tags;
} });
/* uniform or not, about the bounds centre; the stroke-width argument is ignored */
LiveBase.prototype.resize = function (sx, sy) {
    var b = this._rect(), cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
    this._transform(function (x, y) { return [cx + (x - cx) * sx / 100, cy + (y - cy) * sy / 100]; });
};
function kindKey(it) {
    return it.typename === "PathItem" ? "pathItems" : (it.typename === "GroupItem" ? "groupItems" : "compoundPathItems");
}
function layerOf(c) { return c.typename === "Layer" ? c : c.layer; }
function setLayer(it, layer) {
    it.layer = layer;
    (it.pageItems || it.pathItems || []).forEach(function (c) { setLayer(c, layer); });
}
/* moving an item out of or into a locked layer fails, as in Illustrator; failMove: any move fails */
LiveBase.prototype.move = function (target, where) {
    var P = ENUMS.ElementPlacement, before = where === P.PLACEBEFORE, after = where === P.PLACEAFTER;
    var dest = before || after ? target.parent : target;
    if (this.layer.locked || layerOf(dest).locked) { throw new Error("mock: the layer is locked"); }
    if (this.failMove) { throw new Error("mock DOM failure in move"); }
    var from = this.parent, self = this;
    [from.pageItems, from[kindKey(this)]].forEach(function (c) {
        var i = c ? c.indexOf(self) : -1;
        if (i >= 0) { c.splice(i, 1); }
    });
    var idx = before || after ? dest.pageItems.indexOf(target) + (after ? 1 : 0)
                              : (where === P.PLACEATBEGINNING ? 0 : dest.pageItems.length);
    dest.pageItems.splice(idx, 0, this);
    if (dest[kindKey(this)] && dest[kindKey(this)] !== dest.pageItems) { dest[kindKey(this)].push(this); }
    this.parent = dest;
    setLayer(this, layerOf(dest));
    return this;
};

function LivePath(parent) {
    LiveBase.call(this, parent);
    this.typename = "PathItem";
    this._pts = [];
    this.closed = false; this.filled = true; this.stroked = false; this.clipping = false; this.guides = false;
    this.evenodd = false; this.strokeWidth = 1;
    this.strokeJoin = ENUMS.StrokeJoin.MITERENDJOIN; this.strokeCap = ENUMS.StrokeCap.BUTTENDCAP; this.strokeMiterLimit = 10;
}
LivePath.prototype = Object.create(LiveBase.prototype);
LivePath.prototype.setEntirePath = function (arr) {
    this._pts = arr.map(function (p) { return [p[0], p[1], p[0], p[1], p[0], p[1]]; });
};
Object.defineProperty(LivePath.prototype, "pathPoints", { get: function () {
    return this._pts.map(function (p) {
        return { anchor: [p[0], p[1]], leftDirection: [p[2], p[3]], rightDirection: [p[4], p[5]] };
    });
} });
LivePath.prototype._allPoints = function (acc) {
    var pts = this._pts, n = pts.length;
    for (var i = 0; i < (this.closed ? n : n - 1); i++) {
        var a = pts[i], b = pts[(i + 1) % n];
        cubicBounds([a[0], a[1]], [a[4], a[5]], [b[2], b[3]], [b[0], b[1]], acc);
    }
    if (n === 1) { acc.push([pts[0][0], pts[0][1]]); }
};
LivePath.prototype._eachPath = function (f) { f(this); };

function LiveCompound(parent) {
    LiveBase.call(this, parent);
    this.typename = "CompoundPathItem";
    this.pathItems = liveCollection(this, "path");
}
LiveCompound.prototype = Object.create(LiveBase.prototype);
LiveCompound.prototype._allPoints = function (acc) { this.pathItems.forEach(function (p) { p._allPoints(acc); }); };
LiveCompound.prototype._eachPath = function (f) { this.pathItems.forEach(f); };

function LiveGroup(parent) {
    LiveBase.call(this, parent);
    this.typename = "GroupItem";
    this._clipped = false;
    this.pageItems = [];
    var self = this;
    ["path", "group", "compound"].forEach(function (kind) {
        var c = liveCollection(self, kind);
        var add = c.add;
        c.add = function () { var it = add(); self.pageItems.unshift(it); return it; };
        if (kind === "path") {
            var rect = c.rectangle, ell = c.ellipse;
            c.rectangle = function () { var it = rect.apply(null, arguments); return it; };
            c.ellipse = function () { var it = ell.apply(null, arguments); return it; };
        }
        self[kind === "path" ? "pathItems" : (kind === "group" ? "groupItems" : "compoundPathItems")] = c;
    });
}
LiveGroup.prototype = Object.create(LiveBase.prototype);
Object.defineProperty(LiveGroup.prototype, "clipped", {
    get: function () { return this._clipped; },
    set: function (v) {
        this._clipped = !!v;
        if (v && this.pageItems.length && this.pageItems[0].typename === "PathItem") { this.pageItems[0].clipping = true; }
    }
});
LiveGroup.prototype._allPoints = function (acc) {
    if (this._clipped && this.pageItems.length && this.pageItems[0].clipping) { this.pageItems[0]._allPoints(acc); return; }
    this.pageItems.forEach(function (c) { c._allPoints(acc); });
};
LiveGroup.prototype._eachPath = function (f) { this.pageItems.forEach(function (c) { c._eachPath(f); }); };

function buildLiveApp() {
    var app = { version: "29.0.0-live-mock", name: "Adobe Illustrator (mock)",
                coordinateSystem: ENUMS.CoordinateSystem.ARTBOARDCOORDINATESYSTEM, _docs: [] };
    app.documents = {
        get length() { return app._docs.length; },
        add: function (space, w, h) {
            var doc = { typename: "Document", name: "Untitled-" + (app._docs.length + 1), _all: [], _sel: [],
                        rulerUnits: ENUMS.RulerUnits.Millimeters, documentColorSpace: space,
                        fullName: { fsName: "Untitled" }, path: { fsName: "" } };
            doc._doc = doc;
            doc.artboards = [{ name: "Artboard 1", artboardRect: [0, h, w, 0] }];
            doc.artboards.getActiveArtboardIndex = function () { return 0; };
            doc.layers = [];
            doc.layers.add = function () {   // new layers go on top
                var layer = { typename: "Layer", name: "Layer " + (doc.layers.length + 1), printable: true, locked: false,
                              visible: true, parent: doc, _doc: doc };
                layer.layer = layer;
                layer._register = function (it) { doc._all.push(it); };
                layer.pageItems = [];
                var groups = liveCollection(layer, "group");
                var add = groups.add;
                groups.add = function () { var it = add(); layer.pageItems.unshift(it); return it; };
                layer.groupItems = groups;
                doc.layers.unshift(layer);
                return layer;
            };
            doc.activeLayer = doc.layers.add();
            Object.defineProperty(doc, "selection", {
                get: function () { return doc._sel.slice(); },
                set: function (v) { doc._sel = v ? v.slice() : []; }
            });
            doc.getPageItemFromUuid = function (u) {
                for (var i = 0; i < doc._all.length; i++) { if (doc._all[i].uuid === u) { return doc._all[i]; } }
                return null;
            };
            app._docs.push(doc);
            app.activeDocument = doc;
            return doc;
        }
    };
    return { app: app };
}

ENUMS.DocumentColorSpace = makeEnum("DocumentColorSpace", ["CMYK", "RGB"]);

module.exports = { buildApp: buildApp, emptyApp: emptyApp, buildLiveApp: buildLiveApp, ENUMS: ENUMS };

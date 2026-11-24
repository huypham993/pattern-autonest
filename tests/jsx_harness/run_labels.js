#!/usr/bin/env node
/*
 * "Place labels" (jsx/lib/an_labels.jsxinc) in the live mock DOM. Prints one JSON line.
 * Pieces are groups with a stroked unfilled cut line; labels are an outlined label (compound path) and a fake
 * TextFrame. The mock proves the logic, not Illustrator's text bounds or rotate behaviour.
 *
 *   node run_labels.js [bundle.jsx]     default: the separate modules of the panel host
 */
"use strict";
var fs = require("fs");
var path = require("path");
var mock = require("./mock_illustrator");
var h = require("./harness");

var ROOT = path.resolve(__dirname, "..", "..");
var MM = 72 / 25.4;
var logs = [];

/* rotated w x h box with a text matrix, enough of a TextFrame for an_labels */
function FakeText(c, w, h, deg, contents) {
    this.typename = "TextFrame";
    this.contents = contents;
    this.locked = false;
    this.hidden = false;
    this._c = c.slice(); this._w = w; this._h = h; this._a = deg;
    this.tags = [];
    this.tags.add = function () { var t = { name: "", value: "" }; this.push(t); return t; };
}
Object.defineProperty(FakeText.prototype, "geometricBounds", { get: function () {
    var t = this._a * Math.PI / 180, ex = Math.abs(Math.cos(t)) * this._w / 2 + Math.abs(Math.sin(t)) * this._h / 2,
        ey = Math.abs(Math.sin(t)) * this._w / 2 + Math.abs(Math.cos(t)) * this._h / 2;
    return [this._c[0] - ex, this._c[1] + ey, this._c[0] + ex, this._c[1] - ey];
} });
Object.defineProperty(FakeText.prototype, "matrix", { get: function () {
    var t = this._a * Math.PI / 180;
    return { mValueA: Math.cos(t), mValueB: Math.sin(t), mValueC: -Math.sin(t), mValueD: Math.cos(t) };
} });
FakeText.prototype.rotate = function (d) { this._a += d; };
FakeText.prototype.translate = function (dx, dy) {
    if (this.failTranslate) { throw new Error("mock DOM failure in translate"); }
    this._c[0] += dx; this._c[1] += dy;
};

/* piece: a group with a filled "print" rectangle and a stroked cut line (a parallelogram, edges at `deg`) */
function piece(doc, x, y, len, wid, deg) {
    var g = doc.activeLayer.groupItems.add();
    var t = deg * Math.PI / 180, ux = Math.cos(t) * len, uy = Math.sin(t) * len;
    var art = g.pathItems.add();
    art.setEntirePath([[x, y], [x + ux, y + uy], [x + ux, y + uy + wid], [x, y + wid]]);
    art.closed = true; art.filled = true; art.stroked = false;
    var cut = g.pathItems.add();
    cut.setEntirePath([[x, y], [x + ux, y + uy], [x + ux, y + uy + wid], [x, y + wid], [x, y]]);   // open, coincident ends
    cut.closed = false; cut.filled = false; cut.stroked = true;
    return g;
}

/* outlined label: a compound path of two filled rectangles, w x h, centred at c */
function outlined(doc, c, w, h) {
    var cp = doc.activeLayer.groupItems.add().compoundPathItems.add();
    var a = cp.pathItems.add(), b = cp.pathItems.add();
    a.setEntirePath([[c[0] - w / 2, c[1] - h / 2], [c[0], c[1] - h / 2], [c[0], c[1] + h / 2], [c[0] - w / 2, c[1] + h / 2]]);
    b.setEntirePath([[c[0] + 1, c[1] - h / 2], [c[0] + w / 2, c[1] - h / 2], [c[0] + w / 2, c[1] + h / 2], [c[0] + 1, c[1] + h / 2]]);
    a.closed = b.closed = true;
    return cp;
}

function center(it) { var b = it.geometricBounds; return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]; }
/* direction of first anchor of the first path -> first anchor of the last path (0 for an upright test label) */
function angle(it) {
    var ps = [];
    (function walk(x) { if (x.pathItems && x.typename !== "PathItem") { (x.pageItems || x.pathItems).forEach(walk); } else if (x.pageItems) { x.pageItems.forEach(walk); } else { ps.push(x); } })(it);
    var a = ps[0].pathPoints[0].anchor, b = ps[ps.length - 1].pathPoints[0].anchor;
    return r3(Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI);
}
function r3(v) { return Math.round(v * 1000) / 1000; }

var built = mock.buildLiveApp();
var app = built.app;
var doc = app.documents.add(mock.ENUMS.DocumentColorSpace.CMYK, 2000, 2000);
var p1 = piece(doc, 100, 100, 300, 60, 20);          // long edges at 20 degrees
var p2 = piece(doc, 100, 600, 300, 60, 160);         // long edges at 160 -> readable -20
var lab1 = outlined(doc, [250, 60], 12 * MM, 4 * MM);           // below p1's lower long edge
var lab2 = new FakeText([0, 640], 12 * MM, 4 * MM, 35, "[201]");  // near p2's lower long edge, already rotated
var far = new FakeText([1800, 1800], 12 * MM, 4 * MM, 0, "[999]");
doc.selection = [p1, lab1, p2, lab2, far];

var bundle = process.argv[2];
var ctx = h.applyContext(app, bundle ? fs.readFileSync(bundle, "utf8") : null);
ctx.$.writeln = function (m) { logs.push(String(m)); };

function snapshot() {
    return { lab1: center(lab1).map(r3), lab1_angle: angle(lab1),
             lab2: center(lab2).map(r3), lab2_angle: r3(lab2._a), far: center(far).map(r3) };
}

var out = { before: snapshot() };
// ScriptUI progress palette (fake Window: proves the calls, not Illustrator's drawing)
var ui = [];
ctx.Window = function (type, title) {
    ui.push("new " + type + " " + title);
    this.add = function () { return {}; };
    this.show = function () {};
    this.update = function () { ui.push(win ? win.label.text + " | " + win.foot.text.replace(/\d+ s$/, "s") : "shown"); };
    this.close = function () { ui.push("close"); };
};
var win = null, realCreate = ctx.AN_Progress.create;
ctx.AN_Progress.create = function (t, n, d) { var p = realCreate(t, n, d); win = p; return p; };
out.first = ctx.AN_placeLabels({ gapMm: 0.5, side: "outside" });
ctx.AN_Progress.create = realCreate;
delete ctx.Window;
out.progress_ui = ui;
out.message = ctx.AN_labelsMessage(out.first);
out.after = snapshot();
// from the panel: progress goes to a file the panel draws (no window), removed at the end
var progFile = path.join(require("os").tmpdir(), "an_labels_test_" + process.pid + ".json.progress"), progWrites = [];
var writeText = ctx.AN_IO.writeText;
ctx.AN_IO.writeText = function (f, t) { if (f.fsName === progFile) { progWrites.push(JSON.parse(t)); } return writeText(f, t); };
out.again = ctx.AN_placeLabels({ gapMm: 0.5, side: "outside", progressFile: progFile }).status;
ctx.AN_IO.writeText = writeText;
out.progress_file = { writes: progWrites, left: fs.existsSync(progFile) };
out.after_again = snapshot();
// a DOM failure on the second label undoes the first one too
lab2.failTranslate = true;
var beforeFail = snapshot();
out.failed = ctx.AN_placeLabels({ gapMm: 2, side: "inside" });
out.after_fail_same = JSON.stringify(snapshot()) === JSON.stringify(beforeFail);
lab2.failTranslate = false;
out.inside = ctx.AN_placeLabels({ gapMm: 1, side: "inside" }).status;
out.after_inside = snapshot();
out.coordinate_system = String(app.coordinateSystem);
out.nothing = ctx.AN_labelsMessage((doc.selection = [lab1], ctx.AN_placeLabels({ gapMm: 0.5 })));
out.text_tagged = lab2.tags.length === 1 && lab2.tags[0].name === "AN_label_upright";
/* a one-path label (an outlined "1"): its angle must be remembered too, or every run turns it again */
out.single = (function () {
    var d = app.documents.add(mock.ENUMS.DocumentColorSpace.CMYK, 2000, 2000);
    var pc = piece(d, 100, 100, 300, 60, 90);                     // long edges vertical
    var one = d.activeLayer.groupItems.add().pathItems.add();
    one.setEntirePath([[60, 250], [60, 270], [56, 266]]);
    one.closed = false; one.filled = false; one.stroked = true;
    d.selection = [pc, one];
    app.activeDocument = d;
    var r = { first: ctx.AN_placeLabels({ gapMm: 0.5 }).status };
    var b1 = one.geometricBounds;
    d.selection = [pc, one];
    r.second = ctx.AN_placeLabels({ gapMm: 0.5 }).status;
    var b2 = one.geometricBounds;
    r.same = b1.every(function (v, i) { return Math.abs(v - b2[i]) < 1e-6; });
    r.turned = Math.abs((b1[2] - b1[0]) - 20) < 1e-6;               // the upright 4 x 20 pt "1" now lies across: turned 90
    app.activeDocument = doc;
    return r;
}());
out.logs = logs.length;

/*
 * Layer mode, as a typical pattern export: layers PatternNumber (labels: groups of stroked paths), OffsetLine (cut
 * lines), Notch, BoundLine (a frame around everything), Image; all but PatternNumber locked; nothing selected.
 * split: each run places the labels first and groups them in a second call (the panel's two buttons).
 */
function layersCase(split) {
    var d = app.documents.add(mock.ENUMS.DocumentColorSpace.CMYK, 2000, 2000), L = {};
    ["Image", "BoundLine", "Notch", "OffsetLine", "PatternNumber"].forEach(function (n) { L[n] = d.layers.add(); L[n].name = n; });
    var box = {}, k;
    ["Image", "BoundLine", "Notch", "OffsetLine", "PatternNumber"].forEach(function (n) { box[n] = L[n].groupItems.add(); });
    function rect(parent, x0, y0, x1, y1, open) {
        var p = parent.pathItems.add();
        p.setEntirePath(open ? [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]] : [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);
        p.closed = !open; p.filled = !open; p.stroked = !!open;
        return p;
    }
    var cuts = [], images = [], notches = [];
    [[100, 100], [400, 100]].forEach(function (o) {
        var x = o[0], y = o[1];
        cuts.push(rect(box.OffsetLine, x, y, x + 100, y + 300, true));
        var n = box.Notch.groupItems.add();
        rect(n, x, y + 50, x + 3, y + 52, false); rect(n, x + 97, y + 280, x + 100, y + 282, false);
        n.pageItems.forEach(function (q) { q.filled = false; q.stroked = true; });
        notches.push(n);
        var im = box.Image.groupItems.add();
        rect(im, x, y, x + 100, y + 300, false);
        images.push(im);
    });
    var mark = box.Notch.groupItems.add();
    rect(mark, 140, 200, 150, 230, false);                       // grain mark inside piece 1
    var lockedMark = box.Notch.groupItems.add();
    rect(lockedMark, 440, 200, 450, 230, false);                 // a locked item inside piece 2 stays
    lockedMark.locked = true;
    var lockedBox = box.Notch.groupItems.add();                  // a locked container is not opened: its group stays
    var lockedInner = lockedBox.groupItems.add();
    rect(lockedInner, 460, 200, 470, 230, false);
    lockedBox.locked = true;
    var hiddenL = d.layers.add();
    hiddenL.name = "Hidden";
    var hiddenArt = hiddenL.groupItems.add();
    rect(hiddenArt, 120, 120, 180, 180, false);                  // inside piece 1, on a hidden layer: stays
    hiddenL.visible = false;
    var frame = box.BoundLine.groupItems.add();
    rect(frame, 50, 50, 600, 500, true);
    function label(x, y) {                                        // 30 x 10 pt, three strokes
        var g = box.PatternNumber.groupItems.add();
        [[0, 0, 0, 10], [8, 0, 18, 10], [22, 0, 30, 10]].forEach(function (s) {
            var p = g.pathItems.add();
            p.setEntirePath([[x + s[0], y + s[1]], [x + s[2], y + s[3]], [x + s[2] - 2, y + s[3]]]);
            p.closed = false; p.filled = false; p.stroked = true;
        });
        g.pageItems.reverse();                                    // first path drawn first
        return g;
    }
    var labs = [label(215, 250), label(430, 240)];               // right of piece 1, inside piece 2
    ["OffsetLine", "Notch", "BoundLine", "Image"].forEach(function (n) { L[n].locked = true; });
    app.activeDocument = d;
    var r = { split: [] };
    function go(opts) {
        if (!split) { return ctx.AN_placeLabels(opts); }
        var sel = d.selection.slice(), parents = labs.map(function (q) { return q.parent; });
        var placed = ctx.AN_placeLabels({ gapMm: opts.gapMm, heightMm: opts.heightMm, group: false });
        var cs = labs.map(function (q) { return center(q).map(r3); });
        r.split.push({ place_grouped: !labs.every(function (q, i) { return q.parent === parents[i]; }) });
        d.selection = sel;
        var g = typeof ctx.AN_panelGroupLabels === "function" ? JSON.parse(ctx.AN_panelGroupLabels("5")) : ctx.AN_placeLabels({ place: false, group: true });
        r.split[r.split.length - 1].moved = labs.some(function (q, i) { return center(q).map(r3).join() !== cs[i].join(); });
        return { status: g.status, placed: placed.placed, grouped: g.grouped, labels: g.labels, not_placed: placed.not_placed, group_errors: g.group_errors };
    }
    d.selection = [labs[0]];                                      // only one label selected: only its piece
    r.first = go({ gapMm: 0.5, heightMm: 5, group: true });
    r.first_selected = d.selection.length;
    d.selection = [];                                             // then the rest: the grouped piece is left alone
    r.rest = go({ gapMm: 0.5, heightMm: 5, group: true });
    r.locked_and_hidden_stay = lockedMark.parent === box.Notch && hiddenArt.parent === hiddenL && lockedInner.parent === lockedBox;
    r.locked = ["OffsetLine", "Notch", "BoundLine", "Image", "PatternNumber"].map(function (n) { return L[n].locked; });
    r.groups = [];
    for (k = 0; k < 2; k++) {
        var g = labs[k].parent, b = labs[k].geometricBounds;
        r.groups.push({ layer: g.layer.name, piece_tag: g.tags.some(function (t) { return t.name === "AN_piece"; }), in_selection: d.selection.indexOf(g) >= 0,
                        members: g.pageItems.map(function (q) {
                            return q === labs[k] ? "label" : q === cuts[k] ? "cut" : q === notches[k] ? "notch" : q === images[k] ? "image" : q === mark ? "mark" : "other";
                        }),
                        size_mm: [r3((b[2] - b[0]) / MM), r3((b[1] - b[3]) / MM)], center: center(labs[k]).map(r3), angle: angle(labs[k]) });
    }
    r.frame_stays = frame.parent === box.BoundLine;
    r.containers_left = ["OffsetLine", "Notch", "Image", "PatternNumber", "BoundLine"].map(function (n) { return L[n].pageItems.length; });
    // re-run on the grouped pieces (selected by the first run) with a larger gap: labels move 0.5 mm further out,
    // even with an ungrouped cut line left on OffsetLine
    rect(L.OffsetLine.groupItems.add(), 1000, 1000, 1100, 1100, true);
    d.selection = [labs[0].parent, labs[1].parent];
    r.second = go({ gapMm: 1, heightMm: 5, group: true });
    r.second_centers = labs.map(function (q) { return center(q).map(r3); });
    // the panel entry, with the strings the panel sends: top right corner, size kept, no grouping
    if (typeof ctx.AN_panelPlaceLabels === "function") {   // not in the standalone script
        r.panel = JSON.parse(ctx.AN_panelPlaceLabels("0.5", "", "top_right", false));
        r.panel_centers = labs.map(function (q) { return center(q).map(r3); });
        r.bad_corner = JSON.parse(ctx.AN_panelPlaceLabels("0.5", "", "middle", false));
    }
    app.activeDocument = doc;
    return r;
}
out.layers = layersCase(false);
out.layers_split = layersCase(true);
/* Group pieces only pairs a label with the one piece within half the piece spacing of its edge */
out.group_distance = (function () {
    var d = app.documents.add(mock.ENUMS.DocumentColorSpace.CMYK, 3000, 3000), MM = 72 / 25.4;
    function rectPiece(x0, x1) {
        var g = d.activeLayer.groupItems.add(), p = g.pathItems.add();
        p.setEntirePath([[x0, 100], [x1, 100], [x1, 400], [x0, 400], [x0, 100]]);
        p.closed = false; p.filled = false; p.stroked = true;
        return g;
    }
    function lab(x) {                                             // 4 x 20 pt: its edge is 2 pt from its centre
        var q = d.activeLayer.groupItems.add().pathItems.add();
        q.setEntirePath([[x - 2, 240], [x - 2, 260], [x + 2, 260], [x + 2, 240]]);
        q.closed = false; q.filled = false; q.stroked = true;
        return q;
    }
    var A = rectPiece(100, 200), B = rectPiece(203, 303), C = rectPiece(700, 800), D = rectPiece(1000, 1100), E = rectPiece(1300, 1400);
    var between = lab(201.5), far = lab(600), c1 = lab(695), c2 = lab(805), inD = lab(1095), nearE = lab(1300 - 2 - 1.5 * MM);
    var all = [A, B, C, D, E, between, far, c1, c2, inD, nearE];
    app.activeDocument = d;
    d.selection = [E, nearE];
    var r = { short: ctx.AN_placeLabels({ place: false, group: true, spacingMm: "2" }) };   // 1.5 mm away: not grouped
    r.short_kept = nearE.parent !== E.parent;
    d.selection = all;
    r.run = ctx.AN_placeLabels({ place: false, group: true, spacingMm: "4" });
    r.grouped = [inD.parent === D.parent, nearE.parent === E.parent];
    r.left = [between, far, c1, c2].map(function (q) { return [A, B, C].some(function (g) { return q.parent === g.parent; }); });
    r.bad = ctx.AN_placeLabels({ place: false, group: true, spacingMm: "x" });
    app.activeDocument = doc;
    return r;
}());
/* a label inside a piece's cut line belongs to that piece: never moved or grouped to a neighbour */
out.inside_piece = (function () {
    var d = app.documents.add(mock.ENUMS.DocumentColorSpace.CMYK, 3000, 3000);
    function rectPiece(x0, x1) {
        var g = d.activeLayer.groupItems.add(), p = g.pathItems.add();
        p.setEntirePath([[x0, 100], [x1, 100], [x1, 400], [x0, 400], [x0, 100]]);
        p.closed = false; p.filled = false; p.stroked = true;
        return g;
    }
    function lab(x, y) {                                          // 20 x 4 pt, like a number
        var q = d.activeLayer.groupItems.add().pathItems.add();
        q.setEntirePath([[x - 10, y - 2], [x + 10, y - 2], [x + 10, y + 2]]);
        q.closed = false; q.filled = false; q.stroked = true;
        return q;
    }
    var A = rectPiece(100, 200), B = rectPiece(203, 303), l1 = lab(150, 250), l2 = lab(150, 300);
    app.activeDocument = d;
    d.selection = [A, B, l1, l2];                                 // two labels inside A, none for B
    var r = { place: ctx.AN_placeLabels({ gapMm: 0.5 }) };
    r.l2_still_inside = center(l2)[0] > 100 && center(l2)[0] < 200;
    var C = rectPiece(1000, 1100), D = rectPiece(1103, 1203), l3 = lab(1098, 250);   // inside C, 1.6 mm from D
    d.selection = [C, D, l3];
    r.group = ctx.AN_placeLabels({ place: false, group: true, spacingMm: "4" });
    r.l3_with_C = l3.parent === C.parent;
    app.activeDocument = doc;
    return r;
}());
/* layer mode: notches and marks sticking out of the cut line are grouped with it while within half the spacing */
out.parts_out = (function () {
    var d = app.documents.add(mock.ENUMS.DocumentColorSpace.CMYK, 2000, 2000), L = {};
    ["Notch", "OffsetLine", "PatternNumber"].forEach(function (n) { var l = d.layers.add(); l.name = n; L[n] = l.groupItems.add(); });
    function path(parent, pts, cut) {
        var p = parent.pathItems.add();
        p.setEntirePath(pts);
        p.closed = !cut; p.filled = !cut; p.stroked = !!cut;
        return p;
    }
    var cut = path(L.OffsetLine, [[100, 100], [200, 100], [200, 400], [100, 400], [100, 100]], true);
    var across = path(L.Notch.groupItems.add(), [[195, 200], [205, 200], [205, 202], [195, 202]], false);   // half outside
    var out1 = path(L.Notch.groupItems.add(), [[200, 250], [206, 250], [206, 252], [200, 252]], false);     // 2 mm out, centre 1 mm
    var far = path(L.Notch.groupItems.add(), [[220, 250], [224, 250], [224, 252], [220, 252]], false);      // centre 7.7 mm out
    var lab = L.PatternNumber.groupItems.add();
    path(lab, [[140, 250], [160, 250], [160, 254]], true);
    // an L-shaped piece; its notches in one group (as in real pattern files, under a wrapper group spanning the sheet) whose
    // centre lies in the L's empty corner, far from the outline
    var cutL = path(L.OffsetLine, [[400, 100], [700, 100], [700, 160], [460, 160], [460, 400], [400, 400], [400, 100]], true);
    var wrap = L.Notch.groupItems.add(), cluster = wrap.groupItems.add(), other = wrap.groupItems.add();
    path(cluster, [[697, 120], [703, 120], [703, 122], [697, 122]], false);
    path(cluster, [[420, 397], [422, 397], [422, 403], [420, 403]], false);
    path(other, [[198, 300], [202, 300], [202, 302], [198, 302]], false);   // a notch of the first piece
    var labL = L.PatternNumber.groupItems.add();
    path(labL, [[420, 250], [440, 250], [440, 254]], true);
    app.activeDocument = d;
    d.selection = [];
    var r = { run: ctx.AN_placeLabels({ place: false, group: true, spacingMm: "5" }) };
    r.with_piece = [across, out1, far].map(function (q) { return q.parent.parent === cut.parent; });
    r.cluster = [cluster.parent === cutL.parent, other.parent === cut.parent];
    r.label_with_piece = lab.parent === cut.parent;
    app.activeDocument = doc;
    return r;
}());
/* Mixed case: frames over two pieces, labels inside a grouped piece, unlabelled pieces, untagged labels */
out.mixed5 = (function () {
    var r = {};
    function layerDoc() {
        var d = app.documents.add(mock.ENUMS.DocumentColorSpace.CMYK, 3000, 3000), L = {};
        ["Notch", "OffsetLine", "PatternNumber"].forEach(function (n) { var l = d.layers.add(); l.name = n; L[n] = l.groupItems.add(); });
        return { d: d, L: L };
    }
    function path(parent, pts, cut) {
        var p = parent.pathItems.add();
        p.setEntirePath(pts);
        p.closed = !cut; p.filled = !cut; p.stroked = !!cut;
        return p;
    }
    function rect(x0, x1) { return [[x0, 100], [x1, 100], [x1, 400], [x0, 400], [x0, 100]]; }
    function lab(parent, x, y) { var g = parent.groupItems.add(); path(g, [[x - 10, y - 2], [x + 10, y - 2], [x + 10, y + 2]], true); return g; }
    // 1. a frame tightly around two pieces 5 mm apart is no part of either
    var a = layerDoc();
    var ca = path(a.L.OffsetLine, rect(100, 200), true), cb = path(a.L.OffsetLine, rect(214, 314), true);
    var frame = path(a.L.Notch.groupItems.add(), [[100, 100], [314, 100], [314, 400], [100, 400]], false);
    lab(a.L.PatternNumber, 150, 250); lab(a.L.PatternNumber, 260, 250);
    app.activeDocument = a.d;
    a.d.selection = [];
    r.frame_run = ctx.AN_placeLabels({ place: false, group: true, spacingMm: "5" });
    r.frame_stays = frame.parent.parent === a.L.Notch;
    // 2. selection mode: an extra label inside an already grouped piece, next to a free piece, is reported
    var d2 = app.documents.add(mock.ENUMS.DocumentColorSpace.CMYK, 3000, 3000);
    function sp(x0, x1) { var g = d2.activeLayer.groupItems.add(); path(g, rect(x0, x1), true); return g; }
    function plab(x, y) {                                         // selection mode: a label is a path, not a group of strokes
        var q = d2.activeLayer.groupItems.add().pathItems.add();
        q.setEntirePath([[x - 10, y - 2], [x + 10, y - 2], [x + 10, y + 2]]);
        q.closed = false; q.filled = false; q.stroked = true;
        return q;
    }
    var A = sp(100, 200), B = sp(203, 303), la = plab(150, 250);
    app.activeDocument = d2;
    d2.selection = [A, la];
    r.first = ctx.AN_placeLabels({ gapMm: 0.5, group: true });
    var extra = plab(190, 300), extraParent = extra.parent;
    d2.selection = [la.parent, B, extra];
    r.occupied = ctx.AN_placeLabels({ place: false, group: true, spacingMm: "4" });
    r.extra_alone = extra.parent === extraParent;
    d2.selection = [la.parent, B, extra];
    var op = ctx.AN_placeLabels({ gapMm: 0.5 });
    r.occupied_place = op.not_placed ? op.not_placed.map(function (n) { return n.reason; }) : op;
    // 3. layer mode, nothing selected: two labels inside one piece -> nothing grouped, the piece is reported
    var c = layerDoc();
    var cc = path(c.L.OffsetLine, rect(100, 200), true);
    lab(c.L.PatternNumber, 150, 200); lab(c.L.PatternNumber, 150, 300);
    app.activeDocument = c.d;
    c.d.selection = [];
    r.two = ctx.AN_placeLabels({ place: false, group: true, spacingMm: "5" });
    r.two_cut_stays = cc.parent === c.L.OffsetLine;
    r.two_selected = c.d.selection.length;
    // 4. a label grouped without being placed gets its tag: a second Group finds the grouped pair
    var e = layerDoc();
    path(e.L.OffsetLine, rect(100, 200), true);
    var le = lab(e.L.PatternNumber, 150, 250);
    app.activeDocument = e.d;
    e.d.selection = [];
    r.untagged_first = ctx.AN_placeLabels({ place: false, group: true, spacingMm: "5" }).grouped;
    r.tagged = le.tags.some(function (t) { return t.name === "AN_label_upright"; });
    e.d.selection = [le.parent];
    var again = ctx.AN_placeLabels({ place: false, group: true, spacingMm: "5" });
    r.again = [again.pieces, again.labels, again.grouped, again.group_errors.length];
    // re-check: a label without paths (an image) is tagged too; selection mode reports an unlabelled piece
    var f = app.documents.add(mock.ENUMS.DocumentColorSpace.CMYK, 3000, 3000);
    function fp(x0, x1) { var g = f.activeLayer.groupItems.add(), p = g.pathItems.add(); p.setEntirePath(rect(x0, x1)); p.closed = false; p.filled = false; p.stroked = true; return g; }
    var F1 = fp(100, 200), F2 = fp(400, 500), img = f.activeLayer.groupItems.add().pathItems.add();
    img.setEntirePath([[150, 250], [150.2, 250], [150.2, 250.2]]);   // too small for a reference direction, as an image
    img.closed = true; img.filled = true; img.stroked = false;
    app.activeDocument = f;
    f.selection = [F1, F2, img];
    r.sel = ctx.AN_placeLabels({ place: false, group: true, spacingMm: "5" });
    r.raster_tag = img.tags.filter(function (t) { return t.name === "AN_label_upright"; }).map(function (t) { return t.value; });
    f.selection = [img.parent];
    var again2 = ctx.AN_placeLabels({ place: false, group: true, spacingMm: "5" });
    r.raster_again = [again2.pieces, again2.labels, again2.grouped, again2.group_errors.length];
    app.activeDocument = doc;
    return r;
}());
/* selection mode, the two buttons: Place labels groups nothing, Group pieces groups without moving the label */
out.split_pair = (function () {
    var d = app.documents.add(mock.ENUMS.DocumentColorSpace.CMYK, 2000, 2000);
    var pc = piece(d, 100, 100, 300, 60, 0), lab = d.activeLayer.groupItems.add().pathItems.add();
    lab.setEntirePath([[250, 120], [270, 120], [270, 124]]);         // wider than tall, like a number
    lab.closed = false; lab.filled = false; lab.stroked = true;
    app.activeDocument = d;
    d.selection = [pc, lab];
    var parent0 = lab.parent, r = { place: ctx.AN_placeLabels({ gapMm: 0.5, group: false }) };
    r.place_grouped = lab.parent !== parent0;
    var c = center(lab).map(r3), writes = [], writeText = ctx.AN_IO.writeText;
    ctx.AN_IO.writeText = function (f, t) { if (f.fsName === progFile) { writes.push(JSON.parse(t)); } return writeText(f, t); };
    d.selection = [pc, lab];
    r.group = ctx.AN_placeLabels({ place: false, group: true, progressFile: progFile });
    ctx.AN_IO.writeText = writeText;
    r.steps = writes.map(function (w) { return w.text + " | " + w.sub; });
    r.moved = center(lab).map(r3).join() !== c.join();
    r.together = lab.parent === pc.parent && lab.parent.typename === "GroupItem" && d.selection.length === 1 && d.selection[0] === lab.parent;
    d.selection = [lab.parent];                                   // grouping again changes nothing
    r.again = ctx.AN_placeLabels({ place: false, group: true });
    r.again_same = d.selection.length === 1 && lab.parent === pc.parent;
    app.activeDocument = doc;
    return r;
}());
/* a piece grouped by a run: its AN_piece tag, or (groups of older builds) a tagged label as first child */
out.grouped_piece = (function () {
    var d = app.documents.add(mock.ENUMS.DocumentColorSpace.CMYK, 500, 500), L = ctx.AN_Labels;
    function grp(pieceTag, firstTagged) {
        var g = d.activeLayer.groupItems.add();
        for (var i = 0; i < 2; i++) { g.pathItems.add().setEntirePath([[0, 0], [10, 10]]); }
        g.pageItems.reverse();
        if (pieceTag) { var t = g.tags.add(); t.name = "AN_piece"; t.value = "1"; }
        if (firstTagged) { var u = g.pageItems[0].tags.add(); u.name = "AN_label_upright"; u.value = "0"; }
        return g;
    }
    var r = [L.isGroupedPiece(grp(true, false)), L.isGroupedPiece(grp(false, true)), L.isGroupedPiece(grp(false, false)),
             L.isGroupedPiece(d.activeLayer.groupItems.add().pathItems.add())];
    app.activeDocument = doc;
    return r;
}());
/* a failed move while grouping: no partial group left selected (layer mode) or left at all (selection mode) */
out.partial = (function () {
    var d = app.documents.add(mock.ENUMS.DocumentColorSpace.CMYK, 2000, 2000), L = {};
    ["Notch", "OffsetLine", "PatternNumber"].forEach(function (n) { var l = d.layers.add(); l.name = n; L[n] = l.groupItems.add(); });
    function path(parent, pts, cut) {
        var p = parent.pathItems.add();
        p.setEntirePath(pts);
        p.closed = !cut; p.filled = !cut; p.stroked = !!cut;
        return p;
    }
    var notches = [], labs = [];
    [100, 400].forEach(function (x) {
        path(L.OffsetLine, [[x, 100], [x + 100, 100], [x + 100, 400], [x, 400], [x, 100]], true);
        var n = L.Notch.groupItems.add();
        path(n, [[x, 150], [x + 3, 150], [x + 3, 152], [x, 152]], false);
        notches.push(n);
        var g = L.PatternNumber.groupItems.add();
        path(g, [[x + 40, 250], [x + 40, 270], [x + 44, 270]], true);
        labs.push(g);
    });
    var lockedCut = L.OffsetLine.groupItems.add();               // piece 3: its cut line sits in a locked group
    path(lockedCut, [[700, 100], [800, 100], [800, 400], [700, 400], [700, 100]], true);
    lockedCut.locked = true;
    var lab3 = L.PatternNumber.groupItems.add();
    path(lab3, [[740, 250], [740, 270], [744, 270]], true);
    notches[1].failMove = true;
    app.activeDocument = d;
    d.selection = [];
    var r = { layer: ctx.AN_placeLabels({ gapMm: 0.5, group: true }) };
    r.layer_selected = d.selection.map(function (g) { return g === labs[0].parent; });
    r.layer_message = ctx.AN_labelsMessage(r.layer);
    r.locked_label_stays = lab3.parent === L.PatternNumber;
    // selection mode: the label cannot move into the new group, the piece goes back where it was
    var d2 = app.documents.add(mock.ENUMS.DocumentColorSpace.CMYK, 2000, 2000);
    var pc = piece(d2, 100, 100, 300, 60, 90), one = d2.activeLayer.groupItems.add().pathItems.add();
    one.setEntirePath([[60, 250], [60, 270], [56, 266]]);
    one.closed = false; one.filled = false; one.stroked = true;
    one.failMove = true;
    var before = d2.activeLayer.pageItems.slice();
    d2.selection = [pc, one];
    app.activeDocument = d2;
    r.pair = ctx.AN_placeLabels({ gapMm: 0.5, group: true });
    r.pair_same = d2.activeLayer.pageItems.length === before.length && before.every(function (q, i) { return d2.activeLayer.pageItems[i] === q; });
    r.pair_selection = d2.selection.length;                           // nothing half grouped left selected
    // the new group cannot be tagged: nothing is grouped and the label is not deleted with the group
    var d5 = app.documents.add(mock.ENUMS.DocumentColorSpace.CMYK, 2000, 2000);
    var pc5 = piece(d5, 100, 100, 300, 60, 90), lab5 = d5.activeLayer.groupItems.add().pathItems.add();
    lab5.setEntirePath([[60, 250], [60, 270], [56, 266]]);
    lab5.closed = false; lab5.filled = false; lab5.stroked = true;
    var gadd = d5.activeLayer.groupItems.add;
    d5.activeLayer.groupItems.add = function () {
        var g = gadd.apply(this, arguments);
        Object.defineProperty(g, "tags", { get: function () { throw new Error("mock: no tags"); } });
        return g;
    };
    d5.selection = [pc5, lab5];
    app.activeDocument = d5;
    r.untagged = ctx.AN_placeLabels({ gapMm: 0.5, group: true });
    r.untagged_label_kept = (function inTree(items) {
        return items.some(function (q) { return q === lab5 || (q.pageItems && inTree(q.pageItems)); });
    }(d5.activeLayer.pageItems));
    // Illustrator refuses to resize a label: the rollback must not shrink it
    var d4 = app.documents.add(mock.ENUMS.DocumentColorSpace.CMYK, 2000, 2000);
    var pc4 = piece(d4, 100, 100, 300, 60, 90), two = d4.activeLayer.groupItems.add().pathItems.add();
    two.setEntirePath([[60, 250], [60, 270], [56, 266]]);
    two.closed = false; two.filled = false; two.stroked = true;
    var resize0 = two.resize;
    two.resize = function (sx) { if (sx > 100) { throw new Error("mock: too large"); } return resize0.apply(this, arguments); };
    var b4 = two.geometricBounds;
    d4.selection = [pc4, two];
    app.activeDocument = d4;
    r.resize = ctx.AN_placeLabels({ gapMm: 0.5, heightMm: 5000 }).status;
    r.resize_same = two.geometricBounds.every(function (v, i) { return Math.abs(v - b4[i]) < 1e-6; });
    // a hidden OffsetLine layer is not used
    var d3 = app.documents.add(mock.ENUMS.DocumentColorSpace.CMYK, 2000, 2000), H = {};
    ["OffsetLine", "PatternNumber"].forEach(function (n) { var l = d3.layers.add(); l.name = n; H[n] = l.groupItems.add(); });
    path(H.OffsetLine, [[100, 100], [200, 100], [200, 400], [100, 400], [100, 100]], true);
    path(H.PatternNumber.groupItems.add(), [[140, 250], [140, 270], [144, 270]], true);
    H.OffsetLine.layer.visible = false;
    app.activeDocument = d3;
    d3.selection = [];
    r.hidden = ctx.AN_placeLabels({ gapMm: 0.5, group: true }).pieces;
    app.activeDocument = doc;
    return r;
}());
/* cut lines read from an SVG export: Illustrator's element kinds, relative commands, packed numbers, bottom first */
out.svg = (function () {
    var L = ctx.AN_Labels, ox = 37, oy = 500;   // AI x = svg x + ox, AI y = oy - svg y
    var text = '<svg><g><polyline fill="none" points="10,20 30.5,20 30.5-5 10,20"/>' +
        '<path fill="none" d="M100,100c10,0,20,10,20,20s-10,20-20,20H80V100z"/>' +
        '<path d="M0,0C1,1,2,2,3,3C4,4,5,5,0,0z"/><line x1="1" y1="2" x2="3" y2="4"/><rect x="5" y="6" width="7" height="8"/>' +
        '<polygon points=".5.5 1e1,2 3,4"/><linearGradient/><clipPath/></g></svg>';
    var svg = L.parseSvg(text), r = { count: svg.length };
    r.path = rows(svg[1]);                                                   // anchors with their handles
    r.closed_curve = rows(svg[2]);                                           // back to the start: one anchor
    r.bad = [L.parseSvg('<path d="M0,0A1,1,0,0,1,2,2"/>'), L.parseSvg('<path d="M0,0L1,1M2,2L3,3"/>'),
             L.parseSvg('<g transform="translate(1 2)"><path d="M0,0L1,1"/></g>')];
    // geometric bounds of the AI paths, top first (reverse of the file), as Illustrator would report them
    function rows(f) { var r = []; for (var j = 0; j < f.length; j += 6) { r.push(f.slice(j, j + 6)); } return r; }
    var gb = svg.slice().reverse().map(function (flat) {
        var xs = [], ys = [], pts = rows(flat);
        pts.forEach(function (q, i) {
            var c = pts[(i + 1) % pts.length];
            for (var k = 0; k <= 64; k++) {
                var t = k / 64, u = 1 - t;
                xs.push(u * u * u * q[0] + 3 * u * u * t * q[4] + 3 * u * t * t * c[2] + t * t * t * c[0]);
                ys.push(u * u * u * q[1] + 3 * u * u * t * q[5] + 3 * u * t * t * c[3] + t * t * t * c[1]);
            }
        });
        return [Math.min.apply(null, xs) + ox, oy - Math.min.apply(null, ys), Math.max.apply(null, xs) + ox, oy - Math.max.apply(null, ys)];
    });
    var al = L.alignSvg(svg, gb);
    r.aligned_first = rows(al[0]);                                           // the polygon, the last element of the file
    r.aligned_curve = rows(al[4])[1];                                        // second anchor of the curved path
    gb[3][0] += 1;
    r.misaligned = L.alignSvg(svg, gb);
    r.wrong_count = L.alignSvg(svg.slice(1), gb.slice(1));
    return r;
}());
/* geometry: labels around an arc-shaped piece (like curved pattern pieces) must end outside, gap away from the cut line */
out.arc = (function () {
    var L = ctx.AN_Labels, poly = [], i, R1 = 400, R2 = 440, n = 60, gap = 0.5 * MM, w = 12 * MM, hh = 4 * MM;
    for (i = 0; i <= n; i++) { var t = (-50 + 100 * i / n) * Math.PI / 180; poly.push([R2 * Math.cos(t), R2 * Math.sin(t)]); }
    for (i = n; i >= 0; i--) { var u = (-50 + 100 * i / n) * Math.PI / 180; poly.push([R1 * Math.cos(u), R1 * Math.sin(u)]); }
    function inside(p) {
        var c = false;
        for (var a = 0, b = poly.length - 1; a < poly.length; b = a++) {
            if ((poly[a][1] > p[1]) !== (poly[b][1] > p[1]) &&
                p[0] < (poly[b][0] - poly[a][0]) * (p[1] - poly[a][1]) / (poly[b][1] - poly[a][1]) + poly[a][0]) { c = !c; }
        }
        return c;
    }
    function dist(p) {
        var best = Infinity;
        for (var k = 0; k < poly.length; k++) {
            var a = poly[k], b = poly[(k + 1) % poly.length], dx = b[0] - a[0], dy = b[1] - a[1];
            var t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)));
            best = Math.min(best, Math.hypot(a[0] + t * dx - p[0], a[1] + t * dy - p[1]));
        }
        return best;
    }
    var res = { placed: 0, tried: 0, min_gap: Infinity, max_gap: 0, inside_hits: 0, upside_down: 0 };
    for (var side = -1; side <= 1; side += 2) {
        for (var k = 0; k < 24; k++) {
            var th = k * 15 * Math.PI / 180, c0 = [420 + 300 * Math.cos(th), 300 * Math.sin(th)];
            var r = L.place(L.flatten([].concat.apply([], poly.map(function (p) { return [p[0], p[1], p[0], p[1], p[0], p[1]]; }))), w, hh, c0,
                            { gap: gap, side: side });
            res.tried++;
            if (!r) { continue; }
            res.placed++;
            if (r.angle <= -90 || r.angle > 90) { res.upside_down++; }
            var a = r.angle * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a), lo = Infinity;
            for (var s = 0; s <= 40; s++) {
                var e = [[-w / 2 + w * s / 40, -hh / 2], [-w / 2 + w * s / 40, hh / 2], [-w / 2, -hh / 2 + hh * s / 40], [w / 2, -hh / 2 + hh * s / 40]];
                for (var q = 0; q < 4; q++) {
                    var p = [r.center[0] + e[q][0] * ca - e[q][1] * sa, r.center[1] + e[q][0] * sa + e[q][1] * ca];
                    if (inside(p) === (side === 1)) { res.inside_hits++; }
                    lo = Math.min(lo, dist(p));
                }
            }
            res.min_gap = Math.min(res.min_gap, lo / MM);
            res.max_gap = Math.max(res.max_gap, lo / MM);
        }
    }
    // a big Bezier circle (four cubics, r 1000 pt): the label keeps the gap to the true curve, not just to its chords
    var K = 0.5523 * 1000, cub = [[1000, 0, 1000, -K, 1000, K], [0, 1000, K, 1000, -K, 1000], [-1000, 0, -1000, K, -1000, -K], [0, -1000, -K, -1000, K, -1000]];
    var fine = [];
    for (i = 0; i < 4; i++) {
        var A = cub[i], B = cub[(i + 1) % 4];
        for (var j = 0; j < 2000; j++) {
            var t = j / 2000, u = 1 - t;
            fine.push([u * u * u * A[0] + 3 * u * u * t * A[4] + 3 * u * t * t * B[2] + t * t * t * B[0],
                       u * u * u * A[1] + 3 * u * u * t * A[5] + 3 * u * t * t * B[3] + t * t * t * B[1]]);
        }
    }
    var rc = L.place(L.flatten([].concat.apply([], cub)), 60, 2.835, [-1000, 1000], { gap: gap, side: 1 }), cw = 60, ch = 2.835;
    var ac = rc.angle * Math.PI / 180, low = Infinity;
    for (var s2 = 0; s2 <= 60; s2++) {
        [[-cw / 2 + cw * s2 / 60, -ch / 2], [-cw / 2 + cw * s2 / 60, ch / 2]].forEach(function (e) {
            var p = [rc.center[0] + e[0] * Math.cos(ac) - e[1] * Math.sin(ac), rc.center[1] + e[0] * Math.sin(ac) + e[1] * Math.cos(ac)];
            var rr = Math.hypot(p[0], p[1]);
            fine.forEach(function (q) { low = Math.min(low, Math.hypot(q[0] - p[0], q[1] - p[1]) * (rr < 999 ? -1 : 1)); });
        });
    }
    res.circle_gap_mm = low / MM;
    // handles on the chord line but beyond an anchor: the curve bulges past it (to x 239.43 here), not a straight chord
    var bulge = L.flatten([0, 0, 0, 0, 300, 0, 100, 0, 300, 0, 100, 0, 50, 50, 50, 50, 50, 50]);
    res.bulge_max_x = r3(Math.max.apply(null, bulge.x));
    return res;
}());
console.log(JSON.stringify(out));

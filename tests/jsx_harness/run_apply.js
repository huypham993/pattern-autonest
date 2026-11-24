#!/usr/bin/env node
/*
 * Apply a placement to a fixture scene in the mock DOM and check the result independently.
 *
 *   node run_apply.js <scene.json> <geometry.json> <placement.json> [--bundle f] [--fail-after n]
 *                     [--panel <geometry sha256>]   (go through AN_panelApply, as the CEP panel does)
 *                     [--export-after <file>]       (export the same groups again after Apply)
 *                     [--resize-artboard]           (resize the artboard to the fabric width x nested length)
 *                     [--artboard-max-pt n]         (the artboard clamps a larger width, like the canvas limit)
 *
 * Prints one JSON line: the AN_applyPlacement result plus
 *   max_point_err_pt  largest distance, over EVERY anchor and handle of every placed group,
 *                     between the moved point and matrix * exported point (not just the trackers)
 *   max_restore_err_pt  same against the exported point, over all groups
 *   max_doc_change_pt   largest move of any point vs the document before Apply (refusal: 0; rollback: ~0)
 *   unplaced_max_move_pt  for unplaced groups: deviation from a pure translation (must be ~0)
 *   parked_min_gap_to_artboard_pt / parked_overlaps  unplaced groups must end up right of the artboard, not overlapping
 *   coordinate_system  app.coordinateSystem after the run (must be restored)
 * The mock proves the logic, not Illustrator's behaviour.
 */
"use strict";
var fs = require("fs");
var mock = require("./mock_illustrator");
var h = require("./harness");

var argv = process.argv.slice(2);
function opt(name) { var i = argv.indexOf(name); if (i < 0) { return null; } var v = argv[i + 1]; argv.splice(i, 2); return v; }
var bundlePath = opt("--bundle");
var failAfter = opt("--fail-after");
var panelSha = opt("--panel");
var exportAfter = opt("--export-after");
var resize = argv.indexOf("--resize-artboard") >= 0;
if (resize) { argv.splice(argv.indexOf("--resize-artboard"), 1); }
var scene = JSON.parse(fs.readFileSync(argv[0], "utf8"));
var geoPath = argv[1], plPath = argv[2];
var geo = JSON.parse(fs.readFileSync(geoPath, "utf8"));
var pl = JSON.parse(fs.readFileSync(plPath, "utf8"));

var built = mock.buildApp(scene);
var abMax = opt("--artboard-max-pt");
if (abMax) {   // like Illustrator's canvas limit: a larger artboard is clamped, not refused
    var ab0 = built.doc.artboards[0], rect = ab0.artboardRect;
    Object.defineProperty(ab0, "artboardRect", { get: function () { return rect.slice(); }, set: function (v) {
        rect = [v[0], v[1], Math.min(v[2], v[0] + Number(abMax)), v[3]]; } });
}
function allPoints(items, out) {
    items.forEach(function (it) {
        (it.pathPoints || []).forEach(function (pp) { out.push(pp.anchor.concat(pp.leftDirection, pp.rightDirection)); });
        allPoints(it.pageItems || it.pathItems || [], out);
    });
    return out;
}
var before = allPoints(built.doc.selection, []);
var ctx = h.applyContext(built.app, bundlePath ? fs.readFileSync(bundlePath, "utf8") : null);
var r = panelSha ? JSON.parse(ctx.AN_panelApply(plPath, panelSha)) :
    JSON.parse(JSON.stringify(ctx.AN_applyPlacement({ placementPath: plPath, geometryPath: geoPath,
                                                      _failAfter: failAfter ? Number(failAfter) : undefined,
                                                      resizeArtboard: resize })));
r.artboard_rect_after = built.doc.artboards[0].artboardRect;

/* walk exported node tree and live item together, yielding [exported point row, live pathPoint] */
function pairs(node, item, out) {
    if (node.kind === "group") { node.children.forEach(function (c, i) { pairs(c, item.pageItems[i], out); }); }
    else if (node.kind === "compound") { node.paths.forEach(function (p, i) { pairs(p, item.pathItems[i], out); }); }
    else if (node.kind === "path") { node.points.forEach(function (row, i) { out.push([row, item.pathPoints[i]]); }); }
    return out;
}
function app(m, x, y) { return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; }
function d(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }
var ID = [1, 0, 0, 1, 0, 0];
var byUuid = {};
pl.placements.forEach(function (p) { byUuid[p.uuid] = p; });
var placedErr = 0, restoreErr = 0, unplacedMove = 0, shift = {};
geo.groups.forEach(function (g) {
    var item;
    try { item = built.doc.getPageItemFromUuid(g.uuid); } catch (e) { return; }  // group deleted by the test
    var p = byUuid[g.uuid];
    pairs(g.root, item, []).forEach(function (pr) {
        var row = pr[0], live = pr[1];
        [[0, "anchor"], [2, "leftDirection"], [4, "rightDirection"]].forEach(function (k) {
            var cur = live[k[1]];
            if (p) {
                placedErr = Math.max(placedErr, d(cur, app(p.matrix, row[k[0]], row[k[0] + 1])));
            } else {
                // unplaced groups are moved off the artboard by a pure translation
                if (!shift[g.uuid]) { shift[g.uuid] = [cur[0] - row[k[0]], cur[1] - row[k[0] + 1]]; }
                var t = shift[g.uuid];
                unplacedMove = Math.max(unplacedMove, d(cur, [row[k[0]] + t[0], row[k[0] + 1] + t[1]]));
            }
            restoreErr = Math.max(restoreErr, d(cur, [row[k[0]], row[k[0] + 1]]));
        });
    });
});
var docChange = 0;
allPoints(built.doc.selection, []).forEach(function (p, i) {
    for (var k = 0; k < 6; k += 2) { docChange = Math.max(docChange, d([p[k], p[k + 1]], [before[i][k], before[i][k + 1]])); }
});
r.max_doc_change_pt = docChange;
// parked groups: left edge vs artboard right edge (> 0 = off the artboard), and overlaps between parked boxes
var abR = built.doc.artboards[pl.source.artboard.index].artboardRect[2], boxes = [];
geo.groups.forEach(function (g) {
    if (byUuid[g.uuid]) { return; }
    try { boxes.push(built.doc.getPageItemFromUuid(g.uuid).visibleBounds); } catch (e) { /* deleted by the test */ }
});
r.parked_min_gap_to_artboard_pt = boxes.length ? Math.min.apply(null, boxes.map(function (b) { return b[0] - abR; })) : null;
r.parked_overlaps = 0;
boxes.forEach(function (a, i) { boxes.slice(i + 1).forEach(function (b) {
    if (a[0] < b[2] && b[0] < a[2] && a[3] < b[1] && b[3] < a[1]) { r.parked_overlaps++; }
}); });  // vs the document before Apply (0 = untouched)
r.max_point_err_pt = placedErr;
r.max_restore_err_pt = restoreErr;
r.unplaced_max_move_pt = unplacedMove;
r.coordinate_system = String(built.app.coordinateSystem);
r.alerts = ctx.__alerts;
if (exportAfter) {  // the same selection exported again after Apply, for tools/check_apply.py
    var after = JSON.parse(ctx.AN_JSON.stringify(ctx.AN_Extract.run(built.doc, scene.settings || {}, { version: "mock" })));
    fs.writeFileSync(exportAfter, JSON.stringify(after));
}
console.log(JSON.stringify(r));

#!/usr/bin/env node
/*
 * The CEP panel's three steps without CEP:
 *   AN_panelExport (dist/AutoNesting_PanelHost.jsx in the mock DOM) -> panel/js/core.js runNest (real engine,
 *   AUTONEST_ENGINE_CMD) -> AN_panelApply.  Prints one JSON line.  The mock proves logic, not Illustrator.
 *
 *   AUTONEST_ENGINE_CMD='["python3","engine/nest_engine.py"]' node run_panel_flow.js <scene.json> <docs dir> [quality]
 */
"use strict";
var fs = require("fs");
var path = require("path");
var mock = require("./mock_illustrator");
var h = require("./harness");
var core = require("../../panel/js/core.js");

var ROOT = path.resolve(__dirname, "..", "..");
var scene = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
var built = mock.buildApp(scene);
var ctx = h.applyContext(built.app, fs.readFileSync(path.join(ROOT, "dist", "AutoNesting_PanelHost.jsx"), "utf8"),
                         { documentsDir: process.argv[3] });
// the host also writes each reply to the file the panel passes (fallback when the evalScript reply is lost)
var expFile = path.join(process.argv[3], "export_reply.json");
// and its progress to <reply>.progress, which the panel draws; the file is gone at the end
var progress = [], writeText = ctx.AN_IO.writeText;
ctx.AN_IO.writeText = function (f, t) { if (/\.progress$/.test(f.fsName)) { progress.push(JSON.parse(t)); } return writeText(f, t); };
var expText = ctx.AN_panelExport("", expFile);
var exp = core.parseHostResult(expText);
var out = { export: exp, export_file_same: fs.readFileSync(expFile, "utf8") === expText,
            export_progress: progress.slice(), export_progress_left: fs.existsSync(expFile + ".progress") };
progress.length = 0;
// same selection, nothing edited: the panel can reuse geometry.json
var fingerprint = exp.signature;
out.recheck = core.parseHostResult(ctx.AN_panelExport(fingerprint)).status;
// an anchor moved inside a path, group bounds unchanged: the signature must change, and come back when undone
out.inner_edit = (function () {
    var groups = built.doc.selection;
    for (var g = 0; g < groups.length; g++) {
        var items = groups[g].pageItems || [];
        for (var i = 0; i < items.length; i++) {
            if (items[i].typename !== "PathItem") { continue; }
            var pts = items[i].pathPoints, b = groups[g].geometricBounds;
            for (var k = 1; k < pts.length; k++) {
                var a = pts[k].anchor;
                if (a[0] > b[0] + 2 && a[0] < b[2] - 2 && a[1] < b[1] - 2 && a[1] > b[3] + 2) {
                    var keep = [pts[k].anchor, pts[k].leftDirection, pts[k].rightDirection];
                    var nudge = function (p) { return [p[0] + 0.5, p[1] + 0.5]; };
                    pts[k].anchor = nudge(keep[0]); pts[k].leftDirection = nudge(keep[1]); pts[k].rightDirection = nudge(keep[2]);
                    var bounds_same = JSON.stringify(groups[g].geometricBounds) === JSON.stringify(b);
                    var seen = JSON.stringify(ctx.AN_panelSignature()) !== fingerprint;
                    pts[k].anchor = keep[0]; pts[k].leftDirection = keep[1]; pts[k].rightDirection = keep[2];
                    return { bounds_same: bounds_same, seen: seen, undone: JSON.stringify(ctx.AN_panelSignature()) === fingerprint };
                }
            }
        }
    }
    return null;
}());
core.runNest(path.join(ROOT, "panel"), exp.geometryPath, { spacing_mm: 5, margin_mm: 10, rotation_preset: "step",
             rotation_step_deg: 5, quality: process.argv[4] || "fast", time_limit_s: 3 }, function (err, res) {
    if (err) { out.error = err.message; console.log(JSON.stringify(out)); return; }
    out.nest = { code: res.code, outcome: res.outcome, svg: fs.existsSync(res.svgPath), summary: core.summarize(res.placement),
                 sha: res.geometrySha256 };
    var applyFile = path.join(process.argv[3], "apply_reply.json");
    var call = core.jsxCall("AN_panelApply", [res.placementPath, res.geometrySha256, false, applyFile]);
    var applyText = require("vm").runInContext(call, ctx);
    out.apply = core.parseHostResult(applyText);
    out.apply_file_same = fs.readFileSync(applyFile, "utf8") === applyText;
    out.apply_progress = progress.slice();
    out.apply_progress_left = fs.existsSync(applyFile + ".progress");
    // after Apply the groups moved: the cheap selection check must ask for a new export
    out.after_apply_check = core.parseHostResult(ctx.AN_panelExport(fingerprint)).status;
    out.coordinate_system = String(built.app.coordinateSystem);
    console.log(JSON.stringify(out));
});

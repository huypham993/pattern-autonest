#!/usr/bin/env node
/*
 * CLI around harness.js.
 *
 *   node run_extract.js <scene.json> <out geometry.json> [--bundle dist/Illustrator_AutoNesting_Standalone.jsx]
 *   node run_extract.js --json-selftest [--bundle file]
 *   node run_extract.js --smoke [--bundle file] [--docs dir]  (live mock DOM; NOT a real Illustrator test)
 */
"use strict";
var fs = require("fs");
var h = require("./harness");

var argv = process.argv.slice(2);
var bi = argv.indexOf("--bundle");
var bundleText = null;
if (bi >= 0) {
    bundleText = fs.readFileSync(argv[bi + 1], "utf8");
    argv.splice(bi, 2);
}

if (argv[0] === "--json-selftest") {
    var r = bundleText ? h.jsonSelfTestWithBundleText(bundleText) : h.jsonSelfTestWithModules();
    console.log((r.ok ? "JSON selftest OK " : "JSON selftest FAIL ") + r.detail);
    process.exit(r.ok ? 0 : 1);
} else if (argv[0] === "--smoke") {
    var di = argv.indexOf("--docs");
    var s = h.runSmoke({ bundleText: bundleText, fsOptions: di > 0 ? { documentsDir: argv[di + 1] } : undefined });
    console.log(s.result.rows.join("\n"));
    console.log("PASS " + s.result.pass + " / FAIL " + s.result.fail + " (mock DOM)");
    process.exit(s.result.fail ? 1 : 0);
} else if (argv.length === 2) {
    var scene = JSON.parse(fs.readFileSync(argv[0], "utf8"));
    var geo = bundleText ? h.extractWithBundleText(bundleText, scene) : h.extractWithModules(scene);
    fs.writeFileSync(argv[1], JSON.stringify(geo), "utf8");
    console.log("wrote " + argv[1] + " groups=" + geo.groups.length + " skipped=" + geo.skipped_selection.length);
} else {
    console.error("usage: run_extract.js <scene.json> <out.json> [--bundle f] | --json-selftest [--bundle f] | --smoke [--bundle f] [--docs dir]");
    process.exit(2);
}

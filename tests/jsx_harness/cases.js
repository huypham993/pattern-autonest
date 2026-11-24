#!/usr/bin/env node
/*
 * JSX regression cases, run by tests/test_jsx_build.py:  node cases.js <case-name>
 * Each case prints one JSON line {ok: bool, detail: ...} and exits 0 (ok) or 1.
 * All cases run the real ExtendScript code in the mock DOM (Node vm) unless noted.
 */
"use strict";
var fs = require("fs");
var os = require("os");
var path = require("path");
var h = require("./harness");
var S = require("../../tools/build/jsx_static");

var ROOT = path.resolve(__dirname, "..", "..");
var DIST = path.join(ROOT, "dist", "Illustrator_AutoNesting_Standalone.jsx");
var SMOKE = path.join(ROOT, "dist", "AutoNesting_SmokeTest_Standalone.jsx");
var JSONLIB = path.join(ROOT, "jsx", "lib", "an_json.jsxinc");
var K = 72 / 25.4;

function bundle() { return fs.readFileSync(DIST, "utf8"); }
function scene(name) { return JSON.parse(fs.readFileSync(path.join(ROOT, "fixtures", "scenes", name + ".scene.json"), "utf8")); }

function rect(x, y, w, hh) {
    return [[x, y], [x + w, y], [x + w, y + hh], [x, y + hh]].map(function (p) {
        var X = p[0] * K, Y = -400 * K + p[1] * K;
        return [X, Y, X, Y, X, Y];
    });
}

function simpleScene(items, extra) {
    return Object.assign({ document: { name: "t.ai", artboards: [{ name: "A", artboardRect: [0, 0, 600 * K, -400 * K] }] },
                           settings: {}, selection: items }, extra || {});
}

var cases = {
    /* Error 4: the exact root cause (raw U+FEFF in a string literal) is rejected by the byte gate,
       and the current source line 66 uses an ASCII escape. */
    error4_raw_bom_detected: function () {
        var src = fs.readFileSync(JSONLIB, "utf8");
        var lines = src.split("\n");
        var line66 = lines[65];
        var asciiNow = /ch === "\\uFEFF"/.test(line66) && S.checkBytes(Buffer.from(src, "utf8")).length === 0;
        lines[65] = line66.replace('"\\uFEFF"', '"\uFEFF"');
        var probs = S.checkBytes(Buffer.from(lines.join("\n"), "utf8"));
        var hit = probs.filter(function (p) { return p.line === 66 && /U\+FEFF/.test(p.msg); }).length === 1;
        var acornAccepts = S.parseES3(lines.join("\n")).error === null; // why the old gate missed it
        return { ok: asciiNow && hit && acornAccepts, detail: { line66_is_ascii_escape: asciiNow, gate_reports_line66: hit,
                 acorn_alone_accepts_raw_bom: acornAccepts } };
    },

    /* Error 4 (second mechanism): a merge step that decodes escapes turns "\n" into a real newline;
       the ES3 parse gate reports "Unterminated string constant" at the whitespace line. */
    error4_decoded_escapes_detected: function () {
        var src = fs.readFileSync(JSONLIB, "utf8");
        var broken = src.replace('ch === "\\n"', 'ch === "\n"');
        var r = S.parseES3(broken);
        return { ok: !!r.error && r.error.line === 66 && /Unterminated string/.test(r.error.msg), detail: r.error };
    },

    /* Error 48: the standalone has no include directive and runs with no lib folder present. */
    error48_bundle_has_no_includes: function () {
        var text = bundle();
        var inc = text.split(/\r\n/).filter(function (l) { return /^\s*(\/\/@include|#include)\b/.test(l); });
        var tmp = fs.mkdtempSync(path.join(os.tmpdir(), "an-alone-"));
        var lonely = path.join(tmp, "Illustrator_AutoNesting_Standalone.jsx");
        fs.writeFileSync(lonely, text);
        var geo = h.extractWithBundleText(fs.readFileSync(lonely, "utf8"), scene("01_LU_10"));
        return { ok: inc.length === 0 && geo.groups.length === 10, detail: { include_lines: inc.length, groups: geo.groups.length } };
    },

    bundle_es3_ascii_crlf: function () {
        var out = {};
        [DIST, SMOKE].forEach(function (f) {
            var buf = fs.readFileSync(f);
            var text = buf.toString("utf8");
            var r = S.parseES3(text);
            out[path.basename(f)] = { es3_error: r.error, non_ascii: S.checkBytes(buf).length,
                                      bare_lf: (text.match(/[^\r]\n/g) || []).length,
                                      semantic: r.ast ? S.checkAST(r.ast, { allowGlobals: { AN_NO_MAIN: 1 } }).length : -1 };
        });
        var ok = Object.keys(out).every(function (k) {
            var o = out[k];
            return o.es3_error === null && o.non_ascii === 0 && o.bare_lf === 0 && o.semantic === 0;
        });
        return { ok: ok, detail: out };
    },

    static_checker_catches_problems: function () {
        function probs(src) { var r = S.parseES3(src); return r.error ? [r.error] : S.checkAST(r.ast, {}); }
        var res = {
            undeclared: probs("var a = 1; AN_Jsonn.parse(a);").length === 1,
            es5_api: probs("var a = [1]; a.forEach(function (x) {});").length === 1,
            json_global: probs("var s = JSON.stringify({});").length === 1,
            duplicate: probs("var X = 1;\nfunction X() {}").length === 1,
            object_keys: probs("var k = Object.keys({});").length === 1,
            folder_create_ok: probs("var f = new Folder('x'); f.create();").length === 0,
            typeof_guard_ok: probs("if (typeof AN_NO_MAIN === 'undefined') { var q = 1; }").length === 0,
            let_rejected: probs("let a = 1;").length === 1,
            arrow_rejected: probs("var f = function () {}; var g = (a) => a;").length === 1,
            template_rejected: probs("var s = `x`;").length === 1,
            trailing_comma_rejected: probs("var o = {a: 1,};").length === 1
        };
        var ok = Object.keys(res).every(function (k) { return res[k]; });
        return { ok: ok, detail: res };
    },

    json_codec_modules: function () { return h.jsonSelfTestWithModules(); },
    json_codec_bundle: function () { return h.jsonSelfTestWithBundleText(bundle()); },

    equivalence_all_scenes: function () {
        var dir = path.join(ROOT, "fixtures", "scenes");
        var names = fs.readdirSync(dir).filter(function (n) { return /\.scene\.json$/.test(n); });
        var diff = names.filter(function (n) {
            var sc = JSON.parse(fs.readFileSync(path.join(dir, n), "utf8"));
            return JSON.stringify(h.extractWithModules(sc)) !== JSON.stringify(h.extractWithBundleText(bundle(), sc));
        });
        return { ok: diff.length === 0 && names.length >= 10, detail: { scenes: names.length, different: diff } };
    },

    main_ok_unsaved_document: function () {
        var r = h.runMain(scene("04_clip_raster"), { bundleText: bundle() });
        var geoPath = r.result.geometryPath;
        var ok = r.result.status === "ok" && fs.existsSync(geoPath) && /AutoNesting[\/\\]geometry\.json$/.test(geoPath);
        var geo = ok ? JSON.parse(fs.readFileSync(geoPath, "utf8")) : null;
        ok = ok && geo.groups.length === 9 && fs.existsSync(r.result.diagnosticsPath) &&
             String(r.app.coordinateSystem) === "CoordinateSystem.ARTBOARDCOORDINATESYSTEM" && r.alerts.length === 1;
        return { ok: ok, detail: { status: r.result.status, geometryPath: geoPath, alerts: r.alerts.length } };
    },

    main_unicode_and_spaces_path: function () {
        var base = fs.mkdtempSync(path.join(os.tmpdir(), "an-"));
        var docDir = path.join(base, "T\u00e0i li\u1EC7u", "th\u01B0 m\u1EE5c c\u00f3 d\u1EA5u c\u00e1ch");
        fs.mkdirSync(docDir, { recursive: true });
        var sc = scene("01_LU_10");
        sc.document.name = "\u0110\u01A1n h\u00e0ng 01.ai";
        var r = h.runMain(sc, { bundleText: bundle(), docPath: docDir });
        var expected = path.join(docDir, "\u0110\u01A1n h\u00e0ng 01_autonest", "geometry.json");
        var ok = r.result.status === "ok" && r.result.geometryPath === expected && fs.existsSync(expected);
        var geo = ok ? JSON.parse(fs.readFileSync(expected, "utf8")) : null;
        ok = ok && geo.document.name === sc.document.name;
        return { ok: ok, detail: { status: r.result.status, path: r.result.geometryPath } };
    },

    main_windows_style_strings_roundtrip: function () {
        var sc = scene("01_LU_10");
        sc.document.name = "C:\\Users\\User\\Desktop\\job \"A\".ai";
        var r = h.runMain(sc, { bundleText: bundle() });
        var geo = JSON.parse(fs.readFileSync(r.result.geometryPath, "utf8"));
        return { ok: geo.document.name === sc.document.name, detail: geo.document.name };
    },

    main_empty_selection: function () {
        var r = h.runMain(simpleScene([]), { bundleText: bundle() });
        var ok = r.result.status === "empty_selection" && r.result.geometryPath === null && /Select the groups/.test(r.alerts[0]);
        return { ok: ok, detail: { status: r.result.status, alert: r.alerts[0] } };
    },

    main_only_non_groups_selected: function () {
        var r = h.runMain(simpleScene([{ typename: "PathItem", closed: true, filled: true, pathPoints: rect(0, 0, 10, 10) }]),
                          { bundleText: bundle() });
        return { ok: r.result.status === "empty_selection" && /skipped 1/i.test(r.alerts[0]), detail: r.alerts[0] };
    },

    main_no_document: function () {
        var r = h.runMain(null, { bundleText: bundle() });
        return { ok: r.result.status === "no_document" && /No document is open/.test(r.alerts[0]), detail: r.alerts[0] };
    },

    main_write_failure_reports_step: function () {
        var docs = fs.mkdtempSync(path.join(os.tmpdir(), "an-ro-"));
        var r = h.runMain(scene("01_LU_10"), { bundleText: bundle(),
                          fsOptions: { documentsDir: docs, failWritesUnder: docs } });
        var ok = r.result.status === "error" && r.result.step === "resolve-output-folder" &&
                 /Permission denied/.test(r.result.error) && /ERROR at step: resolve-output-folder/.test(r.alerts[0]) &&
                 fs.existsSync(r.result.diagnosticsPath) &&
                 String(r.app.coordinateSystem) === "CoordinateSystem.ARTBOARDCOORDINATESYSTEM";
        return { ok: ok, detail: { status: r.result.status, step: r.result.step, error: r.result.error,
                                   diagnostics: r.result.diagnosticsPath } };
    },

    main_dom_failure_restores_state: function () {
        var items = [{ typename: "GroupItem", uuid: "1", pageItems: [{ typename: "PathItem", closed: true, filled: true,
                       pathPoints: rect(0, 0, 10, 10), throwOnPoints: true }] }];
        var r = h.runMain(simpleScene(items), { bundleText: bundle() });
        var diag = r.result.diagnosticsPath && fs.existsSync(r.result.diagnosticsPath) ?
            fs.readFileSync(r.result.diagnosticsPath, "utf8") : "";
        var ok = r.result.status === "error" && r.result.step === "extract" && /mock DOM failure/.test(r.result.error) &&
                 String(r.app.coordinateSystem) === "CoordinateSystem.ARTBOARDCOORDINATESYSTEM" &&
                 /coordinate system restored after error/.test(diag) && /FAILED at step 'extract'/.test(diag);
        return { ok: ok, detail: { status: r.result.status, step: r.result.step, error: r.result.error } };
    },

    main_large_path: function () {
        var pts = [];
        for (var i = 0; i < 20000; i++) {
            var a = 2 * Math.PI * i / 20000, X = (300 + 100 * Math.cos(a)) * K, Y = (-200 + 100 * Math.sin(a)) * K;
            pts.push([X, Y, X, Y, X, Y]);
        }
        var t0 = Date.now();
        var r = h.runMain(simpleScene([{ typename: "GroupItem", uuid: "1", pageItems: [{ typename: "PathItem", closed: true,
                          filled: true, pathPoints: pts }] }]), { bundleText: bundle() });
        var geo = JSON.parse(fs.readFileSync(r.result.geometryPath, "utf8"));
        return { ok: r.result.status === "ok" && geo.groups[0].root.children[0].points.length === 20000,
                 detail: { ms_in_node: Date.now() - t0 } };
    },

    /* ScriptUI progress palette: one update per exported group, closed at the end; a palette that cannot be
       created is logged and the export still succeeds. (Fake Window: proves the calls, not Illustrator's drawing.) */
    main_progress_palette: function () {
        var events = [];
        function FakeWindow(type, title) {
            events.push("new " + type + " " + title);
            this.add = function (kind) { var c = { kind: kind }; return c; };
            this.show = function () { events.push("show"); };
            this.update = function () { events.push("update"); };
            this.close = function () { events.push("close"); };
        }
        var r = h.runMain(scene("01_LU_10"), { bundleText: bundle(), globals: { Window: FakeWindow } });
        var updates = events.filter(function (e) { return e === "update"; }).length;
        var broken = h.runMain(scene("01_LU_10"), { bundleText: bundle(),
                                globals: { Window: function () { throw new Error("no ScriptUI"); } } });
        var diag = fs.readFileSync(broken.result.diagnosticsPath, "utf8");
        var ok = r.result.status === "ok" && events[0] === "new palette Auto Nesting - exporting" &&
                 updates === 11 && events[events.length - 1] === "close" &&
                 broken.result.status === "ok" && /progress window unavailable: Error: no ScriptUI/.test(diag) &&
                 /exported g010 'LU10' points=\d+ ms=\d+/.test(diag);
        return { ok: ok, detail: { first: events[0], updates: updates, last: events[events.length - 1],
                                   broken: broken.result.status } };
    },

    smoke_kit_runs_in_mock: function () {
        var r = h.runSmoke({ bundleText: fs.readFileSync(SMOKE, "utf8") });
        return { ok: r.result.fail === 0 && r.result.pass >= 20, detail: { pass: r.result.pass, fail: r.result.fail } };
    }
};

var name = process.argv[2];
if (name === "--list") { console.log(Object.keys(cases).join("\n")); process.exit(0); }
if (!cases[name]) { console.error("unknown case " + name); process.exit(2); }
var res;
try { res = cases[name](); } catch (e) { res = { ok: false, detail: String(e && e.stack || e) }; }
console.log(JSON.stringify(res));
process.exit(res.ok ? 0 : 1);

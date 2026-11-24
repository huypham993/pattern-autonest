/*
 * Runs the ExtendScript code (separate modules or a built bundle) inside a
 * Node vm context with a mock Illustrator DOM and a mock File/Folder layer
 * backed by a real temporary directory.
 *
 * What this proves: the JavaScript logic, the JSON contract and the bundle
 * are consistent.  What it does NOT prove: anything about Adobe Illustrator's
 * own behaviour (see jsx/lib/an_smoke.jsxinc for the real-Illustrator test).
 */
"use strict";
var fs = require("fs");
var os = require("os");
var path = require("path");
var vm = require("vm");
var mock = require("./mock_illustrator");

var ROOT = path.resolve(__dirname, "..", "..");
var EXTRACT_LIBS = ["jsx/lib/an_json.jsxinc", "jsx/lib/an_extract.jsxinc"];
var ALL_LIBS = EXTRACT_LIBS.concat(["jsx/lib/an_io.jsxinc", "jsx/lib/an_main.jsxinc", "jsx/lib/an_smoke.jsxinc"]);
var APPLY_LIBS = EXTRACT_LIBS.concat(["jsx/lib/an_io.jsxinc", "jsx/lib/an_main.jsxinc", "jsx/lib/an_apply.jsxinc",
                                      "jsx/lib/an_panel.jsxinc", "jsx/lib/an_labels.jsxinc"]);

/* ---------------------------------------------------------------- File / Folder mock */
function makeFS(opts) {
    opts = opts || {};
    var failUnder = opts.failWritesUnder || null;
    function norm(p) { return path.resolve(String(p).replace(/\\/g, "/")); }

    function Folder(p) {
        if (!(this instanceof Folder)) { return new Folder(p); }
        this.fsName = norm(p);
        this.error = "";
    }
    Object.defineProperty(Folder.prototype, "exists", { get: function () {
        return fs.existsSync(this.fsName) && fs.statSync(this.fsName).isDirectory();
    } });
    Object.defineProperty(Folder.prototype, "parent", { get: function () { return new Folder(path.dirname(this.fsName)); } });
    Folder.prototype.create = function () {
        if (failUnder && this.fsName.indexOf(failUnder) === 0) { this.error = "Permission denied (mock)"; return false; }
        try { fs.mkdirSync(this.fsName, { recursive: true }); return true; } catch (e) { this.error = e.message; return false; }
    };
    Folder.prototype.toString = function () { return this.fsName; };

    function File(p) {
        if (!(this instanceof File)) { return new File(p); }
        this.fsName = norm(p);
        this.encoding = "BINARY";
        this.lineFeed = "Unix";
        this.error = "";
        this._mode = null;
        this._buf = "";
    }
    Object.defineProperty(File.prototype, "exists", { get: function () { return fs.existsSync(this.fsName); } });
    Object.defineProperty(File.prototype, "parent", { get: function () { return new Folder(path.dirname(this.fsName)); } });
    File.prototype.open = function (mode) {
        if (mode === "w" && failUnder && this.fsName.indexOf(failUnder) === 0) { this.error = "Permission denied (mock)"; return false; }
        if (mode === "w" && !fs.existsSync(path.dirname(this.fsName))) { this.error = "Folder does not exist"; return false; }
        if (mode === "r" && !fs.existsSync(this.fsName)) { this.error = "File or folder does not exist"; return false; }
        this._mode = mode;
        this._buf = mode === "r" ? fs.readFileSync(this.fsName, "utf8") : "";
        return true;
    };
    File.prototype.write = function () {
        if (this._mode !== "w") { return false; }
        for (var i = 0; i < arguments.length; i++) { this._buf += String(arguments[i]); }
        return true;
    };
    File.prototype.read = function () { return this._mode === "r" ? this._buf : ""; };
    File.prototype.close = function () {
        if (this._mode === "w") { fs.writeFileSync(this.fsName, this._buf, "utf8"); }
        this._mode = null;
        return true;
    };
    File.prototype.remove = function () { try { fs.unlinkSync(this.fsName); return true; } catch (e) { return false; } };
    File.prototype.toString = function () { return this.fsName; };

    var docs = opts.documentsDir || fs.mkdtempSync(path.join(os.tmpdir(), "an-docs-"));
    Folder.myDocuments = new Folder(docs);
    Folder.temp = new Folder(opts.tempDir || fs.mkdtempSync(path.join(os.tmpdir(), "an-temp-")));
    return { File: File, Folder: Folder, documentsDir: docs };
}

/* ---------------------------------------------------------------- contexts */
function baseContext(appObj, fsLayer, extra) {
    var alerts = [];
    var ctx = Object.assign({}, mock.ENUMS, {
        app: appObj,
        File: fsLayer ? fsLayer.File : undefined,
        Folder: fsLayer ? fsLayer.Folder : undefined,
        CMYKColor: function () { this.typename = "CMYKColor"; },
        alert: function (m) { alerts.push(String(m)); },
        $: { fileName: "/mock/script.jsx", version: "4.5-mock", build: "mock", os: "Linux (mock)", locale: "vi_VN",
             stack: "", sleep: function () {} }
    }, extra || {});
    vm.createContext(ctx);
    ctx.__alerts = alerts;
    return ctx;
}

function loadModules(ctx, libs) {
    libs.forEach(function (rel) {
        var file = path.join(ROOT, rel);
        vm.runInContext(fs.readFileSync(file, "utf8"), ctx, { filename: file });
    });
    return ctx;
}

function loadBundleText(ctx, text, filename) {
    vm.runInContext(text, ctx, { filename: filename || "bundle.jsx" });
    return ctx;
}

function deterministic(geo) {
    geo.generator.exported_at = "fixture";
    geo.export_stats.elapsed_ms = 0;
    return geo;
}

function extractIn(ctx, built, scene) {
    var geo = ctx.AN_Extract.run(built.doc, scene.settings || {}, { version: built.app.version });
    // pass through the ExtendScript encoder, then a standard parser: what a file on disk would contain
    return deterministic(JSON.parse(ctx.AN_JSON.stringify(geo)));
}

function extractWithModules(scene) {
    var built = mock.buildApp(scene);
    var ctx = loadModules(baseContext(built.app, null, { AN_NO_MAIN: true }), EXTRACT_LIBS);
    return extractIn(ctx, built, scene);
}

function extractWithBundleText(text, scene) {
    var built = mock.buildApp(scene);
    var ctx = loadBundleText(baseContext(built.app, makeFS(), { AN_NO_MAIN: true }), text);
    return extractIn(ctx, built, scene);
}

var JSON_SAMPLE_ESCAPES = { ws: " \t\n\r", quote: "\"", backslash: "\\", slash: "/", ctrl: "\u0001\u001f",
                            bom: "\uFEFF", ls: "\u2028\u2029", vi: "Vi\u1EC7t Nam", path: "C:\\Users\\User\\T\u00e0i li\u1EC7u\\job 1.ai",
                            nums: [0, -0.5, 1e-7, 123456789.125, -1e21], nested: { a: [[], {}], b: null, t: true, f: false } };

function jsonSelfTestIn(ctx) {
    var text = ctx.AN_JSON.stringify(JSON_SAMPLE_ESCAPES);
    var std = JSON.parse(text);
    var back = ctx.AN_JSON.parse(text);
    var ok = JSON.stringify(std) === JSON.stringify(JSON_SAMPLE_ESCAPES) && JSON.stringify(back) === JSON.stringify(std);
    // the decoder must accept standard JSON with all whitespace kinds and escapes
    var pretty = JSON.stringify(JSON_SAMPLE_ESCAPES, null, "\t").replace(/\n/g, "\r\n");
    ok = ok && JSON.stringify(ctx.AN_JSON.parse("\uFEFF" + pretty)) === JSON.stringify(JSON_SAMPLE_ESCAPES);
    var rejected = 0;
    var bad = ["{\"a\":}", "[1,]", "{'a':1}", "tru", "\"unterminated", "1 2", "{\"a\" 1}", "[\"\\x\"]", "", "nul"];
    bad.forEach(function (r) { try { ctx.AN_JSON.parse(r); } catch (e) { rejected++; } });
    return { ok: ok && rejected === bad.length, detail: "round-trip=" + ok + " rejected=" + rejected + "/" + bad.length };
}

function jsonSelfTestWithBundleText(text) {
    return jsonSelfTestIn(loadBundleText(baseContext({}, makeFS(), { AN_NO_MAIN: true }), text));
}

function jsonSelfTestWithModules() {
    return jsonSelfTestIn(loadModules(baseContext({}, null, { AN_NO_MAIN: true }), ["jsx/lib/an_json.jsxinc"]));
}

/*
 * Run the real AN_main() of a bundle (or of the modules) against a scene.
 * opts: {bundleText, fsOptions, docPath, globals (extra ExtendScript globals, e.g. a fake ScriptUI Window)}
 */
function runMain(scene, opts) {
    opts = opts || {};
    var built = scene ? mock.buildApp(scene, { docPath: opts.docPath }) : mock.emptyApp();
    var fsLayer = makeFS(opts.fsOptions);
    var ctx = baseContext(built.app, fsLayer, Object.assign({ AN_NO_MAIN: true }, opts.globals || {}));
    if (opts.bundleText) { loadBundleText(ctx, opts.bundleText); } else { loadModules(ctx, ALL_LIBS); }
    var result = ctx.AN_main();
    return { result: JSON.parse(JSON.stringify(result, function (k, v) { return k === "geo" ? undefined : v; })),
             alerts: ctx.__alerts, app: built.app, fs: fsLayer };
}

/* Run the smoke test against the live mock DOM. */
function runSmoke(opts) {
    opts = opts || {};
    var live = mock.buildLiveApp();
    var fsLayer = makeFS(opts.fsOptions);
    var ctx = baseContext(live.app, fsLayer, { AN_NO_MAIN: true });
    if (opts.bundleText) { loadBundleText(ctx, opts.bundleText); } else { loadModules(ctx, ALL_LIBS); }
    var r = ctx.AN_smokeMain();
    return { result: { pass: r.pass, fail: r.fail, rows: r.rows, reportPath: r.reportPath }, alerts: ctx.__alerts,
             fs: fsLayer };
}

/* Context with the Apply code (modules, or a bundle text) loaded against a built mock app. */
function applyContext(appObj, bundleText, fsOptions) {
    var ctx = baseContext(appObj, makeFS(fsOptions), { AN_NO_MAIN: true });
    if (bundleText) { loadBundleText(ctx, bundleText); } else { loadModules(ctx, APPLY_LIBS); }
    return ctx;
}

module.exports = {
    applyContext: applyContext,
    extractWithModules: extractWithModules, extractWithBundleText: extractWithBundleText,
    jsonSelfTestWithBundleText: jsonSelfTestWithBundleText, jsonSelfTestWithModules: jsonSelfTestWithModules,
    runMain: runMain, runSmoke: runSmoke, makeFS: makeFS
};

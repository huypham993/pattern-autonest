//@target illustrator
// GENERATED FILE - DO NOT EDIT. Built by tools/build/build_jsx.js from jsx/Illustrator_AutoNesting.jsx.
// Single file: no //@include, no external dependencies. Run it from File > Scripts > Other Script...
// Sources:
//   jsx/lib/an_json.jsxinc  sha256=b96487cfd4e2326bcbc27b2a48b42e119bde6235d1f7d2d309bd8985de800c17
//   jsx/lib/an_extract.jsxinc  sha256=2c0ba13d08e3ab10ff1cc3518cbef800f1dd0a37f2e008bdba8e5a9f1b9bb3d1
//   jsx/lib/an_io.jsxinc  sha256=839e8c39117efb7080faf0f9c514d556d395cd849a6bb1afc1eda3e713651df2
//   jsx/lib/an_main.jsxinc  sha256=adcfaa6dfc58edf7e38dfaf5c750835be4d83ec00571c75af5db0399087d1c97
var AN_BUILD_INFO = { label: "autonest 0.4.0 Export Geometry (Illustrator_AutoNesting_Standalone.jsx)", version: "0.4.0" };
/*
 * Illustrator True-Shape Auto Nesting - DEVELOPMENT ENTRY POINT.
 *
 * DO NOT distribute or run this file on its own: it pulls in jsx/lib/*.jsxinc
 * through //@include, which fails with "Error 48: File or folder does not
 * exist" whenever the lib folder is not next to it (for example when only
 * this file is downloaded, or when it is run from inside a zip archive).
 *
 * Users run the single-file build instead:
 *     dist/Illustrator_AutoNesting_Standalone.jsx
 * produced and verified by:  node tools/build/build_jsx.js
 */
// ===== BEGIN jsx/lib/an_json.jsxinc sha256=b96487cfd4e2326bcbc27b2a48b42e119bde6235d1f7d2d309bd8985de800c17 =====
/*
 * an_json.jsxinc - minimal JSON encoder/decoder for ExtendScript (ES3).
 * Illustrator's ExtendScript engine has no built-in JSON object.
 * The decoder is a strict recursive-descent parser (never uses eval).
 */
var AN_JSON = (function () {
    function pad4(n) {
        var s = n.toString(16);
        while (s.length < 4) { s = "0" + s; }
        return s;
    }

    function quote(str) {
        var out = "\"";
        for (var i = 0; i < str.length; i++) {
            var c = str.charAt(i);
            var code = str.charCodeAt(i);
            if (c === "\"") { out += "\\\""; }
            else if (c === "\\") { out += "\\\\"; }
            else if (c === "\n") { out += "\\n"; }
            else if (c === "\r") { out += "\\r"; }
            else if (c === "\t") { out += "\\t"; }
            else if (code < 32 || code === 0x2028 || code === 0x2029) { out += "\\u" + pad4(code); }
            else { out += c; }
        }
        return out + "\"";
    }

    function isArray(v) {
        return Object.prototype.toString.call(v) === "[object Array]";
    }

    function stringify(v) {
        var t = typeof v;
        if (v === null || t === "undefined" || t === "function") { return "null"; }
        if (t === "number") { return isFinite(v) ? String(v) : "null"; }
        if (t === "boolean") { return v ? "true" : "false"; }
        if (t === "string") { return quote(v); }
        var parts = [], i, k;
        if (isArray(v)) {
            for (i = 0; i < v.length; i++) { parts.push(stringify(v[i])); }
            return "[" + parts.join(",") + "]";
        }
        for (k in v) {
            if (v.hasOwnProperty(k) && typeof v[k] !== "function" && typeof v[k] !== "undefined") {
                parts.push(quote(k) + ":" + stringify(v[k]));
            }
        }
        return "{" + parts.join(",") + "}";
    }

    function parse(text) {
        var at = 0;
        var ch = " ";

        function error(m) {
            throw new Error("JSON parse error at " + at + ": " + m);
        }
        function next(expected) {
            if (expected && expected !== ch) { error("expected '" + expected + "' found '" + ch + "'"); }
            ch = text.charAt(at);
            at += 1;
            return ch;
        }
        function white() {
            while (ch && (ch === " " || ch === "\t" || ch === "\n" || ch === "\r" || ch === "\uFEFF")) { next(); }
        }
        function number() {
            var s = "";
            if (ch === "-") { s = "-"; next("-"); }
            while (ch >= "0" && ch <= "9") { s += ch; next(); }
            if (ch === ".") { s += "."; while (next() && ch >= "0" && ch <= "9") { s += ch; } }
            if (ch === "e" || ch === "E") {
                s += ch; next();
                if (ch === "-" || ch === "+") { s += ch; next(); }
                while (ch >= "0" && ch <= "9") { s += ch; next(); }
            }
            var n = +s;
            if (!isFinite(n) || s === "" || s === "-") { error("bad number"); }
            return n;
        }
        function string() {
            var s = "", hex, i, u;
            var esc = { "\"": "\"", "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" };
            if (ch !== "\"") { error("expected string"); }
            while (next()) {
                if (ch === "\"") { next(); return s; }
                if (ch === "\\") {
                    next();
                    if (ch === "u") {
                        u = 0;
                        for (i = 0; i < 4; i++) {
                            hex = parseInt(next(), 16);
                            if (!isFinite(hex)) { error("bad \\u escape"); }
                            u = u * 16 + hex;
                        }
                        s += String.fromCharCode(u);
                    } else if (esc.hasOwnProperty(ch)) {
                        s += esc[ch];
                    } else { error("bad escape"); }
                } else { s += ch; }
            }
            error("unterminated string");
        }
        function word() {
            if (ch === "t") { next("t"); next("r"); next("u"); next("e"); return true; }
            if (ch === "f") { next("f"); next("a"); next("l"); next("s"); next("e"); return false; }
            if (ch === "n") { next("n"); next("u"); next("l"); next("l"); return null; }
            error("unexpected '" + ch + "'");
        }
        function array() {
            var a = [];
            next("[");
            white();
            if (ch === "]") { next("]"); return a; }
            while (ch) {
                a.push(value());
                white();
                if (ch === "]") { next("]"); return a; }
                next(",");
                white();
            }
            error("unterminated array");
        }
        function object() {
            var o = {}, k;
            next("{");
            white();
            if (ch === "}") { next("}"); return o; }
            while (ch) {
                k = string();
                white();
                next(":");
                o[k] = value();
                white();
                if (ch === "}") { next("}"); return o; }
                next(",");
                white();
            }
            error("unterminated object");
        }
        function value() {
            white();
            if (ch === "{") { return object(); }
            if (ch === "[") { return array(); }
            if (ch === "\"") { return string(); }
            if (ch === "-" || (ch >= "0" && ch <= "9")) { return number(); }
            return word();
        }

        var result = value();
        white();
        if (ch) { error("trailing characters"); }
        return result;
    }

    return { stringify: stringify, parse: parse };
}());
// ===== END jsx/lib/an_json.jsxinc =====
// ===== BEGIN jsx/lib/an_extract.jsxinc sha256=2c0ba13d08e3ab10ff1cc3518cbef800f1dd0a37f2e008bdba8e5a9f1b9bb3d1 =====
/*
 * an_extract.jsxinc - read-only geometry extraction for Illustrator Auto Nesting.
 *
 * Produces an "autonest.geometry/1" object from the selected GroupItems of a
 * document.  This module NEVER modifies the document: it only reads DOM
 * properties (no duplicate, outline, expand, flatten, tags or renaming).
 *
 * Coordinates are exported raw, in points, in Illustrator's document
 * coordinate system (y up).  The caller must set
 * app.coordinateSystem = CoordinateSystem.DOCUMENTCOORDINATESYSTEM before
 * calling AN_Extract.run so that artboardRect and path anchors share one
 * coordinate system.  Bezier handles are exported as-is; curve flattening
 * happens in the Python engine with a configurable tolerance.
 *
 * ExtendScript is ES3: no Array.indexOf/forEach, no String.trim, no JSON.
 */
var AN_Extract = (function () {
    var VERSION = "0.4.0";
    var PRECISION = 10000; // round coordinates to 1e-4 pt (0.035 micrometre)

    var OPAQUE_TYPES = {
        RasterItem: 1, PlacedItem: 1, TextFrame: 1, SymbolItem: 1, MeshItem: 1,
        PluginItem: 1, GraphItem: 1, LegacyTextItem: 1, NonNativeItem: 1
    };

    function r4(v) {
        if (typeof v !== "number" || !isFinite(v)) { return null; }
        return Math.round(v * PRECISION) / PRECISION;
    }

    function rect(b) {
        if (!b || b.length !== 4) { return null; }
        return [r4(b[0]), r4(b[1]), r4(b[2]), r4(b[3])];
    }

    /* Safe property read: some properties throw on some item types. */
    function prop(obj, name, dflt) {
        try {
            var v = obj[name];
            return (typeof v === "undefined") ? dflt : v;
        } catch (e) {
            return dflt;
        }
    }

    function enumName(v) {
        var s = String(v);
        var i = s.lastIndexOf(".");
        return i >= 0 ? s.substr(i + 1) : s;
    }

    function strokeInfo(p) {
        var join = enumName(prop(p, "strokeJoin", "MITERENDJOIN"));
        var cap = enumName(prop(p, "strokeCap", "BUTTENDCAP"));
        return {
            width_pt: r4(prop(p, "strokeWidth", 0)),
            join: join === "ROUNDENDJOIN" ? "round" : (join === "BEVELENDJOIN" ? "bevel" : "miter"),
            cap: cap === "ROUNDENDCAP" ? "round" : (cap === "PROJECTINGENDCAP" ? "projecting" : "butt"),
            miter_limit: r4(prop(p, "strokeMiterLimit", 10))
        };
    }

    function Ctx(settings) {
        this.settings = settings;
        this.issues = [];
        this.pointCount = 0;
        this.trackA = null;   // {node_path, point_index, anchor_pt}
        this.trackB = null;
        this.trackBDist = -1;
        this.counts = { paths: 0, compounds: 0, groups: 0, opaque: 0 };
    }

    Ctx.prototype.issue = function (code, severity, message, nodePath) {
        this.issues.push({ code: code, severity: severity, message: message, node_path: nodePath });
    };

    /* Keep two anchors far apart: used after Apply to verify the transform. */
    Ctx.prototype.track = function (nodePath, idx, ax, ay) {
        if (this.trackA === null) {
            this.trackA = { node_path: nodePath, point_index: idx, anchor_pt: [ax, ay] };
            return;
        }
        var dx = ax - this.trackA.anchor_pt[0], dy = ay - this.trackA.anchor_pt[1];
        var d = dx * dx + dy * dy;
        if (d > this.trackBDist) {
            this.trackBDist = d;
            this.trackB = { node_path: nodePath, point_index: idx, anchor_pt: [ax, ay] };
        }
    };

    function exportPoints(pathItem, nodePath, ctx) {
        var pps = pathItem.pathPoints;
        var n = pps.length;
        var out = [];
        for (var i = 0; i < n; i++) {
            var pp = pps[i];
            var a = pp.anchor, l = pp.leftDirection, r = pp.rightDirection;
            var ax = r4(a[0]), ay = r4(a[1]);
            out.push([ax, ay, r4(l[0]), r4(l[1]), r4(r[0]), r4(r[1])]);
            if (ax !== null && ay !== null) { ctx.track(nodePath, i, ax, ay); }
        }
        ctx.pointCount += n;
        return out;
    }

    function common(item, kind) {
        return {
            kind: kind,
            typename: item.typename,
            name: prop(item, "name", ""),
            hidden: !!prop(item, "hidden", false),
            locked: !!prop(item, "locked", false),
            opacity: r4(prop(item, "opacity", 100))
        };
    }

    function exportPath(item, nodePath, ctx) {
        var node = common(item, "path");
        ctx.counts.paths++;
        node.closed = !!prop(item, "closed", false);
        node.filled = !!prop(item, "filled", false);
        node.stroked = !!prop(item, "stroked", false);
        node.clipping = !!prop(item, "clipping", false);
        node.guides = !!prop(item, "guides", false);
        node.fill_rule = prop(item, "evenodd", false) ? "evenodd" : "nonzero";
        if (node.stroked) {
            node.stroke = strokeInfo(item);
            node.visible_bounds_pt = rect(prop(item, "visibleBounds", null));
        }
        node.points = exportPoints(item, nodePath, ctx);
        return node;
    }

    function exportCompound(item, nodePath, ctx) {
        var node = common(item, "compound");
        ctx.counts.compounds++;
        var subs = item.pathItems;
        node.paths = [];
        var first = subs.length > 0 ? subs[0] : null;
        // A compound path's appearance lives on its sub-paths (all share it).
        node.filled = first ? !!prop(first, "filled", false) : false;
        node.stroked = first ? !!prop(first, "stroked", false) : false;
        node.clipping = first ? !!prop(first, "clipping", false) : false;
        node.guides = first ? !!prop(first, "guides", false) : false;
        node.fill_rule = (first && prop(first, "evenodd", false)) ? "evenodd" : "nonzero";
        if (node.stroked) { node.stroke = strokeInfo(first); }
        node.geometric_bounds_pt = rect(prop(item, "geometricBounds", null));
        for (var i = 0; i < subs.length; i++) {
            var sp = subs[i];
            var spPath = nodePath.concat([i]);
            node.paths.push({
                kind: "path",
                closed: !!prop(sp, "closed", false),
                points: exportPoints(sp, spPath, ctx)
            });
        }
        return node;
    }

    function exportOpaque(item, nodePath, ctx) {
        var node = common(item, "opaque");
        ctx.counts.opaque++;
        node.geometric_bounds_pt = rect(prop(item, "geometricBounds", null));
        node.visible_bounds_pt = rect(prop(item, "visibleBounds", null));
        if (item.typename === "PlacedItem" || item.typename === "RasterItem") {
            node.embedded = !!prop(item, "embedded", false);
        }
        return node;
    }

    function exportGroup(item, nodePath, ctx) {
        var node = common(item, "group");
        ctx.counts.groups++;
        node.clipped = !!prop(item, "clipped", false);
        node.children = [];
        var items = item.pageItems;
        for (var i = 0; i < items.length; i++) {
            node.children.push(exportItem(items[i], nodePath.concat([i]), ctx));
        }
        return node;
    }

    function exportItem(item, nodePath, ctx) {
        var t = item.typename;
        if (t === "GroupItem") { return exportGroup(item, nodePath, ctx); }
        if (t === "PathItem") { return exportPath(item, nodePath, ctx); }
        if (t === "CompoundPathItem") { return exportCompound(item, nodePath, ctx); }
        if (!OPAQUE_TYPES[t]) {
            ctx.issue("UNKNOWN_ITEM_TYPE", "warning", "Unknown object type: " + t, nodePath);
        }
        return exportOpaque(item, nodePath, ctx);
    }

    function pad(n, w) {
        var s = String(n);
        while (s.length < w) { s = "0" + s; }
        return s;
    }

    function isNestedInSelected(item, uuidSet) {
        var p = prop(item, "parent", null);
        var guard = 0;
        while (p && guard < 100) {
            var t = prop(p, "typename", "");
            if (t === "Layer" || t === "Document") { return false; }
            var u = prop(p, "uuid", null);
            if (u !== null && uuidSet[String(u)]) { return true; }
            p = prop(p, "parent", null);
            guard++;
        }
        return false;
    }

    function exportSelectedGroup(item, index, settings) {
        var ctx = new Ctx(settings);
        var root = exportGroup(item, [], ctx);
        var layer = prop(item, "layer", null);
        var g = {
            id: "g" + pad(index + 1, 3),
            uuid: (function () { var u = prop(item, "uuid", null); return u === null ? null : String(u); }()),
            name: prop(item, "name", ""),
            selection_index: index,
            layer: layer ? prop(layer, "name", "") : "",
            geometric_bounds_pt: rect(prop(item, "geometricBounds", null)),
            visible_bounds_pt: rect(prop(item, "visibleBounds", null)),
            root: root,
            trackers: [],
            stats: { points: ctx.pointCount, paths: ctx.counts.paths, compounds: ctx.counts.compounds,
                     groups: ctx.counts.groups, opaque: ctx.counts.opaque },
            export_issues: ctx.issues
        };
        if (ctx.trackA) { g.trackers.push(ctx.trackA); }
        if (ctx.trackB) { g.trackers.push(ctx.trackB); }
        if (layer) {
            if (prop(layer, "printable", true) === false) {
                g.export_issues.push({ code: "LAYER_NOT_PRINTABLE", severity: "warning",
                    message: "The group is on a non-printing layer.", node_path: null });
            }
        }
        var parent = prop(item, "parent", null);
        if (parent && prop(parent, "typename", "") === "GroupItem") {
            g.export_issues.push({ code: "NESTED_SELECTION", severity: "warning",
                message: "The selected group is inside another group.", node_path: null });
        }
        return g;
    }

    /*
     * run(doc, settings, appInfo, onGroup) -> autonest.geometry/1 object
     * Only top-level selected GroupItems are exported; everything else in the
     * selection is reported in skipped_selection.
     * onGroup(done, total, group) is called after each exported group (progress + timing).
     */
    function run(doc, settings, appInfo, onGroup) {
        var t0 = new Date().getTime();
        var sel = doc.selection;
        var out = {
            schema: "autonest.geometry/1",
            generator: {
                name: "Illustrator_AutoNesting.jsx",
                version: VERSION,
                illustrator_version: appInfo && appInfo.version ? String(appInfo.version) : null,
                exported_at: new Date().toUTCString()
            },
            document: {
                name: prop(doc, "name", ""),
                path: (function () { try { return doc.fullName.fsName; } catch (e) { return null; } }()),
                ruler_units: enumName(prop(doc, "rulerUnits", "")),
                color_space: enumName(prop(doc, "documentColorSpace", ""))
            },
            coordinate_system: { space: "illustrator_document", units: "pt", y_axis: "up" },
            artboard: null,
            settings: settings,
            groups: [],
            skipped_selection: [],
            export_stats: {}
        };

        var abIndex = doc.artboards.getActiveArtboardIndex();
        var ab = doc.artboards[abIndex];
        var abRect = ab.artboardRect;
        out.artboard = { index: abIndex, name: prop(ab, "name", ""), rect_pt: rect(abRect) };
        // Detect the vertical axis direction from the data instead of assuming it.
        out.coordinate_system.y_axis = (abRect[1] > abRect[3]) ? "up" : "down";

        if (!sel || typeof sel.length === "undefined" || prop(sel, "typename", "") === "TextRange") {
            out.skipped_selection.push({ typename: "TextRange", reason: "TEXT_EDITING" });
            return out;
        }

        var uuidSet = {}, i, it;
        for (i = 0; i < sel.length; i++) {
            it = sel[i];
            if (it.typename === "GroupItem") {
                var u = prop(it, "uuid", null);
                if (u !== null) { uuidSet[String(u)] = true; }
            }
        }
        var points = 0;
        for (i = 0; i < sel.length; i++) {
            it = sel[i];
            if (it.typename !== "GroupItem") {
                out.skipped_selection.push({ typename: it.typename, name: prop(it, "name", ""), reason: "NOT_A_GROUP" });
                continue;
            }
            if (isNestedInSelected(it, uuidSet)) {
                out.skipped_selection.push({ typename: it.typename, name: prop(it, "name", ""),
                    reason: "INSIDE_SELECTED_GROUP" });
                continue;
            }
            var g = exportSelectedGroup(it, out.groups.length, settings);
            points += g.stats.points;
            out.groups.push(g);
            if (onGroup) { onGroup(i + 1, sel.length, g); }
        }
        out.export_stats = { groups: out.groups.length, points: points,
                             elapsed_ms: new Date().getTime() - t0 };
        return out;
    }

    return { run: run, VERSION: VERSION, _enumName: enumName };
}());
// ===== END jsx/lib/an_extract.jsxinc =====
// ===== BEGIN jsx/lib/an_io.jsxinc sha256=839e8c39117efb7080faf0f9c514d556d395cd849a6bb1afc1eda3e713651df2 =====
/*
 * an_io.jsxinc - file output and diagnostics for Illustrator Auto Nesting (ES3).
 *
 * AN_IO   : output folder resolution, checked UTF-8 text write/read.
 * AN_Diag : step log + environment report written to autonest_diagnostics.txt,
 *           so that a failure on a user's machine can be located exactly
 *           (step, error number, message, line, file).
 */
var AN_IO = (function () {
    function folderPath(f) {
        try { return f.fsName; } catch (e) { return String(f); }
    }

    function ensureFolder(folder) {
        if (folder.exists) { return folder; }
        if (!folder.create()) {
            throw new Error("Cannot create folder: " + folderPath(folder) +
                            (folder.error ? " (" + folder.error + ")" : ""));
        }
        return folder;
    }

    /* "<document name>_autonest" next to a saved document, else Documents/AutoNesting. */
    function outputFolder(doc, subName) {
        var base = null;
        var docPath = null;
        try {
            docPath = doc.path; // never-saved documents have an empty path or throw
        } catch (e) {
            docPath = null;
        }
        if (docPath && docPath.fsName && String(docPath.fsName) !== "") {
            var dn = String(doc.name).replace(/\.[^\.]+$/, "");
            base = new Folder(docPath.fsName + "/" + dn + "_autonest");
        } else {
            base = new Folder(Folder.myDocuments.fsName + "/AutoNesting");
        }
        if (subName) { base = new Folder(base.fsName + "/" + subName); }
        return ensureFolder(base);
    }

    function writeText(file, text) {
        file.encoding = "UTF-8";
        file.lineFeed = "Unix";
        if (!file.open("w")) {
            throw new Error("Cannot open file for writing: " + file.fsName + (file.error ? " (" + file.error + ")" : ""));
        }
        var ok = file.write(text);
        var err = file.error;
        file.close();
        if (ok === false) {
            throw new Error("Writing the file failed: " + file.fsName + (err ? " (" + err + ")" : ""));
        }
        if (!file.exists) {
            throw new Error("File does not exist after writing: " + file.fsName);
        }
        return file;
    }

    function readText(file) {
        file.encoding = "UTF-8";
        if (!file.open("r")) {
            throw new Error("Cannot open file for reading: " + file.fsName + (file.error ? " (" + file.error + ")" : ""));
        }
        var s = file.read();
        file.close();
        return s;
    }

    return { ensureFolder: ensureFolder, outputFolder: outputFolder, writeText: writeText, readText: readText };
}());

var AN_Diag = (function () {
    function now() { return new Date().getTime(); }

    function safe(fn, dflt) {
        try { var v = fn(); return (typeof v === "undefined") ? dflt : v; } catch (e) { return dflt; }
    }

    function Diag(title) {
        this.title = title;
        this.t0 = now();
        this.current = "start";
        this.lines = [];
        this.failed = false;
        this.outcome = null;  // set when the task ended without an exception but did not do its job
    }

    Diag.prototype.log = function (msg) {
        this.lines.push("[" + (now() - this.t0) + " ms] " + msg);
    };

    Diag.prototype.step = function (name) {
        this.current = name;
        this.log("STEP " + name);
    };

    Diag.prototype.fail = function (e) {
        this.failed = true;
        this.log("ERROR at step '" + this.current + "': " + AN_Diag.describe(e));
        var stack = safe(function () { return $.stack; }, "");
        if (stack) { this.log("ExtendScript stack:\n" + stack); }
    };

    Diag.prototype.environment = function () {
        var info = [];
        info.push("script        : " + safe(function () { return $.fileName; }, "?"));
        info.push("build         : " + (typeof AN_BUILD_INFO !== "undefined" ? AN_BUILD_INFO.label : "source (not built)"));
        info.push("extract       : " + safe(function () { return AN_Extract.VERSION; }, "?"));
        info.push("application   : " + safe(function () { return app.name; }, "?") + " " +
                  safe(function () { return app.version; }, "?"));
        info.push("ExtendScript  : " + safe(function () { return $.version; }, "?") +
                  " build " + safe(function () { return $.build; }, "?"));
        info.push("OS            : " + safe(function () { return $.os; }, "?"));
        info.push("locale        : " + safe(function () { return $.locale; }, "?"));
        info.push("coord system  : " + safe(function () { return String(app.coordinateSystem); }, "?"));
        info.push("documents     : " + safe(function () { return app.documents.length; }, "?"));
        return info.join("\r\n");
    };

    Diag.prototype.text = function () {
        return [
            "Illustrator Auto Nesting - diagnostics",
            "task          : " + this.title,
            "result        : " + (this.failed ? "FAILED at step '" + this.current + "'" : (this.outcome || "OK")),
            "date          : " + new Date().toString(),
            this.environment(),
            "",
            "--- log ---",
            this.lines.join("\r\n"),
            ""
        ].join("\r\n");
    };

    /* Write the report; never throws. Returns the path written or a reason. */
    Diag.prototype.save = function (preferredFolder, fileName) {
        var name = fileName || "autonest_diagnostics.txt";
        var candidates = [];
        if (preferredFolder) { candidates.push(preferredFolder); }
        candidates.push(safe(function () { return new Folder(Folder.myDocuments.fsName + "/AutoNesting"); }, null));
        candidates.push(safe(function () { return Folder.temp; }, null));
        var errors = [];
        for (var i = 0; i < candidates.length; i++) {
            var folder = candidates[i];
            if (!folder) { continue; }
            try {
                AN_IO.ensureFolder(folder);
                var f = new File(folder.fsName + "/" + name);
                AN_IO.writeText(f, this.text());
                return f.fsName;
            } catch (e) {
                errors.push(AN_Diag.describe(e));
            }
        }
        return "(could not write diagnostics: " + errors.join(" | ") + ")";
    };

    function describe(e) {
        if (e === null || typeof e !== "object") { return String(e); }
        var parts = [];
        parts.push(e.name ? e.name + ": " + e.message : String(e.message || e));
        if (typeof e.number !== "undefined") { parts.push("number=" + e.number); }
        if (typeof e.line !== "undefined") { parts.push("line=" + e.line); }
        if (e.fileName) { parts.push("file=" + e.fileName); }
        if (e.source && typeof e.line === "number") {
            var src = String(e.source).split(/\r\n|\r|\n/);
            if (src.length >= e.line) { parts.push("code=" + src[e.line - 1].replace(/^\s+/, "")); }
        }
        return parts.join(", ");
    }

    return { create: function (title) { return new Diag(title); }, describe: describe };
}());

/*
 * AN_Progress: a small ScriptUI palette ("Exporting group 12 of 78") so a long run shows it is alive.
 * Illustrator stays busy while a script runs; the palette is repainted by win.update() after each item.
 * A palette that cannot be created or drawn must not stop the task: the failure goes to the diagnostics log.
 */
var AN_Progress = (function () {
    function Progress(title, total, diag) {
        this.total = total;
        this.diag = diag;
        this.win = null;
        if (typeof Window === "undefined" || total < 2) { return; }
        try {
            var w = new Window("palette", title);
            w.alignChildren = "fill";
            this.label = w.add("statictext", undefined, "Starting...");
            this.label.preferredSize = [360, -1];
            this.bar = w.add("progressbar", undefined, 0, total);
            this.bar.preferredSize = [360, 12];
            this.foot = w.add("statictext", undefined, "");   // step and seconds since the start
            this.foot.preferredSize = [360, -1];
            this.t0 = new Date().getTime();
            w.show();
            w.update();
            this.win = w;
        } catch (e) {
            diag.log("progress window unavailable: " + AN_Diag.describe(e));
        }
    }

    /* sub: optional text before the seconds, such as "Step 2 of 3" */
    Progress.prototype.step = function (i, text, sub) {
        if (!this.win) { return; }
        try {
            this.bar.value = i;
            this.label.text = text;
            this.foot.text = (sub ? sub + "      " : "") + Math.round((new Date().getTime() - this.t0) / 1000) + " s";
            this.win.update();
        } catch (e) {
            this.diag.log("progress window update failed, hiding it: " + AN_Diag.describe(e));
            this.close();
        }
    };

    Progress.prototype.close = function () {
        if (!this.win) { return; }
        var w = this.win;
        this.win = null;
        try { w.close(); } catch (e) { this.diag.log("progress window close failed: " + AN_Diag.describe(e)); }
    };

    /* for the panel: the same calls write {value, total, text, sub} to a file that the panel reads and draws */
    function FileProgress(path, total, diag) {
        this.file = new File(path);
        this.total = total;
        this.diag = diag;
    }

    FileProgress.prototype.step = function (i, text, sub) {
        if (!this.file) { return; }
        try {
            AN_IO.writeText(this.file, AN_JSON.stringify({ value: i, total: this.total, text: text, sub: sub || "" }));
        } catch (e) {
            this.diag.log("progress file not written, stopping it: " + AN_Diag.describe(e));
            this.file = null;
        }
    };

    FileProgress.prototype.close = function () {
        if (!this.file) { return; }
        try { this.file.remove(); } catch (e) { /* the panel removes it too */ }
        this.file = null;
    };

    /* path: progress file for the panel (no window: a palette inside the panel's evalScript is suspected of losing the reply) */
    return { create: function (title, total, diag, path) { return path ? new FileProgress(path, total, diag) : new Progress(title, total, diag); } };
}());
// ===== END jsx/lib/an_io.jsxinc =====
// ===== BEGIN jsx/lib/an_main.jsxinc sha256=adcfaa6dfc58edf7e38dfaf5c750835be4d83ec00571c75af5db0399087d1c97 =====
/*
 * an_main.jsxinc - "Export Geometry" command (Phase 2, read-only).
 *
 * Collects the selected GroupItems of the active document and writes
 * geometry.json (autonest.geometry/1).  The document is never modified.
 * Every step is logged; on failure the user gets the exact step, error
 * number, message, line and file, and autonest_diagnostics.txt is written.
 */
var AN_DEFAULT_SETTINGS = {
    spacing_mm: 5,
    margin_mm: 10,
    curve_tolerance_mm: 0.25,
    conservative_curves: true,
    rotation: {
        preset: "0_180",
        step_deg: 5,
        custom_angles_deg: [],
        allow_full_360: true,
        max_abs_deg: 180,
        prefer_original: true,
        grain_lock: false,
        allow_mirror: false
    },
    optimization: { quality: "balanced", time_limit_s: 60, max_iterations: null, seed: 1 },
    material: { mode: "fixed_artboard", roll_max_length_mm: null },
    part_in_hole: true,
    opaque_policy: "cut_line"
};

function AN_countExportIssues(geo) {
    var n = 0;
    for (var i = 0; i < geo.groups.length; i++) { n += geo.groups[i].export_issues.length; }
    return n;
}

/*
 * Returns a result object (also used by automated tests):
 *   {status: "ok"|"no_document"|"empty_selection"|"error", geometryPath, diagnosticsPath, error}
 */
function AN_exportGeometry(options) {
    var opts = options || {};
    var diag = AN_Diag.create("Export Geometry");
    var result = { status: "error", geometryPath: null, diagnosticsPath: null, error: null, groups: 0 };
    var prevCS = null;
    var csChanged = false;
    var outFolder = null;
    var geo = null;
    var progress = null;

    try {
        diag.step("check-document");
        if (app.documents.length === 0) {
            result.status = "no_document";
            diag.log("no open document");
            return result;
        }
        var doc = app.activeDocument;
        diag.log("document: " + doc.name);

        diag.step("set-coordinate-system");
        prevCS = app.coordinateSystem;
        // Anchors, bounds and artboardRect must share one coordinate system.
        app.coordinateSystem = CoordinateSystem.DOCUMENTCOORDINATESYSTEM;
        csChanged = true;

        diag.step("extract");
        progress = AN_Progress.create("Auto Nesting - exporting", doc.selection.length, diag, opts.progressFile);
        var tGroup = new Date().getTime();
        geo = AN_Extract.run(doc, opts.settings || AN_DEFAULT_SETTINGS, { version: app.version }, function (done, total, g) {
            var now = new Date().getTime();
            diag.log("exported " + g.id + " '" + g.name + "' points=" + g.stats.points + " ms=" + (now - tGroup));
            tGroup = now;
            progress.step(done, "Exporting selected item " + done + " of " + total + " (" + g.name + ")");
        });
        progress.close();

        diag.step("restore-coordinate-system");
        app.coordinateSystem = prevCS;
        csChanged = false;

        diag.log("artboard " + geo.artboard.index + " rect_pt=" + geo.artboard.rect_pt.join(",") +
                 " y_axis=" + geo.coordinate_system.y_axis);
        diag.log("groups=" + geo.groups.length + " skipped=" + geo.skipped_selection.length +
                 " points=" + (geo.export_stats.points || 0) + " export_ms=" + (geo.export_stats.elapsed_ms || 0));
        result.groups = geo.groups.length;

        diag.step("resolve-output-folder");
        outFolder = opts.outputFolder ? AN_IO.ensureFolder(opts.outputFolder) : AN_IO.outputFolder(doc);
        diag.log("output folder: " + outFolder.fsName);

        if (geo.groups.length === 0) {
            result.status = "empty_selection";
            result.skipped = geo.skipped_selection.length;
            diag.log("nothing to export");
            result.diagnosticsPath = diag.save(outFolder);
            return result;
        }

        diag.step("serialize");
        var text = AN_JSON.stringify(geo);
        // no ExtendScript re-parse here: it took ~30% of a 3 MB export; the engine validates the file strictly
        diag.step("write-geometry");
        var file = new File(outFolder.fsName + "/geometry.json");
        AN_IO.writeText(file, text);
        result.geometryPath = file.fsName;
        diag.log("wrote " + file.fsName + " (" + text.length + " chars)");

        diag.step("done");
        result.status = "ok";
        result.geo = geo;
        result.diagnosticsPath = diag.save(outFolder);
        return result;
    } catch (e) {
        if (progress) { progress.close(); }
        if (csChanged) {
            try {
                app.coordinateSystem = prevCS;
                diag.log("coordinate system restored after error");
            } catch (e2) {
                diag.log("FAILED to restore coordinate system: " + AN_Diag.describe(e2));
            }
        }
        diag.fail(e);
        result.status = "error";
        result.error = AN_Diag.describe(e);
        result.step = diag.current;
        result.diagnosticsPath = diag.save(outFolder);
        return result;
    }
}

function AN_main() {
    var r = AN_exportGeometry();
    var title = "Illustrator Auto Nesting - Export Geometry\n\n";
    if (r.status === "no_document") {
        alert(title + "No document is open.");
    } else if (r.status === "empty_selection") {
        alert(title + "Select the groups to nest.\n" +
              (r.skipped ? ("Skipped " + r.skipped + " selected objects that are not groups.\n") : "Nothing is selected.\n") +
              "\nDiagnostics: " + r.diagnosticsPath);
    } else if (r.status === "error") {
        alert(title + "ERROR at step: " + r.step + "\n" + r.error +
              "\n\nDiagnostics: " + r.diagnosticsPath +
              "\nPlease send this diagnostics file when reporting the error.");
    } else {
        var g = r.geo;
        alert(title +
              "Selection: " + g.groups.length + " Groups\n" +
              "Skipped (not groups): " + g.skipped_selection.length + "\n" +
              "Artboard: " + g.artboard.name + "\n" +
              "Bezier points: " + g.export_stats.points + "\n" +
              "Export warnings: " + AN_countExportIssues(g) + "\n" +
              "Time: " + g.export_stats.elapsed_ms + " ms\n\n" +
              "Written: " + r.geometryPath + "\n" +
              "Diagnostics: " + r.diagnosticsPath + "\n\n" +
              "Next: use the AutoNesting panel (Nest), or drop geometry.json onto tools\\windows\\autonest_nest.cmd\n" +
              "(tools\\windows\\autonest_analyze.cmd shows the silhouettes).");
    }
    return r;
}
// ===== END jsx/lib/an_main.jsxinc =====

if (typeof AN_NO_MAIN === "undefined") {
    AN_main();
}


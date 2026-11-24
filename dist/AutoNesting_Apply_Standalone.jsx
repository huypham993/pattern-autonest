//@target illustrator
// GENERATED FILE - DO NOT EDIT. Built by tools/build/build_jsx.js from jsx/AutoNesting_Apply.jsx.
// Single file: no //@include, no external dependencies. Run it from File > Scripts > Other Script...
// Sources:
//   jsx/lib/an_json.jsxinc  sha256=b96487cfd4e2326bcbc27b2a48b42e119bde6235d1f7d2d309bd8985de800c17
//   jsx/lib/an_extract.jsxinc  sha256=2c0ba13d08e3ab10ff1cc3518cbef800f1dd0a37f2e008bdba8e5a9f1b9bb3d1
//   jsx/lib/an_io.jsxinc  sha256=839e8c39117efb7080faf0f9c514d556d395cd849a6bb1afc1eda3e713651df2
//   jsx/lib/an_apply.jsxinc  sha256=ad2b39e527292917d49be16b003343902a551d531c676c732df0ec86f1bfb5e5
var AN_BUILD_INFO = { label: "autonest 0.4.0 Apply Placement (AutoNesting_Apply_Standalone.jsx)", version: "0.4.0" };
/*
 * Illustrator True-Shape Auto Nesting - Apply Placement - DEVELOPMENT ENTRY POINT.
 * Users run dist/AutoNesting_Apply_Standalone.jsx (built by tools/build/build_jsx.js),
 * or the "Ap dung" button of the panel.
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
// ===== BEGIN jsx/lib/an_apply.jsxinc sha256=ad2b39e527292917d49be16b003343902a551d531c676c732df0ec86f1bfb5e5 =====
/*
 * an_apply.jsxinc - "Apply Placement" command (Phase 4).
 *
 * Moves the selected GroupItems to the positions computed by the engine
 * (placement.json, autonest.placement/1).  Each group is only rotated and
 * translated: no scale, no mirror, nothing inside the group is edited.
 *
 * Safety:
 *   1. Everything is checked before the first change (schema, verification,
 *      document, artboard, every group found by uuid, every group still
 *      exactly where it was exported: tracker anchors within 0.01 pt).
 *      Any problem -> nothing is changed and the list of problems is returned.
 *   2. Per group: rotate(theta) about the bounds centre, then translate so
 *      tracker 0 lands on its expected point (this makes the result
 *      independent of the pivot Illustrator uses), then both trackers must be
 *      within APPLY_TOL_PT of placement.expected_trackers_pt.
 *   3. Any failure (DOM error or tracker check) -> every group already touched
 *      is restored from its recorded original tracker positions, in reverse
 *      order, and the restore is checked the same way.
 *
 * Coordinates: Illustrator document coordinates, points, y up - the same
 * space as geometry.json.  The caller sets DOCUMENTCOORDINATESYSTEM.
 */
var AN_Apply = (function () {
    var FINGERPRINT_TOL_PT = 0.01;  // exported anchors are rounded to 1e-4 pt
    var APPLY_TOL_PT = 0.02;        // after rotate + translate (Illustrator stores single-precision floats)
    var ARTBOARD_TOL_PT = 0.01;
    var MATRIX_TOL = 1e-6;
    var ROT_EPS_DEG = 1e-7;

    function ApplyError(message) {
        this.name = "ApplyError";
        this.message = message;
    }
    ApplyError.prototype = new Error();

    function dist(a, b) {
        var dx = a[0] - b[0], dy = a[1] - b[1];
        return Math.sqrt(dx * dx + dy * dy);
    }

    function fmt(p) { return "[" + p[0].toFixed(4) + ", " + p[1].toFixed(4) + "]"; }

    function finite(v) { return typeof v === "number" && isFinite(v); }

    /* node_path from geometry.json: indices into pageItems, or pathItems inside a compound. */
    function resolveAnchor(group, tracker) {
        var it = group, np = tracker.node_path, coll;
        for (var i = 0; i < np.length; i++) {
            if (it.typename === "GroupItem") { coll = it.pageItems; }
            else if (it.typename === "CompoundPathItem") { coll = it.pathItems; }
            else { return null; }
            if (np[i] < 0 || np[i] >= coll.length) { return null; }
            it = coll[np[i]];
        }
        if (it.typename !== "PathItem") { return null; }
        var pps = it.pathPoints;
        if (tracker.point_index < 0 || tracker.point_index >= pps.length) { return null; }
        var a = pps[tracker.point_index].anchor;
        return [a[0], a[1]];
    }

    function readTrackers(item, trackers, label) {
        var out = [];
        for (var k = 0; k < trackers.length; k++) {
            var p = resolveAnchor(item, trackers[k]);
            if (p === null) { throw new ApplyError(label + ": cannot read tracker point " + k + " (the group's structure has changed)"); }
            out.push(p);
        }
        return out;
    }

    function matrixOf(pl) {
        var t = pl.rotation_deg * Math.PI / 180, c = Math.cos(t), s = Math.sin(t);
        var px = pl.pivot_pt[0], py = pl.pivot_pt[1];
        return [c, s, -s, c, pl.target_pt[0] - (c * px - s * py), pl.target_pt[1] - (s * px + c * py)];
    }

    function applyMatrix(m, p) { return [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]]; }

    function angleDeg(a, b) { return Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI; }

    function normDeg(a) {
        a = a % 360;
        if (a > 180) { a -= 360; }
        if (a <= -180) { a += 360; }
        return a;
    }

    /* Find the live item; getPageItemFromUuid throws or returns null for an unknown uuid. */
    function findItem(doc, uuid) {
        try {
            return { item: doc.getPageItemFromUuid(uuid), error: null };
        } catch (e) {
            return { item: null, error: AN_Diag.describe(e) };
        }
    }

    function isLocked(item) {
        if (item.locked) { return "the group is locked"; }
        var layer = item.layer;
        if (layer && layer.locked) { return "layer '" + layer.name + "' is locked"; }
        if (layer && layer.visible === false) { return "layer '" + layer.name + "' is hidden"; }
        return null;
    }

    /*
     * Read-only checks.  Returns {problems: [...], jobs: [...]}; jobs are only
     * meaningful when problems is empty.
     */
    function validate(doc, geometry, placement, opts) {
        var problems = [];
        var jobs = [];
        function bad(msg) { problems.push(msg); }

        if (!placement || placement.schema !== "autonest.placement/1") { bad("placement.json is not an autonest.placement/1 file"); return { problems: problems, jobs: jobs }; }
        if (!geometry || geometry.schema !== "autonest.geometry/1") { bad("geometry.json is not an autonest.geometry/1 file"); return { problems: problems, jobs: jobs }; }
        if (placement.status !== "complete" && placement.status !== "partial") { bad("placement.status = " + placement.status + " (only complete or partial can be applied)"); }
        if (!placement.verification || placement.verification.ok !== true) { bad("the placement did not pass independent verification (verification.ok is not true)"); }
        if (!placement.placements || placement.placements.length === 0) { bad("the placement contains no placed groups"); }
        if (opts.geometrySha256 && placement.source.geometry_sha256 !== opts.geometrySha256) {
            bad("placement.json was computed for a different geometry.json (sha256 mismatch)");
        }
        if (geometry.coordinate_system.y_axis !== "up") { bad("geometry.json has y axis '" + geometry.coordinate_system.y_axis + "'; Apply supports y up only"); }
        if (problems.length) { return { problems: problems, jobs: jobs }; }

        var src = placement.source;
        if (src.document.name !== geometry.document.name) { bad("placement.json and geometry.json belong to different documents"); }
        if (String(doc.name) !== src.document.name) { bad("the active document is '" + doc.name + "' but the placement was computed for '" + src.document.name + "'"); }
        var ai = src.artboard.index;
        if (ai !== geometry.artboard.index || ai < 0 || ai >= doc.artboards.length) {
            bad("artboard " + ai + " does not exist in the document");
        } else {
            var r = doc.artboards[ai].artboardRect;
            for (var q = 0; q < 4; q++) {
                if (Math.abs(r[q] - src.artboard.rect_pt[q]) > ARTBOARD_TOL_PT) {
                    bad("artboard " + ai + " changed size or position after the geometry was exported");
                    break;
                }
            }
        }

        var byId = {};
        for (var g = 0; g < geometry.groups.length; g++) { byId[geometry.groups[g].id] = geometry.groups[g]; }
        var seen = {};
        for (var i = 0; i < placement.placements.length; i++) {
            var pl = placement.placements[i];
            var label = pl.id + " '" + pl.name + "'";
            var gg = byId[pl.id];
            if (!gg) { bad(label + ": not found in geometry.json"); continue; }
            if (gg.uuid === null || gg.uuid !== pl.uuid) { bad(label + ": uuid differs between placement.json and geometry.json"); continue; }
            if (seen[pl.uuid]) { bad(label + ": duplicate uuid in placement.json"); continue; }
            seen[pl.uuid] = true;
            if (pl.mirror !== false) { bad(label + ": the placement asks for a mirror, which is not allowed"); continue; }
            if (!finite(pl.rotation_deg)) { bad(label + ": invalid rotation angle"); continue; }
            if (gg.trackers.length < 2) { bad(label + ": the group has fewer than 2 vector anchor points, so its new position could not be verified"); continue; }
            var m = matrixOf(pl);
            var mok = pl.matrix && pl.matrix.length === 6;
            for (var k = 0; mok && k < 6; k++) {
                if (Math.abs(m[k] - pl.matrix[k]) > MATRIX_TOL * (k < 4 ? 1 : Math.max(1, Math.abs(m[k])))) { mok = false; }
            }
            if (!mok) { bad(label + ": matrix does not match rotation/pivot/target"); continue; }
            var expected = [];
            for (k = 0; k < gg.trackers.length; k++) {
                var e = applyMatrix(m, gg.trackers[k].anchor_pt);
                var pe = pl.expected_trackers_pt && pl.expected_trackers_pt[k];
                if (!pe || dist(e, pe) > 0.001) { bad(label + ": expected_trackers_pt does not match geometry.json"); expected = null; break; }
                expected.push(pe);
            }
            if (!expected) { continue; }

            var found = findItem(doc, pl.uuid);
            if (!found.item) { bad(label + ": group not found in the document (uuid " + pl.uuid + ")" + (found.error ? " - " + found.error : "")); continue; }
            var item = found.item;
            if (item.typename !== "GroupItem") { bad(label + ": uuid " + pl.uuid + " is a " + item.typename + ", not a group"); continue; }
            var lk = isLocked(item);
            if (lk) { bad(label + ": " + lk); continue; }
            var orig;
            try {
                orig = readTrackers(item, gg.trackers, label);
            } catch (e2) {
                if (e2 instanceof ApplyError) { bad(e2.message); continue; }
                throw e2;
            }
            var moved = 0;
            for (k = 0; k < orig.length; k++) { moved = Math.max(moved, dist(orig[k], gg.trackers[k].anchor_pt)); }
            if (moved > FINGERPRINT_TOL_PT) {
                bad(label + ": the group was moved or edited after the geometry was exported (off by " + moved.toFixed(4) + " pt). Run Nest again.");
                continue;
            }
            jobs.push({ label: label, pl: pl, item: item, trackers: gg.trackers, orig: orig, expected: expected });
        }
        // groups that did not fit are moved off the artboard, so they cannot overlap the placed ones
        var parks = [];
        var unplaced = placement.unplaced || [];
        for (i = 0; i < unplaced.length; i++) {
            var ug = byId[unplaced[i].id];
            var ulabel = unplaced[i].id + (ug ? " '" + ug.name + "'" : "");
            if (!ug || ug.uuid === null) { bad(ulabel + ": unplaced group not found in geometry.json"); continue; }
            var uf = findItem(doc, ug.uuid);
            if (!uf.item || uf.item.typename !== "GroupItem") { bad(ulabel + ": unplaced group not found in the document (uuid " + ug.uuid + ")"); continue; }
            var ulk = isLocked(uf.item);
            if (ulk) { bad(ulabel + ": " + ulk); continue; }
            parks.push({ label: ulabel, item: uf.item, park: true });
        }
        return { problems: problems, jobs: jobs, parks: parks };
    }

    function maxErr(item, job, targets) {
        var cur = readTrackers(item, job.trackers, job.label);
        var err = 0;
        for (var k = 0; k < cur.length; k++) { err = Math.max(err, dist(cur[k], targets[k])); }
        return { err: err, cur: cur };
    }

    function rotate(item, deg) {
        if (Math.abs(deg) > ROT_EPS_DEG) { item.rotate(deg, true, true, true, true, Transformation.CENTER); }
    }

    function applyOne(job, log) {
        rotate(job.item, job.pl.rotation_deg);
        var c0 = readTrackers(job.item, [job.trackers[0]], job.label)[0];
        job.item.translate(job.expected[0][0] - c0[0], job.expected[0][1] - c0[1], true, true, true, true);
        var chk = maxErr(job.item, job, job.expected);
        if (chk.err > APPLY_TOL_PT) {
            throw new ApplyError(job.label + ": after rotate/translate the tracker points are off by " + chk.err.toFixed(4) + " pt (allowed " +
                                 APPLY_TOL_PT + "); actual " + fmt(chk.cur[0]) + " " + fmt(chk.cur[1]) +
                                 ", expected " + fmt(job.expected[0]) + " " + fmt(job.expected[1]));
        }
        log(job.label + " rot=" + job.pl.rotation_deg + " err_pt=" + chk.err.toFixed(5));
        return chk.err;
    }

    /* Bring a group back to its original tracker positions, whatever state it is in. */
    function restoreOne(job) {
        var cur = readTrackers(job.item, job.trackers, job.label);
        rotate(job.item, normDeg(angleDeg(job.orig[0], job.orig[1]) - angleDeg(cur[0], cur[1])));
        var c0 = readTrackers(job.item, [job.trackers[0]], job.label)[0];
        job.item.translate(job.orig[0][0] - c0[0], job.orig[0][1] - c0[1], true, true, true, true);
        return maxErr(job.item, job, job.orig).err;
    }

    var PARK_GAP_PT = 10 * 72 / 25.4;

    /* Stack the unplaced groups in columns to the right of the artboard (translation only). */
    function parkOne(job, cursor, log) {
        var b = job.item.visibleBounds;
        var w = b[2] - b[0], h = b[1] - b[3];
        if (cursor.y - h < cursor.bottom && cursor.y < cursor.top) {   // column full: start the next one
            cursor.x += cursor.colWidth + PARK_GAP_PT;
            cursor.y = cursor.top;
            cursor.colWidth = 0;
        }
        job.dx = cursor.x - b[0];
        job.dy = cursor.y - b[1];
        job.origBounds = [b[0], b[1], b[2], b[3]];
        job.item.translate(job.dx, job.dy, true, true, true, true);
        var err = boundsErr(job.item.visibleBounds, job.origBounds, job.dx, job.dy);
        if (err > APPLY_TOL_PT) { throw new ApplyError(job.label + ": moving the unplaced group off the artboard is off by " + err.toFixed(4) + " pt"); }
        cursor.y -= h + PARK_GAP_PT;
        cursor.colWidth = Math.max(cursor.colWidth, w);
        log(job.label + " unplaced -> moved right of the artboard");
    }

    /*
     * Resize the artboard to the fabric width and the nested length (+ margin), keeping its bottom-left
     * corner where the fabric starts. Throws if Illustrator does not take the new size.
     */
    function resizeArtboard(doc, placement, log) {
        var PT = 72 / 25.4;
        var ab = doc.artboards[placement.source.artboard.index];
        var old = ab.artboardRect;
        old = [old[0], old[1], old[2], old[3]];
        var st = placement.settings, top = 0, bottom = Infinity;
        for (var i = 0; i < placement.placements.length; i++) {
            top = Math.max(top, placement.placements[i].expected_bounds_mm[3]);
            bottom = Math.min(bottom, placement.placements[i].expected_bounds_mm[1]);
        }
        // nested from a top corner the fabric hangs from the artboard top: keep the top, move the bottom
        var corner = (st.optimization && st.optimization.start_corner) || "bottom_left";
        var fromTop = corner.indexOf("top") === 0;
        if (fromTop) { top = (old[1] - old[3]) / PT - st.margin_mm; }
        var cut = fromTop ? bottom - st.margin_mm : 0;
        var w = st.material.sheet_width_mm ? st.material.sheet_width_mm * PT : old[2] - old[0];
        var want = [old[0], old[3] + (top + st.margin_mm) * PT, old[0] + w, old[3] + cut * PT];
        ab.artboardRect = want;
        var got = ab.artboardRect, err = 0;
        for (i = 0; i < 4; i++) { err = Math.max(err, Math.abs(got[i] - want[i])); }
        if (err > APPLY_TOL_PT) { throw new ApplyError("resizing the artboard is off by " + err.toFixed(4) + " pt"); }
        log("artboard resized to " + ((want[2] - want[0]) / PT).toFixed(1) + " x " + ((want[1] - want[3]) / PT).toFixed(1) + " mm");
    }

    function boundsErr(b, orig, dx, dy) {
        return Math.max(Math.abs(b[0] - orig[0] - dx), Math.abs(b[1] - orig[1] - dy),
                        Math.abs(b[2] - orig[2] - dx), Math.abs(b[3] - orig[3] - dy));
    }

    function unparkOne(job) {
        if (job.origBounds === undefined) { return 0; }   // never moved
        var b = job.item.visibleBounds;   // undo the move that really happened, not the one asked for
        job.item.translate(job.origBounds[0] - b[0], job.origBounds[1] - b[1], true, true, true, true);
        return boundsErr(job.item.visibleBounds, job.origBounds, 0, 0);
    }

    /*
     * run(doc, geometry, placement, opts, log) ->
     *   {status: "applied"|"refused"|"rolled_back"|"rollback_failed", applied, problems, max_error_pt, rollback}
     * Throws only if a read-only check itself hits a DOM error (nothing changed then).
     */
    function run(doc, geometry, placement, opts, log) {
        opts = opts || {};
        log = log || function () {};
        var res = { status: "refused", applied: 0, total: 0, unplaced: 0, parked: 0, problems: [], max_error_pt: 0, rollback: null };
        var v = validate(doc, geometry, placement, opts);
        res.total = placement && placement.placements ? placement.placements.length : 0;
        res.unplaced = placement && placement.unplaced ? placement.unplaced.length : 0;
        if (v.problems.length) {
            res.problems = v.problems;
            return res;
        }
        log("validated " + v.jobs.length + " groups; nothing changed yet");

        var done = [];
        var failure = null;
        for (var i = 0; i < v.jobs.length; i++) {
            var job = v.jobs[i];
            done.push(job); // before touching it, so a half-applied group is restored too
            if (opts.onStep) { opts.onStep(i + 1, v.jobs.length, job.label); }
            try {
                res.max_error_pt = Math.max(res.max_error_pt, applyOne(job, log));
                if (opts._failAfter === i + 1) { throw new ApplyError("test: forced failure after group " + (i + 1)); }
            } catch (e) {
                failure = (e instanceof ApplyError ? e.message : job.label + ": " + AN_Diag.describe(e));
                break;
            }
        }
        if (!failure && v.parks.length) {
            var ab = doc.artboards[placement.source.artboard.index].artboardRect;
            // right of every artboard (not onto another artboard's artwork), and of the fabric when it is wider
            var mat = placement.settings && placement.settings.material;
            var right = ab[0] + (mat && mat.sheet_width_mm ? mat.sheet_width_mm * 72 / 25.4 : 0);
            for (var ai = 0; ai < doc.artboards.length; ai++) { right = Math.max(right, doc.artboards[ai].artboardRect[2]); }
            var cursor = { x: right + PARK_GAP_PT, y: ab[1], top: ab[1], bottom: ab[3], colWidth: 0 };
            for (i = 0; i < v.parks.length; i++) {
                done.push(v.parks[i]);
                try {
                    parkOne(v.parks[i], cursor, log);
                } catch (e4) {
                    failure = (e4 instanceof ApplyError ? e4.message : v.parks[i].label + ": " + AN_Diag.describe(e4));
                    break;
                }
            }
        }
        var oldArtboard = null;
        if (!failure && opts.resizeArtboard) {
            try {
                oldArtboard = doc.artboards[placement.source.artboard.index].artboardRect;
                oldArtboard = [oldArtboard[0], oldArtboard[1], oldArtboard[2], oldArtboard[3]];
                resizeArtboard(doc, placement, log);
                var nr = doc.artboards[placement.source.artboard.index].artboardRect;
                res.artboard_mm = [(nr[2] - nr[0]) * 25.4 / 72, (nr[1] - nr[3]) * 25.4 / 72];
            } catch (e5) {
                failure = (e5 instanceof ApplyError ? e5.message : "resizing the artboard: " + AN_Diag.describe(e5));
            }
        }
        if (!failure) {
            res.status = "applied";
            res.applied = v.jobs.length;
            res.parked = v.parks.length;
            return res;
        }

        log("FAILED: " + failure + " -> restoring " + done.length + " group(s)");
        res.problems.push(failure);
        var rb = { restored: 0, failed: [], max_error_pt: 0 };
        if (oldArtboard) {
            try {
                doc.artboards[placement.source.artboard.index].artboardRect = oldArtboard;
                var back = doc.artboards[placement.source.artboard.index].artboardRect, off = 0;
                for (var q = 0; q < 4; q++) { off = Math.max(off, Math.abs(back[q] - oldArtboard[q])); }
                if (off > APPLY_TOL_PT) { rb.failed.push("artboard: its old size is off by " + off.toFixed(4) + " pt after undo"); }
            } catch (e6) { rb.failed.push("artboard: could not restore its size (" + AN_Diag.describe(e6) + ")"); }
        }
        for (var j = done.length - 1; j >= 0; j--) {
            try {
                var err = done[j].park ? unparkOne(done[j]) : restoreOne(done[j]);
                rb.max_error_pt = Math.max(rb.max_error_pt, err);
                if (err > APPLY_TOL_PT) { rb.failed.push(done[j].label + ": off by " + err.toFixed(4) + " pt after undo"); }
                else { rb.restored++; }
            } catch (e3) {
                rb.failed.push(done[j].label + ": " + (e3 instanceof ApplyError ? e3.message : AN_Diag.describe(e3)));
            }
        }
        res.rollback = rb;
        res.status = rb.failed.length ? "rollback_failed" : "rolled_back";
        return res;
    }

    return { run: run, validate: validate, resolveAnchor: resolveAnchor,
             APPLY_TOL_PT: APPLY_TOL_PT, FINGERPRINT_TOL_PT: FINGERPRINT_TOL_PT };
}());

/*
 * Reads placement.json and geometry.json, applies, writes diagnostics.
 * options: {placementPath, geometryPath (default: geometry.json next to placement), geometrySha256}
 * Returns {status, applied, total, unplaced, problems, max_error_pt, rollback, step, error, diagnosticsPath}
 * status adds "no_document", "cancelled" and "error" (an unexpected DOM/IO error before any change,
 * or while applying - in that case the rollback result is in .rollback).
 */
function AN_applyPlacement(options) {
    var opts = options || {};
    var diag = AN_Diag.create("Apply Placement");
    var result = { status: "error", applied: 0, total: 0, unplaced: 0, problems: [], diagnosticsPath: null, error: null };
    var prevCS = null, csChanged = false, folder = null, progress = null;
    try {
        diag.step("check-document");
        if (app.documents.length === 0) { result.status = "no_document"; return result; }
        var doc = app.activeDocument;
        diag.log("document: " + doc.name);

        diag.step("choose-placement");
        var pf = opts.placementPath ? new File(opts.placementPath) : File.openDialog("Choose placement.json", "*.json");
        if (!pf) { result.status = "cancelled"; return result; }
        folder = pf.parent;
        var gf = new File(opts.geometryPath || (pf.parent.fsName + "/geometry.json"));
        diag.log("placement: " + pf.fsName);
        diag.log("geometry : " + gf.fsName);

        diag.step("read-placement");
        var placement = AN_JSON.parse(AN_IO.readText(pf));
        diag.step("read-geometry");
        var geometry = AN_JSON.parse(AN_IO.readText(gf));

        diag.step("set-coordinate-system");
        prevCS = app.coordinateSystem;
        app.coordinateSystem = CoordinateSystem.DOCUMENTCOORDINATESYSTEM;
        csChanged = true;

        diag.step("apply");
        progress = AN_Progress.create("Auto Nesting - applying", placement.placements ? placement.placements.length : 0, diag,
                                       opts.progressFile);
        var r = AN_Apply.run(doc, geometry, placement, { geometrySha256: opts.geometrySha256, _failAfter: opts._failAfter, resizeArtboard: opts.resizeArtboard,
                                                         onStep: function (n, total, label) {
                                                             progress.step(n, "Moving group " + n + " of " + total + " (" + label + ")");
                                                         } },
                             function (m) { diag.log(m); });
        progress.close();
        for (var k in r) { if (r.hasOwnProperty(k)) { result[k] = r[k]; } }
        for (var i = 0; i < r.problems.length; i++) { diag.log("PROBLEM " + r.problems[i]); }
        if (r.rollback) {
            diag.log("rollback restored=" + r.rollback.restored + " failed=" + r.rollback.failed.length +
                     " max_error_pt=" + r.rollback.max_error_pt);
            for (i = 0; i < r.rollback.failed.length; i++) { diag.log("ROLLBACK FAILED " + r.rollback.failed[i]); }
        }
        diag.log("status=" + r.status + " applied=" + r.applied + "/" + r.total + " max_error_pt=" + r.max_error_pt);
        if (r.status !== "applied") { diag.outcome = "NOT APPLIED (" + r.status + ")"; }

        diag.step("restore-coordinate-system");
        app.coordinateSystem = prevCS;
        csChanged = false;
        diag.step("done");
        result.diagnosticsPath = diag.save(folder, "autonest_apply_diagnostics.txt");
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
        result.diagnosticsPath = diag.save(folder, "autonest_apply_diagnostics.txt");
        return result;
    }
}

function AN_applyMessage(r) {
    var s;
    if (r.status === "applied") {
        s = "Moved " + r.applied + " of " + r.total + " groups into place (largest error " + r.max_error_pt.toFixed(4) + " pt).";
        if (r.parked) { s += "\n" + r.parked + " groups that did not fit were moved to the right of the artboard (and of the fabric)."; }
        if (r.artboard_mm) { s += "\nThe artboard is now " + r.artboard_mm[0].toFixed(1) + " x " + r.artboard_mm[1].toFixed(1) + " mm."; }
        return s;
    }
    if (r.status === "no_document") { return "No document is open."; }
    if (r.status === "cancelled") { return "Cancelled."; }
    var lines = [];
    if (r.status === "refused") { lines.push("NOT APPLIED - the document was not changed. Reasons:"); }
    if (r.status === "rolled_back") { lines.push("ERROR WHILE APPLYING - everything was undone; the document is as it was. Reason:"); }
    if (r.status === "rollback_failed") { lines.push("ERROR WHILE APPLYING AND THE UNDO WAS INCOMPLETE. Use Edit > Undo or File > Revert. Details:"); }
    if (r.status === "error") { lines.push("ERROR at step: " + r.step + "\n" + r.error); }
    var n = r.problems ? r.problems.length : 0;
    for (var i = 0; i < n && i < 12; i++) { lines.push("- " + r.problems[i]); }
    if (n > 12) { lines.push("... and " + (n - 12) + " more problems (see diagnostics)"); }
    if (r.rollback && r.rollback.failed.length) {
        for (i = 0; i < r.rollback.failed.length && i < 8; i++) { lines.push("! " + r.rollback.failed[i]); }
    }
    return lines.join("\n");
}

function AN_applyMain() {
    var r = AN_applyPlacement();
    if (r.status !== "cancelled") {
        alert("Illustrator Auto Nesting - Apply\n\n" + AN_applyMessage(r) + "\n\nDiagnostics: " + r.diagnosticsPath);
    }
    return r;
}
// ===== END jsx/lib/an_apply.jsxinc =====

if (typeof AN_NO_MAIN === "undefined") {
    AN_applyMain();
}


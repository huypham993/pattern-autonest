//@target illustrator
// GENERATED FILE - DO NOT EDIT. Built by tools/build/build_jsx.js from jsx/AutoNesting_PanelHost.jsx.
// Single file: no //@include, no external dependencies. Run it from File > Scripts > Other Script...
// Sources:
//   jsx/lib/an_json.jsxinc  sha256=b96487cfd4e2326bcbc27b2a48b42e119bde6235d1f7d2d309bd8985de800c17
//   jsx/lib/an_extract.jsxinc  sha256=2c0ba13d08e3ab10ff1cc3518cbef800f1dd0a37f2e008bdba8e5a9f1b9bb3d1
//   jsx/lib/an_io.jsxinc  sha256=839e8c39117efb7080faf0f9c514d556d395cd849a6bb1afc1eda3e713651df2
//   jsx/lib/an_main.jsxinc  sha256=adcfaa6dfc58edf7e38dfaf5c750835be4d83ec00571c75af5db0399087d1c97
//   jsx/lib/an_apply.jsxinc  sha256=ad2b39e527292917d49be16b003343902a551d531c676c732df0ec86f1bfb5e5
//   jsx/lib/an_panel.jsxinc  sha256=f4cef1ab4ea2a50a061f8bf713e74703a032a44802b64eceefd7ac5b5b3aee45
//   jsx/lib/an_labels.jsxinc  sha256=5d6d19a1ed730691790678b5854ae4633360c07022ed5e96b801a111a2091764
var AN_BUILD_INFO = { label: "autonest 0.4.0 Panel Host (AutoNesting_PanelHost.jsx)", version: "0.4.0" };
/*
 * Illustrator True-Shape Auto Nesting - host script of the CEP panel.
 * Defines AN_exportGeometry / AN_applyPlacement / AN_placeLabels and runs nothing by itself:
 * the panel loads dist/AutoNesting_PanelHost.jsx with $.evalFile and calls
 * AN_panelExport / AN_panelApply / AN_panelPlaceLabels through CSInterface.evalScript.
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
// ===== BEGIN jsx/lib/an_panel.jsxinc sha256=f4cef1ab4ea2a50a061f8bf713e74703a032a44802b64eceefd7ac5b5b3aee45 =====
/*
 * an_panel.jsxinc - entry points called by the CEP panel through evalScript.
 * Each returns a JSON string (evalScript only transports strings) and, when resultPath is given, also writes it
 * to that file: the panel reads the file if the evalScript reply never arrives.
 */
function AN_panelResult(out, resultPath) {
    var s = AN_JSON.stringify(out);
    if (!resultPath) { return s; }
    try {
        AN_IO.writeText(new File(resultPath), s);
    } catch (e) {
        out.result_file_error = AN_Diag.describe(e);   // reported to the panel through the normal reply
        s = AN_JSON.stringify(out);
    }
    return s;
}

/* the panel reads the progress of a running call from this file and draws it (see AN_Progress) */
function AN_panelProgressFile(resultPath) { return resultPath ? resultPath + ".progress" : null; }

/*
 * Signature of the selection, so the panel can re-nest with new settings without the slow export when nothing
 * changed. Every item in every selected group adds its type, flags and bounds; every path also adds its point
 * count, area and length (one DOM read each, not one per point), so a reshape inside unchanged group bounds is
 * still seen. Returns {document, artboard, groups: "uuid:hash ..." sorted by uuid}. Reads only.
 * shortcut: a reshape that keeps a path's bounds, point count, area and length all exactly equal goes unseen;
 * hash the anchors if that ever matters (it costs as much as the export).
 */
function AN_panelSignature() {
    if (app.documents.length === 0) { return null; }
    var doc = app.activeDocument;
    var prevCS = app.coordinateSystem;
    app.coordinateSystem = CoordinateSystem.DOCUMENTCOORDINATESYSTEM;
    try {
        var parts = [], sel = doc.selection, i;
        if (sel && typeof sel.length !== "undefined") {
            for (i = 0; i < sel.length; i++) {
                if (sel[i].typename === "GroupItem") { parts.push(String(sel[i].uuid) + ":" + AN_panelHash(AN_panelDescribe(sel[i]))); }
            }
        }
        parts.sort();
        var abi = doc.artboards.getActiveArtboardIndex();
        return { document: doc.name, artboard: abi + ":" + AN_panelNums(doc.artboards[abi].artboardRect),
                 groups: parts.join(" ") };
    } finally {
        app.coordinateSystem = prevCS;
    }
}

function AN_panelNums(a) {
    var s = [], i;
    for (i = 0; i < a.length; i++) { s.push(Math.round(a[i] * 1000) / 1000); }
    return s.join(",");
}

function AN_panelDescribe(item) {
    var t = item.typename, s = t + (item.hidden ? "h" : "") + "[" + AN_panelNums(item.geometricBounds) + "|" +
        AN_panelNums(item.visibleBounds) + "]", i;
    if (t === "PathItem") {
        s += item.pathPoints.length + "," + AN_panelNums([item.area, item.length, item.strokeWidth]) +
             (item.closed ? "c" : "") + (item.filled ? "f" : "") + (item.stroked ? "s" : "") + (item.clipping ? "k" : "") +
             (item.guides ? "g" : "") + (item.evenodd ? "e" : "");
    } else if (t === "GroupItem") {
        s += (item.clipped ? "k" : "") + "{";
        for (i = 0; i < item.pageItems.length; i++) { s += AN_panelDescribe(item.pageItems[i]) + ";"; }
        s += "}";
    } else if (t === "CompoundPathItem") {
        s += "{";
        for (i = 0; i < item.pathItems.length; i++) { s += AN_panelDescribe(item.pathItems[i]) + ";"; }
        s += "}";
    }
    return s;
}

/* two independent string hashes (products stay below 2^53, so the arithmetic is exact) */
function AN_panelHash(s) {
    var h1 = 0, h2 = 7, i, c;
    for (i = 0; i < s.length; i++) {
        c = s.charCodeAt(i);
        h1 = (h1 * 31 + c) % 2147483647;
        h2 = (h2 * 131 + c) % 1000000007;
    }
    return h1.toString(36) + "." + h2.toString(36) + "." + s.length.toString(36);
}

/* expectJson: the signature returned by the previous export; "" forces an export */
function AN_panelExport(expectJson, resultPath) {
    var reason = null;
    if (expectJson) {
        var expect = AN_JSON.parse(expectJson), now = null;
        try { now = AN_panelSignature(); } catch (e) { reason = "could not check the selection: " + AN_Diag.describe(e); }
        if (reason) { /* export again */ }
        else if (now === null) { reason = "no document"; }
        else if (now.document !== expect.document) { reason = "another document is active"; }
        else if (now.artboard !== expect.artboard) { reason = "the artboard changed"; }
        else if (now.groups !== expect.groups) { reason = "the selection or a group changed"; }
        else { return AN_panelResult({ status: "unchanged" }, resultPath); }
    }
    var r = AN_exportGeometry({ progressFile: AN_panelProgressFile(resultPath) });
    var out = { status: r.status, geometryPath: r.geometryPath, diagnosticsPath: r.diagnosticsPath,
                error: r.error, step: r.step || null, groups: r.groups, skipped: r.skipped || 0,
                reexport_reason: reason };
    if (r.geo) {
        out.skipped = r.geo.skipped_selection.length;
        out.points = r.geo.export_stats.points;
        out.export_ms = r.geo.export_stats.elapsed_ms;
        out.document = r.geo.document.name;
    }
    if (r.status === "ok") {
        try { out.signature = AN_JSON.stringify(AN_panelSignature()); }
        catch (e2) { out.signature_error = AN_Diag.describe(e2); }   // the next Nest then exports again
    }
    return AN_panelResult(out, resultPath);
}

function AN_panelApply(placementPath, geometrySha256, resizeArtboard, resultPath) {
    var r = AN_applyPlacement({ placementPath: placementPath, geometrySha256: geometrySha256, progressFile: AN_panelProgressFile(resultPath),
                                resizeArtboard: resizeArtboard === true });
    r.message = AN_applyMessage(r);
    return AN_panelResult(r, resultPath);
}

/* corner: "bottom_left" | "bottom_right" | "top_left" | "top_right"; heightMm "" keeps the label size */
function AN_panelPlaceLabels(gapMm, heightMm, corner, group, resultPath) {
    var r = AN_placeLabels({ gapMm: gapMm, heightMm: heightMm, corner: corner, group: group === true,
                             progressFile: AN_panelProgressFile(resultPath) });
    r.message = AN_labelsMessage(r);
    return AN_panelResult(r, resultPath);
}

/* groups each piece with its label and parts (inside its cut line or within half spacingMm of it); labels stay put */
function AN_panelGroupLabels(spacingMm, resultPath) {
    var r = AN_placeLabels({ place: false, group: true, spacingMm: spacingMm, progressFile: AN_panelProgressFile(resultPath) });
    r.message = AN_labelsMessage(r);
    return AN_panelResult(r, resultPath);
}
// ===== END jsx/lib/an_panel.jsxinc =====
// ===== BEGIN jsx/lib/an_labels.jsxinc sha256=5d6d19a1ed730691790678b5854ae4633360c07022ed5e96b801a111a2091764 =====
/*
 * an_labels.jsxinc - "Place labels" command.
 *
 * Moves each piece's number label snug against the piece's cut line, outside it, rotated to follow the edge and
 * never upside down; optionally scales the labels to one height first (like a match-object-size script) and
 * groups each piece with its label (as his Make Group script, but by piece instead of by distance).
 * Each label goes to the nearest piece (0 when it lies inside it); on that piece the straight stretch nearest to
 * the chosen corner of the piece's bounds is used (bottom left by default). Pieces are never moved.
 * Two ways to find pieces and labels: see collect(). Cut line = a visible, stroked, unfilled path (same rule as
 * the engine's cut_line policy). Coordinates: document coordinates, points, y up. Angles: degrees, CCW.
 * Any error while placing puts every label back.
 */
var AN_Labels = (function () {
    var PT_PER_MM = 72 / 25.4;
    var TAG = "AN_label_upright";      // value: direction of the label's reference vector when upright (degrees)
    var PIECE_TAG = "AN_piece";        // on each group made by a run: one tag read tells it from a label
    var LABEL_LAYER = "PatternNumber";   // layer names of the pattern software export
    var CUT_LAYER = "OffsetLine";
    var MATCH_PARTS = 0.8;              // share of a piece's bounds an item covers to be its image
    var OCCUPIED = "its piece already has a label";
    var MAX_MATCH_MM = 50;      // a label farther than this from every piece is not placed
    var FLAT_TOL_PT = 0.1;      // flattened Bezier segments stay this close to the curve (0.035 mm; finer costs speed),
                                // so labels keep this much more than the gap from an outline with curves
    var MAX_STEPS = 256;
    var CHECK_TOL_PT = 0.05;    // label centre after the move

    function now() { return new Date().getTime(); }
    var T = {};                 // time per sub-step of the last run, for tuning (ms; not shown in the panel)
    function lap(name, t0) { T[name] = (T[name] || 0) + now() - t0; return now(); }
    var P = null;               // progress(step, done, total, text, part) of the current run, or null
    function show(k, i, n, text, part) { if (P) { P(k, i, n, text, part); } }

    /* ------------------------------------------------------------ geometry (no DOM) */

    /*
     * Points of a path treated as closed, flat: [ax,ay,lx,ly,rx,ry, ax,ay,...] (anchor, left and right handle per
     * point) -> outline {x: [], y: [], n, curved}, counter-clockwise, no repeated end. Numbers in flat arrays, not
     * [x, y] pairs: ExtendScript gets very slow with tens of thousands of small arrays alive (a large real file: minutes).
     */
    function flatten(pts) {
        var X = [], Y = [], n = pts.length / 6, i, k, curved = false;
        for (i = 0; i < n; i++) {
            var j = i * 6, e = ((i + 1) % n) * 6;
            var ax = pts[j], ay = pts[j + 1], rx = pts[j + 4], ry = pts[j + 5];
            var bx = pts[e], by = pts[e + 1], lx = pts[e + 2], ly = pts[e + 3];
            X.push(ax); Y.push(ay);
            // handles within FLAT_TOL_PT of the chord: the curve is too (it stays in their hull)
            var cx = bx - ax, cy = by - ay, cl = Math.sqrt(cx * cx + cy * cy);
            // and between the anchors along it (a handle beyond an end bulges the curve past that end)
            var cc = cl * cl, pr = (rx - ax) * cx + (ry - ay) * cy, pl = (lx - ax) * cx + (ly - ay) * cy;
            if (cl > 1e-9 && Math.abs((rx - ax) * cy - (ry - ay) * cx) <= FLAT_TOL_PT * cl &&
                Math.abs((lx - ax) * cy - (ly - ay) * cx) <= FLAT_TOL_PT * cl && pr >= 0 && pr <= cc && pl >= 0 && pl <= cc) { continue; }
            // Wang's bound: this many chords keep within FLAT_TOL_PT of the cubic
            var mx = Math.max(Math.abs(ax - 2 * rx + lx), Math.abs(rx - 2 * lx + bx)),
                my = Math.max(Math.abs(ay - 2 * ry + ly), Math.abs(ry - 2 * ly + by));
            var steps = Math.min(MAX_STEPS, Math.ceil(Math.sqrt(0.75 * Math.sqrt(mx * mx + my * my) / FLAT_TOL_PT)));
            if (steps > 1) { curved = true; }
            for (k = 1; k < steps; k++) {
                var t = k / steps, u = 1 - t;
                X.push(u * u * u * ax + 3 * u * u * t * rx + 3 * u * t * t * lx + t * t * t * bx);
                Y.push(u * u * u * ay + 3 * u * u * t * ry + 3 * u * t * t * ly + t * t * t * by);
            }
        }
        // drop repeated points (some exported cut lines are open paths whose ends coincide)
        var cxs = [], cys = [], m = 0;
        for (i = 0; i < X.length; i++) {
            if (!m || Math.abs(cxs[m - 1] - X[i]) > 1e-6 || Math.abs(cys[m - 1] - Y[i]) > 1e-6) { cxs.push(X[i]); cys.push(Y[i]); m++; }
        }
        while (m > 1 && Math.abs(cxs[0] - cxs[m - 1]) <= 1e-6 && Math.abs(cys[0] - cys[m - 1]) <= 1e-6) { cxs.pop(); cys.pop(); m--; }
        var area = 0;
        for (i = 0; i < m; i++) {
            var r = (i + 1) % m;
            area += cxs[i] * cys[r] - cxs[r] * cys[i];
        }
        if (area < 0) { cxs.reverse(); cys.reverse(); }
        return { x: cxs, y: cys, n: m, curved: curved };
    }

    /* outline with cumulative arc length, for point-at-arc-length lookups */
    function Ring(poly) {
        var X = poly.x, Y = poly.y, n = poly.n;
        this.p = poly;
        this.cum = [0];
        for (var i = 0; i < n; i++) {
            var b = (i + 1) % n;
            this.cum.push(this.cum[i] + Math.sqrt((X[b] - X[i]) * (X[b] - X[i]) + (Y[b] - Y[i]) * (Y[b] - Y[i])));
        }
        this.len = this.cum[n];
    }
    Ring.prototype.seg = function (s) {      // index of the segment holding arc length s (0 <= s < len)
        var lo = 0, hi = this.p.n - 1;
        while (lo < hi) {
            var mid = (lo + hi + 1) >> 1;
            if (this.cum[mid] <= s) { lo = mid; } else { hi = mid - 1; }
        }
        return lo;
    };
    Ring.prototype.wrap = function (s) { s = s % this.len; return s < 0 ? s + this.len : s; };
    Ring.prototype.at = function (s) {
        s = this.wrap(s);
        var i = this.seg(s), b = (i + 1) % this.p.n, X = this.p.x, Y = this.p.y;
        var L = this.cum[i + 1] - this.cum[i], t = L > 0 ? (s - this.cum[i]) / L : 0;
        return [X[i] + t * (X[b] - X[i]), Y[i] + t * (Y[b] - Y[i])];
    };

    /* distance from (px, py) to segment (ax, ay)-(bx, by) */
    function segDist(px, py, ax, ay, bx, by) {
        var dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
        var t = L2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / L2 : 0;
        t = t < 0 ? 0 : (t > 1 ? 1 : t);
        var x = ax + t * dx - px, y = ay + t * dy - py;
        return Math.sqrt(x * x + y * y);
    }

    /* distance from p to the outline, 0 inside it */
    function polyDist(p, poly) {
        var best = Infinity, inside = false, n = poly.n, X = poly.x, Y = poly.y, x = p[0], y = p[1];
        for (var i = 0, j = n - 1; i < n; j = i++) {
            var ax = X[j], ay = Y[j], bx = X[i], by = Y[i];
            // segDist only when the segment's box is within best of p (most are not: script engines are slow)
            if (!(ax - x > best && bx - x > best) && !(x - ax > best && x - bx > best) &&
                !(ay - y > best && by - y > best) && !(y - ay > best && y - by > best)) {
                best = Math.min(best, segDist(x, y, ax, ay, bx, by));
            }
            if ((by > y) !== (ay > y) && x < (ax - bx) * (y - by) / (ay - by) + bx) { inside = !inside; }
        }
        return inside ? 0 : best;
    }

    function bbox(poly) {
        var b = [Infinity, Infinity, -Infinity, -Infinity], X = poly.x, Y = poly.y;
        for (var i = 0; i < poly.n; i++) {
            if (X[i] < b[0]) { b[0] = X[i]; } if (Y[i] < b[1]) { b[1] = Y[i]; }
            if (X[i] > b[2]) { b[2] = X[i]; } if (Y[i] > b[3]) { b[3] = Y[i]; }
        }
        return b;
    }

    function bboxDist(p, b) {
        var dx = Math.max(b[0] - p[0], 0, p[0] - b[2]), dy = Math.max(b[1] - p[1], 0, p[1] - b[3]);
        return Math.sqrt(dx * dx + dy * dy);
    }

    function readable(deg) {   // (-90, 90]: text is never upside down
        while (deg > 90) { deg -= 180; }
        while (deg <= -90) { deg += 180; }
        return deg;
    }

    /*
     * Where to put a w x h label (centre c0) against the outline poly (see flatten).
     * opts: {gap (pt), side: 1 outside / -1 inside}
     * Candidates are points of the outline, tried nearest to c0 first. A candidate is kept when the outline is
     * straight (within tol) over the label length plus max(h/2, gap) on each side, and nothing else of the outline comes
     * within gap of the label box. Returns {center, angle, edge_dev} or null.
     */
    function place(poly, w, h, c0, opts) {
        var ring = new Ring(poly), gap = opts.gap + (poly.curved ? FLAT_TOL_PT : 0), side = opts.side || 1;
        var half = w / 2, reach = half + Math.max(h / 2, gap) + 0.1;
        if (ring.len < 2 * reach) { return null; }
        var step = Math.max(ring.len / 4000, 0.25 * PT_PER_MM), n = poly.n, X = poly.x, Y = poly.y, dmax = 0, i;
        for (i = 0; i < n; i++) {     // farthest point of the outline: a vertex
            var vx = X[i] - c0[0], vy = Y[i] - c0[1];
            if (vx * vx + vy * vy > dmax) { dmax = vx * vx + vy * vy; }
        }
        // candidates every step along the outline, nearest to c0 first. Script engines are slow: the candidates are
        // made and sorted ring by ring (squared radius x4 each time), skipping segments outside the ring, and only as
        // far out as needed. Each ring: arc lengths, squared distances and an index array sorted by distance.
        var rings = [], lim = Math.pow(4 * reach, 2);
        function ringAt(k) {
            while (rings.length <= k) {
                var lo = rings.length ? lim * Math.pow(4, rings.length - 1) : -1, hi = lim * Math.pow(4, rings.length);
                var R = Math.sqrt(hi), S = [], D = [], idx = [];
                for (var j = 0; j < n; j++) {
                    var b = (j + 1) % n, c = ring.cum[j], e = ring.cum[j + 1];
                    var ax = X[j] - c0[0], ay = Y[j] - c0[1], bx = X[b] - c0[0], by = Y[b] - c0[1];
                    if ((ax > R && bx > R) || (ax < -R && bx < -R) || (ay > R && by > R) || (ay < -R && by < -R)) { continue; }
                    if (Math.max(ax * ax + ay * ay, bx * bx + by * by) <= lo) { continue; }
                    var near = segDist(0, 0, ax, ay, bx, by);
                    if (near * near > hi || e <= c) { continue; }
                    for (var s = Math.ceil(c / step) * step; s < e; s += step) {
                        var t = (s - c) / (e - c), dx = ax + t * (bx - ax), dy = ay + t * (by - ay), d = dx * dx + dy * dy;
                        if (d > lo && d <= hi) { idx.push(S.length); S.push(s); D.push(d); }
                    }
                }
                idx.sort(function (x, y) { return D[x] - D[y]; });
                rings.push({ s: S, idx: idx });
            }
            return rings[k];
        }
        var baseTol = Math.max(0.25 * PT_PER_MM, 0.15 * h);
        for (var pass = 0; pass < 3; pass++) {
            var tol = baseTol * Math.pow(2, pass);
            for (var k = 0; k === 0 || lim * Math.pow(4, k - 1) < dmax; k++) {
                var part = ringAt(k);
                for (var j = 0; j < part.idx.length; j++) {
                    var r = tryAt(ring, part.s[part.idx[j]], half, reach, h, gap, side, tol);
                    if (r) { r.relaxed = pass; return r; }
                }
            }
        }
        return null;
    }

    function tryAt(ring, s, half, reach, h, gap, side, tol) {
        var a = ring.at(s - reach), b = ring.at(s + reach), o = ring.at(s);
        var cx = b[0] - a[0], cy = b[1] - a[1];
        if (cx * cx + cy * cy < 4 * reach * reach * 0.81) { return null; }   // the stretch folds back (sharp corner)
        // direction: the outline's tangent at o (a chord across a nearby corner would tilt the label)
        var e = Math.min(half, PT_PER_MM), p0 = ring.at(s - e), p1 = ring.at(s + e);
        var tx = p1[0] - p0[0], ty = p1[1] - p0[1], L = Math.sqrt(tx * tx + ty * ty);
        if (L < e) { return null; }
        tx /= L; ty /= L;
        var nx = side * ty, ny = -side * tx;           // outward normal of a counter-clockwise ring (side 1)
        // straightness of the stretch [s - reach, s + reach]: its ends and every vertex between near the tangent line
        var X = ring.p.x, Y = ring.p.y, n = ring.p.n;
        var i0 = ring.seg(ring.wrap(s - reach)), i1 = ring.seg(ring.wrap(s + reach)), i = i0, guard = 0;
        var ona = (a[0] - o[0]) * nx + (a[1] - o[1]) * ny, onb = (b[0] - o[0]) * nx + (b[1] - o[1]) * ny;
        if (Math.abs(ona) > tol || Math.abs(onb) > tol) { return null; }
        var near = Math.max(ona, onb);
        while (i !== i1 && guard++ <= n) {
            i = (i + 1) % n;
            var on = (X[i] - o[0]) * nx + (Y[i] - o[1]) * ny;
            if (Math.abs(on) > tol) { return null; }
            if (on > near) { near = on; }
        }
        if (near < 0) { near = 0; }
        var q0 = near + gap, q1 = q0 + h;               // label box: t in [-half, half], n in [q0, q1]
        // nothing else of the outline may come within gap of the box
        for (var j = 0; j < n; j++) {
            var r = (j + 1) % n;
            var pt = (X[j] - o[0]) * tx + (Y[j] - o[1]) * ty, pn = (X[j] - o[0]) * nx + (Y[j] - o[1]) * ny;
            var rt = (X[r] - o[0]) * tx + (Y[r] - o[1]) * ty, rn = (X[r] - o[0]) * nx + (Y[r] - o[1]) * ny;
            if (pt < -half - gap && rt < -half - gap || pt > half + gap && rt > half + gap ||
                pn < q0 - gap + 1e-6 && rn < q0 - gap + 1e-6 || pn > q1 + gap && rn > q1 + gap) { continue; }
            if (segHitsBox(pt, pn, rt, rn, -half - gap, half + gap, q0 - gap + 1e-6, q1 + gap)) { return null; }
        }
        var m = (q0 + q1) / 2;
        return { center: [o[0] + nx * m, o[1] + ny * m],
                 angle: readable(Math.atan2(ty, tx) * 180 / Math.PI), edge_dev: tol };
    }

    /* does segment (t0,n0)-(t1,n1) touch the box [tmin,tmax] x [nmin,nmax]? (Liang-Barsky clip) */
    function segHitsBox(t0, n0, t1, n1, tmin, tmax, nmin, nmax) {
        var lo = 0, hi = 1, dt = t1 - t0, dn = n1 - n0;
        var ps = [-dt, dt, -dn, dn], qs = [t0 - tmin, tmax - t0, n0 - nmin, nmax - n0];
        for (var i = 0; i < 4; i++) {
            if (ps[i] === 0) { if (qs[i] < 0) { return false; } continue; }
            var v = qs[i] / ps[i];
            if (ps[i] < 0) { if (v > hi) { return false; } if (v > lo) { lo = v; } }
            else { if (v < lo) { return false; } if (v < hi) { hi = v; } }
        }
        return true;
    }

    function boxArea(b) { return (b[2] - b[0]) * (b[3] - b[1]); }

    /*
     * Pair each label centre with the nearest piece (one label per piece, closest pairs first). A label inside a
     * piece's cut line belongs to that piece only (the smallest, when pieces lie inside others): -2 when another
     * label inside it took it.
     * pieces: [{poly, box}]; returns an array: piece index per label, -1 (none near) or -2.
     */
    function match(centers, pieces, maxDist) {
        var pairs = [], i, j;
        for (i = 0; i < centers.length; i++) {
            for (j = 0; j < pieces.length; j++) {
                if (bboxDist(centers[i], pieces[j].box) > maxDist) { continue; }
                var d = polyDist(centers[i], pieces[j].poly);
                if (d <= maxDist) { pairs.push({ d: d, l: i, p: j, a: boxArea(pieces[j].box) }); }
            }
        }
        pairs.sort(function (x, y) { return x.d - y.d || x.a - y.a; });
        var out = [], used = {};
        for (i = 0; i < centers.length; i++) { out.push(-1); }
        for (i = 0; i < pairs.length; i++) {
            var q = pairs[i];
            if (out[q.l] !== -1) { continue; }
            if (used[q.p]) { if (q.d === 0) { out[q.l] = -2; } continue; }
            out[q.l] = q.p;
            used[q.p] = true;
        }
        return out;
    }

    /*
     * Group only: the pieces whose cut line is within zone of a label (half: half the label's smaller side, so the
     * distance is from the label's edge, not its centre). A label inside a cut line gets only that piece (the
     * smallest, when pieces lie inside others). One piece pairs them; none or several is an error.
     */
    function nearPieces(c, half, pieces, zone) {
        var out = [], inside = -1;
        for (var j = 0; j < pieces.length; j++) {
            if (bboxDist(c, pieces[j].box) - half > zone) { continue; }
            var d = polyDist(c, pieces[j].poly);
            if (d === 0 && (inside < 0 || boxArea(pieces[j].box) < boxArea(pieces[inside].box))) { inside = j; }
            if (d - half <= zone) { out.push(j); }
        }
        return inside >= 0 ? [inside] : out;
    }

    /* the smallest piece whose cut line holds c, or -1 */
    function insideOf(c, pieces) {
        var k = -1;
        for (var j = 0; j < pieces.length; j++) {
            if (bboxDist(c, pieces[j].box) > 0 || polyDist(c, pieces[j].poly) > 0) { continue; }
            if (k < 0 || boxArea(pieces[j].box) < boxArea(pieces[k].box)) { k = j; }
        }
        return k;
    }

    /* ------------------------------------------------------------ DOM */

    function isHidden(item) { try { return !!item.hidden; } catch (e) { return false; } }

    /* the largest visible stroked unfilled path inside a group (outside skip), or null */
    function cutLine(group, skip) {
        var best = null, bestArea = -1, stack = [group];
        while (stack.length) {
            var it = stack.pop();
            if (it === skip || isHidden(it)) { continue; }
            if (it.typename === "GroupItem") {
                for (var i = 0; i < it.pageItems.length; i++) { stack.push(it.pageItems[i]); }
            } else if (it.typename === "PathItem" && it.stroked && !it.filled && !it.clipping && !it.guides &&
                       it.pathPoints.length >= 3) {
                var b = it.geometricBounds, area = (b[2] - b[0]) * (b[1] - b[3]);
                if (area > bestArea) { best = it; bestArea = area; }
            }
        }
        return best;
    }

    function readPoints(path) {
        var pps = path.pathPoints, n = pps.length, out = [];
        for (var i = 0; i < n; i++) {
            var pp = pps[i], a = pp.anchor, l = pp.leftDirection, r = pp.rightDirection;
            out.push(a[0], a[1], l[0], l[1], r[0], r[1]);
        }
        return out;
    }

    /*
     * The paths of an SVG file as Illustrator writes it (path, polygon, polyline, line, rect), in file order, as
     * flat points (see flatten) in SVG units (y down). null when the file holds anything else this cannot read
     * (a transform, arcs, several subpaths), so the caller reads the paths where they are.
     */
    function parseSvg(text) {
        var out = [], m, el = /<(path|polygon|polyline|line|rect)\b([^>]*)>/g, num = /[+\-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+\-]?\d+)?/g;
        if (/\btransform\s*=/.test(text)) { return null; }
        function attr(a, name) {
            var r = new RegExp("\\s" + name + "\\s*=\\s*\"([^\"]*)\"").exec(a);
            return r ? r[1] : null;
        }
        function nums(str) { return str.match(num) || []; }
        while ((m = el.exec(text)) !== null) {
            var tag = m[1], a = m[2], pts = [], v, i;
            if (tag === "polygon" || tag === "polyline") {
                v = nums(attr(a, "points") || "");
                for (i = 0; i + 1 < v.length; i += 2) { pt(pts, +v[i], +v[i + 1]); }
            } else if (tag === "line") {
                pt(pts, +attr(a, "x1"), +attr(a, "y1"));
                pt(pts, +attr(a, "x2"), +attr(a, "y2"));
            } else if (tag === "rect") {
                var x = +(attr(a, "x") || 0), y = +(attr(a, "y") || 0), w = +attr(a, "width"), h = +attr(a, "height");
                pt(pts, x, y); pt(pts, x + w, y); pt(pts, x + w, y + h); pt(pts, x, y + h);
            } else {
                pts = pathData(attr(a, "d") || "");
                if (!pts) { return null; }
            }
            for (i = 0; i < pts.length; i++) { if (!isFinite(pts[i])) { return null; } }
            out.push(pts);
        }
        return out;
    }

    function pt(pts, x, y) { pts.push(x, y, x, y, x, y); }

    /* one subpath of SVG path data (M L H V C S Z, absolute or relative) -> anchors with handles; null otherwise */
    function pathData(d) {
        var tok = d.match(/[A-Za-z]|[+\-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+\-]?\d+)?/g) || [], i = 0, cmd = "", pts = [];
        var x = 0, y = 0, sx = 0, sy = 0, last = null, lx = 0, ly = 0, moved = 0;
        function n() { return +tok[i++]; }
        while (i < tok.length) {
            if (/[A-Za-z]/.test(tok[i])) { cmd = tok[i++]; if (cmd === "z" || cmd === "Z") { cmd = "Z"; } }
            var rel = cmd === cmd.toLowerCase(), c = cmd.toUpperCase(), ox = rel ? x : 0, oy = rel ? y : 0;
            if (c === "Z") {
                var L = pts.length - 6;
                if (L > 0 && Math.abs(pts[0] - pts[L]) < 1e-9 && Math.abs(pts[1] - pts[L + 1]) < 1e-9) {
                    pts[2] = pts[L + 2]; pts[3] = pts[L + 3];   // closed by a curve back to the start: one anchor
                    pts.length = L;
                }
                x = sx; y = sy; last = null;
                if (i < tok.length && !/[A-Za-z]/.test(tok[i])) { return null; }
                continue;
            }
            if (c === "M") {
                if (++moved > 1) { return null; }
                x = ox + n(); y = oy + n(); sx = x; sy = y;
                pt(pts, x, y);
                cmd = rel ? "l" : "L";   // further pairs are lines
                last = null;
            } else if (c === "L" || c === "H" || c === "V") {
                if (c !== "V") { x = ox + n(); }
                if (c !== "H") { y = oy + n(); }
                pt(pts, x, y);
                last = null;
            } else if (c === "C" || c === "S") {
                var x1, y1, P = pts.length;
                if (!P) { return null; }
                if (c === "C") { x1 = ox + n(); y1 = oy + n(); }
                else { x1 = last ? 2 * x - lx : x; y1 = last ? 2 * y - ly : y; }
                var x2 = ox + n(), y2 = oy + n();
                x = ox + n(); y = oy + n();
                pts[P - 2] = x1; pts[P - 1] = y1;
                pts.push(x, y, x2, y2, x, y);
                last = true; lx = x2; ly = y2;
            } else {
                return null;   // arcs, quadratics
            }
        }
        return pts.length ? pts : null;
    }

    function centerOf(item) {
        var b = item.geometricBounds;
        return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
    }

    function findTag(item, name) {
        name = name || TAG;
        try {
            for (var i = 0; i < item.tags.length; i++) { if (item.tags[i].name === name) { return item.tags[i]; } }
        } catch (e) { /* items without tags */ }
        return null;
    }

    /*
     * first anchor of the first path to the last anchor of the last path inside an item: their direction turns with
     * the item. One path (an outlined "1"): its ends may meet, so first anchor to the anchor farthest from it.
     */
    function refAngle(item) {
        var p0 = endPath(item, false), p1 = endPath(item, true);
        if (!p0 || !p1) { return null; }
        var pps = p0.pathPoints, first = pps[0].anchor, last = p1.pathPoints[p1.pathPoints.length - 1].anchor;
        if (p0 === p1) {
            // shortcut: a near tie for the farthest anchor (a symmetric shape) may flip after a rotation; fine for digits
            var far = 0;
            for (var k = 1, n = pps.length; k < n; k++) {
                var a = pps[k].anchor, d = (a[0] - first[0]) * (a[0] - first[0]) + (a[1] - first[1]) * (a[1] - first[1]);
                if (d > far + 1e-6) { far = d; last = a; }
            }
        }
        var dx = last[0] - first[0], dy = last[1] - first[1];
        return dx * dx + dy * dy < 0.25 ? null : Math.atan2(dy, dx) * 180 / Math.PI;
    }

    /* the first (or last) path with anchors inside an item, depth first; null if none */
    function endPath(it, fromEnd) {
        var t = it.typename, kids = t === "GroupItem" ? it.pageItems : (t === "CompoundPathItem" ? it.pathItems : null);
        if (!kids) { return t === "PathItem" && it.pathPoints.length ? it : null; }
        var n = kids.length;
        for (var k = 0; k < n; k++) {
            var p = endPath(kids[fromEnd ? n - 1 - k : k], fromEnd);
            if (p) { return p; }
        }
        return null;
    }

    /*
     * The label's current angle. Text: its matrix. Outlined or stroked labels: the tag this script left on it holds
     * the reference direction of the upright label, so a later rotation (by nesting, or by hand) is seen too.
     * Untagged: upright (0).
     */
    function angleOf(item) {
        if (item.typename === "TextFrame") {
            var m = item.matrix;
            return Math.atan2(m.mValueB, m.mValueA) * 180 / Math.PI;
        }
        var t = findTag(item);
        if (!t) { return 0; }
        var now = refAngle(item), up = parseFloat(t.value);
        return now !== null && isFinite(up) ? now - up : 0;
    }

    /* call while the label is upright (text: the tag only marks it as a label; its angle comes from its matrix) */
    function tagUpright(item) {
        var up = item.typename === "TextFrame" ? 0 : refAngle(item);
        var t = findTag(item);
        if (!t) { t = item.tags.add(); t.name = TAG; }
        t.value = up === null ? "none" : String(Math.round(up * 1e6) / 1e6);   // no reference (an image): angle 0
    }

    function rotate(item, deg) {
        if (Math.abs(deg) > 1e-7) { item.rotate(deg, true, true, true, true, Transformation.CENTER); }
    }

    /* uniform scale about the centre, strokes too (like a match-object-size script) */
    function scale(item, pct) {
        if (Math.abs(pct - 100) > 1e-4) { item.resize(pct, pct, true, true, true, true, pct, Transformation.CENTER); }
    }

    function moveCenter(item, c) {
        var now = centerOf(item);
        item.translate(c[0] - now[0], c[1] - now[1]);
    }

    function describe(item) {
        var s = "Label";
        try { if (item.typename === "TextFrame") { s += " \"" + item.contents + "\""; } } catch (e) { /* ignore */ }
        var c = centerOf(item);
        return s + " at " + (c[0] / PT_PER_MM).toFixed(0) + ", " + (c[1] / PT_PER_MM).toFixed(0) + " mm";
    }

    function layerName(item) { try { return item.layer.name; } catch (e) { return ""; } }

    function findLayer(doc, name) {
        try {
            for (var i = 0; i < doc.layers.length; i++) { if (doc.layers[i].name === name) { return doc.layers[i]; } }
        } catch (e) { /* no layers collection */ }
        return null;
    }

    function addPiece(pieces, item, cl, label, pts) {
        var poly = flatten(pts || readPoints(cl));
        if (poly.n < 3) { return false; }
        pieces.push({ item: item, cut: cl, poly: poly, box: bbox(poly), label: label || null });
        return true;
    }

    /*
     * SVG paths (parseSvg, y down, file order = bottom first) -> AI points matching paths with these geometric bounds
     * (stacking order, top first), or null when they do not line up. Bounds within 0.05 pt; the shift between the
     * documents comes from the first path.
     */
    function alignSvg(svg, gb) {
        if (!svg || svg.length !== gb.length || !gb.length) { return null; }
        var n = svg.length, boxes = [], i, k;
        for (i = 0; i < n; i++) { boxes.push(svgBox(svg[n - 1 - i])); }
        var ox = gb[0][0] - boxes[0][0], oy = gb[0][1] + boxes[0][1], out = [];
        for (i = 0; i < n; i++) {
            var b = boxes[i], g = gb[i];
            if (Math.abs(b[0] + ox - g[0]) > 0.05 || Math.abs(oy - b[1] - g[1]) > 0.05 ||
                Math.abs(b[2] + ox - g[2]) > 0.05 || Math.abs(oy - b[3] - g[3]) > 0.05) { return null; }
            var src = svg[n - 1 - i], pts = [];
            for (k = 0; k < src.length; k += 2) { pts.push(src[k] + ox, oy - src[k + 1]); }
            out.push(pts);
        }
        return out;
    }

    /* [minx, miny, maxx, maxy] of a closed SVG path (y down), curves sampled */
    function svgBox(pts) {
        var b = [Infinity, Infinity, -Infinity, -Infinity], n = pts.length / 6, i, k;
        function add(x, y) { b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y); }
        for (i = 0; i < n; i++) {
            var a = i * 6, c = ((i + 1) % n) * 6;
            add(pts[a], pts[a + 1]);
            if (pts[a + 4] === pts[a] && pts[a + 5] === pts[a + 1] && pts[c + 2] === pts[c] && pts[c + 3] === pts[c + 1]) { continue; }
            for (k = 1; k < 32; k++) {
                var t = k / 32, u = 1 - t;
                add(u * u * u * pts[a] + 3 * u * u * t * pts[a + 4] + 3 * u * t * t * pts[c + 2] + t * t * t * pts[c],
                    u * u * u * pts[a + 1] + 3 * u * u * t * pts[a + 5] + 3 * u * t * t * pts[c + 3] + t * t * t * pts[c + 1]);
            }
        }
        return b;
    }

    /*
     * The points of many paths at once, or null (then each path is read where it is). Illustrator takes ~1.5-3 ms per
     * point the first time a script reads it (a large real file: 28,000 points, 30-100 s), so the paths are copied into
     * a scratch document, saved there as SVG and the file is parsed. Replaces the clipboard; the selection is kept.
     */
    function readSvg(doc, paths) {
        if (typeof app.copy !== "function" || typeof ExportOptionsSVG === "undefined" || !paths.length) { return null; }
        var tmp = null, unlocked = [], i, file = null, prevSel = null, ui = app.userInteractionLevel, T0 = now();
        try {
            var gb = [];
            for (i = 0; i < paths.length; i++) {
                gb.push(paths[i].geometricBounds);
                var lay = paths[i].layer;
                if (lay.locked) { lay.locked = false; unlocked.push(lay); }
            }
            var t = lap("svg_bounds", T0);
            show(1, 0, 0, "Copying cut lines");
            prevSel = doc.selection;
            app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;
            doc.selection = null;
            doc.selection = paths;
            app.copy();
            t = lap("svg_copy", t);
            tmp = app.documents.add(DocumentColorSpace.RGB, 1000, 1000);
            app.executeMenuCommand("pasteInPlace");
            t = lap("svg_paste", t);
            file = new File(Folder.temp.fsName + "/an_cutlines_" + now() + ".svg");
            var o = new ExportOptionsSVG();
            o.coordinatePrecision = 4;
            o.embedRasterImages = false;
            tmp.exportFile(file, ExportType.SVG, o);
            t = lap("svg_export", t);
            show(1, 0, 0, "Reading cut lines", 0.5);   // after the copy, about half of step 1
            file.encoding = "UTF-8";
            if (!file.open("r")) { return null; }
            var text = file.read();
            file.close();
            t = lap("svg_read", t);
            var parsed = parseSvg(text);
            t = lap("svg_parse", t);
            var al = alignSvg(parsed, gb);
            lap("svg_align", t);
            return al;
        } catch (e) {
            return null;
        } finally {
            var tf = now();
            if (tmp) { try { tmp.close(SaveOptions.DONOTSAVECHANGES); } catch (e2) { /* left open */ } }
            try { if (file && file.exists) { file.remove(); } } catch (e3) { /* left in temp */ }
            try { app.activeDocument = doc; doc.selection = null; if (prevSel && prevSel.length) { doc.selection = prevSel; } } catch (e4) { /* ignore */ }
            for (i = 0; i < unlocked.length; i++) { unlocked[i].locked = true; }
            app.userInteractionLevel = ui;
            lap("svg_cleanup", tf);
        }
    }

    /* items of a layer or group, with containers (groups holding only groups) opened; a locked one stays whole */
    function leaves(coll, out) {
        for (var i = 0, n = coll.length; i < n; i++) {
            var it = coll[i], k, kids = it.typename === "GroupItem" ? it.pageItems : null, nk = kids ? kids.length : 0;
            if (isHidden(it)) { continue; }
            var onlyGroups = nk > 0 && !it.locked;
            for (k = 0; onlyGroups && k < nk; k++) { onlyGroups = kids[k].typename === "GroupItem"; }
            if (onlyGroups) { leaves(kids, out); } else { out.push(it); }
        }
        return out;
    }

    /*
     * a piece grouped by an earlier run: its own tag, or (groups made before that tag) its label tagged as first child.
     * Reading the tags of every child cost 7 s for 84 labels of strokes.
     */
    function isGroupedPiece(it) {
        if (it.typename !== "GroupItem") { return false; }
        return !!(findTag(it, PIECE_TAG) || (it.pageItems.length && findTag(it.pageItems[0])));
    }

    function markPiece(g) {
        var t = g.tags.add();
        t.name = PIECE_TAG;
        t.value = "1";
    }

    function isCutPath(it) {
        return it.typename === "PathItem" && !isHidden(it) && it.stroked && !it.filled && !it.clipping && !it.guides;
    }

    /* locked: per path, true when it or a group around it is locked (it cannot be moved into a group) */
    function cutPaths(coll, out, locked, inLocked) {
        for (var i = 0, n = coll.length; i < n; i++) {
            var it = coll[i];
            if (it.typename === "GroupItem" && !isHidden(it)) { cutPaths(it.pageItems, out, locked, inLocked || it.locked); }
            else if (isCutPath(it)) { out.push(it); locked.push(!!(inLocked || it.locked)); }
        }
        return out;
    }

    /*
     * Find the pieces and labels.
     * Layer mode (layers LABEL_LAYER and CUT_LAYER exist, as exported by the pattern software, and CUT_LAYER holds cut
     * lines, i.e. the pieces are not grouped yet): every
     * path of CUT_LAYER is a piece's cut line; labels are the selected items of LABEL_LAYER, or all of them when
     * none is selected. Pieces need not be selectable (their layers are usually locked).
     * Selection mode (otherwise, e.g. pieces already grouped): a selected group holding a label this script tagged
     * is a grouped pair (re-run); other selected items on LABEL_LAYER are labels; other selected groups with a cut
     * line are pieces; without a LABEL_LAYER, selected items without a cut line are labels.
     */
    function collect(doc, items) {
        var pieces = [], labels = [], grouped = [], i, it, subset = false, labelLayer = findLayer(doc, LABEL_LAYER), cutLayer = findLayer(doc, CUT_LAYER);
        var t = now(), regroup = false;   // grouped pieces selected (a re-run): selection mode, even if ungrouped cut lines remain
        for (i = 0; i < items.length && !regroup; i++) { regroup = isGroupedPiece(items[i]); }
        var cutLocked = [], cuts = labelLayer && cutLayer && cutLayer.visible && !regroup ? cutPaths(cutLayer.pageItems, [], cutLocked) : [];
        t = lap("c_cuts", t);
        if (cuts.length) {
            var svg = readSvg(doc, cuts);
            t = now();
            for (i = 0; i < cuts.length; i++) {
                if (addPiece(pieces, cuts[i], cuts[i], null, svg ? svg[i] : null)) { pieces[pieces.length - 1].locked = cutLocked[i]; }
            }
            t = lap("c_pieces", t);
            show(1, 0, 0, "Finding labels", 0.65);
            var picked = [];
            for (i = 0; i < items.length; i++) { if (layerName(items[i]) === LABEL_LAYER) { picked.push(items[i]); } }
            var lab = leaves(picked.length ? picked : labelLayer.pageItems, []);
            t = lap("c_leaves", t);
            subset = picked.length > 0;
            for (i = 0; i < lab.length; i++) {
                if (isGroupedPiece(lab[i])) { grouped.push(lab[i].geometricBounds); continue; }   // grouped by an earlier run
                if (!lab[i].locked) { labels.push({ item: lab[i] }); }
            }
            for (i = 0; subset && i < labelLayer.pageItems.length; i++) {   // the grouped pieces the selection left out
                it = labelLayer.pageItems[i];
                if (it.typename === "GroupItem" && findTag(it, PIECE_TAG)) { grouped.push(it.geometricBounds); }
            }
            t = lap("c_labels", t);
        } else {
            for (i = 0; i < items.length; i++) {
                it = items[i];
                if (it.locked || isHidden(it)) { continue; }
                var tagged = null, k;
                for (k = 0; it.typename === "GroupItem" && k < it.pageItems.length && !tagged; k++) {
                    if (findTag(it.pageItems[k])) { tagged = it.pageItems[k]; }
                }
                var onLabelLayer = labelLayer && layerName(it) === LABEL_LAYER;
                var cl = it.typename === "GroupItem" && (tagged || !onLabelLayer) ? cutLine(it, tagged) : null;
                if (cl && addPiece(pieces, it, cl, tagged)) {
                    if (tagged) { labels.push({ item: tagged, piece: pieces.length - 1 }); }
                } else if (onLabelLayer || !labelLayer) {
                    labels.push({ item: it });
                }
            }
        }
        t = now();
        for (i = 0; i < labels.length; i++) { labels[i].center = centerOf(labels[i].item); }
        lap("c_centers", t);
        return { pieces: pieces, labels: labels, grouped: grouped, layerMode: cuts.length > 0, picked: subset, svg: !!svg };
    }

    /* share of rectangle a ([l, t, r, b]) that lies inside rectangle b */
    function within(a, b) {
        var w = Math.min(a[2], b[2]) - Math.max(a[0], b[0]), h = Math.min(a[1], b[1]) - Math.max(a[3], b[3]);
        var area = (a[2] - a[0]) * (a[1] - a[3]);
        return w <= 0 || h <= 0 ? 0 : (area > 0 ? w * h / area : 1);
    }


    /*
     * Layer mode: one group per piece = its label, its cut line and every item of the other layers lying within
     * the piece's bounds, stacked in layer order, placed on top of LABEL_LAYER.
     * Items that match no piece (frames around several pieces, notes) stay where they are. Locked layers are unlocked for the moves and
     * locked again afterwards. Returns the new groups.
     */
    function groupByLayers(doc, pieces, labelOf, onlyLabelled, res, zone) {
        var i, j, L, parts = [], cand = [], layers = [], nl = doc.layers.length, t0 = now();
        for (L = 0; L < nl; L++) { layers.push(doc.layers[L]); }
        // DOM reads are slow: read every bound once
        for (i = 0; i < pieces.length; i++) { parts.push([]); pieces[i].gb = pieces[i].cut.geometricBounds; }
        for (L = 0; L < nl; L++) {   // hidden layers and locked items stay where they are
            if (layers[L].name === LABEL_LAYER || layers[L].name === CUT_LAYER || !layers[L].visible) { continue; }
            var lv = leaves(layers[L].pageItems, []);
            for (j = 0; j < lv.length; j++) { if (!lv[j].locked) { cand.push({ item: lv[j], layer: L }); } }
        }
        // an item belongs to a piece when its bounds lie (mostly) within the piece's grown by zone (a notch sticking
        // out; a cluster of notches whose centre is off the outline); never when it covers several pieces (a frame).
        // The one it covers (its image) or whose outline is nearest wins, then the best fit, then the smallest piece
        for (j = 0; j < cand.length; j++) {
            var cb = cand[j].item.geometricBounds, best = -1, bestD = Infinity, bestFit = 0;
            if (!cb) { continue; }   // an empty group
            var c = [(cb[0] + cb[2]) / 2, (cb[1] + cb[3]) / 2], covers = 0;
            for (i = 0; i < pieces.length && covers < 2; i++) { if (within(pieces[i].gb, cb) >= MATCH_PARTS) { covers++; } }
            for (i = 0; i < pieces.length && covers < 2; i++) {
                var pb = pieces[i].gb, fit = within(cb, [pb[0] - zone, pb[1] + zone, pb[2] + zone, pb[3] - zone]);
                if (fit < MATCH_PARTS) { continue; }
                var dist = within(pb, cb) >= MATCH_PARTS ? 0 : polyDist(c, pieces[i].poly);   // its image: 0
                if (dist < bestD || (dist === bestD && (fit > bestFit || (fit === bestFit && boxArea(pieces[i].box) < boxArea(pieces[best].box))))) {
                    best = i; bestD = dist; bestFit = fit;
                }
            }
            if (best >= 0) { parts[best].push(cand[j]); }
        }
        var relock = [], groups = [], labelLayer = null, emptied = [], cutL = -1, labelL = -1;
        for (L = 0; L < nl; L++) {
            if (layers[L].name === LABEL_LAYER && !labelLayer) { labelLayer = layers[L]; labelL = L; }
            if (layers[L].name === CUT_LAYER && cutL < 0) { cutL = L; }
        }
        res.ms.group_match = now() - t0;
        t0 = now();
        try {
            for (L = 0; L < nl; L++) {
                if (layers[L].locked) { layers[L].locked = false; relock.push(layers[L]); }
            }
            for (i = 0; i < pieces.length; i++) {
                show(3, i, pieces.length, "Grouping pieces");
                if (onlyLabelled && !labelOf[i]) { continue; }   // some labels were selected: only their pieces
                var who = labelOf[i] ? describe(labelOf[i]) : "Piece " + (i + 1);
                if (pieces[i].locked) { res.group_errors.push(who + ": its cut line is locked"); continue; }
                var members = [{ item: pieces[i].cut, layer: cutL }].concat(parts[i]);
                if (labelOf[i]) { members.unshift({ item: labelOf[i], layer: labelL }); }
                members.sort(function (a, b) { return a.layer - b.layer; });
                var g = null;
                try {
                    var sel = [];
                    for (j = 0; j < members.length; j++) {
                        var par = members[j].item.parent;
                        if (par.typename === "GroupItem") { emptied.push(par); }
                        sel.push(members[j].item);
                    }
                    g = labelLayer.groupItems.add();
                    for (j = 0; j < sel.length; j++) { sel[j].move(g, ElementPlacement.PLACEATEND); }
                    markPiece(g);
                    groups.push(g);
                    res.grouped++;
                } catch (e) {
                    // what moved stays grouped but is not selected (Nest would take the piece without its other
                    // parts); an empty group goes
                    var part = false;
                    try { if (g && g.pageItems.length) { part = true; } else if (g) { g.remove(); } } catch (e5) { /* ignore */ }
                    res.group_errors.push(who + ": " + (e.message || e) + (part ? " (grouped only in part, not selected)" : ""));
                }
            }
            // the layers' container groups that are now empty go (otherwise they are selected and nested as parts)
            for (j = 0; j < emptied.length; j++) {
                try { if (emptied[j].pageItems.length === 0) { emptied[j].remove(); } } catch (e4) { /* already removed */ }
            }
        } finally {
            for (L = 0; L < relock.length; L++) { relock[L].locked = true; }
            res.ms.group_move = now() - t0;
        }
        return groups;
    }

    /* selection mode: piece group and label in a new group where the piece was, label on top; on failure as before */
    function groupPair(piece, label) {
        var g = piece.parent.groupItems.add();
        g.move(piece, ElementPlacement.PLACEBEFORE);
        try {
            markPiece(g);   // before the moves: a failure then leaves nothing inside g
            piece.move(g, ElementPlacement.PLACEATEND);
            label.move(g, ElementPlacement.PLACEATBEGINNING);
        } catch (e) {
            try {
                if (piece.parent === g) { piece.move(g, ElementPlacement.PLACEBEFORE); }
                if (g.pageItems.length === 0) { g.remove(); }   // never removes what it holds
            } catch (e2) { /* left as it is */ }
            throw e;
        }
        return g;
    }

    /*
     * opts: {gapMm, side ("outside" default / "inside"), heightMm (empty or 0: keep the size), corner (the piece's
     * corner to place the label near: "bottom_left" default, "bottom_right", "top_left", "top_right"), place (false:
     * leave the labels where they are, e.g. to group labels placed and checked earlier), group (true: group each piece
     * with its label; in layer mode with its parts on the other layers too), spacingMm (the gap between neighbouring
     * pieces, default 5: a label or part belongs to a piece when it lies inside its cut line or within half of it)}
     * Returns {status: "done"|"nothing"|"rolled_back", placed, grouped, pieces, labels, not_placed: [{label, reason}],
     *          group_errors: [], error}
     */
    /* progress: optional function (step 1..3, done, total, text) to show how far the run is */
    function run(doc, items, opts, log, progress) {
        log = log || function () {};
        P = progress || null;
        var gap = Number(opts.gapMm) * PT_PER_MM, side = opts.side === "inside" ? -1 : 1, placing = opts.place !== false;
        var height = opts.heightMm === "" || opts.heightMm === null || opts.heightMm === undefined ? 0 : Number(opts.heightMm) * PT_PER_MM;
        var corner = opts.corner || "bottom_left";
        if (placing && !(gap >= 0)) { throw new Error("Label gap must be a number >= 0"); }
        if (placing && !(height >= 0)) { throw new Error("Label height must be empty or a number > 0"); }
        if (placing && !/^(bottom|top)_(left|right)$/.test(corner)) { throw new Error("Unknown label position " + corner); }
        var spacing = opts.spacingMm === "" || opts.spacingMm === null || opts.spacingMm === undefined ? 5 : Number(opts.spacingMm);
        if (opts.group && !(spacing > 0)) { throw new Error("Piece spacing must be a number > 0"); }
        var zone = spacing / 2 * PT_PER_MM;
        var t0 = now(), ms = {};
        T = {};
        show(1, 0, 0, "Reading cut lines");
        var found = collect(doc, items), pieces = found.pieces, labels = found.labels, i;
        ms.collect = now() - t0;
        ms.svg = !!found.svg;   // cut lines read from an SVG export
        for (var tk in T) { if (T.hasOwnProperty(tk)) { ms[tk] = T[tk]; } }
        log("pieces=" + pieces.length + " labels=" + labels.length);
        // ms: time per step, for tuning (not shown in the panel)
        var res = { status: "nothing", placed: 0, grouped: 0, pieces: pieces.length, labels: labels.length, not_placed: [],
                    group_errors: [], error: null, ms: ms };
        if (!pieces.length || !labels.length) { return res; }
        t0 = now();

        // labels already grouped with a piece keep it; the others go to the nearest free piece
        var free = [], freeIdx = [], owner = [], taken = {};
        for (i = 0; i < labels.length; i++) {
            owner.push(labels[i].piece === undefined ? -1 : labels[i].piece);
            if (owner[i] >= 0) { taken[owner[i]] = true; }
        }
        // a label inside a piece that already has its label (grouped before) is reported, never given to a neighbour
        for (i = 0; i < labels.length; i++) {
            if (owner[i] >= 0) { continue; }
            var c0 = labels[i].center, k0 = insideOf(c0, pieces), gb0, g0;
            for (g0 = 0; k0 < 0 && g0 < found.grouped.length && owner[i] === -1; g0++) {
                gb0 = found.grouped[g0];
                if (c0[0] >= gb0[0] && c0[0] <= gb0[2] && c0[1] <= gb0[1] && c0[1] >= gb0[3]) { owner[i] = -3; }
            }
            if (k0 >= 0 && taken[k0]) { owner[i] = -3; }
        }
        var freePieces = [], freePieceIdx = [];
        for (i = 0; i < pieces.length; i++) { if (!taken[i]) { freePieces.push(pieces[i]); freePieceIdx.push(i); } }
        for (i = 0; i < labels.length; i++) { if (owner[i] === -1) { free.push(labels[i].center); freeIdx.push(i); } }
        var why = [];   // group only: why a label has no piece
        if (placing) {
            var m = match(free, freePieces, MAX_MATCH_MM * PT_PER_MM);
            for (i = 0; i < m.length; i++) { owner[freeIdx[i]] = m[i] < 0 ? m[i] : freePieceIdx[m[i]]; }
        } else {
            var by = {};   // piece -> labels near it only
            for (i = 0; i < free.length; i++) {
                var lbb = labels[freeIdx[i]].item.geometricBounds, half = Math.min(lbb[2] - lbb[0], lbb[1] - lbb[3]) / 2;
                var near = nearPieces(free[i], half, freePieces, zone);
                if (near.length === 1) { owner[freeIdx[i]] = freePieceIdx[near[0]]; (by[near[0]] = by[near[0]] || []).push(freeIdx[i]); }
                else { why[freeIdx[i]] = near.length ? "near " + near.length + " pieces" : "no piece within " + spacing / 2 + " mm"; }
            }
            for (var pk in by) {
                if (by.hasOwnProperty(pk) && by[pk].length > 1) {
                    for (i = 0; i < by[pk].length; i++) { owner[by[pk][i]] = -1; why[by[pk][i]] = by[pk].length + " labels near the same piece"; }
                }
            }
        }
        ms.match = now() - t0;
        ms.place = 0;
        t0 = now();

        var done = [], placedPairs = [], labelOf = [];
        for (i = 0; i < pieces.length; i++) { labelOf.push(null); }
        try {
            for (i = 0; i < labels.length; i++) {
                var lb = labels[i];
                if (!placing) {   // group only: each label goes with the piece it is nearest to
                    if (owner[i] < 0) { res.group_errors.push(describe(lb.item) + ": " + (owner[i] === -3 ? OCCUPIED : why[i] || "no piece near it")); continue; }
                    if (!findTag(lb.item)) { tagUpright(lb.item); }   // never placed: as it stands is upright; a re-run finds it
                    labelOf[owner[i]] = lb.item;
                    if (!pieces[owner[i]].label) { placedPairs.push([pieces[owner[i]].item, lb.item]); }
                    continue;
                }
                show(2, i, labels.length, "Placing labels");
                if (owner[i] < 0) { res.not_placed.push({ label: describe(lb.item), reason: owner[i] === -2 ? "another label is inside the same piece" : owner[i] === -3 ? OCCUPIED : "no piece near it" }); continue; }
                var a0 = angleOf(lb.item);
                var job = { item: lb.item, a0: a0, c0: lb.center, angle: a0, pct: 100 };
                done.push(job);
                rotate(lb.item, -a0);
                job.angle = 0;
                if (height > 0) {
                    var pct = height / lb.item.height * 100;
                    scale(lb.item, pct);
                    job.pct = pct;   // only once scaled: undo must not shrink a label Illustrator refused to resize
                }
                tagUpright(lb.item);
                var b = lb.item.geometricBounds, w = b[2] - b[0], h = b[1] - b[3], box = pieces[owner[i]].box;
                var prefer = [corner.indexOf("right") > 0 ? box[2] : box[0], corner.indexOf("top") === 0 ? box[3] : box[1]];
                var tp = now(), r = place(pieces[owner[i]].poly, w, h, prefer, { gap: gap, side: side });
                ms.place += now() - tp;
                if (!r) {
                    res.not_placed.push({ label: describe(lb.item), reason: "no straight edge long enough" });
                    undo(job);
                    done.pop();
                    continue;
                }
                rotate(lb.item, r.angle);
                job.angle = r.angle;
                moveCenter(lb.item, r.center);
                var c = centerOf(lb.item);
                if (Math.abs(c[0] - r.center[0]) > CHECK_TOL_PT || Math.abs(c[1] - r.center[1]) > CHECK_TOL_PT) {
                    throw new Error("label " + (i + 1) + " ended " + c.join(",") + " instead of " + r.center.join(","));
                }
                res.placed++;
                labelOf[owner[i]] = lb.item;
                if (!pieces[owner[i]].label) { placedPairs.push([pieces[owner[i]].item, lb.item]); }
                log("label " + (i + 1) + " -> piece " + (owner[i] + 1) + " angle " + r.angle.toFixed(2) + (r.relaxed ? " relaxed " + r.relaxed : ""));
            }
        } catch (e) {
            res.error = String(e.message || e);
            log("ERROR " + res.error + "; undoing " + done.length + " labels");
            for (var k = done.length - 1; k >= 0; k--) {
                try { undo(done[k]); } catch (e2) { log("UNDO FAILED for label " + (k + 1) + ": " + (e2.message || e2)); }
            }
            res.status = "rolled_back";
            res.placed = 0;
            return res;
        }
        ms.labels = now() - t0 - ms.place;   // DOM work on the labels: rotate, resize, tag, move
        // grouping comes last: a failed piece is reported, the labels stay placed
        if (opts.group) {
            show(3, 0, 0, "Grouping pieces");
            var groups = [];
            if (found.layerMode) {
                groups = groupByLayers(doc, pieces, labelOf, found.picked || !placing, res, zone);
            } else {
                for (i = 0; i < pieces.length; i++) { if (pieces[i].label) { groups.push(pieces[i].item); } }   // grouped before
                for (i = 0; i < placedPairs.length; i++) {
                    show(3, i, placedPairs.length, "Grouping pieces");
                    try { groups.push(groupPair(placedPairs[i][0], placedPairs[i][1])); res.grouped++; }
                    catch (e3) { res.group_errors.push(describe(placedPairs[i][1]) + ": " + (e3.message || e3)); }
                }
            }
            // Group only groups pieces with a label: the others are reported (layer mode: unless only some labels were picked)
            for (i = 0; !placing && !(found.layerMode && found.picked) && i < pieces.length; i++) {
                if (!labelOf[i]) { res.group_errors.push("Piece at " + describe(pieces[i].cut).split(" at ")[1] + ": no label, not grouped"); }
            }
            // ready for Nest; after a failure nothing half grouped stays selected
            if (groups.length) { doc.selection = groups; } else if (res.group_errors.length) { doc.selection = null; }
        }
        res.status = "done";
        return res;
    }

    function undo(job) {
        rotate(job.item, -job.angle);
        scale(job.item, 10000 / job.pct);
        rotate(job.item, job.a0);
        moveCenter(job.item, job.c0);
        job.angle = job.a0;
    }

    return { run: run, place: place, match: match, flatten: flatten, readable: readable, parseSvg: parseSvg, alignSvg: alignSvg, isGroupedPiece: isGroupedPiece, PT_PER_MM: PT_PER_MM };
}());

/* Runs on the current selection. Returns the AN_Labels.run result plus status "no_document" / "error". */
function AN_placeLabels(opts) {
    if (app.documents.length === 0) { return { status: "no_document" }; }
    var doc = app.activeDocument, prevCS = app.coordinateSystem, last = 0, steps = opts.group && opts.place !== false ? 3 : 2;
    var log = function (m) { $.writeln("[labels] " + m); };
    // Illustrator (and the panel) look frozen while the script runs: a palette shows it is alive
    var prog = AN_Progress.create(opts.place === false ? "AutoNesting: Group pieces" : "AutoNesting: Place labels", steps * 100, { log: log }, opts.progressFile);
    app.coordinateSystem = CoordinateSystem.DOCUMENTCOORDINATESYSTEM;
    try {
        var sel = doc.selection, items = [];
        if (sel && typeof sel.length !== "undefined") { for (var i = 0; i < sel.length; i++) { items.push(sel[i]); } }
        return AN_Labels.run(doc, items, opts, log, function (k, done, total, text, part) {
            var t = new Date().getTime();
            if (total && done > 0 && t - last < 250) { return; }   // a repaint costs a few ms: at most 4 a second while counting
            last = t;
            if (k > steps) { k = steps; }   // group only: grouping is step 2
            prog.step((k - 1) * 100 + Math.round(100 * (total ? done / total : part || 0)),
                      total ? text + ": " + done + " / " + total : text + "...", "Step " + k + " of " + steps);
        });
    } catch (e) {
        return { status: "error", error: String(e.message || e) };
    } finally {
        prog.close();
        app.coordinateSystem = prevCS;
    }
}

function AN_labelsMessage(r) {
    if (r.status === "no_document") { return "No document is open."; }
    if (r.status === "error") { return "Error: " + r.error; }
    if (r.status === "rolled_back") { return "Error while placing labels; every label was put back. " + r.error; }
    if (r.status === "nothing") {
        if (!r.pieces) { return "Select the pieces (groups with a cut line) and their labels."; }
        return "No labels in the selection: select each piece together with its label.";
    }
    var lines = [], i, ge = r.group_errors || [];
    if (r.not_placed.length) {
        lines.push(r.not_placed.length + " label" + (r.not_placed.length > 1 ? "s were" : " was") + " not placed:");
        for (i = 0; i < r.not_placed.length && i < 8; i++) { lines.push("- " + r.not_placed[i].label + ": " + r.not_placed[i].reason); }
        if (r.not_placed.length > 8) { lines.push("... and " + (r.not_placed.length - 8) + " more"); }
    }
    if (ge.length) {
        lines.push(ge.length + " piece" + (ge.length > 1 ? "s were" : " was") + " not grouped:");
        for (i = 0; i < ge.length && i < 8; i++) { lines.push("- " + ge[i]); }
        if (ge.length > 8) { lines.push("... and " + (ge.length - 8) + " more"); }
    }
    return lines.join("\n");
}
// ===== END jsx/lib/an_labels.jsxinc =====


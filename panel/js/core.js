/*
 * core.js - panel logic that does not touch the UI (Node, CommonJS).
 * Loaded by main.js inside the CEP panel; tested on its own by tests/test_panel.py.
 */
"use strict";
var fs = require("fs");
var path = require("path");
var crypto = require("crypto");
var childProcess = require("child_process");

var EXIT = {
    0: "complete",
    1: "engine error (bad input or usage)",
    3: "no group could be nested (see the issues in the analysis)",
    4: "partial",
    5: "independent verification failed"
};

/* Engine command: the bundled autonest.exe, or AUTONEST_ENGINE_CMD (JSON array, development/tests). */
function engineCommand(extDir, env) {
    env = env || process.env;
    if (env.AUTONEST_ENGINE_CMD) {
        var cmd = JSON.parse(env.AUTONEST_ENGINE_CMD);
        return { file: cmd[0], prefix: cmd.slice(1) };
    }
    var exe = path.join(extDir, "engine", "autonest", process.platform === "win32" ? "autonest.exe" : "autonest");
    if (!fs.existsSync(exe)) {
        throw new Error("Nesting engine not found: " + exe + ". Reinstall the AutoNesting panel.");
    }
    return { file: exe, prefix: [] };
}

function settingsArgs(s) {
    var a = [];
    function num(flag, v) { if (v !== "" && v !== null && v !== undefined && isFinite(Number(v))) { a.push(flag, String(Number(v))); } }
    num("--sheet-width", s.sheet_width_mm);
    if (s.extend_length) { a.push("--material", "roll"); }   // the length grows upward as needed
    num("--sheet-length", s.sheet_length_mm);
    num("--spacing", s.spacing_mm);
    num("--margin", s.margin_mm);
    if (s.start_corner) { a.push("--start-corner", s.start_corner); }
    if (s.rotation_preset) { a.push("--rotation-preset", s.rotation_preset); }
    if (s.rotation_preset === "step") { num("--rotation-step", s.rotation_step_deg); }
    if (s.rotation_preset === "0_180" && Number(s.grain_tolerance_deg) > 0) {
        num("--grain-tolerance", s.grain_tolerance_deg);
        num("--rotation-step", s.rotation_step_deg);
    }
    if (s.quality) { a.push("--quality", s.quality); }
    num("--time-limit", s.time_limit_s);
    if (s.opaque_policy) { a.push("--opaque-policy", s.opaque_policy); }
    return a;
}

function sha256File(p) { return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex"); }

/*
 * Run "nest" on geometry.json; writes placement.json + placement.svg next to it.
 * cb(err, {code, outcome, placementPath, svgPath, placement, geometrySha256, log})
 * Returns the child process (call .kill() to cancel).
 */
function runNest(extDir, geometryPath, settings, cb, env) {
    var cmd;
    try { cmd = engineCommand(extDir, env); } catch (e) { cb(e); return null; }
    var dir = path.dirname(geometryPath);
    var placementPath = path.join(dir, "placement.json");
    var svgPath = path.join(dir, "placement.svg");
    [placementPath, svgPath].forEach(function (p) { if (fs.existsSync(p)) { fs.unlinkSync(p); } });
    var args = cmd.prefix.concat(["nest", geometryPath, "-o", placementPath, "--svg", svgPath]).concat(settingsArgs(settings || {}));
    var log = "";
    var child = childProcess.spawn(cmd.file, args, { windowsHide: true });
    child.stdout.on("data", function (d) { log += d; });
    child.stderr.on("data", function (d) { log += d; });
    child.on("error", function (e) { cb(new Error("Could not start the engine: " + e.message)); });
    child.on("close", function (code, signal) {
        if (signal) { cb(new Error("Nesting cancelled"), { log: log }); return; }
        var res = { code: code, outcome: EXIT[code] || ("unexpected exit code " + code), placementPath: placementPath,
                    svgPath: svgPath, log: log, placement: null, geometrySha256: null };
        if ((code === 0 || code === 4) && fs.existsSync(placementPath)) {
            res.placement = JSON.parse(fs.readFileSync(placementPath, "utf8"));
            res.geometrySha256 = sha256File(geometryPath);
            if (res.placement.source.geometry_sha256 !== res.geometrySha256) {
                cb(new Error("placement.json does not belong to the exported geometry.json (sha256 mismatch)"), res);
                return;
            }
        }
        cb(null, res);
    });
    return child;
}

/* Placed count + list of unplaced groups for the panel. */
function summarize(placement) {
    var placed = placement.placements.length, total = placed + placement.unplaced.length;
    var unplaced = placement.unplaced.map(function (u) {
        return (u.name || u.id) + ": " + u.reason + (u.detail ? " - " + u.detail : "");
    });
    return { unplaced: unplaced, placed: placed, total: total };
}

/* ExtendScript call text; JSON string literals are valid ES3 string literals. */
function jsxCall(fn, args) {
    return fn + "(" + args.map(function (a) {
        return JSON.stringify(a).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
    }).join(", ") + ")";
}

/* evalScript returns "EvalScript error." when the host script throws. */
function parseHostResult(text) {
    if (typeof text !== "string" || text === "" || text === "EvalScript error." || text === "undefined") {
        throw new Error("Illustrator script failed (" + text + "). Is the AutoNesting host script loaded?");
    }
    return JSON.parse(text);
}

module.exports = { engineCommand: engineCommand, settingsArgs: settingsArgs, runNest: runNest, summarize: summarize,
                   jsxCall: jsxCall, parseHostResult: parseHostResult, sha256File: sha256File, EXIT: EXIT };

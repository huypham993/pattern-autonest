/* main.js - CEP panel UI: Nest (export + engine), Preview (placement.svg), Apply (host script), Place labels. */
(function () {
    "use strict";
    var path = require("path");
    var core = require(path.join(extensionDir(), "js", "core.js"));
    var $ = function (id) { return document.getElementById(id); };
    var job = null;     // {geometryPath, placementPath, geometrySha256, placement}
    var lastExport = null;   // {geometryPath, groups, signature, sha}: re-nesting the same selection skips the slow export
    var child = null;

    function extensionDir() {
        var p = decodeURI(window.__adobe_cep__.getSystemPath("extension"));
        return p.replace(/^file:\/{2,3}/, process.platform === "win32" ? "" : "/");
    }

    /*
     * Call a host function. The host also writes its reply to a temp file, because in Illustrator the evalScript
     * reply of a long export was seen never to arrive; whichever comes first is used. Cancel stops the waiting.
     * Meanwhile the host writes its progress to resultPath + ".progress", drawn under the settings.
     */
    var waiting = null;
    function evalHost(fn, args, cb) {
        var resultPath = path.join(require("os").tmpdir(), "autonest_" + Date.now() + "_" + process.pid + ".json");
        var progressPath = resultPath + ".progress";
        var fs = require("fs");
        var done = false;
        function finish(err, r) {
            if (done) { return; }
            done = true;
            clearInterval(poll);
            waiting = null;
            [resultPath, progressPath].forEach(function (f) {
                try { if (fs.existsSync(f)) { fs.unlinkSync(f); } } catch (e) { log("could not delete " + f + ": " + e.message); }
            });
            cb(err, r);
        }
        var poll = setInterval(function () {
            if (prog && fs.existsSync(progressPath)) {
                try { var p = JSON.parse(fs.readFileSync(progressPath, "utf8")); prog.text = p.text; prog.value = p.value; prog.total = p.total; prog.sub = p.sub; }
                catch (e) { /* being written: the next poll reads it */ }
                drawProgress();
            }
            if (!fs.existsSync(resultPath)) { return; }
            var r;
            try { r = core.parseHostResult(fs.readFileSync(resultPath, "utf8")); } catch (e) { return; }  // still being written
            log("reply read from " + resultPath);
            finish(null, r);
        }, 500);
        waiting = { cancel: function () { finish(new Error("Stopped waiting for Illustrator. If it is still busy, wait until it responds before you try again.")); } };
        window.__adobe_cep__.evalScript(core.jsxCall(fn, args.concat([resultPath])), function (text) {
            var r;
            try { r = core.parseHostResult(text); } catch (e) { finish(e); return; }
            finish(null, r);
        });
    }

    /* errors float over the bottom of the page until closed or the next run: nothing in the panel moves */
    function status(msg, kind) {
        $("status").textContent = msg;
        $("status").className = "status" + (kind ? " " + kind : "");
        $("notice").hidden = !msg;
    }

    /* progress of the running call, drawn inside the button that started it: fill, step text, seconds */
    var prog = null, progTimer = null;
    function startProgress(text) {
        prog = { t0: Date.now(), text: text + "...", value: 0, total: 0, sub: "" };
        status("");
        drawProgress();
        progTimer = setInterval(drawProgress, 500);
    }
    function stopProgress() {
        clearInterval(progTimer);
        prog = null;
        drawProgress();
    }
    function drawProgress() {
        if (!prog || !running) { return; }
        if (prog.timed) { prog.value = Date.now() - prog.t0; prog.total = prog.timed; }
        var b = $(running.id);
        b.querySelector(".fill").style.width = (prog.total ? Math.min(100, 100 * prog.value / prog.total) : 0) + "%";
        b.querySelector(".ptext").textContent = prog.text + " \u00b7 " + Math.round((Date.now() - prog.t0) / 1000) + " s";
    }

    function log(msg) { console.log("[autonest] " + msg); }   // for support only (CEP debug console)

    /* top tabs Labels | Nesting; Nesting has the sub tabs Settings | Result */
    var nestTab = "Settings";
    function showTab(name) {
        var nesting = name === "Settings" || name === "Result";
        ["Settings", "Result", "Labels", "Group"].forEach(function (t) { $("page" + t).hidden = t !== name; });
        ["Settings", "Result"].forEach(function (t) { $("tab" + t).className = "tab" + (t === name ? " on" : ""); });
        $("modeLabels").className = "tab" + (name === "Labels" ? " on" : "");
        $("modeGroup").className = "tab" + (name === "Group" ? " on" : "");
        $("modeNest").className = "tab" + (nesting ? " on" : "");
        $("nestTabs").hidden = $("nestActions").hidden = !nesting;
        $("labelActions").hidden = name !== "Labels";
        $("groupActions").hidden = name !== "Group";
        if (nesting) { nestTab = name; }
        var label = name === "Result" ? "Nest again" : "Nest selected";
        if (running && running.id === "nest") { running.label = label; } else { $("nest").textContent = label; }
    }

    /*
     * while a run goes, the button that started it shows its progress and stops it when clicked (nothing in the
     * panel moves or appears); the other buttons wait
     */
    var running = null;   // {id, label}
    function busy(on, id) {
        if (!on && running) { $(running.id).textContent = running.label; $(running.id).classList.remove("running"); running = null; }
        ["nest", "placeLabels", "groupLabels"].forEach(function (b) { $(b).disabled = on; });
        $("apply").disabled = on || !job || !job.placement;
        if (on && id) {
            var b = $(id);
            running = { id: id, label: b.textContent };
            b.innerHTML = '<span class="fill"></span><span class="ptext"></span><span class="pstop">Cancel</span>';
            b.classList.add("running");
            b.disabled = false;
        }
    }
    function cancel() { if (child) { child.kill(); } else if (waiting) { waiting.cancel(); } }
    function orCancel(run) { return function () { if (running) { cancel(); } else { run(); } }; }

    /* settings are remembered per user; storage may be unavailable */
    var FIELDS = ["sheetW", "sheetL", "extend", "resize", "spacing", "margin", "corner", "rotation", "tolerance", "step", "quality", "time",
                  "labelH", "labelGap", "labelCorner", "groupSpacing"];
    function field(f) { return $(f).type === "checkbox" ? "checked" : "value"; }
    function loadSettings() {
        try {
            var s = JSON.parse(localStorage.getItem("autonest.settings") || "{}");
            FIELDS.forEach(function (f) { if (s[f] !== undefined) { $(f)[field(f)] = s[f]; } });
        } catch (e) { /* first run or storage blocked: keep the defaults in the HTML */ }
        showRotationRows();
    }
    function showRotationRows() {
        var rot = $("rotation").value, grain = rot === "0_180" && Number($("tolerance").value) > 0;
        $("tolRow").hidden = rot !== "0_180";
        $("stepRow").hidden = !(rot === "step" || grain);
        $("sheetL").disabled = $("extend").checked;   // the length then grows as needed (down when nesting from the top)
    }
    function saveSettings() {
        var s = {};
        FIELDS.forEach(function (f) { s[f] = $(f)[field(f)]; });
        try { localStorage.setItem("autonest.settings", JSON.stringify(s)); } catch (e) { /* not essential */ }
        showRotationRows();
    }
    function settings() {
        return { sheet_width_mm: $("sheetW").value, sheet_length_mm: $("sheetL").value, extend_length: $("extend").checked,
                 spacing_mm: $("spacing").value, margin_mm: $("margin").value, start_corner: $("corner").value,
                 rotation_preset: $("rotation").value,
                 rotation_step_deg: $("step").value, grain_tolerance_deg: $("tolerance").value,
                 quality: $("quality").value, time_limit_s: $("time").value };
    }

    function loadHost(cb) {
        var host = path.join(extensionDir(), "jsx", "AutoNesting_PanelHost.jsx");
        window.__adobe_cep__.evalScript("$.evalFile(" + JSON.stringify(host) + "); typeof AN_panelExport", function (t) {
            if (t !== "function") { cb(new Error("Could not load the host script " + host + " (" + t + ")")); return; }
            cb(null);
        });
    }

    function showPlacement(res) {
        var sum = core.summarize(res.placement);
        $("preview").src = "file:///" + res.svgPath.replace(/\\/g, "/") + "?t=" + Date.now();
        $("tabResult").disabled = false;
        showTab("Result");
        $("unplaced").innerHTML = "";
        sum.unplaced.forEach(function (u) { var li = document.createElement("li"); li.textContent = u; $("unplaced").appendChild(li); });
        $("unplacedTitle").textContent = "Not placed (" + sum.unplaced.length + ")";
        $("unplacedBox").hidden = sum.unplaced.length === 0;
        return sum;
    }

    function nest() {
        saveSettings();
        job = null;
        $("tabResult").disabled = true;   // the old result no longer matches; the new one opens when ready
        showTab("Settings");
        busy(true, "nest");
        var t0 = Date.now();
        startProgress("Exporting the selected groups");   // Illustrator is busy (and looks frozen) while it exports
        var reuse = null;
        try {   // geometry.json sits at a fixed path: reuse it only if nothing rewrote it since
            if (lastExport && core.sha256File(lastExport.geometryPath) === lastExport.sha) { reuse = lastExport; }
        } catch (e) { log("not reusing the last export: " + e.message); }
        evalHost("AN_panelExport", [reuse ? reuse.signature : ""], function (err, r) {
            stopProgress();
            if (err) { lastExport = null; busy(false); status(err.message, "bad"); return; }
            log("export: " + JSON.stringify(r));
            if (r.status === "unchanged") {
                log("selection unchanged: reusing " + reuse.geometryPath);
                r = { status: "ok", geometryPath: reuse.geometryPath, groups: reuse.groups };
            } else if (r.status === "ok" && r.signature) {
                lastExport = { geometryPath: r.geometryPath, groups: r.groups, signature: r.signature, sha: core.sha256File(r.geometryPath) };
            } else {
                lastExport = null;
            }
            if (r.status === "no_document") { busy(false); status("No document is open.", "bad"); return; }
            if (r.status === "empty_selection") { busy(false); status("Select the groups to nest first." + (r.skipped ? " " + r.skipped + " selected objects are not groups." : ""), "bad"); return; }
            if (r.status !== "ok") { busy(false); status("Export failed at step " + r.step + ": " + r.error + "\nDiagnostics: " + r.diagnosticsPath, "bad"); return; }
            var t1 = Date.now();
            log("export took " + Math.round((t1 - t0) / 1000) + " s");
            startProgress("Nesting " + r.groups + " groups");
            prog.timed = Number($("time").value) * 1000;   // the bar shows the time used of the max nesting time
            child = core.runNest(extensionDir(), r.geometryPath, settings(), function (e2, res) {
                stopProgress();
                child = null;
                if (res && res.log) { log(res.log); }
                if (e2) { busy(false); status(e2.message, "bad"); return; }
                if (!res.placement) { busy(false); status("Nesting failed: " + res.outcome + ". See the log.", "bad"); return; }
                job = { geometryPath: r.geometryPath, placementPath: res.placementPath, geometrySha256: res.geometrySha256,
                        placement: res.placement };
                showPlacement(res);
                busy(false);
                status("");   // the preview and the "Not placed" list say it all
            });
        });
    }

    function apply() {
        if (!job) { return; }
        busy(true, "apply");
        startProgress("Applying");
        evalHost("AN_panelApply", [job.placementPath, job.geometrySha256, $("resize").checked], function (err, r) {
            stopProgress();
            if (err) {   // the document may have changed: never apply this result again
                job = null; lastExport = null; busy(false);
                status(err.message + "\nCheck the document, then click Nest again.", "bad");
                return;
            }
            busy(false);
            log("apply: " + JSON.stringify(r));
            if (r.status === "applied") {   // positions changed: a new Nest is needed before another Apply
                status("");
                job = null; lastExport = null; busy(false);
            } else {
                status(r.message + "\nDiagnostics: " + r.diagnosticsPath, "bad");
            }
        });
    }

    /* group: false places the labels only; true groups each piece with the label next to it, leaving labels where they are */
    function labels(group) {
        saveSettings();
        busy(true, group ? "groupLabels" : "placeLabels");
        startProgress(group ? "Grouping pieces" : "Placing labels");
        evalHost(group ? "AN_panelGroupLabels" : "AN_panelPlaceLabels",
                 group ? [$("groupSpacing").value] : [$("labelGap").value, $("labelH").value, $("labelCorner").value, false],
                 function (err, r) {
            stopProgress();
            // labels moved or pieces regrouped: an earlier nest result no longer matches the document
            job = null; lastExport = null;
            busy(false);
            if (err) { status(err.message, "bad"); return; }
            log("labels: " + JSON.stringify(r));
            status(r.message || "", r.message ? "bad" : "");
        });
    }

    $("nest").onclick = orCancel(nest);
    $("tabSettings").onclick = function () { showTab("Settings"); };
    $("tabResult").onclick = function () { showTab("Result"); };
    $("modeLabels").onclick = function () { showTab("Labels"); };
    $("modeGroup").onclick = function () { showTab("Group"); };
    $("modeNest").onclick = function () { showTab(nestTab); };
    $("placeLabels").onclick = orCancel(function () { labels(false); });
    $("groupLabels").onclick = orCancel(function () { labels(true); });
    $("zoom").onclick = function () {
        var box = $("previewBox");
        box.className = /zoomed/.test(box.className) ? "preview" : "preview zoomed";
        $("zoom").textContent = /zoomed/.test(box.className) ? "Fit" : "Zoom";
    };
    $("apply").onclick = orCancel(apply);
    $("noticeClose").onclick = function () { status(""); };
    FIELDS.forEach(function (f) { $(f).onchange = saveSettings; });
    /*
     * colours from Illustrator's panel colour (its brightness setting), so its resize grip in the bottom-right corner
     * blends into the footer; the CSS holds the medium-dark defaults
     */
    function applySkin() {
        try {
            var c = JSON.parse(window.__adobe_cep__.getHostEnvironment()).appSkinInfo.panelBackgroundColor.color;
            var v = Math.round((c.red + c.green + c.blue) / 3), light = v > 128;
            var grey = function (d) { var g = Math.max(0, Math.min(255, v + d)); return "rgb(" + g + "," + g + "," + g + ")"; };
            var css = { "--bg": grey(0), "--bar": grey(0), "--panel": grey(light ? 14 : -12), "--tabbar": grey(light ? -14 : -17),
                        "--line": grey(light ? -40 : -21), "--text": light ? "#1e1e1e" : "#e6e6e6", "--muted": light ? "#4a4a4a" : "#bdbdbd",
                        "--bad": light ? "#c0261a" : "#ff8a7a" };
            for (var k in css) { document.documentElement.style.setProperty(k, css[k]); }
        } catch (e) { log("theme: " + e.message); }
    }
    applySkin();
    try { window.__adobe_cep__.addEventListener("com.adobe.csxs.events.ThemeColorChanged", applySkin); } catch (e) { /* older host */ }
    loadSettings();
    loadHost(function (err) { if (err) { status(err.message, "bad"); $("nest").disabled = true; $("placeLabels").disabled = true; $("groupLabels").disabled = true; } });
}());

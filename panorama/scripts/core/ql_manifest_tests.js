// =============================================================================
// QOLLOCK — core/ql_manifest_tests.js
// =============================================================================
// OWNS:        Read-only manifest observations and engine snapshots. Hooks run
//              across scheduled callbacks, with a 2s deadline between hooks.
//              A synchronous hook cannot be preempted; this is not an FPS guard.
// DOES NOT OWN: Feature lifecycle, panel creation, or gameplay verification.
// DEPENDS ON:  core/ql_namespace.js, core/ql_feature_registry.js
// USED BY:     core/ql_app.js diagnostic bridge, ui/dev_tab.js
// LOAD ORDER:  8th — after ql_feature_registry.js, before ql_app.js
//
// Boundary validation: Checks QOL.core + FeatureRegistry exist. Aborts with message.
// =============================================================================

(() => {
    "use strict";

    const Q = (typeof globalThis !== "undefined" && globalThis.QOL) ? globalThis.QOL : (typeof QOL !== "undefined" ? QOL : null);
    if (!Q?.core) {
        $.Msg("[QOLLock] core/ql_manifest_tests: QOL.core not found — aborting.");
        return;
    }
    const FR = Q.core.FeatureRegistry;
    if (!FR) {
        $.Msg("[QOLLock] core/ql_manifest_tests: FeatureRegistry not found — aborting.");
        return;
    }

    let testResults = null;
    let testInProgress = false;
    let testToken = 0;
    let cancelRun = null;

    const MAX_TASK_MS = 50;
    const MAX_TOTAL_MS = 2000;
    const YIELD_MS = 0.05;

    const nowMs = QOL_UTILS.PerfNowMs;

    const emptyResults = () => ({
        token: "",
        summary: { total: 0, passed: 0, failed: 0, skipped: 0, errors: 0, notRun: 0, timeMs: 0 },
        results: [],
        timestamp: 0,
        aborted: false,
        abortReason: ""
    });

    const formatObservations = (results) => {
        const s = results.summary;
        const lines = [
            "--- Manifest observations (not gameplay verification) ---",
            `Requested: ${s.total} | Hook OK: ${s.passed} | Failed: ${s.failed} | Errors: ${s.errors} | Skipped: ${s.skipped} | Not run: ${s.notRun}`,
            `Run: ${results.token} | ${new Date(results.timestamp).toISOString()} | ${s.timeMs}ms`,
            "Hook OK confirms only the named checks below; rendering, transitions and FPS remain unverified."
        ];
        if (results.aborted) lines.push(`INCOMPLETE: ${results.abortReason}`);
        if (s.total === 0) lines.push("No manifests requested; no coverage.");
        for (const r of results.results) {
            const status = r.notRun ? "NOT RUN" : r.error ? "ERROR" : r.skipped ? "SKIP" : r.passed ? "OBSERVED" : "FAIL";
            lines.push(`  ${status}: ${r.id} (${r.enabled ? "enabled" : "disabled"}) [${r.name}]${r.message ? `: ${r.message}` : ""}`);
            for (const a of r.assertions || []) {
                lines.push(`    ${a.passed === true ? "OBSERVED" : a.passed === false ? "FAIL" : "INFO"}: ${a.name || "Unnamed check"}${a.message ? `: ${a.message}` : ""}`);
            }
        }
        if (results.engineAudit) lines.push("", results.engineAudit.report);
        return lines.join("\n");
    };

    /** Run registered hooks without enabling features or simulating game events. */
    const runAllTests = (opts = {}) => {
        if (testInProgress) return false;
        const ids = opts.featureIds || FR.getRegisteredIds();
        testInProgress = true;
        const token = ++testToken;
        const results = emptyResults();
        results.token = opts.token || "";
        results.engineAudit = opts.engineAudit || null;
        const totalStart = nowMs();
        let index = 0;
        const resultList = [];

        const finish = () => {
            while (index < ids.length) {
                const id = ids[index++];
                resultList.push({ id, enabled: FR.isEnabled(id), passed: null, notRun: true, name: results.abortReason, duration: 0 });
            }
            const summary = results.summary;
            summary.total = ids.length;
            for (const r of resultList) {
                if (r.notRun) summary.notRun++;
                else if (r.error) summary.errors++;
                else if (r.skipped) summary.skipped++;
                else if (r.passed) summary.passed++;
                else summary.failed++;
            }
            summary.timeMs = nowMs() - totalStart;
            results.results = resultList;
            results.timestamp = Date.now();
            results.report = formatObservations(results);
            testResults = results;
            testInProgress = false;
            cancelRun = null;
            $.Msg(`[QOLLock][ManifestTests]\n${results.report}`);
            if (opts.onComplete) opts.onComplete(results);
        };

        cancelRun = () => {
            results.aborted = true;
            results.abortReason = "Cancelled";
            finish();
        };

        const runNext = () => {
            // A queued callback from a cancelled run must not finish a newer run.
            if (!testInProgress || token !== testToken) return;
            if (index >= ids.length) {
                finish();
                return;
            }
            if ((nowMs() - totalStart) > MAX_TOTAL_MS) {
                results.aborted = true;
                results.abortReason = "2s collection deadline exceeded";
                finish();
                return;
            }

            const id = ids[index++];
            const row = { id, enabled: FR.isEnabled(id), passed: null, name: "No test hook", skipped: true, duration: 0 };
            resultList.push(row);
            const manifest = FR.getManifest(id);
            if (!manifest || typeof manifest.test !== "function") {
                $.Schedule(0, runNext);
                return;
            }

            const t0 = nowMs();
            try {
                const tr = manifest.test(FR.createContext(id));
                if (tr === null || tr === undefined) {
                    row.name = "Not applicable in this context";
                } else {
                    row.skipped = false;
                    row.assertions = Array.isArray(tr.assertions) ? tr.assertions : [];
                    row.passed = tr.passed === true && !row.assertions.some(a => a.passed === false);
                    row.name = tr.name || "Unnamed check";
                    row.message = tr.message || "";
                }
            } catch (e) {
                row.skipped = false;
                row.passed = false;
                row.error = true;
                row.name = "test() or context creation threw";
                row.message = (e && e.message) ? e.message : String(e);
            }
            row.duration = nowMs() - t0;
            $.Schedule(row.duration > MAX_TASK_MS ? YIELD_MS : 0, runNext);
        };

        $.Schedule(0, runNext);
        return true;
    };

    const getResults = () => testResults;

    const cancel = () => {
        if (cancelRun) cancelRun();
    };

    const isRunning = () => testInProgress;

    const buildCompactReport = (diag) => {
        if (!diag) return "No diagnostic data.";
        const lines = ["=== QOLLOCK Test Report ==="];

        if (diag.testResults?.summary) {
            lines.push("", diag.testResults.report || "Observation report unavailable; coverage unknown.");
        }

        const features = diag.features || [];
        const disabled = diag.disabled || [];
        lines.push("");
        lines.push("── Old Features ──");
        lines.push(`Loaded: ${features.length} | Auto-disabled: ${disabled.length || 0}`);
        if (disabled.length > 0) {
            for (let di = 0; di < disabled.length; di++) {
                const dName = disabled[di];
                const errCount = (diag.errors && diag.errors[dName]) ? diag.errors[dName] : "?";
                lines.push(`  OFF: ${dName} (errors: ${errCount})`);
            }
        }

        if (diag.newFeatures) {
            lines.push("");
            lines.push("── Manifests ──");
            lines.push(`Registered: ${diag.newFeatures.length} | Enabled: ${(diag.newEnabled && diag.newEnabled.length) || 0}`);
            if (diag.newErrors) {
                const neKeys = Object.keys(diag.newErrors);
                let neCount = 0;
                for (let nek = 0; nek < neKeys.length; nek++) {
                    if (diag.newErrors[neKeys[nek]] > 0) neCount++;
                }
                if (neCount > 0) {
                    lines.push(`Manifests with errors: ${neCount}`);
                    for (let nek2 = 0; nek2 < neKeys.length; nek2++) {
                        const ek = neKeys[nek2];
                        const ec = diag.newErrors[ek];
                        if (ec > 0) lines.push(`  ${ek}: ${ec} errors`);
                    }
                } else {
                    lines.push("Manifest errors: 0");
                }
            }
        }

        const logs = diag.logs || [];
        const filtered = [];
        const seen = {};
        for (let li = 0; li < logs.length; li++) {
            const msg = String(logs[li] || "");
            if (!msg.includes("[QOLLock]")) continue;
            if (msg.includes("[QOLLock][TRACE]") || msg.includes("[QOL DEBUG]")) continue;
            if (msg.includes("[QOLLock][INFO][FeatureRegistry] registered") || msg.includes("[QOLLock][INFO][App]")) continue;
            const dedupKey = msg.substring(msg.indexOf("] ") + 2);
            if (seen[dedupKey]) {
                seen[dedupKey]++;
                continue;
            }
            seen[dedupKey] = 1;
            filtered.push(msg);
        }
        if (filtered.length > 0) {
            lines.push("");
            lines.push(`── QOLLOCK Messages (${filtered.length} unique) ──`);
            for (let fi = 0; fi < filtered.length; fi++) {
                const dupCount = seen[filtered[fi].substring(filtered[fi].indexOf("] ") + 2)] || 1;
                lines.push(filtered[fi] + (dupCount > 1 ? ` (x${dupCount})` : ""));
            }
        }

        if (diag.presetCycle) {
            lines.push("");
            lines.push("── Preset Cycle ──");
            const pc = diag.presetCycle;
            lines.push(`Passed: ${pc.passed || "?"}/${pc.total || "?"} | Failed: ${pc.failed || 0} | Time: ${pc.totalTimeMs || "?"}ms`);
        }

        return lines.join("\n");
    };

    /** Snapshot only. Manifest hooks are collected once by runAll(), not here. */
    const runEngineAudit = () => {
        const lines = ["--- Engine observations ---", "Panel presence and inline styles do not prove rendered visibility or correct behavior."];
        const audit = { hudFound: false, runtimeErrors: 0, readErrors: 0, bridgeErrors: 0, report: "" };
        let hud = null;
        try {
            if (Q.core.hud?.findHud) hud = Q.core.hud.findHud();
            else if (Q.core.panel?.findHud) hud = Q.core.panel.findHud();
            else {
                let root = $.GetContextPanel();
                while (root && root.GetParent && root.GetParent()) root = root.GetParent();
                hud = root?.id === "Hud" ? root : root?.FindChildTraverse?.("Hud");
            }
            audit.hudFound = Boolean(hud && (typeof hud.IsValid !== "function" || hud.IsValid()));
            if (!audit.hudFound) hud = null;
            lines.push(`HUD: ${hud ? hud.id : "not found; context unavailable"}`);
            if (hud && Q.core.hud) {
                lines.push(`Hideout: ${Q.core.hud.isInHideout(hud)} | StreetBrawl: ${Q.core.hud.isStreetBrawl(hud)}`);
            }
        } catch (e) {
            audit.readErrors++;
            lines.push(`Context read error: ${e.message || e}`);
        }

        // IDs from Valve's hud.xml. Missing panels are observations, not passes.
        const nativePanelIds = ["TopBar", "minimap_container", "gold_and_ap_container", "gameplay_hud", "gameplay_hud_alive", "CitadelHudHeroShop"];
        if (hud) {
            for (const id of nativePanelIds) {
                try {
                    const p = hud.FindChildTraverse(id);
                    if (!p || (typeof p.IsValid === "function" && !p.IsValid())) {
                        lines.push(`  #${id}: not found in this HUD subtree`);
                        continue;
                    }
                    lines.push(`  #${id}: found | qol-hidden=${p.BHasClass("qol-hidden")} | inline visibility=${p.style.visibility ?? "unset"} | inline opacity=${p.style.opacity ?? "unset"}`);
                } catch (e) {
                    audit.readErrors++;
                    lines.push(`  #${id}: read error: ${e.message || e}`);
                }
            }
        }

        const errorCounts = FR.getErrorCounts();
        for (const id of FR.getRegisteredIds()) {
            const count = errorCounts[id] || 0;
            audit.runtimeErrors += count;
            lines.push(`  ${id}: ${FR.isEnabled(id) ? "enabled" : "disabled"}, current error streak=${count}`);
        }
        lines.push("Successful ticks reset error streaks; zero is not proof that a feature ran successfully.");

        if (hud) {
            try {
                const storageKey = (typeof QOL_STORAGE_KEY !== "undefined") ? QOL_STORAGE_KEY : "Deadlock_Mod_Settings_v1";
                const rawCfg = hud.GetAttributeString(storageKey, "");
                if (!rawCfg) {
                    lines.push("Bridge config: empty; persistence not verified.");
                } else {
                    try {
                        JSON.parse(rawCfg);
                        lines.push(`Bridge config: parseable JSON (${rawCfg.length} chars); schema, cross-realm sync and disk persistence not verified.`);
                    } catch (e) {
                        audit.bridgeErrors++;
                        lines.push(`Bridge config: invalid JSON: ${e.message || e}`);
                    }
                }
                lines.push(`Revision: ${hud.GetAttributeString("QOL_USER_EDIT_REV", "unset")} | Preset: ${hud.GetAttributeString("QOL_RUNTIME_PRESET", "unset")}`);
            } catch (e) {
                audit.readErrors++;
                lines.push(`Bridge read error: ${e.message || e}`);
            }
        }
        audit.report = lines.join("\n");
        return audit;
    };

    Q.core.ManifestTests = {
        runAll: runAllTests,
        runEngineAudit,
        getResults,
        cancel,
        isRunning,
        buildCompactReport
    };
    Q.runEngineAudit = runEngineAudit;
    if (typeof globalThis !== "undefined") {
        globalThis.QOL_RUN_AUDIT = runEngineAudit;
    }

    $.Msg("[QOLLock] core/ql_manifest_tests: attached to QOL.core.ManifestTests");
})();

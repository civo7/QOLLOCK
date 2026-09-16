// =============================================================================
// QOLLOCK — ui/dev_tab.js
// =============================================================================
// OWNS:        Developer, Performance & Diagnostics settings tab:
//              Performance debugging toggles & overlay opacity sliders,
//              Feature Isolation Test (FIT) execution & diagnostic polling,
//              Manifest In-Game Test Suite runner (Phase T2),
//              Live HUD panel tree dump to console for headless profiler,
//              Build Storage pipeline dry run automation,
//              Full test suite runner & compact clipboard report generation,
//              Preset cycle stress test & auto-disable verification,
//              Diagnostic log dump & clipboard copy,
//              Dev tab rendering and window manager registration.
// DOES NOT OWN: HUD-side diagnostic gathering (core/ql_manifest_tests.js, ql_bridge.js),
//               Config persistence (core/ql_config_store.js).
// DEPENDS ON:  core/ql_namespace.js, ui/config_tab.js, ui/presets.js
// USED BY:     hud_escape_menu.xml, ui/window.js, ql_settings.js
// =============================================================================

(() => {
    "use strict";

    const Q = (typeof globalThis !== "undefined" && globalThis.QOL)
        ? globalThis.QOL
        : (typeof QOL !== "undefined" ? QOL : (globalThis.QOL = {}));
    Q.ui = Q.ui || {};

    const warnLog = (category, msg) => {
        if (typeof globalThis.WarnLog === "function") {
            globalThis.WarnLog(category, msg);
        } else {
            $.Msg(`[QOLLock][WARN][${category}] ${msg}`);
        }
    };

    const isAlive = (panel) => Boolean(panel && (!panel.IsValid || panel.IsValid()));

    // =========================================================================
    // HUD Bridge Panel Resolver
    // =========================================================================

    function findHudPanel() {
        try {
            let ctx = $.GetContextPanel();
            while (ctx && ctx.GetParent && ctx.GetParent()) {
                ctx = ctx.GetParent();
            }
            return (ctx && ctx.FindChildTraverse) ? ctx.FindChildTraverse("Hud") : null;
        } catch {
            return null;
        }
    }

    // =========================================================================
    // Report Formatter
    // =========================================================================

    function formatTestSuiteReport(diag) {
        if (!diag) return "";
        const lines = ["=== QOLLOCK Test Report ==="];

        if (diag.testResults && diag.testResults.summary) {
            const ts = diag.testResults.summary;
            lines.push("");
            lines.push("-- Manifest Tests --");
            lines.push(`Total: ${ts.total} | Passed: ${ts.passed} | Failed: ${ts.failed} | Errors: ${ts.errors} | Time: ${ts.timeMs}ms`);
            if (diag.testResults.timestamp) {
                lines.push(`Ran at: ${new Date(diag.testResults.timestamp).toISOString()}`);
            }
            if (ts.failed > 0 || ts.errors > 0) {
                const trs = diag.testResults.results || [];
                for (let ri = 0; ri < trs.length; ri++) {
                    const r = trs[ri];
                    if (r.passed === false || r.error) {
                        lines.push(`  FAIL: ${r.id} [${r.name}]${r.message ? `: ${r.message}` : ""}`);
                    }
                }
            }
        }

        lines.push("");
        lines.push("-- Old Features --");
        lines.push(`Loaded: ${diag.features ? diag.features.length : "?"} | Auto-disabled: ${diag.disabled ? diag.disabled.length : 0}`);
        if (diag.disabled && diag.disabled.length > 0) {
            for (let di = 0; di < diag.disabled.length; di++) {
                lines.push(`  OFF: ${diag.disabled[di]}`);
            }
        }

        if (diag.newFeatures) {
            lines.push("");
            lines.push("-- Manifests --");
            lines.push(`Registered: ${diag.newFeatures.length} | Enabled: ${diag.newEnabled ? diag.newEnabled.length : 0}`);
            if (diag.newErrors) {
                const neKeys = Object.keys(diag.newErrors);
                let neCount = 0;
                for (let nek = 0; nek < neKeys.length; nek++) {
                    if (diag.newErrors[neKeys[nek]] > 0) neCount++;
                }
                lines.push(`Manifests with errors: ${neCount}`);
                if (neCount > 0) {
                    for (let nek2 = 0; nek2 < neKeys.length; nek2++) {
                        const ek = neKeys[nek2];
                        const ec = diag.newErrors[ek];
                        if (ec > 0) lines.push(`  ${ek}: ${ec} errors`);
                    }
                }
            }
        }

        const logs = diag.logs || [];
        const filtered = [];
        const seen = {};
        for (let li = 0; li < logs.length; li++) {
            const msg = String(logs[li] || "");
            if (msg.indexOf("[QOLLock]") === -1) continue;
            if (msg.indexOf("[QOLLock][TRACE]") !== -1) continue;
            if (msg.indexOf("[QOL DEBUG]") !== -1) continue;
            if (msg.indexOf("[QOLLock][INFO]") !== -1) continue;
            const delimIdx = msg.indexOf("] ");
            const dedup = delimIdx !== -1 ? msg.substring(delimIdx + 2) : msg;
            if (seen[dedup]) {
                seen[dedup]++;
                continue;
            }
            seen[dedup] = 1;
            filtered.push(msg);
        }
        if (filtered.length > 0) {
            lines.push("");
            lines.push(`-- QOLLOCK Messages (${filtered.length} unique) --`);
            for (let fi = 0; fi < filtered.length; fi++) {
                const dm = filtered[fi];
                const delimIdx = dm.indexOf("] ");
                const key = delimIdx !== -1 ? dm.substring(delimIdx + 2) : dm;
                const ddup = seen[key] || 1;
                lines.push(dm + (ddup > 1 ? ` (x${ddup})` : ""));
            }
        }

        return lines.join("\n");
    }

    // =========================================================================
    // Feature Isolation Test (FIT)
    // =========================================================================

    let fitRunning = false;
    let fitToken = 0;

    function runFeatureIsolationTest(statusLabel, actionBtn) {
        const setStatus = (text, color) => {
            if (isAlive(statusLabel)) {
                statusLabel.text = text;
                statusLabel.style.color = color;
            }
        };

        const setBtnActive = (active) => {
            if (isAlive(actionBtn)) {
                actionBtn.SetHasClass("CycleActive", Boolean(active));
            }
        };

        if (fitRunning) {
            fitRunning = false;
            fitToken++;
            setStatus("Stopped", "#aa8844");
            setBtnActive(false);
            return;
        }

        const toggleKeys = [];
        const seenKeys = {};
        const defaultCfg = (typeof DEFAULT_CONFIG !== "undefined" && DEFAULT_CONFIG) ? DEFAULT_CONFIG : {};
        const dcKeys = Object.keys(defaultCfg);
        for (let i = 0; i < dcKeys.length; i++) {
            const dk = dcKeys[i];
            if ((dk.startsWith("ENABLE_") || dk.startsWith("HUD_") || dk.startsWith("SHOW_")) && !seenKeys[dk]) {
                seenKeys[dk] = true;
                toggleKeys.push(dk);
            }
        }

        const presetsObj = (typeof PRESETS !== "undefined" && PRESETS) ? PRESETS : ((typeof globalThis !== "undefined" && (globalThis.QOL_PRESETS || globalThis.PRESETS)) ? (globalThis.QOL_PRESETS || globalThis.PRESETS) : {});
        const presetNames = Object.keys(presetsObj);
        for (let pi = 0; pi < presetNames.length; pi++) {
            const presetCfg = presetsObj[presetNames[pi]];
            if (!presetCfg) continue;
            const pkKeys = Object.keys(presetCfg);
            for (let pki = 0; pki < pkKeys.length; pki++) {
                const pk = pkKeys[pki];
                if ((pk.startsWith("ENABLE_") || pk.startsWith("HUD_") || pk.startsWith("SHOW_")) && !seenKeys[pk]) {
                    seenKeys[pk] = true;
                    toggleKeys.push(pk);
                }
            }
        }

        toggleKeys.sort();
        const testQueue = toggleKeys.map((key) => ({ name: key, configKeys: [key] }));

        if (testQueue.length === 0) {
            setStatus("No toggle keys found", "#cc4444");
            return;
        }

        const modCfg = (typeof MOD_CONFIG !== "undefined" && MOD_CONFIG) ? MOD_CONFIG : {};
        const savedConfig = {};
        for (let ti = 0; ti < testQueue.length; ti++) {
            const k = testQueue[ti].configKeys[0];
            savedConfig[k] = modCfg[k];
        }

        const saveAndSync = (typeof SaveAndSync === "function") ? SaveAndSync : () => {};

        let passed = 0;
        let failed = 0;
        let skipped = 0;
        let index = 0;
        const token = ++fitToken;
        fitRunning = true;
        setBtnActive(true);
        setStatus("Starting...", "#66cc99");

        function runNext() {
            if (!fitRunning || token !== fitToken) return;
            if (index >= testQueue.length) {
                fitRunning = false;
                setBtnActive(false);
                for (let rk = 0; rk < toggleKeys.length; rk++) {
                    const k = toggleKeys[rk];
                    modCfg[k] = savedConfig[k];
                }
                saveAndSync();
                const color = (failed > 0) ? "#cc8844" : "#66cc99";
                setStatus(`Done: ${passed} passed, ${failed} failed, ${skipped} skipped`, color);
                $.Msg(`[QOLLock][FeatureTest] Complete — ${passed} passed, ${failed} failed, ${skipped} skipped`);
                return;
            }

            const entry = testQueue[index];
            const label = `[${index + 1}/${testQueue.length}] ${entry.name}`;
            setStatus(label, "#66cc99");

            try {
                for (let ek = 0; ek < entry.configKeys.length; ek++) {
                    const ck = entry.configKeys[ek];
                    modCfg[ck] = 1;
                }
                saveAndSync();

                const forceToken = `fit_${token}_${index}`;
                const hudPanel = findHudPanel();
                if (hudPanel && hudPanel.SetAttributeString) {
                    try { hudPanel.SetAttributeString("QOL_DiagRequest", forceToken); } catch (e) {
                        warnLog("settings", `FIT write failed: ${e?.message || e}`);
                    }
                    $.Msg(`[QOLLock][FeatureTest] force-sync token written: ${forceToken} → polling for diag echo`);
                } else {
                    warnLog("settings", "FeatureTest cannot write force-sync token — Hud panel not found");
                }

                const pollStartMs = Date.now();
                let pollAttempts = 0;

                function pollFitDiag() {
                    pollAttempts++;
                    if (!fitRunning || token !== fitToken) return;

                    const nowMs = Date.now();
                    if ((nowMs - pollStartMs) > 5500) {
                        skipped++;
                        $.Msg(`[QOLLock][FeatureTest] SKIP: ${entry.name} — diagnostic sync timeout`);
                        for (let tdk = 0; tdk < entry.configKeys.length; tdk++) {
                            const ck = entry.configKeys[tdk];
                            modCfg[ck] = savedConfig[ck];
                        }
                        saveAndSync();
                        index++;
                        $.Schedule(0.08, runNext);
                        return;
                    }

                    const hud = findHudPanel();
                    let rawDiag = "";
                    if (hud && hud.GetAttributeString) {
                        try { rawDiag = hud.GetAttributeString("QOL_Diag", ""); } catch {}
                    }
                    if (rawDiag) {
                        try {
                            const diag = JSON.parse(rawDiag);
                            if (diag.diagToken === forceToken) {
                                const disabledFeatures = (diag.disabled && diag.disabled.length > 0) ? diag.disabled : [];
                                if (disabledFeatures.length > 0) {
                                    failed++;
                                    $.Msg(`[QOLLock][FeatureTest] FAIL: ${entry.name} → auto-disabled: ${disabledFeatures.join(", ")}`);
                                } else {
                                    passed++;
                                }

                                for (let dk = 0; dk < entry.configKeys.length; dk++) {
                                    const ck = entry.configKeys[dk];
                                    modCfg[ck] = savedConfig[ck];
                                }
                                saveAndSync();

                                index++;
                                $.Schedule(0.08, runNext);
                                return;
                            }
                        } catch {}
                    }
                    const interval = pollAttempts < 5 ? 0.1 : (pollAttempts < 15 ? 0.2 : 0.4);
                    $.Schedule(interval, pollFitDiag);
                }
                $.Schedule(0.15, pollFitDiag);
            } catch (e) {
                failed++;
                $.Msg(`[QOLLock][FeatureTest] FAIL: ${entry.name} threw: ${e?.message || e}`);
                for (let rk2 = 0; rk2 < entry.configKeys.length; rk2++) {
                    const ck = entry.configKeys[rk2];
                    modCfg[ck] = savedConfig[ck];
                }
                saveAndSync();
                index++;
                $.Schedule(0.08, runNext);
            }
        }
        $.Schedule(0.1, runNext);
    }

    // =========================================================================
    // Manifest Test Runner (Phase T2)
    // =========================================================================

    let mtRunning = false;
    let mtToken = 0;

    function runManifestTests(statusLabel, actionBtn) {
        const setStatus = (text, color) => {
            if (isAlive(statusLabel)) {
                statusLabel.text = text;
                statusLabel.style.color = color;
            }
        };

        const setBtnActive = (active) => {
            if (isAlive(actionBtn)) {
                actionBtn.SetHasClass("CycleActive", Boolean(active));
            }
        };

        if (mtRunning) {
            mtRunning = false;
            mtToken++;
            setStatus("Cancelled", "#aa8844");
            setBtnActive(false);
            return;
        }

        const token = ++mtToken;
        mtRunning = true;
        setBtnActive(true);
        setStatus("Starting...", "#66cc99");

        const forceToken = `mt_${token}_${Date.now()}`;
        const hudPanel = findHudPanel();
        if (hudPanel && hudPanel.SetAttributeString) {
            try { hudPanel.SetAttributeString("QOL_DiagRequest", forceToken); } catch {}
            $.Msg(`[QOLLock][ManifestTests] force-sync token: ${forceToken}`);
        } else {
            setStatus("Hud panel not found", "#cc4444");
            mtRunning = false;
            setBtnActive(false);
            return;
        }

        const pollStartMs = Date.now();
        let pollAttempts = 0;

        function pollResults() {
            pollAttempts++;
            if (!mtRunning || token !== mtToken) return;

            const elapsedMs = Date.now() - pollStartMs;
            if (elapsedMs > 6000) {
                setStatus("Timeout — no result within 6s", "#cc4444");
                mtRunning = false;
                setBtnActive(false);
                return;
            }

            const hud = findHudPanel();
            let rawDiag = "";
            if (hud && hud.GetAttributeString) {
                try { rawDiag = hud.GetAttributeString("QOL_Diag", ""); } catch {}
            }
            if (rawDiag) {
                try {
                    const diag = JSON.parse(rawDiag);
                    if (diag.testResults && diag.testResults.token === forceToken) {
                        const ts = diag.testResults.summary;
                        const statusText = `Passed: ${ts.passed}/${ts.total}, Failed: ${ts.failed}, Skipped: ${ts.skipped} (${ts.timeMs}ms)`;
                        const statusColor = (ts.failed > 0 || ts.errors > 0) ? "#cc8844" : "#66cc99";
                        setStatus(statusText, statusColor);
                        mtRunning = false;
                        setBtnActive(false);

                        $.Msg("[QOLLock][ManifestTests] === RESULTS ===");
                        $.Msg(`[QOLLock][ManifestTests] ${statusText}`);
                        if (ts.failed > 0 || ts.errors > 0) {
                            const trs = diag.testResults.results || [];
                            for (let ri = 0; ri < trs.length; ri++) {
                                const r = trs[ri];
                                if (r.passed === false || r.error) {
                                    $.Msg(`[QOLLock][ManifestTests] FAIL: ${r.id} [${r.name}]${r.message ? `: ${r.message}` : ""}`);
                                }
                            }
                        }
                        const setFeedback = Q.ui?.configTab?.setLocalizedConfigFeedbackMessage || globalThis.SetLocalizedConfigFeedbackMessage;
                        if (typeof setFeedback === "function") {
                            setFeedback(`Tests: ${ts.passed}/${ts.total} passed (${ts.timeMs}ms)`, (ts.failed > 0 ? "warn" : "success"), 5000);
                        }
                        return;
                    }
                } catch {}
            }

            const interval = pollAttempts < 10 ? 0.1 : (pollAttempts < 30 ? 0.2 : 0.4);
            $.Schedule(interval, pollResults);
        }
        $.Schedule(0.2, pollResults);
    }

    // =========================================================================
    // Panel Tree Dump & Build Storage Dry Run
    // =========================================================================

    function requestPanelTreeDump(statusLabel) {
        const hudPanel = findHudPanel();
        if (!hudPanel || !hudPanel.SetAttributeString) {
            if (isAlive(statusLabel)) {
                statusLabel.text = "Hud panel not found";
                statusLabel.style.color = "#cc4444";
            }
            return false;
        }
        const forceToken = `dt_${Date.now()}`;
        try {
            hudPanel.SetAttributeString("QOL_DiagRequest", forceToken);
        } catch (e) {
            warnLog("settings", `TreeDump request failed: ${e?.message || e}`);
            if (isAlive(statusLabel)) {
                statusLabel.text = "Request failed";
                statusLabel.style.color = "#cc4444";
            }
            return false;
        }
        $.Msg(`[QOLLock][TreeDump] requested, token: ${forceToken}`);
        if (isAlive(statusLabel)) {
            statusLabel.text = "Dumped to console log";
            statusLabel.style.color = "#66cc99";
        }
        const setFeedback = Q.ui?.configTab?.setLocalizedConfigFeedbackMessage || globalThis.SetLocalizedConfigFeedbackMessage;
        if (typeof setFeedback === "function") {
            setFeedback("Panel tree written to console log", "success", 5000);
        }
        return true;
    }

    function requestBuildStorageDryRun(statusLabel) {
        const hudPanel = findHudPanel();
        if (!hudPanel || !hudPanel.SetAttributeString) {
            if (isAlive(statusLabel)) {
                statusLabel.text = "Hud panel not found";
                statusLabel.style.color = "#cc4444";
            }
            return false;
        }
        try {
            hudPanel.SetAttributeString("QOL_BUILD_DUMP_TREE", "1");
        } catch (e) {
            warnLog("settings", `BuildStorage dry run failed: ${e?.message || e}`);
            if (isAlive(statusLabel)) {
                statusLabel.text = "Request failed";
                statusLabel.style.color = "#cc4444";
            }
            return false;
        }
        $.Msg("[QOLLock][BuildStorage] requested tree dump dry run");
        if (isAlive(statusLabel)) {
            statusLabel.text = "Dry run started";
            statusLabel.style.color = "#66cc99";
        }
        const setFeedback = Q.ui?.configTab?.setLocalizedConfigFeedbackMessage || globalThis.SetLocalizedConfigFeedbackMessage;
        if (typeof setFeedback === "function") {
            setFeedback("Build storage dry run started", "success", 5000);
        }
        return true;
    }

    // =========================================================================
    // Full Test Suite Runner & Clipboard Copy
    // =========================================================================

    let fsRunning = false;
    let fsToken = 0;

    function runFullTestSuite(container, statusLabel, actionBtn) {
        const setStatus = (text, color) => {
            if (isAlive(statusLabel)) {
                statusLabel.text = text;
                statusLabel.style.color = color;
            }
        };

        const setBtnActive = (active) => {
            if (isAlive(actionBtn)) {
                actionBtn.SetHasClass("CycleActive", Boolean(active));
            }
        };

        if (fsRunning) return;
        const token = ++fsToken;
        fsRunning = true;
        setBtnActive(true);
        setStatus("Running...", "#66cc99");

        const forceToken = `fs_${token}_${Date.now()}`;
        const hudPanel = findHudPanel();
        if (!hudPanel || !hudPanel.SetAttributeString) {
            setStatus("Hud panel not found", "#cc4444");
            fsRunning = false;
            setBtnActive(false);
            return;
        }

        try { hudPanel.SetAttributeString("QOL_DiagRequest", forceToken); } catch {}

        const pollStartMs = Date.now();
        let pollAttempts = 0;

        function pollSuiteResults() {
            pollAttempts++;
            if (!fsRunning || token !== fsToken) return;

            const elapsedMs = Date.now() - pollStartMs;
            if (elapsedMs > 8000) {
                setStatus("Timeout (8s)", "#cc4444");
                fsRunning = false;
                setBtnActive(false);
                return;
            }

            const hud = findHudPanel();
            let rawDiag = "";
            if (hud && hud.GetAttributeString) {
                try { rawDiag = hud.GetAttributeString("QOL_Diag", ""); } catch {}
            }
            if (rawDiag) {
                try {
                    const diag = JSON.parse(rawDiag);
                    if (diag.testResults && diag.testResults.token === forceToken) {
                        const report = formatTestSuiteReport(diag);
                        const hiddenEntry = $.CreatePanel("TextEntry", container, "FullSuiteCopyTextEntry");
                        hiddenEntry.text = report;
                        hiddenEntry.multiline = true;
                        hiddenEntry.maxchars = Math.max(report.length + 100, 1000);

                        const tryCopy = Q.ui?.configTab?.tryCopyTextToClipboard || globalThis.TryCopyTextToClipboard;
                        const copied = (typeof tryCopy === "function")
                            ? tryCopy(report, hiddenEntry)
                            : false;

                        if (isAlive(hiddenEntry)) {
                            try { hiddenEntry.DeleteAsync(0); } catch {}
                        }

                        const ts = diag.testResults.summary;
                        const setFeedback = Q.ui?.configTab?.setLocalizedConfigFeedbackMessage || globalThis.SetLocalizedConfigFeedbackMessage;

                        if (copied) {
                            setStatus(`Copied! ${ts.passed}/${ts.total} passed (${ts.timeMs}ms)`, "#66cc99");
                            if (typeof setFeedback === "function") {
                                setFeedback("Test report copied to clipboard.", "success", 3000);
                            }
                        } else {
                            setStatus(`${ts.passed}/${ts.total} passed (copy failed)`, "#cc8844");
                            if (typeof setFeedback === "function") {
                                setFeedback("Report ready but clipboard copy failed.", "error", 3000);
                            }
                        }
                        fsRunning = false;
                        setBtnActive(false);
                        $.Schedule(2.0, () => {
                            if (!fsRunning) setStatus("Idle", "#666");
                        });
                        return;
                    }
                } catch {}
            }

            const interval = pollAttempts < 10 ? 0.1 : (pollAttempts < 30 ? 0.2 : 0.4);
            $.Schedule(interval, pollSuiteResults);
        }
        $.Schedule(0.3, pollSuiteResults);
    }

    // =========================================================================
    // Preset Cycle (Robust)
    // =========================================================================

    let pcRunning = false;
    let pcToken = 0;
    let pcResults = [];

    function runPresetCycle(statusLabel, actionBtn) {
        const setStatus = (text, color) => {
            if (isAlive(statusLabel)) {
                statusLabel.text = text;
                statusLabel.style.color = color;
            }
        };

        const setBtnActive = (active) => {
            if (isAlive(actionBtn)) {
                actionBtn.SetHasClass("CycleActive", Boolean(active));
            }
        };

        const setFeedback = Q.ui?.configTab?.setLocalizedConfigFeedbackMessage || globalThis.SetLocalizedConfigFeedbackMessage;

        if (pcRunning) {
            pcRunning = false;
            pcToken++;
            setBtnActive(false);
            const done = pcResults.length;
            const presetsForTotal = (typeof PRESETS !== "undefined" && PRESETS) ? PRESETS : ((typeof globalThis !== "undefined" && (globalThis.QOL_PRESETS || globalThis.PRESETS)) ? (globalThis.QOL_PRESETS || globalThis.PRESETS) : {});
            const total = Object.keys(presetsForTotal).length;
            setStatus(`Stopped (${done} of ${total})`, "#aa8844");
            if (typeof setFeedback === "function") {
                setFeedback(`Stopped after ${done} presets.`, "info", 2400);
            }
            return;
        }

        const presetsObj = (typeof PRESETS !== "undefined" && PRESETS) ? PRESETS : ((typeof globalThis !== "undefined" && (globalThis.QOL_PRESETS || globalThis.PRESETS)) ? (globalThis.QOL_PRESETS || globalThis.PRESETS) : {});
        const presetNames = Object.keys(presetsObj).sort();
        if (presetNames.length === 0) {
            setStatus("No presets found.", "#cc4444");
            return;
        }

        pcRunning = true;
        pcResults = [];
        let index = 0;
        const token = ++pcToken;
        setBtnActive(true);
        setStatus("Starting...", "#66cc99");
        $.Msg(`[QOLLock][presetCycle] Starting robust cycle: ${presetNames.length} presets`);

        function runNext() {
            if (!pcRunning || token !== pcToken) return;

            if (index >= presetNames.length) {
                pcRunning = false;
                setBtnActive(false);
                let passed = 0;
                let failed = 0;
                const failNames = [];
                for (let ri = 0; ri < pcResults.length; ri++) {
                    if (pcResults[ri].passed) {
                        passed++;
                    } else {
                        failed++;
                        const why = (pcResults[ri].autoDisabled && pcResults[ri].autoDisabled.length > 0)
                            ? pcResults[ri].autoDisabled.join(",")
                            : (pcResults[ri].timeout ? "timeout" : (pcResults[ri].exception ? "exception" : "unknown"));
                        failNames.push(`${pcResults[ri].name} (${why})`);
                    }
                }
                const summaryColor = (failed > 0) ? "#cc8844" : "#66cc99";
                const summary = `Done: ${passed} passed, ${failed} failed`;
                setStatus(summary, summaryColor);
                $.Msg(`[QOLLock][presetCycle] === SUMMARY: ${summary} ===`);
                if (failNames.length > 0) {
                    $.Msg(`[QOLLock][presetCycle] FAILURES: ${failNames.join("; ")}`);
                }

                let totalMs = 0;
                let minMs = Infinity;
                let maxMs = 0;
                for (let ti = 0; ti < pcResults.length; ti++) {
                    if (pcResults[ti].timeMs > 0) {
                        totalMs += pcResults[ti].timeMs;
                        if (pcResults[ti].timeMs < minMs) minMs = pcResults[ti].timeMs;
                        if (pcResults[ti].timeMs > maxMs) maxMs = pcResults[ti].timeMs;
                    }
                }
                if (pcResults.length > 0 && minMs < Infinity) {
                    const avgMs = Math.round(totalMs / pcResults.length);
                    $.Msg(`[QOLLock][presetCycle] Timing: avg=${avgMs}ms, min=${minMs}ms, max=${maxMs}ms, total=${(totalMs / 1000).toFixed(1)}s`);
                }
                if (typeof setFeedback === "function") {
                    setFeedback(`${summary} (${totalMs > 0 ? (totalMs / 1000).toFixed(1) + "s" : "N/A"})`, (failed > 0 ? "warn" : "success"), 5000);
                }
                return;
            }

            const presetName = presetNames[index];
            const startMs = Date.now();
            const forceToken = `pc_${token}_${index}`;
            const label = `[${index + 1}/${presetNames.length}] ${presetName}`;
            setStatus(`${label} …`, "#66cc99");

            let applyOk = true;
            let applyErr = "";
            try {
                const applyPresetFn = Q.ui?.presets?.applyPresetByName || globalThis.ApplyPresetByName;
                if (typeof applyPresetFn === "function") {
                    applyPresetFn(presetName);
                } else {
                    throw new Error("ApplyPresetByName not available");
                }
            } catch (e) {
                applyOk = false;
                applyErr = e?.message || String(e || "");
                $.Msg(`[QOLLock][presetCycle] ApplyPresetByName failed for '${presetName}': ${applyErr}`);
            }

            if (!applyOk) {
                pcResults.push({ name: presetName, passed: false, autoDisabled: [], featuresLoaded: 0, timeMs: Date.now() - startMs, exception: applyErr });
                setStatus(`${label} — EXCEPTION`, "#cc4444");
                index++;
                $.Schedule(0.05, runNext);
                return;
            }

            const hudPanel = findHudPanel();
            if (hudPanel && hudPanel.SetAttributeString) {
                try { hudPanel.SetAttributeString("QOL_DiagRequest", forceToken); } catch (e) {
                    warnLog("settings", `presetCycle write failed: ${e?.message || e}`);
                }
                $.Msg(`[QOLLock][presetCycle] force-sync token written: ${forceToken} → polling for diag echo`);
            } else {
                warnLog("settings", "presetCycle cannot write force-sync token — Hud panel not found");
            }

            const pollStartMs = Date.now();
            let pollAttempts = 0;
            const maxPollMs = 5500;

            function pollDiag() {
                pollAttempts++;
                if (!pcRunning || token !== pcToken) return;

                const nowMs = Date.now();
                const elapsedPollMs = nowMs - pollStartMs;

                if (elapsedPollMs > maxPollMs) {
                    pcResults.push({ name: presetName, passed: false, autoDisabled: [], featuresLoaded: 0, timeMs: nowMs - startMs, timeout: true });
                    $.Msg(`[QOLLock][presetCycle] ${label} — TIMEOUT (no diagnostic sync after ${Math.round(elapsedPollMs)}ms)`);
                    setStatus(`${label} — TIMEOUT`, "#cc8844");
                    index++;
                    $.Schedule(0.05, runNext);
                    return;
                }

                const hud = findHudPanel();
                let rawDiag = "";
                if (hud && hud.GetAttributeString) {
                    try { rawDiag = hud.GetAttributeString("QOL_Diag", ""); } catch {}
                }

                if (rawDiag) {
                    try {
                        const diag = JSON.parse(rawDiag);
                        if (diag.diagToken === forceToken) {
                            const elapsedMs = nowMs - startMs;
                            const autoDisabled = (diag.disabled) ? diag.disabled : [];
                            const features = (diag.features) ? diag.features : [];
                            const isSuccess = autoDisabled.length === 0;

                            pcResults.push({
                                name: presetName,
                                passed: isSuccess,
                                autoDisabled,
                                featuresLoaded: features.length,
                                timeMs: elapsedMs
                            });

                            const statusStr = isSuccess ? "OK" : `FAIL: ${autoDisabled.join(", ")}`;
                            const color = isSuccess ? "#66cc99" : "#cc4444";
                            $.Msg(`[QOLLock][presetCycle] ${label} — ${statusStr} (${features.length} features, ${elapsedMs}ms, ${pollAttempts} polls)`);
                            setStatus(`${label} — ${statusStr}`, color);

                            index++;
                            $.Schedule(0.05, runNext);
                            return;
                        }
                    } catch {}
                }

                const interval = pollAttempts < 5 ? 0.1 : (pollAttempts < 15 ? 0.2 : 0.4);
                $.Schedule(interval, pollDiag);
            }

            $.Schedule(0.15, pollDiag);
        }

        $.Schedule(0.1, runNext);
    }

    // =========================================================================
    // Diagnostics Log Copy
    // =========================================================================

    function copyDiagnosticsToClipboard(container, button) {
        let diagText = "";
        try {
            const dumpFn = Q.dumpDiagnostics || globalThis.QOL_DumpDiagnostics;
            if (typeof dumpFn === "function") {
                diagText = dumpFn();
            } else {
                diagText = "=== QOLLOCK Diagnostics ===\n(No diagnostic dump function available)\n";
            }
        } catch (e) {
            diagText = `=== QOLLOCK Diagnostics ===\nError: ${String(e?.message || e)}\n`;
        }

        const hiddenEntry = $.CreatePanel("TextEntry", container, "DiagCopyTextEntry");
        hiddenEntry.text = diagText;
        hiddenEntry.multiline = true;
        hiddenEntry.maxchars = Math.max(diagText.length + 100, 1000);
        hiddenEntry.SetPanelEvent("onfocus", () => {
            try { hiddenEntry.SelectAll(); } catch {}
        });

        const tryCopy = Q.ui?.configTab?.tryCopyTextToClipboard || globalThis.TryCopyTextToClipboard;
        const copied = (typeof tryCopy === "function")
            ? tryCopy(diagText, hiddenEntry)
            : false;

        if (isAlive(hiddenEntry)) {
            try { hiddenEntry.DeleteAsync(0); } catch {}
        }

        const setFeedback = Q.ui?.configTab?.setLocalizedConfigFeedbackMessage || globalThis.SetLocalizedConfigFeedbackMessage;

        if (copied) {
            if (isAlive(button)) {
                button.RemoveClass("FailureState");
                button.AddClass("SuccessState");
            }
            if (typeof setFeedback === "function") {
                setFeedback("Diagnostic logs copied.", "success", 2200);
            }
            $.Schedule(0.6, () => {
                if (isAlive(button)) button.RemoveClass("SuccessState");
            });
        } else {
            if (isAlive(button)) {
                button.RemoveClass("SuccessState");
                button.AddClass("FailureState");
            }
            if (typeof setFeedback === "function") {
                setFeedback("Clipboard copy failed.", "error", 2200);
            }
            $.Schedule(0.5, () => {
                if (isAlive(button)) button.RemoveClass("FailureState");
            });
        }
    }

    // =========================================================================
    // Dev Tab Renderer
    // =========================================================================

    function renderDevTab(list) {
        if (!list) return;

        const createTitle = (typeof globalThis.CreateSectionTitle === "function")
            ? globalThis.CreateSectionTitle
            : ((p, t) => Q.ui?.renderer?.createSectionHeader?.(p, t));
        const createRow = (typeof globalThis.CreateRow === "function")
            ? globalThis.CreateRow
            : null;
        const createSliderRow = (typeof globalThis.CreateSliderRow === "function")
            ? globalThis.CreateSliderRow
            : null;
        const createSep = (typeof globalThis.CreateSeparator === "function")
            ? globalThis.CreateSeparator
            : ((p) => Q.ui?.renderer?.createSeparator?.(p));
        const createIconButton = Q.ui?.configTab?.createSectionInlineIconButton || globalThis.CreateSectionInlineIconButton;

        // 1. Performance Section
        createTitle(list, "Performance", "ENABLE_PERF_DEBUG");
        if (createRow) {
            createRow(list, "Perf Debug", "ENABLE_PERF_DEBUG", "toggle", null, null, null, null, "Enable performance tracking (required for overlay).");
            createRow(list, "Detailed Console", "ENABLE_PERF_DEBUG_DETAIL", "toggle", null, null, null, null, "Show full feature breakdown in console every 5s.");
            createRow(list, "Show Overlay", "ENABLE_PERF_OVERLAY", "toggle", null, null, null, null, "Show the performance overlay HUD in-game.");
        }
        if (createSliderRow) {
            createSliderRow(list, "Alert Threshold", "PERF_ALERT_THRESHOLD_MS", "alert_ms_1_50", "Console alert when any feature exceeds this ms threshold.");
            createSliderRow(list, "Overlay Opacity", "PERF_OVERLAY_OPACITY", "opacity_perf", "Opacity of the performance overlay panel.");
        }
        createSep(list);

        // 2. Feature Isolation Test (FIT)
        const fitHeader = createTitle(list, "Feature Test");
        const fitBtn = (typeof createIconButton === "function")
            ? createIconButton(fitHeader, "FeatureTestBtn", "s2r://panorama/images/icons/icon_play.vsvg", "Test each feature individually (enable → verify → disable).")
            : null;
        const fitStatus = $.CreatePanel("Label", fitHeader, "FeatureTestStatus");
        fitStatus.text = "Idle";
        fitStatus.style.fontSize = "13px";
        fitStatus.style.color = "#666";
        fitStatus.style.marginLeft = "6px";
        fitStatus.style.verticalAlign = "center";

        if (fitBtn) {
            fitBtn.SetPanelEvent("onactivate", () => {
                runFeatureIsolationTest(fitStatus, fitBtn);
            });
        }

        // 3. Manifest Test Runner (Phase T2)
        const mtHeader = createTitle(list, "Manifest Tests");
        const mtBtn = (typeof createIconButton === "function")
            ? createIconButton(mtHeader, "ManifestTestBtn", "s2r://panorama/images/icons/icon_play.vsvg", "Run all registered manifest test() hooks. Requires HUD context.")
            : null;
        const mtStatus = $.CreatePanel("Label", mtHeader, "ManifestTestStatus");
        mtStatus.text = "Idle";
        mtStatus.style.fontSize = "13px";
        mtStatus.style.color = "#666";
        mtStatus.style.marginLeft = "6px";
        mtStatus.style.verticalAlign = "center";

        if (mtBtn) {
            mtBtn.SetPanelEvent("onactivate", () => {
                runManifestTests(mtStatus, mtBtn);
            });
        }

        // 4. Panel Tree Dump
        const treeDumpHeader = createTitle(list, "Panel Tree Dump");
        const treeDumpBtn = (typeof createIconButton === "function")
            ? createIconButton(treeDumpHeader, "TreeDumpBtn", "s2r://panorama/images/icons/icon_play.vsvg", "Dump the live panel tree to the console log for the offline profiler. Requires HUD context; save your console log afterwards.")
            : null;
        const treeDumpStatus = $.CreatePanel("Label", treeDumpHeader, "TreeDumpStatus");
        treeDumpStatus.text = "Idle";
        treeDumpStatus.style.fontSize = "13px";
        treeDumpStatus.style.color = "#666";
        treeDumpStatus.style.marginLeft = "6px";
        treeDumpStatus.style.verticalAlign = "center";

        if (treeDumpBtn) {
            treeDumpBtn.SetPanelEvent("onactivate", () => {
                requestPanelTreeDump(treeDumpStatus);
            });
        }

        // 5. Build Storage Dry Run
        const bsDumpHeader = createTitle(list, "Build Storage Dry Run");
        const bsDumpBtn = (typeof createIconButton === "function")
            ? createIconButton(bsDumpHeader, "BsDumpBtn", "s2r://panorama/images/icons/icon_play.vsvg", "Perform a dry run of the build storage pipeline (switch hero, open shop, open popup) and dump tree to console. Requires HUD context.")
            : null;
        const bsDumpStatus = $.CreatePanel("Label", bsDumpHeader, "BsDumpStatus");
        bsDumpStatus.text = "Idle";
        bsDumpStatus.style.fontSize = "13px";
        bsDumpStatus.style.color = "#666";
        bsDumpStatus.style.marginLeft = "6px";
        bsDumpStatus.style.verticalAlign = "center";

        if (bsDumpBtn) {
            bsDumpBtn.SetPanelEvent("onactivate", () => {
                requestBuildStorageDryRun(bsDumpStatus);
            });
        }

        // 6. Test Suite + Copy Report
        const suiteHeader = createTitle(list, "Test Suite");
        const suiteBtn = (typeof createIconButton === "function")
            ? createIconButton(suiteHeader, "FullSuiteBtn", "s2r://panorama/images/icons/icon_copy.vsvg", "Run all tests and copy a compact report to clipboard.")
            : null;
        const suiteStatus = $.CreatePanel("Label", suiteHeader, "FullSuiteStatus");
        suiteStatus.text = "Idle";
        suiteStatus.style.fontSize = "13px";
        suiteStatus.style.color = "#666";
        suiteStatus.style.marginLeft = "6px";
        suiteStatus.style.verticalAlign = "center";

        if (suiteBtn) {
            suiteBtn.SetPanelEvent("onactivate", () => {
                runFullTestSuite(list, suiteStatus, suiteBtn);
            });
        }

        // 7. Preset Cycle (Robust)
        const presetCycleHeader = createTitle(list, "Preset Cycle");
        const presetCycleBtn = (typeof createIconButton === "function")
            ? createIconButton(presetCycleHeader, "PresetCycleBtn", "s2r://panorama/images/icons/icon_reorder.vsvg", "Apply every preset and verify no features auto-disable. Click again to stop.")
            : null;
        const presetCycleStatus = $.CreatePanel("Label", presetCycleHeader, "PresetCycleStatus");
        presetCycleStatus.text = "Idle";
        presetCycleStatus.style.fontSize = "13px";
        presetCycleStatus.style.color = "#666";
        presetCycleStatus.style.marginLeft = "6px";
        presetCycleStatus.style.verticalAlign = "center";

        if (presetCycleBtn) {
            presetCycleBtn.SetPanelEvent("onactivate", () => {
                runPresetCycle(presetCycleStatus, presetCycleBtn);
            });
        }

        // 8. Diagnostics Dump
        const diagHeader = createTitle(list, "Diagnostics");
        const copyLogsBtn = (typeof createIconButton === "function")
            ? createIconButton(diagHeader, "DiagCopyLogsBtn", "s2r://panorama/images/icons/icon_copy.vsvg", "Copy QOLLock diagnostic logs to clipboard.")
            : null;

        if (copyLogsBtn) {
            copyLogsBtn.SetPanelEvent("onactivate", () => {
                copyDiagnosticsToClipboard(list, copyLogsBtn);
            });
        }
    }

    // Register tab with window manager if available
    if (Q.ui?.window?.registerTabRenderer) {
        Q.ui.window.registerTabRenderer("Dev", renderDevTab);
    }

    // =========================================================================
    // Public API Export & Backwards Compatibility
    // =========================================================================

    const devTabApi = {
        findHudPanel,
        formatTestSuiteReport,
        runFeatureIsolationTest,
        runManifestTests,
        requestPanelTreeDump,
        requestBuildStorageDryRun,
        runFullTestSuite,
        runPresetCycle,
        copyDiagnosticsToClipboard,
        render: renderDevTab
    };

    Q.ui.devTab = devTabApi;

    if (typeof globalThis === "object" && globalThis) {
        globalThis.RenderDevTabContent = renderDevTab;
        globalThis.FormatTestSuiteReport = formatTestSuiteReport;
    }
})();

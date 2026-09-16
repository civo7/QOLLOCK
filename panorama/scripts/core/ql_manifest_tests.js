// =============================================================================
// QOLLOCK — core/ql_manifest_tests.js
// =============================================================================
// OWNS:        Manifest test runner. Enumerates registered manifests, calls
//              optional test() hooks, collates results. Frame-spread execution
//              to avoid frame drops (50ms/test budget, 2s total suite).
// DOES NOT OWN: Feature lifecycle (FeatureRegistry), diagnostic bridge (ql_core),
//               panel creation, scheduling
// DEPENDS ON:  core/ql_namespace.js, core/ql_feature_registry.js
// USED BY:     Diagnostic bridge (ql_core.js), Dev panel button (ql_settings.js),
//              in-game console (QOL.core.ManifestTests.runAll())
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

    const MAX_TASK_MS = 50;
    const MAX_TOTAL_MS = 2000;
    const YIELD_MS = 0.05;

    const nowMs = () => (Date.now ? Date.now() : (new Date()).getTime());

    const emptyResults = () => ({
        token: "",
        summary: { total: 0, passed: 0, failed: 0, skipped: 0, errors: 0, timeMs: 0 },
        results: [],
        timestamp: 0,
        aborted: false
    });

    /**
     * Run test() hooks for all enabled manifests, spread across frames.
     */
    const runAllTests = (opts = {}) => {
        if (testInProgress) return false;

        const ids = opts.featureIds || FR.getRegisteredIds();
        if (!ids || ids.length === 0) {
            if (opts.onComplete) opts.onComplete(emptyResults());
            return false;
        }

        testInProgress = true;
        testToken++;
        const token = testToken;
        const results = emptyResults();
        results.token = opts.token || "";
        results.timestamp = nowMs();

        const totalStart = nowMs();
        let index = 0;
        const resultList = [];

        const finish = (resultsObj, cancelled) => {
            const total = resultList.length;
            let passed = 0;
            let failed = 0;
            let skipped = 0;
            let errors = 0;

            for (let i = 0; i < resultList.length; i++) {
                const r = resultList[i];
                if (r.error) errors++;
                else if (r.skipped) skipped++;
                else if (r.passed) passed++;
                else failed++;
            }

            resultsObj.results = resultList;
            resultsObj.summary = {
                total,
                passed,
                failed,
                skipped,
                errors,
                timeMs: nowMs() - totalStart
            };
            resultsObj.timestamp = nowMs();

            testResults = resultsObj;
            testInProgress = false;

            if (!cancelled) {
                $.Msg(`[QOLLock][ManifestTests] Suite: ${passed}/${total} passed, ${failed} failed, ${skipped} skipped, ${errors} errors in ${resultsObj.summary.timeMs}ms`);
            }

            if (opts.onComplete) opts.onComplete(resultsObj);
        };

        const runNext = () => {
            if (!testInProgress || token !== testToken) {
                finish(results, true);
                return;
            }
            if ((nowMs() - totalStart) > MAX_TOTAL_MS) {
                results.aborted = true;
                finish(results, false);
                return;
            }

            if (index >= ids.length) {
                finish(results, false);
                return;
            }

            const id = ids[index];
            index++;

            const manifest = FR.getManifest(id);
            if (!manifest || typeof manifest.test !== "function") {
                resultList.push({
                    id,
                    passed: null,
                    name: "No test hook — skipped",
                    skipped: true,
                    duration: 0
                });
                $.Schedule(0, runNext);
                return;
            }

            const ctx = FR.createContext(id);
            const t0 = nowMs();
            let testResult = null;
            let testError = null;
            try {
                testResult = manifest.test(ctx);
            } catch (e) {
                testError = (e && e.message) ? e.message : String(e);
            }
            const elapsed = nowMs() - t0;

            if (testError) {
                resultList.push({
                    id,
                    passed: false,
                    name: "test() threw",
                    message: testError,
                    duration: elapsed,
                    error: true
                });
            } else if (testResult === null || testResult === undefined) {
                resultList.push({
                    id,
                    passed: null,
                    name: "Not applicable — skipped",
                    skipped: true,
                    duration: elapsed
                });
            } else {
                resultList.push({
                    id,
                    passed: testResult.passed === true,
                    name: testResult.name || "Unnamed test",
                    message: testResult.message || "",
                    duration: elapsed,
                    assertions: testResult.assertions || []
                });
            }

            if (elapsed > MAX_TASK_MS) {
                $.Schedule(YIELD_MS, runNext);
            } else {
                $.Schedule(0, runNext);
            }
        };

        $.Schedule(0, runNext);
        return true;
    };

    const getResults = () => testResults;

    const cancel = () => {
        testInProgress = false;
        testToken++;
    };

    const isRunning = () => testInProgress;

    const buildCompactReport = (diag) => {
        if (!diag) return "No diagnostic data.";
        const lines = ["=== QOLLOCK Test Report ==="];

        if (diag.testResults?.summary) {
            const ts = diag.testResults.summary;
            lines.push("");
            lines.push("── Manifest Tests ──");
            lines.push(`Total: ${ts.total} | Passed: ${ts.passed} | Failed: ${ts.failed} | Skipped: ${ts.skipped} | Errors: ${ts.errors} | Time: ${ts.timeMs}ms`);
            if (ts.failed > 0 || ts.errors > 0) {
                const trs = diag.testResults.results || [];
                for (let ri = 0; ri < trs.length; ri++) {
                    const r = trs[ri];
                    if (r.passed === false || r.error) {
                        lines.push(`  FAIL: ${r.id} [${r.name}]${r.message ? `: ${r.message}` : ""}`);
                    }
                }
            }
            if (diag.testResults.timestamp) {
                lines.push(`Ran at: ${new Date(diag.testResults.timestamp).toISOString()}`);
            }
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

    /**
     * In-Game Engine Audit Runner.
     * Sweeps the live game environment, inspecting native Valve panels,
     * manifest states, bridge attributes, presets, and UI integrity.
     * Outputs structured, high-visibility logs directly to the engine console via $.Msg.
     */
    const runEngineAudit = () => {
        const log = (msg) => {
            if (typeof $.Msg === "function") {
                $.Msg(msg);
            }
        };

        const startTime = nowMs();
        log("================================================================================");
        log("[QOLLOCK ENGINE AUDIT] Starting Full In-Game Self-Test");
        log("================================================================================");

        // 1. Context & Environment
        let hud = null;
        try {
            if (Q.core?.hud?.findHud) hud = Q.core.hud.findHud();
            else if (Q.core?.panel?.findHud) hud = Q.core.panel.findHud();
            else if (Q.ui?.PanelHelpers?.findHud) hud = Q.ui.PanelHelpers.findHud();
            else if ($.GetContextPanel) {
                let cur = $.GetContextPanel();
                while (cur && cur.GetParent && cur.GetParent()) cur = cur.GetParent();
                hud = (cur && cur.FindChildTraverse) ? cur.FindChildTraverse("Hud") : cur;
            }
        } catch (_) {}

        const inHideout = Boolean(Q.core?.hud?.isInHideout && Q.core.hud.isInHideout());
        const isBrawl = Boolean(Q.core?.hud?.isStreetBrawl && Q.core.hud.isStreetBrawl());
        log(`[AUDIT][Context] HUD Panel: ${hud ? (hud.id || hud.paneltype || "CitadelHud") : "NOT FOUND (EscapeMenu context)"} | Hideout: ${inHideout} | StreetBrawl: ${isBrawl}`);

        // 2. Valve Native Panels Safety Check
        log("\n--- [1/5] Native Valve Panels Safety Check ---");
        const nativePanelIds = [
            { id: "TopBar", name: "Top Bar (CitadelHudTopBar)", critical: true },
            { id: "minimap_container", name: "Minimap Container", critical: false },
            { id: "hud_health", name: "Health Container", critical: true },
            { id: "gold_and_ap_container", name: "Gold & AP Container (Souls)", critical: true },
            { id: "gameplay_hud", name: "Gameplay HUD", critical: false },
            { id: "gameplay_hud_alive", name: "Gameplay HUD Alive", critical: false },
            { id: "ability_container", name: "Abilities Container", critical: false },
            { id: "CitadelHudShop", name: "Hero Shop", critical: false }
        ];

        let nativePass = 0;
        let nativeFail = 0;

        for (const item of nativePanelIds) {
            let p = null;
            try {
                if (hud && hud.FindChildTraverse) p = hud.FindChildTraverse(item.id);
                if (!p && $.GetContextPanel) {
                    let cur = $.GetContextPanel();
                    while (cur && cur.GetParent && cur.GetParent()) cur = cur.GetParent();
                    if (cur && cur.FindChildTraverse) p = cur.FindChildTraverse(item.id);
                }
            } catch (_) {}

            if (!p) {
                log(`  [INFO] #${item.id} (${item.name}): Not in tree (normal if before hero spawn or in menu)`);
                continue;
            }

            const hasQolHidden = Boolean(p.BHasClass && p.BHasClass("qol-hidden"));
            const isCollapsed = Boolean(p.style && (p.style.visibility === "collapse" || p.style.visibility === "none"));

            if (hasQolHidden) {
                log(`  [CRITICAL FAIL] #${item.id} has class 'qol-hidden'! (PANEL WAS COLLAPSED BY MOD)`);
                nativeFail++;
            } else if (isCollapsed && item.critical) {
                log(`  [WARN] #${item.id} has inline style visibility: ${p.style.visibility}`);
            } else {
                const hasCustomPos = Boolean(p.style && (p.style.x || p.style.y));
                const hasCustomScale = Boolean(p.style && p.style.uiScale);
                log(`  [PASS] #${item.id}: ALIVE, qol-hidden: NO, position: ${hasCustomPos ? (p.style.x + "," + p.style.y) : "native"}, scale: ${hasCustomScale ? p.style.uiScale : "native"}`);
                nativePass++;
            }
        }

        // 3. Feature Manifests Audit
        log("\n--- [2/5] Feature Manifests Audit ---");
        const registeredIds = FR ? FR.getRegisteredIds() : [];
        const enabledIds = FR ? FR.getEnabledIds() : [];
        const errorCounts = FR ? FR.getErrorCounts() : {};

        let manifestErrors = 0;
        let manifestsPassed = 0;

        for (const fId of registeredIds) {
            const errCount = errorCounts[fId] || 0;
            if (errCount > 0) {
                log(`  [FAIL] ${fId}: recorded ${errCount} runtime errors!`);
                manifestErrors++;
                continue;
            }

            const manifest = FR.getManifest(fId);
            if (manifest && typeof manifest.test === "function") {
                try {
                    const ctx = FR.createContext ? FR.createContext(fId) : {};
                    const tr = manifest.test(ctx);
                    if (tr && tr.passed === false) {
                        if (tr.message && (tr.message.includes("not found") || tr.message.includes("missing"))) {
                            log(`  [INFO] ${fId}: deferred (${tr.message})`);
                        } else {
                            log(`  [FAIL] ${fId} test hook failed: ${tr.message || "assertion failure"}`);
                            manifestErrors++;
                            continue;
                        }
                    }
                } catch (tErr) {
                    log(`  [FAIL] ${fId} test hook threw: ${tErr && tErr.message ? tErr.message : tErr}`);
                    manifestErrors++;
                    continue;
                }
            }
            manifestsPassed++;
        }
        log(`  Result: ${manifestsPassed}/${registeredIds.length} manifests healthy (Enabled: ${enabledIds.length}, Errors: ${manifestErrors})`);

        // 4. Cross-Isolate Bridge Integrity Check
        log("\n--- [3/5] Cross-Isolate Bridge Integrity ---");
        let bridgePass = 0;
        let bridgeFail = 0;

        if (hud && hud.GetAttributeString) {
            const storageKey = (typeof QOL_STORAGE_KEY !== "undefined") ? QOL_STORAGE_KEY : "Deadlock_Mod_Settings_v1";
            const rawCfg = hud.GetAttributeString(storageKey, "");
            const rev = hud.GetAttributeString("QOL_USER_EDIT_REV", "0");
            const activePreset = hud.GetAttributeString("QOL_RUNTIME_PRESET", "");

            if (!rawCfg) {
                log(`  [WARN] Bridge STORAGE_KEY ('${storageKey}') is empty on #Hud`);
            } else {
                try {
                    const parsed = JSON.parse(rawCfg);
                    const keyCount = (parsed && parsed.data) ? Object.keys(parsed.data).length : Object.keys(parsed).length;
                    log(`  [PASS] Bridge config envelope: Valid JSON (${rawCfg.length} chars, ${keyCount} keys)`);
                    bridgePass++;
                } catch (e) {
                    log(`  [FAIL] Bridge config is corrupt JSON: ${e.message}`);
                    bridgeFail++;
                }
            }

            log(`  [INFO] User edit revision: ${rev} | Active preset: ${activePreset || "Default/Custom"}`);
            bridgePass++;
        } else {
            log("  [INFO] #Hud attributes not directly readable from current context panel");
        }

        // 5. Presets Subsystem Check
        log("\n--- [4/5] Presets Subsystem ---");
        const presetsMap = (typeof globalThis !== "undefined" && (globalThis.QOL_PRESETS || globalThis.PRESETS)) ||
                           (typeof QOL !== "undefined" && QOL.presets) || {};
        const presetKeys = Object.keys(presetsMap);
        log(`  Total community presets registered: ${presetKeys.length}`);

        const samplePresets = ["BreadRollius", "Saiah", "Basil", "Vegas", "Poshy", "BSQTT", "Thorkizzle"];
        let presetsFound = 0;
        for (const name of samplePresets) {
            if (presetsMap[name]) {
                presetsFound++;
            } else {
                log(`  [FAIL] Expected preset '${name}' missing from presets dictionary!`);
            }
        }
        if (presetsFound === samplePresets.length) {
            log(`  [PASS] Sample presets resolution: 100% (${samplePresets.length}/${samplePresets.length} found)`);
        } else {
            log(`  [WARN] Missing sample presets: found ${presetsFound}/${samplePresets.length}`);
        }

        // 6. Summary & Elapsed Time
        const elapsed = nowMs() - startTime;
        log("\n================================================================================");
        const totalFails = nativeFail + manifestErrors + bridgeFail;
        if (totalFails === 0) {
            log(`[QOLLOCK ENGINE AUDIT] ALL CHECKS PASSED in ${elapsed}ms (Native: ${nativePass} ok, Manifests: ${manifestsPassed} ok)`);
        } else {
            log(`[QOLLOCK ENGINE AUDIT] AUDIT FAILED with ${totalFails} issue(s) in ${elapsed}ms!`);
        }
        log("================================================================================\n");

        return {
            success: totalFails === 0,
            nativePass,
            nativeFail,
            manifestsPassed,
            manifestErrors,
            bridgePass,
            bridgeFail,
            elapsed
        };
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

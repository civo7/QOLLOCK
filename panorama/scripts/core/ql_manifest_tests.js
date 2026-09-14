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

    Q.core.ManifestTests = {
        runAll: runAllTests,
        getResults,
        cancel,
        isRunning,
        buildCompactReport
    };

    $.Msg("[QOLLock] core/ql_manifest_tests: attached to QOL.core.ManifestTests");
})();

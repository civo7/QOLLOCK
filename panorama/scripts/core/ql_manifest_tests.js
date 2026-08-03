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

(function () {
    "use strict";

    if (!QOL || !QOL.core) {
        $.Msg("[QOLLock] core/ql_manifest_tests: QOL.core not found — aborting.");
        return;
    }
    var FR = QOL.core.FeatureRegistry;
    if (!FR) {
        $.Msg("[QOLLock] core/ql_manifest_tests: FeatureRegistry not found — aborting.");
        return;
    }

    // -- Private state --
    var _testResults = null;  // { summary, results, timestamp, token }
    var _testInProgress = false;
    var _testToken = 0;

    // MAX_TASK_MS: each test invocation must complete within this budget.
    // Beyond this, the runner yields frames (schedules next with delay).
    var MAX_TASK_MS = 50;
    // MAX_TOTAL_MS: entire suite must complete within this budget (2s).
    var MAX_TOTAL_MS = 2000;
    // YIELD_MS: when yielding between frames, how long to wait.
    var YIELD_MS = 0.05;

    function _nowMs() {
        return Date.now ? Date.now() : (new Date()).getTime();
    }

    function _emptyResults() {
        return {
            token: "",
            summary: { total: 0, passed: 0, failed: 0, skipped: 0, errors: 0, timeMs: 0 },
            results: [],
            timestamp: 0,
            aborted: false
        };
    }

    /**
     * Run test() hooks for all enabled manifests, spread across frames.
     * @param {Object} opts - Optional overrides
     * @param {string} opts.token - Force-sync token for diagnostic bridge matching
     * @param {Array<string>} opts.featureIds - Specific manifest IDs to test (default: all registered)
     * @param {function} opts.onComplete - Called with final results object
     * @returns {boolean} true if runner started, false if already running
     */
    function runAllTests(opts) {
        if (_testInProgress) return false;
        opts = opts || {};

        var ids = opts.featureIds || FR.getRegisteredIds();
        if (!ids || ids.length === 0) {
            if (opts.onComplete) opts.onComplete(_emptyResults());
            return false;
        }

        _testInProgress = true;
        _testToken++;
        var token = _testToken;
        var results = _emptyResults();
        results.token = opts.token || "";
        results.timestamp = _nowMs();

        var totalStart = _nowMs();
        var index = 0;
        var resultList = [];

        function runNext() {
            // Stop conditions
            if (!_testInProgress || token !== _testToken) {
                _finish(results, true);
                return;
            }
            if ((_nowMs() - totalStart) > MAX_TOTAL_MS) {
                results.aborted = true;
                _finish(results, false);
                return;
            }

            if (index >= ids.length) {
                _finish(results, false);
                return;
            }

            var id = ids[index];
            index++;

            // Run test() on ALL manifests, not just enabled ones.
            // The test() hook contract requires it to be read-only (no State writes,
            // no config.set(), no DispatchEvent), so it's safe to run regardless
            // of enabled state. This catches panel-existence regressions before
            // a feature is ever toggled on.

            // Skip manifests without a test()
            var manifest = FR.getManifest(id);
            if (!manifest || typeof manifest.test !== "function") {
                resultList.push({ id: id, passed: null, name: "No test hook — skipped",
                                  skipped: true, duration: 0 });
                $.Schedule(0, runNext);
                return;
            }

            // Build a fresh context for the test
            var ctx = FR.createContext(id);

            // Run the test, guarded
            var t0 = _nowMs();
            var testResult = null;
            var testError = null;
            try {
                testResult = manifest.test(ctx);
            } catch (e) {
                testError = (e && e.message) ? e.message : String(e);
            }
            var elapsed = _nowMs() - t0;

            if (testError) {
                // Test itself threw
                resultList.push({
                    id: id, passed: false, name: "test() threw",
                    message: testError, duration: elapsed, error: true
                });
            } else if (testResult === null || testResult === undefined) {
                // Skipped — test returned null
                resultList.push({
                    id: id, passed: null, name: "Not applicable — skipped",
                    skipped: true, duration: elapsed
                });
            } else {
                // Normal result
                resultList.push({
                    id: id,
                    passed: testResult.passed === true,
                    name: testResult.name || "Unnamed test",
                    message: testResult.message || "",
                    duration: elapsed,
                    assertions: testResult.assertions || []
                });
            }

            // Yield if we exceeded the per-test budget
            if (elapsed > MAX_TASK_MS) {
                $.Schedule(YIELD_MS, runNext);
            } else {
                $.Schedule(0, runNext);
            }
        }

        function _finish(resultsObj, cancelled) {
            // Collate summary
            var total = resultList.length;
            var passed = 0, failed = 0, skipped = 0, errors = 0;
            for (var i = 0; i < resultList.length; i++) {
                var r = resultList[i];
                if (r.error) errors++;
                else if (r.skipped) skipped++;
                else if (r.passed) passed++;
                else failed++;
            }

            resultsObj.results = resultList;
            resultsObj.summary = {
                total: total, passed: passed, failed: failed,
                skipped: skipped, errors: errors,
                timeMs: _nowMs() - totalStart
            };
            resultsObj.timestamp = _nowMs();

            _testResults = resultsObj;
            _testInProgress = false;

            if (!cancelled) {
                $.Msg("[QOLLock][ManifestTests] Suite: " + passed + "/" + total +
                    " passed, " + failed + " failed, " + skipped + " skipped, " +
                    errors + " errors in " + resultsObj.summary.timeMs + "ms");
            }

            if (opts.onComplete) opts.onComplete(resultsObj);
        }

        // Start first test on next frame (allows caller to set up after return)
        $.Schedule(0, runNext);
        return true;
    }

    function getResults() { return _testResults; }

    function cancel() {
        _testInProgress = false;
        _testToken++;
    }

    function isRunning() { return _testInProgress; }

    /**
     * Build a compact, human-readable test report from diagnostic data.
     * Filters out non-QOLLOCK noise (game system logs, TRACE messages, server spam).
     * @param {Object} diag - Parsed QOL_Diag JSON object
     * @returns {string} Compact report text, suitable for clipboard
     */
    function buildCompactReport(diag) {
        if (!diag) return "No diagnostic data.";
        var lines = [];
        lines.push("=== QOLLOCK Test Report ===");

        // Manifest test results
        if (diag.testResults && diag.testResults.summary) {
            var ts = diag.testResults.summary;
            lines.push("");
            lines.push("── Manifest Tests ──");
            lines.push("Total: " + ts.total + " | Passed: " + ts.passed + " | Failed: " + ts.failed +
                " | Skipped: " + ts.skipped + " | Errors: " + ts.errors + " | Time: " + ts.timeMs + "ms");
            if (ts.failed > 0 || ts.errors > 0) {
                var trs = diag.testResults.results || [];
                for (var ri = 0; ri < trs.length; ri++) {
                    var r = trs[ri];
                    if (r.passed === false || r.error) {
                        lines.push("  FAIL: " + r.id + " [" + r.name + "]" +
                            (r.message ? ": " + r.message : ""));
                    }
                }
            }
            if (diag.testResults.timestamp) {
                lines.push("Ran at: " + new Date(diag.testResults.timestamp).toISOString());
            }
        }

        // Feature health
        var features = diag.features || [];
        var disabled = diag.disabled || [];
        lines.push("");
        lines.push("── Old Features ──");
        lines.push("Loaded: " + features.length + " | Auto-disabled: " + (disabled.length || 0));
        if (disabled.length > 0) {
            for (var di = 0; di < disabled.length; di++) {
                var dName = disabled[di];
                var errCount = (diag.errors && diag.errors[dName]) ? diag.errors[dName] : "?";
                lines.push("  OFF: " + dName + " (errors: " + errCount + ")");
            }
        }

        // New FeatureRegistry manifests
        if (diag.newFeatures) {
            lines.push("");
            lines.push("── Manifests ──");
            lines.push("Registered: " + diag.newFeatures.length +
                " | Enabled: " + ((diag.newEnabled && diag.newEnabled.length) || 0));
            if (diag.newErrors) {
                var neKeys = Object.keys(diag.newErrors);
                var neCount = 0;
                for (var nek = 0; nek < neKeys.length; nek++) {
                    if (diag.newErrors[neKeys[nek]] > 0) neCount++;
                }
                if (neCount > 0) {
                    lines.push("Manifests with errors: " + neCount);
                    for (var nek2 = 0; nek2 < neKeys.length; nek2++) {
                        var ek = neKeys[nek2];
                        var ec = diag.newErrors[ek];
                        if (ec > 0) lines.push("  " + ek + ": " + ec + " errors");
                    }
                } else {
                    lines.push("Manifest errors: 0");
                }
            }
        }

        // Filtered logs — QOLLOCK WARN/ERROR only, deduplicated
        var logs = diag.logs || [];
        var filtered = [];
        var seen = {};
        for (var li = 0; li < logs.length; li++) {
            var msg = String(logs[li] || "");
            // Skip non-QOLLOCK noise
            if (msg.indexOf("[QOLLock]") === -1) continue;
            // Skip TRACE/DEBUG messages
            if (msg.indexOf("[QOLLock][TRACE]") !== -1) continue;
            if (msg.indexOf("[QOL DEBUG]") !== -1) continue;
            // Skip INFO registration messages (verbose, not useful in report)
            if (msg.indexOf("[QOLLock][INFO][FeatureRegistry] registered") !== -1) continue;
            if (msg.indexOf("[QOLLock][INFO][App]") !== -1) continue;
            // Deduplicate
            var dedupKey = msg.substring(msg.indexOf("] ") + 2);
            if (seen[dedupKey]) { seen[dedupKey]++; continue; }
            seen[dedupKey] = 1;
            filtered.push(msg);
        }
        if (filtered.length > 0) {
            lines.push("");
            lines.push("── QOLLOCK Messages (" + filtered.length + " unique) ──");
            for (var fi = 0; fi < filtered.length; fi++) {
                var dupCount = seen[filtered[fi].substring(filtered[fi].indexOf("] ") + 2)] || 1;
                lines.push(filtered[fi] + (dupCount > 1 ? " (x" + dupCount + ")" : ""));
            }
        }

        // Preset cycle summary (if available from last run)
        if (diag.presetCycle) {
            lines.push("");
            lines.push("── Preset Cycle ──");
            var pc = diag.presetCycle;
            lines.push("Passed: " + (pc.passed || "?") + "/" + (pc.total || "?") +
                " | Failed: " + (pc.failed || 0) + " | Time: " + (pc.totalTimeMs || "?") + "ms");
        }

        return lines.join("\n");
    }

    // -- Attach to namespace --
    QOL.core.ManifestTests = {
        runAll: runAllTests,
        getResults: getResults,
        cancel: cancel,
        isRunning: isRunning,
        buildCompactReport: buildCompactReport
    };

    $.Msg("[QOLLock] core/ql_manifest_tests: attached to QOL.core.ManifestTests");
})();

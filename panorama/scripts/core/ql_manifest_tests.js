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

            // Skip features that aren't enabled (test() is for runtime verification)
            if (!FR.isEnabled(id)) {
                resultList.push({ id: id, passed: null, name: "Feature disabled — skipped",
                                  skipped: true, duration: 0 });
                $.Schedule(0, runNext);
                return;
            }

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

    // -- Attach to namespace --
    QOL.core.ManifestTests = {
        runAll: runAllTests,
        getResults: getResults,
        cancel: cancel,
        isRunning: isRunning
    };

    $.Msg("[QOLLock] core/ql_manifest_tests: attached to QOL.core.ManifestTests");
})();

// ql_utils.js — Shared utilities for QOLLOCK
// Loaded BEFORE ql_core.js and ql_settings.js via hud.xml
(function() {
    var exports = {};

    // ---- Panel Validation ----

    /**
     * Returns true if the panel exists and is valid.
     * Fixes the original bug where !panel.IsValid incorrectly returned true
     * when .IsValid was undefined (not a function).
     */
    function IsPanelValid(panel) {
        return panel != null && typeof panel.IsValid === "function" && panel.IsValid();
    }
    exports.IsPanelValid = IsPanelValid;

    // ---- Safe Attribute Access ----

    /**
     * Safely read a string attribute from a panel.
     * Returns defaultValue (or "") if the panel is invalid or the read fails.
     */
    function SafeGetAttribute(panel, attrName, defaultValue) {
        var def = defaultValue !== undefined ? String(defaultValue) : "";
        try {
            if (panel && typeof panel.GetAttributeString === "function") {
                return String(panel.GetAttributeString(String(attrName || ""), def) || def);
            }
        } catch (e) {}
        return def;
    }
    exports.SafeGetAttribute = SafeGetAttribute;

    /**
     * Safely write a string attribute to a panel.
     * Returns true on success, false if the panel is invalid or the write fails.
     */
    function SafeSetAttribute(panel, attrName, value) {
        try {
            if (panel && typeof panel.SetAttributeString === "function") {
                panel.SetAttributeString(String(attrName || ""), String(value || ""));
                return true;
            }
        } catch (e) {}
        return false;
    }
    exports.SafeSetAttribute = SafeSetAttribute;

    // ---- Panel Finding ----

    /**
     * Find the first valid panel with the given class, traversing children.
     */
    function FindFirstPanelByClass(root, className) {
        if (!root || typeof root.FindChildrenWithClassTraverse !== "function" || !className) return null;
        var panels = root.FindChildrenWithClassTraverse(className) || [];
        for (var i = 0; i < panels.length; i++) {
            if (IsPanelValid(panels[i])) return panels[i];
        }
        return null;
    }
    exports.FindFirstPanelByClass = FindFirstPanelByClass;

    /**
     * Walk up the panel hierarchy to find an ancestor with the given class.
     * Returns the ancestor panel or null.
     */
    function FindAncestorWithClass(panel, className) {
        var current = panel;
        while (current) {
            if (current.BHasClass && current.BHasClass(className)) return current;
            current = (typeof current.GetParent === "function") ? current.GetParent() : null;
        }
        return null;
    }
    exports.FindAncestorWithClass = FindAncestorWithClass;

    /**
     * Check if a panel or any ancestor has the given class.
     */
    function HasClassInHierarchy(panel, className) {
        var current = panel;
        while (current) {
            if (current.BHasClass && current.BHasClass(className)) return true;
            current = (typeof current.GetParent === "function") ? current.GetParent() : null;
        }
        return false;
    }
    exports.HasClassInHierarchy = HasClassInHierarchy;

    // ---- Error Handling ----

    var errorThrottles = {};

    /**
     * Log an error with per-source throttling.
     * Only logs once per throttleMs (default 2000ms) per source.
     */
    function LogError(source, err, throttleMs) {
        var now = Date.now ? Date.now() : (new Date()).getTime();
        var key = "err_" + source;
        var nextMs = Number(errorThrottles[key]) || 0;
        if (now < nextMs) return;
        errorThrottles[key] = now + (Number(throttleMs) || 2000);

        var msg = "unknown";
        if (err && err.message) msg = String(err.message);
        else if (err !== undefined && err !== null) msg = String(err);
        var stack = (err && err.stack) ? ("\n" + String(err.stack)) : "";
        $.Msg("[QOLLock][" + source + "] runtime error: " + msg + stack);
    }
    exports.LogError = LogError;

    // ---- Performance Timing ----

    /**
     * Current time in milliseconds. Uses Date.now() if available.
     */
    function PerfNowMs() {
        return Date.now ? Date.now() : (new Date()).getTime();
    }
    exports.PerfNowMs = PerfNowMs;

    // ---- Config Helpers ----

    /**
     * Returns true if a config key is enabled (strictly 1).
     */
    function IsCfgEnabled(cfg, key) {
        return Number(cfg && cfg[key]) === 1;
    }
    exports.IsCfgEnabled = IsCfgEnabled;

    // ---- Config Validation ----

    /**
     * Perform a basic health check on a config object.
     * Returns an array of issue strings (empty = healthy).
     */
    function ValidateConfigHealth(cfg) {
        var issues = [];
        if (typeof cfg !== "object" || !cfg) {
            issues.push("config is not an object");
            return issues;
        }
        // Check for known numeric fields with wrong types
        var numericFields = [
            "SPM_SAMPLE_INTERVAL", "HEALTHBAR_TYPE", "ENABLE_COLORED_HEALTHBAR",
            "ENABLE_MINIMAP_ROTATE", "ENABLE_COMPASS", "LOOP_INTERVAL_SEC"
        ];
        for (var i = 0; i < numericFields.length; i++) {
            var key = numericFields[i];
            if (cfg.hasOwnProperty(key) && cfg[key] !== undefined && cfg[key] !== null) {
                if (typeof cfg[key] !== "number") {
                    issues.push(key + " has wrong type: " + (typeof cfg[key]) + " (expected number)");
                }
            }
        }
        return issues;
    }
    exports.ValidateConfigHealth = ValidateConfigHealth;

    // ---- Number Normalization ----

    /**
     * Clamp a value to [0, 1] with a configurable fallback.
     */
    function NormalizeOpacityNumber(value, fallback) {
        var n = Number(value);
        if (!isFinite(n)) n = Number(fallback);
        if (!isFinite(n)) n = 1.0;
        if (n < 0) n = 0;
        if (n > 1) n = 1;
        return n;
    }
    exports.NormalizeOpacityNumber = NormalizeOpacityNumber;

    /**
     * Round a pixel-offset value to an integer with safe fallback.
     */
    function NormalizeHudOffsetNumber(value, fallback) {
        var n = Math.round(Number(value));
        if (!isFinite(n)) n = Math.round(Number(fallback) || 0);
        if (!isFinite(n)) n = 0;
        return n;
    }
    exports.NormalizeHudOffsetNumber = NormalizeHudOffsetNumber;

    /**
     * Format a HUD offset as a CSS pixel string.
     */
    function FormatHudPx(value, fallback) {
        return String(NormalizeHudOffsetNumber(value, fallback)) + "px";
    }
    exports.FormatHudPx = FormatHudPx;

    /**
     * Clamp a scale value to [0.5, 1.5] with a configurable fallback.
     */
    function NormalizeHudScaleNumber(value, fallback) {
        var n = Number(value);
        if (!isFinite(n)) n = Number(fallback);
        if (!isFinite(n)) n = 1.0;
        if (n < 0.5) n = 0.5;
        if (n > 1.5) n = 1.5;
        return n;
    }
    exports.NormalizeHudScaleNumber = NormalizeHudScaleNumber;

    // ---- Angle Math ----

    /**
     * Normalize an angle to [0, 360).
     */
    function NormalizeDegrees360(rawDeg) {
        var out = rawDeg % 360;
        if (out < 0) out += 360;
        if (out >= 360) out -= 360;
        return out;
    }
    exports.NormalizeDegrees360 = NormalizeDegrees360;

    /**
     * Normalize an angle to [-180, 180).
     */
    function NormalizeDegrees180(rawDeg) {
        var out = NormalizeDegrees360(rawDeg);
        if (out > 180) out -= 360;
        return out;
    }
    exports.NormalizeDegrees180 = NormalizeDegrees180;

    /**
     * Shortest signed delta between two angles in degrees.
     */
    function ShortestDegreesDelta(fromDeg, toDeg) {
        var from = NormalizeDegrees180(fromDeg);
        var to = NormalizeDegrees180(toDeg);
        var delta = to - from;
        if (delta > 180) delta -= 360;
        if (delta < -180) delta += 360;
        return delta;
    }
    exports.ShortestDegreesDelta = ShortestDegreesDelta;

    // ---- Panel Safety Wrappers ----

    /**
     * Set a CSS style property on a panel with null guards and try/catch.
     */
    function SetStyleSafe(panel, prop, value) {
        if (!panel || !panel.style || !prop) return;
        try {
            panel.style[prop] = value;
        } catch (e) {}
    }
    exports.SetStyleSafe = SetStyleSafe;

    /**
     * Clear a CSS style property on a panel (tries delete, null, then "").
     */
    function ClearStyleSafe(panel, prop) {
        if (!panel || !panel.style || !prop) return;
        try { delete panel.style[prop]; } catch (e0) {}
        try { panel.style[prop] = null; } catch (e1) {}
        try { panel.style[prop] = ""; } catch (e2) {}
    }
    exports.ClearStyleSafe = ClearStyleSafe;

    /**
     * Safely set panel opacity with bounds clamping and fallback.
     * Returns the opacity text that was applied.
     */
    function SetPanelOpacitySafe(panel, value, fallback) {
        if (!panel || !panel.style) return "";
        var text = NormalizeOpacityNumber(value, fallback).toFixed(2);
        try {
            if (panel.style.opacity !== text) panel.style.opacity = text;
        } catch (e0) {
            try { panel.style.opacity = "1.00"; } catch (e1) {}
        }
        return text;
    }
    exports.SetPanelOpacitySafe = SetPanelOpacitySafe;

    /**
     * Returns true if every panel in the list is valid.
     */
    function IsPanelListValid(list) {
        if (!list || list.length === 0) return false;
        for (var i = 0; i < list.length; i++) {
            if (!IsPanelValid(list[i])) return false;
        }
        return true;
    }
    exports.IsPanelListValid = IsPanelListValid;

    /**
     * Safely read a panel layout offset, rejecting FLT_MAX and non-finite values.
     */
    function ReadSafePanelLayoutOffset(rawValue) {
        var n = Number(rawValue);
        if (!isFinite(n)) return null;
        if (Math.abs(n) > 100000) return null;
        return n;
    }
    exports.ReadSafePanelLayoutOffset = ReadSafePanelLayoutOffset;

    /**
     * Safely check if a panel has a CSS class, with null guard.
     */
    function PanelHasClass(panel, className) {
        return !!(panel && panel.BHasClass && panel.BHasClass(className));
    }
    exports.PanelHasClass = PanelHasClass;

    /**
     * Return an array if the value is one, or an empty array.
     */
    function SafeArray(val) {
        return Array.isArray(val) ? val : [];
    }
    exports.SafeArray = SafeArray;

    /**
     * Safely set panel visibility with null guard and no-op on same value.
     */
    function SetPanelVisibility(panel, visible) {
        if (!panel || !panel.style) return;
        var value = visible ? "visible" : "collapse";
        if (panel.style.visibility !== value) panel.style.visibility = value;
    }
    exports.SetPanelVisibility = SetPanelVisibility;

    // ---- Logging (Fix 16) ----

    var DEBUG_ENABLED = false;
    var _logThrottles = {};
    var _DEFAULT_LOG_THROTTLE_MS = 2000;

    function _log(level, category, message) {
        var now = PerfNowMs();
        var key = level + "_" + category;
        var nextMs = Number(_logThrottles[key]) || 0;
        if (now < nextMs) return;
        _logThrottles[key] = now + _DEFAULT_LOG_THROTTLE_MS;
        $.Msg("[QOLLock][" + level + "][" + category + "] " + message);
    }

    /**
     * Debug-level log. Only fires when debug mode is enabled.
     * Use for per-tick diagnostics and verbose output.
     */
    function DebugLog(category, message) {
        if (!DEBUG_ENABLED) return;
        _log("DEBUG", category, message);
    }
    exports.DebugLog = DebugLog;

    /**
     * Info-level log. For significant state changes (feature enabled/disabled, config loaded).
     * Always logged but throttled.
     */
    function InfoLog(category, message) {
        _log("INFO", category, message);
    }
    exports.InfoLog = InfoLog;

    /**
     * Warning-level log. For unexpected but recoverable situations.
     * Always logged but throttled.
     */
    function WarnLog(category, message) {
        _log("WARN", category, message);
    }
    exports.WarnLog = WarnLog;

    /**
     * Error-level log. For actual errors. Always logged but throttled.
     */
    function ErrorLog(category, message) {
        _log("ERROR", category, message);
    }
    exports.ErrorLog = ErrorLog;

    /**
     * Safely execute a function, logging errors at debug level when debug mode is on.
     * Returns the function's result on success, or null on failure.
     * Use for converting try { ... } catch(e) {} into auditable operations:
     *   SafeLog(function() { panel.style.opacity = "1.00"; }, "style.opacity");
     */
    var _safeLogThrottles = {};
    var _SAFELOG_THROTTLE_MS = 5000;
    function SafeLog(fn, label) {
        try {
            return fn();
        } catch (e) {
            if (DEBUG_ENABLED) {
                var now = PerfNowMs();
                var nextMs = Number(_safeLogThrottles[label] || 0);
                if (now >= nextMs) {
                    _safeLogThrottles[label] = now + _SAFELOG_THROTTLE_MS;
                    $.Msg("[QOLLock][DEBUG][SafeLog] " + (label || "unnamed") + ": " + (e && e.message ? e.message : String(e)));
                }
            }
            return null;
        }
    }
    exports.SafeLog = SafeLog;

    /**
     * Enable or disable debug-level logging at runtime.
     */
    function SetDebugEnabled(enabled) {
        DEBUG_ENABLED = !!enabled;
    }
    exports.SetDebugEnabled = SetDebugEnabled;

    /**
     * Check if debug logging is currently enabled.
     */
    function IsDebugEnabled() {
        return DEBUG_ENABLED;
    }
    exports.IsDebugEnabled = IsDebugEnabled;

    /**
     * Parse a revision number from an arbitrary value.
     * Returns Math.floor(n) for finite non-negative numbers, 0 otherwise.
     */
    function ParseRevisionNumber(v) {
        var n = Number(v);
        if (!isFinite(n) || n < 0) return 0;
        return Math.floor(n);
    }
    exports.ParseRevisionNumber = ParseRevisionNumber;

    /**
     * Push a panel to an array if it's not already present.
     * Null-guards both the array and panel.
     */
    function PushUnique(arr, panel) {
        if (!arr || !panel) return;
        for (var i = 0; i < arr.length; i++) {
            if (arr[i] === panel) return;
        }
        arr.push(panel);
    }
    exports.PushUnique = PushUnique;

    /**
     * Lightweight function call profiler with rolling 60s window.
     * Call ProfileHit("functionName") at the top of hot functions.
     * Dumps top callers every 10s (configurable).
     *
     * Off by default — QOL_UTILS.SetProfilerEnabled(true)
     */
    var _profilerEnabled = false;
    var _profilerHits = {};       // { name: [{timeMs, count}] } — ring of 10s buckets
    var _profilerLastDumpMs = 0;
    var _PROFILER_WINDOW_MS = 60000;
    var _PROFILER_DUMP_INTERVAL_MS = 10000;
    var _PROFILER_TOP_N = 15;

    function ProfileHit(name) {
        if (!_profilerEnabled) return;
        _profilerHits[name] = (Number(_profilerHits[name]) || 0) + 1;
    }
    exports.ProfileHit = ProfileHit;

    function SetProfilerEnabled(enabled) {
        _profilerEnabled = !!enabled;
        if (!enabled) _profilerHits = {};
    }
    exports.SetProfilerEnabled = SetProfilerEnabled;

    function DumpProfile() {
        if (!_profilerEnabled) return;
        var now = PerfNowMs();
        if (now - _profilerLastDumpMs < _PROFILER_DUMP_INTERVAL_MS) return;
        _profilerLastDumpMs = now;

        var entries = [];
        for (var k in _profilerHits) {
            if (_profilerHits.hasOwnProperty(k)) {
                entries.push({ name: k, count: _profilerHits[k] });
            }
        }
        entries.sort(function(a, b) { return b.count - a.count; });

        $.Msg("[QOLLock][PROFILE] === Top " + _PROFILER_TOP_N + " called (rolling " +
            Math.round(_PROFILER_WINDOW_MS / 1000) + "s, dumping every " +
            Math.round(_PROFILER_DUMP_INTERVAL_MS / 1000) + "s) ===");
        var limit = Math.min(_PROFILER_TOP_N, entries.length);
        for (var i = 0; i < limit; i++) {
            $.Msg("[QOLLock][PROFILE] " + (i + 1) + ". " + entries[i].name +
                " — " + entries[i].count + " calls (" +
                Math.round(entries[i].count / (_PROFILER_WINDOW_MS / 1000)) + "/s)");
        }
        // Rolling window: keep counts, just reset every dump so each
        // 10s slice is additive to whatever the reader sees in the
        // surrounding 60s. Full reset every 6 dumps (60s).
        _profilerHits = {};
    }
    exports.DumpProfile = DumpProfile;

    // =====================================================================
    // FPS / FRAME-TIMING DIAGNOSTICS
    // =====================================================================

    /**
     * Frame budget tracker with rolling 60s window, dumping every 10s.
     * Call TimeFeature('name', startMs) to record feature duration.
     * Call RecordFrameTime(elapsedMs) for overall tick timing.
     *
     * Off by default — QOL_UTILS.SetTimingEnabled(true)
     */
    var _timingEnabled = false;
    var _timingSamples = {};      // { name: [{elapsedMs, timeMs}] }
    var _timingFrameSamples = []; // [{elapsedMs, timeMs}]
    var _timingLastDumpMs = 0;
    var _TIMING_WINDOW_MS = 60000;
    var _TIMING_DUMP_INTERVAL_MS = 10000;
    var _TIMING_TOP_N = 15;

    function _pruneSamples(arr, now) {
        var cutoff = now - _TIMING_WINDOW_MS;
        var writeIdx = 0;
        for (var i = 0; i < arr.length; i++) {
            if (arr[i].timeMs >= cutoff) {
                arr[writeIdx] = arr[i];
                writeIdx++;
            }
        }
        arr.length = writeIdx;
    }

    function TimeFeature(name, startMs) {
        if (!_timingEnabled) return;
        var now = PerfNowMs();
        var elapsed = now - startMs;
        var arr = _timingSamples[name];
        if (!arr) { arr = []; _timingSamples[name] = arr; }
        arr.push({ elapsedMs: elapsed, timeMs: now });
    }
    exports.TimeFeature = TimeFeature;

    function RecordFrameTime(elapsedMs) {
        if (!_timingEnabled) return;
        _timingFrameSamples.push({ elapsedMs: elapsedMs, timeMs: PerfNowMs() });
    }
    exports.RecordFrameTime = RecordFrameTime;

    function SetTimingEnabled(enabled) {
        _timingEnabled = !!enabled;
        if (!enabled) {
            _timingSamples = {};
            _timingFrameSamples = [];
        }
    }
    exports.SetTimingEnabled = SetTimingEnabled;

    function DumpTiming() {
        if (!_timingEnabled) return;
        var now = PerfNowMs();
        if (now - _timingLastDumpMs < _TIMING_DUMP_INTERVAL_MS) return;
        _timingLastDumpMs = now;

        // Prune everything outside the rolling window
        _pruneSamples(_timingFrameSamples, now);
        for (var k in _timingSamples) {
            if (_timingSamples.hasOwnProperty(k)) _pruneSamples(_timingSamples[k], now);
        }

        // Frame budget summary
        var frames = _timingFrameSamples;
        if (frames.length > 0) {
            var totalMs = 0, maxMs = 0, over50 = 0, over100 = 0;
            for (var fi = 0; fi < frames.length; fi++) {
                var ms = frames[fi].elapsedMs;
                totalMs += ms;
                if (ms > maxMs) maxMs = ms;
                if (ms > 50) over50++;
                if (ms > 100) over100++;
            }
            var avgMs = Math.round(totalMs / frames.length * 100) / 100;
            $.Msg("[QOLLock][TIMING] === Frame budget (rolling " +
                Math.round(_TIMING_WINDOW_MS / 1000) + "s) ===");
            $.Msg("[QOLLock][TIMING] Ticks: " + frames.length +
                " | avg: " + avgMs + "ms | max: " + Math.round(maxMs * 100) / 100 + "ms" +
                " | >50ms: " + over50 + " | >100ms: " + over100);
            if (over50 > 0) {
                $.Msg("[QOLLock][TIMING] WARNING: " + over50 +
                    " ticks exceeded 50ms — visible stutter at 60fps");
            }
        }

        // Feature breakdown by total time
        var entries = [];
        for (var k2 in _timingSamples) {
            if (_timingSamples.hasOwnProperty(k2)) {
                var samples = _timingSamples[k2];
                if (samples.length === 0) continue;
                var tTotal = 0, tMax = 0;
                for (var si = 0; si < samples.length; si++) {
                    tTotal += samples[si].elapsedMs;
                    if (samples[si].elapsedMs > tMax) tMax = samples[si].elapsedMs;
                }
                entries.push({
                    name: k2,
                    avgMs: Math.round(tTotal / samples.length * 100) / 100,
                    maxMs: Math.round(tMax * 100) / 100,
                    count: samples.length,
                    totalMs: Math.round(tTotal * 100) / 100
                });
            }
        }
        entries.sort(function(a, b) { return b.totalMs - a.totalMs; });

        $.Msg("[QOLLock][TIMING] === Top " + _TIMING_TOP_N + " features by total time ===");
        var limit = Math.min(_TIMING_TOP_N, entries.length);
        for (var i = 0; i < limit; i++) {
            var e = entries[i];
            $.Msg("[QOLLock][TIMING] " + (i + 1) + ". " + e.name +
                " — " + e.totalMs + "ms total, avg " + e.avgMs + "ms, max " + e.maxMs + "ms (" + e.count + " calls)");
        }
    }
    exports.DumpTiming = DumpTiming;

    // ---- Export ----

    // Publish to global scope so other scripts can access it
    if (typeof window !== "undefined") {
        window.QOL_UTILS = exports;
    } else if (typeof globalThis !== "undefined") {
        globalThis.QOL_UTILS = exports;
    }
    // Note: ql_shared_presets.js (loaded after us) attaches QOL_UTILS
    // to the QOL bridge namespace as QOL.utils — see QOL namespace setup.
})();

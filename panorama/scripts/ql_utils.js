// ql_utils.js — Shared utilities for QOLLOCK
// Leaf helpers loaded before core modules and consumers in each XML context.
(function() {
    'use strict';
    var exports = {};

    // ---- Panel Validation ----

    /**
     * Returns false for absent, destroyed, or invalidated panel handles.
     */
    function IsPanelValid(panel) {
        try {
            return !!(panel && typeof panel.IsValid === "function" && panel.IsValid());
        } catch (e) { return false; }
    }
    exports.IsPanelValid = IsPanelValid;

    // Profile labels may contain punctuation, but account IDs have at most ten digits.
    function ParseAccountId(value) {
        if (value === undefined || value === null) return "";
        var digits = String(value).replace(/[^0-9]/g, "");
        return digits.length >= 1 && digits.length <= 10 ? digits : "";
    }
    exports.ParseAccountId = ParseAccountId;

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
        } catch (e) { /* SafeGetAttribute: panel may not support GetAttributeString */ }
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
                panel.SetAttributeString(String(attrName || ""), String(value != null ? value : ""));
                return true;
            }
        } catch (e) { /* SafeSetAttribute: panel may not support SetAttributeString */ }
        return false;
    }
    exports.SafeSetAttribute = SafeSetAttribute;

    // ---- Panel Finding ----

    function FindPanelsByClass(root, className) {
        try {
            if (root && className && typeof root.FindChildrenWithClassTraverse === "function") {
                return root.FindChildrenWithClassTraverse(className) || [];
            }
        } catch (e) { /* Panel may disappear while resolving descendants. */ }
        return [];
    }
    exports.FindPanelsByClass = FindPanelsByClass;

    /**
     * Find the first valid panel with the given class, traversing children.
     */
    function FindFirstPanelByClass(root, className) {
        var panels = FindPanelsByClass(root, className);
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

    /**
     * Clamp a numeric value (typically from a config key) to [min, max],
     * with a fallback used when value is NaN or non-finite.
     * Pass shouldRound=true to Math.round the result before clamping.
     */
    function ClampConfigNumber(value, fallback, min, max, shouldRound) {
        var n = Number(value);
        if (!isFinite(n)) n = Number(fallback);
        if (!isFinite(n)) n = 0;
        if (shouldRound) n = Math.round(n);
        if (!isFinite(n)) return n;
        if (n < min) n = min;
        if (n > max) n = max;
        return n;
    }
    exports.ClampConfigNumber = ClampConfigNumber;

    // ---- Config Validation ----

    /**
     * Perform a basic health check on a config object.
     * Returns an array of issue strings (empty = healthy).
     */
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
        } catch (e) { /* SetStyleSafe: panel may be deleted mid-frame */ }
    }
    exports.SetStyleSafe = SetStyleSafe;

    /**
     * Set a CSS style property only when the panel does not already hold that value.
     *
     * Panorama does not compare before acting on a style assignment: writing the
     * value a panel already has still marks it dirty and queues a re-layout of its
     * subtree. A loop that re-asserts the same geometry every tick therefore pays
     * full price for doing nothing, and at 20Hz across several panels that is real
     * frame time.
     *
     * Deliberately a separate function rather than a compare added inside
     * SetStyleSafe. Reading a style property back does not always return the string
     * that was written — the engine may normalize it — so folding the compare into
     * SetStyleSafe would make it an inert guard in some places and, worse, could skip
     * a write whose read-back matches while the engine's own state differs. Opt in at
     * sites where the redundancy has actually been measured.
     *
     * Returns true when a write was performed.
     */
    function SetStyleIfChanged(panel, prop, value) {
        if (!panel || !panel.style || !prop) return false;
        try {
            if (panel.style[prop] === value) return false;
            panel.style[prop] = value;
            return true;
        } catch (e) { /* SetStyleIfChanged: panel may be deleted mid-frame */ }
        return false;
    }
    exports.SetStyleIfChanged = SetStyleIfChanged;

    /**
     * Release a native code style override before trying legacy fallbacks.
     */
    function ClearStyleSafe(panel, prop) {
        if (!panel || !panel.style || !prop) return;
        try {
            if (typeof panel.ClearPropertyFromCode === "function") {
                panel.ClearPropertyFromCode(prop);
                return;
            }
        } catch (e) { /* Older/stale native handles may not support clearing. */ }
        try { delete panel.style[prop]; } catch (e0) { /* delete panel.style[prop] may throw in strict mode */ }
        try { panel.style[prop] = null; } catch (e1) { /* panel.style[prop] = null may throw on frozen objects */ }
        try { panel.style[prop] = ""; } catch (e2) { /* panel.style[prop] = "" may throw on frozen objects */ }
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
            try { panel.style.opacity = "1.00"; } catch (e1) { /* style.opacity may throw if panel deleted mid-frame */ }
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
     * Calculate a panel's (x, y) position relative to an ancestor by walking
     * the parent chain and summing actualxoffset / actualyoffset.
     * Returns null if the ancestor is not reached within 64 steps.
     */
    function GetPanelPositionRelativeToAncestor(panel, ancestor) {
        if (!panel || !ancestor) return null;
        var x = 0;
        var y = 0;
        var p = panel;
        var guard = 0;
        while (p && p !== ancestor && guard < 64) {
            var ox = ReadSafePanelLayoutOffset(p.actualxoffset);
            var oy = ReadSafePanelLayoutOffset(p.actualyoffset);
            if (ox === null || oy === null) return null;
            x += ox;
            y += oy;
            p = p.GetParent ? p.GetParent() : null;
            guard++;
        }
        if (p !== ancestor) return null;
        return { x: x, y: y };
    }
    exports.GetPanelPositionRelativeToAncestor = GetPanelPositionRelativeToAncestor;

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
        // Phase 8.6: Use class toggles instead of direct style.visibility mutation.
        // Class-based state is Panorama's recommended pattern (per knowledge base).
        if (!panel) return;
        var shouldHide = !visible;
        if (panel.SetHasClass) {
            panel.SetHasClass("qol-hidden", shouldHide);
        } else if (panel.style) {
            // Fallback for panels without SetHasClass (rare edge case)
            var value = visible ? "visible" : "collapse";
            if (panel.style.visibility !== value) panel.style.visibility = value;
        }
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

    // ---- Color utilities (Phase 11 Step 0.1: extracted from ql_core.js) ----

    // HP threshold percentages for colored healthbar warning levels.
    var COLORED_HEALTHBAR_LOW_HP_THRESHOLD = 25;
    var COLORED_HEALTHBAR_MID_HP_THRESHOLD = 65;
    var COLORED_HEALTHBAR_HIGH_HP_THRESHOLD = 75;
    var COLORED_HEALTHBAR_PULSE_STEP = 0.1;
    var COLORED_HEALTHBAR_COLOR_RED = [255, 0, 0];
    var COLORED_HEALTHBAR_COLOR_DARK_RED = [222, 0, 0];
    var COLORED_HEALTHBAR_COLOR_ORANGE = [255, 177, 0];
    var COLORED_HEALTHBAR_COLOR_YELLOW = [255, 240, 120];
    var COLORED_HEALTHBAR_COLOR_WHITE = [255, 255, 255];
    exports.COLORED_HEALTHBAR_LOW_HP_THRESHOLD = COLORED_HEALTHBAR_LOW_HP_THRESHOLD;
    exports.COLORED_HEALTHBAR_MID_HP_THRESHOLD = COLORED_HEALTHBAR_MID_HP_THRESHOLD;
    exports.COLORED_HEALTHBAR_HIGH_HP_THRESHOLD = COLORED_HEALTHBAR_HIGH_HP_THRESHOLD;
    exports.COLORED_HEALTHBAR_PULSE_STEP = COLORED_HEALTHBAR_PULSE_STEP;
    exports.COLORED_HEALTHBAR_COLOR_RED = COLORED_HEALTHBAR_COLOR_RED;
    exports.COLORED_HEALTHBAR_COLOR_DARK_RED = COLORED_HEALTHBAR_COLOR_DARK_RED;
    exports.COLORED_HEALTHBAR_COLOR_ORANGE = COLORED_HEALTHBAR_COLOR_ORANGE;
    exports.COLORED_HEALTHBAR_COLOR_YELLOW = COLORED_HEALTHBAR_COLOR_YELLOW;
    exports.COLORED_HEALTHBAR_COLOR_WHITE = COLORED_HEALTHBAR_COLOR_WHITE;

    function ToRgbString(rgb) {
        return "rgb(" + rgb[0] + ", " + rgb[1] + ", " + rgb[2] + ")";
    }
    exports.ToRgbString = ToRgbString;

    function BlendRgb(a, b, t) {
        return [
            Math.round(a[0] + ((b[0] - a[0]) * t)),
            Math.round(a[1] + ((b[1] - a[1]) * t)),
            Math.round(a[2] + ((b[2] - a[2]) * t))
        ];
    }
    exports.BlendRgb = BlendRgb;

    function SetWashColorSafe(panel, color) {
        if (color) {
            exports.SetStyleSafe(panel, "washColor", String(color));
        } else {
            exports.ClearStyleSafe(panel, "washColor");
        }
    }
    exports.SetWashColorSafe = SetWashColorSafe;

    const QOL_WASH_COLOR_PALETTE = [
        "",
        "#f7f4e8",
        "#bfc7cf",
        "#33363f",
        "#ff3b47",
        "#ff6f61",
        "#ff8a2a",
        "#ffb52e",
        "#ffe45c",
        "#a8f04f",
        "#45d66b",
        "#63f0b5",
        "#24c6a8",
        "#44e3ff",
        "#64bfff",
        "#3f78ff",
        "#6157ff",
        "#9b5cff",
        "#c15cff",
        "#ff4de3",
        "#ff78bd",
        "#ff5d89",
        "#9a6743",
        "#d9a441",
        "#8cff4f",
        "#7c4dff",
        "#b8142f",
        "#b9f4ff",
        "#d7b2ff",
        "#05070a"
    ];
    exports.QOL_WASH_COLOR_PALETTE = QOL_WASH_COLOR_PALETTE;

    function NormalizePaletteColorIndex(value) {
        var numeric = Math.round(Number(value));
        if (!isFinite(numeric)) numeric = 0;
        if (numeric < 0) numeric = 0;
        if (numeric >= QOL_WASH_COLOR_PALETTE.length) numeric = 0;
        return numeric;
    }
    exports.NormalizePaletteColorIndex = NormalizePaletteColorIndex;

    function ResolveWashColorFromPalette(value) {
        var index = NormalizePaletteColorIndex(value);
        var color = QOL_WASH_COLOR_PALETTE[index] || "";
        return color ? String(color) : "";
    }
    exports.ResolveWashColorFromPalette = ResolveWashColorFromPalette;

    function ReadPaletteColorIndexWithPanelAttr(cfg, key, _attrName) {
        return NormalizePaletteColorIndex(cfg && cfg[key]);
    }
    exports.ReadPaletteColorIndexWithPanelAttr = ReadPaletteColorIndexWithPanelAttr;

    function ReadPlayerHealthbarAccentColorIndex(cfg) {
        return ReadPaletteColorIndexWithPanelAttr(cfg, "PLAYER_HEALTHBAR_ACCENT_COLOR");
    }
    exports.ReadPlayerHealthbarAccentColorIndex = ReadPlayerHealthbarAccentColorIndex;

    function ReadBottomBarWashColorIndex(cfg) {
        return ReadPaletteColorIndexWithPanelAttr(cfg, "BOTTOM_BAR_WASH_COLOR");
    }
    exports.ReadBottomBarWashColorIndex = ReadBottomBarWashColorIndex;

    function ReadKeyboardOverlayWashColorIndex(cfg) {
        return ReadPaletteColorIndexWithPanelAttr(cfg, "KEYBOARD_OVERLAY_WASH_COLOR");
    }
    exports.ReadKeyboardOverlayWashColorIndex = ReadKeyboardOverlayWashColorIndex;

    function ReadStaminaChargeColorIndex(cfg) {
        return ReadPaletteColorIndexWithPanelAttr(cfg, "STAMINA_CHARGE_COLOR");
    }
    exports.ReadStaminaChargeColorIndex = ReadStaminaChargeColorIndex;

    function ReadAmmoTextColorIndex(cfg) {
        return ReadPaletteColorIndexWithPanelAttr(cfg, "AMMO_TEXT_COLOR");
    }
    exports.ReadAmmoTextColorIndex = ReadAmmoTextColorIndex;

    function ReadMinimapIconColorIndex(cfg) {
        return ReadPaletteColorIndexWithPanelAttr(cfg, "MINIMAP_ICON_COLOR");
    }
    exports.ReadMinimapIconColorIndex = ReadMinimapIconColorIndex;

    // ---- Export ----

    // Publish to global scope so other scripts can access it
    if (typeof globalThis !== "undefined") {
        globalThis.QOL_UTILS = exports;
    }
    if (typeof window !== "undefined") {
        window.QOL_UTILS = exports;
    }
    // Note: ql_shared_presets.js (loaded after us) attaches QOL_UTILS
    // to the QOL bridge namespace as QOL.utils — see QOL namespace setup.
})();

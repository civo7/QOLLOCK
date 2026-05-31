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
     * Lightweight function call profiler. Call ProfileHit("functionName") at
     * the top of hot functions to count invocations. Every 60 seconds, the
     * top 10 callers are logged to $.Msg.
     *
     * Off by default — call SetProfilerEnabled(true) or set the qol_debug
     * convars to enable. Toggle via: QOL_UTILS.SetProfilerEnabled(true)
     */
    var _profilerEnabled = false;
    var _profilerHits = {};
    var _profilerLastDumpMs = 0;
    var _PROFILER_DUMP_INTERVAL_MS = 60000;
    var _PROFILER_TOP_N = 10;

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

    function IsProfilerEnabled() {
        return _profilerEnabled;
    }
    exports.IsProfilerEnabled = IsProfilerEnabled;

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

        $.Msg("[QOLLock][PROFILE] === Top " + _PROFILER_TOP_N + " called functions (last " +
            Math.round(_PROFILER_DUMP_INTERVAL_MS / 1000) + "s) ===");
        var limit = Math.min(_PROFILER_TOP_N, entries.length);
        for (var i = 0; i < limit; i++) {
            $.Msg("[QOLLock][PROFILE] " + (i + 1) + ". " + entries[i].name +
                " — " + entries[i].count + " calls");
        }
        // Reset counters each cycle so we get per-minute snapshots
        _profilerHits = {};
    }
    exports.DumpProfile = DumpProfile;

    // ---- Export ----

    // Publish to global scope so other scripts can access it
    if (typeof window !== "undefined") {
        window.QOL_UTILS = exports;
    } else if (typeof globalThis !== "undefined") {
        globalThis.QOL_UTILS = exports;
    }
})();

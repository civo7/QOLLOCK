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

    // ---- Export ----

    // Publish to global scope so other scripts can access it
    if (typeof window !== "undefined") {
        window.QOL_UTILS = exports;
    } else if (typeof globalThis !== "undefined") {
        globalThis.QOL_UTILS = exports;
    }
})();

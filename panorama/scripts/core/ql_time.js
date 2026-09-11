// =============================================================================
// QOLLOCK — core/ql_time.js
// =============================================================================
// OWNS:        Time formatting and game clock reading: formatSeconds, readGameTime,
//              parseClockSeconds.
// DOES NOT OWN: Scheduling (core/ql_scheduler.js), Panel caching
// DEPENDS ON:  core/ql_namespace.js, core/ql_panel_helpers.js
// USED BY:     Feature manifests (rejuv, urn, timers, spm)
// LOAD ORDER:  7th — after ql_hud.js
// =============================================================================

(function () {
    "use strict";

    var Q = (typeof globalThis !== "undefined" && globalThis.QOL) ? globalThis.QOL : (typeof QOL !== "undefined" ? QOL : null);
    if (!Q || !Q.core) {
        $.Msg("[QOLLock] core/ql_time: QOL.core not found — aborting.");
        return;
    }

    var _panelHelpers = Q.core.panel || Q.ui.PanelHelpers || {};
    var isAlive = _panelHelpers.isPanelAlive || _panelHelpers.isAlive || function (p) {
        return !!(p && typeof p.IsValid === "function" && p.IsValid());
    };

    /**
     * Format seconds as M:SS (e.g. 65 -> "1:05"). Negative input clamps to 0.
     */
    function formatSeconds(seconds) {
        var totalSeconds = Math.max(0, seconds | 0);
        var minutes = (totalSeconds / 60) | 0;
        var sec = totalSeconds % 60;
        return String(minutes) + ":" + (sec < 10 ? "0" + sec : String(sec));
    }

    var _gameTimeTopBar = null;
    var _gameTimeLabel = null;

    /**
     * Parse the top bar's GameTime label ("MM:SS") into total seconds. Returns 0 on parse failure.
     */
    function readGameTime(topBar) {
        if (!isAlive(topBar)) {
            var hud = Q.core.hud ? Q.core.hud.findHud() : (_panelHelpers.findHud ? _panelHelpers.findHud() : null);
            if (isAlive(hud)) {
                topBar = hud.FindChildTraverse("TopBar");
            }
        }
        if (!isAlive(topBar)) return 0;

        if (!isAlive(_gameTimeLabel) || _gameTimeTopBar !== topBar) {
            _gameTimeTopBar = topBar;
            _gameTimeLabel = topBar.FindChildTraverse("GameTime");
        }
        var label = _gameTimeLabel;
        if (!isAlive(label)) return 0;
        var text = label.text;
        if (typeof text !== "string" || !text) return 0;
        return parseClockSeconds(text);
    }

    /**
     * Parses a string like "12:34" or "1:05" into integer seconds.
     */
    function parseClockSeconds(str) {
        if (!str || typeof str !== "string") return 0;
        var m = str.match(/(\d+):(\d{1,2})/);
        if (!m) return 0;
        var mins = parseInt(m[1], 10) || 0;
        var secs = parseInt(m[2], 10) || 0;
        if (secs > 59) secs %= 60;
        return mins * 60 + secs;
    }

    // Attach to namespace
    Q.core.time = {
        formatSeconds: formatSeconds,
        readGameTime: readGameTime,
        parseClockSeconds: parseClockSeconds
    };

    $.Msg("[QOLLock] core/ql_time: attached to QOL.core.time");
})();

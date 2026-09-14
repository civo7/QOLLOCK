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

(() => {
    "use strict";

    const Q = (typeof globalThis !== "undefined" && globalThis.QOL) ? globalThis.QOL : (typeof QOL !== "undefined" ? QOL : null);
    if (!Q?.core) {
        $.Msg("[QOLLock] core/ql_time: QOL.core not found — aborting.");
        return;
    }

    const panelHelpers = Q.core.panel || Q.ui.PanelHelpers || {};
    const isAlive = panelHelpers.isPanelAlive || panelHelpers.isAlive || ((p) => !!(p && typeof p.IsValid === "function" && p.IsValid()));

    /**
     * Format seconds as M:SS (e.g. 65 -> "1:05"). Negative input clamps to 0.
     */
    const formatSeconds = (seconds) => {
        const totalSeconds = Math.max(0, seconds | 0);
        const minutes = (totalSeconds / 60) | 0;
        const sec = totalSeconds % 60;
        return `${minutes}:${sec < 10 ? `0${sec}` : sec}`;
    };

    let cachedGameTimeTopBar = null;
    let cachedGameTimeLabel = null;

    /**
     * Parse the top bar's GameTime label ("MM:SS") into total seconds. Returns 0 on parse failure.
     */
    const readGameTime = (topBar) => {
        let bar = topBar;
        if (!isAlive(bar)) {
            const hud = Q.core.hud ? Q.core.hud.findHud() : (panelHelpers.findHud ? panelHelpers.findHud() : null);
            if (isAlive(hud)) {
                bar = hud.FindChildTraverse("TopBar");
            }
        }
        if (!isAlive(bar)) return 0;

        if (!isAlive(cachedGameTimeLabel) || cachedGameTimeTopBar !== bar) {
            cachedGameTimeTopBar = bar;
            cachedGameTimeLabel = bar.FindChildTraverse("GameTime");
        }
        const label = cachedGameTimeLabel;
        if (!isAlive(label)) return 0;
        const text = label.text;
        if (typeof text !== "string" || !text) return 0;
        return parseClockSeconds(text);
    };

    /**
     * Parses a string like "12:34" or "1:05" into integer seconds.
     */
    const parseClockSeconds = (str) => {
        if (!str || typeof str !== "string") return 0;
        const m = str.match(/(\d+):(\d{1,2})/);
        if (!m) return 0;
        const mins = parseInt(m[1], 10) || 0;
        let secs = parseInt(m[2], 10) || 0;
        if (secs > 59) secs %= 60;
        return mins * 60 + secs;
    };

    // Attach to namespace
    Q.core.time = {
        formatSeconds,
        readGameTime,
        parseClockSeconds,
        getGameSecondsForUrn: readGameTime
    };

    // Direct backward compat on QOL root
    Q.getGameSecondsForUrn = readGameTime;
    Q.parseClockSeconds = parseClockSeconds;
    Q.formatSeconds = formatSeconds;

    $.Msg("[QOLLock] core/ql_time: attached to QOL.core.time");
})();

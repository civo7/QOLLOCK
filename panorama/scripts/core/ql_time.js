// =============================================================================
// QOLLOCK — core/ql_time.js
// =============================================================================
// OWNS:        Time formatting and game clock reading: formatSeconds, readGameTime,
//              parseClockSeconds.
// DOES NOT OWN: Feature timer state, Panel caching
// DEPENDS ON:  core/ql_namespace.js, core/ql_panel_helpers.js, core/ql_scheduler.js
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

    const panelHelpers = Q.core.panel;
    const isAlive = panelHelpers.isAlive;

    /**
     * Format finite seconds as M:SS. Negative and invalid input clamps to 0.
     */
    const formatSeconds = (seconds) => {
        const numeric = Number(seconds);
        const totalSeconds = Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : 0;
        const minutes = Math.floor(totalSeconds / 60);
        const sec = totalSeconds % 60;
        return `${minutes}:${sec < 10 ? `0${sec}` : sec}`;
    };

    let cachedGameTimeTopBar = null;
    let cachedGameTimeLabel = null;
    let nextGameTimeSearchMs = 0;
    let topBarSearchRoot = null;
    let nextTopBarSearchMs = 0;
    let observedGameTime = null;
    let observationLoop = null;
    const secondListeners = [];

    const isWithin = (panel, ancestor) => {
        let current = panel;
        for (let depth = 0; depth < 64 && isAlive(current); depth++) {
            if (current === ancestor) return true;
            try { current = current.GetParent ? current.GetParent() : null; }
            catch (_) { return false; }
        }
        return false;
    };

    /**
     * Parse the top bar's GameTime label ("MM:SS") into total seconds. Returns 0 on parse failure.
     */
    const readGameTime = (topBar) => {
        const source = isAlive(topBar) ? topBar
            : (Q.core.hud ? Q.core.hud.findHud() : (panelHelpers.findHud ? panelHelpers.findHud() : null));
        if (!isAlive(source)) return 0;
        let bar = source;
        if (source.id !== "TopBar") {
            if (isAlive(cachedGameTimeTopBar) && cachedGameTimeTopBar.id === "TopBar" && isWithin(cachedGameTimeTopBar, source)) {
                bar = cachedGameTimeTopBar;
            } else {
                const now = Date.now ? Date.now() : (new Date()).getTime();
                if (source !== topBarSearchRoot || now >= nextTopBarSearchMs) {
                    topBarSearchRoot = source;
                    bar = source.FindChildTraverse("TopBar") || source;
                    nextTopBarSearchMs = bar === source ? now + 1000 : 0;
                }
            }
        }
        if (!isAlive(bar)) return 0;

        const now = Date.now ? Date.now() : (new Date()).getTime();
        if (!isAlive(cachedGameTimeLabel) && cachedGameTimeTopBar === bar && now < nextGameTimeSearchMs) return 0;
        if (!isAlive(cachedGameTimeLabel) || cachedGameTimeTopBar !== bar || !isWithin(cachedGameTimeLabel, bar)) {
            cachedGameTimeTopBar = bar;
            cachedGameTimeLabel = bar.FindChildTraverse("GameTime");
            nextGameTimeSearchMs = isAlive(cachedGameTimeLabel) ? 0 : now + 1000;
        }
        if (!isAlive(cachedGameTimeLabel) && bar !== source) {
            // During native panel construction the clock can precede TopBar.
            topBarSearchRoot = source;
            nextTopBarSearchMs = (Date.now ? Date.now() : (new Date()).getTime()) + 1000;
            cachedGameTimeTopBar = source;
            cachedGameTimeLabel = source.FindChildTraverse("GameTime");
            nextGameTimeSearchMs = isAlive(cachedGameTimeLabel) ? 0 : now + 1000;
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

    const sampleGameSecond = () => {
        const next = readGameTime();
        if (next === observedGameTime) return;
        observedGameTime = next;
        const listeners = secondListeners.slice();
        for (const entry of listeners) {
            if (secondListeners.indexOf(entry) < 0) continue;
            try { entry.callback(next); }
            catch (e) { $.Msg(`[QOLLock][WARN][GameTime] listener threw: ${e?.message || e}`); }
        }
    };

    const subscribeGameSecond = (callback, priority = 0) => {
        if (typeof callback !== "function") return () => {};
        const entry = { callback, priority: Number(priority) || 0 };
        secondListeners.push(entry);
        secondListeners.sort((a, b) => a.priority - b.priority);
        if (!observationLoop && Q.core.Scheduler?.createPollLoop) {
            observationLoop = Q.core.Scheduler.createPollLoop(sampleGameSecond, 0.1, "ql_game_time");
        }
        return () => {
            const index = secondListeners.indexOf(entry);
            if (index >= 0) secondListeners.splice(index, 1);
            if (secondListeners.length === 0) {
                if (observationLoop) observationLoop.stop();
                observationLoop = null;
                observedGameTime = null;
            }
        };
    };

    const readObservedGameTime = (topBar) => observedGameTime === null ? readGameTime(topBar) : observedGameTime;

    // Attach to namespace
    Q.core.time = {
        formatSeconds,
        readGameTime,
        parseClockSeconds,
        getGameSecondsForUrn: readGameTime,
        readObservedGameTime,
        subscribeGameSecond
    };

    // Direct backward compat on QOL root
    Q.getGameSecondsForUrn = readGameTime;
    Q.parseClockSeconds = parseClockSeconds;
    Q.formatSeconds = formatSeconds;

    $.Msg("[QOLLock] core/ql_time: attached to QOL.core.time");
})();

// OWNS: Native match-clock observation, second subscriptions and pure formatting.
// DOES NOT OWN: Gameplay timer history, configuration or native clock content.
// Native paths: hud.xml HudCore > TopBar; citadel_hud_top_bar.xml GameClock > GameTime.
(() => {
    "use strict";
    const Q = QOL, P = Q.core.panel;
    let resolvers = null, observation = null, observationLoop = null;
    const listeners = [];

    function formatSeconds(seconds) {
        const numeric = Number(seconds), total = Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : 0;
        const minutes = Math.floor(total / 60), remainder = total % 60;
        return `${minutes}:${remainder < 10 ? "0" : ""}${remainder}`;
    }
    function parseClockSeconds(text) {
        if (!text || typeof text !== "string") return 0;
        const match = text.match(/(\d+):(\d{1,2})/);
        if (!match) return 0;
        const minutes = parseInt(match[1], 10) || 0;
        let seconds = parseInt(match[2], 10) || 0;
        if (seconds > 59) seconds %= 60;
        return minutes * 60 + seconds;
    }
    function scope(preferred) { return P.isAlive(preferred) ? preferred : P.findHud($.GetContextPanel()); }
    function discover() {
        // PanelCache loads after core/time; definitions are used after HUD boot.
        if (!resolvers && Q.panelCache) resolvers = {
            top: Q.panelCache.createIdResolver("TopBar", { ownerPath: [{ id: "Hud", optional: true }, { className: "HudCore" }] }),
            clock: Q.panelCache.createIdResolver("GameTime", { ownerPath: [{ className: "GameClock" }] }),
            fallback: Q.panelCache.createIdResolver("GameTime")
        };
        return resolvers;
    }
    function readObservation(preferred) {
        const source = scope(preferred), cache = discover();
        if (!P.isAlive(source) || !cache) return { source, bar: null, label: null, seconds: 0 };
        const bar = source.id === "TopBar" || source.paneltype === "CitadelHudTopBar" ? source : cache.top.resolve(source) || source;
        // Retain a root clock during native construction, then prefer the native
        // TopBar clock as soon as it arrives. Neither path adopts an old live label.
        const label = cache.clock.resolve(bar) || (bar !== source ? cache.fallback.resolve(source) : null);
        let seconds = 0;
        if (P.isAlive(label)) {
            try { seconds = parseClockSeconds(label.text); } catch (_) {}
        }
        return { source, bar, label, seconds };
    }
    const readGameTime = preferred => readObservation(preferred).seconds;

    function sampleGameSecond() {
        const next = readObservation();
        if (observation && next.seconds === observation.seconds && next.source === observation.source &&
            next.bar === observation.bar && next.label === observation.label) return;
        observation = next;
        for (const entry of listeners.slice()) {
            if (!listeners.includes(entry)) continue;
            try { entry.callback(next.seconds); }
            catch (error) { $.Msg(`[QOLLock][WARN][GameTime] listener threw: ${error?.message || error}`); }
        }
    }
    function subscribeGameSecond(callback, priority = 0) {
        if (typeof callback !== "function") return () => {};
        const entry = { callback, priority: Number(priority) || 0 };
        listeners.push(entry); listeners.sort((a, b) => a.priority - b.priority);
        if (!observationLoop) observationLoop = Q.core.Scheduler.createPollLoop(sampleGameSecond, 0.1, "ql_game_time");
        return () => {
            const index = listeners.indexOf(entry);
            if (index >= 0) listeners.splice(index, 1);
            if (!listeners.length) {
                if (observationLoop) observationLoop.stop();
                observationLoop = observation = null;
                if (resolvers) for (const resolver of Object.values(resolvers)) resolver.reset();
            }
        };
    }
    function readObservedGameTime(preferred) {
        const current = scope(preferred);
        return observation && (current === observation.source || current === observation.bar) ? observation.seconds : readGameTime(current);
    }
    Q.core.time = { formatSeconds, parseClockSeconds, readGameTime, readObservedGameTime, subscribeGameSecond,
        getGameSecondsForUrn: readGameTime };
    Object.assign(Q, { getGameSecondsForUrn: readGameTime, parseClockSeconds, formatSeconds });
    $.Msg("[QOLLock] core/ql_time: attached to QOL.core.time");
})();

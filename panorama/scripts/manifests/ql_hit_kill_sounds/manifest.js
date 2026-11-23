// OWNS: Optional hitsound and killsound playback, selected per sound type.
// DOES NOT OWN: Native hit-marker and Damage Impact timing, or the audio assets
// (sounds/hitsounds, sounds/killsounds and soundevents/).
// Hits: element_gun.css shows .show_hit_marker / .show_crit_hit_marker on an ancestor
// of #hit_markers.
// Kills: hud_damage_impact.xml / .css (the game's own files) build each Damage Impact
// popup as a .damageImpactInstance inside HudCore > damage_impact > #damageImpactInfo.
// A kill is .killed; the game shows ASSIST instead when .assist is also set, so your own
// hero kill is .killed without .assist. Crit, heal and crowd control popups are other
// classes, and trooper and neutral kills never use this panel. Neither source has a
// verified event source, so each enabled sound runs one bounded poll and a disabled one
// does no work.
(() => {
    "use strict";
    const P = QOL.core.panel;
    const HIT_EVENTS = ["QOL.Hitsound.Quake3", "QOL.Hitsound.CoD", "QOL.Hitsound.Minecraft", "QOL.Hitsound.Notes", "QOL.Hitsound.Retro", "QOL.Hitsound.Custom"];
    const KILL_EVENTS = ["QOL.Killsound.Quake3", "QOL.Killsound.CoD", "QOL.Killsound.Minecraft", "QOL.Killsound.Note", "QOL.Killsound.Retro", "QOL.Killsound.Custom"];
    const HIT_CLASSES = ["show_hit_marker", "show_crit_hit_marker"];
    const HIT_PATH = ["gameplay_hud", "gameplay_hud_alive", "crosshair", "gun", "gun_data", "hit_markers"];
    const HIT_POLL_SEC = 0.05;
    // The native hit marker stays on while hits keep landing, so fast weapons never
    // switch it off between shots. While it stays on, replay at this interval.
    const HIT_REPEAT_MS = 100;
    const KILL_POLL_SEC = 0.05;
    // A popup must read as a kill, not an assist, for this many polls before it plays, in case
    // the game sets .assist a moment after .killed.
    const KILL_CONFIRM_POLLS = 2;
    // Several popups for one kill play once.
    const KILL_MIN_GAP_MS = 300;
    const REBIND_DELAY_MS = 1000;
    const HIT_CLASS_SEARCH_DEPTH = 5;

    // Every sound has a _V0.._V100 event ladder (10 is unity gain, same scale as the Announcer), like the
    // other audio features; the volume setting picks the rung.
    function eventFor(events, typeValue, volumeValue) {
        const index = Math.round(Number(typeValue));
        const base = events[index >= 0 && index < events.length ? index : 0];
        const volume = QOL.normalizeVoiceVolumeValue ? QOL.normalizeVoiceVolumeValue(volumeValue) : Math.round(Number(volumeValue));
        return `${base}_V${volume}`;
    }

    function playSound(eventName) {
        if (eventName) $.DispatchEvent("PlaySoundEffect", eventName);
    }

    function findHudCore() {
        const root = P.findHud($.GetContextPanel());
        const isHud = P.isAlive(root) && (root.id === "Hud" || root.paneltype === "CitadelHud");
        return isHud ? P.findChildByClass(root, "HudCore") : null;
    }

    // Plays when the native hit marker turns on, then again every HIT_REPEAT_MS for as
    // long as it stays on. Sounds are separate dispatches, so they can overlap.
    function createHitSource(onHit) {
        let host = null, carrier = null, wasShown = false, nextBindMs = 0, lastPlayMs = 0;

        function bind() {
            const now = QOL.utils.PerfNowMs();
            if (now < nextBindMs) return;
            nextBindMs = now + REBIND_DELAY_MS;
            let current = findHudCore();
            for (const id of HIT_PATH) current = P.findChild(current, id);
            host = P.isAlive(current) ? current : null;
            carrier = null;
        }

        function hasHitClass(panel) {
            return HIT_CLASSES.some(name => panel.BHasClass(name));
        }

        // The native class owner is an ancestor of #hit_markers. Remember it
        // once seen so later ticks read a single panel.
        function isShown() {
            if (P.isAlive(carrier)) return hasHitClass(carrier);
            let panel = host;
            for (let depth = 0; depth < HIT_CLASS_SEARCH_DEPTH && P.isAlive(panel); depth++) {
                if (hasHitClass(panel)) { carrier = panel; return true; }
                panel = panel.GetParent();
            }
            return false;
        }

        return {
            poll() {
                if (!P.isAlive(host)) { wasShown = false; bind(); return; }
                const shown = isShown();
                if (shown) {
                    const now = QOL.utils.PerfNowMs();
                    if (!wasShown || now - lastPlayMs >= HIT_REPEAT_MS) {
                        lastPlayMs = now;
                        onHit();
                    }
                }
                wasShown = shown;
            },
            reset() { host = carrier = null; wasShown = false; nextBindMs = 0; lastPlayMs = 0; }
        };
    }

    // Plays once when a Damage Impact popup turns into a kill. Popups already showing when the
    // source binds never play, and a popup that stops being a kill can play again later.
    function createKillSource(onKill) {
        let info = null, baselined = false, nextBindMs = 0, lastPlayMs = -KILL_MIN_GAP_MS;
        const states = new Map();

        function bind() {
            const now = QOL.utils.PerfNowMs();
            if (now < nextBindMs) return;
            nextBindMs = now + REBIND_DELAY_MS;
            const found = P.findChild(P.findChild(findHudCore(), "damage_impact"), "damageImpactInfo");
            info = P.isAlive(found) ? found : null;
            states.clear();
            baselined = false;
        }

        return {
            poll() {
                if (!P.isAlive(info)) { bind(); return; }
                const live = new Set();
                let kill = false;
                for (const popup of info.Children()) {
                    if (!P.isAlive(popup)) continue;
                    live.add(popup);
                    let state = states.get(popup);
                    if (!state) { state = { polls: 0, done: !baselined }; states.set(popup, state); }
                    if (!(popup.BHasClass("killed") && !popup.BHasClass("assist"))) { state.polls = 0; state.done = false; continue; }
                    if (state.done) continue;
                    if (++state.polls >= KILL_CONFIRM_POLLS) { state.done = true; kill = true; }
                }
                for (const known of Array.from(states.keys())) if (!live.has(known)) states.delete(known);
                baselined = true;
                const now = QOL.utils.PerfNowMs();
                if (kill && now - lastPlayMs >= KILL_MIN_GAP_MS) {
                    lastPlayMs = now;
                    onKill();
                }
            },
            reset() { info = null; baselined = false; nextBindMs = 0; lastPlayMs = -KILL_MIN_GAP_MS; states.clear(); }
        };
    }

    QOL.core.FeatureRegistry.register({
        id: "ql_hit_kill_sounds",
        enableKeys: ["ENABLE_HITSOUND", "ENABLE_KILLSOUND"],
        enabledByDefault: false,
        settings: [
            { key: "ENABLE_HITSOUND", type: "toggle" },
            { key: "HITSOUND_TYPE", type: "dropdown", options: QOL.settings.get("HITSOUND_TYPE").options.map(([value]) => value) },
            { key: "HITSOUND_VOLUME", type: "slider" },
            { key: "ENABLE_KILLSOUND", type: "toggle" },
            { key: "KILLSOUND_TYPE", type: "dropdown", options: QOL.settings.get("KILLSOUND_TYPE").options.map(([value]) => value) },
            { key: "KILLSOUND_VOLUME", type: "slider" }
        ],
        create(ctx) {
            const hits = createHitSource(() => playSound(eventFor(HIT_EVENTS, ctx.config.view().HITSOUND_TYPE, ctx.config.view().HITSOUND_VOLUME)));
            const kills = createKillSource(() => playSound(eventFor(KILL_EVENTS, ctx.config.view().KILLSOUND_TYPE, ctx.config.view().KILLSOUND_VOLUME)));
            let running = false, hitLoop = null, killLoop = null;

            // Each sound owns its own loop, so enabling one never runs the other.
            function syncLoop(loop, enabled, source, rateSec) {
                if (enabled && !loop) return QOL.core.Scheduler.createPollLoop(() => source.poll(), rateSec, ctx.id);
                if (!enabled && loop) { loop.stop(); source.reset(); return null; }
                return loop;
            }

            function sync() {
                if (!running) return;
                const cfg = ctx.config.view();
                hitLoop = syncLoop(hitLoop, QOL.utils.IsCfgEnabled(cfg, "ENABLE_HITSOUND"), hits, HIT_POLL_SEC);
                killLoop = syncLoop(killLoop, QOL.utils.IsCfgEnabled(cfg, "ENABLE_KILLSOUND"), kills, KILL_POLL_SEC);
            }

            return {
                onEnable() { running = true; sync(); },
                onSettingsChanged: sync,
                onDisable() {
                    running = false;
                    if (hitLoop) hitLoop.stop();
                    if (killLoop) killLoop.stop();
                    hitLoop = killLoop = null;
                    hits.reset(); kills.reset();
                }
            };
        }
    });
})();

// OWNS: Rejuvenator phase/capture model and QOL topbar objective readouts.
// PUBLISHES: State.rejuvState {running, spawnWaiting, counter} for minimap timers.
// DOES NOT OWN: Native charges/mid-boss feedback or minimap overlay geometry.
// Source paths: citadel_hud_top_bar.xml and the existing native mid_boss tokens.
(() => {
    "use strict";
    const FEATURE_ID = "ql_rejuv_hud";
    const BRIDGE_DURATION = 300, CAPTURE_DURATION = 180;
    const PHASES = [
        { name: "initial", duration: 0, number: "1" },
        { name: "firstCd", duration: 420, number: "2" },
        { name: "secondCd", duration: 360, number: "3" },
        { name: "thirdCd", duration: 300, number: "3" }
    ];
    const OUTPUTS = {
        rejuvHUD: ["RejuvHUD"], rejuvImg: ["Rejuv", "RejuvImg"], rejuvImgHUD: ["RejuvHUD", "RejuvImgHUD"],
        rejuvTime: ["Rejuv", "RejuvTime"], rejuvTimeHUD: ["RejuvHUD", "RejuvTimeHUD"],
        rejuvNum: ["Rejuv", "RejuvNum"], rejuvNumHUD: ["RejuvHUD", "RejuvNumHUD"],
        capture: ["RejuvBuff"], captureTime: ["RejuvBuff", "RejuvTimeBuff"],
        buffHUD: ["BuffHUD"], buffTime: ["Buff", "BuffTime"], buffTimeHUD: ["BuffHUD", "BuffTimeHUD"]
    };
    QOL.core.FeatureRegistry.register({
        id: FEATURE_ID,
        // The producer must run for its minimap consumer without revealing HUD panels.
        enableKeys: ["ENABLE_REJUV_HUD", "ENABLE_BUFF_HUD", "ENABLE_MINIMAP_REJUV_TIMER"],
        enabledByDefault: false,
        settings: [
            { key: "ENABLE_REJUV_HUD", type: "toggle" },
            { key: "ENABLE_BUFF_HUD", type: "toggle" },
            { key: "ENABLE_MINIMAP_REJUV_TIMER", type: "toggle" }
        ],
        create(ctx) {
            const P = QOL.core.panel;
            const time = QOL.core.time;
            const State = QOL.state;
            const makeResolver = (id, ownerPath = [], retryMs = 1000) => QOL.panelCache.createIdResolver(id, { ownerPath, retryMs, refreshMs: 2000 });
            const topResolver = makeResolver("TopBar");
            const legacyTopResolver = makeResolver("CitadelHudTopBar");
            const chargesResolver = makeResolver("RejuvenatorCharges", [{ id: "TopBar", optional: true }]);
            const mapResolvers = ["hud_minimap", "minimap_persp"].map(id => makeResolver(id, [], 10000));
            const outputs = new Map();
            const outputResolvers = new Map(Object.keys(OUTPUTS).map(key => {
                const path = OUTPUTS[key];
                return [key, makeResolver(path[path.length - 1], path.slice(0, -1), 2500)];
            }));
            let active = false, settings = null, root = null, loop = null, unsubscribe = null;
            let chargeOwner = null, mapOwner = null, midBoss = null, nextMidBossSearch = 0;
            let tracker = resetTracker();
            let presentation = null;

            function resetTracker() {
                return { running: false, index: 0, phaseStart: 0, counter: 0, claimCount: 0, spawnWaiting: false,
                    lastCharges: 0, lastFound: false, lastMidBoss: null, nativeBuff: false,
                    buffStart: null, buffCounter: 0, captureMode: "hidden", buffHideAt: 0,
                    nextScan: 0, rotateUntil: 0, lastGameSec: -1, lastSampledMidBoss: null };
            }

            function readSettings() {
                const cfg = ctx.config.view();
                return {
                    enabled: ["ENABLE_REJUV_HUD", "ENABLE_BUFF_HUD", "ENABLE_MINIMAP_REJUV_TIMER"].some(key => Number(cfg[key]) === 1)
                };
            }

            function publish() {
                const next = { running: tracker.running, spawnWaiting: tracker.spawnWaiting, counter: tracker.counter };
                const previous = State.rejuvState;
                if (!previous || Object.keys(next).some(key => previous[key] !== next[key])) State.rejuvState = Object.freeze(next);
            }

            function belongsTo(panel, ancestor) {
                for (let depth = 0; depth < 64 && P.isAlive(panel); depth++) {
                    if (panel === ancestor) return true;
                    panel = panel.GetParent();
                }
                return false;
            }

            function readSources(now) {
                const top = topResolver.resolve(root) || legacyTopResolver.resolve(root);
                const charges = P.isAlive(top) ? chargesResolver.resolve(top) : null;
                if (charges !== chargeOwner) { chargeOwner = charges; tracker.nativeBuff = false; }
                const friendly = P.findChild(charges, "RejuvenatorFriendly");
                const enemy = P.findChild(charges, "RejuvenatorEnemy");
                const timer = P.findChild(charges, "RejuvenatorTimer");
                const chargeCount = P.isAlive(friendly) || P.isAlive(enemy)
                    ? Math.max(QOL.getHighestRejuvChargeTokenOnPanel(friendly), QOL.getHighestRejuvChargeTokenOnPanel(enemy)) : null;
                const nativeBuff = P.isAlive(timer) ? timer.BHasClass("has_rejuv") : null;
                let map = null;
                for (const resolver of mapResolvers) { map = resolver.resolve(root); if (P.isAlive(map)) break; }
                const scope = map || root;
                if (scope !== mapOwner) { mapOwner = scope; midBoss = null; nextMidBossSearch = 0; }
                if (midBoss && (!P.isAlive(midBoss) || !belongsTo(midBoss, scope) ||
                    !midBoss.BHasClass("mid_boss") || !midBoss.BHasClass("map_button"))) { midBoss = null; nextMidBossSearch = 0; }
                if (now >= nextMidBossSearch) {
                    nextMidBossSearch = now + 10000;
                    midBoss = QOL.utils.FindPanelsByClass(scope, "mid_boss").find(panel => P.isAlive(panel) && panel.BHasClass("map_button")) || null;
                }
                const midBossActive = P.isAlive(midBoss) ? midBoss.BHasClass("midboss_spawned") : null;
                return { top, chargeCount, nativeBuff, midBossActive };
            }

            function startPhase(index, gameSec, now) {
                tracker.index = Math.max(0, Math.min(PHASES.length - 1, index));
                tracker.phaseStart = gameSec;
                tracker.counter = PHASES[tracker.index].duration;
                tracker.spawnWaiting = tracker.counter <= 0;
                tracker.lastFound = false;
                tracker.rotateUntil = tracker.spawnWaiting ? 0 : now + 800;
            }

            function startCapture(gameSec) {
                if (tracker.buffStart !== null && tracker.buffCounter > 0) return;
                tracker.buffStart = gameSec; tracker.buffCounter = CAPTURE_DURATION;
                tracker.captureMode = "show"; tracker.buffHideAt = 0;
            }

            function endCapture(now) {
                tracker.buffStart = null; tracker.buffCounter = 0;
                tracker.captureMode = "hide"; tracker.buffHideAt = now + 500;
            }

            function updateTracker(gameSec, now, sources) {
                if (tracker.lastGameSec >= 0 && (gameSec + 5 < tracker.lastGameSec || (tracker.lastGameSec > 30 && gameSec <= 2))) tracker = resetTracker();
                if (!tracker.running) {
                    tracker.running = true;
                    startPhase(0, gameSec, now);
                    tracker.lastCharges = sources.chargeCount || 0;
                    tracker.lastMidBoss = sources.midBossActive;
                    tracker.nextScan = now + 1000;
                }
                tracker.lastGameSec = gameSec;
                if (sources.midBossActive !== null && sources.midBossActive !== tracker.lastSampledMidBoss) {
                    tracker.lastSampledMidBoss = sources.midBossActive;
                    tracker.nextScan = 0;
                }
                if (sources.nativeBuff === true && !tracker.nativeBuff) startCapture(gameSec);
                tracker.nativeBuff = sources.nativeBuff === true;
                const remaining = Math.max(0, PHASES[tracker.index].duration - (gameSec - tracker.phaseStart));
                tracker.counter = remaining;
                tracker.spawnWaiting = remaining <= 0;
                if (tracker.spawnWaiting) tracker.rotateUntil = 0;
                if (tracker.buffStart !== null) {
                    tracker.buffCounter = Math.max(0, CAPTURE_DURATION - (gameSec - tracker.buffStart));
                    // An absent/replaced source is unknown. End early only after
                    // both authoritative native signals explicitly clear.
                    if (tracker.buffCounter <= 0 || (sources.nativeBuff === false && sources.chargeCount === 0)) endCapture(now);
                }
                if (now >= tracker.nextScan) {
                    const found = sources.chargeCount !== null && sources.chargeCount > 0;
                    if ((tracker.lastMidBoss === true && sources.midBossActive === false) ||
                        (tracker.spawnWaiting && found && !tracker.lastFound)) {
                        tracker.claimCount++;
                        startPhase(Math.min(3, tracker.claimCount), gameSec, now);
                    }
                    if (tracker.lastCharges === 0 && found) startCapture(gameSec);
                    if (sources.chargeCount !== null) { tracker.lastFound = found; tracker.lastCharges = sources.chargeCount; }
                    if (sources.midBossActive !== null) tracker.lastMidBoss = sources.midBossActive;
                    tracker.nextScan = now + ((tracker.spawnWaiting || tracker.buffStart !== null) ? 1000 : 3000);
                }
                const bridgeRemaining = BRIDGE_DURATION - (gameSec % BRIDGE_DURATION);
                return {
                    rejuvText: tracker.spawnWaiting ? "Spawn" : time.formatSeconds(tracker.counter),
                    rejuvNumber: PHASES[tracker.index].number,
                    bridgeText: time.formatSeconds(bridgeRemaining), bridgeRemaining,
                    rejuvRemaining: tracker.spawnWaiting ? 0 : tracker.counter,
                    reverse: !tracker.spawnWaiting, white: tracker.spawnWaiting,
                    rotating: tracker.rotateUntil > now,
                    captureText: time.formatSeconds(tracker.buffCounter),
                    captureVisible: tracker.buffStart !== null || tracker.buffHideAt > now,
                    captureMode: tracker.captureMode
                };
            }

            function releaseOutput(key, panel) {
                if (!P.isAlive(panel)) return;
                const classes = key === "capture" ? ["pop-in", "pop-out"]
                    : key.includes("Img") ? ["rotating", "buff", "reverse", "white"]
                        : key === "rejuvHUD" || key === "buffHUD" ? ["red", "yellow"] : [];
                for (const name of classes) P.setClass(panel, name, false);
                if (key === "capture") QOL.utils.SetPanelOpacitySafe(panel, 0, 0);
            }

            function release() {
                for (const [key, panel] of outputs) releaseOutput(key, panel);
                outputs.clear();
                for (const resolver of [...outputResolvers.values(), ...mapResolvers, topResolver, legacyTopResolver, chargesResolver]) resolver.reset();
                chargeOwner = null; mapOwner = null; midBoss = null; nextMidBossSearch = 0;
                presentation = null;
            }

            function resolveOutput(key, top) {
                const panel = outputResolvers.get(key).resolve(top || root);
                const previous = outputs.get(key);
                if (previous !== panel) { releaseOutput(key, previous); outputs.set(key, panel); }
                return panel;
            }

            function writeText(panel, text) { if (P.isAlive(panel) && panel.text !== text) panel.text = text; }
            function warning(panel, remaining) {
                const blink = remaining % 2 === 1;
                P.setClass(panel, "red", remaining < 10 && blink);
                P.setClass(panel, "yellow", remaining >= 10 && remaining < 20 && blink);
            }

            function render(model, top) {
                if (!model) return;
                for (const key of ["rejuvTime", "rejuvTimeHUD"]) writeText(resolveOutput(key, top), model.rejuvText);
                for (const key of ["rejuvNum", "rejuvNumHUD"]) writeText(resolveOutput(key, top), model.rejuvNumber);
                for (const key of ["buffTime", "buffTimeHUD"]) writeText(resolveOutput(key, top), model.bridgeText);
                for (const key of ["rejuvImg", "rejuvImgHUD"]) {
                    const panel = resolveOutput(key, top);
                    P.setClass(panel, "white", model.white);
                    P.setClass(panel, "reverse", model.reverse);
                    P.setClass(panel, "rotating", model.rotating);
                    P.setClass(panel, "buff", false);
                }
                const rejuvHUD = resolveOutput("rejuvHUD", top);
                warning(rejuvHUD, model.rejuvRemaining);
                if (model.white) { P.setClass(rejuvHUD, "red", true); P.setClass(rejuvHUD, "yellow", false); }
                warning(resolveOutput("buffHUD", top), model.bridgeRemaining);
                const capture = resolveOutput("capture", top);
                P.setClass(capture, "pop-out", model.captureMode === "show");
                P.setClass(capture, "pop-in", model.captureMode === "hide");
                QOL.utils.SetStyleIfChanged(capture, "opacity", model.captureVisible ? "1.00" : "0.00");
                writeText(resolveOutput("captureTime", top), model.captureText);
            }

            function update() {
                if (!active || !settings) return;
                const currentRoot = $.GetContextPanel();
                if (currentRoot !== root) { release(); root = currentRoot; tracker = resetTracker(); }
                if (!P.isAlive(root)) return;
                if (!settings.enabled || QOL.core.hud.isInHideout(root) || QOL.isStreetBrawlModeActive(root)) {
                    if (tracker.running || outputs.size) release();
                    tracker = resetTracker(); publish();
                    return;
                }
                const now = QOL.utils.PerfNowMs();
                const sources = readSources(now);
                const gameSec = time.readObservedGameTime(root);
                presentation = updateTracker(gameSec, now, sources);
                publish();
                render(presentation, sources.top);
            }

            function refreshSettings() {
                settings = readSettings();
                QOL.core.hud.refreshRootClasses($.GetContextPanel());
                update();
            }

            return {
                onEnable() {
                    active = true; settings = readSettings();
                    unsubscribe = time.subscribeGameSecond(update, 0);
                    loop = QOL.core.Scheduler.createPollLoop(update, 0.3, FEATURE_ID);
                },
                onSettingsChanged: refreshSettings,
                onDisable() {
                    active = false;
                    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
                    if (loop) { loop.stop(); loop = null; }
                    release(); tracker = resetTracker(); publish();
                    settings = null; root = null;
                }
            };
        },
        test() {
            const root = $.GetContextPanel();
            const top = QOL.core.panel.findTraverse(root, "TopBar") || QOL.core.panel.findTraverse(root, "CitadelHudTopBar");
            if (!top) return null;
            const hud = QOL.core.panel.findTraverse(top, "RejuvHUD");
            return { passed: !!hud, name: "Rejuv HUD panels exist", message: hud ? "" : "RejuvHUD not found",
                assertions: [{ passed: true, name: "CitadelHudTopBar exists" }, { passed: !!hud, name: "RejuvHUD exists" }] };
        }
    });
})();

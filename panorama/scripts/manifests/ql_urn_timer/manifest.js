// OWNS: Rift warning/cooldown model and the QOL RiftTimer overlay.
// DOES NOT OWN: Native capture-point classes, minimap, match clock or topbar.
// Native source IDs/class priority are retained from the existing verified owner.
(() => {
    "use strict";
    const FEATURE_ID = "ql_urn_timer";
    // Game-version-dependent timings, retained from the July 2026 CVar contract.
    const INITIAL_DELAY = 12 * 60 + 20;
    const RESPAWN_INTERVAL = 7 * 60;
    const EARLY_WARNING = 20;
    const SPAWN_JITTER = 60;
    const MAP_IDS = ["hud_minimap", "minimap_persp", "minimap_container", "minimap_frame", "HudMinimapContainer"];

    QOL.core.FeatureRegistry.register({
        id: FEATURE_ID,
        enableKey: "ENABLE_URN_TIMER",
        enabledByDefault: false,
        settings: [{ key: "ENABLE_URN_TIMER", type: "toggle" }],
        create(ctx) {
            const P = QOL.core.panel;
            const time = QOL.core.time;
            const makeResolver = id => QOL.panelCache.createIdResolver(id, { retryMs: 2000, refreshMs: 2000 });
            const mapResolvers = MAP_IDS.map(makeResolver);
            const topResolver = makeResolver("TopBar");
            const legacyTopResolver = makeResolver("CitadelHudTopBar");
            let active = false, enabled = false, loop = null, unsubscribe = null;
            let root = null, overlay = null, label = null, parent = null, nextPanelSearch = 0;
            let state = resetModel();

            function resetModel() {
                return { mode: "idle", accumulator: 0, warningAt: 0, gameSec: -1 };
            }

            function hideOverlay() {
                if (P.isAlive(overlay) && overlay.visible !== false) overlay.visible = false;
            }

            function retireOverlay() {
                hideOverlay();
                if (P.isAlive(overlay)) {
                    for (const mode of ["warning", "active", "idle"]) P.setClass(overlay, "rift_" + mode, false);
                    P.delete(overlay);
                }
            }

            function release() {
                retireOverlay();
                overlay = null; label = null; parent = null; nextPanelSearch = 0;
                for (const resolver of [...mapResolvers, topResolver, legacyTopResolver]) resolver.reset();
            }

            function readSource(currentRoot) {
                let minimap = null;
                for (const resolver of mapResolvers) {
                    minimap = resolver.resolve(currentRoot);
                    if (P.isAlive(minimap)) break;
                }
                if (!P.isAlive(minimap)) return { warning: false, active: false };
                let warning = false, isActive = false;
                for (const button of QOL.utils.FindPanelsByClass(minimap, "map_button")) {
                    if (!P.isAlive(button) || !button.BHasClass("capture_point")) continue;
                    // A warning button wins over an unrelated active capture point.
                    if (button.BHasClass("koth_warning")) warning = true;
                    else if (button.BHasClass("active")) isActive = true;
                }
                return { warning, active: isActive && !warning };
            }

            function deriveModel(gameSec, source) {
                if (state.gameSec >= 0 && (gameSec + 5 < state.gameSec || (state.gameSec > 30 && gameSec <= 2))) state = resetModel();
                state.gameSec = gameSec;
                if (!state.accumulator) {
                    const cycles = Math.max(0, Math.floor((gameSec - INITIAL_DELAY) / RESPAWN_INTERVAL));
                    state.accumulator = INITIAL_DELAY + cycles * RESPAWN_INTERVAL;
                }
                const previousMode = state.mode;
                if (source.warning) {
                    if (previousMode !== "warning") state.warningAt = gameSec;
                    state.mode = "warning";
                } else if (source.active) state.mode = "active";
                else {
                    state.mode = "idle";
                    if (previousMode === "warning" || previousMode === "active") {
                        state.accumulator += RESPAWN_INTERVAL;
                        state.warningAt = 0;
                    } else if (gameSec > state.accumulator + SPAWN_JITTER) state.accumulator += RESPAWN_INTERVAL;
                }
                let text = "ACTIVE";
                if (state.mode === "warning") {
                    const remaining = Math.max(0, EARLY_WARNING - (gameSec - state.warningAt));
                    if (remaining > 0) text = time.formatSeconds(remaining);
                } else if (state.mode === "idle") {
                    const earliest = Math.max(0, state.accumulator - SPAWN_JITTER - gameSec);
                    const latest = Math.max(0, state.accumulator + SPAWN_JITTER - gameSec);
                    text = time.formatSeconds(earliest) + " - " + time.formatSeconds(latest);
                }
                return { mode: state.mode, text };
            }

            function ensureOverlay(currentRoot) {
                const now = QOL.utils.PerfNowMs();
                const top = topResolver.resolve(currentRoot) || legacyTopResolver.resolve(currentRoot);
                let currentParent = P.isAlive(top) ? QOL.utils.FindFirstPanelByClass(top, "TeamNetworth") : null;
                if (!currentParent) currentParent = QOL.utils.FindFirstPanelByClass(currentRoot, "TeamNetworth") || top;
                if (parent !== currentParent || (overlay && (!P.isAlive(overlay) || overlay.GetParent() !== currentParent))) {
                    retireOverlay(); overlay = null; label = null; parent = currentParent; nextPanelSearch = 0;
                }
                if (!P.isAlive(overlay)) {
                    if (now < nextPanelSearch) return false;
                    nextPanelSearch = now + 2000;
                    // This ID is exclusively QOL-created. Retire stale readouts
                    // rather than adopting a generation queued for deletion.
                    const existing = P.findTraverse(currentRoot, "RiftTimer");
                    if (!P.isAlive(currentParent)) return false;
                    if (P.isAlive(existing)) P.delete(existing);
                    overlay = P.create("Panel", currentParent, "RiftTimer", { "class": "RiftTimer", hittest: "false", hittestchildren: "false" });
                    if (!P.isAlive(overlay)) return false;
                }
                let icon = P.findChild(overlay, "RiftTimerRiftIcon");
                if (!icon) icon = P.create("Panel", overlay, "RiftTimerRiftIcon", { "class": "RiftTimerRiftIcon", hittest: "false" });
                label = P.findChild(overlay, "RiftTimerLabel") || P.create("Label", overlay, "RiftTimerLabel", { "class": "RiftTimerLabel" });
                return P.isAlive(icon) && P.isAlive(label);
            }

            function render(model) {
                if (label.text !== model.text) label.text = model.text;
                for (const mode of ["warning", "active", "idle"]) P.setClass(overlay, "rift_" + mode, model.mode === mode);
                if (overlay.visible !== true) overlay.visible = true;
            }

            function update() {
                if (!active) return;
                const currentRoot = $.GetContextPanel();
                if (currentRoot !== root) { release(); root = currentRoot; state = resetModel(); }
                if (!P.isAlive(root)) return;
                if (!enabled || QOL.core.hud.isInHideout(root)) {
                    hideOverlay(); state = resetModel();
                    for (const resolver of mapResolvers) resolver.reset();
                    return;
                }
                const gameSec = time.readObservedGameTime(root);
                if (gameSec <= 0) { hideOverlay(); return; }
                const model = deriveModel(gameSec, readSource(root));
                if (ensureOverlay(root)) render(model);
            }

            function refreshSettings() {
                enabled = Number(ctx.config.view().ENABLE_URN_TIMER) === 1;
                update();
            }

            return {
                onEnable() {
                    active = true;
                    enabled = Number(ctx.config.view().ENABLE_URN_TIMER) === 1;
                    unsubscribe = time.subscribeGameSecond(update, 1);
                    loop = QOL.core.Scheduler.createPollLoop(update, 0.5, FEATURE_ID);
                },
                onSettingsChanged: refreshSettings,
                onDisable() {
                    active = false;
                    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
                    if (loop) { loop.stop(); loop = null; }
                    release(); root = null; state = resetModel();
                }
            };
        },
        test() {
            const top = QOL.core.panel.findTraverse($.GetContextPanel(), "TopBar");
            if (!top) return null;
            return { passed: true, name: "Urn timer top bar panel exists", message: "", assertions: [{ passed: true, name: "TopBar panel exists" }] };
        }
    });
})();

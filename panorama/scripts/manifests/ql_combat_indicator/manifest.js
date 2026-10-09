// OWNS: Healthbar combat-indicator classes and private recovery history.
// DOES NOT OWN: Native combat evidence, text status/timer, health values or geometry.
// Sources: hud.xml HudCore > gameplay_hud > health_and_abilities_container;
// hud_health_container.xml HealthBarContent, HealthRegenAndTotal, hud_health_bars.
(() => {
    "use strict";
    QOL.core.FeatureRegistry.register({
        id: "ql_combat_indicator",
        enableKey: "ENABLE_COMBAT_INDICATOR",
        enabledByDefault: false,
        settings: [{ key: "ENABLE_COMBAT_INDICATOR", type: "toggle" }],
        create(ctx) {
            const P = QOL.core.panel, classes = ["combat_indicator_enabled", "combat_indicator_active"];
            const gameplayResolver = QOL.panelCache.createIdResolver("gameplay_hud", {
                ownerPath: [{ id: "Hud", optional: true }, { className: "HudCore" }]
            });
            const healthResolver = QOL.panelCache.createIdResolver("health_and_abilities_container", {
                ownerPath: [{ id: "Hud", optional: true }, { className: "HudCore" }, "gameplay_hud"]
            });
            const owned = new Set(), retired = new Set();
            let running = false, enabled = false, root = null, loop = null, lastCombatMs = null;
            function retire(panel) { if (P.isAlive(panel)) retired.add(panel); owned.delete(panel); }
            function releaseRetired() {
                for (const panel of retired) {
                    if (!P.isAlive(panel)) { retired.delete(panel); continue; }
                    for (const name of classes) P.setClass(panel, name, false);
                    try { if (classes.every(name => !panel.BHasClass(name))) retired.delete(panel); } catch (_) {}
                }
            }
            function release() {
                for (const panel of owned) retire(panel);
                releaseRetired(); gameplayResolver.reset(); healthResolver.reset(); root = null; lastCombatMs = null;
            }
            function update() {
                if (!running) return;
                const nextRoot = P.findHud($.GetContextPanel());
                if (root !== nextRoot) { release(); root = nextRoot; }
                if (!enabled || !P.isAlive(root) || (root.id !== "Hud" && root.paneltype !== "CitadelHud")) { release(); return; }
                const gameplay = gameplayResolver.resolve(root), health = healthResolver.resolve(root);
                const targets = new Set([root, gameplay, health].filter(P.isAlive));
                for (const id of ["HealthBarContent", "HealthRegenAndTotal", "hud_health_bars"]) {
                    const panel = P.findTraverse(health, id); if (P.isAlive(panel)) targets.add(panel);
                }
                for (const panel of owned) if (!targets.has(panel)) retire(panel);
                releaseRetired();
                const now = QOL.utils.PerfNowMs(), signal = QOL.core.hud.isCombatSignalActive(root);
                if (signal) lastCombatMs = now;
                const active = signal || (lastCombatMs !== null && now - lastCombatMs <= 3000);
                for (const panel of targets) {
                    owned.add(panel); P.setClass(panel, classes[0], true); P.setClass(panel, classes[1], active);
                }
            }
            function refresh() { enabled = QOL.utils.IsCfgEnabled(ctx.config.view(), "ENABLE_COMBAT_INDICATOR"); update(); }
            return {
                onEnable() { running = true; refresh(); loop = QOL.core.Scheduler.createPollLoop(update, 0.25, ctx.id); },
                onSettingsChanged: refresh,
                onDisable() { running = enabled = false; if (loop) loop.stop(); loop = null; release(); }
            };
        }
    });
})();

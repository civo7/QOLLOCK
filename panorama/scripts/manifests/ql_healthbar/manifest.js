// OWNS: Healthbar settings model, variant routing and native lifetime discovery.
// DOES NOT OWN: Root CSS projection, game health bindings or native child animations.
(() => {
    "use strict";
    const H = QOL.healthbar;
    const P = QOL.core.panel;
    QOL.core.FeatureRegistry.register({
        id: "ql_healthbar",
        enabledByDefault: true,
        settings: [
            { key: "HEALTHBAR_TYPE", type: "dropdown", options: [0, 1, 2, 3, 4, 5] },
            { key: "ENABLE_MINECRAFT_HEALTH_NUMBERS", type: "toggle", label: "Health Numbers", description: "Show current / max HP numbers over the Minecraft hearts." },
            { key: "PLAYER_HEALTHBAR_SCALE", type: "slider" },
            { key: "PLAYER_HEALTHBAR_OPACITY", type: "slider" },
            { key: "PLAYER_HEALTHBAR_X_OFFSET", type: "slider" },
            { key: "PLAYER_HEALTHBAR_Y_OFFSET", type: "slider" },
            { key: "PLAYER_HEALTHBAR_ACCENT_COLOR", type: "palette" },
            // Retained preset offsets and shared warning policy are real inputs
            // of these variants and must be in their ConfigStore slice.
            { key: "MINIMALIST_HEALTHBAR_X_OFFSET", type: "slider" },
            { key: "MINIMALIST_HEALTHBAR_Y_OFFSET", type: "slider" },
            { key: "ENABLE_COLORED_HEALTHBAR", type: "toggle" },
            { key: "ENABLE_COLOR_WARNING_25", type: "toggle" },
            { key: "ENABLE_COLOR_WARNING_65", type: "toggle" },
            { key: "ENABLE_COLOR_WARNING_75", type: "toggle" }
        ],
        create(ctx) {
            const accent = H.accent.create(ctx);
            const shared = H.minimalist.create({ id: ctx.id, accent });
            const budhud = H.budhud.create(ctx);
            const fg = H.fg.create(ctx);
            const mc = H.mc.create(ctx);
            const owners = [shared, accent, budhud, fg, mc];
            let model = null, loop = null;

            function readModel() {
                const cfg = { ...ctx.config.view() };
                const type = Number(cfg.HEALTHBAR_TYPE) || 0;
                return { cfg, type };
            }

            function update() {
                const root = $.GetContextPanel();
                if (!P.isAlive(root) || !model) return;
                const now = QOL.utils.PerfNowMs();
                const hideout = QOL.core.hud.isInHideout(root);
                shared.update(root, model.cfg, model.type === 1);
                fg.update(root, model.cfg);
                if (hideout) {
                    if (budhud.isActive()) budhud.release();
                    if (mc.isActive()) mc.release();
                } else {
                    budhud.update(root, model.cfg, model.type, now);
                    mc.update(root, model.cfg, now, model.type === 5);
                }
                // rate-exempt: animated Minecraft hearts require 20Hz; FG keeps
                // the existing live hero refresh cadence, Budhud renders at 10Hz.
                if (loop) loop.reschedule(hideout || model.type === 0 || model.type === 1 || model.type === 3 ? 0.5 : 0.05);
            }

            function refreshSettings() {
                model = readModel();
                QOL.core.hud.refreshRootClasses($.GetContextPanel());
                update();
            }

            function release() {
                let error = null;
                // A failure in one variant must not prevent the others' cleanup.
                for (const owner of owners) {
                    try { owner.release(); } catch (failure) { if (!error) error = failure; }
                }
                model = null;
                if (error) throw error;
            }

            return {
                onEnable() {
                    refreshSettings();
                    // rate-exempt: 20Hz for the animated variants; update reduces
                    // the cadence once the initial native state has been observed.
                    loop = QOL.core.Scheduler.createPollLoop(update, 0.05, ctx.id);
                },
                onSettingsChanged: refreshSettings,
                onDisable() {
                    if (loop) { loop.stop(); loop = null; }
                    release();
                }
            };
        },
        test() {
            const container = P.findTraverse($.GetContextPanel(), "health_and_abilities_container");
            return { passed: !!container, name: "Healthbar container panel exists",
                message: container ? "" : "health_and_abilities_container not found",
                assertions: [{ passed: !!container, name: "health_and_abilities_container panel exists" }] };
        }
    });
})();

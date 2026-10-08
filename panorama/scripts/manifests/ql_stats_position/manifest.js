// OWNS: Nondefault x/y offsets and conditional opacity of the visible native stats owner.
// DOES NOT OWN: Native stats layout, content or child transforms.
// Source: hud.xml, Hud > .HudCore > hudActivePlayerStats;
// legacy owner: .HudCore > StatsAndModsContainer > LowerLeft > hudPlayerStats.
(() => {
    "use strict";
    const Q = QOL;
    const P = Q.core.panel;
    Q.core.FeatureRegistry.register({
        id: "ql_stats_position", enabledByDefault: true, enableKey: "ENABLE_STATS_POSITION",
        settings: [
            { key: "ENABLE_STATS_POSITION", type: "toggle", default: true },
            // Compatibility-only field: retain old configs without changing native docking.
            { key: "STATS_POSITION_SIDE", type: "buttongroup", default: 0 },
            { key: "STATS_POSITION_X_OFFSET", type: "slider", min: -2000, max: 2000, step: 1, default: 0 },
            { key: "STATS_POSITION_Y_OFFSET", type: "slider", min: -2000, max: 2000, step: 1, default: 0 },
            { key: "STATS_POSITION_HIDE_NORMAL", type: "toggle", default: false },
            { key: "STATS_POSITION_HIDE_SCOREBOARD", type: "toggle", default: false }
        ],
        create(ctx) {
            const path = [{ id: "Hud", optional: true }, { className: "HudCore" }];
            const active = Q.panelCache.createIdResolver("hudActivePlayerStats", { ownerPath: path });
            const legacy = Q.panelCache.createIdResolver("hudPlayerStats", { ownerPath: [...path, "StatsAndModsContainer", "LowerLeft"] });
            const applied = new Set();
            let panel = null, signature = null, model = null, loop = null;
            function clear(target, property) {
                if (!applied.has(property) || !P.isAlive(target)) return;
                if (property === "x" || property === "y") target.style[property] = "0px";
                Q.utils.ClearStyleSafe(target, property);
                applied.delete(property);
            }
            function release() {
                for (const property of applied) clear(panel, property);
                applied.clear();
                signature = null;
            }
            function readModel() {
                const cfg = ctx.config.view();
                return {
                    x: QOL_UTILS.ClampConfigNumber(cfg.STATS_POSITION_X_OFFSET, 0, -2000, 2000, true),
                    y: QOL_UTILS.ClampConfigNumber(cfg.STATS_POSITION_Y_OFFSET, 0, -2000, 2000, true),
                    hideNormal: cfg.STATS_POSITION_HIDE_NORMAL === true || Number(cfg.STATS_POSITION_HIDE_NORMAL) === 1,
                    hideScoreboard: cfg.STATS_POSITION_HIDE_SCOREBOARD === true || Number(cfg.STATS_POSITION_HIDE_SCOREBOARD) === 1
                };
            }
            function update() {
                const root = Q.core.hud.findHud();
                const current = Q.presentation.chooseStatsPanel(legacy.resolve(root), active.resolve(root));
                if (current !== panel) { release(); panel = current; }
                if (!P.isAlive(panel)) return;
                const hidden = Q.core.hud.isScoreboardOpen(root) ? model.hideScoreboard : model.hideNormal;
                const styles = {};
                if (model.x) styles.x = model.x + "px";
                if (model.y) styles.y = -model.y + "px";
                if (hidden) styles.opacity = "0";
                for (const property of applied) {
                    if (!Object.prototype.hasOwnProperty.call(styles, property)) { clear(panel, property); signature = null; }
                }
                for (const property of Object.keys(styles)) applied.add(property);
                signature = P.syncStyles(panel, styles, signature).sig;
            }
            function refreshSettings() {
                model = readModel(); signature = null;
                active.reset(); legacy.reset(); update();
            }
            return {
                onEnable() {
                    refreshSettings();
                    ctx.events.on("engine:scoreboard_toggle", update);
                    loop = Q.core.Scheduler.createPollLoop(update, 1.0, ctx.id);
                },
                onSettingsChanged: refreshSettings,
                onDisable() {
                    ctx.events.off("engine:scoreboard_toggle", update);
                    if (loop) loop.stop();
                    loop = null; release(); panel = null; model = null;
                    active.reset(); legacy.reset();
                }
            };
        },
        test() {
            const root = Q.core.hud.findHud();
            const panel = Q.presentation.chooseStatsPanel(P.findTraverse(root, "hudPlayerStats"), P.findTraverse(root, "hudActivePlayerStats"));
            return { passed: !!panel, name: "Player stats panel exists", message: panel ? "" : "Native player stats owner not found",
                assertions: [{ passed: !!panel, name: "Native player stats owner exists" }] };
        }
    });
})();

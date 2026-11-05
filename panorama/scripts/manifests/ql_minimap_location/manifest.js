// OWNS: Native minimap district/building label offsets, scale and visibility.
// DOES NOT OWN: Location content, rotation or the minimap viewport.
// Source: hud.xml and October 3 Debugger capture: gameplay_hud >
// .clamp_width > minimap_persp > minimap_location.
(() => {
    "use strict";
    QOL.core.FeatureRegistry.register({
        id: "ql_minimap_location",
        enabledByDefault: true,
        settings: [
            { key: "ENABLE_MINIMAP_LOCATION", type: "toggle" },
            { key: "MINIMAP_LOCATION_X_OFFSET", type: "slider" },
            { key: "MINIMAP_LOCATION_Y_OFFSET", type: "slider" },
            { key: "MINIMAP_LOCATION_SCALE", type: "slider" }
        ],
        create(ctx) {
            const P = QOL.core.panel;
            const element = QOL.presentation.elements.find(item => item.id === "minimapLocation");
            const owned = P.createNativeStyleOwner({ resetValues: { x: "0px", y: "0px" } });
            let styles = null, loop = null, active = false;

            function update() {
                if (!active) return;
                // At defaults native CSS owns the label, including its district
                // visibility gate. Do not force a location outside a district.
                if (!styles) { owned.retain([]); return; }
                const root = P.findHud($.GetContextPanel());
                const panel = P.isAlive(root) && (root.id === "Hud" || root.paneltype === "CitadelHud") ? QOL.presentation.resolve(element, root) : null;
                owned.retain(panel ? [panel] : []);
                if (panel) owned.apply(panel, styles);
            }

            function refreshSettings() {
                if (!active) return;
                const cfg = ctx.config.view();
                const x = QOL.settings.readNumber("MINIMAP_LOCATION_X_OFFSET", cfg.MINIMAP_LOCATION_X_OFFSET);
                const y = QOL.settings.readNumber("MINIMAP_LOCATION_Y_OFFSET", cfg.MINIMAP_LOCATION_Y_OFFSET);
                const scale = QOL.settings.readNumber("MINIMAP_LOCATION_SCALE", cfg.MINIMAP_LOCATION_SCALE);
                const next = {};
                if (x !== 0) next.x = x + "px";
                if (y !== 0) next.y = -y + "px";
                if (scale !== 100) next.uiScale = scale + "%";
                if (Number(cfg.ENABLE_MINIMAP_LOCATION) !== 1) next.visibility = "collapse";
                styles = Object.keys(next).length ? next : null;
                update();
                if (styles && !loop) loop = QOL.core.Scheduler.createPollLoop(update, 1, ctx.id);
                else if (!styles && loop) { loop.stop(); loop = null; }
            }

            return {
                onEnable() {
                    active = true;
                    refreshSettings();
                },
                onSettingsChanged: refreshSettings,
                onDisable() {
                    active = false;
                    if (loop) { loop.stop(); loop = null; }
                    owned.clear();
                    styles = null;
                }
            };
        }
    });
})();

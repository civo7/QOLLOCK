// OWNS: Native chat visibility, offsets and scale. Image/translation consumers own message children.
// Source: hud.xml, Hud > .HudCore > Chat; chat.css retains native input and message transforms.
(() => {
    "use strict";
    QOL.core.FeatureRegistry.register({
        id: "ql_chat_geometry", enabledByDefault: true,
        settings: [
            ...QOL.presentation.stateSettings("ql_chat_geometry"),
            { key: "ENABLE_CHAT", type: "toggle" },
            { key: "CHAT_SCALE", type: "slider", label: "Size", description: "Adjust size of the in-game chat." },
            { key: "CHAT_X_OFFSET", type: "slider", label: "Horizontal Offset", description: "Adjust horizontal position of the in-game chat." },
            { key: "CHAT_Y_OFFSET", type: "slider", label: "Vertical Offset", description: "Adjust vertical position of the in-game chat." }
        ],
        create(ctx) {
            const P = QOL.core.panel;
            const styles = P.createNativeStyleOwner({ resetValues: { x: "0px", y: "0px", uiScale: "100%" }, releasePosition: true });
            let model = null, loop = null, enabled = false;
            function readModel() {
                const cfg = QOL.presentation.captureVisibility(ctx, ctx.config.view()), styles = {};
                const shown = cfg.ENABLE_CHAT === undefined || Number(cfg.ENABLE_CHAT) === 1;
                const x = QOL.settings.readNumber("CHAT_X_OFFSET", cfg.CHAT_X_OFFSET);
                const y = QOL.settings.readNumber("CHAT_Y_OFFSET", cfg.CHAT_Y_OFFSET);
                const scale = QOL.settings.readNumber("CHAT_SCALE", cfg.CHAT_SCALE);
                if (!shown) styles.visibility = "collapse";
                else {
                    if (x) styles.x = x + "px";
                    if (y) styles.y = -y + "px";
                    if (scale !== 100) styles.uiScale = scale + "%";
                }
                return styles;
            }
            function update() {
                if (!enabled) return;
                const root = P.findHud($.GetContextPanel());
                const core = P.isAlive(root) && (root.id === "Hud" || root.paneltype === "CitadelHud") ? P.findChildByClass(root, "HudCore") : null;
                const panel = P.findChild(core, "Chat");
                styles.retain(panel ? [panel] : []);
                if (panel) styles.apply(panel, QOL.presentation.visibilityStyles("chat", QOL.presentation.visibilityConfig(ctx), root, model));
            }
            function refresh() {
                if (!enabled) return;
                model = readModel();
                update();
            }
            return QOL.presentation.bindVisibility(ctx, {
                // No native replacement/overwrite notification is verified for Chat.
                onEnable() { enabled = true; refresh(); loop = QOL.core.Scheduler.createPollLoop(update, 0.5, ctx.id); },
                onSettingsChanged: refresh,
                onDisable() {
                    enabled = false; if (loop) loop.stop(); loop = null;
                    styles.clear(); model = null;
                }
            }, update);
        },
        test() {
            const panel = QOL.core.panel.findTraverse(QOL.core.panel.findHud($.GetContextPanel()), "Chat");
            return panel ? { passed: true, name: "Native chat panel exists", message: "Observed current chat owner" } : null;
        }
    });
})();

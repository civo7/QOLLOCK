// OWNS: Native chat visibility, offsets and scale. Image/translation consumers own message children.
// Source: hud.xml, Hud > .HudCore > Chat; chat.css retains native input and message transforms.
(() => {
    "use strict";
    QOL.core.FeatureRegistry.register({
        id: "ql_chat_geometry", enabledByDefault: true,
        settings: [
            { key: "ENABLE_CHAT", type: "toggle" },
            { key: "CHAT_SCALE", type: "slider", label: "Size", description: "Adjust size of the in-game chat." },
            { key: "CHAT_X_OFFSET", type: "slider", label: "Horizontal Offset", description: "Adjust horizontal position of the in-game chat." },
            { key: "CHAT_Y_OFFSET", type: "slider", label: "Vertical Offset", description: "Adjust vertical position of the in-game chat." }
        ],
        create(ctx) {
            const P = QOL.core.panel, U = QOL.utils;
            const resolver = QOL.panelCache.createIdResolver("Chat", { retryMs: 500,
                ownerPath: [{ id: "Hud", optional: true }, { className: "HudCore" }] });
            let panel = null, model = null, signature = null, loop = null, enabled = false;
            let owned = new Set();
            const retired = new Map();
            function readModel() {
                const cfg = ctx.config.view(), styles = {};
                const shown = cfg.ENABLE_CHAT === undefined || Number(cfg.ENABLE_CHAT) === 1;
                const x = U.ClampConfigNumber(cfg.CHAT_X_OFFSET, 0, -1500, 1500, true);
                const y = U.ClampConfigNumber(cfg.CHAT_Y_OFFSET, 0, -250, 800, true);
                const scale = U.ClampConfigNumber(cfg.CHAT_SCALE, 100, 50, 200, true);
                if (!shown) styles.visibility = "collapse";
                else {
                    if (x) styles.x = x + "px";
                    if (y) styles.y = -y + "px";
                    if (scale !== 100) styles.uiScale = scale + "%";
                }
                return styles;
            }
            function releaseProperty(target, properties, key) {
                if (!properties.has(key)) return;
                if (!P.isAlive(target)) { properties.delete(key); return; }
                // Resolved native offsets can retain code values after clear.
                // Touch only properties this instance actually attempted to own.
                try {
                    if (key === "x" || key === "y") target.style[key] = "0px";
                    if (key === "uiScale") target.style.uiScale = "100%";
                    if (P.clearStyleProperty(target, key)) properties.delete(key);
                } catch (_) { /* keep attempted ownership for the next observation */ }
            }
            function releaseRetired() {
                for (const [target, properties] of retired) {
                    for (const key of [...properties]) releaseProperty(target, properties, key);
                    if (!properties.size) retired.delete(target);
                }
            }
            function retire() {
                if (panel && owned.size) retired.set(panel, owned);
                owned = new Set(); panel = null; signature = null;
                releaseRetired();
            }
            function update() {
                if (!enabled) return;
                releaseRetired();
                const next = resolver.resolve(P.findHud($.GetContextPanel()));
                if (next !== panel) {
                    retire(); panel = next;
                    if (retired.has(next)) { owned = retired.get(next); retired.delete(next); }
                }
                if (!P.isAlive(panel)) return;
                for (const key of [...owned]) if (!(key in model)) releaseProperty(panel, owned, key);
                if (signature !== null) return;
                for (const key of Object.keys(model)) owned.add(key);
                signature = P.syncStyles(panel, model, signature).sig;
            }
            function refresh() { model = readModel(); signature = null; if (enabled) update(); }
            return {
                onEnable() { enabled = true; refresh(); loop = QOL.core.Scheduler.createPollLoop(update, 0.5, ctx.id); },
                onSettingsChanged: refresh,
                onDisable() {
                    enabled = false; if (loop) loop.stop(); loop = null;
                    retire(); releaseRetired(); resolver.reset(); model = null;
                }
            };
        },
        test() {
            const panel = QOL.core.panel.findTraverse(QOL.core.panel.findHud($.GetContextPanel()), "Chat");
            return panel ? { passed: true, name: "Native chat panel exists", message: "Observed current chat owner" } : null;
        }
    });
})();

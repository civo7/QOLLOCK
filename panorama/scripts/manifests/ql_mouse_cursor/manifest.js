// OWNS: Custom gameplay cursor presentation, source binding and native-cursor fallback.
// DOES NOT OWN: Native cursor coordinates, menu state or shared runtime state.
(() => {
    "use strict";
    const Q = QOL, P = Q.core.panel;
    const imagePath = "s2r://panorama/images/hud/abilities/punkgoat/goat_sigilslam_psd.vtex";
    const halfSize = 27;

    Q.core.FeatureRegistry.register({
        id: "ql_mouse_cursor",
        enabledByDefault: false,
        settings: [],
        create(ctx) {
            const loaderResolver = Q.panelCache.createIdResolver("StartupLoader");
            const escapeResolver = Q.panelCache.createIdResolver("EscapeMenu");
            let rootOwner = null, overlay = null, image = null, imageBound = false, signature = null, loop = null;

            const readContext = root => {
                if (Q.core.hud.isInHideout(root) || loaderResolver.resolve(root)?.BHasClass("Active")) return false;
                if (["gShopOpen", "gAbilityUpgradeMenu", "gDetailView"].some(name => root.BHasClass(name)) ||
                    Q.core.hud.isScoreboardOpen(root)) return true;
                const escape = escapeResolver.resolve(root);
                return P.isAlive(escape) && escape.visible !== false && escape.style.visibility !== "collapse";
            };
            const hide = () => {
                P.setClass(rootOwner, "qol_custom_cursor_replace_active", false);
                P.setClass(overlay, "qol-hidden", true);
                signature = null;
            };
            const release = () => {
                hide();
                P.delete(overlay);
                rootOwner = overlay = image = null;
                imageBound = false;
                signature = null;
                loaderResolver.reset();
                escapeResolver.reset();
            };
            const ensureOverlay = root => {
                const current = P.findChild(root, "QOLGameplayMouseCursor");
                if (current !== overlay || !P.isAlive(overlay)) {
                    P.delete(overlay);
                    overlay = current || P.create("Panel", root, "QOLGameplayMouseCursor", { hittest: "false", hittestchildren: "false" });
                    image = null;
                    imageBound = false;
                    signature = null;
                    if (P.isAlive(overlay)) {
                        overlay.hittest = false;
                        overlay.hittestchildren = false;
                    }
                }
                if (!P.isAlive(overlay)) return false;
                P.setClass(overlay, "QOLGameplayMouseCursor", true);
                const child = P.findChild(overlay, "QOLGameplayMouseCursorImage");
                if (child !== image || !P.isAlive(image)) {
                    image = child || P.create("Image", overlay, "QOLGameplayMouseCursorImage");
                    imageBound = false;
                }
                if (!P.isAlive(image)) return false;
                P.setClass(image, "QOLGameplayMouseCursorImage", true);
                if (!imageBound) {
                    try { image.SetImage(imagePath); }
                    catch (_) { image.SetImage(imagePath + "_c"); }
                    imageBound = true;
                }
                return true;
            };
            const update = () => {
                try {
                const root = $.GetContextPanel();
                if (root !== rootOwner) { release(); rootOwner = root; }
                if (!P.isAlive(root) || !readContext(root) || typeof GameUI === "undefined" ||
                    typeof GameUI.GetCursorPosition !== "function") { hide(); return; }
                const position = GameUI.GetCursorPosition();
                if (!Number.isFinite(position?.x) || !Number.isFinite(position?.y)) { hide(); return; }
                if (!ensureOverlay(root)) { hide(); return; }
                signature = P.syncStyles(overlay, {
                    x: Math.round(position.x - halfSize) + "px",
                    y: Math.round(position.y - halfSize) + "px"
                }, signature).sig;
                if (signature === null) { hide(); return; }
                P.setClass(overlay, "qol-hidden", false);
                P.setClass(root, "qol_custom_cursor_replace_active", true);
                } catch (error) {
                    hide();
                    throw error;
                }
            };
            return {
                onEnable() {
                    // rate-exempt: 20Hz cursor tracking uses native pointer coordinates.
                    loop = Q.core.Scheduler.createPollLoop(update, 0.05, ctx.id || "ql_mouse_cursor");
                },
                onSettingsChanged: update,
                onDisable() {
                    if (loop) loop.stop();
                    loop = null;
                    release();
                }
            };
        },
        test() {
            const loader = P.findTraverse($.GetContextPanel(), "StartupLoader");
            if (!loader) return null;
            return { passed: true, name: "Startup loader panel exists", message: "",
                assertions: [{ passed: true, name: "StartupLoader panel exists" }] };
        }
    });
})();

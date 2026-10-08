// OWNS: Unsecured amount/icon/text mirror and component-size presentation.
// DOES NOT OWN: Native soul labels, their feedback classes or decay tracking.
// Offsets retain their established convention: X right, Y down from the saved native baseline.
(() => {
    "use strict";
    const SEARCH_MS = 2000;
    QOL.core.FeatureRegistry.register({
        id: "ql_better_unsecured_hud",
        enableKey: "ENABLE_BETTER_UNSECURED",
        enabledByDefault: false,
        settings: [
            { key: "ENABLE_BETTER_UNSECURED", type: "toggle", default: false },
            { key: "UNSECURED_SOULS_HUD_SCALE", type: "slider", min: 50, max: 200, default: 100 },
            { key: "UNSECURED_SOULS_HUD_X_OFFSET", type: "slider", min: -1000, max: 2000, default: 0 },
            { key: "UNSECURED_SOULS_HUD_Y_OFFSET", type: "slider", min: 800, max: 2000, default: 1095 },
            { key: "ENABLE_BETTER_UNSECURED_SHOW_ICON", type: "toggle", default: true },
            { key: "ENABLE_BETTER_UNSECURED_SHOW_TEXT", type: "toggle", default: false },
            { key: "ENABLE_BETTER_UNSECURED_SHOW_ICON_TEXT", type: "toggle", default: false }
        ],
        create(ctx) {
            const P = QOL.core.panel;
            const goldResolver = QOL.panelCache.createIdResolver("gold_and_ap_container", { retryMs: SEARCH_MS });
            const amountResolver = QOL.panelCache.createIdResolver("hudDeathGoldLabel", { retryMs: SEARCH_MS });
            const rootAmountResolver = QOL.panelCache.createIdResolver("hudDeathGoldLabel", { retryMs: SEARCH_MS });
            let loop = null, rootOwner = null, model = null, overlay = null, signature = null;
            let container = null, source = null, mirror = null, icon = null, text = null, nextSearchMs = 0;

            function readModel() {
                const cfg = ctx.config.view();
                const scale = QOL.utils.ClampConfigNumber(cfg.UNSECURED_SOULS_HUD_SCALE, QOL_DEFAULT_CONFIG.UNSECURED_SOULS_HUD_SCALE, 50, 200, true);
                const x = QOL.utils.ClampConfigNumber(cfg.UNSECURED_SOULS_HUD_X_OFFSET, QOL_DEFAULT_CONFIG.UNSECURED_SOULS_HUD_X_OFFSET, -1000, 2000, true);
                const y = QOL.utils.ClampConfigNumber(cfg.UNSECURED_SOULS_HUD_Y_OFFSET, QOL_DEFAULT_CONFIG.UNSECURED_SOULS_HUD_Y_OFFSET, 800, 2000, true);
                const both = Number(cfg.ENABLE_BETTER_UNSECURED_SHOW_ICON_TEXT) === 1;
                return {
                    enabled: Number(cfg.ENABLE_BETTER_UNSECURED) === 1,
                    showIcon: both || Number(cfg.ENABLE_BETTER_UNSECURED_SHOW_ICON) === 1,
                    showText: both || Number(cfg.ENABLE_BETTER_UNSECURED_SHOW_TEXT) === 1,
                    fontSize: Math.max(8, Math.min(72, Math.round(14 * scale / 100))) + "px",
                    styles: {
                        marginLeft: (115 + x - QOL_DEFAULT_CONFIG.UNSECURED_SOULS_HUD_X_OFFSET) + "px",
                        marginBottom: (130 - (y - QOL_DEFAULT_CONFIG.UNSECURED_SOULS_HUD_Y_OFFSET)) + "px"
                    }
                };
            }

            function parseSouls(valueText) {
                const raw = String(valueText || "").replace(/,/g, "").trim().toLowerCase();
                const suffix = raw.slice(-1);
                const multiplier = suffix === "k" ? 1000 : suffix === "m" ? 1000000 : suffix === "b" ? 1000000000 : 1;
                const number = parseFloat(raw) * multiplier;
                return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0;
            }

            function findContainer(root) {
                const gold = goldResolver.resolve(root);
                return QOL.utils.FindFirstPanelByClass(gold, "hudDeathGoldContainer") ||
                    QOL.utils.FindFirstPanelByClass(root, "hudDeathGoldContainer");
            }

            function findSource(root) {
                const byId = amountResolver.resolve(container || root) || rootAmountResolver.resolve(root);
                const label = byId || QOL.utils.FindFirstPanelByClass(container, "death_penalty_gold");
                return P.isAlive(label) && label.BHasClass("death_penalty_gold") ? label : null;
            }

            function release(resetSource = true) {
                P.delete(overlay);
                overlay = null; mirror = null; icon = null; text = null; signature = null;
                if (resetSource) {
                    container = null; source = null; nextSearchMs = 0; rootOwner = null;
                    goldResolver.reset(); amountResolver.reset(); rootAmountResolver.reset();
                }
            }

            function ensureOverlay(root) {
                const parent = P.findTraverse(root, "StatsAndModsContainer") || QOL.core.hud.getGameplayHudPanel(root);
                if (!P.isAlive(parent)) return false;
                if (!P.isAlive(overlay) || overlay.GetParent() !== parent) {
                    release(false);
                    overlay = P.findChild(parent, "QOLBetterUnsecuredOverlay") ||
                        P.create("Panel", parent, "QOLBetterUnsecuredOverlay", { hittest: "false", hittestchildren: "false" });
                }
                if (!P.isAlive(overlay)) return false;
                icon = P.findChild(overlay, "QOLBetterUnsecuredMirrorIcon") || P.create("Panel", overlay, "QOLBetterUnsecuredMirrorIcon");
                mirror = P.findChild(overlay, "QOLBetterUnsecuredMirrorLabel") || P.create("Label", overlay, "QOLBetterUnsecuredMirrorLabel");
                text = P.findChild(overlay, "QOLBetterUnsecuredMirrorText") || P.create("Label", overlay, "QOLBetterUnsecuredMirrorText");
                for (const child of [icon, mirror, text]) {
                    if (!P.isAlive(child)) return false;
                    child.hittest = false; child.hittestchildren = false;
                }
                P.setClass(mirror, "death_penalty_gold", true);
                return true;
            }

            function update() {
                const root = $.GetContextPanel();
                if (!P.isAlive(root) || !model || !model.enabled) { release(); return; }
                if (rootOwner !== root) { release(); rootOwner = root; }
                const now = QOL.utils.PerfNowMs();
                if ((container && !P.isAlive(container)) || now >= nextSearchMs) {
                    const current = findContainer(root);
                    if (current !== container) { source = null; amountResolver.reset(); }
                    container = current;
                    nextSearchMs = now + SEARCH_MS;
                }
                if (!container) { release(false); return; }
                source = findSource(root);
                if (!ensureOverlay(root)) return;
                const sourceText = P.isAlive(source) && typeof source.text === "string" ? source.text : "";
                const shown = parseSouls(sourceText) > 0;
                P.setClass(overlay, "qol-hidden", !shown);
                if (!shown) return;
                signature = P.syncStyles(overlay, model.styles, signature).sig;
                P.setClass(icon, "qol-hidden", !model.showIcon);
                P.setClass(text, "qol-hidden", !model.showText);
                P.setClass(mirror, "qol-hidden", false);
                const nativeText = P.findTraverse(container, "hudUnsecuredLabel") || P.findTraverse(root, "hudUnsecuredLabel");
                const caption = nativeText && typeof nativeText.text === "string" && nativeText.text ? nativeText.text : "UNSECURED";
                if (text.text !== caption) text.text = caption;
                if (mirror.text !== sourceText) mirror.text = sourceText;
                QOL.utils.SetStyleIfChanged(mirror, "fontSize", model.fontSize);
            }

            function refreshSettings() {
                model = readModel();
                update();
            }

            return {
                onEnable() {
                    refreshSettings();
                    loop = QOL.core.Scheduler.createPollLoop(update, 0.2, ctx.id);
                },
                onSettingsChanged: refreshSettings,
                onDisable() {
                    if (loop) { loop.stop(); loop = null; }
                    release();
                    model = null;
                }
            };
        },
        test() {
            try {
                const gp = QOL.core.panel.findTraverse($.GetContextPanel(), "gameplay_hud");
                if (!gp) return null;
                return { passed: true, name: "Gameplay HUD exists for unsecured overlay", message: "",
                    assertions: [{ passed: true, name: "gameplay_hud panel exists" }] };
            } catch (e) {
                return { passed: false, name: "Better unsecured HUD check", message: e.message || String(e) };
            }
        }
    });
})();

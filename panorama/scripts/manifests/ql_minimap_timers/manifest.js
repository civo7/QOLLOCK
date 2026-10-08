// Objective overlays own their panels; Rejuvenator phase data belongs to ql_rejuv_hud.
(() => {
    "use strict";
    const Q = globalThis.QOL;
    const P = Q.core.panel;
    const U = Q.utils;
    const id = "ql_minimap_timers";
    const powerupClasses = ["powerup_gun", "powerup_survival", "powerup_casting", "powerup_movement"];
    const ownerPath = [{ id: "Hud", optional: true }, { className: "HudCore" }, "gameplay_hud", { className: "clamp_width" }];
    function hasClass(panel, className) {
        for (let depth = 0; depth < 32 && P.isAlive(panel); depth++) {
            if (panel.BHasClass(className)) return true;
            panel = panel.GetParent?.();
        }
        return false;
    }

    Q.core.FeatureRegistry.register({
        id,
        enabledByDefault: false,
        enableKeys: ["ENABLE_MINIMAP_REJUV_TIMER", "ENABLE_MINIMAP_BUFF_TIMER"],
        settings: [
            { key: "ENABLE_MINIMAP_REJUV_TIMER", type: "toggle" },
            { key: "ENABLE_MINIMAP_BUFF_TIMER", type: "toggle" },
            { key: "ENABLE_MINIMAP_BUFF_TIMER_ON_BRIDGE", type: "toggle" },
            { key: "ENABLE_MINIMAP_ALWAYS_ON_MID_BOSS", type: "toggle" },
            { key: "ENABLE_TAB_ZOOM", type: "toggle" },
            { key: "ENABLE_ALT_ZOOM", type: "toggle" },
            { key: "MINIMAP_FIXED_ICON_SIZE", type: "toggle" },
            { key: "MINIMAP_SMALL_SIZE", type: "slider" },
            { key: "MINIMAP_LARGE_SIZE", type: "slider" },
            { key: "MINIMAP_LARGE_SIZE_ALT", type: "slider" },
            { key: "MINIMAP_LARGE_SIZE_TAB", type: "slider" }
        ],
        create(ctx) {
            const hostResolver = Q.panelCache.createIdResolver("minimap_persp", { ownerPath });
            const fallbackResolver = Q.panelCache.createIdResolver("minimap_container");
            const signatures = new Map();
            let host = null, anchor = null, renderer = null, panels = null;
            let loop = null, unsubscribeSecond = null;

            function readModel() {
                const cfg = ctx.config.view();
                const buff = U.IsCfgEnabled(cfg, "ENABLE_MINIMAP_BUFF_TIMER");
                const rejuv = U.IsCfgEnabled(cfg, "ENABLE_MINIMAP_REJUV_TIMER");
                const baseSize = Number(cfg.MINIMAP_SMALL_SIZE) || 400;
                const size = (key) => {
                    const value = Number(cfg[key] ?? cfg.MINIMAP_LARGE_SIZE ?? baseSize);
                    return Number.isFinite(value) && value > 0 ? value : baseSize;
                };
                return {
                    buff, rejuv,
                    bridge: buff && U.IsCfgEnabled(cfg, "ENABLE_MINIMAP_BUFF_TIMER_ON_BRIDGE"),
                    midboss: rejuv && U.IsCfgEnabled(cfg, "ENABLE_MINIMAP_ALWAYS_ON_MID_BOSS"),
                    alt: U.IsCfgEnabled(cfg, "ENABLE_ALT_ZOOM"), tab: U.IsCfgEnabled(cfg, "ENABLE_TAB_ZOOM"),
                    fixedIcons: U.IsCfgEnabled(cfg, "MINIMAP_FIXED_ICON_SIZE"),
                    baseSize, altSize: size("MINIMAP_LARGE_SIZE_ALT"), tabSize: size("MINIMAP_LARGE_SIZE_TAB")
                };
            }

            function releaseOverlay() {
                if (P.isAlive(panels?.root)) P.delete(panels.root);
                panels = null;
                signatures.clear();
            }

            function discover(root) {
                const nextHost = hostResolver.resolve(root);
                const nextAnchor = P.findChild(nextHost, "minimap_container") || nextHost || fallbackResolver.resolve(root);
                const nativeContainer = P.findChild(nextAnchor, "HudMinimapContainer");
                const nextRenderer = P.findChild(nativeContainer, "hud_minimap") || P.findChild(nextAnchor, "hud_minimap") || nextAnchor;
                if (anchor !== nextAnchor) releaseOverlay();
                host = nextHost;
                anchor = nextAnchor;
                renderer = nextRenderer;
                return P.isAlive(anchor);
            }

            function child(parent, type, panelId, classes = [], properties) {
                const panel = P.findChild(parent, panelId) || P.create(type, parent, panelId, properties);
                if (!P.isAlive(panel)) return null;
                panel.hittest = false;
                panel.hittestchildren = false;
                for (const className of classes) P.setClass(panel, className, true);
                return panel;
            }

            function ensureOverlay() {
                if (panels && P.findChild(anchor, "QOLMinimapTimersRoot") !== panels.root) releaseOverlay();
                const overlay = child(anchor, "Panel", "QOLMinimapTimersRoot");
                if (!overlay) return null;
                const next = { root: overlay };
                for (const [prefix, suffix, image] of [
                    ["buff", "Buff", "icon_powerup.svg"], ["left", "BuffBridgeLeft", "icon_powerup.svg"],
                    ["right", "BuffBridgeRight", "icon_powerup.svg"], ["rejuv", "Rejuv", "icon_rejuvenator.svg"]
                ]) {
                    next[prefix] = child(overlay, "Panel", "QOLMinimap" + suffix + "Timer", ["QOLMinimapTimer"]);
                    next[prefix + "Icon"] = child(next[prefix], "Image", "QOLMinimap" + suffix + "Icon", [], {
                        src: "s2r://panorama/images/hud/modifiers/" + image
                    });
                    next[prefix + "Time"] = child(next[prefix], "Label", "QOLMinimap" + suffix + "Time", ["QOLMinimapTimerLabel"]);
                }
                if (Object.values(next).some(panel => !P.isAlive(panel))) { panels = next; return null; }
                if (panels) for (const key of Object.keys(next)) if (next[key] !== panels[key] && P.isAlive(panels[key])) P.delete(panels[key]);
                if (!panels || Object.keys(next).some(key => next[key] !== panels[key])) signatures.clear();
                panels = next;
                if (overlay.MoveChildBefore) overlay.MoveChildBefore(next.rejuv, next.buff);
                return panels;
            }

            function style(panel, values) {
                if (!P.isAlive(panel)) return;
                signatures.set(panel, P.syncStyles(panel, values, signatures.get(panel)).sig);
            }

            function show(panel, visible) {
                P.setClass(panel, "qol-hidden", !visible);
                if (P.isAlive(panel)) U.SetStyleIfChanged(panel, "visibility", visible ? "visible" : "collapse");
            }

            function hide() {
                show(panels?.root, false);
                for (const role of ["buff", "left", "right", "rejuv"]) {
                    P.setClass(panels?.[role], "red", false);
                    P.setClass(panels?.[role], "yellow", false);
                }
            }

            function bridgeSide(panel) {
                let position = panel.style?.position;
                if (!position && panel.GetAttributeString) position = panel.GetAttributeString("style", "");
                const match = String(position || "").match(/([+\-]?\d+(?:\.\d+)?)%/);
                if (match && Number.isFinite(Number(match[1]))) return Number(match[1]) < 50 ? "left" : "right";
                const offset = panel.actualxoffset;
                const width = panel.GetParent?.()?.actuallayoutwidth;
                if (Number.isFinite(offset) && width > 0) return offset < width / 2 ? "left" : "right";
                if (Number.isFinite(offset) && offset > 0) return offset < 200 ? "left" : "right";
                return null;
            }

            function observe(root, model) {
                const second = Q.core.time.readObservedGameTime(root);
                const remaining = 300 - second % 300;
                const rejuvState = Q.state?.rejuvState;
                const spawn = Boolean(rejuvState?.spawnWaiting);
                const rejuvRemaining = Number(rejuvState?.counter) || 0;
                const activeBuffs = { left: false, right: false };
                const spawners = model.bridge && renderer?.FindChildrenWithClassTraverse
                    ? renderer.FindChildrenWithClassTraverse("powerup_spawn") || [] : [];
                for (const spawner of spawners) {
                    if (!P.isAlive(spawner) || !(powerupClasses.some(cls => spawner.BHasClass(cls)) || spawner.BHasClass("active"))) continue;
                    let side = bridgeSide(spawner);
                    if (!side && spawners.length >= 2) {
                        const firstLeft = (Number(spawners[0].actualxoffset) || 0) <= (Number(spawners[1].actualxoffset) || 0);
                        side = (spawner === spawners[0]) === firstLeft ? "left" : "right";
                    }
                    if (side) activeBuffs[side] = true;
                }
                // Match minimap runtime's established Alt-before-Tab precedence.
                const alt = model.alt && (Q.core.hud.isClassActive("gDetailView") || hasClass(host, "gDetailView"));
                const tab = model.tab && Q.core.hud.isScoreboardOpen(root, host);
                const size = model.fixedIcons ? (alt ? model.altSize : tab ? model.tabSize : model.baseSize) : 400;
                return { remaining, rejuvRemaining, spawn, activeBuffs, size,
                    buffText: Q.core.time.formatSeconds(remaining), rejuvText: spawn ? "Spawn" : Q.core.time.formatSeconds(rejuvRemaining) };
            }

            function render(model, observed) {
                const overlay = ensureOverlay();
                if (!overlay) return;
                const bridgeMode = model.bridge || model.midboss;
                const singleOffset = model.buff && !model.rejuv ? 152 : model.rejuv && !model.buff ? -152 : 0;
                const ordinary = { width: "fit-children", height: "fit-children", horizontalAlign: "center", verticalAlign: "bottom",
                    marginTop: "0px", marginRight: "0px", marginBottom: "40px", marginLeft: singleOffset + "px", preTransformScale2d: "1.00, 1.00" };
                style(overlay.root, bridgeMode ? { ...ordinary, width: observed.size + "px", height: observed.size + "px",
                    verticalAlign: "center", marginBottom: "0px", marginLeft: "0px" } : ordinary);
                const plate = { width: "72px", height: "28px", margin: "0px 40px", padding: "0px 5px", borderRadius: "5px",
                    ignoreParentFlow: "false", horizontalAlign: "center", verticalAlign: "center", marginLeft: "40px", marginTop: "0px", marginBottom: "0px" };
                for (const role of ["buff", "rejuv"]) {
                    const midboss = role === "rejuv" && model.midboss;
                    const offset = role === "buff" ? (!model.rejuv || model.midboss ? 0 : -152) : (model.buff ? 152 : 0);
                    style(overlay[role], bridgeMode ? { ...plate, margin: "0px", ignoreParentFlow: "true", verticalAlign: midboss ? "center" : "bottom",
                        marginBottom: midboss ? "0px" : "40px", marginLeft: (midboss ? 0 : offset) + "px" } : plate);
                    style(overlay[role + "Icon"], { width: "16px", height: "16px" });
                    style(overlay[role + "Time"], { fontSize: "14px" });
                }
                for (const [role, direction] of [["left", -1], ["right", 1]]) {
                    style(overlay[role], { width: "48px", height: "18px", margin: "0px", padding: "0px 3px", borderRadius: "4px",
                        horizontalAlign: "center", verticalAlign: "center", marginLeft: direction * 144 * observed.size / 400 + "px",
                        ignoreParentFlow: "true", marginTop: "0px", marginBottom: "0px" });
                    style(overlay[role + "Time"], { fontSize: "11px" });
                    show(overlay[role + "Icon"], false);
                    show(overlay[role], model.bridge && !observed.activeBuffs[role]);
                    P.setClass(overlay[role], "buff_spawned", model.bridge && observed.activeBuffs[role]);
                }
                show(overlay.buff, model.buff && !model.bridge);
                show(overlay.rejuv, model.rejuv);
                show(overlay.buffIcon, !bridgeMode);
                show(overlay.rejuvIcon, !model.midboss);
                const buffRed = observed.remaining < 10 && observed.remaining % 2 === 1;
                const buffYellow = !buffRed && observed.remaining < 20 && observed.remaining % 2 === 1;
                const rejuvRed = observed.spawn || observed.rejuvRemaining < 10 && observed.rejuvRemaining % 2 === 1;
                const rejuvYellow = !observed.spawn && !rejuvRed && observed.rejuvRemaining < 20 && observed.rejuvRemaining % 2 === 1;
                for (const role of ["buff", "left", "right", "rejuv"]) {
                    const isRejuv = role === "rejuv";
                    const colored = isRejuv ? model.rejuv : role === "buff" ? model.buff && !bridgeMode : model.bridge && !observed.activeBuffs[role];
                    P.setClass(overlay[role], "red", colored && (isRejuv ? rejuvRed : buffRed));
                    P.setClass(overlay[role], "yellow", colored && (isRejuv ? rejuvYellow : buffYellow));
                    const text = isRejuv ? observed.rejuvText : observed.buffText;
                    if (overlay[role + "Time"].text !== text) overlay[role + "Time"].text = text;
                }
                show(overlay.root, true);
            }

            function update() {
                const root = $.GetContextPanel();
                const model = readModel();
                if (!P.isAlive(root) || Q.core.hud.isInHideout(root) || Q.isStreetBrawlModeActive?.(root) || !model.buff && !model.rejuv) {
                    hide(); return;
                }
                if (!discover(root)) { hide(); return; }
                render(model, observe(root, model));
            }

            function release() {
                if (unsubscribeSecond) { unsubscribeSecond(); unsubscribeSecond = null; }
                if (loop) { loop.stop(); loop = null; }
                releaseOverlay();
                host = anchor = renderer = null;
                hostResolver.reset();
                fallbackResolver.reset();
            }

            return {
                onEnable() {
                    update();
                    unsubscribeSecond = Q.core.time.subscribeGameSecond(update, 1);
                    loop = Q.core.Scheduler.createPollLoop(update, 0.3, id);
                },
                onDisable: release,
                onSettingsChanged() { hostResolver.reset(); fallbackResolver.reset(); update(); }
            };
        },
        test() {
            const minimap = P.findTraverse($.GetContextPanel(), "hud_minimap");
            return { passed: Boolean(minimap), name: "Minimap panel exists", message: minimap ? "" : "hud_minimap not found in HUD tree" };
        }
    });
})();

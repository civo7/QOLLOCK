// Minimap content owns native decoration and overlays; geometry owns viewport presentation.
(() => {
    "use strict";
    const Q = globalThis.QOL;
    const P = Q.core.panel;
    const U = Q.utils;
    const id = "ql_minimap_runtime";
    function hasClass(panel, className) {
        for (let depth = 0; depth < 32 && P.isAlive(panel); depth++) {
            if (panel.BHasClass(className)) return true;
            panel = panel.GetParent?.();
        }
        return false;
    }
    Q.core.FeatureRegistry.register({
        id,
        enabledByDefault: true,
        settings: [
            { key: "ENABLE_ALT_ZOOM", type: "toggle" },
            { key: "ENABLE_TAB_ZOOM", type: "toggle" },
            { key: "MINIMAP_BASE_OPACITY", type: "slider" },
            { key: "MINIMAL_MINIMAP", type: "toggle" },
            { key: "MINIMAL_MINIMAP_OPACITY", type: "slider" },
            { key: "MINIMAP_SMALL_SIZE", type: "slider" },
            { key: "MINIMAP_FIXED_ICON_SIZE", type: "toggle" },
            { key: "MINIMAP_X_OFFSET", type: "number" },
            { key: "MINIMAP_Y_OFFSET", type: "number" },
            { key: "MINIMAP_LARGE_SIZE_ALT", type: "slider" },
            { key: "MINIMAP_LARGE_SIZE_TAB", type: "slider" },
            { key: "ZOOM_X_OFFSET_ALT", type: "number" },
            { key: "ZOOM_Y_OFFSET_ALT", type: "number" },
            { key: "ZOOM_X_OFFSET_TAB", type: "number" },
            { key: "ZOOM_Y_OFFSET_TAB", type: "number" },
            { key: "ALT_ZOOM_OPACITY", type: "slider" },
            { key: "TAB_ZOOM_OPACITY", type: "slider" },
            { key: "ALT_ZOOM_DRAW_OVER_UI", type: "toggle" },
            { key: "TAB_ZOOM_DRAW_OVER_UI", type: "toggle" },
            { key: "ENABLE_MINIMAP_CRATE_OVERLAY", type: "toggle" },
            { key: "ENABLE_MINIMAP_REM_TUNNELS", type: "toggle" },
            { key: "MINIMAP_REM_TUNNELS_OPACITY", type: "slider" },
            { key: "ENABLE_ALT_ZOOM_REM_TUNNELS", type: "toggle" },
            { key: "ALT_ZOOM_REM_TUNNELS_OPACITY", type: "slider" },
            { key: "ENABLE_TAB_ZOOM_REM_TUNNELS", type: "toggle" },
            { key: "TAB_ZOOM_REM_TUNNELS_OPACITY", type: "slider" },
            { key: "MINIMAP_ICON_COLOR", type: "palette" },
            { key: "MINIMAP_FLIP", type: "toggle", label: "Flip", description: "Rotates the static minimap 180 degrees." },
            { key: "MINIMAP_ROTATE_WITH_PLAYER", type: "toggle", label: "Spinny Mode", description: "Makes the minimap rotate with player view, this is just for fun." },
            { key: "ENABLE_MINIMAP_ELEVATION_MARKERS", type: "toggle", label: "Elevation Markers", description: "Shows relative elevation difference between you and players." }
        ],
        create(ctx) {
            const geometry = Q.features.minimapGeometry.create();
            const canvasResolver = Q.panelCache.createIdResolver("canvas");
            const renderResolver = Q.panelCache.createIdResolver("map_render");
            const owned = new Map();
            const fields = new Map(Q.settingsFields.map(field => [field.key, field]));
            let loop = null;
            let currentRate = 0;
            let anchor = null, renderer = null, canvas = null, mapRender = null;
            let tunnel = null, crates = null, markers = null;
            let crateData = null;
            let crateCoordinates = [];
            let crateReady = false;
            let markerPanels = [];
            let rangePanels = [];

            function readModel() {
                const cfg = ctx.config.view();
                const enabled = key => U.IsCfgEnabled(cfg, key);
                const number = (key, fallback, legacy) => {
                    const value = cfg[key] ?? cfg[legacy] ?? fallback;
                    const field = fields.get(key);
                    return U.ClampConfigNumber(value, fallback, field?.min, field?.max, false);
                };
                const view = (mode) => {
                    const suffix = mode ? "_" + mode : "";
                    const sizeKey = mode ? "MINIMAP_LARGE_SIZE" + suffix : "MINIMAP_SMALL_SIZE";
                    const size = number(sizeKey, Number(cfg.MINIMAP_SMALL_SIZE) || 400, mode ? "MINIMAP_LARGE_SIZE" : undefined);
                    const x = number(mode ? "ZOOM_X_OFFSET" + suffix : "MINIMAP_X_OFFSET", 0, mode ? "ZOOM_X_OFFSET" : undefined);
                    const y = number(mode ? "ZOOM_Y_OFFSET" + suffix : "MINIMAP_Y_OFFSET", 0, mode ? "ZOOM_Y_OFFSET" : undefined);
                    const opacity = Math.max(0, Math.min(1, number(mode ? mode + "_ZOOM_OPACITY" : "MINIMAP_BASE_OPACITY", 1)));
                    const tunnels = enabled(mode ? "ENABLE_" + mode + "_ZOOM_REM_TUNNELS" : "ENABLE_MINIMAP_REM_TUNNELS");
                    const tunnelOpacity = Math.max(0, Math.min(1, number(mode ? mode + "_ZOOM_REM_TUNNELS_OPACITY" : "MINIMAP_REM_TUNNELS_OPACITY", 0.75)));
                    return { size, x, y, opacity, tunnels, tunnelOpacity, zoomed: Boolean(mode), drawOverUi: mode && enabled(mode + "_ZOOM_DRAW_OVER_UI") };
                };
                return { alt: enabled("ENABLE_ALT_ZOOM"), tab: enabled("ENABLE_TAB_ZOOM"), fixedIcons: enabled("MINIMAP_FIXED_ICON_SIZE"),
                    minimalist: enabled("MINIMAL_MINIMAP"), minimalOpacity: Math.max(0, Math.min(1, number("MINIMAL_MINIMAP_OPACITY", 0.9))),
                    crates: enabled("ENABLE_MINIMAP_CRATE_OVERLAY"), iconColor: P.resolvePaletteColor(cfg.MINIMAP_ICON_COLOR),
                    base: view(""), altView: view("ALT"), tabView: view("TAB") };
            }

            function releasePanel(panel) {
                const record = owned.get(panel);
                if (record && P.isAlive(panel)) for (const property of Object.keys(record.styles)) U.ClearStyleSafe(panel, property);
                owned.delete(panel);
            }

            function style(panel, styles) {
                if (!P.isAlive(panel)) return false;
                const previous = owned.get(panel);
                if (previous) for (const property of Object.keys(previous.styles)) {
                    if (!Object.prototype.hasOwnProperty.call(styles, property)) U.ClearStyleSafe(panel, property);
                }
                const sig = P.syncStyles(panel, styles, previous?.sig).sig;
                owned.set(panel, { styles, sig });
                return sig !== null;
            }

            function show(panel, visible) {
                P.setClass(panel, "qol-hidden", !visible);
                if (P.isAlive(panel)) U.SetStyleIfChanged(panel, "visibility", visible ? "visible" : "collapse");
            }

            function releaseOverlays() {
                for (const panel of [tunnel, crates]) if (P.isAlive(panel)) P.delete(panel);
                for (const panel of [tunnel, crates, markers, ...markerPanels]) owned.delete(panel);
                tunnel = crates = markers = null;
                markerPanels = [];
                crateData = null;
                crateCoordinates = [];
                crateReady = false;
            }

            function discover(root) {
                const found = geometry.resolve(root);
                const nextAnchor = found.panels.find(panel => panel.id === "minimap_container") || found.host;
                if (anchor !== nextAnchor) releaseOverlays();
                if (renderer !== found.renderer) {
                    P.setClass(renderer, "minimalist_minimap_active", false);
                    releasePanel(renderer);
                    for (const panel of rangePanels) releasePanel(panel);
                    rangePanels = [];
                }
                anchor = nextAnchor;
                renderer = found.renderer;
                const nextCanvas = canvasResolver.resolve(renderer);
                const nextRender = renderResolver.resolve(renderer);
                if (canvas !== nextCanvas) releasePanel(canvas);
                if (mapRender !== nextRender) releasePanel(mapRender);
                canvas = nextCanvas;
                mapRender = nextRender;
                return found.host;
            }

            function ensure(parent, panelId, previous) {
                const current = P.findChild(parent, panelId);
                if (previous !== current && P.isAlive(previous)) { owned.delete(previous); P.delete(previous); }
                const panel = current || P.create("Panel", parent, panelId);
                if (P.isAlive(panel)) { panel.hittest = false; panel.hittestchildren = false; }
                return panel;
            }

            function renderTunnel(view) {
                if (!view.tunnels) { P.setClass(tunnel, "tunnel_locked_on", false); show(tunnel, false); return; }
                tunnel = ensure(anchor, "tunnel_overlay", tunnel);
                style(tunnel, { backgroundImage: 'url("s2r://panorama/images/minimap/base/mm_tunnel_overlay_png_png.vtex")',
                    backgroundSize: "100% 100%", backgroundRepeat: "no-repeat", backgroundPosition: "center", opacity: view.tunnelOpacity.toFixed(2) });
                P.setClass(tunnel, "tunnel_locked_on", true);
                show(tunnel, true);
            }

            function renderCrates(model) {
                if (!model.crates) { show(crates, false); return; }
                const next = ensure(anchor, "minimap_overlay_root", crates);
                if (next !== crates) { crates = next; markers = null; crateData = null; }
                const nextMarkers = ensure(crates, "minimap_markers", markers);
                if (nextMarkers !== markers) { markers = nextMarkers; crateData = null; }
                if (!P.isAlive(markers)) return;
                // Map API remains unverified; retain the shipped Midtown table.
                const data = Q.minimapCrateData || (typeof CRATE_DATA === "object" ? CRATE_DATA : null);
                const points = data?.dl_midtown?.crates || (Array.isArray(data?.dl_midtown) ? data.dl_midtown : []);
                if (crateData !== points) crateCoordinates = points.map(point => [Number(Array.isArray(point) ? point[0] : point.u), Number(Array.isArray(point) ? point[1] : point.v)])
                    .filter(point => point.every(Number.isFinite));
                const coordinates = crateCoordinates;
                if (crateData !== points || markerPanels.length !== coordinates.length || markerPanels.some(panel => !P.isAlive(panel) || panel.GetParent?.() !== markers)) {
                    for (const panel of markerPanels) owned.delete(panel);
                    markers.RemoveAndDeleteChildren();
                    markerPanels = coordinates.map(() => P.create("Panel", markers, "", { class: "minimap_marker", hittest: false, hittestchildren: false }));
                    crateData = points;
                    crateReady = false;
                }
                if (!crateReady) {
                    crateReady = true;
                    coordinates.forEach(([x, y], index) => {
                        crateReady = style(markerPanels[index], {
                            position: x * 100 + "% " + y * 100 + "% 0", width: "2px", height: "2px", transform: "translateX(-1px) translateY(-1px)",
                            opacity: "1.0", backgroundColor: "rgba(255, 213, 74, 0.75)", border: "1px solid rgba(42, 33, 0, 0.45)"
                        }) && crateReady;
                    });
                }
                show(crates, true);
            }

            function renderRange(size) {
                const active = Math.abs(size - 400) >= 0.5;
                let next = [];
                if (active && P.isAlive(renderer)) {
                    const doors = renderer.FindChildrenWithClassTraverse?.("doorman_doorway") || [];
                    const sources = doors.length ? doors : renderer.FindChildrenWithClassTraverse?.("ability_castrange") || [];
                    next = sources.map(panel => P.findTraverse(panel, "CastRange")).filter(P.isAlive);
                }
                for (const panel of rangePanels) if (!next.includes(panel)) releasePanel(panel);
                rangePanels = next;
                for (const panel of next) {
                    const styles = { uiScale: "100%", preTransformScale2d: "1.00, 1.00" };
                    // Native cast-range animation may reassert these values between samples.
                    owned.set(panel, { styles, sig: null });
                    for (const property of Object.keys(styles)) U.SetStyleIfChanged(panel, property, styles[property]);
                }
            }

            function render(model, view) {
                geometry.setDrawOverUi(Boolean(view.drawOverUi));
                geometry.apply({ ...view, fixedIcons: model.fixedIcons });
                const minimalist = !view.zoomed && model.minimalist;
                P.setClass(renderer, "minimalist_minimap_active", minimalist);
                style(renderer, minimalist ? { backgroundColor: "rgba(0, 0, 0, 0)" } : {});
                style(mapRender, minimalist ? { opacity: String(model.minimalOpacity), brightness: "1.0", washColor: "none" } : {});
                style(canvas, model.iconColor ? { washColor: model.iconColor } : {});
                renderRange(view.size);
                renderTunnel(view);
                renderCrates(model);
            }

            function update() {
                const root = $.GetContextPanel();
                if (!P.isAlive(root)) return;
                const host = discover(root);
                if (!P.isAlive(host)) { show(tunnel, false); show(crates, false); return; }
                const model = readModel();
                const alt = model.alt && (hasClass(host, "gDetailView") || Q.core.hud.isClassActive("gDetailView"));
                const tab = model.tab && Q.core.hud.isScoreboardOpen(root, host);
                render(model, alt ? model.altView : tab ? model.tabView : model.base);
            }

            function syncLoop() {
                const model = readModel();
                // rate-exempt: native doorway ranges and Alt view require smooth refresh.
                const rate = model.alt || Math.abs(model.base.size - 400) >= 0.5 ? 0.05 : 0.5;
                if (loop && currentRate !== rate) { loop.stop(); loop = null; }
                if (!loop) { currentRate = rate; loop = Q.core.Scheduler.createPollLoop(update, rate, id); }
            }

            function scoreboardRefresh() { Q.core.Scheduler.scheduleOnce(update, 0, ctx.id || id); }

            function release() {
                ctx.events?.off("engine:scoreboard_toggle", scoreboardRefresh);
                if (loop) { loop.stop(); loop = null; }
                currentRate = 0;
                Q.core.Scheduler.cancelAllForFeature(id);
                geometry.release();
                P.setClass(renderer, "minimalist_minimap_active", false);
                for (const panel of owned.keys()) releasePanel(panel);
                releaseOverlays();
                rangePanels = [];
                anchor = renderer = canvas = mapRender = null;
                canvasResolver.reset(); renderResolver.reset();
            }

            return {
                onEnable() { ctx.events?.on("engine:scoreboard_toggle", scoreboardRefresh); syncLoop(); update(); },
                onDisable: release,
                onSettingsChanged() { geometry.resetDiscovery(); canvasResolver.reset(); renderResolver.reset(); syncLoop(); update(); }
            };
        },
        test() {
            const minimap = P.findTraverse($.GetContextPanel(), "hud_minimap");
            return { passed: Boolean(minimap), name: "Minimap runtime panel exists", message: minimap ? "" : "hud_minimap not found in HUD tree" };
        }
    });
})();

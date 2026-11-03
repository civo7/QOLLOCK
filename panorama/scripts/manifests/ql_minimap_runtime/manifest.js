// OWNS: Native minimap decoration, created crate/tunnel trees and settings model.
// DOES NOT OWN: Native map data, objective phases or compass rotation/flip.
// Viewport presentation remains with geometry.js; created overlay IDs are QOL-only.
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
            ...Q.presentation.stateSettings("ql_minimap_runtime"),
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
            { key: "MINIMAP_LOOT_MARKER_SCALE", type: "slider" },
            { key: "MINIMAP_LOOT_OPACITY", type: "slider" },
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
            // hud_minimap.xml and the October 3 capture place the canvas here.
            const canvasResolver = Q.panelCache.createIdResolver("canvas", { ownerPath: ["MinimapBackgroundTest"] });
            const renderResolver = Q.panelCache.createIdResolver("map_render");
            const owned = new Map();
            const nativeStyles = P.createNativeStyleOwner();
            const tree = P.createOwnedTree();
            let loop = null;
            let currentRate = 0;
            let active = false, model = null, rootOwner = null;
            let anchor = null, renderer = null, canvas = null, mapRender = null;
            let backgroundImages = [];
            let tunnel = null, crates = null, markers = null;
            let crateReady = false;
            let crateImage = null;
            let rangePanels = [];
            let createdComposition = "cache";
            const released = { geometry: true, decoration: true };
            let lastView = null;
            let nativeReleaseResults = {};
            const probe = Q.core.minimapProbe;
            const diagnostic = probe.createOwner({
                isActive: () => active,
                allowed: Object.fromEntries(["hideRoot", "hideTunnel", "skipSweep", "releaseGeometry", "releaseDecoration", "releasePlacement", "releaseViewport"]
                    .map(key => [key, value => typeof value === "boolean"]).concat([
                        ["composition", value => ["cache", "layer", "none"].includes(value)],
                        ["releaseNativeTargets", value => Array.isArray(value) && value.every(key => ["renderer", "mapRender", "backgrounds", "canvas", "ranges"].includes(key))],
                        ["releaseGeometryRoles", value => Array.isArray(value) && value.every(key => ["host", "viewport", "frame", "nativeContainer", "renderer"].includes(key))]
                    ])),
                apply: (next, previous) => {
                    if ((next.composition || "cache") !== (previous.composition || "cache")) releaseOverlays();
                    update();
                },
                snapshot: () => ({ owner: id, native: probe.panelState(renderer), root: probe.panelState(crates),
                    tunnel: probe.panelState(tunnel), markers: probe.panelState(markers), composition: createdComposition, released: { ...released },
                    reconciled: { geometry: geometry.verify(), decoration: nativeStyles.verify() },
                    counts: { total: P.isAlive(crateImage) ? 1 : 0, expected: 1 },
                    geometry: { anchor: probe.panelState(anchor), fixedIcons: renderer?.BHasClass("QOLFixedMinimapIcons") || false, ...geometry.inspect() },
                    decoration: { canvas: probe.panelState(canvas), mapRender: probe.panelState(mapRender), backgrounds: backgroundImages.map(probe.panelState),
                        releaseResults: { ...nativeReleaseResults }, activeTargets: {
                            renderer: P.isAlive(renderer) && !!model?.minimalist && !lastView?.zoomed,
                            mapRender: P.isAlive(mapRender) && !!model?.minimalist && !lastView?.zoomed,
                            backgrounds: backgroundImages.some(P.isAlive) && !!model?.minimalist && !lastView?.zoomed,
                            canvas: P.isAlive(canvas) && !!model?.iconColor,
                            ranges: rangePanels.some(P.isAlive)
                        } } })
            });

            function readModel() {
                const cfg = Q.presentation.captureVisibility(ctx, ctx.config.view());
                const enabled = key => U.IsCfgEnabled(cfg, key);
                const number = (key, fallback, legacy) => {
                    const value = cfg[key] ?? cfg[legacy] ?? fallback;
                    return Q.settings.readNumber(key, value);
                };
                const view = (mode) => {
                    const suffix = mode ? "_" + mode : "";
                    const sizeKey = mode ? "MINIMAP_LARGE_SIZE" + suffix : "MINIMAP_SMALL_SIZE";
                    const size = number(sizeKey, Number(cfg.MINIMAP_SMALL_SIZE) || 400, mode ? "MINIMAP_LARGE_SIZE" : undefined);
                    const x = number(mode ? "ZOOM_X_OFFSET" + suffix : "MINIMAP_X_OFFSET", 0, mode ? "ZOOM_X_OFFSET" : undefined);
                    const y = number(mode ? "ZOOM_Y_OFFSET" + suffix : "MINIMAP_Y_OFFSET", 0, mode ? "ZOOM_Y_OFFSET" : undefined);
                    const opacity = U.NormalizeOpacityNumber(number(mode ? mode + "_ZOOM_OPACITY" : "MINIMAP_BASE_OPACITY", 1), 1);
                    const tunnels = enabled(mode ? "ENABLE_" + mode + "_ZOOM_REM_TUNNELS" : "ENABLE_MINIMAP_REM_TUNNELS");
                    const tunnelOpacity = U.NormalizeOpacityNumber(number(mode ? mode + "_ZOOM_REM_TUNNELS_OPACITY" : "MINIMAP_REM_TUNNELS_OPACITY", 0.75), 0.75);
                    return { size, x, y, opacity, tunnels, tunnelOpacity, zoomed: Boolean(mode), drawOverUi: mode && enabled(mode + "_ZOOM_DRAW_OVER_UI") };
                };
                return { alt: enabled("ENABLE_ALT_ZOOM"), tab: enabled("ENABLE_TAB_ZOOM"), fixedIcons: enabled("MINIMAP_FIXED_ICON_SIZE"),
                    minimalist: enabled("MINIMAL_MINIMAP"), minimalOpacity: U.NormalizeOpacityNumber(number("MINIMAL_MINIMAP_OPACITY", 0.9), 0.9),
                    crateMarkerScale: number("MINIMAP_LOOT_MARKER_SCALE", 100), crateOpacity: number("MINIMAP_LOOT_OPACITY", 1),
                    crates: enabled("ENABLE_MINIMAP_CRATE_OVERLAY"), iconColor: P.resolvePaletteColor(cfg.MINIMAP_ICON_COLOR),
                    base: view(""), altView: view("ALT"), tabView: view("TAB") };
            }

            function releasePanel(panel) {
                nativeStyles.apply(panel, {});
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
                tree.clear();
                for (const panel of [tunnel, crates, markers, crateImage]) owned.delete(panel);
                tunnel = crates = markers = null;
                crateImage = null;
                crateReady = false;
            }

            function discover(root) {
                const found = geometry.resolve(root);
                const nextAnchor = found.panels.find(panel => panel.id === "minimap_container") || found.host;
                if (anchor !== nextAnchor) releaseOverlays();
                if (renderer !== found.renderer) {
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
                // Native backgrounds share their container with canvas/effects;
                // fade only the images, preserving icon and effect opacity.
                const backgrounds = P.findChild(renderer, "MinimapBackgroundTest");
                const nextImages = P.isAlive(backgrounds) ? backgrounds.Children().filter(panel =>
                    P.isAlive(panel) && (panel.BHasClass("backgroundImage1") || panel.BHasClass("backgroundImage2") || panel.BHasClass("backgroundImage3"))) : [];
                for (const panel of backgroundImages) if (!nextImages.includes(panel)) releasePanel(panel);
                backgroundImages = nextImages;
                return found.host;
            }

            function ensure(parent, panelId, previous) {
                const panel = tree.child(parent, "Panel", panelId);
                if (previous !== panel) owned.delete(previous);
                return panel;
            }

            function renderTunnel(view) {
                if (!view.tunnels) { P.setClass(tunnel, "tunnel_locked_on", false); show(tunnel, false); return; }
                tunnel = ensure(anchor, "tunnel_overlay", tunnel);
                const ready = style(tunnel, { opacity: view.tunnelOpacity.toFixed(2) });
                P.setClass(tunnel, "tunnel_locked_on", ready);
                show(tunnel, ready && !diagnostic.controls?.hideTunnel);
            }

            function renderCrates(model) {
                if (!model.crates || Q.core.hud.isInHideout(rootOwner) || Q.isStreetBrawlModeActive?.(rootOwner)) {
                    show(crates, false); return;
                }
                // Request one cached composition for the static crate tree.
                // Requiring the layer is separate from retaining its cached image.
                const next = tree.child(renderer, "Panel", "minimap_overlay_root", {
                    ...probe.compositionProperties(diagnostic.controls?.composition)
                });
                if (next !== crates) {
                    createdComposition = diagnostic.controls?.composition || "cache";
                    for (const panel of [crates, markers, crateImage]) owned.delete(panel);
                    crates = next; markers = crateImage = null; crateReady = false;
                }
                const nextMarkers = ensure(crates, "minimap_markers", markers);
                if (nextMarkers !== markers) {
                    for (const panel of [markers, crateImage]) owned.delete(panel);
                    markers = nextMarkers; crateImage = null; crateReady = false;
                }
                if (!P.isAlive(markers)) { show(crates, false); return; }
                // MapHunter fractions refer to the native render surface. Its
                // zoom/rotation must move ordinary crates with the other loot.
                if (!style(crates, { zIndex: "1", opacity: String(model.crateOpacity) })) { show(crates, false); return; }
                if (!crateReady) {
                    if (diagnostic.controls) diagnostic.stages.builds++;
                    crateImage = ensure(markers, "QOLMinimapCrateImage", crateImage);
                    if (!P.isAlive(crateImage)) { show(crates, false); return; }
                    const suffix = model.crateMarkerScale === 100 ? "" : "_" + model.crateMarkerScale;
                    crateReady = style(crateImage, { width: "100%", height: "100%", backgroundSize: "100% 100%",
                        backgroundRepeat: "no-repeat", backgroundImage: 'url("s2r://panorama/images/qollock/minimap_references_crates' + suffix + '.vsvg")' });
                }
                show(crates, crateReady && !diagnostic.controls?.hideRoot);
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
                    nativeStyles.apply(panel, styles);
                }
            }

            function render(model, view) {
                lastView = view;
                if (diagnostic.controls?.releaseGeometry) released.geometry = geometry.release(true);
                else {
                    geometry.setDrawOverUi(Boolean(view.drawOverUi));
                    released.geometry = geometry.apply({ ...view, fixedIcons: model.fixedIcons,
                        hidden: Q.presentation.shouldHide("minimap", Q.presentation.visibilityConfig(ctx), rootOwner), diagnosticControls: diagnostic.controls });
                }
                if (diagnostic.controls?.releaseDecoration) released.decoration = nativeStyles.clear();
                else renderNativeDecoration(model, view);
                renderTunnel(view);
                renderCrates(model);
            }

            function renderNativeDecoration(model, view) {
                const targets = diagnostic.controls?.releaseNativeTargets;
                if (diagnostic.controls) nativeReleaseResults = {};
                const minimalist = !view.zoomed && model.minimalist;
                const rendererResult = nativeStyles.apply(renderer, !targets?.includes("renderer") && minimalist ? { backgroundColor: "rgba(0, 0, 0, 0)" } : {},
                    targets?.includes("renderer") ? {} : { minimalist_minimap_active: minimalist });
                const mapResult = nativeStyles.apply(mapRender, !targets?.includes("mapRender") && minimalist ? { opacity: String(model.minimalOpacity), brightness: "1.0", washColor: "none" } : {});
                if (diagnostic.controls) { nativeReleaseResults.renderer = rendererResult; nativeReleaseResults.mapRender = mapResult; nativeReleaseResults.backgrounds = true; }
                // hud_minimap.css selects the surface/underground/tunnel layer
                // with opacity. Preserve those native gates while fading it.
                const midtown = hasClass(renderer, "dl_midtown");
                const underground = hasClass(renderer, "is_underground"), tunnels = hasClass(renderer, "in_tunnels");
                for (const image of backgroundImages) {
                    const hidden = midtown && (image.BHasClass("backgroundImage1") ? underground || tunnels :
                        image.BHasClass("backgroundImage2") ? !underground : !tunnels);
                    const applied = nativeStyles.apply(image, !targets?.includes("backgrounds") && minimalist ? { opacity: hidden ? "0" : String(model.minimalOpacity) } : {});
                    if (diagnostic.controls) nativeReleaseResults.backgrounds = applied && nativeReleaseResults.backgrounds;
                }
                const canvasResult = nativeStyles.apply(canvas, !targets?.includes("canvas") && model.iconColor ? { washColor: model.iconColor } : {});
                if (diagnostic.controls) nativeReleaseResults.canvas = canvasResult;
                if (targets?.includes("ranges")) {
                    nativeReleaseResults.ranges = true;
                    for (const panel of rangePanels) nativeReleaseResults.ranges = nativeStyles.apply(panel, {}) && nativeReleaseResults.ranges;
                } else renderRange(view.size);
            }

            function update() {
                if (!active) return;
                if (diagnostic.controls) { diagnostic.stages.updates++; diagnostic.stages.discovery++; }
                const root = P.findHud($.GetContextPanel());
                if (root !== rootOwner) { releasePresentation(); rootOwner = root; }
                if (diagnostic.controls?.skipSweep) diagnostic.stages.skippedSweeps++;
                else { if (diagnostic.controls) diagnostic.stages.sweeps++; if (!tree.sweep()) crateReady = false; }
                if (!P.isAlive(root) || (root.id !== "Hud" && root.paneltype !== "CitadelHud")) { releasePresentation(); return; }
                const host = discover(root);
                if (!P.isAlive(host)) { show(tunnel, false); show(crates, false); return; }
                const alt = model.alt && (hasClass(host, "gDetailView") || Q.core.hud.isClassActive("gDetailView"));
                const tab = model.tab && Q.core.hud.isScoreboardOpen(root, host);
                render(model, alt ? model.altView : tab ? model.tabView : model.base);
                if (diagnostic.controls) diagnostic.stages.render++;
            }

            function syncLoop() {
                if (!active) return;
                // rate-exempt: native doorway ranges and Alt view require smooth refresh.
                const rate = model.alt || Math.abs(model.base.size - 400) >= 0.5 ? 0.05 : 0.5;
                if (loop && currentRate !== rate) { loop.stop(); loop = null; }
                if (!loop) { currentRate = rate; loop = Q.core.Scheduler.createPollLoop(update, rate, id); }
            }

            function scoreboardRefresh() { if (active) Q.core.Scheduler.scheduleOnce(update, 0, ctx.id || id); }

            function release() {
                active = false;
                diagnostic.cancel();
                ctx.events?.off("engine:scoreboard_toggle", scoreboardRefresh);
                if (loop) { loop.stop(); loop = null; }
                currentRate = 0;
                Q.core.Scheduler.cancelAllForFeature(id);
                releasePresentation(); tree.dispose(); model = rootOwner = null;
            }

            function releasePresentation() {
                geometry.release();
                nativeStyles.clear();
                for (const panel of owned.keys()) releasePanel(panel);
                releaseOverlays();
                rangePanels = [];
                anchor = renderer = canvas = mapRender = null;
                backgroundImages = [];
                canvasResolver.reset(); renderResolver.reset();
            }

            function refresh() {
                if (!active) return;
                const previousScale = model?.crateMarkerScale;
                model = readModel();
                if (previousScale !== model.crateMarkerScale) crateReady = false;
                geometry.resetDiscovery(); canvasResolver.reset(); renderResolver.reset();
                syncLoop(); update();
            }

            return {
                diagnostics: { begin: diagnostic.begin, inspect: diagnostic.inspect,
                    retirement: () => ({ inactive: !active, tree: tree.isReleased(), geometry: geometry.isReleased(), decoration: nativeStyles.isReleased() }) },
                onEnable() { active = true; ctx.events?.on("engine:scoreboard_toggle", scoreboardRefresh); refresh(); },
                onDisable: release,
                onSettingsChanged: refresh
            };
        },
        test() {
            const minimap = P.findTraverse($.GetContextPanel(), "hud_minimap");
            return { passed: Boolean(minimap), name: "Minimap runtime panel exists", message: minimap ? "" : "hud_minimap not found in HUD tree" };
        }
    });
})();

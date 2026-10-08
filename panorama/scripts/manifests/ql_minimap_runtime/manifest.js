// manifests/ql_minimap_runtime/manifest.js
// =============================================================================
// QOLLOCK — Minimap Runtime (Zoom, Sizing, Overlays, Customization)
// =============================================================================
// OWNS:        Minimap sizing/offset, Alt/Tab zoom, draw-over-UI stacking,
//              crate overlay markers, tunnel overlay, minimalist map opacity,
//              and icon canvas wash color.
// DOES NOT OWN: Native minimap renderer or CitadelMinimap engine component.
// DEPENDS ON:  QOL.core.FeatureRegistry, QOL.core.Scheduler, QOL.core.Hud
// CONFIG KEYS: ENABLE_ALT_ZOOM, ENABLE_TAB_ZOOM, MINIMAP_BASE_OPACITY,
//              MINIMAL_MINIMAP, MINIMAL_MINIMAP_OPACITY, MINIMAP_SMALL_SIZE,
//              MINIMAP_X_OFFSET, MINIMAP_Y_OFFSET, MINIMAP_LARGE_SIZE_ALT,
//              MINIMAP_LARGE_SIZE_TAB, ZOOM_X_OFFSET_ALT, ZOOM_Y_OFFSET_ALT,
//              ZOOM_X_OFFSET_TAB, ZOOM_Y_OFFSET_TAB, ALT_ZOOM_OPACITY,
//              TAB_ZOOM_OPACITY, ALT_ZOOM_DRAW_OVER_UI, TAB_ZOOM_DRAW_OVER_UI,
//              ENABLE_MINIMAP_CRATE_OVERLAY, ENABLE_MINIMAP_REM_TUNNELS,
//              MINIMAP_REM_TUNNELS_OPACITY, ENABLE_ALT_ZOOM_REM_TUNNELS,
//              ALT_ZOOM_REM_TUNNELS_OPACITY, ENABLE_TAB_ZOOM_REM_TUNNELS,
//              TAB_ZOOM_REM_TUNNELS_OPACITY, MINIMAP_ICON_COLOR
// CSS:         minimalist_minimap_active, tunnel_locked_on
// PATTERN:     Polling (20Hz, 0.05s). Self-scheduling via Scheduler.
// =============================================================================

(function() {
    "use strict";

    var FR = QOL.core.FeatureRegistry;
    if (!FR) {
        $.Msg("[QOLLock] ql_minimap_runtime: FeatureRegistry not found — aborting");
        return;
    }

    if (typeof QOL !== "undefined" && QOL) {
        QOL.ensureMinimapOverlayAnchor = function(root) {
            if (!root || !root.FindChildTraverse) return null;
            return root.FindChildTraverse("minimap_container") || root.FindChildTraverse("minimap_persp") || null;
        };
    }

    var PANEL_ID_MINIMAP = "hud_minimap";
    var MINIMAP_CAST_RANGE_BASE_SIZE = 400.0;
    var MINIMAP_LAYOUT_BASE_SIZE_PX = 400;
    var MINIMAP_CRATE_OVERLAY_MARKER_BORDER_OPACITY = 0.45;
    var MINIMAP_CRATE_OVERLAY_MARKER_OPACITY = 0.75;
    var MINIMAP_CRATE_OVERLAY_MARKER_SIZE_PX = 2;

    var isPanelValid = QOL.utils.IsPanelValid;

    function setPanelOpacitySafe(panel, opacityText, fallback) {
        if (!isPanelValid(panel)) return;
        var val = (opacityText !== undefined && opacityText !== null && opacityText !== "") ? opacityText : fallback;
        try { panel.style.opacity = String(val); } catch(e) {}
    }

    function hasClassInHierarchy(panel, className) {
        var current = panel;
        while (current) {
            if (current.BHasClass && current.BHasClass(className)) return true;
            current = current.GetParent ? current.GetParent() : null;
        }
        return false;
    }

    function normalizePaletteColorIndex(value) {
        return QOL_UTILS.NormalizePaletteColorIndex(value);
    }

    function resolveWashColorFromPalette(value) {
        return QOL_UTILS.ResolveWashColorFromPalette(value);
    }

    function setWashColorSafe(panel, color) {
        if (!isPanelValid(panel)) return;
        try {
            if (color) {
                panel.style.washColor = String(color);
            } else {
                panel.style.washColor = "none";
            }
        } catch(e) {}
    }

    function readMinimapIconColorIndex(cfg) {
        return normalizePaletteColorIndex(cfg && cfg.MINIMAP_ICON_COLOR);
    }

    function resolveMinimapCrateOverlayMapKey() {
        // Game.GetMapInfo confirmed absent — minimap crate map detection disabled.
        return "";
    }

    FR.register({
        id: "ql_minimap_runtime",
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
        create: function(ctx) {
            var _loop = null;
            const geometry = QOL.features.minimapGeometry.create();

            // Runtime state
            var _cachedPanels = [];
            var _lastZoomState = null;
            var _minimapRuntimeSig = "";
            var _configDirty = true;
            var _minimapMinimalistOpacityApplied = false;
            var _minimapCastRangeScaleApplied = false;
            var _minimapIconColorStyleSig = "";
            var _cachedMinimapTunnelHidden = false;
            var _cachedMinimapCrateHidden = false;
            var _minimapCrateOverlayBuildSig = "";


            // Cached panel references
            var _tunnelOverlay = null;
            var _crateOverlay = null;
            var _crateMarkers = null;
            var _overlayAnchor = null;
            var _minimapCanvas = null;
            var _hudMinimapPanel = null;
            var _mapRenderPanel = null;
            var _nextFallbackCastRangeScanMs = 0;

            function _ensureMinimapOverlayAnchor(root) {
                if (isPanelValid(_overlayAnchor)) return _overlayAnchor;
                var anchor = _cachedPanels.find(panel => panel.id === "minimap_container") ||
                    _cachedPanels.find(panel => panel.id === "minimap_persp");
                _overlayAnchor = anchor || null;
                return _overlayAnchor;
            }

            function _ensureMinimapTunnelOverlay(root) {
                var anchor = _ensureMinimapOverlayAnchor(root);
                if (!anchor) return null;
                var overlay = _tunnelOverlay;
                if (!isPanelValid(overlay)) {
                    overlay = anchor.FindChildTraverse ? (anchor.FindChildTraverse("tunnel_overlay") || null) : null;
                    if (!overlay) {
                        overlay = $.CreatePanel("Panel", anchor, "tunnel_overlay", {
                            hittest: "false",
                            hittestchildren: "false"
                        });
                    }
                } else if (overlay.GetParent && overlay.GetParent() !== anchor && overlay.SetParent) {
                    overlay.SetParent(anchor);
                }
                if (!overlay) return null;
                overlay.hittest = false;
                overlay.hittestchildren = false;
                if (!overlay._tunnelStyleInitialized) {
                    overlay.style.backgroundImage = 'url("s2r://panorama/images/minimap/base/mm_tunnel_overlay_png_png.vtex")';
                    overlay.style.backgroundSize = "100% 100%";
                    overlay.style.backgroundRepeat = "no-repeat";
                    overlay.style.backgroundPosition = "center";
                    overlay._tunnelStyleInitialized = true;
                }
                _tunnelOverlay = overlay;
                return overlay;
            }

            function _hideMinimapTunnelOverlay(root) {
                var overlay = isPanelValid(_tunnelOverlay) ? _tunnelOverlay : (root && root.FindChildTraverse ? root.FindChildTraverse("tunnel_overlay") : null);
                if (!overlay) return;
                if (overlay.RemoveClass) overlay.RemoveClass("tunnel_locked_on");
                if (overlay.SetHasClass) overlay.SetHasClass("qol-hidden", true);
                else overlay.style.visibility = "collapse";
                if (overlay.style.opacity !== "0.75") overlay.style.opacity = "0.75";
            }

            function _updateMinimapTunnelOverlay(root, cfg, activeZoomMode) {
                var mode = String(activeZoomMode || "");
                var enabled = Number(cfg.ENABLE_MINIMAP_REM_TUNNELS) === 1;
                var opacityValue = cfg && cfg.MINIMAP_REM_TUNNELS_OPACITY;
                if (mode === "ALT") {
                    enabled = Number(cfg.ENABLE_ALT_ZOOM_REM_TUNNELS) === 1;
                    opacityValue = cfg && cfg.ALT_ZOOM_REM_TUNNELS_OPACITY;
                } else if (mode === "TAB") {
                    enabled = Number(cfg.ENABLE_TAB_ZOOM_REM_TUNNELS) === 1;
                    opacityValue = cfg && cfg.TAB_ZOOM_REM_TUNNELS_OPACITY;
                }

                if (!enabled) {
                    if (_cachedMinimapTunnelHidden) return;
                    _cachedMinimapTunnelHidden = true;
                    _hideMinimapTunnelOverlay(root);
                    return;
                }
                _cachedMinimapTunnelHidden = false;
                var overlay = _ensureMinimapTunnelOverlay(root);
                if (!overlay) return;
                var opacity = Number(opacityValue);
                if (!isFinite(opacity)) opacity = 0.75;
                if (opacity < 0) opacity = 0;
                if (opacity > 1) opacity = 1;
                if (overlay.AddClass) overlay.AddClass("tunnel_locked_on");
                var opText = opacity.toFixed(2);
                if (overlay.style.opacity !== opText) overlay.style.opacity = opText;
                if (overlay.SetHasClass) overlay.SetHasClass("qol-hidden", false);
                else overlay.style.visibility = "visible";
            }

            function _ensureMinimapCrateOverlay(root) {
                var anchor = _ensureMinimapOverlayAnchor(root);
                if (!anchor) return null;
                var overlay = _crateOverlay;
                var markers = _crateMarkers;
                if (!isPanelValid(overlay)) {
                    overlay = anchor.FindChildTraverse ? (anchor.FindChildTraverse("minimap_overlay_root") || null) : null;
                    if (!overlay) {
                        overlay = $.CreatePanel("Panel", anchor, "minimap_overlay_root", {
                            hittest: "false",
                            hittestchildren: "false"
                        });
                    }
                } else if (overlay.GetParent && overlay.GetParent() !== anchor && overlay.SetParent) {
                    overlay.SetParent(anchor);
                }
                if (!overlay) return null;
                overlay.hittest = false;
                overlay.hittestchildren = false;

                if (!isPanelValid(markers)) {
                    markers = overlay.FindChildTraverse ? (overlay.FindChildTraverse("minimap_markers") || null) : null;
                    if (!markers) {
                        markers = $.CreatePanel("Panel", overlay, "minimap_markers", {
                            hittest: "false",
                            hittestchildren: "false"
                        });
                    }
                }
                if (!markers) return null;
                markers.hittest = false;
                markers.hittestchildren = false;

                _crateOverlay = overlay;
                _crateMarkers = markers;
                return { root: overlay, markers: markers };
            }

            function _clearMinimapCrateOverlayMarkers(markers) {
                if (markers && markers.RemoveAndDeleteChildren) {
                    markers.RemoveAndDeleteChildren();
                }
            }

            function _buildMinimapCrateOverlay(root, mapName) {
                var panels = _ensureMinimapCrateOverlay(root);
                if (!panels || !panels.root || !panels.markers) return null;
                var overlay = panels.root;
                var markers = panels.markers;

                var dataRoot = null;
                if (typeof QOL !== "undefined" && QOL.minimapCrateData) dataRoot = QOL.minimapCrateData;
                else if (typeof CRATE_DATA === "object" && CRATE_DATA) dataRoot = CRATE_DATA;
                else if (typeof MINIMAP_CRATE_DATA === "object" && MINIMAP_CRATE_DATA) dataRoot = MINIMAP_CRATE_DATA;

                var mapData = dataRoot && mapName ? dataRoot[mapName] : null;
                var points = null;
                if (mapData && Array.isArray(mapData.crates)) points = mapData.crates;
                else if (Array.isArray(mapData)) points = mapData;

                if (!Array.isArray(points) || points.length <= 0) {
                    _clearMinimapCrateOverlayMarkers(markers);
                    _minimapCrateOverlayBuildSig = "";
                    return overlay;
                }

                var buildSig = String(mapName) + "|" + String(points.length);
                if (_minimapCrateOverlayBuildSig === buildSig && markers.GetChildCount && Number(markers.GetChildCount()) === points.length) {
                    return overlay;
                }

                _clearMinimapCrateOverlayMarkers(markers);
                for (var i = 0; i < points.length; i++) {
                    var point = points[i];
                    var u = Array.isArray(point) ? Number(point[0]) : Number(point && point.u);
                    var v = Array.isArray(point) ? Number(point[1]) : Number(point && point.v);
                    if (!isFinite(u) || !isFinite(v)) continue;
                    var marker = $.CreatePanel("Panel", markers, "");
                    marker.AddClass("minimap_marker");
                    marker.style.position = (u * 100) + "% " + (v * 100) + "% 0";
                    marker.style.width = MINIMAP_CRATE_OVERLAY_MARKER_SIZE_PX + "px";
                    marker.style.height = MINIMAP_CRATE_OVERLAY_MARKER_SIZE_PX + "px";
                    marker.style.transform = "translateX(" + (-MINIMAP_CRATE_OVERLAY_MARKER_SIZE_PX / 2) + "px) translateY(" + (-MINIMAP_CRATE_OVERLAY_MARKER_SIZE_PX / 2) + "px)";
                    marker.style.opacity = "1.0";
                    marker.style.backgroundColor = "rgba(255, 213, 74, " + MINIMAP_CRATE_OVERLAY_MARKER_OPACITY.toFixed(2) + ")";
                    marker.style.border = "1px solid rgba(42, 33, 0, " + MINIMAP_CRATE_OVERLAY_MARKER_BORDER_OPACITY.toFixed(2) + ")";
                }
                _minimapCrateOverlayBuildSig = buildSig;
                return overlay;
            }

            function _hideMinimapCrateOverlay(root) {
                var overlay = isPanelValid(_crateOverlay) ? _crateOverlay : (root && root.FindChildTraverse ? root.FindChildTraverse("minimap_overlay_root") : null);
                if (overlay) {
                    if (overlay.SetHasClass) overlay.SetHasClass("qol-hidden", true);
                    else overlay.style.visibility = "collapse";
                }
            }

            function _updateMinimapCrateOverlay(root, cfg) {
                var enabled = Number(cfg.ENABLE_MINIMAP_CRATE_OVERLAY) === 1;
                if (!enabled) {
                    if (_cachedMinimapCrateHidden) return;
                    _cachedMinimapCrateHidden = true;
                    _hideMinimapCrateOverlay(root);
                    return;
                }
                _cachedMinimapCrateHidden = false;
                var mapKey = resolveMinimapCrateOverlayMapKey();
                var renderMapKey = mapKey || "dl_midtown";
                var overlay = _buildMinimapCrateOverlay(root, renderMapKey);
                if (!overlay) return;
                if (overlay.SetHasClass) overlay.SetHasClass("qol-hidden", false);
                else overlay.style.visibility = "visible";
            }

            function _updateMinimapIconColor(root, cfg) {
                var color = resolveWashColorFromPalette(readMinimapIconColorIndex(cfg));
                var canvas = _minimapCanvas;
                if (!isPanelValid(canvas) && root && root.FindChildTraverse) {
                    var hudMinimap = isPanelValid(_hudMinimapPanel) ? _hudMinimapPanel : root.FindChildTraverse(PANEL_ID_MINIMAP);
                    if (hudMinimap) {
                        _hudMinimapPanel = hudMinimap;
                        canvas = hudMinimap.FindChildTraverse ? hudMinimap.FindChildTraverse("canvas") : null;
                    }
                    _minimapCanvas = canvas;
                }
                if (!canvas) {
                    _minimapIconColorStyleSig = "";
                    return;
                }

                var styleSig = color || "default";
                if (_minimapIconColorStyleSig === styleSig) return;
                setWashColorSafe(canvas, color);
                _minimapIconColorStyleSig = styleSig;
            }

            function _updateMinimapCastRangeScale(root, targetSize) {
                var size = Number(targetSize);
                if (!isFinite(size) || size <= 0) size = MINIMAP_CAST_RANGE_BASE_SIZE;

                // At base 400px geometry, native Deadlock minimap renders cast ranges without distortion.
                if (Math.abs(size - MINIMAP_CAST_RANGE_BASE_SIZE) < 0.5) {
                    if (!_minimapCastRangeScaleApplied) return;
                    _minimapCastRangeScaleApplied = false;
                    return;
                }

                var hudMinimap = isPanelValid(_hudMinimapPanel) ? _hudMinimapPanel : (root && root.FindChildTraverse ? root.FindChildTraverse(PANEL_ID_MINIMAP) : null);
                if (hudMinimap) _hudMinimapPanel = hudMinimap;
                if (!hudMinimap) return;

                var mapButtons = (hudMinimap && hudMinimap.FindChildrenWithClassTraverse)
                    ? (hudMinimap.FindChildrenWithClassTraverse("doorman_doorway") || [])
                    : [];
                if (mapButtons.length === 0 && hudMinimap && hudMinimap.FindChildrenWithClassTraverse) {
                    mapButtons = hudMinimap.FindChildrenWithClassTraverse("ability_castrange") || [];
                }

                var rangePanels = [];
                for (var i = 0; i < mapButtons.length; i++) {
                    var castRange = mapButtons[i] && mapButtons[i].FindChildTraverse ? mapButtons[i].FindChildTraverse("CastRange") : null;
                    if (castRange) rangePanels.push(castRange);
                }

                if (rangePanels.length <= 0 && _minimapCastRangeScaleApplied && root && root.FindChildTraverse) {
                    var nowMs = (typeof QOL_UTILS !== "undefined" && QOL_UTILS.PerfNowMs) ? QOL_UTILS.PerfNowMs() : Date.now();
                    if (nowMs >= _nextFallbackCastRangeScanMs) {
                        _nextFallbackCastRangeScanMs = nowMs + 1000;
                        var fallbackCastRange = root.FindChildTraverse("CastRange");
                        if (fallbackCastRange) rangePanels.push(fallbackCastRange);
                    }
                }

                for (var j = 0; j < rangePanels.length; j++) {
                    var panel = rangePanels[j];
                    if (!panel || !panel.style) continue;
                    if (panel.style.uiScale !== "100%") {
                        panel.style.uiScale = "100%";
                    }
                    if (panel.style.preTransformScale2d !== "1.00, 1.00") {
                        panel.style.preTransformScale2d = "1.00, 1.00";
                    }
                }
                _minimapCastRangeScaleApplied = rangePanels.length > 0;
            }

            function _buildMinimapRuntimeSignature(cfg) {
                if (!cfg) return "";
                return [
                    Number(cfg.ENABLE_ALT_ZOOM) === 1 ? "1" : "0",
                    Number(cfg.ENABLE_TAB_ZOOM) === 1 ? "1" : "0",
                    Number(cfg.MINIMAL_MINIMAP) === 1 ? "1" : "0",
                    String(Math.round(Number(cfg.MINIMAP_SMALL_SIZE) || 400)),
                    Number(cfg.MINIMAP_FIXED_ICON_SIZE) === 1 ? "1" : "0",
                    String(isFinite(Number(cfg.MINIMAP_BASE_OPACITY)) ? Number(cfg.MINIMAP_BASE_OPACITY) : 1),
                    String(Math.round(Number(cfg.MINIMAP_X_OFFSET) || 0)),
                    String(Math.round(Number(cfg.MINIMAP_Y_OFFSET) || 0)),
                    String(Number(cfg.MINIMAP_LARGE_SIZE_ALT) || Number(cfg.MINIMAP_LARGE_SIZE) || 0),
                    String(Number(cfg.MINIMAP_LARGE_SIZE_TAB) || Number(cfg.MINIMAP_LARGE_SIZE) || 0),
                    String(Number(cfg.ZOOM_X_OFFSET_ALT) || Number(cfg.ZOOM_X_OFFSET) || 0),
                    String(Number(cfg.ZOOM_Y_OFFSET_ALT) || Number(cfg.ZOOM_Y_OFFSET) || 0),
                    String(Number(cfg.ZOOM_X_OFFSET_TAB) || Number(cfg.ZOOM_X_OFFSET) || 0),
                    String(Number(cfg.ZOOM_Y_OFFSET_TAB) || Number(cfg.ZOOM_Y_OFFSET) || 0),
                    String(isFinite(Number(cfg.ALT_ZOOM_OPACITY)) ? Number(cfg.ALT_ZOOM_OPACITY) : 1),
                    String(isFinite(Number(cfg.TAB_ZOOM_OPACITY)) ? Number(cfg.TAB_ZOOM_OPACITY) : 1),
                    String(Number(cfg.MINIMAL_MINIMAP_OPACITY) || 0.9),
                    Number(cfg.ALT_ZOOM_DRAW_OVER_UI) === 1 ? "1" : "0",
                    Number(cfg.TAB_ZOOM_DRAW_OVER_UI) === 1 ? "1" : "0",
                    Number(cfg.ENABLE_MINIMAP_CRATE_OVERLAY) === 1 ? "1" : "0",
                    Number(cfg.ENABLE_MINIMAP_REM_TUNNELS) === 1 ? "1" : "0",
                    String(isFinite(Number(cfg.MINIMAP_REM_TUNNELS_OPACITY)) ? Number(cfg.MINIMAP_REM_TUNNELS_OPACITY) : 0.75),
                    Number(cfg.ENABLE_ALT_ZOOM_REM_TUNNELS) === 1 ? "1" : "0",
                    String(isFinite(Number(cfg.ALT_ZOOM_REM_TUNNELS_OPACITY)) ? Number(cfg.ALT_ZOOM_REM_TUNNELS_OPACITY) : 0.75),
                    Number(cfg.ENABLE_TAB_ZOOM_REM_TUNNELS) === 1 ? "1" : "0",
                    String(isFinite(Number(cfg.TAB_ZOOM_REM_TUNNELS_OPACITY)) ? Number(cfg.TAB_ZOOM_REM_TUNNELS_OPACITY) : 0.75),
                    String(readMinimapIconColorIndex(cfg)),
                    resolveMinimapCrateOverlayMapKey()
                ].join("|");
            }

            function _getZoomValue(cfg, newKey, legacyKey, fallbackVal) {
                var val = cfg[newKey];
                if (val === undefined || val === null || !isFinite(Number(val))) {
                    val = cfg[legacyKey];
                }
                if (val === undefined || val === null || !isFinite(Number(val))) {
                    val = fallbackVal;
                }
                return Number(val);
            }

            function _isHudOrHierarchyClassActive(root, panel, className) {
                if (root && root.BHasClass && root.BHasClass(className)) return true;
                if (panel && hasClassInHierarchy(panel, className)) return true;
                var hudMinimap = isPanelValid(_hudMinimapPanel) ? _hudMinimapPanel : (root && root.FindChildTraverse ? root.FindChildTraverse(PANEL_ID_MINIMAP) : null);
                if (isPanelValid(hudMinimap)) {
                    _hudMinimapPanel = hudMinimap;
                    if (hudMinimap.BHasClass && hudMinimap.BHasClass(className)) return true;
                }
                if (typeof QOL !== "undefined") {
                    if (QOL.core && QOL.core.hud && typeof QOL.core.hud.isClassActive === "function" && QOL.core.hud.isClassActive(className)) return true;
                    if (typeof QOL.isHudClassActive === "function" && QOL.isHudClassActive(root, className)) return true;
                }
                return false;
            }

            function _onScoreboardToggle() {
                QOL.core.Scheduler.scheduleOnce(_tick, 0, ctx.id);
            }

            function _determineOptimalRate(cfg) {
                var hasAltZoom = (Number(cfg.ENABLE_ALT_ZOOM) === 1);
                var smallSize = Number(cfg.MINIMAP_SMALL_SIZE);
                var isCustomSize = isFinite(smallSize) && Math.abs(smallSize - MINIMAP_LAYOUT_BASE_SIZE_PX) >= 0.5;

                // rate-exempt: 20Hz (0.05s) when Alt zoom is active or custom minimap size has active doorway scaling
                if (hasAltZoom || isCustomSize) {
                    return 0.05;
                }
                return 0.5; // 2Hz idle when minimap is base 400px geometry (Tab zoom is reactive via engine:scoreboard_toggle)
            }

            var _currentRate = 0;

            function _syncLoop(cfg) {
                var targetRate = _determineOptimalRate(cfg);
                if (_loop && _currentRate !== targetRate) {
                    _loop.stop();
                    _loop = null;
                }
                if (!_loop) {
                    var S = QOL.core.Scheduler;
                    _currentRate = targetRate;
                    // rate-exempt: dynamically managed (10Hz when Alt zoom active, 2Hz idle / reactive Tab zoom)
                    _loop = (S && S.createPollLoop) ? S.createPollLoop(_tick, targetRate, "ql_minimap_runtime") : null;
                }
            }

            function _tick() {
                var root = $.GetContextPanel();
                if (!root) return;

                const resolved = geometry.resolve(root);
                _cachedPanels = resolved.panels;
                if (resolved.changed) {
                    if (isPanelValid(_minimapCanvas) && _minimapIconColorStyleSig) QOL.utils.ClearStyleSafe(_minimapCanvas, "washColor");
                    _configDirty = true;
                    _minimapRuntimeSig = "";
                    _overlayAnchor = null;
                    _minimapCanvas = null;
                    _hudMinimapPanel = resolved.renderer;
                    _mapRenderPanel = null;
                    _minimapIconColorStyleSig = "";
                    _minimapCrateOverlayBuildSig = "";
                    _cachedMinimapTunnelHidden = false;
                    _cachedMinimapCrateHidden = false;
                }
                if (!isPanelValid(resolved.host)) {
                    if (resolved.changed) {
                        _hideMinimapTunnelOverlay(root);
                        _hideMinimapCrateOverlay(root);
                    }
                    return;
                }
                var master = resolved.host;

                var cfg = ctx.config.view();

                var zoomAltEnabled = (Number(cfg.ENABLE_ALT_ZOOM) === 1);
                var zoomTabEnabled = (Number(cfg.ENABLE_TAB_ZOOM) === 1);

                var isAlt = zoomAltEnabled && _isHudOrHierarchyClassActive(root, master, "gDetailView");
                var isTab = zoomTabEnabled && QOL.core.hud.isScoreboardOpen(root, master);
                var currentZoomKey = (isAlt ? "A" : "") + (isTab ? "T" : "");
                var zoomChanged = (currentZoomKey !== _lastZoomState);

                var zoomAlt = isAlt;
                var zoomTab = isTab;
                var shouldZoom = zoomAlt || zoomTab;
                var activeZoomMode = zoomAlt ? "ALT" : (zoomTab ? "TAB" : "");
                var activeZoomModeForTunnels = activeZoomMode;
                geometry.setDrawOverUi((zoomAlt && Number(cfg.ALT_ZOOM_DRAW_OVER_UI) === 1) ||
                    (zoomTab && Number(cfg.TAB_ZOOM_DRAW_OVER_UI) === 1));

                var smallSize = Number(cfg.MINIMAP_SMALL_SIZE);
                if (!isFinite(smallSize) || smallSize <= 0) smallSize = MINIMAP_LAYOUT_BASE_SIZE_PX;
                var isBaseSize = Math.abs(smallSize - MINIMAP_LAYOUT_BASE_SIZE_PX) < 0.5;

                var zoomTargetSize = (activeZoomMode === "TAB")
                    ? _getZoomValue(cfg, "MINIMAP_LARGE_SIZE_TAB", "MINIMAP_LARGE_SIZE", cfg.MINIMAP_SMALL_SIZE)
                    : _getZoomValue(cfg, "MINIMAP_LARGE_SIZE_ALT", "MINIMAP_LARGE_SIZE", cfg.MINIMAP_SMALL_SIZE);
                var activeTargetSize = shouldZoom ? zoomTargetSize : smallSize;
                activeTargetSize = Number(activeTargetSize);
                if (!isFinite(activeTargetSize) || activeTargetSize <= 0) activeTargetSize = MINIMAP_LAYOUT_BASE_SIZE_PX;
                if (activeTargetSize < 50) activeTargetSize = 50;
                if (activeTargetSize > 1400) activeTargetSize = 1400;

                // Fast path: if zoom state hasn't changed, config is not dirty, and signature is initialized
                if (!zoomChanged && !_configDirty && _minimapRuntimeSig) {
                    if (!isBaseSize || shouldZoom) {
                        _updateMinimapCastRangeScale(root, activeTargetSize);
                    }
                    return;
                }

                _configDirty = false;
                var runtimeSig = _buildMinimapRuntimeSignature(cfg);


                _updateMinimapCastRangeScale(root, activeTargetSize);
                _updateMinimapIconColor(root, cfg);

                if (runtimeSig !== _minimapRuntimeSig || zoomChanged) {
                    var zoomOffsetX = (activeZoomMode === "TAB")
                        ? _getZoomValue(cfg, "ZOOM_X_OFFSET_TAB", "ZOOM_X_OFFSET", 0)
                        : _getZoomValue(cfg, "ZOOM_X_OFFSET_ALT", "ZOOM_X_OFFSET", 0);
                    var zoomOffsetY = (activeZoomMode === "TAB")
                        ? _getZoomValue(cfg, "ZOOM_Y_OFFSET_TAB", "ZOOM_Y_OFFSET", 0)
                        : _getZoomValue(cfg, "ZOOM_Y_OFFSET_ALT", "ZOOM_Y_OFFSET", 0);

                    var fixedIconSize = Number(cfg.MINIMAP_FIXED_ICON_SIZE) === 1;

                    var op = 1.0;
                    if (zoomAlt) {
                        op = cfg.ALT_ZOOM_OPACITY;
                    } else if (zoomTab) {
                        op = cfg.TAB_ZOOM_OPACITY;
                    } else {
                        op = cfg.MINIMAP_BASE_OPACITY;
                    }
                    op = Number(op);
                    if (!isFinite(op)) op = 1.0;
                    if (op < 0) op = 0;
                    if (op > 1) op = 1;

                    geometry.apply({ size: activeTargetSize, fixedIcons: fixedIconSize, zoomed: shouldZoom,
                        x: shouldZoom ? zoomOffsetX : Number(cfg.MINIMAP_X_OFFSET) || 0,
                        y: shouldZoom ? zoomOffsetY : Number(cfg.MINIMAP_Y_OFFSET) || 0, opacity: op });

                    var mapRenderPanel = isPanelValid(_mapRenderPanel) ? _mapRenderPanel :
                        (_hudMinimapPanel && _hudMinimapPanel.FindChildTraverse ? _hudMinimapPanel.FindChildTraverse("map_render") : null);
                    if (mapRenderPanel) {
                        _mapRenderPanel = mapRenderPanel;
                        var minimalistEnabled = (!zoomAlt && !zoomTab && Number(cfg.MINIMAL_MINIMAP) === 1);
                        if (minimalistEnabled) {
                            var minimalistOpacity = Number(cfg.MINIMAL_MINIMAP_OPACITY);
                            if (!isFinite(minimalistOpacity)) minimalistOpacity = 0.9;
                            if (minimalistOpacity < 0) minimalistOpacity = 0;
                            if (minimalistOpacity > 1) minimalistOpacity = 1;
                            setPanelOpacitySafe(mapRenderPanel, minimalistOpacity, 1.0);
                            mapRenderPanel.style.brightness = "1.0";
                            mapRenderPanel.style.washColor = "none";
                            var hudMinimap = isPanelValid(_hudMinimapPanel) ? _hudMinimapPanel : root.FindChildTraverse(PANEL_ID_MINIMAP);
                            if (hudMinimap) {
                                _hudMinimapPanel = hudMinimap;
                                if (hudMinimap.AddClass) hudMinimap.AddClass("minimalist_minimap_active");
                                hudMinimap.style.backgroundColor = "rgba(0, 0, 0, 0)";
                            }
                            _minimapMinimalistOpacityApplied = true;
                        } else if (_minimapMinimalistOpacityApplied) {
                            setPanelOpacitySafe(mapRenderPanel, 1.0, 1.0);
                            mapRenderPanel.style.brightness = "1.0";
                            mapRenderPanel.style.washColor = "none";
                            var resetMinimap = isPanelValid(_hudMinimapPanel) ? _hudMinimapPanel : root.FindChildTraverse(PANEL_ID_MINIMAP);
                            if (resetMinimap) {
                                if (resetMinimap.RemoveClass) resetMinimap.RemoveClass("minimalist_minimap_active");
                                resetMinimap.style.backgroundColor = "rgba(0, 0, 0, 0)";
                            }
                            _minimapMinimalistOpacityApplied = false;
                        }
                    }

                    _lastZoomState = currentZoomKey;
                    _minimapRuntimeSig = runtimeSig;
                }

                _updateMinimapTunnelOverlay(root, cfg, activeZoomModeForTunnels);
                _updateMinimapCrateOverlay(root, cfg);
            }

            return {
                onEnable: function() {
                    if (ctx && ctx.events && typeof ctx.events.on === "function") {
                        ctx.events.on("engine:scoreboard_toggle", _onScoreboardToggle);
                    }
                    _configDirty = true;
                    _minimapRuntimeSig = "";
                    var cfg = ctx.config.view ? ctx.config.view() : (ctx.config.all ? ctx.config.all() : {});
                    _syncLoop(cfg);
                    _tick();
                },
                onDisable: function() {
                    if (ctx && ctx.events && typeof ctx.events.off === "function") {
                        ctx.events.off("engine:scoreboard_toggle", _onScoreboardToggle);
                    }
                    if (_loop) {
                        _loop.stop();
                        _loop = null;
                    }
                    var S = QOL.core.Scheduler;
                    if (S) S.cancelAllForFeature("ql_minimap_runtime");

                    var root = $.GetContextPanel();
                    geometry.release();

                    _hideMinimapTunnelOverlay(root);
                    _hideMinimapCrateOverlay(root);

                    if (isPanelValid(_tunnelOverlay)) {
                        try { _tunnelOverlay.DeleteAsync(0); } catch(e) {}
                        _tunnelOverlay = null;
                    }
                    if (isPanelValid(_crateOverlay)) {
                        try { _crateOverlay.DeleteAsync(0); } catch(e) {}
                        _crateOverlay = null;
                        _crateMarkers = null;
                    }

                    _cachedPanels = [];
                    _lastZoomState = null;
                    _minimapRuntimeSig = "";
                    _minimapMinimalistOpacityApplied = false;
                    _minimapCastRangeScaleApplied = false;
                    _minimapIconColorStyleSig = "";
                    _cachedMinimapTunnelHidden = false;
                    _cachedMinimapCrateHidden = false;
                    _minimapCrateOverlayBuildSig = "";
                    _overlayAnchor = null;
                    _minimapCanvas = null;
                    _hudMinimapPanel = null;
                    _mapRenderPanel = null;
                    _configDirty = true;
                    _currentRate = 0;
                },
                onSettingsChanged: function() {
                    _configDirty = true;
                    _minimapRuntimeSig = "";
                    geometry.resetDiscovery();
                    var cfg = ctx.config.view ? ctx.config.view() : (ctx.config.all ? ctx.config.all() : {});
                    _syncLoop(cfg);
                    _tick();
                }
            };
        },
        test: function(ctx) {
            try {
                var root = $.GetContextPanel();
                var minimap = root ? root.FindChildTraverse("hud_minimap") : null;
                return {
                    passed: !!minimap,
                    name: "Minimap runtime panel exists",
                    message: minimap ? "" : "hud_minimap not found",
                    assertions: [{ passed: !!minimap, name: "hud_minimap panel exists" }]
                };
            } catch(e) {
                return {
                    passed: false,
                    name: "Minimap runtime panel check",
                    message: (e && e.message ? e.message : String(e))
                };
            }
        }
    });
})();

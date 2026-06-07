// ql_feat_minimapruntime.js — Minimap customization (zoom, opacity, crate/tunnel overlays, icon color)
// Extracted from ql_core.js, Phase 9 Step 2c
(function() {
    'use strict';
    var S = typeof QOL_STATE !== "undefined" ? QOL_STATE : undefined;
    var GC = typeof QOL_GetCachedPanel !== "undefined" ? QOL_GetCachedPanel : undefined;
    var SC = typeof QOL_SetCachedPanel !== "undefined" ? QOL_SetCachedPanel : undefined;
    var U = typeof QOL_UTILS !== "undefined" ? QOL_UTILS : undefined;
    var IsPanelValid = U ? U.IsPanelValid : function() { return false; };
    var IsCfgEnabled = U ? U.IsCfgEnabled : function() { return false; };
    var SetPanelOpacitySafe = U ? U.SetPanelOpacitySafe : function() {};
    var EnsureMinimapPanelCache = typeof QOL_EnsureMinimapPanelCache !== "undefined" ? QOL_EnsureMinimapPanelCache : function() {};
    var ResolveCachedPanel = typeof QOL_ResolveCachedPanel !== "undefined" ? QOL_ResolveCachedPanel : function() { return null; };
    var IsHudClassActive = typeof QOL_IsHudClassActive !== "undefined" ? QOL_IsHudClassActive : function() { return false; };

    if (typeof window !== "undefined" && !window._qol_feat_deps_logged) {
        window._qol_feat_deps_logged = {};
    }
    var _dk = "ql_feat_minimapruntime";
    if (typeof window !== "undefined" && window._qol_feat_deps_logged && !window._qol_feat_deps_logged[_dk]) {
        var _m = [];
        if (typeof QOL_STATE === "undefined") _m.push("QOL_STATE");
        if (typeof QOL_GetCachedPanel === "undefined") _m.push("QOL_GetCachedPanel");
        if (typeof QOL_SetCachedPanel === "undefined") _m.push("QOL_SetCachedPanel");
        if (typeof QOL_UTILS === "undefined") _m.push("QOL_UTILS");
        if (typeof QOL_EnsureMinimapPanelCache === "undefined") _m.push("QOL_EnsureMinimapPanelCache");
        if (_m.length > 0) {
            $.Msg("[QOLLock] WARNING: " + _dk + " missing " + _m.length + " bridge(s): " + _m.join(", ") + " — feature will fail");
        }
        window._qol_feat_deps_logged[_dk] = true;
    }

    function UpdateMinimapTunnelOverlay(root, cfg, activeZoomMode) {
        var mode = String(activeZoomMode || "");
        var enabled = !!(cfg && IsCfgEnabled(cfg, "ENABLE_MINIMAP_REM_TUNNELS"));
        var opacityValue = cfg && cfg.MINIMAP_REM_TUNNELS_OPACITY;
        if (mode === "ALT") {
            enabled = !!(cfg && IsCfgEnabled(cfg, "ENABLE_ALT_ZOOM_REM_TUNNELS"));
            opacityValue = cfg && cfg.ALT_ZOOM_REM_TUNNELS_OPACITY;
        } else if (mode === "TAB") {
            enabled = !!(cfg && IsCfgEnabled(cfg, "ENABLE_TAB_ZOOM_REM_TUNNELS"));
            opacityValue = cfg && cfg.TAB_ZOOM_REM_TUNNELS_OPACITY;
        }
        if (!enabled) {
            if (S._cachedMinimapTunnelHidden) return;
            S._cachedMinimapTunnelHidden = true;
            HideMinimapTunnelOverlay(root);
            return;
        }
        S._cachedMinimapTunnelHidden = false;
        var overlay = EnsureMinimapTunnelOverlay(root);
        if (!overlay) return;
        var opacity = Number(opacityValue);
        if (!isFinite(opacity)) opacity = 0.75;
        if (opacity < 0) opacity = 0;
        if (opacity > 1) opacity = 1;
        if (overlay.AddClass) overlay.AddClass("tunnel_locked_on");
        overlay.style.opacity = opacity.toFixed(2);
        if (overlay.style.visibility !== "visible") overlay.style.visibility = "visible";
    }

    function UpdateMinimapCrateOverlay(root, cfg) {
        var enabled = !!(cfg && IsCfgEnabled(cfg, "ENABLE_MINIMAP_CRATE_OVERLAY"));
        // Skip all work when disabled and already hidden — avoids ResolveMinimapCrateOverlayMapKey
        // and debug logging every tick.
        if (!enabled) {
            if (S._cachedMinimapCrateHidden) return;
            S._cachedMinimapCrateHidden = true;
            HideMinimapCrateOverlay(root);
            return;
        }
        S._cachedMinimapCrateHidden = false;
        var mapKey = ResolveMinimapCrateOverlayMapKey();
        var renderMapKey = mapKey || "dl_midtown";
        MinimapCrateOverlayDebugLogThrottled(
            "update|1|" + String(mapKey || "") + "|" + renderMapKey,
            "enabled=1 mapKey=" + String(mapKey || "<none>") + " renderMapKey=" + renderMapKey,
            PerfNowMs()
        );

        var overlay = BuildMinimapCrateOverlay(root, renderMapKey);
        if (!overlay) {
            MinimapCrateOverlayDebugLogThrottled("update|nooverlay|" + String(renderMapKey), "map=" + String(renderMapKey) + " overlay=<null>", PerfNowMs());
            return;
        }
        if (overlay.style.visibility !== "visible") overlay.style.visibility = "visible";
        MinimapCrateOverlayDebugLogThrottled(
            "update|visible|" + String(renderMapKey),
            "map=" + String(renderMapKey) + " overlayVisible=1",
            PerfNowMs()
        );
    }

    function BuildMinimapRuntimeSignature(cfg) {
        if (!cfg) return "";
        return [
            IsCfgEnabled(cfg, "ENABLE_ALT_ZOOM") ? "1" : "0",
            IsCfgEnabled(cfg, "ENABLE_TAB_ZOOM") ? "1" : "0",
            IsCfgEnabled(cfg, "MINIMAL_MINIMAP") ? "1" : "0",
            String(Math.round(Number(cfg.MINIMAP_SMALL_SIZE) || 400)),
            String(Number(cfg.MINIMAP_BASE_OPACITY) || 1),
            String(Math.round(Number(cfg.MINIMAP_X_OFFSET) || 0)),
            String(Math.round(Number(cfg.MINIMAP_Y_OFFSET) || 0)),
            String(Number(cfg.MINIMAP_LARGE_SIZE_ALT) || Number(cfg.MINIMAP_LARGE_SIZE) || 0),
            String(Number(cfg.MINIMAP_LARGE_SIZE_TAB) || Number(cfg.MINIMAP_LARGE_SIZE) || 0),
            String(Number(cfg.ZOOM_X_OFFSET_ALT) || Number(cfg.ZOOM_X_OFFSET) || 0),
            String(Number(cfg.ZOOM_Y_OFFSET_ALT) || Number(cfg.ZOOM_Y_OFFSET) || 0),
            String(Number(cfg.ZOOM_X_OFFSET_TAB) || Number(cfg.ZOOM_X_OFFSET) || 0),
            String(Number(cfg.ZOOM_Y_OFFSET_TAB) || Number(cfg.ZOOM_Y_OFFSET) || 0),
            String(Number(cfg.ALT_ZOOM_OPACITY) || 1),
            String(Number(cfg.TAB_ZOOM_OPACITY) || 1),
            String(Number(cfg.MINIMAL_MINIMAP_OPACITY) || 0.9),
            IsCfgEnabled(cfg, "ALT_ZOOM_DRAW_OVER_UI") ? "1" : "0",
            IsCfgEnabled(cfg, "TAB_ZOOM_DRAW_OVER_UI") ? "1" : "0",
            IsCfgEnabled(cfg, "ENABLE_MINIMAP_CRATE_OVERLAY") ? "1" : "0",
            IsCfgEnabled(cfg, "ENABLE_MINIMAP_REM_TUNNELS") ? "1" : "0",
            String(isFinite(Number(cfg.MINIMAP_REM_TUNNELS_OPACITY)) ? Number(cfg.MINIMAP_REM_TUNNELS_OPACITY) : 0.75),
            IsCfgEnabled(cfg, "ENABLE_ALT_ZOOM_REM_TUNNELS") ? "1" : "0",
            String(isFinite(Number(cfg.ALT_ZOOM_REM_TUNNELS_OPACITY)) ? Number(cfg.ALT_ZOOM_REM_TUNNELS_OPACITY) : 0.75),
            IsCfgEnabled(cfg, "ENABLE_TAB_ZOOM_REM_TUNNELS") ? "1" : "0",
            String(isFinite(Number(cfg.TAB_ZOOM_REM_TUNNELS_OPACITY)) ? Number(cfg.TAB_ZOOM_REM_TUNNELS_OPACITY) : 0.75),
            String(ReadMinimapIconColorIndex(cfg)),
            ResolveMinimapCrateOverlayMapKey()
        ].join("|");
    }

    function UpdateMinimapIconColor(root, cfg) {
        var color = ResolveWashColorFromPalette(ReadMinimapIconColorIndex(cfg));
        var canvas = GC("minimapCanvas");
        if (!canvas && root && root.FindChildTraverse) {
            var hudMinimapPanel = GC("hudMinimapPanel");
            if (!hudMinimapPanel) {
                hudMinimapPanel = root.FindChildTraverse(PANEL_ID_MINIMAP);
                SC("hudMinimapPanel", hudMinimapPanel);
            }
            canvas = hudMinimapPanel && hudMinimapPanel.FindChildTraverse
                ? hudMinimapPanel.FindChildTraverse("canvas")
                : null;
            if (!canvas) canvas = root.FindChildTraverse("canvas");
            SC("minimapCanvas", canvas);
        }
        if (!canvas) {
            S.minimapIconColorStyleSig = "";
            return;
        }

        var styleSig = color || "default";
        if (S.minimapIconColorStyleSig === styleSig) return;
        SetWashColorSafe(canvas, color);
        S.minimapIconColorStyleSig = styleSig;
    }

    function UpdateMinimapCastRangeScale(root, targetSize) {
        var size = Number(targetSize);
        if (!isFinite(size) || size <= 0) size = MINIMAP_CAST_RANGE_BASE_SIZE;
        // Skip the expensive FindChildrenWithClassTraverse when size hasn't changed
        if (size === S._cachedMinimapCastRangeSize) return;
        S._cachedMinimapCastRangeSize = size;
        var scale = MINIMAP_CAST_RANGE_BASE_SIZE / size;
        if (!isFinite(scale) || scale <= 0) scale = 1.0;
        if (scale < 0.20) scale = 0.20;
        if (scale > 2.00) scale = 2.00;
        var scaleText = scale.toFixed(3) + ", " + scale.toFixed(3);
        var hudMinimapPanel = ResolveCachedPanel(root, "hudMinimapPanel", PANEL_ID_MINIMAP)
        var rangePanels = [];
        if (hudMinimapPanel && hudMinimapPanel.FindChildrenWithClassTraverse) {
            var mapButtons = hudMinimapPanel.FindChildrenWithClassTraverse("map_button") || [];
            for (var i = 0; i < mapButtons.length; i++) {
                var castRange = mapButtons[i] && mapButtons[i].FindChildTraverse ? mapButtons[i].FindChildTraverse("CastRange") : null;
                if (castRange) rangePanels.push(castRange);
            }
        }
        if (rangePanels.length <= 0 && root && root.FindChildTraverse) {
            var fallbackCastRange = root.FindChildTraverse("CastRange");
            if (fallbackCastRange) rangePanels.push(fallbackCastRange);
        }
        for (var j = 0; j < rangePanels.length; j++) {
            var panel = rangePanels[j];
            if (!panel || !panel.style) continue;
            if (panel.style.preTransformScale2d !== scaleText) {
                panel.style.preTransformScale2d = scaleText;
            }
        }
        S.minimapCastRangeScaleApplied = rangePanels.length > 0 && Math.abs(scale - 1.0) > 0.001;
    }

    function UpdateMinimapRuntime(root, cfg, raw) {
        var minimapPanels = EnsureMinimapPanelCache(root);
        if (!minimapPanels || minimapPanels.length <= 0) return;
        var master = minimapPanels[0];
        var isAlt = IsHudClassActive(root, "gDetailView") || hasClassInHierarchy(master, "gDetailView");
        var isTab = IsHudClassActive(root, "gScoreboardOpen") || hasClassInHierarchy(master, "gScoreboardOpen");
        var zoomAlt = (isAlt && cfg.ENABLE_ALT_ZOOM === 1);
        var zoomTab = (isTab && cfg.ENABLE_TAB_ZOOM === 1);
        var activeZoomModeForTunnels = zoomAlt ? "ALT" : (zoomTab ? "TAB" : "");
        UpdateZoomDrawOverUi(root, cfg, zoomTab, zoomAlt, master);
        var currentZoomKey = (isAlt ? "A" : "") + (isTab ? "T" : "");
        var runtimeSig = S._cachedMinimapRuntimeSig || BuildMinimapRuntimeSignature(cfg);
        var shouldZoom = zoomAlt || zoomTab;
        var activeZoomMode = zoomAlt ? "ALT" : (zoomTab ? "TAB" : "");

        function getZoomValue(newKey, legacyKey, fallbackVal) {
            var val = cfg[newKey];
            if (val === undefined || val === null || !isFinite(Number(val))) {
                val = cfg[legacyKey];
            }
            if (val === undefined || val === null || !isFinite(Number(val))) {
                val = fallbackVal;
            }
            return Number(val);
        }

        var zoomTargetSize = (activeZoomMode === "TAB")
            ? getZoomValue("MINIMAP_LARGE_SIZE_TAB", "MINIMAP_LARGE_SIZE", cfg.MINIMAP_SMALL_SIZE)
            : getZoomValue("MINIMAP_LARGE_SIZE_ALT", "MINIMAP_LARGE_SIZE", cfg.MINIMAP_SMALL_SIZE);
        var activeTargetSize = shouldZoom ? zoomTargetSize : cfg.MINIMAP_SMALL_SIZE;
        activeTargetSize = Number(activeTargetSize);
        if (!isFinite(activeTargetSize) || activeTargetSize <= 0) activeTargetSize = MINIMAP_LAYOUT_BASE_SIZE_PX;
        if (activeTargetSize < 50) activeTargetSize = 50;
        if (activeTargetSize > 1400) activeTargetSize = 1400;
        var minimapSizeText = Math.round(activeTargetSize) + "px";
        UpdateMinimapCastRangeScale(root, activeTargetSize);
        UpdateMinimapIconColor(root, cfg);

        if (raw !== S.lastRawConfig || runtimeSig !== S.minimapRuntimeSig || currentZoomKey !== S.lastZoomState || S.accountPresetTestActive) {
            var zoomOffsetX = (activeZoomMode === "TAB")
                ? getZoomValue("ZOOM_X_OFFSET_TAB", "ZOOM_X_OFFSET", 0)
                : getZoomValue("ZOOM_X_OFFSET_ALT", "ZOOM_X_OFFSET", 0);
            var zoomOffsetY = (activeZoomMode === "TAB")
                ? getZoomValue("ZOOM_Y_OFFSET_TAB", "ZOOM_Y_OFFSET", 0)
                : getZoomValue("ZOOM_Y_OFFSET_ALT", "ZOOM_Y_OFFSET", 0);

            minimapPanels.forEach(function(p) {
                if (p.style.width !== minimapSizeText) p.style.width = minimapSizeText;
                if (p.style.height !== minimapSizeText) p.style.height = minimapSizeText;
                if (p.id === "minimap_persp") {
                    if (p.style.preTransformScale2d !== "1.00, 1.00") {
                        p.style.preTransformScale2d = "1.00, 1.00";
                    }
                    try {
                        p.style.transformOrigin = shouldZoom ? "50% 50%" : "100% 100%";
                    } catch (eOrigin) {}
                    p.style.align = shouldZoom ? "center center" : "right bottom";
                    if (shouldZoom) {
                        p.style.margin = (-zoomOffsetY) + "px 0px 0px " + zoomOffsetX + "px";
                    } else {
                        var marginX = 30 - (cfg.MINIMAP_X_OFFSET || 0);
                        var marginY = 30 + (cfg.MINIMAP_Y_OFFSET || 0);
                        p.style.margin = "0px " + marginX + "px " + marginY + "px 0px";
                    }
                }
                var op = 1.0;
                if (zoomAlt) {
                    op = cfg.ALT_ZOOM_OPACITY;
                } else if (zoomTab) {
                    op = cfg.TAB_ZOOM_OPACITY;
                } else {
                    op = cfg.MINIMAP_BASE_OPACITY || 1.0;
                }
                op = Number(op);
                if (!isFinite(op)) op = 1.0;
                if (op < 0) op = 0;
                if (op > 1) op = 1;
                if (p.id !== PANEL_ID_MINIMAP) {
                    SetPanelOpacitySafe(p, op, 1.0);
                }
            });

            var mapRenderPanel = ResolveCachedPanel(root, "minimapMapRender", "map_render")
            if (mapRenderPanel) {
                var minimalistEnabled = (!zoomAlt && !zoomTab && IsCfgEnabled(cfg, "MINIMAL_MINIMAP"));
                if (minimalistEnabled) {
                    var minimalistOpacity = Number(cfg.MINIMAL_MINIMAP_OPACITY);
                    if (!isFinite(minimalistOpacity)) minimalistOpacity = 0.9;
                    if (minimalistOpacity < 0) minimalistOpacity = 0;
                    if (minimalistOpacity > 1) minimalistOpacity = 1;
                    SetPanelOpacitySafe(mapRenderPanel, minimalistOpacity, 1.0);
                    mapRenderPanel.style.brightness = "1.0";
                    mapRenderPanel.style.washColor = "none";
                    var hudMinimapPanel = ResolveCachedPanel(root, "hudMinimapPanel", PANEL_ID_MINIMAP)
                    if (hudMinimapPanel) {
                        if (hudMinimapPanel.AddClass) hudMinimapPanel.AddClass("minimalist_minimap_active");
                        hudMinimapPanel.style.backgroundColor = "rgba(0, 0, 0, 0)";
                    }
                    S.minimapMinimalistOpacityApplied = true;
                } else if (S.minimapMinimalistOpacityApplied) {
                    // Reset once after leaving minimalist mode, then stop touching map_render opacity.
                    SetPanelOpacitySafe(mapRenderPanel, 1.0, 1.0);
                    mapRenderPanel.style.brightness = "1.0";
                    mapRenderPanel.style.washColor = "none";
                    var resetHudMinimapPanel = GC("hudMinimapPanel");
                    if (resetHudMinimapPanel) {
                        if (resetHudMinimapPanel.RemoveClass) {
                            resetHudMinimapPanel.RemoveClass("minimalist_minimap_active");
                        }
                        resetHudMinimapPanel.style.backgroundColor = "rgba(0, 0, 0, 0)";
                    }
                    S.minimapMinimalistOpacityApplied = false;
                }
            }
            S.lastZoomState = currentZoomKey;
            S.minimapRuntimeSig = runtimeSig;
        }
        UpdateMinimapTunnelOverlay(root, cfg, activeZoomModeForTunnels);
        UpdateMinimapCrateOverlay(root, cfg);
    }

    function UpdateZoomDrawOverUi(root, cfg, zoomTabActive, zoomAltActive, minimapPersp) {
        var nowMs = Date.now ? Date.now() : (new Date()).getTime();
        minimapPersp = IsPanelValid(minimapPersp)
            ? minimapPersp
            : (root && root.FindChildTraverse ? root.FindChildTraverse("minimap_persp") : null);
        if (!IsPanelValid(minimapPersp)) {
            S.minimapDrawOverUiActive = false;
            S.minimapDrawOverUiNextReassertMs = 0;
            return;
        }

        var drawOverUiTab = zoomTabActive && IsCfgEnabled(cfg, "TAB_ZOOM_DRAW_OVER_UI");
        var drawOverUiAlt = zoomAltActive && IsCfgEnabled(cfg, "ALT_ZOOM_DRAW_OVER_UI");
        var drawOverUi = drawOverUiTab || drawOverUiAlt;
        if (drawOverUi) {
            CaptureMinimapOriginalParent(minimapPersp);

            var targetRoot = ResolveHudRootForMinimapDraw(root);
            var reparented = false;
            if (targetRoot && minimapPersp.GetParent && minimapPersp.GetParent() !== targetRoot && minimapPersp.SetParent) {
                minimapPersp.SetParent(targetRoot);
                reparented = true;
            }

            var shouldReassertOrder = reparented ||
                !S.minimapDrawOverUiActive ||
                nowMs >= (S.minimapDrawOverUiNextReassertMs || 0);
            if (targetRoot && shouldReassertOrder && targetRoot.GetChildCount && targetRoot.GetChild && targetRoot.MoveChildAfter) {
                var count = targetRoot.GetChildCount();
                if (count > 0) {
                    var lastChild = targetRoot.GetChild(count - 1);
                    if (lastChild && lastChild !== minimapPersp) {
                        targetRoot.MoveChildAfter(minimapPersp, lastChild);
                    }
                }
            }

            S.minimapDrawOverUiNextReassertMs = nowMs + MINIMAP_DRAW_OVER_UI_REASSERT_MS;
            if (minimapPersp.style.zIndex !== "2147483647") {
                minimapPersp.style.zIndex = "2147483647";
            }
            S.minimapDrawOverUiActive = true;
            return;
        }

        if (S.minimapDrawOverUiActive ||
            (S.minimapDrawOverUiOriginalParent && minimapPersp.GetParent && minimapPersp.GetParent() !== S.minimapDrawOverUiOriginalParent)) {
            RestoreMinimapOriginalOrder(minimapPersp);
        }
        if (minimapPersp.style.zIndex !== "0") {
            minimapPersp.style.zIndex = "0";
        }
        S.minimapDrawOverUiActive = false;
        S.minimapDrawOverUiNextReassertMs = 0;
    }


    function NeedsMinimapRuntimeWork(cfg, raw) {
        if (!cfg) return false;
        var sig = BuildMinimapRuntimeSignature(cfg);
        S._cachedMinimapRuntimeSig = sig;
        if (raw !== S.lastRawConfig || sig !== S.minimapRuntimeSig || S.accountPresetTestActive || S.lastZoomState === null) return true;
        if (S.minimapRuntimeSig && !IsPanelListValid(S.cachedPanels.minimap)) return true;
        if (S.minimapDrawOverUiActive) return true;
        if (S.minimapMinimalistOpacityApplied && Number(cfg.MINIMAL_MINIMAP) !== 1) return true;
        if (Math.round(Number(cfg.MINIMAP_SMALL_SIZE) || MINIMAP_CAST_RANGE_BASE_SIZE) === MINIMAP_CAST_RANGE_BASE_SIZE && S.minimapCastRangeScaleApplied) return true;
        if (IsCfgEnabled(cfg, "ENABLE_MINIMAP_CRATE_OVERLAY") && ResolveMinimapCrateOverlayMapKey() === "dl_midtown" && !GC("minimapCrateOverlayRoot")) return true;
        if (
            (
                IsCfgEnabled(cfg, "ENABLE_MINIMAP_REM_TUNNELS") ||
                IsCfgEnabled(cfg, "ENABLE_ALT_ZOOM_REM_TUNNELS") ||
                IsCfgEnabled(cfg, "ENABLE_TAB_ZOOM_REM_TUNNELS")
            ) &&
            !GC("minimapTunnelOverlayRoot")
        ) return true;
        if (IsCfgEnabled(cfg, "ENABLE_ALT_ZOOM") || IsCfgEnabled(cfg, "ENABLE_TAB_ZOOM")) return true;
        return false;
    }

    // ── Registration ──
    QOL_REGISTER_FEATURE("minimapRuntime", {
        configKeys: ["ENABLE_ALT_ZOOM", "ENABLE_TAB_ZOOM", "MINIMAP_BASE_OPACITY",
                     "MINIMAL_MINIMAP", "MINIMAP_ROTATE_WITH_PLAYER", "MINIMAP_FLIP",
                     "ENABLE_MINIMAP_CRATE_OVERLAY", "ENABLE_MINIMAP_REM_TUNNELS",
                     "ENABLE_MINIMAP_ELEVATION_MARKERS", "MINIMAP_ICON_COLOR",
                     "ENABLE_MINIMAP_ALWAYS_ON_MID_BOSS"],
        bucket: 7, phase: -1,
        gate: function(cfg) { return NeedsMinimapRuntimeWork(cfg, S.lastRawConfig || ""); },
        update: function(root, cfg, nowMs, State, hideoutConnected, raw) {
            try {
                UpdateMinimapRuntime(root, cfg, raw);
            } catch(e) {
                $.Msg("[QOLLock][ERROR][" + _dk + "] " + (e && e.message ? e.message : String(e)) + "\n" + (e && e.stack ? String(e.stack) : ""));
                throw e;
            }
        },
        stateKeys: ["lastZoomState", "minimapRuntimeSig",
                    "minimapMinimalistOpacityApplied", "minimapCastRangeScaleApplied",
                    "_cachedMinimapCastRangeSize", "minimapIconColorStyleSig",
                    "cachedPanels.minimap", "cachedPanels.minimapMapRender",
                    "cachedPanels.hudMinimapPanel", "cachedPanels.minimapCanvas",
                    "cachedPanels.minimapCrateOverlayRoot",
                    "cachedPanels.minimapTunnelOverlayRoot"]
    });

    try {
        if (typeof UpdateMinimapRuntime !== "function") throw new Error("UpdateMinimapRuntime is not a function");
    } catch(e) {
        $.Msg("[QOLLock][ERROR][" + _dk + "] self-test failed: " + (e && e.message ? e.message : String(e)));
    }

})();

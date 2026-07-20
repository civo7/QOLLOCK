// ql_feat_minimapruntime.js — Minimap customization (zoom, opacity, crate/tunnel overlays, icon color)
// Extracted from ql_core.js, Phase 9 Step 2c
(function() {
    'use strict';
    var _featureId = "ql_feat_minimapruntime";
    // DEPENDS: ensureMinimapPanelCache, getCachedPanel, isHudClassActive, readMinimapIconColorIndex, resolveCachedPanel, resolveWashColorFromPalette, state, setCachedPanel, utils
    var _deps = QOL.import(["ensureMinimapPanelCache","getCachedPanel","isHudClassActive","readMinimapIconColorIndex","resolveCachedPanel","resolveWashColorFromPalette","state","setCachedPanel","utils"]);
    var GetCachedPanel = _deps.getCachedPanel;
    var RC = _deps.resolveCachedPanel;
    var RWP = _deps.resolveWashColorFromPalette;
    var State = _deps.state;
    var SetCachedPanel = _deps.setCachedPanel;
    var Utils = _deps.utils;
    var PerfNowMs = Utils.PerfNowMs;
    var IsCfgEnabled = Utils.IsCfgEnabled;
    var IsPanelValid = Utils.IsPanelValid;
    var SetStyleSafe = Utils.SetStyleSafe;
    var ClearStyleSafe = Utils.ClearStyleSafe;
    var SetPanelOpacitySafe = Utils.SetPanelOpacitySafe;
    var IsPanelListValid = Utils.IsPanelListValid;
    var ResolveWashColorFromPalette = QOL.resolveWashColorFromPalette || function() { return ""; };
    var ReadMinimapIconColorIndex = QOL.readMinimapIconColorIndex || function() { return 0; };
    var IsHudClassActive = _deps.isHudClassActive;

    var PANEL_ID_MINIMAP = "hud_minimap";
    var MINIMAP_CAST_RANGE_BASE_SIZE = 400.0;
    var MINIMAP_LAYOUT_BASE_SIZE_PX = 400;
    var MINIMAP_DRAW_OVER_UI_REASSERT_MS = 250;
function HideMinimapTunnelOverlay(root) {
        var overlay = GetCachedPanel("minimapTunnelOverlayRoot");
        if (!overlay && root && root.FindChildTraverse) {
            overlay = root.FindChildTraverse("tunnel_overlay");
            if (overlay) SetCachedPanel("minimapTunnelOverlayRoot", overlay);
        }
        if (!overlay) return;
        if (overlay.RemoveClass) overlay.RemoveClass("tunnel_locked_on");
        if (overlay.style.visibility !== "collapse") overlay.style.visibility = "collapse";
        if (overlay.style.opacity !== "0.75") overlay.style.opacity = "0.75";
    }
function EnsureMinimapTunnelOverlay(root) {
        var anchor = EnsureMinimapOverlayAnchor(root);
        if (!anchor) return null;
        var overlay = GetCachedPanel("minimapTunnelOverlayRoot");
        if (!overlay) {
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
        overlay.style.backgroundImage = 'url("s2r://panorama/images/minimap/base/mm_tunnel_overlay_png_png.vtex")';
        overlay.style.backgroundSize = "100% 100%";
        overlay.style.backgroundRepeat = "no-repeat";
        overlay.style.backgroundPosition = "center";
        SetCachedPanel("minimapTunnelOverlayRoot", overlay);
        return overlay;
    }
function HideMinimapCrateOverlay(root) {
        var overlay = GetCachedPanel("minimapCrateOverlayRoot");
        if (!overlay && root && root.FindChildTraverse) {
            overlay = root.FindChildTraverse("minimap_overlay_root");
            if (overlay) SetCachedPanel("minimapCrateOverlayRoot", overlay);
        }
        if (overlay && overlay.style.visibility !== "collapse") {
            overlay.style.visibility = "collapse";
        }
        MinimapCrateOverlayDebugLogThrottled("hide|" + (overlay ? "1" : "0"), "overlay=" + (overlay ? "1" : "0") + " visibility=collapse", PerfNowMs());
    }
function ResolveMinimapCrateOverlayMapKey() {
        // Game.GetMapInfo confirmed absent — minimap crate map detection disabled.
        return "";
    }
function MinimapCrateOverlayDebugLogThrottled(sig, msg, nowMs) {
        if (!MINIMAP_CRATE_OVERLAY_DEBUG) return;
        var now = Number(nowMs) || (Date.now ? Date.now() : (new Date()).getTime());
        var sameSig = sig && sig === State.minimapCrateOverlayDebugLastSig;
        if (sameSig && now < (State.minimapCrateOverlayDebugNextMs || 0)) return;
        State.minimapCrateOverlayDebugLastSig = sig || "";
        State.minimapCrateOverlayDebugNextMs = now + MINIMAP_CRATE_OVERLAY_DEBUG_THROTTLE_MS;
        MinimapCrateOverlayDebugLog(msg);
    }
// BuildMinimapCrateOverlay — creates minimap markers for item crate spawns.
// Uses UV coordinate mapping from crate data to position markers on the
// minimap image. Incremental rebuild via buildSig comparison: markers are
// only recreated when the map name or crate data changes (cached at
// State._cachedMinimapCrateSig).
function BuildMinimapCrateOverlay(root, mapName) {
        var panels = EnsureMinimapCrateOverlay(root);
        if (!panels || !panels.root || !panels.markers) {
            MinimapCrateOverlayDebugLogThrottled("build|nopanels|" + String(mapName), "map=" + String(mapName) + " panels=<null>", PerfNowMs());
            return null;
        }
        var overlay = panels.root;
        var markers = panels.markers;
        var dataRoot = null;
        if (QOL.minimapCrateData && QOL.minimapCrateData) dataRoot = QOL_MINIMAP_CRATE_DATA;
        else if (typeof CRATE_DATA === "object" && CRATE_DATA) dataRoot = CRATE_DATA;
        else if (typeof MINIMAP_CRATE_DATA === "object" && MINIMAP_CRATE_DATA) dataRoot = MINIMAP_CRATE_DATA;
        var mapData = dataRoot && mapName ? dataRoot[mapName] : null;
        var points = null;
        if (mapData && Array.isArray(mapData.crates)) points = mapData.crates;
        else if (Array.isArray(mapData)) points = mapData;
        if (!Array.isArray(points) || points.length <= 0) {
            ClearMinimapCrateOverlayMarkers(markers);
            State.minimapCrateOverlayBuildSig = "";
            MinimapCrateOverlayDebugLogThrottled(
                "build|nodata|" + String(mapName),
                "map=" + String(mapName) + " dataRoot=" + (dataRoot ? "1" : "0") + " mapData=" + (mapData ? "1" : "0") + " points=0",
                PerfNowMs()
            );
            return overlay;
        }

        var buildSig = String(mapName) + "|" + String(points.length);
        if (State.minimapCrateOverlayBuildSig === buildSig && markers.GetChildCount && Number(markers.GetChildCount()) === points.length) {
            MinimapCrateOverlayDebugLogThrottled(
                "build|cached|" + buildSig,
                "map=" + String(mapName) + " points=" + String(points.length) + " children=" + String(Number(markers.GetChildCount()) || 0),
                PerfNowMs()
            );
            return overlay;
        }

        ClearMinimapCrateOverlayMarkers(markers);
        var builtCount = 0;
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
            marker.style.transform =
                "translateX(" + (-MINIMAP_CRATE_OVERLAY_MARKER_SIZE_PX / 2) + "px) translateY(" + (-MINIMAP_CRATE_OVERLAY_MARKER_SIZE_PX / 2) + "px)";
            marker.style.opacity = "1.0";
            marker.style.backgroundColor = "rgba(255, 213, 74, " + MINIMAP_CRATE_OVERLAY_MARKER_OPACITY.toFixed(2) + ")";
            marker.style.border = "1px solid rgba(42, 33, 0, " + MINIMAP_CRATE_OVERLAY_MARKER_BORDER_OPACITY.toFixed(2) + ")";
            builtCount++;
        }
        State.minimapCrateOverlayBuildSig = buildSig;
        MinimapCrateOverlayDebugLogThrottled(
            "build|done|" + buildSig,
            "map=" + String(mapName) + " points=" + String(points.length) + " built=" + String(builtCount) + " children=" + String(Number(markers.GetChildCount()) || 0),
            PerfNowMs()
        );
        return overlay;
    }
function ReadMinimapIconColorIndex(cfg) {
        return ReadPaletteColorIndexWithPanelAttr(cfg, "MINIMAP_ICON_COLOR", MINIMAP_ICON_COLOR_ATTR);
    }
function CaptureMinimapOriginalParent(minimapPersp) {
        if (!minimapPersp || State.minimapDrawOverUiOriginalParent) {
            return;
        }

        var parent = minimapPersp.GetParent ? minimapPersp.GetParent() : null;
        State.minimapDrawOverUiOriginalParent = parent || null;
        State.minimapDrawOverUiOriginalIndex = -1;
        if (!parent || !parent.GetChildCount || !parent.GetChild) {
            return;
        }

        var count = parent.GetChildCount();
        for (var i = 0; i < count; i++) {
            if (parent.GetChild(i) === minimapPersp) {
                State.minimapDrawOverUiOriginalIndex = i;
                break;
            }
        }
    }
function ResolveHudRootForMinimapDraw(root) {
        var cached = GetCachedPanel("minimapDrawHudRoot");
        if (IsPanelValid(cached)) {
            return cached;
        }

        var gameplayHud = root && root.FindChildTraverse ? root.FindChildTraverse(PANEL_ID_GAMEPLAY_HUD) : null;
        var hudCore = gameplayHud && gameplayHud.GetParent ? gameplayHud.GetParent() : null;
        var hudRoot = hudCore && hudCore.GetParent ? hudCore.GetParent() : null;
        var fallback = $.GetContextPanel ? $.GetContextPanel() : null;
        var target = hudRoot || hudCore || fallback || root || null;
        SetCachedPanel("minimapDrawHudRoot", target);
        return target;
    }
function RestoreMinimapOriginalOrder(minimapPersp) {
        var parent = State.minimapDrawOverUiOriginalParent;
        if (!minimapPersp || !parent || !IsPanelValid(parent)) {
            return;
        }

        if (minimapPersp.GetParent && minimapPersp.GetParent() !== parent && minimapPersp.SetParent) {
            minimapPersp.SetParent(parent);
        }

        if (!parent.GetChildCount || !parent.GetChild || !parent.MoveChildBefore) {
            return;
        }

        var targetIndex = State.minimapDrawOverUiOriginalIndex;
        if (!isFinite(targetIndex) || targetIndex < 0) {
            return;
        }

        var count = parent.GetChildCount();
        if (count <= 1 || targetIndex >= count) {
            return;
        }

        var anchor = parent.GetChild(targetIndex);
        if (anchor && anchor !== minimapPersp) {
            parent.MoveChildBefore(minimapPersp, anchor);
        }
    }
    var hasClassInHierarchy = function(panel, className) {
        var current = panel;
        while (current) {
            if (current.BHasClass(className)) return true;
            current = current.GetParent();
        }
        return false;
    };

    var PANEL_ID_ABILITIES_CONTAINER = "AbilitiesContainer";
    var PANEL_ID_GAMEPLAY_HUD = "gameplay_hud";
function EnsureMinimapPanelCache(root) {
        if (State.cachedPanels.minimap && IsPanelListValid(State.cachedPanels.minimap)) {
            return State.cachedPanels.minimap;
        }
        var panels = [];
        if (root && root.FindChildTraverse) {
            var ids = ["minimap_persp", "minimap_container", "minimap_frame", "HudMinimapContainer", PANEL_ID_MINIMAP];
            for (var i = 0; i < ids.length; i++) {
                var panel = root.FindChildTraverse(ids[i]);
                if (panel) panels.push(panel);
            }
        }
        State.cachedPanels.minimap = panels;
        return panels;
    }
// IsHudClassActive imported via _deps.isHudClassActive (canonical version from ql_core.js).
function IsPanelListValid(list) {
        return QOL_UTILS_LOADED ? QOL_UTILS.IsPanelListValid(list) : (function() {
            if (!list || list.length === 0) return false;
            for (var i = 0; i < list.length; i++) {
                if (!IsPanelValid(list[i])) return false;
            }
            return true;
        })();
    }
function NormalizePaletteColorIndex(value) {
        var numeric = Math.round(Number(value));
        if (!isFinite(numeric)) numeric = 0;
        if (numeric < 0) numeric = 0;
        if (numeric >= QOL_WASH_COLOR_PALETTE.length) numeric = 0;
        return numeric;
    }
function PerfNowMs() {
        return Date.now ? Date.now() : (new Date()).getTime();
    }
var ResolveCachedPanel = function(parent, cacheKey, traverseId) {
        var panel = IsPanelValid(State.cachedPanels[cacheKey]) ? State.cachedPanels[cacheKey] : null;
        if (!panel && parent && parent.FindChildTraverse) {
            panel = parent.FindChildTraverse(traverseId);
            State.cachedPanels[cacheKey] = panel || null;
        }
        return panel;
    };
function ResolveWashColorFromPalette(value) {
        var index = NormalizePaletteColorIndex(value);
        var color = QOL_WASH_COLOR_PALETTE[index] || "";
        return color ? String(color) : "";
    }
function SetWashColorSafe(panel, color) {
        if (color) {
            SetStyleSafe(panel, "washColor", String(color));
        } else {
            ClearStyleSafe(panel, "washColor");
        }
    }
    var MINIMAP_CRATE_OVERLAY_DEBUG = false;
    var MINIMAP_CRATE_OVERLAY_DEBUG_THROTTLE_MS = 700;
    var MINIMAP_CRATE_OVERLAY_MARKER_BORDER_OPACITY = 0.45;
    var MINIMAP_CRATE_OVERLAY_MARKER_OPACITY = 0.75;
    var MINIMAP_CRATE_OVERLAY_MARKER_SIZE_PX = 2;
    var MINIMAP_ICON_COLOR_ATTR = "QOL_MINIMAP_ICON_COLOR";
    var PANEL_ID_HUD = QOL_PANEL_ID_HUD;
function ClearMinimapCrateOverlayMarkers(markers) {
        if (markers && markers.RemoveAndDeleteChildren) {
            markers.RemoveAndDeleteChildren();
        }
    }
function EnsureMinimapCrateOverlay(root) {
        var anchor = EnsureMinimapOverlayAnchor(root);
        if (!anchor) {
            MinimapCrateOverlayDebugLogThrottled("ensure|noanchor", "anchor=<null>", PerfNowMs());
            return null;
        }
        var overlay = GetCachedPanel("minimapCrateOverlayRoot");
        var markers = GetCachedPanel("minimapCrateMarkersRoot");
        if (!overlay) {
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
        if (!markers) {
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
        MinimapCrateOverlayDebugLogThrottled(
            "ensure|" + (anchor.id || anchor.paneltype || "anchor") + "|" + (overlay ? "1" : "0") + "|" + (markers ? "1" : "0"),
            "anchor=" + (anchor.id || anchor.paneltype || "<anon>") +
            " overlay=" + (overlay ? (overlay.id || overlay.paneltype || "<anon>") : "<null>") +
            " markers=" + (markers ? (markers.id || markers.paneltype || "<anon>") : "<null>"),
            PerfNowMs()
        );
        SetCachedPanel("minimapCrateOverlayRoot", overlay);
        SetCachedPanel("minimapCrateMarkersRoot", markers);
        return {
            root: overlay,
            markers: markers
        };
    }
function EnsureMinimapOverlayAnchor(root) {
        if (!root || !root.FindChildTraverse) return null;
        var anchor = GetCachedPanel("minimapObjectiveTimersAnchor");
        if (!anchor) {
            anchor = root.FindChildTraverse("minimap_container");
            if (!anchor) anchor = root.FindChildTraverse("minimap_persp");
            SetCachedPanel("minimapObjectiveTimersAnchor", anchor);
        }
        return anchor || null;
    }
var GetCachedPanel = function(k) {
        var p = State.cachedPanels[k];
        if (IsPanelValid(p)) return p;
        State.cachedPanels[k] = null;
        return null;
    };
function MinimapCrateOverlayDebugLog(msg) {
        if (!MINIMAP_CRATE_OVERLAY_DEBUG) return;
        $.Msg("[QOLLock][MinimapCrateDbg] " + msg);
    }
function ReadPaletteColorIndexWithPanelAttr(cfg, key, attrName) {
        // $.persistentStorage confirmed absent — panel attrs are the only persistence.
        var fromConfig = NormalizePaletteColorIndex(cfg && cfg[key]);
        var root = GetUIRoot();
        try {
            if (root && root.GetAttributeString) {
                var rootAttr = String(root.GetAttributeString(attrName, "") || "");
                if (rootAttr !== "") return NormalizePaletteColorIndex(rootAttr);
            }
        } catch(eAttrRoot) { if (typeof Utils !== "undefined" && Utils.WarnLog) Utils.WarnLog("ql_feat_minimapruntime", (eAttrRoot && eAttrRoot.message ? eAttrRoot.message : String(eAttrRoot || ""))); }
        try {
            var hud = root && root.FindChildTraverse ? root.FindChildTraverse(PANEL_ID_HUD) : null;
            if (hud && hud.GetAttributeString) {
                var hudAttr = String(hud.GetAttributeString(attrName, "") || "");
                if (hudAttr !== "") return NormalizePaletteColorIndex(hudAttr);
            }
        } catch(eAttrHud) { if (typeof Utils !== "undefined" && Utils.WarnLog) Utils.WarnLog("ql_feat_minimapruntime", (eAttrHud && eAttrHud.message ? eAttrHud.message : String(eAttrHud || ""))); }
        return fromConfig;
    }
var SetCachedPanel = function(k, p) {
        State.cachedPanels[k] = IsPanelValid(p) ? p : null;
    };
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
            if (State._cachedMinimapTunnelHidden) return;
            State._cachedMinimapTunnelHidden = true;
            HideMinimapTunnelOverlay(root);
            return;
        }
        State._cachedMinimapTunnelHidden = false;
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
            if (State._cachedMinimapCrateHidden) return;
            State._cachedMinimapCrateHidden = true;
            HideMinimapCrateOverlay(root);
            return;
        }
        State._cachedMinimapCrateHidden = false;
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
        var canvas = GetCachedPanel("minimapCanvas");
        if (!canvas && root && root.FindChildTraverse) {
            var hudMinimapPanel = GetCachedPanel("hudMinimapPanel");
            if (!hudMinimapPanel) {
                hudMinimapPanel = root.FindChildTraverse(PANEL_ID_MINIMAP);
                SetCachedPanel("hudMinimapPanel", hudMinimapPanel);
            }
            canvas = hudMinimapPanel && hudMinimapPanel.FindChildTraverse
                ? hudMinimapPanel.FindChildTraverse("canvas")
                : null;
            if (!canvas) canvas = root.FindChildTraverse("canvas");
            SetCachedPanel("minimapCanvas", canvas);
        }
        if (!canvas) {
            State.minimapIconColorStyleSig = "";
            return;
        }

        var styleSig = color || "default";
        if (State.minimapIconColorStyleSig === styleSig) return;
        SetWashColorSafe(canvas, color);
        State.minimapIconColorStyleSig = styleSig;
    }

    function UpdateMinimapCastRangeScale(root, targetSize) {
        var size = Number(targetSize);
        if (!isFinite(size) || size <= 0) size = MINIMAP_CAST_RANGE_BASE_SIZE;
        // Skip the expensive FindChildrenWithClassTraverse when size hasn't changed
        if (size === State._cachedMinimapCastRangeSize) return;
        State._cachedMinimapCastRangeSize = size;
        var scale = MINIMAP_CAST_RANGE_BASE_SIZE / size;
        if (!isFinite(scale) || scale <= 0) scale = 1.0;
        if (scale < 0.20) scale = 0.20;
        if (scale > 2.00) scale = 2.00;
        var scaleText = scale.toFixed(3) + ", " + scale.toFixed(3);
        var hudMinimapPanel = ResolveCachedPanel(root, "hudMinimapPanel", PANEL_ID_MINIMAP);
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
        State.minimapCastRangeScaleApplied = rangePanels.length > 0 && Math.abs(scale - 1.0) > 0.001;
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
        var runtimeSig = State._cachedMinimapRuntimeSig || BuildMinimapRuntimeSignature(cfg);
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

        if (raw !== State.lastRawConfig || runtimeSig !== State.minimapRuntimeSig || currentZoomKey !== State.lastZoomState || State.accountPresetTestActive) {
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
                    } catch(eOrigin) { if (typeof Utils !== "undefined" && Utils.WarnLog) Utils.WarnLog("ql_feat_minimapruntime", (eOrigin && eOrigin.message ? eOrigin.message : String(eOrigin || ""))); }
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

            var mapRenderPanel = ResolveCachedPanel(root, "minimapMapRender", "map_render");
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
                    var hudMinimapPanel = ResolveCachedPanel(root, "hudMinimapPanel", PANEL_ID_MINIMAP);
                    if (hudMinimapPanel) {
                        if (hudMinimapPanel.AddClass) hudMinimapPanel.AddClass("minimalist_minimap_active");
                        hudMinimapPanel.style.backgroundColor = "rgba(0, 0, 0, 0)";
                    }
                    State.minimapMinimalistOpacityApplied = true;
                } else if (State.minimapMinimalistOpacityApplied) {
                    // Reset once after leaving minimalist mode, then stop touching map_render opacity.
                    SetPanelOpacitySafe(mapRenderPanel, 1.0, 1.0);
                    mapRenderPanel.style.brightness = "1.0";
                    mapRenderPanel.style.washColor = "none";
                    var resetHudMinimapPanel = GetCachedPanel("hudMinimapPanel");
                    if (resetHudMinimapPanel) {
                        if (resetHudMinimapPanel.RemoveClass) {
                            resetHudMinimapPanel.RemoveClass("minimalist_minimap_active");
                        }
                        resetHudMinimapPanel.style.backgroundColor = "rgba(0, 0, 0, 0)";
                    }
                    State.minimapMinimalistOpacityApplied = false;
                }
            }
            State.lastZoomState = currentZoomKey;
            State.minimapRuntimeSig = runtimeSig;
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
            State.minimapDrawOverUiActive = false;
            State.minimapDrawOverUiNextReassertMs = 0;
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
                !State.minimapDrawOverUiActive ||
                nowMs >= (State.minimapDrawOverUiNextReassertMs || 0);
            if (targetRoot && shouldReassertOrder && targetRoot.GetChildCount && targetRoot.GetChild && targetRoot.MoveChildAfter) {
                var count = targetRoot.GetChildCount();
                if (count > 0) {
                    var lastChild = targetRoot.GetChild(count - 1);
                    if (lastChild && lastChild !== minimapPersp) {
                        targetRoot.MoveChildAfter(minimapPersp, lastChild);
                    }
                }
            }

            State.minimapDrawOverUiNextReassertMs = nowMs + MINIMAP_DRAW_OVER_UI_REASSERT_MS;
            if (minimapPersp.style.zIndex !== "2147483647") {
                minimapPersp.style.zIndex = "2147483647";
            }
            State.minimapDrawOverUiActive = true;
            return;
        }

        if (State.minimapDrawOverUiActive ||
            (State.minimapDrawOverUiOriginalParent && minimapPersp.GetParent && minimapPersp.GetParent() !== State.minimapDrawOverUiOriginalParent)) {
            RestoreMinimapOriginalOrder(minimapPersp);
        }
        if (minimapPersp.style.zIndex !== "0") {
            minimapPersp.style.zIndex = "0";
        }
        State.minimapDrawOverUiActive = false;
        State.minimapDrawOverUiNextReassertMs = 0;
    }

    function NeedsMinimapRuntimeWork(cfg, raw) {
        if (!cfg) return false;
        var sig = BuildMinimapRuntimeSignature(cfg);
        State._cachedMinimapRuntimeSig = sig;
        if (raw !== State.lastRawConfig || sig !== State.minimapRuntimeSig || State.accountPresetTestActive || State.lastZoomState === null) return true;
        if (State.minimapRuntimeSig && !IsPanelListValid(State.cachedPanels.minimap)) return true;
        if (State.minimapDrawOverUiActive) return true;
        if (State.minimapMinimalistOpacityApplied && Number(cfg.MINIMAL_MINIMAP) !== 1) return true;
        if (Math.round(Number(cfg.MINIMAP_SMALL_SIZE) || MINIMAP_CAST_RANGE_BASE_SIZE) === MINIMAP_CAST_RANGE_BASE_SIZE && State.minimapCastRangeScaleApplied) return true;
        if (IsCfgEnabled(cfg, "ENABLE_MINIMAP_CRATE_OVERLAY") && ResolveMinimapCrateOverlayMapKey() === "dl_midtown" && !GetCachedPanel("minimapCrateOverlayRoot")) return true;
        if (
            (
                IsCfgEnabled(cfg, "ENABLE_MINIMAP_REM_TUNNELS") ||
                IsCfgEnabled(cfg, "ENABLE_ALT_ZOOM_REM_TUNNELS") ||
                IsCfgEnabled(cfg, "ENABLE_TAB_ZOOM_REM_TUNNELS")
            ) &&
            !GetCachedPanel("minimapTunnelOverlayRoot")
        ) return true;
        if (IsCfgEnabled(cfg, "ENABLE_ALT_ZOOM") || IsCfgEnabled(cfg, "ENABLE_TAB_ZOOM")) return true;
        return false;
    }


    // ── Bridge: bare export for ResolveRuntimeGates in ql_core.js ──
    QOL.NeedsMinimapRuntimeWork = NeedsMinimapRuntimeWork;

    // ── Registration ──
    QOL.register("minimapRuntime", {
        configKeys: ["ENABLE_ALT_ZOOM", "ENABLE_TAB_ZOOM", "MINIMAP_BASE_OPACITY",
                     "MINIMAL_MINIMAP", "MINIMAP_ROTATE_WITH_PLAYER", "MINIMAP_FLIP",
                     "ENABLE_MINIMAP_CRATE_OVERLAY", "ENABLE_MINIMAP_REM_TUNNELS",
                     "ENABLE_MINIMAP_ELEVATION_MARKERS", "MINIMAP_ICON_COLOR",
                     "ENABLE_MINIMAP_ALWAYS_ON_MID_BOSS"],
        bucket: 7, phase: -1,
        gate: function(cfg, raw) { return QOL.NeedsMinimapRuntimeWork(cfg, raw || State.lastRawConfig || ""); },
        update: function(root, cfg, nowMs, State, hideoutConnected, raw) {
            try {
                UpdateMinimapRuntime(root, cfg, raw);
            } catch(e) {
                $.Msg("[QOLLock][ERROR][" + _featureId + "] " + (e && e.message ? e.message : String(e)) + "\n" + (e && e.stack ? String(e.stack) : ""));
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
        $.Msg("[QOLLock][ERROR][" + _featureId + "] self-test failed: " + (e && e.message ? e.message : String(e)));
    }

})();

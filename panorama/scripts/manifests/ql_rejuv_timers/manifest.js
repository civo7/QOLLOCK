// features/ql_rejuv_timers/manifest.js
// =============================================================================
// QOLLOCK — Rejuv Timers
// =============================================================================
// OWNS:        Rejuv/buff HUD timers + minimap objectives
// DOES NOT OWN: Mid-boss game object, minimap panel, top-bar panel, rejuv charges
// DEPENDS ON:  QOL.core.FeatureRegistry, QOL.core.Scheduler
// CONFIG KEYS: ENABLE_REJUV_HUD, ENABLE_BUFF_HUD, ENABLE_MINIMAP_REJUV_TIMER, ENABLE_MINIMAP_BUFF_TIMER, ENABLE_MINIMAP_BUFF_TIMER_ON_BRIDGE, ENABLE_MINIMAP_ALWAYS_ON_MID_BOSS, ENABLE_TAB_ZOOM, ENABLE_ALT_ZOOM, MINIMAP_SMALL_SIZE, MINIMAP_LARGE_SIZE, MINIMAP_LARGE_SIZE_ALT, MINIMAP_LARGE_SIZE_TAB
// CSS:         none
// PATTERN:     Polling (0.3Hz). Self-scheduling via Scheduler.
// PORTED FROM: features/ql_feat_rejuvtimers.js (1303 lines), Phase 11 Step 2
// =============================================================================

(function() {
    "use strict";

    var FR = QOL.core.FeatureRegistry;
    if (!FR) { $.Msg("[QOLLock] ql_rejuv_timers: FeatureRegistry not found — aborting"); return; }

    FR.register({
        id: "ql_rejuv_timers",
        enabledByDefault: false,
        settings: [
            { key: "ENABLE_REJUV_HUD", type: "toggle", default: false },
            { key: "ENABLE_BUFF_HUD", type: "toggle", default: false },
            { key: "ENABLE_MINIMAP_REJUV_TIMER", type: "toggle", default: false },
            { key: "ENABLE_MINIMAP_BUFF_TIMER", type: "toggle", default: false },
            { key: "ENABLE_MINIMAP_BUFF_TIMER_ON_BRIDGE", type: "toggle", default: false },
            { key: "ENABLE_MINIMAP_ALWAYS_ON_MID_BOSS", type: "toggle", default: false },
            { key: "ENABLE_TAB_ZOOM", type: "toggle", default: false },
            { key: "ENABLE_ALT_ZOOM", type: "toggle", default: false },
            { key: "MINIMAP_SMALL_SIZE", type: "slider", min: 200, max: 1000, step: 5, default: 400 },
            { key: "MINIMAP_LARGE_SIZE", type: "slider", min: 400, max: 1200, step: 10, default: 750 },
            { key: "MINIMAP_LARGE_SIZE_ALT", type: "slider", min: 400, max: 1200, step: 10, default: 750 },
            { key: "MINIMAP_LARGE_SIZE_TAB", type: "slider", min: 400, max: 1200, step: 10, default: 750 }
        ],
        create: function(ctx) {
            // ── QOL.import deps ──
            var _deps = QOL.import(["ensureMinimapOverlayAnchor","getCachedPanel","getGameSecondsForUrn","getHighestRejuvChargeTokenOnPanel","hasClassInHierarchy","isConnectedToHideout","isHudClassActive","isStreetBrawlModeActive","panelHasClassToken","panelIdTopBar","resolveCachedPanel","state","setCachedPanel","setPanelClassCached","setPanelClassIfChanged","utils"]);
            var GetCachedPanel = _deps.getCachedPanel;
            var ResolveCachedPanel = _deps.resolveCachedPanel;
            var State = _deps.state;
            var SetCachedPanel = _deps.setCachedPanel;
            var Utils = _deps.utils;
            var IsCfgEnabled = Utils.IsCfgEnabled;
            var IsPanelValid = Utils.IsPanelValid;
            var SetPanelOpacitySafe = Utils.SetPanelOpacitySafe;
            var SetPanelClassIfChanged = _deps.setPanelClassIfChanged;
            var IsStreetBrawlModeActive = _deps.isStreetBrawlModeActive;
            var IsHudClassActive = _deps.isHudClassActive;
            var SetPanelClassCached = _deps.setPanelClassCached;
            var GetGameSecondsForUrn = _deps.getGameSecondsForUrn;
            var hasClassInHierarchy = _deps.hasClassInHierarchy;
            var PANEL_ID_TOP_BAR = _deps.panelIdTopBar;
            var GetHighestRejuvChargeTokenOnPanel = _deps.getHighestRejuvChargeTokenOnPanel;
            var EnsureMinimapOverlayAnchor = _deps.ensureMinimapOverlayAnchor;
            var PanelHasClassToken = _deps.panelHasClassToken;
            var isConnectedToHideout = _deps.isConnectedToHideout;

            // ── Constants ──
            var BRIDGE_DURATION_SEC = 300;
            var BUFF_LOCKOUT_SEC = 120;
            var REJUV_DURATION_SEC = 180;
            var REJUV_SCAN_INTERVAL_MS = 3000;
            var REJUV_SCAN_INTERVAL_FAST_MS = 1000;
            var REJUV_MIDBOSS_LOOKUP_INTERVAL_MS = 10000;
            var REJUV_CHARGES_LOOKUP_INTERVAL_MS = 5000;
            var REJUV_ROTATE_ANIM_MS = 800;
            var REJUV_HIDE_POPIN_MS = 500;
            var REJUV_SEQ = [
                { name: "initial", dur: 0, num: "1" },
                { name: "firstCd", dur: 420, num: "2" },
                { name: "secondCd", dur: 360, num: "3" },
                { name: "thirdCd", dur: 300, num: "3" }
            ];

            var _loop = null;
            var _root = null;

            function _isInHideout(root) {
                var hud = root && root.FindChildTraverse ? root.FindChildTraverse("Hud") : null;
                if (!hud) return false;
                try { return hud.BHasClass("InHideout") || hud.BHasClass("inHideoutIntro"); } catch(e) { return false; }
            }

            // ── Private helpers ──

            function FormatClockMmSs(totalSec) {
                var s = Math.max(0, Math.floor(Number(totalSec) || 0));
                var mm = Math.floor(s / 60);
                var ss = s % 60;
                return String(mm) + ":" + (ss < 10 ? "0" + ss : String(ss));
            }

            function EnsureMinimapObjectiveTimers(root) {
                var anchor = EnsureMinimapOverlayAnchor(root);
                if (!anchor) return null;
                var overlay = GetCachedPanel("minimapObjectiveTimersRoot");
                if (!overlay) {
                    overlay = anchor.FindChildTraverse("QOLMinimapTimersRoot");
                    if (!overlay) {
                        overlay = $.CreatePanel("Panel", anchor, "QOLMinimapTimersRoot", { hittest: "false", hittestchildren: "false" });
                    }
                } else if (overlay.GetParent && overlay.GetParent() !== anchor && overlay.SetParent) {
                    overlay.SetParent(anchor);
                }
                if (!overlay) return null;
                overlay.hittest = false;
                overlay.hittestchildren = false;
                if (anchor.MoveChildAfter && anchor.GetChildCount) {
                    var childCount = Number(anchor.GetChildCount()) || 0;
                    if (childCount > 0) {
                        var lastChild = anchor.GetChild(childCount - 1);
                        if (lastChild && lastChild !== overlay) { anchor.MoveChildAfter(overlay, lastChild); }
                    }
                }
                var buffPanel = overlay.FindChildTraverse("QOLMinimapBuffTimer");
                if (!buffPanel) buffPanel = $.CreatePanel("Panel", overlay, "QOLMinimapBuffTimer");
                buffPanel.AddClass("QOLMinimapTimer"); buffPanel.hittest = false; buffPanel.hittestchildren = false;
                var buffIcon = buffPanel.FindChildTraverse("QOLMinimapBuffIcon");
                if (!buffIcon) buffIcon = $.CreatePanel("Image", buffPanel, "QOLMinimapBuffIcon", { src: "s2r://panorama/images/hud/modifiers/icon_powerup.svg" });
                buffIcon.hittest = false; buffIcon.hittestchildren = false;
                var buffTime = buffPanel.FindChildTraverse("QOLMinimapBuffTime");
                if (!buffTime) { buffTime = $.CreatePanel("Label", buffPanel, "QOLMinimapBuffTime"); buffTime.text = "00:00"; }
                buffTime.AddClass("QOLMinimapTimerLabel"); buffTime.hittest = false; buffTime.hittestchildren = false;
                var buffBridgeLeftPanel = overlay.FindChildTraverse("QOLMinimapBuffBridgeLeftTimer");
                if (!buffBridgeLeftPanel) buffBridgeLeftPanel = $.CreatePanel("Panel", overlay, "QOLMinimapBuffBridgeLeftTimer");
                buffBridgeLeftPanel.AddClass("QOLMinimapTimer"); buffBridgeLeftPanel.hittest = false; buffBridgeLeftPanel.hittestchildren = false;
                buffBridgeLeftPanel.style.ignoreParentFlow = "true";
                var buffBridgeLeftIcon = buffBridgeLeftPanel.FindChildTraverse("QOLMinimapBuffBridgeLeftIcon");
                if (!buffBridgeLeftIcon) buffBridgeLeftIcon = $.CreatePanel("Image", buffBridgeLeftPanel, "QOLMinimapBuffBridgeLeftIcon", { src: "s2r://panorama/images/hud/modifiers/icon_powerup.svg" });
                buffBridgeLeftIcon.hittest = false; buffBridgeLeftIcon.hittestchildren = false;
                var buffBridgeLeftTime = buffBridgeLeftPanel.FindChildTraverse("QOLMinimapBuffBridgeLeftTime");
                if (!buffBridgeLeftTime) { buffBridgeLeftTime = $.CreatePanel("Label", buffBridgeLeftPanel, "QOLMinimapBuffBridgeLeftTime"); buffBridgeLeftTime.text = "00:00"; }
                buffBridgeLeftTime.AddClass("QOLMinimapTimerLabel"); buffBridgeLeftTime.hittest = false; buffBridgeLeftTime.hittestchildren = false;
                var buffBridgeRightPanel = overlay.FindChildTraverse("QOLMinimapBuffBridgeRightTimer");
                if (!buffBridgeRightPanel) buffBridgeRightPanel = $.CreatePanel("Panel", overlay, "QOLMinimapBuffBridgeRightTimer");
                buffBridgeRightPanel.AddClass("QOLMinimapTimer"); buffBridgeRightPanel.hittest = false; buffBridgeRightPanel.hittestchildren = false;
                buffBridgeRightPanel.style.ignoreParentFlow = "true";
                var buffBridgeRightIcon = buffBridgeRightPanel.FindChildTraverse("QOLMinimapBuffBridgeRightIcon");
                if (!buffBridgeRightIcon) buffBridgeRightIcon = $.CreatePanel("Image", buffBridgeRightPanel, "QOLMinimapBuffBridgeRightIcon", { src: "s2r://panorama/images/hud/modifiers/icon_powerup.svg" });
                buffBridgeRightIcon.hittest = false; buffBridgeRightIcon.hittestchildren = false;
                var buffBridgeRightTime = buffBridgeRightPanel.FindChildTraverse("QOLMinimapBuffBridgeRightTime");
                if (!buffBridgeRightTime) { buffBridgeRightTime = $.CreatePanel("Label", buffBridgeRightPanel, "QOLMinimapBuffBridgeRightTime"); buffBridgeRightTime.text = "00:00"; }
                buffBridgeRightTime.AddClass("QOLMinimapTimerLabel"); buffBridgeRightTime.hittest = false; buffBridgeRightTime.hittestchildren = false;
                var rejuvPanel = overlay.FindChildTraverse("QOLMinimapRejuvTimer");
                if (!rejuvPanel) rejuvPanel = $.CreatePanel("Panel", overlay, "QOLMinimapRejuvTimer");
                rejuvPanel.AddClass("QOLMinimapTimer"); rejuvPanel.hittest = false; rejuvPanel.hittestchildren = false;
                var rejuvIcon = rejuvPanel.FindChildTraverse("QOLMinimapRejuvIcon");
                if (!rejuvIcon) rejuvIcon = $.CreatePanel("Image", rejuvPanel, "QOLMinimapRejuvIcon", { src: "s2r://panorama/images/hud/modifiers/icon_rejuvenator.svg" });
                rejuvIcon.hittest = false; rejuvIcon.hittestchildren = false;
                var rejuvTime = rejuvPanel.FindChildTraverse("QOLMinimapRejuvTime");
                if (!rejuvTime) { rejuvTime = $.CreatePanel("Label", rejuvPanel, "QOLMinimapRejuvTime"); rejuvTime.text = "00:00"; }
                rejuvTime.AddClass("QOLMinimapTimerLabel"); rejuvTime.hittest = false; rejuvTime.hittestchildren = false;
                SetCachedPanel("minimapObjectiveTimersRoot", overlay);
                SetCachedPanel("minimapObjectiveBuffPanel", buffPanel);
                SetCachedPanel("minimapObjectiveBuffTime", buffTime);
                SetCachedPanel("minimapObjectiveBuffIcon", buffIcon);
                SetCachedPanel("minimapObjectiveBuffBridgeLeftPanel", buffBridgeLeftPanel);
                SetCachedPanel("minimapObjectiveBuffBridgeLeftTime", buffBridgeLeftTime);
                SetCachedPanel("minimapObjectiveBuffBridgeLeftIcon", buffBridgeLeftIcon);
                SetCachedPanel("minimapObjectiveBuffBridgeRightPanel", buffBridgeRightPanel);
                SetCachedPanel("minimapObjectiveBuffBridgeRightTime", buffBridgeRightTime);
                SetCachedPanel("minimapObjectiveBuffBridgeRightIcon", buffBridgeRightIcon);
                SetCachedPanel("minimapObjectiveRejuvPanel", rejuvPanel);
                SetCachedPanel("minimapObjectiveRejuvTime", rejuvTime);
                SetCachedPanel("minimapObjectiveRejuvIcon", rejuvIcon);
                if (overlay.MoveChildBefore && rejuvPanel && buffPanel) { overlay.MoveChildBefore(rejuvPanel, buffPanel); }
                return { root: overlay, buffPanel: buffPanel, buffTime: buffTime, buffBridgeLeftPanel: buffBridgeLeftPanel, buffBridgeLeftTime: buffBridgeLeftTime, buffBridgeRightPanel: buffBridgeRightPanel, buffBridgeRightTime: buffBridgeRightTime, rejuvPanel: rejuvPanel, rejuvTime: rejuvTime };
            }

            function HideMinimapObjectiveTimers(root) {
                var overlay = GetCachedPanel("minimapObjectiveTimersRoot");
                if (!overlay && root && root.FindChildTraverse) { overlay = root.FindChildTraverse("QOLMinimapTimersRoot"); if (overlay) SetCachedPanel("minimapObjectiveTimersRoot", overlay); }
                if (!overlay) return;
                if (overlay.SetHasClass) overlay.SetHasClass("qol-hidden", true); else if (overlay.style.visibility !== "collapse") overlay.style.visibility = "collapse";
                State.minimapObjectiveScaleSig = "";
                if (overlay.style.preTransformScale2d !== "1.00, 1.00") { overlay.style.preTransformScale2d = "1.00, 1.00"; }
                var buffPanel = GetCachedPanel("minimapObjectiveBuffPanel");
                var buffBridgeLeftPanel = GetCachedPanel("minimapObjectiveBuffBridgeLeftPanel");
                var buffBridgeRightPanel = GetCachedPanel("minimapObjectiveBuffBridgeRightPanel");
                var rejuvPanel = GetCachedPanel("minimapObjectiveRejuvPanel");
                if (buffPanel) { SetPanelClassCached(buffPanel, State.minimapObjectiveBuffClassCache, "yellow", false); SetPanelClassCached(buffPanel, State.minimapObjectiveBuffClassCache, "red", false); }
                if (buffBridgeLeftPanel) { SetPanelClassCached(buffBridgeLeftPanel, State.minimapObjectiveBuffBridgeLeftClassCache, "yellow", false); SetPanelClassCached(buffBridgeLeftPanel, State.minimapObjectiveBuffBridgeLeftClassCache, "red", false); }
                if (buffBridgeRightPanel) { SetPanelClassCached(buffBridgeRightPanel, State.minimapObjectiveBuffBridgeRightClassCache, "yellow", false); SetPanelClassCached(buffBridgeRightPanel, State.minimapObjectiveBuffBridgeRightClassCache, "red", false); }
                if (rejuvPanel) { SetPanelClassCached(rejuvPanel, State.minimapObjectiveRejuvClassCache, "yellow", false); SetPanelClassCached(rejuvPanel, State.minimapObjectiveRejuvClassCache, "red", false); }
            }

            function GetMinimapConfigNumber(cfg, newKey, legacyKey, fallbackVal) {
                var val = cfg ? cfg[newKey] : undefined;
                if (val === undefined || val === null || !isFinite(Number(val))) { val = cfg ? cfg[legacyKey] : undefined; }
                if (val === undefined || val === null || !isFinite(Number(val))) { val = fallbackVal; }
                return Number(val);
            }

            function ResolveActiveMinimapObjectiveSize(root, cfg) {
                var smallSize = Number(cfg && cfg.MINIMAP_SMALL_SIZE);
                if (!isFinite(smallSize)) smallSize = 400;
                var minimapPersp = ResolveCachedPanel(root, "minimapPersp", "minimap_persp");
                var isAlt = IsHudClassActive(root, "gDetailView") || hasClassInHierarchy(minimapPersp, "gDetailView");
                var isTab = IsHudClassActive(root, "gScoreboardOpen") || hasClassInHierarchy(minimapPersp, "gScoreboardOpen");
                if (isTab && cfg && IsCfgEnabled(cfg, "ENABLE_TAB_ZOOM")) { return GetMinimapConfigNumber(cfg, "MINIMAP_LARGE_SIZE_TAB", "MINIMAP_LARGE_SIZE", smallSize); }
                if (isAlt && cfg && IsCfgEnabled(cfg, "ENABLE_ALT_ZOOM")) { return GetMinimapConfigNumber(cfg, "MINIMAP_LARGE_SIZE_ALT", "MINIMAP_LARGE_SIZE", smallSize); }
                return smallSize;
            }

            function ApplyMinimapObjectiveTimersStandardMode(panels, overlay, dims, flags, icons, bridgeText, rejuvText) {
                var timerWidth = dims.timerWidth, timerHeight = dims.timerHeight, timerGap = dims.timerGap, timerPaddingX = dims.timerPaddingX, timerRadius = dims.timerRadius, timerFont = dims.timerFont, timerIcon = dims.timerIcon, bottomOffset = dims.bottomOffset;
                var buffEnabled = flags.buffEnabled, rejuvEnabled = flags.rejuvEnabled, buffRed = flags.buffRed, buffYellow = flags.buffYellow, rejuvRed = flags.rejuvRed, rejuvYellow = flags.rejuvYellow;
                var buffIcon = icons.buffIcon, buffBridgeLeftIcon = icons.buffBridgeLeftIcon, buffBridgeRightIcon = icons.buffBridgeRightIcon, rejuvIcon = icons.rejuvIcon;
                var minimapScaleTextDefault = [timerWidth,timerHeight,timerGap,timerPaddingX,timerRadius,timerFont,timerIcon,bottomOffset].join("|");
                if (State.minimapObjectiveScaleSig !== minimapScaleTextDefault) {
                    if (overlay.style.preTransformScale2d !== "1.00, 1.00") overlay.style.preTransformScale2d = "1.00, 1.00";
                    overlay.style.width = "fit-children"; overlay.style.height = "fit-children"; overlay.style.horizontalAlign = "center"; overlay.style.verticalAlign = "bottom";
                    overlay.style.marginTop = "0px"; overlay.style.marginRight = "0px"; overlay.style.marginBottom = bottomOffset + "px";
                    if (panels.buffPanel) { panels.buffPanel.style.width = timerWidth + "px"; panels.buffPanel.style.height = timerHeight + "px"; panels.buffPanel.style.margin = "0px " + timerGap + "px"; panels.buffPanel.style.padding = "0px " + timerPaddingX + "px"; panels.buffPanel.style.borderRadius = timerRadius + "px"; panels.buffPanel.style.ignoreParentFlow = "false"; panels.buffPanel.style.horizontalAlign = "center"; panels.buffPanel.style.verticalAlign = "center"; }
                    if (panels.rejuvPanel) { panels.rejuvPanel.style.width = timerWidth + "px"; panels.rejuvPanel.style.height = timerHeight + "px"; panels.rejuvPanel.style.margin = "0px " + timerGap + "px"; panels.rejuvPanel.style.padding = "0px " + timerPaddingX + "px"; panels.rejuvPanel.style.borderRadius = timerRadius + "px"; panels.rejuvPanel.style.ignoreParentFlow = "false"; panels.rejuvPanel.style.horizontalAlign = "center"; panels.rejuvPanel.style.verticalAlign = "center"; }
                    if (buffIcon) { buffIcon.style.width = timerIcon + "px"; buffIcon.style.height = timerIcon + "px"; if (buffIcon.SetHasClass) buffIcon.SetHasClass("qol-hidden", false); else buffIcon.style.visibility = "visible"; }
                    if (buffBridgeLeftIcon) { if (buffBridgeLeftIcon.SetHasClass) buffBridgeLeftIcon.SetHasClass("qol-hidden", true); else buffBridgeLeftIcon.style.visibility = "collapse"; }
                    if (buffBridgeRightIcon) { if (buffBridgeRightIcon.SetHasClass) buffBridgeRightIcon.SetHasClass("qol-hidden", true); else buffBridgeRightIcon.style.visibility = "collapse"; }
                    if (rejuvIcon) { rejuvIcon.style.width = timerIcon + "px"; rejuvIcon.style.height = timerIcon + "px"; if (rejuvIcon.SetHasClass) rejuvIcon.SetHasClass("qol-hidden", false); else rejuvIcon.style.visibility = "visible"; }
                    if (panels.buffTime) panels.buffTime.style.fontSize = timerFont + "px";
                    if (panels.rejuvTime) panels.rejuvTime.style.fontSize = timerFont + "px";
                    State.minimapObjectiveScaleSig = minimapScaleTextDefault;
                }
                var singleSlotOffset = Math.round(timerWidth + (timerGap * 2));
                var overlayMarginLeft = "0px";
                if (buffEnabled && !rejuvEnabled) overlayMarginLeft = singleSlotOffset + "px";
                else if (rejuvEnabled && !buffEnabled) overlayMarginLeft = (-singleSlotOffset) + "px";
                if (overlay.style.marginLeft !== overlayMarginLeft) overlay.style.marginLeft = overlayMarginLeft;
                if (panels.buffPanel) { var bv = buffEnabled; if (panels.buffPanel.SetHasClass) panels.buffPanel.SetHasClass("qol-hidden", !bv); else if (panels.buffPanel.style.visibility !== (bv ? "visible" : "collapse")) panels.buffPanel.style.visibility = bv ? "visible" : "collapse"; }
                if (panels.rejuvPanel) { var rv = rejuvEnabled; if (panels.rejuvPanel.SetHasClass) panels.rejuvPanel.SetHasClass("qol-hidden", !rv); else if (panels.rejuvPanel.style.visibility !== (rv ? "visible" : "collapse")) panels.rejuvPanel.style.visibility = rv ? "visible" : "collapse"; }
                if (panels.buffBridgeLeftPanel) { if (panels.buffBridgeLeftPanel.SetHasClass) panels.buffBridgeLeftPanel.SetHasClass("qol-hidden", true); else if (panels.buffBridgeLeftPanel.style.visibility !== "collapse") panels.buffBridgeLeftPanel.style.visibility = "collapse"; }
                if (panels.buffBridgeRightPanel) { if (panels.buffBridgeRightPanel.SetHasClass) panels.buffBridgeRightPanel.SetHasClass("qol-hidden", true); else if (panels.buffBridgeRightPanel.style.visibility !== "collapse") panels.buffBridgeRightPanel.style.visibility = "collapse"; }
                if (buffEnabled && panels.buffTime && panels.buffTime.text !== bridgeText) panels.buffTime.text = bridgeText;
                if (rejuvEnabled && panels.rejuvTime && panels.rejuvTime.text !== rejuvText) panels.rejuvTime.text = rejuvText;
                if (panels.buffPanel) { SetPanelClassCached(panels.buffPanel, State.minimapObjectiveBuffClassCache, "yellow", buffYellow); SetPanelClassCached(panels.buffPanel, State.minimapObjectiveBuffClassCache, "red", buffRed); }
                if (panels.buffBridgeLeftPanel) { SetPanelClassCached(panels.buffBridgeLeftPanel, State.minimapObjectiveBuffBridgeLeftClassCache, "yellow", false); SetPanelClassCached(panels.buffBridgeLeftPanel, State.minimapObjectiveBuffBridgeLeftClassCache, "red", false); }
                if (panels.buffBridgeRightPanel) { SetPanelClassCached(panels.buffBridgeRightPanel, State.minimapObjectiveBuffBridgeRightClassCache, "yellow", false); SetPanelClassCached(panels.buffBridgeRightPanel, State.minimapObjectiveBuffBridgeRightClassCache, "red", false); }
                if (panels.rejuvPanel) { SetPanelClassCached(panels.rejuvPanel, State.minimapObjectiveRejuvClassCache, "yellow", rejuvYellow); SetPanelClassCached(panels.rejuvPanel, State.minimapObjectiveRejuvClassCache, "red", rejuvRed); }
            }

            function ApplyMinimapObjectiveTimersBridgeMode(panels, overlay, dims, bridgeDims, flags, icons, bridgeText, rejuvText) {
                var timerWidth = dims.timerWidth, timerHeight = dims.timerHeight, timerGap = dims.timerGap, timerPaddingX = dims.timerPaddingX, timerRadius = dims.timerRadius, timerFont = dims.timerFont, timerIcon = dims.timerIcon, bottomOffset = dims.bottomOffset;
                var minimapSize = bridgeDims.minimapSize, bridgeTimerWidth = bridgeDims.bridgeTimerWidth, bridgeTimerHeight = bridgeDims.bridgeTimerHeight, bridgeTimerPaddingX = bridgeDims.bridgeTimerPaddingX, bridgeTimerRadius = bridgeDims.bridgeTimerRadius, bridgeTimerFont = bridgeDims.bridgeTimerFont, bridgeHorizontalOffset = bridgeDims.bridgeHorizontalOffset;
                var buffEnabled = flags.buffEnabled, buffOnBridgeEnabled = flags.buffOnBridgeEnabled, rejuvEnabled = flags.rejuvEnabled, rejuvOnBridgeEnabled = flags.rejuvOnBridgeEnabled;
                var buffRed = flags.buffRed, buffYellow = flags.buffYellow, rejuvRed = flags.rejuvRed, rejuvYellow = flags.rejuvYellow;
                var buffIcon = icons.buffIcon, buffBridgeLeftIcon = icons.buffBridgeLeftIcon, buffBridgeRightIcon = icons.buffBridgeRightIcon, rejuvIcon = icons.rejuvIcon;
                var singleSlotOffset = Math.round(timerWidth + (timerGap * 2));
                var minimapScaleText = [timerWidth,timerHeight,timerGap,timerPaddingX,timerRadius,timerFont,timerIcon,bottomOffset,bridgeTimerWidth,bridgeTimerHeight,bridgeTimerPaddingX,bridgeTimerRadius,bridgeTimerFont,bridgeHorizontalOffset,singleSlotOffset,buffOnBridgeEnabled?1:0,rejuvOnBridgeEnabled?1:0].join("|");
                if (State.minimapObjectiveScaleSig !== minimapScaleText) {
                    overlay.style.width = minimapSize + "px"; overlay.style.height = minimapSize + "px"; overlay.style.horizontalAlign = "center"; overlay.style.verticalAlign = "center";
                    overlay.style.marginLeft = "0px"; overlay.style.marginRight = "0px"; overlay.style.marginTop = "0px"; overlay.style.marginBottom = "0px"; overlay.style.preTransformScale2d = "1.00, 1.00";
                    if (panels.buffPanel) { panels.buffPanel.style.width = timerWidth + "px"; panels.buffPanel.style.height = timerHeight + "px"; panels.buffPanel.style.margin = "0px"; panels.buffPanel.style.padding = "0px " + timerPaddingX + "px"; panels.buffPanel.style.borderRadius = timerRadius + "px"; panels.buffPanel.style.ignoreParentFlow = buffOnBridgeEnabled ? "true" : "false"; panels.buffPanel.style.horizontalAlign = "center"; panels.buffPanel.style.verticalAlign = buffOnBridgeEnabled ? "bottom" : "center"; panels.buffPanel.style.marginTop = "0px"; panels.buffPanel.style.marginBottom = buffOnBridgeEnabled ? (bottomOffset + "px") : "0px"; }
                    if (panels.rejuvPanel) { panels.rejuvPanel.style.width = timerWidth + "px"; panels.rejuvPanel.style.height = timerHeight + "px"; panels.rejuvPanel.style.margin = "0px"; panels.rejuvPanel.style.padding = "0px " + timerPaddingX + "px"; panels.rejuvPanel.style.borderRadius = timerRadius + "px"; panels.rejuvPanel.style.ignoreParentFlow = "true"; panels.rejuvPanel.style.horizontalAlign = "center"; panels.rejuvPanel.style.verticalAlign = rejuvOnBridgeEnabled ? "center" : "bottom"; panels.rejuvPanel.style.marginLeft = (rejuvOnBridgeEnabled ? 0 : singleSlotOffset) + "px"; panels.rejuvPanel.style.marginTop = "0px"; panels.rejuvPanel.style.marginBottom = rejuvOnBridgeEnabled ? "0px" : (bottomOffset + "px"); }
                    if (buffIcon) { buffIcon.style.width = timerIcon + "px"; buffIcon.style.height = timerIcon + "px"; if (buffIcon.SetHasClass) buffIcon.SetHasClass("qol-hidden", true); else buffIcon.style.visibility = "collapse"; }
                    if (panels.buffBridgeLeftPanel) { panels.buffBridgeLeftPanel.style.width = bridgeTimerWidth + "px"; panels.buffBridgeLeftPanel.style.height = bridgeTimerHeight + "px"; panels.buffBridgeLeftPanel.style.margin = "0px"; panels.buffBridgeLeftPanel.style.padding = "0px " + bridgeTimerPaddingX + "px"; panels.buffBridgeLeftPanel.style.borderRadius = bridgeTimerRadius + "px"; panels.buffBridgeLeftPanel.style.horizontalAlign = "center"; panels.buffBridgeLeftPanel.style.verticalAlign = "center"; panels.buffBridgeLeftPanel.style.marginLeft = (-bridgeHorizontalOffset) + "px"; panels.buffBridgeLeftPanel.style.ignoreParentFlow = "true"; panels.buffBridgeLeftPanel.style.marginTop = "0px"; panels.buffBridgeLeftPanel.style.marginBottom = "0px"; }
                    if (panels.buffBridgeRightPanel) { panels.buffBridgeRightPanel.style.width = bridgeTimerWidth + "px"; panels.buffBridgeRightPanel.style.height = bridgeTimerHeight + "px"; panels.buffBridgeRightPanel.style.margin = "0px"; panels.buffBridgeRightPanel.style.padding = "0px " + bridgeTimerPaddingX + "px"; panels.buffBridgeRightPanel.style.borderRadius = bridgeTimerRadius + "px"; panels.buffBridgeRightPanel.style.horizontalAlign = "center"; panels.buffBridgeRightPanel.style.verticalAlign = "center"; panels.buffBridgeRightPanel.style.marginLeft = bridgeHorizontalOffset + "px"; panels.buffBridgeRightPanel.style.ignoreParentFlow = "true"; panels.buffBridgeRightPanel.style.marginTop = "0px"; panels.buffBridgeRightPanel.style.marginBottom = "0px"; }
                    if (buffBridgeLeftIcon) { if (buffBridgeLeftIcon.SetHasClass) buffBridgeLeftIcon.SetHasClass("qol-hidden", true); else buffBridgeLeftIcon.style.visibility = "collapse"; }
                    if (buffBridgeRightIcon) { if (buffBridgeRightIcon.SetHasClass) buffBridgeRightIcon.SetHasClass("qol-hidden", true); else buffBridgeRightIcon.style.visibility = "collapse"; }
                    if (rejuvIcon) { rejuvIcon.style.width = timerIcon + "px"; rejuvIcon.style.height = timerIcon + "px"; if (rejuvIcon.SetHasClass) rejuvIcon.SetHasClass("qol-hidden", rejuvOnBridgeEnabled); else rejuvIcon.style.visibility = rejuvOnBridgeEnabled ? "collapse" : "visible"; }
                    if (panels.buffTime) panels.buffTime.style.fontSize = timerFont + "px";
                    if (panels.buffBridgeLeftTime) panels.buffBridgeLeftTime.style.fontSize = bridgeTimerFont + "px";
                    if (panels.buffBridgeRightTime) panels.buffBridgeRightTime.style.fontSize = bridgeTimerFont + "px";
                    if (panels.rejuvTime) panels.rejuvTime.style.fontSize = timerFont + "px";
                    State.minimapObjectiveScaleSig = minimapScaleText;
                }
                if (overlay.style.marginLeft !== "0px") overlay.style.marginLeft = "0px";
                var showBaseBuffPanel = buffEnabled && !buffOnBridgeEnabled;
                if (panels.buffPanel) { if (panels.buffPanel.SetHasClass) panels.buffPanel.SetHasClass("qol-hidden", !showBaseBuffPanel); else if (panels.buffPanel.style.visibility !== (showBaseBuffPanel ? "visible" : "collapse")) panels.buffPanel.style.visibility = showBaseBuffPanel ? "visible" : "collapse"; }
                if (panels.buffBridgeLeftPanel) { if (panels.buffBridgeLeftPanel.SetHasClass) panels.buffBridgeLeftPanel.SetHasClass("qol-hidden", !buffOnBridgeEnabled); else if (panels.buffBridgeLeftPanel.style.visibility !== (buffEnabled ? "visible" : "collapse")) panels.buffBridgeLeftPanel.style.visibility = buffOnBridgeEnabled ? "visible" : "collapse"; }
                if (panels.buffBridgeRightPanel) { if (panels.buffBridgeRightPanel.SetHasClass) panels.buffBridgeRightPanel.SetHasClass("qol-hidden", !buffOnBridgeEnabled); else if (panels.buffBridgeRightPanel.style.visibility !== (buffEnabled ? "visible" : "collapse")) panels.buffBridgeRightPanel.style.visibility = buffOnBridgeEnabled ? "visible" : "collapse"; }
                if (panels.rejuvPanel) { if (panels.rejuvPanel.SetHasClass) panels.rejuvPanel.SetHasClass("qol-hidden", !rejuvEnabled); else if (panels.rejuvPanel.style.visibility !== (rejuvEnabled ? "visible" : "collapse")) panels.rejuvPanel.style.visibility = rejuvEnabled ? "visible" : "collapse"; }
                if (panels.buffPanel && showBaseBuffPanel) { panels.buffPanel.style.ignoreParentFlow = "true"; panels.buffPanel.style.verticalAlign = "bottom"; panels.buffPanel.style.marginTop = "0px"; panels.buffPanel.style.marginBottom = bottomOffset + "px"; panels.buffPanel.style.marginLeft = ((!rejuvEnabled || rejuvOnBridgeEnabled) ? 0 : (-singleSlotOffset)) + "px"; }
                if (panels.rejuvPanel) { panels.rejuvPanel.style.ignoreParentFlow = "true"; if (rejuvOnBridgeEnabled) { panels.rejuvPanel.style.verticalAlign = "center"; panels.rejuvPanel.style.marginLeft = "0px"; panels.rejuvPanel.style.marginTop = "0px"; panels.rejuvPanel.style.marginBottom = "0px"; } else { panels.rejuvPanel.style.verticalAlign = "bottom"; panels.rejuvPanel.style.marginTop = "0px"; panels.rejuvPanel.style.marginBottom = bottomOffset + "px"; panels.rejuvPanel.style.marginLeft = ((buffEnabled && !buffOnBridgeEnabled) || buffOnBridgeEnabled ? singleSlotOffset : 0) + "px"; } }
                if (rejuvIcon) { if (rejuvIcon.SetHasClass) rejuvIcon.SetHasClass("qol-hidden", rejuvOnBridgeEnabled); else rejuvIcon.style.visibility = rejuvOnBridgeEnabled ? "collapse" : "visible"; }
                if (buffEnabled && panels.buffBridgeLeftTime && panels.buffBridgeLeftTime.text !== bridgeText) panels.buffBridgeLeftTime.text = bridgeText;
                if (buffEnabled && panels.buffBridgeRightTime && panels.buffBridgeRightTime.text !== bridgeText) panels.buffBridgeRightTime.text = bridgeText;
                if (rejuvEnabled && panels.rejuvTime && panels.rejuvTime.text !== rejuvText) panels.rejuvTime.text = rejuvText;
                if (panels.buffBridgeLeftPanel) { SetPanelClassCached(panels.buffBridgeLeftPanel, State.minimapObjectiveBuffBridgeLeftClassCache, "yellow", buffYellow); SetPanelClassCached(panels.buffBridgeLeftPanel, State.minimapObjectiveBuffBridgeLeftClassCache, "red", buffRed); }
                if (panels.buffBridgeRightPanel) { SetPanelClassCached(panels.buffBridgeRightPanel, State.minimapObjectiveBuffBridgeRightClassCache, "yellow", buffYellow); SetPanelClassCached(panels.buffBridgeRightPanel, State.minimapObjectiveBuffBridgeRightClassCache, "red", buffRed); }
                if (panels.buffPanel) { SetPanelClassCached(panels.buffPanel, State.minimapObjectiveBuffClassCache, "yellow", false); SetPanelClassCached(panels.buffPanel, State.minimapObjectiveBuffClassCache, "red", false); }
                if (panels.rejuvPanel) { SetPanelClassCached(panels.rejuvPanel, State.minimapObjectiveRejuvClassCache, "yellow", rejuvYellow); SetPanelClassCached(panels.rejuvPanel, State.minimapObjectiveRejuvClassCache, "red", rejuvRed); }
            }

            function UpdateMinimapObjectiveTimers(root, cfg, bridgeText, remainingBridge, rejuvText, remainingRejuv, spawnWaiting) {
                var buffEnabled = !!(cfg && IsCfgEnabled(cfg, "ENABLE_MINIMAP_BUFF_TIMER"));
                var buffOnBridgeEnabled = !!(buffEnabled && cfg && IsCfgEnabled(cfg, "ENABLE_MINIMAP_BUFF_TIMER_ON_BRIDGE"));
                var rejuvEnabled = !!(cfg && IsCfgEnabled(cfg, "ENABLE_MINIMAP_REJUV_TIMER"));
                var rejuvOnBridgeEnabled = !!(rejuvEnabled && cfg && IsCfgEnabled(cfg, "ENABLE_MINIMAP_ALWAYS_ON_MID_BOSS"));
                if (!buffEnabled && !rejuvEnabled) { HideMinimapObjectiveTimers(root); return; }
                var panels = EnsureMinimapObjectiveTimers(root);
                if (!panels || !panels.root) return;
                var overlay = panels.root;
                if (overlay.SetHasClass) overlay.SetHasClass("qol-hidden", false); else if (overlay.style.visibility !== "visible") overlay.style.visibility = "visible";
                var minimapSize = ResolveActiveMinimapObjectiveSize(root, cfg);
                if (!isFinite(minimapSize)) minimapSize = 400; if (minimapSize < 200) minimapSize = 200; if (minimapSize > 1200) minimapSize = 1200;
                var minimapScale = minimapSize / 400.0; if (!isFinite(minimapScale)) minimapScale = 1.0; if (minimapScale < 0.5) minimapScale = 0.5; if (minimapScale > 2.5) minimapScale = 2.5;
                var timerWidth = Math.max(58, Math.round(72 * minimapScale)), timerHeight = Math.max(22, Math.round(28 * minimapScale)), timerGap = Math.max(24, Math.round(40 * minimapScale));
                var timerPaddingX = Math.max(3, Math.round(5 * minimapScale)), timerRadius = Math.max(4, Math.round(5 * minimapScale));
                var timerFont = Math.max(11, Math.round(14 * minimapScale)), timerIcon = Math.max(12, Math.round(16 * minimapScale)), bottomOffset = Math.max(4, Math.round(minimapSize * 0.10));
                var bridgeRemain = Math.max(0, Math.floor(Number(remainingBridge) || 0)), rejuvRemain = Math.max(0, Math.floor(Number(remainingRejuv) || 0));
                var buffRed = buffEnabled && bridgeRemain < 10 && (bridgeRemain % 2) === 1, buffYellow = buffEnabled && !buffRed && bridgeRemain < 20 && (bridgeRemain % 2) === 1;
                var rejuvWarnEligible = rejuvEnabled && !spawnWaiting;
                var rejuvRed = rejuvEnabled && (spawnWaiting || (rejuvWarnEligible && rejuvRemain < 10 && (rejuvRemain % 2) === 1));
                var rejuvYellow = rejuvWarnEligible && !rejuvRed && rejuvRemain < 20 && (rejuvRemain % 2) === 1;
                var buffIcon = GetCachedPanel("minimapObjectiveBuffIcon"), buffBridgeLeftIcon = GetCachedPanel("minimapObjectiveBuffBridgeLeftIcon");
                var buffBridgeRightIcon = GetCachedPanel("minimapObjectiveBuffBridgeRightIcon"), rejuvIcon = GetCachedPanel("minimapObjectiveRejuvIcon");
                var bridgeTimerWidth = Math.max(29, Math.round(timerWidth * 0.5)), bridgeTimerHeight = Math.max(11, Math.round(timerHeight * 0.5));
                var bridgeTimerPaddingX = Math.max(2, Math.round(timerPaddingX * 0.5)), bridgeTimerRadius = Math.max(2, Math.round(timerRadius * 0.5));
                var bridgeTimerFont = Math.max(8, Math.round(timerFont * 0.5)), bridgeHorizontalOffset = Math.round(minimapSize * 0.35);
                if (!buffOnBridgeEnabled && !rejuvOnBridgeEnabled) {
                    ApplyMinimapObjectiveTimersStandardMode(panels, overlay, {timerWidth:timerWidth,timerHeight:timerHeight,timerGap:timerGap,timerPaddingX:timerPaddingX,timerRadius:timerRadius,timerFont:timerFont,timerIcon:timerIcon,bottomOffset:bottomOffset}, {buffEnabled:buffEnabled,rejuvEnabled:rejuvEnabled,buffRed:buffRed,buffYellow:buffYellow,rejuvRed:rejuvRed,rejuvYellow:rejuvYellow}, {buffIcon:buffIcon,buffBridgeLeftIcon:buffBridgeLeftIcon,buffBridgeRightIcon:buffBridgeRightIcon,rejuvIcon:rejuvIcon}, bridgeText, rejuvText);
                    return;
                }
                ApplyMinimapObjectiveTimersBridgeMode(panels, overlay, {timerWidth:timerWidth,timerHeight:timerHeight,timerGap:timerGap,timerPaddingX:timerPaddingX,timerRadius:timerRadius,timerFont:timerFont,timerIcon:timerIcon,bottomOffset:bottomOffset}, {minimapSize:minimapSize,bridgeTimerWidth:bridgeTimerWidth,bridgeTimerHeight:bridgeTimerHeight,bridgeTimerPaddingX:bridgeTimerPaddingX,bridgeTimerRadius:bridgeTimerRadius,bridgeTimerFont:bridgeTimerFont,bridgeHorizontalOffset:bridgeHorizontalOffset}, {buffEnabled:buffEnabled,buffOnBridgeEnabled:buffOnBridgeEnabled,rejuvEnabled:rejuvEnabled,rejuvOnBridgeEnabled:rejuvOnBridgeEnabled,buffRed:buffRed,buffYellow:buffYellow,rejuvRed:rejuvRed,rejuvYellow:rejuvYellow}, {buffIcon:buffIcon,buffBridgeLeftIcon:buffBridgeLeftIcon,buffBridgeRightIcon:buffBridgeRightIcon,rejuvIcon:rejuvIcon}, bridgeText, rejuvText);
            }

            function EnsureRejuvState() {
                if (State.rejuvState) return State.rejuvState;
                State.rejuvState = { running: false, wasInHideout: false, idx: 0, counter: 0, phaseStart: 0, claimCount: 0, spawnWaiting: false, lastScanFound: false, lastRejuvChargeCount: 0, lastMidBossActive: false, buffStartTime: 0, buffCounter: 0, lastBuffGameSec: -BUFF_LOCKOUT_SEC, lastSec: -1, lastGlobalSec: -1, lastRuntimeSec: -1, lastRuntimeFeatureSig: "", nextScanMs: 0, rotatingUntilMs: 0, rejuvBuffHideAtMs: 0, lastChargesLookupMs: 0, lastChargeCountReadMs: 0, lastChargeCountValue: 0, nextMidBossLookupMs: 0, lastMinimapRenderSig: "", cacheTopBar: null, cacheCharges: null, cacheFriendly: null, cacheEnemy: null, cacheRejuvTimer: null, cacheMidBossButton: null, panels: {} };
                return State.rejuvState;
            }

            function GetRejuvPanel(state, root, key, id) { var panel = IsPanelValid(state.panels[key]) ? state.panels[key] : null; if (!panel) { panel = root ? root.FindChildTraverse(id) : null; state.panels[key] = panel || null; } return panel; }

            function RejuvResetImage(state, root) { var imgs = [GetRejuvPanel(state,root,"rImg","RejuvImg"), GetRejuvPanel(state,root,"rImgHUD","RejuvImgHUD")]; for (var i = 0; i < imgs.length; i++) { var img = imgs[i]; if (!img) continue; img.RemoveClass("rotating"); img.RemoveClass("buff"); img.RemoveClass("reverse"); img.RemoveClass("white"); } }

            function RejuvSetPhaseImage(state, root, name, nowMs) {
                RejuvResetImage(state, root); var imgs = [GetRejuvPanel(state,root,"rImg","RejuvImg"), GetRejuvPanel(state,root,"rImgHUD","RejuvImgHUD")];
                var addBuff = String(name).toLowerCase().endsWith("buff"), addReverse = String(name).toLowerCase().endsWith("cd");
                for (var i = 0; i < imgs.length; i++) { var img = imgs[i]; if (!img) continue; if (addBuff) img.AddClass("buff"); if (addReverse) img.AddClass("reverse"); if (addBuff || addReverse) img.AddClass("rotating"); }
                if (addBuff || addReverse) state.rotatingUntilMs = nowMs + REJUV_ROTATE_ANIM_MS;
            }

            function RejuvSetLabels(state, root, timeText, numText) {
                var rLab = GetRejuvPanel(state,root,"rLab","RejuvTime"), rLabHUD = GetRejuvPanel(state,root,"rLabHUD","RejuvTimeHUD"), rNum = GetRejuvPanel(state,root,"rNum","RejuvNum"), rNumHUD = GetRejuvPanel(state,root,"rNumHUD","RejuvNumHUD");
                if (rLab && rLab.text !== timeText) rLab.text = timeText; if (rLabHUD && rLabHUD.text !== timeText) rLabHUD.text = timeText;
                if (rNum && rNum.text !== numText) rNum.text = numText; if (rNumHUD && rNumHUD.text !== numText) rNumHUD.text = numText;
            }

            function ApplyRedYellowPanelClasses(panel, red, yellow) { if (!panel) return; var showRed = !!red, showYellow = !showRed && !!yellow; SetPanelClassIfChanged(panel, "red", showRed); SetPanelClassIfChanged(panel, "yellow", showYellow); }

            function RejuvShowSpawn(state, root) {
                RejuvSetLabels(state, root, "Spawn", REJUV_SEQ[state.idx].num); RejuvResetImage(state, root);
                var _rI = GetRejuvPanel(state,root,"rImg","RejuvImg"), _rIH = GetRejuvPanel(state,root,"rImgHUD","RejuvImgHUD"); if (_rI) _rI.AddClass("white"); if (_rIH) _rIH.AddClass("white");
                ApplyRedYellowPanelClasses(GetRejuvPanel(state,root,"rejuvHUD","RejuvHUD"), true, false); state.spawnWaiting = true; state.lastScanFound = false;
            }

            function RejuvCalcPhaseAt(t) { var tt = Math.max(0, Math.floor(Number(t)||0)); if (Number(REJUV_SEQ[0].dur) <= 0) return {idx:0,phaseStart:tt,counter:0,spawnWaiting:true}; if (tt <= 2) return {idx:0,phaseStart:0,counter:REJUV_SEQ[0].dur}; var cum = 0; for (var i = 0; i < REJUV_SEQ.length; i++) { var dur = REJUV_SEQ[i].dur; if (tt < cum + dur) return {idx:i,phaseStart:cum,counter:(cum+dur-tt)}; cum += dur; } var lastIdx = REJUV_SEQ.length - 1, lastDur = REJUV_SEQ[lastIdx].dur, mod = (tt-cum)%BRIDGE_DURATION_SEC, within = mod%lastDur; return {idx:lastIdx,phaseStart:tt-within,counter:lastDur-within}; }

            function RejuvStartPhaseAuto(state, root, nowSec, nowMs) { var c = RejuvCalcPhaseAt(nowSec); state.idx = c.idx; state.counter = c.counter; state.phaseStart = c.phaseStart; state.spawnWaiting = false; if (c.spawnWaiting || state.counter <= 0) { RejuvShowSpawn(state, root); return; } ApplyRedYellowPanelClasses(GetRejuvPanel(state,root,"rejuvHUD","RejuvHUD"), false, false); RejuvSetLabels(state, root, FormatClockMmSs(state.counter), REJUV_SEQ[state.idx].num); RejuvSetPhaseImage(state, root, REJUV_SEQ[state.idx].name, nowMs); }

            function RejuvStartPhaseManual(state, root, targetIdx, nowSec, nowMs) { var idx = Math.max(0, Math.min(REJUV_SEQ.length-1, Number(targetIdx)||0)); state.idx = idx; state.counter = REJUV_SEQ[idx].dur; state.phaseStart = nowSec; state.spawnWaiting = false; ApplyRedYellowPanelClasses(GetRejuvPanel(state,root,"rejuvHUD","RejuvHUD"), false, false); RejuvSetLabels(state, root, FormatClockMmSs(state.counter), REJUV_SEQ[idx].num); RejuvSetPhaseImage(state, root, REJUV_SEQ[idx].name, nowMs); }

            function RejuvEndBuff(state, root, nowMs, immediate) { state.buffStartTime = 0; state.buffCounter = 0; var rb = GetRejuvPanel(state,root,"rejuvBuff","RejuvBuff"); if (!rb) return; rb.RemoveClass("pop-out"); if (immediate) { rb.RemoveClass("pop-in"); SetPanelOpacitySafe(rb, 0, 0); state.rejuvBuffHideAtMs = 0; return; } rb.AddClass("pop-in"); state.rejuvBuffHideAtMs = nowMs + REJUV_HIDE_POPIN_MS; }

            function RejuvStartBuff(state, root, nowSec, preserveExisting) { if (preserveExisting && state.buffStartTime > 0 && state.buffCounter > 0) return; state.buffStartTime = nowSec; state.buffCounter = REJUV_DURATION_SEC; var rb = GetRejuvPanel(state,root,"rejuvBuff","RejuvBuff"), rbt = GetRejuvPanel(state,root,"rejuvBuffTime","RejuvTimeBuff"); if (rb) { rb.RemoveClass("pop-in"); rb.AddClass("pop-out"); SetPanelOpacitySafe(rb, 1, 1); } if (rbt) rbt.text = FormatClockMmSs(state.buffCounter); }

            function RejuvReadChargeCount(state, root, nowMs) { if (!state) return 0; if (state.lastChargeCountReadMs === nowMs) return Number(state.lastChargeCountValue)||0; if (!IsPanelValid(state.cacheTopBar)||!IsPanelValid(state.cacheCharges)||!IsPanelValid(state.cacheFriendly)||!IsPanelValid(state.cacheEnemy)) { if (nowMs - state.lastChargesLookupMs > REJUV_CHARGES_LOOKUP_INTERVAL_MS) { state.lastChargesLookupMs = nowMs; state.cacheTopBar = root.FindChildTraverse(PANEL_ID_TOP_BAR) || root.FindChildTraverse("CitadelHudTopBar"); state.cacheCharges = state.cacheTopBar ? state.cacheTopBar.FindChildTraverse("RejuvenatorCharges") : null; state.cacheFriendly = state.cacheCharges ? state.cacheCharges.FindChildTraverse("RejuvenatorFriendly") : null; state.cacheEnemy = state.cacheCharges ? state.cacheCharges.FindChildTraverse("RejuvenatorEnemy") : null; state.cacheRejuvTimer = state.cacheCharges ? state.cacheCharges.FindChildTraverse("RejuvenatorTimer") : null; } } var cc = Math.max(GetHighestRejuvChargeTokenOnPanel(state.cacheFriendly), GetHighestRejuvChargeTokenOnPanel(state.cacheEnemy)); state.lastChargeCountReadMs = nowMs; state.lastChargeCountValue = cc; return cc; }

            function RejuvHasAnyCharges(state, root, nowMs) { return RejuvReadChargeCount(state, root, nowMs) > 0; }
            function RejuvGetChargeCount(state, root, nowMs) { return RejuvReadChargeCount(state, root, nowMs); }

            function RejuvFindMidBossButton(root) { if (!root||!root.FindChildrenWithClassTraverse) return null; var all = root.FindChildrenWithClassTraverse("mid_boss")||[]; for (var i = 0; i < all.length; i++) { var p = all[i]; if (!IsPanelValid(p)) continue; if (p.BHasClass && p.BHasClass("map_button")) return p; if (PanelHasClassToken(p,"map_button")) return p; } return null; }

            function RejuvIsMidBossSpawned(state, root, nowMs) { if (!state||!root) return false; var b = IsPanelValid(state.cacheMidBossButton) ? state.cacheMidBossButton : null; if (!b) { if (nowMs >= (state.nextMidBossLookupMs||0)) { b = RejuvFindMidBossButton(root); state.cacheMidBossButton = b||null; state.nextMidBossLookupMs = nowMs + REJUV_MIDBOSS_LOOKUP_INTERVAL_MS; } } if (!b) return false; if (b.BHasClass && b.BHasClass("midboss_spawned")) return true; return PanelHasClassToken(b, "midboss_spawned"); }

            function RejuvGetScanIntervalMs(state) { if (!state) return REJUV_SCAN_INTERVAL_MS; if (state.spawnWaiting || state.buffStartTime > 0) return REJUV_SCAN_INTERVAL_FAST_MS; return REJUV_SCAN_INTERVAL_MS; }

            function RejuvResetState(state, root, nowMs) {
                state.running = false; state.idx = 0; state.counter = 0; state.phaseStart = 0; state.claimCount = 0; state.spawnWaiting = false; state.lastScanFound = false; state.lastRejuvChargeCount = 0; state.lastMidBossActive = false; state.lastBuffGameSec = -BUFF_LOCKOUT_SEC; state.lastSec = -1; state.lastGlobalSec = -1; state.lastRuntimeSec = -1; state.lastRuntimeFeatureSig = ""; state._cachedRuntimeFeatureSig = ""; state._cachedConfigRef = null; state.nextScanMs = nowMs + RejuvGetScanIntervalMs(state); state.rotatingUntilMs = 0; state.rejuvBuffHideAtMs = 0; state.lastChargesLookupMs = 0; state.lastChargeCountReadMs = 0; state.lastChargeCountValue = 0; state.nextMidBossLookupMs = 0; state.lastMinimapRenderSig = ""; state._lastMidBossSpawned = undefined; state._lastHadRejuvPerTick = false; state.cacheTopBar = null; state.cacheCharges = null; state.cacheFriendly = null; state.cacheEnemy = null; state.cacheRejuvTimer = null; state.cacheMidBossButton = null;
                if (Number(REJUV_SEQ[0].dur) <= 0) { RejuvShowSpawn(state, root); } else { RejuvSetLabels(state, root, FormatClockMmSs(REJUV_SEQ[0].dur), REJUV_SEQ[0].num); RejuvResetImage(state, root); }
                RejuvEndBuff(state, root, nowMs, true);
            }

            // ── Main tick ──
            function _tick() {
                var root = _root || $.GetContextPanel(); if (root && !_root) _root = root;
                var cfg = ctx.config.all();
                var nowMs = Date.now ? Date.now() : (new Date()).getTime();

                var rejuvHudEnabled = !!(cfg && IsCfgEnabled(cfg, "ENABLE_REJUV_HUD"));
                var buffHudEnabled = !!(cfg && IsCfgEnabled(cfg, "ENABLE_BUFF_HUD"));
                var minimapRejuvEnabled = !!(cfg && IsCfgEnabled(cfg, "ENABLE_MINIMAP_REJUV_TIMER"));
                var minimapBuffEnabled = !!(cfg && IsCfgEnabled(cfg, "ENABLE_MINIMAP_BUFF_TIMER"));
                var anyObjectiveTimerEnabled = rejuvHudEnabled || buffHudEnabled || minimapRejuvEnabled || minimapBuffEnabled;
                if (!anyObjectiveTimerEnabled) {
                    HideMinimapObjectiveTimers(root);
                    if (!State.rejuvWasDisabled) { var ds = EnsureRejuvState(); RejuvResetState(ds, root, nowMs); State.rejuvWasDisabled = true; }
                    return;
                }
                if (IsStreetBrawlModeActive(root)) {
                    HideMinimapObjectiveTimers(root);
                    if (!State.rejuvWasDisabled) { var ss = EnsureRejuvState(); RejuvResetState(ss, root, nowMs); State.rejuvWasDisabled = true; }
                    return;
                }
                State.rejuvWasDisabled = false;
                var state = EnsureRejuvState();
                var nowSec = GetGameSecondsForUrn(root);
                if (state.lastGlobalSec >= 0 && (nowSec + 5 < state.lastGlobalSec || (state.lastGlobalSec > 30 && nowSec <= 2))) { RejuvResetState(state, root, nowMs); }
                if (!state.running) { state.running = true; state.claimCount = 0; state.lastScanFound = false; state.spawnWaiting = false; RejuvStartPhaseAuto(state, root, nowSec, nowMs); state.lastSec = nowSec; state.lastGlobalSec = nowSec; state.lastRejuvChargeCount = RejuvGetChargeCount(state, root, nowMs); state.lastMidBossActive = RejuvIsMidBossSpawned(state, root, nowMs); state.nextScanMs = nowMs + RejuvGetScanIntervalMs(state); } else { state.lastGlobalSec = nowSec; }

                var activeMinimapObjectiveSize, activeObjectiveZoomSig;
                if (State.lastConfig !== state._cachedConfigRef) {
                    activeMinimapObjectiveSize = ResolveActiveMinimapObjectiveSize(root, cfg);
                    var mp = ResolveCachedPanel(root, "minimapPersp", "minimap_persp");
                    activeObjectiveZoomSig = (IsHudClassActive(root,"gDetailView")||hasClassInHierarchy(mp,"gDetailView")?"A":"") + (IsHudClassActive(root,"gScoreboardOpen")||hasClassInHierarchy(mp,"gScoreboardOpen")?"T":"");
                    state._cachedRuntimeFeatureSig = [rejuvHudEnabled?"1":"0",buffHudEnabled?"1":"0",minimapRejuvEnabled?"1":"0",minimapBuffEnabled?"1":"0",cfg&&IsCfgEnabled(cfg,"ENABLE_MINIMAP_BUFF_TIMER_ON_BRIDGE")?"1":"0",cfg&&IsCfgEnabled(cfg,"ENABLE_MINIMAP_ALWAYS_ON_MID_BOSS")?"1":"0",String(cfg&&cfg.MINIMAP_SMALL_SIZE!==undefined?cfg.MINIMAP_SMALL_SIZE:""),String(activeMinimapObjectiveSize),activeObjectiveZoomSig].join("|");
                    state._cachedConfigRef = State.lastConfig;
                }

                // Per-tick cheap change detection
                var midBossBtn = IsPanelValid(state.cacheMidBossButton) ? state.cacheMidBossButton : null;
                if (midBossBtn) { var mbs = !!(midBossBtn.BHasClass && midBossBtn.BHasClass("midboss_spawned")); if (mbs !== state._lastMidBossSpawned) { state._lastMidBossSpawned = mbs; state.nextScanMs = 0; } }
                var _rjv = IsPanelValid(state.cacheRejuvTimer) ? state.cacheRejuvTimer : null;
                if (_rjv && _rjv.BHasClass) { var _hrn = _rjv.BHasClass("has_rejuv"); if (_hrn && !state._lastHadRejuvPerTick) { if (nowSec >= (state.lastBuffGameSec||0) + BUFF_LOCKOUT_SEC) { state.lastBuffGameSec = nowSec; RejuvStartBuff(state, root, nowSec, true); } } state._lastHadRejuvPerTick = _hrn; }

                // Fast-path early-exit
                if (state.lastRuntimeSec === nowSec && state.lastRuntimeFeatureSig === state._cachedRuntimeFeatureSig && nowMs < (state.nextScanMs||0) && (state.rotatingUntilMs <= 0 || nowMs < state.rotatingUntilMs) && (state.rejuvBuffHideAtMs <= 0 || nowMs < state.rejuvBuffHideAtMs) && state.buffStartTime <= 0) return;

                // Changed tick — hideout check
                var hideout = _isInHideout(root);
                if (hideout) { if (!state.wasInHideout || state.running || state.buffStartTime > 0) RejuvResetState(state, root, nowMs); state.wasInHideout = true; HideMinimapObjectiveTimers(root); return; }
                if (state.wasInHideout) { state.wasInHideout = false; state.nextScanMs = nowMs; }

                if (state.rotatingUntilMs > 0 && nowMs >= state.rotatingUntilMs) { state.rotatingUntilMs = 0; var _riA = GetRejuvPanel(state,root,"rImg","RejuvImg"), _riHA = GetRejuvPanel(state,root,"rImgHUD","RejuvImgHUD"); if (_riA) _riA.RemoveClass("rotating"); if (_riHA) _riHA.RemoveClass("rotating"); }
                if (state.rejuvBuffHideAtMs > 0 && nowMs >= state.rejuvBuffHideAtMs) { state.rejuvBuffHideAtMs = 0; var _rbHide = GetRejuvPanel(state,root,"rejuvBuff","RejuvBuff"); if (_rbHide) SetPanelOpacitySafe(_rbHide, 0, 0); }

                if (nowSec !== state.lastSec) {
                    state.lastSec = nowSec; var dur = REJUV_SEQ[state.idx].dur; var remaining = Math.max(0, dur - (nowSec - state.phaseStart));
                    if (remaining <= 0) { RejuvShowSpawn(state, root); } else { state.counter = remaining; RejuvSetLabels(state, root, FormatClockMmSs(remaining), REJUV_SEQ[state.idx].num); var _rjHUD = GetRejuvPanel(state,root,"rejuvHUD","RejuvHUD"); ApplyRedYellowPanelClasses(_rjHUD, remaining < 10 && (remaining%2)===1, remaining < 20 && (remaining%2)===1); }
                }

                if (state.buffStartTime > 0) { var elapsed = nowSec - state.buffStartTime; state.buffCounter = Math.max(0, REJUV_DURATION_SEC - elapsed); var _rbt = GetRejuvPanel(state,root,"rejuvBuffTime","RejuvTimeBuff"); var _btt = FormatClockMmSs(state.buffCounter); if (_rbt && _rbt.text !== _btt) _rbt.text = _btt; var _lcc = RejuvGetChargeCount(state, root, nowMs); if (_lcc <= 0 || state.buffCounter <= 0) RejuvEndBuff(state, root, nowMs, false); }

                var remainingBridge = BRIDGE_DURATION_SEC - (nowSec % BRIDGE_DURATION_SEC); var bridgeText = FormatClockMmSs(remainingBridge);
                var _bl = GetRejuvPanel(state,root,"buffLabel","BuffTime"), _blH = GetRejuvPanel(state,root,"buffLabelHUD","BuffTimeHUD");
                if (_bl && _bl.text !== bridgeText) _bl.text = bridgeText; if (_blH && _blH.text !== bridgeText) _blH.text = bridgeText;
                var _bH = GetRejuvPanel(state,root,"buffHUD","BuffHUD"); ApplyRedYellowPanelClasses(_bH, remainingBridge < 10 && (remainingBridge%2)===1, remainingBridge < 20 && (remainingBridge%2)===1);

                if (activeMinimapObjectiveSize === undefined) activeMinimapObjectiveSize = ResolveActiveMinimapObjectiveSize(root, cfg);
                if (activeObjectiveZoomSig === undefined) { var _mpF = ResolveCachedPanel(root,"minimapPersp","minimap_persp"); activeObjectiveZoomSig = (IsHudClassActive(root,"gDetailView")||hasClassInHierarchy(_mpF,"gDetailView")?"A":"") + (IsHudClassActive(root,"gScoreboardOpen")||hasClassInHierarchy(_mpF,"gScoreboardOpen")?"T":""); }

                var rejuvTextForMinimap = state.spawnWaiting ? "Spawn" : FormatClockMmSs(state.counter);
                var minimapRenderSig = [IsCfgEnabled(cfg,"ENABLE_MINIMAP_BUFF_TIMER")?1:0,IsCfgEnabled(cfg,"ENABLE_MINIMAP_BUFF_TIMER_ON_BRIDGE")?1:0,IsCfgEnabled(cfg,"ENABLE_MINIMAP_REJUV_TIMER")?1:0,IsCfgEnabled(cfg,"ENABLE_MINIMAP_ALWAYS_ON_MID_BOSS")?1:0,String(Number(cfg.MINIMAP_SMALL_SIZE)||0),String(activeMinimapObjectiveSize),activeObjectiveZoomSig,bridgeText,String(remainingBridge),rejuvTextForMinimap,String(state.counter),state.spawnWaiting?"1":"0"].join("|");
                if (minimapRenderSig !== String(state.lastMinimapRenderSig||"") || !GetCachedPanel("minimapObjectiveTimersRoot")) { UpdateMinimapObjectiveTimers(root, cfg, bridgeText, remainingBridge, rejuvTextForMinimap, state.spawnWaiting?0:state.counter, state.spawnWaiting); state.lastMinimapRenderSig = minimapRenderSig; }

                if (nowMs >= (state.nextScanMs||0)) {
                    var found = RejuvHasAnyCharges(state, root, nowMs); var chargeCount = RejuvGetChargeCount(state, root, nowMs); var midBossActive = RejuvIsMidBossSpawned(state, root, nowMs);
                    if (state.lastMidBossActive && !midBossActive) { state.claimCount++; RejuvStartPhaseManual(state, root, state.claimCount > 2 ? 3 : state.claimCount, nowSec, nowMs); }
                    else if (state.spawnWaiting && found && !state.lastScanFound) { state.claimCount++; RejuvStartPhaseManual(state, root, state.claimCount > 2 ? 3 : state.claimCount, nowSec, nowMs); }
                    if (((state.lastRejuvChargeCount||0) === 0 && chargeCount >= 1) && nowSec >= ((state.lastBuffGameSec||0) + BUFF_LOCKOUT_SEC)) { state.lastBuffGameSec = nowSec; RejuvStartBuff(state, root, nowSec, true); }
                    state.lastScanFound = found; state.lastRejuvChargeCount = chargeCount; state.lastMidBossActive = midBossActive; state.nextScanMs = nowMs + RejuvGetScanIntervalMs(state);
                }
                state.lastRuntimeSec = nowSec; state.lastRuntimeFeatureSig = state._cachedRuntimeFeatureSig;
            }

            return {
                onEnable: function() {
                    var S = QOL.core.Scheduler;
                    _loop = S && S.createPollLoop ? S.createPollLoop(_tick, 0.3, "ql_rejuv_timers") : null;
                },
                onDisable: function() {
                    if (_loop) { _loop.stop(); _loop = null; }
                    var S = QOL.core.Scheduler; if (S) S.cancelAllForFeature("ql_rejuv_timers");
                    var root = _root || $.GetContextPanel();
                    try { HideMinimapObjectiveTimers(root); } catch(e) {}
                    try { if (State.rejuvState) { RejuvResetState(State.rejuvState, root, Date.now ? Date.now() : (new Date()).getTime()); } } catch(e) {}
                    State.rejuvWasDisabled = true;
                    SetCachedPanel("minimapObjectiveTimersRoot", null); SetCachedPanel("minimapObjectiveBuffPanel", null); SetCachedPanel("minimapObjectiveBuffTime", null); SetCachedPanel("minimapObjectiveBuffIcon", null);
                    SetCachedPanel("minimapObjectiveBuffBridgeLeftPanel", null); SetCachedPanel("minimapObjectiveBuffBridgeLeftTime", null); SetCachedPanel("minimapObjectiveBuffBridgeLeftIcon", null);
                    SetCachedPanel("minimapObjectiveBuffBridgeRightPanel", null); SetCachedPanel("minimapObjectiveBuffBridgeRightTime", null); SetCachedPanel("minimapObjectiveBuffBridgeRightIcon", null);
                    SetCachedPanel("minimapObjectiveRejuvPanel", null); SetCachedPanel("minimapObjectiveRejuvTime", null); SetCachedPanel("minimapObjectiveRejuvIcon", null);
                    _root = null;
                },
                onSettingsChanged: function() {}
            };
        }
    });
})();

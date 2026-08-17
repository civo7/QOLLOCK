// features/ql_minimap_timers/manifest.js
// =============================================================================
// QOLLOCK — Minimap Objective Timers (rejuv + buff overlays on the minimap)
// =============================================================================
// OWNS:        Minimap buff/rejuv timer overlay panels + layout
// DOES NOT OWN: State.rejuvState (owned by ql_rejuv_hud), mid-boss, minimap panel
// DEPENDS ON:  QOL.core.FeatureRegistry, QOL.core.Scheduler, ql_rejuv_hud (reads State.rejuvState)
// CONFIG KEYS: ENABLE_MINIMAP_REJUV_TIMER, ENABLE_MINIMAP_BUFF_TIMER,
//              ENABLE_MINIMAP_BUFF_TIMER_ON_BRIDGE, ENABLE_MINIMAP_ALWAYS_ON_MID_BOSS,
//              ENABLE_TAB_ZOOM, ENABLE_ALT_ZOOM, MINIMAP_SMALL_SIZE,
//              MINIMAP_LARGE_SIZE, MINIMAP_LARGE_SIZE_ALT, MINIMAP_LARGE_SIZE_TAB
// CSS:         none
// PATTERN:     Polling (0.3Hz). Self-scheduling via Scheduler.
// SPLIT FROM:  ql_rejuv_timers — HUD code extracted to ql_rejuv_hud
// =============================================================================

(function() {
    "use strict";

    var FR = QOL.core.FeatureRegistry;
    if (!FR) { $.Msg("[QOLLock] ql_minimap_timers: FeatureRegistry not found — aborting"); return; }

    FR.register({
        id: "ql_minimap_timers",
        enableKey: "ENABLE_MINIMAP_REJUV_TIMER",
        enabledByDefault: false,
        settings: [
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
            var _deps = QOL.import(["ensureMinimapOverlayAnchor","getCachedPanel","getGameSecondsForUrn","hasClassInHierarchy","isConnectedToHideout","isHudClassActive","isStreetBrawlModeActive","resolveCachedPanel","state","setCachedPanel","setPanelClassCached","utils"]);
            var GetCachedPanel = _deps.getCachedPanel;
            var ResolveCachedPanel = _deps.resolveCachedPanel;
            var State = _deps.state;
            var SetCachedPanel = _deps.setCachedPanel;
            var Utils = _deps.utils;
            var IsCfgEnabled = Utils.IsCfgEnabled;
            var IsPanelValid = Utils.IsPanelValid;
            var SetPanelClassCached = _deps.setPanelClassCached;
            var IsHudClassActive = _deps.isHudClassActive;
            var hasClassInHierarchy = _deps.hasClassInHierarchy;
            var EnsureMinimapOverlayAnchor = _deps.ensureMinimapOverlayAnchor;
            var GetGameSecondsForUrn = _deps.getGameSecondsForUrn;
            var IsStreetBrawlModeActive = _deps.isStreetBrawlModeActive;
            var isConnectedToHideout = _deps.isConnectedToHideout;
            var BRIDGE_DURATION_SEC = 300;

            var _loop = null;
            var _root = null;

            function FormatClockMmSs(totalSec) { var s = Math.max(0, Math.floor(Number(totalSec) || 0)); var mm = Math.floor(s / 60); var ss = s % 60; return String(mm) + ":" + (ss < 10 ? "0" + ss : String(ss)); }

            function EnsureMinimapObjectiveTimers(root) {
                var anchor = EnsureMinimapOverlayAnchor(root);
                if (!anchor) return null;
                var overlay = GetCachedPanel("minimapObjectiveTimersRoot");
                if (!overlay) { overlay = anchor.FindChildTraverse("QOLMinimapTimersRoot"); if (!overlay) overlay = $.CreatePanel("Panel", anchor, "QOLMinimapTimersRoot", { hittest: "false", hittestchildren: "false" }); }
                else if (overlay.GetParent && overlay.GetParent() !== anchor && overlay.SetParent) { overlay.SetParent(anchor); }
                if (!overlay) return null;
                overlay.hittest = false; overlay.hittestchildren = false;
                if (anchor.MoveChildAfter && anchor.GetChildCount) { var cc = Number(anchor.GetChildCount()) || 0; if (cc > 0) { var lc = anchor.GetChild(cc - 1); if (lc && lc !== overlay) anchor.MoveChildAfter(overlay, lc); } }
                var buffPanel = overlay.FindChildTraverse("QOLMinimapBuffTimer"); if (!buffPanel) buffPanel = $.CreatePanel("Panel", overlay, "QOLMinimapBuffTimer");
                buffPanel.AddClass("QOLMinimapTimer"); buffPanel.hittest = false; buffPanel.hittestchildren = false;
                var buffIcon = buffPanel.FindChildTraverse("QOLMinimapBuffIcon"); if (!buffIcon) buffIcon = $.CreatePanel("Image", buffPanel, "QOLMinimapBuffIcon", { src: "s2r://panorama/images/hud/modifiers/icon_powerup.svg" });
                buffIcon.hittest = false; buffIcon.hittestchildren = false;
                var buffTime = buffPanel.FindChildTraverse("QOLMinimapBuffTime"); if (!buffTime) { buffTime = $.CreatePanel("Label", buffPanel, "QOLMinimapBuffTime"); buffTime.text = "00:00"; }
                buffTime.AddClass("QOLMinimapTimerLabel"); buffTime.hittest = false; buffTime.hittestchildren = false;
                var buffBridgeLeftPanel = overlay.FindChildTraverse("QOLMinimapBuffBridgeLeftTimer"); if (!buffBridgeLeftPanel) buffBridgeLeftPanel = $.CreatePanel("Panel", overlay, "QOLMinimapBuffBridgeLeftTimer");
                buffBridgeLeftPanel.AddClass("QOLMinimapTimer"); buffBridgeLeftPanel.hittest = false; buffBridgeLeftPanel.hittestchildren = false; buffBridgeLeftPanel.style.ignoreParentFlow = "true";
                var buffBridgeLeftIcon = buffBridgeLeftPanel.FindChildTraverse("QOLMinimapBuffBridgeLeftIcon"); if (!buffBridgeLeftIcon) buffBridgeLeftIcon = $.CreatePanel("Image", buffBridgeLeftPanel, "QOLMinimapBuffBridgeLeftIcon", { src: "s2r://panorama/images/hud/modifiers/icon_powerup.svg" });
                buffBridgeLeftIcon.hittest = false; buffBridgeLeftIcon.hittestchildren = false;
                var buffBridgeLeftTime = buffBridgeLeftPanel.FindChildTraverse("QOLMinimapBuffBridgeLeftTime"); if (!buffBridgeLeftTime) { buffBridgeLeftTime = $.CreatePanel("Label", buffBridgeLeftPanel, "QOLMinimapBuffBridgeLeftTime"); buffBridgeLeftTime.text = "00:00"; }
                buffBridgeLeftTime.AddClass("QOLMinimapTimerLabel"); buffBridgeLeftTime.hittest = false; buffBridgeLeftTime.hittestchildren = false;
                var buffBridgeRightPanel = overlay.FindChildTraverse("QOLMinimapBuffBridgeRightTimer"); if (!buffBridgeRightPanel) buffBridgeRightPanel = $.CreatePanel("Panel", overlay, "QOLMinimapBuffBridgeRightTimer");
                buffBridgeRightPanel.AddClass("QOLMinimapTimer"); buffBridgeRightPanel.hittest = false; buffBridgeRightPanel.hittestchildren = false; buffBridgeRightPanel.style.ignoreParentFlow = "true";
                var buffBridgeRightIcon = buffBridgeRightPanel.FindChildTraverse("QOLMinimapBuffBridgeRightIcon"); if (!buffBridgeRightIcon) buffBridgeRightIcon = $.CreatePanel("Image", buffBridgeRightPanel, "QOLMinimapBuffBridgeRightIcon", { src: "s2r://panorama/images/hud/modifiers/icon_powerup.svg" });
                buffBridgeRightIcon.hittest = false; buffBridgeRightIcon.hittestchildren = false;
                var buffBridgeRightTime = buffBridgeRightPanel.FindChildTraverse("QOLMinimapBuffBridgeRightTime"); if (!buffBridgeRightTime) { buffBridgeRightTime = $.CreatePanel("Label", buffBridgeRightPanel, "QOLMinimapBuffBridgeRightTime"); buffBridgeRightTime.text = "00:00"; }
                buffBridgeRightTime.AddClass("QOLMinimapTimerLabel"); buffBridgeRightTime.hittest = false; buffBridgeRightTime.hittestchildren = false;
                var rejuvPanel = overlay.FindChildTraverse("QOLMinimapRejuvTimer"); if (!rejuvPanel) rejuvPanel = $.CreatePanel("Panel", overlay, "QOLMinimapRejuvTimer");
                rejuvPanel.AddClass("QOLMinimapTimer"); rejuvPanel.hittest = false; rejuvPanel.hittestchildren = false;
                var rejuvIcon = rejuvPanel.FindChildTraverse("QOLMinimapRejuvIcon"); if (!rejuvIcon) rejuvIcon = $.CreatePanel("Image", rejuvPanel, "QOLMinimapRejuvIcon", { src: "s2r://panorama/images/hud/modifiers/icon_rejuvenator.svg" });
                rejuvIcon.hittest = false; rejuvIcon.hittestchildren = false;
                var rejuvTime = rejuvPanel.FindChildTraverse("QOLMinimapRejuvTime"); if (!rejuvTime) { rejuvTime = $.CreatePanel("Label", rejuvPanel, "QOLMinimapRejuvTime"); rejuvTime.text = "00:00"; }
                rejuvTime.AddClass("QOLMinimapTimerLabel"); rejuvTime.hittest = false; rejuvTime.hittestchildren = false;
                SetCachedPanel("minimapObjectiveTimersRoot", overlay); SetCachedPanel("minimapObjectiveBuffPanel", buffPanel); SetCachedPanel("minimapObjectiveBuffTime", buffTime); SetCachedPanel("minimapObjectiveBuffIcon", buffIcon);
                SetCachedPanel("minimapObjectiveBuffBridgeLeftPanel", buffBridgeLeftPanel); SetCachedPanel("minimapObjectiveBuffBridgeLeftTime", buffBridgeLeftTime); SetCachedPanel("minimapObjectiveBuffBridgeLeftIcon", buffBridgeLeftIcon);
                SetCachedPanel("minimapObjectiveBuffBridgeRightPanel", buffBridgeRightPanel); SetCachedPanel("minimapObjectiveBuffBridgeRightTime", buffBridgeRightTime); SetCachedPanel("minimapObjectiveBuffBridgeRightIcon", buffBridgeRightIcon);
                SetCachedPanel("minimapObjectiveRejuvPanel", rejuvPanel); SetCachedPanel("minimapObjectiveRejuvTime", rejuvTime); SetCachedPanel("minimapObjectiveRejuvIcon", rejuvIcon);
                if (overlay.MoveChildBefore && rejuvPanel && buffPanel) overlay.MoveChildBefore(rejuvPanel, buffPanel);
                return { root: overlay, buffPanel: buffPanel, buffTime: buffTime, buffBridgeLeftPanel: buffBridgeLeftPanel, buffBridgeLeftTime: buffBridgeLeftTime, buffBridgeRightPanel: buffBridgeRightPanel, buffBridgeRightTime: buffBridgeRightTime, rejuvPanel: rejuvPanel, rejuvTime: rejuvTime };
            }

            function HideMinimapObjectiveTimers(root) {
                var overlay = GetCachedPanel("minimapObjectiveTimersRoot"); if (!overlay && root && root.FindChildTraverse) { overlay = root.FindChildTraverse("QOLMinimapTimersRoot"); if (overlay) SetCachedPanel("minimapObjectiveTimersRoot", overlay); }
                if (!overlay) return;
                if (overlay.SetHasClass) overlay.SetHasClass("qol-hidden", true); else if (overlay.style.visibility !== "collapse") overlay.style.visibility = "collapse";
                State.minimapObjectiveScaleSig = "";
                if (overlay.style.preTransformScale2d !== "1.00, 1.00") overlay.style.preTransformScale2d = "1.00, 1.00";
                var bp = GetCachedPanel("minimapObjectiveBuffPanel"), blp = GetCachedPanel("minimapObjectiveBuffBridgeLeftPanel"), brp = GetCachedPanel("minimapObjectiveBuffBridgeRightPanel"), rp = GetCachedPanel("minimapObjectiveRejuvPanel");
                if (bp) { SetPanelClassCached(bp, State.minimapObjectiveBuffClassCache, "yellow", false); SetPanelClassCached(bp, State.minimapObjectiveBuffClassCache, "red", false); }
                if (blp) { SetPanelClassCached(blp, State.minimapObjectiveBuffBridgeLeftClassCache, "yellow", false); SetPanelClassCached(blp, State.minimapObjectiveBuffBridgeLeftClassCache, "red", false); }
                if (brp) { SetPanelClassCached(brp, State.minimapObjectiveBuffBridgeRightClassCache, "yellow", false); SetPanelClassCached(brp, State.minimapObjectiveBuffBridgeRightClassCache, "red", false); }
                if (rp) { SetPanelClassCached(rp, State.minimapObjectiveRejuvClassCache, "yellow", false); SetPanelClassCached(rp, State.minimapObjectiveRejuvClassCache, "red", false); }
            }

            function GetMinimapConfigNumber(cfg, newKey, legacyKey, fb) { var v = cfg ? cfg[newKey] : undefined; if (v === undefined || v === null || !isFinite(Number(v))) v = cfg ? cfg[legacyKey] : undefined; if (v === undefined || v === null || !isFinite(Number(v))) v = fb; return Number(v); }

            function ResolveActiveMinimapObjectiveSize(root, cfg) { var ss = Number(cfg && cfg.MINIMAP_SMALL_SIZE); if (!isFinite(ss)) ss = 400; var mp = ResolveCachedPanel(root, "minimapPersp", "minimap_persp"); var isAlt = IsHudClassActive(root,"gDetailView") || hasClassInHierarchy(mp,"gDetailView"); var isTab = IsHudClassActive(root,"gScoreboardOpen") || hasClassInHierarchy(mp,"gScoreboardOpen"); if (isTab && cfg && IsCfgEnabled(cfg,"ENABLE_TAB_ZOOM")) return GetMinimapConfigNumber(cfg,"MINIMAP_LARGE_SIZE_TAB","MINIMAP_LARGE_SIZE",ss); if (isAlt && cfg && IsCfgEnabled(cfg,"ENABLE_ALT_ZOOM")) return GetMinimapConfigNumber(cfg,"MINIMAP_LARGE_SIZE_ALT","MINIMAP_LARGE_SIZE",ss); return ss; }

            function ApplyMinimapObjectiveTimersStandardMode(panels, overlay, dims, flags, icons, bridgeText, rejuvText) {
                var tw = dims.timerWidth, th = dims.timerHeight, tg = dims.timerGap, tpx = dims.timerPaddingX, tr = dims.timerRadius, tf = dims.timerFont, ti = dims.timerIcon, bo = dims.bottomOffset;
                var be = flags.buffEnabled, re = flags.rejuvEnabled, br = flags.buffRed, by = flags.buffYellow, rr = flags.rejuvRed, ry = flags.rejuvYellow;
                var bi = icons.buffIcon, bli = icons.buffBridgeLeftIcon, bri = icons.buffBridgeRightIcon, ri = icons.rejuvIcon;
                var sig = [tw,th,tg,tpx,tr,tf,ti,bo].join("|");
                if (State.minimapObjectiveScaleSig !== sig) {
                    if (overlay.style.preTransformScale2d !== "1.00, 1.00") overlay.style.preTransformScale2d = "1.00, 1.00";
                    overlay.style.width = "fit-children"; overlay.style.height = "fit-children"; overlay.style.horizontalAlign = "center"; overlay.style.verticalAlign = "bottom"; overlay.style.marginTop = "0px"; overlay.style.marginRight = "0px"; overlay.style.marginBottom = bo + "px";
                    if (panels.buffPanel) { panels.buffPanel.style.width = tw + "px"; panels.buffPanel.style.height = th + "px"; panels.buffPanel.style.margin = "0px " + tg + "px"; panels.buffPanel.style.padding = "0px " + tpx + "px"; panels.buffPanel.style.borderRadius = tr + "px"; panels.buffPanel.style.ignoreParentFlow = "false"; panels.buffPanel.style.horizontalAlign = "center"; panels.buffPanel.style.verticalAlign = "center"; }
                    if (panels.rejuvPanel) { panels.rejuvPanel.style.width = tw + "px"; panels.rejuvPanel.style.height = th + "px"; panels.rejuvPanel.style.margin = "0px " + tg + "px"; panels.rejuvPanel.style.padding = "0px " + tpx + "px"; panels.rejuvPanel.style.borderRadius = tr + "px"; panels.rejuvPanel.style.ignoreParentFlow = "false"; panels.rejuvPanel.style.horizontalAlign = "center"; panels.rejuvPanel.style.verticalAlign = "center"; }
                    if (bi) { bi.style.width = ti + "px"; bi.style.height = ti + "px"; if (bi.SetHasClass) bi.SetHasClass("qol-hidden", false); else bi.style.visibility = "visible"; }
                    if (bli) { if (bli.SetHasClass) bli.SetHasClass("qol-hidden", true); else bli.style.visibility = "collapse"; }
                    if (bri) { if (bri.SetHasClass) bri.SetHasClass("qol-hidden", true); else bri.style.visibility = "collapse"; }
                    if (ri) { ri.style.width = ti + "px"; ri.style.height = ti + "px"; if (ri.SetHasClass) ri.SetHasClass("qol-hidden", false); else ri.style.visibility = "visible"; }
                    if (panels.buffTime) panels.buffTime.style.fontSize = tf + "px"; if (panels.rejuvTime) panels.rejuvTime.style.fontSize = tf + "px";
                    State.minimapObjectiveScaleSig = sig;
                }
                var sso = Math.round(tw + (tg * 2)), oml = "0px";
                if (be && !re) oml = sso + "px"; else if (re && !be) oml = (-sso) + "px";
                if (overlay.style.marginLeft !== oml) overlay.style.marginLeft = oml;
                if (panels.buffPanel) { var bv = be; if (panels.buffPanel.SetHasClass) panels.buffPanel.SetHasClass("qol-hidden", !bv); else if (panels.buffPanel.style.visibility !== (bv ? "visible" : "collapse")) panels.buffPanel.style.visibility = bv ? "visible" : "collapse"; }
                if (panels.rejuvPanel) { var rv = re; if (panels.rejuvPanel.SetHasClass) panels.rejuvPanel.SetHasClass("qol-hidden", !rv); else if (panels.rejuvPanel.style.visibility !== (rv ? "visible" : "collapse")) panels.rejuvPanel.style.visibility = rv ? "visible" : "collapse"; }
                if (panels.buffBridgeLeftPanel) { if (panels.buffBridgeLeftPanel.SetHasClass) panels.buffBridgeLeftPanel.SetHasClass("qol-hidden", true); else if (panels.buffBridgeLeftPanel.style.visibility !== "collapse") panels.buffBridgeLeftPanel.style.visibility = "collapse"; }
                if (panels.buffBridgeRightPanel) { if (panels.buffBridgeRightPanel.SetHasClass) panels.buffBridgeRightPanel.SetHasClass("qol-hidden", true); else if (panels.buffBridgeRightPanel.style.visibility !== "collapse") panels.buffBridgeRightPanel.style.visibility = "collapse"; }
                if (be && panels.buffTime && panels.buffTime.text !== bridgeText) panels.buffTime.text = bridgeText;
                if (re && panels.rejuvTime && panels.rejuvTime.text !== rejuvText) panels.rejuvTime.text = rejuvText;
                if (panels.buffPanel) { SetPanelClassCached(panels.buffPanel, State.minimapObjectiveBuffClassCache, "yellow", by); SetPanelClassCached(panels.buffPanel, State.minimapObjectiveBuffClassCache, "red", br); }
                if (panels.buffBridgeLeftPanel) { SetPanelClassCached(panels.buffBridgeLeftPanel, State.minimapObjectiveBuffBridgeLeftClassCache, "yellow", false); SetPanelClassCached(panels.buffBridgeLeftPanel, State.minimapObjectiveBuffBridgeLeftClassCache, "red", false); }
                if (panels.buffBridgeRightPanel) { SetPanelClassCached(panels.buffBridgeRightPanel, State.minimapObjectiveBuffBridgeRightClassCache, "yellow", false); SetPanelClassCached(panels.buffBridgeRightPanel, State.minimapObjectiveBuffBridgeRightClassCache, "red", false); }
                if (panels.rejuvPanel) { SetPanelClassCached(panels.rejuvPanel, State.minimapObjectiveRejuvClassCache, "yellow", ry); SetPanelClassCached(panels.rejuvPanel, State.minimapObjectiveRejuvClassCache, "red", rr); }
            }

            function ApplyMinimapObjectiveTimersBridgeMode(panels, overlay, dims, bd, flags, icons, bridgeText, rejuvText) {
                var tw = dims.timerWidth, th = dims.timerHeight, tg = dims.timerGap, tpx = dims.timerPaddingX, tr = dims.timerRadius, tf = dims.timerFont, ti = dims.timerIcon, bo = dims.bottomOffset;
                var ms = bd.minimapSize, btw = bd.bridgeTimerWidth, bth = bd.bridgeTimerHeight, btpx = bd.bridgeTimerPaddingX, btr = bd.bridgeTimerRadius, btf = bd.bridgeTimerFont, bho = bd.bridgeHorizontalOffset;
                var be = flags.buffEnabled, bbe = flags.buffOnBridgeEnabled, re = flags.rejuvEnabled, rbe = flags.rejuvOnBridgeEnabled, br = flags.buffRed, by = flags.buffYellow, rr = flags.rejuvRed, ry = flags.rejuvYellow;
                var bi = icons.buffIcon, bli = icons.buffBridgeLeftIcon, bri = icons.buffBridgeRightIcon, ri = icons.rejuvIcon;
                var sso = Math.round(tw + (tg * 2));
                var sig = [tw,th,tg,tpx,tr,tf,ti,bo,btw,bth,btpx,btr,btf,bho,sso,bbe?1:0,rbe?1:0].join("|");
                if (State.minimapObjectiveScaleSig !== sig) {
                    overlay.style.width = ms + "px"; overlay.style.height = ms + "px"; overlay.style.horizontalAlign = "center"; overlay.style.verticalAlign = "center"; overlay.style.marginLeft = "0px"; overlay.style.marginRight = "0px"; overlay.style.marginTop = "0px"; overlay.style.marginBottom = "0px"; overlay.style.preTransformScale2d = "1.00, 1.00";
                    if (panels.buffPanel) { panels.buffPanel.style.width = tw + "px"; panels.buffPanel.style.height = th + "px"; panels.buffPanel.style.margin = "0px"; panels.buffPanel.style.padding = "0px " + tpx + "px"; panels.buffPanel.style.borderRadius = tr + "px"; panels.buffPanel.style.ignoreParentFlow = bbe ? "true" : "false"; panels.buffPanel.style.horizontalAlign = "center"; panels.buffPanel.style.verticalAlign = bbe ? "bottom" : "center"; panels.buffPanel.style.marginTop = "0px"; panels.buffPanel.style.marginBottom = bbe ? (bo + "px") : "0px"; }
                    if (panels.rejuvPanel) { panels.rejuvPanel.style.width = tw + "px"; panels.rejuvPanel.style.height = th + "px"; panels.rejuvPanel.style.margin = "0px"; panels.rejuvPanel.style.padding = "0px " + tpx + "px"; panels.rejuvPanel.style.borderRadius = tr + "px"; panels.rejuvPanel.style.ignoreParentFlow = "true"; panels.rejuvPanel.style.horizontalAlign = "center"; panels.rejuvPanel.style.verticalAlign = rbe ? "center" : "bottom"; panels.rejuvPanel.style.marginLeft = (rbe ? 0 : sso) + "px"; panels.rejuvPanel.style.marginTop = "0px"; panels.rejuvPanel.style.marginBottom = rbe ? "0px" : (bo + "px"); }
                    if (bi) { bi.style.width = ti + "px"; bi.style.height = ti + "px"; if (bi.SetHasClass) bi.SetHasClass("qol-hidden", true); else bi.style.visibility = "collapse"; }
                    if (panels.buffBridgeLeftPanel) { panels.buffBridgeLeftPanel.style.width = btw + "px"; panels.buffBridgeLeftPanel.style.height = bth + "px"; panels.buffBridgeLeftPanel.style.margin = "0px"; panels.buffBridgeLeftPanel.style.padding = "0px " + btpx + "px"; panels.buffBridgeLeftPanel.style.borderRadius = btr + "px"; panels.buffBridgeLeftPanel.style.horizontalAlign = "center"; panels.buffBridgeLeftPanel.style.verticalAlign = "center"; panels.buffBridgeLeftPanel.style.marginLeft = (-bho) + "px"; panels.buffBridgeLeftPanel.style.ignoreParentFlow = "true"; panels.buffBridgeLeftPanel.style.marginTop = "0px"; panels.buffBridgeLeftPanel.style.marginBottom = "0px"; }
                    if (panels.buffBridgeRightPanel) { panels.buffBridgeRightPanel.style.width = btw + "px"; panels.buffBridgeRightPanel.style.height = bth + "px"; panels.buffBridgeRightPanel.style.margin = "0px"; panels.buffBridgeRightPanel.style.padding = "0px " + btpx + "px"; panels.buffBridgeRightPanel.style.borderRadius = btr + "px"; panels.buffBridgeRightPanel.style.horizontalAlign = "center"; panels.buffBridgeRightPanel.style.verticalAlign = "center"; panels.buffBridgeRightPanel.style.marginLeft = bho + "px"; panels.buffBridgeRightPanel.style.ignoreParentFlow = "true"; panels.buffBridgeRightPanel.style.marginTop = "0px"; panels.buffBridgeRightPanel.style.marginBottom = "0px"; }
                    if (bli) { if (bli.SetHasClass) bli.SetHasClass("qol-hidden", true); else bli.style.visibility = "collapse"; }
                    if (bri) { if (bri.SetHasClass) bri.SetHasClass("qol-hidden", true); else bri.style.visibility = "collapse"; }
                    if (ri) { ri.style.width = ti + "px"; ri.style.height = ti + "px"; if (ri.SetHasClass) ri.SetHasClass("qol-hidden", rbe); else ri.style.visibility = rbe ? "collapse" : "visible"; }
                    if (panels.buffTime) panels.buffTime.style.fontSize = tf + "px"; if (panels.buffBridgeLeftTime) panels.buffBridgeLeftTime.style.fontSize = btf + "px"; if (panels.buffBridgeRightTime) panels.buffBridgeRightTime.style.fontSize = btf + "px"; if (panels.rejuvTime) panels.rejuvTime.style.fontSize = tf + "px";
                    State.minimapObjectiveScaleSig = sig;
                }
                if (overlay.style.marginLeft !== "0px") overlay.style.marginLeft = "0px";
                var sbbp = be && !bbe;
                if (panels.buffPanel) { if (panels.buffPanel.SetHasClass) panels.buffPanel.SetHasClass("qol-hidden", !sbbp); else if (panels.buffPanel.style.visibility !== (sbbp ? "visible" : "collapse")) panels.buffPanel.style.visibility = sbbp ? "visible" : "collapse"; }
                if (panels.buffBridgeLeftPanel) { if (panels.buffBridgeLeftPanel.SetHasClass) panels.buffBridgeLeftPanel.SetHasClass("qol-hidden", !bbe); else if (panels.buffBridgeLeftPanel.style.visibility !== (be ? "visible" : "collapse")) panels.buffBridgeLeftPanel.style.visibility = bbe ? "visible" : "collapse"; }
                if (panels.buffBridgeRightPanel) { if (panels.buffBridgeRightPanel.SetHasClass) panels.buffBridgeRightPanel.SetHasClass("qol-hidden", !bbe); else if (panels.buffBridgeRightPanel.style.visibility !== (be ? "visible" : "collapse")) panels.buffBridgeRightPanel.style.visibility = bbe ? "visible" : "collapse"; }
                if (panels.rejuvPanel) { if (panels.rejuvPanel.SetHasClass) panels.rejuvPanel.SetHasClass("qol-hidden", !re); else if (panels.rejuvPanel.style.visibility !== (re ? "visible" : "collapse")) panels.rejuvPanel.style.visibility = re ? "visible" : "collapse"; }
                if (panels.buffPanel && sbbp) { panels.buffPanel.style.ignoreParentFlow = "true"; panels.buffPanel.style.verticalAlign = "bottom"; panels.buffPanel.style.marginTop = "0px"; panels.buffPanel.style.marginBottom = bo + "px"; panels.buffPanel.style.marginLeft = ((!re || rbe) ? 0 : (-sso)) + "px"; }
                if (panels.rejuvPanel) { panels.rejuvPanel.style.ignoreParentFlow = "true"; if (rbe) { panels.rejuvPanel.style.verticalAlign = "center"; panels.rejuvPanel.style.marginLeft = "0px"; panels.rejuvPanel.style.marginTop = "0px"; panels.rejuvPanel.style.marginBottom = "0px"; } else { panels.rejuvPanel.style.verticalAlign = "bottom"; panels.rejuvPanel.style.marginTop = "0px"; panels.rejuvPanel.style.marginBottom = bo + "px"; panels.rejuvPanel.style.marginLeft = ((be && !bbe) || bbe ? sso : 0) + "px"; } }
                if (ri) { if (ri.SetHasClass) ri.SetHasClass("qol-hidden", rbe); else ri.style.visibility = rbe ? "collapse" : "visible"; }
                if (be && panels.buffBridgeLeftTime && panels.buffBridgeLeftTime.text !== bridgeText) panels.buffBridgeLeftTime.text = bridgeText;
                if (be && panels.buffBridgeRightTime && panels.buffBridgeRightTime.text !== bridgeText) panels.buffBridgeRightTime.text = bridgeText;
                if (re && panels.rejuvTime && panels.rejuvTime.text !== rejuvText) panels.rejuvTime.text = rejuvText;
                if (panels.buffBridgeLeftPanel) { SetPanelClassCached(panels.buffBridgeLeftPanel, State.minimapObjectiveBuffBridgeLeftClassCache, "yellow", by); SetPanelClassCached(panels.buffBridgeLeftPanel, State.minimapObjectiveBuffBridgeLeftClassCache, "red", br); }
                if (panels.buffBridgeRightPanel) { SetPanelClassCached(panels.buffBridgeRightPanel, State.minimapObjectiveBuffBridgeRightClassCache, "yellow", by); SetPanelClassCached(panels.buffBridgeRightPanel, State.minimapObjectiveBuffBridgeRightClassCache, "red", br); }
                if (panels.buffPanel) { SetPanelClassCached(panels.buffPanel, State.minimapObjectiveBuffClassCache, "yellow", false); SetPanelClassCached(panels.buffPanel, State.minimapObjectiveBuffClassCache, "red", false); }
                if (panels.rejuvPanel) { SetPanelClassCached(panels.rejuvPanel, State.minimapObjectiveRejuvClassCache, "yellow", ry); SetPanelClassCached(panels.rejuvPanel, State.minimapObjectiveRejuvClassCache, "red", rr); }
            }

            function UpdateMinimapObjectiveTimers(root, cfg, bridgeText, remainingBridge, rejuvText, remainingRejuv, spawnWaiting) {
                var be = !!(cfg && IsCfgEnabled(cfg, "ENABLE_MINIMAP_BUFF_TIMER")), bbe = !!(be && cfg && IsCfgEnabled(cfg, "ENABLE_MINIMAP_BUFF_TIMER_ON_BRIDGE"));
                var re = !!(cfg && IsCfgEnabled(cfg, "ENABLE_MINIMAP_REJUV_TIMER")), rbe = !!(re && cfg && IsCfgEnabled(cfg, "ENABLE_MINIMAP_ALWAYS_ON_MID_BOSS"));
                if (!be && !re) { HideMinimapObjectiveTimers(root); return; }
                var panels = EnsureMinimapObjectiveTimers(root); if (!panels || !panels.root) return;
                var overlay = panels.root;
                if (overlay.SetHasClass) overlay.SetHasClass("qol-hidden", false); else if (overlay.style.visibility !== "visible") overlay.style.visibility = "visible";
                var ms = ResolveActiveMinimapObjectiveSize(root, cfg); if (!isFinite(ms)) ms = 400; if (ms < 200) ms = 200; if (ms > 1200) ms = 1200;
                var msc = ms / 400.0; if (!isFinite(msc)) msc = 1.0; if (msc < 0.5) msc = 0.5; if (msc > 2.5) msc = 2.5;
                var tw = Math.max(58, Math.round(72 * msc)), th = Math.max(22, Math.round(28 * msc)), tg = Math.max(24, Math.round(40 * msc)), tpx = Math.max(3, Math.round(5 * msc)), tr = Math.max(4, Math.round(5 * msc)), tf = Math.max(11, Math.round(14 * msc)), ti = Math.max(12, Math.round(16 * msc)), bo = Math.max(4, Math.round(ms * 0.10));
                var brr = Math.max(0, Math.floor(Number(remainingBridge) || 0)), rjr = Math.max(0, Math.floor(Number(remainingRejuv) || 0));
                var bufR = be && brr < 10 && (brr % 2) === 1, bufY = be && !bufR && brr < 20 && (brr % 2) === 1;
                var rwe = re && !spawnWaiting, rejR = re && (spawnWaiting || (rwe && rjr < 10 && (rjr % 2) === 1)), rejY = rwe && !rejR && rjr < 20 && (rjr % 2) === 1;
                var bi = GetCachedPanel("minimapObjectiveBuffIcon"), bli = GetCachedPanel("minimapObjectiveBuffBridgeLeftIcon"), bri = GetCachedPanel("minimapObjectiveBuffBridgeRightIcon"), ri = GetCachedPanel("minimapObjectiveRejuvIcon");
                var btw2 = Math.max(29, Math.round(tw * 0.5)), bth2 = Math.max(11, Math.round(th * 0.5)), btpx2 = Math.max(2, Math.round(tpx * 0.5)), btr2 = Math.max(2, Math.round(tr * 0.5)), btf2 = Math.max(8, Math.round(tf * 0.5)), bho2 = Math.round(ms * 0.35);
                if (!bbe && !rbe) { ApplyMinimapObjectiveTimersStandardMode(panels, overlay, {timerWidth:tw,timerHeight:th,timerGap:tg,timerPaddingX:tpx,timerRadius:tr,timerFont:tf,timerIcon:ti,bottomOffset:bo}, {buffEnabled:be,rejuvEnabled:re,buffRed:bufR,buffYellow:bufY,rejuvRed:rejR,rejuvYellow:rejY}, {buffIcon:bi,buffBridgeLeftIcon:bli,buffBridgeRightIcon:bri,rejuvIcon:ri}, bridgeText, rejuvText); return; }
                ApplyMinimapObjectiveTimersBridgeMode(panels, overlay, {timerWidth:tw,timerHeight:th,timerGap:tg,timerPaddingX:tpx,timerRadius:tr,timerFont:tf,timerIcon:ti,bottomOffset:bo}, {minimapSize:ms,bridgeTimerWidth:btw2,bridgeTimerHeight:bth2,bridgeTimerPaddingX:btpx2,bridgeTimerRadius:btr2,bridgeTimerFont:btf2,bridgeHorizontalOffset:bho2}, {buffEnabled:be,buffOnBridgeEnabled:bbe,rejuvEnabled:re,rejuvOnBridgeEnabled:rbe,buffRed:bufR,buffYellow:bufY,rejuvRed:rejR,rejuvYellow:rejY}, {buffIcon:bi,buffBridgeLeftIcon:bli,buffBridgeRightIcon:bri,rejuvIcon:ri}, bridgeText, rejuvText);
            }

            // ── Main tick ──
            function _tick() {
                var root = _root || $.GetContextPanel(); if (root && !_root) _root = root;
                // Hideout check (shared isConnectedToHideout — checks "connectedToHideout"
                // and "InHideout" on both Hud and root panels, consistent with all features)
                var inHideout = false;
                try { inHideout = isConnectedToHideout(root); } catch(e) {}
                if (inHideout) { HideMinimapObjectiveTimers(root); return; }
                // Street brawl check — suppress minimap timers during practice mode
                // (matches old monolithic rejuvTimers behavior)
                var inStreetBrawl = false;
                try { inStreetBrawl = IsStreetBrawlModeActive(root); } catch(e) {}
                if (inStreetBrawl) { HideMinimapObjectiveTimers(root); return; }
                var cfg = ctx.config.view();
                var buffEnabled = !!(cfg && IsCfgEnabled(cfg, "ENABLE_MINIMAP_BUFF_TIMER"));
                var rejuvEnabled = !!(cfg && IsCfgEnabled(cfg, "ENABLE_MINIMAP_REJUV_TIMER"));
                if (!buffEnabled && !rejuvEnabled) { HideMinimapObjectiveTimers(root); return; }

                var nowSec = GetGameSecondsForUrn(root);
                var remainingBridge = BRIDGE_DURATION_SEC - (nowSec % BRIDGE_DURATION_SEC);
                var bridgeText = FormatClockMmSs(remainingBridge);

                // Read rejuv state from ql_rejuv_hud's State.rejuvState
                var rs = State.rejuvState;
                var spawnWaiting = !!(rs && rs.spawnWaiting);
                var rejuvCounter = rs ? (rs.counter || 0) : 0;
                var rejuvText = spawnWaiting ? "Spawn" : FormatClockMmSs(rejuvCounter);
                var rejuvRemain = spawnWaiting ? 0 : rejuvCounter;

                UpdateMinimapObjectiveTimers(root, cfg, bridgeText, remainingBridge, rejuvText, rejuvRemain, spawnWaiting);
            }

            return {
                onEnable: function() {
                    var S = QOL.core.Scheduler;
                    _loop = S && S.createPollLoop ? S.createPollLoop(_tick, 0.3, "ql_minimap_timers") : null;
                },
                onDisable: function() {
                    if (_loop) { _loop.stop(); _loop = null; }
                    var S = QOL.core.Scheduler; if (S) S.cancelAllForFeature("ql_minimap_timers");
                    var root = _root || $.GetContextPanel();
                    try { HideMinimapObjectiveTimers(root); } catch(e) {}
                    SetCachedPanel("minimapObjectiveTimersRoot", null); SetCachedPanel("minimapObjectiveBuffPanel", null); SetCachedPanel("minimapObjectiveBuffTime", null); SetCachedPanel("minimapObjectiveBuffIcon", null);
                    SetCachedPanel("minimapObjectiveBuffBridgeLeftPanel", null); SetCachedPanel("minimapObjectiveBuffBridgeLeftTime", null); SetCachedPanel("minimapObjectiveBuffBridgeLeftIcon", null);
                    SetCachedPanel("minimapObjectiveBuffBridgeRightPanel", null); SetCachedPanel("minimapObjectiveBuffBridgeRightTime", null); SetCachedPanel("minimapObjectiveBuffBridgeRightIcon", null);
                    SetCachedPanel("minimapObjectiveRejuvPanel", null); SetCachedPanel("minimapObjectiveRejuvTime", null); SetCachedPanel("minimapObjectiveRejuvIcon", null);
                    _root = null;
                },
                onSettingsChanged: function() {}
            };
        },
        test: function(ctx) {
            try {
                var root = $.GetContextPanel();
                var minimap = root ? root.FindChildTraverse("hud_minimap") : null;
                // minimap_overlay_root and QOLMinimapTimersRoot are created lazily
                // by the feature's tick, so they may not exist at test time.
                // The feature test verifies the base minimap panel exists.
                return {
                    passed: !!minimap,
                    name: "Minimap panel exists",
                    message: minimap ? "" : "hud_minimap not found in HUD tree",
                    assertions: [
                        { passed: !!minimap, name: "hud_minimap exists" }
                    ]
                };
            } catch(e) { return { passed: false, name: "Minimap panel check", message: (e && e.message ? e.message : String(e)) }; }
        }
    });
})();

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
        // Multi-key: the bridge buff timer and the mid-boss timer are independent
        // toggles, either of which must boot this feature. Gating on the rejuv key
        // alone left ENABLE_MINIMAP_BUFF_TIMER dead unless the mid-boss timer
        // happened to be on too (regression from the ql_rejuv_timers split).
        enableKeys: ["ENABLE_MINIMAP_REJUV_TIMER", "ENABLE_MINIMAP_BUFF_TIMER"],
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
            var Panel = (QOL.core && QOL.core.panel) ? QOL.core.panel : {};
            var State = QOL.state || (typeof globalThis !== "undefined" && globalThis.State) || {};
            var Utils = (typeof QOL_UTILS !== "undefined" ? QOL_UTILS : (QOL.utils || {}));
            var IsCfgEnabled = Utils.IsCfgEnabled || function(cfg, key) {
                var v = (typeof key !== "undefined" && cfg && typeof cfg === "object") ? cfg[key] : cfg;
                return !!v && v !== "false" && v !== "0" && v !== 0;
            };
            var IsPanelValid = Panel.isAlive || (Utils.IsPanelValid || function(p) { return p != null && typeof p.IsValid === "function" && p.IsValid(); });
            var GetCachedPanel = QOL.getCachedPanel || function(k) { return State.cachedPanels ? State.cachedPanels[k] : null; };
            var SetCachedPanel = QOL.setCachedPanel || function(k, p) { if (State.cachedPanels) State.cachedPanels[k] = p; };
            var ResolveCachedPanel = QOL.resolveCachedPanel || function(r, k, id) { return GetCachedPanel(k) || (r && r.FindChildTraverse ? r.FindChildTraverse(id) : null); };
            var SetPanelClassCached = QOL.setPanelClassCached || function(p, c, cls, val) { if (p && p.SetHasClass) p.SetHasClass(cls, !!val); };
            var IsHudClassActive = function(r, cls) { return (QOL.core && QOL.core.hud && QOL.core.hud.isClassActive) ? QOL.core.hud.isClassActive(cls) : (QOL.isHudClassActive ? QOL.isHudClassActive(r, cls) : false); };
            var hasClassInHierarchy = QOL.hasClassInHierarchy || function(p, cls) { return !!(p && p.BHasClass && p.BHasClass(cls)); };
            var EnsureMinimapOverlayAnchor = function(root) {
                if (typeof QOL.ensureMinimapOverlayAnchor === "function") {
                    var a = QOL.ensureMinimapOverlayAnchor(root);
                    if (a) return a;
                }
                if (!root || !root.FindChildTraverse) return null;
                return root.FindChildTraverse("minimap_container") || root.FindChildTraverse("minimap_persp") || null;
            };
            var GetGameSecondsForUrn = function() { return QOL.getGameSecondsForUrn ? QOL.getGameSecondsForUrn() : 0; };
            var IsStreetBrawlModeActive = function(r) { return QOL.isStreetBrawlModeActive ? QOL.isStreetBrawlModeActive(r) : false; };
            var isConnectedToHideout = function(r) { return (QOL.core && QOL.core.hud && QOL.core.hud.isClassActive) ? (QOL.core.hud.isClassActive("connectedToHideout") || QOL.core.hud.isClassActive("InHideout")) : (QOL.isConnectedToHideout ? QOL.isConnectedToHideout(r) : false); };
            var BRIDGE_DURATION_SEC = 300;

            var POWERUP_BUFF_CLASSES = [
                "powerup_gun",
                "powerup_survival",
                "powerup_casting",
                "powerup_movement"
            ];

            function GetPowerupBridgeSide(panel) {
                if (!IsPanelValid(panel)) return null;
                var posText = "";
                try {
                    if (panel.style && typeof panel.style.position === "string") {
                        posText = panel.style.position;
                    }
                } catch(e) {}
                if (!posText && panel.GetAttributeString) {
                    try { posText = panel.GetAttributeString("style", ""); } catch(e) {}
                }
                if (posText) {
                    var match = posText.match(/([+\-]?\d+(?:\.\d+)?)%/);
                    if (match && match[1]) {
                        var xPct = parseFloat(match[1]);
                        if (isFinite(xPct)) return xPct < 50 ? "left" : "right";
                    }
                }
                try {
                    var ox = panel.actualxoffset;
                    if (typeof ox === "number" && isFinite(ox)) {
                        var parent = panel.GetParent ? panel.GetParent() : null;
                        var pw = parent && typeof parent.actuallayoutwidth === "number" ? parent.actuallayoutwidth : 0;
                        if (pw > 0) return ox < (pw / 2) ? "left" : "right";
                        if (ox > 0) return ox < 200 ? "left" : "right";
                    }
                } catch(e) {}
                return null;
            }

            function DetectActiveBridgeBuffs(root, anchor) {
                var result = { left: false, right: false };
                var searchRoot = (root && root.FindChildTraverse) ? (root.FindChildTraverse("HudMinimap") || root.FindChildTraverse("hud_minimap") || anchor || root) : (anchor || root);
                if (!IsPanelValid(searchRoot)) return result;

                var spawners = searchRoot.FindChildrenWithClassTraverse ? searchRoot.FindChildrenWithClassTraverse("powerup_spawn") : null;
                if (!spawners || spawners.length === 0) return result;

                for (var i = 0; i < spawners.length; i++) {
                    var p = spawners[i];
                    if (!IsPanelValid(p)) continue;

                    var isSpawned = false;
                    for (var c = 0; c < POWERUP_BUFF_CLASSES.length; c++) {
                        if (p.BHasClass && p.BHasClass(POWERUP_BUFF_CLASSES[c])) {
                            isSpawned = true;
                            break;
                        }
                    }
                    if (!isSpawned && p.BHasClass && p.BHasClass("powerup_spawn") && p.BHasClass("active")) {
                        isSpawned = true;
                    }
                    if (!isSpawned) continue;

                    var side = GetPowerupBridgeSide(p);
                    if (!side && spawners.length >= 2) {
                        var x0 = Number(spawners[0].actualxoffset) || 0;
                        var x1 = Number(spawners[1].actualxoffset) || 0;
                        if (p === spawners[0]) {
                            side = x0 <= x1 ? "left" : "right";
                        } else {
                            side = x1 > x0 ? "right" : "left";
                        }
                    }

                    if (side === "left") result.left = true;
                    else if (side === "right") result.right = true;
                }
                return result;
            }

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
                if (overlay.style.marginLeft !== "0px") overlay.style.marginLeft = "0px";
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

            function ApplyMinimapObjectiveTimersBridgeMode(panels, overlay, dims, bd, flags, icons, bridgeText, rejuvText, activeBuffs) {
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
                var leftHidden = !bbe || !!(activeBuffs && activeBuffs.left);
                var rightHidden = !bbe || !!(activeBuffs && activeBuffs.right);
                if (panels.buffBridgeLeftPanel) {
                    if (panels.buffBridgeLeftPanel.SetHasClass) {
                        panels.buffBridgeLeftPanel.SetHasClass("qol-hidden", leftHidden);
                        panels.buffBridgeLeftPanel.SetHasClass("buff_spawned", !!(activeBuffs && activeBuffs.left));
                    } else if (panels.buffBridgeLeftPanel.style.visibility !== (leftHidden ? "collapse" : "visible")) {
                        panels.buffBridgeLeftPanel.style.visibility = leftHidden ? "collapse" : "visible";
                    }
                }
                if (panels.buffBridgeRightPanel) {
                    if (panels.buffBridgeRightPanel.SetHasClass) {
                        panels.buffBridgeRightPanel.SetHasClass("qol-hidden", rightHidden);
                        panels.buffBridgeRightPanel.SetHasClass("buff_spawned", !!(activeBuffs && activeBuffs.right));
                    } else if (panels.buffBridgeRightPanel.style.visibility !== (rightHidden ? "collapse" : "visible")) {
                        panels.buffBridgeRightPanel.style.visibility = rightHidden ? "collapse" : "visible";
                    }
                }
                if (panels.rejuvPanel) { if (panels.rejuvPanel.SetHasClass) panels.rejuvPanel.SetHasClass("qol-hidden", !re); else if (panels.rejuvPanel.style.visibility !== (re ? "visible" : "collapse")) panels.rejuvPanel.style.visibility = re ? "visible" : "collapse"; }
                if (panels.buffPanel && sbbp) { panels.buffPanel.style.ignoreParentFlow = "true"; panels.buffPanel.style.verticalAlign = "bottom"; panels.buffPanel.style.marginTop = "0px"; panels.buffPanel.style.marginBottom = bo + "px"; panels.buffPanel.style.marginLeft = ((!re || rbe) ? 0 : (-sso)) + "px"; }
                if (panels.rejuvPanel) { panels.rejuvPanel.style.ignoreParentFlow = "true"; if (rbe) { panels.rejuvPanel.style.verticalAlign = "center"; panels.rejuvPanel.style.marginLeft = "0px"; panels.rejuvPanel.style.marginTop = "0px"; panels.rejuvPanel.style.marginBottom = "0px"; } else { panels.rejuvPanel.style.verticalAlign = "bottom"; panels.rejuvPanel.style.marginTop = "0px"; panels.rejuvPanel.style.marginBottom = bo + "px"; panels.rejuvPanel.style.marginLeft = ((be && !bbe) || bbe ? sso : 0) + "px"; } }
                if (ri) { if (ri.SetHasClass) ri.SetHasClass("qol-hidden", rbe); else ri.style.visibility = rbe ? "collapse" : "visible"; }
                if (be && panels.buffBridgeLeftTime && panels.buffBridgeLeftTime.text !== bridgeText) panels.buffBridgeLeftTime.text = bridgeText;
                if (be && panels.buffBridgeRightTime && panels.buffBridgeRightTime.text !== bridgeText) panels.buffBridgeRightTime.text = bridgeText;
                // The centre plate is on screen whenever sbbp, which happens in bridge
                // mode when the buff timer is on but "On Bridge" is off (the mid-boss
                // timer is what put us in bridge mode). Without this write its label
                // keeps whatever standard mode last set — a clock frozen mid-countdown.
                if (sbbp && panels.buffTime && panels.buffTime.text !== bridgeText) panels.buffTime.text = bridgeText;
                if (re && panels.rejuvTime && panels.rejuvTime.text !== rejuvText) panels.rejuvTime.text = rejuvText;
                if (panels.buffBridgeLeftPanel) {
                    SetPanelClassCached(panels.buffBridgeLeftPanel, State.minimapObjectiveBuffBridgeLeftClassCache, "yellow", !leftHidden && by);
                    SetPanelClassCached(panels.buffBridgeLeftPanel, State.minimapObjectiveBuffBridgeLeftClassCache, "red", !leftHidden && br);
                }
                if (panels.buffBridgeRightPanel) {
                    SetPanelClassCached(panels.buffBridgeRightPanel, State.minimapObjectiveBuffBridgeRightClassCache, "yellow", !rightHidden && by);
                    SetPanelClassCached(panels.buffBridgeRightPanel, State.minimapObjectiveBuffBridgeRightClassCache, "red", !rightHidden && br);
                }
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
                var ms = 400;
                var tw = 72, th = 28, tg = 6, tpx = 5, tr = 5, tf = 14, ti = 16, bo = 8;
                var brr = Math.max(0, Math.floor(Number(remainingBridge) || 0)), rjr = Math.max(0, Math.floor(Number(remainingRejuv) || 0));
                var bufR = be && brr < 10 && (brr % 2) === 1, bufY = be && !bufR && brr < 20 && (brr % 2) === 1;
                var rwe = re && !spawnWaiting, rejR = re && (spawnWaiting || (rwe && rjr < 10 && (rjr % 2) === 1)), rejY = rwe && !rejR && rjr < 20 && (rjr % 2) === 1;
                var bi = GetCachedPanel("minimapObjectiveBuffIcon"), bli = GetCachedPanel("minimapObjectiveBuffBridgeLeftIcon"), bri = GetCachedPanel("minimapObjectiveBuffBridgeRightIcon"), ri = GetCachedPanel("minimapObjectiveRejuvIcon");
                var btw = 48, bth = 18, btpx = 3, btr = 4, btf = 11, bho = 144;
                var activeBuffs = DetectActiveBridgeBuffs(root, EnsureMinimapOverlayAnchor(root));
                if (!bbe && !rbe) { ApplyMinimapObjectiveTimersStandardMode(panels, overlay, {timerWidth:tw,timerHeight:th,timerGap:tg,timerPaddingX:tpx,timerRadius:tr,timerFont:tf,timerIcon:ti,bottomOffset:bo}, {buffEnabled:be,rejuvEnabled:re,buffRed:bufR,buffYellow:bufY,rejuvRed:rejR,rejuvYellow:rejY}, {buffIcon:bi,buffBridgeLeftIcon:bli,buffBridgeRightIcon:bri,rejuvIcon:ri}, bridgeText, rejuvText); return; }
                ApplyMinimapObjectiveTimersBridgeMode(panels, overlay, {timerWidth:tw,timerHeight:th,timerGap:tg,timerPaddingX:tpx,timerRadius:tr,timerFont:tf,timerIcon:ti,bottomOffset:bo}, {minimapSize:ms,bridgeTimerWidth:btw,bridgeTimerHeight:bth,bridgeTimerPaddingX:btpx,bridgeTimerRadius:btr,bridgeTimerFont:btf,bridgeHorizontalOffset:bho}, {buffEnabled:be,buffOnBridgeEnabled:bbe,rejuvEnabled:re,rejuvOnBridgeEnabled:rbe,buffRed:bufR,buffYellow:bufY,rejuvRed:rejR,rejuvYellow:rejY}, {buffIcon:bi,buffBridgeLeftIcon:bli,buffBridgeRightIcon:bri,rejuvIcon:ri}, bridgeText, rejuvText, activeBuffs);
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

// features/ql_rejuv_hud/manifest.js
// =============================================================================
// QOLLOCK — Rejuv HUD (rejuvenator + bridge buff timers on the HUD)
// =============================================================================
// OWNS:        Rejuv phase tracking, mid-boss detection, charge tracking,
//              rejuv capture buff, bridge buff HUD countdown
// DOES NOT OWN: Minimap overlays (see ql_minimap_timers), mid-boss game object,
//              top-bar panels, rejuv charges
// DEPENDS ON:  QOL.core.FeatureRegistry, QOL.core.Scheduler
// CONFIG KEYS: ENABLE_REJUV_HUD, ENABLE_BUFF_HUD, ENABLE_MINIMAP_REJUV_TIMER
//              (the last one is read-only here: it boots the phase tracker so
//              ql_minimap_timers has a live State.rejuvState to render)
// CSS:         none
// PATTERN:     Polling (0.3Hz). Self-scheduling via Scheduler.
// SPLIT FROM:  ql_rejuv_timers — minimap code extracted to ql_minimap_timers
// =============================================================================

(function() {
    "use strict";

    var FR = QOL.core.FeatureRegistry;
    if (!FR) { $.Msg("[QOLLock] ql_rejuv_hud: FeatureRegistry not found — aborting"); return; }

    FR.register({
        id: "ql_rejuv_hud",
        // Multi-key. Own HUD toggles are ENABLE_REJUV_HUD / ENABLE_BUFF_HUD.
        // ENABLE_MINIMAP_REJUV_TIMER is included because this feature is the sole
        // writer of State.rejuvState, which ql_minimap_timers reads for the mid-boss
        // countdown — without it that timer sits frozen at 00:00. Panel visibility is
        // driven by the buff_hud_disabled / rejuv_hud_disabled root classes applied by
        // coreRoot, so running the tracker for the minimap consumer does not reveal
        // the HUD panels. Matches the pre-split ql_rejuv_timers gate.
        // ENABLE_MINIMAP_BUFF_TIMER is deliberately absent: the bridge buff countdown
        // is derived from game time inside ql_minimap_timers and needs nothing here.
        enableKeys: ["ENABLE_REJUV_HUD", "ENABLE_BUFF_HUD", "ENABLE_MINIMAP_REJUV_TIMER"],
        enabledByDefault: false,
        settings: [
            { key: "ENABLE_REJUV_HUD", type: "toggle", default: false },
            { key: "ENABLE_BUFF_HUD", type: "toggle", default: false },
            // Declared so ConfigStore.load() lets the key into this bucket
            // (load() drops keys absent from the schema) and ctx.config.view()
            // can see it in the tick below.
            { key: "ENABLE_MINIMAP_REJUV_TIMER", type: "toggle", default: false }
        ],
        create: function(ctx) {
            var Panel = (QOL.core && QOL.core.panel) ? QOL.core.panel : {};
            var State = QOL.state || (typeof globalThis !== "undefined" && globalThis.State) || {};
            var Utils = QOL.utils;
            var IsCfgEnabled = QOL.utils.IsCfgEnabled;
            var IsPanelValid = QOL.utils.IsPanelValid;
            var SetPanelOpacitySafe = QOL.utils.SetPanelOpacitySafe;
            var SetPanelClassIfChanged = QOL.setPanelClassIfChanged || function(p, cls, val) { if (p && p.SetHasClass) p.SetHasClass(cls, !!val); };
            var IsStreetBrawlModeActive = function(r) { return QOL.isStreetBrawlModeActive ? QOL.isStreetBrawlModeActive(r) : false; };
            var GetGameSecondsForUrn = function() { return QOL.getGameSecondsForUrn ? QOL.getGameSecondsForUrn() : 0; };
            var PANEL_ID_TOP_BAR = QOL.panelIdTopBar || "TopBar";
            var GetHighestRejuvChargeTokenOnPanel = function(p) { return QOL.getHighestRejuvChargeTokenOnPanel ? QOL.getHighestRejuvChargeTokenOnPanel(p) : 0; };
            var isConnectedToHideout = QOL.core.hud.isInHideout;
            var PanelHasClassToken = Panel.hasClassToken || QOL.panelHasClassToken || function(p, c) { return !!(p && p.BHasClass && p.BHasClass(c)); };

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

            var FormatClockMmSs = QOL.core.time.formatSeconds;

            function EnsureRejuvState() {
                if (State.rejuvState) return State.rejuvState;
                State.rejuvState = { running: false, wasInHideout: false, idx: 0, counter: 0, phaseStart: 0, claimCount: 0, spawnWaiting: false, lastScanFound: false, lastRejuvChargeCount: 0, lastMidBossActive: false, buffStartTime: 0, buffCounter: 0, lastBuffGameSec: -BUFF_LOCKOUT_SEC, lastSec: -1, lastGlobalSec: -1, lastRuntimeSec: -1, lastRuntimeFeatureSig: "", nextScanMs: 0, rotatingUntilMs: 0, rejuvBuffHideAtMs: 0, lastChargesLookupMs: 0, lastChargeCountReadMs: 0, lastChargeCountValue: 0, nextMidBossLookupMs: 0, cacheTopBar: null, cacheCharges: null, cacheFriendly: null, cacheEnemy: null, cacheRejuvTimer: null, cacheMidBossButton: null, panels: {} };
                return State.rejuvState;
            }

            function GetRejuvPanel(state, root, key, id) {
                var panel = IsPanelValid(state.panels[key]) ? state.panels[key] : null;
                if (!panel) {
                    var now = Date.now ? Date.now() : (new Date()).getTime();
                    var nextSearch = (state._nextPanelSearch && state._nextPanelSearch[key]) || 0;
                    if (now < nextSearch) return null;
                    panel = root ? root.FindChildTraverse(id) : null;
                    if (panel && IsPanelValid(panel)) {
                        state.panels[key] = panel;
                    } else {
                        state.panels[key] = null;
                        if (!state._nextPanelSearch) state._nextPanelSearch = {};
                        state._nextPanelSearch[key] = now + 2500;
                    }
                }
                return panel;
            }

            function RejuvResetImage(state, root) { var imgs = [GetRejuvPanel(state,root,"rImg","RejuvImg"), GetRejuvPanel(state,root,"rImgHUD","RejuvImgHUD")]; for (var i = 0; i < imgs.length; i++) { var img = imgs[i]; if (!img) continue; img.RemoveClass("rotating"); img.RemoveClass("buff"); img.RemoveClass("reverse"); img.RemoveClass("white"); } }

            function RejuvSetPhaseImage(state, root, name, nowMs) { RejuvResetImage(state, root); var imgs = [GetRejuvPanel(state,root,"rImg","RejuvImg"), GetRejuvPanel(state,root,"rImgHUD","RejuvImgHUD")]; var addBuff = String(name).toLowerCase().endsWith("buff"), addReverse = String(name).toLowerCase().endsWith("cd"); for (var i = 0; i < imgs.length; i++) { var img = imgs[i]; if (!img) continue; if (addBuff) img.AddClass("buff"); if (addReverse) img.AddClass("reverse"); if (addBuff || addReverse) img.AddClass("rotating"); } if (addBuff || addReverse) state.rotatingUntilMs = nowMs + REJUV_ROTATE_ANIM_MS; }

            function RejuvSetLabels(state, root, timeText, numText) { var rLab = GetRejuvPanel(state,root,"rLab","RejuvTime"), rLabHUD = GetRejuvPanel(state,root,"rLabHUD","RejuvTimeHUD"), rNum = GetRejuvPanel(state,root,"rNum","RejuvNum"), rNumHUD = GetRejuvPanel(state,root,"rNumHUD","RejuvNumHUD"); if (rLab && rLab.text !== timeText) rLab.text = timeText; if (rLabHUD && rLabHUD.text !== timeText) rLabHUD.text = timeText; if (rNum && rNum.text !== numText) rNum.text = numText; if (rNumHUD && rNumHUD.text !== numText) rNumHUD.text = numText; }

            function ApplyRedYellowPanelClasses(panel, red, yellow) { if (!panel) return; var showRed = !!red, showYellow = !showRed && !!yellow; SetPanelClassIfChanged(panel, "red", showRed); SetPanelClassIfChanged(panel, "yellow", showYellow); }

            function RejuvShowSpawn(state, root) { RejuvSetLabels(state, root, "Spawn", REJUV_SEQ[state.idx].num); RejuvResetImage(state, root); var _rI = GetRejuvPanel(state,root,"rImg","RejuvImg"), _rIH = GetRejuvPanel(state,root,"rImgHUD","RejuvImgHUD"); if (_rI) _rI.AddClass("white"); if (_rIH) _rIH.AddClass("white"); ApplyRedYellowPanelClasses(GetRejuvPanel(state,root,"rejuvHUD","RejuvHUD"), true, false); state.spawnWaiting = true; state.lastScanFound = false; }

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
                state.running = false; state.idx = 0; state.counter = 0; state.phaseStart = 0; state.claimCount = 0; state.spawnWaiting = false; state.lastScanFound = false; state.lastRejuvChargeCount = 0; state.lastMidBossActive = false; state.lastBuffGameSec = -BUFF_LOCKOUT_SEC; state.lastSec = -1; state.lastGlobalSec = -1; state.lastRuntimeSec = -1; state.lastRuntimeFeatureSig = ""; state._cachedRuntimeFeatureSig = ""; state._cachedConfigRef = null; state.nextScanMs = nowMs + RejuvGetScanIntervalMs(state); state.rotatingUntilMs = 0; state.rejuvBuffHideAtMs = 0; state.lastChargesLookupMs = 0; state.lastChargeCountReadMs = 0; state.lastChargeCountValue = 0; state.nextMidBossLookupMs = 0; state._lastMidBossSpawned = undefined; state._lastHadRejuvPerTick = false; state.cacheTopBar = null; state.cacheCharges = null; state.cacheFriendly = null; state.cacheEnemy = null; state.cacheRejuvTimer = null; state.cacheMidBossButton = null;
                if (Number(REJUV_SEQ[0].dur) <= 0) { RejuvShowSpawn(state, root); } else { RejuvSetLabels(state, root, FormatClockMmSs(REJUV_SEQ[0].dur), REJUV_SEQ[0].num); RejuvResetImage(state, root); }
                RejuvEndBuff(state, root, nowMs, true);
            }

            // ── Main tick ──
            function _tick() {
                var root = _root || $.GetContextPanel(); if (root && !_root) _root = root;
                var cfg = ctx.config.view();
                var nowMs = Date.now ? Date.now() : (new Date()).getTime();

                var rejuvHudEnabled = !!(cfg && IsCfgEnabled(cfg, "ENABLE_REJUV_HUD"));
                var buffHudEnabled = !!(cfg && IsCfgEnabled(cfg, "ENABLE_BUFF_HUD"));
                // The minimap mid-boss timer consumes State.rejuvState, so keep the
                // phase tracker running for it even when both HUD toggles are off.
                var minimapRejuvEnabled = !!(cfg && IsCfgEnabled(cfg, "ENABLE_MINIMAP_REJUV_TIMER"));
                if (!rejuvHudEnabled && !buffHudEnabled && !minimapRejuvEnabled) {
                    if (!State.rejuvWasDisabled) { var ds = EnsureRejuvState(); RejuvResetState(ds, root, nowMs); State.rejuvWasDisabled = true; }
                    return;
                }
                if (IsStreetBrawlModeActive(root)) {
                    if (!State.rejuvWasDisabled) { var ss = EnsureRejuvState(); RejuvResetState(ss, root, nowMs); State.rejuvWasDisabled = true; }
                    return;
                }
                State.rejuvWasDisabled = false;
                var state = EnsureRejuvState();
                var nowSec = GetGameSecondsForUrn(root);
                if (state.lastGlobalSec >= 0 && (nowSec + 5 < state.lastGlobalSec || (state.lastGlobalSec > 30 && nowSec <= 2))) { RejuvResetState(state, root, nowMs); }
                if (!state.running) { state.running = true; state.claimCount = 0; state.lastScanFound = false; state.spawnWaiting = false; RejuvStartPhaseAuto(state, root, nowSec, nowMs); state.lastSec = nowSec; state.lastGlobalSec = nowSec; state.lastRejuvChargeCount = RejuvGetChargeCount(state, root, nowMs); state.lastMidBossActive = RejuvIsMidBossSpawned(state, root, nowMs); state.nextScanMs = nowMs + RejuvGetScanIntervalMs(state); } else { state.lastGlobalSec = nowSec; }

                // Config change signature
                if (State.lastConfig !== state._cachedConfigRef) {
                    state._cachedRuntimeFeatureSig = [rejuvHudEnabled?"1":"0",buffHudEnabled?"1":"0",minimapRejuvEnabled?"1":"0"].join("|");
                    state._cachedConfigRef = State.lastConfig;
                }

                // Per-tick cheap change detection
                var midBossBtn = IsPanelValid(state.cacheMidBossButton) ? state.cacheMidBossButton : null;
                if (midBossBtn) { var mbs = !!(midBossBtn.BHasClass && midBossBtn.BHasClass("midboss_spawned")); if (mbs !== state._lastMidBossSpawned) { state._lastMidBossSpawned = mbs; state.nextScanMs = 0; } }
                var _rjv = IsPanelValid(state.cacheRejuvTimer) ? state.cacheRejuvTimer : null;
                if (_rjv && _rjv.BHasClass) { var _hrn = _rjv.BHasClass("has_rejuv"); if (_hrn && !state._lastHadRejuvPerTick) { if (nowSec >= (state.lastBuffGameSec||0) + BUFF_LOCKOUT_SEC) { state.lastBuffGameSec = nowSec; RejuvStartBuff(state, root, nowSec, true); } } state._lastHadRejuvPerTick = _hrn; }

                // Fast-path early-exit
                if (state.lastRuntimeSec === nowSec && state.lastRuntimeFeatureSig === state._cachedRuntimeFeatureSig && nowMs < (state.nextScanMs||0) && (state.rotatingUntilMs <= 0 || nowMs < state.rotatingUntilMs) && (state.rejuvBuffHideAtMs <= 0 || nowMs < state.rejuvBuffHideAtMs) && state.buffStartTime <= 0) return;

                // Changed tick — hideout check (uses shared isConnectedToHideout which checks
                // "connectedToHideout" class in addition to "InHideout" on both Hud + root panels)
                var hideout = false;
                try { hideout = isConnectedToHideout(root); } catch(e) {}
                if (hideout) { if (!state.wasInHideout || state.running || state.buffStartTime > 0) RejuvResetState(state, root, nowMs); state.wasInHideout = true; return; }
                if (state.wasInHideout) { state.wasInHideout = false; state.nextScanMs = nowMs; }

                if (state.rotatingUntilMs > 0 && nowMs >= state.rotatingUntilMs) { state.rotatingUntilMs = 0; var _riA = GetRejuvPanel(state,root,"rImg","RejuvImg"), _riHA = GetRejuvPanel(state,root,"rImgHUD","RejuvImgHUD"); if (_riA) _riA.RemoveClass("rotating"); if (_riHA) _riHA.RemoveClass("rotating"); }
                if (state.rejuvBuffHideAtMs > 0 && nowMs >= state.rejuvBuffHideAtMs) { state.rejuvBuffHideAtMs = 0; var _rbHide = GetRejuvPanel(state,root,"rejuvBuff","RejuvBuff"); if (_rbHide) SetPanelOpacitySafe(_rbHide, 0, 0); }

                if (nowSec !== state.lastSec) {
                    state.lastSec = nowSec; var dur = REJUV_SEQ[state.idx].dur; var remaining = Math.max(0, dur - (nowSec - state.phaseStart));
                    if (remaining <= 0) { RejuvShowSpawn(state, root); } else { state.counter = remaining; RejuvSetLabels(state, root, FormatClockMmSs(remaining), REJUV_SEQ[state.idx].num); var _rjHUD = GetRejuvPanel(state,root,"rejuvHUD","RejuvHUD"); ApplyRedYellowPanelClasses(_rjHUD, remaining < 10 && (remaining%2)===1, remaining < 20 && (remaining%2)===1); }
                }

                if (state.buffStartTime > 0) { var elapsed = nowSec - state.buffStartTime; state.buffCounter = Math.max(0, REJUV_DURATION_SEC - elapsed); var _rbt = GetRejuvPanel(state,root,"rejuvBuffTime","RejuvTimeBuff"); var _btt = FormatClockMmSs(state.buffCounter); if (_rbt && _rbt.text !== _btt) _rbt.text = _btt; var _lcc = RejuvGetChargeCount(state, root, nowMs); if (_lcc <= 0 || state.buffCounter <= 0) RejuvEndBuff(state, root, nowMs, false); }

                // Bridge buff HUD
                var remainingBridge = BRIDGE_DURATION_SEC - (nowSec % BRIDGE_DURATION_SEC); var bridgeText = FormatClockMmSs(remainingBridge);
                var _bl = GetRejuvPanel(state,root,"buffLabel","BuffTime"), _blH = GetRejuvPanel(state,root,"buffLabelHUD","BuffTimeHUD");
                if (_bl && _bl.text !== bridgeText) _bl.text = bridgeText; if (_blH && _blH.text !== bridgeText) _blH.text = bridgeText;
                var _bH = GetRejuvPanel(state,root,"buffHUD","BuffHUD"); ApplyRedYellowPanelClasses(_bH, remainingBridge < 10 && (remainingBridge%2)===1, remainingBridge < 20 && (remainingBridge%2)===1);

                // Scan
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
                    _loop = S && S.createPollLoop ? S.createPollLoop(_tick, 0.3, "ql_rejuv_hud") : null;
                },
                onDisable: function() {
                    if (_loop) { _loop.stop(); _loop = null; }
                    var S = QOL.core.Scheduler; if (S) S.cancelAllForFeature("ql_rejuv_hud");
                    var root = _root || $.GetContextPanel();
                    try { if (State.rejuvState) { RejuvResetState(State.rejuvState, root, Date.now ? Date.now() : (new Date()).getTime()); } } catch(e) {}
                    State.rejuvWasDisabled = true;
                    _root = null;
                },
                onSettingsChanged: function() {
                    if (State && State.rejuvState) State.rejuvState.lastRuntimeFeatureSig = "";
                    _tick();
                }
            };
        },
        test: function(ctx) {
            try {
                var root = $.GetContextPanel();
                var topBar = root ? (root.FindChildTraverse("TopBar") || root.FindChildTraverse("CitadelHudTopBar")) : null;
                var rejuvHUD = root ? root.FindChildTraverse("RejuvHUD") : null;
                var rejuvImg = root ? root.FindChildTraverse("RejuvImg") : null;
                return {
                    passed: !!(topBar && rejuvHUD),
                    name: "Rejuv HUD panels exist",
                    message: [ !topBar ? "CitadelHudTopBar not found" : "", !rejuvHUD ? "RejuvHUD not found" : "" ].filter(function(s) { return s !== ""; }).join(", "),
                    assertions: [
                        { passed: !!topBar, name: "CitadelHudTopBar exists" },
                        { passed: !!rejuvHUD, name: "RejuvHUD exists" },
                        { passed: !!rejuvImg, name: "RejuvImg exists" }
                    ]
                };
            } catch(e) { return { passed: false, name: "Rejuv HUD panel check", message: (e && e.message ? e.message : String(e)) }; }
        }
    });
})();

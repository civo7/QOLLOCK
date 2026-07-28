// features/ql_legacy_audio_passive/manifest.js
// =============================================================================
// QOLLOCK — Legacy Audio Announcements + DL4D Reminders
// =============================================================================
// OWNS:        Announcer voice buff reminders (interval + one-time triggers),
//              DL4D game-event reminders with captions + audio
// DOES NOT OWN: Passive cooldown HUD styling (see ql_passive_cooldown),
//              game clock, announcer voice assets, game events
// DEPENDS ON:  QOL.core.FeatureRegistry, QOL.core.Scheduler
// CONFIG KEYS: ENABLE_LEGACY_COOLDOWNS, ENABLE_INTERVAL, ENABLE_ONE_TIME,
//              ENABLE_ONE_TIME_TIER1/2/3, ENABLE_MINIMAP_REMINDER,
//              ENABLE_BUFF_SOUND_1/2/3, VOICE_TYPE, VOICE_VOLUME,
//              BRIDGE_BUFF_START, ENABLE_DL4D_REMINDERS, ENABLE_DL4D_CAPTIONS,
//              DL4D_VOLUME, + 11 DL4D event toggles
// PATTERN:     Polling (0.5Hz). Reads game clock, triggers timed audio
//              announcements + DL4D captions.
// PORTED FROM: features/ql_feat_legacyaudiopassive.js (435 lines)
// =============================================================================

(function() {
    "use strict";
    var FR = QOL.core.FeatureRegistry;
    if (!FR) { $.Msg("[QOLLock] legacy_audio_passive: FeatureRegistry not found — aborting"); return; }

    FR.register({
        id: "ql_legacy_audio_passive",
        enabledByDefault: true,
        settings: [
            { key: "ENABLE_LEGACY_COOLDOWNS", type: "toggle", default: false },
            { key: "ENABLE_ONE_TIME", type: "toggle", default: false },
            { key: "ENABLE_ONE_TIME_TIER1", type: "toggle", default: false },
            { key: "ENABLE_ONE_TIME_TIER2", type: "toggle", default: false },
            { key: "ENABLE_ONE_TIME_TIER3", type: "toggle", default: false },
            { key: "ENABLE_INTERVAL", type: "toggle", default: false },
            { key: "ENABLE_MINIMAP_REMINDER", type: "toggle", default: false },
            { key: "ENABLE_BUFF_SOUND_1", type: "toggle", default: true },
            { key: "ENABLE_BUFF_SOUND_2", type: "toggle", default: true },
            { key: "ENABLE_BUFF_SOUND_3", type: "toggle", default: true },
            { key: "VOICE_TYPE", type: "dropdown", default: "0" },
            { key: "VOICE_VOLUME", type: "slider", min: 0, max: 100, step: 5, default: 70 },
            { key: "BRIDGE_BUFF_START", type: "slider", min: 0, max: 300, step: 5, default: 30 },
            { key: "ENABLE_DL4D_REMINDERS", type: "toggle", default: false },
            { key: "ENABLE_DL4D_CAPTIONS", type: "toggle", default: false },
            { key: "DL4D_VOLUME", type: "slider", min: 0, max: 100, step: 5, default: 70 },
            { key: "ENABLE_DL4D_SMALL_CAMPS_BOXES", type: "toggle", default: true },
            { key: "ENABLE_DL4D_RUNE_MELEE_TROOPERS", type: "toggle", default: true },
            { key: "ENABLE_DL4D_MEDIUM_CAMPS", type: "toggle", default: true },
            { key: "ENABLE_DL4D_BIG_CAMPS_SINNERS", type: "toggle", default: true },
            { key: "ENABLE_DL4D_MIDBOSS_URN_GOLD_RUNE", type: "toggle", default: true },
            { key: "ENABLE_DL4D_LANE_GUARDIAN_WEAK", type: "toggle", default: true },
            { key: "ENABLE_DL4D_RUNE", type: "toggle", default: true },
            { key: "ENABLE_DL4D_WALKER_WEAK", type: "toggle", default: true },
            { key: "ENABLE_DL4D_RUNE_FAST_TROOPERS", type: "toggle", default: true },
            { key: "ENABLE_DL4D_RUNE_GOLD_BUFFS", type: "toggle", default: true },
            { key: "ENABLE_DL4D_RUNE_TROOPERS20_HP", type: "toggle", default: true },
            { key: "PASSIVE_COOLDOWN_SIZE", type: "slider", min: 30, max: 60, step: 1, default: 40 },
            { key: "PASSIVE_COOLDOWN_X", type: "slider", min: -50, max: 50, step: 1, default: 0 },
            { key: "PASSIVE_COOLDOWN_Y", type: "slider", min: -50, max: 50, step: 1, default: 0 },
            { key: "PASSIVE_COOLDOWN_OPACITY", type: "slider", min: 0, max: 100, step: 5, default: 50 }
        ],
        create: function(ctx) {
            // ── QOL.import deps (15, dropping unused setPanelClassCached) ──
            var _deps = QOL.import(["ensureAbilitiesContainerPanelCache","ensureGameTimePanelCache","ensurePassiveHudPanelCache","getCachedPanel","getSharedSchemaUtils","isColorWarningEnabled","isPassiveCooldownBasicMode","isStreetBrawlModeActive","normalizeVoiceTypeValue","normalizeVoiceVolumeValue","resolvePassiveCooldownMode","state","setCachedPanel","utils"]);
            var GetCachedPanel = _deps.getCachedPanel;
            var State = _deps.state;
            var SetCachedPanel = _deps.setCachedPanel;
            var Utils = _deps.utils;
            var IsCfgEnabled = Utils.IsCfgEnabled;
            var SetStyleSafe = Utils.SetStyleSafe;
            var SetPanelOpacitySafe = Utils.SetPanelOpacitySafe;
            var ResolvePassiveCooldownMode = _deps.resolvePassiveCooldownMode;
            var IsStreetBrawlModeActive = _deps.isStreetBrawlModeActive;
            var IsPassiveCooldownBasicMode = _deps.isPassiveCooldownBasicMode;
            var IsColorWarningEnabled = _deps.isColorWarningEnabled;
            var EnsureAbilitiesContainerPanelCache = _deps.ensureAbilitiesContainerPanelCache;
            var EnsureGameTimePanelCache = _deps.ensureGameTimePanelCache;
            var EnsurePassiveHudPanelCache = _deps.ensurePassiveHudPanelCache;
            var NormalizeVoiceTypeValue = _deps.normalizeVoiceTypeValue;
            var NormalizeVoiceVolumeValue = _deps.normalizeVoiceVolumeValue;
            var GetSharedSchemaUtils = _deps.getSharedSchemaUtils;

            var _loop = null;
            var _root = null;

            function _isInHideout(root) {
                var hud = root && root.FindChildTraverse ? root.FindChildTraverse("Hud") : null;
                if (!hud) return false;
                try { return hud.BHasClass("InHideout") || hud.BHasClass("inHideoutIntro"); } catch(e) { return false; }
            }

            // ── Constants from old feature ──
            var SOUND_DEBUG = true;
            var INTERNAL_CONFIG = { FIRST_ALERT: 300, INTERVAL_SEC: 300, ONE_TIME_TIER1_SEC: 120, ONE_TIME_TIER2_SEC: 60, ONE_TIME_TIER3_SEC: 30, MINIMAP_INTERVAL_SEC: 15, ALERT_WINDOW: 2 };
            var DL4D_REMINDER_EVENTS = [
                { key: "ENABLE_DL4D_SMALL_CAMPS_BOXES", time: 60, duration: 5, label: "Small Camps & Boxes", event: "DL4D_SmallCampsBoxes_Reminder" },
                { key: "ENABLE_DL4D_RUNE_MELEE_TROOPERS", time: 120, duration: 5, label: "Rune + Melee Troopers", event: "DL4D_RuneMeleeTroopers_Reminder" },
                { key: "ENABLE_DL4D_MEDIUM_CAMPS", time: 180, duration: 5, label: "Medium Camps", event: "DL4D_MediumCamps_Reminder" },
                { key: "ENABLE_DL4D_BIG_CAMPS_SINNERS", time: 240, duration: 5, label: "Big Camps & Sinners", event: "DL4D_BigCampsSinners_Reminder" },
                { key: "ENABLE_DL4D_MIDBOSS_URN_GOLD_RUNE", time: 300, duration: 5, label: "Midboss/Urn/Gold Rune", event: "DL4D_MidbossUrnGoldRune_Reminder" },
                { key: "ENABLE_DL4D_LANE_GUARDIAN_WEAK", time: 360, duration: 5, label: "Lane Guardian Weak", event: "DL4D_LaneGuardianWeak_Reminder" },
                { key: "ENABLE_DL4D_RUNE", time: 420, duration: 5, label: "Rune", event: "DL4D_Rune_Reminder" },
                { key: "ENABLE_DL4D_WALKER_WEAK", time: 480, duration: 5, label: "Walker Weak", event: "DL4D_WalkerWeak_Reminder" },
                { key: "ENABLE_DL4D_RUNE_FAST_TROOPERS", time: 540, duration: 5, label: "Rune + Fast Troopers", event: "DL4D_RuneFastTroopers_Reminder" },
                { key: "ENABLE_DL4D_RUNE_GOLD_BUFFS", time: 600, duration: 5, label: "Rune + Gold Buffs", event: "DL4D_RuneGoldBuffs_Reminder" },
                { key: "ENABLE_DL4D_RUNE_TROOPERS20_HP", time: 660, duration: 5, label: "Rune + Troopers +20% HP", event: "DL4D_RuneTroopers20HP_Reminder" }
            ];

            // ── Private helpers ──

            function ResetPassiveCooldownRuntimeStyles(panel) {
                if (!panel) return;
                try { SetStyleSafe(panel, "width", ""); } catch(e) {}
                try { SetStyleSafe(panel, "height", ""); } catch(e) {}
                try { SetStyleSafe(panel, "horizontalAlign", ""); } catch(e) {}
                try { SetStyleSafe(panel, "verticalAlign", ""); } catch(e) {}
                try { SetStyleSafe(panel, "marginLeft", ""); } catch(e) {}
                try { SetStyleSafe(panel, "marginTop", ""); } catch(e) {}
                State.oldItemCooldownStyleSig = "";
            }

            function GetAnnouncerVoiceToken(rawVoiceType) {
                try { return GetSharedSchemaUtils().GetAnnouncerVoiceToken(rawVoiceType); } catch(e) {}
                var vt = Number(rawVoiceType) || 0;
                if (vt === 0) return "Beep";
                if (vt >= 1 && vt <= 5) return "Custom_Slot" + vt;
                return "Beep";
            }

            function GetEnabledBridgeVariantList(cfg) {
                var list = [];
                if (!cfg) return [1, 2, 3];
                if (IsCfgEnabled(cfg, "ENABLE_BUFF_SOUND_1")) list.push(1);
                if (IsCfgEnabled(cfg, "ENABLE_BUFF_SOUND_2")) list.push(2);
                if (IsCfgEnabled(cfg, "ENABLE_BUFF_SOUND_3")) list.push(3);
                return list.length > 0 ? list : [1, 2, 3];
            }

            function GetRandomBridgeVariant(cfg) {
                var list = GetEnabledBridgeVariantList(cfg);
                var idx = Math.floor(Math.random() * list.length);
                if (!isFinite(idx) || idx < 0 || idx >= list.length) idx = 0;
                return list[idx];
            }

            function ResolveAnnouncerEventForVolume(baseEventName, cfg) {
                var vol = NormalizeVoiceVolumeValue(cfg && cfg.VOICE_VOLUME !== undefined ? cfg.VOICE_VOLUME : 70);
                return baseEventName + "_V" + vol;
            }

            function IsDl4dReminderRuntimeActive(cfg) { return !!(cfg && IsCfgEnabled(cfg, "ENABLE_DL4D_REMINDERS")); }

            function ResolveDl4dReminderEventForVolume(baseEventName, cfg) {
                var vol = NormalizeVoiceVolumeValue(cfg && cfg.DL4D_VOLUME !== undefined ? cfg.DL4D_VOLUME : 70);
                return baseEventName + "_V" + vol;
            }

            function EnsureDl4dCaptionPanel(root) {
                var panel = GetCachedPanel("dl4dCaptionPanel");
                if (!panel && root && root.FindChildTraverse) {
                    panel = root.FindChildTraverse("QOLDL4DCaption");
                    if (panel) SetCachedPanel("dl4dCaptionPanel", panel);
                }
                if (!panel && root) {
                    panel = $.CreatePanel("Label", root, "QOLDL4DCaption");
                    panel.AddClass("QOLDL4DCaption");
                    SetStyleSafe(panel, "visibility", "collapse");
                    SetStyleSafe(panel, "text", "");
                    SetStyleSafe(panel, "horizontalAlign", "center");
                    SetStyleSafe(panel, "verticalAlign", "top");
                    SetStyleSafe(panel, "marginTop", "64px");
                    SetStyleSafe(panel, "fontSize", "28px");
                    SetStyleSafe(panel, "color", "#FFFFFF");
                    SetStyleSafe(panel, "textShadow", "0px 0px 4px #000000");
                    SetStyleSafe(panel, "zIndex", "9999");
                    SetStyleSafe(panel, "width", "100%");
                    SetStyleSafe(panel, "textAlign", "center");
                    SetCachedPanel("dl4dCaptionPanel", panel);
                }
                return panel;
            }

            function HideDl4dCaption() {
                var panel = GetCachedPanel("dl4dCaptionPanel");
                if (panel && panel.IsValid && panel.IsValid()) {
                    try { panel.text = ""; } catch(e) {}
                    try { panel.style.visibility = "collapse"; } catch(e) {}
                }
                State.dl4dCaptionVisible = false;
                State.dl4dCaptionToken = (State.dl4dCaptionToken || 0) + 1;
            }

            function ShowDl4dCaption(root, cfg, text, durationSec) {
                if (!cfg || !IsCfgEnabled(cfg, "ENABLE_DL4D_CAPTIONS")) return;
                var panel = EnsureDl4dCaptionPanel(root);
                if (!panel) return;
                try { panel.text = String(text || ""); } catch(e) {}
                try { SetStyleSafe(panel, "visibility", "visible"); } catch(e) {}
                State.dl4dCaptionVisible = true;
                State.dl4dCaptionToken = (State.dl4dCaptionToken || 0) + 1;
                var token = State.dl4dCaptionToken;
                $.Schedule(durationSec, function() { if (State.dl4dCaptionToken === token) HideDl4dCaption(); });
            }

            function ResetDl4dReminderRuntime() {
                State.dl4dLastTime = -1;
                State.dl4dTriggeredTimes = {};
                HideDl4dCaption();
            }

            function UpdateDl4dReminderRuntime(root, cfg, currentTime, suppressAudio) {
                if (!cfg || !IsCfgEnabled(cfg, "ENABLE_DL4D_REMINDERS")) return;
                if (State.dl4dLastTime > 30 && currentTime < State.dl4dLastTime - 30) { State.dl4dTriggeredTimes = {}; }
                State.dl4dLastTime = currentTime;
                for (var i = 0; i < DL4D_REMINDER_EVENTS.length; i++) {
                    var reminder = DL4D_REMINDER_EVENTS[i];
                    if (!IsCfgEnabled(cfg, reminder.key)) continue;
                    var triggerTime = reminder.time;
                    var alreadyTriggered = State.dl4dTriggeredTimes && State.dl4dTriggeredTimes[reminder.key] === triggerTime;
                    if (currentTime >= triggerTime && currentTime < triggerTime + reminder.duration && !alreadyTriggered) {
                        if (State.dl4dTriggeredTimes) State.dl4dTriggeredTimes[reminder.key] = triggerTime;
                        ShowDl4dCaption(root, cfg, reminder.label, reminder.duration);
                        if (!suppressAudio) {
                            var eventName = ResolveDl4dReminderEventForVolume(reminder.event, cfg);
                            $.DispatchEvent("PlaySoundEffect", eventName);
                            if (SOUND_DEBUG) $.Msg("[QOLLock][DL4D] dispatched: " + eventName);
                        }
                    }
                }
            }

            function LogSoundDispatch(eventName, cfg, voiceSelection) {
                if (!SOUND_DEBUG) return;
                $.Msg("[QOLLock][Audio] dispatched: " + eventName + " voice=" + (voiceSelection || "?") + " vol=" + (cfg && cfg.VOICE_VOLUME));
            }

            function IsAnyAnnouncerReminderTypeEnabled(cfg) {
                return !!(IsCfgEnabled(cfg, "ENABLE_MINIMAP_REMINDER") || IsCfgEnabled(cfg, "ENABLE_INTERVAL") || IsCfgEnabled(cfg, "ENABLE_ONE_TIME") || IsColorWarningEnabled(cfg) || IsCfgEnabled(cfg, "ENABLE_ONE_TIME_TIER3"));
            }

            // ── Main tick ──
            var _dbgTick = 0;
            function _tick() {
                var root = _root || $.GetContextPanel(); if (root && !_root) _root = root;
                // Read from State.lastConfig (global config, same as old dispatch loop used)
                // ctx.config.all() only works for manifests with enableKey — with
                // enabledByDefault:true, config isn't populated into the ConfigStore bucket.
                var cfg = (State.lastConfig) || {};
                _dbgTick++;

                // Passive cooldown state tracking (for coreRoot cross-feature compat)
                var passiveCooldownMode = ResolvePassiveCooldownMode(cfg);
                var basicModeActive = IsPassiveCooldownBasicMode(passiveCooldownMode);
                State.oldItemCooldownRuntimeWasActive = basicModeActive;

                var needsPassiveRuntime = basicModeActive;
                var needsReminderRuntime = (IsAnyAnnouncerReminderTypeEnabled(cfg) || IsDl4dReminderRuntimeActive(cfg));
                if (_dbgTick === 1 || _dbgTick % 30 === 0) {
                    // Check raw config values directly — ctx.config.all() vs cfg[key]
                    var rawDl4d = Number(cfg.ENABLE_DL4D_REMINDERS);
                    var rawLegacy = Number(cfg.ENABLE_LEGACY_COOLDOWNS);
                    var rawInterval = Number(cfg.ENABLE_INTERVAL);
                    $.Msg("[QOLLock][la] tick=" + _dbgTick +
                          " cfg.ENABLE_DL4D_REMINDERS=" + rawDl4d +
                          " cfg.ENABLE_LEGACY_COOLDOWNS=" + rawLegacy +
                          " cfg.ENABLE_INTERVAL=" + rawInterval +
                          " IsCfgEnabled(dl4d)=" + IsCfgEnabled(cfg, "ENABLE_DL4D_REMINDERS") +
                          " needsReminder=" + needsReminderRuntime);
                }
                if (!needsPassiveRuntime && !needsReminderRuntime) {
                    if (_dbgTick === 1) $.Msg("[QOLLock][la] early return — nothing enabled");
                    return;
                }

                var hideoutConnected = _isInHideout(root);
                if (hideoutConnected) { UpdateDl4dReminderRuntime(root, cfg, 0, true); return; }

                // Passive cooldown HUD styling (basic mode)
                if (basicModeActive) {
                    var passiveHud = EnsurePassiveHudPanelCache(root);
                    if (passiveHud && passiveHud.IsValid && passiveHud.IsValid()) {
                        var curSig = [cfg.PASSIVE_COOLDOWN_SIZE||40, cfg.PASSIVE_COOLDOWN_X||0, cfg.PASSIVE_COOLDOWN_Y||0, cfg.PASSIVE_COOLDOWN_OPACITY||50].join("|");
                        if (curSig !== State.oldItemCooldownStyleSig) {
                            State.oldItemCooldownStyleSig = curSig;
                            State.oldItemCooldownStylePanel = passiveHud;
                            var size = Math.max(30, Math.min(60, Number(cfg.PASSIVE_COOLDOWN_SIZE) || 40));
                            var x = Math.max(-50, Math.min(50, Number(cfg.PASSIVE_COOLDOWN_X) || 0));
                            var y = Math.max(-50, Math.min(50, Number(cfg.PASSIVE_COOLDOWN_Y) || 0));
                            var opacity = Math.max(0, Math.min(100, Number(cfg.PASSIVE_COOLDOWN_OPACITY) || 50)) / 100;
                            SetStyleSafe(passiveHud, "width", size + "px");
                            SetStyleSafe(passiveHud, "height", size + "px");
                            if (x !== 0 || y !== 0) { SetStyleSafe(passiveHud, "marginLeft", x + "px"); SetStyleSafe(passiveHud, "marginTop", y + "px"); }
                            else { SetStyleSafe(passiveHud, "marginLeft", ""); SetStyleSafe(passiveHud, "marginTop", ""); }
                            SetPanelOpacitySafe(passiveHud, opacity, 0.5);
                            var abilitiesContainer = EnsureAbilitiesContainerPanelCache(root);
                            if (abilitiesContainer && abilitiesContainer.IsValid && abilitiesContainer.IsValid()) {
                                var shopOpen = abilitiesContainer.BHasClass && abilitiesContainer.BHasClass("ShopOpen");
                                if (shopOpen) { try { passiveHud.style.visibility = "collapse"; } catch(e) {} }
                                else { try { if (passiveHud.style.visibility === "collapse") passiveHud.style.visibility = "visible"; } catch(e) {} }
                            }
                        }
                    }
                }

                // Game clock
                var gameTimeLabel = GetCachedPanel("gameTime");
                if (!gameTimeLabel && root && root.FindChildTraverse) {
                    gameTimeLabel = root.FindChildTraverse("HudGameTime");
                    if (gameTimeLabel) SetCachedPanel("gameTime", gameTimeLabel);
                }
                var gameTimeText = "";
                if (gameTimeLabel && gameTimeLabel.text) { try { gameTimeText = String(gameTimeLabel.text).trim(); } catch(e) {} }
                var currentTime = -1;
                var timeMatch = gameTimeText.match(/(\d+):(\d+)/);
                if (timeMatch) currentTime = (parseInt(timeMatch[1], 10) || 0) * 60 + (parseInt(timeMatch[2], 10) || 0);

                if (currentTime < 0) { if (_dbgTick <= 2) $.Msg("[QOLLock][la] no game clock found"); return; }
                if (_dbgTick <= 2) $.Msg("[QOLLock][la] gameTime=" + currentTime + " hideout=" + hideoutConnected);

                // Time rollover detection
                if (currentTime < State.lastTime) { State.lastIntervalAlert = 0; State.lastMinimapAlert = 0; State.triggeredOneTimers = {}; }
                State.lastTime = currentTime;

                // DL4D reminders
                if (!needsReminderRuntime) { ResetDl4dReminderRuntime(); }
                else { UpdateDl4dReminderRuntime(root, cfg, currentTime, false); }

                // Announcer buff reminders
                if (!needsReminderRuntime) return;

                var bridgeBuffStart = Number(cfg.BRIDGE_BUFF_START) || 30;
                var voiceSelection = GetAnnouncerVoiceToken(cfg.VOICE_TYPE);
                var firstAlert = INTERNAL_CONFIG.FIRST_ALERT;

                // Interval reminders
                if (IsCfgEnabled(cfg, "ENABLE_INTERVAL") && currentTime >= firstAlert) {
                    var intervalSec = Math.max(30, INTERNAL_CONFIG.INTERVAL_SEC);
                    if (currentTime - (State.lastIntervalAlert || 0) >= intervalSec) {
                        State.lastIntervalAlert = currentTime;
                        var variant = GetRandomBridgeVariant(cfg);
                        var eventName = ResolveAnnouncerEventForVolume("BridgeBuff_Interval_" + voiceSelection + "_" + variant, cfg);
                        $.Msg("[QOLLock][la] DISPATCH interval: " + eventName + " at gameTime=" + currentTime);
                        $.DispatchEvent("PlaySoundEffect", eventName);
                        LogSoundDispatch(eventName, cfg, voiceSelection);
                    }
                }

                // One-time TIER1 (120s)
                if (IsCfgEnabled(cfg, "ENABLE_ONE_TIME") && IsCfgEnabled(cfg, "ENABLE_ONE_TIME_TIER1")) {
                    var t1 = INTERNAL_CONFIG.ONE_TIME_TIER1_SEC;
                    if (currentTime >= t1 && currentTime < t1 + INTERNAL_CONFIG.ALERT_WINDOW && !State.triggeredOneTimers["tier1"]) {
                        State.triggeredOneTimers["tier1"] = true;
                        var variantT1 = GetRandomBridgeVariant(cfg);
                        var eventNameT1 = ResolveAnnouncerEventForVolume("BridgeBuff_OneTime_T1_" + voiceSelection + "_" + variantT1, cfg);
                        $.DispatchEvent("PlaySoundEffect", eventNameT1);
                        LogSoundDispatch(eventNameT1, cfg, voiceSelection);
                    }
                }

                // One-time TIER2 (60s)
                if (IsCfgEnabled(cfg, "ENABLE_ONE_TIME") && IsCfgEnabled(cfg, "ENABLE_ONE_TIME_TIER2")) {
                    var t2 = INTERNAL_CONFIG.ONE_TIME_TIER2_SEC;
                    if (currentTime >= t2 && currentTime < t2 + INTERNAL_CONFIG.ALERT_WINDOW && !State.triggeredOneTimers["tier2"]) {
                        State.triggeredOneTimers["tier2"] = true;
                        var variantT2 = GetRandomBridgeVariant(cfg);
                        var eventNameT2 = ResolveAnnouncerEventForVolume("BridgeBuff_OneTime_T2_" + voiceSelection + "_" + variantT2, cfg);
                        $.DispatchEvent("PlaySoundEffect", eventNameT2);
                        LogSoundDispatch(eventNameT2, cfg, voiceSelection);
                    }
                }

                // One-time TIER3 (30s) — also gated by color warning
                if ((IsCfgEnabled(cfg, "ENABLE_ONE_TIME") || IsCfgEnabled(cfg, "ENABLE_ONE_TIME_TIER3")) && IsColorWarningEnabled(cfg)) {
                    var t3 = INTERNAL_CONFIG.ONE_TIME_TIER3_SEC;
                    if (currentTime >= t3 && currentTime < t3 + INTERNAL_CONFIG.ALERT_WINDOW && !State.triggeredOneTimers["tier3"]) {
                        State.triggeredOneTimers["tier3"] = true;
                        var variantT3 = GetRandomBridgeVariant(cfg);
                        var eventNameT3 = ResolveAnnouncerEventForVolume("BridgeBuff_OneTime_T3_" + voiceSelection + "_" + variantT3, cfg);
                        $.DispatchEvent("PlaySoundEffect", eventNameT3);
                        LogSoundDispatch(eventNameT3, cfg, voiceSelection);
                    }
                }

                // Minimap reminder (periodic after bridge buff start)
                if (IsCfgEnabled(cfg, "ENABLE_MINIMAP_REMINDER") && currentTime >= bridgeBuffStart) {
                    var minimapInterval = Number(cfg.MINIMAP_REMINDER_INTERVAL) || INTERNAL_CONFIG.MINIMAP_INTERVAL_SEC;
                    if (currentTime - (State.lastMinimapAlert || 0) >= minimapInterval) {
                        State.lastMinimapAlert = currentTime;
                        var variantM = GetRandomBridgeVariant(cfg);
                        var eventNameM = ResolveAnnouncerEventForVolume("BridgeBuff_Minimap_" + voiceSelection + "_" + variantM, cfg);
                        $.DispatchEvent("PlaySoundEffect", eventNameM);
                        LogSoundDispatch(eventNameM, cfg, voiceSelection);
                    }
                }
            }

            return {
                onEnable: function() {
                    var S = QOL.core.Scheduler;
                    _loop = S && S.createPollLoop ? S.createPollLoop(_tick, 0.5, "ql_legacy_audio_passive") : null;
                },
                onDisable: function() {
                    if (_loop) { _loop.stop(); _loop = null; }
                    var S = QOL.core.Scheduler; if (S) S.cancelAllForFeature("ql_legacy_audio_passive");
                    HideDl4dCaption();
                    State.dl4dCaptionToken = (State.dl4dCaptionToken || 0) + 1;
                    State.lastTime = -1; State.lastIntervalAlert = 0; State.lastMinimapAlert = 0; State.triggeredOneTimers = {};
                    State.dl4dLastTime = -1; State.dl4dTriggeredTimes = {};
                    State.oldItemCooldownRuntimeWasActive = false;
                    State.oldItemCooldownStyleSig = "";
                    State.oldItemCooldownStylePanel = null;
                    SetCachedPanel("dl4dCaptionPanel", null); SetCachedPanel("passiveHud", null); SetCachedPanel("gameTime", null); SetCachedPanel("abilitiesContainer", null);
                    _root = null;
                },
                onSettingsChanged: function() {}
            };
        }
    });
})();

// ql_feat_legacyaudiopassive.js — Legacy audio cooldowns, passive HUD, DL4D reminders, announcer bridge buffs
// Extracted from ql_core.js, Phase 9 Step 2c
(function() {
    'use strict';
    var _featureId = "ql_feat_legacyaudiopassive";
    // DEPENDS: ensureAbilitiesContainerPanelCache, ensureGameTimePanelCache, ensurePassiveHudPanelCache, getCachedPanel, getSharedSchemaUtils, isColorWarningEnabled, isPassiveCooldownBasicMode, isStreetBrawlModeActive, normalizeVoiceTypeValue, normalizeVoiceVolumeValue, resolvePassiveCooldownMode, state, setCachedPanel, setPanelClassCached, utils
    var _deps = QOL.import(["ensureAbilitiesContainerPanelCache","ensureGameTimePanelCache","ensurePassiveHudPanelCache","getCachedPanel","getSharedSchemaUtils","isColorWarningEnabled","isPassiveCooldownBasicMode","isStreetBrawlModeActive","normalizeVoiceTypeValue","normalizeVoiceVolumeValue","resolvePassiveCooldownMode","state","setCachedPanel","setPanelClassCached","utils"]);
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
    var SetPanelClassCached = _deps.setPanelClassCached;

    // ── Constants ──
    var SOUND_DEBUG = false;
    var INTERNAL_CONFIG = {
        FIRST_ALERT: 300,
        INTERVAL: 300,
        ALERT_WINDOW: 2,
        ONE_TIME_ALERTS: [
            { time: 120, sound: "BuffReminder.Tier1", tierKey: "ENABLE_ONE_TIME_TIER1" },
            { time: 300, sound: "BuffReminder.Tier2", tierKey: "ENABLE_ONE_TIME_TIER2" },
            { time: 480, sound: "BuffReminder.Tier3", tierKey: "ENABLE_ONE_TIME_TIER3" }
        ]
    };
    var DL4D_REMINDER_EVENTS = [
        { time: 105, key: "ENABLE_DL4D_SMALL_CAMPS_BOXES", eventBase: "QOL.DL4D.SmallCampsBoxes", caption: "Small camps, boxes, and statues spawning soon.", duration: 2.8 },
        { time: 285, key: "ENABLE_DL4D_RUNE_MELEE_TROOPERS", eventBase: "QOL.DL4D.RuneMeleeTroopers", caption: "Bridge buffs and melee troopers spawning soon.", duration: 2.3 },
        { time: 290, key: "ENABLE_DL4D_MEDIUM_CAMPS", eventBase: "QOL.DL4D.MediumCamps", caption: "Medium camps are spawning soon.", duration: 1.7 },
        { time: 465, key: "ENABLE_DL4D_BIG_CAMPS_SINNERS", eventBase: "QOL.DL4D.BigCampsSinners", caption: "Sinners and large camps spawning soon.", duration: 1.9 },
        { time: 585, key: "ENABLE_DL4D_MIDBOSS_URN_GOLD_RUNE", eventBase: "QOL.DL4D.MidbossUrnGoldRune", caption: "Soul Urn and Bridge buffs spawning soon. Gold statue buffs have increased.", duration: 4.9 },
        { time: 720, key: "ENABLE_DL4D_LANE_GUARDIAN_WEAK", eventBase: "QOL.DL4D.LaneGuardianWeak", caption: "Lane Guardian's resistance has decreased.", duration: 2.7 },
        { time: 885, key: "ENABLE_DL4D_RUNE", eventBase: "QOL.DL4D.Rune", caption: "Bridge buff is spawning soon.", duration: 1.6 },
        { time: 1080, key: "ENABLE_DL4D_WALKER_WEAK", eventBase: "QOL.DL4D.WalkerWeak", caption: "Walker resistance has decreased.", duration: 2.5 },
        { time: 1185, key: "ENABLE_DL4D_RUNE_FAST_TROOPERS", eventBase: "QOL.DL4D.RuneFastTroopers", caption: "Bridge buffs spawning soon. Troopers now spawn every 25s.", duration: 4.2 },
        { time: 1485, key: "ENABLE_DL4D_RUNE", eventBase: "QOL.DL4D.Rune", caption: "Bridge buff is spawning soon.", duration: 1.6 },
        { time: 1785, key: "ENABLE_DL4D_RUNE_GOLD_BUFFS", eventBase: "QOL.DL4D.RuneGoldBuffs", caption: "Bridge buffs spawning soon. Gold statue buffs have been increased to max.", duration: 4.2 },
        { time: 2085, key: "ENABLE_DL4D_RUNE_TROOPERS20_HP", eventBase: "QOL.DL4D.RuneTroopers20Hp", caption: "Bridge buffs spawning soon. Troopers now spawn every 20s with 50% more HP.", duration: 5.4 },
        { time: 2385, key: "ENABLE_DL4D_RUNE", eventBase: "QOL.DL4D.Rune", caption: "Bridge buff is spawning soon.", duration: 1.6 },
        { time: 2685, key: "ENABLE_DL4D_RUNE", eventBase: "QOL.DL4D.Rune", caption: "Bridge buff is spawning soon.", duration: 1.6 },
        { time: 2985, key: "ENABLE_DL4D_RUNE", eventBase: "QOL.DL4D.Rune", caption: "Bridge buff is spawning soon.", duration: 1.6 },
        { time: 3285, key: "ENABLE_DL4D_RUNE", eventBase: "QOL.DL4D.Rune", caption: "Bridge buff is spawning soon.", duration: 1.6 },
        { time: 3585, key: "ENABLE_DL4D_RUNE", eventBase: "QOL.DL4D.Rune", caption: "Bridge buff is spawning soon.", duration: 1.6 }
    ];

    // ── Private helpers ──

    function ResetPassiveCooldownRuntimeStyles(panel) {
        if (!panel || !panel.style) return;
        SetStyleSafe(panel, "visibility", "");
        SetStyleSafe(panel, "uiScale", "");
        SetStyleSafe(panel, "x", "");
        SetStyleSafe(panel, "y", "");
        SetStyleSafe(panel, "marginLeft", "");
        SetStyleSafe(panel, "marginTop", "");
        SetStyleSafe(panel, "opacity", "");
        State.oldItemCooldownStyleSig = "";
    }

    function GetAnnouncerVoiceToken(rawVoiceType) {
        var utils = GetSharedSchemaUtils();
        if (utils && typeof utils.GetAnnouncerVoiceToken === "function") {
            return utils.GetAnnouncerVoiceToken(rawVoiceType);
        }
        var voiceIdx = NormalizeVoiceTypeValue(rawVoiceType);
        if (voiceIdx === 4) return "Beep";
        if (voiceIdx === 5) return "Custom_Slot2";
        if (voiceIdx === 6) return "Custom_Slot3";
        if (voiceIdx === 7) return "Custom_Slot4";
        if (voiceIdx === 8) return "Custom_Slot5";
        return "Custom_Slot1";
    }

    function GetEnabledBridgeVariantList(cfg) {
        var out = [];
        if (cfg && IsCfgEnabled(cfg, "ENABLE_BUFF_SOUND_1")) out.push(1);
        if (cfg && IsCfgEnabled(cfg, "ENABLE_BUFF_SOUND_2")) out.push(2);
        if (cfg && IsCfgEnabled(cfg, "ENABLE_BUFF_SOUND_3")) out.push(3);
        if (out.length <= 0) return [1, 2, 3];
        return out;
    }

    function GetRandomBridgeVariant(cfg) {
        var variants = GetEnabledBridgeVariantList(cfg);
        var idx = Math.floor(Math.random() * variants.length);
        if (!isFinite(idx) || idx < 0 || idx >= variants.length) idx = 0;
        return variants[idx];
    }

    function ResolveAnnouncerEventForVolume(baseEventName, cfg) {
        var baseName = String(baseEventName || "");
        if (!baseName) return "";
        var voiceVolume = NormalizeVoiceVolumeValue(cfg && cfg.VOICE_VOLUME);
        return baseName + "_V" + String(voiceVolume);
    }

    function IsDl4dReminderRuntimeActive(cfg) {
        return !!(cfg && IsCfgEnabled(cfg, "ENABLE_DL4D_REMINDERS"));
    }

    function ResolveDl4dReminderEventForVolume(baseEventName, cfg) {
        var baseName = String(baseEventName || "");
        if (!baseName) return "";
        var reminderVolume = NormalizeVoiceVolumeValue(cfg && cfg.DL4D_VOLUME);
        return baseName + "_V" + String(reminderVolume);
    }

    function EnsureDl4dCaptionPanel(root) {
        var panel = GetCachedPanel("dl4dCaptionPanel");
        if (!panel && root && root.FindChildTraverse) {
            panel = root.FindChildTraverse("QOLDL4DCaption") || null;
        }
        if (!panel && root) {
            panel = $.CreatePanel("Label", root, "QOLDL4DCaption", {
                text: "",
                hittest: "false"
            });
        }
        if (!panel) return null;
        SetCachedPanel("dl4dCaptionPanel", panel);
        panel.style.horizontalAlign = "center";
        panel.style.verticalAlign = "top";
        panel.style.marginTop = "140px";
        panel.style.padding = "10px 20px";
        panel.style.maxWidth = "980px";
        panel.style.backgroundColor = "#000000cc";
        panel.style.color = "#ffffff";
        panel.style.fontSize = "22px";
        panel.style.fontWeight = "bold";
        panel.style.textAlign = "center";
        panel.style.border = "1px solid #ffffff55";
        panel.style.borderRadius = "6px";
        panel.style.zIndex = "1000";
        panel.style.opacity = "0";
        if (panel.SetHasClass) panel.SetHasClass("qol-hidden", true); else panel.style.visibility = "collapse";
        return panel;
    }

    function HideDl4dCaption() {
        var panel = GetCachedPanel("dl4dCaptionPanel");
        if (panel) {
            panel.text = "";
            panel.style.opacity = "0";
            if (panel.SetHasClass) panel.SetHasClass("qol-hidden", true); else panel.style.visibility = "collapse";
        }
        State.dl4dCaptionVisible = false;
        State.dl4dCaptionToken++;
    }

    function ShowDl4dCaption(root, cfg, text, durationSec) {
        if (!cfg || Number(cfg.ENABLE_DL4D_CAPTIONS) !== 1) return;
        var panel = EnsureDl4dCaptionPanel(root);
        if (!panel) return;
        panel.text = String(text || "");
        if (panel.SetHasClass) panel.SetHasClass("qol-hidden", false); else panel.style.visibility = "visible";
        panel.style.opacity = "0.85";
        State.dl4dCaptionVisible = true;
        State.dl4dCaptionToken++;
        var token = State.dl4dCaptionToken;
        var delay = Number(durationSec);
        if (!isFinite(delay) || delay <= 0) delay = 3.0;
        $.Schedule(delay, function() {
            if (token !== State.dl4dCaptionToken) return;
            HideDl4dCaption();
        });
    }

    function ResetDl4dReminderRuntime() {
        State.dl4dLastTime = -1;
        State.dl4dTriggeredTimes = {};
        HideDl4dCaption();
    }

    function UpdateDl4dReminderRuntime(root, cfg, currentTime, suppressAudio) {
        if (!IsDl4dReminderRuntimeActive(cfg) || suppressAudio) {
            if (State.dl4dCaptionVisible || GetCachedPanel("dl4dCaptionPanel")) HideDl4dCaption();
            if (!IsDl4dReminderRuntimeActive(cfg)) {
                State.dl4dLastTime = -1;
                State.dl4dTriggeredTimes = {};
            }
            return;
        }
        if (!isFinite(currentTime) || currentTime <= 0) return;
        if (State.dl4dLastTime > 30 && currentTime < State.dl4dLastTime - 30) {
            State.dl4dTriggeredTimes = {};
        }
        for (var i = 0; i < DL4D_REMINDER_EVENTS.length; i++) {
            var reminder = DL4D_REMINDER_EVENTS[i];
            if (!reminder || !isFinite(reminder.time)) continue;
            var fireKey = String(reminder.time);
            if (State.dl4dTriggeredTimes[fireKey]) continue;
            if (currentTime >= reminder.time && currentTime < (reminder.time + INTERNAL_CONFIG.ALERT_WINDOW)) {
                State.dl4dTriggeredTimes[fireKey] = true;
                if (Number(cfg[reminder.key]) !== 1) continue;
                ShowDl4dCaption(root, cfg, reminder.caption, reminder.duration);
                var eventName = ResolveDl4dReminderEventForVolume(reminder.eventBase, cfg);
                if (eventName) $.DispatchEvent("PlaySoundEffect", eventName);
            }
        }
        State.dl4dLastTime = currentTime;
    }

    function LogSoundDispatch(eventName, cfg, voiceSelection) {
        if (!SOUND_DEBUG) return;
        $.Msg("[QOLLock] play=" + eventName +
            " voice=" + voiceSelection);
    }

    function IsAnyAnnouncerReminderTypeEnabled(cfg) {
        if (!cfg) return false;
        return (
            IsCfgEnabled(cfg, "ENABLE_MINIMAP_REMINDER") ||
            IsCfgEnabled(cfg, "ENABLE_INTERVAL") ||
            IsCfgEnabled(cfg, "ENABLE_ONE_TIME") ||
            IsColorWarningEnabled(cfg) ||
            IsCfgEnabled(cfg, "ENABLE_ONE_TIME_TIER3")
        );
    }

    // ── Update + Gate ──

    // ── Passive cooldown HUD layout/styles (extracted from UpdateLegacyAudioAndPassiveHudRuntime)
    function ApplyPassiveCooldownRuntimeStyles(root, cfg, passiveHud, basicModeActive) {
        if (!basicModeActive) {
            ResetPassiveCooldownRuntimeStyles(passiveHud);
            State.oldItemCooldownStylePanel = null;
        } else if (State.oldItemCooldownStylePanel !== passiveHud) {
            if (State.oldItemCooldownStylePanel && State.oldItemCooldownStylePanel !== passiveHud) {
                ResetPassiveCooldownRuntimeStyles(State.oldItemCooldownStylePanel);
            }
            State.oldItemCooldownStylePanel = passiveHud;
            State.oldItemCooldownStyleSig = "";
        }
        if (basicModeActive) {
            var abilitiesContainerForOldMode = EnsureAbilitiesContainerPanelCache(root);
            var oldModeInShop = abilitiesContainerForOldMode && abilitiesContainerForOldMode.BHasClass && abilitiesContainerForOldMode.BHasClass("gShopOpen");
            if (passiveHud.SetHasClass) passiveHud.SetHasClass("qol-hidden", oldModeInShop); else passiveHud.style.visibility = oldModeInShop ? "collapse" : "visible";

            var passiveSize = Utils.ClampConfigNumber(cfg.PASSIVE_COOLDOWN_SIZE, 40, 30, 60, false);
            var oldScale = Utils.ClampConfigNumber((passiveSize / 40) * 110, 110, 50, 200, true);

            var passiveOffsetX = Utils.ClampConfigNumber(cfg.PASSIVE_COOLDOWN_X, 0, -50, 50, false);
            var passiveOffsetY = Utils.ClampConfigNumber(cfg.PASSIVE_COOLDOWN_Y, 0, -50, 50, false);
            var oldOffsetXPercent = passiveOffsetX;
            var oldOffsetYPercent = -6 - passiveOffsetY;

            var sharedOpacity = Utils.ClampConfigNumber(cfg.PASSIVE_COOLDOWN_OPACITY, 0.5, 0, 1, false);
            SetPanelOpacitySafe(passiveHud, sharedOpacity, 1.0);

            var oldStyleSig =
                String(oldScale) + "|" +
                oldOffsetXPercent.toFixed(2) + "|" +
                oldOffsetYPercent.toFixed(2) + "|" +
                sharedOpacity.toFixed(2) + "|" +
                (oldModeInShop ? "1" : "0");
            if (State.oldItemCooldownStyleSig !== oldStyleSig) {
                passiveHud.style.uiScale = String(oldScale) + "%";
                passiveHud.style.x = "11px";
                passiveHud.style.y = "30px";
                passiveHud.style.marginLeft = oldOffsetXPercent.toFixed(2) + "%";
                passiveHud.style.marginTop = oldOffsetYPercent.toFixed(2) + "%";
                State.oldItemCooldownStyleSig = oldStyleSig;
            }
        } else {
            ResetPassiveCooldownRuntimeStyles(passiveHud);
            State.oldItemCooldownStylePanel = null;
        }
    }

    function UpdateLegacyAudioAndPassiveHudRuntime(root, cfg, hideoutConnected) {
        var passiveCooldownMode = ResolvePassiveCooldownMode(cfg);
        var basicModeActive = IsPassiveCooldownBasicMode(passiveCooldownMode);
        var needsPassiveRuntime = basicModeActive || State.oldItemCooldownRuntimeWasActive;
        var reminderTypesEnabled = IsAnyAnnouncerReminderTypeEnabled(cfg);
        var dl4dReminderEnabled = IsDl4dReminderRuntimeActive(cfg);
        var needsReminderRuntime = ((reminderTypesEnabled || dl4dReminderEnabled) && !hideoutConnected) || State.dl4dCaptionVisible || GetCachedPanel("dl4dCaptionPanel");

        if (!needsPassiveRuntime && !needsReminderRuntime) return;

        var passiveHud = needsPassiveRuntime ? EnsurePassiveHudPanelCache(root) : GetCachedPanel("passiveHud");
        if (needsPassiveRuntime && passiveHud) {
            ApplyPassiveCooldownRuntimeStyles(root, cfg, passiveHud, basicModeActive);
        } else if (!basicModeActive && State.oldItemCooldownStylePanel) {
            ResetPassiveCooldownRuntimeStyles(State.oldItemCooldownStylePanel);
            State.oldItemCooldownStylePanel = null;
        }
        State.oldItemCooldownRuntimeWasActive = basicModeActive;

        if (!needsReminderRuntime) return;
        if (hideoutConnected || !dl4dReminderEnabled) {
            UpdateDl4dReminderRuntime(root, cfg, 0, true);
        }

        var clock = EnsureGameTimePanelCache(root);
        if (!(clock && clock.text && clock.text.indexOf(":") > -1)) return;

        var parts = clock.text.split(':');
        var currentTime = (parseInt(parts[0], 10) * 60) + parseInt(parts[1], 10);
        if (currentTime < State.lastTime) {
            State.lastIntervalAlert = 0;
            State.lastMinimapAlert = 0;
            State.triggeredOneTimers = {};
        }

        var suppressReminderAudio = IsStreetBrawlModeActive(root);
        if (suppressReminderAudio) {
            UpdateDl4dReminderRuntime(root, cfg, currentTime, true);
            State.lastTime = currentTime;
            return;
        }

        UpdateDl4dReminderRuntime(root, cfg, currentTime, false);

        var voiceSelection = GetAnnouncerVoiceToken(cfg.VOICE_TYPE);
        var suffix = "_" + voiceSelection;

        if (IsCfgEnabled(cfg, "ENABLE_MINIMAP_REMINDER")) {
            var mInterval = cfg.MINIMAP_REMINDER_INTERVAL || 15;
            var mTarget = Math.floor(currentTime / mInterval) * mInterval;
            if (currentTime >= mTarget && currentTime < (mTarget + INTERNAL_CONFIG.ALERT_WINDOW)) {
                if (State.lastMinimapAlert < mTarget) {
                    var minimapEvent = ResolveAnnouncerEventForVolume("BuffReminder.Minimap", cfg);
                    LogSoundDispatch(minimapEvent, cfg, voiceSelection);
                    $.DispatchEvent("PlaySoundEffect", minimapEvent);
                    State.lastMinimapAlert = mTarget;
                }
            }
        }
        if (
            IsCfgEnabled(cfg, "ENABLE_ONE_TIME") ||
            IsColorWarningEnabled(cfg) ||
            IsCfgEnabled(cfg, "ENABLE_ONE_TIME_TIER3")
        ) {
            INTERNAL_CONFIG.ONE_TIME_ALERTS.forEach(function(alert) {
                var tierKey = String(alert && alert.tierKey ? alert.tierKey : "");
                var tierEnabled = tierKey ? (Number(cfg[tierKey]) === 1) : (IsCfgEnabled(cfg, "ENABLE_ONE_TIME"));
                if (!tierEnabled) return;
                if (currentTime >= alert.time && currentTime < (alert.time + INTERNAL_CONFIG.ALERT_WINDOW)) {
                    if (!State.triggeredOneTimers[alert.time]) {
                        var oneTimeEvent = (voiceSelection === "Beep")
                            ? "BuffReminder.Beep"
                            : (alert.sound + suffix);
                        oneTimeEvent = ResolveAnnouncerEventForVolume(oneTimeEvent, cfg);
                        LogSoundDispatch(oneTimeEvent, cfg, voiceSelection);
                        $.DispatchEvent("PlaySoundEffect", oneTimeEvent);
                        State.triggeredOneTimers[alert.time] = true;
                    }
                }
            });
        }
        if (IsCfgEnabled(cfg, "ENABLE_INTERVAL")) {
            var dynamicFirstAlert = INTERNAL_CONFIG.FIRST_ALERT - (cfg.BRIDGE_BUFF_START || 30);
            var targetTime = dynamicFirstAlert + (Math.floor((currentTime - dynamicFirstAlert) / INTERNAL_CONFIG.INTERVAL) * INTERNAL_CONFIG.INTERVAL);
            if (currentTime >= targetTime && currentTime < (targetTime + INTERNAL_CONFIG.ALERT_WINDOW)) {
                if (State.lastIntervalAlert < targetTime) {
                    var intervalEvent = "";
                    if (voiceSelection === "Beep") {
                        intervalEvent = "BuffReminder.Beep";
                    } else {
                        var bridgeVariant = GetRandomBridgeVariant(cfg);
                        intervalEvent = "BuffReminder.Bridge" + String(bridgeVariant) + suffix;
                    }
                    intervalEvent = ResolveAnnouncerEventForVolume(intervalEvent, cfg);
                    LogSoundDispatch(intervalEvent, cfg, voiceSelection);
                    $.DispatchEvent("PlaySoundEffect", intervalEvent);
                    State.lastIntervalAlert = targetTime;
                }
            }
        }
        State.lastTime = currentTime;
    }

    function NeedsLegacyAudioPassiveRuntimeWork(cfg, hideoutConnected) {
        var basicModeActive = IsPassiveCooldownBasicMode(ResolvePassiveCooldownMode(cfg));
        var needsPassiveRuntime = basicModeActive || State.oldItemCooldownRuntimeWasActive;
        var needsDl4dCleanup = State.dl4dCaptionVisible || GetCachedPanel("dl4dCaptionPanel");
        var needsReminderRuntime = ((IsAnyAnnouncerReminderTypeEnabled(cfg) || IsDl4dReminderRuntimeActive(cfg)) && !hideoutConnected) || needsDl4dCleanup;
        return needsPassiveRuntime || needsReminderRuntime;
    }

    // ── Registration ──

    QOL.register("legacyAudioPassive", {
        configKeys: ["ENABLE_LEGACY_COOLDOWNS", "ENABLE_ONE_TIME", "ENABLE_ONE_TIME_TIER1",
                     "ENABLE_ONE_TIME_TIER2", "ENABLE_ONE_TIME_TIER3", "ENABLE_INTERVAL",
                     "VOICE_TYPE", "BRIDGE_BUFF_START"],
        bucket: 7, phase: -1,
        requiresRoot: true,
        perfLabel: "loop.legacy_audio_and_passivehud",
        gate: function(cfg, hideoutConnected) {
            try {
                return NeedsLegacyAudioPassiveRuntimeWork(cfg, hideoutConnected);
            } catch(e) {
                $.Msg("[QOLLock][ERROR][" + _featureId + "] gate: " + (e && e.message ? e.message : String(e)));
                return false;
            }
        },
        update: function(root, cfg, nowMs, State, hideoutConnected) {
            try {
                UpdateLegacyAudioAndPassiveHudRuntime(root, cfg, hideoutConnected);
            } catch(e) {
                $.Msg("[QOLLock][ERROR][" + _featureId + "] update: " + (e && e.message ? e.message : String(e)) + "\n" + (e && e.stack ? String(e.stack) : ""));
                throw e;
            }
        },
        stateKeys: ["oldItemCooldownRuntimeWasActive", "oldItemCooldownStylePanel",
                    "oldItemCooldownStyleSig", "dl4dCaptionVisible",
                    "dl4dCaptionNextSearchMs", "cachedPanels.dl4dCaptionPanel",
                    "lastTime", "lastIntervalAlert", "lastMinimapAlert", "triggeredOneTimers",
                    "cachedPanels.passiveHud", "cachedPanels.gameTime",
                    "cachedPanels.abilitiesContainer"]
    });

    // ── Self-test ──
    try {
        if (typeof UpdateLegacyAudioAndPassiveHudRuntime !== "function") throw new Error("UpdateLegacyAudioAndPassiveHudRuntime is not a function");
        if (typeof NeedsLegacyAudioPassiveRuntimeWork !== "function") throw new Error("NeedsLegacyAudioPassiveRuntimeWork is not a function");
    } catch(e) {
        $.Msg("[QOLLock][ERROR][" + _featureId + "] self-test failed: " + (e && e.message ? e.message : String(e)));
    }
})();

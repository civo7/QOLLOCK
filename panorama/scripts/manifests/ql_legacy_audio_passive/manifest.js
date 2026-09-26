// features/ql_legacy_audio_passive/manifest.js
// =============================================================================
// QOLLOCK — Legacy Audio Announcements + DL4D Reminders + Passive Cooldown HUD
// =============================================================================
// OWNS:        Announcer voice buff reminders (interval + one-time triggers),
//              DL4D game-event reminders with captions + audio,
//              passive cooldown HUD styling (basic mode)
// DOES NOT OWN: game clock, announcer voice assets, game events, passive cooldown
//              advanced mode (see ql_passive_cooldown)
// DEPENDS ON:  QOL.core.FeatureRegistry, QOL.core.Scheduler
// CONFIG KEYS: ENABLE_LEGACY_COOLDOWNS, ENABLE_INTERVAL, ENABLE_ONE_TIME,
//              ENABLE_ONE_TIME_TIER1/2/3, ENABLE_MINIMAP_REMINDER,
//              ENABLE_BUFF_SOUND_1/2/3, VOICE_TYPE, VOICE_VOLUME,
//              BRIDGE_BUFF_START, ENABLE_DL4D_REMINDERS, ENABLE_DL4D_CAPTIONS,
//              DL4D_VOLUME, + 11 DL4D event toggles,
//              PASSIVE_COOLDOWN_SIZE/X/Y/OPACITY
// PATTERN:     Polling (0.5Hz). Reads game clock, triggers timed audio
//              announcements + DL4D captions.
// CONFIG SRC:  State.lastConfig (no enableKey → ConfigStore bucket is empty)
// PORTED FROM: features/ql_feat_legacyaudiopassive.js (438 lines)
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
            { key: "MINIMAP_REMINDER_INTERVAL", type: "slider", min: 5, max: 60, step: 1, default: 15 },
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
            { key: "PASSIVE_COOLDOWN_OPACITY", type: "slider", min: 0, max: 100, step: 5, default: 50 },
            { key: "ENABLE_PASSIVE_COOLDOWN", type: "toggle", default: true },
            { key: "ENABLE_OLD_ITEM_COOLDOWNS", type: "toggle", default: false },
            { key: "ITEM_FILTER_DEF_PASSIVE", type: "toggle", default: true },
            { key: "ITEM_FILTER_OFF_PASSIVE", type: "toggle", default: true },
            { key: "ITEM_FILTER_DEF_ACTIVE", type: "toggle", default: false },
            { key: "ITEM_FILTER_OFF_ACTIVE", type: "toggle", default: false }
        ],
        create: function(ctx) {
            var Panel = (QOL.core && QOL.core.panel) ? QOL.core.panel : {};
            var State = QOL.state || (typeof globalThis !== "undefined" && globalThis.State) || {};
            var Utils = QOL.utils;
            var IsCfgEnabled = QOL.utils.IsCfgEnabled;
            var SetStyleSafe = QOL.utils.SetStyleSafe;
            var SetPanelOpacitySafe = QOL.utils.SetPanelOpacitySafe;
            var GetCachedPanel = QOL.getCachedPanel;
            var SetCachedPanel = QOL.setCachedPanel;
            var ResolvePassiveCooldownMode = function(cfg) {
                if (typeof QOL.resolvePassiveCooldownMode === "function") return QOL.resolvePassiveCooldownMode(cfg);
                var masterEnabled = IsCfgEnabled(cfg, "ENABLE_PASSIVE_COOLDOWN");
                if (!masterEnabled) return "default";
                var advancedModeEnabled = Number(cfg && cfg.ENABLE_OLD_ITEM_COOLDOWNS) !== 1;
                return advancedModeEnabled ? "advanced" : "basic";
            };
            var IsStreetBrawlModeActive = function(r) { return QOL.isStreetBrawlModeActive ? QOL.isStreetBrawlModeActive(r) : false; };
            var IsPassiveCooldownBasicMode = function(mode) {
                if (typeof QOL.isPassiveCooldownBasicMode === "function") return QOL.isPassiveCooldownBasicMode(mode);
                return mode === "basic";
            };
            var IsColorWarningEnabled = function(cfg) { return QOL.isColorWarningEnabled ? QOL.isColorWarningEnabled(cfg) : false; };

            function _ensureCachedByIds(root, cacheKey, ids) {
                if (State && State.cachedPanels && State.cachedPanels[cacheKey] && Utils && Utils.IsPanelValid && Utils.IsPanelValid(State.cachedPanels[cacheKey])) {
                    return State.cachedPanels[cacheKey];
                }
                if (!root || !root.FindChildTraverse) return null;
                var panel = null;
                for (var i = 0; i < ids.length; i++) {
                    panel = root.FindChildTraverse(ids[i]);
                    if (panel) break;
                }
                if (State && State.cachedPanels) State.cachedPanels[cacheKey] = panel || null;
                return panel || null;
            }
            var EnsureAbilitiesContainerPanelCache = function(root) {
                return _ensureCachedByIds(root, "abilitiesContainer", ["abilities_container", "AbilitiesContainer"]);
            };
            var EnsureGameTimePanelCache = function(root) {
                return _ensureCachedByIds(root, "gameTime", ["HudGameTime", "GameTime"]);
            };
            var EnsurePassiveHudPanelCache = function(root) {
                return _ensureCachedByIds(root, "passiveHud", ["hud_passive_items"]);
            };
            var NormalizeVoiceTypeValue = function(v) { return QOL.normalizeVoiceTypeValue ? QOL.normalizeVoiceTypeValue(v) : v; };
            var NormalizeVoiceVolumeValue = function(v) { return QOL.normalizeVoiceVolumeValue ? QOL.normalizeVoiceVolumeValue(v) : v; };
            var GetSharedSchemaUtils = function() { return QOL.getSharedSchemaUtils ? QOL.getSharedSchemaUtils() : null; };
            var SetPanelClassCached = QOL.setPanelClassCached || function(p, c, cls, val) { if (p && p.SetHasClass) p.SetHasClass(cls, !!val); };
            var isConnectedToHideout = function(r) { return (QOL.core && QOL.core.hud && QOL.core.hud.isClassActive) ? (QOL.core.hud.isClassActive('connectedToHideout') || QOL.core.hud.isClassActive('InHideout')) : (QOL.isConnectedToHideout ? QOL.isConnectedToHideout(r) : false); };

            var _loop = null;
            var _root = null;

            // ── Constants (verbatim from old feature) ──
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

            // ── Private helpers (verbatim from old feature) ──

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

            // ── Passive cooldown HUD layout/styles (verbatim from old feature) ──
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

            // ── Main tick (adapted from UpdateLegacyAudioAndPassiveHudRuntime) ──
            function _tick() {
                var root = _root || $.GetContextPanel(); if (root && !_root) _root = root;
                var cfg = (ctx.config && ctx.config.view) ? ctx.config.view() : (_lastFeatureConfig || {});

                var passiveCooldownMode = ResolvePassiveCooldownMode(cfg);
                var basicModeActive = IsPassiveCooldownBasicMode(passiveCooldownMode);
                var needsPassiveRuntime = basicModeActive || State.oldItemCooldownRuntimeWasActive;
                var reminderTypesEnabled = IsAnyAnnouncerReminderTypeEnabled(cfg);
                var dl4dReminderEnabled = IsDl4dReminderRuntimeActive(cfg);

                var hasReminderCleanup = !!(
                    State.dl4dCaptionVisible || GetCachedPanel("dl4dCaptionPanel")
                );
                if (!needsPassiveRuntime && !reminderTypesEnabled && !dl4dReminderEnabled && !hasReminderCleanup) {
                    // Stay below the two-second announcer alert window so a
                    // newly enabled reminder cannot miss its first boundary.
                    if (_loop) _loop.reschedule(1.0);
                    return;
                }
                if (_loop) _loop.reschedule(0.5);

                // Hideout check — internalized from old dispatch parameter
                var hideoutConnected = false;
                try { hideoutConnected = isConnectedToHideout(root); } catch(e) {}
                var needsReminderRuntime = ((reminderTypesEnabled || dl4dReminderEnabled) && !hideoutConnected) || hasReminderCleanup;

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

                // Street brawl check — suppress reminder audio during practice mode
                var suppressReminderAudio = false;
                try { suppressReminderAudio = IsStreetBrawlModeActive(root); } catch(e) {}
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
                                $.DispatchEvent("PlaySoundEffect", oneTimeEvent);
                                State.triggeredOneTimers[alert.time] = true;
                            }
                        }
                    });
                }
                if (IsCfgEnabled(cfg, "ENABLE_INTERVAL")) {
                    var bridgeLeadSec = Number(cfg.BRIDGE_BUFF_START);
                    if (cfg.BRIDGE_BUFF_START === undefined || cfg.BRIDGE_BUFF_START === null || !isFinite(bridgeLeadSec)) bridgeLeadSec = 30;
                    var dynamicFirstAlert = INTERNAL_CONFIG.FIRST_ALERT - bridgeLeadSec;
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
                            $.DispatchEvent("PlaySoundEffect", intervalEvent);
                            State.lastIntervalAlert = targetTime;
                        }
                    }
                }
                State.lastTime = currentTime;
            }

            var _lastFeatureConfig = {};

            return {
                onEnable: function() {
                    _lastFeatureConfig = (ctx.config && ctx.config.all) ? ctx.config.all() : (globalThis.MOD_CONFIG || {});
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
                onSettingsChanged: function() {
                    _lastFeatureConfig = (ctx.config && ctx.config.all) ? ctx.config.all() : (globalThis.MOD_CONFIG || {});
                }
            };
        },
        test: function(ctx) {
            try {
                var root = $.GetContextPanel();
                var abilitiesContainer = root ? root.FindChildTraverse("AbilitiesContainer") : null;
                var gameTime = root ? root.FindChildTraverse("GameTime") : null;
                return {
                    passed: !!(abilitiesContainer && gameTime),
                    name: "Audio passive panels exist",
                    message: (!abilitiesContainer ? "abilities_container not found" : "") + (!gameTime ? (abilitiesContainer ? "" : "") + "GameTime not found" : ""),
                    assertions: [
                        { passed: !!abilitiesContainer, name: "abilities_container exists (cooldown HUD)" },
                        { passed: !!gameTime, name: "GameTime exists (DL4D triggers)" }
                    ]
                };
            } catch(e) { return { passed: false, name: "Audio passive panel check", message: (e && e.message ? e.message : String(e)) }; }
        }
    });
})();

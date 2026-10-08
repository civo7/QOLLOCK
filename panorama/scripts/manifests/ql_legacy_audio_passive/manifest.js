// manifests/ql_legacy_audio_passive/manifest.js
// =============================================================================
// QOLLOCK — Legacy Audio Announcements + DL4D Reminders
// =============================================================================
// OWNS:        Announcer voice buff reminders (interval + one-time triggers),
//              DL4D game-event reminders with captions + audio
// DOES NOT OWN: game clock, announcer assets/events, Basic layout (ql_passive_cooldown)
//              or Advanced item mirror (ql_item_mirror)
// DEPENDS ON:  QOL.core.FeatureRegistry, QOL.core.Scheduler
// CONFIG KEYS: ENABLE_LEGACY_COOLDOWNS, ENABLE_INTERVAL, ENABLE_ONE_TIME,
//              ENABLE_ONE_TIME_TIER1/2/3, ENABLE_MINIMAP_REMINDER,
//              ENABLE_BUFF_SOUND_1/2/3, VOICE_TYPE, VOICE_VOLUME,
//              BRIDGE_BUFF_START, ENABLE_DL4D_REMINDERS, ENABLE_DL4D_CAPTIONS,
//              DL4D_VOLUME, + 11 DL4D event toggles
// PATTERN:     Polling every 0.5s when active. Reads game clock, triggers timed audio
//              announcements + DL4D captions.
// CONFIG SRC:  ctx.config.view(); retained shared schema entries preserve mapping
// =============================================================================

(() => {
    "use strict";
    const FR = QOL.core.FeatureRegistry;
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
            { key: "PASSIVE_COOLDOWN_OPACITY", type: "slider", min: 0, max: 1, step: 0.05, default: 0.5 },
            { key: "ENABLE_PASSIVE_COOLDOWN", type: "toggle", default: false },
            { key: "ENABLE_OLD_ITEM_COOLDOWNS", type: "toggle", default: false },
            { key: "ITEM_FILTER_DEF_PASSIVE", type: "toggle", default: true },
            { key: "ITEM_FILTER_OFF_PASSIVE", type: "toggle", default: true },
            { key: "ITEM_FILTER_DEF_ACTIVE", type: "toggle", default: false },
            { key: "ITEM_FILTER_OFF_ACTIVE", type: "toggle", default: false }
        ],
        create(ctx) {
            const Panel = (QOL.core && QOL.core.panel) ? QOL.core.panel : {};
            const State = QOL.state || (typeof globalThis !== "undefined" && globalThis.State) || {};
            const IsCfgEnabled = QOL.utils.IsCfgEnabled;
            const GetCachedPanel = QOL.getCachedPanel;
            const SetCachedPanel = QOL.setCachedPanel;
            const IsStreetBrawlModeActive = function(r) { return QOL.isStreetBrawlModeActive ? QOL.isStreetBrawlModeActive(r) : false; };
            const IsColorWarningEnabled = function(cfg) { return QOL.isColorWarningEnabled ? QOL.isColorWarningEnabled(cfg) : false; };

            const clockResolvers = ["HudGameTime", "GameTime"].map(id => QOL.panelCache.createIdResolver(id));
            function EnsureGameTimePanelCache(root) {
                for (const resolver of clockResolvers) {
                    const panel = resolver.resolve(root);
                    if (panel) return panel;
                }
                return null;
            }
            const NormalizeVoiceTypeValue = function(v) { return QOL.normalizeVoiceTypeValue ? QOL.normalizeVoiceTypeValue(v) : v; };
            const NormalizeVoiceVolumeValue = function(v) { return QOL.normalizeVoiceVolumeValue ? QOL.normalizeVoiceVolumeValue(v) : v; };
            const GetSharedSchemaUtils = function() { return QOL.getSharedSchemaUtils ? QOL.getSharedSchemaUtils() : null; };
            const isConnectedToHideout = QOL.core.hud.isInHideout;

            let _loop = null;
            let _root = null;
            let _captionHideTask = null;
            let _captionPanel = null;
            let _config = null;

            // ── Constants (verbatim from old feature) ──
            const INTERNAL_CONFIG = {
                FIRST_ALERT: 300,
                INTERVAL: 300,
                ALERT_WINDOW: 2,
                ONE_TIME_ALERTS: [
                    { time: 120, sound: "BuffReminder.Tier1", tierKey: "ENABLE_ONE_TIME_TIER1" },
                    { time: 300, sound: "BuffReminder.Tier2", tierKey: "ENABLE_ONE_TIME_TIER2" },
                    { time: 480, sound: "BuffReminder.Tier3", tierKey: "ENABLE_ONE_TIME_TIER3" }
                ]
            };
            const DL4D_REMINDER_EVENTS = [
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

            function GetAnnouncerVoiceToken(rawVoiceType) {
                const utils = GetSharedSchemaUtils();
                if (utils && typeof utils.GetAnnouncerVoiceToken === "function") {
                    return utils.GetAnnouncerVoiceToken(rawVoiceType);
                }
                const voiceIdx = NormalizeVoiceTypeValue(rawVoiceType);
                if (voiceIdx === 4) return "Beep";
                if (voiceIdx === 5) return "Custom_Slot2";
                if (voiceIdx === 6) return "Custom_Slot3";
                if (voiceIdx === 7) return "Custom_Slot4";
                if (voiceIdx === 8) return "Custom_Slot5";
                return "Custom_Slot1";
            }

            function GetEnabledBridgeVariantList(cfg) {
                const out = [];
                if (cfg && IsCfgEnabled(cfg, "ENABLE_BUFF_SOUND_1")) out.push(1);
                if (cfg && IsCfgEnabled(cfg, "ENABLE_BUFF_SOUND_2")) out.push(2);
                if (cfg && IsCfgEnabled(cfg, "ENABLE_BUFF_SOUND_3")) out.push(3);
                if (out.length <= 0) return [1, 2, 3];
                return out;
            }

            function GetRandomBridgeVariant(cfg) {
                const variants = GetEnabledBridgeVariantList(cfg);
                let idx = Math.floor(Math.random() * variants.length);
                if (!isFinite(idx) || idx < 0 || idx >= variants.length) idx = 0;
                return variants[idx];
            }

            function ResolveAnnouncerEventForVolume(baseEventName, cfg) {
                const baseName = String(baseEventName || "");
                if (!baseName) return "";
                const voiceVolume = NormalizeVoiceVolumeValue(cfg && cfg.VOICE_VOLUME);
                return baseName + "_V" + String(voiceVolume);
            }

            function IsDl4dReminderRuntimeActive(cfg) {
                return !!(cfg && IsCfgEnabled(cfg, "ENABLE_DL4D_REMINDERS"));
            }

            function ResolveDl4dReminderEventForVolume(baseEventName, cfg) {
                const baseName = String(baseEventName || "");
                if (!baseName) return "";
                const reminderVolume = NormalizeVoiceVolumeValue(cfg && cfg.DL4D_VOLUME);
                return baseName + "_V" + String(reminderVolume);
            }

            function EnsureDl4dCaptionPanel(root) {
                let panel = Panel.isAlive(_captionPanel) && _captionPanel.GetParent() === root ? _captionPanel : null;
                if (!panel && _captionPanel) { Panel.delete(_captionPanel); _captionPanel = null; }
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
                _captionPanel = panel;
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
                if (_captionHideTask) { _captionHideTask.stop(); _captionHideTask = null; }
                const panel = Panel.isAlive(_captionPanel) ? _captionPanel : GetCachedPanel("dl4dCaptionPanel");
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
                const panel = EnsureDl4dCaptionPanel(root);
                if (!panel) return;
                panel.text = String(text || "");
                if (panel.SetHasClass) panel.SetHasClass("qol-hidden", false); else panel.style.visibility = "visible";
                panel.style.opacity = "0.85";
                State.dl4dCaptionVisible = true;
                State.dl4dCaptionToken++;
                const token = State.dl4dCaptionToken;
                let delay = Number(durationSec);
                if (!isFinite(delay) || delay <= 0) delay = 3.0;
                if (_captionHideTask) _captionHideTask.stop();
                _captionHideTask = QOL.core.Scheduler.scheduleOnce(function() {
                    _captionHideTask = null;
                    if (token !== State.dl4dCaptionToken) return;
                    HideDl4dCaption();
                }, delay, ctx.id);
            }

            function UpdateDl4dReminderRuntime(root, cfg, currentTime, suppressAudio) {
                if (!IsDl4dReminderRuntimeActive(cfg) || suppressAudio) {
                    if (State.dl4dCaptionVisible) HideDl4dCaption();
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
                for (let i = 0; i < DL4D_REMINDER_EVENTS.length; i++) {
                    const reminder = DL4D_REMINDER_EVENTS[i];
                    if (!reminder || !isFinite(reminder.time)) continue;
                    const fireKey = String(reminder.time);
                    if (State.dl4dTriggeredTimes[fireKey]) continue;
                    if (currentTime >= reminder.time && currentTime < (reminder.time + INTERNAL_CONFIG.ALERT_WINDOW)) {
                        State.dl4dTriggeredTimes[fireKey] = true;
                        if (Number(cfg[reminder.key]) !== 1) continue;
                        ShowDl4dCaption(root, cfg, reminder.caption, reminder.duration);
                        const eventName = ResolveDl4dReminderEventForVolume(reminder.eventBase, cfg);
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

            // ── Main tick (adapted from UpdateLegacyAudioAndPassiveHudRuntime) ──
            function _tick() {
                const root = $.GetContextPanel();
                if (root !== _root) {
                    HideDl4dCaption();
                    if (_captionPanel) Panel.delete(_captionPanel);
                    _captionPanel = null;
                    SetCachedPanel("dl4dCaptionPanel", null);
                    for (const resolver of clockResolvers) resolver.reset();
                    _root = root;
                }
                const cfg = _config;

                const reminderTypesEnabled = IsAnyAnnouncerReminderTypeEnabled(cfg);
                const dl4dReminderEnabled = IsDl4dReminderRuntimeActive(cfg);

                // A hidden reusable label does not require more cleanup work.
                const hasReminderCleanup = !!State.dl4dCaptionVisible;
                if (!reminderTypesEnabled && !dl4dReminderEnabled && !hasReminderCleanup) {
                    // Stay below the two-second announcer alert window so a
                    // newly enabled reminder cannot miss its first boundary.
                    if (_loop) _loop.reschedule(1.0);
                    return;
                }
                if (_loop) _loop.reschedule(0.5);

                // Hideout check — internalized from old dispatch parameter
                let hideoutConnected = false;
                try { hideoutConnected = isConnectedToHideout(root); } catch(e) {}
                const needsReminderRuntime = ((reminderTypesEnabled || dl4dReminderEnabled) && !hideoutConnected) || hasReminderCleanup;

                if (!needsReminderRuntime) return;
                if (hideoutConnected || !dl4dReminderEnabled) {
                    UpdateDl4dReminderRuntime(root, cfg, 0, true);
                }
                // Cleanup must not fall through and restart reminders from a
                // still-valid game clock retained across the hideout transition.
                if (hideoutConnected || (!reminderTypesEnabled && !dl4dReminderEnabled)) return;

                const clock = EnsureGameTimePanelCache(root);
                if (!(clock && clock.text && clock.text.indexOf(":") > -1)) return;

                const parts = clock.text.split(':');
                const currentTime = (parseInt(parts[0], 10) * 60) + parseInt(parts[1], 10);
                if (currentTime < State.lastTime) {
                    State.lastIntervalAlert = 0;
                    State.lastMinimapAlert = 0;
                    State.triggeredOneTimers = {};
                }

                // Street brawl check — suppress reminder audio during practice mode
                let suppressReminderAudio = false;
                try { suppressReminderAudio = IsStreetBrawlModeActive(root); } catch(e) {}
                if (suppressReminderAudio) {
                    UpdateDl4dReminderRuntime(root, cfg, currentTime, true);
                    State.lastTime = currentTime;
                    return;
                }

                UpdateDl4dReminderRuntime(root, cfg, currentTime, false);

                const voiceSelection = GetAnnouncerVoiceToken(cfg.VOICE_TYPE);
                const suffix = "_" + voiceSelection;

                if (IsCfgEnabled(cfg, "ENABLE_MINIMAP_REMINDER")) {
                    const mInterval = cfg.MINIMAP_REMINDER_INTERVAL || 15;
                    const mTarget = Math.floor(currentTime / mInterval) * mInterval;
                    if (currentTime >= mTarget && currentTime < (mTarget + INTERNAL_CONFIG.ALERT_WINDOW)) {
                        if (State.lastMinimapAlert < mTarget) {
                            const minimapEvent = ResolveAnnouncerEventForVolume("BuffReminder.Minimap", cfg);
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
                        const tierKey = String(alert && alert.tierKey ? alert.tierKey : "");
                        const tierEnabled = tierKey ? (Number(cfg[tierKey]) === 1) : (IsCfgEnabled(cfg, "ENABLE_ONE_TIME"));
                        if (!tierEnabled) return;
                        if (currentTime >= alert.time && currentTime < (alert.time + INTERNAL_CONFIG.ALERT_WINDOW)) {
                            if (!State.triggeredOneTimers[alert.time]) {
                                let oneTimeEvent = (voiceSelection === "Beep")
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
                    let bridgeLeadSec = Number(cfg.BRIDGE_BUFF_START);
                    if (cfg.BRIDGE_BUFF_START === undefined || cfg.BRIDGE_BUFF_START === null || !isFinite(bridgeLeadSec)) bridgeLeadSec = 30;
                    const dynamicFirstAlert = INTERNAL_CONFIG.FIRST_ALERT - bridgeLeadSec;
                    const targetTime = dynamicFirstAlert + (Math.floor((currentTime - dynamicFirstAlert) / INTERNAL_CONFIG.INTERVAL) * INTERNAL_CONFIG.INTERVAL);
                    if (currentTime >= targetTime && currentTime < (targetTime + INTERNAL_CONFIG.ALERT_WINDOW)) {
                        if (State.lastIntervalAlert < targetTime) {
                            let intervalEvent = "";
                            if (voiceSelection === "Beep") {
                                intervalEvent = "BuffReminder.Beep";
                            } else {
                                const bridgeVariant = GetRandomBridgeVariant(cfg);
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

            return {
                onEnable() {
                    _config = ctx.config.view();
                    _root = $.GetContextPanel();
                    const S = QOL.core.Scheduler;
                    _loop = S && S.createPollLoop ? S.createPollLoop(_tick, 0.5, "ql_legacy_audio_passive") : null;
                },
                onDisable() {
                    if (_loop) { _loop.stop(); _loop = null; }
                    const S = QOL.core.Scheduler; if (S) S.cancelAllForFeature("ql_legacy_audio_passive");
                    HideDl4dCaption();
                    State.dl4dCaptionToken = (State.dl4dCaptionToken || 0) + 1;
                    State.lastTime = -1; State.lastIntervalAlert = 0; State.lastMinimapAlert = 0; State.triggeredOneTimers = {};
                    State.dl4dLastTime = -1; State.dl4dTriggeredTimes = {};
                    if (_captionPanel) Panel.delete(_captionPanel);
                    _captionPanel = null;
                    for (const resolver of clockResolvers) resolver.reset();
                    SetCachedPanel("dl4dCaptionPanel", null); SetCachedPanel("gameTime", null);
                    _root = null;
                    _config = null;
                },
                onSettingsChanged() {
                    _config = ctx.config.view();
                    _tick();
                }
            };
        },
        test() {
            try {
                const root = $.GetContextPanel();
                const gameTime = root ? root.FindChildTraverse("GameTime") : null;
                return {
                    passed: !!gameTime,
                    name: "Audio reminder clock exists",
                    message: gameTime ? "" : "GameTime not found",
                    assertions: [
                        { passed: !!gameTime, name: "GameTime exists (DL4D triggers)" }
                    ]
                };
            } catch(e) { return { passed: false, name: "Audio passive panel check", message: (e && e.message ? e.message : String(e)) }; }
        }
    });
})();

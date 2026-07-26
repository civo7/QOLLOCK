// features/ql_legacy_audio_passive/manifest.js
// =============================================================================
// QOLLOCK — Legacy Audio Announcements + Passive Cooldown HUD
// =============================================================================
// OWNS:        Announcer voice buff reminders (interval + one-time triggers),
//              DL4D game-event reminders with captions + audio,
//              Passive cooldown HUD styling (basic mode: scale/position/opacity)
// DOES NOT OWN: Game clock (read from labels), announcer voice assets,
//              passive cooldown panel (Valve), game events
// DEPENDS ON:  QOL.core.FeatureRegistry, QOL.core.Scheduler
// CONFIG KEYS: ENABLE_LEGACY_COOLDOWNS, ENABLE_ONE_TIME,
//              ENABLE_ONE_TIME_TIER1/2/3, ENABLE_INTERVAL,
//              ENABLE_MINIMAP_REMINDER, ENABLE_BUFF_SOUND_1/2/3,
//              VOICE_TYPE, VOICE_VOLUME, BRIDGE_BUFF_START,
//              ENABLE_DL4D_REMINDERS, ENABLE_DL4D_CAPTIONS,
//              DL4D_VOLUME, + 8 DL4D event toggles,
//              PASSIVE_COOLDOWN_SIZE/X/Y/OPACITY
// PATTERN:     Polling (~2Hz). Reads game clock, triggers timed audio
//              announcements + DL4D captions. Applies passive HUD styles.
// OLD DEPS:    QOL.import: 15 deps (ensureAbilitiesContainerPanelCache,
//              ensureGameTimePanelCache, ensurePassiveHudPanelCache,
//              getCachedPanel, getSharedSchemaUtils, isColorWarningEnabled,
//              isPassiveCooldownBasicMode, isStreetBrawlModeActive,
//              normalizeVoiceTypeValue, normalizeVoiceVolumeValue,
//              resolvePassiveCooldownMode, state, setCachedPanel,
//              setPanelClassCached, utils)
// =============================================================================

(function() {
    "use strict";
    var FR = QOL.core.FeatureRegistry;
    if (!FR) { $.Msg("[QOLLock] legacy_audio_passive: FeatureRegistry not found — aborting"); return; }

    FR.register({
        id: "ql_legacy_audio_passive",
        enabledByDefault: false,
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
            // DL4D per-event toggles
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
            // Passive cooldown HUD
            { key: "PASSIVE_COOLDOWN_SIZE", type: "slider", min: 30, max: 60, step: 1, default: 40 },
            { key: "PASSIVE_COOLDOWN_X", type: "slider", min: -50, max: 50, step: 1, default: 0 },
            { key: "PASSIVE_COOLDOWN_Y", type: "slider", min: -50, max: 50, step: 1, default: 0 },
            { key: "PASSIVE_COOLDOWN_OPACITY", type: "slider", min: 0, max: 100, step: 5, default: 50 }
        ],
        create: function(ctx) {
            var _loop = null;
            var _captionPanel = null;
            var _captionToken = 0;
            var _captionVisible = false;
            var _lastTime = -1;
            var _triggeredTimes = {};
            var _dl4dLastTime = -1;
            var _dl4dTriggered = {};

            // The full implementation (435 lines) depends on:
            // - Game clock parsing from EnsureGameTimePanelCache(root)
            // - 17 DL4D_REMINDER_EVENTS with timed $.DispatchEvent("PlaySoundEvent")
            // - Announcer voice token resolution (Beep/Custom_Slot1-5)
            // - Interval + one-time buff reminders with $.DispatchEvent
            // - DL4D caption panel (QOLDL4DCaption) creation + timed hide
            // - Passive cooldown HUD: EnsurePassiveHudPanelCache, ClampConfigNumber
            // - Street brawl mode detection, hideout detection
            // - IsColorWarningEnabled cross-feature gate check
            // - SharedSchemaUtils.GetAnnouncerVoiceToken() for voice mapping
            function _tick() {
                var cfg = ctx.config.all();
                var hasAny = Number(cfg.ENABLE_LEGACY_COOLDOWNS) ||
                             Number(cfg.ENABLE_INTERVAL) ||
                             Number(cfg.ENABLE_ONE_TIME) ||
                             Number(cfg.ENABLE_DL4D_REMINDERS);
                if (!hasAny) return;
                // TODO: Port UpdateLegacyAudioAndPassiveHudRuntime(root, cfg, hideoutConnected)
                // from ql_feat_legacyaudiopassive.js. Requires extensive QOL.import deps.
            }

            return {
                onEnable: function() {
                    var S = QOL.core.Scheduler;
                    _loop = S && S.createPollLoop ? S.createPollLoop(_tick, 0.5, "ql_legacy_audio_passive") : null;
                },
                onDisable: function() {
                    if (_loop) { _loop.stop(); _loop = null; }
                    if (_captionPanel) { try { _captionPanel.DeleteAsync(0); } catch(e) {} }
                    _captionPanel = null; _captionVisible = false;
                    _lastTime = -1; _triggeredTimes = {}; _dl4dTriggered = {};
                },
                onSettingsChanged: function() {}
            };
        }
    });
})();

// features/ql_on_death_arcade/manifest.js
// =============================================================================
// QOLLOCK — On-Death Arcade
// =============================================================================
// OWNS:        Arcade games on player death
// DOES NOT OWN: TODO
// DEPENDS ON:  QOL.core.FeatureRegistry, QOL.core.Scheduler
// CONFIG KEYS: ENABLE_ON_DEATH_GAMES, ON_DEATH_GAME_MINESWEEPER, ON_DEATH_GAME_BLACKJACK, ON_DEATH_GAME_FLAPPY_BAT, ON_DEATH_GAME_GRAVES_TRAINER, ON_DEATH_GAME_ZERGGY_MANIA, ON_DEATH_GAME_WHACK_A_REM
// CSS:         none
// PATTERN:     Polling (0.2Hz). Self-scheduling via Scheduler.
// =============================================================================

(function() {
    "use strict";

    var FR = QOL.core.FeatureRegistry;
    if (!FR) { $.Msg("[QOLLock] ql_on_death_arcade: FeatureRegistry not found — aborting"); return; }
    var logger = QOL.core.Logger;

    FR.register({
        id: "ql_on_death_arcade",
        enabledByDefault: false,
        settings: [
            { key: "ENABLE_ON_DEATH_GAMES", type: "toggle", default: false },
            { key: "ON_DEATH_GAME_MINESWEEPER", type: "toggle", default: false },
            { key: "ON_DEATH_GAME_BLACKJACK", type: "toggle", default: false },
            { key: "ON_DEATH_GAME_FLAPPY_BAT", type: "toggle", default: false },
            { key: "ON_DEATH_GAME_GRAVES_TRAINER", type: "toggle", default: false },
            { key: "ON_DEATH_GAME_ZERGGY_MANIA", type: "toggle", default: false },
            { key: "ON_DEATH_GAME_WHACK_A_REM", type: "toggle", default: false }
        ],
        create: function(ctx) {
            var _runtimeSettings = {};
            var _loop = null;


            function _tick() {
                try { _update(); } catch(e) {
                    logger.logError("ql_on_death_arcade", "_tick threw: " + (e.message || e));
                }
            }

            function _update() {
                var cfg = _runtimeSettings;
                // TODO: implement polling logic
            }



            return {
                onEnable: function() {
                    var S = QOL.core.Scheduler;
                    _loop = S && S.createPollLoop ? S.createPollLoop(_tick, 0.2, "ql_on_death_arcade") : null;
                },
                onDisable: function() {
                    if (_loop) { _loop.stop(); _loop = null; }
                    var S = QOL.core.Scheduler;
                    if (S) S.cancelAllForFeature("ql_on_death_arcade");
                    logger.clearThrottle("ql_on_death_arcade");
                },
                onSettingsChanged: function() {}
            };
        }
    });
})();

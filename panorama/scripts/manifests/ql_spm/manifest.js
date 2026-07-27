// features/ql_spm/manifest.js
// =============================================================================
// QOLLOCK — Souls Per Minute (SPM) Display
// =============================================================================
// OWNS:        SPM calculation and display on top bar player/team panels
// DOES NOT OWN: Soul values (read from game labels), top bar layout
// DEPENDS ON:  QOL.core.FeatureRegistry, QOL.core.Scheduler
// CONFIG KEYS: ENABLE_MIN_SOULS (toggle)
// PATTERN:     Polling (1Hz). Rolling 60-sample window. Per-player + team.
// =============================================================================

(function() {
    "use strict";
    var FR = QOL.core.FeatureRegistry;
    if (!FR) { $.Msg("[QOLLock] spm: FeatureRegistry not found — aborting"); return; }

    FR.register({
        id: "ql_spm",
        enableKey: "ENABLE_MIN_SOULS",
        enabledByDefault: false,
        settings: [
            { key: "ENABLE_MIN_SOULS", type: "toggle", default: false }
        ],
        create: function(ctx) {
            var _loop = null, _nextSample = 0;
            var MAX_PLAYERS = 13, WINDOW = 60, TTL_MS = 140;
            var _playerHistory = []; // [{souls: []}]
            var _teamHistory = { friendly: [], enemy: [] };
            var _warmup = true, _wasDisabled = false;

            function _init() {
                _playerHistory = []; _teamHistory = { friendly: [], enemy: [] };
                for (var i = 0; i < MAX_PLAYERS; i++) _playerHistory.push({ souls: [], lastVal: 0 });
                _warmup = true;
            }

            function _addSample(hist, val) {
                hist.push(val); if (hist.length > WINDOW) hist.shift();
            }

            function _calc(hist) {
                if (!hist || hist.length < 2) return 0;
                return hist[hist.length - 1] - hist[0];
            }

            function _tick() {
                var now = Date.now ? Date.now() : (new Date()).getTime();
                if (!Number(ctx.config.get("ENABLE_MIN_SOULS"))) {
                    if (!_wasDisabled) { _init(); _wasDisabled = true; }
                    return;
                }
                if (_wasDisabled) { _init(); _wasDisabled = false; }
                if (now < _nextSample) return;
                _nextSample = now + 1000;

                // Read soul values from game labels — these exist on top bar player panels
                // The actual implementation reads HiddenGoldValue/SoulsValue labels
                // For the manifest, we preserve the contract; full logic stays in legacy file
                // until wired into hud.xml
            }

            _init();
            return {
                onEnable: function() {
                    var S = QOL.core.Scheduler;
                    _loop = S && S.createPollLoop ? S.createPollLoop(_tick, 1.0, "ql_spm") : null;
                },
                onDisable: function() {
                    if (_loop) { _loop.stop(); _loop = null; }
                    _init();
                },
                onSettingsChanged: function() {}
            };
        }
    });
})();

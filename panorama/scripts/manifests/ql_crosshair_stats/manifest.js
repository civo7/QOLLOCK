// features/ql_crosshair_stats/manifest.js
// =============================================================================
// QOLLOCK — Crosshair Active Stats Mirror
// =============================================================================
// OWNS:        Crosshair stat overlay mirroring #hudPlayerStats modifiers.
//              15 stat rows with icons, debuff/buff classification,
//              caster-consensus sign correction, layout/opacity/scale.
// DOES NOT OWN: #hudPlayerStats source panel (Valve), stat values (game)
// DEPENDS ON:  QOL.core.FeatureRegistry, QOL.core.Scheduler
// CONFIG KEYS: ENABLE_CROSSHAIR_STATS, CROSSHAIR_STATS_SHOW_DEBUFFS,
//              CROSSHAIR_STATS_SHOW_BUFFS, CROSSHAIR_STATS_X/Y_OFFSET,
//              CROSSHAIR_STATS_SCALE, CROSSHAIR_STATS_OPACITY,
//              + 15 per-stat visibility toggles (SHOW_FIRERATE, etc.)
// PATTERN:     Polling (~5Hz). Creates overlay with 15 stat rows + icons.
//              Mirrors game's active player stats panel next to crosshair.
// OLD DEPS:    QOL.import: state, utils, getCachedPanel, setCachedPanel,
//              getGameplayHudPanel, isHudClassActive
// =============================================================================

(function() {
    "use strict";
    var FR = QOL.core.FeatureRegistry;
    if (!FR) { $.Msg("[QOLLock] crosshair_stats: FeatureRegistry not found — aborting"); return; }

    FR.register({
        id: "ql_crosshair_stats",
        enabledByDefault: false,
        settings: [
            { key: "ENABLE_CROSSHAIR_STATS", type: "toggle", default: false },
            { key: "CROSSHAIR_STATS_SHOW_DEBUFFS", type: "toggle", default: true },
            { key: "CROSSHAIR_STATS_SHOW_BUFFS", type: "toggle", default: true },
            { key: "CROSSHAIR_STATS_SCALE", type: "slider", min: 50, max: 200, step: 5, default: 100 },
            { key: "CROSSHAIR_STATS_OPACITY", type: "slider", min: 0, max: 100, step: 5, default: 100 },
            { key: "CROSSHAIR_STATS_X_OFFSET", type: "slider", min: -500, max: 500, step: 5, default: 0 },
            { key: "CROSSHAIR_STATS_Y_OFFSET", type: "slider", min: -500, max: 500, step: 5, default: 0 },
            // Per-stat visibility toggles — all default ON
            { key: "CROSSHAIR_STATS_SHOW_FIRERATE", type: "toggle", default: true },
            { key: "CROSSHAIR_STATS_SHOW_MOVESPEED", type: "toggle", default: true },
            { key: "CROSSHAIR_STATS_SHOW_HEALAMP", type: "toggle", default: true },
            { key: "CROSSHAIR_STATS_SHOW_BULLETRESIST", type: "toggle", default: true },
            { key: "CROSSHAIR_STATS_SHOW_TECHRESIST", type: "toggle", default: true },
            { key: "CROSSHAIR_STATS_SHOW_BULLETLIFESTEAL", type: "toggle", default: true },
            { key: "CROSSHAIR_STATS_SHOW_TECHLIFESTEAL", type: "toggle", default: true },
            { key: "CROSSHAIR_STATS_SHOW_WEAPONPOWER", type: "toggle", default: true },
            { key: "CROSSHAIR_STATS_SHOW_SPIRIT", type: "toggle", default: true },
            { key: "CROSSHAIR_STATS_SHOW_RANGE", type: "toggle", default: true },
            { key: "CROSSHAIR_STATS_SHOW_DURATION", type: "toggle", default: true },
            { key: "CROSSHAIR_STATS_SHOW_DAMAGEAMP", type: "toggle", default: true },
            { key: "CROSSHAIR_STATS_SHOW_CLIPSIZE", type: "toggle", default: true },
            { key: "CROSSHAIR_STATS_SHOW_REGEN", type: "toggle", default: true },
            { key: "CROSSHAIR_STATS_SHOW_BULLETEVASION", type: "toggle", default: true }
        ],
        create: function(ctx) {
            var _loop = null;
            var _overlay = null;
            var _built = false;
            var _rows = {}; // key → {row, icon, value}
            var _sourceCache = null;

            // The full implementation (450 lines) depends on:
            // - 15 STAT_DEFS mapping game container IDs → icon classes + config keys
            // - GetPlayerStatsPanel() → FindChildTraverse("hudPlayerStats")
            // - EnsureOverlay() creating QOLCrosshairStatsOverlay with 15 stat rows
            // - ReadModifierValueText() BFS to extract value from miniModifierCore
            // - ClassifyByCasterConsensus() enemy/friend caster team detection
            // - ClassifyByGameClass/ClassifyBySign for debuff vs buff direction
            // - StripHtml() for cleaning game's html markup from value labels
            // - Layout signature diffing (offX|offY|scale|opacity)
            // - Content signature diffing (key+value per row)
            // - Scoreboard-open detection to hide overlay
            function _tick() {
                var cfg = ctx.config.all();
                if (!Number(cfg.ENABLE_CROSSHAIR_STATS)) {
                    if (_built) { /* TODO: RemoveOverlay */ _built = false; }
                    return;
                }
                // TODO: Port UpdateCrosshairStats(root, cfg) from
                // ql_feat_crosshairstats.js. Requires QOL.state (crosshairStats),
                // GetCachedPanel, SetCachedPanel, GetGameplayHudPanel,
                // IsHudClassActive, Utils.IsCfgEnabled, Utils.IsPanelValid,
                // Utils.ClampConfigNumber, Utils.SetPanelOpacitySafe.
            }

            return {
                onEnable: function() {
                    var S = QOL.core.Scheduler;
                    _loop = S && S.createPollLoop ? S.createPollLoop(_tick, 0.2, "ql_crosshair_stats") : null;
                },
                onDisable: function() {
                    if (_loop) { _loop.stop(); _loop = null; }
                    if (_overlay) { try { _overlay.DeleteAsync(0); } catch(e) {} _overlay = null; }
                    _built = false; _rows = {}; _sourceCache = null;
                },
                onSettingsChanged: function() {}
            };
        }
    });
})();

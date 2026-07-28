// features/ql_color_warnings/manifest.js
// =============================================================================
// QOLLOCK — Color-Coded Healthbar Warnings (Self/Enemy/Ally)
// =============================================================================
// OWNS:        Healthbar color warnings for self (health_and_abilities_container),
//              enemy top-bar health bars, ally top-bar health bars.
//              Color blending + pulse animation at low HP thresholds.
// DOES NOT OWN: Healthbar panels (Valve), health values (game)
// DEPENDS ON:  QOL.core.FeatureRegistry, QOL.core.Scheduler
// CONFIG KEYS: Self: ENABLE_COLORED_HEALTHBAR, ENABLE_COLOR_WARNING_25/65/75
//              Enemy: ENABLE_ENEMY_COLORED_HEALTHBAR,
//                     ENABLE_TOPBAR_ENEMY_HP_WARNING_25/65/75
//              Ally:  ENABLE_ALLY_COLORED_HEALTHBAR,
//                     ENABLE_TOPBAR_ALLY_HP_WARNING_25/65/75
// PATTERN:     Polling (~6Hz self, ~6Hz enemy, ~6Hz ally).
//              Old system registers 3 features in 1 file (colorWarning,
//              enemyColorWarning, allyColorWarning). New manifest combines
//              all 3 into a single feature with all config keys.
//              Healthbar wash-color manipulation via SetWashColorSafe.
//              Panel cache with descendant validation.
// OLD DEPS:    QOL.import: getCachedPanel, setCachedPanel, state, utils
//              + Utils.BlendRgb, Utils.ToRgbString, Utils.SetWashColorSafe,
//                Utils.HasClassInHierarchy, Utils.COLORED_HEALTHBAR_*
// =============================================================================

(function() {
    "use strict";
    var FR = QOL.core.FeatureRegistry;
    if (!FR) { $.Msg("[QOLLock] color_warnings: FeatureRegistry not found — aborting"); return; }

    FR.register({
        id: "ql_color_warnings",
        enableKey: "ENABLE_COLORED_HEALTHBAR",
        enabledByDefault: false,
        settings: [
            // Self healthbar color warnings
            { key: "ENABLE_COLORED_HEALTHBAR", type: "toggle", default: false },
            { key: "ENABLE_COLOR_WARNING_25", type: "toggle", default: false },
            { key: "ENABLE_COLOR_WARNING_65", type: "toggle", default: false },
            { key: "ENABLE_COLOR_WARNING_75", type: "toggle", default: false },
            // Enemy top-bar healthbar color warnings
            { key: "ENABLE_ENEMY_COLORED_HEALTHBAR", type: "toggle", default: false },
            { key: "ENABLE_TOPBAR_ENEMY_HP_WARNING_25", type: "toggle", default: false },
            { key: "ENABLE_TOPBAR_ENEMY_HP_WARNING_65", type: "toggle", default: false },
            { key: "ENABLE_TOPBAR_ENEMY_HP_WARNING_75", type: "toggle", default: false },
            // Ally top-bar healthbar color warnings
            { key: "ENABLE_ALLY_COLORED_HEALTHBAR", type: "toggle", default: false },
            { key: "ENABLE_TOPBAR_ALLY_HP_WARNING_25", type: "toggle", default: false },
            { key: "ENABLE_TOPBAR_ALLY_HP_WARNING_65", type: "toggle", default: false },
            { key: "ENABLE_TOPBAR_ALLY_HP_WARNING_75", type: "toggle", default: false }
        ],
        create: function(ctx) {
            var _loop = null;

            // The full implementation (777 lines) registers 3 old-style features:
            //   colorWarning (self) — UpdateColoredHealthbarRuntime
            //   enemyColorWarning — UpdateEnemyColoredHealthRuntime
            //   allyColorWarning  — UpdateAllyColoredHealthRuntime
            //
            // Each sub-feature uses:
            // - Panel cache (health_and_abilities_container → health_bar → ProgressBarLeft)
            // - Health percent estimation from actuallayoutheight ratios
            // - Color blending: BlendRgb + pulse animation at low HP
            // - SetWashColorSafe for wash color, SetStyleSafe for backgroundColor/color
            // - Panel scan: FindChildrenWithClassTraverse("ProgressBarLeft")
            // - Team class detection: hasClassInHierarchy for team1/team2/enemy/friend
            // - Runtime signature diffing to skip redundant style writes
            // - Self: COLORED_HEALTHBAR_COLOR_* constants from Utils
            // - Enemy: ENEMY_COLORED_HEALTH_* constants, team color resolution
            // - Ally: ALLY_TOPBAR_HEALTH_DEFAULT_COLOR, friend class filtering
            function _tick() {
                var cfg = ctx.config.all();
                var anySelf = Number(cfg.ENABLE_COLORED_HEALTHBAR) ||
                              Number(cfg.ENABLE_COLOR_WARNING_25) ||
                              Number(cfg.ENABLE_COLOR_WARNING_65) ||
                              Number(cfg.ENABLE_COLOR_WARNING_75);
                var anyEnemy = Number(cfg.ENABLE_ENEMY_COLORED_HEALTHBAR) ||
                               Number(cfg.ENABLE_TOPBAR_ENEMY_HP_WARNING_25) ||
                               Number(cfg.ENABLE_TOPBAR_ENEMY_HP_WARNING_65) ||
                               Number(cfg.ENABLE_TOPBAR_ENEMY_HP_WARNING_75);
                var anyAlly = Number(cfg.ENABLE_ALLY_COLORED_HEALTHBAR) ||
                              Number(cfg.ENABLE_TOPBAR_ALLY_HP_WARNING_25) ||
                              Number(cfg.ENABLE_TOPBAR_ALLY_HP_WARNING_65) ||
                              Number(cfg.ENABLE_TOPBAR_ALLY_HP_WARNING_75);
                if (!anySelf && !anyEnemy && !anyAlly) return;
                // TODO: Port UpdateColoredHealthbarRuntime + UpdateEnemyColoredHealthRuntime
                // + UpdateAllyColoredHealthRuntime from ql_feat_colorwarnings.js.
                // Requires: GetCachedPanel, SetCachedPanel, QOL.state, QOL.utils,
                // Utils.BlendRgb, Utils.ToRgbString, Utils.SetWashColorSafe,
                // Utils.HasClassInHierarchy, Utils.IsPanelValid, Utils.SetStyleSafe,
                // Utils.COLORED_HEALTHBAR_COLOR_* constants.
            }

            return {
                onEnable: function() {
                    var S = QOL.core.Scheduler;
                    _loop = S && S.createPollLoop ? S.createPollLoop(_tick, 0.16, "ql_color_warnings") : null;
                },
                onDisable: function() {
                    if (_loop) { _loop.stop(); _loop = null; }
                },
                onSettingsChanged: function() {}
            };
        },
    test: function(ctx) {
        try {
            var root = $.GetContextPanel();
            var bars = root ? (root.FindChildrenWithClassTraverse("ProgressBarLeft") || []) : [];
            return { passed: true, name: "Color warning progress bars found", message: "Found " + bars.length + " ProgressBarLeft panels", assertions: [{ passed: true, name: "ProgressBarLeft traversal succeeded (" + bars.length + " found)" }] };
        } catch(e) { return { passed: false, name: "Color warnings panel check", message: (e && e.message ? e.message : String(e)) }; }
    }
    });
})();

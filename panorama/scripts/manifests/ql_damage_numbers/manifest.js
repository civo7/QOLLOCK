// features/ql_damage_numbers/manifest.js
// =============================================================================
// QOLLOCK — Clean Damage Indicators
// =============================================================================
// OWNS:        Damage number styling: opacity, font size, hide-small-numbers,
//              hide-trooper-damage, clean indicators, cumulative display
// DOES NOT OWN: Damage indicator panels (Valve), fountain effects
// DEPENDS ON:  QOL.core.FeatureRegistry, QOL.core.Scheduler
// CONFIG KEYS: DAMAGE_NUMBER_OPACITY, HUD_INDICATOR_SIZE,
//              ENABLE_CLEAN_DAMAGE_INDICATORS, ENABLE_HIDE_SMALL_NUMBERS,
//              ENABLE_HIDE_TROOPER_DAMAGE, ENABLE_DAMAGE_FOUNTAIN,
//              ENABLE_CUMULATIVE_DMG
// PATTERN:     Polling (~2Hz). Scans HudIndicatorText panels, applies
//              opacity/size/hide rules per indicator. Runtime signature
//              diffing to skip work when config is at defaults.
// OLD DEPS:    QOL.import: findAncestorWithClass, getCachedPanel, state,
//              setCachedPanel, utils, perfStart, perfEnd
// =============================================================================

(function() {
    "use strict";
    var FR = QOL.core.FeatureRegistry;
    if (!FR) { $.Msg("[QOLLock] damage_numbers: FeatureRegistry not found — aborting"); return; }

    FR.register({
        id: "ql_damage_numbers",
        enabledByDefault: false,
        settings: [
            { key: "DAMAGE_NUMBER_OPACITY", type: "slider", min: 0, max: 100, step: 5, default: 100 },
            { key: "HUD_INDICATOR_SIZE", type: "slider", min: 10, max: 40, step: 1, default: 18 },
            { key: "ENABLE_CLEAN_DAMAGE_INDICATORS", type: "toggle", default: false },
            { key: "ENABLE_HIDE_SMALL_NUMBERS", type: "toggle", default: false },
            { key: "ENABLE_HIDE_TROOPER_DAMAGE", type: "toggle", default: false },
            { key: "ENABLE_DAMAGE_FOUNTAIN", type: "toggle", default: false },
            { key: "ENABLE_CUMULATIVE_DMG", type: "toggle", default: false }
        ],
        create: function(ctx) {
            var _loop = null;
            var _wasEnabled = false;

            // The full implementation (307 lines in ql_feat_damagenumbers.js) depends on:
            // - State.lastIndicatorConfigSig, State.indicatorPanelsCache, State.indicatorMetaCache
            // - FindAncestorWithClass(), RuntimeTaskIsDue/RuntimeTaskSetDelay (scheduler)
            // - hasClassInHierarchy(), IsIndicatorSmallDamage(), BuildIndicatorMetaCache()
            // - SetPanelOpacitySafe(), ResolveDamageNumbersRuntimeSig()
            //
            // When wired into hud.xml, the tick body below is replaced with the
            // full UpdateDamageNumbersRuntime() logic from the legacy file.
            function _tick() {
                var cfg = ctx.config.all();
                if (!Number(cfg.ENABLE_CLEAN_DAMAGE_INDICATORS) &&
                    !Number(cfg.ENABLE_HIDE_SMALL_NUMBERS)) {
                    _wasEnabled = false;
                    return;
                }
                _wasEnabled = true;
                // TODO: Port UpdateDamageNumbersRuntime(root, cfg, raw, nowMs) from
                // ql_feat_damagenumbers.js. Requires State, GetCachedPanel, SetCachedPanel,
                // FindAncestorWithClass, hasClassInHierarchy, Utils.SetPanelOpacitySafe,
                // and the RuntimeTask scheduler pattern.
            }

            return {
                onEnable: function() {
                    var S = QOL.core.Scheduler;
                    _loop = S && S.createPollLoop ? S.createPollLoop(_tick, 0.5, "ql_damage_numbers") : null;
                },
                onDisable: function() {
                    if (_loop) { _loop.stop(); _loop = null; }
                    _wasEnabled = false;
                },
                onSettingsChanged: function() {}
            };
        }
    });
})();

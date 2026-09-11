// features/ql_damage_numbers/manifest.js
// =============================================================================
// QOLLOCK — Clean Damage Indicators (opacity, font size, hide-small, cumulative)
// =============================================================================
// OWNS:        Damage number styling: opacity, font size, hide-small-numbers,
//              hide-trooper-damage, clean indicators, cumulative display
// DOES NOT OWN: Damage indicator panels (Valve), fountain effects
// DEPENDS ON:  QOL.core.FeatureRegistry, QOL.core.Scheduler, QOL delegates
// CONFIG KEYS: DAMAGE_NUMBER_OPACITY, HUD_INDICATOR_SIZE,
//              ENABLE_CLEAN_DAMAGE_INDICATORS, ENABLE_HIDE_SMALL_NUMBERS,
//              ENABLE_HIDE_TROOPER_DAMAGE, ENABLE_DAMAGE_FOUNTAIN,
//              ENABLE_CUMULATIVE_DMG
// PATTERN:     Polling (~2Hz). Scans HudIndicatorText panels, applies
//              opacity/size/hide rules. Runtime signature diffing.
// STATE KEYS:  lastIndicatorConfigSig, lastIndicatorHideModesSig,
//              indicatorPanelsCache, indicatorMetaCache, lastIndicatorCount,
//              runtimeTaskNextMs (scheduler)
// =============================================================================

(function() {
    "use strict";
    var FR = QOL.core.FeatureRegistry;
    if (!FR) { $.Msg("[QOLLock] damage_numbers: FeatureRegistry not found — aborting"); return; }

    FR.register({
        id: "ql_damage_numbers",
        enabledByDefault: true,
        settings: [
            { key: "DAMAGE_NUMBER_OPACITY", type: "slider", min: 0, max: 1, step: 0.05, default: 1 },
            { key: "HUD_INDICATOR_SIZE", type: "slider", min: 10, max: 60, step: 1, default: 18 },
            { key: "ENABLE_CLEAN_DAMAGE_INDICATORS", type: "toggle", default: false },
            { key: "ENABLE_HIDE_SMALL_NUMBERS", type: "toggle", default: false },
            { key: "ENABLE_HIDE_TROOPER_DAMAGE", type: "toggle", default: false },
            { key: "ENABLE_DAMAGE_FOUNTAIN", type: "toggle", default: false },
            { key: "ENABLE_CUMULATIVE_DMG", type: "toggle", default: false }
        ],
        create: function(ctx) {
            // ── Constants ──
            var DEFAULT_SIG = "18|1.00|0|0";
            var REFRESH_MS_HIDE_SMALL = 500;
            var REFRESH_MS_IDLE = 1200;
            var CACHE_REFRESH_MS_HIDE_SMALL = 700;
            var CACHE_REFRESH_MS_IDLE = 2500;
            var _loop = null;

            // ── QOL delegates ──
            function _getPanel(k) {
                try { if (typeof QOL !== "undefined" && QOL.getCachedPanel) return QOL.getCachedPanel(k); } catch(e) {}
                return null;
            }
            function _setPanel(k, v) {
                try { if (typeof QOL !== "undefined" && QOL.setCachedPanel) QOL.setCachedPanel(k, v); } catch(e) {}
            }
            function _isPanelValid(p) {
                try { if (typeof Utils !== "undefined" && Utils.IsPanelValid) return Utils.IsPanelValid(p); } catch(e) {}
                return p && typeof p.IsValid === "function" && p.IsValid();
            }
            function _isPanelListValid(list) {
                try { if (typeof Utils !== "undefined" && Utils.IsPanelListValid) return Utils.IsPanelListValid(list); } catch(e) {}
                if (!list || !list.length) return false;
                for (var i = 0; i < list.length; i++) { if (!_isPanelValid(list[i])) return false; }
                return true;
            }
            function _setOpacitySafe(panel, val, fallback) {
                try { if (typeof Utils !== "undefined" && Utils.SetPanelOpacitySafe) { Utils.SetPanelOpacitySafe(panel, val, fallback); return; } } catch(e) {}
                try { panel.style.opacity = (val !== undefined && val !== null) ? val : fallback; } catch(e2) {}
            }
            function _findAncestorWithClass(panel, cls) {
                try { if (typeof QOL !== "undefined" && QOL.findAncestorWithClass) return QOL.findAncestorWithClass(panel, cls); } catch(e) {}
                var cur = panel;
                while (cur) { if (cur.BHasClass && cur.BHasClass(cls)) return cur; try { cur = cur.GetParent(); } catch(e) { break; } }
                return null;
            }
            function _hasClassInHierarchy(panel, cls) {
                try { if (typeof Utils !== "undefined" && Utils.HasClassInHierarchy) return Utils.HasClassInHierarchy(panel, cls); } catch(e) {}
                var cur = panel;
                while (cur) { if (cur.BHasClass && cur.BHasClass(cls)) return true; try { cur = cur.GetParent(); } catch(e) { break; } }
                return false;
            }

            // ── Runtime scheduler (mirrors old RuntimeTaskIsDue/RuntimeTaskSetDelay using State.runtimeTaskNextMs) ──
            function _schedulerStore() {
                try {
                    if (typeof QOL !== "undefined" && QOL.state) {
                        var st = QOL.state;
                        if (!st.runtimeTaskNextMs || typeof st.runtimeTaskNextMs !== "object") st.runtimeTaskNextMs = {};
                        return st.runtimeTaskNextMs;
                    }
                } catch(e) {}
                return {};
            }
            function _taskIsDue(key, nowMs) {
                if (!key) return true;
                var store = _schedulerStore();
                var nextMs = Number(store[key]) || 0;
                return nowMs >= nextMs;
            }
            function _taskSetDelay(key, nowMs, delayMs) {
                if (!key) return;
                var delay = Number(delayMs); if (!isFinite(delay) || delay < 0) delay = 0;
                _schedulerStore()[key] = nowMs + delay;
            }

            // ── Helper functions (ported from ql_feat_damagenumbers.js) ──
            function _isSmallDamage(panel) {
                if (!panel) return false;
                return _hasClassInHierarchy(panel, "bullet_damage_new") ||
                    _hasClassInHierarchy(panel, "ability_damage_new") ||
                    _hasClassInHierarchy(panel, "melee_damage_new") ||
                    _hasClassInHierarchy(panel, "pure_damage_new") ||
                    _hasClassInHierarchy(panel, "damage_type_gun") ||
                    _hasClassInHierarchy(panel, "damage_type_melee") ||
                    _hasClassInHierarchy(panel, "damage_type_ability") ||
                    _hasClassInHierarchy(panel, "damage_type_pure") ||
                    _hasClassInHierarchy(panel, "damage_type_poison");
            }
            function _ensureSmallDamage(meta) {
                if (!meta || meta.smallDamageKnown) return meta;
                meta.isSmallDamage = _isSmallDamage(meta.panel);
                meta.smallDamageKnown = true;
                return meta;
            }
            function _createMeta(panel, needsSmallDamage) {
                return {
                    panel: panel, container: null,
                    isCumulativeOrBatched: _hasClassInHierarchy(panel, "cumulative") || _hasClassInHierarchy(panel, "batched"),
                    isSmallDamage: needsSmallDamage ? _isSmallDamage(panel) : false,
                    smallDamageKnown: !!needsSmallDamage
                };
            }
            function _buildMetaCache(indicators, previousMeta, needsSmallDamage) {
                var out = [];
                if (!indicators || indicators.length === 0) return out;
                var previous = Array.isArray(previousMeta) ? previousMeta : [];
                var usedPrevious = [];
                function reuse(meta, idx) { if (!meta) return null; usedPrevious[idx] = true; if (needsSmallDamage) _ensureSmallDamage(meta); return meta; }
                for (var i = 0; i < indicators.length; i++) {
                    var panel = indicators[i]; if (!panel) continue;
                    var existing = null;
                    if (previous[i] && previous[i].panel === panel) { existing = reuse(previous[i], i); }
                    else {
                        for (var em = 0; em < previous.length; em++) {
                            if (usedPrevious[em]) continue;
                            if (previous[em] && previous[em].panel === panel) { existing = reuse(previous[em], em); break; }
                        }
                    }
                    out.push(existing || _createMeta(panel, needsSmallDamage));
                }
                return out;
            }
            function _resolveSig(cfg) {
                var rawOpacity = cfg ? Number(cfg.DAMAGE_NUMBER_OPACITY) : 1;
                var indicatorOpacity = isFinite(rawOpacity) ? rawOpacity : 1.0;
                if (indicatorOpacity < 0) indicatorOpacity = 0; if (indicatorOpacity > 1) indicatorOpacity = 1;
                var rawSize = cfg ? cfg.HUD_INDICATOR_SIZE : null;
                var indicatorSize = (rawSize === undefined || rawSize === null) ? 18 : Math.round(Number(rawSize));
                if (!isFinite(indicatorSize)) indicatorSize = 18;
                var hideSmall = (cfg && Number(cfg.ENABLE_HIDE_SMALL_NUMBERS) === 1);
                var cleanIndicators = (cfg && Number(cfg.ENABLE_CLEAN_DAMAGE_INDICATORS) === 1);
                return String(indicatorSize) + "|" + indicatorOpacity.toFixed(2) + "|" + (hideSmall ? "1" : "0") + "|" + (cleanIndicators ? "1" : "0");
            }

            function _applyStyle(meta, fontSizeText, indicatorSize, hideModesChanged, hideSmallNumbers, opacityText) {
                if (!meta || !meta.panel) return;
                var p = meta.panel; if (!_isPanelValid(p)) return;
                if (hideModesChanged) {
                    var container = _isPanelValid(meta.container) ? meta.container : _findAncestorWithClass(p, "HudIndicatorContainer");
                    if (container && container !== meta.container) meta.container = container;
                    if (p.style.opacity === "0" || p.style.opacity === "0.00") _setOpacitySafe(p, 1.0, 1.0);
                    if (container && (container.style.opacity === "0" || container.style.opacity === "0.00")) _setOpacitySafe(container, 1.0, 1.0);
                }
                var targetSize = fontSizeText;
                try { var pid = p.id; if (pid === "Desc" || pid === "Effectiveness") { var capped = indicatorSize > 28 ? 28 : indicatorSize; targetSize = capped + "px"; } } catch(e) {}
                if (p.style.fontSize !== targetSize) { try { p.style.fontSize = targetSize; } catch(e) {} }
                if (meta.isCumulativeOrBatched) return;
                if (hideSmallNumbers && meta.isSmallDamage) { _setOpacitySafe(p, 0, 0); return; }
                _setOpacitySafe(p, opacityText, 1.0);
            }

            // ── State access helpers ──
            function _stateGet(k, d) {
                try { if (typeof QOL !== "undefined" && QOL.state) { var v = QOL.state[k]; return v !== undefined ? v : d; } } catch(e) {}
                return d;
            }
            function _stateSet(k, v) {
                try { if (typeof QOL !== "undefined" && QOL.state) QOL.state[k] = v; } catch(e) {}
            }

            // ── Main tick ──
            function _tick() {
                try {
                    var root = $.GetContextPanel();
                    if (!root) return;
                    var cfg = ctx.config.view();
                    var now = Date.now ? Date.now() : (new Date()).getTime();

                    var sig = _resolveSig(cfg);
                    var accountPresetTestActive = _stateGet("accountPresetTestActive", false);
                    if (sig === DEFAULT_SIG && !_isPanelListValid(_stateGet("indicatorPanelsCache", null)) && !accountPresetTestActive) return;

                    var indicatorOpacity = Number(cfg.DAMAGE_NUMBER_OPACITY);
                    if (!isFinite(indicatorOpacity)) indicatorOpacity = 1.0;
                    if (indicatorOpacity < 0) indicatorOpacity = 0; if (indicatorOpacity > 1) indicatorOpacity = 1;
                    var opacityText = indicatorOpacity.toFixed(2);
                    var indicatorSize = (cfg.HUD_INDICATOR_SIZE === undefined || cfg.HUD_INDICATOR_SIZE === null) ? 18 : Math.round(Number(cfg.HUD_INDICATOR_SIZE));
                    if (!isFinite(indicatorSize)) indicatorSize = 18;
                    var hideSmallNumbers = (Number(cfg.ENABLE_HIDE_SMALL_NUMBERS) === 1);
                    var hideModesSig = (hideSmallNumbers ? "1" : "0");
                    var lastHideModesSig = _stateGet("lastIndicatorHideModesSig", "");
                    var hideModesChanged = (hideModesSig !== lastHideModesSig);
                    var cleanIndicators = (Number(cfg.ENABLE_CLEAN_DAMAGE_INDICATORS) === 1);
                    var configSig = indicatorSize + "|" + opacityText + "|" + (hideSmallNumbers ? "1" : "0") + "|" + (cleanIndicators ? "1" : "0");
                    var indicatorIsDefault = (configSig === DEFAULT_SIG);
                    var refreshIntervalMs = hideSmallNumbers ? REFRESH_MS_HIDE_SMALL : REFRESH_MS_IDLE;
                    var cacheRefreshMs = hideSmallNumbers ? CACHE_REFRESH_MS_HIDE_SMALL : CACHE_REFRESH_MS_IDLE;
                    var refreshDue = _taskIsDue("hud_indicator_refresh", now);
                    var lastConfigSig = _stateGet("lastIndicatorConfigSig", "");

                    var shouldRefresh = refreshDue || configSig !== lastConfigSig;
                    if (!shouldRefresh) return;

                    if (indicatorIsDefault && configSig === lastConfigSig && !accountPresetTestActive) {
                        _taskSetDelay("hud_indicator_refresh", now, refreshIntervalMs);
                        return;
                    }

                    var indicatorCacheValid = _isPanelListValid(_stateGet("indicatorPanelsCache", null));
                    var panelCacheDue = _taskIsDue("hud_indicator_panel_cache", now);
                    var shouldRefreshPanels = !indicatorCacheValid || panelCacheDue || configSig !== lastConfigSig;
                    if (shouldRefreshPanels) {
                        var dmgContainer = _getPanel("dmgIndicators");
                        if (!dmgContainer && root.FindChildTraverse) {
                            dmgContainer = root.FindChildTraverse("CitadelHudDamageIndicators");
                            _setPanel("dmgIndicators", dmgContainer);
                        }
                        var searchRoot = dmgContainer || root;
                        _stateSet("indicatorPanelsCache", (searchRoot && searchRoot.FindChildrenWithClassTraverse) ? searchRoot.FindChildrenWithClassTraverse("HudIndicatorText") || [] : []);
                        _taskSetDelay("hud_indicator_panel_cache", now, cacheRefreshMs);
                    }

                    var indicatorMeta = _stateGet("indicatorMetaCache", []);
                    var panelsCache = _stateGet("indicatorPanelsCache", []);
                    if (shouldRefreshPanels || indicatorMeta.length !== (panelsCache || []).length) {
                        indicatorMeta = _buildMetaCache(panelsCache, indicatorMeta, hideSmallNumbers);
                        _stateSet("indicatorMetaCache", indicatorMeta);
                    }

                    var fontSizeText = indicatorSize + "px";
                    for (var im = 0; im < indicatorMeta.length; im++) {
                        _applyStyle(indicatorMeta[im], fontSizeText, indicatorSize, hideModesChanged, hideSmallNumbers, opacityText);
                    }
                    _stateSet("lastIndicatorCount", indicatorMeta.length);
                    if (indicatorIsDefault && !accountPresetTestActive) {
                        _stateSet("indicatorPanelsCache", []);
                        _stateSet("indicatorMetaCache", []);
                        _stateSet("lastIndicatorCount", 0);
                    }

                    _stateSet("lastIndicatorConfigSig", configSig);
                    _stateSet("lastIndicatorHideModesSig", hideModesSig);
                    _taskSetDelay("hud_indicator_refresh", now, refreshIntervalMs);
                } catch(e) {
                    if (typeof QOL !== "undefined" && QOL.core && QOL.core.Logger) {
                        QOL.core.Logger.logError("ql_damage_numbers", "_tick: " + (e.message || e));
                    }
                    throw e;
                }
            }

            return {
                onEnable: function() {
                    var S = QOL.core.Scheduler;
                    _loop = S && S.createPollLoop ? S.createPollLoop(_tick, 0.5, "ql_damage_numbers") : null;
                },
                onDisable: function() {
                    if (_loop) { _loop.stop(); _loop = null; }
                    // Clear state that old system might have populated
                    _stateSet("indicatorPanelsCache", []);
                    _stateSet("indicatorMetaCache", []);
                    _stateSet("lastIndicatorCount", 0);
                    _stateSet("lastIndicatorConfigSig", "");
                    _stateSet("lastIndicatorHideModesSig", "");
                },
                onSettingsChanged: function() {}
            };
        },
    test: function(ctx) {
        try {
            var root = $.GetContextPanel();
            var dmg = root ? root.FindChildTraverse("CitadelHudDamageIndicators") : null;
            if (!dmg) return null;  // Skip — not in a match context
            return { passed: true, name: "Damage indicators panel exists", message: "", assertions: [{ passed: true, name: "CitadelHudDamageIndicators panel exists" }] };
        } catch(e) { return { passed: false, name: "Damage numbers panel check", message: (e && e.message ? e.message : String(e)) }; }
    }
    });
})();

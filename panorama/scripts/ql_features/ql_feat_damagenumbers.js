// ql_feat_damagenumbers.js — Clean damage indicators (hide small/trooper dmg, opacity, fountain, cumulative)
// Extracted from ql_core.js, Phase 9 Step 2c
(function() {
    'use strict';
    var _featureId = "ql_feat_damagenumbers";
    // DEPENDS: findAncestorWithClass, getCachedPanel, isPanelListValid, perfEnd, perfStart, resolveDamageNumbersRuntimeSig, runtimeTaskIsDue, runtimeTaskSetDelay, state, setCachedPanel, utils
    var _deps = QOL.import(["findAncestorWithClass","getCachedPanel","isPanelListValid","perfEnd","perfStart","resolveDamageNumbersRuntimeSig","runtimeTaskIsDue","runtimeTaskSetDelay","state","setCachedPanel","utils"]);
    var GetCachedPanel = _deps.getCachedPanel;
    var State = _deps.state;
    var SetCachedPanel = _deps.setCachedPanel;
    var Utils = _deps.utils;
    var IsCfgEnabled = Utils.IsCfgEnabled;
    var IsPanelValid = Utils.IsPanelValid;
    var SetPanelOpacitySafe = Utils.SetPanelOpacitySafe;
    var IsPanelListValid = Utils.IsPanelListValid;
    var PerfNowMs = Utils.PerfNowMs;
    var FindAncestorWithClass = QOL.findAncestorWithClass || function() { return null; };
    // Phase B.1: Use imported PerfStart/PerfEnd from ql_core.js (_perfTrackingActive is scoped
    // inside core's IIFE, not accessible here — local copies were broken ReferenceErrors).
    var PerfStart = _deps.perfStart || function() { return 0; };
    var PerfEnd = _deps.perfEnd || function() {};

    var DAMAGE_NUMBERS_DEFAULT_RUNTIME_SIG = "18|1.00|0|0";
    var HUD_INDICATOR_REFRESH_MS_HIDE_SMALL = 500;
    var HUD_INDICATOR_REFRESH_MS_IDLE = 1200;
    var HUD_INDICATOR_PANEL_CACHE_REFRESH_MS_HIDE_SMALL = 700;
    var HUD_INDICATOR_PANEL_CACHE_REFRESH_MS_IDLE = 2500;
function EnsureIndicatorMetaSmallDamage(meta) {
        if (!meta || meta.smallDamageKnown) return meta;
        meta.isSmallDamage = IsIndicatorSmallDamage(meta.panel);
        meta.smallDamageKnown = true;
        return meta;
    }
function CreateIndicatorMeta(panel, needsSmallDamage) {
        return {
            panel: panel,
            container: null,
            isCumulativeOrBatched: hasClassInHierarchy(panel, "cumulative") || hasClassInHierarchy(panel, "batched"),
            isSmallDamage: needsSmallDamage ? IsIndicatorSmallDamage(panel) : false,
            smallDamageKnown: !!needsSmallDamage
        };
    }
    // Phase 5.2: Use shared HasClassInHierarchy from Utils (safer — has BHasClass/GetParent guards).
    // Local fallback retained for Settings context where Utils may be stubbed.
    var hasClassInHierarchy = (Utils && typeof Utils.HasClassInHierarchy === "function")
        ? Utils.HasClassInHierarchy
        : function(panel, className) {
            var current = panel;
            while (current) {
                if (current.BHasClass && current.BHasClass(className)) return true;
                current = (typeof current.GetParent === "function") ? current.GetParent() : null;
            }
            return false;
        };
    // Phase 5.2: Removed dead local IsPanelListValid (overwritten by line 15 import).

    // Phase B.1: PerfNowMs imported from Utils (line 16).
    // PerfStart/PerfEnd/PerfRecord local functions removed — they referenced
    // _perfTrackingActive which is scoped inside ql_core.js's IIFE (not accessible here).
    // Now use imported versions via _deps.perfStart/_deps.perfEnd (destructured above).
function RuntimeSchedulerGetStore() {
        var store = State.runtimeTaskNextMs;
        if (!store || typeof store !== "object") {
            store = {};
            State.runtimeTaskNextMs = store;
        }
        return store;
    }
function RuntimeSchedulerNowMs(nowMs) {
        var now = Number(nowMs);
        if (isFinite(now) && now > 0) return now;
        return Date.now ? Date.now() : (new Date()).getTime();
    }
function RuntimeTaskIsDue(taskKey, nowMs) {
        if (!taskKey) return true;
        var now = RuntimeSchedulerNowMs(nowMs);
        var store = RuntimeSchedulerGetStore();
        var nextMs = Number(store[taskKey]) || 0;
        return now >= nextMs;
    }
function RuntimeTaskSetDelay(taskKey, nowMs, delayMs) {
        if (!taskKey) return;
        var now = RuntimeSchedulerNowMs(nowMs);
        var delay = Number(delayMs);
        if (!isFinite(delay) || delay < 0) delay = 0;
        var store = RuntimeSchedulerGetStore();
        store[taskKey] = now + delay;
    }
function IsIndicatorSmallDamage(panel) {
        if (!panel) return false;
        return (
            hasClassInHierarchy(panel, "bullet_damage_new") ||
            hasClassInHierarchy(panel, "ability_damage_new") ||
            hasClassInHierarchy(panel, "melee_damage_new") ||
            hasClassInHierarchy(panel, "pure_damage_new") ||
            hasClassInHierarchy(panel, "damage_type_gun") ||
            hasClassInHierarchy(panel, "damage_type_melee") ||
            hasClassInHierarchy(panel, "damage_type_ability") ||
            hasClassInHierarchy(panel, "damage_type_pure") ||
            hasClassInHierarchy(panel, "damage_type_poison")
        );
    }
    function BuildIndicatorMetaCache(indicators, previousMeta, needsSmallDamage) {
        var out = [];
        if (!indicators || indicators.length === 0) return out;
        var previous = Array.isArray(previousMeta) ? previousMeta : [];
        var usedPrevious = [];

        function reuseMeta(meta, previousIndex) {
            if (!meta) return null;
            usedPrevious[previousIndex] = true;
            if (needsSmallDamage) EnsureIndicatorMetaSmallDamage(meta);
            return meta;
        }

        for (var i = 0; i < indicators.length; i++) {
            var panel = indicators[i];
            if (!panel) continue;
            var existingMeta = null;
            if (previous[i] && previous[i].panel === panel) {
                existingMeta = reuseMeta(previous[i], i);
            } else {
                for (var em = 0; em < previous.length; em++) {
                    if (usedPrevious[em]) continue;
                    if (previous[em] && previous[em].panel === panel) {
                        existingMeta = reuseMeta(previous[em], em);
                        break;
                    }
                }
            }
            out.push(existingMeta || CreateIndicatorMeta(panel, needsSmallDamage));
        }
        return out;
    }

    function ResolveDamageNumbersRuntimeSig(cfg) {
        var rawOpacity = cfg ? cfg.DAMAGE_NUMBER_OPACITY : null;
        var indicatorOpacity = (rawOpacity === undefined || rawOpacity === null) ? 1.0 : parseFloat(rawOpacity);
        if (!isFinite(indicatorOpacity)) indicatorOpacity = 1.0;
        if (indicatorOpacity < 0) indicatorOpacity = 0;
        if (indicatorOpacity > 1) indicatorOpacity = 1;
        var rawSize = cfg ? cfg.HUD_INDICATOR_SIZE : null;
        var indicatorSize = (rawSize === undefined || rawSize === null) ? 18 : Math.round(Number(rawSize));
        if (!isFinite(indicatorSize)) indicatorSize = 18;
        var hideSmallNumbers = (cfg && cfg.ENABLE_HIDE_SMALL_NUMBERS === 1);
        var cleanIndicators = (cfg && IsCfgEnabled(cfg, "ENABLE_CLEAN_DAMAGE_INDICATORS"));
        return String(indicatorSize) + "|" + indicatorOpacity.toFixed(2) + "|" + (hideSmallNumbers ? "1" : "0") + "|" + (cleanIndicators ? "1" : "0");
    }

    function NeedsDamageNumbersRuntimeWork(cfg, raw) {
        var sig = ResolveDamageNumbersRuntimeSig(cfg);
        var defaultSig = DAMAGE_NUMBERS_DEFAULT_RUNTIME_SIG;
        if (sig !== defaultSig) return true;
        if (State.lastIndicatorConfigSig && State.lastIndicatorConfigSig !== defaultSig) return true;
        if (State.accountPresetTestActive) return true;
        if (raw !== State.lastRawConfig && State.lastIndicatorConfigSig && State.lastIndicatorConfigSig !== defaultSig) return true;
        return false;
    }

    // ── Apply styles to a single damage indicator panel (extracted from update loop)
    function ApplyDamageIndicatorStyle(meta, indicatorFontSizeText, indicatorSize, hideModesChanged, hideSmallNumbers, indicatorOpacityText) {
        if (!meta || !meta.panel) return;
        var p = meta.panel;
        if (!IsPanelValid(p)) return;

        if (hideModesChanged) {
            var indicatorContainer = IsPanelValid(meta.container) ? meta.container : FindAncestorWithClass(p, "HudIndicatorContainer");
            if (indicatorContainer && indicatorContainer !== meta.container) {
                meta.container = indicatorContainer;
            }
            if (p.style.opacity === "0" || p.style.opacity === "0.00") {
                SetPanelOpacitySafe(p, 1.0, 1.0);
            }
            if (indicatorContainer && (indicatorContainer.style.opacity === "0" || indicatorContainer.style.opacity === "0.00")) {
                SetPanelOpacitySafe(indicatorContainer, 1.0, 1.0);
            }
        }

        var targetSize = indicatorFontSizeText;
        try {
            var panelId = p.id;
            if (panelId === "Desc" || panelId === "Effectiveness") {
                var capped = indicatorSize > 28 ? 28 : indicatorSize;
                targetSize = capped + "px";
            }
        } catch(e) { if (typeof Utils !== "undefined" && Utils.WarnLog) Utils.WarnLog("ql_feat_damagenumbers", (e && e.message ? e.message : String(e || ""))); }
        if (p.style.fontSize !== targetSize) {
            p.style.fontSize = targetSize;
        }
        if (meta.isCumulativeOrBatched) return;

        if (hideSmallNumbers && meta.isSmallDamage) {
            SetPanelOpacitySafe(p, 0, 0);
            return;
        }
        SetPanelOpacitySafe(p, indicatorOpacityText, 1.0);
    }

    function UpdateDamageNumbersRuntime(root, cfg, raw, nowMs) {
        // Bail early when indicator config is at default and no cached panel work to clean up.
        if (ResolveDamageNumbersRuntimeSig(cfg) === DAMAGE_NUMBERS_DEFAULT_RUNTIME_SIG &&
            !IsPanelListValid(State.indicatorPanelsCache) &&
            !State.accountPresetTestActive) return;

        var indicatorOpacity = (cfg.DAMAGE_NUMBER_OPACITY === undefined || cfg.DAMAGE_NUMBER_OPACITY === null) ? 1.0 : parseFloat(cfg.DAMAGE_NUMBER_OPACITY);
        if (!isFinite(indicatorOpacity)) indicatorOpacity = 1.0;
        if (indicatorOpacity < 0) indicatorOpacity = 0;
        if (indicatorOpacity > 1) indicatorOpacity = 1;
        var indicatorOpacityText = indicatorOpacity.toFixed(2);
        var indicatorSize = (cfg.HUD_INDICATOR_SIZE === undefined || cfg.HUD_INDICATOR_SIZE === null) ? 18 : Math.round(Number(cfg.HUD_INDICATOR_SIZE));
        if (!isFinite(indicatorSize)) indicatorSize = 18;
        var hideSmallNumbers = (cfg.ENABLE_HIDE_SMALL_NUMBERS === 1);
        var hideModesSig = (hideSmallNumbers ? "1" : "0");
        var hideModesChanged = (hideModesSig !== State.lastIndicatorHideModesSig);
        var cleanIndicators = (IsCfgEnabled(cfg, "ENABLE_CLEAN_DAMAGE_INDICATORS"));
        var indicatorConfigSig = String(indicatorSize) + "|" + indicatorOpacityText + "|" + (hideSmallNumbers ? "1" : "0") + "|" + (cleanIndicators ? "1" : "0");
        var indicatorDefaultsSig = DAMAGE_NUMBERS_DEFAULT_RUNTIME_SIG;
        var indicatorIsDefault = (indicatorConfigSig === indicatorDefaultsSig);
        var indicatorRefreshIntervalMs = hideSmallNumbers ? HUD_INDICATOR_REFRESH_MS_HIDE_SMALL : HUD_INDICATOR_REFRESH_MS_IDLE;
        var indicatorPanelCacheRefreshMs = hideSmallNumbers ? HUD_INDICATOR_PANEL_CACHE_REFRESH_MS_HIDE_SMALL : HUD_INDICATOR_PANEL_CACHE_REFRESH_MS_IDLE;
        var indicatorRefreshDue = RuntimeTaskIsDue("hud_indicator_refresh", nowMs);
        var shouldRefreshIndicators =
            raw !== State.lastRawConfig ||
            State.accountPresetTestActive ||
            indicatorConfigSig !== State.lastIndicatorConfigSig ||
            indicatorRefreshDue;

        if (shouldRefreshIndicators) {
            var shouldSkipDefaultPass =
                indicatorIsDefault &&
                indicatorConfigSig === State.lastIndicatorConfigSig &&
                !State.accountPresetTestActive &&
                raw === State.lastRawConfig;
            if (shouldSkipDefaultPass) {
                RuntimeTaskSetDelay("hud_indicator_refresh", nowMs, indicatorRefreshIntervalMs);
            } else {
                var indicatorCacheValid = IsPanelListValid(State.indicatorPanelsCache);
                var indicatorPanelCacheDue = RuntimeTaskIsDue("hud_indicator_panel_cache", nowMs);
                var shouldRefreshIndicatorPanels =
                    !indicatorCacheValid ||
                    indicatorPanelCacheDue ||
                    indicatorConfigSig !== State.lastIndicatorConfigSig;
                if (shouldRefreshIndicatorPanels) {
                    var dmgContainer = GetCachedPanel("dmgIndicators");
                    if (!dmgContainer && root.FindChildTraverse) {
                        dmgContainer = root.FindChildTraverse("CitadelHudDamageIndicators");
                        SetCachedPanel("dmgIndicators", dmgContainer);
                    }
                    var searchRoot = dmgContainer ? dmgContainer : root;
                    State.indicatorPanelsCache = searchRoot.FindChildrenWithClassTraverse("HudIndicatorText") || [];
                    RuntimeTaskSetDelay("hud_indicator_panel_cache", nowMs, indicatorPanelCacheRefreshMs);
                }
                var indicatorMeta = State.indicatorMetaCache || [];
                if (shouldRefreshIndicatorPanels || indicatorMeta.length !== (State.indicatorPanelsCache || []).length) {
                    indicatorMeta = BuildIndicatorMetaCache(State.indicatorPanelsCache, indicatorMeta, hideSmallNumbers);
                    State.indicatorMetaCache = indicatorMeta;
                    State._descDebugLogged = false;
                }

                var indicatorFontSizeText = indicatorSize + "px";
                for (var im = 0; im < indicatorMeta.length; im++) {
                    ApplyDamageIndicatorStyle(indicatorMeta[im], indicatorFontSizeText, indicatorSize, hideModesChanged, hideSmallNumbers, indicatorOpacityText);
                }
                State.lastIndicatorCount = indicatorMeta.length;
                if (indicatorIsDefault && !State.accountPresetTestActive) {
                    State.indicatorPanelsCache = [];
                    State.indicatorMetaCache = [];
                    State.lastIndicatorCount = 0;
                }
            }
            State.lastIndicatorConfigSig = indicatorConfigSig;
            State.lastIndicatorHideModesSig = hideModesSig;
            RuntimeTaskSetDelay("hud_indicator_refresh", nowMs, indicatorRefreshIntervalMs);
        }
    }

    // ── Registration ──
    QOL.register("damageNumbers", {
        configKeys: ["ENABLE_CLEAN_DAMAGE_INDICATORS", "ENABLE_HIDE_SMALL_NUMBERS",
                     "ENABLE_HIDE_TROOPER_DAMAGE", "DAMAGE_NUMBER_OPACITY",
                     "ENABLE_DAMAGE_FOUNTAIN", "ENABLE_CUMULATIVE_DMG"],
        bucket: 5, phase: -1,
        requiresRoot: true,
        gate: function(cfg) {
            return NeedsDamageNumbersRuntimeWork(cfg);
        },
        update: function(root, cfg, nowMs, State, hideoutConnected) {
            try {
                UpdateDamageNumbersRuntime(root, cfg, State.lastRawConfig, nowMs);
            } catch(e) {
                $.Msg("[QOLLock][ERROR][" + _featureId + "] " + (e && e.message ? e.message : String(e)) + "\n" + (e && e.stack ? String(e.stack) : ""));
                throw e;
            }
        },
        stateKeys: ["lastIndicatorConfigSig", "lastIndicatorHideModesSig",
                    "indicatorPanelsCache", "indicatorMetaCache",
                    "lastIndicatorCount", "lastItemCount",
                    "damageNumbersRuntimeStyleSig"]
    });

    try {
        if (typeof UpdateDamageNumbersRuntime !== "function") throw new Error("UpdateDamageNumbersRuntime is not a function");
    } catch(e) {
        $.Msg("[QOLLock][ERROR][" + _featureId + "] self-test failed: " + (e && e.message ? e.message : String(e)));
    }

})();

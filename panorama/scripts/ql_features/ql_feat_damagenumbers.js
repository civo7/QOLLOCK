// ql_feat_damagenumbers.js — Clean damage indicators (hide small/trooper dmg, opacity, fountain, cumulative)
// Extracted from ql_core.js, Phase 9 Step 2c
(function() {
    'use strict';
    var S = typeof QOL_STATE !== "undefined" ? QOL_STATE : undefined;
    var GC = typeof QOL_GetCachedPanel !== "undefined" ? QOL_GetCachedPanel : undefined;
    var SC = typeof QOL_SetCachedPanel !== "undefined" ? QOL_SetCachedPanel : undefined;
    var U = typeof QOL_UTILS !== "undefined" ? QOL_UTILS : undefined;
    var IsPanelValid = U ? U.IsPanelValid : function() { return false; };
    var IsCfgEnabled = U ? U.IsCfgEnabled : function() { return false; };
    var IsPanelListValid = typeof QOL_IsPanelListValid !== "undefined" ? QOL_IsPanelListValid : function() { return false; };
    var ResolveDamageNumbersRuntimeSig = typeof QOL_ResolveDamageNumbersRuntimeSig !== "undefined" ? QOL_ResolveDamageNumbersRuntimeSig : function() { return ""; };
    var RuntimeTaskIsDue = typeof QOL_RuntimeTaskIsDue !== "undefined" ? QOL_RuntimeTaskIsDue : function() { return false; };
    var RuntimeTaskSetDelay = typeof QOL_RuntimeTaskSetDelay !== "undefined" ? QOL_RuntimeTaskSetDelay : function() {};
    var PerfStart = typeof QOL_PerfStart !== "undefined" ? QOL_PerfStart : function() {};
    var PerfEnd = typeof QOL_PerfEnd !== "undefined" ? QOL_PerfEnd : function() {};

    if (typeof window !== "undefined" && !window._qol_feat_deps_logged) {
        window._qol_feat_deps_logged = {};
    }
    var _dk = "ql_feat_damagenumbers";
    if (typeof window !== "undefined" && window._qol_feat_deps_logged && !window._qol_feat_deps_logged[_dk]) {
        var _m = [];
        if (typeof QOL_STATE === "undefined") _m.push("QOL_STATE");
        if (typeof QOL_GetCachedPanel === "undefined") _m.push("QOL_GetCachedPanel");
        if (typeof QOL_SetCachedPanel === "undefined") _m.push("QOL_SetCachedPanel");
        if (typeof QOL_UTILS === "undefined") _m.push("QOL_UTILS");
        if (typeof QOL_ResolveDamageNumbersRuntimeSig === "undefined") _m.push("QOL_ResolveDamageNumbersRuntimeSig");
        if (typeof QOL_RuntimeTaskIsDue === "undefined") _m.push("QOL_RuntimeTaskIsDue");
        if (typeof QOL_RuntimeTaskSetDelay === "undefined") _m.push("QOL_RuntimeTaskSetDelay");
        if (typeof QOL_PerfStart === "undefined") _m.push("QOL_PerfStart");
        if (_m.length > 0) {
            $.Msg("[QOLLock] WARNING: " + _dk + " missing " + _m.length + " bridge(s): " + _m.join(", ") + " — feature will fail");
        }
        window._qol_feat_deps_logged[_dk] = true;
    }

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
    var hasClassInHierarchy = function(panel, className) {
        var current = panel;
        while (current) {
            if (current.BHasClass(className)) return true;
            current = current.GetParent();
        }
        return false;
    };

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
        if (S.lastIndicatorConfigSig && S.lastIndicatorConfigSig !== defaultSig) return true;
        if (S.accountPresetTestActive) return true;
        if (raw !== S.lastRawConfig && S.lastIndicatorConfigSig && S.lastIndicatorConfigSig !== defaultSig) return true;
        return false;
    }

    function UpdateDamageNumbersRuntime(root, cfg, raw, nowMsLoop) {
        // Bail early when indicator config is at default and no cached panel work to clean up.
        if (ResolveDamageNumbersRuntimeSig(cfg) === DAMAGE_NUMBERS_DEFAULT_RUNTIME_SIG &&
            !IsPanelListValid(S.indicatorPanelsCache) &&
            !S.accountPresetTestActive) return;

        var indicatorOpacity = (cfg.DAMAGE_NUMBER_OPACITY === undefined || cfg.DAMAGE_NUMBER_OPACITY === null) ? 1.0 : parseFloat(cfg.DAMAGE_NUMBER_OPACITY);
        if (!isFinite(indicatorOpacity)) indicatorOpacity = 1.0;
        if (indicatorOpacity < 0) indicatorOpacity = 0;
        if (indicatorOpacity > 1) indicatorOpacity = 1;
        var indicatorOpacityText = indicatorOpacity.toFixed(2);
        var indicatorSize = (cfg.HUD_INDICATOR_SIZE === undefined || cfg.HUD_INDICATOR_SIZE === null) ? 18 : Math.round(Number(cfg.HUD_INDICATOR_SIZE));
        if (!isFinite(indicatorSize)) indicatorSize = 18;
        var hideSmallNumbers = (cfg.ENABLE_HIDE_SMALL_NUMBERS === 1);
        var hideModesSig = (hideSmallNumbers ? "1" : "0");
        var hideModesChanged = (hideModesSig !== S.lastIndicatorHideModesSig);
        var cleanIndicators = (IsCfgEnabled(cfg, "ENABLE_CLEAN_DAMAGE_INDICATORS"));
        var indicatorConfigSig = String(indicatorSize) + "|" + indicatorOpacityText + "|" + (hideSmallNumbers ? "1" : "0") + "|" + (cleanIndicators ? "1" : "0");
        var indicatorDefaultsSig = DAMAGE_NUMBERS_DEFAULT_RUNTIME_SIG;
        var indicatorIsDefault = (indicatorConfigSig === indicatorDefaultsSig);
        var indicatorRefreshIntervalMs = hideSmallNumbers ? HUD_INDICATOR_REFRESH_MS_HIDE_SMALL : HUD_INDICATOR_REFRESH_MS_IDLE;
        var indicatorPanelCacheRefreshMs = hideSmallNumbers ? HUD_INDICATOR_PANEL_CACHE_REFRESH_MS_HIDE_SMALL : HUD_INDICATOR_PANEL_CACHE_REFRESH_MS_IDLE;
        var indicatorRefreshDue = RuntimeTaskIsDue("hud_indicator_refresh", nowMsLoop);
        var shouldRefreshIndicators =
            raw !== S.lastRawConfig ||
            S.accountPresetTestActive ||
            indicatorConfigSig !== S.lastIndicatorConfigSig ||
            indicatorRefreshDue;

        if (shouldRefreshIndicators) {
            var shouldSkipDefaultPass =
                indicatorIsDefault &&
                indicatorConfigSig === S.lastIndicatorConfigSig &&
                !S.accountPresetTestActive &&
                raw === S.lastRawConfig;
            if (shouldSkipDefaultPass) {
                RuntimeTaskSetDelay("hud_indicator_refresh", nowMsLoop, indicatorRefreshIntervalMs);
            } else {
                var indicatorCacheValid = IsPanelListValid(S.indicatorPanelsCache);
                var indicatorPanelCacheDue = RuntimeTaskIsDue("hud_indicator_panel_cache", nowMsLoop);
                var shouldRefreshIndicatorPanels =
                    !indicatorCacheValid ||
                    indicatorPanelCacheDue ||
                    indicatorConfigSig !== S.lastIndicatorConfigSig;
                if (shouldRefreshIndicatorPanels) {
                    var dmgContainer = GC("dmgIndicators");
                    if (!dmgContainer && root.FindChildTraverse) {
                        dmgContainer = root.FindChildTraverse("CitadelHudDamageIndicators");
                        SC("dmgIndicators", dmgContainer);
                    }
                    var searchRoot = dmgContainer ? dmgContainer : root;
                    S.indicatorPanelsCache = searchRoot.FindChildrenWithClassTraverse("HudIndicatorText") || [];
                    RuntimeTaskSetDelay("hud_indicator_panel_cache", nowMsLoop, indicatorPanelCacheRefreshMs);
                }
                var indicatorMeta = S.indicatorMetaCache || [];
                if (shouldRefreshIndicatorPanels || indicatorMeta.length !== (S.indicatorPanelsCache || []).length) {
                    indicatorMeta = BuildIndicatorMetaCache(S.indicatorPanelsCache, indicatorMeta, hideSmallNumbers);
                    S.indicatorMetaCache = indicatorMeta;
                    S._descDebugLogged = false;
                }

                var indicatorFontSizeText = indicatorSize + "px";
                for (var im = 0; im < indicatorMeta.length; im++) {
                    var meta = indicatorMeta[im];
                    if (!meta || !meta.panel) continue;
                    var p = meta.panel;
                    if (!IsPanelValid(p)) continue;

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
                            var _dc = PerfStart();
                            var capped = indicatorSize > 28 ? 28 : indicatorSize;
                            targetSize = capped + "px";
                            PerfEnd("indicators.desc_font_cap", _dc);
                        }
                    } catch (e) {}
                    if (p.style.fontSize !== targetSize) {
                        p.style.fontSize = targetSize;
                    }
                    if (meta.isCumulativeOrBatched) continue;

                    if (hideSmallNumbers && meta.isSmallDamage) {
                        SetPanelOpacitySafe(p, 0, 0);
                        continue;
                    }
                    SetPanelOpacitySafe(p, indicatorOpacityText, 1.0);
                }
                S.lastIndicatorCount = indicatorMeta.length;
                if (indicatorIsDefault && !S.accountPresetTestActive) {
                    S.indicatorPanelsCache = [];
                    S.indicatorMetaCache = [];
                    S.lastIndicatorCount = 0;
                }
            }
            S.lastIndicatorConfigSig = indicatorConfigSig;
            S.lastIndicatorHideModesSig = hideModesSig;
            RuntimeTaskSetDelay("hud_indicator_refresh", nowMsLoop, indicatorRefreshIntervalMs);
        }
    }

    // ── Registration ──
    QOL_REGISTER_FEATURE("damageNumbers", {
        configKeys: ["ENABLE_CLEAN_DAMAGE_INDICATORS", "ENABLE_HIDE_SMALL_NUMBERS",
                     "ENABLE_HIDE_TROOPER_DAMAGE", "DAMAGE_NUMBER_OPACITY",
                     "ENABLE_DAMAGE_FOUNTAIN", "ENABLE_CUMULATIVE_DMG"],
        bucket: 5, phase: -1,
        gate: function(cfg) {
            return NeedsDamageNumbersRuntimeWork(cfg);
        },
        update: function(root, cfg, nowMs, State, hideoutConnected) {
            try {
                UpdateDamageNumbersRuntime(root, cfg, S.lastRawConfig, nowMs);
            } catch(e) {
                $.Msg("[QOLLock][ERROR][" + _dk + "] " + (e && e.message ? e.message : String(e)) + "\n" + (e && e.stack ? String(e.stack) : ""));
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
        $.Msg("[QOLLock][ERROR][" + _dk + "] self-test failed: " + (e && e.message ? e.message : String(e)));
    }

})();

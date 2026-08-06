// ql_feat_unsecuredsouls.js — Unsecured souls timer overlay
// Extracted from ql_core.js, Phase 9 Step 2b
(function() {
    'use strict';
    var _featureId = "ql_feat_unsecuredsouls";
    // DEPENDS: estimateUnsecuredSoulsEtaFallbackSec, findUnsecuredSoulsSource, getCachedPanel, getGameSecondsForUrn, getGameplayHudPanel, getUnsecuredSoulsDangerLevel, isCustomHudContextActive, parseUnsecuredSoulsValue, resetUnsecuredSoulsTracking, state, setCachedPanel, utils, isConnectedToHideout
    var _deps = QOL.import(["estimateUnsecuredSoulsEtaFallbackSec","findUnsecuredSoulsSource","getCachedPanel","getGameSecondsForUrn","getGameplayHudPanel","getUnsecuredSoulsDangerLevel","isCustomHudContextActive","parseUnsecuredSoulsValue","resetUnsecuredSoulsTracking","state","setCachedPanel","utils","isConnectedToHideout"]);
    var GetCachedPanel = _deps.getCachedPanel;
    var State = _deps.state;
    var SetCachedPanel = _deps.setCachedPanel;
    var Utils = _deps.utils;
    var IsCfgEnabled = Utils.IsCfgEnabled;
    var IsPanelValid = Utils.IsPanelValid;
    var IsCustomHudContextActive = _deps.isCustomHudContextActive;
    var EstimateUnsecuredSoulsEtaFallbackSec = _deps.estimateUnsecuredSoulsEtaFallbackSec;
    var FindUnsecuredSoulsSource = _deps.findUnsecuredSoulsSource;
    var GetGameSecondsForUrn = _deps.getGameSecondsForUrn;
    var GetGameplayHudPanel = _deps.getGameplayHudPanel;
    var GetUnsecuredSoulsDangerLevel = _deps.getUnsecuredSoulsDangerLevel;
    var ParseUnsecuredSoulsValue = _deps.parseUnsecuredSoulsValue;
    var ResetUnsecuredSoulsTracking = _deps.resetUnsecuredSoulsTracking;
    var isConnectedToHideout = _deps.isConnectedToHideout;
    var UNSECURED_SOULS_ETA_MAX_SEC = 999;
    var UNSECURED_SOULS_MIN_SAMPLE_MS = 250;
    var UNSECURED_SOULS_RATE_EMA_ALPHA = 0.35;
    var UNSECURED_SOULS_RATE_MIN = 0.01;
    var UNSECURED_SOULS_RATE_STALE_MS = 12000;
    var UNSECURED_SOULS_RATE_TO_FALLBACK_MAX_RATIO = 2.0;
    var UNSECURED_SOULS_SOURCE_SEARCH_MS = 1000;
    function EnsureUnsecuredSoulsOverlay(root) {
        var overlay = GetCachedPanel("unsecuredSoulsOverlay");
        if (IsPanelValid(overlay)) {
            return overlay;
        }

        overlay = root.FindChildTraverse("QOLUnsecuredSoulsOverlay");
        if (!overlay) {
            var parent = GetGameplayHudPanel(root);
            if (!parent) return null;
            overlay = $.CreatePanel("Panel", parent, "QOLUnsecuredSoulsOverlay", {
                hittest: "false",
                hittestchildren: "false"
            });
            $.CreatePanel("Panel", overlay, "QOLUnsecuredSoulsIcon");
            var textContainer = $.CreatePanel("Panel", overlay, "QOLUnsecuredSoulsTextContainer");
            var title = $.CreatePanel("Label", textContainer, "QOLUnsecuredSoulsLabel");
            title.text = "Unsecured Souls";
            var state = $.CreatePanel("Label", textContainer, "QOLUnsecuredSoulsState");
            state.text = "";
        }

        SetCachedPanel("unsecuredSoulsOverlay", overlay);
        SetCachedPanel("unsecuredSoulsLabel", overlay ? overlay.FindChildTraverse("QOLUnsecuredSoulsLabel") : null);
        SetCachedPanel("unsecuredSoulsState", overlay ? overlay.FindChildTraverse("QOLUnsecuredSoulsState") : null);
        return overlay;
    }

    function RemoveUnsecuredSoulsOverlay(root) {
        var overlay = GetCachedPanel("unsecuredSoulsOverlay");
        if (!IsPanelValid(overlay)) {
            overlay = root.FindChildTraverse("QOLUnsecuredSoulsOverlay");
        }
        if (IsPanelValid(overlay)) {
            overlay.DeleteAsync(0);
        }
        SetCachedPanel("unsecuredSoulsOverlay", null);
        SetCachedPanel("unsecuredSoulsLabel", null);
        SetCachedPanel("unsecuredSoulsState", null);
        SetCachedPanel("unsecuredSoulsSource", null);
        State.unsecuredSouls.displayMode = "";
        State.unsecuredSouls.lastLayoutSig = "";
        State.unsecuredSouls.lastClassSig = "";
        State.unsecuredSouls.lastTitle = "";
        State.unsecuredSouls.lastStatus = "";
        State.unsecuredSouls.nextSourceSearchMs = 0;
        ResetUnsecuredSoulsTracking();
    }

    function UpdateUnsecuredSoulsOverlay(root, cfg, hideoutOverride) {
        var nowMs = Date.now ? Date.now() : (new Date()).getTime();
        if (!IsCustomHudContextActive(root)) {
            if (State.unsecuredSouls.displayMode !== "context_off") {
                RemoveUnsecuredSoulsOverlay(root);
                State.unsecuredSouls.displayMode = "context_off";
            }
            return;
        }

        var enabled = IsCfgEnabled(cfg, "ENABLE_UNSECURED_SOUL_TIMER");
        if (!enabled) {
            if (State.unsecuredSouls.displayMode !== "disabled") {
                RemoveUnsecuredSoulsOverlay(root);
                State.unsecuredSouls.displayMode = "disabled";
            }
            return;
        }

        var overlay = EnsureUnsecuredSoulsOverlay(root);
        if (!overlay) return;

        var hideout = (typeof hideoutOverride === "boolean") ? hideoutOverride : isConnectedToHideout(root);
        if (hideout) {
            if (State.unsecuredSouls.displayMode !== "hideout") {
                if (overlay.SetHasClass) overlay.SetHasClass("qol-hidden", true); else overlay.style.visibility = "collapse";
                overlay.SetHasClass("danger_1", false);
                overlay.SetHasClass("danger_2", false);
                overlay.SetHasClass("danger_3", false);
                overlay.SetHasClass("danger_4", false);
                overlay.SetHasClass("has_souls", false);
                overlay.SetHasClass("is_safe", true);
                overlay.SetHasClass("is_syncing", false);
                State.unsecuredSouls.lastClassSig = "";
            }
            State.unsecuredSouls.displayMode = "hideout";
            ResetUnsecuredSoulsTracking();
            return;
        }

        if (State.unsecuredSouls.displayMode !== "active" || (overlay.BHasClass && overlay.BHasClass("qol-hidden"))) {
            if (overlay.SetHasClass) overlay.SetHasClass("qol-hidden", false); else overlay.style.visibility = "visible";
        }
        State.unsecuredSouls.displayMode = "active";

        var timerOffsetX = Utils.ClampConfigNumber(cfg.UNSECURED_SOUL_TIMER_X_OFFSET, 0, -1500, 1500, true);
        var timerOffsetY = Utils.ClampConfigNumber(cfg.UNSECURED_SOUL_TIMER_Y_OFFSET, 0, -100, 1000, true);
        var timerScale = Utils.ClampConfigNumber(cfg.UNSECURED_SOUL_TIMER_SCALE, 100, 50, 200, true);
        var stateLabel = GetCachedPanel("unsecuredSoulsState");
        var timerFontPx = Math.round(16 * (timerScale / 100));
        if (timerFontPx < 8) timerFontPx = 8;
        if (timerFontPx > 72) timerFontPx = 72;
        var timerFontSize = timerFontPx + "px";
        if (overlay.style.preTransformScale2d !== "1.00") {
            overlay.style.preTransformScale2d = "1.00";
        }
        if (stateLabel && stateLabel.style.fontSize !== timerFontSize) {
            stateLabel.style.fontSize = timerFontSize;
        }
        var layoutSig = [String(timerOffsetX), String(timerOffsetY), String(timerScale)].join("|");
        if (layoutSig !== State.unsecuredSouls.lastLayoutSig) {
            overlay.style.marginLeft = (-520 + timerOffsetX) + "px";
            overlay.style.marginBottom = (110 + timerOffsetY) + "px";
            State.unsecuredSouls.lastLayoutSig = layoutSig;
        }

        var source = GetCachedPanel("unsecuredSoulsSource");
        if (!IsPanelValid(source)) {
            source = null;
            if (nowMs >= (State.unsecuredSouls.nextSourceSearchMs || 0)) {
                source = FindUnsecuredSoulsSource(root);
                State.unsecuredSouls.nextSourceSearchMs = source ? 0 : (nowMs + UNSECURED_SOULS_SOURCE_SEARCH_MS);
                SetCachedPanel("unsecuredSoulsSource", source);
            }
        }

        var rawText = (source && typeof source.text === "string") ? source.text : "";
        var isUnresolved = !rawText || rawText.charAt(0) === "{";
        var souls = isUnresolved ? 0 : ParseUnsecuredSoulsValue(rawText);

        if (!isUnresolved) {
            if (State.unsecuredSouls.lastSouls >= 0 && State.unsecuredSouls.lastSampleMs > 0) {
                var dtSec = (nowMs - State.unsecuredSouls.lastSampleMs) / 1000.0;
                var delta = State.unsecuredSouls.lastSouls - souls;
                if (dtSec >= (UNSECURED_SOULS_MIN_SAMPLE_MS / 1000.0) && delta > 0) {
                    var instRate = delta / dtSec;
                    if (isFinite(instRate) && instRate > UNSECURED_SOULS_RATE_MIN) {
                        if (!isFinite(State.unsecuredSouls.rateEma) || State.unsecuredSouls.rateEma <= 0) {
                            State.unsecuredSouls.rateEma = instRate;
                        } else {
                            State.unsecuredSouls.rateEma = State.unsecuredSouls.rateEma + ((instRate - State.unsecuredSouls.rateEma) * UNSECURED_SOULS_RATE_EMA_ALPHA);
                        }
                        State.unsecuredSouls.rateLastUpdateMs = nowMs;
                    }
                } else if (delta < 0) {
                    // Soul gains are not a valid decay-rate signal; reset to fallback mode until we observe new spend.
                    State.unsecuredSouls.rateEma = 0;
                    State.unsecuredSouls.rateLastUpdateMs = 0;
                }
            }
            State.unsecuredSouls.lastSouls = souls;
            State.unsecuredSouls.lastSampleMs = nowMs;
        }

        var etaSec = 0;
        var fallbackEtaSec = 0;
        if (!isUnresolved && souls > 0) {
            var gameMin = GetGameSecondsForUrn(root) / 60.0;
            fallbackEtaSec = EstimateUnsecuredSoulsEtaFallbackSec(souls, gameMin);

            var rateAgeMs = nowMs - (State.unsecuredSouls.rateLastUpdateMs || 0);
            var rateFresh = (State.unsecuredSouls.rateLastUpdateMs > 0) && rateAgeMs <= UNSECURED_SOULS_RATE_STALE_MS;
            if (rateFresh && isFinite(State.unsecuredSouls.rateEma) && State.unsecuredSouls.rateEma > UNSECURED_SOULS_RATE_MIN) {
                etaSec = souls / State.unsecuredSouls.rateEma;
            }
            if (!isFinite(etaSec) || etaSec <= 0) {
                etaSec = fallbackEtaSec;
            } else if (isFinite(fallbackEtaSec) && fallbackEtaSec > 0 && etaSec > (fallbackEtaSec * UNSECURED_SOULS_RATE_TO_FALLBACK_MAX_RATIO)) {
                etaSec = fallbackEtaSec;
            }
            if (isFinite(etaSec) && etaSec > UNSECURED_SOULS_ETA_MAX_SEC) {
                etaSec = UNSECURED_SOULS_ETA_MAX_SEC;
            }
            if (isFinite(etaSec) && etaSec > 0) {
                State.unsecuredSouls.etaEndMs = nowMs + Math.round(etaSec * 1000);
            }
        } else if (souls <= 0) {
            State.unsecuredSouls.etaEndMs = 0;
            State.unsecuredSouls.rateEma = 0;
            State.unsecuredSouls.rateLastUpdateMs = 0;
        }

        var etaRemainingSec = 0;
        if (State.unsecuredSouls.etaEndMs > nowMs) {
            etaRemainingSec = (State.unsecuredSouls.etaEndMs - nowMs) / 1000.0;
        }

        var statusText = "--";
        if (!isUnresolved) {
            if (souls <= 0) {
                statusText = "";
            } else {
                var etaDisplay = etaRemainingSec > 0 ? etaRemainingSec : etaSec;
                var etaSeconds = Math.ceil(etaDisplay);
                if (!isFinite(etaSeconds) || etaSeconds < 1) etaSeconds = 1;
                statusText = String(etaSeconds) + "s";
            }
        }

        var dangerLevel = GetUnsecuredSoulsDangerLevel(source, souls);
        var classSig = [
            String(dangerLevel),
            souls > 0 ? "1" : "0",
            isUnresolved ? "1" : "0"
        ].join("|");
        if (classSig !== State.unsecuredSouls.lastClassSig) {
            overlay.SetHasClass("danger_1", dangerLevel === 1);
            overlay.SetHasClass("danger_2", dangerLevel === 2);
            overlay.SetHasClass("danger_3", dangerLevel === 3);
            overlay.SetHasClass("danger_4", dangerLevel === 4);
            overlay.SetHasClass("has_souls", souls > 0);
            overlay.SetHasClass("is_safe", souls <= 0 && !isUnresolved);
            overlay.SetHasClass("is_syncing", isUnresolved);
            State.unsecuredSouls.lastClassSig = classSig;
        }

        State.unsecuredSouls.lastTitle = "";
        if (stateLabel && statusText !== State.unsecuredSouls.lastStatus) {
            stateLabel.text = statusText;
            State.unsecuredSouls.lastStatus = statusText;
        }
    }

    // ── Registration ──
    QOL.register("unsecuredSoulsTimer", {
        configKeys: ["ENABLE_UNSECURED_SOUL_TIMER"],
        bucket: 6, phase: 3,
        requiresRoot: true,
        gateKey: "unsecuredSouls",
        perfLabel: "loop.unsecured_souls_overlay",
        gate: function(cfg) { return IsCfgEnabled(cfg, "ENABLE_UNSECURED_SOUL_TIMER") || !!(State.unsecuredSouls && State.unsecuredSouls.displayMode && State.unsecuredSouls.displayMode !== "" && State.unsecuredSouls.displayMode !== "disabled" && State.unsecuredSouls.displayMode !== "context_off"); },
        update: function(root, cfg, nowMs, State, hideoutConnected) {
            UpdateUnsecuredSoulsOverlay(root, cfg, hideoutConnected);
        },
        stateKeys: ["unsecuredSouls"]
    });

    // ── Self-test ──
    try {

                    // P1: skip when new manifest is active to prevent dual execution
                    var _mfActive = false;
                    try { if (typeof QOL !== "undefined" && QOL.core && QOL.core.FeatureRegistry) { _mfActive = QOL.core.FeatureRegistry.isEnabled("ql_unsecured_souls_timer"); } } catch(e) {}
                    if (_mfActive) return;        if (typeof UpdateUnsecuredSoulsOverlay !== "function") throw new Error("UpdateUnsecuredSoulsOverlay is not a function");
    } catch(e) {
        $.Msg("[QOLLock][ERROR][" + _featureId + "] self-test failed: " + (e && e.message ? e.message : String(e)));
    }
})();

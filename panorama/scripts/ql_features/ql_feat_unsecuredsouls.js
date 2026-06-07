// ql_feat_unsecuredsouls.js — Unsecured souls timer overlay
// Extracted from ql_core.js, Phase 9 Step 2b
(function() {
    'use strict';
    var S = typeof QOL_STATE !== "undefined" ? QOL_STATE : undefined;
    var GC = typeof QOL_GetCachedPanel !== "undefined" ? QOL_GetCachedPanel : undefined;
    var SC = typeof QOL_SetCachedPanel !== "undefined" ? QOL_SetCachedPanel : undefined;
    var U = typeof QOL_UTILS !== "undefined" ? QOL_UTILS : undefined;
    var IsPanelValid = U ? U.IsPanelValid : function() { return false; };
    var IsCfgEnabled = U ? U.IsCfgEnabled : function() { return false; };
    var IsCustomHudContextActive = typeof QOL_IsCustomHudContextActive !== "undefined" ? QOL_IsCustomHudContextActive : function() { return true; };
    var GetGameplayHudPanel = typeof QOL_GetGameplayHudPanel !== "undefined" ? QOL_GetGameplayHudPanel : function() { return null; };
    var UNSECURED_SOULS_SOURCE_SEARCH_MS = 1000;
    var UNSECURED_SOULS_MIN_SAMPLE_MS = 250;
    var UNSECURED_SOULS_RATE_EMA_ALPHA = 0.35;
    var UNSECURED_SOULS_RATE_MIN = 0.01;
    var UNSECURED_SOULS_RATE_STALE_MS = 12000;
    var UNSECURED_SOULS_RATE_TO_FALLBACK_MAX_RATIO = 2.0;
    var UNSECURED_SOULS_ETA_MAX_SEC = 999;

    // One-shot dependency validation
    if (typeof window !== "undefined" && !window._qol_feat_deps_logged) {
        window._qol_feat_deps_logged = {};
    }
    var _dk = "ql_feat_unsecuredsouls";
    if (typeof window !== "undefined" && window._qol_feat_deps_logged && !window._qol_feat_deps_logged[_dk]) {
        var _m = [];
        if (typeof QOL_STATE === "undefined") _m.push("QOL_STATE");
        if (typeof QOL_GetCachedPanel === "undefined") _m.push("QOL_GetCachedPanel");
        if (typeof QOL_SetCachedPanel === "undefined") _m.push("QOL_SetCachedPanel");
        if (typeof QOL_UTILS === "undefined") _m.push("QOL_UTILS");
        if (_m.length > 0) {
            $.Msg("[QOLLock] WARNING: " + _dk + " missing bridge globals: " + _m.join(", ") + " - feature may not work");
        }
        window._qol_feat_deps_logged[_dk] = true;
    }
    function EnsureUnsecuredSoulsOverlay(root) {
        var overlay = GC("unsecuredSoulsOverlay");
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

        SC("unsecuredSoulsOverlay", overlay);
        SC("unsecuredSoulsLabel", overlay ? overlay.FindChildTraverse("QOLUnsecuredSoulsLabel") : null);
        SC("unsecuredSoulsState", overlay ? overlay.FindChildTraverse("QOLUnsecuredSoulsState") : null);
        return overlay;
    }

    function RemoveUnsecuredSoulsOverlay(root) {
        var overlay = GC("unsecuredSoulsOverlay");
        if (!IsPanelValid(overlay)) {
            overlay = root.FindChildTraverse("QOLUnsecuredSoulsOverlay");
        }
        if (IsPanelValid(overlay)) {
            overlay.DeleteAsync(0);
        }
        SC("unsecuredSoulsOverlay", null);
        SC("unsecuredSoulsLabel", null);
        SC("unsecuredSoulsState", null);
        SC("unsecuredSoulsSource", null);
        S.unsecuredSouls.displayMode = "";
        S.unsecuredSouls.lastLayoutSig = "";
        S.unsecuredSouls.lastClassSig = "";
        S.unsecuredSouls.lastTitle = "";
        S.unsecuredSouls.lastStatus = "";
        S.unsecuredSouls.nextSourceSearchMs = 0;
        ResetUnsecuredSoulsTracking();
    }

    function UpdateUnsecuredSoulsOverlay(root, cfg, hideoutOverride) {
        var nowMs = Date.now ? Date.now() : (new Date()).getTime();
        if (!IsCustomHudContextActive(root)) {
            if (S.unsecuredSouls.displayMode !== "context_off") {
                RemoveUnsecuredSoulsOverlay(root);
                S.unsecuredSouls.displayMode = "context_off";
            }
            return;
        }

        var enabled = IsCfgEnabled(cfg, "ENABLE_UNSECURED_SOUL_TIMER");
        if (!enabled) {
            if (S.unsecuredSouls.displayMode !== "disabled") {
                RemoveUnsecuredSoulsOverlay(root);
                S.unsecuredSouls.displayMode = "disabled";
            }
            return;
        }

        var overlay = EnsureUnsecuredSoulsOverlay(root);
        if (!overlay) return;

        var hideout = (typeof hideoutOverride === "boolean") ? hideoutOverride : isConnectedToHideout(root);
        if (hideout) {
            if (S.unsecuredSouls.displayMode !== "hideout") {
                overlay.style.visibility = "collapse";
                overlay.SetHasClass("danger_1", false);
                overlay.SetHasClass("danger_2", false);
                overlay.SetHasClass("danger_3", false);
                overlay.SetHasClass("danger_4", false);
                overlay.SetHasClass("has_souls", false);
                overlay.SetHasClass("is_safe", true);
                overlay.SetHasClass("is_syncing", false);
                S.unsecuredSouls.lastClassSig = "";
            }
            S.unsecuredSouls.displayMode = "hideout";
            ResetUnsecuredSoulsTracking();
            return;
        }

        if (S.unsecuredSouls.displayMode !== "active" || overlay.style.visibility !== "visible") {
            overlay.style.visibility = "visible";
        }
        S.unsecuredSouls.displayMode = "active";

        var timerOffsetX = Number(cfg.UNSECURED_SOUL_TIMER_X_OFFSET);
        var timerOffsetY = Number(cfg.UNSECURED_SOUL_TIMER_Y_OFFSET);
        var timerScale = Number(cfg.UNSECURED_SOUL_TIMER_SCALE);
        if (!isFinite(timerOffsetX)) timerOffsetX = 0;
        if (!isFinite(timerOffsetY)) timerOffsetY = 0;
        if (!isFinite(timerScale)) timerScale = 100;
        timerOffsetX = Math.round(timerOffsetX);
        timerOffsetY = Math.round(timerOffsetY);
        timerScale = Math.round(timerScale);
        if (timerOffsetX < -1500) timerOffsetX = -1500;
        if (timerOffsetX > 1500) timerOffsetX = 1500;
        if (timerOffsetY < -100) timerOffsetY = -100;
        if (timerOffsetY > 1000) timerOffsetY = 1000;
        if (timerScale < 50) timerScale = 50;
        if (timerScale > 200) timerScale = 200;
        var stateLabel = GC("unsecuredSoulsState");
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
        if (layoutSig !== S.unsecuredSouls.lastLayoutSig) {
            overlay.style.marginLeft = (-520 + timerOffsetX) + "px";
            overlay.style.marginBottom = (110 + timerOffsetY) + "px";
            S.unsecuredSouls.lastLayoutSig = layoutSig;
        }

        var source = GC("unsecuredSoulsSource");
        if (!IsPanelValid(source)) {
            source = null;
            if (nowMs >= (S.unsecuredSouls.nextSourceSearchMs || 0)) {
                source = FindUnsecuredSoulsSource(root);
                S.unsecuredSouls.nextSourceSearchMs = source ? 0 : (nowMs + UNSECURED_SOULS_SOURCE_SEARCH_MS);
                SC("unsecuredSoulsSource", source);
            }
        }

        var rawText = (source && typeof source.text === "string") ? source.text : "";
        var isUnresolved = !rawText || rawText.charAt(0) === "{";
        var souls = isUnresolved ? 0 : ParseUnsecuredSoulsValue(rawText);

        if (!isUnresolved) {
            if (S.unsecuredSouls.lastSouls >= 0 && S.unsecuredSouls.lastSampleMs > 0) {
                var dtSec = (nowMs - S.unsecuredSouls.lastSampleMs) / 1000.0;
                var delta = S.unsecuredSouls.lastSouls - souls;
                if (dtSec >= (UNSECURED_SOULS_MIN_SAMPLE_MS / 1000.0) && delta > 0) {
                    var instRate = delta / dtSec;
                    if (isFinite(instRate) && instRate > UNSECURED_SOULS_RATE_MIN) {
                        if (!isFinite(S.unsecuredSouls.rateEma) || S.unsecuredSouls.rateEma <= 0) {
                            S.unsecuredSouls.rateEma = instRate;
                        } else {
                            S.unsecuredSouls.rateEma = S.unsecuredSouls.rateEma + ((instRate - S.unsecuredSouls.rateEma) * UNSECURED_SOULS_RATE_EMA_ALPHA);
                        }
                        S.unsecuredSouls.rateLastUpdateMs = nowMs;
                    }
                } else if (delta < 0) {
                    // Soul gains are not a valid decay-rate signal; reset to fallback mode until we observe new spend.
                    S.unsecuredSouls.rateEma = 0;
                    S.unsecuredSouls.rateLastUpdateMs = 0;
                }
            }
            S.unsecuredSouls.lastSouls = souls;
            S.unsecuredSouls.lastSampleMs = nowMs;
        }

        var etaSec = 0;
        var fallbackEtaSec = 0;
        if (!isUnresolved && souls > 0) {
            var gameMin = GetGameSecondsForUrn(root) / 60.0;
            fallbackEtaSec = EstimateUnsecuredSoulsEtaFallbackSec(souls, gameMin);

            var rateAgeMs = nowMs - (S.unsecuredSouls.rateLastUpdateMs || 0);
            var rateFresh = (S.unsecuredSouls.rateLastUpdateMs > 0) && rateAgeMs <= UNSECURED_SOULS_RATE_STALE_MS;
            if (rateFresh && isFinite(S.unsecuredSouls.rateEma) && S.unsecuredSouls.rateEma > UNSECURED_SOULS_RATE_MIN) {
                etaSec = souls / S.unsecuredSouls.rateEma;
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
                S.unsecuredSouls.etaEndMs = nowMs + Math.round(etaSec * 1000);
            }
        } else if (souls <= 0) {
            S.unsecuredSouls.etaEndMs = 0;
            S.unsecuredSouls.rateEma = 0;
            S.unsecuredSouls.rateLastUpdateMs = 0;
        }

        var etaRemainingSec = 0;
        if (S.unsecuredSouls.etaEndMs > nowMs) {
            etaRemainingSec = (S.unsecuredSouls.etaEndMs - nowMs) / 1000.0;
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
        if (classSig !== S.unsecuredSouls.lastClassSig) {
            overlay.SetHasClass("danger_1", dangerLevel === 1);
            overlay.SetHasClass("danger_2", dangerLevel === 2);
            overlay.SetHasClass("danger_3", dangerLevel === 3);
            overlay.SetHasClass("danger_4", dangerLevel === 4);
            overlay.SetHasClass("has_souls", souls > 0);
            overlay.SetHasClass("is_safe", souls <= 0 && !isUnresolved);
            overlay.SetHasClass("is_syncing", isUnresolved);
            S.unsecuredSouls.lastClassSig = classSig;
        }

        S.unsecuredSouls.lastTitle = "";
        if (stateLabel && statusText !== S.unsecuredSouls.lastStatus) {
            stateLabel.text = statusText;
            S.unsecuredSouls.lastStatus = statusText;
        }
    }

    // ── Registration ──
    QOL_REGISTER_FEATURE("unsecuredSoulsTimer", {
        configKeys: ["ENABLE_UNSECURED_SOUL_TIMER"],
        bucket: 6, phase: 3,
        gate: function(cfg) { return IsCfgEnabled(cfg, "ENABLE_UNSECURED_SOUL_TIMER") || !!(S.unsecuredSouls && S.unsecuredSouls.displayMode && S.unsecuredSouls.displayMode !== ""); },
        update: function(root, cfg, nowMs, State, hideoutConnected) {
            UpdateUnsecuredSoulsOverlay(root, cfg, hideoutConnected);
        },
        stateKeys: ["unsecuredSouls"]
    });

})();

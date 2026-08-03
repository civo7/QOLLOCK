// features/ql_unsecured_souls_timer/manifest.js
// =============================================================================
// QOLLOCK — Unsecured Souls Timer Overlay
// =============================================================================
// OWNS:        QOLUnsecuredSoulsOverlay panel under gameplay_hud.
//              Unsecured souls countdown with EMA rate tracking and ETA.
// DOES NOT OWN: gameplay_hud (Valve), unsecured souls game logic
// DEPENDS ON:  QOL.core.FeatureRegistry, QOL.core.Scheduler,
//              QOL delegates: estimateUnsecuredSoulsEtaFallbackSec,
//              findUnsecuredSoulsSource, getCachedPanel, setCachedPanel,
//              getGameSecondsForUrn, getGameplayHudPanel,
//              getUnsecuredSoulsDangerLevel, isCustomHudContextActive,
//              parseUnsecuredSoulsValue, resetUnsecuredSoulsTracking,
//              state, utils, isConnectedToHideout
// CONFIG KEYS: ENABLE_UNSECURED_SOUL_TIMER, UNSECURED_SOUL_TIMER_X_OFFSET,
//              UNSECURED_SOUL_TIMER_Y_OFFSET, UNSECURED_SOUL_TIMER_SCALE
// CSS:         none
// PATTERN:     Polling (0.2Hz). EMA rate tracking for soul decay estimation.
//              Danger level classification with CSS class toggling.
//              Hideout-aware state machine (disabled/hideout/active/context_off).
// STATE KEYS:  State.unsecuredSouls.* (displayMode, lastLayoutSig, lastClassSig,
//              lastTitle, lastStatus, lastSouls, lastSampleMs, rateEma,
//              rateLastUpdateMs, etaEndMs, nextSourceSearchMs)
//              (written for backward compat — Pattern 7)
// =============================================================================

(function() {
    "use strict";

    var FR = QOL.core.FeatureRegistry;
    if (!FR) { $.Msg("[QOLLock] ql_unsecured_souls_timer: FeatureRegistry not found — aborting"); return; }
    var logger = QOL.core.Logger;

    FR.register({
        id: "ql_unsecured_souls_timer",
        enableKey: "ENABLE_UNSECURED_SOUL_TIMER",
        enabledByDefault: false,
        settings: [
            { key: "ENABLE_UNSECURED_SOUL_TIMER", type: "toggle", default: false },
            { key: "UNSECURED_SOUL_TIMER_X_OFFSET", type: "slider", min: -1500, max: 1500, default: 0 },
            { key: "UNSECURED_SOUL_TIMER_Y_OFFSET", type: "slider", min: -100, max: 1000, default: 0 },
            { key: "UNSECURED_SOUL_TIMER_SCALE", type: "slider", min: 50, max: 200, default: 100 }
        ],
        create: function(ctx) {
            // ── QOL delegate wrappers (Pattern 10) ──
            function _getState() {
                try { if (typeof QOL !== "undefined" && QOL.state) return QOL.state; } catch(e) {}
                return null;
            }
            function _getCachedPanel(key) {
                try { if (typeof QOL !== "undefined" && QOL.getCachedPanel) return QOL.getCachedPanel(key); } catch(e) {}
                return null;
            }
            function _setCachedPanel(key, val) {
                try { if (typeof QOL !== "undefined" && QOL.setCachedPanel) QOL.setCachedPanel(key, val); } catch(e) {}
            }
            function _getGameSecondsForUrn(root) {
                try { if (typeof QOL !== "undefined" && QOL.getGameSecondsForUrn) return QOL.getGameSecondsForUrn(root); } catch(e) {}
                return 0;
            }
            function _getGameplayHudPanel(root) {
                try { if (typeof QOL !== "undefined" && QOL.getGameplayHudPanel) return QOL.getGameplayHudPanel(root); } catch(e) {}
                return root;
            }
            function _isConnectedToHideout(root) {
                try { if (typeof QOL !== "undefined" && QOL.isConnectedToHideout) return QOL.isConnectedToHideout(root); } catch(e) {}
                return false;
            }
            function _isCustomHudContextActive(root) {
                try { if (typeof QOL !== "undefined" && QOL.isCustomHudContextActive) return QOL.isCustomHudContextActive(root); } catch(e) {}
                return true;
            }
            function _isPanelValid(p) {
                try { if (typeof QOL !== "undefined" && QOL.utils && QOL.utils.IsPanelValid) return QOL.utils.IsPanelValid(p); } catch(e) {}
                return !!(p && typeof p.IsValid === "function" && p.IsValid());
            }
            function _clampConfigNumber(val, def, min, max, round) {
                try { if (typeof QOL !== "undefined" && QOL.utils && QOL.utils.ClampConfigNumber) return QOL.utils.ClampConfigNumber(val, def, min, max, round); } catch(e) {}
                var v = Number(val); if (!isFinite(v)) v = def;
                if (round) v = Math.round(v);
                if (v < min) v = min; if (v > max) v = max;
                return v;
            }
            function _parseUnsecuredSoulsValue(valueText) {
                try { if (typeof QOL !== "undefined" && QOL.parseUnsecuredSoulsValue) return QOL.parseUnsecuredSoulsValue(valueText); } catch(e) {}
                return 0;
            }
            function _estimateUnsecuredSoulsEtaFallbackSec(souls, gameMin) {
                try { if (typeof QOL !== "undefined" && QOL.estimateUnsecuredSoulsEtaFallbackSec) return QOL.estimateUnsecuredSoulsEtaFallbackSec(souls, gameMin); } catch(e) {}
                return 60;
            }
            function _findUnsecuredSoulsSource(root) {
                try { if (typeof QOL !== "undefined" && QOL.findUnsecuredSoulsSource) return QOL.findUnsecuredSoulsSource(root); } catch(e) {}
                return null;
            }
            function _getUnsecuredSoulsDangerLevel(source, souls) {
                try { if (typeof QOL !== "undefined" && QOL.getUnsecuredSoulsDangerLevel) return QOL.getUnsecuredSoulsDangerLevel(source, souls); } catch(e) {}
                return 0;
            }
            function _resetUnsecuredSoulsTracking() {
                try { if (typeof QOL !== "undefined" && QOL.resetUnsecuredSoulsTracking) QOL.resetUnsecuredSoulsTracking(); } catch(e) {}
            }

            // ── Constants ──
            var UNSECURED_SOULS_ETA_MAX_SEC = 999;
            var UNSECURED_SOULS_MIN_SAMPLE_MS = 250;
            var UNSECURED_SOULS_RATE_EMA_ALPHA = 0.35;
            var UNSECURED_SOULS_RATE_MIN = 0.01;
            var UNSECURED_SOULS_RATE_STALE_MS = 12000;
            var UNSECURED_SOULS_RATE_TO_FALLBACK_MAX_RATIO = 2.0;
            var UNSECURED_SOULS_SOURCE_SEARCH_MS = 1000;

            var _loop = null;

            function _ensureOverlay(root) {
                var overlay = _getCachedPanel("unsecuredSoulsOverlay");
                if (_isPanelValid(overlay)) return overlay;
                overlay = root.FindChildTraverse("QOLUnsecuredSoulsOverlay");
                if (!overlay) {
                    var parent = _getGameplayHudPanel(root);
                    if (!parent) return null;
                    overlay = $.CreatePanel("Panel", parent, "QOLUnsecuredSoulsOverlay", {
                        hittest: "false", hittestchildren: "false"
                    });
                    $.CreatePanel("Panel", overlay, "QOLUnsecuredSoulsIcon");
                    var textContainer = $.CreatePanel("Panel", overlay, "QOLUnsecuredSoulsTextContainer");
                    var title = $.CreatePanel("Label", textContainer, "QOLUnsecuredSoulsLabel");
                    title.text = "Unsecured Souls";
                    var state = $.CreatePanel("Label", textContainer, "QOLUnsecuredSoulsState");
                    state.text = "";
                }
                _setCachedPanel("unsecuredSoulsOverlay", overlay);
                _setCachedPanel("unsecuredSoulsLabel", overlay ? overlay.FindChildTraverse("QOLUnsecuredSoulsLabel") : null);
                _setCachedPanel("unsecuredSoulsState", overlay ? overlay.FindChildTraverse("QOLUnsecuredSoulsState") : null);
                return overlay;
            }

            function _removeOverlay(root) {
                var overlay = _getCachedPanel("unsecuredSoulsOverlay");
                if (!_isPanelValid(overlay)) overlay = root.FindChildTraverse("QOLUnsecuredSoulsOverlay");
                if (_isPanelValid(overlay)) overlay.DeleteAsync(0);
                _setCachedPanel("unsecuredSoulsOverlay", null);
                _setCachedPanel("unsecuredSoulsLabel", null);
                _setCachedPanel("unsecuredSoulsState", null);
                _setCachedPanel("unsecuredSoulsSource", null);
                var State = _getState();
                if (State && State.unsecuredSouls) {
                    State.unsecuredSouls.displayMode = "";
                    State.unsecuredSouls.lastLayoutSig = "";
                    State.unsecuredSouls.lastClassSig = "";
                    State.unsecuredSouls.lastTitle = "";
                    State.unsecuredSouls.lastStatus = "";
                    State.unsecuredSouls.nextSourceSearchMs = 0;
                }
                _resetUnsecuredSoulsTracking();
            }

            // ── Main tick ──
            function _tick() {
                try {
                    var root = $.GetContextPanel();
                    if (!_isPanelValid(root)) return;
                    var nowMs = Date.now ? Date.now() : (new Date()).getTime();
                    var State = _getState();
                    if (!State) return;
                    if (!State.unsecuredSouls) State.unsecuredSouls = {};

                    if (!_isCustomHudContextActive(root)) {
                        if (State.unsecuredSouls.displayMode !== "context_off") {
                            _removeOverlay(root);
                            State.unsecuredSouls.displayMode = "context_off";
                        }
                        return;
                    }

                    var cfg = ctx.config.all();
                    var enabled = Number(cfg.ENABLE_UNSECURED_SOUL_TIMER) === 1;
                    if (!enabled) {
                        if (State.unsecuredSouls.displayMode !== "disabled") {
                            _removeOverlay(root);
                            State.unsecuredSouls.displayMode = "disabled";
                        }
                        return;
                    }

                    var overlay = _ensureOverlay(root);
                    if (!overlay) return;

                    var hideout = _isConnectedToHideout(root);
                    if (hideout) {
                        if (State.unsecuredSouls.displayMode !== "hideout") {
                            if (overlay.SetHasClass) overlay.SetHasClass("qol-hidden", true);
                            else overlay.style.visibility = "collapse";
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
                        _resetUnsecuredSoulsTracking();
                        return;
                    }

                    if (State.unsecuredSouls.displayMode !== "active" || (overlay.BHasClass && overlay.BHasClass("qol-hidden"))) {
                        if (overlay.SetHasClass) overlay.SetHasClass("qol-hidden", false);
                        else overlay.style.visibility = "visible";
                    }
                    State.unsecuredSouls.displayMode = "active";

                    // Layout
                    var timerOffsetX = _clampConfigNumber(cfg.UNSECURED_SOUL_TIMER_X_OFFSET, 0, -1500, 1500, true);
                    var timerOffsetY = _clampConfigNumber(cfg.UNSECURED_SOUL_TIMER_Y_OFFSET, 0, -100, 1000, true);
                    var timerScale = _clampConfigNumber(cfg.UNSECURED_SOUL_TIMER_SCALE, 100, 50, 200, true);
                    var stateLabel = _getCachedPanel("unsecuredSoulsState");
                    var timerFontPx = Math.round(16 * (timerScale / 100));
                    if (timerFontPx < 8) timerFontPx = 8;
                    if (timerFontPx > 72) timerFontPx = 72;
                    var timerFontSize = timerFontPx + "px";
                    if (overlay.style.preTransformScale2d !== "1.00") overlay.style.preTransformScale2d = "1.00";
                    if (stateLabel && stateLabel.style.fontSize !== timerFontSize) stateLabel.style.fontSize = timerFontSize;
                    var layoutSig = [String(timerOffsetX), String(timerOffsetY), String(timerScale)].join("|");
                    if (layoutSig !== State.unsecuredSouls.lastLayoutSig) {
                        overlay.style.marginLeft = (-520 + timerOffsetX) + "px";
                        overlay.style.marginBottom = (110 + timerOffsetY) + "px";
                        State.unsecuredSouls.lastLayoutSig = layoutSig;
                    }

                    // Soul source panel
                    var source = _getCachedPanel("unsecuredSoulsSource");
                    if (!_isPanelValid(source)) {
                        source = null;
                        if (nowMs >= (State.unsecuredSouls.nextSourceSearchMs || 0)) {
                            source = _findUnsecuredSoulsSource(root);
                            State.unsecuredSouls.nextSourceSearchMs = source ? 0 : (nowMs + UNSECURED_SOULS_SOURCE_SEARCH_MS);
                            _setCachedPanel("unsecuredSoulsSource", source);
                        }
                    }

                    var rawText = (source && typeof source.text === "string") ? source.text : "";
                    var isUnresolved = !rawText || rawText.charAt(0) === "{";
                    var souls = isUnresolved ? 0 : _parseUnsecuredSoulsValue(rawText);

                    // EMA rate tracking
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
                                State.unsecuredSouls.rateEma = 0;
                                State.unsecuredSouls.rateLastUpdateMs = 0;
                            }
                        }
                        State.unsecuredSouls.lastSouls = souls;
                        State.unsecuredSouls.lastSampleMs = nowMs;
                    }

                    // ETA computation
                    var etaSec = 0;
                    if (!isUnresolved && souls > 0) {
                        var gameMin = _getGameSecondsForUrn(root) / 60.0;
                        var fallbackEtaSec = _estimateUnsecuredSoulsEtaFallbackSec(souls, gameMin);
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
                        if (isFinite(etaSec) && etaSec > UNSECURED_SOULS_ETA_MAX_SEC) etaSec = UNSECURED_SOULS_ETA_MAX_SEC;
                        if (isFinite(etaSec) && etaSec > 0) State.unsecuredSouls.etaEndMs = nowMs + Math.round(etaSec * 1000);
                    } else if (souls <= 0) {
                        State.unsecuredSouls.etaEndMs = 0;
                        State.unsecuredSouls.rateEma = 0;
                        State.unsecuredSouls.rateLastUpdateMs = 0;
                    }

                    var etaRemainingSec = 0;
                    if (State.unsecuredSouls.etaEndMs > nowMs) etaRemainingSec = (State.unsecuredSouls.etaEndMs - nowMs) / 1000.0;

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

                    // Danger level classes
                    var dangerLevel = _getUnsecuredSoulsDangerLevel(source, souls);
                    var classSig = [String(dangerLevel), souls > 0 ? "1" : "0", isUnresolved ? "1" : "0"].join("|");
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
                } catch(e) {
                    logger.logError("ql_unsecured_souls_timer", "_tick threw: " + (e.message || e));
                    throw e;
                }
            }

            return {
                onEnable: function() {
                    var S = QOL.core.Scheduler;
                    _loop = S && S.createPollLoop ? S.createPollLoop(_tick, 0.2, "ql_unsecured_souls_timer") : null;
                },
                onDisable: function() {
                    if (_loop) { _loop.stop(); _loop = null; }
                    var S = QOL.core.Scheduler;
                    if (S) S.cancelAllForFeature("ql_unsecured_souls_timer");
                    logger.clearThrottle("ql_unsecured_souls_timer");
                    var root = $.GetContextPanel();
                    if (_isPanelValid(root)) _removeOverlay(root);
                },
                onSettingsChanged: function() {}
            };
        },
        test: function(ctx) {
            try {
                var root = $.GetContextPanel();
                var gp = root ? root.FindChildTraverse("gameplay_hud") : null;
                if (!gp) return null;
                return { passed: true, name: "Unsecured souls anchor panel exists", message: "", assertions: [{ passed: true, name: "gameplay_hud panel exists" }] };
            } catch(e) { return { passed: false, name: "Unsecured souls panel check", message: (e && e.message ? e.message : String(e)) }; }
        }
    });
})();

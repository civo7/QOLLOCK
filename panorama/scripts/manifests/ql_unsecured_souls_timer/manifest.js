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
//              state, utils
// CONFIG KEYS: ENABLE_UNSECURED_SOUL_TIMER, UNSECURED_SOUL_TIMER_X_OFFSET,
//              UNSECURED_SOUL_TIMER_Y_OFFSET, UNSECURED_SOUL_TIMER_SCALE
// CSS:         none
// PATTERN:     Polling (0.2s / 5Hz). EMA rate tracking for soul decay estimation.
//              Danger level classification with CSS class toggling.
//              HUD state machine (disabled/active/context_off), including hideout and hero testing.
// STATE:       Private timer state.  It is deliberately separate from
//              Better Unsecured HUD so toggling either feature cannot reset the other.
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
            function _getGameSecondsForUrn(root) {
                try { if (typeof QOL !== "undefined" && QOL.getGameSecondsForUrn) return QOL.getGameSecondsForUrn(root); } catch(e) {}
                return 0;
            }
            function _getGameplayHudPanel(root) {
                try { if (typeof QOL !== "undefined" && QOL.getGameplayHudPanel) return QOL.getGameplayHudPanel(root); } catch(e) {}
                return root;
            }
            function _isCustomHudContextActive(root) {
                try { if (typeof QOL !== "undefined" && QOL.isCustomHudContextActive) return QOL.isCustomHudContextActive(root); } catch(e) {}
                return true;
            }
            var _isPanelValid = QOL.utils.IsPanelValid;
            var _clampConfigNumber = QOL.utils.ClampConfigNumber;
            function _parseUnsecuredSoulsValue(valueText) {
                const cleaned = String(valueText || "").replace(/[^0-9.-]/g, "");
                const n = Number(cleaned);
                return (!isFinite(n) || n < 0) ? 0 : Math.round(n);
            }
            function _estimateUnsecuredSoulsEtaFallbackSec(souls, gameMin) {
                const remaining = Math.max(0, Number(souls) || 0);
                if (remaining <= 0) return 0;
                const minuteScale = 1 + (Math.max(0, Number(gameMin) || 0) * 0.05);
                const flatRate = 15 * minuteScale;
                const perSecond = (remaining * 0.02) + flatRate;
                if (!isFinite(perSecond) || perSecond <= 0) return 0;
                return remaining / perSecond;
            }
            function _findUnsecuredSoulsSource(root) {
                if (!root) return null;
                const modernUnsecured = root.FindChildTraverse ? root.FindChildTraverse("HudUnsecuredLabel") : null;
                if (_isPanelValid(modernUnsecured)) return modernUnsecured;

                const goldContainer = root.FindChildTraverse ? root.FindChildTraverse("gold_and_ap_container") : null;
                if (goldContainer && goldContainer.FindChildTraverse) {
                    const fromGoldById = goldContainer.FindChildTraverse("hudDeathGoldLabel");
                    if (_isPanelValid(fromGoldById)) return fromGoldById;

                    const fromGoldByClass = goldContainer.FindChildrenWithClassTraverse ? (goldContainer.FindChildrenWithClassTraverse("death_penalty_gold") || []) : [];
                    for (let i = 0; i < fromGoldByClass.length; i++) {
                        if (_isPanelValid(fromGoldByClass[i])) return fromGoldByClass[i];
                    }
                }

                const byId = root.FindChildTraverse ? root.FindChildTraverse("hudDeathGoldLabel") : null;
                if (_isPanelValid(byId)) return byId;

                const candidates = root.FindChildrenWithClassTraverse ? (root.FindChildrenWithClassTraverse("death_penalty_gold") || []) : [];
                for (let j = 0; j < candidates.length; j++) {
                    const candidate = candidates[j];
                    if (!_isPanelValid(candidate)) continue;
                    let anc = candidate.GetParent ? candidate.GetParent() : null;
                    while (anc) {
                        if (anc.BHasClass && anc.BHasClass("hudDeathGoldContainer")) return candidate;
                        anc = anc.GetParent ? anc.GetParent() : null;
                    }
                }
                for (let k = 0; k < candidates.length; k++) {
                    if (_isPanelValid(candidates[k])) return candidates[k];
                }
                return null;
            }
            function _getUnsecuredSoulsDangerLevel(source, souls) {
                let current = source;
                while (current) {
                    if (current.BHasClass) {
                        if (current.BHasClass("death_penalty_gold_danger_level_4")) return 4;
                        if (current.BHasClass("death_penalty_gold_danger_level_3")) return 3;
                        if (current.BHasClass("death_penalty_gold_danger_level_2")) return 2;
                        if (current.BHasClass("death_penalty_gold_danger_level_1")) return 1;
                    }
                    current = current.GetParent ? current.GetParent() : null;
                }
                if (souls >= 1000) return 3;
                if (souls >= 400) return 2;
                if (souls > 0) return 1;
                return 0;
            }

            // Export to QOL namespace for cross-manifest callers
            if (typeof QOL !== "undefined") {
                QOL.parseUnsecuredSoulsValue = _parseUnsecuredSoulsValue;
                QOL.estimateUnsecuredSoulsEtaFallbackSec = _estimateUnsecuredSoulsEtaFallbackSec;
                QOL.findUnsecuredSoulsSource = _findUnsecuredSoulsSource;
                QOL.getUnsecuredSoulsDangerLevel = _getUnsecuredSoulsDangerLevel;
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
            var _timer = {
                displayMode: "", lastLayoutSig: "", lastClassSig: "", lastStatus: "",
                lastSouls: -1, lastSampleMs: 0, rateEma: 0, rateLastUpdateMs: 0,
                etaEndMs: 0, nextSourceSearchMs: 0, overlay: null, stateLabel: null,
                source: null
            };

            function _resetTimerTracking() {
                _timer.lastSouls = -1;
                _timer.lastSampleMs = 0;
                _timer.rateEma = 0;
                _timer.rateLastUpdateMs = 0;
                _timer.etaEndMs = 0;
            }

            function _ensureOverlay(root) {
                var overlay = _timer.overlay;
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
                _timer.overlay = overlay;
                _timer.stateLabel = overlay ? overlay.FindChildTraverse("QOLUnsecuredSoulsState") : null;
                return overlay;
            }

            function _removeOverlay(root) {
                var overlay = _timer.overlay;
                if (!_isPanelValid(overlay)) overlay = root.FindChildTraverse("QOLUnsecuredSoulsOverlay");
                if (_isPanelValid(overlay)) overlay.DeleteAsync(0);
                _timer.overlay = null;
                _timer.stateLabel = null;
                _timer.source = null;
                _timer.lastLayoutSig = "";
                _timer.lastClassSig = "";
                _timer.lastStatus = "";
                _timer.nextSourceSearchMs = 0;
                _resetTimerTracking();
            }

            // ── Main tick ──
            function _tick() {
                try {
                    var root = $.GetContextPanel();
                    if (!_isPanelValid(root)) return;
                    var nowMs = Date.now ? Date.now() : (new Date()).getTime();
                    if (!_isCustomHudContextActive(root)) {
                        if (_timer.displayMode !== "context_off") {
                            _removeOverlay(root);
                            _timer.displayMode = "context_off";
                        }
                        return;
                    }

                    var cfg = ctx.config.view();
                    var enabled = Number(cfg.ENABLE_UNSECURED_SOUL_TIMER) === 1;
                    if (!enabled) {
                        if (_timer.displayMode !== "disabled") {
                            _removeOverlay(root);
                            _timer.displayMode = "disabled";
                        }
                        return;
                    }

                    var overlay = _ensureOverlay(root);
                    if (!overlay) return;

                    if (_timer.displayMode !== "active" || (overlay.BHasClass && overlay.BHasClass("qol-hidden"))) {
                        if (overlay.SetHasClass) overlay.SetHasClass("qol-hidden", false);
                        else overlay.style.visibility = "visible";
                    }
                    _timer.displayMode = "active";

                    // Layout
                    var timerOffsetX = _clampConfigNumber(cfg.UNSECURED_SOUL_TIMER_X_OFFSET, 0, -1500, 1500, true);
                    var timerOffsetY = _clampConfigNumber(cfg.UNSECURED_SOUL_TIMER_Y_OFFSET, 0, -100, 1000, true);
                    var timerScale = _clampConfigNumber(cfg.UNSECURED_SOUL_TIMER_SCALE, 100, 50, 200, true);
                    var stateLabel = _timer.stateLabel;
                    var timerFontPx = Math.round(16 * (timerScale / 100));
                    if (timerFontPx < 8) timerFontPx = 8;
                    if (timerFontPx > 72) timerFontPx = 72;
                    var timerFontSize = timerFontPx + "px";
                    if (overlay.style.preTransformScale2d !== "1.00") overlay.style.preTransformScale2d = "1.00";
                    if (stateLabel && stateLabel.style.fontSize !== timerFontSize) stateLabel.style.fontSize = timerFontSize;
                    var layoutSig = [String(timerOffsetX), String(timerOffsetY), String(timerScale)].join("|");
                    if (layoutSig !== _timer.lastLayoutSig) {
                        overlay.style.marginLeft = (-520 + timerOffsetX) + "px";
                        overlay.style.marginBottom = (110 + timerOffsetY) + "px";
                        _timer.lastLayoutSig = layoutSig;
                    }

                    // Soul source panel
                    var source = _timer.source;
                    if (!_isPanelValid(source)) {
                        source = null;
                        if (nowMs >= (_timer.nextSourceSearchMs || 0)) {
                            source = _findUnsecuredSoulsSource(root);
                            _timer.nextSourceSearchMs = source ? 0 : (nowMs + UNSECURED_SOULS_SOURCE_SEARCH_MS);
                            _timer.source = source;
                        }
                    }

                    var rawText = (source && typeof source.text === "string") ? source.text : "";
                    var isUnresolved = !rawText || rawText.charAt(0) === "{";
                    var souls = isUnresolved ? 0 : _parseUnsecuredSoulsValue(rawText);

                    // EMA rate tracking
                    if (!isUnresolved) {
                        if (_timer.lastSouls >= 0 && _timer.lastSampleMs > 0) {
                            var dtSec = (nowMs - _timer.lastSampleMs) / 1000.0;
                            var delta = _timer.lastSouls - souls;
                            if (dtSec >= (UNSECURED_SOULS_MIN_SAMPLE_MS / 1000.0) && delta > 0) {
                                var instRate = delta / dtSec;
                                if (isFinite(instRate) && instRate > UNSECURED_SOULS_RATE_MIN) {
                                    if (!isFinite(_timer.rateEma) || _timer.rateEma <= 0) {
                                        _timer.rateEma = instRate;
                                    } else {
                                        _timer.rateEma = _timer.rateEma + ((instRate - _timer.rateEma) * UNSECURED_SOULS_RATE_EMA_ALPHA);
                                    }
                                    _timer.rateLastUpdateMs = nowMs;
                                }
                            } else if (delta < 0) {
                                _timer.rateEma = 0;
                                _timer.rateLastUpdateMs = 0;
                            }
                        }
                        _timer.lastSouls = souls;
                        _timer.lastSampleMs = nowMs;
                    }

                    // ETA computation
                    var etaSec = 0;
                    if (!isUnresolved && souls > 0) {
                        var gameMin = _getGameSecondsForUrn(root) / 60.0;
                        var fallbackEtaSec = _estimateUnsecuredSoulsEtaFallbackSec(souls, gameMin);
                        var rateAgeMs = nowMs - (_timer.rateLastUpdateMs || 0);
                        var rateFresh = (_timer.rateLastUpdateMs > 0) && rateAgeMs <= UNSECURED_SOULS_RATE_STALE_MS;
                        if (rateFresh && isFinite(_timer.rateEma) && _timer.rateEma > UNSECURED_SOULS_RATE_MIN) {
                            etaSec = souls / _timer.rateEma;
                        }
                        if (!isFinite(etaSec) || etaSec <= 0) {
                            etaSec = fallbackEtaSec;
                        } else if (isFinite(fallbackEtaSec) && fallbackEtaSec > 0 && etaSec > (fallbackEtaSec * UNSECURED_SOULS_RATE_TO_FALLBACK_MAX_RATIO)) {
                            etaSec = fallbackEtaSec;
                        }
                        if (isFinite(etaSec) && etaSec > UNSECURED_SOULS_ETA_MAX_SEC) etaSec = UNSECURED_SOULS_ETA_MAX_SEC;
                        if (isFinite(etaSec) && etaSec > 0) _timer.etaEndMs = nowMs + Math.round(etaSec * 1000);
                    } else if (souls <= 0) {
                        _timer.etaEndMs = 0;
                        _timer.rateEma = 0;
                        _timer.rateLastUpdateMs = 0;
                    }

                    var etaRemainingSec = 0;
                    if (_timer.etaEndMs > nowMs) etaRemainingSec = (_timer.etaEndMs - nowMs) / 1000.0;

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
                    if (classSig !== _timer.lastClassSig) {
                        overlay.SetHasClass("danger_1", dangerLevel === 1);
                        overlay.SetHasClass("danger_2", dangerLevel === 2);
                        overlay.SetHasClass("danger_3", dangerLevel === 3);
                        overlay.SetHasClass("danger_4", dangerLevel === 4);
                        overlay.SetHasClass("has_souls", souls > 0);
                        overlay.SetHasClass("is_safe", souls <= 0 && !isUnresolved);
                        overlay.SetHasClass("is_syncing", isUnresolved);
                        _timer.lastClassSig = classSig;
                    }

                    if (stateLabel && statusText !== _timer.lastStatus) {
                        stateLabel.text = statusText;
                        _timer.lastStatus = statusText;
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
                onSettingsChanged: function() {
                    _timer.lastLayoutSig = "";
                    _tick();
                }
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

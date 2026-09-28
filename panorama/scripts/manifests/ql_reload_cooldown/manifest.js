// manifests/ql_reload_cooldown/manifest.js
// =============================================================================
// QOLLOCK — Reload Cooldown Numeric Countdown
// =============================================================================
// OWNS:        Calculated reload time countdown label on the crosshair reticle.
//              Reads radial clip angle of attack_delayed_progress_bar and computes
//              EMA-smoothed countdown in seconds.
// DOES NOT OWN: Ammo status / magazine panel styling (ql_ammo)
// DEPENDS ON:  QOL.core.FeatureRegistry, QOL.core.Scheduler
// CONFIG KEYS: ENABLE_RELOAD_COOLDOWN, RELOAD_COOLDOWN_OPACITY,
//              RELOAD_COOLDOWN_SIZE, RELOAD_COOLDOWN_X_OFFSET,
//              RELOAD_COOLDOWN_Y_OFFSET
// PATTERN:     Adaptive Polling (20Hz active reload / 2Hz idle). Self-scheduling.
// =============================================================================

(function () {
    "use strict";

    var FR = QOL.core && QOL.core.FeatureRegistry;
    if (!FR) {
        $.Msg("[QOLLock] ql_reload_cooldown: FeatureRegistry not found — aborting");
        return;
    }

    var FEATURE_ID = "ql_reload_cooldown";
    // rate-exempt: 20Hz (0.05s) active reload radial progress animation
    var FAST_INTERVAL_SEC = 0.05;
    var IDLE_INTERVAL_SEC = 0.50;

    // Native clips can include a center ("50% 50%,") before the first angle.
    var _RE_RADIAL_CLIP_START = /radial\s*\([^)]*?([+\-]?\d+(?:\.\d+)?)\s*deg/i;
    var _RE_RADIAL_CLIP_END = /,\s*([+\-]?\d+(?:\.\d+)?)\s*deg\s*\)/i;

    var _nowMs = QOL.utils.PerfNowMs;

    var _isAlive = QOL.utils.IsPanelValid;

    function _parseRadialClipStartDeg(clipText) {
        if (!clipText || clipText.length === 0) return null;
        var match = _RE_RADIAL_CLIP_START.exec(String(clipText));
        if (!match || match.length < 2) return null;
        var val = parseFloat(match[1]);
        return isFinite(val) ? val : null;
    }

    function _parseRadialClipEndDeg(clipText) {
        if (!clipText || clipText.length === 0) return null;
        var match = _RE_RADIAL_CLIP_END.exec(String(clipText));
        if (!match || match.length < 2) return null;
        var val = parseFloat(match[1]);
        return isFinite(val) ? val : null;
    }

    function _hasClassInHierarchy(panel, className) {
        var cur = panel;
        var depth = 0;
        while (_isAlive(cur) && depth < 16) {
            if (cur.BHasClass && cur.BHasClass(className)) return true;
            cur = cur.GetParent ? cur.GetParent() : null;
            depth++;
        }
        return false;
    }

    FR.register({
        id: FEATURE_ID,
        enableKey: "ENABLE_RELOAD_COOLDOWN",
        enabledByDefault: false,
        settings: [
            { key: "ENABLE_RELOAD_COOLDOWN", type: "toggle", default: false },
            { key: "ENABLE_HIDE_RELOAD_ICON", type: "toggle", invert: true, default: false, label: "Icon", description: "The icon that replaces your crosshair when reloading." },
            { key: "ENABLE_HIDE_RELOAD_CIRCLE", type: "toggle", invert: true, default: false, label: "Circle", description: "The circle countdown for when you are reloading." },
            { key: "RELOAD_COOLDOWN_OPACITY", type: "slider", min: 0, max: 1, step: 0.05, default: 0.6 },
            { key: "RELOAD_COOLDOWN_SIZE", type: "slider", min: 16, max: 60, step: 1, default: 28 },
            { key: "RELOAD_COOLDOWN_X_OFFSET", type: "slider", min: -75, max: 75, step: 1, default: 0 },
            { key: "RELOAD_COOLDOWN_Y_OFFSET", type: "slider", min: -75, max: 75, step: 1, default: 0 }
        ],
        create: function (ctx) {
            var _loop = null;
            var _reticleStatus = null;
            var _reloadProgressBar = null;
            var _cooldownLabel = null;

            // Runtime tracking state
            var _styleSig = "";
            var _lastDeg = null;
            var _lastMs = 0;
            var _direction = 0;
            var _slopeEma = null;
            var _displayLock = null;
            var _labelVisible = false;

            function _resetEstimate() {
                _lastDeg = null;
                _lastMs = 0;
                _direction = 0;
                _slopeEma = null;
                _displayLock = null;
            }

            function _getHud() {
                return QOL.core?.panel?.findHud ? QOL.core.panel.findHud() : (QOL.core?.hud?.findHud ? QOL.core.hud.findHud() : null);
            }

            function _hideLabel() {
                if (_isAlive(_cooldownLabel)) {
                    if (_labelVisible) {
                        _cooldownLabel.style.visibility = "collapse";
                        _labelVisible = false;
                    }
                    if (_cooldownLabel.text !== "") _cooldownLabel.text = "";
                }
                _resetEstimate();
            }

            function _update(hud, cfg) {
                var enabled = !!cfg.ENABLE_RELOAD_COOLDOWN;
                if (!enabled) {
                    _hideLabel();
                    if (_loop) _loop.reschedule(IDLE_INTERVAL_SEC);
                    return;
                }

                if (!_isAlive(_reticleStatus)) {
                    _reticleStatus = hud.FindChildTraverse ? hud.FindChildTraverse("reticle_status") : null;
                }

                if (!_isAlive(_reloadProgressBar)) {
                    _reloadProgressBar = _reticleStatus ? _reticleStatus.FindChildTraverse("attack_delayed_progress_bar") : null;
                    if (!_reloadProgressBar && hud.FindChildTraverse) {
                        _reloadProgressBar = hud.FindChildTraverse("attack_delayed_progress_bar");
                    }
                }

                if (!_isAlive(_reticleStatus) || !_isAlive(_reloadProgressBar)) {
                    _hideLabel();
                    if (_loop) _loop.reschedule(IDLE_INTERVAL_SEC);
                    return;
                }

                if (!_isAlive(_cooldownLabel)) {
                    _cooldownLabel = _reticleStatus.FindChildTraverse("QOLReloadCooldownText");
                    if (!_cooldownLabel) {
                        _cooldownLabel = $.CreatePanel("Label", _reticleStatus, "QOLReloadCooldownText");
                    }
                    _styleSig = "";
                    _labelVisible = false;
                    if (_cooldownLabel) {
                        _cooldownLabel.hittest = false;
                        _cooldownLabel.hittestchildren = false;
                    }
                }

                if (!_isAlive(_cooldownLabel)) {
                    _resetEstimate();
                    if (_loop) _loop.reschedule(IDLE_INTERVAL_SEC);
                    return;
                }

                // Apply styling (diffing signature)
                var opacity = (cfg.RELOAD_COOLDOWN_OPACITY !== undefined && cfg.RELOAD_COOLDOWN_OPACITY !== null) ? parseFloat(cfg.RELOAD_COOLDOWN_OPACITY) : 0.6;
                if (!isFinite(opacity)) opacity = 0.6;
                if (opacity < 0) opacity = 0; if (opacity > 1) opacity = 1;

                var size = (cfg.RELOAD_COOLDOWN_SIZE !== undefined && cfg.RELOAD_COOLDOWN_SIZE !== null) ? Math.round(Number(cfg.RELOAD_COOLDOWN_SIZE)) : 28;
                if (!isFinite(size)) size = 28;
                if (size < 16) size = 16; if (size > 60) size = 60;

                var offX = (cfg.RELOAD_COOLDOWN_X_OFFSET !== undefined && cfg.RELOAD_COOLDOWN_X_OFFSET !== null) ? Math.round(Number(cfg.RELOAD_COOLDOWN_X_OFFSET)) : 0;
                if (!isFinite(offX)) offX = 0;
                if (offX < -75) offX = -75; if (offX > 75) offX = 75;

                var offY = (cfg.RELOAD_COOLDOWN_Y_OFFSET !== undefined && cfg.RELOAD_COOLDOWN_Y_OFFSET !== null) ? Math.round(Number(cfg.RELOAD_COOLDOWN_Y_OFFSET)) : 0;
                if (!isFinite(offY)) offY = 0;
                if (offY < -75) offY = -75; if (offY > 75) offY = 75;

                var sig = opacity.toFixed(2) + "|" + size + "|" + offX + "|" + offY;
                if (_styleSig !== sig) {
                    try { _cooldownLabel.style.opacity = String(opacity); } catch (eO) {}
                    _cooldownLabel.style.fontSize = size + "px";
                    _cooldownLabel.style.marginLeft = offX + "px";
                    _cooldownLabel.style.marginTop = (-offY) + "px";
                    _styleSig = sig;
                }

                // Read clip property
                var clipText = "";
                try {
                    if (_reloadProgressBar.style && _reloadProgressBar.style.clip) {
                        clipText = String(_reloadProgressBar.style.clip);
                    }
                } catch (eClip) {}
                if (!clipText && _reloadProgressBar.GetAttributeString) {
                    try {
                        var styleAttr = _reloadProgressBar.GetAttributeString("style", "");
                        if (styleAttr) {
                            var cm = /clip\s*:\s*([^;]+)/i.exec(styleAttr);
                            if (cm && cm[1]) clipText = cm[1];
                        }
                    } catch (eAttr) {}
                }

                var currentDeg = _parseRadialClipStartDeg(clipText);
                if (currentDeg === null) currentDeg = _parseRadialClipEndDeg(clipText);

                var hasActiveReload = false;
                if (_reloadProgressBar.BHasClass && _reloadProgressBar.BHasClass("has_active_reload")) hasActiveReload = true;
                if (!hasActiveReload) hasActiveReload = _hasClassInHierarchy(_reloadProgressBar, "has_active_reload");
                if (!hasActiveReload) {
                    hasActiveReload = _hasClassInHierarchy(_reloadProgressBar, "attack_delayed") ||
                                      _hasClassInHierarchy(_reloadProgressBar, "reloading");
                }
                if (!hasActiveReload) {
                    try {
                        hasActiveReload = (String(_reloadProgressBar.style.visibility || "").toLowerCase() === "visible");
                    } catch (eV) {}
                }

                if (!hasActiveReload || currentDeg === null || !isFinite(currentDeg) || currentDeg <= 0.01) {
                    _hideLabel();
                    if (_loop) _loop.reschedule(IDLE_INTERVAL_SEC);
                    return;
                }

                // We are in active reload! Fast polling 20Hz.
                if (_loop) _loop.reschedule(FAST_INTERVAL_SEC);

                var now = _nowMs();
                if (_lastDeg !== null && _lastMs > 0) {
                    var dtSec = (now - _lastMs) / 1000.0;
                    var dDeg = _lastDeg - currentDeg;

                    if (dDeg < -180 || dDeg > 360) {
                        _slopeEma = null;
                        _displayLock = null;
                        _direction = 0;
                    } else if (dtSec > 0.01 && dtSec < 1.0 && Math.abs(dDeg) > 0.01) {
                        if (_direction === 0 && Math.abs(dDeg) >= 0.05) {
                            _direction = (dDeg > 0) ? 1 : -1;
                        }
                        var signedDelta = 0;
                        if (_direction >= 0 && dDeg > 0) signedDelta = dDeg;
                        else if (_direction <= 0 && dDeg < 0) signedDelta = -dDeg;

                        if (signedDelta > 0) {
                            var slope = signedDelta / dtSec;
                            if (isFinite(slope) && slope > 0.001 && slope < 5000) {
                                _slopeEma = (_slopeEma === null) ? slope : ((_slopeEma * 0.75) + (slope * 0.25));
                            }
                        }
                    }
                }
                _lastDeg = currentDeg;
                _lastMs = now;

                var cooldownText = "";
                if (_slopeEma !== null && _slopeEma > 0.001) {
                    var remainingDeg = currentDeg;
                    if (_direction < 0) remainingDeg = 360 - currentDeg;
                    if (!isFinite(remainingDeg) || remainingDeg < 0) remainingDeg = 0;
                    var remainingSec = remainingDeg / _slopeEma;

                    if (isFinite(remainingSec) && remainingSec >= 0) {
                        if (_displayLock !== null && isFinite(_displayLock)) {
                            remainingSec = Math.min(remainingSec, _displayLock);
                        }
                        if (remainingSec >= 1) {
                            var intVal = Math.ceil(remainingSec);
                            _displayLock = intVal;
                            cooldownText = String(intVal);
                        } else {
                            _displayLock = remainingSec;
                            cooldownText = (Math.round(remainingSec * 10) / 10).toFixed(1);
                        }
                    }
                }

                if (cooldownText && cooldownText.length > 0) {
                    if (_cooldownLabel.text !== cooldownText) _cooldownLabel.text = cooldownText;
                    if (!_labelVisible) {
                        _cooldownLabel.style.visibility = "visible";
                        _labelVisible = true;
                    }
                } else {
                    if (_labelVisible) {
                        _cooldownLabel.style.visibility = "collapse";
                        _labelVisible = false;
                    }
                    if (_cooldownLabel.text !== "") _cooldownLabel.text = "";
                }
            }

            function _tick() {
                var hud = _getHud();
                if (!hud) return;
                var cfg = ctx.config.view ? ctx.config.view() : ctx.config.all();
                _update(hud, cfg);
            }

            return {
                onEnable: function () {
                    var S = QOL.core && QOL.core.Scheduler;
                    if (S && S.createPollLoop) {
                        _loop = S.createPollLoop(_tick, FAST_INTERVAL_SEC, FEATURE_ID);
                    }
                },
                onDisable: function () {
                    if (_loop) { _loop.stop(); _loop = null; }
                    _hideLabel();
                },
                onSettingsChanged: function () {
                    _tick();
                    var hud = _getHud();
                    if (hud && QOL.core && QOL.core.hud && QOL.core.hud.applyRootClasses) {
                        var cfg = ctx.config.view ? ctx.config.view() : ctx.config.all();
                        QOL.core.hud.applyRootClasses(hud, cfg, _nowMs(), false);
                    }
                }
            };
        },
        test: function (ctx) {
            try {
                var passed = (ctx && ctx.id === FEATURE_ID);
                return {
                    passed: passed,
                    name: "ql_reload_cooldown manifest check",
                    message: passed ? "" : "Invalid feature ID",
                    assertions: [{ passed: passed, name: "Feature ID matches" }]
                };
            } catch (e) {
                return { passed: false, name: "ql_reload_cooldown manifest check", message: (e && e.message ? e.message : String(e)) };
            }
        }
    });
})();

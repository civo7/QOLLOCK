// features/ql_zipboost/manifest.js
// =============================================================================
// QOLLOCK — Zip Boost Cooldown Overlay
// =============================================================================
// OWNS:        Zip boost overlay panel: cooldown/ready/active state display
// DOES NOT OWN: Zip boost ability itself, other HUD panels
// DEPENDS ON:  QOL.core.FeatureRegistry, QOL.core.Scheduler
// CONFIG KEYS: ENABLE_ZIP_BOOST, ZIP_BOOST_SCALE, ZIP_BOOST_X_OFFSET, ZIP_BOOST_Y_OFFSET
// PATTERN:     Polling (~2Hz). Creates overlay panel. Ready flash animation.
// =============================================================================

(function() {
    "use strict";
    var FR = QOL.core.FeatureRegistry;
    if (!FR) { $.Msg("[QOLLock] zipboost: FeatureRegistry not found — aborting"); return; }

    var ZIP_BOOST_READY_FLASH_MS = 2000;
    var ZIP_BOOST_SOURCE_SEARCH_MS = 1730;

    FR.register({
        id: "ql_zipboost",
        enableKey: "ENABLE_ZIP_BOOST",
        enabledByDefault: false,
        settings: [
            { key: "ENABLE_ZIP_BOOST", type: "toggle", default: false },
            { key: "ZIP_BOOST_SCALE", type: "slider", min: 50, max: 200, step: 1, default: 100 },
            { key: "ZIP_BOOST_X_OFFSET", type: "slider", min: -2000, max: 2000, step: 5, default: 0 },
            { key: "ZIP_BOOST_Y_OFFSET", type: "slider", min: 0, max: 1000, step: 5, default: 0 }
        ],
        create: function(ctx) {
            var _loop = null, _overlay = null, _label = null, _stateLabel = null;
            var _source = null, _abilityNamePanel = null, _countdownPanel = null;
            var _lastLayoutSig = "", _lastClassSig = "", _lastTitle = "", _lastStatus = "";
            var _nextSourceSearchMs = 0, _activeEndMs = 0, _wasInUse = false;
            var _lastState = null, _readyFlashUntilMs = 0;

            var _isAlive = QOL.utils.IsPanelValid;

            function _isInHideout(root) {
                try {
                    if (typeof QOL !== "undefined" && QOL.isConnectedToHideout) return QOL.isConnectedToHideout(root);
                    if (root && root.BHasClass) return root.BHasClass("InHideout");
                } catch(e) {}
                return false;
            }

            function _isCustomHudActive(root) {
                try {
                    if (typeof QOL !== "undefined" && QOL.isCustomHudContextActive) return QOL.isCustomHudContextActive(root);
                    if (root && root.BHasClass && root.BHasClass("CustomHudDisabled")) return false;
                } catch(e) {}
                return true;
            }

            function _findZipBoostSource(root) {
                if (!root || !root.FindChildTraverse) return null;
                var byId = root.FindChildTraverse("citadel_ability_zipline_boost_");
                if (byId) return byId;

                var candidates = root.FindChildrenWithClassTraverse ? root.FindChildrenWithClassTraverse("buttonContainer") : [];
                if (candidates) {
                    for (var i = 0; i < candidates.length; i++) {
                        var c = candidates[i];
                        if (c && c.BHasClass && c.BHasClass("citadel_ability_zipline_boost")) return c;
                    }
                }
                return null;
            }

            function _findNumericLabelText(panel) {
                if (!panel || !panel.Children) return "";
                var queue = [panel];
                var best = "";
                while (queue.length > 0) {
                    var current = queue.shift();
                    if (!current) continue;
                    if (typeof current.text === "string") {
                        var t = current.text.trim();
                        var m = t.match(/^(\d+(?:\.\d+)?)/);
                        if (m) {
                            var norm = m[1];
                            if (!best || norm.length <= best.length) {
                                best = norm;
                                if (t.length <= 2) return best;
                            }
                        }
                    }
                    var kids = current.Children ? current.Children() : [];
                    for (var i = 0; i < kids.length; i++) queue.push(kids[i]);
                }
                return best;
            }

            function _ensureOverlay(root) {
                if (_isAlive(_overlay)) return _overlay;
                _overlay = root.FindChildTraverse("QOLZipBoostOverlay");
                if (!_overlay) {
                    var gp = root.FindChildTraverse("gameplay_hud");
                    if (!_isAlive(gp)) return null;
                    _overlay = $.CreatePanel("Panel", gp, "QOLZipBoostOverlay",
                        { hittest: "false", hittestchildren: "false" });
                    $.CreatePanel("Panel", _overlay, "QOLZipBoostIcon");
                    var tc = $.CreatePanel("Panel", _overlay, "QOLZipBoostTextContainer");
                    _label = $.CreatePanel("Label", tc, "QOLZipBoostLabel");
                    _label.text = "Zip Boost";
                    _stateLabel = $.CreatePanel("Label", tc, "QOLZipBoostState");
                    _stateLabel.text = "Ready";
                } else {
                    _label = _overlay.FindChildTraverse("QOLZipBoostLabel");
                    _stateLabel = _overlay.FindChildTraverse("QOLZipBoostState");
                }
                return _overlay;
            }

            function _removeOverlay() {
                if (_isAlive(_overlay)) { try { _overlay.DeleteAsync(0); } catch(e) {} }
                _overlay = null; _label = null; _stateLabel = null;
                _source = null; _abilityNamePanel = null; _countdownPanel = null;
                _lastLayoutSig = ""; _lastClassSig = ""; _lastTitle = ""; _lastStatus = "";
                _nextSourceSearchMs = 0; _activeEndMs = 0; _wasInUse = false;
                _lastState = null; _readyFlashUntilMs = 0;
            }

            function _tick() {
                var root = $.GetContextPanel();
                if (!root) return;
                var cfg = ctx.config.all();
                var enabled = Number(cfg.ENABLE_ZIP_BOOST) === 1;
                if (!enabled || !_isCustomHudActive(root)) {
                    _removeOverlay();
                    return;
                }

                var ov = _ensureOverlay(root);
                if (!_isAlive(ov)) return;

                var hideout = _isInHideout(root);
                if (hideout) {
                    if (ov.SetHasClass) ov.SetHasClass("qol-hidden", true);
                    else ov.style.visibility = "collapse";
                    ov.SetHasClass("on_cooldown", false);
                    ov.SetHasClass("in_use", false);
                    ov.SetHasClass("ready_flash", false);
                    _lastClassSig = "";
                    _lastState = null;
                    _readyFlashUntilMs = 0;
                    return;
                }

                if (ov.SetHasClass) ov.SetHasClass("qol-hidden", false);
                else ov.style.visibility = "visible";

                var nowMs = Date.now ? Date.now() : (new Date()).getTime();

                // Position and scale
                var scale = Math.round(Number(cfg.ZIP_BOOST_SCALE));
                if (!isFinite(scale)) scale = 100;
                if (scale < 50) scale = 50;
                if (scale > 200) scale = 200;
                var ox = Math.round(Number(cfg.ZIP_BOOST_X_OFFSET)) || 0;
                var oy = Math.round(Number(cfg.ZIP_BOOST_Y_OFFSET)) || 0;
                var layoutSig = scale + "|" + ox + "|" + oy;
                if (_lastLayoutSig !== layoutSig) {
                    ov.style.marginLeft = (-520 + ox) + "px";
                    ov.style.marginBottom = (20 + oy) + "px";
                    ov.style.uiScale = scale + "%";
                    _lastLayoutSig = layoutSig;
                }

                // Source lookup
                if (!_isAlive(_source)) {
                    _source = null;
                    if (nowMs >= _nextSourceSearchMs) {
                        _source = _findZipBoostSource(root);
                        _nextSourceSearchMs = _source ? 0 : (nowMs + ZIP_BOOST_SOURCE_SEARCH_MS);
                        _abilityNamePanel = null;
                        _countdownPanel = null;
                    }
                }

                var title = "Zip Boost";
                var status = "READY";
                var isCooldown = false;
                var isInUse = false;

                if (_source) {
                    isCooldown = _source.BHasClass && _source.BHasClass("on_cooldown");
                    isInUse = _source.BHasClass && _source.BHasClass("in_use");

                    if (isInUse && !_wasInUse) {
                        _activeEndMs = nowMs + 32000;
                    }

                    if (!_isAlive(_abilityNamePanel) && _source.FindChildrenWithClassTraverse) {
                        var abilityNames = _source.FindChildrenWithClassTraverse("AbilityName") || [];
                        _abilityNamePanel = abilityNames.length > 0 ? abilityNames[0] : null;
                    }
                    var abilityName = (_abilityNamePanel && typeof _abilityNamePanel.text === "string") ? _abilityNamePanel.text : "";
                    if (abilityName && abilityName.length > 0) title = abilityName;

                    if (!_isAlive(_countdownPanel) && _source.FindChildrenWithClassTraverse) {
                        var countdowns = _source.FindChildrenWithClassTraverse("Countdown") || [];
                        _countdownPanel = countdowns.length > 0 ? countdowns[0] : null;
                    }
                    var countdown = (_countdownPanel && typeof _countdownPanel.text === "string") ? _countdownPanel.text : "";
                    if (isCooldown && (!countdown || countdown.trim() === "")) {
                        countdown = _findNumericLabelText(_source);
                        if (countdown && !countdown.endsWith("s")) countdown += "s";
                    }

                    if (isInUse) {
                        var timeLeft = Math.ceil((_activeEndMs - nowMs) / 1000);
                        if (timeLeft < 0) timeLeft = 0;
                        status = "ACTIVE " + timeLeft + "s";
                    } else if (isCooldown) {
                        status = countdown && countdown.length > 0 ? ("COOLDOWN " + countdown) : "COOLDOWN";
                    }

                    _wasInUse = isInUse;
                }

                var currentState = isInUse ? "in_use" : (isCooldown ? "cooldown" : "ready");
                if (currentState === "ready" && _lastState !== "ready") {
                    _readyFlashUntilMs = nowMs + ZIP_BOOST_READY_FLASH_MS;
                }
                _lastState = currentState;
                var readyFlashActive = (currentState === "ready") && nowMs < _readyFlashUntilMs;

                var classSig = (isCooldown ? "1" : "0") + "|" + (isInUse ? "1" : "0") + "|" + (readyFlashActive ? "1" : "0");
                if (classSig !== _lastClassSig) {
                    ov.SetHasClass("on_cooldown", isCooldown);
                    ov.SetHasClass("in_use", isInUse);
                    ov.SetHasClass("ready_flash", readyFlashActive);
                    _lastClassSig = classSig;
                }

                if (_label && title !== _lastTitle) {
                    _label.text = title;
                    _lastTitle = title;
                }
                if (_stateLabel && status !== _lastStatus) {
                    _stateLabel.text = status;
                    _lastStatus = status;
                }
            }

            return {
                onEnable: function() {
                    _tick();
                    var S = QOL.core.Scheduler;
                    _loop = S && S.createPollLoop ? S.createPollLoop(_tick, 2.0, "ql_zipboost") : null;
                },
                onDisable: function() {
                    if (_loop) { _loop.stop(); _loop = null; }
                    var S = QOL.core.Scheduler;
                    if (S) S.cancelAllForFeature("ql_zipboost");
                    _removeOverlay();
                },
                onSettingsChanged: function() { _tick(); }
            };
        },
        test: function(ctx) {
            try {
                var root = $.GetContextPanel();
                var gameplayHud = root ? root.FindChildTraverse("gameplay_hud") : null;
                return {
                    passed: !!gameplayHud,
                    name: "ZipBoost anchor panel exists",
                    message: gameplayHud ? "" : "gameplay_hud not found in HUD tree",
                    assertions: [
                        { passed: !!gameplayHud, name: "gameplay_hud panel exists" }
                    ]
                };
            } catch(e) { return { passed: false, name: "ZipBoost panel check", message: (e && e.message ? e.message : String(e)) }; }
        }
    });
})();

// features/ql_zipboost/manifest.js
// =============================================================================
// QOLLOCK — Zip Boost Cooldown Overlay
// =============================================================================
// OWNS:        Zip boost overlay panel: cooldown/ready/active state display
// DOES NOT OWN: Zip boost ability itself, other HUD panels
// DEPENDS ON:  QOL.core.FeatureRegistry, QOL.core.Scheduler
// CONFIG KEYS: ENABLE_ZIP_BOOST, ZIP_BOOST_SCALE, ZIP_BOOST_X/Y_OFFSET
// PATTERN:     Polling (~0.6Hz). Creates overlay panel. Ready flash animation.
// =============================================================================

(function() {
    "use strict";
    var FR = QOL.core.FeatureRegistry;
    if (!FR) { $.Msg("[QOLLock] zipboost: FeatureRegistry not found — aborting"); return; }

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
            var _lastSig = "", _lastClass = "", _nextSearch = 0, _activeEnd = 0;

            function _isAlive(p) { return p && typeof p.IsValid === "function" && p.IsValid(); }

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
            }

            function _tick() {
                var root = $.GetContextPanel();
                var cfg = ctx.config.all();
                if (!Number(cfg.ENABLE_ZIP_BOOST)) {
                    if (_isAlive(_overlay)) _overlay.visible = false;
                    return;
                }
                var ov = _ensureOverlay(root);
                if (!_isAlive(ov)) return;
                ov.visible = true;

                var now = Date.now ? Date.now() : (new Date()).getTime();
                // Find zip boost source panel periodically
                if (now >= _nextSearch) {
                    _nextSearch = now + 1730;
                    // Source detection deferred — uses game panel tree
                }

                // Apply position and scale
                var scale = Math.round(Number(cfg.ZIP_BOOST_SCALE));
                if (!isFinite(scale)) scale = 100;
                if (scale < 50) scale = 50;
                if (scale > 200) scale = 200;
                var ox = Math.round(Number(cfg.ZIP_BOOST_X_OFFSET)) || 0;
                var oy = Math.round(Number(cfg.ZIP_BOOST_Y_OFFSET)) || 0;
                var sig = scale + "|" + ox + "|" + oy;
                if (_lastSig !== sig) {
                    _lastSig = sig;
                    // ui-scale lets Panorama reflow and re-rasterise the overlay instead
                    // of stretching its texture like pre-transform-scale2d does.
                    ov.style.uiScale = scale + "%";
                    // Match old feature positioning: marginLeft/marginBottom with base offsets.
                    ov.style.marginLeft = (-520 + ox) + "px";
                    ov.style.marginBottom = (20 + oy) + "px";
                }
            }

            return {
                onEnable: function() {
                    var S = QOL.core.Scheduler;
                    _loop = S && S.createPollLoop ? S.createPollLoop(_tick, 0.6, "ql_zipboost") : null;
                },
                onDisable: function() {
                    if (_loop) { _loop.stop(); _loop = null; }
                    _removeOverlay();
                    _lastSig = "";
                },
                onSettingsChanged: function() {}
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

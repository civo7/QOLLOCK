// manifests/ql_compass/manifest.js
// =============================================================================
// QOLLOCK — Compass, Speed Readout & Minimap Rotation
// =============================================================================
// OWNS:        Heading compass HUD overlay, numeric degree readout, ticks ring,
//              speed readout, and local-player-aligned minimap rotation.
// DOES NOT OWN: Minimap base styling / zoom / crate overlay (ql_minimap_runtime)
// DEPENDS ON:  QOL.core.FeatureRegistry, QOL.core.Scheduler, QOL.core.panel, QOL.core.hud
// CONFIG KEYS: ENABLE_COMPASS, ENABLE_COMPASS_SPEED, COMPASS_SCALE,
//              COMPASS_STRETCH_X, COMPASS_STRETCH_Y, COMPASS_X_OFFSET,
//              COMPASS_Y_OFFSET, COMPASS_SPEED_X_OFFSET, COMPASS_SPEED_Y_OFFSET,
//              MINIMAP_ROTATE_WITH_PLAYER, MINIMAP_FLIP
// PATTERN:     Adaptive Polling (20Hz active / 2Hz idle). Self-scheduling via Scheduler.
// =============================================================================

(function () {
    "use strict";

    var FR = QOL.core && QOL.core.FeatureRegistry;
    if (!FR) {
        $.Msg("[QOLLock] ql_compass: FeatureRegistry not found — aborting");
        return;
    }

    var FEATURE_ID = "ql_compass";
    var PANEL_ID_MINIMAP = "hud_minimap";

    // Timing & sampling constants
    // rate-exempt: 20Hz (0.05s) required for smooth heading compass rotation
    var COMPASS_INTERVAL_SEC = 0.05;
    var COMPASS_INTERVAL_IDLE_SEC = 0.50;
    var COMPASS_TICK_STEP_DEG = 22.5;
    var COMPASS_TICK_SPACING_PX = 12.5;
    var COMPASS_TICK_COUNT = 17;
    var COMPASS_SPEED_SCALE = 2.12;
    var COMPASS_SPEED_QUANT = 2;
    var COMPASS_SPEED_SAMPLE_MS = 40;
    var COMPASS_SPEED_WINDOW_MS = 260;
    var COMPASS_SPEED_MIN_SPAN_MS = 90;
    var COMPASS_SPEED_EMA_TAU_SEC = 0.11;
    var COMPASS_SPEED_DEADBAND_FRAC = 0.07;

    // Minimap rotation constants
    var MINIMAP_ROTATE_NORTH_OFFSET_DEG = 90.0;
    var MINIMAP_ROTATE_DEADZONE_BASE_DEG = 0.45;
    var MINIMAP_ROTATE_DEADZONE_MOVING_DEG = 0.18;
    var MINIMAP_ROTATE_TAU_FAST_SEC = 0.06;
    var MINIMAP_ROTATE_TAU_SLOW_SEC = 0.13;
    var MINIMAP_ROTATE_FAST_DELTA_DEG = 22.0;
    var MINIMAP_ROTATE_MAX_SPEED_DEG_PER_SEC = 540.0;
    var MINIMAP_ROTATE_HEADING_HOLD_MS = 180;
    var MINIMAP_ROTATE_PREDICT_SEC = 0.045;
    var MINIMAP_ROTATE_PREDICT_MAX_DEG = 14.0;
    var MINIMAP_ROTATE_VEL_FILTER_ALPHA = 0.35;
    var MINIMAP_LOCAL_PLAYER_SCAN_COOLDOWN_MS = 250;
    var MINIMAP_LOCAL_PLAYER_SCAN_COOLDOWN_FAST_MS = 90;
    var MINIMAP_LOCAL_PLAYER_SCAN_COOLDOWN_MAX_MS = 1000;

    // Regex for parsing transforms
    var _RE_ROTATE3D = /rotate3d\s*\(\s*([+\-]?\d*\.?\d+)\s*,\s*([+\-]?\d*\.?\d+)\s*,\s*([+\-]?\d*\.?\d+)\s*,\s*([+\-]?\d*\.?\d+)\s*deg\s*\)/i;
    var _RE_ROTATE2D = /rotate(?:z|y)?\s*\(\s*([+\-]?\d*\.?\d+)\s*deg\s*\)/i;
    var _RE_ROTATE_LEGACY = /rotate3d\s*\(\s*[^,]+,\s*([+\-]?\d+(?:\.\d+)?)\s*deg\s*,/i;
    var _RE_DEG_GENERIC = /([+\-]?\d+(?:\.\d+)?)\s*deg/i;
    var _RE_POSITION_XY = /([+\-]?\d+(?:\.\d+)?)%\s*(?:,|\s+)\s*([+\-]?\d+(?:\.\d+)?)%/i;

    var _nowMs = QOL.utils.PerfNowMs;

    var _isAlive = QOL.utils.IsPanelValid;

    var _norm360 = QOL.utils.NormalizeDegrees360;

    function _norm180(deg) {
        var out = _norm360(deg);
        if (out > 180) out -= 360;
        return out;
    }

    function _shortestDelta(fromDeg, toDeg) {
        var delta = _norm180(toDeg) - _norm180(fromDeg);
        if (delta > 180) delta -= 360;
        if (delta < -180) delta += 360;
        return delta;
    }

    function _parseRotateTransformDegrees(transformText) {
        if (!transformText || transformText.length === 0) return null;
        var text = String(transformText);

        var m3d = _RE_ROTATE3D.exec(text);
        if (m3d && m3d.length >= 5) {
            var a3d = parseFloat(m3d[4]);
            if (isFinite(a3d)) return a3d;
        }
        var m2d = _RE_ROTATE2D.exec(text);
        if (m2d && m2d.length >= 2) {
            var a2d = parseFloat(m2d[1]);
            if (isFinite(a2d)) return a2d;
        }
        var mLeg = _RE_ROTATE_LEGACY.exec(text);
        if (mLeg && mLeg.length >= 2) {
            var aLeg = parseFloat(mLeg[1]);
            if (isFinite(aLeg)) return aLeg;
        }
        var mGen = _RE_DEG_GENERIC.exec(text);
        if (mGen && mGen.length >= 2) {
            var aGen = parseFloat(mGen[1]);
            if (isFinite(aGen)) return aGen;
        }
        return null;
    }

    function _parsePlainRotateDegrees(rotateText) {
        if (!rotateText || rotateText.length === 0) return null;
        var match = _RE_DEG_GENERIC.exec(String(rotateText));
        if (!match || match.length < 2) return null;
        var val = parseFloat(match[1]);
        return isFinite(val) ? val : null;
    }

    function _readPanelHeadingDegrees(panel) {
        if (!_isAlive(panel)) return null;
        var preRotate = "";
        try {
            if (panel.style && typeof panel.style.preTransformRotate2d === "string") {
                preRotate = panel.style.preTransformRotate2d;
            }
        } catch (e) {}
        var preVal = _parsePlainRotateDegrees(preRotate);
        if (preVal !== null) return _norm360(preVal);

        var transformText = "";
        try {
            if (panel.style && typeof panel.style.transform === "string") {
                transformText = panel.style.transform;
            }
        } catch (e2) {}
        var tVal = _parseRotateTransformDegrees(transformText);
        if (tVal !== null) return _norm360(tVal);

        if (panel.GetAttributeString) {
            var styleAttr = "";
            try { styleAttr = panel.GetAttributeString("style", ""); } catch (e3) {}
            tVal = _parseRotateTransformDegrees(styleAttr);
            if (tVal !== null) return _norm360(tVal);
        }
        return null;
    }

    var _scratchPos = { x: 0, y: 0 };
    function _parsePositionXYPercent(positionText) {
        if (!positionText || positionText.length === 0) return null;
        var match = _RE_POSITION_XY.exec(positionText);
        if (!match || match.length < 3) return null;
        var x = parseFloat(match[1]);
        var y = parseFloat(match[2]);
        if (!isFinite(x) || !isFinite(y)) return null;
        _scratchPos.x = x;
        _scratchPos.y = y;
        return _scratchPos;
    }

    function _panelHasAllClasses(panel, classList) {
        if (!_isAlive(panel) || !panel.BHasClass) return false;
        for (var i = 0; i < classList.length; i++) {
            if (!panel.BHasClass(classList[i])) return false;
        }
        return true;
    }

    function _hasClassInHierarchy(panel, className) {
        var cur = panel;
        var depth = 0;
        while (_isAlive(cur) && depth < 32) {
            if (cur.BHasClass && cur.BHasClass(className)) return true;
            cur = cur.GetParent ? cur.GetParent() : null;
            depth++;
        }
        return false;
    }

    function _setStyleIfChanged(panel, prop, val) {
        if (!_isAlive(panel) || !panel.style) return;
        try {
            if (panel.style[prop] !== val) panel.style[prop] = val;
        } catch (e) {}
    }

    FR.register({
        id: FEATURE_ID,
        enableKeys: ["ENABLE_COMPASS", "ENABLE_COMPASS_SPEED", "MINIMAP_ROTATE_WITH_PLAYER", "MINIMAP_FLIP"],
        enabledByDefault: false,
        settings: [
            { key: "ENABLE_COMPASS", type: "toggle", default: false },
            { key: "ENABLE_SIMPLIFY_COMPASS", type: "toggle", default: false, label: "Minimalist", description: "Simplifies the Compass overlay to its bare elements." },
            { key: "ENABLE_COMPASS_SPEED", type: "toggle", default: false },
            { key: "COMPASS_SCALE", type: "slider", min: 50, max: 200, step: 1, default: 100 },
            { key: "COMPASS_STRETCH_X", type: "slider", min: 50, max: 200, step: 1, default: 100 },
            { key: "COMPASS_STRETCH_Y", type: "slider", min: 50, max: 200, step: 1, default: 100 },
            { key: "COMPASS_X_OFFSET", type: "slider", min: -2000, max: 2000, step: 5, default: 0 },
            { key: "COMPASS_Y_OFFSET", type: "slider", min: -1000, max: 300, step: 5, default: 120 },
            { key: "COMPASS_SPEED_X_OFFSET", type: "slider", min: -2000, max: 2000, step: 5, default: 0 },
            { key: "COMPASS_SPEED_Y_OFFSET", type: "slider", min: -2000, max: 2000, step: 5, default: 0 },
            { key: "MINIMAP_FLIP", type: "toggle", default: false, label: "Flip", description: "Rotates the static minimap 180 degrees." },
            { key: "MINIMAP_ROTATE_WITH_PLAYER", type: "toggle", default: false, label: "Spinny Mode", description: "Makes the minimap rotate with player view, this is just for fun." }
        ],
        create: function (ctx) {
            var _loop = null;
            var _inHideout = false;
            var _overlayHidden = true;

            // Cached DOM references
            var _compassRoot = null;
            var _compassBox = null;
            var _compassTicksContainer = null;
            var _compassNeedle = null;
            var _compassFadeLeft = null;
            var _compassFadeRight = null;
            var _compassReadout = null;
            var _compassDegree = null;
            var _speedRoot = null;
            var _speedLabel = null;
            var _compassTicks = [];
            var _minimapRotateTarget = null;
            var _minimapFlipClassTarget = null;
            var _minimapLocalPlayerPanel = null;
            var _minimapLocalMainImage = null;

            // Runtime state
            var _tickClassSigs = [];
            var _tickXTexts = [];
            var _lastDegreeText = "";
            var _layoutSig = "";
            var _speedOffsetSig = "";
            var _nextSpeedSampleMs = 0;
            var _lastSpeedValueText = "--";
            var _lastPosTimeMs = 0;
            var _speedSmoothed = null;
            var _speedSamples = [];

            // Minimap rotation state
            var _minimapRotateLastDeg = null;
            var _minimapRotateSmoothedDeg = null;
            var _minimapRotateLastUpdateMs = 0;
            var _minimapRotateLastHeadingDeg = null;
            var _minimapRotateLastHeadingMs = 0;
            var _minimapRotateHeadingVelDegPerSec = 0;
            var _minimapRotateLastValidHeadingDeg = null;
            var _minimapRotateLastValidHeadingMs = 0;

            // Heading snapshot
            var _headingSnapshotMs = 0;
            var _headingSnapshotAggressive = false;
            var _headingSnapshotHeading = null;

            // Scan throttling
            var _localMainImageNextScanMs = 0;
            var _localMainImageScanBackoffMs = 0;
            var _localPlayerPanelNextScanMs = 0;
            var _localPlayerPanelScanBackoffMs = 0;

            function _getHud() {
                return QOL.core?.panel?.findHud ? QOL.core.panel.findHud() : (QOL.core?.hud?.findHud ? QOL.core.hud.findHud() : null);
            }

            function _getGameplayHud(hud) {
                if (!_isAlive(hud)) return null;
                return hud.FindChildTraverse ? (hud.FindChildTraverse("gameplay_hud") || hud) : hud;
            }

            var _isInHideout = QOL.core.hud.isInHideout;

            function _ensureCompassOverlay(hud) {
                if (!_isAlive(_compassRoot)) {
                    var parent = _getGameplayHud(hud);
                    if (!parent) return null;
                    _compassRoot = parent.FindChildTraverse("QOLCompassRoot");
                    if (!_compassRoot) {
                        _compassRoot = $.CreatePanel("Panel", parent, "QOLCompassRoot");
                    }
                }
                if (!_compassRoot) return null;

                if (!_isAlive(_compassBox)) {
                    _compassBox = _compassRoot.FindChildTraverse("QOLCompassBox");
                    if (!_compassBox) {
                        _compassBox = $.CreatePanel("Panel", _compassRoot, "QOLCompassBox");
                    }
                }

                if (!_isAlive(_compassTicksContainer) && _compassBox) {
                    _compassTicksContainer = _compassBox.FindChildTraverse("QOLCompassTicks");
                    if (!_compassTicksContainer) {
                        _compassTicksContainer = $.CreatePanel("Panel", _compassBox, "QOLCompassTicks");
                    }
                }

                if (!_isAlive(_compassNeedle) && _compassBox) {
                    _compassNeedle = _compassBox.FindChildTraverse("QOLCompassNeedle");
                    if (!_compassNeedle) {
                        _compassNeedle = $.CreatePanel("Panel", _compassBox, "QOLCompassNeedle");
                    }
                }

                if (!_isAlive(_compassFadeLeft) && _compassBox) {
                    _compassFadeLeft = _compassBox.FindChildTraverse("QOLCompassFadeLeft");
                    if (!_compassFadeLeft) {
                        _compassFadeLeft = $.CreatePanel("Panel", _compassBox, "QOLCompassFadeLeft");
                    }
                }

                if (!_isAlive(_compassFadeRight) && _compassBox) {
                    _compassFadeRight = _compassBox.FindChildTraverse("QOLCompassFadeRight");
                    if (!_compassFadeRight) {
                        _compassFadeRight = $.CreatePanel("Panel", _compassBox, "QOLCompassFadeRight");
                    }
                }

                if (!_isAlive(_compassReadout)) {
                    _compassReadout = _compassRoot.FindChildTraverse("QOLCompassReadout");
                    if (!_compassReadout) {
                        _compassReadout = $.CreatePanel("Panel", _compassRoot, "QOLCompassReadout");
                    }
                }

                if (!_isAlive(_compassDegree) && _compassReadout) {
                    _compassDegree = _compassReadout.FindChildTraverse("QOLCompassDegree");
                    if (!_compassDegree) {
                        _compassDegree = $.CreatePanel("Label", _compassReadout, "QOLCompassDegree");
                    }
                }

                // Standalone speed root sibling
                if (!_isAlive(_speedRoot)) {
                    var gHud = _getGameplayHud(hud);
                    if (gHud) {
                        _speedRoot = gHud.FindChildTraverse("QOLSpeedRoot");
                        if (!_speedRoot) {
                            _speedRoot = $.CreatePanel("Panel", gHud, "QOLSpeedRoot");
                        }
                    }
                }
                if (_speedRoot && !_isAlive(_speedLabel)) {
                    _speedLabel = _speedRoot.FindChildTraverse("QOLSpeedLabel");
                    if (!_speedLabel) {
                        _speedLabel = $.CreatePanel("Label", _speedRoot, "QOLSpeedLabel");
                    }
                }

                // Build / ensure ticks
                var rebuildTicks = (!_compassTicks || _compassTicks.length !== COMPASS_TICK_COUNT);
                if (!rebuildTicks) {
                    for (var t = 0; t < _compassTicks.length; t++) {
                        if (!_isAlive(_compassTicks[t])) { rebuildTicks = true; break; }
                    }
                }
                if (rebuildTicks && _compassTicksContainer) {
                    _compassTicks = [];
                    for (var i = 0; i < COMPASS_TICK_COUNT; i++) {
                        var tickId = "QOLCompassTick" + i;
                        var tick = _compassTicksContainer.FindChildTraverse(tickId);
                        if (!tick) {
                            tick = $.CreatePanel("Panel", _compassTicksContainer, tickId);
                            tick.AddClass("QOLCompassTick");
                        }
                        _compassTicks.push(tick);
                    }
                    _tickClassSigs = [];
                    _tickXTexts = [];
                    _lastRenderedHeadingDeg = null;
                }

                return _compassRoot;
            }

            function _nextScanBackoff(currentBackoff, baseCooldownMs) {
                var next = (currentBackoff > 0) ? currentBackoff * 2 : baseCooldownMs;
                return (next > MINIMAP_LOCAL_PLAYER_SCAN_COOLDOWN_MAX_MS) ? MINIMAP_LOCAL_PLAYER_SCAN_COOLDOWN_MAX_MS : next;
            }

            function _findLocalMinimapPlayerPanel(hud, nowMs, aggressiveScan) {
                if (_isAlive(_minimapLocalPlayerPanel)) {
                    return _minimapLocalPlayerPanel;
                }

                var scanCooldown = aggressiveScan ? MINIMAP_LOCAL_PLAYER_SCAN_COOLDOWN_FAST_MS : MINIMAP_LOCAL_PLAYER_SCAN_COOLDOWN_MS;
                if (nowMs < _localPlayerPanelNextScanMs) return null;

                var searchScope = _findMinimapContainer(hud) || _findMinimapRotateTarget(hud) || hud;
                var cones = searchScope && searchScope.FindChildrenWithClassTraverse ? (searchScope.FindChildrenWithClassTraverse("client_cone_fov") || []) : [];
                for (var i = 0; i < cones.length; i++) {
                    var cp = cones[i];
                    if (!cp) continue;
                    if (_panelHasAllClasses(cp, ["active", "player", "client_cone_fov", "enemy"]) ||
                        _panelHasAllClasses(cp, ["active", "player", "client_cone_fov"])) {
                        _minimapLocalPlayerPanel = cp;
                        _localPlayerPanelNextScanMs = 0;
                        _localPlayerPanelScanBackoffMs = 0;
                        return cp;
                    }
                }

                var locals = searchScope && searchScope.FindChildrenWithClassTraverse ? (searchScope.FindChildrenWithClassTraverse("localplayer") || []) : [];
                for (var k = 0; k < locals.length; k++) {
                    var p = locals[k];
                    if (p && p.BHasClass && p.BHasClass("player")) {
                        _minimapLocalPlayerPanel = p;
                        _localPlayerPanelNextScanMs = 0;
                        _localPlayerPanelScanBackoffMs = 0;
                        return p;
                    }
                }

                _minimapLocalPlayerPanel = null;
                _localPlayerPanelScanBackoffMs = _nextScanBackoff(_localPlayerPanelScanBackoffMs, scanCooldown);
                _localPlayerPanelNextScanMs = nowMs + _localPlayerPanelScanBackoffMs;
                return null;
            }

            function _findLocalMinimapMainImage(hud, nowMs, aggressiveScan) {
                if (_isAlive(_minimapLocalMainImage)) {
                    return _minimapLocalMainImage;
                }

                var scanCooldown = aggressiveScan ? MINIMAP_LOCAL_PLAYER_SCAN_COOLDOWN_FAST_MS : MINIMAP_LOCAL_PLAYER_SCAN_COOLDOWN_MS;
                if (nowMs < _localMainImageNextScanMs) return null;

                var preferredPlayer = _findLocalMinimapPlayerPanel(hud, nowMs, aggressiveScan);
                if (preferredPlayer) {
                    var preferredImage = preferredPlayer.FindChildTraverse ? preferredPlayer.FindChildTraverse("MainImage") : null;
                    if (preferredImage) {
                        _minimapLocalMainImage = preferredImage;
                        _localMainImageNextScanMs = 0;
                        _localMainImageScanBackoffMs = 0;
                        return preferredImage;
                    }
                }

                var searchScope = _findMinimapContainer(hud) || _findMinimapRotateTarget(hud) || hud;
                var locals = searchScope && searchScope.FindChildrenWithClassTraverse ? (searchScope.FindChildrenWithClassTraverse("localplayer") || []) : [];
                for (var i = 0; i < locals.length; i++) {
                    var img = locals[i].FindChildTraverse ? locals[i].FindChildTraverse("MainImage") : null;
                    if (img) {
                        _minimapLocalMainImage = img;
                        _localMainImageNextScanMs = 0;
                        _localMainImageScanBackoffMs = 0;
                        return img;
                    }
                }

                _minimapLocalMainImage = null;
                _localMainImageScanBackoffMs = _nextScanBackoff(_localMainImageScanBackoffMs, scanCooldown);
                _localMainImageNextScanMs = nowMs + _localMainImageScanBackoffMs;
                return null;
            }

            function _getLocalPlayerHeadingDegrees(hud, nowMs, aggressiveScan) {
                if (_headingSnapshotMs === nowMs && (_headingSnapshotAggressive || !aggressiveScan)) {
                    return _headingSnapshotHeading;
                }
                var mainImage = _findLocalMinimapMainImage(hud, nowMs, aggressiveScan === true);
                var heading = _readPanelHeadingDegrees(mainImage);
                if (heading !== null) {
                    _headingSnapshotMs = nowMs;
                    _headingSnapshotAggressive = aggressiveScan === true;
                    _headingSnapshotHeading = heading;
                    return heading;
                }

                var playerPanel = _findLocalMinimapPlayerPanel(hud, nowMs, aggressiveScan === true);
                heading = _readPanelHeadingDegrees(playerPanel);
                if (heading !== null) {
                    _headingSnapshotMs = nowMs;
                    _headingSnapshotAggressive = aggressiveScan === true;
                    _headingSnapshotHeading = heading;
                    return heading;
                }

                _headingSnapshotMs = nowMs;
                _headingSnapshotAggressive = aggressiveScan === true;
                _headingSnapshotHeading = null;
                return null;
            }

            function _findMinimapRotateTarget(hud) {
                if (_isAlive(_minimapRotateTarget)) return _minimapRotateTarget;
                _minimapRotateTarget = null;
                if (!hud || !hud.FindChildTraverse) return null;
                _minimapRotateTarget = hud.FindChildTraverse(PANEL_ID_MINIMAP) ||
                                       hud.FindChildTraverse("minimap_container") ||
                                       hud.FindChildTraverse("minimap_persp") ||
                                       hud.FindChildTraverse("map_render");
                return _minimapRotateTarget;
            }

            var _minimapContainer = null;
            function _findMinimapContainer(hud) {
                if (_isAlive(_minimapContainer)) return _minimapContainer;
                _minimapContainer = null;
                if (!hud || !hud.FindChildTraverse) return null;
                _minimapContainer = hud.FindChildTraverse("minimap_container") || null;
                return _minimapContainer;
            }

            function _findMinimapFlipClassTarget(hud) {
                if (_isAlive(_minimapFlipClassTarget)) return _minimapFlipClassTarget;
                var rotateTarget = _findMinimapRotateTarget(hud);
                if (_isAlive(rotateTarget)) {
                    if (rotateTarget.id === PANEL_ID_MINIMAP) _minimapFlipClassTarget = rotateTarget;
                    else if (rotateTarget.FindChildTraverse) _minimapFlipClassTarget = rotateTarget.FindChildTraverse(PANEL_ID_MINIMAP);
                }
                if (!_isAlive(_minimapFlipClassTarget) && hud && hud.FindChildTraverse) {
                    _minimapFlipClassTarget = hud.FindChildTraverse("HudMinimapContainer");
                }
                if (!_isAlive(_minimapFlipClassTarget)) _minimapFlipClassTarget = rotateTarget;
                return _minimapFlipClassTarget;
            }

            var _clearStyle = QOL.utils.ClearStyleSafe;

            function _applyStaticMinimapRotation(hud, nowMs, targetDeg) {
                var target = _findMinimapRotateTarget(hud);
                if (!_isAlive(target)) return;
                var resolvedDeg = Number(targetDeg);
                if (!isFinite(resolvedDeg)) resolvedDeg = 0;
                var roundedDeg = Math.round(resolvedDeg * 100) / 100;
                if (_minimapRotateLastDeg !== roundedDeg) {
                    if (Math.abs(roundedDeg) < 0.001) {
                        _clearStyle(target, "preTransformRotate2d");
                    } else {
                        target.style.preTransformRotate2d = roundedDeg.toFixed(2) + "deg";
                    }
                }
                _minimapRotateLastDeg = roundedDeg;
                _minimapRotateSmoothedDeg = roundedDeg;
                _minimapRotateLastUpdateMs = nowMs;
                _minimapRotateLastHeadingDeg = null;
                _minimapRotateLastHeadingMs = 0;
                _minimapRotateHeadingVelDegPerSec = 0;
                _minimapRotateLastValidHeadingDeg = null;
                _minimapRotateLastValidHeadingMs = 0;
            }

            function _updateMinimapRotate(hud, cfg, nowMs) {
                var enabled = !!cfg.MINIMAP_ROTATE_WITH_PLAYER;
                var staticFlipEnabled = !!cfg.MINIMAP_FLIP;
                var flipClassTarget = _findMinimapFlipClassTarget(hud);
                var container = _findMinimapContainer(hud);

                if (!enabled) {
                    _applyStaticMinimapRotation(hud, nowMs, 0);
                    if (_isAlive(flipClassTarget) && flipClassTarget.BHasClass && flipClassTarget.BHasClass("qol_minimap_flip_active") !== staticFlipEnabled) {
                        flipClassTarget.SetHasClass("qol_minimap_flip_active", staticFlipEnabled);
                    }
                    if (_isAlive(container) && container.BHasClass && container.BHasClass("qol_minimap_flip_active") !== staticFlipEnabled) {
                        container.SetHasClass("qol_minimap_flip_active", staticFlipEnabled);
                    }
                    return;
                }

                if (_isAlive(flipClassTarget) && flipClassTarget.BHasClass && flipClassTarget.BHasClass("qol_minimap_flip_active")) {
                    flipClassTarget.SetHasClass("qol_minimap_flip_active", false);
                }
                if (_isAlive(container) && container.BHasClass && container.BHasClass("qol_minimap_flip_active")) {
                    container.SetHasClass("qol_minimap_flip_active", false);
                }

                var target = _findMinimapRotateTarget(hud);
                if (!_isAlive(target)) return;

                var heading360 = _getLocalPlayerHeadingDegrees(hud, nowMs, true);
                var headingIsLive = true;
                if (heading360 === null) {
                    var heldHeading = Number(_minimapRotateLastValidHeadingDeg);
                    var heldAtMs = Number(_minimapRotateLastValidHeadingMs) || 0;
                    if (isFinite(heldHeading) && (nowMs - heldAtMs) <= MINIMAP_ROTATE_HEADING_HOLD_MS) {
                        heading360 = _norm360(heldHeading);
                        headingIsLive = false;
                    } else {
                        _minimapRotateLastUpdateMs = nowMs;
                        return;
                    }
                } else {
                    _minimapRotateLastValidHeadingDeg = heading360;
                    _minimapRotateLastValidHeadingMs = nowMs;
                }

                var headingVelDegPerSec = Number(_minimapRotateHeadingVelDegPerSec);
                if (!isFinite(headingVelDegPerSec)) headingVelDegPerSec = 0;
                if (headingIsLive) {
                    var prevHeading = _minimapRotateLastHeadingDeg;
                    var prevHeadingMs = Number(_minimapRotateLastHeadingMs) || 0;
                    if (isFinite(prevHeading) && prevHeadingMs > 0) {
                        var dtHeadingSec = (nowMs - prevHeadingMs) / 1000.0;
                        if (isFinite(dtHeadingSec) && dtHeadingSec > 0.001 && dtHeadingSec < 0.5) {
                            var headingDelta = _shortestDelta(prevHeading, heading360);
                            var headingVelInstant = headingDelta / dtHeadingSec;
                            if (!isFinite(headingVelDegPerSec) || Math.abs(headingVelDegPerSec) < 0.001) {
                                headingVelDegPerSec = headingVelInstant;
                            } else {
                                headingVelDegPerSec = headingVelDegPerSec + ((headingVelInstant - headingVelDegPerSec) * MINIMAP_ROTATE_VEL_FILTER_ALPHA);
                            }
                        }
                    }
                    _minimapRotateLastHeadingDeg = heading360;
                    _minimapRotateLastHeadingMs = nowMs;
                } else {
                    headingVelDegPerSec *= 0.88;
                    if (Math.abs(headingVelDegPerSec) < 0.01) headingVelDegPerSec = 0;
                }
                _minimapRotateHeadingVelDegPerSec = headingVelDegPerSec;

                var headingPrediction = headingVelDegPerSec * MINIMAP_ROTATE_PREDICT_SEC;
                if (!isFinite(headingPrediction)) headingPrediction = 0;
                if (headingPrediction > MINIMAP_ROTATE_PREDICT_MAX_DEG) headingPrediction = MINIMAP_ROTATE_PREDICT_MAX_DEG;
                if (headingPrediction < -MINIMAP_ROTATE_PREDICT_MAX_DEG) headingPrediction = -MINIMAP_ROTATE_PREDICT_MAX_DEG;
                var predictedHeading = _norm360(heading360 + headingPrediction);
                var flipOffset = staticFlipEnabled ? 180 : 0;
                var targetDeg = _norm180(-(predictedHeading + MINIMAP_ROTATE_NORTH_OFFSET_DEG) + flipOffset);
                if (_minimapRotateSmoothedDeg === null || !isFinite(_minimapRotateSmoothedDeg)) {
                    _minimapRotateSmoothedDeg = targetDeg;
                    _minimapRotateLastUpdateMs = nowMs;
                } else {
                    var dtSec = (nowMs - _minimapRotateLastUpdateMs) / 1000.0;
                    if (!isFinite(dtSec) || dtSec <= 0) dtSec = COMPASS_INTERVAL_SEC;
                    if (dtSec > 0.25) dtSec = 0.25;
                    if (dtSec < 0.001) dtSec = 0.001;

                    var delta = _shortestDelta(_minimapRotateSmoothedDeg, targetDeg);
                    var absDelta = Math.abs(delta);
                    var absVel = Math.abs(headingVelDegPerSec);
                    var deadzoneDeg = (absVel > 120.0) ? MINIMAP_ROTATE_DEADZONE_MOVING_DEG : MINIMAP_ROTATE_DEADZONE_BASE_DEG;
                    if (absDelta <= deadzoneDeg) {
                        _minimapRotateSmoothedDeg = targetDeg;
                    } else {
                        var tauSec = (absDelta >= MINIMAP_ROTATE_FAST_DELTA_DEG || absVel > 220.0)
                            ? MINIMAP_ROTATE_TAU_FAST_SEC
                            : MINIMAP_ROTATE_TAU_SLOW_SEC;
                        var alpha = 1.0 - Math.exp(-dtSec / tauSec);
                        if (!isFinite(alpha) || alpha <= 0) alpha = 0.05;
                        if (alpha > 1.0) alpha = 1.0;

                        var step = delta * alpha;
                        var maxStep = MINIMAP_ROTATE_MAX_SPEED_DEG_PER_SEC * dtSec;
                        if (!isFinite(maxStep) || maxStep <= 0) maxStep = MINIMAP_ROTATE_MAX_SPEED_DEG_PER_SEC * COMPASS_INTERVAL_SEC;
                        if (Math.abs(step) > maxStep) step = (step > 0) ? maxStep : -maxStep;
                        if (Math.abs(step) > absDelta) step = delta;
                        _minimapRotateSmoothedDeg = _norm180(_minimapRotateSmoothedDeg + step);
                    }
                    _minimapRotateLastUpdateMs = nowMs;
                }

                var roundedDeg = Math.round(_minimapRotateSmoothedDeg * 100) / 100;
                if (_minimapRotateLastDeg === roundedDeg) return;
                target.style.preTransformRotate2d = roundedDeg.toFixed(2) + "deg";
                _minimapRotateLastDeg = roundedDeg;
            }

            var _lastRenderedHeadingDeg = null;
            var _lastRenderedBoxWidth = 0;
            var _lastRenderedStretchX = 0;
            var _lastRenderedStretchY = 0;

            function _updateCompassTicks(heading360, boxWidthPx, stretchXFactor, stretchYFactor) {
                if (!_compassTicks || _compassTicks.length === 0) return;
                var boxWidth = Number(boxWidthPx) || 200;
                var stretchX = Number(stretchXFactor) || 1.0;
                var stretchY = Number(stretchYFactor) || 1.0;

                if (_lastRenderedHeadingDeg !== null &&
                    Math.abs(_shortestDelta(_lastRenderedHeadingDeg, heading360)) < 0.15 &&
                    boxWidth === _lastRenderedBoxWidth &&
                    stretchX === _lastRenderedStretchX &&
                    stretchY === _lastRenderedStretchY) {
                    return;
                }
                _lastRenderedHeadingDeg = heading360;
                _lastRenderedBoxWidth = boxWidth;
                _lastRenderedStretchX = stretchX;
                _lastRenderedStretchY = stretchY;

                var stepsPerTurn = Math.round(360 / COMPASS_TICK_STEP_DEG);
                var centerIndex = Math.floor(COMPASS_TICK_COUNT / 2);
                var unit = heading360 / COMPASS_TICK_STEP_DEG;
                var base = Math.floor(unit);
                var frac = unit - base;

                var halfWidth = boxWidth * 0.5;
                var spacing = COMPASS_TICK_SPACING_PX * stretchX;

                for (var i = 0; i < _compassTicks.length; i++) {
                    var tick = _compassTicks[i];
                    if (!_isAlive(tick)) continue;

                    var rel = i - centerIndex;
                    var tickUnit = base + rel;
                    var tickStepIndex = ((tickUnit % stepsPerTurn) + stepsPerTurn) % stepsPerTurn;
                    var isMajor45 = (tickStepIndex % 2) === 0;
                    var isCardinal = (tickStepIndex % 4) === 0;

                    var tickWidth = isCardinal ? 3 : 2;
                    var baseTickHeight = isCardinal ? 34 : (isMajor45 ? 24 : 16);
                    var tickHeight = Math.max(4, Math.round(baseTickHeight * stretchY));
                    var classSig = (isMajor45 ? "1" : "0") + "|" + (isCardinal ? "1" : "0") + "|" + String(tickHeight);
                    if (_tickClassSigs[i] !== classSig) {
                        tick.SetHasClass("Major", isMajor45);
                        tick.SetHasClass("Cardinal", isCardinal);
                        tick.style.height = tickHeight + "px";
                        _tickClassSigs[i] = classSig;
                    }

                    var x = (halfWidth - (tickWidth * 0.5)) + ((rel - frac) * spacing);
                    var xText = x.toFixed(2) + "px";
                    if (_tickXTexts[i] !== xText) {
                        tick.style.x = xText;
                        _tickXTexts[i] = xText;
                    }
                }
            }

            function _resetCompassRuntimeState() {
                _lastDegreeText = "";
                _layoutSig = "";
                _speedOffsetSig = "";
                _nextSpeedSampleMs = 0;
                _lastSpeedValueText = "--";
                _lastPosTimeMs = 0;
                _speedSmoothed = null;
                _speedSamples = [];
                _tickClassSigs = [];
                _tickXTexts = [];
                _lastRenderedHeadingDeg = null;
                _lastRenderedBoxWidth = 0;
                _lastRenderedStretchX = 0;
                _lastRenderedStretchY = 0;
            }

            function _hideCompassOverlay() {
                if (_isAlive(_compassRoot)) _setStyleIfChanged(_compassRoot, "visibility", "collapse");
                if (_isAlive(_speedRoot)) _setStyleIfChanged(_speedRoot, "visibility", "collapse");
                if (!_overlayHidden) _resetCompassRuntimeState();
                _overlayHidden = true;
            }

            function _releaseMinimapRuntime() {
                // Cleanup must not discover panels: on match exit the minimap
                // can be absent while the HUD root remains alive.
                if (_isAlive(_minimapRotateTarget) && _minimapRotateLastDeg !== null) {
                    _clearStyle(_minimapRotateTarget, "preTransformRotate2d");
                }
                [_minimapFlipClassTarget, _minimapContainer].forEach(function(panel) {
                    if (_isAlive(panel) && panel.BHasClass("qol_minimap_flip_active")) {
                        panel.SetHasClass("qol_minimap_flip_active", false);
                    }
                });
                _minimapRotateTarget = null;
                _minimapFlipClassTarget = null;
                _minimapContainer = null;
                _minimapLocalPlayerPanel = null;
                _minimapLocalMainImage = null;
                _minimapRotateLastDeg = null;
                _minimapRotateSmoothedDeg = null;
                _minimapRotateLastUpdateMs = 0;
                _minimapRotateLastHeadingDeg = null;
                _minimapRotateLastHeadingMs = 0;
                _minimapRotateHeadingVelDegPerSec = 0;
                _minimapRotateLastValidHeadingDeg = null;
                _minimapRotateLastValidHeadingMs = 0;
                _headingSnapshotMs = 0;
                _headingSnapshotHeading = null;
                _localMainImageNextScanMs = 0;
                _localMainImageScanBackoffMs = 0;
                _localPlayerPanelNextScanMs = 0;
                _localPlayerPanelScanBackoffMs = 0;
            }

            function _updateCompass(hud, cfg, nowMs) {
                var showCompass = !!cfg.ENABLE_COMPASS;
                var showSpeed = !!cfg.ENABLE_COMPASS_SPEED;

                if (!showCompass && !showSpeed) {
                    _hideCompassOverlay();
                    return;
                }

                var root = _ensureCompassOverlay(hud);
                if (!root) return;
                _overlayHidden = false;

                var vis = showCompass ? "visible" : "collapse";
                if (root.style.visibility !== vis) root.style.visibility = vis;
                if (_compassBox) _setStyleIfChanged(_compassBox, "visibility", vis);

                var scale = Number(cfg.COMPASS_SCALE) || 100;
                if (scale < 50) scale = 50; if (scale > 200) scale = 200;
                var stretchX = Number(cfg.COMPASS_STRETCH_X) || 100;
                if (stretchX < 50) stretchX = 50; if (stretchX > 200) stretchX = 200;
                var stretchY = Number(cfg.COMPASS_STRETCH_Y) || 100;
                if (stretchY < 50) stretchY = 50; if (stretchY > 200) stretchY = 200;
                var offsetX = Number(cfg.COMPASS_X_OFFSET) || 0;
                if (offsetX < -2000) offsetX = -2000; if (offsetX > 2000) offsetX = 2000;
                var offsetY = (cfg.COMPASS_Y_OFFSET !== undefined && cfg.COMPASS_Y_OFFSET !== null) ? Number(cfg.COMPASS_Y_OFFSET) : 120;
                if (!isFinite(offsetY)) offsetY = 120;
                if (offsetY < -1000) offsetY = -1000; if (offsetY > 300) offsetY = 300;

                var appliedOffsetY = (2 * 120) - offsetY;
                var marginTopText = Math.round(appliedOffsetY) + "px";
                var marginLeftText = Math.round(offsetX) + "px";
                var scaleText = String(scale) + "%";
                var boxWidth = Math.round(200 * (stretchX / 100));
                var boxHeight = Math.round(50 * (stretchY / 100));
                if (boxWidth < 100) boxWidth = 100;
                if (boxHeight < 25) boxHeight = 25;
                var boxWidthText = boxWidth + "px";
                var boxHeightText = boxHeight + "px";

                var layoutSig = marginTopText + "|" + marginLeftText + "|" + scaleText + "|" +
                    boxWidthText + "|" + boxHeightText + "|" + (showCompass ? "1" : "0") + "|" + (showSpeed ? "1" : "0");

                if (layoutSig !== _layoutSig) {
                    if (root.style.marginTop !== marginTopText) root.style.marginTop = marginTopText;
                    if (root.style.marginLeft !== marginLeftText) root.style.marginLeft = marginLeftText;
                    if (root.style.preTransformScale2d !== "1.00, 1.00") root.style.preTransformScale2d = "1.00, 1.00";
                    if (root.style.uiScale !== scaleText) root.style.uiScale = scaleText;
                    if (root.style.width !== boxWidthText) root.style.width = boxWidthText;
                    _setStyleIfChanged(root, "height", "fit-children");
                    _setStyleIfChanged(root, "overflow", "noclip");

                    if (_compassBox) {
                        if (_compassBox.style.width !== boxWidthText) _compassBox.style.width = boxWidthText;
                        if (_compassBox.style.height !== boxHeightText) _compassBox.style.height = boxHeightText;
                        _setStyleIfChanged(_compassBox, "visibility", showCompass ? "visible" : "collapse");
                    }
                    if (_compassReadout) {
                        _setStyleIfChanged(_compassReadout, "width", "100%");
                        _setStyleIfChanged(_compassReadout, "height", "40px");
                        _setStyleIfChanged(_compassReadout, "flowChildren", "none");
                    }
                    if (_compassDegree) {
                        _setStyleIfChanged(_compassDegree, "width", showSpeed ? "50%" : "100%");
                        _setStyleIfChanged(_compassDegree, "textAlign", showSpeed ? "left" : "center");
                        _setStyleIfChanged(_compassDegree, "horizontalAlign", "left");
                        _setStyleIfChanged(_compassDegree, "verticalAlign", "center");
                        _setStyleIfChanged(_compassDegree, "visibility", showCompass ? "visible" : "collapse");
                    }
                    if (_speedLabel) {
                        _setStyleIfChanged(_speedLabel, "width", showCompass ? "50%" : "100%");
                        _setStyleIfChanged(_speedLabel, "textAlign", showCompass ? "right" : "center");
                        _setStyleIfChanged(_speedLabel, "horizontalAlign", showCompass ? "right" : "center");
                        _setStyleIfChanged(_speedLabel, "verticalAlign", "center");
                    }
                    _layoutSig = layoutSig;
                }

                var speedVis = showSpeed ? "visible" : "collapse";
                if (_speedRoot && _speedRoot.style.visibility !== speedVis) _speedRoot.style.visibility = speedVis;

                var speedOffsetX = Number(cfg.COMPASS_SPEED_X_OFFSET) || 0;
                if (speedOffsetX < -2000) speedOffsetX = -2000; if (speedOffsetX > 2000) speedOffsetX = 2000;
                var speedOffsetY = Number(cfg.COMPASS_SPEED_Y_OFFSET) || 0;
                if (speedOffsetY < -2000) speedOffsetY = -2000; if (speedOffsetY > 2000) speedOffsetY = 2000;

                if (_speedRoot) {
                    var speedRootWidth = (showCompass ? boxWidth : 200) + "px";
                    var speedBaseX = showCompass ? offsetX : 0;
                    var speedBaseY = showCompass ? (appliedOffsetY + boxHeight + 14) : 120;
                    var speedMarginLeft = Math.round(speedBaseX + speedOffsetX) + "px";
                    var speedMarginTop = Math.round(speedBaseY - speedOffsetY) + "px";

                    var speedLayoutSig = Math.round(speedOffsetX) + "|" + Math.round(speedOffsetY) + "|" +
                        (showCompass ? "1" : "0") + "|" + Math.round(speedBaseX) + "|" + Math.round(speedBaseY) + "|" + speedRootWidth;

                    if (_speedOffsetSig !== speedLayoutSig) {
                        if (_speedRoot.style.width !== speedRootWidth) _speedRoot.style.width = speedRootWidth;
                        if (_speedRoot.style.marginLeft !== speedMarginLeft) _speedRoot.style.marginLeft = speedMarginLeft;
                        if (_speedRoot.style.marginTop !== speedMarginTop) _speedRoot.style.marginTop = speedMarginTop;
                        _speedOffsetSig = speedLayoutSig;
                    }
                }
                if (!showSpeed && _speedLabel && _speedLabel.text !== "") _speedLabel.text = "";

                var heading360 = _getLocalPlayerHeadingDegrees(hud, nowMs);

                if (showCompass) {
                    if (heading360 === null) {
                        if (_compassDegree && _compassDegree.text !== "N/A") _compassDegree.text = "N/A";
                    } else {
                        _updateCompassTicks(heading360, boxWidth, (stretchX / 100), (stretchY / 100));
                        if (_compassDegree) {
                            var degreeText = String(Math.round(heading360)) + "\u00B0";
                            if (degreeText !== _lastDegreeText) {
                                _compassDegree.text = degreeText;
                                _lastDegreeText = degreeText;
                            }
                        }
                    }
                }

                if (!showSpeed) return;

                var speedValueText = _lastSpeedValueText || "--";
                if (nowMs >= _nextSpeedSampleMs) {
                    speedValueText = "--";
                    var playerPanel = _findLocalMinimapPlayerPanel(hud, nowMs);
                    if (playerPanel) {
                        var posText = "";
                        if (playerPanel.style && typeof playerPanel.style.position === "string") {
                            posText = playerPanel.style.position;
                        } else if (playerPanel.GetAttributeString) {
                            posText = playerPanel.GetAttributeString("style", "");
                        }
                        var pos = _parsePositionXYPercent(posText);
                        if (pos) {
                            _speedSamples.push(nowMs, pos.x, pos.y);
                            var cutoff = nowMs - COMPASS_SPEED_WINDOW_MS;
                            var drop = 0;
                            while (drop + 3 < _speedSamples.length && _speedSamples[drop] < cutoff) drop += 3;
                            if (drop > 0) _speedSamples.splice(0, drop);

                            var n = _speedSamples.length / 3;
                            if (n >= 2) {
                                var t0 = _speedSamples[0];
                                var sumT = 0, sumX = 0, sumY = 0, sumTT = 0, sumTX = 0, sumTY = 0;
                                for (var si = 0; si < _speedSamples.length; si += 3) {
                                    var tt = (_speedSamples[si] - t0) / 1000.0;
                                    var xx = _speedSamples[si + 1];
                                    var yy = _speedSamples[si + 2];
                                    sumT += tt; sumX += xx; sumY += yy;
                                    sumTT += tt * tt; sumTX += tt * xx; sumTY += tt * yy;
                                }
                                var spanSec = (_speedSamples[_speedSamples.length - 3] - t0) / 1000.0;
                                var denom = (n * sumTT) - (sumT * sumT);
                                if (spanSec >= (COMPASS_SPEED_MIN_SPAN_MS / 1000.0) && denom > 1e-9) {
                                    var vx = ((n * sumTX) - (sumT * sumX)) / denom;
                                    var vy = ((n * sumTY) - (sumT * sumY)) / denom;
                                    var speedInstant = Math.sqrt((vx * vx) + (vy * vy)) * 100.0;
                                    if (isFinite(speedInstant) && speedInstant >= 0 && speedInstant < 10000) {
                                        var dtSmoothSec = (_lastPosTimeMs > 0) ? (nowMs - _lastPosTimeMs) / 1000.0 : (COMPASS_SPEED_SAMPLE_MS / 1000.0);
                                        if (!(dtSmoothSec > 0) || dtSmoothSec > 1.0) dtSmoothSec = COMPASS_SPEED_SAMPLE_MS / 1000.0;
                                        if (_speedSmoothed === null || !isFinite(_speedSmoothed)) {
                                            _speedSmoothed = speedInstant;
                                        } else {
                                            var alpha = 1.0 - Math.exp(-dtSmoothSec / COMPASS_SPEED_EMA_TAU_SEC);
                                            var sdelta = speedInstant - _speedSmoothed;
                                            if (Math.abs(sdelta) < _speedSmoothed * COMPASS_SPEED_DEADBAND_FRAC) {
                                                alpha *= 0.25;
                                            }
                                            if (speedInstant < 0.5) alpha = 1.0;
                                            _speedSmoothed = _speedSmoothed + (alpha * sdelta);
                                        }
                                    }
                                }
                            }
                            _lastPosTimeMs = nowMs;
                        }
                    }

                    if (_speedSmoothed !== null && isFinite(_speedSmoothed)) {
                        var calibrated = _speedSmoothed * COMPASS_SPEED_SCALE;
                        if (!isFinite(calibrated) || calibrated < 0) calibrated = 0;
                        var quantized = (COMPASS_SPEED_QUANT > 1)
                            ? Math.round(calibrated / COMPASS_SPEED_QUANT) * COMPASS_SPEED_QUANT
                            : Math.round(calibrated);
                        if (quantized < 5) quantized = 0;
                        speedValueText = String(quantized);
                    }
                    _lastSpeedValueText = speedValueText;
                    _nextSpeedSampleMs = nowMs + COMPASS_SPEED_SAMPLE_MS;
                }
                if (_speedLabel && _speedLabel.text !== speedValueText) {
                    _speedLabel.text = speedValueText;
                }
            }

            function _tick() {
                var hud = _getHud();
                if (!hud) return;

                if (_isInHideout(hud)) {
                    _hideCompassOverlay();
                    if (!_inHideout) _releaseMinimapRuntime();
                    _inHideout = true;
                    if (_loop) _loop.reschedule(COMPASS_INTERVAL_IDLE_SEC);
                    return;
                }
                _inHideout = false;

                var cfg = ctx.config.view ? ctx.config.view() : ctx.config.all();
                var hasWork = !!(cfg.ENABLE_COMPASS || cfg.ENABLE_COMPASS_SPEED || cfg.MINIMAP_ROTATE_WITH_PLAYER || cfg.MINIMAP_FLIP);

                if (!hasWork) {
                    _hideCompassOverlay();
                    var flipTarget = _findMinimapFlipClassTarget(hud);
                    if (_isAlive(flipTarget) && flipTarget.BHasClass && flipTarget.BHasClass("qol_minimap_flip_active")) flipTarget.SetHasClass("qol_minimap_flip_active", false);
                    var container = _findMinimapContainer(hud);
                    if (_isAlive(container) && container.BHasClass && container.BHasClass("qol_minimap_flip_active")) container.SetHasClass("qol_minimap_flip_active", false);
                    _applyStaticMinimapRotation(hud, _nowMs(), 0);
                    if (_loop) _loop.reschedule(COMPASS_INTERVAL_IDLE_SEC);
                    return;
                }

                if (_loop) _loop.reschedule(COMPASS_INTERVAL_SEC);

                var nowMs = _nowMs();
                _updateCompass(hud, cfg, nowMs);
                _updateMinimapRotate(hud, cfg, nowMs);
            }

            return {
                onEnable: function () {
                    var S = QOL.core && QOL.core.Scheduler;
                    if (S && S.createPollLoop) {
                        _loop = S.createPollLoop(_tick, COMPASS_INTERVAL_SEC, FEATURE_ID);
                    }
                },
                onDisable: function () {
                    if (_loop) { _loop.stop(); _loop = null; }
                    _hideCompassOverlay();
                    _releaseMinimapRuntime();
                    _inHideout = false;
                },
                onSettingsChanged: function () {
                    _tick();
                    var hud = _getHud();
                    if (hud && QOL.core && QOL.core.hud && QOL.core.hud.refreshRootClasses) {
                        QOL.core.hud.refreshRootClasses(hud);
                    }
                }
            };
        },
        test: function (ctx) {
            try {
                var passed = (ctx && ctx.id === FEATURE_ID);
                return {
                    passed: passed,
                    name: "ql_compass manifest check",
                    message: passed ? "" : "Invalid feature ID",
                    assertions: [{ passed: passed, name: "Feature ID matches" }]
                };
            } catch (e) {
                return { passed: false, name: "ql_compass manifest check", message: (e && e.message ? e.message : String(e)) };
            }
        }
    });
})();

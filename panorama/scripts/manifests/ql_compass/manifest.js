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

(() => {
    "use strict";

    const FR = QOL.core && QOL.core.FeatureRegistry;
    if (!FR) {
        $.Msg("[QOLLock] ql_compass: FeatureRegistry not found — aborting");
        return;
    }

    const FEATURE_ID = "ql_compass";

    // Timing & sampling constants
    // rate-exempt: 20Hz (0.05s) required for smooth heading compass rotation
    const COMPASS_INTERVAL_SEC = 0.05;
    const COMPASS_INTERVAL_IDLE_SEC = 0.50;
    const COMPASS_TICK_STEP_DEG = 22.5;
    const COMPASS_TICK_SPACING_PX = 12.5;
    const COMPASS_TICK_COUNT = 17;
    const COMPASS_SPEED_SCALE = 2.12;
    const COMPASS_SPEED_QUANT = 2;
    const COMPASS_SPEED_SAMPLE_MS = 40;
    const COMPASS_SPEED_WINDOW_MS = 260;
    const COMPASS_SPEED_MIN_SPAN_MS = 90;
    const COMPASS_SPEED_EMA_TAU_SEC = 0.11;
    const COMPASS_SPEED_DEADBAND_FRAC = 0.07;

    // Minimap rotation constants
    const MINIMAP_ROTATE_NORTH_OFFSET_DEG = 90.0;
    const MINIMAP_ROTATE_DEADZONE_BASE_DEG = 0.45;
    const MINIMAP_ROTATE_DEADZONE_MOVING_DEG = 0.18;
    const MINIMAP_ROTATE_TAU_FAST_SEC = 0.06;
    const MINIMAP_ROTATE_TAU_SLOW_SEC = 0.13;
    const MINIMAP_ROTATE_FAST_DELTA_DEG = 22.0;
    const MINIMAP_ROTATE_MAX_SPEED_DEG_PER_SEC = 540.0;
    const MINIMAP_ROTATE_HEADING_HOLD_MS = 180;
    const MINIMAP_ROTATE_PREDICT_SEC = 0.045;
    const MINIMAP_ROTATE_PREDICT_MAX_DEG = 14.0;
    const MINIMAP_ROTATE_VEL_FILTER_ALPHA = 0.35;
    const MINIMAP_LOCAL_PLAYER_SCAN_COOLDOWN_MS = 250;
    const MINIMAP_LOCAL_PLAYER_SCAN_COOLDOWN_FAST_MS = 90;
    const MINIMAP_LOCAL_PLAYER_SCAN_COOLDOWN_MAX_MS = 1000;

    // Regex for parsing transforms
    const _RE_ROTATE3D = /rotate3d\s*\(\s*([+\-]?\d*\.?\d+)\s*,\s*([+\-]?\d*\.?\d+)\s*,\s*([+\-]?\d*\.?\d+)\s*,\s*([+\-]?\d*\.?\d+)\s*deg\s*\)/i;
    const _RE_ROTATE2D = /rotate(?:z|y)?\s*\(\s*([+\-]?\d*\.?\d+)\s*deg\s*\)/i;
    const _RE_ROTATE_LEGACY = /rotate3d\s*\(\s*[^,]+,\s*([+\-]?\d+(?:\.\d+)?)\s*deg\s*,/i;
    const _RE_DEG_GENERIC = /([+\-]?\d+(?:\.\d+)?)\s*deg/i;
    const _RE_POSITION_XY = /([+\-]?\d+(?:\.\d+)?)%\s*(?:,|\s+)\s*([+\-]?\d+(?:\.\d+)?)%/i;

    const _nowMs = QOL.utils.PerfNowMs;

    const _isAlive = QOL.utils.IsPanelValid;

    const _norm360 = QOL.utils.NormalizeDegrees360;

    function _norm180(deg) {
        let out = _norm360(deg);
        if (out > 180) out -= 360;
        return out;
    }

    function _shortestDelta(fromDeg, toDeg) {
        let delta = _norm180(toDeg) - _norm180(fromDeg);
        if (delta > 180) delta -= 360;
        if (delta < -180) delta += 360;
        return delta;
    }

    function _parseRotateTransformDegrees(transformText) {
        if (!transformText || transformText.length === 0) return null;
        const text = String(transformText);

        const m3d = _RE_ROTATE3D.exec(text);
        if (m3d && m3d.length >= 5) {
            const a3d = parseFloat(m3d[4]);
            if (isFinite(a3d)) return a3d;
        }
        const m2d = _RE_ROTATE2D.exec(text);
        if (m2d && m2d.length >= 2) {
            const a2d = parseFloat(m2d[1]);
            if (isFinite(a2d)) return a2d;
        }
        const mLeg = _RE_ROTATE_LEGACY.exec(text);
        if (mLeg && mLeg.length >= 2) {
            const aLeg = parseFloat(mLeg[1]);
            if (isFinite(aLeg)) return aLeg;
        }
        const mGen = _RE_DEG_GENERIC.exec(text);
        if (mGen && mGen.length >= 2) {
            const aGen = parseFloat(mGen[1]);
            if (isFinite(aGen)) return aGen;
        }
        return null;
    }

    function _parsePlainRotateDegrees(rotateText) {
        if (!rotateText || rotateText.length === 0) return null;
        const match = _RE_DEG_GENERIC.exec(String(rotateText));
        if (!match || match.length < 2) return null;
        const val = parseFloat(match[1]);
        return isFinite(val) ? val : null;
    }

    function _readPanelHeadingDegrees(panel) {
        if (!_isAlive(panel)) return null;
        let preRotate = "";
        try {
            if (panel.style && typeof panel.style.preTransformRotate2d === "string") {
                preRotate = panel.style.preTransformRotate2d;
            }
        } catch (e) {}
        const preVal = _parsePlainRotateDegrees(preRotate);
        if (preVal !== null) return _norm360(preVal);

        let transformText = "";
        try {
            if (panel.style && typeof panel.style.transform === "string") {
                transformText = panel.style.transform;
            }
        } catch (e2) {}
        let tVal = _parseRotateTransformDegrees(transformText);
        if (tVal !== null) return _norm360(tVal);

        if (panel.GetAttributeString) {
            let styleAttr = "";
            try { styleAttr = panel.GetAttributeString("style", ""); } catch (e3) {}
            tVal = _parseRotateTransformDegrees(styleAttr);
            if (tVal !== null) return _norm360(tVal);
        }
        return null;
    }

    function _parsePositionXYPercent(positionText) {
        const match = _RE_POSITION_XY.exec(String(positionText || ""));
        if (!match) return null;
        const x = Number(match[1]), y = Number(match[2]);
        return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
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
            { key: "ENABLE_COMPASS", type: "toggle" },
            { key: "ENABLE_SIMPLIFY_COMPASS", type: "toggle", label: "Minimalist", description: "Simplifies the Compass overlay to its bare elements." },
            { key: "ENABLE_COMPASS_SPEED", type: "toggle" },
            { key: "COMPASS_SCALE", type: "slider" },
            { key: "COMPASS_STRETCH_X", type: "slider" },
            { key: "COMPASS_STRETCH_Y", type: "slider" },
            { key: "COMPASS_X_OFFSET", type: "slider" },
            { key: "COMPASS_Y_OFFSET", type: "slider" },
            { key: "COMPASS_SPEED_X_OFFSET", type: "slider" },
            { key: "COMPASS_SPEED_Y_OFFSET", type: "slider" },
            { key: "MINIMAP_FLIP", type: "toggle", label: "Flip", description: "Rotates the static minimap 180 degrees." },
            { key: "MINIMAP_ROTATE_WITH_PLAYER", type: "toggle", label: "Spinny Mode", description: "Makes the minimap rotate with player view, this is just for fun." }
        ],
        create(ctx) {
            const P = QOL.core.panel;
            const ownerPath = [{ id: "Hud", optional: true }, { className: "HudCore" }, "gameplay_hud", { className: "clamp_width" }];
            const hostResolver = QOL.panelCache.createIdResolver("minimap_persp", { ownerPath });
            const containerResolver = QOL.panelCache.createIdResolver("minimap_container");
            const rendererResolver = QOL.panelCache.createIdResolver("hud_minimap");
            const fallbackRenderResolver = QOL.panelCache.createIdResolver("map_render");
            const gameplayResolver = QOL.panelCache.createIdResolver("gameplay_hud", { ownerPath: ownerPath.slice(0, 2) });
            const imageResolver = QOL.panelCache.createIdResolver("MainImage");
            const settingsFields = new Map(QOL.settingsFields.map(field => [field.key, field]));
            const layoutStyles = new Map();
            const overlays = P.createOwnedTree();
            let active = false, model = null, rootOwner = null;
            let minimapScope = null;
            let rotationOwned = false;
            let _loop = null;

            function readModel() {
                const cfg = ctx.config.view();
                const number = key => {
                    const field = settingsFields.get(key);
                    const value = Number(cfg[key] ?? QOL_DEFAULT_CONFIG[key]);
                    return QOL.utils.ClampConfigNumber(value, QOL_DEFAULT_CONFIG[key], field.min, field.max, false);
                };
                const scale = number("COMPASS_SCALE"), stretchX = number("COMPASS_STRETCH_X"), stretchY = number("COMPASS_STRETCH_Y");
                const x = number("COMPASS_X_OFFSET"), y = number("COMPASS_Y_OFFSET");
                return { compass: Number(cfg.ENABLE_COMPASS) === 1, speed: Number(cfg.ENABLE_COMPASS_SPEED) === 1,
                    spin: Number(cfg.MINIMAP_ROTATE_WITH_PLAYER) === 1, flip: Number(cfg.MINIMAP_FLIP) === 1,
                    scale, stretchX, stretchY, x, y, speedX: number("COMPASS_SPEED_X_OFFSET"), speedY: number("COMPASS_SPEED_Y_OFFSET"),
                    appliedY: 240 - y, width: Math.round(200 * stretchX / 100), height: Math.round(50 * stretchY / 100) };
            }

            function belongsTo(panel, root) {
                for (let depth = 0; depth < 32 && _isAlive(panel); depth++) {
                    if (panel === root) return true;
                    panel = panel.GetParent?.();
                }
                return false;
            }

            function sync(panel, styles) {
                if (!_isAlive(panel)) return false;
                const result = P.syncStyles(panel, styles, layoutStyles.get(panel));
                layoutStyles.set(panel, result.sig);
                return result.sig !== null;
            }

            function resetSamples() {
                _minimapLocalPlayerPanel = _minimapLocalMainImage = null;
                _headingSnapshotMs = -1;
                _headingSnapshotHeading = null;
                _nextSpeedSampleMs = 0;
                _lastPosTimeMs = 0;
                _speedSmoothed = null;
                _speedSamples = [];
                _lastSpeedValueText = "--";
                _localPlayerPanelNextScanMs = 0;
                _localPlayerPanelScanBackoffMs = 0;
                _minimapRotateLastValidHeadingDeg = null;
                _minimapRotateLastValidHeadingMs = 0;
                _minimapRotateLastHeadingDeg = null;
                _minimapRotateLastHeadingMs = 0;
                _minimapRotateHeadingVelDegPerSec = 0;
                imageResolver.reset();
            }

            function discover(hud) {
                const host = hostResolver.resolve(hud);
                const container = P.findChild(host, "minimap_container") || containerResolver.resolve(host || hud);
                const nativeContainer = P.findChild(container, "HudMinimapContainer");
                const renderer = P.findChild(nativeContainer, "hud_minimap") || P.findChild(container, "hud_minimap") || rendererResolver.resolve(container || host || hud);
                const nextRotate = renderer || container || host || fallbackRenderResolver.resolve(hud);
                const nextFlip = renderer || nativeContainer || nextRotate;
                if (_minimapRotateTarget !== nextRotate) {
                    if (rotationOwned && _isAlive(_minimapRotateTarget)) _clearStyle(_minimapRotateTarget, "preTransformRotate2d");
                    rotationOwned = false;
                    _minimapRotateLastDeg = _minimapRotateSmoothedDeg = null;
                }
                for (const panel of [_minimapFlipClassTarget, _minimapContainer]) {
                    if (panel !== nextFlip && panel !== container) P.setClass(panel, "qol_minimap_flip_active", false);
                }
                const nextScope = container || nextRotate;
                if (nextScope !== minimapScope) resetSamples();
                minimapScope = nextScope;
                _minimapRotateTarget = nextRotate;
                _minimapFlipClassTarget = nextFlip;
                _minimapContainer = container;
            }

            let _inHideout = false;
            let _overlayHidden = true;

            // Cached DOM references
            let _compassRoot = null;
            let _compassBox = null;
            let _compassTicksContainer = null;
            let _compassNeedle = null;
            let _compassFadeLeft = null;
            let _compassFadeRight = null;
            let _compassReadout = null;
            let _compassDegree = null;
            let _speedRoot = null;
            let _speedLabel = null;
            let _compassTicks = [];
            let _minimapRotateTarget = null;
            let _minimapFlipClassTarget = null;
            let _minimapLocalPlayerPanel = null;
            let _minimapLocalMainImage = null;

            // Runtime state
            let _nextSpeedSampleMs = 0;
            let _lastSpeedValueText = "--";
            let _lastPosTimeMs = 0;
            let _speedSmoothed = null;
            let _speedSamples = [];

            // Minimap rotation state
            let _minimapRotateLastDeg = null;
            let _minimapRotateSmoothedDeg = null;
            let _minimapRotateLastUpdateMs = 0;
            let _minimapRotateLastHeadingDeg = null;
            let _minimapRotateLastHeadingMs = 0;
            let _minimapRotateHeadingVelDegPerSec = 0;
            let _minimapRotateLastValidHeadingDeg = null;
            let _minimapRotateLastValidHeadingMs = 0;

            // Heading snapshot
            let _headingSnapshotMs = 0;
            let _headingSnapshotAggressive = false;
            let _headingSnapshotHeading = null;

            // Scan throttling
            let _localPlayerPanelNextScanMs = 0;
            let _localPlayerPanelScanBackoffMs = 0;

            function _getHud() {
                return P.findHud($.GetContextPanel());
            }

            const _isInHideout = QOL.core.hud.isInHideout;

            function _ensureCompassOverlay(hud) {
                const parent = gameplayResolver.resolve(hud);
                if (!_isAlive(parent)) { _releaseOverlay(); return null; }
                if ((_isAlive(_compassRoot) && _compassRoot.GetParent() !== parent) ||
                    (_isAlive(_speedRoot) && _speedRoot.GetParent() !== parent)) _releaseOverlay();
                const ensure = (owner, type, id, previous) => {
                    const current = overlays.child(owner, type, id);
                    if (current !== previous) {
                        layoutStyles.delete(previous);
                        _lastRenderedHeadingDeg = null;
                    }
                    return current;
                };
                _compassRoot = ensure(parent, "Panel", "QOLCompassRoot", _compassRoot);
                _compassBox = ensure(_compassRoot, "Panel", "QOLCompassBox", _compassBox);
                _compassTicksContainer = ensure(_compassBox, "Panel", "QOLCompassTicks", _compassTicksContainer);
                _compassNeedle = ensure(_compassBox, "Panel", "QOLCompassNeedle", _compassNeedle);
                _compassFadeLeft = ensure(_compassBox, "Panel", "QOLCompassFadeLeft", _compassFadeLeft);
                _compassFadeRight = ensure(_compassBox, "Panel", "QOLCompassFadeRight", _compassFadeRight);
                _compassReadout = ensure(_compassRoot, "Panel", "QOLCompassReadout", _compassReadout);
                _compassDegree = ensure(_compassReadout, "Label", "QOLCompassDegree", _compassDegree);
                _speedRoot = ensure(parent, "Panel", "QOLSpeedRoot", _speedRoot);
                _speedLabel = ensure(_speedRoot, "Label", "QOLSpeedLabel", _speedLabel);
                const ticks = [];
                for (let i = 0; i < COMPASS_TICK_COUNT; i++) {
                    const tick = ensure(_compassTicksContainer, "Panel", "QOLCompassTick" + i, _compassTicks[i]);
                    P.setClass(tick, "QOLCompassTick", true);
                    ticks.push(tick);
                }
                _compassTicks = ticks;
                if (![_compassRoot, _compassBox, _compassTicksContainer, _compassNeedle, _compassFadeLeft,
                    _compassFadeRight, _compassReadout, _compassDegree, _speedRoot, _speedLabel, ...ticks].every(_isAlive)) {
                    _hideCompassOverlay(); return null;
                }
                return _compassRoot;
            }

            function _releaseOverlay() {
                _hideCompassOverlay(); overlays.clear();
                _compassRoot = _compassBox = _compassTicksContainer = _compassNeedle = _compassFadeLeft = _compassFadeRight = null;
                _compassReadout = _compassDegree = _speedRoot = _speedLabel = null;
                _compassTicks = []; layoutStyles.clear(); _resetCompassRuntimeState();
            }

            function _nextScanBackoff(currentBackoff, baseCooldownMs) {
                let next = (currentBackoff > 0) ? currentBackoff * 2 : baseCooldownMs;
                return (next > MINIMAP_LOCAL_PLAYER_SCAN_COOLDOWN_MAX_MS) ? MINIMAP_LOCAL_PLAYER_SCAN_COOLDOWN_MAX_MS : next;
            }

            function _findLocalMinimapPlayerPanel(hud, nowMs, aggressiveScan) {
                const matches = panel => _isAlive(panel) && panel.BHasClass("player") &&
                    (panel.BHasClass("localplayer") || panel.BHasClass("active") && panel.BHasClass("client_cone_fov"));
                if (matches(_minimapLocalPlayerPanel) && belongsTo(_minimapLocalPlayerPanel, minimapScope) && nowMs < _localPlayerPanelNextScanMs) return _minimapLocalPlayerPanel;
                const cooldown = aggressiveScan ? MINIMAP_LOCAL_PLAYER_SCAN_COOLDOWN_FAST_MS : MINIMAP_LOCAL_PLAYER_SCAN_COOLDOWN_MS;
                if (!_minimapLocalPlayerPanel && nowMs < _localPlayerPanelNextScanMs) return null;
                const cones = minimapScope?.FindChildrenWithClassTraverse?.("client_cone_fov") || [];
                const locals = minimapScope?.FindChildrenWithClassTraverse?.("localplayer") || [];
                const next = cones.find(panel => matches(panel) && panel.BHasClass("active")) || locals.find(matches) || null;
                if (_minimapLocalPlayerPanel !== next) resetSamples();
                _minimapLocalPlayerPanel = next;
                _localPlayerPanelScanBackoffMs = next ? 0 : _nextScanBackoff(_localPlayerPanelScanBackoffMs, cooldown);
                _localPlayerPanelNextScanMs = nowMs + (next ? cooldown : _localPlayerPanelScanBackoffMs);
                return next;
            }

            function _findLocalMinimapMainImage(hud, nowMs, aggressiveScan) {
                const player = _findLocalMinimapPlayerPanel(hud, nowMs, aggressiveScan);
                const image = P.findChild(player, "MainImage") || imageResolver.resolve(player);
                if (_minimapLocalMainImage !== image) {
                    _minimapLocalMainImage = image;
                    _headingSnapshotMs = -1;
                }
                return image;
            }

            function _getLocalPlayerHeadingDegrees(hud, nowMs, aggressiveScan) {
                if (_headingSnapshotMs === nowMs && (_headingSnapshotAggressive || !aggressiveScan)) {
                    return _headingSnapshotHeading;
                }
                let mainImage = _findLocalMinimapMainImage(hud, nowMs, aggressiveScan === true);
                let heading = _readPanelHeadingDegrees(mainImage);
                if (heading !== null) {
                    _headingSnapshotMs = nowMs;
                    _headingSnapshotAggressive = aggressiveScan === true;
                    _headingSnapshotHeading = heading;
                    return heading;
                }

                let playerPanel = _findLocalMinimapPlayerPanel(hud, nowMs, aggressiveScan === true);
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

            function _findMinimapRotateTarget() { return _minimapRotateTarget; }
            let _minimapContainer = null;
            function _findMinimapContainer() { return _minimapContainer; }
            function _findMinimapFlipClassTarget() { return _minimapFlipClassTarget; }

            let _clearStyle = QOL.utils.ClearStyleSafe;

            function _applyStaticMinimapRotation(hud, nowMs, targetDeg) {
                let target = _findMinimapRotateTarget(hud);
                if (!_isAlive(target)) return;
                let resolvedDeg = Number(targetDeg);
                if (!isFinite(resolvedDeg)) resolvedDeg = 0;
                let roundedDeg = Math.round(resolvedDeg * 100) / 100;
                if (_minimapRotateLastDeg !== roundedDeg) {
                    if (Math.abs(roundedDeg) < 0.001) {
                        if (rotationOwned) _clearStyle(target, "preTransformRotate2d");
                        rotationOwned = false;
                    } else {
                        rotationOwned = true;
                        if (!sync(target, { preTransformRotate2d: roundedDeg.toFixed(2) + "deg" })) return;
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
                const enabled = cfg.spin;
                const staticFlipEnabled = cfg.flip;
                let flipClassTarget = _findMinimapFlipClassTarget(hud);
                let container = _findMinimapContainer(hud);

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

                let target = _findMinimapRotateTarget(hud);
                if (!_isAlive(target)) return;

                let heading360 = _getLocalPlayerHeadingDegrees(hud, nowMs, true);
                let headingIsLive = true;
                if (heading360 === null) {
                    let heldHeading = Number(_minimapRotateLastValidHeadingDeg);
                    let heldAtMs = Number(_minimapRotateLastValidHeadingMs) || 0;
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

                let headingVelDegPerSec = Number(_minimapRotateHeadingVelDegPerSec);
                if (!isFinite(headingVelDegPerSec)) headingVelDegPerSec = 0;
                if (headingIsLive) {
                    let prevHeading = _minimapRotateLastHeadingDeg;
                    let prevHeadingMs = Number(_minimapRotateLastHeadingMs) || 0;
                    if (isFinite(prevHeading) && prevHeadingMs > 0) {
                        let dtHeadingSec = (nowMs - prevHeadingMs) / 1000.0;
                        if (isFinite(dtHeadingSec) && dtHeadingSec > 0.001 && dtHeadingSec < 0.5) {
                            let headingDelta = _shortestDelta(prevHeading, heading360);
                            let headingVelInstant = headingDelta / dtHeadingSec;
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

                let headingPrediction = headingVelDegPerSec * MINIMAP_ROTATE_PREDICT_SEC;
                if (!isFinite(headingPrediction)) headingPrediction = 0;
                if (headingPrediction > MINIMAP_ROTATE_PREDICT_MAX_DEG) headingPrediction = MINIMAP_ROTATE_PREDICT_MAX_DEG;
                if (headingPrediction < -MINIMAP_ROTATE_PREDICT_MAX_DEG) headingPrediction = -MINIMAP_ROTATE_PREDICT_MAX_DEG;
                let predictedHeading = _norm360(heading360 + headingPrediction);
                let flipOffset = staticFlipEnabled ? 180 : 0;
                let targetDeg = _norm180(-(predictedHeading + MINIMAP_ROTATE_NORTH_OFFSET_DEG) + flipOffset);
                if (_minimapRotateSmoothedDeg === null || !isFinite(_minimapRotateSmoothedDeg)) {
                    _minimapRotateSmoothedDeg = targetDeg;
                    _minimapRotateLastUpdateMs = nowMs;
                } else {
                    let dtSec = (nowMs - _minimapRotateLastUpdateMs) / 1000.0;
                    if (!isFinite(dtSec) || dtSec <= 0) dtSec = COMPASS_INTERVAL_SEC;
                    if (dtSec > 0.25) dtSec = 0.25;
                    if (dtSec < 0.001) dtSec = 0.001;

                    let delta = _shortestDelta(_minimapRotateSmoothedDeg, targetDeg);
                    let absDelta = Math.abs(delta);
                    let absVel = Math.abs(headingVelDegPerSec);
                    let deadzoneDeg = (absVel > 120.0) ? MINIMAP_ROTATE_DEADZONE_MOVING_DEG : MINIMAP_ROTATE_DEADZONE_BASE_DEG;
                    if (absDelta <= deadzoneDeg) {
                        _minimapRotateSmoothedDeg = targetDeg;
                    } else {
                        let tauSec = (absDelta >= MINIMAP_ROTATE_FAST_DELTA_DEG || absVel > 220.0)
                            ? MINIMAP_ROTATE_TAU_FAST_SEC
                            : MINIMAP_ROTATE_TAU_SLOW_SEC;
                        let alpha = 1.0 - Math.exp(-dtSec / tauSec);
                        if (!isFinite(alpha) || alpha <= 0) alpha = 0.05;
                        if (alpha > 1.0) alpha = 1.0;

                        let step = delta * alpha;
                        let maxStep = MINIMAP_ROTATE_MAX_SPEED_DEG_PER_SEC * dtSec;
                        if (!isFinite(maxStep) || maxStep <= 0) maxStep = MINIMAP_ROTATE_MAX_SPEED_DEG_PER_SEC * COMPASS_INTERVAL_SEC;
                        if (Math.abs(step) > maxStep) step = (step > 0) ? maxStep : -maxStep;
                        if (Math.abs(step) > absDelta) step = delta;
                        _minimapRotateSmoothedDeg = _norm180(_minimapRotateSmoothedDeg + step);
                    }
                    _minimapRotateLastUpdateMs = nowMs;
                }

                let roundedDeg = Math.round(_minimapRotateSmoothedDeg * 100) / 100;
                if (_minimapRotateLastDeg === roundedDeg) return;
                rotationOwned = true;
                if (!sync(target, { preTransformRotate2d: roundedDeg.toFixed(2) + "deg" })) return;
                _minimapRotateLastDeg = roundedDeg;
            }

            let _lastRenderedHeadingDeg = null;
            let _lastRenderedBoxWidth = 0;
            let _lastRenderedStretchX = 0;
            let _lastRenderedStretchY = 0;

            function _updateCompassTicks(heading360, boxWidth, stretchX, stretchY) {
                if (_lastRenderedHeadingDeg !== null && Math.abs(_shortestDelta(_lastRenderedHeadingDeg, heading360)) < 0.15 &&
                    boxWidth === _lastRenderedBoxWidth && stretchX === _lastRenderedStretchX && stretchY === _lastRenderedStretchY) return;
                const steps = Math.round(360 / COMPASS_TICK_STEP_DEG);
                const center = Math.floor(COMPASS_TICK_COUNT / 2);
                const unit = heading360 / COMPASS_TICK_STEP_DEG;
                const base = Math.floor(unit), fraction = unit - base;
                let complete = true;
                _compassTicks.forEach((tick, i) => {
                    const relative = i - center;
                    const step = ((base + relative) % steps + steps) % steps;
                    const major = step % 2 === 0, cardinal = step % 4 === 0;
                    P.setClass(tick, "Major", major);
                    P.setClass(tick, "Cardinal", cardinal);
                    const width = cardinal ? 3 : 2;
                    const height = Math.max(4, Math.round((cardinal ? 34 : major ? 24 : 16) * stretchY));
                    const x = boxWidth * 0.5 - width * 0.5 + (relative - fraction) * COMPASS_TICK_SPACING_PX * stretchX;
                    complete = sync(tick, { height: height + "px", x: x.toFixed(2) + "px" }) && complete;
                });
                if (complete) {
                    _lastRenderedHeadingDeg = heading360;
                    _lastRenderedBoxWidth = boxWidth;
                    _lastRenderedStretchX = stretchX;
                    _lastRenderedStretchY = stretchY;
                }
            }

            function _resetCompassRuntimeState() {
                _nextSpeedSampleMs = 0;
                _lastSpeedValueText = "--";
                _lastPosTimeMs = 0;
                _speedSmoothed = null;
                _speedSamples = [];
                _lastRenderedHeadingDeg = null;
                _lastRenderedBoxWidth = 0;
                _lastRenderedStretchX = 0;
                _lastRenderedStretchY = 0;
            }

            function _hideCompassOverlay() {
                if (_isAlive(_compassRoot)) _setStyleIfChanged(_compassRoot, "visibility", "collapse");
                if (_isAlive(_speedRoot)) _setStyleIfChanged(_speedRoot, "visibility", "collapse");
                if (!_overlayHidden) { _resetCompassRuntimeState(); layoutStyles.clear(); }
                _overlayHidden = true;
            }

            function _releaseMinimapRuntime() {
                // Cleanup must not discover panels: on match exit the minimap
                // can be absent while the HUD root remains alive.
                if (_isAlive(_minimapRotateTarget) && rotationOwned) {
                    _clearStyle(_minimapRotateTarget, "preTransformRotate2d");
                }
                layoutStyles.delete(_minimapRotateTarget);
                [_minimapFlipClassTarget, _minimapContainer].forEach(function(panel) {
                    if (_isAlive(panel) && panel.BHasClass("qol_minimap_flip_active")) {
                        panel.SetHasClass("qol_minimap_flip_active", false);
                    }
                });
                rotationOwned = false;
                minimapScope = null;
                hostResolver.reset(); containerResolver.reset(); rendererResolver.reset(); fallbackRenderResolver.reset();
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
                _localPlayerPanelNextScanMs = 0;
                _localPlayerPanelScanBackoffMs = 0;
            }

            function renderLayout(model) {
                const visible = model.compass ? "visible" : "collapse";
                sync(_compassRoot, { visibility: visible, marginTop: Math.round(model.appliedY) + "px", marginLeft: Math.round(model.x) + "px",
                    preTransformScale2d: "1.00, 1.00", uiScale: model.scale + "%", width: model.width + "px", height: "fit-children", overflow: "noclip" });
                sync(_compassBox, { width: model.width + "px", height: model.height + "px", visibility: visible });
                sync(_compassReadout, { width: "100%", height: "40px", flowChildren: "none" });
                sync(_compassDegree, { width: model.speed ? "50%" : "100%", textAlign: model.speed ? "left" : "center",
                    horizontalAlign: "left", verticalAlign: "center", visibility: visible });
                sync(_speedLabel, { width: model.compass ? "50%" : "100%", textAlign: model.compass ? "right" : "center",
                    horizontalAlign: model.compass ? "right" : "center", verticalAlign: "center" });
                const speedBaseX = model.compass ? model.x : 0;
                const speedBaseY = model.compass ? model.appliedY + model.height + 14 : 120;
                sync(_speedRoot, { visibility: model.speed ? "visible" : "collapse", width: (model.compass ? model.width : 200) + "px",
                    marginLeft: Math.round(speedBaseX + model.speedX) + "px", marginTop: Math.round(speedBaseY - model.speedY) + "px" });
            }

            function _updateCompass(hud, cfg, nowMs) {
                const showCompass = cfg.compass, showSpeed = cfg.speed;
                if (!showCompass && !showSpeed) { _hideCompassOverlay(); return; }
                const root = _ensureCompassOverlay(hud);
                if (!root) return;
                _overlayHidden = false;
                renderLayout(cfg);
                const boxWidth = cfg.width, stretchX = cfg.stretchX, stretchY = cfg.stretchY;
                if (!showSpeed && _speedLabel && _speedLabel.text !== "") _speedLabel.text = "";

                let heading360 = _getLocalPlayerHeadingDegrees(hud, nowMs);

                if (showCompass) {
                    if (heading360 === null) {
                        if (_compassDegree && _compassDegree.text !== "N/A") _compassDegree.text = "N/A";
                    } else {
                        _updateCompassTicks(heading360, boxWidth, (stretchX / 100), (stretchY / 100));
                        if (_compassDegree) {
                            let degreeText = String(Math.round(heading360)) + "\u00B0";
                            if (_compassDegree.text !== degreeText) {
                                _compassDegree.text = degreeText;
                            }
                        }
                    }
                }

                if (!showSpeed) return;

                let speedValueText = _lastSpeedValueText || "--";
                if (nowMs >= _nextSpeedSampleMs) {
                    speedValueText = "--";
                    let playerPanel = _findLocalMinimapPlayerPanel(hud, nowMs);
                    if (playerPanel) {
                        let posText = "";
                        if (playerPanel.style && typeof playerPanel.style.position === "string") {
                            posText = playerPanel.style.position;
                        } else if (playerPanel.GetAttributeString) {
                            posText = playerPanel.GetAttributeString("style", "");
                        }
                        let pos = _parsePositionXYPercent(posText);
                        if (pos) {
                            _speedSamples.push(nowMs, pos.x, pos.y);
                            let cutoff = nowMs - COMPASS_SPEED_WINDOW_MS;
                            let drop = 0;
                            while (drop + 3 < _speedSamples.length && _speedSamples[drop] < cutoff) drop += 3;
                            if (drop > 0) _speedSamples.splice(0, drop);

                            let n = _speedSamples.length / 3;
                            if (n >= 2) {
                                let t0 = _speedSamples[0];
                                let sumT = 0, sumX = 0, sumY = 0, sumTT = 0, sumTX = 0, sumTY = 0;
                                for (let si = 0; si < _speedSamples.length; si += 3) {
                                    let tt = (_speedSamples[si] - t0) / 1000.0;
                                    let xx = _speedSamples[si + 1];
                                    let yy = _speedSamples[si + 2];
                                    sumT += tt; sumX += xx; sumY += yy;
                                    sumTT += tt * tt; sumTX += tt * xx; sumTY += tt * yy;
                                }
                                let spanSec = (_speedSamples[_speedSamples.length - 3] - t0) / 1000.0;
                                let denom = (n * sumTT) - (sumT * sumT);
                                if (spanSec >= (COMPASS_SPEED_MIN_SPAN_MS / 1000.0) && denom > 1e-9) {
                                    let vx = ((n * sumTX) - (sumT * sumX)) / denom;
                                    let vy = ((n * sumTY) - (sumT * sumY)) / denom;
                                    let speedInstant = Math.sqrt((vx * vx) + (vy * vy)) * 100.0;
                                    if (isFinite(speedInstant) && speedInstant >= 0 && speedInstant < 10000) {
                                        let dtSmoothSec = (_lastPosTimeMs > 0) ? (nowMs - _lastPosTimeMs) / 1000.0 : (COMPASS_SPEED_SAMPLE_MS / 1000.0);
                                        if (!(dtSmoothSec > 0) || dtSmoothSec > 1.0) dtSmoothSec = COMPASS_SPEED_SAMPLE_MS / 1000.0;
                                        if (_speedSmoothed === null || !isFinite(_speedSmoothed)) {
                                            _speedSmoothed = speedInstant;
                                        } else {
                                            let alpha = 1.0 - Math.exp(-dtSmoothSec / COMPASS_SPEED_EMA_TAU_SEC);
                                            let sdelta = speedInstant - _speedSmoothed;
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
                        let calibrated = _speedSmoothed * COMPASS_SPEED_SCALE;
                        if (!isFinite(calibrated) || calibrated < 0) calibrated = 0;
                        let quantized = (COMPASS_SPEED_QUANT > 1)
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
                if (!active) return;
                const hud = _getHud();
                if (hud !== rootOwner) {
                    _releaseOverlay(); _releaseMinimapRuntime(); gameplayResolver.reset(); resetSamples(); rootOwner = hud;
                    _inHideout = false;
                }
                if (!_isAlive(hud) || (hud.id !== "Hud" && hud.paneltype !== "CitadelHud")) {
                    _releaseOverlay(); _releaseMinimapRuntime(); return;
                }
                overlays.sweep();

                if (_isInHideout(hud)) {
                    _hideCompassOverlay();
                    if (!_inHideout) _releaseMinimapRuntime();
                    _inHideout = true;
                    if (_loop) _loop.reschedule(COMPASS_INTERVAL_IDLE_SEC);
                    return;
                }
                _inHideout = false;

                const cfg = model;
                const hasWork = cfg.compass || cfg.speed || cfg.spin || cfg.flip;

                if (!hasWork) {
                    _hideCompassOverlay();
                    _releaseMinimapRuntime();
                    if (_loop) _loop.reschedule(COMPASS_INTERVAL_IDLE_SEC);
                    return;
                }

                if (_loop) _loop.reschedule(COMPASS_INTERVAL_SEC);

                const nowMs = _nowMs();
                discover(hud);
                _updateCompass(hud, cfg, nowMs);
                _updateMinimapRotate(hud, cfg, nowMs);
            }

            function refresh() {
                model = readModel();
                if (!active) return;
                _tick();
                const hud = _getHud();
                if (_isAlive(hud)) QOL.core.hud.refreshRootClasses(hud);
            }

            return {
                onEnable() {
                    active = true; model = readModel(); _tick();
                    let S = QOL.core && QOL.core.Scheduler;
                    if (S && S.createPollLoop) {
                        _loop = S.createPollLoop(_tick, COMPASS_INTERVAL_SEC, FEATURE_ID);
                    }
                },
                onDisable() {
                    active = false;
                    if (_loop) { _loop.stop(); _loop = null; }
                    _releaseOverlay(); overlays.dispose();
                    _releaseMinimapRuntime();
                    gameplayResolver.reset(); imageResolver.reset(); model = rootOwner = null;
                    _resetCompassRuntimeState();
                    _inHideout = false;
                },
                onSettingsChanged: refresh
            };
        },
        test: function (ctx) {
            try {
                let passed = (ctx && ctx.id === FEATURE_ID);
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

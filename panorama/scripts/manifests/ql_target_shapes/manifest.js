// features/ql_target_shapes/manifest.js
// =============================================================================
// QOLLOCK — Target Shapes
// =============================================================================
// OWNS:        Unit target shape size, opacity, red diamond scaling.
//              Finds target_shape and qol_hint_target panels via class traversal
//              and applies crisp uiScale + opacity.
// DOES NOT OWN: Target shape panels (Valve), red diamond feature gate (core)
// DEPENDS ON:  QOL.core.FeatureRegistry, QOL.core.Scheduler
// CONFIG KEYS: ENABLE_RED_DIAMOND, UNIT_TARGET_SIZE, UNIT_TARGET_OPACITY,
//              UNIT_TARGET_HINT_SIZE
// CSS:         none (uiScale + SetPanelOpacitySafe only)
// PATTERN:     Polling (5Hz with panels, 2Hz discovery, 1Hz idle).
//              Reads State.lastResolvedGates.redDiamondEnabled (cross-feature gate).
// CONFIG SRC:  State.lastConfig (Pattern B — enabledByDefault:true, no enableKey)
// PORTED FROM: features/ql_feat_targetshapes.js (222 lines)
// =============================================================================

(function() {
    "use strict";
    var FR = QOL.core.FeatureRegistry;
    if (!FR) { $.Msg("[QOLLock] ql_target_shapes: FeatureRegistry not found — aborting"); return; }

    FR.register({
        id: "ql_target_shapes",
        enabledByDefault: true,
        settings: [
            { key: "ENABLE_RED_DIAMOND", type: "toggle", default: false },
            { key: "UNIT_TARGET_SIZE", type: "slider", min: 50, max: 300, step: 5, default: 150 },
            { key: "UNIT_TARGET_OPACITY", type: "slider", min: 0, max: 1, step: 0.05, default: 1 },
            { key: "UNIT_TARGET_HINT_SIZE", type: "slider", min: 50, max: 200, step: 5, default: 100 }
        ],
        create: function(ctx) {
            var State = QOL.state || (typeof globalThis !== "undefined" && globalThis.State) || {};
            var Utils = (typeof QOL_UTILS !== "undefined" ? QOL_UTILS : (QOL.utils || {}));
            var SetPanelOpacitySafe = Utils.SetPanelOpacitySafe || function(p, o) { if (p && p.style) p.style.opacity = String(o); };
            var GetUnitTargetDefaultStyleTexts = QOL.getUnitTargetDefaultStyleTexts || function() {
                return ResolveUnitTargetStyleTexts(QOL.buildDefaultConfig ? QOL.buildDefaultConfig() : {});
            };
            QOL.getUnitTargetDefaultStyleTexts = GetUnitTargetDefaultStyleTexts;

            var _loop = null;
            var _root = null;
            var _cacheInitialized = false;

            // ── Constants (verbatim from old feature) ──
            var TARGET_SHAPE_DEBUG = false;
            var TARGET_SHAPE_DEBUG_THROTTLE_MS = 5000;

            // ── Helpers (verbatim from old feature, deduplicated) ──

            function ResolveUnitTargetStyleTexts(cfg) {
                var unitTargetSize = (cfg && cfg.UNIT_TARGET_SIZE !== undefined && cfg.UNIT_TARGET_SIZE !== null)
                    ? Math.round(Number(cfg.UNIT_TARGET_SIZE))
                    : 150;
                var unitTargetOpacity = (cfg && cfg.UNIT_TARGET_OPACITY !== undefined && cfg.UNIT_TARGET_OPACITY !== null)
                    ? parseFloat(cfg.UNIT_TARGET_OPACITY)
                    : 1.0;
                var unitTargetHintSize = (cfg && cfg.UNIT_TARGET_HINT_SIZE !== undefined && cfg.UNIT_TARGET_HINT_SIZE !== null)
                    ? Math.round(Number(cfg.UNIT_TARGET_HINT_SIZE))
                    : 100;

                if (!isFinite(unitTargetSize)) unitTargetSize = 150;
                if (!isFinite(unitTargetOpacity)) unitTargetOpacity = 1.0;
                if (!isFinite(unitTargetHintSize)) unitTargetHintSize = 100;
                if (unitTargetSize < 50) unitTargetSize = 50;
                if (unitTargetSize > 300) unitTargetSize = 300;
                if (unitTargetOpacity < 0) unitTargetOpacity = 0;
                if (unitTargetOpacity > 1) unitTargetOpacity = 1;
                if (unitTargetHintSize < 50) unitTargetHintSize = 50;
                if (unitTargetHintSize > 200) unitTargetHintSize = 200;

                return {
                    scaleText: (unitTargetSize / 100).toFixed(3),
                    opacityText: unitTargetOpacity.toFixed(2),
                    hintScaleText: (unitTargetHintSize / 100).toFixed(3)
                };
            }

            function IsUnitTargetStyleCustomized(cfg) {
                var style = ResolveUnitTargetStyleTexts(cfg);
                var def = GetUnitTargetDefaultStyleTexts();
                return style.scaleText !== def.scaleText || style.opacityText !== def.opacityText || style.hintScaleText !== def.hintScaleText;
            }

            function NeedsTargetShapeRuntimeWork(cfg, redDiamondEnabled) {
                if (!!redDiamondEnabled) return true;
                if (IsUnitTargetStyleCustomized(cfg)) return true;
                return !!(
                    State.targetShapeHadNonDefaultRuntime ||
                    State.targetShapeStyleSig ||
                    State.nextTargetShapeRefreshMs ||
                    (State.targetShapesCache && State.targetShapesCache.length > 0)
                );
            }

            function TargetShapeDebugLogThrottled(sig, msg, nowMsDbg) {
                if (!TARGET_SHAPE_DEBUG) return;
                var nowDbg = Number(nowMsDbg) || (Date.now ? Date.now() : (new Date()).getTime());
                var sameSig = sig && sig === State.targetShapeDebugLastSig;
                if (sameSig && nowDbg < (State.targetShapeDebugNextMs || 0)) return;
                State.targetShapeDebugLastSig = sig || "";
                State.targetShapeDebugNextMs = nowDbg + TARGET_SHAPE_DEBUG_THROTTLE_MS;
                $.Msg("[QOLLock][TargetShape] " + String(msg || ""));
            }

            function IsCachedPanelListAlive(list) {
                if (!list) return false;
                for (var i = 0; i < list.length; i++) {
                    var panel = list[i];
                    if (!panel) return false;
                    if (panel.IsValid) {
                        try { if (!panel.IsValid()) return false; }
                        catch(ePanel) { return false; }
                    }
                }
                // An initialized empty cache is valid until its discovery timer.
                return true;
            }

            function ApplyTargetShapeStyles(root, scaleText, opacityText, nowMs, redDiamondEnabledHint, hintScaleText) {
                var redDiamondActive = !!redDiamondEnabledHint;
                if (!redDiamondActive && root && root.BHasClass) {
                    try {
                        redDiamondActive = !!root.BHasClass("red_diamond_active");
                    } catch (e0) {
                        redDiamondActive = false;
                    }
                }

                var defaultStyle = GetUnitTargetDefaultStyleTexts();
                var isDefaultUnitTargetStyle =
                    !redDiamondActive &&
                    scaleText === defaultStyle.scaleText &&
                    opacityText === defaultStyle.opacityText &&
                    (hintScaleText || "1.000") === defaultStyle.hintScaleText;
                var needsCleanupPass = isDefaultUnitTargetStyle && !!State.targetShapeHadNonDefaultRuntime;

                if (isDefaultUnitTargetStyle && !needsCleanupPass) {
                    State.targetShapesCache = [];
                    State.hintContainerCache = [];
                    State.targetShapeStyleSig = "";
                    State.nextTargetShapeRefreshMs = 0;
                    _cacheInitialized = false;
                    TargetShapeDebugLogThrottled("default_skip", "default_skip scale=" + scaleText + " opacity=" + opacityText + " red=0", nowMs);
                    return;
                }

                var styleSig = scaleText + "|" + opacityText + "|" + (redDiamondActive ? "1" : "0") + "|" + (hintScaleText || "1.000");
                var styleChanged = (styleSig !== State.targetShapeStyleSig);
                var cacheValid = _cacheInitialized &&
                    IsCachedPanelListAlive(State.targetShapesCache) &&
                    IsCachedPanelListAlive(State.hintContainerCache);
                var shouldRefreshList = needsCleanupPass || styleChanged || !cacheValid || nowMs >= (State.nextTargetShapeRefreshMs || 0);
                if (styleSig === State.targetShapeStyleSig && !shouldRefreshList) return;

                if (shouldRefreshList) {
                    State.targetShapesCache = root.FindChildrenWithClassTraverse("target_shape") || [];
                    State.hintContainerCache = root.FindChildrenWithClassTraverse("qol_hint_target") || [];
                    _cacheInitialized = true;
                    // Empty-cache discovery stays responsive without traversing
                    // the full HUD every 50-200ms. Live handles invalidate early.
                    var hasPanels = State.targetShapesCache.length > 0 || State.hintContainerCache.length > 0;
                    var targetShapeRefreshMs = hasPanels ? 1000 : 500;
                    State.nextTargetShapeRefreshMs = nowMs + targetShapeRefreshMs;
                    TargetShapeDebugLogThrottled("refresh|" + (needsCleanupPass ? "cleanup" : "normal") + "|" + String(State.targetShapesCache.length) + "|" + String(targetShapeRefreshMs),
                        "refresh mode=" + (needsCleanupPass ? "cleanup" : "normal") + " count=" + String(State.targetShapesCache.length) + " styleChanged=" + (styleChanged ? "1" : "0") + " cacheValid=" + (cacheValid ? "1" : "0") + " nextMs=" + String(targetShapeRefreshMs), nowMs);
                }

                var targetShapes = State.targetShapesCache || [];
                for (var ts = 0; ts < targetShapes.length; ts++) {
                    var shape = targetShapes[ts];
                    if (!shape) continue;
                    if (shape.style.preTransformScale2d !== "1.00, 1.00") shape.style.preTransformScale2d = "1.00, 1.00";
                    var shapeUiScale = Math.round(Number(scaleText) * 100) + "%";
                    if (shape.style.uiScale !== shapeUiScale) shape.style.uiScale = shapeUiScale;
                    SetPanelOpacitySafe(shape, opacityText, 1.0);
                }
                var hintContainers = State.hintContainerCache || [];
                for (var hc = 0; hc < hintContainers.length; hc++) {
                    var hint = hintContainers[hc];
                    if (!hint) continue;
                    if (hint.style.preTransformScale2d !== "1.00, 1.00") hint.style.preTransformScale2d = "1.00, 1.00";
                    var hintUiScale = Math.round(Number(hintScaleText || "1.000") * 100) + "%";
                    if (hint.style.uiScale !== hintUiScale) hint.style.uiScale = hintUiScale;
                }
                State.targetShapeStyleSig = styleSig;
                if (!isDefaultUnitTargetStyle) {
                    State.targetShapeHadNonDefaultRuntime = true;
                    return;
                }

                if (needsCleanupPass) {
                    State.targetShapeHadNonDefaultRuntime = false;
                    State.targetShapesCache = [];
                    State.hintContainerCache = [];
                    State.targetShapeStyleSig = "";
                    State.nextTargetShapeRefreshMs = 0;
                    _cacheInitialized = false;
                    TargetShapeDebugLogThrottled("cleanup_done", "default cleanup completed", nowMs);
                }
            }

            // ── Main tick (adapted from update function + NeedsTargetShapeRuntimeWork gate) ──
            function _tick() {
                var root = _root || $.GetContextPanel(); if (root && !_root) _root = root;
                // Pattern B: no enableKey → ConfigStore bucket is empty; read from global config
                var cfg = (State.lastConfig) || {};

                // Self-gating (replicates old NeedsTargetShapeRuntimeWork gate)
                var redDiamondEnabled = !!(State.lastResolvedGates && State.lastResolvedGates.redDiamondEnabled);
                if (!NeedsTargetShapeRuntimeWork(cfg, redDiamondEnabled)) {
                    if (_loop) _loop.reschedule(1.0);
                    // Idle cleanup — reset State to prevent sticky-gate firing
                    if (State.targetShapeHadNonDefaultRuntime || State.targetShapeStyleSig) {
                        State.targetShapeHadNonDefaultRuntime = false;
                        State.targetShapesCache = [];
                        State.hintContainerCache = [];
                        State.targetShapeStyleSig = "";
                        State.nextTargetShapeRefreshMs = 0;
                        _cacheInitialized = false;
                    }
                    return;
                }
                if (_loop) _loop.reschedule(0.2);

                var nowMs = Date.now ? Date.now() : (new Date()).getTime();
                var unitTargetStyle = ResolveUnitTargetStyleTexts(cfg);
                ApplyTargetShapeStyles(root, unitTargetStyle.scaleText,
                    unitTargetStyle.opacityText, nowMs, redDiamondEnabled,
                    unitTargetStyle.hintScaleText);
                var hasCachedPanels = (State.targetShapesCache && State.targetShapesCache.length > 0) ||
                    (State.hintContainerCache && State.hintContainerCache.length > 0);
                if (_loop) _loop.reschedule(hasCachedPanels ? 0.2 : 0.5);
            }

            return {
                onEnable: function() {
                    var S = QOL.core.Scheduler;
                    _loop = S && S.createPollLoop ? S.createPollLoop(_tick, 0.2, "ql_target_shapes") : null;
                },
                onDisable: function() {
                    if (_loop) { _loop.stop(); _loop = null; }
                    var S = QOL.core.Scheduler; if (S) S.cancelAllForFeature("ql_target_shapes");
                    State.targetShapeHadNonDefaultRuntime = false;
                    State.targetShapeStyleSig = "";
                    State.nextTargetShapeRefreshMs = 0;
                    State.targetShapesCache = [];
                    State.hintContainerCache = [];
                    _cacheInitialized = false;
                    State.targetShapeDebugLastSig = "";
                    State.targetShapeDebugNextMs = 0;
                    _root = null;
                },
                onSettingsChanged: function() {}
            };
        },
        test: function(ctx) {
            try {
                var root = $.GetContextPanel();
                var shapes = root ? (root.FindChildrenWithClassTraverse("target_shape") || []) : [];
                var hints = root ? (root.FindChildrenWithClassTraverse("qol_hint_target") || []) : [];
                return {
                    passed: true,
                    name: "Target shape panels traversal works",
                    message: "Found " + shapes.length + " target_shape + " + hints.length + " hint panels",
                    assertions: [
                        { passed: true, name: "target_shape traversal succeeded (" + shapes.length + " found)" },
                        { passed: true, name: "qol_hint_target traversal succeeded (" + hints.length + " found)" }
                    ]
                };
            } catch(e) { return { passed: false, name: "Target shape traversal failed", message: (e && e.message ? e.message : String(e)) }; }
        }
    });
})();

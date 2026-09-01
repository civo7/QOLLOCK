// ql_feat_targetshapes.js — Unit target shape customization (red diamond, scale, opacity)
// Extracted from ql_core.js, Phase 9 Step 2c
(function() {
    'use strict';
    var _featureId = "ql_feat_targetshapes";
    // DEPENDS: state, utils, getUnitTargetDefaultStyleTexts
    var _deps = QOL.import(["state", "utils", "getUnitTargetDefaultStyleTexts"]);
    var State = _deps.state;
    var Utils = _deps.utils;
    var SetPanelOpacitySafe = Utils.SetPanelOpacitySafe;
    var IsPanelListValid = Utils.IsPanelListValid;
    var GetUnitTargetDefaultStyleTexts = _deps.getUnitTargetDefaultStyleTexts;
    var TARGET_SHAPE_DEBUG = false;
    var TARGET_SHAPE_DEBUG_THROTTLE_MS = 5000;

    // Inlined from ql_core.js — was missing after extraction
    function ResolveUnitTargetStyleTexts(cfg) {
        var s = (cfg && cfg.UNIT_TARGET_SIZE !== undefined && cfg.UNIT_TARGET_SIZE !== null)
            ? Math.round(Number(cfg.UNIT_TARGET_SIZE)) : 150;
        var o = (cfg && cfg.UNIT_TARGET_OPACITY !== undefined && cfg.UNIT_TARGET_OPACITY !== null)
            ? parseFloat(cfg.UNIT_TARGET_OPACITY) : 1.0;
        var h = (cfg && cfg.UNIT_TARGET_HINT_SIZE !== undefined && cfg.UNIT_TARGET_HINT_SIZE !== null)
            ? Math.round(Number(cfg.UNIT_TARGET_HINT_SIZE)) : 100;
        if (!isFinite(s)) s = 150; if (s < 50) s = 50; if (s > 300) s = 300;
        if (!isFinite(o)) o = 1.0; if (o < 0) o = 0; if (o > 1) o = 1;
        if (!isFinite(h)) h = 100; if (h < 50) h = 50; if (h > 200) h = 200;
        return {
            scaleText: (s / 100).toFixed(3),
            opacityText: o.toFixed(2),
            hintScaleText: (h / 100).toFixed(3)
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

    // ── Debug logging (throttled per-signature; extracted to module scope)
    function TargetShapeDebugLogThrottled(sig, msg, nowMsDbg) {
        if (!TARGET_SHAPE_DEBUG) return;
        var nowDbg = Number(nowMsDbg) || (Date.now ? Date.now() : (new Date()).getTime());
        var sameSig = sig && sig === State.targetShapeDebugLastSig;
        if (sameSig && nowDbg < (State.targetShapeDebugNextMs || 0)) return;
        State.targetShapeDebugLastSig = sig || "";
        State.targetShapeDebugNextMs = nowDbg + TARGET_SHAPE_DEBUG_THROTTLE_MS;
        $.Msg("[QOLLock][TargetShape] " + String(msg || ""));
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

        // Default style should be fully idle unless we need one restore pass
        // after leaving customized/red-diamond runtime.
        if (isDefaultUnitTargetStyle && !needsCleanupPass) {
            State.targetShapesCache = [];
            State.hintContainerCache = [];
            State.targetShapeStyleSig = "";
            State.nextTargetShapeRefreshMs = 0;
            TargetShapeDebugLogThrottled(
                "default_skip",
                "default_skip scale=" + scaleText + " opacity=" + opacityText + " red=0",
                nowMs
            );
            return;
        }

        var styleSig = scaleText + "|" + opacityText + "|" + (redDiamondActive ? "1" : "0") + "|" + (hintScaleText || "1.000");
        var styleChanged = (styleSig !== State.targetShapeStyleSig);
        var cacheValid = IsPanelListValid(State.targetShapesCache);
        var shouldRefreshList = needsCleanupPass || styleChanged || !cacheValid || nowMs >= (State.nextTargetShapeRefreshMs || 0);
        if (styleSig === State.targetShapeStyleSig && !shouldRefreshList) return;

        if (shouldRefreshList) {
            State.targetShapesCache = root.FindChildrenWithClassTraverse("target_shape") || [];
            State.hintContainerCache = root.FindChildrenWithClassTraverse("qol_hint_target") || [];
            // Keep default settings low-frequency, but tighten when user customized
            // size/opacity (or red-diamond mode) so newly spawned targets don't
            // flash at default scale.
            var defaultStyle = GetUnitTargetDefaultStyleTexts();
            var targetShapeRefreshMs = (
                redDiamondActive ||
                styleChanged ||
                scaleText !== defaultStyle.scaleText ||
                opacityText !== defaultStyle.opacityText ||
                (hintScaleText || "1.000") !== defaultStyle.hintScaleText
            ) ? 60 : 1000;
            State.nextTargetShapeRefreshMs = nowMs + targetShapeRefreshMs;
            TargetShapeDebugLogThrottled(
                "refresh|" + (needsCleanupPass ? "cleanup" : "normal") + "|" + String(State.targetShapesCache.length) + "|" + String(targetShapeRefreshMs),
                "refresh mode=" + (needsCleanupPass ? "cleanup" : "normal") +
                    " count=" + String(State.targetShapesCache.length) +
                    " styleChanged=" + (styleChanged ? "1" : "0") +
                    " cacheValid=" + (cacheValid ? "1" : "0") +
                    " nextMs=" + String(targetShapeRefreshMs),
                nowMs
            );
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
            TargetShapeDebugLogThrottled("cleanup_done", "default cleanup completed", nowMs);
        }
    }

    // ── Registration ──
    QOL.register("targetShapes", {
        configKeys: ["ENABLE_RED_DIAMOND", "UNIT_TARGET_SIZE", "UNIT_TARGET_OPACITY",
                     "UNIT_TARGET_HINT_SIZE"],
        bucket: 5, phase: -1,
        requiresRoot: true,
        gate: function(cfg) {
            return NeedsTargetShapeRuntimeWork(cfg,
                !!(State.lastResolvedGates && State.lastResolvedGates.redDiamondEnabled));
        },
        update: function(root, cfg, nowMs, State, hideoutConnected) {
            try {
                // P1: skip when new manifest is active to prevent dual execution
                var _mfActive = false;
                try { if (typeof QOL !== "undefined" && QOL.core && QOL.core.FeatureRegistry) { _mfActive = QOL.core.FeatureRegistry.isEnabled("ql_target_shapes"); } } catch(e) {}
                if (_mfActive) return;
                var unitTargetStyle = ResolveUnitTargetStyleTexts(cfg);
                var rdEnabled = !!(State.lastResolvedGates && State.lastResolvedGates.redDiamondEnabled);
                ApplyTargetShapeStyles(root, unitTargetStyle.scaleText,
                    unitTargetStyle.opacityText, nowMs, rdEnabled,
                    unitTargetStyle.hintScaleText);
            } catch(e) {
                $.Msg("[QOLLock][ERROR][" + _featureId + "] " + (e && e.message ? e.message : String(e)) + "\n" + (e && e.stack ? String(e.stack) : ""));
                throw e;
            }
        },
        stateKeys: ["targetShapeStyleSig", "nextTargetShapeRefreshMs",
                    "targetShapeHadNonDefaultRuntime", "targetShapesCache",
                    "hintContainerCache", "targetShapeDebugLastSig",
                    "targetShapeDebugNextMs"]
    });

    try {
        if (typeof NeedsTargetShapeRuntimeWork !== "function") throw new Error("NeedsTargetShapeRuntimeWork is not a function");
        if (typeof ResolveUnitTargetStyleTexts !== "function") throw new Error("ResolveUnitTargetStyleTexts is not a function");
    } catch(e) {
        $.Msg("[QOLLock][ERROR][" + _featureId + "] self-test failed: " + (e && e.message ? e.message : String(e)));
    }

})();

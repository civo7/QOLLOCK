// ql_feat_healthbar_fg.js — FG healthbar runtime
// Extracted from ql_feat_healthbar.js, Phase 12
(function() {
    'use strict';
    var _featureId = "ql_feat_healthbar_fg";
    // DEPENDS: state, utils, getCachedPanel, setCachedPanel, tryReadHeroFromPanelDetails
    var _deps = QOL.import(["state", "utils", "getCachedPanel", "setCachedPanel",
        "tryReadHeroFromPanelDetails"]);
    var State = _deps.state;
    var Utils = _deps.utils;
    var GetCachedPanel = _deps.getCachedPanel;
    var SetCachedPanel = _deps.setCachedPanel;
    var IsPanelValid = Utils.IsPanelValid;
    var SetStyleSafe = Utils.SetStyleSafe;
    var TryReadHeroFromPanelDetails = _deps.tryReadHeroFromPanelDetails;

    // ── Constants ──
    var HEALTHBAR_TYPE_FG = 2;
    var PANEL_ID_GOLD_AP_CONTAINER = "gold_and_ap_container";
    var PANEL_ID_HEALTH_CONTAINER = "health_and_abilities_container";
    // How long a resolved hero signature is reused before re-deriving it. Must be
    // longer than the loop interval (0.2s) to save anything, and the stamp has to be
    // written where the resolve happens or the deadline is pushed forward on every
    // tick and never expires.
    var FG_HERO_PROBE_THROTTLE_MS = 350;

    // Note: Shared helpers remain in ql_feat_healthbar.js but are imported
    // via QOL.healthbar namespace at runtime
    var BuildPlayerHealthbarRuntimeStyleState = QOL.healthbar.buildPlayerHealthbarStyleState;
    var ResetPlayerHealthbarScaleOpacityRuntime = QOL.healthbar.resetPlayerScaleOpacity;
    var ResetPlayerHealthbarRuntimeStyle = QOL.healthbar.resetPlayerStyle;

    // ── FG-specific shared helpers (formerly in ql_feat_healthbar.js) ──

    function ResetFgPlayerHealthbarOffsetRuntime(panel) {
        if (!panel || !panel.style) return;
        try { panel.style.transform = "none"; } catch(e0) {}
    }

    function ResolveFgHeroImagePixelSize(scale) {
        var sizeScale = Number(scale);
        if (!isFinite(sizeScale) || sizeScale <= 0) sizeScale = 1.0;
        return Math.max(30, Math.min(120, Math.round(58 * sizeScale)));
    }

    function ApplyFgPlayerHealthbarRuntimeStyleToPanel(panel, runtimeState, includeOffsets, includeScaleOpacity) {
        if (!panel || !panel.style || !runtimeState) return;

        var applyOffsets = (includeOffsets !== false);
        if (applyOffsets) {
            var fgOffsetX = runtimeState.finalOffsetX;
            var fgOffsetY = runtimeState.finalOffsetY;
            if (runtimeState.scaleActive) {
                var fgSizeDelta = ResolveFgHeroImagePixelSize(runtimeState.finalScale) - 58;
                fgOffsetX += -(fgSizeDelta * 2);
                fgOffsetY += -fgSizeDelta;
            }
            if (fgOffsetX !== 0 || fgOffsetY !== 0) {
                try {
                    panel.style.transform =
                        "translateX(" + String(fgOffsetX) + "px) " +
                        "translateY(" + String(fgOffsetY) + "px)";
                } catch(e) {}
            } else {
                try { panel.style.transform = "none"; } catch(e0) {}
            }
        }

        if (includeScaleOpacity === false) return;

        SetStyleSafe(panel, "preTransformScale2d", "1.00, 1.00");
        SetStyleSafe(panel, "uiScale", "100%");
        SetStyleSafe(panel, "opacity", runtimeState.opacityText);
    }

    // ── FG healthbar functions ──

    function CaptureFgHeroImageOriginalParent(levelAmount, fgAnchor) {
        if (!IsPanelValid(levelAmount)) return;
        if (IsPanelValid(State.fgHeroImageOriginalParent)) return;

        var parent = levelAmount.GetParent ? levelAmount.GetParent() : null;
        if (!IsPanelValid(parent) || parent === fgAnchor) return;

        State.fgHeroImageOriginalParent = parent;
        State.fgHeroImageOriginalIndex = -1;
        if (!parent.GetChildCount || !parent.GetChild) return;

        var count = parent.GetChildCount();
        for (var i = 0; i < count; i++) {
            if (parent.GetChild(i) === levelAmount) {
                State.fgHeroImageOriginalIndex = i;
                break;
            }
        }
    }

    function RestoreFgHeroImageOriginalOrder(levelAmount) {
        if (!IsPanelValid(levelAmount)) return;
        var parent = IsPanelValid(State.fgHeroImageOriginalParent) ? State.fgHeroImageOriginalParent : null;
        if (!parent) return;

        if (levelAmount.GetParent && levelAmount.GetParent() !== parent && levelAmount.SetParent) {
            levelAmount.SetParent(parent);
        }
        if (!parent.GetChildCount || !parent.GetChild || !parent.MoveChildBefore) return;

        var targetIndex = Number(State.fgHeroImageOriginalIndex);
        if (!isFinite(targetIndex) || targetIndex < 0) return;
        var count = parent.GetChildCount();
        if (count <= 1 || targetIndex >= count) return;

        var anchor = parent.GetChild(targetIndex);
        if (anchor && anchor !== levelAmount) {
            parent.MoveChildBefore(levelAmount, anchor);
        }
    }

    function ResetFgHeroImageOriginalParentState() {
        State.fgHeroImageOriginalParent = null;
        State.fgHeroImageOriginalIndex = -1;
    }

    function ResetFgHeroImageSwapCandidateState() {
        State.fgHeroImageSwapCandidateSig = "";
        State.fgHeroImageSwapCandidateHits = 0;
        State.fgHeroImageSwapCandidatePanel = null;
    }

    function ApplyFgHeroImageFixedSize(panel, scale) {
        if (!IsPanelValid(panel) || !panel.style) return;
        var size = ResolveFgHeroImagePixelSize(scale);
        var sizeText = String(size) + "px";
        SetStyleSafe(panel, "width", sizeText);
        SetStyleSafe(panel, "height", sizeText);
        SetStyleSafe(panel, "maxWidth", sizeText);
        SetStyleSafe(panel, "maxHeight", sizeText);
        SetStyleSafe(panel, "overflow", "clip");
        SetStyleSafe(panel, "uiScale", "100%");
    }

    function FindLiveGoldLevelAmount(root) {
        if (!root || !root.FindChildTraverse) return null;
        var goldContainer = GetCachedPanel("goldAndApContainer");
        if (!goldContainer) {
            goldContainer = root.FindChildTraverse(PANEL_ID_GOLD_AP_CONTAINER);
            SetCachedPanel("goldAndApContainer", goldContainer);
        }
        if (!IsPanelValid(goldContainer) || !goldContainer.FindChildTraverse) return null;
        var levelAmount = goldContainer.FindChildTraverse("LevelAmount");
        return IsPanelValid(levelAmount) ? levelAmount : null;
    }

    function ReadHeroSignatureFromLevelAmount(levelAmount) {
        if (!IsPanelValid(levelAmount)) return "";
        var heroImage = levelAmount.FindChildTraverse ? levelAmount.FindChildTraverse("HeroImage") : null;
        var sig = "";
        try { sig = QOL.normalizeHeroId(TryReadHeroFromPanelDetails(heroImage)); } catch (e0) { $.Msg("[QOLLock][WARN][" + _featureId + "] op failed: " + (e0 && e0.message ? e0.message : String(e0 || ""))); sig = ""; }
        if (sig) return sig;
        try { sig = QOL.normalizeHeroId(TryReadHeroFromPanelDetails(levelAmount)); } catch (e1) { $.Msg("[QOLLock][WARN][" + _featureId + "] op failed: " + (e1 && e1.message ? e1.message : String(e1 || ""))); sig = ""; }
        return sig || "";
    }

    function TryReadFgHeroSignalFromLocalApis() {
        return "";
    }

    function ResolveFgHeroRefreshSignal(root, cfg, levelAmount) {
        var hero = ReadHeroSignatureFromLevelAmount(levelAmount);
        if (hero) return hero;

        hero = TryReadFgHeroSignalFromLocalApis();
        if (hero) return hero;

        try {
            var settingsSignal = QOL.tryReadBuildSaveStorageHeroFromSettings ? QOL.tryReadBuildSaveStorageHeroFromSettings() : null;
            hero = QOL.normalizeHeroId(settingsSignal && settingsSignal.hero ? settingsSignal.hero : "");
        } catch (e0) { $.Msg("[QOLLock][WARN][" + _featureId + "] op failed: " + (e0 && e0.message ? e0.message : String(e0 || ""))); hero = ""; }
        if (hero) return hero;
        try {
            if (root && root.GetAttributeString) {
                hero = QOL.normalizeHeroId(root.GetAttributeString(HERO_HINT_ATTR, ""));
            }
        } catch (e1) { $.Msg("[QOLLock][WARN][" + _featureId + "] op failed: " + (e1 && e1.message ? e1.message : String(e1 || ""))); hero = ""; }
        if (hero) return hero;

        return QOL.normalizeHeroId(State.heroDetectLastKnownPlayableHero || "");
    }

    function SyncFgHeroImageMotionState(root, cfg) {
        if (!root || !root.FindChildTraverse) return;
        var healthbarType = Math.round(Number(cfg && cfg.HEALTHBAR_TYPE)) || 0;
        var fgEnabled = (healthbarType === HEALTHBAR_TYPE_FG);
        var runtimeState = BuildPlayerHealthbarRuntimeStyleState(cfg, false, false);
        var fgRuntimeStyleSig = runtimeState.finalOffsetX + "|" + runtimeState.finalOffsetY + "|" + runtimeState.scaleText + "|" + runtimeState.opacityText;

        var levelAmount = FindLiveGoldLevelAmount(root);
        if (!IsPanelValid(levelAmount)) {
            levelAmount = GetCachedPanel("fgHeroLevelAmount");
        }
        if (!IsPanelValid(levelAmount)) {
            levelAmount = root.FindChildTraverse("LevelAmount");
        }
        SetCachedPanel("fgHeroLevelAmount", IsPanelValid(levelAmount) ? levelAmount : null);

        var heroImage = (IsPanelValid(levelAmount) && levelAmount.FindChildTraverse) ? levelAmount.FindChildTraverse("HeroImage") : null;

        if (fgEnabled) {
            var healthContainer = root.FindChildTraverse ? root.FindChildTraverse("health_and_abilities_container") : null;
            var fgIconPulseMid = false;
            var fgIconPulseLow = false;
            if (healthContainer && healthContainer.BHasClass) {
                try { fgIconPulseMid = !!healthContainer.BHasClass("localPlayerMidHealth"); } catch (eMid) { fgIconPulseMid = false; }
                try { fgIconPulseLow = !!healthContainer.BHasClass("localPlayerLowHealth"); } catch (eLow) { fgIconPulseLow = false; }
            }
            if (root.SetHasClass) {
                root.SetHasClass("qol_fg_icon_health_mid", fgIconPulseMid);
                root.SetHasClass("qol_fg_icon_health_low", fgIconPulseLow);
            }
            if (State.fgHeroImageRuntimeStyleSig !== fgRuntimeStyleSig) {
                if (IsPanelValid(levelAmount)) {
                    ApplyFgPlayerHealthbarRuntimeStyleToPanel(levelAmount, runtimeState, true, true);
                }
                State.fgHeroImageRuntimeStyleSig = fgRuntimeStyleSig;
            }
            return;
        }

        if (root.SetHasClass) {
            root.SetHasClass("qol_fg_icon_health_mid", false);
            root.SetHasClass("qol_fg_icon_health_low", false);
        }

        if (IsPanelValid(levelAmount)) {
            ResetFgPlayerHealthbarOffsetRuntime(levelAmount);
            ResetPlayerHealthbarScaleOpacityRuntime(levelAmount);
        }
        if (IsPanelValid(heroImage)) {
            ResetFgPlayerHealthbarOffsetRuntime(heroImage);
            ResetPlayerHealthbarRuntimeStyle(heroImage);
        }

        State.fgHeroImageRuntimeStyleSig = "";
        State.fgHeroRuntimeLevelPanel = null;
        State.fgHeroRuntimeHeroPanel = null;
    }

    // ── Export ──
    QOL.healthbar = QOL.healthbar || {};
    QOL.healthbar.fg = { update: SyncFgHeroImageMotionState };

    // ── Self-test ──
    try {
        if (typeof SyncFgHeroImageMotionState !== "function") throw new Error("SyncFgHeroImageMotionState not defined");
    } catch(e) {
        $.Msg("[QOLLock][ERROR][" + _featureId + "] self-test: " + (e && e.message ? e.message : String(e)));
    }
})();

// ql_feat_healthbar_fg.js — FG healthbar runtime
// Extracted from ql_feat_healthbar.js, Phase 12
(function() {
    'use strict';
    var _featureId = "ql_feat_healthbar_fg";
    // DEPENDS: state, utils, getCachedPanel, setCachedPanel, isHudVisibleForPlayerHealthbarRuntime, tryReadHeroFromPanelDetails
    var _deps = QOL.import(["state", "utils", "getCachedPanel", "setCachedPanel",
        "isHudVisibleForPlayerHealthbarRuntime", "tryReadHeroFromPanelDetails"]);
    var State = _deps.state;
    var Utils = _deps.utils;
    var GetCachedPanel = _deps.getCachedPanel;
    var SetCachedPanel = _deps.setCachedPanel;
    var IsPanelValid = Utils.IsPanelValid;
    var SetStyleSafe = Utils.SetStyleSafe;
    var IsHudVisibleForPlayerHealthbarRuntime = _deps.isHudVisibleForPlayerHealthbarRuntime;
    var TryReadHeroFromPanelDetails = _deps.tryReadHeroFromPanelDetails;

    // ── Constants ──
    var HEALTHBAR_TYPE_FG = 2;
    var PANEL_ID_GOLD_AP_CONTAINER = "gold_and_ap_container";
    var PANEL_ID_HEALTH_CONTAINER = "health_and_abilities_container";

    // Note: Shared helpers remain in ql_feat_healthbar.js but are imported
    // via QOL.healthbar namespace at runtime
    var BuildPlayerHealthbarRuntimeStyleState = QOL.healthbar.buildPlayerHealthbarStyleState;
    var ResetPlayerHealthbarScaleOpacityRuntime = QOL.healthbar.resetPlayerScaleOpacity;
    var ResetPlayerHealthbarRuntimeStyle = QOL.healthbar.resetPlayerStyle;

    // ── FG-specific shared helpers (formerly in ql_feat_healthbar.js) ──

    function ResetFgPlayerHealthbarOffsetRuntime(panel) {
        if (!panel || !panel.style) return;
        try { panel.style.transform = ""; } catch(e0) { $.Msg("[QOLLock][WARN][" + _featureId + "] op failed: " + (e0 && e0.message ? e0.message : String(e0 || ""))); }
    }

    function ResolveFgHeroImagePixelSize(scale) {
        var sizeScale = Number(scale);
        if (!isFinite(sizeScale) || sizeScale <= 0) sizeScale = 1.0;
        return Math.max(36, Math.min(144, Math.round(72 * sizeScale)));
    }

    function ApplyFgPlayerHealthbarRuntimeStyleToPanel(panel, runtimeState, includeOffsets, includeScaleOpacity) {
        if (!panel || !panel.style || !runtimeState) return;

        var applyOffsets = (includeOffsets !== false);
        if (applyOffsets) {
            var fgOffsetX = runtimeState.finalOffsetX;
            var fgOffsetY = runtimeState.finalOffsetY;
            if (runtimeState.scaleActive) {
                var fgSizeDelta = ResolveFgHeroImagePixelSize(runtimeState.finalScale) - 72;
                fgOffsetX += -(fgSizeDelta * 2);
                fgOffsetY += -fgSizeDelta;
            }
            if (fgOffsetX !== 0 || fgOffsetY !== 0) {
                panel.style.transform =
                    "translateX(" + String(fgOffsetX) + "px) " +
                    "translateY(" + String(fgOffsetY) + "px)";
            } else {
                try { panel.style.transform = ""; } catch(e0) { $.Msg("[QOLLock][WARN][" + _featureId + "] op failed: " + (e0 && e0.message ? e0.message : String(e0 || ""))); }
            }
        }

        if (includeScaleOpacity === false) return;

        panel.style.preTransformScale2d = "1.00, 1.00";
        panel.style.uiScale = "100%";
        panel.style.opacity = runtimeState.opacityText;
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
        try { sig = QOL.normalizeHeroId(TryReadHeroFromPanelDetails(heroImage)); } catch (e0) { sig = ""; }
        if (sig) return sig;
        try { sig = QOL.normalizeHeroId(TryReadHeroFromPanelDetails(levelAmount)); } catch (e1) { sig = ""; }
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
        } catch (e0) { hero = ""; }
        if (hero) return hero;

        try {
            if (root && root.GetAttributeString) {
                hero = QOL.normalizeHeroId(root.GetAttributeString(HERO_HINT_ATTR, ""));
            }
        } catch (e1) { hero = ""; }
        if (hero) return hero;

        return QOL.normalizeHeroId(State.heroDetectLastKnownPlayableHero || "");
    }

    function SyncFgHeroImageMotionState(root, cfg) {
        if (!root || !root.FindChildTraverse) return;
        var healthbarType = Math.round(Number(cfg && cfg.HEALTHBAR_TYPE)) || 0;
        var fgEnabled = (healthbarType === HEALTHBAR_TYPE_FG);
        var nowMs = Date.now ? Date.now() : (new Date()).getTime();
        var runtimeState = BuildPlayerHealthbarRuntimeStyleState(cfg, false, false);
        var fgRuntimeStyleSig = runtimeState.finalOffsetX + "|" + runtimeState.finalOffsetY + "|" + runtimeState.scaleText + "|" + runtimeState.opacityText;

        var fgAnchor = GetCachedPanel("fgHeroImageAnchor");
        if (!fgAnchor) {
            fgAnchor = root.FindChildTraverse("FgHeroImageAnchor");
            SetCachedPanel("fgHeroImageAnchor", fgAnchor);
        }

        var levelAmount = FindLiveGoldLevelAmount(root);
        if (!IsPanelValid(levelAmount)) {
            levelAmount = GetCachedPanel("fgHeroLevelAmount");
        }
        if (!IsPanelValid(levelAmount)) {
            levelAmount = root.FindChildTraverse("LevelAmount");
        }
        SetCachedPanel("fgHeroLevelAmount", IsPanelValid(levelAmount) ? levelAmount : null);

        var staleProxy = GetCachedPanel("fgHeroImageProxy");
        if (staleProxy) {
            try { staleProxy.DeleteAsync(0); } catch(eProxyDel) { $.Msg("[QOLLock][WARN][" + _featureId + "] op failed: " + (eProxyDel && eProxyDel.message ? eProxyDel.message : String(eProxyDel || ""))); }
            SetCachedPanel("fgHeroImageProxy", null);
        }

        var cachedHeroImage = GetCachedPanel("fgHeroImagePanel");
        var liveHeroImage = (IsPanelValid(levelAmount) && levelAmount.FindChildTraverse) ? levelAmount.FindChildTraverse("HeroImage") : null;
        if (IsPanelValid(liveHeroImage) && IsPanelValid(cachedHeroImage) && liveHeroImage !== cachedHeroImage) {
            try {
                if (cachedHeroImage.GetParent && cachedHeroImage.GetParent() === fgAnchor && cachedHeroImage.DeleteAsync) {
                    cachedHeroImage.DeleteAsync(0);
                }
            } catch(eOldHero) { $.Msg("[QOLLock][WARN][" + _featureId + "] op failed: " + (eOldHero && eOldHero.message ? eOldHero.message : String(eOldHero || ""))); }
            State.fgHeroImageMoved = false;
            State.fgHeroImageRuntimeStyleSig = "";
            State.fgHeroRuntimeLevelPanel = null;
            State.fgHeroRuntimeHeroPanel = null;
            ResetFgHeroImageOriginalParentState();
            cachedHeroImage = null;
        }
        var anchorHeroImage = (IsPanelValid(fgAnchor) && fgAnchor.FindChildTraverse) ? fgAnchor.FindChildTraverse("HeroImage") : null;
        var heroImage = liveHeroImage || cachedHeroImage || anchorHeroImage || null;
        SetCachedPanel("fgHeroImagePanel", IsPanelValid(heroImage) ? heroImage : null);

        var goldContainer = GetCachedPanel("goldAndApContainer");
        if (!goldContainer) {
            goldContainer = root.FindChildTraverse(PANEL_ID_GOLD_AP_CONTAINER);
            SetCachedPanel("goldAndApContainer", goldContainer);
        }

        var healthContainer = GetCachedPanel("healthContainer");
        if (!healthContainer) {
            healthContainer = root.FindChildTraverse(PANEL_ID_HEALTH_CONTAINER);
            SetCachedPanel("healthContainer", healthContainer);
        }
        var hudVisibleForRuntime = IsHudVisibleForPlayerHealthbarRuntime(root, healthContainer);

        if (IsPanelValid(levelAmount)) {
            var parent = levelAmount.GetParent ? levelAmount.GetParent() : null;
            if (IsPanelValid(fgAnchor) && parent === fgAnchor) {
                if (IsPanelValid(State.fgHeroImageOriginalParent)) {
                    RestoreFgHeroImageOriginalOrder(levelAmount);
                } else if (IsPanelValid(goldContainer) && levelAmount.SetParent) {
                    levelAmount.SetParent(goldContainer);
                }
            }
        }

        if (!fgEnabled && IsPanelValid(heroImage) && IsPanelValid(levelAmount) && heroImage.GetParent && heroImage.GetParent() !== levelAmount && heroImage.SetParent) {
            heroImage.SetParent(levelAmount);
        }

        if (fgEnabled && hudVisibleForRuntime) {
            var refreshHero = ResolveFgHeroRefreshSignal(root, cfg, levelAmount);
            if (refreshHero && refreshHero !== State.fgHeroImageCurrentSig) {
                State.fgHeroImageCurrentSig = refreshHero;
                State.fgHeroImagePendingAttachMs = nowMs + 140;
                if (IsPanelValid(heroImage) && IsPanelValid(levelAmount) && heroImage.GetParent && heroImage.GetParent() === fgAnchor && heroImage.SetParent) {
                    heroImage.SetParent(levelAmount);
                }
                State.fgHeroImageMoved = false;
                State.fgHeroImageRuntimeStyleSig = "";
                State.fgHeroRuntimeLevelPanel = null;
                State.fgHeroRuntimeHeroPanel = null;
                ResetFgHeroImageOriginalParentState();
            }

            if (IsPanelValid(heroImage) && IsPanelValid(fgAnchor)) {
                CaptureFgHeroImageOriginalParent(heroImage, fgAnchor);
                var pendingAttachMs = Number(State.fgHeroImagePendingAttachMs) || 0;
                var attachReady = pendingAttachMs <= 0 || nowMs >= pendingAttachMs;
                if (attachReady && heroImage.GetParent && heroImage.GetParent() !== fgAnchor && heroImage.SetParent) {
                    heroImage.SetParent(fgAnchor);
                }
                State.fgHeroImageMoved = !!(heroImage.GetParent && heroImage.GetParent() === fgAnchor);
            } else {
                State.fgHeroImageMoved = false;
            }

            if (IsPanelValid(heroImage)) {
                SetStyleSafe(heroImage, "visibility", "visible");
                ApplyFgHeroImageFixedSize(heroImage, runtimeState.finalScale);
                ResetPlayerHealthbarScaleOpacityRuntime(heroImage);
            }
            if (IsPanelValid(fgAnchor)) {
                ApplyFgHeroImageFixedSize(fgAnchor, runtimeState.finalScale);
                ApplyFgPlayerHealthbarRuntimeStyleToPanel(fgAnchor, runtimeState, true, false);
            }
            var fgRuntimeTargetsChanged =
                State.fgHeroRuntimeLevelPanel !== levelAmount ||
                State.fgHeroRuntimeHeroPanel !== heroImage;
            if (State.fgHeroImageRuntimeStyleSig !== fgRuntimeStyleSig || fgRuntimeTargetsChanged) {
                if (IsPanelValid(levelAmount)) {
                    ApplyFgHeroImageFixedSize(levelAmount, runtimeState.finalScale);
                    ApplyFgPlayerHealthbarRuntimeStyleToPanel(levelAmount, runtimeState, true, true);
                }
                if (IsPanelValid(heroImage)) {
                    ApplyFgHeroImageFixedSize(heroImage, runtimeState.finalScale);
                    ApplyFgPlayerHealthbarRuntimeStyleToPanel(heroImage, runtimeState, false, false);
                }
                State.fgHeroImageRuntimeStyleSig = fgRuntimeStyleSig;
                State.fgHeroRuntimeLevelPanel = IsPanelValid(levelAmount) ? levelAmount : null;
                State.fgHeroRuntimeHeroPanel = IsPanelValid(heroImage) ? heroImage : null;
            }
            if (IsPanelValid(levelAmount)) {
                SetStyleSafe(levelAmount, "visibility", "visible");
                SetStyleSafe(levelAmount, "opacity", runtimeState.opacityText);
            }

            State.fgHeroImageSourceProbeNextMs = nowMs + 350;
            return;
        }

        if (State.fgHeroImageMoved && IsPanelValid(heroImage)) {
            RestoreFgHeroImageOriginalOrder(heroImage);
        }
        if (IsPanelValid(fgAnchor)) {
            ResetFgPlayerHealthbarOffsetRuntime(fgAnchor);
            ResetPlayerHealthbarScaleOpacityRuntime(fgAnchor);
        }
        if (IsPanelValid(heroImage)) {
            ResetFgPlayerHealthbarOffsetRuntime(heroImage);
            ResetPlayerHealthbarRuntimeStyle(heroImage);
            SetStyleSafe(heroImage, "visibility", "collapse");
            SetStyleSafe(heroImage, "opacity", "0");
        }
        if (IsPanelValid(levelAmount)) {
            ResetFgPlayerHealthbarOffsetRuntime(levelAmount);
            SetStyleSafe(levelAmount, "visibility", "collapse");
            SetStyleSafe(levelAmount, "opacity", "0");
            ResetPlayerHealthbarScaleOpacityRuntime(levelAmount);
        }

        State.fgHeroImageMoved = false;
        State.fgHeroImageSourceProbeNextMs = nowMs + 350;
        State.fgHeroImageCurrentSig = "";
        State.fgHeroImagePendingAttachMs = 0;
        State.fgHeroImageRuntimeStyleSig = "";
        State.fgHeroRuntimeLevelPanel = null;
        State.fgHeroRuntimeHeroPanel = null;
        ResetFgHeroImageSwapCandidateState();
        ResetFgHeroImageOriginalParentState();
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

// ql_feat_healthbar.js — Healthbar runtime dispatcher
// Extracted from ql_core.js, Phase 11 Step 1
// FG healthbar extracted to features/healthbar/ql_feat_healthbar_fg.js, Phase 12
(function() {
    'use strict';
    var _featureId = "ql_feat_healthbar";
    // DEPENDS: state, utils, getCachedPanel, setCachedPanel, setWashColorSafe, normalizePaletteColorIndex, resolveWashColorFromPalette, isHudVisibleForPlayerHealthbarRuntime, hasNonDefaultPlayerHealthbarRuntimeConfig, needsHealthbarRuntimeHelperWork, tryReadHeroFromPanelDetails, getUIRoot
    var _deps = QOL.import(["state", "utils", "getCachedPanel", "setCachedPanel",
        "setWashColorSafe",
        "normalizePaletteColorIndex", "resolveWashColorFromPalette",
        "isHudVisibleForPlayerHealthbarRuntime",
        "hasNonDefaultPlayerHealthbarRuntimeConfig",
        "needsHealthbarRuntimeHelperWork",
        "tryReadHeroFromPanelDetails",
        "getUIRoot"]);

    var State = _deps.state;
    var Utils = _deps.utils;
    var GetCachedPanel = _deps.getCachedPanel;
    var SetCachedPanel = _deps.setCachedPanel;
    var IsCfgEnabled = Utils.IsCfgEnabled;
    var IsPanelValid = Utils.IsPanelValid;
    var SetStyleSafe = Utils.SetStyleSafe;
    var ClearStyleSafe = Utils.ClearStyleSafe;
    var SetWashColorSafe = _deps.setWashColorSafe;
    var NormalizePaletteColorIndex = _deps.normalizePaletteColorIndex;
    var ResolveWashColorFromPalette = _deps.resolveWashColorFromPalette;
    var IsHudVisibleForPlayerHealthbarRuntime = _deps.isHudVisibleForPlayerHealthbarRuntime;
    var HasNonDefaultPlayerHealthbarRuntimeConfig = _deps.hasNonDefaultPlayerHealthbarRuntimeConfig;
    var NeedsHealthbarRuntimeHelperWork = _deps.needsHealthbarRuntimeHelperWork;
    var TryReadHeroFromPanelDetails = _deps.tryReadHeroFromPanelDetails;
    var GetUIRoot = _deps.getUIRoot;
    // Phase B.3: Removed dead PerfStart/PerfEnd destructuring (not in QOL.import array).

    // Use Utils color functions (Step 0.1) instead of local copies
    var PushUnique = Utils.PushUnique;

    // ── Healthbar type enum (local copies) ──
    var HEALTHBAR_TYPE_DEFAULT    = 0;
    var HEALTHBAR_TYPE_MINIMALIST = 1;
    var HEALTHBAR_TYPE_FG         = 2;
    var HEALTHBAR_TYPE_KLUTZ      = 3;
    var HEALTHBAR_TYPE_BUDHUD     = 4;
    var HEALTHBAR_TYPE_MINECRAFT  = 5;

    // ── Panel IDs (local references) ──
    var PANEL_ID_HEALTH_CONTAINER = "health_and_abilities_container";
    var PANEL_ID_GOLD_AP_CONTAINER = "gold_and_ap_container";

    // ── Shared runtime helpers ──

    function ResetMinimalistHealthbarOffsetRuntime(panel) {
        if (!panel || !panel.style) return;
        ClearStyleSafe(panel, "x");
        ClearStyleSafe(panel, "y");
    }

    // Clear, never write identity values. ui-scale in particular belongs to CSS:
    // base/hud.css:420 puts 120% on #health_and_abilities_container (104% under
    // .support_16_10_active), so writing "100%" here is not a reset — it shrinks
    // the bar to 100/120 and, because the panel is centred off a 1290px right
    // margin, moves it left. Same reasoning for opacity: the game fades the
    // container in over 1.5s on .GameStatePreGame, and a forced 1.00 skips it.
    function ResetPlayerHealthbarScaleOpacityRuntime(panel) {
        if (!panel || !panel.style) return;
        ClearStyleSafe(panel, "preTransformScale2d");
        ClearStyleSafe(panel, "uiScale");
        ClearStyleSafe(panel, "opacity");
    }

    function ResetMinimalistHealthbarOffsetRuntimeAll(root, currentPanel, previousPanel) {
        var seen = [];
        function pushUnique(panel) {
            if (!IsPanelValid(panel)) return;
            PushUnique(seen, panel);
        }

        pushUnique(currentPanel);
        pushUnique(previousPanel);
        pushUnique(GetCachedPanel("healthContainer"));

        if (root && root.FindChildTraverse) {
            pushUnique(root.FindChildTraverse(PANEL_ID_HEALTH_CONTAINER));
        }
        var uiRoot = GetUIRoot();
        if (uiRoot && uiRoot.FindChildTraverse) {
            pushUnique(uiRoot.FindChildTraverse(PANEL_ID_HEALTH_CONTAINER));
        }

        for (var p = 0; p < seen.length; p++) {
            ResetMinimalistHealthbarOffsetRuntime(seen[p]);
        }
    }

    function BuildPlayerHealthbarRuntimeStyleState(cfg, minimalistEnabled, minimalistClassActive) {
        var playerOffsetX = (cfg && cfg.PLAYER_HEALTHBAR_X_OFFSET !== undefined && cfg.PLAYER_HEALTHBAR_X_OFFSET !== null)
            ? Math.round(Number(cfg.PLAYER_HEALTHBAR_X_OFFSET))
            : 0;
        var playerOffsetY = (cfg && cfg.PLAYER_HEALTHBAR_Y_OFFSET !== undefined && cfg.PLAYER_HEALTHBAR_Y_OFFSET !== null)
            ? Math.round(Number(cfg.PLAYER_HEALTHBAR_Y_OFFSET))
            : 0;
        var playerScale = (cfg && cfg.PLAYER_HEALTHBAR_SCALE !== undefined && cfg.PLAYER_HEALTHBAR_SCALE !== null)
            ? Math.round(Number(cfg.PLAYER_HEALTHBAR_SCALE))
            : 100;
        var playerOpacity = (cfg && cfg.PLAYER_HEALTHBAR_OPACITY !== undefined && cfg.PLAYER_HEALTHBAR_OPACITY !== null)
            ? Number(cfg.PLAYER_HEALTHBAR_OPACITY)
            : 1.0;
        if (!isFinite(playerOffsetX)) playerOffsetX = 0;
        if (!isFinite(playerOffsetY)) playerOffsetY = 0;
        if (!isFinite(playerScale)) playerScale = 100;
        if (!isFinite(playerOpacity)) playerOpacity = 1.0;
        if (playerOffsetX < -1000) playerOffsetX = -1000;
        if (playerOffsetX > 1000) playerOffsetX = 1000;
        if (playerOffsetY < -1000) playerOffsetY = -1000;
        if (playerOffsetY > 1000) playerOffsetY = 1000;
        if (playerScale < 50) playerScale = 50;
        if (playerScale > 200) playerScale = 200;
        if (playerOpacity < 0) playerOpacity = 0;
        if (playerOpacity > 1) playerOpacity = 1;

        var minimalistOffsetX = 0;
        var minimalistOffsetY = 0;
        if (minimalistEnabled && minimalistClassActive) {
            var legacyOffsetX = (cfg && cfg.MINIMALIST_HEALTHBAR_X_OFFSET !== undefined && cfg.MINIMALIST_HEALTHBAR_X_OFFSET !== null)
                ? Math.round(Number(cfg.MINIMALIST_HEALTHBAR_X_OFFSET))
                : 0;
            var legacyOffsetY = (cfg && cfg.MINIMALIST_HEALTHBAR_Y_OFFSET !== undefined && cfg.MINIMALIST_HEALTHBAR_Y_OFFSET !== null)
                ? Math.round(Number(cfg.MINIMALIST_HEALTHBAR_Y_OFFSET))
                : 0;
            if (!isFinite(legacyOffsetX)) legacyOffsetX = 0;
            if (!isFinite(legacyOffsetY)) legacyOffsetY = 0;
            if (legacyOffsetX < -300) legacyOffsetX = -300;
            if (legacyOffsetX > 300) legacyOffsetX = 300;
            if (legacyOffsetY < -300) legacyOffsetY = -300;
            if (legacyOffsetY > 300) legacyOffsetY = 300;
            minimalistOffsetX = legacyOffsetX;
            minimalistOffsetY = -legacyOffsetY;
        }

        var finalOffsetX = playerOffsetX + minimalistOffsetX;
        var finalOffsetY = (-playerOffsetY) + minimalistOffsetY;
        var finalScale = (playerScale / 100);
        var scaleText = String(playerScale) + "%";
        var preTransformScaleText = finalScale.toFixed(2) + ", " + finalScale.toFixed(2);
        var opacityText = playerOpacity.toFixed(2);
        var scaleActive = (Math.abs(finalScale - 1.0) > 0.0001);
        var opacityActive = (Math.abs(playerOpacity - 1.0) > 0.0001);
        var scaleOpacityActive =
            scaleActive ||
            opacityActive;

        return {
            finalOffsetX: finalOffsetX,
            finalOffsetY: finalOffsetY,
            finalScale: finalScale,
            scaleText: scaleText,
            preTransformScaleText: preTransformScaleText,
            opacityText: opacityText,
            playerOpacity: playerOpacity,
            scaleActive: scaleActive,
            opacityActive: opacityActive,
            scaleOpacityActive: scaleOpacityActive
        };
    }

    // ui-scale on #health_and_abilities_container is the game's (base/hud.css:420
    // = 120%, and .support_16_10_active overrides it to 104%), so the mod must not
    // write it — the factor rides on pre-transform-scale2d, which multiplies with
    // ui-scale instead of replacing it. Anything at its default value is cleared
    // rather than written, so the CSS value and its transitions come back.
    function ApplyPlayerHealthbarRuntimeStyleToPanel(panel, runtimeState, includeOffsets) {
        if (!panel || !panel.style || !runtimeState) return;
        var applyOffsets = (includeOffsets !== false);
        if (applyOffsets) {
            if (runtimeState.finalOffsetX !== 0) panel.style.x = String(runtimeState.finalOffsetX) + "px";
            else ClearStyleSafe(panel, "x");
            if (runtimeState.finalOffsetY !== 0) panel.style.y = String(runtimeState.finalOffsetY) + "px";
            else ClearStyleSafe(panel, "y");
        }
        ClearStyleSafe(panel, "uiScale");
        if (runtimeState.scaleActive) panel.style.preTransformScale2d = runtimeState.preTransformScaleText;
        else ClearStyleSafe(panel, "preTransformScale2d");
        if (runtimeState.opacityActive) panel.style.opacity = runtimeState.opacityText;
        else ClearStyleSafe(panel, "opacity");
    }

    function ResetPlayerHealthbarRuntimeStyle(panel) {
        ResetMinimalistHealthbarOffsetRuntime(panel);
        ResetPlayerHealthbarScaleOpacityRuntime(panel);
    }


    // ── Dispatcher ──

    function UpdateHealthbarRuntimeHelpers(root, cfg, nowMsLoop, healthbarType, minimalistHealthbarEnabled, fgHealthbarEnabled) {
        var shouldRunMinimalistRuntime =
            minimalistHealthbarEnabled ||
            HasNonDefaultPlayerHealthbarRuntimeConfig(cfg) ||
            !!(State.playerHealthbarAccentColorSig && String(State.playerHealthbarAccentColorSig).length > 0) ||
            State.minimalistHealthbarOffsetApplied ||
            State.playerHealthbarScaleOpacityRuntimeApplied;
        if (shouldRunMinimalistRuntime) {
            QOL.healthbar.minimalist.update(root, cfg, minimalistHealthbarEnabled);
        }

        var shouldRunBudhudRuntime = (Number(healthbarType) === 4) || State.budhudWasEnabled;
        if (shouldRunBudhudRuntime) {
            if (QOL.healthbar && QOL.healthbar.budhud && QOL.healthbar.budhud.update) {
                QOL.healthbar.budhud.update(root, cfg, healthbarType, nowMsLoop);
            }
        }

        var shouldRunFgRuntime = fgHealthbarEnabled || State.fgHeroImageMoved || State.fgHeroImageRuntimeStyleSig !== "" || State.fgHeroImageCurrentSig !== "";
        if (shouldRunFgRuntime) {
            if (QOL.healthbar && QOL.healthbar.fg && QOL.healthbar.fg.update) {
                QOL.healthbar.fg.update(root, cfg);
            }
        }

        var shouldRunMinecraftRuntime = (Number(healthbarType) === HEALTHBAR_TYPE_MINECRAFT) || State.mcWasEnabled;
        if (shouldRunMinecraftRuntime) {
            var mcEnabled = (Number(healthbarType) === HEALTHBAR_TYPE_MINECRAFT);
            if (QOL.healthbar && QOL.healthbar.mc && QOL.healthbar.mc.update) {
                QOL.healthbar.mc.update(root, cfg, nowMsLoop, mcEnabled);
            }
        }
    }

    // ── Publish bridge functions for coreRoot access ──
    try {
        QOL.needsHealthbarRuntimeHelperWork = NeedsHealthbarRuntimeHelperWork;
    } catch(e) { $.Msg("[QOLLock][WARN][" + _featureId + "] could not publish needsHealthbarRuntimeHelperWork"); }
    try {
        QOL.updateHealthbarRuntimeHelpers = UpdateHealthbarRuntimeHelpers;
    } catch(e) { $.Msg("[QOLLock][WARN][" + _featureId + "] could not publish updateHealthbarRuntimeHelpers"); }
    // ── Publish healthbar shared helpers (for extracted subsystems) ──
    try {
        QOL.healthbar = QOL.healthbar || {};
        QOL.healthbar.resetMinimalistOffsetRuntime = ResetMinimalistHealthbarOffsetRuntime;
        QOL.healthbar.resetMinimalistOffsetRuntimeAll = ResetMinimalistHealthbarOffsetRuntimeAll;
        QOL.healthbar.buildPlayerHealthbarStyleState = BuildPlayerHealthbarRuntimeStyleState;
        QOL.healthbar.applyPlayerStyleToPanel = ApplyPlayerHealthbarRuntimeStyleToPanel;
        QOL.healthbar.resetPlayerStyle = ResetPlayerHealthbarRuntimeStyle;
        QOL.healthbar.resetPlayerScaleOpacity = ResetPlayerHealthbarScaleOpacityRuntime;
    } catch(e) { $.Msg("[QOLLock][WARN][" + _featureId + "] could not publish healthbar shared helpers"); }

    // ── Registration ──
    QOL.register("healthbarRuntimeHelpers", {
        configKeys: ["HEALTHBAR_TYPE", "ENABLE_MINIMALIST_HEALTHBAR",
                     "ENABLE_FG_HEALTHBAR"],
        bucket: 1, phase: 0,
        requiresRoot: true,
        gate: function(cfg) {
            var ht = Number(cfg.HEALTHBAR_TYPE);
            return ht === 1 || ht === 2 || ht === 3 || ht === 4 || ht === 5;
        },
        update: function(root, cfg, nowMs) {
            var ht = Number(cfg.HEALTHBAR_TYPE) || 0;
            UpdateHealthbarRuntimeHelpers(root, cfg, nowMs, ht,
                ht === 1, ht === 2);
        },
        stateKeys: ["minimalistHealthbarOffsetSig", "minimalistHealthbarOffsetApplied",
                    "minimalistHealthbarOffsetPanel",
                    "playerHealthbarScaleOpacityRuntimeApplied",
                    "budhudWasEnabled", "budhudNextUpdateMs",
                    "budhudLastColor", "budhudLastPercentText",
                    "budhudCurrentLabelBaseColor", "budhudCurrentLabelBaseColorCaptured",
                    "mcWasEnabled", "mcNextUpdateMs",
                    "mcHeartsBlinkTimer", "mcLowHealthJiggleTimer", "mcHealingWaveTimer",
                    "mcIsAfflicted", "mcCheckModifierNextMs",
                    "mcHeartSlots", "mcHeartContainerImages", "mcHeartHealingImages",
                    "mcHeartDeferredImages", "mcHeartFillImages",
                    "mcHeartsCapacity", "mcHeartsRowCount", "mcLastVisibleHeartsCount",
                    "mcBarrierHeartsPanels", "mcBarrierHeartContainerImages",
                    "mcBarrierHeartFillImages", "mcBarrierHeartsCapacity",
                    "mcCachedFoodIcons", "mcLoggedHealthContainerMiss",
                    "coloredHealthbarBridgeValue", "playerHealthbarAccentColorSig",
                    "playerHealthbarAccentColorPanels", "playerHealthbarAccentColorToken"]
    });

    // ── Self-test ──
    try {
        if (typeof UpdateHealthbarRuntimeHelpers !== "function") throw new Error("UpdateHealthbarRuntimeHelpers missing");
    } catch(e) {
        $.Msg("[QOLLock][ERROR][" + _featureId + "] self-test: " + (e && e.message ? e.message : String(e)));
    }
})();

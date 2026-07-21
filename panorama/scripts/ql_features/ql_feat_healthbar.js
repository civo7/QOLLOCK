// ql_feat_healthbar.js — Healthbar type runtime (Minimalist, FG, Budhud, Klutz, Minecraft)
// Extracted from ql_core.js, Phase 11 Step 1
(function() {
    'use strict';
    var _featureId = "ql_feat_healthbar";
    // DEPENDS: state, utils, getCachedPanel, setCachedPanel, isCfgEnabled, isColorWarningEnabled, isPanelValid, setStyleSafe, setWashColorSafe, normalizePaletteColorIndex, resolveWashColorFromPalette, isHudVisibleForPlayerHealthbarRuntime, hasNonDefaultPlayerHealthbarRuntimeConfig, needsHealthbarRuntimeHelperWork, tryReadHeroFromPanelDetails, getUIRoot
    var _deps = QOL.import(["state", "utils", "getCachedPanel", "setCachedPanel",
        "isCfgEnabled", "isColorWarningEnabled", "isPanelValid",
        "setStyleSafe", "setWashColorSafe",
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
    var IsCfgEnabled = _deps.isCfgEnabled;
    var IsColorWarningEnabled = _deps.isColorWarningEnabled;
    var IsPanelValid = _deps.isPanelValid;
    var SetStyleSafe = _deps.setStyleSafe;
    var ClearStyleSafe = _deps.clearStyleSafe;
    var SetWashColorSafe = _deps.setWashColorSafe;
    var NormalizePaletteColorIndex = _deps.normalizePaletteColorIndex;
    var ResolveWashColorFromPalette = _deps.resolveWashColorFromPalette;
    var IsHudVisibleForPlayerHealthbarRuntime = _deps.isHudVisibleForPlayerHealthbarRuntime;
    var HasNonDefaultPlayerHealthbarRuntimeConfig = _deps.hasNonDefaultPlayerHealthbarRuntimeConfig;
    var NeedsHealthbarRuntimeHelperWork = _deps.needsHealthbarRuntimeHelperWork;
    var TryReadHeroFromPanelDetails = _deps.tryReadHeroFromPanelDetails;
    var GetUIRoot = _deps.getUIRoot;
    var PerfStart = _deps.perfStart;
    var PerfEnd = _deps.perfEnd;

    // Use Utils color functions (Step 0.1) instead of local copies
    var ToRgbString = Utils.ToRgbString;
    var BlendRgb = Utils.BlendRgb;
    var FindFirstPanelByClass = Utils.FindFirstPanelByClass;
    var PushUnique = Utils.PushUnique;

    // ── Color constants (moved from ql_core.js) ──
    var COLORED_HEALTHBAR_LOW_HP_THRESHOLD = 25;
    var COLORED_HEALTHBAR_MID_HP_THRESHOLD = 65;
    var COLORED_HEALTHBAR_HIGH_HP_THRESHOLD = 75;
    var COLORED_HEALTHBAR_PULSE_STEP = 0.1;
    var COLORED_HEALTHBAR_COLOR_RED = [255, 0, 0];
    var COLORED_HEALTHBAR_COLOR_DARK_RED = [222, 0, 0];
    var COLORED_HEALTHBAR_COLOR_ORANGE = [255, 177, 0];
    var COLORED_HEALTHBAR_COLOR_YELLOW = [255, 240, 120];
    var COLORED_HEALTHBAR_COLOR_WHITE = [255, 255, 255];

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

    // ── Minecraft healthbar constants ──
    var MC_CHARGE_MAX_ANGLES = { 1: 90, 2: 42, 3: 26, 4: 20, 5: 15.5, 6: 13, 7: 10.86 };
    var MC_HP_PER_HALF_SEGMENT = 50;
    var MC_LOW_HEALTH_HALF_SEGMENTS = 4;
    var MC_HEARTS_PER_ROW = 10;
    var MC_MAX_HEART_ROWS = 5;
    var MC_HEART_ROW_HEIGHT_PX = 22;
    var MC_HEALTH_BAR_PIXEL_HEIGHT = 367;
    var MC_HEALTH_BAR_SCALE = 52 / 30;
    var MC_SOULS_BAR_MAX_HEIGHT_PX = 52;
    var MC_FOOD_PERCENT_PER_HALF = 5;
    var MC_TICK_INTERVAL_MS = 50;
    var MC_MODIFIER_THROTTLE_MS = 500;
    var MC_BLINK_INTERVAL_S = 0.1;
    var MC_BLINK_PHASE_COUNT = 4;
    var MC_JIGGLE_INTERVAL_S = 0.05;
    var MC_JIGGLE_CHANCE = 0.5;
    var MC_HEALING_WAVE_STEP_S = 0.05;
    var MC_HEALING_WAVE_PAUSE_S = 0.5;

    // ── Colored healthbar ──

    function ResolveColoredHealthbarColor(pct, cfg) {
        var use25 = IsCfgEnabled(cfg, "ENABLE_COLOR_WARNING_25");
        var use65 = IsCfgEnabled(cfg, "ENABLE_COLOR_WARNING_65");
        var use75 = IsCfgEnabled(cfg, "ENABLE_COLOR_WARNING_75");

        if (use25 && pct <= COLORED_HEALTHBAR_LOW_HP_THRESHOLD) {
            State.coloredHealthbarPulseVal += (State.coloredHealthbarPulseDir * COLORED_HEALTHBAR_PULSE_STEP);
            if (State.coloredHealthbarPulseVal >= 1) {
                State.coloredHealthbarPulseVal = 1;
                State.coloredHealthbarPulseDir = -1;
            } else if (State.coloredHealthbarPulseVal <= 0) {
                State.coloredHealthbarPulseVal = 0;
                State.coloredHealthbarPulseDir = 1;
            }
            return ToRgbString(BlendRgb(COLORED_HEALTHBAR_COLOR_RED, COLORED_HEALTHBAR_COLOR_DARK_RED, State.coloredHealthbarPulseVal));
        }
        if (use65 && pct <= COLORED_HEALTHBAR_MID_HP_THRESHOLD) return ToRgbString(COLORED_HEALTHBAR_COLOR_ORANGE);
        if (use75 && pct <= COLORED_HEALTHBAR_HIGH_HP_THRESHOLD) return ToRgbString(COLORED_HEALTHBAR_COLOR_YELLOW);
        return ToRgbString(COLORED_HEALTHBAR_COLOR_WHITE);
    }

    // ── Shared runtime helpers ──

    function ResetMinimalistHealthbarOffsetRuntime(panel) {
        if (!panel || !panel.style) return;
        try { panel.style.x = "0px"; } catch(e0) { $.Msg("[QOLLock][WARN][" + _featureId + "] op failed: " + (e0 && e0.message ? e0.message : String(e0 || ""))); }
        try { panel.style.y = "0px"; } catch(e00) { $.Msg("[QOLLock][WARN][" + _featureId + "] op failed: " + (e00 && e00.message ? e00.message : String(e00 || ""))); }
    }

    function ResetPlayerHealthbarScaleOpacityRuntime(panel) {
        if (!panel || !panel.style) return;
        try { panel.style.preTransformScale2d = "1.00, 1.00"; } catch(e0) { $.Msg("[QOLLock][WARN][" + _featureId + "] op failed: " + (e0 && e0.message ? e0.message : String(e0 || ""))); }
        try { panel.style.opacity = "1.00"; } catch(e1) { $.Msg("[QOLLock][WARN][" + _featureId + "] op failed: " + (e1 && e1.message ? e1.message : String(e1 || ""))); }
    }

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
        panel.style.opacity = runtimeState.opacityText;
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
        var scaleText = finalScale.toFixed(2) + ", " + finalScale.toFixed(2);
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
            opacityText: opacityText,
            playerOpacity: playerOpacity,
            scaleActive: scaleActive,
            opacityActive: opacityActive,
            scaleOpacityActive: scaleOpacityActive
        };
    }

    function ApplyPlayerHealthbarRuntimeStyleToPanel(panel, runtimeState, includeOffsets) {
        if (!panel || !panel.style || !runtimeState) return;
        var applyOffsets = (includeOffsets !== false);
        if (applyOffsets) {
            panel.style.x = String(runtimeState.finalOffsetX) + "px";
            panel.style.y = String(runtimeState.finalOffsetY) + "px";
        }
        panel.style.preTransformScale2d = runtimeState.scaleText;
        panel.style.opacity = runtimeState.opacityText;
    }

    function ResetPlayerHealthbarRuntimeStyle(panel) {
        ResetMinimalistHealthbarOffsetRuntime(panel);
        ResetPlayerHealthbarScaleOpacityRuntime(panel);
    }

    function ReadPlayerHealthbarAccentColorIndex(cfg) {
        return NormalizePaletteColorIndex(cfg && cfg.PLAYER_HEALTHBAR_ACCENT_COLOR);
    }

    function ResetPlayerHealthbarAccentColorRuntime() {
        State.playerHealthbarAccentColorToken = (Number(State.playerHealthbarAccentColorToken) || 0) + 1;
        var panels = State.playerHealthbarAccentColorPanels || [];
        for (var i = 0; i < panels.length; i++) {
            if (IsPanelValid(panels[i])) {
                SetWashColorSafe(panels[i], "");
            }
        }
        State.playerHealthbarAccentColorPanels = [];
        State.playerHealthbarAccentColorSig = "";
    }

    function PushAccentColorTarget(list, panel) {
        if (!IsPanelValid(panel)) return;
        for (var i = 0; i < list.length; i++) {
            if (list[i] === panel) return;
        }
        list.push(panel);
    }

    function FindPlayerHealthbarAccentColorPanels(root, healthContainer) {
        var targets = [];
        if (healthContainer && healthContainer.FindChildTraverse) {
            PushAccentColorTarget(targets, healthContainer.FindChildTraverse("health_bar_frame"));
        }
        if (healthContainer && healthContainer.FindChildrenWithClassTraverse) {
            var backers = healthContainer.FindChildrenWithClassTraverse("healthBacker") || [];
            for (var i = 0; i < backers.length; i++) {
                PushAccentColorTarget(targets, backers[i]);
            }
        }
        if (targets.length === 0 && root && root.FindChildTraverse) {
            PushAccentColorTarget(targets, root.FindChildTraverse("health_bar_frame"));
        }
        if (targets.length <= 1 && root && root.FindChildrenWithClassTraverse) {
            var rootBackers = root.FindChildrenWithClassTraverse("healthBacker") || [];
            for (var j = 0; j < rootBackers.length; j++) {
                PushAccentColorTarget(targets, rootBackers[j]);
            }
        }
        return targets;
    }

    function ApplyPlayerHealthbarAccentColor(root, cfg, healthContainer) {
        var panels = FindPlayerHealthbarAccentColorPanels(root, healthContainer);
        var colorIndex = ReadPlayerHealthbarAccentColorIndex(cfg);
        var color = ResolveWashColorFromPalette(colorIndex);
        var idParts = [];
        for (var i = 0; i < panels.length; i++) {
            idParts.push(String(panels[i].id || "healthBacker"));
        }
        var styleSig = idParts.join(",") + "|" + color;

        var oldPanels = State.playerHealthbarAccentColorPanels || [];
        for (var oldIndex = 0; oldIndex < oldPanels.length; oldIndex++) {
            var stillTargeted = false;
            for (var newIndex = 0; newIndex < panels.length; newIndex++) {
                if (oldPanels[oldIndex] === panels[newIndex]) {
                    stillTargeted = true;
                    break;
                }
            }
            if (!stillTargeted && IsPanelValid(oldPanels[oldIndex])) {
                SetWashColorSafe(oldPanels[oldIndex], "");
            }
        }

        if (panels.length === 0) {
            State.playerHealthbarAccentColorToken = (Number(State.playerHealthbarAccentColorToken) || 0) + 1;
            State.playerHealthbarAccentColorPanels = [];
            State.playerHealthbarAccentColorSig = "";
            return;
        }

        if (State.playerHealthbarAccentColorSig === styleSig) {
            return;
        }
        State.playerHealthbarAccentColorToken = (Number(State.playerHealthbarAccentColorToken) || 0) + 1;
        var applyToken = State.playerHealthbarAccentColorToken;
        for (var applyIndex = 0; applyIndex < panels.length; applyIndex++) {
            SetWashColorSafe(panels[applyIndex], "");
        }
        State.playerHealthbarAccentColorPanels = panels;
        State.playerHealthbarAccentColorSig = styleSig;
        if (color) {
            $.Schedule(0.01, function() {
                if (State.playerHealthbarAccentColorToken !== applyToken || State.playerHealthbarAccentColorSig !== styleSig) {
                    return;
                }
                for (var delayedIndex = 0; delayedIndex < panels.length; delayedIndex++) {
                    if (IsPanelValid(panels[delayedIndex])) {
                        SetWashColorSafe(panels[delayedIndex], color);
                    }
                }
            });
        }
    }

    // ── Minimalist ──

    function UpdateMinimalistHealthbarOffsets(root, cfg, enabled) {
        var healthContainer = GetCachedPanel("healthContainer");
        if (!healthContainer) {
            healthContainer = (root && root.FindChildTraverse) ? root.FindChildTraverse(PANEL_ID_HEALTH_CONTAINER) : null;
            SetCachedPanel("healthContainer", healthContainer);
        }

        var previousPanel = IsPanelValid(State.minimalistHealthbarOffsetPanel) ? State.minimalistHealthbarOffsetPanel : null;
        if (previousPanel && previousPanel !== healthContainer) {
            ResetMinimalistHealthbarOffsetRuntime(previousPanel);
        }

        if (!healthContainer) {
            ResetMinimalistHealthbarOffsetRuntimeAll(root, healthContainer, previousPanel);
            ResetPlayerHealthbarAccentColorRuntime();
            State.minimalistHealthbarOffsetSig = "";
            State.minimalistHealthbarOffsetApplied = false;
            State.minimalistHealthbarOffsetPanel = null;
            State.playerHealthbarScaleOpacityRuntimeApplied = false;
            return;
        }

        var classActive = !!(root && root.BHasClass && root.BHasClass("minimalist_healthbar_active"));
        var runtimeState = BuildPlayerHealthbarRuntimeStyleState(cfg, enabled, classActive);
        var styleSig = runtimeState.finalOffsetX + "|" + runtimeState.finalOffsetY + "|" + runtimeState.scaleText + "|" + runtimeState.opacityText + "|" + ((enabled && classActive) ? "1" : "0");

        if (
            State.minimalistHealthbarOffsetApplied &&
            State.minimalistHealthbarOffsetPanel === healthContainer &&
            State.minimalistHealthbarOffsetSig === styleSig
        ) {
            return;
        }

        ApplyPlayerHealthbarRuntimeStyleToPanel(healthContainer, runtimeState, true);
        ApplyPlayerHealthbarAccentColor(root, cfg, healthContainer);
        State.playerHealthbarScaleOpacityRuntimeApplied = runtimeState.scaleOpacityActive;

        State.minimalistHealthbarOffsetSig = styleSig;
        State.minimalistHealthbarOffsetApplied = true;
        State.minimalistHealthbarOffsetPanel = healthContainer;
    }

    // ── Budhud ──

    function ParseBudhudNumericLabelValue(rawText) {
        if (rawText === undefined || rawText === null) return NaN;
        var text = String(rawText || "");
        if (!text || text.length === 0) return NaN;
        var digits = text.replace(/[^0-9]/g, "");
        if (!digits || digits.length === 0) return NaN;
        var value = parseInt(digits, 10);
        if (!isFinite(value)) return NaN;
        return value;
    }

    function ResolveBudhudHealthPanels(root) {
        if (!root || !root.FindChildTraverse) return null;

        var content = GetCachedPanel("budhudHealthBarContent");
        if (!content) {
            content = root.FindChildTraverse("HealthBarContent");
            SetCachedPanel("budhudHealthBarContent", content);
        }
        if (!IsPanelValid(content)) return null;

        var regenTotal = GetCachedPanel("budhudHealthRegenAndTotal");
        if (!regenTotal || (regenTotal.GetParent && regenTotal.GetParent() !== root)) {
            regenTotal = root.FindChildTraverse ? root.FindChildTraverse("HealthRegenAndTotal") : null;
            SetCachedPanel("budhudHealthRegenAndTotal", regenTotal);
        }
        if (!IsPanelValid(regenTotal)) return null;

        var healthContainer = GetCachedPanel("budhudHealthContainer");
        if (!healthContainer || (healthContainer.GetParent && healthContainer.GetParent() !== regenTotal)) {
            healthContainer = FindFirstPanelByClass(regenTotal, "healthContainer");
            SetCachedPanel("budhudHealthContainer", healthContainer);
        }
        if (!IsPanelValid(healthContainer)) return null;

        var currentLabel = GetCachedPanel("budhudCurrentHealthLabel");
        if (!currentLabel || (currentLabel.GetParent && !currentLabel.GetParent())) {
            currentLabel = FindFirstPanelByClass(regenTotal, "currentHealthLabel");
            SetCachedPanel("budhudCurrentHealthLabel", currentLabel);
        }
        if (!IsPanelValid(currentLabel)) return null;

        var totalLabel = GetCachedPanel("budhudTotalHealthLabel");
        if (!totalLabel || (totalLabel.GetParent && !totalLabel.GetParent())) {
            totalLabel = FindFirstPanelByClass(regenTotal, "totalHealthLabel");
            SetCachedPanel("budhudTotalHealthLabel", totalLabel);
        }
        if (!IsPanelValid(totalLabel)) return null;

        var percentLabel = GetCachedPanel("budhudPercentLabel");
        if (!percentLabel || (percentLabel.GetParent && percentLabel.GetParent() !== healthContainer)) {
            percentLabel = healthContainer.FindChildTraverse ? healthContainer.FindChildTraverse("HealthPercentLabel") : null;
            if (!IsPanelValid(percentLabel)) {
                try {
                    percentLabel = $.CreatePanel("Label", healthContainer, "HealthPercentLabel");
                } catch (eCreate) {
                    percentLabel = null;
                }
            }
            SetCachedPanel("budhudPercentLabel", percentLabel);
        }
        if (!IsPanelValid(percentLabel)) return null;

        return {
            currentLabel: currentLabel,
            totalLabel: totalLabel,
            percentLabel: percentLabel
        };
    }

    function ResetBudhudHealthbarRuntime() {
        var currentLabel = GetCachedPanel("budhudCurrentHealthLabel");
        var percentLabel = GetCachedPanel("budhudPercentLabel");

        if (currentLabel) {
            try {
                if (State.budhudCurrentLabelBaseColorCaptured) {
                    currentLabel.style.color = String(State.budhudCurrentLabelBaseColor || "");
                } else {
                    currentLabel.style.color = "";
                }
            } catch(e0) { $.Msg("[QOLLock][WARN][" + _featureId + "] op failed: " + (e0 && e0.message ? e0.message : String(e0 || ""))); }
        }
        if (percentLabel) {
            try { percentLabel.style.visibility = "collapse"; } catch(e1) { $.Msg("[QOLLock][WARN][" + _featureId + "] op failed: " + (e1 && e1.message ? e1.message : String(e1 || ""))); }
            try { percentLabel.style.color = ""; } catch(e2) { $.Msg("[QOLLock][WARN][" + _featureId + "] op failed: " + (e2 && e2.message ? e2.message : String(e2 || ""))); }
        }

        State.budhudWasEnabled = false;
        State.budhudLastColor = "";
        State.budhudLastPercentText = "";
        State.budhudNextUpdateMs = 0;
    }

    function UpdateBudhudHealthbar(root, cfg, healthbarType, nowMs) {
        if (!root || !root.FindChildTraverse) return;
        var enabled = (Number(healthbarType) === 4);
        if (!enabled) {
            if (State.budhudWasEnabled) {
                ResetBudhudHealthbarRuntime();
            }
            return;
        }

        if ((Number(nowMs) || 0) < (Number(State.budhudNextUpdateMs) || 0)) {
            return;
        }

        var panels = ResolveBudhudHealthPanels(root);
        if (!panels) {
            State.budhudNextUpdateMs = (Number(nowMs) || 0) + 400;
            return;
        }

        var currentLabel = panels.currentLabel;
        var totalLabel = panels.totalLabel;
        var percentLabel = panels.percentLabel;

        if (!State.budhudCurrentLabelBaseColorCaptured) {
            try { State.budhudCurrentLabelBaseColor = String(currentLabel.style.color || ""); } catch (eBase) { State.budhudCurrentLabelBaseColor = ""; }
            State.budhudCurrentLabelBaseColorCaptured = true;
        }

        var currentValue = ParseBudhudNumericLabelValue(currentLabel && currentLabel.text);
        var totalValue = ParseBudhudNumericLabelValue(totalLabel && totalLabel.text);
        if (!isFinite(currentValue) || !isFinite(totalValue) || totalValue <= 0) {
            State.budhudNextUpdateMs = (Number(nowMs) || 0) + 200;
            State.budhudWasEnabled = true;
            return;
        }

        var percent = (currentValue / totalValue) * 100;
        if (!isFinite(percent)) percent = 0;
        if (percent < 0) percent = 0;

        var nextPercentText = String(Math.floor(percent)) + "%";
        if (nextPercentText !== State.budhudLastPercentText) {
            percentLabel.text = nextPercentText;
            State.budhudLastPercentText = nextPercentText;
        }
        try { percentLabel.style.visibility = "visible"; } catch(eVis) { $.Msg("[QOLLock][WARN][" + _featureId + "] op failed: " + (eVis && eVis.message ? eVis.message : String(eVis || ""))); }

        var warningEnabled = IsColorWarningEnabled(cfg);
        if (warningEnabled) {
            var nextColor = ResolveColoredHealthbarColor(percent, cfg);
            if (nextColor !== State.budhudLastColor) {
                try { currentLabel.style.color = nextColor; } catch(eColor0) { $.Msg("[QOLLock][WARN][" + _featureId + "] op failed: " + (eColor0 && eColor0.message ? eColor0.message : String(eColor0 || ""))); }
                try { percentLabel.style.color = nextColor; } catch(eColor1) { $.Msg("[QOLLock][WARN][" + _featureId + "] op failed: " + (eColor1 && eColor1.message ? eColor1.message : String(eColor1 || ""))); }
                State.budhudLastColor = nextColor;
            }
        } else {
            var baseColor = State.budhudCurrentLabelBaseColorCaptured
                ? String(State.budhudCurrentLabelBaseColor || "")
                : "";
            var baseSig = "__base__:" + baseColor;
            if (State.budhudLastColor !== baseSig) {
                try { currentLabel.style.color = baseColor; } catch(eBase0) { $.Msg("[QOLLock][WARN][" + _featureId + "] op failed: " + (eBase0 && eBase0.message ? eBase0.message : String(eBase0 || ""))); }
                try { percentLabel.style.color = baseColor; } catch(eBase1) { $.Msg("[QOLLock][WARN][" + _featureId + "] op failed: " + (eBase1 && eBase1.message ? eBase1.message : String(eBase1 || ""))); }
                State.budhudLastColor = baseSig;
            }
        }

        State.budhudWasEnabled = true;
        State.budhudNextUpdateMs = (Number(nowMs) || 0) + 100;
    }

    // ── Minecraft Healthbar ──

    function McResolveHudRoot(root) {
        var cached = GetCachedPanel("mcHudRoot");
        if (cached) return cached;
        var heartsRoot = root && root.FindChildTraverse ? root.FindChildTraverse("MinecraftHeartsRoot") : null;
        var panel = (heartsRoot && heartsRoot.GetParent) ? heartsRoot.GetParent() : null;
        SetCachedPanel("mcHudRoot", IsPanelValid(panel) ? panel : null);
        return GetCachedPanel("mcHudRoot");
    }

    function McResetRuntime() {
        if (State.mcHeartsBlinkTimer !== null) {
            $.CancelScheduled(State.mcHeartsBlinkTimer);
            State.mcHeartsBlinkTimer = null;
        }
        if (State.mcLowHealthJiggleTimer !== null) {
            $.CancelScheduled(State.mcLowHealthJiggleTimer);
            State.mcLowHealthJiggleTimer = null;
        }
        if (State.mcHealingWaveTimer !== null) {
            $.CancelScheduled(State.mcHealingWaveTimer);
            State.mcHealingWaveTimer = null;
        }
        State.mcHeartsBlinking = false;
        State.mcHeartsBlinkPhase = 0;
        State.mcLowHealthJiggleActive = false;
        State.mcHealingWaveActive = false;
        State.mcHealingWaveCurrentIndex = 0;
        State.mcLastBlinkHalfSegments = null;
        State.mcLastIsBlinkOn = null;
        State.mcLastContainerHeartsNeeded = -1;
        State.mcLastContainerLastSlotIsHalf = null;
        State.mcLastFillFullHearts = -1;
        State.mcLastFillHasHalf = null;
        State.mcLastFillAfflicted = null;
        State.mcLastDeferredFullHearts = -1;
        State.mcLastDeferredHasHalf = null;
        State.mcLastDeferredStartSlots = -1;
        State.mcLastHealingFullHearts = -1;
        State.mcLastHealingHasHalf = null;
        State.mcLastHealingStartSlots = -1;
        State.mcLastBarrierFullHearts = -1;
        State.mcLastBarrierHasHalf = null;
        State.mcLastBarrierLastSlotIsHalf = null;
        State.mcWasEnabled = false;
        SetCachedPanel("mcHealthPercentLabel", null);
    }

    function McStartHeartsBlink() {
        if (State.mcHeartsBlinkTimer !== null) {
            $.CancelScheduled(State.mcHeartsBlinkTimer);
            State.mcHeartsBlinkTimer = null;
        }
        State.mcHeartsBlinking = true;
        State.mcHeartsBlinkPhase = 0;
        function scheduleNextPhase() {
            State.mcHeartsBlinkTimer = $.Schedule(MC_BLINK_INTERVAL_S, function () {
                if (!State.mcHeartsBlinking) { State.mcHeartsBlinkTimer = null; return; }
                State.mcHeartsBlinkPhase += 1;
                if (State.mcHeartsBlinkPhase >= MC_BLINK_PHASE_COUNT) {
                    State.mcHeartsBlinking = false;
                    State.mcHeartsBlinkTimer = null;
                    return;
                }
                scheduleNextPhase();
            });
        }
        scheduleNextPhase();
    }

    function McLowHealthJiggleTick() {
        try {
            var hearts = State.mcHeartSlots;
            if (!hearts || hearts.length === 0) return;
            var visibleCount = Math.min(State.mcLastVisibleHeartsCount, hearts.length);
            for (var i = 0; i < visibleCount; i += 1) {
                var heart = hearts[i];
                if (Math.random() < MC_JIGGLE_CHANCE) {
                    if (heart.BHasClass("LoweredHeart")) heart.RemoveClass("LoweredHeart");
                    else heart.AddClass("LoweredHeart");
                }
            }
        } catch (e) { $.Msg("[QOLLock][MC] Error in McLowHealthJiggleTick: " + e); }
    }

    function McResetAllHeartsPosition() {
        try {
            if (!State.mcHeartSlots || State.mcHeartSlots.length === 0) return;
            for (var i = 0; i < State.mcHeartSlots.length; i += 1) {
                State.mcHeartSlots[i].RemoveClass("RaisedHeart");
                State.mcHeartSlots[i].RemoveClass("LoweredHeart");
            }
        } catch (e) { $.Msg("[QOLLock][MC] Error in McResetAllHeartsPosition: " + e); }
    }

    function McSetLowHealthJiggleEnabled(enabled) {
        if (enabled) {
            if (State.mcLowHealthJiggleActive) return;
            State.mcLowHealthJiggleActive = true;
            function scheduleNext() {
                State.mcLowHealthJiggleTimer = $.Schedule(MC_JIGGLE_INTERVAL_S, function () {
                    if (!State.mcLowHealthJiggleActive) { State.mcLowHealthJiggleTimer = null; return; }
                    McLowHealthJiggleTick();
                    scheduleNext();
                });
            }
            scheduleNext();
        } else {
            if (!State.mcLowHealthJiggleActive) return;
            State.mcLowHealthJiggleActive = false;
            if (State.mcLowHealthJiggleTimer !== null) {
                $.CancelScheduled(State.mcLowHealthJiggleTimer);
                State.mcLowHealthJiggleTimer = null;
            }
            McResetAllHeartsPosition();
        }
    }

    function McHealingWaveTick() {
        try {
            var hearts = State.mcHeartSlots;
            if (!hearts || hearts.length === 0) return;
            var visibleCount = Math.min(State.mcLastVisibleHeartsCount, hearts.length);
            if (visibleCount === 0) return;
            if (State.mcHealingWaveCurrentIndex > visibleCount) State.mcHealingWaveCurrentIndex = 0;
            if (State.mcHealingWaveCurrentIndex > 0) hearts[State.mcHealingWaveCurrentIndex - 1].RemoveClass("RaisedHeart");
            if (State.mcHealingWaveCurrentIndex >= visibleCount) {
                State.mcHealingWaveTimer = $.Schedule(MC_HEALING_WAVE_PAUSE_S, function () {
                    if (!State.mcHealingWaveActive) { State.mcHealingWaveTimer = null; return; }
                    State.mcHealingWaveCurrentIndex = 0;
                    McHealingWaveTick();
                });
                return;
            }
            hearts[State.mcHealingWaveCurrentIndex].AddClass("RaisedHeart");
            State.mcHealingWaveCurrentIndex += 1;
            State.mcHealingWaveTimer = $.Schedule(MC_HEALING_WAVE_STEP_S, function () {
                if (!State.mcHealingWaveActive) { State.mcHealingWaveTimer = null; return; }
                McHealingWaveTick();
            });
        } catch (e) { $.Msg("[QOLLock][MC] Error in McHealingWaveTick: " + e); }
    }

    function McSetHealingWaveEnabled(enabled) {
        if (enabled) {
            if (State.mcHealingWaveActive) return;
            if (State.mcLowHealthJiggleActive) return;
            State.mcHealingWaveActive = true;
            State.mcHealingWaveCurrentIndex = 0;
            McResetAllHeartsPosition();
            McHealingWaveTick();
        } else {
            if (!State.mcHealingWaveActive) return;
            State.mcHealingWaveActive = false;
            if (State.mcHealingWaveTimer !== null) {
                $.CancelScheduled(State.mcHealingWaveTimer);
                State.mcHealingWaveTimer = null;
            }
            McResetAllHeartsPosition();
        }
    }

    function McCheckModifierActive(root, name) {
        try {
            var modifierLabels = root && root.FindChildrenWithClassTraverse ? root.FindChildrenWithClassTraverse("modifier_name") : null;
            if (!modifierLabels || modifierLabels.length === 0) return false;
            for (var i = 0; i < modifierLabels.length; i += 1) {
                var label = modifierLabels[i];
                if (label.text && label.text.toUpperCase().indexOf(name) !== -1) return true;
            }
            return false;
        } catch (e) { $.Msg("[QOLLock][MC] Error in McCheckModifierActive: " + e); return false; }
    }

    function McEnsureHeartsCapacity(hudRoot, heartsNeeded) {
        if (heartsNeeded <= 0) return false;
        if (!GetCachedPanel("mcHeartsContainer")) {
            SetCachedPanel("mcHeartsContainer", hudRoot.FindChildTraverse ? (hudRoot.FindChildTraverse("MinecraftHearts") || null) : null);
            if (!GetCachedPanel("mcHeartsContainer")) {
                $.Msg("[QOLLock][MC] MinecraftHearts container not found");
                return false;
            }
        }
        var heartsNeededRowCount = Math.ceil(heartsNeeded / MC_HEARTS_PER_ROW);
        if (State.mcHeartsCapacity >= heartsNeeded && State.mcHeartSlots.length >= State.mcHeartsCapacity && State.mcHeartsRowCount === heartsNeededRowCount) return true;
        GetCachedPanel("mcHeartsContainer").RemoveAndDeleteChildren();
        State.mcHeartSlots = [];
        State.mcHeartContainerImages = [];
        State.mcHeartHealingImages = [];
        State.mcHeartDeferredImages = [];
        State.mcHeartFillImages = [];
        State.mcHeartsCapacity = heartsNeeded;
        State.mcLastVisibleHeartsCount = 0;
        State.mcLastIsBlinkOn = null;
        State.mcLastContainerHeartsNeeded = -1;
        State.mcLastContainerLastSlotIsHalf = null;
        State.mcLastFillFullHearts = -1;
        State.mcLastFillHasHalf = null;
        State.mcLastFillAfflicted = null;
        State.mcLastDeferredFullHearts = -1;
        State.mcLastDeferredHasHalf = null;
        State.mcLastDeferredStartSlots = -1;
        State.mcLastHealingFullHearts = -1;
        State.mcLastHealingHasHalf = null;
        State.mcLastHealingStartSlots = -1;
        var currentRow = null;
        var heartsInCurrentRow = 0;
        var rowPanels = [];
        function ensureRow() {
            if (currentRow === null || heartsInCurrentRow >= MC_HEARTS_PER_ROW) {
                currentRow = $.CreatePanel("Panel", GetCachedPanel("mcHeartsContainer"), "");
                currentRow.AddClass("HeartsRow");
                var firstChild = GetCachedPanel("mcHeartsContainer").GetChild(0);
                if (firstChild && firstChild !== currentRow) GetCachedPanel("mcHeartsContainer").MoveChildBefore(currentRow, firstChild);
                rowPanels.push(currentRow);
                heartsInCurrentRow = 0;
            }
        }
        for (var i = 0; i < heartsNeeded; i += 1) {
            ensureRow();
            var slot = $.CreatePanel("Panel", currentRow, "");
            slot.AddClass("HeartSlot");
            var containerImg = $.CreatePanel("Image", slot, "");
            containerImg.AddClass("HeartContainer");
            containerImg.SetImage("s2r://panorama/images/minecraft/container_8x_png.vtex");
            var healingImg = $.CreatePanel("Image", slot, "");
            healingImg.AddClass("HeartHealing");
            healingImg.style.visibility = "collapse";
            var frozenImg = $.CreatePanel("Image", slot, "");
            frozenImg.AddClass("HeartDeferred");
            frozenImg.style.visibility = "collapse";
            var fillImg = $.CreatePanel("Image", slot, "");
            fillImg.AddClass("HeartFill");
            fillImg.style.visibility = "collapse";
            State.mcHeartSlots.push(slot);
            State.mcHeartContainerImages.push(containerImg);
            State.mcHeartHealingImages.push(healingImg);
            State.mcHeartDeferredImages.push(frozenImg);
            State.mcHeartFillImages.push(fillImg);
            heartsInCurrentRow += 1;
        }
        State.mcHeartsRowCount = rowPanels.length;
        if (rowPanels.length > MC_MAX_HEART_ROWS) {
            var marginTop = ((MC_MAX_HEART_ROWS * MC_HEART_ROW_HEIGHT_PX) / rowPanels.length) - MC_HEART_ROW_HEIGHT_PX;
            for (var j = 0; j < rowPanels.length - 1; j += 1) rowPanels[j].style.marginTop = marginTop + "px";
        }
        return true;
    }

    function McEnsureBarrierHeartsCapacity(hudRoot, heartsNeeded) {
        if (heartsNeeded <= 0) return false;
        if (!GetCachedPanel("mcBarrierHeartsContainer")) {
            SetCachedPanel("mcBarrierHeartsContainer", hudRoot.FindChildTraverse ? (hudRoot.FindChildTraverse("MinecraftShieldHeartsContainer") || null) : null);
            if (!GetCachedPanel("mcBarrierHeartsContainer")) {
                $.Msg("[QOLLock][MC] MinecraftBarrierHeartsContainer not found");
                return false;
            }
        }
        if (!GetCachedPanel("mcBarrierHearts")) {
            SetCachedPanel("mcBarrierHearts", hudRoot.FindChildTraverse ? (hudRoot.FindChildTraverse("MinecraftShieldHearts") || null) : null);
            if (!GetCachedPanel("mcBarrierHearts")) {
                $.Msg("[QOLLock][MC] MinecraftBarrierHearts not found");
                return false;
            }
        }
        if (State.mcBarrierHeartsCapacity === heartsNeeded && State.mcBarrierHeartsPanels.length === State.mcBarrierHeartsCapacity) return true;
        GetCachedPanel("mcBarrierHearts").RemoveAndDeleteChildren();
        State.mcBarrierHeartsPanels = [];
        State.mcBarrierHeartContainerImages = [];
        State.mcBarrierHeartFillImages = [];
        State.mcBarrierHeartsCapacity = heartsNeeded;
        var currentRow = null;
        var heartsInCurrentRow = 0;
        function ensureRow() {
            if (currentRow === null || heartsInCurrentRow >= MC_HEARTS_PER_ROW) {
                currentRow = $.CreatePanel("Panel", GetCachedPanel("mcBarrierHearts"), "");
                currentRow.AddClass("HeartsRow");
                var firstChild = GetCachedPanel("mcBarrierHearts").GetChild(0);
                if (firstChild && firstChild !== currentRow) GetCachedPanel("mcBarrierHearts").MoveChildBefore(currentRow, firstChild);
                heartsInCurrentRow = 0;
            }
        }
        for (var i = 0; i < heartsNeeded; i += 1) {
            ensureRow();
            var slot = $.CreatePanel("Panel", currentRow, "");
            slot.AddClass("HeartSlot");
            var containerImg = $.CreatePanel("Image", slot, "");
            containerImg.AddClass("HeartContainer");
            containerImg.SetImage("s2r://panorama/images/minecraft/container_8x_png.vtex");
            var fillImg = $.CreatePanel("Image", slot, "");
            fillImg.AddClass("HeartFill");
            fillImg.style.visibility = "collapse";
            State.mcBarrierHeartsPanels.push(slot);
            State.mcBarrierHeartContainerImages.push(containerImg);
            State.mcBarrierHeartFillImages.push(fillImg);
            heartsInCurrentRow += 1;
        }
        return true;
    }

    function McUpdateHearts(trueHp, totalHp, afflicted) {
        try {
            var hudRoot = GetCachedPanel("mcHudRoot");
            if (!hudRoot) return;
            var isBlinkOn = State.mcHeartsBlinking && (State.mcHeartsBlinkPhase % 2 === 0);
            var totalHalfSegments = Math.max(0, Math.ceil(totalHp / MC_HP_PER_HALF_SEGMENT));
            var heartsNeeded = Math.max(1, Math.ceil(totalHalfSegments / 2));
            var currentHalfSegments = Math.ceil(trueHp / MC_HP_PER_HALF_SEGMENT);
            if (currentHalfSegments < 0) currentHalfSegments = 0;
            if (currentHalfSegments > totalHalfSegments) currentHalfSegments = totalHalfSegments;
            var fullHearts = Math.floor(currentHalfSegments / 2);
            var hasHalfHeart = (currentHalfSegments % 2) === 1;
            if (!McEnsureHeartsCapacity(hudRoot, heartsNeeded)) return;
            var lastSlotIsHalf = (totalHalfSegments % 2) === 1;
            if (isBlinkOn !== State.mcLastIsBlinkOn || heartsNeeded !== State.mcLastContainerHeartsNeeded || lastSlotIsHalf !== State.mcLastContainerLastSlotIsHalf) {
                State.mcLastIsBlinkOn = isBlinkOn;
                State.mcLastContainerHeartsNeeded = heartsNeeded;
                State.mcLastContainerLastSlotIsHalf = lastSlotIsHalf;
                for (var i = 0; i < State.mcHeartSlots.length; i += 1) {
                    var slot = State.mcHeartSlots[i];
                    var container = State.mcHeartContainerImages[i];
                    if (i >= heartsNeeded) { slot.style.visibility = "collapse"; continue; }
                    slot.style.visibility = "visible";
                    var isLastSlot = lastSlotIsHalf && (i === heartsNeeded - 1);
                    if (isLastSlot) container.SetImage(isBlinkOn ? "s2r://panorama/images/minecraft/container_blinking_half_8x_png.vtex" : "s2r://panorama/images/minecraft/container_half_8x_png.vtex");
                    else container.SetImage(isBlinkOn ? "s2r://panorama/images/minecraft/container_blinking_8x_png.vtex" : "s2r://panorama/images/minecraft/container_8x_png.vtex");
                }
            }
            if (fullHearts !== State.mcLastFillFullHearts || hasHalfHeart !== State.mcLastFillHasHalf || afflicted !== State.mcLastFillAfflicted) {
                State.mcLastFillFullHearts = fullHearts;
                State.mcLastFillHasHalf = hasHalfHeart;
                State.mcLastFillAfflicted = afflicted;
                var texturePrefix = afflicted ? "poisoned_" : "";
                for (var i = 0; i < State.mcHeartFillImages.length; i += 1) {
                    var fill = State.mcHeartFillImages[i];
                    fill.RemoveClass("full"); fill.RemoveClass("half"); fill.RemoveClass("empty");
                    if (i < fullHearts) {
                        fill.AddClass("full"); fill.style.visibility = "visible";
                        fill.SetImage("s2r://panorama/images/minecraft/" + texturePrefix + "full_8x_png.vtex");
                    } else if (i === fullHearts && hasHalfHeart) {
                        fill.AddClass("half"); fill.style.visibility = "visible";
                        fill.SetImage("s2r://panorama/images/minecraft/" + texturePrefix + "half_8x_png.vtex");
                    } else {
                        fill.AddClass("empty"); fill.style.visibility = "collapse";
                    }
                }
            }
            State.mcLastVisibleHeartsCount = heartsNeeded;
        } catch (error) { $.Msg("[QOLLock][MC] Error in McUpdateHearts: " + error); }
    }

    function McUpdateDeferredHearts(trueHp, deferredDamage, totalHp) {
        try {
            if (State.mcHeartDeferredImages.length === 0) return;
            var totalHalfSegments = Math.max(0, Math.ceil(totalHp / MC_HP_PER_HALF_SEGMENT));
            var trueHalfSegs = Math.ceil(trueHp / MC_HP_PER_HALF_SEGMENT);
            var deferredHalfSegs = deferredDamage > 0 ? Math.ceil(deferredDamage / MC_HP_PER_HALF_SEGMENT) : 0;
            var orangeHalfSegments = trueHalfSegs + deferredHalfSegs;
            if (orangeHalfSegments < 0) orangeHalfSegments = 0;
            if (orangeHalfSegments > totalHalfSegments) orangeHalfSegments = totalHalfSegments;
            var fullHearts = Math.floor(orangeHalfSegments / 2);
            var hasHalfHeart = (orangeHalfSegments % 2) === 1;
            var fillFullSlots = Math.floor(Math.ceil(trueHp / MC_HP_PER_HALF_SEGMENT) / 2);
            if (fullHearts === State.mcLastDeferredFullHearts && hasHalfHeart === State.mcLastDeferredHasHalf && fillFullSlots === State.mcLastDeferredStartSlots) return;
            State.mcLastDeferredFullHearts = fullHearts;
            State.mcLastDeferredHasHalf = hasHalfHeart;
            State.mcLastDeferredStartSlots = fillFullSlots;
            for (var i = 0; i < State.mcHeartDeferredImages.length; i += 1) {
                var deferred = State.mcHeartDeferredImages[i];
                if (i < fillFullSlots) { deferred.style.visibility = "collapse"; continue; }
                deferred.RemoveClass("full"); deferred.RemoveClass("half"); deferred.RemoveClass("empty");
                if (i < fullHearts) {
                    deferred.AddClass("full"); deferred.style.visibility = "visible";
                    deferred.SetImage("s2r://panorama/images/minecraft/orange_full_8x_png.vtex");
                } else if (i === fullHearts && hasHalfHeart) {
                    deferred.AddClass("half"); deferred.style.visibility = "visible";
                    deferred.SetImage("s2r://panorama/images/minecraft/orange_half_8x_png.vtex");
                } else {
                    deferred.AddClass("empty"); deferred.style.visibility = "collapse";
                }
            }
        } catch (error) { $.Msg("[QOLLock][MC] Error in McUpdateDeferredHearts: " + error); }
    }

    function McUpdateHealingHearts(currentHp, healingHp, totalHp) {
        try {
            if (State.mcHeartHealingImages.length === 0) return;
            var totalHalfSegments = Math.max(0, Math.ceil(totalHp / MC_HP_PER_HALF_SEGMENT));
            var healingHalfSegments = Math.ceil(healingHp / MC_HP_PER_HALF_SEGMENT);
            if (healingHalfSegments < 0) healingHalfSegments = 0;
            if (healingHalfSegments > totalHalfSegments) healingHalfSegments = totalHalfSegments;
            var fullHearts = Math.floor(healingHalfSegments / 2);
            var hasHalfHeart = (healingHalfSegments % 2) === 1;
            var healingStartSlots = Math.floor(Math.ceil(currentHp / MC_HP_PER_HALF_SEGMENT) / 2);
            if (fullHearts === State.mcLastHealingFullHearts && hasHalfHeart === State.mcLastHealingHasHalf && healingStartSlots === State.mcLastHealingStartSlots) return;
            State.mcLastHealingFullHearts = fullHearts;
            State.mcLastHealingHasHalf = hasHalfHeart;
            State.mcLastHealingStartSlots = healingStartSlots;
            for (var i = 0; i < State.mcHeartHealingImages.length; i += 1) {
                var healing = State.mcHeartHealingImages[i];
                if (i < healingStartSlots) { healing.style.visibility = "collapse"; continue; }
                healing.RemoveClass("full"); healing.RemoveClass("half"); healing.RemoveClass("empty");
                if (i < fullHearts) {
                    healing.AddClass("full"); healing.style.visibility = "visible";
                    healing.SetImage("s2r://panorama/images/minecraft/green_full_8x_png.vtex");
                } else if (i === fullHearts && hasHalfHeart) {
                    healing.AddClass("half"); healing.style.visibility = "visible";
                    healing.SetImage("s2r://panorama/images/minecraft/green_half_8x_png.vtex");
                } else {
                    healing.AddClass("empty"); healing.style.visibility = "collapse";
                }
            }
        } catch (error) { $.Msg("[QOLLock][MC] Error in McUpdateHealingHearts: " + error); }
    }

    function McUpdateBarrierHearts(currentBarrier, totalBarrier, hasBarrier) {
        try {
            var hudRoot = GetCachedPanel("mcHudRoot");
            if (!hudRoot) return;
            if (!hasBarrier) {
                if (GetCachedPanel("mcBarrierHeartsContainer")) GetCachedPanel("mcBarrierHeartsContainer").style.visibility = "collapse";
                State.mcLastBarrierFullHearts = -1;
                State.mcLastBarrierHasHalf = null;
                State.mcLastBarrierLastSlotIsHalf = null;
                return;
            }
            var totalHalfSegments = Math.ceil(totalBarrier / MC_HP_PER_HALF_SEGMENT);
            var heartsNeeded = Math.ceil(totalHalfSegments / 2);
            if (!McEnsureBarrierHeartsCapacity(hudRoot, heartsNeeded)) return;
            GetCachedPanel("mcBarrierHeartsContainer").style.visibility = "visible";
            var lastSlotIsHalf = (totalHalfSegments % 2) === 1;
            var currentHalfSegments = Math.ceil(currentBarrier / MC_HP_PER_HALF_SEGMENT);
            var fullHearts = Math.floor(currentHalfSegments / 2);
            var hasHalfHeart = (currentHalfSegments % 2) === 1;
            if (fullHearts === State.mcLastBarrierFullHearts && hasHalfHeart === State.mcLastBarrierHasHalf && lastSlotIsHalf === State.mcLastBarrierLastSlotIsHalf) return;
            State.mcLastBarrierFullHearts = fullHearts;
            State.mcLastBarrierHasHalf = hasHalfHeart;
            State.mcLastBarrierLastSlotIsHalf = lastSlotIsHalf;
            for (var i = 0; i < State.mcBarrierHeartsPanels.length; i += 1) {
                var container = State.mcBarrierHeartContainerImages[i];
                var fill = State.mcBarrierHeartFillImages[i];
                var isLastSlot = lastSlotIsHalf && (i === heartsNeeded - 1);
                container.SetImage(isLastSlot ? "s2r://panorama/images/minecraft/container_half_8x_png.vtex" : "s2r://panorama/images/minecraft/container_8x_png.vtex");
                fill.RemoveClass("full"); fill.RemoveClass("half"); fill.RemoveClass("empty");
                if (i < fullHearts) {
                    fill.AddClass("full"); fill.style.visibility = "visible";
                    fill.SetImage("s2r://panorama/images/minecraft/absorption_full_8x_png.vtex");
                } else if (i === fullHearts && hasHalfHeart) {
                    fill.AddClass("half"); fill.style.visibility = "visible";
                    fill.SetImage("s2r://panorama/images/minecraft/absorption_half_8x_png.vtex");
                } else {
                    fill.AddClass("empty"); fill.style.visibility = "collapse";
                }
            }
        } catch (error) { $.Msg("[QOLLock][MC] Error in McUpdateBarrierHearts: " + error); }
    }

    function McParseDeferredDamage(hudRoot) {
        try {
            var damageBar = hudRoot.FindChildTraverse ? hudRoot.FindChildTraverse("pending_incoming_damage_Middle") : null;
            if (!damageBar) return 0;
            var heightStr = damageBar.style && damageBar.style.height ? damageBar.style.height.toString() : "";
            var heightValue = parseFloat(heightStr) || 0;
            return heightValue / MC_HEALTH_BAR_PIXEL_HEIGHT * MC_HEALTH_BAR_SCALE;
        } catch (e) { $.Msg("[QOLLock][MC] Error in McParseDeferredDamage: " + e); return 0; }
    }

    function McParseIncomingHeal(hudRoot) {
        try {
            var healBar = hudRoot.FindChildTraverse ? hudRoot.FindChildTraverse("pending_incoming_heal_Middle") : null;
            if (!healBar) return 0;
            var heightStr = healBar.style && healBar.style.height ? healBar.style.height.toString() : "";
            var heightValue = parseFloat(heightStr) || 0;
            return (heightValue / MC_HEALTH_BAR_PIXEL_HEIGHT) * MC_HEALTH_BAR_SCALE;
        } catch (e) { $.Msg("[QOLLock][MC] Error in McParseIncomingHeal: " + e); return 0; }
    }

    function McReadHealthValues(hudRoot) {
        if (!GetCachedPanel("mcHealthContainer")) {
            var hc = hudRoot.FindChildTraverse ? hudRoot.FindChildTraverse("healthContainer") : null;
            if (!hc) {
                var all = hudRoot.FindChildrenWithClassTraverse ? hudRoot.FindChildrenWithClassTraverse("healthContainer") : null;
                if (all && all.length > 0) hc = all[0];
            }
            if (!hc) {
                if (!State.mcLoggedHealthContainerMiss) { $.Msg("[QOLLock][MC] Health container panel not found"); State.mcLoggedHealthContainerMiss = true; }
                return null;
            }
            State.mcLoggedHealthContainerMiss = false;
            SetCachedPanel("mcHealthContainer", hc);
        }
        if (!GetCachedPanel("mcCurrentHealthLabel")) {
            var hcPanel = GetCachedPanel("mcHealthContainer");
            var lbl = hcPanel.FindChildTraverse ? hcPanel.FindChildTraverse("currentHealthLabel") : null;
            if (!lbl) { var lbls = hcPanel.FindChildrenWithClassTraverse ? hcPanel.FindChildrenWithClassTraverse("currentHealthLabel") : null; if (lbls && lbls.length > 0) lbl = lbls[0]; }
            if (!lbl) return null;
            SetCachedPanel("mcCurrentHealthLabel", lbl);
        }
        if (!GetCachedPanel("mcTotalHealthLabel")) {
            var hcPanel = GetCachedPanel("mcHealthContainer");
            var lbl = hcPanel.FindChildTraverse ? hcPanel.FindChildTraverse("totalHealthLabel") : null;
            if (!lbl) { var lbls = hcPanel.FindChildrenWithClassTraverse ? hcPanel.FindChildrenWithClassTraverse("totalHealthLabel") : null; if (lbls && lbls.length > 0) lbl = lbls[0]; }
            if (!lbl) return null;
            SetCachedPanel("mcTotalHealthLabel", lbl);
        }
        var currentHealth = parseInt(GetCachedPanel("mcCurrentHealthLabel").text.replace(/[^0-9]/g, "")) || 0;
        var totalHealth = parseInt(GetCachedPanel("mcTotalHealthLabel").text.replace(/[^0-9]/g, "")) || 0;
        return { currentHealth: currentHealth, totalHealth: totalHealth };
    }

    function McComputeHealthState(currentHealth, totalHealth, hudRoot) {
        var deferredFraction = McParseDeferredDamage(hudRoot);
        var deferredDamage = Math.round(deferredFraction * totalHealth);
        var trueCurrentHealth = Math.max(0, currentHealth - deferredDamage);
        var incomingHealFraction = McParseIncomingHeal(hudRoot);
        var incomingHealAmount = Math.round(incomingHealFraction * totalHealth);
        var healingHealth = Math.min(totalHealth, currentHealth + incomingHealAmount);
        var currentHalfSegments = Math.ceil(trueCurrentHealth / MC_HP_PER_HALF_SEGMENT);
        var effectiveHalfSegments = Math.ceil(currentHealth / MC_HP_PER_HALF_SEGMENT);
        var hasIncomingHeal = incomingHealAmount > 0;
        return { deferredDamage: deferredDamage, trueCurrentHealth: trueCurrentHealth, healingHealth: healingHealth, currentHalfSegments: currentHalfSegments, effectiveHalfSegments: effectiveHalfSegments, hasIncomingHeal: hasIncomingHeal };
    }

    function McParseChargesForHunger(root) {
        try {
            if (!GetCachedPanel("mcChargesContainer")) {
                SetCachedPanel("mcChargesContainer", root && root.FindChildTraverse ? (root.FindChildTraverse("charges_container") || null) : null);
            }
            if (!GetCachedPanel("mcChargesContainer")) return null;
            var allCharges = GetCachedPanel("mcChargesContainer").FindChildrenWithClassTraverse ? GetCachedPanel("mcChargesContainer").FindChildrenWithClassTraverse("charge") : null;
            if (!allCharges || allCharges.length === 0) return null;
            var maxCharges = 0;
            var activeCharges = [];
            for (var i = 0; i < allCharges.length; i += 1) {
                if (allCharges[i].BHasClass("has_charge")) { maxCharges += 1; activeCharges.push(allCharges[i]); }
            }
            if (maxCharges === 0) return null;
            var maxAngle = MC_CHARGE_MAX_ANGLES[maxCharges] || 26;
            var totalChargeValue = 0;
            for (var i = 0; i < activeCharges.length; i += 1) {
                var charge = activeCharges[i];
                var chargeFgElements = charge.FindChildrenWithClassTraverse ? charge.FindChildrenWithClassTraverse("charge_fg") : null;
                if (!chargeFgElements || chargeFgElements.length === 0) continue;
                var chargeFg = chargeFgElements[0];
                if (chargeFg.BHasClass("finished")) {
                    totalChargeValue += 1.0;
                } else {
                    var clipStyle = chargeFg.style && chargeFg.style.clip ? chargeFg.style.clip.toString() : "";
                    var match = clipStyle.match(/radial\([^,]+,[^,]+,\s*([\d.]+)deg\s*\)/);
                    if (match) totalChargeValue += Math.min(parseFloat(match[1]) / maxAngle, 1.0);
                }
            }
            return { percent: Math.round((totalChargeValue / maxCharges) * 100), chargesFilled: totalChargeValue, maxCharges: maxCharges };
        } catch (e) { $.Msg("[QOLLock][MC] Error in McParseChargesForHunger: " + e); return null; }
    }

    function McUpdateFood(percent) {
        try {
            var hudRoot = GetCachedPanel("mcHudRoot");
            if (!hudRoot) return;
            if (!GetCachedPanel("mcFoodContainer")) {
                SetCachedPanel("mcFoodContainer", hudRoot.FindChildTraverse ? (hudRoot.FindChildTraverse("MinecraftFoodContainer") || null) : null);
                if (!GetCachedPanel("mcFoodContainer")) { $.Msg("[QOLLock][MC] MinecraftFoodContainer not found"); return; }
                var children = GetCachedPanel("mcFoodContainer").Children();
                State.mcCachedFoodIcons = [];
                for (var i = 0; i < children.length; i += 1) { if (children[i].BHasClass("FoodIcon")) State.mcCachedFoodIcons.push(children[i]); }
            }
            if (State.mcCachedFoodIcons.length === 0) return;
            if (percent < 0) percent = 0;
            if (percent > 100) percent = 100;
            var totalHalfSegments = Math.round(percent / MC_FOOD_PERCENT_PER_HALF);
            var fullIcons = Math.floor(totalHalfSegments / 2);
            var hasHalfIcon = (totalHalfSegments % 2) === 1;
            var iconCount = State.mcCachedFoodIcons.length;
            for (var i = 0; i < iconCount; i += 1) {
                var reverseIndex = iconCount - 1 - i;
                if (reverseIndex < fullIcons) State.mcCachedFoodIcons[i].SetImage("s2r://panorama/images/minecraft/food_8x_png.vtex");
                else if (reverseIndex === fullIcons && hasHalfIcon) State.mcCachedFoodIcons[i].SetImage("s2r://panorama/images/minecraft/food_half_8x_png.vtex");
                else State.mcCachedFoodIcons[i].SetImage("s2r://panorama/images/minecraft/food_empty_8x_png.vtex");
            }
        } catch (e) { $.Msg("[QOLLock][MC] Error in McUpdateFood: " + e); }
    }

    function McParseSoulsAndLevel(root) {
        try {
            if (!GetCachedPanel("mcGoldApContainer")) {
                var panel = root && root.FindChildTraverse ? (root.FindChildTraverse(PANEL_ID_GOLD_AP_CONTAINER) || null) : null;
                if (!panel) {
                    if (!State.mcLoggedGoldApMiss) { $.Msg("[QOLLock][MC] gold_and_ap_container not found"); State.mcLoggedGoldApMiss = true; }
                    return;
                }
                State.mcLoggedGoldApMiss = false;
                SetCachedPanel("mcGoldApContainer", panel);
            }
            if (!GetCachedPanel("mcSoulsFill")) SetCachedPanel("mcSoulsFill", GetCachedPanel("mcGoldApContainer").FindChildTraverse ? (GetCachedPanel("mcGoldApContainer").FindChildTraverse("SoulsFill") || null) : null);
            if (GetCachedPanel("mcSoulsFill")) {
                var heightStr = GetCachedPanel("mcSoulsFill").style && GetCachedPanel("mcSoulsFill").style.height ? GetCachedPanel("mcSoulsFill").style.height.toString() : "";
                var heightValue = parseFloat(heightStr) || 0;
                if (heightValue <= 0) {
                    var actualHeight = Number(GetCachedPanel("mcSoulsFill").actuallayoutheight);
                    if (isFinite(actualHeight) && actualHeight > 0) heightValue = actualHeight;
                }
                var percent = MC_SOULS_BAR_MAX_HEIGHT_PX > 0 ? Math.round((heightValue / MC_SOULS_BAR_MAX_HEIGHT_PX) * 100) : 0;
                if (percent < 0) percent = 0; else if (percent > 100) percent = 100;
                if (!GetCachedPanel("mcXpBarFill")) SetCachedPanel("mcXpBarFill", root && root.FindChildTraverse ? (root.FindChildTraverse("MinecraftXPBarFill") || null) : null);
                if (GetCachedPanel("mcXpBarFill") && GetCachedPanel("mcXpBarFill").style) GetCachedPanel("mcXpBarFill").style.clip = "rect( 0px, " + percent + "%, 100%, 0px )";
            }
            if (!GetCachedPanel("mcPlayerLevelLabel")) SetCachedPanel("mcPlayerLevelLabel", GetCachedPanel("mcGoldApContainer").FindChildTraverse ? (GetCachedPanel("mcGoldApContainer").FindChildTraverse("PlayerLevelNumber") || null) : null);
            if (GetCachedPanel("mcPlayerLevelLabel")) {
                var levelValue = parseInt((GetCachedPanel("mcPlayerLevelLabel").text || "").replace(/[^0-9]/g, "")) || 0;
                if (!GetCachedPanel("mcXpLevelLabel")) SetCachedPanel("mcXpLevelLabel", root && root.FindChildTraverse ? (root.FindChildTraverse("MinecraftXPLevelLabel") || null) : null);
                if (GetCachedPanel("mcXpLevelLabel")) GetCachedPanel("mcXpLevelLabel").text = levelValue.toString();
            }
        } catch (error) { $.Msg("[QOLLock][MC] Error in McParseSoulsAndLevel: " + error); }
    }

    function McUpdateAnimationState(currentHalfSegments, effectiveHalfSegments, hasIncomingHeal) {
        if (State.mcLastBlinkHalfSegments !== null && effectiveHalfSegments !== State.mcLastBlinkHalfSegments) McStartHeartsBlink();
        State.mcLastBlinkHalfSegments = effectiveHalfSegments;
        var isLowHealth = currentHalfSegments <= MC_LOW_HEALTH_HALF_SEGMENTS;
        McSetLowHealthJiggleEnabled(isLowHealth);
        McSetHealingWaveEnabled(!isLowHealth && hasIncomingHeal);
    }

    function McUpdateTotem() {
        if (!GetCachedPanel("mcTotemContainer")) return;
        var hasRejuvenator = GetCachedPanel("mcHudHealthBars") ? GetCachedPanel("mcHudHealthBars").BHasClass("HasRejuvenator") : false;
        GetCachedPanel("mcTotemContainer").style.visibility = hasRejuvenator ? "visible" : "collapse";
    }

    function McUpdateBulletBarrier(hudRoot) {
        var hasBarrier = false;
        var bulletBarrierCurrent = 0;
        var bulletBarrierMax = 0;
        if (GetCachedPanel("mcBarriersContainer")) hasBarrier = GetCachedPanel("mcBarriersContainer").BHasClass("HasBulletShield");
        if (hasBarrier) {
            if (!GetCachedPanel("mcBulletBarrierNumbers")) SetCachedPanel("mcBulletBarrierNumbers", hudRoot.FindChildTraverse ? (hudRoot.FindChildTraverse("BulletShieldNumbers") || null) : null);
            if (GetCachedPanel("mcBulletBarrierNumbers")) {
                if (!GetCachedPanel("mcBulletBarrierCurrentLabel")) {
                    var lbls = GetCachedPanel("mcBulletBarrierNumbers").FindChildrenWithClassTraverse ? GetCachedPanel("mcBulletBarrierNumbers").FindChildrenWithClassTraverse("progress_bar_current") : null;
                    if (lbls && lbls.length > 0) SetCachedPanel("mcBulletBarrierCurrentLabel", lbls[0]);
                }
                if (!GetCachedPanel("mcBulletBarrierMaxLabel")) {
                    var lbls = GetCachedPanel("mcBulletBarrierNumbers").FindChildrenWithClassTraverse ? GetCachedPanel("mcBulletBarrierNumbers").FindChildrenWithClassTraverse("progress_bar_max") : null;
                    if (lbls && lbls.length > 0) SetCachedPanel("mcBulletBarrierMaxLabel", lbls[0]);
                }
                if (GetCachedPanel("mcBulletBarrierCurrentLabel")) bulletBarrierCurrent = parseInt(GetCachedPanel("mcBulletBarrierCurrentLabel").text.replace(/[^0-9]/g, "")) || 0;
                if (GetCachedPanel("mcBulletBarrierMaxLabel")) bulletBarrierMax = parseInt(GetCachedPanel("mcBulletBarrierMaxLabel").text.replace(/[^0-9]/g, "")) || 0;
                McUpdateBarrierHearts(bulletBarrierCurrent, bulletBarrierMax, true);
            } else {
                if (!State.mcLoggedBulletBarrierMiss) { $.Msg("[QOLLock][MC] BulletBarrierNumbers panel not found"); State.mcLoggedBulletBarrierMiss = true; }
                McUpdateBarrierHearts(0, 0, false);
            }
        } else {
            McUpdateBarrierHearts(0, 0, false);
        }
        return { hasBarrier: hasBarrier, bulletBarrierCurrent: bulletBarrierCurrent, bulletBarrierMax: bulletBarrierMax };
    }

    function UpdateMinecraftHealthbar(root, cfg, nowMs, enabled) {
        if (!enabled) {
            if (State.mcWasEnabled) McResetRuntime();
            return;
        }
        var nowMsNum = Number(nowMs) || 0;
        if (nowMsNum < (Number(State.mcNextUpdateMs) || 0)) return;

        var hudRoot = McResolveHudRoot(root);
        if (!hudRoot) { State.mcNextUpdateMs = nowMsNum + 400; return; }

        State.mcNextUpdateMs = nowMsNum + MC_TICK_INTERVAL_MS;

        if (!GetCachedPanel("mcHudHealthBars")) SetCachedPanel("mcHudHealthBars", hudRoot.FindChildTraverse ? (hudRoot.FindChildTraverse("hud_health_bars") || null) : null);
        if (!GetCachedPanel("mcTotemContainer")) SetCachedPanel("mcTotemContainer", hudRoot.FindChildTraverse ? (hudRoot.FindChildTraverse("MinecraftTotemContainer") || null) : null);
        if (!GetCachedPanel("mcBarriersContainer")) {
            SetCachedPanel("mcBarriersContainer", hudRoot.FindChildTraverse ? (hudRoot.FindChildTraverse("HudShieldsContainer") || null) : null);
            if (!GetCachedPanel("mcBarriersContainer")) $.Msg("[QOLLock][MC] HudBarriersContainer not found");
        }

        var hv = McReadHealthValues(hudRoot);
        if (!hv) return;
        var currentHealth = hv.currentHealth;
        var totalHealth = hv.totalHealth;

        if (!GetCachedPanel("mcHealthPercentLabel")) {
            SetCachedPanel("mcHealthPercentLabel", hudRoot.FindChildTraverse ? (hudRoot.FindChildTraverse("MinecraftHealthPercent") || null) : null);
        }
        var mcPercentLabel = GetCachedPanel("mcHealthPercentLabel");
        if (IsPanelValid(mcPercentLabel) && totalHealth > 0) {
            var mcPercent = (currentHealth / totalHealth) * 100;
            if (!isFinite(mcPercent)) mcPercent = 0;
            if (mcPercent < 0) mcPercent = 0;
            mcPercentLabel.text = "  [" + String(Math.floor(mcPercent)) + "%]";
        }

        var hs = McComputeHealthState(currentHealth, totalHealth, hudRoot);

        McUpdateAnimationState(hs.currentHalfSegments, hs.effectiveHalfSegments, hs.hasIncomingHeal);

        var nowMsForMod = Date.now();
        if (nowMsForMod >= (Number(State.mcCheckModifierNextMs) || 0)) {
            State.mcLastModifierResult = McCheckModifierActive(root, "AFFLICTED");
            State.mcCheckModifierNextMs = nowMsForMod + MC_MODIFIER_THROTTLE_MS;
        }
        State.mcIsAfflicted = State.mcLastModifierResult;

        McUpdateHearts(hs.trueCurrentHealth, totalHealth, State.mcIsAfflicted);
        McUpdateHealingHearts(currentHealth, hs.healingHealth, totalHealth);
        McUpdateDeferredHearts(hs.trueCurrentHealth, hs.deferredDamage, totalHealth);
        McUpdateTotem();
        McUpdateBulletBarrier(hudRoot);
        McParseSoulsAndLevel(root);
        var hungerData = McParseChargesForHunger(root);
        if (hungerData !== null) McUpdateFood(hungerData.percent);

        State.mcWasEnabled = true;
    }

    // ── FG healthbar ──

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

    // ── Dispatcher ──

    function UpdateHealthbarRuntimeHelpers(root, cfg, nowMsLoop, healthbarType, minimalistHealthbarEnabled, fgHealthbarEnabled) {
        var shouldRunMinimalistRuntime =
            minimalistHealthbarEnabled ||
            HasNonDefaultPlayerHealthbarRuntimeConfig(cfg) ||
            !!(State.playerHealthbarAccentColorSig && String(State.playerHealthbarAccentColorSig).length > 0) ||
            State.minimalistHealthbarOffsetApplied ||
            State.playerHealthbarScaleOpacityRuntimeApplied;
        if (shouldRunMinimalistRuntime) {
            UpdateMinimalistHealthbarOffsets(root, cfg, minimalistHealthbarEnabled);
        }

        var shouldRunBudhudRuntime = (Number(healthbarType) === 4) || State.budhudWasEnabled;
        if (shouldRunBudhudRuntime) {
            UpdateBudhudHealthbar(root, cfg, healthbarType, nowMsLoop);
        }

        var shouldRunMinecraftRuntime = (Number(healthbarType) === HEALTHBAR_TYPE_MINECRAFT) || State.mcWasEnabled;
        if (shouldRunMinecraftRuntime) {
            UpdateMinecraftHealthbar(root, cfg, nowMsLoop, (Number(healthbarType) === HEALTHBAR_TYPE_MINECRAFT));
        }
    }

    // ── Publish bridge functions for coreRoot access ──
    try {
        QOL.needsHealthbarRuntimeHelperWork = NeedsHealthbarRuntimeHelperWork;
    } catch(e) { $.Msg("[QOLLock][WARN][" + _featureId + "] could not publish needsHealthbarRuntimeHelperWork"); }
    try {
        QOL.updateHealthbarRuntimeHelpers = UpdateHealthbarRuntimeHelpers;
    } catch(e) { $.Msg("[QOLLock][WARN][" + _featureId + "] could not publish updateHealthbarRuntimeHelpers"); }
    try {
        QOL.syncFgHeroImageMotionState = SyncFgHeroImageMotionState;
    } catch(e) { $.Msg("[QOLLock][WARN][" + _featureId + "] could not publish syncFgHeroImageMotionState"); }
    try {
        QOL.resolvePlayerHealthbarAccentColorIndex = ReadPlayerHealthbarAccentColorIndex;
    } catch(e) { $.Msg("[QOLLock][WARN][" + _featureId + "] could not publish resolvePlayerHealthbarAccentColorIndex"); }
    try {
        QOL.applyPlayerHealthbarAccentColor = ApplyPlayerHealthbarAccentColor;
    } catch(e) { $.Msg("[QOLLock][WARN][" + _featureId + "] could not publish applyPlayerHealthbarAccentColor"); }

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
                    "fgHeroImageRuntimeStyleSig", "fgHeroRuntimeLevelPanel",
                    "fgHeroRuntimeHeroPanel", "budhudWasEnabled", "budhudNextUpdateMs",
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
        if (typeof UpdateMinecraftHealthbar !== "function") throw new Error("UpdateMinecraftHealthbar missing");
        if (typeof UpdateBudhudHealthbar !== "function") throw new Error("UpdateBudhudHealthbar missing");
        if (typeof SyncFgHeroImageMotionState !== "function") throw new Error("SyncFgHeroImageMotionState missing");
    } catch(e) {
        $.Msg("[QOLLock][ERROR][" + _featureId + "] self-test: " + (e && e.message ? e.message : String(e)));
    }
})();

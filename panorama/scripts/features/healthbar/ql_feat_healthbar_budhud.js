// ql_feat_healthbar_budhud.js — Budhud healthbar subsystem
// Extracted from ql_feat_healthbar.js, Phase 11 Step 1
(function() {
    'use strict';
    var _featureId = "ql_feat_healthbar_budhud";
    // DEPENDS: state, utils, getCachedPanel, setCachedPanel, isColorWarningEnabled
    var _deps = QOL.import(["state", "utils", "getCachedPanel", "setCachedPanel",
        "isColorWarningEnabled"]);

    var State = _deps.state;
    var Utils = _deps.utils;
    var GetCachedPanel = _deps.getCachedPanel;
    var SetCachedPanel = _deps.setCachedPanel;
    var IsCfgEnabled = Utils.IsCfgEnabled;
    var IsPanelValid = Utils.IsPanelValid;
    var FindFirstPanelByClass = Utils.FindFirstPanelByClass;
    var ToRgbString = Utils.ToRgbString;
    var BlendRgb = Utils.BlendRgb;
    var IsColorWarningEnabled = _deps.isColorWarningEnabled;

    // ── Color constants ──
    var COLORED_HEALTHBAR_LOW_HP_THRESHOLD = 25;
    var COLORED_HEALTHBAR_MID_HP_THRESHOLD = 65;
    var COLORED_HEALTHBAR_HIGH_HP_THRESHOLD = 75;
    var COLORED_HEALTHBAR_PULSE_STEP = 0.1;
    var COLORED_HEALTHBAR_COLOR_RED = [255, 0, 0];
    var COLORED_HEALTHBAR_COLOR_DARK_RED = [222, 0, 0];
    var COLORED_HEALTHBAR_COLOR_ORANGE = [255, 177, 0];
    var COLORED_HEALTHBAR_COLOR_YELLOW = [255, 240, 120];
    var COLORED_HEALTHBAR_COLOR_WHITE = [255, 255, 255];

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
                    $.Msg("[QOLLock][WARN][" + _featureId + "] op failed: " + (eCreate && eCreate.message ? eCreate.message : String(eCreate || "")));
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

    // ── Export ──
    try {
        if (typeof QOL.healthbar !== "object") QOL.healthbar = {};
        QOL.healthbar.budhud = { update: UpdateBudhudHealthbar };
    } catch(e) { $.Msg("[QOLLock][ERROR][" + _featureId + "] could not export QOL.healthbar.budhud: " + (e && e.message ? e.message : String(e))); }

    // ── Self-test ──
    try {
        if (typeof UpdateBudhudHealthbar !== "function") throw new Error("UpdateBudhudHealthbar missing");
    } catch(e) {
        $.Msg("[QOLLock][ERROR][" + _featureId + "] self-test: " + (e && e.message ? e.message : String(e)));
    }
})();

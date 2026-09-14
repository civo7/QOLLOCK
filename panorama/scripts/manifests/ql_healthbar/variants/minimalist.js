// ql_feat_healthbar_minimalist.js — Minimalist healthbar runtime
// Extracted from ql_feat_healthbar.js, Phase 12
(function() {
    'use strict';
    var _featureId = "ql_feat_healthbar_minimalist";
    var Panel = (QOL.core && QOL.core.panel) ? QOL.core.panel : {};
    var State = QOL.state || (typeof globalThis !== "undefined" && globalThis.State) || {};
    var Utils = (typeof QOL_UTILS !== "undefined" ? QOL_UTILS : (QOL.utils || {}));
    var GetCachedPanel = QOL.getCachedPanel || function(k) { return State.cachedPanels ? State.cachedPanels[k] : null; };
    var SetCachedPanel = QOL.setCachedPanel || function(k, p) { if (State.cachedPanels) State.cachedPanels[k] = p; };
    var IsCfgEnabled = Utils.IsCfgEnabled || function(v) { return !!v && v !== "false" && v !== "0"; };
    var IsPanelValid = Panel.isAlive || (Utils.IsPanelValid || function(p) { return p != null && typeof p.IsValid === "function" && p.IsValid(); });

    // ── Constants ──
    var PANEL_ID_HEALTH_CONTAINER = "health_and_abilities_container";

    // Note: These shared helpers remain in ql_feat_healthbar.js but are imported
    // via QOL.healthbar namespace at runtime
    var ResetMinimalistHealthbarOffsetRuntime = QOL.healthbar.resetMinimalistOffsetRuntime;
    var ResetMinimalistHealthbarOffsetRuntimeAll = QOL.healthbar.resetMinimalistOffsetRuntimeAll;
    var BuildPlayerHealthbarRuntimeStyleState = QOL.healthbar.buildPlayerHealthbarStyleState;
    var ApplyPlayerHealthbarRuntimeStyleToPanel = QOL.healthbar.applyPlayerStyleToPanel;
    var ApplyPlayerHealthbarAccentColor = QOL.healthbar.accent.update;
    var ResetPlayerHealthbarAccentColorRuntime = QOL.healthbar.accent.reset;

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
        var accentColor = (cfg && cfg.PLAYER_HEALTHBAR_ACCENT_COLOR !== undefined) ? cfg.PLAYER_HEALTHBAR_ACCENT_COLOR : 0;
        var styleSig = runtimeState.finalOffsetX + "|" + runtimeState.finalOffsetY + "|" + runtimeState.scaleText + "|" + runtimeState.opacityText + "|" + ((enabled && classActive) ? "1" : "0") + "|" + accentColor;

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

    // ── Export ──
    QOL.healthbar = QOL.healthbar || {};
    QOL.healthbar.minimalist = { update: UpdateMinimalistHealthbarOffsets };

    // ── Self-test ──
    try {
        if (typeof UpdateMinimalistHealthbarOffsets !== "function") throw new Error("not defined");
    } catch(e) {
        $.Msg("[QOLLock][ERROR][" + _featureId + "] self-test: " + (e && e.message ? e.message : String(e)));
    }
})();

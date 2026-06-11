"use strict";

(function() {
    var LEGACY_COOLDOWNS_DEBUG = false;
    var lastDebugSignature = null;
    var lastEnabledState = null;
    var cachedSteadyPollSec = 0;
    var FOLLOWUP_POLL_SEC = 0.25;
    var STEADY_POLL_SEC_MIN = 2.40;
    var STEADY_POLL_SEC_MAX = 3.60;

    function LegacyCooldownsEnabled() {
        // GameUI.CustomUIConfig confirmed absent.
        return false;
    }

    function DebugLegacyCooldowns(panel, enabled) {
        if (!LEGACY_COOLDOWNS_DEBUG) return;
        try {
            var panelId = panel && panel.id ? panel.id : "<no-id>";
            var panelType = panel && panel.paneltype ? panel.paneltype : "<no-type>";
            var hasActive = panel && panel.BHasClass ? panel.BHasClass("active") : false;
            var hasLegacy = panel && panel.BHasClass ? panel.BHasClass("legacy_cooldowns_active") : false;
            var signature = [panelType, panelId, enabled ? 1 : 0, hasActive ? 1 : 0, hasLegacy ? 1 : 0].join("|");
            if (signature === lastDebugSignature) return;
            lastDebugSignature = signature;
            $.Msg("[QOLLock][LegacyCooldownsDbg] type=" + panelType + " id=" + panelId + " enabled=" + (enabled ? 1 : 0) + " active=" + (hasActive ? 1 : 0) + " legacy=" + (hasLegacy ? 1 : 0));
        } catch (e) {}
    }

    function HashLegacyCooldownSeed(text) {
        var raw = String(text || "");
        var hash = 0;
        for (var i = 0; i < raw.length; i++) {
            hash = ((hash * 33) + raw.charCodeAt(i)) % 1000003;
        }
        return hash;
    }

    function GetSteadyPollSec(panel) {
        if (cachedSteadyPollSec > 0) return cachedSteadyPollSec;
        var seed = "";
        try {
            seed += panel && panel.paneltype ? String(panel.paneltype) : "";
            seed += "|";
            seed += panel && panel.id ? String(panel.id) : "";
            seed += "|";
            var parent = panel && panel.GetParent ? panel.GetParent() : null;
            seed += parent && parent.id ? String(parent.id) : "";
        } catch (e) {}
        var hash = HashLegacyCooldownSeed(seed);
        var span = STEADY_POLL_SEC_MAX - STEADY_POLL_SEC_MIN;
        if (!(span > 0)) span = 1.0;
        cachedSteadyPollSec = STEADY_POLL_SEC_MIN + ((hash % 1000) / 1000) * span;
        return cachedSteadyPollSec;
    }

    function RefreshLegacyCooldownClass() {
        var panel = $.GetContextPanel();
        if (!panel || !panel.IsValid || !panel.IsValid()) return;
        var enabled = LegacyCooldownsEnabled();
        var changed = (lastEnabledState !== enabled);
        if (changed || !panel.BHasClass || !!panel.BHasClass("legacy_cooldowns_active") !== enabled) {
            panel.SetHasClass("legacy_cooldowns_active", enabled);
            DebugLegacyCooldowns(panel, enabled);
            lastEnabledState = enabled;
        }
        $.Schedule(changed ? FOLLOWUP_POLL_SEC : GetSteadyPollSec(panel), RefreshLegacyCooldownClass);
    }

    RefreshLegacyCooldownClass();
})();

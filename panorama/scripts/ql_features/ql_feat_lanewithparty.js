// ql_feat_lanewithparty.js — Lane with party auto-selector
// Extracted from ql_core.js, Phase 9 Step 2c
(function() {
    'use strict';
    var _dk = "ql_feat_lanewithparty";
    var _deps = QOL.import(["activatePanelSafe","getCachedPanel","isPanelVisibleMaybe","readPanelIdTextMaybe","readPanelTextDeepMaybe","state","setCachedPanel","utils"]);
    var GC = _deps.getCachedPanel;
    var S = _deps.state;
    var SC = _deps.setCachedPanel;
    var U = _deps.utils;
    var IsCfgEnabled = U.IsCfgEnabled;
    var IsPanelValid = U.IsPanelValid;

    function IsLanePreferenceWithPartySelected(selector) {
        if (!selector || !IsPanelValid(selector)) return false;
        var selectedId = "";
        var selectedText = "";
        try {
            var selectedPanel = selector.GetSelected ? selector.GetSelected() : null;
            selectedId = ReadPanelIdTextMaybe(selectedPanel);
            selectedText = String(ReadPanelTextDeepMaybe(selectedPanel, 24) || "");
        } catch (e0) {
            selectedId = "";
            selectedText = "";
        }
        if (selectedId === LANE_PREF_WITH_PARTY_OPTION_ID) return true;
        if (selectedText && selectedText.toLowerCase().indexOf("with party") !== -1) return true;
        return false;
    }

    function FindLanePreferenceWithPartyOption(root, selector) {
        var option = GC("lanePreferenceWithPartyOption");
        if (option) return option;

        option = selector && selector.FindChildTraverse ? selector.FindChildTraverse(LANE_PREF_WITH_PARTY_OPTION_ID) : null;
        if (!option && root && root.FindChildTraverse) option = root.FindChildTraverse(LANE_PREF_WITH_PARTY_OPTION_ID);

        if (!option && selector && selector.FindChildrenWithClassTraverse) {
            var dropDownChildren = selector.FindChildrenWithClassTraverse("DropDownChild") || [];
            for (var i = 0; i < dropDownChildren.length; i++) {
                var child = dropDownChildren[i];
                if (!child || !IsPanelValid(child)) continue;
                var cid = ReadPanelIdTextMaybe(child);
                if (cid === LANE_PREF_WITH_PARTY_OPTION_ID) {
                    option = child;
                    break;
                }
            }
        }

        SC("lanePreferenceWithPartyOption", option);
        return option || null;
    }

    function UpdateLanePreferenceWithParty(root, cfg, nowMs) {
        var enabled = !!(cfg && IsCfgEnabled(cfg, "ENABLE_LANE_WITH_PARTY"));
        if (!enabled) {
            S.laneWithPartyNextApplyMs = 0;
            S.laneWithPartyLastState = "disabled";
            return;
        }

        var now = Number(nowMs) || (Date.now ? Date.now() : (new Date()).getTime());
        if (now < (S.laneWithPartyNextApplyMs || 0)) return;

        if (!root || !root.FindChildTraverse) {
            S.laneWithPartyNextApplyMs = now + LANE_PREF_HIDDEN_INTERVAL_MS;
            return;
        }

        var selector = GC("lanePreferenceSelector");
        if (!selector) {
            selector = root.FindChildTraverse(LANE_PREF_SELECTOR_ID);
            SC("lanePreferenceSelector", selector);
        }
        if (!selector || !IsPanelValid(selector)) {
            SC("lanePreferenceSelector", null);
            SC("lanePreferenceWithPartyOption", null);
            S.laneWithPartyNextApplyMs = now + LANE_PREF_HIDDEN_INTERVAL_MS;
            return;
        }

        if (!IsPanelVisibleMaybe(selector)) {
            S.laneWithPartyLastState = "hidden";
            S.laneWithPartyNextApplyMs = now + LANE_PREF_HIDDEN_INTERVAL_MS;
            return;
        }

        if (IsLanePreferenceWithPartySelected(selector)) {
            S.laneWithPartyLastState = "selected";
            S.laneWithPartyNextApplyMs = now + LANE_PREF_SELECTED_INTERVAL_MS;
            return;
        }

        var setAttempted = false;
        if (selector.SetSelected) {
            try {
                selector.SetSelected(LANE_PREF_WITH_PARTY_OPTION_ID);
                setAttempted = true;
            } catch (e1) {}
        }

        var selectorActivated = ActivatePanelSafe(selector);
        var option = FindLanePreferenceWithPartyOption(root, selector);
        var optionActivated = false;
        if (option && IsPanelValid(option)) {
            var optionId = ReadPanelIdTextMaybe(option) || LANE_PREF_WITH_PARTY_OPTION_ID;
            if (selector.SetSelected) {
                try { selector.SetSelected(optionId); setAttempted = true; } catch (e2) {}
            }
            optionActivated = ActivatePanelSafe(option);
            if (selector.SetSelected) {
                try { selector.SetSelected(optionId); setAttempted = true; } catch (e3) {}
            }
            try { $.DispatchEvent("Activated", selector); } catch (e5) {}
        } else {
            SC("lanePreferenceWithPartyOption", null);
        }

        if (IsLanePreferenceWithPartySelected(selector)) {
            S.laneWithPartyLastApplyMs = now;
            S.laneWithPartyLastState = "applied";
            S.laneWithPartyNextApplyMs = now + LANE_PREF_SELECTED_INTERVAL_MS;
        } else {
            S.laneWithPartyLastState = (selectorActivated || optionActivated || setAttempted) ? "pending_retry" : "option_missing";
            S.laneWithPartyNextApplyMs = now + (option ? LANE_PREF_APPLY_INTERVAL_MS : LANE_PREF_HIDDEN_INTERVAL_MS);
        }
    }

    // ── Registration ──
    QOL.register("laneWithParty", {
        configKeys: ["ENABLE_LANE_WITH_PARTY"],
        bucket: 7, phase: 2,
        gate: function(cfg) {
            return IsCfgEnabled(cfg, "ENABLE_LANE_WITH_PARTY");
        },
        update: function(root, cfg, nowMs, State, hideoutConnected) {
                        try {
                UpdateLanePreferenceWithParty(root, cfg, nowMs);
            } catch(e) {
                $.Msg("[QOLLock][ERROR][" + _dk + "] " + (e && e.message ? e.message : String(e)) + "\n" + (e && e.stack ? String(e.stack) : ""));
                throw e;
            }
        },
        stateKeys: ["laneWithPartyNextApplyMs", "laneWithPartyLastApplyMs",
                    "laneWithPartyLastState"]
    });

    // Self-test: verify update function exists at load time
    try {
        if (typeof UpdateLanePreferenceWithParty !== "function") throw new Error("UpdateLanePreferenceWithParty is not a function");
    } catch(e) {
        $.Msg("[QOLLock][ERROR][" + _dk + "] self-test failed: " + (e && e.message ? e.message : String(e)));
    }

})();

// features/ql_lane_with_party/manifest.js
// =============================================================================
// QOLLOCK — Lane With Party
// =============================================================================
// OWNS:        Auto-select 'With Party' lane preference via dropdown manipulation
// DOES NOT OWN: Lane preference UI (Valve), dropdown panels (Valve)
// DEPENDS ON:  QOL.core.FeatureRegistry, QOL.core.Scheduler
// CONFIG KEYS: ENABLE_LANE_WITH_PARTY
// CSS:         none
// PATTERN:     Polling (0.5Hz). Self-throttling with 3-tier intervals.
//              $.DispatchEvent("Activated") on lane selector.
// CONFIG SRC:  ctx.config.view() (read-only hot path; has enableKey)
// PORTED FROM: features/ql_feat_lanewithparty.js (168 lines)
// =============================================================================

(function() {
    "use strict";
    var FR = QOL.core.FeatureRegistry;
    if (!FR) { $.Msg("[QOLLock] ql_lane_with_party: FeatureRegistry not found — aborting"); return; }

    FR.register({
        id: "ql_lane_with_party",
        enableKey: "ENABLE_LANE_WITH_PARTY",
        enabledByDefault: false,
        settings: [
            { key: "ENABLE_LANE_WITH_PARTY", type: "toggle" }
        ],
        create: function(ctx) {
            var Panel = (QOL.core && QOL.core.panel) ? QOL.core.panel : {};
            var State = QOL.state || (typeof globalThis !== "undefined" && globalThis.State) || {};
            var Utils = QOL.utils;
            var IsCfgEnabled = QOL.utils.IsCfgEnabled;
            var IsPanelValid = QOL.utils.IsPanelValid;
            var GetCachedPanel = QOL.getCachedPanel;
            var SetCachedPanel = QOL.setCachedPanel;
            var ActivatePanelSafe = Panel.activate || QOL.activatePanelSafe;
            var IsPanelVisibleMaybe = Panel.isVisible || QOL.isPanelVisibleMaybe;
            var ReadPanelIdTextMaybe = Panel.readId || QOL.readPanelIdTextMaybe;
            var ReadPanelTextDeepMaybe = Panel.readTextDeep || QOL.readPanelTextDeepMaybe;

            var _loop = null;
            var _root = null;

            // ── Constants (verbatim from old feature) ──
            var LANE_PREF_SELECTOR_ID = "LanePreferenceSelector";
            var LANE_PREF_APPLY_INTERVAL_MS = 650;
            var LANE_PREF_HIDDEN_INTERVAL_MS = 2630;
            var LANE_PREF_SELECTED_INTERVAL_MS = 4870;
            var LANE_PREF_WITH_PARTY_OPTION_ID = "lanepreference_1";

            // ── Helpers (verbatim from old feature) ──
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
                var option = GetCachedPanel("lanePreferenceWithPartyOption");
                if (option) return option;

                option = selector && selector.FindChildTraverse ? selector.FindChildTraverse(LANE_PREF_WITH_PARTY_OPTION_ID) : null;
                if (!option && root && root.FindChildTraverse) option = root.FindChildTraverse(LANE_PREF_WITH_PARTY_OPTION_ID);

                SetCachedPanel("lanePreferenceWithPartyOption", option);
                return option || null;
            }

            // ── Main tick (adapted from UpdateLanePreferenceWithParty) ──
            function _tick() {
                try {
                var root = _root || $.GetContextPanel(); if (root && !_root) _root = root;
                var cfg = ctx.config.view();

                var enabled = !!(cfg && IsCfgEnabled(cfg, "ENABLE_LANE_WITH_PARTY"));
                if (!enabled) {
                    State.laneWithPartyNextApplyMs = 0;
                    State.laneWithPartyLastState = "disabled";
                    return;
                }

                var now = Date.now ? Date.now() : (new Date()).getTime();
                if (now < (State.laneWithPartyNextApplyMs || 0)) return;

                if (!root || !root.FindChildTraverse) {
                    State.laneWithPartyNextApplyMs = now + LANE_PREF_HIDDEN_INTERVAL_MS;
                    return;
                }

                var selector = GetCachedPanel("lanePreferenceSelector");
                if (!selector) {
                    selector = root.FindChildTraverse(LANE_PREF_SELECTOR_ID);
                    SetCachedPanel("lanePreferenceSelector", selector);
                }
                if (!selector || !IsPanelValid(selector)) {
                    SetCachedPanel("lanePreferenceSelector", null);
                    SetCachedPanel("lanePreferenceWithPartyOption", null);
                    State.laneWithPartyNextApplyMs = now + LANE_PREF_HIDDEN_INTERVAL_MS;
                    return;
                }

                if (!IsPanelVisibleMaybe(selector)) {
                    State.laneWithPartyLastState = "hidden";
                    State.laneWithPartyNextApplyMs = now + LANE_PREF_HIDDEN_INTERVAL_MS;
                    return;
                }

                if (IsLanePreferenceWithPartySelected(selector)) {
                    State.laneWithPartyLastState = "selected";
                    State.laneWithPartyNextApplyMs = now + LANE_PREF_SELECTED_INTERVAL_MS;
                    return;
                }

                var setAttempted = false;
                if (selector.SetSelected) {
                    try {
                        selector.SetSelected(LANE_PREF_WITH_PARTY_OPTION_ID);
                        setAttempted = true;
                    } catch(e1) { if (typeof Utils !== "undefined" && Utils.WarnLog) Utils.WarnLog("ql_feat_lanewithparty", (e1 && e1.message ? e1.message : String(e1 || ""))); }
                }

                var selectorActivated = ActivatePanelSafe(selector);
                var option = FindLanePreferenceWithPartyOption(root, selector);
                var optionActivated = false;
                if (option && IsPanelValid(option)) {
                    var optionId = ReadPanelIdTextMaybe(option) || LANE_PREF_WITH_PARTY_OPTION_ID;
                    if (selector.SetSelected) {
                        try { selector.SetSelected(optionId); setAttempted = true; } catch(e2) { if (typeof Utils !== "undefined" && Utils.WarnLog) Utils.WarnLog("ql_feat_lanewithparty", (e2 && e2.message ? e2.message : String(e2 || ""))); }
                    }
                    optionActivated = ActivatePanelSafe(option);
                    if (selector.SetSelected) {
                        try { selector.SetSelected(optionId); setAttempted = true; } catch(e3) { if (typeof Utils !== "undefined" && Utils.WarnLog) Utils.WarnLog("ql_feat_lanewithparty", (e3 && e3.message ? e3.message : String(e3 || ""))); }
                    }
                    try { $.DispatchEvent("Activated", selector); } catch (e5) {
                        $.Msg("[QOLLock][WARN][" + "ql_lane_with_party" + "] DispatchEvent Activated on lane selector failed: " + (e5 && e5.message ? String(e5.message) : String(e5)));
                    }
                } else {
                    SetCachedPanel("lanePreferenceWithPartyOption", null);
                }

                if (IsLanePreferenceWithPartySelected(selector)) {
                    State.laneWithPartyLastApplyMs = now;
                    State.laneWithPartyLastState = "applied";
                    State.laneWithPartyNextApplyMs = now + LANE_PREF_SELECTED_INTERVAL_MS;
                } else {
                    State.laneWithPartyLastState = (selectorActivated || optionActivated || setAttempted) ? "pending_retry" : "option_missing";
                    State.laneWithPartyNextApplyMs = now + (option ? LANE_PREF_APPLY_INTERVAL_MS : LANE_PREF_HIDDEN_INTERVAL_MS);
                }
                } catch(e) {
                    if (typeof QOL !== "undefined" && QOL.core && QOL.core.Logger) {
                        QOL.core.Logger.logError("ql_lane_with_party", "_tick: " + (e.message || e));
                    }
                    throw e;
                }
            }

            return {
                onEnable: function() {
                    var S = QOL.core.Scheduler;
                    _loop = S && S.createPollLoop ? S.createPollLoop(_tick, 0.5, "ql_lane_with_party") : null;
                },
                onDisable: function() {
                    if (_loop) { _loop.stop(); _loop = null; }
                    var S = QOL.core.Scheduler; if (S) S.cancelAllForFeature("ql_lane_with_party");
                    SetCachedPanel("lanePreferenceSelector", null);
                    SetCachedPanel("lanePreferenceWithPartyOption", null);
                    State.laneWithPartyNextApplyMs = 0;
                    State.laneWithPartyLastApplyMs = 0;
                    State.laneWithPartyLastState = "";
                    _root = null;
                },
                onSettingsChanged: function() {
                    if (State) State.laneWithPartyNextApplyMs = 0;
                    _tick();
                }
            };
        },
        test: function(ctx) {
            try {
                var root = $.GetContextPanel();
                var selector = root ? root.FindChildTraverse("LanePreferenceSelector") : null;
                if (!selector) return null;  // Skip — not in a match context
                return {
                    passed: true,
                    name: "Lane preference selector exists",
                    message: "",
                    assertions: [
                        { passed: true, name: "LanePreferenceSelector exists" }
                    ]
                };
            } catch(e) { return { passed: false, name: "Lane preference selector check", message: (e && e.message ? e.message : String(e)) }; }
        }
    });
})();

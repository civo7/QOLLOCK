// manifests/ql_ui_controls/manifest.js
// =============================================================================
// QOLLOCK — General UI Controls & Aspect Ratio Support
// =============================================================================
// OWNS:        Aspect ratio HUD shifts (16:10, 4:3, 21:9 stream fix), ESC menu
//              centering, testing tools visibility overrides, behavior summary.
// DOES NOT OWN: Base HUD components or settings window layout
// DEPENDS ON:  QOL.core.FeatureRegistry, QOL.core.hud
// CONFIG KEYS: SUPPORT_16_10, SUPPORT_4_3, ENABLE_HUD_SHIFT, ENABLE_CENTER_ESC,
//              ENABLE_CENTER_FRIENDS_LIST, ENABLE_FORCE_TESTING_TOOLS,
//              ENABLE_HIDE_TESTING_TOOLS, ENABLE_HIDE_BEHAVIOR_SUMMARY
// =============================================================================

(function () {
    "use strict";

    var FR = QOL.core && QOL.core.FeatureRegistry;
    if (!FR) {
        $.Msg("[QOLLock] ql_ui_controls: FeatureRegistry not found — aborting");
        return;
    }

    var FEATURE_ID = "ql_ui_controls";

    FR.register({
        id: FEATURE_ID,
        enabledByDefault: true,
        settings: [
            { key: "SUPPORT_16_10", type: "toggle", label: "16:10 Support", description: "Shifts the HUD for better visual support for 16:10 resolutions." },
            { key: "SUPPORT_4_3", type: "toggle", label: "4:3 Support", description: "Shifts the HUD for better visual support for 4:3 resolutions." },
            { key: "ENABLE_HUD_SHIFT", type: "toggle", label: "21:9 Stream Fix", description: "Slight adjustments to the HUD for better streaming output." },
            { key: "ENABLE_CENTER_ESC", type: "toggle", label: "Centered ESC Menu", description: "Centers ESC menu elements to make them easier to access." },
            { key: "ENABLE_CENTER_FRIENDS_LIST", type: "toggle", label: "Centered Friends List", description: "Centers friends list area in ESC menu." },
            { key: "ENABLE_FORCE_TESTING_TOOLS", type: "toggle", label: "Show Testing Tools", description: "Forcibly shows testing tools at all times." },
            { key: "ENABLE_HIDE_TESTING_TOOLS", type: "toggle", label: "Hide Testing Tools", description: "Forcibly hides testing tools at all times." },
            { key: "ENABLE_HIDE_BEHAVIOR_SUMMARY", type: "toggle", invert: true, label: "Behavior Summary", description: "Menu when you receive a punishment for breaking game rules." },
            { key: "ENABLE_LEGACY_COOLDOWNS", type: "toggle", label: "Legacy Durations", description: "Show cooldown durations on abilities like in older versions." },
            { key: "ENABLE_UPDATE_CHECKER", type: "toggle", label: "Update Checker", description: "Check for new QOLLOCK releases when opening settings." }
        ],
        create: function (ctx) {
            function _getRoot() {
                var hud = (typeof QOL !== "undefined" && QOL.core && QOL.core.panel && QOL.core.panel.findHud)
                    ? QOL.core.panel.findHud()
                    : null;
                if (hud) return hud;
                var c = $.GetContextPanel ? $.GetContextPanel() : null;
                return c;
            }

            function _apply() {
                var root = _getRoot();
                if (!root) return;
                if (QOL.core && QOL.core.hud && QOL.core.hud.refreshRootClasses) {
                    QOL.core.hud.refreshRootClasses(root);
                }
            }

            return {
                onEnable: function () {
                    _apply();
                },
                onDisable: function () {
                    var root = _getRoot();
                    if (!root) return;
                    if (root.RemoveClass) {
                        root.RemoveClass("support_16_10_active");
                        root.RemoveClass("support_4_3_active");
                        root.RemoveClass("hud_shift_active");
                        root.RemoveClass("center_esc_active");
                        root.RemoveClass("center_friends_list_active");
                        root.RemoveClass("force_testing_tools_active");
                        root.RemoveClass("hide_testing_tools_active");
                        root.RemoveClass("hide_behavior_summary_active");
                    }
                },
                onSettingsChanged: function () {
                    _apply();
                    if (typeof QOL !== "undefined" && QOL.updateChecker && typeof QOL.updateChecker.onSettingsChanged === "function") {
                        try { QOL.updateChecker.onSettingsChanged(); } catch (_) {}
                    }
                }
            };
        },
        test: function (ctx) {
            try {
                var passed = (ctx && ctx.id === FEATURE_ID);
                return {
                    passed: passed,
                    name: "ql_ui_controls manifest check",
                    message: passed ? "" : "Invalid feature ID",
                    assertions: [{ passed: passed, name: "Feature ID matches" }]
                };
            } catch (e) {
                return { passed: false, name: "ql_ui_controls manifest check", message: (e && e.message ? e.message : String(e)) };
            }
        }
    });
})();

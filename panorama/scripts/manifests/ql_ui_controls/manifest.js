// OWNS: UI/support setting declarations and reactive complete-config projection.
// DOES NOT OWN: Native panels, settings-window layout or the settings update checker.
// Root classes belong to the shared HUD projector.
(() => {
    "use strict";
    QOL.core.FeatureRegistry.register({
        id: "ql_ui_controls",
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
        create() {
            const update = () => QOL.core.hud.refreshRootClasses(QOL.core.panel.findHud() || $.GetContextPanel());
            return { onEnable: update, onSettingsChanged: update, onDisable: update };
        },
        test(ctx) {
            const passed = ctx?.id === "ql_ui_controls";
            return { passed, name: "ql_ui_controls manifest check", message: passed ? "" : "Invalid feature ID",
                assertions: [{ passed, name: "Feature ID matches" }] };
        }
    });
})();

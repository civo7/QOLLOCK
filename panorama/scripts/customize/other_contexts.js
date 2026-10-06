// Visual additions outside movable HUD owners are kept discoverable. Existing
// controls are exposed; fixed assets and inactive scripts gain no fake settings.
(() => {
    "use strict";
    const C = QOL.presentation;
    const { field: f } = C.fields;
    const t = (key, label) => f(key, label, "toggle");
    const contextual = (id, name, fields, note) => ({ id, name, fields, note, context: true, group: "Other Screens" });
    C.register([
        contextual("testingTools", "Testing Tools", [t("ENABLE_FORCE_TESTING_TOOLS", "Show Testing Tools"), t("ENABLE_HIDE_TESTING_TOOLS", "Hide Testing Tools")],
            "Testing tools appear in hero testing. Their visibility is configurable; their native layout has no position settings."),
        contextual("menuLayout", "Menu Layout", [t("ENABLE_CENTER_ESC", "Centered ESC Menu"), t("ENABLE_CENTER_FRIENDS_LIST", "Centered Friends List"),
            t("ENABLE_HIDE_BEHAVIOR_SUMMARY", "Hide Behavior Summary"), t("ENABLE_MINIMALISTIC_PAUSE", "Minimalistic Pause")],
            "Menu changes are visible when the editor closes. Their existing controls do not define independent screen offsets."),
        contextual("screenLayout", "Display & Screen", [t("SUPPORT_16_10", "16:10 Support"), t("SUPPORT_4_3", "4:3 Support"), t("ENABLE_HUD_SHIFT", "21:9 Stream Fix")],
            "These controls adjust several HUD owners together. Recheck frames after changing display support."),
        { id: "performance", name: "Performance Overlay", group: "Overlay", path: ["QOL_PerfOverlay"], fields: [
            t("ENABLE_PERF_OVERLAY", "Enable"), f("PERF_OVERLAY_OPACITY", "Opacity")
        ] },
        contextual("deathGames", "On-death Games", [t("ENABLE_ON_DEATH_GAMES", "Enable"),
            ...[["MINESWEEPER", "Minesweeper"], ["BLACKJACK", "Blackjack"], ["FLAPPY_BAT", "Flappy Bat"], ["GRAVES_TRAINER", "Graves Trainer"], ["ZERGGY_MANIA", "Zerggy Mania"], ["WHACK_A_REM", "Whack-a-Rem"]]
                .map(([suffix, label]) => t("ON_DEATH_GAME_" + suffix, label))],
            "Arcade overlays use their own modal layout and appear after death. Screen dragging does not apply."),
        contextual("reminderCaptions", "Reminder Captions", [t("ENABLE_DL4D_CAPTIONS", "Enable")],
            "Captions require the corresponding reminders. The caption renderer owns its layout."),
        contextual("profileScreens", "Profile and Profile Card", [],
            "Profile links, rank badges and profile controls run in separate native contexts. They currently have no persistent customization settings."),
        contextual("quickbuySummary", "Quickbuy Total Summary", [],
            "The quickbuy summary uses the active quickbuy script and its parent layout. It has no separate persistent customization settings."),
        contextual("fixedVisuals", "Fixed HUD Visuals", [],
            "Cursor, signature press flash, fixed icons and shared styles belong to their original owners. No independent position or color setting exists for these assets."),
        contextual("mainMenu", "Main Menu Cards", [], "Dashboard cards and links have fixed layouts and no persistent customization settings."),
        contextual("friendSearch", "Friend Search", [], "Friend search belongs to the friends pane and has no independent appearance settings."),
        contextual("settingsInterface", "Settings Interface", [],
            "Settings, previews, tooltips and developer dialogs use the settings theme. Change the theme in Settings."),
        contextual("legacyVisuals", "Inactive Visuals", [],
            "Legacy souls-per-minute, unspent-souls and fortitude widgets are inactive. The editor does not enable unfinished renderers.")
    ]);
})();

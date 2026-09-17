// ui/ql_settings_tabs.js
// =============================================================================
// QOLLOCK — Settings Tab Definitions (PURE DATA FUNCTIONS)
// =============================================================================
// OWNS:        GetSettingsTabOrder, GetSettingsTabDisplayName,
//              GetSettingsTabGroups, GetSettingsTabIconSource
// DOES NOT OWN: Tab rendering, settings window management
// DEPENDS ON:  core/ql_namespace.js
// USED BY:     ql_settings.js, ui/window.js, ui/search.js
// =============================================================================

(() => {
    "use strict";

    const Q = (typeof globalThis !== "undefined" && globalThis.QOL)
        ? globalThis.QOL
        : (typeof QOL !== "undefined" ? QOL : (globalThis.QOL = {}));
    Q.ui = Q.ui || {};

    const TAB_ORDER = [
        "Support", "Config", "Presets", "Crosshair", "Healthbar",
        "HUD", "Minimap", "Shop", "Audio", "Arcade", "Console"
    ];

    function GetSettingsTabOrder() {
        return TAB_ORDER.slice();
    }

    function GetSettingsTabDisplayName(tabName) {
        const raw = String(tabName || "");
        if (raw === "Config") return "Settings";
        if (raw === "MOG") return "MOGLOCK";
        return raw;
    }

    function GetSettingsTabGroups() {
        return [
            {
                title: "General",
                tabs: ["Support", "Config", "Presets", "Console", "Arcade"]
            },
            {
                title: "Gameplay",
                tabs: ["Crosshair", "Healthbar", "HUD", "Minimap", "Shop", "Audio"]
            }
        ];
    }

    function GetSettingsTabIconSource(tabName) {
        switch (String(tabName || "")) {
            case "Support": return "s2r://panorama/images/icons/icon_thumbsup.vsvg";
            case "Config": return "s2r://panorama/images/icons/icon_gear.vsvg";
            case "Presets": return "s2r://panorama/images/icons/icon_player.vsvg";
            case "Console": return "s2r://panorama/images/icons/icon_feedback.vsvg";
            case "MOG": return "s2r://panorama/images/icons/properties/armor_alt.vsvg";
            case "Arcade": return "s2r://panorama/images/icons/properties/condition_burn.vsvg";
            case "Crosshair": return "s2r://panorama/images/icons/properties/range_aoe.vsvg";
            case "Healthbar": return "s2r://panorama/images/icons/properties/health.vsvg";
            case "HUD": return "s2r://panorama/images/icons/properties/spirit.vsvg";
            case "Minimap": return "s2r://panorama/images/icons/icon_report.vsvg";
            case "Shop": return "s2r://panorama/images/icons/icon_cart.vsvg";
            case "Audio": return "s2r://panorama/images/qollock/audio_nav_icon.vsvg";
            case "UI": return "s2r://panorama/images/icons/icon_reorder.vsvg";
            case "Overlay": return "s2r://panorama/images/icons/icon_graph.vsvg";
            default: return "";
        }
    }

    const TabsApi = {
        GetSettingsTabOrder,
        GetSettingsTabDisplayName,
        GetSettingsTabGroups,
        GetSettingsTabIconSource
    };

    Q.ui.tabs = TabsApi;

    if (typeof globalThis !== "undefined") {
        Object.assign(globalThis, TabsApi);
    }
})();

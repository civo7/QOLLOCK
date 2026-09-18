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

    const FALLBACK_TAB_ORDER = [
        "Support", "Config", "Presets", "Crosshair", "Healthbar",
        "HUD", "Minimap", "Shop", "Audio", "Arcade", "Console"
    ];

    function GetSettingsTabOrder() {
        if (Array.isArray(Q.ui?.layout)) {
            const tabs = [];
            for (let i = 0; i < Q.ui.layout.length; i++) {
                const entry = Q.ui.layout[i];
                if (entry && entry.id) tabs.push(entry.id);
            }
            if (tabs.length > 0) return tabs;
        }
        return FALLBACK_TAB_ORDER.slice();
    }

    function GetSettingsTabDisplayName(tabName) {
        const raw = String(tabName || "");
        if (Array.isArray(Q.ui?.layout)) {
            const found = Q.ui.layout.find((t) => t && t.id === raw);
            if (found && found.name) return found.name;
        }
        if (raw === "Config") return "Settings";
        if (raw === "MOG") return "MOGLOCK";
        return raw;
    }

    function GetSettingsTabGroups() {
        if (Array.isArray(Q.ui?.layout)) {
            const groups = [];
            let currentGroup = null;
            for (let i = 0; i < Q.ui.layout.length; i++) {
                const entry = Q.ui.layout[i];
                if (!entry) continue;
                if (entry.heading) {
                    currentGroup = { title: entry.heading, tabs: [] };
                    groups.push(currentGroup);
                } else if (entry.id) {
                    if (!currentGroup) {
                        currentGroup = { title: "General", tabs: [] };
                        groups.push(currentGroup);
                    }
                    currentGroup.tabs.push(entry.id);
                }
            }
            if (groups.length > 0) return groups;
        }
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
        const raw = String(tabName || "");
        if (Array.isArray(Q.ui?.layout)) {
            const found = Q.ui.layout.find((t) => t && t.id === raw);
            if (found && found.icon) return found.icon;
        }
        switch (raw) {
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

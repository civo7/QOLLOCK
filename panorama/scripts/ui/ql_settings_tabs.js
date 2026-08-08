// ui/ql_settings_tabs.js
// =============================================================================
// QOLLOCK — Settings Tab Definitions (PURE DATA FUNCTIONS)
// =============================================================================
// OWNS:        GetSettingsTabOrder, GetSettingsTabDisplayName,
//              GetSettingsTabGroups, GetSettingsTabIconSource
// DOES NOT OWN: Tab rendering, settings window management
// DEPENDS ON:  Nothing — pure data functions, no external deps
// USED BY:     ql_settings.js (BuildUI, RenderCurrentTabContent, search)
//
// Extracted from ql_settings.js (Phase 8). Zero-risk — pure data, no logic.
// Coexists with original — both declare the same global functions.
// =============================================================================

function GetSettingsTabOrder() {
    return ["Support", "Config", "Presets", "Crosshair", "Healthbar", "HUD", "UI", "Overlay", "Minimap", "Audio", "Arcade", "Console"];
}

function GetSettingsTabDisplayName(tabName) {
    var raw = String(tabName || "");
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
            tabs: ["Crosshair", "Healthbar", "HUD", "UI", "Overlay", "Minimap", "Audio"]
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
        case "UI": return "s2r://panorama/images/icons/icon_reorder.vsvg";
        case "Overlay": return "s2r://panorama/images/icons/icon_graph.vsvg";
        case "Minimap": return "s2r://panorama/images/icons/icon_report.vsvg";
        case "Audio": return "s2r://panorama/images/qollock/audio_nav_icon.vsvg";
        default: return "";
    }
}

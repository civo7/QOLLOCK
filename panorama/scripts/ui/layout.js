// panorama/scripts/ui/layout.js
// =============================================================================
// QOLLOCK — Declarative Settings Layout (PURE DATA)
// =============================================================================
// Modeled after thirdeye/panorama/scripts/ui/layout.js.
// Declares the settings-window layout: sidebar tabs, group headings, sections,
// and feature ordering. Adding or reordering a feature in the UI is a declarative
// edit in this file.
// =============================================================================

(() => {
    "use strict";

    const Q = (typeof globalThis !== "undefined" && globalThis.QOL)
        ? globalThis.QOL
        : (typeof QOL !== "undefined" ? QOL : null);

    if (!Q?.ui) {
        $.Msg("[QOLLock] ui/layout: QOL.ui missing — aborting");
        return;
    }

    Q.ui.layout = [
        // ── Group: General ──
        { heading: "General" },
        {
            id: "Support",
            name: "Support",
            icon: "s2r://panorama/images/icons/icon_thumbsup.vsvg",
            custom: true
        },
        {
            id: "Config",
            name: "Settings",
            icon: "s2r://panorama/images/icons/icon_gear.vsvg",
            sections: [
                {
                    title: "General Preferences",
                    features: ["ql_show_build_id"]
                }
            ]
        },
        {
            id: "Presets",
            name: "Presets",
            icon: "s2r://panorama/images/icons/icon_player.vsvg",
            custom: true
        },
        {
            id: "Console",
            name: "Console",
            icon: "s2r://panorama/images/icons/icon_feedback.vsvg",
            custom: true
        },
        {
            id: "Arcade",
            name: "Arcade",
            icon: "s2r://panorama/images/icons/properties/condition_burn.vsvg",
            custom: true
        },

        // ── Group: Gameplay ──
        { heading: "Gameplay" },
        {
            id: "Crosshair",
            name: "Crosshair",
            icon: "s2r://panorama/images/icons/properties/range_aoe.vsvg",
            sections: [
                {
                    title: "Item Cooldowns",
                    animatedToggle: true,
                    enableKey: "ENABLE_PASSIVE_COOLDOWN",
                    description: "Tracked cooldowns near crosshair",
                    features: ["ql_passive_cooldown"]
                },
                {
                    title: "Active Stats",
                    animatedToggle: true,
                    enableKey: "ENABLE_CROSSHAIR_STATS",
                    description: "Crosshair active stats overlay",
                    features: ["ql_crosshair_stats"]
                },
                {
                    title: "Target Shapes",
                    animatedToggle: true,
                    enableKey: "ENABLE_TARGET_SHAPES",
                    features: ["ql_target_shapes"]
                },
                {
                    title: "Ammo Status",
                    features: ["ql_ammo"]
                },
                {
                    title: "Reload Cooldown",
                    animatedToggle: true,
                    enableKey: "ENABLE_RELOAD_COOLDOWN",
                    features: ["ql_reload_cooldown"]
                },
                {
                    title: "Damage Visuals",
                    features: ["ql_damage_numbers", "ql_damage_impact"]
                }
            ]
        },
        {
            id: "Healthbar",
            name: "Healthbar",
            icon: "s2r://panorama/images/icons/properties/health.vsvg",
            sections: [
                {
                    title: "Player",
                    features: [
                        "ql_combat_status",
                        "ql_color_warnings",
                        "ql_healthbar"
                    ]
                }
            ]
        },
        {
            id: "HUD",
            name: "HUD",
            icon: "s2r://panorama/images/icons/properties/spirit.vsvg",
            sections: [
                {
                    title: "Top Bar",
                    animatedToggle: true,
                    enableKey: "HUD_TOP_BAR_ENABLED",
                    features: ["ql_topbar", "ql_rejuv_hud", "ql_nicknames", "ql_showrank"]
                },
                {
                    title: "Bottom Bar",
                    animatedToggle: true,
                    enableKey: "HUD_BOTTOM_BAR_ENABLED",
                    features: ["ql_bottom_bar", "ql_cast_failed_hint", "ql_ability_icons"]
                },
                {
                    title: "Items",
                    animatedToggle: true,
                    enableKey: "HUD_ITEMS_ENABLED",
                    features: ["ql_items"]
                },
                {
                    title: "Souls",
                    animatedToggle: true,
                    enableKey: "HUD_SOULS_ENABLED",
                    features: ["ql_souls"]
                },
                {
                    title: "Shop",
                    animatedToggle: true,
                    enableKey: "HUD_SHOP_ENABLED",
                    features: ["ql_heroshop", "ql_recent_purchases"]
                }
            ]
        },
        {
            id: "UI",
            name: "UI",
            icon: "s2r://panorama/images/icons/icon_reorder.vsvg",
            sections: [
                {
                    title: "UI Controls",
                    features: [
                        "ql_lane_with_party",
                        "ql_legacy_audio_passive"
                    ]
                },
                {
                    title: "Show Build ID",
                    animatedToggle: true,
                    enableKey: "ENABLE_SHOW_BUILD_ID",
                    description: "Shows your build information always for content creators",
                    features: ["ql_show_build_id"]
                },
                {
                    title: "Damage Report",
                    animatedToggle: true,
                    enableKey: "DISABLE_DAMAGE_REPORT",
                    invertToggle: true,
                    features: ["ql_damage_report"]
                },
                {
                    title: "Player Stats",
                    features: ["ql_stats_position"]
                },
                {
                    title: "Chat",
                    animatedToggle: true,
                    enableKey: "ENABLE_CHAT",
                    features: ["ql_chat_images"]
                }
            ]
        },
        {
            id: "Overlay",
            name: "Overlay",
            icon: "s2r://panorama/images/icons/icon_graph.vsvg",
            sections: [
                {
                    title: "Zipline Boost",
                    animatedToggle: true,
                    enableKey: "ENABLE_ZIP_BOOST",
                    description: "Always Visible Boost",
                    features: ["ql_zipboost"]
                },
                {
                    title: "Ult Cooldowns",
                    animatedToggle: true,
                    enableKey: "ENABLE_ULT_COOLDOWNS",
                    features: ["ql_ult_cooldowns"]
                },
                {
                    title: "Unsecured Timer",
                    animatedToggle: true,
                    enableKey: "ENABLE_UNSECURED_SOUL_TIMER",
                    description: "Realtime Drain Countdown",
                    features: ["ql_unsecured_souls_timer"]
                },
                {
                    title: "Unsecured Plus",
                    animatedToggle: true,
                    enableKey: "ENABLE_BETTER_UNSECURED",
                    description: "Customizable Unsecured Souls",
                    features: ["ql_better_unsecured_hud"]
                },
                {
                    title: "Keyboard",
                    animatedToggle: true,
                    enableKey: "ENABLE_KEYBOARD_OVERLAY",
                    description: "Realtime Key Inputs",
                    features: ["ql_keyboard"]
                },
                {
                    title: "Compass & Speed",
                    animatedToggle: true,
                    enableKey: "ENABLE_COMPASS",
                    description: "See your view angle and movement speed",
                    features: ["ql_compass"]
                }
            ]
        },
        {
            id: "Minimap",
            name: "Minimap",
            icon: "s2r://panorama/images/icons/icon_report.vsvg",
            sections: [
                {
                    title: "Base Minimap",
                    features: ["ql_minimap_runtime"]
                },
                {
                    title: "Timers & Addons",
                    features: ["ql_minimap_timers"]
                }
            ]
        },
        {
            id: "Audio",
            name: "Audio",
            icon: "s2r://panorama/images/qollock/audio_nav_icon.vsvg",
            custom: true
        }
    ];

    /**
     * Finds the layout descriptor for a given tab identifier.
     * @param {string} tabId
     * @returns {object|null}
     */
    Q.ui.getTabLayout = (tabId) => {
        if (!Array.isArray(Q.ui.layout)) return null;
        for (let i = 0; i < Q.ui.layout.length; i++) {
            const entry = Q.ui.layout[i];
            if (entry && entry.id === tabId) return entry;
        }
        return null;
    };
})();

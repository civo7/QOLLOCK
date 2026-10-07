// Feature-owned overlays and native crosshair surfaces. Paths mirror their
// production owners; conditional gameplay content is never synthesized here.
(() => {
    "use strict";
    const C = QOL.presentation;
    const { gameplay, crosshair } = C.paths;
    const { geometry, opacity, toggle, field: f } = C.fields;
    const t = (key, label) => f(key, label, "toggle");
    const overlay = (id, name, panel, fields) => ({ id, name, group: "Overlay", path: [...gameplay, panel], fields });
    C.register([
        overlay("activeStats", "Active Stats", "QOLCrosshairStatsOverlay", [
            toggle("ENABLE_CROSSHAIR_STATS"), ...geometry("CROSSHAIR_STATS_", true), opacity("CROSSHAIR_STATS_"),
            ...[
                ["DEBUFFS", "Debuffs"], ["BUFFS", "Buffs"], ["FIRERATE", "Fire Rate"], ["MOVESPEED", "Move Speed"],
                ["HEALAMP", "Healing Amplification"], ["BULLETRESIST", "Bullet Resist"], ["TECHRESIST", "Spirit Resist"],
                ["BULLETLIFESTEAL", "Bullet Lifesteal"], ["TECHLIFESTEAL", "Spirit Lifesteal"], ["WEAPONPOWER", "Weapon Damage"],
                ["SPIRIT", "Spirit Power"], ["RANGE", "Range"], ["DURATION", "Duration"], ["DAMAGEAMP", "Damage Amplification"],
                ["CLIPSIZE", "Ammo Capacity"], ["REGEN", "Health Regen"], ["BULLETEVASION", "Bullet Evasion"]
            ].map(([suffix, label]) => f("CROSSHAIR_STATS_SHOW_" + suffix, label, "toggle", { hidden: true }))
        ]),
        overlay("compass", "Compass", "QOLCompassRoot", [toggle("ENABLE_COMPASS"), f("ENABLE_SIMPLIFY_COMPASS", "Minimalist", "toggle", { hidden: true }),
            ...geometry("COMPASS_", true), f("COMPASS_STRETCH_X", "Width"), f("COMPASS_STRETCH_Y", "Height")]),
        Object.assign(overlay("speed", "Speed", "QOLSpeedRoot", [toggle("ENABLE_COMPASS_SPEED"), ...geometry("COMPASS_SPEED_", true)]), { scaleKey: "COMPASS_SPEED_SCALE" }),
        overlay("zipBoost", "Zipline Boost", "QOLZipBoostOverlay", [toggle("ENABLE_ZIP_BOOST"), ...geometry("ZIP_BOOST_", true)]),
        overlay("statBonuses", "Stat Bonuses", "QOLStatBonusesOverlay", [toggle("ENABLE_STAT_BONUSES"), ...geometry("STAT_BONUSES_", true)]),
        overlay("combatStatus", "Combat Status", "QOLCombatStatusOverlay", [toggle("ENABLE_COMBAT_STATUS"), f("ENABLE_COMBAT_INDICATOR", "Combat Indicator", "toggle", { hidden: true }), ...geometry("COMBAT_STATUS_", true)]),
        overlay("unsecuredTimer", "Unsecured Souls Timer", "QOLUnsecuredSoulsOverlay", [toggle("ENABLE_UNSECURED_SOUL_TIMER"), ...geometry("UNSECURED_SOUL_TIMER_", true)]),
        { id: "unsecuredSouls", name: "Better Unsecured Souls", group: "Overlay", path: [...C.paths.core, "StatsAndModsContainer", "QOLBetterUnsecuredOverlay"],
            fallbackPath: [...gameplay, "QOLBetterUnsecuredOverlay"], fields: [
            toggle("ENABLE_BETTER_UNSECURED"), ...geometry("UNSECURED_SOULS_HUD_", true).map(item => item.axis === "y" ? Object.assign({}, item, { direction: 1 }) : item),
            f("ENABLE_BETTER_UNSECURED_SHOW_ICON", "Icon", "toggle", { hidden: true }),
            f("ENABLE_BETTER_UNSECURED_SHOW_TEXT", "Text", "toggle", { hidden: true }),
            f("ENABLE_BETTER_UNSECURED_SHOW_ICON_TEXT", "Icon Text", "toggle", { hidden: true })
        ] },
        { id: "keyboard", name: "Keyboard Overlay", group: "Overlay", path: [...gameplay, "QOLKeyboardOverlayRoot", "AllBindingsBox"], fields: [
            toggle("ENABLE_KEYBOARD_OVERLAY"), f("ENABLE_FULL_KEYBOARD_LAYOUT", "Full Keyboard", "toggle", { hidden: true }), ...geometry("KEYBOARD_OVERLAY_", true),
            f("KEYBOARD_OVERLAY_WASH_COLOR", "Color", "palette")
        ] },
        { id: "reload", name: "Reload Cooldown", group: "Crosshair", path: [...crosshair, "gun", "gun_data", "reticle_status", "QOLReloadCooldownText"], fields: [
            toggle("ENABLE_RELOAD_COOLDOWN"), f("ENABLE_HIDE_RELOAD_ICON", "Hide Reload Icon", "toggle", { hidden: true }),
            f("ENABLE_HIDE_RELOAD_CIRCLE", "Hide Reload Circle", "toggle", { hidden: true }),
            ...geometry("RELOAD_COOLDOWN_"), f("RELOAD_COOLDOWN_SIZE", "Size", null, { resize: true }), opacity("RELOAD_COOLDOWN_")
        ] },
        { id: "cooldowns", name: "Item Cooldowns", group: "Crosshair", path: [...gameplay, "QOLItemMirrorRoot"],
            resolve(hud, config) {
                const basic = Number(config?.ENABLE_OLD_ITEM_COOLDOWNS) === 1;
                return C.findPath(hud, basic ? [...C.paths.abilities, "hud_passive_items"] : [...gameplay, "QOLItemMirrorRoot"]);
            },
            fields: [
                toggle("ENABLE_PASSIVE_COOLDOWN"), f("ENABLE_OLD_ITEM_COOLDOWNS", "Basic Mode", "toggle", { hidden: true }),
                f("PASSIVE_COOLDOWN_X", "Horizontal Offset (%)", null, { axis: "x", unit: "%" }),
                f("PASSIVE_COOLDOWN_Y", "Vertical Offset (%)", null, { axis: "y", direction: -1, unit: "%" }),
                f("PASSIVE_COOLDOWN_SIZE", "Size", null, { resize: true }), opacity("PASSIVE_COOLDOWN_"),
                f("ITEM_FILTER_DEF_PASSIVE", "Defensive Passive", "toggle", { hidden: true }),
                f("ITEM_FILTER_OFF_PASSIVE", "Offensive Passive", "toggle", { hidden: true }),
                f("ITEM_FILTER_DEF_ACTIVE", "Defensive Active", "toggle", { hidden: true }),
                f("ITEM_FILTER_OFF_ACTIVE", "Offensive Active", "toggle", { hidden: true })
        ] }
    ]);
})();

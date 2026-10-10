// Smaller HUD details use their existing independent controls or inherit the
// geometry of a parent surface. World-bound visuals do not gain screen offsets.
(() => {
    "use strict";
    const C = QOL.presentation;
    const { core, lower, abilities, gameplay } = C.paths;
    const { geometry, opacity, field: f } = C.fields;
    const t = (key, label) => f(key, label, "toggle");
    const detail = (id, name, path, fields, group = "HUD") => ({ id, name, path, fields, group });
    const thresholds = (prefix, side = "") => [25, 65, 75].map(value => t(prefix + value, side + value + "%"));
    // Shared healthbar scale preserves the native CSS baseline.
    const healthbar = Object.assign(detail("healthbar", "Healthbar", [...gameplay, "health_and_abilities_container"], [
        f("HEALTHBAR_TYPE", "Type", "enum", { options: [[0, "Default"], [1, "Minimalist"], [2, "Fighting Game"], [3, "Klutz's Bar"], [4, "Budhud"], [5, "Minecraft"]] }),
        ...geometry("PLAYER_HEALTHBAR_", true), opacity("PLAYER_HEALTHBAR_"), f("PLAYER_HEALTHBAR_ACCENT_COLOR", "Accent Color", "palette"),
        t("ENABLE_MINECRAFT_HEALTH_NUMBERS", "Health Numbers")
    ], "Healthbar"), { scaleKey: "PLAYER_HEALTHBAR_SCALE" });
    C.register([
        healthbar,
        detail("healthWarnings", "Health Warnings", [...gameplay, "health_and_abilities_container"], [
            ...thresholds("ENABLE_COLOR_WARNING_")
        ], "Healthbar"),
        detail("damageImpact", "Damage Impact", [...core, "damage_impact"], [t("ENABLE_DAMAGE_IMPACT", "Enable"), ...geometry("DAMAGE_IMPACT_", true), opacity("DAMAGE_IMPACT_")], "Crosshair"),
        Object.assign(detail("damageReport", "Damage Report", [...core, "CitadelHudDamageReport"], [
            f("DISABLE_DAMAGE_REPORT", "Hide", "toggle", { visibility: true, inverted: true }), ...geometry("DAMAGE_REPORT_", true), opacity("DAMAGE_REPORT_")
        ]), { scaleKey: "DAMAGE_REPORT_SCALE" }),
        detail("chat", "Chat", [...core, "Chat"], [t("ENABLE_CHAT", "Enable"), t("ENABLE_IMAGES_IN_CHAT", "Images In Chat"), ...geometry("CHAT_", true), opacity("CHAT_")]),
        detail("objectives", "Objectives", [...core, "TopBar"], [t("ENABLE_OBJ_MAP", "Objective Map"), t("ENABLE_OBJ_DMG", "Objective Damage"), t("ENABLE_MISSING_HERO", "Missing Hero Opaque")]),
        detail("nicknames", "Nicknames", [...core, "TopBar"], [t("ENABLE_NICKNAMES", "Enable"), t("DISABLE_PLAYER_NAME_BLUR", "Hide Top Bar Background")]),
        detail("ranks", "Ranks", [...core, "TopBar"], [t("SHOW_RANK", "Show Rank"), t("SHOW_RANK_TOPBAR", "Show Rank in Top Bar")]),
        detail("ultimates", "Ultimate Cooldowns", [...core, "TopBar"], [t("ENABLE_ULT_COOLDOWNS", "Enable")]),
        detail("topBarWarnings", "Top Bar HP Warnings", [...core, "TopBar"], [...thresholds("ENABLE_TOPBAR_ENEMY_HP_WARNING_", "Enemy "), ...thresholds("ENABLE_TOPBAR_ALLY_HP_WARNING_", "Ally ")]),
        detail("urn", "Urn", [...core, "TopBar"], [t("ENABLE_URN_DIFF", "Urn Difference"), t("ENABLE_URN_TIMER", "Urn Timer")]),
        detail("buffTimers", "Buffs and Rejuvenator", [...core, "TopBar"], [t("ENABLE_BUFF_HUD", "Buff HUD"), t("ENABLE_REJUV_HUD", "Rejuvenator HUD")]),
        detail("abilities", "Ability Icons", [...abilities, "hud_signature"], [
            t("ENABLE_SIMPLIFY_ABILITY_ICONS", "Simplify Ability Icons"), t("ENABLE_HIDE_COSMETIC_ABILITY", "Hide Cosmetic Abilities"),
            t("ENABLE_HIDE_ABILITY_SUGGESTION", "Hide Ability Suggestion"), t("ENABLE_CLEAN_STACKS", "Clean Stacks"),
            t("ENABLE_LEGACY_COOLDOWNS", "Legacy Durations"), t("ENABLE_HIDE_FAILED_HINT", "Hide Failed Cast Hint")
        ]),
        detail("buildInfo", "Build ID", [...lower, "selected_build_info"], [t("ENABLE_SHOW_BUILD_ID", "Enable"), t("ENABLE_SHOW_BUILD_ID_TITLE", "Build Title")], "Overlay"),
        { id: "targetShapes", name: "Target Shapes", group: "Crosshair", note: "These visuals follow world targets. Size and visibility remain configurable; screen dragging does not apply.", fields: [
            t("ENABLE_RED_DIAMOND", "Red Diamond"), t("ENABLE_IMPROVED_HINT", "Improved Hint"), f("UNIT_TARGET_SIZE", "Size"),
            f("UNIT_TARGET_OPACITY", "Opacity"), f("UNIT_TARGET_HINT_SIZE", "Hint Size")
        ] },
        { id: "damageNumbers", name: "Damage Numbers", group: "Crosshair", frame: false, fields: [
            f("DAMAGE_NUMBER_OPACITY", "Opacity"), f("HUD_INDICATOR_SIZE", "Size"), t("ENABLE_CLEAN_DAMAGE_INDICATORS", "Clean Damage Indicators"),
            t("ENABLE_HIDE_SMALL_NUMBERS", "Hide Small Numbers"), t("ENABLE_HIDE_TROOPER_DAMAGE", "Hide Trooper Damage"),
            t("ENABLE_DAMAGE_FOUNTAIN", "Damage Fountain"), t("ENABLE_CUMULATIVE_DMG", "Cumulative Damage")
        ] },
        { id: "statlocker", name: "Statlocker", group: "HUD", fields: [t("ENABLE_STATLOCKER", "Enable")],
            note: "HUD profile links use this toggle. Profile and profile-card additions have their own context and no editable geometry." }
    ]);
})();

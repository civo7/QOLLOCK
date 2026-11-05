// Autonomous clipboard codes. Storage envelopes and historical layouts stay separate.
(() => {
    "use strict";
    const Q = globalThis.QOL;
    // IDs are array positions. Append only; never reorder, remove, reuse or change
    // a reference value. These are wire references, NOT current setting defaults.
    const dictionary = [
        ["QOLLOCK_DEV_CORE_ROOT_TEST_MODE",0],
        ["SHOW_RANK",0],
        ["SHOW_RANK_TOPBAR",1],
        ["SETTINGS_THEME",0],
        ["MINIMAP_SMALL_SIZE",400],
        ["MINIMAP_FIXED_ICON_SIZE",0],
        ["MINIMAP_BASE_OPACITY",1],
        ["MINIMAL_MINIMAP",0],
        ["MINIMAL_MINIMAP_OPACITY",0.9],
        ["MINIMAP_FLIP",0],
        ["MINIMAP_ROTATE_WITH_PLAYER",0],
        ["ENABLE_URN_COLORS",0],
        ["ENABLE_MINIMAP_BUFF_TIMER",0],
        ["ENABLE_MINIMAP_BUFF_TIMER_ON_BRIDGE",0],
        ["ENABLE_MINIMAP_REJUV_TIMER",0],
        ["ENABLE_MINIMAP_CRATE_OVERLAY",0],
        ["ENABLE_MINIMAP_REM_TUNNELS",0],
        ["MINIMAP_REM_TUNNELS_OPACITY",0.75],
        ["ENABLE_MINIMAP_ELEVATION_MARKERS",0],
        ["MINIMAP_ICON_COLOR",0],
        ["ENABLE_MINIMAP_ALWAYS_ON_MID_BOSS",0],
        ["MINIMAP_X_OFFSET",0],
        ["MINIMAP_Y_OFFSET",0],
        ["MINIMAP_LARGE_SIZE",750],
        ["ZOOM_X_OFFSET",0],
        ["ZOOM_Y_OFFSET",0],
        ["MINIMAP_LARGE_SIZE_ALT",750],
        ["ZOOM_X_OFFSET_ALT",0],
        ["ZOOM_Y_OFFSET_ALT",0],
        ["MINIMAP_LARGE_SIZE_TAB",750],
        ["ZOOM_X_OFFSET_TAB",0],
        ["ZOOM_Y_OFFSET_TAB",0],
        ["ENABLE_ALT_ZOOM",0],
        ["ALT_ZOOM_OPACITY",0.95],
        ["ALT_ZOOM_DRAW_OVER_UI",0],
        ["ENABLE_ALT_ZOOM_REM_TUNNELS",0],
        ["ALT_ZOOM_REM_TUNNELS_OPACITY",0.75],
        ["ENABLE_TAB_ZOOM",0],
        ["TAB_ZOOM_OPACITY",0.7],
        ["TAB_ZOOM_DRAW_OVER_UI",0],
        ["ENABLE_TAB_ZOOM_REM_TUNNELS",0],
        ["TAB_ZOOM_REM_TUNNELS_OPACITY",0.75],
        ["ENABLE_ONE_TIME",0],
        ["ENABLE_ONE_TIME_TIER1",0],
        ["ENABLE_ONE_TIME_TIER2",0],
        ["ENABLE_ONE_TIME_TIER3",0],
        ["ENABLE_INTERVAL",0],
        ["ENABLE_BUFF_SOUND_1",1],
        ["ENABLE_BUFF_SOUND_2",1],
        ["ENABLE_BUFF_SOUND_3",1],
        ["BRIDGE_BUFF_START",30],
        ["ENABLE_AMMO_STATUS",0],
        ["ENABLE_HIDE_AMMO_ALL",0],
        ["ENABLE_HIDE_MAGAZINE",0],
        ["AMMO_PANEL_SCALE",100],
        ["AMMO_CURRENT_SCALE",100],
        ["AMMO_TOTAL_SCALE",100],
        ["AMMO_PANEL_X_OFFSET",0],
        ["AMMO_PANEL_Y_OFFSET",0],
        ["AMMO_CLIP_ANGLE",0],
        ["AMMO_TEXT_COLOR",0],
        ["ENABLE_RELOAD_COOLDOWN",0],
        ["RELOAD_COOLDOWN_OPACITY",0.6],
        ["RELOAD_COOLDOWN_SIZE",28],
        ["RELOAD_COOLDOWN_X_OFFSET",0],
        ["RELOAD_COOLDOWN_Y_OFFSET",0],
        ["ENABLE_HIDE_RELOAD_ICON",0],
        ["ENABLE_HIDE_RELOAD_CIRCLE",0],
        ["ENABLE_CROSSHAIR_STATS",0],
        ["CROSSHAIR_STATS_SHOW_DEBUFFS",1],
        ["CROSSHAIR_STATS_SHOW_BUFFS",1],
        ["CROSSHAIR_STATS_X_OFFSET",0],
        ["CROSSHAIR_STATS_Y_OFFSET",0],
        ["CROSSHAIR_STATS_SCALE",100],
        ["CROSSHAIR_STATS_OPACITY",1],
        ["CROSSHAIR_STATS_SHOW_FIRERATE",1],
        ["CROSSHAIR_STATS_SHOW_MOVESPEED",1],
        ["CROSSHAIR_STATS_SHOW_HEALAMP",1],
        ["CROSSHAIR_STATS_SHOW_BULLETRESIST",1],
        ["CROSSHAIR_STATS_SHOW_TECHRESIST",1],
        ["CROSSHAIR_STATS_SHOW_BULLETLIFESTEAL",1],
        ["CROSSHAIR_STATS_SHOW_TECHLIFESTEAL",1],
        ["CROSSHAIR_STATS_SHOW_WEAPONPOWER",1],
        ["CROSSHAIR_STATS_SHOW_SPIRIT",1],
        ["CROSSHAIR_STATS_SHOW_RANGE",1],
        ["CROSSHAIR_STATS_SHOW_DURATION",1],
        ["CROSSHAIR_STATS_SHOW_DAMAGEAMP",1],
        ["CROSSHAIR_STATS_SHOW_CLIPSIZE",1],
        ["CROSSHAIR_STATS_SHOW_REGEN",1],
        ["CROSSHAIR_STATS_SHOW_BULLETEVASION",1],
        ["ENABLE_STATS_POSITION",1],
        ["AMMO_HUD_SCALE",100],
        ["AMMO_CURRENT_X_OFFSET",0],
        ["AMMO_CURRENT_Y_OFFSET",0],
        ["AMMO_MAX_X_OFFSET",0],
        ["AMMO_MAX_Y_OFFSET",0],
        ["ACTIVE_ITEMS_OPACITY",1],
        ["AP_OPACITY",1],
        ["AMMO_HUD_OPACITY",1],
        ["STAMINA_OPACITY",1],
        ["STATS_POSITION_OPACITY",1],
        ["COMPASS_OPACITY",1],
        ["COMPASS_SPEED_OPACITY",1],
        ["ZIP_BOOST_OPACITY",1],
        ["STAT_BONUSES_OPACITY",1],
        ["COMBAT_STATUS_OPACITY",1],
        ["UNSECURED_SOUL_TIMER_OPACITY",1],
        ["UNSECURED_SOULS_HUD_OPACITY",1],
        ["KEYBOARD_OVERLAY_OPACITY",1],
        ["DAMAGE_REPORT_OPACITY",1],
        ["CHAT_OPACITY",1],
        ["AP_SCALE",100],
        ["AP_X_OFFSET",0],
        ["AP_Y_OFFSET",0],
        ["STAMINA_X_OFFSET",0],
        ["STAMINA_Y_OFFSET",0],
        ["DAMAGE_REPORT_SCALE",100],
        ["SOULS_SCALE",100],
        ["ITEMS_SCALE",100],
        ["STAMINA_SCALE",100],
        ["STATS_POSITION_SCALE",100],
        ["COMPASS_SPEED_SCALE",100],
        ["STATS_POSITION_SIDE",0],
        ["STATS_POSITION_X_OFFSET",0],
        ["STATS_POSITION_Y_OFFSET",0],
        ["STATS_POSITION_HIDE_NORMAL",0],
        ["STATS_POSITION_HIDE_SCOREBOARD",0],
        ["ENABLE_COMBAT_STATUS",0],
        ["COMBAT_STATUS_SCALE",100],
        ["COMBAT_STATUS_X_OFFSET",0],
        ["COMBAT_STATUS_Y_OFFSET",0],
        ["ENABLE_ULT_COOLDOWNS",0],
        ["ULT_COOLDOWN_OPACITY",0.9],
        ["ULT_COOLDOWN_SIZE",13],
        ["ULT_COOLDOWN_X_OFFSET",0],
        ["ULT_COOLDOWN_Y_OFFSET",0],
        ["ENABLE_PASSIVE_COOLDOWN",0],
        ["ENABLE_OLD_ITEM_COOLDOWNS",1],
        ["OLD_ITEM_COOLDOWNS_SCALE",110],
        ["OLD_ITEM_COOLDOWNS_X_OFFSET",0],
        ["OLD_ITEM_COOLDOWNS_Y_OFFSET",30],
        ["PASSIVE_COOLDOWN_SIZE",40],
        ["PASSIVE_COOLDOWN_Y",0],
        ["PASSIVE_COOLDOWN_X",0],
        ["PASSIVE_COOLDOWN_OPACITY",0.5],
        ["ITEM_FILTER_DEF_PASSIVE",1],
        ["ITEM_FILTER_OFF_PASSIVE",1],
        ["ITEM_FILTER_DEF_ACTIVE",0],
        ["ITEM_FILTER_OFF_ACTIVE",0],
        ["VOICE_TYPE",4],
        ["VOICE_VOLUME",100],
        ["ENABLE_COMPASS",0],
        ["ENABLE_SIMPLIFY_COMPASS",0],
        ["ENABLE_COMPASS_SPEED",0],
        ["COMPASS_SPEED_X_OFFSET",0],
        ["COMPASS_SPEED_Y_OFFSET",0],
        ["COMPASS_SCALE",100],
        ["COMPASS_STRETCH_X",100],
        ["COMPASS_STRETCH_Y",100],
        ["COMPASS_X_OFFSET",0],
        ["COMPASS_Y_OFFSET",120],
        ["ENABLE_KEYBOARD_OVERLAY",0],
        ["ENABLE_FULL_KEYBOARD_LAYOUT",0],
        ["KEYBOARD_OVERLAY_THEME",0],
        ["KEYBOARD_OVERLAY_LAYOUT",0],
        ["KEYBOARD_OVERLAY_SCALE",100],
        ["KEYBOARD_OVERLAY_X_OFFSET",0],
        ["KEYBOARD_OVERLAY_Y_OFFSET",0],
        ["KEYBOARD_OVERLAY_WASH_COLOR",0],
        ["ENABLE_MINIMAP_REMINDER",0],
        ["MINIMAP_REMINDER_INTERVAL",15],
        ["ENABLE_DL4D_REMINDERS",0],
        ["DL4D_VOLUME",100],
        ["ENABLE_DL4D_CAPTIONS",1],
        ["ENABLE_DL4D_SMALL_CAMPS_BOXES",1],
        ["ENABLE_DL4D_RUNE_MELEE_TROOPERS",1],
        ["ENABLE_DL4D_MEDIUM_CAMPS",1],
        ["ENABLE_DL4D_BIG_CAMPS_SINNERS",1],
        ["ENABLE_DL4D_MIDBOSS_URN_GOLD_RUNE",1],
        ["ENABLE_DL4D_LANE_GUARDIAN_WEAK",1],
        ["ENABLE_DL4D_RUNE",1],
        ["ENABLE_DL4D_WALKER_WEAK",1],
        ["ENABLE_DL4D_RUNE_FAST_TROOPERS",1],
        ["ENABLE_DL4D_RUNE_GOLD_BUFFS",1],
        ["ENABLE_DL4D_RUNE_TROOPERS20_HP",1],
        ["DISABLE_DAMAGE_REPORT",0],
        ["DAMAGE_REPORT_X_OFFSET",0],
        ["DAMAGE_REPORT_Y_OFFSET",0],
        ["DISABLE_QUICK_BUY",0],
        ["ENABLE_ENHANCED_QUICKBUY",0],
        ["ENHANCED_QUICKBUY_COUNT",3],
        ["ENABLE_QUICKBUY_CLICK_TO_NOTIFY",0],
        ["ENABLE_SHOP_ITEM_NOTIFICATIONS",0],
        ["ENABLE_SHOP_CLICK_TO_NOTIFY",0],
        ["ENABLE_SHOP_RECENT_PURCHASES",0],
        ["RECENT_PURCHASES_QUICK_MAX",3],
        ["RECENT_PURCHASES_QUICK_DISPLAY_SEC",10],
        ["RECENT_PURCHASES_QUICK_X_OFFSET",0],
        ["RECENT_PURCHASES_QUICK_Y_OFFSET",0],
        ["RECENT_PURCHASES_QUICK_REJUV",1],
        ["RECENT_PURCHASES_QUICK_SCOREBOARD",1],
        ["RECENT_PURCHASES_QUICK_OPACITY",1],
        ["RECENT_PURCHASES_QUICK_SCALE",1],
        ["RECENT_PURCHASES_PANEL_X_OFFSET",0],
        ["RECENT_PURCHASES_PANEL_Y_OFFSET",0],
        ["RECENT_PURCHASES_PANEL_OPACITY",1],
        ["RECENT_PURCHASES_PANEL_SCALE",1],
        ["ENABLE_HERO_PURCHASE_POPUPS",0],
        ["ENABLE_SHOW_BUILD_ID",0],
        ["ENABLE_SHOW_BUILD_ID_TITLE",0],
        ["ENABLE_MINIMALISTIC_PAUSE",0],
        ["ENABLE_HUD_SHIFT",0],
        ["ENABLE_LANE_WITH_PARTY",0],
        ["SUPPORT_16_10",0],
        ["SUPPORT_4_3",0],
        ["ENABLE_UNSPENT_SOULS",0],
        ["UNSECURED_SOULS_HUD_SCALE",120],
        ["UNSECURED_SOULS_HUD_X_OFFSET",120],
        ["UNSECURED_SOULS_HUD_Y_OFFSET",925],
        ["ENABLE_BETTER_UNSECURED",0],
        ["ENABLE_BETTER_UNSECURED_SHOW_ICON_TEXT",0],
        ["ENABLE_BETTER_UNSECURED_SHOW_ICON",0],
        ["ENABLE_BETTER_UNSECURED_SHOW_TEXT",1],
        ["ENABLE_MIN_SOULS",0],
        ["ENABLE_OBJ_DMG",0],
        ["ENABLE_OBJ_MAP",0],
        ["ENABLE_URN_DIFF",0],
        ["ENABLE_URN_TIMER",0],
        ["ENABLE_MISSING_HERO",0],
        ["ENABLE_NICKNAMES",0],
        ["HUD_TOP_BAR_ENABLED",1],
        ["DISABLE_PLAYER_NAME_BLUR",0],
        ["TOP_BAR_OPACITY",1],
        ["TOP_BAR_SCALE",1],
        ["TOP_BAR_X_OFFSET",0],
        ["TOP_BAR_Y_OFFSET",0],
        ["ENABLE_CUMULATIVE_DMG",1],
        ["ENABLE_CLEAN_DAMAGE_INDICATORS",0],
        ["ENABLE_DAMAGE_FOUNTAIN",0],
        ["DAMAGE_FOUNTAIN_SIZE",1],
        ["ENABLE_HIDE_SMALL_NUMBERS",0],
        ["ENABLE_HIDE_TROOPER_DAMAGE",0],
        ["ENABLE_DAMAGE_IMPACT",1],
        ["DAMAGE_IMPACT_SCALE",1],
        ["DAMAGE_IMPACT_OPACITY",1],
        ["DAMAGE_IMPACT_X_OFFSET",0],
        ["DAMAGE_IMPACT_Y_OFFSET",0],
        ["ENABLE_GAME_AUDIO",1],
        ["GAME_DEFAULT_DIFFICULTY",1],
        ["ENABLE_BHOP",0],
        ["ENABLE_ON_DEATH_GAMES",0],
        ["ON_DEATH_GAME_MINESWEEPER",0],
        ["ON_DEATH_GAME_BLACKJACK",0],
        ["ON_DEATH_GAME_FLAPPY_BAT",0],
        ["ON_DEATH_GAME_GRAVES_TRAINER",0],
        ["ON_DEATH_GAME_ZERGGY_MANIA",0],
        ["ON_DEATH_GAME_WHACK_A_REM",0],
        ["ENABLE_SHOP_STATS",0],
        ["ENABLE_SIMPLIFY_SHOP_STATS",0],
        ["HUD_SHOP_ENABLED",1],
        ["DISABLE_SHOP_BLUE",0],
        ["SHOP_OFFSET_X",0],
        ["SHOP_OFFSET_Y",0],
        ["SHOP_OPACITY",1],
        ["SHOP_SCALE",1],
        ["ENABLE_SIMPLIFY_SHOP",0],
        ["HUD_ITEMS_ENABLED",1],
        ["ITEMS_OPACITY",1],
        ["ITEMS_X_OFFSET",0],
        ["ITEMS_Y_OFFSET",0],
        ["ITEMS_WASH_COLOR",0],
        ["ENABLE_SIMPLIFY_ITEMS",0],
        ["DAMAGE_NUMBER_OPACITY",1],
        ["ENABLE_ZIP_BOOST",0],
        ["ZIP_BOOST_SCALE",100],
        ["ZIP_BOOST_X_OFFSET",0],
        ["ZIP_BOOST_Y_OFFSET",0],
        ["ENABLE_UNSECURED_SOUL_TIMER",0],
        ["UNSECURED_SOUL_TIMER_SCALE",100],
        ["UNSECURED_SOUL_TIMER_X_OFFSET",-850],
        ["UNSECURED_SOUL_TIMER_Y_OFFSET",40],
        ["ENABLE_STAT_BONUSES",0],
        ["STAT_BONUSES_SCALE",100],
        ["STAT_BONUSES_X_OFFSET",0],
        ["STAT_BONUSES_Y_OFFSET",0],
        ["ENABLE_CLEAN_STACKS",0],
        ["ENABLE_CENTER_ESC",0],
        ["ENABLE_CENTER_FRIENDS_LIST",0],
        ["ENABLE_LEGACY_COOLDOWNS",0],
        ["ENABLE_STATLOCKER",0],
        ["ENABLE_CHAT",1],
        ["ENABLE_IMAGES_IN_CHAT",0],
        ["CHAT_SCALE",100],
        ["CHAT_X_OFFSET",0],
        ["CHAT_Y_OFFSET",0],
        ["ENABLE_FORCE_TESTING_TOOLS",0],
        ["ENABLE_HIDE_TESTING_TOOLS",0],
        ["HUD_INDICATOR_SIZE",18],
        ["ENABLE_RED_DIAMOND",0],
        ["ENABLE_IMPROVED_HINT",0],
        ["STAMINA_CHARGE_ANGLE",45],
        ["STAMINA_CHARGE_COLOR",0],
        ["UNIT_TARGET_SIZE",150],
        ["UNIT_TARGET_OPACITY",1],
        ["UNIT_TARGET_HINT_SIZE",100],
        ["ENABLE_HERO_SCENE_PANEL",1],
        ["HUD_BOTTOM_BAR_ENABLED",1],
        ["ENABLE_HIDE_FAILED_HINT",0],
        ["ENABLE_HIDE_ABILITY_SUGGESTION",0],
        ["ENABLE_HIDE_COSMETIC_ABILITY",0],
        ["BOTTOM_BAR_OPACITY",1],
        ["BOTTOM_BAR_SCALE",1],
        ["BOTTOM_BAR_X_OFFSET",0],
        ["BOTTOM_BAR_Y_OFFSET",0],
        ["BOTTOM_BAR_WASH_COLOR",0],
        ["ACTIVE_ITEMS_SCALE",100],
        ["ACTIVE_ITEMS_X_OFFSET",0],
        ["ACTIVE_ITEMS_Y_OFFSET",0],
        ["HUD_SOULS_ENABLED",1],
        ["SOULS_OPACITY",1],
        ["SOULS_X_OFFSET",0],
        ["SOULS_Y_OFFSET",0],
        ["ENABLE_SIMPLIFY_ABILITY_ICONS",0],
        ["ENABLE_HIDE_BEHAVIOR_SUMMARY",0],
        ["ENABLE_BUFF_HUD",0],
        ["ENABLE_REJUV_HUD",0],
        ["ENABLE_COMBAT_INDICATOR",0],
        ["ENABLE_COLORED_HEALTHBAR",0],
        ["ENABLE_COLOR_WARNING_25",0],
        ["ENABLE_COLOR_WARNING_65",0],
        ["ENABLE_COLOR_WARNING_75",0],
        ["ENABLE_ENEMY_COLORED_HEALTHBAR",0],
        ["ENABLE_ENEMY_COLOR_WARNING_25",0],
        ["ENABLE_ENEMY_COLOR_WARNING_65",0],
        ["ENABLE_ENEMY_COLOR_WARNING_75",0],
        ["ENABLE_ALLY_COLORED_HEALTHBAR",0],
        ["ENABLE_ALLY_COLOR_WARNING_25",0],
        ["ENABLE_ALLY_COLOR_WARNING_65",0],
        ["ENABLE_ALLY_COLOR_WARNING_75",0],
        ["ENABLE_TOPBAR_ENEMY_HP_WARNING",0],
        ["ENABLE_TOPBAR_ENEMY_HP_WARNING_25",0],
        ["ENABLE_TOPBAR_ENEMY_HP_WARNING_65",0],
        ["ENABLE_TOPBAR_ENEMY_HP_WARNING_75",0],
        ["ENABLE_TOPBAR_ALLY_HP_WARNING",0],
        ["ENABLE_TOPBAR_ALLY_HP_WARNING_25",0],
        ["ENABLE_TOPBAR_ALLY_HP_WARNING_65",0],
        ["ENABLE_TOPBAR_ALLY_HP_WARNING_75",0],
        ["ENABLE_FG_HEALTHBAR",0],
        ["ENABLE_MINIMALIST_HEALTHBAR",0],
        ["HEALTHBAR_TYPE",0],
        ["ENABLE_MINECRAFT_HEALTH_NUMBERS",0],
        ["PLAYER_HEALTHBAR_SCALE",100],
        ["PLAYER_HEALTHBAR_OPACITY",1],
        ["PLAYER_HEALTHBAR_X_OFFSET",0],
        ["PLAYER_HEALTHBAR_Y_OFFSET",0],
        ["PLAYER_HEALTHBAR_ACCENT_COLOR",0],
        ["ENABLE_ENEMY_V2_ENHANCED",0],
        ["ENABLE_ENEMY_V2_ULT_INDICATOR",1],
        ["ENABLE_ENEMY_V2_LEVEL",1],
        ["ENABLE_ENEMY_ULT_INDICATOR",0],
        ["MINIMALIST_HEALTHBAR_X_OFFSET",0],
        ["MINIMALIST_HEALTHBAR_Y_OFFSET",0],
        ["ENABLE_PERF_DEBUG",0],
        ["ENABLE_PERF_DEBUG_DETAIL",0],
        ["ENABLE_PERF_OVERLAY",0],
        ["PERF_ALERT_THRESHOLD_MS",10],
        ["PERF_OVERLAY_OPACITY",0.75],
        ["ENABLE_SPECIALS",0],
        ["LANGUAGE",0],
        ["DEFAULT_HERO","hero_werewolf"],
        ["DRAG_ENABLED",1],
        ["PREVIEWS_ENABLED",1],
        ["ACTIVE_PRESET_NAME",""],
        ["ENABLE_UPDATE_CHECKER",1],
        ["SOULS_HIDE_NORMAL",0],
        ["SOULS_HIDE_SCOREBOARD",0],
        ["ITEMS_HIDE_NORMAL",0],
        ["ITEMS_HIDE_SCOREBOARD",0],
        ["TOP_BAR_HIDE_NORMAL",0],
        ["TOP_BAR_HIDE_SCOREBOARD",0],
        ["BOTTOM_BAR_HIDE_NORMAL",0],
        ["BOTTOM_BAR_HIDE_SCOREBOARD",0],
        ["ACTIVE_ITEMS_HIDE_NORMAL",0],
        ["ACTIVE_ITEMS_HIDE_SCOREBOARD",0],
        ["AP_HIDE_NORMAL",0],
        ["AP_HIDE_SCOREBOARD",0],
        ["AMMO_HUD_HIDE_NORMAL",0],
        ["AMMO_HUD_HIDE_SCOREBOARD",0],
        ["STAMINA_HIDE_NORMAL",0],
        ["STAMINA_HIDE_SCOREBOARD",0],
        ["CROSSHAIR_STATS_HIDE_NORMAL",0],
        ["CROSSHAIR_STATS_HIDE_SCOREBOARD",0],
        ["COMPASS_HIDE_NORMAL",0],
        ["COMPASS_HIDE_SCOREBOARD",0],
        ["COMPASS_SPEED_HIDE_NORMAL",0],
        ["COMPASS_SPEED_HIDE_SCOREBOARD",0],
        ["ZIP_BOOST_HIDE_NORMAL",0],
        ["ZIP_BOOST_HIDE_SCOREBOARD",0],
        ["STAT_BONUSES_HIDE_NORMAL",0],
        ["STAT_BONUSES_HIDE_SCOREBOARD",0],
        ["COMBAT_STATUS_HIDE_NORMAL",0],
        ["COMBAT_STATUS_HIDE_SCOREBOARD",0],
        ["UNSECURED_SOUL_TIMER_HIDE_NORMAL",0],
        ["UNSECURED_SOUL_TIMER_HIDE_SCOREBOARD",0],
        ["UNSECURED_SOULS_HUD_HIDE_NORMAL",0],
        ["UNSECURED_SOULS_HUD_HIDE_SCOREBOARD",0],
        ["KEYBOARD_OVERLAY_HIDE_NORMAL",0],
        ["KEYBOARD_OVERLAY_HIDE_SCOREBOARD",0],
        ["RELOAD_COOLDOWN_HIDE_NORMAL",0],
        ["RELOAD_COOLDOWN_HIDE_SCOREBOARD",0],
        ["PASSIVE_COOLDOWN_HIDE_NORMAL",0],
        ["PASSIVE_COOLDOWN_HIDE_SCOREBOARD",0],
        ["MINIMAP_HIDE_NORMAL",0],
        ["MINIMAP_HIDE_SCOREBOARD",0],
        ["SHOP_HIDE_NORMAL",0],
        ["SHOP_HIDE_SCOREBOARD",0],
        ["RECENT_PURCHASES_PANEL_HIDE_NORMAL",0],
        ["RECENT_PURCHASES_PANEL_HIDE_SCOREBOARD",0],
        ["RECENT_PURCHASES_QUICK_HIDE_NORMAL",0],
        ["RECENT_PURCHASES_QUICK_HIDE_SCOREBOARD",0],
        ["PLAYER_HEALTHBAR_HIDE_NORMAL",0],
        ["PLAYER_HEALTHBAR_HIDE_SCOREBOARD",0],
        ["DAMAGE_IMPACT_HIDE_NORMAL",0],
        ["DAMAGE_IMPACT_HIDE_SCOREBOARD",0],
        ["DAMAGE_REPORT_HIDE_NORMAL",0],
        ["DAMAGE_REPORT_HIDE_SCOREBOARD",0],
        ["CHAT_HIDE_NORMAL",0],
        ["CHAT_HIDE_SCOREBOARD",0],
        ["MINIMAP_MID_BOSS_X_OFFSET",0],
        ["MINIMAP_MID_BOSS_Y_OFFSET",0],
        ["MINIMAP_MID_BOSS_SCALE",100],
        ["MINIMAP_MID_BOSS_OPACITY",1],
        ["MINIMAP_BUFF_X_OFFSET",0],
        ["MINIMAP_BUFF_Y_OFFSET",0],
        ["MINIMAP_BUFF_SCALE",100],
        ["MINIMAP_BUFF_OPACITY",1],
        ["MINIMAP_BRIDGE_LEFT_X_OFFSET",0],
        ["MINIMAP_BRIDGE_LEFT_Y_OFFSET",0],
        ["MINIMAP_BRIDGE_LEFT_SCALE",100],
        ["MINIMAP_BRIDGE_LEFT_OPACITY",1],
        ["MINIMAP_BRIDGE_RIGHT_X_OFFSET",0],
        ["MINIMAP_BRIDGE_RIGHT_Y_OFFSET",0],
        ["MINIMAP_BRIDGE_RIGHT_SCALE",100],
        ["MINIMAP_BRIDGE_RIGHT_OPACITY",1],
        ["ENABLE_MINIMAP_TOUGH_CRATES",0],
        ["ENABLE_MINIMAP_HEALING_SNACKS",0],
        ["ENABLE_MINIMAP_STATUES",0],
        ["ENABLE_MINIMAP_CRATE_ROUTES",0],
        ["MINIMAP_CAMP_NAMES",0],
        ["MINIMAP_LOOT_MARKER_SCALE",100],
        ["MINIMAP_LOOT_OPACITY",1],
        ["MINIMAP_ROUTE_SCALE",100],
        ["MINIMAP_ROUTE_FROM_MINUTE",3],
        ["MINIMAP_ROUTE_UNTIL_MINUTE",10],
        ["MINIMAP_CRATE_FROM_MINUTE",0],
        ["MINIMAP_CRATE_UNTIL_MINUTE",90],
        ["STATS_LIST_X_OFFSET",0],
        ["STATS_LIST_Y_OFFSET",0],
        ["STATS_LIST_SCALE",100],
        ["STATS_LIST_OPACITY",1],
        ["AMMO_CURRENT_FONT_STYLE",0],
        ["AMMO_TOTAL_FONT_STYLE",0],
        ["ENABLE_BETTER_DISABLED_ABILITIES",0],
        ["ENABLE_CUSTOM_HITMARKER",0],
        ["ENABLE_CUSTOM_HITMARKER_SHADOW",0],
        ["ENABLE_CUSTOM_HITMARKER_HIDE_GLOW",0],
        ["CUSTOM_HITMARKER_SIZE",20],
        ["CUSTOM_HITMARKER_CRIT_SIZE",20],
        ["CUSTOM_HITMARKER_THICKNESS",2],
        ["CUSTOM_HITMARKER_OFFSET",40],
        ["CUSTOM_HITMARKER_COLOR",0],
        ["CUSTOM_HITMARKER_CRIT_COLOR",0],
        ["AUTO_SAVE_CHANGES",0],
        ["ENABLE_MINIMAP_LOCATION",1],
        ["MINIMAP_LOCATION_X_OFFSET",0],
        ["MINIMAP_LOCATION_Y_OFFSET",0],
        ["QUICKBUY_X_OFFSET",0],
        ["QUICKBUY_Y_OFFSET",0],
        ["MINIMAP_LOCATION_SCALE",100],
        ["QUICKBUY_SCALE",100]
    ].map(entry => Object.freeze(entry));
    Object.freeze(dictionary);
    const keys = new Set(dictionary.map(entry => entry[0]));
    const MAX_BYTES = 700000;
    const unsupported = () => {
        const error = new Error("Unsupported settings code");
        error.code = "unsupported-settings-code";
        throw error;
    };
    const invalid = () => { throw new Error("Invalid settings code"); };
    const updateCrc = (crc, byte) => {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
        return crc;
    };
    const checksum = bytes => {
        let crc = -1;
        for (const byte of bytes) crc = updateCrc(crc, byte);
        return (crc ^ -1) >>> 0;
    };
    // Prefix identities let newer readers retain every older dictionary without
    // copying entire bases for each release. CRC is integrity, not authentication.
    const signatures = [];
    let catalogCrc = -1;
    for (const entry of dictionary) {
        for (const char of JSON.stringify(entry) + "\n") catalogCrc = updateCrc(catalogCrc, char.charCodeAt(0));
        signatures.push((catalogCrc ^ -1) >>> 0);
    }
    const writeUint32 = (bytes, value) => {
        for (let shift = 0; shift < 32; shift += 8) bytes.push((value >>> shift) & 255);
    };
    const writeVarint = (bytes, value) => {
        if (!Number.isSafeInteger(value) || value < 0) invalid();
        do {
            const byte = value % 128;
            value = Math.floor(value / 128);
            bytes.push(byte + (value ? 128 : 0));
        } while (value);
    };
    const writeText = (bytes, value) => {
        if (value.length > MAX_BYTES) invalid();
        writeVarint(bytes, value.length);
        // Code units preserve all JSON strings, including unpaired surrogates,
        // without requiring TextEncoder, typed arrays or browser globals.
        for (let i = 0; i < value.length; i++) writeVarint(bytes, value.charCodeAt(i));
    };
    const isPayload = raw => String(raw).charAt(0) === "Q";
    const serialize = config => {
        for (const key of Object.keys(QOL_DEFAULT_CONFIG)) if (!keys.has(key)) unsupported();
        const canonical = JSON.parse(QOL_CODEC.SerializeSettings(config)).data;
        const changes = dictionary.flatMap(([key, reference], id) =>
            Object.prototype.hasOwnProperty.call(canonical, key) && canonical[key] !== reference ? [id] : []);
        const bytes = [81, 1]; // Separate from every historical compact wire byte.
        writeVarint(bytes, dictionary.length);
        writeUint32(bytes, signatures[dictionary.length - 1]);
        writeVarint(bytes, changes.length);
        let previous = -1;
        for (const id of changes) {
            const [key, reference] = dictionary[id];
            const value = canonical[key];
            if (typeof value !== typeof reference) invalid();
            const delta = value - reference;
            const flip = (value === 0 || value === 1) && (reference === 0 || reference === 1);
            const integer = Number.isSafeInteger(value) && Number.isSafeInteger(reference) &&
                Number.isSafeInteger(delta) && Math.abs(delta) <= Math.floor(Number.MAX_SAFE_INTEGER / 2);
            const tag = flip ? 0 : integer ? 1 : typeof value === "number" ? 2 : 3;
            writeVarint(bytes, (id - previous - 1) * 4 + tag);
            previous = id;
            if (tag === 1) writeVarint(bytes, delta >= 0 ? delta * 2 : -delta * 2 - 1);
            if (tag === 2 || tag === 3) writeText(bytes, String(value));
            if (bytes.length > MAX_BYTES - 4) invalid();
        }
        writeUint32(bytes, checksum(bytes));
        return bytes.map(byte => String.fromCharCode(byte)).join("");
    };
    const deserialize = raw => {
        if (typeof raw !== "string" || raw.length < 12 || raw.length > MAX_BYTES) invalid();
        const bytes = [];
        for (let i = 0; i < raw.length; i++) {
            const byte = raw.charCodeAt(i);
            if (byte > 255) invalid();
            bytes.push(byte);
        }
        const end = bytes.length - 4;
        const uint32At = at => (bytes[at] | bytes[at + 1] << 8 | bytes[at + 2] << 16 | bytes[at + 3] << 24) >>> 0;
        if (uint32At(end) !== checksum(bytes.slice(0, end))) invalid();
        if (bytes[0] !== 81 || bytes[1] !== 1) unsupported();
        let position = 2;
        const readVarint = () => {
            let value = 0, factor = 1;
            for (let i = 0; i < 8; i++) {
                if (position >= end) invalid();
                const byte = bytes[position++];
                value += (byte & 127) * factor;
                if (!Number.isSafeInteger(value)) invalid();
                if (byte < 128) {
                    if (i && byte === 0) invalid();
                    return value;
                }
                factor *= 128;
            }
            return invalid();
        };
        const readText = () => {
            const length = readVarint();
            if (length > end - position) invalid();
            let value = "";
            for (let i = 0; i < length; i++) {
                const code = readVarint();
                if (code > 65535) invalid();
                value += String.fromCharCode(code);
            }
            return value;
        };
        const count = readVarint();
        if (!count || count > dictionary.length) unsupported();
        if (position + 4 > end) invalid();
        if (uint32At(position) !== signatures[count - 1]) unsupported();
        position += 4;
        const changes = readVarint();
        if (changes > count) invalid();
        const config = Object.fromEntries(dictionary.slice(0, count));
        let previous = -1;
        for (let i = 0; i < changes; i++) {
            const record = readVarint();
            const tag = record % 4;
            const id = previous + 1 + Math.floor(record / 4);
            if (id >= count) invalid();
            previous = id;
            const [key, reference] = dictionary[id];
            let value;
            if (tag === 0) {
                if (reference !== 0 && reference !== 1) invalid();
                value = 1 - reference;
            } else if (tag === 1) {
                const encoded = readVarint();
                const delta = encoded % 2 ? -(encoded + 1) / 2 : encoded / 2;
                value = reference + delta;
                if (!Number.isSafeInteger(reference) || !Number.isSafeInteger(value)) invalid();
            } else {
                const text = readText();
                value = tag === 2 ? Number(text) : text;
                if (tag === 2 && (!Number.isFinite(value) || String(value) !== text)) invalid();
            }
            if (typeof value !== typeof reference || value === reference) invalid();
            config[key] = value;
        }
        if (position !== end) invalid();
        return config;
    };
    Q.settingsCode = Object.freeze({ serialize, deserialize, isPayload });
    QOL_CODEC.SerializeSettingsCode = serialize;
    const readSettings = QOL_CODEC.DeserializeSettings;
    QOL_CODEC.DeserializeSettings = (raw, version) => isPayload(raw)
        ? QOL_CODEC.ReadSettingsEnvelope(WrapConfigForStorage(deserialize(raw)))
        : readSettings(raw, version);
})();

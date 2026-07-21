"use strict";

// QOL_DEFAULT_CONFIG always available — ql_shared_presets.js loads first in settings context
var MOD_CONFIG = Object.assign({}, QOL_DEFAULT_CONFIG);

// Phase 0.2: Publish config accessor for extracted modules.
// Extracted files call QOL.getSettingsConfig() at use time (not load time)
// to ensure they always see the current config. Read-only from their perspective.
QOL.getSettingsConfig = function() { return MOD_CONFIG; };

// ── SafeLog stubs for settings context (QOL_UTILS loaded via ql_shared_presets.js) ──
var _QOLU = (typeof QOL_UTILS !== "undefined") ? QOL_UTILS : null;
var SafeLog = (_QOLU && _QOLU.SafeLog) ? _QOLU.SafeLog : function(fn, label) { try { return fn(); } catch(e) { return null; } };
var SafeGetAttribute = (_QOLU && _QOLU.SafeGetAttribute) ? _QOLU.SafeGetAttribute : function(p, a, d) { try { return String((p && p.GetAttributeString) ? p.GetAttributeString(a, d || "") : d || ""); } catch(e) { return d || ""; } };
var SafeSetAttribute = (_QOLU && _QOLU.SafeSetAttribute) ? _QOLU.SafeSetAttribute : function(p, a, v) { try { if (p && p.SetAttributeString) { p.SetAttributeString(a, String(v != null ? v : "")); return true; } } catch(e) { WarnLog("settings", "op failed: " + (e && e.message ? e.message : String(e || ""))); } return false; };
var WarnLog = (_QOLU && _QOLU.WarnLog) ? _QOLU.WarnLog : function(cat, msg) { $.Msg("[QOLLock][WARN][" + cat + "] " + msg); };
const DEFAULT_CONFIG = QOL_DEFAULT_CONFIG;


const HITMARKERS_RUNTIME_OPTIONS = [
    { label: "Off", command: "citadel_crosshair_hit_marker_duration 0.000000" },
    { label: "On", command: "citadel_crosshair_hit_marker_duration 0.100000" }
];
const AUDIO_BEEP_TEST_RUNTIME_OPTIONS = [
    { label: ".5", soundEvent: "BuffReminder.Test0_5" },
    { label: "1", soundEvent: "BuffReminder.Test1" },
    { label: "5", soundEvent: "BuffReminder.Test5" },
    { label: "8", soundEvent: "BuffReminder.Test8" },
    { label: "12", soundEvent: "BuffReminder.Test12" },
    { label: "16", soundEvent: "BuffReminder.Test16" },
    { label: "30", soundEvent: "BuffReminder.Test30" },
    { label: "50", soundEvent: "BuffReminder.Test50" },
    { label: "100", soundEvent: "BuffReminder.Test100" }
];
const SHOW_MEMORY_RUNTIME_OPTIONS = [
    { label: "Off", command: "cl_showmem 0" },
    { label: "On", command: "cl_showmem 1" }
];
const SHOW_POSITION_RUNTIME_OPTIONS = [
    { label: "Off", command: "cl_showpos 0" },
    { label: "On", command: "cl_showpos 1" }
];
const SHOW_TICK_RUNTIME_OPTIONS = [
    { label: "Off", command: "cl_showtick 0" },
    { label: "On", command: "cl_showtick 1" }
];
const SHOW_FPS_RUNTIME_OPTIONS = [
    { label: "Off", command: "cl_showfps 0" },
    { label: "On", command: "cl_showfps 1" }
];
const SHOW_FRAME_RUNTIME_OPTIONS = [
    { label: "Off", command: "cl_showframenumber false" },
    { label: "On", command: "cl_showframenumber true" }
];
const RUNTIME_BUTTON_GROUP_DEFAULT_INDEX = {
    HITMARKERS_RUNTIME: 1,
    AUDIO_BEEP_TEST_RUNTIME: 1
};

// ---- Slider shape definitions ----
// Canonical (min, max, step) triples for all sliders in the settings UI.
// 99 sliders collapsed into 36 unique shapes. Add new shapes here when
// adding sliders — never inline raw numbers in CreateRow("slider",...).
var SLIDER_SHAPES = {
    // Opacity: 0–100% in 5% steps
    opacity:            { min: 0,   max: 1,    step: 0.05 },
    opacity_perf:       { min: 0.3, max: 1,    step: 0.05 },

    // Scale: multiplicative factors in 0.05 steps
    scale_0_5_1_5:      { min: 0.5, max: 1.5,  step: 0.05 },
    scale_0_5_2_0:      { min: 0.5, max: 2.0,  step: 0.05 },

    // Size: pixel values with 1px step
    size_10_60:         { min: 10,  max: 60,   step: 1 },
    size_16_60:         { min: 16,  max: 60,   step: 1 },
    size_30_60:         { min: 30,  max: 60,   step: 1 },
    size_50_200:        { min: 50,  max: 200,  step: 1 },
    size_70_150:        { min: 70,  max: 150,  step: 1 },
    size_100_300:       { min: 100, max: 300,  step: 1 },

    // Size: wider step increments
    size_50_200_s5:     { min: 50,  max: 200,  step: 5 },
    size_50_300_s5:     { min: 50,  max: 300,  step: 5 },
    size_200_1000_s5:   { min: 200, max: 1000, step: 5 },
    size_400_1200_s10:  { min: 400, max: 1200, step: 10 },

    // Offset: position sliders
    offset_n75_75:      { min: -75,  max: 75,   step: 1 },
    offset_n50_50:      { min: -50,  max: 50,   step: 1 },
    offset_n200_200:    { min: -200, max: 200,  step: 5 },
    offset_n500_500:    { min: -500, max: 500,  step: 5 },
    offset_n1000_1000:  { min: -1000,max: 1000, step: 5 },
    offset_n1500_1500:  { min: -1500,max: 1500, step: 5 },
    offset_n2000_2000:  { min: -2000,max: 2000, step: 5 },
    offset_n1500_200:   { min: -1500,max: 200,  step: 5 },
    offset_n1000_300:   { min: -1000,max: 300,  step: 5 },
    offset_n1000_2000:  { min: -1000,max: 2000, step: 5 },
    offset_n400_1000:   { min: -400, max: 1000, step: 5 },
    offset_n250_800:    { min: -250, max: 800,  step: 5 },
    offset_n100_1000:   { min: -100, max: 1000, step: 5 },
    offset_0_1000:      { min: 0,    max: 1000, step: 5 },
    offset_800_2000:    { min: 800,  max: 2000, step: 5 },

    // Count: small integers
    count_1_5:          { min: 1,   max: 5,    step: 1 },

    // Time: seconds
    sec_0_60:           { min: 0,   max: 60,   step: 1 },
    sec_3_15:           { min: 3,   max: 15,   step: 1 },
    sec_5_60:           { min: 5,   max: 60,   step: 1 },

    // Volume: 0–100%
    volume_0_100:       { min: 0,   max: 100,  step: 1 },

    // Angle: degrees
    angle_0_360:        { min: 0,   max: 360,  step: 1 },

    // Performance alert threshold: ms
    alert_ms_1_50:      { min: 1,   max: 50,   step: 1 }
};

// Creates a slider row using a named shape from SLIDER_SHAPES.
// Delegates to CreateRow with the expanded (min, max, step).
// Set isAngle=true for the angle_slider type.
function CreateSliderRow(parent, label, configId, shapeKey, description, isAngle) {
    var shape = SLIDER_SHAPES[shapeKey];
    if (!shape) {
        $.Msg("[QOLLock] ERROR: missing slider shape '" + shapeKey + "' for " + configId);
        return CreateRow(parent, label, configId, "slider", 0, 1, 0.05, null, description || null);
    }
    var type = isAngle ? "angle_slider" : "slider";
    return CreateRow(parent, label, configId, type, shape.min, shape.max, shape.step, null, description || null);
}

const PERF_IMPACT_TIER_NONE = "none";
const PERF_IMPACT_TIER_LOW = "low";
const PERF_IMPACT_TIER_MEDIUM = "medium";
const PERF_IMPACT_TIER_HIGH = "high";
const PERF_IMPACT_TIER_ORDER = {
    none: 0,
    low: 1,
    medium: 2,
    high: 3
};
const PERF_IMPACT_LABEL_BY_TIER = {
    none: "None",
    low: "Low",
    medium: "Medium",
    high: "High"
};
const SETTING_CREATED_BY_BY_CONFIG = {
    ENABLE_PASSIVE_COOLDOWN: "Hanturaya",
    OPEN_OLD_ITEM_FILTERS_DOWNLOAD: "Hanturaya",
    ENABLE_CUMULATIVE_DMG: "wouwei",
    ENABLE_CLEAN_DAMAGE_INDICATORS: "Lustie",
    ENABLE_HIDE_TROOPER_DAMAGE: "ninjabladejr",
    ENABLE_DAMAGE_FOUNTAIN: "ArkanoidVFX",
    ENABLE_AMMO_STATUS: "mikoboy",
    ENABLE_RED_DIAMOND: "Hanturaya",
    ENABLE_OBJ_MAP: "bonclide",
    ENABLE_REJUV_HUD: "BreadRollius",
    ENABLE_BUFF_HUD: "BreadRollius",
    ENABLE_URN_DIFF: "BreadRollius, bytenode",
    ENABLE_URN_TIMER: "bytenode",
    ENABLE_MISSING_HERO: "bonclide",
    ENABLE_NICKNAMES: "Predi",
    ENABLE_LEGACY_COOLDOWNS: "Predi",
    ENABLE_OBJ_DMG: "Waltee",
    ENABLE_SHOP_STATS: "Goblin Man Sam",
    ENABLE_QUICKBUY_CLICK_TO_NOTIFY: "Hanturaya",
    ENABLE_SHOP_ITEM_NOTIFICATIONS: "Hanturaya",
    ENABLE_SHOP_RECENT_PURCHASES: "Hanturaya, bytenode",
    RECENT_PURCHASES_QUICK_MAX: "bytenode",
    RECENT_PURCHASES_QUICK_DISPLAY_SEC: "bytenode",
    RECENT_PURCHASES_QUICK_OPACITY: "bytenode",
    RECENT_PURCHASES_PANEL_OPACITY: "bytenode",
    ENABLE_SHOW_BUILD_ID: "0xluc4s",
    ENABLE_SHOW_BUILD_ID_TITLE: "0xluc4s",
    ENABLE_MINIMALISTIC_PAUSE: "Predi",
    ENABLE_DL4D_REMINDERS: "oGeorge",
    DL4D_VOLUME: "oGeorge",
    ENABLE_DL4D_CAPTIONS: "oGeorge",
    ENABLE_DL4D_SMALL_CAMPS_BOXES: "oGeorge",
    ENABLE_DL4D_RUNE_MELEE_TROOPERS: "oGeorge",
    ENABLE_DL4D_MEDIUM_CAMPS: "oGeorge",
    ENABLE_DL4D_BIG_CAMPS_SINNERS: "oGeorge",
    ENABLE_DL4D_MIDBOSS_URN_GOLD_RUNE: "oGeorge",
    ENABLE_DL4D_LANE_GUARDIAN_WEAK: "oGeorge",
    ENABLE_DL4D_RUNE: "oGeorge",
    ENABLE_DL4D_WALKER_WEAK: "oGeorge",
    ENABLE_DL4D_RUNE_FAST_TROOPERS: "oGeorge",
    ENABLE_DL4D_RUNE_GOLD_BUFFS: "oGeorge",
    ENABLE_DL4D_RUNE_TROOPERS20_HP: "oGeorge",
    SUPPORT_16_10: "Karma",
    SUPPORT_4_3: "Gyzeh",
    ENABLE_COMBAT_INDICATOR: "Goblin Man Sam",
    ENABLE_COLORED_HEALTHBAR: "Hanturaya",
    ENABLE_TOPBAR_ENEMY_HP_WARNING: "Hanturaya",
    ENABLE_TOPBAR_ALLY_HP_WARNING: "Hanturaya",
    HEALTHBAR_TYPE: "bytenode, somarotsaway, EmilyVasquez, Klutzz",
    PLAYER_HEALTHBAR_SCALE: "Civo",
    PLAYER_HEALTHBAR_OPACITY: "Civo",
    PLAYER_HEALTHBAR_X_OFFSET: "Civo",
    PLAYER_HEALTHBAR_Y_OFFSET: "Civo",
    ENABLE_CLEAN_STACKS: "bytenode",
    ZIP_BOOST_SCALE: "BreadRollius",
    ZIP_BOOST_X_OFFSET: "BreadRollius",
    ZIP_BOOST_Y_OFFSET: "BreadRollius",
    UNSECURED_SOUL_TIMER_SCALE: "Hanturaya",
    UNSECURED_SOUL_TIMER_X_OFFSET: "Hanturaya",
    UNSECURED_SOUL_TIMER_Y_OFFSET: "Hanturaya",
    ENABLE_FULL_KEYBOARD_LAYOUT: "Fascilux",
    KEYBOARD_OVERLAY_SCALE: "Fascilux",
    KEYBOARD_OVERLAY_X_OFFSET: "Fascilux",
    KEYBOARD_OVERLAY_Y_OFFSET: "Fascilux",
    MINIMAL_MINIMAP: "Lightbringer",
    ENABLE_MINIMAP_BUFF_TIMER: "BreadRollius",
    ENABLE_MINIMAP_REJUV_TIMER: "BreadRollius",
    ENABLE_MINIMAP_CRATE_OVERLAY: "gfkm",
    ENABLE_MINIMAP_REM_TUNNELS: "oGeorge",
    ENABLE_ALT_ZOOM_REM_TUNNELS: "oGeorge",
    ENABLE_TAB_ZOOM_REM_TUNNELS: "oGeorge",
    ENABLE_MINIMAP_ELEVATION_MARKERS: "Lightbringer",
    ENABLE_ENHANCED_QUICKBUY: "Aminsx",
    ENHANCED_QUICKBUY_COUNT: "Aminsx",
    ENABLE_URN_COLORS: "Civo"
};
const SETTING_CREATED_BY_BY_LABEL = {
};
const SECTION_CREATED_BY_BY_TITLE = {
    "Active Stats": "Predi",
    "Player Stats": "Predi"
};
const SETTING_DESCRIPTION_OVERRIDE_BY_CONFIG = {
    "ALT_ZOOM_DRAW_OVER_UI": "Draws the minimap over all other UI elements for improved visibility.",
    "BRIDGE_BUFF_START": "Time before the announcement happens in seconds.",
    "DISABLE_PLAYER_NAME_BLUR": "The world blur behind player names in the top bar.",
    "DISABLE_QUICK_BUY": "The item buying auto queue system in the shop menu.",
    "ENABLE_ENHANCED_QUICKBUY": "Replaces quickbuy with the Enhanced Quickbuy standalone layout and queue summaries.",
    "ENHANCED_QUICKBUY_COUNT": "Controls how many enhanced quickbuy preview items are shown.",
    "ENABLE_QUICKBUY_CLICK_TO_NOTIFY": "Notify your teammates in chat about how close you are to a quickbuy purchase.",
    "ENABLE_SHOP_ITEM_NOTIFICATIONS": "Shows item buy notifications from recent purchases.",
    "ENABLE_HERO_PURCHASE_POPUPS": "Show purchase notifications under each hero's portrait instead of in the center.",
    "ENABLE_SHOP_RECENT_PURCHASES": "See the recent purchases made in the game.",
    "ENABLE_SHOW_BUILD_ID": "Shows your build information always for content creators",
    "ENABLE_SHOW_BUILD_ID_TITLE": "Append the selected build title after the build ID.",
    "ENABLE_MINIMALISTIC_PAUSE": "Use the compact minimalistic pause screen instead of the default large one.",
    "ENABLE_DL4D_REMINDERS": "Timed audio reminders from Deadlock For Dummies.",
    "DL4D_VOLUME": "Volume for Deadlock For Dummies reminder audio.",
    "ENABLE_DL4D_CAPTIONS": "Show a short caption when Deadlock For Dummies reminders play.",
    "ENABLE_DL4D_SMALL_CAMPS_BOXES": "Remind when small camps, boxes, and statues are spawning.",
    "ENABLE_DL4D_RUNE_MELEE_TROOPERS": "Remind when bridge buffs and melee troopers are spawning.",
    "ENABLE_DL4D_MEDIUM_CAMPS": "Remind when medium camps are spawning.",
    "ENABLE_DL4D_BIG_CAMPS_SINNERS": "Remind when big camps and Sinner's Sacrifice are spawning.",
    "ENABLE_DL4D_MIDBOSS_URN_GOLD_RUNE": "Remind when urn, bridge buffs, and gold statue upgrades are spawning.",
    "ENABLE_DL4D_LANE_GUARDIAN_WEAK": "Remind when lane guardian resistance is reduced.",
    "ENABLE_DL4D_RUNE": "Remind when bridge buffs are spawning.",
    "ENABLE_DL4D_WALKER_WEAK": "Remind when walker resistance is reduced.",
    "ENABLE_DL4D_RUNE_FAST_TROOPERS": "Remind when bridge buffs spawn and troopers speed up.",
    "ENABLE_DL4D_RUNE_GOLD_BUFFS": "Remind when bridge buffs spawn and gold statue buffs are maxed.",
    "ENABLE_DL4D_RUNE_TROOPERS20_HP": "Remind when bridge buffs spawn and troopers improve again.",
    "DISABLE_SHOP_BLUE": "The world background blur effect behind the shop menu.",
    "ENABLE_AMMO_STATUS": "Visual indicator of your current ammo.",
    "ENABLE_BUFF_HUD": "Shows a visual indicator in the top bar of when Bridge Buffs will spawn.",
    "ENABLE_CENTER_ESC": "Centers ESC menu elements to make them easier to access.",
    "ENABLE_CENTER_FRIENDS_LIST": "Centers friends list area in ESC menu.",
    "ENABLE_LEGACY_COOLDOWNS": "Restores the legacy removed duration bars for abilities.",
    "ENABLE_STATLOCKER": "Adds a STAT button on profile rows that opens Statlocker for that account.",
    "ENABLE_CLEAN_STACKS": "Improve Ability Stacks",
    "ENABLE_COMBAT_INDICATOR": "Highlight regeneration in red for when in combat.",
    "ENABLE_COLORED_HEALTHBAR": "Colored healthbar warnings when at significant thresholds.",
    "ENABLE_TOPBAR_ENEMY_HP_WARNING": "Colored enemy top-bar health warnings when at significant thresholds.",
    "ENABLE_TOPBAR_ALLY_HP_WARNING": "Colored ally top-bar health warnings when at significant thresholds.",
    "ENABLE_COMPASS_SPEED": "Speed number tracker.",
    "ENABLE_CUMULATIVE_DMG": "The large cumulative damage number.",
    "ENABLE_CLEAN_DAMAGE_INDICATORS": "Modify damage numbers for a cleaner style and animation to be more out of the way",
    "ENABLE_DAMAGE_FOUNTAIN": "Ragnarok Online damage visuals with improved fancy styling.",
    "ENABLE_DAMAGE_IMPACT": "The popups that appear when getting a kill or CCing an enemy or healing an ally",
    "ENABLE_FORCE_TESTING_TOOLS": "Forcibly shows testing tools at all times.",
    "ENABLE_FULL_KEYBOARD_LAYOUT": "Shows all of your keybinds.",
    "ENABLE_HERO_SCENE_PANEL": "Shows your character in the shop menu.",
    "ENABLE_HIDE_ABILITY_SUGGESTION": "Highlighted abilities showing you what you should upgrade depending on build.",
    "ENABLE_HIDE_AMMO_ALL": "Current ammo inside of your magazine.",
    "ENABLE_HIDE_BEHAVIOR_SUMMARY": "Menu when you receive a punishment for breaking game rules.",
    "ENABLE_HIDE_COSMETIC_ABILITY": "The cosmetic ability on your default 5 key, like posters and snowballs.",
    "ENABLE_HIDE_FAILED_HINT": "The popup signifying you are too low on stamina to cast another movement input.",
    "ENABLE_HIDE_MAGAZINE": "Total ammo amount.",
    "ENABLE_HIDE_RELOAD_CIRCLE": "The circle countdown for when you are reloading.",
    "ENABLE_HIDE_RELOAD_ICON": "The icon that replaces your crosshair when reloading.",
    "ENABLE_HIDE_SMALL_NUMBERS": "The small incremental damage numbers.",
    "ENABLE_HIDE_TESTING_TOOLS": "Forcibly hides testing tools at all times.",
    "ENABLE_HIDE_TROOPER_DAMAGE": "The damage dealt to Trooper minions.",
    "ENABLE_HUD_SHIFT": "Slight adjustments to the HUD for better streaming output.",
    "ENABLE_LANE_WITH_PARTY": "Automatically selects Lane Preference: With Party for matchmaking.",
    "ENABLE_MINIMAP_BUFF_TIMER": "Shows a visual indicator in the minimap of when Bridge Buffs will spawn.",
    "ENABLE_MINIMAP_BUFF_TIMER_ON_BRIDGE": "Moves the Bridge Buff timer onto the bridge with two smaller centered copies.",
    "ENABLE_MINIMAP_REJUV_TIMER": "Shows a visual indicator in the minimap of when Mid Boss will spawn.",
    "ENABLE_MINIMAP_CRATE_OVERLAY": "Shows Midtown crate markers in the minimap.",
    "ENABLE_MINIMAP_REM_TUNNELS": "Show an overlay of the underground tunnels.",
    "MINIMAP_REM_TUNNELS_OPACITY": "Opacity of the underground tunnel overlay.",
    "ENABLE_ALT_ZOOM_REM_TUNNELS": "Show the underground tunnel overlay while Alt Zoom is active.",
    "ALT_ZOOM_REM_TUNNELS_OPACITY": "Opacity of the underground tunnel overlay while Alt Zoom is active.",
    "ENABLE_TAB_ZOOM_REM_TUNNELS": "Show the underground tunnel overlay while Tab Zoom is active.",
    "TAB_ZOOM_REM_TUNNELS_OPACITY": "Opacity of the underground tunnel overlay while Tab Zoom is active.",
    "ENABLE_MINIMAP_ELEVATION_MARKERS": "Shows relative elevation difference between you and players.",
    "MINIMAP_ICON_COLOR": "Choose a preset color wash for minimap icons.",
    "ENABLE_MINIMAP_ALWAYS_ON_MID_BOSS": "Moves the Mid Boss timer onto the bridge area of the minimap.",
    "ENABLE_MISSING_HERO": "Greys out heros in the top bar when missing on the map.",
    "ENABLE_NICKNAMES": "Shows nicknames of all players in the game within the top bar.",
    "ENABLE_OBJ_DMG": "Shows the individual player's objective damage in the top bar.",
    "ENABLE_OBJ_MAP": "Show a visual indicator in the top bar of the current Guardians, Walkers, and Base.",
    "ENABLE_OLD_ITEM_COOLDOWNS": "This is a lightweight version with significant FPS improvements but requires a seperate file for filters.",
    "ENABLE_RED_DIAMOND": "Significantly improve visibility of target reticle and highlight for execute ranges (Shiv).",
    "ENABLE_REJUV_HUD": "Shows a visual indicator in the top bar of when Mid Boss will spawn.",
    "ENABLE_SHOP_STATS": "Shows all of your player stats within the shop menu.",
    "ENABLE_SIMPLIFY_SHOP_STATS": "Cleans up the visuals of the shop stats display without changing the rest of the shop.",
    "ENABLE_SIMPLIFY_ABILITY_ICONS": "Cleans up visuals of abilities significantly to reduce clutter.",
    "ENABLE_SIMPLIFY_COMPASS": "Simplifies the Compass overlay to its bare elements.",
    "ENABLE_SIMPLIFY_ITEMS": "Cleans up visuals of the item bar significantly to reduce clutter.",
    "ENABLE_SIMPLIFY_SHOP": "Cleans up visuals of the shop menu significantly to reduce clutter.",
    "ENABLE_URN_DIFF": "Shows a visual indicator in the top bar of the percentage difference of souls between teams.",
    "ENABLE_URN_TIMER": "Shows a countdown timer in the top bar for the next urn spawn or relocation.",
    "ENABLE_URN_COLORS": "Changes urn color to know which side is favored, green for your team, red for the enemy.",
    "ENABLE_ENEMY_V2_ENHANCED": "Enhanced V2 enemy healthbar visuals and readability.",
    "ENABLE_ENEMY_V2_ULT_INDICATOR": "Show the UnitInfo panel on V2 enemy healthbars.",
    "ENABLE_ENEMY_V2_LEVEL": "Show level text on V2 enemy healthbars.",
    "HEALTHBAR_TYPE": "Customized healthbars for better visibility or flair.",
    "ENABLE_MINECRAFT_HEALTH_NUMBERS": "Show current / max HP numbers over the Minecraft hearts.",
    "PLAYER_HEALTHBAR_SCALE": "Adjust size of the player healthbar.",
    "PLAYER_HEALTHBAR_OPACITY": "Adjust opacity of the player healthbar.",
    "PLAYER_HEALTHBAR_X_OFFSET": "Adjust horizontal position of the player healthbar.",
    "PLAYER_HEALTHBAR_Y_OFFSET": "Adjust vertical position of the player healthbar.",
    "PLAYER_HEALTHBAR_ACCENT_COLOR": "Choose a preset accent color for the player healthbar frame.",
    "BOTTOM_BAR_WASH_COLOR": "Choose a preset color wash for the bottom ability bar.",
    "KEYBOARD_OVERLAY_WASH_COLOR": "Choose a preset color wash for the keyboard overlay.",
    "STAMINA_CHARGE_COLOR": "Choose a preset border color for stamina charge indicators.",
    "STAMINA_CHARGE_ANGLE": "Rotate the stamina charge indicator.",
    "AMMO_CLIP_ANGLE": "Rotate the ammo magazine visualiser.",
    "AMMO_TEXT_COLOR": "Choose a preset text color for the ammo display.",
    "CHAT_SCALE": "Adjust size of the in-game chat.",
    "CHAT_X_OFFSET": "Adjust horizontal position of the in-game chat.",
    "CHAT_Y_OFFSET": "Adjust vertical position of the in-game chat.",
    "ENABLE_CHAT": "Show the in-game chat panel.",
    "ENABLE_IMAGES_IN_CHAT": "Render image URLs as images.",
    "HITMARKERS_RUNTIME": "Toggle the hitmarkers when attacking enemies.",
    "MINIMAL_MINIMAP": "Cleans up visuals of the minimap significantly to reduce clutter.",
    "MINIMAP_FLIP": "Rotates the static minimap 180 degrees.",
    "MINIMAP_REMINDER_INTERVAL": "The interval in which the sound plays in seconds.",
    "MINIMAP_ROTATE_WITH_PLAYER": "Makes the minimap rotate with player view, this is just for fun.",
    "OPEN_OLD_ITEM_FILTERS_DOWNLOAD": "Only download the filter file of the filter you want, nothing else.",
    "PREVIEWS_ENABLED": "Realtime Changes",
    "SETTINGS_THEME": "Changes the visual theme used by the settings menu, modals, loader, and save menus.",
    "RUNTIME_MINIMAP_CLICK_RADIUS": "The click hitbox of your pings or clicks, this can help make pings more accurate.",
    "RUNTIME_MINIMAP_HERO_ICON_SIZE": "The size of other players on the minimap.",
    "RUNTIME_MINIMAP_ICON_SHRINK": "How much icons will shrink when overlapping with others.",
    "RUNTIME_MINIMAP_PLAYER_ICON_SIZE": "The size of yourself on the minimap.",
    "RUNTIME_MINIMAP_REFRESH_RATE": "How fast the minimap refreshes.",
    "RUNTIME_MINIMAP_SHRINK_DISTANCE": "The distance threshold in which icons will start shrinking. Lower is more accurate positions, higher is easier visibility.",
    "RUNTIME_MINIMAP_ZIP_THICKNESS": "The thickness of the Zipline lines across the map.",
    "RUNTIME_STATS_SHOWFPS": "Shows raw FPS count.",
    "RUNTIME_STATS_SHOWFRAME": "Shows current frame count, mostly useless.",
    "RUNTIME_STATS_SHOWMEM": "RAM and GPU Memory real time usage statistics.",
    "RUNTIME_STATS_SHOWPOS": "Position and Velocity real time statistics.",
    "RUNTIME_STATS_SHOWTICK": "Shows real time tick information, mostly useless.",
    "SUPPORT_16_10": "Shifts the HUD for better visual support for 16:10 resolutions.",
    "SUPPORT_4_3": "Shifts the HUD for better visual support for 4:3 resolutions.",
    "TAB_ZOOM_DRAW_OVER_UI": "Draws the minimap over all other UI elements for improved visibility.",
};
const SETTING_DESCRIPTION_OVERRIDE_BY_CATEGORY_ROW = {
    "Audio / Announcer|Voice": "You can download custom announcer packs, just download the correct one for the slot you want to replace.",
    "Audio / Announcer|Type": "Which events cause a sound to play. Camps are one time, Buff is every 5 minutes.",
    "Audio / Announcer|Buff Filter": "Choose which bridge buff sound variants can play.",
    "Audio / Announcer|Buff Delay": "Time before the announcement happens in seconds.",
    "Audio / Minimap Reminder|Timer": "The interval in which the sound plays in seconds.",
    "Audio|Announcer": "You can download custom announcer packs, just download the correct one for the slot you want to replace.",
    "Audio|Minimap Reminder": "Play an audio reminder to remember to look at the minimap.",
    "Config / Meta Settings|Preview": "Preview realtime changes to settings when modifying them.",
    "Config / Meta Settings|Language": "The displayed language of the settings menu.",
    "Config / Meta Settings|Default Hero": "The hero you automatically switch to on launch or after saving..",
    "Config / Meta Settings|Theme": "Retheme the settings menu, modals, loader, and save menus with a shared aesthetic.",
    "Console / General|Hitmarkers": "Toggle the hitmarkers when attacking enemies.",
    "Console / Minimap|Click Radius": "The click hitbox of your pings or clicks, this can help make pings more accurate.",
    "Console / Minimap|Hero Icon Size": "The size of other players on the minimap.",
    "Console / Minimap|Icon Shrink": "How much icons will shrink when overlapping with others.",
    "Console / Minimap|Player Icon Size": "The size of yourself on the minimap.",
    "Console / Minimap|Refresh Rate": "How fast the minimap refreshes.",
    "Console / Minimap|Shrink Distance": "The distance threshold in which icons will start shrinking. Lower is more accurate positions, higher is easier visibility.",
    "Console / Minimap|Zip Thickness": "The thickness of the Zipline lines across the map.",
    "Console / Statistics|Show FPS": "Shows raw FPS count.",
    "Console / Statistics|Show Frame": "Shows current frame count, mostly useless.",
    "Console / Statistics|Show Memory": "RAM and GPU Memory real time usage statistics.",
    "Console / Statistics|Show Position": "Position and Velocity real time statistics.",
    "Console / Statistics|Show Tick": "Shows real time tick information, mostly useless.",
    "Crosshair / Ammo|Current": "Current ammo inside of your magazine.",
    "Crosshair / Ammo|Current Size": "Size of your current ammo.",
    "Crosshair / Ammo|Total": "Total ammo amount.",
    "Crosshair / Ammo|Total Size": "Size of your total ammo.",
    "Crosshair / Ammo|Visual": "Visual indicator of your current ammo.",
    "Crosshair / Damage Numbers|Big Numbers": "The large cumulative damage number.",
    "Crosshair / Damage Numbers|Damage Fountain": "Ragnarok Online damage visuals with improved fancy styling.",
    "Crosshair / Damage Numbers|Small Numbers": "The small incremental damage numbers.",
    "Crosshair / Damage Numbers|Trooper Damage": "The damage dealt to Trooper minions.",
    "Crosshair / Item Cooldowns|Optimize Filters": "Only download the filter file of the filter you want, nothing else.",
    "Crosshair / Item Cooldowns|Advanced Mode": "Switch to the advanced item cooldown mode with in-menu filters.",
    "Crosshair / Item Cooldowns|Advanced Filter": "Decide what style of item to display the cooldown of.",
    "Crosshair / Active Stats|Show Debuffs": "Show negative modifiers (slow, antiheal, fire rate reduction...) next to the crosshair.",
    "Crosshair / Active Stats|Show Buffs": "Show positive modifiers (resistances, fire rate, lifesteal...) next to the crosshair.",
    "UI / Player Stats|Side": "Pin the stats panel to the left (default, like vanilla) or right side of the screen.",
    "HUD|Player Stats": "Customize the position of the Player Stats panel, or hide it completely.",
    "Crosshair / Item Target Reticle|Highlight Mode": "Significantly improve visibility of target reticle and highlight for execute ranges (Shiv).",
    "Crosshair / Item Target Reticle|Improved Hint": "Cleans up the styling of reticle hints.",
    "Crosshair / Reloading|Circle": "The circle countdown for when you are reloading.",
    "Crosshair / Reloading|Icon": "The icon that replaces your crosshair when reloading.",
    "Crosshair|Active Stats": "Mirror active buffs/debuffs vertically next to the crosshair so they are visible mid-fight.",
    "Crosshair|Combat Status": "Show if you are in combat or not.",
    "Crosshair|Damage Numbers": "Customize the styling of damage numbers.",
    "Crosshair|Item Cooldowns": "Shows item cooldowns near crosshair for easier readability.",
    "Crosshair|Item Target Reticle": "Customize visibility of target reticle when abilities or items visually show on allies and enemies.",
    "Crosshair|Reload Cooldown": "View a cooldown timer for reloading time.",
    "HUD / Bottom Bar|Ability Suggestion": "Highlighted abilities showing you what you should upgrade depending on build.",
    "HUD / Bottom Bar|Cosmetic Ability": "The cosmetic ability on your default 5 key, like posters and snowballs.",
    "HUD / Bottom Bar|Failed Hint": "The popup signifying you are too low on stamina to cast another movement input.",
    "HUD / Bottom Bar|Minimalist Abilities": "Cleans up visuals of abilities significantly to reduce clutter.",
    "HUD / Bottom Bar|Clean Stacks": "Move ability stacks to bottom-center of ability icon.",
    "HUD / Bottom Bar|Minimalist Item Bar": "Cleans up visuals of the item bar significantly to reduce clutter.",
    "HUD / HUD Controls|16:10 Support": "Shifts the HUD for better visual support for 16:10 resolutions.",
    "HUD / HUD Controls|21:9 Stream Fix": "Slight adjustments to the HUD for better streaming output.",
    "HUD / HUD Controls|4:3 Support": "Shifts the HUD for better visual support for 4:3 resolutions.",
    "HUD / HUD Controls|Behavior Summary": "Menu when you receive a punishment for breaking game rules.",
    "HUD / HUD Controls|Centered ESC Menu": "Centers ESC menu elements to make them easier to access.",
    "HUD / HUD Controls|Statlocker": "Adds a STAT button on profile rows that opens Statlocker for that account.",
    "HUD / HUD Controls|Hide Testing Tools": "Forcibly hides testing tools at all times.",
    "HUD / HUD Controls|Lane with Party": "Automatically selects Lane Preference: With Party for matchmaking.",
    "HUD / HUD Controls|Show Testing Tools": "Forcibly shows testing tools at all times.",
    "UI / UI Controls|16:10 Support": "Shifts the HUD for better visual support for 16:10 resolutions.",
    "UI / UI Controls|21:9 Stream Fix": "Slight adjustments to the HUD for better streaming output.",
    "UI / UI Controls|4:3 Support": "Shifts the HUD for better visual support for 4:3 resolutions.",
    "UI / UI Controls|Behavior Summary": "Menu when you receive a punishment for breaking game rules.",
    "UI / UI Controls|Centered ESC Menu": "Centers ESC menu elements to make them easier to access.",
    "UI / UI Controls|Centered Friends List": "Centers the friends list area within the ESC menu.",
    "UI / UI Controls|Statlocker": "Adds a STAT button on profile rows that opens Statlocker for that account.",
    "UI / UI Controls|Hide Testing Tools": "Forcibly hides testing tools at all times.",
    "UI / UI Controls|Lane with Party": "Automatically selects Lane Preference: With Party for matchmaking.",
    "UI / UI Controls|Show Testing Tools": "Forcibly shows testing tools at all times.",
    "UI / UI Controls|Show Build ID": "Shows your build information always for content creators",
    "UI / UI Controls / Show Build ID|Show Title": "Append the selected build title after the build ID.",
    "UI / UI Controls|Minimalistic Pause": "Use the compact minimalistic pause screen instead of the default large one.",
    "HUD|Chat": "Adjust the in-game chat position and scale.",
    "UI|Chat": "Adjust the in-game chat position and scale.",
    "HUD / Shop|Blur": "The world background blur effect behind the shop menu.",
    "HUD / Shop|Hero": "Shows your character in the shop menu.",
    "HUD / Shop|Minimalist": "Cleans up visuals of the shop menu significantly to reduce clutter.",
    "HUD / Shop|Quick Buy": "The item buying auto queue system in the shop menu.",
    "HUD / Shop|Recent Purchases": "Tools for tracking recent item purchases.",
    "HUD / Shop|Item Buy Notifications": "Tools for showing and sharing item purchase notifications.",
    "HUD / Shop|Stats": "Shows all of your player stats within the shop menu.",
    "HUD / Top Bar|Bridge Buff Timer": "Shows a visual indicator in the top bar of when Bridge Buffs will spawn.",
    "HUD / Top Bar|Mid Boss Timer": "Shows a visual indicator in the top bar of when Mid Boss will spawn.",
    "HUD / Top Bar|Missing Hero Opaque": "Greys out heros in the top bar when missing on the map.",
    "HUD / Top Bar|Nicknames": "Shows nicknames of all players in the game within the top bar.",
    "HUD / Top Bar|Objective Damage": "Shows the individual player's objective damage in the top bar.",
    "HUD / Top Bar|Objective Map": "Show a visual indicator in the top bar of the current Guardians, Walkers, and Base.",
    "HUD / Top Bar|Top Bar Background": "The world blur and backing strip behind player names in the top bar.",
    "HUD / Top Bar|Enemy HP Warning": "Colored enemy top-bar health warnings when at significant thresholds.",
    "HUD / Top Bar|Ally HP Warning": "Colored ally top-bar health warnings when at significant thresholds.",
    "HUD / Top Bar|Urn Difference": "Shows a visual indicator in the top bar of the percentage difference of souls between teams.",
    "HUD|Damage Report": "Customize the visuals of the incoming damage panel.",
    "Healthbar / Player|Color Warning": "Colored healthbar warnings when at significant thresholds.",
    "Healthbar / Player|Type": "Customized healthbars for better visibility or flair.",
    "Healthbar / Player|Horizontal Offset": "Adjust horizontal position of the player healthbar.",
    "Healthbar / Player|Vertical Offset": "Adjust vertical position of the player healthbar.",
    "Healthbar / Enemy|Colored Health": "Colored enemy healthbar warnings when at significant thresholds.",
    "Healthbar / Enemy|Ult Indicator": "Show the ultimate indicator for V1 healthbars.",
    "Healthbar / Enemy V2|Enhanced": "Enhanced V2 enemy healthbar visuals and readability.",
    "Healthbar / Enemy V2|Ult Indicator": "Show the UnitInfo panel on V2 enemy healthbars.",
    "Healthbar / Enemy V2|Level": "Show level text on V2 enemy healthbars.",
    "Healthbar|Enemy": "Enemy healthbar enhancements.",
    "Healthbar|Enemy V2": "V2 enemy healthbar enhancements.",
    "Minimap / Alt Zoom|Draw Over UI": "Draws the minimap over all other UI elements for improved visibility.",
    "Minimap / Minimap|Bridge Buff Timer": "Shows a visual indicator in the minimap of when Bridge Buffs will spawn.",
    "Minimap / Minimap / Bridge Buff Timer|On Bridge": "Moves the Bridge Buff timer onto the bridge with two smaller centered copies.",
    "Minimap / Minimap|Flip": "Rotates the static minimap 180 degrees.",
    "Minimap / Minimap|Mid Boss Timer": "Shows a visual indicator in the minimap of when Mid Boss will spawn.",
    "Minimap / Minimap / Mid Boss Timer|On Mid Boss": "Moves the Mid Boss timer onto the bridge area of the minimap.",
    "Minimap / Addons / Mid Boss Timer|On Mid Boss": "Moves the Mid Boss timer onto the bridge area of the minimap.",
    "Minimap / Addons / Bridge Buff Timer|On Bridge": "Moves the Bridge Buff timer onto the bridge with two smaller centered copies.",
    "Minimap / Minimap|Minimalist": "Cleans up visuals of the minimap significantly to reduce clutter.",
    "Minimap / Minimap|Minimalist Opacity": "Opacity of the background of Minimalist Minimap.",
    "Minimap / Minimap|Spinny Mode": "Makes the minimap rotate with player view, this is just for fun.",
    "Minimap / Minimap|Urn Colors": "Changes urn color to know which side is favored, green for your team, red for the enemy.",
    "Minimap / Tab Zoom|Draw Over UI": "Draws the minimap over all other UI elements for improved visibility.",
    "Minimap|Alt Zoom": "View an enhanced minimap on opening ability menu.",
    "Minimap|Tab Zoom": "View an enhanced minimap on opening scoreboard menu.",
    "Overlay / Compass|Minimalist": "Simplifies the Compass overlay to its bare elements.",
    "Overlay / Compass|Speed": "Speed number tracker.",
    "Overlay / Compass|Horizontal Stretch": "Stretch the compass horizontally.",
    "Overlay / Compass|Vertical Stretch": "Stretch the compass vertically.",
    "Overlay / Keyboard|Full Keys": "Shows all of your keybinds.",
    "Overlay|Compass": "See your view angle and speed.",
    "Overlay|Keyboard": "Real time key input visual.",
    "Overlay|Ult Cooldowns": "View the cooldown time of player ultimates.",
    "Overlay|Unsecured Plus": "Customize unsecured souls visuals.",
    "Overlay / Unsecured Plus|Icon": "The small visual icon.",
    "Overlay / Unsecured Plus|Text": "The unsecured text.",
    "Overlay|Unsecured Timer": "Show the estimated time for unsecured souls to dissapear.",
    "Overlay|Zipline Boost": "An always visible zipline boost overlay.",
};
const SECTION_DESCRIPTION_OVERRIDE_BY_TAB_TITLE = {
    "Audio|Announcer": "You can download custom announcer packs, just download the correct one for the slot you want to replace.",
    "Audio|Minimap Reminder": "Play an audio reminder to remember to look at the minimap.",
    "Crosshair|Active Stats": "Mirror active buffs/debuffs vertically next to the crosshair so they are visible mid-fight.",
    "UI|Player Stats": "Customize the position of the Player Stats panel, or hide it completely.",
    "Crosshair|Combat Status": "Show if you are in combat or not.",
    "Crosshair|Damage Numbers": "Customize the styling of damage numbers.",
    "Crosshair|Item Cooldowns": "Shows item cooldowns near crosshair for easier readability.",
    "Crosshair|Item Target Reticle": "Customize visibility of target reticle when abilities or items visually show on allies and enemies.",
    "Crosshair|Reload Cooldown": "View a cooldown timer for reloading time.",
    "HUD|Damage Report": "Customize the visuals of the incoming damage panel.",
    "UI|Damage Report": "Customize the visuals of the incoming damage panel.",
    "Healthbar|Enemy": "Enemy healthbar enhancements.",
    "Healthbar|Enemy V2": "V2 enemy healthbar enhancements.",
    "Minimap|Alt Zoom": "View an enhanced minimap on opening ability menu.",
    "Minimap|Tab Zoom": "View an enhanced minimap on opening scoreboard menu.",
    "Overlay|Compass & Speed": "See your view angle and speed.",
    "Overlay|Keyboard": "Real time key input visual.",
    "Overlay|Ult Cooldowns": "View the cooldown time of player ultimates.",
    "Overlay|Unsecured Plus": "Customize unsecured souls visuals.",
    "Overlay|Unsecured Timer": "Show the estimated time for unsecured souls to dissapear.",
    "Overlay|Zipline Boost": "An always visible zipline boost overlay.",
};
const SETTING_PERF_IMPACT_TIERS = {
    ALT_ZOOM_DRAW_OVER_UI: "low",
    ALT_ZOOM_OPACITY: "low",
    AMMO_CURRENT_SCALE: "low",
    AMMO_PANEL_X_OFFSET: "low",
    AMMO_PANEL_Y_OFFSET: "low",
    AMMO_TOTAL_SCALE: "low",
    BRIDGE_BUFF_START: "none",
    COMBAT_STATUS_SCALE: "low",
    COMBAT_STATUS_X_OFFSET: "low",
    COMBAT_STATUS_Y_OFFSET: "low",
    COMPASS_SCALE: "medium",
    COMPASS_STRETCH_X: "medium",
    COMPASS_STRETCH_Y: "medium",
    COMPASS_X_OFFSET: "medium",
    COMPASS_Y_OFFSET: "medium",
    DAMAGE_NUMBER_OPACITY: "low",
    DAMAGE_IMPACT_OPACITY: "low",
    DAMAGE_IMPACT_SCALE: "low",
    DAMAGE_IMPACT_X_OFFSET: "low",
    DAMAGE_IMPACT_Y_OFFSET: "low",
    DAMAGE_REPORT_X_OFFSET: "low",
    DAMAGE_REPORT_Y_OFFSET: "low",
    DEFAULT_HERO: "none",
    DISABLE_DAMAGE_REPORT: "low",
    ENABLE_DAMAGE_IMPACT: "low",
    DISABLE_PLAYER_NAME_BLUR: "none",
    DISABLE_QUICK_BUY: "none",
    DISABLE_SHOP_BLUE: "none",
    ENABLE_ALT_ZOOM: "low",
    ENABLE_AMMO_STATUS: "low",
    ENABLE_CROSSHAIR_STATS: "medium",
    CROSSHAIR_STATS_SHOW_DEBUFFS: "low",
    CROSSHAIR_STATS_SHOW_BUFFS: "low",
    CROSSHAIR_STATS_X_OFFSET: "low",
    CROSSHAIR_STATS_Y_OFFSET: "low",
    CROSSHAIR_STATS_SCALE: "low",
    CROSSHAIR_STATS_OPACITY: "low",
    CROSSHAIR_STATS_SHOW_FIRERATE: "none",
    CROSSHAIR_STATS_SHOW_MOVESPEED: "none",
    CROSSHAIR_STATS_SHOW_HEALAMP: "none",
    CROSSHAIR_STATS_SHOW_BULLETRESIST: "none",
    CROSSHAIR_STATS_SHOW_TECHRESIST: "none",
    CROSSHAIR_STATS_SHOW_BULLETLIFESTEAL: "none",
    CROSSHAIR_STATS_SHOW_TECHLIFESTEAL: "none",
    CROSSHAIR_STATS_SHOW_WEAPONPOWER: "none",
    CROSSHAIR_STATS_SHOW_SPIRIT: "none",
    CROSSHAIR_STATS_SHOW_RANGE: "none",
    CROSSHAIR_STATS_SHOW_DURATION: "none",
    CROSSHAIR_STATS_SHOW_DAMAGEAMP: "none",
    CROSSHAIR_STATS_SHOW_CLIPSIZE: "none",
    CROSSHAIR_STATS_SHOW_REGEN: "none",
    CROSSHAIR_STATS_SHOW_BULLETEVASION: "none",
    ENABLE_STATS_POSITION: "low",
    STATS_POSITION_SIDE: "low",
    STATS_POSITION_X_OFFSET: "low",
    STATS_POSITION_Y_OFFSET: "low",
    STATS_POSITION_HIDE_NORMAL: "low",
    STATS_POSITION_HIDE_SCOREBOARD: "low",
    ENABLE_BETTER_UNSECURED: "low",
    ENABLE_BETTER_UNSECURED_SHOW_ICON: "low",
    ENABLE_BETTER_UNSECURED_SHOW_TEXT: "low",
    ENABLE_BUFF_HUD: "low",
    ENABLE_CENTER_ESC: "none",
    ENABLE_CENTER_FRIENDS_LIST: "none",
    ENABLE_LEGACY_COOLDOWNS: "low",
    ENABLE_STATLOCKER: "none",
    ENABLE_CLEAN_STACKS: "none",
    ENABLE_COMBAT_INDICATOR: "low",
    ENABLE_COLORED_HEALTHBAR: "medium",
    ENABLE_COLOR_WARNING_25: "medium",
    ENABLE_COLOR_WARNING_65: "medium",
    ENABLE_COLOR_WARNING_75: "medium",
    ENABLE_COMBAT_STATUS: "low",
    ENABLE_COMPASS: "medium",
    ENABLE_COMPASS_SPEED: "medium",
    ENABLE_CUMULATIVE_DMG: "low",
    ENABLE_CLEAN_DAMAGE_INDICATORS: "low",
    ENABLE_DAMAGE_FOUNTAIN: "low",
    ENABLE_TOPBAR_ENEMY_HP_WARNING: "medium",
    ENABLE_TOPBAR_ENEMY_HP_WARNING_25: "medium",
    ENABLE_TOPBAR_ENEMY_HP_WARNING_65: "medium",
    ENABLE_TOPBAR_ENEMY_HP_WARNING_75: "medium",
    ENABLE_TOPBAR_ALLY_HP_WARNING: "medium",
    ENABLE_TOPBAR_ALLY_HP_WARNING_25: "medium",
    ENABLE_TOPBAR_ALLY_HP_WARNING_65: "medium",
    ENABLE_TOPBAR_ALLY_HP_WARNING_75: "medium",
    ENABLE_ENEMY_V2_ENHANCED: "medium",
    ENABLE_ENEMY_V2_ULT_INDICATOR: "low",
    ENABLE_ENEMY_V2_LEVEL: "low",
    ENABLE_ENEMY_ULT_INDICATOR: "medium",
    ENABLE_ENHANCED_QUICKBUY: "low",
    ENHANCED_QUICKBUY_COUNT: "low",
    ENABLE_FORCE_TESTING_TOOLS: "none",
    ENABLE_FULL_KEYBOARD_LAYOUT: "medium",
    ENABLE_HERO_SCENE_PANEL: "none",
    ENABLE_HIDE_ABILITY_SUGGESTION: "none",
    ENABLE_HIDE_AMMO_ALL: "low",
    ENABLE_HIDE_BEHAVIOR_SUMMARY: "none",
    ENABLE_HIDE_COSMETIC_ABILITY: "none",
    ENABLE_HIDE_FAILED_HINT: "none",
    ENABLE_HIDE_MAGAZINE: "low",
    ENABLE_HIDE_RELOAD_CIRCLE: "none",
    ENABLE_HIDE_RELOAD_ICON: "none",
    ENABLE_HIDE_SMALL_NUMBERS: "none",
    ENABLE_HIDE_TESTING_TOOLS: "none",
    ENABLE_HIDE_TROOPER_DAMAGE: "none",
    ENABLE_GAME_AUDIO: "none",
    ENABLE_HUD_SHIFT: "none",
    ENABLE_IMPROVED_HINT: "low",
    ENABLE_INTERVAL: "low",
    ENABLE_KEYBOARD_OVERLAY: "medium",
    ENABLE_LANE_WITH_PARTY: "low",
    ENABLE_MINIMAP_BUFF_TIMER: "low",
    ENABLE_MINIMAP_REJUV_TIMER: "low",
    ENABLE_MINIMAP_CRATE_OVERLAY: "low",
    ENABLE_MINIMAP_REM_TUNNELS: "low",
    MINIMAP_REM_TUNNELS_OPACITY: "low",
    ENABLE_ALT_ZOOM_REM_TUNNELS: "low",
    ALT_ZOOM_REM_TUNNELS_OPACITY: "low",
    ENABLE_TAB_ZOOM_REM_TUNNELS: "low",
    TAB_ZOOM_REM_TUNNELS_OPACITY: "low",
    ENABLE_MINIMAP_ELEVATION_MARKERS: "low",
    MINIMAP_ICON_COLOR: "low",
    ENABLE_MINIMAP_ALWAYS_ON_MID_BOSS: "low",
    ENABLE_MINIMAP_REMINDER: "low",
    ENABLE_MISSING_HERO: "low",
    ENABLE_NICKNAMES: "medium",
    ENABLE_OBJ_DMG: "medium",
    ENABLE_OBJ_MAP: "low",
    ENABLE_OLD_ITEM_COOLDOWNS: "high",
    ENABLE_ONE_TIME_TIER1: "low",
    ENABLE_ONE_TIME_TIER2: "low",
    ENABLE_ONE_TIME_TIER3: "low",
    ENABLE_PASSIVE_COOLDOWN: "low",
    ENABLE_RED_DIAMOND: "medium",
    ENABLE_REJUV_HUD: "low",
    ENABLE_RELOAD_COOLDOWN: "medium",
    ENABLE_SHOP_STATS: "low",
    ENABLE_QUICKBUY_CLICK_TO_NOTIFY: "low",
    ENABLE_SHOP_ITEM_NOTIFICATIONS: "low",
    ENABLE_HERO_PURCHASE_POPUPS: "low",
    ENABLE_SHOP_RECENT_PURCHASES: "low",
    RECENT_PURCHASES_QUICK_OPACITY: "low",
    RECENT_PURCHASES_PANEL_OPACITY: "low",
    ENABLE_SHOW_BUILD_ID: "low",
    ENABLE_SHOW_BUILD_ID_TITLE: "low",
    ENABLE_MINIMALISTIC_PAUSE: "low",
    ENABLE_DL4D_REMINDERS: "low",
    DL4D_VOLUME: "none",
    ENABLE_DL4D_CAPTIONS: "low",
    ENABLE_DL4D_SMALL_CAMPS_BOXES: "low",
    ENABLE_DL4D_RUNE_MELEE_TROOPERS: "low",
    ENABLE_DL4D_MEDIUM_CAMPS: "low",
    ENABLE_DL4D_BIG_CAMPS_SINNERS: "low",
    ENABLE_DL4D_MIDBOSS_URN_GOLD_RUNE: "low",
    ENABLE_DL4D_LANE_GUARDIAN_WEAK: "low",
    ENABLE_DL4D_RUNE: "low",
    ENABLE_DL4D_WALKER_WEAK: "low",
    ENABLE_DL4D_RUNE_FAST_TROOPERS: "low",
    ENABLE_DL4D_RUNE_GOLD_BUFFS: "low",
    ENABLE_DL4D_RUNE_TROOPERS20_HP: "low",
    ENABLE_SIMPLIFY_SHOP_STATS: "low",
    ENABLE_SIMPLIFY_ABILITY_ICONS: "none",
    ENABLE_SIMPLIFY_COMPASS: "medium",
    ENABLE_SIMPLIFY_ITEMS: "none",
    ENABLE_SIMPLIFY_SHOP: "none",
    HUD_BOTTOM_BAR_ENABLED: "low",
    HUD_ITEMS_ENABLED: "low",
    HUD_SHOP_ENABLED: "low",
    HUD_SOULS_ENABLED: "low",
    HUD_TOP_BAR_ENABLED: "low",
    ENABLE_TAB_ZOOM: "low",
    ENABLE_ULT_COOLDOWNS: "none",
    ENABLE_UNSECURED_SOUL_TIMER: "medium",
    ENABLE_URN_DIFF: "low",
    ENABLE_URN_TIMER: "low",
    ENABLE_URN_COLORS: "low",
    ENABLE_ZIP_BOOST: "low",
    HEALTHBAR_TYPE: "medium",
    ENABLE_MINECRAFT_HEALTH_NUMBERS: "none",
    PLAYER_HEALTHBAR_SCALE: "low",
    PLAYER_HEALTHBAR_OPACITY: "low",
    PLAYER_HEALTHBAR_X_OFFSET: "low",
    PLAYER_HEALTHBAR_Y_OFFSET: "low",
    PLAYER_HEALTHBAR_ACCENT_COLOR: "low",
    BOTTOM_BAR_WASH_COLOR: "low",
    KEYBOARD_OVERLAY_WASH_COLOR: "low",
    STAMINA_CHARGE_COLOR: "low",
    STAMINA_CHARGE_ANGLE: "low",
    AMMO_CLIP_ANGLE: "low",
    AMMO_TEXT_COLOR: "low",
    CHAT_SCALE: "low",
    CHAT_X_OFFSET: "low",
    CHAT_Y_OFFSET: "low",
    ENABLE_CHAT: "none",
    ENABLE_IMAGES_IN_CHAT: "low",
    HITMARKERS_RUNTIME: "none",
    HUD_INDICATOR_SIZE: "low",
    ITEM_FILTER_DEF_ACTIVE: "medium",
    ITEM_FILTER_DEF_PASSIVE: "medium",
    ITEM_FILTER_OFF_ACTIVE: "medium",
    ITEM_FILTER_OFF_PASSIVE: "medium",
    KEYBOARD_OVERLAY_SCALE: "medium",
    KEYBOARD_OVERLAY_X_OFFSET: "medium",
    KEYBOARD_OVERLAY_Y_OFFSET: "medium",
    LANGUAGE: "none",
    SETTINGS_THEME: "none",
    MINIMAL_MINIMAP: "low",
    MINIMAL_MINIMAP_OPACITY: "low",
    MINIMAP_BASE_OPACITY: "low",
    MINIMAP_FLIP: "low",
    MINIMAP_LARGE_SIZE_ALT: "low",
    MINIMAP_LARGE_SIZE_TAB: "low",
    MINIMAP_REMINDER_INTERVAL: "low",
    MINIMAP_ROTATE_WITH_PLAYER: "medium",
    MINIMAP_SMALL_SIZE: "low",
    MINIMAP_X_OFFSET: "low",
    MINIMAP_Y_OFFSET: "low",
    OPEN_AIM_TRAINER: "none",
    OPEN_BLACKJACK: "none",
    OPEN_FLAPPY_BIRD: "none",
    OPEN_MINESWEEPER: "none",
    OPEN_OLD_ITEM_FILTERS_DOWNLOAD: "none",
    OPEN_TRAIN_TRACKING: "none",
    OPEN_WHACK_A_REM: "none",
    GAME_DEFAULT_DIFFICULTY: "none",
    PASSIVE_COOLDOWN_OPACITY: "low",
    PASSIVE_COOLDOWN_SIZE: "low",
    PASSIVE_COOLDOWN_X: "low",
    PASSIVE_COOLDOWN_Y: "low",
    ITEMS_OPACITY: "low",
    ITEMS_X_OFFSET: "low",
    ITEMS_Y_OFFSET: "low",
    ITEMS_WASH_COLOR: "low",
    PREVIEWS_ENABLED: "none",
    RELOAD_COOLDOWN_OPACITY: "medium",
    RELOAD_COOLDOWN_SIZE: "medium",
    RELOAD_COOLDOWN_X_OFFSET: "medium",
    RELOAD_COOLDOWN_Y_OFFSET: "medium",
    RUNTIME_MINIMAP_CLICK_RADIUS: "none",
    RUNTIME_MINIMAP_HERO_ICON_SIZE: "none",
    RUNTIME_MINIMAP_ICON_SHRINK: "none",
    RUNTIME_MINIMAP_PLAYER_ICON_SIZE: "none",
    RUNTIME_MINIMAP_REFRESH_RATE: "none",
    RUNTIME_MINIMAP_SHRINK_DISTANCE: "none",
    RUNTIME_MINIMAP_ZIP_THICKNESS: "none",
    RUNTIME_STATS_SHOWFPS: "none",
    RUNTIME_STATS_SHOWFRAME: "none",
    RUNTIME_STATS_SHOWMEM: "none",
    RUNTIME_STATS_SHOWPOS: "none",
    RUNTIME_STATS_SHOWTICK: "none",
    SHOP_OPACITY: "low",
    SHOP_OFFSET_X: "low",
    SHOP_OFFSET_Y: "low",
    SHOP_SCALE: "low",
    SOULS_OPACITY: "low",
    SOULS_X_OFFSET: "low",
    SOULS_Y_OFFSET: "low",
    SUPPORT_16_10: "none",
    SUPPORT_4_3: "none",
    TAB_ZOOM_DRAW_OVER_UI: "low",
    TAB_ZOOM_OPACITY: "low",
    TOP_BAR_OPACITY: "low",
    TOP_BAR_SCALE: "low",
    TOP_BAR_X_OFFSET: "low",
    TOP_BAR_Y_OFFSET: "low",
    BOTTOM_BAR_OPACITY: "low",
    BOTTOM_BAR_SCALE: "low",
    BOTTOM_BAR_X_OFFSET: "low",
    BOTTOM_BAR_Y_OFFSET: "low",
    UNIT_TARGET_OPACITY: "medium",
    UNIT_TARGET_SIZE: "medium",
    UNIT_TARGET_HINT_SIZE: "medium",
    UNSECURED_SOULS_HUD_SCALE: "low",
    UNSECURED_SOULS_HUD_X_OFFSET: "low",
    UNSECURED_SOULS_HUD_Y_OFFSET: "low",
    UNSECURED_SOUL_TIMER_SCALE: "medium",
    UNSECURED_SOUL_TIMER_X_OFFSET: "medium",
    UNSECURED_SOUL_TIMER_Y_OFFSET: "medium",
    VOICE_TYPE: "none",
    VOICE_VOLUME: "none",
    ZIP_BOOST_SCALE: "low",
    ZIP_BOOST_X_OFFSET: "low",
    ZIP_BOOST_Y_OFFSET: "low",
    ZOOM_X_OFFSET_ALT: "low",
    ZOOM_X_OFFSET_TAB: "low",
    ZOOM_Y_OFFSET_ALT: "low",
    ZOOM_Y_OFFSET_TAB: "low",
    // 3.13: filled remaining gaps
    ENABLE_BHOP: "low",
    ENABLE_ON_DEATH_GAMES: "low",
    ENABLE_PERF_DEBUG: "none",
    ENABLE_PERF_DEBUG_DETAIL: "none",
    ENABLE_PERF_OVERLAY: "low",
    PERF_ALERT_THRESHOLD_MS: "low",
    PERF_OVERLAY_OPACITY: "low",
    RECENT_PURCHASES_PANEL_SCALE: "low",
    RECENT_PURCHASES_PANEL_X_OFFSET: "low",
    RECENT_PURCHASES_PANEL_Y_OFFSET: "low",
    RECENT_PURCHASES_QUICK_DISPLAY_SEC: "low",
    RECENT_PURCHASES_QUICK_MAX: "low",
    RECENT_PURCHASES_QUICK_SCALE: "low",
    RECENT_PURCHASES_QUICK_X_OFFSET: "low",
    RECENT_PURCHASES_QUICK_Y_OFFSET: "low",
    TEST_SKYRUNNER: "none",
    SHOW_RANK: "low",
    SHOW_RANK_TOPBAR: "low",
};
const HEALTHBAR_TYPE_DROPDOWN_OPTIONS = [
    { label: "Default", value: 0 },
    { label: "Minimalist", value: 1 },
    { label: "Fighting Game", value: 2 },
    { label: "Klutz's Bar", value: 3 },
    { label: "Budhud", value: 4 },
    { label: "Minecraft", value: 5 }
];
const COLOR_WARNING_THRESHOLD_OPTIONS = [
    { label: "25%", key: "ENABLE_COLOR_WARNING_25" },
    { label: "65%", key: "ENABLE_COLOR_WARNING_65" },
    { label: "75%", key: "ENABLE_COLOR_WARNING_75" }
];
const TOPBAR_ENEMY_HP_WARNING_THRESHOLD_OPTIONS = [
    { label: "25%", key: "ENABLE_TOPBAR_ENEMY_HP_WARNING_25" },
    { label: "65%", key: "ENABLE_TOPBAR_ENEMY_HP_WARNING_65" },
    { label: "75%", key: "ENABLE_TOPBAR_ENEMY_HP_WARNING_75" }
];
const TOPBAR_ALLY_HP_WARNING_THRESHOLD_OPTIONS = [
    { label: "25%", key: "ENABLE_TOPBAR_ALLY_HP_WARNING_25" },
    { label: "65%", key: "ENABLE_TOPBAR_ALLY_HP_WARNING_65" },
    { label: "75%", key: "ENABLE_TOPBAR_ALLY_HP_WARNING_75" }
];
const NEUTRAL_CAMP_TIER_OPTIONS = [
    { label: "Tier 1", key: "ENABLE_ONE_TIME_TIER1" },
    { label: "Tier 2", key: "ENABLE_ONE_TIME_TIER2" },
    { label: "Tier 3", key: "ENABLE_ONE_TIME_TIER3" },
    { label: "Buff", key: "ENABLE_INTERVAL" }
];
const BRIDGE_BUFF_FILTER_OPTIONS = [
    { label: "1st", key: "ENABLE_BUFF_SOUND_1" },
    { label: "2nd", key: "ENABLE_BUFF_SOUND_2" },
    { label: "3rd", key: "ENABLE_BUFF_SOUND_3" }
];
const RECENT_PURCHASE_REPOSITION_OPTIONS = [
    { label: "Rejuvenator", key: "RECENT_PURCHASES_QUICK_REJUV" },
    { label: "Scoreboard", key: "RECENT_PURCHASES_QUICK_SCOREBOARD" }
];
// Player Stats side picker — mutually exclusive Left/Right bound to a single config key.
const STATS_POSITION_SIDE_OPTIONS = [
    { label: "Left", value: 0 },
    { label: "Right", value: 1 }
];
const DEFAULT_HERO_OPTIONS = [
    "hero_inferno",
    "hero_gigawatt",
    "hero_hornet",
    "hero_ghost",
    "hero_atlas",
    "hero_wraith",
    "hero_forge",
    "hero_chrono",
    "hero_dynamo",
    "hero_kelvin",
    "hero_haze",
    "hero_astro",
    "hero_bebop",
    "hero_nano",
    "hero_orion",
    "hero_krill",
    "hero_shiv",
    "hero_tengu",
    "hero_warden",
    "hero_yamato",
    "hero_lash",
    "hero_viscous",
    "hero_synth",
    "hero_mirage",
    "hero_viper",
    "hero_magician",
    "hero_vampirebat",
    "hero_drifter",
    "hero_priest",
    "hero_frank",
    "hero_bookworm",
    "hero_doorman",
    "hero_punkgoat",
    "hero_necro",
    "hero_fencer",
    "hero_familiar",
    "hero_werewolf",
    "hero_unicorn"
];
const DEFAULT_HERO_DISPLAY_NAMES = {
    hero_inferno: "Infernus",
    hero_gigawatt: "Seven",
    hero_hornet: "Vindicta",
    hero_ghost: "Lady Geist",
    hero_atlas: "Abrams",
    hero_wraith: "Wraith",
    hero_forge: "McGinnis",
    hero_chrono: "Paradox",
    hero_dynamo: "Dynamo",
    hero_kelvin: "Kelvin",
    hero_haze: "Haze",
    hero_astro: "Holliday",
    hero_bebop: "Bebop",
    hero_nano: "Calico",
    hero_orion: "Grey Talon",
    hero_krill: "Mo & Krill",
    hero_shiv: "Shiv",
    hero_tengu: "Ivy",
    hero_warden: "Warden",
    hero_yamato: "Yamato",
    hero_lash: "Lash",
    hero_viscous: "Viscous",
    hero_synth: "Pocket",
    hero_mirage: "Mirage",
    hero_viper: "Vyper",
    hero_magician: "Sinclair",
    hero_vampirebat: "Mina",
    hero_drifter: "Drifter",
    hero_priest: "Venator",
    hero_frank: "Victor",
    hero_bookworm: "Paige",
    hero_doorman: "Doorman",
    hero_punkgoat: "Billy",
    hero_necro: "Graves",
    hero_fencer: "Apollo",
    hero_familiar: "Rem",
    hero_werewolf: "Silver",
    hero_unicorn: "Celeste"
};
const DEFAULT_HERO_DROPDOWN_OPTIONS = DEFAULT_HERO_OPTIONS.map(function(heroId) {
    return { label: DEFAULT_HERO_DISPLAY_NAMES[heroId] || heroId, value: heroId };
}).sort(function(a, b) {
    var labelA = String(a && a.label ? a.label : "").toLowerCase();
    var labelB = String(b && b.label ? b.label : "").toLowerCase();
    if (labelA < labelB) return -1;
    if (labelA > labelB) return 1;
    return 0;
});
function GetDefaultHeroIconPath(heroId) {
    var normalizedHeroId = String(heroId || "");
    var heroAlias = normalizedHeroId.indexOf("hero_") === 0 ? normalizedHeroId.substring(5) : normalizedHeroId;
    if (!heroAlias) heroAlias = "werewolf";
    var heroIconAliasMap = {
        viper: "kali",
        krill: "digger",
        forge: "engineer",
        ghost: "spectre",
        orion: "archer",
        atlas: "bull",
        dynamo: "sumo"
    };
    if (heroIconAliasMap.hasOwnProperty(heroAlias)) {
        heroAlias = heroIconAliasMap[heroAlias];
    }
    return "s2r://panorama/images/heroes/" + heroAlias + "_mm_psd.vtex";
}
function GetLanguageIconPath(languageValue) {
    var normalizedValue = String(languageValue === undefined || languageValue === null ? "" : languageValue);
    var languageIconName = "english";
    if (normalizedValue === String(SETTINGS_LANGUAGE_RUSSIAN)) {
        languageIconName = "russian";
    } else if (normalizedValue === String(SETTINGS_LANGUAGE_UKRAINIAN)) {
        languageIconName = "ukraine";
    } else if (normalizedValue === String(SETTINGS_LANGUAGE_POLISH)) {
        languageIconName = "poland";
    } else if (normalizedValue === String(SETTINGS_LANGUAGE_BULGARIAN)) {
        languageIconName = "bulgaria";
    } else if (normalizedValue === String(SETTINGS_LANGUAGE_BELARUSIAN)) {
        languageIconName = "belarus";
    } else if (normalizedValue === String(SETTINGS_LANGUAGE_JAPANESE)) {
        languageIconName = "japan";
    } else if (normalizedValue === String(SETTINGS_LANGUAGE_CHINESE)) {
        languageIconName = "chinese";
    } else if (normalizedValue === String(SETTINGS_LANGUAGE_FRENCH)) {
        languageIconName = "french";
    } else if (normalizedValue === String(SETTINGS_LANGUAGE_PORTUGUESE)) {
        languageIconName = "portuguese";
    } else if (normalizedValue === String(SETTINGS_LANGUAGE_BRAZILIAN_PORTUGUESE)) {
        languageIconName = "brazil";
    } else if (normalizedValue === String(SETTINGS_LANGUAGE_SPANISH)) {
        languageIconName = "spanish";
    } else if (normalizedValue === String(SETTINGS_LANGUAGE_KOREAN)) {
        languageIconName = "korean";
    } else if (normalizedValue === String(SETTINGS_LANGUAGE_ITALIAN)) {
        languageIconName = "italian";
    } else if (normalizedValue === String(SETTINGS_LANGUAGE_TURKISH)) {
        languageIconName = "turkish";
    }
    return "s2r://panorama/images/qollock/" + languageIconName + "_png.vtex";
}
const COMPACT_DEFAULT_HERO_FIELD = "DEFAULT_HERO_INDEX";

// QOL_PRESETS always available — ql_shared_presets.js loads first
const PRESETS = QOL_PRESETS;
const BREAD_PRESET_NAME = "BreadRollius";
const LEGACY_BREAD_PRESET_NAME = "Bread";

// (Storage/color bridge constants now live in ql_bridge.js — Phase 4)
const RUNTIME_PRESET_ATTR = "QOL_RUNTIME_PRESET";
// (Build save/clear bridge constants now live in ql_bridge.js — Phase 4)
const SETTINGS_SAVE_LOADER_ENABLED = true;
const SETTINGS_SAVE_HOVER_WARNING = "DO NOT USE THIS IN QUEUE OR MATCH";
const SETTINGS_SAVE_DISABLED_WARNING = "CURRENTLY IN EARLY ACCESS ON DISCORD DISABLED DUE TO BUGS";
const ON_DEATH_ARCADE_REQUEST_ATTR = "QOL_ON_DEATH_ARCADE_REQUEST";
const ON_DEATH_ARCADE_REQUEST_TOKEN_ATTR = "QOL_ON_DEATH_ARCADE_REQUEST_TOKEN";
const ON_DEATH_ARCADE_ACTIVE_ATTR = "QOL_ON_DEATH_ARCADE_ACTIVE";
// (HERO_HINT_ATTR now lives in ql_bridge.js — Phase 4)
const SETTING_ROW_RESET_KEYS_ATTR = "QOL_ROW_RESET_KEYS";
const RUNTIME_ROW_KIND_ATTR = "QOL_RUNTIME_ROW_KIND";
const RUNTIME_ROW_KEY_ATTR = "QOL_RUNTIME_ROW_KEY";
const MOD_VERSION = 32;
// QOL_SCHEMA_SEMVER always available — ql_shared_presets.js loads first
const MOD_DISPLAY_VERSION = QOL_SCHEMA_SEMVER;
const EXPORT_SCHEMA_SEMVER = MOD_DISPLAY_VERSION;
const COMPACT_WIRE_VERSION_2_0_0 = 1;
const COMPACT_WIRE_VERSION_2_0_1 = 2;
const EXPORT_SCHEMA_WIRE_VERSION = (String(EXPORT_SCHEMA_SEMVER || "") === "2.0.0")
    ? COMPACT_WIRE_VERSION_2_0_0
    : COMPACT_WIRE_VERSION_2_0_1;
const EXPORT_SCHEMA_TOKEN_VERSION = String(EXPORT_SCHEMA_SEMVER || "").replace(/\./g, "-");
const EXPORT_PREFIX = "[QOL-" + EXPORT_SCHEMA_TOKEN_VERSION + "]:";
const EXPORT_TOKEN_REGEX = /^\[QOL-(\d+-\d+-\d+)\]:([A-Za-z0-9\-_]+)$/i;
var currentTab = "Support";
var gCurrentSettingsSectionTitle = "";
var currentSearchQuery = "";
var gSearchCollectMode = false;
var gSearchCollectState = null;
var gEnumSectionSyncCallbacks = [];
var gSearchResultRenderMode = false;
var gSearchSectionIndexCacheKey = "";
var gSearchSectionIndexCache = null;
var gConfigDiffLabelCacheKey = "";
var gConfigDiffLabelMap = null;
var gSettingsOpenGuardUntilMs = 0;
var gSettingsToggleDebounceUntilMs = 0;
var gMinimapSizePreviewPanel = null;
var gMinimapSizePreviewCircle = null;
var gMinimapSizePreviewLabel = null;
var gMinimapSizePreviewHideToken = 0;
var gMinimapPreviewBaseRight = 30;
var gMinimapPreviewBaseBottom = 30;

const QOL_COLOR_PALETTE_OPTIONS = [
    { label: "Default", value: 0, hex: "" },
    { label: "White", value: 1, hex: "#f7f4e8" },
    { label: "Silver", value: 2, hex: "#bfc7cf" },
    { label: "Charcoal", value: 3, hex: "#33363f" },
    { label: "Brown", value: 22, hex: "#9a6743" },
    { label: "Gold", value: 23, hex: "#d9a441" },
    { label: "Red", value: 4, hex: "#ff3b47" },
    { label: "Coral", value: 5, hex: "#ff6f61" },
    { label: "Orange", value: 6, hex: "#ff8a2a" },
    { label: "Amber", value: 7, hex: "#ffb52e" },
    { label: "Yellow", value: 8, hex: "#ffe45c" },
    { label: "Lime", value: 9, hex: "#a8f04f" },
    { label: "Poison", value: 24, hex: "#8cff4f" },
    { label: "Green", value: 10, hex: "#45d66b" },
    { label: "Mint", value: 11, hex: "#63f0b5" },
    { label: "Teal", value: 12, hex: "#24c6a8" },
    { label: "Cyan", value: 13, hex: "#44e3ff" },
    { label: "Sky", value: 14, hex: "#64bfff" },
    { label: "Blue", value: 15, hex: "#3f78ff" },
    { label: "Indigo", value: 16, hex: "#6157ff" },
    { label: "Void", value: 25, hex: "#7c4dff" },
    { label: "Violet", value: 17, hex: "#9b5cff" },
    { label: "Purple", value: 18, hex: "#c15cff" },
    { label: "Magenta", value: 19, hex: "#ff4de3" },
    { label: "Pink", value: 20, hex: "#ff78bd" },
    { label: "Rose", value: 21, hex: "#ff5d89" },
    { label: "Crimson", value: 26, hex: "#b8142f" },
    { label: "Ice", value: 27, hex: "#b9f4ff" },
    { label: "Lavender", value: 28, hex: "#d7b2ff" },
    { label: "Black", value: 29, hex: "#05070a" }
];
var gZoomMinimapPreviewPanel = null;
var gZoomMinimapPreviewCircle = null;
var gZoomMinimapPreviewLabel = null;
var gZoomMinimapPreviewHideToken = 0;
var gZoomPreviewBaseX = 0;
var gZoomPreviewBaseY = 0;
var gZoomPreviewMode = "ALT";
var gZipBoostPreviewPanel = null;
var gZipBoostPreviewBox = null;
var gZipBoostPreviewLabel = null;
var gZipBoostPreviewHideToken = 0;
var gZipBoostPreviewBaseX = -520;
var gZipBoostPreviewBaseY = 20;
var gCrosshairStatsPreviewPanel = null;
var gCrosshairStatsPreviewBox = null;
var gCrosshairStatsPreviewLabel = null;
var gCrosshairStatsPreviewHideToken = 0;
var gCrosshairStatsPreviewBaseX = 130;
var gCrosshairStatsPreviewBaseY = 0;
var gUnsecuredSoulsPreviewPanel = null;
var gUnsecuredSoulsPreviewLabel = null;
var gUnsecuredSoulsPreviewHideToken = 0;
var gUnsecuredSoulsPreviewBaseX = -520;
var gUnsecuredSoulsPreviewBaseY = 110;
var gCompassPreviewPanel = null;
var gCompassPreviewBox = null;
var gCompassPreviewLabel = null;
var gCompassPreviewHideToken = 0;
var gCompassPreviewBaseX = 0;
var gCompassPreviewBaseY = 120;
// Speed has its own independent preview panel (mirrors the in-game QOLSpeedRoot,
// a sibling of the compass root — not a child of it).
var gSpeedPreviewPanel = null;
var gSpeedPreviewLabel = null;
var gSpeedPreviewHideToken = 0;
var gKeyboardOverlayPreviewPanel = null;
var gKeyboardOverlayPreviewBox = null;
var gKeyboardOverlayPreviewLabel = null;
var gKeyboardOverlayPreviewHideToken = 0;
var gKeyboardOverlayPreviewBaseX = 150;
var gKeyboardOverlayPreviewBaseY = 300;
var gItemCooldownPreviewPanel = null;
var gItemCooldownPreviewRow = null;
var gItemCooldownPreviewIcon = null;
var gItemCooldownPreviewLabel = null;
var gItemCooldownPreviewHideToken = 0;
var gAmmoPreviewPanel = null;
var gAmmoPreviewCurrentLabel = null;
var gAmmoPreviewTotalLabel = null;
var gAmmoPreviewHideToken = 0;
var gReloadCooldownPreviewPanel = null;
var gReloadCooldownPreviewRing = null;
var gReloadCooldownPreviewLabel = null;
var gReloadCooldownPreviewHideToken = 0;
var gUnitTargetPreviewPanel = null;
var gUnitTargetPreviewImage = null;
var gUnitTargetPreviewBinding = null;
var gUnitTargetPreviewHideToken = 0;
var gDamageReportPreviewPanel = null;
var gDamageReportPreviewBox = null;
var gDamageReportPreviewLabel = null;
var gDamageReportPreviewHideToken = 0;
var gShopPreviewPanel = null;
var gShopPreviewBox = null;
var gShopPreviewLabel = null;
var gShopPreviewHideToken = 0;
var gUnsecuredPlusPreviewPanel = null;
var gUnsecuredPlusPreviewIcon = null;
var gUnsecuredPlusPreviewText = null;
var gUnsecuredPlusPreviewValue = null;
var gUnsecuredPlusPreviewHideToken = 0;
var gRuntimeToggleState = {};
var gRuntimeSliderState = {};
var gRuntimeButtonGroupConfig = {};
var gRuntimeButtonGroupRefreshers = {};
var gRuntimeSliderResetters = {};
var gMinesweeperState = null;
var gMinesweeperTimerToken = 0;
var gFlappyState = null;
var gFlappyLoopToken = 0;
var gAimTrainerState = null;
var gAimTrainerLoopToken = 0;
var gTrainTrackingState = null;
var gTrainTrackingLoopToken = 0;
var gWhackRemState = null;
var gWhackRemLoopToken = 0;
var gArcadeSoundLastIndexByKey = {};
var gBlackjackState = null;
var gOnDeathArcadeBridgePollToken = 0;
var gOnDeathArcadeBridgePollRunning = false;
var gOnDeathArcadeLastRequestToken = "";
var gOnDeathArcadeSessionActive = false;
var gArcadeOnDeathSyncFns = [];
var gSettingsUiBuilt = false;
var gUserEditRevision = 0;
var gLastSavedConfigRaw = "";
var gConfigFeedbackLabel = null;
var gConfigFeedbackClearToken = 0;
var gSettingsListRefreshToken = 0;
var gSettingsListRefreshForcePending = false;
var gSettingsListLastRenderSig = "";
var gSettingsListRowSyncFns = [];
var gSettingsListRowSyncFnsBySig = {};
var gSettingsListActiveRenderSig = "";
var gSettingsListContentPanelBySig = {};
var gSettingsListSoftRefreshToken = 0;
var gSettingsListSearchModeActive = false;
var gSettingsTransitionWatchToken = 0;
var gSettingsTransitionWatchRunning = false;
var gSettingsOpenedInHideout = false;
var gSettingsTransitionCloseCooldownUntilMs = 0;
const SETTINGS_LIST_REFRESH_DEBOUNCE_SEC = 0.06;
const SETTINGS_TRANSITION_WATCH_INTERVAL_SEC = 0.25;
const SETTINGS_TRANSITION_CLOSE_COOLDOWN_MS = 1000;
const SETTINGS_TRANSITION_SIGNAL_RECHECK_SEC = [0.0, 0.2, 0.6];

const SETTINGS_LANGUAGE_ENGLISH = 0;
const SETTINGS_LANGUAGE_RUSSIAN = 1;
const SETTINGS_LANGUAGE_UKRAINIAN = 2;
const SETTINGS_LANGUAGE_POLISH = 3;
const SETTINGS_LANGUAGE_BULGARIAN = 4;
const SETTINGS_LANGUAGE_JAPANESE = 5;
const SETTINGS_LANGUAGE_CHINESE = 6;
const SETTINGS_LANGUAGE_FRENCH = 7;
const SETTINGS_LANGUAGE_PORTUGUESE = 8;
const SETTINGS_LANGUAGE_BRAZILIAN_PORTUGUESE = 9;
const SETTINGS_LANGUAGE_SPANISH = 10;
const SETTINGS_LANGUAGE_BELARUSIAN = 11;
const SETTINGS_LANGUAGE_KOREAN = 12;
const SETTINGS_LANGUAGE_ITALIAN = 13;
const SETTINGS_LANGUAGE_TURKISH = 14;
const SETTINGS_LANGUAGE_OPTIONS = [
    { label: "English", value: SETTINGS_LANGUAGE_ENGLISH },
    { label: "Russian", value: SETTINGS_LANGUAGE_RUSSIAN },
    { label: "Ukrainian", value: SETTINGS_LANGUAGE_UKRAINIAN },
    { label: "Polish", value: SETTINGS_LANGUAGE_POLISH },
    { label: "Bulgarian", value: SETTINGS_LANGUAGE_BULGARIAN },
    { label: "Belarusian", value: SETTINGS_LANGUAGE_BELARUSIAN },
    { label: "Japanese", value: SETTINGS_LANGUAGE_JAPANESE },
    { label: "Korean", value: SETTINGS_LANGUAGE_KOREAN },
    { label: "Chinese", value: SETTINGS_LANGUAGE_CHINESE },
    { label: "French", value: SETTINGS_LANGUAGE_FRENCH },
    { label: "Italian", value: SETTINGS_LANGUAGE_ITALIAN },
    { label: "Turkish", value: SETTINGS_LANGUAGE_TURKISH },
    { label: "Portuguese", value: SETTINGS_LANGUAGE_PORTUGUESE },
    { label: "BR Portuguese", value: SETTINGS_LANGUAGE_BRAZILIAN_PORTUGUESE },
    { label: "Spanish", value: SETTINGS_LANGUAGE_SPANISH }
];
const SETTINGS_THEME_DEFAULT = 0;
const SETTINGS_THEME_CREAM = 1;
const SETTINGS_THEME_KITTEN = 2;
const SETTINGS_THEME_EMO = 3;
const SETTINGS_THEME_OCEAN = 4;
const SETTINGS_THEME_PSYCHO = 5;
const SETTINGS_THEME_MUNFINS = 6;
const SETTINGS_THEME_CLASS_NAMES = [
    "SettingsThemeDefault",
    "SettingsThemeCream",
    "SettingsThemeKitten",
    "SettingsThemeEmo",
    "SettingsThemeOcean",
    "SettingsThemePsycho",
    "SettingsThemeMunfins"
];
const SETTINGS_THEME_ROOT_CLASS_NAMES = [
    "QOLThemeDefault",
    "QOLThemeCream",
    "QOLThemeKitten",
    "QOLThemeEmo",
    "QOLThemeOcean",
    "QOLThemePsycho",
    "QOLThemeMunfins"
];
const SETTINGS_THEME_OPTIONS = [
    { label: "Default", value: SETTINGS_THEME_DEFAULT },
    { label: "Emo", value: SETTINGS_THEME_EMO },
    { label: "Munfins", value: SETTINGS_THEME_MUNFINS },
    { label: "Ocean", value: SETTINGS_THEME_OCEAN },
    { label: "Kitten", value: SETTINGS_THEME_KITTEN },
    { label: "Cream", value: SETTINGS_THEME_CREAM },
    { label: "Psycho", value: SETTINGS_THEME_PSYCHO }
];
const SETTINGS_HEADER_MOG_LOGO_DEFAULT_SRC = "s2r://panorama/images/qollock/mog_site_logo2_png.vtex";
const SETTINGS_HEADER_MOG_LOGO_THEME_SRC = "s2r://panorama/images/qollock/mog_site_logo2_white_png.vtex";
const SETTINGS_HEADER_MUNFINS_LOGO_SRC = "s2r://panorama/images/qollock/munfins_logo_png.vtex";

function GetSettingsLanguage() {
    var raw = Math.round(Number(MOD_CONFIG && MOD_CONFIG.LANGUAGE));
    if (raw === SETTINGS_LANGUAGE_RUSSIAN) return SETTINGS_LANGUAGE_RUSSIAN;
    if (raw === SETTINGS_LANGUAGE_UKRAINIAN) return SETTINGS_LANGUAGE_UKRAINIAN;
    if (raw === SETTINGS_LANGUAGE_POLISH) return SETTINGS_LANGUAGE_POLISH;
    if (raw === SETTINGS_LANGUAGE_BULGARIAN) return SETTINGS_LANGUAGE_BULGARIAN;
    if (raw === SETTINGS_LANGUAGE_BELARUSIAN) return SETTINGS_LANGUAGE_BELARUSIAN;
    if (raw === SETTINGS_LANGUAGE_JAPANESE) return SETTINGS_LANGUAGE_JAPANESE;
    if (raw === SETTINGS_LANGUAGE_CHINESE) return SETTINGS_LANGUAGE_CHINESE;
    if (raw === SETTINGS_LANGUAGE_FRENCH) return SETTINGS_LANGUAGE_FRENCH;
    if (raw === SETTINGS_LANGUAGE_PORTUGUESE) return SETTINGS_LANGUAGE_PORTUGUESE;
    if (raw === SETTINGS_LANGUAGE_BRAZILIAN_PORTUGUESE) return SETTINGS_LANGUAGE_BRAZILIAN_PORTUGUESE;
    if (raw === SETTINGS_LANGUAGE_SPANISH) return SETTINGS_LANGUAGE_SPANISH;
    if (raw === SETTINGS_LANGUAGE_KOREAN) return SETTINGS_LANGUAGE_KOREAN;
    if (raw === SETTINGS_LANGUAGE_ITALIAN) return SETTINGS_LANGUAGE_ITALIAN;
    if (raw === SETTINGS_LANGUAGE_TURKISH) return SETTINGS_LANGUAGE_TURKISH;
    return SETTINGS_LANGUAGE_ENGLISH;
}

function IsRussianSettingsLanguage() {
    return GetSettingsLanguage() === SETTINGS_LANGUAGE_RUSSIAN;
}

function IsUkrainianSettingsLanguage() {
    return GetSettingsLanguage() === SETTINGS_LANGUAGE_UKRAINIAN;
}

function IsPolishSettingsLanguage() {
    return GetSettingsLanguage() === SETTINGS_LANGUAGE_POLISH;
}

function IsBulgarianSettingsLanguage() {
    return GetSettingsLanguage() === SETTINGS_LANGUAGE_BULGARIAN;
}

function IsBelarusianSettingsLanguage() {
    return GetSettingsLanguage() === SETTINGS_LANGUAGE_BELARUSIAN;
}

function IsJapaneseSettingsLanguage() {
    return GetSettingsLanguage() === SETTINGS_LANGUAGE_JAPANESE;
}

function IsChineseSettingsLanguage() {
    return GetSettingsLanguage() === SETTINGS_LANGUAGE_CHINESE;
}

function IsFrenchSettingsLanguage() {
    return GetSettingsLanguage() === SETTINGS_LANGUAGE_FRENCH;
}

function IsPortugueseSettingsLanguage() {
    return GetSettingsLanguage() === SETTINGS_LANGUAGE_PORTUGUESE;
}

function IsBrazilianPortugueseSettingsLanguage() {
    return GetSettingsLanguage() === SETTINGS_LANGUAGE_BRAZILIAN_PORTUGUESE;
}

function IsSpanishSettingsLanguage() {
    return GetSettingsLanguage() === SETTINGS_LANGUAGE_SPANISH;
}

function GetSettingsLanguageKey() {
    var lang = GetSettingsLanguage();
    if (lang === SETTINGS_LANGUAGE_RUSSIAN) return "ru";
    if (lang === SETTINGS_LANGUAGE_UKRAINIAN) return "uk";
    if (lang === SETTINGS_LANGUAGE_POLISH) return "pl";
    if (lang === SETTINGS_LANGUAGE_BULGARIAN) return "bg";
    if (lang === SETTINGS_LANGUAGE_BELARUSIAN) return "by";
    if (lang === SETTINGS_LANGUAGE_JAPANESE) return "ja";
    if (lang === SETTINGS_LANGUAGE_CHINESE) return "zh";
    if (lang === SETTINGS_LANGUAGE_FRENCH) return "fr";
    if (lang === SETTINGS_LANGUAGE_PORTUGUESE) return "pt";
    if (lang === SETTINGS_LANGUAGE_BRAZILIAN_PORTUGUESE) return "pt-br";
    if (lang === SETTINGS_LANGUAGE_SPANISH) return "es";
    if (lang === SETTINGS_LANGUAGE_KOREAN) return "ko";
    if (lang === SETTINGS_LANGUAGE_ITALIAN) return "it";
    if (lang === SETTINGS_LANGUAGE_TURKISH) return "tr";
    return "en";
}

function GetSettingsTheme() {
    var raw = Math.round(Number(MOD_CONFIG && MOD_CONFIG.SETTINGS_THEME));
    if (raw === SETTINGS_THEME_CREAM) return SETTINGS_THEME_CREAM;
    if (raw === SETTINGS_THEME_KITTEN) return SETTINGS_THEME_KITTEN;
    if (raw === SETTINGS_THEME_EMO) return SETTINGS_THEME_EMO;
    if (raw === SETTINGS_THEME_OCEAN) return SETTINGS_THEME_OCEAN;
    if (raw === SETTINGS_THEME_PSYCHO) return SETTINGS_THEME_PSYCHO;
    if (raw === SETTINGS_THEME_MUNFINS) return SETTINGS_THEME_MUNFINS;
    return SETTINGS_THEME_DEFAULT;
}

function GetSettingsThemeKey() {
    var theme = GetSettingsTheme();
    if (theme === SETTINGS_THEME_CREAM) return "cream";
    if (theme === SETTINGS_THEME_KITTEN) return "kitten";
    if (theme === SETTINGS_THEME_EMO) return "emo";
    if (theme === SETTINGS_THEME_OCEAN) return "ocean";
    if (theme === SETTINGS_THEME_PSYCHO) return "psycho";
    if (theme === SETTINGS_THEME_MUNFINS) return "munfins";
    return "default";
}

function ApplySettingsHeaderLogoTheme(theme) {
    var root = FindRootPanel();
    var context = $.GetContextPanel ? $.GetContextPanel() : null;
    var logo = null;
    if (context && context.FindChildTraverse) logo = context.FindChildTraverse("SettingsHeaderMogLogo");
    if (!logo && root && root.FindChildTraverse) logo = root.FindChildTraverse("SettingsHeaderMogLogo");
    var src = theme === SETTINGS_THEME_MUNFINS
        ? SETTINGS_HEADER_MUNFINS_LOGO_SRC
        : (theme === SETTINGS_THEME_DEFAULT ? SETTINGS_HEADER_MOG_LOGO_DEFAULT_SRC : SETTINGS_HEADER_MOG_LOGO_THEME_SRC);
    if (logo && logo.SetImage) {
        try { logo.SetImage(src); } catch(eLogoTheme) { WarnLog("settings", "op failed: " + (eLogoTheme && eLogoTheme.message ? eLogoTheme.message : String(eLogoTheme || ""))); }
    }

    var header = null;
    if (context && context.FindChildTraverse) header = context.FindChildTraverse("SettingsHeader");
    if (!header && root && root.FindChildTraverse) header = root.FindChildTraverse("SettingsHeader");
    if (!header || !header.FindChildTraverse) return;

    var title = header.FindChildTraverse("SettingsTitle");
    var titleAccent = header.FindChildTraverse("SettingsTitleAccent");
    var moglockLink = header.FindChildTraverse("ModVersionLabelTop");
    if (title) title.text = LocalizeSettingsText("LOCK", true);
    if (titleAccent) titleAccent.text = theme === SETTINGS_THEME_MUNFINS ? "Munfins" : LocalizeSettingsText("QOL", true);
    if (moglockLink) {
        moglockLink.visible = theme !== SETTINGS_THEME_MUNFINS;
        moglockLink.style.visibility = theme === SETTINGS_THEME_MUNFINS ? "collapse" : "visible";
    }
}

function ApplySettingsThemeClasses(settingsWindow) {
    var root = FindRootPanel();
    var context = $.GetContextPanel ? $.GetContextPanel() : null;
    var theme = GetSettingsTheme();
    var panels = [];
    if (!settingsWindow && context && context.FindChildTraverse) {
        settingsWindow = context.FindChildTraverse("SettingsWindow");
    }
    if (settingsWindow) panels.push(settingsWindow);
    if (context && context !== settingsWindow) panels.push(context);
    if (root && root !== settingsWindow) panels.push(root);
    for (var p = 0; p < panels.length; p++) {
        var panel = panels[p];
        if (!panel || !panel.SetHasClass) continue;
        for (var i = 0; i < SETTINGS_THEME_CLASS_NAMES.length; i++) {
            panel.SetHasClass(SETTINGS_THEME_CLASS_NAMES[i], i === theme);
            panel.SetHasClass(SETTINGS_THEME_ROOT_CLASS_NAMES[i], i === theme);
        }
    }
    ApplySettingsHeaderLogoTheme(theme);
}

function NormalizeLatinSettingsText(text) {
    var raw = String(text || "");
    return raw
        .replace(/[\u00e0\u00e1\u00e2\u00e3\u00e4\u00e5]/g, "a")
        .replace(/[\u00c0\u00c1\u00c2\u00c3\u00c4\u00c5]/g, "A")
        .replace(/[\u00e7]/g, "c")
        .replace(/[\u00c7]/g, "C")
        .replace(/[\u00e8\u00e9\u00ea\u00eb]/g, "e")
        .replace(/[\u00c8\u00c9\u00ca\u00cb]/g, "E")
        .replace(/[\u00ec\u00ed\u00ee\u00ef]/g, "i")
        .replace(/[\u00cc\u00cd\u00ce\u00cf]/g, "I")
        .replace(/[\u00f1]/g, "n")
        .replace(/[\u00d1]/g, "N")
        .replace(/[\u00f2\u00f3\u00f4\u00f5\u00f6]/g, "o")
        .replace(/[\u00d2\u00d3\u00d4\u00d5\u00d6]/g, "O")
        .replace(/[\u00f9\u00fa\u00fb\u00fc]/g, "u")
        .replace(/[\u00d9\u00da\u00db\u00dc]/g, "U")
        .replace(/[\u00fd\u00ff]/g, "y")
        .replace(/[\u00dd\u0178]/g, "Y")
        .replace(/[\u0153]/g, "oe")
        .replace(/[\u0152]/g, "OE")
        .replace(/[\u00e6]/g, "ae")
        .replace(/[\u00c6]/g, "AE")
        // Turkish-specific letters (o/O and u/U with diaeresis and c/C with cedilla are
        // already covered above): dotless/dotted i, g-breve, s-cedilla.
        .replace(/[\u0131]/g, "i")
        .replace(/[\u0130]/g, "I")
        .replace(/[\u011f]/g, "g")
        .replace(/[\u011e]/g, "G")
        .replace(/[\u015f]/g, "s")
        .replace(/[\u015e]/g, "S")
        .replace(/[\u2019\u2018]/g, "'")
        .replace(/[\u201c\u201d]/g, '"')
        .replace(/[\u2013\u2014]/g, "-")
        .replace(/\u2026/g, "...")
        .replace(/[^\x20-\x7E]/g, "");
}

function ShouldLocalizeTabContent() {

    return currentTab !== "Presets";
}

function LocalizeSettingsText(text, force) {
    if (text === undefined || text === null) return "";
    var raw = String(text);
    if (!force && !ShouldLocalizeTabContent()) return raw;

    var lang = GetSettingsLanguage();
    if (lang === SETTINGS_LANGUAGE_ENGLISH) return raw;

    // Phase 1: Look up from external locale maps (ql_settings_loc/*.js).
    var key = GetSettingsLanguageKey();
    var maps = (typeof window !== "undefined" && window.SETTINGS_LOCALE_TEXT) ? window.SETTINGS_LOCALE_TEXT : {};
    var map = maps[key] || null;
    if (map && map.hasOwnProperty(raw)) {
        var translated = map[raw];
        // Latin-script languages need diacritic normalization for comparison matching.
        if (key === "fr" || key === "it" || key === "tr" || key === "pt" || key === "pt-br" || key === "es") {
            return NormalizeLatinSettingsText(translated);
        }
        return translated;
    }
    return raw;
}

function SetLocalizedConfigFeedbackMessage(text, tone, durationMs) {
    SetConfigFeedbackMessage(LocalizeSettingsText(text, true), tone, durationMs);
}

const MINESWEEPER_ROWS = 9;
const MINESWEEPER_COLS = 9;
const MINESWEEPER_MINES = 10;
const MINESWEEPER_DEFAULT_DIFFICULTY = "EASY";
const MINESWEEPER_BOARD_WIDTH = 620;
const MINESWEEPER_BOARD_HEIGHT = 500;
const MINESWEEPER_DIFFICULTIES = [
    { id: "EASY", label: "Easy", rows: 9, cols: 9, mines: 10 },
    { id: "MEDIUM", label: "Medium", rows: 10, cols: 10, mines: 18 },
    { id: "HARD", label: "Hard", rows: 10, cols: 12, mines: 28 }
];
const FLAPPY_BIRD_IMAGE_SRC = "s2r://panorama/images/qollock/vampirebat_sm_psd_png.vtex";
const AIM_TRAINER_DURATION_SEC = 45;
const TRAIN_TRACKING_DURATION_SEC = 45;
const WHACK_A_REM_DURATION_SEC = 45;
const WHACK_A_REM_MAX_TARGETS = 3;
const WHACK_A_REM_DEFAULT_DIFFICULTY = "MEDIUM";
const WHACK_A_REM_DIFFICULTIES = [
    { id: "EASY", label: "Easy", maxConcurrent: 1, lifeStartSec: 1.05, lifeEndSec: 0.58, spawnDelaySec: 0.22 },
    { id: "MEDIUM", label: "Medium", maxConcurrent: 2, lifeStartSec: 1.18, lifeEndSec: 0.68, spawnDelaySec: 0.19 },
    { id: "HARD", label: "Hard", maxConcurrent: 3, lifeStartSec: 1.08, lifeEndSec: 0.56, spawnDelaySec: 0.16 }
];
const ON_DEATH_GAMES_POLL_SECONDS = 0.25;
const ON_DEATH_GAMES_TRIGGER_COOLDOWN_MS = 1500;
const ON_DEATH_ARCADE_GAME_KEYS = [
    "ON_DEATH_GAME_MINESWEEPER",
    "ON_DEATH_GAME_BLACKJACK",
    "ON_DEATH_GAME_FLAPPY_BAT",
    "ON_DEATH_GAME_GRAVES_TRAINER",
    "ON_DEATH_GAME_ZERGGY_MANIA",
    "ON_DEATH_GAME_WHACK_A_REM"
];
const ARCADE_DEFAULT_DIFFICULTY_OPTIONS = [
    { label: "Easy", id: "EASY" },
    { label: "Medium", id: "MEDIUM" },
    { label: "Hard", id: "HARD" }
];

function IsArcadeGameAudioEnabled() {
    return Number(MOD_CONFIG.ENABLE_GAME_AUDIO) === 1;
}

function PlayArcadeGameSoundEffect(eventName) {
    var resolved = String(eventName || "");
    if (!resolved) return;
    if (!IsArcadeGameAudioEnabled()) return;
    try { $.DispatchEvent("PlaySoundEffect", resolved); } catch(e0) { WarnLog("settings", "op failed: " + (e0 && e0.message ? e0.message : String(e0 || ""))); }
}

function ResolveArcadeDefaultDifficultyId() {
    var raw = MOD_CONFIG ? MOD_CONFIG.GAME_DEFAULT_DIFFICULTY : 1;
    var asNumber = Math.round(Number(raw));
    if (isFinite(asNumber)) {
        if (asNumber <= 0) return "EASY";
        if (asNumber >= 2) return "HARD";
        return "MEDIUM";
    }
    var asString = String(raw || "").toUpperCase();
    if (asString === "EASY" || asString === "HARD" || asString === "MEDIUM") return asString;
    return "MEDIUM";
}

const HERO_HINT_PUBLISH_INTERVAL_SEC = 1.0;
const FLAPPY_BAT_FLAP_SOUND_EVENT = "QOL.FlappyBat.Flap";
const FLAPPY_BAT_FAIL_SOUND_EVENTS = [
    "QOL.FlappyBat.Fail1",
    "QOL.FlappyBat.Fail2",
    "QOL.FlappyBat.Fail3",
    "QOL.FlappyBat.Fail4"
];
const BLACKJACK_ACTION_SOUND_EVENTS = [
    "QOL.Blackjack.Action1",
    "QOL.Blackjack.Action2",
    "QOL.Blackjack.Action3",
    "QOL.Blackjack.Action4"
];
const BLACKJACK_WIN_SOUND_EVENT = "QOL.Blackjack.Win";
const BLACKJACK_LOSE_SOUND_EVENT = "QOL.Blackjack.Lose";
const AIM_TRAINER_DEFAULT_DIFFICULTY = "MEDIUM";
const AIM_TRAINER_HIT_SOUND_EVENT = "QOL.GravesTrainer.Hit";
const AIM_TRAINER_DIFFICULTIES = [
    { id: "EASY", label: "Easy", durationSec: 45, targetStartSize: 84, targetEndSize: 52, targetLifeStartSec: 1.25, targetLifeEndSec: 0.82 },
    { id: "MEDIUM", label: "Medium", durationSec: 45, targetStartSize: 74, targetEndSize: 40, targetLifeStartSec: 1.05, targetLifeEndSec: 0.52 },
    { id: "HARD", label: "Hard", durationSec: 45, targetStartSize: 64, targetEndSize: 30, targetLifeStartSec: 0.90, targetLifeEndSec: 0.38 }
];
const AIM_TRAINER_TARGET_IMAGE_PATHS = [
    "s2r://panorama/images/qollock/digger_sm_psd_png.vtex",
    "s2r://panorama/images/qollock/astro_sm_psd_png.vtex",
    "s2r://panorama/images/qollock/viscous_sm_psd_png.vtex",
    "s2r://panorama/images/qollock/archer_sm_psd_png.vtex",
    "s2r://panorama/images/qollock/bull_sm_psd_png.vtex",
    "s2r://panorama/images/qollock/tengu_sm_psd_png.vtex"
];
const WHACK_A_REM_TARGET_IMAGE_SRC = "s2r://panorama/images/qollock/familiar_sm_psd_png.vtex";
const WHACK_A_REM_HIT_FLASH_SEC = 0.075;
const WHACK_A_REM_HIT_SOUND_EVENTS = [
    "QOL.WhackRem.Hit1",
    "QOL.WhackRem.Hit2",
    "QOL.WhackRem.Hit3",
    "QOL.WhackRem.Hit4",
    "QOL.WhackRem.Hit5",
    "QOL.WhackRem.Hit6",
    "QOL.WhackRem.Hit7",
    "QOL.WhackRem.Hit8",
    "QOL.WhackRem.Hit9"
];
const WHACK_A_REM_MISS_SOUND_EVENTS = [
    "QOL.WhackRem.Miss1",
    "QOL.WhackRem.Miss2",
    "QOL.WhackRem.Miss3"
];
const TRAIN_TRACKING_TARGET_IMAGE_SRC = "s2r://panorama/images/qollock/vampirebat_sm_psd_png.vtex";
const MINESWEEPER_MINE_IMAGE_SRC = "s2r://panorama/images/qollock/bebop_sm_psd_png.vtex";
const MINESWEEPER_EXPLODE_SOUND_EVENT = "QOL.BebopSweeper.Explode";
const MINESWEEPER_WIN_SOUND_EVENT = "QOL.BebopSweeper.Win";
const MINESWEEPER_STATUS_DEFAULT_TEXT = "Find all safe tiles. Right-click to flag.";
const BILLIARDS_TABLE_WIDTH = 640;
const BILLIARDS_TABLE_HEIGHT = 380;
const BILLIARDS_BALL_RADIUS = 11;
const BILLIARDS_POCKET_RADIUS = 22;
const BILLIARDS_FRICTION = 0.972;
const BILLIARDS_BOUNCE = 0.92;
const BILLIARDS_MIN_SPEED = 0.08;
const TRAIN_TRACKING_DEFAULT_DIFFICULTY = "MEDIUM";
const TRAIN_TRACKING_DIFFICULTIES = [
    { id: "EASY", label: "Easy", targetSize: 98, baseSpeed: 5.8, maxSpeed: 9.8, speedGainPerScore: 0.16, sampleIntervalSec: 0.12, jitterTickReset: 15 },
    { id: "MEDIUM", label: "Medium", targetSize: 84, baseSpeed: 7.4, maxSpeed: 12.2, speedGainPerScore: 0.22, sampleIntervalSec: 0.10, jitterTickReset: 13 },
    { id: "HARD", label: "Hard", targetSize: 66, baseSpeed: 10.2, maxSpeed: 16.5, speedGainPerScore: 0.34, sampleIntervalSec: 0.07, jitterTickReset: 10 }
];
const TRAIN_TRACKING_HIT_FLASH_SEC = 0.075;
const TRAIN_TRACKING_FLASH_MIN_INTERVAL_SEC = 0.32;
const TRAIN_TRACKING_HIT_SOUND_MIN_INTERVAL_SEC = 0.72;
const TRAIN_TRACKING_HIT_SOUND_EVENTS = [
    "QOL.ZerggyMania.Hit1",
    "QOL.ZerggyMania.Hit2",
    "QOL.ZerggyMania.Hit3",
    "QOL.ZerggyMania.Hit4",
    "QOL.ZerggyMania.Hit5"
];

function PickRandomIndexNoImmediateRepeat(options, stableKey) {
    if (!Array.isArray(options) || options.length <= 0) return -1;
    var len = options.length;
    if (len === 1) return 0;
    var key = String(stableKey || "");
    var last = (key && gArcadeSoundLastIndexByKey.hasOwnProperty(key))
        ? Number(gArcadeSoundLastIndexByKey[key])
        : -1;
    if (!isFinite(last) || last < 0 || last >= len) last = -1;

    var idx = Math.floor(Math.random() * len);
    if (!isFinite(idx) || idx < 0 || idx >= len) idx = 0;
    if (idx === last) {
        idx = (idx + 1 + Math.floor(Math.random() * (len - 1))) % len;
    }
    if (key) gArcadeSoundLastIndexByKey[key] = idx;
    return idx;
}

function QOLFilterFriendsList() {
    var root = $.GetContextPanel();
    while (root && root.GetParent && root.GetParent()) root = root.GetParent();
    var searchInput = root ? root.FindChildTraverse("FriendSearchInput") : null;
    if (!searchInput) return;

    var searchText = (searchInput.text || "").toLowerCase();
    var friendsContainer = root ? root.FindChildTraverse("FriendsCategories") : null;
    if (!friendsContainer) return;

    for (var i = 0; i < friendsContainer.GetChildCount(); i++) {
        var categoryPanel = friendsContainer.GetChild(i);
        if (!categoryPanel) continue;

        var friendEntries = categoryPanel.FindChildTraverse("FriendEntries");
        if (!friendEntries && categoryPanel.GetChildCount() > 1) {
            friendEntries = categoryPanel.GetChild(1);
        }
        if (!friendEntries) continue;

        for (var j = 0; j < friendEntries.GetChildCount(); j++) {
            var playerPanel = friendEntries.GetChild(j);
            if (!playerPanel) continue;

            var userNameHost = playerPanel.FindChildInLayoutFile ? playerPanel.FindChildInLayoutFile("UserName") : null;
            var nameLabel = null;
            if (userNameHost && userNameHost.GetChildCount && userNameHost.GetChildCount() > 0) {
                nameLabel = userNameHost.GetChild(0);
            }

            if (nameLabel && typeof nameLabel.text === "string") {
                var playerName = nameLabel.text.toLowerCase();
                playerPanel.visible = (searchText.length === 0 || playerName.indexOf(searchText) !== -1);
            } else {
                playerPanel.visible = true;
            }
        }
    }

    var searchClear = root ? root.FindChildTraverse("FriendSearchClear") : null;
    if (searchClear) {
        searchClear.visible = (searchText.length > 0);
    }
}

function QOLClearFriendsSearch() {
    var root = $.GetContextPanel();
    while (root && root.GetParent && root.GetParent()) root = root.GetParent();
    var searchInput = root ? root.FindChildTraverse("FriendSearchInput") : null;
    if (!searchInput) return;

    searchInput.text = "";
    if (searchInput.ClearSelection) searchInput.ClearSelection();
    QOLFilterFriendsList();
}

function QOLBindFriendsSearchHandlers() {
    var root = $.GetContextPanel();
    while (root && root.GetParent && root.GetParent()) root = root.GetParent();
    if (!root) return false;

    var searchInput = root.FindChildTraverse("FriendSearchInput");
    var searchClear = root.FindChildTraverse("FriendSearchClear");
    if (!searchInput || !searchClear) return false;

    searchInput.SetPanelEvent("ontextentrychange", function() {
        QOLFilterFriendsList();
    });
    searchClear.SetPanelEvent("onactivate", function() {
        QOLClearFriendsSearch();
    });
    QOLFilterFriendsList();
    return true;
}

function EnsureDiscordTextureLogo(targetBtn, logoId, logoClass) {
    if (!targetBtn) return;
    var resolvedLogoId = logoId || "FooterDiscordLogoTexture";
    var resolvedLogoClass = logoClass || "FooterDiscordLogoTexture";

    var legacyCssLogo = targetBtn.FindChildTraverse("FooterDiscordLogoCss");
    if (legacyCssLogo && legacyCssLogo.DeleteAsync) legacyCssLogo.DeleteAsync(0);

    var logoImage = targetBtn.FindChildTraverse(resolvedLogoId);
    if (!logoImage) {
        logoImage = $.CreatePanel("Image", targetBtn, resolvedLogoId);
    }
    if (!logoImage) return;

    logoImage.AddClass(resolvedLogoClass);
    logoImage.SetImage("s2r://panorama/images/qollock/discord_logo_png.vtex");
}

function EnsureDiscordFooterTextureLogo(discordFooterBtn) {
    EnsureDiscordTextureLogo(discordFooterBtn, "FooterDiscordLogoTexture", "FooterDiscordLogoTexture");
}

function QOLEnsureFriendsSearchHandlers() {
    if (!QOLBindFriendsSearchHandlers()) {
        $.Schedule(0.5, QOLEnsureFriendsSearchHandlers);
    }
}

function GetMinesweeperDifficultyById(id) {
    for (var i = 0; i < MINESWEEPER_DIFFICULTIES.length; i++) {
        if (MINESWEEPER_DIFFICULTIES[i].id === id) return MINESWEEPER_DIFFICULTIES[i];
    }
    return MINESWEEPER_DIFFICULTIES[0];
}

function GetAimTrainerDifficultyById(id) {
    for (var i = 0; i < AIM_TRAINER_DIFFICULTIES.length; i++) {
        if (AIM_TRAINER_DIFFICULTIES[i].id === id) return AIM_TRAINER_DIFFICULTIES[i];
    }
    return AIM_TRAINER_DIFFICULTIES[0];
}

function GetTrainTrackingDifficultyById(id) {
    for (var i = 0; i < TRAIN_TRACKING_DIFFICULTIES.length; i++) {
        if (TRAIN_TRACKING_DIFFICULTIES[i].id === id) return TRAIN_TRACKING_DIFFICULTIES[i];
    }
    return TRAIN_TRACKING_DIFFICULTIES[0];
}

function GetRandomAimTrainerTargetImagePath(previousPath) {
    if (!AIM_TRAINER_TARGET_IMAGE_PATHS || AIM_TRAINER_TARGET_IMAGE_PATHS.length <= 0) return "";
    if (AIM_TRAINER_TARGET_IMAGE_PATHS.length === 1) return AIM_TRAINER_TARGET_IMAGE_PATHS[0];
    var idx = Math.floor(Math.random() * AIM_TRAINER_TARGET_IMAGE_PATHS.length);
    var nextPath = AIM_TRAINER_TARGET_IMAGE_PATHS[idx];
    if (previousPath && nextPath === previousPath) {
        idx = (idx + 1) % AIM_TRAINER_TARGET_IMAGE_PATHS.length;
        nextPath = AIM_TRAINER_TARGET_IMAGE_PATHS[idx];
    }
    return nextPath;
}

function ApplyAimTrainerTargetImage(state) {
    if (!state || !state.targetImage || !state.targetImage.IsValid || !state.targetImage.IsValid()) return;
    var nextPath = GetRandomAimTrainerTargetImagePath(state.targetImagePath || "");
    if (!nextPath) return;
    state.targetImagePath = nextPath;
    try {
        state.targetImage.SetImage(nextPath);
    } catch (eSetImage) {
        try { state.targetImage.SetAttributeString("src", nextPath); } catch(eAttr) { WarnLog("settings", "op failed: " + (eAttr && eAttr.message ? eAttr.message : String(eAttr || ""))); }
    }
}

function SetPanelNonInteractive(panel) {
    if (!panel || !panel.IsValid || !panel.IsValid()) return;
    panel.hittest = false;
    panel.hittestchildren = false;
}

// Phase C.3: Fixed fallback — was always setting "1.00" regardless of opacityValue.
var SetPanelOpacitySafe = (typeof QOL_UTILS !== "undefined" && QOL_UTILS.SetPanelOpacitySafe) ? QOL_UTILS.SetPanelOpacitySafe : function(panel, opacityValue, fallbackValue) { if (panel && panel.style) { try { var v = Number(opacityValue); if (!isFinite(v)) v = Number(fallbackValue); if (!isFinite(v)) v = 1.0; panel.style.opacity = v.toFixed(2); } catch(e) { WarnLog("settings", "op failed: " + (e && e.message ? e.message : String(e || ""))); } } };

function GetPanelRectRelativeToContext(panel) {
    if (!panel || !panel.IsValid || !panel.IsValid()) return null;
    var context = $.GetContextPanel();
    var root = FindRootPanel();
    if (!context || !root) return null;
    var panelX = GetPanelXOffsetWithinAncestor(panel, root);
    var panelY = GetPanelYOffsetWithinAncestor(panel, root);
    var contextX = GetPanelXOffsetWithinAncestor(context, root);
    var contextY = GetPanelYOffsetWithinAncestor(context, root);
    if (!isFinite(panelX) || !isFinite(panelY) || !isFinite(contextX) || !isFinite(contextY)) return null;
    var width = Number(panel.actuallayoutwidth);
    var height = Number(panel.actuallayoutheight);
    if (!isFinite(width) || width < 0) width = 0;
    if (!isFinite(height) || height < 0) height = 0;
    return {
        x: Math.round(panelX - contextX),
        y: Math.round(panelY - contextY),
        width: Math.round(width),
        height: Math.round(height)
    };
}

function SetPreviewPanelPosition(panel, x, y) {
    if (!panel || !panel.style) return;
    var px = Math.round(Number(x) || 0);
    var py = Math.round(Number(y) || 0);
    panel.style.marginLeft = String(px) + "px";
    panel.style.marginTop = String(py) + "px";
}

function GetMinimapPreviewAnchorParent() {
    var contextRoot = $.GetContextPanel();
    return contextRoot || null;
}

function GetMinimapPreviewRightInsetPx() {
    var contextRoot = $.GetContextPanel();
    var searchRoot = FindRootPanel() || contextRoot;
    if (!contextRoot || !searchRoot || !searchRoot.FindChildTraverse) return 0;

    var minimapPersp = searchRoot.FindChildTraverse("minimap_persp");
    if (!minimapPersp || !minimapPersp.GetParent) return 0;
    var minimapParent = minimapPersp.GetParent();
    if (!minimapParent) return 0;

    var insetByOffset = Number(minimapParent.actualxoffset);
    if (isFinite(insetByOffset) && insetByOffset > 0) {
        return Math.round(insetByOffset);
    }

    var rootWidth = Number(contextRoot.actuallayoutwidth);
    var parentWidth = Number(minimapParent.actuallayoutwidth);
    if (!isFinite(rootWidth) || !isFinite(parentWidth) || rootWidth <= parentWidth || parentWidth <= 0) {
        return 0;
    }
    return Math.round((rootWidth - parentWidth) * 0.5);
}

function EnsureMinimapSizePreviewPanel() {
    if (gMinimapSizePreviewPanel && gMinimapSizePreviewPanel.IsValid && gMinimapSizePreviewPanel.IsValid()) {
        var anchorParent = GetMinimapPreviewAnchorParent();
        if (anchorParent && gMinimapSizePreviewPanel.GetParent && gMinimapSizePreviewPanel.GetParent() !== anchorParent) {
            gMinimapSizePreviewPanel.SetParent(anchorParent);
        }
        SetPanelNonInteractive(gMinimapSizePreviewPanel);
        SetPanelNonInteractive(gMinimapSizePreviewCircle);
        SetPanelNonInteractive(gMinimapSizePreviewLabel);
        return gMinimapSizePreviewPanel;
    }
    var parent = GetMinimapPreviewAnchorParent();
    if (!parent) return null;

    var panel = parent.FindChildTraverse("MinimapSizePreview");
    if (!panel) {
        panel = $.CreatePanel("Panel", parent, "MinimapSizePreview");
    }
    if (!panel) return null;

    var circle = panel.FindChildTraverse("MinimapSizePreviewCircle");
    if (!circle) {
        circle = $.CreatePanel("Panel", panel, "MinimapSizePreviewCircle");
    }
    var label = panel.FindChildTraverse("MinimapSizePreviewLabel");
    if (!label) {
        label = $.CreatePanel("Label", panel, "MinimapSizePreviewLabel");
    }
    SetPanelNonInteractive(panel);
    SetPanelNonInteractive(circle);
    SetPanelNonInteractive(label);

    gMinimapSizePreviewPanel = panel;
    gMinimapSizePreviewCircle = circle;
    gMinimapSizePreviewLabel = label;
    return panel;
}

function EnsureZoomMinimapPreviewPanel() {
    if (gZoomMinimapPreviewPanel && gZoomMinimapPreviewPanel.IsValid && gZoomMinimapPreviewPanel.IsValid()) {
        SetPanelNonInteractive(gZoomMinimapPreviewPanel);
        SetPanelNonInteractive(gZoomMinimapPreviewCircle);
        SetPanelNonInteractive(gZoomMinimapPreviewLabel);
        return gZoomMinimapPreviewPanel;
    }
    var root = $.GetContextPanel();
    if (!root) return null;

    var panel = root.FindChildTraverse("ZoomMinimapPreview");
    if (!panel) {
        panel = $.CreatePanel("Panel", root, "ZoomMinimapPreview");
    }
    if (!panel) return null;

    var circle = panel.FindChildTraverse("ZoomMinimapPreviewCircle");
    if (!circle) {
        circle = $.CreatePanel("Panel", panel, "ZoomMinimapPreviewCircle");
    }
    var label = panel.FindChildTraverse("ZoomMinimapPreviewLabel");
    if (!label) {
        label = $.CreatePanel("Label", panel, "ZoomMinimapPreviewLabel");
    }
    SetPanelNonInteractive(panel);
    SetPanelNonInteractive(circle);
    SetPanelNonInteractive(label);

    gZoomMinimapPreviewPanel = panel;
    gZoomMinimapPreviewCircle = circle;
    gZoomMinimapPreviewLabel = label;
    return panel;
}

function EnsureZipBoostPreviewPanel() {
    if (gZipBoostPreviewPanel && gZipBoostPreviewPanel.IsValid && gZipBoostPreviewPanel.IsValid()) {
        SetPanelNonInteractive(gZipBoostPreviewPanel);
        SetPanelNonInteractive(gZipBoostPreviewBox);
        SetPanelNonInteractive(gZipBoostPreviewLabel);
        return gZipBoostPreviewPanel;
    }
    var root = $.GetContextPanel();
    if (!root) return null;

    var panel = root.FindChildTraverse("ZipBoostPreview");
    if (!panel) {
        panel = $.CreatePanel("Panel", root, "ZipBoostPreview");
    }
    if (!panel) return null;

    var box = panel.FindChildTraverse("ZipBoostPreviewBox");
    if (!box) {
        box = $.CreatePanel("Panel", panel, "ZipBoostPreviewBox");
    }
    var label = panel.FindChildTraverse("ZipBoostPreviewLabel");
    if (!label) {
        label = $.CreatePanel("Label", box, "ZipBoostPreviewLabel");
        label.text = LocalizeSettingsText("ZIP BOOST", true);
    }
    SetPanelNonInteractive(panel);
    SetPanelNonInteractive(box);
    SetPanelNonInteractive(label);

    gZipBoostPreviewPanel = panel;
    gZipBoostPreviewBox = box;
    gZipBoostPreviewLabel = label;
    return panel;
}

// Build one preview row that is a structural clone of an in-game crosshair-overlay row, using the
// overlay's own classes (styled via the ql_feat_crosshair_stats import in ql_settings.css) so it
// matches pixel-for-pixel: a dark pill with a colored left accent, a property icon, and a value.
function CreateCrosshairStatsPreviewStatRow(box, idSuffix, iconClass, valueText, isDebuff) {
    var row = box.FindChildTraverse("CrosshairStatsPreviewRow_" + idSuffix);
    if (!row) {
        row = $.CreatePanel("Panel", box, "CrosshairStatsPreviewRow_" + idSuffix);
        row.AddClass("QOLCrosshairStatRow");
        row.AddClass(isDebuff ? "isDebuff" : "isBuff");
        var icon = $.CreatePanel("Panel", row, "CrosshairStatsPreviewIcon_" + idSuffix);
        icon.AddClass("QOLCrosshairStatIcon");
        icon.AddClass("statIcon");
        icon.AddClass("PropertiesIcon");
        icon.AddClass(iconClass);
        var value = $.CreatePanel("Label", row, "CrosshairStatsPreviewValue_" + idSuffix);
        value.AddClass("QOLCrosshairStatValue");
        value.text = valueText;
    }
    SetPanelNonInteractive(row);
    return row;
}

function EnsureCrosshairStatsPreviewPanel() {
    if (gCrosshairStatsPreviewPanel && gCrosshairStatsPreviewPanel.IsValid && gCrosshairStatsPreviewPanel.IsValid()) {
        SetPanelNonInteractive(gCrosshairStatsPreviewPanel);
        SetPanelNonInteractive(gCrosshairStatsPreviewBox);
        SetPanelNonInteractive(gCrosshairStatsPreviewLabel);
        return gCrosshairStatsPreviewPanel;
    }
    var root = $.GetContextPanel();
    if (!root) return null;

    var panel = root.FindChildTraverse("CrosshairStatsPreview");
    if (!panel) {
        panel = $.CreatePanel("Panel", root, "CrosshairStatsPreview");
    }
    if (!panel) return null;

    var box = panel.FindChildTraverse("CrosshairStatsPreviewBox");
    if (!box) {
        box = $.CreatePanel("Panel", panel, "CrosshairStatsPreviewBox");
    }
    var label = panel.FindChildTraverse("CrosshairStatsPreviewLabel");
    if (!label) {
        label = $.CreatePanel("Label", box, "CrosshairStatsPreviewLabel");
        label.text = LocalizeSettingsText("ACTIVE STATS", true);
    }
    // Real copy of the in-game overlay rows (ql_feat_crosshairstats.js builds the same structure):
    //   .QOLCrosshairStatRow[.isDebuff|.isBuff] > .QOLCrosshairStatIcon.statIcon.PropertiesIcon.<Stat> + .QOLCrosshairStatValue
    CreateCrosshairStatsPreviewStatRow(box, "fireRate",     "FireRate",     "−15%", true);
    CreateCrosshairStatsPreviewStatRow(box, "moveSpeed",    "MoveSpeed",    "−1.8 m/s", true);
    CreateCrosshairStatsPreviewStatRow(box, "bulletResist", "ResistBullet", "+20%", false);
    SetPanelNonInteractive(panel);
    SetPanelNonInteractive(box);
    SetPanelNonInteractive(label);

    gCrosshairStatsPreviewPanel = panel;
    gCrosshairStatsPreviewBox = box;
    gCrosshairStatsPreviewLabel = label;
    return panel;
}

function EnsureUnsecuredSoulsPreviewPanel() {
    if (gUnsecuredSoulsPreviewPanel && gUnsecuredSoulsPreviewPanel.IsValid && gUnsecuredSoulsPreviewPanel.IsValid()) {
        SetPanelNonInteractive(gUnsecuredSoulsPreviewPanel);
        SetPanelNonInteractive(gUnsecuredSoulsPreviewLabel);
        return gUnsecuredSoulsPreviewPanel;
    }
    var root = $.GetContextPanel();
    if (!root) return null;

    var panel = root.FindChildTraverse("UnsecuredSoulsPreview");
    if (!panel) {
        panel = $.CreatePanel("Panel", root, "UnsecuredSoulsPreview");
    }
    if (!panel) return null;

    var label = panel.FindChildTraverse("UnsecuredSoulsPreviewLabel");
    if (!label) {
        label = $.CreatePanel("Label", panel, "UnsecuredSoulsPreviewLabel");
        label.text = "23s";
    }
    SetPanelNonInteractive(panel);
    SetPanelNonInteractive(label);

    gUnsecuredSoulsPreviewPanel = panel;
    gUnsecuredSoulsPreviewLabel = label;
    return panel;
}

function EnsureCompassPreviewPanel() {
    if (gCompassPreviewPanel && gCompassPreviewPanel.IsValid && gCompassPreviewPanel.IsValid()) {
        SetPanelNonInteractive(gCompassPreviewPanel);
        SetPanelNonInteractive(gCompassPreviewBox);
        SetPanelNonInteractive(gCompassPreviewLabel);
        return gCompassPreviewPanel;
    }
    var root = $.GetContextPanel();
    if (!root) return null;

    var panel = root.FindChildTraverse("CompassPreview");
    if (!panel) {
        panel = $.CreatePanel("Panel", root, "CompassPreview");
    }
    if (!panel) return null;

    var box = panel.FindChildTraverse("CompassPreviewBox");
    if (!box) {
        box = $.CreatePanel("Panel", panel, "CompassPreviewBox");
    }

    var label = panel.FindChildTraverse("CompassPreviewLabel");
    if (!label) {
        label = $.CreatePanel("Label", panel, "CompassPreviewLabel");
    }

    SetPanelNonInteractive(panel);
    SetPanelNonInteractive(box);
    SetPanelNonInteractive(label);

    gCompassPreviewPanel = panel;
    gCompassPreviewBox = box;
    gCompassPreviewLabel = label;
    return panel;
}

// Speed preview — an independent panel (sibling of the compass preview),
// mirroring the in-game QOLSpeedRoot which is its own root panel under the
// gameplay HUD, NOT a child of the compass. Keeping the two previews separate
// is what makes the speed offset behave consistently with the compass offset.
function EnsureSpeedPreviewPanel() {
    if (gSpeedPreviewPanel && gSpeedPreviewPanel.IsValid && gSpeedPreviewPanel.IsValid()) {
        SetPanelNonInteractive(gSpeedPreviewPanel);
        SetPanelNonInteractive(gSpeedPreviewLabel);
        return gSpeedPreviewPanel;
    }
    var root = $.GetContextPanel();
    if (!root) return null;

    var panel = root.FindChildTraverse("SpeedPreview");
    if (!panel) {
        panel = $.CreatePanel("Panel", root, "SpeedPreview");
    }
    if (!panel) return null;

    var label = panel.FindChildTraverse("SpeedPreviewLabel");
    if (!label) {
        label = $.CreatePanel("Label", panel, "SpeedPreviewLabel");
    }

    SetPanelNonInteractive(panel);
    SetPanelNonInteractive(label);

    gSpeedPreviewPanel = panel;
    gSpeedPreviewLabel = label;
    return panel;
}

function EnsureKeyboardOverlayPreviewPanel() {
    if (gKeyboardOverlayPreviewPanel && gKeyboardOverlayPreviewPanel.IsValid && gKeyboardOverlayPreviewPanel.IsValid()) {
        SetPanelNonInteractive(gKeyboardOverlayPreviewPanel);
        SetPanelNonInteractive(gKeyboardOverlayPreviewBox);
        SetPanelNonInteractive(gKeyboardOverlayPreviewLabel);
        return gKeyboardOverlayPreviewPanel;
    }
    var root = $.GetContextPanel();
    if (!root) return null;

    var panel = root.FindChildTraverse("KeyboardOverlayPreview");
    if (!panel) {
        panel = $.CreatePanel("Panel", root, "KeyboardOverlayPreview");
    }
    if (!panel) return null;

    var box = panel.FindChildTraverse("KeyboardOverlayPreviewBox");
    if (!box) {
        box = $.CreatePanel("Panel", panel, "KeyboardOverlayPreviewBox");
    }

    var sample = panel.FindChildTraverse("KeyboardOverlayPreviewSample");
    if (!sample) {
        sample = $.CreatePanel("Panel", box, "KeyboardOverlayPreviewSample");
        sample.AddClass("KeyboardOverlayPreviewRow");

        var k1 = $.CreatePanel("Panel", sample, "");
        k1.AddClass("KeyboardOverlayPreviewKey");
        k1.AddClass("Wide");

        var k2 = $.CreatePanel("Panel", sample, "");
        k2.AddClass("KeyboardOverlayPreviewKey");

        var k3 = $.CreatePanel("Panel", sample, "");
        k3.AddClass("KeyboardOverlayPreviewKey");

        var k4 = $.CreatePanel("Panel", sample, "");
        k4.AddClass("KeyboardOverlayPreviewKey");
        k4.AddClass("Wide");

        var k5 = $.CreatePanel("Panel", sample, "");
        k5.AddClass("KeyboardOverlayPreviewKey");
        k5.AddClass("Spacer");
    }

    var label = panel.FindChildTraverse("KeyboardOverlayPreviewLabel");
    if (!label) {
        label = $.CreatePanel("Label", box, "KeyboardOverlayPreviewLabel");
    }
    SetPanelNonInteractive(panel);
    SetPanelNonInteractive(box);
    SetPanelNonInteractive(sample);
    SetPanelNonInteractive(label);

    gKeyboardOverlayPreviewPanel = panel;
    gKeyboardOverlayPreviewBox = box;
    gKeyboardOverlayPreviewLabel = label;
    return panel;
}

function EnsureItemCooldownPreviewPanel() {
    if (gItemCooldownPreviewPanel && gItemCooldownPreviewPanel.IsValid && gItemCooldownPreviewPanel.IsValid()) {
        SetPanelNonInteractive(gItemCooldownPreviewPanel);
        SetPanelNonInteractive(gItemCooldownPreviewRow);
        SetPanelNonInteractive(gItemCooldownPreviewIcon);
        SetPanelNonInteractive(gItemCooldownPreviewLabel);
        return gItemCooldownPreviewPanel;
    }
    var root = $.GetContextPanel();
    if (!root) return null;

    var panel = root.FindChildTraverse("ItemCooldownPreview");
    if (!panel) {
        panel = $.CreatePanel("Panel", root, "ItemCooldownPreview");
    }
    if (!panel) return null;

    var row = panel.FindChildTraverse("ItemCooldownPreviewRow");
    if (!row) {
        row = $.CreatePanel("Panel", panel, "ItemCooldownPreviewRow");
    }

    var icon = panel.FindChildTraverse("ItemCooldownPreviewIcon");
    if (!icon) {
        icon = $.CreatePanel("Panel", row, "ItemCooldownPreviewIcon");
    }

    var modContainer = panel.FindChildTraverse("ItemCooldownPreviewModContainer");
    if (!modContainer) {
        modContainer = $.CreatePanel("Panel", icon, "ItemCooldownPreviewModContainer");
    }

    var bg = panel.FindChildTraverse("ItemCooldownPreviewBg");
    if (!bg) {
        bg = $.CreatePanel("Panel", modContainer, "ItemCooldownPreviewBg");
    }

    var image = panel.FindChildTraverse("ItemCooldownPreviewImage");
    if (!image) {
        image = $.CreatePanel("Panel", modContainer, "ItemCooldownPreviewImage");
    }

    var mask = panel.FindChildTraverse("ItemCooldownPreviewMask");
    if (!mask) {
        mask = $.CreatePanel("Panel", modContainer, "ItemCooldownPreviewMask");
    }

    var label = panel.FindChildTraverse("ItemCooldownPreviewLabel");
    if (!label) {
        label = $.CreatePanel("Label", icon, "ItemCooldownPreviewLabel");
        label.text = "7";
    }
    SetPanelNonInteractive(panel);
    SetPanelNonInteractive(row);
    SetPanelNonInteractive(icon);
    SetPanelNonInteractive(modContainer);
    SetPanelNonInteractive(bg);
    SetPanelNonInteractive(image);
    SetPanelNonInteractive(mask);
    SetPanelNonInteractive(label);

    gItemCooldownPreviewPanel = panel;
    gItemCooldownPreviewRow = row;
    gItemCooldownPreviewIcon = icon;
    gItemCooldownPreviewLabel = label;
    return panel;
}

function EnsureAmmoPreviewPanel() {
    if (gAmmoPreviewPanel && gAmmoPreviewPanel.IsValid && gAmmoPreviewPanel.IsValid()) {
        SetPanelNonInteractive(gAmmoPreviewPanel);
        SetPanelNonInteractive(gAmmoPreviewCurrentLabel);
        SetPanelNonInteractive(gAmmoPreviewTotalLabel);
        return gAmmoPreviewPanel;
    }
    var root = $.GetContextPanel();
    if (!root) return null;

    var panel = root.FindChildTraverse("AmmoPreview");
    if (!panel) panel = $.CreatePanel("Panel", root, "AmmoPreview");
    if (!panel) return null;

    var currentLabel = panel.FindChildTraverse("AmmoPreviewCurrent");
    if (!currentLabel) currentLabel = $.CreatePanel("Label", panel, "AmmoPreviewCurrent");
    var totalLabel = panel.FindChildTraverse("AmmoPreviewTotal");
    if (!totalLabel) totalLabel = $.CreatePanel("Label", panel, "AmmoPreviewTotal");

    SetPanelNonInteractive(panel);
    SetPanelNonInteractive(currentLabel);
    SetPanelNonInteractive(totalLabel);

    gAmmoPreviewPanel = panel;
    gAmmoPreviewCurrentLabel = currentLabel;
    gAmmoPreviewTotalLabel = totalLabel;
    return panel;
}

function EnsureReloadCooldownPreviewPanel() {
    if (gReloadCooldownPreviewPanel && gReloadCooldownPreviewPanel.IsValid && gReloadCooldownPreviewPanel.IsValid()) {
        SetPanelNonInteractive(gReloadCooldownPreviewPanel);
        SetPanelNonInteractive(gReloadCooldownPreviewRing);
        SetPanelNonInteractive(gReloadCooldownPreviewLabel);
        return gReloadCooldownPreviewPanel;
    }
    var root = $.GetContextPanel();
    if (!root) return null;

    var panel = root.FindChildTraverse("ReloadCooldownPreview");
    if (!panel) panel = $.CreatePanel("Panel", root, "ReloadCooldownPreview");
    if (!panel) return null;

    var ring = panel.FindChildTraverse("ReloadCooldownPreviewRing");
    if (!ring) ring = $.CreatePanel("Panel", panel, "ReloadCooldownPreviewRing");
    var label = panel.FindChildTraverse("ReloadCooldownPreviewLabel");
    if (!label) label = $.CreatePanel("Label", ring, "ReloadCooldownPreviewLabel");
    if (label && !label.text) label.text = "1.3";

    SetPanelNonInteractive(panel);
    SetPanelNonInteractive(ring);
    SetPanelNonInteractive(label);

    gReloadCooldownPreviewPanel = panel;
    gReloadCooldownPreviewRing = ring;
    gReloadCooldownPreviewLabel = label;
    return panel;
}

function EnsureUnitTargetPreviewPanel() {
    if (gUnitTargetPreviewPanel && gUnitTargetPreviewPanel.IsValid && gUnitTargetPreviewPanel.IsValid()) {
        SetPanelNonInteractive(gUnitTargetPreviewPanel);
        SetPanelNonInteractive(gUnitTargetPreviewImage);
        SetPanelNonInteractive(gUnitTargetPreviewBinding);
        return gUnitTargetPreviewPanel;
    }
    var root = $.GetContextPanel();
    if (!root) return null;

    var panel = root.FindChildTraverse("UnitTargetPreview");
    if (!panel) panel = $.CreatePanel("Panel", root, "UnitTargetPreview");
    if (!panel) return null;

    var image = panel.FindChildTraverse("UnitTargetPreviewImage");
    if (!image) image = $.CreatePanel("Panel", panel, "UnitTargetPreviewImage");
    var binding = panel.FindChildTraverse("UnitTargetPreviewBinding");
    if (!binding) binding = $.CreatePanel("Label", panel, "UnitTargetPreviewBinding");
    if (binding) binding.text = "Q";

    SetPanelNonInteractive(panel);
    SetPanelNonInteractive(image);
    SetPanelNonInteractive(binding);

    gUnitTargetPreviewPanel = panel;
    gUnitTargetPreviewImage = image;
    gUnitTargetPreviewBinding = binding;
    return panel;
}

function EnsureDamageReportPreviewPanel() {
    if (gDamageReportPreviewPanel && gDamageReportPreviewPanel.IsValid && gDamageReportPreviewPanel.IsValid()) {
        SetPanelNonInteractive(gDamageReportPreviewPanel);
        SetPanelNonInteractive(gDamageReportPreviewBox);
        SetPanelNonInteractive(gDamageReportPreviewLabel);
        return gDamageReportPreviewPanel;
    }
    var root = $.GetContextPanel();
    if (!root) return null;

    var panel = root.FindChildTraverse("DamageReportPreview");
    if (!panel) panel = $.CreatePanel("Panel", root, "DamageReportPreview");
    if (!panel) return null;

    var box = panel.FindChildTraverse("DamageReportPreviewBox");
    if (!box) box = $.CreatePanel("Panel", panel, "DamageReportPreviewBox");
    var label = panel.FindChildTraverse("DamageReportPreviewLabel");
    if (!label) label = $.CreatePanel("Label", box, "DamageReportPreviewLabel");
    if (label && !label.text) label.text = "DAMAGE REPORT";

    SetPanelNonInteractive(panel);
    SetPanelNonInteractive(box);
    SetPanelNonInteractive(label);

    gDamageReportPreviewPanel = panel;
    gDamageReportPreviewBox = box;
    gDamageReportPreviewLabel = label;
    return panel;
}

function EnsureShopPreviewPanel() {
    if (gShopPreviewPanel && gShopPreviewPanel.IsValid && gShopPreviewPanel.IsValid()) {
        SetPanelNonInteractive(gShopPreviewPanel);
        SetPanelNonInteractive(gShopPreviewBox);
        SetPanelNonInteractive(gShopPreviewLabel);
        return gShopPreviewPanel;
    }
    var root = $.GetContextPanel();
    if (!root) return null;

    var panel = root.FindChildTraverse("ShopPreview");
    if (!panel) panel = $.CreatePanel("Panel", root, "ShopPreview");
    if (!panel) return null;

    var box = panel.FindChildTraverse("ShopPreviewBox");
    if (!box) box = $.CreatePanel("Panel", panel, "ShopPreviewBox");
    var label = panel.FindChildTraverse("ShopPreviewLabel");
    if (!label) label = $.CreatePanel("Label", box, "ShopPreviewLabel");
    if (label && !label.text) label.text = "SHOP";

    SetPanelNonInteractive(panel);
    SetPanelNonInteractive(box);
    SetPanelNonInteractive(label);

    gShopPreviewPanel = panel;
    gShopPreviewBox = box;
    gShopPreviewLabel = label;
    return panel;
}

function EnsureUnsecuredPlusPreviewPanel() {
    if (gUnsecuredPlusPreviewPanel && gUnsecuredPlusPreviewPanel.IsValid && gUnsecuredPlusPreviewPanel.IsValid()) {
        SetPanelNonInteractive(gUnsecuredPlusPreviewPanel);
        SetPanelNonInteractive(gUnsecuredPlusPreviewIcon);
        SetPanelNonInteractive(gUnsecuredPlusPreviewText);
        SetPanelNonInteractive(gUnsecuredPlusPreviewValue);
        return gUnsecuredPlusPreviewPanel;
    }
    var root = $.GetContextPanel();
    if (!root) return null;

    var panel = root.FindChildTraverse("UnsecuredPlusPreview");
    if (!panel) panel = $.CreatePanel("Panel", root, "UnsecuredPlusPreview");
    if (!panel) return null;

    var icon = panel.FindChildTraverse("UnsecuredPlusPreviewIcon");
    if (!icon) icon = $.CreatePanel("Panel", panel, "UnsecuredPlusPreviewIcon");
    var text = panel.FindChildTraverse("UnsecuredPlusPreviewText");
    if (!text) text = $.CreatePanel("Label", panel, "UnsecuredPlusPreviewText");
    var value = panel.FindChildTraverse("UnsecuredPlusPreviewValue");
    if (!value) value = $.CreatePanel("Label", panel, "UnsecuredPlusPreviewValue");
    if (text && !text.text) text.text = "UNSECURED";
    if (value && !value.text) value.text = "538";

    SetPanelNonInteractive(panel);
    SetPanelNonInteractive(icon);
    SetPanelNonInteractive(text);
    SetPanelNonInteractive(value);

    gUnsecuredPlusPreviewPanel = panel;
    gUnsecuredPlusPreviewIcon = icon;
    gUnsecuredPlusPreviewText = text;
    gUnsecuredPlusPreviewValue = value;
    return panel;
}

function GetMinimapPreviewDiameter(sizePx) {
    return Math.round(Math.max(50, Math.min(1200, Number(sizePx) || 0)));
}

function IsMinimapPreviewConfig(configId) {
    return configId === "MINIMAP_SMALL_SIZE" ||
        configId === "MINIMAP_X_OFFSET" ||
        configId === "MINIMAP_Y_OFFSET" ||
        configId === "MINIMAP_BASE_OPACITY" ||
        configId === "MINIMAL_MINIMAP_OPACITY";
}

function IsZoomMinimapPreviewConfig(configId) {
    return configId === "MINIMAP_LARGE_SIZE" ||
        configId === "ZOOM_X_OFFSET" ||
        configId === "ZOOM_Y_OFFSET" ||
        configId === "MINIMAP_LARGE_SIZE_ALT" ||
        configId === "ZOOM_X_OFFSET_ALT" ||
        configId === "ZOOM_Y_OFFSET_ALT" ||
        configId === "MINIMAP_LARGE_SIZE_TAB" ||
        configId === "ZOOM_X_OFFSET_TAB" ||
        configId === "ZOOM_Y_OFFSET_TAB" ||
        configId === "ALT_ZOOM_OPACITY" ||
        configId === "TAB_ZOOM_OPACITY";
}

function GetZoomPreviewModeForConfigId(configId) {
    if (configId === "TAB_ZOOM_OPACITY" ||
        configId === "MINIMAP_LARGE_SIZE_TAB" ||
        configId === "ZOOM_X_OFFSET_TAB" ||
        configId === "ZOOM_Y_OFFSET_TAB") {
        return "TAB";
    }
    return "ALT";
}

function GetZoomConfigKeysForMode(mode) {
    if (mode === "TAB") {
        return {
            size: "MINIMAP_LARGE_SIZE_TAB",
            x: "ZOOM_X_OFFSET_TAB",
            y: "ZOOM_Y_OFFSET_TAB",
            opacity: "TAB_ZOOM_OPACITY"
        };
    }
    return {
        size: "MINIMAP_LARGE_SIZE_ALT",
        x: "ZOOM_X_OFFSET_ALT",
        y: "ZOOM_Y_OFFSET_ALT",
        opacity: "ALT_ZOOM_OPACITY"
    };
}


function ResolveCustomAnnouncerMetaField(source, keyList) {
    if (!source || !keyList || !keyList.length) return "";
    for (var i = 0; i < keyList.length; i++) {
        var key = String(keyList[i] || "");
        if (!key) continue;
        if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
        var value = String(source[key] == null ? "" : source[key]).trim();
        if (value.length > 0) return value;
    }
    return "";
}

function ResolveCustomAnnouncerSlotScriptMetadata(slotIndex) {
    var safeIndex = Math.max(1, Math.min(5, Math.round(Number(slotIndex) || 1)));
    var source = null;
    var globalKey = "QOL_CUSTOM_ANNOUNCER_SLOT" + String(safeIndex) + "_META";
    var registryKey = String(safeIndex);

    try {
        if (typeof globalThis === "object" && globalThis) {
            var registry = globalThis.QOL_CUSTOM_ANNOUNCER_PACK_SLOTS;
            if (registry && typeof registry === "object") {
                if (Object.prototype.hasOwnProperty.call(registry, registryKey)) {
                    source = registry[registryKey];
                } else if (Object.prototype.hasOwnProperty.call(registry, safeIndex)) {
                    source = registry[safeIndex];
                }
            }
            if (!source) {
                source = globalThis[globalKey];
            }
        }
    } catch (e0) {
        source = null;
    }

    return {
        name: ResolveCustomAnnouncerMetaField(source, ["name", "Name", "NAME"]),
        author: ResolveCustomAnnouncerMetaField(source, ["author", "Author", "AUTHOR"]),
        voiceActor: ResolveCustomAnnouncerMetaField(source, ["voiceActor", "voice_actor", "VoiceActor", "Voice_Actor", "voice actor", "Voice Actor", "VOICE_ACTOR"])
    };
}

function ResolveCustomAnnouncerSlotLabel(slotIndex, fallbackLabel) {
    var safeIndex = Math.max(1, Math.min(5, Math.round(Number(slotIndex) || 1)));
    var scriptMeta = ResolveCustomAnnouncerSlotScriptMetadata(safeIndex);
    if (scriptMeta && scriptMeta.name) return scriptMeta.name;
    return String(fallbackLabel || ("Custom Slot " + String(safeIndex)));
}

function ResolveCustomAnnouncerSlotMetadata(slotIndex) {
    var safeIndex = Math.max(1, Math.min(5, Math.round(Number(slotIndex) || 1)));
    var scriptMeta = ResolveCustomAnnouncerSlotScriptMetadata(safeIndex);
    return {
        name: String(scriptMeta && scriptMeta.name ? scriptMeta.name : ""),
        author: String(scriptMeta && scriptMeta.author ? scriptMeta.author : ""),
        voiceActor: String(scriptMeta && scriptMeta.voiceActor ? scriptMeta.voiceActor : "")
    };
}

function GetCustomAnnouncerSlotIndexFromVoiceType(rawVoiceType) {
    var voiceType = NormalizeVoiceTypeValue(rawVoiceType);
    if (voiceType === 0) return 1;
    if (voiceType === 5) return 2;
    if (voiceType === 6) return 3;
    if (voiceType === 7) return 4;
    if (voiceType === 8) return 5;
    return 0;
}

function GetCustomAnnouncerSlotIndexFromOptionValue(optionValue) {
    var asInt = Math.round(Number(optionValue));
    if (!isFinite(asInt)) return 0;
    if (asInt === 0) return 1;
    if (asInt === 5) return 2;
    if (asInt === 6) return 3;
    if (asInt === 7) return 4;
    if (asInt === 8) return 5;
    return 0;
}

function BuildCustomAnnouncerSlotMetadataTooltipText(slotIndex) {
    var safeIndex = Math.max(1, Math.min(5, Math.round(Number(slotIndex) || 1)));
    var slotMeta = ResolveCustomAnnouncerSlotMetadata(safeIndex);
    var authorText = String(slotMeta && slotMeta.author ? slotMeta.author : "").trim();
    var voiceActorText = String(slotMeta && slotMeta.voiceActor ? slotMeta.voiceActor : "").trim();
    var lines = [];
    if (authorText.length > 0) lines.push("Author: " + authorText);
    if (voiceActorText.length > 0) lines.push("Voice Actor: " + voiceActorText);
    return lines.join("\n");
}

function BuildCustomAnnouncerSlotMetadataHoverInfo(slotIndex) {
    var safeIndex = Math.max(1, Math.min(5, Math.round(Number(slotIndex) || 1)));
    var slotMeta = ResolveCustomAnnouncerSlotMetadata(safeIndex);
    var authorText = String(slotMeta && slotMeta.author ? slotMeta.author : "").trim();
    var voiceActorText = String(slotMeta && slotMeta.voiceActor ? slotMeta.voiceActor : "").trim();
    return {
        author: authorText,
        voiceActor: voiceActorText
    };
}

function BuildCustomAnnouncerVoiceDescription(baseDescription, rawVoiceType) {
    var base = String(baseDescription || "");
    var slotIndex = GetCustomAnnouncerSlotIndexFromVoiceType(rawVoiceType);
    if (slotIndex <= 0) return base;

    var lines = [];
    if (base) lines.push(base);
    var slotMetaText = BuildCustomAnnouncerSlotMetadataTooltipText(slotIndex);
    if (slotMetaText) lines.push(slotMetaText);
    return lines.join("\n");
}

function BuildVoiceDropdownOptions() {
    return [
        { label: "Beep", value: 4 },
        { label: ResolveCustomAnnouncerSlotLabel(1, "Custom Slot 1"), value: 0 },
        { label: ResolveCustomAnnouncerSlotLabel(2, "Custom Slot 2"), value: 5 },
        { label: ResolveCustomAnnouncerSlotLabel(3, "Custom Slot 3"), value: 6 },
        { label: ResolveCustomAnnouncerSlotLabel(4, "Custom Slot 4"), value: 7 },
        { label: ResolveCustomAnnouncerSlotLabel(5, "Custom Slot 5"), value: 8 }
    ];
}


function IsZipBoostPreviewConfig(configId) {
    return configId === "ZIP_BOOST_X_OFFSET" ||
        configId === "ZIP_BOOST_Y_OFFSET" ||
        configId === "ZIP_BOOST_SCALE";
}

function IsCrosshairStatsPreviewConfig(configId) {
    return configId === "ENABLE_CROSSHAIR_STATS" ||
        configId === "CROSSHAIR_STATS_X_OFFSET" ||
        configId === "CROSSHAIR_STATS_Y_OFFSET" ||
        configId === "CROSSHAIR_STATS_SCALE" ||
        configId === "CROSSHAIR_STATS_OPACITY";
}

function IsUnsecuredSoulsPreviewConfig(configId) {
    return configId === "ENABLE_UNSECURED_SOUL_TIMER" ||
        configId === "UNSECURED_SOUL_TIMER_X_OFFSET" ||
        configId === "UNSECURED_SOUL_TIMER_Y_OFFSET" ||
        configId === "UNSECURED_SOUL_TIMER_SCALE";
}

function IsCompassPreviewConfig(configId) {
    return configId === "COMPASS_SCALE" ||
        configId === "COMPASS_X_OFFSET" ||
        configId === "COMPASS_Y_OFFSET" ||
        configId === "COMPASS_STRETCH_X" ||
        configId === "COMPASS_STRETCH_Y";
}

function IsSpeedPreviewConfig(configId) {
    return configId === "COMPASS_SPEED_X_OFFSET" ||
        configId === "COMPASS_SPEED_Y_OFFSET";
}

function IsKeyboardOverlayPreviewConfig(configId) {
    return configId === "KEYBOARD_OVERLAY_SCALE" ||
        configId === "KEYBOARD_OVERLAY_X_OFFSET" ||
        configId === "KEYBOARD_OVERLAY_Y_OFFSET";
}

function IsItemCooldownPreviewConfig(configId) {
    return configId === "PASSIVE_COOLDOWN_SIZE" ||
        configId === "PASSIVE_COOLDOWN_X" ||
        configId === "PASSIVE_COOLDOWN_Y" ||
        configId === "PASSIVE_COOLDOWN_OPACITY";
}

function IsAdvancedItemCooldownModeEnabled() {
    return Number(MOD_CONFIG.ENABLE_OLD_ITEM_COOLDOWNS) !== 1;
}

const ENABLE_AMMO_PREVIEW = false;
function IsAmmoPreviewConfig(configId) {
    if (!ENABLE_AMMO_PREVIEW) return false;
    return configId === "AMMO_CURRENT_SCALE" ||
        configId === "AMMO_TOTAL_SCALE" ||
        configId === "AMMO_PANEL_X_OFFSET" ||
        configId === "AMMO_PANEL_Y_OFFSET";
}

function IsReloadCooldownPreviewConfig(configId) {
    return configId === "RELOAD_COOLDOWN_SIZE" ||
        configId === "RELOAD_COOLDOWN_OPACITY" ||
        configId === "RELOAD_COOLDOWN_X_OFFSET" ||
        configId === "RELOAD_COOLDOWN_Y_OFFSET";
}

function IsUnitTargetPreviewConfig(configId) {
    return configId === "UNIT_TARGET_SIZE" ||
        configId === "UNIT_TARGET_OPACITY" ||
        configId === "UNIT_TARGET_HINT_SIZE" ||
        configId === "ENABLE_RED_DIAMOND" ||
        configId === "ENABLE_IMPROVED_HINT";
}

function IsDamageReportPreviewConfig(configId) {
    return configId === "DAMAGE_REPORT_X_OFFSET" ||
        configId === "DAMAGE_REPORT_Y_OFFSET" ||
        configId === "DISABLE_DAMAGE_REPORT";
}

function IsShopPreviewConfig(configId) {
    return configId === "SHOP_OFFSET_X" ||
        configId === "SHOP_OFFSET_Y" ||
        configId === "SHOP_OPACITY" ||
        configId === "SHOP_SCALE";
}

function IsUnsecuredPlusPreviewConfig(configId) {
    return configId === "UNSECURED_SOULS_HUD_SCALE" ||
        configId === "UNSECURED_SOULS_HUD_X_OFFSET" ||
        configId === "UNSECURED_SOULS_HUD_Y_OFFSET" ||
        configId === "ENABLE_BETTER_UNSECURED_SHOW_ICON" ||
        configId === "ENABLE_BETTER_UNSECURED_SHOW_TEXT";
}

function HideMinimapSizePreview() {
    if (gMinimapSizePreviewPanel && gMinimapSizePreviewPanel.IsValid && gMinimapSizePreviewPanel.IsValid()) {
        gMinimapSizePreviewPanel.RemoveClass("Visible");
    }
    if (gZoomMinimapPreviewPanel && gZoomMinimapPreviewPanel.IsValid && gZoomMinimapPreviewPanel.IsValid()) {
        gZoomMinimapPreviewPanel.RemoveClass("Visible");
    }
    if (gZipBoostPreviewPanel && gZipBoostPreviewPanel.IsValid && gZipBoostPreviewPanel.IsValid()) {
        gZipBoostPreviewPanel.RemoveClass("Visible");
    }
    if (gCrosshairStatsPreviewPanel && gCrosshairStatsPreviewPanel.IsValid && gCrosshairStatsPreviewPanel.IsValid()) {
        gCrosshairStatsPreviewPanel.RemoveClass("Visible");
    }
    if (gUnsecuredSoulsPreviewPanel && gUnsecuredSoulsPreviewPanel.IsValid && gUnsecuredSoulsPreviewPanel.IsValid()) {
        gUnsecuredSoulsPreviewPanel.RemoveClass("Visible");
    }
    if (gCompassPreviewPanel && gCompassPreviewPanel.IsValid && gCompassPreviewPanel.IsValid()) {
        gCompassPreviewPanel.RemoveClass("Visible");
    }
    if (gSpeedPreviewPanel && gSpeedPreviewPanel.IsValid && gSpeedPreviewPanel.IsValid()) {
        gSpeedPreviewPanel.RemoveClass("Visible");
    }
    if (gKeyboardOverlayPreviewPanel && gKeyboardOverlayPreviewPanel.IsValid && gKeyboardOverlayPreviewPanel.IsValid()) {
        gKeyboardOverlayPreviewPanel.RemoveClass("Visible");
    }
    if (gItemCooldownPreviewPanel && gItemCooldownPreviewPanel.IsValid && gItemCooldownPreviewPanel.IsValid()) {
        gItemCooldownPreviewPanel.RemoveClass("Visible");
    }
    if (gAmmoPreviewPanel && gAmmoPreviewPanel.IsValid && gAmmoPreviewPanel.IsValid()) {
        gAmmoPreviewPanel.RemoveClass("Visible");
    }
    if (gReloadCooldownPreviewPanel && gReloadCooldownPreviewPanel.IsValid && gReloadCooldownPreviewPanel.IsValid()) {
        gReloadCooldownPreviewPanel.RemoveClass("Visible");
    }
    if (gUnitTargetPreviewPanel && gUnitTargetPreviewPanel.IsValid && gUnitTargetPreviewPanel.IsValid()) {
        gUnitTargetPreviewPanel.RemoveClass("Visible");
    }
    if (gDamageReportPreviewPanel && gDamageReportPreviewPanel.IsValid && gDamageReportPreviewPanel.IsValid()) {
        gDamageReportPreviewPanel.RemoveClass("Visible");
    }
    if (gShopPreviewPanel && gShopPreviewPanel.IsValid && gShopPreviewPanel.IsValid()) {
        gShopPreviewPanel.RemoveClass("Visible");
    }
    if (gUnsecuredPlusPreviewPanel && gUnsecuredPlusPreviewPanel.IsValid && gUnsecuredPlusPreviewPanel.IsValid()) {
        gUnsecuredPlusPreviewPanel.RemoveClass("Visible");
    }
}

function ScheduleHideMinimapSizePreview(delaySec) {
    gMinimapSizePreviewHideToken++;
    var token = gMinimapSizePreviewHideToken;
    $.Schedule(delaySec, function() {
        if (token !== gMinimapSizePreviewHideToken) return;
        HideMinimapSizePreview();
    });
}

function ScheduleHideZoomMinimapPreview(delaySec) {
    gZoomMinimapPreviewHideToken++;
    var token = gZoomMinimapPreviewHideToken;
    $.Schedule(delaySec, function() {
        if (token !== gZoomMinimapPreviewHideToken) return;
        if (gZoomMinimapPreviewPanel && gZoomMinimapPreviewPanel.IsValid && gZoomMinimapPreviewPanel.IsValid()) {
            gZoomMinimapPreviewPanel.RemoveClass("Visible");
        }
    });
}

function ScheduleHideZipBoostPreview(delaySec) {
    gZipBoostPreviewHideToken++;
    var token = gZipBoostPreviewHideToken;
    $.Schedule(delaySec, function() {
        if (token !== gZipBoostPreviewHideToken) return;
        if (gZipBoostPreviewPanel && gZipBoostPreviewPanel.IsValid && gZipBoostPreviewPanel.IsValid()) {
            gZipBoostPreviewPanel.RemoveClass("Visible");
        }
    });
}

function ScheduleHideCrosshairStatsPreview(delaySec) {
    gCrosshairStatsPreviewHideToken++;
    var token = gCrosshairStatsPreviewHideToken;
    $.Schedule(delaySec, function() {
        if (token !== gCrosshairStatsPreviewHideToken) return;
        if (gCrosshairStatsPreviewPanel && gCrosshairStatsPreviewPanel.IsValid && gCrosshairStatsPreviewPanel.IsValid()) {
            gCrosshairStatsPreviewPanel.RemoveClass("Visible");
        }
    });
}

function ScheduleHideUnsecuredSoulsPreview(delaySec) {
    gUnsecuredSoulsPreviewHideToken++;
    var token = gUnsecuredSoulsPreviewHideToken;
    $.Schedule(delaySec, function() {
        if (token !== gUnsecuredSoulsPreviewHideToken) return;
        if (gUnsecuredSoulsPreviewPanel && gUnsecuredSoulsPreviewPanel.IsValid && gUnsecuredSoulsPreviewPanel.IsValid()) {
            gUnsecuredSoulsPreviewPanel.RemoveClass("Visible");
        }
    });
}

function ScheduleHideCompassPreview(delaySec) {
    gCompassPreviewHideToken++;
    var token = gCompassPreviewHideToken;
    $.Schedule(delaySec, function() {
        if (token !== gCompassPreviewHideToken) return;
        if (gCompassPreviewPanel && gCompassPreviewPanel.IsValid && gCompassPreviewPanel.IsValid()) {
            gCompassPreviewPanel.RemoveClass("Visible");
        }
    });
}

function ScheduleHideSpeedPreview(delaySec) {
    gSpeedPreviewHideToken++;
    var token = gSpeedPreviewHideToken;
    $.Schedule(delaySec, function() {
        if (token !== gSpeedPreviewHideToken) return;
        if (gSpeedPreviewPanel && gSpeedPreviewPanel.IsValid && gSpeedPreviewPanel.IsValid()) {
            gSpeedPreviewPanel.RemoveClass("Visible");
        }
    });
}

function ScheduleHideKeyboardOverlayPreview(delaySec) {
    gKeyboardOverlayPreviewHideToken++;
    var token = gKeyboardOverlayPreviewHideToken;
    $.Schedule(delaySec, function() {
        if (token !== gKeyboardOverlayPreviewHideToken) return;
        if (gKeyboardOverlayPreviewPanel && gKeyboardOverlayPreviewPanel.IsValid && gKeyboardOverlayPreviewPanel.IsValid()) {
            gKeyboardOverlayPreviewPanel.RemoveClass("Visible");
        }
    });
}

function ScheduleHideItemCooldownPreview(delaySec) {
    gItemCooldownPreviewHideToken++;
    var token = gItemCooldownPreviewHideToken;
    $.Schedule(delaySec, function() {
        if (token !== gItemCooldownPreviewHideToken) return;
        if (gItemCooldownPreviewPanel && gItemCooldownPreviewPanel.IsValid && gItemCooldownPreviewPanel.IsValid()) {
            gItemCooldownPreviewPanel.RemoveClass("Visible");
        }
    });
}

function ShowMinimapSizePreview(sizePx) {
    if (MOD_CONFIG.PREVIEWS_ENABLED !== 1) {
        HideMinimapSizePreview();
        return;
    }
    var panel = EnsureMinimapSizePreviewPanel();
    if (!panel || !gMinimapSizePreviewCircle || !gMinimapSizePreviewLabel) return;

    var win = $.GetContextPanel().FindChildTraverse("SettingsWindow");
    if (!win || !win.BHasClass || !win.BHasClass("Visible")) return;

    var sizeVal = Math.round(Number(sizePx) || 0);
    if (sizeVal <= 0) sizeVal = Math.round(Number(MOD_CONFIG.MINIMAP_SMALL_SIZE) || 0);
    if (sizeVal <= 0) return;
    var xOffset = Math.round(Number(MOD_CONFIG.MINIMAP_X_OFFSET) || 0);
    var yOffset = Math.round(Number(MOD_CONFIG.MINIMAP_Y_OFFSET) || 0);
    var opacityVal = Number(MOD_CONFIG.MINIMAP_BASE_OPACITY);
    if (!isFinite(opacityVal)) opacityVal = 1.0;
    opacityVal = Math.max(0, Math.min(1, opacityVal));

    var previewDiameter = GetMinimapPreviewDiameter(sizeVal);
    gMinimapSizePreviewCircle.style.width = previewDiameter + "px";
    gMinimapSizePreviewCircle.style.height = previewDiameter + "px";
    gMinimapSizePreviewCircle.style.opacity = opacityVal.toFixed(2);
    var rightInset = GetMinimapPreviewRightInsetPx();
    panel.style.marginRight = (gMinimapPreviewBaseRight - xOffset + rightInset) + "px";
    panel.style.marginBottom = (gMinimapPreviewBaseBottom + yOffset) + "px";
    gMinimapSizePreviewLabel.text = sizeVal + " px";
    panel.AddClass("Visible");
    ScheduleHideMinimapSizePreview(1.2);
}

function ShowZoomMinimapPreview(mode, sizePx) {
    if (MOD_CONFIG.PREVIEWS_ENABLED !== 1) {
        HideMinimapSizePreview();
        return;
    }
    if (typeof mode !== "string") {
        sizePx = mode;
        mode = gZoomPreviewMode;
    }
    mode = (mode === "TAB") ? "TAB" : "ALT";
    gZoomPreviewMode = mode;
    var keys = GetZoomConfigKeysForMode(mode);

    var panel = EnsureZoomMinimapPreviewPanel();
    if (!panel || !gZoomMinimapPreviewCircle || !gZoomMinimapPreviewLabel) return;

    var win = $.GetContextPanel().FindChildTraverse("SettingsWindow");
    if (!win || !win.BHasClass || !win.BHasClass("Visible")) return;

    var sizeVal = Math.round(Number(sizePx) || 0);
    if (sizeVal <= 0) sizeVal = Math.round(Number(MOD_CONFIG[keys.size]) || 0);
    if (sizeVal <= 0) sizeVal = Math.round(Number(MOD_CONFIG.MINIMAP_LARGE_SIZE) || 0);
    if (sizeVal <= 0) return;

    var zoomX = Math.round(Number(MOD_CONFIG[keys.x]) || 0);
    var zoomY = Math.round(Number(MOD_CONFIG[keys.y]) || 0);

    var opacityVal = Number(MOD_CONFIG[keys.opacity]);
    if (!isFinite(opacityVal)) opacityVal = 1.0;
    opacityVal = Math.max(0, Math.min(1, opacityVal));

    var previewDiameter = GetMinimapPreviewDiameter(sizeVal);
    gZoomMinimapPreviewCircle.style.width = previewDiameter + "px";
    gZoomMinimapPreviewCircle.style.height = previewDiameter + "px";
    gZoomMinimapPreviewCircle.style.opacity = opacityVal.toFixed(2);
    panel.style.marginLeft = (gZoomPreviewBaseX + zoomX) + "px";
    panel.style.marginTop = (gZoomPreviewBaseY - zoomY) + "px";
    gZoomMinimapPreviewLabel.text = sizeVal + " px";
    panel.AddClass("Visible");
    ScheduleHideZoomMinimapPreview(1.2);
}

function ShowZipBoostPreview() {
    if (MOD_CONFIG.PREVIEWS_ENABLED !== 1) {
        HideMinimapSizePreview();
        return;
    }
    var panel = EnsureZipBoostPreviewPanel();
    if (!panel || !gZipBoostPreviewBox || !gZipBoostPreviewLabel) return;

    var win = $.GetContextPanel().FindChildTraverse("SettingsWindow");
    if (!win || !win.BHasClass || !win.BHasClass("Visible")) return;

    var xOffset = Math.round(Number(MOD_CONFIG.ZIP_BOOST_X_OFFSET) || 0);
    var yOffset = Math.round(Number(MOD_CONFIG.ZIP_BOOST_Y_OFFSET) || 0);
    var scale = Math.round(Number(MOD_CONFIG.ZIP_BOOST_SCALE) || 100);

    if (xOffset < -2000) xOffset = -2000;
    if (xOffset > 2000) xOffset = 2000;
    if (yOffset < 0) yOffset = 0;
    if (yOffset > 1000) yOffset = 1000;
    if (scale < 50) scale = 50;
    if (scale > 200) scale = 200;

    panel.style.marginLeft = (gZipBoostPreviewBaseX + xOffset) + "px";
    panel.style.marginBottom = (gZipBoostPreviewBaseY + yOffset) + "px";
    gZipBoostPreviewBox.style.preTransformScale2d = (scale / 100).toFixed(2);
    gZipBoostPreviewLabel.text = LocalizeSettingsText("ZIP BOOST", true) + " " + scale + "%";
    panel.AddClass("Visible");
    ScheduleHideZipBoostPreview(1.2);
}

function ShowCrosshairStatsPreview() {
    if (MOD_CONFIG.PREVIEWS_ENABLED !== 1) {
        HideMinimapSizePreview();
        return;
    }
    var panel = EnsureCrosshairStatsPreviewPanel();
    if (!panel || !gCrosshairStatsPreviewBox || !gCrosshairStatsPreviewLabel) return;

    var win = $.GetContextPanel().FindChildTraverse("SettingsWindow");
    if (!win || !win.BHasClass || !win.BHasClass("Visible")) return;

    var xOffset = Math.round(Number(MOD_CONFIG.CROSSHAIR_STATS_X_OFFSET) || 0);
    var yOffset = Math.round(Number(MOD_CONFIG.CROSSHAIR_STATS_Y_OFFSET) || 0);
    var scale = Math.round(Number(MOD_CONFIG.CROSSHAIR_STATS_SCALE) || 100);
    var opacity = Number(MOD_CONFIG.CROSSHAIR_STATS_OPACITY);
    if (isNaN(opacity)) opacity = 1;

    if (xOffset < -500) xOffset = -500;
    if (xOffset > 500) xOffset = 500;
    if (yOffset < -500) yOffset = -500;
    if (yOffset > 500) yOffset = 500;
    if (scale < 50) scale = 50;
    if (scale > 200) scale = 200;
    if (opacity < 0) opacity = 0;
    if (opacity > 1) opacity = 1;

    panel.style.marginLeft = (gCrosshairStatsPreviewBaseX + xOffset) + "px";
    // Subtract yOffset so the preview moves the same way the runtime overlay does
    // (positive Vertical Offset = up). Keeps showcase honest to in-game behaviour.
    panel.style.marginTop = (gCrosshairStatsPreviewBaseY - yOffset) + "px";
    gCrosshairStatsPreviewBox.style.preTransformScale2d = (scale / 100).toFixed(2);
    gCrosshairStatsPreviewBox.style.opacity = opacity.toFixed(2);
    gCrosshairStatsPreviewLabel.text = LocalizeSettingsText("ACTIVE STATS", true);
    panel.AddClass("Visible");
    ScheduleHideCrosshairStatsPreview(1.2);
}

function ShowUnsecuredSoulsPreview() {
    if (MOD_CONFIG.PREVIEWS_ENABLED !== 1) {
        HideMinimapSizePreview();
        return;
    }
    var panel = EnsureUnsecuredSoulsPreviewPanel();
    if (!panel || !gUnsecuredSoulsPreviewLabel) return;

    var win = $.GetContextPanel().FindChildTraverse("SettingsWindow");
    if (!win || !win.BHasClass || !win.BHasClass("Visible")) return;

    var xOffset = Math.round(Number(MOD_CONFIG.UNSECURED_SOUL_TIMER_X_OFFSET) || 0);
    var yOffset = Math.round(Number(MOD_CONFIG.UNSECURED_SOUL_TIMER_Y_OFFSET) || 0);
    var scale = Math.round(Number(MOD_CONFIG.UNSECURED_SOUL_TIMER_SCALE) || 100);
    var enabled = Number(MOD_CONFIG.ENABLE_UNSECURED_SOUL_TIMER) === 1;

    if (xOffset < -1500) xOffset = -1500;
    if (xOffset > 1500) xOffset = 1500;
    if (yOffset < -100) yOffset = -100;
    if (yOffset > 1000) yOffset = 1000;
    if (scale < 50) scale = 50;
    if (scale > 200) scale = 200;
    var fontPx = Math.round(16 * (scale / 100));
    if (fontPx < 8) fontPx = 8;
    if (fontPx > 72) fontPx = 72;
    var fontSize = fontPx + "px";

    panel.style.marginLeft = (gUnsecuredSoulsPreviewBaseX + xOffset) + "px";
    panel.style.marginBottom = (gUnsecuredSoulsPreviewBaseY + yOffset) + "px";
    if (panel.style.preTransformScale2d !== "1.00") {
        panel.style.preTransformScale2d = "1.00";
    }
    if (gUnsecuredSoulsPreviewLabel.style.fontSize !== fontSize) {
        gUnsecuredSoulsPreviewLabel.style.fontSize = fontSize;
    }
    gUnsecuredSoulsPreviewLabel.text = enabled ? "23s" : "SAFE";
    panel.AddClass("Visible");
    ScheduleHideUnsecuredSoulsPreview(1.2);
}

function ShowConfigPreviewForConfigId(configId) {
    if (IsMinimapPreviewConfig(configId)) {
        ShowMinimapSizePreview(MOD_CONFIG.MINIMAP_SMALL_SIZE);
    }
    if (IsZoomMinimapPreviewConfig(configId)) {
        gZoomPreviewMode = GetZoomPreviewModeForConfigId(configId);
        ShowZoomMinimapPreview(gZoomPreviewMode);
    }
    if (IsZipBoostPreviewConfig(configId)) {
        ShowZipBoostPreview();
    }
    if (IsCrosshairStatsPreviewConfig(configId)) {
        ShowCrosshairStatsPreview();
    }
    if (IsUnsecuredSoulsPreviewConfig(configId)) {
        ShowUnsecuredSoulsPreview();
    }
    if (IsCompassPreviewConfig(configId)) {
        ShowCompassPreview();
    }
    if (IsSpeedPreviewConfig(configId)) {
        ShowSpeedPreview();
    }
    if (IsKeyboardOverlayPreviewConfig(configId)) {
        ShowKeyboardOverlayPreview();
    }
    if (IsItemCooldownPreviewConfig(configId)) {
        ShowItemCooldownPreview();
    }
    if (IsAmmoPreviewConfig(configId)) {
        ShowAmmoPreview();
    }
    if (IsReloadCooldownPreviewConfig(configId)) {
        ShowReloadCooldownPreview();
    }
    if (IsUnitTargetPreviewConfig(configId)) {
        ShowUnitTargetPreview();
    }
    if (IsDamageReportPreviewConfig(configId)) {
        ShowDamageReportPreview();
    }
    if (IsShopPreviewConfig(configId)) {
        ShowShopPreview();
    }
    if (IsUnsecuredPlusPreviewConfig(configId)) {
        ShowUnsecuredPlusPreview();
    }
}

function ShowCompassPreview() {
    if (MOD_CONFIG.PREVIEWS_ENABLED !== 1) {
        HideMinimapSizePreview();
        return;
    }
    var panel = EnsureCompassPreviewPanel();
    if (!panel || !gCompassPreviewBox) return;

    var win = $.GetContextPanel().FindChildTraverse("SettingsWindow");
    if (!win || !win.BHasClass || !win.BHasClass("Visible")) return;

    var scale = Math.round(Number(MOD_CONFIG.COMPASS_SCALE) || 100);
    var stretchX = Math.round(Number(MOD_CONFIG.COMPASS_STRETCH_X) || 100);
    var stretchY = Math.round(Number(MOD_CONFIG.COMPASS_STRETCH_Y) || 100);
    var xOffset = Math.round(Number(MOD_CONFIG.COMPASS_X_OFFSET) || 0);
    var yOffset = Math.round(Number(MOD_CONFIG.COMPASS_Y_OFFSET) || 120);
    var showSpeed = (MOD_CONFIG.ENABLE_COMPASS_SPEED !== 0);

    if (scale < 50) scale = 50;
    if (scale > 200) scale = 200;
    if (stretchX < 50) stretchX = 50;
    if (stretchX > 200) stretchX = 200;
    if (stretchY < 50) stretchY = 50;
    if (stretchY > 200) stretchY = 200;
    if (xOffset < -2000) xOffset = -2000;
    if (xOffset > 2000) xOffset = 2000;
    if (yOffset < -1000) yOffset = -1000;
    if (yOffset > 300) yOffset = 300;

    panel.style.marginLeft = (gCompassPreviewBaseX + xOffset) + "px";
    var compassBaselineY = Number(DEFAULT_CONFIG.COMPASS_Y_OFFSET);
    if (!isFinite(compassBaselineY)) compassBaselineY = 120;
    panel.style.marginTop = String((2 * compassBaselineY) - yOffset) + "px";

    var boxWidth = Math.round(200 * (scale / 100) * (stretchX / 100));
    var boxHeight = Math.round(50 * (scale / 100) * (stretchY / 100));
    if (boxWidth < 80) boxWidth = 80;
    if (boxHeight < 20) boxHeight = 20;

    gCompassPreviewBox.style.width = boxWidth + "px";
    gCompassPreviewBox.style.height = boxHeight + "px";
    gCompassPreviewBox.style.visibility = "visible";

    if (gCompassPreviewLabel) {
        gCompassPreviewLabel.text = boxWidth + "x" + boxHeight;
    }

    // Speed gets its own preview panel (ShowSpeedPreview) so it isn't trapped in
    // the compass box — mirroring the in-game split. When the compass shares the
    // screen we show that speed preview alongside this one for reference.
    if (showSpeed) ShowSpeedPreview();

    panel.AddClass("Visible");
    ScheduleHideCompassPreview(1.2);
}

// Independent speed preview — mirrors core's UpdateCompassOverlay exactly:
// with the compass on, the speed sits in the RIGHT half of the box, a touch
// below the degree readout; alone, it's screen-centered at the compass
// baseline. Then the speed offset sliders nudge it from there.
function ShowSpeedPreview() {
    if (MOD_CONFIG.PREVIEWS_ENABLED !== 1) {
        HideMinimapSizePreview();
        return;
    }
    var panel = EnsureSpeedPreviewPanel();
    if (!panel || !gSpeedPreviewLabel) return;

    var win = $.GetContextPanel().FindChildTraverse("SettingsWindow");
    if (!win || !win.BHasClass || !win.BHasClass("Visible")) return;

    var showCompass = (MOD_CONFIG.ENABLE_COMPASS !== 0);

    // Compass geometry — unscaled box dims, matching how core anchors the speed
    // (the speed root isn't scaled, so it uses the unscaled box width/height).
    var stretchX = Math.round(Number(MOD_CONFIG.COMPASS_STRETCH_X) || 100);
    if (stretchX < 50) stretchX = 50;
    if (stretchX > 200) stretchX = 200;
    var stretchY = Math.round(Number(MOD_CONFIG.COMPASS_STRETCH_Y) || 100);
    if (stretchY < 50) stretchY = 50;
    if (stretchY > 200) stretchY = 200;
    var compassOffsetX = Math.round(Number(MOD_CONFIG.COMPASS_X_OFFSET) || 0);
    if (compassOffsetX < -2000) compassOffsetX = -2000;
    if (compassOffsetX > 2000) compassOffsetX = 2000;
    var compassOffsetY = Math.round(Number(MOD_CONFIG.COMPASS_Y_OFFSET) || 120);
    if (compassOffsetY < -1000) compassOffsetY = -1000;
    if (compassOffsetY > 300) compassOffsetY = 300;

    var compassBaselineY = Number(DEFAULT_CONFIG.COMPASS_Y_OFFSET);
    if (!isFinite(compassBaselineY)) compassBaselineY = 120;
    var appliedCompassOffsetY = (2 * compassBaselineY) - compassOffsetY;
    var boxWidth = Math.round(200 * (stretchX / 100));
    if (boxWidth < 100) boxWidth = 100;
    var boxHeight = Math.round(50 * (stretchY / 100));
    if (boxHeight < 25) boxHeight = 25;

    var speedOffsetX = Math.round(Number(MOD_CONFIG.COMPASS_SPEED_X_OFFSET) || 0);
    var speedOffsetY = Math.round(Number(MOD_CONFIG.COMPASS_SPEED_Y_OFFSET) || 0);
    if (speedOffsetX < -2000) speedOffsetX = -2000;
    if (speedOffsetX > 2000) speedOffsetX = 2000;
    if (speedOffsetY < -2000) speedOffsetY = -2000;
    if (speedOffsetY > 2000) speedOffsetY = 2000;

    // Right half / right-aligned when the compass shares the screen; full-width
    // centered when alone. Same as core's speedLabel layout.
    gSpeedPreviewLabel.style.width = showCompass ? "50%" : "100%";
    gSpeedPreviewLabel.style.textAlign = showCompass ? "right" : "center";
    gSpeedPreviewLabel.style.horizontalAlign = showCompass ? "right" : "center";

    // Root spans the box width and centers on it, so "right half" maps to the
    // box's right half — no boxWidth/2 shift. +Y moves up (marginTop = base - y).
    var rootWidth = (showCompass ? boxWidth : 200) + "px";
    var speedBaseX = showCompass ? compassOffsetX : 0;
    var speedBaseY = showCompass ? (appliedCompassOffsetY + boxHeight + 14) : compassBaselineY;

    panel.style.width = rootWidth;
    panel.style.marginLeft = Math.round(speedBaseX + speedOffsetX) + "px";
    panel.style.marginTop = Math.round(speedBaseY - speedOffsetY) + "px";
    gSpeedPreviewLabel.text = "SPD";

    panel.AddClass("Visible");
    ScheduleHideSpeedPreview(1.2);
}

function ShowKeyboardOverlayPreview() {
    if (MOD_CONFIG.PREVIEWS_ENABLED !== 1) {
        HideMinimapSizePreview();
        return;
    }
    var panel = EnsureKeyboardOverlayPreviewPanel();
    if (!panel || !gKeyboardOverlayPreviewBox || !gKeyboardOverlayPreviewLabel) return;

    var win = $.GetContextPanel().FindChildTraverse("SettingsWindow");
    if (!win || !win.BHasClass || !win.BHasClass("Visible")) return;

    var scale = Math.round(Number(MOD_CONFIG.KEYBOARD_OVERLAY_SCALE) || 100);
    var xOffset = Math.round(Number(MOD_CONFIG.KEYBOARD_OVERLAY_X_OFFSET) || 0);
    var yOffset = Math.round(Number(MOD_CONFIG.KEYBOARD_OVERLAY_Y_OFFSET) || 0);
    var kbFullLayout = Number(MOD_CONFIG.ENABLE_FULL_KEYBOARD_LAYOUT) === 1;

    if (scale < 70) scale = 70;
    if (scale > 150) scale = 150;
    if (xOffset < -1500) xOffset = -1500;
    if (xOffset > 1500) xOffset = 1500;
    if (yOffset < -400) yOffset = -400;
    if (yOffset > 1000) yOffset = 1000;

    var kbBaseMarginLeft = kbFullLayout ? 70 : gKeyboardOverlayPreviewBaseX;
    var kbScaleFactor = scale / 100;
    var rowDefs = kbFullLayout ? [
        [40, 40, 40, 40, 40, 40, 40],
        [53, 40, 40, 40, 40],
        [60, 40, 40, 40, 40],
        [80, 40, 40, 40, 40],
        [60, 60, 133]
    ] : [
        [80, 40, 40, 40, 40],
        [80, 40, 40, 40, 40],
        [60, 192]
    ];
    var kbScaledHeight = Math.max(1, Math.round(40 * kbScaleFactor));
    var kbScaledGap = Math.max(1, Math.round(1 * kbScaleFactor));
    var kbRowCount = rowDefs.length;
    var kbScaledWidth = 0;
    for (var r = 0; r < rowDefs.length; r++) {
        var row = rowDefs[r];
        var rowWidth = 0;
        for (var k = 0; k < row.length; k++) {
            rowWidth += Math.max(1, Math.round(row[k] * kbScaleFactor)) + (kbScaledGap * 2);
        }
        if (rowWidth > kbScaledWidth) kbScaledWidth = rowWidth;
    }
    var kbTotalHeight = Math.round(kbRowCount * (kbScaledHeight + (kbScaledGap * 2)));

    panel.style.marginLeft = (kbBaseMarginLeft + xOffset) + "px";
    panel.style.marginBottom = (gKeyboardOverlayPreviewBaseY + yOffset) + "px";
    gKeyboardOverlayPreviewBox.style.preTransformScale2d = "1.00";
    gKeyboardOverlayPreviewBox.style.width = kbScaledWidth + "px";
    gKeyboardOverlayPreviewBox.style.height = kbTotalHeight + "px";
    gKeyboardOverlayPreviewLabel.text = kbScaledWidth + "x" + kbTotalHeight;
    panel.AddClass("Visible");
    ScheduleHideKeyboardOverlayPreview(1.2);
}

function ShowItemCooldownPreview() {
    if (MOD_CONFIG.PREVIEWS_ENABLED !== 1) {
        HideMinimapSizePreview();
        return;
    }
    var panel = EnsureItemCooldownPreviewPanel();
    if (!panel || !gItemCooldownPreviewRow || !gItemCooldownPreviewIcon) return;

    var win = $.GetContextPanel().FindChildTraverse("SettingsWindow");
    if (!win || !win.BHasClass || !win.BHasClass("Visible")) return;

    var size = Number(MOD_CONFIG.PASSIVE_COOLDOWN_SIZE);
    if (!isFinite(size)) size = 40;
    if (size < 30) size = 30;
    if (size > 60) size = 60;

    var xOffset = Math.round(Number(MOD_CONFIG.PASSIVE_COOLDOWN_X) || 0);
    var yOffset = Math.round(Number(MOD_CONFIG.PASSIVE_COOLDOWN_Y) || 0);
    if (xOffset < -50) xOffset = -50;
    if (xOffset > 50) xOffset = 50;
    if (yOffset < -50) yOffset = -50;
    if (yOffset > 50) yOffset = 50;

    var opacity = Number(MOD_CONFIG.PASSIVE_COOLDOWN_OPACITY);
    if (!isFinite(opacity)) opacity = 0.5;
    if (opacity < 0) opacity = 0;
    if (opacity > 1) opacity = 1;

    var scale = size / 40;
    if (!isFinite(scale) || scale <= 0) scale = 1.0;
    if (scale < 0.75) scale = 0.75;
    if (scale > 1.5) scale = 1.5;
    var previewBaseSizePx = 45;
    var previewSizePx = Math.round(previewBaseSizePx * scale);
    if (previewSizePx < 34) previewSizePx = 34;
    if (previewSizePx > 68) previewSizePx = 68;

    panel.style.marginLeft = xOffset + "%";
    panel.style.marginTop = (-yOffset) + "%";
    gItemCooldownPreviewIcon.style.width = previewSizePx + "px";
    gItemCooldownPreviewIcon.style.height = previewSizePx + "px";
    gItemCooldownPreviewRow.style.opacity = opacity.toFixed(2);
    if (gItemCooldownPreviewLabel) gItemCooldownPreviewLabel.text = "7";

    panel.AddClass("Visible");
    ScheduleHideItemCooldownPreview(1.2);
}

function ShowAmmoPreview() {
    if (MOD_CONFIG.PREVIEWS_ENABLED !== 1) {
        HideMinimapSizePreview();
        return;
    }
    var panel = EnsureAmmoPreviewPanel();
    if (!panel || !gAmmoPreviewCurrentLabel || !gAmmoPreviewTotalLabel) return;
    if (!IsSettingsWindowVisible()) return;

    var currentScale = Math.round(Number(MOD_CONFIG.AMMO_CURRENT_SCALE));
    if (!isFinite(currentScale)) currentScale = 100;
    if (currentScale < 100) currentScale = 100;
    if (currentScale > 300) currentScale = 300;

    var totalScale = Math.round(Number(MOD_CONFIG.AMMO_TOTAL_SCALE));
    if (!isFinite(totalScale)) totalScale = 100;
    if (totalScale < 100) totalScale = 100;
    if (totalScale > 300) totalScale = 300;

    var xOffset = Math.round(Number(MOD_CONFIG.AMMO_PANEL_X_OFFSET));
    if (!isFinite(xOffset)) xOffset = 0;
    if (xOffset < -200) xOffset = -200;
    if (xOffset > 200) xOffset = 200;

    var yOffset = Math.round(Number(MOD_CONFIG.AMMO_PANEL_Y_OFFSET));
    if (!isFinite(yOffset)) yOffset = 0;
    if (yOffset < -200) yOffset = -200;
    if (yOffset > 200) yOffset = 200;

    var currentScaleFactor = currentScale / 100.0;
    var totalScaleFactor = totalScale / 100.0;
    var currentFontPx = Math.max(12, Math.round(16 * currentScaleFactor));
    var currentWidthPx = Math.max(24, Math.round(32 * currentScaleFactor));
    var totalFontPx = Math.max(12, Math.round(16 * totalScaleFactor));
    var totalWidthPx = Math.max(32, Math.round(50 * totalScaleFactor));
    var totalMarginLeftPx = Math.max(0, Math.round(2 * totalScaleFactor));

    var baseX = 980;
    var baseY = 820;
    var anchoredToLive = false;
    var root = FindRootPanel();
    var liveAmmo = root && root.FindChildTraverse ? root.FindChildTraverse("ammo_panel") : null;
    var liveRect = GetPanelRectRelativeToContext(liveAmmo);
    if (liveRect) {
        baseX = liveRect.x;
        baseY = liveRect.y;
        anchoredToLive = true;
    }

    var targetX = anchoredToLive ? baseX : (baseX + xOffset);
    var targetY = anchoredToLive ? baseY : (baseY - yOffset);
    SetPreviewPanelPosition(panel, targetX, targetY);
    gAmmoPreviewCurrentLabel.style.fontSize = String(currentFontPx) + "px";
    gAmmoPreviewCurrentLabel.style.width = String(currentWidthPx) + "px";
    gAmmoPreviewCurrentLabel.text = "62";
    gAmmoPreviewTotalLabel.style.fontSize = String(totalFontPx) + "px";
    gAmmoPreviewTotalLabel.style.width = String(totalWidthPx) + "px";
    gAmmoPreviewTotalLabel.style.marginLeft = String(totalMarginLeftPx) + "px";
    gAmmoPreviewTotalLabel.text = "/180";

    panel.AddClass("Visible");
    ScheduleHideAmmoPreview(1.2);
}

function ShowReloadCooldownPreview() {
    if (MOD_CONFIG.PREVIEWS_ENABLED !== 1) {
        HideMinimapSizePreview();
        return;
    }
    var panel = EnsureReloadCooldownPreviewPanel();
    if (!panel || !gReloadCooldownPreviewRing || !gReloadCooldownPreviewLabel) return;
    if (!IsSettingsWindowVisible()) return;

    var opacity = Number(MOD_CONFIG.RELOAD_COOLDOWN_OPACITY);
    if (!isFinite(opacity)) opacity = 0.6;
    if (opacity < 0) opacity = 0;
    if (opacity > 1) opacity = 1;

    var size = Math.round(Number(MOD_CONFIG.RELOAD_COOLDOWN_SIZE));
    if (!isFinite(size)) size = 28;
    if (size < 16) size = 16;
    if (size > 60) size = 60;

    var offsetX = Math.round(Number(MOD_CONFIG.RELOAD_COOLDOWN_X_OFFSET));
    if (!isFinite(offsetX)) offsetX = 0;
    if (offsetX < -75) offsetX = -75;
    if (offsetX > 75) offsetX = 75;

    var offsetY = Math.round(Number(MOD_CONFIG.RELOAD_COOLDOWN_Y_OFFSET));
    if (!isFinite(offsetY)) offsetY = 0;
    if (offsetY < -75) offsetY = -75;
    if (offsetY > 75) offsetY = 75;

    var context = $.GetContextPanel();
    var fallbackX = 950;
    var fallbackY = 510;
    var contextW = Number(context && context.actuallayoutwidth);
    var contextH = Number(context && context.actuallayoutheight);
    if (isFinite(contextW) && contextW > 0) fallbackX = Math.round(contextW * 0.5);
    if (isFinite(contextH) && contextH > 0) fallbackY = Math.round(contextH * 0.52);

    var baseX = fallbackX;
    var baseY = fallbackY;
    var anchoredToLive = false;
    var root = FindRootPanel();
    var liveReticle = null;
    if (root && root.FindChildTraverse) {
        liveReticle = root.FindChildTraverse("reticle_status") || root.FindChildTraverse("ReticleStatus");
    }
    var liveRect = GetPanelRectRelativeToContext(liveReticle);
    if (liveRect) {
        baseX = liveRect.x + Math.round(liveRect.width * 0.5);
        baseY = liveRect.y + Math.round(liveRect.height * 0.5);
    }

    var ringSize = Math.max(36, Math.round(size * 2.2));
    SetPreviewPanelPosition(panel, baseX + offsetX - Math.round(ringSize * 0.5), baseY - offsetY - Math.round(ringSize * 0.5));
    gReloadCooldownPreviewRing.style.width = String(ringSize) + "px";
    gReloadCooldownPreviewRing.style.height = String(ringSize) + "px";
    SetPanelOpacitySafe(gReloadCooldownPreviewRing, opacity, 0.6);
    gReloadCooldownPreviewLabel.style.fontSize = String(size) + "px";
    gReloadCooldownPreviewLabel.text = "1.3";

    panel.AddClass("Visible");
    ScheduleHideReloadCooldownPreview(1.2);
}

function ShowUnitTargetPreview() {
    if (MOD_CONFIG.PREVIEWS_ENABLED !== 1) {
        HideMinimapSizePreview();
        return;
    }
    var panel = EnsureUnitTargetPreviewPanel();
    if (!panel || !gUnitTargetPreviewImage || !gUnitTargetPreviewBinding) return;
    if (!IsSettingsWindowVisible()) return;

    var size = Math.round(Number(MOD_CONFIG.UNIT_TARGET_SIZE));
    if (!isFinite(size)) size = 150;
    if (size < 50) size = 50;
    if (size > 300) size = 300;

    var opacity = Number(MOD_CONFIG.UNIT_TARGET_OPACITY);
    if (!isFinite(opacity)) opacity = 1.0;
    if (opacity < 0) opacity = 0;
    if (opacity > 1) opacity = 1;

    var redDiamond = Number(MOD_CONFIG.ENABLE_RED_DIAMOND) === 1;
    var improvedHint = Number(MOD_CONFIG.ENABLE_IMPROVED_HINT) === 1;

    var previewSizePx = Math.max(28, Math.round(size * 0.56));
    var context = $.GetContextPanel();
    var fallbackX = 930;
    var fallbackY = 470;
    var contextW = Number(context && context.actuallayoutwidth);
    var contextH = Number(context && context.actuallayoutheight);
    if (isFinite(contextW) && contextW > 0) fallbackX = Math.round(contextW * 0.5);
    if (isFinite(contextH) && contextH > 0) fallbackY = Math.round(contextH * 0.44);

    var baseX = fallbackX;
    var baseY = fallbackY;
    var root = FindRootPanel();
    var liveHint = null;
    if (root && root.FindChildTraverse) {
        liveHint = root.FindChildTraverse("Citadel_AbilityHudButtonHintPanel") || root.FindChildTraverse("ability_image");
    }
    var liveRect = GetPanelRectRelativeToContext(liveHint);
    if (liveRect) {
        baseX = liveRect.x + Math.round(liveRect.width * 0.5);
        baseY = liveRect.y + Math.round(liveRect.height * 0.5);
    }

    SetPreviewPanelPosition(panel, baseX - Math.round(previewSizePx * 0.5), baseY - Math.round(previewSizePx * 0.5));
    gUnitTargetPreviewImage.style.width = String(previewSizePx) + "px";
    gUnitTargetPreviewImage.style.height = String(previewSizePx) + "px";
    SetPanelOpacitySafe(gUnitTargetPreviewImage, opacity, 1.0);
    gUnitTargetPreviewImage.SetHasClass("RedDiamond", redDiamond);
    gUnitTargetPreviewImage.SetHasClass("ImprovedHint", improvedHint);
    gUnitTargetPreviewBinding.SetHasClass("ImprovedHint", improvedHint);

    panel.AddClass("Visible");
    ScheduleHideUnitTargetPreview(1.2);
}

function ShowDamageReportPreview() {
    if (MOD_CONFIG.PREVIEWS_ENABLED !== 1) {
        HideMinimapSizePreview();
        return;
    }
    var panel = EnsureDamageReportPreviewPanel();
    if (!panel || !gDamageReportPreviewBox || !gDamageReportPreviewLabel) return;
    if (!IsSettingsWindowVisible()) return;

    var offsetX = Math.round(Number(MOD_CONFIG.DAMAGE_REPORT_X_OFFSET));
    if (!isFinite(offsetX)) offsetX = 0;
    if (offsetX < 0) offsetX = 0;
    if (offsetX > 2000) offsetX = 2000;
    var offsetY = Math.round(Number(MOD_CONFIG.DAMAGE_REPORT_Y_OFFSET));
    if (!isFinite(offsetY)) offsetY = 0;
    if (offsetY < -200) offsetY = -200;
    if (offsetY > 1000) offsetY = 1000;
    var isDisabled = Number(MOD_CONFIG.DISABLE_DAMAGE_REPORT) === 1;

    var context = $.GetContextPanel();
    var fallbackX = 1120;
    var fallbackY = 390;
    var contextW = Number(context && context.actuallayoutwidth);
    var contextH = Number(context && context.actuallayoutheight);
    if (isFinite(contextW) && contextW > 0) fallbackX = Math.round(contextW * 0.58);
    if (isFinite(contextH) && contextH > 0) fallbackY = Math.round(contextH * 0.36);

    var baseX = fallbackX;
    var baseY = fallbackY;
    var root = FindRootPanel();
    var livePanel = root && root.FindChildTraverse ? root.FindChildTraverse("CitadelHudDamageReport") : null;
    var liveRect = GetPanelRectRelativeToContext(livePanel);
    if (liveRect) {
        baseX = liveRect.x;
        baseY = liveRect.y;
        anchoredToLive = true;
    }

    var targetX = anchoredToLive ? baseX : (baseX + offsetX);
    var targetY = anchoredToLive ? baseY : (baseY - offsetY);
    SetPreviewPanelPosition(panel, targetX, targetY);
    gDamageReportPreviewBox.SetHasClass("Disabled", isDisabled);
    gDamageReportPreviewLabel.text = isDisabled ? "HIDDEN" : "DAMAGE REPORT";
    panel.AddClass("Visible");
    ScheduleHideDamageReportPreview(1.2);
}

function ShowShopPreview() {
    if (MOD_CONFIG.PREVIEWS_ENABLED !== 1) {
        HideMinimapSizePreview();
        return;
    }
    var panel = EnsureShopPreviewPanel();
    if (!panel || !gShopPreviewBox || !gShopPreviewLabel) return;
    if (!IsSettingsWindowVisible()) return;

    var offsetX = Math.round(Number(MOD_CONFIG.SHOP_OFFSET_X));
    if (!isFinite(offsetX)) offsetX = 0;
    if (offsetX < -500) offsetX = -500;
    if (offsetX > 500) offsetX = 500;
    var offsetY = Math.round(Number(MOD_CONFIG.SHOP_OFFSET_Y));
    if (!isFinite(offsetY)) offsetY = 0;
    if (offsetY < -500) offsetY = -500;
    if (offsetY > 500) offsetY = 500;
    var opacity = Number(MOD_CONFIG.SHOP_OPACITY);
    if (!isFinite(opacity)) opacity = 1.0;
    if (opacity < 0) opacity = 0;
    if (opacity > 1) opacity = 1;
    var scale = Number(MOD_CONFIG.SHOP_SCALE);
    if (!isFinite(scale)) scale = 1.0;
    if (scale < 0.5) scale = 0.5;
    if (scale > 1.5) scale = 1.5;

    var context = $.GetContextPanel();
    var fallbackX = 240;
    var fallbackY = 120;
    var contextW = Number(context && context.actuallayoutwidth);
    var contextH = Number(context && context.actuallayoutheight);
    if (isFinite(contextW) && contextW > 0) fallbackX = Math.round(contextW * 0.08);
    if (isFinite(contextH) && contextH > 0) fallbackY = Math.round(contextH * 0.12);

    var baseX = fallbackX;
    var baseY = fallbackY;
    var anchoredToLive = false;
    var root = FindRootPanel();
    var heroShop = root && root.FindChildTraverse ? root.FindChildTraverse("CitadelHudHeroShop") : null;
    var mainPanel = heroShop && heroShop.FindChildTraverse ? heroShop.FindChildTraverse("MainPanel") : null;
    var liveRect = GetPanelRectRelativeToContext(mainPanel || heroShop);
    if (liveRect) {
        baseX = liveRect.x;
        baseY = liveRect.y;
        anchoredToLive = true;
    }

    var targetX = baseX + offsetX;
    var targetY = baseY - offsetY;
    SetPreviewPanelPosition(panel, targetX, targetY);
    SetPanelOpacitySafe(panel, opacity, 1.0);
    panel.style.preTransformScale2d = scale.toFixed(2) + ", " + scale.toFixed(2);
    gShopPreviewLabel.text = "SHOP";
    panel.AddClass("Visible");
    ScheduleHideShopPreview(1.2);
}

function ShowUnsecuredPlusPreview() {
    if (MOD_CONFIG.PREVIEWS_ENABLED !== 1) {
        HideMinimapSizePreview();
        return;
    }
    var panel = EnsureUnsecuredPlusPreviewPanel();
    if (!panel || !gUnsecuredPlusPreviewIcon || !gUnsecuredPlusPreviewText || !gUnsecuredPlusPreviewValue) return;
    if (!IsSettingsWindowVisible()) return;

    var scale = Math.round(Number(MOD_CONFIG.UNSECURED_SOULS_HUD_SCALE));
    if (!isFinite(scale)) scale = 100;
    if (scale < 50) scale = 50;
    if (scale > 200) scale = 200;
    var xOffset = Math.round(Number(MOD_CONFIG.UNSECURED_SOULS_HUD_X_OFFSET));
    if (!isFinite(xOffset)) xOffset = 0;
    if (xOffset < -1000) xOffset = -1000;
    if (xOffset > 2000) xOffset = 2000;
    var yOffset = Math.round(Number(MOD_CONFIG.UNSECURED_SOULS_HUD_Y_OFFSET));
    if (!isFinite(yOffset)) yOffset = 0;
    if (yOffset < 800) yOffset = 800;
    if (yOffset > 2000) yOffset = 2000;

    var showIcon = Number(MOD_CONFIG.ENABLE_BETTER_UNSECURED_SHOW_ICON) === 1;
    var showText = Number(MOD_CONFIG.ENABLE_BETTER_UNSECURED_SHOW_TEXT) === 1;
    var fontPx = Math.max(8, Math.min(72, Math.round(14 * (scale / 100))));

    var context = $.GetContextPanel();
    var fallbackX = 780;
    var fallbackY = 120;
    var contextW = Number(context && context.actuallayoutwidth);
    if (isFinite(contextW) && contextW > 0) fallbackX = Math.round(contextW * 0.42);

    var baseX = fallbackX;
    var baseY = fallbackY;
    var anchoredToLive = false;
    var root = FindRootPanel();
    var liveOverlay = root && root.FindChildTraverse ? root.FindChildTraverse("QOLBetterUnsecuredOverlay") : null;
    var liveRect = GetPanelRectRelativeToContext(liveOverlay);
    if (liveRect) {
        baseX = liveRect.x;
        baseY = liveRect.y;
        anchoredToLive = true;
    }

    var targetX = anchoredToLive ? baseX : (baseX + xOffset);
    var unsecuredHudBaselineY = Number(DEFAULT_CONFIG.UNSECURED_SOULS_HUD_Y_OFFSET);
    if (!isFinite(unsecuredHudBaselineY)) unsecuredHudBaselineY = 0;
    var reflectedYOffset = (2 * unsecuredHudBaselineY) - yOffset;
    var targetY = anchoredToLive ? baseY : (baseY + reflectedYOffset);
    SetPreviewPanelPosition(panel, targetX, targetY);
    gUnsecuredPlusPreviewIcon.style.visibility = showIcon ? "visible" : "collapse";
    gUnsecuredPlusPreviewText.style.visibility = showText ? "visible" : "collapse";
    gUnsecuredPlusPreviewText.style.fontSize = String(fontPx) + "px";
    gUnsecuredPlusPreviewValue.style.fontSize = String(fontPx) + "px";
    gUnsecuredPlusPreviewValue.text = "538";

    panel.AddClass("Visible");
    ScheduleHideUnsecuredPlusPreview(1.2);
}

function EncodeBase64Raw(str) {
    if (typeof QOL_CODEC === "object" && QOL_CODEC && typeof QOL_CODEC.EncodeBase64Raw === "function") {
        return QOL_CODEC.EncodeBase64Raw(str);
    }
    return "";
}

function EncodeBase64(str) {
    var raw = EncodeBase64Raw(str);
    return raw && raw.length > 0 ? raw.match(/.{1,40}/g).join(" ") : "";
}

function DecodeBase64(str) {
    if (typeof QOL_CODEC === "object" && QOL_CODEC && typeof QOL_CODEC.DecodeBase64 === "function") {
        return QOL_CODEC.DecodeBase64(str);
    }
    return "";
}

// ── Compatibility aliases (commit 1.1: redirect to shared module) ──
// These allow existing code to continue working without changes.
// They will be replaced with direct QOL_COMPACT_SCHEMA_UTILS.* calls in commit 1.2.
var COMPACT_SCHEMA_REGISTRY = QOL_COMPACT_SCHEMA_REGISTRY;
var COMPACT_SCHEMA_WIRE_TO_SEMVER = QOL_COMPACT_SCHEMA_WIRE_TO_SEMVER;
var LATEST_COMPACT_SEMVER = QOL_LATEST_COMPACT_SEMVER;
function GetCompactSchema(semver)      { return QOL_COMPACT_SCHEMA_UTILS.GetSchema(semver); }
function GetCompactWireVersion(semver) { return QOL_COMPACT_SCHEMA_UTILS.GetWireVersion(semver); }
function ResolveCompactSemverFromWireVersion(wv) { return QOL_COMPACT_SCHEMA_UTILS.ResolveSemverFromWire(wv); }
function AreCompactSemversWireCompatible(a, b) { return QOL_COMPACT_SCHEMA_UTILS.AreSemversWireCompatible(a, b); }

// ── Serialization helpers (remain in ql_settings.js — export/import specific) ──

function GetStepDecimals(step) {
    if (typeof QOL_CODEC === "object" && QOL_CODEC && typeof QOL_CODEC.GetStepDecimals === "function") {
        return QOL_CODEC.GetStepDecimals(step);
    }
    var s = String(step);
    var idx = s.indexOf(".");
    return idx === -1 ? 0 : (s.length - idx - 1);
}

function ToBase64Url(binaryStr) {
    if (typeof QOL_CODEC === "object" && QOL_CODEC && typeof QOL_CODEC.ToBase64Url === "function") {
        return QOL_CODEC.ToBase64Url(binaryStr);
    }
    return EncodeBase64Raw(binaryStr).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function FromBase64Url(urlStr) {
    if (typeof QOL_CODEC === "object" && QOL_CODEC && typeof QOL_CODEC.FromBase64Url === "function") {
        return QOL_CODEC.FromBase64Url(urlStr);
    }
    var padded = String(urlStr || "").replace(/-/g, "+").replace(/_/g, "/");
    while (padded.length % 4 !== 0) padded += "=";
    return DecodeBase64(padded);
}

function SerializeCompactV2(config, semverOverride) {
    var semver = String(semverOverride || LATEST_COMPACT_SEMVER);
    var wireVersion = GetCompactWireVersion(semver);
    var schema = GetCompactSchema(semver);
    if (typeof QOL_CODEC === "object" && QOL_CODEC && typeof QOL_CODEC.SerializeCompactBinary === "function") {
        return QOL_CODEC.SerializeCompactBinary(config, schema, wireVersion, function(field, cfg) {
            var val = cfg && cfg.hasOwnProperty(field.key) ? cfg[field.key] : field.min;
            if (field.key === "ULT_COOLDOWN_X_OFFSET" || field.key === "ULT_COOLDOWN_Y_OFFSET") {
                val = 0;
            }
            if (field.key === COMPACT_DEFAULT_HERO_FIELD) {
                var configuredHero = String((cfg && cfg.DEFAULT_HERO) || "");
                var configuredHeroIndex = DEFAULT_HERO_OPTIONS.indexOf(configuredHero);
                if (configuredHeroIndex < 0) {
                    configuredHeroIndex = DEFAULT_HERO_OPTIONS.indexOf(String(DEFAULT_CONFIG.DEFAULT_HERO || ""));
                }
                if (configuredHeroIndex < 0) configuredHeroIndex = 0;
                val = configuredHeroIndex;
            }
            return val;
        });
    }
    throw new Error("Compact serializer unavailable");
}

function DeserializeCompactV2(binaryStr, expectedSemver) {
    var raw = String(binaryStr || "");
    if (raw.length < 1) throw new Error("Compact string too short");
    var wireVersion = raw.charCodeAt(0) & 255;
    var semver = "";
    if (expectedSemver) {
        var expected = String(expectedSemver);
        var expectedWireVersion = GetCompactWireVersion(expected);
        if (expectedWireVersion !== wireVersion) throw new Error("Compact schema wire version mismatch");
        semver = expected;
    } else {
        semver = ResolveCompactSemverFromWireVersion(wireVersion);
    }
    var schema = GetCompactSchema(semver);
    if (typeof QOL_CODEC === "object" && QOL_CODEC && typeof QOL_CODEC.DeserializeCompactBinary === "function") {
        return QOL_CODEC.DeserializeCompactBinary(
            raw,
            schema,
            function(field, value, parsed) {
                if (field.key === COMPACT_DEFAULT_HERO_FIELD) {
                    var heroIndex = Math.round(value);
                    if (heroIndex < 0 || heroIndex >= DEFAULT_HERO_OPTIONS.length) heroIndex = 0;
                    var fallbackHeroId = String(DEFAULT_CONFIG.DEFAULT_HERO || "");
                    var resolvedHeroId = DEFAULT_HERO_OPTIONS[heroIndex] || fallbackHeroId || "hero_werewolf";
                    parsed.DEFAULT_HERO = resolvedHeroId;
                    return true;
                }
                return false;
            },
            function(missingField, parsed) {
                if (!missingField || !missingField.key) return;
                if (missingField.key === COMPACT_DEFAULT_HERO_FIELD) {
                    parsed.DEFAULT_HERO = String(DEFAULT_CONFIG.DEFAULT_HERO || "hero_werewolf");
                } else if (DEFAULT_CONFIG.hasOwnProperty(missingField.key)) {
                    parsed[missingField.key] = DEFAULT_CONFIG[missingField.key];
                }
            }
        );
    }
    throw new Error("Compact deserializer unavailable");
}

function ApplyParsedConfig(parsed) {
    for (var key in parsed) {
        if (MOD_CONFIG.hasOwnProperty(key)) {
            MOD_CONFIG[key] = parsed[key];
        }
    }
    MigrateSplitZoomKeys(MOD_CONFIG, parsed);
    NormalizeNeutralCampFlags(MOD_CONFIG, parsed);
    NormalizeItemCooldownModeConfig(MOD_CONFIG, parsed);
    NormalizeAmmoScaleConfig(MOD_CONFIG, parsed);
    NormalizeVoiceTypeConfig(MOD_CONFIG);
    NormalizeHealthbarTypeConfig(MOD_CONFIG, parsed);
    NormalizeColorWarningConfig(MOD_CONFIG, parsed);
    NormalizeEnemyColorWarningConfig(MOD_CONFIG, parsed);
    NormalizeAllyColorWarningConfig(MOD_CONFIG, parsed);
    NormalizeTopbarEnemyHpWarningConfig(MOD_CONFIG, parsed);
    NormalizeTopbarAllyHpWarningConfig(MOD_CONFIG, parsed);
    NormalizeShopItemNotificationsConfig(MOD_CONFIG, parsed);
    NormalizeLanguageSchemaMigration(MOD_CONFIG, parsed, LATEST_COMPACT_SEMVER);
}

function ClampToSchemaField(value, field) {
    if (!field) return { value: value, changed: false };
    var n = Number(value);
    if (!isFinite(n)) return { value: value, changed: false };
    var clamped = Math.max(Number(field.min), Math.min(Number(field.max), n));
    var step = Number(field.step);
    if (isFinite(step) && step > 0) {
        clamped = field.min + (Math.round((clamped - field.min) / step) * step);
    }
    var decimals = GetStepDecimals(field.step);
    clamped = decimals > 0 ? parseFloat(clamped.toFixed(decimals)) : Math.round(clamped);
    return { value: clamped, changed: NormalizeComparableConfigValue(clamped) !== NormalizeComparableConfigValue(value) };
}

function BuildSchemaFieldMap(version) {
    var map = {};
    var schema = [];
    var schemaSemver = String(version || LATEST_COMPACT_SEMVER);
    try { schema = GetCompactSchema(schemaSemver) || []; } catch (e0) { $.Msg("[QOLLock][WARN][schema] GetCompactSchema failed for v" + schemaSemver + ": " + (e0 && e0.message ? e0.message : String(e0 || ""))); schema = []; }
    for (var i = 0; i < schema.length; i++) {
        var field = schema[i];
        if (!field || !field.key) continue;
        map[String(field.key)] = field;
    }
    return map;
}

function ApplyParsedConfigWithDiagnostics(parsed, schemaVersion) {
    var diagnostics = {
        appliedKeys: 0,
        unknownKeys: 0,
        clampedKeys: 0
    };
    if (!parsed || typeof parsed !== "object") return diagnostics;

    var preservedDragEnabled = MOD_CONFIG.DRAG_ENABLED;
    var preservedPreviewsEnabled = MOD_CONFIG.PREVIEWS_ENABLED;
    var fieldMap = BuildSchemaFieldMap(schemaVersion);
    for (var defaultKey in DEFAULT_CONFIG) {
        MOD_CONFIG[defaultKey] = DEFAULT_CONFIG[defaultKey];
    }
    for (var key in parsed) {
        if (!MOD_CONFIG.hasOwnProperty(key)) {
            diagnostics.unknownKeys++;
            continue;
        }
        var nextValue = parsed[key];
        var field = fieldMap[key] || null;
        if (field && typeof nextValue === "number") {
            var clampResult = ClampToSchemaField(nextValue, field);
            nextValue = clampResult.value;
            if (clampResult.changed) diagnostics.clampedKeys++;
        }
        MOD_CONFIG[key] = nextValue;
        diagnostics.appliedKeys++;
    }
    MigrateSplitZoomKeys(MOD_CONFIG, parsed);
    NormalizeNeutralCampFlags(MOD_CONFIG, parsed);
    NormalizeItemCooldownModeConfig(MOD_CONFIG, parsed);
    NormalizeAmmoScaleConfig(MOD_CONFIG, parsed);
    NormalizeVoiceTypeConfig(MOD_CONFIG);
    NormalizeHealthbarTypeConfig(MOD_CONFIG, parsed);
    NormalizeColorWarningConfig(MOD_CONFIG, parsed);
    NormalizeEnemyColorWarningConfig(MOD_CONFIG, parsed);
    NormalizeAllyColorWarningConfig(MOD_CONFIG, parsed);
    NormalizeTopbarEnemyHpWarningConfig(MOD_CONFIG, parsed);
    NormalizeTopbarAllyHpWarningConfig(MOD_CONFIG, parsed);
    NormalizeShopItemNotificationsConfig(MOD_CONFIG, parsed);
    NormalizeCompassSpeedSchemaMigration(MOD_CONFIG, parsed, schemaVersion || LATEST_COMPACT_SEMVER);
    NormalizeLanguageSchemaMigration(MOD_CONFIG, parsed, schemaVersion || LATEST_COMPACT_SEMVER);
    MOD_CONFIG.DRAG_ENABLED = preservedDragEnabled;
    MOD_CONFIG.PREVIEWS_ENABLED = preservedPreviewsEnabled;
    SetRuntimePresetName("");
    return diagnostics;
}

function FindRootPanel() {
    var root = $.GetContextPanel();
    while (root && root.GetParent && root.GetParent()) {
        root = root.GetParent();
    }
    return root;
}

function ExtractHeroTokenFromText(rawText) {
    if (!rawText) return "";
    var text = String(rawText);
    var m = text.match(/\b(hero_[a-z0-9_]+)\b/i);
    return (m && m[1]) ? String(m[1]).toLowerCase() : "";
}

function ExtractLastHeroTokenFromText(rawText) {
    if (!rawText) return "";
    var text = String(rawText);
    var re = /\b(hero_[a-z0-9_]+)\b/ig;
    var match = null;
    var last = "";
    while ((match = re.exec(text)) !== null) {
        if (match[1]) last = String(match[1]).toLowerCase();
    }
    return last;
}

function PublishHeroHintFromSettings() {
    // GameInterfaceAPI confirmed absent — hero hint publishing from settings unavailable.
    // Hero detection relies on HUD-side UI panel scanning.
}

function StartHeroHintPublisher() {
    function tick() {
        // Only publish hero hints while the settings window is open.
        // No point running this poll when the player can't see the settings UI.
        if (IsSettingsWindowVisible()) {
            try { PublishHeroHintFromSettings(); } catch(e0) { WarnLog("settings", "op failed: " + (e0 && e0.message ? e0.message : String(e0 || ""))); }
        }
        $.Schedule(HERO_HINT_PUBLISH_INTERVAL_SEC, tick);
    }
    tick();
}

function IsInHideoutForBuildSave() {
    // Game.GetMapInfo confirmed absent — use panel class detection for hideout detection.
    var root = FindRootPanel();
    if (root && root.BHasClass) {
        try {
            if (root.BHasClass("connectedToHideout") || root.BHasClass("InHideout")) return true;
        } catch(e1) { WarnLog("settings", "op failed: " + (e1 && e1.message ? e1.message : String(e1 || ""))); }
    }
    var hud = root && root.FindChildTraverse ? root.FindChildTraverse("Hud") : null;
    if (hud && hud.BHasClass) {
        try {
            if (hud.BHasClass("connectedToHideout") || hud.BHasClass("InHideout")) return true;
        } catch(e2) { WarnLog("settings", "op failed: " + (e2 && e2.message ? e2.message : String(e2 || ""))); }
    }
    return false;
}

function GetNowMs() {
    try {
        return Date.now ? Date.now() : (new Date()).getTime();
    } catch (e0) {
        return (new Date()).getTime();
    }
}

function HasPanelClassToken(panel, className) {
    if (!panel || !panel.BHasClass || !className) return false;
    try {
        return panel.BHasClass(className);
    } catch (e0) {
        return false;
    }
}

function IsSettingsInActiveMatchContext() {
    var root = FindRootPanel();
    if (!root) return false;

    var hud = root.FindChildTraverse ? root.FindChildTraverse("Hud") : null;
    var gameplayHud = root.FindChildTraverse ? root.FindChildTraverse("gameplay_hud") : null;
    var hideout = IsInHideoutForBuildSave();

    var hasAnyClass = function(className) {
        return HasPanelClassToken(root, className) ||
            HasPanelClassToken(hud, className) ||
            HasPanelClassToken(gameplayHud, className);
    };

    if (
        hasAnyClass("GameStateGameInProgress") ||
        hasAnyClass("GameStatePostGame") ||
        hasAnyClass("GameStatePostGamePlayOfTheGame") ||
        hasAnyClass("inPostGame")
    ) {
        return true;
    }

    if (
        !hideout &&
        (
            hasAnyClass("connectedToGame") ||
            hasAnyClass("joined_team") ||
            hasAnyClass("GameStatePreGame") ||
            hasAnyClass("GameStatePreGameWait") ||
            hasAnyClass("GameStateWaitForMapToLoad") ||
            hasAnyClass("GameStateHeroSelection") ||
            hasAnyClass("GameStateMatchIntro")
        )
    ) {
        return true;
    }

    // Game.GetMapInfo confirmed absent — match detection via panel classes only.
    return false;
}

function StopSettingsGameTransitionWatch() {
    gSettingsTransitionWatchToken++;
    gSettingsTransitionWatchRunning = false;
}

function TryCloseSettingsForGameTransition(reason) {
    if (!IsSettingsWindowVisible()) return false;
    if (!gSettingsOpenedInHideout) return false;
    if (!IsSettingsInActiveMatchContext()) return false;

    var now = GetNowMs();
    if (now < gSettingsTransitionCloseCooldownUntilMs) return false;
    gSettingsTransitionCloseCooldownUntilMs = now + SETTINGS_TRANSITION_CLOSE_COOLDOWN_MS;

    $.ForceCloseModSettings();
    return true;
}

function HandleSettingsGameTransitionSignal(reason) {
    if (!IsSettingsWindowVisible()) return;
    if (!gSettingsOpenedInHideout) return;

    for (var i = 0; i < SETTINGS_TRANSITION_SIGNAL_RECHECK_SEC.length; i++) {
        (function(delaySec) {
            $.Schedule(delaySec, function() {
                TryCloseSettingsForGameTransition(reason);
            });
        })(SETTINGS_TRANSITION_SIGNAL_RECHECK_SEC[i]);
    }
}

function StartSettingsGameTransitionWatch() {
    StopSettingsGameTransitionWatch();
    gSettingsTransitionWatchRunning = true;
    var token = gSettingsTransitionWatchToken;

    function tick() {
        if (token !== gSettingsTransitionWatchToken) return;
        if (!IsSettingsWindowVisible()) {
            gSettingsTransitionWatchRunning = false;
            return;
        }

        if (TryCloseSettingsForGameTransition("watchdog")) {
            gSettingsTransitionWatchRunning = false;
            return;
        }

        $.Schedule(SETTINGS_TRANSITION_WATCH_INTERVAL_SEC, tick);
    }

    $.Schedule(SETTINGS_TRANSITION_WATCH_INTERVAL_SEC, tick);
}

function QueueBuildSaveRequest(rawExportString) {
    var payload = rawExportString ? String(rawExportString).replace(/\s+/g, "") : "";
    if (!payload || !EXPORT_TOKEN_REGEX.test(payload)) return "";

    var token = String(Date.now ? Date.now() : (new Date()).getTime()) + "_" + String(Math.floor(Math.random() * 1000000));
    var panel = $.GetContextPanel();
    var root = FindRootPanel();

    if (panel && panel.SetAttributeString) {
        panel.SetAttributeString(BUILD_SAVE_REQUEST_ATTR, payload);
        panel.SetAttributeString(BUILD_SAVE_TOKEN_ATTR, token);
        panel.SetAttributeString(BUILD_SAVE_MSG_ATTR, "queued");
        panel.SetAttributeString(BUILD_SAVE_STATE_ATTR, "pending");
    }
    if (root && root.SetAttributeString) {
        root.SetAttributeString(BUILD_SAVE_REQUEST_ATTR, payload);
        root.SetAttributeString(BUILD_SAVE_TOKEN_ATTR, token);
        root.SetAttributeString(BUILD_SAVE_MSG_ATTR, "queued");
        root.SetAttributeString(BUILD_SAVE_STATE_ATTR, "pending");
    }
    return token;
}

function ReadBuildSaveStatus() {
    var panel = $.GetContextPanel();
    var root = FindRootPanel();
    var fromRoot = root && root.GetAttributeString ? {
        state: root.GetAttributeString(BUILD_SAVE_STATE_ATTR, ""),
        msg: root.GetAttributeString(BUILD_SAVE_MSG_ATTR, ""),
        token: root.GetAttributeString(BUILD_SAVE_TOKEN_ATTR, "")
    } : { state: "", msg: "", token: "" };
    if (fromRoot.state || fromRoot.msg || fromRoot.token) return fromRoot;
    if (panel && panel.GetAttributeString) {
        return {
            state: panel.GetAttributeString(BUILD_SAVE_STATE_ATTR, ""),
            msg: panel.GetAttributeString(BUILD_SAVE_MSG_ATTR, ""),
            token: panel.GetAttributeString(BUILD_SAVE_TOKEN_ATTR, "")
        };
    }
    return { state: "", msg: "", token: "" };
}

function ResolveBuildSavePendingLabel(message) {
    if (message === "starting") return "START";
    if (message === "switching_to_skyrunner" || message === "switching_to_airheart") return "SKYRUNNER";
    if (message === "waiting_for_shop") return "OPEN SHOP";
    if (message === "initializing_storage_build") return "INIT BUILD";
    if (message === "opening_edit_mode") return "EDITING";
    if (message === "writing_category_name") return "WRITING";
    if (message === "saving") return "SAVING";
    if (message === "verifying") return "VERIFY";
    return "SAVING";
}

function WatchBuildSaveStatus(saveBtn, saveLbl, expectedToken, defaultLabel) {
    var startMs = Date.now ? Date.now() : (new Date()).getTime();
    var timeoutMs = 30000;
    var lastFeedbackKey = "";

    function setFeedbackForPending(msg) {
        var key = "pending:" + String(msg || "");
        if (key === lastFeedbackKey) return;
        lastFeedbackKey = key;
        var message = String(msg || "");
        if (message === "waiting_for_shop") {
            SetLocalizedConfigFeedbackMessage("Open shop to continue save.", "warning", 0);
            return;
        }
        if (message === "switching_to_skyrunner" || message === "switching_to_airheart") {
            SetLocalizedConfigFeedbackMessage("Switching to Skyrunner...", "info", 0);
            return;
        }
        if (message === "writing_category_name" || message === "saving") {
            SetLocalizedConfigFeedbackMessage("Writing settings string to build...", "info", 0);
            return;
        }
            SetLocalizedConfigFeedbackMessage("Save in progress...", "info", 0);
    }

    function restoreDefault() {
        if (!saveBtn || !saveBtn.IsValid || !saveBtn.IsValid()) return;
        saveBtn.RemoveClass("SuccessState");
        saveBtn.RemoveClass("FailureState");
        saveLbl.text = defaultLabel;
    }

    function tick() {
        if (!saveBtn || !saveBtn.IsValid || !saveBtn.IsValid()) return;
        var nowMs = Date.now ? Date.now() : (new Date()).getTime();
        var elapsedMs = nowMs - startMs;
        var status = ReadBuildSaveStatus();
        var tokenMatches = !expectedToken || !status.token || status.token === expectedToken;

        if (status.state === "pending" && tokenMatches) {
            saveBtn.RemoveClass("FailureState");
            saveBtn.AddClass("SuccessState");
            saveLbl.text = LocalizeSettingsText(ResolveBuildSavePendingLabel(status.msg || ""), true);
            setFeedbackForPending(status.msg || "");
            if (elapsedMs >= timeoutMs) {
                saveBtn.RemoveClass("SuccessState");
                saveBtn.AddClass("FailureState");
                saveLbl.text = LocalizeSettingsText("TIMEOUT", true);
        SetLocalizedConfigFeedbackMessage("Save timed out. Try again.", "error", 2600);
                $.Schedule(0.75, restoreDefault);
                return;
            }
            $.Schedule(0.15, tick);
            return;
        }

        if (status.state === "success" && tokenMatches) {
            saveBtn.RemoveClass("FailureState");
            saveBtn.AddClass("SuccessState");
            saveLbl.text = LocalizeSettingsText("SAVED", true);
            SetLocalizedConfigFeedbackMessage("Save completed.", "success", 2200);
            $.Schedule(0.75, restoreDefault);
            return;
        }

        if (status.state === "failed" && tokenMatches) {
            saveBtn.RemoveClass("SuccessState");
            saveBtn.AddClass("FailureState");
            saveLbl.text = LocalizeSettingsText("FAILED", true);
            SetLocalizedConfigFeedbackMessage("Save failed.", "error", 2600);
            $.Schedule(0.75, restoreDefault);
            return;
        }

        if (elapsedMs < timeoutMs) {
            $.Schedule(0.15, tick);
            return;
        }
        restoreDefault();
    }

    tick();
}

var gSaveButtonLastActionMs = 0;
var SAVE_BUTTON_DEBOUNCE_MS = 1000;

function ActivateBuildSaveFromUi(saveBtn, saveLbl, onBeforeQueue) {
    if (!saveBtn || !saveBtn.IsValid || !saveBtn.IsValid()) return;
    if (!saveLbl || !saveLbl.IsValid || !saveLbl.IsValid()) return;
    var nowMs = Date.now ? Date.now() : (new Date()).getTime();
    if (gSaveButtonLastActionMs > nowMs - SAVE_BUTTON_DEBOUNCE_MS) return;
    gSaveButtonLastActionMs = nowMs;
    var cfgSave = LocalizeSettingsText("SAVE", true);
    var cfgQueued = LocalizeSettingsText("QUEUED", true);
    var cfgFailed = LocalizeSettingsText("FAILED", true);

    if (typeof onBeforeQueue === "function") {
        try { onBeforeQueue(); } catch(e0) { WarnLog("settings", "op failed: " + (e0 && e0.message ? e0.message : String(e0 || ""))); }
    }

    var exportRaw = GetCurrentExportSettingsString();
    var token = QueueBuildSaveRequest(exportRaw);
    if (!token || token.length === 0) {
        saveBtn.RemoveClass("SuccessState");
        saveBtn.AddClass("FailureState");
        saveLbl.text = cfgFailed;
        SetLocalizedConfigFeedbackMessage("Failed to queue save request.", "error", 2200);
        $.Schedule(0.6, function() {
            if (!saveBtn || !saveBtn.IsValid || !saveBtn.IsValid()) return;
            saveBtn.RemoveClass("FailureState");
            saveLbl.text = cfgSave;
        });
        return;
    }

    saveBtn.RemoveClass("FailureState");
    saveBtn.AddClass("SuccessState");
    saveLbl.text = cfgQueued;
        SetLocalizedConfigFeedbackMessage("Save queued.", "info", 0);
    WatchBuildSaveStatus(saveBtn, saveLbl, token, cfgSave);
}

var gClearButtonLastActionMs = 0;
var CLEAR_BUTTON_DEBOUNCE_MS = 1000;

function QueueBuildClearRequest() {
    var nowMs = Date.now ? Date.now() : (new Date()).getTime();
    if (gClearButtonLastActionMs > nowMs - CLEAR_BUTTON_DEBOUNCE_MS) return "";
    gClearButtonLastActionMs = nowMs;
    var token = String(Date.now ? Date.now() : (new Date()).getTime()) + "_" + String(Math.floor(Math.random() * 1000000));
    var panel = $.GetContextPanel();
    var root = FindRootPanel();

    var saveStatus = ReadBuildSaveStatus();
    if (saveStatus && saveStatus.state === "pending") return "";

    if (panel && panel.SetAttributeString) {
        panel.SetAttributeString(BUILD_CLEAR_REQUEST_ATTR, "1");
        panel.SetAttributeString(BUILD_CLEAR_TOKEN_ATTR, token);
        panel.SetAttributeString(BUILD_CLEAR_MSG_ATTR, "queued");
        panel.SetAttributeString(BUILD_CLEAR_STATE_ATTR, "pending");
    }
    if (root && root.SetAttributeString) {
        root.SetAttributeString(BUILD_CLEAR_REQUEST_ATTR, "1");
        root.SetAttributeString(BUILD_CLEAR_TOKEN_ATTR, token);
        root.SetAttributeString(BUILD_CLEAR_MSG_ATTR, "queued");
        root.SetAttributeString(BUILD_CLEAR_STATE_ATTR, "pending");
    }
    return token;
}

function ReadBuildClearStatus() {
    var panel = $.GetContextPanel();
    var root = FindRootPanel();
    var fromRoot = root && root.GetAttributeString ? {
        state: root.GetAttributeString(BUILD_CLEAR_STATE_ATTR, ""),
        msg: root.GetAttributeString(BUILD_CLEAR_MSG_ATTR, ""),
        token: root.GetAttributeString(BUILD_CLEAR_TOKEN_ATTR, "")
    } : { state: "", msg: "", token: "" };
    if (fromRoot.state || fromRoot.msg || fromRoot.token) return fromRoot;
    if (panel && panel.GetAttributeString) {
        return {
            state: panel.GetAttributeString(BUILD_CLEAR_STATE_ATTR, ""),
            msg: panel.GetAttributeString(BUILD_CLEAR_MSG_ATTR, ""),
            token: panel.GetAttributeString(BUILD_CLEAR_TOKEN_ATTR, "")
        };
    }
    return { state: "", msg: "", token: "" };
}

function ResolveBuildClearPendingLabel(message) {
    if (message === "starting") return "START";
    if (message === "switching_to_skyrunner" || message === "switching_to_airheart") return "SKYRUNNER";
    if (message === "confirming_skyrunner" || message === "confirming_airheart") return "SKYRUNNER";
    if (message === "await_user_open_shop") return "OPEN SHOP";
    if (message === "waiting_for_shop") return "OPEN SHOP";
    if (message === "opening_builds_list") return "BROWSE";
    if (message === "deleting_build") return "CLEARING";
    if (message === "confirming_delete") return "CONFIRM";
    if (message === "verifying_clear") return "VERIFY";
    return "CLEARING";
}

function IsBuildClearUserPromptStage(message) {
    return message === "await_user_open_shop" || message === "waiting_for_shop";
}

function WatchBuildClearStatus(clearBtn, clearLbl, expectedToken, defaultLabel) {
    var startMs = Date.now ? Date.now() : (new Date()).getTime();
    var timeoutMs = 30000;
    var forcedCloseForPrompt = false;
    var lastFeedbackKey = "";

    function setFeedbackForPending(msg, isPrompt) {
        var key = String(msg || "") + "|" + String(isPrompt ? 1 : 0);
        if (key === lastFeedbackKey) return;
        lastFeedbackKey = key;
        if (isPrompt) {
            SetLocalizedConfigFeedbackMessage("Open shop to continue clear.", "warning", 0);
            return;
        }
        if (
            msg === "switching_to_skyrunner" ||
            msg === "switching_to_airheart" ||
            msg === "confirming_skyrunner" ||
            msg === "confirming_airheart"
        ) {
            SetLocalizedConfigFeedbackMessage("Confirming Skyrunner for clear...", "info", 0);
            return;
        }
        if (msg === "deleting_build" || msg === "confirming_delete") {
            SetLocalizedConfigFeedbackMessage("Clearing builds...", "info", 0);
            return;
        }
            SetLocalizedConfigFeedbackMessage("Clear in progress...", "info", 0);
    }

    function restoreDefault() {
        if (!clearBtn || !clearBtn.IsValid || !clearBtn.IsValid()) return;
        clearBtn.RemoveClass("SuccessState");
        clearBtn.RemoveClass("FailureState");
        clearBtn.RemoveClass("UserPromptState");
        clearLbl.text = defaultLabel;
    }

    function tick() {
        if (!clearBtn || !clearBtn.IsValid || !clearBtn.IsValid()) return;
        var nowMs = Date.now ? Date.now() : (new Date()).getTime();
        var elapsedMs = nowMs - startMs;
        var status = ReadBuildClearStatus();
        var tokenMatches = !expectedToken || !status.token || status.token === expectedToken;

        if (status.state === "pending" && tokenMatches) {
            var pendingMsg = status.msg || "";
            var isUserPromptStage = IsBuildClearUserPromptStage(pendingMsg);
            if (isUserPromptStage) {
                clearBtn.RemoveClass("SuccessState");
                clearBtn.AddClass("FailureState");
                clearBtn.AddClass("UserPromptState");
                clearLbl.text = LocalizeSettingsText(ResolveBuildClearPendingLabel(pendingMsg), true);
                setFeedbackForPending(pendingMsg, true);
                if (!forcedCloseForPrompt) {
                    forcedCloseForPrompt = true;
                    $.ForceCloseModSettings();
                }
            } else {
                forcedCloseForPrompt = false;
                clearBtn.RemoveClass("UserPromptState");
                clearBtn.RemoveClass("FailureState");
                clearBtn.AddClass("SuccessState");
                clearLbl.text = LocalizeSettingsText(ResolveBuildClearPendingLabel(pendingMsg), true);
                setFeedbackForPending(pendingMsg, false);
            }
            if (elapsedMs >= timeoutMs) {
                clearBtn.RemoveClass("SuccessState");
                clearBtn.AddClass("FailureState");
                clearBtn.RemoveClass("UserPromptState");
                clearLbl.text = LocalizeSettingsText("TIMEOUT", true);
        SetLocalizedConfigFeedbackMessage("Clear timed out. Try again.", "error", 2600);
                $.Schedule(0.75, restoreDefault);
                return;
            }
            $.Schedule(0.15, tick);
            return;
        }

        if (status.state === "success" && tokenMatches) {
            clearBtn.RemoveClass("FailureState");
            clearBtn.AddClass("SuccessState");
            clearBtn.RemoveClass("UserPromptState");
            clearLbl.text = LocalizeSettingsText("CLEARED", true);
            SetLocalizedConfigFeedbackMessage("Clear completed.", "success", 2200);
            $.Schedule(0.75, restoreDefault);
            return;
        }

        if (status.state === "failed" && tokenMatches) {
            clearBtn.RemoveClass("SuccessState");
            clearBtn.AddClass("FailureState");
            clearBtn.RemoveClass("UserPromptState");
            clearLbl.text = LocalizeSettingsText("FAILED", true);
            SetLocalizedConfigFeedbackMessage("Clear failed.", "error", 2600);
            $.Schedule(0.75, restoreDefault);
            return;
        }

        if (elapsedMs < timeoutMs) {
            $.Schedule(0.15, tick);
            return;
        }
        restoreDefault();
    }

    tick();
}

function ReadConfigRawFromStorage() {
    var panel = $.GetContextPanel();
    var root = FindRootPanel();
    var hud = null;
    try { hud = (root && root.FindChildTraverse) ? root.FindChildTraverse("Hud") : null; } catch (eHud) { hud = null; }
    var readRaw = function(target) {
        if (!target || !target.GetAttributeString) return "";
        try { return String(target.GetAttributeString(STORAGE_KEY, "") || ""); } catch (e0) { return ""; }
    };
    var parseRev = (typeof QOL_UTILS !== "undefined" && QOL_UTILS.ParseRevisionNumber) || function(v) { var n = Number(v); if (!isFinite(n) || n < 0) return 0; return Math.floor(n); };
    var readRev = function(target) {
        if (!target || !target.GetAttributeString) return 0;
        try { return parseRev(target.GetAttributeString(USER_EDIT_REV_ATTR, "")); } catch (e1) { return 0; }
    };
    var sources = [
        { raw: readRaw(panel), rev: readRev(panel), rank: 3 },
        { raw: readRaw(hud), rev: readRev(hud), rank: 2 },
        { raw: readRaw(root), rev: readRev(root), rank: 1 }
    ];
    var chosen = null;
    for (var i = 0; i < sources.length; i++) {
        var source = sources[i];
        if (!source.raw) continue;
        if (!chosen || source.rev > chosen.rev || (source.rev === chosen.rev && source.rank > chosen.rank)) {
            chosen = source;
        }
    }
    gUserEditRevision = Math.max(gUserEditRevision, sources[0].rev, sources[1].rev, sources[2].rev);
    var chosenRaw = chosen ? chosen.raw : "";
    if (chosenRaw && panel && panel.SetAttributeString && sources[0].raw !== chosenRaw) {
        panel.SetAttributeString(STORAGE_KEY, chosenRaw);
    }
    return chosenRaw;
}

// NormalizeConfig — canonical normalization / migration chain.
// Called from both SyncConfigFromStorage (on load) and SaveAndSync (on save).
// Normalize functions are provided by ql_config.js as file-scope globals.
function NormalizeConfig(config, parsed) {
    MigrateSplitZoomKeys(config, parsed);
    NormalizeNeutralCampFlags(config, parsed);
    NormalizeItemCooldownModeConfig(config, parsed);
    NormalizeAmmoScaleConfig(config, parsed);
    NormalizeVoiceTypeConfig(config);
    NormalizeHealthbarTypeConfig(config, parsed);
    NormalizeColorWarningConfig(config, parsed);
    NormalizeEnemyColorWarningConfig(config, parsed);
    NormalizeAllyColorWarningConfig(config, parsed);
    NormalizeTopbarEnemyHpWarningConfig(config, parsed);
    NormalizeTopbarAllyHpWarningConfig(config, parsed);
    NormalizeShopItemNotificationsConfig(config, parsed);
}

function SyncConfigFromStorage() {
    var raw = ReadConfigRawFromStorage();
    // $.persistentStorage confirmed absent — panel attrs are the only persistence.
    // QOL_DEFAULT_CONFIG always available — same context as ql_shared_presets.js
    var nextConfig = Object.assign({}, QOL_DEFAULT_CONFIG);
    if (raw && raw.length > 0) {
        try {
            var unwrapped = UnwrapConfigFromStorage(raw);
            var parsed = (unwrapped && unwrapped.config) ? unwrapped.config : {};
            for (var key in parsed) {
                if (nextConfig.hasOwnProperty(key)) {
                    nextConfig[key] = parsed[key];
                }
            }
            NormalizeConfig(nextConfig, parsed);
        } catch (e) { $.Msg("[QOLLock][WARN][config] SyncConfigFromStorage parse/merge failed: " + (e && e.message ? e.message : String(e || ""))); }
    }
    MOD_CONFIG = nextConfig;
    gLastSavedConfigRaw = WrapConfigForStorage(MOD_CONFIG);
    // $.persistentStorage confirmed absent — statlocker state persists via panel attrs only.
    UpdateOnDeathArcadeBridgePollerState();
}

function PersistStatlockerProfileState(rawConfig, configObj) {
    // $.persistentStorage confirmed absent — config persistence is via Skyrunner builds.
}

function GetRuntimePresetName() {
    var panel = $.GetContextPanel();
    var root = FindRootPanel();
    if (root && root.GetAttributeString) {
        var rootValue = root.GetAttributeString(RUNTIME_PRESET_ATTR, "");
        if (rootValue) return String(rootValue);
    }
    var hud = null;
    try { hud = (root && root.FindChildTraverse) ? root.FindChildTraverse("Hud") : null; } catch (e0) { hud = null; }
    if (hud && hud.GetAttributeString) {
        var hudValue = hud.GetAttributeString(RUNTIME_PRESET_ATTR, "");
        if (hudValue) return String(hudValue);
    }
    if (panel && panel.GetAttributeString) {
        var localValue = panel.GetAttributeString(RUNTIME_PRESET_ATTR, "");
        if (localValue) return String(localValue);
    }
    return "";
}

function SetRuntimePresetName(presetName) {
    var value = String(presetName || "");
    var panel = $.GetContextPanel();
    var root = FindRootPanel();
    var hud = null;
    try { hud = (root && root.FindChildTraverse) ? root.FindChildTraverse("Hud") : null; } catch (e0) { hud = null; }
    if (panel && panel.SetAttributeString) {
        panel.SetAttributeString(RUNTIME_PRESET_ATTR, value);
    }
    if (root && root.SetAttributeString) {
        root.SetAttributeString(RUNTIME_PRESET_ATTR, value);
    }
    if (hud && hud.SetAttributeString) {
        try { hud.SetAttributeString(RUNTIME_PRESET_ATTR, value); } catch(e1) { WarnLog("settings", "op failed: " + (e1 && e1.message ? e1.message : String(e1 || ""))); }
    }
}

function PublishPaletteColorBridge(configId, value) {
    var attrName = "";
    if (configId === "PLAYER_HEALTHBAR_ACCENT_COLOR") {
        attrName = PLAYER_HEALTHBAR_ACCENT_COLOR_ATTR;
    } else if (configId === "BOTTOM_BAR_WASH_COLOR") {
        attrName = BOTTOM_BAR_WASH_COLOR_ATTR;
    } else if (configId === "KEYBOARD_OVERLAY_WASH_COLOR") {
        attrName = KEYBOARD_OVERLAY_WASH_COLOR_ATTR;
    } else if (configId === "STAMINA_CHARGE_COLOR") {
        attrName = STAMINA_CHARGE_COLOR_ATTR;
    } else if (configId === "AMMO_TEXT_COLOR") {
        attrName = AMMO_TEXT_COLOR_ATTR;
    } else if (configId === "MINIMAP_ICON_COLOR") {
        attrName = MINIMAP_ICON_COLOR_ATTR;
    }
    if (!attrName) return "";
    var bridgeValue = String(Math.max(0, Math.min(29, Math.round(Number(value) || 0))));
    var panel = $.GetContextPanel();
    var root = FindRootPanel();
    var hud = null;
    try { hud = (root && root.FindChildTraverse) ? root.FindChildTraverse("Hud") : null; } catch (eHud) { hud = null; }
    try { if (panel && panel.SetAttributeString) panel.SetAttributeString(attrName, bridgeValue); } catch(ePanel) { WarnLog("settings", "op failed: " + (ePanel && ePanel.message ? ePanel.message : String(ePanel || ""))); }
    try { if (root && root.SetAttributeString) root.SetAttributeString(attrName, bridgeValue); } catch(eRoot) { WarnLog("settings", "op failed: " + (eRoot && eRoot.message ? eRoot.message : String(eRoot || ""))); }
    try { if (hud && hud.SetAttributeString) hud.SetAttributeString(attrName, bridgeValue); } catch(eHudSet) { WarnLog("settings", "op failed: " + (eHudSet && eHudSet.message ? eHudSet.message : String(eHudSet || ""))); }
    // $.persistentStorage confirmed absent — accent color persisted via panel attrs only.
    return bridgeValue;
}

function PublishPaletteColorBridges() {
    PublishPaletteColorBridge("PLAYER_HEALTHBAR_ACCENT_COLOR", MOD_CONFIG.PLAYER_HEALTHBAR_ACCENT_COLOR);
    PublishPaletteColorBridge("BOTTOM_BAR_WASH_COLOR", MOD_CONFIG.BOTTOM_BAR_WASH_COLOR);
    PublishPaletteColorBridge("KEYBOARD_OVERLAY_WASH_COLOR", MOD_CONFIG.KEYBOARD_OVERLAY_WASH_COLOR);
    PublishPaletteColorBridge("STAMINA_CHARGE_COLOR", MOD_CONFIG.STAMINA_CHARGE_COLOR);
    PublishPaletteColorBridge("AMMO_TEXT_COLOR", MOD_CONFIG.AMMO_TEXT_COLOR);
    PublishPaletteColorBridge("MINIMAP_ICON_COLOR", MOD_CONFIG.MINIMAP_ICON_COLOR);
}

// Debounced save: prevents rapid-fire saves during slider drags etc.
// Uses a token-counter pattern so only the last scheduled flush actually fires.
var gSaveDebounceToken = 0;
var SAVE_DEBOUNCE_SEC = 0.3;

function MarkConfigDirty() {
    var token = ++gSaveDebounceToken;
    $.Schedule(SAVE_DEBOUNCE_SEC, function() {
        if (gSaveDebounceToken === token) {
            gSaveDebounceToken = 0;
            SaveAndSync();
        }
    });
}

// Flushes any pending debounced save immediately (e.g. before import/reset).
function FlushPendingSave() {
    if (gSaveDebounceToken > 0) {
        gSaveDebounceToken = 0;
        SaveAndSync();
    }
}

function SaveAndSync() {
    var panel = $.GetContextPanel();
    var root = FindRootPanel();
    var hud = null;
    try { hud = (root && root.FindChildTraverse) ? root.FindChildTraverse("Hud") : null; } catch (eHud) { hud = null; }
    NormalizeConfig(MOD_CONFIG, MOD_CONFIG);
    RefreshActivePresetConfigMarkerBeforeSave();
    var data = WrapConfigForStorage(MOD_CONFIG);
    if (data === gLastSavedConfigRaw) {
        PublishPaletteColorBridges();
        return;
    }
    gLastSavedConfigRaw = data;
    var parseRev = (typeof QOL_UTILS !== "undefined" && QOL_UTILS.ParseRevisionNumber) || function(v) { var n = Number(v); if (!isFinite(n) || n < 0) return 0; return Math.floor(n); };
    var panelRev = (panel && panel.GetAttributeString) ? parseRev(panel.GetAttributeString(USER_EDIT_REV_ATTR, "")) : 0;
    var rootRev = (root && root.GetAttributeString) ? parseRev(root.GetAttributeString(USER_EDIT_REV_ATTR, "")) : 0;
    var hudRev = (hud && hud.GetAttributeString) ? parseRev(hud.GetAttributeString(USER_EDIT_REV_ATTR, "")) : 0;
    var nextRev = Math.max(gUserEditRevision, panelRev, rootRev, hudRev) + 1;
    gUserEditRevision = nextRev;
    // Write data + revision as a paired update per panel so an interrupted
    // save never orphans new data with an old revision number.
    if (panel && panel.SetAttributeString) {
        panel.SetAttributeString(STORAGE_KEY, data);
        panel.SetAttributeString(USER_EDIT_REV_ATTR, String(nextRev));
    }
    if (root && root.SetAttributeString) {
        root.SetAttributeString(STORAGE_KEY, data);
        root.SetAttributeString(USER_EDIT_REV_ATTR, String(nextRev));
    }
    if (hud && hud.SetAttributeString) {
        try { hud.SetAttributeString(STORAGE_KEY, data); } catch(eHudStorage) { WarnLog("settings", "op failed: " + (eHudStorage && eHudStorage.message ? eHudStorage.message : String(eHudStorage || ""))); }
        try { hud.SetAttributeString(USER_EDIT_REV_ATTR, String(nextRev)); } catch(eHudRev) { WarnLog("settings", "op failed: " + (eHudRev && eHudRev.message ? eHudRev.message : String(eHudRev || ""))); }
    }
    PersistStatlockerProfileState(data, MOD_CONFIG);
    PublishPaletteColorBridges();
    UpdateOnDeathArcadeBridgePollerState();
    ApplySettingsThemeClasses(panel && panel.FindChildTraverse ? panel.FindChildTraverse("SettingsWindow") : null);
    QueueActivePresetHighlightRefresh(0.05);
    RefreshEnumSections();
}

function GetSettingsListPanel() {
    var root = $.GetContextPanel();
    if (!root || !root.FindChildTraverse) return null;
    var list = null;
    try { list = root.FindChildTraverse("SettingsList"); } catch (e0) { list = null; }
    if (!list || !list.IsValid || !list.IsValid()) return null;
    return list;
}

function BuildSettingsListRenderSignature() {
    var langKey = GetSettingsLanguageKey();
    var themeKey = GetSettingsThemeKey();
    return String(currentTab || "") + "|" + langKey + "|" + themeKey;
}

function IsPanelValidSafe(panel) {
    if (typeof QOL_UTILS !== "undefined" && QOL_UTILS.IsPanelValid) {
        return QOL_UTILS.IsPanelValid(panel);
    }
    return !!(panel && panel.IsValid && panel.IsValid());
}

function MakeSettingsListSignatureKey(sig) {
    return String(sig || "").replace(/[^A-Za-z0-9_]/g, "_");
}

function EnsureSettingsListHosts(list) {
    if (!IsPanelValidSafe(list)) return null;
    var cacheHost = list.FindChildTraverse("SettingsListCacheHost");
    if (!IsPanelValidSafe(cacheHost)) {
        cacheHost = $.CreatePanel("Panel", list, "SettingsListCacheHost");
    }
    cacheHost.AddClass("SettingsListContentHost");

    var searchHost = list.FindChildTraverse("SettingsListSearchHost");
    if (!IsPanelValidSafe(searchHost)) {
        searchHost = $.CreatePanel("Panel", list, "SettingsListSearchHost");
    }
    searchHost.AddClass("SettingsListContentHost");
    searchHost.AddClass("SettingsListSearchHost");

    return {
        cacheHost: cacheHost,
        searchHost: searchHost
    };
}

function PruneInvalidSettingsListContentCaches() {
    for (var sig in gSettingsListContentPanelBySig) {
        if (!gSettingsListContentPanelBySig.hasOwnProperty(sig)) continue;
        if (!IsPanelValidSafe(gSettingsListContentPanelBySig[sig])) {
            delete gSettingsListContentPanelBySig[sig];
        }
    }
}

function EnsureSettingsListContentPanelForSignature(list, renderSig, forceRebuild) {
    var hosts = EnsureSettingsListHosts(list);
    if (!hosts || !IsPanelValidSafe(hosts.cacheHost)) {
        return { panel: null, created: false };
    }

    PruneInvalidSettingsListContentCaches();

    var sig = String(renderSig || "");
    var panel = gSettingsListContentPanelBySig[sig];
    var created = false;

    if (!IsPanelValidSafe(panel)) panel = null;

    if (forceRebuild === true && panel) {
        delete gSettingsListRowSyncFnsBySig[sig];
    }

    if (!panel) {
        var panelId = "SettingsListSig_" + MakeSettingsListSignatureKey(sig);
        panel = hosts.cacheHost.FindChildTraverse(panelId);
        if (!IsPanelValidSafe(panel)) {
            panel = $.CreatePanel("Panel", hosts.cacheHost, panelId);
        }
        panel.AddClass("SettingsListCachedTabContent");
        gSettingsListContentPanelBySig[sig] = panel;
        created = true;
    } else if (panel.GetParent && panel.GetParent() !== hosts.cacheHost) {
        panel.SetParent(hosts.cacheHost);
    }

    return {
        panel: panel,
        created: created
    };
}

function SetActiveSettingsListRenderSignature(renderSig) {
    gSettingsListActiveRenderSig = String(renderSig || "");
    if (!gSettingsListRowSyncFnsBySig.hasOwnProperty(gSettingsListActiveRenderSig)) {
        gSettingsListRowSyncFnsBySig[gSettingsListActiveRenderSig] = [];
    }
}

function ShowSettingsListTabPanel(list, renderSig) {
    var hosts = EnsureSettingsListHosts(list);
    if (!hosts || !IsPanelValidSafe(hosts.cacheHost) || !IsPanelValidSafe(hosts.searchHost)) return;
    var sig = String(renderSig || "");

    hosts.searchHost.SetHasClass("Hidden", true);
    for (var key in gSettingsListContentPanelBySig) {
        if (!gSettingsListContentPanelBySig.hasOwnProperty(key)) continue;
        var panel = gSettingsListContentPanelBySig[key];
        if (!IsPanelValidSafe(panel)) continue;
        panel.SetHasClass("Hidden", key !== sig);
    }
}

function IsSettingsSearchActiveQuery() {
    return String(currentSearchQuery || "").trim().length > 0;
}

// Debounced settings-search render: a full result rebuild tears down and recreates
// every matched row (CreateRow per match), so firing it on every keystroke makes
// fast typing/deleting/retyping lag. Coalesce a burst of keystrokes into a single
// rebuild after a short idle window. Token-counter pattern (same as gSaveDebounceToken):
// only the last scheduled render actually fires.
var gSearchRenderDebounceToken = 0;
var SEARCH_RENDER_DEBOUNCE_SEC = 0.12;

function RunSettingsSearchRenderNow() {
    var liveList = GetSettingsListPanel();
    if (liveList) UpdateListContent(liveList, true);
}

function ScheduleSettingsSearchRender() {
    var token = ++gSearchRenderDebounceToken;
    $.Schedule(SEARCH_RENDER_DEBOUNCE_SEC, function() {
        if (gSearchRenderDebounceToken !== token) return;
        gSearchRenderDebounceToken = 0;
        RunSettingsSearchRenderNow();
    });
}

// Cancels any pending debounced render (e.g. when another path renders immediately).
function CancelSettingsSearchRender() {
    gSearchRenderDebounceToken++;
}

// Renders immediately and cancels any pending debounce (e.g. on Enter/submit).
function FlushSettingsSearchRender() {
    gSearchRenderDebounceToken++;
    RunSettingsSearchRenderNow();
}

function RenderSettingsSearchResultsOnly(list) {
    if (!list || !list.IsValid || !list.IsValid()) return false;
    var hosts = EnsureSettingsListHosts(list);
    if (!hosts || !IsPanelValidSafe(hosts.searchHost)) return false;
    HideMinimapSizePreview();
    SetActiveSettingsListRenderSignature("__search__");
    ResetSettingsListRowSyncRegistry();
    ShowSettingsListTabPanel(list, "");
    hosts.searchHost.SetHasClass("Hidden", false);
    hosts.searchHost.RemoveAndDeleteChildren();
    var rendered = RenderSearchResults(hosts.searchHost, currentSearchQuery);
    gSettingsListSearchModeActive = rendered === true;
    UpdatePresetHighlightPollingState();
    return rendered === true;
}

function ResetSettingsListRowSyncRegistry() {
    var sig = String(gSettingsListActiveRenderSig || "");
    gSettingsListRowSyncFns = [];
    gSettingsListRowSyncFnsBySig[sig] = [];
}

function RegisterSettingsListRowSync(fn) {
    if (typeof fn !== "function") return;
    var sig = String(gSettingsListActiveRenderSig || "");
    if (!gSettingsListRowSyncFnsBySig.hasOwnProperty(sig)) {
        gSettingsListRowSyncFnsBySig[sig] = [];
    }
    gSettingsListRowSyncFnsBySig[sig].push(fn);
    gSettingsListRowSyncFns = gSettingsListRowSyncFnsBySig[sig];
}

function RunSettingsListRowSync() {
    var sig = String(gSettingsListActiveRenderSig || "");
    var bucket = gSettingsListRowSyncFnsBySig[sig];
    if (!Array.isArray(bucket) || bucket.length <= 0) return;
    for (var i = bucket.length - 1; i >= 0; i--) {
        var fn = bucket[i];
        if (typeof fn !== "function") {
            bucket.splice(i, 1);
            continue;
        }
        var keep = true;
        try {
            keep = (fn() !== false);
        } catch (e0) {
            keep = false;
        }
        if (!keep) {
            bucket.splice(i, 1);
        }
    }
    gSettingsListRowSyncFnsBySig[sig] = bucket;
    gSettingsListRowSyncFns = bucket;
}

function RefreshRuntimeControlVisuals() {
    for (var key in gRuntimeButtonGroupRefreshers) {
        if (!gRuntimeButtonGroupRefreshers.hasOwnProperty(key)) continue;
        var refreshFn = gRuntimeButtonGroupRefreshers[key];
        if (typeof refreshFn !== "function") continue;
        try { refreshFn(); } catch (e0) { $.Msg("[QOLLock][WARN][settings] Button group refresh callback failed for key=" + key + ": " + (e0 && e0.message ? e0.message : String(e0 || ""))); }
    }
    if (Array.isArray(gArcadeOnDeathSyncFns)) {
        for (var i = gArcadeOnDeathSyncFns.length - 1; i >= 0; i--) {
            var syncFn = gArcadeOnDeathSyncFns[i];
            var keep = true;
            if (typeof syncFn !== "function") {
                keep = false;
            } else {
                try { keep = (syncFn() !== false); } catch (e1) { $.Msg("[QOLLock][WARN][settings] Arcade sync callback failed: " + (e1 && e1.message ? e1.message : String(e1 || ""))); keep = false; }
            }
            if (!keep) gArcadeOnDeathSyncFns.splice(i, 1);
        }
    }
}

function SoftRefreshSettingsListContent(list) {
    var targetList = list || GetSettingsListPanel();
    if (!targetList || !targetList.IsValid || !targetList.IsValid()) return false;
    RefreshRuntimeControlVisuals();
    RunSettingsListRowSync();
    QueueActivePresetHighlightRefresh(0.02);
    return true;
}

function RequestSettingsListRefresh(delaySec, forceRebuild) {
    var delay = Number(delaySec);
    if (!isFinite(delay) || delay < 0) delay = 0;
    if (forceRebuild === true) gSettingsListRefreshForcePending = true;
    gSettingsListRefreshToken += 1;
    var refreshToken = gSettingsListRefreshToken;

    $.Schedule(delay, function() {
        if (refreshToken !== gSettingsListRefreshToken) return;
        var list = GetSettingsListPanel();
        var shouldForce = (gSettingsListRefreshForcePending === true);
        gSettingsListRefreshForcePending = false;
        if (!list) return;
        UpdateListContent(list, shouldForce);
    });
}

function RefreshSettingsLanguageUiAfterConfigChange(previousLanguage) {
    if (Math.round(Number(previousLanguage)) === GetSettingsLanguage()) return false;
    InvalidateSearchSectionIndexCache();

    $.Schedule(0.02, function() {
        if (typeof $.BuildUI === "function" && IsSettingsWindowVisible()) {
            $.BuildUI();
            return;
        }

        var rootPanel = $.GetContextPanel();
        var tabBar = rootPanel ? rootPanel.FindChildTraverse("SettingsTabBar") : null;
        var settingsList = rootPanel ? rootPanel.FindChildTraverse("SettingsList") : null;
        SyncTabActiveStates(tabBar);
        if (settingsList && settingsList.IsValid && settingsList.IsValid()) {
            RequestSettingsListRefresh(0, true);
        }
    });
    return true;
}

function RefreshSettingsListContent() {
    RequestSettingsListSoftRefresh(0);
}

function RequestSettingsListSoftRefresh(delaySec) {
    var delay = Number(delaySec);
    if (!isFinite(delay) || delay < 0) delay = 0;
    gSettingsListSoftRefreshToken += 1;
    var refreshToken = gSettingsListSoftRefreshToken;
    $.Schedule(delay, function() {
        if (refreshToken !== gSettingsListSoftRefreshToken) return;
        SoftRefreshSettingsListContent(GetSettingsListPanel());
    });
}

function GetRowResetKeys(rowPanel) {
    if (!rowPanel || !rowPanel.GetAttributeString) return [];
    var raw = "";
    try { raw = rowPanel.GetAttributeString(SETTING_ROW_RESET_KEYS_ATTR, ""); } catch (e0) { raw = ""; }
    if (!raw || raw.length === 0) return [];
    var parts = String(raw).split(",");
    var keys = [];
    var seen = {};
    for (var i = 0; i < parts.length; i++) {
        var key = String(parts[i] || "").trim();
        if (!key || seen[key]) continue;
        seen[key] = true;
        keys.push(key);
    }
    return keys;
}

function ApplyResetForConfigKeys(keys) {
    if (!Array.isArray(keys) || keys.length <= 0) return 0;
    var changed = 0;
    for (var i = 0; i < keys.length; i++) {
        var key = String(keys[i] || "");
        if (!key || !MOD_CONFIG.hasOwnProperty(key) || !DEFAULT_CONFIG.hasOwnProperty(key)) continue;
        if (NormalizeComparableConfigValue(MOD_CONFIG[key]) === NormalizeComparableConfigValue(DEFAULT_CONFIG[key])) continue;
        MOD_CONFIG[key] = DEFAULT_CONFIG[key];
        changed++;
    }
    return changed;
}

function CollectResetKeysFromPanel(panel, outKeys, seen) {
    if (!panel || !outKeys || !seen) return;

    try {
        if (panel.BHasClass && panel.BHasClass("SettingRow")) {
            var rowKeys = GetRowResetKeys(panel);
            for (var i = 0; i < rowKeys.length; i++) {
                var key = rowKeys[i];
                if (!key || seen[key]) continue;
                seen[key] = true;
                outKeys.push(key);
            }
        }
    } catch (e0) { $.Msg("[QOLLock][WARN][settings] CollectResetKeysFromPanel failed: " + (e0 && e0.message ? e0.message : String(e0 || ""))); }

    var children = [];
    try { children = panel.Children ? panel.Children() : []; } catch (e1) { children = []; }
    for (var c = 0; c < children.length; c++) {
        CollectResetKeysFromPanel(children[c], outKeys, seen);
    }
}

function CollectResetKeysFromSectionTitleRow(titleRow) {
    var keys = [];
    var seen = {};
    if (!titleRow || !titleRow.GetParent) return keys;
    var parent = titleRow.GetParent();
    if (!parent || !parent.Children) return keys;

    var siblings = [];
    try { siblings = parent.Children() || []; } catch (e0) { siblings = []; }
    var startIndex = -1;
    for (var i = 0; i < siblings.length; i++) {
        if (siblings[i] === titleRow) {
            startIndex = i;
            break;
        }
    }
    if (startIndex < 0) return keys;

    for (var s = startIndex + 1; s < siblings.length; s++) {
        var sibling = siblings[s];
        if (!sibling || !sibling.IsValid || !sibling.IsValid()) continue;
        var isBoundary = false;
        try {
            if ((sibling.BHasClass && sibling.BHasClass("SectionTitleRow")) ||
                (sibling.BHasClass && sibling.BHasClass("SectionTitle")) ||
                (sibling.BHasClass && sibling.BHasClass("RowSeparator"))) {
                isBoundary = true;
            }
        } catch(e1) { WarnLog("settings", "op failed: " + (e1 && e1.message ? e1.message : String(e1 || ""))); }
        if (isBoundary) break;
        CollectResetKeysFromPanel(sibling, keys, seen);
    }
    return keys;
}

function HasAnyChangedConfigKeys(keys) {
    if (!Array.isArray(keys) || keys.length <= 0) return false;
    for (var i = 0; i < keys.length; i++) {
        if (IsConfigKeyChangedFromDefault(keys[i])) return true;
    }
    return false;
}

function CreateSectionResetButton(titleRow, resolveKeysFn, includeEnableKey, parentPanel) {
    if (!titleRow || !titleRow.IsValid || !titleRow.IsValid()) return null;
    if (typeof resolveKeysFn !== "function") return null;

    var resetParent = titleRow;
    if (parentPanel && parentPanel.IsValid && parentPanel.IsValid()) {
        resetParent = parentPanel;
    }

    var resetBtn = $.CreatePanel("Button", resetParent, "");
    resetBtn.AddClass("SectionTitleActionBtn");
    resetBtn.AddClass("SectionResetBtn");
    var resetIcon = $.CreatePanel("Image", resetBtn, "", {
        src: "s2r://panorama/images/icons/icon_refresh.vsvg",
        defaultsrc: "",
        scaling: "contain"
    });
    resetIcon.AddClass("SectionTitleActionIcon");
    resetIcon.AddClass("SettingRowResetIcon");
    resetIcon.AddClass("QOLResetIcon");
    try { resetIcon.SetImage("s2r://panorama/images/icons/icon_refresh.vsvg"); } catch(eIcon) { WarnLog("settings", "op failed: " + (eIcon && eIcon.message ? eIcon.message : String(eIcon || ""))); }

    var buildResetKeys = function() {
        var keys = resolveKeysFn() || [];
        var seen = {};
        var merged = [];
        for (var i = 0; i < keys.length; i++) {
            var k = String(keys[i] || "");
            if (!k || seen[k]) continue;
            if (!MOD_CONFIG.hasOwnProperty(k) || !DEFAULT_CONFIG.hasOwnProperty(k)) continue;
            seen[k] = true;
            merged.push(k);
        }
        if (includeEnableKey) {
            var ek = String(includeEnableKey || "");
            if (ek && !seen[ek] && MOD_CONFIG.hasOwnProperty(ek) && DEFAULT_CONFIG.hasOwnProperty(ek)) {
                merged.push(ek);
            }
        }
        return merged;
    };

    var refreshBtnState = function() {
        if (!resetBtn || !resetBtn.IsValid || !resetBtn.IsValid()) return;
        var keys = buildResetKeys();
        var hasKeys = keys.length > 0;
        var hasChanges = hasKeys && HasAnyChangedConfigKeys(keys);
        resetBtn.SetHasClass("Hidden", !hasKeys);
        resetBtn.SetHasClass("HasChanges", hasChanges);
    };

    resetBtn.SetPanelEvent("onmouseover", function() {
        HideSettingsTextTooltip();
        CancelSettingsRowFloatingTooltipHide();
        ShowSettingsRowFloatingTooltip(
            resetBtn,
            "",
            LocalizeSettingsText("Reset section to defaults", true),
            PERF_IMPACT_TIER_NONE,
            ""
        );
    });
    resetBtn.SetPanelEvent("onmouseout", function() {
        HideSettingsTextTooltip();
        HideSettingsRowFloatingTooltipDeferred("section_reset_btn_mouseout");
    });
    resetBtn.SetPanelEvent("onactivate", function() {
        var keys = buildResetKeys();
        var changed = ApplyResetForConfigKeys(keys);
        if (changed > 0) {
            SaveAndSync();
            SetConfigFeedbackMessage(IsRussianSettingsLanguage()
                ? ("\u0421\u0431\u0440\u043E\u0448\u0435\u043D\u043E \u043D\u0430\u0441\u0442\u0440\u043E\u0435\u043A: " + String(changed))
                : ("Section reset (" + String(changed) + " changed)."), "success", 1800);
            RequestSettingsListSoftRefresh(0);
        } else {
            SetConfigFeedbackMessage(IsRussianSettingsLanguage()
                ? "\u0421\u0435\u043A\u0446\u0438\u044F \u0443\u0436\u0435 \u043F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E."
                : "Section already at defaults.", "info", 1400);
        }
    });

    refreshBtnState();
    $.Schedule(0.0, refreshBtnState);
    RegisterSettingsListRowSync(function() {
        if (!resetBtn || !resetBtn.IsValid || !resetBtn.IsValid()) return false;
        refreshBtnState();
        return true;
    });
    return resetBtn;
}

function SetConfigFeedbackMessage(message, tone, holdMs) {
    var label = gConfigFeedbackLabel;
    if (!label || !label.IsValid || !label.IsValid()) return;

    var safeMessage = String(message || "");
    label.text = safeMessage;
    label.SetHasClass("FeedbackInfo", tone === "info");
    label.SetHasClass("FeedbackSuccess", tone === "success");
    label.SetHasClass("FeedbackWarning", tone === "warning");
    label.SetHasClass("FeedbackError", tone === "error");

    var hold = Math.max(0, Math.round(Number(holdMs) || 0));
    if (hold <= 0) return;

    gConfigFeedbackClearToken++;
    var token = gConfigFeedbackClearToken;
    $.Schedule(hold / 1000.0, function() {
        if (token !== gConfigFeedbackClearToken) return;
        if (!gConfigFeedbackLabel || !gConfigFeedbackLabel.IsValid || !gConfigFeedbackLabel.IsValid()) return;
        gConfigFeedbackLabel.text = "";
        gConfigFeedbackLabel.SetHasClass("FeedbackInfo", true);
        gConfigFeedbackLabel.SetHasClass("FeedbackSuccess", false);
        gConfigFeedbackLabel.SetHasClass("FeedbackWarning", false);
        gConfigFeedbackLabel.SetHasClass("FeedbackError", false);
    });
}

function PrepareSettingsModalOpen() {
    try {
        ApplySettingsThemeClasses(null);
    } catch(eModalTheme) { WarnLog("settings", "op failed: " + (eModalTheme && eModalTheme.message ? eModalTheme.message : String(eModalTheme || ""))); }
}

function CloseModal(overlay) {
    if (!overlay || !overlay.IsValid()) return;
    var overlayId = "";
    try { overlayId = String(overlay.id || ""); } catch (e0) { overlayId = ""; }
    var shouldReleaseSettingsFocus = (overlayId === "ConfigDiffPreviewModalOverlay");
    if (overlayId.indexOf("Arcade") === 0) {
        var onDeathBridgeState = GetOnDeathArcadeBridgeState();
        if (onDeathBridgeState.active) {
            gOnDeathArcadeSessionActive = false;
            gOnDeathArcadeLastRequestToken = String(onDeathBridgeState.token || gOnDeathArcadeLastRequestToken || "");
            ForceCloseEscapeMenuForOnDeathGames();
        }
    }
    overlay.RemoveClass("Show");
    if (shouldReleaseSettingsFocus) {
        try {
            var settingsWin = $.GetContextPanel ? $.GetContextPanel().FindChildTraverse("SettingsWindow") : null;
            if (settingsWin && settingsWin.IsValid && settingsWin.IsValid()) {
                settingsWin.SetFocus();
            }
        } catch(eFocusRelease) { WarnLog("settings", "op failed: " + (eFocusRelease && eFocusRelease.message ? eFocusRelease.message : String(eFocusRelease || ""))); }
        if (overlay.IsValid()) {
            overlay.DeleteAsync(0);
        }
        return;
    }
    $.Schedule(0.25, function() {
        if (overlay.IsValid()) overlay.DeleteAsync(0);
    });
}

function CloseConfigDiffPreviewModalIfOpen() {
    var rootPanel = $.GetContextPanel();
    if (!rootPanel || !rootPanel.IsValid || !rootPanel.IsValid()) return;
    var existing = rootPanel.FindChildTraverse("ConfigDiffPreviewModalOverlay");
    if (existing && existing.IsValid && existing.IsValid()) {
        CloseModal(existing);
    }
}

function CloseSettingsSideModalsIfOpen() {
    var rootPanel = $.GetContextPanel();
    if (!rootPanel || !rootPanel.IsValid || !rootPanel.IsValid()) return;
    var overlayIds = [
        "ConfigDiffPreviewModalOverlay"
    ];
    for (var i = 0; i < overlayIds.length; i++) {
        var overlayId = overlayIds[i];
        if (!overlayId) continue;
        var existing = rootPanel.FindChildTraverse(overlayId);
        if (existing && existing.IsValid && existing.IsValid()) {
            CloseModal(existing);
        }
    }
}

function SyncTabActiveStates(tabBar) {
    if (!tabBar || !tabBar.IsValid || !tabBar.IsValid()) return;
    var settingsWindow = $.GetContextPanel().FindChildTraverse("SettingsWindow");
    if (settingsWindow && settingsWindow.SetHasClass) {
        settingsWindow.SetHasClass("SettingsLangRU", IsRussianSettingsLanguage());
        settingsWindow.SetHasClass("SettingsLangPL", IsPolishSettingsLanguage());
        settingsWindow.SetHasClass("SettingsLangBG", IsBulgarianSettingsLanguage());
        settingsWindow.SetHasClass("SettingsLangBY", IsBelarusianSettingsLanguage());
        settingsWindow.SetHasClass("SettingsLangFR", IsFrenchSettingsLanguage());
        settingsWindow.SetHasClass("SettingsLangPT", IsPortugueseSettingsLanguage());
        settingsWindow.SetHasClass("SettingsLangPTBR", IsBrazilianPortugueseSettingsLanguage());
        settingsWindow.SetHasClass("SettingsLangES", IsSpanishSettingsLanguage());
        ApplySettingsThemeClasses(settingsWindow);
    }
    var tabListHost = tabBar.FindChildTraverse("SettingsTabRailTabs");
    if (tabListHost) {
        var children = tabListHost.Children();
        for (var i = 0; i < children.length; i++) {
            var groupPanel = children[i];
            if (!groupPanel || !groupPanel.IsValid || !groupPanel.IsValid()) continue;
            var groupChildren = groupPanel.Children ? groupPanel.Children() : [];
            for (var gc = 0; gc < groupChildren.length; gc++) {
                var maybeTabsHost = groupChildren[gc];
                if (!maybeTabsHost || !maybeTabsHost.IsValid || !maybeTabsHost.IsValid()) continue;
                var tabs = maybeTabsHost.Children ? maybeTabsHost.Children() : [];
                for (var ti = 0; ti < tabs.length; ti++) {
                    var tabBtn = tabs[ti];
                    if (!tabBtn || !tabBtn.id || tabBtn.id.indexOf("TabButton_") !== 0) continue;
                    tabBtn.SetHasClass("Active", tabBtn.id === ("TabButton_" + currentTab.replace(" ", "")));
                    var tabLabel = tabBtn.FindChildTraverse("TabLabel");
                    if (tabLabel) {
                        var baseTabName = String(tabBtn.id).slice("TabButton_".length);
                        var displayTabName = GetSettingsTabDisplayName(baseTabName);
                        // Localize every tab name, including Config ("Settings"). Proper nouns
                        // not present in the translation map (e.g. MOGLOCK) pass through unchanged.
                        tabLabel.text = LocalizeSettingsText(displayTabName, true);
                    }
                }
            }
        }
    }
    var supportFooterBtn = tabBar.FindChildTraverse("FooterSupportTabButton");
    if (supportFooterBtn) {
        supportFooterBtn.DeleteAsync(0);
    }

    var tabFooter = tabBar.FindChildTraverse("SettingsTabRailFooter");
    // Highlight the version label when the hidden Dev tab is active
    var footerVersionLabel = tabFooter ? tabFooter.FindChildTraverse("FooterVersionLabel") : null;
    if (footerVersionLabel && footerVersionLabel.IsValid && footerVersionLabel.IsValid()) {
        footerVersionLabel.SetHasClass("Active", currentTab === "Dev");
    }
    var isRuFooter = IsRussianSettingsLanguage();
    var newsFooterBtn = tabFooter ? tabFooter.FindChildTraverse("FooterNewsLinkButton") : null;
    var staleDiscordFooterBtn = tabBar.FindChildTraverse("FooterDiscordLinkButton");
    if (staleDiscordFooterBtn) {
        staleDiscordFooterBtn.DeleteAsync(0);
        staleDiscordFooterBtn = null;
    }
    if (newsFooterBtn) {
        newsFooterBtn.DeleteAsync(0);
        newsFooterBtn = null;
    }
    var saveFooterBtn = tabFooter ? tabFooter.FindChildTraverse("FooterSaveBuildButton") : null;
}

function UpdateSettingsSearchUiState(rootPanel) {
    var root = rootPanel || $.GetContextPanel();
    if (!root || !root.FindChildTraverse) return;
    var searchWrap = root.FindChildTraverse("SettingsSearchWrap");
    var searchInput = root.FindChildTraverse("SettingsSearchInput");
    var hasText = false;
    if (searchInput && searchInput.IsValid && searchInput.IsValid()) {
        hasText = String(searchInput.text || "").length > 0;
    }
    if (searchWrap && searchWrap.IsValid && searchWrap.IsValid()) {
        searchWrap.SetHasClass("HasSearchText", hasText);
    }
}

function ClearSettingsSearchQuery(rootPanel) {
    currentSearchQuery = "";
    var root = rootPanel || $.GetContextPanel();
    var searchInput = root ? root.FindChildTraverse("SettingsSearchInput") : null;
    if (searchInput && searchInput.IsValid && searchInput.IsValid()) {
        if ((searchInput.text || "") !== "") {
            searchInput.text = "";
        }
        if (searchInput.ClearSelection) {
            searchInput.ClearSelection();
        }
    }
    UpdateSettingsSearchUiState(root);
}

function CloseOpenSettingsDropdowns(rootPanel, options) {
    var root = rootPanel || $.GetContextPanel();
    if (!root || !root.IsValid || !root.IsValid()) return;
    var skipFocusTransfer = !!(options && options.skipFocusTransfer === true);

    var searchRoots = [];
    var seenRoots = [];
    var cursor = root;
    while (cursor && cursor.IsValid && cursor.IsValid()) {
        if (seenRoots.indexOf(cursor) === -1) {
            seenRoots.push(cursor);
            searchRoots.push(cursor);
        }
        if (!cursor.GetParent) break;
        cursor = cursor.GetParent();
    }

    var dropdownPanels = [];
    for (var rootIndex = 0; rootIndex < searchRoots.length; rootIndex++) {
        var searchRoot = searchRoots[rootIndex];
        if (!searchRoot || !searchRoot.IsValid || !searchRoot.IsValid()) continue;
        var foundDropdowns = [];
        try { foundDropdowns = searchRoot.FindChildrenWithClassTraverse ? (searchRoot.FindChildrenWithClassTraverse("QOLSettingsDropDown") || []) : []; } catch (e0) { foundDropdowns = []; }
        for (var foundIndex = 0; foundIndex < foundDropdowns.length; foundIndex++) {
            var foundDropdown = foundDropdowns[foundIndex];
            if (!foundDropdown || !foundDropdown.IsValid || !foundDropdown.IsValid()) continue;
            if (dropdownPanels.indexOf(foundDropdown) !== -1) continue;
            dropdownPanels.push(foundDropdown);
        }
    }
    for (var iDropdown = 0; iDropdown < dropdownPanels.length; iDropdown++) {
        var dropdownPanel = dropdownPanels[iDropdown];
        if (!dropdownPanel || !dropdownPanel.IsValid || !dropdownPanel.IsValid()) continue;
        var menuPanel = null;
        var dropdownWasOpen = false;
        try { dropdownWasOpen = dropdownPanel.BHasClass && dropdownPanel.BHasClass("DropDownMenuVisible"); } catch (eDropdownOpen) { dropdownWasOpen = false; }
        for (var searchIndex = 0; searchIndex < searchRoots.length && !menuPanel; searchIndex++) {
            var menuSearchRoot = searchRoots[searchIndex];
            if (!menuSearchRoot || !menuSearchRoot.IsValid || !menuSearchRoot.IsValid()) continue;
            try { menuPanel = menuSearchRoot.FindChildTraverse(String(dropdownPanel.id || "") + "DropDownMenu"); } catch (e4) { menuPanel = null; }
        }
        if (menuPanel && menuPanel.IsValid && menuPanel.IsValid()) {
            try { dropdownWasOpen = dropdownWasOpen || !!menuPanel.visible; } catch(eMenuVisible) { WarnLog("settings", "op failed: " + (eMenuVisible && eMenuVisible.message ? eMenuVisible.message : String(eMenuVisible || ""))); }
            try { dropdownWasOpen = dropdownWasOpen || (menuPanel.BHasClass && menuPanel.BHasClass("DropDownMenuVisible")); } catch(eMenuClass) { WarnLog("settings", "op failed: " + (eMenuClass && eMenuClass.message ? eMenuClass.message : String(eMenuClass || ""))); }
        }
        try { dropdownPanel.SetHasClass("DropDownMenuVisible", false); } catch(e1) { WarnLog("settings", "op failed: " + (e1 && e1.message ? e1.message : String(e1 || ""))); }
        try { dropdownPanel.RemoveClass("DropDownMenuVisible"); } catch(e2) { WarnLog("settings", "op failed: " + (e2 && e2.message ? e2.message : String(e2 || ""))); }
        try { dropdownPanel.visible = true; } catch(e2b) { WarnLog("settings", "op failed: " + (e2b && e2b.message ? e2b.message : String(e2b || ""))); }
        if (!skipFocusTransfer && dropdownWasOpen) {
            try { dropdownPanel.SetFocus(); } catch(e3) { WarnLog("settings", "op failed: " + (e3 && e3.message ? e3.message : String(e3 || ""))); }
        }
        if (menuPanel && menuPanel.IsValid && menuPanel.IsValid()) {
            try { menuPanel.SetHasClass("DropDownMenuVisible", false); } catch(e5) { WarnLog("settings", "op failed: " + (e5 && e5.message ? e5.message : String(e5 || ""))); }
            try { menuPanel.RemoveClass("DropDownMenuVisible"); } catch(e6) { WarnLog("settings", "op failed: " + (e6 && e6.message ? e6.message : String(e6 || ""))); }
            try { menuPanel.visible = false; } catch(e7) { WarnLog("settings", "op failed: " + (e7 && e7.message ? e7.message : String(e7 || ""))); }
        }
    }

    var floatingMenus = [];
    for (var floatingRootIndex = 0; floatingRootIndex < searchRoots.length; floatingRootIndex++) {
        var floatingSearchRoot = searchRoots[floatingRootIndex];
        if (!floatingSearchRoot || !floatingSearchRoot.IsValid || !floatingSearchRoot.IsValid()) continue;
        var foundMenus = [];
        try { foundMenus = floatingSearchRoot.FindChildrenWithClassTraverse ? (floatingSearchRoot.FindChildrenWithClassTraverse("DropDownMenuVisible") || []) : []; } catch (e8) { foundMenus = []; }
        for (var foundMenuIndex = 0; foundMenuIndex < foundMenus.length; foundMenuIndex++) {
            var foundMenu = foundMenus[foundMenuIndex];
            if (!foundMenu || !foundMenu.IsValid || !foundMenu.IsValid()) continue;
            if (floatingMenus.indexOf(foundMenu) !== -1) continue;
            floatingMenus.push(foundMenu);
        }
    }
    for (var iMenu = 0; iMenu < floatingMenus.length; iMenu++) {
        var floatingMenu = floatingMenus[iMenu];
        if (!floatingMenu || !floatingMenu.IsValid || !floatingMenu.IsValid()) continue;
        try { floatingMenu.SetHasClass("DropDownMenuVisible", false); } catch(e9) { WarnLog("settings", "op failed: " + (e9 && e9.message ? e9.message : String(e9 || ""))); }
        try { floatingMenu.RemoveClass("DropDownMenuVisible"); } catch(e10) { WarnLog("settings", "op failed: " + (e10 && e10.message ? e10.message : String(e10 || ""))); }
        try { floatingMenu.visible = false; } catch(e11) { WarnLog("settings", "op failed: " + (e11 && e11.message ? e11.message : String(e11 || ""))); }
    }
}

function SetActiveTabAndRefresh(tabName) {
    if (!tabName || currentTab === tabName) return;
    var root = $.GetContextPanel();
    var tabBar = root.FindChildTraverse("SettingsTabBar");
    var list = root.FindChildTraverse("SettingsList");
    CloseOpenSettingsDropdowns(root);
    ClearSettingsSearchQuery(root);

    if (
        list && list.IsValid && list.IsValid() &&
        tabBar && tabBar.IsValid && tabBar.IsValid() &&
        !list.BHasClass("TabFading")
    ) {
        list.AddClass("TabFading");
        $.Schedule(0.2, function() {
            if (!list || !list.IsValid || !list.IsValid()) return;
            if (!tabBar || !tabBar.IsValid || !tabBar.IsValid()) return;
            currentTab = tabName;
            SyncTabActiveStates(tabBar);
            UpdateListContent(list, true);
            UpdatePresetHighlightPollingState();
            list.RemoveClass("TabFading");
        });
        return;
    }

    currentTab = tabName;
    SyncTabActiveStates(tabBar);
    if (list && list.IsValid && list.IsValid()) {
        UpdateListContent(list, true);
    }
    UpdatePresetHighlightPollingState();
}

function GetCurrentExportSettingsString() {
    var compact = SerializeCompactV2(MOD_CONFIG);
    var encoded = ToBase64Url(compact);
    return EXPORT_PREFIX + encoded;
}

function RunJoyNameStorageReadProbe() {
    // GameInterfaceAPI confirmed absent — joy_name storage probe skipped.
    $.Msg("[QOLLock][JoyNameStorageReadProbe] skipped — GameInterfaceAPI absent");
}

function FormatExportSettingsDisplayString(rawExport) {
    if (!rawExport) return "";
    var normalized = String(rawExport).replace(/\s+/g, "");
    var prefixMatch = normalized.match(/^\[QOL-\d+-\d+-\d+\]:/i);
    var prefixLen = prefixMatch ? prefixMatch[0].length : 0;
    var payloadLen = normalized.length - prefixLen;
    if (payloadLen <= 24) return normalized;
    var firstPayloadLen = Math.ceil(payloadLen / 2);
    var breakIndex = prefixLen + firstPayloadLen;
    if (breakIndex <= 0 || breakIndex >= normalized.length) return normalized;
    return normalized.slice(0, breakIndex) + "\n" + normalized.slice(breakIndex);
}

function FormatImportSettingsDisplayString(rawImport) {
    if (!rawImport) return "";
    var normalized = String(rawImport).replace(/\s+/g, "");
    if (!/^\[QOL-\d+-\d+-\d+\]:/i.test(normalized)) {
        return rawImport;
    }
    return FormatExportSettingsDisplayString(normalized);
}

function TryCopyTextToClipboard(text, textEntryPanel) {
    if (!text || text.length === 0) return false;
    var copied = false;
    var attempts = [
        function() { $.DispatchEvent("CopyStringToClipboard", text, text); },
        function() {
            if (!textEntryPanel || !textEntryPanel.IsValid || !textEntryPanel.IsValid()) return;
            textEntryPanel.SetFocus();
            textEntryPanel.SelectAll();
            $.DispatchEvent("TextEntryCopyToClipboard", textEntryPanel);
        }
    ];
    for (var i = 0; i < attempts.length; i++) {
        try {
            attempts[i]();
            copied = true;
            break;
        } catch(e) { WarnLog("settings", "op failed: " + (e && e.message ? e.message : String(e || ""))); }
    }
    return copied;
}

function TryPasteTextFromClipboard(textEntryPanel) {
    if (!textEntryPanel || !textEntryPanel.IsValid || !textEntryPanel.IsValid()) return false;
    textEntryPanel.SetFocus();
    if (textEntryPanel.SelectAll) {
        try { textEntryPanel.SelectAll(); } catch(e) { WarnLog("settings", "op failed: " + (e && e.message ? e.message : String(e || ""))); }
    }
    var pasted = false;
    var attempts = [
        function() {
            if (textEntryPanel.Paste) {
                textEntryPanel.Paste();
                return;
            }
            throw new Error("Paste method unavailable");
        },
        function() {
            $.DispatchEvent("TextEntryInsertFromClipboard", textEntryPanel);
        }
    ];
    for (var i = 0; i < attempts.length; i++) {
        try {
            attempts[i]();
            pasted = true;
            break;
        } catch(e) { WarnLog("settings", "op failed: " + (e && e.message ? e.message : String(e || ""))); }
    }
    return pasted;
}

function RenderConfigTabContent(list) {
    gCurrentSettingsSectionTitle = "";
    var cfgCopy = LocalizeSettingsText("COPY", true);
    var cfgCopied = LocalizeSettingsText("COPIED", true);
    var cfgFailed = LocalizeSettingsText("FAILED", true);
    var cfgClear = LocalizeSettingsText("CLEAR", true);
    var cfgApply = LocalizeSettingsText("APPLY", true);
    var cfgApplied = LocalizeSettingsText("APPLIED", true);
    gConfigFeedbackLabel = null;
    gConfigFeedbackClearToken++;

    // Auto-disabled feature warning banner (Phase A.1: reads QOL namespace set by ql_core.js)
    if (!gSearchCollectMode && QOL.autoDisabledFeatures && QOL.autoDisabledFeatures.length > 0) {
        try {
            var disabledFeatures = QOL.autoDisabledFeatures;
            var filtered = [];
            for (var di = 0; di < disabledFeatures.length; di++) {
                var dn = String(disabledFeatures[di]).trim();
                if (dn) filtered.push(dn);
            }
            if (filtered.length > 0) {
                var warnSection = $.CreatePanel("Panel", list, "AutoDisableWarning");
                warnSection.AddClass("ConfigFeedbackPanel");
                warnSection.AddClass("AutoDisableWarning");
                var warnTitle = $.CreatePanel("Label", warnSection, "AutoDisableWarningTitle");
                warnTitle.AddClass("ConfigFeedbackLabel");
                warnTitle.text = "Some QOLLOCK features were auto-disabled due to errors:";
                var warnList = $.CreatePanel("Label", warnSection, "AutoDisableWarningList");
                warnList.AddClass("ConfigFeedbackText");
                warnList.text = filtered.join(", ");
                var warnHint = $.CreatePanel("Label", warnSection, "AutoDisableWarningHint");
                warnHint.AddClass("ConfigFeedbackText");
                warnHint.text = "Restart your game to re-enable these features.";
            }
        } catch(eAutoDisableWarn) { WarnLog("settings", "op failed: " + (eAutoDisableWarn && eAutoDisableWarn.message ? eAutoDisableWarn.message : String(eAutoDisableWarn || ""))); }
    }

    if (gSearchCollectMode && gSearchCollectState) {
        CreateSectionTitle(list, "General");
        CreateRow(list, "Preview", "PREVIEWS_ENABLED", "toggle", null, null, null, null, "Realtime Changes");
        CreateRow(list, "Language", "LANGUAGE", "dropdown", null, null, null, SETTINGS_LANGUAGE_OPTIONS);
        CreateRow(list, "Default Hero", "DEFAULT_HERO", "dropdown", null, null, null, DEFAULT_HERO_DROPDOWN_OPTIONS);
        CreateRow(list, "Troubleshoot", "TEST_SKYRUNNER", "actionbutton", null, null, null, [
            { label: "Swap" }
        ], "Switch to the Skyrunner storage hero. Your settings are saved in shop builds; if saving breaks, clear these builds and save again.");
        CreateRow(list, "Theme", "SETTINGS_THEME", "buttongroup", null, null, null, SETTINGS_THEME_OPTIONS);

        CreateSeparator(list);
        CreateSectionTitle(list, "Backup & Restore");
        CreateRow(list, "Export String", "SEARCH_TAB:Config", "actionbutton", null, null, null, [
            { label: "Open Settings" }
        ], "Share your settings string");
        CreateRow(list, "Import String", "SEARCH_TAB:Config", "actionbutton", null, null, null, [
            { label: "Open Settings" }
        ], "Paste and apply an exported settings string");
        return;
    }

    list.AddClass("ConfigTabSurface");

    var cardGeneral = $.CreatePanel("Panel", list, "ConfigCardGeneral");
    cardGeneral.AddClass("ConfigTabCard");
    CreateSectionTitle(cardGeneral, "General");
    CreateRow(cardGeneral, "Preview Changes", "PREVIEWS_ENABLED", "toggle", null, null, null, null, "Realtime Changes");
    CreateRow(cardGeneral, "Language", "LANGUAGE", "dropdown", null, null, null, SETTINGS_LANGUAGE_OPTIONS);
    CreateRow(cardGeneral, "Default Hero", "DEFAULT_HERO", "dropdown", null, null, null, DEFAULT_HERO_DROPDOWN_OPTIONS);
    CreateRow(cardGeneral, "Troubleshoot", "TEST_SKYRUNNER", "actionbutton", null, null, null, [
        { label: "Swap" }
    ], "Switch to the Skyrunner storage hero. Your settings are saved in shop builds; if saving breaks, clear these builds and save again.");
    CreateRow(cardGeneral, "Theme", "SETTINGS_THEME", "buttongroup", null, null, null, SETTINGS_THEME_OPTIONS);

    var dividerAfterGeneral = $.CreatePanel("Panel", list, "ConfigDividerAfterGeneral");
    dividerAfterGeneral.AddClass("ConfigTabDivider");
    dividerAfterGeneral.AddClass("RowSeparator");

    var cardExport = $.CreatePanel("Panel", list, "ConfigCardExport");
    cardExport.AddClass("ConfigTabCard");

    var exportHeader = CreateSectionTitle(cardExport, "Export Settings");
    var copyBtn = CreateSectionInlineIconButton(exportHeader, "ConfigCopyBtn", "s2r://panorama/images/icons/icon_copy.vsvg", "Copy our settings code to clipboard.");
    var exportTextEntry = $.CreatePanel("TextEntry", cardExport, "ConfigExportTextEntry");
    exportTextEntry.AddClass("ConfigTextEntry");
    exportTextEntry.multiline = true;
    exportTextEntry.maxchars = 2000;
    exportTextEntry.text = FormatExportSettingsDisplayString(GetCurrentExportSettingsString());
    exportTextEntry.SetPanelEvent("onfocus", function() {
        exportTextEntry.SelectAll();
    });

    copyBtn.SetPanelEvent("onactivate", function() {
        var exportRaw = GetCurrentExportSettingsString();
        exportTextEntry.text = FormatExportSettingsDisplayString(exportRaw);
        var copied = TryCopyTextToClipboard(exportRaw, exportTextEntry);
        if (copied) {
            copyBtn.RemoveClass("FailureState");
            copyBtn.AddClass("SuccessState");
        SetLocalizedConfigFeedbackMessage("Export string copied.", "success", 1800);
            $.Schedule(0.6, function() {
                if (!copyBtn || !copyBtn.IsValid || !copyBtn.IsValid()) return;
                copyBtn.RemoveClass("SuccessState");
            });
        } else {
            copyBtn.RemoveClass("SuccessState");
            copyBtn.AddClass("FailureState");
        SetLocalizedConfigFeedbackMessage("Clipboard copy failed.", "error", 2200);
            $.Schedule(0.5, function() {
                if (!copyBtn || !copyBtn.IsValid || !copyBtn.IsValid()) return;
                copyBtn.RemoveClass("FailureState");
            });
        }
    });

    var dividerAfterExport = $.CreatePanel("Panel", list, "ConfigDividerAfterExport");
    dividerAfterExport.AddClass("ConfigTabDivider");
    dividerAfterExport.AddClass("RowSeparator");

    var cardImport = $.CreatePanel("Panel", list, "ConfigCardImport");
    cardImport.AddClass("ConfigTabCard");

    var importHeader = CreateSectionTitle(cardImport, "Import Settings");
    var applyBtn = CreateSectionInlineIconButton(importHeader, "ConfigApplyBtn", "s2r://panorama/images/icons/icon_checkmark.vsvg", "Apply your settings code to your configuration.");

    var importTextEntry = $.CreatePanel("TextEntry", cardImport, "ConfigImportTextEntry");
    importTextEntry.AddClass("ConfigTextEntry");
    importTextEntry.multiline = true;
    importTextEntry.text = "";
    var importFormattingInProgress = false;
    importTextEntry.SetPanelEvent("ontextentrychange", function() {
        if (importFormattingInProgress) return;
        var current = importTextEntry.text || "";
        var formatted = FormatImportSettingsDisplayString(current);
        if (formatted !== current) {
            importFormattingInProgress = true;
            importTextEntry.text = formatted;
            importFormattingInProgress = false;
        }
    });

    var configFeedback = $.CreatePanel("Label", cardImport, "ConfigFeedbackLabel");
    configFeedback.AddClass("ConfigFeedbackLabel");
    gConfigFeedbackLabel = configFeedback;
    SetConfigFeedbackMessage("", "info", 0);

    applyBtn.SetPanelEvent("onactivate", function() {
        var raw = importTextEntry.text;
        if (!raw || raw.length === 0) return;
        try {
            SetLocalizedConfigFeedbackMessage("Import: parsing string...", "info", 0);
            var importResult = TryApplyImportStringWithDiagnostics(raw);
            if (!importResult || importResult.ok !== true || !importResult.parsedConfig || !importResult.candidateConfig) {
                throw new Error("Invalid import string");
            }

            var diffRows = BuildConfigDiffRows(MOD_CONFIG, importResult.candidateConfig);
            var schemaText = importResult.schemaVersion
                ? ("[QOL-" + String(importResult.schemaVersion).replace(/\./g, "-") + "]")
                : "[unknown]";
            var detailsText = IsRussianSettingsLanguage()
                ? ("\u0421\u0445\u0435\u043C\u0430 " + schemaText + " | clamp=" + String(importResult.clampedKeys) + " | unknown=" + String(importResult.unknownKeys))
                : ("Schema " + schemaText + " | clamped=" + String(importResult.clampedKeys) + " | unknown=" + String(importResult.unknownKeys));

            OpenConfigDiffPreviewModal({
                title: "Settings Changes",
                summary: "Changes: " + String(diffRows.length),
                details: detailsText,
                rows: diffRows,
                applyText: "Confirm",
                cancelText: "Cancel",
                onApply: function() {
                    try {
                        SetLocalizedConfigFeedbackMessage("Import: applying settings...", "info", 0);
                        var previousLanguage = GetSettingsLanguage();
                        var appliedDiag = ApplyParsedConfigWithDiagnostics(importResult.parsedConfig, importResult.schemaVersion || LATEST_COMPACT_SEMVER);
                        SaveAndSync();
                        var didRefreshLanguageUi = RefreshSettingsLanguageUiAfterConfigChange(previousLanguage);
                        SetLocalizedConfigFeedbackMessage("Import: refreshing UI...", "info", 0);
                        if (importHeader && importHeader.IsValid && importHeader.IsValid()) {
                            importHeader.text = LocalizeSettingsText("Import Settings", true);
                        }
                        applyBtn.RemoveClass("FailureState");
                        applyBtn.AddClass("SuccessState");
                        var diagText = IsRussianSettingsLanguage()
                            ? ("\u0418\u043C\u043F\u043E\u0440\u0442 " + schemaText + " \u043F\u0440\u0438\u043C\u0435\u043D\u0435\u043D. clamp=" + String(appliedDiag.clampedKeys) + " unknown=" + String(appliedDiag.unknownKeys))
                            : ("Import " + schemaText + " applied. clamped=" + String(appliedDiag.clampedKeys) + " unknown=" + String(appliedDiag.unknownKeys));
                        var diagTone = (appliedDiag.unknownKeys > 0 || appliedDiag.clampedKeys > 0) ? "warning" : "success";
                        SetConfigFeedbackMessage(diagText, diagTone, 3000);
                        if (!didRefreshLanguageUi) {
                            RequestSettingsListRefresh(0.02, true);
                        }
                        $.Schedule(0.6, function() {
                            if (!applyBtn || !applyBtn.IsValid || !applyBtn.IsValid()) return;
                            applyBtn.RemoveClass("SuccessState");
                        });
                        return true;
                    } catch (applyErr) {
                        applyBtn.RemoveClass("SuccessState");
                        applyBtn.AddClass("FailureState");
            SetLocalizedConfigFeedbackMessage("Import failed.", "error", 2600);
                        $.Schedule(0.35, function() {
                            if (applyBtn && applyBtn.IsValid && applyBtn.IsValid()) {
                                applyBtn.RemoveClass("FailureState");
                            }
                        });
                        return false;
                    }
                }
            });
        } catch (e) {
            if (importHeader) {
                importHeader.text = LocalizeSettingsText("ERROR: Invalid String", true);
                importHeader.style.color = "#ff4d4d";
            }
            applyBtn.RemoveClass("SuccessState");
            applyBtn.AddClass("FailureState");
            SetLocalizedConfigFeedbackMessage("Invalid import string.", "error", 2600);
            $.Schedule(0.35, function() {
                if (applyBtn && applyBtn.IsValid && applyBtn.IsValid()) {
                    applyBtn.RemoveClass("FailureState");
                }
            });
        }
    });
}

function CloneConfigSnapshot(source) {
    var out = {};
    var src = source && typeof source === "object" ? source : MOD_CONFIG;
    for (var key in src) {
        if (!src.hasOwnProperty(key)) continue;
        out[key] = src[key];
    }
    return out;
}

function PreserveUiOnlySettings(targetConfig) {
    if (!targetConfig || typeof targetConfig !== "object") return targetConfig;
    if (MOD_CONFIG.hasOwnProperty("DRAG_ENABLED")) {
        targetConfig.DRAG_ENABLED = MOD_CONFIG.DRAG_ENABLED;
    }
    if (MOD_CONFIG.hasOwnProperty("PREVIEWS_ENABLED")) {
        targetConfig.PREVIEWS_ENABLED = MOD_CONFIG.PREVIEWS_ENABLED;
    }
    return targetConfig;
}

function BuildCandidateConfigFromParsed(parsed, schemaVersion, baseConfig) {
    var diagnostics = {
        appliedKeys: 0,
        unknownKeys: 0,
        clampedKeys: 0
    };
    var candidateConfig = CloneConfigSnapshot(baseConfig || MOD_CONFIG);
    if (!parsed || typeof parsed !== "object") {
        return { candidateConfig: candidateConfig, diagnostics: diagnostics };
    }

    var fieldMap = BuildSchemaFieldMap(schemaVersion);
    for (var key in parsed) {
        if (!candidateConfig.hasOwnProperty(key)) {
            diagnostics.unknownKeys++;
            continue;
        }
        var nextValue = parsed[key];
        var field = fieldMap[key] || null;
        if (field && typeof nextValue === "number") {
            var clampResult = ClampToSchemaField(nextValue, field);
            nextValue = clampResult.value;
            if (clampResult.changed) diagnostics.clampedKeys++;
        }
        candidateConfig[key] = nextValue;
        diagnostics.appliedKeys++;
    }

    MigrateSplitZoomKeys(candidateConfig, parsed);
    NormalizeNeutralCampFlags(candidateConfig, parsed);
    NormalizeItemCooldownModeConfig(candidateConfig, parsed);
    NormalizeAmmoScaleConfig(candidateConfig, parsed);
    NormalizeVoiceTypeConfig(candidateConfig);
    NormalizeHealthbarTypeConfig(candidateConfig, parsed);
    NormalizeColorWarningConfig(candidateConfig, parsed);
    NormalizeEnemyColorWarningConfig(candidateConfig, parsed);
    NormalizeAllyColorWarningConfig(candidateConfig, parsed);
    NormalizeTopbarEnemyHpWarningConfig(candidateConfig, parsed);
    NormalizeTopbarAllyHpWarningConfig(candidateConfig, parsed);
    NormalizeShopItemNotificationsConfig(candidateConfig, parsed);
    NormalizeCompassSpeedSchemaMigration(candidateConfig, parsed, schemaVersion || LATEST_COMPACT_SEMVER);
    NormalizeLanguageSchemaMigration(candidateConfig, parsed, schemaVersion || LATEST_COMPACT_SEMVER);

    return { candidateConfig: candidateConfig, diagnostics: diagnostics };
}

function FormatConfigKeyForDiff(key) {
    var raw = String(key || "");
    if (!raw) return "";
    var tokens = raw.split("_");
    for (var i = 0; i < tokens.length; i++) {
        var token = String(tokens[i] || "").toLowerCase();
        if (!token) continue;
        if (token === "fps") {
            tokens[i] = "FPS";
            continue;
        }
        tokens[i] = token.charAt(0).toUpperCase() + token.slice(1);
    }
    return tokens.join(" ");
}

function GetConfigDiffLabelMap() {
    var cacheKey = BuildSearchSectionIndexCacheKey();
    if (gConfigDiffLabelMap && gConfigDiffLabelCacheKey === cacheKey) {
        return gConfigDiffLabelMap;
    }

    var map = {};
    var index = GetCachedSearchSectionIndex();
    for (var t = 0; t < index.length; t++) {
        var tabEntry = index[t];
        if (!tabEntry || !Array.isArray(tabEntry.sections)) continue;
        for (var s = 0; s < tabEntry.sections.length; s++) {
            var section = tabEntry.sections[s];
            if (!section || !Array.isArray(section.rows)) continue;
            for (var r = 0; r < section.rows.length; r++) {
                var row = section.rows[r];
                if (!row) continue;
                var rowLabel = String(row.label || "");
                var rowConfigId = String(row.configId || "");
                var rowCategory = String(section.title || tabEntry.tab || "");
                var rowType = String(row.type || "");
                var rowInvert = false;
                if (Array.isArray(row.options)) {
                    for (var ri = 0; ri < row.options.length; ri++) {
                        var ropt = row.options[ri];
                        if (ropt && ropt.invert === true) {
                            rowInvert = true;
                            break;
                        }
                    }
                }
                if (rowConfigId && !map.hasOwnProperty(rowConfigId) && rowConfigId.indexOf("SEARCH_") !== 0) {
                    map[rowConfigId] = {
                        label: rowLabel,
                        category: rowCategory,
                        type: rowType,
                        invert: rowInvert
                    };
                }
                if (Array.isArray(row.options)) {
                    for (var oi = 0; oi < row.options.length; oi++) {
                        var opt = row.options[oi];
                        if (!opt || !opt.key) continue;
                        var optKey = String(opt.key);
                        var optLabel = String(opt.label || rowLabel || "");
                        if (optKey && optLabel && !map.hasOwnProperty(optKey)) {
                            map[optKey] = {
                                label: optLabel,
                                category: rowCategory,
                                type: "multitoggle_option",
                                invert: !!(opt && opt.invert === true)
                            };
                        }
                    }
                }
            }
        }
    }

    gConfigDiffLabelMap = map;
    gConfigDiffLabelCacheKey = cacheKey;
    return map;
}

function GetConfigDisplayLabelForDiff(key) {
    var normalizedKey = String(key || "");
    if (!normalizedKey) return "";
    var map = GetConfigDiffLabelMap();
    if (map && map.hasOwnProperty(normalizedKey)) {
        var entry = map[normalizedKey];
        if (entry && typeof entry === "object" && entry.label) {
            return String(entry.label || "");
        }
        return String(entry || "");
    }
    return FormatConfigKeyForDiff(normalizedKey);
}

function GetConfigDiffMetaForKey(key) {
    var normalizedKey = String(key || "");
    if (!normalizedKey) return null;
    var map = GetConfigDiffLabelMap();
    if (!map || !map.hasOwnProperty(normalizedKey)) return null;
    var entry = map[normalizedKey];
    return (entry && typeof entry === "object") ? entry : null;
}

function GetConfigCategoryForDiff(key) {
    var normalizedKey = String(key || "");
    if (!normalizedKey) return "";
    var map = GetConfigDiffLabelMap();
    if (map && map.hasOwnProperty(normalizedKey)) {
        var entry = map[normalizedKey];
        if (entry && typeof entry === "object" && entry.category) {
            return String(entry.category || "");
        }
    }
    return "";
}

function FormatConfigValueForDiff(value, key) {
    var configKey = String(key || "");
    var meta = GetConfigDiffMetaForKey(configKey);
    var isBinaryNumber = (typeof value === "number" && (value === 0 || value === 1));
    var isBinaryBool = (typeof value === "boolean");
    var isBinary = isBinaryNumber || isBinaryBool;
    var isEnableStyle = /(ENABLE|ENABLED|DISABLE|DISABLED|SHOW|HIDE|VISIBLE|TOGGLE|ACTIVE|ON_OFF|ONOFF)/i.test(configKey);
    var isFilterStyle = /(^ITEM_FILTER_|_FILTER_)/.test(configKey);
    var isToggleType = !!(meta && (meta.type === "toggle" || meta.type === "multitoggle_option"));
    if (isBinary && (isEnableStyle || isFilterStyle || isToggleType)) {
        var onState = isBinaryBool ? (value === true) : (Number(value) === 1);
        if (meta && meta.invert === true) onState = !onState;
        return onState ? "On" : "Off";
    }
    if (value === undefined) return "(unset)";
    if (value === null) return "(null)";
    if (typeof value === "boolean") return value ? "true" : "false";
    if (typeof value === "number") {
        if (Math.abs(value - Math.round(value)) <= 0.0001) {
            return String(Math.round(value));
        }
        var fixed = String(value.toFixed(3));
        fixed = fixed.replace(/\.?0+$/, "");
        return fixed;
    }
    if (typeof value === "string") {
        return value;
    }
    return String(value);
}

function BuildConfigDiffRows(currentConfig, nextConfig) {
    var rows = [];
    if (!currentConfig || !nextConfig) return rows;

    var seen = {};
    var pushRowIfChanged = function(key) {
        var normalizedKey = String(key || "");
        if (!normalizedKey || seen[normalizedKey]) return;
        seen[normalizedKey] = true;

        var hasCurrent = currentConfig.hasOwnProperty(normalizedKey);
        var hasNext = nextConfig.hasOwnProperty(normalizedKey);
        if (!hasCurrent && !hasNext) return;

        var beforeValue = hasCurrent ? currentConfig[normalizedKey] : undefined;
        var afterValue = hasNext ? nextConfig[normalizedKey] : undefined;
        if (NormalizeComparableConfigValue(beforeValue) === NormalizeComparableConfigValue(afterValue)) return;

        rows.push({
            key: normalizedKey,
            keyLabel: GetConfigDisplayLabelForDiff(normalizedKey),
            categoryLabel: GetConfigCategoryForDiff(normalizedKey),
            beforeValue: beforeValue,
            afterValue: afterValue,
            beforeText: FormatConfigValueForDiff(beforeValue, normalizedKey),
            afterText: FormatConfigValueForDiff(afterValue, normalizedKey)
        });
    };

    for (var key in DEFAULT_CONFIG) {
        pushRowIfChanged(key);
    }
    for (var nextKey in nextConfig) {
        pushRowIfChanged(nextKey);
    }
    return rows;
}

function BuildPresetCandidateConfigByName(presetName) {
    presetName = NormalizeBreadPresetName(presetName);
    var presetData = presetName === "Default" ? DEFAULT_CONFIG : PRESETS[presetName];
    if (!presetData) return null;

    var candidate = {};
    for (var key in DEFAULT_CONFIG) {
        candidate[key] = DEFAULT_CONFIG[key];
    }
    for (var presetKey in presetData) {
        candidate[presetKey] = presetData[presetKey];
    }

    NormalizeNeutralCampFlags(candidate, presetData);
    NormalizeItemCooldownModeConfig(candidate, presetData);
    NormalizeAmmoScaleConfig(candidate, presetData);
    NormalizeVoiceTypeConfig(candidate);
    NormalizeHealthbarTypeConfig(candidate, presetData);
    NormalizeColorWarningConfig(candidate, presetData);
    NormalizeEnemyColorWarningConfig(candidate, presetData);
    NormalizeAllyColorWarningConfig(candidate, presetData);
    NormalizeTopbarEnemyHpWarningConfig(candidate, presetData);
    NormalizeTopbarAllyHpWarningConfig(candidate, presetData);
    NormalizeShopItemNotificationsConfig(candidate, presetData);

    PreserveUiOnlySettings(candidate);

    for (var modKey in MOD_CONFIG) {
        if (candidate.hasOwnProperty(modKey)) continue;
        candidate[modKey] = MOD_CONFIG[modKey];
    }

    return candidate;
}

function OpenConfigDiffPreviewModal(options) {
    var opts = options || {};
    var rows = Array.isArray(opts.rows) ? opts.rows : [];
    var isRu = IsRussianSettingsLanguage();
    var title = String(opts.title || "Settings Changes");
    var summary = String(opts.summary || ("Changes: " + String(rows.length)));
    var details = String(opts.details || "");
    var applyText = String(opts.applyText || "Confirm");
    var cancelText = String(opts.cancelText || "Cancel");

    var rootPanel = $.GetContextPanel();
    if (!rootPanel) return;
    PrepareSettingsModalOpen();
    var existing = rootPanel.FindChildTraverse("ConfigDiffPreviewModalOverlay");
    if (existing) existing.DeleteAsync(0);

    var overlay = $.CreatePanel("Panel", rootPanel, "ConfigDiffPreviewModalOverlay");
    overlay.AddClass("ModalOverlay");
    overlay.AddClass("QOLModalOverlay");
    overlay.SetPanelEvent("onactivate", function() { CloseModal(overlay); });
    $.Schedule(0.01, function() {
        if (overlay && overlay.IsValid && overlay.IsValid()) {
            overlay.AddClass("Show");
            if (modalContainer && modalContainer.IsValid && modalContainer.IsValid()) {
                modalContainer.SetFocus();
            }
        }
    });

    var modalContainer = $.CreatePanel("Panel", overlay, "ConfigDiffModalContainer");
    modalContainer.AddClass("QOLUnifiedModalSurface");
    modalContainer.AddClass("MetroModalContainer");
    modalContainer.AddClass("ConfigDiffModalContainer");
    modalContainer.SetPanelEvent("onactivate", function() {});
    modalContainer.SetPanelEvent("oncancel", function() { $.ForceCloseModSettings(); });
    overlay.SetPanelEvent("oncancel", function() { $.ForceCloseModSettings(); });

    var titleRow = $.CreatePanel("Panel", modalContainer, "");
    titleRow.AddClass("ConfigDiffTitleRow");

    var header = $.CreatePanel("Label", titleRow, "");
    header.AddClass("ModalTitle");
    header.AddClass("ConfigDiffTitle");
    header.text = title;

    var titleSpacer = $.CreatePanel("Panel", titleRow, "");
    titleSpacer.AddClass("ConfigDiffTitleSpacer");

    var closeBtn = $.CreatePanel("Button", titleRow, "ConfigDiffCloseBtn");
    closeBtn.AddClass("QOLUnifiedModalClose");
    closeBtn.AddClass("ConfigDiffCloseBtn");
    var closeIcon = $.CreatePanel("Label", closeBtn, "");
    closeIcon.text = "X";
    closeBtn.SetPanelEvent("onactivate", function() { CloseModal(overlay); });

    if (details && details.length > 0) {
        var detailsLabel = $.CreatePanel("Label", modalContainer, "");
        detailsLabel.AddClass("ModalInstructions");
        detailsLabel.AddClass("ConfigDiffDetails");
        detailsLabel.text = details;
    }

    var list = $.CreatePanel("Panel", modalContainer, "ConfigDiffList");
    list.AddClass("ConfigDiffList");
    var diffGridRows = Math.max(1, Math.ceil(rows.length / 2));
    var diffRowHeightPx = 35;
    var diffListPaddingPx = 8;
    var diffListMinHeightPx = 120;
    var diffListMaxHeightPx = 620;
    var computedListHeightPx = Math.max(
        diffListMinHeightPx,
        Math.min(diffListMaxHeightPx, diffGridRows * diffRowHeightPx + diffListPaddingPx)
    );
    list.style.height = String(computedListHeightPx) + "px";
    list.style.maxHeight = String(computedListHeightPx) + "px";
    if (rows.length <= 0) {
        var empty = $.CreatePanel("Label", list, "");
        empty.AddClass("ConfigDiffEmpty");
            empty.text = LocalizeSettingsText("No setting changes detected.", true);
    } else {
        var createDiffCell = function(parentPanel, rowData, rowIndex) {
            var cellPanel = $.CreatePanel("Panel", parentPanel, "");
            cellPanel.AddClass("ConfigDiffCell");
            cellPanel.AddClass((rowIndex % 2) === 0 ? "Even" : "Odd");

            var lineRow = $.CreatePanel("Panel", cellPanel, "");
            lineRow.AddClass("ConfigDiffCellLine");

            var titleLabel = $.CreatePanel("Label", lineRow, "");
            titleLabel.AddClass("ConfigDiffCellTitle");
            var categoryText = String(rowData.categoryLabel || "");
            var settingText = String(rowData.keyLabel || rowData.key || "");
            titleLabel.text = categoryText ? (categoryText + ": " + settingText) : settingText;

            var valueWrap = $.CreatePanel("Panel", lineRow, "");
            valueWrap.AddClass("ConfigDiffValueWrap");

            var beforeLabel = $.CreatePanel("Label", valueWrap, "");
            beforeLabel.AddClass("ConfigDiffCellBefore");
            beforeLabel.text = rowData.beforeText || "";

            var arrow = $.CreatePanel("Label", valueWrap, "");
            arrow.AddClass("ConfigDiffCellArrow");
            arrow.text = "\u2192";

            var afterLabel = $.CreatePanel("Label", valueWrap, "");
            afterLabel.AddClass("ConfigDiffCellAfter");
            afterLabel.text = rowData.afterText || "";
        };

        for (var i = 0; i < rows.length; i += 2) {
            var gridRow = $.CreatePanel("Panel", list, "");
            gridRow.AddClass("ConfigDiffGridRow");

            createDiffCell(gridRow, rows[i], i);
            if (i + 1 < rows.length) {
                createDiffCell(gridRow, rows[i + 1], i + 1);
            } else {
                var fillerA = $.CreatePanel("Panel", gridRow, "");
                fillerA.AddClass("ConfigDiffCellFiller");
            }
        }
    }

    var btnRow = $.CreatePanel("Panel", modalContainer, "ConfigDiffModalBtnRow");
    btnRow.AddClass("ModalBtnRow");
    btnRow.AddClass("ConfigDiffModalBtnRow");

    var summaryLabel = $.CreatePanel("Label", btnRow, "");
    summaryLabel.AddClass("ConfigDiffSummaryFooter");
    summaryLabel.text = summary;

    var btnSpacer = $.CreatePanel("Panel", btnRow, "");
    btnSpacer.AddClass("ConfigDiffBtnSpacer");

    var cancelBtn = $.CreatePanel("Button", btnRow, "");
    cancelBtn.AddClass("QOLUnifiedModalSecondary");
    cancelBtn.AddClass("ModalBtnClose");
    cancelBtn.AddClass("ConfigDiffCancelBtn");
    var cancelLbl = $.CreatePanel("Label", cancelBtn, "");
    cancelLbl.text = cancelText;
    cancelBtn.SetPanelEvent("onactivate", function() { CloseModal(overlay); });

    var applyBtn = $.CreatePanel("Button", btnRow, "");
    applyBtn.AddClass("QOLUnifiedModalPrimary");
    applyBtn.AddClass("ModalBtnApply");
    applyBtn.AddClass("ConfigDiffApplyBtn");
    var applyLbl = $.CreatePanel("Label", applyBtn, "");
    applyLbl.text = applyText;
    applyBtn.SetPanelEvent("onactivate", function() {
        var shouldClose = true;
        if (typeof opts.onApply === "function") {
            try {
                shouldClose = opts.onApply() !== false;
            } catch (eApply) {
                shouldClose = false;
            }
        }
        if (shouldClose) {
            CloseModal(overlay);
        }
    });
}

function TryApplyImportStringWithDiagnostics(raw) {
    var result = {
        ok: false,
        source: "compact",
        schemaVersion: "",
        parsedConfig: null,
        candidateConfig: null,
        appliedKeys: 0,
        unknownKeys: 0,
        clampedKeys: 0
    };
    if (!raw) return result;
    var trimmed = raw.trim();
    if (trimmed.length === 0) return result;

    var normalized = String(trimmed).replace(/\s+/g, "");
    var tokenMatch = normalized.match(EXPORT_TOKEN_REGEX);
    if (!tokenMatch) return result;

    var schemaSemver = String(tokenMatch[1] || "").replace(/-/g, ".");
    if (!schemaSemver || !COMPACT_SCHEMA_REGISTRY.hasOwnProperty(schemaSemver)) return result;
    var compactCandidate = String(tokenMatch[2] || "");
    if (!compactCandidate) return result;

    try {
        var compactBinary = FromBase64Url(compactCandidate);
        result.parsedConfig = DeserializeCompactV2(compactBinary, schemaSemver);
        result.schemaVersion = schemaSemver;
    } catch (compactErr) {
        return result;
    }

    var preview = BuildCandidateConfigFromParsed(result.parsedConfig, result.schemaVersion || LATEST_COMPACT_SEMVER, DEFAULT_CONFIG);
    PreserveUiOnlySettings(preview.candidateConfig);
    result.candidateConfig = preview.candidateConfig;
    result.appliedKeys = preview.diagnostics.appliedKeys;
    result.unknownKeys = preview.diagnostics.unknownKeys;
    result.clampedKeys = preview.diagnostics.clampedKeys;
    result.ok = true;
    return result;
}

function TryApplyImportStringToConfig(raw) {
    var result = TryApplyImportStringWithDiagnostics(raw);
    if (!result || result.ok !== true || !result.parsedConfig) return false;
    ApplyParsedConfigWithDiagnostics(result.parsedConfig, result.schemaVersion || LATEST_COMPACT_SEMVER);
    return true;
}

function StopMinesweeperLoop() {
    gMinesweeperTimerToken++;
}

function UpdateMinesweeperHud(state) {
    if (!state || !state.isValid || !state.isValid()) return;
    if (state.mineLabel && state.mineLabel.IsValid && state.mineLabel.IsValid()) {
        state.mineLabel.text = LocalizeSettingsText("Mines:", true) + " " + state.mineCount;
    }
    if (state.flagLabel && state.flagLabel.IsValid && state.flagLabel.IsValid()) {
        state.flagLabel.text = LocalizeSettingsText("Flags:", true) + " " + state.flagsUsed;
    }
    if (state.timeLabel && state.timeLabel.IsValid && state.timeLabel.IsValid()) {
        state.timeLabel.text = LocalizeSettingsText("Time:", true) + " " + state.elapsedSeconds + "s";
    }
}

function UpdateMinesweeperStatus(state, text) {
    if (!state || !state.isValid || !state.isValid()) return;
    if (state.statusLabel && state.statusLabel.IsValid && state.statusLabel.IsValid()) {
        var hasText = !!(text && text.length > 0);
        state.statusLabel.text = hasText ? LocalizeSettingsText(text, true) : LocalizeSettingsText(MINESWEEPER_STATUS_DEFAULT_TEXT, true);
        state.statusLabel.style.visibility = "visible";
    }
}

function ApplyMinesweeperDifficulty(state, difficultyId, shouldReset) {
    if (!state || !state.isValid || !state.isValid()) return;
    var cfg = GetMinesweeperDifficultyById(difficultyId);
    state.difficultyId = cfg.id;
    state.rows = cfg.rows;
    state.cols = cfg.cols;
    state.mineCount = cfg.mines;
    state.safeCells = (cfg.rows * cfg.cols) - cfg.mines;

    if (state.difficultyButtons) {
        for (var i = 0; i < MINESWEEPER_DIFFICULTIES.length; i++) {
            var key = MINESWEEPER_DIFFICULTIES[i].id;
            var btn = state.difficultyButtons[key];
            if (btn && btn.IsValid && btn.IsValid()) {
                btn.SetHasClass("Active", key === cfg.id);
            }
        }
    }

    if (shouldReset) {
        ResetMinesweeperGame(state);
    }
}

function ForEachMinesweeperNeighbor(state, row, col, fn) {
    for (var dr = -1; dr <= 1; dr++) {
        for (var dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            var nr = row + dr;
            var nc = col + dc;
            if (nr < 0 || nr >= state.rows || nc < 0 || nc >= state.cols) continue;
            fn(nr, nc);
        }
    }
}

function UpdateMinesweeperCellVisual(cell) {
    if (!cell || !cell.panel || !cell.label || !cell.panel.IsValid || !cell.panel.IsValid()) return;
    var panel = cell.panel;
    var label = cell.label;
    panel.SetHasClass("Revealed", cell.revealed === true);
    panel.SetHasClass("Flagged", cell.flagged === true && cell.revealed !== true);
    panel.SetHasClass("Mine", cell.revealed === true && cell.isMine === true);
    panel.SetHasClass("MineExploded", cell.exploded === true);

    if (cell.revealed) {
        if (cell.isMine) {
            label.text = "";
        } else if (cell.adjacent > 0) {
            label.text = String(cell.adjacent);
        } else {
            label.text = "";
        }
    } else if (cell.flagged) {
        label.text = "F";
    } else {
        label.text = "";
    }
}

function CreateMinesweeperCells(state) {
    state.cells = [];
    for (var r = 0; r < state.rows; r++) {
        var rowCells = [];
        for (var c = 0; c < state.cols; c++) {
            rowCells.push({
                row: r,
                col: c,
                isMine: false,
                adjacent: 0,
                revealed: false,
                flagged: false,
                exploded: false,
                panel: null,
                label: null
            });
        }
        state.cells.push(rowCells);
    }

    var minesPlaced = 0;
    while (minesPlaced < state.mineCount) {
        var index = Math.floor(Math.random() * state.rows * state.cols);
        var mineRow = Math.floor(index / state.cols);
        var mineCol = index % state.cols;
        var target = state.cells[mineRow][mineCol];
        if (target.isMine) continue;
        target.isMine = true;
        minesPlaced++;
    }

    RecomputeMinesweeperAdjacents(state);
}

function RecomputeMinesweeperAdjacents(state) {
    if (!state || !Array.isArray(state.cells)) return;
    for (var rr = 0; rr < state.rows; rr++) {
        for (var cc = 0; cc < state.cols; cc++) {
            var cell = state.cells[rr][cc];
            if (cell.isMine) {
                cell.adjacent = -1;
                continue;
            }
            var nearby = 0;
            ForEachMinesweeperNeighbor(state, rr, cc, function(nr, nc) {
                if (state.cells[nr][nc].isMine) nearby++;
            });
            cell.adjacent = nearby;
        }
    }
}

function EnsureMinesweeperFirstRevealSafe(state, row, col) {
    if (!state || state.firstRevealDone) return;
    state.firstRevealDone = true;
    var current = state.cells[row] && state.cells[row][col] ? state.cells[row][col] : null;
    if (!current || !current.isMine) return;

    var candidates = [];
    for (var r = 0; r < state.rows; r++) {
        for (var c = 0; c < state.cols; c++) {
            if (r === row && c === col) continue;
            var candidate = state.cells[r][c];
            if (!candidate || candidate.isMine) continue;
            candidates.push(candidate);
        }
    }
    if (candidates.length <= 0) return;

    var pickIndex = Math.floor(Math.random() * candidates.length);
    if (!isFinite(pickIndex) || pickIndex < 0) pickIndex = 0;
    if (pickIndex >= candidates.length) pickIndex = candidates.length - 1;
    var destination = candidates[pickIndex];
    if (!destination) return;

    current.isMine = false;
    destination.isMine = true;
    RecomputeMinesweeperAdjacents(state);
}

function RenderMinesweeperBoard(state) {
    if (!state || !state.boardPanel || !state.boardPanel.IsValid || !state.boardPanel.IsValid()) return;
    state.boardPanel.RemoveAndDeleteChildren();
    for (var r = 0; r < state.rows; r++) {
        var rowPanel = $.CreatePanel("Panel", state.boardPanel, "ArcadeMinesweeperRow_" + r);
        rowPanel.AddClass("ArcadeMinesweeperRow");
        for (var c = 0; c < state.cols; c++) {
            (function(rowIndex, colIndex) {
                var cell = state.cells[rowIndex][colIndex];
                var cellBtn = $.CreatePanel("Button", rowPanel, "ArcadeMinesweeperCell_" + rowIndex + "_" + colIndex);
                cellBtn.AddClass("ArcadeMinesweeperCell");
                var cellLbl = $.CreatePanel("Label", cellBtn, "");
                cellLbl.AddClass("ArcadeMinesweeperCellLabel");
                cell.panel = cellBtn;
                cell.label = cellLbl;
                UpdateMinesweeperCellVisual(cell);

                cellBtn.SetPanelEvent("onactivate", function() {
                    HandleMinesweeperCellActivate(state, rowIndex, colIndex);
                });
                cellBtn.SetPanelEvent("oncontextmenu", function() {
                    ToggleMinesweeperFlag(state, rowIndex, colIndex);
                    return true;
                });
            })(r, c);
        }
    }
}

function ApplyMinesweeperBoardSizing(state) {
    if (!state || !state.boardPanel || !state.boardPanel.IsValid || !state.boardPanel.IsValid()) return false;
    if (!Array.isArray(state.cells) || state.cells.length <= 0) return false;

    var boardWidth = MINESWEEPER_BOARD_WIDTH;
    var boardHeight = MINESWEEPER_BOARD_HEIGHT;

    var rows = Math.max(1, Math.floor(Number(state.rows)));
    var cols = Math.max(1, Math.floor(Number(state.cols)));
    var usableWidth = Math.max(60, boardWidth - 24);
    var usableHeight = Math.max(60, boardHeight - 24);
    var gutterPerCell = 2;
    var perCellWidth = (usableWidth - (cols * gutterPerCell)) / cols;
    var perCellHeight = (usableHeight - (rows * gutterPerCell)) / rows;
    var cellSize = Math.floor(Math.min(perCellWidth, perCellHeight));
    if (!isFinite(cellSize)) return false;
    if (cellSize < 18) cellSize = 18;
    if (cellSize > 58) cellSize = 58;

    var fontSize = Math.floor(cellSize * 0.44);
    if (fontSize < 12) fontSize = 12;
    if (fontSize > 26) fontSize = 26;
    var bgSize = Math.floor(cellSize * 0.74);
    if (bgSize < 14) bgSize = 14;
    if (bgSize > 44) bgSize = 44;

    for (var r = 0; r < rows; r++) {
        var rowCells = state.cells[r];
        if (!Array.isArray(rowCells)) continue;
        for (var c = 0; c < cols; c++) {
            var cell = rowCells[c];
            if (!cell || !cell.panel || !cell.label) continue;
            if (!cell.panel.IsValid || !cell.panel.IsValid()) continue;
            if (!cell.label.IsValid || !cell.label.IsValid()) continue;
            cell.panel.style.width = cellSize + "px";
            cell.panel.style.height = cellSize + "px";
            cell.panel.style.marginTop = "1px";
            cell.panel.style.marginRight = "1px";
            cell.panel.style.marginBottom = "1px";
            cell.panel.style.marginLeft = "1px";
            cell.label.style.fontSize = fontSize + "px";
            cell.label.style.backgroundSize = bgSize + "px " + bgSize + "px";
        }
    }

    return true;
}

function ScheduleMinesweeperBoardSizing(state, attempts) {
    if (!state || !state.active) return;
    var tries = Math.max(1, Math.floor(Number(attempts) || 1));
    $.Schedule(0.01, function() {
        if (!state || !state.active) return;
        var ready = false;
        try { ready = ApplyMinesweeperBoardSizing(state); } catch (eMsSize) { ready = false; }
        if (!ready && tries > 1) {
            ScheduleMinesweeperBoardSizing(state, tries - 1);
        }
    });
}

function ScheduleHideAmmoPreview(delaySec) {
    gAmmoPreviewHideToken++;
    var token = gAmmoPreviewHideToken;
    $.Schedule(delaySec, function() {
        if (token !== gAmmoPreviewHideToken) return;
        if (gAmmoPreviewPanel && gAmmoPreviewPanel.IsValid && gAmmoPreviewPanel.IsValid()) {
            gAmmoPreviewPanel.RemoveClass("Visible");
        }
    });
}

function ScheduleHideReloadCooldownPreview(delaySec) {
    gReloadCooldownPreviewHideToken++;
    var token = gReloadCooldownPreviewHideToken;
    $.Schedule(delaySec, function() {
        if (token !== gReloadCooldownPreviewHideToken) return;
        if (gReloadCooldownPreviewPanel && gReloadCooldownPreviewPanel.IsValid && gReloadCooldownPreviewPanel.IsValid()) {
            gReloadCooldownPreviewPanel.RemoveClass("Visible");
        }
    });
}

function ScheduleHideUnitTargetPreview(delaySec) {
    gUnitTargetPreviewHideToken++;
    var token = gUnitTargetPreviewHideToken;
    $.Schedule(delaySec, function() {
        if (token !== gUnitTargetPreviewHideToken) return;
        if (gUnitTargetPreviewPanel && gUnitTargetPreviewPanel.IsValid && gUnitTargetPreviewPanel.IsValid()) {
            gUnitTargetPreviewPanel.RemoveClass("Visible");
        }
    });
}

function ScheduleHideDamageReportPreview(delaySec) {
    gDamageReportPreviewHideToken++;
    var token = gDamageReportPreviewHideToken;
    $.Schedule(delaySec, function() {
        if (token !== gDamageReportPreviewHideToken) return;
        if (gDamageReportPreviewPanel && gDamageReportPreviewPanel.IsValid && gDamageReportPreviewPanel.IsValid()) {
            gDamageReportPreviewPanel.RemoveClass("Visible");
        }
    });
}

function ScheduleHideShopPreview(delaySec) {
    gShopPreviewHideToken++;
    var token = gShopPreviewHideToken;
    $.Schedule(delaySec, function() {
        if (token !== gShopPreviewHideToken) return;
        if (gShopPreviewPanel && gShopPreviewPanel.IsValid && gShopPreviewPanel.IsValid()) {
            gShopPreviewPanel.RemoveClass("Visible");
        }
    });
}

function ScheduleHideUnsecuredPlusPreview(delaySec) {
    gUnsecuredPlusPreviewHideToken++;
    var token = gUnsecuredPlusPreviewHideToken;
    $.Schedule(delaySec, function() {
        if (token !== gUnsecuredPlusPreviewHideToken) return;
        if (gUnsecuredPlusPreviewPanel && gUnsecuredPlusPreviewPanel.IsValid && gUnsecuredPlusPreviewPanel.IsValid()) {
            gUnsecuredPlusPreviewPanel.RemoveClass("Visible");
        }
    });
}

function ToggleMinesweeperFlag(state, row, col) {
    if (!state || state.gameOver || !state.active) return;
    var cell = state.cells[row][col];
    if (!cell || cell.revealed) return;
    cell.flagged = !cell.flagged;
    state.flagsUsed += cell.flagged ? 1 : -1;
    if (state.flagsUsed < 0) state.flagsUsed = 0;
    UpdateMinesweeperCellVisual(cell);
    UpdateMinesweeperHud(state);
}

function RevealMinesweeperRegion(state, startRow, startCol) {
    var stack = [{ r: startRow, c: startCol }];
    while (stack.length > 0) {
        var node = stack.pop();
        var cell = state.cells[node.r][node.c];
        if (!cell || cell.revealed || cell.flagged) continue;
        if (cell.isMine) continue;
        cell.revealed = true;
        state.revealedSafeCount++;
        UpdateMinesweeperCellVisual(cell);

        if (cell.adjacent === 0) {
            ForEachMinesweeperNeighbor(state, node.r, node.c, function(nr, nc) {
                var nextCell = state.cells[nr][nc];
                if (!nextCell || nextCell.revealed || nextCell.flagged || nextCell.isMine) return;
                stack.push({ r: nr, c: nc });
            });
        }
    }
}

function RevealAllMines(state) {
    for (var r = 0; r < state.rows; r++) {
        for (var c = 0; c < state.cols; c++) {
            var cell = state.cells[r][c];
            if (cell.isMine) {
                cell.revealed = true;
                UpdateMinesweeperCellVisual(cell);
            }
        }
    }
}

function PlayMinesweeperExplodeSound() {
    var eventName = String(MINESWEEPER_EXPLODE_SOUND_EVENT || "");
    if (!eventName) return;
    PlayArcadeGameSoundEffect(eventName);
}

function PlayMinesweeperWinSound() {
    var eventName = String(MINESWEEPER_WIN_SOUND_EVENT || "");
    if (!eventName) return;
    PlayArcadeGameSoundEffect(eventName);
}

function HandleMinesweeperCellActivate(state, row, col) {
    if (!state || state.gameOver || !state.active) return;
    var cell = state.cells[row][col];
    if (!cell || cell.revealed || cell.flagged) return;
    EnsureMinesweeperFirstRevealSafe(state, row, col);

    if (cell.isMine) {
        cell.exploded = true;
        cell.revealed = true;
        UpdateMinesweeperCellVisual(cell);
        PlayMinesweeperExplodeSound();
        RevealAllMines(state);
        state.gameOver = true;
        StopMinesweeperLoop();
        UpdateMinesweeperStatus(state, "Boom. Press New Game.");
        return;
    }

    RevealMinesweeperRegion(state, row, col);
    if (state.revealedSafeCount >= state.safeCells) {
        state.gameOver = true;
        StopMinesweeperLoop();
        PlayMinesweeperWinSound();
        UpdateMinesweeperStatus(state, LocalizeSettingsText("Cleared in", true) + " " + state.elapsedSeconds + LocalizeSettingsText("s.", true));
        return;
    }

    UpdateMinesweeperHud(state);
}

function StartMinesweeperTimer(state) {
    if (!state || !state.active) return;
    gMinesweeperTimerToken++;
    var token = gMinesweeperTimerToken;

    function Tick() {
        if (!state || !state.active || state.gameOver) return;
        if (token !== gMinesweeperTimerToken) return;
        state.elapsedSeconds = Math.max(0, Math.floor((Date.now() - state.startTime) / 1000));
        UpdateMinesweeperHud(state);
        $.Schedule(0.25, Tick);
    }

    Tick();
}

function ResetMinesweeperGame(state) {
    if (!state || !state.active) return;
    state.gameOver = false;
    state.firstRevealDone = false;
    state.flagsUsed = 0;
    state.revealedSafeCount = 0;
    state.elapsedSeconds = 0;
    state.startTime = Date.now();
    CreateMinesweeperCells(state);
    RenderMinesweeperBoard(state);
    ScheduleMinesweeperBoardSizing(state, 10);
    UpdateMinesweeperHud(state);
    UpdateMinesweeperStatus(state, "");
    StartMinesweeperTimer(state);
}

function CloseMinesweeperModal(overlay) {
    StopMinesweeperLoop();
    if (gMinesweeperState) {
        gMinesweeperState.active = false;
        gMinesweeperState = null;
    }
    if (overlay && overlay.IsValid && overlay.IsValid()) {
        CloseModal(overlay);
    }
}

function CloseMinesweeperModalIfOpen() {
    var root = $.GetContextPanel();
    if (!root) return;
    var overlay = root.FindChildTraverse("ArcadeMinesweeperOverlay");
    if (overlay && overlay.IsValid && overlay.IsValid()) {
        CloseMinesweeperModal(overlay);
    } else {
        StopMinesweeperLoop();
    }
}

function OpenMinesweeperModal() {
    var rootPanel = $.GetContextPanel();
    if (!rootPanel) return;

    PrepareSettingsModalOpen();
    CloseMinesweeperModalIfOpen();

    var overlay = $.CreatePanel("Panel", rootPanel, "ArcadeMinesweeperOverlay");
    overlay.AddClass("ModalOverlay");
    overlay.AddClass("QOLModalOverlay");
    overlay.SetPanelEvent("onactivate", function() {
        CloseMinesweeperModal(overlay);
    });
    $.Schedule(0.01, function() {
        if (overlay && overlay.IsValid && overlay.IsValid()) overlay.AddClass("Show");
    });

    var modalContainer = $.CreatePanel("Panel", overlay, "ArcadeMinesweeperModalContainer");
    modalContainer.AddClass("ArcadeModalContainer");
    modalContainer.AddClass("QOLUnifiedModalSurface");
    modalContainer.SetPanelEvent("onactivate", function() {});

    var closeBtn = $.CreatePanel("Button", modalContainer, "CloseBtn");
    var closeIcon = $.CreatePanel("Label", closeBtn, "");
    closeIcon.text = "X";
    closeBtn.SetPanelEvent("onactivate", function() {
        CloseMinesweeperModal(overlay);
    });

    var header = $.CreatePanel("Label", modalContainer, "");
    header.AddClass("ModalTitle");
    header.AddClass("ArcadeMinesweeperTitle");
    header.text = LocalizeSettingsText("Bebop Sweeper", true);

    var actionRow = $.CreatePanel("Panel", modalContainer, "ArcadeMinesweeperActionRow");
    actionRow.AddClass("ArcadeMinesweeperActionRow");

    var newGameBtn = $.CreatePanel("Button", actionRow, "ArcadeMinesweeperNewGameBtn");
    newGameBtn.AddClass("ArcadeMinesweeperActionBtn");
    newGameBtn.AddClass("ArcadeMinesweeperControlBtn");
    var newGameLbl = $.CreatePanel("Label", newGameBtn, "");
    newGameLbl.text = LocalizeSettingsText("New Game", true);

    var difficultyGroup = $.CreatePanel("Panel", actionRow, "ArcadeMinesweeperDifficultyGroup");
    difficultyGroup.AddClass("ArcadeMinesweeperDifficultyGroup");
    var difficultyButtons = {};
    for (var i = 0; i < MINESWEEPER_DIFFICULTIES.length; i++) {
        (function(cfg) {
            var diffBtn = $.CreatePanel("Button", difficultyGroup, "ArcadeMinesweeperDifficulty_" + cfg.id);
            diffBtn.AddClass("ArcadeMinesweeperActionBtn");
            diffBtn.AddClass("ArcadeMinesweeperDifficultyBtn");
            diffBtn.AddClass("ArcadeMinesweeperControlBtn");
            var diffLbl = $.CreatePanel("Label", diffBtn, "");
            diffLbl.text = cfg.label;
            difficultyButtons[cfg.id] = diffBtn;
            diffBtn.SetPanelEvent("onactivate", function() {
                if (!state.active) return;
                ApplyMinesweeperDifficulty(state, cfg.id, true);
            });
        })(MINESWEEPER_DIFFICULTIES[i]);
    }

    var statusLabel = $.CreatePanel("Label", modalContainer, "ArcadeMinesweeperStatusLabel");
    statusLabel.AddClass("ArcadeMinesweeperStatusLabel");
    statusLabel.style.visibility = "collapse";

    var board = $.CreatePanel("Panel", modalContainer, "ArcadeMinesweeperBoard");
    board.AddClass("ArcadeMinesweeperBoard");

    var footerRow = $.CreatePanel("Panel", modalContainer, "ArcadeMinesweeperFooterRow");
    footerRow.AddClass("ArcadeMinesweeperFooterRow");

    var mineLabel = $.CreatePanel("Label", footerRow, "ArcadeMinesweeperMineLabel");
    mineLabel.AddClass("ArcadeMinesweeperStat");

    var flagLabel = $.CreatePanel("Label", footerRow, "ArcadeMinesweeperFlagLabel");
    flagLabel.AddClass("ArcadeMinesweeperStat");

    var timeLabel = $.CreatePanel("Label", footerRow, "ArcadeMinesweeperTimeLabel");
    timeLabel.AddClass("ArcadeMinesweeperStat");

    var state = {
        isValid: function() { return overlay && overlay.IsValid && overlay.IsValid(); },
        active: true,
        gameOver: false,
        firstRevealDone: false,
        rows: MINESWEEPER_ROWS,
        cols: MINESWEEPER_COLS,
        mineCount: MINESWEEPER_MINES,
        safeCells: (MINESWEEPER_ROWS * MINESWEEPER_COLS) - MINESWEEPER_MINES,
        revealedSafeCount: 0,
        flagsUsed: 0,
        elapsedSeconds: 0,
        startTime: Date.now(),
        difficultyId: MINESWEEPER_DEFAULT_DIFFICULTY,
        difficultyButtons: difficultyButtons,
        mineImageSrc: MINESWEEPER_MINE_IMAGE_SRC,
        mineLabel: mineLabel,
        flagLabel: flagLabel,
        timeLabel: timeLabel,
        statusLabel: statusLabel,
        boardPanel: board,
        cells: []
    };

    gMinesweeperState = state;

    newGameBtn.SetPanelEvent("onactivate", function() {
        if (!state.active) return;
        ResetMinesweeperGame(state);
    });

    ApplyMinesweeperDifficulty(state, ResolveArcadeDefaultDifficultyId(), true);
}

function StopFlappyLoop() {
    gFlappyLoopToken++;
}

function UpdateFlappyStatus(state, text) {
    if (!state || !state.isValid || !state.isValid()) return;
    if (state.statusLabel && state.statusLabel.IsValid && state.statusLabel.IsValid()) {
        var hasText = !!(text && text.length > 0);
        state.statusLabel.text = hasText ? LocalizeSettingsText(text, true) : "";
        state.statusLabel.style.visibility = hasText ? "visible" : "collapse";
    }
}

function UpdateFlappyHud(state) {
    if (!state || !state.isValid || !state.isValid()) return;
    if (state.scoreLabel && state.scoreLabel.IsValid && state.scoreLabel.IsValid()) {
        state.scoreLabel.text = LocalizeSettingsText("Score:", true) + " " + state.score;
    }
    if (state.bestLabel && state.bestLabel.IsValid && state.bestLabel.IsValid()) {
        state.bestLabel.text = LocalizeSettingsText("Best:", true) + " " + state.bestScore;
    }
}

function RefreshFlappyBounds(state) {
    if (!state || !state.gameArea || !state.gameArea.IsValid || !state.gameArea.IsValid()) return;
    state.gameWidth = 680;
    state.gameHeight = 500;
}

function PlayFlappyFailSound() {
    var options = FLAPPY_BAT_FAIL_SOUND_EVENTS;
    if (!Array.isArray(options) || options.length <= 0) return;
    var idx = PickRandomIndexNoImmediateRepeat(options, "flappy_bat_fail");
    if (idx < 0 || idx >= options.length) return;
    var eventName = String(options[idx] || "");
    if (!eventName) return;
    PlayArcadeGameSoundEffect(eventName);
}

function SpawnFlappyPipe(state) {
    if (!state || !state.active || !state.pipesLayer || !state.pipesLayer.IsValid || !state.pipesLayer.IsValid()) return;

    var gapHalf = Math.floor(state.gapSize / 2);
    var minCenter = gapHalf + 24;
    var maxCenter = state.gameHeight - gapHalf - 24;
    var gapCenter = Math.floor(minCenter + (Math.random() * Math.max(1, (maxCenter - minCenter))));

    var pipePanel = $.CreatePanel("Panel", state.pipesLayer, "ArcadeFlappyPipe_" + state.pipeSerial);
    pipePanel.AddClass("ArcadeFlappyPipe");
    var topPipe = $.CreatePanel("Panel", pipePanel, "");
    topPipe.AddClass("ArcadeFlappyPipePart");
    topPipe.AddClass("Top");
    var bottomPipe = $.CreatePanel("Panel", pipePanel, "");
    bottomPipe.AddClass("ArcadeFlappyPipePart");
    bottomPipe.AddClass("Bottom");

    state.pipes.push({
        x: state.gameWidth + 18,
        gapCenter: gapCenter,
        passed: false,
        panel: pipePanel,
        top: topPipe,
        bottom: bottomPipe
    });
    state.pipeSerial++;
}

function RenderFlappy(state) {
    if (!state || !state.isValid || !state.isValid()) return;

    var birdRadius = Math.floor(state.birdSize / 2);
    state.birdPanel.style.x = Math.floor(state.birdX - birdRadius) + "px";
    state.birdPanel.style.y = Math.floor(state.birdY - birdRadius) + "px";
    var angle = Math.max(-25, Math.min(70, Math.floor(state.birdVel * 5)));
    // Panorama-safe runtime rotation (avoid string transform writes in hot loops).
    state.birdPanel.style.preTransformRotate2d = angle + "deg";

    for (var i = 0; i < state.pipes.length; i++) {
        var pipe = state.pipes[i];
        if (!pipe || !pipe.panel || !pipe.panel.IsValid || !pipe.panel.IsValid()) continue;
        var gapTop = Math.floor(pipe.gapCenter - (state.gapSize / 2));
        var gapBottom = Math.floor(pipe.gapCenter + (state.gapSize / 2));
        pipe.panel.style.x = Math.floor(pipe.x) + "px";
        pipe.panel.style.y = "0px";
        pipe.panel.style.width = state.pipeWidth + "px";
        pipe.panel.style.height = state.gameHeight + "px";

        pipe.top.style.y = "0px";
        pipe.top.style.height = Math.max(0, gapTop) + "px";
        pipe.top.style.width = state.pipeWidth + "px";

        pipe.bottom.style.y = gapBottom + "px";
        pipe.bottom.style.height = Math.max(0, (state.gameHeight - gapBottom)) + "px";
        pipe.bottom.style.width = state.pipeWidth + "px";
    }
}

function EndFlappyGame(state, text) {
    if (!state || state.gameOver) return;
    state.gameOver = true;
    if (state.score > state.bestScore) state.bestScore = state.score;
    PlayFlappyFailSound();
    UpdateFlappyHud(state);
    UpdateFlappyStatus(state, text || "Crashed. Click playfield to restart.");
    StopFlappyLoop();
}

function Flap(state) {
    if (!state || !state.active || state.gameOver) return;
    state.birdVel = state.flapImpulse;
    PlayArcadeGameSoundEffect(FLAPPY_BAT_FLAP_SOUND_EVENT);
}

function StepFlappy(state, token) {
    if (!state || !state.active || !state.isValid || !state.isValid()) return;
    if (token !== gFlappyLoopToken) return;
    if (state.gameOver) return;
    RefreshFlappyBounds(state);

    state.birdVel += state.gravity;
    state.birdY += state.birdVel;

    var birdRadius = Math.floor(state.birdSize / 2);
    if (state.birdY - birdRadius < 0) {
        state.birdY = birdRadius;
        state.birdVel = 0;
    }
    if (state.birdY + birdRadius >= state.gameHeight) {
        state.birdY = state.gameHeight - birdRadius;
        RenderFlappy(state);
        EndFlappyGame(state, "Crashed. Click playfield to restart.");
        return;
    }

    state.spawnTimer--;
    if (state.spawnTimer <= 0) {
        SpawnFlappyPipe(state);
        state.spawnTimer = state.pipeSpawnTicks;
    }

    var birdLeft = state.birdX - birdRadius;
    var birdRight = state.birdX + birdRadius;
    var birdTop = state.birdY - birdRadius;
    var birdBottom = state.birdY + birdRadius;

    for (var i = state.pipes.length - 1; i >= 0; i--) {
        var pipe = state.pipes[i];
        pipe.x -= state.pipeSpeed;

        var gapTop = pipe.gapCenter - (state.gapSize / 2);
        var gapBottom = pipe.gapCenter + (state.gapSize / 2);

        if (!pipe.passed && (pipe.x + state.pipeWidth) < state.birdX) {
            pipe.passed = true;
            state.score++;
            UpdateFlappyHud(state);
        }

        if (birdRight > pipe.x && birdLeft < (pipe.x + state.pipeWidth)) {
            if (birdTop < gapTop || birdBottom > gapBottom) {
                RenderFlappy(state);
                EndFlappyGame(state, "Crashed. Click playfield to restart.");
                return;
            }
        }

        if ((pipe.x + state.pipeWidth) < -10) {
            if (pipe.panel && pipe.panel.IsValid && pipe.panel.IsValid()) {
                pipe.panel.DeleteAsync(0);
            }
            state.pipes.splice(i, 1);
        }
    }

    RenderFlappy(state);
    $.Schedule(0.033, function() {
        StepFlappy(state, token);
    });
}

function ResetFlappyGame(state) {
    if (!state || !state.active) return;
    RefreshFlappyBounds(state);

    state.gameOver = false;
    state.score = 0;
    state.spawnTimer = 42;
    state.birdY = Math.floor(state.gameHeight * 0.5);
    state.birdVel = 0;

    for (var i = 0; i < state.pipes.length; i++) {
        if (state.pipes[i] && state.pipes[i].panel && state.pipes[i].panel.IsValid && state.pipes[i].panel.IsValid()) {
            state.pipes[i].panel.DeleteAsync(0);
        }
    }
    state.pipes = [];

    UpdateFlappyHud(state);
    UpdateFlappyStatus(state, "");
    RenderFlappy(state);

    StopFlappyLoop();
    var token = gFlappyLoopToken;
    StepFlappy(state, token);
}

function CloseFlappyModal(overlay) {
    StopFlappyLoop();
    if (gFlappyState) {
        gFlappyState.active = false;
        gFlappyState = null;
    }
    if (overlay && overlay.IsValid && overlay.IsValid()) {
        CloseModal(overlay);
    }
}

function CloseFlappyModalIfOpen() {
    var root = $.GetContextPanel();
    if (!root) return;
    var overlay = root.FindChildTraverse("ArcadeFlappyOverlay");
    if (overlay && overlay.IsValid && overlay.IsValid()) {
        CloseFlappyModal(overlay);
    } else {
        StopFlappyLoop();
    }
}

function OpenFlappyModal() {
    var rootPanel = $.GetContextPanel();
    if (!rootPanel) return;

    PrepareSettingsModalOpen();
    CloseFlappyModalIfOpen();

    var overlay = $.CreatePanel("Panel", rootPanel, "ArcadeFlappyOverlay");
    overlay.AddClass("ModalOverlay");
    overlay.AddClass("QOLModalOverlay");
    overlay.SetPanelEvent("onactivate", function() {
        CloseFlappyModal(overlay);
    });
    $.Schedule(0.01, function() {
        if (overlay && overlay.IsValid && overlay.IsValid()) overlay.AddClass("Show");
    });

    var modalContainer = $.CreatePanel("Panel", overlay, "ArcadeFlappyModalContainer");
    modalContainer.AddClass("ArcadeModalContainer");
    modalContainer.AddClass("QOLUnifiedModalSurface");
    modalContainer.SetPanelEvent("onactivate", function() {});

    var closeBtn = $.CreatePanel("Button", modalContainer, "CloseBtn");
    var closeIcon = $.CreatePanel("Label", closeBtn, "");
    closeIcon.text = "X";
    closeBtn.SetPanelEvent("onactivate", function() {
        CloseFlappyModal(overlay);
    });

    var header = $.CreatePanel("Label", modalContainer, "");
    header.AddClass("ModalTitle");
    header.AddClass("ArcadeFlappyTitle");
    header.text = LocalizeSettingsText("Flappy Bat", true);

    var hudRow = $.CreatePanel("Panel", modalContainer, "ArcadeFlappyHudRow");
    hudRow.AddClass("ArcadeFlappyHudRow");
    var scoreLabel = $.CreatePanel("Label", hudRow, "ArcadeFlappyScore");
    scoreLabel.AddClass("ArcadeFlappyStat");
    var bestLabel = $.CreatePanel("Label", hudRow, "ArcadeFlappyBest");
    bestLabel.AddClass("ArcadeFlappyStat");

    var gameArea = $.CreatePanel("Panel", modalContainer, "ArcadeFlappyGameArea");
    gameArea.AddClass("ArcadeFlappyGameArea");

    var pipesLayer = $.CreatePanel("Panel", gameArea, "ArcadeFlappyPipeLayer");
    pipesLayer.AddClass("ArcadeFlappyPipeLayer");

    var birdPanel = $.CreatePanel("Image", gameArea, "ArcadeFlappyBird", {
        src: FLAPPY_BIRD_IMAGE_SRC,
        defaultsrc: "",
        scaling: "contain"
    });
    birdPanel.AddClass("ArcadeFlappyBird");
    var statusLabel = $.CreatePanel("Label", gameArea, "ArcadeFlappyStatusLabel");
    statusLabel.AddClass("ArcadeFlappyStatusLabel");
    statusLabel.style.visibility = "collapse";

    var state = {
        isValid: function() { return overlay && overlay.IsValid && overlay.IsValid(); },
        active: true,
        gameOver: false,
        score: 0,
        bestScore: 0,
        gameWidth: 640,
        gameHeight: 500,
        birdX: 110,
        birdY: 250,
        birdVel: 0,
        birdSize: 44,
        gravity: 0.44,
        flapImpulse: -6.7,
        pipeWidth: 64,
        pipeSpeed: 2.5,
        gapSize: 114,
        pipeSpawnTicks: 72,
        spawnTimer: 42,
        pipeSerial: 0,
        pipes: [],
        scoreLabel: scoreLabel,
        bestLabel: bestLabel,
        statusLabel: statusLabel,
        pipesLayer: pipesLayer,
        birdPanel: birdPanel
    };
    gFlappyState = state;

    gameArea.SetPanelEvent("onactivate", function() {
        if (!state.active) return;
        if (state.gameOver) {
            ResetFlappyGame(state);
            return;
        }
        Flap(state);
    });
    ResetFlappyGame(state);
}

function StopAimTrainerLoop() {
    gAimTrainerLoopToken++;
}

function UpdateAimTrainerStatus(state, text) {
    if (!state || !state.isValid || !state.isValid()) return;
    if (state.statusLabel && state.statusLabel.IsValid && state.statusLabel.IsValid()) {
        var hasText = !!(text && text.length > 0);
        state.statusLabel.text = hasText ? LocalizeSettingsText(text, true) : "";
        state.statusLabel.style.visibility = hasText ? "visible" : "collapse";
    }
}

function UpdateAimTrainerHud(state) {
    if (!state || !state.isValid || !state.isValid()) return;
    var attempts = state.hits + state.misses;
    var accuracy = attempts > 0 ? Math.round((state.hits / attempts) * 100) : 0;
    var durationSec = (typeof state.durationSec === "number" && state.durationSec > 0) ? state.durationSec : AIM_TRAINER_DURATION_SEC;
    if (state.timerLabel && state.timerLabel.IsValid && state.timerLabel.IsValid()) {
        var timeLeft = Math.max(0, durationSec - state.elapsedSec);
        state.timerLabel.text = LocalizeSettingsText("Time:", true) + " " + timeLeft.toFixed(1) + "s";
    }
    if (state.hitLabel && state.hitLabel.IsValid && state.hitLabel.IsValid()) {
        state.hitLabel.text = LocalizeSettingsText("Hits:", true) + " " + state.hits;
    }
    if (state.missLabel && state.missLabel.IsValid && state.missLabel.IsValid()) {
        state.missLabel.text = LocalizeSettingsText("Misses:", true) + " " + state.misses;
    }
    if (state.accLabel && state.accLabel.IsValid && state.accLabel.IsValid()) {
        state.accLabel.text = LocalizeSettingsText("Accuracy:", true) + " " + accuracy + "%";
    }
}

function ApplyAimTrainerDifficulty(state, difficultyId, shouldReset) {
    if (!state || !state.isValid || !state.isValid()) return;
    var cfg = GetAimTrainerDifficultyById(difficultyId);
    state.difficultyId = cfg.id;
    state.durationSec = cfg.durationSec;
    state.targetStartSize = cfg.targetStartSize;
    state.targetEndSize = cfg.targetEndSize;
    state.targetLifeStartSec = cfg.targetLifeStartSec;
    state.targetLifeEndSec = cfg.targetLifeEndSec;

    if (state.difficultyButtons) {
        for (var i = 0; i < AIM_TRAINER_DIFFICULTIES.length; i++) {
            var key = AIM_TRAINER_DIFFICULTIES[i].id;
            var btn = state.difficultyButtons[key];
            if (btn && btn.IsValid && btn.IsValid()) {
                btn.SetHasClass("Active", key === cfg.id);
            }
        }
    }

    if (shouldReset) {
        ResetAimTrainer(state);
    } else {
        UpdateAimTrainerHud(state);
    }
}

function SpawnAimTrainerTarget(state) {
    if (!state || !state.active) return;
    RefreshAimTrainerBounds(state);
    ApplyAimTrainerTargetImage(state);
    var nowSec = Date.now() / 1000.0;
    var durationSec = (typeof state.durationSec === "number" && state.durationSec > 0) ? state.durationSec : AIM_TRAINER_DURATION_SEC;
    var speedScale = Math.min(1, state.elapsedSec / durationSec);
    state.targetLifeSec = Math.max(0.20, state.targetLifeStartSec + ((state.targetLifeEndSec - state.targetLifeStartSec) * speedScale));
    state.targetSpawnSec = nowSec;
    state.targetVisible = true;

    var size = state.targetStartSize;
    var maxX = Math.max(0, state.gameWidth - size);
    var statusInset = Math.max(0, Number(state.statusInset || 0));
    var maxY = Math.max(0, (state.gameHeight - statusInset) - size);
    state.targetBaseX = Math.floor(Math.random() * (maxX + 1));
    state.targetBaseY = Math.floor(Math.random() * (maxY + 1));
}

function RenderAimTrainerTarget(state, nowSec) {
    if (!state || !state.targetBtn || !state.targetBtn.IsValid || !state.targetBtn.IsValid()) return;
    if (!state.targetVisible) {
        state.targetBtn.style.visibility = "collapse";
        return;
    }

    var elapsed = Math.max(0, nowSec - state.targetSpawnSec);
    var t = Math.min(1, elapsed / state.targetLifeSec);
    var size = state.targetStartSize + ((state.targetEndSize - state.targetStartSize) * t);
    var sizePx = Math.max(18, Math.floor(size));
    var centerX = state.targetBaseX + (state.targetStartSize * 0.5);
    var centerY = state.targetBaseY + (state.targetStartSize * 0.5);
    var x = Math.floor(centerX - (sizePx * 0.5));
    var y = Math.floor(centerY - (sizePx * 0.5));

    state.targetBtn.style.visibility = "visible";
    state.targetBtn.style.width = sizePx + "px";
    state.targetBtn.style.height = sizePx + "px";
    state.targetBtn.style.x = x + "px";
    state.targetBtn.style.y = y + "px";

    if (elapsed >= state.targetLifeSec) {
        state.misses++;
        UpdateAimTrainerHud(state);
        QueueAimTrainerNextSpawn(state);
    }
}

function QueueAimTrainerNextSpawn(state) {
    if (!state) return;
    state.targetVisible = false;
    state.pendingSpawn = true;
    if (state.targetBtn && state.targetBtn.IsValid && state.targetBtn.IsValid()) {
        state.targetBtn.style.visibility = "collapse";
    }
}

function PlayAimTrainerHitSound() {
    PlayArcadeGameSoundEffect(AIM_TRAINER_HIT_SOUND_EVENT);
}

function EndAimTrainer(state) {
    if (!state || state.gameOver) return;
    state.gameOver = true;
    state.pendingSpawn = false;
    state.targetVisible = false;
    RenderAimTrainerTarget(state, Date.now() / 1000.0);
    UpdateAimTrainerHud(state);
    UpdateAimTrainerStatus(state, "Run complete. Press New Run.");
    StopAimTrainerLoop();
}

function HandleAimTrainerHit(state) {
    if (!state || !state.active || state.gameOver || !state.targetVisible) return;
    state.hits++;
    PlayAimTrainerHitSound();
    UpdateAimTrainerHud(state);
    QueueAimTrainerNextSpawn(state);
}

function StepAimTrainer(state, token) {
    if (!state || !state.active || !state.isValid || !state.isValid()) return;
    if (token !== gAimTrainerLoopToken) return;
    if (state.gameOver) return;

    var nowSec = Date.now() / 1000.0;
    state.elapsedSec = Math.max(0, nowSec - state.startSec);

    var durationSec = (typeof state.durationSec === "number" && state.durationSec > 0) ? state.durationSec : AIM_TRAINER_DURATION_SEC;
    if (state.elapsedSec >= durationSec) {
        EndAimTrainer(state);
        return;
    }

    if (state.pendingSpawn === true) {
        state.pendingSpawn = false;
        SpawnAimTrainerTarget(state);
    } else if (!state.targetVisible) {
        SpawnAimTrainerTarget(state);
    }
    RenderAimTrainerTarget(state, nowSec);
    UpdateAimTrainerHud(state);

    $.Schedule(0.033, function() {
        StepAimTrainer(state, token);
    });
}

function ResetAimTrainer(state) {
    if (!state || !state.active) return;
    RefreshAimTrainerBounds(state);
    state.gameOver = false;
    state.hits = 0;
    state.misses = 0;
    state.elapsedSec = 0;
    state.startSec = Date.now() / 1000.0;
    state.targetVisible = false;
    state.pendingSpawn = true;
    UpdateAimTrainerStatus(state, "");
    UpdateAimTrainerHud(state);
    if (state.targetBtn && state.targetBtn.IsValid && state.targetBtn.IsValid()) {
        state.targetBtn.style.visibility = "collapse";
    }

    StopAimTrainerLoop();
    var token = gAimTrainerLoopToken;
    StepAimTrainer(state, token);
}

function RefreshAimTrainerBounds(state) {
    if (!state || !state.gameArea || !state.gameArea.IsValid || !state.gameArea.IsValid()) return;
    state.gameWidth = 680;
    state.gameHeight = 500;
}

function CloseAimTrainerModal(overlay) {
    StopAimTrainerLoop();
    if (gAimTrainerState) {
        gAimTrainerState.active = false;
        gAimTrainerState = null;
    }
    if (overlay && overlay.IsValid && overlay.IsValid()) {
        CloseModal(overlay);
    }
}

function CloseAimTrainerModalIfOpen() {
    var root = $.GetContextPanel();
    if (!root) return;
    var overlay = root.FindChildTraverse("ArcadeAimTrainerOverlay");
    if (overlay && overlay.IsValid && overlay.IsValid()) {
        CloseAimTrainerModal(overlay);
    } else {
        StopAimTrainerLoop();
    }
}

function OpenAimTrainerModal() {
    var rootPanel = $.GetContextPanel();
    if (!rootPanel) return;

    PrepareSettingsModalOpen();
    CloseAimTrainerModalIfOpen();

    var overlay = $.CreatePanel("Panel", rootPanel, "ArcadeAimTrainerOverlay");
    overlay.AddClass("ModalOverlay");
    overlay.AddClass("QOLModalOverlay");
    overlay.SetPanelEvent("onactivate", function() {
        CloseAimTrainerModal(overlay);
    });
    $.Schedule(0.01, function() {
        if (overlay && overlay.IsValid && overlay.IsValid()) overlay.AddClass("Show");
    });

    var modalContainer = $.CreatePanel("Panel", overlay, "ArcadeAimTrainerModalContainer");
    modalContainer.AddClass("ArcadeModalContainer");
    modalContainer.AddClass("QOLUnifiedModalSurface");
    modalContainer.SetPanelEvent("onactivate", function() {});

    var closeBtn = $.CreatePanel("Button", modalContainer, "CloseBtn");
    var closeIcon = $.CreatePanel("Label", closeBtn, "");
    closeIcon.text = "X";
    closeBtn.SetPanelEvent("onactivate", function() {
        CloseAimTrainerModal(overlay);
    });

    var header = $.CreatePanel("Label", modalContainer, "");
    header.AddClass("ModalTitle");
    header.AddClass("ArcadeAimTrainerTitle");
    header.text = LocalizeSettingsText("Graves Trainer", true);

    var actionRow = $.CreatePanel("Panel", modalContainer, "ArcadeAimTrainerActionRow");
    actionRow.AddClass("ArcadeAimTrainerActionRow");
    var newRunBtn = $.CreatePanel("Button", actionRow, "ArcadeAimTrainerNewRunBtn");
    newRunBtn.AddClass("ArcadeMinesweeperActionBtn");
    newRunBtn.AddClass("ArcadeAimTrainerControlBtn");
    var newRunLbl = $.CreatePanel("Label", newRunBtn, "");
    newRunLbl.text = LocalizeSettingsText("New Run", true);

    var difficultyButtons = {};
    var difficultyGroup = $.CreatePanel("Panel", actionRow, "ArcadeAimTrainerDifficultyGroup");
    difficultyGroup.AddClass("ArcadeAimTrainerDifficultyGroup");
    for (var i = 0; i < AIM_TRAINER_DIFFICULTIES.length; i++) {
        (function(cfg) {
            var diffBtn = $.CreatePanel("Button", difficultyGroup, "ArcadeAimTrainerDifficulty_" + cfg.id);
            diffBtn.AddClass("ArcadeMinesweeperActionBtn");
            diffBtn.AddClass("ArcadeAimTrainerDifficultyBtn");
            diffBtn.AddClass("ArcadeAimTrainerControlBtn");
            var diffLbl = $.CreatePanel("Label", diffBtn, "");
            diffLbl.text = cfg.label;
            difficultyButtons[cfg.id] = diffBtn;
            diffBtn.SetPanelEvent("onactivate", function() {
                if (!state.active) return;
                ApplyAimTrainerDifficulty(state, cfg.id, true);
            });
        })(AIM_TRAINER_DIFFICULTIES[i]);
    }

    var gameArea = $.CreatePanel("Panel", modalContainer, "ArcadeAimTrainerArea");
    gameArea.AddClass("ArcadeAimTrainerArea");

    var targetBtn = $.CreatePanel("Button", gameArea, "ArcadeAimTrainerTarget");
    targetBtn.AddClass("ArcadeAimTrainerTarget");
    var targetImage = $.CreatePanel("Image", targetBtn, "ArcadeAimTrainerTargetImage");
    targetImage.AddClass("ArcadeAimTrainerTargetImage");
    try { targetImage.SetImage(AIM_TRAINER_TARGET_IMAGE_PATHS[0]); } catch(eInitImage) { WarnLog("settings", "op failed: " + (eInitImage && eInitImage.message ? eInitImage.message : String(eInitImage || ""))); }

    var statusLabel = $.CreatePanel("Label", gameArea, "ArcadeAimTrainerStatusLabel");
    statusLabel.AddClass("ArcadeAimTrainerStatusLabel");
    statusLabel.style.visibility = "collapse";

    var hudRow = $.CreatePanel("Panel", modalContainer, "ArcadeAimTrainerHudRow");
    hudRow.AddClass("ArcadeAimTrainerHudRow");
    var timerLabel = $.CreatePanel("Label", hudRow, "ArcadeAimTimer");
    timerLabel.AddClass("ArcadeAimTrainerStat");
    timerLabel.AddClass("ArcadeAimTrainerStatTime");
    var hitLabel = $.CreatePanel("Label", hudRow, "ArcadeAimHits");
    hitLabel.AddClass("ArcadeAimTrainerStat");
    hitLabel.AddClass("ArcadeAimTrainerStatHits");
    var missLabel = $.CreatePanel("Label", hudRow, "ArcadeAimMisses");
    missLabel.AddClass("ArcadeAimTrainerStat");
    missLabel.AddClass("ArcadeAimTrainerStatMisses");
    var accLabel = $.CreatePanel("Label", hudRow, "ArcadeAimAcc");
    accLabel.AddClass("ArcadeAimTrainerStat");
    accLabel.AddClass("ArcadeAimTrainerStatAccuracy");

    var state = {
        isValid: function() { return overlay && overlay.IsValid && overlay.IsValid(); },
        active: true,
        gameOver: false,
        gameWidth: 640,
        gameHeight: 430,
        statusInset: 40,
        hits: 0,
        misses: 0,
        elapsedSec: 0,
        startSec: Date.now() / 1000.0,
        difficultyId: AIM_TRAINER_DEFAULT_DIFFICULTY,
        difficultyButtons: difficultyButtons,
        durationSec: AIM_TRAINER_DURATION_SEC,
        targetVisible: false,
        pendingSpawn: false,
        targetSpawnSec: 0,
        targetLifeSec: 1.0,
        targetLifeStartSec: 1.05,
        targetLifeEndSec: 0.52,
        targetBaseX: 0,
        targetBaseY: 0,
        targetStartSize: 74,
        targetEndSize: 40,
        timerLabel: timerLabel,
        hitLabel: hitLabel,
        missLabel: missLabel,
        accLabel: accLabel,
        statusLabel: statusLabel,
        targetBtn: targetBtn,
        gameArea: gameArea,
        targetImage: targetImage,
        targetImagePath: AIM_TRAINER_TARGET_IMAGE_PATHS[0]
    };
    gAimTrainerState = state;

    targetBtn.SetPanelEvent("onactivate", function() {
        HandleAimTrainerHit(state);
    });
    newRunBtn.SetPanelEvent("onactivate", function() {
        ResetAimTrainer(state);
    });

    ApplyAimTrainerDifficulty(state, ResolveArcadeDefaultDifficultyId(), true);
}

function StopTrainTrackingLoop() {
    gTrainTrackingLoopToken++;
}

function UpdateTrainTrackingStatus(state, text) {
    if (!state || !state.isValid || !state.isValid()) return;
    if (state.statusLabel && state.statusLabel.IsValid && state.statusLabel.IsValid()) {
        var hasText = !!(text && text.length > 0);
        state.statusLabel.text = hasText ? LocalizeSettingsText(text, true) : "";
        state.statusLabel.style.visibility = hasText ? "visible" : "collapse";
    }
}

function UpdateTrainTrackingHud(state) {
    if (!state || !state.isValid || !state.isValid()) return;
    var attempts = state.hits + state.misses;
    var accuracy = attempts > 0 ? Math.round((state.hits / attempts) * 100) : 0;
    var durationSec = (typeof state.durationSec === "number" && state.durationSec > 0) ? state.durationSec : TRAIN_TRACKING_DURATION_SEC;
    var timeLeft = Math.max(0, durationSec - state.elapsedSec);
    if (state.timerLabel && state.timerLabel.IsValid && state.timerLabel.IsValid()) {
        state.timerLabel.text = LocalizeSettingsText("Time:", true) + " " + timeLeft.toFixed(1) + "s";
    }
    if (state.hitLabel && state.hitLabel.IsValid && state.hitLabel.IsValid()) {
        state.hitLabel.text = LocalizeSettingsText("Hits:", true) + " " + state.hits;
    }
    if (state.missLabel && state.missLabel.IsValid && state.missLabel.IsValid()) {
        state.missLabel.text = LocalizeSettingsText("Misses:", true) + " " + state.misses;
    }
    if (state.accLabel && state.accLabel.IsValid && state.accLabel.IsValid()) {
        state.accLabel.text = LocalizeSettingsText("Accuracy:", true) + " " + accuracy + "%";
    }
    if (state.streakLabel && state.streakLabel.IsValid && state.streakLabel.IsValid()) {
        state.streakLabel.text = LocalizeSettingsText("Streak:", true) + " " + state.streak;
    }
}

function ApplyTrainTrackingDifficulty(state, difficultyId, shouldReset) {
    if (!state || !state.isValid || !state.isValid()) return;
    var cfg = GetTrainTrackingDifficultyById(difficultyId);
    state.difficultyId = cfg.id;
    state.durationSec = TRAIN_TRACKING_DURATION_SEC;
    state.baseSpeed = cfg.baseSpeed;
    state.maxSpeed = cfg.maxSpeed;
    state.speedGainPerScore = cfg.speedGainPerScore;
    state.sampleIntervalSec = cfg.sampleIntervalSec;
    state.jitterTickReset = cfg.jitterTickReset;
    state.targetWidth = cfg.targetSize;
    state.targetHeight = cfg.targetSize;

    if (state.difficultyButtons) {
        for (var i = 0; i < TRAIN_TRACKING_DIFFICULTIES.length; i++) {
            var key = TRAIN_TRACKING_DIFFICULTIES[i].id;
            var btn = state.difficultyButtons[key];
            if (btn && btn.IsValid && btn.IsValid()) {
                btn.SetHasClass("Active", key === cfg.id);
            }
        }
    }

    if (shouldReset) {
        ResetTrainTracking(state);
    } else {
        UpdateTrainTrackingHud(state);
    }
}

function GetTrainTrackingSpeed(state) {
    return Math.sqrt((state.velX * state.velX) + (state.velY * state.velY));
}

function SetTrainTrackingSpeed(state, speed) {
    var mag = GetTrainTrackingSpeed(state);
    if (mag < 0.001) {
        state.velX = speed;
        state.velY = 0;
        return;
    }
    var ratio = speed / mag;
    state.velX *= ratio;
    state.velY *= ratio;
}

function RefreshTrainTrackingBounds(state) {
    if (!state || !state.gameArea || !state.gameArea.IsValid || !state.gameArea.IsValid()) return;
    state.gameWidth = 680;
    state.gameHeight = 500;
}

function RenderTrainTrackingTarget(state) {
    if (!state || !state.targetBtn || !state.targetBtn.IsValid || !state.targetBtn.IsValid()) return;
    state.targetBtn.style.width = Math.round(state.targetWidth) + "px";
    state.targetBtn.style.height = Math.round(state.targetHeight) + "px";
    state.targetBtn.style.x = Math.floor(state.targetX) + "px";
    state.targetBtn.style.y = Math.floor(state.targetY) + "px";
}

function ClearTrainTrackingFlash(state) {
    if (!state || !state.targetBtn || !state.targetBtn.IsValid || !state.targetBtn.IsValid()) return;
    state.targetBtn.RemoveClass("HitFlashSuccess");
    state.targetBtn.RemoveClass("HitFlashFail");
}

function SetTrainTrackingFlash(state, flashClass) {
    if (!state || !state.targetBtn || !state.targetBtn.IsValid || !state.targetBtn.IsValid()) return;
    ClearTrainTrackingFlash(state);
    if (flashClass) state.targetBtn.AddClass(flashClass);
}

function PlayTrainTrackingHitSound() {
    var options = TRAIN_TRACKING_HIT_SOUND_EVENTS;
    if (!Array.isArray(options) || options.length <= 0) return;
    var idx = PickRandomIndexNoImmediateRepeat(options, "train_tracking_hit");
    if (idx < 0 || idx >= options.length) return;
    var eventName = String(options[idx] || "");
    if (!eventName) return;
    PlayArcadeGameSoundEffect(eventName);
}

function EndTrainTracking(state) {
    if (!state || state.gameOver) return;
    state.gameOver = true;
    state.hoveringTarget = false;
    ClearTrainTrackingFlash(state);
    UpdateTrainTrackingHud(state);
    UpdateTrainTrackingStatus(state, "Run complete. Press New Run.");
    StopTrainTrackingLoop();
}

function StepTrainTracking(state, token) {
    if (!state || !state.active || !state.isValid || !state.isValid()) return;
    if (token !== gTrainTrackingLoopToken) return;
    if (state.gameOver) return;

    var nowSec = Date.now() / 1000.0;
    state.elapsedSec = Math.max(0, nowSec - state.startSec);
    var durationSec = (typeof state.durationSec === "number" && state.durationSec > 0) ? state.durationSec : TRAIN_TRACKING_DURATION_SEC;
    if (state.elapsedSec >= durationSec) {
        EndTrainTracking(state);
        return;
    }

    RefreshTrainTrackingBounds(state);

    state.targetX += state.velX;
    state.targetY += state.velY;

    var maxX = state.gameWidth - state.targetWidth;
    var maxY = state.gameHeight - state.targetHeight;
    if (state.targetX <= 0) {
        state.targetX = 0;
        state.velX = Math.abs(state.velX);
    } else if (state.targetX >= maxX) {
        state.targetX = maxX;
        state.velX = -Math.abs(state.velX);
    }
    if (state.targetY <= 0) {
        state.targetY = 0;
        state.velY = Math.abs(state.velY);
    } else if (state.targetY >= maxY) {
        state.targetY = maxY;
        state.velY = -Math.abs(state.velY);
    }

    state.jitterTick--;
    if (state.jitterTick <= 0) {
        state.jitterTick = state.jitterTickReset;
        state.velY += ((Math.random() * 2) - 1) * 0.65;
        if (Math.abs(state.velY) < 0.35) state.velY = state.velY < 0 ? -0.35 : 0.35;
        SetTrainTrackingSpeed(state, Math.min(state.maxSpeed, Math.max(state.baseSpeed, GetTrainTrackingSpeed(state))));
    }

    if (nowSec >= state.nextScoreSampleSec) {
        var nextFlashAllowedSec = Number(state.nextFlashAllowedSec || 0);
        var nextHitSoundAllowedSec = Number(state.nextHitSoundAllowedSec || 0);
        var canPlayFlash = !(isFinite(nextFlashAllowedSec) && nowSec < nextFlashAllowedSec);
        var canPlayHitSound = !(isFinite(nextHitSoundAllowedSec) && nowSec < nextHitSoundAllowedSec);
        if (state.hoveringTarget) {
            state.hits++;
            state.streak++;
            if (state.streak > state.bestStreak) state.bestStreak = state.streak;
            SetTrainTrackingSpeed(state, Math.min(state.maxSpeed, GetTrainTrackingSpeed(state) + state.speedGainPerScore));
            if (canPlayHitSound) {
                PlayTrainTrackingHitSound();
                state.nextHitSoundAllowedSec = nowSec + TRAIN_TRACKING_HIT_SOUND_MIN_INTERVAL_SEC;
            }
            if (canPlayFlash) {
                state.nextFlashAllowedSec = nowSec + TRAIN_TRACKING_FLASH_MIN_INTERVAL_SEC;
                var hitFlashToken = Number(state.flashToken || 0) + 1;
                state.flashToken = hitFlashToken;
                SetTrainTrackingFlash(state, "HitFlashSuccess");
                $.Schedule(TRAIN_TRACKING_HIT_FLASH_SEC, function() {
                    if (!state || !state.active) return;
                    if (Number(state.flashToken || 0) !== hitFlashToken) return;
                    ClearTrainTrackingFlash(state);
                });
            }
        } else {
            state.misses++;
            state.streak = 0;
            if (canPlayFlash) {
                state.nextFlashAllowedSec = nowSec + TRAIN_TRACKING_FLASH_MIN_INTERVAL_SEC;
                var missFlashToken = Number(state.flashToken || 0) + 1;
                state.flashToken = missFlashToken;
                SetTrainTrackingFlash(state, "HitFlashFail");
                $.Schedule(TRAIN_TRACKING_HIT_FLASH_SEC, function() {
                    if (!state || !state.active) return;
                    if (Number(state.flashToken || 0) !== missFlashToken) return;
                    ClearTrainTrackingFlash(state);
                });
            }
        }
        state.nextScoreSampleSec = nowSec + state.sampleIntervalSec;
        UpdateTrainTrackingHud(state);
    }

    RenderTrainTrackingTarget(state);
    UpdateTrainTrackingHud(state);

    $.Schedule(0.033, function() {
        StepTrainTracking(state, token);
    });
}

function ResetTrainTracking(state) {
    if (!state || !state.active) return;
    RefreshTrainTrackingBounds(state);
    state.gameOver = false;
    state.flashToken = Number(state.flashToken || 0) + 1;
    state.hits = 0;
    state.misses = 0;
    state.streak = 0;
    state.elapsedSec = 0;
    state.startSec = Date.now() / 1000.0;
    state.nextFlashAllowedSec = state.startSec;
    state.nextHitSoundAllowedSec = state.startSec;
    state.hoveringTarget = false;

    state.targetX = Math.floor((state.gameWidth - state.targetWidth) * 0.5);
    state.targetY = Math.floor((state.gameHeight - state.targetHeight) * 0.5);
    state.velX = state.baseSpeed;
    state.velY = state.baseSpeed * 0.34;
    state.jitterTick = state.jitterTickReset;
    state.nextScoreSampleSec = state.startSec + state.sampleIntervalSec;

    ClearTrainTrackingFlash(state);
    UpdateTrainTrackingStatus(state, "");
    UpdateTrainTrackingHud(state);
    RenderTrainTrackingTarget(state);

    StopTrainTrackingLoop();
    var token = gTrainTrackingLoopToken;
    StepTrainTracking(state, token);
}

function CloseTrainTrackingModal(overlay) {
    StopTrainTrackingLoop();
    if (gTrainTrackingState) {
        gTrainTrackingState.active = false;
        gTrainTrackingState = null;
    }
    if (overlay && overlay.IsValid && overlay.IsValid()) {
        CloseModal(overlay);
    }
}

function CloseTrainTrackingModalIfOpen() {
    var root = $.GetContextPanel();
    if (!root) return;
    var overlay = root.FindChildTraverse("ArcadeTrainTrackingOverlay");
    if (overlay && overlay.IsValid && overlay.IsValid()) {
        CloseTrainTrackingModal(overlay);
    } else {
        StopTrainTrackingLoop();
    }
}

function OpenTrainTrackingModal() {
    var rootPanel = $.GetContextPanel();
    if (!rootPanel) return;

    PrepareSettingsModalOpen();
    CloseTrainTrackingModalIfOpen();

    var overlay = $.CreatePanel("Panel", rootPanel, "ArcadeTrainTrackingOverlay");
    overlay.AddClass("ModalOverlay");
    overlay.AddClass("QOLModalOverlay");
    overlay.SetPanelEvent("onactivate", function() {
        CloseTrainTrackingModal(overlay);
    });
    $.Schedule(0.01, function() {
        if (overlay && overlay.IsValid && overlay.IsValid()) overlay.AddClass("Show");
    });

    var modalContainer = $.CreatePanel("Panel", overlay, "ArcadeTrainTrackingModalContainer");
    modalContainer.AddClass("ArcadeModalContainer");
    modalContainer.AddClass("QOLUnifiedModalSurface");
    modalContainer.SetPanelEvent("onactivate", function() {});

    var closeBtn = $.CreatePanel("Button", modalContainer, "CloseBtn");
    var closeIcon = $.CreatePanel("Label", closeBtn, "");
    closeIcon.text = "X";
    closeBtn.SetPanelEvent("onactivate", function() {
        CloseTrainTrackingModal(overlay);
    });

    var header = $.CreatePanel("Label", modalContainer, "");
    header.AddClass("ModalTitle");
    header.AddClass("ArcadeTrainTrackingTitle");
    header.text = LocalizeSettingsText("Zerggy Mania", true);

    var actionRow = $.CreatePanel("Panel", modalContainer, "ArcadeTrainTrackingActionRow");
    actionRow.AddClass("ArcadeTrainTrackingActionRow");
    var newRunBtn = $.CreatePanel("Button", actionRow, "ArcadeTrainTrackingNewRunBtn");
    newRunBtn.AddClass("ArcadeMinesweeperActionBtn");
    newRunBtn.AddClass("ArcadeTrainTrackingControlBtn");
    var newRunLbl = $.CreatePanel("Label", newRunBtn, "");
    newRunLbl.text = LocalizeSettingsText("New Run", true);

    var difficultyButtons = {};
    var difficultyGroup = $.CreatePanel("Panel", actionRow, "ArcadeTrainTrackingDifficultyGroup");
    difficultyGroup.AddClass("ArcadeTrainTrackingDifficultyGroup");
    for (var i = 0; i < TRAIN_TRACKING_DIFFICULTIES.length; i++) {
        (function(cfg) {
            var diffBtn = $.CreatePanel("Button", difficultyGroup, "ArcadeTrainTrackingDifficulty_" + cfg.id);
            diffBtn.AddClass("ArcadeMinesweeperActionBtn");
            diffBtn.AddClass("ArcadeTrainTrackingDifficultyBtn");
            diffBtn.AddClass("ArcadeTrainTrackingControlBtn");
            var diffLbl = $.CreatePanel("Label", diffBtn, "");
            diffLbl.text = cfg.label;
            difficultyButtons[cfg.id] = diffBtn;
            diffBtn.SetPanelEvent("onactivate", function() {
                if (!state.active) return;
                ApplyTrainTrackingDifficulty(state, cfg.id, true);
            });
        })(TRAIN_TRACKING_DIFFICULTIES[i]);
    }

    var gameArea = $.CreatePanel("Panel", modalContainer, "ArcadeTrainTrackingArea");
    gameArea.AddClass("ArcadeTrainTrackingArea");

    var targetBtn = $.CreatePanel("Button", gameArea, "ArcadeTrainTrackingTarget");
    targetBtn.AddClass("ArcadeTrainTrackingTarget");
    var targetImage = $.CreatePanel("Image", targetBtn, "ArcadeTrainTrackingTargetImage");
    targetImage.AddClass("ArcadeTrainTrackingTargetImage");
    try { targetImage.SetImage(TRAIN_TRACKING_TARGET_IMAGE_SRC); } catch(eTrainImg) { WarnLog("settings", "op failed: " + (eTrainImg && eTrainImg.message ? eTrainImg.message : String(eTrainImg || ""))); }

    var statusLabel = $.CreatePanel("Label", gameArea, "ArcadeTrainTrackingStatusLabel");
    statusLabel.AddClass("ArcadeTrainTrackingStatusLabel");
    statusLabel.style.visibility = "collapse";

    var hudRow = $.CreatePanel("Panel", modalContainer, "ArcadeTrainTrackingHudRow");
    hudRow.AddClass("ArcadeTrainTrackingHudRow");
    var timerLabel = $.CreatePanel("Label", hudRow, "ArcadeTrainTrackingTime");
    timerLabel.AddClass("ArcadeTrainTrackingStat");
    timerLabel.AddClass("ArcadeTrainTrackingStatTime");
    var hitLabel = $.CreatePanel("Label", hudRow, "ArcadeTrainTrackingHits");
    hitLabel.AddClass("ArcadeTrainTrackingStat");
    hitLabel.AddClass("ArcadeTrainTrackingStatHits");
    var missLabel = $.CreatePanel("Label", hudRow, "ArcadeTrainTrackingMisses");
    missLabel.AddClass("ArcadeTrainTrackingStat");
    missLabel.AddClass("ArcadeTrainTrackingStatMisses");
    var accLabel = $.CreatePanel("Label", hudRow, "ArcadeTrainTrackingAcc");
    accLabel.AddClass("ArcadeTrainTrackingStat");
    accLabel.AddClass("ArcadeTrainTrackingStatAccuracy");
    var streakLabel = $.CreatePanel("Label", hudRow, "ArcadeTrainTrackingStreak");
    streakLabel.AddClass("ArcadeTrainTrackingStat");
    streakLabel.AddClass("ArcadeTrainTrackingStatStreak");

    var state = {
        isValid: function() { return overlay && overlay.IsValid && overlay.IsValid(); },
        active: true,
        gameOver: false,
        gameWidth: 640,
        gameHeight: 430,
        difficultyId: TRAIN_TRACKING_DEFAULT_DIFFICULTY,
        difficultyButtons: difficultyButtons,
        durationSec: TRAIN_TRACKING_DURATION_SEC,
        targetWidth: 84,
        targetHeight: 84,
        targetX: 0,
        targetY: 0,
        velX: 7.4,
        velY: 2.4,
        baseSpeed: 7.4,
        maxSpeed: 13.6,
        speedGainPerScore: 0.22,
        sampleIntervalSec: 0.10,
        nextScoreSampleSec: 0,
        hoveringTarget: false,
        flashToken: 0,
        nextFlashAllowedSec: 0,
        nextHitSoundAllowedSec: 0,
        jitterTickReset: 13,
        jitterTick: 13,
        hits: 0,
        misses: 0,
        streak: 0,
        bestStreak: 0,
        elapsedSec: 0,
        startSec: Date.now() / 1000.0,
        timerLabel: timerLabel,
        hitLabel: hitLabel,
        missLabel: missLabel,
        accLabel: accLabel,
        streakLabel: streakLabel,
        statusLabel: statusLabel,
        targetBtn: targetBtn,
        targetImage: targetImage,
        gameArea: gameArea
    };
    gTrainTrackingState = state;

    targetBtn.SetPanelEvent("onmouseover", function() {
        state.hoveringTarget = true;
    });
    targetBtn.SetPanelEvent("onmouseout", function() {
        state.hoveringTarget = false;
    });
    newRunBtn.SetPanelEvent("onactivate", function() {
        ResetTrainTracking(state);
    });

    ApplyTrainTrackingDifficulty(state, ResolveArcadeDefaultDifficultyId(), true);
}

function StopWhackRemLoop() {
    gWhackRemLoopToken++;
}

function GetWhackRemDifficultyById(difficultyId) {
    var wanted = String(difficultyId || "");
    for (var i = 0; i < WHACK_A_REM_DIFFICULTIES.length; i++) {
        var cfg = WHACK_A_REM_DIFFICULTIES[i];
        if (cfg.id === wanted) return cfg;
    }
    return WHACK_A_REM_DIFFICULTIES[0];
}

function ApplyWhackRemDifficulty(state, difficultyId, shouldReset) {
    if (!state || !state.isValid || !state.isValid()) return;
    var cfg = GetWhackRemDifficultyById(difficultyId);
    state.difficultyId = cfg.id;
    state.maxConcurrent = cfg.maxConcurrent;
    state.lifeStartSec = cfg.lifeStartSec;
    state.lifeEndSec = cfg.lifeEndSec;
    state.spawnDelaySec = cfg.spawnDelaySec;

    if (state.difficultyButtons) {
        for (var i = 0; i < WHACK_A_REM_DIFFICULTIES.length; i++) {
            var key = WHACK_A_REM_DIFFICULTIES[i].id;
            var btn = state.difficultyButtons[key];
            if (btn && btn.IsValid && btn.IsValid()) {
                btn.SetHasClass("Active", key === cfg.id);
            }
        }
    }

    if (shouldReset) {
        ResetWhackRem(state);
    } else {
        UpdateWhackRemHud(state);
    }
}

function UpdateWhackRemStatus(state, text) {
    if (!state || !state.isValid || !state.isValid()) return;
    if (state.statusLabel && state.statusLabel.IsValid && state.statusLabel.IsValid()) {
        var hasText = !!(text && String(text).length > 0);
        state.statusLabel.text = hasText ? LocalizeSettingsText(String(text), true) : "";
        state.statusLabel.style.visibility = hasText ? "visible" : "collapse";
    }
}

function UpdateWhackRemHud(state) {
    if (!state || !state.isValid || !state.isValid()) return;
    var attempts = state.hits + state.misses;
    var accuracy = attempts > 0 ? Math.round((state.hits / attempts) * 100) : 0;
    var durationSec = (typeof state.durationSec === "number" && state.durationSec > 0) ? state.durationSec : WHACK_A_REM_DURATION_SEC;
    if (state.timerLabel && state.timerLabel.IsValid && state.timerLabel.IsValid()) {
        var timeLeft = Math.max(0, durationSec - state.elapsedSec);
        state.timerLabel.text = LocalizeSettingsText("Time:", true) + " " + timeLeft.toFixed(1) + "s";
    }
    if (state.hitLabel && state.hitLabel.IsValid && state.hitLabel.IsValid()) {
        state.hitLabel.text = LocalizeSettingsText("Hits:", true) + " " + state.hits;
    }
    if (state.missLabel && state.missLabel.IsValid && state.missLabel.IsValid()) {
        state.missLabel.text = LocalizeSettingsText("Misses:", true) + " " + state.misses;
    }
    if (state.accLabel && state.accLabel.IsValid && state.accLabel.IsValid()) {
        state.accLabel.text = LocalizeSettingsText("Accuracy:", true) + " " + accuracy + "%";
    }
    if (state.streakLabel && state.streakLabel.IsValid && state.streakLabel.IsValid()) {
        state.streakLabel.text = LocalizeSettingsText("Streak:", true) + " " + state.streak;
    }
}

function GetWhackRemVisibleCount(state) {
    if (!state || !Array.isArray(state.slots)) return 0;
    var count = 0;
    for (var i = 0; i < state.slots.length; i++) {
        var slot = state.slots[i];
        if (!slot) continue;
        if (slot.visible || slot.flashActive) count++;
    }
    return count;
}

function BuildWhackRemUsedHoleMap(state) {
    var used = {};
    if (!state || !Array.isArray(state.slots)) return used;
    for (var i = 0; i < state.slots.length; i++) {
        var slot = state.slots[i];
        if (!slot) continue;
        if (!(slot.visible || slot.flashActive)) continue;
        var hi = Number(slot.holeIndex);
        if (isFinite(hi) && hi >= 0) used[hi] = true;
    }
    return used;
}

function GetWhackRemSlot(state, slotIndex) {
    if (!state || !Array.isArray(state.slots)) return null;
    var idx = Number(slotIndex);
    if (!isFinite(idx)) return null;
    idx = Math.floor(idx);
    if (idx < 0 || idx >= state.slots.length) return null;
    return state.slots[idx] || null;
}

function RefreshWhackRemBounds(state) {
    if (!state || !state.gameArea || !state.gameArea.IsValid || !state.gameArea.IsValid()) return;
    var nextWidth = 680;
    var nextHeight = 500;
    state.gameWidth = nextWidth;
    state.gameHeight = nextHeight;

    var cols = 3;
    var rows = 3;
    var padX = Math.floor(nextWidth * 0.13);
    var padY = Math.floor(nextHeight * 0.15);
    var spanX = Math.max(1, nextWidth - (padX * 2));
    var spanY = Math.max(1, nextHeight - (padY * 2));
    var holeSize = Math.max(68, Math.min(128, Math.floor(Math.min(spanX / cols, spanY / rows) * 0.65)));

    state.holes = [];
    var idx = 0;
    for (var r = 0; r < rows; r++) {
        for (var c = 0; c < cols; c++) {
            var centerX = Math.floor(padX + ((c + 0.5) * (spanX / cols)));
            var centerY = Math.floor(padY + ((r + 0.5) * (spanY / rows)));
            var x = centerX - Math.floor(holeSize * 0.5);
            var y = centerY - Math.floor(holeSize * 0.5);
            state.holes.push({
                x: x,
                y: y,
                size: holeSize
            });
            var holePanel = state.holePanels && state.holePanels[idx];
            if (holePanel && holePanel.IsValid && holePanel.IsValid()) {
                holePanel.style.x = x + "px";
                holePanel.style.y = y + "px";
                holePanel.style.width = holeSize + "px";
                holePanel.style.height = holeSize + "px";
            }
            idx++;
        }
    }
}

function SetWhackRemTargetVisible(state, slotIndex, visible) {
    var slot = GetWhackRemSlot(state, slotIndex);
    if (!slot || !slot.btn || !slot.btn.IsValid || !slot.btn.IsValid()) return;
    if (!visible || slot.holeIndex < 0 || !state.holes || slot.holeIndex >= state.holes.length) {
        slot.btn.style.visibility = "collapse";
        return;
    }
    var hole = state.holes[slot.holeIndex];
    slot.btn.style.x = hole.x + "px";
    slot.btn.style.y = hole.y + "px";
    slot.btn.style.width = hole.size + "px";
    slot.btn.style.height = hole.size + "px";
    slot.btn.style.visibility = "visible";
}

function ClearWhackRemSlotFlash(slot) {
    if (!slot || !slot.btn || !slot.btn.IsValid || !slot.btn.IsValid()) return;
    slot.btn.RemoveClass("HitFlashSuccess");
    slot.btn.RemoveClass("HitFlashFail");
}

function SetWhackRemSlotFlash(slot, flashClass) {
    if (!slot || !slot.btn || !slot.btn.IsValid || !slot.btn.IsValid()) return;
    ClearWhackRemSlotFlash(slot);
    if (flashClass) slot.btn.AddClass(flashClass);
}

function SpawnWhackRemTarget(state, slotIndex, nowSec) {
    if (!state || !state.active || state.gameOver) return false;
    var slot = GetWhackRemSlot(state, slotIndex);
    if (!slot || slot.flashActive) return false;
    RefreshWhackRemBounds(state);
    if (!state.holes || state.holes.length <= 0) return false;
    var used = BuildWhackRemUsedHoleMap(state);
    var candidates = [];
    for (var iHole = 0; iHole < state.holes.length; iHole++) {
        if (!used[iHole]) candidates.push(iHole);
    }
    if (candidates.length <= 0) return false;
    var idx = candidates[Math.floor(Math.random() * candidates.length)];
    if (!isFinite(idx)) idx = candidates[0];

    var durationSec = (typeof state.durationSec === "number" && state.durationSec > 0) ? state.durationSec : WHACK_A_REM_DURATION_SEC;
    var speedScale = Math.min(1, Math.max(0, state.elapsedSec / durationSec));
    var lifeStart = Number(state.lifeStartSec);
    var lifeEnd = Number(state.lifeEndSec);
    if (!isFinite(lifeStart)) lifeStart = 0.95;
    if (!isFinite(lifeEnd)) lifeEnd = 0.45;

    slot.holeIndex = idx;
    slot.visible = true;
    slot.flashActive = false;
    slot.expireSec = nowSec + Math.max(0.22, (lifeStart + ((lifeEnd - lifeStart) * speedScale)));
    slot.flashToken = Number(slot.flashToken || 0) + 1;
    ClearWhackRemSlotFlash(slot);
    SetWhackRemTargetVisible(state, slotIndex, true);
    return true;
}

function PlayWhackRemHitSound() {
    var options = WHACK_A_REM_HIT_SOUND_EVENTS;
    if (!Array.isArray(options) || options.length <= 0) return;
    var idx = PickRandomIndexNoImmediateRepeat(options, "whack_rem_hit");
    if (idx < 0 || idx >= options.length) return;
    var eventName = String(options[idx] || "");
    if (!eventName) return;
    PlayArcadeGameSoundEffect(eventName);
}

function PlayWhackRemMissSound() {
    var options = WHACK_A_REM_MISS_SOUND_EVENTS;
    if (!Array.isArray(options) || options.length <= 0) return;
    var idx = PickRandomIndexNoImmediateRepeat(options, "whack_rem_miss");
    if (idx < 0 || idx >= options.length) return;
    var eventName = String(options[idx] || "");
    if (!eventName) return;
    PlayArcadeGameSoundEffect(eventName);
}

function GetWhackRemMissCandidateSlotIndex(state) {
    if (!state || !Array.isArray(state.slots)) return -1;
    var bestIdx = -1;
    var bestExpire = Number.POSITIVE_INFINITY;
    for (var i = 0; i < state.slots.length; i++) {
        var slot = state.slots[i];
        if (!slot || !slot.visible) continue;
        var exp = Number(slot.expireSec);
        if (!isFinite(exp)) exp = Number.POSITIVE_INFINITY;
        if (exp < bestExpire) {
            bestExpire = exp;
            bestIdx = i;
        }
    }
    return bestIdx;
}

function HandleWhackRemHit(state, slotIndex) {
    var slot = GetWhackRemSlot(state, slotIndex);
    if (!state || !state.active || state.gameOver || !slot || !slot.visible) return;
    state.hits++;
    state.streak++;
    var nowMs = Date.now();
    state.lastHitMs = nowMs;
    PlayWhackRemHitSound();
    var flashToken = Number(slot.flashToken || 0) + 1;
    slot.flashToken = flashToken;
    slot.visible = false;
    slot.flashActive = true;
    SetWhackRemSlotFlash(slot, "HitFlashSuccess");
    slot.nextSpawnSec = (nowMs / 1000.0) + Math.max(0.08, Number(state.spawnDelaySec || 0.12));
    UpdateWhackRemHud(state);
    $.Schedule(WHACK_A_REM_HIT_FLASH_SEC, function() {
        if (!state || !state.active || state.gameOver) return;
        var slotAfter = GetWhackRemSlot(state, slotIndex);
        if (!slotAfter) return;
        if (Number(slotAfter.flashToken || 0) !== flashToken) return;
        slotAfter.flashActive = false;
        ClearWhackRemSlotFlash(slotAfter);
        SetWhackRemTargetVisible(state, slotIndex, false);
    });
}

function HandleWhackRemMiss(state, slotIndex) {
    if (!state || !state.active || state.gameOver) return;
    var resolvedSlotIndex = Number(slotIndex);
    if (!isFinite(resolvedSlotIndex) || resolvedSlotIndex < 0) {
        resolvedSlotIndex = GetWhackRemMissCandidateSlotIndex(state);
    }
    var slot = GetWhackRemSlot(state, resolvedSlotIndex);
    if (!slot || !slot.visible) return;
    state.misses++;
    state.streak = 0;
    PlayWhackRemMissSound();
    var nowMs = Date.now();
    var flashToken = Number(slot.flashToken || 0) + 1;
    slot.flashToken = flashToken;
    slot.visible = false;
    slot.flashActive = true;
    SetWhackRemSlotFlash(slot, "HitFlashFail");
    slot.nextSpawnSec = (nowMs / 1000.0) + Math.max(0.20, Number(state.spawnDelaySec || 0.12) + 0.05);
    UpdateWhackRemHud(state);
    $.Schedule(WHACK_A_REM_HIT_FLASH_SEC, function() {
        if (!state || !state.active || state.gameOver) return;
        var slotAfter = GetWhackRemSlot(state, resolvedSlotIndex);
        if (!slotAfter) return;
        if (Number(slotAfter.flashToken || 0) !== flashToken) return;
        slotAfter.flashActive = false;
        ClearWhackRemSlotFlash(slotAfter);
        SetWhackRemTargetVisible(state, resolvedSlotIndex, false);
    });
}

function EndWhackRem(state) {
    if (!state || state.gameOver) return;
    state.gameOver = true;
    if (Array.isArray(state.slots)) {
        for (var i = 0; i < state.slots.length; i++) {
            var slot = state.slots[i];
            if (!slot) continue;
            slot.visible = false;
            slot.flashActive = false;
            slot.flashToken = Number(slot.flashToken || 0) + 1;
            ClearWhackRemSlotFlash(slot);
            SetWhackRemTargetVisible(state, i, false);
        }
    }
    UpdateWhackRemHud(state);
    UpdateWhackRemStatus(state, "Run complete. Press New Run.");
    StopWhackRemLoop();
}

function StepWhackRem(state, token) {
    if (!state || !state.active || !state.isValid || !state.isValid()) return;
    if (token !== gWhackRemLoopToken) return;
    if (state.gameOver) return;

    var nowSec = Date.now() / 1000.0;
    state.elapsedSec = Math.max(0, nowSec - state.startSec);
    var durationSec = (typeof state.durationSec === "number" && state.durationSec > 0) ? state.durationSec : WHACK_A_REM_DURATION_SEC;
    if (state.elapsedSec >= durationSec) {
        EndWhackRem(state);
        return;
    }

    RefreshWhackRemBounds(state);
    if (Array.isArray(state.slots)) {
        for (var i = 0; i < state.slots.length; i++) {
            var slot = state.slots[i];
            if (!slot || !slot.visible) continue;
            if (nowSec >= Number(slot.expireSec || 0)) {
                HandleWhackRemMiss(state, i);
            }
        }
    }
    var maxConcurrent = Number(state.maxConcurrent);
    if (!isFinite(maxConcurrent) || maxConcurrent < 1) maxConcurrent = 1;
    if (maxConcurrent > WHACK_A_REM_MAX_TARGETS) maxConcurrent = WHACK_A_REM_MAX_TARGETS;
    if (Array.isArray(state.slots)) {
        var visibleCount = GetWhackRemVisibleCount(state);
        for (var iSpawn = 0; iSpawn < state.slots.length && visibleCount < maxConcurrent; iSpawn++) {
            var spawnSlot = state.slots[iSpawn];
            if (!spawnSlot || spawnSlot.visible || spawnSlot.flashActive) continue;
            if (nowSec < Number(spawnSlot.nextSpawnSec || 0)) continue;
            if (SpawnWhackRemTarget(state, iSpawn, nowSec)) {
                visibleCount++;
            }
        }
    }
    UpdateWhackRemHud(state);

    $.Schedule(0.033, function() {
        StepWhackRem(state, token);
    });
}

function ResetWhackRem(state) {
    if (!state || !state.active) return;
    RefreshWhackRemBounds(state);
    state.gameOver = false;
    state.hits = 0;
    state.misses = 0;
    state.streak = 0;
    state.elapsedSec = 0;
    state.startSec = Date.now() / 1000.0;
    state.lastHitMs = 0;
    if (Array.isArray(state.slots)) {
        for (var i = 0; i < state.slots.length; i++) {
            var slot = state.slots[i];
            if (!slot) continue;
            slot.visible = false;
            slot.flashActive = false;
            slot.holeIndex = -1;
            slot.expireSec = 0;
            slot.flashToken = Number(slot.flashToken || 0) + 1;
            slot.nextSpawnSec = state.startSec + 0.30 + (i * 0.05);
            ClearWhackRemSlotFlash(slot);
            SetWhackRemTargetVisible(state, i, false);
        }
    }
    UpdateWhackRemStatus(state, "");
    UpdateWhackRemHud(state);

    StopWhackRemLoop();
    var token = gWhackRemLoopToken;
    StepWhackRem(state, token);
}

function CloseWhackRemModal(overlay) {
    StopWhackRemLoop();
    if (gWhackRemState) {
        gWhackRemState.active = false;
        gWhackRemState = null;
    }
    if (overlay && overlay.IsValid && overlay.IsValid()) {
        CloseModal(overlay);
    }
}

function CloseWhackRemModalIfOpen() {
    var root = $.GetContextPanel();
    if (!root) return;
    var overlay = root.FindChildTraverse("ArcadeWhackRemOverlay");
    if (overlay && overlay.IsValid && overlay.IsValid()) {
        CloseWhackRemModal(overlay);
    } else {
        StopWhackRemLoop();
    }
}

function OpenWhackRemModal() {
    var rootPanel = $.GetContextPanel();
    if (!rootPanel) return;

    PrepareSettingsModalOpen();
    CloseWhackRemModalIfOpen();

    var overlay = $.CreatePanel("Panel", rootPanel, "ArcadeWhackRemOverlay");
    overlay.AddClass("ModalOverlay");
    overlay.AddClass("QOLModalOverlay");
    overlay.SetPanelEvent("onactivate", function() {
        CloseWhackRemModal(overlay);
    });
    $.Schedule(0.01, function() {
        if (overlay && overlay.IsValid && overlay.IsValid()) overlay.AddClass("Show");
    });

    var modalContainer = $.CreatePanel("Panel", overlay, "ArcadeWhackRemModalContainer");
    modalContainer.AddClass("ArcadeModalContainer");
    modalContainer.AddClass("QOLUnifiedModalSurface");
    modalContainer.SetPanelEvent("onactivate", function() {});

    var closeBtn = $.CreatePanel("Button", modalContainer, "CloseBtn");
    var closeIcon = $.CreatePanel("Label", closeBtn, "");
    closeIcon.text = "X";
    closeBtn.SetPanelEvent("onactivate", function() {
        CloseWhackRemModal(overlay);
    });

    var header = $.CreatePanel("Label", modalContainer, "");
    header.AddClass("ModalTitle");
    header.AddClass("ArcadeWhackRemTitle");
    header.text = LocalizeSettingsText("Whack a Rem", true);

    var actionRow = $.CreatePanel("Panel", modalContainer, "ArcadeWhackRemActionRow");
    actionRow.AddClass("ArcadeWhackRemActionRow");
    var newRunBtn = $.CreatePanel("Button", actionRow, "ArcadeWhackRemNewRunBtn");
    newRunBtn.AddClass("ArcadeMinesweeperActionBtn");
    newRunBtn.AddClass("ArcadeWhackRemControlBtn");
    var newRunLbl = $.CreatePanel("Label", newRunBtn, "");
    newRunLbl.text = LocalizeSettingsText("New Run", true);
    var difficultyGroup = $.CreatePanel("Panel", actionRow, "ArcadeWhackRemDifficultyGroup");
    difficultyGroup.AddClass("ArcadeAimTrainerDifficultyGroup");
    var difficultyButtons = {};
    (function() {
        for (var i = 0; i < WHACK_A_REM_DIFFICULTIES.length; i++) {
            (function(cfg) {
                var diffBtn = $.CreatePanel("Button", difficultyGroup, "ArcadeWhackRemDifficulty_" + cfg.id);
                diffBtn.AddClass("ArcadeMinesweeperActionBtn");
                diffBtn.AddClass("ArcadeAimTrainerDifficultyBtn");
                diffBtn.AddClass("ArcadeWhackRemControlBtn");
                var diffLbl = $.CreatePanel("Label", diffBtn, "");
                diffLbl.text = cfg.label;
                difficultyButtons[cfg.id] = diffBtn;
                diffBtn.SetPanelEvent("onactivate", function() {
                    ApplyWhackRemDifficulty(state, cfg.id, true);
                });
            })(WHACK_A_REM_DIFFICULTIES[i]);
        }
    })();

    var gameArea = $.CreatePanel("Panel", modalContainer, "ArcadeWhackRemArea");
    gameArea.AddClass("ArcadeWhackRemArea");

    var holeLayer = $.CreatePanel("Panel", gameArea, "ArcadeWhackRemHoleLayer");
    holeLayer.AddClass("ArcadeWhackRemHoleLayer");
    var holePanels = [];
    for (var hi = 0; hi < 9; hi++) {
        var hole = $.CreatePanel("Panel", holeLayer, "ArcadeWhackRemHole_" + String(hi));
        hole.AddClass("ArcadeWhackRemHole");
        holePanels.push(hole);
    }

    var targetButtons = [];
    var targetImages = [];
    for (var t = 0; t < WHACK_A_REM_MAX_TARGETS; t++) {
        var targetBtn = $.CreatePanel("Button", gameArea, "ArcadeWhackRemTarget_" + String(t));
        targetBtn.AddClass("ArcadeWhackRemTarget");
        var targetImage = $.CreatePanel("Image", targetBtn, "ArcadeWhackRemTargetImage_" + String(t));
        targetImage.AddClass("ArcadeWhackRemTargetImage");
        try { targetImage.SetImage(WHACK_A_REM_TARGET_IMAGE_SRC); } catch(eRemImg) { WarnLog("settings", "op failed: " + (eRemImg && eRemImg.message ? eRemImg.message : String(eRemImg || ""))); }
        targetButtons.push(targetBtn);
        targetImages.push(targetImage);
    }

    var statusLabel = $.CreatePanel("Label", gameArea, "ArcadeWhackRemStatusLabel");
    statusLabel.AddClass("ArcadeWhackRemStatusLabel");
    statusLabel.style.visibility = "collapse";

    var hudRow = $.CreatePanel("Panel", modalContainer, "ArcadeWhackRemHudRow");
    hudRow.AddClass("ArcadeWhackRemHudRow");
    var timerLabel = $.CreatePanel("Label", hudRow, "ArcadeWhackRemTime");
    timerLabel.AddClass("ArcadeWhackRemStat");
    timerLabel.AddClass("ArcadeWhackRemStatTime");
    var hitLabel = $.CreatePanel("Label", hudRow, "ArcadeWhackRemHits");
    hitLabel.AddClass("ArcadeWhackRemStat");
    hitLabel.AddClass("ArcadeWhackRemStatHits");
    var missLabel = $.CreatePanel("Label", hudRow, "ArcadeWhackRemMisses");
    missLabel.AddClass("ArcadeWhackRemStat");
    missLabel.AddClass("ArcadeWhackRemStatMisses");
    var accLabel = $.CreatePanel("Label", hudRow, "ArcadeWhackRemAccuracy");
    accLabel.AddClass("ArcadeWhackRemStat");
    accLabel.AddClass("ArcadeWhackRemStatAccuracy");
    var streakLabel = $.CreatePanel("Label", hudRow, "ArcadeWhackRemStreak");
    streakLabel.AddClass("ArcadeWhackRemStat");
    streakLabel.AddClass("ArcadeWhackRemStatStreak");

    var state = {
        isValid: function() { return overlay && overlay.IsValid && overlay.IsValid(); },
        active: true,
        gameOver: false,
        durationSec: WHACK_A_REM_DURATION_SEC,
        gameWidth: 640,
        gameHeight: 430,
        holes: [],
        holePanels: holePanels,
        hits: 0,
        misses: 0,
        streak: 0,
        elapsedSec: 0,
        startSec: Date.now() / 1000.0,
        difficultyId: WHACK_A_REM_DEFAULT_DIFFICULTY,
        difficultyButtons: difficultyButtons,
        maxConcurrent: 2,
        lifeStartSec: 0.98,
        lifeEndSec: 0.50,
        spawnDelaySec: 0.17,
        lastHitMs: 0,
        timerLabel: timerLabel,
        hitLabel: hitLabel,
        missLabel: missLabel,
        accLabel: accLabel,
        streakLabel: streakLabel,
        statusLabel: statusLabel,
        slots: [],
        gameArea: gameArea
    };
    for (var si = 0; si < WHACK_A_REM_MAX_TARGETS; si++) {
        state.slots.push({
            btn: targetButtons[si],
            image: targetImages[si],
            visible: false,
            flashActive: false,
            holeIndex: -1,
            expireSec: 0,
            nextSpawnSec: 0,
            flashToken: 0
        });
    }
    gWhackRemState = state;

    for (var siEvent = 0; siEvent < WHACK_A_REM_MAX_TARGETS; siEvent++) {
        (function(slotIdx) {
            var slotBtn = targetButtons[slotIdx];
            if (!slotBtn || !slotBtn.SetPanelEvent) return;
            slotBtn.SetPanelEvent("onactivate", function() {
                HandleWhackRemHit(state, slotIdx);
            });
        })(siEvent);
    }
    gameArea.SetPanelEvent("onactivate", function() {
        if (!state.active || state.gameOver || GetWhackRemVisibleCount(state) <= 0) return;
        var nowMs = Date.now();
        if ((nowMs - state.lastHitMs) < 80) return;
        HandleWhackRemMiss(state, -1);
    });
    newRunBtn.SetPanelEvent("onactivate", function() {
        ResetWhackRem(state);
    });

    ApplyWhackRemDifficulty(state, ResolveArcadeDefaultDifficultyId(), true);
}

const BLACKJACK_RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const BLACKJACK_SUITS = ["S", "H", "D", "C"];

function CreateBlackjackDeck() {
    var deck = [];
    for (var s = 0; s < BLACKJACK_SUITS.length; s++) {
        for (var r = 0; r < BLACKJACK_RANKS.length; r++) {
            deck.push({
                rank: BLACKJACK_RANKS[r],
                suit: BLACKJACK_SUITS[s]
            });
        }
    }
    for (var i = deck.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var temp = deck[i];
        deck[i] = deck[j];
        deck[j] = temp;
    }
    return deck;
}

function GetBlackjackCardValue(card) {
    if (!card || !card.rank) return 0;
    var rank = String(card.rank);
    if (rank === "A") return 11;
    if (rank === "K" || rank === "Q" || rank === "J") return 10;
    var n = Number(rank);
    return isFinite(n) ? n : 0;
}

function GetBlackjackHandTotal(hand) {
    var cards = Array.isArray(hand) ? hand : [];
    var total = 0;
    var acesAsEleven = 0;
    for (var i = 0; i < cards.length; i++) {
        var card = cards[i];
        total += GetBlackjackCardValue(card);
        if (card && card.rank === "A") {
            acesAsEleven++;
        }
    }
    while (total > 21 && acesAsEleven > 0) {
        total -= 10;
        acesAsEleven--;
    }
    return {
        total: total,
        soft: acesAsEleven > 0
    };
}

function DrawBlackjackCard(state) {
    if (!state) return null;
    if (!Array.isArray(state.deck) || state.deck.length <= 0) {
        state.deck = CreateBlackjackDeck();
    }
    if (state.deck.length <= 0) return null;
    return state.deck.pop();
}

function FormatBlackjackCard(card) {
    if (!card || !card.rank || !card.suit) return "??";
    return String(card.rank) + String(card.suit);
}

function GetBlackjackSuitGlyph(suit) {
    var key = String(suit || "");
    if (key === "H") return "?";
    if (key === "D") return "?";
    if (key === "C") return "?";
    if (key === "S") return "?";
    return "?";
}

function ClearPanelChildren(panel) {
    if (!panel || !panel.IsValid || !panel.IsValid()) return;
    if (typeof panel.RemoveAndDeleteChildren === "function") {
        panel.RemoveAndDeleteChildren();
        return;
    }
    var count = (panel.GetChildCount && isFinite(Number(panel.GetChildCount()))) ? Number(panel.GetChildCount()) : 0;
    for (var i = count - 1; i >= 0; i--) {
        var child = panel.GetChild ? panel.GetChild(i) : null;
        if (!child) continue;
        child.DeleteAsync(0);
    }
}

function CreateBlackjackCardPanel(parent, card, isHidden) {
    if (!parent || !parent.IsValid || !parent.IsValid()) return;
    var cardPanel = $.CreatePanel("Panel", parent, "");
    cardPanel.AddClass("ArcadeBlackjackCard");

    if (isHidden === true) {
        cardPanel.AddClass("Hidden");
        var hiddenText = $.CreatePanel("Label", cardPanel, "");
        hiddenText.AddClass("ArcadeBlackjackCardBack");
        hiddenText.text = "?";
        return;
    }

    var rank = (card && card.rank) ? String(card.rank) : "?";
    var suit = (card && card.suit) ? String(card.suit) : "?";
    var suitGlyph = GetBlackjackSuitGlyph(suit);

    if (suit === "H") cardPanel.AddClass("SuitHeart");
    else if (suit === "D") cardPanel.AddClass("SuitDiamond");
    else if (suit === "C") cardPanel.AddClass("SuitClub");
    else cardPanel.AddClass("SuitSpade");

    var topLeft = $.CreatePanel("Label", cardPanel, "");
    topLeft.AddClass("ArcadeBlackjackCardCorner");
    topLeft.AddClass("TopLeft");
    topLeft.text = suitGlyph;

    var center = $.CreatePanel("Label", cardPanel, "");
    center.AddClass("ArcadeBlackjackCardCenter");
    center.text = rank;

    var bottomRight = $.CreatePanel("Label", cardPanel, "");
    bottomRight.AddClass("ArcadeBlackjackCardCorner");
    bottomRight.AddClass("BottomRight");
    bottomRight.text = suitGlyph;
}

function RenderBlackjackCardsToContainer(container, hand, hideSecondCard) {
    if (!container || !container.IsValid || !container.IsValid()) return;
    ClearPanelChildren(container);
    var cards = Array.isArray(hand) ? hand : [];
    if (cards.length <= 0) {
        var emptyLabel = $.CreatePanel("Label", container, "");
        emptyLabel.AddClass("ArcadeBlackjackCardsEmpty");
        emptyLabel.text = "--";
        return;
    }
    for (var i = 0; i < cards.length; i++) {
        var hidden = (hideSecondCard === true && i === 1);
        CreateBlackjackCardPanel(container, cards[i], hidden);
    }
}

function UpdateBlackjackHud(state) {
    if (!state || !state.isValid || !state.isValid()) return;
    var handOver = (state.handOver === true);
    var playerTotalInfo = GetBlackjackHandTotal(state.playerHand);
    var dealerTotalInfo = GetBlackjackHandTotal(state.dealerHand);
    var dealerShowing = (Array.isArray(state.dealerHand) && state.dealerHand.length > 0)
        ? GetBlackjackCardValue(state.dealerHand[0])
        : 0;

    if (state.playerCardsContainer && state.playerCardsContainer.IsValid && state.playerCardsContainer.IsValid()) {
        RenderBlackjackCardsToContainer(state.playerCardsContainer, state.playerHand, false);
    }
    if (state.playerTotalLabel && state.playerTotalLabel.IsValid && state.playerTotalLabel.IsValid()) {
        state.playerTotalLabel.text = LocalizeSettingsText("Total:", true) + " " + String(playerTotalInfo.total);
    }
    if (state.dealerCardsContainer && state.dealerCardsContainer.IsValid && state.dealerCardsContainer.IsValid()) {
        RenderBlackjackCardsToContainer(state.dealerCardsContainer, state.dealerHand, !handOver);
    }
    if (state.dealerTotalLabel && state.dealerTotalLabel.IsValid && state.dealerTotalLabel.IsValid()) {
        state.dealerTotalLabel.text = handOver
            ? (LocalizeSettingsText("Total:", true) + " " + String(dealerTotalInfo.total))
            : (LocalizeSettingsText("Showing:", true) + " " + String(dealerShowing));
    }
    if (state.deckLabel && state.deckLabel.IsValid && state.deckLabel.IsValid()) {
        var remain = Array.isArray(state.deck) ? state.deck.length : 0;
        state.deckLabel.text = LocalizeSettingsText("Deck:", true) + " " + String(remain);
    }
    if (state.resultLabel && state.resultLabel.IsValid && state.resultLabel.IsValid()) {
        var msg = String(state.resultText || "");
        var tone = String(state.resultTone || "");
        state.resultLabel.SetHasClass("ResultWin", tone === "win");
        state.resultLabel.SetHasClass("ResultLoss", tone === "loss");
        state.resultLabel.SetHasClass("ResultPush", tone === "push");
        if (msg.length > 0) {
            state.resultLabel.text = LocalizeSettingsText(msg, true);
            state.resultLabel.style.visibility = "visible";
        } else {
            state.resultLabel.text = "";
            state.resultLabel.style.visibility = "collapse";
        }
    }
    if (state.playerRow && state.playerRow.IsValid && state.playerRow.IsValid()) {
        state.playerRow.SetHasClass("ResultWin", handOver && state.resultTone === "win");
        state.playerRow.SetHasClass("ResultLoss", handOver && state.resultTone === "loss");
    }
    if (state.dealerRow && state.dealerRow.IsValid && state.dealerRow.IsValid()) {
        state.dealerRow.SetHasClass("ResultWin", handOver && state.resultTone === "loss");
        state.dealerRow.SetHasClass("ResultLoss", handOver && state.resultTone === "win");
    }
    var canPlay = !handOver;
    if (state.hitBtn && state.hitBtn.IsValid && state.hitBtn.IsValid()) {
        state.hitBtn.SetHasClass("Disabled", !canPlay);
    }
    if (state.standBtn && state.standBtn.IsValid && state.standBtn.IsValid()) {
        state.standBtn.SetHasClass("Disabled", !canPlay);
    }
}

function IsBlackjackStateActive(state) {
    return !!(state && state.active === true && state.isValid && state.isValid());
}

function PlayBlackjackActionSound() {
    var options = BLACKJACK_ACTION_SOUND_EVENTS;
    if (!Array.isArray(options) || options.length <= 0) return;
    var idx = PickRandomIndexNoImmediateRepeat(options, "blackjack_action");
    if (idx < 0 || idx >= options.length) return;
    var eventName = String(options[idx] || "");
    if (!eventName) return;
    PlayArcadeGameSoundEffect(eventName);
}

function PlayBlackjackResultSound(tone) {
    var eventName = "";
    if (tone === "win") eventName = BLACKJACK_WIN_SOUND_EVENT;
    else if (tone === "loss") eventName = BLACKJACK_LOSE_SOUND_EVENT;
    if (!eventName) return;
    PlayArcadeGameSoundEffect(eventName);
}

function SetBlackjackResult(state, message, tone) {
    if (!state) return;
    state.resultText = String(message || "");
    state.resultTone = String(tone || "");
    UpdateBlackjackHud(state);
    PlayBlackjackResultSound(state.resultTone);
}

function ResolveBlackjackOutcome(state) {
    if (!state) return;
    var player = GetBlackjackHandTotal(state.playerHand).total;
    var dealer = GetBlackjackHandTotal(state.dealerHand).total;
    state.handOver = true;
    if (player > 21) {
        SetBlackjackResult(state, "Bust - Dealer wins.", "loss");
    } else if (dealer > 21) {
        SetBlackjackResult(state, "Dealer busts - You win.", "win");
    } else if (player > dealer) {
        SetBlackjackResult(state, "You win.", "win");
    } else if (player < dealer) {
        SetBlackjackResult(state, "Dealer wins.", "loss");
    } else {
        SetBlackjackResult(state, "Push.", "push");
    }
}

function BeginBlackjackHand(state) {
    if (!IsBlackjackStateActive(state)) return;
    state.deck = CreateBlackjackDeck();
    state.playerHand = [];
    state.dealerHand = [];
    state.handOver = false;
    state.resultText = "";
    state.resultTone = "";

    state.playerHand.push(DrawBlackjackCard(state));
    state.dealerHand.push(DrawBlackjackCard(state));
    state.playerHand.push(DrawBlackjackCard(state));
    state.dealerHand.push(DrawBlackjackCard(state));

    var playerTotal = GetBlackjackHandTotal(state.playerHand).total;
    var dealerTotal = GetBlackjackHandTotal(state.dealerHand).total;
    if (playerTotal === 21 || dealerTotal === 21) {
        state.handOver = true;
        if (playerTotal === 21 && dealerTotal === 21) SetBlackjackResult(state, "Push - Both have blackjack.", "push");
        else if (playerTotal === 21) SetBlackjackResult(state, "Blackjack - You win.", "win");
        else SetBlackjackResult(state, "Dealer blackjack.", "loss");
    } else {
        UpdateBlackjackHud(state);
    }
}

function HitBlackjack(state) {
    if (!IsBlackjackStateActive(state) || state.handOver) return;
    state.playerHand.push(DrawBlackjackCard(state));
    var playerTotal = GetBlackjackHandTotal(state.playerHand).total;
    if (playerTotal > 21) {
        state.handOver = true;
        SetBlackjackResult(state, "Bust - Dealer wins.", "loss");
        return;
    }
    PlayBlackjackActionSound();
    UpdateBlackjackHud(state);
}

function StandBlackjack(state) {
    if (!IsBlackjackStateActive(state) || state.handOver) return;
    while (GetBlackjackHandTotal(state.dealerHand).total < 17) {
        state.dealerHand.push(DrawBlackjackCard(state));
    }
    ResolveBlackjackOutcome(state);
    if (state.resultTone !== "win" && state.resultTone !== "loss") {
        PlayBlackjackActionSound();
    }
}

function CloseBlackjackModal(overlay) {
    if (gBlackjackState) {
        gBlackjackState.active = false;
        gBlackjackState = null;
    }
    if (overlay && overlay.IsValid && overlay.IsValid()) {
        CloseModal(overlay);
    }
}

function CloseBlackjackModalIfOpen() {
    var root = $.GetContextPanel();
    if (!root) return;
    var overlay = root.FindChildTraverse("ArcadeBlackjackOverlay");
    if (overlay && overlay.IsValid && overlay.IsValid()) {
        CloseBlackjackModal(overlay);
    } else if (gBlackjackState) {
        gBlackjackState.active = false;
        gBlackjackState = null;
    }
}

function OpenBlackjackModal() {
    var rootPanel = $.GetContextPanel();
    if (!rootPanel) return;

    PrepareSettingsModalOpen();
    CloseBlackjackModalIfOpen();

    var overlay = $.CreatePanel("Panel", rootPanel, "ArcadeBlackjackOverlay");
    overlay.AddClass("ModalOverlay");
    overlay.AddClass("QOLModalOverlay");
    // Do not close on generic overlay activate; button/input clicks can bubble and
    // race panel deletion against in-flight blackjack handlers.
    overlay.SetPanelEvent("onactivate", function() {});
    $.Schedule(0.01, function() {
        if (overlay && overlay.IsValid && overlay.IsValid()) overlay.AddClass("Show");
    });

    var modalContainer = $.CreatePanel("Panel", overlay, "ArcadeBlackjackModalContainer");
    modalContainer.AddClass("ArcadeModalContainer");
    modalContainer.AddClass("QOLUnifiedModalSurface");
    modalContainer.SetPanelEvent("onactivate", function() {});

    var closeBtn = $.CreatePanel("Button", modalContainer, "CloseBtn");
    var closeIcon = $.CreatePanel("Label", closeBtn, "");
    closeIcon.text = "X";
    closeBtn.SetPanelEvent("onactivate", function() {
        CloseBlackjackModal(overlay);
    });

    var header = $.CreatePanel("Label", modalContainer, "");
    header.AddClass("ModalTitle");
    header.AddClass("ArcadeBlackjackTitle");
    header.text = LocalizeSettingsText("Wraithjack", true);

    var heroIcon = $.CreatePanel("Image", modalContainer, "ArcadeBlackjackHeroIcon");
    heroIcon.AddClass("ArcadeBlackjackHeroIcon");
    heroIcon.SetImage("file://{images}/qollock/wraith_sm_psd_png.vtex");

    var area = $.CreatePanel("Panel", modalContainer, "ArcadeBlackjackArea");
    area.AddClass("ArcadeBlackjackArea");
    var content = $.CreatePanel("Panel", area, "ArcadeBlackjackContent");
    content.AddClass("ArcadeBlackjackContent");

    var dealerRow = $.CreatePanel("Panel", content, "ArcadeBlackjackDealerRow");
    dealerRow.AddClass("ArcadeBlackjackHandRow");
    var dealerTitle = $.CreatePanel("Label", dealerRow, "");
    dealerTitle.AddClass("ArcadeBlackjackHandTitle");
    dealerTitle.text = LocalizeSettingsText("Dealer", true);
    var dealerCards = $.CreatePanel("Panel", dealerRow, "ArcadeBlackjackDealerCards");
    dealerCards.AddClass("ArcadeBlackjackHandCards");
    var dealerTotal = $.CreatePanel("Label", dealerRow, "ArcadeBlackjackDealerTotal");
    dealerTotal.AddClass("ArcadeBlackjackHandTotal");
    dealerTotal.text = LocalizeSettingsText("Total:", true) + " --";

    var playerRow = $.CreatePanel("Panel", content, "ArcadeBlackjackPlayerRow");
    playerRow.AddClass("ArcadeBlackjackHandRow");
    var playerTitle = $.CreatePanel("Label", playerRow, "");
    playerTitle.AddClass("ArcadeBlackjackHandTitle");
    playerTitle.text = LocalizeSettingsText("Player", true);
    var playerCards = $.CreatePanel("Panel", playerRow, "ArcadeBlackjackPlayerCards");
    playerCards.AddClass("ArcadeBlackjackHandCards");
    var playerTotal = $.CreatePanel("Label", playerRow, "ArcadeBlackjackPlayerTotal");
    playerTotal.AddClass("ArcadeBlackjackHandTotal");
    playerTotal.text = LocalizeSettingsText("Total:", true) + " --";

    var actionRow = $.CreatePanel("Panel", content, "ArcadeBlackjackActionRow");
    actionRow.AddClass("ArcadeBlackjackActionRow");

    var hitBtn = $.CreatePanel("Button", actionRow, "ArcadeBlackjackHitBtn");
    hitBtn.AddClass("ArcadeMinesweeperActionBtn");
    hitBtn.AddClass("ArcadeBlackjackControlBtn");
    var hitLbl = $.CreatePanel("Label", hitBtn, "");
    hitLbl.text = LocalizeSettingsText("Hit", true);

    var standBtn = $.CreatePanel("Button", actionRow, "ArcadeBlackjackStandBtn");
    standBtn.AddClass("ArcadeMinesweeperActionBtn");
    standBtn.AddClass("ArcadeBlackjackControlBtn");
    var standLbl = $.CreatePanel("Label", standBtn, "");
    standLbl.text = LocalizeSettingsText("Stand", true);

    var actionRowSecondary = $.CreatePanel("Panel", content, "ArcadeBlackjackActionRowSecondary");
    actionRowSecondary.AddClass("ArcadeBlackjackActionRow");
    actionRowSecondary.AddClass("ArcadeBlackjackActionRowSecondary");

    var newHandBtn = $.CreatePanel("Button", actionRowSecondary, "ArcadeBlackjackNewHandBtn");
    newHandBtn.AddClass("ArcadeMinesweeperActionBtn");
    newHandBtn.AddClass("ArcadeBlackjackControlBtn");
    newHandBtn.AddClass("ArcadeBlackjackNewHandBtn");
    var newHandLbl = $.CreatePanel("Label", newHandBtn, "");
    newHandLbl.text = LocalizeSettingsText("New Hand", true);

    var statusLabel = $.CreatePanel("Label", modalContainer, "ArcadeBlackjackStatusLabel");
    statusLabel.AddClass("ArcadeBlackjackStatusLabel");
    statusLabel.style.visibility = "collapse";

    var state = {
        isValid: function() { return overlay && overlay.IsValid && overlay.IsValid(); },
        active: true,
        deck: [],
        playerHand: [],
        dealerHand: [],
        handOver: false,
        resultText: "",
        hitBtn: hitBtn,
        standBtn: standBtn,
        dealerRow: dealerRow,
        dealerCardsContainer: dealerCards,
        dealerTotalLabel: dealerTotal,
        playerRow: playerRow,
        playerCardsContainer: playerCards,
        playerTotalLabel: playerTotal,
        resultLabel: statusLabel
    };
    gBlackjackState = state;

    newHandBtn.SetPanelEvent("onactivate", function() {
        if (!IsBlackjackStateActive(state)) return;
        BeginBlackjackHand(state);
    });
    hitBtn.SetPanelEvent("onactivate", function() {
        if (!IsBlackjackStateActive(state)) return;
        HitBlackjack(state);
    });
    standBtn.SetPanelEvent("onactivate", function() {
        if (!IsBlackjackStateActive(state)) return;
        StandBlackjack(state);
    });

    BeginBlackjackHand(state);
}

function IsAnyArcadeModalOpen() {
    var root = $.GetContextPanel();
    if (!root) return false;
    return !!(
        root.FindChildTraverse("ArcadeMinesweeperOverlay") ||
        root.FindChildTraverse("ArcadeFlappyOverlay") ||
        root.FindChildTraverse("ArcadeAimTrainerOverlay") ||
        root.FindChildTraverse("ArcadeTrainTrackingOverlay") ||
        root.FindChildTraverse("ArcadeWhackRemOverlay") ||
        root.FindChildTraverse("ArcadeBlackjackOverlay")
    );
}

function CloseAllArcadeModalsIfOpen() {
    CloseMinesweeperModalIfOpen();
    CloseFlappyModalIfOpen();
    CloseAimTrainerModalIfOpen();
    CloseTrainTrackingModalIfOpen();
    CloseWhackRemModalIfOpen();
    CloseBlackjackModalIfOpen();
}

function OpenRandomArcadeModal() {
    if (IsAnyArcadeModalOpen()) return;
    var choice = Math.floor(Math.random() * 6);
    if (choice === 0) OpenMinesweeperModal();
    else if (choice === 1) OpenFlappyModal();
    else if (choice === 2) OpenAimTrainerModal();
    else if (choice === 3) OpenTrainTrackingModal();
    else if (choice === 4) OpenWhackRemModal();
    else OpenBlackjackModal();
}

function BuildEnabledOnDeathArcadePool() {
    var pool = [];
    if (Number(MOD_CONFIG.ON_DEATH_GAME_MINESWEEPER) === 1) pool.push(OpenMinesweeperModal);
    if (Number(MOD_CONFIG.ON_DEATH_GAME_BLACKJACK) === 1) pool.push(OpenBlackjackModal);
    if (Number(MOD_CONFIG.ON_DEATH_GAME_FLAPPY_BAT) === 1) pool.push(OpenFlappyModal);
    if (Number(MOD_CONFIG.ON_DEATH_GAME_GRAVES_TRAINER) === 1) pool.push(OpenAimTrainerModal);
    if (Number(MOD_CONFIG.ON_DEATH_GAME_ZERGGY_MANIA) === 1) pool.push(OpenTrainTrackingModal);
    if (Number(MOD_CONFIG.ON_DEATH_GAME_WHACK_A_REM) === 1) pool.push(OpenWhackRemModal);
    return pool;
}

function HasAnyOnDeathArcadeGameEnabled() {
    for (var i = 0; i < ON_DEATH_ARCADE_GAME_KEYS.length; i++) {
        var key = ON_DEATH_ARCADE_GAME_KEYS[i];
        if (Number(MOD_CONFIG[key]) === 1) return true;
    }
    return false;
}

function BuildOnDeathEscapeMenuTargets() {
    var targets = [];
    function pushUnique(panel) {
        if (!panel || !panel.IsValid || !panel.IsValid()) return;
        for (var i = 0; i < targets.length; i++) {
            if (targets[i] === panel) return;
        }
        targets.push(panel);
    }

    var cursor = $.GetContextPanel ? $.GetContextPanel() : null;
    var depth = 0;
    while (cursor && depth < 20) {
        pushUnique(cursor);
        cursor = cursor.GetParent ? cursor.GetParent() : null;
        depth++;
    }

    var root = FindRootPanel();
    pushUnique(root);

    var escapeMenu = null;
    if (root && root.FindChildTraverse) {
        try { escapeMenu = root.FindChildTraverse("EscapeMenu"); } catch (e0) { escapeMenu = null; }
        pushUnique(escapeMenu);
        if (escapeMenu && escapeMenu.GetParent) pushUnique(escapeMenu.GetParent());
        var hudPanel = null;
        try { hudPanel = root.FindChildTraverse("Hud"); } catch (e1) { hudPanel = null; }
        pushUnique(hudPanel);
    }

    return targets;
}

function ForceCloseEscapeMenuForOnDeathGames() {
    var targets = BuildOnDeathEscapeMenuTargets();
    for (var i = 0; i < targets.length; i++) {
        var panel = targets[i];
        if (!panel || !panel.IsValid || !panel.IsValid() || !panel.RemoveClass) continue;
        try { panel.RemoveClass("ShowEscapeMenu"); } catch(e0) { WarnLog("settings", "op failed: " + (e0 && e0.message ? e0.message : String(e0 || ""))); }
    }
}

function OpenOnDeathArcadeGameById(gameId) {
    var normalized = String(gameId || "").toLowerCase();
    if (normalized === "minesweeper") {
        OpenMinesweeperModal();
        return true;
    }
    if (normalized === "blackjack") {
        OpenBlackjackModal();
        return true;
    }
    if (normalized === "flappy_bat") {
        OpenFlappyModal();
        return true;
    }
    if (normalized === "graves_trainer") {
        OpenAimTrainerModal();
        return true;
    }
    if (normalized === "zerggy_mania") {
        OpenTrainTrackingModal();
        return true;
    }
    if (normalized === "whack_a_rem") {
        OpenWhackRemModal();
        return true;
    }
    return false;
}

function GetOnDeathArcadeBridgeState() {
    var root = FindRootPanel();
    var out = {
        root: root || null,
        active: false,
        gameId: "",
        token: ""
    };
    if (!root || !root.GetAttributeString) return out;
    try { out.active = (String(root.GetAttributeString(ON_DEATH_ARCADE_ACTIVE_ATTR, "") || "") === "1"); } catch (e0) { out.active = false; }
    try { out.gameId = String(root.GetAttributeString(ON_DEATH_ARCADE_REQUEST_ATTR, "") || ""); } catch (e1) { out.gameId = ""; }
    try { out.token = String(root.GetAttributeString(ON_DEATH_ARCADE_REQUEST_TOKEN_ATTR, "") || ""); } catch (e2) { out.token = ""; }
    return out;
}

function IsOnDeathArcadeConfigEnabledForSettings() {
    if (Number(MOD_CONFIG && MOD_CONFIG.ENABLE_ON_DEATH_GAMES) !== 1) return false;
    for (var i = 0; i < ON_DEATH_ARCADE_GAME_KEYS.length; i++) {
        if (Number(MOD_CONFIG[ON_DEATH_ARCADE_GAME_KEYS[i]]) === 1) return true;
    }
    return false;
}

function ShouldRunOnDeathArcadeBridgePoller() {
    return IsOnDeathArcadeConfigEnabledForSettings() || gOnDeathArcadeSessionActive;
}

function StopOnDeathArcadeBridgePoller() {
    gOnDeathArcadeBridgePollToken++;
    gOnDeathArcadeBridgePollRunning = false;
}

function StartOnDeathArcadeBridgePoller() {
    if (!ShouldRunOnDeathArcadeBridgePoller()) {
        gOnDeathArcadeBridgePollRunning = false;
        return;
    }
    gOnDeathArcadeBridgePollToken++;
    gOnDeathArcadeBridgePollRunning = true;
    var token = gOnDeathArcadeBridgePollToken;

    function tick() {
        if (token !== gOnDeathArcadeBridgePollToken) return;
        if (!ShouldRunOnDeathArcadeBridgePoller()) {
            gOnDeathArcadeBridgePollRunning = false;
            return;
        }

        var featureEnabled = IsOnDeathArcadeConfigEnabledForSettings();
        var bridge = GetOnDeathArcadeBridgeState();
        if (!bridge.active) {
            if (gOnDeathArcadeSessionActive) {
                gOnDeathArcadeSessionActive = false;
                CloseAllArcadeModalsIfOpen();
                ForceCloseEscapeMenuForOnDeathGames();
            }
        } else if (featureEnabled && bridge.token && bridge.token !== gOnDeathArcadeLastRequestToken) {
            gOnDeathArcadeLastRequestToken = bridge.token;
            gOnDeathArcadeSessionActive = true;
            if (!IsAnyArcadeModalOpen()) {
                OpenOnDeathArcadeGameById(bridge.gameId);
            }
        }

        if (!ShouldRunOnDeathArcadeBridgePoller()) {
            gOnDeathArcadeBridgePollRunning = false;
            return;
        }
        $.Schedule(ON_DEATH_GAMES_POLL_SECONDS, tick);
    }

    $.Schedule(ON_DEATH_GAMES_POLL_SECONDS, tick);
}

function EnsureOnDeathArcadeBridgePoller() {
    if (gOnDeathArcadeBridgePollRunning) return;
    StartOnDeathArcadeBridgePoller();
}

function UpdateOnDeathArcadeBridgePollerState() {
    if (ShouldRunOnDeathArcadeBridgePoller()) {
        EnsureOnDeathArcadeBridgePoller();
    } else if (gOnDeathArcadeBridgePollRunning) {
        StopOnDeathArcadeBridgePoller();
    }
}

function OpenAvailableModal() {
    SetActiveTabAndRefresh("Support");
}

function BuildCommunityPresetEntries() {
    var entries = [];
    entries.push({ label: "Sneed", preset: "Sneed" });
    entries.push({ label: "Basil", preset: "Basil" });
    entries.push({ label: "Vegas", preset: "Vegas" });
    entries.push({ label: "Poshy", preset: "Poshy" });
    entries.push({ label: "Goober", preset: "Goober" });
    entries.push({ label: "Piggy", preset: "Piggy" });
    entries.push({ label: "BSQTT", preset: "BSQTT" });
    entries.push({ label: "iKaritzu", preset: "iKaritzu" });
    entries.push({ label: "Scuffed", preset: "Scuffed" });
    entries.push({ label: "Gyzeh", preset: "Gyzeh" });
    entries.push({ label: BREAD_PRESET_NAME, preset: BREAD_PRESET_NAME });
    entries.push({ label: "bonclide", preset: "bonclide" });
    entries.push({ label: "Saintmxsm", preset: "Saintmxsm" });
    entries.push({ label: "Zer0", preset: "Zer0" });
    entries.push({ label: "Pops", preset: "Pops" });
    entries.push({ label: "Wouwei", preset: "Wouwei" });
    entries.push({ label: "Nairshark", preset: "Nairshark" });
    entries.push({ label: "Satanael", preset: "Satanael" });
    entries.push({ label: "Kr1stux", preset: "Kr1stux" });
    entries.push({ label: "Wrvth", preset: "Wrvth" });
    entries.push({ label: "Jared", preset: "Jared" });
    entries.push({ label: "Bubsito", preset: "Bubsito" });
    entries.push({ label: "Gambler", preset: "Gambler" });
    entries.push({ label: "Tuna", preset: "Tuna" });
    entries.push({ label: "Hikyo", preset: "Hikyo" });
    entries.push({ label: "Chjcago", preset: "Chjcago" });
    entries.push({ label: "Starjadian", preset: "Starjadian" });
    entries.push({ label: "Synthronix", preset: "Synthronix" });
    entries.push({ label: "Shark", preset: "Shark" });
    entries.push({ label: "Neonvoid", preset: "Neonvoid" });
    entries.push({ label: "Fenmore", preset: "Fenmore" });
    entries.push({ label: "Deethirty", preset: "Deethirty" });
    entries.push({ label: "Jerboa", preset: "Jerboa" });
    entries.push({ label: "RiChew", preset: "RiChew" });
    entries.push({ label: "Soramikali", preset: "Soramikali" });
    entries.push({ label: "Jaundice", preset: "Jaundice" });
    entries.push({ label: "Xavier", preset: "Xavier" });
    entries.push({ label: "Spookyy", preset: "Spookyy" });
    entries.push({ label: "Specty", preset: "Specty" });
    entries.push({ label: "Wirdly", preset: "Wirdly" });
    entries.push({ label: "Radiant", preset: "Radiant" });
    entries.push({ label: "Chumba", preset: "Chumba" });
    entries.push({ label: "FakeThread", preset: "FakeThread" });
    entries.push({ label: "7eventy7", preset: "7eventy7" });
    entries.push({ label: "XD_HECTICC", preset: "XD_HECTICC" });
    entries.push({ label: "Enova", preset: "Enova" });
    entries.push({ label: "Boredom", preset: "Boredom" });
    entries.push({ label: "PrivateProf", preset: "PrivateProf" });
    entries.push({ label: "Munfins", preset: "Munfins" });
    entries.push({ label: "Gmanc2", preset: "Gmanc2" });
    entries.push({ label: "Keta", preset: "Keta" });
    entries.push({ label: "Torque", preset: "Torque" });
    entries.push({ label: "iMicro", preset: "iMicro" });
    entries.push({ label: "TW1G", preset: "TW1G" });
    entries.push({ label: "Veradox", preset: "Veradox" });
    entries.push({ label: "Antetheosis", preset: "Antetheosis" });
    entries.push({ label: "k49", preset: "k49" });
    entries.push({ label: "ninjabladejr", preset: "ninjabladeJr" });
    entries.push({ label: "FlintSnow", preset: "FlintSnow" });
    entries.push({ label: "Fiizypopdrinkk", preset: "Fiizypopdrinkk" });
    entries.push({ label: "Steqdyy", preset: "Steqdyy" });
    entries.push({ label: "Synapses_", preset: "Synapses_" });
    entries.push({ label: "Gerglee", preset: "Gerglee" });
    entries.push({ label: "Dappa", preset: "Dappa" });
    entries.push({ label: "Seyer", preset: "Seyer" });
    entries.push({
        label: "T1FF4NNY",
        preset: "T1FF4NNY"
    });
    entries.push({ label: "Joey", preset: "Joey" });
    entries.push({ label: "Zyartic", preset: "Zyartic" });
    entries.push({ label: "billyyy", preset: "billyyy" });
    entries.push({ label: "mituu", preset: "mituu" });
    entries.push({ label: "qlt", preset: "qlt" });
    entries.push({ label: "munchkin", preset: "munchkinman" });
    entries.push({ label: "Blank2762", preset: "Blank2762" });
    entries.push({ label: "Valerie", preset: "Valerie" });
    entries.push({ label: "Rosalia", preset: "Rosalia" });
    entries.push({ label: "notah", preset: "notah" });
    entries.push({ label: "Anguish", preset: "Anguish" });
    entries.push({ label: "_ZODUK_", preset: "_ZODUK_" });
    entries.push({ label: "nkonin.me", preset: "nkonin.me" });
    entries.push({ label: "loony", preset: "loony" });
    entries.push({ label: "leah", preset: "leah" });
    for (var i = entries.length; i < 90; i++) {
        entries.push({ label: "Available", available: false });
    }
    return entries;
}

function CreateSeparator(parent) {
    if (gSearchCollectMode && gSearchCollectState) {
        gSearchCollectState.currentSection = null;
        return null;
    }
    var sep = $.CreatePanel("Panel", parent, "");
    sep.AddClass("RowSeparator");
    return sep;
}

function CreateSectionTitle(parent, title, configIdForPerf) {
    var localizedTitle = LocalizeSettingsText(title || "");
    gCurrentSettingsSectionTitle = String(title || "");
    if (gSearchCollectMode && gSearchCollectState) {
        var section = {
            title: localizedTitle,
            rows: []
        };
        gSearchCollectState.sections.push(section);
        gSearchCollectState.currentSection = section;
        return null;
    }
    var titleRow = $.CreatePanel("Panel", parent, "");
    titleRow.AddClass("SectionTitleRow");
    titleRow.AddClass("SectionTitleStaticRow");
    var titleHead = $.CreatePanel("Panel", titleRow, "");
    titleHead.AddClass("SectionTitleInlineHead");
    var titleLabel = $.CreatePanel("Label", titleHead, "");
    titleLabel.AddClass("SectionTitle");
    titleLabel.AddClass("SectionTitleInlineLabel");
    titleLabel.text = localizedTitle;
    BindSectionPerfTooltip(titleRow, title, "", currentTab, configIdForPerf || "", "toggle", null);
    CreateSectionResetButton(titleRow, function() {
        return CollectResetKeysFromSectionTitleRow(titleRow);
    }, null, titleHead);
    return titleLabel;
}

function CreateSectionInlineIconButton(titleLabel, buttonId, iconSrc, tooltipText) {
    if (!titleLabel || !titleLabel.IsValid || !titleLabel.IsValid()) return null;
    var titleHead = null;
    try { titleHead = titleLabel.GetParent ? titleLabel.GetParent() : null; } catch (e0) { titleHead = null; }
    if (!titleHead || !titleHead.IsValid || !titleHead.IsValid()) return null;
    var button = $.CreatePanel("Button", titleHead, buttonId || "");
    button.AddClass("SectionTitleActionBtn");
    button.AddClass("ConfigSectionIconBtn");
    var icon = $.CreatePanel("Image", button, (buttonId || "") + "_icon", {
        src: iconSrc || "",
        defaultsrc: "",
        scaling: "contain"
    });
    icon.AddClass("SectionTitleActionIcon");
    icon.AddClass("ConfigSectionIconBtnIcon");
    if (tooltipText) {
        var showTooltip = function() {
            HideSettingsTextTooltip();
            CancelSettingsRowFloatingTooltipHide();
            ShowSettingsRowFloatingTooltip(
                button,
                "",
                LocalizeSettingsText(tooltipText, true),
                PERF_IMPACT_TIER_NONE,
                ""
            );
        };
        var hideTooltip = function() {
            HideSettingsRowFloatingTooltipDeferred(String(buttonId || "config_section_icon_btn") + "_mouseout");
        };
        button.SetPanelEvent("onmouseover", showTooltip);
        button.SetPanelEvent("onmouseout", hideTooltip);
        icon.SetPanelEvent("onmouseover", showTooltip);
        icon.SetPanelEvent("onmouseout", hideTooltip);
    }
    return button;
}

function CreateSectionTitleCheckboxToggle(titleHead, label, configId, toggleOptions) {
    if (!titleHead || !titleHead.IsValid || !titleHead.IsValid() || !configId) return null;
    var localizedLabel = LocalizeSettingsText(label || "");
    var invertToggle = !!(toggleOptions && toggleOptions.invert === true);
    var refreshListOnChange = !!(toggleOptions && toggleOptions.refreshListOnChange === true);
    var description = (toggleOptions && toggleOptions.description) ? String(toggleOptions.description) : "";
    var isAvailableFn = (toggleOptions && typeof toggleOptions.isAvailableFn === "function") ? toggleOptions.isAvailableFn : null;
    var getIsActive = function() {
        var rawActive = (MOD_CONFIG[configId] === 1);
        return invertToggle ? !rawActive : rawActive;
    };
    var getIsAvailable = function() {
        if (!isAvailableFn) return true;
        try { return isAvailableFn() === true; } catch (eAvail) { return true; }
    };
    var btn = $.CreatePanel("ToggleButton", titleHead, String(configId).replace(/[^A-Za-z0-9_]/g, "_") + "SectionTitleCheckbox");
    btn.AddClass("SectionTitleCheckboxToggle");
    btn.AddClass("InlineSecondaryCheckboxBtn");
    btn.AddClass("MultiCheckboxBtn");
    btn.AddClass("CitadelSettingsCheckbox");
    var lbl = $.CreatePanel("Label", btn, "");
    lbl.AddClass("SectionTitleCheckboxLabel");
    lbl.AddClass("MultiCheckboxLabel");
    lbl.text = localizedLabel;
    var update = function() {
        var isActive = getIsActive();
        var isAvailable = getIsAvailable();
        try { btn.SetSelected(isActive); } catch(eSel) { WarnLog("settings", "op failed: " + (eSel && eSel.message ? eSel.message : String(eSel || ""))); }
        btn.SetHasClass("selected", isActive);
        btn.SetHasClass("IsSelected", isActive);
        btn.SetHasClass("Active", isActive);
        btn.SetHasClass("Disabled", !isAvailable);
        btn.hittest = isAvailable;
        btn.hittestchildren = isAvailable;
    };
    update();
    btn.SetPanelEvent("onmouseover", function() {
        HideSettingsTextTooltip();
        CancelSettingsRowFloatingTooltipHide();
        ShowSettingsRowFloatingTooltip(
            btn,
            "",
            LocalizeSettingsText(description || label || configId, true),
            PERF_IMPACT_TIER_NONE,
            ""
        );
    });
    btn.SetPanelEvent("onmouseout", function() {
        HideSettingsRowFloatingTooltipDeferred("section_title_checkbox_mouseout");
    });
    btn.SetPanelEvent("onactivate", function() {
        if (!getIsAvailable()) {
            update();
            return;
        }
        var nextActive = !getIsActive();
        MOD_CONFIG[configId] = invertToggle ? (nextActive ? 0 : 1) : (nextActive ? 1 : 0);
        update();
        SaveAndSync();
        if (refreshListOnChange) RequestSettingsListRefresh(0, true);
        ShowConfigPreviewForConfigId(configId);
    });
    RegisterSettingsListRowSync(function() {
        if (!btn || !btn.IsValid || !btn.IsValid()) return false;
        update();
        return true;
    });
    btn.qolRefreshTitleCheckbox = update;
    return btn;
}

var SETTINGS_TOOLTIP_THEME_CLASS = "QOLSettingsTooltipThemeActive";
var SETTINGS_TOOLTIP_PERF_CLASS_NONE = "QOLSettingsTooltipPerfNone";
var SETTINGS_TOOLTIP_PERF_CLASS_LOW = "QOLSettingsTooltipPerfLow";
var SETTINGS_TOOLTIP_PERF_CLASS_MEDIUM = "QOLSettingsTooltipPerfMedium";
var SETTINGS_TOOLTIP_PERF_CLASS_HIGH = "QOLSettingsTooltipPerfHigh";
var gSettingsRowFloatingTooltipPanel = null;
var gSettingsRowFloatingTooltipPerfPrefixLabel = null;
var gSettingsRowFloatingTooltipPerfValueLabel = null;
var gSettingsRowFloatingTooltipBodyLabel = null;
var gSettingsRowFloatingTooltipCreatorPrefixLabel = null;
var gSettingsRowFloatingTooltipCreatorValueLabel = null;
var gSettingsRowFloatingTooltipVoiceMetaAuthorPrefixLabel = null;
var gSettingsRowFloatingTooltipVoiceMetaAuthorValueLabel = null;
var gSettingsRowFloatingTooltipVoiceMetaActorPrefixLabel = null;
var gSettingsRowFloatingTooltipVoiceMetaActorValueLabel = null;
var gSettingsRowFloatingTooltipAnchor = null;
var gSettingsRowFloatingTooltipLastCursorX = NaN;
var gSettingsRowFloatingTooltipLastCursorY = NaN;
var gSettingsRowFloatingTooltipLastX = NaN;
var gSettingsRowFloatingTooltipLastY = NaN;
var gSettingsRowFloatingTooltipTrackScheduled = false;
var SETTINGS_ROW_FLOATING_TOOLTIP_TRACK_INTERVAL_SEC = 0.05;
var SETTINGS_TOOLTIP_POSITION_DEBUG = false;
var SETTINGS_TOOLTIP_POSITION_DEBUG_INTERVAL_MS = 200;
var SETTINGS_TOOLTIP_SCROLL_SUPPRESS_MS = 180;
var SETTINGS_TOOLTIP_DEFER_HIDE_SEC = 0.06;
var gSettingsTooltipDebugNextMs = 0;
var gSettingsTooltipLastListScrollY = NaN;
var gSettingsTooltipLastHostScrollY = NaN;
var gSettingsTooltipLastAnchorLocalY = NaN;
var gSettingsTooltipSuppressUntilMs = 0;
var gSettingsTooltipHideToken = 0;
var gSettingsTooltipObservedListScrollY = NaN;
var gSettingsTooltipObservedHostScrollY = NaN;
var gSettingsTooltipLastScrollMoveMs = 0;
var gSettingsTooltipLastSide = "";
var gSettingsTooltipStyleToActualX = 1.0;
var gSettingsTooltipStyleToActualY = 1.0;
var gSettingsTooltipLastWrittenStyleX = NaN;
var gSettingsTooltipLastWrittenStyleY = NaN;
var gSettingsTooltipCalibrationFramesRemaining = 0;

function ReadPanelScrollOffsetY(panel) {
    if (!panel || !panel.IsValid || !panel.IsValid()) return 0;
    var y = 0;
    try {
        var sy0 = Number(panel.scrolloffset_y);
        if (isFinite(sy0)) return sy0;
    } catch(e0) { WarnLog("settings", "op failed: " + (e0 && e0.message ? e0.message : String(e0 || ""))); }
    try {
        var sy1 = Number(panel.scrolloffsetY);
        if (isFinite(sy1)) return sy1;
    } catch(e1) { WarnLog("settings", "op failed: " + (e1 && e1.message ? e1.message : String(e1 || ""))); }
    try {
        var sy2 = Number(panel.ScrollOffsetY);
        if (isFinite(sy2)) return sy2;
    } catch(e2) { WarnLog("settings", "op failed: " + (e2 && e2.message ? e2.message : String(e2 || ""))); }
    try {
        if (typeof panel.GetScrollOffset === "function") {
            var so = panel.GetScrollOffset();
            if (so && so.length >= 2) {
                var sy3 = Number(so[1]);
                if (isFinite(sy3)) return sy3;
            }
        }
    } catch(e3) { WarnLog("settings", "op failed: " + (e3 && e3.message ? e3.message : String(e3 || ""))); }
    return y;
}

function SettingsTooltipDebugLog(msg, force) {
    if (!SETTINGS_TOOLTIP_POSITION_DEBUG) return;
    var now = Date.now ? Date.now() : (new Date()).getTime();
    if (!force && now < (gSettingsTooltipDebugNextMs || 0)) return;
    gSettingsTooltipDebugNextMs = now + SETTINGS_TOOLTIP_POSITION_DEBUG_INTERVAL_MS;
    $.Msg("[QOLLock][TooltipPos] " + String(msg || ""));
}

function GetSettingsTooltipNowMs() {
    return Date.now ? Date.now() : (new Date()).getTime();
}

function SuppressSettingsTooltipForMs(durationMs, reason) {
    var now = GetSettingsTooltipNowMs();
    var ms = Number(durationMs);
    if (!isFinite(ms) || ms < 0) ms = 0;
    gSettingsTooltipSuppressUntilMs = now + ms;
    if (reason) {
        SettingsTooltipDebugLog("suppress ms=" + String(Math.round(ms)) + " reason=" + String(reason), true);
    }
}

function IsSettingsTooltipSuppressed() {
    var until = Number(gSettingsTooltipSuppressUntilMs);
    if (!isFinite(until) || until <= 0) return false;
    return GetSettingsTooltipNowMs() < until;
}

function UpdateSettingsTooltipScrollMotionWatch() {
    var snap = ReadSettingsTooltipScrollSnapshot();
    var listY = Number(snap.listY);
    var hostY = Number(snap.hostY);
    if (!isFinite(listY)) listY = 0;
    if (!isFinite(hostY)) hostY = 0;
    var moved = false;
    if (isFinite(gSettingsTooltipObservedListScrollY) && Math.abs(listY - gSettingsTooltipObservedListScrollY) >= 1) moved = true;
    if (isFinite(gSettingsTooltipObservedHostScrollY) && Math.abs(hostY - gSettingsTooltipObservedHostScrollY) >= 1) moved = true;
    gSettingsTooltipObservedListScrollY = listY;
    gSettingsTooltipObservedHostScrollY = hostY;
    if (moved) gSettingsTooltipLastScrollMoveMs = GetSettingsTooltipNowMs();
    return moved;
}

function IsSettingsTooltipInRecentScrollMotion() {
    var now = GetSettingsTooltipNowMs();
    var last = Number(gSettingsTooltipLastScrollMoveMs);
    if (!isFinite(last) || last <= 0) return false;
    return (now - last) < SETTINGS_TOOLTIP_SCROLL_SUPPRESS_MS;
}

function CancelSettingsRowFloatingTooltipHide() {
    gSettingsTooltipHideToken++;
}

function HideSettingsRowFloatingTooltipDeferred(reason) {
    CancelSettingsRowFloatingTooltipHide();
    var token = gSettingsTooltipHideToken;
    $.Schedule(SETTINGS_TOOLTIP_DEFER_HIDE_SEC, function() {
        if (token !== gSettingsTooltipHideToken) return;
        SettingsTooltipDebugLog("hide_deferred reason=" + String(reason || ""), true);
        HideSettingsRowFloatingTooltip();
    });
}

function IsSettingsRowFloatingTooltipVisible() {
    var panel = gSettingsRowFloatingTooltipPanel;
    if (!panel || !panel.IsValid || !panel.IsValid()) return false;
    if (!panel.BHasClass) return false;
    return !!panel.BHasClass("Visible");
}

function TickSettingsRowFloatingTooltipPosition() {
    gSettingsRowFloatingTooltipTrackScheduled = false;
    if (!IsSettingsRowFloatingTooltipVisible()) return;
    var anchor = gSettingsRowFloatingTooltipAnchor;
    if (!anchor || !anchor.IsValid || !anchor.IsValid()) {
        HideSettingsRowFloatingTooltip();
        return;
    }
    PositionSettingsRowFloatingTooltip(anchor);
    gSettingsRowFloatingTooltipTrackScheduled = true;
    $.Schedule(SETTINGS_ROW_FLOATING_TOOLTIP_TRACK_INTERVAL_SEC, TickSettingsRowFloatingTooltipPosition);
}

function EnsureSettingsRowFloatingTooltipTracking() {
    if (gSettingsRowFloatingTooltipTrackScheduled) return;
    gSettingsRowFloatingTooltipTrackScheduled = true;
    $.Schedule(SETTINGS_ROW_FLOATING_TOOLTIP_TRACK_INTERVAL_SEC, TickSettingsRowFloatingTooltipPosition);
}

function ReadSettingsTooltipScrollSnapshot() {
    var context = $.GetContextPanel();
    if (!context) return { listY: 0, hostY: 0 };
    var settingsList = null;
    try { settingsList = context.FindChildTraverse("SettingsList"); } catch (eList) { settingsList = null; }
    var settingsContentHost = null;
    try { settingsContentHost = context.FindChildTraverse("SettingsContentHost"); } catch (eHost) { settingsContentHost = null; }
    return {
        listY: ReadPanelScrollOffsetY(settingsList),
        hostY: ReadPanelScrollOffsetY(settingsContentHost)
    };
}

function PrimeSettingsTooltipScrollSnapshot() {
    var snap = ReadSettingsTooltipScrollSnapshot();
    gSettingsTooltipLastListScrollY = Number(snap.listY);
    gSettingsTooltipLastHostScrollY = Number(snap.hostY);
    var anchor = gSettingsRowFloatingTooltipAnchor;
    var host = gSettingsRowFloatingTooltipPanel && gSettingsRowFloatingTooltipPanel.GetParent
        ? gSettingsRowFloatingTooltipPanel.GetParent()
        : null;
    gSettingsTooltipLastAnchorLocalY = Number(GetPanelYOffsetWithinAncestor(anchor, host));
}

function DidSettingsTooltipScrollChange() {
    var snap = ReadSettingsTooltipScrollSnapshot();
    var listY = Number(snap.listY);
    var hostY = Number(snap.hostY);
    if (!isFinite(listY)) listY = 0;
    if (!isFinite(hostY)) hostY = 0;
    var hasBaseline = isFinite(gSettingsTooltipLastListScrollY) && isFinite(gSettingsTooltipLastHostScrollY);
    var changed = false;
    if (hasBaseline) {
        changed =
            Math.abs(listY - gSettingsTooltipLastListScrollY) >= 1 ||
            Math.abs(hostY - gSettingsTooltipLastHostScrollY) >= 1;
    }
    gSettingsTooltipLastListScrollY = listY;
    gSettingsTooltipLastHostScrollY = hostY;
    return changed;
}

function EnsureSettingsRowFloatingTooltipPanel() {
    var context = $.GetContextPanel();
    if (!context) return null;

    var settingsWin = null;
    try { settingsWin = context.FindChildTraverse("SettingsWindow"); } catch (e0) { settingsWin = null; }
    var host = (settingsWin && settingsWin.GetParent) ? settingsWin.GetParent() : context;
    if (!host) host = context;

    if (
        gSettingsRowFloatingTooltipPanel &&
        (!gSettingsRowFloatingTooltipPanel.IsValid || !gSettingsRowFloatingTooltipPanel.IsValid() || gSettingsRowFloatingTooltipPanel.GetParent() !== host)
    ) {
        try { gSettingsRowFloatingTooltipPanel.DeleteAsync(0); } catch(e1) { WarnLog("settings", "op failed: " + (e1 && e1.message ? e1.message : String(e1 || ""))); }
        gSettingsRowFloatingTooltipPanel = null;
        gSettingsRowFloatingTooltipPerfPrefixLabel = null;
        gSettingsRowFloatingTooltipPerfValueLabel = null;
        gSettingsRowFloatingTooltipBodyLabel = null;
        gSettingsRowFloatingTooltipCreatorPrefixLabel = null;
        gSettingsRowFloatingTooltipCreatorValueLabel = null;
        gSettingsRowFloatingTooltipVoiceMetaAuthorPrefixLabel = null;
        gSettingsRowFloatingTooltipVoiceMetaAuthorValueLabel = null;
        gSettingsRowFloatingTooltipVoiceMetaActorPrefixLabel = null;
        gSettingsRowFloatingTooltipVoiceMetaActorValueLabel = null;
    }

    if (!gSettingsRowFloatingTooltipPanel) {
        gSettingsRowFloatingTooltipPanel = $.CreatePanel("Panel", host, "QOLSettingsRowFloatingTooltip");
        gSettingsRowFloatingTooltipPanel.AddClass("QOLCustomRowTooltip");
        gSettingsRowFloatingTooltipPanel.hittest = false;
        gSettingsRowFloatingTooltipPanel.hittestchildren = false;

        gSettingsRowFloatingTooltipBodyLabel = $.CreatePanel("Label", gSettingsRowFloatingTooltipPanel, "QOLSettingsRowFloatingTooltipText");
        gSettingsRowFloatingTooltipBodyLabel.AddClass("QOLCustomRowTooltipText");

        var perfRow = $.CreatePanel("Panel", gSettingsRowFloatingTooltipPanel, "QOLSettingsRowFloatingTooltipPerfRow");
        perfRow.AddClass("QOLCustomRowTooltipPerfRow");

        gSettingsRowFloatingTooltipPerfPrefixLabel = $.CreatePanel("Label", perfRow, "QOLSettingsRowFloatingTooltipPerfPrefix");
        gSettingsRowFloatingTooltipPerfPrefixLabel.AddClass("QOLCustomRowTooltipPerfPrefix");
        gSettingsRowFloatingTooltipPerfPrefixLabel.text = LocalizeSettingsText("FPS Impact:", true);

        gSettingsRowFloatingTooltipPerfValueLabel = $.CreatePanel("Label", perfRow, "QOLSettingsRowFloatingTooltipPerfValue");
        gSettingsRowFloatingTooltipPerfValueLabel.AddClass("QOLCustomRowTooltipPerfValue");

        var creatorRow = $.CreatePanel("Panel", gSettingsRowFloatingTooltipPanel, "QOLSettingsRowFloatingTooltipCreatorRow");
        creatorRow.AddClass("QOLCustomRowTooltipCreatorRow");

        gSettingsRowFloatingTooltipCreatorPrefixLabel = $.CreatePanel("Label", creatorRow, "QOLSettingsRowFloatingTooltipCreatorPrefix");
        gSettingsRowFloatingTooltipCreatorPrefixLabel.AddClass("QOLCustomRowTooltipCreatorPrefix");
        gSettingsRowFloatingTooltipCreatorPrefixLabel.text = LocalizeSettingsText("Created By:", true);

        gSettingsRowFloatingTooltipCreatorValueLabel = $.CreatePanel("Label", creatorRow, "QOLSettingsRowFloatingTooltipCreatorValue");
        gSettingsRowFloatingTooltipCreatorValueLabel.AddClass("QOLCustomRowTooltipCreatorValue");

        var voiceMetaAuthorRow = $.CreatePanel("Panel", gSettingsRowFloatingTooltipPanel, "QOLSettingsRowFloatingTooltipVoiceMetaAuthorRow");
        voiceMetaAuthorRow.AddClass("QOLCustomRowTooltipVoiceMetaRow");

        gSettingsRowFloatingTooltipVoiceMetaAuthorPrefixLabel = $.CreatePanel("Label", voiceMetaAuthorRow, "QOLSettingsRowFloatingTooltipVoiceMetaAuthorPrefix");
        gSettingsRowFloatingTooltipVoiceMetaAuthorPrefixLabel.AddClass("QOLCustomRowTooltipVoiceMetaPrefix");
        gSettingsRowFloatingTooltipVoiceMetaAuthorPrefixLabel.text = LocalizeSettingsText("Author:", true);

        gSettingsRowFloatingTooltipVoiceMetaAuthorValueLabel = $.CreatePanel("Label", voiceMetaAuthorRow, "QOLSettingsRowFloatingTooltipVoiceMetaAuthorValue");
        gSettingsRowFloatingTooltipVoiceMetaAuthorValueLabel.AddClass("QOLCustomRowTooltipVoiceMetaAuthorValue");

        var voiceMetaActorRow = $.CreatePanel("Panel", gSettingsRowFloatingTooltipPanel, "QOLSettingsRowFloatingTooltipVoiceMetaActorRow");
        voiceMetaActorRow.AddClass("QOLCustomRowTooltipVoiceMetaRow");

        gSettingsRowFloatingTooltipVoiceMetaActorPrefixLabel = $.CreatePanel("Label", voiceMetaActorRow, "QOLSettingsRowFloatingTooltipVoiceMetaActorPrefix");
        gSettingsRowFloatingTooltipVoiceMetaActorPrefixLabel.AddClass("QOLCustomRowTooltipVoiceMetaPrefix");
        gSettingsRowFloatingTooltipVoiceMetaActorPrefixLabel.text = LocalizeSettingsText("Voice Actor:", true);

        gSettingsRowFloatingTooltipVoiceMetaActorValueLabel = $.CreatePanel("Label", voiceMetaActorRow, "QOLSettingsRowFloatingTooltipVoiceMetaActorValue");
        gSettingsRowFloatingTooltipVoiceMetaActorValueLabel.AddClass("QOLCustomRowTooltipVoiceMetaActorValue");
    }
    return gSettingsRowFloatingTooltipPanel;
}

function ApplySettingsRowFloatingTooltipTier(perfTier) {
    var panel = gSettingsRowFloatingTooltipPanel;
    if (!panel || !panel.IsValid || !panel.IsValid()) return;
    var normalizedTier = NormalizePerfImpactTier(perfTier);
    panel.SetHasClass("PerfNone", normalizedTier === PERF_IMPACT_TIER_NONE);
    panel.SetHasClass("PerfLow", normalizedTier === PERF_IMPACT_TIER_LOW);
    panel.SetHasClass("PerfMedium", normalizedTier === PERF_IMPACT_TIER_MEDIUM);
    panel.SetHasClass("PerfHigh", normalizedTier === PERF_IMPACT_TIER_HIGH);
}

function NormalizeSettingsTooltipScaleFactor(value) {
    var n = Number(value);
    if (!isFinite(n) || n <= 0) return 1.0;
    if (n < 0.05) return 0.05;
    if (n > 20.0) return 20.0;
    return n;
}

function GetSettingsTooltipHostAxisScale(actualSize, desiredSize) {
    var actual = Number(actualSize);
    if (!isFinite(actual) || actual <= 0) return 1.0;
    var desired = Number(desiredSize);
    if (!isFinite(desired) || desired <= 0) return 1.0;
    return NormalizeSettingsTooltipScaleFactor(actual / desired);
}

function PositionSettingsRowFloatingTooltip(anchorPanel) {
    var panel = gSettingsRowFloatingTooltipPanel;
    if (!panel || !panel.IsValid || !panel.IsValid()) return;
    if (!anchorPanel || !anchorPanel.IsValid || !anchorPanel.IsValid()) return;

    var host = panel.GetParent ? panel.GetParent() : null;
    if (!host || !host.IsValid || !host.IsValid()) return;

    var anchorX = Number(GetPanelXOffsetWithinAncestor(anchorPanel, host));
    var anchorY = Number(GetPanelYOffsetWithinAncestor(anchorPanel, host));
    var anchorWidth = Number(anchorPanel.actuallayoutwidth);
    var anchorHeight = Number(anchorPanel.actuallayoutheight);
    var panelWidth = Number(panel.actuallayoutwidth);
    var panelHeight = Number(panel.actuallayoutheight);
    var hostWidth = Number(host.actuallayoutwidth);
    var hostHeight = Number(host.actuallayoutheight);
    var hostDesiredWidth = Number(host.desiredlayoutwidth);
    var hostDesiredHeight = Number(host.desiredlayoutheight);

    if (!isFinite(anchorX) || !isFinite(anchorY) || !isFinite(anchorWidth) || !isFinite(anchorHeight) ||
        !isFinite(panelWidth) || panelWidth <= 0 || !isFinite(panelHeight) || panelHeight <= 0 ||
        !isFinite(hostWidth) || hostWidth <= 0 || !isFinite(hostHeight) || hostHeight <= 0) {
        $.Schedule(0.0, function() {
            if (!gSettingsRowFloatingTooltipAnchor || gSettingsRowFloatingTooltipAnchor !== anchorPanel) return;
            PositionSettingsRowFloatingTooltip(anchorPanel);
        });
        return;
    }

    var edgeMargin = 8;
    var gap = 4;
    var attachNudgeLeft = 12;
    var xMin = edgeMargin;
    var xMax = Math.max(xMin, Math.round(hostWidth - panelWidth - edgeMargin));
    var xRight = Math.round(anchorX + anchorWidth + gap - attachNudgeLeft);
    var xLeft = Math.round(anchorX - panelWidth - gap);

    var side = "right";
    var x = xRight;
    if (xRight + panelWidth > hostWidth - edgeMargin && xLeft >= xMin) {
        side = "left";
        x = xLeft;
    }
    x = Math.max(xMin, Math.min(xMax, x));

    var yMin = edgeMargin;
    var yMax = Math.max(yMin, Math.round(hostHeight - panelHeight - edgeMargin));
    var y = Math.round(anchorY + (anchorHeight * 0.5) - (panelHeight * 0.5));
    y = Math.max(yMin, Math.min(yMax, y));

    // Stabilize tooltip placement: if target anchor position is unchanged, skip
    // re-writing style values to avoid visible oscillation on some rows.
    if (
        isFinite(gSettingsRowFloatingTooltipLastX) &&
        isFinite(gSettingsRowFloatingTooltipLastY) &&
        gSettingsTooltipLastSide === side &&
        Math.abs(Number(gSettingsRowFloatingTooltipLastX) - Number(x)) < 0.5 &&
        Math.abs(Number(gSettingsRowFloatingTooltipLastY) - Number(y)) < 0.5
    ) {
        return;
    }

    var hostScaleX = GetSettingsTooltipHostAxisScale(hostWidth, hostDesiredWidth);
    var hostScaleY = GetSettingsTooltipHostAxisScale(hostHeight, hostDesiredHeight);
    var styleToActualX = NormalizeSettingsTooltipScaleFactor(gSettingsTooltipStyleToActualX);
    var styleToActualY = NormalizeSettingsTooltipScaleFactor(gSettingsTooltipStyleToActualY);

    var styleX = Number(x) / (hostScaleX * styleToActualX);
    var styleY = Number(y) / (hostScaleY * styleToActualY);
    if (!isFinite(styleX) || !isFinite(styleY)) {
        styleX = Number(x);
        styleY = Number(y);
    }

    panel.style.x = String(Math.round(styleX)) + "px";
    panel.style.y = String(Math.round(styleY)) + "px";
    gSettingsTooltipLastWrittenStyleX = styleX;
    gSettingsTooltipLastWrittenStyleY = styleY;

    if ((Number(gSettingsTooltipCalibrationFramesRemaining) || 0) > 0) {
        var appliedActualX = Number(GetPanelXOffsetWithinAncestor(panel, host));
        var appliedActualY = Number(GetPanelYOffsetWithinAncestor(panel, host));
        if (isFinite(appliedActualX) && Math.abs(styleX) >= 8) {
            var measuredX = appliedActualX / (styleX * hostScaleX);
            if (isFinite(measuredX) && measuredX > 0.05 && measuredX < 20.0) {
                gSettingsTooltipStyleToActualX = (gSettingsTooltipStyleToActualX * 0.7) + (measuredX * 0.3);
            }
        }
        if (isFinite(appliedActualY) && Math.abs(styleY) >= 8) {
            var measuredY = appliedActualY / (styleY * hostScaleY);
            if (isFinite(measuredY) && measuredY > 0.05 && measuredY < 20.0) {
                gSettingsTooltipStyleToActualY = (gSettingsTooltipStyleToActualY * 0.7) + (measuredY * 0.3);
            }
        }
        gSettingsTooltipCalibrationFramesRemaining = Math.max(0, (Number(gSettingsTooltipCalibrationFramesRemaining) || 0) - 1);
    }
    gSettingsRowFloatingTooltipLastX = x;
    gSettingsRowFloatingTooltipLastY = y;
    gSettingsTooltipLastSide = side;

    var anchorId = "";
    try { anchorId = String(anchorPanel.id || ""); } catch (eAid) { anchorId = ""; }
    SettingsTooltipDebugLog(
        "pos_simple anchor=" + (anchorId || "-") +
        " side=" + side +
        " x=" + String(Math.round(x)) +
        " y=" + String(Math.round(y)) +
        " style=" + String(Math.round(styleX)) + "," + String(Math.round(styleY)) +
        " host=" + String(Math.round(hostWidth)) + "x" + String(Math.round(hostHeight)) +
        " hScale=" + hostScaleX.toFixed(3) + "," + hostScaleY.toFixed(3) +
        " s2a=" + gSettingsTooltipStyleToActualX.toFixed(3) + "," + gSettingsTooltipStyleToActualY.toFixed(3)
    );
}

function TryGetCursorScreenPosition() {
    // GameUI.GetCursorPosition confirmed absent.
    return null;
}

function ShowSettingsRowFloatingTooltip(anchorPanel, perfText, bodyText, perfTier, createdBy, options) {
    if (!anchorPanel || !anchorPanel.IsValid || !anchorPanel.IsValid()) return;
    if (!HasMeaningfulFloatingTooltipContent(perfTier, bodyText, createdBy, options)) {
        HideSettingsRowFloatingTooltip();
        return;
    }
    CancelSettingsRowFloatingTooltipHide();
    var bodyLine = LocalizeSettingsText(String(bodyText || ""), true);
    var createdByName = String(createdBy || "").trim();
    var tierKey = NormalizePerfImpactTier(perfTier);
    var voiceMetaInfo = options && options.voiceMeta ? options.voiceMeta : null;
    var voiceMetaAuthor = String(voiceMetaInfo && voiceMetaInfo.author ? voiceMetaInfo.author : "").trim();
    var voiceMetaActor = String(voiceMetaInfo && voiceMetaInfo.voiceActor ? voiceMetaInfo.voiceActor : "").trim();
    var useVoiceMetaMode = (voiceMetaAuthor.length > 0 || voiceMetaActor.length > 0);

    var panel = EnsureSettingsRowFloatingTooltipPanel();
    if (!panel || !panel.IsValid || !panel.IsValid()) return;
    if (
        !gSettingsRowFloatingTooltipPerfPrefixLabel ||
        !gSettingsRowFloatingTooltipPerfValueLabel ||
        !gSettingsRowFloatingTooltipBodyLabel ||
        !gSettingsRowFloatingTooltipCreatorPrefixLabel ||
        !gSettingsRowFloatingTooltipCreatorValueLabel ||
        !gSettingsRowFloatingTooltipVoiceMetaAuthorPrefixLabel ||
        !gSettingsRowFloatingTooltipVoiceMetaAuthorValueLabel ||
        !gSettingsRowFloatingTooltipVoiceMetaActorPrefixLabel ||
        !gSettingsRowFloatingTooltipVoiceMetaActorValueLabel
    ) return;

    var previousAnchor = gSettingsRowFloatingTooltipAnchor;
    gSettingsRowFloatingTooltipAnchor = anchorPanel;
    gSettingsTooltipCalibrationFramesRemaining = 2;
    gSettingsRowFloatingTooltipPerfPrefixLabel.text = LocalizeSettingsText("FPS Impact:", true);
    gSettingsRowFloatingTooltipPerfValueLabel.text = GetPerfImpactDisplayLabel(tierKey);
    gSettingsRowFloatingTooltipBodyLabel.text = bodyLine;
    gSettingsRowFloatingTooltipCreatorPrefixLabel.text = LocalizeSettingsText("Created By:", true);
    gSettingsRowFloatingTooltipCreatorValueLabel.text = createdByName;
    gSettingsRowFloatingTooltipVoiceMetaAuthorPrefixLabel.text = LocalizeSettingsText("Author:", true);
    gSettingsRowFloatingTooltipVoiceMetaAuthorValueLabel.text = voiceMetaAuthor;
    gSettingsRowFloatingTooltipVoiceMetaActorPrefixLabel.text = LocalizeSettingsText("Voice Actor:", true);
    gSettingsRowFloatingTooltipVoiceMetaActorValueLabel.text = voiceMetaActor;
    panel.SetHasClass("NoBody", bodyLine.length <= 0);
    panel.SetHasClass("NoPerf", tierKey === PERF_IMPACT_TIER_NONE);
    panel.SetHasClass("NoCreator", (createdByName.length <= 0) || useVoiceMetaMode);
    panel.SetHasClass("VoiceMetaMode", useVoiceMetaMode);
    panel.SetHasClass("NoVoiceMeta", !useVoiceMetaMode);
    panel.SetHasClass("NoVoiceMetaAuthor", voiceMetaAuthor.length <= 0);
    panel.SetHasClass("NoVoiceMetaActor", voiceMetaActor.length <= 0);
    panel.SetHasClass("FooterSaveWarningTooltip", !!(options && options.footerSaveWarning));
    ApplySettingsRowFloatingTooltipTier(tierKey);

    var wasVisible = !!(panel.BHasClass && panel.BHasClass("Visible"));
    var cursorNow = TryGetCursorScreenPosition();

    panel.SetHasClass("Visible", true);
    PositionSettingsRowFloatingTooltip(anchorPanel);
    $.Schedule(0.0, function() {
        if (!gSettingsRowFloatingTooltipAnchor || gSettingsRowFloatingTooltipAnchor !== anchorPanel) return;
        PositionSettingsRowFloatingTooltip(anchorPanel);
    });
    if (cursorNow) {
        gSettingsRowFloatingTooltipLastCursorX = cursorNow.x;
        gSettingsRowFloatingTooltipLastCursorY = cursorNow.y;
    }
    var anchorId = "";
    try { anchorId = String(anchorPanel.id || ""); } catch (eAid) { anchorId = ""; }
    var sameAnchorAsLast = !!(previousAnchor && previousAnchor === anchorPanel);
    SettingsTooltipDebugLog(
        "show anchor=" + (anchorId || "-") +
        " sameAnchor=" + (sameAnchorAsLast ? "1" : "0") +
        " wasVisible=" + (wasVisible ? "1" : "0") +
        " sameCursor=" + ((cursorNow && isFinite(gSettingsRowFloatingTooltipLastCursorX) && isFinite(gSettingsRowFloatingTooltipLastCursorY)) ? "1" : "0"),
        true
    );
    PrimeSettingsTooltipScrollSnapshot();
    EnsureSettingsRowFloatingTooltipTracking();
}

function HideSettingsRowFloatingTooltip() {
    CancelSettingsRowFloatingTooltipHide();
    gSettingsRowFloatingTooltipAnchor = null;
    if (!gSettingsRowFloatingTooltipPanel || !gSettingsRowFloatingTooltipPanel.IsValid || !gSettingsRowFloatingTooltipPanel.IsValid()) return;
    gSettingsRowFloatingTooltipPanel.SetHasClass("Visible", false);
    gSettingsRowFloatingTooltipTrackScheduled = false;
    gSettingsTooltipLastListScrollY = NaN;
    gSettingsTooltipLastHostScrollY = NaN;
    gSettingsTooltipLastAnchorLocalY = NaN;
    SettingsTooltipDebugLog("hide", true);
}

function SetSettingsTooltipThemeActive(isActive) {
    var root = FindRootPanel();
    if (root && root.SetHasClass) {
        root.SetHasClass(SETTINGS_TOOLTIP_THEME_CLASS, !!isActive);
        var tooltipManager = null;
        try { tooltipManager = root.FindChildTraverse ? root.FindChildTraverse("TooltipManager") : null; } catch (e0) { tooltipManager = null; }
        if (tooltipManager && tooltipManager.SetHasClass) {
            tooltipManager.SetHasClass(SETTINGS_TOOLTIP_THEME_CLASS, !!isActive);
        }
    }
}

function SetSettingsTooltipPerfTierClass(perfTier) {
    var tier = NormalizePerfImpactTier(perfTier);
    var isNone = tier === PERF_IMPACT_TIER_NONE;
    var isLow = tier === PERF_IMPACT_TIER_LOW;
    var isMedium = tier === PERF_IMPACT_TIER_MEDIUM;
    var isHigh = tier === PERF_IMPACT_TIER_HIGH;
    var root = FindRootPanel();
    if (root && root.SetHasClass) {
        root.SetHasClass(SETTINGS_TOOLTIP_PERF_CLASS_NONE, isNone);
        root.SetHasClass(SETTINGS_TOOLTIP_PERF_CLASS_LOW, isLow);
        root.SetHasClass(SETTINGS_TOOLTIP_PERF_CLASS_MEDIUM, isMedium);
        root.SetHasClass(SETTINGS_TOOLTIP_PERF_CLASS_HIGH, isHigh);
    }
    if (root && root.FindChildTraverse) {
        var tooltipManager = null;
        try { tooltipManager = root.FindChildTraverse("TooltipManager"); } catch (e0) { tooltipManager = null; }
        if (tooltipManager && tooltipManager.SetHasClass) {
            tooltipManager.SetHasClass(SETTINGS_TOOLTIP_PERF_CLASS_NONE, isNone);
            tooltipManager.SetHasClass(SETTINGS_TOOLTIP_PERF_CLASS_LOW, isLow);
            tooltipManager.SetHasClass(SETTINGS_TOOLTIP_PERF_CLASS_MEDIUM, isMedium);
            tooltipManager.SetHasClass(SETTINGS_TOOLTIP_PERF_CLASS_HIGH, isHigh);
        }
    }
}

function ShowSettingsTextTooltip(anchorPanel, text, perfTier) {
    if (!anchorPanel || !text) return;
    SetSettingsTooltipPerfTierClass(perfTier || PERF_IMPACT_TIER_NONE);
    $.DispatchEvent("UIShowTextTooltip", anchorPanel, text);
}

function HideSettingsTextTooltip() {
    SetSettingsTooltipPerfTierClass(PERF_IMPACT_TIER_NONE);
    $.DispatchEvent("UIHideTextTooltip");
}

function HasMeaningfulFloatingTooltipContent(perfTier, bodyText, createdBy, options) {
    var tierKey = NormalizePerfImpactTier(perfTier);
    var hasPerf = tierKey !== PERF_IMPACT_TIER_NONE;
    var hasBody = String(bodyText || "").trim().length > 0;
    var hasCreator = String(createdBy || "").trim().length > 0;
    var voiceMeta = options && options.voiceMeta ? options.voiceMeta : null;
    var hasVoiceMeta =
        String(voiceMeta && voiceMeta.author ? voiceMeta.author : "").trim().length > 0 ||
        String(voiceMeta && voiceMeta.voiceActor ? voiceMeta.voiceActor : "").trim().length > 0;
    return hasPerf || hasBody || hasCreator || hasVoiceMeta;
}

function NormalizePerfImpactTier(value) {
    var key = String(value || "").toLowerCase();
    if (PERF_IMPACT_TIER_ORDER.hasOwnProperty(key)) return key;
    return PERF_IMPACT_TIER_NONE;
}

function MaxPerfImpactTier(a, b) {
    var aa = NormalizePerfImpactTier(a);
    var bb = NormalizePerfImpactTier(b);
    return (PERF_IMPACT_TIER_ORDER[bb] > PERF_IMPACT_TIER_ORDER[aa]) ? bb : aa;
}

function GetEstimatedPerfImpactTier(configId, type, options) {
    var tier = PERF_IMPACT_TIER_NONE;
    var key = String(configId || "");
    if (key && SETTING_PERF_IMPACT_TIERS.hasOwnProperty(key)) {
        tier = MaxPerfImpactTier(tier, SETTING_PERF_IMPACT_TIERS[key]);
    }
    if (Array.isArray(options)) {
        for (var i = 0; i < options.length; i++) {
            var opt = options[i];
            if (!opt || !opt.key) continue;
            var optKey = String(opt.key || "");
            if (!optKey || !SETTING_PERF_IMPACT_TIERS.hasOwnProperty(optKey)) continue;
            tier = MaxPerfImpactTier(tier, SETTING_PERF_IMPACT_TIERS[optKey]);
        }
    }
    if (type === "runtime_slider" || type === "runtime_buttongroup") {
        tier = MaxPerfImpactTier(tier, PERF_IMPACT_TIER_NONE);
    }
    return tier;
}

function GetPerfImpactWeightForTier(tier) {
    var normalized = NormalizePerfImpactTier(tier);
    if (!PERF_IMPACT_TIER_ORDER.hasOwnProperty(normalized)) return 0;
    return Number(PERF_IMPACT_TIER_ORDER[normalized]) || 0;
}

function IsPerfImpactConfigKeyEnabled(configKey) {
    var key = String(configKey || "");
    if (!key || !MOD_CONFIG || !MOD_CONFIG.hasOwnProperty(key)) return false;
    var value = MOD_CONFIG[key];
    if (value === null || value === undefined) return false;
    if (typeof value === "boolean") return value === true;
    if (typeof value === "number") return Number(value) > 0;
    if (typeof value === "string") {
        var normalized = String(value).trim().toLowerCase();
        if (!normalized) return false;
        if (normalized === "0" || normalized === "false" || normalized === "off" || normalized === "none") return false;
        return true;
    }
    return !!value;
}

function GetSummedPerfImpactTierForConfigKeys(configKeys) {
    if (!Array.isArray(configKeys) || configKeys.length <= 0) return PERF_IMPACT_TIER_NONE;
    var totalWeight = 0;
    var maxTier = PERF_IMPACT_TIER_NONE;
    var seen = {};
    for (var i = 0; i < configKeys.length; i++) {
        var key = String(configKeys[i] || "");
        if (!key || seen[key]) continue;
        seen[key] = true;
        if (!SETTING_PERF_IMPACT_TIERS.hasOwnProperty(key)) continue;
        if (!IsPerfImpactConfigKeyEnabled(key)) continue;
        var tier = NormalizePerfImpactTier(SETTING_PERF_IMPACT_TIERS[key]);
        totalWeight += GetPerfImpactWeightForTier(tier);
        maxTier = MaxPerfImpactTier(maxTier, tier);
    }

    if (totalWeight <= 0) return PERF_IMPACT_TIER_NONE;

    var sumTier = PERF_IMPACT_TIER_LOW;
    if (totalWeight >= 4) sumTier = PERF_IMPACT_TIER_HIGH;
    else if (totalWeight >= 2) sumTier = PERF_IMPACT_TIER_MEDIUM;

    return MaxPerfImpactTier(maxTier, sumTier);
}

function BuildPerfImpactLineForTier(tier) {
    var normalizedTier = NormalizePerfImpactTier(tier);
    return "FPS Impact: " + GetPerfImpactDisplayLabel(normalizedTier);
}

function GetPerfImpactDisplayLabel(tier) {
    var normalizedTier = NormalizePerfImpactTier(tier);
    var raw = PERF_IMPACT_LABEL_BY_TIER.hasOwnProperty(normalizedTier)
        ? PERF_IMPACT_LABEL_BY_TIER[normalizedTier]
        : PERF_IMPACT_LABEL_BY_TIER[PERF_IMPACT_TIER_NONE];
    return LocalizeSettingsText(raw, true);
}

function GetSettingCreatedBy(configId, label) {
    var key = String(configId || "");
    if (key && SETTING_CREATED_BY_BY_CONFIG.hasOwnProperty(key)) {
        return String(SETTING_CREATED_BY_BY_CONFIG[key] || "");
    }
    var labelKey = String(label || "");
    if (labelKey && SETTING_CREATED_BY_BY_LABEL.hasOwnProperty(labelKey)) {
        return String(SETTING_CREATED_BY_BY_LABEL[labelKey] || "");
    }
    return "";
}

function GetSectionCreatedBy(title) {
    var key = String(title || "");
    if (!key) return "";
    if (!SECTION_CREATED_BY_BY_TITLE.hasOwnProperty(key)) return "";
    return String(SECTION_CREATED_BY_BY_TITLE[key] || "");
}

function GetCurrentSettingsCategoryKey() {
    var tabName = String(currentTab || "");
    if (!tabName) return "";
    var sectionName = String(gCurrentSettingsSectionTitle || "");
    if (sectionName) return tabName + " / " + sectionName;
    return tabName;
}

function GetSectionDescriptionOverride(tabName, title, fallbackDescription) {
    var tabKey = String(tabName || "");
    var titleKey = String(title || "");
    if (tabKey && titleKey) {
        var key = tabKey + "|" + titleKey;
        if (SECTION_DESCRIPTION_OVERRIDE_BY_TAB_TITLE.hasOwnProperty(key)) {
            return String(SECTION_DESCRIPTION_OVERRIDE_BY_TAB_TITLE[key] || "");
        }
    }
    return String(fallbackDescription || "");
}

function GetCreatedByFromConfigKeys(configKeys) {
    if (!Array.isArray(configKeys) || configKeys.length <= 0) return "";
    var seen = {};
    var names = [];
    for (var i = 0; i < configKeys.length; i++) {
        var key = String(configKeys[i] || "");
        if (!key || seen[key]) continue;
        seen[key] = true;
        if (!SETTING_CREATED_BY_BY_CONFIG.hasOwnProperty(key)) continue;
        var name = String(SETTING_CREATED_BY_BY_CONFIG[key] || "").trim();
        if (!name) continue;
        if (names.indexOf(name) === -1) names.push(name);
    }
    return names.join(", ");
}

function GetSettingDescriptionOverride(configId, label, fallbackDescription, categoryKey) {
    var catKey = String(categoryKey || "");
    var labelKey = String(label || "");
    var key = String(configId || "");
    var rowOverride = "";

    if (catKey && labelKey) {
        var rowKey = catKey + "|" + labelKey;
        if (SETTING_DESCRIPTION_OVERRIDE_BY_CATEGORY_ROW.hasOwnProperty(rowKey)) {
            rowOverride = String(SETTING_DESCRIPTION_OVERRIDE_BY_CATEGORY_ROW[rowKey] || "");
        }
    }

    if (key === "VOICE_TYPE") {
        var baseVoiceDesc = rowOverride;
        if (!baseVoiceDesc && SETTING_DESCRIPTION_OVERRIDE_BY_CONFIG.hasOwnProperty(key)) {
            baseVoiceDesc = String(SETTING_DESCRIPTION_OVERRIDE_BY_CONFIG[key] || "");
        }
        if (!baseVoiceDesc) baseVoiceDesc = String(fallbackDescription || "");
        return BuildCustomAnnouncerVoiceDescription(baseVoiceDesc, MOD_CONFIG && MOD_CONFIG.VOICE_TYPE);
    }

    if (rowOverride) return rowOverride;

    if (labelKey === "Size") return "Scales the element.";
    if (labelKey === "Opacity") return "Changes the element's transparency.";
    if (labelKey === "Horizontal Offset") return "Moves the element horizontally.";
    if (labelKey === "Vertical Offset") return "Moves the element vertically.";
    if (key && SETTING_DESCRIPTION_OVERRIDE_BY_CONFIG.hasOwnProperty(key)) {
        return String(SETTING_DESCRIPTION_OVERRIDE_BY_CONFIG[key] || "");
    }
    return String(fallbackDescription || "");
}

function BuildPerfImpactTooltipLine(configId, type, options) {
    var tier = GetEstimatedPerfImpactTier(configId, type, options);
    return {
        tier: tier,
        line: BuildPerfImpactLineForTier(tier)
    };
}

function BuildSectionPerfImpactTooltipLineFromTitleRow(titleRow, enableConfigId, enableType, enableOptions) {
    var tier = PERF_IMPACT_TIER_NONE;
    var key = String(enableConfigId || "");
    if (key) {
        tier = GetEstimatedPerfImpactTier(key, enableType || "toggle", enableOptions || null);
    }
    return {
        tier: tier,
        line: BuildPerfImpactLineForTier(tier)
    };
}

function BindSectionPerfTooltip(titleRow, titleName, fallbackDescription, tabName, enableConfigId, enableType, enableOptions) {
    if (!titleRow || !titleRow.SetPanelEvent) return;
    var sectionCreatedBy = GetSectionCreatedBy(titleName);
    var sectionDescription = GetSectionDescriptionOverride(tabName, titleName, fallbackDescription || "");
    titleRow.SetPanelEvent("onmouseover", function() {
        CancelSettingsRowFloatingTooltipHide();
        var info = BuildSectionPerfImpactTooltipLineFromTitleRow(titleRow, enableConfigId, enableType, enableOptions);
        var createdBy = sectionCreatedBy;
        var localizedDescription = LocalizeSettingsText(sectionDescription || "");
        var sectionTier = (info && info.tier) ? info.tier : PERF_IMPACT_TIER_NONE;
        if (!HasMeaningfulFloatingTooltipContent(sectionTier, localizedDescription || "", createdBy)) {
            HideSettingsRowFloatingTooltip();
            return;
        }
        ShowSettingsRowFloatingTooltip(
            titleRow,
            "",
            localizedDescription || "",
            sectionTier,
            createdBy
        );
    });
    titleRow.SetPanelEvent("onmouseout", function() {
        HideSettingsRowFloatingTooltipDeferred("section_mouseout");
    });
}

function CreateAnimatedInlineToggleSection(parent, title, enableConfigId, enableDescription, buildRowsFn, enableToggleOptions, sectionOptions) {
    var localizedTitle = LocalizeSettingsText(title || "");
    gCurrentSettingsSectionTitle = String(title || "");
    var invertEnableToggle = !!(enableToggleOptions && enableToggleOptions.invert === true);
    var getSectionEnabled = function() {
        return invertEnableToggle ? (MOD_CONFIG[enableConfigId] !== 1) : (MOD_CONFIG[enableConfigId] === 1);
    };
    if (gSearchCollectMode && gSearchCollectState) {
        CreateSectionTitle(parent, title);
        var searchToggleOptions = invertEnableToggle ? [{ invert: true }] : null;
        CreateRow(parent, "Enable", enableConfigId, "toggle", null, null, null, searchToggleOptions, enableDescription || "");
        if (buildRowsFn) {
            buildRowsFn(parent);
        }
        return null;
    }

    var safeTitleId = String(title || "Section").replace(/[^A-Za-z0-9]/g, "");
    var titleRow = $.CreatePanel("Panel", parent, safeTitleId + "SectionTitleRow");
    titleRow.AddClass("SectionTitleRow");

    var titleHead = $.CreatePanel("Panel", titleRow, safeTitleId + "SectionTitleHead");
    titleHead.AddClass("SectionTitleInlineHead");

    var titleLabel = $.CreatePanel("Label", titleHead, safeTitleId + "SectionTitle");
    titleLabel.AddClass("SectionTitle");
    titleLabel.AddClass("SectionTitleInlineLabel");
    titleLabel.text = localizedTitle;
    BindSectionPerfTooltip(titleRow, title, enableDescription || "", currentTab, enableConfigId, "toggle", enableToggleOptions || null);

    var body = $.CreatePanel("Panel", parent, safeTitleId + "SectionBody");
    body.AddClass("SettingsSectionBody");

    CreateSectionResetButton(titleRow, function() {
        var keys = [];
        var seen = {};
        CollectResetKeysFromPanel(body, keys, seen);
        if (sectionOptions && sectionOptions.titleCheckbox && sectionOptions.titleCheckbox.configId && !seen[sectionOptions.titleCheckbox.configId]) {
            keys.push(sectionOptions.titleCheckbox.configId);
            seen[sectionOptions.titleCheckbox.configId] = true;
        }
        return keys;
    }, enableConfigId, titleHead);

    var toggleBtn = $.CreatePanel("Panel", titleRow, safeTitleId + "SectionToggle");
    toggleBtn.AddClass("SectionInlineToggleBtn");
    var toggleSwitchButton = $.CreatePanel("Button", toggleBtn, safeTitleId + "SectionToggleButton");
    toggleSwitchButton.AddClass("SwitchButton");
    var toggleHandle = $.CreatePanel("Panel", toggleSwitchButton, "handle");
    toggleHandle.AddClass("SectionInlineToggleHandle");

    var titleCheckboxBtn = null;
    if (sectionOptions && sectionOptions.titleCheckbox) {
        sectionOptions.titleCheckbox.isAvailableFn = getSectionEnabled;
        titleCheckboxBtn = CreateSectionTitleCheckboxToggle(
            titleRow,
            sectionOptions.titleCheckbox.label,
            sectionOptions.titleCheckbox.configId,
            sectionOptions.titleCheckbox
        );
    }

    var animToken = 0;
    var lastAppliedEnabled = null;
    var applyBodyState = function(enabled, animate) {
        lastAppliedEnabled = enabled;
        animToken++;
        var token = animToken;
        toggleBtn.SetHasClass("Active", enabled);
        toggleBtn.SetHasClass("ToggleOn", enabled);
        toggleBtn.SetHasClass("ToggleOff", !enabled);
        if (titleCheckboxBtn && titleCheckboxBtn.qolRefreshTitleCheckbox) {
            titleCheckboxBtn.qolRefreshTitleCheckbox();
        }

        if (!animate) {
            body.SetHasClass("ShowPrep", false);
            body.SetHasClass("Hiding", false);
            body.SetHasClass("Collapsed", !enabled);
            body.hittest = enabled;
            body.hittestchildren = enabled;
            return;
        }

        if (enabled) {
            body.SetHasClass("Collapsed", false);
            body.SetHasClass("Hiding", false);
            body.SetHasClass("ShowPrep", true);
            body.hittest = true;
            body.hittestchildren = true;
            $.Schedule(0.01, function() {
                if (!body || !body.IsValid || !body.IsValid()) return;
                if (animToken !== token) return;
                body.SetHasClass("ShowPrep", false);
            });
        } else {
            body.SetHasClass("Collapsed", false);
            body.SetHasClass("ShowPrep", false);
            body.SetHasClass("Hiding", true);
            body.hittest = false;
            body.hittestchildren = false;
            $.Schedule(0.17, function() {
                if (!body || !body.IsValid || !body.IsValid()) return;
                if (animToken !== token) return;
                body.SetHasClass("Hiding", false);
                body.SetHasClass("Collapsed", true);
            });
        }
    };
    applyBodyState(getSectionEnabled(), false);

    // Keep the header toggle + body collapse in sync when the config changes WITHOUT a full
    // rebuild — e.g. the section reset button, config import, or a preset applied via soft-refresh.
    // Soft refresh only runs the row-sync callbacks; it does not re-create the section, so without
    // this the switch and the collapsed state would drift from MOD_CONFIG. The lastAppliedEnabled
    // guard means a manual toggle (which already applied the new state) never re-snaps mid-animation.
    RegisterSettingsListRowSync(function() {
        if (!body || !body.IsValid || !body.IsValid()) return false;
        var currentEnabled = getSectionEnabled();
        if (currentEnabled !== lastAppliedEnabled) {
            applyBodyState(currentEnabled, false);
        }
        return true;
    });

    toggleSwitchButton.SetPanelEvent("onactivate", function() {
        $.DispatchEvent("UIHideTextTooltip");
        var nextEnabled = !getSectionEnabled();
        MOD_CONFIG[enableConfigId] = invertEnableToggle ? (nextEnabled ? 0 : 1) : (nextEnabled ? 1 : 0);
        applyBodyState(nextEnabled, true);
        SaveAndSync();
    });

    if (buildRowsFn) {
        buildRowsFn(body);
    }
    return body;
}

// Collapsed-by-default expander with NO config gate — a pure-visual "dropdown" to tuck a long
// list of optional rows (e.g. per-stat visibility toggles) out of the way so casual users don't
// see them by default. Clicking the header expands/collapses the body. The open/closed state is
// transient (closure var), not persisted; the rows inside are normal CreateRow rows, so a parent
// section's reset still collects their keys (CollectResetKeysFromPanel recurses through the body).
function CreateCollapsibleSubSection(parent, title, buildRowsFn) {
    var localizedTitle = LocalizeSettingsText(title || "");
    if (gSearchCollectMode && gSearchCollectState) {
        // Search mode: flatten so the inner rows stay searchable instead of being hidden away.
        if (buildRowsFn) buildRowsFn(parent);
        return null;
    }

    var safeTitleId = String(title || "SubSection").replace(/[^A-Za-z0-9]/g, "");

    var header = $.CreatePanel("Button", parent, safeTitleId + "SubSectionHeader");
    header.AddClass("QOLCollapsibleSubHeader");

    // Arrow icon FIRST so flow-children:right puts it on the far left, leading the label like a
    // standard accordion/disclosure triangle. A real glyph image (unicode triangles don't render
    // in the Panorama font); CSS rotates it 90° via the header's .Expanded class: right =
    // collapsed, down = expanded.
    var chevron = $.CreatePanel("Panel", header, safeTitleId + "SubSectionChevron");
    chevron.AddClass("QOLCollapsibleSubChevron");

    // Label follows the arrow and fills the rest of the row.
    var headLabel = $.CreatePanel("Label", header, safeTitleId + "SubSectionTitle");
    headLabel.AddClass("QOLCollapsibleSubLabel");
    headLabel.text = localizedTitle;

    var body = $.CreatePanel("Panel", parent, safeTitleId + "SubSectionBody");
    body.AddClass("SettingsSectionBody");

    var expanded = false;
    var animToken = 0;
    var applyBodyState = function(open, animate) {
        animToken++;
        var token = animToken;
        header.SetHasClass("Expanded", open);
        if (!animate) {
            body.SetHasClass("ShowPrep", false);
            body.SetHasClass("Hiding", false);
            body.SetHasClass("Collapsed", !open);
            body.hittest = open;
            body.hittestchildren = open;
            return;
        }
        if (open) {
            body.SetHasClass("Collapsed", false);
            body.SetHasClass("Hiding", false);
            body.SetHasClass("ShowPrep", true);
            body.hittest = true;
            body.hittestchildren = true;
            $.Schedule(0.01, function() {
                if (!body || !body.IsValid || !body.IsValid()) return;
                if (animToken !== token) return;
                body.SetHasClass("ShowPrep", false);
            });
        } else {
            body.SetHasClass("Collapsed", false);
            body.SetHasClass("ShowPrep", false);
            body.SetHasClass("Hiding", true);
            body.hittest = false;
            body.hittestchildren = false;
            $.Schedule(0.17, function() {
                if (!body || !body.IsValid || !body.IsValid()) return;
                if (animToken !== token) return;
                body.SetHasClass("Hiding", false);
                body.SetHasClass("Collapsed", true);
            });
        }
    };
    applyBodyState(false, false);

    header.SetPanelEvent("onactivate", function() {
        $.DispatchEvent("UIHideTextTooltip");
        expanded = !expanded;
        applyBodyState(expanded, true);
    });

    if (buildRowsFn) buildRowsFn(body);
    return body;
}

function CreateAnimatedInlineEnumSection(parent, title, configId, activeValue, buildRowsFn) {
    var getSectionEnabled = function() {
        return MOD_CONFIG[configId] === activeValue;
    };

    if (gSearchCollectMode && gSearchCollectState) {
        CreateSectionTitle(parent, title);
        if (buildRowsFn) buildRowsFn(parent);
        return null;
    }

    var safeTitleId = String(title || "Section").replace(/[^A-Za-z0-9]/g, "");
    var body = $.CreatePanel("Panel", parent, safeTitleId + "EnumSectionBody");
    body.AddClass("SettingsSectionBody");

    var animToken = 0;
    var applyBodyState = function(enabled, animate) {
        animToken++;
        var token = animToken;
        if (!animate) {
            body.SetHasClass("ShowPrep", false);
            body.SetHasClass("Hiding", false);
            body.SetHasClass("Collapsed", !enabled);
            body.hittest = enabled;
            body.hittestchildren = enabled;
            return;
        }
        if (enabled) {
            body.SetHasClass("Collapsed", false);
            body.SetHasClass("Hiding", false);
            body.SetHasClass("ShowPrep", true);
            body.hittest = true;
            body.hittestchildren = true;
            $.Schedule(0.01, function() {
                if (!body || !body.IsValid()) return;
                if (animToken !== token) return;
                body.SetHasClass("ShowPrep", false);
            });
        } else {
            body.SetHasClass("Collapsed", false);
            body.SetHasClass("ShowPrep", false);
            body.SetHasClass("Hiding", true);
            body.hittest = false;
            body.hittestchildren = false;
            $.Schedule(0.17, function() {
                if (!body || !body.IsValid()) return;
                if (animToken !== token) return;
                body.SetHasClass("Hiding", false);
                body.SetHasClass("Collapsed", true);
            });
        }
    };
    var lastEnumEnabled = getSectionEnabled();
    applyBodyState(lastEnumEnabled, false);

    gEnumSectionSyncCallbacks.push(function() {
        if (!body || !body.IsValid()) return;
        var nowEnabled = getSectionEnabled();
        var changed = nowEnabled !== lastEnumEnabled;
        lastEnumEnabled = nowEnabled;
        applyBodyState(nowEnabled, changed);
    });

    if (buildRowsFn) buildRowsFn(body);
    return body;
}

function RefreshEnumSections() {
    for (var i = 0; i < gEnumSectionSyncCallbacks.length; i++) {
        try { gEnumSectionSyncCallbacks[i](); } catch(e) { WarnLog("settings", "op failed: " + (e && e.message ? e.message : String(e || ""))); }
    }
}

function GetAnnouncerVoiceToken(rawVoiceType) {
    var utils = GetSharedSchemaUtils();
    if (utils && typeof utils.GetAnnouncerVoiceToken === "function") {
        return utils.GetAnnouncerVoiceToken(rawVoiceType);
    }
    var normalized = NormalizeVoiceTypeValue(rawVoiceType);
    switch (normalized) {
        case 4: return "Beep";
        case 5: return "Custom_Slot2";
        case 6: return "Custom_Slot3";
        case 7: return "Custom_Slot4";
        case 8: return "Custom_Slot5";
        case 0:
        default:
            break;
    }
    return "Custom_Slot1";
}

function BuildAnnouncerPreviewEventName() {
    var voiceToken = GetAnnouncerVoiceToken(MOD_CONFIG.VOICE_TYPE);
    if (voiceToken === "Beep") return "BuffReminder.Beep";
    return "BuffReminder.Bridge1_" + voiceToken;
}

function BuildAnnouncerBridgeVariantPreviewEventName(variantIndex) {
    var voiceToken = GetAnnouncerVoiceToken(MOD_CONFIG.VOICE_TYPE);
    var variant = Math.round(Number(variantIndex) || 1);
    if (!isFinite(variant) || variant < 1 || variant > 3) variant = 1;
    if (voiceToken === "Beep") return "BuffReminder.Beep";
    return "BuffReminder.Bridge" + String(variant) + "_" + voiceToken;
}

function ResolveAnnouncerEventForVolume(baseEventName) {
    var baseName = String(baseEventName || "");
    if (!baseName) return "";
    var voiceVolume = NormalizeVoiceVolumeValue(MOD_CONFIG.VOICE_VOLUME);
    return baseName + "_V" + String(voiceVolume);
}

function PlayAnnouncerPreviewSound() {
    var eventName = ResolveAnnouncerEventForVolume(BuildAnnouncerPreviewEventName());
    $.DispatchEvent("PlaySoundEffect", eventName);
}

function PlayAnnouncerBridgeVariantPreviewSound(variantIndex) {
    var eventName = ResolveAnnouncerEventForVolume(BuildAnnouncerBridgeVariantPreviewEventName(variantIndex));
    $.DispatchEvent("PlaySoundEffect", eventName);
}

const DL4D_REMINDER_OPTIONS = [
    { label: "Small Camps + Boxes", key: "ENABLE_DL4D_SMALL_CAMPS_BOXES", eventBase: "QOL.DL4D.SmallCampsBoxes" },
    { label: "Rune + Melee Troopers", key: "ENABLE_DL4D_RUNE_MELEE_TROOPERS", eventBase: "QOL.DL4D.RuneMeleeTroopers" },
    { label: "Medium Camps", key: "ENABLE_DL4D_MEDIUM_CAMPS", eventBase: "QOL.DL4D.MediumCamps" },
    { label: "Big Camps + Sinners", key: "ENABLE_DL4D_BIG_CAMPS_SINNERS", eventBase: "QOL.DL4D.BigCampsSinners" },
    { label: "Urn + Gold Rune", key: "ENABLE_DL4D_MIDBOSS_URN_GOLD_RUNE", eventBase: "QOL.DL4D.MidbossUrnGoldRune" },
    { label: "Lane Guardian Weak", key: "ENABLE_DL4D_LANE_GUARDIAN_WEAK", eventBase: "QOL.DL4D.LaneGuardianWeak" },
    { label: "Rune", key: "ENABLE_DL4D_RUNE", eventBase: "QOL.DL4D.Rune" },
    { label: "Walker Weak", key: "ENABLE_DL4D_WALKER_WEAK", eventBase: "QOL.DL4D.WalkerWeak" },
    { label: "Rune + Fast Troopers", key: "ENABLE_DL4D_RUNE_FAST_TROOPERS", eventBase: "QOL.DL4D.RuneFastTroopers" },
    { label: "Rune + Gold Buffs", key: "ENABLE_DL4D_RUNE_GOLD_BUFFS", eventBase: "QOL.DL4D.RuneGoldBuffs" },
    { label: "Rune + Troopers 20s HP", key: "ENABLE_DL4D_RUNE_TROOPERS20_HP", eventBase: "QOL.DL4D.RuneTroopers20Hp" }
];

function ResolveDl4dReminderEventForVolume(eventBase) {
    var baseName = String(eventBase || "");
    if (!baseName) return "";
    return baseName + "_V" + String(NormalizeVoiceVolumeValue(MOD_CONFIG.DL4D_VOLUME));
}

function PlayDl4dReminderPreviewSound(eventBase) {
    var eventName = ResolveDl4dReminderEventForVolume(eventBase);
    if (!eventName) return;
    $.DispatchEvent("PlaySoundEffect", eventName);
}

function CreateDl4dReminderRow(parent, reminder) {
    if (!reminder || !reminder.key) return null;
    var row = CreateRow(parent, reminder.label, reminder.key, "toggle", null, null, null, null);
    if (!row || !row.IsValid || !row.IsValid()) return row;
    row.AddClass("DL4DReminderRow");

    var testBtn = $.CreatePanel("Button", row, "");
    testBtn.AddClass("SectionTitleActionBtn");
    testBtn.AddClass("DL4DReminderTestBtn");
    var testIcon = $.CreatePanel("Image", testBtn, "", {
        src: "s2r://panorama/images/icons/icon_sound_on.vsvg",
        defaultsrc: "",
        scaling: "contain"
    });
    testIcon.AddClass("SectionTitleActionIcon");
    testIcon.AddClass("DL4DReminderTestIcon");

    testBtn.SetPanelEvent("onmouseover", function() {
        HideSettingsTextTooltip();
        CancelSettingsRowFloatingTooltipHide();
        ShowSettingsRowFloatingTooltip(
            testBtn,
            "",
            LocalizeSettingsText("Play Sound", true) + " " + LocalizeSettingsText(reminder.label || "", true),
            PERF_IMPACT_TIER_NONE,
            ""
        );
    });
    testBtn.SetPanelEvent("onmouseout", function() {
        HideSettingsRowFloatingTooltipDeferred("dl4d_reminder_test_mouseout");
    });
    testBtn.SetPanelEvent("onactivate", function() {
        PlayDl4dReminderPreviewSound(reminder.eventBase);
        testBtn.AddClass("SuccessState");
        $.Schedule(0.28, function() {
            if (testBtn && testBtn.IsValid && testBtn.IsValid()) {
                testBtn.RemoveClass("SuccessState");
            }
        });
    });
    return row;
}

function RunConsoleCommand(commandText) {
    if (!commandText || commandText.length === 0) return false;
    try {
        $.DispatchEvent("CitadelConCommand", commandText);
        return true;
    } catch(e0) { WarnLog("settings", "op failed: " + (e0 && e0.message ? e0.message : String(e0 || ""))); }
    return false;
}

function RunConsoleCommandBestEffort(commandText) {
    var cmd = String(commandText || "").trim();
    if (!cmd) return false;
    var didAny = false;

    // Match hero testing behavior first: fire CitadelConCommand directly.
    try {
        $.DispatchEvent("CitadelConCommand", cmd);
        didAny = true;
    } catch(e0) { WarnLog("settings", "op failed: " + (e0 && e0.message ? e0.message : String(e0 || ""))); }

    if (RunConsoleCommand(cmd)) {
        didAny = true;
    }
    return didAny;
}

function DispatchCitadelConCommand(commandText) {
    if (!commandText || commandText.length === 0) return false;
    try {
        $.DispatchEvent("CitadelConCommand", String(commandText));
        return true;
    } catch(e0) { WarnLog("settings", "op failed: " + (e0 && e0.message ? e0.message : String(e0 || ""))); }
    return false;
}

function GetRuntimeButtonGroupDefaultIndex(runtimeGroupKey, explicitDefaultIndex) {
    var hasExplicitDefault = (explicitDefaultIndex !== undefined && explicitDefaultIndex !== null && String(explicitDefaultIndex) !== "");
    var nextDefault = Number(explicitDefaultIndex);
    if (hasExplicitDefault && isFinite(nextDefault)) {
        nextDefault = Math.max(0, Math.round(nextDefault));
        return nextDefault;
    }
    var key = String(runtimeGroupKey || "");
    if (RUNTIME_BUTTON_GROUP_DEFAULT_INDEX.hasOwnProperty(key)) {
        return Math.max(0, Math.round(Number(RUNTIME_BUTTON_GROUP_DEFAULT_INDEX[key]) || 0));
    }
    return 0;
}

function ApplyRuntimeButtonGroupIndex(runtimeGroupKey, nextIndex, runCommand) {
    var key = String(runtimeGroupKey || "");
    if (!key) return false;
    var meta = gRuntimeButtonGroupConfig[key];
    if (!meta || !Array.isArray(meta.options) || meta.options.length <= 0) return false;

    var clamped = Math.round(Number(nextIndex));
    if (!isFinite(clamped)) clamped = 0;
    if (clamped < 0) clamped = 0;
    if (clamped >= meta.options.length) clamped = meta.options.length - 1;

    var previous = Math.round(Number(gRuntimeToggleState[key]));
    if (!isFinite(previous)) previous = -1;
    var changed = previous !== clamped;
    gRuntimeToggleState[key] = clamped;

    var refreshFn = gRuntimeButtonGroupRefreshers[key];
    if (typeof refreshFn === "function") {
        try { refreshFn(); } catch(e0) { WarnLog("settings", "op failed: " + (e0 && e0.message ? e0.message : String(e0 || ""))); }
    }

    var shouldRunAction = !!runCommand && (changed || !!meta.alwaysRunAction);
    if (shouldRunAction) {
        var opt = meta.options[clamped] || null;
        var commandToRun = opt && opt.command ? String(opt.command) : "";
        if (commandToRun) {
            RunConsoleCommandBestEffort(commandToRun);
        }
        var soundEventToPlay = opt && opt.soundEvent ? String(opt.soundEvent) : "";
        if (soundEventToPlay) {
            if (soundEventToPlay.indexOf("BuffReminder.") === 0) {
                soundEventToPlay = ResolveAnnouncerEventForVolume(soundEventToPlay);
            }
            try { $.DispatchEvent("PlaySoundEffect", soundEventToPlay); } catch(e0) { WarnLog("settings", "op failed: " + (e0 && e0.message ? e0.message : String(e0 || ""))); }
        }
    }
    return changed;
}

function ResetRuntimeButtonGroupToDefault(runtimeGroupKey, runCommand) {
    var key = String(runtimeGroupKey || "");
    var meta = gRuntimeButtonGroupConfig[key];
    if (!meta || !Array.isArray(meta.options) || meta.options.length <= 0) return false;
    var defaultIndex = GetRuntimeButtonGroupDefaultIndex(key, meta.defaultIndex);
    if (defaultIndex >= meta.options.length) defaultIndex = 0;
    return ApplyRuntimeButtonGroupIndex(key, defaultIndex, runCommand);
}

function ResetRuntimeRowsInSectionFromTitleRow(titleRow) {
    var changed = 0;
    if (!titleRow || !titleRow.GetParent) return changed;
    var parent = titleRow.GetParent();
    if (!parent || !parent.Children) return changed;

    var siblings = [];
    try { siblings = parent.Children() || []; } catch (e0) { siblings = []; }
    var startIndex = -1;
    for (var i = 0; i < siblings.length; i++) {
        if (siblings[i] === titleRow) {
            startIndex = i;
            break;
        }
    }
    if (startIndex < 0) return changed;

    for (var s = startIndex + 1; s < siblings.length; s++) {
        var sibling = siblings[s];
        if (!sibling || !sibling.IsValid || !sibling.IsValid()) continue;
        var isBoundary = false;
        try {
            if ((sibling.BHasClass && sibling.BHasClass("SectionTitleRow")) ||
                (sibling.BHasClass && sibling.BHasClass("SectionTitle")) ||
                (sibling.BHasClass && sibling.BHasClass("RowSeparator"))) {
                isBoundary = true;
            }
        } catch(e1) { WarnLog("settings", "op failed: " + (e1 && e1.message ? e1.message : String(e1 || ""))); }
        if (isBoundary) break;
        try {
            if (!(sibling.BHasClass && sibling.BHasClass("SettingRow"))) continue;
        } catch (e2) {
            continue;
        }
        var runtimeKind = "";
        var runtimeKey = "";
        try {
            runtimeKind = sibling.GetAttributeString ? String(sibling.GetAttributeString(RUNTIME_ROW_KIND_ATTR, "") || "") : "";
            runtimeKey = sibling.GetAttributeString ? String(sibling.GetAttributeString(RUNTIME_ROW_KEY_ATTR, "") || "") : "";
        } catch (e3) {
            runtimeKind = "";
            runtimeKey = "";
        }
        if (!runtimeKey) continue;

        if (runtimeKind === "runtime_buttongroup") {
            if (ResetRuntimeButtonGroupToDefault(runtimeKey, true)) changed++;
        } else if (runtimeKind === "runtime_slider") {
            var resetFn = gRuntimeSliderResetters[runtimeKey];
            if (typeof resetFn === "function") {
                var before = Number(gRuntimeSliderState[runtimeKey]);
                try { resetFn(); } catch(e4) { WarnLog("settings", "op failed: " + (e4 && e4.message ? e4.message : String(e4 || ""))); }
                var after = Number(gRuntimeSliderState[runtimeKey]);
                if (!isFinite(before) || !isFinite(after) || Math.abs(before - after) > 0.000001) changed++;
            }
        }
    }
    return changed;
}

function CreateRuntimeSectionTitle(parent, title) {
    var localizedTitle = LocalizeSettingsText(title || "");
    gCurrentSettingsSectionTitle = String(title || "");
    if (gSearchCollectMode && gSearchCollectState) {
        return CreateSectionTitle(parent, title);
    }

    var titleRow = $.CreatePanel("Panel", parent, "");
    titleRow.AddClass("SectionTitleRow");
    titleRow.AddClass("SectionTitleStaticRow");
    var titleHead = $.CreatePanel("Panel", titleRow, "");
    titleHead.AddClass("SectionTitleInlineHead");
    var titleLabel = $.CreatePanel("Label", titleHead, "");
    titleLabel.AddClass("SectionTitle");
    titleLabel.AddClass("SectionTitleInlineLabel");
    titleLabel.text = localizedTitle;
    BindSectionPerfTooltip(titleRow, title, "", currentTab, "", "", null);

    var resetBtn = $.CreatePanel("Button", titleHead, "");
    resetBtn.AddClass("SectionTitleActionBtn");
    resetBtn.AddClass("SectionResetBtn");
    var resetIcon = $.CreatePanel("Image", resetBtn, "", {
        src: "s2r://panorama/images/icons/icon_refresh.vsvg",
        defaultsrc: "",
        scaling: "contain"
    });
    resetIcon.AddClass("SectionTitleActionIcon");
    resetIcon.AddClass("SettingRowResetIcon");
    resetIcon.AddClass("QOLResetIcon");
    try { resetIcon.SetImage("s2r://panorama/images/icons/icon_refresh.vsvg"); } catch(e5) { WarnLog("settings", "op failed: " + (e5 && e5.message ? e5.message : String(e5 || ""))); }

    resetBtn.SetPanelEvent("onmouseover", function() {
        HideSettingsTextTooltip();
        CancelSettingsRowFloatingTooltipHide();
        ShowSettingsRowFloatingTooltip(
            resetBtn,
            "",
            LocalizeSettingsText("Reset section runtime options", true),
            PERF_IMPACT_TIER_NONE,
            ""
        );
    });
    resetBtn.SetPanelEvent("onmouseout", function() {
        HideSettingsTextTooltip();
        HideSettingsRowFloatingTooltipDeferred("section_runtime_reset_btn_mouseout");
    });
    resetBtn.SetPanelEvent("onactivate", function() {
        var changed = ResetRuntimeRowsInSectionFromTitleRow(titleRow);
        if (changed > 0) {
            SetConfigFeedbackMessage("Section reset (" + String(changed) + " changed).", "success", 1500);
        } else {
            SetConfigFeedbackMessage("Section already at defaults.", "info", 1300);
        }
    });

    return titleLabel;
}

function ApplyDefaultHeroSelection(heroId) {
    var normalizedHeroId = String(heroId || "");
    if (!/^hero_[a-z0-9_]+$/i.test(normalizedHeroId)) return false;
    var command = "selecthero " + normalizedHeroId;
    var didDispatch = RunConsoleCommandBestEffort(command);
    if (didDispatch) {
        try {
            var root = FindRootPanel();
            if (root && root.SetAttributeString) {
                root.SetAttributeString(HERO_HINT_ATTR, normalizedHeroId);
            }
        } catch(e1) { WarnLog("settings", "op failed: " + (e1 && e1.message ? e1.message : String(e1 || ""))); }
    }
    return didDispatch;
}

function ApplyHealthbarTypeSelection(rawValue) {
    var nextType = NormalizeHealthbarTypeValue(rawValue);
    MOD_CONFIG.HEALTHBAR_TYPE = nextType;
    MOD_CONFIG.ENABLE_MINIMALIST_HEALTHBAR = (nextType === 1) ? 1 : 0;
    MOD_CONFIG.ENABLE_FG_HEALTHBAR = (nextType === 2) ? 1 : 0;
}

function ForceCenterSliderValueInput(inputPanel) {
    if (!inputPanel || !inputPanel.IsValid || !inputPanel.IsValid()) return;

    var applyCenteredTextStyle = function(panel, insetPx) {
        if (!panel || !panel.IsValid || !panel.IsValid()) return;
        try { panel.style.padding = "0px"; } catch(e0) { WarnLog("settings", "op failed: " + (e0 && e0.message ? e0.message : String(e0 || ""))); }
        try { panel.style.paddingLeft = String(insetPx) + "px"; } catch(e1) { WarnLog("settings", "op failed: " + (e1 && e1.message ? e1.message : String(e1 || ""))); }
        try { panel.style.paddingRight = "0px"; } catch(e2) { WarnLog("settings", "op failed: " + (e2 && e2.message ? e2.message : String(e2 || ""))); }
        try { panel.style.margin = "0px"; } catch(e3) { WarnLog("settings", "op failed: " + (e3 && e3.message ? e3.message : String(e3 || ""))); }
        try { panel.style.marginLeft = "0px"; } catch(e4) { WarnLog("settings", "op failed: " + (e4 && e4.message ? e4.message : String(e4 || ""))); }
        try { panel.style.marginRight = "0px"; } catch(e5) { WarnLog("settings", "op failed: " + (e5 && e5.message ? e5.message : String(e5 || ""))); }
        try { panel.style.textAlign = "center"; } catch(e6) { WarnLog("settings", "op failed: " + (e6 && e6.message ? e6.message : String(e6 || ""))); }
        try { panel.style.verticalAlign = "center"; } catch(e7) { WarnLog("settings", "op failed: " + (e7 && e7.message ? e7.message : String(e7 || ""))); }
        try { panel.style.x = String(insetPx) + "px"; } catch(e8) { WarnLog("settings", "op failed: " + (e8 && e8.message ? e8.message : String(e8 || ""))); }
    };

    var applyNow = function() {
        if (!inputPanel || !inputPanel.IsValid || !inputPanel.IsValid()) return;
        try {
            inputPanel.style.padding = "0px";
            inputPanel.style.paddingLeft = "3px";
            inputPanel.style.paddingRight = "0px";
            inputPanel.style.textAlign = "center";
        } catch(e0) { WarnLog("settings", "op failed: " + (e0 && e0.message ? e0.message : String(e0 || ""))); }

        var textEntry = null;
        try { textEntry = inputPanel.FindChildTraverse("TextEntry"); } catch (e9) { textEntry = null; }
        if (textEntry && textEntry.IsValid && textEntry.IsValid()) {
            try { textEntry.style.width = "100%"; } catch(e10) { WarnLog("settings", "op failed: " + (e10 && e10.message ? e10.message : String(e10 || ""))); }
            applyCenteredTextStyle(textEntry, 3);
        }

        var contents = null;
        try { contents = inputPanel.FindChildTraverse("Contents"); } catch (e11) { contents = null; }
        if (contents && contents.IsValid && contents.IsValid()) {
            try { contents.style.width = "100%"; } catch(e12) { WarnLog("settings", "op failed: " + (e12 && e12.message ? e12.message : String(e12 || ""))); }
            applyCenteredTextStyle(contents, 0);
            try { contents.style.horizontalAlign = "left"; } catch(e13) { WarnLog("settings", "op failed: " + (e13 && e13.message ? e13.message : String(e13 || ""))); }
        }

        var textContents = null;
        try { textContents = inputPanel.FindChildTraverse("TextEntryContents"); } catch (e14) { textContents = null; }
        if (textContents && textContents.IsValid && textContents.IsValid()) {
            try { textContents.style.width = "100%"; } catch(e15) { WarnLog("settings", "op failed: " + (e15 && e15.message ? e15.message : String(e15 || ""))); }
            try { textContents.style.horizontalAlign = "left"; } catch(e16) { WarnLog("settings", "op failed: " + (e16 && e16.message ? e16.message : String(e16 || ""))); }
            applyCenteredTextStyle(textContents, 3);

            var childCount = 0;
            try { childCount = textContents.GetChildCount ? textContents.GetChildCount() : 0; } catch (e17) { childCount = 0; }
            for (var ci = 0; ci < childCount; ci++) {
                var textChild = null;
                try { textChild = textContents.GetChild(ci); } catch (e18) { textChild = null; }
                if (!textChild || !textChild.IsValid || !textChild.IsValid()) continue;
                try { textChild.style.width = "100%"; } catch(e19) { WarnLog("settings", "op failed: " + (e19 && e19.message ? e19.message : String(e19 || ""))); }
                try { textChild.style.horizontalAlign = "center"; } catch(e20) { WarnLog("settings", "op failed: " + (e20 && e20.message ? e20.message : String(e20 || ""))); }
                applyCenteredTextStyle(textChild, 3);
            }
        }

        var placeholder = null;
        try { placeholder = inputPanel.FindChildTraverse("PlaceholderText"); } catch (e21) { placeholder = null; }
        if (placeholder && placeholder.IsValid && placeholder.IsValid()) {
            applyCenteredTextStyle(placeholder, 3);
        }

        var plainLabel = null;
        try { plainLabel = inputPanel.FindChildTraverse("Label"); } catch (e22) { plainLabel = null; }
        if (plainLabel && plainLabel.IsValid && plainLabel.IsValid()) {
            applyCenteredTextStyle(plainLabel, 3);
        }

        var cursor = null;
        try { cursor = inputPanel.FindChildTraverse("TextEntryCursor"); } catch (e23) { cursor = null; }
        if (cursor && cursor.IsValid && cursor.IsValid()) {
            applyCenteredTextStyle(cursor, 3);
        }
    };

    applyNow();
    $.Schedule(0.0, applyNow);
    $.Schedule(0.03, applyNow);
    $.Schedule(0.08, applyNow);

    inputPanel.SetPanelEvent("ontextentrychange", applyNow);
    inputPanel.SetPanelEvent("onfocus", applyNow);
    inputPanel.SetPanelEvent("onblur", applyNow);
}

function NormalizeComparableConfigValue(value) {
    if (value === undefined || value === null) return "";
    if (typeof value === "boolean") return value ? "1" : "0";
    if (typeof value === "number") {
        if (!isFinite(value)) return "";
        return String(Math.round(value * 10000) / 10000);
    }
    return String(value);
}

function IsConfigKeyChangedFromDefault(key) {
    if (!key) return false;
    if (!MOD_CONFIG || !MOD_CONFIG.hasOwnProperty(key)) return false;
    if (!DEFAULT_CONFIG || !DEFAULT_CONFIG.hasOwnProperty(key)) return false;
    return NormalizeComparableConfigValue(MOD_CONFIG[key]) !== NormalizeComparableConfigValue(DEFAULT_CONFIG[key]);
}

function CollectRowConfigKeys(configId, type, options) {
    var keys = [];
    if (type === "multitoggle" && Array.isArray(options)) {
        for (var i = 0; i < options.length; i++) {
            var opt = options[i];
            if (!opt || !opt.key) continue;
            if (!MOD_CONFIG.hasOwnProperty(opt.key) || !DEFAULT_CONFIG.hasOwnProperty(opt.key)) continue;
            keys.push(String(opt.key));
        }
        return keys;
    }
    if (!configId || typeof configId !== "string") return keys;
    if (!MOD_CONFIG.hasOwnProperty(configId) || !DEFAULT_CONFIG.hasOwnProperty(configId)) return keys;
    keys.push(configId);
    return keys;
}

function IsNeutralCampTypeFilterOptions(options) {
    return OptionsMatchExpectedKeys(options, NEUTRAL_CAMP_TIER_OPTIONS);
}

function OptionsMatchExpectedKeys(options, expectedOptions) {
    if (!Array.isArray(options) || !Array.isArray(expectedOptions)) return false;
    if (options.length !== expectedOptions.length) return false;
    var expected = {};
    for (var i = 0; i < expectedOptions.length; i++) {
        var key = expectedOptions[i] && expectedOptions[i].key
            ? String(expectedOptions[i].key)
            : "";
        if (!key) continue;
        expected[key] = true;
    }
    var matched = 0;
    for (var j = 0; j < options.length; j++) {
        var optKey = options[j] && options[j].key ? String(options[j].key) : "";
        if (optKey && expected[optKey]) matched += 1;
    }
    return matched === expectedOptions.length;
}

function IsColorWarningThresholdOptions(options) {
    return OptionsMatchExpectedKeys(options, COLOR_WARNING_THRESHOLD_OPTIONS);
}

function IsEnemyColorWarningThresholdOptions(options) {
    return OptionsMatchExpectedKeys(options, TOPBAR_ENEMY_HP_WARNING_THRESHOLD_OPTIONS);
}

function IsAllyColorWarningThresholdOptions(options) {
    return OptionsMatchExpectedKeys(options, TOPBAR_ALLY_HP_WARNING_THRESHOLD_OPTIONS);
}

function IsBridgeBuffFilterOptions(options) {
    return OptionsMatchExpectedKeys(options, BRIDGE_BUFF_FILTER_OPTIONS);
}

function IsRecentPurchaseRepositionOptions(options) {
    return OptionsMatchExpectedKeys(options, RECENT_PURCHASE_REPOSITION_OPTIONS);
}

function BindRowChangedState(row, labelContainer, configKeys, resetBtn) {
    if (!row || !row.IsValid || !row.IsValid()) return function() {};
    if (!labelContainer || !labelContainer.IsValid || !labelContainer.IsValid()) return function() {};
    if (!Array.isArray(configKeys) || configKeys.length <= 0) return function() {};

    var badge = $.CreatePanel("Panel", labelContainer, "");
    badge.AddClass("SettingChangedBadge");

    var refresh = function() {
        if (!row || !row.IsValid || !row.IsValid()) return;
        var changed = false;
        for (var i = 0; i < configKeys.length; i++) {
            if (IsConfigKeyChangedFromDefault(configKeys[i])) {
                changed = true;
                break;
            }
        }
        row.SetHasClass("HasChanged", changed);
        if (badge && badge.IsValid && badge.IsValid()) {
            badge.SetHasClass("Visible", changed);
        }
        if (resetBtn && resetBtn.IsValid && resetBtn.IsValid()) {
            resetBtn.SetHasClass("Visible", changed);
        }
    };

    refresh();
    return refresh;
}

function CreateRow(parent, label, configId, type, min, max, step, options, description) {
    var localizedLabel = LocalizeSettingsText(label || "");
    var effectiveDescription = GetSettingDescriptionOverride(
        configId,
        label,
        description || "",
        GetCurrentSettingsCategoryKey()
    );
    var localizedDescription = LocalizeSettingsText(effectiveDescription || "");
    var hasRowDescription = !!(effectiveDescription && effectiveDescription !== "" && localizedDescription && localizedDescription !== "");
    var perfImpactInfo = BuildPerfImpactTooltipLine(configId, type, options);
    var rowPerfTier = (perfImpactInfo && perfImpactInfo.tier) ? String(perfImpactInfo.tier) : PERF_IMPACT_TIER_NONE;
    var rowCreatedBy = GetSettingCreatedBy(configId, label);
    var rowTooltipPerfLine = (perfImpactInfo && perfImpactInfo.line) ? String(perfImpactInfo.line) : "";
    var rowTooltipDescLine = hasRowDescription ? localizedDescription : "";
    var hasRowTooltip = HasMeaningfulFloatingTooltipContent(rowPerfTier, rowTooltipDescLine, rowCreatedBy);
    if (gSearchCollectMode && gSearchCollectState) {
        GetActiveSearchCollectSection().rows.push(BuildSearchCollectedRow(
            localizedLabel,
            configId,
            type,
            min,
            max,
            step,
            options,
            localizedDescription,
            null
        ));
        return;
    }
    var row = $.CreatePanel("Panel", parent, "");
    if (gSearchResultRenderMode) row.AddClass("SearchResultRow");
    row.AddClass("SettingRow");
    if (configId) row.AddClass("SettingRow_" + String(configId).replace(/[^A-Za-z0-9_]/g, "_"));
    var isRuntimeSliderRow = (type === "runtime_slider");
    var isRuntimeButtonGroupRow = (type === "runtime_buttongroup");
    if (type === "slider" || type === "angle_slider" || isRuntimeSliderRow) row.AddClass("RowTypeSlider");
    else if (type === "multitoggle") row.AddClass("RowTypeMultiToggle");
    else if (type === "buttongroup") row.AddClass("RowTypeButtonGroup");
    else if (type === "palette") row.AddClass("RowTypePalette");
    else if (type === "runtime_buttongroup") row.AddClass("RowTypeButtonGroup");
    else if (type === "dropdown") row.AddClass("RowTypeDropDown");
    else if (type === "actionbutton") row.AddClass("RowTypeAction");
    else row.AddClass("RowTypeToggle");
    var labelContainer = $.CreatePanel("Panel", row, "");
    labelContainer.AddClass("LabelContainer");
    var lbl = $.CreatePanel("Label", labelContainer, "");
    lbl.AddClass("SettingLabel");
    lbl.text = localizedLabel;
    var rowConfigKeys = CollectRowConfigKeys(configId, type, options);
    if (row && row.SetAttributeString) {
        try { row.SetAttributeString(SETTING_ROW_RESET_KEYS_ATTR, rowConfigKeys.join(",")); } catch(e0) { WarnLog("settings", "op failed: " + (e0 && e0.message ? e0.message : String(e0 || ""))); }
    }
    var rowResetBtn = null;
    var runtimeSliderResetAction = null;
    var runtimeButtonGroupResetAction = null;
    var showCustomRowTooltip = function() {};
    var hideCustomRowTooltip = function() {};
    var syncRowVisualState = function() {
        if (!row || !row.IsValid || !row.IsValid()) return false;
        return true;
    };
    if (rowConfigKeys.length > 0 || isRuntimeSliderRow || isRuntimeButtonGroupRow) {
        rowResetBtn = $.CreatePanel("Button", labelContainer, "");
        rowResetBtn.AddClass("SettingRowResetBtn");
        if (isRuntimeSliderRow || isRuntimeButtonGroupRow) {
            rowResetBtn.AddClass("RuntimeAlwaysVisible");
        }
        var rowResetIcon = $.CreatePanel("Image", rowResetBtn, "", {
            src: "s2r://panorama/images/icons/icon_refresh.vsvg",
            defaultsrc: "",
            scaling: "contain"
        });
        rowResetIcon.AddClass("SettingRowResetIcon");
        rowResetIcon.AddClass("QOLResetIcon");
        try { rowResetIcon.SetImage("s2r://panorama/images/icons/icon_refresh.vsvg"); } catch(eImg) { WarnLog("settings", "op failed: " + (eImg && eImg.message ? eImg.message : String(eImg || ""))); }
        rowResetBtn.SetPanelEvent("onmouseover", function() {
            hideCustomRowTooltip();
            HideSettingsTextTooltip();
            CancelSettingsRowFloatingTooltipHide();
            ShowSettingsRowFloatingTooltip(
                rowResetBtn,
                "",
                LocalizeSettingsText((isRuntimeSliderRow || isRuntimeButtonGroupRow) ? "Reset to default value" : "Reset row to defaults", true),
                PERF_IMPACT_TIER_NONE,
                ""
            );
        });
        rowResetBtn.SetPanelEvent("onmouseout", function() {
            HideSettingsTextTooltip();
            HideSettingsRowFloatingTooltipDeferred("row_reset_btn_mouseout");
        });
        rowResetBtn.SetPanelEvent("onactivate", function() {
            if (isRuntimeSliderRow) {
                if (runtimeSliderResetAction) runtimeSliderResetAction();
                return;
            }
            if (isRuntimeButtonGroupRow) {
                if (runtimeButtonGroupResetAction) runtimeButtonGroupResetAction();
                return;
            }
            var changedCount = ApplyResetForConfigKeys(rowConfigKeys);
            if (changedCount > 0) {
                SaveAndSync();
                syncRowVisualState();
                SetConfigFeedbackMessage(IsRussianSettingsLanguage()
                    ? ("\u0421\u0431\u0440\u043E\u0448\u0435\u043D\u0430 \u0441\u0442\u0440\u043E\u043A\u0430 (" + String(changedCount) + ").")
                    : ("Row reset (" + String(changedCount) + ")."), "success", 1400);
            } else {
                SetConfigFeedbackMessage(IsRussianSettingsLanguage()
                    ? "\u0421\u0442\u0440\u043E\u043A\u0430 \u0443\u0436\u0435 \u043F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E."
                    : "Row already at defaults.", "info", 1200);
            }
        });
    }
    var refreshRowChangedState = BindRowChangedState(row, labelContainer, rowConfigKeys, rowResetBtn);
    syncRowVisualState = function() {
        if (!row || !row.IsValid || !row.IsValid()) return false;
        refreshRowChangedState();
        return true;
    };
    if (hasRowTooltip) {
        showCustomRowTooltip = function() {
            CancelSettingsRowFloatingTooltipHide();
            ShowSettingsRowFloatingTooltip(row, rowTooltipPerfLine, rowTooltipDescLine, rowPerfTier, rowCreatedBy);
        };

        hideCustomRowTooltip = function() {
            HideSettingsRowFloatingTooltipDeferred("row_mouseout");
        };

        row.SetPanelEvent("onmouseover", function() {
            showCustomRowTooltip();
        });
        row.SetPanelEvent("onmouseout", function() {
            hideCustomRowTooltip();
        });
    }
    if (type === "slider" || type === "angle_slider") {
        var sliderValueGroup = $.CreatePanel("Panel", row, "");
        sliderValueGroup.AddClass("SliderValueGroup");
        sliderValueGroup.AddClass("SettingControlRoot");
        var sliderContainer = $.CreatePanel("Panel", sliderValueGroup, "");
        sliderContainer.AddClass("SliderContainer");
        var slider = $.CreatePanel("Slider", sliderContainer, "", { direction: "horizontal" });
        slider.AddClass("HorizontalSlider");
        var isAngleSlider = (type === "angle_slider");
        var isFloat = (max <= 5.0 && (configId.indexOf("OPACITY") !== -1 || configId.indexOf("SCALE") !== -1));
        var isOpacitySlider = (isFloat && configId.indexOf("OPACITY") !== -1);
        var isSecondsSlider = (configId === "BRIDGE_BUFF_START" || configId === "MINIMAP_REMINDER_INTERVAL" || configId === "RECENT_PURCHASES_QUICK_DISPLAY_SEC");
        var formatSliderInputValue = function(value) {
            if (value === undefined || value === null || !isFinite(Number(value))) value = 0;
            var numeric = Number(value);
            if (isOpacitySlider) {
                var pct = Math.round(Math.max(0, Math.min(1, numeric)) * 100);
                return String(pct) + "%";
            }
            if (isFloat) return numeric.toFixed(2);
            if (isSecondsSlider) return String(Math.round(numeric)) + "s";
            if (isAngleSlider) return String(Math.round(numeric)) + "°";
            return String(Math.round(numeric));
        };
        var parseSliderInputValue = function(text) {
            var rawText = String(text === undefined || text === null ? "" : text).trim();
            if (!rawText) return null;
            rawText = rawText.replace(",", ".");
            var parsed = parseFloat(rawText);
            if (!isFinite(parsed)) return null;
            if (isOpacitySlider) {
                var hasPercent = rawText.indexOf("%") !== -1;
                if (hasPercent || parsed > 1) parsed = parsed / 100;
            }
            return parsed;
        };
        slider.min = isFloat ? 0 : min;
        slider.max = isFloat ? max * 100 : max;
        slider.value = isFloat ? MOD_CONFIG[configId] * 100 : MOD_CONFIG[configId];
        var input = $.CreatePanel("TextEntry", sliderValueGroup, "");
        input.AddClass("ValueInput");
        input.text = formatSliderInputValue(MOD_CONFIG[configId]);
        ForceCenterSliderValueInput(input);
        slider.SetPanelEvent("onvaluechanged", function() {
            var val;
            if (isFloat) {
                val = parseFloat((Math.round(slider.value) / 100).toFixed(2));
                if (val !== MOD_CONFIG[configId]) {
                    input.text = formatSliderInputValue(val);
                    MOD_CONFIG[configId] = val;
                    MarkConfigDirty();
                    refreshRowChangedState();
                }
            } else {
                val = Math.round(slider.value / step) * step;
                if (val !== MOD_CONFIG[configId]) {
                    input.text = formatSliderInputValue(val);
                    MOD_CONFIG[configId] = val;
                    MarkConfigDirty();
                    refreshRowChangedState();
                }
            }
            ShowConfigPreviewForConfigId(configId);
        });
        input.SetPanelEvent("oninputsubmit", function() {
            var rawVal = parseSliderInputValue(input.text);
            if (rawVal === null || !isFinite(Number(rawVal))) {
                input.text = formatSliderInputValue(MOD_CONFIG[configId]);
                return;
            }
            var clampedVal = Math.max(min, Math.min(max, rawVal));
            if (isFloat) {
                MOD_CONFIG[configId] = parseFloat(clampedVal.toFixed(2));
                slider.value = clampedVal * 100;
                input.text = formatSliderInputValue(MOD_CONFIG[configId]);
            } else {
                MOD_CONFIG[configId] = Math.round(clampedVal);
                slider.value = MOD_CONFIG[configId];
                input.text = formatSliderInputValue(MOD_CONFIG[configId]);
            }
            input.RemoveClass("ValueSavedFlash");
            input.AddClass("ValueSavedFlash");
            MarkConfigDirty();
            refreshRowChangedState();
            ShowConfigPreviewForConfigId(configId);
        });
        syncRowVisualState = function() {
            if (!row || !row.IsValid || !row.IsValid()) return false;
            var nextVal = Number(MOD_CONFIG[configId]);
            if (!isFinite(nextVal)) nextVal = Number(min);
            nextVal = Math.max(Number(min), Math.min(Number(max), nextVal));
            if (isFloat) {
                nextVal = parseFloat(nextVal.toFixed(2));
                slider.value = nextVal * 100;
            } else {
                nextVal = Math.round(nextVal);
                slider.value = nextVal;
            }
            input.text = formatSliderInputValue(nextVal);
            refreshRowChangedState();
            return true;
        };
    } else if (type === "runtime_slider") {
        var runtimeConfig = (Array.isArray(options) && options.length > 0 && options[0]) ? options[0] : {};
        var runtimeCommand = String(runtimeConfig.command || "").trim();
        var runtimeMin = Number(min);
        var runtimeMax = Number(max);
        var runtimeStep = Number(step);
        var runtimeDefault = Number(runtimeConfig.defaultValue);
        if (!isFinite(runtimeMin)) runtimeMin = 0;
        if (!isFinite(runtimeMax)) runtimeMax = runtimeMin + 1;
        if (runtimeMax < runtimeMin) {
            var swapTmp = runtimeMax;
            runtimeMax = runtimeMin;
            runtimeMin = swapTmp;
        }
        if (!isFinite(runtimeStep) || runtimeStep <= 0) runtimeStep = 1;
        if (!isFinite(runtimeDefault)) runtimeDefault = runtimeMin;
        runtimeDefault = Math.max(runtimeMin, Math.min(runtimeMax, runtimeDefault));

        var stepText = String(runtimeStep);
        var stepDot = stepText.indexOf(".");
        var runtimePrecision = 0;
        if (stepDot !== -1) runtimePrecision = stepText.length - stepDot - 1;
        if (runtimePrecision < 0) runtimePrecision = 0;
        if (runtimePrecision > 6) runtimePrecision = 6;
        var runtimeScale = Math.pow(10, runtimePrecision);

        var quantizeRuntimeValue = function(value) {
            var numeric = Number(value);
            if (!isFinite(numeric)) numeric = runtimeDefault;
            numeric = Math.max(runtimeMin, Math.min(runtimeMax, numeric));
            var stepped = Math.round((numeric - runtimeMin) / runtimeStep) * runtimeStep + runtimeMin;
            stepped = Math.max(runtimeMin, Math.min(runtimeMax, stepped));
            if (runtimePrecision > 0) {
                stepped = Number(stepped.toFixed(runtimePrecision));
            } else {
                stepped = Math.round(stepped);
            }
            return stepped;
        };
        var formatRuntimeValue = function(value) {
            var numeric = Number(value);
            if (!isFinite(numeric)) numeric = runtimeDefault;
            if (runtimePrecision <= 0) return String(Math.round(numeric));
            var out = numeric.toFixed(runtimePrecision);
            out = out.replace(/\.?0+$/, "");
            if (out === "-0") out = "0";
            return out;
        };

        var runtimeKey = String(configId || runtimeCommand || label || "runtime_slider");
        if (row && row.SetAttributeString) {
            try { row.SetAttributeString(RUNTIME_ROW_KIND_ATTR, "runtime_slider"); } catch(eKind0) { WarnLog("settings", "op failed: " + (eKind0 && eKind0.message ? eKind0.message : String(eKind0 || ""))); }
            try { row.SetAttributeString(RUNTIME_ROW_KEY_ATTR, runtimeKey); } catch(eKey0) { WarnLog("settings", "op failed: " + (eKey0 && eKey0.message ? eKey0.message : String(eKey0 || ""))); }
        }
        var initialRuntimeValue = Number(gRuntimeSliderState[runtimeKey]);
        if (!isFinite(initialRuntimeValue)) initialRuntimeValue = runtimeDefault;
        initialRuntimeValue = quantizeRuntimeValue(initialRuntimeValue);
        gRuntimeSliderState[runtimeKey] = initialRuntimeValue;

        var runtimeGroup = $.CreatePanel("Panel", row, "");
        runtimeGroup.AddClass("SliderValueGroup");
        runtimeGroup.AddClass("SettingControlRoot");
        var runtimeSliderContainer = $.CreatePanel("Panel", runtimeGroup, "");
        runtimeSliderContainer.AddClass("SliderContainer");
        var runtimeSlider = $.CreatePanel("Slider", runtimeSliderContainer, "", { direction: "horizontal" });
        runtimeSlider.AddClass("HorizontalSlider");
        runtimeSlider.min = Math.round(runtimeMin * runtimeScale);
        runtimeSlider.max = Math.round(runtimeMax * runtimeScale);
        runtimeSlider.value = Math.round(initialRuntimeValue * runtimeScale);

        var runtimeInput = $.CreatePanel("TextEntry", runtimeGroup, "");
        runtimeInput.AddClass("ValueInput");
        runtimeInput.text = formatRuntimeValue(initialRuntimeValue);
        ForceCenterSliderValueInput(runtimeInput);

        var applyRuntimeValue = function(nextValue, runCommand) {
            var quantized = quantizeRuntimeValue(nextValue);
            var previous = Number(gRuntimeSliderState[runtimeKey]);
            if (!isFinite(previous)) previous = runtimeDefault;
            var changed = Math.abs(previous - quantized) > 0.000001;
            gRuntimeSliderState[runtimeKey] = quantized;

            var sliderValue = Math.round(quantized * runtimeScale);
            if (Math.round(Number(runtimeSlider.value)) !== sliderValue) {
                runtimeSlider.value = sliderValue;
            }
            runtimeInput.text = formatRuntimeValue(quantized);

            if (changed && runCommand && runtimeCommand) {
                RunConsoleCommandBestEffort(runtimeCommand + " " + formatRuntimeValue(quantized));
            }
            return changed;
        };

        runtimeSlider.SetPanelEvent("onvaluechanged", function() {
            var numericSliderValue = Number(runtimeSlider.value);
            if (!isFinite(numericSliderValue)) numericSliderValue = Math.round(runtimeDefault * runtimeScale);
            var desired = numericSliderValue / runtimeScale;
            applyRuntimeValue(desired, true);
        });

        runtimeInput.SetPanelEvent("oninputsubmit", function() {
            var raw = String(runtimeInput.text === undefined || runtimeInput.text === null ? "" : runtimeInput.text).trim();
            raw = raw.replace(",", ".");
            var parsed = parseFloat(raw);
            if (!isFinite(parsed)) {
                runtimeInput.text = formatRuntimeValue(gRuntimeSliderState[runtimeKey]);
                return;
            }
            var changed = applyRuntimeValue(parsed, true);
            if (changed) {
                runtimeInput.RemoveClass("ValueSavedFlash");
                runtimeInput.AddClass("ValueSavedFlash");
            }
        });

        runtimeSliderResetAction = function() {
            var changed = applyRuntimeValue(runtimeDefault, true);
            if (!changed) {
                SetConfigFeedbackMessage("Already at default value.", "info", 1200);
                return;
            }
            runtimeInput.RemoveClass("ValueSavedFlash");
            runtimeInput.AddClass("ValueSavedFlash");
            SetConfigFeedbackMessage("Reset to default value.", "success", 1200);
        };
        gRuntimeSliderResetters[runtimeKey] = runtimeSliderResetAction;
    } else if (type === "multitoggle" && Array.isArray(options)) {
        row.AddClass("MultiToggleRow");
        var isItemCooldownFilterRow = false;
        var isColorWarningFilterRow = IsColorWarningThresholdOptions(options) || IsEnemyColorWarningThresholdOptions(options) || IsAllyColorWarningThresholdOptions(options);
        var isBridgeBuffFilterRow = IsBridgeBuffFilterOptions(options);
        if (options && options.length === 4) {
            var itemFilterKeyCount = 0;
            for (var mi = 0; mi < options.length; mi++) {
                var mk = options[mi] && options[mi].key ? String(options[mi].key) : "";
                if (mk.indexOf("ITEM_FILTER_") === 0) itemFilterKeyCount += 1;
            }
            isItemCooldownFilterRow = (itemFilterKeyCount === 4);
        }
        var isRecentPurchaseRepositionRow = IsRecentPurchaseRepositionOptions(options);
        var useCheckboxStyle = IsNeutralCampTypeFilterOptions(options) || isColorWarningFilterRow || isItemCooldownFilterRow || isBridgeBuffFilterRow || isRecentPurchaseRepositionRow;
        if (useCheckboxStyle) {
            row.AddClass("MultiCheckboxRow");
        }
        if (isColorWarningFilterRow || isRecentPurchaseRepositionRow) {
            // Reuse the same one-line horizontal layout as Announcer Type.
            row.AddClass("AnnouncerTypeFilterRow");
        }
        if (isBridgeBuffFilterRow) {
            row.AddClass("AnnouncerTypeFilterRow");
            row.AddClass("AnnouncerBuffFilterRow");
        }
        if (isItemCooldownFilterRow) {
            row.AddClass("ItemCooldownFilterRow");
        }
        var multiGroup = $.CreatePanel("Panel", row, "");
        multiGroup.AddClass("SettingButtonGroup");
        multiGroup.AddClass("MultiToggleGroup");
        multiGroup.AddClass("SettingControlRoot");
        if (useCheckboxStyle) {
            multiGroup.AddClass("MultiCheckboxGroup");
        }
        if (isItemCooldownFilterRow) {
            multiGroup.AddClass("ItemCooldownFilterGroup");
        }
        if (isBridgeBuffFilterRow) {
            multiGroup.AddClass("AnnouncerBuffFilterGroup");
        }
        var multiRefreshFns = [];
        var itemCooldownOptionLine = null;
        options.forEach(function(opt, optIndex) {
            if (!opt || !opt.key) return;
            var key = opt.key;
            if (!MOD_CONFIG.hasOwnProperty(key)) return;

            var buttonParent = multiGroup;
            var optionWrap = null;
            if (isBridgeBuffFilterRow) {
                optionWrap = $.CreatePanel("Panel", multiGroup, "");
                optionWrap.AddClass("AnnouncerBuffFilterOptionWrap");
                buttonParent = optionWrap;
            }
            if (isItemCooldownFilterRow) {
                if (optIndex % 2 === 0 || !itemCooldownOptionLine) {
                    itemCooldownOptionLine = $.CreatePanel("Panel", multiGroup, "");
                    itemCooldownOptionLine.AddClass("ItemCooldownFilterLine");
                }
                buttonParent = itemCooldownOptionLine;
            }

            var multiBtn = useCheckboxStyle
                ? $.CreatePanel("ToggleButton", buttonParent, "")
                : $.CreatePanel("Button", buttonParent, "");
            if (!useCheckboxStyle) {
                multiBtn.AddClass("SegmentBtn");
                multiBtn.AddClass("MultiToggleBtn");
            } else {
                multiBtn.AddClass("MultiCheckboxBtn");
                multiBtn.AddClass("CitadelSettingsCheckbox");
            }
            if (isBridgeBuffFilterRow) {
                multiBtn.AddClass("AnnouncerBuffFilterMainBtn");
            }
            if (isItemCooldownFilterRow) {
                multiBtn.AddClass("ItemCooldownFilterBtn");
                if (optIndex < 2) {
                    multiBtn.AddClass("ItemCooldownTopRowBtn");
                } else {
                    multiBtn.AddClass("ItemCooldownBottomRowBtn");
                }
            }
            var multiBtnLbl = $.CreatePanel("Label", multiBtn, "");
            multiBtnLbl.AddClass(useCheckboxStyle ? "MultiCheckboxLabel" : "MultiToggleLabel");
            multiBtnLbl.text = LocalizeSettingsText(opt.label || key);
            var suppressNextOptionToggle = false;

            var updateMultiBtn = function() {
                var isActive = (MOD_CONFIG[key] === 1);
                if (useCheckboxStyle) {
                    try { multiBtn.SetSelected(isActive); } catch(eSel) { WarnLog("settings", "op failed: " + (eSel && eSel.message ? eSel.message : String(eSel || ""))); }
                    multiBtn.SetHasClass("selected", isActive);
                    multiBtn.SetHasClass("IsSelected", isActive);
                }
                multiBtn.SetHasClass("Active", isActive);
            };
            updateMultiBtn();
            multiRefreshFns.push(updateMultiBtn);

            multiBtn.SetPanelEvent("onactivate", function() {
                if (suppressNextOptionToggle) {
                    suppressNextOptionToggle = false;
                    return;
                }
                MOD_CONFIG[key] = (MOD_CONFIG[key] === 1 ? 0 : 1);
                updateMultiBtn();
                SaveAndSync();
                refreshRowChangedState();
            });

            if (isBridgeBuffFilterRow && optionWrap) {
                var soundVariant = optIndex + 1;
                var keyText = String(key || "");
                if (keyText.indexOf("ENABLE_BUFF_SOUND_") === 0) {
                    var parsedVariant = parseInt(keyText.substring("ENABLE_BUFF_SOUND_".length), 10);
                    if (isFinite(parsedVariant) && parsedVariant >= 1 && parsedVariant <= 3) {
                        soundVariant = parsedVariant;
                    }
                }

                var testBtn = $.CreatePanel("Button", multiBtn, "");
                testBtn.AddClass("SectionTitleActionBtn");
                testBtn.AddClass("AnnouncerBuffFilterTestBtn");
                var testIcon = $.CreatePanel("Image", testBtn, "", {
                    src: "s2r://panorama/images/icons/icon_sound_on.vsvg",
                    defaultsrc: "",
                    scaling: "contain"
                });
                testIcon.AddClass("SectionTitleActionIcon");
                testIcon.AddClass("AnnouncerBuffFilterTestIcon");

                var testTooltipText = LocalizeSettingsText("Play Sound", true) + " " + LocalizeSettingsText(String(soundVariant), true);
                testBtn.SetPanelEvent("onmouseover", function() {
                    HideSettingsTextTooltip();
                    CancelSettingsRowFloatingTooltipHide();
                    ShowSettingsRowFloatingTooltip(
                        testBtn,
                        "",
                        testTooltipText,
                        PERF_IMPACT_TIER_NONE,
                        ""
                    );
                });
                testBtn.SetPanelEvent("onmouseout", function() {
                    HideSettingsRowFloatingTooltipDeferred("announcer_buff_filter_test_mouseout");
                });
                testBtn.SetPanelEvent("onactivate", function() {
                    suppressNextOptionToggle = true;
                    PlayAnnouncerBridgeVariantPreviewSound(soundVariant);
                    testBtn.AddClass("SuccessState");
                    $.Schedule(0.28, function() {
                        if (testBtn && testBtn.IsValid && testBtn.IsValid()) {
                            testBtn.RemoveClass("SuccessState");
                        }
                    });
                });
            }
        });
        syncRowVisualState = function() {
            if (!row || !row.IsValid || !row.IsValid()) return false;
            for (var mr = 0; mr < multiRefreshFns.length; mr++) {
                var multiRefreshFn = multiRefreshFns[mr];
                if (typeof multiRefreshFn !== "function") continue;
                try { multiRefreshFn(); } catch(eMulti) { WarnLog("settings", "op failed: " + (eMulti && eMulti.message ? eMulti.message : String(eMulti || ""))); }
            }
            refreshRowChangedState();
            return true;
        };
    } else if (type === "runtime_buttongroup" && Array.isArray(options)) {
        var runtimeGroup = $.CreatePanel("Panel", row, "");
        runtimeGroup.AddClass("SettingButtonGroup");
        runtimeGroup.AddClass("SettingControlRoot");
        runtimeGroup.AddClass("RuntimeOnOffGroup");
        var runtimeGroupKey = String(configId || label || "runtime_buttongroup");
        var isAudioBeepTestGroup = (runtimeGroupKey === "AUDIO_BEEP_TEST_RUNTIME");
        if (isAudioBeepTestGroup) {
            row.AddClass("RuntimeSoundTestRow");
            runtimeGroup.AddClass("RuntimeSoundTestGroup");
        }
        if (row && row.SetAttributeString) {
            try { row.SetAttributeString(RUNTIME_ROW_KIND_ATTR, "runtime_buttongroup"); } catch(eKind1) { WarnLog("settings", "op failed: " + (eKind1 && eKind1.message ? eKind1.message : String(eKind1 || ""))); }
            try { row.SetAttributeString(RUNTIME_ROW_KEY_ATTR, runtimeGroupKey); } catch(eKey1) { WarnLog("settings", "op failed: " + (eKey1 && eKey1.message ? eKey1.message : String(eKey1 || ""))); }
        }
        var defaultRuntimeIndex = GetRuntimeButtonGroupDefaultIndex(runtimeGroupKey, null);
        if (defaultRuntimeIndex >= options.length) defaultRuntimeIndex = 0;
        gRuntimeButtonGroupConfig[runtimeGroupKey] = {
            options: options,
            defaultIndex: defaultRuntimeIndex,
            alwaysRunAction: isAudioBeepTestGroup
        };
        var initialRuntimeIndex = Number(gRuntimeToggleState[runtimeGroupKey]);
        if (!isFinite(initialRuntimeIndex) || initialRuntimeIndex < 0 || initialRuntimeIndex >= options.length) {
            initialRuntimeIndex = defaultRuntimeIndex;
        }
        gRuntimeToggleState[runtimeGroupKey] = initialRuntimeIndex;
        var runtimeButtons = [];
        var refreshRuntimeButtons = function() {
            for (var rb = 0; rb < runtimeButtons.length; rb++) {
                var runtimeBtn = runtimeButtons[rb];
                if (!runtimeBtn || !runtimeBtn.IsValid || !runtimeBtn.IsValid()) continue;
                runtimeBtn.SetHasClass("Active", rb === gRuntimeToggleState[runtimeGroupKey]);
            }
        };
        options.forEach(function(opt, index) {
            var runtimeBtn = $.CreatePanel("Button", runtimeGroup, "");
            runtimeBtn.AddClass("SegmentBtn");
            runtimeBtn.AddClass("RuntimeOnOffBtn");
            if (isAudioBeepTestGroup) {
                runtimeBtn.AddClass("RuntimeSoundTestBtn");
            }
            var runtimeBtnLbl = $.CreatePanel("Label", runtimeBtn, "");
            runtimeBtnLbl.text = LocalizeSettingsText((opt && opt.label) ? opt.label : String(index), true);
            runtimeButtons.push(runtimeBtn);
            runtimeBtn.SetPanelEvent("onactivate", function() {
                ApplyRuntimeButtonGroupIndex(runtimeGroupKey, index, true);
            });
        });
        gRuntimeButtonGroupRefreshers[runtimeGroupKey] = refreshRuntimeButtons;
        runtimeButtonGroupResetAction = function() {
            var changed = ResetRuntimeButtonGroupToDefault(runtimeGroupKey, true);
            if (!changed) {
                SetConfigFeedbackMessage("Already at default value.", "info", 1200);
                return;
            }
            SetConfigFeedbackMessage("Reset to default value.", "success", 1200);
        };
        refreshRuntimeButtons();
        syncRowVisualState = function() {
            if (!row || !row.IsValid || !row.IsValid()) return false;
            refreshRuntimeButtons();
            refreshRowChangedState();
            return true;
        };
    } else if (type === "buttongroup" && Array.isArray(options)) {
        var group = $.CreatePanel("Panel", row, "");
        group.AddClass("SettingButtonGroup");
        group.AddClass("SettingControlRoot");
        if (configId === "VOICE_TYPE") {
            group.AddClass("CompactSegmentGroup");
        }
        if (configId === "LANGUAGE") {
            group.AddClass("LanguageSwitchGroup");
        }
        if (configId === "SETTINGS_THEME") {
            group.AddClass("ThemeSwitchGroup");
        }
        if (configId === "GAME_DEFAULT_DIFFICULTY") {
            group.AddClass("ArcadeDifficultyDefaultGroup");
        }
        var groupButtons = [];
        var buttonGroupRefreshFns = [];
        options.forEach(function(opt, index) {
            var btn = $.CreatePanel("Button", group, "");
            btn.AddClass("SegmentBtn");
            if (configId === "LANGUAGE") {
                btn.AddClass("LanguageSwitchBtn");
            }
            if (configId === "SETTINGS_THEME") {
                btn.AddClass("ThemeSwitchBtn");
                btn.AddClass("QOLThemeSwatch");
                btn.AddClass("ThemeSwitchBtn_" + String(opt.label || "").replace(/[^A-Za-z0-9_]/g, ""));
                var themeSwatchIndex = Math.round(Number(opt.value));
                if (!isFinite(themeSwatchIndex)) themeSwatchIndex = 0;
                if (themeSwatchIndex < 0) themeSwatchIndex = 0;
                if (themeSwatchIndex >= SETTINGS_THEME_ROOT_CLASS_NAMES.length) themeSwatchIndex = SETTINGS_THEME_ROOT_CLASS_NAMES.length - 1;
                btn.AddClass(SETTINGS_THEME_ROOT_CLASS_NAMES[themeSwatchIndex]);
            }
            if (configId === "GAME_DEFAULT_DIFFICULTY") {
                btn.AddClass("ArcadeDifficultyDefaultBtn");
            }
            var btnLbl = $.CreatePanel("Label", btn, "");
            btnLbl.text = LocalizeSettingsText(opt.label);
            groupButtons.push(btn);
            var optionConfigValue = index;
            if (configId === "SETTINGS_THEME") {
                optionConfigValue = Math.round(Number(opt.value));
                if (!isFinite(optionConfigValue)) optionConfigValue = SETTINGS_THEME_DEFAULT;
                if (optionConfigValue < SETTINGS_THEME_DEFAULT) optionConfigValue = SETTINGS_THEME_DEFAULT;
                if (optionConfigValue > SETTINGS_THEME_MUNFINS) optionConfigValue = SETTINGS_THEME_MUNFINS;
            } else if (configId === "LANGUAGE") {
                optionConfigValue = Math.round(Number(opt.value));
                if (!isFinite(optionConfigValue)) optionConfigValue = SETTINGS_LANGUAGE_ENGLISH;
                // Validate against SETTINGS_LANGUAGE_OPTIONS (the list that's already kept
                // current whenever a language is added) instead of a hardcoded max value -
                // a hardcoded upper bound here previously went stale and silently clamped
                // every language added after Belarusian (Korean/Italian/Turkish) back down
                // to Belarusian whenever their button was clicked.
                var isValidLanguageValue = false;
                for (var langOptIdx = 0; langOptIdx < SETTINGS_LANGUAGE_OPTIONS.length; langOptIdx++) {
                    if (SETTINGS_LANGUAGE_OPTIONS[langOptIdx].value === optionConfigValue) { isValidLanguageValue = true; break; }
                }
                if (!isValidLanguageValue) optionConfigValue = SETTINGS_LANGUAGE_ENGLISH;
            }
            var updateBtn = function() {
                btn.SetHasClass("Active", MOD_CONFIG[configId] === optionConfigValue);
            };
            updateBtn();
            buttonGroupRefreshFns.push(updateBtn);
            btn.SetPanelEvent("onactivate", function() {
                MOD_CONFIG[configId] = optionConfigValue;
                for (var i = 0; i < buttonGroupRefreshFns.length; i++) {
                    try { buttonGroupRefreshFns[i](); } catch(eGroupRefresh) { WarnLog("settings", "op failed: " + (eGroupRefresh && eGroupRefresh.message ? eGroupRefresh.message : String(eGroupRefresh || ""))); }
                }
                SaveAndSync();
                refreshRowChangedState();
                if (configId === "LANGUAGE") {
                    var rootPanel = $.GetContextPanel();
                    var tabBar = rootPanel ? rootPanel.FindChildTraverse("SettingsTabBar") : null;
                    var settingsList = rootPanel ? rootPanel.FindChildTraverse("SettingsList") : null;
                    InvalidateSearchSectionIndexCache();
                    SyncTabActiveStates(tabBar);
                    if (settingsList && settingsList.IsValid && settingsList.IsValid()) {
                        RequestSettingsListRefresh(0, false);
                    }
                } else if (configId === "SETTINGS_THEME") {
                    ApplySettingsThemeClasses(null);
                    RequestSettingsListRefresh(0, false);
                }
            });
        });
        syncRowVisualState = function() {
            if (!row || !row.IsValid || !row.IsValid()) return false;
            for (var br = 0; br < buttonGroupRefreshFns.length; br++) {
                var buttonRefreshFn = buttonGroupRefreshFns[br];
                if (typeof buttonRefreshFn !== "function") continue;
                try { buttonRefreshFn(); } catch(eBtn) { WarnLog("settings", "op failed: " + (eBtn && eBtn.message ? eBtn.message : String(eBtn || ""))); }
            }
            refreshRowChangedState();
            return true;
        };
    } else if (type === "palette" && Array.isArray(options)) {
        row.AddClass("PalettePickerRow");
        var paletteGroup = $.CreatePanel("Panel", row, "");
        paletteGroup.AddClass("SettingControlRoot");
        paletteGroup.AddClass("PalettePickerGroup");
        var paletteButtons = [];
        var paletteRefreshFns = [];
        var sanitizePaletteValue = function(value) {
            var numeric = Math.round(Number(value));
            if (!isFinite(numeric)) numeric = 0;
            if (numeric < 0) numeric = 0;
            if (numeric > 29) numeric = 29;
            return numeric;
        };
        var buildPaletteTooltip = function(opt) {
            var name = LocalizeSettingsText((opt && opt.label) ? opt.label : "Default", true);
            if (!opt || !opt.hex) return name + " - " + LocalizeSettingsText("No color wash", true);
            return name + " - " + String(opt.hex);
        };
        var paletteRowPanel = null;
        options.forEach(function(opt, optIndex) {
            if (!opt) return;
            if (!paletteRowPanel || (optIndex % 10) === 0) {
                paletteRowPanel = $.CreatePanel("Panel", paletteGroup, "");
                paletteRowPanel.AddClass("PalettePickerSwatchRow");
            }
            var value = sanitizePaletteValue(opt.value);
            var swatch = $.CreatePanel("Button", paletteRowPanel, "");
            swatch.AddClass("PalettePickerSwatch");
            if (value === 0) swatch.AddClass("PalettePickerSwatchDefault");
            var colorChip = $.CreatePanel("Panel", swatch, "");
            colorChip.AddClass("PalettePickerSwatchChip");
            if (opt.hex) {
                try { colorChip.style.backgroundColor = String(opt.hex); } catch(eColor) { WarnLog("settings", "op failed: " + (eColor && eColor.message ? eColor.message : String(eColor || ""))); }
                try { colorChip.style.border = "1px solid rgba(255, 255, 255, 0.28)"; } catch(eBorder) { WarnLog("settings", "op failed: " + (eBorder && eBorder.message ? eBorder.message : String(eBorder || ""))); }
            } else {
                colorChip.AddClass("PalettePickerSwatchChipDefault");
            }
            var activeDot = $.CreatePanel("Panel", swatch, "");
            activeDot.AddClass("PalettePickerSwatchActiveDot");
            var updateSwatch = function() {
                var active = sanitizePaletteValue(MOD_CONFIG[configId]) === value;
                swatch.SetHasClass("Active", active);
            };
            updateSwatch();
            paletteRefreshFns.push(updateSwatch);
            paletteButtons.push(swatch);
            swatch.SetPanelEvent("onmouseover", function() {
                hideCustomRowTooltip();
                HideSettingsTextTooltip();
                CancelSettingsRowFloatingTooltipHide();
                ShowSettingsRowFloatingTooltip(
                    swatch,
                    "",
                    buildPaletteTooltip(opt),
                    PERF_IMPACT_TIER_NONE,
                    ""
                );
            });
            swatch.SetPanelEvent("onmouseout", function() {
                HideSettingsRowFloatingTooltipDeferred("palette_swatch_mouseout");
            });
            swatch.SetPanelEvent("onactivate", function() {
                MOD_CONFIG[configId] = value;
                PublishPaletteColorBridge(configId, value);
                for (var pi = 0; pi < paletteRefreshFns.length; pi++) {
                    try { paletteRefreshFns[pi](); } catch(eRefresh) { WarnLog("settings", "op failed: " + (eRefresh && eRefresh.message ? eRefresh.message : String(eRefresh || ""))); }
                }
                SaveAndSync();
                refreshRowChangedState();
                ShowConfigPreviewForConfigId(configId);
            });
        });
        syncRowVisualState = function() {
            if (!row || !row.IsValid || !row.IsValid()) return false;
            MOD_CONFIG[configId] = sanitizePaletteValue(MOD_CONFIG[configId]);
            for (var pr = 0; pr < paletteRefreshFns.length; pr++) {
                try { paletteRefreshFns[pr](); } catch(ePaletteRefresh) { WarnLog("settings", "op failed: " + (ePaletteRefresh && ePaletteRefresh.message ? ePaletteRefresh.message : String(ePaletteRefresh || ""))); }
            }
            refreshRowChangedState();
            return true;
        };
    } else if (type === "dropdown" && Array.isArray(options)) {
        var dropdownId = String(configId || "dropdown") + "_dropdown";
        var dropdownParent = row;
        var defaultHeroIconPanel = null;
        var languageIconPanel = null;
        if (configId === "VOICE_TYPE") {
            var voiceControlGroup = $.CreatePanel("Panel", row, "VoiceDropdownControlGroup");
            voiceControlGroup.AddClass("SettingControlRoot");
            voiceControlGroup.AddClass("VoiceDropdownControlGroup");
            dropdownParent = voiceControlGroup;
        } else if (configId === "LANGUAGE") {
            var languageControlGroup = $.CreatePanel("Panel", row, "LanguageDropdownControlGroup");
            languageControlGroup.AddClass("SettingControlRoot");
            languageControlGroup.AddClass("LanguageDropdownControlGroup");
            languageIconPanel = $.CreatePanel("Image", languageControlGroup, "LanguageDropdownIcon");
            languageIconPanel.AddClass("LanguageDropdownIcon");
            dropdownParent = languageControlGroup;
        } else if (configId === "DEFAULT_HERO") {
            var defaultHeroControlGroup = $.CreatePanel("Panel", row, "DefaultHeroDropdownControlGroup");
            defaultHeroControlGroup.AddClass("SettingControlRoot");
            defaultHeroControlGroup.AddClass("DefaultHeroDropdownControlGroup");
            defaultHeroIconPanel = $.CreatePanel("Image", defaultHeroControlGroup, "DefaultHeroDropdownHeroIcon");
            defaultHeroIconPanel.AddClass("DefaultHeroDropdownHeroIcon");
            dropdownParent = defaultHeroControlGroup;
        }
        var dropdown = $.CreatePanel("DropDown", dropdownParent, dropdownId);
        dropdown.AddClass("SettingsDropDown");
        dropdown.AddClass("QOLSettingsDropDown");
        dropdown.AddClass("SettingControlRoot");
        if (configId === "VOICE_TYPE") {
            dropdown.AddClass("VoicePrimaryDropDown");
        } else if (configId === "DEFAULT_HERO") {
            dropdown.AddClass("DefaultHeroDropDown");
        }
        if (dropdown && dropdown.style) {
            dropdown.style.width = (configId === "VOICE_TYPE")
                ? "150px"
                : ((configId === "LANGUAGE") ? "130px" : "150px");
        }
        var syncDefaultHeroIcon = function(heroValue) {
            if (!defaultHeroIconPanel || !defaultHeroIconPanel.IsValid || !defaultHeroIconPanel.IsValid()) return;
            try { defaultHeroIconPanel.SetImage(GetDefaultHeroIconPath(heroValue)); } catch(eHeroIcon) { WarnLog("settings", "op failed: " + (eHeroIcon && eHeroIcon.message ? eHeroIcon.message : String(eHeroIcon || ""))); }
        };
        var syncLanguageIcon = function(languageValue) {
            if (!languageIconPanel || !languageIconPanel.IsValid || !languageIconPanel.IsValid()) return;
            try { languageIconPanel.SetImage(GetLanguageIconPath(languageValue)); } catch(eLanguageIcon) { WarnLog("settings", "op failed: " + (eLanguageIcon && eLanguageIcon.message ? eLanguageIcon.message : String(eLanguageIcon || ""))); }
        };

        var valueByOptionId = {};
        var optionIdByValueKey = {};
        var selectedOptionId = "";
        var selectedConfigValue = MOD_CONFIG[configId];
        var selectedConfigValueKey = String(selectedConfigValue === undefined || selectedConfigValue === null ? "" : selectedConfigValue);
        for (var oi = 0; oi < options.length; oi++) {
            var opt = options[oi] || {};
            var optionValue = (opt.value !== undefined && opt.value !== null)
                ? opt.value
                : String(opt.label || "");
            var optionValueKey = String(optionValue === undefined || optionValue === null ? "" : optionValue);
            if (!optionValueKey || optionValueKey.length === 0) continue;
            var optionId = String(configId || "dropdown") + "_opt_" + String(oi);
            var optionPanel = $.CreatePanel("Label", dropdown, optionId);
            optionPanel.AddClass("QOLSettingsDropDownItem");
            optionPanel.AddClass("DropDownChild");
            if (configId === "DEFAULT_HERO") {
                optionPanel.AddClass("DefaultHeroDropDownItem");
                try { optionPanel.style.backgroundImage = 'url("' + GetDefaultHeroIconPath(optionValueKey) + '")'; } catch(eBgImg) { WarnLog("settings", "op failed: " + (eBgImg && eBgImg.message ? eBgImg.message : String(eBgImg || ""))); }
                try { optionPanel.style.backgroundRepeat = "no-repeat"; } catch(eBgRepeat) { WarnLog("settings", "op failed: " + (eBgRepeat && eBgRepeat.message ? eBgRepeat.message : String(eBgRepeat || ""))); }
                try { optionPanel.style.backgroundPosition = "10px 50%"; } catch(eBgPos) { WarnLog("settings", "op failed: " + (eBgPos && eBgPos.message ? eBgPos.message : String(eBgPos || ""))); }
                try { optionPanel.style.backgroundSize = "18px 18px"; } catch(eBgSize) { WarnLog("settings", "op failed: " + (eBgSize && eBgSize.message ? eBgSize.message : String(eBgSize || ""))); }
            } else if (configId === "LANGUAGE") {
                optionPanel.AddClass("LanguageDropDownItem");
                try { optionPanel.style.backgroundImage = 'url("' + GetLanguageIconPath(optionValueKey) + '")'; } catch(eLangBgImg) { WarnLog("settings", "op failed: " + (eLangBgImg && eLangBgImg.message ? eLangBgImg.message : String(eLangBgImg || ""))); }
                try { optionPanel.style.backgroundRepeat = "no-repeat"; } catch(eLangBgRepeat) { WarnLog("settings", "op failed: " + (eLangBgRepeat && eLangBgRepeat.message ? eLangBgRepeat.message : String(eLangBgRepeat || ""))); }
                try { optionPanel.style.backgroundPosition = "10px 50%"; } catch(eLangBgPos) { WarnLog("settings", "op failed: " + (eLangBgPos && eLangBgPos.message ? eLangBgPos.message : String(eLangBgPos || ""))); }
                try { optionPanel.style.backgroundSize = "18px 18px"; } catch(eLangBgSize) { WarnLog("settings", "op failed: " + (eLangBgSize && eLangBgSize.message ? eLangBgSize.message : String(eLangBgSize || ""))); }
                (function(optionIdRef, optionValueRef) {
                    optionPanel.SetPanelEvent("onactivate", function() {
                        suppressNextDropdownSubmit = true;
                        selectedOptionId = optionIdRef;
                        $.Schedule(0, function() {
                            commitDropdownSelection(optionValueRef);
                        });
                    });
                })(optionId, optionValue);
            }
            // Proper-noun dropdowns (hero names, announcer/voice names, language names) must NOT be
            // localized — their labels are data, not UI text, and some collide with translated map
            // keys (e.g. the hero "Silver" vs the palette color "Silver").
            var _localizeOptionLabel = (configId !== "DEFAULT_HERO" && configId !== "VOICE_TYPE" && configId !== "LANGUAGE");
            var _optionLabelText = String(opt.label !== undefined && opt.label !== null ? opt.label : optionValueKey);
            optionPanel.text = _localizeOptionLabel ? LocalizeSettingsText(_optionLabelText, true) : _optionLabelText;
            if (optionPanel.SetAttributeString) {
                optionPanel.SetAttributeString("data_value", optionValueKey);
            }

            if (configId === "VOICE_TYPE") {
                (function(optionPanelRef, optionValueRef, rowAnchorRef) {
                    var customSlotIndex = GetCustomAnnouncerSlotIndexFromOptionValue(optionValueRef);
                    if (customSlotIndex <= 0) return;
                    optionPanelRef.SetPanelEvent("onmouseover", function() {
                        HideSettingsTextTooltip();
                        CancelSettingsRowFloatingTooltipHide();
                        ShowSettingsRowFloatingTooltip(
                            rowAnchorRef,
                            "",
                            "",
                            PERF_IMPACT_TIER_NONE,
                            "",
                            { voiceMeta: BuildCustomAnnouncerSlotMetadataHoverInfo(customSlotIndex) }
                        );
                    });
                    optionPanelRef.SetPanelEvent("onmouseout", function() {
                        HideSettingsRowFloatingTooltipDeferred("voice_dropdown_option_mouseout");
                    });
                })(optionPanel, optionValue, row);
            }

            dropdown.AddOption(optionPanel);
            valueByOptionId[optionId] = optionValue;
            optionIdByValueKey[optionValueKey] = optionId;
            if (!selectedOptionId && selectedConfigValueKey === optionValueKey) {
                selectedOptionId = optionId;
            }
        }

        var firstOptionId = "";
        for (var optionKey in valueByOptionId) {
            firstOptionId = optionKey;
            break;
        }
        if (!selectedOptionId) selectedOptionId = firstOptionId;
        if (selectedOptionId) {
            try { dropdown.SetSelected(selectedOptionId); } catch(e0) { WarnLog("settings", "op failed: " + (e0 && e0.message ? e0.message : String(e0 || ""))); }
            if (MOD_CONFIG[configId] === undefined || MOD_CONFIG[configId] === null || MOD_CONFIG[configId] === "") {
                MOD_CONFIG[configId] = valueByOptionId[selectedOptionId];
            }
        }
        if (configId === "DEFAULT_HERO") {
            syncDefaultHeroIcon(MOD_CONFIG[configId]);
        } else if (configId === "LANGUAGE") {
            syncLanguageIcon(MOD_CONFIG[configId]);
        }

        var dropdownSyncMute = false;
        var suppressNextDropdownSubmit = false;
        var commitDropdownSelection = function(forcedValue) {
            if (dropdownSyncMute) return;
            if (suppressNextDropdownSubmit && (forcedValue === undefined || forcedValue === null || String(forcedValue).length <= 0)) {
                suppressNextDropdownSubmit = false;
                return;
            }
            var selectedValue;
            var hasSelectedValue = false;
            if (forcedValue !== undefined && forcedValue !== null && String(forcedValue).length > 0) {
                selectedValue = forcedValue;
                hasSelectedValue = true;
            } else {
                var selectedPanel = null;
                try { selectedPanel = dropdown.GetSelected ? dropdown.GetSelected() : null; } catch (e1) { selectedPanel = null; }
                if (selectedPanel) {
                    var selectedId = "";
                    try { selectedId = selectedPanel.id ? String(selectedPanel.id) : ""; } catch (e2) { selectedId = ""; }
                    if (selectedId) selectedOptionId = selectedId;
                    if (selectedId && valueByOptionId.hasOwnProperty(selectedId)) {
                        selectedValue = valueByOptionId[selectedId];
                        hasSelectedValue = true;
                    }
                    if (!hasSelectedValue && selectedPanel.GetAttributeString) {
                        try { selectedValue = String(selectedPanel.GetAttributeString("data_value", "") || ""); } catch (e3) { selectedValue = ""; }
                        hasSelectedValue = (selectedValue !== undefined && selectedValue !== null && String(selectedValue).length > 0);
                    }
                }
            }
            if (!hasSelectedValue && selectedOptionId && valueByOptionId.hasOwnProperty(selectedOptionId)) {
                selectedValue = valueByOptionId[selectedOptionId];
                hasSelectedValue = true;
            }
            if (!hasSelectedValue) return;

            var currentValue = MOD_CONFIG[configId];
            if (typeof currentValue === "number") {
                var asNumber = Number(selectedValue);
                if (!isFinite(asNumber)) return;
                selectedValue = Math.round(asNumber);
            }

            var selectionChanged = String(currentValue === undefined || currentValue === null ? "" : currentValue) !==
                String(selectedValue === undefined || selectedValue === null ? "" : selectedValue);
            if (configId === "DEFAULT_HERO") {
                ApplyDefaultHeroSelection(String(selectedValue || ""));
            } else if (configId === "HEALTHBAR_TYPE") {
                var previousTypeValue = currentValue;
                ApplyHealthbarTypeSelection(selectedValue);
                selectedValue = MOD_CONFIG.HEALTHBAR_TYPE;
                selectionChanged = String(previousTypeValue === undefined || previousTypeValue === null ? "" : previousTypeValue) !==
                    String(selectedValue === undefined || selectedValue === null ? "" : selectedValue);
            }
            if (selectionChanged) {
                MOD_CONFIG[configId] = selectedValue;
                SaveAndSync();
                refreshRowChangedState();
                if (configId === "DEFAULT_HERO") {
                    syncDefaultHeroIcon(selectedValue);
                } else if (configId === "LANGUAGE") {
                    syncLanguageIcon(selectedValue);
                }
                if (configId === "LANGUAGE") {
                    var rootPanel = $.GetContextPanel();
                    var tabBar = rootPanel ? rootPanel.FindChildTraverse("SettingsTabBar") : null;
                    var settingsList = rootPanel ? rootPanel.FindChildTraverse("SettingsList") : null;
                    InvalidateSearchSectionIndexCache();
                    SyncTabActiveStates(tabBar);
                    if (settingsList && settingsList.IsValid && settingsList.IsValid()) {
                        RequestSettingsListRefresh(0, false);
                    }
                }
            } else if (configId === "DEFAULT_HERO") {
                syncDefaultHeroIcon(selectedValue);
            }
        };
        if (configId === "LANGUAGE") {
            dropdown.SetPanelEvent("oninputsubmit", function() {});
        } else {
            dropdown.SetPanelEvent("oninputsubmit", commitDropdownSelection);
        }

        if (configId === "VOICE_TYPE" && dropdownParent && dropdownParent.IsValid && dropdownParent.IsValid()) {
            var voiceTestBtn = $.CreatePanel("Button", dropdownParent, "VoiceDropdownTestBtn");
            voiceTestBtn.AddClass("SectionTitleActionBtn");
            voiceTestBtn.AddClass("VoiceDropdownTestBtn");

            var voiceTestIcon = $.CreatePanel("Image", voiceTestBtn, "VoiceDropdownTestBtnIcon", {
                src: "s2r://panorama/images/icons/icon_sound_on.vsvg",
                defaultsrc: "",
                scaling: "contain"
            });
            voiceTestIcon.AddClass("SectionTitleActionIcon");

            var voiceTestLabel = $.CreatePanel("Label", voiceTestBtn, "VoiceDropdownTestBtnLabel");
            voiceTestLabel.AddClass("SectionTitleActionLabel");
            voiceTestLabel.text = "";

            var voiceTestTooltipText = LocalizeSettingsText("Play current announcer voice.", true);
            voiceTestBtn.SetPanelEvent("onmouseover", function() {
                HideSettingsTextTooltip();
                CancelSettingsRowFloatingTooltipHide();
                ShowSettingsRowFloatingTooltip(
                    voiceTestBtn,
                    "",
                    voiceTestTooltipText,
                    PERF_IMPACT_TIER_NONE,
                    ""
                );
            });
            voiceTestBtn.SetPanelEvent("onmouseout", function() {
                HideSettingsRowFloatingTooltipDeferred("voice_test_btn_mouseout");
            });
            voiceTestBtn.SetPanelEvent("onactivate", function() {
                PlayAnnouncerPreviewSound();
                voiceTestBtn.AddClass("SuccessState");
                $.Schedule(0.28, function() {
                    if (voiceTestBtn && voiceTestBtn.IsValid && voiceTestBtn.IsValid()) {
                        voiceTestBtn.RemoveClass("SuccessState");
                    }
                });
            });
        }
        syncRowVisualState = function() {
            if (!row || !row.IsValid || !row.IsValid()) return false;
            var currentValueKey = String(MOD_CONFIG[configId] === undefined || MOD_CONFIG[configId] === null ? "" : MOD_CONFIG[configId]);
            var targetOptionId = optionIdByValueKey[currentValueKey] || firstOptionId;
            if (targetOptionId) {
                selectedOptionId = targetOptionId;
                dropdownSyncMute = true;
                try { dropdown.SetSelected(targetOptionId); } catch(eSel) { WarnLog("settings", "op failed: " + (eSel && eSel.message ? eSel.message : String(eSel || ""))); }
                dropdownSyncMute = false;
            }
            if (configId === "DEFAULT_HERO") {
                syncDefaultHeroIcon(MOD_CONFIG[configId]);
            } else if (configId === "LANGUAGE") {
                syncLanguageIcon(MOD_CONFIG[configId]);
            }
            refreshRowChangedState();
            return true;
        };
    } else if (type === "preset" && Array.isArray(options)) {
        var group = $.CreatePanel("Panel", row, "");
        group.AddClass("SettingButtonGroup");
        group.AddClass("SettingControlRoot");
        options.forEach(function(opt) {
            var btn = $.CreatePanel("Button", group, "");
            btn.AddClass("SegmentBtn");
            var btnLbl = $.CreatePanel("Label", btn, "");
            btnLbl.text = opt.label;
            btn.SetPanelEvent("onactivate", function() {
                var presetData = opt.label === "Default" ? DEFAULT_CONFIG : PRESETS[opt.label];
                if (ApplyPresetConfig(presetData)) {
                    SaveAndSync();
                    btn.AddClass("SuccessState");
                    $.Schedule(0.28, function() {
                        if (btn.IsValid()) btn.RemoveClass("SuccessState");
                        RequestSettingsListSoftRefresh(0);
                    });
                }
            });
        });
    } else if (type === "actionbutton") {
        var actionConfig = (Array.isArray(options) && options.length > 0) ? options[0] : {};
        var isArcadePlayAction = (
            configId === "OPEN_MINESWEEPER" ||
            configId === "OPEN_FLAPPY_BIRD" ||
            configId === "OPEN_AIM_TRAINER" ||
            configId === "OPEN_TRAIN_TRACKING" ||
            configId === "OPEN_WHACK_A_REM" ||
            configId === "OPEN_BLACKJACK"
        );
        var actionGroup = $.CreatePanel("Panel", row, "");
        actionGroup.AddClass("SettingActionGroup");
        actionGroup.AddClass("SettingControlRoot");
        if (configId === "OPEN_OLD_ITEM_FILTERS_DOWNLOAD") {
            actionGroup.AddClass("OptimizeFiltersActionGroup");
        }
        if (isArcadePlayAction) {
            actionGroup.AddClass("ArcadePlayActionGroup");
        }

        var actionBtn = $.CreatePanel("Button", actionGroup, "");
        actionBtn.AddClass("SettingActionBtn");
        if (configId === "OPEN_OLD_ITEM_FILTERS_DOWNLOAD") {
            actionBtn.AddClass("OptimizeFiltersActionBtn");
        }
        if (isArcadePlayAction) {
            actionBtn.AddClass("ArcadePlayActionBtn");
        } else if (configId === "TEST_SKYRUNNER") {
            actionBtn.AddClass("TestSkyrunnerActionBtn");
        }
        var actionInner = $.CreatePanel("Panel", actionBtn, "");
        actionInner.AddClass("SettingActionBtnInner");

        var iconSrc = actionConfig.icon || "";
        if (iconSrc !== "") {
            var actionIcon = $.CreatePanel("Image", actionInner, "", {
                src: iconSrc,
                defaultsrc: "",
                scaling: "contain"
            });
            actionIcon.AddClass("SettingActionBtnIcon");
        }

        var actionLbl = $.CreatePanel("Label", actionInner, "");
        actionLbl.AddClass("SettingActionBtnLabel");
        actionLbl.text = LocalizeSettingsText(actionConfig.label || "Test");

        if (isArcadePlayAction && actionConfig.onDeathCheckbox) {
            var onDeathConfigKey = String(actionConfig.onDeathConfigKey || "");
            if (!onDeathConfigKey) onDeathConfigKey = "ENABLE_ON_DEATH_GAMES";
            var onDeathToggleBtn = $.CreatePanel("ToggleButton", actionGroup, "");
            onDeathToggleBtn.AddClass("CitadelSettingsCheckbox");
            onDeathToggleBtn.AddClass("MultiCheckboxBtn");
            onDeathToggleBtn.AddClass("ArcadeOnDeathCheckBtn");

            var onDeathLbl = $.CreatePanel("Label", onDeathToggleBtn, "");
            onDeathLbl.AddClass("MultiCheckboxLabel");
            onDeathLbl.AddClass("ArcadeOnDeathCheckLabel");
            onDeathLbl.text = LocalizeSettingsText("Play When On Death Enabled");

            var syncOnDeathToggleVisual = function() {
                if (!onDeathToggleBtn || !onDeathToggleBtn.IsValid || !onDeathToggleBtn.IsValid()) return false;
                var enabled = (Number(MOD_CONFIG[onDeathConfigKey]) === 1);
                try { onDeathToggleBtn.SetSelected(enabled); } catch(eSel0) { WarnLog("settings", "op failed: " + (eSel0 && eSel0.message ? eSel0.message : String(eSel0 || ""))); }
                onDeathToggleBtn.SetHasClass("selected", enabled);
                onDeathToggleBtn.SetHasClass("IsSelected", enabled);
                onDeathToggleBtn.SetHasClass("Active", enabled);
                return true;
            };
            syncOnDeathToggleVisual();
            gArcadeOnDeathSyncFns.push(syncOnDeathToggleVisual);

            onDeathToggleBtn.SetPanelEvent("onactivate", function() {
                MOD_CONFIG[onDeathConfigKey] = (Number(MOD_CONFIG[onDeathConfigKey]) === 1) ? 0 : 1;
                SaveAndSync();
                for (var iSync = gArcadeOnDeathSyncFns.length - 1; iSync >= 0; iSync--) {
                    var syncFn = gArcadeOnDeathSyncFns[iSync];
                    var keep = true;
                    if (typeof syncFn !== "function") {
                        keep = false;
                    } else {
                        try { keep = (syncFn() !== false); } catch (eSync) { keep = false; }
                    }
                    if (!keep) gArcadeOnDeathSyncFns.splice(iSync, 1);
                }
            });
        }

        if (actionConfig.tooltip) {
            var localizedTooltip = LocalizeSettingsText(actionConfig.tooltip);
            actionBtn.SetPanelEvent("onmouseover", function() {
                $.DispatchEvent("UIShowTextTooltip", actionBtn, localizedTooltip);
            });
            actionBtn.SetPanelEvent("onmouseout", function() {
                $.DispatchEvent("UIHideTextTooltip");
            });
        }

        actionBtn.SetPanelEvent("onactivate", function() {
            var handled = false;
            if (configId === "PREVIEW_ANNOUNCER") {
                PlayAnnouncerPreviewSound();
                handled = true;
            } else if (configId === "OPEN_MINESWEEPER") {
                OpenMinesweeperModal();
                handled = true;
            } else if (configId === "OPEN_FLAPPY_BIRD") {
                OpenFlappyModal();
                handled = true;
            } else if (configId === "OPEN_AIM_TRAINER") {
                OpenAimTrainerModal();
                handled = true;
            } else if (configId === "OPEN_TRAIN_TRACKING") {
                OpenTrainTrackingModal();
                handled = true;
            } else if (configId === "OPEN_WHACK_A_REM") {
                OpenWhackRemModal();
                handled = true;
            } else if (configId === "OPEN_BLACKJACK") {
                OpenBlackjackModal();
                handled = true;
            } else if (configId === "TEST_SKYRUNNER") {
                handled = ApplyDefaultHeroSelection("hero_skyrunner");
                if (handled) {
        SetLocalizedConfigFeedbackMessage("Skyrunner switch sent.", "success", 1400);
                } else {
        SetLocalizedConfigFeedbackMessage("Failed to switch hero.", "error", 1800);
                    actionBtn.AddClass("FailureState");
                    $.Schedule(0.35, function() {
                        if (actionBtn && actionBtn.IsValid && actionBtn.IsValid()) actionBtn.RemoveClass("FailureState");
                    });
                }
            } else if (configId === "OPEN_OLD_ITEM_FILTERS_DOWNLOAD") {
                $.DispatchEvent("ExternalBrowserGoToURL", "https://gamebanana.com/mods/601444");
                handled = true;
            } else if (configId && configId.indexOf("SEARCH_PRESET:") === 0) {
                var presetName = configId.slice("SEARCH_PRESET:".length);
                handled = ApplyPresetByName(presetName);
            } else if (configId === "OPEN_COMMISSIONS") {
                $.DispatchEvent("ExternalBrowserGoToURL", "https://ko-fi.com/civocivocivo/commissions");
                handled = true;
            } else if (configId && configId.indexOf("SEARCH_TAB:") === 0) {
                var targetTab = configId.slice("SEARCH_TAB:".length);
                if (targetTab) {
                    var rootPanel = $.GetContextPanel();
                    ClearSettingsSearchQuery(rootPanel);
                    if (currentTab === targetTab) {
                        var settingsList = rootPanel ? rootPanel.FindChildTraverse("SettingsList") : null;
                        if (settingsList && settingsList.IsValid && settingsList.IsValid()) {
                            RequestSettingsListRefresh(0, false);
                        }
                    } else {
                        SetActiveTabAndRefresh(targetTab);
                    }
                    handled = true;
                }
            }
            if (!handled) return;
            actionBtn.AddClass("SuccessState");
            $.Schedule(0.28, function() {
                if (actionBtn.IsValid()) actionBtn.RemoveClass("SuccessState");
            });
        });
    } else if (type === "runtime_toggle") {
        var runtimeConfig = (Array.isArray(options) && options.length > 0) ? options[0] : {};
        var runtimeKey = runtimeConfig.key || configId || label || "runtime_toggle";
        if (!gRuntimeToggleState.hasOwnProperty(runtimeKey)) {
            gRuntimeToggleState[runtimeKey] = false;
        }
        var runtimeBtn = $.CreatePanel("Panel", row, "");
        runtimeBtn.AddClass("SettingToggleBtn");
        runtimeBtn.AddClass("SettingControlRoot");
        var runtimeSwitchButton = $.CreatePanel("Button", runtimeBtn, "");
        runtimeSwitchButton.AddClass("SwitchButton");
        var runtimeHandle = $.CreatePanel("Panel", runtimeSwitchButton, "handle");
        runtimeHandle.AddClass("SettingToggleHandle");
        var setRuntimeSwitchState = function(isOn) {
            runtimeBtn.SetHasClass("ToggleActive", isOn === true);
            runtimeBtn.SetHasClass("ToggleOn", isOn === true);
            runtimeBtn.SetHasClass("ToggleOff", isOn !== true);
        };
        var updateRuntimeBtn = function() {
            setRuntimeSwitchState(gRuntimeToggleState[runtimeKey] === true);
        };
        updateRuntimeBtn();
        var activateRuntimeToggle = function() {
            var nextState = !gRuntimeToggleState[runtimeKey];
            gRuntimeToggleState[runtimeKey] = nextState;
            updateRuntimeBtn();
            var commandToRun = nextState ? runtimeConfig.onCommand : runtimeConfig.offCommand;
            RunConsoleCommandBestEffort(commandToRun || "");
        };
        runtimeSwitchButton.SetPanelEvent("onactivate", activateRuntimeToggle);
        syncRowVisualState = function() {
            if (!row || !row.IsValid || !row.IsValid()) return false;
            updateRuntimeBtn();
            refreshRowChangedState();
            return true;
        };
    } else {
        var toggleConfig = null;
        if (Array.isArray(options) && options.length > 0 && options[0] && typeof options[0] === "object") {
            toggleConfig = options[0];
        } else if (options && typeof options === "object") {
            toggleConfig = options;
        }
        var invertToggle = !!(toggleConfig && toggleConfig.invert === true);
        var getToggleIsActive = function() {
            var baseState = (MOD_CONFIG[configId] === 1);
            return invertToggle ? !baseState : baseState;
        };
        var initialToggleActive = getToggleIsActive();
        var btn = $.CreatePanel("Panel", row, "");
        btn.AddClass("SettingToggleBtn");
        btn.AddClass("SettingControlRoot");
        var setSwitchState = function(isOn) {
            btn.SetHasClass("ToggleActive", isOn === true);
            btn.SetHasClass("ToggleOn", isOn === true);
            btn.SetHasClass("ToggleOff", isOn !== true);
        };
        // Set initial class state before handle panel is created so search results do not replay off->on motion.
        setSwitchState(initialToggleActive);
        var switchButton = $.CreatePanel("Button", btn, "");
        switchButton.AddClass("SwitchButton");
        var handlePanel = $.CreatePanel("Panel", switchButton, "handle");
        handlePanel.AddClass("SettingToggleHandle");
        var update = function() { setSwitchState(getToggleIsActive()); };
        // For normal tab rendering we can still sync once after construction.
        if (!gSearchResultRenderMode) update();
        var activateToggle = function() {
            var nextActive = !getToggleIsActive();
            MOD_CONFIG[configId] = invertToggle ? (nextActive ? 0 : 1) : (nextActive ? 1 : 0);
            update();
            if (configId === "PREVIEWS_ENABLED" && MOD_CONFIG[configId] !== 1) {
                HideMinimapSizePreview();
            }
            if (configId === "DRAG_ENABLED") {
                var settingsWindow = $.GetContextPanel().FindChildTraverse("SettingsWindow");
                if (settingsWindow && settingsWindow.IsValid && settingsWindow.IsValid()) {
                    SetupSettingsWindowDragging(settingsWindow.FindChildTraverse("SettingsHeader"), settingsWindow);
                }
            }
            SaveAndSync();
            refreshRowChangedState();
            if (configId === "ENABLE_OLD_ITEM_COOLDOWNS") {
                RequestSettingsListRefresh(0, true);
            }
            ShowConfigPreviewForConfigId(configId);
        };
        switchButton.SetPanelEvent("onactivate", activateToggle);
        syncRowVisualState = function() {
            if (!row || !row.IsValid || !row.IsValid()) return false;
            update();
            refreshRowChangedState();
            return true;
        };
    }
    RegisterSettingsListRowSync(function() {
        return syncRowVisualState();
    });
    return row;
}

function CreateInlineSecondaryCheckboxToggleRow(parent, label, configId, secondaryLabel, secondaryConfigId, description, secondaryDescription, rowOptions) {
    rowOptions = rowOptions || {};
    var invertMain = rowOptions && rowOptions.invert === true;
    var localizedLabel = LocalizeSettingsText(label || "");
    var effectiveDescription = GetSettingDescriptionOverride(
        configId,
        label,
        description || "",
        GetCurrentSettingsCategoryKey()
    );
    var localizedDescription = LocalizeSettingsText(effectiveDescription || "");
    var hasRowDescription = !!(effectiveDescription && effectiveDescription !== "" && localizedDescription && localizedDescription !== "");
    var mainPerfInfo = BuildPerfImpactTooltipLine(configId, "toggle", null);
    var secondaryPerfInfo = BuildPerfImpactTooltipLine(secondaryConfigId, "toggle", null);
    var rowPerfTier = PERF_IMPACT_TIER_NONE;
    if (mainPerfInfo && mainPerfInfo.tier) rowPerfTier = MaxPerfImpactTier(rowPerfTier, String(mainPerfInfo.tier));
    if (secondaryPerfInfo && secondaryPerfInfo.tier) rowPerfTier = MaxPerfImpactTier(rowPerfTier, String(secondaryPerfInfo.tier));
    var rowCreatedBy = GetSettingCreatedBy(configId, label);
    var rowTooltipPerfLine = BuildPerfImpactLineForTier(rowPerfTier);
    var rowTooltipDescLine = hasRowDescription ? localizedDescription : "";
    var hasRowTooltip = HasMeaningfulFloatingTooltipContent(rowPerfTier, rowTooltipDescLine, rowCreatedBy);
    if (gSearchCollectMode && gSearchCollectState) {
        GetActiveSearchCollectSection().rows.push(BuildSearchCollectedRow(
            localizedLabel,
            configId,
            "toggle",
            null,
            null,
            null,
            [{ inlineSecondaryCheckbox: secondaryConfigId || "" }],
            localizedDescription,
            [LocalizeSettingsText(secondaryLabel || ""), secondaryConfigId || "", secondaryDescription || ""]
        ));
        return null;
    }

    var row = $.CreatePanel("Panel", parent, "");
    if (gSearchResultRenderMode) row.AddClass("SearchResultRow");
    row.AddClass("SettingRow");
    row.AddClass("RowTypeToggle");
    row.AddClass("InlineSecondaryCheckboxRow");

    var labelContainer = $.CreatePanel("Panel", row, "");
    labelContainer.AddClass("LabelContainer");
    var lbl = $.CreatePanel("Label", labelContainer, "");
    lbl.AddClass("SettingLabel");
    lbl.text = localizedLabel;

    var rowConfigKeys = [];
    if (configId) rowConfigKeys.push(configId);
    if (secondaryConfigId) rowConfigKeys.push(secondaryConfigId);
    if (row && row.SetAttributeString) {
        try { row.SetAttributeString(SETTING_ROW_RESET_KEYS_ATTR, rowConfigKeys.join(",")); } catch(e0) { WarnLog("settings", "op failed: " + (e0 && e0.message ? e0.message : String(e0 || ""))); }
    }

    var rowResetBtn = null;
    if (rowConfigKeys.length > 0) {
        rowResetBtn = $.CreatePanel("Button", labelContainer, "");
        rowResetBtn.AddClass("SettingRowResetBtn");
        var rowResetIcon = $.CreatePanel("Image", rowResetBtn, "", {
            src: "s2r://panorama/images/icons/icon_refresh.vsvg",
            defaultsrc: "",
            scaling: "contain"
        });
        rowResetIcon.AddClass("SettingRowResetIcon");
        rowResetIcon.AddClass("QOLResetIcon");
        try { rowResetIcon.SetImage("s2r://panorama/images/icons/icon_refresh.vsvg"); } catch(eImg) { WarnLog("settings", "op failed: " + (eImg && eImg.message ? eImg.message : String(eImg || ""))); }
        rowResetBtn.SetPanelEvent("onmouseover", function() {
            HideSettingsTextTooltip();
            CancelSettingsRowFloatingTooltipHide();
            ShowSettingsRowFloatingTooltip(
                rowResetBtn,
                "",
                LocalizeSettingsText("Reset row to defaults", true),
                PERF_IMPACT_TIER_NONE,
                ""
            );
        });
        rowResetBtn.SetPanelEvent("onmouseout", function() {
            HideSettingsTextTooltip();
            HideSettingsRowFloatingTooltipDeferred("row_reset_btn_mouseout");
        });
        rowResetBtn.SetPanelEvent("onactivate", function() {
            var changedCount = ApplyResetForConfigKeys(rowConfigKeys);
            if (changedCount > 0) {
                SaveAndSync();
                syncRowVisualState();
                SetConfigFeedbackMessage(IsRussianSettingsLanguage()
                    ? ("\u0421\u0431\u0440\u043E\u0448\u0435\u043D\u0430 \u0441\u0442\u0440\u043E\u043A\u0430 (" + String(changedCount) + ").")
                    : ("Row reset (" + String(changedCount) + ")."), "success", 1400);
            } else {
                SetConfigFeedbackMessage(IsRussianSettingsLanguage()
                    ? "\u0421\u0442\u0440\u043E\u043A\u0430 \u0443\u0436\u0435 \u043F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E."
                    : "Row already at defaults.", "info", 1200);
            }
        });
    }

    var refreshRowChangedState = BindRowChangedState(row, labelContainer, rowConfigKeys, rowResetBtn);
    var showCustomRowTooltip = function() {};
    var hideCustomRowTooltip = function() {};
    if (hasRowTooltip) {
        showCustomRowTooltip = function() {
            CancelSettingsRowFloatingTooltipHide();
            ShowSettingsRowFloatingTooltip(row, rowTooltipPerfLine, rowTooltipDescLine, rowPerfTier, rowCreatedBy);
        };
        hideCustomRowTooltip = function() {
            HideSettingsRowFloatingTooltipDeferred("row_mouseout");
        };
        row.SetPanelEvent("onmouseover", function() {
            showCustomRowTooltip();
        });
        row.SetPanelEvent("onmouseout", function() {
            hideCustomRowTooltip();
        });
    }

    var controls = $.CreatePanel("Panel", row, "");
    controls.AddClass("SettingControlRoot");
    controls.AddClass("InlineSecondaryCheckboxControls");

    var btn = $.CreatePanel("Panel", controls, "");
    btn.AddClass("SettingToggleBtn");
    btn.AddClass("TogglePrimary");
    var setSwitchState = function(isOn) {
        btn.SetHasClass("ToggleActive", isOn === true);
        btn.SetHasClass("ToggleOn", isOn === true);
        btn.SetHasClass("ToggleOff", isOn !== true);
    };
    var switchButton = $.CreatePanel("Button", btn, "");
    switchButton.AddClass("SwitchButton");
    var handlePanel = $.CreatePanel("Panel", switchButton, "handle");
    handlePanel.AddClass("SettingToggleHandle");

    var checkboxWrap = $.CreatePanel("Panel", controls, "");
    checkboxWrap.AddClass("InlineSecondaryCheckboxWrap");
    var secondaryBtn = $.CreatePanel("Button", checkboxWrap, "");
    secondaryBtn.AddClass("InlineSecondaryCheckboxBtn");
    secondaryBtn.AddClass("CitadelSettingsCheckbox");
    secondaryBtn.AddClass("MultiCheckboxBtn");
    var tickBox = $.CreatePanel("Panel", secondaryBtn, "");
    tickBox.AddClass("TickBox");
    var secondaryLbl = $.CreatePanel("Label", secondaryBtn, "");
    secondaryLbl.AddClass("InlineSecondaryCheckboxLabel");
    secondaryLbl.AddClass("MultiCheckboxLabel");
    secondaryLbl.text = LocalizeSettingsText(secondaryLabel || "");

    var update = function() {
        var mainEnabled = invertMain ? (MOD_CONFIG[configId] !== 1) : (MOD_CONFIG[configId] === 1);
        var secondaryEnabled = (MOD_CONFIG[secondaryConfigId] === 1);
        setSwitchState(mainEnabled);
        checkboxWrap.SetHasClass("Disabled", !mainEnabled);
        secondaryBtn.enabled = mainEnabled;
        secondaryBtn.SetHasClass("selected", secondaryEnabled);
        secondaryBtn.SetHasClass("Active", secondaryEnabled);
    };

    switchButton.SetPanelEvent("onactivate", function() {
        MOD_CONFIG[configId] = (MOD_CONFIG[configId] === 1) ? 0 : 1;
        update();
        SaveAndSync();
        refreshRowChangedState();
        ShowConfigPreviewForConfigId(configId);
    });
    secondaryBtn.SetPanelEvent("onactivate", function() {
        var mainEnabled = invertMain ? (MOD_CONFIG[configId] !== 1) : (MOD_CONFIG[configId] === 1);
        if (!mainEnabled) return;
        MOD_CONFIG[secondaryConfigId] = (MOD_CONFIG[secondaryConfigId] === 1) ? 0 : 1;
        update();
        SaveAndSync();
        refreshRowChangedState();
        ShowConfigPreviewForConfigId(secondaryConfigId);
    });

    var syncRowVisualState = function() {
        if (!row || !row.IsValid || !row.IsValid()) return false;
        update();
        refreshRowChangedState();
        return true;
    };
    update();
    RegisterSettingsListRowSync(function() {
        return syncRowVisualState();
    });
    return row;
}

function ApplyPresetConfig(presetData) {
    if (!presetData) return false;

    // Keep UI-only layout settings untouched by preset swaps.
    var preservedDragEnabled = MOD_CONFIG.DRAG_ENABLED;
    var preservedPreviewsEnabled = MOD_CONFIG.PREVIEWS_ENABLED;

    for (var key in DEFAULT_CONFIG) {
        MOD_CONFIG[key] = DEFAULT_CONFIG[key];
    }
    for (var presetKey in presetData) {
        MOD_CONFIG[presetKey] = presetData[presetKey];
    }
    NormalizeNeutralCampFlags(MOD_CONFIG, presetData);
    NormalizeItemCooldownModeConfig(MOD_CONFIG, presetData);
    NormalizeAmmoScaleConfig(MOD_CONFIG, presetData);
    NormalizeVoiceTypeConfig(MOD_CONFIG);
    NormalizeHealthbarTypeConfig(MOD_CONFIG, presetData);
    NormalizeColorWarningConfig(MOD_CONFIG, presetData);
    NormalizeEnemyColorWarningConfig(MOD_CONFIG, presetData);
    NormalizeAllyColorWarningConfig(MOD_CONFIG, presetData);
    NormalizeTopbarEnemyHpWarningConfig(MOD_CONFIG, presetData);
    NormalizeTopbarAllyHpWarningConfig(MOD_CONFIG, presetData);
    NormalizeShopItemNotificationsConfig(MOD_CONFIG, presetData);

    MOD_CONFIG.DRAG_ENABLED = preservedDragEnabled;
    MOD_CONFIG.PREVIEWS_ENABLED = preservedPreviewsEnabled;
    return true;
}

function IsBreadPresetName(presetName) {
    var name = String(presetName || "");
    return name === BREAD_PRESET_NAME || name === LEGACY_BREAD_PRESET_NAME;
}

function NormalizeBreadPresetName(presetName) {
    return IsBreadPresetName(presetName) ? BREAD_PRESET_NAME : String(presetName || "");
}

function ApplyPresetByName(presetName) {
    presetName = NormalizeBreadPresetName(presetName);
    var presetData = presetName === "Default" ? DEFAULT_CONFIG : PRESETS[presetName];
    var previousLanguage = GetSettingsLanguage();
    if (!ApplyPresetConfig(presetData)) return false;
    MOD_CONFIG.ACTIVE_PRESET_NAME = IsBreadPresetName(presetName) ? BREAD_PRESET_NAME : "";
    gLastAppliedPresetName = String(presetName || "");
    SetRuntimePresetName(presetName);
    SaveAndSync();
    RefreshSettingsLanguageUiAfterConfigChange(previousLanguage);
    return true;
}

var gPresetButtonRegistry = {};
var gPresetButtonOrder = [];
var gPresetHighlightPollToken = 0;
var gPresetHighlightPollRunning = false;
var gPresetHighlightRefreshToken = 0;
var gLastAppliedPresetName = "";
var PRESET_MATCH_EXCLUDED_KEYS = {
    DRAG_ENABLED: 1,
    PREVIEWS_ENABLED: 1,
    ACTIVE_PRESET_NAME: 1
};

function RefreshActivePresetConfigMarkerBeforeSave() {
    if (!MOD_CONFIG || !MOD_CONFIG.hasOwnProperty("ACTIVE_PRESET_NAME")) return;
    var activePresetName = String(MOD_CONFIG.ACTIVE_PRESET_NAME || "");
    if (!activePresetName) {
        if (DoesCurrentConfigMatchPreset(BREAD_PRESET_NAME)) MOD_CONFIG.ACTIVE_PRESET_NAME = BREAD_PRESET_NAME;
        return;
    }
    if (IsBreadPresetName(activePresetName) && DoesCurrentConfigMatchPreset(BREAD_PRESET_NAME)) {
        MOD_CONFIG.ACTIVE_PRESET_NAME = BREAD_PRESET_NAME;
        return;
    }
    MOD_CONFIG.ACTIVE_PRESET_NAME = "";
    if (MOD_CONFIG.hasOwnProperty("ENABLE_UNSPENT_SOULS")) MOD_CONFIG.ENABLE_UNSPENT_SOULS = 0;
}

function ResetPresetButtonRegistry() {
    gPresetButtonRegistry = {};
    gPresetButtonOrder = [];
}

function RegisterPresetButton(presetName, button, labelPanel, originalText) {
    if (!presetName || !button || !labelPanel) return;
    gPresetButtonRegistry[presetName] = {
        button: button,
        label: labelPanel,
        text: originalText || presetName
    };
    gPresetButtonOrder.push(presetName);
}

function SetExplicitActivePresetButton(button) {
    for (var i = 0; i < gPresetButtonOrder.length; i++) {
        var presetName = gPresetButtonOrder[i];
        var entry = gPresetButtonRegistry[presetName];
        if (!entry || !entry.button || !entry.button.IsValid || !entry.button.IsValid()) continue;
        entry.button.SetHasClass("PresetActive", entry.button === button);
    }
}

function ResolvePresetConfigByName(presetName) {
    if (!presetName) return null;
    presetName = NormalizeBreadPresetName(presetName);
    if (presetName !== "Default" && !PRESETS.hasOwnProperty(presetName)) return null;

    var resolved = {};
    for (var key in DEFAULT_CONFIG) {
        resolved[key] = DEFAULT_CONFIG[key];
    }
    if (presetName !== "Default") {
        var presetData = PRESETS[presetName];
        for (var presetKey in presetData) {
            resolved[presetKey] = presetData[presetKey];
        }
        NormalizeNeutralCampFlags(resolved, presetData);
        NormalizeItemCooldownModeConfig(resolved, presetData);
        NormalizeAmmoScaleConfig(resolved, presetData);
        NormalizeVoiceTypeConfig(resolved);
        NormalizeHealthbarTypeConfig(resolved, presetData);
        NormalizeColorWarningConfig(resolved, presetData);
        NormalizeEnemyColorWarningConfig(resolved, presetData);
        NormalizeAllyColorWarningConfig(resolved, presetData);
        NormalizeTopbarEnemyHpWarningConfig(resolved, presetData);
        NormalizeTopbarAllyHpWarningConfig(resolved, presetData);
        NormalizeShopItemNotificationsConfig(resolved, presetData);
    } else {
        NormalizeNeutralCampFlags(resolved, resolved);
        NormalizeItemCooldownModeConfig(resolved, resolved);
        NormalizeAmmoScaleConfig(resolved, resolved);
        NormalizeVoiceTypeConfig(resolved);
        NormalizeHealthbarTypeConfig(resolved, resolved);
        NormalizeColorWarningConfig(resolved, resolved);
        NormalizeEnemyColorWarningConfig(resolved, resolved);
        NormalizeAllyColorWarningConfig(resolved, resolved);
        NormalizeTopbarEnemyHpWarningConfig(resolved, resolved);
        NormalizeTopbarAllyHpWarningConfig(resolved, resolved);
        NormalizeShopItemNotificationsConfig(resolved, resolved);
    }
    return resolved;
}

function IsPresetValueMatch(currentValue, presetValue) {
    if (typeof currentValue === "number" && typeof presetValue === "number") {
        return Math.abs(currentValue - presetValue) <= 0.0001;
    }
    return currentValue === presetValue;
}

function DoesCurrentConfigMatchPreset(presetName) {
    var resolved = ResolvePresetConfigByName(presetName);
    if (!resolved) return false;

    for (var key in resolved) {
        if (PRESET_MATCH_EXCLUDED_KEYS[key]) continue;
        if (!MOD_CONFIG.hasOwnProperty(key)) continue;
        if (!IsPresetValueMatch(MOD_CONFIG[key], resolved[key])) {
            return false;
        }
    }
    return true;
}

function RefreshActivePresetHighlight() {
    var matchedPreset = null;
    if (gLastAppliedPresetName) {
        var lastAppliedEntry = gPresetButtonRegistry[gLastAppliedPresetName];
        if (
            lastAppliedEntry &&
            lastAppliedEntry.button &&
            lastAppliedEntry.button.IsValid &&
            lastAppliedEntry.button.IsValid() &&
            DoesCurrentConfigMatchPreset(gLastAppliedPresetName)
        ) {
            matchedPreset = gLastAppliedPresetName;
        } else {
            gLastAppliedPresetName = "";
        }
    }

    var runtimePreset = GetRuntimePresetName();
    if (matchedPreset === null && runtimePreset) {
        var runtimeEntry = gPresetButtonRegistry[runtimePreset];
        if (
            runtimeEntry &&
            runtimeEntry.button &&
            runtimeEntry.button.IsValid &&
            runtimeEntry.button.IsValid() &&
            DoesCurrentConfigMatchPreset(runtimePreset)
        ) {
            matchedPreset = runtimePreset;
        }
    }

    if (matchedPreset === null) {
        for (var i = 0; i < gPresetButtonOrder.length; i++) {
            var presetName = gPresetButtonOrder[i];
            var entry = gPresetButtonRegistry[presetName];
            if (!entry || !entry.button || !entry.button.IsValid || !entry.button.IsValid()) continue;
            if (DoesCurrentConfigMatchPreset(presetName)) {
                matchedPreset = presetName;
                break;
            }
        }
    }

    for (var j = 0; j < gPresetButtonOrder.length; j++) {
        var name = gPresetButtonOrder[j];
        var reg = gPresetButtonRegistry[name];
        if (!reg || !reg.button || !reg.button.IsValid || !reg.button.IsValid()) continue;
        reg.button.SetHasClass("PresetActive", name === matchedPreset);
    }
}

function IsSettingsWindowVisible() {
    var win = $.GetContextPanel().FindChildTraverse("SettingsWindow");
    return !!(win && win.IsValid && win.IsValid() && win.BHasClass && win.BHasClass("Visible"));
}

function ShouldRunPresetHighlightPolling() {
    return IsSettingsWindowVisible() && currentTab === "Presets" && !currentSearchQuery && gPresetButtonOrder.length > 0;
}

function StopPresetHighlightPolling() {
    gPresetHighlightPollToken += 1;
    gPresetHighlightPollRunning = false;
}

function StartPresetHighlightPolling() {
    if (gPresetHighlightPollRunning) return;
    gPresetHighlightPollRunning = true;
    var token = ++gPresetHighlightPollToken;
    var poll = function() {
        if (token !== gPresetHighlightPollToken) return;
        var panel = $.GetContextPanel();
        if (!panel || !panel.IsValid || !panel.IsValid()) {
            gPresetHighlightPollRunning = false;
            return;
        }
        if (!ShouldRunPresetHighlightPolling()) {
            gPresetHighlightPollRunning = false;
            return;
        }
        RefreshActivePresetHighlight();
        $.Schedule(1.0, poll);
    };
    $.Schedule(0.1, poll);
}

function UpdatePresetHighlightPollingState() {
    if (ShouldRunPresetHighlightPolling()) {
        StartPresetHighlightPolling();
    } else {
        StopPresetHighlightPolling();
    }
}

function QueueActivePresetHighlightRefresh(delaySec) {
    var delay = Number(delaySec);
    if (!isFinite(delay) || delay < 0) delay = 0.01;
    var token = ++gPresetHighlightRefreshToken;
    $.Schedule(delay, function() {
        if (token !== gPresetHighlightRefreshToken) return;
        if (currentTab === "Presets" && gPresetButtonOrder.length > 0) {
            RefreshActivePresetHighlight();
        }
        UpdatePresetHighlightPollingState();
    });
}

function ShowPresetApplySuccess(button, labelPanel, originalText) {
    if (!button || !labelPanel) return;
    var fallbackText = originalText || labelPanel.text || "";

    button.AddClass("PresetApplySuccess");
    SetExplicitActivePresetButton(button);
        labelPanel.text = LocalizeSettingsText("SUCCESS", true);
    QueueActivePresetHighlightRefresh(0.01);

    $.Schedule(0.6, function() {
        if (labelPanel && labelPanel.IsValid && labelPanel.IsValid()) {
            labelPanel.text = fallbackText;
        }
        if (button && button.IsValid && button.IsValid()) {
            button.RemoveClass("PresetApplySuccess");
        }
        QueueActivePresetHighlightRefresh(0.01);
    });
}

function CreatePresetGrid(parent, title, entries, columns, variant) {
    var titleLabel = $.CreatePanel("Label", parent, "");
    titleLabel.AddClass("SectionTitle");
    titleLabel.AddClass("MainSectionTitle");
    if (variant === "custom") {
        titleLabel.AddClass("MainSectionTitleCustom");
    }
    titleLabel.text = title;

    var grid = $.CreatePanel("Panel", parent, "");
    grid.AddClass("PresetCategoryGrid");
    if (variant === "custom") {
        grid.AddClass("PresetCategoryGridCustom");
    }

    var cols = columns || 7;
    var index = 0;
    while (index < entries.length) {
        var rowCount = Math.min(cols, entries.length - index);
        var row = $.CreatePanel("Panel", grid, "");
        row.AddClass("PresetGridRow");
        var rowInner = $.CreatePanel("Panel", row, "");
        rowInner.AddClass("PresetGridRowInner");

        for (var c = 0; c < rowCount; c++) {
            var entry = entries[index + c];
            var btn = $.CreatePanel("Button", rowInner, "");
            btn.AddClass("PresetGridBtn");
            if (entry && entry.label) {
                btn.AddClass("PresetGridBtn_" + String(entry.label || "").replace(/[^A-Za-z0-9_]/g, ""));
            }
            var entryVariant = (entry && entry.variant) ? String(entry.variant) : String(variant || "");
            if (entryVariant === "base") btn.AddClass("PresetGridBtnBase");
            else if (entryVariant === "great") btn.AddClass("PresetGridBtnGreat");
            else if (entryVariant === "custom") {
                btn.AddClass("PresetGridBtnCustom");
                if (entry.available !== false) {
                    btn.AddClass("PresetGridBtnCustomActive");
                }
            }

            var lbl = $.CreatePanel("Label", btn, "");
            lbl.text = entry.label;

            if (entry.available === false) {
                btn.AddClass("PresetGridBtnUnavailable");
                btn.SetPanelEvent("onactivate", function() {
                    OpenAvailableModal();
                });
            } else {
                if (entry.preset && !entry.action) {
                    RegisterPresetButton(entry.preset, btn, lbl, entry.label);
                }
                (function(button, labelPanel, originalLabel, presetName, actionName) {
                    button.SetPanelEvent("onactivate", function() {
                        var candidatePresetConfig = BuildPresetCandidateConfigByName(presetName);
                        if (!candidatePresetConfig) return;
                        var presetDiffRows = BuildConfigDiffRows(MOD_CONFIG, candidatePresetConfig);
                        OpenConfigDiffPreviewModal({
                            title: "Settings Changes",
                            summary: "Changes: " + String(presetDiffRows.length),
                            rows: presetDiffRows,
                            applyText: "Confirm",
                            cancelText: "Cancel",
                            onApply: function() {
                                var didApply = ApplyPresetByName(presetName);
                                if (!didApply) {
                        SetLocalizedConfigFeedbackMessage("Preset apply failed.", "error", 2200);
                                    return false;
                                }
                                ShowPresetApplySuccess(button, labelPanel, originalLabel);
                                return true;
                            }
                        });
                    });
                })(btn, lbl, entry.label, entry.preset, entry.action);
            }
        }

        var shouldAddDivider = false;
        for (var d = 0; d < rowCount; d++) {
            var dividerEntry = entries[index + d];
            if (dividerEntry && dividerEntry.dividerAfter === true) {
                shouldAddDivider = true;
                break;
            }
        }

        index += rowCount;

        if (shouldAddDivider && index < entries.length) {
            var dividerRow = $.CreatePanel("Panel", grid, "");
            dividerRow.AddClass("PresetGridDividerRow");
            var dividerLine = $.CreatePanel("Panel", dividerRow, "");
            dividerLine.AddClass("PresetGridDividerLine");
        }
    }
    return {
        titleLabel: titleLabel,
        grid: grid
    };
}

function CreateSupportThanksPlaques(parent, entries, columns) {
    if (!parent || !Array.isArray(entries) || entries.length === 0) return null;

    var grid = $.CreatePanel("Panel", parent, "SupportThanksPlaqueGrid");
    grid.AddClass("SupportThanksPlaqueGrid");

    var cols = Math.max(1, columns || 4);
    var index = 0;
    while (index < entries.length) {
        var rowEntries = [];
        while (index < entries.length && rowEntries.length < cols) {
            var candidate = entries[index];
            if (rowEntries.length > 0 && candidate && typeof candidate === "object" && candidate.breakBefore) break;
            rowEntries.push(candidate);
            index++;
        }
        if (rowEntries.length === 0) {
            rowEntries.push(entries[index]);
            index++;
        }
        var row = $.CreatePanel("Panel", grid, "");
        row.AddClass("SupportThanksPlaqueRow");
        var rowInner = $.CreatePanel("Panel", row, "");
        rowInner.AddClass("SupportThanksPlaqueRowInner");

        for (var c = 0; c < rowEntries.length; c++) {
            var entry = rowEntries[c];
            var entryData = (typeof entry === "object" && entry) ? entry : { label: entry };
            var plaque = $.CreatePanel(entryData.url ? "Button" : "Panel", rowInner, "");
            plaque.AddClass("PresetGridBtn");
            plaque.AddClass("PresetGridBtnBase");
            plaque.AddClass("SupportThanksPlaque");
            if (c % 2 === 1) plaque.AddClass("SupportThanksPlaqueAlt");
            if (entryData.role) plaque.AddClass("SupportThanksPlaqueRole_" + entryData.role);
            if (entryData.iconSrc) plaque.AddClass("SupportThanksPlaqueHasIcon");
            if (entryData.url) {
                plaque.AddClass("SupportThanksPlaqueClickable");
                try { plaque.SetPanelEvent("onactivate", (function (url) {
                    return function () {
                        try { $.DispatchEvent("ExternalBrowserGoToURL", url); } catch(eSupportPlaqueClick0) { WarnLog("settings", "op failed: " + (eSupportPlaqueClick0 && eSupportPlaqueClick0.message ? eSupportPlaqueClick0.message : String(eSupportPlaqueClick0 || ""))); }
                    };
                })(entryData.url)); } catch(eSupportPlaqueClick) { WarnLog("settings", "op failed: " + (eSupportPlaqueClick && eSupportPlaqueClick.message ? eSupportPlaqueClick.message : String(eSupportPlaqueClick || ""))); }
            }

            var plaqueContent = $.CreatePanel("Panel", plaque, "");
            plaqueContent.AddClass("SupportThanksPlaqueContent");

            if (entryData.iconSrc) {
                var icon = $.CreatePanel("Image", plaqueContent, "");
                icon.AddClass("SupportThanksPlaqueIcon");
                if (entryData.role) icon.AddClass("SupportThanksPlaqueIcon_" + entryData.role);
                try { icon.SetImage(entryData.iconSrc); } catch(eSupportPlaqueIcon) { WarnLog("settings", "op failed: " + (eSupportPlaqueIcon && eSupportPlaqueIcon.message ? eSupportPlaqueIcon.message : String(eSupportPlaqueIcon || ""))); }
            }

            var label = $.CreatePanel("Label", plaqueContent, "");
            label.text = entryData.label || "";
            if (entryData.role) label.AddClass("SupportThanksPlaqueLabel_" + entryData.role);
        }
    }

    return grid;
}

function CreateSupportThanksGroup(parent, title, entries, columns, roleClass) {
    if (!parent || !Array.isArray(entries) || entries.length === 0) return null;
    var group = $.CreatePanel("Panel", parent, "");
    group.AddClass("SupportThanksGroup");
    if (roleClass) group.AddClass(roleClass);

    var groupTitle = $.CreatePanel("Label", group, "");
    groupTitle.AddClass("SupportThanksGroupTitle");
    if (roleClass) groupTitle.AddClass(roleClass + "Title");
    groupTitle.text = LocalizeSettingsText(title || "", true);

    group.thanksGrid = CreateSupportThanksPlaques(group, entries, columns || 4);
    return group;
}

function NormalizeSearchText(value) {
    if (value === undefined || value === null) return "";
    return String(value).toLowerCase();
}

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

function GetActiveSearchCollectSection() {
    if (!gSearchCollectState) return null;
    if (!gSearchCollectState.currentSection) {
        var fallbackSection = {
            title: "",
            rows: []
        };
        gSearchCollectState.sections.push(fallbackSection);
        gSearchCollectState.currentSection = fallbackSection;
    }
    return gSearchCollectState.currentSection;
}

function BuildSearchAliasList(label, configId, description, extraLabels) {
    var aliases = [];
    var seen = {};
    var pushAlias = function(value) {
        var normalized = NormalizeSearchText(value).trim();
        if (!normalized || seen[normalized]) return;
        seen[normalized] = true;
        aliases.push(normalized);
    };

    pushAlias(label);
    pushAlias(configId);
    pushAlias(description);

    if (Array.isArray(extraLabels)) {
        for (var i = 0; i < extraLabels.length; i++) {
            pushAlias(extraLabels[i]);
        }
    }

    var configText = String(configId || "");
    if (configText) {
        var compactConfig = NormalizeSearchText(configText).replace(/[^a-z0-9]+/g, "");
        pushAlias(compactConfig);
        var configTokens = configText.split(/[^A-Za-z0-9]+/);
        var acronym = "";
        for (var t = 0; t < configTokens.length; t++) {
            var token = String(configTokens[t] || "");
            if (!token || token === "ENABLE" || token === "DISABLE" || token === "SHOW" || token === "HIDE" || token === "USE" || token === "MODE") continue;
            pushAlias(token);
            if (/^[A-Z0-9]+$/.test(token) && token.length >= 2) {
                pushAlias(token.toLowerCase());
            }
            acronym += token.charAt(0);
        }
        if (acronym.length >= 2) pushAlias(acronym);
    }

    return aliases;
}

function BuildSearchCollectedRow(label, configId, type, min, max, step, options, subInfo, extraLabels) {
    var activeSection = GetActiveSearchCollectSection();
    return {
        label: label || "",
        configId: configId || "",
        type: type || "",
        min: min,
        max: max,
        step: step,
        options: options,
        subInfo: subInfo || "",
        tabTitle: gSearchCollectState ? String(gSearchCollectState.tab || "") : "",
        sectionTitle: activeSection ? String(activeSection.title || "") : "",
        aliases: BuildSearchAliasList(label, configId, subInfo, extraLabels)
    };
}

function BuildSearchSectionIndexCacheKey() {
    var langKey = GetSettingsLanguageKey();
    return "lang=" + langKey;
}

function InvalidateSearchSectionIndexCache() {
    gSearchSectionIndexCacheKey = "";
    gSearchSectionIndexCache = null;
    gConfigDiffLabelCacheKey = "";
    gConfigDiffLabelMap = null;
}

function GetCachedSearchSectionIndex() {
    var cacheKey = BuildSearchSectionIndexCacheKey();
    if (gSearchSectionIndexCache && gSearchSectionIndexCacheKey === cacheKey) {
        return gSearchSectionIndexCache;
    }
    var freshIndex = BuildSearchSectionIndex();
    gSearchSectionIndexCache = freshIndex;
    gSearchSectionIndexCacheKey = cacheKey;
    return freshIndex;
}

function IsSearchRowMatch(row, q) {
    return NormalizeSearchText(row.label).indexOf(q) !== -1 ||
        NormalizeSearchText(row.subInfo).indexOf(q) !== -1 ||
        NormalizeSearchText(row.configId).indexOf(q) !== -1 ||
        NormalizeSearchText(row.sectionTitle).indexOf(q) !== -1 ||
        NormalizeSearchText(row.tabTitle).indexOf(q) !== -1 ||
        (Array.isArray(row.aliases) && row.aliases.join(" ").indexOf(q) !== -1);
}

function BuildSearchSectionIndex() {
    var originalTab = currentTab;
    var index = [];
    try {
        var searchTabs = GetSettingsTabOrder();
        for (var i = 0; i < searchTabs.length; i++) {
            var tab = searchTabs[i];
            var tabLabel = LocalizeSettingsText(tab, true);
            var state = {
                tab: tabLabel,
                sections: [],
                currentSection: null
            };

            gSearchCollectMode = true;
            gSearchCollectState = state;
            currentTab = tab;
            try {
                RenderCurrentTabContent(null);
            } finally {
                gSearchCollectMode = false;
                gSearchCollectState = null;
            }

            var nonEmptySections = [];
            for (var s = 0; s < state.sections.length; s++) {
                if (state.sections[s].rows && state.sections[s].rows.length > 0) {
                    nonEmptySections.push(state.sections[s]);
                }
            }
            index.push({
                tab: tabLabel,
                sections: nonEmptySections
            });
        }
        return index;
    } finally {
        currentTab = originalTab;
        gSearchCollectMode = false;
        gSearchCollectState = null;
    }
}

function AnimateSearchResultPanel(panel, order) {
    if (!panel || !panel.IsValid()) return;
    panel.AddClass("SearchAnimatedItem");
    // Keep search results visible immediately while query is active.
    if (String(currentSearchQuery || "").trim().length > 0) {
        panel.AddClass("SearchAnimatedItemVisible");
        return;
    }
    var delay = 0.005 + (Math.min(order, 24) * 0.012);
    $.Schedule(delay, function() {
        if (panel.IsValid()) {
            panel.AddClass("SearchAnimatedItemVisible");
        }
    });
}

function RenderSearchResults(list, query) {
    var q = NormalizeSearchText(query).trim();
    if (q.length === 0) return false;

    var tabIndex = GetCachedSearchSectionIndex();
    var matchedTabs = [];

    for (var t = 0; t < tabIndex.length; t++) {
        var tabEntry = tabIndex[t];
        var includeWholeTab = NormalizeSearchText(tabEntry.tab).indexOf(q) !== -1;
        var matchedSections = [];

        for (var s = 0; s < tabEntry.sections.length; s++) {
            var section = tabEntry.sections[s];
            var sectionTitleMatch = NormalizeSearchText(section.title).indexOf(q) !== -1;
            var matchedRows = [];
            for (var r = 0; r < section.rows.length; r++) {
                if (IsSearchRowMatch(section.rows[r], q)) {
                    matchedRows.push(section.rows[r]);
                }
            }
            if (includeWholeTab || sectionTitleMatch) {
                matchedSections.push({
                    title: section.title,
                    rows: section.rows
                });
            } else if (matchedRows.length > 0) {
                matchedSections.push({
                    title: section.title,
                    rows: matchedRows
                });
            }
        }

        if (matchedSections.length > 0) {
            matchedTabs.push({
                tab: tabEntry.tab,
                sections: matchedSections
            });
        }
    }

    var animOrder = 0;

    var title = $.CreatePanel("Label", list, "");
    title.AddClass("GroupHeader");
    title.text = LocalizeSettingsText("Search Results", true);
    AnimateSearchResultPanel(title, animOrder++);

    if (matchedTabs.length === 0) {
        var noResults = $.CreatePanel("Label", list, "");
        noResults.AddClass("SearchEmptyLabel");
        noResults.text = LocalizeSettingsText("No results found", true);
        AnimateSearchResultPanel(noResults, animOrder++);
        return true;
    }

    for (var mt = 0; mt < matchedTabs.length; mt++) {
        var tabLabel = $.CreatePanel("Label", list, "");
        tabLabel.AddClass("SearchSectionLabel");
        tabLabel.text = matchedTabs[mt].tab;
        AnimateSearchResultPanel(tabLabel, animOrder++);

        for (var ms = 0; ms < matchedTabs[mt].sections.length; ms++) {
            var sectionEntry = matchedTabs[mt].sections[ms];
            if (sectionEntry.title && sectionEntry.title.length > 0) {
                var sectionTitlePanel = CreateSectionTitle(list, sectionEntry.title);
                AnimateSearchResultPanel(sectionTitlePanel, animOrder++);
            }
            for (var mr = 0; mr < sectionEntry.rows.length; mr++) {
                var row = sectionEntry.rows[mr];
                var rowPanel = null;
                gSearchResultRenderMode = true;
                try {
                    rowPanel = CreateRow(list, row.label, row.configId, row.type, row.min, row.max, row.step, row.options, row.subInfo);
                } finally {
                    gSearchResultRenderMode = false;
                }
                AnimateSearchResultPanel(rowPanel, animOrder++);
            }
            if (ms < matchedTabs[mt].sections.length - 1) {
                var sectionSep = CreateSeparator(list);
                AnimateSearchResultPanel(sectionSep, animOrder++);
            }
        }
        if (mt < matchedTabs.length - 1) {
            var tabSep = CreateSeparator(list);
            AnimateSearchResultPanel(tabSep, animOrder++);
        }
    }
    return true;
}

function RenderCurrentTabContent(list) {
    gCurrentSettingsSectionTitle = "";
    if (!gSearchCollectMode && currentTab !== "Presets") {
        ResetPresetButtonRegistry();
    }
    if (currentTab === "Presets") {
        var isRuSettings = IsRussianSettingsLanguage();
        var playerPresetsTitle = isRuSettings ? "\u041F\u0440\u0435\u0441\u0435\u0442\u044B \u0438\u0433\u0440\u043E\u043A\u043E\u0432" : "Player Presets";
        var presetsTitle = isRuSettings ? "\u041F\u0440\u0435\u0441\u0435\u0442\u044B" : "Presets";
        var requestPresetText = "Request a Community Preset";

        var basePresetEntries = [
            { label: "Default", preset: "Default", variant: "base" },
            { label: "16:10", preset: "16:10", variant: "base" },
            { label: "4:3", preset: "4:3", variant: "base" },
            { label: "Clean", preset: "Clean", variant: "base" },
            { label: "Enhanced", preset: "Enhanced", variant: "base" },
            { label: "Maximum", preset: "Maximum", variant: "base", dividerAfter: true }
        ];
        var playerPresetEntries = [];
        var customEntries = basePresetEntries.concat(BuildCommunityPresetEntries());

        if (gSearchCollectMode && gSearchCollectState) {
            var addPresetSearchRows = function(sectionTitle, entries, sectionSubInfo) {
                CreateSectionTitle(list, sectionTitle);
                for (var pi = 0; pi < entries.length; pi++) {
                    var entry = entries[pi];
                    if (!entry || entry.available === false) continue;
                    var configId = "SEARCH_TAB:Presets";
                    var buttonLabel = "Open";
                    var subInfo = sectionSubInfo;

                    if (entry && entry.preset) {
                        configId = "SEARCH_PRESET:" + entry.preset;
                        buttonLabel = "Apply";
                    }

                    CreateRow(list, entry.label, configId, "actionbutton", null, null, null, [
                        { label: buttonLabel }
                    ], subInfo);
                }
            };

            if (playerPresetEntries.length > 0) {
                CreateSeparator(list);
                addPresetSearchRows(playerPresetsTitle, playerPresetEntries, "Player preset");
            }
            addPresetSearchRows(presetsTitle, customEntries, "Preset");
            CreateRow(list, requestPresetText, "OPEN_COMMISSIONS", "actionbutton", null, null, null, [
                { label: "Open" }
            ], "Request a community preset");
            return;
        }

        ResetPresetButtonRegistry();
        if (playerPresetEntries.length > 0) {
            CreateSeparator(list);
            CreatePresetGrid(list, playerPresetsTitle, playerPresetEntries, 6, "great");
        }
        CreatePresetGrid(list, presetsTitle, customEntries, 6, "custom");

        var communityHintRow = $.CreatePanel("Panel", list, "CommunityPresetHintRow");
        communityHintRow.AddClass("CommunityPresetHintRow");
        var communityHintInner = $.CreatePanel("Panel", communityHintRow, "CommunityPresetHintInner");
        communityHintInner.AddClass("CommunityPresetHintInner");
        var communityHintLink = $.CreatePanel("Button", communityHintInner, "CommunityPresetHintLink");
        communityHintLink.AddClass("CommunityPresetHintLink");
        var communityHintIcon = $.CreatePanel("Image", communityHintLink, "CommunityPresetHintIcon", {
            src: "s2r://panorama/images/icons/icon_feedback.vsvg"
        });
        communityHintIcon.AddClass("CommunityPresetHintIcon");
        var communityHintLinkLabel = $.CreatePanel("Label", communityHintLink, "CommunityPresetHintLinkLabel");
        communityHintLinkLabel.text = requestPresetText;
        communityHintLink.SetPanelEvent("onactivate", function() {
            $.DispatchEvent("ExternalBrowserGoToURL", "https://ko-fi.com/civocivocivo/commissions");
        });
        RefreshActivePresetHighlight();
    } else if (currentTab === "Crosshair") {
        CreateAnimatedInlineToggleSection(list, "Item Cooldowns", "ENABLE_PASSIVE_COOLDOWN", "Tracked cooldowns near crosshair", function(sectionParent) {
            var advancedModeEnabled = IsAdvancedItemCooldownModeEnabled();
            if (gSearchCollectMode) {
                CreateRow(sectionParent, "Advanced", "ENABLE_OLD_ITEM_COOLDOWNS", "toggle", null, null, null, [{ invert: true }], "Switch to the advanced item cooldown mode with in-menu filters.");
            }
            if (advancedModeEnabled) {
                CreateRow(sectionParent, "Advanced Filter", null, "multitoggle", null, null, null, [
                    { key: "ITEM_FILTER_DEF_PASSIVE", label: "Defensive Passive" },
                    { key: "ITEM_FILTER_OFF_PASSIVE", label: "Offensive Passive" },
                    { key: "ITEM_FILTER_DEF_ACTIVE", label: "Defensive Active" },
                    { key: "ITEM_FILTER_OFF_ACTIVE", label: "Offensive Active" }
                ], null);
            } else {
                CreateRow(sectionParent, "Filters", "OPEN_OLD_ITEM_FILTERS_DOWNLOAD", "actionbutton", null, null, null, [
                    { label: "Get Filter" }
                ], "Get Filter File Only");
            }
            CreateSliderRow(sectionParent, "Size", "PASSIVE_COOLDOWN_SIZE", "size_30_60");
            CreateSliderRow(sectionParent, "Opacity", "PASSIVE_COOLDOWN_OPACITY", "opacity");
            CreateSliderRow(sectionParent, "Horizontal Offset", "PASSIVE_COOLDOWN_X", "offset_n50_50");
            CreateSliderRow(sectionParent, "Vertical Offset", "PASSIVE_COOLDOWN_Y", "offset_n50_50");
        }, null, {
            titleCheckbox: {
                label: "Advanced",
                configId: "ENABLE_OLD_ITEM_COOLDOWNS",
                invert: true,
                refreshListOnChange: true,
                description: "Switch to the advanced item cooldown mode with in-menu filters."
            }
        });
        CreateSeparator(list);
        CreateAnimatedInlineToggleSection(list, "Active Stats", "ENABLE_CROSSHAIR_STATS", "Show active buffs/debuffs (firerate, slow, antiheal...) vertically next to the crosshair", function(sectionParent) {
            CreateRow(sectionParent, "Show Debuffs", "CROSSHAIR_STATS_SHOW_DEBUFFS", "toggle", null, null, null, null);
            CreateRow(sectionParent, "Show Buffs", "CROSSHAIR_STATS_SHOW_BUFFS", "toggle", null, null, null, null);
            CreateSliderRow(sectionParent, "Scale", "CROSSHAIR_STATS_SCALE", "size_50_200");
            CreateSliderRow(sectionParent, "Opacity", "CROSSHAIR_STATS_OPACITY", "opacity");
            CreateSliderRow(sectionParent, "Horizontal Offset", "CROSSHAIR_STATS_X_OFFSET", "offset_n500_500");
            CreateSliderRow(sectionParent, "Vertical Offset", "CROSSHAIR_STATS_Y_OFFSET", "offset_n500_500");
            // Per-stat visibility — collapsed by default so it's out of the way for users who
            // don't care; all stats are shown unless turned off here.
            CreateCollapsibleSubSection(sectionParent, "Visible Stats", function(statsParent) {
                CreateRow(statsParent, "Fire Rate", "CROSSHAIR_STATS_SHOW_FIRERATE", "toggle", null, null, null, null);
                CreateRow(statsParent, "Move Speed", "CROSSHAIR_STATS_SHOW_MOVESPEED", "toggle", null, null, null, null);
                CreateRow(statsParent, "Healing Amp", "CROSSHAIR_STATS_SHOW_HEALAMP", "toggle", null, null, null, null);
                CreateRow(statsParent, "Bullet Resist", "CROSSHAIR_STATS_SHOW_BULLETRESIST", "toggle", null, null, null, null);
                CreateRow(statsParent, "Spirit Resist", "CROSSHAIR_STATS_SHOW_TECHRESIST", "toggle", null, null, null, null);
                CreateRow(statsParent, "Bullet Lifesteal", "CROSSHAIR_STATS_SHOW_BULLETLIFESTEAL", "toggle", null, null, null, null);
                CreateRow(statsParent, "Spirit Lifesteal", "CROSSHAIR_STATS_SHOW_TECHLIFESTEAL", "toggle", null, null, null, null);
                CreateRow(statsParent, "Weapon Power", "CROSSHAIR_STATS_SHOW_WEAPONPOWER", "toggle", null, null, null, null);
                CreateRow(statsParent, "Spirit Power", "CROSSHAIR_STATS_SHOW_SPIRIT", "toggle", null, null, null, null);
                CreateRow(statsParent, "Ability Range", "CROSSHAIR_STATS_SHOW_RANGE", "toggle", null, null, null, null);
                CreateRow(statsParent, "Ability Duration", "CROSSHAIR_STATS_SHOW_DURATION", "toggle", null, null, null, null);
                CreateRow(statsParent, "Damage Amp", "CROSSHAIR_STATS_SHOW_DAMAGEAMP", "toggle", null, null, null, null);
                CreateRow(statsParent, "Clip Size", "CROSSHAIR_STATS_SHOW_CLIPSIZE", "toggle", null, null, null, null);
                CreateRow(statsParent, "Health Regen", "CROSSHAIR_STATS_SHOW_REGEN", "toggle", null, null, null, null);
                CreateRow(statsParent, "Bullet Evasion", "CROSSHAIR_STATS_SHOW_BULLETEVASION", "toggle", null, null, null, null);
            });
        });
        CreateSeparator(list);
        CreateAnimatedInlineToggleSection(list, "Damage Impact", "ENABLE_DAMAGE_IMPACT", "The popups that appear when getting a kill or CCing an enemy or healing an ally", function(sectionParent) {
            CreateSliderRow(sectionParent, "Scale", "DAMAGE_IMPACT_SCALE", "scale_0_5_2_0");
            CreateSliderRow(sectionParent, "Opacity", "DAMAGE_IMPACT_OPACITY", "opacity");
            CreateSliderRow(sectionParent, "Horizontal Offset", "DAMAGE_IMPACT_X_OFFSET", "offset_n1000_1000");
            CreateSliderRow(sectionParent, "Vertical Offset", "DAMAGE_IMPACT_Y_OFFSET", "offset_n1000_1000");
        });
        CreateSeparator(list);
        CreateSectionTitle(list, "Stamina");
        CreateSliderRow(list, "Rotate", "STAMINA_CHARGE_ANGLE", "angle_0_360", "Rotate the stamina charge indicator.", true);
        CreateRow(list, "Color", "STAMINA_CHARGE_COLOR", "palette", null, null, null, QOL_COLOR_PALETTE_OPTIONS, "Choose a preset border color for stamina charge indicators.");
        CreateSeparator(list);
        CreateSectionTitle(list, "Damage Numbers");
        CreateRow(list, "Big Numbers", "ENABLE_CUMULATIVE_DMG", "toggle", null, null, null, null);
        CreateRow(list, "Small Numbers", "ENABLE_HIDE_SMALL_NUMBERS", "toggle", null, null, null, [{ invert: true }]);
        CreateRow(list, "Trooper Damage", "ENABLE_HIDE_TROOPER_DAMAGE", "toggle", null, null, null, [{ invert: true }]);
        CreateRow(list, "Clean Indicators", "ENABLE_CLEAN_DAMAGE_INDICATORS", "toggle", null, null, null, null, "Modify damage numbers for a cleaner style and animation to be more out of the way");
        CreateRow(list, "Damage Fountain", "ENABLE_DAMAGE_FOUNTAIN", "toggle", null, null, null, null, "Fountain-style damage number animation.");
        CreateSliderRow(list, "Size", "HUD_INDICATOR_SIZE", "size_10_60", "Default 18");
        CreateSliderRow(list, "Opacity", "DAMAGE_NUMBER_OPACITY", "opacity");
        CreateSeparator(list);
        CreateSectionTitle(list, "Ammo");
        CreateRow(list, "Visual", "ENABLE_AMMO_STATUS", "toggle", null, null, null, null);
        CreateRow(list, "Current", "ENABLE_HIDE_AMMO_ALL", "toggle", null, null, null, [{ invert: true }]);
        CreateSliderRow(list, "Current Size", "AMMO_CURRENT_SCALE", "size_100_300");
        CreateRow(list, "Total", "ENABLE_HIDE_MAGAZINE", "toggle", null, null, null, [{ invert: true }]);
        CreateSliderRow(list, "Total Size", "AMMO_TOTAL_SCALE", "size_100_300");
        CreateSliderRow(list, "Horizontal Offset", "AMMO_PANEL_X_OFFSET", "offset_n200_200");
        CreateSliderRow(list, "Vertical Offset", "AMMO_PANEL_Y_OFFSET", "offset_n200_200");
        CreateSliderRow(list, "Rotate Magazine", "AMMO_CLIP_ANGLE", "angle_0_360", "Rotate the ammo magazine visualiser.", true);
        CreateRow(list, "Color", "AMMO_TEXT_COLOR", "palette", null, null, null, QOL_COLOR_PALETTE_OPTIONS, "Choose a preset text color for the ammo display.");
        CreateSeparator(list);
        CreateAnimatedInlineToggleSection(list, "Reload Cooldown", "ENABLE_RELOAD_COOLDOWN", "Estimated Active Reload Timer", function(sectionParent) {
            CreateSliderRow(sectionParent, "Size", "RELOAD_COOLDOWN_SIZE", "size_16_60");
            CreateSliderRow(sectionParent, "Opacity", "RELOAD_COOLDOWN_OPACITY", "opacity");
            CreateSliderRow(sectionParent, "Horizontal Offset", "RELOAD_COOLDOWN_X_OFFSET", "offset_n75_75");
            CreateSliderRow(sectionParent, "Vertical Offset", "RELOAD_COOLDOWN_Y_OFFSET", "offset_n75_75");
        });
        CreateSeparator(list);
        CreateSectionTitle(list, "Reloading");
        CreateRow(list, "Icon", "ENABLE_HIDE_RELOAD_ICON", "toggle", null, null, null, [{ invert: true }]);
        CreateRow(list, "Circle", "ENABLE_HIDE_RELOAD_CIRCLE", "toggle", null, null, null, [{ invert: true }]);
        CreateSeparator(list);
        CreateSectionTitle(list, "Item Target Reticle");
        CreateRow(list, "Highlight Mode", "ENABLE_RED_DIAMOND", "toggle", null, null, null, null);
        CreateRow(list, "Improved Hint", "ENABLE_IMPROVED_HINT", "toggle", null, null, null, null);
        CreateSliderRow(list, "Size", "UNIT_TARGET_SIZE", "size_50_300_s5");
        CreateSliderRow(list, "Opacity", "UNIT_TARGET_OPACITY", "opacity");
        CreateSliderRow(list, "Hint Size", "UNIT_TARGET_HINT_SIZE", "size_50_200_s5");
    } else if (currentTab === "HUD") {
        CreateAnimatedInlineToggleSection(list, "Top Bar", "HUD_TOP_BAR_ENABLED", "", function(sectionParent) {
            CreateRow(sectionParent, "Objective Map", "ENABLE_OBJ_MAP", "toggle", null, null, null, null, "");
            CreateRow(sectionParent, "Mid Boss Timer", "ENABLE_REJUV_HUD", "toggle", null, null, null, null, "");
            CreateRow(sectionParent, "Bridge Buff Timer", "ENABLE_BUFF_HUD", "toggle", null, null, null, null, "");
            CreateRow(sectionParent, "Urn Difference", "ENABLE_URN_DIFF", "toggle", null, null, null, null, "");
            CreateRow(sectionParent, "Rift Timer", "ENABLE_URN_TIMER", "toggle", null, null, null, null, "");
            CreateRow(sectionParent, "Missing Hero Opaque", "ENABLE_MISSING_HERO", "toggle", null, null, null, null, "");
            CreateRow(sectionParent, "Nicknames", "ENABLE_NICKNAMES", "toggle", null, null, null, null, "");
            CreateRow(sectionParent, "Objective Damage", "ENABLE_OBJ_DMG", "toggle", null, null, null, null, "");
            CreateRow(sectionParent, "Top Bar Background", "DISABLE_PLAYER_NAME_BLUR", "toggle", null, null, null, [{ invert: true }], "");
            CreateInlineSecondaryCheckboxToggleRow(sectionParent, "Show Player Ranks", "SHOW_RANK", "Top Bar", "SHOW_RANK_TOPBAR", "Show rank prediction badges on top bar and escape menu player list.", "Show rank prediction badges on top bar player panels (requires Show Player Ranks).");
            CreateRow(sectionParent, "Enemy HP Warning", "ENABLE_TOPBAR_ENEMY_HP_WARNING", "multitoggle", null, null, null, TOPBAR_ENEMY_HP_WARNING_THRESHOLD_OPTIONS, "Enemy HP Warning");
            CreateRow(sectionParent, "Ally HP Warning", "ENABLE_TOPBAR_ALLY_HP_WARNING", "multitoggle", null, null, null, TOPBAR_ALLY_HP_WARNING_THRESHOLD_OPTIONS, "Ally HP Warning");
            CreateSliderRow(sectionParent, "Opacity", "TOP_BAR_OPACITY", "opacity");
            CreateSliderRow(sectionParent, "Scale", "TOP_BAR_SCALE", "scale_0_5_1_5");
            CreateSliderRow(sectionParent, "Horizontal Offset", "TOP_BAR_X_OFFSET", "offset_n1500_1500");
            CreateSliderRow(sectionParent, "Vertical Offset", "TOP_BAR_Y_OFFSET", "offset_n500_500");
        });
        CreateSeparator(list);
        CreateAnimatedInlineToggleSection(list, "Bottom Bar", "HUD_BOTTOM_BAR_ENABLED", "", function(sectionParent) {
            CreateRow(sectionParent, "Failed Hint", "ENABLE_HIDE_FAILED_HINT", "toggle", null, null, null, [{ invert: true }], "Low Stamina Popup");
            CreateRow(sectionParent, "Ability Suggestion", "ENABLE_HIDE_ABILITY_SUGGESTION", "toggle", null, null, null, [{ invert: true }], "On Ability Upgrade");
            CreateRow(sectionParent, "Cosmetic Ability", "ENABLE_HIDE_COSMETIC_ABILITY", "toggle", null, null, null, [{ invert: true }], "Snowball or Poster");
            // Hidden from UI by request; remains configurable via defaults/presets/import.
            CreateRow(sectionParent, "Minimalist Abilities", "ENABLE_SIMPLIFY_ABILITY_ICONS", "toggle", null, null, null, null);
            CreateRow(sectionParent, "Clean Stacks", "ENABLE_CLEAN_STACKS", "toggle", null, null, null, null, "Move ability stacks to bottom-center of ability icon");
            CreateSliderRow(sectionParent, "Opacity", "BOTTOM_BAR_OPACITY", "opacity");
            CreateSliderRow(sectionParent, "Scale", "BOTTOM_BAR_SCALE", "scale_0_5_1_5");
            CreateSliderRow(sectionParent, "Horizontal Offset", "BOTTOM_BAR_X_OFFSET", "offset_n1500_1500");
            CreateSliderRow(sectionParent, "Vertical Offset", "BOTTOM_BAR_Y_OFFSET", "offset_n500_500");
            CreateRow(sectionParent, "Color", "BOTTOM_BAR_WASH_COLOR", "palette", null, null, null, QOL_COLOR_PALETTE_OPTIONS, "Choose a preset color wash for the bottom ability bar.");
        });
        CreateSeparator(list);
        CreateAnimatedInlineToggleSection(list, "Items", "HUD_ITEMS_ENABLED", "", function(sectionParent) {
            CreateRow(sectionParent, "Minimalist Item Bar", "ENABLE_SIMPLIFY_ITEMS", "toggle", null, null, null, null);
            CreateSliderRow(sectionParent, "Opacity", "ITEMS_OPACITY", "opacity");
            CreateSliderRow(sectionParent, "Horizontal Offset", "ITEMS_X_OFFSET", "offset_n1500_1500");
            CreateSliderRow(sectionParent, "Vertical Offset", "ITEMS_Y_OFFSET", "offset_n500_500");
            CreateRow(sectionParent, "Color", "ITEMS_WASH_COLOR", "palette", null, null, null, QOL_COLOR_PALETTE_OPTIONS, "Choose a preset color wash for the item bar.");
        });
        CreateSeparator(list);
        CreateAnimatedInlineToggleSection(list, "Souls", "HUD_SOULS_ENABLED", "", function(sectionParent) {
            CreateSliderRow(sectionParent, "Opacity", "SOULS_OPACITY", "opacity");
            CreateSliderRow(sectionParent, "Horizontal Offset", "SOULS_X_OFFSET", "offset_n1500_1500");
            CreateSliderRow(sectionParent, "Vertical Offset", "SOULS_Y_OFFSET", "offset_n500_500");
        });
        CreateSeparator(list);
        CreateAnimatedInlineToggleSection(list, "Shop", "HUD_SHOP_ENABLED", "", function(sectionParent) {
            CreateInlineSecondaryCheckboxToggleRow(
                sectionParent,
                "Stats",
                "ENABLE_SHOP_STATS",
                "Minimalist",
                "ENABLE_SIMPLIFY_SHOP_STATS",
                "",
                "Only simplifies the shop stats display."
            );
            CreateRow(sectionParent, "Hero", "ENABLE_HERO_SCENE_PANEL", "toggle", null, null, null, null);
            CreateRow(sectionParent, "Minimalist", "ENABLE_SIMPLIFY_SHOP", "toggle", null, null, null, null);
            CreateRow(sectionParent, "Blur", "DISABLE_SHOP_BLUE", "toggle", null, null, null, [{ invert: true }]);
            CreateInlineSecondaryCheckboxToggleRow(
                sectionParent,
                "Quick Buy",
                "DISABLE_QUICK_BUY",
                "Enhanced",
                "ENABLE_ENHANCED_QUICKBUY",
                null,
                "Replaces quickbuy with the Enhanced Quickbuy standalone layout and queue summaries.",
                { invert: true }
            );
            CreateSliderRow(sectionParent, "Enhanced Count", "ENHANCED_QUICKBUY_COUNT", "count_1_5", "Controls how many enhanced quickbuy preview items are shown.");
            CreateRow(sectionParent, "Click to Notify", "ENABLE_QUICKBUY_CLICK_TO_NOTIFY", "toggle", null, null, null, null);
            CreateSliderRow(sectionParent, "Horizontal Offset", "SHOP_OFFSET_X", "offset_n500_500");
            CreateSliderRow(sectionParent, "Vertical Offset", "SHOP_OFFSET_Y", "offset_n500_500");
            CreateSliderRow(sectionParent, "Opacity", "SHOP_OPACITY", "opacity");
            CreateSliderRow(sectionParent, "Scale", "SHOP_SCALE", "scale_0_5_1_5");
            CreateSeparator(sectionParent);
            CreateAnimatedInlineToggleSection(sectionParent, "Recent Purchases", "ENABLE_SHOP_RECENT_PURCHASES", "See the recent purchases made in the game.", function(recentPurchasesParent) {
                CreateSliderRow(recentPurchasesParent, "Horizontal Offset", "RECENT_PURCHASES_PANEL_X_OFFSET", "offset_n1000_1000");
                CreateSliderRow(recentPurchasesParent, "Vertical Offset", "RECENT_PURCHASES_PANEL_Y_OFFSET", "offset_n500_500");
                CreateSliderRow(recentPurchasesParent, "Opacity", "RECENT_PURCHASES_PANEL_OPACITY", "opacity");
                CreateSliderRow(recentPurchasesParent, "Scale", "RECENT_PURCHASES_PANEL_SCALE", "scale_0_5_2_0");
            });
            CreateSeparator(sectionParent);
            CreateAnimatedInlineToggleSection(sectionParent, "Item Buy Notifications", "ENABLE_SHOP_ITEM_NOTIFICATIONS", "Shows item buy notifications from recent purchases.", function(notificationsParent) {
                CreateRow(notificationsParent, "Reposition", null, "multitoggle", null, null, null, RECENT_PURCHASE_REPOSITION_OPTIONS, "Move notifications around Rejuvenator and Scoreboard UI.");
                CreateRow(notificationsParent, "Per-Hero Popups", "ENABLE_HERO_PURCHASE_POPUPS", "toggle", null, null, null, null,
                    "Show purchase notifications under each hero's portrait instead of in the center.");
                CreateSliderRow(notificationsParent, "Max Notifications", "RECENT_PURCHASES_QUICK_MAX", "count_1_5");
                CreateSliderRow(notificationsParent, "Duration", "RECENT_PURCHASES_QUICK_DISPLAY_SEC", "sec_3_15", "Seconds each notification stays visible.");
                CreateSliderRow(notificationsParent, "Horizontal Offset", "RECENT_PURCHASES_QUICK_X_OFFSET", "offset_n500_500");
                CreateSliderRow(notificationsParent, "Vertical Offset", "RECENT_PURCHASES_QUICK_Y_OFFSET", "offset_n500_500");
                CreateSliderRow(notificationsParent, "Opacity", "RECENT_PURCHASES_QUICK_OPACITY", "opacity");
                CreateSliderRow(notificationsParent, "Scale", "RECENT_PURCHASES_QUICK_SCALE", "scale_0_5_1_5");
            });
        });
    } else if (currentTab === "Healthbar") {
        gEnumSectionSyncCallbacks = [];
        CreateSectionTitle(list, "Player");
        CreateRow(list, "Combat Indicator", "ENABLE_COMBAT_INDICATOR", "toggle", null, null, null, null);
        CreateRow(list, "Color Warning", "ENABLE_COLORED_HEALTHBAR", "multitoggle", null, null, null, COLOR_WARNING_THRESHOLD_OPTIONS, "HP Warning");
        CreateRow(list, "Type", "HEALTHBAR_TYPE", "dropdown", null, null, null, HEALTHBAR_TYPE_DROPDOWN_OPTIONS);
        CreateAnimatedInlineEnumSection(list, "Healthbar Options", "HEALTHBAR_TYPE", 5, function(sectionParent) {
            CreateRow(sectionParent, "Health Numbers", "ENABLE_MINECRAFT_HEALTH_NUMBERS", "toggle", null, null, null, null, "");
        });
        CreateSliderRow(list, "Size", "PLAYER_HEALTHBAR_SCALE", "size_50_200", "");
        CreateSliderRow(list, "Opacity", "PLAYER_HEALTHBAR_OPACITY", "opacity", "");
        CreateSliderRow(list, "Horizontal Offset", "PLAYER_HEALTHBAR_X_OFFSET", "offset_n1000_1000", "");
        CreateSliderRow(list, "Vertical Offset", "PLAYER_HEALTHBAR_Y_OFFSET", "offset_n1000_1000", "");
        CreateRow(list, "Accent Color", "PLAYER_HEALTHBAR_ACCENT_COLOR", "palette", null, null, null, QOL_COLOR_PALETTE_OPTIONS, "Choose a preset accent color for the player healthbar frame.");
    } else if (currentTab === "UI") {
        CreateSectionTitle(list, "UI Controls");
        CreateRow(list, "16:10 Support", "SUPPORT_16_10", "toggle", null, null, null, null, "Hud Shift");
        CreateRow(list, "4:3 Support", "SUPPORT_4_3", "toggle", null, null, null, null, "Hud Shift");
        CreateRow(list, "21:9 Stream Fix", "ENABLE_HUD_SHIFT", "toggle", null, null, null, null, "Hud Shift");
        CreateRow(list, "Lane with Party", "ENABLE_LANE_WITH_PARTY", "toggle", null, null, null, null, "Automatically selects 'With Party' in lane preference. Requires the party screen to be open.");
        CreateRow(list, "Centered ESC Menu", "ENABLE_CENTER_ESC", "toggle", null, null, null, null, "Easier Access");
        CreateRow(list, "Centered Friends List", "ENABLE_CENTER_FRIENDS_LIST", "toggle", null, null, null, null, "");
        CreateRow(list, "Legacy Durations", "ENABLE_LEGACY_COOLDOWNS", "toggle", null, null, null, null, "");
        CreateRow(list, "Show Testing Tools", "ENABLE_FORCE_TESTING_TOOLS", "toggle", null, null, null, null, "Always Shown");
        CreateRow(list, "Hide Testing Tools", "ENABLE_HIDE_TESTING_TOOLS", "toggle", null, null, null, null, "Always Hidden");
        CreateRow(list, "Behavior Summary", "ENABLE_HIDE_BEHAVIOR_SUMMARY", "toggle", null, null, null, [{ invert: true }], "Metro Button");
        CreateSeparator(list);
        CreateAnimatedInlineToggleSection(list, "Show Build ID", "ENABLE_SHOW_BUILD_ID", "Shows your build information always for content creators", function(sectionParent) {
            CreateRow(sectionParent, "Show Title", "ENABLE_SHOW_BUILD_ID_TITLE", "toggle", null, null, null, null, "");
        });
        CreateSeparator(list);
        CreateAnimatedInlineToggleSection(list, "Minimalistic Pause", "ENABLE_MINIMALISTIC_PAUSE", "Use the compact minimalistic pause screen instead of the default large one.", null);
        CreateSeparator(list);
        CreateAnimatedInlineToggleSection(list, "Damage Report", "DISABLE_DAMAGE_REPORT", "", function(sectionParent) {
            CreateSliderRow(sectionParent, "Horizontal Offset", "DAMAGE_REPORT_X_OFFSET", "offset_n1500_1500", "");
            CreateSliderRow(sectionParent, "Vertical Offset", "DAMAGE_REPORT_Y_OFFSET", "offset_n1500_200", "");
        }, { invert: true });
        CreateSeparator(list);
        // No master on/off toggle: the section is always open and driven purely by its controls
        // (Side/offsets default to vanilla, hides default off). ENABLE_STATS_POSITION stays in the
        // schema as a default-on no-op for back-compat but is no longer read or shown.
        CreateSectionTitle(list, "Player Stats", "ENABLE_STATS_POSITION");
        CreateRow(list, "Side", "STATS_POSITION_SIDE", "buttongroup", null, null, null, STATS_POSITION_SIDE_OPTIONS);
        CreateSliderRow(list, "Horizontal Offset", "STATS_POSITION_X_OFFSET", "offset_n500_500", "");
        CreateSliderRow(list, "Vertical Offset", "STATS_POSITION_Y_OFFSET", "offset_n500_500", "");
        CreateRow(list, "Hide in normal view", "STATS_POSITION_HIDE_NORMAL", "toggle", null, null, null, null, "Hide the bottom-left active stats block during normal play. It stays in the HUD (just made invisible), so the Crosshair Active Stats mirror keeps working.");
        CreateRow(list, "Hide on scoreboard (TAB)", "STATS_POSITION_HIDE_SCOREBOARD", "toggle", null, null, null, null, "Hide the detailed stats list that appears while the scoreboard / TAB is held.");
        CreateSeparator(list);
        CreateAnimatedInlineToggleSection(list, "Chat", "ENABLE_CHAT", "", function(sectionParent) {
            CreateSliderRow(sectionParent, "Size", "CHAT_SCALE", "size_50_200", "");
            CreateSliderRow(sectionParent, "Horizontal Offset", "CHAT_X_OFFSET", "offset_n1500_1500", "");
            CreateSliderRow(sectionParent, "Vertical Offset", "CHAT_Y_OFFSET", "offset_n250_800", "");
            CreateRow(sectionParent, "Images in Chat", "ENABLE_IMAGES_IN_CHAT", "toggle", null, null, null, null, "");
        });
    } else if (currentTab === "Overlay") {
        CreateSeparator(list);
        CreateAnimatedInlineToggleSection(list, "Zipline Boost", "ENABLE_ZIP_BOOST", "Always Visible Boost", function(sectionParent) {
            CreateSliderRow(sectionParent, "Size", "ZIP_BOOST_SCALE", "size_50_200", "");
            CreateSliderRow(sectionParent, "Horizontal Offset", "ZIP_BOOST_X_OFFSET", "offset_n2000_2000");
            CreateSliderRow(sectionParent, "Vertical Offset", "ZIP_BOOST_Y_OFFSET", "offset_0_1000");
        });
        CreateSeparator(list);
        CreateAnimatedInlineToggleSection(list, "Ult Cooldowns", "ENABLE_ULT_COOLDOWNS", null, null);
        CreateSeparator(list);
        CreateAnimatedInlineToggleSection(list, "Unsecured Timer", "ENABLE_UNSECURED_SOUL_TIMER", "Realtime Drain Countdown", function(sectionParent) {
            CreateSliderRow(sectionParent, "Size", "UNSECURED_SOUL_TIMER_SCALE", "size_50_200", "");
            CreateSliderRow(sectionParent, "Horizontal Offset", "UNSECURED_SOUL_TIMER_X_OFFSET", "offset_n1500_1500");
            CreateSliderRow(sectionParent, "Vertical Offset", "UNSECURED_SOUL_TIMER_Y_OFFSET", "offset_n100_1000");
        });
        CreateSeparator(list);
        CreateAnimatedInlineToggleSection(list, "Unsecured Plus", "ENABLE_BETTER_UNSECURED", "Customizable Unsecured Souls", function(sectionParent) {
            CreateRow(sectionParent, "Icon", "ENABLE_BETTER_UNSECURED_SHOW_ICON", "toggle", null, null, null, null, "");
            CreateRow(sectionParent, "Text", "ENABLE_BETTER_UNSECURED_SHOW_TEXT", "toggle", null, null, null, null, "");
            CreateSliderRow(sectionParent, "Size", "UNSECURED_SOULS_HUD_SCALE", "size_50_200", "");
            CreateSliderRow(sectionParent, "Horizontal Offset", "UNSECURED_SOULS_HUD_X_OFFSET", "offset_n1000_2000");
            CreateSliderRow(sectionParent, "Vertical Offset", "UNSECURED_SOULS_HUD_Y_OFFSET", "offset_800_2000");
        });
        CreateSeparator(list);
        CreateAnimatedInlineToggleSection(list, "Keyboard", "ENABLE_KEYBOARD_OVERLAY", "Realtime Key Inputs", function(sectionParent) {
            CreateRow(sectionParent, "Full Keys", "ENABLE_FULL_KEYBOARD_LAYOUT", "toggle", null, null, null, null, "");
            CreateSliderRow(sectionParent, "Size", "KEYBOARD_OVERLAY_SCALE", "size_70_150", "");
            CreateSliderRow(sectionParent, "Horizontal Offset", "KEYBOARD_OVERLAY_X_OFFSET", "offset_n1500_1500");
            CreateSliderRow(sectionParent, "Vertical Offset", "KEYBOARD_OVERLAY_Y_OFFSET", "offset_n400_1000");
            CreateRow(sectionParent, "Color", "KEYBOARD_OVERLAY_WASH_COLOR", "palette", null, null, null, QOL_COLOR_PALETTE_OPTIONS, "Choose a preset color wash for the keyboard overlay.");
        });
        CreateSeparator(list);
        CreateAnimatedInlineToggleSection(list, "Speed", "ENABLE_COMPASS_SPEED", "Show standalone movement speed.", function(sectionParent) {
            CreateSliderRow(sectionParent, "Horizontal Offset", "COMPASS_SPEED_X_OFFSET", "offset_n2000_2000");
            CreateSliderRow(sectionParent, "Vertical Offset", "COMPASS_SPEED_Y_OFFSET", "offset_n2000_2000");
        });
        CreateSeparator(list);
        CreateAnimatedInlineToggleSection(list, "Compass", "ENABLE_COMPASS", "See your view angle.", function(sectionParent) {
            CreateRow(sectionParent, "Minimalist", "ENABLE_SIMPLIFY_COMPASS", "toggle", null, null, null, null, "Simplifies the Compass overlay to its bare elements.");
            CreateSliderRow(sectionParent, "Horizontal Stretch", "COMPASS_STRETCH_X", "size_50_200");
            CreateSliderRow(sectionParent, "Vertical Stretch", "COMPASS_STRETCH_Y", "size_50_200");
            CreateSliderRow(sectionParent, "Size", "COMPASS_SCALE", "size_50_200");
            CreateSliderRow(sectionParent, "Horizontal Offset", "COMPASS_X_OFFSET", "offset_n2000_2000");
            CreateSliderRow(sectionParent, "Vertical Offset", "COMPASS_Y_OFFSET", "offset_n1000_300");
        });
    } else if (currentTab === "Dev") {
        CreateSectionTitle(list, "Performance", "ENABLE_PERF_DEBUG");
        CreateRow(list, "Perf Debug", "ENABLE_PERF_DEBUG", "toggle", null, null, null, null,
            "Enable performance tracking (required for overlay).");
        CreateRow(list, "Detailed Console", "ENABLE_PERF_DEBUG_DETAIL", "toggle", null, null, null, null,
            "Show full feature breakdown in console every 5s.");
        CreateRow(list, "Show Overlay", "ENABLE_PERF_OVERLAY", "toggle", null, null, null, null,
            "Show the performance overlay HUD in-game.");
        CreateSliderRow(list, "Alert Threshold", "PERF_ALERT_THRESHOLD_MS", "alert_ms_1_50", "Console alert when any feature exceeds this ms threshold.");
        CreateSliderRow(list, "Overlay Opacity", "PERF_OVERLAY_OPACITY", "opacity_perf", "Opacity of the performance overlay panel.");
        CreateSeparator(list);
        // ── Shared Hud-panel resolver for force-sync diagnostic polling ──
        // Called fresh each poll iteration since SaveAndSync() can recreate panels.
        function _findHudPanel() {
            try {
                var ctx = $.GetContextPanel();
                while (ctx && ctx.GetParent && ctx.GetParent()) { ctx = ctx.GetParent(); }
                return (ctx && ctx.FindChildTraverse) ? ctx.FindChildTraverse("Hud") : null;
            } catch(e) { return null; }
        }

        // ── Feature Isolation Test (FIT) ──
        // Tests each registered feature individually: enable → verify → disable → next.
        // Uses force-sync diagnostic polling to ensure we read a fresh snapshot after
        // each config change (eliminates the 5-second diagnostic write interval race).
        // Faster and more diagnostic than the preset cycle (tests isolation, not combinations).
        var fitHeader = CreateSectionTitle(list, "Feature Test");
        var fitBtn = CreateSectionInlineIconButton(fitHeader, "FeatureTestBtn",
            "s2r://panorama/images/icons/icon_play.vsvg",
            "Test each feature individually (enable → verify → disable).");
        var fitStatus = $.CreatePanel("Label", fitHeader, "FeatureTestStatus");
        fitStatus.text = "Idle";
        fitStatus.style.fontSize = "13px";
        fitStatus.style.color = "#666";
        fitStatus.style.marginLeft = "6px";
        fitStatus.style.verticalAlign = "center";

        var _fitRunning = false;
        var _fitToken = 0;

        function _fitSetStatus(text, color) {
            try { if (fitStatus && fitStatus.IsValid && fitStatus.IsValid()) { fitStatus.text = text; fitStatus.style.color = color; } } catch(e) { WarnLog("settings", "op failed: " + (e && e.message ? e.message : String(e || ""))); }
        }
        function _fitSetBtnActive(active) {
            try { if (fitBtn && fitBtn.IsValid && fitBtn.IsValid()) { if (active) fitBtn.AddClass("CycleActive"); else fitBtn.RemoveClass("CycleActive"); } } catch(e) { WarnLog("settings", "op failed: " + (e && e.message ? e.message : String(e || ""))); }
        }

        if (fitBtn) {
            fitBtn.SetPanelEvent("onactivate", function() {
                if (_fitRunning) {
                    // Stop
                    _fitRunning = false;
                    _fitToken++;
                    _fitSetStatus("Stopped", "#aa8844");
                    _fitSetBtnActive(false);
                    return;
                }
                // Build test queue from DEFAULT_CONFIG + PRESETS (available in Settings
                // context), NOT from QOL_FEATURE_REGISTRY (which is empty here because
                // feature files aren't loaded in the settings page — hud_escape_menu.xml
                // only includes ql_shared_presets, ql_bridge, ql_config, and ql_settings).
                // We collect every boolean toggle key (ENABLE_*, HUD_*, SHOW_*), deduplicate,
                // and test each one individually. The diagnostic output tells us which
                // feature auto-disabled.
                var toggleKeys = [];
                var seenKeys = {};
                // Scan DEFAULT_CONFIG
                if (typeof DEFAULT_CONFIG !== "undefined" && DEFAULT_CONFIG) {
                    var dcKeys = Object.keys(DEFAULT_CONFIG);
                    for (var dci = 0; dci < dcKeys.length; dci++) {
                        var dk = dcKeys[dci];
                        if ((dk.indexOf("ENABLE_") === 0 || dk.indexOf("HUD_") === 0 || dk.indexOf("SHOW_") === 0) && !seenKeys[dk]) {
                            seenKeys[dk] = true;
                            toggleKeys.push(dk);
                        }
                    }
                }
                // Scan PRESETS
                if (typeof PRESETS !== "undefined" && PRESETS) {
                    var presetNames = Object.keys(PRESETS);
                    for (var pi = 0; pi < presetNames.length; pi++) {
                        var presetCfg = PRESETS[presetNames[pi]];
                        if (!presetCfg) continue;
                        var pkKeys = Object.keys(presetCfg);
                        for (var pki = 0; pki < pkKeys.length; pki++) {
                            var pk = pkKeys[pki];
                            if ((pk.indexOf("ENABLE_") === 0 || pk.indexOf("HUD_") === 0 || pk.indexOf("SHOW_") === 0) && !seenKeys[pk]) {
                                seenKeys[pk] = true;
                                toggleKeys.push(pk);
                            }
                        }
                    }
                }
                toggleKeys.sort();
                var testQueue = [];
                for (var ti = 0; ti < toggleKeys.length; ti++) {
                    testQueue.push({ name: toggleKeys[ti], configKeys: [toggleKeys[ti]] });
                }
                if (testQueue.length === 0) {
                    _fitSetStatus("No toggle keys found", "#cc4444");
                    return;
                }

                // Save pre-test config snapshot
                var savedConfig = {};
                var allKeys = [];
                for (var ti = 0; ti < testQueue.length; ti++) {
                    for (var tk = 0; tk < testQueue[ti].configKeys.length; tk++) {
                        var k = testQueue[ti].configKeys[tk];
                        if (allKeys.indexOf(k) < 0) allKeys.push(k);
                    }
                }
                for (var ki = 0; ki < allKeys.length; ki++) {
                    savedConfig[allKeys[ki]] = MOD_CONFIG[allKeys[ki]];
                }

                var passed = 0;
                var failed = 0;
                var skipped = 0;
                var index = 0;
                var token = ++_fitToken;
                _fitRunning = true;
                _fitSetBtnActive(true);
                _fitSetStatus("Starting...", "#66cc99");

                function runNext() {
                    if (!_fitRunning || token !== _fitToken) return;
                    if (index >= testQueue.length) {
                        // Done — restore config
                        _fitRunning = false;
                        _fitSetBtnActive(false);
                        for (var rk = 0; rk < allKeys.length; rk++) {
                            MOD_CONFIG[allKeys[rk]] = savedConfig[allKeys[rk]];
                        }
                        SaveAndSync();
                        var color = (failed > 0) ? "#cc8844" : "#66cc99";
                        _fitSetStatus("Done: " + passed + " passed, " + failed + " failed, " + skipped + " skipped", color);
                        $.Msg("[QOLLock][FeatureTest] Complete — " + passed + " passed, " + failed + " failed, " + skipped + " skipped");
                        return;
                    }

                    var entry = testQueue[index];
                    var label = "[" + (index + 1) + "/" + testQueue.length + "] " + entry.name;
                    _fitSetStatus(label, "#66cc99");

                    try {
                        // Enable feature's config keys
                        for (var ek = 0; ek < entry.configKeys.length; ek++) {
                            var ck = entry.configKeys[ek];
                            MOD_CONFIG[ck] = (ck.indexOf("ENABLE_") === 0 || ck.indexOf("HUD_") === 0 || ck.indexOf("SHOW_") === 0) ? 1 : MOD_CONFIG[ck];
                        }
                        SaveAndSync();

                        // ── Write force-sync token for fresh diagnostic snapshot ──
                        var forceToken = "fit_" + token + "_" + index;
                        var hudPanel = _findHudPanel();
                        if (hudPanel && hudPanel.SetAttributeString) {
                            try { hudPanel.SetAttributeString("QOL_DiagRequest", forceToken); } catch(e) { WarnLog("settings", "op failed: " + (e && e.message ? e.message : String(e || ""))); }
                            $.Msg("[QOLLock][FeatureTest] force-sync token written: " + forceToken + " → polling for diag echo");
                        } else {
                            WarnLog("settings", "FeatureTest cannot write force-sync token — Hud panel not found (will poll stale data and likely timeout)");
                        }

                        // ── Poll for fresh diagnostic (eliminates 5s write interval race) ──
                        var pollStartMs = Date.now ? Date.now() : (new Date()).getTime();
                        var pollAttempts = 0;

                        function pollFitDiag() {
                            pollAttempts++;
                            if (!_fitRunning || token !== _fitToken) return;

                            var nowMs = Date.now ? Date.now() : (new Date()).getTime();
                            if ((nowMs - pollStartMs) > 5500) {
                                // Timeout — can't confirm, assume pass (don't flag false positive)
                                skipped++;
                                $.Msg("[QOLLock][FeatureTest] SKIP: " + entry.name + " — diagnostic sync timeout");
                                // Disable and continue
                                for (var tdk = 0; tdk < entry.configKeys.length; tdk++) {
                                    MOD_CONFIG[entry.configKeys[tdk]] = savedConfig[entry.configKeys[tdk]];
                                }
                                SaveAndSync();
                                index++;
                                $.Schedule(0.08, runNext);
                                return;
                            }

                            var hud = _findHudPanel();
                            var rawDiag = "";
                            if (hud && hud.GetAttributeString) {
                                try { rawDiag = hud.GetAttributeString("QOL_Diag", ""); } catch(e) {}
                            }
                            if (rawDiag) {
                                try {
                                    var diag = JSON.parse(rawDiag);
                                    if (diag.diagToken === forceToken) {
                                        // Fresh snapshot — check for any auto-disabled features.
                                        // We test by config key, but diagnostics report by feature name.
                                        var disabledFeatures = (diag.disabled && diag.disabled.length > 0) ? diag.disabled : [];
                                        if (disabledFeatures.length > 0) {
                                            failed++;
                                            $.Msg("[QOLLock][FeatureTest] FAIL: " + entry.name + " → auto-disabled: " + disabledFeatures.join(", "));
                                        } else {
                                            passed++;
                                        }

                                        // Disable feature's keys
                                        for (var dk = 0; dk < entry.configKeys.length; dk++) {
                                            MOD_CONFIG[entry.configKeys[dk]] = savedConfig[entry.configKeys[dk]];
                                        }
                                        SaveAndSync();

                                        index++;
                                        $.Schedule(0.08, runNext);
                                        return;
                                    }
                                    // else: stale snapshot — keep polling
                                } catch(e) {}
                            }
                            var interval = pollAttempts < 5 ? 0.1 : (pollAttempts < 15 ? 0.2 : 0.4);
                            $.Schedule(interval, pollFitDiag);
                        }
                        $.Schedule(0.15, pollFitDiag);
                    } catch(e) {
                        failed++;
                        $.Msg("[QOLLock][FeatureTest] FAIL: " + entry.name + " threw: " + (e && e.message ? e.message : String(e)));
                        // Restore keys and continue
                        for (var rk2 = 0; rk2 < entry.configKeys.length; rk2++) {
                            MOD_CONFIG[entry.configKeys[rk2]] = savedConfig[entry.configKeys[rk2]];
                        }
                        SaveAndSync();
                        index++;
                        $.Schedule(0.08, runNext);
                    }
                }
                $.Schedule(0.1, runNext);
            });
        }
        // ── Preset Cycle (Robust) ──
        // Applies every preset sequentially with per-preset verification via force-sync
        // diagnostic polling. Detects auto-disabled features, tracks timing, and reports
        // a detailed pass/fail summary at the end.
        // The force-sync mechanism: after applying a preset, we write a unique token to
        // the Hud panel's QOL_DiagRequest attribute. The HUD dispatch loop sees the new
        // token and immediately writes a fresh diagnostic snapshot (echoing the token).
        // We poll QOL_Diag until we see our token, then verify no features auto-disabled.
        // This eliminates the 5-second diagnostic write interval race condition.
        var presetCycleHeader = CreateSectionTitle(list, "Preset Cycle");
        var presetCycleBtn = CreateSectionInlineIconButton(presetCycleHeader, "PresetCycleBtn",
            "s2r://panorama/images/icons/icon_reorder.vsvg",
            "Apply every preset and verify no features auto-disable. Click again to stop.");
        var presetCycleStatus = $.CreatePanel("Label", presetCycleHeader, "PresetCycleStatus");
        presetCycleStatus.text = "Idle";
        presetCycleStatus.style.fontSize = "13px";
        presetCycleStatus.style.color = "#666";
        presetCycleStatus.style.marginLeft = "6px";
        presetCycleStatus.style.verticalAlign = "center";

        var _pcRunning = false;
        var _pcToken = 0;
        var _pcResults = [];

        if (presetCycleBtn) {
            // ── Panel-safe helpers: panels may be destroyed by SaveAndSync() ──
            function _pcSetStatus(text, color) {
                try { if (presetCycleStatus && presetCycleStatus.IsValid && presetCycleStatus.IsValid()) { presetCycleStatus.text = text; presetCycleStatus.style.color = color; } } catch(e) { WarnLog("settings", "op failed: " + (e && e.message ? e.message : String(e || ""))); }
            }
            function _pcSetBtnActive(active) {
                try { if (presetCycleBtn && presetCycleBtn.IsValid && presetCycleBtn.IsValid()) { if (active) presetCycleBtn.AddClass("CycleActive"); else presetCycleBtn.RemoveClass("CycleActive"); } } catch(e) { WarnLog("settings", "op failed: " + (e && e.message ? e.message : String(e || ""))); }
            }

            presetCycleBtn.SetPanelEvent("onactivate", function() {
                if (_pcRunning) {
                    // ── Stop cycling ──
                    _pcRunning = false;
                    _pcToken++;
                    _pcSetBtnActive(false);
                    var done = _pcResults.length;
                    var total = (typeof PRESETS !== "undefined") ? Object.keys(PRESETS).length : 0;
                    _pcSetStatus("Stopped (" + done + " of " + total + ")", "#aa8844");
                    SetLocalizedConfigFeedbackMessage("Stopped after " + done + " presets.", "info", 2400);
                    return;
                }

                // ── Start cycling ──
                if (typeof PRESETS === "undefined" || Object.keys(PRESETS).length === 0) {
                    _pcSetStatus("No presets found.", "#cc4444");
                    return;
                }
                var presetNames = Object.keys(PRESETS).sort();
                _pcRunning = true;
                _pcResults = [];
                var index = 0;
                var token = ++_pcToken;
                _pcSetBtnActive(true);
                _pcSetStatus("Starting...", "#66cc99");
                $.Msg("[QOLLock][presetCycle] Starting robust cycle: " + presetNames.length + " presets");

                function runNext() {
                    if (!_pcRunning || token !== _pcToken) return;

                    if (index >= presetNames.length) {
                        // ── Done — print summary ──
                        _pcRunning = false;
                        _pcSetBtnActive(false);
                        var passed = 0, failed = 0;
                        var failNames = [];
                        for (var ri = 0; ri < _pcResults.length; ri++) {
                            if (_pcResults[ri].passed) { passed++; }
                            else {
                                failed++;
                                var why = (_pcResults[ri].autoDisabled && _pcResults[ri].autoDisabled.length > 0) ? _pcResults[ri].autoDisabled.join(",") : (_pcResults[ri].timeout ? "timeout" : (_pcResults[ri].exception ? "exception" : "unknown"));
                                failNames.push(_pcResults[ri].name + " (" + why + ")");
                            }
                        }
                        var summaryColor = (failed > 0) ? "#cc8844" : "#66cc99";
                        var summary = "Done: " + passed + " passed, " + failed + " failed";
                        _pcSetStatus(summary, summaryColor);
                        $.Msg("[QOLLock][presetCycle] === SUMMARY: " + summary + " ===");
                        if (failNames.length > 0) {
                            $.Msg("[QOLLock][presetCycle] FAILURES: " + failNames.join("; "));
                        }
                        // ── Timing stats ──
                        var totalMs = 0, minMs = Infinity, maxMs = 0;
                        for (var ti = 0; ti < _pcResults.length; ti++) {
                            if (_pcResults[ti].timeMs > 0) {
                                totalMs += _pcResults[ti].timeMs;
                                if (_pcResults[ti].timeMs < minMs) minMs = _pcResults[ti].timeMs;
                                if (_pcResults[ti].timeMs > maxMs) maxMs = _pcResults[ti].timeMs;
                            }
                        }
                        if (_pcResults.length > 0 && minMs < Infinity) {
                            var avgMs = Math.round(totalMs / _pcResults.length);
                            $.Msg("[QOLLock][presetCycle] Timing: avg=" + avgMs + "ms, min=" + minMs + "ms, max=" + maxMs + "ms, total=" + (totalMs / 1000).toFixed(1) + "s");
                        }
                        SetLocalizedConfigFeedbackMessage(summary + " (" + (totalMs > 0 ? (totalMs / 1000).toFixed(1) + "s" : "N/A") + ")", (failed > 0 ? "warn" : "success"), 5000);
                        return;
                    }

                    var presetName = presetNames[index];
                    var startMs = Date.now ? Date.now() : (new Date()).getTime();
                    var forceToken = "pc_" + token + "_" + index;
                    var label = "[" + (index + 1) + "/" + presetNames.length + "] " + presetName;
                    _pcSetStatus(label + " …", "#66cc99");

                    // ── Phase 1: Apply the preset ──
                    var applyOk = true;
                    var applyErr = "";
                    try {
                        ApplyPresetByName(presetName);
                    } catch(e) {
                        applyOk = false;
                        applyErr = (e && e.message) ? e.message : String(e || "");
                        $.Msg("[QOLLock][presetCycle] ApplyPresetByName failed for '" + presetName + "': " + applyErr);
                    }

                    if (!applyOk) {
                        _pcResults.push({ name: presetName, passed: false, autoDisabled: [], featuresLoaded: 0, timeMs: Date.now ? Date.now() - startMs : 0, exception: applyErr });
                        _pcSetStatus(label + " — EXCEPTION", "#cc4444");
                        index++;
                        $.Schedule(0.05, runNext);
                        return;
                    }

                    // ── Phase 2: Write force-sync token to Hud bridge ──
                    // Done AFTER ApplyPresetByName (which calls SaveAndSync) so the HUD
                    // picks up both the new config and the token in the same dispatch cycle.
                    var hudPanel = _findHudPanel();
                    if (hudPanel && hudPanel.SetAttributeString) {
                        try { hudPanel.SetAttributeString("QOL_DiagRequest", forceToken); } catch(e) { WarnLog("settings", "op failed: " + (e && e.message ? e.message : String(e || ""))); }
                        $.Msg("[QOLLock][presetCycle] force-sync token written: " + forceToken + " → polling for diag echo");
                    } else {
                        WarnLog("settings", "presetCycle cannot write force-sync token — Hud panel not found (will poll stale data and likely timeout)");
                    }

                    // ── Phase 3: Poll for fresh diagnostic snapshot ──
                    var pollStartMs = Date.now ? Date.now() : (new Date()).getTime();
                    var pollAttempts = 0;
                    var maxPollMs = 5500;

                    function pollDiag() {
                        pollAttempts++;
                        if (!_pcRunning || token !== _pcToken) return;

                        var nowMs = Date.now ? Date.now() : (new Date()).getTime();
                        var elapsedPollMs = nowMs - pollStartMs;

                        // Timeout — diagnostic bridge never echoed our token
                        if (elapsedPollMs > maxPollMs) {
                            _pcResults.push({ name: presetName, passed: false, autoDisabled: [], featuresLoaded: 0, timeMs: nowMs - startMs, timeout: true });
                            $.Msg("[QOLLock][presetCycle] " + label + " — TIMEOUT (no diagnostic sync after " + Math.round(elapsedPollMs) + "ms)");
                            _pcSetStatus(label + " — TIMEOUT", "#cc8844");
                            index++;
                            $.Schedule(0.05, runNext);
                            return;
                        }

                        // Read diagnostic bridge (fresh Hud ref each poll — panels may be recreated)
                        var rawDiag = "";
                        var hud = _findHudPanel();
                        if (hud && hud.GetAttributeString) {
                            try { rawDiag = hud.GetAttributeString("QOL_Diag", ""); } catch(e) {}
                        }

                        if (rawDiag) {
                            try {
                                var diag = JSON.parse(rawDiag);
                                // Match the force-sync token to ensure this snapshot reflects our preset
                                if (diag.diagToken === forceToken) {
                                    var elapsedMs = nowMs - startMs;
                                    var autoDisabled = (diag.disabled) ? diag.disabled : [];
                                    var features = (diag.features) ? diag.features : [];
                                    var passed = autoDisabled.length === 0;

                                    _pcResults.push({
                                        name: presetName,
                                        passed: passed,
                                        autoDisabled: autoDisabled,
                                        featuresLoaded: features.length,
                                        timeMs: elapsedMs
                                    });

                                    var statusStr = passed ? "OK" : "FAIL: " + autoDisabled.join(", ");
                                    var color = passed ? "#66cc99" : "#cc4444";
                                    $.Msg("[QOLLock][presetCycle] " + label + " — " + statusStr + " (" + features.length + " features, " + elapsedMs + "ms, " + pollAttempts + " polls)");
                                    _pcSetStatus(label + " — " + statusStr, color);

                                    index++;
                                    $.Schedule(0.05, runNext);
                                    return;
                                }
                                // else: stale snapshot (token mismatch) — keep polling
                            } catch(e) {
                                // JSON parse error — keep polling
                            }
                        }
                        // Not ready yet — poll again with adaptive interval
                        // Start at 100ms, back off to 400ms after 15 attempts (~3s of polling)
                        var interval = pollAttempts < 5 ? 0.1 : (pollAttempts < 15 ? 0.2 : 0.4);
                        $.Schedule(interval, pollDiag);
                    }

                    // First poll after 150ms (allow 3 dispatch cycles for HUD to process)
                    $.Schedule(0.15, pollDiag);
                }

                $.Schedule(0.1, runNext);
            });
        }
        // ── Diagnostics ──
        var diagHeader = CreateSectionTitle(list, "Diagnostics");
        var copyLogsBtn = CreateSectionInlineIconButton(diagHeader, "DiagCopyLogsBtn",
            "s2r://panorama/images/icons/icon_copy.vsvg",
            "Copy QOLLock diagnostic logs to clipboard.");
        if (copyLogsBtn) {
            copyLogsBtn.SetPanelEvent("onactivate", function() {
                var diagText = "";
                try {
                    diagText = QOL_DumpDiagnostics();
                } catch(e) {
                    diagText = "=== QOLLOCK Diagnostics ===\nError: " + String(e && e.message ? e.message : String(e)) + "\n";
                }
                var hiddenEntry = $.CreatePanel("TextEntry", list, "DiagCopyTextEntry");
                hiddenEntry.text = diagText;
                hiddenEntry.multiline = true;
                hiddenEntry.maxchars = Math.max(diagText.length + 100, 1000);
                hiddenEntry.SetPanelEvent("onfocus", function() {
                    try { hiddenEntry.SelectAll(); } catch(e) { WarnLog("settings", "op failed: " + (e && e.message ? e.message : String(e || ""))); }
                });
                var copied = TryCopyTextToClipboard(diagText, hiddenEntry);
                if (hiddenEntry && hiddenEntry.IsValid && hiddenEntry.IsValid()) {
                    try { hiddenEntry.DeleteAsync(0); } catch(e) { WarnLog("settings", "op failed: " + (e && e.message ? e.message : String(e || ""))); }
                }
                if (copied) {
                    copyLogsBtn.RemoveClass("FailureState");
                    copyLogsBtn.AddClass("SuccessState");
                    SetLocalizedConfigFeedbackMessage("Diagnostic logs copied.", "success", 2200);
                    $.Schedule(0.6, function() {
                        if (!copyLogsBtn || !copyLogsBtn.IsValid || !copyLogsBtn.IsValid()) return;
                        copyLogsBtn.RemoveClass("SuccessState");
                    });
                } else {
                    copyLogsBtn.RemoveClass("SuccessState");
                    copyLogsBtn.AddClass("FailureState");
                    SetLocalizedConfigFeedbackMessage("Clipboard copy failed.", "error", 2200);
                    $.Schedule(0.5, function() {
                        if (!copyLogsBtn || !copyLogsBtn.IsValid || !copyLogsBtn.IsValid()) return;
                        copyLogsBtn.RemoveClass("FailureState");
                    });
                }
            });
        }
    } else if (currentTab === "Minimap") {
        CreateSectionTitle(list, "Base");
        CreateRow(list, "Minimalist", "MINIMAL_MINIMAP", "toggle", null, null, null, null, "Cleans up visuals of the minimap significantly to reduce clutter.");
        CreateSliderRow(list, "Minimalist Opacity", "MINIMAL_MINIMAP_OPACITY", "opacity");
        CreateRow(list, "Flip", "MINIMAP_FLIP", "toggle", null, null, null, null, "Rotates the static minimap 180 degrees.");
        CreateRow(list, "Spinny Mode", "MINIMAP_ROTATE_WITH_PLAYER", "toggle", null, null, null, null, "");
        CreateSliderRow(list, "Size", "MINIMAP_SMALL_SIZE", "size_200_1000_s5", "Default 400");
        CreateSliderRow(list, "Opacity", "MINIMAP_BASE_OPACITY", "opacity");
        CreateRow(list, "Icons", "MINIMAP_ICON_COLOR", "palette", null, null, null, QOL_COLOR_PALETTE_OPTIONS, "Choose a preset color wash for minimap icons.");
        CreateSliderRow(list, "Horizontal Offset", "MINIMAP_X_OFFSET", "offset_n1500_1500");
        CreateSliderRow(list, "Vertical Offset", "MINIMAP_Y_OFFSET", "offset_n100_1000");
        CreateSeparator(list);
        CreateSectionTitle(list, "Addons");
        CreateRow(list, "Elevation Markers", "ENABLE_MINIMAP_ELEVATION_MARKERS", "toggle", null, null, null, null, "Shows relative elevation difference between you and players.");
        CreateInlineSecondaryCheckboxToggleRow(
            list,
            "Bridge Buff Timer",
            "ENABLE_MINIMAP_BUFF_TIMER",
            "On Bridge",
            "ENABLE_MINIMAP_BUFF_TIMER_ON_BRIDGE",
            "",
            ""
        );
        CreateInlineSecondaryCheckboxToggleRow(
            list,
            "Mid Boss Timer",
            "ENABLE_MINIMAP_REJUV_TIMER",
            "On Mid Boss",
            "ENABLE_MINIMAP_ALWAYS_ON_MID_BOSS",
            "",
            "Moves the Mid Boss timer onto the bridge area of the minimap."
        );
        CreateRow(list, "Crate Overlay", "ENABLE_MINIMAP_CRATE_OVERLAY", "toggle", null, null, null, null, "Midtown-only crate markers on the minimap.");
        CreateRow(list, "Rem Tunnels", "ENABLE_MINIMAP_REM_TUNNELS", "toggle", null, null, null, null, "Show an overlay of the underground tunnels.");
        CreateSliderRow(list, "Rem Tunnels Opacity", "MINIMAP_REM_TUNNELS_OPACITY", "opacity");
        CreateSeparator(list);
        CreateAnimatedInlineToggleSection(list, "Alt Zoom", "ENABLE_ALT_ZOOM", "Ability Menu Open", function(sectionParent) {
            CreateRow(sectionParent, "Draw Over UI", "ALT_ZOOM_DRAW_OVER_UI", "toggle", null, null, null, null);
            CreateRow(sectionParent, "Rem Tunnels", "ENABLE_ALT_ZOOM_REM_TUNNELS", "toggle", null, null, null, null, "Show the underground tunnel overlay while Alt Zoom is active.");
            CreateSliderRow(sectionParent, "Rem Tunnels Opacity", "ALT_ZOOM_REM_TUNNELS_OPACITY", "opacity");
            CreateSliderRow(sectionParent, "Size", "MINIMAP_LARGE_SIZE_ALT", "size_400_1200_s10");
            CreateSliderRow(sectionParent, "Opacity", "ALT_ZOOM_OPACITY", "opacity");
            CreateSliderRow(sectionParent, "Horizontal Offset", "ZOOM_X_OFFSET_ALT", "offset_n1500_1500");
            CreateSliderRow(sectionParent, "Vertical Offset", "ZOOM_Y_OFFSET_ALT", "offset_n1000_1000");
        });
        CreateSeparator(list);
        CreateAnimatedInlineToggleSection(list, "Tab Zoom", "ENABLE_TAB_ZOOM", "Scoreboard Open", function(sectionParent) {
            CreateRow(sectionParent, "Draw Over UI", "TAB_ZOOM_DRAW_OVER_UI", "toggle", null, null, null, null);
            CreateRow(sectionParent, "Rem Tunnels", "ENABLE_TAB_ZOOM_REM_TUNNELS", "toggle", null, null, null, null, "Show the underground tunnel overlay while Tab Zoom is active.");
            CreateSliderRow(sectionParent, "Rem Tunnels Opacity", "TAB_ZOOM_REM_TUNNELS_OPACITY", "opacity");
            CreateSliderRow(sectionParent, "Size", "MINIMAP_LARGE_SIZE_TAB", "size_400_1200_s10");
            CreateSliderRow(sectionParent, "Opacity", "TAB_ZOOM_OPACITY", "opacity");
            CreateSliderRow(sectionParent, "Horizontal Offset", "ZOOM_X_OFFSET_TAB", "offset_n1500_1500");
            CreateSliderRow(sectionParent, "Vertical Offset", "ZOOM_Y_OFFSET_TAB", "offset_n1000_1000");
        });
    } else if (currentTab === "Audio") {
        CreateSectionTitle(list, "Announcer");
        CreateRow(list, "Voice", "VOICE_TYPE", "dropdown", null, null, null, BuildVoiceDropdownOptions());
        CreateSliderRow(list, "Volume", "VOICE_VOLUME", "volume_0_100");
        var announcerTypeRow = CreateRow(list, "Type", null, "multitoggle", null, null, null, NEUTRAL_CAMP_TIER_OPTIONS);
        if (announcerTypeRow && announcerTypeRow.IsValid && announcerTypeRow.IsValid()) {
            announcerTypeRow.AddClass("AnnouncerTypeFilterRow");
        }
        var announcerBuffFilterRow = CreateRow(list, "Buff Filter", null, "multitoggle", null, null, null, BRIDGE_BUFF_FILTER_OPTIONS);
        if (announcerBuffFilterRow && announcerBuffFilterRow.IsValid && announcerBuffFilterRow.IsValid()) {
            announcerBuffFilterRow.AddClass("AnnouncerTypeFilterRow");
        }
        CreateSliderRow(list, "Buff Delay", "BRIDGE_BUFF_START", "sec_0_60", "In Seconds");
        CreateSeparator(list);
        CreateAnimatedInlineToggleSection(list, "Minimap Reminder", "ENABLE_MINIMAP_REMINDER", "Ding to Check Minimap", function(sectionParent) {
            CreateSliderRow(sectionParent, "Timer", "MINIMAP_REMINDER_INTERVAL", "sec_5_60", "In Seconds");
        });
        CreateSeparator(list);
        CreateAnimatedInlineToggleSection(list, "Deadlock For Dummies", "ENABLE_DL4D_REMINDERS", "Timed audio reminders from Deadlock For Dummies.", function(sectionParent) {
            CreateSliderRow(sectionParent, "Volume", "DL4D_VOLUME", "volume_0_100");
            CreateRow(sectionParent, "Captions", "ENABLE_DL4D_CAPTIONS", "toggle", null, null, null, null);
            for (var dl4dIndex = 0; dl4dIndex < DL4D_REMINDER_OPTIONS.length; dl4dIndex++) {
                CreateDl4dReminderRow(sectionParent, DL4D_REMINDER_OPTIONS[dl4dIndex]);
            }
        });
    } else if (currentTab === "Console") {
        if (gSearchCollectMode && gSearchCollectState) {
            CreateRuntimeSectionTitle(list, "General");
            CreateRow(list, "Hitmarkers", "HITMARKERS_RUNTIME", "runtime_buttongroup", null, null, null, HITMARKERS_RUNTIME_OPTIONS);
            CreateSeparator(list);
            CreateRuntimeSectionTitle(list, "Minimap");
            CreateRow(
                list,
                "Click Radius",
                "RUNTIME_MINIMAP_CLICK_RADIUS",
                "runtime_slider",
                0,
                1000,
                25,
                [{ command: "citadel_minimap_unit_click_radius", defaultValue: 200 }],
                "The click hitbox of your pings or clicks, this can help make pings more accurate."
            );
            CreateRow(
                list,
                "Icon Shrink",
                "RUNTIME_MINIMAP_ICON_SHRINK",
                "runtime_slider",
                0,
                3,
                0.1,
                [{ command: "citadel_minimap_max_icon_shrink", defaultValue: 0.7 }],
                "How much icons will shrink when overlapping with others."
            );
            CreateRow(
                list,
                "Hero Icon Size",
                "RUNTIME_MINIMAP_HERO_ICON_SIZE",
                "runtime_slider",
                0,
                24,
                0.5,
                [{ command: "citadel_minimap_player_width", defaultValue: 6.5 }],
                "The size of other players on the minimap."
            );
            CreateRow(
                list,
                "Player Icon Size",
                "RUNTIME_MINIMAP_PLAYER_ICON_SIZE",
                "runtime_slider",
                0,
                24,
                0.5,
                [{ command: "citadel_minimap_local_player_width", defaultValue: 12 }],
                "The size of yourself on the minimap."
            );
            CreateRow(
                list,
                "Shrink Distance",
                "RUNTIME_MINIMAP_SHRINK_DISTANCE",
                "runtime_slider",
                0,
                20,
                1,
                [{ command: "citadel_minimap_overlap_scan_distance", defaultValue: 10 }],
                "The distance threshold in which icons will start shrinking. Lower is more accurate positions, higher is easier visibility."
            );
            CreateRow(
                list,
                "Zip Thickness",
                "RUNTIME_MINIMAP_ZIP_THICKNESS",
                "runtime_slider",
                0,
                10,
                0.5,
                [{ command: "citadel_minimap_zip_line_thickness", defaultValue: 2 }],
                "The thickness of the Zipline lines across the map."
            );
            CreateRow(
                list,
                "Refresh Rate",
                "RUNTIME_MINIMAP_REFRESH_RATE",
                "runtime_slider",
                15,
                360,
                15,
                [{ command: "minimap_update_rate_hz", defaultValue: 60 }],
                "How fast the minimap refreshes."
            );
            CreateSeparator(list);
            CreateRuntimeSectionTitle(list, "Statistics");
            CreateRow(
                list,
                "Show Memory",
                "RUNTIME_STATS_SHOWMEM",
                "runtime_buttongroup",
                null,
                null,
                null,
                SHOW_MEMORY_RUNTIME_OPTIONS,
                "RAM and GPU Memory real time usage statistics."
            );
            CreateRow(
                list,
                "Show Position",
                "RUNTIME_STATS_SHOWPOS",
                "runtime_buttongroup",
                null,
                null,
                null,
                SHOW_POSITION_RUNTIME_OPTIONS,
                "Position and Velocity real time statistics."
            );
            CreateRow(
                list,
                "Show Tick",
                "RUNTIME_STATS_SHOWTICK",
                "runtime_buttongroup",
                null,
                null,
                null,
                SHOW_TICK_RUNTIME_OPTIONS,
                "Shows real time tick information, mostly useless."
            );
            CreateRow(
                list,
                "Show FPS",
                "RUNTIME_STATS_SHOWFPS",
                "runtime_buttongroup",
                null,
                null,
                null,
                SHOW_FPS_RUNTIME_OPTIONS,
                "Shows raw FPS count."
            );
            CreateRow(
                list,
                "Show Frame",
                "RUNTIME_STATS_SHOWFRAME",
                "runtime_buttongroup",
                null,
                null,
                null,
                SHOW_FRAME_RUNTIME_OPTIONS,
                "Shows current frame count, mostly useless."
            );
            return;
        }

        var consoleNoteWrap = $.CreatePanel("Panel", list, "ConsoleTabNoteWrap");
        consoleNoteWrap.AddClass("ConsoleTabNoteWrap");
        consoleNoteWrap.AddClass("SupportHeroCard");
        var consoleNoteTitle = $.CreatePanel("Label", consoleNoteWrap, "ConsoleTabNoteTitle");
        consoleNoteTitle.AddClass("SupportTabSectionTitle");
        consoleNoteTitle.AddClass("ConsoleTabNoteTitle");
        consoleNoteTitle.text = LocalizeSettingsText("Console Notes", true);
        var consoleNoteList = $.CreatePanel("Panel", consoleNoteWrap, "ConsoleTabNoteList");
        consoleNoteList.AddClass("SupportHeroBulletList");
        consoleNoteList.AddClass("ConsoleTabNoteList");
        var consoleNoteLines = [
            "These are easy access to common console commands and are not included in QOL settings.",
            "Use autoexec or other methods to load these automatically."
        ];
        for (var consoleNoteIdx = 0; consoleNoteIdx < consoleNoteLines.length; consoleNoteIdx++) {
            var consoleNoteRow = $.CreatePanel("Panel", consoleNoteList, "");
            consoleNoteRow.AddClass("SupportHeroBullet");
            consoleNoteRow.AddClass("ConsoleTabNoteBullet");
            var consoleNoteMarker = $.CreatePanel("Panel", consoleNoteRow, "");
            consoleNoteMarker.AddClass("SupportHeroBulletMarker");
            consoleNoteMarker.AddClass("ConsoleTabNoteMarker");
            var consoleNoteLabel = $.CreatePanel("Label", consoleNoteRow, "");
            consoleNoteLabel.AddClass("SupportTabText");
            consoleNoteLabel.AddClass("SupportHeroBulletLabel");
            consoleNoteLabel.AddClass("ConsoleTabNoteText");
            consoleNoteLabel.text = LocalizeSettingsText(consoleNoteLines[consoleNoteIdx], true);
        }

        CreateRuntimeSectionTitle(list, "General");
        CreateRow(list, "Hitmarkers", "HITMARKERS_RUNTIME", "runtime_buttongroup", null, null, null, HITMARKERS_RUNTIME_OPTIONS);
        CreateSeparator(list);
        CreateRuntimeSectionTitle(list, "Minimap");
        CreateRow(
            list,
            "Click Radius",
            "RUNTIME_MINIMAP_CLICK_RADIUS",
            "runtime_slider",
            0,
            1000,
            25,
            [{ command: "citadel_minimap_unit_click_radius", defaultValue: 200 }],
            "The click hitbox of your pings or clicks, this can help make pings more accurate."
        );
        CreateRow(
            list,
            "Icon Shrink",
            "RUNTIME_MINIMAP_ICON_SHRINK",
            "runtime_slider",
            0,
            3,
            0.1,
            [{ command: "citadel_minimap_max_icon_shrink", defaultValue: 0.7 }],
            "How much icons will shrink when overlapping with others."
        );
        CreateRow(
            list,
            "Hero Icon Size",
            "RUNTIME_MINIMAP_HERO_ICON_SIZE",
            "runtime_slider",
            0,
            24,
            0.5,
            [{ command: "citadel_minimap_player_width", defaultValue: 6.5 }],
            "The size of other players on the minimap."
        );
        CreateRow(
            list,
            "Player Icon Size",
            "RUNTIME_MINIMAP_PLAYER_ICON_SIZE",
            "runtime_slider",
            0,
            24,
            0.5,
            [{ command: "citadel_minimap_local_player_width", defaultValue: 12 }],
            "The size of yourself on the minimap."
        );
        CreateRow(
            list,
            "Shrink Distance",
            "RUNTIME_MINIMAP_SHRINK_DISTANCE",
            "runtime_slider",
            0,
            20,
            1,
            [{ command: "citadel_minimap_overlap_scan_distance", defaultValue: 10 }],
            "The distance threshold in which icons will start shrinking. Lower is more accurate positions, higher is easier visibility."
        );
        CreateRow(
            list,
            "Zip Thickness",
            "RUNTIME_MINIMAP_ZIP_THICKNESS",
            "runtime_slider",
            0,
            10,
            0.5,
            [{ command: "citadel_minimap_zip_line_thickness", defaultValue: 2 }],
            "The thickness of the Zipline lines across the map."
        );
        CreateRow(
            list,
            "Refresh Rate",
            "RUNTIME_MINIMAP_REFRESH_RATE",
            "runtime_slider",
            15,
            360,
            15,
            [{ command: "minimap_update_rate_hz", defaultValue: 60 }],
            "How fast the minimap refreshes."
        );
        CreateSeparator(list);
        CreateRuntimeSectionTitle(list, "Statistics");
        CreateRow(
            list,
            "Show Memory",
            "RUNTIME_STATS_SHOWMEM",
            "runtime_buttongroup",
            null,
            null,
            null,
            SHOW_MEMORY_RUNTIME_OPTIONS,
            "RAM and GPU Memory real time usage statistics."
        );
        CreateRow(
            list,
            "Show Position",
            "RUNTIME_STATS_SHOWPOS",
            "runtime_buttongroup",
            null,
            null,
            null,
            SHOW_POSITION_RUNTIME_OPTIONS,
            "Position and Velocity real time statistics."
        );
        CreateRow(
            list,
            "Show Tick",
            "RUNTIME_STATS_SHOWTICK",
            "runtime_buttongroup",
            null,
            null,
            null,
            SHOW_TICK_RUNTIME_OPTIONS,
            "Shows real time tick information, mostly useless."
        );
        CreateRow(
            list,
            "Show FPS",
            "RUNTIME_STATS_SHOWFPS",
            "runtime_buttongroup",
            null,
            null,
            null,
            SHOW_FPS_RUNTIME_OPTIONS,
            "Shows raw FPS count."
        );
        CreateRow(
            list,
            "Show Frame",
            "RUNTIME_STATS_SHOWFRAME",
            "runtime_buttongroup",
            null,
            null,
            null,
            SHOW_FRAME_RUNTIME_OPTIONS,
            "Shows current frame count, mostly useless."
        );
    } else if (currentTab === "Arcade") {
        CreateSectionTitle(list, "Game Settings");
        CreateRow(list, "Game Audio", "ENABLE_GAME_AUDIO", "toggle", null, null, null, null, "Enable sounds in arcade games.");
        CreateRow(list, "Difficulty", "GAME_DEFAULT_DIFFICULTY", "buttongroup", null, null, null, ARCADE_DEFAULT_DIFFICULTY_OPTIONS, "Default difficulty when opening games.");
        CreateRow(list, "On Death", "ENABLE_ON_DEATH_GAMES", "toggle", null, null, null, null, "Randomly opens an enabled arcade game while dead.");
        CreateSeparator(list);
        CreateSectionTitle(list, "Games");
        CreateRow(list, "Bebop Sweeper", "OPEN_MINESWEEPER", "actionbutton", null, null, null, [
            {
                label: "Play",
                onDeathCheckbox: true,
                onDeathConfigKey: "ON_DEATH_GAME_MINESWEEPER"
            }
        ], "");
        CreateRow(list, "Wraithjack", "OPEN_BLACKJACK", "actionbutton", null, null, null, [
            {
                label: "Play",
                onDeathCheckbox: true,
                onDeathConfigKey: "ON_DEATH_GAME_BLACKJACK"
            }
        ], "");
        CreateRow(list, "Flappy Bat", "OPEN_FLAPPY_BIRD", "actionbutton", null, null, null, [
            {
                label: "Play",
                onDeathCheckbox: true,
                onDeathConfigKey: "ON_DEATH_GAME_FLAPPY_BAT"
            }
        ], "");
        CreateRow(list, "Graves Trainer", "OPEN_AIM_TRAINER", "actionbutton", null, null, null, [
            {
                label: "Play",
                onDeathCheckbox: true,
                onDeathConfigKey: "ON_DEATH_GAME_GRAVES_TRAINER"
            }
        ], "");
        CreateRow(list, "Zerggy Mania", "OPEN_TRAIN_TRACKING", "actionbutton", null, null, null, [
            {
                label: "Play",
                onDeathCheckbox: true,
                onDeathConfigKey: "ON_DEATH_GAME_ZERGGY_MANIA"
            }
        ], "");
        CreateRow(list, "Whack a Rem", "OPEN_WHACK_A_REM", "actionbutton", null, null, null, [
            {
                label: "Play",
                onDeathCheckbox: true,
                onDeathConfigKey: "ON_DEATH_GAME_WHACK_A_REM"
            }
        ], "");
    } else if (currentTab === "MOG") {
        if (!gSearchCollectMode) {
            var mogNoteWrap = $.CreatePanel("Panel", list, "MogTabNoteWrap");
            mogNoteWrap.AddClass("ConsoleTabNoteWrap");
            mogNoteWrap.AddClass("MogTabNoteWrap");
            mogNoteWrap.AddClass("SupportHeroCard");
            var mogNoteTitle = $.CreatePanel("Label", mogNoteWrap, "MogTabNoteTitle");
            mogNoteTitle.AddClass("SupportTabSectionTitle");
            mogNoteTitle.AddClass("MogTabNoteTitle");
            mogNoteTitle.text = "MOGLOCK";
            var mogNoteList = $.CreatePanel("Panel", mogNoteWrap, "MogTabNoteList");
            mogNoteList.AddClass("SupportHeroBulletList");
            mogNoteList.AddClass("MogTabNoteList");
            var mogInfoRow = $.CreatePanel("Panel", mogNoteList, "");
            mogInfoRow.AddClass("SupportHeroBullet");
            mogInfoRow.AddClass("MogTabNoteBullet");
            var mogInfoMarker = $.CreatePanel("Panel", mogInfoRow, "");
            mogInfoMarker.AddClass("SupportHeroBulletMarker");
            mogInfoMarker.AddClass("MogTabNoteMarker");
            var mogNoteText = $.CreatePanel("Label", mogInfoRow, "MogTabNoteText");
            mogNoteText.AddClass("SupportTabText");
            mogNoteText.AddClass("SupportHeroBulletLabel");
            mogNoteText.AddClass("MogTabNoteText");
            mogNoteText.text = LocalizeSettingsText("MOG is Deadlock's first custom gamemode community server network.", true);
            var mogLinkRow = $.CreatePanel("Panel", mogNoteList, "");
            mogLinkRow.AddClass("SupportHeroBullet");
            mogLinkRow.AddClass("MogTabNoteBullet");
            mogLinkRow.AddClass("MogTabSiteLine");
            var mogLinkMarker = $.CreatePanel("Panel", mogLinkRow, "");
            mogLinkMarker.AddClass("SupportHeroBulletMarker");
            mogLinkMarker.AddClass("MogTabNoteMarker");
            var mogLinkContent = $.CreatePanel("Panel", mogLinkRow, "MogTabSiteLineContent");
            mogLinkContent.AddClass("MogTabSiteLineContent");
            var mogLinkPrefix = $.CreatePanel("Label", mogLinkContent, "MogTabSiteLinkPrefix");
            mogLinkPrefix.AddClass("SupportTabText");
            mogLinkPrefix.AddClass("SupportHeroBulletLabel");
            mogLinkPrefix.AddClass("MogTabSiteLinkPrefix");
            mogLinkPrefix.text = LocalizeSettingsText("Check out our site to join", true);
            var mogLinkBtn = $.CreatePanel("Button", mogLinkContent, "MogTabSiteLink");
            mogLinkBtn.AddClass("MogTabSiteLink");
            var mogLinkLbl = $.CreatePanel("Label", mogLinkBtn, "MogTabSiteLinkLabel");
            mogLinkLbl.AddClass("MogTabSiteLinkLabel");
            mogLinkLbl.text = LocalizeSettingsText("moglock.gg", true);
            mogLinkBtn.SetPanelEvent("onactivate", function() {
                $.DispatchEvent("ExternalBrowserGoToURL", "https://moglock.gg");
            });
        }
        CreateSectionTitle(list, "Gamemodes");
        CreateRow(list, "BHOP UI", "ENABLE_BHOP", "toggle", null, null, null, null, "For custom BHop gamemode UI changes.");
    } else if (currentTab === "Config") {
        RenderConfigTabContent(list);
    } else if (currentTab === "Support") {
        if (gSearchCollectMode && gSearchCollectState) {
            CreateSectionTitle(list, "Help, Contact & Support");
            CreateRow(list, "Discord", "SEARCH_TAB:Support", "actionbutton", null, null, null, [
                { label: "Open" }
            ], "Help and feedback");
            CreateRow(list, "Commission", "SEARCH_TAB:Support", "actionbutton", null, null, null, [
                { label: "Open" }
            ], "Request a custom feature or preset");
            CreateRow(list, "Change Log", "SEARCH_TAB:Support", "actionbutton", null, null, null, [
                { label: "Open" }
            ], "Latest updates and version notes");
            CreateRow(list, "Support", "SEARCH_TAB:Support", "actionbutton", null, null, null, [
                { label: "Open" }
            ], "Support the mod - donate via Ko-fi (kofi) to help fund continued development");
            CreateSectionTitle(list, "Special Thanks");
            CreateRow(list, "Contributors", "SEARCH_TAB:Support", "actionbutton", null, null, null, [
                { label: "Open" }
            ], "Community acknowledgements");
            return;
        }
        // --- Section 1: Hero / intro card ---
        var supportIntroCard = $.CreatePanel("Panel", list, "SupportIntroCard");
        supportIntroCard.AddClass("SupportTabCard");
        supportIntroCard.AddClass("SupportIntroCard");
        supportIntroCard.AddClass("SupportHeroCard");

        var supportHeroTitle = $.CreatePanel("Label", supportIntroCard, "");
        supportHeroTitle.AddClass("SupportTabSectionTitle");
        supportHeroTitle.AddClass("SupportHeroTitle");
        supportHeroTitle.text = LocalizeSettingsText("Welcome to QOL Lock", true);

        var heroBodyLines = [
            "This is a mod designed to give you complete freedom over your game.",
            "By default everything is disabled and has nearly zero performance cost.",
            "Be conscious of the features you are using and read carefully.",
            "The majority of issues are caused by improper installation or conflicting mods."
        ];
        var supportHeroBulletList = $.CreatePanel("Panel", supportIntroCard, "SupportHeroBulletList");
        supportHeroBulletList.AddClass("SupportHeroBulletList");
        for (var heroLineIdx = 0; heroLineIdx < heroBodyLines.length; heroLineIdx++) {
            var bulletRow = $.CreatePanel("Panel", supportHeroBulletList, "");
            bulletRow.AddClass("SupportHeroBullet");
            var marker = $.CreatePanel("Panel", bulletRow, "");
            marker.AddClass("SupportHeroBulletMarker");
            var bulletLabel = $.CreatePanel("Label", bulletRow, "");
            bulletLabel.AddClass("SupportTabText");
            bulletLabel.AddClass("SupportHeroBulletLabel");
            var heroLineText = LocalizeSettingsText(heroBodyLines[heroLineIdx], true);
            bulletLabel.text = (heroLineText && heroLineText.endsWith(".")) ? heroLineText.slice(0, -1) : heroLineText;
        }

        // --- Section 2: Help, Contact & Support CTA grid (merged) ---
        var supportCtaSection = $.CreatePanel("Panel", list, "SupportCtaSection");
        supportCtaSection.AddClass("SupportTabCard");
        supportCtaSection.AddClass("SupportCtaCard");

        var supportCtaSectionTitle = $.CreatePanel("Label", supportCtaSection, "");
        supportCtaSectionTitle.AddClass("SupportTabSectionTitle");
        supportCtaSectionTitle.AddClass("SupportCtaSectionTitle");
        supportCtaSectionTitle.text = LocalizeSettingsText("Help, Contact & Support", true);

        var supportCtaGrid = $.CreatePanel("Panel", supportCtaSection, "SupportCtaGrid");
        supportCtaGrid.AddClass("SupportCtaGrid");

        var ctaDefs = [
            {
                id: "SupportCtaSupportBtn",
                title: "Support",
                hint: "Help fund continued development",
                iconSrc: "s2r://panorama/images/icons/icon_thumbsup.vsvg",
                primary: true,
                onactivate: function() { $.DispatchEvent("ExternalBrowserGoToURL", "https://ko-fi.com/civocivocivo"); }
            },
            {
                id: "SupportCtaDiscordBtn",
                title: "Discord",
                hint: "Help, feedback, and community",
                iconSrc: "s2r://panorama/images/qollock/discord_logo_png.vtex",
                iconClass: "SupportCtaBtnIconDiscord",
                onactivate: function() { $.DispatchEvent("ExternalBrowserGoToURL", "https://discord.gg/npCvuMcTY7"); }
            },
            {
                id: "SupportCtaCommissionBtn",
                title: "Commission",
                hint: "Request a custom feature or preset",
                iconSrc: "s2r://panorama/images/icons/icon_feedback.vsvg",
                onactivate: function() { $.DispatchEvent("ExternalBrowserGoToURL", "https://ko-fi.com/civocivocivo/commissions"); }
            },
            {
                id: "SupportCtaChangeLogBtn",
                title: "Change Log",
                hint: "Latest updates and version notes",
                iconSrc: "s2r://panorama/images/icons/icon_refresh.vsvg",
                onactivate: function() { $.DispatchEvent("ExternalBrowserGoToURL", "https://gamebanana.com/mods/updates/650634"); }
            }
        ];

        for (var ctaIdx = 0; ctaIdx < ctaDefs.length; ctaIdx += 2) {
            var ctaRow = $.CreatePanel("Panel", supportCtaGrid, "");
            ctaRow.AddClass("SupportCtaRow");

            for (var ctaColumn = 0; ctaColumn < 2 && (ctaIdx + ctaColumn) < ctaDefs.length; ctaColumn++) {
                if (ctaColumn > 0) {
                    var ctaGap = $.CreatePanel("Panel", ctaRow, "");
                    ctaGap.AddClass("SupportCtaRowGap");
                }

                (function(def) {
                    var ctaSlot = $.CreatePanel("Panel", ctaRow, "");
                    ctaSlot.AddClass("SupportCtaBtnSlot");

                    var ctaBtn = $.CreatePanel("Button", ctaSlot, def.id);
                    ctaBtn.AddClass("SupportCtaBtn");
                    ctaBtn.AddClass("SupportCtaGridBtn");
                    if (def.primary) ctaBtn.AddClass("SupportCtaBtnPrimary");

                    var ctaContent = $.CreatePanel("Panel", ctaBtn, "");
                    ctaContent.AddClass("SupportCtaBtnContent");

                    var ctaBtnIcon = $.CreatePanel("Image", ctaContent, "");
                    ctaBtnIcon.AddClass("SupportCtaBtnIcon");
                    if (def.iconClass) ctaBtnIcon.AddClass(def.iconClass);
                    if (def.iconSrc) {
                        try { ctaBtnIcon.SetImage(def.iconSrc); } catch(eSupportIcon) { WarnLog("settings", "op failed: " + (eSupportIcon && eSupportIcon.message ? eSupportIcon.message : String(eSupportIcon || ""))); }
                    }

                    var ctaText = $.CreatePanel("Panel", ctaContent, "");
                    ctaText.AddClass("SupportCtaBtnText");

                    var ctaBtnTitle = $.CreatePanel("Label", ctaText, "");
                    ctaBtnTitle.AddClass("SupportCtaBtnTitle");
                    ctaBtnTitle.text = LocalizeSettingsText(def.title, true);

                    var ctaBtnHint = $.CreatePanel("Label", ctaText, "");
                    ctaBtnHint.AddClass("SupportCtaBtnHint");
                    ctaBtnHint.text = LocalizeSettingsText(def.hint, true);

                    ctaBtn.SetPanelEvent("onactivate", def.onactivate);
                })(ctaDefs[ctaIdx + ctaColumn]);
            }
        }

        // --- Section 3: Community / Special Thanks ---
        var supportThanksBlock = $.CreatePanel("Panel", list, "SupportTabThanksBlock");
        supportThanksBlock.AddClass("SupportTabThanksBlock");
        supportThanksBlock.AddClass("SupportTabCard");
        var supportThanksTitle = $.CreatePanel("Label", supportThanksBlock, "");
        supportThanksTitle.AddClass("SupportTabSectionTitle");
        supportThanksTitle.text = LocalizeSettingsText("Credits", true);
        var supportThanksRule = $.CreatePanel("Panel", supportThanksBlock, "");
        supportThanksRule.AddClass("SupportThanksRule");

        var supportThanksContributorEntries = [
            { label: "Civo", role: "Contributor", url: "https://ko-fi.com/civocivocivo" },
            { label: "Bytenode", role: "Contributor", url: "https://gamebanana.com/members/5222690" },
            { label: "BreadRollius", role: "Contributor", url: "https://gamebanana.com/members/4296197" },
            { label: "Bonclide", role: "Contributor", url: "https://gamebanana.com/members/2408486" },
            { label: "Hanturaya", role: "Contributor", url: "https://gamebanana.com/members/4577138" },
            { label: "Predi_i", role: "Contributor", url: "https://gamebanana.com/members/5107678" },
            { label: "RizoBoy", role: "Contributor", url: "https://gamebanana.com/members/4436032" },
            { label: "Klutzz", role: "Contributor", url: "https://gamebanana.com/members/4745216" },
            { label: "ArkanoidVFX", role: "Contributor", url: "https://gamebanana.com/members/1359230" },
            { label: "Goblin Man Sam", role: "Contributor", url: "https://gamebanana.com/members/4762321" },
            { label: "NinjabladeJR", role: "Contributor", url: "https://gamebanana.com/members/4779465" },
            { label: "Mikoboy", role: "Contributor", url: "https://gamebanana.com/members/2814130" },
            { label: "Wouwei", role: "Contributor", url: "https://gamebanana.com/members/4788864" },
            { label: "Mo_Difier", role: "Contributor", url: "https://gamebanana.com/members/4795931" },
            { label: "Flameblast12", role: "Contributor", url: "https://gamebanana.com/members/4789815" },
            { label: "Fascilux", role: "Contributor", url: "https://gamebanana.com/members/4690723" },
            { label: "Karma", role: "Contributor" },
            { label: "Somarotsaway", role: "Contributor", url: "https://gamebanana.com/members/3961199" },
            { label: "EmilyVasquez", role: "Contributor", url: "https://gamebanana.com/members/1383839" },
            { label: "gfkm", role: "Contributor", url: "https://gamebanana.com/members/5349748" },
            { label: "Aminsx", role: "Contributor", url: "https://gamebanana.com/members/4798159" },
            { label: "oGeorge", role: "Contributor", url: "https://gamebanana.com/members/5260464" },
            { label: "Lustie", role: "Contributor", url: "https://gamebanana.com/mods/655927" },
            { label: "0xluc4s", role: "Contributor", url: "https://gamebanana.com/members/5229080" }
        ];
        var supportThanksTranslatorEntries = [
            { label: "QuicklyRemove", role: "Translator", iconSrc: "s2r://panorama/images/qollock/chinese_png.vtex" },
            { label: "Gyzeh", role: "Translator", iconSrc: "s2r://panorama/images/qollock/french_png.vtex" },
            { label: "Theran", role: "Translator", iconSrc: "s2r://panorama/images/qollock/brazil_png.vtex" },
            { label: "Milorime", role: "Translator", iconSrc: "s2r://panorama/images/qollock/spanish_png.vtex" },
            { label: "des_", role: "Translator", iconSrc: "s2r://panorama/images/qollock/russian_png.vtex", breakBefore: true },
            { label: "Данон", role: "Translator", iconSrc: "s2r://panorama/images/qollock/belarus_png.vtex" },
            { label: "Cactus330", role: "Translator", iconSrc: "s2r://panorama/images/qollock/poland_png.vtex" },
            { label: "MBG Records", role: "Translator", iconSrc: "s2r://panorama/images/qollock/turkish_png.vtex" },
            { label: "flameblast12", role: "Translator", iconSrc: "s2r://panorama/images/qollock/korean_png.vtex" }
        ];
        CreateSupportThanksGroup(supportThanksBlock, "Contributors", supportThanksContributorEntries, 6, "SupportThanksGroupContributor");
        CreateSupportThanksGroup(supportThanksBlock, "Translators", supportThanksTranslatorEntries, 6, "SupportThanksGroupTranslator");
    }
}

var UpdateListContent = function(list, forceRebuild) {
    if (!list || !list.IsValid()) return;
    HideSettingsRowFloatingTooltip();
    CloseOpenSettingsDropdowns($.GetContextPanel(), { skipFocusTransfer: true });
    var shouldForce = (forceRebuild === true);
    var leavingSearchMode = false;
    var renderSig = BuildSettingsListRenderSignature();
    var searchActive = IsSettingsSearchActiveQuery();
    SetActiveSettingsListRenderSignature(renderSig);

    if (searchActive) {
        RenderSettingsSearchResultsOnly(list);
        gSettingsListLastRenderSig = renderSig;
        return;
    }

    if (gSettingsListSearchModeActive) {
        shouldForce = true;
        gSettingsListSearchModeActive = false;
        leavingSearchMode = true;
    }

    if (!shouldForce && renderSig === gSettingsListLastRenderSig) {
        ShowSettingsListTabPanel(list, renderSig);
        SoftRefreshSettingsListContent(list);
        return;
    }

    var shouldRebuildCurrentSig = shouldForce && !leavingSearchMode;
    var panelEntry = EnsureSettingsListContentPanelForSignature(list, renderSig, shouldRebuildCurrentSig);
    var contentPanel = panelEntry ? panelEntry.panel : null;
    var contentCreated = panelEntry ? (panelEntry.created === true) : false;
    if (!contentPanel || !contentPanel.IsValid || !contentPanel.IsValid()) return;

    ShowSettingsListTabPanel(list, renderSig);

    if (contentCreated || shouldRebuildCurrentSig) {
        HideMinimapSizePreview();
        ResetSettingsListRowSyncRegistry();
        contentPanel.RemoveAndDeleteChildren();
        RenderCurrentTabContent(contentPanel);
    } else {
        SoftRefreshSettingsListContent(list);
    }

    gSettingsListLastRenderSig = renderSig;
    QueueActivePresetHighlightRefresh(0.02);
};

function EnsurePreviewToggleButtonContent(btn) {
    if (!btn) return;
    btn.hittest = true;
    btn.hittestchildren = true;
    var hasSwitch = !!btn.FindChildTraverse("PreviewToggleSwitch");
    var hasLabel = !!btn.FindChildTraverse("PreviewToggleLabel");
    if (!hasSwitch || !hasLabel) {
        btn.RemoveAndDeleteChildren();
        var switchPanel = $.CreatePanel("Panel", btn, "PreviewToggleSwitch");
        switchPanel.AddClass("PreviewToggleSwitch");
        switchPanel.hittest = false;
        switchPanel.hittestchildren = false;
        var switchKnob = $.CreatePanel("Panel", switchPanel, "PreviewToggleSwitchKnob");
        switchKnob.AddClass("PreviewToggleSwitchKnob");
        switchKnob.hittest = false;
        switchKnob.hittestchildren = false;
        var label = $.CreatePanel("Label", btn, "PreviewToggleLabel");
        label.text = LocalizeSettingsText("Preview", true);
        label.hittest = false;
        return;
    }
    var switchPanelExisting = btn.FindChildTraverse("PreviewToggleSwitch");
    if (switchPanelExisting) {
        switchPanelExisting.hittest = false;
        switchPanelExisting.hittestchildren = false;
    }
    var switchKnobExisting = btn.FindChildTraverse("PreviewToggleSwitchKnob");
    if (switchKnobExisting) {
        switchKnobExisting.hittest = false;
        switchKnobExisting.hittestchildren = false;
    }
    var labelExisting = btn.FindChildTraverse("PreviewToggleLabel");
    if (labelExisting) {
        labelExisting.text = LocalizeSettingsText("Preview", true);
        labelExisting.hittest = false;
    }
}

function WirePreviewToggleButton(btn) {
    if (!btn) return;
    EnsurePreviewToggleButtonContent(btn);
    btn.SetHasClass("Active", MOD_CONFIG.PREVIEWS_ENABLED === 1);
    btn.SetPanelEvent("onmouseover", function() {
        $.DispatchEvent("UIShowTextTooltip", btn, LocalizeSettingsText("Preview setting changes in realtime.", true));
    });
    btn.SetPanelEvent("onmouseout", function() {
        $.DispatchEvent("UIHideTextTooltip");
    });
    btn.SetPanelEvent("onactivate", function() {
        MOD_CONFIG.PREVIEWS_ENABLED = (MOD_CONFIG.PREVIEWS_ENABLED === 1 ? 0 : 1);
        btn.SetHasClass("Active", MOD_CONFIG.PREVIEWS_ENABLED === 1);
        if (MOD_CONFIG.PREVIEWS_ENABLED !== 1) {
            HideMinimapSizePreview();
        }
        SaveAndSync();
    });
}

function EnsureDragToggleButtonContent(btn) {
    if (!btn) return;
    btn.hittest = true;
    btn.hittestchildren = true;
    var hasSwitch = !!btn.FindChildTraverse("DragToggleSwitch");
    var hasLabel = !!btn.FindChildTraverse("DragToggleLabel");
    if (!hasSwitch || !hasLabel) {
        btn.RemoveAndDeleteChildren();
        var switchPanel = $.CreatePanel("Panel", btn, "DragToggleSwitch");
        switchPanel.AddClass("DragToggleSwitch");
        switchPanel.hittest = false;
        switchPanel.hittestchildren = false;
        var switchKnob = $.CreatePanel("Panel", switchPanel, "DragToggleSwitchKnob");
        switchKnob.AddClass("DragToggleSwitchKnob");
        switchKnob.hittest = false;
        switchKnob.hittestchildren = false;
        var label = $.CreatePanel("Label", btn, "DragToggleLabel");
        label.text = LocalizeSettingsText("Drag", true);
        label.hittest = false;
        return;
    }
    var switchPanelExisting = btn.FindChildTraverse("DragToggleSwitch");
    if (switchPanelExisting) {
        switchPanelExisting.hittest = false;
        switchPanelExisting.hittestchildren = false;
    }
    var switchKnobExisting = btn.FindChildTraverse("DragToggleSwitchKnob");
    if (switchKnobExisting) {
        switchKnobExisting.hittest = false;
        switchKnobExisting.hittestchildren = false;
    }
    var labelExisting = btn.FindChildTraverse("DragToggleLabel");
    if (labelExisting) {
        labelExisting.text = LocalizeSettingsText("Drag", true);
        labelExisting.hittest = false;
    }
}

var gSettingsDragHandlePanel = null;
var gSettingsDragHandlePanelRight = null;
var gSettingsDragParentPanel = null;
var gSettingsDragHandlersBound = false;
var gSettingsDragHandlersBoundRight = false;

function EnsureSettingsHeaderDragHandle(headerPanel) {
    if (!headerPanel || !headerPanel.IsValid || !headerPanel.IsValid()) return null;
    var dragHandleLeft = headerPanel.FindChildTraverse("SettingsHeaderDragAreaLeft");
    if (!dragHandleLeft) {
        dragHandleLeft = $.CreatePanel("Panel", headerPanel, "SettingsHeaderDragAreaLeft");
    }
    dragHandleLeft.AddClass("SettingsHeaderDragArea");

    var dragHandleRight = headerPanel.FindChildTraverse("SettingsHeaderDragAreaRight");
    if (!dragHandleRight) {
        dragHandleRight = $.CreatePanel("Panel", headerPanel, "SettingsHeaderDragAreaRight");
    }
    dragHandleRight.AddClass("SettingsHeaderDragArea");

    var legacyDragHandle = headerPanel.FindChildTraverse("SettingsHeaderDragArea");
    if (legacyDragHandle && legacyDragHandle !== dragHandleLeft && legacyDragHandle !== dragHandleRight) {
        legacyDragHandle.DeleteAsync(0);
    }

    var closeBtn = headerPanel.FindChildTraverse("CloseBtn");
    if (closeBtn) {
        headerPanel.MoveChildBefore(dragHandleLeft, closeBtn);
        headerPanel.MoveChildBefore(dragHandleRight, closeBtn);
    }
    return {
        left: dragHandleLeft,
        right: dragHandleRight
    };
}

function GetPanelXOffsetWithinAncestor(panel, ancestor) {
    if (!panel || !panel.IsValid || !panel.IsValid()) return null;
    if (!ancestor || !ancestor.IsValid || !ancestor.IsValid()) return null;
    var total = 0;
    var node = panel;
    var guard = 0;
    while (node && node.IsValid && node.IsValid() && guard < 48) {
        if (node === ancestor) return total;
        var offsetX = Number(node.actualxoffset);
        if (isFinite(offsetX)) total += offsetX;
        if (!node.GetParent) break;
        var parentNode = node.GetParent();
        if (parentNode && parentNode.IsValid && parentNode.IsValid()) {
            var scrollX = 0;
            var hasScrollX = false;
            try {
                var sx0 = Number(parentNode.scrolloffset_x);
                if (isFinite(sx0)) { scrollX = sx0; hasScrollX = true; }
            } catch(eSx0) { WarnLog("settings", "op failed: " + (eSx0 && eSx0.message ? eSx0.message : String(eSx0 || ""))); }
            if (!hasScrollX) {
                try {
                    var sx1 = Number(parentNode.scrolloffsetX);
                    if (isFinite(sx1)) { scrollX = sx1; hasScrollX = true; }
                } catch(eSx1) { WarnLog("settings", "op failed: " + (eSx1 && eSx1.message ? eSx1.message : String(eSx1 || ""))); }
            }
            if (!hasScrollX) {
                try {
                    var sx2 = Number(parentNode.ScrollOffsetX);
                    if (isFinite(sx2)) { scrollX = sx2; hasScrollX = true; }
                } catch(eSx2) { WarnLog("settings", "op failed: " + (eSx2 && eSx2.message ? eSx2.message : String(eSx2 || ""))); }
            }
            if (!hasScrollX) {
                try {
                    if (typeof parentNode.GetScrollOffset === "function") {
                        var so = parentNode.GetScrollOffset();
                        if (so && so.length >= 1) {
                            var sx3 = Number(so[0]);
                            if (isFinite(sx3)) { scrollX = sx3; hasScrollX = true; }
                        }
                    }
                } catch(eSx3) { WarnLog("settings", "op failed: " + (eSx3 && eSx3.message ? eSx3.message : String(eSx3 || ""))); }
            }
            if (hasScrollX && isFinite(scrollX) && scrollX !== 0) total += scrollX;
        }
        node = parentNode;
        guard++;
    }
    return null;
}

function GetPanelYOffsetWithinAncestor(panel, ancestor) {
    if (!panel || !panel.IsValid || !panel.IsValid()) return null;
    if (!ancestor || !ancestor.IsValid || !ancestor.IsValid()) return null;
    var total = 0;
    var node = panel;
    var guard = 0;
    while (node && node.IsValid && node.IsValid() && guard < 48) {
        if (node === ancestor) return total;
        var offsetY = Number(node.actualyoffset);
        if (isFinite(offsetY)) total += offsetY;
        if (!node.GetParent) break;
        var parentNode = node.GetParent();
        if (parentNode && parentNode.IsValid && parentNode.IsValid()) {
            var scrollY = 0;
            var hasScrollY = false;
            try {
                var sy0 = Number(parentNode.scrolloffset_y);
                if (isFinite(sy0)) { scrollY = sy0; hasScrollY = true; }
            } catch(eSy0) { WarnLog("settings", "op failed: " + (eSy0 && eSy0.message ? eSy0.message : String(eSy0 || ""))); }
            if (!hasScrollY) {
                try {
                    var sy1 = Number(parentNode.scrolloffsetY);
                    if (isFinite(sy1)) { scrollY = sy1; hasScrollY = true; }
                } catch(eSy1) { WarnLog("settings", "op failed: " + (eSy1 && eSy1.message ? eSy1.message : String(eSy1 || ""))); }
            }
            if (!hasScrollY) {
                try {
                    var sy2 = Number(parentNode.ScrollOffsetY);
                    if (isFinite(sy2)) { scrollY = sy2; hasScrollY = true; }
                } catch(eSy2) { WarnLog("settings", "op failed: " + (eSy2 && eSy2.message ? eSy2.message : String(eSy2 || ""))); }
            }
            if (!hasScrollY) {
                try {
                    if (typeof parentNode.GetScrollOffset === "function") {
                        var so = parentNode.GetScrollOffset();
                        if (so && so.length >= 2) {
                            var sy3 = Number(so[1]);
                            if (isFinite(sy3)) { scrollY = sy3; hasScrollY = true; }
                        }
                    }
                } catch(eSy3) { WarnLog("settings", "op failed: " + (eSy3 && eSy3.message ? eSy3.message : String(eSy3 || ""))); }
            }
            if (hasScrollY && isFinite(scrollY) && scrollY !== 0) total += scrollY;
        }
        node = parentNode;
        guard++;
    }
    return null;
}

function UpdateSettingsHeaderDragAreaBounds(headerPanel, dragHandleLeft, dragHandleRight) {
    if (!headerPanel || !dragHandleLeft || !dragHandleRight) return;
    if (!dragHandleLeft.style || !dragHandleRight.style) return;

    var headerWidth = Number(headerPanel.actuallayoutwidth);
    if (!isFinite(headerWidth) || headerWidth < 200 || headerWidth > 4000) headerWidth = 720;

    var closeBtn = null;
    try { closeBtn = headerPanel.FindChildTraverse("CloseBtn"); } catch (eClose0) { closeBtn = null; }

    var closeLeft = headerWidth - 50;
    if (closeBtn && closeBtn.IsValid && closeBtn.IsValid()) {
        var closeX = GetPanelXOffsetWithinAncestor(closeBtn, headerPanel);
        if (isFinite(closeX) && closeX >= 0 && closeX <= headerWidth) {
            closeLeft = closeX;
        }
    }

    var interactiveLeft = -1;
    var interactiveRight = -1;
    var searchWrap = null;
    try { searchWrap = headerPanel.FindChildTraverse("SettingsSearchWrap"); } catch (e0) { searchWrap = null; }
    if (searchWrap && searchWrap.IsValid && searchWrap.IsValid()) {
        var searchX = GetPanelXOffsetWithinAncestor(searchWrap, headerPanel);
        var searchW = Number(searchWrap.actuallayoutwidth);
        if (isFinite(searchX) && searchX >= 0 && searchX <= headerWidth && isFinite(searchW) && searchW > 20 && searchW <= headerWidth) {
            interactiveLeft = searchX;
            interactiveRight = searchX + searchW;
        }
    }

    var headerLink = null;
    try { headerLink = headerPanel.FindChildTraverse("ModVersionLabelTop"); } catch (eHeaderLink0) { headerLink = null; }
    if (headerLink && headerLink.IsValid && headerLink.IsValid()) {
        var linkX = GetPanelXOffsetWithinAncestor(headerLink, headerPanel);
        var linkW = Number(headerLink.actuallayoutwidth);
        if (isFinite(linkX) && linkX >= 0 && linkX <= headerWidth && isFinite(linkW) && linkW > 20 && linkW <= headerWidth) {
            if (interactiveLeft < 0 || linkX < interactiveLeft) interactiveLeft = linkX;
            var linkRight = linkX + linkW;
            if (interactiveRight < 0 || linkRight > interactiveRight) interactiveRight = linkRight;
        }
    }

    var gapPx = 14;
    var leftWidth = 0;
    var rightX = 0;
    var rightWidth = 0;
    if (interactiveLeft >= 0 && interactiveRight > interactiveLeft) {
        leftWidth = Math.max(0, Math.floor(interactiveLeft - gapPx));
        rightX = Math.min(headerWidth, Math.floor(interactiveRight + gapPx));
        var rightEnd = Math.max(rightX, Math.floor(closeLeft - 8));
        rightWidth = Math.max(0, rightEnd - rightX);
    } else {
        leftWidth = Math.max(0, Math.floor(closeLeft - 8));
        rightX = leftWidth;
        rightWidth = 0;
    }

    dragHandleLeft.style.x = "0px";
    dragHandleLeft.style.width = String(leftWidth) + "px";
    dragHandleLeft.style.marginRight = "0px";
    dragHandleLeft.style.zIndex = "1";

    dragHandleRight.style.x = String(rightX) + "px";
    dragHandleRight.style.width = String(rightWidth) + "px";
    dragHandleRight.style.marginRight = "0px";
    dragHandleRight.style.zIndex = "1";
}

function SetupSettingsWindowDragging(headerPanel, dragPanel) {
    if (!headerPanel || !dragPanel) return;
    var handles = EnsureSettingsHeaderDragHandle(headerPanel);
    if (!handles || !handles.left || !handles.right) return;
    var handlePanel = handles.left;
    var handlePanelRight = handles.right;
    var updateDragBounds = function() {
        if (!headerPanel || !headerPanel.IsValid || !headerPanel.IsValid()) return;
        if (!handlePanel || !handlePanel.IsValid || !handlePanel.IsValid()) return;
        if (!handlePanelRight || !handlePanelRight.IsValid || !handlePanelRight.IsValid()) return;
        UpdateSettingsHeaderDragAreaBounds(headerPanel, handlePanel, handlePanelRight);
    };
    updateDragBounds();
    $.Schedule(0.0, updateDragBounds);
    $.Schedule(0.03, updateDragBounds);
    $.Schedule(0.12, updateDragBounds);

    if (!gSettingsDragParentPanel || !gSettingsDragParentPanel.IsValid || !gSettingsDragParentPanel.IsValid()) {
        gSettingsDragParentPanel = dragPanel.GetParent ? dragPanel.GetParent() : null;
    }

    handlePanel.SetDraggable(MOD_CONFIG.DRAG_ENABLED === 1);
    handlePanelRight.SetDraggable(MOD_CONFIG.DRAG_ENABLED === 1);

    if (
        gSettingsDragHandlePanel &&
        gSettingsDragHandlePanel !== handlePanel &&
        gSettingsDragHandlePanel.IsValid &&
        gSettingsDragHandlePanel.IsValid()
    ) {
        gSettingsDragHandlePanel.SetDraggable(false);
    }
    if (
        gSettingsDragHandlePanelRight &&
        gSettingsDragHandlePanelRight !== handlePanelRight &&
        gSettingsDragHandlePanelRight.IsValid &&
        gSettingsDragHandlePanelRight.IsValid()
    ) {
        gSettingsDragHandlePanelRight.SetDraggable(false);
    }

    if (gSettingsDragHandlePanel !== handlePanel) {
        gSettingsDragHandlersBound = false;
    }

    if (!gSettingsDragHandlersBound) {
        $.RegisterEventHandler("DragStart", handlePanel, function(panel, dragEvent) {
            if (MOD_CONFIG.DRAG_ENABLED !== 1) return;
            if (!dragPanel || !dragPanel.IsValid || !dragPanel.IsValid()) return;
            dragEvent.displayPanel = dragPanel;
            dragEvent.removePositionBeforeDrop = false;
            dragPanel.style.align = "left top";
        });

        $.RegisterEventHandler("DragEnd", handlePanel, function(_panel, droppedPanel) {
            if (!droppedPanel || !droppedPanel.IsValid || !droppedPanel.IsValid()) return;
            if (gSettingsDragParentPanel && gSettingsDragParentPanel.IsValid && gSettingsDragParentPanel.IsValid()) {
                droppedPanel.SetParent(gSettingsDragParentPanel);
            }
            droppedPanel.style.align = "left top";
        });
        gSettingsDragHandlersBound = true;
    }

    if (!gSettingsDragHandlersBoundRight) {
        $.RegisterEventHandler("DragStart", handlePanelRight, function(panel, dragEvent) {
            if (MOD_CONFIG.DRAG_ENABLED !== 1) return;
            if (!dragPanel || !dragPanel.IsValid || !dragPanel.IsValid()) return;
            dragEvent.displayPanel = dragPanel;
            dragEvent.removePositionBeforeDrop = false;
            dragPanel.style.align = "left top";
        });

        $.RegisterEventHandler("DragEnd", handlePanelRight, function(_panel, droppedPanel) {
            if (!droppedPanel || !droppedPanel.IsValid || !droppedPanel.IsValid()) return;
            if (gSettingsDragParentPanel && gSettingsDragParentPanel.IsValid && gSettingsDragParentPanel.IsValid()) {
                droppedPanel.SetParent(gSettingsDragParentPanel);
            }
            droppedPanel.style.align = "left top";
        });
        gSettingsDragHandlersBoundRight = true;
    }

    gSettingsDragHandlePanel = handlePanel;
    gSettingsDragHandlePanelRight = handlePanelRight;
}

function WireDragToggleButton(btn, win) {
    if (!btn) return;
    EnsureDragToggleButtonContent(btn);
    var targetWin = win;
    if (!targetWin || !targetWin.IsValid || !targetWin.IsValid()) {
        targetWin = $.GetContextPanel().FindChildTraverse("SettingsWindow");
    }
    btn.SetHasClass("Active", MOD_CONFIG.DRAG_ENABLED === 1);
    btn.SetPanelEvent("onmouseover", function() {
        $.DispatchEvent("UIShowTextTooltip", btn, LocalizeSettingsText("Allows you to drag move some menus.", true));
    });
    btn.SetPanelEvent("onmouseout", function() {
        $.DispatchEvent("UIHideTextTooltip");
    });
    btn.SetPanelEvent("onactivate", function() {
        MOD_CONFIG.DRAG_ENABLED = (MOD_CONFIG.DRAG_ENABLED === 1 ? 0 : 1);
        btn.SetHasClass("Active", MOD_CONFIG.DRAG_ENABLED === 1);
        if (!targetWin || !targetWin.IsValid || !targetWin.IsValid()) {
            targetWin = $.GetContextPanel().FindChildTraverse("SettingsWindow");
        }
        if (targetWin && targetWin.IsValid && targetWin.IsValid()) {
            SetupSettingsWindowDragging(targetWin.FindChildTraverse("SettingsHeader"), targetWin);
        }
        SaveAndSync();
    });
}

$.BuildUI = function() {
    var win = $.GetContextPanel().FindChildTraverse("SettingsWindow");
    var list = $.GetContextPanel().FindChildTraverse("SettingsList");
    var body = $.GetContextPanel().FindChildTraverse("SettingsBody");
    if (!list || !win) return;
    SyncConfigFromStorage();
    var tabHost = body || win;
    win.SetPanelEvent("oncancel", function() {
        $.ForceCloseModSettings();
    });
    if (currentTab === "Layout") currentTab = "Overlay";
    if (currentTab === "Main") currentTab = "Presets";
    if (currentTab === "HUDControls") currentTab = "UI";
    var tabBar = tabHost.FindChildTraverse("SettingsTabBar");
    if (tabBar) {
        var hasLegacyLayoutTab = tabBar.FindChildTraverse("TabButton_Layout");
        var hasLegacyMainTab = tabBar.FindChildTraverse("TabButton_Main");
        var hasPresetsTab = tabBar.FindChildTraverse("TabButton_Presets");
        var hasCrosshairTab = tabBar.FindChildTraverse("TabButton_Crosshair");
        var hasHealthbarTab = tabBar.FindChildTraverse("TabButton_Healthbar");
        var hasHudTab = tabBar.FindChildTraverse("TabButton_HUD");
        var hasUiTab = tabBar.FindChildTraverse("TabButton_UI");
        var hasOverlayTab = tabBar.FindChildTraverse("TabButton_Overlay");
        var hasMinimapTab = tabBar.FindChildTraverse("TabButton_Minimap");
        var hasAudioTab = tabBar.FindChildTraverse("TabButton_Audio");
        var hasConfigTab = tabBar.FindChildTraverse("TabButton_Config");
        if (hasLegacyLayoutTab || hasLegacyMainTab || !hasPresetsTab || !hasCrosshairTab || !hasHealthbarTab || !hasHudTab || !hasUiTab || !hasOverlayTab || !hasMinimapTab || !hasAudioTab || !hasConfigTab) {
            tabBar.DeleteAsync(0);
            tabBar = null;
        }
    }
    var tabListHost = null;
    var contentHost = tabHost.FindChildTraverse("SettingsContentHost");
    if (!contentHost) {
        contentHost = $.CreatePanel("Panel", tabHost, "SettingsContentHost");
    }
    if (list.GetParent && list.GetParent() !== contentHost) {
        list.SetParent(contentHost);
    }

    if (!tabBar) {
        var staleTabBar = win.FindChildTraverse("SettingsTabBar");
        if (staleTabBar && staleTabBar.GetParent && staleTabBar.GetParent() !== tabHost) {
            staleTabBar.DeleteAsync(0);
        }
        tabBar = $.CreatePanel("Panel", tabHost, "SettingsTabBar");
    }
    tabHost.MoveChildBefore(tabBar, contentHost);

    var legacySearchWrap = tabBar.FindChildTraverse("SettingsSearchWrap");
    if (legacySearchWrap) legacySearchWrap.DeleteAsync(0);
    var legacyActions = tabBar.FindChildTraverse("SettingsTabRailActions");
    if (legacyActions) legacyActions.DeleteAsync(0);
    var legacySpacer = tabBar.FindChildTraverse("SettingsTabRailSpacer");
    if (legacySpacer) legacySpacer.DeleteAsync(0);

    tabListHost = tabBar.FindChildTraverse("SettingsTabRailTabs");
    if (!tabListHost) {
        tabListHost = $.CreatePanel("Panel", tabBar, "SettingsTabRailTabs");
    }

    if (typeof tabListHost.RemoveAndDeleteChildren === "function") {
        tabListHost.RemoveAndDeleteChildren();
    }

    var tabGroups = GetSettingsTabGroups();
    for (var gi = 0; gi < tabGroups.length; gi++) {
        var group = tabGroups[gi];
        var groupPanel = $.CreatePanel("Panel", tabListHost, "SettingsTabRailGroup_" + group.title.replace(" ", ""));
        groupPanel.AddClass("SettingsTabRailGroup");
        var groupLabel = $.CreatePanel("Label", groupPanel, "");
        groupLabel.AddClass("SettingsTabRailGroupLabel");
        groupLabel.text = LocalizeSettingsText(group.title, true);
        var groupRule = $.CreatePanel("Panel", groupPanel, "");
        groupRule.AddClass("SettingsTabRailGroupRule");

        var groupTabs = $.CreatePanel("Panel", groupPanel, "");
        groupTabs.AddClass("SettingsTabRailGroupTabs");

        for (var ti = 0; ti < group.tabs.length; ti++) {
            (function(catName) {
                var tabClassSuffix = String(catName || "").replace(/[^A-Za-z0-9]/g, "");
                var tabId = "TabButton_" + catName.replace(" ", "");
                var tab = $.CreatePanel("Button", groupTabs, tabId);
                tab.AddClass("TabItem");
                tab.AddClass("TabItem_" + tabClassSuffix);
                var tabIconSrc = GetSettingsTabIconSource(catName);
                if (tabIconSrc) {
                    var tabIcon = $.CreatePanel("Image", tab, "TabIcon", {
                        src: tabIconSrc,
                        defaultsrc: "",
                        scaling: "contain"
                    });
                    tabIcon.AddClass("TabIcon");
                    tabIcon.AddClass("TabIcon_" + tabClassSuffix);
                }
                var tabLbl = $.CreatePanel("Label", tab, "TabLabel");
                var displayName = GetSettingsTabDisplayName(catName);
                // Localize every tab name, including Config ("Settings"). Proper nouns
                // not present in the translation map (e.g. MOGLOCK) pass through unchanged.
                tabLbl.text = LocalizeSettingsText(displayName, true);
                tab.SetHasClass("Active", catName === currentTab);
                tab.SetPanelEvent("onactivate", function() {
                    SetActiveTabAndRefresh(catName);
                });
            })(group.tabs[ti]);
        }
    }
    var tabSpacerMain = tabBar.FindChildTraverse("SettingsTabRailSpacerMain");
    if (!tabSpacerMain) {
        tabSpacerMain = $.CreatePanel("Panel", tabBar, "SettingsTabRailSpacerMain");
    }
    tabSpacerMain.AddClass("SettingsTabRailSpacerMain");

    var tabFooter = tabBar.FindChildTraverse("SettingsTabRailFooter");
    if (!tabFooter) {
        tabFooter = $.CreatePanel("Panel", tabBar, "SettingsTabRailFooter");
    }
    tabFooter.AddClass("SettingsTabRailFooter");
    var footerRule = tabFooter.FindChildTraverse("SettingsTabRailFooterRule");
    if (!footerRule) {
        footerRule = $.CreatePanel("Panel", tabFooter, "SettingsTabRailFooterRule");
    }
    footerRule.AddClass("SettingsTabRailFooterRule");

    var isRuFooter = IsRussianSettingsLanguage();
    var newsFooterBtn = tabFooter.FindChildTraverse("FooterNewsLinkButton");
    if (newsFooterBtn) {
        newsFooterBtn.DeleteAsync(0);
        newsFooterBtn = null;
    }

    var saveFooterBtn = tabFooter.FindChildTraverse("FooterSaveBuildButton");
    var discordFooterBtn = tabFooter.FindChildTraverse("FooterDiscordRailButton");
    if (!discordFooterBtn) {
        discordFooterBtn = $.CreatePanel("Button", tabFooter, "FooterDiscordRailButton");
    }
    discordFooterBtn.AddClass("TabItem");
    discordFooterBtn.AddClass("FooterDiscordRailBtn");
    var discordFooterLabel = discordFooterBtn.FindChildTraverse("TabLabel");
    if (!discordFooterLabel) {
        discordFooterLabel = $.CreatePanel("Label", discordFooterBtn, "TabLabel");
    }
    discordFooterLabel.text = LocalizeSettingsText("DISCORD", true);
    discordFooterBtn.SetPanelEvent("onactivate", function() {
        $.DispatchEvent("ExternalBrowserGoToURL", "https://discord.gg/npCvuMcTY7");
    });
    EnsureDiscordTextureLogo(discordFooterBtn, "FooterDiscordLogoTexture", "FooterDiscordLogoTexture");
    var discordFooterIcon = discordFooterBtn.FindChildTraverse("FooterDiscordLogoTexture");
    if (discordFooterIcon && discordFooterBtn.MoveChildBefore) {
        try { discordFooterBtn.MoveChildBefore(discordFooterIcon, discordFooterLabel); } catch(eMoveDiscordIcon) { WarnLog("settings", "op failed: " + (eMoveDiscordIcon && eMoveDiscordIcon.message ? eMoveDiscordIcon.message : String(eMoveDiscordIcon || ""))); }
    }

    if (!saveFooterBtn) {
        saveFooterBtn = $.CreatePanel("Button", tabFooter, "FooterSaveBuildButton");
    }
        saveFooterBtn.AddClass("TabItem");
        saveFooterBtn.AddClass("FooterSaveBuildTab");
        var saveFooterLabel = saveFooterBtn.FindChildTraverse("TabLabel");
        if (!saveFooterLabel) {
            saveFooterLabel = $.CreatePanel("Label", saveFooterBtn, "TabLabel");
        }
        var saveFooterIcon = saveFooterBtn.FindChildTraverse("TabIcon");
        if (!saveFooterIcon) {
            saveFooterIcon = $.CreatePanel("Image", saveFooterBtn, "TabIcon", {
                src: "s2r://panorama/images/icons/icon_download.vsvg",
                defaultsrc: "",
                scaling: "contain"
            });
        }
        saveFooterIcon.AddClass("TabIcon");
        saveFooterIcon.AddClass("FooterSaveBuildIcon");
        if (saveFooterBtn.MoveChildBefore) {
            try { saveFooterBtn.MoveChildBefore(saveFooterIcon, saveFooterLabel); } catch(eMoveSaveIcon) { WarnLog("settings", "op failed: " + (eMoveSaveIcon && eMoveSaveIcon.message ? eMoveSaveIcon.message : String(eMoveSaveIcon || ""))); }
        }
        var footerSaveDefaultText = LocalizeSettingsText("SAVE", true);
        saveFooterLabel.text = footerSaveDefaultText;
        saveFooterBtn.SetPanelEvent("onmouseover", function() {
            if (!saveFooterBtn || !saveFooterBtn.IsValid || !saveFooterBtn.IsValid()) return;
            HideSettingsTextTooltip();
            CancelSettingsRowFloatingTooltipHide();
            ShowSettingsRowFloatingTooltip(
                saveFooterBtn,
                "",
                SETTINGS_SAVE_LOADER_ENABLED ? SETTINGS_SAVE_HOVER_WARNING : SETTINGS_SAVE_DISABLED_WARNING,
                PERF_IMPACT_TIER_NONE,
                "",
                { footerSaveWarning: true }
            );
        });
        saveFooterBtn.SetPanelEvent("onmouseout", function() {
            HideSettingsRowFloatingTooltipDeferred("footer_save_mouseout");
        });
        saveFooterBtn.SetPanelEvent("onactivate", function() {
            HideSettingsRowFloatingTooltip();
            ActivateBuildSaveFromUi(saveFooterBtn, saveFooterLabel);
        });
        if (tabFooter.MoveChildBefore) {
            try { tabFooter.MoveChildBefore(discordFooterBtn, saveFooterBtn); } catch(eMoveDiscordFooter) { WarnLog("settings", "op failed: " + (eMoveDiscordFooter && eMoveDiscordFooter.message ? eMoveDiscordFooter.message : String(eMoveDiscordFooter || ""))); }
        }

    var footerVersionLabel = tabFooter.FindChildTraverse("FooterVersionLabel");
    if (footerVersionLabel) {
        footerVersionLabel.DeleteAsync(0);
        footerVersionLabel = null;
    }
    // Use Button so onactivate fires — otherwise identical to the other footer buttons
    footerVersionLabel = $.CreatePanel("Button", tabFooter, "FooterVersionLabel");
    footerVersionLabel.AddClass("TabItem");
    footerVersionLabel.AddClass("FooterVersionLabel");
    var footerVersionIcon = $.CreatePanel("Image", footerVersionLabel, "FooterVersionIcon", {
        src: "s2r://panorama/images/icons/properties/charge.vsvg",
        defaultsrc: "",
        scaling: "contain"
    });
    footerVersionIcon.AddClass("TabIcon");
    footerVersionIcon.AddClass("FooterVersionIcon");
    var footerVersionText = $.CreatePanel("Label", footerVersionLabel, "FooterVersionLabelText");
    footerVersionText.AddClass("TabLabel");
    footerVersionText.AddClass("FooterVersionLabelText");
    footerVersionText.text = MOD_DISPLAY_VERSION;

    // Single click switches to hidden Dev tab (perf controls)
    footerVersionLabel.SetPanelEvent("onactivate", function() {
        SetActiveTabAndRefresh("Dev");
    });

    var staleDiscordFooterBtn = tabFooter.FindChildTraverse("FooterDiscordLinkButton");
    if (staleDiscordFooterBtn) {
        staleDiscordFooterBtn.DeleteAsync(0);
        staleDiscordFooterBtn = null;
    }

    var supportFooterBtn = tabFooter.FindChildTraverse("FooterSupportTabButton");
    if (supportFooterBtn) {
        supportFooterBtn.DeleteAsync(0);
    }

    var sideNavCreditRow = tabFooter.FindChildTraverse("SideNavCreditRow");
    if (sideNavCreditRow) {
        sideNavCreditRow.DeleteAsync(0);
    }
    var staleSideNavCreditRowTabs = tabListHost.FindChildTraverse("SideNavCreditRow");
    if (staleSideNavCreditRowTabs) {
        staleSideNavCreditRowTabs.DeleteAsync(0);
    }
    var staleSideNavCoffeeBtn = tabBar.FindChildTraverse("SideNavCoffeeBtn");
    if (staleSideNavCoffeeBtn) staleSideNavCoffeeBtn.DeleteAsync(0);
    var staleSideNavSupportBtn = tabBar.FindChildTraverse("SideNavSupportBtn");
    if (staleSideNavSupportBtn) staleSideNavSupportBtn.DeleteAsync(0);

    tabBar.MoveChildBefore(tabListHost, tabSpacerMain);
    tabBar.MoveChildBefore(tabSpacerMain, tabFooter);

    var headerHost = win.FindChildTraverse("SettingsHeader");
    var searchWrapExisting = headerHost ? headerHost.FindChildTraverse("SettingsSearchWrap") : null;
    if (!searchWrapExisting) {
        var searchWrapAny = tabHost.FindChildTraverse("SettingsSearchWrap");
        if (!searchWrapAny) {
            searchWrapAny = contentHost.FindChildTraverse("SettingsSearchWrap");
        }
        if (searchWrapAny) {
            searchWrapExisting = searchWrapAny;
            if (headerHost) {
                searchWrapExisting.SetParent(headerHost);
            }
        } else if (headerHost) {
            searchWrapExisting = $.CreatePanel("Panel", headerHost, "SettingsSearchWrap");
        }
    } else if (searchWrapExisting.GetParent && headerHost && searchWrapExisting.GetParent() !== headerHost) {
        searchWrapExisting.SetParent(headerHost);
    }
    if (searchWrapExisting) {
        searchWrapExisting.AddClass("SettingsHeaderSearchWrap");
        searchWrapExisting.hittest = true;
        searchWrapExisting.hittestchildren = true;
        searchWrapExisting.style.zIndex = "4";
        var searchIconExisting = searchWrapExisting.FindChildTraverse("SettingsNavigationSearchIcon");
        if (!searchIconExisting) {
            searchIconExisting = $.CreatePanel("Image", searchWrapExisting, "SettingsNavigationSearchIcon", {
                src: "s2r://panorama/images/control_icons/24px/search.vsvg",
                defaultsrc: "",
                scaling: "contain"
            });
        }
        var searchInputExisting = searchWrapExisting.FindChildTraverse("SettingsSearchInput");
        if (!searchInputExisting) {
            searchInputExisting = $.CreatePanel("TextEntry", searchWrapExisting, "SettingsSearchInput");
        }
        // Keep the query + clear-button state in sync immediately (both cheap), but
        // debounce the expensive list rebuild so a burst of keystrokes coalesces into
        // a single render instead of one full teardown+rebuild per character.
        var syncSearchQueryState = function() {
            currentSearchQuery = searchInputExisting.text || "";
            UpdateSettingsSearchUiState($.GetContextPanel());
        };
        searchInputExisting.SetPanelEvent("ontextentrychange", function() {
            syncSearchQueryState();
            ScheduleSettingsSearchRender();
        });
        // Enter/submit renders immediately (no point waiting out the debounce window).
        searchInputExisting.SetPanelEvent("oninputsubmit", function() {
            syncSearchQueryState();
            FlushSettingsSearchRender();
        });
        var searchClearExisting = searchWrapExisting.FindChildTraverse("SettingsSearchClear");
        if (!searchClearExisting) {
            searchClearExisting = $.CreatePanel("Button", searchWrapExisting, "SettingsSearchClear");
            var searchClearLabel = $.CreatePanel("Label", searchClearExisting, "");
            searchClearLabel.text = "X";
        }
        searchClearExisting.hittest = true;
        searchClearExisting.hittestchildren = true;
        var searchClearLabelExisting = null;
        try {
            var clearChildren = searchClearExisting.Children ? searchClearExisting.Children() : [];
            if (clearChildren && clearChildren.length > 0) {
                searchClearLabelExisting = clearChildren[0];
            }
        } catch (eClearChildren) {
            searchClearLabelExisting = null;
        }
        if (!searchClearLabelExisting) {
            searchClearLabelExisting = $.CreatePanel("Label", searchClearExisting, "");
            searchClearLabelExisting.text = "X";
        }
        searchClearLabelExisting.hittest = false;
        searchClearLabelExisting.hittestchildren = false;
        searchClearExisting.SetPanelEvent("onactivate", function() {
            var rootPanel = $.GetContextPanel();
            ClearSettingsSearchQuery(rootPanel);
            CancelSettingsSearchRender();
            var liveList = GetSettingsListPanel();
            if (liveList) UpdateListContent(liveList, true);
        });
        if ((searchInputExisting.text || "") !== currentSearchQuery) {
            searchInputExisting.text = currentSearchQuery;
        }
        UpdateSettingsSearchUiState($.GetContextPanel());
    }

    var staleSubHeader = contentHost.FindChildTraverse("SettingsSubHeaderBar");
    if (staleSubHeader) staleSubHeader.DeleteAsync(0);

    var staleSubHeaderActions = tabHost.FindChildTraverse("SettingsSubHeaderActions");
    if (staleSubHeaderActions) staleSubHeaderActions.DeleteAsync(0);

    var dragBtnRailExisting = tabHost.FindChildTraverse("DragToggleBtnRail");
    if (dragBtnRailExisting) dragBtnRailExisting.DeleteAsync(0);
    var previewBtnRailExisting = tabHost.FindChildTraverse("PreviewToggleBtnRail");
    if (previewBtnRailExisting) previewBtnRailExisting.DeleteAsync(0);

    var impBtnRailExisting = tabHost.FindChildTraverse("ImportSettingsBtnRail");
    if (impBtnRailExisting) impBtnRailExisting.DeleteAsync(0);
    var expBtnRailExisting = tabHost.FindChildTraverse("ExportSettingsBtnRail");
    if (expBtnRailExisting) expBtnRailExisting.DeleteAsync(0);

    SyncTabActiveStates(tabBar);
    UpdateListContent(list, true);
    UpdatePresetHighlightPollingState();

    var header = win.FindChildTraverse("SettingsHeader");
    if (header) {
        var headerTitle = header.FindChildTraverse("SettingsTitle");
        var headerLogo = header.FindChildTraverse("SettingsHeaderMogLogo");
        if (!headerLogo) {
            headerLogo = $.CreatePanel("Image", header, "SettingsHeaderMogLogo", {
                src: GetSettingsTheme() === SETTINGS_THEME_MUNFINS ? SETTINGS_HEADER_MUNFINS_LOGO_SRC : (GetSettingsTheme() === SETTINGS_THEME_DEFAULT ? SETTINGS_HEADER_MOG_LOGO_DEFAULT_SRC : SETTINGS_HEADER_MOG_LOGO_THEME_SRC),
                defaultsrc: "",
                scaling: "contain"
            });
        }
        headerLogo.hittest = false;
        headerLogo.hittestchildren = false;
        try { headerLogo.SetImage(GetSettingsTheme() === SETTINGS_THEME_MUNFINS ? SETTINGS_HEADER_MUNFINS_LOGO_SRC : (GetSettingsTheme() === SETTINGS_THEME_DEFAULT ? SETTINGS_HEADER_MOG_LOGO_DEFAULT_SRC : SETTINGS_HEADER_MOG_LOGO_THEME_SRC)); } catch(eHeaderLogo) { WarnLog("settings", "op failed: " + (eHeaderLogo && eHeaderLogo.message ? eHeaderLogo.message : String(eHeaderLogo || ""))); }
        if (headerTitle) {
    headerTitle.text = LocalizeSettingsText("LOCK", true);
            headerTitle.AddClass("SettingsHeaderTitleWordmark");
            headerTitle.hittest = false;
            headerTitle.hittestchildren = false;
            var headerTitleAccent = header.FindChildTraverse("SettingsTitleAccent");
            if (!headerTitleAccent) {
                headerTitleAccent = $.CreatePanel("Label", header, "SettingsTitleAccent");
            }
            headerTitleAccent.AddClass("SettingsHeaderTitleWordmark");
    headerTitleAccent.text = GetSettingsTheme() === SETTINGS_THEME_MUNFINS ? "Munfins" : LocalizeSettingsText("QOL", true);
            headerTitleAccent.hittest = false;
            headerTitleAccent.hittestchildren = false;
            if (header.MoveChildBefore) {
                try { header.MoveChildBefore(headerLogo, headerTitle); } catch(eMoveHeaderLogo) { WarnLog("settings", "op failed: " + (eMoveHeaderLogo && eMoveHeaderLogo.message ? eMoveHeaderLogo.message : String(eMoveHeaderLogo || ""))); }
                try { header.MoveChildBefore(headerTitleAccent, headerTitle); } catch(eMoveHeaderAccent) { WarnLog("settings", "op failed: " + (eMoveHeaderAccent && eMoveHeaderAccent.message ? eMoveHeaderAccent.message : String(eMoveHeaderAccent || ""))); }
            }
        }
        var headerVer = header.FindChildTraverse("ModVersionLabelTop");
        if (headerVer) {
            try { headerVer.DeleteAsync(0); } catch(eDeleteHeaderVer) { WarnLog("settings", "op failed: " + (eDeleteHeaderVer && eDeleteHeaderVer.message ? eDeleteHeaderVer.message : String(eDeleteHeaderVer || ""))); }
            headerVer = null;
        }
        headerVer = $.CreatePanel("Button", header, "ModVersionLabelTop");
        headerVer.AddClass("HeaderMoglockLinkButton");
        headerVer.visible = GetSettingsTheme() !== SETTINGS_THEME_MUNFINS;
        headerVer.style.visibility = GetSettingsTheme() === SETTINGS_THEME_MUNFINS ? "collapse" : "visible";
        headerVer.hittest = true;
        headerVer.hittestchildren = true;
        headerVer.style.zIndex = "7";
        try { headerVer.SetPanelEvent("onactivate", function () {
            try { $.DispatchEvent("ExternalBrowserGoToURL", "https://moglock.gg/"); } catch(eHeaderMoglockClick1) { WarnLog("settings", "op failed: " + (eHeaderMoglockClick1 && eHeaderMoglockClick1.message ? eHeaderMoglockClick1.message : String(eHeaderMoglockClick1 || ""))); }
        }); } catch(eHeaderMoglockClick) { WarnLog("settings", "op failed: " + (eHeaderMoglockClick && eHeaderMoglockClick.message ? eHeaderMoglockClick.message : String(eHeaderMoglockClick || ""))); }
        var headerVerPrefix = $.CreatePanel("Label", headerVer, "ModVersionLabelTopPrefix");
    headerVerPrefix.text = LocalizeSettingsText("by", true);
        var headerVerDomain = $.CreatePanel("Label", headerVer, "ModVersionLabelTopDomain");
    headerVerDomain.text = LocalizeSettingsText("moglock.gg", true);
        ApplySettingsHeaderLogoTheme(GetSettingsTheme());
        var closeBtnHeader = header.FindChildTraverse("CloseBtn");
        if (closeBtnHeader) {
            var headerDiscordBtn = header.FindChildTraverse("HeaderDiscordLinkButton");
            if (headerDiscordBtn) {
                headerDiscordBtn.DeleteAsync(0);
                headerDiscordBtn = null;
            }

            var headerCenterHost = header.FindChildTraverse("SettingsHeaderCenterHost");
            if (!headerCenterHost) {
                headerCenterHost = $.CreatePanel("Panel", header, "SettingsHeaderCenterHost");
            }
            headerCenterHost.style.zIndex = "4";
            header.MoveChildBefore(headerCenterHost, closeBtnHeader);
            if (header.MoveChildBefore) {
                try { header.MoveChildBefore(headerVer, headerCenterHost); } catch(eMoveHeaderVerBack) { WarnLog("settings", "op failed: " + (eMoveHeaderVerBack && eMoveHeaderVerBack.message ? eMoveHeaderVerBack.message : String(eMoveHeaderVerBack || ""))); }
            }

            if (searchWrapExisting && searchWrapExisting.IsValid && searchWrapExisting.IsValid()) {
                if (searchWrapExisting.GetParent && searchWrapExisting.GetParent() !== headerCenterHost) {
                    searchWrapExisting.SetParent(headerCenterHost);
                }
            }
            closeBtnHeader.style.horizontalAlign = "right";
            closeBtnHeader.style.verticalAlign = "center";
            closeBtnHeader.SetPanelEvent("onactivate", function() {
                $.ForceCloseModSettings();
            });
        }
    }

    var footer = win.FindChildTraverse("SettingsFooter");
    if (footer) {
        footer.DeleteAsync(0);
    }

    SetupSettingsWindowDragging(win.FindChildTraverse("SettingsHeader"), win);
    QOLEnsureFriendsSearchHandlers();
    gSettingsUiBuilt = true;

};

$.ToggleSettingsWindow = function() {
    var nowToggleMs = GetNowMs();
    if (nowToggleMs < gSettingsToggleDebounceUntilMs) return;
    gSettingsToggleDebounceUntilMs = nowToggleMs + 220;
    var win = $.GetContextPanel().FindChildTraverse("SettingsWindow");
    if (win) {
        win.ToggleClass("Visible");
        if (win.BHasClass("Visible")) {
            gSettingsOpenGuardUntilMs = GetNowMs() + 350;
            gSettingsOpenedInHideout = IsInHideoutForBuildSave();
            try { SetSettingsTooltipThemeActive(true); } catch(eTooltipOpen) { WarnLog("settings", "op failed: " + (eTooltipOpen && eTooltipOpen.message ? eTooltipOpen.message : String(eTooltipOpen || ""))); }
            try {
                if (!gSettingsUiBuilt) {
                    $.BuildUI();
                } else {
                    SyncConfigFromStorage();
                    var list = $.GetContextPanel().FindChildTraverse("SettingsList");
                    if (list) {
                        UpdateListContent(list, true);
                    }
                    UpdatePresetHighlightPollingState();
                }
            } catch (eBuildOpen) {
            }
            try { win.SetFocus(); } catch(eFocusOpen) { WarnLog("settings", "op failed: " + (eFocusOpen && eFocusOpen.message ? eFocusOpen.message : String(eFocusOpen || ""))); }
            if (gSettingsOpenedInHideout) {
                StartSettingsGameTransitionWatch();
            }
        } else {
            StopSettingsGameTransitionWatch();
            gSettingsOpenedInHideout = false;
            SetSettingsTooltipThemeActive(false);
            HideSettingsRowFloatingTooltip();
            StopPresetHighlightPolling();
            HideMinimapSizePreview();
            CloseSettingsSideModalsIfOpen();
            CloseMinesweeperModalIfOpen();
            CloseFlappyModalIfOpen();
            CloseAimTrainerModalIfOpen();
            CloseTrainTrackingModalIfOpen();
            CloseWhackRemModalIfOpen();
            CloseBlackjackModalIfOpen();
        }
    }
};

$.ForceCloseModSettings = function() {
    if (GetNowMs() < gSettingsOpenGuardUntilMs) return;
    var win = $.GetContextPanel().FindChildTraverse("SettingsWindow");
    if (win) {
        win.RemoveClass("Visible");
    }
    StopSettingsGameTransitionWatch();
    gSettingsOpenedInHideout = false;
    SetSettingsTooltipThemeActive(false);
    HideSettingsRowFloatingTooltip();
    StopPresetHighlightPolling();
    HideMinimapSizePreview();
    CloseSettingsSideModalsIfOpen();
    CloseMinesweeperModalIfOpen();
    CloseFlappyModalIfOpen();
    CloseAimTrainerModalIfOpen();
    CloseTrainTrackingModalIfOpen();
    CloseWhackRemModalIfOpen();
    CloseBlackjackModalIfOpen();
    $.DispatchEvent("CitadelResumePlaying", $.GetContextPanel());
};

try {
    $.RegisterForUnhandledEvent("CitadelResumePlaying", function() {
        if (GetNowMs() < gSettingsOpenGuardUntilMs) return;
        var win = $.GetContextPanel().FindChildTraverse("SettingsWindow");
        if (win) {
            win.RemoveClass("Visible");
        }
        StopSettingsGameTransitionWatch();
        gSettingsOpenedInHideout = false;
        SetSettingsTooltipThemeActive(false);
        HideSettingsRowFloatingTooltip();
        StopPresetHighlightPolling();
        HideMinimapSizePreview();
        CloseSettingsSideModalsIfOpen();
        CloseMinesweeperModalIfOpen();
        CloseFlappyModalIfOpen();
        CloseAimTrainerModalIfOpen();
        CloseTrainTrackingModalIfOpen();
        CloseWhackRemModalIfOpen();
        CloseBlackjackModalIfOpen();
    });
} catch(e) {
    $.Msg("[QOLLock][Settings] CitadelResumePlaying event not available: " + (e && e.message ? e.message : String(e)));
}

try {
    $.RegisterForUnhandledEvent("CitadelGameStateChanged", function() {
        HandleSettingsGameTransitionSignal("CitadelGameStateChanged");
    });
} catch(e) {
    $.Msg("[QOLLock][Settings] CitadelGameStateChanged event not available: " + (e && e.message ? e.message : String(e)));
}

// NOTE: CitadelConnectedToGame + CitadelMatchStateChanged removed —
// neither event name exists in the engine (verified against decompiled
// panoramauiclient.dll + dispatch_events.txt, 2026-06-20).
// The correct event is CitadelConnectedToGameServer but it fires at a
// different lifecycle point. HandleSettingsGameTransitionSignal is
// already triggered by CitadelGameStateChanged + CitadelResumePlaying.

SyncConfigFromStorage();
RunJoyNameStorageReadProbe();
StartHeroHintPublisher();

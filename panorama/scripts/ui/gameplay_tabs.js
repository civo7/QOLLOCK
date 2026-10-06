// =============================================================================
// QOLLOCK — ui/gameplay_tabs.js
// =============================================================================
// OWNS:        Gameplay settings tabs:
//              - Crosshair (item cooldowns, active stats, stamina, ammo, damage numbers)
//              - HUD (top bar, bottom bar, items, souls, shop & notifications)
//              - Healthbar (player healthbar style, combat indicator, colors, offsets)
//              - UI (aspect ratio fixes, party lane, centered menus, pause, stats, chat)
//              - Overlay (zipline boost, ult cooldowns, unsecured timers, keyboard, compass)
//              - Minimap (minimalist, rotation, timers, addons, alt/tab zoom)
//              Tab renderers and window manager registrations for gameplay tabs.
// DOES NOT OWN: Low-level control factory (ui/renderer.js, legacy CreateRow),
//               Config storage and synchronization (core/ql_config_store.js, ql_bridge.js).
// DEPENDS ON:  core/ql_namespace.js, ui/renderer.js, ui/window.js
// USED BY:     hud_escape_menu.xml, ui/window.js, ql_settings.js
// =============================================================================

(() => {
    "use strict";

    const Q = (typeof globalThis !== "undefined" && globalThis.QOL)
        ? globalThis.QOL
        : (typeof QOL !== "undefined" ? QOL : (globalThis.QOL = {}));
    Q.ui = Q.ui || {};

    // =========================================================================
    // Options & Dropdown Definitions
    // =========================================================================

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

    const RECENT_PURCHASE_REPOSITION_OPTIONS = [
        { label: "Rejuvenator", key: "RECENT_PURCHASES_QUICK_REJUV" },
        { label: "Scoreboard", key: "RECENT_PURCHASES_QUICK_SCOREBOARD" }
    ];

    const STATS_POSITION_SIDE_OPTIONS = [
        { label: "Left", value: 0 },
        { label: "Right", value: 1 }
    ];

    // =========================================================================
    // Helper Resolvers
    // =========================================================================

    const getCreateRow = () => (typeof globalThis.CreateRow === "function" ? globalThis.CreateRow : null);
    const getCreateSliderRow = () => (typeof globalThis.CreateSliderRow === "function" ? globalThis.CreateSliderRow : null);
    const getCreateSectionTitle = () => (typeof globalThis.CreateSectionTitle === "function" ? globalThis.CreateSectionTitle : ((p, t) => Q.ui?.renderer?.createSectionHeader?.(p, t)));
    const getCreateSeparator = () => (typeof globalThis.CreateSeparator === "function" ? globalThis.CreateSeparator : ((p) => Q.ui?.renderer?.createSeparator?.(p)));
    const CUSTOMIZE_TOGGLE_ELEMENTS = {
        HUD_TOP_BAR_ENABLED: "topBar", HUD_BOTTOM_BAR_ENABLED: "bottomBar", HUD_ITEMS_ENABLED: "items", HUD_SOULS_ENABLED: "souls",
        ENABLE_PASSIVE_COOLDOWN: "cooldowns", ENABLE_CROSSHAIR_STATS: "activeStats", ENABLE_DAMAGE_IMPACT: "damageImpact",
        ENABLE_RELOAD_COOLDOWN: "reload", ENABLE_UNSECURED_SOUL_TIMER: "unsecuredTimer", ENABLE_BETTER_UNSECURED: "unsecuredSouls",
        ENABLE_CHAT: "chat", DISABLE_DAMAGE_REPORT: "damageReport", ENABLE_SHOP_RECENT_PURCHASES: "recentPurchases",
        ENABLE_SHOP_ITEM_NOTIFICATIONS: "purchaseNotifications", ENABLE_KEYBOARD_OVERLAY: "keyboard", ENABLE_ZIP_BOOST: "zipBoost",
        ENABLE_COMPASS_SPEED: "speed", ENABLE_COMPASS: "compass", ENABLE_ALT_ZOOM: "minimapAlt", ENABLE_TAB_ZOOM: "minimapTab"
    };
    const getCreateAnimatedToggle = () => {
        const create = globalThis.CreateAnimatedInlineToggleSection;
        if (typeof create !== "function") return null;
        return (parent, title, key, description, build, toggleOptions, sectionOptions) => {
            const element = CUSTOMIZE_TOGGLE_ELEMENTS[key];
            const options = element ? Object.assign({}, sectionOptions, { customizeElement: element }) : sectionOptions;
            return create(parent, title, key, description, build, toggleOptions, options);
        };
    };
    const getCreateCollapsibleSubSection = () => (typeof globalThis.CreateCollapsibleSubSection === "function" ? globalThis.CreateCollapsibleSubSection : null);
    const getCreateAnimatedEnumSection = () => (typeof globalThis.CreateAnimatedInlineEnumSection === "function" ? globalThis.CreateAnimatedInlineEnumSection : null);
    const getCreateSecondaryCheckboxRow = () => (typeof globalThis.CreateInlineSecondaryCheckboxToggleRow === "function" ? globalThis.CreateInlineSecondaryCheckboxToggleRow : null);

    const getPaletteOptions = () => (typeof globalThis.QOL_COLOR_PALETTE_OPTIONS !== "undefined" ? globalThis.QOL_COLOR_PALETTE_OPTIONS : []);

    // =========================================================================
    // Tab Renderers
    // =========================================================================

    function renderCrosshairTab(list) {
        const createRow = getCreateRow();
        const createSliderRow = getCreateSliderRow();
        const createTitle = getCreateSectionTitle();
        const createSep = getCreateSeparator();
        const createAnimatedToggle = getCreateAnimatedToggle();
        const createCollapsibleSubSection = getCreateCollapsibleSubSection();
        const palette = getPaletteOptions();
        const isSearchCollect = (typeof globalThis.gSearchCollectMode !== "undefined" && globalThis.gSearchCollectMode);

        if (createAnimatedToggle) {
            createAnimatedToggle(list, "Item Cooldowns", "ENABLE_PASSIVE_COOLDOWN", "Tracked cooldowns near crosshair", (sectionParent) => {
                const advancedModeEnabled = Q.preview?.isAdvancedItemCooldownModeEnabled ? Q.preview.isAdvancedItemCooldownModeEnabled() : false;
                if (isSearchCollect && createRow) {
                    createRow(sectionParent, "Advanced", "ENABLE_OLD_ITEM_COOLDOWNS", "toggle", null, null, null, [{ invert: true }], "Switch to the advanced item cooldown mode with in-menu filters.");
                }
                if (advancedModeEnabled) {
                    if (createRow) {
                        createRow(sectionParent, "Advanced Filter", null, "multitoggle", null, null, null, [
                            { key: "ITEM_FILTER_DEF_PASSIVE", label: "Defensive Passive" },
                            { key: "ITEM_FILTER_OFF_PASSIVE", label: "Offensive Passive" },
                            { key: "ITEM_FILTER_DEF_ACTIVE", label: "Defensive Active" },
                            { key: "ITEM_FILTER_OFF_ACTIVE", label: "Offensive Active" }
                        ], null);
                    }
                } else if (createRow) {
                    createRow(sectionParent, "Filters", "OPEN_OLD_ITEM_FILTERS_DOWNLOAD", "actionbutton", null, null, null, [
                        { label: "Get Filter" }
                    ], "Get Filter File Only");
                }
            }, null, {
                titleCheckbox: {
                    label: "Advanced",
                    configId: "ENABLE_OLD_ITEM_COOLDOWNS",
                    invert: true,
                    refreshListOnChange: true,
                    description: "Switch to the advanced item cooldown mode with in-menu filters."
                }
            });
        }

        createSep(list);

        if (createAnimatedToggle) {
            createAnimatedToggle(list, "Active Stats", "ENABLE_CROSSHAIR_STATS", "Show active buffs/debuffs (firerate, slow, antiheal...) vertically next to the crosshair", (sectionParent) => {
                if (createRow) {
                    createRow(sectionParent, "Show Debuffs", "CROSSHAIR_STATS_SHOW_DEBUFFS", "toggle", null, null, null, null);
                    createRow(sectionParent, "Show Buffs", "CROSSHAIR_STATS_SHOW_BUFFS", "toggle", null, null, null, null);
                }
                if (createCollapsibleSubSection) {
                    createCollapsibleSubSection(sectionParent, "Visible Stats", (statsParent) => {
                        if (!createRow) return;
                        createRow(statsParent, "Fire Rate", "CROSSHAIR_STATS_SHOW_FIRERATE", "toggle", null, null, null, null);
                        createRow(statsParent, "Move Speed", "CROSSHAIR_STATS_SHOW_MOVESPEED", "toggle", null, null, null, null);
                        createRow(statsParent, "Healing Amp", "CROSSHAIR_STATS_SHOW_HEALAMP", "toggle", null, null, null, null);
                        createRow(statsParent, "Bullet Resist", "CROSSHAIR_STATS_SHOW_BULLETRESIST", "toggle", null, null, null, null);
                        createRow(statsParent, "Spirit Resist", "CROSSHAIR_STATS_SHOW_TECHRESIST", "toggle", null, null, null, null);
                        createRow(statsParent, "Bullet Lifesteal", "CROSSHAIR_STATS_SHOW_BULLETLIFESTEAL", "toggle", null, null, null, null);
                        createRow(statsParent, "Spirit Lifesteal", "CROSSHAIR_STATS_SHOW_TECHLIFESTEAL", "toggle", null, null, null, null);
                        createRow(statsParent, "Weapon Power", "CROSSHAIR_STATS_SHOW_WEAPONPOWER", "toggle", null, null, null, null);
                        createRow(statsParent, "Spirit Power", "CROSSHAIR_STATS_SHOW_SPIRIT", "toggle", null, null, null, null);
                        createRow(statsParent, "Ability Range", "CROSSHAIR_STATS_SHOW_RANGE", "toggle", null, null, null, null);
                        createRow(statsParent, "Ability Duration", "CROSSHAIR_STATS_SHOW_DURATION", "toggle", null, null, null, null);
                        createRow(statsParent, "Damage Amp", "CROSSHAIR_STATS_SHOW_DAMAGEAMP", "toggle", null, null, null, null);
                        createRow(statsParent, "Clip Size", "CROSSHAIR_STATS_SHOW_CLIPSIZE", "toggle", null, null, null, null);
                        createRow(statsParent, "Health Regen", "CROSSHAIR_STATS_SHOW_REGEN", "toggle", null, null, null, null);
                        createRow(statsParent, "Bullet Evasion", "CROSSHAIR_STATS_SHOW_BULLETEVASION", "toggle", null, null, null, null);
                    });
                }
            });
        }

        createSep(list);

        if (createAnimatedToggle) {
            createAnimatedToggle(list, "Damage Impact", "ENABLE_DAMAGE_IMPACT", "The popups that appear when getting a kill or CCing an enemy or healing an ally", null);
        }

        createSep(list);
        createTitle(list, "Stamina", null, "stamina");
        if (createSliderRow) {
            createSliderRow(list, "Rotate", "STAMINA_CHARGE_ANGLE", "angle_0_360", "Rotate the stamina charge indicator.", true);
        }
        if (createRow) {
            createRow(list, "Color", "STAMINA_CHARGE_COLOR", "palette", null, null, null, palette, "Choose a preset border color for stamina charge indicators.");
        }

        createSep(list);
        createTitle(list, "Damage Numbers", null, "damageNumbers");
        if (createRow) {
            createRow(list, "Big Numbers", "ENABLE_CUMULATIVE_DMG", "toggle", null, null, null, null);
            createRow(list, "Small Numbers", "ENABLE_HIDE_SMALL_NUMBERS", "toggle", null, null, null, [{ invert: true }]);
            createRow(list, "Trooper Damage", "ENABLE_HIDE_TROOPER_DAMAGE", "toggle", null, null, null, [{ invert: true }]);
            createRow(list, "Clean Indicators", "ENABLE_CLEAN_DAMAGE_INDICATORS", "toggle", null, null, null, null, "Modify damage numbers for a cleaner style and animation to be more out of the way");
            createRow(list, "Damage Fountain", "ENABLE_DAMAGE_FOUNTAIN", "toggle", null, null, null, null, "Fountain-style damage number animation.");
        }

        createSep(list);
        createTitle(list, "Ammo", null, "ammo");
        if (createRow) {
            createRow(list, "Visual", "ENABLE_AMMO_STATUS", "toggle", null, null, null, null);
            createRow(list, "Current", "ENABLE_HIDE_AMMO_ALL", "toggle", null, null, null, [{ invert: true }]);
        }
        if (createRow) {
            createRow(list, "Total", "ENABLE_HIDE_MAGAZINE", "toggle", null, null, null, [{ invert: true }]);
        }
        if (createSliderRow) {
            createSliderRow(list, "Rotate Magazine", "AMMO_CLIP_ANGLE", "angle_0_360", "Rotate the ammo magazine visualiser.", true);
        }
        if (createRow) {
            createRow(list, "Color", "AMMO_TEXT_COLOR", "palette", null, null, null, palette, "Choose a preset text color for the ammo display.");
        }

        createSep(list);
        if (createAnimatedToggle) {
            createAnimatedToggle(list, "Reload Cooldown", "ENABLE_RELOAD_COOLDOWN", "Estimated Active Reload Timer", null);
        }

        createSep(list);
        createTitle(list, "Reloading");
        if (createRow) {
            createRow(list, "Icon", "ENABLE_HIDE_RELOAD_ICON", "toggle", null, null, null, [{ invert: true }]);
            createRow(list, "Circle", "ENABLE_HIDE_RELOAD_CIRCLE", "toggle", null, null, null, [{ invert: true }]);
        }

        createSep(list);
        createTitle(list, "Item Target Reticle", null, "targetShapes");
        if (createRow) {
            createRow(list, "Highlight Mode", "ENABLE_RED_DIAMOND", "toggle", null, null, null, null);
            createRow(list, "Improved Hint", "ENABLE_IMPROVED_HINT", "toggle", null, null, null, null);
        }
    }

    function renderHudTab(list) {
        const createRow = getCreateRow();
        const createTitle = getCreateSectionTitle();
        const createSep = getCreateSeparator();
        const createAnimatedToggle = getCreateAnimatedToggle();
        const createSecondaryCheckboxRow = getCreateSecondaryCheckboxRow();
        const palette = getPaletteOptions();

        if (createAnimatedToggle) {
            createAnimatedToggle(list, "Top Bar", "HUD_TOP_BAR_ENABLED", "", (sectionParent) => {
                if (createRow) {
                    createRow(sectionParent, "Objective Map", "ENABLE_OBJ_MAP", "toggle", null, null, null, null, "");
                    createRow(sectionParent, "Mid Boss Timer", "ENABLE_REJUV_HUD", "toggle", null, null, null, null, "");
                    createRow(sectionParent, "Bridge Buff Timer", "ENABLE_BUFF_HUD", "toggle", null, null, null, null, "");
                    createRow(sectionParent, "Urn Difference", "ENABLE_URN_DIFF", "toggle", null, null, null, null, "");
                    createRow(sectionParent, "Rift Timer", "ENABLE_URN_TIMER", "toggle", null, null, null, null, "");
                    createRow(sectionParent, "Missing Hero Opaque", "ENABLE_MISSING_HERO", "toggle", null, null, null, null, "");
                    createRow(sectionParent, "Nicknames", "ENABLE_NICKNAMES", "toggle", null, null, null, null, "");
                    createRow(sectionParent, "Objective Damage", "ENABLE_OBJ_DMG", "toggle", null, null, null, null, "");
                    createRow(sectionParent, "Ult Cooldowns", "ENABLE_ULT_COOLDOWNS", "toggle", null, null, null, null, "");
                    createRow(sectionParent, "Top Bar Background", "DISABLE_PLAYER_NAME_BLUR", "toggle", null, null, null, [{ invert: true }], "");
                }
                if (createSecondaryCheckboxRow) {
                    createSecondaryCheckboxRow(sectionParent, "Show Player Ranks", "SHOW_RANK", "Top Bar", "SHOW_RANK_TOPBAR", "Show rank prediction badges on top bar and escape menu player list.", "Show rank prediction badges on top bar player panels (requires Show Player Ranks).");
                }
                if (createRow) {
                    createRow(sectionParent, "Enemy HP Warning", "ENABLE_TOPBAR_ENEMY_HP_WARNING", "multitoggle", null, null, null, TOPBAR_ENEMY_HP_WARNING_THRESHOLD_OPTIONS, "Enemy HP Warning");
                    createRow(sectionParent, "Ally HP Warning", "ENABLE_TOPBAR_ALLY_HP_WARNING", "multitoggle", null, null, null, TOPBAR_ALLY_HP_WARNING_THRESHOLD_OPTIONS, "Ally HP Warning");
                }
            });
        }

        createSep(list);

        if (createAnimatedToggle) {
            createAnimatedToggle(list, "Bottom Bar", "HUD_BOTTOM_BAR_ENABLED", "", (sectionParent) => {
                if (createRow) {
                    createRow(sectionParent, "Failed Hint", "ENABLE_HIDE_FAILED_HINT", "toggle", null, null, null, [{ invert: true }], "Low Stamina Popup");
                    createRow(sectionParent, "Ability Suggestion", "ENABLE_HIDE_ABILITY_SUGGESTION", "toggle", null, null, null, [{ invert: true }], "On Ability Upgrade");
                    createRow(sectionParent, "Cosmetic Ability", "ENABLE_HIDE_COSMETIC_ABILITY", "toggle", null, null, null, [{ invert: true }], "Snowball or Poster");
                    createRow(sectionParent, "Minimalist Abilities", "ENABLE_SIMPLIFY_ABILITY_ICONS", "toggle", null, null, null, null);
                    createRow(sectionParent, "Clean Stacks", "ENABLE_CLEAN_STACKS", "toggle", null, null, null, null, "Move ability stacks to bottom-center of ability icon");
                    createRow(sectionParent, "Legacy Durations", "ENABLE_LEGACY_COOLDOWNS", "toggle", null, null, null, null, "");
                }
                if (createRow) {
                    createRow(sectionParent, "Color", "BOTTOM_BAR_WASH_COLOR", "palette", null, null, null, palette, "Choose a preset color wash for the bottom ability bar.");
                }
                createTitle(sectionParent, "Active Items", null, "activeItems");
            });
        }

        createSep(list);

        if (createAnimatedToggle) {
            createAnimatedToggle(list, "Items", "HUD_ITEMS_ENABLED", "", (sectionParent) => {
                if (createRow) {
                    createRow(sectionParent, "Minimalist Item Bar", "ENABLE_SIMPLIFY_ITEMS", "toggle", null, null, null, null);
                }
                if (createRow) {
                    createRow(sectionParent, "Color", "ITEMS_WASH_COLOR", "palette", null, null, null, palette, "Choose a preset color wash for the item bar.");
                }
            });
        }

        createSep(list);

        if (createAnimatedToggle) {
            createAnimatedToggle(list, "Souls", "HUD_SOULS_ENABLED", "", (sectionParent) => {
                createSep(sectionParent);
                createAnimatedToggle(sectionParent, "Unsecured Timer", "ENABLE_UNSECURED_SOUL_TIMER", "Realtime Drain Countdown", (unsecuredParent) => {
                });
                createSep(sectionParent);
                createAnimatedToggle(sectionParent, "Unsecured Plus", "ENABLE_BETTER_UNSECURED", "Customizable Unsecured Souls", (unsecuredPlusParent) => {
                    if (createRow) {
                        createRow(unsecuredPlusParent, "Icon", "ENABLE_BETTER_UNSECURED_SHOW_ICON", "toggle", null, null, null, null, "");
                        createRow(unsecuredPlusParent, "Text", "ENABLE_BETTER_UNSECURED_SHOW_TEXT", "toggle", null, null, null, null, "");
                    }
                });
            });
        }

        createSep(list);

        if (createAnimatedToggle) {
            createAnimatedToggle(list, "Chat", "ENABLE_CHAT", "", (sectionParent) => {
                if (createRow) {
                    createRow(sectionParent, "Images in Chat", "ENABLE_IMAGES_IN_CHAT", "toggle", null, null, null, null, "");
                }
            });
            createSep(list);
            createAnimatedToggle(list, "Damage Report", "DISABLE_DAMAGE_REPORT", "", null, { invert: true });
        }

        createSep(list);
        createTitle(list, "Player Stats", "ENABLE_STATS_POSITION", "playerStats");
        if (createRow) {
            createRow(list, "Side", "STATS_POSITION_SIDE", "buttongroup", null, null, null, STATS_POSITION_SIDE_OPTIONS);
        }
        if (createRow) {
            createRow(list, "Hide in normal view", "STATS_POSITION_HIDE_NORMAL", "toggle", null, null, null, null, "Hide the bottom-left active stats block during normal play. It stays in the HUD (just made invisible), so the Crosshair Active Stats mirror keeps working.");
            createRow(list, "Hide on scoreboard (TAB)", "STATS_POSITION_HIDE_SCOREBOARD", "toggle", null, null, null, null, "Hide the detailed stats list that appears while the scoreboard / TAB is held.");
        }
    }

    function renderShopTab(list) {
        const createRow = getCreateRow();
        const createSliderRow = getCreateSliderRow();
        const createTitle = getCreateSectionTitle();
        const createSep = getCreateSeparator();
        const createAnimatedToggle = getCreateAnimatedToggle();
        const createSecondaryCheckboxRow = getCreateSecondaryCheckboxRow();

        createTitle(list, "Quick Buy");
        if (createSecondaryCheckboxRow) {
            createSecondaryCheckboxRow(
                list,
                "Quick Buy",
                "DISABLE_QUICK_BUY",
                "Enhanced",
                "ENABLE_ENHANCED_QUICKBUY",
                null,
                "Replaces quickbuy with the Enhanced Quickbuy standalone layout and queue summaries.",
                { invert: true, clearSecondaryWhenDisabled: true }
            );
        }
        if (createSliderRow) {
            createSliderRow(list, "Enhanced Count", "ENHANCED_QUICKBUY_COUNT", "count_1_5", "Controls how many enhanced quickbuy preview items are shown.");
        }
        if (createRow) {
            createRow(list, "Click to Notify", "ENABLE_QUICKBUY_CLICK_TO_NOTIFY", "toggle", null, null, null, null);
        }

        createSep(list);

        if (createAnimatedToggle) {
            createAnimatedToggle(list, "Recent Purchases", "ENABLE_SHOP_RECENT_PURCHASES", "See the recent purchases made in the game.", (recentPurchasesParent) => {
            });
            createSep(list);
            createAnimatedToggle(list, "Item Buy Notifications", "ENABLE_SHOP_ITEM_NOTIFICATIONS", "Shows item buy notifications from recent purchases.", (notificationsParent) => {
                if (createRow) {
                    createRow(notificationsParent, "Reposition", null, "multitoggle", null, null, null, RECENT_PURCHASE_REPOSITION_OPTIONS, "Move notifications around Rejuvenator and Scoreboard UI.");
                    createRow(notificationsParent, "Per-Hero Popups", "ENABLE_HERO_PURCHASE_POPUPS", "toggle", null, null, null, null, "Show purchase notifications under each hero's portrait instead of in the center.");
                }
                if (createSliderRow) {
                    createSliderRow(notificationsParent, "Max Notifications", "RECENT_PURCHASES_QUICK_MAX", "count_1_5");
                    createSliderRow(notificationsParent, "Duration", "RECENT_PURCHASES_QUICK_DISPLAY_SEC", "sec_3_15", "Seconds each notification stays visible.");
                }
            });
        }

        createSep(list);
        createTitle(list, "Shop Display", null, "shop");
        if (createSecondaryCheckboxRow) {
            createSecondaryCheckboxRow(
                list,
                "Stats",
                "ENABLE_SHOP_STATS",
                "Minimalist",
                "ENABLE_SIMPLIFY_SHOP_STATS",
                "",
                "Only simplifies the shop stats display."
            );
        }
        if (createRow) {
            createRow(list, "Hero", "ENABLE_HERO_SCENE_PANEL", "toggle", null, null, null, null);
            createRow(list, "Minimalist", "ENABLE_SIMPLIFY_SHOP", "toggle", null, null, null, null);
            createRow(list, "Blur", "DISABLE_SHOP_BLUE", "toggle", null, null, null, [{ invert: true }]);
        }
    }

    function renderHealthbarTab(list) {
        const createRow = getCreateRow();
        const createTitle = getCreateSectionTitle();
        const createAnimatedEnumSection = getCreateAnimatedEnumSection();
        const palette = getPaletteOptions();

        if (typeof globalThis.gEnumSectionSyncCallbacks !== "undefined") {
            globalThis.gEnumSectionSyncCallbacks = [];
        }

        createTitle(list, "Player", null, "healthbar");
        if (createRow) {
            createRow(list, "Combat Indicator", "ENABLE_COMBAT_INDICATOR", "toggle", null, null, null, null);
            createRow(list, "Color Warning", "ENABLE_COLORED_HEALTHBAR", "multitoggle", null, null, null, COLOR_WARNING_THRESHOLD_OPTIONS, "HP Warning");
            createRow(list, "Type", "HEALTHBAR_TYPE", "dropdown", null, null, null, HEALTHBAR_TYPE_DROPDOWN_OPTIONS);
        }
        if (createAnimatedEnumSection) {
            createAnimatedEnumSection(list, "Healthbar Options", "HEALTHBAR_TYPE", 5, (sectionParent) => {
                if (createRow) {
                    createRow(sectionParent, "Health Numbers", "ENABLE_MINECRAFT_HEALTH_NUMBERS", "toggle", null, null, null, null, "");
                }
            });
        }
        if (createRow) {
            createRow(list, "Accent Color", "PLAYER_HEALTHBAR_ACCENT_COLOR", "palette", null, null, null, palette, "Choose a preset accent color for the player healthbar frame.");
        }
    }

    function renderUiTab(list) {
        const createRow = getCreateRow();
        const createTitle = getCreateSectionTitle();
        const createSep = getCreateSeparator();
        const createAnimatedToggle = getCreateAnimatedToggle();

        createTitle(list, "UI Controls");
        if (createRow) {
            createRow(list, "16:10 Support", "SUPPORT_16_10", "toggle", null, null, null, null, "Hud Shift");
            createRow(list, "4:3 Support", "SUPPORT_4_3", "toggle", null, null, null, null, "Hud Shift");
            createRow(list, "21:9 Stream Fix", "ENABLE_HUD_SHIFT", "toggle", null, null, null, null, "Hud Shift");
            createRow(list, "Lane with Party", "ENABLE_LANE_WITH_PARTY", "toggle", null, null, null, null, "Automatically selects 'With Party' in lane preference. Requires the party screen to be open.");
            createRow(list, "Centered ESC Menu", "ENABLE_CENTER_ESC", "toggle", null, null, null, null, "Easier Access");
            createRow(list, "Centered Friends List", "ENABLE_CENTER_FRIENDS_LIST", "toggle", null, null, null, null, "");
            createRow(list, "Legacy Durations", "ENABLE_LEGACY_COOLDOWNS", "toggle", null, null, null, null, "");
            createRow(list, "Show Testing Tools", "ENABLE_FORCE_TESTING_TOOLS", "toggle", null, null, null, null, "Always Shown");
            createRow(list, "Hide Testing Tools", "ENABLE_HIDE_TESTING_TOOLS", "toggle", null, null, null, null, "Always Hidden");
            createRow(list, "Behavior Summary", "ENABLE_HIDE_BEHAVIOR_SUMMARY", "toggle", null, null, null, [{ invert: true }], "Metro Button");
        }
        createSep(list);

        if (createAnimatedToggle) {
            createAnimatedToggle(list, "Show Build ID", "ENABLE_SHOW_BUILD_ID", "Shows your build information always for content creators", (sectionParent) => {
                if (createRow) {
                    createRow(sectionParent, "Show Title", "ENABLE_SHOW_BUILD_ID_TITLE", "toggle", null, null, null, null, "");
                }
            });
            createSep(list);
            createAnimatedToggle(list, "Minimalistic Pause", "ENABLE_MINIMALISTIC_PAUSE", "Use the compact minimalistic pause screen instead of the default large one.", null);
            createSep(list);
            createAnimatedToggle(list, "Damage Report", "DISABLE_DAMAGE_REPORT", "", null, { invert: true });
        }

        createSep(list);
        createTitle(list, "Player Stats", "ENABLE_STATS_POSITION", "playerStats");
        if (createRow) {
            createRow(list, "Side", "STATS_POSITION_SIDE", "buttongroup", null, null, null, STATS_POSITION_SIDE_OPTIONS);
        }
        if (createRow) {
            createRow(list, "Hide in normal view", "STATS_POSITION_HIDE_NORMAL", "toggle", null, null, null, null, "Hide the bottom-left active stats block during normal play. It stays in the HUD (just made invisible), so the Crosshair Active Stats mirror keeps working.");
            createRow(list, "Hide on scoreboard (TAB)", "STATS_POSITION_HIDE_SCOREBOARD", "toggle", null, null, null, null, "Hide the detailed stats list that appears while the scoreboard / TAB is held.");
        }

        createSep(list);
        if (createAnimatedToggle) {
            createAnimatedToggle(list, "Chat", "ENABLE_CHAT", "", (sectionParent) => {
                if (createRow) {
                    createRow(sectionParent, "Images in Chat", "ENABLE_IMAGES_IN_CHAT", "toggle", null, null, null, null, "");
                }
            });
        }
    }

    function renderOverlayTab(list) {
        const createRow = getCreateRow();
        const createSep = getCreateSeparator();
        const createAnimatedToggle = getCreateAnimatedToggle();
        const palette = getPaletteOptions();

        createSep(list);
        if (createAnimatedToggle) {
            createAnimatedToggle(list, "Show Build ID", "ENABLE_SHOW_BUILD_ID", "Shows your build information always for content creators", (sectionParent) => {
                if (createRow) {
                    createRow(sectionParent, "Show Title", "ENABLE_SHOW_BUILD_ID_TITLE", "toggle", null, null, null, null, "");
                }
            });
            createSep(list);
            createAnimatedToggle(list, "Keyboard", "ENABLE_KEYBOARD_OVERLAY", "Realtime Key Inputs", (sectionParent) => {
                if (createRow) {
                    createRow(sectionParent, "Full Keys", "ENABLE_FULL_KEYBOARD_LAYOUT", "toggle", null, null, null, null, "");
                }
                if (createRow) {
                    createRow(sectionParent, "Color", "KEYBOARD_OVERLAY_WASH_COLOR", "palette", null, null, null, palette, "Choose a preset color wash for the keyboard overlay.");
                }
            });
            createSep(list);
            createAnimatedToggle(list, "Zipline Boost", "ENABLE_ZIP_BOOST", "Always Visible Boost", null);
            createSep(list);
            createAnimatedToggle(list, "Speed", "ENABLE_COMPASS_SPEED", "Show standalone movement speed.", null);
            createSep(list);
            createAnimatedToggle(list, "Compass", "ENABLE_COMPASS", "See your view angle.", (sectionParent) => {
                if (createRow) {
                    createRow(sectionParent, "Minimalist", "ENABLE_SIMPLIFY_COMPASS", "toggle", null, null, null, null, "Simplifies the Compass overlay to its bare elements.");
                }
            });
        }
    }

    function renderMinimapTab(list) {
        const createRow = getCreateRow();
        const createTitle = getCreateSectionTitle();
        const createSep = getCreateSeparator();
        const createAnimatedToggle = getCreateAnimatedToggle();
        const createSecondaryCheckboxRow = getCreateSecondaryCheckboxRow();
        const palette = getPaletteOptions();

        createTitle(list, "Base", null, "minimap");
        if (createRow) {
            createRow(list, "Minimalist", "MINIMAL_MINIMAP", "toggle", null, null, null, null, "Cleans up visuals of the minimap significantly to reduce clutter.");
        }
        if (createRow) {
            createRow(list, "Flip", "MINIMAP_FLIP", "toggle", null, null, null, null, "Rotates the static minimap 180 degrees.");
            createRow(list, "Spinny Mode", "MINIMAP_ROTATE_WITH_PLAYER", "toggle", null, null, null, null, "");
            createRow(list, "Fixed Icon Size", "MINIMAP_FIXED_ICON_SIZE", "toggle", null, null, null, null,
                "Resizes the minimap using width and height instead of scaling the whole HUD. Applies to Base, Alt and Tab views.");
        }
        if (createRow) {
            createRow(list, "Icons", "MINIMAP_ICON_COLOR", "palette", null, null, null, palette, "Choose a preset color wash for minimap icons.");
        }

        createSep(list);
        createTitle(list, "Addons");
        if (createRow) {
            createRow(list, "Elevation Markers", "ENABLE_MINIMAP_ELEVATION_MARKERS", "toggle", null, null, null, null, "Shows relative elevation difference between you and players.");
        }
        if (createSecondaryCheckboxRow) {
            createSecondaryCheckboxRow(
                list,
                "Bridge Buff Timer",
                "ENABLE_MINIMAP_BUFF_TIMER",
                "On Bridge",
                "ENABLE_MINIMAP_BUFF_TIMER_ON_BRIDGE",
                "",
                ""
            );
            createSecondaryCheckboxRow(
                list,
                "Mid Boss Timer",
                "ENABLE_MINIMAP_REJUV_TIMER",
                "On Mid Boss",
                "ENABLE_MINIMAP_ALWAYS_ON_MID_BOSS",
                "",
                "Moves the Mid Boss timer onto the bridge area of the minimap."
            );
        }
        if (createRow) {
            createRow(list, "Crate Overlay", "ENABLE_MINIMAP_CRATE_OVERLAY", "toggle", null, null, null, null, "Midtown-only crate markers on the minimap.");
            createRow(list, "Rem Tunnels", "ENABLE_MINIMAP_REM_TUNNELS", "toggle", null, null, null, null, "Show an overlay of the underground tunnels.");
        }

        createSep(list);
        if (createAnimatedToggle) {
            createAnimatedToggle(list, "Alt Zoom", "ENABLE_ALT_ZOOM", "Ability Menu Open", (sectionParent) => {
                if (createRow) {
                    createRow(sectionParent, "Draw Over UI", "ALT_ZOOM_DRAW_OVER_UI", "toggle", null, null, null, null);
                    createRow(sectionParent, "Rem Tunnels", "ENABLE_ALT_ZOOM_REM_TUNNELS", "toggle", null, null, null, null, "Show the underground tunnel overlay while Alt Zoom is active.");
                }
            });
            createSep(list);
            createAnimatedToggle(list, "Tab Zoom", "ENABLE_TAB_ZOOM", "Scoreboard Open", (sectionParent) => {
                if (createRow) {
                    createRow(sectionParent, "Draw Over UI", "TAB_ZOOM_DRAW_OVER_UI", "toggle", null, null, null, null);
                    createRow(sectionParent, "Rem Tunnels", "ENABLE_TAB_ZOOM_REM_TUNNELS", "toggle", null, null, null, null, "Show the underground tunnel overlay while Tab Zoom is active.");
                }
            });
        }
    }

    function renderTabByName(tabName, list) {
        switch (tabName) {
            case "Crosshair":
                renderCrosshairTab(list);
                return true;
            case "HUD":
                renderHudTab(list);
                return true;
            case "Healthbar":
                renderHealthbarTab(list);
                return true;
            case "Minimap":
                renderMinimapTab(list);
                return true;
            case "Shop":
                renderShopTab(list);
                return true;
            case "UI":
                renderUiTab(list);
                return true;
            case "Overlay":
                renderOverlayTab(list);
                return true;
            default:
                return false;
        }
    }

    // Register all gameplay tabs with window manager
    if (Q.ui?.window?.registerTabRenderer) {
        Q.ui.window.registerTabRenderer("Crosshair", renderCrosshairTab);
        Q.ui.window.registerTabRenderer("HUD", renderHudTab);
        Q.ui.window.registerTabRenderer("Healthbar", renderHealthbarTab);
        Q.ui.window.registerTabRenderer("Minimap", renderMinimapTab);
        Q.ui.window.registerTabRenderer("Shop", renderShopTab);
        Q.ui.window.registerTabRenderer("UI", renderUiTab);
        Q.ui.window.registerTabRenderer("Overlay", renderOverlayTab);
    }

    // =========================================================================
    // Public API Export & Backwards Compatibility
    // =========================================================================

    const gameplayTabsApi = {
        HEALTHBAR_TYPE_DROPDOWN_OPTIONS,
        COLOR_WARNING_THRESHOLD_OPTIONS,
        TOPBAR_ENEMY_HP_WARNING_THRESHOLD_OPTIONS,
        TOPBAR_ALLY_HP_WARNING_THRESHOLD_OPTIONS,
        RECENT_PURCHASE_REPOSITION_OPTIONS,
        STATS_POSITION_SIDE_OPTIONS,
        renderCrosshairTab,
        renderHudTab,
        renderHealthbarTab,
        renderShopTab,
        renderUiTab,
        renderOverlayTab,
        renderMinimapTab,
        render: renderTabByName,
    };

    Q.ui.gameplayTabs = gameplayTabsApi;

    if (typeof globalThis === "object" && globalThis) {
        globalThis.HEALTHBAR_TYPE_DROPDOWN_OPTIONS = HEALTHBAR_TYPE_DROPDOWN_OPTIONS;
        globalThis.COLOR_WARNING_THRESHOLD_OPTIONS = COLOR_WARNING_THRESHOLD_OPTIONS;
        globalThis.TOPBAR_ENEMY_HP_WARNING_THRESHOLD_OPTIONS = TOPBAR_ENEMY_HP_WARNING_THRESHOLD_OPTIONS;
        globalThis.TOPBAR_ALLY_HP_WARNING_THRESHOLD_OPTIONS = TOPBAR_ALLY_HP_WARNING_THRESHOLD_OPTIONS;
        globalThis.RECENT_PURCHASE_REPOSITION_OPTIONS = RECENT_PURCHASE_REPOSITION_OPTIONS;
        globalThis.STATS_POSITION_SIDE_OPTIONS = STATS_POSITION_SIDE_OPTIONS;
    }
})();

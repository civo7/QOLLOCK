// =============================================================================
// QOLLOCK — core/ql_hud.js
// =============================================================================
// OWNS:        Deadlock HUD lookups: findHud, isInHideout, isStreetBrawl.
// DOES NOT OWN: Pure DOM panel manipulation (core/ql_panel_helpers.js),
//               Feature lifecycle (FeatureRegistry)
// DEPENDS ON:  core/ql_namespace.js, core/ql_panel_helpers.js
// USED BY:     Feature manifests, core/ql_app.js
// LOAD ORDER:  6th — after ql_panel_helpers.js
// =============================================================================

(function () {
    "use strict";

    var Q = (typeof globalThis !== "undefined" && globalThis.QOL) ? globalThis.QOL : (typeof QOL !== "undefined" ? QOL : null);
    if (!Q || !Q.core) {
        $.Msg("[QOLLock] core/ql_hud: QOL.core not found — aborting.");
        return;
    }

    var _panelHelpers = Q.core.panel || Q.ui.PanelHelpers || {};
    var isAlive = _panelHelpers.isPanelAlive || _panelHelpers.isAlive || function (p) {
        return !!(p && typeof p.IsValid === "function" && p.IsValid());
    };

    var _cachedHud = null;

    /**
     * Finds the primary Deadlock #Hud panel with caching.
     */
    function findHud() {
        if (isAlive(_cachedHud)) return _cachedHud;
        _cachedHud = null;

        var MAX_DEPTH = 64;
        try {
            var ctx = $.GetContextPanel();
            if (!isAlive(ctx)) return null;
            if (ctx.id === "Hud") { _cachedHud = ctx; return ctx; }

            var hud = ctx.FindChildTraverse("Hud");
            if (isAlive(hud)) { _cachedHud = hud; return hud; }

            var absRoot = ctx;
            var depth = 0;
            while (depth < MAX_DEPTH) {
                var parent = absRoot.GetParent();
                if (!parent || !isAlive(parent)) break;
                absRoot = parent;
                depth++;
            }
            hud = absRoot.FindChildTraverse("Hud");
            if (isAlive(hud)) { _cachedHud = hud; return hud; }
            return null;
        } catch (e) {
            return null;
        }
    }

    /**
     * Whether the player is in hideout / sandbox / hero testing mode.
     */
    function isInHideout(root) {
        try {
            var hud = findHud();
            if (isAlive(hud) && (hud.BHasClass("connectedToHideout") || hud.BHasClass("InHideout"))) {
                return true;
            }
            if (isAlive(root) && (root.BHasClass("connectedToHideout") || root.BHasClass("InHideout"))) {
                return true;
            }
        } catch (e) {}
        return false;
    }

    /**
     * Whether the match is in street brawl mode.
     */
    function isStreetBrawl(root) {
        try {
            var hud = findHud();
            if (isAlive(hud)) {
                if (hud.BHasClass("gamemode_streetbrawl") ||
                    hud.BHasClass("StreetBrawlInterstitial") ||
                    hud.BHasClass("StreetBrawlBuyPhase") ||
                    hud.BHasClass("GameMode_StreetBrawl")) {
                    return true;
                }
                var sb = hud.FindChildTraverse("StretBrawlContainer");
                if (isAlive(sb) && (sb.visible || (sb.BHasClass && sb.BHasClass("visible")) || (sb.style && sb.style.visibility === "visible"))) {
                    return true;
                }
                var topBar = hud.FindChildTraverse("TopBar");
                if (isAlive(topBar) && (topBar.BHasClass("gamemode_streetbrawl") ||
                    topBar.BHasClass("StreetBrawlInterstitial") ||
                    topBar.BHasClass("StreetBrawlBuyPhase"))) {
                    return true;
                }
            }
            if (isAlive(root)) {
                if (root.BHasClass("gamemode_streetbrawl") ||
                    root.BHasClass("StreetBrawlInterstitial") ||
                    root.BHasClass("StreetBrawlBuyPhase") ||
                    root.BHasClass("GameMode_StreetBrawl")) {
                    return true;
                }
            }
        } catch (e) {}
        return false;
    }

    function isHudClassActive(root, className) {
        const target = root || findHud();
        if (!isAlive(target) || !className) return false;
        try { return target.BHasClass(className); } catch (e) { return false; }
    }

    const PANEL_ID_GAMEPLAY_HUD = "gameplay_hud";
    const PANEL_ID_TOP_BAR = "TopBar";
    const PANEL_ID_GOLD_AP_CONTAINER = "gold_and_ap_container";

    const getGameplayHudPanel = (root) => {
        if (!root?.FindChildTraverse) return root || null;
        return root.FindChildTraverse(PANEL_ID_GAMEPLAY_HUD) || root;
    };

    const isCustomHudContextActive = (_root) => true;

    const readPanelOpacityMaybe = (panel) => {
        if (!panel || !isAlive(panel) || !panel.style) return NaN;
        const opacity = Number(panel.style.opacity);
        if (Number.isFinite(opacity)) return opacity;
        const wash = String(panel.style.washColor || "");
        const m = wash.match(/rgba\([^,]+,[^,]+,[^,]+,\s*([0-9.]+)\s*\)/i);
        if (m) {
            const val = Number(m[1]);
            if (Number.isFinite(val)) return val;
        }
        return NaN;
    };

    const isPanelSuppressedMaybe = (panel) => {
        if (!panel || !isAlive(panel)) return true;
        const isVisible = (typeof QOL !== "undefined" && QOL.isPanelVisibleMaybe)
            ? QOL.isPanelVisibleMaybe(panel)
            : (panel.visible !== false);
        if (!isVisible) return true;
        const opacity = readPanelOpacityMaybe(panel);
        if (Number.isFinite(opacity) && opacity <= 0.01) return true;
        return false;
    };

    const isPanelEffectivelyVisibleMaybe = (panel, stopAncestor) => {
        let current = panel;
        while (current && isAlive(current)) {
            if (isPanelSuppressedMaybe(current)) return false;
            if (stopAncestor && current === stopAncestor) break;
            current = current.GetParent ? current.GetParent() : null;
        }
        return true;
    };

    const isHudVisibleForTopBarRuntime = (root, topBar) => {
        if (!root) return true;
        const hasAnyClassInHierarchySafe = (panel, classNames) => {
            if (!panel || !classNames?.length) return false;
            for (let i = 0; i < classNames.length; i++) {
                const cls = classNames[i];
                if (!cls) continue;
                try {
                    if (typeof QOL_UTILS !== "undefined" && QOL_UTILS.HasClassInHierarchy) {
                        if (QOL_UTILS.HasClassInHierarchy(panel, cls)) return true;
                    } else if (panel.BHasClass && panel.BHasClass(cls)) {
                        return true;
                    }
                } catch (_) {}
            }
            return false;
        };

        const hiddenContextClasses = ["connectedToHideout", "InHideout", "inHideout", "inHideoutIntro", "HideoutIntro"];
        const hiddenUiClasses = ["ShowEscapeMenu", "HudTakeoverEnabled"];

        const hud = (typeof QOL !== "undefined" && QOL.getCachedPanel)
            ? QOL.getCachedPanel("hudPanel")
            : (root.FindChildTraverse ? root.FindChildTraverse("Hud") : null);

        if (hasAnyClassInHierarchySafe(root, hiddenUiClasses)) return false;
        if (hasAnyClassInHierarchySafe(hud, hiddenUiClasses)) return false;
        if (hasAnyClassInHierarchySafe(root, hiddenContextClasses)) return false;
        if (hasAnyClassInHierarchySafe(hud, hiddenContextClasses)) return false;
        if (hasAnyClassInHierarchySafe(topBar, hiddenContextClasses)) return false;

        const gameplayHud = (typeof QOL !== "undefined" && QOL.getCachedPanel)
            ? QOL.getCachedPanel("gameplayHud")
            : (root.FindChildTraverse ? root.FindChildTraverse(PANEL_ID_GAMEPLAY_HUD) : null);
        const gameplayHudAlive = (typeof QOL !== "undefined" && QOL.getCachedPanel)
            ? QOL.getCachedPanel("gameplayHudAlive")
            : (root.FindChildTraverse ? root.FindChildTraverse("gameplay_hud_alive") : null);

        if (gameplayHud && !isPanelEffectivelyVisibleMaybe(gameplayHud, root)) return false;
        if (gameplayHudAlive && !isPanelEffectivelyVisibleMaybe(gameplayHudAlive, root)) return false;

        return true;
    };

    const isColorWarningEnabled = (cfg) => {
        if (typeof QOL_UTILS !== "undefined" && QOL_UTILS.IsCfgEnabled) {
            return QOL_UTILS.IsCfgEnabled(cfg, "ENABLE_COLOR_WARNING");
        }
        return Number(cfg?.ENABLE_COLOR_WARNING) === 1;
    };

    const getState = () => (typeof QOL !== "undefined" && QOL.state) ? QOL.state : (typeof State !== "undefined" ? State : { cachedPanels: {} });
    const getCachedPanel = (key) => (typeof QOL !== "undefined" && QOL.getCachedPanel) ? QOL.getCachedPanel(key) : getState()?.cachedPanels?.[key];
    const setCachedPanel = (key, p) => {
        if (typeof QOL !== "undefined" && QOL.setCachedPanel) {
            QOL.setCachedPanel(key, p);
        } else {
            const st = getState();
            if (st && st.cachedPanels) st.cachedPanels[key] = p;
        }
    };
    const resolveCachedPanel = (parent, cacheKey, traverseId) => {
        if (typeof QOL !== "undefined" && QOL.resolveCachedPanel) {
            return QOL.resolveCachedPanel(parent, cacheKey, traverseId);
        }
        return parent?.FindChildTraverse ? parent.FindChildTraverse(traverseId) : null;
    };

    function ensurePanelClassCache(cacheObj, panel) {
        if (!cacheObj) return;
        if (cacheObj.panel !== panel) {
            cacheObj.panel = panel;
            cacheObj.values = {};
        }
    }

    function setPanelClassCached(panel, cacheObj, className, enabled) {
        if (!isAlive(panel) || !cacheObj || !className) return false;
        ensurePanelClassCache(cacheObj, panel);
        const value = !!enabled;
        if (cacheObj.values[className] === value) return false;
        panel.SetHasClass(className, value);
        cacheObj.values[className] = value;
        return true;
    }

    function setPanelClassIfChanged(panel, className, enabled) {
        if (!isAlive(panel) || !className || !panel.SetHasClass) return false;
        const value = !!enabled;
        if (panel.BHasClass && panel.BHasClass(className) === value) return false;
        panel.SetHasClass(className, value);
        return true;
    }

    const COMBAT_STATUS_ALERT_PROBE_MS = 500;
    const COMBAT_STATUS_PANEL_PROBE_IDLE_MAX_MS = 3000;
    const COMBAT_STATUS_RECOVERY_MS = 3000;

    function isCombatSignalActive(root, nowMs) {
        if (!root) return false;
        const state = getState();
        if (!state.combatStatus) state.combatStatus = {};
        let alertPanel = getCachedPanel("combatStatusAlertPanel");
        if (!alertPanel && nowMs >= (state.combatStatus.nextAlertProbeMs || 0)) {
            alertPanel = root.FindChildTraverse ? root.FindChildTraverse("InCombatAlert") : null;
            setCachedPanel("combatStatusAlertPanel", alertPanel);
            const missKey = "combatStatusAlertProbeMisses";
            state[missKey] = alertPanel ? 0 : Math.min(10, (state[missKey] || 0) + 1);
            const delay = alertPanel ? COMBAT_STATUS_ALERT_PROBE_MS : Math.min(COMBAT_STATUS_PANEL_PROBE_IDLE_MAX_MS, COMBAT_STATUS_ALERT_PROBE_MS * (state[missKey] || 1));
            state.combatStatus.nextAlertProbeMs = nowMs + delay;
        }
        if (isAlive(alertPanel) && alertPanel.BHasClass && alertPanel.BHasClass("Visible")) {
            state.combatStatus.signalActive = true;
            return true;
        }
        try {
            if (root.BHasClass && (root.BHasClass("InCombat") || root.BHasClass("in_combat"))) {
                state.combatStatus.signalActive = true;
                return true;
            }
        } catch (e) {}
        return false;
    }

    function syncCombatIndicatorHealthbarClasses(root, active, enabled) {
        if (!root || !root.FindChildTraverse) return;
        const panels = [];
        const pushPanel = (panel) => {
            if (!isAlive(panel)) return;
            if (!panels.includes(panel)) panels.push(panel);
        };
        pushPanel(getCachedPanel("gameplayHud"));
        pushPanel(resolveCachedPanel(root, "healthContainer", "health_and_abilities_container"));
        pushPanel(resolveCachedPanel(root, "combatIndicatorHealthBarContent", "HealthBarContent"));
        pushPanel(resolveCachedPanel(root, "combatIndicatorHealthRegenAndTotal", "HealthRegenAndTotal"));
        pushPanel(resolveCachedPanel(root, "combatIndicatorHealthBars", "hud_health_bars"));

        for (const p of panels) {
            setPanelClassIfChanged(p, "combat_indicator_enabled", enabled);
            setPanelClassIfChanged(p, "combat_indicator_active", active);
        }
    }

    function applyRootClasses(root, cfg, nowMsLoop, hideoutConnected, hasConfigSource) {
        if (!root) return false;
        const state = getState();
        if (!state.rootClassCache) state.rootClassCache = { panel: root, values: {} };

        const redDiamondEnabled = (typeof QOL !== "undefined" && QOL.utils?.IsCfgEnabled)
            ? QOL.utils.IsCfgEnabled(cfg, "ENABLE_RED_DIAMOND")
            : (Number(cfg?.ENABLE_RED_DIAMOND) === 1);
        const hideTestingTools = Number(cfg?.ENABLE_HIDE_TESTING_TOOLS) === 1;
        const forceShowTestingTools = Number(cfg?.ENABLE_FORCE_TESTING_TOOLS) === 1 && !hideTestingTools;
        const healthbarType = (typeof QOL !== "undefined" && QOL.normalizeHealthbarTypeValue)
            ? QOL.normalizeHealthbarTypeValue(cfg?.HEALTHBAR_TYPE)
            : (Math.round(Number(cfg?.HEALTHBAR_TYPE)) || 0);
        const minimalistHealthbarEnabled = healthbarType === 1;
        const fgHealthbarEnabled = healthbarType === 2;
        const klutzHealthbarEnabled = healthbarType === 3;
        const budhudHealthbarEnabled = healthbarType === 4;
        const minecraftHealthbarEnabled = healthbarType === 5;
        const enemyV2EnhancedEnabled = false;
        const colorWarningEnabled = Number(cfg?.ENABLE_COLOR_WARNING) === 1;
        const cleanStacksEnabled = Number(cfg?.ENABLE_CLEAN_STACKS) === 1;
        const compassEnabled = Number(cfg?.ENABLE_COMPASS) === 1;
        const compassSpeedEnabled = Number(cfg?.ENABLE_COMPASS_SPEED) === 1;

        if (!compassEnabled && !compassSpeedEnabled) {
            const compassRoot = getCachedPanel("compassRoot");
            if (compassRoot?.style) {
                try { compassRoot.style.visibility = "collapse"; } catch (e) {}
            }
            const speedRoot = getCachedPanel("speedRoot");
            if (speedRoot?.style) {
                try { speedRoot.style.visibility = "collapse"; } catch (e) {}
            }
        }

        const masterPassiveEnabled = Number(cfg?.ENABLE_PASSIVE_COOLDOWN) === 1;
        const passiveCooldownMode = !masterPassiveEnabled
            ? "default"
            : ((Number(cfg?.ENABLE_OLD_ITEM_COOLDOWNS) !== 1) ? "advanced" : "basic");

        const staticSig = [
            hideoutConnected ? 1 : 0,
            cfg?.ENABLE_AMMO_STATUS,
            cfg?.ENABLE_HIDE_MAGAZINE,
            cfg?.ENABLE_HIDE_AMMO_ALL,
            cfg?.ENABLE_HIDE_RELOAD_ICON,
            cfg?.ENABLE_HIDE_RELOAD_CIRCLE,
            redDiamondEnabled ? 1 : 0,
            cfg?.ENABLE_IMPROVED_HINT,
            cfg?.ENABLE_ZIP_BOOST,
            cfg?.ENABLE_UNSECURED_SOUL_TIMER,
            cfg?.ENABLE_STAT_BONUSES,
            cfg?.ENABLE_CENTER_ESC,
            cfg?.ENABLE_CENTER_FRIENDS_LIST,
            cfg?.ENABLE_LEGACY_COOLDOWNS,
            cfg?.ENABLE_MINIMALISTIC_PAUSE,
            hideTestingTools ? 1 : 0,
            forceShowTestingTools ? 1 : 0,
            cfg?.ENABLE_SPECIALS,
            cfg?.ENABLE_HERO_SCENE_PANEL,
            cfg?.ENABLE_HIDE_FAILED_HINT,
            cfg?.ENABLE_HIDE_ABILITY_SUGGESTION,
            cfg?.ENABLE_HIDE_COSMETIC_ABILITY,
            cfg?.ENABLE_SIMPLIFY_ABILITY_ICONS,
            cfg?.ENABLE_HIDE_BEHAVIOR_SUMMARY,
            cfg?.ENABLE_BUFF_HUD,
            cfg?.ENABLE_REJUV_HUD,
            cfg?.ENABLE_MINIMAP_BUFF_TIMER,
            cfg?.ENABLE_MINIMAP_REJUV_TIMER,
            cfg?.ENABLE_BHOP,
            healthbarType,
            minecraftHealthbarEnabled ? 1 : 0,
            Number(cfg?.ENABLE_MINECRAFT_HEALTH_NUMBERS),
            colorWarningEnabled ? 1 : 0,
            cleanStacksEnabled ? 1 : 0,
            compassEnabled ? 1 : 0,
            cfg?.ENABLE_SIMPLIFY_COMPASS,
            passiveCooldownMode,
            cfg?.ENABLE_ULT_COOLDOWNS,
            cfg?.ENABLE_KEYBOARD_OVERLAY,
            cfg?.ENABLE_FULL_KEYBOARD_LAYOUT,
            cfg?.MINIMAL_MINIMAP,
            cfg?.ENABLE_MINIMAP_ELEVATION_MARKERS,
            cfg?.DISABLE_DAMAGE_REPORT,
            cfg?.DISABLE_QUICK_BUY,
            cfg?.ENABLE_ENHANCED_QUICKBUY,
            cfg?.ENHANCED_QUICKBUY_COUNT,
            cfg?.ENABLE_QUICKBUY_CLICK_TO_NOTIFY,
            cfg?.ENABLE_SHOP_ITEM_NOTIFICATIONS,
            cfg?.ENABLE_HERO_PURCHASE_POPUPS,
            cfg?.ENABLE_SHOP_RECENT_PURCHASES,
            cfg?.RECENT_PURCHASES_QUICK_MAX,
            cfg?.RECENT_PURCHASES_QUICK_DISPLAY_SEC,
            cfg?.RECENT_PURCHASES_QUICK_OPACITY,
            cfg?.RECENT_PURCHASES_PANEL_OPACITY,
            cfg?.ENABLE_HUD_SHIFT,
            cfg?.SUPPORT_16_10,
            cfg?.SUPPORT_4_3,
            cfg?.ACTIVE_PRESET_NAME,
            cfg?.ENABLE_UNSPENT_SOULS,
            cfg?.ENABLE_BETTER_UNSECURED,
            cfg?.ENABLE_MIN_SOULS,
            cfg?.ENABLE_OBJ_DMG,
            cfg?.ENABLE_OBJ_MAP,
            cfg?.ENABLE_URN_DIFF,
            cfg?.ENABLE_URN_TIMER,
            cfg?.ENABLE_MISSING_HERO,
            cfg?.ENABLE_NICKNAMES,
            cfg?.DISABLE_PLAYER_NAME_BLUR,
            cfg?.ENABLE_CUMULATIVE_DMG,
            cfg?.ENABLE_CLEAN_DAMAGE_INDICATORS,
            cfg?.ENABLE_DAMAGE_FOUNTAIN,
            cfg?.ENABLE_HIDE_SMALL_NUMBERS,
            cfg?.ENABLE_HIDE_TROOPER_DAMAGE,
            cfg?.ENABLE_SHOP_STATS,
            cfg?.ENABLE_SIMPLIFY_SHOP,
            cfg?.ENABLE_SIMPLIFY_ITEMS
        ].join("|");

        const shouldApplyStaticClasses =
            state.coreRootStaticSig !== staticSig ||
            !state.rootClassCache ||
            state.rootClassCache.panel !== root;

        const legacyCooldownsEnabled = Number(cfg?.ENABLE_LEGACY_COOLDOWNS) === 1;
        const legacyFlag = legacyCooldownsEnabled ? "1" : "0";
        if (state.legacyCooldownsUiFlagValue !== legacyFlag) {
            state.legacyCooldownsUiFlagValue = legacyFlag;
            try {
                const gameplayHud = getCachedPanel("gameplayHud") || (root.FindChildTraverse ? root.FindChildTraverse("Hud") : null);
                if (gameplayHud?.SetAttributeString) gameplayHud.SetAttributeString("qol_legacy_cooldowns_enabled", legacyFlag);
            } catch (e) {}
        }

        const enhancedQuickbuyEnabled = Number(cfg?.ENABLE_ENHANCED_QUICKBUY) === 1 && Number(cfg?.DISABLE_QUICK_BUY) !== 1;
        const quickbuyClickToNotifyEnabled = Number(cfg?.ENABLE_QUICKBUY_CLICK_TO_NOTIFY) === 1 && Number(cfg?.DISABLE_QUICK_BUY) !== 1;
        const shopRecentPurchasesEnabled = Number(cfg?.ENABLE_SHOP_RECENT_PURCHASES) === 1;
        const shopRecentPurchasesRedux = Number(cfg?.ENABLE_HERO_PURCHASE_POPUPS) === 1;

        if (shouldApplyStaticClasses) {
            const rc = state.rootClassCache;
            setPanelClassCached(root, rc, "hide_ammo_custom", cfg?.ENABLE_AMMO_STATUS === 0);
            setPanelClassCached(root, rc, "hide_magazine_active", cfg?.ENABLE_HIDE_MAGAZINE === 1);
            setPanelClassCached(root, rc, "hide_current_ammo_active", cfg?.ENABLE_HIDE_AMMO_ALL === 1);
            setPanelClassCached(root, rc, "hide_reload_icon_active", cfg?.ENABLE_HIDE_RELOAD_ICON === 1);
            setPanelClassCached(root, rc, "hide_reload_circle_active", cfg?.ENABLE_HIDE_RELOAD_CIRCLE === 1);
            const redDiamondChanged = setPanelClassCached(root, rc, "red_diamond_active", redDiamondEnabled);
            if (redDiamondChanged) {
                state.targetShapeStyleSig = "";
                state.nextTargetShapeRefreshMs = 0;
            }
            setPanelClassCached(root, rc, "improved_hint_active", Number(cfg?.ENABLE_IMPROVED_HINT) === 1);
            setPanelClassCached(root, rc, "zip_boost_active", false);
            setPanelClassCached(root, rc, "zip_boost_overlay_active", cfg?.ENABLE_ZIP_BOOST === 1 && !hideoutConnected);
            setPanelClassCached(root, rc, "unsecured_souls_overlay_active", Number(cfg?.ENABLE_UNSECURED_SOUL_TIMER) === 1 && !hideoutConnected);
            setPanelClassCached(root, rc, "stat_bonuses_overlay_active", cfg?.ENABLE_STAT_BONUSES === 1 && !hideoutConnected);
            setPanelClassCached(root, rc, "center_esc_active", cfg?.ENABLE_CENTER_ESC === 1);
            setPanelClassCached(root, rc, "center_friends_list_active", Number(cfg?.ENABLE_CENTER_FRIENDS_LIST) === 1);
            setPanelClassCached(root, rc, "legacy_cooldowns_active", legacyCooldownsEnabled);
            setPanelClassCached(root, rc, "minimal_pause_active", Number(cfg?.ENABLE_MINIMALISTIC_PAUSE) === 1);
            setPanelClassCached(root, rc, "force_testing_tools_active", forceShowTestingTools);
            setPanelClassCached(root, rc, "hide_testing_tools_active", hideTestingTools);
            setPanelClassCached(root, rc, "specials_active", cfg?.ENABLE_SPECIALS === 1);
            setPanelClassCached(root, rc, "hero_scene_panel_visible", cfg?.ENABLE_HERO_SCENE_PANEL === 1);
            if (!(cfg?.QOLLOCK_DEV_CORE_ROOT_TEST_MODE === 1)) {
                setPanelClassCached(root, rc, "hide_failed_hint_active", cfg?.ENABLE_HIDE_FAILED_HINT === 1);
            }
            setPanelClassCached(root, rc, "hide_ability_suggestion_active", cfg?.ENABLE_HIDE_ABILITY_SUGGESTION === 1);
            if (!(cfg?.QOLLOCK_DEV_CORE_ROOT_TEST_MODE === 1)) {
                setPanelClassCached(root, rc, "hide_cosmetic_ability_active", cfg?.ENABLE_HIDE_COSMETIC_ABILITY === 1);
                setPanelClassCached(root, rc, "simplify_ability_icons_active", cfg?.ENABLE_SIMPLIFY_ABILITY_ICONS === 1);
            }
            setPanelClassCached(root, rc, "hide_behavior_summary_active", cfg?.ENABLE_HIDE_BEHAVIOR_SUMMARY === 1);
            setPanelClassCached(root, rc, "buff_hud_disabled", cfg?.ENABLE_BUFF_HUD === 0);
            setPanelClassCached(root, rc, "rejuv_hud_disabled", cfg?.ENABLE_REJUV_HUD === 0);
            setPanelClassCached(root, rc, "minimap_buff_timer_disabled", Number(cfg?.ENABLE_MINIMAP_BUFF_TIMER) !== 1);
            setPanelClassCached(root, rc, "minimap_rejuv_timer_disabled", Number(cfg?.ENABLE_MINIMAP_REJUV_TIMER) !== 1);
            setPanelClassCached(root, rc, "bhop_gamemode_active", false);
            setPanelClassCached(root, rc, "minimalist_healthbar_active", minimalistHealthbarEnabled);
            setPanelClassCached(root, rc, "fg_healthbar_active", fgHealthbarEnabled);
            setPanelClassCached(root, rc, "klutz_healthbar_active", klutzHealthbarEnabled);
            setPanelClassCached(root, rc, "budhud_healthbar_active", budhudHealthbarEnabled);
            setPanelClassCached(root, rc, "minecraft_healthbar_active", minecraftHealthbarEnabled);
            setPanelClassCached(root, rc, "minecraft_health_numbers_disabled", minecraftHealthbarEnabled && Number(cfg?.ENABLE_MINECRAFT_HEALTH_NUMBERS) !== 1);
            setPanelClassCached(root, rc, "enemy_v2_enhanced_active", enemyV2EnhancedEnabled);
            setPanelClassCached(root, rc, "enemy_v2_enhanced_off", !enemyV2EnhancedEnabled);
            setPanelClassCached(root, rc, "colored_healthbar_active", colorWarningEnabled && healthbarType === 0);
            setPanelClassCached(root, rc, "clean_stacks_active", cleanStacksEnabled && !minecraftHealthbarEnabled);
            setPanelClassCached(root, rc, "clean_stacks_inactive", false);
            setPanelClassCached(root, rc, "compass_active", compassEnabled);
            setPanelClassCached(root, rc, "simplify_compass_active", cfg?.ENABLE_SIMPLIFY_COMPASS === 1);
            setPanelClassCached(root, rc, "ult_cooldowns_active", cfg?.ENABLE_ULT_COOLDOWNS === 1);
            setPanelClassCached(root, rc, "keyboard_overlay_active", cfg?.ENABLE_KEYBOARD_OVERLAY === 1);
            setPanelClassCached(root, rc, "keyboard_overlay_full_active", cfg?.ENABLE_FULL_KEYBOARD_LAYOUT === 1);
            setPanelClassCached(root, rc, "minimalist_minimap_active", cfg?.MINIMAL_MINIMAP === 1);
            setPanelClassCached(root, rc, "qol_minimap_elevation_markers_active", Number(cfg?.ENABLE_MINIMAP_ELEVATION_MARKERS) === 1);
            if (!(cfg?.QOLLOCK_DEV_CORE_ROOT_TEST_MODE === 1)) {
                setPanelClassCached(root, rc, "disable_damage_report_active", cfg?.DISABLE_DAMAGE_REPORT === 1);
            }
            setPanelClassCached(root, rc, "disable_quick_buy_active", cfg?.DISABLE_QUICK_BUY === 1);
            setPanelClassCached(root, rc, "hud_shift_active", cfg?.ENABLE_HUD_SHIFT === 1);
            setPanelClassCached(root, rc, "support_16_10_active", cfg?.SUPPORT_16_10 === 1);
            setPanelClassCached(root, rc, "support_4_3_active", cfg?.SUPPORT_4_3 === 1);
            setPanelClassCached(root, rc, "unspent_souls_disabled", cfg?.ENABLE_UNSPENT_SOULS === 0);
            setPanelClassCached(root, rc, "better_unsecured_active", cfg?.ENABLE_BETTER_UNSECURED === 1);
            setPanelClassCached(root, rc, "min_souls_disabled", cfg?.ENABLE_MIN_SOULS === 0);
            setPanelClassCached(root, rc, "obj_dmg_disabled", cfg?.ENABLE_OBJ_DMG === 0);
            setPanelClassCached(root, rc, "obj_map_disabled", cfg?.ENABLE_OBJ_MAP === 0);
            setPanelClassCached(root, rc, "urn_diff_disabled", cfg?.ENABLE_URN_DIFF === 0);
            setPanelClassCached(root, rc, "rift_timer_disabled", cfg?.ENABLE_URN_TIMER === 0);
            setPanelClassCached(root, rc, "missing_hero_disabled", cfg?.ENABLE_MISSING_HERO === 0);
            setPanelClassCached(root, rc, "nicknames_active", Number(cfg?.ENABLE_NICKNAMES) === 1);
            setPanelClassCached(root, rc, "disable_player_name_blur_active", Number(cfg?.DISABLE_PLAYER_NAME_BLUR) === 1);
            setPanelClassCached(root, rc, "cumulative_dmg_disabled", cfg?.ENABLE_CUMULATIVE_DMG === 0);
            setPanelClassCached(root, rc, "clean_damage_indicators_active", Number(cfg?.ENABLE_CLEAN_DAMAGE_INDICATORS) === 1);
            setPanelClassCached(root, rc, "damage_fountain_active", cfg?.ENABLE_DAMAGE_FOUNTAIN === 1);
            setPanelClassCached(root, rc, "hide_small_numbers_active", cfg?.ENABLE_HIDE_SMALL_NUMBERS === 1);
            setPanelClassCached(root, rc, "hide_trooper_damage_active", cfg?.ENABLE_HIDE_TROOPER_DAMAGE === 1);
            setPanelClassCached(root, rc, "shop_stats_disabled", cfg?.ENABLE_SHOP_STATS === 0);
            setPanelClassCached(root, rc, "simplify_shop_active", cfg?.ENABLE_SIMPLIFY_SHOP === 1);
            setPanelClassCached(root, rc, "simplify_items_active", cfg?.ENABLE_SIMPLIFY_ITEMS === 1);
            setPanelClassCached(root, rc, "enhanced_quickbuy_active", enhancedQuickbuyEnabled);
            setPanelClassCached(root, rc, "shop_click_to_notify_active", quickbuyClickToNotifyEnabled);
            setPanelClassCached(root, rc, "shop_recent_purchases_active", shopRecentPurchasesEnabled);
            setPanelClassCached(root, rc, "shop_recent_purchases_redux", shopRecentPurchasesRedux);
            setPanelClassCached(root, rc, "shop_item_notifications_active", Number(cfg?.ENABLE_SHOP_ITEM_NOTIFICATIONS) === 1);
            state.coreRootStaticSig = staticSig;
        }

        let combatIndicatorActive = false;
        let combatIndicatorSignal = false;
        let combatIndicatorRecoveryActive = false;
        const combatIndicatorEnabled = Number(cfg?.ENABLE_COMBAT_INDICATOR) === 1;
        if (combatIndicatorEnabled) {
            combatIndicatorSignal = isCombatSignalActive(root, nowMsLoop) === true;
            if (combatIndicatorSignal) {
                state.combatStatus.lastCombatMs = nowMsLoop;
            } else {
                const recentCombatMs = nowMsLoop - Number(state.combatStatus.lastCombatMs || 0);
                combatIndicatorRecoveryActive = state.combatStatus.lastCombatMs > 0 && recentCombatMs <= COMBAT_STATUS_RECOVERY_MS;
            }
            combatIndicatorActive = combatIndicatorSignal || combatIndicatorRecoveryActive;
        }
        setPanelClassCached(root, state.rootClassCache, "combat_indicator_enabled", combatIndicatorEnabled);
        setPanelClassCached(root, state.rootClassCache, "combat_indicator_active", combatIndicatorActive);
        syncCombatIndicatorHealthbarClasses(root, combatIndicatorActive, combatIndicatorEnabled);

        let quickbuyPanel = getCachedPanel("quickbuy");
        if (!quickbuyPanel) {
            quickbuyPanel = root.FindChildTraverse ? root.FindChildTraverse("CitadelHudQuickbuy") : null;
            setCachedPanel("quickbuy", quickbuyPanel);
        }
        if (quickbuyPanel) {
            if (!state.quickbuyClassCache) {
                state.quickbuyClassCache = { panel: null, values: {} };
            }
            const enhancedQuickbuyCount = enhancedQuickbuyEnabled
                ? Math.max(1, Math.min(6, Math.round(Number(cfg?.ENHANCED_QUICKBUY_COUNT) || 3)))
                : 3;
            setPanelClassCached(quickbuyPanel, state.quickbuyClassCache, "enhanced_quickbuy_active", enhancedQuickbuyEnabled);
            setPanelClassCached(quickbuyPanel, state.quickbuyClassCache, "shop_click_to_notify_active", quickbuyClickToNotifyEnabled);
            try {
                quickbuyPanel.SetAttributeInt("qol_enhanced_quickbuy_count", enhancedQuickbuyCount);
                root.SetAttributeInt("qol_enhanced_quickbuy_count", enhancedQuickbuyCount);
            } catch (e) {}
        } else {
            state.quickbuyClassCache = null;
        }

        if (Number(cfg?.ENABLE_HIDE_RELOAD_CIRCLE) === 1 || getCachedPanel("activeReloadProgressBar")) {
            if (typeof QOL.updateReloadCircleExceptionState === "function") {
                QOL.updateReloadCircleExceptionState(root, cfg);
            }
        }

        const needsHealthContainerWork = colorWarningEnabled || state.coloredHealthbarBridgeValue !== "" || shouldApplyStaticClasses;
        if (needsHealthContainerWork) {
            let healthContainer = getCachedPanel("healthContainer");
            if (!healthContainer) {
                healthContainer = root.FindChildTraverse ? root.FindChildTraverse("health_and_abilities_container") : null;
                setCachedPanel("healthContainer", healthContainer);
            }
            if (healthContainer?.SetAttributeString) {
                const coloredHealthbarFlag = colorWarningEnabled ? "1" : "0";
                if (state.coloredHealthbarBridgeValue !== coloredHealthbarFlag) {
                    healthContainer.SetAttributeString("QOL_COLORED_HEALTHBAR", coloredHealthbarFlag);
                    state.coloredHealthbarBridgeValue = coloredHealthbarFlag;
                }
            } else if (state.coloredHealthbarBridgeValue !== "") {
                state.coloredHealthbarBridgeValue = "";
            }
        }

        let abilitiesContainer = getCachedPanel("abilitiesContainer");
        if (shouldApplyStaticClasses || abilitiesContainer) {
            if (!abilitiesContainer) {
                abilitiesContainer = root.FindChildTraverse ? root.FindChildTraverse("CitadelHudAbilitiesContainer") : null;
                setCachedPanel("abilitiesContainer", abilitiesContainer);
            }
        }
        if (abilitiesContainer && shouldApplyStaticClasses) {
            if (!state.abilitiesClassCache) state.abilitiesClassCache = { panel: abilitiesContainer, values: {} };
            setPanelClassCached(abilitiesContainer, state.abilitiesClassCache, "clean_stacks_active", cleanStacksEnabled && !minecraftHealthbarEnabled);
            setPanelClassCached(abilitiesContainer, state.abilitiesClassCache, "clean_stacks_inactive", false);
        }

        if (
            shouldApplyStaticClasses ||
            state.passiveCooldownModeApplied !== passiveCooldownMode ||
            (passiveCooldownMode !== "default" && !getCachedPanel("passiveHud")) ||
            state.oldItemCooldownRuntimeWasActive
        ) {
            let passiveHud = getCachedPanel("passiveHud");
            if (!passiveHud) {
                passiveHud = root.FindChildTraverse ? root.FindChildTraverse("hud_passive_items") : null;
                setCachedPanel("passiveHud", passiveHud);
            }
            if (!(cfg?.QOLLOCK_DEV_CORE_ROOT_TEST_MODE === 1)) {
                const basicModeActive = passiveCooldownMode === "basic";
                const advancedModeActive = passiveCooldownMode === "advanced";
                setPanelClassCached(root, state.rootClassCache, "passive_cooldown_basic_active", basicModeActive);
                setPanelClassCached(root, state.rootClassCache, "passive_cooldown_advanced_active", advancedModeActive);
                setPanelClassCached(root, state.rootClassCache, "old_item_cooldowns_active", false);
                setPanelClassCached(root, state.rootClassCache, "passive_cooldown_custom_active", false);
                if (passiveHud) {
                    if (!state.passiveHudClassCache) state.passiveHudClassCache = { panel: passiveHud, values: {} };
                    setPanelClassCached(passiveHud, state.passiveHudClassCache, "passive_cooldown_basic_active", basicModeActive);
                    setPanelClassCached(passiveHud, state.passiveHudClassCache, "old_item_cooldowns_active", false);
                }
                state.passiveCooldownModeApplied = passiveCooldownMode;
            }
        }

        // Call optional subsystem handlers if present
        if (hasNonDefaultChatRuntimeConfig(cfg) || state.chatStyleApplied) {
            updateChatRuntime(root, cfg);
        }
        if (needsDamageReportOffsetWork(cfg)) {
            updateDamageReportOffsets(root, cfg);
        }
        if (typeof QOL.updateUrnTrackerOverlay === "function" && QOL.needsUrnTrackerRuntimeWork?.(cfg)) {
            QOL.updateUrnTrackerOverlay(root, cfg, nowMsLoop);
        }

        return redDiamondEnabled;
    }

    const resetDamageReportOffsetRuntime = (panel) => {
        if (!isAlive(panel)) return;
        try { panel.style.x = "0px"; } catch (_) {}
        try { panel.style.y = "0px"; } catch (_) {}
    };

    const needsDamageReportOffsetWork = (cfg) => {
        if (!cfg) return false;
        let offsetX = Number(cfg.DAMAGE_REPORT_X_OFFSET);
        let offsetY = Number(cfg.DAMAGE_REPORT_Y_OFFSET);
        if (!Number.isFinite(offsetX)) offsetX = 0;
        if (!Number.isFinite(offsetY)) offsetY = 0;
        if (Math.round(offsetX) !== 0 || Math.round(offsetY) !== 0) return true;
        const st = getState();
        return Boolean(st.damageReportOffsetApplied || st.damageReportOffsetSig || isAlive(st.damageReportOffsetPanel));
    };

    const hasNonDefaultChatRuntimeConfig = (cfg) => {
        if (!cfg) return false;
        let enabled = (cfg.ENABLE_CHAT == null) ? 1 : Math.round(Number(cfg.ENABLE_CHAT));
        let scale = (cfg.CHAT_SCALE == null) ? 100 : Math.round(Number(cfg.CHAT_SCALE));
        let offsetX = (cfg.CHAT_X_OFFSET == null) ? 0 : Math.round(Number(cfg.CHAT_X_OFFSET));
        let offsetY = (cfg.CHAT_Y_OFFSET == null) ? 0 : Math.round(Number(cfg.CHAT_Y_OFFSET));
        if (!Number.isFinite(enabled)) enabled = 1;
        if (!Number.isFinite(scale)) scale = 100;
        if (!Number.isFinite(offsetX)) offsetX = 0;
        if (!Number.isFinite(offsetY)) offsetY = 0;
        return enabled !== 1 || scale !== 100 || offsetX !== 0 || offsetY !== 0;
    };

    const resetChatRuntime = (panel) => {
        if (!isAlive(panel)) return;
        try { panel.style.x = "0px"; } catch (_) {}
        try { panel.style.y = "0px"; } catch (_) {}
        try { panel.style.preTransformScale2d = "1.00, 1.00"; } catch (_) {}
        try { panel.style.uiScale = "100%"; } catch (_) {}
        try { panel.style.visibility = "visible"; } catch (_) {}
    };

    const updateChatRuntime = (root, cfg) => {
        const livePanel = root?.FindChildTraverse ? root.FindChildTraverse("Chat") : null;
        const chatPanel = isAlive(livePanel) ? livePanel : getCachedPanel("chatPanel");
        if (chatPanel !== getCachedPanel("chatPanel")) {
            setCachedPanel("chatPanel", chatPanel);
        }

        const st = getState();
        const previousPanel = isAlive(st.chatStylePanel) ? st.chatStylePanel : null;
        if (previousPanel && previousPanel !== chatPanel) {
            resetChatRuntime(previousPanel);
        }

        if (!chatPanel) {
            st.chatStyleSig = "";
            st.chatStyleApplied = false;
            st.chatStylePanel = null;
            return;
        }

        let scale = (cfg.CHAT_SCALE == null) ? 100 : Math.round(Number(cfg.CHAT_SCALE));
        let enabled = (cfg.ENABLE_CHAT == null) ? 1 : Math.round(Number(cfg.ENABLE_CHAT));
        let offsetX = (cfg.CHAT_X_OFFSET == null) ? 0 : Math.round(Number(cfg.CHAT_X_OFFSET));
        let offsetY = (cfg.CHAT_Y_OFFSET == null) ? 0 : Math.round(Number(cfg.CHAT_Y_OFFSET));
        if (!Number.isFinite(enabled)) enabled = 1;
        if (!Number.isFinite(scale)) scale = 100;
        if (!Number.isFinite(offsetX)) offsetX = 0;
        if (!Number.isFinite(offsetY)) offsetY = 0;
        if (scale < 50) scale = 50;
        if (scale > 200) scale = 200;
        if (offsetX < -1500) offsetX = -1500;
        if (offsetX > 1500) offsetX = 1500;
        if (offsetY < -250) offsetY = -250;
        if (offsetY > 800) offsetY = 800;

        const scaleText = `${scale}%`;
        const styleSig = `${enabled}|${scaleText}|${offsetX}|${offsetY}`;
        if (st.chatStyleApplied && st.chatStylePanel === chatPanel && st.chatStyleSig === styleSig) {
            return;
        }

        chatPanel.style.visibility = enabled === 1 ? "visible" : "collapse";
        chatPanel.style.x = `${offsetX}px`;
        chatPanel.style.y = `${-offsetY}px`;
        chatPanel.style.preTransformScale2d = "1.00, 1.00";
        chatPanel.style.uiScale = scaleText;

        st.chatStyleSig = styleSig;
        st.chatStyleApplied = true;
        st.chatStylePanel = chatPanel;
    };

    const updateDamageReportOffsets = (root, cfg) => {
        const livePanel = root?.FindChildTraverse ? root.FindChildTraverse("CitadelHudDamageReport") : null;
        const damageReportPanel = isAlive(livePanel) ? livePanel : getCachedPanel("damageReportPanel");
        if (damageReportPanel !== getCachedPanel("damageReportPanel")) {
            setCachedPanel("damageReportPanel", damageReportPanel);
        }

        const st = getState();
        const previousPanel = isAlive(st.damageReportOffsetPanel) ? st.damageReportOffsetPanel : null;
        if (previousPanel && previousPanel !== damageReportPanel) {
            resetDamageReportOffsetRuntime(previousPanel);
        }

        if (!damageReportPanel) {
            st.damageReportOffsetSig = "";
            st.damageReportOffsetApplied = false;
            st.damageReportOffsetPanel = null;
            return;
        }

        let offsetX = (cfg.DAMAGE_REPORT_X_OFFSET == null) ? 0 : Math.round(Number(cfg.DAMAGE_REPORT_X_OFFSET));
        let offsetY = (cfg.DAMAGE_REPORT_Y_OFFSET == null) ? 0 : Math.round(Number(cfg.DAMAGE_REPORT_Y_OFFSET));
        const styleSig = `${offsetX}|${offsetY}`;

        if (st.damageReportOffsetApplied && st.damageReportOffsetPanel === damageReportPanel && st.damageReportOffsetSig === styleSig) {
            return;
        }

        damageReportPanel.style.x = `${offsetX}px`;
        damageReportPanel.style.y = `${-offsetY}px`;

        if (offsetX === 0 && offsetY === 0) {
            st.damageReportOffsetSig = "";
            st.damageReportOffsetApplied = false;
            st.damageReportOffsetPanel = null;
        } else {
            st.damageReportOffsetSig = styleSig;
            st.damageReportOffsetApplied = true;
            st.damageReportOffsetPanel = damageReportPanel;
        }
    };

    const getPanelClassTokens = (panel) => {
        if (!panel?.GetAttributeString) return [];
        const classAttr = panel.GetAttributeString("class", "");
        if (!classAttr) return [];
        return classAttr.split(/\s+/).filter(Boolean);
    };

    const panelHasClassToken = (panel, token) => {
        if (!panel || !token) return false;
        if (panel.BHasClass && panel.BHasClass(token)) return true;
        const cls = getPanelClassTokens(panel);
        if (cls.includes(token)) return true;
        const kids = (panel.Children && panel.Children()) || [];
        for (let k = 0; k < kids.length; k++) {
            const child = kids[k];
            if (!child) continue;
            if (child.BHasClass && child.BHasClass(token)) return true;
            if (getPanelClassTokens(child).includes(token)) return true;
        }
        return false;
    };

    const getHighestRejuvChargeTokenOnPanel = (panel) => {
        if (!panel) return 0;
        let max = 0;

        const scanNode = (node) => {
            if (!node) return;
            const tokens = getPanelClassTokens(node);
            for (let i = 0; i < tokens.length; i++) {
                const token = tokens[i];
                if (!token?.startsWith("RejuvCount_")) continue;
                const value = parseInt(token.slice("RejuvCount_".length), 10);
                if (Number.isFinite(value) && value > max) max = value;
            }
            if (node.BHasClass) {
                for (let count = 1; count <= 4; count++) {
                    if (node.BHasClass(`RejuvCount_${count}`) && count > max) {
                        max = count;
                    }
                }
            }
        };

        scanNode(panel);
        const kids = (panel.Children && panel.Children()) || [];
        for (let k = 0; k < kids.length; k++) {
            scanNode(kids[k]);
        }
        return max;
    };

    // Attach to namespace
    Q.core.hud = {
        findHud,
        isInHideout,
        isStreetBrawl,
        isHudClassActive,
        ensurePanelClassCache,
        setPanelClassCached,
        setPanelClassIfChanged,
        isCombatSignalActive,
        syncCombatIndicatorHealthbarClasses,
        applyRootClasses,
        updateChatRuntime,
        hasNonDefaultChatRuntimeConfig,
        resetChatRuntime,
        updateDamageReportOffsets,
        needsDamageReportOffsetWork,
        resetDamageReportOffsetRuntime,
        getPanelClassTokens,
        panelHasClassToken,
        getHighestRejuvChargeTokenOnPanel,
        getGameplayHudPanel,
        isCustomHudContextActive,
        isHudVisibleForTopBarRuntime,
        isColorWarningEnabled,
        PANEL_ID_GAMEPLAY_HUD,
        PANEL_ID_TOP_BAR,
        PANEL_ID_GOLD_AP_CONTAINER
    };

    // Backward compat: alias on PanelHelpers if not already present
    if (Q.ui && Q.ui.PanelHelpers) {
        Q.ui.PanelHelpers.findHud = findHud;
    }
    if (Q.core.panel) {
        Q.core.panel.findHud = findHud;
    }

    // Direct backward compat on QOL root
    Q.findHud = findHud;
    Q.isConnectedToHideout = isInHideout;
    Q.isHudClassActive = isHudClassActive;
    Q.isStreetBrawlModeActive = isStreetBrawl;
    Q.applyCoreLoopRootClassesAndState = applyRootClasses;
    Q.setPanelClassCached = setPanelClassCached;
    Q.setPanelClassIfChanged = setPanelClassIfChanged;
    Q.updateChatRuntime = updateChatRuntime;
    Q.hasNonDefaultChatRuntimeConfig = hasNonDefaultChatRuntimeConfig;
    Q.resetChatRuntime = resetChatRuntime;
    Q.updateDamageReportOffsets = updateDamageReportOffsets;
    Q.needsDamageReportOffsetWork = needsDamageReportOffsetWork;
    Q.resetDamageReportOffsetRuntime = resetDamageReportOffsetRuntime;
    Q.getPanelClassTokens = getPanelClassTokens;
    Q.panelHasClassToken = panelHasClassToken;
    Q.getHighestRejuvChargeTokenOnPanel = getHighestRejuvChargeTokenOnPanel;
    Q.getGameplayHudPanel = getGameplayHudPanel;
    Q.isCustomHudContextActive = isCustomHudContextActive;
    Q.isHudVisibleForTopBarRuntime = isHudVisibleForTopBarRuntime;
    Q.isColorWarningEnabled = isColorWarningEnabled;
    Q.panelIdTopBar = PANEL_ID_TOP_BAR;
    Q.panelIdGoldApContainer = PANEL_ID_GOLD_AP_CONTAINER;

    $.Msg("[QOLLock] core/ql_hud: attached to QOL.core.hud");
})();

// =============================================================================
// QOLLOCK — core/ql_hud.js
// =============================================================================
// OWNS:        Deadlock HUD lookups: findHud, isInHideout, isStreetBrawl,
//              ensureTopBarGated, root class synchronizer, and HUD sub-element
//              helpers.
// DOES NOT OWN: Pure DOM panel manipulation (core/ql_panel_helpers.js),
//               Feature lifecycle (FeatureRegistry)
// DEPENDS ON:  core/ql_namespace.js, core/ql_panel_helpers.js
// USED BY:     Feature manifests, core/ql_app.js
// LOAD ORDER:  6th — after ql_panel_helpers.js
// =============================================================================

(() => {
    "use strict";

    const Q = (typeof globalThis !== "undefined" && globalThis.QOL) ? globalThis.QOL : (typeof QOL !== "undefined" ? QOL : null);
    if (!Q || !Q.core) {
        $.Msg("[QOLLock] core/ql_hud: QOL.core not found — aborting.");
        return;
    }

    const _panelHelpers = Q.core.panel || Q.ui.PanelHelpers || {};
    const isAlive = _panelHelpers.isPanelAlive || _panelHelpers.isAlive || ((p) => !!(p && typeof p.IsValid === "function" && p.IsValid()));

    let _cachedHud = null;

    /**
     * Finds the primary Deadlock #Hud panel with caching.
     */
    const findHud = (preferredRoot) => {
        if (!preferredRoot && isAlive(_cachedHud)) return _cachedHud;
        _cachedHud = null;

        const MAX_DEPTH = 64;
        try {
            const ctx = preferredRoot || $.GetContextPanel();
            if (!isAlive(ctx)) return null;
            if (ctx.id === "Hud" || ctx.paneltype === "CitadelHud") {
                if (!preferredRoot) _cachedHud = ctx;
                return ctx;
            }

            let hud = ctx.FindChildTraverse ? ctx.FindChildTraverse("Hud") : null;
            if (isAlive(hud)) {
                if (!preferredRoot) _cachedHud = hud;
                return hud;
            }

            let absRoot = ctx;
            let depth = 0;
            while (depth < MAX_DEPTH) {
                const parent = absRoot.GetParent ? absRoot.GetParent() : null;
                if (!parent || !isAlive(parent)) break;
                absRoot = parent;
                depth++;
            }
            hud = absRoot.FindChildTraverse ? absRoot.FindChildTraverse("Hud") : null;
            if (isAlive(hud)) {
                if (!preferredRoot) _cachedHud = hud;
                return hud;
            }
            if (!preferredRoot) _cachedHud = absRoot;
            return absRoot;
        } catch (_) {
            return null;
        }
    };

    /**
     * Whether the player is in hideout / sandbox / hero testing mode.
     */
    const isInHideout = (root) => {
        try {
            const hud = findHud();
            if (isAlive(hud) && (hud.BHasClass("connectedToHideout") || hud.BHasClass("InHideout"))) {
                return true;
            }
            if (isAlive(root) && (root.BHasClass("connectedToHideout") || root.BHasClass("InHideout"))) {
                return true;
            }
        } catch (_) {}
        return false;
    };

    /**
     * Whether the match is in street brawl mode.
     */
    const isStreetBrawl = (root) => {
        const BRAWL_CLASSES = [
            "gamemode_streetbrawl",
            "StreetBrawlInterstitial",
            "StreetBrawlBuyPhase",
            "GameMode_StreetBrawl"
        ];
        const hasBrawlClass = (p) => {
            if (!isAlive(p)) return false;
            for (const cls of BRAWL_CLASSES) {
                if (p.BHasClass(cls)) return true;
            }
            return false;
        };

        try {
            const hud = findHud();
            if (isAlive(hud)) {
                if (hasBrawlClass(hud)) return true;
                const sb = hud.FindChildTraverse("StretBrawlContainer");
                if (isAlive(sb) && (sb.visible || sb.BHasClass("visible") || sb.style?.visibility === "visible")) {
                    return true;
                }
                const gpHud = hud.FindChildTraverse("gameplay_hud");
                if (hasBrawlClass(gpHud)) return true;
                const topBar = hud.FindChildTraverse("TopBar");
                if (hasBrawlClass(topBar)) return true;
            }
            if (isAlive(root)) {
                if (hasBrawlClass(root)) return true;
                let curr = root;
                while (isAlive(curr)) {
                    if (hasBrawlClass(curr)) return true;
                    curr = curr.GetParent ? curr.GetParent() : null;
                }
            }
        } catch (_) {}
        return false;
    };

    const isHudClassActive = (root, className) => {
        const target = root || findHud();
        if (!isAlive(target) || !className) return false;
        try {
            return target.BHasClass(className);
        } catch (_) {
            return false;
        }
    };

    const PANEL_ID_GAMEPLAY_HUD = "gameplay_hud";
    const PANEL_ID_TOP_BAR = "TopBar";
    const PANEL_ID_GOLD_AP_CONTAINER = "gold_and_ap_container";

    /**
     * Ensures TopBar has feature CSS gate class (mirroring peer/thirdeye ensureTopBarGated).
     */
    const ensureTopBarGated = (featureId) => {
        const hud = findHud();
        if (!isAlive(hud)) return null;
        const topBar = hud.FindChildTraverse("TopBar");
        if (!isAlive(topBar)) return null;
        topBar.SetHasClass(`ql_${featureId}_enabled_active`, true);
        return topBar;
    };

    const getGameplayHudPanel = (root) => {
        if (!root?.FindChildTraverse) return root || null;
        return root.FindChildTraverse(PANEL_ID_GAMEPLAY_HUD) || root;
    };

    const isCustomHudContextActive = () => true;

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
        const isVis = (typeof QOL !== "undefined" && QOL.isPanelVisibleMaybe)
            ? QOL.isPanelVisibleMaybe(panel)
            : (panel.visible !== false);
        if (!isVis) return true;
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
        const hasAnyClass = (panel, classNames) => {
            if (!panel || !classNames?.length) return false;
            for (const cls of classNames) {
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

        if (hasAnyClass(root, hiddenUiClasses)) return false;
        if (hasAnyClass(hud, hiddenUiClasses)) return false;
        if (hasAnyClass(root, hiddenContextClasses)) return false;
        if (hasAnyClass(hud, hiddenContextClasses)) return false;
        if (hasAnyClass(topBar, hiddenContextClasses)) return false;

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

    const ensurePanelClassCache = (cacheObj, panel) => {
        if (!cacheObj) return;
        if (cacheObj.panel !== panel) {
            cacheObj.panel = panel;
            cacheObj.values = {};
        }
    };

    const setPanelClassCached = (panel, cacheObj, className, enabled) => {
        if (!isAlive(panel) || !cacheObj || !className) return false;
        ensurePanelClassCache(cacheObj, panel);
        const value = Boolean(enabled);
        if (cacheObj.values[className] === value) return false;
        panel.SetHasClass(className, value);
        cacheObj.values[className] = value;
        return true;
    };

    const setPanelClassIfChanged = (panel, className, enabled) => {
        if (!isAlive(panel) || !className || !panel.SetHasClass) return false;
        const value = Boolean(enabled);
        if (panel.BHasClass && panel.BHasClass(className) === value) return false;
        panel.SetHasClass(className, value);
        return true;
    };

    const COMBAT_STATUS_ALERT_PROBE_MS = 500;
    const COMBAT_STATUS_PANEL_PROBE_IDLE_MAX_MS = 3000;
    const COMBAT_STATUS_RECOVERY_MS = 3000;

    const isCombatSignalActive = (root, nowMs) => {
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
        } catch (_) {}
        return false;
    };

    const syncCombatIndicatorHealthbarClasses = (root, active, enabled) => {
        if (!root?.FindChildTraverse) return;
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
    };

    const hasClassInHierarchy = (panel, className) => {
        if (!panel || !className) return false;
        if (typeof QOL_UTILS !== "undefined" && typeof QOL_UTILS.HasClassInHierarchy === "function") {
            return QOL_UTILS.HasClassInHierarchy(panel, className);
        }
        let cur = panel;
        let depth = 0;
        while (cur && depth < 32) {
            try {
                if (cur.BHasClass && cur.BHasClass(className)) return true;
            } catch (_) {}
            cur = cur.GetParent ? cur.GetParent() : null;
            depth++;
        }
        return false;
    };

    const updateReloadCircleExceptionState = (root, cfg) => {
        const hideReloadCircleEnabled = Number(cfg?.ENABLE_HIDE_RELOAD_CIRCLE) === 1;
        const state = getState();
        if (!hideReloadCircleEnabled) {
            setPanelClassCached(root, state.rootClassCache, "hide_reload_circle_exception_active", false);
            setCachedPanel("activeReloadProgressBar", null);
            return;
        }

        let activeReloadBar = getCachedPanel("activeReloadProgressBar");
        if (!activeReloadBar) {
            activeReloadBar = root?.FindChildTraverse ? root.FindChildTraverse("active_reload_progress_bar") : null;
            setCachedPanel("activeReloadProgressBar", activeReloadBar);
        }

        let hasActiveReloadClass = false;
        if (activeReloadBar) {
            if (activeReloadBar.BHasClass && activeReloadBar.BHasClass("has_active_reload")) hasActiveReloadClass = true;
            if (!hasActiveReloadClass) hasActiveReloadClass = hasClassInHierarchy(activeReloadBar, "has_active_reload");
        }

        let attackDelayedActive = false;
        if (root?.BHasClass && root.BHasClass("attack_delayed")) attackDelayedActive = true;
        if (!attackDelayedActive && activeReloadBar) attackDelayedActive = hasClassInHierarchy(activeReloadBar, "attack_delayed");

        let reloadingActive = false;
        if (root?.BHasClass && root.BHasClass("reloading")) reloadingActive = true;
        if (!reloadingActive && activeReloadBar) reloadingActive = hasClassInHierarchy(activeReloadBar, "reloading");

        const exceptionActive = hasActiveReloadClass && attackDelayedActive && reloadingActive;
        setPanelClassCached(root, state.rootClassCache, "hide_reload_circle_exception_active", exceptionActive);
    };

    const resetChatRuntime = (panel) => {
        if (!isAlive(panel)) return;
        try { panel.style.x = "0px"; } catch (_) {}
        try { panel.style.y = "0px"; } catch (_) {}
        try { panel.style.preTransformScale2d = "1.00, 1.00"; } catch (_) {}
        try { panel.style.uiScale = "100%"; } catch (_) {}
        try { panel.style.visibility = "visible"; } catch (_) {}
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

        let offsetX = (cfg?.DAMAGE_REPORT_X_OFFSET == null) ? 0 : Math.round(Number(cfg?.DAMAGE_REPORT_X_OFFSET));
        let offsetY = (cfg?.DAMAGE_REPORT_Y_OFFSET == null) ? 0 : Math.round(Number(cfg?.DAMAGE_REPORT_Y_OFFSET));
        if (!Number.isFinite(offsetX)) offsetX = 0;
        if (!Number.isFinite(offsetY)) offsetY = 0;
        if (offsetX < -1500) offsetX = -1500;
        if (offsetX > 1500) offsetX = 1500;
        if (offsetY < -500) offsetY = -500;
        if (offsetY > 500) offsetY = 500;

        const offsetSig = `${offsetX}|${offsetY}`;
        if (st.damageReportOffsetApplied && st.damageReportOffsetPanel === damageReportPanel && st.damageReportOffsetSig === offsetSig) {
            return;
        }

        damageReportPanel.style.x = `${offsetX}px`;
        damageReportPanel.style.y = `${-offsetY}px`;

        st.damageReportOffsetSig = offsetSig;
        st.damageReportOffsetApplied = true;
        st.damageReportOffsetPanel = damageReportPanel;
    };

    const getPanelClassTokens = (panel) => {
        if (!isAlive(panel)) return [];
        try {
            if (typeof panel.GetClassTokens === "function") {
                const tokens = panel.GetClassTokens();
                if (Array.isArray(tokens)) return tokens;
            }
        } catch (_) {}
        return [];
    };

    const panelHasClassToken = (panel, token) => {
        if (!isAlive(panel) || !token) return false;
        try {
            return typeof panel.BHasClass === "function" && panel.BHasClass(token);
        } catch (_) {
            return false;
        }
    };

    const getHighestRejuvChargeTokenOnPanel = (panel) => {
        if (!isAlive(panel)) return 0;
        let max = 0;
        const scanNode = (node) => {
            if (!isAlive(node)) return;
            const tokens = getPanelClassTokens(node);
            for (const t of tokens) {
                const m = String(t).match(/^rejuv_charges_(\d+)$/i);
                if (m) {
                    const num = parseInt(m[1], 10);
                    if (num > max) max = num;
                }
            }
        };
        scanNode(panel);
        const kids = panel.Children ? panel.Children() : [];
        for (let k = 0; k < kids.length; k++) {
            scanNode(kids[k]);
        }
        return max;
    };

    /**
     * Root CSS classes synchronizer for HUD.
     */
    const applyRootClasses = (root, cfg, nowMsLoop, hideoutConnected) => {
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
                try { compassRoot.style.visibility = "collapse"; } catch (_) {}
            }
            const speedRoot = getCachedPanel("speedRoot");
            if (speedRoot?.style) {
                try { speedRoot.style.visibility = "collapse"; } catch (_) {}
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
            } catch (_) {}
        }

        const enhancedQuickbuyEnabled = Number(cfg?.ENABLE_ENHANCED_QUICKBUY) === 1 && Number(cfg?.DISABLE_QUICK_BUY) !== 1;
        const quickbuyClickToNotifyEnabled = Number(cfg?.ENABLE_QUICKBUY_CLICK_TO_NOTIFY) === 1 && Number(cfg?.DISABLE_QUICK_BUY) !== 1;
        const shopRecentPurchasesEnabled = Number(cfg?.ENABLE_SHOP_RECENT_PURCHASES) === 1;
        const shopRecentPurchasesRedux = Number(cfg?.ENABLE_HERO_PURCHASE_POPUPS) === 1;

        if (shouldApplyStaticClasses) {
            const rc = state.rootClassCache;
            const notDevTestMode = cfg?.QOLLOCK_DEV_CORE_ROOT_TEST_MODE !== 1;

            const staticRules = [
                ["hide_ammo_custom", cfg?.ENABLE_AMMO_STATUS === 0],
                ["hide_magazine_active", cfg?.ENABLE_HIDE_MAGAZINE === 1],
                ["hide_current_ammo_active", cfg?.ENABLE_HIDE_AMMO_ALL === 1],
                ["hide_reload_icon_active", cfg?.ENABLE_HIDE_RELOAD_ICON === 1],
                ["hide_reload_circle_active", cfg?.ENABLE_HIDE_RELOAD_CIRCLE === 1],
                ["improved_hint_active", Number(cfg?.ENABLE_IMPROVED_HINT) === 1],
                ["zip_boost_active", false],
                ["zip_boost_overlay_active", cfg?.ENABLE_ZIP_BOOST === 1 && !hideoutConnected],
                ["unsecured_souls_overlay_active", Number(cfg?.ENABLE_UNSECURED_SOUL_TIMER) === 1 && !hideoutConnected],
                ["stat_bonuses_overlay_active", cfg?.ENABLE_STAT_BONUSES === 1 && !hideoutConnected],
                ["center_esc_active", cfg?.ENABLE_CENTER_ESC === 1],
                ["center_friends_list_active", Number(cfg?.ENABLE_CENTER_FRIENDS_LIST) === 1],
                ["legacy_cooldowns_active", legacyCooldownsEnabled],
                ["minimal_pause_active", Number(cfg?.ENABLE_MINIMALISTIC_PAUSE) === 1],
                ["force_testing_tools_active", forceShowTestingTools],
                ["hide_testing_tools_active", hideTestingTools],
                ["specials_active", cfg?.ENABLE_SPECIALS === 1],
                ["hero_scene_panel_visible", cfg?.ENABLE_HERO_SCENE_PANEL === 1],
                ["hide_failed_hint_active", notDevTestMode && cfg?.ENABLE_HIDE_FAILED_HINT === 1],
                ["hide_ability_suggestion_active", cfg?.ENABLE_HIDE_ABILITY_SUGGESTION === 1],
                ["hide_cosmetic_ability_active", notDevTestMode && cfg?.ENABLE_HIDE_COSMETIC_ABILITY === 1],
                ["simplify_ability_icons_active", notDevTestMode && cfg?.ENABLE_SIMPLIFY_ABILITY_ICONS === 1],
                ["hide_behavior_summary_active", cfg?.ENABLE_HIDE_BEHAVIOR_SUMMARY === 1],
                ["buff_hud_disabled", cfg?.ENABLE_BUFF_HUD === 0],
                ["rejuv_hud_disabled", cfg?.ENABLE_REJUV_HUD === 0],
                ["minimap_buff_timer_disabled", Number(cfg?.ENABLE_MINIMAP_BUFF_TIMER) !== 1],
                ["minimap_rejuv_timer_disabled", Number(cfg?.ENABLE_MINIMAP_REJUV_TIMER) !== 1],
                ["bhop_gamemode_active", false],
                ["minimalist_healthbar_active", minimalistHealthbarEnabled],
                ["fg_healthbar_active", fgHealthbarEnabled],
                ["klutz_healthbar_active", klutzHealthbarEnabled],
                ["budhud_healthbar_active", budhudHealthbarEnabled],
                ["minecraft_healthbar_active", minecraftHealthbarEnabled],
                ["minecraft_health_numbers_disabled", minecraftHealthbarEnabled && Number(cfg?.ENABLE_MINECRAFT_HEALTH_NUMBERS) !== 1],
                ["enemy_v2_enhanced_active", enemyV2EnhancedEnabled],
                ["enemy_v2_enhanced_off", !enemyV2EnhancedEnabled],
                ["colored_healthbar_active", colorWarningEnabled && healthbarType === 0],
                ["clean_stacks_active", cleanStacksEnabled && !minecraftHealthbarEnabled],
                ["clean_stacks_inactive", false],
                ["compass_active", compassEnabled],
                ["simplify_compass_active", cfg?.ENABLE_SIMPLIFY_COMPASS === 1],
                ["ult_cooldowns_active", cfg?.ENABLE_ULT_COOLDOWNS === 1],
                ["keyboard_overlay_active", cfg?.ENABLE_KEYBOARD_OVERLAY === 1],
                ["keyboard_overlay_full_active", cfg?.ENABLE_FULL_KEYBOARD_LAYOUT === 1],
                ["minimalist_minimap_active", cfg?.MINIMAL_MINIMAP === 1],
                ["qol_minimap_elevation_markers_active", Number(cfg?.ENABLE_MINIMAP_ELEVATION_MARKERS) === 1],
                ["disable_damage_report_active", notDevTestMode && cfg?.DISABLE_DAMAGE_REPORT === 1],
                ["disable_quick_buy_active", cfg?.DISABLE_QUICK_BUY === 1],
                ["hud_shift_active", cfg?.ENABLE_HUD_SHIFT === 1],
                ["support_16_10_active", cfg?.SUPPORT_16_10 === 1],
                ["support_4_3_active", cfg?.SUPPORT_4_3 === 1],
                ["unspent_souls_disabled", cfg?.ENABLE_UNSPENT_SOULS === 0],
                ["better_unsecured_active", cfg?.ENABLE_BETTER_UNSECURED === 1],
                ["min_souls_disabled", cfg?.ENABLE_MIN_SOULS === 0],
                ["obj_dmg_disabled", cfg?.ENABLE_OBJ_DMG === 0],
                ["obj_map_disabled", cfg?.ENABLE_OBJ_MAP === 0],
                ["urn_diff_disabled", cfg?.ENABLE_URN_DIFF === 0],
                ["rift_timer_disabled", cfg?.ENABLE_URN_TIMER === 0],
                ["missing_hero_disabled", cfg?.ENABLE_MISSING_HERO === 0],
                ["nicknames_active", Number(cfg?.ENABLE_NICKNAMES) === 1],
                ["disable_player_name_blur_active", Number(cfg?.DISABLE_PLAYER_NAME_BLUR) === 1],
                ["cumulative_dmg_disabled", cfg?.ENABLE_CUMULATIVE_DMG === 0],
                ["clean_damage_indicators_active", Number(cfg?.ENABLE_CLEAN_DAMAGE_INDICATORS) === 1],
                ["damage_fountain_active", cfg?.ENABLE_DAMAGE_FOUNTAIN === 1],
                ["hide_small_numbers_active", cfg?.ENABLE_HIDE_SMALL_NUMBERS === 1],
                ["hide_trooper_damage_active", cfg?.ENABLE_HIDE_TROOPER_DAMAGE === 1],
                ["shop_stats_disabled", cfg?.ENABLE_SHOP_STATS === 0],
                ["simplify_shop_active", cfg?.ENABLE_SIMPLIFY_SHOP === 1],
                ["simplify_items_active", cfg?.ENABLE_SIMPLIFY_ITEMS === 1],
                ["enhanced_quickbuy_active", enhancedQuickbuyEnabled],
                ["shop_click_to_notify_active", quickbuyClickToNotifyEnabled],
                ["shop_recent_purchases_active", shopRecentPurchasesEnabled],
                ["shop_recent_purchases_redux", shopRecentPurchasesRedux],
                ["shop_item_notifications_active", Number(cfg?.ENABLE_SHOP_ITEM_NOTIFICATIONS) === 1]
            ];

            const redDiamondChanged = setPanelClassCached(root, rc, "red_diamond_active", redDiamondEnabled);
            if (redDiamondChanged) {
                state.targetShapeStyleSig = "";
                state.nextTargetShapeRefreshMs = 0;
            }

            for (const [cls, active] of staticRules) {
                setPanelClassCached(root, rc, cls, active);
            }

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
            } catch (_) {}
        } else {
            state.quickbuyClassCache = null;
        }

        if (Number(cfg?.ENABLE_HIDE_RELOAD_CIRCLE) === 1 || getCachedPanel("activeReloadProgressBar")) {
            updateReloadCircleExceptionState(root, cfg);
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
            if (cfg?.QOLLOCK_DEV_CORE_ROOT_TEST_MODE !== 1) {
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
    };

    // Attach to namespace
    Q.core.hud = {
        findHud,
        isInHideout,
        isStreetBrawl,
        isHudClassActive,
        ensureTopBarGated,
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
        updateReloadCircleExceptionState,
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
    Q.updateReloadCircleExceptionState = updateReloadCircleExceptionState;
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

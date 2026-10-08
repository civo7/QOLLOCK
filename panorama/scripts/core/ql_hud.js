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
    const _coreFindHud = (typeof _panelHelpers.findHud === "function") ? _panelHelpers.findHud : null;
    const isAlive = Q.core.panel.isAlive;

    let _cachedHud = null;

    /**
     * Finds the primary Deadlock #Hud panel with caching (delegates to core panel helper).
     */
    const findHud = (preferredRoot) => {
        if (_coreFindHud) {
            return _coreFindHud(preferredRoot);
        }
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
    let _lastStreetBrawlCheckMs = 0;
    let _lastStreetBrawlResult = false;

    const isStreetBrawl = (root) => {
        const now = Date.now ? Date.now() : (new Date()).getTime();
        if (!root && (now - _lastStreetBrawlCheckMs < 2000)) {
            return _lastStreetBrawlResult;
        }

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

        let result = false;
        try {
            const hud = findHud();
            if (isAlive(hud)) {
                if (hasBrawlClass(hud)) {
                    result = true;
                } else {
                    const sb = resolveCachedPanel(hud, "streetBrawlContainer", "StretBrawlContainer");
                    if (isAlive(sb) && (sb.visible || sb.BHasClass("visible") || sb.style?.visibility === "visible")) {
                        result = true;
                    } else {
                        const gpHud = resolveCachedPanel(hud, "gameplayHud", "gameplay_hud");
                        if (hasBrawlClass(gpHud)) {
                            result = true;
                        } else {
                            const topBar = resolveCachedPanel(hud, "topBar", "TopBar");
                            if (hasBrawlClass(topBar)) {
                                result = true;
                            }
                        }
                    }
                }
            }
            if (!result && isAlive(root)) {
                if (hasBrawlClass(root)) {
                    result = true;
                } else {
                    let curr = root;
                    while (isAlive(curr)) {
                        if (hasBrawlClass(curr)) {
                            result = true;
                            break;
                        }
                        curr = curr.GetParent ? curr.GetParent() : null;
                    }
                }
            }
        } catch (_) {}

        if (!root) {
            _lastStreetBrawlCheckMs = now;
            _lastStreetBrawlResult = result;
        }
        return result;
    };

    const isHudClassActive = (root, className) => {
        const target = root || findHud();
        if (!isAlive(target) || !className) return false;
        if (target.BHasClass(className)) return true;
        const gameplayHud = resolveCachedPanel(target, "gameplayHud", "gameplay_hud");
        if (gameplayHud?.BHasClass(className)) return true;
        const abilities = resolveAbilitiesContainer(target);
        return !!abilities?.BHasClass(className);
    };

    // Read persistent native class state; an engine toggle notification is only
    // a reason to refresh it. Prefer the stationary GlobalClassListener because
    // minimap_persp can be reparented by Tab zoom's Draw Over UI option.
    const isScoreboardOpen = (root, anchor) => {
        const hud = findHud(root);
        if (!isAlive(hud)) return false;
        const has = panel => QOL_UTILS.HasClassInHierarchy(panel, "gScoreboardOpen");
        if (has(hud)) return true;
        const stableListener = Q.panelCache
            ? Q.panelCache.resolve(hud, "hud.stableScoreboardListener", "DamageReportGlobalClassListener")
            : _panelHelpers.findTraverse(hud, "DamageReportGlobalClassListener");
        if (isAlive(stableListener)) return has(stableListener);
        if (isAlive(anchor) && has(anchor)) return true;
        const listener = Q.panelCache
            ? Q.panelCache.resolve(hud, "hud.scoreboardListener", "minimap_persp")
            : _panelHelpers.findTraverse(hud, "minimap_persp");
        return has(listener);
    };

    // HUD presentation evidence, not an entity API or a local-player guarantee.
    // Ambiguous/missing classes and spectator/replay contexts stay unknown.
    const readHudLifeState = (root) => {
        const hud = findHud(root);
        if (!isAlive(hud) || (hud.id !== "Hud" && hud.paneltype !== "CitadelHud")) return "unknown";
        const has = cls => QOL_UTILS.HasClassInHierarchy(hud, cls);
        if (["spec_mode", "replay_playback", "deathReplayActive", "InHideout", "connectedToHideout"].some(has)) return "unknown";
        const alive = has("alive");
        const dead = has("dead");
        return alive === dead ? "unknown" : (alive ? "alive" : "dead");
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
        const rawOpacity = panel.style.opacity;
        // Panorama may expose an unset inline property as "" or null. Neither
        // is evidence that CSS made this panel transparent (Number("") is 0).
        if (rawOpacity !== null && rawOpacity !== undefined && String(rawOpacity).trim() !== "") {
            const opacity = Number(rawOpacity);
            if (Number.isFinite(opacity)) return opacity;
        }
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
        const isVis = _panelHelpers.isVisible(panel);
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

    const gameplayVisibility = { hud: null, panel: null, nextSearchMs: 0 };
    const GAMEPLAY_HUD_DISCOVERY_MS = 800;
    // Native hud.css gates. InHideout is area-specific; connectedToHideout
    // remains set in the combat room and must not suppress this predicate.
    const isGameplayHudShown = (root) => {
        try {
            const hud = findHud(root);
            if (!isAlive(hud) || (hud.id !== "Hud" && hud.paneltype !== "CitadelHud")) return false;
            let joined = false;
            let ancestor = hud;
            for (let depth = 0; isAlive(ancestor) && depth < 64; depth++) {
                if (isPanelSuppressedMaybe(ancestor) || ancestor.style?.visibility === "collapse" || ancestor.BHasClass("HudHiddenPanel")) return false;
                if (["InHideout", "ShowEscapeMenu", "HudTakeoverEnabled", "inPostGame", "GameStatePostGame"]
                    .some(cls => ancestor.BHasClass(cls))) return false;
                if (ancestor.BHasClass("joined_team")) joined = true;
                ancestor = ancestor.GetParent();
            }
            if (ancestor || !joined) return false;
            if (gameplayVisibility.hud !== hud) {
                gameplayVisibility.hud = hud;
                gameplayVisibility.panel = null;
                gameplayVisibility.nextSearchMs = 0;
            }
            let panel = gameplayVisibility.panel;
            // Validate current ancestry, including a live old generation moved
            // away from this Hud. Never retain a cached ancestor list.
            let current = panel;
            for (let depth = 0; isAlive(current) && current !== hud && depth < 64; depth++) current = current.GetParent();
            if (panel && current !== hud) {
                gameplayVisibility.panel = panel = null;
                gameplayVisibility.nextSearchMs = 0;
            }
            if (!panel) {
                const now = Date.now();
                if (now < gameplayVisibility.nextSearchMs) return false;
                gameplayVisibility.nextSearchMs = now + GAMEPLAY_HUD_DISCOVERY_MS;
                gameplayVisibility.panel = panel = _panelHelpers.findTraverse(hud, PANEL_ID_GAMEPLAY_HUD);
            }
            if (!isAlive(panel) || panel.BHasClass("gShopOpen")) return false;
            current = panel;
            for (let depth = 0; isAlive(current) && depth < 64; depth++) {
                if (isPanelSuppressedMaybe(current) || current.style?.visibility === "collapse" || current.BHasClass("HudHiddenPanel")) return false;
                if (current === hud) return true;
                current = current.GetParent();
            }
        } catch (_) { /* native handles can disappear during transitions */ }
        return false;
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

        const walkthrough = hasAnyClass(root, ["QOLVisualCheckActive", "QOLCustomizeActive"]) || hasAnyClass(topBar, ["QOLVisualCheckActive", "QOLCustomizeActive"]);
        const inHideout = isInHideout(root);
        const hiddenUiClasses = (walkthrough || inHideout) ? ["HudTakeoverEnabled"] : ["ShowEscapeMenu", "HudTakeoverEnabled"];

        const hud = (typeof QOL !== "undefined" && QOL.getCachedPanel)
            ? QOL.getCachedPanel("hudPanel")
            : (root.FindChildTraverse ? root.FindChildTraverse("Hud") : null);

        if (hasAnyClass(root, hiddenUiClasses)) return false;
        if (hasAnyClass(hud, hiddenUiClasses)) return false;
        // gameplay_hud is a sibling of TopBar in hud.xml: its suppression
        // (for example on death) says nothing about top-bar visibility. Inspect
        // TopBar's ancestors instead, excluding its own user-configured opacity.
        const parent = topBar?.GetParent ? topBar.GetParent() : null;
        if (parent && !isPanelEffectivelyVisibleMaybe(parent, root)) return false;

        return true;
    };

    const isColorWarningEnabled = (cfg) => {
        return ["ENABLE_COLORED_HEALTHBAR", "ENABLE_COLOR_WARNING_25", "ENABLE_COLOR_WARNING_65", "ENABLE_COLOR_WARNING_75"]
            .some(key => Number(cfg?.[key]) === 1);
    };

    const getState = () => (typeof QOL !== "undefined" && QOL.state) ? QOL.state : (typeof State !== "undefined" ? State : { cachedPanels: {} });
    const getCachedPanel = (key) => (typeof QOL !== "undefined" && QOL.getCachedPanel) ? QOL.getCachedPanel(key) : getState()?.cachedPanels?.[key];
    const setCachedPanel = (key, p) => {
        if (typeof QOL !== "undefined" && QOL.setCachedPanel) {
            QOL.setCachedPanel(key, p);
        } else {
            const s = getState();
            if (!s.cachedPanels) s.cachedPanels = {};
            s.cachedPanels[key] = p;
        }
    };

    const resolveCachedPanel = (root, cacheKey, childId) => {
        let p = getCachedPanel(cacheKey);
        if (!isAlive(p)) {
            const s = getState();
            if (!s._panelMissBackoff) s._panelMissBackoff = {};
            const now = Date.now ? Date.now() : (new Date()).getTime();
            if (s._panelMissBackoff[cacheKey] && now < s._panelMissBackoff[cacheKey]) {
                return null;
            }
            const r = root || findHud();
            p = r?.FindChildTraverse ? r.FindChildTraverse(childId) : null;
            if (isAlive(p)) {
                delete s._panelMissBackoff[cacheKey];
                setCachedPanel(cacheKey, p);
            } else {
                s._panelMissBackoff[cacheKey] = now + 2000;
            }
        }
        return isAlive(p) ? p : null;
    };

    let abilitiesResolver = null;
    let abilitiesFallbacks = null;
    const resolveAbilitiesContainer = (root) => {
        const target = root || findHud();
        if (!isAlive(target)) return null;
        let panel = null;
        // PanelCache loads after core HUD; create owned resolvers only on use.
        if (Q.panelCache?.createIdResolver) {
            if (!abilitiesResolver) abilitiesResolver = Q.panelCache.createIdResolver("AbilitiesContainer", {
                ownerPath: [{ id: "Hud", optional: true }, { className: "HudCore" }]
            });
            panel = abilitiesResolver.resolve(target);
            if (!panel) {
                if (!abilitiesFallbacks) abilitiesFallbacks = ["CitadelHudAbilitiesContainer", "abilitiesContainer", "abilities_container"]
                    .map(id => Q.panelCache.createIdResolver(id));
                for (const resolver of abilitiesFallbacks) {
                    panel = resolver.resolve(target);
                    if (panel) break;
                }
            }
        } else {
            panel = _panelHelpers.findTraverse(target, "AbilitiesContainer") ||
                resolveCachedPanel(target, "abilitiesContainer", "abilitiesContainer");
        }
        // Preserve the shared lookup alias while keeping current root/ancestry
        // validation with its core owner, rather than relying on audio to seed it.
        if (getCachedPanel("abilitiesContainer") !== panel) setCachedPanel("abilitiesContainer", panel);
        return panel;
    };

    const ensureMinimapOverlayAnchor = (root) => {
        const target = root || findHud();
        if (!target?.FindChildTraverse) return null;
        return target.FindChildTraverse("minimap_container") || target.FindChildTraverse("minimap_persp") || null;
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

    // These bridge hosts belong to core projection. PanelCache is loaded after
    // this file, so allocate scoped resolvers on first use rather than at load.
    let quickbuyResolver = null, healthBridgeResolver = null;
    let quickbuyHost = null, healthBridgeHost = null;
    const retiredQuickbuyHosts = new Set(), retiredHealthHosts = new Set();
    const quickbuyClasses = ["enhanced_quickbuy_active", "shop_click_to_notify_active"];

    const resolveBridgeHost = (root, kind, force) => {
        const id = kind === "quickbuy" ? "CitadelHudQuickbuy" : "health_and_abilities_container";
        let resolver = kind === "quickbuy" ? quickbuyResolver : healthBridgeResolver;
        if (!resolver && Q.panelCache?.createIdResolver) {
            resolver = Q.panelCache.createIdResolver(id, { retryMs: 1000,
                ownerPath: [{ id: "Hud", optional: true }, { className: "HudCore" },
                    ...(kind === "quickbuy" ? ["StatsAndModsContainer", "LowerLeft"] : ["gameplay_hud"])]
            });
            if (kind === "quickbuy") quickbuyResolver = resolver;
            else healthBridgeResolver = resolver;
        }
        const panel = resolver ? resolver.resolve(root, force) : _panelHelpers.findTraverse(root, id);
        const alias = kind === "quickbuy" ? "quickbuy" : "healthContainer";
        if (getCachedPanel(alias) !== panel) setCachedPanel(alias, panel);
        return panel;
    };

    const releaseBridgeHosts = () => {
        for (const panel of retiredQuickbuyHosts) {
            if (!isAlive(panel)) { retiredQuickbuyHosts.delete(panel); continue; }
            for (const name of quickbuyClasses) _panelHelpers.setClass(panel, name, false);
            const cleared = QOL_UTILS.SafeSetAttribute(panel, "qol_enhanced_quickbuy_count", "");
            if (cleared && quickbuyClasses.every(name => !panel.BHasClass(name))) retiredQuickbuyHosts.delete(panel);
        }
        for (const panel of retiredHealthHosts) {
            if (!isAlive(panel) || QOL_UTILS.SafeSetAttribute(panel, "QOL_COLORED_HEALTHBAR", "")) retiredHealthHosts.delete(panel);
        }
    };

    const projectNativeBridges = (root, cfg, enhanced, notify, warning, force) => {
        const quickbuy = resolveBridgeHost(root, "quickbuy", force);
        const health = resolveBridgeHost(root, "health", force);
        if (quickbuy !== quickbuyHost) {
            if (isAlive(quickbuyHost)) retiredQuickbuyHosts.add(quickbuyHost);
            quickbuyHost = quickbuy;
        }
        if (health !== healthBridgeHost) {
            if (isAlive(healthBridgeHost)) retiredHealthHosts.add(healthBridgeHost);
            healthBridgeHost = health;
        }
        // A host can return before a failed release finishes; current ownership
        // must win over that retirement record.
        retiredQuickbuyHosts.delete(quickbuy); retiredHealthHosts.delete(health);
        releaseBridgeHosts();
        const count = enhanced ? Math.max(1, Math.min(6, Math.round(Number(cfg?.ENHANCED_QUICKBUY_COUNT) || 3))) : 3;
        for (const panel of [root, quickbuy]) {
            if (isAlive(panel) && QOL_UTILS.SafeGetAttribute(panel, "qol_enhanced_quickbuy_count", "") !== String(count)) {
                QOL_UTILS.SafeSetAttribute(panel, "qol_enhanced_quickbuy_count", String(count));
            }
        }
        if (isAlive(quickbuy)) {
            _panelHelpers.setClass(quickbuy, "enhanced_quickbuy_active", enhanced);
            _panelHelpers.setClass(quickbuy, "shop_click_to_notify_active", notify);
        }
        if (isAlive(health)) {
            const value = warning ? "1" : "0";
            if (QOL_UTILS.SafeGetAttribute(health, "QOL_COLORED_HEALTHBAR", "") !== value) {
                QOL_UTILS.SafeSetAttribute(health, "QOL_COLORED_HEALTHBAR", value);
            }
        }
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

    const hasClassInHierarchy = QOL_UTILS.HasClassInHierarchy;

    const findAncestorWithClass = QOL_UTILS.FindAncestorWithClass;

    const resolvePassiveCooldownMode = (cfg) => {
        const masterEnabled = Number(cfg?.ENABLE_PASSIVE_COOLDOWN) === 1;
        if (!masterEnabled) return "default";
        const advancedModeEnabled = Number(cfg?.ENABLE_OLD_ITEM_COOLDOWNS) !== 1;
        return advancedModeEnabled ? "advanced" : "basic";
    };

    const isPassiveCooldownBasicMode = (mode) => mode === "basic";

    const tryReadAccountIdFromKnownPartyPath = (root) => {
        if (!root) return "";
        let partyContainer = null;
        try { partyContainer = root.FindChildTraverse ? root.FindChildTraverse("CitadelPartyContainer") : null; } catch (_) {}
        if (!partyContainer) return "";
        let party = null;
        try { party = partyContainer.FindChildTraverse ? partyContainer.FindChildTraverse("CitadelParty") : null; } catch (_) {}
        if (!party) return "";
        let localPlayer = null;
        try { localPlayer = party.FindChildTraverse ? party.FindChildTraverse("LocalPlayer") : null; } catch (_) {}
        if (!localPlayer) return "";
        let avatar = null;
        try { avatar = localPlayer.FindChildTraverse ? localPlayer.FindChildTraverse("AvatarImage") : null; } catch (_) {}
        if (!avatar) return "";
        if (typeof Q.readAccountIdFromPanel === "function") return Q.readAccountIdFromPanel(avatar);
        try {
            const parsed = avatar.text || avatar.accountid || avatar.account_id || "";
            return String(parsed || "");
        } catch (_) {
            return "";
        }
    };

    const getAccountIdForBuildCategoryPayload = (root) => {
        return tryReadAccountIdFromKnownPartyPath(root);
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
        let chatPanel = getCachedPanel("chatPanel");
        if (!isAlive(chatPanel)) {
            chatPanel = resolveCachedPanel(root, "chatPanel", "Chat");
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

    const getPanelClassTokens = (panel) => {
        if (!isAlive(panel)) return [];
        try {
            if (typeof panel.GetClasses === "function") {
                return String(panel.GetClasses() || "").split(/\s+/).filter(Boolean);
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
            // Class enumeration is not reliable on every live Panorama panel.
            // The current native stylesheet defines counts 1-4, so probe those
            // verified tokens directly through BHasClass instead.
            for (let num = 4; num >= 1; num--) {
                if (panelHasClassToken(node, `RejuvCount_${num}`) ||
                    panelHasClassToken(node, `rejuv_charges_${num}`)) {
                    if (num > max) max = num;
                    break;
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

    // -------------------------------------------------------------------------
    // Urn Tracker / Net Worth Difference Overlay
    // -------------------------------------------------------------------------
    const URN_TRACKER_SAMPLE_INTERVAL_MS = 280;
    const URN_TRACKER_PANEL_CACHE_REFRESH_MS = 4200;

    const findFirstPanelByClass = (root, className) => {
        if (!root) return null;
        if (root.BHasClass && root.BHasClass(className)) return root;
        if (root.FindChildrenWithClassTraverse) {
            const matches = root.FindChildrenWithClassTraverse(className);
            if (matches && matches.length > 0) return matches[0];
        }
        return null;
    };

    const refreshUrnTrackerScoreCache = (root, nowMs) => {
        if (!root) return;
        const state = getState();
        const nextSearchMs = Number(state.urnTrackerNextPanelSearchMs) || 0;

        let teamsContainer = getCachedPanel("urnTrackerTeamsContainer");
        let friendlyTeamPanel = getCachedPanel("urnTrackerFriendlyTeamPanel");
        let enemyTeamPanel = getCachedPanel("urnTrackerEnemyTeamPanel");
        let friendlyLabels = Array.isArray(state.cachedPanels?.urnTrackerFriendlyGoldLabels)
            ? state.cachedPanels.urnTrackerFriendlyGoldLabels
            : null;
        let enemyLabels = Array.isArray(state.cachedPanels?.urnTrackerEnemyGoldLabels)
            ? state.cachedPanels.urnTrackerEnemyGoldLabels
            : null;

        const friendlyLabelsOk = friendlyLabels && friendlyLabels.length > 0 && friendlyLabels.every((p) => isAlive(p));
        const enemyLabelsOk = enemyLabels && enemyLabels.length > 0 && enemyLabels.every((p) => isAlive(p));

        const shouldRescan = nowMs >= nextSearchMs || !friendlyTeamPanel || !enemyTeamPanel || !friendlyLabelsOk || !enemyLabelsOk;
        if (!shouldRescan) return;

        let topBar = getCachedPanel("topBarPanel");
        if (!topBar && root.FindChildTraverse) {
            topBar = root.FindChildTraverse(PANEL_ID_TOP_BAR) || null;
            setCachedPanel("topBarPanel", topBar);
        }
        if (!topBar) return;

        const directFriendlyPanel = topBar.FindChildTraverse ? (topBar.FindChildTraverse("TeamScoreFriendly") || null) : null;
        const directEnemyPanel = topBar.FindChildTraverse ? (topBar.FindChildTraverse("TeamScoreEnemy") || null) : null;
        const directFriendlyLabels = (directFriendlyPanel && directFriendlyPanel.FindChildrenWithClassTraverse)
            ? (directFriendlyPanel.FindChildrenWithClassTraverse("ScoreLabel") || [])
            : [];
        const directEnemyLabels = (directEnemyPanel && directEnemyPanel.FindChildrenWithClassTraverse)
            ? (directEnemyPanel.FindChildrenWithClassTraverse("ScoreLabel") || [])
            : [];

        if (directFriendlyLabels.length > 0 && directEnemyLabels.length > 0) {
            teamsContainer = findFirstPanelByClass(topBar, "TeamNetworth") || topBar;
            friendlyTeamPanel = directFriendlyPanel;
            enemyTeamPanel = directEnemyPanel;
            friendlyLabels = directFriendlyLabels;
            enemyLabels = directEnemyLabels;
        } else {
            teamsContainer = topBar.FindChildTraverse ? (topBar.FindChildTraverse("TeamsContainer") || null) : null;
            let friendlyCandidates = teamsContainer && teamsContainer.FindChildrenWithClassTraverse
                ? (teamsContainer.FindChildrenWithClassTraverse("friend") || [])
                : [];
            if (friendlyCandidates.length === 0 && teamsContainer?.FindChildrenWithClassTraverse) {
                friendlyCandidates = teamsContainer.FindChildrenWithClassTraverse("team1") || [];
            }
            let enemyCandidates = teamsContainer && teamsContainer.FindChildrenWithClassTraverse
                ? (teamsContainer.FindChildrenWithClassTraverse("enemy") || [])
                : [];
            if (enemyCandidates.length === 0 && teamsContainer?.FindChildrenWithClassTraverse) {
                enemyCandidates = teamsContainer.FindChildrenWithClassTraverse("team2") || [];
            }

            friendlyTeamPanel = friendlyCandidates.length > 0 ? friendlyCandidates[0] : null;
            enemyTeamPanel = enemyCandidates.length > 0 ? enemyCandidates[0] : null;
            friendlyLabels = (friendlyTeamPanel && friendlyTeamPanel.FindChildrenWithClassTraverse)
                ? (friendlyTeamPanel.FindChildrenWithClassTraverse("hiddenGoldValue") || [])
                : [];
            enemyLabels = (enemyTeamPanel && enemyTeamPanel.FindChildrenWithClassTraverse)
                ? (enemyTeamPanel.FindChildrenWithClassTraverse("hiddenGoldValue") || [])
                : [];
        }

        setCachedPanel("urnTrackerTeamsContainer", teamsContainer);
        setCachedPanel("urnTrackerFriendlyTeamPanel", friendlyTeamPanel);
        setCachedPanel("urnTrackerEnemyTeamPanel", enemyTeamPanel);
        if (!state.cachedPanels) state.cachedPanels = {};
        state.cachedPanels.urnTrackerFriendlyGoldLabels = friendlyLabels;
        state.cachedPanels.urnTrackerEnemyGoldLabels = enemyLabels;
        state.urnTrackerNextPanelSearchMs = nowMs + URN_TRACKER_PANEL_CACHE_REFRESH_MS;
    };

    const parseUrnNetworthValue = (valueText) => {
        let raw = String(valueText || "")
            .replace(/<[^>]*>/g, "")
            .replace(/&(?:nbsp|thinsp);|&#(?:160|8239);/gi, "")
            .replace(/[\u00a0\u202f\s]/g, "")
            .toLowerCase();
        if (!raw) return 0;

        let multiplier = 1;
        const suffix = raw.match(/([kmb])$/);
        if (suffix) {
            multiplier = suffix[1] === "k" ? 1000 : (suffix[1] === "m" ? 1000000 : 1000000000);
            raw = raw.slice(0, -1);
            if (!raw.includes(".") && (raw.match(/,/g) || []).length === 1) {
                raw = raw.replace(",", ".");
            } else {
                raw = raw.replace(/,/g, "");
            }
        } else {
            raw = raw.replace(/,/g, "");
        }

        const value = Number(raw.replace(/[^0-9.+-]/g, ""));
        return Number.isFinite(value) && value > 0 ? Math.round(value * multiplier) : 0;
    };

    const getCachedUrnTeamNetworthValue = (labelsKey) => {
        const state = getState();
        const labels = Array.isArray(state.cachedPanels?.[labelsKey]) ? state.cachedPanels[labelsKey] : [];
        if (labels.length === 0) return 0;
        let total = 0;
        for (let i = 0; i < labels.length; i++) {
            if (!isAlive(labels[i])) return 0;
            total += parseUrnNetworthValue(labels[i].text);
        }
        return total;
    };

    const ensureUrnTrackerOverlay = (root) => {
        let panel = getCachedPanel("urnTrackerPanel");
        let label = getCachedPanel("urnTrackerLabel");
        if (panel && label && label.GetParent && label.GetParent() === panel) return panel;

        panel = root?.FindChildTraverse ? root.FindChildTraverse("UrnTracker") : null;
        if (!panel) {
            let parent = null;
            const topBar = root?.FindChildTraverse ? root.FindChildTraverse(PANEL_ID_TOP_BAR) : null;
            if (topBar) {
                parent = findFirstPanelByClass(topBar, "TeamNetworth");
            }
            if (!parent && root) {
                parent = findFirstPanelByClass(root, "TeamNetworth");
            }
            if (!parent && topBar) {
                parent = topBar;
            }
            if (!parent) return null;
            panel = $.CreatePanel("Panel", parent, "UrnTracker", {
                "class": "UrnTracker",
                hittest: "false",
                hittestchildren: "false",
                visible: "true"
            });
        }
        if (!panel) return null;

        label = panel.FindChildTraverse ? panel.FindChildTraverse("UrnTrackerLabel") : null;
        if (!label) {
            label = $.CreatePanel("Label", panel, "UrnTrackerLabel", {
                "class": "UrnTrackerLabel",
                text: "--"
            });
        }

        let soulIcon = panel.FindChildTraverse ? panel.FindChildTraverse("UrnTrackerSoulIcon") : null;
        if (!soulIcon) {
            soulIcon = $.CreatePanel("Panel", panel, "UrnTrackerSoulIcon", {
                "class": "UrnTrackerSoulIcon",
                hittest: "false"
            });
        }

        setCachedPanel("urnTrackerPanel", panel);
        setCachedPanel("urnTrackerLabel", label);
        const state = getState();
        state.urnTrackerLastText = "";
        state.urnTrackerLastClass = "";
        return panel;
    };

    const setUrnTrackerVisual = (panel, label, text, moodClass) => {
        if (!panel || !label) return;
        const state = getState();
        const nextText = (text === undefined || text === null) ? "--" : String(text);
        if (state.urnTrackerLastText !== nextText) {
            label.text = nextText;
            state.urnTrackerLastText = nextText;
        }

        const nextMood = moodClass || "neutral";
        if (state.urnTrackerLastClass !== nextMood) {
            panel.RemoveClass("good");
            panel.RemoveClass("bad");
            panel.RemoveClass("neutral");
            panel.AddClass(nextMood);
            state.urnTrackerLastClass = nextMood;
        }

        if (!panel.BHasClass || !panel.BHasClass("show")) panel.AddClass("show");
        panel.visible = true;
    };

    const hideUrnTrackerOverlay = (root) => {
        let panel = getCachedPanel("urnTrackerPanel");
        if (!panel && root?.FindChildTraverse) {
            panel = root.FindChildTraverse("UrnTracker");
            if (isAlive(panel)) {
                setCachedPanel("urnTrackerPanel", panel);
            }
        }
        if (isAlive(panel)) panel.visible = false;
    };

    const computeUrnTrackerState = (root, nowMs) => {
        const state = getState();
        const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : (Date.now ? Date.now() : (new Date()).getTime());
        if (now < (state.urnTrackerNextSampleMs || 0) && state.urnTrackerCachedState) {
            return state.urnTrackerCachedState;
        }

        refreshUrnTrackerScoreCache(root, now);
        const friendlyVal = getCachedUrnTeamNetworthValue("urnTrackerFriendlyGoldLabels");
        const enemyVal = getCachedUrnTeamNetworthValue("urnTrackerEnemyGoldLabels");
        const gameSec = Q.core?.time?.readGameTime ? Q.core.time.readGameTime(root) : (Q.getGameSecondsForUrn ? Q.getGameSecondsForUrn(root) : 0);
        const gameMin = gameSec / 60.0;
        let mood = "neutral";
        let display = "--";
        let result = null;

        if (friendlyVal <= 0 && enemyVal <= 0) {
            result = { friendlyVal, enemyVal, mood: "neutral", display: "--", debugText: "--" };
            state.urnTrackerCachedState = result;
            state.urnTrackerNextSampleMs = now + URN_TRACKER_SAMPLE_INTERVAL_MS;
            return result;
        }

        if (friendlyVal > 0 && enemyVal <= 0) {
            result = { friendlyVal, enemyVal, mood: "good", display: "100%", debugText: "100%" };
            state.urnTrackerCachedState = result;
            state.urnTrackerNextSampleMs = now + URN_TRACKER_SAMPLE_INTERVAL_MS;
            return result;
        }

        if (enemyVal > 0 && friendlyVal <= 0) {
            result = { friendlyVal, enemyVal, mood: "bad", display: "-100.0%", debugText: "-inf" };
            state.urnTrackerCachedState = result;
            state.urnTrackerNextSampleMs = now + URN_TRACKER_SAMPLE_INTERVAL_MS;
            return result;
        }

        const higher = Math.max(friendlyVal, enemyVal);
        const lower = Math.min(friendlyVal, enemyVal);
        let diffPct = 0;
        if (higher > 0) {
            diffPct = ((higher - lower) / higher) * 100;
            if (friendlyVal < enemyVal) diffPct *= -1;
        }

        const threshold = (gameMin < 15) ? 15 : 10;
        if (diffPct >= threshold) mood = "good";
        else if (diffPct <= -threshold) mood = "bad";

        display = (diffPct > 0 ? "+" : "") + diffPct.toFixed(1) + "%";
        result = { friendlyVal, enemyVal, mood, display, debugText: display };
        state.urnTrackerCachedState = result;
        state.urnTrackerNextSampleMs = now + URN_TRACKER_SAMPLE_INTERVAL_MS;
        return result;
    };

    const updateUrnTrackerOverlay = (root, cfg, nowMs) => {
        if (!root) return;
        const state = getState();
        const enabledVal = Number(cfg ? cfg.ENABLE_URN_DIFF : 0);
        const enabled = (Number.isFinite(enabledVal) && enabledVal === 1);
        const inHideout = isInHideout(root);

        if (!enabled || inHideout) {
            hideUrnTrackerOverlay(root);
            state.urnTrackerDisplayMode = inHideout ? "hideout" : "disabled";
            state.urnTrackerNextSampleMs = 0;
            state.urnTrackerCachedState = null;
            return;
        }

        const urnState = computeUrnTrackerState(root, nowMs);
        const panel = ensureUrnTrackerOverlay(root);
        const label = getCachedPanel("urnTrackerLabel");
        if (!panel || !label) {
            return;
        }

        setUrnTrackerVisual(panel, label, urnState.display, urnState.mood);
        state.urnTrackerDisplayMode = "active";
    };

    const needsUrnTrackerRuntimeWork = (cfg) => {
        const enabled = (typeof QOL !== "undefined" && QOL.utils?.IsCfgEnabled)
            ? QOL.utils.IsCfgEnabled(cfg, "ENABLE_URN_DIFF")
            : (Number(cfg?.ENABLE_URN_DIFF) === 1);
        if (enabled) return true;
        const state = getState();
        return Boolean(
            state?.urnTrackerDisplayMode === "active" ||
            (getCachedPanel("urnTrackerPanel") && state?.urnTrackerDisplayMode !== "disabled")
        );
    };

    // Runtime release values for centrally projected feature presentation.
    // These are transient native/CSS fallbacks, never setting defaults or config writes.
    const presentationRelease = [
        ["ql_healthbar", { HEALTHBAR_TYPE: 0 }],
        ["ql_recent_purchases", { ENABLE_SHOP_RECENT_PURCHASES: 0, ENABLE_SHOP_ITEM_NOTIFICATIONS: 0, ENABLE_HERO_PURCHASE_POPUPS: 0 }],
        ["ql_rejuv_hud", { ENABLE_REJUV_HUD: 0, ENABLE_BUFF_HUD: 0 }],
        ["ql_minimap_timers", { ENABLE_MINIMAP_BUFF_TIMER: 0, ENABLE_MINIMAP_REJUV_TIMER: 0 }],
        ["ql_zipboost", { ENABLE_ZIP_BOOST: 0 }],
        ["ql_unsecured_souls_timer", { ENABLE_UNSECURED_SOUL_TIMER: 0 }],
        ["ql_stat_bonuses", { ENABLE_STAT_BONUSES: 0 }],
        ["ql_compass", { ENABLE_COMPASS: 0, ENABLE_COMPASS_SPEED: 0, ENABLE_SIMPLIFY_COMPASS: 0 }],
        ["ql_ult_cooldowns", { ENABLE_ULT_COOLDOWNS: 0 }],
        ["ql_keyboard", { ENABLE_KEYBOARD_OVERLAY: 0, ENABLE_FULL_KEYBOARD_LAYOUT: 0 }],
        ["ql_better_unsecured_hud", { ENABLE_BETTER_UNSECURED: 0 }],
        ["ql_color_warnings", { ENABLE_COLORED_HEALTHBAR: 0, ENABLE_COLOR_WARNING_25: 0, ENABLE_COLOR_WARNING_65: 0, ENABLE_COLOR_WARNING_75: 0 }],
        ["ql_combat_status", { ENABLE_COMBAT_INDICATOR: 0 }],
        ["ql_heroshop", { ENABLE_HERO_SCENE_PANEL: 0, ENABLE_SHOP_STATS: 1, ENABLE_SIMPLIFY_SHOP: 0,
            ENABLE_ENHANCED_QUICKBUY: 0, ENABLE_QUICKBUY_CLICK_TO_NOTIFY: 0, DISABLE_QUICK_BUY: 0 }],
        ["ql_target_shapes", { ENABLE_RED_DIAMOND: 0, ENABLE_IMPROVED_HINT: 0 }],
        ["ql_damage_report", { DISABLE_DAMAGE_REPORT: 0 }],
        ["ql_ability_icons", { ENABLE_CLEAN_STACKS: 0, ENABLE_HIDE_ABILITY_SUGGESTION: 0, ENABLE_HIDE_COSMETIC_ABILITY: 0, ENABLE_SIMPLIFY_ABILITY_ICONS: 0 }],
        ["ql_cast_failed_hint", { ENABLE_HIDE_FAILED_HINT: 0 }],
        ["ql_nicknames", { ENABLE_NICKNAMES: 0 }],
        ["ql_minimap_runtime", { MINIMAL_MINIMAP: 0, ENABLE_MINIMAP_ELEVATION_MARKERS: 0 }],
        ["ql_ui_controls", { SUPPORT_16_10: 0, SUPPORT_4_3: 0, ENABLE_HUD_SHIFT: 0,
            ENABLE_CENTER_ESC: 0, ENABLE_CENTER_FRIENDS_LIST: 0, ENABLE_FORCE_TESTING_TOOLS: 0,
            ENABLE_HIDE_TESTING_TOOLS: 0, ENABLE_HIDE_BEHAVIOR_SUMMARY: 0, ENABLE_LEGACY_COOLDOWNS: 0 }]
    ];
    const presentationConfig = cfg => {
        const registry = Q.core.FeatureRegistry;
        if (!registry?.isPresentationAvailable) return cfg;
        let result = cfg;
        for (const [id, release] of presentationRelease) {
            if (registry.isPresentationAvailable(id)) continue;
            if (result === cfg) result = { ...cfg };
            Object.assign(result, release);
        }
        return result;
    };

    /** Root CSS synchronization uses accepted config plus transient owner availability. */
    const applyRootClasses = (root, cfg, nowMsLoop, hideoutConnected) => {
        if (!root) return false;
        cfg = presentationConfig(cfg);
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
        const colorWarningEnabled = isColorWarningEnabled(cfg);
        const cleanStacksEnabled = Number(cfg?.ENABLE_CLEAN_STACKS) === 1;
        const compassEnabled = Number(cfg?.ENABLE_COMPASS) === 1;
        const compassSpeedEnabled = Number(cfg?.ENABLE_COMPASS_SPEED) === 1;

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
                ["buff_hud_disabled", Number(cfg?.ENABLE_BUFF_HUD) !== 1],
                ["rejuv_hud_disabled", Number(cfg?.ENABLE_REJUV_HUD) !== 1],
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
                ["urn_diff_disabled", Number(cfg?.ENABLE_URN_DIFF) !== 1],
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

        projectNativeBridges(root, cfg, enhancedQuickbuyEnabled, quickbuyClickToNotifyEnabled, colorWarningEnabled, shouldApplyStaticClasses);

        if (Number(cfg?.ENABLE_HIDE_RELOAD_CIRCLE) === 1 || getCachedPanel("activeReloadProgressBar")) {
            updateReloadCircleExceptionState(root, cfg);
        }

        const abilitiesContainer = resolveAbilitiesContainer(root);
        const previousAbilities = state.abilitiesClassCache?.panel;
        if (previousAbilities !== abilitiesContainer && isAlive(previousAbilities)) {
            setPanelClassIfChanged(previousAbilities, "clean_stacks_active", false);
            setPanelClassIfChanged(previousAbilities, "clean_stacks_inactive", false);
        }
        if (abilitiesContainer && (shouldApplyStaticClasses || previousAbilities !== abilitiesContainer)) {
            if (!state.abilitiesClassCache) state.abilitiesClassCache = { panel: abilitiesContainer, values: {} };
            setPanelClassCached(abilitiesContainer, state.abilitiesClassCache, "clean_stacks_active", cleanStacksEnabled && !minecraftHealthbarEnabled);
            setPanelClassCached(abilitiesContainer, state.abilitiesClassCache, "clean_stacks_inactive", false);
        }

        if (hasNonDefaultChatRuntimeConfig(cfg) || state.chatStyleApplied) {
            updateChatRuntime(root, cfg);
        }
        if (needsUrnTrackerRuntimeWork(cfg)) {
            updateUrnTrackerOverlay(root, cfg, nowMsLoop);
        }

        return redDiamondEnabled;
    };

    // Attach to namespace
    Q.core.hud = {
        findHud,
        isInHideout,
        isStreetBrawl,
        isHudClassActive,
        isScoreboardOpen,
        readHudLifeState,
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
        refreshRootClasses: (root) => {
            const target = root || findHud();
            return applyRootClasses(target, Q.core.ConfigAdapter.exportToFlat(), QOL_UTILS.PerfNowMs(), isInHideout(target));
        },
        getPanelClassTokens,
        panelHasClassToken,
        getHighestRejuvChargeTokenOnPanel,
        getGameplayHudPanel,
        isCustomHudContextActive,
        isHudVisibleForTopBarRuntime,
        isGameplayHudShown,
        isColorWarningEnabled,
        updateReloadCircleExceptionState,
        ensureUrnTrackerOverlay,
        updateUrnTrackerOverlay,
        needsUrnTrackerRuntimeWork,
        computeUrnTrackerState,
        hideUrnTrackerOverlay,
        refreshUrnTrackerScoreCache,
        getCachedUrnTeamNetworthValue,
        resolvePassiveCooldownMode,
        isPassiveCooldownBasicMode,
        hasClassInHierarchy,
        findAncestorWithClass,
        tryReadAccountIdFromKnownPartyPath,
        getAccountIdForBuildCategoryPayload,
        isClassActive: (className) => isHudClassActive(null, className),
        isConnectedToHideout: isInHideout,
        resolveCachedPanel,
        ensureMinimapOverlayAnchor,
        PANEL_ID_GAMEPLAY_HUD,
        PANEL_ID_TOP_BAR,
        PANEL_ID_GOLD_AP_CONTAINER
    };
    Q.core.Hud = Q.core.hud;

    // Backward compat: alias on PanelHelpers if not already present
    if (Q.ui && Q.ui.PanelHelpers) {
        Q.ui.PanelHelpers.findHud = findHud;
    }
    if (Q.core.panel) {
        Q.core.panel.findHud = findHud;
    }

    // Direct backward compat on QOL root
    Q.findHud = findHud;
    Q.isInHideout = isInHideout;
    Q.isConnectedToHideout = isInHideout;
    Q.isClassActive = (className) => isHudClassActive(null, className);
    Q.isHudClassActive = isHudClassActive;
    Q.isStreetBrawlModeActive = isStreetBrawl;
    Q.applyCoreLoopRootClassesAndState = applyRootClasses;
    Q.resolveCachedPanel = resolveCachedPanel;
    Q.ensureMinimapOverlayAnchor = ensureMinimapOverlayAnchor;
    Q.setPanelClassCached = setPanelClassCached;
    Q.setPanelClassIfChanged = setPanelClassIfChanged;
    Q.updateReloadCircleExceptionState = updateReloadCircleExceptionState;
    Q.updateChatRuntime = updateChatRuntime;
    Q.hasNonDefaultChatRuntimeConfig = hasNonDefaultChatRuntimeConfig;
    Q.resetChatRuntime = resetChatRuntime;
    Q.getPanelClassTokens = getPanelClassTokens;
    Q.panelHasClassToken = panelHasClassToken;
    Q.getHighestRejuvChargeTokenOnPanel = getHighestRejuvChargeTokenOnPanel;
    Q.getGameplayHudPanel = getGameplayHudPanel;
    Q.isCustomHudContextActive = isCustomHudContextActive;
    Q.isHudVisibleForTopBarRuntime = isHudVisibleForTopBarRuntime;
    Q.isColorWarningEnabled = isColorWarningEnabled;
    Q.isCombatSignalActive = isCombatSignalActive;
    Q.resolvePassiveCooldownMode = resolvePassiveCooldownMode;
    Q.isPassiveCooldownBasicMode = isPassiveCooldownBasicMode;
    Q.hasClassInHierarchy = hasClassInHierarchy;
    Q.findAncestorWithClass = findAncestorWithClass;
    Q.tryReadAccountIdFromKnownPartyPath = tryReadAccountIdFromKnownPartyPath;
    Q.getAccountIdForBuildCategoryPayload = getAccountIdForBuildCategoryPayload;
    Q.ensureUrnTrackerOverlay = ensureUrnTrackerOverlay;
    Q.updateUrnTrackerOverlay = updateUrnTrackerOverlay;
    Q.needsUrnTrackerRuntimeWork = needsUrnTrackerRuntimeWork;
    Q.computeUrnTrackerState = computeUrnTrackerState;
    Q.hideUrnTrackerOverlay = hideUrnTrackerOverlay;
    Q.panelIdTopBar = PANEL_ID_TOP_BAR;
    Q.panelIdGoldApContainer = PANEL_ID_GOLD_AP_CONTAINER;

    Q.core.EventBus?.on("feature:presentation_changed", () => Q.core.hud.refreshRootClasses());

    $.Msg("[QOLLock] core/ql_hud: attached to QOL.core.hud");
})();

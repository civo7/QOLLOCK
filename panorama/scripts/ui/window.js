// =============================================================================
// QOLLOCK — ui/window.js
// =============================================================================
// OWNS:        Settings window lifecycle: opening/closing, focus management,
//              tab rail layout, active tab routing, footer buttons (Discord,
//              Cloud Save, Version), content container synchronization.
// DOES NOT OWN: Low-level control DOM rendering (ui/renderer.js),
//               Manifest execution (core/ql_feature_registry.js),
//               Config persistence (core/ql_persistence.js, core/ql_config_store.js).
// DEPENDS ON:  core/ql_namespace.js, ui/renderer.js, core/ql_panel_helpers.js
// USED BY:     hud_escape_menu.xml, ql_settings.js
// =============================================================================

(() => {
    "use strict";

    const Q = (typeof globalThis !== "undefined" && globalThis.QOL) ||
        (typeof QOL !== "undefined" ? QOL : null);
    if (!Q) {
        $.Msg("[QOLLock] ui/window: QOL namespace missing — aborting.");
        return;
    }
    Q.ui = Q.ui || {};

    // =========================================================================
    // Helpers & Safety
    // =========================================================================

    const isAlive = (panel) => {
        if (Q.core?.panel?.isAlive) return Q.core.panel.isAlive(panel);
        return !!(panel && typeof panel.IsValid === "function" && panel.IsValid());
    };

    const createPanel = (type, parent, id, props) => {
        if (!isAlive(parent)) return null;
        if (Q.core?.panel?.create) return Q.core.panel.create(type, parent, id, props);
        try {
            if (props) return $.CreatePanel(type, parent, id || "", props);
            return $.CreatePanel(type, parent, id || "");
        } catch (e) {
            $.Msg(`[QOLLock][WARN][Window] CreatePanel('${type}') failed: ${e?.message || e}`);
            return null;
        }
    };

    const localize = (text, keepRawIfMissing = false) => {
        if (!text) return "";
        if (typeof LocalizeSettingsText === "function") {
            return LocalizeSettingsText(text, keepRawIfMissing);
        }
        if (typeof $.Localize === "function") {
            const str = String(text);
            if (str.startsWith("#")) return $.Localize(str);
            return str;
        }
        return String(text);
    };

    // =========================================================================
    // Window State
    // =========================================================================

    let _window = null;
    let _header = null;
    let _tabBar = null;
    let _tabRailTabs = null;
    let _tabRailFooter = null;
    let _contentHost = null;
    let _contentList = null;
    let _activeTab = "Healthbar";
    const _tabButtons = new Map();
    const _tabRenderers = new Map();
    let _bootAttempts = 0;
    const MAX_BOOT_ATTEMPTS = 30;

    // =========================================================================
    // Shell Resolution
    // =========================================================================

    const findShell = () => {
        if (isAlive(_window)) return _window;

        let ctx = null;
        try {
            ctx = $.GetContextPanel ? $.GetContextPanel() : null;
        } catch (_) {}

        let root = ctx;
        while (root && root.GetParent && isAlive(root.GetParent())) {
            root = root.GetParent();
        }

        const candidate = (ctx?.FindChildTraverse ? ctx.FindChildTraverse("SettingsWindow") : null) ||
            (root?.FindChildTraverse ? root.FindChildTraverse("SettingsWindow") : null);

        if (!candidate || !isAlive(candidate)) return null;

        _window = candidate;
        _window.hittest = true;

        // Prevent click fall-through to background
        _window.SetPanelEvent("onactivate", () => {});
        _window.SetPanelEvent("oncancel", () => {
            setOpen(false);
        });

        _header = _window.FindChildTraverse("SettingsHeader");
        const body = _window.FindChildTraverse("SettingsBody") || _window;

        _contentHost = body.FindChildTraverse("SettingsContentHost");
        if (!_contentHost) {
            _contentHost = createPanel("Panel", body, "SettingsContentHost");
        }

        _contentList = body.FindChildTraverse("SettingsList");
        if (!_contentList && _contentHost) {
            _contentList = createPanel("Panel", _contentHost, "SettingsList");
        } else if (_contentList && _contentHost && _contentList.GetParent && _contentList.GetParent() !== _contentHost) {
            try { _contentList.SetParent(_contentHost); } catch (_) {}
        }

        _tabBar = body.FindChildTraverse("SettingsTabBar");
        if (!_tabBar) {
            _tabBar = createPanel("Panel", body, "SettingsTabBar");
        }
        if (_tabBar && _contentHost && body.MoveChildBefore) {
            try { body.MoveChildBefore(_tabBar, _contentHost); } catch (_) {}
        }

        if (_tabBar) {
            _tabRailTabs = _tabBar.FindChildTraverse("SettingsTabRailTabs");
            if (!_tabRailTabs) {
                _tabRailTabs = createPanel("Panel", _tabBar, "SettingsTabRailTabs");
            }

            const spacer = _tabBar.FindChildTraverse("SettingsTabRailSpacerMain");
            if (!spacer) {
                createPanel("Panel", _tabBar, "SettingsTabRailSpacerMain");
            }

            _tabRailFooter = _tabBar.FindChildTraverse("SettingsTabRailFooter");
            if (!_tabRailFooter) {
                _tabRailFooter = createPanel("Panel", _tabBar, "SettingsTabRailFooter");
            }
        }

        const closeBtn = _header ? _header.FindChildTraverse("CloseBtn") : null;
        if (closeBtn) {
            closeBtn.SetPanelEvent("onactivate", () => {
                setOpen(false);
            });
        }

        if (_header && Q.ui?.search?.bindHeader) {
            Q.ui.search.bindHeader(_header);
        }

        return _window;
    };

    // =========================================================================
    // Tab Definitions & Layout
    // =========================================================================

    const getTabGroups = () => {
        if (typeof globalThis.GetSettingsTabGroups === "function") {
            return globalThis.GetSettingsTabGroups();
        }
        return [
            {
                title: "General",
                tabs: ["Support", "Config", "Presets", "Console", "Arcade"],
            },
            {
                title: "Gameplay",
                tabs: ["Crosshair", "Healthbar", "HUD", "UI", "Overlay", "Minimap", "Audio"],
            },
        ];
    };

    const getTabDisplayName = (tabName) => {
        if (typeof globalThis.GetSettingsTabDisplayName === "function") {
            return globalThis.GetSettingsTabDisplayName(tabName);
        }
        if (tabName === "Config") return "Settings";
        return tabName;
    };

    const getTabIcon = (tabName) => {
        if (typeof globalThis.GetSettingsTabIconSource === "function") {
            return globalThis.GetSettingsTabIconSource(tabName);
        }
        const defaultIcons = {
            Support: "s2r://panorama/images/icons/icon_thumbsup.vsvg",
            Config: "s2r://panorama/images/icons/icon_gear.vsvg",
            Presets: "s2r://panorama/images/icons/icon_player.vsvg",
            Console: "s2r://panorama/images/icons/icon_feedback.vsvg",
            Arcade: "s2r://panorama/images/icons/properties/condition_burn.vsvg",
            Crosshair: "s2r://panorama/images/icons/properties/range_aoe.vsvg",
            Healthbar: "s2r://panorama/images/icons/properties/health.vsvg",
            HUD: "s2r://panorama/images/icons/properties/spirit.vsvg",
            UI: "s2r://panorama/images/icons/icon_reorder.vsvg",
            Overlay: "s2r://panorama/images/icons/icon_graph.vsvg",
            Minimap: "s2r://panorama/images/icons/icon_report.vsvg",
            Audio: "s2r://panorama/images/qollock/audio_nav_icon.vsvg",
        };
        return defaultIcons[tabName] || "";
    };

    // =========================================================================
    // Tab Rail Builder
    // =========================================================================

    const rebuildTabs = () => {
        if (!findShell() || !isAlive(_tabRailTabs)) return;

        try {
            _tabRailTabs.RemoveAndDeleteChildren();
        } catch (_) {}
        _tabButtons.clear();

        const groups = getTabGroups();
        for (const group of groups) {
            const groupKey = String(group.title || "").replace(/\s+/g, "");
            const groupPanel = createPanel("Panel", _tabRailTabs, `SettingsTabRailGroup_${groupKey}`);
            if (!groupPanel) continue;
            groupPanel.AddClass("SettingsTabRailGroup");

            const groupLabel = createPanel("Label", groupPanel, "");
            if (groupLabel) {
                groupLabel.AddClass("SettingsTabRailGroupLabel");
                groupLabel.text = localize(group.title, true);
            }

            const groupRule = createPanel("Panel", groupPanel, "");
            if (groupRule) groupRule.AddClass("SettingsTabRailGroupRule");

            const groupTabs = createPanel("Panel", groupPanel, "");
            if (!groupTabs) continue;
            groupTabs.AddClass("SettingsTabRailGroupTabs");

            for (const tabName of group.tabs) {
                const tabSuffix = String(tabName).replace(/[^A-Za-z0-9]/g, "");
                const tabBtn = createPanel("Button", groupTabs, `TabButton_${tabSuffix}`);
                if (!tabBtn) continue;
                tabBtn.AddClass("TabItem");
                tabBtn.AddClass(`TabItem_${tabSuffix}`);

                const iconSrc = getTabIcon(tabName);
                if (iconSrc) {
                    const icon = createPanel("Image", tabBtn, "TabIcon", {
                        src: iconSrc,
                        defaultsrc: "",
                        scaling: "contain",
                    });
                    if (icon) {
                        icon.AddClass("TabIcon");
                        icon.AddClass(`TabIcon_${tabSuffix}`);
                    }
                }

                const lbl = createPanel("Label", tabBtn, "TabLabel");
                if (lbl) {
                    lbl.text = localize(getTabDisplayName(tabName), true);
                }

                tabBtn.SetPanelEvent("onactivate", () => {
                    setActiveTab(tabName);
                });

                _tabButtons.set(tabName, tabBtn);
            }
        }

        rebuildFooter();
        highlightActiveTab();
    };

    const ensureDiscordTextureLogo = (targetBtn, logoId, logoClass) => {
        if (!targetBtn) return;
        const resolvedLogoId = logoId || "FooterDiscordLogoTexture";
        const resolvedLogoClass = logoClass || "FooterDiscordLogoTexture";

        const legacyCssLogo = targetBtn.FindChildTraverse ? targetBtn.FindChildTraverse("FooterDiscordLogoCss") : null;
        if (legacyCssLogo && legacyCssLogo.DeleteAsync) legacyCssLogo.DeleteAsync(0);

        let logoImage = targetBtn.FindChildTraverse ? targetBtn.FindChildTraverse(resolvedLogoId) : null;
        if (!logoImage) {
            logoImage = $.CreatePanel ? $.CreatePanel("Image", targetBtn, resolvedLogoId) : createPanel("Image", targetBtn, resolvedLogoId);
        }
        if (!logoImage) return;

        logoImage.AddClass(resolvedLogoClass);
        if (logoImage.SetImage) {
            logoImage.SetImage("s2r://panorama/images/qollock/discord_logo_png.vtex");
        }
    };

    const ensureDiscordFooterTextureLogo = (discordFooterBtn) => {
        ensureDiscordTextureLogo(discordFooterBtn, "FooterDiscordLogoTexture", "FooterDiscordLogoTexture");
    };

    const rebuildFooter = () => {
        if (!isAlive(_tabRailFooter)) return;
        try {
            _tabRailFooter.RemoveAndDeleteChildren();
        } catch (_) {}

        const footerRule = createPanel("Panel", _tabRailFooter, "SettingsTabRailFooterRule");
        if (footerRule) footerRule.AddClass("SettingsTabRailFooterRule");

        // 1. Discord Button
        const discordBtn = createPanel("Button", _tabRailFooter, "FooterDiscordRailButton");
        if (discordBtn) {
            discordBtn.AddClass("TabItem");
            discordBtn.AddClass("FooterDiscordRailBtn");

            const discordIcon = createPanel("Image", discordBtn, "FooterDiscordLogoTexture", {
                src: "s2r://panorama/images/icons/social/discord.vsvg",
                defaultsrc: "",
                scaling: "contain",
            });
            if (discordIcon) {
                discordIcon.AddClass("TabIcon");
                discordIcon.AddClass("FooterDiscordLogoTexture");
            }

            const discordLabel = createPanel("Label", discordBtn, "TabLabel");
            if (discordLabel) discordLabel.text = localize("DISCORD", true);

            discordBtn.SetPanelEvent("onactivate", () => {
                try {
                    $.DispatchEvent("ExternalBrowserGoToURL", "https://discord.gg/npCvuMcTY7");
                } catch (_) {}
            });
        }

        // 2. Version Button
        const versionBtn = createPanel("Button", _tabRailFooter, "FooterVersionLabel");
        if (versionBtn) {
            versionBtn.AddClass("TabItem");
            versionBtn.AddClass("FooterVersionLabel");

            const versionIcon = createPanel("Image", versionBtn, "FooterVersionIcon", {
                src: "s2r://panorama/images/icons/properties/charge.vsvg",
                defaultsrc: "",
                scaling: "contain",
            });
            if (versionIcon) {
                versionIcon.AddClass("TabIcon");
                versionIcon.AddClass("FooterVersionIcon");
            }

            const versionText = createPanel("Label", versionBtn, "FooterVersionLabelText");
            if (versionText) {
                versionText.AddClass("TabLabel");
                versionText.AddClass("FooterVersionLabelText");
                versionText.text = Q.VERSION || "3.2.0";
            }

            versionBtn.SetPanelEvent("onactivate", () => {
                setActiveTab("Console");
            });
        }
    };

    const highlightActiveTab = () => {
        for (const [tabId, btn] of _tabButtons.entries()) {
            if (isAlive(btn)) {
                btn.SetHasClass("Active", tabId === _activeTab);
            }
        }
    };

    // =========================================================================
    // Active Tab & Content Rendering
    // =========================================================================

    const setActiveTab = (tabId) => {
        if (Q.ui?.search?.isSearching?.()) {
            Q.ui.search.clear();
        }
        _activeTab = tabId;
        highlightActiveTab();
        renderTab(tabId);
    };

    const getActiveTab = () => _activeTab;

    const registerTabRenderer = (tabId, renderFn) => {
        if (typeof renderFn === "function") {
            _tabRenderers.set(tabId, renderFn);
        }
    };

    // =========================================================================
    // Layout-driven Tab Rendering
    // =========================================================================

    const getConfigValue = (featureId, key, fallback) => {
        if (typeof globalThis.MOD_CONFIG === "object" && globalThis.MOD_CONFIG !== null && Object.prototype.hasOwnProperty.call(globalThis.MOD_CONFIG, key)) {
            return globalThis.MOD_CONFIG[key];
        }
        if (Q.core?.ConfigStore?.hasSchema?.(featureId)) {
            const val = Q.core.ConfigStore.get(featureId, key);
            if (val !== undefined) return val;
        }
        return fallback;
    };

    const setConfigValue = (featureId, key, value) => {
        if (Q.core?.ConfigStore?.hasSchema?.(featureId)) {
            Q.core.ConfigStore.set(featureId, key, value);
        }
        if (typeof globalThis.MOD_CONFIG === "object" && globalThis.MOD_CONFIG !== null) {
            globalThis.MOD_CONFIG[key] = value;
        }
        if (typeof globalThis.MarkConfigDirty === "function") {
            globalThis.MarkConfigDirty();
        } else if (typeof globalThis.SaveAndSync === "function") {
            globalThis.SaveAndSync();
        }
    };

    const renderSectionFeatures = (parent, features) => {
        if (!Array.isArray(features) || !parent) return;
        const renderer = Q.ui?.renderer;
        if (!renderer) return;

        for (let i = 0; i < features.length; i++) {
            const item = features[i];
            const featureId = typeof item === "string" ? item : item?.id;
            const manifest = Q.core?.FeatureRegistry?.getManifest?.(featureId);
            if (!manifest || !Array.isArray(manifest.settings)) continue;

            const hideToggle = typeof item === "object" && item.hideToggle === true;

            for (let j = 0; j < manifest.settings.length; j++) {
                const setting = manifest.settings[j];
                if (hideToggle && setting.key === manifest.enableKey) continue;

                const curVal = getConfigValue(featureId, setting.key, setting.default);
                const onChange = (k, v) => setConfigValue(featureId, k, v);

                renderer.createControl(parent, setting, curVal, onChange, {
                    getDependencyValue: (depKey) => getConfigValue(featureId, depKey)
                });
            }
        }
    };

    const renderLayoutTab = (tabId, container) => {
        const renderer = Q.ui?.renderer;
        if (!renderer || !container) return false;

        const tabDef = typeof Q.ui?.getTabLayout === "function"
            ? Q.ui.getTabLayout(tabId)
            : (Array.isArray(Q.ui?.layout) ? Q.ui.layout.find((t) => t.id === tabId) : null);

        if (!tabDef || tabDef.custom || !Array.isArray(tabDef.sections)) {
            return false;
        }

        for (let i = 0; i < tabDef.sections.length; i++) {
            const section = tabDef.sections[i];
            if (!section) continue;

            if (i > 0) {
                renderer.createSeparator(container);
            }

            if (section.animatedToggle && section.enableKey) {
                renderer.createAnimatedInlineToggleSection(
                    container,
                    section.title || "",
                    section.enableKey,
                    section.description || "",
                    (sectionBody) => {
                        renderSectionFeatures(sectionBody, section.features);
                    },
                    { invert: section.invertToggle === true }
                );
            } else {
                if (section.title) {
                    renderer.createSectionHeader(container, section.title, section.description || "");
                }
                renderSectionFeatures(container, section.features);
            }
        }

        return true;
    };

    const renderTab = (tabId, targetContainer) => {
        const isSearchCollect = (typeof globalThis.gSearchCollectMode !== "undefined" && globalThis.gSearchCollectMode);
        let container = null;
        if (!isSearchCollect) {
            container = (isAlive(targetContainer))
                ? targetContainer
                : (findShell() && isAlive(_contentList) ? _contentList : null);
            if (!container || !isAlive(container)) return;

            try {
                container.RemoveAndDeleteChildren();
            } catch (_) {}
        }

        const customRenderer = _tabRenderers.get(tabId);
        if (typeof customRenderer === "function") {
            customRenderer(container, Q.ui.renderer);
            return;
        }

        // Layout-driven declarative rendering
        if (container && renderLayoutTab(tabId, container)) {
            return;
        }

        // Fallback: If ql_settings.js or legacy renderer exists, delegate
        if (container && typeof globalThis.RenderCurrentTabContent === "function") {
            try {
                globalThis.RenderCurrentTabContent(container);
                return;
            } catch (e) {
                $.Msg(`[QOLLock][WARN][Window] RenderCurrentTabContent failed: ${e?.message || e}`);
            }
        }

        // Default placeholder for unmapped tabs
        if (container) {
            const placeholder = createPanel("Label", container, "");
            if (placeholder) {
                placeholder.AddClass("SettingRow");
                placeholder.text = `${localize(getTabDisplayName(tabId))} — content ready.`;
            }
        }
    };

    // =========================================================================
    // Open / Close Lifecycle
    // =========================================================================

    const isOpen = () => {
        return !!(_window && isAlive(_window) && _window.BHasClass("Visible"));
    };

    const setOpen = (open) => {
        if (!findShell()) return;

        _window.SetHasClass("Visible", !!open);

        if (open) {
            rebuildTabs();
            renderTab(_activeTab);
            try { _window.SetFocus(); } catch (_) {}
            Q.events?.emit?.("ui:settings_opened");
        } else {
            try { Q.tooltip?.hideRowTooltip?.(); } catch (_) {}
            try { Q.preview?.hideAll?.(); } catch (_) {}
            try { Q.arcade?.closeAllModals?.(); } catch (_) {}
            Q.events?.emit?.("ui:settings_closed");
        }
    };

    const toggle = () => {
        setOpen(!isOpen());
    };

    // =========================================================================
    // Match Transition Watchdog
    // =========================================================================

    const SETTINGS_TRANSITION_WATCH_INTERVAL_SEC = 0.25;
    const SETTINGS_TRANSITION_CLOSE_COOLDOWN_MS = 1000;
    const SETTINGS_TRANSITION_SIGNAL_RECHECK_SEC = [0.0, 0.2, 0.6];

    let _transitionWatchToken = 0;
    let _transitionWatchRunning = false;
    let _transitionCloseCooldownUntilMs = 0;
    let _openedInHideout = false;

    const findRootPanel = () => {
        if (Q.core?.panel?.findRoot) return Q.core.panel.findRoot();
        let root = (typeof $.GetContextPanel === "function") ? $.GetContextPanel() : null;
        while (root && root.GetParent && isAlive(root.GetParent())) {
            root = root.GetParent();
        }
        return root;
    };

    const getNowMs = () => {
        try {
            return Date.now ? Date.now() : (new Date()).getTime();
        } catch (_) {
            return (new Date()).getTime();
        }
    };

    const hasPanelClassToken = (panel, className) => {
        if (!panel || !panel.BHasClass || !className) return false;
        try {
            return panel.BHasClass(className);
        } catch (_) {
            return false;
        }
    };

    const isInHideout = () => {
        const root = findRootPanel();
        if (root && root.BHasClass) {
            try {
                if (root.BHasClass("connectedToHideout") || root.BHasClass("InHideout")) return true;
            } catch (_) {}
        }
        const hud = root && root.FindChildTraverse ? root.FindChildTraverse("Hud") : null;
        if (hud && hud.BHasClass) {
            try {
                if (hud.BHasClass("connectedToHideout") || hud.BHasClass("InHideout")) return true;
            } catch (_) {}
        }
        return false;
    };

    const isInActiveMatch = () => {
        const root = findRootPanel();
        if (!root) return false;

        const hud = root.FindChildTraverse ? root.FindChildTraverse("Hud") : null;
        const gameplayHud = root.FindChildTraverse ? root.FindChildTraverse("gameplay_hud") : null;
        const hideout = isInHideout();

        const hasAnyClass = (className) => {
            return hasPanelClassToken(root, className) ||
                hasPanelClassToken(hud, className) ||
                hasPanelClassToken(gameplayHud, className);
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

        return false;
    };

    const stopTransitionWatch = () => {
        _transitionWatchToken++;
        _transitionWatchRunning = false;
        if (typeof globalThis.gSettingsTransitionWatchToken !== "undefined") {
            globalThis.gSettingsTransitionWatchToken++;
        }
        if (typeof globalThis.gSettingsTransitionWatchRunning !== "undefined") {
            globalThis.gSettingsTransitionWatchRunning = false;
        }
    };

    const tryCloseForTransition = (reason) => {
        const isVisible = (typeof IsSettingsWindowVisible === "function") ? IsSettingsWindowVisible() : isOpen();
        if (!isVisible) return false;
        const openedInHideout = (typeof globalThis.gSettingsOpenedInHideout !== "undefined") ? globalThis.gSettingsOpenedInHideout : _openedInHideout;
        if (!openedInHideout) return false;
        if (!isInActiveMatch()) return false;

        const now = getNowMs();
        if (now < _transitionCloseCooldownUntilMs) return false;
        _transitionCloseCooldownUntilMs = now + SETTINGS_TRANSITION_CLOSE_COOLDOWN_MS;

        if (typeof $.ForceCloseModSettings === "function") {
            $.ForceCloseModSettings();
        } else {
            setOpen(false);
        }
        return true;
    };

    const handleTransitionSignal = (reason) => {
        const isVisible = (typeof IsSettingsWindowVisible === "function") ? IsSettingsWindowVisible() : isOpen();
        if (!isVisible) return;
        const openedInHideout = (typeof globalThis.gSettingsOpenedInHideout !== "undefined") ? globalThis.gSettingsOpenedInHideout : _openedInHideout;
        if (!openedInHideout) return;

        for (let i = 0; i < SETTINGS_TRANSITION_SIGNAL_RECHECK_SEC.length; i++) {
            const delaySec = SETTINGS_TRANSITION_SIGNAL_RECHECK_SEC[i];
            if (typeof $.Schedule === "function") {
                $.Schedule(delaySec, () => {
                    tryCloseForTransition(reason);
                });
            }
        }
    };

    const startTransitionWatch = () => {
        stopTransitionWatch();
        _transitionWatchRunning = true;
        if (typeof globalThis.gSettingsTransitionWatchRunning !== "undefined") {
            globalThis.gSettingsTransitionWatchRunning = true;
        }
        const token = _transitionWatchToken;

        const tick = () => {
            if (token !== _transitionWatchToken) return;
            const isVisible = (typeof IsSettingsWindowVisible === "function") ? IsSettingsWindowVisible() : isOpen();
            if (!isVisible) {
                _transitionWatchRunning = false;
                return;
            }

            if (tryCloseForTransition("watchdog")) {
                _transitionWatchRunning = false;
                return;
            }

            if (typeof $.Schedule === "function") {
                $.Schedule(SETTINGS_TRANSITION_WATCH_INTERVAL_SEC, tick);
            }
        };

        if (typeof $.Schedule === "function") {
            $.Schedule(SETTINGS_TRANSITION_WATCH_INTERVAL_SEC, tick);
        }
    };

    // =========================================================================
    // Tab List Signature Caching & Dynamic Row Sync
    // =========================================================================

    const _settingsListContentPanelBySig = {};
    let _settingsListActiveRenderSig = "";
    const _settingsListRowSyncFnsBySig = {};
    let _settingsListRowSyncFns = [];
    let _settingsListRefreshToken = 0;
    let _settingsListRefreshForcePending = false;
    let _settingsListSoftRefreshToken = 0;

    const makeSettingsListSignatureKey = (sig) => {
        return String(sig || "default").replace(/[^a-zA-Z0-9_]/g, "_");
    };

    const ensureSettingsListHosts = (list) => {
        if (!isAlive(list)) return null;

        let cacheHost = list.FindChildTraverse ? list.FindChildTraverse("SettingsListCacheHost") : null;
        if (!isAlive(cacheHost)) {
            cacheHost = $.CreatePanel("Panel", list, "SettingsListCacheHost");
        }
        if (cacheHost) {
            cacheHost.AddClass("SettingsListContentHost");
            cacheHost.AddClass("SettingsListCacheHost");
        }

        let searchHost = list.FindChildTraverse ? list.FindChildTraverse("SettingsListSearchHost") : null;
        if (!isAlive(searchHost)) {
            searchHost = $.CreatePanel("Panel", list, "SettingsListSearchHost");
        }
        if (searchHost) {
            searchHost.AddClass("SettingsListContentHost");
            searchHost.AddClass("SettingsListSearchHost");
        }

        return {
            cacheHost,
            searchHost
        };
    };

    const pruneInvalidSettingsListContentCaches = () => {
        for (const sig in _settingsListContentPanelBySig) {
            if (!Object.prototype.hasOwnProperty.call(_settingsListContentPanelBySig, sig)) continue;
            if (!isAlive(_settingsListContentPanelBySig[sig])) {
                delete _settingsListContentPanelBySig[sig];
            }
        }
    };

    const ensureSettingsListContentPanelForSignature = (list, renderSig, forceRebuild) => {
        const hosts = ensureSettingsListHosts(list);
        if (!hosts || !isAlive(hosts.cacheHost)) {
            return { panel: null, created: false };
        }

        pruneInvalidSettingsListContentCaches();

        const sig = String(renderSig || "");
        let panel = _settingsListContentPanelBySig[sig];
        let created = false;

        if (!isAlive(panel)) panel = null;

        if (forceRebuild === true && panel) {
            delete _settingsListRowSyncFnsBySig[sig];
        }

        if (!panel) {
            const panelId = "SettingsListSig_" + makeSettingsListSignatureKey(sig);
            panel = hosts.cacheHost.FindChildTraverse ? hosts.cacheHost.FindChildTraverse(panelId) : null;
            if (!isAlive(panel)) {
                panel = $.CreatePanel("Panel", hosts.cacheHost, panelId);
            }
            if (panel) {
                panel.AddClass("SettingsListCachedTabContent");
                _settingsListContentPanelBySig[sig] = panel;
                created = true;
            }
        } else if (panel.GetParent && panel.GetParent() !== hosts.cacheHost) {
            panel.SetParent(hosts.cacheHost);
        }

        return {
            panel,
            created
        };
    };

    const setActiveSettingsListRenderSignature = (renderSig) => {
        _settingsListActiveRenderSig = String(renderSig || "");
        if (typeof globalThis.gSettingsListActiveRenderSig !== "undefined") {
            globalThis.gSettingsListActiveRenderSig = _settingsListActiveRenderSig;
        }
        if (!_settingsListRowSyncFnsBySig[_settingsListActiveRenderSig]) {
            _settingsListRowSyncFnsBySig[_settingsListActiveRenderSig] = [];
        }
    };

    const showSettingsListTabPanel = (list, renderSig) => {
        const hosts = ensureSettingsListHosts(list);
        if (!hosts || !isAlive(hosts.cacheHost) || !isAlive(hosts.searchHost)) return;
        const sig = String(renderSig || "");

        hosts.searchHost.SetHasClass("Hidden", true);
        for (const key in _settingsListContentPanelBySig) {
            if (!Object.prototype.hasOwnProperty.call(_settingsListContentPanelBySig, key)) continue;
            const panel = _settingsListContentPanelBySig[key];
            if (!isAlive(panel)) continue;
            panel.SetHasClass("Hidden", key !== sig);
        }
    };

    const resetSettingsListRowSyncRegistry = () => {
        const sig = String(_settingsListActiveRenderSig || "");
        _settingsListRowSyncFns = [];
        _settingsListRowSyncFnsBySig[sig] = [];
        if (typeof globalThis.gSettingsListRowSyncFns !== "undefined") {
            globalThis.gSettingsListRowSyncFns = _settingsListRowSyncFns;
        }
    };

    const registerSettingsListRowSync = (fn) => {
        if (typeof fn !== "function") return;
        const sig = String(_settingsListActiveRenderSig || "");
        if (!_settingsListRowSyncFnsBySig[sig]) {
            _settingsListRowSyncFnsBySig[sig] = [];
        }
        _settingsListRowSyncFnsBySig[sig].push(fn);
        _settingsListRowSyncFns = _settingsListRowSyncFnsBySig[sig];
        if (typeof globalThis.gSettingsListRowSyncFns !== "undefined") {
            globalThis.gSettingsListRowSyncFns = _settingsListRowSyncFns;
        }
    };

    const runSettingsListRowSync = () => {
        const sig = String(_settingsListActiveRenderSig || "");
        const bucket = _settingsListRowSyncFnsBySig[sig];
        if (!Array.isArray(bucket) || bucket.length <= 0) return;
        for (let i = bucket.length - 1; i >= 0; i--) {
            const fn = bucket[i];
            if (typeof fn !== "function") {
                bucket.splice(i, 1);
                continue;
            }
            let keep = true;
            try {
                keep = (fn() !== false);
            } catch (_) {
                keep = false;
            }
            if (!keep) {
                bucket.splice(i, 1);
            }
        }
        _settingsListRowSyncFnsBySig[sig] = bucket;
        _settingsListRowSyncFns = bucket;
        if (typeof globalThis.gSettingsListRowSyncFns !== "undefined") {
            globalThis.gSettingsListRowSyncFns = bucket;
        }
    };

    const refreshRuntimeControlVisuals = () => {
        const btnGroupRefreshers = (typeof globalThis.gRuntimeButtonGroupRefreshers !== "undefined")
            ? globalThis.gRuntimeButtonGroupRefreshers
            : null;
        if (btnGroupRefreshers) {
            for (const key in btnGroupRefreshers) {
                if (!Object.prototype.hasOwnProperty.call(btnGroupRefreshers, key)) continue;
                const refreshFn = btnGroupRefreshers[key];
                if (typeof refreshFn !== "function") continue;
                try { refreshFn(); } catch (_) {}
            }
        }
        const arcadeSyncFns = (typeof globalThis.gArcadeOnDeathSyncFns !== "undefined")
            ? globalThis.gArcadeOnDeathSyncFns
            : null;
        if (Array.isArray(arcadeSyncFns)) {
            for (let i = arcadeSyncFns.length - 1; i >= 0; i--) {
                const syncFn = arcadeSyncFns[i];
                let keep = true;
                if (typeof syncFn !== "function") {
                    keep = false;
                } else {
                    try { keep = (syncFn() !== false); } catch (_) { keep = false; }
                }
                if (!keep) arcadeSyncFns.splice(i, 1);
            }
        }
    };

    const softRefreshSettingsListContent = (list) => {
        const getList = (typeof GetSettingsListPanel === "function") ? GetSettingsListPanel : globalThis.GetSettingsListPanel;
        const targetList = list || (getList ? getList() : null);
        if (!isAlive(targetList)) return false;
        refreshRuntimeControlVisuals();
        runSettingsListRowSync();
        if (typeof QueueActivePresetHighlightRefresh === "function") {
            QueueActivePresetHighlightRefresh(0.02);
        } else if (typeof globalThis.QueueActivePresetHighlightRefresh === "function") {
            globalThis.QueueActivePresetHighlightRefresh(0.02);
        }
        return true;
    };

    const requestSettingsListRefresh = (delaySec, forceRebuild) => {
        let delay = Number(delaySec);
        if (!isFinite(delay) || delay < 0) delay = 0;
        if (forceRebuild === true) _settingsListRefreshForcePending = true;
        _settingsListRefreshToken += 1;
        const refreshToken = _settingsListRefreshToken;

        if (typeof $.Schedule === "function") {
            $.Schedule(delay, () => {
                if (refreshToken !== _settingsListRefreshToken) return;
                const getList = (typeof GetSettingsListPanel === "function") ? GetSettingsListPanel : globalThis.GetSettingsListPanel;
                const list = getList ? getList() : null;
                const shouldForce = (_settingsListRefreshForcePending === true);
                _settingsListRefreshForcePending = false;
                if (!list) return;
                const updateFn = (typeof UpdateListContent === "function") ? UpdateListContent : globalThis.UpdateListContent;
                if (updateFn) updateFn(list, shouldForce);
            });
        }
    };

    const refreshSettingsLanguageUiAfterConfigChange = (previousLanguage) => {
        const getLang = (typeof GetSettingsLanguage === "function")
            ? GetSettingsLanguage
            : (Q.ui?.theme?.getLanguage ? Q.ui.theme.getLanguage : null);
        if (getLang && Math.round(Number(previousLanguage)) === getLang()) return false;
        if (typeof InvalidateSearchSectionIndexCache === "function") {
            InvalidateSearchSectionIndexCache();
        } else if (Q.ui?.search?.invalidateSearchSectionIndexCache) {
            Q.ui.search.invalidateSearchSectionIndexCache();
        }

        if (typeof $.Schedule === "function") {
            $.Schedule(0.02, () => {
                const isVis = (typeof IsSettingsWindowVisible === "function") ? IsSettingsWindowVisible() : isOpen();
                if (typeof $.BuildUI === "function" && isVis) {
                    $.BuildUI();
                    return;
                }

                const rootPanel = (typeof $.GetContextPanel === "function") ? $.GetContextPanel() : null;
                const tabBar = rootPanel ? rootPanel.FindChildTraverse("SettingsTabBar") : null;
                const settingsList = rootPanel ? rootPanel.FindChildTraverse("SettingsList") : null;
                if (typeof SyncTabActiveStates === "function") {
                    SyncTabActiveStates(tabBar);
                } else if (typeof globalThis.SyncTabActiveStates === "function") {
                    globalThis.SyncTabActiveStates(tabBar);
                }
                if (isAlive(settingsList)) {
                    requestSettingsListRefresh(0, true);
                }
            });
        }
        return true;
    };

    const requestSettingsListSoftRefresh = (delaySec) => {
        let delay = Number(delaySec);
        if (!isFinite(delay) || delay < 0) delay = 0;
        _settingsListSoftRefreshToken += 1;
        const refreshToken = _settingsListSoftRefreshToken;
        if (typeof $.Schedule === "function") {
            $.Schedule(delay, () => {
                if (refreshToken !== _settingsListSoftRefreshToken) return;
                const getList = (typeof GetSettingsListPanel === "function") ? GetSettingsListPanel : globalThis.GetSettingsListPanel;
                softRefreshSettingsListContent(getList ? getList() : null);
            });
        }
    };

    const refreshSettingsListContent = () => {
        requestSettingsListSoftRefresh(0);
    };

    // =========================================================================
    // Escape Menu Keyboard & Background Hook
    // =========================================================================

    const hookEscapeMenu = () => {
        let ctx = null;
        try {
            ctx = $.GetContextPanel ? $.GetContextPanel() : null;
        } catch (_) {}
        if (!ctx) return;

        let root = ctx;
        while (root && root.GetParent && isAlive(root.GetParent())) {
            root = root.GetParent();
        }

        const bg = root?.FindChildTraverse ? root.FindChildTraverse("EscapeBackground") : null;
        if (bg && isAlive(bg)) {
            bg.SetPanelEvent("onactivate", () => {
                if (isOpen()) {
                    setOpen(false);
                } else {
                    try { $.DispatchEvent("CitadelResumePlaying", ctx); } catch (_) {}
                }
            });
        }

        const em = root?.FindChildTraverse ? root.FindChildTraverse("EscapeMenu") : null;
        if (em && isAlive(em)) {
            em.SetPanelEvent("oncancel", () => {
                if (isOpen()) {
                    setOpen(false);
                } else {
                    try { $.DispatchEvent("CitadelResumePlaying", ctx); } catch (_) {}
                }
            });
        }
    };

    // =========================================================================
    // Boot Sequence
    // =========================================================================

    const boot = () => {
        if (!findShell()) {
            _bootAttempts++;
            if (_bootAttempts < MAX_BOOT_ATTEMPTS) {
                if (typeof $.Schedule === "function") {
                    $.Schedule(0.4, boot);
                }
            }
            return;
        }
        hookEscapeMenu();
        $.Msg("[QOLLock] ui/window: shell found and initialized.");
    };

    if (typeof $.Schedule === "function") {
        $.Schedule(0.2, boot);
    } else {
        boot();
    }

    // Export onto namespace
    const windowApi = {
        findShell,
        rebuildTabs,
        rebuildFooter,
        setActiveTab,
        getActiveTab,
        renderTab,
        renderLayoutTab,
        registerTabRenderer,
        setOpen,
        toggle,
        isOpen,
        boot,
        ensureDiscordTextureLogo,
        ensureDiscordFooterTextureLogo,
        isInHideout,
        isInActiveMatch,
        startTransitionWatch,
        stopTransitionWatch,
        tryCloseForTransition,
        handleTransitionSignal,
        makeSettingsListSignatureKey,
        ensureSettingsListHosts,
        pruneInvalidSettingsListContentCaches,
        ensureSettingsListContentPanelForSignature,
        setActiveSettingsListRenderSignature,
        showSettingsListTabPanel,
        resetSettingsListRowSyncRegistry,
        registerSettingsListRowSync,
        runSettingsListRowSync,
        refreshRuntimeControlVisuals,
        softRefreshSettingsListContent,
        requestSettingsListRefresh,
        refreshSettingsLanguageUiAfterConfigChange,
        requestSettingsListSoftRefresh,
        refreshSettingsListContent,
    };

    Q.ui.window = windowApi;

    // Transitional global bindings for XML buttons if not already bound
    if (typeof $.ToggleSettingsWindow !== "function") {
        $.ToggleSettingsWindow = () => windowApi.toggle();
    }
    if (typeof $.ForceCloseModSettings !== "function") {
        $.ForceCloseModSettings = () => windowApi.setOpen(false);
    }
    globalThis.IsSettingsWindowVisible = isOpen;
    globalThis.EnsureDiscordTextureLogo = ensureDiscordTextureLogo;
    globalThis.EnsureDiscordFooterTextureLogo = ensureDiscordFooterTextureLogo;
    globalThis.IsInHideoutForBuildSave = isInHideout;
    globalThis.GetNowMs = getNowMs;
    globalThis.HasPanelClassToken = hasPanelClassToken;
    globalThis.IsSettingsInActiveMatchContext = isInActiveMatch;
    globalThis.StopSettingsGameTransitionWatch = stopTransitionWatch;
    globalThis.TryCloseSettingsForGameTransition = tryCloseForTransition;
    globalThis.HandleSettingsGameTransitionSignal = handleTransitionSignal;
    globalThis.StartSettingsGameTransitionWatch = startTransitionWatch;
    globalThis.MakeSettingsListSignatureKey = makeSettingsListSignatureKey;
    globalThis.EnsureSettingsListHosts = ensureSettingsListHosts;
    globalThis.PruneInvalidSettingsListContentCaches = pruneInvalidSettingsListContentCaches;
    globalThis.EnsureSettingsListContentPanelForSignature = ensureSettingsListContentPanelForSignature;
    globalThis.SetActiveSettingsListRenderSignature = setActiveSettingsListRenderSignature;
    globalThis.ShowSettingsListTabPanel = showSettingsListTabPanel;
    globalThis.ResetSettingsListRowSyncRegistry = resetSettingsListRowSyncRegistry;
    globalThis.RegisterSettingsListRowSync = registerSettingsListRowSync;
    globalThis.RunSettingsListRowSync = runSettingsListRowSync;
    globalThis.RefreshRuntimeControlVisuals = refreshRuntimeControlVisuals;
    globalThis.SoftRefreshSettingsListContent = softRefreshSettingsListContent;
    globalThis.RequestSettingsListRefresh = requestSettingsListRefresh;
    globalThis.RefreshSettingsLanguageUiAfterConfigChange = refreshSettingsLanguageUiAfterConfigChange;
    globalThis.RequestSettingsListSoftRefresh = requestSettingsListSoftRefresh;
    globalThis.RefreshSettingsListContent = refreshSettingsListContent;

    $.Msg("[QOLLock] ui/window: settings window manager ready.");
})();

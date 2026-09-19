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

    const isAlive = Q.core.panel.isAlive;

    const createPanel = Q.core.panel.create;

    const localize = Q.ui.renderer.localize;

    // =========================================================================
    // Window State
    // =========================================================================

    const SETTINGS_SAVE_LOADER_ENABLED = true;
    const SETTINGS_SAVE_HOVER_WARNING = "DO NOT USE THIS IN QUEUE OR MATCH";
    const SETTINGS_SAVE_DISABLED_WARNING = "CURRENTLY IN EARLY ACCESS ON DISCORD DISABLED DUE TO BUGS";

    let _window = null;
    let _header = null;
    let _tabBar = null;
    let _tabRailTabs = null;
    let _tabRailFooter = null;
    let _contentHost = null;
    let _contentList = null;
    let _activeTab = (typeof globalThis.currentTab !== "undefined") ? globalThis.currentTab : "Support";
    const _tabButtons = new Map();
    const _tabRenderers = new Map();
    let _bootAttempts = 0;
    const MAX_BOOT_ATTEMPTS = 30;
    let _settingsToggleDebounceUntilMs = 0;
    let _settingsOpenGuardUntilMs = 0;
    let _uiBuilt = false;

    // =========================================================================
    // Shell Resolution
    // =========================================================================

    const getSettingsListPanel = () => {
        let ctx = null;
        try { ctx = (typeof $.GetContextPanel === "function") ? $.GetContextPanel() : null; } catch (_) {}
        if (!ctx || !ctx.FindChildTraverse) return isAlive(_contentList) ? _contentList : null;
        let list = null;
        try { list = ctx.FindChildTraverse("SettingsList"); } catch (_) { list = null; }
        if (!isAlive(list)) return isAlive(_contentList) ? _contentList : null;
        return list;
    };

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
            forceCloseModSettings();
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
                forceCloseModSettings();
            });
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
                tabs: ["Crosshair", "Healthbar", "HUD", "Minimap", "Shop", "Audio"],
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
            Minimap: "s2r://panorama/images/icons/icon_report.vsvg",
            Shop: "s2r://panorama/images/icons/icon_cart.vsvg",
            Audio: "s2r://panorama/images/qollock/audio_nav_icon.vsvg",
            UI: "s2r://panorama/images/icons/icon_reorder.vsvg",
            Overlay: "s2r://panorama/images/icons/icon_graph.vsvg",
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
                    setActiveTabAndRefresh(tabName);
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
            ensureDiscordTextureLogo(discordBtn, "FooterDiscordLogoTexture", "FooterDiscordLogoTexture");
            const discordTextureIcon = discordBtn.FindChildTraverse ? discordBtn.FindChildTraverse("FooterDiscordLogoTexture") : null;
            if (discordTextureIcon && discordBtn.MoveChildBefore && discordLabel) {
                try { discordBtn.MoveChildBefore(discordTextureIcon, discordLabel); } catch (_) {}
            }
        }

        // 2. Save Build Button
        const saveBtn = createPanel("Button", _tabRailFooter, "FooterSaveBuildButton");
        if (saveBtn) {
            saveBtn.AddClass("TabItem");
            saveBtn.AddClass("FooterSaveBuildTab");

            const saveIcon = createPanel("Image", saveBtn, "TabIcon", {
                src: "s2r://panorama/images/icons/icon_download.vsvg",
                defaultsrc: "",
                scaling: "contain",
            });
            if (saveIcon) {
                saveIcon.AddClass("TabIcon");
                saveIcon.AddClass("FooterSaveBuildIcon");
            }

            const saveLabel = createPanel("Label", saveBtn, "TabLabel");
            if (saveLabel) {
                saveLabel.text = localize("SAVE", true);
            }
            if (saveBtn.MoveChildBefore && saveIcon && saveLabel) {
                try { saveBtn.MoveChildBefore(saveIcon, saveLabel); } catch (_) {}
            }

            saveBtn.SetPanelEvent("onmouseover", () => {
                if (!isAlive(saveBtn)) return;
                try { Q.tooltip?.hideTextTooltip?.(); } catch (_) {}
                try { Q.tooltip?.cancelHide?.(); } catch (_) {}
                const saveWarning = SETTINGS_SAVE_LOADER_ENABLED ? SETTINGS_SAVE_HOVER_WARNING : SETTINGS_SAVE_DISABLED_WARNING;
                try {
                    Q.tooltip?.showRowTooltip?.(
                        saveBtn,
                        "",
                        saveWarning,
                        (typeof PERF_IMPACT_TIER_NONE !== "undefined" ? PERF_IMPACT_TIER_NONE : "none"),
                        "",
                        { footerSaveWarning: true }
                    );
                } catch (_) {}
            });

            saveBtn.SetPanelEvent("onmouseout", () => {
                try { Q.tooltip?.hideTooltipDeferred?.("footer_save_mouseout"); } catch (_) {}
            });

            saveBtn.SetPanelEvent("onactivate", () => {
                try { Q.tooltip?.hideRowTooltip?.(); } catch (_) {}
                if (typeof ActivateBuildSaveFromUi === "function") {
                    ActivateBuildSaveFromUi(saveBtn, saveLabel);
                } else if (typeof globalThis.ActivateBuildSaveFromUi === "function") {
                    globalThis.ActivateBuildSaveFromUi(saveBtn, saveLabel);
                }
            });

            if (_tabRailFooter.MoveChildBefore && discordBtn) {
                try { _tabRailFooter.MoveChildBefore(discordBtn, saveBtn); } catch (_) {}
            }
        }

        // 3. Version Button
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
                versionText.text = (typeof MOD_DISPLAY_VERSION !== "undefined")
                    ? MOD_DISPLAY_VERSION
                    : (Q.VERSION || "4.0.0");
            }

            versionBtn.SetPanelEvent("onactivate", () => {
                setActiveTabAndRefresh("Dev");
            });
        }
    };

    const highlightActiveTab = () => {
        const curTab = (typeof globalThis.currentTab !== "undefined") ? globalThis.currentTab : _activeTab;
        for (const [tabId, btn] of _tabButtons.entries()) {
            if (isAlive(btn)) {
                btn.SetHasClass("Active", tabId === curTab);
            }
        }
    };

    // =========================================================================
    // Dropdown and Active Tab Synchronization
    // =========================================================================

    const closeOpenSettingsDropdowns = (rootPanel, options) => {
        let root = rootPanel;
        if (!isAlive(root)) {
            try {
                root = (typeof $.GetContextPanel === "function") ? $.GetContextPanel() : null;
            } catch (_) {
                root = null;
            }
        }
        if (!isAlive(root)) return;
        const skipFocusTransfer = !!(options && options.skipFocusTransfer === true);

        const searchRoots = [];
        const seenRoots = new Set();
        let cursor = root;
        while (isAlive(cursor)) {
            if (!seenRoots.has(cursor)) {
                seenRoots.add(cursor);
                searchRoots.push(cursor);
            }
            if (!cursor.GetParent) break;
            cursor = cursor.GetParent();
        }

        const dropdownPanels = [];
        const seenDropdowns = new Set();
        for (let i = 0; i < searchRoots.length; i++) {
            const searchRoot = searchRoots[i];
            if (!isAlive(searchRoot)) continue;
            if (searchRoot.BHasClass && searchRoot.BHasClass("DropDownMenuVisible") && !seenDropdowns.has(searchRoot)) {
                seenDropdowns.add(searchRoot);
                dropdownPanels.push(searchRoot);
            }
            let found = [];
            try {
                found = searchRoot.FindChildrenWithClassTraverse ? (searchRoot.FindChildrenWithClassTraverse("QOLSettingsDropDown") || []) : [];
            } catch (_) {
                found = [];
            }
            for (let j = 0; j < found.length; j++) {
                const item = found[j];
                if (!isAlive(item) || seenDropdowns.has(item)) continue;
                seenDropdowns.add(item);
                dropdownPanels.push(item);
            }
            let visibleMenus = [];
            try {
                visibleMenus = searchRoot.FindChildrenWithClassTraverse ? (searchRoot.FindChildrenWithClassTraverse("DropDownMenuVisible") || []) : [];
            } catch (_) {
                visibleMenus = [];
            }
            for (let k = 0; k < visibleMenus.length; k++) {
                const item = visibleMenus[k];
                if (!isAlive(item) || seenDropdowns.has(item)) continue;
                seenDropdowns.add(item);
                dropdownPanels.push(item);
            }
        }

        for (let i = 0; i < dropdownPanels.length; i++) {
            const dropdownPanel = dropdownPanels[i];
            if (!isAlive(dropdownPanel)) continue;
            let menuPanel = null;
            let dropdownWasOpen = false;
            try {
                dropdownWasOpen = dropdownPanel.BHasClass && dropdownPanel.BHasClass("DropDownMenuVisible");
            } catch (_) {
                dropdownWasOpen = false;
            }
            const menuId = String(dropdownPanel.id || "") + "DropDownMenu";
            for (let s = 0; s < searchRoots.length && !menuPanel; s++) {
                const menuRoot = searchRoots[s];
                if (!isAlive(menuRoot)) continue;
                try {
                    menuPanel = menuRoot.FindChildTraverse(menuId);
                } catch (_) {
                    menuPanel = null;
                }
            }
            if (isAlive(menuPanel)) {
                try { dropdownWasOpen = dropdownWasOpen || !!menuPanel.visible; } catch (_) {}
                try { dropdownWasOpen = dropdownWasOpen || (menuPanel.BHasClass && menuPanel.BHasClass("DropDownMenuVisible")); } catch (_) {}
            }
            try { dropdownPanel.SetHasClass("DropDownMenuVisible", false); } catch (_) {}
            try { dropdownPanel.RemoveClass("DropDownMenuVisible"); } catch (_) {}
            try { dropdownPanel.visible = true; } catch (_) {}
            if (!skipFocusTransfer && dropdownWasOpen) {
                try { dropdownPanel.SetFocus(); } catch (_) {}
            }
            if (isAlive(menuPanel)) {
                try { menuPanel.SetHasClass("DropDownMenuVisible", false); } catch (_) {}
                try { menuPanel.RemoveClass("DropDownMenuVisible"); } catch (_) {}
                try { menuPanel.visible = false; } catch (_) {}
            }
        }

        const floatingMenus = [];
        const seenFloating = new Set();
        for (let i = 0; i < searchRoots.length; i++) {
            const searchRoot = searchRoots[i];
            if (!isAlive(searchRoot)) continue;
            let foundMenus = [];
            try {
                foundMenus = searchRoot.FindChildrenWithClassTraverse ? (searchRoot.FindChildrenWithClassTraverse("DropDownMenuVisible") || []) : [];
            } catch (_) {
                foundMenus = [];
            }
            for (let j = 0; j < foundMenus.length; j++) {
                const foundMenu = foundMenus[j];
                if (!isAlive(foundMenu) || seenFloating.has(foundMenu)) continue;
                seenFloating.add(foundMenu);
                floatingMenus.push(foundMenu);
            }
        }
        for (let i = 0; i < floatingMenus.length; i++) {
            const menu = floatingMenus[i];
            if (!isAlive(menu)) continue;
            try { menu.SetHasClass("DropDownMenuVisible", false); } catch (_) {}
            try { menu.RemoveClass("DropDownMenuVisible"); } catch (_) {}
            try { menu.visible = false; } catch (_) {}
        }
    };

    const syncTabActiveStates = (tabBar) => {
        const bar = isAlive(tabBar) ? tabBar : _tabBar;
        if (!isAlive(bar)) return;

        let ctx = null;
        try { ctx = (typeof $.GetContextPanel === "function") ? $.GetContextPanel() : null; } catch (_) {}
        const win = (ctx && ctx.FindChildTraverse ? ctx.FindChildTraverse("SettingsWindow") : null) || findShell();
        if (isAlive(win) && win.SetHasClass) {
            const isRu = (typeof IsRussianSettingsLanguage === "function") ? IsRussianSettingsLanguage() : false;
            const isPl = (typeof IsPolishSettingsLanguage === "function") ? IsPolishSettingsLanguage() : false;
            const isBg = (typeof IsBulgarianSettingsLanguage === "function") ? IsBulgarianSettingsLanguage() : false;
            const isBy = (typeof IsBelarusianSettingsLanguage === "function") ? IsBelarusianSettingsLanguage() : false;
            const isFr = (typeof IsFrenchSettingsLanguage === "function") ? IsFrenchSettingsLanguage() : false;
            const isPt = (typeof IsPortugueseSettingsLanguage === "function") ? IsPortugueseSettingsLanguage() : false;
            const isPtBr = (typeof IsBrazilianPortugueseSettingsLanguage === "function") ? IsBrazilianPortugueseSettingsLanguage() : false;
            const isEs = (typeof IsSpanishSettingsLanguage === "function") ? IsSpanishSettingsLanguage() : false;

            win.SetHasClass("SettingsLangRU", isRu);
            win.SetHasClass("SettingsLangPL", isPl);
            win.SetHasClass("SettingsLangBG", isBg);
            win.SetHasClass("SettingsLangBY", isBy);
            win.SetHasClass("SettingsLangFR", isFr);
            win.SetHasClass("SettingsLangPT", isPt);
            win.SetHasClass("SettingsLangPTBR", isPtBr);
            win.SetHasClass("SettingsLangES", isEs);

            if (typeof ApplySettingsThemeClasses === "function") {
                ApplySettingsThemeClasses(win);
            } else if (Q.ui?.theme?.applyThemeClasses) {
                Q.ui.theme.applyThemeClasses(win);
            }
        }

        const curTab = (typeof globalThis.currentTab !== "undefined") ? globalThis.currentTab : _activeTab;
        const allTabNames = [
            "Presets", "Crosshair", "Healthbar", "HUD", "Minimap", "Shop",
            "UI", "Overlay", "Audio", "Config", "Support", "Dev", "Credits"
        ];
        if (isAlive(win) && win.SetHasClass) {
            for (let i = 0; i < allTabNames.length; i++) {
                win.SetHasClass("SettingsTabActive_" + allTabNames[i], curTab === allTabNames[i]);
            }
        }

        for (let i = 0; i < allTabNames.length; i++) {
            const btn = bar.FindChildTraverse ? bar.FindChildTraverse("TabButton_" + allTabNames[i]) : null;
            if (isAlive(btn)) {
                btn.SetHasClass("Active", allTabNames[i] === curTab);
            }
        }

        const tabListHost = bar.FindChildTraverse ? bar.FindChildTraverse("SettingsTabRailTabs") : null;
        if (isAlive(tabListHost)) {
            const children = tabListHost.Children ? tabListHost.Children() : [];
            for (let i = 0; i < children.length; i++) {
                const groupPanel = children[i];
                if (!isAlive(groupPanel)) continue;
                const groupChildren = groupPanel.Children ? groupPanel.Children() : [];
                for (let gc = 0; gc < groupChildren.length; gc++) {
                    const maybeTabsHost = groupChildren[gc];
                    if (!isAlive(maybeTabsHost)) continue;
                    const tabs = maybeTabsHost.Children ? maybeTabsHost.Children() : [];
                    for (let ti = 0; ti < tabs.length; ti++) {
                        const tabBtn = tabs[ti];
                        if (!isAlive(tabBtn) || !tabBtn.id || tabBtn.id.indexOf("TabButton_") !== 0) continue;
                        tabBtn.SetHasClass("Active", tabBtn.id === ("TabButton_" + String(curTab || "").replace(/\s+/g, "")));
                        const tabLabel = tabBtn.FindChildTraverse("TabLabel");
                        if (tabLabel) {
                            const baseTabName = String(tabBtn.id).slice("TabButton_".length);
                            const displayTabName = getTabDisplayName(baseTabName);
                            tabLabel.text = localize(displayTabName, true);
                        }
                    }
                }
            }
        }

        const supportFooterBtn = bar.FindChildTraverse ? bar.FindChildTraverse("FooterSupportTabButton") : null;
        if (supportFooterBtn) supportFooterBtn.DeleteAsync(0);

        const tabFooter = bar.FindChildTraverse ? bar.FindChildTraverse("SettingsTabRailFooter") : null;
        const footerVersionLabel = tabFooter ? tabFooter.FindChildTraverse("FooterVersionLabel") : null;
        if (isAlive(footerVersionLabel)) {
            footerVersionLabel.SetHasClass("Active", curTab === "Dev");
        }
        const staleDiscordFooterBtn = bar.FindChildTraverse ? bar.FindChildTraverse("FooterDiscordLinkButton") : null;
        if (staleDiscordFooterBtn) staleDiscordFooterBtn.DeleteAsync(0);
        const newsFooterBtn = tabFooter ? tabFooter.FindChildTraverse("FooterNewsLinkButton") : null;
        if (newsFooterBtn) newsFooterBtn.DeleteAsync(0);
    };

    const buildSettingsListRenderSignature = () => {
        const getLangKey = (typeof GetSettingsLanguageKey === "function")
            ? GetSettingsLanguageKey
            : (Q.ui?.theme?.getLanguageKey || (() => ""));
        const getThemeKey = (typeof GetSettingsThemeKey === "function")
            ? GetSettingsThemeKey
            : (Q.ui?.theme?.getThemeKey || (() => ""));
        const cur = (typeof globalThis.currentTab !== "undefined")
            ? globalThis.currentTab
            : _activeTab;
        return `${String(cur || "")}|${getLangKey()}|${getThemeKey()}`;
    };

    // =========================================================================
    // Active Tab & Content Rendering
    // =========================================================================

    const setActiveTab = (tabId) => {
        if (Q.ui?.search?.isSearching?.()) {
            Q.ui.search.clear();
        }
        _activeTab = tabId;
        globalThis.currentTab = tabId;
        highlightActiveTab();
        const list = getSettingsListPanel();
        if (isAlive(list)) {
            updateListContent(list, true);
        } else {
            renderTab(tabId);
        }
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

    const renderSectionFeatures = (parent, features, sectionEnableKey) => {
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
                if (sectionEnableKey && setting.key === sectionEnableKey) continue;
                if (hideToggle && setting.key === manifest.enableKey) continue;

                let curVal;
                if (setting.type === "multitoggle" && Array.isArray(setting.options)) {
                    curVal = {};
                    for (let k = 0; k < setting.options.length; k++) {
                        const opt = setting.options[k];
                        if (opt && opt.key) {
                            curVal[opt.key] = getConfigValue(featureId, opt.key, 0);
                        }
                    }
                } else {
                    curVal = getConfigValue(featureId, setting.key, setting.default);
                }
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
                        renderSectionFeatures(sectionBody, section.features, section.enableKey);
                    },
                    { invert: section.invertToggle === true }
                );
            } else {
                if (section.title) {
                    renderer.createSectionHeader(container, section.title, section.description || "");
                }
                renderSectionFeatures(container, section.features, null);
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

        // Fallback: If legacy renderer exists (and is not our own renderCurrentTabContent), delegate
        if (container && typeof globalThis.RenderCurrentTabContent === "function" && globalThis.RenderCurrentTabContent !== renderCurrentTabContent) {
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
    // Tab List Content Updating & Navigation
    // =========================================================================

    const renderCurrentTabContent = (list) => {
        if (typeof globalThis.gCurrentSettingsSectionTitle !== "undefined") {
            globalThis.gCurrentSettingsSectionTitle = "";
        }
        const curTab = (typeof globalThis.currentTab !== "undefined") ? globalThis.currentTab : _activeTab;
        const isSearchCollect = (typeof globalThis.gSearchCollectMode !== "undefined" && globalThis.gSearchCollectMode);
        if (!isSearchCollect && curTab !== "Presets") {
            if (typeof globalThis.ResetPresetButtonRegistry === "function") {
                globalThis.ResetPresetButtonRegistry();
            }
        }
        renderTab(curTab, list);
    };

    let _settingsListLastRenderSig = "";
    let _settingsListSearchModeActive = false;

    const updateListContent = (list, forceRebuild) => {
        if (!isAlive(list)) return;
        if (Q.tooltip?.hideRowTooltip) {
            Q.tooltip.hideRowTooltip();
        }
        let ctx = null;
        try { ctx = (typeof $.GetContextPanel === "function") ? $.GetContextPanel() : null; } catch (_) {}
        closeOpenSettingsDropdowns(ctx, { skipFocusTransfer: true });

        let shouldForce = (forceRebuild === true);
        let leavingSearchMode = false;
        const renderSig = buildSettingsListRenderSignature();
        const isSearchActive = (typeof IsSettingsSearchActiveQuery === "function")
            ? IsSettingsSearchActiveQuery()
            : (Q.ui?.search?.isSettingsSearchActiveQuery ? Q.ui.search.isSettingsSearchActiveQuery() : false);

        setActiveSettingsListRenderSignature(renderSig);

        if (isSearchActive) {
            if (typeof RenderSettingsSearchResultsOnly === "function") {
                RenderSettingsSearchResultsOnly(list);
            } else if (Q.ui?.search?.renderSettingsSearchResultsOnly) {
                Q.ui.search.renderSettingsSearchResultsOnly(list);
            }
            _settingsListLastRenderSig = renderSig;
            if (typeof globalThis.gSettingsListLastRenderSig !== "undefined") {
                globalThis.gSettingsListLastRenderSig = renderSig;
            }
            return;
        }

        const searchModeActive = (typeof globalThis.gSettingsListSearchModeActive !== "undefined")
            ? globalThis.gSettingsListSearchModeActive
            : _settingsListSearchModeActive;

        if (searchModeActive) {
            shouldForce = true;
            _settingsListSearchModeActive = false;
            if (typeof globalThis.gSettingsListSearchModeActive !== "undefined") {
                globalThis.gSettingsListSearchModeActive = false;
            }
            leavingSearchMode = true;
        }

        const lastRenderSig = (typeof globalThis.gSettingsListLastRenderSig !== "undefined")
            ? globalThis.gSettingsListLastRenderSig
            : _settingsListLastRenderSig;

        if (!shouldForce && renderSig === lastRenderSig) {
            showSettingsListTabPanel(list, renderSig);
            softRefreshSettingsListContent(list);
            return;
        }

        const shouldRebuildCurrentSig = shouldForce && !leavingSearchMode;
        const panelEntry = ensureSettingsListContentPanelForSignature(list, renderSig, shouldRebuildCurrentSig);
        const contentPanel = panelEntry ? panelEntry.panel : null;
        const contentCreated = panelEntry ? (panelEntry.created === true) : false;
        if (!isAlive(contentPanel)) return;

        showSettingsListTabPanel(list, renderSig);

        if (contentCreated || shouldRebuildCurrentSig) {
            if (Q.preview?.hideAll) Q.preview.hideAll();
            resetSettingsListRowSyncRegistry();
            contentPanel.RemoveAndDeleteChildren();
            renderCurrentTabContent(contentPanel);
        } else {
            softRefreshSettingsListContent(list);
        }

        _settingsListLastRenderSig = renderSig;
        if (typeof globalThis.gSettingsListLastRenderSig !== "undefined") {
            globalThis.gSettingsListLastRenderSig = renderSig;
        }
        if (typeof QueueActivePresetHighlightRefresh === "function") {
            QueueActivePresetHighlightRefresh(0.02);
        } else if (typeof globalThis.QueueActivePresetHighlightRefresh === "function") {
            globalThis.QueueActivePresetHighlightRefresh(0.02);
        }
    };

    const setActiveTabAndRefresh = (tabName) => {
        const curTab = (typeof globalThis.currentTab !== "undefined") ? globalThis.currentTab : _activeTab;
        const activeQuery = (typeof currentSearchQuery !== "undefined")
            ? currentSearchQuery
            : (typeof globalThis.currentSearchQuery !== "undefined" ? globalThis.currentSearchQuery : "");
        const isSearchActive = (typeof IsSettingsSearchActiveQuery === "function")
            ? IsSettingsSearchActiveQuery()
            : (Q.ui?.search?.isSettingsSearchActiveQuery
                ? Q.ui.search.isSettingsSearchActiveQuery()
                : (String(activeQuery || "").trim().length > 0));

        if (!tabName) return;
        if (curTab === tabName && !isSearchActive) return;

        let root = null;
        try { root = (typeof $.GetContextPanel === "function") ? $.GetContextPanel() : null; } catch (_) {}
        const win = findShell() || root;
        const tabBar = (win && win.FindChildTraverse ? win.FindChildTraverse("SettingsTabBar") : null) || _tabBar;
        const list = (win && win.FindChildTraverse ? win.FindChildTraverse("SettingsList") : null) || _contentList;

        closeOpenSettingsDropdowns(win);

        if (typeof currentSearchQuery !== "undefined") currentSearchQuery = "";
        globalThis.currentSearchQuery = "";
        if (typeof ClearSettingsSearchQuery === "function") {
            ClearSettingsSearchQuery(win);
        } else if (Q.ui?.search?.clearSettingsSearchQuery) {
            Q.ui.search.clearSettingsSearchQuery(win);
        }

        const searchInput = win ? win.FindChildTraverse("SettingsSearchInput") : null;
        if (searchInput && isAlive(searchInput)) {
            try {
                if ((searchInput.text || "") !== "") searchInput.text = "";
                if (searchInput.ClearSelection) searchInput.ClearSelection();
            } catch (_) {}
        }
        const searchWrap = win ? win.FindChildTraverse("SettingsSearchWrap") : null;
        if (searchWrap && isAlive(searchWrap)) {
            try { searchWrap.SetHasClass("HasSearchText", false); } catch (_) {}
        }

        if (typeof CancelSettingsSearchRender === "function") {
            CancelSettingsSearchRender();
        } else if (Q.ui?.search?.cancelSettingsSearchRender) {
            Q.ui.search.cancelSettingsSearchRender();
        }
        _settingsListSearchModeActive = false;
        if (typeof globalThis.gSettingsListSearchModeActive !== "undefined") {
            globalThis.gSettingsListSearchModeActive = false;
        }

        if (
            isAlive(list) &&
            isAlive(tabBar) &&
            list.BHasClass &&
            !list.BHasClass("TabFading")
        ) {
            list.AddClass("TabFading");
            if (typeof $.Schedule === "function") {
                $.Schedule(0.2, () => {
                    if (!isAlive(list) || !isAlive(tabBar)) return;
                    _activeTab = tabName;
                    globalThis.currentTab = tabName;
                    syncTabActiveStates(tabBar);
                    updateListContent(list, true);
                    if (typeof UpdatePresetHighlightPollingState === "function") {
                        UpdatePresetHighlightPollingState();
                    } else if (typeof globalThis.UpdatePresetHighlightPollingState === "function") {
                        globalThis.UpdatePresetHighlightPollingState();
                    }
                    if (list.RemoveClass) list.RemoveClass("TabFading");
                });
                return;
            }
        }

        _activeTab = tabName;
        globalThis.currentTab = tabName;
        syncTabActiveStates(tabBar);
        if (isAlive(list)) {
            updateListContent(list, true);
        }
        if (typeof UpdatePresetHighlightPollingState === "function") {
            UpdatePresetHighlightPollingState();
        } else if (typeof globalThis.UpdatePresetHighlightPollingState === "function") {
            globalThis.UpdatePresetHighlightPollingState();
        }
    };

    // =========================================================================
    // Open / Close Lifecycle & UI Builder
    // =========================================================================

    const isOpen = () => {
        return !!(_window && isAlive(_window) && _window.BHasClass("Visible"));
    };

    const closeSettingsSideModalsIfOpen = () => {
        if (Q.ui?.modal?.closeSettingsSideModalsIfOpen) {
            Q.ui.modal.closeSettingsSideModalsIfOpen();
        } else if (typeof globalThis.CloseSettingsSideModalsIfOpen === "function" && globalThis.CloseSettingsSideModalsIfOpen !== closeSettingsSideModalsIfOpen) {
            globalThis.CloseSettingsSideModalsIfOpen();
        }
    };

    const toggleSettingsWindow = () => {
        const now = getNowMs();
        if (now < _settingsToggleDebounceUntilMs) return;
        _settingsToggleDebounceUntilMs = now + 220;
        if (typeof globalThis.gSettingsToggleDebounceUntilMs !== "undefined") {
            globalThis.gSettingsToggleDebounceUntilMs = _settingsToggleDebounceUntilMs;
        }

        const ctx = (typeof $.GetContextPanel === "function") ? $.GetContextPanel() : null;
        const win = (ctx && ctx.FindChildTraverse ? ctx.FindChildTraverse("SettingsWindow") : null) || findShell();
        if (!win) return;

        win.ToggleClass("Visible");
        if (win.BHasClass("Visible")) {
            _settingsOpenGuardUntilMs = getNowMs() + 350;
            if (typeof globalThis.gSettingsOpenGuardUntilMs !== "undefined") {
                globalThis.gSettingsOpenGuardUntilMs = _settingsOpenGuardUntilMs;
            }
            _openedInHideout = isInHideout();
            if (typeof globalThis.gSettingsOpenedInHideout !== "undefined") {
                globalThis.gSettingsOpenedInHideout = _openedInHideout;
            }
            try { Q.tooltip?.setThemeActive?.(true); } catch (_) {}
            try {
                const isBuilt = _uiBuilt || (typeof globalThis.gSettingsUiBuilt !== "undefined" && globalThis.gSettingsUiBuilt);
                if (!isBuilt) {
                    buildUI();
                } else {
                    if (typeof SyncConfigFromStorage === "function") {
                        SyncConfigFromStorage();
                    }
                    const list = (ctx && ctx.FindChildTraverse ? ctx.FindChildTraverse("SettingsList") : null) || _contentList;
                    if (list) {
                        updateListContent(list, true);
                    }
                    if (typeof UpdatePresetHighlightPollingState === "function") {
                        UpdatePresetHighlightPollingState();
                    } else if (typeof globalThis.UpdatePresetHighlightPollingState === "function") {
                        globalThis.UpdatePresetHighlightPollingState();
                    }
                }
            } catch (_) {}

            try {
                if (Q.updateChecker?.onSettingsOpened) {
                    Q.updateChecker.onSettingsOpened();
                }
            } catch (_) {}

            try { win.SetFocus(); } catch (_) {}
            if (_openedInHideout) {
                startTransitionWatch();
            }
            Q.events?.emit?.("ui:settings_opened");
        } else {
            stopTransitionWatch();
            _openedInHideout = false;
            if (typeof globalThis.gSettingsOpenedInHideout !== "undefined") {
                globalThis.gSettingsOpenedInHideout = false;
            }
            try { Q.tooltip?.setThemeActive?.(false); } catch (_) {}
            try { Q.tooltip?.hideRowTooltip?.(); } catch (_) {}
            if (typeof StopPresetHighlightPolling === "function") {
                StopPresetHighlightPolling();
            } else if (typeof globalThis.StopPresetHighlightPolling === "function") {
                globalThis.StopPresetHighlightPolling();
            }
            try { Q.preview?.hideAll?.(); } catch (_) {}
            closeSettingsSideModalsIfOpen();
            try { Q.arcade?.closeAllModals?.(); } catch (_) {}
            Q.events?.emit?.("ui:settings_closed");
        }
    };

    const forceCloseModSettings = (ignoreGuard = false) => {
        const now = getNowMs();
        const guardUntil = (typeof globalThis.gSettingsOpenGuardUntilMs !== "undefined")
            ? globalThis.gSettingsOpenGuardUntilMs
            : _settingsOpenGuardUntilMs;
        if (!ignoreGuard && now < guardUntil) return;

        const ctx = (typeof $.GetContextPanel === "function") ? $.GetContextPanel() : null;
        const win = (ctx && ctx.FindChildTraverse ? ctx.FindChildTraverse("SettingsWindow") : null) || findShell();
        if (win) {
            win.RemoveClass("Visible");
        }
        stopTransitionWatch();
        _openedInHideout = false;
        if (typeof globalThis.gSettingsOpenedInHideout !== "undefined") {
            globalThis.gSettingsOpenedInHideout = false;
        }
        try { Q.tooltip?.setThemeActive?.(false); } catch (_) {}
        try { Q.tooltip?.hideRowTooltip?.(); } catch (_) {}
        if (typeof StopPresetHighlightPolling === "function") {
            StopPresetHighlightPolling();
        } else if (typeof globalThis.StopPresetHighlightPolling === "function") {
            globalThis.StopPresetHighlightPolling();
        }
        try { Q.preview?.hideAll?.(); } catch (_) {}
        closeSettingsSideModalsIfOpen();
        try { Q.arcade?.closeAllModals?.(); } catch (_) {}
        try {
            if (typeof $.DispatchEvent === "function" && ctx) {
                $.DispatchEvent("CitadelResumePlaying", ctx);
            }
        } catch (_) {}
        Q.events?.emit?.("ui:settings_closed");
    };

    const setOpen = (open) => {
        if (open) {
            if (!isOpen()) {
                const shell = findShell();
                if (shell) shell.SetHasClass("Visible", true);
                const list = getSettingsListPanel();
                if (list) updateListContent(list, true);
                try { shell?.SetFocus(); } catch (_) {}
                Q.events?.emit?.("ui:settings_opened");
            }
        } else {
            forceCloseModSettings(true);
        }
    };

    const toggle = () => {
        if (isOpen()) {
            forceCloseModSettings(true);
        } else {
            setOpen(true);
        }
    };

    const buildUI = () => {
        const ctx = (typeof $.GetContextPanel === "function") ? $.GetContextPanel() : null;
        if (!ctx) return;
        const win = ctx.FindChildTraverse("SettingsWindow");
        const list = ctx.FindChildTraverse("SettingsList");
        const body = ctx.FindChildTraverse("SettingsBody");
        if (!list || !win) return;

        if (typeof SyncConfigFromStorage === "function") {
            SyncConfigFromStorage();
        }

        const tabHost = body || win;
        win.SetPanelEvent("oncancel", () => {
            forceCloseModSettings();
        });

        let curTab = (typeof globalThis.currentTab !== "undefined") ? globalThis.currentTab : _activeTab;
        if (curTab === "Layout") curTab = "HUD";
        if (curTab === "Main") curTab = "Presets";
        if (curTab === "HUDControls" || curTab === "UI") curTab = "Config";
        _activeTab = curTab;
        globalThis.currentTab = curTab;

        let tabBar = tabHost.FindChildTraverse("SettingsTabBar");
        if (tabBar) {
            const tabGroups = getTabGroups();
            let allPresent = true;
            for (let gi = 0; gi < tabGroups.length; gi++) {
                const grp = tabGroups[gi];
                for (let ti = 0; ti < grp.tabs.length; ti++) {
                    const expectedId = "TabButton_" + String(grp.tabs[ti] || "").replace(/\s+/g, "");
                    if (!tabBar.FindChildTraverse(expectedId)) {
                        allPresent = false;
                        break;
                    }
                }
                if (!allPresent) break;
            }
            const hasLegacyTabs = tabBar.FindChildTraverse("TabButton_Layout") ||
                tabBar.FindChildTraverse("TabButton_Main") ||
                tabBar.FindChildTraverse("TabButton_UI");
            if (!allPresent || hasLegacyTabs) {
                tabBar.DeleteAsync(0);
                tabBar = null;
            }
        }

        let contentHost = tabHost.FindChildTraverse("SettingsContentHost");
        if (!contentHost) {
            contentHost = createPanel("Panel", tabHost, "SettingsContentHost");
        }
        if (list.GetParent && list.GetParent() !== contentHost) {
            try { list.SetParent(contentHost); } catch (_) {}
        }

        if (!tabBar) {
            const staleTabBar = win.FindChildTraverse("SettingsTabBar");
            if (staleTabBar && staleTabBar.GetParent && staleTabBar.GetParent() !== tabHost) {
                staleTabBar.DeleteAsync(0);
            }
            tabBar = createPanel("Panel", tabHost, "SettingsTabBar");
        }
        if (tabHost.MoveChildBefore && tabBar && contentHost) {
            try { tabHost.MoveChildBefore(tabBar, contentHost); } catch (_) {}
        }

        const legacySearchWrap = tabBar ? tabBar.FindChildTraverse("SettingsSearchWrap") : null;
        if (legacySearchWrap) legacySearchWrap.DeleteAsync(0);
        const legacyActions = tabBar ? tabBar.FindChildTraverse("SettingsTabRailActions") : null;
        if (legacyActions) legacyActions.DeleteAsync(0);
        const legacySpacer = tabBar ? tabBar.FindChildTraverse("SettingsTabRailSpacer") : null;
        if (legacySpacer) legacySpacer.DeleteAsync(0);

        let tabListHost = tabBar ? tabBar.FindChildTraverse("SettingsTabRailTabs") : null;
        if (!tabListHost && tabBar) {
            tabListHost = createPanel("Panel", tabBar, "SettingsTabRailTabs");
        }

        if (tabListHost && typeof tabListHost.RemoveAndDeleteChildren === "function") {
            tabListHost.RemoveAndDeleteChildren();
        }

        const tabGroups = getTabGroups();
        for (let gi = 0; gi < tabGroups.length; gi++) {
            const group = tabGroups[gi];
            const groupKey = String(group.title || "").replace(/\s+/g, "");
            const groupPanel = createPanel("Panel", tabListHost, `SettingsTabRailGroup_${groupKey}`);
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

            for (let ti = 0; ti < group.tabs.length; ti++) {
                const catName = group.tabs[ti];
                const tabClassSuffix = String(catName || "").replace(/[^A-Za-z0-9]/g, "");
                const tabId = "TabButton_" + catName.replace(" ", "");
                const tab = createPanel("Button", groupTabs, tabId);
                if (!tab) continue;
                tab.AddClass("TabItem");
                tab.AddClass("TabItem_" + tabClassSuffix);

                const tabIconSrc = getTabIcon(catName);
                if (tabIconSrc) {
                    const tabIcon = createPanel("Image", tab, "TabIcon", {
                        src: tabIconSrc,
                        defaultsrc: "",
                        scaling: "contain"
                    });
                    if (tabIcon) {
                        tabIcon.AddClass("TabIcon");
                        tabIcon.AddClass("TabIcon_" + tabClassSuffix);
                    }
                }

                const tabLbl = createPanel("Label", tab, "TabLabel");
                if (tabLbl) {
                    const displayName = getTabDisplayName(catName);
                    tabLbl.text = localize(displayName, true);
                }

                tab.SetHasClass("Active", catName === curTab);
                tab.SetPanelEvent("onactivate", () => {
                    setActiveTabAndRefresh(catName);
                });
                _tabButtons.set(catName, tab);
            }
        }

        let tabSpacerMain = tabBar ? tabBar.FindChildTraverse("SettingsTabRailSpacerMain") : null;
        if (!tabSpacerMain && tabBar) {
            tabSpacerMain = createPanel("Panel", tabBar, "SettingsTabRailSpacerMain");
        }
        if (tabSpacerMain) {
            tabSpacerMain.AddClass("SettingsTabRailSpacerMain");
        }

        let tabFooter = tabBar ? tabBar.FindChildTraverse("SettingsTabRailFooter") : null;
        if (!tabFooter && tabBar) {
            tabFooter = createPanel("Panel", tabBar, "SettingsTabRailFooter");
        }
        if (tabFooter) {
            tabFooter.AddClass("SettingsTabRailFooter");
            let footerRule = tabFooter.FindChildTraverse("SettingsTabRailFooterRule");
            if (!footerRule) {
                footerRule = createPanel("Panel", tabFooter, "SettingsTabRailFooterRule");
            }
            if (footerRule) footerRule.AddClass("SettingsTabRailFooterRule");

            const newsFooterBtn = tabFooter.FindChildTraverse("FooterNewsLinkButton");
            if (newsFooterBtn) newsFooterBtn.DeleteAsync(0);

            let saveFooterBtn = tabFooter.FindChildTraverse("FooterSaveBuildButton");
            let discordFooterBtn = tabFooter.FindChildTraverse("FooterDiscordRailButton");
            if (!discordFooterBtn) {
                discordFooterBtn = createPanel("Button", tabFooter, "FooterDiscordRailButton");
            }
            if (discordFooterBtn) {
                discordFooterBtn.AddClass("TabItem");
                discordFooterBtn.AddClass("FooterDiscordRailBtn");
                let discordFooterLabel = discordFooterBtn.FindChildTraverse("TabLabel");
                if (!discordFooterLabel) {
                    discordFooterLabel = createPanel("Label", discordFooterBtn, "TabLabel");
                }
                if (discordFooterLabel) discordFooterLabel.text = localize("DISCORD", true);
                discordFooterBtn.SetPanelEvent("onactivate", () => {
                    try { $.DispatchEvent("ExternalBrowserGoToURL", "https://discord.gg/npCvuMcTY7"); } catch (_) {}
                });
                ensureDiscordTextureLogo(discordFooterBtn, "FooterDiscordLogoTexture", "FooterDiscordLogoTexture");
                const discordFooterIcon = discordFooterBtn.FindChildTraverse("FooterDiscordLogoTexture");
                if (discordFooterIcon && discordFooterBtn.MoveChildBefore && discordFooterLabel) {
                    try { discordFooterBtn.MoveChildBefore(discordFooterIcon, discordFooterLabel); } catch (_) {}
                }
            }

            if (!saveFooterBtn) {
                saveFooterBtn = createPanel("Button", tabFooter, "FooterSaveBuildButton");
            }
            if (saveFooterBtn) {
                saveFooterBtn.AddClass("TabItem");
                saveFooterBtn.AddClass("FooterSaveBuildTab");
                let saveFooterLabel = saveFooterBtn.FindChildTraverse("TabLabel");
                if (!saveFooterLabel) {
                    saveFooterLabel = createPanel("Label", saveFooterBtn, "TabLabel");
                }
                let saveFooterIcon = saveFooterBtn.FindChildTraverse("TabIcon");
                if (!saveFooterIcon) {
                    saveFooterIcon = createPanel("Image", saveFooterBtn, "TabIcon", {
                        src: "s2r://panorama/images/icons/icon_download.vsvg",
                        defaultsrc: "",
                        scaling: "contain"
                    });
                }
                if (saveFooterIcon) {
                    saveFooterIcon.AddClass("TabIcon");
                    saveFooterIcon.AddClass("FooterSaveBuildIcon");
                }
                if (saveFooterBtn.MoveChildBefore && saveFooterIcon && saveFooterLabel) {
                    try { saveFooterBtn.MoveChildBefore(saveFooterIcon, saveFooterLabel); } catch (_) {}
                }
                if (saveFooterLabel) {
                    saveFooterLabel.text = localize("SAVE", true);
                }
                saveFooterBtn.SetPanelEvent("onmouseover", () => {
                    if (!isAlive(saveFooterBtn)) return;
                    try { Q.tooltip?.hideTextTooltip?.(); } catch (_) {}
                    try { Q.tooltip?.cancelHide?.(); } catch (_) {}
                    const saveWarning = SETTINGS_SAVE_LOADER_ENABLED ? SETTINGS_SAVE_HOVER_WARNING : SETTINGS_SAVE_DISABLED_WARNING;
                    try {
                        Q.tooltip?.showRowTooltip?.(
                            saveFooterBtn,
                            "",
                            saveWarning,
                            (typeof PERF_IMPACT_TIER_NONE !== "undefined" ? PERF_IMPACT_TIER_NONE : "none"),
                            "",
                            { footerSaveWarning: true }
                        );
                    } catch (_) {}
                });
                saveFooterBtn.SetPanelEvent("onmouseout", () => {
                    try { Q.tooltip?.hideTooltipDeferred?.("footer_save_mouseout"); } catch (_) {}
                });
                saveFooterBtn.SetPanelEvent("onactivate", () => {
                    try { Q.tooltip?.hideRowTooltip?.(); } catch (_) {}
                    if (typeof ActivateBuildSaveFromUi === "function") {
                        ActivateBuildSaveFromUi(saveFooterBtn, saveFooterLabel);
                    } else if (typeof globalThis.ActivateBuildSaveFromUi === "function") {
                        globalThis.ActivateBuildSaveFromUi(saveFooterBtn, saveFooterLabel);
                    }
                });
                if (tabFooter.MoveChildBefore && discordFooterBtn && saveFooterBtn) {
                    try { tabFooter.MoveChildBefore(discordFooterBtn, saveFooterBtn); } catch (_) {}
                }
            }

            let footerVersionLabel = tabFooter.FindChildTraverse("FooterVersionLabel");
            if (footerVersionLabel) {
                footerVersionLabel.DeleteAsync(0);
                footerVersionLabel = null;
            }
            footerVersionLabel = createPanel("Button", tabFooter, "FooterVersionLabel");
            if (footerVersionLabel) {
                footerVersionLabel.AddClass("TabItem");
                footerVersionLabel.AddClass("FooterVersionLabel");
                const footerVersionIcon = createPanel("Image", footerVersionLabel, "FooterVersionIcon", {
                    src: "s2r://panorama/images/icons/properties/charge.vsvg",
                    defaultsrc: "",
                    scaling: "contain"
                });
                if (footerVersionIcon) {
                    footerVersionIcon.AddClass("TabIcon");
                    footerVersionIcon.AddClass("FooterVersionIcon");
                }
                const footerVersionText = createPanel("Label", footerVersionLabel, "FooterVersionLabelText");
                if (footerVersionText) {
                    footerVersionText.AddClass("TabLabel");
                    footerVersionText.AddClass("FooterVersionLabelText");
                    footerVersionText.text = (typeof MOD_DISPLAY_VERSION !== "undefined")
                        ? MOD_DISPLAY_VERSION
                        : (Q.VERSION || "4.0.0");
                }
                footerVersionLabel.SetPanelEvent("onactivate", () => {
                    setActiveTabAndRefresh("Dev");
                });
            }

            const staleDiscordFooterBtn = tabFooter.FindChildTraverse("FooterDiscordLinkButton");
            if (staleDiscordFooterBtn) staleDiscordFooterBtn.DeleteAsync(0);
            const supportFooterBtn = tabFooter.FindChildTraverse("FooterSupportTabButton");
            if (supportFooterBtn) supportFooterBtn.DeleteAsync(0);
            const sideNavCreditRow = tabFooter.FindChildTraverse("SideNavCreditRow");
            if (sideNavCreditRow) sideNavCreditRow.DeleteAsync(0);
        }

        if (tabBar && tabListHost && tabSpacerMain) {
            try { tabBar.MoveChildBefore(tabListHost, tabSpacerMain); } catch (_) {}
        }
        if (tabBar && tabSpacerMain && tabFooter) {
            try { tabBar.MoveChildBefore(tabSpacerMain, tabFooter); } catch (_) {}
        }

        const staleSubHeader = contentHost ? contentHost.FindChildTraverse("SettingsSubHeaderBar") : null;
        if (staleSubHeader) staleSubHeader.DeleteAsync(0);
        const staleSubHeaderActions = tabHost.FindChildTraverse("SettingsSubHeaderActions");
        if (staleSubHeaderActions) staleSubHeaderActions.DeleteAsync(0);
        const dragBtnRailExisting = tabHost.FindChildTraverse("DragToggleBtnRail");
        if (dragBtnRailExisting) dragBtnRailExisting.DeleteAsync(0);
        const previewBtnRailExisting = tabHost.FindChildTraverse("PreviewToggleBtnRail");
        if (previewBtnRailExisting) previewBtnRailExisting.DeleteAsync(0);
        const impBtnRailExisting = tabHost.FindChildTraverse("ImportSettingsBtnRail");
        if (impBtnRailExisting) impBtnRailExisting.DeleteAsync(0);
        const expBtnRailExisting = tabHost.FindChildTraverse("ExportSettingsBtnRail");
        if (expBtnRailExisting) expBtnRailExisting.DeleteAsync(0);

        syncTabActiveStates(tabBar);

        const header = win.FindChildTraverse("SettingsHeader");
        if (header) {
            const getTheme = (typeof GetSettingsTheme === "function")
                ? GetSettingsTheme
                : (Q.ui?.theme?.getTheme ? Q.ui.theme.getTheme : (() => ""));
            const theme = getTheme();
            const isMunfins = (typeof SETTINGS_THEME_MUNFINS !== "undefined") ? (theme === SETTINGS_THEME_MUNFINS) : (theme === "munfins");
            const isDefaultTheme = (typeof SETTINGS_THEME_DEFAULT !== "undefined") ? (theme === SETTINGS_THEME_DEFAULT) : (theme === "default");

            const munfinsLogoSrc = (typeof SETTINGS_HEADER_MUNFINS_LOGO_SRC !== "undefined") ? SETTINGS_HEADER_MUNFINS_LOGO_SRC : "s2r://panorama/images/qollock/munfins_cat_face_png.vtex";
            const defaultLogoSrc = (typeof SETTINGS_HEADER_MOG_LOGO_DEFAULT_SRC !== "undefined") ? SETTINGS_HEADER_MOG_LOGO_DEFAULT_SRC : "s2r://panorama/images/qollock/qollock_logo_white_png.vtex";
            const themeLogoSrc = (typeof SETTINGS_HEADER_MOG_LOGO_THEME_SRC !== "undefined") ? SETTINGS_HEADER_MOG_LOGO_THEME_SRC : "s2r://panorama/images/qollock/qollock_logo_white_png.vtex";

            const logoSrc = isMunfins ? munfinsLogoSrc : (isDefaultTheme ? defaultLogoSrc : themeLogoSrc);

            let headerLogo = header.FindChildTraverse("SettingsHeaderMogLogo");
            if (!headerLogo) {
                headerLogo = createPanel("Image", header, "SettingsHeaderMogLogo", {
                    src: logoSrc,
                    defaultsrc: "",
                    scaling: "contain"
                });
            }
            if (headerLogo) {
                headerLogo.hittest = false;
                headerLogo.hittestchildren = false;
                try { if (headerLogo.SetImage) headerLogo.SetImage(logoSrc); } catch (_) {}
            }

            const headerTitle = header.FindChildTraverse("SettingsTitle");
            if (headerTitle) {
                headerTitle.text = localize("LOCK", true);
                headerTitle.AddClass("SettingsHeaderTitleWordmark");
                headerTitle.hittest = false;
                headerTitle.hittestchildren = false;

                let headerTitleAccent = header.FindChildTraverse("SettingsTitleAccent");
                if (!headerTitleAccent) {
                    headerTitleAccent = createPanel("Label", header, "SettingsTitleAccent");
                }
                if (headerTitleAccent) {
                    headerTitleAccent.AddClass("SettingsHeaderTitleWordmark");
                    headerTitleAccent.text = isMunfins ? "Munfins" : localize("QOL", true);
                    headerTitleAccent.hittest = false;
                    headerTitleAccent.hittestchildren = false;
                }

                if (header.MoveChildBefore && headerLogo) {
                    try { header.MoveChildBefore(headerLogo, headerTitle); } catch (_) {}
                }
                if (header.MoveChildBefore && headerTitleAccent) {
                    try { header.MoveChildBefore(headerTitleAccent, headerTitle); } catch (_) {}
                }
            }

            let headerVer = header.FindChildTraverse("ModVersionLabelTop");
            if (!headerVer) {
                headerVer = createPanel("Button", header, "ModVersionLabelTop");
                if (headerVer) {
                    headerVer.AddClass("HeaderMoglockLinkButton");
                    headerVer.hittest = true;
                    headerVer.hittestchildren = true;
                    headerVer.style.zIndex = "7";
                    headerVer.SetPanelEvent("onactivate", () => {
                        try { $.DispatchEvent("ExternalBrowserGoToURL", "https://moglock.gg/"); } catch (_) {}
                    });
                    const headerVerPrefix = createPanel("Label", headerVer, "ModVersionLabelTopPrefix");
                    if (headerVerPrefix) headerVerPrefix.text = localize("by", true);
                    const headerVerDomain = createPanel("Label", headerVer, "ModVersionLabelTopDomain");
                    if (headerVerDomain) headerVerDomain.text = localize("moglock.gg", true);
                }
            } else {
                const headerVerPrefix = headerVer.FindChildTraverse("ModVersionLabelTopPrefix");
                if (headerVerPrefix) headerVerPrefix.text = localize("by", true);
                const headerVerDomain = headerVer.FindChildTraverse("ModVersionLabelTopDomain");
                if (headerVerDomain) headerVerDomain.text = localize("moglock.gg", true);
            }
            if (headerVer) {
                headerVer.visible = !isMunfins;
                headerVer.style.visibility = isMunfins ? "collapse" : "visible";
            }

            if (typeof ApplySettingsHeaderLogoTheme === "function") {
                ApplySettingsHeaderLogoTheme(theme);
            } else if (Q.ui?.theme?.applyHeaderLogoTheme) {
                Q.ui.theme.applyHeaderLogoTheme(theme);
            }

            let headerCenterHost = header.FindChildTraverse("SettingsHeaderCenterHost");
            if (!headerCenterHost) {
                headerCenterHost = createPanel("Panel", header, "SettingsHeaderCenterHost");
            }
            if (headerCenterHost) {
                headerCenterHost.style.zIndex = "4";
            }

            const closeBtnHeader = header.FindChildTraverse("CloseBtn");
            if (closeBtnHeader) {
                const headerDiscordBtn = header.FindChildTraverse("HeaderDiscordLinkButton");
                if (headerDiscordBtn) headerDiscordBtn.DeleteAsync(0);

                closeBtnHeader.style.horizontalAlign = "right";
                closeBtnHeader.style.verticalAlign = "center";
                closeBtnHeader.SetPanelEvent("onactivate", () => {
                    forceCloseModSettings();
                });
            }

            // Ensure header children ordering:
            // [Logo] [Accent: QOL] [Title: LOCK] [by moglock.gg] [CenterHost: Search] [CloseBtn: X]
            if (header.MoveChildBefore) {
                if (headerCenterHost && closeBtnHeader) {
                    try { header.MoveChildBefore(headerCenterHost, closeBtnHeader); } catch (_) {}
                }
                if (headerVer && headerCenterHost) {
                    try { header.MoveChildBefore(headerVer, headerCenterHost); } catch (_) {}
                }
            }

            // Clean up any stale search wrap not parented to headerCenterHost
            const staleWraps = [
                header.FindChildTraverse("SettingsSearchWrap"),
                tabHost ? tabHost.FindChildTraverse("SettingsSearchWrap") : null,
                contentHost ? contentHost.FindChildTraverse("SettingsSearchWrap") : null
            ];
            for (const sw of staleWraps) {
                if (sw && sw.GetParent && sw.GetParent() !== headerCenterHost) {
                    try { sw.DeleteAsync(0); } catch (_) {}
                }
            }

            // Create / configure SettingsSearchWrap inside headerCenterHost
            let searchWrapExisting = headerCenterHost ? headerCenterHost.FindChildTraverse("SettingsSearchWrap") : null;
            if (!searchWrapExisting && headerCenterHost) {
                searchWrapExisting = createPanel("Panel", headerCenterHost, "SettingsSearchWrap");
            }
            if (searchWrapExisting) {
                searchWrapExisting.AddClass("SettingsHeaderSearchWrap");
                searchWrapExisting.hittest = true;
                searchWrapExisting.hittestchildren = true;
                searchWrapExisting.style.zIndex = "4";

                let searchIconExisting = searchWrapExisting.FindChildTraverse("SettingsNavigationSearchIcon");
                if (!searchIconExisting) {
                    searchIconExisting = createPanel("Image", searchWrapExisting, "SettingsNavigationSearchIcon", {
                        src: "s2r://panorama/images/control_icons/24px/search.vsvg",
                        defaultsrc: "",
                        scaling: "contain"
                    });
                }

                let searchInputExisting = searchWrapExisting.FindChildTraverse("SettingsSearchInput");
                if (!searchInputExisting) {
                    searchInputExisting = createPanel("TextEntry", searchWrapExisting, "SettingsSearchInput");
                }

                const syncSearchQueryState = () => {
                    const query = searchInputExisting.text || "";
                    if (typeof currentSearchQuery !== "undefined") {
                        currentSearchQuery = query;
                    }
                    globalThis.currentSearchQuery = query;
                    if (typeof UpdateSettingsSearchUiState === "function") {
                        UpdateSettingsSearchUiState(win);
                    } else if (Q.ui?.search?.updateSettingsSearchUiState) {
                        Q.ui.search.updateSettingsSearchUiState(win);
                    }
                };

                if (searchInputExisting) {
                    searchInputExisting.SetPanelEvent("ontextentrychange", () => {
                        syncSearchQueryState();
                        if (typeof ScheduleSettingsSearchRender === "function") {
                            ScheduleSettingsSearchRender();
                        } else if (Q.ui?.search?.scheduleSettingsSearchRender) {
                            Q.ui.search.scheduleSettingsSearchRender();
                        }
                    });
                    searchInputExisting.SetPanelEvent("oninputsubmit", () => {
                        syncSearchQueryState();
                        if (typeof FlushSettingsSearchRender === "function") {
                            FlushSettingsSearchRender();
                        } else if (Q.ui?.search?.flushSettingsSearchRender) {
                            Q.ui.search.flushSettingsSearchRender();
                        }
                    });
                }

                let searchClearExisting = searchWrapExisting.FindChildTraverse("SettingsSearchClear");
                if (!searchClearExisting) {
                    searchClearExisting = createPanel("Button", searchWrapExisting, "SettingsSearchClear");
                    if (searchClearExisting) {
                        const searchClearLabel = createPanel("Label", searchClearExisting, "");
                        if (searchClearLabel) searchClearLabel.text = "X";
                    }
                }
                if (searchClearExisting) {
                    searchClearExisting.hittest = true;
                    searchClearExisting.hittestchildren = true;
                    let searchClearLabelExisting = null;
                    try {
                        const clearChildren = searchClearExisting.Children ? searchClearExisting.Children() : [];
                        if (clearChildren && clearChildren.length > 0) searchClearLabelExisting = clearChildren[0];
                    } catch (_) {}
                    if (!searchClearLabelExisting) {
                        searchClearLabelExisting = createPanel("Label", searchClearExisting, "");
                        if (searchClearLabelExisting) searchClearLabelExisting.text = "X";
                    }
                    if (searchClearLabelExisting) {
                        searchClearLabelExisting.hittest = false;
                        searchClearLabelExisting.hittestchildren = false;
                    }
                    searchClearExisting.SetPanelEvent("onactivate", () => {
                        if (typeof ClearSettingsSearchQuery === "function") {
                            ClearSettingsSearchQuery(win);
                        } else if (Q.ui?.search?.clearSettingsSearchQuery) {
                            Q.ui.search.clearSettingsSearchQuery(win);
                        }
                        if (typeof CancelSettingsSearchRender === "function") {
                            CancelSettingsSearchRender();
                        } else if (Q.ui?.search?.cancelSettingsSearchRender) {
                            Q.ui.search.cancelSettingsSearchRender();
                        }
                        const liveList = (typeof GetSettingsListPanel === "function") ? GetSettingsListPanel() : list;
                        if (liveList) updateListContent(liveList, true);
                    });
                    const curQuery = (typeof globalThis.currentSearchQuery !== "undefined") ? globalThis.currentSearchQuery : "";
                    if (searchInputExisting && (searchInputExisting.text || "") !== curQuery) {
                        searchInputExisting.text = curQuery;
                    }
                    if (typeof UpdateSettingsSearchUiState === "function") {
                        UpdateSettingsSearchUiState(win);
                    }
                }
            }
        }

        updateListContent(list, true);
        if (typeof UpdatePresetHighlightPollingState === "function") {
            UpdatePresetHighlightPollingState();
        } else if (typeof globalThis.UpdatePresetHighlightPollingState === "function") {
            globalThis.UpdatePresetHighlightPollingState();
        }

        const footer = win.FindChildTraverse("SettingsFooter");
        if (footer) footer.DeleteAsync(0);

        if (typeof globalThis.SetupSettingsWindowDragging === "function") {
            globalThis.SetupSettingsWindowDragging(win.FindChildTraverse("SettingsHeader"), win);
        } else if (Q.ui?.drag?.setupSettingsWindowDragging) {
            Q.ui.drag.setupSettingsWindowDragging(win.FindChildTraverse("SettingsHeader"), win);
        }

        if (typeof QOLEnsureFriendsSearchHandlers === "function") {
            QOLEnsureFriendsSearchHandlers();
        } else if (Q.ui?.friends?.ensureFriendsSearchHandlers) {
            Q.ui.friends.ensureFriendsSearchHandlers();
        }

        _uiBuilt = true;
        if (typeof globalThis.gSettingsUiBuilt !== "undefined") {
            globalThis.gSettingsUiBuilt = true;
        }
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

    // Register unhandled engine events
    try {
        if (typeof $.RegisterForUnhandledEvent === "function") {
            $.RegisterForUnhandledEvent("CitadelResumePlaying", () => {
                const now = getNowMs();
                const guardUntil = (typeof globalThis.gSettingsOpenGuardUntilMs !== "undefined")
                    ? globalThis.gSettingsOpenGuardUntilMs
                    : _settingsOpenGuardUntilMs;
                if (now < guardUntil) return;
                const ctx = (typeof $.GetContextPanel === "function") ? $.GetContextPanel() : null;
                const win = (ctx && ctx.FindChildTraverse ? ctx.FindChildTraverse("SettingsWindow") : null) || findShell();
                if (win) win.RemoveClass("Visible");
                stopTransitionWatch();
                _openedInHideout = false;
                if (typeof globalThis.gSettingsOpenedInHideout !== "undefined") globalThis.gSettingsOpenedInHideout = false;
                try { Q.tooltip?.setThemeActive?.(false); } catch (_) {}
                try { Q.tooltip?.hideRowTooltip?.(); } catch (_) {}
                if (typeof StopPresetHighlightPolling === "function") StopPresetHighlightPolling();
                else if (typeof globalThis.StopPresetHighlightPolling === "function") globalThis.StopPresetHighlightPolling();
                try { Q.preview?.hideAll?.(); } catch (_) {}
                closeSettingsSideModalsIfOpen();
                try { Q.arcade?.closeAllModals?.(); } catch (_) {}
                Q.events?.emit?.("ui:settings_closed");
            });
        }
    } catch (e) {
        $.Msg(`[QOLLock][Settings] CitadelResumePlaying event not available: ${e?.message || e}`);
    }
    try {
        if (typeof $.RegisterForUnhandledEvent === "function") {
            $.RegisterForUnhandledEvent("CitadelGameStateChanged", () => {
                handleTransitionSignal("CitadelGameStateChanged");
            });
        }
    } catch (e) {
        $.Msg(`[QOLLock][Settings] CitadelGameStateChanged event not available: ${e?.message || e}`);
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
        buildUI,
        toggleSettingsWindow,
        forceCloseModSettings,
        closeOpenSettingsDropdowns,
        syncTabActiveStates,
        setActiveTabAndRefresh,
        renderCurrentTabContent,
        updateListContent,
        buildSettingsListRenderSignature,
        getSettingsListPanel,
        closeSettingsSideModalsIfOpen,
    };

    Q.ui.window = windowApi;

    // Transitional global and $ bindings for XML buttons / events
    $.BuildUI = () => windowApi.buildUI();
    $.ToggleSettingsWindow = () => windowApi.toggleSettingsWindow();
    $.ForceCloseModSettings = (ignoreGuard) => windowApi.forceCloseModSettings(ignoreGuard);

    globalThis.BuildUI = buildUI;
    globalThis.ToggleSettingsWindow = toggleSettingsWindow;
    globalThis.ForceCloseModSettings = forceCloseModSettings;
    globalThis.CloseOpenSettingsDropdowns = closeOpenSettingsDropdowns;
    globalThis.SyncTabActiveStates = syncTabActiveStates;
    globalThis.SetActiveTabAndRefresh = setActiveTabAndRefresh;
    globalThis.RenderCurrentTabContent = renderCurrentTabContent;
    globalThis.UpdateListContent = updateListContent;
    globalThis.BuildSettingsListRenderSignature = buildSettingsListRenderSignature;
    globalThis.GetSettingsListPanel = getSettingsListPanel;
    globalThis.CloseSettingsSideModalsIfOpen = closeSettingsSideModalsIfOpen;

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

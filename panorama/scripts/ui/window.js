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

    $.Msg("[QOLLock] ui/window: settings window manager ready.");
})();

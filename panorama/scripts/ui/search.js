// panorama/scripts/ui/search.js
// =============================================================================
// QOLLOCK — Cross-Tab Settings Search (ES6)
// =============================================================================
// Modeled after thirdeye/panorama/scripts/ui/search.js.
// Injected into SettingsHeader. Searches across all manifest settings and layouts.
// Renders live results into content container with breadcrumbs.
// =============================================================================

(() => {
    "use strict";

    const Q = (typeof globalThis !== "undefined" && globalThis.QOL)
        ? globalThis.QOL
        : (typeof QOL !== "undefined" ? QOL : null);

    if (!Q?.ui) {
        $.Msg("[QOLLock] ui/search: QOL.ui missing — aborting");
        return;
    }

    let _searchWrap = null;
    let _searchInput = null;
    let _searchClear = null;
    let _searching = false;
    let _currentQuery = "";
    let _suppressChange = false;

    const isAlive = (panel) => {
        if (Q.core?.panel?.isAlive) return Q.core.panel.isAlive(panel);
        return !!(panel && typeof panel.IsValid === "function" && panel.IsValid());
    };

    const createPanel = (type, parent, id, props = {}) => {
        if (Q.core?.panel?.create) return Q.core.panel.create(type, parent, id, props);
        if (typeof $.CreatePanel === "function") return $.CreatePanel(type, parent, id || "", props);
        return null;
    };

    // =========================================================================
    // Search Matching
    // =========================================================================

    const matchSetting = (setting, query) => {
        if (!setting) return false;
        const key = String(setting.key || "").toLowerCase();
        if (key.includes(query)) return true;

        const label = String(setting.label || setting.name || "").toLowerCase();
        if (label.includes(query)) return true;

        const desc = String(setting.description || "").toLowerCase();
        if (desc.includes(query)) return true;

        return false;
    };

    const matchManifest = (manifest, query) => {
        if (!manifest) return { matches: false, matchingSettings: [] };

        const idMatch = String(manifest.id || "").toLowerCase().includes(query);
        const nameMatch = String(manifest.name || "").toLowerCase().includes(query);
        const descMatch = String(manifest.description || "").toLowerCase().includes(query);

        const allSettings = Array.isArray(manifest.settings) ? manifest.settings : [];
        const matchingSettings = [];

        if (idMatch || nameMatch || descMatch) {
            // Whole manifest matches — show all its settings
            return { matches: true, matchingSettings: allSettings };
        }

        // Check individual settings
        for (let i = 0; i < allSettings.length; i++) {
            if (matchSetting(allSettings[i], query)) {
                matchingSettings.push(allSettings[i]);
            }
        }

        return { matches: matchingSettings.length > 0, matchingSettings };
    };

    const runSearch = (query) => {
        const results = [];
        const FR = Q.core?.FeatureRegistry;
        if (!FR) return results;

        // Iterate all manifests referenced in layout or registered
        const layout = Q.ui.layout;
        const seenManifests = new Set();

        if (Array.isArray(layout)) {
            for (const tab of layout) {
                if (!tab || tab.heading || !Array.isArray(tab.sections)) continue;
                for (const section of tab.sections) {
                    if (!Array.isArray(section.features)) continue;
                    for (const item of section.features) {
                        const fid = typeof item === "string" ? item : item?.id;
                        if (!fid || seenManifests.has(fid)) continue;
                        seenManifests.add(fid);

                        const manifest = FR.getManifest(fid);
                        if (!manifest) continue;

                        const { matches, matchingSettings } = matchManifest(manifest, query);
                        if (matches && matchingSettings.length > 0) {
                            results.push({
                                featureId: fid,
                                manifest,
                                settings: matchingSettings,
                                tabId: tab.id,
                                tabName: tab.name || tab.id,
                                sectionTitle: section.title || "",
                            });
                        }
                    }
                }
            }
        }

        return results;
    };

    // =========================================================================
    // Search Results Rendering
    // =========================================================================

    const renderResults = (results, container) => {
        if (!container || !isAlive(container)) return;
        const renderer = Q.ui?.renderer;
        if (!renderer) return;

        try {
            container.RemoveAndDeleteChildren();
        } catch (_) {}

        if (results.length === 0) {
            const emptyLabel = createPanel("Label", container, "SearchEmptyLabel");
            if (emptyLabel) {
                emptyLabel.AddClass("SettingRow");
                emptyLabel.text = `No settings found for "${_currentQuery}"`;
            }
            return;
        }

        let totalSettings = 0;
        for (const r of results) totalSettings += r.settings.length;

        const countHeader = createPanel("Label", container, "SearchResultsCount");
        if (countHeader) {
            countHeader.AddClass("SectionHeader");
            countHeader.text = `Found ${totalSettings} setting${totalSettings === 1 ? "" : "s"} across ${results.length} feature${results.length === 1 ? "" : "s"}`;
        }

        for (let i = 0; i < results.length; i++) {
            const res = results[i];
            renderer.createSeparator(container);

            const breadcrumbText = res.sectionTitle
                ? `${res.tabName} > ${res.sectionTitle}`
                : res.tabName;

            renderer.createSectionHeader(container, `${res.manifest.name || res.featureId} (${breadcrumbText})`, res.manifest.description || "");

            for (let j = 0; j < res.settings.length; j++) {
                const setting = res.settings[j];
                const curVal = (Q.core?.ConfigStore?.hasSchema?.(res.featureId))
                    ? Q.core.ConfigStore.get(res.featureId, setting.key)
                    : (globalThis.MOD_CONFIG ? globalThis.MOD_CONFIG[setting.key] : setting.default);

                const onChange = (k, v) => {
                    if (Q.core?.ConfigStore?.hasSchema?.(res.featureId)) {
                        Q.core.ConfigStore.set(res.featureId, k, v);
                    }
                    if (globalThis.MOD_CONFIG) {
                        globalThis.MOD_CONFIG[k] = v;
                    }
                    if (typeof globalThis.MarkConfigDirty === "function") {
                        globalThis.MarkConfigDirty();
                    } else if (typeof globalThis.SaveAndSync === "function") {
                        globalThis.SaveAndSync();
                    }
                };

                renderer.createControl(container, setting, curVal, onChange);
            }
        }
    };

    // =========================================================================
    // Search Lifecycle & UI Hook
    // =========================================================================

    const clear = () => {
        _currentQuery = "";
        _searching = false;

        if (_searchInput && isAlive(_searchInput)) {
            _suppressChange = true;
            try { _searchInput.text = ""; } catch (_) {}
            _suppressChange = false;
        }

        if (_searchWrap && isAlive(_searchWrap)) {
            _searchWrap.SetHasClass("HasSearchText", false);
        }

        const win = Q.ui?.window;
        if (win) {
            const activeTab = win.getActiveTab();
            win.setActiveTab(activeTab);
        }
    };

    const search = (queryText) => {
        const query = String(queryText || "").trim().toLowerCase();
        _currentQuery = query;

        if (!query) {
            clear();
            return;
        }

        _searching = true;
        if (_searchWrap && isAlive(_searchWrap)) {
            _searchWrap.SetHasClass("HasSearchText", true);
        }

        const shell = Q.ui?.window?.findShell?.();
        const contentHost = shell?.FindChildTraverse?.("SettingsList");
        if (contentHost && isAlive(contentHost)) {
            const results = runSearch(query);
            renderResults(results, contentHost);
        }
    };

    const bindHeader = (headerPanel) => {
        if (!headerPanel || !isAlive(headerPanel)) return;
        if (_searchWrap && isAlive(_searchWrap)) return; // already bound

        _searchWrap = createPanel("Panel", headerPanel, "SettingsSearchWrap");
        if (!_searchWrap) return;
        _searchWrap.AddClass("SettingsSearchWrap");

        const icon = createPanel("Image", _searchWrap, "SettingsSearchIcon", {
            src: "s2r://panorama/images/control_icons/24px/search.vsvg",
        });
        if (icon) icon.AddClass("SettingsSearchIcon");

        _searchInput = createPanel("TextEntry", _searchWrap, "SettingsSearchInput");
        if (_searchInput) {
            _searchInput.AddClass("SettingsSearchInput");
            _searchInput.SetPanelEvent("ontextentrychange", () => {
                if (_suppressChange) return;
                const raw = _searchInput?.text || "";
                search(raw);
            });
        }

        _searchClear = createPanel("Button", _searchWrap, "SettingsSearchClear");
        if (_searchClear) {
            _searchClear.AddClass("SettingsSearchClear");
            const clearIcon = createPanel("Image", _searchClear, "SettingsSearchClearIcon", {
                src: "s2r://panorama/images/control_icons/24px/x_close.vsvg",
            });
            if (clearIcon) clearIcon.AddClass("SettingsSearchClearIcon");
            _searchClear.SetPanelEvent("onactivate", () => clear());
        }
    };

    const isSearching = () => _searching;
    const getQuery = () => _currentQuery;

    Q.ui.search = {
        search,
        clear,
        isSearching,
        getQuery,
        bindHeader,
        matchSetting,
        matchManifest,
        runSearch,
    };
})();

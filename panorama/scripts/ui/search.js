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

    const isAlive = Q.core.panel.isAlive;

    const createPanel = Q.core.panel.create;

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
        clearSettingsSearchQuery();

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
        let centerHost = headerPanel.FindChildTraverse("SettingsHeaderCenterHost");
        if (!centerHost) {
            centerHost = createPanel("Panel", headerPanel, "SettingsHeaderCenterHost");
            const closeBtn = headerPanel.FindChildTraverse("CloseBtn");
            if (closeBtn && headerPanel.MoveChildBefore) {
                try { headerPanel.MoveChildBefore(centerHost, closeBtn); } catch (_) {}
            }
        }
        const parent = centerHost || headerPanel;
        const existingWrap = parent.FindChildTraverse("SettingsSearchWrap");
        if (existingWrap && isAlive(existingWrap)) {
            _searchWrap = existingWrap;
            _searchInput = existingWrap.FindChildTraverse("SettingsSearchInput");
            _searchClear = existingWrap.FindChildTraverse("SettingsSearchClear");
            return;
        }

        if (_searchWrap && isAlive(_searchWrap)) return; // already bound

        _searchWrap = createPanel("Panel", parent, "SettingsSearchWrap");
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

    // =========================================================================
    // Tab-based Search Index & Rendering (Cross-Tab Legacy/Transitional Indexer)
    // =========================================================================

    let _searchSectionIndexCache = null;
    let _searchSectionIndexCacheKey = "";
    let _searchRenderDebounceToken = 0;
    const SEARCH_RENDER_DEBOUNCE_SEC = 0.12;

    const normalizeSearchText = (value) => {
        if (value === undefined || value === null) return "";
        return String(value).toLowerCase();
    };

    const getActiveSearchCollectSection = () => {
        const state = (typeof gSearchCollectState !== "undefined" && gSearchCollectState)
            ? gSearchCollectState
            : (globalThis.gSearchCollectState || null);
        if (!state) return null;
        if (!state.currentSection) {
            const fallbackSection = { title: "", rows: [] };
            state.sections.push(fallbackSection);
            state.currentSection = fallbackSection;
        }
        return state.currentSection;
    };

    const buildSearchAliasList = (label, configId, description, extraLabels) => {
        const aliases = [];
        const seen = Object.create(null);
        const pushAlias = (value) => {
            const normalized = normalizeSearchText(value).trim();
            if (!normalized || seen[normalized]) return;
            seen[normalized] = true;
            aliases.push(normalized);
        };

        pushAlias(label);
        pushAlias(configId);
        pushAlias(description);

        if (Array.isArray(extraLabels)) {
            for (let i = 0; i < extraLabels.length; i++) {
                pushAlias(extraLabels[i]);
            }
        }

        const configText = String(configId || "");
        if (configText) {
            const compactConfig = normalizeSearchText(configText).replace(/[^a-z0-9]+/g, "");
            pushAlias(compactConfig);
            const configTokens = configText.split(/[^A-Za-z0-9]+/);
            let acronym = "";
            for (let t = 0; t < configTokens.length; t++) {
                const token = String(configTokens[t] || "");
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
    };

    const buildSearchCollectedRow = (label, configId, type, min, max, step, options, subInfo, extraLabels) => {
        const activeSection = getActiveSearchCollectSection();
        const state = (typeof gSearchCollectState !== "undefined" && gSearchCollectState)
            ? gSearchCollectState
            : (globalThis.gSearchCollectState || null);
        return {
            label: label || "",
            configId: configId || "",
            type: type || "",
            min,
            max,
            step,
            options,
            subInfo: subInfo || "",
            tabTitle: state ? String(state.tab || "") : "",
            sectionTitle: activeSection ? String(activeSection.title || "") : "",
            aliases: buildSearchAliasList(label, configId, subInfo, extraLabels)
        };
    };

    const buildSearchSectionIndexCacheKey = () => {
        const langKey = (typeof GetSettingsLanguageKey === "function")
            ? GetSettingsLanguageKey()
            : ((typeof globalThis.GetSettingsLanguageKey === "function")
                ? globalThis.GetSettingsLanguageKey()
                : (Q.ui?.theme?.getLanguageKey ? Q.ui.theme.getLanguageKey() : "en"));
        return "lang=" + langKey;
    };

    const invalidateSearchSectionIndexCache = () => {
        _searchSectionIndexCacheKey = "";
        _searchSectionIndexCache = null;
        if (typeof gSearchSectionIndexCacheKey !== "undefined") gSearchSectionIndexCacheKey = "";
        if (typeof gSearchSectionIndexCache !== "undefined") gSearchSectionIndexCache = null;
        if (typeof globalThis.gSearchSectionIndexCacheKey !== "undefined") globalThis.gSearchSectionIndexCacheKey = "";
        if (typeof globalThis.gSearchSectionIndexCache !== "undefined") globalThis.gSearchSectionIndexCache = null;
        if (typeof globalThis.gConfigDiffLabelCacheKey !== "undefined") globalThis.gConfigDiffLabelCacheKey = "";
        if (typeof globalThis.gConfigDiffLabelMap !== "undefined") globalThis.gConfigDiffLabelMap = null;
    };

    const getCachedSearchSectionIndex = () => {
        const cacheKey = buildSearchSectionIndexCacheKey();
        if (_searchSectionIndexCache && _searchSectionIndexCacheKey === cacheKey) {
            return _searchSectionIndexCache;
        }
        const freshIndex = buildSearchSectionIndex();
        _searchSectionIndexCache = freshIndex;
        _searchSectionIndexCacheKey = cacheKey;
        if (typeof globalThis.gSearchSectionIndexCache !== "undefined") globalThis.gSearchSectionIndexCache = freshIndex;
        if (typeof globalThis.gSearchSectionIndexCacheKey !== "undefined") globalThis.gSearchSectionIndexCacheKey = cacheKey;
        return freshIndex;
    };

    const isSearchRowMatch = (row, q) => {
        return normalizeSearchText(row.label).indexOf(q) !== -1 ||
            normalizeSearchText(row.subInfo).indexOf(q) !== -1 ||
            normalizeSearchText(row.configId).indexOf(q) !== -1 ||
            normalizeSearchText(row.sectionTitle).indexOf(q) !== -1 ||
            normalizeSearchText(row.tabTitle).indexOf(q) !== -1 ||
            (Array.isArray(row.aliases) && row.aliases.join(" ").indexOf(q) !== -1);
    };

    const buildSearchSectionIndex = () => {
        const originalTab = (typeof currentTab !== "undefined") ? currentTab : (globalThis.currentTab || "Support");
        const index = [];
        const getTabOrder = (typeof GetSettingsTabOrder === "function")
            ? GetSettingsTabOrder
            : (globalThis.GetSettingsTabOrder || Q.ui?.tabs?.getTabOrder || (() => []));
        const localizeText = (typeof LocalizeSettingsText === "function")
            ? LocalizeSettingsText
            : (globalThis.LocalizeSettingsText || ((s) => s));
        const renderTabContent = (typeof RenderCurrentTabContent === "function")
            ? RenderCurrentTabContent
            : (globalThis.RenderCurrentTabContent || ((c) => { if (Q.ui?.window?.renderTab) Q.ui.window.renderTab(globalThis.currentTab, c); }));

        try {
            const searchTabs = getTabOrder();
            for (let i = 0; i < searchTabs.length; i++) {
                const tab = searchTabs[i];
                const tabLabel = localizeText(tab, true);
                const state = {
                    tab: tabLabel,
                    sections: [],
                    currentSection: null
                };

                if (typeof gSearchCollectMode !== "undefined") gSearchCollectMode = true;
                globalThis.gSearchCollectMode = true;
                if (typeof gSearchCollectState !== "undefined") gSearchCollectState = state;
                globalThis.gSearchCollectState = state;
                if (typeof currentTab !== "undefined") currentTab = tab;
                globalThis.currentTab = tab;
                try {
                    renderTabContent(null);
                } finally {
                    if (typeof gSearchCollectMode !== "undefined") gSearchCollectMode = false;
                    globalThis.gSearchCollectMode = false;
                    if (typeof gSearchCollectState !== "undefined") gSearchCollectState = null;
                    globalThis.gSearchCollectState = null;
                }

                const nonEmptySections = [];
                for (let s = 0; s < state.sections.length; s++) {
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
            if (typeof currentTab !== "undefined") currentTab = originalTab;
            globalThis.currentTab = originalTab;
            if (typeof gSearchCollectMode !== "undefined") gSearchCollectMode = false;
            globalThis.gSearchCollectMode = false;
            if (typeof gSearchCollectState !== "undefined") gSearchCollectState = null;
            globalThis.gSearchCollectState = null;
        }
    };

    const animateSearchResultPanel = (panel, order) => {
        if (!panel || !panel.IsValid || !panel.IsValid()) return;
        panel.AddClass("SearchAnimatedItem");
        const query = (typeof currentSearchQuery !== "undefined") ? currentSearchQuery : (globalThis.currentSearchQuery || "");
        if (String(query || "").trim().length > 0) {
            panel.AddClass("SearchAnimatedItemVisible");
            return;
        }
        const delay = 0.005 + (Math.min(order, 24) * 0.012);
        $.Schedule(delay, () => {
            if (panel.IsValid && panel.IsValid()) {
                panel.AddClass("SearchAnimatedItemVisible");
            }
        });
    };

    const renderSearchResults = (list, query) => {
        const q = normalizeSearchText(query).trim();
        if (q.length === 0) return false;

        const tabIndex = getCachedSearchSectionIndex();
        const matchedTabs = [];
        const localizeText = (typeof LocalizeSettingsText === "function")
            ? LocalizeSettingsText
            : (globalThis.LocalizeSettingsText || ((s) => s));

        for (let t = 0; t < tabIndex.length; t++) {
            const tabEntry = tabIndex[t];
            const includeWholeTab = normalizeSearchText(tabEntry.tab).indexOf(q) !== -1;
            const matchedSections = [];

            for (let s = 0; s < tabEntry.sections.length; s++) {
                const section = tabEntry.sections[s];
                const sectionTitleMatch = normalizeSearchText(section.title).indexOf(q) !== -1;
                const matchedRows = [];
                for (let r = 0; r < section.rows.length; r++) {
                    if (isSearchRowMatch(section.rows[r], q)) {
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

        let animOrder = 0;

        const title = $.CreatePanel("Label", list, "");
        title.AddClass("GroupHeader");
        title.text = localizeText("Search Results", true);
        animateSearchResultPanel(title, animOrder++);

        if (matchedTabs.length === 0) {
            const noResults = $.CreatePanel("Label", list, "");
            noResults.AddClass("SearchEmptyLabel");
            noResults.text = localizeText("No results found", true);
            animateSearchResultPanel(noResults, animOrder++);
            return true;
        }

        const createTitle = (typeof CreateSectionTitle === "function") ? CreateSectionTitle : globalThis.CreateSectionTitle;
        const createRow = (typeof CreateRow === "function") ? CreateRow : globalThis.CreateRow;
        const createSecondaryToggle = (typeof CreateInlineSecondaryCheckboxToggleRow === "function")
            ? CreateInlineSecondaryCheckboxToggleRow
            : globalThis.CreateInlineSecondaryCheckboxToggleRow;
        const createSep = (typeof CreateSeparator === "function") ? CreateSeparator : globalThis.CreateSeparator;

        for (let mt = 0; mt < matchedTabs.length; mt++) {
            const tabLabel = $.CreatePanel("Label", list, "");
            tabLabel.AddClass("SearchSectionLabel");
            tabLabel.text = matchedTabs[mt].tab;
            animateSearchResultPanel(tabLabel, animOrder++);

            for (let ms = 0; ms < matchedTabs[mt].sections.length; ms++) {
                const sectionEntry = matchedTabs[mt].sections[ms];
                if (sectionEntry.title && sectionEntry.title.length > 0 && createTitle) {
                    const sectionTitlePanel = createTitle(list, sectionEntry.title);
                    animateSearchResultPanel(sectionTitlePanel, animOrder++);
                }
                for (let mr = 0; mr < sectionEntry.rows.length; mr++) {
                    const row = sectionEntry.rows[mr];
                    let rowPanel = null;
                    let inlineSecondaryOption = null;
                    if (Array.isArray(row.options)) {
                        for (let optionIndex = 0; optionIndex < row.options.length; optionIndex++) {
                            const searchOption = row.options[optionIndex];
                            if (searchOption && searchOption.inlineSecondaryCheckbox) {
                                inlineSecondaryOption = searchOption;
                                break;
                            }
                        }
                    }
                    if (typeof gSearchResultRenderMode !== "undefined") gSearchResultRenderMode = true;
                    globalThis.gSearchResultRenderMode = true;
                    try {
                        if (row.type === "customize") {
                            rowPanel = Q.ui.customize?.createEntryAction(list, row.options?.[0]?.elementId);
                        } else if (inlineSecondaryOption && createSecondaryToggle) {
                            rowPanel = createSecondaryToggle(
                                list,
                                row.label,
                                row.configId,
                                inlineSecondaryOption.secondaryLabel || "",
                                inlineSecondaryOption.inlineSecondaryCheckbox,
                                row.subInfo,
                                inlineSecondaryOption.secondaryDescription || "",
                                inlineSecondaryOption.rowOptions || {}
                            );
                        } else if (createRow) {
                            rowPanel = createRow(list, row.label, row.configId, row.type, row.min, row.max, row.step, row.options, row.subInfo);
                        }
                    } finally {
                        if (typeof gSearchResultRenderMode !== "undefined") gSearchResultRenderMode = false;
                        globalThis.gSearchResultRenderMode = false;
                    }
                    animateSearchResultPanel(rowPanel, animOrder++);
                }
                if (ms < matchedTabs[mt].sections.length - 1 && createSep) {
                    const sectionSep = createSep(list);
                    animateSearchResultPanel(sectionSep, animOrder++);
                }
            }
            if (mt < matchedTabs.length - 1 && createSep) {
                const tabSep = createSep(list);
                animateSearchResultPanel(tabSep, animOrder++);
            }
        }
        return true;
    };

    const isSettingsSearchActiveQuery = () => {
        const q = (typeof currentSearchQuery !== "undefined") ? currentSearchQuery : (globalThis.currentSearchQuery || "");
        return String(q || "").trim().length > 0;
    };

    const runSettingsSearchRenderNow = () => {
        const getList = (typeof GetSettingsListPanel === "function") ? GetSettingsListPanel : globalThis.GetSettingsListPanel;
        const updateContent = (typeof UpdateListContent === "function") ? UpdateListContent : globalThis.UpdateListContent;
        const liveList = getList ? getList() : null;
        if (liveList && updateContent) updateContent(liveList, true);
    };

    const scheduleSettingsSearchRender = () => {
        const token = ++_searchRenderDebounceToken;
        $.Schedule(SEARCH_RENDER_DEBOUNCE_SEC, () => {
            if (_searchRenderDebounceToken !== token) return;
            _searchRenderDebounceToken = 0;
            runSettingsSearchRenderNow();
        });
    };

    const cancelSettingsSearchRender = () => {
        _searchRenderDebounceToken++;
    };

    const flushSettingsSearchRender = () => {
        _searchRenderDebounceToken++;
        runSettingsSearchRenderNow();
    };

    const renderSettingsSearchResultsOnly = (list) => {
        if (!list || !list.IsValid || !list.IsValid()) return false;
        const ensureHosts = (typeof EnsureSettingsListHosts === "function") ? EnsureSettingsListHosts : globalThis.EnsureSettingsListHosts;
        const hosts = ensureHosts ? ensureHosts(list) : null;
        if (!hosts || !hosts.searchHost || !hosts.searchHost.IsValid || !hosts.searchHost.IsValid()) return false;
        if (Q.preview?.hideAll) Q.preview.hideAll();
        if (typeof SetActiveSettingsListRenderSignature === "function") SetActiveSettingsListRenderSignature("__search__");
        else if (typeof globalThis.SetActiveSettingsListRenderSignature === "function") globalThis.SetActiveSettingsListRenderSignature("__search__");
        if (typeof ResetSettingsListRowSyncRegistry === "function") ResetSettingsListRowSyncRegistry();
        else if (typeof globalThis.ResetSettingsListRowSyncRegistry === "function") globalThis.ResetSettingsListRowSyncRegistry();
        if (typeof ShowSettingsListTabPanel === "function") ShowSettingsListTabPanel(list, "");
        else if (typeof globalThis.ShowSettingsListTabPanel === "function") globalThis.ShowSettingsListTabPanel(list, "");
        hosts.searchHost.SetHasClass("Hidden", false);
        hosts.searchHost.RemoveAndDeleteChildren();
        const query = (typeof currentSearchQuery !== "undefined") ? currentSearchQuery : (globalThis.currentSearchQuery || "");
        const rendered = renderSearchResults(hosts.searchHost, query);
        if (typeof gSettingsListSearchModeActive !== "undefined") gSettingsListSearchModeActive = (rendered === true);
        globalThis.gSettingsListSearchModeActive = (rendered === true);
        if (typeof UpdatePresetHighlightPollingState === "function") UpdatePresetHighlightPollingState();
        else if (typeof globalThis.UpdatePresetHighlightPollingState === "function") globalThis.UpdatePresetHighlightPollingState();
        return rendered === true;
    };

    const resolveWindowOrRoot = (panel) => {
        if (panel && panel.id === "SettingsWindow") return panel;
        if (panel && panel.FindChildTraverse && panel.FindChildTraverse("SettingsSearchInput")) return panel;
        const shell = Q.ui?.window?.findShell?.();
        if (shell && isAlive(shell)) return shell;
        let root = panel || (typeof $.GetContextPanel === "function" ? $.GetContextPanel() : null);
        while (root && root.GetParent && isAlive(root.GetParent())) {
            root = root.GetParent();
        }
        return (root?.FindChildTraverse ? root.FindChildTraverse("SettingsWindow") : null) || root;
    };

    const updateSettingsSearchUiState = (rootPanel) => {
        const root = resolveWindowOrRoot(rootPanel);
        if (!root || !root.FindChildTraverse) return;
        const searchWrap = root.FindChildTraverse("SettingsSearchWrap");
        const searchInput = root.FindChildTraverse("SettingsSearchInput");
        let hasText = false;
        if (searchInput && isAlive(searchInput)) {
            hasText = String(searchInput.text || "").length > 0;
        }
        if (searchWrap && isAlive(searchWrap)) {
            searchWrap.SetHasClass("HasSearchText", hasText);
        }
    };

    const clearSettingsSearchQuery = (rootPanel) => {
        _currentQuery = "";
        _searching = false;
        if (typeof currentSearchQuery !== "undefined") currentSearchQuery = "";
        globalThis.currentSearchQuery = "";
        cancelSettingsSearchRender();

        const root = resolveWindowOrRoot(rootPanel);
        const searchInput = root ? root.FindChildTraverse("SettingsSearchInput") : null;
        if (searchInput && isAlive(searchInput)) {
            _suppressChange = true;
            try {
                if ((searchInput.text || "") !== "") {
                    searchInput.text = "";
                }
                if (searchInput.ClearSelection) {
                    searchInput.ClearSelection();
                }
            } catch (_) {}
            _suppressChange = false;
        }
        updateSettingsSearchUiState(root);
    };

    const searchApi = {
        search,
        clear,
        isSearching,
        getQuery,
        bindHeader,
        matchSetting,
        matchManifest,
        runSearch,
        renderResults,
        normalizeSearchText,
        getActiveSearchCollectSection,
        buildSearchAliasList,
        buildSearchCollectedRow,
        buildSearchSectionIndexCacheKey,
        invalidateSearchSectionIndexCache,
        getCachedSearchSectionIndex,
        isSearchRowMatch,
        buildSearchSectionIndex,
        animateSearchResultPanel,
        renderSearchResults,
        isSettingsSearchActiveQuery,
        runSettingsSearchRenderNow,
        scheduleSettingsSearchRender,
        cancelSettingsSearchRender,
        flushSettingsSearchRender,
        renderSettingsSearchResultsOnly,
        updateSettingsSearchUiState,
        clearSettingsSearchQuery
    };

    Q.ui.search = searchApi;

    if (typeof globalThis !== "undefined") {
        globalThis.NormalizeSearchText = normalizeSearchText;
        globalThis.GetActiveSearchCollectSection = getActiveSearchCollectSection;
        globalThis.BuildSearchAliasList = buildSearchAliasList;
        globalThis.BuildSearchCollectedRow = buildSearchCollectedRow;
        globalThis.BuildSearchSectionIndexCacheKey = buildSearchSectionIndexCacheKey;
        globalThis.InvalidateSearchSectionIndexCache = invalidateSearchSectionIndexCache;
        globalThis.GetCachedSearchSectionIndex = getCachedSearchSectionIndex;
        globalThis.IsSearchRowMatch = isSearchRowMatch;
        globalThis.BuildSearchSectionIndex = buildSearchSectionIndex;
        globalThis.AnimateSearchResultPanel = animateSearchResultPanel;
        globalThis.RenderSearchResults = renderSearchResults;
        globalThis.IsSettingsSearchActiveQuery = isSettingsSearchActiveQuery;
        globalThis.RunSettingsSearchRenderNow = runSettingsSearchRenderNow;
        globalThis.ScheduleSettingsSearchRender = scheduleSettingsSearchRender;
        globalThis.CancelSettingsSearchRender = cancelSettingsSearchRender;
        globalThis.FlushSettingsSearchRender = flushSettingsSearchRender;
        globalThis.RenderSettingsSearchResultsOnly = renderSettingsSearchResultsOnly;
        globalThis.UpdateSettingsSearchUiState = updateSettingsSearchUiState;
        globalThis.ClearSettingsSearchQuery = clearSettingsSearchQuery;
    }
})();

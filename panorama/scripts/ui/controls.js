// =============================================================================
// QOLLOCK — ui/controls.js
// =============================================================================
// OWNS:        Settings control building subsystem:
//              Slider shapes & slider row creation,
//              Section titles & animated collapsible/enum sections,
//              Reset button creation and config change tracking,
//              Procedural row construction (CreateRow, CreateInlineSecondaryCheckboxToggleRow).
// DOES NOT OWN: Tab layouts (ui/layout.js), Declarative renderer (ui/renderer.js),
//               Window shell (ui/window.js), Config persistence (core/ql_persistence.js).
// DEPENDS ON:  core/ql_namespace.js, core/ql_config.js, ui/theme.js, ui/ql_settings_metadata.js
// USED BY:     hud_escape_menu.xml, ui/window.js, ui/gameplay_tabs.js, ql_settings.js
// =============================================================================

(() => {
    "use strict";

    const Q = (typeof globalThis !== "undefined" && globalThis.QOL)
        ? globalThis.QOL
        : (typeof QOL !== "undefined" ? QOL : (globalThis.QOL = {}));
    Q.ui = Q.ui || {};

    // -------------------------------------------------------------------------
    // Shared Attributes & Constants
    // -------------------------------------------------------------------------
    const SETTING_ROW_RESET_KEYS_ATTR = "QOL_ROW_RESET_KEYS";
    const RUNTIME_ROW_KIND_ATTR = "QOL_RUNTIME_ROW_KIND";
    const RUNTIME_ROW_KEY_ATTR = "QOL_RUNTIME_ROW_KEY";
    const HERO_HINT_ATTR = "QOL_HERO_HINT";
    const PERF_IMPACT_TIER_NONE = "none";

    const RUNTIME_BUTTON_GROUP_DEFAULT_INDEX = {
        HITMARKERS_RUNTIME: 1,
        AUDIO_BEEP_TEST_RUNTIME: 1
    };

    // -------------------------------------------------------------------------
    // Slider Shapes Registry
    // -------------------------------------------------------------------------
    const SLIDER_SHAPES = {
        opacity:            { min: 0,   max: 1,    step: 0.05 },
        opacity_perf:       { min: 0.3, max: 1,    step: 0.05 },
        scale_0_5_1_5:      { min: 0.5, max: 1.5,  step: 0.05 },
        scale_0_5_2_0:      { min: 0.5, max: 2.0,  step: 0.05 },
        size_10_60:         { min: 10,  max: 60,   step: 1 },
        size_16_60:         { min: 16,  max: 60,   step: 1 },
        size_30_60:         { min: 30,  max: 60,   step: 1 },
        size_50_200:        { min: 50,  max: 200,  step: 1 },
        size_70_150:        { min: 70,  max: 150,  step: 1 },
        size_100_300:       { min: 100, max: 300,  step: 1 },
        size_50_200_s5:     { min: 50,  max: 200,  step: 5 },
        size_50_300_s5:     { min: 50,  max: 300,  step: 5 },
        size_200_1000_s5:   { min: 200, max: 1000, step: 5 },
        size_400_1200_s10:  { min: 400, max: 1200, step: 10 },
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
        count_1_5:          { min: 1,   max: 5,    step: 1 },
        sec_0_60:           { min: 0,   max: 60,   step: 1 },
        sec_3_15:           { min: 3,   max: 15,   step: 1 },
        sec_5_60:           { min: 5,   max: 60,   step: 1 },
        volume_0_100:       { min: 0,   max: 100,  step: 1 },
        angle_0_360:        { min: 0,   max: 360,  step: 1 },
        alert_ms_1_50:      { min: 1,   max: 50,   step: 1 }
    };

    // -------------------------------------------------------------------------
    // Option Metadata Tables
    // -------------------------------------------------------------------------
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

    // -------------------------------------------------------------------------
    // Safe Environment Resolvers
    // -------------------------------------------------------------------------
    const getConfig = () => (typeof MOD_CONFIG !== "undefined"
        ? MOD_CONFIG
        : (typeof globalThis.MOD_CONFIG !== "undefined"
            ? globalThis.MOD_CONFIG
            : (typeof Q.getSettingsConfig === "function" ? Q.getSettingsConfig() : (globalThis.MOD_CONFIG = {}))));

    const getDefaultConfig = () => (typeof DEFAULT_CONFIG !== "undefined"
        ? DEFAULT_CONFIG
        : (typeof globalThis.DEFAULT_CONFIG !== "undefined"
            ? globalThis.DEFAULT_CONFIG
            : (typeof QOL_DEFAULT_CONFIG !== "undefined" ? QOL_DEFAULT_CONFIG : (globalThis.QOL_DEFAULT_CONFIG || {}))));

    const saveAndSync = () => {
        if (typeof SaveAndSync === "function") SaveAndSync();
        else if (typeof globalThis.SaveAndSync === "function") globalThis.SaveAndSync();
    };

    const markConfigDirty = () => {
        if (typeof MarkConfigDirty === "function") MarkConfigDirty();
        else if (typeof globalThis.MarkConfigDirty === "function") globalThis.MarkConfigDirty();
    };

    const localize = Q.ui.renderer.localize;

    const setConfigFeedbackMessage = (msg, tone, holdMs) => {
        if (typeof SetConfigFeedbackMessage === "function") SetConfigFeedbackMessage(msg, tone, holdMs);
        else if (typeof globalThis.SetConfigFeedbackMessage === "function") globalThis.SetConfigFeedbackMessage(msg, tone, holdMs);
    };

    const setLocalizedConfigFeedbackMessage = (msg, tone, holdMs) => {
        if (typeof SetLocalizedConfigFeedbackMessage === "function") SetLocalizedConfigFeedbackMessage(msg, tone, holdMs);
        else if (typeof globalThis.SetLocalizedConfigFeedbackMessage === "function") globalThis.SetLocalizedConfigFeedbackMessage(msg, tone, holdMs);
    };

    const requestSettingsListRefresh = (delay, force) => {
        if (typeof RequestSettingsListRefresh === "function") RequestSettingsListRefresh(delay, force);
        else if (typeof globalThis.RequestSettingsListRefresh === "function") globalThis.RequestSettingsListRefresh(delay, force);
    };

    const requestSettingsListSoftRefresh = (delay) => {
        if (typeof RequestSettingsListSoftRefresh === "function") RequestSettingsListSoftRefresh(delay);
        else if (typeof globalThis.RequestSettingsListSoftRefresh === "function") globalThis.RequestSettingsListSoftRefresh(delay);
    };

    const registerSettingsListRowSync = (fn) => {
        if (typeof RegisterSettingsListRowSync === "function") RegisterSettingsListRowSync(fn);
        else if (typeof globalThis.RegisterSettingsListRowSync === "function") globalThis.RegisterSettingsListRowSync(fn);
    };

    const runConsoleCommandBestEffort = (cmd) => {
        if (typeof RunConsoleCommandBestEffort === "function") return RunConsoleCommandBestEffort(cmd);
        if (typeof globalThis.RunConsoleCommandBestEffort === "function") return globalThis.RunConsoleCommandBestEffort(cmd);
        if (cmd) {
            try { $.DispatchEvent("CitadelConCommand", cmd); return true; } catch (e) { return false; }
        }
        return false;
    };

    const resolveAnnouncerEventForVolume = (evt) => {
        if (typeof ResolveAnnouncerEventForVolume === "function") return ResolveAnnouncerEventForVolume(evt);
        if (typeof globalThis.ResolveAnnouncerEventForVolume === "function") return globalThis.ResolveAnnouncerEventForVolume(evt);
        return String(evt || "");
    };

    const playAnnouncerPreviewSound = () => {
        if (typeof PlayAnnouncerPreviewSound === "function") PlayAnnouncerPreviewSound();
        else if (typeof globalThis.PlayAnnouncerPreviewSound === "function") globalThis.PlayAnnouncerPreviewSound();
    };

    const playAnnouncerBridgeVariantPreviewSound = (v) => {
        if (typeof PlayAnnouncerBridgeVariantPreviewSound === "function") PlayAnnouncerBridgeVariantPreviewSound(v);
        else if (typeof globalThis.PlayAnnouncerBridgeVariantPreviewSound === "function") globalThis.PlayAnnouncerBridgeVariantPreviewSound(v);
    };

    const publishPaletteColorBridge = (id, val) => {
        if (typeof PublishPaletteColorBridge === "function") PublishPaletteColorBridge(id, val);
        else if (typeof globalThis.PublishPaletteColorBridge === "function") globalThis.PublishPaletteColorBridge(id, val);
    };

    const isRussianLanguage = Q.ui.renderer.isRussian;

    const findRootPanel = () => {
        if (typeof FindRootPanel === "function") return FindRootPanel();
        if (typeof globalThis.FindRootPanel === "function") return globalThis.FindRootPanel();
        let root = $.GetContextPanel();
        while (root && root.GetParent && root.GetParent()) root = root.GetParent();
        return root;
    };

    const warnLog = (cat, msg) => {
        if (typeof WarnLog === "function") WarnLog(cat, msg);
        else if (typeof globalThis.WarnLog === "function") globalThis.WarnLog(cat, msg);
        else $.Msg(`[QOLLock][WARN][${cat}] ${msg}`);
    };

    const getTooltip = () => (Q && Q.tooltip) ? Q.tooltip : {
        getSettingDescriptionOverride: (_c, _l, d) => d,
        getCurrentCategoryKey: () => "",
        buildPerfImpactLine: () => null,
        getSettingCreatedBy: () => "",
        hasMeaningfulContent: () => false,
        maxPerfTier: (a) => a,
        buildPerfLineForTier: () => "",
        hideTextTooltip: () => {},
        cancelHide: () => {},
        showRowTooltip: () => {},
        hideTooltipDeferred: () => {},
        bindSectionPerfTooltip: () => {}
    };

    const getPreview = () => (Q && Q.preview) ? Q.preview : {
        showForConfigId: () => {},
        hideAll: () => {}
    };

    const getArcade = () => (Q && Q.arcade) ? Q.arcade : {
        openMinesweeper: () => {},
        openFlappy: () => {},
        openAimTrainer: () => {},
        openTrainTracking: () => {},
        openWhackRem: () => {},
        openBlackjack: () => {}
    };

    const getCurrentTab = () => (typeof currentTab !== "undefined" ? currentTab : (typeof globalThis.currentTab !== "undefined" ? globalThis.currentTab : ""));

    const getSearchCollectMode = () => (typeof gSearchCollectMode !== "undefined" ? gSearchCollectMode : (typeof globalThis.gSearchCollectMode !== "undefined" ? globalThis.gSearchCollectMode : false));
    const getSearchCollectState = () => (typeof gSearchCollectState !== "undefined" ? gSearchCollectState : (typeof globalThis.gSearchCollectState !== "undefined" ? globalThis.gSearchCollectState : null));
    const getSearchResultRenderMode = () => (typeof gSearchResultRenderMode !== "undefined" ? gSearchResultRenderMode : (typeof globalThis.gSearchResultRenderMode !== "undefined" ? globalThis.gSearchResultRenderMode : false));

    function getActiveSearchCollectSection() {
        const state = getSearchCollectState();
        if (!state) return null;
        if (!state.currentSection) {
            const fallbackSection = {
                title: "",
                rows: []
            };
            state.sections.push(fallbackSection);
            state.currentSection = fallbackSection;
        }
        return state.currentSection;
    }

    const buildSearchCollectedRow = (label, configId, type, min, max, step, options, description, extraLabels) => {
        if (typeof BuildSearchCollectedRow === "function") {
            return BuildSearchCollectedRow(label, configId, type, min, max, step, options, description, extraLabels);
        }
        if (typeof globalThis.BuildSearchCollectedRow === "function") {
            return globalThis.BuildSearchCollectedRow(label, configId, type, min, max, step, options, description, extraLabels);
        }
        return { label, configId, type, min, max, step, options, description, extraLabels };
    };

    const getRuntimeToggleState = () => (typeof gRuntimeToggleState !== "undefined"
        ? gRuntimeToggleState
        : (globalThis.gRuntimeToggleState = globalThis.gRuntimeToggleState || {}));

    const getRuntimeSliderState = () => (typeof gRuntimeSliderState !== "undefined"
        ? gRuntimeSliderState
        : (globalThis.gRuntimeSliderState = globalThis.gRuntimeSliderState || {}));

    const getRuntimeButtonGroupConfig = () => (typeof gRuntimeButtonGroupConfig !== "undefined"
        ? gRuntimeButtonGroupConfig
        : (globalThis.gRuntimeButtonGroupConfig = globalThis.gRuntimeButtonGroupConfig || {}));

    const getRuntimeButtonGroupRefreshers = () => (typeof gRuntimeButtonGroupRefreshers !== "undefined"
        ? gRuntimeButtonGroupRefreshers
        : (globalThis.gRuntimeButtonGroupRefreshers = globalThis.gRuntimeButtonGroupRefreshers || {}));

    const getRuntimeSliderResetters = () => (typeof gRuntimeSliderResetters !== "undefined"
        ? gRuntimeSliderResetters
        : (globalThis.gRuntimeSliderResetters = globalThis.gRuntimeSliderResetters || {}));

    const getEnumSectionSyncCallbacks = () => (typeof gEnumSectionSyncCallbacks !== "undefined"
        ? gEnumSectionSyncCallbacks
        : (globalThis.gEnumSectionSyncCallbacks = globalThis.gEnumSectionSyncCallbacks || []));

    const getArcadeOnDeathSyncFns = () => (typeof gArcadeOnDeathSyncFns !== "undefined"
        ? gArcadeOnDeathSyncFns
        : (globalThis.gArcadeOnDeathSyncFns = globalThis.gArcadeOnDeathSyncFns || []));

    // -------------------------------------------------------------------------
    // Value Normalization & Config Comparison
    // -------------------------------------------------------------------------
    function normalizeComparableConfigValue(value) {
        if (value === undefined || value === null) return "";
        if (typeof value === "boolean") return value ? "1" : "0";
        if (typeof value === "number") {
            if (!isFinite(value)) return "";
            return String(Math.round(value * 10000) / 10000);
        }
        return String(value);
    }

    function isConfigKeyChangedFromDefault(key) {
        if (!key) return false;
        const modCfg = getConfig();
        const defCfg = getDefaultConfig();
        if (!modCfg || !Object.prototype.hasOwnProperty.call(modCfg, key)) return false;
        if (!defCfg || !Object.prototype.hasOwnProperty.call(defCfg, key)) return false;
        return normalizeComparableConfigValue(modCfg[key]) !== normalizeComparableConfigValue(defCfg[key]);
    }

    function hasAnyChangedConfigKeys(keys) {
        if (!Array.isArray(keys) || keys.length <= 0) return false;
        for (let i = 0; i < keys.length; i++) {
            if (isConfigKeyChangedFromDefault(keys[i])) return true;
        }
        return false;
    }

    function getRowResetKeys(rowPanel) {
        if (!rowPanel || !rowPanel.GetAttributeString) return [];
        let raw = "";
        try { raw = rowPanel.GetAttributeString(SETTING_ROW_RESET_KEYS_ATTR, ""); } catch (e0) { raw = ""; }
        if (!raw || raw.length === 0) return [];
        const parts = String(raw).split(",");
        const keys = [];
        const seen = {};
        for (let i = 0; i < parts.length; i++) {
            const key = String(parts[i] || "").trim();
            if (!key || seen[key]) continue;
            seen[key] = true;
            keys.push(key);
        }
        return keys;
    }

    function applyResetForConfigKeys(keys) {
        if (!Array.isArray(keys) || keys.length <= 0) return 0;
        const modCfg = getConfig();
        const defCfg = getDefaultConfig();
        let changed = 0;
        for (let i = 0; i < keys.length; i++) {
            const key = String(keys[i] || "");
            if (!key || !Object.prototype.hasOwnProperty.call(modCfg, key) || !Object.prototype.hasOwnProperty.call(defCfg, key)) continue;
            if (normalizeComparableConfigValue(modCfg[key]) === normalizeComparableConfigValue(defCfg[key])) continue;
            modCfg[key] = defCfg[key];
            changed++;
        }
        return changed;
    }

    function collectResetKeysFromPanel(panel, outKeys, seen) {
        if (!panel || !outKeys || !seen) return;
        try {
            if (panel.BHasClass && panel.BHasClass("SettingRow")) {
                const rowKeys = getRowResetKeys(panel);
                for (let i = 0; i < rowKeys.length; i++) {
                    const key = rowKeys[i];
                    if (!key || seen[key]) continue;
                    seen[key] = true;
                    outKeys.push(key);
                }
            }
        } catch (e0) {
            warnLog("settings", "collectResetKeysFromPanel failed: " + (e0 && e0.message ? e0.message : String(e0 || "")));
        }

        let children = [];
        try { children = panel.Children ? panel.Children() : []; } catch (e1) { children = []; }
        for (let c = 0; c < children.length; c++) {
            collectResetKeysFromPanel(children[c], outKeys, seen);
        }
    }

    function collectResetKeysFromSectionTitleRow(titleRow) {
        const keys = [];
        const seen = {};
        if (!titleRow || !titleRow.GetParent) return keys;
        const parent = titleRow.GetParent();
        if (!parent || !parent.Children) return keys;

        let siblings = [];
        try { siblings = parent.Children() || []; } catch (e0) { siblings = []; }
        let startIndex = -1;
        for (let i = 0; i < siblings.length; i++) {
            if (siblings[i] === titleRow) {
                startIndex = i;
                break;
            }
        }
        if (startIndex < 0) return keys;

        for (let s = startIndex + 1; s < siblings.length; s++) {
            const sibling = siblings[s];
            if (!sibling || !sibling.IsValid || !sibling.IsValid()) continue;
            let isBoundary = false;
            try {
                if ((sibling.BHasClass && sibling.BHasClass("SectionTitleRow")) ||
                    (sibling.BHasClass && sibling.BHasClass("SectionTitle")) ||
                    (sibling.BHasClass && sibling.BHasClass("RowSeparator"))) {
                    isBoundary = true;
                }
            } catch (e1) { warnLog("settings", "op failed: " + (e1 && e1.message ? e1.message : String(e1 || ""))); }
            if (isBoundary) break;
            collectResetKeysFromPanel(sibling, keys, seen);
        }
        return keys;
    }

    function bindRowChangedState(row, labelContainer, configKeys, resetBtn) {
        if (!row || !row.IsValid || !row.IsValid()) return () => {};
        if (!labelContainer || !labelContainer.IsValid || !labelContainer.IsValid()) return () => {};
        if (!Array.isArray(configKeys) || configKeys.length <= 0) return () => {};

        const badge = $.CreatePanel("Panel", labelContainer, "");
        badge.AddClass("SettingChangedBadge");

        const refresh = () => {
            if (!row || !row.IsValid || !row.IsValid()) return;
            let changed = false;
            for (let i = 0; i < configKeys.length; i++) {
                if (isConfigKeyChangedFromDefault(configKeys[i])) {
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

    function collectRowConfigKeys(configId, type, options) {
        const keys = [];
        const modCfg = getConfig();
        const defCfg = getDefaultConfig();
        if (type === "multitoggle" && Array.isArray(options)) {
            for (let i = 0; i < options.length; i++) {
                const opt = options[i];
                if (!opt || !opt.key) continue;
                if (!Object.prototype.hasOwnProperty.call(modCfg, opt.key) || !Object.prototype.hasOwnProperty.call(defCfg, opt.key)) continue;
                keys.push(String(opt.key));
            }
            return keys;
        }
        if (!configId || typeof configId !== "string") return keys;
        if (!Object.prototype.hasOwnProperty.call(modCfg, configId) || !Object.prototype.hasOwnProperty.call(defCfg, configId)) return keys;
        keys.push(configId);
        return keys;
    }

    function optionsMatchExpectedKeys(options, expectedOptions) {
        if (!Array.isArray(options) || !Array.isArray(expectedOptions)) return false;
        if (options.length !== expectedOptions.length) return false;
        const expected = {};
        for (let i = 0; i < expectedOptions.length; i++) {
            const key = expectedOptions[i] && expectedOptions[i].key ? String(expectedOptions[i].key) : "";
            if (!key) continue;
            expected[key] = true;
        }
        let matched = 0;
        for (let j = 0; j < options.length; j++) {
            const optKey = options[j] && options[j].key ? String(options[j].key) : "";
            if (optKey && expected[optKey]) matched += 1;
        }
        return matched === expectedOptions.length;
    }

    const isNeutralCampTypeFilterOptions = (options) => optionsMatchExpectedKeys(options, NEUTRAL_CAMP_TIER_OPTIONS);
    const isColorWarningThresholdOptions = (options) => optionsMatchExpectedKeys(options, COLOR_WARNING_THRESHOLD_OPTIONS);
    const isEnemyColorWarningThresholdOptions = (options) => optionsMatchExpectedKeys(options, TOPBAR_ENEMY_HP_WARNING_THRESHOLD_OPTIONS);
    const isAllyColorWarningThresholdOptions = (options) => optionsMatchExpectedKeys(options, TOPBAR_ALLY_HP_WARNING_THRESHOLD_OPTIONS);
    const isBridgeBuffFilterOptions = (options) => optionsMatchExpectedKeys(options, BRIDGE_BUFF_FILTER_OPTIONS);
    const isRecentPurchaseRepositionOptions = (options) => optionsMatchExpectedKeys(options, RECENT_PURCHASE_REPOSITION_OPTIONS);

    // -------------------------------------------------------------------------
    // Reset Buttons & Runtime Row Management
    // -------------------------------------------------------------------------
    function createSectionResetButton(titleRow, resolveKeysFn, includeEnableKey, parentPanel) {
        if (!titleRow || !titleRow.IsValid || !titleRow.IsValid()) return null;
        if (typeof resolveKeysFn !== "function") return null;

        let resetParent = titleRow;
        if (parentPanel && parentPanel.IsValid && parentPanel.IsValid()) {
            resetParent = parentPanel;
        }

        const resetBtn = $.CreatePanel("Button", resetParent, "");
        resetBtn.AddClass("SectionTitleActionBtn");
        resetBtn.AddClass("SectionResetBtn");
        const resetIcon = $.CreatePanel("Image", resetBtn, "", {
            src: "s2r://panorama/images/icons/icon_refresh.vsvg",
            defaultsrc: "",
            scaling: "contain"
        });
        resetIcon.AddClass("SectionTitleActionIcon");
        resetIcon.AddClass("SettingRowResetIcon");
        resetIcon.AddClass("QOLResetIcon");
        try { resetIcon.SetImage("s2r://panorama/images/icons/icon_refresh.vsvg"); } catch (eIcon) {
            warnLog("settings", "op failed: " + (eIcon && eIcon.message ? eIcon.message : String(eIcon || "")));
        }

        const buildResetKeys = () => {
            const keys = resolveKeysFn() || [];
            const seen = {};
            const merged = [];
            const modCfg = getConfig();
            const defCfg = getDefaultConfig();
            for (let i = 0; i < keys.length; i++) {
                const k = String(keys[i] || "");
                if (!k || seen[k]) continue;
                if (!Object.prototype.hasOwnProperty.call(modCfg, k) || !Object.prototype.hasOwnProperty.call(defCfg, k)) continue;
                seen[k] = true;
                merged.push(k);
            }
            if (includeEnableKey) {
                const ek = String(includeEnableKey || "");
                if (ek && !seen[ek] && Object.prototype.hasOwnProperty.call(modCfg, ek) && Object.prototype.hasOwnProperty.call(defCfg, ek)) {
                    merged.push(ek);
                }
            }
            return merged;
        };

        const refreshBtnState = () => {
            if (!resetBtn || !resetBtn.IsValid || !resetBtn.IsValid()) return;
            const keys = buildResetKeys();
            const hasKeys = keys.length > 0;
            const hasChanges = hasKeys && hasAnyChangedConfigKeys(keys);
            resetBtn.SetHasClass("Hidden", !hasKeys);
            resetBtn.SetHasClass("HasChanges", hasChanges);
        };

        resetBtn.SetPanelEvent("onmouseover", () => {
            getTooltip().hideTextTooltip();
            getTooltip().cancelHide();
            getTooltip().showRowTooltip(
                resetBtn,
                "",
                localize("Reset section to defaults", true),
                PERF_IMPACT_TIER_NONE,
                ""
            );
        });
        resetBtn.SetPanelEvent("onmouseout", () => {
            getTooltip().hideTextTooltip();
            getTooltip().hideTooltipDeferred("section_reset_btn_mouseout");
        });
        resetBtn.SetPanelEvent("onactivate", () => {
            const keys = buildResetKeys();
            const changed = applyResetForConfigKeys(keys);
            if (changed > 0) {
                saveAndSync();
                setConfigFeedbackMessage(isRussianLanguage()
                    ? ("\u0421\u0431\u0440\u043E\u0448\u0435\u043D\u043E \u043D\u0430\u0441\u0442\u0440\u043E\u0435\u043A: " + String(changed))
                    : ("Section reset (" + String(changed) + " changed)."), "success", 1800);
                requestSettingsListSoftRefresh(0);
            } else {
                setConfigFeedbackMessage(isRussianLanguage()
                    ? "\u0421\u0435\u043A\u0446\u0438\u044F \u0443\u0436\u0435 \u043F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E."
                    : "Section already at defaults.", "info", 1400);
            }
        });

        refreshBtnState();
        $.Schedule(0.0, refreshBtnState);
        registerSettingsListRowSync(() => {
            if (!resetBtn || !resetBtn.IsValid || !resetBtn.IsValid()) return false;
            refreshBtnState();
            return true;
        });
        return resetBtn;
    }

    function getRuntimeButtonGroupDefaultIndex(runtimeGroupKey, explicitDefaultIndex) {
        const hasExplicitDefault = (explicitDefaultIndex !== undefined && explicitDefaultIndex !== null && String(explicitDefaultIndex) !== "");
        let nextDefault = Number(explicitDefaultIndex);
        if (hasExplicitDefault && isFinite(nextDefault)) {
            nextDefault = Math.max(0, Math.round(nextDefault));
            return nextDefault;
        }
        const key = String(runtimeGroupKey || "");
        if (Object.prototype.hasOwnProperty.call(RUNTIME_BUTTON_GROUP_DEFAULT_INDEX, key)) {
            return Math.max(0, Math.round(Number(RUNTIME_BUTTON_GROUP_DEFAULT_INDEX[key]) || 0));
        }
        return 0;
    }

    function applyRuntimeButtonGroupIndex(runtimeGroupKey, nextIndex, runCommand) {
        const key = String(runtimeGroupKey || "");
        if (!key) return false;
        const configMap = getRuntimeButtonGroupConfig();
        const toggleMap = getRuntimeToggleState();
        const refresherMap = getRuntimeButtonGroupRefreshers();
        const meta = configMap[key];
        if (!meta || !Array.isArray(meta.options) || meta.options.length <= 0) return false;

        let clamped = Math.round(Number(nextIndex));
        if (!isFinite(clamped)) clamped = 0;
        if (clamped < 0) clamped = 0;
        if (clamped >= meta.options.length) clamped = meta.options.length - 1;

        let previous = Math.round(Number(toggleMap[key]));
        if (!isFinite(previous)) previous = -1;
        const changed = previous !== clamped;
        toggleMap[key] = clamped;

        const refreshFn = refresherMap[key];
        if (typeof refreshFn === "function") {
            try { refreshFn(); } catch (e0) { warnLog("settings", "op failed: " + (e0 && e0.message ? e0.message : String(e0 || ""))); }
        }

        const shouldRunAction = !!runCommand && (changed || !!meta.alwaysRunAction);
        if (shouldRunAction) {
            const opt = meta.options[clamped] || null;
            const commandToRun = opt && opt.command ? String(opt.command) : "";
            if (commandToRun) {
                runConsoleCommandBestEffort(commandToRun);
            }
            let soundEventToPlay = opt && opt.soundEvent ? String(opt.soundEvent) : "";
            if (soundEventToPlay) {
                if (soundEventToPlay.indexOf("BuffReminder.") === 0) {
                    soundEventToPlay = resolveAnnouncerEventForVolume(soundEventToPlay);
                }
                try { $.DispatchEvent("PlaySoundEffect", soundEventToPlay); } catch (e0) {
                    warnLog("settings", "op failed: " + (e0 && e0.message ? e0.message : String(e0 || "")));
                }
            }
        }
        return changed;
    }

    function resetRuntimeButtonGroupToDefault(runtimeGroupKey, runCommand) {
        const key = String(runtimeGroupKey || "");
        const configMap = getRuntimeButtonGroupConfig();
        const meta = configMap[key];
        if (!meta || !Array.isArray(meta.options) || meta.options.length <= 0) return false;
        let defaultIndex = getRuntimeButtonGroupDefaultIndex(key, meta.defaultIndex);
        if (defaultIndex >= meta.options.length) defaultIndex = 0;
        return applyRuntimeButtonGroupIndex(key, defaultIndex, runCommand);
    }

    function resetRuntimeRowsInSectionFromTitleRow(titleRow) {
        let changed = 0;
        if (!titleRow || !titleRow.GetParent) return changed;
        const parent = titleRow.GetParent();
        if (!parent || !parent.Children) return changed;

        let siblings = [];
        try { siblings = parent.Children() || []; } catch (e0) { siblings = []; }
        let startIndex = -1;
        for (let i = 0; i < siblings.length; i++) {
            if (siblings[i] === titleRow) {
                startIndex = i;
                break;
            }
        }
        if (startIndex < 0) return changed;

        const sliderResetters = getRuntimeSliderResetters();
        const sliderState = getRuntimeSliderState();

        for (let s = startIndex + 1; s < siblings.length; s++) {
            const sibling = siblings[s];
            if (!sibling || !sibling.IsValid || !sibling.IsValid()) continue;
            let isBoundary = false;
            try {
                if ((sibling.BHasClass && sibling.BHasClass("SectionTitleRow")) ||
                    (sibling.BHasClass && sibling.BHasClass("SectionTitle")) ||
                    (sibling.BHasClass && sibling.BHasClass("RowSeparator"))) {
                    isBoundary = true;
                }
            } catch (e1) { warnLog("settings", "op failed: " + (e1 && e1.message ? e1.message : String(e1 || ""))); }
            if (isBoundary) break;
            try {
                if (!(sibling.BHasClass && sibling.BHasClass("SettingRow"))) continue;
            } catch (e2) {
                continue;
            }
            let runtimeKind = "";
            let runtimeKey = "";
            try {
                runtimeKind = sibling.GetAttributeString ? String(sibling.GetAttributeString(RUNTIME_ROW_KIND_ATTR, "") || "") : "";
                runtimeKey = sibling.GetAttributeString ? String(sibling.GetAttributeString(RUNTIME_ROW_KEY_ATTR, "") || "") : "";
            } catch (e3) {
                runtimeKind = "";
                runtimeKey = "";
            }
            if (!runtimeKey) continue;

            if (runtimeKind === "runtime_buttongroup") {
                if (resetRuntimeButtonGroupToDefault(runtimeKey, true)) changed++;
            } else if (runtimeKind === "runtime_slider") {
                const resetFn = sliderResetters[runtimeKey];
                if (typeof resetFn === "function") {
                    const before = Number(sliderState[runtimeKey]);
                    try { resetFn(); } catch (e4) { warnLog("settings", "op failed: " + (e4 && e4.message ? e4.message : String(e4 || ""))); }
                    const after = Number(sliderState[runtimeKey]);
                    if (!isFinite(before) || !isFinite(after) || Math.abs(before - after) > 0.000001) changed++;
                }
            }
        }
        return changed;
    }

    function createRuntimeSectionTitle(parent, title) {
        const localizedTitle = localize(title || "");
        if (typeof gCurrentSettingsSectionTitle !== "undefined") {
            gCurrentSettingsSectionTitle = String(title || "");
        } else {
            globalThis.gCurrentSettingsSectionTitle = String(title || "");
        }
        if (getSearchCollectMode() && getSearchCollectState()) {
            return createSectionTitle(parent, title);
        }

        const titleRow = $.CreatePanel("Panel", parent, "");
        titleRow.AddClass("SectionTitleRow");
        titleRow.AddClass("SectionTitleStaticRow");
        const titleHead = $.CreatePanel("Panel", titleRow, "");
        titleHead.AddClass("SectionTitleInlineHead");
        const titleLabel = $.CreatePanel("Label", titleHead, "");
        titleLabel.AddClass("SectionTitle");
        titleLabel.AddClass("SectionTitleInlineLabel");
        titleLabel.text = localizedTitle;
        getTooltip().bindSectionPerfTooltip(titleRow, title, "", getCurrentTab(), "", "", null);

        const resetBtn = $.CreatePanel("Button", titleHead, "");
        resetBtn.AddClass("SectionTitleActionBtn");
        resetBtn.AddClass("SectionResetBtn");
        const resetIcon = $.CreatePanel("Image", resetBtn, "", {
            src: "s2r://panorama/images/icons/icon_refresh.vsvg",
            defaultsrc: "",
            scaling: "contain"
        });
        resetIcon.AddClass("SectionTitleActionIcon");
        resetIcon.AddClass("SettingRowResetIcon");
        resetIcon.AddClass("QOLResetIcon");
        try { resetIcon.SetImage("s2r://panorama/images/icons/icon_refresh.vsvg"); } catch (e5) {
            warnLog("settings", "op failed: " + (e5 && e5.message ? e5.message : String(e5 || "")));
        }

        resetBtn.SetPanelEvent("onmouseover", () => {
            getTooltip().hideTextTooltip();
            getTooltip().cancelHide();
            getTooltip().showRowTooltip(
                resetBtn,
                "",
                localize("Reset section runtime options", true),
                PERF_IMPACT_TIER_NONE,
                ""
            );
        });
        resetBtn.SetPanelEvent("onmouseout", () => {
            getTooltip().hideTextTooltip();
            getTooltip().hideTooltipDeferred("section_runtime_reset_btn_mouseout");
        });
        resetBtn.SetPanelEvent("onactivate", () => {
            const changed = resetRuntimeRowsInSectionFromTitleRow(titleRow);
            if (changed > 0) {
                setConfigFeedbackMessage("Section reset (" + String(changed) + " changed).", "success", 1500);
            } else {
                setConfigFeedbackMessage("Section already at defaults.", "info", 1300);
            }
        });

        return titleLabel;
    }

    function applyDefaultHeroSelection(heroId) {
        const normalizedHeroId = String(heroId || "");
        if (!/^hero_[a-z0-9_]+$/i.test(normalizedHeroId)) return false;
        const command = "selecthero " + normalizedHeroId;
        const didDispatch = runConsoleCommandBestEffort(command);
        if (didDispatch) {
            try {
                const root = findRootPanel();
                if (root && root.SetAttributeString) {
                    root.SetAttributeString(HERO_HINT_ATTR, normalizedHeroId);
                }
            } catch (e1) {
                warnLog("settings", "op failed: " + (e1 && e1.message ? e1.message : String(e1 || "")));
            }
        }
        return didDispatch;
    }

    function applyHealthbarTypeSelection(rawValue) {
        const normalizeFn = (typeof NormalizeHealthbarTypeValue === "function")
            ? NormalizeHealthbarTypeValue
            : (typeof globalThis.NormalizeHealthbarTypeValue === "function" ? globalThis.NormalizeHealthbarTypeValue : ((v) => Math.round(Number(v) || 0)));
        const nextType = normalizeFn(rawValue);
        const modCfg = getConfig();
        modCfg.HEALTHBAR_TYPE = nextType;
        modCfg.ENABLE_MINIMALIST_HEALTHBAR = (nextType === 1) ? 1 : 0;
        modCfg.ENABLE_FG_HEALTHBAR = (nextType === 2) ? 1 : 0;
    }

    // -------------------------------------------------------------------------
    // Sliders & Helpers
    // -------------------------------------------------------------------------
    function forceCenterSliderValueInput(inputPanel) {
        if (!inputPanel || !inputPanel.IsValid || !inputPanel.IsValid()) return;

        const applyCenteredTextStyle = (panel, insetPx) => {
            if (!panel || !panel.IsValid || !panel.IsValid()) return;
            try { panel.style.padding = "0px"; } catch (e0) { warnLog("settings", "op failed: " + (e0 && e0.message ? e0.message : String(e0 || ""))); }
            try { panel.style.paddingLeft = String(insetPx) + "px"; } catch (e1) { warnLog("settings", "op failed: " + (e1 && e1.message ? e1.message : String(e1 || ""))); }
            try { panel.style.paddingRight = "0px"; } catch (e2) { warnLog("settings", "op failed: " + (e2 && e2.message ? e2.message : String(e2 || ""))); }
            try { panel.style.margin = "0px"; } catch (e3) { warnLog("settings", "op failed: " + (e3 && e3.message ? e3.message : String(e3 || ""))); }
            try { panel.style.marginLeft = "0px"; } catch (e4) { warnLog("settings", "op failed: " + (e4 && e4.message ? e4.message : String(e4 || ""))); }
            try { panel.style.marginRight = "0px"; } catch (e5) { warnLog("settings", "op failed: " + (e5 && e5.message ? e5.message : String(e5 || ""))); }
            try { panel.style.textAlign = "center"; } catch (e6) { warnLog("settings", "op failed: " + (e6 && e6.message ? e6.message : String(e6 || ""))); }
            try { panel.style.verticalAlign = "center"; } catch (e7) { warnLog("settings", "op failed: " + (e7 && e7.message ? e7.message : String(e7 || ""))); }
            try { panel.style.x = String(insetPx) + "px"; } catch (e8) { warnLog("settings", "op failed: " + (e8 && e8.message ? e8.message : String(e8 || ""))); }
        };

        const applyNow = () => {
            if (!inputPanel || !inputPanel.IsValid || !inputPanel.IsValid()) return;
            try {
                inputPanel.style.padding = "0px";
                inputPanel.style.paddingLeft = "3px";
                inputPanel.style.paddingRight = "0px";
                inputPanel.style.textAlign = "center";
            } catch (e0) { warnLog("settings", "op failed: " + (e0 && e0.message ? e0.message : String(e0 || ""))); }

            let textEntry = null;
            try { textEntry = inputPanel.FindChildTraverse("TextEntry"); } catch (e9) { textEntry = null; }
            if (textEntry && textEntry.IsValid && textEntry.IsValid()) {
                try { textEntry.style.width = "100%"; } catch (e10) { warnLog("settings", "op failed: " + (e10 && e10.message ? e10.message : String(e10 || ""))); }
                applyCenteredTextStyle(textEntry, 3);
            }

            let contents = null;
            try { contents = inputPanel.FindChildTraverse("Contents"); } catch (e11) { contents = null; }
            if (contents && contents.IsValid && contents.IsValid()) {
                try { contents.style.width = "100%"; } catch (e12) { warnLog("settings", "op failed: " + (e12 && e12.message ? e12.message : String(e12 || ""))); }
                applyCenteredTextStyle(contents, 0);
                try { contents.style.horizontalAlign = "left"; } catch (e13) { warnLog("settings", "op failed: " + (e13 && e13.message ? e13.message : String(e13 || ""))); }
            }

            let textContents = null;
            try { textContents = inputPanel.FindChildTraverse("TextEntryContents"); } catch (e14) { textContents = null; }
            if (textContents && textContents.IsValid && textContents.IsValid()) {
                try { textContents.style.width = "100%"; } catch (e15) { warnLog("settings", "op failed: " + (e15 && e15.message ? e15.message : String(e15 || ""))); }
                try { textContents.style.horizontalAlign = "left"; } catch (e16) { warnLog("settings", "op failed: " + (e16 && e16.message ? e16.message : String(e16 || ""))); }
                applyCenteredTextStyle(textContents, 3);

                let childCount = 0;
                try { childCount = textContents.GetChildCount ? textContents.GetChildCount() : 0; } catch (e17) { childCount = 0; }
                for (let ci = 0; ci < childCount; ci++) {
                    let textChild = null;
                    try { textChild = textContents.GetChild(ci); } catch (e18) { textChild = null; }
                    if (!textChild || !textChild.IsValid || !textChild.IsValid()) continue;
                    try { textChild.style.width = "100%"; } catch (e19) { warnLog("settings", "op failed: " + (e19 && e19.message ? e19.message : String(e19 || ""))); }
                    try { textChild.style.horizontalAlign = "center"; } catch (e20) { warnLog("settings", "op failed: " + (e20 && e20.message ? e20.message : String(e20 || ""))); }
                    applyCenteredTextStyle(textChild, 3);
                }
            }

            let placeholder = null;
            try { placeholder = inputPanel.FindChildTraverse("PlaceholderText"); } catch (e21) { placeholder = null; }
            if (placeholder && placeholder.IsValid && placeholder.IsValid()) {
                applyCenteredTextStyle(placeholder, 3);
            }

            let plainLabel = null;
            try { plainLabel = inputPanel.FindChildTraverse("Label"); } catch (e22) { plainLabel = null; }
            if (plainLabel && plainLabel.IsValid && plainLabel.IsValid()) {
                applyCenteredTextStyle(plainLabel, 3);
            }

            let cursor = null;
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

    function createSliderRow(parent, label, configId, shapeKey, description, isAngle) {
        const shape = SLIDER_SHAPES[shapeKey];
        if (!shape) {
            $.Msg("[QOLLock] ERROR: missing slider shape '" + shapeKey + "' for " + configId);
            return createRow(parent, label, configId, "slider", 0, 1, 0.05, null, description || null);
        }
        const type = isAngle ? "angle_slider" : "slider";
        return createRow(parent, label, configId, type, shape.min, shape.max, shape.step, null, description || null);
    }

    function getDefaultHeroIconPath(heroId) {
        const normalizedHeroId = String(heroId || "");
        let heroAlias = normalizedHeroId.indexOf("hero_") === 0 ? normalizedHeroId.substring(5) : normalizedHeroId;
        if (!heroAlias) heroAlias = "werewolf";
        const heroIconAliasMap = {
            viper: "kali",
            krill: "digger",
            forge: "engineer",
            ghost: "spectre",
            orion: "archer",
            atlas: "bull",
            dynamo: "sumo"
        };
        if (Object.prototype.hasOwnProperty.call(heroIconAliasMap, heroAlias)) {
            heroAlias = heroIconAliasMap[heroAlias];
        }
        return "s2r://panorama/images/heroes/" + heroAlias + "_mm_psd.vtex";
    }

    function getLanguageIconPath(languageValue) {
        const normalizedValue = String(languageValue === undefined || languageValue === null ? "" : languageValue);
        let languageIconName = "english";
        const langMap = {
            "1": "russian",
            "2": "ukraine",
            "3": "poland",
            "4": "bulgaria",
            "11": "belarus",
            "5": "japan",
            "6": "chinese",
            "7": "french",
            "8": "portuguese",
            "9": "brazil",
            "10": "spanish",
            "12": "korean",
            "13": "italian",
            "14": "turkish"
        };
        if (Object.prototype.hasOwnProperty.call(langMap, normalizedValue)) {
            languageIconName = langMap[normalizedValue];
        }
        return "s2r://panorama/images/qollock/" + languageIconName + "_png.vtex";
    }

    // -------------------------------------------------------------------------
    // Separators, Section Titles & Collapsible Sections
    // -------------------------------------------------------------------------
    function createSeparator(parent) {
        if (getSearchCollectMode() && getSearchCollectState()) {
            getSearchCollectState().currentSection = null;
            return null;
        }
        const sep = $.CreatePanel("Panel", parent, "");
        sep.AddClass("RowSeparator");
        return sep;
    }

    function createSectionTitle(parent, title, configIdForPerf) {
        const localizedTitle = localize(title || "");
        if (typeof gCurrentSettingsSectionTitle !== "undefined") {
            gCurrentSettingsSectionTitle = String(title || "");
        } else {
            globalThis.gCurrentSettingsSectionTitle = String(title || "");
        }
        if (getSearchCollectMode() && getSearchCollectState()) {
            const section = {
                title: localizedTitle,
                rows: []
            };
            getSearchCollectState().sections.push(section);
            getSearchCollectState().currentSection = section;
            return null;
        }
        const titleRow = $.CreatePanel("Panel", parent, "");
        titleRow.AddClass("SectionTitleRow");
        titleRow.AddClass("SectionTitleStaticRow");
        const titleHead = $.CreatePanel("Panel", titleRow, "");
        titleHead.AddClass("SectionTitleInlineHead");
        const titleLabel = $.CreatePanel("Label", titleHead, "");
        titleLabel.AddClass("SectionTitle");
        titleLabel.AddClass("SectionTitleInlineLabel");
        titleLabel.text = localizedTitle;
        getTooltip().bindSectionPerfTooltip(titleRow, title, "", getCurrentTab(), configIdForPerf || "", "toggle", null);
        createSectionResetButton(titleRow, () => collectResetKeysFromSectionTitleRow(titleRow), null, titleHead);
        return titleLabel;
    }

    function createSectionInlineIconButton(titleLabel, buttonId, iconSrc, tooltipText) {
        if (typeof QOL !== "undefined" && QOL.ui && QOL.ui.configTab && typeof QOL.ui.configTab.createSectionInlineIconButton === "function") {
            return QOL.ui.configTab.createSectionInlineIconButton(titleLabel, buttonId, iconSrc, tooltipText);
        }
        if (typeof globalThis.CreateSectionInlineIconButton === "function" && globalThis.CreateSectionInlineIconButton !== createSectionInlineIconButton) {
            return globalThis.CreateSectionInlineIconButton(titleLabel, buttonId, iconSrc, tooltipText);
        }
        return null;
    }

    function createSectionTitleCheckboxToggle(titleHead, label, configId, toggleOptions) {
        if (!titleHead || !titleHead.IsValid || !titleHead.IsValid() || !configId) return null;
        const localizedLabel = localize(label || "");
        const invertToggle = !!(toggleOptions && toggleOptions.invert === true);
        const refreshListOnChange = !!(toggleOptions && toggleOptions.refreshListOnChange === true);
        const description = (toggleOptions && toggleOptions.description) ? String(toggleOptions.description) : "";
        const isAvailableFn = (toggleOptions && typeof toggleOptions.isAvailableFn === "function") ? toggleOptions.isAvailableFn : null;

        const getIsActive = () => {
            const rawActive = (getConfig()[configId] === 1);
            return invertToggle ? !rawActive : rawActive;
        };
        const getIsAvailable = () => {
            if (!isAvailableFn) return true;
            try { return isAvailableFn() === true; } catch (eAvail) { return true; }
        };

        const btn = $.CreatePanel("ToggleButton", titleHead, String(configId).replace(/[^A-Za-z0-9_]/g, "_") + "SectionTitleCheckbox");
        btn.AddClass("SectionTitleCheckboxToggle");
        btn.AddClass("InlineSecondaryCheckboxBtn");
        btn.AddClass("MultiCheckboxBtn");
        btn.AddClass("CitadelSettingsCheckbox");
        const lbl = $.CreatePanel("Label", btn, "");
        lbl.AddClass("SectionTitleCheckboxLabel");
        lbl.AddClass("MultiCheckboxLabel");
        lbl.text = localizedLabel;

        const update = () => {
            const isActive = getIsActive();
            const isAvailable = getIsAvailable();
            try { btn.SetSelected(isActive); } catch (eSel) {
                warnLog("settings", "op failed: " + (eSel && eSel.message ? eSel.message : String(eSel || "")));
            }
            btn.SetHasClass("selected", isActive);
            btn.SetHasClass("IsSelected", isActive);
            btn.SetHasClass("Active", isActive);
            btn.SetHasClass("Disabled", !isAvailable);
            btn.hittest = isAvailable;
            btn.hittestchildren = isAvailable;
        };
        update();

        btn.SetPanelEvent("onmouseover", () => {
            getTooltip().hideTextTooltip();
            getTooltip().cancelHide();
            getTooltip().showRowTooltip(
                btn,
                "",
                localize(description || label || configId, true),
                PERF_IMPACT_TIER_NONE,
                ""
            );
        });
        btn.SetPanelEvent("onmouseout", () => {
            getTooltip().hideTooltipDeferred("section_title_checkbox_mouseout");
        });
        btn.SetPanelEvent("onactivate", () => {
            if (!getIsAvailable()) {
                update();
                return;
            }
            const nextActive = !getIsActive();
            getConfig()[configId] = invertToggle ? (nextActive ? 0 : 1) : (nextActive ? 1 : 0);
            update();
            saveAndSync();
            if (refreshListOnChange) requestSettingsListRefresh(0, true);
            getPreview().showForConfigId(configId);
        });

        registerSettingsListRowSync(() => {
            if (!btn || !btn.IsValid || !btn.IsValid()) return false;
            update();
            return true;
        });
        btn.qolRefreshTitleCheckbox = update;
        return btn;
    }

    function createAnimatedInlineToggleSection(parent, title, enableConfigId, enableDescription, buildRowsFn, enableToggleOptions, sectionOptions) {
        const localizedTitle = localize(title || "");
        if (typeof gCurrentSettingsSectionTitle !== "undefined") {
            gCurrentSettingsSectionTitle = String(title || "");
        } else {
            globalThis.gCurrentSettingsSectionTitle = String(title || "");
        }
        const invertEnableToggle = !!(enableToggleOptions && enableToggleOptions.invert === true);
        const getSectionEnabled = () => (invertEnableToggle ? (getConfig()[enableConfigId] !== 1) : (getConfig()[enableConfigId] === 1));

        if (getSearchCollectMode() && getSearchCollectState()) {
            createSectionTitle(parent, title);
            const searchToggleOptions = invertEnableToggle ? [{ invert: true }] : null;
            createRow(parent, "Enable", enableConfigId, "toggle", null, null, null, searchToggleOptions, enableDescription || "");
            if (buildRowsFn) {
                buildRowsFn(parent);
            }
            return null;
        }

        const safeTitleId = String(title || "Section").replace(/[^A-Za-z0-9]/g, "");
        const titleRow = $.CreatePanel("Panel", parent, safeTitleId + "SectionTitleRow");
        titleRow.AddClass("SectionTitleRow");

        const titleHead = $.CreatePanel("Panel", titleRow, safeTitleId + "SectionTitleHead");
        titleHead.AddClass("SectionTitleInlineHead");

        const titleLabel = $.CreatePanel("Label", titleHead, safeTitleId + "SectionTitle");
        titleLabel.AddClass("SectionTitle");
        titleLabel.AddClass("SectionTitleInlineLabel");
        titleLabel.text = localizedTitle;
        getTooltip().bindSectionPerfTooltip(titleRow, title, enableDescription || "", getCurrentTab(), enableConfigId, "toggle", enableToggleOptions || null);

        const body = $.CreatePanel("Panel", parent, safeTitleId + "SectionBody");
        body.AddClass("SettingsSectionBody");

        createSectionResetButton(titleRow, () => {
            const keys = [];
            const seen = {};
            collectResetKeysFromPanel(body, keys, seen);
            if (sectionOptions && sectionOptions.titleCheckbox && sectionOptions.titleCheckbox.configId && !seen[sectionOptions.titleCheckbox.configId]) {
                keys.push(sectionOptions.titleCheckbox.configId);
                seen[sectionOptions.titleCheckbox.configId] = true;
            }
            return keys;
        }, enableConfigId, titleHead);

        const toggleBtn = $.CreatePanel("Panel", titleRow, safeTitleId + "SectionToggle");
        toggleBtn.AddClass("SectionInlineToggleBtn");
        const toggleSwitchButton = $.CreatePanel("Button", toggleBtn, safeTitleId + "SectionToggleButton");
        toggleSwitchButton.AddClass("SwitchButton");
        const toggleHandle = $.CreatePanel("Panel", toggleSwitchButton, "handle");
        toggleHandle.AddClass("SectionInlineToggleHandle");

        let titleCheckboxBtn = null;
        if (sectionOptions && sectionOptions.titleCheckbox) {
            sectionOptions.titleCheckbox.isAvailableFn = getSectionEnabled;
            titleCheckboxBtn = createSectionTitleCheckboxToggle(
                titleRow,
                sectionOptions.titleCheckbox.label,
                sectionOptions.titleCheckbox.configId,
                sectionOptions.titleCheckbox
            );
        }

        let animToken = 0;
        let lastAppliedEnabled = null;
        const applyBodyState = (enabled, animate) => {
            lastAppliedEnabled = enabled;
            animToken++;
            const token = animToken;
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
                $.Schedule(0.01, () => {
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
                $.Schedule(0.17, () => {
                    if (!body || !body.IsValid || !body.IsValid()) return;
                    if (animToken !== token) return;
                    body.SetHasClass("Hiding", false);
                    body.SetHasClass("Collapsed", true);
                });
            }
        };
        applyBodyState(getSectionEnabled(), false);

        registerSettingsListRowSync(() => {
            if (!body || !body.IsValid || !body.IsValid()) return false;
            const currentEnabled = getSectionEnabled();
            if (currentEnabled !== lastAppliedEnabled) {
                applyBodyState(currentEnabled, false);
            }
            return true;
        });

        toggleSwitchButton.SetPanelEvent("onactivate", () => {
            $.DispatchEvent("UIHideTextTooltip");
            const nextEnabled = !getSectionEnabled();
            getConfig()[enableConfigId] = invertEnableToggle ? (nextEnabled ? 0 : 1) : (nextEnabled ? 1 : 0);
            applyBodyState(nextEnabled, true);
            saveAndSync();
            getPreview().showForConfigId(enableConfigId);
        });

        if (buildRowsFn) {
            buildRowsFn(body);
        }
        return body;
    }

    function createCollapsibleSubSection(parent, title, buildRowsFn) {
        const localizedTitle = localize(title || "");
        if (getSearchCollectMode() && getSearchCollectState()) {
            if (buildRowsFn) buildRowsFn(parent);
            return null;
        }

        const safeTitleId = String(title || "SubSection").replace(/[^A-Za-z0-9]/g, "");
        const header = $.CreatePanel("Button", parent, safeTitleId + "SubSectionHeader");
        header.AddClass("QOLCollapsibleSubHeader");

        const chevron = $.CreatePanel("Panel", header, safeTitleId + "SubSectionChevron");
        chevron.AddClass("QOLCollapsibleSubChevron");

        const headLabel = $.CreatePanel("Label", header, safeTitleId + "SubSectionTitle");
        headLabel.AddClass("QOLCollapsibleSubLabel");
        headLabel.text = localizedTitle;

        const body = $.CreatePanel("Panel", parent, safeTitleId + "SubSectionBody");
        body.AddClass("SettingsSectionBody");

        let expanded = false;
        let animToken = 0;
        const applyBodyState = (open, animate) => {
            animToken++;
            const token = animToken;
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
                $.Schedule(0.01, () => {
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
                $.Schedule(0.17, () => {
                    if (!body || !body.IsValid || !body.IsValid()) return;
                    if (animToken !== token) return;
                    body.SetHasClass("Hiding", false);
                    body.SetHasClass("Collapsed", true);
                });
            }
        };
        applyBodyState(false, false);

        header.SetPanelEvent("onactivate", () => {
            $.DispatchEvent("UIHideTextTooltip");
            expanded = !expanded;
            applyBodyState(expanded, true);
        });

        if (buildRowsFn) buildRowsFn(body);
        return body;
    }

    function createAnimatedInlineEnumSection(parent, title, configId, activeValue, buildRowsFn) {
        const getSectionEnabled = () => (getConfig()[configId] === activeValue);

        if (getSearchCollectMode() && getSearchCollectState()) {
            createSectionTitle(parent, title);
            if (buildRowsFn) buildRowsFn(parent);
            return null;
        }

        const safeTitleId = String(title || "Section").replace(/[^A-Za-z0-9]/g, "");
        const body = $.CreatePanel("Panel", parent, safeTitleId + "EnumSectionBody");
        body.AddClass("SettingsSectionBody");

        let animToken = 0;
        const applyBodyState = (enabled, animate) => {
            animToken++;
            const token = animToken;
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
                $.Schedule(0.01, () => {
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
                $.Schedule(0.17, () => {
                    if (!body || !body.IsValid()) return;
                    if (animToken !== token) return;
                    body.SetHasClass("Hiding", false);
                    body.SetHasClass("Collapsed", true);
                });
            }
        };
        let lastEnumEnabled = getSectionEnabled();
        applyBodyState(lastEnumEnabled, false);

        getEnumSectionSyncCallbacks().push(() => {
            if (!body || !body.IsValid()) return;
            const nowEnabled = getSectionEnabled();
            const changed = nowEnabled !== lastEnumEnabled;
            lastEnumEnabled = nowEnabled;
            applyBodyState(nowEnabled, changed);
        });

        if (buildRowsFn) buildRowsFn(body);
        return body;
    }

    function refreshEnumSections() {
        const callbacks = getEnumSectionSyncCallbacks();
        for (let i = 0; i < callbacks.length; i++) {
            try { callbacks[i](); } catch (e) {
                warnLog("settings", "op failed: " + (e && e.message ? e.message : String(e || "")));
            }
        }
    }

    // -------------------------------------------------------------------------
    // Main Procedural Row Builders
    // -------------------------------------------------------------------------
    function createRow(parent, label, configId, type, min, max, step, options, description) {
        const localizedLabel = localize(label || "");
        const effectiveDescription = getTooltip().getSettingDescriptionOverride(
            configId,
            label,
            description || "",
            getTooltip().getCurrentCategoryKey()
        );
        const localizedDescription = localize(effectiveDescription || "");
        const hasRowDescription = !!(effectiveDescription && effectiveDescription !== "" && localizedDescription && localizedDescription !== "");
        const perfImpactInfo = getTooltip().buildPerfImpactLine(configId, type, options);
        const rowPerfTier = (perfImpactInfo && perfImpactInfo.tier) ? String(perfImpactInfo.tier) : PERF_IMPACT_TIER_NONE;
        const rowCreatedBy = getTooltip().getSettingCreatedBy(configId, label);
        const rowTooltipPerfLine = (perfImpactInfo && perfImpactInfo.line) ? String(perfImpactInfo.line) : "";
        const rowTooltipDescLine = hasRowDescription ? localizedDescription : "";
        const hasRowTooltip = getTooltip().hasMeaningfulContent(rowPerfTier, rowTooltipDescLine, rowCreatedBy);

        if (getSearchCollectMode() && getSearchCollectState()) {
            getActiveSearchCollectSection().rows.push(buildSearchCollectedRow(
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

        const row = $.CreatePanel("Panel", parent, "");
        if (getSearchResultRenderMode()) row.AddClass("SearchResultRow");
        row.AddClass("SettingRow");
        if (configId) row.AddClass("SettingRow_" + String(configId).replace(/[^A-Za-z0-9_]/g, "_"));

        const isRuntimeSliderRow = (type === "runtime_slider");
        const isRuntimeButtonGroupRow = (type === "runtime_buttongroup");
        if (type === "slider" || type === "angle_slider" || isRuntimeSliderRow) row.AddClass("RowTypeSlider");
        else if (type === "multitoggle") row.AddClass("RowTypeMultiToggle");
        else if (type === "buttongroup") row.AddClass("RowTypeButtonGroup");
        else if (type === "palette") row.AddClass("RowTypePalette");
        else if (type === "runtime_buttongroup") row.AddClass("RowTypeButtonGroup");
        else if (type === "dropdown") row.AddClass("RowTypeDropDown");
        else if (type === "actionbutton") row.AddClass("RowTypeAction");
        else row.AddClass("RowTypeToggle");

        const labelContainer = $.CreatePanel("Panel", row, "");
        labelContainer.AddClass("LabelContainer");
        const lbl = $.CreatePanel("Label", labelContainer, "");
        lbl.AddClass("SettingLabel");
        lbl.text = localizedLabel;

        const rowConfigKeys = collectRowConfigKeys(configId, type, options);
        if (row && row.SetAttributeString) {
            try { row.SetAttributeString(SETTING_ROW_RESET_KEYS_ATTR, rowConfigKeys.join(",")); } catch (e0) {
                warnLog("settings", "op failed: " + (e0 && e0.message ? e0.message : String(e0 || "")));
            }
        }

        let rowResetBtn = null;
        let runtimeSliderResetAction = null;
        let runtimeButtonGroupResetAction = null;
        let showCustomRowTooltip = () => {};
        let hideCustomRowTooltip = () => {};
        let syncRowVisualState = () => {
            if (!row || !row.IsValid || !row.IsValid()) return false;
            return true;
        };

        if (rowConfigKeys.length > 0 || isRuntimeSliderRow || isRuntimeButtonGroupRow) {
            rowResetBtn = $.CreatePanel("Button", labelContainer, "");
            rowResetBtn.AddClass("SettingRowResetBtn");
            if (isRuntimeSliderRow || isRuntimeButtonGroupRow) {
                rowResetBtn.AddClass("RuntimeAlwaysVisible");
            }
            const rowResetIcon = $.CreatePanel("Image", rowResetBtn, "", {
                src: "s2r://panorama/images/icons/icon_refresh.vsvg",
                defaultsrc: "",
                scaling: "contain"
            });
            rowResetIcon.AddClass("SettingRowResetIcon");
            rowResetIcon.AddClass("QOLResetIcon");
            try { rowResetIcon.SetImage("s2r://panorama/images/icons/icon_refresh.vsvg"); } catch (eImg) {
                warnLog("settings", "op failed: " + (eImg && eImg.message ? eImg.message : String(eImg || "")));
            }
            rowResetBtn.SetPanelEvent("onmouseover", () => {
                hideCustomRowTooltip();
                getTooltip().hideTextTooltip();
                getTooltip().cancelHide();
                getTooltip().showRowTooltip(
                    rowResetBtn,
                    "",
                    localize((isRuntimeSliderRow || isRuntimeButtonGroupRow) ? "Reset to default value" : "Reset row to defaults", true),
                    PERF_IMPACT_TIER_NONE,
                    ""
                );
            });
            rowResetBtn.SetPanelEvent("onmouseout", () => {
                getTooltip().hideTextTooltip();
                getTooltip().hideTooltipDeferred("row_reset_btn_mouseout");
            });
            rowResetBtn.SetPanelEvent("onactivate", () => {
                if (isRuntimeSliderRow) {
                    if (runtimeSliderResetAction) runtimeSliderResetAction();
                    return;
                }
                if (isRuntimeButtonGroupRow) {
                    if (runtimeButtonGroupResetAction) runtimeButtonGroupResetAction();
                    return;
                }
                const changedCount = applyResetForConfigKeys(rowConfigKeys);
                if (changedCount > 0) {
                    saveAndSync();
                    syncRowVisualState();
                    setConfigFeedbackMessage(isRussianLanguage()
                        ? ("\u0421\u0431\u0440\u043E\u0448\u0435\u043D\u0430 \u0441\u0442\u0440\u043E\u043A\u0430 (" + String(changedCount) + ").")
                        : ("Row reset (" + String(changedCount) + ")."), "success", 1400);
                } else {
                    setConfigFeedbackMessage(isRussianLanguage()
                        ? "\u0421\u0442\u0440\u043E\u043A\u0430 \u0443\u0436\u0435 \u043F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E."
                        : "Row already at defaults.", "info", 1200);
                }
            });
        }

        const refreshRowChangedState = bindRowChangedState(row, labelContainer, rowConfigKeys, rowResetBtn);
        syncRowVisualState = () => {
            if (!row || !row.IsValid || !row.IsValid()) return false;
            refreshRowChangedState();
            return true;
        };

        if (hasRowTooltip) {
            showCustomRowTooltip = () => {
                getTooltip().cancelHide();
                getTooltip().showRowTooltip(row, rowTooltipPerfLine, rowTooltipDescLine, rowPerfTier, rowCreatedBy);
            };
            hideCustomRowTooltip = () => {
                getTooltip().hideTooltipDeferred("row_mouseout");
            };
            row.SetPanelEvent("onmouseover", () => { showCustomRowTooltip(); });
            row.SetPanelEvent("onmouseout", () => { hideCustomRowTooltip(); });
        }

        const modCfg = getConfig();

        if (type === "slider" || type === "angle_slider") {
            const sliderValueGroup = $.CreatePanel("Panel", row, "");
            sliderValueGroup.AddClass("SliderValueGroup");
            sliderValueGroup.AddClass("SettingControlRoot");
            const sliderContainer = $.CreatePanel("Panel", sliderValueGroup, "");
            sliderContainer.AddClass("SliderContainer");
            const slider = $.CreatePanel("Slider", sliderContainer, "", { direction: "horizontal" });
            slider.AddClass("HorizontalSlider");
            const isAngleSlider = (type === "angle_slider");
            const isFloat = (max <= 5.0 && (configId.indexOf("OPACITY") !== -1 || configId.indexOf("SCALE") !== -1));
            const isOpacitySlider = (isFloat && configId.indexOf("OPACITY") !== -1);
            const isSecondsSlider = (configId === "BRIDGE_BUFF_START" || configId === "MINIMAP_REMINDER_INTERVAL" || configId === "RECENT_PURCHASES_QUICK_DISPLAY_SEC");

            const formatSliderInputValue = (value) => {
                if (value === undefined || value === null || !isFinite(Number(value))) value = 0;
                const numeric = Number(value);
                if (isOpacitySlider) {
                    const pct = Math.round(Math.max(0, Math.min(1, numeric)) * 100);
                    return String(pct) + "%";
                }
                if (isFloat) return numeric.toFixed(2);
                if (isSecondsSlider) return String(Math.round(numeric)) + "s";
                if (isAngleSlider) return String(Math.round(numeric)) + "°";
                return String(Math.round(numeric));
            };

            const parseSliderInputValue = (text) => {
                let rawText = String(text === undefined || text === null ? "" : text).trim();
                if (!rawText) return null;
                rawText = rawText.replace(",", ".");
                let parsed = parseFloat(rawText);
                if (!isFinite(parsed)) return null;
                if (isOpacitySlider) {
                    const hasPercent = rawText.indexOf("%") !== -1;
                    if (hasPercent || parsed > 1) parsed = parsed / 100;
                }
                return parsed;
            };

            slider.min = isFloat ? min * 100 : min;
            slider.max = isFloat ? max * 100 : max;
            slider.value = isFloat ? modCfg[configId] * 100 : modCfg[configId];
            const input = $.CreatePanel("TextEntry", sliderValueGroup, "");
            input.AddClass("ValueInput");
            input.text = formatSliderInputValue(modCfg[configId]);
            forceCenterSliderValueInput(input);

            slider.SetPanelEvent("onvaluechanged", () => {
                let val;
                if (isFloat) {
                    val = parseFloat((Math.round(slider.value) / 100).toFixed(2));
                    if (val !== modCfg[configId]) {
                        input.text = formatSliderInputValue(val);
                        modCfg[configId] = val;
                        markConfigDirty();
                        refreshRowChangedState();
                    }
                } else {
                    val = Math.round(slider.value / step) * step;
                    if (val !== modCfg[configId]) {
                        input.text = formatSliderInputValue(val);
                        modCfg[configId] = val;
                        markConfigDirty();
                        refreshRowChangedState();
                    }
                }
                getPreview().showForConfigId(configId);
            });

            input.SetPanelEvent("oninputsubmit", () => {
                const rawVal = parseSliderInputValue(input.text);
                if (rawVal === null || !isFinite(Number(rawVal))) {
                    input.text = formatSliderInputValue(modCfg[configId]);
                    return;
                }
                const clampedVal = Math.max(min, Math.min(max, rawVal));
                if (isFloat) {
                    modCfg[configId] = parseFloat(clampedVal.toFixed(2));
                    slider.value = clampedVal * 100;
                    input.text = formatSliderInputValue(modCfg[configId]);
                } else {
                    modCfg[configId] = Math.round(clampedVal);
                    slider.value = modCfg[configId];
                    input.text = formatSliderInputValue(modCfg[configId]);
                }
                input.RemoveClass("ValueSavedFlash");
                input.AddClass("ValueSavedFlash");
                markConfigDirty();
                refreshRowChangedState();
                getPreview().showForConfigId(configId);
            });

            syncRowVisualState = () => {
                if (!row || !row.IsValid || !row.IsValid()) return false;
                let nextVal = Number(modCfg[configId]);
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
            const runtimeConfig = (Array.isArray(options) && options.length > 0 && options[0]) ? options[0] : {};
            const runtimeCommand = String(runtimeConfig.command || "").trim();
            let runtimeMin = Number(min);
            let runtimeMax = Number(max);
            let runtimeStep = Number(step);
            let runtimeDefault = Number(runtimeConfig.defaultValue);
            if (!isFinite(runtimeMin)) runtimeMin = 0;
            if (!isFinite(runtimeMax)) runtimeMax = runtimeMin + 1;
            if (runtimeMax < runtimeMin) {
                const swapTmp = runtimeMax;
                runtimeMax = runtimeMin;
                runtimeMin = swapTmp;
            }
            if (!isFinite(runtimeStep) || runtimeStep <= 0) runtimeStep = 1;
            if (!isFinite(runtimeDefault)) runtimeDefault = runtimeMin;
            runtimeDefault = Math.max(runtimeMin, Math.min(runtimeMax, runtimeDefault));

            const stepText = String(runtimeStep);
            const stepDot = stepText.indexOf(".");
            let runtimePrecision = 0;
            if (stepDot !== -1) runtimePrecision = stepText.length - stepDot - 1;
            if (runtimePrecision < 0) runtimePrecision = 0;
            if (runtimePrecision > 6) runtimePrecision = 6;
            const runtimeScale = Math.pow(10, runtimePrecision);

            const quantizeRuntimeValue = (value) => {
                let numeric = Number(value);
                if (!isFinite(numeric)) numeric = runtimeDefault;
                numeric = Math.max(runtimeMin, Math.min(runtimeMax, numeric));
                let stepped = Math.round((numeric - runtimeMin) / runtimeStep) * runtimeStep + runtimeMin;
                stepped = Math.max(runtimeMin, Math.min(runtimeMax, stepped));
                if (runtimePrecision > 0) {
                    stepped = Number(stepped.toFixed(runtimePrecision));
                } else {
                    stepped = Math.round(stepped);
                }
                return stepped;
            };

            const formatRuntimeValue = (value) => {
                let numeric = Number(value);
                if (!isFinite(numeric)) numeric = runtimeDefault;
                if (runtimePrecision <= 0) return String(Math.round(numeric));
                let out = numeric.toFixed(runtimePrecision);
                out = out.replace(/\.?0+$/, "");
                if (out === "-0") out = "0";
                return out;
            };

            const runtimeKey = String(configId || runtimeCommand || label || "runtime_slider");
            if (row && row.SetAttributeString) {
                try { row.SetAttributeString(RUNTIME_ROW_KIND_ATTR, "runtime_slider"); } catch (eKind0) {
                    warnLog("settings", "op failed: " + (eKind0 && eKind0.message ? eKind0.message : String(eKind0 || "")));
                }
                try { row.SetAttributeString(RUNTIME_ROW_KEY_ATTR, runtimeKey); } catch (eKey0) {
                    warnLog("settings", "op failed: " + (eKey0 && eKey0.message ? eKey0.message : String(eKey0 || "")));
                }
            }

            const sliderState = getRuntimeSliderState();
            let initialRuntimeValue = Number(sliderState[runtimeKey]);
            if (!isFinite(initialRuntimeValue)) initialRuntimeValue = runtimeDefault;
            initialRuntimeValue = quantizeRuntimeValue(initialRuntimeValue);
            sliderState[runtimeKey] = initialRuntimeValue;

            const runtimeGroup = $.CreatePanel("Panel", row, "");
            runtimeGroup.AddClass("SliderValueGroup");
            runtimeGroup.AddClass("SettingControlRoot");
            const runtimeSliderContainer = $.CreatePanel("Panel", runtimeGroup, "");
            runtimeSliderContainer.AddClass("SliderContainer");
            const runtimeSlider = $.CreatePanel("Slider", runtimeSliderContainer, "", { direction: "horizontal" });
            runtimeSlider.AddClass("HorizontalSlider");
            runtimeSlider.min = Math.round(runtimeMin * runtimeScale);
            runtimeSlider.max = Math.round(runtimeMax * runtimeScale);
            runtimeSlider.value = Math.round(initialRuntimeValue * runtimeScale);

            const runtimeInput = $.CreatePanel("TextEntry", runtimeGroup, "");
            runtimeInput.AddClass("ValueInput");
            runtimeInput.text = formatRuntimeValue(initialRuntimeValue);
            forceCenterSliderValueInput(runtimeInput);

            const applyRuntimeValue = (nextValue, runCommand) => {
                const quantized = quantizeRuntimeValue(nextValue);
                let previous = Number(sliderState[runtimeKey]);
                if (!isFinite(previous)) previous = runtimeDefault;
                const changed = Math.abs(previous - quantized) > 0.000001;
                sliderState[runtimeKey] = quantized;

                const sliderValue = Math.round(quantized * runtimeScale);
                if (Math.round(Number(runtimeSlider.value)) !== sliderValue) {
                    runtimeSlider.value = sliderValue;
                }
                runtimeInput.text = formatRuntimeValue(quantized);

                if (changed && runCommand && runtimeCommand) {
                    runConsoleCommandBestEffort(runtimeCommand + " " + formatRuntimeValue(quantized));
                }
                return changed;
            };

            runtimeSlider.SetPanelEvent("onvaluechanged", () => {
                let numericSliderValue = Number(runtimeSlider.value);
                if (!isFinite(numericSliderValue)) numericSliderValue = Math.round(runtimeDefault * runtimeScale);
                const desired = numericSliderValue / runtimeScale;
                applyRuntimeValue(desired, true);
            });

            runtimeInput.SetPanelEvent("oninputsubmit", () => {
                let raw = String(runtimeInput.text === undefined || runtimeInput.text === null ? "" : runtimeInput.text).trim();
                raw = raw.replace(",", ".");
                const parsed = parseFloat(raw);
                if (!isFinite(parsed)) {
                    runtimeInput.text = formatRuntimeValue(sliderState[runtimeKey]);
                    return;
                }
                const changed = applyRuntimeValue(parsed, true);
                if (changed) {
                    runtimeInput.RemoveClass("ValueSavedFlash");
                    runtimeInput.AddClass("ValueSavedFlash");
                }
            });

            runtimeSliderResetAction = () => {
                const changed = applyRuntimeValue(runtimeDefault, true);
                if (!changed) {
                    setConfigFeedbackMessage("Already at default value.", "info", 1200);
                    return;
                }
                runtimeInput.RemoveClass("ValueSavedFlash");
                runtimeInput.AddClass("ValueSavedFlash");
                setConfigFeedbackMessage("Reset to default value.", "success", 1200);
            };
            getRuntimeSliderResetters()[runtimeKey] = runtimeSliderResetAction;
        } else if (type === "multitoggle" && Array.isArray(options)) {
            row.AddClass("MultiToggleRow");
            let isItemCooldownFilterRow = false;
            const isColorWarningFilterRow = isColorWarningThresholdOptions(options) || isEnemyColorWarningThresholdOptions(options) || isAllyColorWarningThresholdOptions(options);
            const isBridgeBuffFilterRow = isBridgeBuffFilterOptions(options);
            if (options && options.length === 4) {
                let itemFilterKeyCount = 0;
                for (let mi = 0; mi < options.length; mi++) {
                    const mk = options[mi] && options[mi].key ? String(options[mi].key) : "";
                    if (mk.indexOf("ITEM_FILTER_") === 0) itemFilterKeyCount += 1;
                }
                isItemCooldownFilterRow = (itemFilterKeyCount === 4);
            }
            const isRecentPurchaseRepositionRow = isRecentPurchaseRepositionOptions(options);
            const useCheckboxStyle = isNeutralCampTypeFilterOptions(options) || isColorWarningFilterRow || isItemCooldownFilterRow || isBridgeBuffFilterRow || isRecentPurchaseRepositionRow;
            if (useCheckboxStyle) {
                row.AddClass("MultiCheckboxRow");
            }
            if (isColorWarningFilterRow || isRecentPurchaseRepositionRow) {
                row.AddClass("AnnouncerTypeFilterRow");
            }
            if (isBridgeBuffFilterRow) {
                row.AddClass("AnnouncerTypeFilterRow");
                row.AddClass("AnnouncerBuffFilterRow");
            }
            if (isItemCooldownFilterRow) {
                row.AddClass("ItemCooldownFilterRow");
            }
            const multiGroup = $.CreatePanel("Panel", row, "");
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
            const multiRefreshFns = [];
            let itemCooldownOptionLine = null;
            options.forEach((opt, optIndex) => {
                if (!opt || !opt.key) return;
                const key = opt.key;
                if (!Object.prototype.hasOwnProperty.call(modCfg, key)) return;

                let buttonParent = multiGroup;
                let optionWrap = null;
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

                const multiBtn = useCheckboxStyle
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
                const multiBtnLbl = $.CreatePanel("Label", multiBtn, "");
                multiBtnLbl.AddClass(useCheckboxStyle ? "MultiCheckboxLabel" : "MultiToggleLabel");
                multiBtnLbl.text = localize(opt.label || key);
                let suppressNextOptionToggle = false;

                const updateMultiBtn = () => {
                    const isActive = (modCfg[key] === 1);
                    if (useCheckboxStyle) {
                        try { multiBtn.SetSelected(isActive); } catch (eSel) {
                            warnLog("settings", "op failed: " + (eSel && eSel.message ? eSel.message : String(eSel || "")));
                        }
                        multiBtn.SetHasClass("selected", isActive);
                        multiBtn.SetHasClass("IsSelected", isActive);
                    }
                    multiBtn.SetHasClass("Active", isActive);
                };
                updateMultiBtn();
                multiRefreshFns.push(updateMultiBtn);

                multiBtn.SetPanelEvent("onactivate", () => {
                    if (suppressNextOptionToggle) {
                        suppressNextOptionToggle = false;
                        return;
                    }
                    modCfg[key] = (modCfg[key] === 1 ? 0 : 1);
                    updateMultiBtn();
                    saveAndSync();
                    refreshRowChangedState();
                });

                if (isBridgeBuffFilterRow && optionWrap) {
                    let soundVariant = optIndex + 1;
                    const keyText = String(key || "");
                    if (keyText.indexOf("ENABLE_BUFF_SOUND_") === 0) {
                        const parsedVariant = parseInt(keyText.substring("ENABLE_BUFF_SOUND_".length), 10);
                        if (isFinite(parsedVariant) && parsedVariant >= 1 && parsedVariant <= 3) {
                            soundVariant = parsedVariant;
                        }
                    }

                    const testBtn = $.CreatePanel("Button", multiBtn, "");
                    testBtn.AddClass("SectionTitleActionBtn");
                    testBtn.AddClass("AnnouncerBuffFilterTestBtn");
                    const testIcon = $.CreatePanel("Image", testBtn, "", {
                        src: "s2r://panorama/images/icons/icon_sound_on.vsvg",
                        defaultsrc: "",
                        scaling: "contain"
                    });
                    testIcon.AddClass("SectionTitleActionIcon");
                    testIcon.AddClass("AnnouncerBuffFilterTestIcon");

                    const testTooltipText = localize("Play Sound", true) + " " + localize(String(soundVariant), true);
                    testBtn.SetPanelEvent("onmouseover", () => {
                        getTooltip().hideTextTooltip();
                        getTooltip().cancelHide();
                        getTooltip().showRowTooltip(
                            testBtn,
                            "",
                            testTooltipText,
                            PERF_IMPACT_TIER_NONE,
                            ""
                        );
                    });
                    testBtn.SetPanelEvent("onmouseout", () => {
                        getTooltip().hideTooltipDeferred("announcer_buff_filter_test_mouseout");
                    });
                    testBtn.SetPanelEvent("onactivate", () => {
                        suppressNextOptionToggle = true;
                        playAnnouncerBridgeVariantPreviewSound(soundVariant);
                        testBtn.AddClass("SuccessState");
                        $.Schedule(0.28, () => {
                            if (testBtn && testBtn.IsValid && testBtn.IsValid()) {
                                testBtn.RemoveClass("SuccessState");
                            }
                        });
                    });
                }
            });
            syncRowVisualState = () => {
                if (!row || !row.IsValid || !row.IsValid()) return false;
                for (let mr = 0; mr < multiRefreshFns.length; mr++) {
                    const multiRefreshFn = multiRefreshFns[mr];
                    if (typeof multiRefreshFn !== "function") continue;
                    try { multiRefreshFn(); } catch (eMulti) {
                        warnLog("settings", "op failed: " + (eMulti && eMulti.message ? eMulti.message : String(eMulti || "")));
                    }
                }
                refreshRowChangedState();
                return true;
            };
        } else if (type === "runtime_buttongroup" && Array.isArray(options)) {
            const runtimeGroup = $.CreatePanel("Panel", row, "");
            runtimeGroup.AddClass("SettingButtonGroup");
            runtimeGroup.AddClass("SettingControlRoot");
            runtimeGroup.AddClass("RuntimeOnOffGroup");
            const runtimeGroupKey = String(configId || label || "runtime_buttongroup");
            const isAudioBeepTestGroup = (runtimeGroupKey === "AUDIO_BEEP_TEST_RUNTIME");
            if (isAudioBeepTestGroup) {
                row.AddClass("RuntimeSoundTestRow");
                runtimeGroup.AddClass("RuntimeSoundTestGroup");
            }
            if (row && row.SetAttributeString) {
                try { row.SetAttributeString(RUNTIME_ROW_KIND_ATTR, "runtime_buttongroup"); } catch (eKind1) {
                    warnLog("settings", "op failed: " + (eKind1 && eKind1.message ? eKind1.message : String(eKind1 || "")));
                }
                try { row.SetAttributeString(RUNTIME_ROW_KEY_ATTR, runtimeGroupKey); } catch (eKey1) {
                    warnLog("settings", "op failed: " + (eKey1 && eKey1.message ? eKey1.message : String(eKey1 || "")));
                }
            }
            let defaultRuntimeIndex = getRuntimeButtonGroupDefaultIndex(runtimeGroupKey, null);
            if (defaultRuntimeIndex >= options.length) defaultRuntimeIndex = 0;
            getRuntimeButtonGroupConfig()[runtimeGroupKey] = {
                options: options,
                defaultIndex: defaultRuntimeIndex,
                alwaysRunAction: isAudioBeepTestGroup
            };
            const toggleState = getRuntimeToggleState();
            let initialRuntimeIndex = Number(toggleState[runtimeGroupKey]);
            if (!isFinite(initialRuntimeIndex) || initialRuntimeIndex < 0 || initialRuntimeIndex >= options.length) {
                initialRuntimeIndex = defaultRuntimeIndex;
            }
            toggleState[runtimeGroupKey] = initialRuntimeIndex;
            const runtimeButtons = [];
            const refreshRuntimeButtons = () => {
                for (let rb = 0; rb < runtimeButtons.length; rb++) {
                    const runtimeBtn = runtimeButtons[rb];
                    if (!runtimeBtn || !runtimeBtn.IsValid || !runtimeBtn.IsValid()) continue;
                    runtimeBtn.SetHasClass("Active", rb === toggleState[runtimeGroupKey]);
                }
            };
            options.forEach((opt, index) => {
                const runtimeBtn = $.CreatePanel("Button", runtimeGroup, "");
                runtimeBtn.AddClass("SegmentBtn");
                runtimeBtn.AddClass("RuntimeOnOffBtn");
                if (isAudioBeepTestGroup) {
                    runtimeBtn.AddClass("RuntimeSoundTestBtn");
                }
                const runtimeBtnLbl = $.CreatePanel("Label", runtimeBtn, "");
                runtimeBtnLbl.text = localize((opt && opt.label) ? opt.label : String(index), true);
                runtimeButtons.push(runtimeBtn);
                runtimeBtn.SetPanelEvent("onactivate", () => {
                    applyRuntimeButtonGroupIndex(runtimeGroupKey, index, true);
                });
            });
            getRuntimeButtonGroupRefreshers()[runtimeGroupKey] = refreshRuntimeButtons;
            runtimeButtonGroupResetAction = () => {
                const changed = resetRuntimeButtonGroupToDefault(runtimeGroupKey, true);
                if (!changed) {
                    setConfigFeedbackMessage("Already at default value.", "info", 1200);
                    return;
                }
                setConfigFeedbackMessage("Reset to default value.", "success", 1200);
            };
            refreshRuntimeButtons();
            syncRowVisualState = () => {
                if (!row || !row.IsValid || !row.IsValid()) return false;
                refreshRuntimeButtons();
                refreshRowChangedState();
                return true;
            };
        } else if (type === "buttongroup" && Array.isArray(options)) {
            const group = $.CreatePanel("Panel", row, "");
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
            const groupButtons = [];
            const buttonGroupRefreshFns = [];
            const themeClassNames = [
                "QOLThemeDefault",
                "QOLThemeCream",
                "QOLThemeKitten",
                "QOLThemeEmo",
                "QOLThemeOcean",
                "QOLThemePsycho",
                "QOLThemeMunfins"
            ];

            options.forEach((opt, index) => {
                const btn = $.CreatePanel("Button", group, "");
                btn.AddClass("SegmentBtn");
                if (configId === "LANGUAGE") {
                    btn.AddClass("LanguageSwitchBtn");
                }
                if (configId === "SETTINGS_THEME") {
                    btn.AddClass("ThemeSwitchBtn");
                    btn.AddClass("QOLThemeSwatch");
                    btn.AddClass("ThemeSwitchBtn_" + String(opt.label || "").replace(/[^A-Za-z0-9_]/g, ""));
                    let themeSwatchIndex = Math.round(Number(opt.value));
                    if (!isFinite(themeSwatchIndex)) themeSwatchIndex = 0;
                    if (themeSwatchIndex < 0) themeSwatchIndex = 0;
                    if (themeSwatchIndex >= themeClassNames.length) themeSwatchIndex = themeClassNames.length - 1;
                    btn.AddClass(themeClassNames[themeSwatchIndex]);
                }
                if (configId === "GAME_DEFAULT_DIFFICULTY") {
                    btn.AddClass("ArcadeDifficultyDefaultBtn");
                }
                const btnLbl = $.CreatePanel("Label", btn, "");
                btnLbl.text = localize(opt.label);
                groupButtons.push(btn);
                let optionConfigValue = index;
                if (configId === "SETTINGS_THEME") {
                    optionConfigValue = Math.round(Number(opt.value));
                    if (!isFinite(optionConfigValue)) optionConfigValue = 0;
                    if (optionConfigValue < 0) optionConfigValue = 0;
                    if (optionConfigValue > 6) optionConfigValue = 6;
                } else if (configId === "LANGUAGE") {
                    optionConfigValue = Math.round(Number(opt.value));
                    if (!isFinite(optionConfigValue)) optionConfigValue = 0;
                    if (optionConfigValue < 0 || optionConfigValue > 14) optionConfigValue = 0;
                }
                const updateBtn = () => {
                    btn.SetHasClass("Active", modCfg[configId] === optionConfigValue);
                };
                updateBtn();
                buttonGroupRefreshFns.push(updateBtn);
                btn.SetPanelEvent("onactivate", () => {
                    modCfg[configId] = optionConfigValue;
                    for (let i = 0; i < buttonGroupRefreshFns.length; i++) {
                        try { buttonGroupRefreshFns[i](); } catch (eGroupRefresh) {
                            warnLog("settings", "op failed: " + (eGroupRefresh && eGroupRefresh.message ? eGroupRefresh.message : String(eGroupRefresh || "")));
                        }
                    }
                    saveAndSync();
                    refreshRowChangedState();
                    if (configId === "LANGUAGE") {
                        const rootPanel = $.GetContextPanel();
                        const tabBar = rootPanel ? rootPanel.FindChildTraverse("SettingsTabBar") : null;
                        const settingsList = rootPanel ? rootPanel.FindChildTraverse("SettingsList") : null;
                        if (typeof InvalidateSearchSectionIndexCache === "function") InvalidateSearchSectionIndexCache();
                        else if (typeof globalThis.InvalidateSearchSectionIndexCache === "function") globalThis.InvalidateSearchSectionIndexCache();
                        if (typeof SyncTabActiveStates === "function") SyncTabActiveStates(tabBar);
                        else if (typeof globalThis.SyncTabActiveStates === "function") globalThis.SyncTabActiveStates(tabBar);
                        if (settingsList && settingsList.IsValid && settingsList.IsValid()) {
                            requestSettingsListRefresh(0, false);
                        }
                    } else if (configId === "SETTINGS_THEME") {
                        const applyTheme = (typeof ApplySettingsThemeClasses === "function")
                            ? ApplySettingsThemeClasses
                            : (typeof globalThis.ApplySettingsThemeClasses === "function" ? globalThis.ApplySettingsThemeClasses : (Q.ui && Q.ui.theme && Q.ui.theme.ApplySettingsThemeClasses));
                        if (typeof applyTheme === "function") applyTheme(null);
                        requestSettingsListRefresh(0, false);
                    }
                });
            });
            syncRowVisualState = () => {
                if (!row || !row.IsValid || !row.IsValid()) return false;
                for (let br = 0; br < buttonGroupRefreshFns.length; br++) {
                    const buttonRefreshFn = buttonGroupRefreshFns[br];
                    if (typeof buttonRefreshFn !== "function") continue;
                    try { buttonRefreshFn(); } catch (eBtn) {
                        warnLog("settings", "op failed: " + (eBtn && eBtn.message ? eBtn.message : String(eBtn || "")));
                    }
                }
                refreshRowChangedState();
                return true;
            };
        } else if (type === "palette" && Array.isArray(options)) {
            row.AddClass("PalettePickerRow");
            const paletteGroup = $.CreatePanel("Panel", row, "");
            paletteGroup.AddClass("SettingControlRoot");
            paletteGroup.AddClass("PalettePickerGroup");
            const paletteButtons = [];
            const paletteRefreshFns = [];
            const sanitizePaletteValue = (value) => {
                let numeric = Math.round(Number(value));
                if (!isFinite(numeric)) numeric = 0;
                if (numeric < 0) numeric = 0;
                if (numeric > 29) numeric = 29;
                return numeric;
            };
            const buildPaletteTooltip = (opt) => {
                const name = localize((opt && opt.label) ? opt.label : "Default", true);
                if (!opt || !opt.hex) return name + " - " + localize("No color wash", true);
                return name + " - " + String(opt.hex);
            };
            let paletteRowPanel = null;
            options.forEach((opt, optIndex) => {
                if (!opt) return;
                if (!paletteRowPanel || (optIndex % 10) === 0) {
                    paletteRowPanel = $.CreatePanel("Panel", paletteGroup, "");
                    paletteRowPanel.AddClass("PalettePickerSwatchRow");
                }
                const value = sanitizePaletteValue(opt.value);
                const swatch = $.CreatePanel("Button", paletteRowPanel, "");
                swatch.AddClass("PalettePickerSwatch");
                if (value === 0) swatch.AddClass("PalettePickerSwatchDefault");
                const colorChip = $.CreatePanel("Panel", swatch, "");
                colorChip.AddClass("PalettePickerSwatchChip");
                if (opt.hex) {
                    try { colorChip.style.backgroundColor = String(opt.hex); } catch (eColor) {
                        warnLog("settings", "op failed: " + (eColor && eColor.message ? eColor.message : String(eColor || "")));
                    }
                    try { colorChip.style.border = "1px solid rgba(255, 255, 255, 0.28)"; } catch (eBorder) {
                        warnLog("settings", "op failed: " + (eBorder && eBorder.message ? eBorder.message : String(eBorder || "")));
                    }
                } else {
                    colorChip.AddClass("PalettePickerSwatchChipDefault");
                }
                const activeDot = $.CreatePanel("Panel", swatch, "");
                activeDot.AddClass("PalettePickerSwatchActiveDot");
                const updateSwatch = () => {
                    const active = sanitizePaletteValue(modCfg[configId]) === value;
                    swatch.SetHasClass("Active", active);
                };
                updateSwatch();
                paletteRefreshFns.push(updateSwatch);
                paletteButtons.push(swatch);
                swatch.SetPanelEvent("onmouseover", () => {
                    hideCustomRowTooltip();
                    getTooltip().hideTextTooltip();
                    getTooltip().cancelHide();
                    getTooltip().showRowTooltip(
                        swatch,
                        "",
                        buildPaletteTooltip(opt),
                        PERF_IMPACT_TIER_NONE,
                        ""
                    );
                });
                swatch.SetPanelEvent("onmouseout", () => {
                    getTooltip().hideTooltipDeferred("palette_swatch_mouseout");
                });
                swatch.SetPanelEvent("onactivate", () => {
                    modCfg[configId] = value;
                    publishPaletteColorBridge(configId, value);
                    for (let pi = 0; pi < paletteRefreshFns.length; pi++) {
                        try { paletteRefreshFns[pi](); } catch (eRefresh) {
                            warnLog("settings", "op failed: " + (eRefresh && eRefresh.message ? eRefresh.message : String(eRefresh || "")));
                        }
                    }
                    saveAndSync();
                    refreshRowChangedState();
                    getPreview().showForConfigId(configId);
                });
            });
            syncRowVisualState = () => {
                if (!row || !row.IsValid || !row.IsValid()) return false;
                modCfg[configId] = sanitizePaletteValue(modCfg[configId]);
                for (let pr = 0; pr < paletteRefreshFns.length; pr++) {
                    try { paletteRefreshFns[pr](); } catch (ePaletteRefresh) {
                        warnLog("settings", "op failed: " + (ePaletteRefresh && ePaletteRefresh.message ? ePaletteRefresh.message : String(ePaletteRefresh || "")));
                    }
                }
                refreshRowChangedState();
                return true;
            };
        } else if (type === "dropdown" && Array.isArray(options)) {
            const dropdownId = String(configId || "dropdown") + "_dropdown";
            let dropdownParent = row;
            let defaultHeroIconPanel = null;
            let languageIconPanel = null;
            if (configId === "VOICE_TYPE") {
                const voiceControlGroup = $.CreatePanel("Panel", row, "VoiceDropdownControlGroup");
                voiceControlGroup.AddClass("SettingControlRoot");
                voiceControlGroup.AddClass("VoiceDropdownControlGroup");
                dropdownParent = voiceControlGroup;
            } else if (configId === "LANGUAGE") {
                const languageControlGroup = $.CreatePanel("Panel", row, "LanguageDropdownControlGroup");
                languageControlGroup.AddClass("SettingControlRoot");
                languageControlGroup.AddClass("LanguageDropdownControlGroup");
                languageIconPanel = $.CreatePanel("Image", languageControlGroup, "LanguageDropdownIcon");
                languageIconPanel.AddClass("LanguageDropdownIcon");
                dropdownParent = languageControlGroup;
            } else if (configId === "DEFAULT_HERO") {
                const defaultHeroControlGroup = $.CreatePanel("Panel", row, "DefaultHeroDropdownControlGroup");
                defaultHeroControlGroup.AddClass("SettingControlRoot");
                defaultHeroControlGroup.AddClass("DefaultHeroDropdownControlGroup");
                defaultHeroIconPanel = $.CreatePanel("Image", defaultHeroControlGroup, "DefaultHeroDropdownHeroIcon");
                defaultHeroIconPanel.AddClass("DefaultHeroDropdownHeroIcon");
                dropdownParent = defaultHeroControlGroup;
            }
            const dropdown = $.CreatePanel("DropDown", dropdownParent, dropdownId);
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
            const syncDefaultHeroIcon = (heroValue) => {
                if (!defaultHeroIconPanel || !defaultHeroIconPanel.IsValid || !defaultHeroIconPanel.IsValid()) return;
                try { defaultHeroIconPanel.SetImage(getDefaultHeroIconPath(heroValue)); } catch (eHeroIcon) {
                    warnLog("settings", "op failed: " + (eHeroIcon && eHeroIcon.message ? eHeroIcon.message : String(eHeroIcon || "")));
                }
            };
            const syncLanguageIcon = (languageValue) => {
                if (!languageIconPanel || !languageIconPanel.IsValid || !languageIconPanel.IsValid()) return;
                try { languageIconPanel.SetImage(getLanguageIconPath(languageValue)); } catch (eLanguageIcon) {
                    warnLog("settings", "op failed: " + (eLanguageIcon && eLanguageIcon.message ? eLanguageIcon.message : String(eLanguageIcon || "")));
                }
            };

            const valueByOptionId = {};
            const optionIdByValueKey = {};
            let selectedOptionId = "";
            const selectedConfigValue = modCfg[configId];
            const selectedConfigValueKey = String(selectedConfigValue === undefined || selectedConfigValue === null ? "" : selectedConfigValue);
            let suppressNextDropdownSubmit = false;

            for (let oi = 0; oi < options.length; oi++) {
                const opt = options[oi] || {};
                const optionValue = (opt.value !== undefined && opt.value !== null)
                    ? opt.value
                    : String(opt.label || "");
                const optionValueKey = String(optionValue === undefined || optionValue === null ? "" : optionValue);
                if (!optionValueKey || optionValueKey.length === 0) continue;
                const optionId = String(configId || "dropdown") + "_opt_" + String(oi);
                const optionPanel = $.CreatePanel("Label", dropdown, optionId);
                optionPanel.AddClass("QOLSettingsDropDownItem");
                optionPanel.AddClass("DropDownChild");
                if (configId === "DEFAULT_HERO") {
                    optionPanel.AddClass("DefaultHeroDropDownItem");
                    try { optionPanel.style.backgroundImage = 'url("' + getDefaultHeroIconPath(optionValueKey) + '")'; } catch (eBgImg) {
                        warnLog("settings", "op failed: " + (eBgImg && eBgImg.message ? eBgImg.message : String(eBgImg || "")));
                    }
                    try { optionPanel.style.backgroundRepeat = "no-repeat"; } catch (eBgRepeat) {
                        warnLog("settings", "op failed: " + (eBgRepeat && eBgRepeat.message ? eBgRepeat.message : String(eBgRepeat || "")));
                    }
                    try { optionPanel.style.backgroundPosition = "10px 50%"; } catch (eBgPos) {
                        warnLog("settings", "op failed: " + (eBgPos && eBgPos.message ? eBgPos.message : String(eBgPos || "")));
                    }
                    try { optionPanel.style.backgroundSize = "18px 18px"; } catch (eBgSize) {
                        warnLog("settings", "op failed: " + (eBgSize && eBgSize.message ? eBgSize.message : String(eBgSize || "")));
                    }
                } else if (configId === "LANGUAGE") {
                    optionPanel.AddClass("LanguageDropDownItem");
                    try { optionPanel.style.backgroundImage = 'url("' + getLanguageIconPath(optionValueKey) + '")'; } catch (eLangBgImg) {
                        warnLog("settings", "op failed: " + (eLangBgImg && eLangBgImg.message ? eLangBgImg.message : String(eLangBgImg || "")));
                    }
                    try { optionPanel.style.backgroundRepeat = "no-repeat"; } catch (eLangBgRepeat) {
                        warnLog("settings", "op failed: " + (eLangBgRepeat && eLangBgRepeat.message ? eLangBgRepeat.message : String(eLangBgRepeat || "")));
                    }
                    try { optionPanel.style.backgroundPosition = "10px 50%"; } catch (eLangBgPos) {
                        warnLog("settings", "op failed: " + (eLangBgPos && eLangBgPos.message ? eLangBgPos.message : String(eLangBgPos || "")));
                    }
                    try { optionPanel.style.backgroundSize = "18px 18px"; } catch (eLangBgSize) {
                        warnLog("settings", "op failed: " + (eLangBgSize && eLangBgSize.message ? eLangBgSize.message : String(eLangBgSize || "")));
                    }
                    ((optionIdRef, optionValueRef) => {
                        optionPanel.SetPanelEvent("onactivate", () => {
                            suppressNextDropdownSubmit = true;
                            selectedOptionId = optionIdRef;
                            $.Schedule(0, () => {
                                commitDropdownSelection(optionValueRef);
                            });
                        });
                    })(optionId, optionValue);
                }

                const localizeOptionLabel = (configId !== "DEFAULT_HERO" && configId !== "VOICE_TYPE" && configId !== "LANGUAGE");
                const optionLabelText = String(opt.label !== undefined && opt.label !== null ? opt.label : optionValueKey);
                optionPanel.text = localizeOptionLabel ? localize(optionLabelText, true) : optionLabelText;
                if (optionPanel.SetAttributeString) {
                    optionPanel.SetAttributeString("data_value", optionValueKey);
                }

                if (configId === "VOICE_TYPE") {
                    ((optionPanelRef, optionValueRef, rowAnchorRef) => {
                        const customSlotIndex = (Q.ui && Q.ui.audio && typeof Q.ui.audio.getCustomAnnouncerSlotIndexFromOptionValue === "function")
                            ? Q.ui.audio.getCustomAnnouncerSlotIndexFromOptionValue(optionValueRef)
                            : (typeof globalThis.GetCustomAnnouncerSlotIndexFromOptionValue === "function" ? globalThis.GetCustomAnnouncerSlotIndexFromOptionValue(optionValueRef) : 0);
                        if (customSlotIndex <= 0) return;
                        optionPanelRef.SetPanelEvent("onmouseover", () => {
                            getTooltip().hideTextTooltip();
                            getTooltip().cancelHide();
                            const hoverInfo = (Q.ui && Q.ui.audio && typeof Q.ui.audio.buildCustomAnnouncerSlotMetadataHoverInfo === "function")
                                ? Q.ui.audio.buildCustomAnnouncerSlotMetadataHoverInfo(customSlotIndex)
                                : (typeof globalThis.BuildCustomAnnouncerSlotMetadataHoverInfo === "function" ? globalThis.BuildCustomAnnouncerSlotMetadataHoverInfo(customSlotIndex) : null);
                            getTooltip().showRowTooltip(
                                rowAnchorRef,
                                "",
                                "",
                                PERF_IMPACT_TIER_NONE,
                                "",
                                { voiceMeta: hoverInfo }
                            );
                        });
                        optionPanelRef.SetPanelEvent("onmouseout", () => {
                            getTooltip().hideTooltipDeferred("voice_dropdown_option_mouseout");
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

            let firstOptionId = "";
            for (const optionKey in valueByOptionId) {
                firstOptionId = optionKey;
                break;
            }
            if (!selectedOptionId) selectedOptionId = firstOptionId;
            if (selectedOptionId) {
                try { dropdown.SetSelected(selectedOptionId); } catch (e0) {
                    warnLog("settings", "op failed: " + (e0 && e0.message ? e0.message : String(e0 || "")));
                }
                if (modCfg[configId] === undefined || modCfg[configId] === null || modCfg[configId] === "") {
                    modCfg[configId] = valueByOptionId[selectedOptionId];
                }
            }
            if (configId === "DEFAULT_HERO") {
                syncDefaultHeroIcon(modCfg[configId]);
            } else if (configId === "LANGUAGE") {
                syncLanguageIcon(modCfg[configId]);
            }

            let dropdownSyncMute = false;
            const commitDropdownSelection = (forcedValue) => {
                if (dropdownSyncMute) return;
                if (suppressNextDropdownSubmit && (forcedValue === undefined || forcedValue === null || String(forcedValue).length <= 0)) {
                    suppressNextDropdownSubmit = false;
                    return;
                }
                let selectedValue;
                let hasSelectedValue = false;
                if (forcedValue !== undefined && forcedValue !== null && String(forcedValue).length > 0) {
                    selectedValue = forcedValue;
                    hasSelectedValue = true;
                } else {
                    let selectedPanel = null;
                    try { selectedPanel = dropdown.GetSelected ? dropdown.GetSelected() : null; } catch (e1) { selectedPanel = null; }
                    if (selectedPanel) {
                        let selectedId = "";
                        try { selectedId = selectedPanel.id ? String(selectedPanel.id) : ""; } catch (e2) { selectedId = ""; }
                        if (selectedId) selectedOptionId = selectedId;
                        if (selectedId && Object.prototype.hasOwnProperty.call(valueByOptionId, selectedId)) {
                            selectedValue = valueByOptionId[selectedId];
                            hasSelectedValue = true;
                        }
                        if (!hasSelectedValue && selectedPanel.GetAttributeString) {
                            try { selectedValue = String(selectedPanel.GetAttributeString("data_value", "") || ""); } catch (e3) { selectedValue = ""; }
                            hasSelectedValue = (selectedValue !== undefined && selectedValue !== null && String(selectedValue).length > 0);
                        }
                    }
                }
                if (!hasSelectedValue && selectedOptionId && Object.prototype.hasOwnProperty.call(valueByOptionId, selectedOptionId)) {
                    selectedValue = valueByOptionId[selectedOptionId];
                    hasSelectedValue = true;
                }
                if (!hasSelectedValue) return;

                const currentValue = modCfg[configId];
                if (typeof currentValue === "number") {
                    const asNumber = Number(selectedValue);
                    if (!isFinite(asNumber)) return;
                    selectedValue = Math.round(asNumber);
                }

                let selectionChanged = String(currentValue === undefined || currentValue === null ? "" : currentValue) !==
                    String(selectedValue === undefined || selectedValue === null ? "" : selectedValue);
                if (configId === "DEFAULT_HERO") {
                    applyDefaultHeroSelection(String(selectedValue || ""));
                } else if (configId === "HEALTHBAR_TYPE") {
                    const previousTypeValue = currentValue;
                    applyHealthbarTypeSelection(selectedValue);
                    selectedValue = modCfg.HEALTHBAR_TYPE;
                    selectionChanged = String(previousTypeValue === undefined || previousTypeValue === null ? "" : previousTypeValue) !==
                        String(selectedValue === undefined || selectedValue === null ? "" : selectedValue);
                }
                if (selectionChanged) {
                    modCfg[configId] = selectedValue;
                    saveAndSync();
                    refreshRowChangedState();
                    if (configId === "DEFAULT_HERO") {
                        syncDefaultHeroIcon(selectedValue);
                    } else if (configId === "LANGUAGE") {
                        syncLanguageIcon(selectedValue);
                    }
                    if (configId === "LANGUAGE") {
                        const rootPanel = $.GetContextPanel();
                        const tabBar = rootPanel ? rootPanel.FindChildTraverse("SettingsTabBar") : null;
                        const settingsList = rootPanel ? rootPanel.FindChildTraverse("SettingsList") : null;
                        if (typeof InvalidateSearchSectionIndexCache === "function") InvalidateSearchSectionIndexCache();
                        else if (typeof globalThis.InvalidateSearchSectionIndexCache === "function") globalThis.InvalidateSearchSectionIndexCache();
                        if (typeof SyncTabActiveStates === "function") SyncTabActiveStates(tabBar);
                        else if (typeof globalThis.SyncTabActiveStates === "function") globalThis.SyncTabActiveStates(tabBar);
                        if (settingsList && settingsList.IsValid && settingsList.IsValid()) {
                            requestSettingsListRefresh(0, false);
                        }
                    }
                } else if (configId === "DEFAULT_HERO") {
                    syncDefaultHeroIcon(selectedValue);
                }
            };

            if (configId === "LANGUAGE") {
                dropdown.SetPanelEvent("oninputsubmit", () => {});
            } else {
                dropdown.SetPanelEvent("oninputsubmit", commitDropdownSelection);
            }

            if (configId === "VOICE_TYPE" && dropdownParent && dropdownParent.IsValid && dropdownParent.IsValid()) {
                const voiceTestBtn = $.CreatePanel("Button", dropdownParent, "VoiceDropdownTestBtn");
                voiceTestBtn.AddClass("SectionTitleActionBtn");
                voiceTestBtn.AddClass("VoiceDropdownTestBtn");

                const voiceTestIcon = $.CreatePanel("Image", voiceTestBtn, "VoiceDropdownTestBtnIcon", {
                    src: "s2r://panorama/images/icons/icon_sound_on.vsvg",
                    defaultsrc: "",
                    scaling: "contain"
                });
                voiceTestIcon.AddClass("SectionTitleActionIcon");

                const voiceTestLabel = $.CreatePanel("Label", voiceTestBtn, "VoiceDropdownTestBtnLabel");
                voiceTestLabel.AddClass("SectionTitleActionLabel");
                voiceTestLabel.text = "";

                const voiceTestTooltipText = localize("Play current announcer voice.", true);
                voiceTestBtn.SetPanelEvent("onmouseover", () => {
                    getTooltip().hideTextTooltip();
                    getTooltip().cancelHide();
                    getTooltip().showRowTooltip(
                        voiceTestBtn,
                        "",
                        voiceTestTooltipText,
                        PERF_IMPACT_TIER_NONE,
                        ""
                    );
                });
                voiceTestBtn.SetPanelEvent("onmouseout", () => {
                    getTooltip().hideTooltipDeferred("voice_test_btn_mouseout");
                });
                voiceTestBtn.SetPanelEvent("onactivate", () => {
                    playAnnouncerPreviewSound();
                    voiceTestBtn.AddClass("SuccessState");
                    $.Schedule(0.28, () => {
                        if (voiceTestBtn && voiceTestBtn.IsValid && voiceTestBtn.IsValid()) {
                            voiceTestBtn.RemoveClass("SuccessState");
                        }
                    });
                });
            }

            syncRowVisualState = () => {
                if (!row || !row.IsValid || !row.IsValid()) return false;
                const currentValueKey = String(modCfg[configId] === undefined || modCfg[configId] === null ? "" : modCfg[configId]);
                const targetOptionId = optionIdByValueKey[currentValueKey] || firstOptionId;
                if (targetOptionId) {
                    selectedOptionId = targetOptionId;
                    dropdownSyncMute = true;
                    try { dropdown.SetSelected(targetOptionId); } catch (eSel) {
                        warnLog("settings", "op failed: " + (eSel && eSel.message ? eSel.message : String(eSel || "")));
                    }
                    dropdownSyncMute = false;
                }
                if (configId === "DEFAULT_HERO") {
                    syncDefaultHeroIcon(modCfg[configId]);
                } else if (configId === "LANGUAGE") {
                    syncLanguageIcon(modCfg[configId]);
                }
                refreshRowChangedState();
                return true;
            };
        } else if (type === "preset" && Array.isArray(options)) {
            const group = $.CreatePanel("Panel", row, "");
            group.AddClass("SettingButtonGroup");
            group.AddClass("SettingControlRoot");
            options.forEach((opt) => {
                const btn = $.CreatePanel("Button", group, "");
                btn.AddClass("SegmentBtn");
                const btnLbl = $.CreatePanel("Label", btn, "");
                btnLbl.text = opt.label;
                btn.SetPanelEvent("onactivate", () => {
                    const presetList = (typeof PRESETS !== "undefined" && PRESETS) ? PRESETS : ((typeof globalThis !== "undefined" && (globalThis.QOL_PRESETS || globalThis.PRESETS)) ? (globalThis.QOL_PRESETS || globalThis.PRESETS) : {});
                    const presetData = opt.label === "Default" ? getDefaultConfig() : presetList[opt.label];
                    const applyPreset = globalThis.ApplyPresetConfig || (Q.ui && Q.ui.presets && Q.ui.presets.applyPresetConfig);
                    if (applyPreset && presetData && applyPreset(presetData)) {
                        saveAndSync();
                        btn.AddClass("SuccessState");
                        $.Schedule(0.28, () => {
                            if (btn.IsValid()) btn.RemoveClass("SuccessState");
                            requestSettingsListSoftRefresh(0);
                        });
                    }
                });
            });
        } else if (type === "actionbutton") {
            const actionConfig = (Array.isArray(options) && options.length > 0) ? options[0] : {};
            const isArcadePlayAction = (
                configId === "OPEN_MINESWEEPER" ||
                configId === "OPEN_FLAPPY_BIRD" ||
                configId === "OPEN_AIM_TRAINER" ||
                configId === "OPEN_TRAIN_TRACKING" ||
                configId === "OPEN_WHACK_A_REM" ||
                configId === "OPEN_BLACKJACK"
            );
            const actionGroup = $.CreatePanel("Panel", row, "");
            actionGroup.AddClass("SettingActionGroup");
            actionGroup.AddClass("SettingControlRoot");
            if (configId === "OPEN_OLD_ITEM_FILTERS_DOWNLOAD") {
                actionGroup.AddClass("OptimizeFiltersActionGroup");
            }
            if (isArcadePlayAction) {
                actionGroup.AddClass("ArcadePlayActionGroup");
            }

            const actionBtn = $.CreatePanel("Button", actionGroup, "");
            actionBtn.AddClass("SettingActionBtn");
            if (configId === "OPEN_OLD_ITEM_FILTERS_DOWNLOAD") {
                actionBtn.AddClass("OptimizeFiltersActionBtn");
            }
            if (isArcadePlayAction) {
                actionBtn.AddClass("ArcadePlayActionBtn");
            } else if (configId === "TEST_SKYRUNNER") {
                actionBtn.AddClass("TestSkyrunnerActionBtn");
            }
            const actionInner = $.CreatePanel("Panel", actionBtn, "");
            actionInner.AddClass("SettingActionBtnInner");

            const iconSrc = actionConfig.icon || "";
            if (iconSrc !== "") {
                const actionIcon = $.CreatePanel("Image", actionInner, "", {
                    src: iconSrc,
                    defaultsrc: "",
                    scaling: "contain"
                });
                actionIcon.AddClass("SettingActionBtnIcon");
            }

            const actionLbl = $.CreatePanel("Label", actionInner, "");
            actionLbl.AddClass("SettingActionBtnLabel");
            actionLbl.text = localize(actionConfig.label || "Test");

            if (isArcadePlayAction && actionConfig.onDeathCheckbox) {
                let onDeathConfigKey = String(actionConfig.onDeathConfigKey || "");
                if (!onDeathConfigKey) onDeathConfigKey = "ENABLE_ON_DEATH_GAMES";
                const onDeathToggleBtn = $.CreatePanel("ToggleButton", actionGroup, "");
                onDeathToggleBtn.AddClass("CitadelSettingsCheckbox");
                onDeathToggleBtn.AddClass("MultiCheckboxBtn");
                onDeathToggleBtn.AddClass("ArcadeOnDeathCheckBtn");

                const onDeathLbl = $.CreatePanel("Label", onDeathToggleBtn, "");
                onDeathLbl.AddClass("MultiCheckboxLabel");
                onDeathLbl.AddClass("ArcadeOnDeathCheckLabel");
                onDeathLbl.text = localize("Play When On Death Enabled");

                const syncOnDeathToggleVisual = () => {
                    if (!onDeathToggleBtn || !onDeathToggleBtn.IsValid || !onDeathToggleBtn.IsValid()) return false;
                    const enabled = (Number(modCfg[onDeathConfigKey]) === 1);
                    try { onDeathToggleBtn.SetSelected(enabled); } catch (eSel0) {
                        warnLog("settings", "op failed: " + (eSel0 && eSel0.message ? eSel0.message : String(eSel0 || "")));
                    }
                    onDeathToggleBtn.SetHasClass("selected", enabled);
                    onDeathToggleBtn.SetHasClass("IsSelected", enabled);
                    onDeathToggleBtn.SetHasClass("Active", enabled);
                    return true;
                };
                syncOnDeathToggleVisual();
                getArcadeOnDeathSyncFns().push(syncOnDeathToggleVisual);

                onDeathToggleBtn.SetPanelEvent("onactivate", () => {
                    modCfg[onDeathConfigKey] = (Number(modCfg[onDeathConfigKey]) === 1) ? 0 : 1;
                    saveAndSync();
                    const deathFns = getArcadeOnDeathSyncFns();
                    for (let iSync = deathFns.length - 1; iSync >= 0; iSync--) {
                        const syncFn = deathFns[iSync];
                        let keep = true;
                        if (typeof syncFn !== "function") {
                            keep = false;
                        } else {
                            try { keep = (syncFn() !== false); } catch (eSync) { keep = false; }
                        }
                        if (!keep) deathFns.splice(iSync, 1);
                    }
                });
            }

            if (actionConfig.tooltip) {
                const localizedTooltip = localize(actionConfig.tooltip);
                actionBtn.SetPanelEvent("onmouseover", () => {
                    $.DispatchEvent("UIShowTextTooltip", actionBtn, localizedTooltip);
                });
                actionBtn.SetPanelEvent("onmouseout", () => {
                    $.DispatchEvent("UIHideTextTooltip");
                });
            }

            actionBtn.SetPanelEvent("onactivate", () => {
                let handled = false;
                if (configId === "PREVIEW_ANNOUNCER") {
                    playAnnouncerPreviewSound();
                    handled = true;
                } else if (configId === "OPEN_MINESWEEPER") {
                    getArcade().openMinesweeper();
                    handled = true;
                } else if (configId === "OPEN_FLAPPY_BIRD") {
                    getArcade().openFlappy();
                    handled = true;
                } else if (configId === "OPEN_AIM_TRAINER") {
                    getArcade().openAimTrainer();
                    handled = true;
                } else if (configId === "OPEN_TRAIN_TRACKING") {
                    getArcade().openTrainTracking();
                    handled = true;
                } else if (configId === "OPEN_WHACK_A_REM") {
                    getArcade().openWhackRem();
                    handled = true;
                } else if (configId === "OPEN_BLACKJACK") {
                    getArcade().openBlackjack();
                    handled = true;
                } else if (configId === "TEST_SKYRUNNER") {
                    handled = applyDefaultHeroSelection("hero_skyrunner");
                    if (handled) {
                        setLocalizedConfigFeedbackMessage("Skyrunner switch sent.", "success", 1400);
                    } else {
                        setLocalizedConfigFeedbackMessage("Failed to switch hero.", "error", 1800);
                        actionBtn.AddClass("FailureState");
                        $.Schedule(0.35, () => {
                            if (actionBtn && actionBtn.IsValid && actionBtn.IsValid()) actionBtn.RemoveClass("FailureState");
                        });
                    }
                } else if (configId === "OPEN_OLD_ITEM_FILTERS_DOWNLOAD") {
                    $.DispatchEvent("ExternalBrowserGoToURL", "https://gamebanana.com/mods/601444");
                    handled = true;
                } else if (configId && configId.indexOf("SEARCH_PRESET:") === 0) {
                    const presetName = configId.slice("SEARCH_PRESET:".length);
                    const applyPresetName = globalThis.ApplyPresetByName || (Q.ui && Q.ui.presets && Q.ui.presets.applyPresetByName);
                    handled = applyPresetName ? applyPresetName(presetName) : false;
                } else if (configId === "OPEN_COMMISSIONS") {
                    $.DispatchEvent("ExternalBrowserGoToURL", "https://ko-fi.com/civocivocivo/commissions");
                    handled = true;
                } else if (configId && configId.indexOf("SEARCH_TAB:") === 0) {
                    const targetTab = configId.slice("SEARCH_TAB:".length);
                    if (targetTab) {
                        const rootPanel = $.GetContextPanel();
                        if (typeof ClearSettingsSearchQuery === "function") ClearSettingsSearchQuery(rootPanel);
                        else if (typeof globalThis.ClearSettingsSearchQuery === "function") globalThis.ClearSettingsSearchQuery(rootPanel);
                        if (getCurrentTab() === targetTab) {
                            const settingsList = rootPanel ? rootPanel.FindChildTraverse("SettingsList") : null;
                            if (settingsList && settingsList.IsValid && settingsList.IsValid()) {
                                requestSettingsListRefresh(0, false);
                            }
                        } else {
                            if (typeof SetActiveTabAndRefresh === "function") SetActiveTabAndRefresh(targetTab);
                            else if (typeof globalThis.SetActiveTabAndRefresh === "function") globalThis.SetActiveTabAndRefresh(targetTab);
                            else if (Q.ui && Q.ui.window && typeof Q.ui.window.setActiveTab === "function") Q.ui.window.setActiveTab(targetTab);
                        }
                        handled = true;
                    }
                }
                if (!handled) return;
                actionBtn.AddClass("SuccessState");
                $.Schedule(0.28, () => {
                    if (actionBtn.IsValid()) actionBtn.RemoveClass("SuccessState");
                });
            });
        } else if (type === "runtime_toggle") {
            const runtimeConfig = (Array.isArray(options) && options.length > 0) ? options[0] : {};
            const runtimeKey = runtimeConfig.key || configId || label || "runtime_toggle";
            const toggleState = getRuntimeToggleState();
            if (!Object.prototype.hasOwnProperty.call(toggleState, runtimeKey)) {
                toggleState[runtimeKey] = false;
            }
            const runtimeBtn = $.CreatePanel("Panel", row, "");
            runtimeBtn.AddClass("SettingToggleBtn");
            runtimeBtn.AddClass("SettingControlRoot");
            const runtimeSwitchButton = $.CreatePanel("Button", runtimeBtn, "");
            runtimeSwitchButton.AddClass("SwitchButton");
            const runtimeHandle = $.CreatePanel("Panel", runtimeSwitchButton, "handle");
            runtimeHandle.AddClass("SettingToggleHandle");
            const setRuntimeSwitchState = (isOn) => {
                runtimeBtn.SetHasClass("ToggleActive", isOn === true);
                runtimeBtn.SetHasClass("ToggleOn", isOn === true);
                runtimeBtn.SetHasClass("ToggleOff", isOn !== true);
            };
            const updateRuntimeBtn = () => {
                setRuntimeSwitchState(toggleState[runtimeKey] === true);
            };
            updateRuntimeBtn();
            const activateRuntimeToggle = () => {
                const nextState = !toggleState[runtimeKey];
                toggleState[runtimeKey] = nextState;
                updateRuntimeBtn();
                const commandToRun = nextState ? runtimeConfig.onCommand : runtimeConfig.offCommand;
                runConsoleCommandBestEffort(commandToRun || "");
            };
            runtimeSwitchButton.SetPanelEvent("onactivate", activateRuntimeToggle);
            syncRowVisualState = () => {
                if (!row || !row.IsValid || !row.IsValid()) return false;
                updateRuntimeBtn();
                refreshRowChangedState();
                return true;
            };
        } else {
            let toggleConfig = null;
            if (Array.isArray(options) && options.length > 0 && options[0] && typeof options[0] === "object") {
                toggleConfig = options[0];
            } else if (options && typeof options === "object") {
                toggleConfig = options;
            }
            const invertToggle = !!(toggleConfig && toggleConfig.invert === true);
            const getToggleIsActive = () => {
                const baseState = (modCfg[configId] === 1);
                return invertToggle ? !baseState : baseState;
            };
            const initialToggleActive = getToggleIsActive();
            const btn = $.CreatePanel("Panel", row, "");
            btn.AddClass("SettingToggleBtn");
            btn.AddClass("SettingControlRoot");
            const setSwitchState = (isOn) => {
                btn.SetHasClass("ToggleActive", isOn === true);
                btn.SetHasClass("ToggleOn", isOn === true);
                btn.SetHasClass("ToggleOff", isOn !== true);
            };
            setSwitchState(initialToggleActive);
            const switchButton = $.CreatePanel("Button", btn, "");
            switchButton.AddClass("SwitchButton");
            const handlePanel = $.CreatePanel("Panel", switchButton, "handle");
            handlePanel.AddClass("SettingToggleHandle");
            const update = () => { setSwitchState(getToggleIsActive()); };
            if (!getSearchResultRenderMode()) update();

            const activateToggle = () => {
                const nextActive = !getToggleIsActive();
                modCfg[configId] = invertToggle ? (nextActive ? 0 : 1) : (nextActive ? 1 : 0);
                update();
                if (configId === "PREVIEWS_ENABLED" && modCfg[configId] !== 1) {
                    getPreview().hideAll();
                }
                if (configId === "DRAG_ENABLED") {
                    const settingsWindow = $.GetContextPanel().FindChildTraverse("SettingsWindow");
                    if (settingsWindow && settingsWindow.IsValid && settingsWindow.IsValid()) {
                        const setupDrag = globalThis.SetupSettingsWindowDragging || (Q.ui && Q.ui.drag && Q.ui.drag.setupSettingsWindowDragging);
                        if (typeof setupDrag === "function") {
                            setupDrag(settingsWindow.FindChildTraverse("SettingsHeader"), settingsWindow);
                        }
                    }
                }
                saveAndSync();
                refreshRowChangedState();
                if (configId === "ENABLE_OLD_ITEM_COOLDOWNS") {
                    requestSettingsListRefresh(0, true);
                }
                getPreview().showForConfigId(configId);
            };
            switchButton.SetPanelEvent("onactivate", activateToggle);
            syncRowVisualState = () => {
                if (!row || !row.IsValid || !row.IsValid()) return false;
                update();
                refreshRowChangedState();
                return true;
            };
        }

        registerSettingsListRowSync(() => syncRowVisualState());
        return row;
    }

    function createInlineSecondaryCheckboxToggleRow(parent, label, configId, secondaryLabel, secondaryConfigId, description, secondaryDescription, rowOptions) {
        rowOptions = rowOptions || {};
        const invertMain = rowOptions && rowOptions.invert === true;
        const localizedLabel = localize(label || "");
        const effectiveDescription = getTooltip().getSettingDescriptionOverride(
            configId,
            label,
            description || "",
            getTooltip().getCurrentCategoryKey()
        );
        const localizedDescription = localize(effectiveDescription || "");
        const hasRowDescription = !!(effectiveDescription && effectiveDescription !== "" && localizedDescription && localizedDescription !== "");
        const mainPerfInfo = getTooltip().buildPerfImpactLine(configId, "toggle", null);
        const secondaryPerfInfo = getTooltip().buildPerfImpactLine(secondaryConfigId, "toggle", null);
        let rowPerfTier = PERF_IMPACT_TIER_NONE;
        if (mainPerfInfo && mainPerfInfo.tier) rowPerfTier = getTooltip().maxPerfTier(rowPerfTier, String(mainPerfInfo.tier));
        if (secondaryPerfInfo && secondaryPerfInfo.tier) rowPerfTier = getTooltip().maxPerfTier(rowPerfTier, String(secondaryPerfInfo.tier));
        const rowCreatedBy = getTooltip().getSettingCreatedBy(configId, label);
        const rowTooltipPerfLine = getTooltip().buildPerfLineForTier(rowPerfTier);
        const rowTooltipDescLine = hasRowDescription ? localizedDescription : "";
        const hasRowTooltip = getTooltip().hasMeaningfulContent(rowPerfTier, rowTooltipDescLine, rowCreatedBy);

        if (getSearchCollectMode() && getSearchCollectState()) {
            const searchInlineOptions = [{
                inlineSecondaryCheckbox: secondaryConfigId || "",
                secondaryLabel: localize(secondaryLabel || ""),
                secondaryDescription: localize(secondaryDescription || ""),
                rowOptions: {
                    invert: invertMain,
                    clearSecondaryWhenDisabled: rowOptions.clearSecondaryWhenDisabled === true
                }
            }];
            getActiveSearchCollectSection().rows.push(buildSearchCollectedRow(
                localizedLabel,
                configId,
                "toggle",
                null,
                null,
                null,
                searchInlineOptions,
                localizedDescription,
                [localize(secondaryLabel || ""), secondaryConfigId || "", secondaryDescription || ""]
            ));
            return null;
        }

        const row = $.CreatePanel("Panel", parent, "");
        if (getSearchResultRenderMode()) row.AddClass("SearchResultRow");
        row.AddClass("SettingRow");
        row.AddClass("RowTypeToggle");
        row.AddClass("InlineSecondaryCheckboxRow");

        const labelContainer = $.CreatePanel("Panel", row, "");
        labelContainer.AddClass("LabelContainer");
        const lbl = $.CreatePanel("Label", labelContainer, "");
        lbl.AddClass("SettingLabel");
        lbl.text = localizedLabel;

        const rowConfigKeys = [];
        if (configId) rowConfigKeys.push(configId);
        if (secondaryConfigId) rowConfigKeys.push(secondaryConfigId);
        if (row && row.SetAttributeString) {
            try { row.SetAttributeString(SETTING_ROW_RESET_KEYS_ATTR, rowConfigKeys.join(",")); } catch (e0) {
                warnLog("settings", "op failed: " + (e0 && e0.message ? e0.message : String(e0 || "")));
            }
        }

        let rowResetBtn = null;
        if (rowConfigKeys.length > 0) {
            rowResetBtn = $.CreatePanel("Button", labelContainer, "");
            rowResetBtn.AddClass("SettingRowResetBtn");
            const rowResetIcon = $.CreatePanel("Image", rowResetBtn, "", {
                src: "s2r://panorama/images/icons/icon_refresh.vsvg",
                defaultsrc: "",
                scaling: "contain"
            });
            rowResetIcon.AddClass("SettingRowResetIcon");
            rowResetIcon.AddClass("QOLResetIcon");
            try { rowResetIcon.SetImage("s2r://panorama/images/icons/icon_refresh.vsvg"); } catch (eImg) {
                warnLog("settings", "op failed: " + (eImg && eImg.message ? eImg.message : String(eImg || "")));
            }
            rowResetBtn.SetPanelEvent("onmouseover", () => {
                getTooltip().hideTextTooltip();
                getTooltip().cancelHide();
                getTooltip().showRowTooltip(
                    rowResetBtn,
                    "",
                    localize("Reset row to defaults", true),
                    PERF_IMPACT_TIER_NONE,
                    ""
                );
            });
            rowResetBtn.SetPanelEvent("onmouseout", () => {
                getTooltip().hideTextTooltip();
                getTooltip().hideTooltipDeferred("row_reset_btn_mouseout");
            });
            rowResetBtn.SetPanelEvent("onactivate", () => {
                const changedCount = applyResetForConfigKeys(rowConfigKeys);
                if (changedCount > 0) {
                    saveAndSync();
                    syncRowVisualState();
                    setConfigFeedbackMessage(isRussianLanguage()
                        ? ("\u0421\u0431\u0440\u043E\u0448\u0435\u043D\u0430 \u0441\u0442\u0440\u043E\u043A\u0430 (" + String(changedCount) + ").")
                        : ("Row reset (" + String(changedCount) + ")."), "success", 1400);
                } else {
                    setConfigFeedbackMessage(isRussianLanguage()
                        ? "\u0421\u0442\u0440\u043E\u043A\u0430 \u0443\u0436\u0435 \u043F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E."
                        : "Row already at defaults.", "info", 1200);
                }
            });
        }

        const refreshRowChangedState = bindRowChangedState(row, labelContainer, rowConfigKeys, rowResetBtn);
        let showCustomRowTooltip = () => {};
        let hideCustomRowTooltip = () => {};
        if (hasRowTooltip) {
            showCustomRowTooltip = () => {
                getTooltip().cancelHide();
                getTooltip().showRowTooltip(row, rowTooltipPerfLine, rowTooltipDescLine, rowPerfTier, rowCreatedBy);
            };
            hideCustomRowTooltip = () => {
                getTooltip().hideTooltipDeferred("row_mouseout");
            };
            row.SetPanelEvent("onmouseover", () => { showCustomRowTooltip(); });
            row.SetPanelEvent("onmouseout", () => { hideCustomRowTooltip(); });
        }

        const controls = $.CreatePanel("Panel", row, "");
        controls.AddClass("SettingControlRoot");
        controls.AddClass("InlineSecondaryCheckboxControls");

        const btn = $.CreatePanel("Panel", controls, "");
        btn.AddClass("SettingToggleBtn");
        btn.AddClass("TogglePrimary");
        const setSwitchState = (isOn) => {
            btn.SetHasClass("ToggleActive", isOn === true);
            btn.SetHasClass("ToggleOn", isOn === true);
            btn.SetHasClass("ToggleOff", isOn !== true);
        };
        const switchButton = $.CreatePanel("Button", btn, "");
        switchButton.AddClass("SwitchButton");
        const handlePanel = $.CreatePanel("Panel", switchButton, "handle");
        handlePanel.AddClass("SettingToggleHandle");

        const checkboxWrap = $.CreatePanel("Panel", controls, "");
        checkboxWrap.AddClass("InlineSecondaryCheckboxWrap");
        const secondaryBtn = $.CreatePanel("Button", checkboxWrap, "");
        secondaryBtn.AddClass("InlineSecondaryCheckboxBtn");
        secondaryBtn.AddClass("CitadelSettingsCheckbox");
        secondaryBtn.AddClass("MultiCheckboxBtn");
        const tickBox = $.CreatePanel("Panel", secondaryBtn, "");
        tickBox.AddClass("TickBox");
        const secondaryLbl = $.CreatePanel("Label", secondaryBtn, "");
        secondaryLbl.AddClass("InlineSecondaryCheckboxLabel");
        secondaryLbl.AddClass("MultiCheckboxLabel");
        secondaryLbl.text = localize(secondaryLabel || "");

        const modCfg = getConfig();

        const update = () => {
            const mainEnabled = invertMain ? (modCfg[configId] !== 1) : (modCfg[configId] === 1);
            const secondaryEnabled = (modCfg[secondaryConfigId] === 1);
            setSwitchState(mainEnabled);
            checkboxWrap.SetHasClass("Disabled", !mainEnabled);
            secondaryBtn.enabled = mainEnabled;
            try { secondaryBtn.SetSelected(secondaryEnabled); } catch (eSel) {}
            secondaryBtn.SetHasClass("selected", secondaryEnabled);
            secondaryBtn.SetHasClass("IsSelected", secondaryEnabled);
            secondaryBtn.SetHasClass("Active", secondaryEnabled);
        };

        switchButton.SetPanelEvent("onactivate", () => {
            modCfg[configId] = (modCfg[configId] === 1) ? 0 : 1;
            const mainEnabled = invertMain ? (modCfg[configId] !== 1) : (modCfg[configId] === 1);
            if (!mainEnabled && rowOptions.clearSecondaryWhenDisabled === true) modCfg[secondaryConfigId] = 0;
            update();
            saveAndSync();
            refreshRowChangedState();
            getPreview().showForConfigId(configId);
        });
        secondaryBtn.SetPanelEvent("onactivate", () => {
            const mainEnabled = invertMain ? (modCfg[configId] !== 1) : (modCfg[configId] === 1);
            if (!mainEnabled) return;
            modCfg[secondaryConfigId] = (modCfg[secondaryConfigId] === 1) ? 0 : 1;
            update();
            saveAndSync();
            refreshRowChangedState();
            getPreview().showForConfigId(secondaryConfigId);
        });

        const syncRowVisualState = () => {
            if (!row || !row.IsValid || !row.IsValid()) return false;
            update();
            refreshRowChangedState();
            return true;
        };
        update();
        registerSettingsListRowSync(() => syncRowVisualState());
        return row;
    }

    // -------------------------------------------------------------------------
    // Public API & Backward Compatibility Exports
    // -------------------------------------------------------------------------
    const controlsApi = {
        SLIDER_SHAPES,
        QOL_COLOR_PALETTE_OPTIONS,
        COLOR_WARNING_THRESHOLD_OPTIONS,
        TOPBAR_ENEMY_HP_WARNING_THRESHOLD_OPTIONS,
        TOPBAR_ALLY_HP_WARNING_THRESHOLD_OPTIONS,
        NEUTRAL_CAMP_TIER_OPTIONS,
        BRIDGE_BUFF_FILTER_OPTIONS,
        RECENT_PURCHASE_REPOSITION_OPTIONS,
        createSliderRow,
        createSeparator,
        createSectionTitle,
        createSectionInlineIconButton,
        createSectionTitleCheckboxToggle,
        createAnimatedInlineToggleSection,
        createCollapsibleSubSection,
        createAnimatedInlineEnumSection,
        refreshEnumSections,
        getRowResetKeys,
        applyResetForConfigKeys,
        collectResetKeysFromPanel,
        collectResetKeysFromSectionTitleRow,
        hasAnyChangedConfigKeys,
        createSectionResetButton,
        getRuntimeButtonGroupDefaultIndex,
        applyRuntimeButtonGroupIndex,
        resetRuntimeButtonGroupToDefault,
        resetRuntimeRowsInSectionFromTitleRow,
        createRuntimeSectionTitle,
        applyDefaultHeroSelection,
        applyHealthbarTypeSelection,
        forceCenterSliderValueInput,
        normalizeComparableConfigValue,
        isConfigKeyChangedFromDefault,
        collectRowConfigKeys,
        bindRowChangedState,
        createRow,
        createInlineSecondaryCheckboxToggleRow,
        getDefaultHeroIconPath,
        getLanguageIconPath
    };

    Q.ui.controls = controlsApi;

    if (typeof globalThis === "object" && globalThis) {
        globalThis.SLIDER_SHAPES = SLIDER_SHAPES;
        globalThis.QOL_COLOR_PALETTE_OPTIONS = QOL_COLOR_PALETTE_OPTIONS;
        globalThis.COLOR_WARNING_THRESHOLD_OPTIONS = COLOR_WARNING_THRESHOLD_OPTIONS;
        globalThis.TOPBAR_ENEMY_HP_WARNING_THRESHOLD_OPTIONS = TOPBAR_ENEMY_HP_WARNING_THRESHOLD_OPTIONS;
        globalThis.TOPBAR_ALLY_HP_WARNING_THRESHOLD_OPTIONS = TOPBAR_ALLY_HP_WARNING_THRESHOLD_OPTIONS;
        globalThis.NEUTRAL_CAMP_TIER_OPTIONS = NEUTRAL_CAMP_TIER_OPTIONS;
        globalThis.BRIDGE_BUFF_FILTER_OPTIONS = BRIDGE_BUFF_FILTER_OPTIONS;
        globalThis.RECENT_PURCHASE_REPOSITION_OPTIONS = RECENT_PURCHASE_REPOSITION_OPTIONS;
        globalThis.CreateSliderRow = createSliderRow;
        globalThis.CreateSeparator = createSeparator;
        globalThis.CreateSectionTitle = createSectionTitle;
        globalThis.CreateSectionInlineIconButton = createSectionInlineIconButton;
        globalThis.CreateSectionTitleCheckboxToggle = createSectionTitleCheckboxToggle;
        globalThis.CreateAnimatedInlineToggleSection = createAnimatedInlineToggleSection;
        globalThis.CreateCollapsibleSubSection = createCollapsibleSubSection;
        globalThis.CreateAnimatedInlineEnumSection = createAnimatedInlineEnumSection;
        globalThis.RefreshEnumSections = refreshEnumSections;
        globalThis.GetRowResetKeys = getRowResetKeys;
        globalThis.ApplyResetForConfigKeys = applyResetForConfigKeys;
        globalThis.CollectResetKeysFromPanel = collectResetKeysFromPanel;
        globalThis.CollectResetKeysFromSectionTitleRow = collectResetKeysFromSectionTitleRow;
        globalThis.HasAnyChangedConfigKeys = hasAnyChangedConfigKeys;
        globalThis.CreateSectionResetButton = createSectionResetButton;
        globalThis.GetRuntimeButtonGroupDefaultIndex = getRuntimeButtonGroupDefaultIndex;
        globalThis.ApplyRuntimeButtonGroupIndex = applyRuntimeButtonGroupIndex;
        globalThis.ResetRuntimeButtonGroupToDefault = resetRuntimeButtonGroupToDefault;
        globalThis.ResetRuntimeRowsInSectionFromTitleRow = resetRuntimeRowsInSectionFromTitleRow;
        globalThis.CreateRuntimeSectionTitle = createRuntimeSectionTitle;
        globalThis.ApplyDefaultHeroSelection = applyDefaultHeroSelection;
        globalThis.ApplyHealthbarTypeSelection = applyHealthbarTypeSelection;
        globalThis.ForceCenterSliderValueInput = forceCenterSliderValueInput;
        globalThis.NormalizeComparableConfigValue = normalizeComparableConfigValue;
        globalThis.IsConfigKeyChangedFromDefault = isConfigKeyChangedFromDefault;
        globalThis.CollectRowConfigKeys = collectRowConfigKeys;
        globalThis.BindRowChangedState = bindRowChangedState;
        globalThis.CreateRow = createRow;
        globalThis.CreateInlineSecondaryCheckboxToggleRow = createInlineSecondaryCheckboxToggleRow;
        globalThis.GetDefaultHeroIconPath = getDefaultHeroIconPath;
        globalThis.GetLanguageIconPath = getLanguageIconPath;
    }
})();

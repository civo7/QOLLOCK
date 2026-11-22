// panorama/scripts/ui/presets.js
// =============================================================================
// QOLLOCK — Presets Subsystem & Tab Renderer (ES6)
// =============================================================================
// Modeled after clean modular architecture. Manages base & community presets,
// applying preset configs, active preset matching & highlight, and Presets tab.
// =============================================================================

(() => {
    "use strict";

    const Q = (typeof globalThis !== "undefined" && globalThis.QOL)
        ? globalThis.QOL
        : (typeof QOL !== "undefined" ? QOL : null);

    if (!Q?.ui) {
        $.Msg("[QOLLock] ui/presets: QOL.ui missing — aborting");
        return;
    }

    const BREAD_PRESET_NAME = "BreadRollius";
    const LEGACY_BREAD_PRESET_NAME = "Bread";
    const PRESET_MATCH_EXCLUDED_KEYS = new Set(["DRAG_ENABLED", "AUTO_SAVE_CHANGES", "ACTIVE_PRESET_NAME", "ENABLE_UPDATE_CHECKER", "DEFAULT_HERO"]);

    let _presetButtonRegistry = new Map();
    let _lastAppliedPresetName = "";
    let _highlightPollToken = 0;
    let _highlightPollRunning = false;

    const isAlive = Q.core.panel.isAlive;

    const getPresetsMap = () => {
        if (typeof globalThis !== "undefined" && globalThis.QOL_PRESETS) return globalThis.QOL_PRESETS;
        if (typeof globalThis !== "undefined" && globalThis.PRESETS) return globalThis.PRESETS;
        if (typeof QOL !== "undefined" && QOL.presets) return QOL.presets;
        return {};
    };

    const localize = Q.ui.renderer.localize;

    const PERSONAL_PRESETS_KEY = "qollock_personal_presets";
    const PERSONAL_STATE_KEY = "qollock_personal_presets_state";
    let personalWritePending = 0;
    let personalWork = Promise.resolve();
    let personalState = null;
    const personalIdentityRevisions = new Map();
    const identityRevision = name => personalIdentityRevisions.get(name.toLowerCase()) || 0;
    const invalidateIdentity = name => personalIdentityRevisions.set(name.toLowerCase(), identityRevision(name) + 1);
    const serializePersonalWrite = (operation, rejectBusy = false) => {
        if (rejectBusy && personalWritePending) return Promise.reject(new Error("A preset operation is already in progress."));
        personalWritePending++;
        const previous = personalWork;
        const result = (async () => {
            await previous;
            try { return await operation(); }
            finally { personalWritePending--; }
        })();
        // The caller observes the error; the next operation can still retry.
        personalWork = result.catch(() => {});
        return result;
    };
    let personalRenderGeneration = 0;
    let savedDefaultConfig = null;
    let savedDefaultGeneration = 0;
    let originalCaptureEpoch = 0;
    let personalView = null;
    let selectedPersonalName = "";
    const getSaveTarget = () => {
        const name = selectedPersonalName || personalState?.startupName || personalState?.originalName || "";
        return { name, revision: identityRevision(name), explicit: !!selectedPersonalName };
    };
    const onDefaultSaved = (raw, mainSave = true, saveTarget = getSaveTarget()) => {
        savedDefaultConfig = raw ? Q.parseStoredConfig(raw) : null;
        if (!raw) originalCaptureEpoch++;
        const generation = ++savedDefaultGeneration;
        personalView?.refresh();
        if (!mainSave || !raw) return Promise.resolve();
        return captureOriginalPreset(raw, generation, false, originalCaptureEpoch, saveTarget);
    };
    const snapshotsMatch = (left, right) => left && right && Object.keys(globalThis.DEFAULT_CONFIG || globalThis.QOL_DEFAULT_CONFIG).every(key =>
        PRESET_MATCH_EXCLUDED_KEYS.has(key) || isPresetValueMatch(left[key], right[key]));
    const matchesSnapshot = config => snapshotsMatch(globalThis.MOD_CONFIG, config);
    const compareLabels = (a, b) => {
        const left = a.toLowerCase(), right = b.toLowerCase();
        return left < right ? -1 : left > right ? 1 : 0;
    };

    const validatePersonalName = name => {
        if (typeof name !== "string" || /[\x00-\x1f\x7f]/.test(name) || !name.trim() || name.trim().length > 48) {
            throw new Error("Enter a preset name (1–48 characters).");
        }
        return name.trim();
    };

    const personalStorage = () => {
        const bridge = Q.core.storageBridge;
        if (!bridge) throw new Error("Preset storage is unavailable.");
        return bridge;
    };

    const readPersonalPresets = async () => {
        const raw = await personalStorage().load(PERSONAL_PRESETS_KEY);
        if (raw === null || raw === undefined || raw === "") return [];
        const entries = JSON.parse(raw);
        if (!Array.isArray(entries)) throw new Error("Invalid personal preset data.");
        const names = new Set();
        for (const entry of entries) {
            if (!entry || typeof entry.raw !== "string" || validatePersonalName(entry.name) !== entry.name || names.has(entry.name.toLowerCase())) {
                throw new Error("Invalid personal preset data.");
            }
            Q.parseStoredConfig(entry.raw);
            names.add(entry.name.toLowerCase());
        }
        return entries.sort((a, b) => compareLabels(a.name, b.name));
    };

    const readPersonalState = async () => {
        const raw = await personalStorage().load(PERSONAL_STATE_KEY);
        if (!raw) return null;
        const state = JSON.parse(raw);
        if (!state || typeof state !== "object" || Array.isArray(state) ||
            typeof state.startupName !== "string" || typeof state.originalName !== "string") {
            throw new Error("Invalid personal preset data.");
        }
        if ((state.startupName && validatePersonalName(state.startupName) !== state.startupName) ||
            (state.originalName && validatePersonalName(state.originalName) !== state.originalName)) {
            throw new Error("Invalid personal preset data.");
        }
        if (state.renameFrom !== undefined || state.renameTo !== undefined) {
            if (validatePersonalName(state.renameFrom) !== state.renameFrom ||
                validatePersonalName(state.renameTo) !== state.renameTo || state.renameFrom === state.renameTo) {
                throw new Error("Invalid personal preset data.");
            }
            const entries = await readPersonalPresets();
            const completed = !entries.some(entry => entry.name === state.renameFrom);
            const resolveName = name => completed && name === state.renameFrom ? state.renameTo : name;
            const recovered = { startupName: resolveName(state.startupName), originalName: resolveName(state.originalName) };
            await savePersonalState(recovered);
            return recovered;
        }
        return state;
    };
    const savePersonalState = async state => {
        await personalStorage().save(PERSONAL_STATE_KEY, JSON.stringify(state));
        personalState = state;
    };
    const writePersonalPresets = (change, name) => serializePersonalWrite(async () => {
        await readPersonalState();
        const entries = change(await readPersonalPresets());
        await personalStorage().save(PERSONAL_PRESETS_KEY, JSON.stringify(entries));
        invalidateIdentity(name);
        return entries.sort((a, b) => compareLabels(a.name, b.name));
    }, true);

    const captureOriginalPresetOperation = async (raw, generation, migration, epoch, saveTarget, persist = false) => {
        const state = await readPersonalState();
        const entries = await readPersonalPresets();
        if (epoch !== originalCaptureEpoch || generation !== savedDefaultGeneration) return entries;
        const targetName = saveTarget?.name || "";
        if (targetName && saveTarget.revision !== identityRevision(targetName)) {
            throw new Error("The preset changed while saving. Save again.");
        }
        let entry = entries.find(item => item.name === targetName);
        if (saveTarget?.explicit && targetName && !entry) throw new Error("The preset changed while saving. Save again.");
        if (!targetName) entry = entries.find(item => item.name === state?.startupName) ||
            entries.find(item => item.name === state?.originalName);
        if (!entry) {
            const baseName = localize("My config", true);
            entry = entries.find(item => item.raw === raw &&
                (item.name === baseName || item.name.startsWith(`${baseName} `)));
            if (!entry) {
                let name = baseName, suffix = 2;
                while (entries.some(item => item.name.toLowerCase() === name.toLowerCase())) name = `${baseName} ${suffix++}`;
                entry = { name, raw };
                entries.push(entry);
            }
        }
        let startupSaved = true;
        if (persist) {
            startupSaved = !state?.startupName || state.startupName === entry.name;
            if (startupSaved) {
                await personalStorage().save("qollock_settings", raw);
            }
            if (epoch !== originalCaptureEpoch || generation !== savedDefaultGeneration) return entries;
            if (startupSaved) savedDefaultConfig = Q.parseStoredConfig(raw);
        }
        // Footer Save owns the selected profile; migration only recovers an unrepresented main save.
        entry.raw = raw;
        await personalStorage().save(PERSONAL_PRESETS_KEY, JSON.stringify(entries));
        await savePersonalState({
            startupName: startupSaved && generation === savedDefaultGeneration ? entry.name : (state?.startupName || ""),
            originalName: entries.some(item => item.name === state?.originalName) ? state.originalName : entry.name
        });
        entries.sort((a, b) => compareLabels(a.name, b.name));
        if (generation === savedDefaultGeneration) {
            if (selectedPersonalName === targetName || (!selectedPersonalName && matchesSnapshot(Q.parseStoredConfig(raw)))) selectedPersonalName = entry.name;
            personalView?.replace(entries);
        }
        return entries;
    };
    const captureOriginalPreset = (raw, generation, migration, epoch = originalCaptureEpoch, saveTarget = null) =>
        serializePersonalWrite(() => captureOriginalPresetOperation(raw, generation, migration, epoch, saveTarget));

    // Serialize profile saves with startup selection so an ordinary Save cannot
    // replace the slot owned by another profile, including while CEF is waiting.
    const savePersonalSettings = (raw, saveTarget = getSaveTarget()) => {
        const epoch = originalCaptureEpoch;
        return serializePersonalWrite(async () => {
            const generation = ++savedDefaultGeneration;
            await captureOriginalPresetOperation(raw, generation, false, epoch, saveTarget, true);
            personalView?.refresh();
        });
    };

    const savePersonalStartup = entry => serializePersonalWrite(async () => {
        const generation = savedDefaultGeneration;
        await personalStorage().saveStartupSettings(entry.raw);
        if (generation === savedDefaultGeneration) await onDefaultSaved(entry.raw, false);
        const state = await readPersonalState() || { startupName: "", originalName: "" };
        await savePersonalState({ ...state, startupName: entry.name });
        return readPersonalPresets();
    }, true);

    const savePersonalPreset = async (name, config, replace = false) => {
        name = validatePersonalName(name);
        const raw = globalThis.WrapConfigForStorage(Q.parseStoredConfig(globalThis.WrapConfigForStorage(config)));
        return writePersonalPresets(entries => {
            const existing = entries.findIndex(entry => entry.name.toLowerCase() === name.toLowerCase());
            if (existing >= 0 && !replace) throw new Error("A preset with this name already exists.");
            const entry = { name, raw };
            if (existing >= 0) entries[existing] = entry;
            else entries.push(entry);
            return entries;
        }, name);
    };

    const deletePersonalPreset = async name => {
        name = validatePersonalName(name);
        return serializePersonalWrite(async () => {
            const entries = (await readPersonalPresets()).filter(entry => entry.name.toLowerCase() !== name.toLowerCase());
            const state = await readPersonalState();
            const deletingStartup = state?.startupName.toLowerCase() === name.toLowerCase();
            if (deletingStartup) {
                const generation = savedDefaultGeneration;
                await personalStorage().clearSettings();
                if (generation === savedDefaultGeneration) await onDefaultSaved(null, false);
                // Retain the entry if clearing its metadata fails, so deletion can be retried.
                await personalStorage().remove(PERSONAL_STATE_KEY);
                personalState = null;
            }
            await personalStorage().save(PERSONAL_PRESETS_KEY, JSON.stringify(entries));
            invalidateIdentity(name);
            if (selectedPersonalName.toLowerCase() === name.toLowerCase()) selectedPersonalName = "";
            return entries;
        }, true);
    };

    const renamePersonalPreset = async (oldName, newName) => {
        oldName = validatePersonalName(oldName);
        newName = validatePersonalName(newName);
        return serializePersonalWrite(async () => {
            const entries = await readPersonalPresets();
            const entry = entries.find(item => item.name.toLowerCase() === oldName.toLowerCase());
            if (!entry) throw new Error("Invalid personal preset data.");
            if (entries.some(item => item !== entry && item.name.toLowerCase() === newName.toLowerCase())) {
                throw new Error("A preset with this name already exists.");
            }
            const state = await readPersonalState();
            const tracked = state && oldName !== newName && (state.startupName === oldName || state.originalName === oldName);
            // Persist rename intent first; the collection tells recovery which name won.
            if (tracked) await savePersonalState({ ...state, renameFrom: oldName, renameTo: newName });
            entry.name = newName;
            await personalStorage().save(PERSONAL_PRESETS_KEY, JSON.stringify(entries));
            invalidateIdentity(oldName);
            invalidateIdentity(newName);
            if (tracked) {
                await savePersonalState({
                    startupName: state.startupName === oldName ? newName : state.startupName,
                    originalName: state.originalName === oldName ? newName : state.originalName
                });
            }
            return entries.sort((a, b) => compareLabels(a.name, b.name));
        }, true);
    };

    const NORMALIZERS = [
        "NormalizeNeutralCampFlags",
        "NormalizeItemCooldownModeConfig",
        "NormalizeAmmoScaleConfig",
        "NormalizeVoiceTypeConfig",
        "NormalizeHealthbarTypeConfig",
        "NormalizeColorWarningConfig",
        "NormalizeEnemyColorWarningConfig",
        "NormalizeAllyColorWarningConfig",
        "NormalizeTopbarEnemyHpWarningConfig",
        "NormalizeTopbarAllyHpWarningConfig",
        "NormalizeShopItemNotificationsConfig",
        "NormalizeQuickbuyDependencyConfig",
        "NormalizeConfig",
    ];

    const runNormalizers = (target, refData) => {
        for (const fnName of NORMALIZERS) {
            if (typeof globalThis[fnName] === "function") {
                globalThis[fnName](target, refData);
            }
        }
    };

    const isBreadPresetName = (name) => {
        const str = String(name || "");
        return str === BREAD_PRESET_NAME || str === LEGACY_BREAD_PRESET_NAME;
    };

    const normalizeBreadPresetName = (name) => {
        return isBreadPresetName(name) ? BREAD_PRESET_NAME : String(name || "");
    };

    const buildCommunityPresetEntries = () => {
        const names = [
            "Saiah", "Basil", "Vegas", "Poshy", "Goober", "Piggy", "BSQTT",
            BREAD_PRESET_NAME, "Saintmxsm", "Tuna", "Sneed", "iKaritzu", "Scuffed",
            "Gyzeh", "bonclide", "Zer0", "Pops", "Wouwei", "Nairshark", "Satanael",
            "Kr1stux", "Wrvth", "Jared", "Profitable", "Bubsito", "Gambler", "Hikyo",
            "Chjcago", "Starjadian", "Predi", "Shark", "Neonvoid", "Fenmore",
            "Deethirty", "Jerboa", "RiChew", "Soramikali", "Jaundice", "Xavier",
            "Spookyy", "Specty", "Wirdly", "Radiant", "Chumba", "FakeThread", "7eventy7",
            "XD_HECTICC", "Enova", "Boredom", "PrivateProf", "Munfins", "Gmanc2", "Keta",
            "Torque", "iMicro", "TW1G", "Veradox", "Antetheosis", "k49", "ninjabladeJr",
            "FlintSnow", "Fiizypopdrinkk", "Steqdyy", "Synapses_", "Gerglee", "Dappa",
            "Seyer", "T1FF4NNY", "Joey", "Zyartic", "billyyy", "mituu", "qlt",
            "munchkinman", "Blank2762", "Valerie", "Rosalia", "notah", "Anguish",
            "_ZODUK_", "nkonin.me", "loony", "leah", "Thorkizzle", "Wouks"
        ];

        const entries = names.map((name) => {
            let label = name;
            let preset = name;
            if (name === "munchkinman") label = "munchkin";
            else if (name === "ninjabladeJr") label = "ninjabladejr";
            else if (name === BREAD_PRESET_NAME || name === LEGACY_BREAD_PRESET_NAME) {
                label = "Bread";
                preset = "Bread";
            }
            return {
                label,
                preset,
                available: name !== "Predi",
            };
        });

        return entries.sort((a, b) => compareLabels(a.label, b.label));
    };

    const resolvePresetConfigByName = (presetName) => {
        if (!presetName) return null;
        let normName = normalizeBreadPresetName(presetName);
        const presets = getPresetsMap();
        const defConfig = globalThis.DEFAULT_CONFIG || globalThis.QOL_DEFAULT_CONFIG || {};

        if (normName !== "Default" && !Object.prototype.hasOwnProperty.call(presets, normName)) {
            if (Object.prototype.hasOwnProperty.call(presets, presetName)) {
                normName = presetName;
            } else if (normName === "Bread" && Object.prototype.hasOwnProperty.call(presets, "BreadRollius")) {
                normName = "BreadRollius";
            } else if (normName === "BreadRollius" && Object.prototype.hasOwnProperty.call(presets, "Bread")) {
                normName = "Bread";
            } else {
                return null;
            }
        }

        const resolved = Object.assign({}, defConfig);
        if (normName !== "Default") {
            const presetData = presets[normName];
            if (presetData) {
                Object.assign(resolved, presetData);
            }
            runNormalizers(resolved, presetData || resolved);
        } else {
            runNormalizers(resolved, resolved);
        }
        return resolved;
    };

    const preservedUiPreferences = config => {
        const result = { DRAG_ENABLED: config.DRAG_ENABLED, AUTO_SAVE_CHANGES: config.AUTO_SAVE_CHANGES };
        if (config.ENABLE_UPDATE_CHECKER !== undefined) result.ENABLE_UPDATE_CHECKER = config.ENABLE_UPDATE_CHECKER;
        return result;
    };

    const buildPresetCandidateConfigByName = name => {
        const resolved = resolvePresetConfigByName(name);
        return resolved ? Object.assign(resolved, preservedUiPreferences(globalThis.MOD_CONFIG || {})) : null;
    };

    const isPresetValueMatch = (currentValue, presetValue) => {
        if (typeof currentValue === "number" && typeof presetValue === "number") {
            return Math.abs(currentValue - presetValue) <= 0.0001;
        }
        return currentValue === presetValue;
    };

    const doesCurrentConfigMatchPreset = (presetName) => {
        const resolved = resolvePresetConfigByName(presetName);
        if (!resolved) return false;
        const modConfig = globalThis.MOD_CONFIG;
        if (!modConfig) return false;

        for (const key of Object.keys(resolved)) {
            if (PRESET_MATCH_EXCLUDED_KEYS.has(key)) continue;
            if (!Object.prototype.hasOwnProperty.call(modConfig, key)) continue;
            if (!isPresetValueMatch(modConfig[key], resolved[key])) {
                return false;
            }
        }
        return true;
    };

    const applyPresetConfig = (presetData) => {
        if (!presetData) return false;
        const modConfig = globalThis.MOD_CONFIG;
        const defConfig = globalThis.DEFAULT_CONFIG || globalThis.QOL_DEFAULT_CONFIG || {};
        if (!modConfig) return false;

        const preserved = preservedUiPreferences(modConfig);

        for (const key of Object.keys(defConfig)) {
            modConfig[key] = defConfig[key];
        }
        for (const key of Object.keys(presetData)) {
            modConfig[key] = presetData[key];
        }

        runNormalizers(modConfig, presetData);

        Object.assign(modConfig, preserved);
        return true;
    };

    const applyPresetByName = (presetName) => {
        selectedPersonalName = "";
        let normName = normalizeBreadPresetName(presetName);
        const presets = getPresetsMap();
        const defConfig = globalThis.DEFAULT_CONFIG || globalThis.QOL_DEFAULT_CONFIG || {};

        if (normName !== "Default" && !Object.prototype.hasOwnProperty.call(presets, normName)) {
            if (Object.prototype.hasOwnProperty.call(presets, presetName)) {
                normName = presetName;
            } else if (normName === "Bread" && Object.prototype.hasOwnProperty.call(presets, "BreadRollius")) {
                normName = "BreadRollius";
            } else if (normName === "BreadRollius" && Object.prototype.hasOwnProperty.call(presets, "Bread")) {
                normName = "Bread";
            }
        }

        const presetData = normName === "Default" ? defConfig : presets[normName];
        return applyPresetSnapshot(presetData, normName);
    };

    const applyPresetSnapshot = (presetData, normName = "") => {
        const prevLang = typeof globalThis.GetSettingsLanguage === "function" ? globalThis.GetSettingsLanguage() : "english";
        if (!applyPresetConfig(presetData)) return false;

        if (globalThis.MOD_CONFIG) {
            globalThis.MOD_CONFIG.ACTIVE_PRESET_NAME = isBreadPresetName(normName) ? BREAD_PRESET_NAME : "";
        }
        _lastAppliedPresetName = String(normName || "");

        if (typeof globalThis.SetRuntimePresetName === "function") {
            globalThis.SetRuntimePresetName(normName);
        }
        if (typeof globalThis.SaveAndSync === "function") {
            globalThis.SaveAndSync();
        }
        if (typeof globalThis.RefreshSettingsLanguageUiAfterConfigChange === "function") {
            globalThis.RefreshSettingsLanguageUiAfterConfigChange(prevLang);
        }
        return true;
    };

    const refreshActivePresetConfigMarkerBeforeSave = () => {
        const modConfig = globalThis.MOD_CONFIG;
        if (!modConfig || !Object.prototype.hasOwnProperty.call(modConfig, "ACTIVE_PRESET_NAME")) return;
        const activePresetName = String(modConfig.ACTIVE_PRESET_NAME || "");
        if (!activePresetName) {
            if (doesCurrentConfigMatchPreset(BREAD_PRESET_NAME)) {
                modConfig.ACTIVE_PRESET_NAME = BREAD_PRESET_NAME;
            }
            return;
        }
        if (isBreadPresetName(activePresetName) && doesCurrentConfigMatchPreset(BREAD_PRESET_NAME)) {
            modConfig.ACTIVE_PRESET_NAME = BREAD_PRESET_NAME;
            return;
        }
        modConfig.ACTIVE_PRESET_NAME = "";
        if (Object.prototype.hasOwnProperty.call(modConfig, "ENABLE_UNSPENT_SOULS")) {
            modConfig.ENABLE_UNSPENT_SOULS = 0;
        }
        if (Object.prototype.hasOwnProperty.call(modConfig, "DEFAULT_HERO")) {
            delete modConfig.DEFAULT_HERO;
        }
    };

    const resetPresetButtonRegistry = () => {
        _presetButtonRegistry.clear();
    };

    const registerPresetButton = (presetName, button, labelPanel, originalText) => {
        if (!presetName || !isAlive(button)) return;
        _presetButtonRegistry.set(presetName, {
            button,
            label: labelPanel,
            text: originalText || presetName,
        });
    };

    const setExplicitActivePresetButton = (activeButton) => {
        for (const entry of _presetButtonRegistry.values()) {
            if (isAlive(entry?.button)) {
                entry.button.SetHasClass("PresetActive", entry.button === activeButton);
            }
        }
    };

    const refreshActivePresetHighlight = () => {
        personalView?.refresh();
        let matchedPreset = null;
        if (_lastAppliedPresetName) {
            const entry = _presetButtonRegistry.get(_lastAppliedPresetName);
            if (isAlive(entry?.button) && doesCurrentConfigMatchPreset(_lastAppliedPresetName)) {
                matchedPreset = _lastAppliedPresetName;
            } else {
                _lastAppliedPresetName = "";
            }
        }

        if (!matchedPreset) {
            for (const [name, entry] of _presetButtonRegistry.entries()) {
                if (!isAlive(entry?.button)) continue;
                if (doesCurrentConfigMatchPreset(name)) {
                    matchedPreset = name;
                    break;
                }
            }
        }

        for (const [name, entry] of _presetButtonRegistry.entries()) {
            if (isAlive(entry?.button)) {
                entry.button.SetHasClass("PresetActive", name === matchedPreset);
            }
        }
    };

    const isSettingsWindowVisible = () => {
        if (typeof Q.ui.window?.isOpen === "function") {
            return Q.ui.window.isOpen();
        }
        if (typeof globalThis.IsSettingsWindowVisible === "function") {
            return globalThis.IsSettingsWindowVisible();
        }
        const win = $.GetContextPanel()?.FindChildTraverse("SettingsWindow");
        return !!(win && isAlive(win) && win.BHasClass && win.BHasClass("Visible"));
    };

    const shouldRunPresetHighlightPolling = () => {
        const curTab = globalThis.currentTab;
        const curSearch = globalThis.currentSearchQuery;
        return isSettingsWindowVisible() && curTab === "Presets" && !curSearch && _presetButtonRegistry.size > 0;
    };

    const stopPresetHighlightPolling = () => {
        personalView?.closeMenu();
        _highlightPollToken += 1;
        _highlightPollRunning = false;
    };

    const startPresetHighlightPolling = () => {
        if (_highlightPollRunning) return;
        _highlightPollRunning = true;
        const token = ++_highlightPollToken;
        const poll = () => {
            if (token !== _highlightPollToken) return;
            if (!shouldRunPresetHighlightPolling()) {
                _highlightPollRunning = false;
                return;
            }
            refreshActivePresetHighlight();
            if (typeof $.Schedule === "function") {
                $.Schedule(1.0, poll);
            }
        };
        if (typeof $.Schedule === "function") {
            $.Schedule(0.1, poll);
        }
    };

    const updatePresetHighlightPollingState = () => {
        if (shouldRunPresetHighlightPolling()) {
            startPresetHighlightPolling();
        } else {
            stopPresetHighlightPolling();
        }
    };

    const queueActivePresetHighlightRefresh = (delaySec = 0.02) => {
        if (typeof $.Schedule === "function") {
            $.Schedule(delaySec, refreshActivePresetHighlight);
        } else {
            refreshActivePresetHighlight();
        }
    };

    const showPresetApplySuccess = (button, labelPanel, originalText) => {
        if (!isAlive(button) || !isAlive(labelPanel)) return;
        const fallbackText = originalText || labelPanel.text || "";

        button.AddClass("PresetApplySuccess");
        setExplicitActivePresetButton(button);
        labelPanel.text = localize("SUCCESS", true);
        queueActivePresetHighlightRefresh(0.01);

        if (typeof $.Schedule === "function") {
            $.Schedule(0.6, () => {
                if (isAlive(labelPanel)) labelPanel.text = fallbackText;
                if (isAlive(button)) button.RemoveClass("PresetApplySuccess");
                queueActivePresetHighlightRefresh(0.01);
            });
        }
    };

    const createPresetGrid = (parent, title, entries, columns = 6, variant = "custom") => {
        if (!isAlive(parent)) return null;

        const titleLabel = $.CreatePanel("Label", parent, "");
        if (titleLabel) {
            titleLabel.AddClass("SectionTitle");
            titleLabel.AddClass("MainSectionTitle");
            if (variant === "custom") titleLabel.AddClass("MainSectionTitleCustom");
            titleLabel.text = title;
        }

        const grid = $.CreatePanel("Panel", parent, "");
        if (grid) {
            grid.AddClass("PresetCategoryGrid");
            if (variant === "custom") grid.AddClass("PresetCategoryGridCustom");
        }

        if (!grid) return { titleLabel, grid: null };

        const cols = columns || 6;
        let index = 0;

        while (index < entries.length) {
            const rowCount = Math.min(cols, entries.length - index);
            const row = $.CreatePanel("Panel", grid, "");
            if (row) row.AddClass("PresetGridRow");
            const rowInner = $.CreatePanel("Panel", row, "");
            if (rowInner) rowInner.AddClass("PresetGridRowInner");

            for (let c = 0; c < rowCount; c++) {
                const entry = entries[index + c];
                if (!entry) continue;

                const btn = $.CreatePanel("Button", rowInner, "");
                if (btn) {
                    btn.AddClass("PresetGridBtn");
                    if (entry.label) {
                        btn.AddClass(`PresetGridBtn_${String(entry.label).replace(/[^A-Za-z0-9_]/g, "")}`);
                    }
                    const entryVariant = entry.variant || variant || "";
                    if (entryVariant === "base") btn.AddClass("PresetGridBtnBase");
                    else if (entryVariant === "great") btn.AddClass("PresetGridBtnGreat");
                    else if (entryVariant === "custom") {
                        btn.AddClass("PresetGridBtnCustom");
                        if (entry.available !== false) btn.AddClass("PresetGridBtnCustomActive");
                    }

                    const lbl = $.CreatePanel("Label", btn, "");
                    if (lbl) lbl.text = entry.label;

                    if (entry.available === false) {
                        btn.AddClass("PresetGridBtnUnavailable");
                        btn.SetPanelEvent("onmouseover", () => {
                            $.DispatchEvent("UIShowTextTooltip", btn, localize("Preset configuration has not been added yet.", true));
                        });
                        btn.SetPanelEvent("onmouseout", () => $.DispatchEvent("UIHideTextTooltip"));
                    } else {
                        if (entry.preset) {
                            registerPresetButton(entry.preset, btn, lbl, entry.label);
                        }

                        btn.SetPanelEvent("onactivate", () => {
                            if (typeof globalThis.BuildPresetCandidateConfigByName === "function" &&
                                typeof globalThis.BuildConfigDiffRows === "function" &&
                                typeof globalThis.OpenConfigDiffPreviewModal === "function") {
                                const candidate = globalThis.BuildPresetCandidateConfigByName(entry.preset);
                                if (!candidate) return;
                                const diffRows = globalThis.BuildConfigDiffRows(globalThis.MOD_CONFIG, candidate);
                                globalThis.OpenConfigDiffPreviewModal({
                                    title: "Settings Changes",
                                    summary: `Changes: ${diffRows.length}`,
                                    rows: diffRows,
                                    previewConfig: candidate,
                                    previewName: entry.label,
                                    applyText: "Confirm",
                                    cancelText: "Cancel",
                                    onApply: () => {
                                        const didApply = applyPresetByName(entry.preset);
                                        if (didApply) {
                                            showPresetApplySuccess(btn, lbl, entry.label);
                                        }
                                        return didApply;
                                    },
                                });
                            } else {
                                const didApply = applyPresetByName(entry.preset);
                                if (didApply) {
                                    showPresetApplySuccess(btn, lbl, entry.label);
                                }
                            }
                        });
                    }
                }
            }

            index += rowCount;
        }

        return { titleLabel, grid };
    };

    // =========================================================================
    // Dedicated Tab Renderer for "Presets"
    // =========================================================================

    const renderPersonalPresets = container => {
        personalView?.closeMenu();
        const generation = ++personalRenderGeneration;
        const section = $.CreatePanel("Panel", container, "PersonalPresetsSection");
        section.AddClass("PersonalPresetsSection");
        const current = () => generation === personalRenderGeneration && isAlive(section) && section.GetParent() === container;
        const label = (parent, text, className, id = "") => {
            const panel = $.CreatePanel("Label", parent, id);
            panel.AddClass(className);
            panel.text = localize(text, true);
            return panel;
        };
        const button = (parent, text, className, action, id = "") => {
            const panel = $.CreatePanel("Button", parent, id);
            panel.AddClass("SettingActionBtn");
            panel.AddClass(className);
            label(panel, text, "SettingActionBtnLabel");
            panel.SetPanelEvent("onactivate", action);
            return panel;
        };
        label(section, "Personal Presets", "SectionTitle");
        label(section, "Preset name", "PersonalPresetsHint");
        const form = $.CreatePanel("Panel", section, "");
        form.AddClass("PersonalPresetRow");
        const nameInput = $.CreatePanel("TextEntry", form, "PersonalPresetName");
        nameInput.AddClass("PersonalPresetName");
        nameInput.maxchars = 48;
        nameInput.multiline = false;
        const saveButton = button(form, "New Preset", "PersonalPresetSave", () => createNew(), "PersonalPresetSave");
        const status = label(section, "Loading personal presets...", "PersonalPresetsStatus", "PersonalPresetsStatus");
        const list = $.CreatePanel("Panel", section, "PersonalPresetsList");
        list.AddClass("PersonalPresetsList");
        let entries = [], busy = true;
        saveButton.enabled = false;
        const feedback = (text, failed = false) => {
            status.text = localize(text, true);
            status.SetHasClass("FailureState", failed);
        };
        const run = async (operation, successText, onSuccess) => {
            if (busy || !current()) return;
            busy = true;
            saveButton.enabled = false;
            list.enabled = false;
            feedback("Working...");
            try {
                const result = await operation();
                if (!current()) return;
                entries = result;
                if (onSuccess) onSuccess();
                if (!current()) return;
                draw();
                feedback(successText);
            } catch (error) {
                if (current()) feedback(error.message === "A preset with this name already exists." ? error.message :
                    "Preset operation failed. Your saved presets were not replaced in this view.", true);
                $.Msg(`[QOLLock][presets] ${error.message || error}`);
            } finally {
                if (current()) {
                    busy = false;
                    saveButton.enabled = true;
                    list.enabled = true;
                }
            }
        };
        const createNew = () => {
            if (busy || !current()) return;
            try {
                const name = validatePersonalName(nameInput.text);
                const defaults = Q.parseStoredConfig(globalThis.WrapConfigForStorage(globalThis.DEFAULT_CONFIG || globalThis.QOL_DEFAULT_CONFIG));
                const config = globalThis.MOD_CONFIG, snapshot = JSON.stringify(config);
                void run(() => savePersonalPreset(name, defaults), "Personal preset created.", () => {
                    nameInput.text = "";
                    // A delayed create cannot replace edits made since the click.
                    if (globalThis.MOD_CONFIG === config && JSON.stringify(config) === snapshot) {
                        applyPresetSnapshot(defaults, "Default");
                        selectedPersonalName = name;
                    }
                });
            } catch (error) {
                feedback(error.message, true);
            }
        };
        let rows = [];
        const refreshSelection = () => {
            if (!current()) { closeMenu(); return; }
            if (openMenu && !positionMenu()) closeMenu();
            const active = rows.find(item => item.name && item.name === selectedPersonalName && matchesSnapshot(item.config())) ||
                rows.find(item => matchesSnapshot(item.config()));
            for (const item of rows) {
                item.row.SetHasClass("PresetActive", item === active);
                item.badge.visible = item === active;
                item.startupBadge.visible = item.name === personalState?.startupName && !!snapshotsMatch(item.config(), savedDefaultConfig);
            }
        };
        const loadSnapshot = (config, name) => {
            if (busy || !current() || !config) return;
            const candidate = Object.assign({}, config, preservedUiPreferences(globalThis.MOD_CONFIG));
            globalThis.OpenConfigDiffPreviewModal({
                title: localize("Settings Changes", true), details: name,
                rows: globalThis.BuildConfigDiffRows(globalThis.MOD_CONFIG, candidate),
                previewConfig: candidate, previewName: name,
                applyText: localize("Confirm", true), cancelText: localize("Cancel", true),
                onApply: () => {
                    if (!current() || !applyPresetSnapshot(config, config.ACTIVE_PRESET_NAME)) return false;
                    selectedPersonalName = name;
                    refreshActivePresetHighlight();
                    return true;
                }
            });
        };
        let openMenu = null, menuHome = null, menuAnchor = null, menuLayer = null;
        const closeMenu = () => {
            if (isAlive(openMenu)) {
                openMenu.visible = false;
                if (isAlive(menuHome)) openMenu.SetParent(menuHome);
                else openMenu.DeleteAsync(0);
            }
            if (isAlive(menuLayer)) { menuLayer.visible = false; menuLayer.DeleteAsync(0); }
            openMenu = menuHome = menuAnchor = menuLayer = null;
        };
        const menuHost = anchor => {
            let foundSection = false;
            for (let node = anchor, depth = 0; isAlive(node) && depth < 64; node = node.GetParent(), depth++) {
                if (node === section) foundSection = true;
                if (node.id === "SettingsWindow") return foundSection ? node : null;
            }
            return null;
        };
        const positionMenu = () => {
            const host = menuHost(menuAnchor);
            if (!host || !isAlive(menuLayer) || menuLayer.GetParent() !== host) return false;
            // Match the tooltip owner's native visual-coordinate and host-density conversion.
            const point = typeof menuAnchor.GetPositionWithinAncestor === "function"
                ? menuAnchor.GetPositionWithinAncestor(host)
                : QOL_UTILS.GetPanelPositionRelativeToAncestor(menuAnchor, host);
            const x = Array.isArray(point) ? point[0] : point?.x;
            const y = Array.isArray(point) ? point[1] : point?.y;
            if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
            const scaleX = Number(host.actualuiscale_x) > 0 ? Number(host.actualuiscale_x) : 1;
            const scaleY = Number(host.actualuiscale_y) > 0 ? Number(host.actualuiscale_y) : 1;
            const anchorWidth = Number(menuAnchor.actuallayoutwidth) || 34 * scaleX;
            openMenu.style.x = `${Math.round(Math.max(0, (x + anchorWidth) / scaleX - 250))}px`;
            openMenu.style.y = `${Math.round(Math.max(0, y / scaleY - 112 - 4))}px`;
            return true;
        };
        const draw = () => {
            closeMenu();
            list.RemoveAndDeleteChildren();
            rows = [];
            const addSelection = (row, name, config) => {
                const badge = label(row, "In use", "PersonalPresetActiveBadge");
                badge.visible = false;
                const startupBadge = label(row, "At startup", "PersonalPresetStartupBadge");
                rows.push({ row, name, config, badge, startupBadge });
            };
            for (const entry of entries) {
                const card = $.CreatePanel("Panel", list, "");
                card.AddClass("PersonalPresetCard");
                const row = $.CreatePanel("Panel", card, "");
                row.AddClass("PersonalPresetRow");
                const title = label(row, "", "PersonalPresetTitle");
                title.text = entry.name;
                const config = Q.parseStoredConfig(entry.raw);
                addSelection(row, entry.name, () => config);
                button(row, "Load", "PersonalPresetLoad", () => {
                    closeMenu();
                    loadSnapshot(config, entry.name);
                });
                const anchor = $.CreatePanel("Panel", row, "");
                anchor.AddClass("PersonalPresetMenuAnchor");
                const menu = $.CreatePanel("Panel", anchor, "");
                menu.AddClass("PersonalPresetMenu");
                menu.acceptsfocus = true;
                menu.visible = false;
                const more = button(anchor, "…", "PersonalPresetMore", () => {
                    if (busy || !current()) return;
                    const opening = !menu.visible;
                    closeMenu();
                    if (!opening) return;
                    const host = menuHost(more);
                    if (!host) return;
                    menuLayer = $.CreatePanel("Panel", host, "");
                    menuLayer.AddClass("PersonalPresetMenuLayer");
                    const backdrop = $.CreatePanel("Button", menuLayer, "");
                    backdrop.AddClass("PersonalPresetMenuBackdrop");
                    const dismiss = () => {
                        closeMenu();
                        if (current() && isAlive(more)) more.SetFocus();
                    };
                    backdrop.SetPanelEvent("onactivate", dismiss);
                    backdrop.SetPanelEvent("onmousewheel", dismiss);
                    menuLayer.SetPanelEvent("oncancel", dismiss);
                    menuHome = anchor;
                    menuAnchor = more;
                    openMenu = menu;
                    menu.SetParent(menuLayer);
                    if (!positionMenu()) { closeMenu(); return; }
                    menu.visible = true;
                    menu.SetFocus();
                });
                more.SetPanelEvent("onmouseover", () => $.DispatchEvent("UIShowTextTooltip", more, localize("More actions", true)));
                more.SetPanelEvent("onmouseout", () => $.DispatchEvent("UIHideTextTooltip"));
                menu.SetPanelEvent("oncancel", () => {
                    closeMenu();
                    more.SetFocus();
                });
                button(menu, "Use at Startup", "PersonalPresetStartup", () => {
                    if (busy || !current()) return;
                    closeMenu();
                    void run(() => savePersonalStartup(entry), "Preset saved for startup.");
                });
                const editor = $.CreatePanel("Panel", card, "");
                editor.AddClass("PersonalPresetRow");
                editor.visible = false;
                const renameInput = $.CreatePanel("TextEntry", editor, "");
                renameInput.AddClass("PersonalPresetName");
                renameInput.AddClass("PersonalPresetRenameInput");
                renameInput.maxchars = 48;
                renameInput.multiline = false;
                button(menu, "Rename", "PersonalPresetRename", () => {
                    if (busy || !current()) return;
                    closeMenu();
                    renameInput.text = entry.name;
                    row.visible = false;
                    editor.visible = true;
                    renameInput.SetFocus();
                });
                button(editor, "Save", "PersonalPresetRenameSave", () => {
                    if (busy || !current()) return;
                    try {
                        const name = validatePersonalName(renameInput.text);
                        void run(() => renamePersonalPreset(entry.name, name), "Personal preset renamed.", () => {
                            if (selectedPersonalName === entry.name) selectedPersonalName = name;
                        });
                    } catch (error) {
                        feedback(error.message, true);
                    }
                });
                const cancelRename = () => {
                    if (busy || !current()) return;
                    editor.visible = false;
                    row.visible = true;
                    more.SetFocus();
                };
                button(editor, "Cancel", "PersonalPresetRenameCancel", cancelRename);
                editor.SetPanelEvent("oncancel", cancelRename);
                button(menu, "Delete", "PersonalPresetDelete", () => {
                    if (busy || !current()) return;
                    closeMenu();
                    void run(() => deletePersonalPreset(entry.name), "Personal preset deleted.");
                });
            }
            refreshSelection();
        };
        personalView = {
            closeMenu,
            refresh: refreshSelection,
            replace(result) {
                if (!current() || busy) return;
                entries = result;
                draw();
            }
        };
        const load = async () => {
            const defaultGeneration = savedDefaultGeneration;
            try {
                await personalWork;
                const storage = personalStorage();
                let [result, defaultRaw, state] = await Promise.all([readPersonalPresets(), storage.load("qollock_settings"), readPersonalState()]);
                if (!current()) return;
                if (defaultGeneration === savedDefaultGeneration) {
                    savedDefaultConfig = defaultRaw ? Q.parseStoredConfig(defaultRaw) : null;
                    if (defaultRaw && (!state || !result.some(entry => entry.name === state.startupName))) result = await captureOriginalPreset(defaultRaw, defaultGeneration, true);
                    else personalState = state;
                } else {
                    await personalWork;
                    result = await readPersonalPresets();
                }
                if (!current()) return;
                entries = result;
                draw();
                feedback(entries.length ? "" : "No personal presets yet. Create a new preset or save your settings.");
                busy = false;
                saveButton.enabled = true;
            } catch (error) {
                if (current()) feedback("Could not load personal presets. Reopen this tab to retry.", true);
                $.Msg(`[QOLLock][presets] ${error.message || error}`);
            }
        };
        void load();
    };

    const renderPresetsTab = (container) => {
        const collecting = globalThis.gSearchCollectMode && globalThis.gSearchCollectState;
        if (!collecting && !isAlive(container)) return;

        const presetsTitle = localize("Presets", true);

        const basePresetEntries = [
            { label: localize("Default", true), preset: "Default", variant: "base" },
            { label: "16:10", preset: "16:10", variant: "base" },
            { label: "4:3", preset: "4:3", variant: "base" },
            { label: "Clean", preset: "Clean", variant: "base" },
            { label: "Enhanced", preset: "Enhanced", variant: "base" },
            { label: "Maximum", preset: "Maximum", variant: "base", dividerAfter: true },
        ];

        const customEntries = basePresetEntries.concat(buildCommunityPresetEntries());
        if (collecting) {
            Q.ui.controls.createSectionTitle(container, presetsTitle);
            for (const entry of customEntries) {
                if (!entry || entry.available === false) continue;
                Q.ui.controls.createRow(container, entry.label, entry.preset ? "SEARCH_PRESET:" + entry.preset : "SEARCH_TAB:Presets", "actionbutton", null, null, null, [{ label: entry.preset ? "Apply" : "Open" }], "Preset");
            }
            Q.ui.controls.createRow(container, "Personal Presets", "SEARCH_TAB:Presets", "actionbutton", null, null, null, [{ label: "Open" }], "Save and load your own presets.");
            return;
        }
        resetPresetButtonRegistry();

        createPresetGrid(container, presetsTitle, customEntries, 6, "custom");

        renderPersonalPresets(container);

        refreshActivePresetHighlight();
    };

    // Auto-register with settings window manager
    if (Q.ui.window?.registerTabRenderer) {
        Q.ui.window.registerTabRenderer("Presets", renderPresetsTab);
    }

    // Export API on Q.ui.presets
    Q.ui.presets = {
        onDefaultSaved,
        savePersonalSettings,
        getSaveTarget,
        readPersonalPresets,
        savePersonalPreset,
        deletePersonalPreset,
        applyPresetConfig,
        applyPresetByName,
        buildCommunityPresetEntries,
        resolvePresetConfigByName,
        buildPresetCandidateConfigByName,
        doesCurrentConfigMatchPreset,
        refreshActivePresetConfigMarkerBeforeSave,
        refreshActivePresetHighlight,
        queueActivePresetHighlightRefresh,
        startPresetHighlightPolling,
        stopPresetHighlightPolling,
        updatePresetHighlightPollingState,
        shouldRunPresetHighlightPolling,
        resetPresetButtonRegistry,
        registerPresetButton,
        showPresetApplySuccess,
        createPresetGrid,
        renderPresetsTab,
    };

    // Backward compatibility globals
    globalThis.ApplyPresetConfig = applyPresetConfig;
    globalThis.ApplyPresetByName = applyPresetByName;
    globalThis.BuildCommunityPresetEntries = buildCommunityPresetEntries;
    globalThis.ResolvePresetConfigByName = resolvePresetConfigByName;
    globalThis.BuildPresetCandidateConfigByName = buildPresetCandidateConfigByName;
    globalThis.DoesCurrentConfigMatchPreset = doesCurrentConfigMatchPreset;
    globalThis.RefreshActivePresetConfigMarkerBeforeSave = refreshActivePresetConfigMarkerBeforeSave;
    globalThis.RefreshActivePresetHighlight = refreshActivePresetHighlight;
    globalThis.QueueActivePresetHighlightRefresh = queueActivePresetHighlightRefresh;
    globalThis.StartPresetHighlightPolling = startPresetHighlightPolling;
    globalThis.StopPresetHighlightPolling = stopPresetHighlightPolling;
    globalThis.UpdatePresetHighlightPollingState = updatePresetHighlightPollingState;
    globalThis.ShouldRunPresetHighlightPolling = shouldRunPresetHighlightPolling;
    globalThis.ResetPresetButtonRegistry = resetPresetButtonRegistry;
    globalThis.RegisterPresetButton = registerPresetButton;
    globalThis.SetExplicitActivePresetButton = setExplicitActivePresetButton;
    globalThis.ShowPresetApplySuccess = showPresetApplySuccess;
    globalThis.CreatePresetGrid = createPresetGrid;
})();

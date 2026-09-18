// panorama/scripts/ui/config_tab.js
// =============================================================================
// QOLLOCK — Config Tab Subsystem (ES6)
// =============================================================================
// Encapsulates the Config tab interface: general settings, export string
// serialization and clipboard copy, import string validation, parsing,
// and diff modal integration, and auto-disable warning banner.
// =============================================================================

(() => {
    "use strict";

    const Q = (typeof globalThis !== "undefined" && globalThis.QOL)
        ? globalThis.QOL
        : (typeof QOL !== "undefined" ? QOL : (globalThis.QOL = {}));
    Q.ui = Q.ui || {};

    let gConfigFeedbackLabel = null;
    let gConfigFeedbackClearToken = 0;

    const isAlive = Q.core.panel.isAlive;

    const localize = Q.ui.renderer.localize;

    const isRussian = Q.ui.renderer.isRussian;

    const getExportPrefix = () => {
        const semver = globalThis.QOL_SCHEMA_SEMVER ||
            globalThis.LATEST_COMPACT_SEMVER ||
            Q.VERSION ||
            "3.2.0";
        return `[QOL-${String(semver).replace(/\./g, "-")}]:`;
    };

    const getCurrentExportSettingsString = (config) => {
        const conf = config || globalThis.MOD_CONFIG || {};
        const compact = Q.persistence?.serializeCompactV2?.(conf) ||
            (typeof globalThis.SerializeCompactV2 === "function" ? globalThis.SerializeCompactV2(conf) : "");
        const encoded = Q.persistence?.toBase64Url?.(compact) ||
            (typeof globalThis.ToBase64Url === "function" ? globalThis.ToBase64Url(compact) : "");
        return getExportPrefix() + encoded;
    };

    const formatExportSettingsDisplayString = (rawExport) => {
        if (!rawExport) return "";
        const normalized = String(rawExport).replace(/\s+/g, "");
        const prefixMatch = normalized.match(/^\[QOL-\d+-\d+-\d+\]:/i);
        const prefixLen = prefixMatch ? prefixMatch[0].length : 0;
        const payloadLen = normalized.length - prefixLen;
        if (payloadLen <= 24) return normalized;
        const firstPayloadLen = Math.ceil(payloadLen / 2);
        const breakIndex = prefixLen + firstPayloadLen;
        if (breakIndex <= 0 || breakIndex >= normalized.length) return normalized;
        return normalized.slice(0, breakIndex) + "\n" + normalized.slice(breakIndex);
    };

    const formatImportSettingsDisplayString = (rawImport) => {
        if (!rawImport) return "";
        const normalized = String(rawImport).replace(/\s+/g, "");
        if (!/^\[QOL-\d+-\d+-\d+\]:/i.test(normalized)) {
            return rawImport;
        }
        return formatExportSettingsDisplayString(normalized);
    };

    const tryCopyTextToClipboard = (text, textEntryPanel) => {
        if (!text || text.length === 0) return false;
        let copied = false;
        const attempts = [
            () => { $.DispatchEvent("CopyStringToClipboard", text, text); },
            () => {
                if (!isAlive(textEntryPanel)) return;
                textEntryPanel.SetFocus();
                if (typeof textEntryPanel.SelectAll === "function") {
                    textEntryPanel.SelectAll();
                }
                $.DispatchEvent("TextEntryCopyToClipboard", textEntryPanel);
            },
        ];
        for (const attempt of attempts) {
            try {
                attempt();
                copied = true;
                break;
            } catch {
                // Try next method
            }
        }
        return copied;
    };

    const tryPasteTextFromClipboard = (textEntryPanel) => {
        if (!isAlive(textEntryPanel)) return false;
        textEntryPanel.SetFocus();
        if (typeof textEntryPanel.SelectAll === "function") {
            try { textEntryPanel.SelectAll(); } catch {}
        }
        let pasted = false;
        const attempts = [
            () => {
                if (typeof textEntryPanel.Paste === "function") {
                    textEntryPanel.Paste();
                    return;
                }
                throw new Error("Paste method unavailable");
            },
            () => {
                $.DispatchEvent("TextEntryInsertFromClipboard", textEntryPanel);
            },
        ];
        for (const attempt of attempts) {
            try {
                attempt();
                pasted = true;
                break;
            } catch {
                // Try next method
            }
        }
        return pasted;
    };

    const setConfigFeedbackMessage = (message, tone, holdMs) => {
        const label = gConfigFeedbackLabel;
        if (!isAlive(label)) return;

        const safeMessage = String(message || "");
        label.text = safeMessage;
        label.SetHasClass("FeedbackInfo", tone === "info");
        label.SetHasClass("FeedbackSuccess", tone === "success");
        label.SetHasClass("FeedbackWarning", tone === "warning");
        label.SetHasClass("FeedbackError", tone === "error");

        const hold = Math.max(0, Math.round(Number(holdMs) || 0));
        if (hold <= 0) return;

        gConfigFeedbackClearToken++;
        const token = gConfigFeedbackClearToken;
        if (typeof $.Schedule === "function") {
            $.Schedule(hold / 1000.0, () => {
                if (token !== gConfigFeedbackClearToken) return;
                if (!isAlive(gConfigFeedbackLabel)) return;
                gConfigFeedbackLabel.text = "";
                gConfigFeedbackLabel.SetHasClass("FeedbackInfo", true);
                gConfigFeedbackLabel.SetHasClass("FeedbackSuccess", false);
                gConfigFeedbackLabel.SetHasClass("FeedbackWarning", false);
                gConfigFeedbackLabel.SetHasClass("FeedbackError", false);
            });
        }
    };

    const setLocalizedConfigFeedbackMessage = (text, tone, durationMs) => {
        setConfigFeedbackMessage(localize(text, true), tone, durationMs);
    };

    const createSectionInlineIconButton = (titleLabel, buttonId, iconSrc, tooltipText) => {
        if (!isAlive(titleLabel)) return null;
        let titleHead = null;
        try { titleHead = titleLabel.GetParent ? titleLabel.GetParent() : null; } catch { titleHead = null; }
        if (!isAlive(titleHead)) return null;

        const button = $.CreatePanel("Button", titleHead, buttonId || "");
        button.AddClass("SectionTitleActionBtn");
        button.AddClass("ConfigSectionIconBtn");

        const icon = $.CreatePanel("Image", button, (buttonId || "") + "_icon", {
            src: iconSrc || "",
            defaultsrc: "",
            scaling: "contain",
        });
        icon.AddClass("SectionTitleActionIcon");
        icon.AddClass("ConfigSectionIconBtnIcon");

        if (tooltipText && Q.tooltip) {
            const showTooltip = () => {
                Q.tooltip.hideTextTooltip?.();
                Q.tooltip.cancelHide?.();
                Q.tooltip.showRowTooltip?.(
                    button,
                    "",
                    localize(tooltipText, true),
                    globalThis.PERF_IMPACT_TIER_NONE || "",
                    ""
                );
            };
            const hideTooltip = () => {
                Q.tooltip.hideTooltipDeferred?.(String(buttonId || "config_section_icon_btn") + "_mouseout");
            };
            button.SetPanelEvent("onmouseover", showTooltip);
            button.SetPanelEvent("onmouseout", hideTooltip);
            icon.SetPanelEvent("onmouseover", showTooltip);
            icon.SetPanelEvent("onmouseout", hideTooltip);
        }
        return button;
    };

    const renderConfigTab = (list) => {
        if (!globalThis.gSearchCollectMode && !isAlive(list)) return;

        globalThis.gCurrentSettingsSectionTitle = "";
        gConfigFeedbackLabel = null;
        gConfigFeedbackClearToken++;

        // Auto-disabled feature warning banner
        if (!globalThis.gSearchCollectMode && Q.autoDisabledFeatures && Q.autoDisabledFeatures.length > 0) {
            try {
                const disabledFeatures = Q.autoDisabledFeatures;
                const filtered = [];
                for (let di = 0; di < disabledFeatures.length; di++) {
                    const dn = String(disabledFeatures[di]).trim();
                    if (dn) filtered.push(dn);
                }
                if (filtered.length > 0) {
                    const warnSection = $.CreatePanel("Panel", list, "AutoDisableWarning");
                    warnSection.AddClass("ConfigFeedbackPanel");
                    warnSection.AddClass("AutoDisableWarning");
                    const warnTitle = $.CreatePanel("Label", warnSection, "AutoDisableWarningTitle");
                    warnTitle.AddClass("ConfigFeedbackLabel");
                    warnTitle.text = "Some QOLLOCK features were auto-disabled due to errors:";
                    const warnList = $.CreatePanel("Label", warnSection, "AutoDisableWarningList");
                    warnList.AddClass("ConfigFeedbackText");
                    warnList.text = filtered.join(", ");
                    const warnHint = $.CreatePanel("Label", warnSection, "AutoDisableWarningHint");
                    warnHint.AddClass("ConfigFeedbackText");
                    warnHint.text = "Restart your game to re-enable these features.";
                }
            } catch {}
        }

        // Search collection mode
        if (globalThis.gSearchCollectMode && globalThis.gSearchCollectState) {
            if (typeof globalThis.CreateSectionTitle === "function" && typeof globalThis.CreateRow === "function") {
                globalThis.CreateSectionTitle(list, "General");
                globalThis.CreateRow(list, "Preview", "PREVIEWS_ENABLED", "toggle", null, null, null, null, "Realtime Changes");
                globalThis.CreateRow(list, "Language", "LANGUAGE", "dropdown", null, null, null, globalThis.SETTINGS_LANGUAGE_OPTIONS);
                globalThis.CreateRow(list, "Default Hero", "DEFAULT_HERO", "dropdown", null, null, null, globalThis.DEFAULT_HERO_DROPDOWN_OPTIONS);
                globalThis.CreateRow(list, "Troubleshoot", "TEST_SKYRUNNER", "actionbutton", null, null, null, [
                    { label: "Swap" },
                ], "Switch to the Skyrunner storage hero. Your settings are saved in shop builds; if saving breaks, clear these builds and save again.");
                globalThis.CreateRow(list, "Theme", "SETTINGS_THEME", "buttongroup", null, null, null, globalThis.SETTINGS_THEME_OPTIONS);

                if (typeof globalThis.CreateSeparator === "function") {
                    globalThis.CreateSeparator(list);
                }
                globalThis.CreateSectionTitle(list, "Backup & Restore");
                globalThis.CreateRow(list, "Export String", "SEARCH_TAB:Config", "actionbutton", null, null, null, [
                    { label: "Open Settings" },
                ], "Share your settings string");
                globalThis.CreateRow(list, "Import String", "SEARCH_TAB:Config", "actionbutton", null, null, null, [
                    { label: "Open Settings" },
                ], "Paste and apply an exported settings string");

                if (typeof globalThis.CreateSeparator === "function") {
                    globalThis.CreateSeparator(list);
                }
                globalThis.CreateSectionTitle(list, "Display & Resolution");
                globalThis.CreateRow(list, "16:10 Support", "SUPPORT_16_10", "toggle", null, null, null, null, "Hud Shift");
                globalThis.CreateRow(list, "4:3 Support", "SUPPORT_4_3", "toggle", null, null, null, null, "Hud Shift");
                globalThis.CreateRow(list, "21:9 Stream Fix", "ENABLE_HUD_SHIFT", "toggle", null, null, null, null, "Hud Shift");

                if (typeof globalThis.CreateSeparator === "function") {
                    globalThis.CreateSeparator(list);
                }
                globalThis.CreateSectionTitle(list, "Game & Interface");
                globalThis.CreateRow(list, "Lane with Party", "ENABLE_LANE_WITH_PARTY", "toggle", null, null, null, null, "Automatically selects 'With Party' in lane preference. Requires the party screen to be open.");
                globalThis.CreateRow(list, "Centered ESC Menu", "ENABLE_CENTER_ESC", "toggle", null, null, null, null, "Easier Access");
                globalThis.CreateRow(list, "Centered Friends List", "ENABLE_CENTER_FRIENDS_LIST", "toggle", null, null, null, null, "");
                globalThis.CreateRow(list, "Minimalistic Pause", "ENABLE_MINIMALISTIC_PAUSE", "toggle", null, null, null, null, "Use the compact minimalistic pause screen instead of the default large one.");
                globalThis.CreateRow(list, "Show Testing Tools", "ENABLE_FORCE_TESTING_TOOLS", "toggle", null, null, null, null, "Always Shown");
                globalThis.CreateRow(list, "Hide Testing Tools", "ENABLE_HIDE_TESTING_TOOLS", "toggle", null, null, null, null, "Always Hidden");
                globalThis.CreateRow(list, "Behavior Summary", "ENABLE_HIDE_BEHAVIOR_SUMMARY", "toggle", null, null, null, [{ invert: true }], "Metro Button");

                if (typeof globalThis.CreateSeparator === "function") {
                    globalThis.CreateSeparator(list);
                }
                globalThis.CreateSectionTitle(list, "Content & Tools");
                globalThis.CreateRow(list, "Show Build ID", "ENABLE_SHOW_BUILD_ID", "toggle", null, null, null, null, "Shows your build information always for content creators");
                globalThis.CreateRow(list, "Show Title", "ENABLE_SHOW_BUILD_ID_TITLE", "toggle", null, null, null, null, "");
                globalThis.CreateRow(list, "Keyboard Overlay", "ENABLE_KEYBOARD_OVERLAY", "toggle", null, null, null, null, "Realtime Key Inputs");
                globalThis.CreateRow(list, "Full Keys", "ENABLE_FULL_KEYBOARD_LAYOUT", "toggle", null, null, null, null, "");
                if (typeof globalThis.CreateSliderRow === "function") {
                    globalThis.CreateSliderRow(list, "Size", "KEYBOARD_OVERLAY_SCALE", "size_70_150", "");
                    globalThis.CreateSliderRow(list, "Horizontal Offset", "KEYBOARD_OVERLAY_X_OFFSET", "offset_n1500_1500");
                    globalThis.CreateSliderRow(list, "Vertical Offset", "KEYBOARD_OVERLAY_Y_OFFSET", "offset_n400_1000");
                }
                const palette = (typeof globalThis.QOL_COLOR_PALETTE_OPTIONS !== "undefined" ? globalThis.QOL_COLOR_PALETTE_OPTIONS : []);
                globalThis.CreateRow(list, "Color", "KEYBOARD_OVERLAY_WASH_COLOR", "palette", null, null, null, palette, "Choose a preset color wash for the keyboard overlay.");
            }
            return;
        }

        list.AddClass("ConfigTabSurface");

        // --- Card: General ---
        const cardGeneral = $.CreatePanel("Panel", list, "ConfigCardGeneral");
        cardGeneral.AddClass("ConfigTabCard");
        if (typeof globalThis.CreateSectionTitle === "function") {
            globalThis.CreateSectionTitle(cardGeneral, "General");
        }
        if (typeof globalThis.CreateRow === "function") {
            globalThis.CreateRow(cardGeneral, "Preview Changes", "PREVIEWS_ENABLED", "toggle", null, null, null, null, "Realtime Changes");
            globalThis.CreateRow(cardGeneral, "Language", "LANGUAGE", "dropdown", null, null, null, globalThis.SETTINGS_LANGUAGE_OPTIONS);
            globalThis.CreateRow(cardGeneral, "Default Hero", "DEFAULT_HERO", "dropdown", null, null, null, globalThis.DEFAULT_HERO_DROPDOWN_OPTIONS);
            globalThis.CreateRow(cardGeneral, "Troubleshoot", "TEST_SKYRUNNER", "actionbutton", null, null, null, [
                { label: "Swap" },
            ], "Switch to the Skyrunner storage hero. Your settings are saved in shop builds; if saving breaks, clear these builds and save again.");
            globalThis.CreateRow(cardGeneral, "Theme", "SETTINGS_THEME", "buttongroup", null, null, null, globalThis.SETTINGS_THEME_OPTIONS);
        }

        const dividerAfterGeneral = $.CreatePanel("Panel", list, "ConfigDividerAfterGeneral");
        dividerAfterGeneral.AddClass("ConfigTabDivider");
        dividerAfterGeneral.AddClass("RowSeparator");

        // --- Card: Export ---
        const cardExport = $.CreatePanel("Panel", list, "ConfigCardExport");
        cardExport.AddClass("ConfigTabCard");

        const exportHeader = typeof globalThis.CreateSectionTitle === "function"
            ? globalThis.CreateSectionTitle(cardExport, "Export Settings")
            : null;
        const copyBtn = createSectionInlineIconButton(
            exportHeader,
            "ConfigCopyBtn",
            "s2r://panorama/images/icons/icon_copy.vsvg",
            "Copy our settings code to clipboard."
        );
        const exportTextEntry = $.CreatePanel("TextEntry", cardExport, "ConfigExportTextEntry");
        exportTextEntry.AddClass("ConfigTextEntry");
        exportTextEntry.multiline = true;
        exportTextEntry.maxchars = 2000;
        exportTextEntry.text = formatExportSettingsDisplayString(getCurrentExportSettingsString());
        exportTextEntry.SetPanelEvent("onfocus", () => {
            if (typeof exportTextEntry.SelectAll === "function") {
                exportTextEntry.SelectAll();
            }
        });

        if (copyBtn) {
            copyBtn.SetPanelEvent("onactivate", () => {
                const exportRaw = getCurrentExportSettingsString();
                exportTextEntry.text = formatExportSettingsDisplayString(exportRaw);
                const copied = tryCopyTextToClipboard(exportRaw, exportTextEntry);
                if (copied) {
                    copyBtn.RemoveClass("FailureState");
                    copyBtn.AddClass("SuccessState");
                    setLocalizedConfigFeedbackMessage("Export string copied.", "success", 1800);
                    if (typeof $.Schedule === "function") {
                        $.Schedule(0.6, () => {
                            if (isAlive(copyBtn)) copyBtn.RemoveClass("SuccessState");
                        });
                    }
                } else {
                    copyBtn.RemoveClass("SuccessState");
                    copyBtn.AddClass("FailureState");
                    setLocalizedConfigFeedbackMessage("Clipboard copy failed.", "error", 2200);
                    if (typeof $.Schedule === "function") {
                        $.Schedule(0.5, () => {
                            if (isAlive(copyBtn)) copyBtn.RemoveClass("FailureState");
                        });
                    }
                }
            });
        }

        const dividerAfterExport = $.CreatePanel("Panel", list, "ConfigDividerAfterExport");
        dividerAfterExport.AddClass("ConfigTabDivider");
        dividerAfterExport.AddClass("RowSeparator");

        // --- Card: Import ---
        const cardImport = $.CreatePanel("Panel", list, "ConfigCardImport");
        cardImport.AddClass("ConfigTabCard");

        const importHeader = typeof globalThis.CreateSectionTitle === "function"
            ? globalThis.CreateSectionTitle(cardImport, "Import Settings")
            : null;
        const applyBtn = createSectionInlineIconButton(
            importHeader,
            "ConfigApplyBtn",
            "s2r://panorama/images/icons/icon_checkmark.vsvg",
            "Apply your settings code to your configuration."
        );

        const importTextEntry = $.CreatePanel("TextEntry", cardImport, "ConfigImportTextEntry");
        importTextEntry.AddClass("ConfigTextEntry");
        importTextEntry.multiline = true;
        importTextEntry.text = "";
        let importFormattingInProgress = false;
        importTextEntry.SetPanelEvent("ontextentrychange", () => {
            if (importFormattingInProgress) return;
            const current = importTextEntry.text || "";
            const formatted = formatImportSettingsDisplayString(current);
            if (formatted !== current) {
                importFormattingInProgress = true;
                importTextEntry.text = formatted;
                importFormattingInProgress = false;
            }
        });

        const configFeedback = $.CreatePanel("Label", cardImport, "ConfigFeedbackLabel");
        configFeedback.AddClass("ConfigFeedbackLabel");
        gConfigFeedbackLabel = configFeedback;
        setConfigFeedbackMessage("", "info", 0);

        if (applyBtn) {
            applyBtn.SetPanelEvent("onactivate", () => {
                const raw = importTextEntry.text;
                if (!raw || raw.length === 0) return;
                try {
                    setLocalizedConfigFeedbackMessage("Import: parsing string...", "info", 0);
                    const parseImportFn = Q.ui.modal?.tryApplyImportStringWithDiagnostics ||
                        globalThis.TryApplyImportStringWithDiagnostics;
                    const importResult = parseImportFn ? parseImportFn(raw) : null;
                    if (!importResult || importResult.ok !== true || !importResult.parsedConfig || !importResult.candidateConfig) {
                        throw new Error("Invalid import string");
                    }

                    const diffRowsFn = Q.ui.modal?.buildConfigDiffRows ||
                        globalThis.BuildConfigDiffRows;
                    const diffRows = diffRowsFn ? diffRowsFn(globalThis.MOD_CONFIG || {}, importResult.candidateConfig) : [];
                    const schemaText = importResult.schemaVersion
                        ? (`[QOL-${String(importResult.schemaVersion).replace(/\./g, "-")}]`)
                        : "[unknown]";
                    const detailsText = isRussian()
                        ? (`Схема ${schemaText} | clamp=${String(importResult.clampedKeys)} | unknown=${String(importResult.unknownKeys)}`)
                        : (`Schema ${schemaText} | clamped=${String(importResult.clampedKeys)} | unknown=${String(importResult.unknownKeys)}`);

                    const openModalFn = Q.ui.modal?.openConfigDiffPreviewModal ||
                        globalThis.OpenConfigDiffPreviewModal;
                    if (!openModalFn) throw new Error("Modal subsystem not available");

                    openModalFn({
                        title: "Settings Changes",
                        summary: `Changes: ${diffRows.length}`,
                        details: detailsText,
                        rows: diffRows,
                        applyText: "Confirm",
                        cancelText: "Cancel",
                        onApply: () => {
                            try {
                                setLocalizedConfigFeedbackMessage("Import: applying settings...", "info", 0);
                                const previousLanguage = typeof globalThis.GetSettingsLanguage === "function"
                                    ? globalThis.GetSettingsLanguage()
                                    : "english";
                                const appliedDiag = Q.persistence.applyParsedConfigWithDiagnostics(
                                    importResult.parsedConfig,
                                    importResult.schemaVersion || globalThis.LATEST_COMPACT_SEMVER
                                );
                                if (typeof globalThis.SaveAndSync === "function") {
                                    globalThis.SaveAndSync();
                                }
                                const didRefreshLanguageUi = typeof globalThis.RefreshSettingsLanguageUiAfterConfigChange === "function"
                                    ? globalThis.RefreshSettingsLanguageUiAfterConfigChange(previousLanguage)
                                    : false;
                                setLocalizedConfigFeedbackMessage("Import: refreshing UI...", "info", 0);
                                if (isAlive(importHeader)) {
                                    importHeader.text = localize("Import Settings", true);
                                }
                                applyBtn.RemoveClass("FailureState");
                                applyBtn.AddClass("SuccessState");
                                const diagText = isRussian()
                                    ? (`Импорт ${schemaText} применен. clamp=${String(appliedDiag.clampedKeys)} unknown=${String(appliedDiag.unknownKeys)}`)
                                    : (`Import ${schemaText} applied. clamped=${String(appliedDiag.clampedKeys)} unknown=${String(appliedDiag.unknownKeys)}`);
                                const diagTone = (appliedDiag.unknownKeys > 0 || appliedDiag.clampedKeys > 0) ? "warning" : "success";
                                setConfigFeedbackMessage(diagText, diagTone, 3000);
                                if (!didRefreshLanguageUi && typeof globalThis.RequestSettingsListRefresh === "function") {
                                    globalThis.RequestSettingsListRefresh(0.02, true);
                                }
                                if (typeof $.Schedule === "function") {
                                    $.Schedule(0.6, () => {
                                        if (isAlive(applyBtn)) applyBtn.RemoveClass("SuccessState");
                                    });
                                }
                                return true;
                            } catch {
                                applyBtn.RemoveClass("SuccessState");
                                applyBtn.AddClass("FailureState");
                                setLocalizedConfigFeedbackMessage("Import failed.", "error", 2600);
                                if (typeof $.Schedule === "function") {
                                    $.Schedule(0.35, () => {
                                        if (isAlive(applyBtn)) applyBtn.RemoveClass("FailureState");
                                    });
                                }
                                return false;
                            }
                        },
                    });
                } catch {
                    if (isAlive(importHeader)) {
                        importHeader.text = localize("ERROR: Invalid String", true);
                        if (importHeader.style) importHeader.style.color = "#ff4d4d";
                    }
                    applyBtn.RemoveClass("SuccessState");
                    applyBtn.AddClass("FailureState");
                    setLocalizedConfigFeedbackMessage("Invalid import string.", "error", 2600);
                    if (typeof $.Schedule === "function") {
                        $.Schedule(0.35, () => {
                            if (isAlive(applyBtn)) applyBtn.RemoveClass("FailureState");
                        });
                    }
                }
            });
        }

        const palette = (typeof globalThis.QOL_COLOR_PALETTE_OPTIONS !== "undefined" ? globalThis.QOL_COLOR_PALETTE_OPTIONS : []);
        const createRow = (typeof globalThis.CreateRow === "function" ? globalThis.CreateRow : null);
        const createSliderRow = (typeof globalThis.CreateSliderRow === "function" ? globalThis.CreateSliderRow : null);
        const createAnimatedToggle = (typeof globalThis.CreateAnimatedInlineToggleSection === "function" ? globalThis.CreateAnimatedInlineToggleSection : null);

        // --- Card: Display & Resolution ---
        const dividerAfterImport = $.CreatePanel("Panel", list, "ConfigDividerAfterImport");
        dividerAfterImport.AddClass("ConfigTabDivider");
        dividerAfterImport.AddClass("RowSeparator");

        const cardDisplay = $.CreatePanel("Panel", list, "ConfigCardDisplay");
        cardDisplay.AddClass("ConfigTabCard");
        if (typeof globalThis.CreateSectionTitle === "function") {
            globalThis.CreateSectionTitle(cardDisplay, "Display & Resolution");
        }
        if (createRow) {
            createRow(cardDisplay, "16:10 Support", "SUPPORT_16_10", "toggle", null, null, null, null, "Hud Shift");
            createRow(cardDisplay, "4:3 Support", "SUPPORT_4_3", "toggle", null, null, null, null, "Hud Shift");
            createRow(cardDisplay, "21:9 Stream Fix", "ENABLE_HUD_SHIFT", "toggle", null, null, null, null, "Hud Shift");
        }

        // --- Card: Game & Interface ---
        const dividerAfterDisplay = $.CreatePanel("Panel", list, "ConfigDividerAfterDisplay");
        dividerAfterDisplay.AddClass("ConfigTabDivider");
        dividerAfterDisplay.AddClass("RowSeparator");

        const cardSystem = $.CreatePanel("Panel", list, "ConfigCardGameInterface");
        cardSystem.AddClass("ConfigTabCard");
        if (typeof globalThis.CreateSectionTitle === "function") {
            globalThis.CreateSectionTitle(cardSystem, "Game & Interface");
        }
        if (createRow) {
            createRow(cardSystem, "Lane with Party", "ENABLE_LANE_WITH_PARTY", "toggle", null, null, null, null, "Automatically selects 'With Party' in lane preference. Requires the party screen to be open.");
            createRow(cardSystem, "Centered ESC Menu", "ENABLE_CENTER_ESC", "toggle", null, null, null, null, "Easier Access");
            createRow(cardSystem, "Centered Friends List", "ENABLE_CENTER_FRIENDS_LIST", "toggle", null, null, null, null, "");
            createRow(cardSystem, "Minimalistic Pause", "ENABLE_MINIMALISTIC_PAUSE", "toggle", null, null, null, null, "Use the compact minimalistic pause screen instead of the default large one.");
            createRow(cardSystem, "Show Testing Tools", "ENABLE_FORCE_TESTING_TOOLS", "toggle", null, null, null, null, "Always Shown");
            createRow(cardSystem, "Hide Testing Tools", "ENABLE_HIDE_TESTING_TOOLS", "toggle", null, null, null, null, "Always Hidden");
            createRow(cardSystem, "Behavior Summary", "ENABLE_HIDE_BEHAVIOR_SUMMARY", "toggle", null, null, null, [{ invert: true }], "Metro Button");
        }

        // --- Card: Content & Tools ---
        const dividerAfterSystem = $.CreatePanel("Panel", list, "ConfigDividerAfterSystem");
        dividerAfterSystem.AddClass("ConfigTabDivider");
        dividerAfterSystem.AddClass("RowSeparator");

        const cardTools = $.CreatePanel("Panel", list, "ConfigCardContentTools");
        cardTools.AddClass("ConfigTabCard");
        if (typeof globalThis.CreateSectionTitle === "function") {
            globalThis.CreateSectionTitle(cardTools, "Content & Tools");
        }
        if (createAnimatedToggle) {
            createAnimatedToggle(cardTools, "Show Build ID", "ENABLE_SHOW_BUILD_ID", "Shows your build information always for content creators", (sectionParent) => {
                if (createRow) {
                    createRow(sectionParent, "Show Title", "ENABLE_SHOW_BUILD_ID_TITLE", "toggle", null, null, null, null, "");
                }
            });
            if (typeof globalThis.CreateSeparator === "function") {
                globalThis.CreateSeparator(cardTools);
            }
            createAnimatedToggle(cardTools, "Keyboard", "ENABLE_KEYBOARD_OVERLAY", "Realtime Key Inputs", (sectionParent) => {
                if (createRow) {
                    createRow(sectionParent, "Full Keys", "ENABLE_FULL_KEYBOARD_LAYOUT", "toggle", null, null, null, null, "");
                }
                if (createSliderRow) {
                    createSliderRow(sectionParent, "Size", "KEYBOARD_OVERLAY_SCALE", "size_70_150", "");
                    createSliderRow(sectionParent, "Horizontal Offset", "KEYBOARD_OVERLAY_X_OFFSET", "offset_n1500_1500");
                    createSliderRow(sectionParent, "Vertical Offset", "KEYBOARD_OVERLAY_Y_OFFSET", "offset_n400_1000");
                }
                if (createRow) {
                    createRow(sectionParent, "Color", "KEYBOARD_OVERLAY_WASH_COLOR", "palette", null, null, null, palette, "Choose a preset color wash for the keyboard overlay.");
                }
            });
        }
    };

    // Public API on Q.ui.configTab
    Q.ui.configTab = {
        render: renderConfigTab,
        getCurrentExportSettingsString,
        formatExportSettingsDisplayString,
        formatImportSettingsDisplayString,
        tryCopyTextToClipboard,
        tryPasteTextFromClipboard,
        setConfigFeedbackMessage,
        setLocalizedConfigFeedbackMessage,
        createSectionInlineIconButton,
    };

    // Register with window manager
    if (typeof Q.ui.window?.registerTabRenderer === "function") {
        Q.ui.window.registerTabRenderer("Config", renderConfigTab);
    }

    // Backward compatibility globals
    globalThis.GetCurrentExportSettingsString = getCurrentExportSettingsString;
    globalThis.FormatExportSettingsDisplayString = formatExportSettingsDisplayString;
    globalThis.FormatImportSettingsDisplayString = formatImportSettingsDisplayString;
    globalThis.TryCopyTextToClipboard = tryCopyTextToClipboard;
    globalThis.TryPasteTextFromClipboard = tryPasteTextFromClipboard;
    globalThis.SetConfigFeedbackMessage = setConfigFeedbackMessage;
    globalThis.SetLocalizedConfigFeedbackMessage = setLocalizedConfigFeedbackMessage;
    globalThis.CreateSectionInlineIconButton = createSectionInlineIconButton;
    globalThis.RenderConfigTabContent = renderConfigTab;
})();

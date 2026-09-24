// panorama/scripts/ui/cloud_sync.js
// =============================================================================
// QOLLOCK — Storage Sync Subsystem (ES6)
// =============================================================================
// Handles user save and clear actions, coordinates with core/ql_storage_bridge,
// updates UI button states, and provides localized user feedback.
// =============================================================================

(() => {
    "use strict";

    const Q = (typeof globalThis !== "undefined" && globalThis.QOL)
        ? globalThis.QOL
        : (typeof QOL !== "undefined" ? QOL : (globalThis.QOL = {}));
    Q.ui = Q.ui || {};

    const EXPORT_TOKEN_REGEX = /^\[QOL-(\d+-\d+-\d+)\]:?([A-Za-z0-9\-_]+)$/i;

    const ATTRS = {
        saveRequest: () => globalThis.BUILD_SAVE_REQUEST_ATTR || "QOL_BUILD_SAVE_REQUEST",
        saveToken: () => globalThis.BUILD_SAVE_TOKEN_ATTR || "QOL_BUILD_SAVE_TOKEN",
        saveMsg: () => globalThis.BUILD_SAVE_MSG_ATTR || "QOL_BUILD_SAVE_MSG",
        saveState: () => globalThis.BUILD_SAVE_STATE_ATTR || "QOL_BUILD_SAVE_STATE",
        clearRequest: () => globalThis.BUILD_CLEAR_REQUEST_ATTR || "QOL_BUILD_CLEAR_REQUEST",
        clearToken: () => globalThis.BUILD_CLEAR_TOKEN_ATTR || "QOL_BUILD_CLEAR_TOKEN",
        clearMsg: () => globalThis.BUILD_CLEAR_MSG_ATTR || "QOL_BUILD_CLEAR_MSG",
        clearState: () => globalThis.BUILD_CLEAR_STATE_ATTR || "QOL_BUILD_CLEAR_STATE",
    };

    const isAlive = (p) => {
        if (!p) return false;
        if (Q.core?.panel?.isAlive) return Q.core.panel.isAlive(p);
        return typeof p.IsValid === "function" && p.IsValid();
    };

    const findRootPanel = () => {
        if (typeof Q.core?.panel?.findRoot === "function") {
            return Q.core.panel.findRoot();
        }
        if (typeof globalThis.FindRootPanel === "function") {
            return globalThis.FindRootPanel();
        }
        let panel = $.GetContextPanel?.();
        while (panel && panel.GetParent && panel.GetParent()) {
            panel = panel.GetParent();
        }
        return panel;
    };

    const localize = (t, force) => {
        if (typeof Q.ui?.renderer?.localize === "function") {
            return Q.ui.renderer.localize(t, force);
        }
        if (typeof globalThis.LocalizeSettingsText === "function") {
            return globalThis.LocalizeSettingsText(t);
        }
        if (typeof $ !== "undefined" && typeof $.Localize === "function") {
            return $.Localize(t);
        }
        return t;
    };

    const setFeedbackMessage = (text, tone, durationMs) => {
        if (typeof Q.ui?.configTab?.setLocalizedConfigFeedbackMessage === "function") {
            Q.ui.configTab.setLocalizedConfigFeedbackMessage(text, tone, durationMs);
            return;
        }
        if (typeof globalThis.SetLocalizedConfigFeedbackMessage === "function") {
            globalThis.SetLocalizedConfigFeedbackMessage(text, tone, durationMs);
            return;
        }
        if (typeof globalThis.SetConfigFeedbackMessage === "function") {
            globalThis.SetConfigFeedbackMessage(localize(text, true), tone, durationMs);
        }
    };

    const queueBuildSaveRequest = (rawExportString) => {
        const payload = rawExportString ? String(rawExportString).replace(/\s+/g, "") : "";
        if (!payload || !EXPORT_TOKEN_REGEX.test(payload)) return "";

        const token = `${Date.now ? Date.now() : (new Date()).getTime()}_${Math.floor(Math.random() * 1000000)}`;
        const panel = $.GetContextPanel?.();
        const root = findRootPanel();

        if (panel && typeof panel.SetAttributeString === "function") {
            panel.SetAttributeString(ATTRS.saveRequest(), payload);
            panel.SetAttributeString(ATTRS.saveToken(), token);
            panel.SetAttributeString(ATTRS.saveMsg(), "queued");
            panel.SetAttributeString(ATTRS.saveState(), "pending");
        }
        if (root && typeof root.SetAttributeString === "function") {
            root.SetAttributeString(ATTRS.saveRequest(), payload);
            root.SetAttributeString(ATTRS.saveToken(), token);
            root.SetAttributeString(ATTRS.saveMsg(), "queued");
            root.SetAttributeString(ATTRS.saveState(), "pending");
        }
        return token;
    };

    const readBuildSaveStatus = () => {
        const panel = $.GetContextPanel?.();
        const root = findRootPanel();
        const fromRoot = (root && typeof root.GetAttributeString === "function") ? {
            state: root.GetAttributeString(ATTRS.saveState(), ""),
            msg: root.GetAttributeString(ATTRS.saveMsg(), ""),
            token: root.GetAttributeString(ATTRS.saveToken(), ""),
        } : { state: "", msg: "", token: "" };

        if (fromRoot.state || fromRoot.msg || fromRoot.token) return fromRoot;

        if (panel && typeof panel.GetAttributeString === "function") {
            return {
                state: panel.GetAttributeString(ATTRS.saveState(), ""),
                msg: panel.GetAttributeString(ATTRS.saveMsg(), ""),
                token: panel.GetAttributeString(ATTRS.saveToken(), ""),
            };
        }
        return { state: "", msg: "", token: "" };
    };

    const resolveBuildSavePendingLabel = (message) => {
        switch (message) {
            case "starting":
                return "START";
            case "wait_hero":
                return "WAIT HERO";
            case "switching_to_skyrunner":
            case "switching_to_airheart":
            case "switching_to_storage_hero":
            case "switch_hero":
            case "confirm_hero":
                return "SKYRUNNER";
            case "waiting_for_shop":
            case "open_shop":
                return "OPEN SHOP";
            case "initializing_storage_build":
            case "open_browser":
            case "await_list":
            case "pick_target":
            case "await_selected":
                return "INIT BUILD";
            case "opening_edit_mode":
            case "await_editor":
                return "EDITING";
            case "writing_category_name":
            case "write_description":
                return "WRITING";
            case "saving":
            case "commit":
            case "await_commit":
                return "SAVING";
            case "verifying":
            case "verify":
                return "VERIFY";
            default:
                return "SAVING";
        }
    };

    const watchBuildSaveStatus = (saveBtn, saveLbl, expectedToken, defaultLabel) => {
        const startMs = Date.now ? Date.now() : (new Date()).getTime();
        const timeoutMs = 30000;

        const restoreDefault = () => {
            if (!isAlive(saveBtn)) return;
            saveBtn.RemoveClass("SuccessState");
            saveBtn.RemoveClass("FailureState");
            if (saveLbl) saveLbl.text = defaultLabel;
        };

        const tick = () => {
            if (!isAlive(saveBtn)) return;
            const nowMs = Date.now ? Date.now() : (new Date()).getTime();
            const elapsedMs = nowMs - startMs;
            const status = readBuildSaveStatus();
            const tokenMatches = !expectedToken || !status.token || status.token === expectedToken;

            if (status.state === "pending" && tokenMatches) {
                saveBtn.RemoveClass("FailureState");
                saveBtn.AddClass("SuccessState");
                if (saveLbl) saveLbl.text = localize(resolveBuildSavePendingLabel(status.msg || ""), true);
                if (elapsedMs >= timeoutMs) {
                    saveBtn.RemoveClass("SuccessState");
                    saveBtn.AddClass("FailureState");
                    if (saveLbl) saveLbl.text = localize("TIMEOUT", true);
                    setFeedbackMessage("Save timed out. Try again.", "error", 2600);
                    if (typeof $.Schedule === "function") $.Schedule(0.75, restoreDefault);
                    return;
                }
                if (typeof $.Schedule === "function") $.Schedule(0.15, tick);
                return;
            }

            if (status.state === "success" && tokenMatches) {
                saveBtn.RemoveClass("FailureState");
                saveBtn.AddClass("SuccessState");
                if (saveLbl) saveLbl.text = localize("SAVED", true);
                setFeedbackMessage("Settings saved successfully.", "success", 2000);
                if (typeof $.Schedule === "function") $.Schedule(0.75, restoreDefault);
                return;
            }

            if (status.state === "failed" && tokenMatches) {
                saveBtn.RemoveClass("SuccessState");
                saveBtn.AddClass("FailureState");
                if (saveLbl) saveLbl.text = localize("FAILED", true);
                setFeedbackMessage("Save failed.", "error", 2600);
                if (typeof $.Schedule === "function") $.Schedule(0.75, restoreDefault);
                return;
            }

            if (elapsedMs < timeoutMs) {
                if (typeof $.Schedule === "function") $.Schedule(0.15, tick);
                return;
            }
            restoreDefault();
        };

        tick();
    };

    let gSaveButtonLastActionMs = 0;
    const SAVE_BUTTON_DEBOUNCE_MS = 1000;

    /**
     * Saves the current settings to CEF local storage and provides instant UI feedback.
     */
    const activateBuildSaveFromUi = (saveBtn, saveLbl, onBeforeQueue) => {
        if (!isAlive(saveBtn) || !saveLbl) return;
        const nowMs = Date.now ? Date.now() : (new Date()).getTime();
        if (gSaveButtonLastActionMs > nowMs - SAVE_BUTTON_DEBOUNCE_MS) return;
        gSaveButtonLastActionMs = nowMs;

        const cfgSave = localize("SAVE", true);
        const cfgSaving = localize("SAVING", true);
        const cfgSaved = localize("SAVED", true);
        const cfgFailed = localize("FAILED", true);

        if (typeof onBeforeQueue === "function") {
            try { onBeforeQueue(); } catch (_) {}
        }

        saveBtn.RemoveClass("FailureState");
        saveBtn.AddClass("SuccessState");
        saveLbl.text = cfgSaving;
        setFeedbackMessage("Saving settings...", "info", 0);

        const bridge = Q.core?.storageBridge || globalThis.QOLStorageBridge;
        if (bridge && typeof bridge.saveSettings === "function") {
            const config = (typeof MOD_CONFIG !== "undefined" && MOD_CONFIG)
                ? MOD_CONFIG
                : ((typeof globalThis !== "undefined" && globalThis.MOD_CONFIG) ? globalThis.MOD_CONFIG : {});

            bridge.saveSettings(config, (err) => {
                if (!isAlive(saveBtn)) return;
                if (err) {
                    saveBtn.RemoveClass("SuccessState");
                    saveBtn.AddClass("FailureState");
                    saveLbl.text = cfgFailed;
                    setFeedbackMessage(`Save failed: ${err.message || err}`, "error", 2600);
                    if (typeof $.Schedule === "function") {
                        $.Schedule(1.2, () => {
                            if (!isAlive(saveBtn)) return;
                            saveBtn.RemoveClass("FailureState");
                            saveLbl.text = cfgSave;
                        });
                    }
                    return;
                }

                saveBtn.RemoveClass("FailureState");
                saveBtn.AddClass("SuccessState");
                saveLbl.text = cfgSaved;
                setFeedbackMessage("Settings saved successfully.", "success", 2000);

                const panel = $.GetContextPanel?.();
                const root = findRootPanel();
                if (panel && typeof panel.SetAttributeString === "function") {
                    panel.SetAttributeString(ATTRS.saveState(), "success");
                    panel.SetAttributeString(ATTRS.saveMsg(), "success");
                }
                if (root && typeof root.SetAttributeString === "function") {
                    root.SetAttributeString(ATTRS.saveState(), "success");
                    root.SetAttributeString(ATTRS.saveMsg(), "success");
                }

                if (typeof $.Schedule === "function") {
                    $.Schedule(1.2, () => {
                        if (!isAlive(saveBtn)) return;
                        saveBtn.RemoveClass("SuccessState");
                        saveLbl.text = cfgSave;
                    });
                }
            });
            return;
        }

        // Fallback if storage bridge is not loaded
        const getExportStrFn = Q.ui?.configTab?.getCurrentExportSettingsString ||
            globalThis.GetCurrentExportSettingsString;
        const exportRaw = getExportStrFn ? getExportStrFn() : "";
        const token = queueBuildSaveRequest(exportRaw);

        if (!token || token.length === 0) {
            saveBtn.RemoveClass("SuccessState");
            saveBtn.AddClass("FailureState");
            saveLbl.text = cfgFailed;
            setFeedbackMessage("Failed to queue save request.", "error", 2200);
            if (typeof $.Schedule === "function") {
                $.Schedule(0.6, () => {
                    if (!isAlive(saveBtn)) return;
                    saveBtn.RemoveClass("FailureState");
                    saveLbl.text = cfgSave;
                });
            }
            return;
        }

        watchBuildSaveStatus(saveBtn, saveLbl, token, cfgSave);
    };

    let gClearButtonLastActionMs = 0;
    const CLEAR_BUTTON_DEBOUNCE_MS = 1000;

    const queueBuildClearRequest = () => {
        const nowMs = Date.now ? Date.now() : (new Date()).getTime();
        if (gClearButtonLastActionMs > nowMs - CLEAR_BUTTON_DEBOUNCE_MS) return "";
        gClearButtonLastActionMs = nowMs;

        const token = `${Date.now ? Date.now() : (new Date()).getTime()}_${Math.floor(Math.random() * 1000000)}`;
        const panel = $.GetContextPanel?.();
        const root = findRootPanel();

        if (panel && typeof panel.SetAttributeString === "function") {
            panel.SetAttributeString(ATTRS.clearRequest(), "1");
            panel.SetAttributeString(ATTRS.clearToken(), token);
            panel.SetAttributeString(ATTRS.clearMsg(), "queued");
            panel.SetAttributeString(ATTRS.clearState(), "pending");
        }
        if (root && typeof root.SetAttributeString === "function") {
            root.SetAttributeString(ATTRS.clearRequest(), "1");
            root.SetAttributeString(ATTRS.clearToken(), token);
            root.SetAttributeString(ATTRS.clearMsg(), "queued");
            root.SetAttributeString(ATTRS.clearState(), "pending");
        }

        const bridge = Q.core?.storageBridge || globalThis.QOLStorageBridge;
        if (bridge && typeof bridge.clearSettings === "function") {
            bridge.clearSettings(() => {
                if (panel && typeof panel.SetAttributeString === "function") {
                    panel.SetAttributeString(ATTRS.clearState(), "success");
                    panel.SetAttributeString(ATTRS.clearMsg(), "success");
                }
                if (root && typeof root.SetAttributeString === "function") {
                    root.SetAttributeString(ATTRS.clearState(), "success");
                    root.SetAttributeString(ATTRS.clearMsg(), "success");
                }
            });
        }

        return token;
    };

    const readBuildClearStatus = () => {
        const panel = $.GetContextPanel?.();
        const root = findRootPanel();
        const fromRoot = (root && typeof root.GetAttributeString === "function") ? {
            state: root.GetAttributeString(ATTRS.clearState(), ""),
            msg: root.GetAttributeString(ATTRS.clearMsg(), ""),
            token: root.GetAttributeString(ATTRS.clearToken(), ""),
        } : { state: "", msg: "", token: "" };

        if (fromRoot.state || fromRoot.msg || fromRoot.token) return fromRoot;

        if (panel && typeof panel.GetAttributeString === "function") {
            return {
                state: panel.GetAttributeString(ATTRS.clearState(), ""),
                msg: panel.GetAttributeString(ATTRS.clearMsg(), ""),
                token: panel.GetAttributeString(ATTRS.clearToken(), ""),
            };
        }
        return { state: "", msg: "", token: "" };
    };

    const resolveBuildClearPendingLabel = (message) => {
        switch (message) {
            case "starting":
                return "START";
            case "switching_to_skyrunner":
            case "switching_to_airheart":
            case "switch_hero":
            case "confirm_hero":
                return "SKYRUNNER";
            case "await_user_open_shop":
            case "waiting_for_shop":
            case "open_shop":
                return "OPEN SHOP";
            case "opening_builds_list":
            case "await_build_browser":
                return "BROWSE";
            case "deleting_build":
            case "delete_candidate":
                return "CLEARING";
            case "confirming_delete":
            case "confirm_delete":
                return "CONFIRM";
            case "verifying_clear":
            case "verify_clear":
                return "VERIFY";
            default:
                return "CLEARING";
        }
    };

    const isBuildClearUserPromptStage = (message) => {
        return message === "await_user_open_shop" || message === "waiting_for_shop";
    };

    const watchBuildClearStatus = (clearBtn, clearLbl, expectedToken, defaultLabel) => {
        const startMs = Date.now ? Date.now() : (new Date()).getTime();
        const timeoutMs = 30000;

        const restoreDefault = () => {
            if (!isAlive(clearBtn)) return;
            clearBtn.RemoveClass("SuccessState");
            clearBtn.RemoveClass("FailureState");
            clearBtn.RemoveClass("UserPromptState");
            if (clearLbl) clearLbl.text = defaultLabel;
        };

        const tick = () => {
            if (!isAlive(clearBtn)) return;
            const nowMs = Date.now ? Date.now() : (new Date()).getTime();
            const elapsedMs = nowMs - startMs;
            const status = readBuildClearStatus();
            const tokenMatches = !expectedToken || !status.token || status.token === expectedToken;

            if (status.state === "pending" && tokenMatches) {
                clearBtn.RemoveClass("FailureState");
                clearBtn.AddClass("SuccessState");
                if (clearLbl) clearLbl.text = localize(resolveBuildClearPendingLabel(status.msg || ""), true);
                if (elapsedMs >= timeoutMs) {
                    clearBtn.RemoveClass("SuccessState");
                    clearBtn.AddClass("FailureState");
                    if (clearLbl) clearLbl.text = localize("TIMEOUT", true);
                    setFeedbackMessage("Clear timed out. Try again.", "error", 2600);
                    if (typeof $.Schedule === "function") $.Schedule(0.75, restoreDefault);
                    return;
                }
                if (typeof $.Schedule === "function") $.Schedule(0.15, tick);
                return;
            }

            if (status.state === "success" && tokenMatches) {
                clearBtn.RemoveClass("FailureState");
                clearBtn.AddClass("SuccessState");
                if (clearLbl) clearLbl.text = localize("CLEARED", true);
                setFeedbackMessage("Clear completed.", "success", 2200);
                if (typeof $.Schedule === "function") $.Schedule(0.75, restoreDefault);
                return;
            }

            if (status.state === "failed" && tokenMatches) {
                clearBtn.RemoveClass("SuccessState");
                clearBtn.AddClass("FailureState");
                if (clearLbl) clearLbl.text = localize("FAILED", true);
                setFeedbackMessage("Clear failed.", "error", 2600);
                if (typeof $.Schedule === "function") $.Schedule(0.75, restoreDefault);
                return;
            }

            if (elapsedMs < timeoutMs) {
                if (typeof $.Schedule === "function") $.Schedule(0.15, tick);
                return;
            }
            restoreDefault();
        };

        tick();
    };

    // Export API on Q.ui.cloudSync
    Q.ui.cloudSync = {
        queueBuildSaveRequest,
        readBuildSaveStatus,
        resolveBuildSavePendingLabel,
        watchBuildSaveStatus,
        activateBuildSaveFromUi,
        queueBuildClearRequest,
        readBuildClearStatus,
        resolveBuildClearPendingLabel,
        isBuildClearUserPromptStage,
        watchBuildClearStatus,
    };

    // Backward compatibility globals
    globalThis.QueueBuildSaveRequest = queueBuildSaveRequest;
    globalThis.ReadBuildSaveStatus = readBuildSaveStatus;
    globalThis.ResolveBuildSavePendingLabel = resolveBuildSavePendingLabel;
    globalThis.WatchBuildSaveStatus = watchBuildSaveStatus;
    globalThis.ActivateBuildSaveFromUi = activateBuildSaveFromUi;
    globalThis.QueueBuildClearRequest = queueBuildClearRequest;
    globalThis.ReadBuildClearStatus = readBuildClearStatus;
    globalThis.ResolveBuildClearPendingLabel = resolveBuildClearPendingLabel;
    globalThis.IsBuildClearUserPromptStage = isBuildClearUserPromptStage;
    globalThis.WatchBuildClearStatus = watchBuildClearStatus;
})();

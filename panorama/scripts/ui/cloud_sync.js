// panorama/scripts/ui/cloud_sync.js
// =============================================================================
// QOLLOCK — Cloud / Shop Build Sync Subsystem (ES6)
// =============================================================================
// Encapsulates asynchronous shop build save and clear request queuing,
// status polling, pending stage label mapping, user prompt transitions,
// and UI feedback integration.
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

    const isAlive = Q.core.panel.isAlive;

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

    const localize = Q.ui.renderer.localize;

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
        let lastFeedbackKey = "";

        const setFeedbackForPending = (msg) => {
            const key = `pending:${String(msg || "")}`;
            if (key === lastFeedbackKey) return;
            lastFeedbackKey = key;
            const message = String(msg || "");
            if (message === "waiting_for_shop" || message === "open_shop") {
                setFeedbackMessage("Open shop to continue save.", "warning", 0);
                return;
            }
            if (
                message === "switching_to_skyrunner" || message === "switching_to_airheart" ||
                message === "switching_to_storage_hero" || message === "switch_hero" ||
                message === "confirm_hero"
            ) {
                setFeedbackMessage("Switching to Skyrunner...", "info", 0);
                return;
            }
            if (
                message === "writing_category_name" || message === "saving" ||
                message === "write_description" || message === "commit" ||
                message === "await_commit"
            ) {
                setFeedbackMessage("Writing settings string to build...", "info", 0);
                return;
            }
            setFeedbackMessage("Save in progress...", "info", 0);
        };

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
                setFeedbackForPending(status.msg || "");
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
                setFeedbackMessage("Save completed.", "success", 2200);
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

    const activateBuildSaveFromUi = (saveBtn, saveLbl, onBeforeQueue) => {
        if (!isAlive(saveBtn) || !saveLbl) return;
        const nowMs = Date.now ? Date.now() : (new Date()).getTime();
        if (gSaveButtonLastActionMs > nowMs - SAVE_BUTTON_DEBOUNCE_MS) return;
        gSaveButtonLastActionMs = nowMs;

        const cfgSave = localize("SAVE", true);
        const cfgQueued = localize("QUEUED", true);
        const cfgFailed = localize("FAILED", true);

        if (typeof onBeforeQueue === "function") {
            try { onBeforeQueue(); } catch {}
        }

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

        saveBtn.RemoveClass("FailureState");
        saveBtn.AddClass("SuccessState");
        saveLbl.text = cfgQueued;
        setFeedbackMessage("Save queued.", "info", 0);
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

        const saveStatus = readBuildSaveStatus();
        if (saveStatus && saveStatus.state === "pending") return "";

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
            case "confirming_skyrunner":
            case "confirming_airheart":
                return "SKYRUNNER";
            case "await_user_open_shop":
            case "waiting_for_shop":
                return "OPEN SHOP";
            case "opening_builds_list":
                return "BROWSE";
            case "deleting_build":
                return "CLEARING";
            case "confirming_delete":
                return "CONFIRM";
            case "verifying_clear":
                return "VERIFY";
            default:
                return "CLEARING";
        }
    };

    const isBuildClearUserPromptStage = (message) => (
        message === "await_user_open_shop" || message === "waiting_for_shop"
    );

    const watchBuildClearStatus = (clearBtn, clearLbl, expectedToken, defaultLabel) => {
        const startMs = Date.now ? Date.now() : (new Date()).getTime();
        const timeoutMs = 30000;
        let forcedCloseForPrompt = false;
        let lastFeedbackKey = "";

        const setFeedbackForPending = (msg, isPrompt) => {
            const key = `${String(msg || "")}|${isPrompt ? 1 : 0}`;
            if (key === lastFeedbackKey) return;
            lastFeedbackKey = key;
            if (isPrompt) {
                setFeedbackMessage("Open shop to continue clear.", "warning", 0);
                return;
            }
            if (
                msg === "switching_to_skyrunner" ||
                msg === "switching_to_airheart" ||
                msg === "confirming_skyrunner" ||
                msg === "confirming_airheart"
            ) {
                setFeedbackMessage("Confirming Skyrunner for clear...", "info", 0);
                return;
            }
            if (msg === "deleting_build" || msg === "confirming_delete") {
                setFeedbackMessage("Clearing builds...", "info", 0);
                return;
            }
            setFeedbackMessage("Clear in progress...", "info", 0);
        };

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
                const pendingMsg = status.msg || "";
                const isUserPromptStage = isBuildClearUserPromptStage(pendingMsg);
                if (isUserPromptStage) {
                    clearBtn.RemoveClass("SuccessState");
                    clearBtn.AddClass("FailureState");
                    clearBtn.AddClass("UserPromptState");
                    if (clearLbl) clearLbl.text = localize(resolveBuildClearPendingLabel(pendingMsg), true);
                    setFeedbackForPending(pendingMsg, true);
                    if (!forcedCloseForPrompt) {
                        forcedCloseForPrompt = true;
                        if (typeof $.ForceCloseModSettings === "function") {
                            $.ForceCloseModSettings();
                        }
                    }
                } else {
                    forcedCloseForPrompt = false;
                    clearBtn.RemoveClass("UserPromptState");
                    clearBtn.RemoveClass("FailureState");
                    clearBtn.AddClass("SuccessState");
                    if (clearLbl) clearLbl.text = localize(resolveBuildClearPendingLabel(pendingMsg), true);
                    setFeedbackForPending(pendingMsg, false);
                }
                if (elapsedMs >= timeoutMs) {
                    clearBtn.RemoveClass("SuccessState");
                    clearBtn.AddClass("FailureState");
                    clearBtn.RemoveClass("UserPromptState");
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
                clearBtn.RemoveClass("UserPromptState");
                if (clearLbl) clearLbl.text = localize("CLEARED", true);
                setFeedbackMessage("Clear completed.", "success", 2200);
                if (typeof $.Schedule === "function") $.Schedule(0.75, restoreDefault);
                return;
            }

            if (status.state === "failed" && tokenMatches) {
                clearBtn.RemoveClass("SuccessState");
                clearBtn.AddClass("FailureState");
                clearBtn.RemoveClass("UserPromptState");
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

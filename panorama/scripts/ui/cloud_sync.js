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

    // One debounced snapshot and one in-flight durable save. Publication remains
    // synchronous; CEF acknowledgments must belong to the latest user intent.
    const autoSave = (() => {
        let pending = null, inFlight = null, timer = null, generation = 0;
        let enabled = false, savedRaw = "";
        const current = record => isAlive(record.context) && isAlive(record.root) &&
            record.context === $.GetContextPanel() && record.root === findRootPanel();
        const cancelTimer = () => {
            if (timer !== null) {
                try { $.CancelScheduled(timer); } catch (_) {}
                timer = null;
            }
        };
        const cancel = () => {
            generation++;
            cancelTimer(); pending = null; savedRaw = "";
        };
        const run = record => {
            if (pending !== record || record.generation !== generation) return;
            timer = null;
            if (!current(record)) { pending = null; return; }
            if (inFlight) return;
            pending = null;
            inFlight = record;
            setFeedbackMessage("Saving settings...", "info", 0);
            const complete = error => {
                if (inFlight !== record) return;
                inFlight = null;
                if (record.generation === generation && current(record)) {
                    if (error) {
                        savedRaw = "";
                        setFeedbackMessage("Save failed.", "error", 2600);
                        $.Msg("[QOLLOCK] Auto-Save failed: " + String(error.message || error));
                    } else {
                        savedRaw = record.raw;
                        setFeedbackMessage("Settings saved successfully.", "success", 2000);
                    }
                }
                // A newer edit already waited its debounce while CEF was busy.
                if (pending && timer === null) run(pending);
            };
            const bridge = Q.core?.storageBridge;
            if (!bridge?.saveSettings) { complete(new Error("Storage bridge unavailable")); return; }
            bridge.saveSettings(record.raw, complete);
        };
        const observe = raw => {
            const nextEnabled = Q.getSettingsConfig().AUTO_SAVE_CHANGES === 1;
            const disabling = enabled && !nextEnabled;
            enabled = nextEnabled;
            if (!enabled && !disabling) return;
            if (pending?.raw === raw && current(pending)) return;
            if (!pending && inFlight?.raw === raw && inFlight.generation === generation && current(inFlight)) return;
            if (!pending && !inFlight && savedRaw === raw) return;
            cancelTimer();
            const record = { raw, context: $.GetContextPanel(), root: findRootPanel(), generation: ++generation };
            pending = record;
            timer = $.Schedule(0.6, () => run(record));
        };
        const restored = (config, raw) => {
            if (pending && pending.raw !== raw) cancel();
            enabled = config.AUTO_SAVE_CHANGES === 1;
        };
        return { observe, cancel, restored };
    })();

    let gSaveButtonLastActionMs = 0;
    let saveUiGeneration = 0;
    const SAVE_BUTTON_DEBOUNCE_MS = 1000;

    /**
     * Saves the current settings to CEF local storage and provides instant UI feedback.
     */
    const activateSaveFromUi = (saveBtn, saveLbl) => {
        if (!isAlive(saveBtn) || !saveLbl) return;
        const nowMs = Date.now ? Date.now() : (new Date()).getTime();
        if (gSaveButtonLastActionMs > nowMs - SAVE_BUTTON_DEBOUNCE_MS) return;
        gSaveButtonLastActionMs = nowMs;
        const generation = ++saveUiGeneration;
        const context = $.GetContextPanel?.(), root = findRootPanel();
        const isCurrent = () => {
            try {
                return generation === saveUiGeneration && isAlive(saveBtn) && isAlive(saveLbl) &&
                    context === $.GetContextPanel?.() && root === findRootPanel();
            } catch (_) { return false; }
        };

        const cfgSave = localize("SAVE", true);
        const cfgSaving = localize("SAVING", true);
        const cfgSaved = localize("SAVED", true);
        const cfgFailed = localize("FAILED", true);

        autoSave.cancel();

        saveBtn.RemoveClass("FailureState");
        saveBtn.AddClass("SuccessState");
        saveLbl.text = cfgSaving;
        setFeedbackMessage("Saving settings...", "info", 0);

        const complete = err => {
            if (!isCurrent()) return;
            saveBtn.RemoveClass("SuccessState");
            saveBtn.RemoveClass("FailureState");
            saveBtn.AddClass(err ? "FailureState" : "SuccessState");
            saveLbl.text = err ? cfgFailed : cfgSaved;
            if (err) setFeedbackMessage(`Save failed: ${err.message || err}`, "error", 2600);
            else setFeedbackMessage("Settings saved successfully.", "success", 2000);
            $.Schedule(1.2, () => {
                if (!isCurrent()) return;
                saveBtn.RemoveClass("SuccessState");
                saveBtn.RemoveClass("FailureState");
                saveLbl.text = cfgSave;
            });
        };
        const bridge = Q.core?.storageBridge;
        if (!bridge?.saveSettings) {
            complete(new Error(localize("Save failed.", true)));
            return;
        }
        try { bridge.saveSettings(Q.getSettingsConfig(), complete); }
        catch (error) { complete(error); }
    };

    Q.ui.cloudSync = { autoSave, activateSaveFromUi };
})();

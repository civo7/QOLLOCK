// =============================================================================
// QOLLOCK — core/ql_settings_loader.js
// =============================================================================
// OWNS:        Visual progress cards for config loading & saving sessions
//              (#QOLSettingsLoaderOverlay and #QOLSaveSettingsLoaderOverlay).
//              Styles are defined in panorama/styles/core/ql_settings_loader.css.
// DOES NOT OWN: Build storage driver/manifest, config codec, hero selection.
// DEPENDS ON:  core/ql_namespace.js, core/ql_panel_helpers.js, ql_state.js
// LOAD ORDER:  Included in hud.xml before build storage and ql_core.js
// =============================================================================

(() => {
    "use strict";

    const Q = (typeof globalThis !== "undefined" && globalThis.QOL) ? globalThis.QOL : (typeof QOL !== "undefined" ? QOL : {});
    const State = (typeof globalThis !== "undefined" && globalThis.State) ? globalThis.State : (typeof window !== "undefined" && window.State ? window.State : { cachedPanels: {} });
    const Panel = Q.core?.panel || Q.ui?.PanelHelpers || {};
    const Hud = Q.core?.hud || {};

    const isPanelValid = Panel.isAlive || ((p) => p != null && typeof p.IsValid === "function" && p.IsValid());
    const getCachedPanel = Q.getCachedPanel || ((k) => {
        const p = State.cachedPanels ? State.cachedPanels[k] : null;
        if (isPanelValid(p)) return p;
        if (State.cachedPanels) State.cachedPanels[k] = null;
        return null;
    });
    const setCachedPanel = Q.setCachedPanel || ((k, p) => {
        if (State.cachedPanels) State.cachedPanels[k] = isPanelValid(p) ? p : null;
    });
    const getUIRoot = Q.getUIRoot || (() => (Panel.findRoot ? Panel.findRoot() : (typeof $.GetContextPanel === "function" ? $.GetContextPanel() : null)));
    const activatePanelSafe = Panel.activate || ((p) => {
        if (!isPanelValid(p)) return false;
        try { $.DispatchEvent("Activated", p, "mouse"); return true; } catch (_) {}
        try { $.DispatchEvent("Activated", p); return true; } catch (_) {}
        return false;
    });
    const setPanelOpacitySafe = (typeof QOL_UTILS !== "undefined" && QOL_UTILS.SetPanelOpacitySafe)
        ? QOL_UTILS.SetPanelOpacitySafe
        : ((p, o) => { if (p?.style) p.style.opacity = String(o); });
    const QOL_WARN = (typeof QOL_UTILS !== "undefined" && QOL_UTILS.WarnLog)
        ? QOL_UTILS.WarnLog
        : (() => {});

    // ── Engine HUD & Hideout Detection ──
    const isHudClassActive = (root, className) => {
        if (!className) return false;
        if (typeof Hud?.isClassActive === "function") {
            return Hud.isClassActive(className);
        }
        const r = root || getUIRoot();
        if (!r) return false;
        return Panel.hasClassToken ? Panel.hasClassToken(r, className) : (r.BHasClass ? r.BHasClass(className) : false);
    };

    const isConnectedToHideout = (root) => {
        const r = root || getUIRoot();
        if (!r) return false;
        const hud = (Q.resolveHudPanel ? Q.resolveHudPanel(r) : null) || (r.FindChildTraverse ? r.FindChildTraverse("Hud") : null);
        if (hud?.BHasClass && (hud.BHasClass("connectedToHideout") || hud.BHasClass("InHideout"))) return true;
        if (r.BHasClass && (r.BHasClass("connectedToHideout") || r.BHasClass("InHideout"))) return true;
        return isHudClassActive(r, "connectedToHideout") || isHudClassActive(r, "InHideout");
    };

    // ── Shop and Browse Popup Cleanup ──
    const findBrowseBuildsCancelButton = (root) => {
        if (!root?.FindChildTraverse) return { panel: null };
        let popup = root.FindChildTraverse("PopupBuildBrowser") || root.FindChildTraverse("BrowseBuilds");
        if (!popup) {
            const uiRoot = getUIRoot();
            if (uiRoot?.FindChildTraverse) {
                popup = uiRoot.FindChildTraverse("PopupBuildBrowser") || uiRoot.FindChildTraverse("BrowseBuilds");
            }
        }
        if (!popup) return { panel: null };
        const btn = popup.FindChildTraverse ? (popup.FindChildTraverse("Button1") || popup.FindChildTraverse("CancelButton")) : null;
        if (btn && isPanelValid(btn)) return { panel: btn };
        const stack = [popup];
        let scanned = 0;
        while (stack.length > 0 && scanned < 100) {
            const p = stack.pop();
            scanned++;
            if (!p || !p.IsValid || !p.IsValid()) continue;
            const id = (p.id || "").toLowerCase();
            if (id.includes("cancel") || id.includes("close")) {
                return { panel: p };
            }
            const kids = p.Children ? p.Children() : [];
            for (let i = 0; i < kids.length; i++) stack.push(kids[i]);
        }
        return { panel: null };
    };

    const tryCloseBrowseBuildsPopupForLoader = (root) => {
        if (!root || !isConnectedToHideout(root)) return false;
        const cancelLookup = findBrowseBuildsCancelButton(root);
        const cancelBtn = cancelLookup?.panel || null;
        if (!cancelBtn || cancelBtn.visible === false) return false;
        return activatePanelSafe(cancelBtn);
    };

    const tryCloseHeroShopForLoader = (root) => {
        if (!root || !isConnectedToHideout(root)) return false;
        const closedBrowsePopup = tryCloseBrowseBuildsPopupForLoader(root);
        const wasOpen = isHudClassActive(root, "gShopOpen");
        if (!wasOpen) return closedBrowsePopup || true;

        let closed = false;
        try {
            if (typeof CitadelExitUpgradeShop === "function") {
                CitadelExitUpgradeShop();
                closed = true;
            }
        } catch (e0) {
            QOL_WARN("core", `op failed: ${e0?.message || e0}`);
        }
        if (!closed) {
            const shopPanel = root.FindChildTraverse ? root.FindChildTraverse("HeroShop") : null;
            const leftCommandPanel = shopPanel?.FindChildTraverse ? shopPanel.FindChildTraverse("LeftCommandPanel") : null;
            if (activatePanelSafe(leftCommandPanel)) closed = true;
        }
        if (!closed) {
            if (Q.dispatchCitadelConCommand) {
                Q.dispatchCitadelConCommand("citadel_open_hero_sheet");
            }
            closed = true;
        }
        return closed || closedBrowsePopup;
    };

    const queueCloseHeroShopForLoaderSuccess = () => {
        const delays = [0.00, 0.20, 0.55];
        for (let i = 0; i < delays.length; i++) {
            const delaySec = delays[i];
            $.Schedule(delaySec, () => {
                const closeRoot = getUIRoot();
                if (closeRoot) {
                    tryCloseHeroShopForLoader(closeRoot);
                }
            });
        }
    };

    // ── Constants ──
    const PANEL_ID_SHOP_MODS_SELECTED_BUILD = "ShopModsSelectedBuild";
    const SETTINGS_LOADER_ENABLED = true;
    const SETTINGS_LOADER_DEBUG = false;
    const SETTINGS_LOADER_DEBUG_THROTTLE_MS = 350;
    const SETTINGS_LOADER_TRACE = false;
    const SETTINGS_LOADER_TRACE_THROTTLE_MS = 1000;
    const SETTINGS_LOADER_REASSERT_MS = 250;
    const SETTINGS_LOADER_HOLD_MS = 1000;
    const SETTINGS_LOADER_OVERLAY_ID = "QOLSettingsLoaderOverlay";
    const SETTINGS_LOADER_CARD_ID = "QOLSettingsLoaderCard";
    const SETTINGS_LOADER_WARNING_ID = "QOLSettingsLoaderWarning";
    const SETTINGS_LOADER_TITLE_ID = "QOLSettingsLoaderTitle";
    const SETTINGS_LOADER_STEPS_WRAP_ID = "QOLSettingsLoaderStepsWrap";
    const SETTINGS_LOADER_STEP_ROW_ID_PREFIX = "QOLSettingsLoaderStepRow_";
    const SETTINGS_LOADER_STEP_ICON_ID_SUFFIX = "_Icon";
    const SETTINGS_LOADER_STEP_LABEL_ID_SUFFIX = "_Label";
    const SETTINGS_LOADER_DETAIL_ID = "QOLSettingsLoaderDetail";
    const SETTINGS_LOADER_WARNING_TEXT = "DO NOT PRESS ANYTHING";
    const SETTINGS_LOADER_ICON_PENDING = "s2r://panorama/images/getting_started/checklist_task_empty_png.vtex";
    const SETTINGS_LOADER_ICON_DONE = "s2r://panorama/images/getting_started/checklist_task_complete_png.vtex";
    const SETTINGS_LOADER_ICON_ACTIVE = "s2r://panorama/images/glyphs/arrow_right.vsvg";
    const SETTINGS_LOADER_ICON_ERROR = "s2r://panorama/images/control_icons/x_close_filled_png.vtex";
    const LOADER_DETAIL_SPINNER_FRAMES = ["|", "/", "-", "\\"];
    const LOADER_DETAIL_SPINNER_FRAME_MS = 180;

    const SETTINGS_LOADER_STEPS = [
        { key: "start", label: "Start" },
        { key: "switch_airheart", label: "Switching to Skyrunner" },
        { key: "confirm_airheart", label: "Confirming Skyrunner Context" },
        { key: "read_payload", label: "Reading Build Payload (Read-Only)" },
        { key: "decode_payload", label: "Decoding Payload" },
        { key: "apply_config", label: "Applying Config" },
        { key: "return_hero", label: "Returning To Original Hero" },
        { key: "complete", label: "Complete" }
    ];

    const SAVE_SETTINGS_LOADER_ENABLED = true;
    const SAVE_SETTINGS_LOADER_REASSERT_MS = 250;
    const SAVE_SETTINGS_LOADER_HOLD_MS = 1000;
    const SAVE_SETTINGS_LOADER_OVERLAY_ID = "QOLSaveSettingsLoaderOverlay";
    const SAVE_SETTINGS_LOADER_CARD_ID = "QOLSaveSettingsLoaderCard";
    const SAVE_SETTINGS_LOADER_WARNING_ID = "QOLSaveSettingsLoaderWarning";
    const SAVE_SETTINGS_LOADER_TITLE_ID = "QOLSaveSettingsLoaderTitle";
    const SAVE_SETTINGS_LOADER_STEPS_WRAP_ID = "QOLSaveSettingsLoaderStepsWrap";
    const SAVE_SETTINGS_LOADER_STEP_ROW_ID_PREFIX = "QOLSaveSettingsLoaderStepRow_";
    const SAVE_SETTINGS_LOADER_STEP_ICON_ID_SUFFIX = "_Icon";
    const SAVE_SETTINGS_LOADER_STEP_LABEL_ID_SUFFIX = "_Label";
    const SAVE_SETTINGS_LOADER_DETAIL_ID = "QOLSaveSettingsLoaderDetail";
    const SAVE_SETTINGS_LOADER_STALL_HINT_ID = "QOLSaveSettingsLoaderStallHint";
    const SAVE_SETTINGS_LOADER_STALL_HINT_TEXT = "If saving stalls, open your shop.";

    const SAVE_SETTINGS_LOADER_STEPS = [
        { key: "start", label: "Start" },
        { key: "switch_airheart", label: "Switching to Skyrunner" },
        { key: "confirm_airheart", label: "Confirming Skyrunner Context" },
        { key: "prepare_build", label: "Preparing Build UI" },
        { key: "write_payload", label: "Writing Payload" },
        { key: "commit_save", label: "Saving Build" },
        { key: "verify_save", label: "Verifying Save" },
        { key: "return_hero", label: "Returning To Selected Hero" },
        { key: "complete", label: "Complete" }
    ];

    // ── Diagnostics & Logging ──
    const settingsLoaderDebugLog = (msg) => {
        if (!SETTINGS_LOADER_DEBUG) return;
        $.Msg(`[QOLLock][SettingsLoaderDebug] ${msg}`);
    };

    const settingsLoaderTraceLog = (msg) => {
        if (!SETTINGS_LOADER_TRACE) return;
        $.Msg(`[QOLLock][SettingsLoaderTrace] ${msg}`);
    };

    const settingsLoaderTraceLogThrottled = (sig, msg, nowMs) => {
        if (!SETTINGS_LOADER_TRACE) return;
        const now = Number(nowMs) || (Date.now ? Date.now() : (new Date()).getTime());
        const sameSig = sig && sig === State.settingsLoaderTraceLastSig;
        if (sameSig && now < (State.settingsLoaderTraceNextMs || 0)) return;
        State.settingsLoaderTraceLastSig = sig || "";
        State.settingsLoaderTraceNextMs = now + SETTINGS_LOADER_TRACE_THROTTLE_MS;
        settingsLoaderTraceLog(msg);
    };

    const settingsLoaderDebugLogThrottled = (sig, msg, nowMs) => {
        if (!SETTINGS_LOADER_DEBUG) return;
        const now = Number(nowMs) || (Date.now ? Date.now() : (new Date()).getTime());
        const sameSig = sig && sig === State.settingsLoaderDebugLastSig;
        if (sameSig && now < (State.settingsLoaderDebugNextMs || 0)) return;
        State.settingsLoaderDebugLastSig = sig || "";
        State.settingsLoaderDebugNextMs = now + SETTINGS_LOADER_DEBUG_THROTTLE_MS;
        settingsLoaderDebugLog(msg);
    };

    const setSettingsLoaderDebugOverlayLine = (lineText) => {
        if (!SETTINGS_LOADER_DEBUG) return;
        State.settingsLoaderDebugOverlayLine = lineText ? String(lineText) : "";
        State.settingsLoaderLastRenderSig = "";
    };

    const isSettingsLoaderShopPromptDetail = (text) => {
        if (!text) return false;
        const lower = String(text).toLowerCase();
        return lower.includes("open your shop") ||
            lower.includes("open shop") ||
            lower.includes("potential corrupt save") ||
            lower.includes("welcome to qol lock") ||
            lower.includes("press alt+f4") ||
            lower.includes("let the loader run");
    };

    const resolveSettingsThemeId = (cfg) => {
        const raw = Math.round(Number(cfg && cfg.SETTINGS_THEME));
        if (raw >= 1 && raw <= 5) return raw;
        return 0;
    };

    const decorateLoaderDetailWithSpinner = (detailText, nowMs, isSessionActive, isSessionCompleted) => {
        const text = detailText ? String(detailText) : "";
        if (!text || !isSessionActive || isSessionCompleted) return text;
        const frameMs = Number(LOADER_DETAIL_SPINNER_FRAME_MS) || 180;
        const now = Number(nowMs) || (Date.now ? Date.now() : (new Date()).getTime());
        const frameIndex = Math.floor(now / frameMs) % LOADER_DETAIL_SPINNER_FRAMES.length;
        return `${LOADER_DETAIL_SPINNER_FRAMES[frameIndex]} ${text}`;
    };

    const traceLoaderOverlay = (tag, overlay, shouldShow) => {
        if (!SETTINGS_LOADER_TRACE) return;
        const now = Date.now ? Date.now() : (new Date()).getTime();
        settingsLoaderTraceLogThrottled(
            `overlay_${tag}_${shouldShow ? "show" : "hide"}`,
            `overlay tag=${tag} visible=${shouldShow ? "1" : "0"} valid=${isPanelValid(overlay) ? "1" : "0"}`,
            now
        );
    };

    // ── Generic Step & Overlay Factory ──
    const getLoaderStepIndex = (stepKey, steps) => {
        if (!stepKey) return -1;
        for (let i = 0; i < steps.length; i++) {
            if (steps[i].key === stepKey) return i;
        }
        return -1;
    };

    const resetLoaderStepStates = (stateObj, steps) => {
        if (!stateObj || typeof stateObj !== "object") return;
        for (const k of Object.keys(stateObj)) {
            delete stateObj[k];
        }
        for (let i = 0; i < steps.length; i++) {
            stateObj[steps[i].key] = "pending";
        }
    };

    const resetLoaderSessionInternal = (statePrefix, cachedOverlayKey, steps, hideOverlay) => {
        State[`${statePrefix}SessionToken`] = "";
        State[`${statePrefix}SessionActive`] = false;
        State[`${statePrefix}SessionCompleted`] = false;
        State[`${statePrefix}CurrentStep`] = "";
        State[`${statePrefix}Detail`] = "";
        State[`${statePrefix}Result`] = "";
        State[`${statePrefix}ShowUntilMs`] = 0;
        State[`${statePrefix}NextReassertMs`] = 0;
        State[`${statePrefix}LastRenderSig`] = "";
        resetLoaderStepStates(State[`${statePrefix}StepStates`], steps);
        if (hideOverlay) {
            const overlay = getCachedPanel(cachedOverlayKey);
            if (overlay?.style) {
                try { overlay.style.visibility = "collapse"; } catch (_) {}
            }
        }
    };

    const beginLoaderSessionInternal = (statePrefix, steps, requestToken, nowMs, initialDetail, enabledCheck) => {
        if (enabledCheck && !enabledCheck()) return;
        const token = requestToken ? String(requestToken) : "";
        if (!token) return;
        if (State[`${statePrefix}SessionToken`] === token &&
            (State[`${statePrefix}SessionActive`] || State[`${statePrefix}SessionCompleted`])) return;

        const now = Number(nowMs) || (Date.now ? Date.now() : (new Date()).getTime());
        State[`${statePrefix}SessionToken`] = token;
        State[`${statePrefix}SessionActive`] = true;
        State[`${statePrefix}SessionCompleted`] = false;
        State[`${statePrefix}CurrentStep`] = "start";
        State[`${statePrefix}Detail`] = initialDetail || "";
        State[`${statePrefix}Result`] = "";
        State[`${statePrefix}ShowUntilMs`] = 0;
        State[`${statePrefix}NextReassertMs`] = now + SETTINGS_LOADER_REASSERT_MS;
        State[`${statePrefix}LastRenderSig`] = "";
        resetLoaderStepStates(State[`${statePrefix}StepStates`], steps);
        State[`${statePrefix}StepStates`].start = "active";
    };

    const setLoaderStepStateInternal = (statePrefix, steps, stepKey, status, detail, onDoneNextActive) => {
        if (!stepKey || !State[`${statePrefix}StepStates`]) return;
        const normalized = status === "active" || status === "done" || status === "error" || status === "skipped"
            ? status : "pending";
        State[`${statePrefix}StepStates`][stepKey] = normalized;
        if (detail !== undefined && detail !== null) {
            State[`${statePrefix}Detail`] = String(detail);
        }
        if (normalized === "active") {
            State[`${statePrefix}CurrentStep`] = stepKey;
        } else if (normalized === "done" && onDoneNextActive) {
            const idx = getLoaderStepIndex(stepKey, steps);
            if (idx >= 0 && idx < steps.length - 1) {
                const nextKey = steps[idx + 1].key;
                if (State[`${statePrefix}StepStates`][nextKey] === "pending") {
                    State[`${statePrefix}StepStates`][nextKey] = "active";
                    State[`${statePrefix}CurrentStep`] = nextKey;
                }
            }
        }
    };

    // ── Build Single UI Card (Shared for Load and Save) ──
    const createLoaderCard = (root, cfg) => {
        let overlay = root.FindChildTraverse ? root.FindChildTraverse(cfg.overlayId) : null;
        if (!overlay) {
            overlay = $.CreatePanel("Panel", root, cfg.overlayId);
        }
        overlay.SetHasClass("QOLLoaderOverlay", true);

        // Apply theme class
        const themeId = resolveSettingsThemeId(State.lastConfig || (Q.buildDefaultConfig ? Q.buildDefaultConfig() : {}));
        for (let t = 1; t <= 5; t++) {
            overlay.SetHasClass(`theme-${t}`, t === themeId);
        }

        let card = overlay.FindChildTraverse ? overlay.FindChildTraverse(cfg.cardId) : null;
        if (!card) {
            card = $.CreatePanel("Panel", overlay, cfg.cardId);
            card.SetHasClass("QOLLoaderCard", true);
        }

        let warning = card.FindChildTraverse ? card.FindChildTraverse(cfg.warningId) : null;
        if (!warning) {
            warning = $.CreatePanel("Label", card, cfg.warningId);
            warning.SetHasClass("QOLLoaderWarning", true);
            warning.text = SETTINGS_LOADER_WARNING_TEXT;
        }

        let title = card.FindChildTraverse ? card.FindChildTraverse(cfg.titleId) : null;
        if (!title) {
            title = $.CreatePanel("Label", card, cfg.titleId);
            title.SetHasClass("QOLLoaderTitle", true);
            title.text = cfg.titleText;
        }

        let stepsWrap = card.FindChildTraverse ? card.FindChildTraverse(cfg.stepsWrapId) : null;
        if (!stepsWrap) {
            stepsWrap = $.CreatePanel("Panel", card, cfg.stepsWrapId);
            stepsWrap.SetHasClass("QOLLoaderStepsWrap", true);
        }

        for (let i = 0; i < cfg.steps.length; i++) {
            const step = cfg.steps[i];
            const rowId = cfg.stepRowPrefix + step.key;
            let row = stepsWrap.FindChildTraverse ? stepsWrap.FindChildTraverse(rowId) : null;
            if (!row) {
                row = $.CreatePanel("Panel", stepsWrap, rowId);
                row.SetHasClass("QOLLoaderStepRow", true);

                const icon = $.CreatePanel("Image", row, rowId + cfg.stepIconSuffix);
                icon.SetHasClass("QOLLoaderStepIcon", true);
                icon.SetImage(SETTINGS_LOADER_ICON_PENDING);

                const label = $.CreatePanel("Label", row, rowId + cfg.stepLabelSuffix);
                label.SetHasClass("QOLLoaderStepLabel", true);
                label.text = step.label;
            }
        }

        let detailLabel = card.FindChildTraverse ? card.FindChildTraverse(cfg.detailId) : null;
        if (!detailLabel) {
            detailLabel = $.CreatePanel("Label", card, cfg.detailId);
            detailLabel.SetHasClass("QOLLoaderDetail", true);
            detailLabel.text = "";
        }

        let stallHint = null;
        if (cfg.stallHintId) {
            stallHint = card.FindChildTraverse ? card.FindChildTraverse(cfg.stallHintId) : null;
            if (!stallHint) {
                stallHint = $.CreatePanel("Label", card, cfg.stallHintId);
                stallHint.SetHasClass("QOLLoaderStallHint", true);
                stallHint.text = SAVE_SETTINGS_LOADER_STALL_HINT_TEXT;
            }
        }

        let skipButton = null;
        if (cfg.hasSkip) {
            let skipDock = card.FindChildTraverse ? card.FindChildTraverse("QOLSettingsLoaderSkipDock") : null;
            if (!skipDock) {
                skipDock = $.CreatePanel("Panel", card, "QOLSettingsLoaderSkipDock");
                skipDock.SetHasClass("QOLLoaderSkipDock", true);
            }
            skipButton = skipDock.FindChildTraverse ? skipDock.FindChildTraverse("QOLSettingsLoaderSkipButton") : null;
            if (!skipButton) {
                skipButton = $.CreatePanel("Button", skipDock, "QOLSettingsLoaderSkipButton");
                skipButton.SetHasClass("QOLLoaderSkipButton", true);
                const skipLabel = $.CreatePanel("Label", skipButton, "QOLSettingsLoaderSkipButtonLabel");
                skipLabel.SetHasClass("QOLLoaderSkipLabel", true);
                skipLabel.text = "Skip";
                skipButton.SetPanelEvent("onactivate", () => {
                    skipSettingsLoaderSession(getUIRoot(), Date.now ? Date.now() : (new Date()).getTime());
                });
            }
        }

        return {
            overlay,
            card,
            warning,
            title,
            stepsWrap,
            detailLabel,
            stallHint,
            skipButton
        };
    };

    const renderStepRows = (stepsWrap, steps, stepRowPrefix, stepIconSuffix, stepStates) => {
        if (!stepsWrap?.FindChildTraverse) return "";
        let sig = "";
        const states = stepStates || {};
        for (let i = 0; i < steps.length; i++) {
            const step = steps[i];
            const status = states[step.key] || "pending";
            sig += `${step.key}=${status};`;
            const rowId = stepRowPrefix + step.key;
            const row = stepsWrap.FindChildTraverse(rowId);
            if (!row) continue;

            row.SetHasClass("step-active", status === "active");
            row.SetHasClass("step-done", status === "done");
            row.SetHasClass("step-error", status === "error");
            row.SetHasClass("step-skipped", status === "skipped");

            const icon = row.FindChildTraverse(rowId + stepIconSuffix);
            if (icon?.SetImage) {
                let iconSrc = SETTINGS_LOADER_ICON_PENDING;
                if (status === "done") iconSrc = SETTINGS_LOADER_ICON_DONE;
                else if (status === "active") iconSrc = SETTINGS_LOADER_ICON_ACTIVE;
                else if (status === "error") iconSrc = SETTINGS_LOADER_ICON_ERROR;
                icon.SetImage(iconSrc);
            }
        }
        return sig;
    };

    // ── Load Settings Loader Overlay ──
    const ensureSettingsLoaderOverlay = (root) => {
        if (!SETTINGS_LOADER_ENABLED || !root) return null;
        const overlay = getCachedPanel("settingsLoaderOverlay");
        if (isPanelValid(overlay)) return overlay;

        const panels = createLoaderCard(root, {
            overlayId: SETTINGS_LOADER_OVERLAY_ID,
            cardId: SETTINGS_LOADER_CARD_ID,
            warningId: SETTINGS_LOADER_WARNING_ID,
            titleId: SETTINGS_LOADER_TITLE_ID,
            stepsWrapId: SETTINGS_LOADER_STEPS_WRAP_ID,
            stepRowPrefix: SETTINGS_LOADER_STEP_ROW_ID_PREFIX,
            stepIconSuffix: SETTINGS_LOADER_STEP_ICON_ID_SUFFIX,
            stepLabelSuffix: SETTINGS_LOADER_STEP_LABEL_ID_SUFFIX,
            detailId: SETTINGS_LOADER_DETAIL_ID,
            stallHintId: null,
            hasSkip: true,
            steps: SETTINGS_LOADER_STEPS,
            titleText: "QOLLOCK LOADING..."
        });

        setCachedPanel("settingsLoaderOverlay", panels.overlay);
        setCachedPanel("settingsLoaderCard", panels.card);
        setCachedPanel("settingsLoaderWarning", panels.warning);
        setCachedPanel("settingsLoaderTitle", panels.title);
        setCachedPanel("settingsLoaderStepsWrap", panels.stepsWrap);
        setCachedPanel("settingsLoaderDetail", panels.detailLabel);
        setCachedPanel("settingsLoaderSkipButton", panels.skipButton);
        return panels.overlay;
    };

    const updateSettingsLoaderOverlay = (root, nowMs) => {
        if (!SETTINGS_LOADER_ENABLED) return;
        const now = Number(nowMs) || (Date.now ? Date.now() : (new Date()).getTime());
        let shouldShow = !!State.settingsLoaderSessionActive;
        if (!shouldShow && State.settingsLoaderSessionCompleted) {
            shouldShow = now < (State.settingsLoaderShowUntilMs || 0);
        }
        let overlay = getCachedPanel("settingsLoaderOverlay");
        if (!shouldShow) {
            if (overlay?.style) {
                try { overlay.style.visibility = "collapse"; } catch (_) {}
            }
            if (State.settingsLoaderSessionCompleted) {
                resetSettingsLoaderSession(true);
            }
            traceLoaderOverlay("load", overlay, false);
            return;
        }

        overlay = ensureSettingsLoaderOverlay(root);
        if (!overlay) {
            traceLoaderOverlay("load", null, true);
            return;
        }
        overlay.style.visibility = "visible";
        setPanelOpacitySafe(overlay, 1.0, 1.0);
        traceLoaderOverlay("load", overlay, true);

        const stepsWrap = getCachedPanel("settingsLoaderStepsWrap");
        const detailLabel = getCachedPanel("settingsLoaderDetail");
        const stepSig = renderStepRows(stepsWrap, SETTINGS_LOADER_STEPS, SETTINGS_LOADER_STEP_ROW_ID_PREFIX, SETTINGS_LOADER_STEP_ICON_ID_SUFFIX, State.settingsLoaderStepStates);

        let resultPrefix = "";
        if (State.settingsLoaderSessionCompleted) {
            if (State.settingsLoaderResult === "success") resultPrefix = "Result: Settings loaded.";
            else if (State.settingsLoaderResult === "failed") resultPrefix = "Result: Load failed.";
            else resultPrefix = "Result: Complete.";
        }
        let detailText = State.settingsLoaderDetail || "";
        if (resultPrefix.length > 0) {
            detailText = detailText ? `${resultPrefix} ${detailText}` : resultPrefix;
        }
        const isPromptDetail = isSettingsLoaderShopPromptDetail(detailText);
        const renderDetailText = decorateLoaderDetailWithSpinner(
            detailText,
            now,
            !!State.settingsLoaderSessionActive,
            !!State.settingsLoaderSessionCompleted
        );

        const sig = `${stepSig}|${renderDetailText}|${State.settingsLoaderSessionCompleted ? 1 : 0}`;
        if (sig === State.settingsLoaderLastRenderSig) return;
        State.settingsLoaderLastRenderSig = sig;

        if (detailLabel) {
            detailLabel.SetHasClass("is-shop-prompt", isPromptDetail);
            if (detailLabel.text !== renderDetailText) detailLabel.text = renderDetailText;
        }
    };

    // ── Save Settings Loader Overlay ──
    const ensureSaveSettingsLoaderOverlay = (root) => {
        if (!SAVE_SETTINGS_LOADER_ENABLED || !root) return null;
        const overlay = getCachedPanel("saveSettingsLoaderOverlay");
        if (isPanelValid(overlay)) return overlay;

        const panels = createLoaderCard(root, {
            overlayId: SAVE_SETTINGS_LOADER_OVERLAY_ID,
            cardId: SAVE_SETTINGS_LOADER_CARD_ID,
            warningId: SAVE_SETTINGS_LOADER_WARNING_ID,
            titleId: SAVE_SETTINGS_LOADER_TITLE_ID,
            stepsWrapId: SAVE_SETTINGS_LOADER_STEPS_WRAP_ID,
            stepRowPrefix: SAVE_SETTINGS_LOADER_STEP_ROW_ID_PREFIX,
            stepIconSuffix: SAVE_SETTINGS_LOADER_STEP_ICON_ID_SUFFIX,
            stepLabelSuffix: SAVE_SETTINGS_LOADER_STEP_LABEL_ID_SUFFIX,
            detailId: SAVE_SETTINGS_LOADER_DETAIL_ID,
            stallHintId: SAVE_SETTINGS_LOADER_STALL_HINT_ID,
            hasSkip: false,
            steps: SAVE_SETTINGS_LOADER_STEPS,
            titleText: "QOLLOCK SAVING..."
        });

        setCachedPanel("saveSettingsLoaderOverlay", panels.overlay);
        setCachedPanel("saveSettingsLoaderCard", panels.card);
        setCachedPanel("saveSettingsLoaderWarning", panels.warning);
        setCachedPanel("saveSettingsLoaderTitle", panels.title);
        setCachedPanel("saveSettingsLoaderStepsWrap", panels.stepsWrap);
        setCachedPanel("saveSettingsLoaderDetail", panels.detailLabel);
        setCachedPanel("saveSettingsLoaderStallHint", panels.stallHint);
        return panels.overlay;
    };

    const updateSaveSettingsLoaderOverlay = (root, nowMs) => {
        if (!SAVE_SETTINGS_LOADER_ENABLED) return;
        const now = Number(nowMs) || (Date.now ? Date.now() : (new Date()).getTime());
        let shouldShow = !!State.saveSettingsLoaderSessionActive;
        if (!shouldShow && State.saveSettingsLoaderSessionCompleted) {
            shouldShow = now < (State.saveSettingsLoaderShowUntilMs || 0);
        }
        let overlay = getCachedPanel("saveSettingsLoaderOverlay");
        if (!shouldShow) {
            if (overlay?.style) {
                try { overlay.style.visibility = "collapse"; } catch (_) {}
            }
            if (State.saveSettingsLoaderSessionCompleted) {
                resetSaveSettingsLoaderSession(true);
            }
            traceLoaderOverlay("save", overlay, false);
            return;
        }

        overlay = ensureSaveSettingsLoaderOverlay(root);
        if (!overlay) {
            traceLoaderOverlay("save", null, true);
            return;
        }
        overlay.style.visibility = "visible";
        setPanelOpacitySafe(overlay, 1.0, 1.0);
        traceLoaderOverlay("save", overlay, true);

        const stepsWrap = getCachedPanel("saveSettingsLoaderStepsWrap");
        const detailLabel = getCachedPanel("saveSettingsLoaderDetail");
        const stallHint = getCachedPanel("saveSettingsLoaderStallHint");
        const stepSig = renderStepRows(stepsWrap, SAVE_SETTINGS_LOADER_STEPS, SAVE_SETTINGS_LOADER_STEP_ROW_ID_PREFIX, SAVE_SETTINGS_LOADER_STEP_ICON_ID_SUFFIX, State.saveSettingsLoaderStepStates);

        let resultPrefix = "";
        if (State.saveSettingsLoaderSessionCompleted) {
            if (State.saveSettingsLoaderResult === "success") resultPrefix = "Result: Save complete.";
            else if (State.saveSettingsLoaderResult === "failed") resultPrefix = "Result: Save failed.";
            else resultPrefix = "Result: Complete.";
        }
        let detailText = State.saveSettingsLoaderDetail || "";
        if (resultPrefix.length > 0) {
            detailText = detailText ? `${resultPrefix} ${detailText}` : resultPrefix;
        }
        const isPromptDetail = isSettingsLoaderShopPromptDetail(detailText);
        const renderDetailText = decorateLoaderDetailWithSpinner(
            detailText,
            now,
            !!State.saveSettingsLoaderSessionActive,
            !!State.saveSettingsLoaderSessionCompleted
        );

        const sig = `${stepSig}|${renderDetailText}|${State.saveSettingsLoaderSessionCompleted ? 1 : 0}`;
        if (sig === State.saveSettingsLoaderLastRenderSig) return;
        State.saveSettingsLoaderLastRenderSig = sig;

        if (detailLabel) {
            detailLabel.SetHasClass("is-shop-prompt", isPromptDetail);
            if (detailLabel.text !== renderDetailText) detailLabel.text = renderDetailText;
        }
        if (stallHint && stallHint.text !== SAVE_SETTINGS_LOADER_STALL_HINT_TEXT) {
            stallHint.text = SAVE_SETTINGS_LOADER_STALL_HINT_TEXT;
        }
    };

    // ── Session Control Methods ──
    const beginSettingsLoaderSession = (accountId, nowMs) => {
        beginLoaderSessionInternal("settingsLoader", SETTINGS_LOADER_STEPS, accountId, nowMs, "Starting settings loader session...", () => SETTINGS_LOADER_ENABLED);
        State.settingsLoaderSessionAccountId = accountId ? String(accountId) : "";
    };

    const setSettingsLoaderStepState = (stepKey, status, detail) => {
        setLoaderStepStateInternal("settingsLoader", SETTINGS_LOADER_STEPS, stepKey, status, detail, true);
    };

    const finalizeSettingsLoaderSession = (resultCode, resultDetail, nowMs) => {
        if (!SETTINGS_LOADER_ENABLED) return;
        const code = resultCode === "failed" || resultCode === "skipped" ? resultCode : "success";
        const detail = resultDetail !== undefined && resultDetail !== null ? String(resultDetail) : "";
        const now = Number(nowMs) || (Date.now ? Date.now() : (new Date()).getTime());
        State.settingsLoaderSessionActive = false;
        State.settingsLoaderSessionCompleted = true;
        State.settingsLoaderResult = code;
        State.settingsLoaderDetail = detail;
        State.settingsLoaderSkipRequested = false;
        State.settingsLoaderShowUntilMs = now + SETTINGS_LOADER_HOLD_MS;
        setSettingsLoaderStepState("complete", code === "failed" ? "error" : "done", detail || "");
        State.settingsLoaderCurrentStep = "complete";

        settingsLoaderDebugLog(`session_finalize result=${code} detail="${detail}" account=${State.settingsLoaderSessionAccountId || "-"}`);
        settingsLoaderTraceLog(`session_finalize result=${code} detail="${detail}" account=${State.settingsLoaderSessionAccountId || "-"}`);

        if (code !== "failed") {
            queueCloseHeroShopForLoaderSuccess();
        }
        if (SETTINGS_LOADER_HOLD_MS <= 0) {
            $.Schedule(0.03, () => {
                resetSettingsLoaderSession(true);
            });
        }
    };

    const skipSettingsLoaderSession = (root, nowMs) => {
        if (!SETTINGS_LOADER_ENABLED) return false;
        const now = Number(nowMs) || (Date.now ? Date.now() : (new Date()).getTime());
        if (!State.settingsLoaderSessionActive && !State.settingsLoaderSessionCompleted) return false;

        State.settingsLoaderSkipRequested = true;
        if (Q.setStartupCorruptRepairPending) Q.setStartupCorruptRepairPending(root, false);
        else State.buildCategoryPayloadCorruptRepairPending = false;

        if (root && Q.resetBuildSaveRequestAttributes) {
            Q.resetBuildSaveRequestAttributes(root);
        }
        if (Q.resetBuildSaveRuntimeState) Q.resetBuildSaveRuntimeState();
        resetSaveSettingsLoaderSession(true);

        setSettingsLoaderStepState("read_payload", "skipped", "Loading skipped by user.");
        setSettingsLoaderStepState("decode_payload", "skipped", "Loading skipped by user.");
        setSettingsLoaderStepState("apply_config", "skipped", "Config unchanged.");

        finalizeSettingsLoaderSession("skipped", "Loading skipped by user.", now);
        return true;
    };

    const resetSettingsLoaderSession = (hideOverlay) => {
        resetLoaderSessionInternal("settingsLoader", "settingsLoaderOverlay", SETTINGS_LOADER_STEPS, hideOverlay);
        State.settingsLoaderSessionAccountId = "";
        State.settingsLoaderSkipRequested = false;
    };

    const beginSaveSettingsLoaderSession = (requestToken, nowMs) => {
        beginLoaderSessionInternal("saveSettingsLoader", SAVE_SETTINGS_LOADER_STEPS, requestToken, nowMs, "Preparing settings save...", () => SAVE_SETTINGS_LOADER_ENABLED);
    };

    const setSaveSettingsLoaderStepState = (stepKey, status, detail) => {
        setLoaderStepStateInternal("saveSettingsLoader", SAVE_SETTINGS_LOADER_STEPS, stepKey, status, detail, true);
    };

    const getSaveSettingsLoaderStepState = (stepKey) => {
        if (!stepKey || !State.saveSettingsLoaderStepStates) return "pending";
        return State.saveSettingsLoaderStepStates[stepKey] || "pending";
    };

    const finalizeSaveSettingsLoaderSession = (resultCode, resultDetail, nowMs) => {
        if (!SAVE_SETTINGS_LOADER_ENABLED) return;
        const code = resultCode === "failed" || resultCode === "skipped" ? resultCode : "success";
        const detail = resultDetail !== undefined && resultDetail !== null ? String(resultDetail) : "";
        const now = Number(nowMs) || (Date.now ? Date.now() : (new Date()).getTime());
        State.saveSettingsLoaderSessionActive = false;
        State.saveSettingsLoaderSessionCompleted = true;
        State.saveSettingsLoaderResult = code;
        State.saveSettingsLoaderDetail = detail;
        State.saveSettingsLoaderShowUntilMs = now + SAVE_SETTINGS_LOADER_HOLD_MS;
        setSaveSettingsLoaderStepState("complete", code === "failed" ? "error" : "done", detail || "");
        State.saveSettingsLoaderCurrentStep = "complete";

        if (code !== "failed") {
            queueCloseHeroShopForLoaderSuccess();
        }
        if (SAVE_SETTINGS_LOADER_HOLD_MS <= 0) {
            $.Schedule(0.03, () => {
                resetSaveSettingsLoaderSession(true);
            });
        }
    };

    const resetSaveSettingsLoaderSession = (hideOverlay) => {
        resetLoaderSessionInternal("saveSettingsLoader", "saveSettingsLoaderOverlay", SAVE_SETTINGS_LOADER_STEPS, hideOverlay);
    };

    const getSaveSettingsLoaderDetailForMessage = (msg) => {
        const text = msg ? String(msg) : "";
        if (!text) return "";
        const lower = text.toLowerCase();
        if (lower.includes("re-opening shop")) return "Waiting for hero shop to open...";
        if (lower.includes("opening hero shop")) return "Opening hero shop...";
        if (lower.includes("switched to airheart")) return "Switched to Skyrunner.";
        return text;
    };

    const updateSaveSettingsLoaderFromBuildSaveState = () => {
        // Kept for backward compatibility with build save hooks
    };

    // ── Build Probe Snapshot ──
    const settingsLoaderBuildProbeSnapshot = (root) => {
        let shopOpen = false;
        try { shopOpen = !!isHudClassActive(root, "gShopOpen"); } catch (_) { shopOpen = false; }

        let selectedBuild = null;
        try {
            selectedBuild = root?.FindChildTraverse ? root.FindChildTraverse(PANEL_ID_SHOP_MODS_SELECTED_BUILD) : null;
        } catch (_) {
            selectedBuild = null;
        }
        const hasSelectedBuild = !!selectedBuild;
        let categoryCount = 0;
        try { categoryCount = selectedBuild ? QOL.countBuildCategoryHeaders(selectedBuild) : 0; } catch (_) { categoryCount = 0; }

        let signal = { hero: "", source: "none" };
        try { signal = (Q.resolveBuildSaveStorageHeroSignal ? Q.resolveBuildSaveStorageHeroSignal(root) : signal) || signal; } catch (_) { signal = { hero: "", source: "none" }; }
        let signalHero = "";
        try { signalHero = QOL.normalizeHeroId(signal.hero); } catch (_) { signalHero = ""; }
        const signalSource = signal?.source ? String(signal.source) : "none";

        return `shopOpen=${shopOpen ? "1" : "0"} selectedBuild=${hasSelectedBuild ? "1" : "0"} categories=${String(categoryCount)} title="-" signalHero=${signalHero || "-"} signalSource=${signalSource}`;
    };

    const traceSettingsLoaderProbeHeartbeat = (root, accountId, nowMs, reason) => {
        if (!SETTINGS_LOADER_TRACE) return;
        const stage = State.buildCategoryPayloadHeroProbeStage ? String(State.buildCategoryPayloadHeroProbeStage) : "-";
        const nextMs = Number(State.buildCategoryPayloadHeroProbeNextMs) || 0;
        const waitMs = nextMs > nowMs ? (nextMs - nowMs) : 0;
        const traceReason = reason ? String(reason) : "tick";
        const snapshot = settingsLoaderBuildProbeSnapshot(root);
        settingsLoaderTraceLogThrottled(
            `probe|${accountId || "-"}|${stage}|${traceReason}`,
            `account=${accountId || "-"} stage=${stage} step=${State.settingsLoaderCurrentStep || "-"} reason=${traceReason} waitMs=${String(waitMs)} switchRetries=${String(Number(State.buildCategoryPayloadHeroProbeSwitchRetries) || 0)} misses=${String(Number(State.buildCategoryPayloadHeroProbeMisses) || 0)} confirmHits=${String(Number(State.buildCategoryPayloadStorageConfirmHits) || 0)} headerConfirmed=${State.buildCategoryPayloadSkyrunnerHeaderConfirmed ? "1" : "0"} ${snapshot}`,
            nowMs
        );
    };

    // ── Public API on QOL ──
    const api = {
        beginSettingsLoaderSession,
        setSettingsLoaderStepState,
        finalizeSettingsLoaderSession,
        skipSettingsLoaderSession,
        resetSettingsLoaderSession,
        ensureSettingsLoaderOverlay,
        updateSettingsLoaderOverlay,
        beginSaveSettingsLoaderSession,
        setSaveSettingsLoaderStepState,
        getSaveSettingsLoaderStepState,
        finalizeSaveSettingsLoaderSession,
        resetSaveSettingsLoaderSession,
        ensureSaveSettingsLoaderOverlay,
        updateSaveSettingsLoaderOverlay,
        updateSaveSettingsLoaderFromBuildSaveState,
        getSaveSettingsLoaderDetailForMessage,
        setSettingsLoaderDebugOverlayLine,
        settingsLoaderDebugLogThrottled,
        settingsLoaderTraceLogThrottled,
        traceSettingsLoaderProbeHeartbeat,
        settingsLoaderBuildProbeSnapshot,
        tryCloseHeroShopForLoader,
        tryCloseBrowseBuildsPopupForLoader
    };

    Q.core = Q.core || {};
    Q.core.settingsLoader = api;

    // Backward-compat exports directly on QOL namespace
    for (const k in api) {
        if (Object.prototype.hasOwnProperty.call(api, k)) {
            Q[k] = api[k];
        }
    }

    $.Msg("[QOLLock] core/ql_settings_loader: ready");
})();

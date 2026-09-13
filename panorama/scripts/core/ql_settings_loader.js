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

(function() {
    'use strict';

    var Q = (typeof globalThis !== 'undefined' && globalThis.QOL) ? globalThis.QOL : (typeof QOL !== 'undefined' ? QOL : {});
    var State = (typeof globalThis !== 'undefined' && globalThis.State) ? globalThis.State : (typeof window !== 'undefined' && window.State ? window.State : { cachedPanels: {} });
    var Panel = (Q.core && Q.core.panel) ? Q.core.panel : (Q.ui && Q.ui.PanelHelpers ? Q.ui.PanelHelpers : {});
    var Hud = (Q.core && Q.core.hud) ? Q.core.hud : {};

    var IsPanelValid = Panel.isAlive || function(p) { return p != null && typeof p.IsValid === 'function' && p.IsValid(); };
    var GetCachedPanel = (Q.getCachedPanel) || function(k) { var p = State.cachedPanels ? State.cachedPanels[k] : null; if (IsPanelValid(p)) return p; if (State.cachedPanels) State.cachedPanels[k] = null; return null; };
    var SetCachedPanel = (Q.setCachedPanel) || function(k, p) { if (State.cachedPanels) State.cachedPanels[k] = IsPanelValid(p) ? p : null; };
    var GetUIRoot = (Q.getUIRoot) || function() { return Panel.findRoot ? Panel.findRoot() : (typeof $.GetContextPanel === 'function' ? $.GetContextPanel() : null); };
    var ActivatePanelSafe = Panel.activate || function(p) { if (!IsPanelValid(p)) return false; try { $.DispatchEvent('Activated', p, 'mouse'); return true; } catch(e) {} try { $.DispatchEvent('Activated', p); return true; } catch(e2) {} return false; };
    var SetPanelOpacitySafe = (typeof QOL_UTILS !== 'undefined' && QOL_UTILS.SetPanelOpacitySafe) ? QOL_UTILS.SetPanelOpacitySafe : function(p, o) { if (p && p.style) p.style.opacity = String(o); };
    var QOL_WARN = (typeof QOL_UTILS !== 'undefined' && QOL_UTILS.WarnLog) ? QOL_UTILS.WarnLog : function() {};

    // ── Engine HUD & Hideout Detection ──
    function IsHudClassActive(root, className) {
        if (!className) return false;
        if (Hud && typeof Hud.isClassActive === 'function') {
            return Hud.isClassActive(className);
        }
        var r = root || GetUIRoot();
        if (!r) return false;
        return Panel.hasClassToken ? Panel.hasClassToken(r, className) : (r.BHasClass ? r.BHasClass(className) : false);
    }

    function IsConnectedToHideout(root) {
        var r = root || GetUIRoot();
        if (!r) return false;
        var hud = (Q.resolveHudPanel ? Q.resolveHudPanel(r) : null) || (r.FindChildTraverse ? r.FindChildTraverse('Hud') : null);
        if (hud && hud.BHasClass && (hud.BHasClass('connectedToHideout') || hud.BHasClass('InHideout'))) return true;
        if (r.BHasClass && (r.BHasClass('connectedToHideout') || r.BHasClass('InHideout'))) return true;
        return IsHudClassActive(r, 'connectedToHideout') || IsHudClassActive(r, 'InHideout');
    }

    // ── Shop and Browse Popup Cleanup ──
    function FindBrowseBuildsCancelButton(root) {
        if (!root || !root.FindChildTraverse) return { panel: null };
        var popup = root.FindChildTraverse('PopupBuildBrowser') || root.FindChildTraverse('BrowseBuilds');
        if (!popup) {
            var uiRoot = GetUIRoot();
            if (uiRoot && uiRoot.FindChildTraverse) {
                popup = uiRoot.FindChildTraverse('PopupBuildBrowser') || uiRoot.FindChildTraverse('BrowseBuilds');
            }
        }
        if (!popup) return { panel: null };
        var btn = popup.FindChildTraverse ? (popup.FindChildTraverse('Button1') || popup.FindChildTraverse('CancelButton')) : null;
        if (btn && IsPanelValid(btn)) return { panel: btn };
        var stack = [popup];
        var scanned = 0;
        while (stack.length > 0 && scanned < 100) {
            var p = stack.pop();
            scanned++;
            if (!p || !p.IsValid || !p.IsValid()) continue;
            var id = (p.id || '').toLowerCase();
            if (id.indexOf('cancel') !== -1 || id.indexOf('close') !== -1) {
                return { panel: p };
            }
            var kids = p.Children ? p.Children() : [];
            for (var i = 0; i < kids.length; i++) stack.push(kids[i]);
        }
        return { panel: null };
    }

    function TryCloseBrowseBuildsPopupForLoader(root) {
        if (!root || !IsConnectedToHideout(root)) return false;
        var cancelLookup = FindBrowseBuildsCancelButton(root);
        var cancelBtn = cancelLookup && cancelLookup.panel ? cancelLookup.panel : null;
        if (!cancelBtn || (typeof cancelBtn.visible !== 'undefined' && cancelBtn.visible === false)) return false;
        return ActivatePanelSafe(cancelBtn);
    }

    function TryCloseHeroShopForLoader(root) {
        if (!root || !IsConnectedToHideout(root)) return false;
        var closedBrowsePopup = TryCloseBrowseBuildsPopupForLoader(root);
        var wasOpen = IsHudClassActive(root, 'gShopOpen');
        if (!wasOpen) return closedBrowsePopup || true;

        var closed = false;
        try {
            if (typeof CitadelExitUpgradeShop === 'function') {
                CitadelExitUpgradeShop();
                closed = true;
            }
        } catch(e0) { QOL_WARN('core', 'op failed: ' + (e0 && e0.message ? e0.message : String(e0 || ''))); }
        if (!closed) {
            var shopPanel = root.FindChildTraverse ? root.FindChildTraverse('HeroShop') : null;
            var leftCommandPanel = shopPanel && shopPanel.FindChildTraverse ? shopPanel.FindChildTraverse('LeftCommandPanel') : null;
            if (ActivatePanelSafe(leftCommandPanel)) closed = true;
        }
        if (!closed) {
            if (Q.dispatchCitadelConCommand) {
                Q.dispatchCitadelConCommand('citadel_open_hero_sheet');
            }
            closed = true;
        }
        return closed || closedBrowsePopup;
    }

    function QueueCloseHeroShopForLoaderSuccess() {
        var delays = [0.00, 0.20, 0.55];
        for (var i = 0; i < delays.length; i++) {
            var delaySec = delays[i];
            $.Schedule(delaySec, function() {
                var closeRoot = GetUIRoot();
                if (closeRoot) {
                    TryCloseHeroShopForLoader(closeRoot);
                }
            });
        }
    }

    // ── Constants ──
    const PANEL_ID_SHOP_MODS_SELECTED_BUILD = 'ShopModsSelectedBuild';
    const SETTINGS_LOADER_ENABLED = true;
    const SETTINGS_LOADER_DEBUG = false;
    const SETTINGS_LOADER_DEBUG_THROTTLE_MS = 350;
    const SETTINGS_LOADER_TRACE = false;
    const SETTINGS_LOADER_TRACE_THROTTLE_MS = 1000;
    const SETTINGS_LOADER_REASSERT_MS = 250;
    const SETTINGS_LOADER_HOLD_MS = 1000;
    const SETTINGS_LOADER_OVERLAY_ID = 'QOLSettingsLoaderOverlay';
    const SETTINGS_LOADER_CARD_ID = 'QOLSettingsLoaderCard';
    const SETTINGS_LOADER_WARNING_ID = 'QOLSettingsLoaderWarning';
    const SETTINGS_LOADER_TITLE_ID = 'QOLSettingsLoaderTitle';
    const SETTINGS_LOADER_STEPS_WRAP_ID = 'QOLSettingsLoaderStepsWrap';
    const SETTINGS_LOADER_STEP_ROW_ID_PREFIX = 'QOLSettingsLoaderStepRow_';
    const SETTINGS_LOADER_STEP_ICON_ID_SUFFIX = '_Icon';
    const SETTINGS_LOADER_STEP_LABEL_ID_SUFFIX = '_Label';
    const SETTINGS_LOADER_DETAIL_ID = 'QOLSettingsLoaderDetail';
    const SETTINGS_LOADER_WARNING_TEXT = 'DO NOT PRESS ANYTHING';
    const SETTINGS_LOADER_ICON_PENDING = 's2r://panorama/images/getting_started/checklist_task_empty_png.vtex';
    const SETTINGS_LOADER_ICON_DONE = 's2r://panorama/images/getting_started/checklist_task_complete_png.vtex';
    const SETTINGS_LOADER_ICON_ACTIVE = 's2r://panorama/images/glyphs/arrow_right.vsvg';
    const SETTINGS_LOADER_ICON_ERROR = 's2r://panorama/images/control_icons/x_close_filled_png.vtex';
    const LOADER_DETAIL_SPINNER_FRAMES = ['|', '/', '-', '\\'];
    const LOADER_DETAIL_SPINNER_FRAME_MS = 180;

    const SETTINGS_LOADER_STEPS = [
        { key: 'start', label: 'Start' },
        { key: 'switch_airheart', label: 'Switching to Skyrunner' },
        { key: 'confirm_airheart', label: 'Confirming Skyrunner Context' },
        { key: 'read_payload', label: 'Reading Build Payload (Read-Only)' },
        { key: 'decode_payload', label: 'Decoding Payload' },
        { key: 'apply_config', label: 'Applying Config' },
        { key: 'return_hero', label: 'Returning To Original Hero' },
        { key: 'complete', label: 'Complete' }
    ];

    const SAVE_SETTINGS_LOADER_ENABLED = true;
    const SAVE_SETTINGS_LOADER_REASSERT_MS = 250;
    const SAVE_SETTINGS_LOADER_HOLD_MS = 1000;
    const SAVE_SETTINGS_LOADER_OVERLAY_ID = 'QOLSaveSettingsLoaderOverlay';
    const SAVE_SETTINGS_LOADER_CARD_ID = 'QOLSaveSettingsLoaderCard';
    const SAVE_SETTINGS_LOADER_WARNING_ID = 'QOLSaveSettingsLoaderWarning';
    const SAVE_SETTINGS_LOADER_TITLE_ID = 'QOLSaveSettingsLoaderTitle';
    const SAVE_SETTINGS_LOADER_STEPS_WRAP_ID = 'QOLSaveSettingsLoaderStepsWrap';
    const SAVE_SETTINGS_LOADER_STEP_ROW_ID_PREFIX = 'QOLSaveSettingsLoaderStepRow_';
    const SAVE_SETTINGS_LOADER_STEP_ICON_ID_SUFFIX = '_Icon';
    const SAVE_SETTINGS_LOADER_STEP_LABEL_ID_SUFFIX = '_Label';
    const SAVE_SETTINGS_LOADER_DETAIL_ID = 'QOLSaveSettingsLoaderDetail';
    const SAVE_SETTINGS_LOADER_STALL_HINT_ID = 'QOLSaveSettingsLoaderStallHint';
    const SAVE_SETTINGS_LOADER_STALL_HINT_TEXT = 'If saving stalls, open your shop.';

    const SAVE_SETTINGS_LOADER_STEPS = [
        { key: 'start', label: 'Start' },
        { key: 'switch_airheart', label: 'Switching to Skyrunner' },
        { key: 'confirm_airheart', label: 'Confirming Skyrunner Context' },
        { key: 'prepare_build', label: 'Preparing Build UI' },
        { key: 'write_payload', label: 'Writing Payload' },
        { key: 'commit_save', label: 'Saving Build' },
        { key: 'verify_save', label: 'Verifying Save' },
        { key: 'return_hero', label: 'Returning To Selected Hero' },
        { key: 'complete', label: 'Complete' }
    ];

    // ── Diagnostics & Logging ──
    function SettingsLoaderDebugLog(msg) {
        if (!SETTINGS_LOADER_DEBUG) return;
        $.Msg('[QOLLock][SettingsLoaderDebug] ' + msg);
    }

    function SettingsLoaderTraceLog(msg) {
        if (!SETTINGS_LOADER_TRACE) return;
        $.Msg('[QOLLock][SettingsLoaderTrace] ' + msg);
    }

    function SettingsLoaderTraceLogThrottled(sig, msg, nowMs) {
        if (!SETTINGS_LOADER_TRACE) return;
        var now = Number(nowMs) || (Date.now ? Date.now() : (new Date()).getTime());
        var sameSig = sig && sig === State.settingsLoaderTraceLastSig;
        if (sameSig && now < (State.settingsLoaderTraceNextMs || 0)) return;
        State.settingsLoaderTraceLastSig = sig || '';
        State.settingsLoaderTraceNextMs = now + SETTINGS_LOADER_TRACE_THROTTLE_MS;
        SettingsLoaderTraceLog(msg);
    }

    function SettingsLoaderDebugLogThrottled(sig, msg, nowMs) {
        if (!SETTINGS_LOADER_DEBUG) return;
        var now = Number(nowMs) || (Date.now ? Date.now() : (new Date()).getTime());
        var sameSig = sig && sig === State.settingsLoaderDebugLastSig;
        if (sameSig && now < (State.settingsLoaderDebugNextMs || 0)) return;
        State.settingsLoaderDebugLastSig = sig || '';
        State.settingsLoaderDebugNextMs = now + SETTINGS_LOADER_DEBUG_THROTTLE_MS;
        SettingsLoaderDebugLog(msg);
    }

    function SetSettingsLoaderDebugOverlayLine(lineText) {
        if (!SETTINGS_LOADER_DEBUG) return;
        State.settingsLoaderDebugOverlayLine = lineText ? String(lineText) : '';
        State.settingsLoaderLastRenderSig = '';
    }

    function IsSettingsLoaderShopPromptDetail(text) {
        if (!text) return false;
        var lower = String(text).toLowerCase();
        return lower.indexOf('open your shop') !== -1 ||
            lower.indexOf('open shop') !== -1 ||
            lower.indexOf('potential corrupt save') !== -1 ||
            lower.indexOf('welcome to qol lock') !== -1 ||
            lower.indexOf('press alt+f4') !== -1 ||
            lower.indexOf('let the loader run') !== -1;
    }

    function ResolveSettingsThemeId(cfg) {
        var raw = Math.round(Number(cfg && cfg.SETTINGS_THEME));
        if (raw >= 1 && raw <= 5) return raw;
        return 0;
    }

    function DecorateLoaderDetailWithSpinner(detailText, nowMs, isSessionActive, isSessionCompleted) {
        var text = detailText ? String(detailText) : '';
        if (!text || !isSessionActive || isSessionCompleted) return text;
        var frameMs = Number(LOADER_DETAIL_SPINNER_FRAME_MS) || 180;
        var now = Number(nowMs) || (Date.now ? Date.now() : (new Date()).getTime());
        var frameIndex = Math.floor(now / frameMs) % LOADER_DETAIL_SPINNER_FRAMES.length;
        return LOADER_DETAIL_SPINNER_FRAMES[frameIndex] + ' ' + text;
    }

    function TraceLoaderOverlay(tag, overlay, shouldShow) {
        if (!SETTINGS_LOADER_TRACE) return;
        var now = Date.now ? Date.now() : (new Date()).getTime();
        SettingsLoaderTraceLogThrottled(
            'overlay_' + tag + '_' + (shouldShow ? 'show' : 'hide'),
            'overlay tag=' + tag + ' visible=' + (shouldShow ? '1' : '0') + ' valid=' + (IsPanelValid(overlay) ? '1' : '0'),
            now
        );
    }

    // ── Generic Step & Overlay Factory ──
    function _GetLoaderStepIndex(stepKey, steps) {
        if (!stepKey) return -1;
        for (var i = 0; i < steps.length; i++) {
            if (steps[i].key === stepKey) return i;
        }
        return -1;
    }

    function _ResetLoaderStepStates(stateObj, steps) {
        if (!stateObj || typeof stateObj !== 'object') return;
        for (var k in stateObj) {
            if (stateObj.hasOwnProperty(k)) delete stateObj[k];
        }
        for (var i = 0; i < steps.length; i++) {
            stateObj[steps[i].key] = 'pending';
        }
    }

    function _ResetLoaderSession(statePrefix, cachedOverlayKey, steps, hideOverlay) {
        State[statePrefix + 'SessionToken'] = '';
        State[statePrefix + 'SessionActive'] = false;
        State[statePrefix + 'SessionCompleted'] = false;
        State[statePrefix + 'CurrentStep'] = '';
        State[statePrefix + 'Detail'] = '';
        State[statePrefix + 'Result'] = '';
        State[statePrefix + 'ShowUntilMs'] = 0;
        State[statePrefix + 'NextReassertMs'] = 0;
        State[statePrefix + 'LastRenderSig'] = '';
        _ResetLoaderStepStates(State[statePrefix + 'StepStates'], steps);
        if (hideOverlay) {
            var overlay = GetCachedPanel(cachedOverlayKey);
            if (overlay) {
                try { overlay.style.visibility = 'collapse'; } catch(e0) {}
            }
        }
    }

    function _BeginLoaderSession(statePrefix, steps, requestToken, nowMs, initialDetail, enabledCheck) {
        if (enabledCheck && !enabledCheck()) return;
        var token = requestToken ? String(requestToken) : '';
        if (!token) return;
        if (State[statePrefix + 'SessionToken'] === token &&
            (State[statePrefix + 'SessionActive'] || State[statePrefix + 'SessionCompleted'])) return;

        var now = Number(nowMs) || (Date.now ? Date.now() : (new Date()).getTime());
        State[statePrefix + 'SessionToken'] = token;
        State[statePrefix + 'SessionActive'] = true;
        State[statePrefix + 'SessionCompleted'] = false;
        State[statePrefix + 'CurrentStep'] = 'start';
        State[statePrefix + 'Detail'] = initialDetail || '';
        State[statePrefix + 'Result'] = '';
        State[statePrefix + 'ShowUntilMs'] = 0;
        State[statePrefix + 'NextReassertMs'] = now + SETTINGS_LOADER_REASSERT_MS;
        State[statePrefix + 'LastRenderSig'] = '';
        _ResetLoaderStepStates(State[statePrefix + 'StepStates'], steps);
        State[statePrefix + 'StepStates'].start = 'active';
    }

    function _SetLoaderStepState(statePrefix, steps, stepKey, status, detail, onDoneNextActive) {
        if (!stepKey || !State[statePrefix + 'StepStates']) return;
        var normalized = status === 'active' || status === 'done' || status === 'error' || status === 'skipped'
            ? status : 'pending';
        State[statePrefix + 'StepStates'][stepKey] = normalized;
        if (detail !== undefined && detail !== null) {
            State[statePrefix + 'Detail'] = String(detail);
        }
        if (normalized === 'active') {
            State[statePrefix + 'CurrentStep'] = stepKey;
        } else if (normalized === 'done' && onDoneNextActive) {
            var idx = _GetLoaderStepIndex(stepKey, steps);
            if (idx >= 0 && idx < steps.length - 1) {
                var nextKey = steps[idx + 1].key;
                if (State[statePrefix + 'StepStates'][nextKey] === 'pending') {
                    State[statePrefix + 'StepStates'][nextKey] = 'active';
                    State[statePrefix + 'CurrentStep'] = nextKey;
                }
            }
        }
    }

    // ── Build Single UI Card (Shared for Load and Save) ──
    function CreateLoaderCard(root, cfg) {
        var overlay = root.FindChildTraverse ? root.FindChildTraverse(cfg.overlayId) : null;
        if (!overlay) {
            overlay = $.CreatePanel('Panel', root, cfg.overlayId);
        }
        overlay.SetHasClass('QOLLoaderOverlay', true);

        // Apply theme class
        var themeId = ResolveSettingsThemeId(State.lastConfig || (Q.buildDefaultConfig ? Q.buildDefaultConfig() : {}));
        for (var t = 1; t <= 5; t++) {
            overlay.SetHasClass('theme-' + t, t === themeId);
        }

        var card = overlay.FindChildTraverse ? overlay.FindChildTraverse(cfg.cardId) : null;
        if (!card) {
            card = $.CreatePanel('Panel', overlay, cfg.cardId);
            card.SetHasClass('QOLLoaderCard', true);
        }

        var warning = card.FindChildTraverse ? card.FindChildTraverse(cfg.warningId) : null;
        if (!warning) {
            warning = $.CreatePanel('Label', card, cfg.warningId);
            warning.SetHasClass('QOLLoaderWarning', true);
            warning.text = SETTINGS_LOADER_WARNING_TEXT;
        }

        var title = card.FindChildTraverse ? card.FindChildTraverse(cfg.titleId) : null;
        if (!title) {
            title = $.CreatePanel('Label', card, cfg.titleId);
            title.SetHasClass('QOLLoaderTitle', true);
            title.text = cfg.titleText;
        }

        var stepsWrap = card.FindChildTraverse ? card.FindChildTraverse(cfg.stepsWrapId) : null;
        if (!stepsWrap) {
            stepsWrap = $.CreatePanel('Panel', card, cfg.stepsWrapId);
            stepsWrap.SetHasClass('QOLLoaderStepsWrap', true);
        }

        for (var i = 0; i < cfg.steps.length; i++) {
            var step = cfg.steps[i];
            var rowId = cfg.stepRowPrefix + step.key;
            var row = stepsWrap.FindChildTraverse ? stepsWrap.FindChildTraverse(rowId) : null;
            if (!row) {
                row = $.CreatePanel('Panel', stepsWrap, rowId);
                row.SetHasClass('QOLLoaderStepRow', true);

                var icon = $.CreatePanel('Image', row, rowId + cfg.stepIconSuffix);
                icon.SetHasClass('QOLLoaderStepIcon', true);
                icon.SetImage(SETTINGS_LOADER_ICON_PENDING);

                var label = $.CreatePanel('Label', row, rowId + cfg.stepLabelSuffix);
                label.SetHasClass('QOLLoaderStepLabel', true);
                label.text = step.label;
            }
        }

        var detailLabel = card.FindChildTraverse ? card.FindChildTraverse(cfg.detailId) : null;
        if (!detailLabel) {
            detailLabel = $.CreatePanel('Label', card, cfg.detailId);
            detailLabel.SetHasClass('QOLLoaderDetail', true);
            detailLabel.text = '';
        }

        var stallHint = null;
        if (cfg.stallHintId) {
            stallHint = card.FindChildTraverse ? card.FindChildTraverse(cfg.stallHintId) : null;
            if (!stallHint) {
                stallHint = $.CreatePanel('Label', card, cfg.stallHintId);
                stallHint.SetHasClass('QOLLoaderStallHint', true);
                stallHint.text = SAVE_SETTINGS_LOADER_STALL_HINT_TEXT;
            }
        }

        var skipButton = null;
        if (cfg.hasSkip) {
            var skipDock = card.FindChildTraverse ? card.FindChildTraverse('QOLSettingsLoaderSkipDock') : null;
            if (!skipDock) {
                skipDock = $.CreatePanel('Panel', card, 'QOLSettingsLoaderSkipDock');
                skipDock.SetHasClass('QOLLoaderSkipDock', true);
            }
            skipButton = skipDock.FindChildTraverse ? skipDock.FindChildTraverse('QOLSettingsLoaderSkipButton') : null;
            if (!skipButton) {
                skipButton = $.CreatePanel('Button', skipDock, 'QOLSettingsLoaderSkipButton');
                skipButton.SetHasClass('QOLLoaderSkipButton', true);
                var skipLabel = $.CreatePanel('Label', skipButton, 'QOLSettingsLoaderSkipButtonLabel');
                skipLabel.SetHasClass('QOLLoaderSkipLabel', true);
                skipLabel.text = 'Skip';
                skipButton.SetPanelEvent('onactivate', function() {
                    SkipSettingsLoaderSession(GetUIRoot(), Date.now ? Date.now() : (new Date()).getTime());
                });
            }
        }

        return {
            overlay: overlay,
            card: card,
            warning: warning,
            title: title,
            stepsWrap: stepsWrap,
            detailLabel: detailLabel,
            stallHint: stallHint,
            skipButton: skipButton
        };
    }

    function RenderStepRows(stepsWrap, steps, stepRowPrefix, stepIconSuffix, stepStates) {
        if (!stepsWrap || !stepsWrap.FindChildTraverse) return '';
        var sig = '';
        var states = stepStates || {};
        for (var i = 0; i < steps.length; i++) {
            var step = steps[i];
            var status = states[step.key] || 'pending';
            sig += step.key + '=' + status + ';';
            var rowId = stepRowPrefix + step.key;
            var row = stepsWrap.FindChildTraverse(rowId);
            if (!row) continue;

            row.SetHasClass('step-active', status === 'active');
            row.SetHasClass('step-done', status === 'done');
            row.SetHasClass('step-error', status === 'error');
            row.SetHasClass('step-skipped', status === 'skipped');

            var icon = row.FindChildTraverse(rowId + stepIconSuffix);
            if (icon && icon.SetImage) {
                var iconSrc = SETTINGS_LOADER_ICON_PENDING;
                if (status === 'done') iconSrc = SETTINGS_LOADER_ICON_DONE;
                else if (status === 'active') iconSrc = SETTINGS_LOADER_ICON_ACTIVE;
                else if (status === 'error') iconSrc = SETTINGS_LOADER_ICON_ERROR;
                icon.SetImage(iconSrc);
            }
        }
        return sig;
    }

    // ── Load Settings Loader Overlay ──
    function EnsureSettingsLoaderOverlay(root) {
        if (!SETTINGS_LOADER_ENABLED || !root) return null;
        var overlay = GetCachedPanel('settingsLoaderOverlay');
        if (IsPanelValid(overlay)) return overlay;

        var panels = CreateLoaderCard(root, {
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
            titleText: 'QOLLOCK LOADING...'
        });

        SetCachedPanel('settingsLoaderOverlay', panels.overlay);
        SetCachedPanel('settingsLoaderCard', panels.card);
        SetCachedPanel('settingsLoaderWarning', panels.warning);
        SetCachedPanel('settingsLoaderTitle', panels.title);
        SetCachedPanel('settingsLoaderStepsWrap', panels.stepsWrap);
        SetCachedPanel('settingsLoaderDetail', panels.detailLabel);
        SetCachedPanel('settingsLoaderSkipButton', panels.skipButton);
        return panels.overlay;
    }

    function UpdateSettingsLoaderOverlay(root, nowMs) {
        if (!SETTINGS_LOADER_ENABLED) return;
        var now = Number(nowMs) || (Date.now ? Date.now() : (new Date()).getTime());
        var shouldShow = !!State.settingsLoaderSessionActive;
        if (!shouldShow && State.settingsLoaderSessionCompleted) {
            shouldShow = now < (State.settingsLoaderShowUntilMs || 0);
        }
        var overlay = GetCachedPanel('settingsLoaderOverlay');
        if (!shouldShow) {
            if (overlay) {
                try { overlay.style.visibility = 'collapse'; } catch(e0) {}
            }
            if (State.settingsLoaderSessionCompleted) {
                ResetSettingsLoaderSession(true);
            }
            TraceLoaderOverlay('load', overlay, false);
            return;
        }

        overlay = EnsureSettingsLoaderOverlay(root);
        if (!overlay) {
            TraceLoaderOverlay('load', null, true);
            return;
        }
        overlay.style.visibility = 'visible';
        SetPanelOpacitySafe(overlay, 1.0, 1.0);
        TraceLoaderOverlay('load', overlay, true);

        var stepsWrap = GetCachedPanel('settingsLoaderStepsWrap');
        var detailLabel = GetCachedPanel('settingsLoaderDetail');
        var stepSig = RenderStepRows(stepsWrap, SETTINGS_LOADER_STEPS, SETTINGS_LOADER_STEP_ROW_ID_PREFIX, SETTINGS_LOADER_STEP_ICON_ID_SUFFIX, State.settingsLoaderStepStates);

        var resultPrefix = '';
        if (State.settingsLoaderSessionCompleted) {
            if (State.settingsLoaderResult === 'success') resultPrefix = 'Result: Settings loaded.';
            else if (State.settingsLoaderResult === 'failed') resultPrefix = 'Result: Load failed.';
            else resultPrefix = 'Result: Complete.';
        }
        var detailText = State.settingsLoaderDetail || '';
        if (resultPrefix.length > 0) {
            detailText = detailText ? (resultPrefix + ' ' + detailText) : resultPrefix;
        }
        var isPromptDetail = IsSettingsLoaderShopPromptDetail(detailText);
        var renderDetailText = DecorateLoaderDetailWithSpinner(
            detailText,
            now,
            !!State.settingsLoaderSessionActive,
            !!State.settingsLoaderSessionCompleted
        );

        var sig = stepSig + '|' + renderDetailText + '|' + String(State.settingsLoaderSessionCompleted ? 1 : 0);
        if (sig === State.settingsLoaderLastRenderSig) return;
        State.settingsLoaderLastRenderSig = sig;

        if (detailLabel) {
            detailLabel.SetHasClass('is-shop-prompt', isPromptDetail);
            if (detailLabel.text !== renderDetailText) detailLabel.text = renderDetailText;
        }
    }

    // ── Save Settings Loader Overlay ──
    function EnsureSaveSettingsLoaderOverlay(root) {
        if (!SAVE_SETTINGS_LOADER_ENABLED || !root) return null;
        var overlay = GetCachedPanel('saveSettingsLoaderOverlay');
        if (IsPanelValid(overlay)) return overlay;

        var panels = CreateLoaderCard(root, {
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
            titleText: 'QOLLOCK SAVING...'
        });

        SetCachedPanel('saveSettingsLoaderOverlay', panels.overlay);
        SetCachedPanel('saveSettingsLoaderCard', panels.card);
        SetCachedPanel('saveSettingsLoaderWarning', panels.warning);
        SetCachedPanel('saveSettingsLoaderTitle', panels.title);
        SetCachedPanel('saveSettingsLoaderStepsWrap', panels.stepsWrap);
        SetCachedPanel('saveSettingsLoaderDetail', panels.detailLabel);
        SetCachedPanel('saveSettingsLoaderStallHint', panels.stallHint);
        return panels.overlay;
    }

    function UpdateSaveSettingsLoaderOverlay(root, nowMs) {
        if (!SAVE_SETTINGS_LOADER_ENABLED) return;
        var now = Number(nowMs) || (Date.now ? Date.now() : (new Date()).getTime());
        var shouldShow = !!State.saveSettingsLoaderSessionActive;
        if (!shouldShow && State.saveSettingsLoaderSessionCompleted) {
            shouldShow = now < (State.saveSettingsLoaderShowUntilMs || 0);
        }
        var overlay = GetCachedPanel('saveSettingsLoaderOverlay');
        if (!shouldShow) {
            if (overlay) {
                try { overlay.style.visibility = 'collapse'; } catch(e0) {}
            }
            if (State.saveSettingsLoaderSessionCompleted) {
                ResetSaveSettingsLoaderSession(true);
            }
            TraceLoaderOverlay('save', overlay, false);
            return;
        }

        overlay = EnsureSaveSettingsLoaderOverlay(root);
        if (!overlay) {
            TraceLoaderOverlay('save', null, true);
            return;
        }
        overlay.style.visibility = 'visible';
        SetPanelOpacitySafe(overlay, 1.0, 1.0);
        TraceLoaderOverlay('save', overlay, true);

        var stepsWrap = GetCachedPanel('saveSettingsLoaderStepsWrap');
        var detailLabel = GetCachedPanel('saveSettingsLoaderDetail');
        var stallHint = GetCachedPanel('saveSettingsLoaderStallHint');
        var stepSig = RenderStepRows(stepsWrap, SAVE_SETTINGS_LOADER_STEPS, SAVE_SETTINGS_LOADER_STEP_ROW_ID_PREFIX, SAVE_SETTINGS_LOADER_STEP_ICON_ID_SUFFIX, State.saveSettingsLoaderStepStates);

        var resultPrefix = '';
        if (State.saveSettingsLoaderSessionCompleted) {
            if (State.saveSettingsLoaderResult === 'success') resultPrefix = 'Result: Save complete.';
            else if (State.saveSettingsLoaderResult === 'failed') resultPrefix = 'Result: Save failed.';
            else resultPrefix = 'Result: Complete.';
        }
        var detailText = State.saveSettingsLoaderDetail || '';
        if (resultPrefix.length > 0) {
            detailText = detailText ? (resultPrefix + ' ' + detailText) : resultPrefix;
        }
        var isPromptDetail = IsSettingsLoaderShopPromptDetail(detailText);
        var renderDetailText = DecorateLoaderDetailWithSpinner(
            detailText,
            now,
            !!State.saveSettingsLoaderSessionActive,
            !!State.saveSettingsLoaderSessionCompleted
        );

        var sig = stepSig + '|' + renderDetailText + '|' + String(State.saveSettingsLoaderSessionCompleted ? 1 : 0);
        if (sig === State.saveSettingsLoaderLastRenderSig) return;
        State.saveSettingsLoaderLastRenderSig = sig;

        if (detailLabel) {
            detailLabel.SetHasClass('is-shop-prompt', isPromptDetail);
            if (detailLabel.text !== renderDetailText) detailLabel.text = renderDetailText;
        }
        if (stallHint && stallHint.text !== SAVE_SETTINGS_LOADER_STALL_HINT_TEXT) {
            stallHint.text = SAVE_SETTINGS_LOADER_STALL_HINT_TEXT;
        }
    }

    // ── Session Control Methods ──
    function BeginSettingsLoaderSession(accountId, nowMs) {
        _BeginLoaderSession('settingsLoader', SETTINGS_LOADER_STEPS, accountId, nowMs, 'Starting settings loader session...', function() { return SETTINGS_LOADER_ENABLED; });
        State.settingsLoaderSessionAccountId = accountId ? String(accountId) : '';
    }

    function SetSettingsLoaderStepState(stepKey, status, detail) {
        _SetLoaderStepState('settingsLoader', SETTINGS_LOADER_STEPS, stepKey, status, detail, true);
    }

    function FinalizeSettingsLoaderSession(resultCode, resultDetail, nowMs) {
        if (!SETTINGS_LOADER_ENABLED) return;
        var code = resultCode === 'failed' || resultCode === 'skipped' ? resultCode : 'success';
        var detail = resultDetail !== undefined && resultDetail !== null ? String(resultDetail) : '';
        var now = Number(nowMs) || (Date.now ? Date.now() : (new Date()).getTime());
        State.settingsLoaderSessionActive = false;
        State.settingsLoaderSessionCompleted = true;
        State.settingsLoaderResult = code;
        State.settingsLoaderDetail = detail;
        State.settingsLoaderSkipRequested = false;
        State.settingsLoaderShowUntilMs = now + SETTINGS_LOADER_HOLD_MS;
        SetSettingsLoaderStepState('complete', code === 'failed' ? 'error' : 'done', detail || '');
        State.settingsLoaderCurrentStep = 'complete';

        SettingsLoaderDebugLog('session_finalize result=' + code + ' detail="' + detail + '" account=' + (State.settingsLoaderSessionAccountId || '-'));
        SettingsLoaderTraceLog('session_finalize result=' + code + ' detail="' + detail + '" account=' + (State.settingsLoaderSessionAccountId || '-'));

        if (code !== 'failed') {
            QueueCloseHeroShopForLoaderSuccess();
        }
        if (SETTINGS_LOADER_HOLD_MS <= 0) {
            $.Schedule(0.03, function() {
                ResetSettingsLoaderSession(true);
            });
        }
    }

    function SkipSettingsLoaderSession(root, nowMs) {
        if (!SETTINGS_LOADER_ENABLED) return false;
        var now = Number(nowMs) || (Date.now ? Date.now() : (new Date()).getTime());
        if (!State.settingsLoaderSessionActive && !State.settingsLoaderSessionCompleted) return false;

        State.settingsLoaderSkipRequested = true;
        if (Q.setStartupCorruptRepairPending) Q.setStartupCorruptRepairPending(root, false);
        else State.buildCategoryPayloadCorruptRepairPending = false;

        if (root && Q.resetBuildSaveRequestAttributes) {
            Q.resetBuildSaveRequestAttributes(root);
        }
        if (Q.resetBuildSaveRuntimeState) Q.resetBuildSaveRuntimeState();
        ResetSaveSettingsLoaderSession(true);

        SetSettingsLoaderStepState('read_payload', 'skipped', 'Loading skipped by user.');
        SetSettingsLoaderStepState('decode_payload', 'skipped', 'Loading skipped by user.');
        SetSettingsLoaderStepState('apply_config', 'skipped', 'Config unchanged.');

        FinalizeSettingsLoaderSession('skipped', 'Loading skipped by user.', now);
        return true;
    }

    function ResetSettingsLoaderSession(hideOverlay) {
        _ResetLoaderSession('settingsLoader', 'settingsLoaderOverlay', SETTINGS_LOADER_STEPS, hideOverlay);
        State.settingsLoaderSessionAccountId = '';
        State.settingsLoaderSkipRequested = false;
    }

    function BeginSaveSettingsLoaderSession(requestToken, nowMs) {
        _BeginLoaderSession('saveSettingsLoader', SAVE_SETTINGS_LOADER_STEPS, requestToken, nowMs, 'Preparing settings save...', function() { return SAVE_SETTINGS_LOADER_ENABLED; });
    }

    function SetSaveSettingsLoaderStepState(stepKey, status, detail) {
        _SetLoaderStepState('saveSettingsLoader', SAVE_SETTINGS_LOADER_STEPS, stepKey, status, detail, true);
    }

    function GetSaveSettingsLoaderStepState(stepKey) {
        if (!stepKey || !State.saveSettingsLoaderStepStates) return 'pending';
        return State.saveSettingsLoaderStepStates[stepKey] || 'pending';
    }

    function FinalizeSaveSettingsLoaderSession(resultCode, resultDetail, nowMs) {
        if (!SAVE_SETTINGS_LOADER_ENABLED) return;
        var code = resultCode === 'failed' || resultCode === 'skipped' ? resultCode : 'success';
        var detail = resultDetail !== undefined && resultDetail !== null ? String(resultDetail) : '';
        var now = Number(nowMs) || (Date.now ? Date.now() : (new Date()).getTime());
        State.saveSettingsLoaderSessionActive = false;
        State.saveSettingsLoaderSessionCompleted = true;
        State.saveSettingsLoaderResult = code;
        State.saveSettingsLoaderDetail = detail;
        State.saveSettingsLoaderShowUntilMs = now + SAVE_SETTINGS_LOADER_HOLD_MS;
        SetSaveSettingsLoaderStepState('complete', code === 'failed' ? 'error' : 'done', detail || '');
        State.saveSettingsLoaderCurrentStep = 'complete';

        if (code !== 'failed') {
            QueueCloseHeroShopForLoaderSuccess();
        }
        if (SAVE_SETTINGS_LOADER_HOLD_MS <= 0) {
            $.Schedule(0.03, function() {
                ResetSaveSettingsLoaderSession(true);
            });
        }
    }

    function ResetSaveSettingsLoaderSession(hideOverlay) {
        _ResetLoaderSession('saveSettingsLoader', 'saveSettingsLoaderOverlay', SAVE_SETTINGS_LOADER_STEPS, hideOverlay);
    }

    function GetSaveSettingsLoaderDetailForMessage(msg) {
        var text = msg ? String(msg) : '';
        if (!text) return '';
        var lower = text.toLowerCase();
        if (lower.indexOf('re-opening shop') !== -1) return 'Waiting for hero shop to open...';
        if (lower.indexOf('opening hero shop') !== -1) return 'Opening hero shop...';
        if (lower.indexOf('switched to airheart') !== -1) return 'Switched to Skyrunner.';
        return text;
    }

    function UpdateSaveSettingsLoaderFromBuildSaveState() {
        // Kept for backward compatibility with build save hooks
    }

    // ── Build Probe Snapshot ──
    function SettingsLoaderBuildProbeSnapshot(root) {
        var shopOpen = false;
        try { shopOpen = !!IsHudClassActive(root, 'gShopOpen'); } catch (e0) { shopOpen = false; }

        var selectedBuild = null;
        try {
            selectedBuild = root && root.FindChildTraverse ? root.FindChildTraverse(PANEL_ID_SHOP_MODS_SELECTED_BUILD) : null;
        } catch (e1) {
            selectedBuild = null;
        }
        var hasSelectedBuild = !!selectedBuild;
        var categoryCount = 0;
        try { categoryCount = selectedBuild ? QOL.countBuildCategoryHeaders(selectedBuild) : 0; } catch (e2) { categoryCount = 0; }

        var signal = { hero: '', source: 'none' };
        try { signal = (Q.resolveBuildSaveStorageHeroSignal ? Q.resolveBuildSaveStorageHeroSignal(root) : signal) || signal; } catch (e4) { signal = { hero: '', source: 'none' }; }
        var signalHero = '';
        try { signalHero = QOL.normalizeHeroId(signal.hero); } catch (e5) { signalHero = ''; }
        var signalSource = signal && signal.source ? String(signal.source) : 'none';

        return 'shopOpen=' + (shopOpen ? '1' : '0') +
            ' selectedBuild=' + (hasSelectedBuild ? '1' : '0') +
            ' categories=' + String(categoryCount) +
            ' title="-"' +
            ' signalHero=' + (signalHero || '-') +
            ' signalSource=' + signalSource;
    }

    function TraceSettingsLoaderProbeHeartbeat(root, accountId, nowMs, reason) {
        if (!SETTINGS_LOADER_TRACE) return;
        var stage = State.buildCategoryPayloadHeroProbeStage ? String(State.buildCategoryPayloadHeroProbeStage) : '-';
        var nextMs = Number(State.buildCategoryPayloadHeroProbeNextMs) || 0;
        var waitMs = nextMs > nowMs ? (nextMs - nowMs) : 0;
        var traceReason = reason ? String(reason) : 'tick';
        var snapshot = SettingsLoaderBuildProbeSnapshot(root);
        SettingsLoaderTraceLogThrottled(
            'probe|' + (accountId || '-') + '|' + stage + '|' + traceReason,
            'account=' + (accountId || '-') +
                ' stage=' + stage +
                ' step=' + (State.settingsLoaderCurrentStep || '-') +
                ' reason=' + traceReason +
                ' waitMs=' + String(waitMs) +
                ' switchRetries=' + String(Number(State.buildCategoryPayloadHeroProbeSwitchRetries) || 0) +
                ' misses=' + String(Number(State.buildCategoryPayloadHeroProbeMisses) || 0) +
                ' confirmHits=' + String(Number(State.buildCategoryPayloadStorageConfirmHits) || 0) +
                ' headerConfirmed=' + (State.buildCategoryPayloadSkyrunnerHeaderConfirmed ? '1' : '0') +
                ' ' + snapshot,
            nowMs
        );
    }

    // ── Public API on QOL ──
    var api = {
        beginSettingsLoaderSession: BeginSettingsLoaderSession,
        setSettingsLoaderStepState: SetSettingsLoaderStepState,
        finalizeSettingsLoaderSession: FinalizeSettingsLoaderSession,
        skipSettingsLoaderSession: SkipSettingsLoaderSession,
        resetSettingsLoaderSession: ResetSettingsLoaderSession,
        ensureSettingsLoaderOverlay: EnsureSettingsLoaderOverlay,
        updateSettingsLoaderOverlay: UpdateSettingsLoaderOverlay,
        beginSaveSettingsLoaderSession: BeginSaveSettingsLoaderSession,
        setSaveSettingsLoaderStepState: SetSaveSettingsLoaderStepState,
        getSaveSettingsLoaderStepState: GetSaveSettingsLoaderStepState,
        finalizeSaveSettingsLoaderSession: FinalizeSaveSettingsLoaderSession,
        resetSaveSettingsLoaderSession: ResetSaveSettingsLoaderSession,
        ensureSaveSettingsLoaderOverlay: EnsureSaveSettingsLoaderOverlay,
        updateSaveSettingsLoaderOverlay: UpdateSaveSettingsLoaderOverlay,
        updateSaveSettingsLoaderFromBuildSaveState: UpdateSaveSettingsLoaderFromBuildSaveState,
        getSaveSettingsLoaderDetailForMessage: GetSaveSettingsLoaderDetailForMessage,
        setSettingsLoaderDebugOverlayLine: SetSettingsLoaderDebugOverlayLine,
        settingsLoaderDebugLogThrottled: SettingsLoaderDebugLogThrottled,
        settingsLoaderTraceLogThrottled: SettingsLoaderTraceLogThrottled,
        traceSettingsLoaderProbeHeartbeat: TraceSettingsLoaderProbeHeartbeat,
        settingsLoaderBuildProbeSnapshot: SettingsLoaderBuildProbeSnapshot,
        tryCloseHeroShopForLoader: TryCloseHeroShopForLoader,
        tryCloseBrowseBuildsPopupForLoader: TryCloseBrowseBuildsPopupForLoader
    };

    Q.core = Q.core || {};
    Q.core.settingsLoader = api;

    // Backward-compat exports directly on QOL namespace
    for (var k in api) {
        if (api.hasOwnProperty(k)) {
            Q[k] = api[k];
        }
    }

    $.Msg('[QOLLock] core/ql_settings_loader: ready');
})();

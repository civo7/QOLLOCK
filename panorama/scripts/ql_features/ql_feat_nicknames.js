// ql_feat_nicknames.js — Top bar nickname customization
// Extracted from ql_core.js, Phase 9 Step 2c
(function() {
    'use strict';
    var _featureId = "ql_feat_nicknames";
    var _deps = QOL.import(["getCachedPanel","getGameSecondsForUrn","getTopBarPlayerPanel","refreshSpmPanelCache","state","setCachedPanel","setPanelClassIfChanged","utils","isConnectedToHideout"]);
    var GetCachedPanel = _deps.getCachedPanel;
    var State = _deps.state;
    var SetCachedPanel = _deps.setCachedPanel;
    var Utils = _deps.utils;
    var IsCfgEnabled = Utils.IsCfgEnabled;
    var IsPanelValid = Utils.IsPanelValid;
    var SetPanelClassIfChanged = _deps.setPanelClassIfChanged;
    var RefreshSpmPanelCache = _deps.refreshSpmPanelCache;
    var GetGameSecondsForUrn = _deps.getGameSecondsForUrn;
    var GetTopBarPlayerPanel = _deps.getTopBarPlayerPanel;
    var isConnectedToHideout = _deps.isConnectedToHideout;

    // ── Constants ──
    var SPM_MAX_PLAYERS = 13;
    var TOPBAR_NICKNAMES_REFRESH_MS = 1000;
    var TOPBAR_NICKNAMES_REFRESH_MS_STABLE = 4200;
    var TOPBAR_NICKNAMES_UNRESOLVED_RETRY_MS = 4000;

    // ── Private helpers ──

    function NormalizeTopBarNicknameText(rawText) {
        var text = "";
        try {
            text = (rawText === undefined || rawText === null) ? "" : String(rawText || "").trim();
        } catch (eText) {
            text = "";
        }
        if (!text || text === "{s:player_name}") return "";
        return text;
    }

    function ReadTopBarNicknameLabelText(label) {
        if (!IsPanelValid(label)) return "";
        var rawText = "";
        try { rawText = typeof label.text === "string" ? String(label.text || "") : ""; } catch (eLabelText) { rawText = ""; }
        return NormalizeTopBarNicknameText(rawText);
    }

    function ResolveTopBarNicknameSource(playerPanel, cachedLabel) {
        var sourceLabel = IsPanelValid(cachedLabel) ? cachedLabel : null;
        var sourceText = ReadTopBarNicknameLabelText(sourceLabel);
        if (sourceText) {
            return { label: sourceLabel, text: sourceText };
        }
        if (!playerPanel || !playerPanel.FindChildrenWithClassTraverse) {
            return { label: sourceLabel, text: "" };
        }

        var labels = playerPanel.FindChildrenWithClassTraverse("PlayerName") || [];
        for (var i = 0; i < labels.length; i++) {
            var candidate = labels[i];
            if (!IsPanelValid(candidate)) continue;
            if (!sourceLabel) sourceLabel = candidate;
            var candidateText = ReadTopBarNicknameLabelText(candidate);
            if (!candidateText) continue;
            return { label: candidate, text: candidateText };
        }

        return { label: sourceLabel, text: "" };
    }

    // ── Update ──

    function UpdateTopBarNicknames(root, nowMs, cfg) {
        if (!root) return;
        var enabled = IsCfgEnabled(cfg, "ENABLE_NICKNAMES");
        if (!enabled && !State.topbarNicknamesWasEnabled) return;

        var now = isFinite(Number(nowMs)) ? Number(nowMs) : (Date.now ? Date.now() : (new Date()).getTime());
        if (!State.topbarNicknamePlayers) State.topbarNicknamePlayers = new Array(SPM_MAX_PLAYERS);
        if (!State.topbarNicknameSourceLabels) State.topbarNicknameSourceLabels = new Array(SPM_MAX_PLAYERS);
        if (!State.topbarNicknameFallbackLabels) State.topbarNicknameFallbackLabels = new Array(SPM_MAX_PLAYERS);
        if (!State.topbarNicknameResolvedTexts) State.topbarNicknameResolvedTexts = new Array(SPM_MAX_PLAYERS);
        if (!State.topbarNicknameResolveStates) State.topbarNicknameResolveStates = new Array(SPM_MAX_PLAYERS);
        if (!State.topbarNicknameRetryNextMs) State.topbarNicknameRetryNextMs = new Array(SPM_MAX_PLAYERS);
        RefreshSpmPanelCache(root, now);

        function resetNicknameSlotState(index) {
            if (index < 0 || index >= SPM_MAX_PLAYERS) return;
            State.topbarNicknamePlayers[index] = null;
            State.topbarNicknameSourceLabels[index] = null;
            State.topbarNicknameResolvedTexts[index] = "";
            State.topbarNicknameResolveStates[index] = "unknown";
            State.topbarNicknameRetryNextMs[index] = 0;
        }

        function resetNicknameCache(keepDisplayLabels) {
            for (var r = 0; r < SPM_MAX_PLAYERS; r++) {
                resetNicknameSlotState(r);
                if (!keepDisplayLabels) State.topbarNicknameFallbackLabels[r] = null;
            }
            State.topbarNicknamesNextRefreshMs = 0;
            State.topbarNicknamesLastClockSec = null;
        }

        function ensureDisplayLabel(playerPanel, index) {
            var displayLabel = IsPanelValid(State.topbarNicknameFallbackLabels[index]) ? State.topbarNicknameFallbackLabels[index] : null;
            if (!displayLabel && playerPanel && playerPanel.FindChildrenWithClassTraverse) {
                var alwaysLabels = playerPanel.FindChildrenWithClassTraverse("AlwaysPlayerName") || [];
                for (var a = 0; a < alwaysLabels.length; a++) {
                    var candidate = alwaysLabels[a];
                    if (!candidate || !candidate.BHasClass) continue;
                    if (!candidate.BHasClass("QOLNickRuntime")) {
                        displayLabel = candidate;
                        break;
                    }
                }
                if (!displayLabel && alwaysLabels.length > 0) displayLabel = alwaysLabels[0];
            }
            if (!displayLabel && playerPanel && $.CreatePanel) {
                displayLabel = $.CreatePanel("Label", playerPanel, "QOLNickRuntime_" + String(index));
                if (displayLabel) {
                    displayLabel.AddClass("AlwaysPlayerName");
                    displayLabel.AddClass("QOLAlwaysPlayerNameFallback");
                    displayLabel.AddClass("QOLNickRuntime");
                }
            }
            State.topbarNicknameFallbackLabels[index] = displayLabel || null;
            if (!displayLabel) return null;
            try {
                if (displayLabel.SetHasClass) displayLabel.SetHasClass("QOLNickRuntime", true);
            } catch (eRuntimeClass) {}
            try {
                if (playerPanel && displayLabel.GetParent && displayLabel.GetParent() !== playerPanel && displayLabel.SetParent) {
                    displayLabel.SetParent(playerPanel);
                }
            } catch (eReparent) {}
            return displayLabel;
        }

        function renderDisplayLabel(displayLabel, showLabel, text) {
            if (!displayLabel) return;
            if (displayLabel.text !== String(text || "")) displayLabel.text = String(text || "");
            if (displayLabel.style) {
                var newVis = showLabel ? "visible" : "collapse";
                if (displayLabel.style.visibility !== newVis) displayLabel.style.visibility = newVis;
                var newZ = showLabel ? "1000" : "0";
                if (displayLabel.style.zIndex !== newZ) displayLabel.style.zIndex = newZ;
                var newOp = showLabel ? "1" : "0";
                if (displayLabel.style.opacity !== newOp) displayLabel.style.opacity = newOp;
            }
        }

        var inHideout = isConnectedToHideout(root);
        if (inHideout) {
            if (!State.topbarNicknamesWasInHideout) {
                resetNicknameCache(true);
                State.topbarNicknamesWasInHideout = true;
            }
            for (var h = 0; h < SPM_MAX_PLAYERS; h++) {
                var hideoutPlayerPanel = IsPanelValid(State.topbarNicknamePlayers[h]) ? State.topbarNicknamePlayers[h] : null;
                if (hideoutPlayerPanel) SetPanelClassIfChanged(hideoutPlayerPanel, "qol_nickname_active", false);
                var hiddenLabel = IsPanelValid(State.topbarNicknameFallbackLabels[h]) ? State.topbarNicknameFallbackLabels[h] : null;
                renderDisplayLabel(hiddenLabel, false, "");
            }
            State.topbarNicknamesWasEnabled = enabled;
            State.topbarNicknamesNextRefreshMs = now + TOPBAR_NICKNAMES_REFRESH_MS;
            return;
        }

        if (State.topbarNicknamesWasInHideout) {
            State.topbarNicknamesWasInHideout = false;
            resetNicknameCache(true);
        }

        var clockSec = GetGameSecondsForUrn(root);
        if (State.topbarNicknamesLastClockSec !== null &&
            (clockSec + 5 < State.topbarNicknamesLastClockSec ||
            (State.topbarNicknamesLastClockSec > 30 && clockSec <= 2))) {
            resetNicknameCache(true);
        }
        State.topbarNicknamesLastClockSec = clockSec;

        var forceRefresh = (enabled !== State.topbarNicknamesWasEnabled);
        if (!forceRefresh && now < (State.topbarNicknamesNextRefreshMs || 0)) return;

        var allResolved = enabled;
        var sawPlayerPanel = false;
        for (var i = 0; i < SPM_MAX_PLAYERS; i++) {
            var cachedPlayerPanel = IsPanelValid(State.topbarNicknamePlayers[i]) ? State.topbarNicknamePlayers[i] : null;
            var playerPanel = cachedPlayerPanel;
            if (!playerPanel) {
                playerPanel = IsPanelValid(State.spm.playerPanels && State.spm.playerPanels[i]) ? State.spm.playerPanels[i] : null;
            }
            if (!playerPanel) playerPanel = GetTopBarPlayerPanel(root, i, now, false);
            if (cachedPlayerPanel && playerPanel && cachedPlayerPanel !== playerPanel) {
                resetNicknameSlotState(i);
            }
            State.topbarNicknamePlayers[i] = playerPanel || null;
            var displayLabel = playerPanel ? ensureDisplayLabel(playerPanel, i) : (IsPanelValid(State.topbarNicknameFallbackLabels[i]) ? State.topbarNicknameFallbackLabels[i] : null);
            var shouldShow = false;
            var renderText = "";

            if (!playerPanel || !playerPanel.SetHasClass) {
                resetNicknameSlotState(i);
                renderDisplayLabel(displayLabel, false, "");
                continue;
            }
            sawPlayerPanel = true;
            SetPanelClassIfChanged(playerPanel, "qol_nickname_active", enabled);

            var resolveState = String(State.topbarNicknameResolveStates[i] || "unknown");
            var retryAt = Number(State.topbarNicknameRetryNextMs[i]) || 0;
            var sourceLabel = IsPanelValid(State.topbarNicknameSourceLabels[i]) ? State.topbarNicknameSourceLabels[i] : null;
            if (!sourceLabel && resolveState === "resolved") {
                resolveState = "unknown";
                State.topbarNicknameResolveStates[i] = resolveState;
            }
            if (enabled && resolveState === "resolved") {
                var liveSourceText = ReadTopBarNicknameLabelText(sourceLabel);
                if (liveSourceText) {
                    if (liveSourceText !== String(State.topbarNicknameResolvedTexts[i] || "")) {
                        State.topbarNicknameResolvedTexts[i] = liveSourceText;
                    }
                } else {
                    resolveState = "unknown";
                    State.topbarNicknameResolveStates[i] = resolveState;
                    State.topbarNicknameRetryNextMs[i] = 0;
                    retryAt = 0;
                }
            }
            if (enabled && (resolveState !== "resolved") && now >= retryAt) {
                var resolvedSource = ResolveTopBarNicknameSource(playerPanel, sourceLabel);
                sourceLabel = resolvedSource.label;
                State.topbarNicknameSourceLabels[i] = sourceLabel || null;
                var nextText = resolvedSource.text;
                if (nextText) {
                    State.topbarNicknameResolvedTexts[i] = String(nextText);
                    State.topbarNicknameResolveStates[i] = "resolved";
                    State.topbarNicknameRetryNextMs[i] = 0;
                } else {
                    State.topbarNicknameResolvedTexts[i] = "";
                    State.topbarNicknameResolveStates[i] = "missing";
                    State.topbarNicknameRetryNextMs[i] = now + TOPBAR_NICKNAMES_UNRESOLVED_RETRY_MS;
                }
            }

            if (enabled && String(State.topbarNicknameResolveStates[i] || "unknown") !== "resolved") {
                allResolved = false;
            }
            if (enabled && !displayLabel) {
                allResolved = false;
            }

            if (enabled) {
                renderText = String(State.topbarNicknameResolvedTexts[i] || "");
                shouldShow = renderText.length > 0;
            }
            renderDisplayLabel(displayLabel, shouldShow, renderText);
        }

        State.topbarNicknamesWasEnabled = enabled;
        var nextRefreshMs = TOPBAR_NICKNAMES_REFRESH_MS;
        if (enabled && sawPlayerPanel && allResolved && !forceRefresh) {
            nextRefreshMs = TOPBAR_NICKNAMES_REFRESH_MS_STABLE;
        }
        State.topbarNicknamesNextRefreshMs = now + nextRefreshMs;
    }

    // ── Registration ──

    QOL.register("nicknames", {
        configKeys: ["ENABLE_NICKNAMES"],
        bucket: 1, phase: 0,
        gate: function(cfg) {
            return IsCfgEnabled(cfg, "ENABLE_NICKNAMES");
        },
        update: function(root, cfg, nowMs) {
            try {
                UpdateTopBarNicknames(root, nowMs, cfg);
            } catch(e) {
                $.Msg("[QOLLock][ERROR][" + _featureId + "] update: " + (e && e.message ? e.message : String(e)) + "\n" + (e && e.stack ? String(e.stack) : ""));
                throw e;
            }
        },
        stateKeys: ["topbarNicknamesWasEnabled", "topbarNicknamesNextRefreshMs",
                    "topbarNicknamePlayers", "topbarNicknameLabels",
                    "topbarNicknameSourceLabels", "topbarNicknameFallbackLabels",
                    "topbarNicknameResolvedTexts", "topbarNicknameResolveStates",
                    "topbarNicknameRetryNextMs", "topbarNicknamesWasInHideout",
                    "topbarNicknamesLastClockSec"]
    });

    // ── Self-test ──
    try {
        if (typeof UpdateTopBarNicknames !== "function") throw new Error("UpdateTopBarNicknames is not a function");
    } catch(e) {
        $.Msg("[QOLLock][ERROR][" + _featureId + "] self-test failed: " + (e && e.message ? e.message : String(e)));
    }
})();

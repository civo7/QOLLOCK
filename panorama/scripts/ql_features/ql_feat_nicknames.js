// ql_feat_nicknames.js — Top bar nickname customization
// Extracted from ql_core.js, Phase 9 Step 2c
(function() {
    'use strict';
    var _featureId = "ql_feat_nicknames";
    var _deps = QOL.import(["getCachedPanel","getGameSecondsForUrn","getTopBarPlayerPanel","refreshSpmPanelCache","state","setCachedPanel","setPanelClassIfChanged","utils","isConnectedToHideout"]);
    var GC = _deps.getCachedPanel;
    var S = _deps.state;
    var SC = _deps.setCachedPanel;
    var U = _deps.utils;
    var IsCfgEnabled = U.IsCfgEnabled;
    var IsPanelValid = U.IsPanelValid;
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
        if (!enabled && !S.topbarNicknamesWasEnabled) return;

        var now = isFinite(Number(nowMs)) ? Number(nowMs) : (Date.now ? Date.now() : (new Date()).getTime());
        if (!S.topbarNicknamePlayers) S.topbarNicknamePlayers = new Array(SPM_MAX_PLAYERS);
        if (!S.topbarNicknameSourceLabels) S.topbarNicknameSourceLabels = new Array(SPM_MAX_PLAYERS);
        if (!S.topbarNicknameFallbackLabels) S.topbarNicknameFallbackLabels = new Array(SPM_MAX_PLAYERS);
        if (!S.topbarNicknameResolvedTexts) S.topbarNicknameResolvedTexts = new Array(SPM_MAX_PLAYERS);
        if (!S.topbarNicknameResolveStates) S.topbarNicknameResolveStates = new Array(SPM_MAX_PLAYERS);
        if (!S.topbarNicknameRetryNextMs) S.topbarNicknameRetryNextMs = new Array(SPM_MAX_PLAYERS);
        RefreshSpmPanelCache(root, now);

        function resetNicknameSlotState(index) {
            if (index < 0 || index >= SPM_MAX_PLAYERS) return;
            S.topbarNicknamePlayers[index] = null;
            S.topbarNicknameSourceLabels[index] = null;
            S.topbarNicknameResolvedTexts[index] = "";
            S.topbarNicknameResolveStates[index] = "unknown";
            S.topbarNicknameRetryNextMs[index] = 0;
        }

        function resetNicknameCache(keepDisplayLabels) {
            for (var r = 0; r < SPM_MAX_PLAYERS; r++) {
                resetNicknameSlotState(r);
                if (!keepDisplayLabels) S.topbarNicknameFallbackLabels[r] = null;
            }
            S.topbarNicknamesNextRefreshMs = 0;
            S.topbarNicknamesLastClockSec = null;
        }

        function ensureDisplayLabel(playerPanel, index) {
            var displayLabel = IsPanelValid(S.topbarNicknameFallbackLabels[index]) ? S.topbarNicknameFallbackLabels[index] : null;
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
            S.topbarNicknameFallbackLabels[index] = displayLabel || null;
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
            if (!S.topbarNicknamesWasInHideout) {
                resetNicknameCache(true);
                S.topbarNicknamesWasInHideout = true;
            }
            for (var h = 0; h < SPM_MAX_PLAYERS; h++) {
                var hideoutPlayerPanel = IsPanelValid(S.topbarNicknamePlayers[h]) ? S.topbarNicknamePlayers[h] : null;
                if (hideoutPlayerPanel) SetPanelClassIfChanged(hideoutPlayerPanel, "qol_nickname_active", false);
                var hiddenLabel = IsPanelValid(S.topbarNicknameFallbackLabels[h]) ? S.topbarNicknameFallbackLabels[h] : null;
                renderDisplayLabel(hiddenLabel, false, "");
            }
            S.topbarNicknamesWasEnabled = enabled;
            S.topbarNicknamesNextRefreshMs = now + TOPBAR_NICKNAMES_REFRESH_MS;
            return;
        }

        if (S.topbarNicknamesWasInHideout) {
            S.topbarNicknamesWasInHideout = false;
            resetNicknameCache(true);
        }

        var clockSec = GetGameSecondsForUrn(root);
        if (S.topbarNicknamesLastClockSec !== null &&
            (clockSec + 5 < S.topbarNicknamesLastClockSec ||
            (S.topbarNicknamesLastClockSec > 30 && clockSec <= 2))) {
            resetNicknameCache(true);
        }
        S.topbarNicknamesLastClockSec = clockSec;

        var forceRefresh = (enabled !== S.topbarNicknamesWasEnabled);
        if (!forceRefresh && now < (S.topbarNicknamesNextRefreshMs || 0)) return;

        var allResolved = enabled;
        var sawPlayerPanel = false;
        for (var i = 0; i < SPM_MAX_PLAYERS; i++) {
            var cachedPlayerPanel = IsPanelValid(S.topbarNicknamePlayers[i]) ? S.topbarNicknamePlayers[i] : null;
            var playerPanel = cachedPlayerPanel;
            if (!playerPanel) {
                playerPanel = IsPanelValid(S.spm.playerPanels && S.spm.playerPanels[i]) ? S.spm.playerPanels[i] : null;
            }
            if (!playerPanel) playerPanel = GetTopBarPlayerPanel(root, i, now, false);
            if (cachedPlayerPanel && playerPanel && cachedPlayerPanel !== playerPanel) {
                resetNicknameSlotState(i);
            }
            S.topbarNicknamePlayers[i] = playerPanel || null;
            var displayLabel = playerPanel ? ensureDisplayLabel(playerPanel, i) : (IsPanelValid(S.topbarNicknameFallbackLabels[i]) ? S.topbarNicknameFallbackLabels[i] : null);
            var shouldShow = false;
            var renderText = "";

            if (!playerPanel || !playerPanel.SetHasClass) {
                resetNicknameSlotState(i);
                renderDisplayLabel(displayLabel, false, "");
                continue;
            }
            sawPlayerPanel = true;
            SetPanelClassIfChanged(playerPanel, "qol_nickname_active", enabled);

            var resolveState = String(S.topbarNicknameResolveStates[i] || "unknown");
            var retryAt = Number(S.topbarNicknameRetryNextMs[i]) || 0;
            var sourceLabel = IsPanelValid(S.topbarNicknameSourceLabels[i]) ? S.topbarNicknameSourceLabels[i] : null;
            if (!sourceLabel && resolveState === "resolved") {
                resolveState = "unknown";
                S.topbarNicknameResolveStates[i] = resolveState;
            }
            if (enabled && resolveState === "resolved") {
                var liveSourceText = ReadTopBarNicknameLabelText(sourceLabel);
                if (liveSourceText) {
                    if (liveSourceText !== String(S.topbarNicknameResolvedTexts[i] || "")) {
                        S.topbarNicknameResolvedTexts[i] = liveSourceText;
                    }
                } else {
                    resolveState = "unknown";
                    S.topbarNicknameResolveStates[i] = resolveState;
                    S.topbarNicknameRetryNextMs[i] = 0;
                    retryAt = 0;
                }
            }
            if (enabled && (resolveState !== "resolved") && now >= retryAt) {
                var resolvedSource = ResolveTopBarNicknameSource(playerPanel, sourceLabel);
                sourceLabel = resolvedSource.label;
                S.topbarNicknameSourceLabels[i] = sourceLabel || null;
                var nextText = resolvedSource.text;
                if (nextText) {
                    S.topbarNicknameResolvedTexts[i] = String(nextText);
                    S.topbarNicknameResolveStates[i] = "resolved";
                    S.topbarNicknameRetryNextMs[i] = 0;
                } else {
                    S.topbarNicknameResolvedTexts[i] = "";
                    S.topbarNicknameResolveStates[i] = "missing";
                    S.topbarNicknameRetryNextMs[i] = now + TOPBAR_NICKNAMES_UNRESOLVED_RETRY_MS;
                }
            }

            if (enabled && String(S.topbarNicknameResolveStates[i] || "unknown") !== "resolved") {
                allResolved = false;
            }
            if (enabled && !displayLabel) {
                allResolved = false;
            }

            if (enabled) {
                renderText = String(S.topbarNicknameResolvedTexts[i] || "");
                shouldShow = renderText.length > 0;
            }
            renderDisplayLabel(displayLabel, shouldShow, renderText);
        }

        S.topbarNicknamesWasEnabled = enabled;
        var nextRefreshMs = TOPBAR_NICKNAMES_REFRESH_MS;
        if (enabled && sawPlayerPanel && allResolved && !forceRefresh) {
            nextRefreshMs = TOPBAR_NICKNAMES_REFRESH_MS_STABLE;
        }
        S.topbarNicknamesNextRefreshMs = now + nextRefreshMs;
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

// features/ql_nicknames/manifest.js
// =============================================================================
// QOLLOCK — Top Bar Player Nicknames
// =============================================================================
// OWNS:        Nickname display labels on top bar player panels,
//              name resolution from PlayerName labels, fallback label creation
// DOES NOT OWN: Player panels (Valve), player name data (game)
// DEPENDS ON:  QOL.core.FeatureRegistry, QOL.core.Scheduler,
//              QOL.state (spm.playerPanels, topbarNickname* arrays)
// CONFIG KEYS: ENABLE_NICKNAMES (toggle)
// PATTERN:     Polling (1Hz stable, 4.2Hz when resolving).
//              Resolves player names from PlayerName labels on top bar panels,
//              creates AlwaysPlayerName fallback labels, tracks resolve state
//              per player slot.
// =============================================================================

(function() {
    "use strict";
    var FR = QOL.core.FeatureRegistry;
    if (!FR) { $.Msg("[QOLLock] nicknames: FeatureRegistry not found — aborting"); return; }

    FR.register({
        id: "ql_nicknames",
        enableKey: "ENABLE_NICKNAMES",
        enabledByDefault: false,
        settings: [
            { key: "ENABLE_NICKNAMES", type: "toggle", default: false }
        ],
        create: function(ctx) {
            var _loop = null;
            var MAX_PLAYERS = 13;
            var REFRESH_MS = 1000;
            var REFRESH_MS_STABLE = 4200;
            var UNRESOLVED_RETRY_MS = 4000;

            // Per-slot state arrays (replaces State.topbarNickname*)
            var _players = new Array(MAX_PLAYERS);
            var _sourceLabels = new Array(MAX_PLAYERS);
            var _fallbackLabels = new Array(MAX_PLAYERS);
            var _resolvedTexts = new Array(MAX_PLAYERS);
            var _resolveStates = new Array(MAX_PLAYERS);
            var _retryNextMs = new Array(MAX_PLAYERS);
            var _nextRefreshMs = 0;
            var _lastClockSec = null;
            var _wasEnabled = false;
            var _wasInHideout = false;

            function _alive(p) {
                return !!(p && typeof p.IsValid === "function" && p.IsValid());
            }

            function _inHideout(root) {
                if (!root || !root.BHasClass) return false;
                try { return root.BHasClass("connectedToHideout") || root.BHasClass("InHideout"); } catch(e) { return false; }
            }

            function _getGameSeconds(root) {
                // Read game clock from Urn timer panel
                try {
                    if (root && root.FindChildTraverse) {
                        var urn = root.FindChildTraverse("UrnTimer");
                        if (urn && urn.GetAttributeString) {
                            var t = urn.GetAttributeString("time", "");
                            if (t) { var n = parseFloat(t); if (isFinite(n)) return n; }
                        }
                    }
                } catch(e) {}
                return null;
            }

            function _getTopBarPlayerPanel(root, index) {
                if (!root || !root.FindChildTraverse) return null;
                try {
                    // Match old system: panels are identified by ID "TopBarPlayerN"
                    var panel = root.FindChildTraverse("TopBarPlayer" + index);
                    if (_alive(panel)) return panel;
                } catch(e) {}
                return null;
            }

            function _normalizeText(raw) {
                var text = "";
                try { text = (raw === undefined || raw === null) ? "" : String(raw || "").trim(); } catch(e) { text = ""; }
                if (!text || text === "{s:player_name}") return "";
                return text;
            }

            function _readLabelText(label) {
                if (!_alive(label)) return "";
                var raw = "";
                try { raw = typeof label.text === "string" ? String(label.text || "") : ""; } catch(e) { raw = ""; }
                return _normalizeText(raw);
            }

            function _resolveSource(playerPanel, cachedLabel) {
                var source = _alive(cachedLabel) ? cachedLabel : null;
                var text = _readLabelText(source);
                if (text) return { label: source, text: text };
                if (!playerPanel || !playerPanel.FindChildrenWithClassTraverse) return { label: source, text: "" };

                var labels = playerPanel.FindChildrenWithClassTraverse("PlayerName") || [];
                for (var i = 0; i < labels.length; i++) {
                    if (!_alive(labels[i])) continue;
                    if (!source) source = labels[i];
                    var t = _readLabelText(labels[i]);
                    if (t) return { label: labels[i], text: t };
                }
                return { label: source, text: "" };
            }

            function _ensureFallbackLabel(playerPanel, index) {
                var display = _alive(_fallbackLabels[index]) ? _fallbackLabels[index] : null;
                if (!display && playerPanel && playerPanel.FindChildrenWithClassTraverse) {
                    var alwaysLabels = playerPanel.FindChildrenWithClassTraverse("AlwaysPlayerName") || [];
                    for (var i = 0; i < alwaysLabels.length; i++) {
                        if (!alwaysLabels[i] || !alwaysLabels[i].BHasClass) continue;
                        if (!alwaysLabels[i].BHasClass("QOLNickRuntime")) { display = alwaysLabels[i]; break; }
                    }
                    if (!display && alwaysLabels.length > 0) display = alwaysLabels[0];
                }
                if (!display && playerPanel && $.CreatePanel) {
                    display = $.CreatePanel("Label", playerPanel, "QOLNickRuntime_" + String(index));
                    if (display) {
                        display.AddClass("AlwaysPlayerName");
                        display.AddClass("QOLAlwaysPlayerNameFallback");
                        display.AddClass("QOLNickRuntime");
                    }
                }
                _fallbackLabels[index] = display || null;
                if (display && display.SetHasClass) {
                    try { display.SetHasClass("QOLNickRuntime", true); } catch(e) {}
                }
                // Reparent label to playerPanel if it was orphaned by a top bar rebuild
                try {
                    if (display && playerPanel && display.GetParent && display.GetParent() !== playerPanel && display.SetParent) {
                        display.SetParent(playerPanel);
                    }
                } catch(e) {}
                return display;
            }

            function _renderDisplay(display, show, text) {
                if (!display) return;
                if (display.text !== String(text || "")) display.text = String(text || "");
                if (display.style) {
                    var newVis = show ? "visible" : "collapse";
                    if (display.SetHasClass) display.SetHasClass("qol-hidden", !show);
                    else if (display.style.visibility !== newVis) display.style.visibility = newVis;
                    var newZ = show ? "1000" : "0";
                    if (display.style.zIndex !== newZ) display.style.zIndex = newZ;
                    var newOp = show ? "1" : "0";
                    if (display.style.opacity !== newOp) display.style.opacity = newOp;
                }
            }

            function _resetSlot(index) {
                _players[index] = null; _sourceLabels[index] = null; _fallbackLabels[index] = null;
                _resolvedTexts[index] = ""; _resolveStates[index] = "unknown"; _retryNextMs[index] = 0;
            }

            function _resetAll(keepLabels) {
                for (var i = 0; i < MAX_PLAYERS; i++) {
                    _resetSlot(i);
                    if (!keepLabels) _fallbackLabels[i] = null;
                }
                _nextRefreshMs = 0; _lastClockSec = null;
            }

            function _processSlot(root, now, i, enabled) {
                var playerPanel = _alive(_players[i]) ? _players[i] : null;
                if (!playerPanel) {
                    // Try SPM cache
                    try {
                        var State = QOL.state;
                        var spmPanel = State && State.spm && State.spm.playerPanels ? State.spm.playerPanels[i] : null;
                        if (_alive(spmPanel)) playerPanel = spmPanel;
                    } catch(e) {}
                }
                if (!playerPanel) playerPanel = _getTopBarPlayerPanel(root, i);

                // Detect panel change — reset slot state when panel object changes
                var cachedPanel = _alive(_players[i]) ? _players[i] : null;
                if (cachedPanel && playerPanel && cachedPanel !== playerPanel) {
                    _resetSlot(i);
                }
                _players[i] = playerPanel || null;

                var display = _alive(_fallbackLabels[i]) ? _fallbackLabels[i] : null;
                if (playerPanel) display = _ensureFallbackLabel(playerPanel, i);

                if (!playerPanel || !playerPanel.SetHasClass) {
                    _resetSlot(i); _renderDisplay(display, false, "");
                    return { saw: false, resolved: false };
                }

                try { playerPanel.SetHasClass("qol_nickname_active", enabled); } catch(e) {}

                var state = String(_resolveStates[i] || "unknown");
                var retryAt = Number(_retryNextMs[i]) || 0;
                var sourceLabel = _alive(_sourceLabels[i]) ? _sourceLabels[i] : null;

                if (!sourceLabel && state === "resolved") { state = "unknown"; _resolveStates[i] = state; }

                if (enabled && state === "resolved") {
                    var liveText = _readLabelText(sourceLabel);
                    if (liveText) {
                        if (liveText !== String(_resolvedTexts[i] || "")) _resolvedTexts[i] = liveText;
                    } else {
                        state = "unknown"; _resolveStates[i] = state; _retryNextMs[i] = 0; retryAt = 0;
                    }
                }

                if (enabled && state !== "resolved" && now >= retryAt) {
                    var resolved = _resolveSource(playerPanel, sourceLabel);
                    sourceLabel = resolved.label;
                    _sourceLabels[i] = sourceLabel || null;
                    if (resolved.text) {
                        _resolvedTexts[i] = String(resolved.text);
                        _resolveStates[i] = "resolved";
                        _retryNextMs[i] = 0;
                    } else {
                        _resolvedTexts[i] = "";
                        _resolveStates[i] = "missing";
                        _retryNextMs[i] = now + UNRESOLVED_RETRY_MS;
                    }
                }

                var slotResolved = enabled && String(_resolveStates[i] || "unknown") === "resolved" && !!display;
                var renderText = enabled ? String(_resolvedTexts[i] || "") : "";
                var shouldShow = renderText.length > 0;
                _renderDisplay(display, shouldShow, renderText);
                return { saw: true, resolved: slotResolved };
            }

            function _tick() {
                var root = $.GetContextPanel();
                if (!_alive(root)) return;

                var enabled = Number(ctx.config.get("ENABLE_NICKNAMES")) === 1;
                if (!enabled && !_wasEnabled) return;

                var now = Date.now ? Date.now() : (new Date()).getTime();

                if (_inHideout(root)) {
                    if (!_wasInHideout) { _resetAll(true); _wasInHideout = true; }
                    for (var h = 0; h < MAX_PLAYERS; h++) {
                        var hp = _alive(_players[h]) ? _players[h] : null;
                        if (hp && hp.SetHasClass) { try { hp.SetHasClass("qol_nickname_active", false); } catch(e) {} }
                        _renderDisplay(_alive(_fallbackLabels[h]) ? _fallbackLabels[h] : null, false, "");
                    }
                    _wasEnabled = enabled; _nextRefreshMs = now + REFRESH_MS;
                    return;
                }
                if (_wasInHideout) { _wasInHideout = false; _resetAll(true); }

                var clockSec = _getGameSeconds(root);
                if (_lastClockSec !== null && (clockSec + 5 < _lastClockSec || (_lastClockSec > 30 && clockSec <= 2))) {
                    _resetAll(true);
                }
                _lastClockSec = clockSec;

                var forceRefresh = (enabled !== _wasEnabled);
                if (!forceRefresh && now < _nextRefreshMs) return;

                var allResolved = enabled;
                var sawAny = false;
                for (var i = 0; i < MAX_PLAYERS; i++) {
                    var result = _processSlot(root, now, i, enabled);
                    if (result.saw) sawAny = true;
                    if (!result.resolved) allResolved = false;
                }

                _wasEnabled = enabled;
                var nextMs = REFRESH_MS;
                if (enabled && sawAny && allResolved && !forceRefresh) nextMs = REFRESH_MS_STABLE;
                _nextRefreshMs = now + nextMs;
            }

            return {
                onEnable: function() {
                    var S = QOL.core.Scheduler;
                    _loop = S && S.createPollLoop ? S.createPollLoop(_tick, 1.0, "ql_nicknames") : null;
                },
                onDisable: function() {
                    if (_loop) { _loop.stop(); _loop = null; }
                    _resetAll(false); _wasEnabled = false;
                },
                onSettingsChanged: function() {}
            };
        }
    });
})();

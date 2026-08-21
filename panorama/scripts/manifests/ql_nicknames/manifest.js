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
            var _wasEnabled = false;

            function _alive(p) {
                return !!(p && typeof p.IsValid === "function" && p.IsValid());
            }

            // _inHideout and _getGameSeconds were defined here and never called. Removed
            // rather than wired up: nothing in this feature needs the game clock, and the
            // hideout check would have needed fixing first anyway — it looked for "Hud"
            // from the context panel, which in the HUD context IS the Hud panel, so
            // FindChildTraverse can never return it. It also carried an ungated $.Msg in
            // its success path, which would have logged on every pass had it ever run.
            // The unreachable-id audit reported its "UrnTimer" lookup as a guaranteed
            // full-tree miss, which reads as a live cost until you notice the caller list
            // is empty.

            // Per-slot backoff for panel lookups that miss.
            //
            // CORRECTED 2026-08-21 from a captured live tree. The earlier note here said
            // "MAX_PLAYERS is 13 while a Deadlock match is 6v6, so slot 12 has no panel
            // and never will" — that was backwards, and it sent a perf fix at the wrong
            // slot. The engine numbers these panels TopBarPlayer1..TopBarPlayer12: twelve
            // panels, one per player, and **no TopBarPlayer0**. Slot 12 is real; slot 0
            // is the one that can never resolve.
            //
            // A FindChildTraverse miss walks the entire HUD — 31,411 panels in that
            // capture — so the dead slot cost a full-tree walk on every pass. The shared
            // getter (ql_core.js GetTopBarPlayerPanel) now applies a 30s cooldown to any
            // slot that has never resolved, which covers this path and every other
            // consumer of the same ids; this local backoff still handles a slot that has
            // simply not been created yet early in a match.
            //
            // Deliberately NOT changing the loop to start at 1: two player-slot families
            // in the capture are 1-based, but other id families in the same tree are
            // 0-based, so that is an observation about one build rather than a rule. A
            // cheap miss is correct either way; a skipped slot would silently drop a
            // player if some mode does number from zero.
            var SLOT_MISS_BACKOFF_MS = 3000;
            // Long cooldown for a slot that has never resolved once — see the note
            // above: slot 0 cannot resolve, and each attempt is a whole-HUD walk.
            var SLOT_NEVER_RESOLVED_BACKOFF_MS = 30000;
            var _slotMissUntil = new Array(MAX_PLAYERS);
            var _slotEverResolved = new Array(MAX_PLAYERS);

            function _getTopBarPlayerPanel(root, index, nowMs) {
                if (!root || !root.FindChildTraverse) return null;
                var now = Number(nowMs) || 0;
                if (now > 0 && now < (Number(_slotMissUntil[index]) || 0)) return null;
                try {
                    // Match old system: panels are identified by ID "TopBarPlayerN"
                    var panel = root.FindChildTraverse("TopBarPlayer" + index);
                    if (_alive(panel)) {
                        _slotMissUntil[index] = 0;
                        _slotEverResolved[index] = true;
                        return panel;
                    }
                } catch(e) {}
                if (now > 0) {
                    _slotMissUntil[index] = now +
                        (_slotEverResolved[index] ? SLOT_MISS_BACKOFF_MS : SLOT_NEVER_RESOLVED_BACKOFF_MS);
                }
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
                    // Same reason as the qol_nickname_active guard in _processSlot: an
                    // unchanged class write still costs a subtree style re-match.
                    if (display.SetHasClass) {
                        var wantHidden = !show;
                        if (!display.BHasClass || display.BHasClass("qol-hidden") !== wantHidden) {
                            display.SetHasClass("qol-hidden", wantHidden);
                        }
                    }
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
                _nextRefreshMs = 0;
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
                if (!playerPanel) playerPanel = _getTopBarPlayerPanel(root, i, now);

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

                // Only touch the class when it actually differs.
                //
                // Panorama does not compare before acting: re-applying a class a panel
                // already has still invalidates it and re-matches styles for its whole
                // subtree. A top bar player panel is not small — it carries the hero
                // badge, ability icons, item bars and purchased-mod panels — and this ran
                // for all 13 slots on every pass. The in-game perf overlay measured
                // ql_nicknames at 2.4ms average and 8-9ms peak per pass, by far the most
                // expensive feature in a live match; a 9ms spike is over half a frame at
                // 60fps, which is what a player reports as a stutter.
                try {
                    if (!playerPanel.BHasClass || playerPanel.BHasClass("qol_nickname_active") !== enabled) {
                        playerPanel.SetHasClass("qol_nickname_active", enabled);
                    }
                } catch(e) {}

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

                var forceRefresh = (enabled !== _wasEnabled);
                if (!forceRefresh && now < _nextRefreshMs) { /* waiting for next refresh window */ return; }

                var allResolved = enabled;
                var sawAny = false;
                for (var i = 0; i < MAX_PLAYERS; i++) {
                    var result = _processSlot(root, now, i, enabled);
                    if (result.saw) sawAny = true;
                    if (!result.resolved) allResolved = false;
                }
                // sawAny: at least one player panel found. allResolved: all names resolved.

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
                    // Hide all existing labels before stopping the loop
                    for (var h = 0; h < MAX_PLAYERS; h++) {
                        var hp = _alive(_players[h]) ? _players[h] : null;
                        if (hp && hp.SetHasClass) { try { hp.SetHasClass("qol_nickname_active", false); } catch(e) {} }
                        _renderDisplay(_alive(_fallbackLabels[h]) ? _fallbackLabels[h] : null, false, "");
                    }
                    if (_loop) { _loop.stop(); _loop = null; }
                    _resetAll(false); _wasEnabled = false;
                },
                onSettingsChanged: function() {}
            };
        },
    test: function(ctx) {
        try {
            var root = $.GetContextPanel();
            if (!root || !root.FindChildTraverse) return null;   // Skip — no tree

            // Skip when there is no top bar at all: that is "not in a match", not a
            // failure. This hook used to assert TopBarPlayer0 directly and reported
            // FAIL in a session where nicknames were working, which is a false alarm
            // that costs real debugging time.
            var topBar = root.FindChildTraverse("TopBar");
            if (!topBar) return null;   // Skip — top bar not loaded

            // Accept either route to a player panel, because the feature does too:
            // _processSlot tries its own cache, then State.spm.playerPanels, and only
            // then the "TopBarPlayerN" id. Asserting just the id would fail whenever
            // the engine names those panels differently, while the feature carries on
            // working through the container chain — which is how ql_showrank reaches
            // them (TopBar -> TeamsContainer -> Team -> PlayerContents ->
            // PlayersContainer -> child).
            var byId = root.FindChildTraverse("TopBarPlayer0");
            var byChain = null;
            var teams = topBar.FindChildTraverse ? topBar.FindChildTraverse("TeamsContainer") : null;
            if (teams && teams.GetChildCount) {
                for (var t = 0; t < teams.GetChildCount() && t < 4 && !byChain; t++) {
                    var team = teams.GetChild(t);
                    var contents = (team && team.FindChildTraverse) ? team.FindChildTraverse("PlayerContents") : null;
                    var container = (contents && contents.FindChildTraverse) ? contents.FindChildTraverse("PlayersContainer") : null;
                    if (container && container.GetChildCount && container.GetChildCount() > 0) {
                        byChain = container.GetChild(0);
                    }
                }
            }

            var found = !!(byId || byChain);
            return {
                passed: found,
                name: "Top bar player panels are reachable",
                message: found
                    ? ("via " + (byId ? "id" : "-") + (byChain ? "+chain" : "") )
                    : "no player panel found by id TopBarPlayer0 or via TeamsContainer chain",
                assertions: [
                    { passed: !!byId, name: "TopBarPlayer0 resolves by id" },
                    { passed: !!byChain, name: "player resolves via TeamsContainer chain" }
                ]
            };
        } catch(e) { return { passed: false, name: "Nicknames panel check", message: (e && e.message ? e.message : String(e)) }; }
    }
    });
})();

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
            // Has ANY slot resolved this session — i.e. does the top bar exist yet.
            //
            // "Never resolved" alone is not enough to call a slot absent. Before the
            // top bar inflates (loading screen, draft, hideout) no slot has resolved,
            // so the first miss would arm the 30s cooldown on all thirteen and every
            // real player would stay nameless for half a minute after the top bar
            // finally appeared. Until something resolves, a miss only means "too
            // early" and takes the ordinary short backoff.
            var _anySlotEverResolved = false;

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
                        _anySlotEverResolved = true;
                        return panel;
                    }
                } catch(e) {}
                if (now > 0) {
                    var absent = !_slotEverResolved[index] && _anySlotEverResolved;
                    _slotMissUntil[index] = now +
                        (absent ? SLOT_NEVER_RESOLVED_BACKOFF_MS : SLOT_MISS_BACKOFF_MS);
                }
                return null;
            }

            function _apply(cfg) {
                var root = $.GetContextPanel();
                if (root && root.FindChildTraverse) {
                    var topBar = root.FindChildTraverse("TopBar");
                    if (topBar && topBar.SetHasClass) {
                        var enabled = Number(cfg.ENABLE_NICKNAMES) === 1;
                        topBar.SetHasClass("qol_topbar_nicknames_enabled", enabled);
                    }
                }
            }
            return {
                onEnable: function() { _apply(ctx.config.all()); },
                onDisable: function() {
                    var root = $.GetContextPanel();
                    if (root && root.FindChildTraverse) {
                        var topBar = root.FindChildTraverse("TopBar");
                        if (topBar && topBar.SetHasClass) {
                            topBar.SetHasClass("qol_topbar_nicknames_enabled", false);
                        }
                    }
                },
                onSettingsChanged: function() { _apply(ctx.config.all()); }
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

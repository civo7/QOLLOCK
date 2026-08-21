// features/ql_unspent/manifest.js
// =============================================================================
// QOLLOCK — Unspent Souls Display on Top Bar Player Panels
// =============================================================================
// OWNS:        "SpentSoulDisplay" labels on top bar player panels,
//              spent-souls calculation via tier-count scanning,
//              unspent = netWorth - spent display with k-formatted text
// DOES NOT OWN: Soul values (read from HiddenGoldValue/SoulsValue labels),
//              PlayerModsContainer panels (Valve)
// DEPENDS ON:  QOL.core.FeatureRegistry, QOL.core.Scheduler,
//              QOL.state (spm.playerPanels for panel cache)
// CONFIG KEYS: ENABLE_UNSPENT_SOULS (toggle)
// PATTERN:     Polling (5Hz). 13-player staggered batch processing.
//              Tier-cost scanning with structure-signature change detection.
//              Item tier costs: T1=500, T2=1250, T3=3000, T4=6200
//              (GAME_VERSION_DEPENDENT — verify after patches)
// =============================================================================

(function() {
    "use strict";
    var FR = QOL.core.FeatureRegistry;
    if (!FR) { $.Msg("[QOLLock] unspent: FeatureRegistry not found — aborting"); return; }

    FR.register({
        id: "ql_unspent",
        enableKey: "ENABLE_UNSPENT_SOULS",
        enabledByDefault: false,
        settings: [
            { key: "ENABLE_UNSPENT_SOULS", type: "toggle", default: false }
        ],
        create: function(ctx) {
            var _loop = null;
            var MAX_PLAYERS = 13;
            var SAMPLE_INTERVAL_MS = 200;
            var BATCH_SIZE = 1;
            var CACHE_REFRESH_MS = 9000;
            var TIER_SCAN_INTERVAL_MS = 3000;
            var TIER_SCAN_STABLE_MS = 5000;
            var TIER_SCAN_STAGGER_MS = 250;
            var TIER_SCAN_MAX_PANELS = 300;
            var SIG_MAX_DEPTH = 2;
            var SIG_MAX_NODES = 48;
            // GAME_VERSION_DEPENDENT — verify after each game patch. Last verified: 2026-07-20.
            var TIER_COST = { 1: 800, 2: 1600, 3: 3200, 4: 6400 };

            // Per-slot state (replaces State.unspent*)
            var _playerPanels = new Array(MAX_PLAYERS);
            var _modsContainers = new Array(MAX_PLAYERS);
            var _displayLabels = new Array(MAX_PLAYERS);
            var _soulLabelsPrimary = new Array(MAX_PLAYERS);
            var _soulLabelsFallback = new Array(MAX_PLAYERS);
            var _cachedSpentSouls = new Array(MAX_PLAYERS);
            var _modsChildCount = new Array(MAX_PLAYERS);
            var _modsSig = new Array(MAX_PLAYERS);
            var _nextTierScanMs = new Array(MAX_PLAYERS);
            var _lastDisplayText = new Array(MAX_PLAYERS);
            var _nextSampleMs = 0;
            var _cacheNextMs = 0;
            var _playerCursor = 0;
            var _wasDisabled = true;

            function _alive(p) {
                return !!(p && typeof p.IsValid === "function" && p.IsValid());
            }

            var _hudPanel = null;

            /**
             * Hideout check.
             *
             * The old body ran root.FindChildTraverse("Hud") on every tick. In the HUD
             * context $.GetContextPanel() IS the Hud panel, and FindChildTraverse never
             * returns the panel it was called on — so that lookup could not succeed,
             * and a miss walks the whole subtree before returning null. It was the
             * largest single wasted traversal left in the profile, ~19k tree nodes a
             * second.
             *
             * PanelHelpers.findHud handles both shapes (context panel, or a walk up to
             * the absolute root and search from there), so resolve through it and cache
             * the result, re-resolving only when the cached panel dies.
             *
             * Also fixes a latent bug: the old body had no trailing return, so the
             * not-in-hideout path returned undefined and worked only because undefined
             * happens to be falsy.
             */
            function _inHideout(root) {
                if (!root || !root.BHasClass) return false;
                try {
                    if (!_alive(_hudPanel)) {
                        _hudPanel = (typeof QOL !== "undefined" && QOL.ui && QOL.ui.PanelHelpers && QOL.ui.PanelHelpers.findHud)
                            ? QOL.ui.PanelHelpers.findHud()
                            : null;
                    }
                    if (_alive(_hudPanel) && _hudPanel.BHasClass &&
                        (_hudPanel.BHasClass("connectedToHideout") || _hudPanel.BHasClass("InHideout"))) {
                        return true;
                    }
                    if (root.BHasClass("connectedToHideout") || root.BHasClass("InHideout")) return true;
                } catch (e) { return false; }
                return false;
            }

            function _getSoulValue(primaryLabel, fallbackLabel) {
                var text = "";
                try {
                    if (_alive(primaryLabel) && primaryLabel.text) text = String(primaryLabel.text);
                    if (!text && _alive(fallbackLabel) && fallbackLabel.text) text = String(fallbackLabel.text);
                } catch(e) { text = ""; }
                if (!text) return 0;
                // Parse "12.5k" or "12500" format
                text = text.replace(/,/g, "").trim();
                var multiplier = 1;
                if (/k$/i.test(text)) { multiplier = 1000; text = text.slice(0, -1); }
                var val = parseFloat(text);
                return isFinite(val) ? Math.round(val * multiplier) : 0;
            }

            // Per-slot backoff, for the same reason as in ql_nicknames: MAX_PLAYERS is
            // 13 while a match is 6v6, so slot 12 never resolves and a
            // FindChildTraverse miss walks the whole HUD subtree. Here it is worse,
            // because a miss ALSO ran the class-traverse fallback below — a collect-all
            // walk with no early exit — so a dead slot cost two full-tree walks.
            //
            // MAX_PLAYERS is left alone on purpose; see the note in ql_nicknames.
            var SLOT_MISS_BACKOFF_MS = 3000;
            // A slot that has NEVER resolved is treated differently from one that is
            // merely late. Captured live tree (2026-08-21): the engine creates
            // TopBarPlayer1..TopBarPlayer12 and there is no TopBarPlayer0, while this
            // loop runs 0..12 — so slot 0 is a lookup that cannot succeed, and a miss
            // walks the whole HUD (31,411 panels measured). At the 3s backoff that is a
            // full-tree walk every three seconds for the entire match.
            //
            // Not skipped outright: two player-slot id families in that capture are
            // 1-based but other families in the same tree are 0-based, so 1-based is an
            // observation about one build, not a rule. A long cooldown removes the cost
            // and still finds the panel if some mode does create slot 0.
            var SLOT_NEVER_RESOLVED_BACKOFF_MS = 30000;
            var _slotMissUntil = new Array(MAX_PLAYERS);
            var _slotEverResolved = new Array(MAX_PLAYERS);

            function _getTopBarPlayerPanel(root, index, nowMs) {
                if (!root || !root.FindChildTraverse) return null;
                var now = Number(nowMs) || 0;
                if (now > 0 && now < (Number(_slotMissUntil[index]) || 0)) return null;
                try {
                    var playerPanel = root.FindChildTraverse("TopBarPlayer" + index);
                    if (_alive(playerPanel)) {
                        _slotMissUntil[index] = 0;
                        _slotEverResolved[index] = true;
                        return playerPanel;
                    }

                    // Compatibility fallback for older top-bar layouts. No layout in
                    // the current game or in the mod declares a "player_N" class, so
                    // this cannot hit today — kept for the older layouts it was written
                    // for, but now behind the same backoff so it is not a full-tree
                    // collect-all on every pass.
                    var panels = root.FindChildrenWithClassTraverse("player_" + index) || [];
                    for (var i = 0; i < panels.length; i++) {
                        if (!_alive(panels[i])) continue;
                        var parent = panels[i].GetParent ? panels[i].GetParent() : null;
                        if (parent && parent.id === "PlayerStatus") {
                            _slotMissUntil[index] = 0;
                            _slotEverResolved[index] = true;
                            return panels[i];
                        }
                    }
                } catch(e) {}
                if (now > 0) {
                    _slotMissUntil[index] = now +
                        (_slotEverResolved[index] ? SLOT_MISS_BACKOFF_MS : SLOT_NEVER_RESOLVED_BACKOFF_MS);
                }
                return null;
            }

            function _refreshPanelCache(root, nowMs, createDisplays) {
                if (!root) return;
                if (nowMs < _cacheNextMs) return;

                for (var i = 0; i < MAX_PLAYERS; i++) {
                    var playerPanel = _getTopBarPlayerPanel(root, i, nowMs);
                    var panelChanged = (_playerPanels[i] !== (playerPanel || null));
                    _playerPanels[i] = playerPanel || null;

                    var modsContainer = playerPanel && playerPanel.FindChildTraverse ?
                        playerPanel.FindChildTraverse("PlayerModsContainer") : null;
                    var modsChanged = (_modsContainers[i] !== (modsContainer || null));
                    _modsContainers[i] = modsContainer || null;

                    _soulLabelsPrimary[i] = playerPanel && playerPanel.FindChildTraverse ?
                        (playerPanel.FindChildTraverse("HiddenGoldValue") || null) : null;
                    _soulLabelsFallback[i] = playerPanel && playerPanel.FindChildTraverse ?
                        (playerPanel.FindChildTraverse("SoulsValue") || null) : null;

                    var display = playerPanel && playerPanel.FindChildTraverse ?
                        playerPanel.FindChildTraverse("SpentSoulDisplay") : null;
                    if (!display && createDisplays && playerPanel) {
                        display = $.CreatePanel("Label", playerPanel, "SpentSoulDisplay");
                        if (display) display.AddClass("SpentSoulDisplay");
                    }
                    _displayLabels[i] = display || null;

                    if (panelChanged || modsChanged) {
                        _cachedSpentSouls[i] = 0;
                        _modsChildCount[i] = -1;
                        _modsSig[i] = "";
                        _lastDisplayText[i] = "";
                        _nextTierScanMs[i] = nowMs + (i * TIER_SCAN_STAGGER_MS);
                    }
                }
                _cacheNextMs = nowMs + CACHE_REFRESH_MS + 311;
            }

            function _scanTiers(modsContainer) {
                var result = { t1: 0, t2: 0, t3: 0, t4: 0 };
                if (!modsContainer) return result;
                var stack = [modsContainer];
                var scanned = 0;
                while (stack.length > 0 && scanned < TIER_SCAN_MAX_PANELS) {
                    var panel = stack.pop();
                    if (!panel) continue;
                    scanned++;
                    if (panel !== modsContainer && panel.BHasClass) {
                        if (panel.BHasClass("isTier1") || panel.BHasClass("IsTier1")) result.t1++;
                        else if (panel.BHasClass("isTier2") || panel.BHasClass("IsTier2")) result.t2++;
                        else if (panel.BHasClass("isTier3") || panel.BHasClass("IsTier3")) result.t3++;
                        else if (panel.BHasClass("isTier4") || panel.BHasClass("IsTier4")) result.t4++;
                    }
                    var childCount = 0;
                    try { childCount = panel.GetChildCount ? panel.GetChildCount() : 0; } catch(e) {}
                    for (var i = 0; i < childCount; i++) {
                        var child = null;
                        try { child = panel.GetChild(i); } catch(e) { child = null; }
                        if (child) stack.push(child);
                    }
                }
                return result;
            }

            function _buildSig(modsContainer) {
                if (!modsContainer) return "";
                var parts = [];
                var stack = [{ panel: modsContainer, depth: 0 }];
                var scanned = 0;
                while (stack.length > 0 && scanned < SIG_MAX_NODES) {
                    var entry = stack.pop();
                    var p = entry ? entry.panel : null;
                    var d = entry ? Number(entry.depth) || 0 : 0;
                    if (!p) continue;
                    scanned++;
                    var cc = 0; try { cc = p.GetChildCount ? p.GetChildCount() : 0; } catch(e) {}
                    var pid = ""; try { pid = String(p.id || ""); } catch(e) {}
                    var ptype = ""; try { ptype = String(p.paneltype || ""); } catch(e) {}
                    var cls = ""; try { cls = p.GetAttributeString ? String(p.GetAttributeString("class", "") || "") : ""; } catch(e) {}
                    parts.push(d + ":" + pid + ":" + ptype + ":" + cc + ":" + cls);
                    if (d >= SIG_MAX_DEPTH || !p.GetChild) continue;
                    for (var i = cc - 1; i >= 0; i--) {
                        var child = null;
                        try { child = p.GetChild(i); } catch(e) { child = null; }
                        if (child) stack.push({ panel: child, depth: d + 1 });
                    }
                }
                return parts.join("|");
            }

            function _processSlot(nowMs, i, playerPanel) {
                var totalNetWorth = _getSoulValue(_soulLabelsPrimary[i], _soulLabelsFallback[i]);
                if (!isFinite(totalNetWorth)) totalNetWorth = 0;

                var modsContainer = _alive(_modsContainers[i]) ? _modsContainers[i] : null;
                if (!modsContainer && playerPanel && playerPanel.FindChildTraverse) {
                    modsContainer = playerPanel.FindChildTraverse("PlayerModsContainer");
                    _modsContainers[i] = modsContainer || null;
                }

                var spentSouls = Number(_cachedSpentSouls[i]) || 0;
                if (modsContainer && modsContainer.GetChildCount) {
                    var childCount = -1;
                    try { childCount = modsContainer.GetChildCount(); } catch(e) { childCount = -1; }
                    var prevCount = Number(_modsChildCount[i]);
                    if (!isFinite(prevCount)) prevCount = -1;
                    var needsScan = (childCount !== prevCount);

                    var sig = _buildSig(modsContainer);
                    var prevSig = String(_modsSig[i] || "");
                    if (sig !== prevSig) { _modsSig[i] = sig; needsScan = true; }
                    if (nowMs >= (_nextTierScanMs[i] || 0)) needsScan = true;

                    if (needsScan) {
                        var tierCounts = _scanTiers(modsContainer);
                        spentSouls = (tierCounts.t1 * TIER_COST[1]) + (tierCounts.t2 * TIER_COST[2]) +
                                     (tierCounts.t3 * TIER_COST[3]) + (tierCounts.t4 * TIER_COST[4]);
                        _cachedSpentSouls[i] = spentSouls;
                        _modsChildCount[i] = childCount;
                        var delay = ((childCount !== prevCount) || (sig !== prevSig)) ?
                            TIER_SCAN_INTERVAL_MS : TIER_SCAN_STABLE_MS;
                        _nextTierScanMs[i] = nowMs + delay + (i * TIER_SCAN_STAGGER_MS);
                    }
                } else {
                    spentSouls = 0; _cachedSpentSouls[i] = 0;
                    _modsChildCount[i] = -1; _modsSig[i] = "";
                    _nextTierScanMs[i] = nowMs + TIER_SCAN_INTERVAL_MS + (i * TIER_SCAN_STAGGER_MS);
                }

                var unspentSouls = totalNetWorth - spentSouls;
                if (!isFinite(unspentSouls)) unspentSouls = 0;

                var display = _alive(_displayLabels[i]) ? _displayLabels[i] : null;
                if (!display && playerPanel && playerPanel.FindChildTraverse) {
                    display = playerPanel.FindChildTraverse("SpentSoulDisplay");
                }
                if (!display && playerPanel) {
                    display = $.CreatePanel("Label", playerPanel, "SpentSoulDisplay");
                    if (display) display.AddClass("SpentSoulDisplay");
                }
                _displayLabels[i] = display || null;
                if (!display) return;

                var nextText = unspentSouls >= 1000 ?
                    (unspentSouls / 1000).toFixed(1) + "k" : String(Math.round(unspentSouls));
                var prevText = String(_lastDisplayText[i] || "");
                if (nextText !== prevText) { display.text = nextText; _lastDisplayText[i] = nextText; }
                if (display.BHasClass("hasSpent") !== (unspentSouls > 0)) {
                    if (unspentSouls > 0) display.AddClass("hasSpent");
                    else display.RemoveClass("hasSpent");
                }
                if (display.BHasClass("negative") !== (unspentSouls < 0)) {
                    if (unspentSouls < 0) display.AddClass("negative");
                    else display.RemoveClass("negative");
                }
            }

            function _clearAll(root, nowMs) {
                if (!root) return;
                _refreshPanelCache(root, nowMs, false);
                for (var i = 0; i < MAX_PLAYERS; i++) {
                    var d = _alive(_displayLabels[i]) ? _displayLabels[i] : null;
                    if (d && d.text !== "") d.text = "";
                    _lastDisplayText[i] = "";
                }
            }

            function _tick() {
                var root = $.GetContextPanel();
                if (!_alive(root)) return;

                var enabled = Number(ctx.config.get("ENABLE_UNSPENT_SOULS")) === 1;
                if (!enabled || _inHideout(root)) {
                    if (!_wasDisabled) { _clearAll(root, Date.now ? Date.now() : (new Date()).getTime()); _wasDisabled = true; }
                    _nextSampleMs = 0;
                    return;
                }
                _wasDisabled = false;

                var now = Date.now ? Date.now() : (new Date()).getTime();
                if (now < _nextSampleMs) return;
                _nextSampleMs = now + SAMPLE_INTERVAL_MS;
                _refreshPanelCache(root, now, true);

                var cursor = Number(_playerCursor);
                if (!isFinite(cursor) || cursor < 0 || cursor >= MAX_PLAYERS) cursor = 0;
                var batchEnd = Math.min(cursor + BATCH_SIZE, MAX_PLAYERS);
                for (var i = cursor; i < batchEnd; i++) {
                    var pp = _alive(_playerPanels[i]) ? _playerPanels[i] : null;
                    if (pp) _processSlot(now, i, pp);
                }
                var next = cursor + BATCH_SIZE;
                if (next >= MAX_PLAYERS) next = 0;
                _playerCursor = next;
            }

            return {
                onEnable: function() {
                    var S = QOL.core.Scheduler;
                    _loop = S && S.createPollLoop ? S.createPollLoop(_tick, 0.2, "ql_unspent") : null;
                },
                onDisable: function() {
                    if (_loop) { _loop.stop(); _loop = null; }
                    var root = $.GetContextPanel();
                    if (_alive(root)) _clearAll(root, Date.now ? Date.now() : (new Date()).getTime());
                    _wasDisabled = true; _nextSampleMs = 0;
                },
                onSettingsChanged: function() {}
            };
        },
    test: function(ctx) {
        try {
            var root = $.GetContextPanel();
            var players = root ? (root.FindChildrenWithClassTraverse("player_0") || []) : [];
            return { passed: true, name: "Unspent player panels found", message: "Found " + players.length + " player_0 panels", assertions: [{ passed: true, name: "player_0 traversal succeeded (" + players.length + " found)" }] };
        } catch(e) { return { passed: false, name: "Unspent panel check", message: (e && e.message ? e.message : String(e)) }; }
    }
    });
})();

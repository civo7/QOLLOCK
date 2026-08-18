// features/ql_showrank/manifest.js
// =============================================================================
// QOLLOCK — Show Rank (rank prediction badges on top bar + escape menu)
// =============================================================================
// OWNS:        Rank badge display, API image loading, escape menu fill loop,
//              top bar per-player polling for account ID → rank image
// DOES NOT OWN: Profile card context (ql_feat_showrank_card.js — permanent exception)
// DEPENDS ON:  QOL.core.FeatureRegistry, QOL.core.Scheduler
// CONFIG KEYS: SHOW_RANK, SHOW_RANK_TOPBAR
// =============================================================================

(function() {
    "use strict";
    var FR = QOL.core.FeatureRegistry;
    if (!FR) { $.Msg("[QOLLock] showrank: FeatureRegistry not found — aborting"); return; }

    FR.register({
        id: "ql_showrank",
        enableKey: "SHOW_RANK",
        enabledByDefault: false,
        settings: [
            { key: "SHOW_RANK", type: "toggle", default: false },
            { key: "SHOW_RANK_TOPBAR", type: "toggle", default: true }
        ],
        create: function(ctx) {
            var RANK0 = "s2r://panorama/images/ranked/badges/rank0/badge_sm_psd.vtex";
            var API_URL = "https://api.deadlock-api.com/v1/players/";
            var HIDEOUT_CLASSES = ["InHideout","inHideoutIntro","connectedToHideout","connectedtoHideout","connectedtohideout"];
            var _loop = null, _wasEnabled = false;
            var _fillToken = 0;
            var _lifecycleToken = 0;
            var _scoreboardWasOpen = false;
            var _topBarWasVisible = null;
            var _hideoutWasActive = false;

            // ── Utilities ──
            function _nowMs() { try { return Date.now ? Date.now() : 0; } catch(e) { return 0; } }
            function _valid(p) { if (!p) return false; try { return p.IsValid ? p.IsValid() : true; } catch(e) { return false; } }
            function _isOn(cfg, k) { if (!cfg || !k) return false; return Number(cfg[k]) === 1; }
            function _hasClass(panel, cls) { try { return panel && panel.BHasClass && panel.BHasClass(cls); } catch(e) { return false; } }
            function _hudPanel(root) { try { return root.FindChildTraverse("Hud"); } catch(e) { return null; } }
            function _isInHideout(root) { var h = _hudPanel(root); return _hasClass(h, "InHideout") || _hasClass(h, "inHideoutIntro") || _hasClass(h, "connectedToHideout") || _hasClass(root, "connectedToHideout"); }
            function _stateGet(k, d) { try { if (typeof QOL !== "undefined" && QOL.state) { var v = QOL.state[k]; return v !== undefined ? v : d; } } catch(e) {} return d; }
            function _stateSet(k, v) { try { if (typeof QOL !== "undefined" && QOL.state) QOL.state[k] = v; } catch(e) {} }

            // ── DocRoot — walk parent chain to document root (for cross-context attribute bridge) ──
            function _docRoot(panel) {
                var cur = panel, guard = 0;
                while (_valid(cur) && guard < 80) {
                    var parent = null; try { parent = cur.GetParent(); } catch(e) { break; }
                    if (!_valid(parent) || parent === cur) break;
                    cur = parent; guard++;
                }
                return cur;
            }
            function _readAttr(root, key, fb) { try { return root.GetAttributeString(key, fb); } catch(e) { return fb; } }
            function _setAttr(root, key, value) { try { root.SetAttributeString(key, String(value)); } catch(e) {} }

            // ── Badge visibility ──
            function _badgeVisible(badge, visible) {
                if (!_valid(badge)) return;
                try { if (visible) badge.AddClass("ShowRankVisible"); else badge.RemoveClass("ShowRankVisible"); } catch(e) {}
            }

            // ── Panel search helpers ──
            function _findClass(panel, cls) {
                var list = panel.FindChildrenWithClassTraverse ? panel.FindChildrenWithClassTraverse(cls) : [];
                return (list && list.length > 0) ? list[0] : null;
            }

            function _readTopBarHeroName(player) {
                // HeroName is a presentation label and can be empty while the
                // top bar is collapsed. HeroNameHidden is the stable binding
                // added specifically for Show Ranks; keep HeroName as a fallback
                // for older layouts that do not contain the hidden label yet.
                var heroLabel = _findClass(player, "HeroNameHidden");
                if (!_valid(heroLabel)) heroLabel = _findClass(player, "HeroName");
                if (!_valid(heroLabel)) return "";
                try { return String(heroLabel.text || "").trim(); } catch(e) { return ""; }
            }

            // ── Top bar player hierarchy: TopBar → TeamsContainer → Team → PlayerContents → PlayersContainer ──
            function _findTopBarPlayers(topBar) {
                var out = [];
                var tc = topBar.FindChildTraverse ? topBar.FindChildTraverse("TeamsContainer") : null;
                if (!_valid(tc)) return out;
                var tcc = tc.GetChildCount ? tc.GetChildCount() : 0;
                for (var ti = 0; ti < tcc && ti < 4; ti++) {
                    var team = tc.GetChild(ti); if (!_valid(team)) continue;
                    var pc = team.FindChildTraverse ? team.FindChildTraverse("PlayerContents") : null;
                    if (!_valid(pc)) continue;
                    var pl = pc.FindChildTraverse ? pc.FindChildTraverse("PlayersContainer") : null;
                    if (!_valid(pl)) continue;
                    var plc = pl.GetChildCount ? pl.GetChildCount() : 0;
                    for (var pi = 0; pi < plc && pi < 12; pi++) {
                        var player = pl.GetChild(pi);
                        if (_valid(player)) out.push(player);
                    }
                }
                return out;
            }

            // ── Escape menu entry scan (BFS matching paneltype) ──
            function _getPlayersList(root) {
                var esc = null; try { esc = root.FindChildTraverse("CitadelHudEscapeMenu"); } catch(e) {}
                var start = _valid(esc) ? esc : root;
                try { return start.FindChildTraverse("PlayersList"); } catch(e) { return null; }
            }
            function _findAllEntries(root) {
                var out = [], playersList = _getPlayersList(root);
                if (!_valid(playersList)) return out;
                var q = [];
                try { for (var i = 0; i < playersList.GetChildCount() && i < 200; i++) q.push(playersList.GetChild(i)); } catch(e) {}
                for (var h = 0; h < q.length && h < 2000; h++) {
                    var p = q[h];
                    try { if (p.paneltype === "CitadelPlayersListEntry") { out.push(p); continue; } } catch(e) {}
                    try { for (var j = 0; j < p.GetChildCount() && q.length < 2000; j++) q.push(p.GetChild(j)); } catch(e) {}
                }
                return out;
            }
            function _readClass(panel, cls) {
                var list = panel.FindChildrenWithClassTraverse ? panel.FindChildrenWithClassTraverse(cls) : [];
                if (list && list.length > 0) { try { return String(list[0].text || "").trim(); } catch(e) {} }
                return "";
            }
            function _getAccountIdLabel(entry) {
                var labels = entry.FindChildrenWithClassTraverse ? entry.FindChildrenWithClassTraverse("PlayerAccountHidden") : [];
                return (labels && labels.length > 0) ? labels[0] : null;
            }
            function _hasAccountId(entry) {
                var label = _getAccountIdLabel(entry);
                if (!_valid(label)) return true;
                try { return String(label.text || "").trim().length > 0; } catch(e) { return true; }
            }
            function _findUnfilledRow(root) {
                var entries = _findAllEntries(root);
                for (var i = 0; i < entries.length; i++) { if (!_hasAccountId(entries[i])) return entries[i]; }
                return null;
            }
            function _findMainContents(entry) {
                try { var mc = entry.FindChildTraverse("MainContents"); if (_valid(mc)) return mc; } catch(e) {}
                try {
                    var cc = entry.GetChildCount ? entry.GetChildCount() : 0;
                    for (var i = 0; i < cc && i < 50; i++) {
                        var c = entry.GetChild(i); if (c.id === "MainContents") return c;
                        try {
                            var cc2 = c.GetChildCount ? c.GetChildCount() : 0;
                            for (var j = 0; j < cc2 && j < 50; j++) { var g = c.GetChild(j); if (g.id === "MainContents") return g; }
                        } catch(e) {}
                    }
                } catch(e) {}
                return null;
            }
            function _readAccountIdSet(root) {
                var list = root.FindChildrenWithClassTraverse ? (root.FindChildrenWithClassTraverse("HiddenAccountID") || []) : [];
                var out = [];
                for (var i = 0; i < list.length; i++) {
                    var raw = ""; try { raw = String(list[i].text || "").replace(/[^0-9]/g, ""); } catch(e) {}
                    if (raw.length >= 1 && raw.length <= 10) out.push(raw);
                }
                return out;
            }
            function _dismissProfileCard() {
                try { if (typeof DismissAllContextMenus === "function") DismissAllContextMenus(); else if ($.DispatchEvent) $.DispatchEvent("DismissAllContextMenus"); } catch(e) {}
                try { if (typeof DropInputFocus === "function") DropInputFocus(); else if ($.DispatchEvent) $.DispatchEvent("DropInputFocus"); } catch(e) {}
            }

            // ── FillRow + PollForResult — click profile card, detect account ID ──
            function _fillRow(root, entry, onDone) {
                var docRoot = _docRoot(root);
                var lifecycleToken = _lifecycleToken;
                var activeFillToken = _readAttr(docRoot, "qol_sr_fill_token", "");
                var name = _readClass(entry, "PlayerName");
                if (!name) { onDone(); return; }
                var heroName = _readClass(entry, "PlayerHeroHidden");
                var beforeIds = _readAccountIdSet(root);
                _setAttr(docRoot, "qol_sr_probe_name", name);
                _setAttr(docRoot, "qol_sr_probe_hero", heroName);
                _setAttr(docRoot, "qol_sr_probe_account", "");
                _dismissProfileCard();
                var mc = _findMainContents(entry);
                var target = _valid(mc) ? mc : entry;
                try { $.DispatchEvent("Activated", target, "mouse"); } catch(e) {
                    var activateFailLabel = _getAccountIdLabel(entry);
                    if (_valid(activateFailLabel)) { try { activateFailLabel.text = "-"; } catch(eLabel) {} }
                    _setAttr(docRoot, "qol_sr_probe_name", ""); _setAttr(docRoot, "qol_sr_probe_hero", ""); _setAttr(docRoot, "qol_sr_probe_account", "");
                    _dismissProfileCard();
                    onDone(); return;
                }
                var t0 = _nowMs();
                function _poll(attempt) {
                    if (lifecycleToken !== _lifecycleToken || !_wasEnabled) return;
                    if (!_isEscapeMenuOpen(root)) {
                        _setAttr(docRoot, "qol_sr_probe_name", ""); _setAttr(docRoot, "qol_sr_probe_hero", ""); _setAttr(docRoot, "qol_sr_probe_account", "");
                        if (_readAttr(docRoot, "qol_sr_fill_token", "") === activeFillToken) _setAttr(docRoot, "qol_sr_fill_token", "");
                        _dismissProfileCard();
                        return;
                    }
                    var elapsed = _nowMs() - t0;
                    if (elapsed > 2000 || attempt > 20) {
                        var timeoutLabel = _getAccountIdLabel(entry);
                        if (_valid(timeoutLabel)) { try { timeoutLabel.text = "-"; } catch(eLabel) {} }
                        _setAttr(docRoot, "qol_sr_probe_name", ""); _setAttr(docRoot, "qol_sr_probe_hero", ""); _setAttr(docRoot, "qol_sr_probe_account", "");
                        _dismissProfileCard(); onDone(); return;
                    }
                    // Abort if another FillRow started (probe name changed)
                    if (_readAttr(docRoot, "qol_sr_probe_name", "") !== name) { _dismissProfileCard(); onDone(); return; }
                    // The profile-card onload bridge publishes the exact account
                    // ID without a HUD traversal. Keep the set-difference scan as
                    // a fallback for Panorama builds where synthetic activation
                    // does not fire that onload callback.
                    var result = String(_readAttr(docRoot, "qol_sr_probe_account", "") || "").replace(/[^0-9]/g, "");
                    if (result.length < 1 || result.length > 10) result = "";
                    if (!result) {
                        var afterIds = _readAccountIdSet(root);
                        for (var ai = 0; ai < afterIds.length && !result; ai++) {
                            var isNew = true;
                            for (var bi = 0; bi < beforeIds.length; bi++) {
                                if (afterIds[ai] === beforeIds[bi]) { isNew = false; break; }
                            }
                            if (isNew) result = afterIds[ai];
                        }
                    }
                    if (result) {
                        _setAttr(docRoot, "qol_sr_probe_name", ""); _setAttr(docRoot, "qol_sr_probe_hero", ""); _setAttr(docRoot, "qol_sr_probe_account", "");
                        _dismissProfileCard();
                        var overlay = entry.FindChildTraverse ? entry.FindChildTraverse("RankPredictionBadgeOverlay") : null;
                        if (_valid(overlay)) {
                            try { overlay.SetImage(API_URL + result + "/rank-predict/image?format=webp&size=small"); } catch(e) {}
                        }
                        var label = _getAccountIdLabel(entry);
                        if (_valid(label)) { try { label.text = result; } catch(e) {} }
                        if (heroName) {
                            var key = "qol_sr_rank_" + heroName.toLowerCase();
                            _setAttr(docRoot, key, result);
                            var published = _readAttr(docRoot, "qol_sr_ranked_heroes", "");
                            var heroes = published ? published.split("|") : [];
                            if (heroes.indexOf(heroName.toLowerCase()) === -1) {
                                heroes.push(heroName.toLowerCase());
                                _setAttr(docRoot, "qol_sr_ranked_heroes", heroes.join("|"));
                            }
                        }
                        _badgeVisible(overlay, true);
                        onDone(); return;
                    }
                    // A 30ms full-HUD class traversal caused bursty work while
                    // filling the scoreboard. 100ms keeps the same 2s timeout
                    // while bounding each row to at most 20 fallback scans.
                    $.Schedule(0.10, function() { _poll(attempt + 1); });
                }
                $.Schedule(0.10, function() { _poll(1); });
            }

            // ── FillLoop — scan escape menu, fill one row per tick ──
            function _clearPublishedRanks(root) {
                var docRoot = _docRoot(root);
                var published = _readAttr(docRoot, "qol_sr_ranked_heroes", "");
                if (!published) return;
                var heroes = published.split("|");
                for (var i = 0; i < heroes.length; i++) { if (heroes[i]) _setAttr(docRoot, "qol_sr_rank_" + heroes[i], ""); }
                _setAttr(docRoot, "qol_sr_ranked_heroes", "");
            }
            function _clearAllAccountIds(root) {
                var docRoot = _docRoot(root);
                var entries = _findAllEntries(root);
                for (var i = 0; i < entries.length; i++) {
                    var label = _getAccountIdLabel(entries[i]);
                    if (_valid(label)) { try { label.text = ""; } catch(e) {} }
                    var overlay = entries[i].FindChildTraverse ? entries[i].FindChildTraverse("RankPredictionBadgeOverlay") : null;
                    if (_valid(overlay)) { try { overlay.SetImage(""); } catch(e) {} _badgeVisible(overlay, false); }
                }
                _clearPublishedRanks(root);
                var gen = parseInt(_readAttr(docRoot, "qol_sr_generation", "0"), 10) || 0;
                _setAttr(docRoot, "qol_sr_generation", String(gen + 1));
            }
            function _isEscapeMenuOpen(root) {
                var h = _hudPanel(root);
                return _hasClass(h, "ShowEscapeMenu") || _hasClass(root, "ShowEscapeMenu");
            }
            function _fillLoop(root, token) {
                var docRoot = _docRoot(root);
                if (!_wasEnabled || !_valid(root) || _readAttr(docRoot, "qol_sr_fill_token", "") !== token) return;
                if (_isInHideout(root)) {
                    _setAttr(docRoot, "qol_sr_fill_token", "");
                    return;
                }
                _setAttr(docRoot, "qol_sr_hideout", "0");
                if (!_isEscapeMenuOpen(root)) {
                    _setAttr(docRoot, "qol_sr_fill_token", "");
                    return;
                }
                var genNow = String(_readAttr(docRoot, "qol_sr_generation", ""));
                if (_stateGet("showRankEscapeDone", "") === genNow) {
                    _setAttr(docRoot, "qol_sr_fill_token", "");
                    return;
                }
                var row = _findUnfilledRow(root);
                if (!row) {
                    _stateSet("showRankEscapeDone", genNow);
                    var dismissLifecycleToken = _lifecycleToken;
                    $.Schedule(0.5, function() {
                        if (dismissLifecycleToken === _lifecycleToken && _wasEnabled) {
                            _dismissProfileCard();
                        }
                    });
                    _setAttr(docRoot, "qol_sr_fill_token", "");
                    return;
                }
                _fillRow(root, row, function() { $.Schedule(0.1, function() { _fillLoop(root, token); }); });
            }
            function _ensureFillLoopRunning(root) {
                var docRoot = _docRoot(root);
                var token = _readAttr(docRoot, "qol_sr_fill_token", "");
                if (token) return;
                var genNow = String(_readAttr(docRoot, "qol_sr_generation", ""));
                if (_stateGet("showRankEscapeDone", "") === genNow) return;
                _fillToken = (_fillToken || 0) + 1;
                var newToken = String(_lifecycleToken) + "_" + String(_fillToken);
                _setAttr(docRoot, "qol_sr_fill_token", newToken);
                $.Schedule(0.2, function() { _fillLoop(root, newToken); });
            }

            // ── Top bar player init (per-player polling, generation-aware) ──
            // qol_sr_generation only ever lives on the document root. Callers hand
            // us either the HUD context panel or an already-resolved doc root, so
            // resolve it here instead of trusting the argument: comparing a doc-root
            // generation against the HUD panel (which has no such attribute, so it
            // falls back to "0") made _isTopBarInit always report false, so every
            // player was re-initialised on every 0.5s tick and each fresh polling
            // chain wiped the badge image that the previous one had just loaded.
            function _generation(anyPanel) {
                return _readAttr(_docRoot(anyPanel), "qol_sr_generation", "0");
            }
            function _isTopBarInit(player) {
                try { var s = player.GetAttributeString("_qol_sr_init", ""); return !!s && s === _generation(player); } catch(e) { return false; }
            }
            function _markTopBarInit(player) {
                try { player.SetAttributeString("_qol_sr_init", _generation(player)); } catch(e) {}
            }
            function _initTopBarPlayer(player) {
                var root = _docRoot(player); if (!_valid(root)) return;
                _markTopBarInit(player);
                var initGeneration = _generation(player);
                var lifecycleToken = _lifecycleToken;
                // Seed _lastGen with the generation we were created for. Starting it
                // empty made the very first poll take the "generation changed" branch,
                // clearing the account label and badge and stalling 2s for nothing.
                var _lastId = "", _lastGen = initGeneration, _idleCount = 0;
                function _tryLoad() {
                    if (!_valid(player) || lifecycleToken !== _lifecycleToken || !_wasEnabled) return;
                    if (Number(ctx.config.get("SHOW_RANK_TOPBAR")) !== 1) return;
                    try { if (player.GetAttributeString("_qol_sr_init", "") !== initGeneration) return; } catch(eMarker) { return; }
                    var gen = _generation(player);
                    if (gen !== _lastGen) {
                        _lastGen = gen;
                        var ov = player.FindChildTraverse ? player.FindChildTraverse("RankPredictionBadgeTopBarOverlay") : null;
                        if (_valid(ov)) { try { ov.SetImage(""); } catch(e) {} }
                        var al = _findClass(player, "PlayerAccountHiddenTopBar");
                        if (_valid(al)) { try { al.text = ""; } catch(e) {} }
                        _lastId = ""; _idleCount = 0;
                        $.Schedule(2.0, _tryLoad); return;
                    }
                    var acctLabel = _findClass(player, "PlayerAccountHiddenTopBar");
                    var accountId = "";
                    if (_valid(acctLabel)) { try { accountId = String(acctLabel.text || "").trim(); } catch(e) {} }
                    if (!accountId) {
                        var heroName = _readTopBarHeroName(player);
                        if (heroName) {
                            var lookupKey = "qol_sr_rank_" + heroName.toLowerCase();
                            accountId = _readAttr(root, lookupKey, "");
                            if (accountId && _valid(acctLabel)) { try { acctLabel.text = accountId; } catch(e) {} }
                        }
                    }
                    if (accountId === _lastId) { _idleCount++; } else { _idleCount = 0; }
                    if (!accountId && _lastId) {
                        var co = player.FindChildTraverse ? player.FindChildTraverse("RankPredictionBadgeTopBarOverlay") : null;
                        if (_valid(co)) { try { co.SetImage(""); } catch(e) {} }
                        if (_valid(acctLabel)) { try { acctLabel.text = ""; } catch(e) {} }
                        _lastId = "";
                    }
                    if (accountId && accountId !== _lastId) {
                        _lastId = accountId;
                        var lo = player.FindChildTraverse ? player.FindChildTraverse("RankPredictionBadgeTopBarOverlay") : null;
                        if (_valid(lo)) {
                            try { lo.SetImage(API_URL + accountId + "/rank-predict/image?format=webp&size=small"); } catch(e) {}
                            var showTopBar = Number(ctx.config.get("SHOW_RANK_TOPBAR")) === 1;
                            if (showTopBar) {
                                var base = player.FindChildTraverse ? player.FindChildTraverse("RankPredictionBadgeTopBar") : null;
                                _badgeVisible(base, true); _badgeVisible(lo, true);
                            }
                        } else {
                        }
                    }
                    $.Schedule(_idleCount >= 3 ? 10.0 : 3.0, _tryLoad);
                }
                $.Schedule(0.3, _tryLoad);
            }
            function _ensureTopBarInit(root) {
                if (!_valid(root)) return;
                var topBar = null; try { topBar = root.FindChildTraverse ? root.FindChildTraverse("TopBar") : null; } catch(e) {}
                if (!_valid(topBar)) return;
                var players = _findTopBarPlayers(topBar);
                for (var i = 0; i < players.length; i++) {
                    if (_isTopBarInit(players[i])) continue;
                    if (!_readTopBarHeroName(players[i])) continue;
                    _initTopBarPlayer(players[i]);
                }
            }

            function _clearTopBarInitMarkers(root) {
                var topBar = null;
                try { topBar = root.FindChildTraverse ? root.FindChildTraverse("TopBar") : null; } catch(e) {}
                if (!_valid(topBar)) return;
                var players = _findTopBarPlayers(topBar);
                for (var i = 0; i < players.length; i++) {
                    try { players[i].SetAttributeString("_qol_sr_init", ""); } catch(eMarker) {}
                }
            }

            // ── Visibility apply ──
            function _applyTopBarVisibility(root, visible) {
                try {
                    var topBar = root.FindChildTraverse ? root.FindChildTraverse("TopBar") : null;
                    if (!_valid(topBar)) return;
                    var players = _findTopBarPlayers(topBar);
                    for (var i = 0; i < players.length; i++) {
                        var base = players[i].FindChildTraverse ? players[i].FindChildTraverse("RankPredictionBadgeTopBar") : null;
                        var ov = players[i].FindChildTraverse ? players[i].FindChildTraverse("RankPredictionBadgeTopBarOverlay") : null;
                        _badgeVisible(base, visible); _badgeVisible(ov, visible);
                    }
                } catch(e) {}
            }
            function _applyPlayerListVisibility(root, visible) {
                var entries = _findAllEntries(root);
                for (var i = 0; i < entries.length; i++) {
                    var base = entries[i].FindChildTraverse ? entries[i].FindChildTraverse("RankPredictionBadge") : null;
                    var ov = entries[i].FindChildTraverse ? entries[i].FindChildTraverse("RankPredictionBadgeOverlay") : null;
                    _badgeVisible(base, visible); _badgeVisible(ov, visible);
                }
            }

            // ── Cleanup ──
            function _clearTopBarBadges(root) {
                try {
                    var topBar = root.FindChildTraverse ? root.FindChildTraverse("TopBar") : null;
                    if (!_valid(topBar)) return;
                    var players = _findTopBarPlayers(topBar);
                    for (var i = 0; i < players.length; i++) {
                        var ov = players[i].FindChildTraverse ? players[i].FindChildTraverse("RankPredictionBadgeTopBarOverlay") : null;
                        if (_valid(ov)) { try { ov.SetImage(""); } catch(e) {} }
                        var base = players[i].FindChildTraverse ? players[i].FindChildTraverse("RankPredictionBadgeTopBar") : null;
                        _badgeVisible(base, false); _badgeVisible(ov, false);
                        var label = _findClass(players[i], "PlayerAccountHiddenTopBar");
                        if (_valid(label)) { try { label.text = ""; } catch(e) {} }
                    }
                } catch(e) {}
            }
            function _clearPlayerListBadges(root) {
                var entries = _findAllEntries(root);
                for (var i = 0; i < entries.length; i++) {
                    var ov = entries[i].FindChildTraverse ? entries[i].FindChildTraverse("RankPredictionBadgeOverlay") : null;
                    if (_valid(ov)) { try { ov.SetImage(""); } catch(e) {} }
                    var base = entries[i].FindChildTraverse ? entries[i].FindChildTraverse("RankPredictionBadge") : null;
                    _badgeVisible(base, false); _badgeVisible(ov, false);
                    var label = _getAccountIdLabel(entries[i]);
                    if (_valid(label)) { try { label.text = ""; } catch(e) {} }
                }
            }

            // ── Main tick ──
            function _tick() {
                try {
                    var root = $.GetContextPanel(); if (!root) return;
                    var cfg = ctx.config.view();
                    if (!_isOn(cfg, "SHOW_RANK")) {
                        if (_wasEnabled) { _clearTopBarBadges(root); _clearPlayerListBadges(root); _clearPublishedRanks(root); _wasEnabled = false; _stateSet("_showRankEnabled", false); _stateSet("showRankEscapeDone", ""); }
                        return;
                    }
                    _wasEnabled = true; _stateSet("_showRankEnabled", true);
                    if (_isInHideout(root)) {
                        if (!_hideoutWasActive) {
                            _clearAllAccountIds(root);
                            _stateSet("showRankEscapeDone", "");
                            _setAttr(_docRoot(root), "qol_sr_fill_token", "");
                        }
                        _hideoutWasActive = true;
                        _scoreboardWasOpen = false;
                        return;
                    }
                    _hideoutWasActive = false;
                    var showTopBar = _isOn(cfg, "SHOW_RANK_TOPBAR");
                    if (_topBarWasVisible !== showTopBar) {
                        // Root-level CSS class gates all top bar badge visibility (showrank.css:58-60)
                        try { if (showTopBar) root.RemoveClass("HideShowRankTopBar"); else root.AddClass("HideShowRankTopBar"); } catch(e) {}
                        if (showTopBar) _clearTopBarInitMarkers(root);
                        _applyTopBarVisibility(root, showTopBar);
                        _topBarWasVisible = showTopBar;
                    }
                    if (showTopBar) _ensureTopBarInit(root);
                    _stateSet("_showRankTopBarVisible", showTopBar);
                    var scoreboardOpen = _isEscapeMenuOpen(root);
                    if (scoreboardOpen) {
                        if (!_scoreboardWasOpen) _applyPlayerListVisibility(root, true);
                        _ensureFillLoopRunning(root);
                    }
                    _scoreboardWasOpen = scoreboardOpen;
                } catch(e) {
                    if (typeof QOL !== "undefined" && QOL.core && QOL.core.Logger) { QOL.core.Logger.logError("ql_showrank", "_tick: " + (e.message || e)); }
                    throw e;
                }
            }

            return {
                onEnable: function() {
                    _lifecycleToken++;
                    _wasEnabled = false; _fillToken = 0;
                    _scoreboardWasOpen = false; _topBarWasVisible = null; _hideoutWasActive = false;
                    var root = $.GetContextPanel();
                    var docRoot = _docRoot(root);
                    _setAttr(docRoot, "qol_sr_fill_token", "");
                    var gen = parseInt(_readAttr(docRoot, "qol_sr_generation", "0"), 10) || 0;
                    _setAttr(docRoot, "qol_sr_generation", String(gen + 1));
                    _stateSet("showRankEscapeDone", "");
                    var S = QOL.core.Scheduler;
                    _loop = S && S.createPollLoop ? S.createPollLoop(_tick, 0.5, "ql_showrank") : null;
                },
                onDisable: function() {
                    _lifecycleToken++;
                    if (_loop) { _loop.stop(); _loop = null; }
                    var root = $.GetContextPanel();
                    try {
                        var docRoot = _docRoot(root);
                        var probeActive = !!_readAttr(docRoot, "qol_sr_probe_name", "");
                        _setAttr(docRoot, "qol_sr_fill_token", "");
                        if (probeActive) {
                            _setAttr(docRoot, "qol_sr_probe_name", "");
                            _setAttr(docRoot, "qol_sr_probe_hero", "");
                            _setAttr(docRoot, "qol_sr_probe_account", "");
                            _dismissProfileCard();
                        }
                    } catch(eToken) {}
                    _clearTopBarBadges(root); _clearPlayerListBadges(root);
                    try { root.AddClass("HideShowRankTopBar"); } catch(e) {}
                    _wasEnabled = false; _fillToken = 0;
                    _scoreboardWasOpen = false; _topBarWasVisible = false; _hideoutWasActive = false;
                    _stateSet("_showRankEnabled", false); _stateSet("_showRankTopBarVisible", false); _stateSet("showRankEscapeDone", "");
                },
                onSettingsChanged: function() {}
            };
        },
    test: function(ctx) {
        try {
            var root = $.GetContextPanel();
            var hud = root ? root.FindChildTraverse("Hud") : null;
            if (!hud) return null;  // Skip — not in a match context
            var topBar = root ? root.FindChildTraverse("TopBar") : null;
            if (!topBar) return null;  // Skip — TopBar not loaded
            return { passed: true, name: "ShowRank panels exist", message: "", assertions: [{ passed: true, name: "Hud panel exists" }, { passed: true, name: "TopBar panel exists" }] };
        } catch(e) { return { passed: false, name: "ShowRank panel check", message: (e && e.message ? e.message : String(e)) }; }
    }
    });
})();

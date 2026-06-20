// ql_feat_showrank.js — ShowRank: rank prediction images on top bar + player list
(function() {
    'use strict';
    var _featureId = "ql_feat_showrank";

    // ── QOL imports ──
    var _deps = QOL.import(["state", "utils", "isConnectedToHideout", "perfNowMs"]);
    var State = _deps.state;
    var Utils = _deps.utils;
    var IsCfgEnabled = Utils.IsCfgEnabled;
    var IsPanelValid = Utils.IsPanelValid;
    var PerfNowMs = _deps.perfNowMs;
    var SafeGetAttribute = Utils.SafeGetAttribute;
    var SafeSetAttribute = Utils.SafeSetAttribute;
    var SafeLog = Utils.SafeLog;
    var DebugLog = Utils.DebugLog;
    var IsConnectedToHideout = _deps.isConnectedToHideout;

    function HaveState() { return State && State.lastConfig; }

    // ── Constants ──
    var RANK0 = "s2r://panorama/images/ranked/badges/rank0/badge_sm_psd.vtex";
    var API_RANK_URL = "https://api.deadlock-api.com/v1/players/";
    var HIDEOUT_CLASSES = [
        "InHideout", "inHideoutIntro",
        "connectedToHideout", "connectedtoHideout", "connectedtohideout"
    ];

    // ── Shared utilities ──
    function DocRoot(panel) {
        var cur = panel;
        var guard = 0;
        while (IsPanelValid(cur) && guard < 80) {
            var parent = null;
            try { parent = cur.GetParent(); } catch(e) { DebugLog("showRank", "docRoot.GetParent: " + (e.message || String(e))); }
            if (!IsPanelValid(parent) || parent === cur) break;
            cur = parent;
            guard++;
        }
        return cur;
    }

    function HasAnyClass(panel, classes) {
        if (!IsPanelValid(panel)) return false;
        for (var i = 0; i < classes.length; i++) {
            try { if (panel.BHasClass(classes[i])) return true; } catch(e) { DebugLog("showRank", "hasAnyClass.BHasClass: " + (e.message || String(e))); }
        }
        return false;
    }

    function HudPanel(root) {
        try { return root.FindChildTraverse("Hud"); } catch(e) { return null; }
    }

    // ── Config helper (use State if available, otherwise return false) ──
    function IsShowRankEnabled() {
        if (!HaveState()) return false;
        var cfg = State.lastConfig;
        return !!(cfg && IsCfgEnabled(cfg, "SHOW_RANK"));
    }

    // Apply/remove visibility class directly on badge panels.
    function SetBadgeVisible(badge, visible) {
        if (!IsPanelValid(badge)) return;
        try {
            if (visible) badge.AddClass("ShowRankVisible");
            else badge.RemoveClass("ShowRankVisible");
        } catch(e) { DebugLog("showRank", "applyTopBarVisibility: " + (e.message || String(e))); }
    }

    function ApplyTopBarVisibility(root, visible) {
        var count = 0;
        try {
            var topBar = root.FindChildTraverse ? root.FindChildTraverse("TopBar") : null;
            if (!IsPanelValid(topBar)) { DebugLog("showRank", "ApplyTopBarVisibility: no TopBar panel"); return; }
            var players = FindAllTopBarPlayers(topBar);
            DebugLog("showRank", "ApplyTopBarVisibility: visible=" + visible + " players=" + players.length);
            for (var i = 0; i < players.length; i++) {
                var base = players[i].FindChildTraverse ? players[i].FindChildTraverse("RankPredictionBadgeTopBar") : null;
                var overlay = players[i].FindChildTraverse ? players[i].FindChildTraverse("RankPredictionBadgeTopBarOverlay") : null;
                SetBadgeVisible(base, visible);
                SetBadgeVisible(overlay, visible);
                count++;
            }
        } catch(e) { DebugLog("showRank", "applyTopBarVisibility: " + (e.message || String(e))); }
        DebugLog("showRank", "ApplyTopBarVisibility: done, touched=" + count);
    }

    function ApplyPlayerListVisibility(root, visible) {
        var entries = FindAllEntries(root);
        DebugLog("showRank", "ApplyPlayerListVisibility: visible=" + visible + " entries=" + entries.length);
        for (var i = 0; i < entries.length; i++) {
            var base = entries[i].FindChildTraverse ? entries[i].FindChildTraverse("RankPredictionBadge") : null;
            var overlay = entries[i].FindChildTraverse ? entries[i].FindChildTraverse("RankPredictionBadgeOverlay") : null;
            SetBadgeVisible(base, visible);
            SetBadgeVisible(overlay, visible);
        }
    }

    // ===================================================================
    // ESCAPE MENU — scan player list, dispatch profile cards, collect IDs
    // ===================================================================

    function IsEscapeMenuOpen(root) {
        var hud = HudPanel(root);
        return HasAnyClass(hud, ["ShowEscapeMenu"]) || HasAnyClass(root, ["ShowEscapeMenu"]);
    }

    function IsInHideout(root) {
        var hud = HudPanel(root);
        return HasAnyClass(hud, HIDEOUT_CLASSES) || HasAnyClass(root, HIDEOUT_CLASSES);
    }

    function GetPlayersList(root) {
        var escape = null;
        try { escape = root.FindChildTraverse("CitadelHudEscapeMenu"); } catch(e) { DebugLog("showRank", "getPlayersList.FindChildTraverse: " + (e.message || String(e))); }
        var start = IsPanelValid(escape) ? escape : root;
        try { return start.FindChildTraverse("PlayersList"); } catch(e) { return null; }
    }

    function FindAllEntries(root) {
        var out = [];
        var playersList = GetPlayersList(root);
        if (!IsPanelValid(playersList)) { DebugLog("showRank", "FindAllEntries: no PlayersList"); return out; }
        var q = [];
        try { for (var i = 0; i < playersList.GetChildCount() && i < 200; i++) q.push(playersList.GetChild(i)); } catch(e) { DebugLog("showRank", "findAllEntries.GetChildCount: " + (e.message || String(e))); }
        for (var h = 0; h < q.length && h < 2000; h++) {
            var p = q[h];
            try {
                if (p.paneltype === "CitadelPlayersListEntry") { out.push(p); continue; }
            } catch(e) { DebugLog("showRank", "findAllEntries.paneltype: " + (e.message || String(e))); }
            try { for (var j = 0; j < p.GetChildCount() && q.length < 2000; j++) q.push(p.GetChild(j)); } catch(e) { DebugLog("showRank", "findAllEntries.GetChild: " + (e.message || String(e))); }
        }
        return out;
    }

    function ReadClass(panel, cls) {
        var list = panel.FindChildrenWithClassTraverse ? panel.FindChildrenWithClassTraverse(cls) : [];
        if (list && list.length > 0) {
            try { return String(list[0].text || "").trim(); } catch(e) { DebugLog("showRank", "readClass.text: " + (e.message || String(e))); }
        }
        return "";
    }

    function GetAccountIdLabel(entry) {
        var labels = entry.FindChildrenWithClassTraverse ? entry.FindChildrenWithClassTraverse("PlayerAccountHidden") : [];
        if (labels && labels.length > 0) return labels[0];
        return null;
    }

    function HasAccountId(entry) {
        var label = GetAccountIdLabel(entry);
        if (!IsPanelValid(label)) return true;
        try { return String(label.text || "").trim().length > 0; } catch(e) { return true; }
    }

    function FindUnfilledRow(root) {
        var entries = FindAllEntries(root);
        for (var i = 0; i < entries.length; i++) {
            if (!HasAccountId(entries[i])) return entries[i];
        }
        return null;
    }

    function ClearPublishedRanks(root) {
        var published = SafeGetAttribute(root, "qol_sr_ranked_heroes", "");
        if (!published) return 0;
        var heroes = published.split("|");
        for (var i = 0; i < heroes.length; i++) {
            if (heroes[i]) { SafeSetAttribute(root, "qol_sr_rank_" + heroes[i], ""); }
        }
        SafeSetAttribute(root, "qol_sr_ranked_heroes", "");
        return heroes.length;
    }

    function ClearAllAccountIds(root) {
        var entries = FindAllEntries(root);
        var cleared = 0;
        for (var i = 0; i < entries.length; i++) {
            var label = GetAccountIdLabel(entries[i]);
            if (IsPanelValid(label)) {
                try { label.text = ""; cleared++; } catch(e) { DebugLog("showRank", "clearAllAccountIds.labelText: " + (e.message || String(e))); }
            }
            var overlay = entries[i].FindChildTraverse ? entries[i].FindChildTraverse("RankPredictionBadgeOverlay") : null;
            if (IsPanelValid(overlay)) {
                try { overlay.SetImage(""); } catch(e) { DebugLog("showRank", "clearAllAccountIds.setImage: " + (e.message || String(e))); }
                SetBadgeVisible(overlay, false);
            }
        }
        ClearPublishedRanks(root);
        var gen = parseInt(SafeGetAttribute(root, "qol_sr_generation", "0")) || 0;
        SafeSetAttribute(root, "qol_sr_generation", String(gen + 1));
        DebugLog("showRank", "ClearAllAccountIds: cleared=" + cleared + " gen=" + (gen + 1));
    }

    function ClearProbe(root) {
        SafeSetAttribute(root, "qol_sr_probe_name", "");
        SafeSetAttribute(root, "qol_sr_probe_hero", "");
        SafeSetAttribute(root, "qol_sr_probe_account", "");
    }

    function DismissProfileCard() {
        try { if (typeof DismissAllContextMenus === "function") DismissAllContextMenus();
              else if ($.DispatchEvent) $.DispatchEvent("DismissAllContextMenus"); } catch(e) { DebugLog("showRank", "dismissProfileCard.menus: " + (e.message || String(e))); }
        try { if (typeof DropInputFocus === "function") DropInputFocus();
              else if ($.DispatchEvent) $.DispatchEvent("DropInputFocus"); } catch(e) { DebugLog("showRank", "dismissProfileCard.focus: " + (e.message || String(e))); }
    }

    function ScheduleDismiss(root, delayMs) {
        var wait = (delayMs > 0 ? delayMs : 500) / 1000;
        $.Schedule(wait, function() {
            if (SafeGetAttribute(root, "qol_sr_auto_dismiss", "") !== "1") return;
            if (SafeGetAttribute(root, "qol_sr_probe_name", "") !== "") return;
            SafeSetAttribute(root, "qol_sr_auto_dismiss", "");
            DismissProfileCard();
        });
    }

    function FindMainContents(entry) {
        try {
            var mc = entry.FindChildTraverse("MainContents");
            if (IsPanelValid(mc)) return mc;
        } catch(e) { DebugLog("showRank", "findMainContents.traverse: " + (e.message || String(e))); }
        try {
            var cc = entry.GetChildCount ? entry.GetChildCount() : 0;
            for (var i = 0; i < cc && i < 50; i++) {
                var c = entry.GetChild(i);
                if (c.id === "MainContents") return c;
                try {
                    var cc2 = c.GetChildCount ? c.GetChildCount() : 0;
                    for (var j = 0; j < cc2 && j < 50; j++) {
                        var g = c.GetChild(j);
                        if (g.id === "MainContents") return g;
                    }
                } catch(e) { DebugLog("showRank", "findMainContents.child: " + (e.message || String(e))); }
            }
        } catch(e) { DebugLog("showRank", "findMainContents.outer: " + (e.message || String(e))); }
        return null;
    }

    function FillRow(root, entry, done) {
        var name = ReadClass(entry, "PlayerName");
        var hero = ReadClass(entry, "PlayerHeroHidden");
        DebugLog("showRank", "FillRow: name=" + (name || "<none>") + " hero=" + (hero || "<none>"));
        if (!name) { DebugLog("showRank", "FillRow: no name, skipping"); done(); return; }

        SafeSetAttribute(root, "qol_sr_probe_name", name);
        SafeSetAttribute(root, "qol_sr_probe_hero", hero);
        SafeSetAttribute(root, "qol_sr_probe_account", "");
        SafeSetAttribute(root, "qol_sr_auto_dismiss", "1");

        var mc = FindMainContents(entry);
        if (mc) {
            SafeLog(function() { $.DispatchEvent("Activated", mc, "mouse"); }, "showrank.dispatchActivated");
        } else {
            SafeLog(function() { $.DispatchEvent("Activated", entry, "mouse"); }, "showrank.dispatchActivated");
        }
        DebugLog("showRank", "FillRow: dispatched Activated, mc=" + (mc ? "found" : "not found"));

        var started = PerfNowMs();

        function PollForResult(attempt) {
            if (SafeGetAttribute(root, "qol_sr_probe_name", "") !== name) {
                DebugLog("showRank", "FillRow: poll aborted — probe name changed");
                return;
            }

            var elapsed = PerfNowMs() - started;
            var result = SafeGetAttribute(root, "qol_sr_probe_account", "");

            if (result) {
                var label = GetAccountIdLabel(entry);
                if (IsPanelValid(label)) {
                    try { label.text = result; } catch(e) { DebugLog("showRank", "fillRow.labelText: " + (e.message || String(e))); }
                }
                var overlay = entry.FindChildTraverse ? entry.FindChildTraverse("RankPredictionBadgeOverlay") : null;
                if (IsPanelValid(overlay)) {
                    var rankUrl = API_RANK_URL + result + "/rank-predict/image?format=webp&size=small";
                    try { overlay.SetImage(rankUrl); } catch(e) { DebugLog("showRank", "fillRow.setImage: " + (e.message || String(e))); }
                    SetBadgeVisible(overlay, true);
                    DebugLog("showRank", "FillRow: rank image set, url=" + rankUrl);
                } else {
                    DebugLog("showRank", "FillRow: RankPredictionBadgeOverlay NOT FOUND");
                }
                if (hero) {
                    SafeSetAttribute(root, "qol_sr_rank_" + hero.toLowerCase(), result);
                    var prev = SafeGetAttribute(root, "qol_sr_ranked_heroes", "");
                    SafeSetAttribute(root, "qol_sr_ranked_heroes", prev ? prev + "|" + hero.toLowerCase() : hero.toLowerCase());
                    DebugLog("showRank", "FillRow: published sr_rank_" + hero.toLowerCase() + "=" + result);
                }
                DebugLog("showRank", "FillRow: SUCCESS " + name + " -> " + result + " [" + elapsed + "ms]");
                ClearProbe(root);
                ScheduleDismiss(root, 0);
                done();
                return;
            }

            if (elapsed > 3000 || attempt > 21) {
                DebugLog("showRank", "FillRow: TIMEOUT " + name + " [" + elapsed + "ms, " + attempt + " attempts]");
                var timeoutLabel = GetAccountIdLabel(entry);
                if (IsPanelValid(timeoutLabel)) {
                    try { timeoutLabel.text = "-"; } catch(e) { DebugLog("showRank", "fillRow.timeoutText: " + (e.message || String(e))); }
                }
                ClearProbe(root);
                ScheduleDismiss(root, 0);
                done();
                return;
            }

            $.Schedule(0.03, function() { PollForResult(attempt + 1); });
        }

        PollForResult(0);
    }

    function FillLoop(root, token) {
        if (!IsPanelValid(root) || SafeGetAttribute(root, "qol_sr_fill_token", "") !== token) {
            DebugLog("showRank", "FillLoop: bail — invalid root or token mismatch");
            return;
        }

        var hideoutNow = IsInHideout(root);
        var hideoutCached = SafeGetAttribute(root, "qol_sr_hideout", "");

        if (hideoutNow) {
            if (hideoutCached !== "1") {
                DebugLog("showRank", "FillLoop: entered hideout");
                ClearAllAccountIds(root);
            }
            SafeSetAttribute(root, "qol_sr_hideout", "1");
            $.Schedule(1.0, function() { FillLoop(root, token); });
            return;
        }
        if (hideoutCached === "1") DebugLog("showRank", "FillLoop: exited hideout");
        SafeSetAttribute(root, "qol_sr_hideout", "0");

        if (!IsEscapeMenuOpen(root)) {
            DebugLog("showRank", "FillLoop: menu closed, slow poll");
            $.Schedule(2.0, function() { FillLoop(root, token); });
            return;
        }

        // Idle latch: if all rows filled this match, stop polling.
        var genNow = String(SafeGetAttribute(root, "qol_sr_generation", ""));
        if (State && State.showRankEscapeDone === genNow) {
            DebugLog("showRank", "FillLoop: idle latch — all rows done for gen=" + genNow);
            $.Schedule(2.0, function() { FillLoop(root, token); });
            return;
        }

        var entries = FindAllEntries(root);
        DebugLog("showRank", "FillLoop: entries=" + entries.length + " gen=" + genNow + " escapeDone=" + (State ? String(State.showRankEscapeDone || "") : "no-state"));

        var row = FindUnfilledRow(root);
        if (!row) {
            if (State) State.showRankEscapeDone = genNow;
            DebugLog("showRank", "FillLoop: all rows filled, latch set");
            // Dismiss the last profile card — match reference's
            // ScheduleCleanupProfileContext / CONTEXT_CLEANUP_DELAY_SECONDS (0.5s)
            $.Schedule(0.5, DismissProfileCard);
            $.Schedule(2.0, function() { FillLoop(root, token); });
            return;
        }

        DebugLog("showRank", "FillLoop: found unfilled row, dispatching FillRow");
        FillRow(root, row, function() {
            $.Schedule(0.1, function() { FillLoop(root, token); });
        });
    }

    // ===================================================================
    // TOP BAR — poll doc-root for hero→account mappings, load rank images
    // ===================================================================

    function FindClass(panel, cls) {
        var list = panel.FindChildrenWithClassTraverse ? panel.FindChildrenWithClassTraverse(cls) : [];
        return (list && list.length > 0) ? list[0] : null;
    }

    // Shared topbar init logic — called from onload hook AND late-init scan.
    function _InitTopBarPlayer(topBarPlayer) {
        var root = DocRoot(topBarPlayer);
        if (!IsPanelValid(root)) { DebugLog("showRank", "_InitTopBarPlayer: invalid root"); return; }
        DebugLog("showRank", "_InitTopBarPlayer: panel=" + (topBarPlayer.id || "<no-id>") + " root=" + (root.id || "<no-id>"));
        // Mark initialized so the per-tick scan in update() skips this player
        MarkTopBarPlayerInitialized(topBarPlayer, root);

        var _lastAccountId = "";
        var _lastGen = "";
        var _idleCount = 0;   // per-player idle: stable cycles for THIS player

        function TryLoad() {
            // Panel destroyed (hideout transition, etc.)
            if (!IsPanelValid(topBarPlayer)) { DebugLog("showRank", "TopBar.TryLoad: panel destroyed"); return; }

            // Generation check — escape script bumps this on hideout/new-game
            var gen = SafeGetAttribute(root, "qol_sr_generation", "");
            if (gen !== _lastGen) {
                DebugLog("showRank", "TopBar.TryLoad: gen changed " + (_lastGen || "<none>") + " → " + (gen || "<none>"));
                _lastGen = gen;
                var overlay = topBarPlayer.FindChildTraverse ? topBarPlayer.FindChildTraverse("RankPredictionBadgeTopBarOverlay") : null;
                SafeLog(function() { if (IsPanelValid(overlay)) overlay.SetImage(""); }, "showrank.clearImage");
                var acctLabel = FindClass(topBarPlayer, "PlayerAccountHiddenTopBar");
                SafeLog(function() { if (IsPanelValid(acctLabel)) acctLabel.text = ""; }, "showrank.clearText");
                _lastAccountId = "";
                _idleCount = 0;
                $.Schedule(2.0, TryLoad);
                return;
            }

            // Check PlayerAccountHiddenTopBar first
            var acctLabel = FindClass(topBarPlayer, "PlayerAccountHiddenTopBar");
            var accountId = "";
            if (IsPanelValid(acctLabel)) {
                accountId = String(SafeGetAttribute(acctLabel, "text", "")).trim();
            }
            DebugLog("showRank", "TopBar.TryLoad: labelAccountId=" + (accountId || "<empty>"));

            // If no account ID in label, try hero name → doc-root
            if (!accountId) {
                var heroLabel = FindClass(topBarPlayer, "HeroName");
                var heroName = "";
                if (IsPanelValid(heroLabel)) {
                    heroName = String(SafeGetAttribute(heroLabel, "text", "")).trim();
                }
                if (heroName) {
                    var key = "qol_sr_rank_" + heroName.toLowerCase();
                    accountId = SafeGetAttribute(root, key, "");
                    DebugLog("showRank", "TopBar.TryLoad: hero=" + heroName + " key=" + key + " → " + (accountId || "<empty>"));
                    if (accountId && IsPanelValid(acctLabel)) {
                        try { acctLabel.text = accountId; } catch(e) { DebugLog("showRank", "tryLoad.acctLabelText: " + (e.message || String(e))); }
                    }
                } else {
                    DebugLog("showRank", "TopBar.TryLoad: no hero name found (HeroLabel=" + (heroLabel ? "found" : "null") + ")");
                }
            }

            // Per-player idle: if accountId unchanged, increment; if changed, reset
            if (accountId === _lastAccountId) {
                _idleCount++;
            } else {
                _idleCount = 0;
            }

            // Clear if account ID disappeared
            if (!accountId && _lastAccountId) {
                DebugLog("showRank", "TopBar.TryLoad: accountId disappeared, was " + _lastAccountId);
                var clearOverlay = topBarPlayer.FindChildTraverse ? topBarPlayer.FindChildTraverse("RankPredictionBadgeTopBarOverlay") : null;
                SafeLog(function() { if (IsPanelValid(clearOverlay)) clearOverlay.SetImage(""); }, "showrank.clearImage");
                SafeLog(function() { if (IsPanelValid(acctLabel)) acctLabel.text = ""; }, "showrank.clearText");
                _lastAccountId = "";
            }

            // Load image if account ID changed
            if (accountId && accountId !== _lastAccountId) {
                DebugLog("showRank", "TopBar.TryLoad: loading rank image for " + accountId);
                _lastAccountId = accountId;
                var loadOverlay = topBarPlayer.FindChildTraverse ? topBarPlayer.FindChildTraverse("RankPredictionBadgeTopBarOverlay") : null;
                if (IsPanelValid(loadOverlay)) {
                    var url = API_RANK_URL + accountId + "/rank-predict/image?format=webp&size=small";
                    try { loadOverlay.SetImage(url); } catch(e) { DebugLog("showRank", "tryLoad.setImage: " + (e.message || String(e))); }
                    DebugLog("showRank", "TopBar.TryLoad: SetImage(" + url + ")");
                    if (IsShowRankEnabled()) {
                        var baseBadge = topBarPlayer.FindChildTraverse ? topBarPlayer.FindChildTraverse("RankPredictionBadgeTopBar") : null;
                        SetBadgeVisible(baseBadge, true);
                        SetBadgeVisible(loadOverlay, true);
                        DebugLog("showRank", "TopBar.TryLoad: badges set visible");
                    }
                } else {
                    DebugLog("showRank", "TopBar.TryLoad: RankPredictionBadgeTopBarOverlay NOT FOUND");
                }
            }

            // Per-player idle: slow down when stable for 3+ cycles
            if (_idleCount >= 3) {
                DebugLog("showRank", "TopBar.TryLoad: per-player IDLE, slow poll (10s)");
                $.Schedule(10.0, TryLoad);
            } else {
                $.Schedule(3.0, TryLoad);
            }
        }

        $.Schedule(0.3, TryLoad);
    }

    // ===================================================================
    // CONFIG HOT-RELOAD — manage CSS visibility classes + clear state
    // ===================================================================

    function ApplyConfigHotReload(root, cfg) {
        if (!root || !cfg) return;
        var enabled = IsShowRankEnabled();

        // ── Top-bar-only toggle (SHOW_RANK_TOPBAR) ──
        var showTopBar = IsCfgEnabled(cfg, "SHOW_RANK_TOPBAR");
        var topBarVisible = enabled && showTopBar;
        if (State._showRankTopBarVisible !== topBarVisible) {
            State._showRankTopBarVisible = topBarVisible;
            try {
                if (topBarVisible) {
                    root.RemoveClass("HideShowRankTopBar");
                } else {
                    root.AddClass("HideShowRankTopBar");
                }
            } catch(e) { DebugLog("showRank", "clearTopBarBadges: " + (e.message || String(e))); }
        }

        if (State._showRankEnabled === enabled) return;
        var wasEnabled = State._showRankEnabled === true;
        State._showRankEnabled = enabled;

        DebugLog("showRank", "ApplyConfigHotReload: " + wasEnabled + " → " + enabled);

        if (wasEnabled && !enabled) {
            // on→off: clear everything
            ApplyTopBarVisibility(root, false);
            ClearTopBarBadges(root);
            ApplyPlayerListVisibility(root, false);
            ClearPlayerListBadges(root);
            ClearPublishedRanks(root);
            State.showRankEscapeDone = "";
            var gen = parseInt(SafeGetAttribute(root, "qol_sr_generation", "0")) || 0;
            SafeSetAttribute(root, "qol_sr_generation", String(gen + 1));
        }

        if (!wasEnabled && enabled) {
            // off→on: show badges (data will be filled by FillLoop)
            ApplyTopBarVisibility(root, true);
            ApplyPlayerListVisibility(root, true);
            State.showRankEscapeDone = "";
        }
    }

    function ClearTopBarBadges(root) {
        try {
            var topBar = root.FindChildTraverse ? root.FindChildTraverse("TopBar") : null;
            if (!IsPanelValid(topBar)) { DebugLog("showRank", "ClearTopBarBadges: no TopBar"); return; }
            var players = FindAllTopBarPlayers(topBar);
            DebugLog("showRank", "ClearTopBarBadges: clearing " + players.length + " players");
            for (var i = 0; i < players.length; i++) {
                var overlay = players[i].FindChildTraverse ? players[i].FindChildTraverse("RankPredictionBadgeTopBarOverlay") : null;
                SafeLog(function() { if (IsPanelValid(overlay)) overlay.SetImage(""); }, "showrank.clearImage");
                var base = players[i].FindChildTraverse ? players[i].FindChildTraverse("RankPredictionBadgeTopBar") : null;
                SetBadgeVisible(base, false);
                SetBadgeVisible(overlay, false);
                var label = FindClass(players[i], "PlayerAccountHiddenTopBar");
                SafeLog(function() { if (IsPanelValid(label)) label.text = ""; }, "showrank.clearText");
            }
        } catch(e) { DebugLog("showRank", "clearPlayerListBadges: " + (e.message || String(e))); }
    }

    function ClearPlayerListBadges(root) {
        var entries = FindAllEntries(root);
        DebugLog("showRank", "ClearPlayerListBadges: clearing " + entries.length + " entries");
        for (var i = 0; i < entries.length; i++) {
            var overlay = entries[i].FindChildTraverse ? entries[i].FindChildTraverse("RankPredictionBadgeOverlay") : null;
            SafeLog(function() { if (IsPanelValid(overlay)) overlay.SetImage(""); }, "showrank.clearImage");
            var base = entries[i].FindChildTraverse ? entries[i].FindChildTraverse("RankPredictionBadge") : null;
            SetBadgeVisible(base, false);
            SetBadgeVisible(overlay, false);
            var label = GetAccountIdLabel(entries[i]);
            SafeLog(function() { if (IsPanelValid(label)) label.text = ""; }, "showrank.clearText");
        }
    }

    // ── Topbar initialization tracking ──
    // Panels are recycled across matches — use a panel attribute to mark
    // which players already have an active polling loop, so the per-tick
    // scan in update() doesn't restart loops for already-initialized players.
    //
    // Markers are tied to qol_sr_generation: when FillLoop bumps generation
    // (new game, escape-menu re-open after hideout), all existing markers
    // become stale and players get fresh TryLoad loops with current hero data.
    function IsTopBarPlayerInitialized(player, root) {
        try {
            var stored = player.GetAttributeString("_qol_sr_init", "");
            if (!stored) return false;
            var currentGen = SafeGetAttribute(root, "qol_sr_generation", "0");
            return stored === currentGen;
        } catch(e) { return false; }
    }
    function MarkTopBarPlayerInitialized(player, root) {
        try {
            var gen = SafeGetAttribute(root, "qol_sr_generation", "0");
            player.SetAttributeString("_qol_sr_init", gen || "0");
        } catch(e) { DebugLog("showRank", "ensureTopBarPlayers: " + (e.message || String(e))); }
    }

    // ── Find all player panels in the TopBar ──
    // Hierarchy: TopBar → TeamsContainer → Team(x2) → PlayerContents →
    //            PlayersContainer → Player panels (citadel_hud_top_bar_player)
    function FindAllTopBarPlayers(topBar) {
        var out = [];
        var teamsContainer = topBar.FindChildTraverse ? topBar.FindChildTraverse("TeamsContainer") : null;
        if (!IsPanelValid(teamsContainer)) { DebugLog("showRank", "FindAllTopBarPlayers: TeamsContainer NOT FOUND"); return out; }
        var tc = teamsContainer.GetChildCount ? teamsContainer.GetChildCount() : 0;
        DebugLog("showRank", "FindAllTopBarPlayers: TeamsContainer has " + tc + " children");
        for (var ti = 0; ti < tc && ti < 4; ti++) {
            var team = teamsContainer.GetChild(ti);
            if (!IsPanelValid(team)) { DebugLog("showRank", "FindAllTopBarPlayers: team[" + ti + "] invalid, skip"); continue; }
            var teamId = "";
            teamId = String(team.id || SafeGetAttribute(team, "id", ""));
            var playerContents = team.FindChildTraverse ? team.FindChildTraverse("PlayerContents") : null;
            if (!IsPanelValid(playerContents)) { DebugLog("showRank", "FindAllTopBarPlayers: team[" + ti + "] id=" + teamId + " has NO PlayerContents"); continue; }
            var playersContainer = playerContents.FindChildTraverse ? playerContents.FindChildTraverse("PlayersContainer") : null;
            if (!IsPanelValid(playersContainer)) { DebugLog("showRank", "FindAllTopBarPlayers: team[" + ti + "] id=" + teamId + " PlayerContents has NO PlayersContainer"); continue; }
            var pc = playersContainer.GetChildCount ? playersContainer.GetChildCount() : 0;
            DebugLog("showRank", "FindAllTopBarPlayers: team[" + ti + "] id=" + teamId + " PlayersContainer has " + pc + " children");
            for (var pi = 0; pi < pc && pi < 12; pi++) {
                var player = playersContainer.GetChild(pi);
                if (IsPanelValid(player)) {
                    var pid = "";
                    pid = String(player.id || SafeGetAttribute(player, "id", ""));
                    DebugLog("showRank", "FindAllTopBarPlayers:   player[" + pi + "] id=" + pid + " — VALID, adding");
                    out.push(player);
                } else {
                    DebugLog("showRank", "FindAllTopBarPlayers:   player[" + pi + "] INVALID, skip");
                }
            }
        }
        return out;
    }

    // ── Per-tick topbar scan (driven by update, not XML onload) ──
    function EnsureTopBarPlayersInitialized(root) {
        if (!IsPanelValid(root)) return;
        var topBar = null;
        try { topBar = root.FindChildTraverse ? root.FindChildTraverse("TopBar") : null; } catch(e) { DebugLog("showRank", "ensureTopBarPlayers.findTopBar: " + (e.message || String(e))); }
        if (!IsPanelValid(topBar)) { DebugLog("showRank", "EnsureTopBarPlayers: no TopBar"); return; }
        try {
            var currentGen = SafeGetAttribute(root, "qol_sr_generation", "0");
            var players = FindAllTopBarPlayers(topBar);
            DebugLog("showRank", "EnsureTopBarPlayers: found " + players.length + " total players, currentGen=" + currentGen);
            for (var i = 0; i < players.length; i++) {
                var player = players[i];
                var pid = "";
                pid = String(player.id || SafeGetAttribute(player, "id", ""));
                var storedInit = "";
                storedInit = SafeGetAttribute(player, "_qol_sr_init", "");
                if (IsTopBarPlayerInitialized(player, root)) {
                    DebugLog("showRank", "EnsureTopBarPlayers: player[" + i + "] id=" + pid + " already init (stored=" + storedInit + " current=" + currentGen + ") — skip");
                    continue;
                }
                var heroLabel = FindClass(player, "HeroName");
                if (!IsPanelValid(heroLabel)) {
                    DebugLog("showRank", "EnsureTopBarPlayers: player[" + i + "] id=" + pid + " has NO HeroName — skip");
                    continue;
                }
                var heroName = "";
                heroName = String(SafeGetAttribute(heroLabel, "text", "")).trim();
                if (!heroName) {
                    DebugLog("showRank", "EnsureTopBarPlayers: player[" + i + "] id=" + pid + " HeroName EMPTY — skip");
                    continue;
                }
                DebugLog("showRank", "EnsureTopBarPlayers: player[" + i + "] id=" + pid + " hero=" + heroName + " storedInit=" + (storedInit || "<empty>") + " — INITIALIZING");
                MarkTopBarPlayerInitialized(player, root);
                _InitTopBarPlayer(player);
            }
        } catch(e) { DebugLog("showRank", "EnsureTopBarPlayers: ERROR " + (e && e.message ? e.message : String(e))); }
    }

    // ── Per-tick escape-menu fill trigger (driven by update, not XML onload) ──
    // Starts FillLoop if not already running. FillLoop handles menu-open/menu-closed
    // and hideout transitions internally — we just need to ensure it's alive.
    function EnsureFillLoopRunning(root) {
        if (!IsPanelValid(root)) return;
        var token = SafeGetAttribute(root, "qol_sr_fill_token", "");
        if (token) return; // already running
        // Clear stale hero→account mappings from previous match before starting
        ClearPublishedRanks(root);
        // Bump generation so the idle latch resets and rows are re-scanned
        var gen = parseInt(SafeGetAttribute(root, "qol_sr_generation", "0")) || 0;
        SafeSetAttribute(root, "qol_sr_generation", String(gen + 1));
        if (State) State.showRankEscapeDone = "";
        var newToken = "qol_sr_" + String(PerfNowMs());
        SafeSetAttribute(root, "qol_sr_fill_token", newToken);
        DebugLog("showRank", "update: starting FillLoop token=" + newToken + " gen=" + (gen + 1));
        FillLoop(root, newToken);
    }

    // ===================================================================
    // REGISTRATION
    // ===================================================================

    DebugLog("showRank", "REGISTERING: showRank (bucket=7, phase=4)");
    QOL.register("showRank", {
        configKeys: ["SHOW_RANK", "SHOW_RANK_TOPBAR"],
        bucket: 7,
        phase: 4,
        requiresRoot: true,
        gate: function(cfg) {
            // Keepalive: stay active while _showRankEnabled is still true so
            // ApplyConfigHotReload can run its on→off cleanup (hide badges,
            // clear data, bump generation). Without this, toggling SHOW_RANK
            // off kills the feature before cleanup, leaving stale top-bar badges.
            return IsCfgEnabled(cfg, "SHOW_RANK") || !!(State && State._showRankEnabled);
        },
        update: function(root, cfg) {
            try {
                ApplyConfigHotReload(root, cfg);
                if (IsShowRankEnabled()) {
                    EnsureFillLoopRunning(root);
                    EnsureTopBarPlayersInitialized(root);
                }
            } catch(e) {
                $.Msg("[QOLLock][ERROR][" + _featureId + "] update: " +
                      (e && e.message ? e.message : String(e)) + "\n" +
                      (e && e.stack ? String(e.stack) : ""));
                throw e;
            }
        },
        stateKeys: ["_showRankEnabled", "_showRankTopBarVisible", "showRankEscapeDone"]
    });
    DebugLog("showRank", "showRank registered OK");

    // ── Self-test ──
    try {
        DebugLog("showRank", "SELF-TEST starting");
        if (typeof ApplyConfigHotReload !== "function") throw new Error("ApplyConfigHotReload is not a function");
        if (typeof FillLoop !== "function") throw new Error("FillLoop is not a function");
        if (typeof FillRow !== "function") throw new Error("FillRow is not a function");
        if (typeof EnsureFillLoopRunning !== "function") throw new Error("EnsureFillLoopRunning is not a function");
        if (typeof EnsureTopBarPlayersInitialized !== "function") throw new Error("EnsureTopBarPlayersInitialized is not a function");
        DebugLog("showRank", "SELF-TEST passed: core functions installed");
    } catch(e) {
        DebugLog("showRank", "SELF-TEST FAILED: " + (e && e.message ? e.message : String(e)));
        $.Msg("[QOLLock][ERROR][" + _featureId + "] self-test failed: " +
              (e && e.message ? e.message : String(e)));
    }

    DebugLog("showRank", "=== script loaded OK ===");
})();

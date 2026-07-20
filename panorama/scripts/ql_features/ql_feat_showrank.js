// ql_feat_showrank.js — ShowRank: rank prediction images on top bar + player list
// Merged from poc_hello reference, QOLLOCK-wrapped.
(function() {
    'use strict';
    var _featureId = "ql_feat_showrank";

    // ── Debug logging toggle ──
    var _DBG = false;
    function DBG(msg) { if (_DBG) { try { $.Msg("[ShowRank] " + msg); } catch(e) {} } }
    var _srThrottleLogs = {};

    function DBGThrottle(key, value, msg) {
        if (!_DBG) return;
        var now = NowMs();
        var prior = _srThrottleLogs[key];
        if (!prior || prior.value !== value || (now - prior.at) > 5000) {
            _srThrottleLogs[key] = { value: value, at: now };
            DBG(msg);
        }
    }

    DBG("=== script loading ===");

    // ── Inline utility (no QOL deps — safe in all contexts) ──
    function IsCfgEnabled(cfg, key) {
        if (!cfg || !key) return false;
        return Number(cfg[key]) === 1;
    }

    // ── QOL imports (only available in HUD context; guarded) ──
    // Check that QOL has the required namespace entries BEFORE calling
    // QOL.import() — avoids BRIDGE missing-dep errors in Settings context.
    var _deps = null;
    var State = null;
    (function() {
        DBG("QOL check: typeof QOL=" + (typeof QOL) + " hasImport=" + (typeof QOL !== "undefined" && typeof QOL.import === "function") + " hasState=" + (typeof QOL !== "undefined" && typeof QOL.state !== "undefined"));
        if (typeof QOL === "undefined" || typeof QOL.import !== "function") return;
        // Verify at least one HUD-only dep exists before importing
        if (typeof QOL.state === "undefined") { DBG("QOL.state undefined — skipping imports (Settings context?)"); return; }
        try {
            _deps = // DEPENDS: state, utils, isConnectedToHideout, perfNowMs
QOL.import(["state", "utils", "isConnectedToHideout", "perfNowMs"]);
            if (_deps && _deps.state) State = _deps.state;
            DBG("QOL imports OK: state=" + (State ? "yes" : "no") + " utils=" + (_deps && _deps.utils ? "yes" : "no") + " hideout=" + (_deps && _deps.isConnectedToHideout ? "yes" : "no") + " perf=" + (_deps && _deps.perfNowMs ? "yes" : "no"));
        } catch(e) { _deps = null; State = null; DBG("QOL imports FAILED: " + (e && e.message ? e.message : String(e))); }
    })();

    // Safe accessors that work even without QOL (Settings context fallback)
    function HaveState() { return State && State.lastConfig; }
    function ReadStateConfig(key, fb) {
        if (!HaveState()) return fb;
        var cfg = State.lastConfig;
        return cfg && cfg[key] !== undefined ? cfg[key] : fb;
    }

    // ── Constants ──
    var RANK0 = "s2r://panorama/images/ranked/badges/rank0/badge_sm_psd.vtex";
    var API_RANK_URL = "https://api.deadlock-api.com/v1/players/";
    var HIDEOUT_CLASSES = [
        "InHideout", "inHideoutIntro",
        "connectedToHideout", "connectedtoHideout", "connectedtohideout"
    ];

    // ── Shared utilities ──
    function NowMs() {
        try { return Date.now ? Date.now() : 0; } catch(e) { return 0; }
    }

    function Valid(p) {
        if (!p) return false;
        try { return p.IsValid ? p.IsValid() : true; } catch(e) { return false; }
    }

    function DocRoot(panel) {
        var cur = panel;
        var guard = 0;
        while (Valid(cur) && guard < 80) {
            var parent = null;
            try { parent = cur.GetParent(); } catch(e) {}
            if (!Valid(parent) || parent === cur) break;
            cur = parent;
            guard++;
        }
        return cur;
    }

    function ReadAttr(root, key, fb) {
        try { return root.GetAttributeString(key, fb); } catch(e) { return fb; }
    }

    function SetAttr(root, key, value) {
        try { root.SetAttributeString(key, String(value)); } catch(e) {}
    }

    function HasAnyClass(panel, classes) {
        if (!Valid(panel)) return false;
        for (var i = 0; i < classes.length; i++) {
            try { if (panel.BHasClass(classes[i])) return true; } catch(e) {}
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
        if (!Valid(badge)) return;
        try {
            if (visible) badge.AddClass("ShowRankVisible");
            else badge.RemoveClass("ShowRankVisible");
        } catch(e) {}
    }

    function ApplyTopBarVisibility(root, visible) {
        var count = 0;
        try {
            var topBar = root.FindChildTraverse ? root.FindChildTraverse("TopBar") : null;
            if (!Valid(topBar)) { DBG("ApplyTopBarVisibility: no TopBar panel"); return; }
            var players = FindAllTopBarPlayers(topBar);
            DBG("ApplyTopBarVisibility: visible=" + visible + " players=" + players.length);
            for (var i = 0; i < players.length; i++) {
                var base = players[i].FindChildTraverse ? players[i].FindChildTraverse("RankPredictionBadgeTopBar") : null;
                var overlay = players[i].FindChildTraverse ? players[i].FindChildTraverse("RankPredictionBadgeTopBarOverlay") : null;
                SetBadgeVisible(base, visible);
                SetBadgeVisible(overlay, visible);
                count++;
            }
        } catch(e) {}
        DBG("ApplyTopBarVisibility: done, touched=" + count);
    }

    function ApplyPlayerListVisibility(root, visible) {
        var entries = FindAllEntries(root);
        DBGThrottle("ApplyPlayerListVisibility", String(visible) + "|" + entries.length, "ApplyPlayerListVisibility: visible=" + visible + " entries=" + entries.length);
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
        try { escape = root.FindChildTraverse("CitadelHudEscapeMenu"); } catch(e) {}
        var start = Valid(escape) ? escape : root;
        try { return start.FindChildTraverse("PlayersList"); } catch(e) { return null; }
    }

    function FindAllEntries(root) {
        var out = [];
        var playersList = GetPlayersList(root);
        if (!Valid(playersList)) { DBG("FindAllEntries: no PlayersList"); return out; }
        var q = [];
        try { for (var i = 0; i < playersList.GetChildCount() && i < 200; i++) q.push(playersList.GetChild(i)); } catch(e) {}
        for (var h = 0; h < q.length && h < 2000; h++) {
            var p = q[h];
            try {
                if (p.paneltype === "CitadelPlayersListEntry") { out.push(p); continue; }
            } catch(e) {}
            try { for (var j = 0; j < p.GetChildCount() && q.length < 2000; j++) q.push(p.GetChild(j)); } catch(e) {}
        }
        return out;
    }

    function ReadClass(panel, cls) {
        var list = panel.FindChildrenWithClassTraverse ? panel.FindChildrenWithClassTraverse(cls) : [];
        if (list && list.length > 0) {
            try { return String(list[0].text || "").trim(); } catch(e) {}
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
        if (!Valid(label)) return true;
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
        var published = ReadAttr(root, "qol_sr_ranked_heroes", "");
        if (!published) return 0;
        var heroes = published.split("|");
        for (var i = 0; i < heroes.length; i++) {
            if (heroes[i]) { SetAttr(root, "qol_sr_rank_" + heroes[i], ""); }
        }
        SetAttr(root, "qol_sr_ranked_heroes", "");
        return heroes.length;
    }

    function ClearAllAccountIds(root) {
        var entries = FindAllEntries(root);
        var cleared = 0;
        for (var i = 0; i < entries.length; i++) {
            var label = GetAccountIdLabel(entries[i]);
            if (Valid(label)) {
                try { label.text = ""; cleared++; } catch(e) {}
            }
            var overlay = entries[i].FindChildTraverse ? entries[i].FindChildTraverse("RankPredictionBadgeOverlay") : null;
            if (Valid(overlay)) {
                try { overlay.SetImage(""); } catch(e) {}
                SetBadgeVisible(overlay, false);
            }
        }
        ClearPublishedRanks(root);
        var gen = parseInt(ReadAttr(root, "qol_sr_generation", "0"), 10) || 0;
        SetAttr(root, "qol_sr_generation", String(gen + 1));
        DBG("ClearAllAccountIds: cleared=" + cleared + " gen=" + (gen + 1));
    }

    function ClearProbe(root) {
        SetAttr(root, "qol_sr_probe_name", "");
        SetAttr(root, "qol_sr_probe_hero", "");
        SetAttr(root, "qol_sr_probe_account", "");
    }

    function DismissProfileCard() {
        try { if (typeof DismissAllContextMenus === "function") DismissAllContextMenus();
              else if ($.DispatchEvent) $.DispatchEvent("DismissAllContextMenus"); } catch(e) {}
        try { if (typeof DropInputFocus === "function") DropInputFocus();
              else if ($.DispatchEvent) $.DispatchEvent("DropInputFocus"); } catch(e) {}
    }

    function ScheduleDismiss(root, delayMs) {
        SetAttr(root, "qol_sr_auto_dismiss", "");
        DismissProfileCard();
    }

    function ReadAccountIdSet(root) {
        var list = root.FindChildrenWithClassTraverse ? (root.FindChildrenWithClassTraverse("HiddenAccountID") || []) : [];
        var out = [];
        for (var i = 0; i < list.length; i++) {
            var raw = "";
            try { raw = String(list[i].text || "").replace(/[^0-9]/g, ""); } catch(e) {}
            if (raw.length >= 1 && raw.length <= 10) out.push(raw);
        }
        return out;
    }

    function FindMainContents(entry) {
        try {
            var mc = entry.FindChildTraverse("MainContents");
            if (Valid(mc)) return mc;
        } catch(e) {}
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
                } catch(e) {}
            }
        } catch(e) {}
        return null;
    }

    function FillRow(root, entry, done) {
        var name = ReadClass(entry, "PlayerName");
        var hero = ReadClass(entry, "PlayerHeroHidden");
        DBG("FillRow: name=" + (name || "<none>") + " hero=" + (hero || "<none>"));
        if (!name) { DBG("FillRow: no name, skipping"); done(); return; }

        DismissProfileCard();

        SetAttr(root, "qol_sr_probe_name", name);
        SetAttr(root, "qol_sr_probe_hero", hero);
        SetAttr(root, "qol_sr_probe_account", "");
        SetAttr(root, "qol_sr_auto_dismiss", "1");

        var mc = FindMainContents(entry);
        var beforeIds = ReadAccountIdSet(root);
        if (mc) {
            try { $.DispatchEvent("Activated", mc, "mouse"); } catch(e) {}
        } else {
            try { $.DispatchEvent("Activated", entry, "mouse"); } catch(e) {}
        }
        DBG("FillRow: dispatched Activated, mc=" + (mc ? "found" : "not found"));

        var started = NowMs();
        var warnedMultiProfileCards = false;

        function PollForResult(attempt) {
            if (ReadAttr(root, "qol_sr_probe_name", "") !== name) {
                DBG("FillRow: poll aborted — probe name changed");
                return;
            }

            var elapsed = NowMs() - started;
            var afterIds = ReadAccountIdSet(root);
            if (afterIds.length > 1 && !warnedMultiProfileCards) {
                warnedMultiProfileCards = true;
                $.Msg("[ShowRank] WARNING: " + afterIds.length + " ProfileCard panels open during read\n");
            }

            var beforeCopy = beforeIds.slice();
            var added = [];
            for (var ai = 0; ai < afterIds.length; ai++) {
                var idx = beforeCopy.indexOf(afterIds[ai]);
                if (idx === -1) added.push(afterIds[ai]);
                else beforeCopy.splice(idx, 1);
            }
            var uniqueAdded = [];
            for (var aj = 0; aj < added.length; aj++) {
                if (uniqueAdded.indexOf(added[aj]) === -1) uniqueAdded.push(added[aj]);
            }

            var result = "";
            var resultPath = "";
            if (uniqueAdded.length === 1) {
                result = uniqueAdded[0];
                resultPath = "direct read";
            }

            if (result) {
                var label = GetAccountIdLabel(entry);
                if (Valid(label)) {
                    try { label.text = result; } catch(e) {}
                }
                var overlay = entry.FindChildTraverse ? entry.FindChildTraverse("RankPredictionBadgeOverlay") : null;
                if (Valid(overlay)) {
                    var rankUrl = API_RANK_URL + result + "/rank-predict/image?format=webp&size=small";
                    try { overlay.SetImage(rankUrl); } catch(e) {}
                    SetBadgeVisible(overlay, true);
                    DBG("FillRow: rank image set, url=" + rankUrl);
                } else {
                    DBG("FillRow: RankPredictionBadgeOverlay NOT FOUND");
                }
                if (hero) {
                    SetAttr(root, "qol_sr_rank_" + hero.toLowerCase(), result);
                    var prev = ReadAttr(root, "qol_sr_ranked_heroes", "");
                    SetAttr(root, "qol_sr_ranked_heroes", prev ? prev + "|" + hero.toLowerCase() : hero.toLowerCase());
                    DBG("FillRow: published sr_rank_" + hero.toLowerCase() + "=" + result);
                }
                DBG("FillRow: SUCCESS " + name + " -> " + result + " via " + resultPath + " [" + elapsed + "ms]");
                ClearProbe(root);
                DismissProfileCard();
                done();
                return;
            }

            if (elapsed > 2000 || attempt > 66) {
                DBG("FillRow: TIMEOUT " + name + " [" + elapsed + "ms, " + attempt + " attempts]");
                var timeoutLabel = GetAccountIdLabel(entry);
                if (Valid(timeoutLabel)) {
                    try { timeoutLabel.text = "-"; } catch(e) {}
                }
                ClearProbe(root);
                DismissProfileCard();
                done();
                return;
            }

            $.Schedule(0.03, function() { PollForResult(attempt + 1); });
        }

        PollForResult(0);
    }

    function FillLoop(root, token) {
        if (!Valid(root) || ReadAttr(root, "qol_sr_fill_token", "") !== token) {
            DBG("FillLoop: bail — invalid root or token mismatch");
            return;
        }

        var hideoutNow = IsInHideout(root);
        var hideoutCached = ReadAttr(root, "qol_sr_hideout", "");

        if (hideoutNow) {
            if (hideoutCached !== "1") {
                DBG("FillLoop: entered hideout");
                ClearAllAccountIds(root);
            }
            SetAttr(root, "qol_sr_hideout", "1");
            $.Schedule(1.0, function() { FillLoop(root, token); });
            return;
        }
        if (hideoutCached === "1") DBG("FillLoop: exited hideout");
        SetAttr(root, "qol_sr_hideout", "0");

        if (!IsEscapeMenuOpen(root)) {
            DBG("FillLoop: menu closed, slow poll");
            $.Schedule(2.0, function() { FillLoop(root, token); });
            return;
        }

        // Idle latch: if all rows filled this match, stop polling.
        var genNow = String(ReadAttr(root, "qol_sr_generation", ""));
        if (State && State.showRankEscapeDone === genNow) {
            DBG("FillLoop: idle latch — all rows done for gen=" + genNow);
            $.Schedule(2.0, function() { FillLoop(root, token); });
            return;
        }

        var entries = FindAllEntries(root);
        DBG("FillLoop: entries=" + entries.length + " gen=" + genNow + " escapeDone=" + (State ? String(State.showRankEscapeDone || "") : "no-state"));

        var row = FindUnfilledRow(root);
        if (!row) {
            if (State) State.showRankEscapeDone = genNow;
            DBG("FillLoop: all rows filled, latch set");
            // Dismiss the last profile card — match reference's
            // ScheduleCleanupProfileContext / CONTEXT_CLEANUP_DELAY_SECONDS (0.5s)
            $.Schedule(0.5, DismissProfileCard);
            $.Schedule(2.0, function() { FillLoop(root, token); });
            return;
        }

        DBG("FillLoop: found unfilled row, dispatching FillRow");
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
        if (!Valid(root)) { DBG("_InitTopBarPlayer: invalid root"); return; }
        DBG("_InitTopBarPlayer: panel=" + (topBarPlayer.id || "<no-id>") + " root=" + (root.id || "<no-id>"));
        // Mark initialized so the per-tick scan in update() skips this player
        MarkTopBarPlayerInitialized(topBarPlayer, root);

        var _lastAccountId = "";
        var _lastGen = "";
        var _idleCount = 0;   // per-player idle: stable cycles for THIS player

        function TryLoad() {
            // Panel destroyed (hideout transition, etc.)
            if (!Valid(topBarPlayer)) { DBG("TopBar.TryLoad: panel destroyed"); return; }

            // Generation check — escape script bumps this on hideout/new-game
            var gen = ReadAttr(root, "qol_sr_generation", "");
            if (gen !== _lastGen) {
                DBG("TopBar.TryLoad: gen changed " + (_lastGen || "<none>") + " → " + (gen || "<none>"));
                _lastGen = gen;
                var overlay = topBarPlayer.FindChildTraverse ? topBarPlayer.FindChildTraverse("RankPredictionBadgeTopBarOverlay") : null;
                if (Valid(overlay)) { try { overlay.SetImage(""); } catch(e) {} }
                var acctLabel = FindClass(topBarPlayer, "PlayerAccountHiddenTopBar");
                if (Valid(acctLabel)) { try { acctLabel.text = ""; } catch(e) {} }
                _lastAccountId = "";
                _idleCount = 0;
                $.Schedule(2.0, TryLoad);
                return;
            }

            // Check PlayerAccountHiddenTopBar first
            var acctLabel = FindClass(topBarPlayer, "PlayerAccountHiddenTopBar");
            var accountId = "";
            if (Valid(acctLabel)) {
                try { accountId = String(acctLabel.text || "").trim(); } catch(e) {}
            }
            DBG("TopBar.TryLoad: labelAccountId=" + (accountId || "<empty>"));

            // If no account ID in label, try hero name → doc-root
            if (!accountId) {
                var heroLabel = FindClass(topBarPlayer, "HeroName");
                var heroName = "";
                if (Valid(heroLabel)) {
                    try { heroName = String(heroLabel.text || "").trim(); } catch(e) {}
                }
                if (heroName) {
                    var key = "qol_sr_rank_" + heroName.toLowerCase();
                    accountId = ReadAttr(root, key, "");
                    DBG("TopBar.TryLoad: hero=" + heroName + " key=" + key + " → " + (accountId || "<empty>"));
                    if (accountId && Valid(acctLabel)) {
                        try { acctLabel.text = accountId; } catch(e) {}
                    }
                } else {
                    DBG("TopBar.TryLoad: no hero name found (HeroLabel=" + (heroLabel ? "found" : "null") + ")");
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
                DBG("TopBar.TryLoad: accountId disappeared, was " + _lastAccountId);
                var clearOverlay = topBarPlayer.FindChildTraverse ? topBarPlayer.FindChildTraverse("RankPredictionBadgeTopBarOverlay") : null;
                if (Valid(clearOverlay)) { try { clearOverlay.SetImage(""); } catch(e) {} }
                if (Valid(acctLabel)) { try { acctLabel.text = ""; } catch(e) {} }
                _lastAccountId = "";
            }

            // Load image if account ID changed
            if (accountId && accountId !== _lastAccountId) {
                DBG("TopBar.TryLoad: loading rank image for " + accountId);
                _lastAccountId = accountId;
                var loadOverlay = topBarPlayer.FindChildTraverse ? topBarPlayer.FindChildTraverse("RankPredictionBadgeTopBarOverlay") : null;
                if (Valid(loadOverlay)) {
                    var url = API_RANK_URL + accountId + "/rank-predict/image?format=webp&size=small";
                    try { loadOverlay.SetImage(url); } catch(e) {}
                    DBG("TopBar.TryLoad: SetImage(" + url + ")");
                    if (IsShowRankEnabled()) {
                        var baseBadge = topBarPlayer.FindChildTraverse ? topBarPlayer.FindChildTraverse("RankPredictionBadgeTopBar") : null;
                        SetBadgeVisible(baseBadge, true);
                        SetBadgeVisible(loadOverlay, true);
                        DBG("TopBar.TryLoad: badges set visible");
                    }
                } else {
                    DBG("TopBar.TryLoad: RankPredictionBadgeTopBarOverlay NOT FOUND");
                }
            }

            // Per-player idle: slow down when stable for 3+ cycles
            if (_idleCount >= 3) {
                DBG("TopBar.TryLoad: per-player IDLE, slow poll (10s)");
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
            } catch(e) {}
        }

        if (State._showRankEnabled === enabled) return;
        var wasEnabled = State._showRankEnabled === true;
        State._showRankEnabled = enabled;

        DBG("ApplyConfigHotReload: " + wasEnabled + " → " + enabled);

        if (wasEnabled && !enabled) {
            // on→off: clear everything
            ApplyTopBarVisibility(root, false);
            ClearTopBarBadges(root);
            ApplyPlayerListVisibility(root, false);
            ClearPlayerListBadges(root);
            ClearPublishedRanks(root);
            State.showRankEscapeDone = "";
            var gen = parseInt(ReadAttr(root, "qol_sr_generation", "0"), 10) || 0;
            SetAttr(root, "qol_sr_generation", String(gen + 1));
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
            if (!Valid(topBar)) { DBG("ClearTopBarBadges: no TopBar"); return; }
            var players = FindAllTopBarPlayers(topBar);
            DBG("ClearTopBarBadges: clearing " + players.length + " players");
            for (var i = 0; i < players.length; i++) {
                var overlay = players[i].FindChildTraverse ? players[i].FindChildTraverse("RankPredictionBadgeTopBarOverlay") : null;
                if (Valid(overlay)) { try { overlay.SetImage(""); } catch(e) {} }
                var base = players[i].FindChildTraverse ? players[i].FindChildTraverse("RankPredictionBadgeTopBar") : null;
                SetBadgeVisible(base, false);
                SetBadgeVisible(overlay, false);
                var label = FindClass(players[i], "PlayerAccountHiddenTopBar");
                if (Valid(label)) { try { label.text = ""; } catch(e) {} }
            }
        } catch(e) {}
    }

    function ClearPlayerListBadges(root) {
        var entries = FindAllEntries(root);
        DBG("ClearPlayerListBadges: clearing " + entries.length + " entries");
        for (var i = 0; i < entries.length; i++) {
            var overlay = entries[i].FindChildTraverse ? entries[i].FindChildTraverse("RankPredictionBadgeOverlay") : null;
            if (Valid(overlay)) { try { overlay.SetImage(""); } catch(e) {} }
            var base = entries[i].FindChildTraverse ? entries[i].FindChildTraverse("RankPredictionBadge") : null;
            SetBadgeVisible(base, false);
            SetBadgeVisible(overlay, false);
            var label = GetAccountIdLabel(entries[i]);
            if (Valid(label)) { try { label.text = ""; } catch(e) {} }
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
            var currentGen = ReadAttr(root, "qol_sr_generation", "0");
            return stored === currentGen;
        } catch(e) { return false; }
    }
    function MarkTopBarPlayerInitialized(player, root) {
        try {
            var gen = ReadAttr(root, "qol_sr_generation", "0");
            player.SetAttributeString("_qol_sr_init", gen || "0");
        } catch(e) {}
    }

    // ── Find all player panels in the TopBar ──
    // Hierarchy: TopBar → TeamsContainer → Team(x2) → PlayerContents →
    //            PlayersContainer → Player panels (citadel_hud_top_bar_player)
    function FindAllTopBarPlayers(topBar) {
        var out = [];
        var teamsContainer = topBar.FindChildTraverse ? topBar.FindChildTraverse("TeamsContainer") : null;
        if (!Valid(teamsContainer)) { DBGThrottle("FindAllTopBarPlayers:TeamsContainer", "missing", "FindAllTopBarPlayers: TeamsContainer NOT FOUND"); return out; }
        var tc = teamsContainer.GetChildCount ? teamsContainer.GetChildCount() : 0;
        DBGThrottle("FindAllTopBarPlayers:TeamsContainerCount", String(tc), "FindAllTopBarPlayers: TeamsContainer has " + tc + " children");
        for (var ti = 0; ti < tc && ti < 4; ti++) {
            var team = teamsContainer.GetChild(ti);
            if (!Valid(team)) { DBGThrottle("FindAllTopBarPlayers:team:" + ti, "invalid", "FindAllTopBarPlayers: team[" + ti + "] invalid, skip"); continue; }
            var teamId = "";
            try { teamId = String(team.id || team.GetAttributeString("id", "")); } catch(e) {}
            var playerContents = team.FindChildTraverse ? team.FindChildTraverse("PlayerContents") : null;
            if (!Valid(playerContents)) { DBGThrottle("FindAllTopBarPlayers:PlayerContents:" + ti, teamId + "|missing", "FindAllTopBarPlayers: team[" + ti + "] id=" + teamId + " has NO PlayerContents"); continue; }
            var playersContainer = playerContents.FindChildTraverse ? playerContents.FindChildTraverse("PlayersContainer") : null;
            if (!Valid(playersContainer)) { DBGThrottle("FindAllTopBarPlayers:PlayersContainer:" + ti, teamId + "|missing", "FindAllTopBarPlayers: team[" + ti + "] id=" + teamId + " PlayerContents has NO PlayersContainer"); continue; }
            var pc = playersContainer.GetChildCount ? playersContainer.GetChildCount() : 0;
            DBGThrottle("FindAllTopBarPlayers:PlayersContainerCount:" + ti, teamId + "|" + pc, "FindAllTopBarPlayers: team[" + ti + "] id=" + teamId + " PlayersContainer has " + pc + " children");
            for (var pi = 0; pi < pc && pi < 12; pi++) {
                var player = playersContainer.GetChild(pi);
                if (Valid(player)) {
                    var pid = "";
                    try { pid = String(player.id || player.GetAttributeString("id", "")); } catch(e) {}
                    DBGThrottle("FindAllTopBarPlayers:player:" + ti + ":" + pi, pid + "|valid", "FindAllTopBarPlayers:   player[" + pi + "] id=" + pid + " — VALID, adding");
                    out.push(player);
                } else {
                    DBGThrottle("FindAllTopBarPlayers:player:" + ti + ":" + pi, "invalid", "FindAllTopBarPlayers:   player[" + pi + "] INVALID, skip");
                }
            }
        }
        return out;
    }

    // ── Per-tick topbar scan (driven by update, not XML onload) ──
    function EnsureTopBarPlayersInitialized(root) {
        if (!Valid(root)) return;
        var topBar = null;
        try { topBar = root.FindChildTraverse ? root.FindChildTraverse("TopBar") : null; } catch(e) {}
        if (!Valid(topBar)) { DBGThrottle("EnsureTopBarPlayers:noTopBar", "missing", "EnsureTopBarPlayers: no TopBar"); return; }
        try {
            var currentGen = ReadAttr(root, "qol_sr_generation", "0");
            var players = FindAllTopBarPlayers(topBar);
            DBGThrottle("EnsureTopBarPlayers:found", players.length + "|" + currentGen, "EnsureTopBarPlayers: found " + players.length + " total players, currentGen=" + currentGen);
            for (var i = 0; i < players.length; i++) {
                var player = players[i];
                var pid = "";
                try { pid = String(player.id || player.GetAttributeString("id", "")); } catch(e) {}
                var storedInit = "";
                try { storedInit = player.GetAttributeString("_qol_sr_init", ""); } catch(e) {}
                if (IsTopBarPlayerInitialized(player, root)) {
                    DBGThrottle("EnsureTopBarPlayers:player:" + i + ":" + pid + ":already", storedInit + "|" + currentGen, "EnsureTopBarPlayers: player[" + i + "] id=" + pid + " already init (stored=" + storedInit + " current=" + currentGen + ") — skip");
                    continue;
                }
                var heroLabel = FindClass(player, "HeroName");
                if (!Valid(heroLabel)) {
                    DBGThrottle("EnsureTopBarPlayers:player:" + i + ":" + pid + ":noHero", "missing", "EnsureTopBarPlayers: player[" + i + "] id=" + pid + " has NO HeroName — skip");
                    continue;
                }
                var heroName = "";
                try { heroName = String(heroLabel.text || "").trim(); } catch(e) {}
                if (!heroName) {
                    DBGThrottle("EnsureTopBarPlayers:player:" + i + ":" + pid + ":emptyHero", "empty", "EnsureTopBarPlayers: player[" + i + "] id=" + pid + " HeroName EMPTY — skip");
                    continue;
                }
                DBGThrottle("EnsureTopBarPlayers:player:" + i + ":" + pid + ":init", heroName + "|" + (storedInit || "<empty>"), "EnsureTopBarPlayers: player[" + i + "] id=" + pid + " hero=" + heroName + " storedInit=" + (storedInit || "<empty>") + " — INITIALIZING");
                MarkTopBarPlayerInitialized(player, root);
                _InitTopBarPlayer(player);
            }
        } catch(e) { DBG("EnsureTopBarPlayers: ERROR " + (e && e.message ? e.message : String(e))); }
    }

    // ── Per-tick escape-menu fill trigger (driven by update, not XML onload) ──
    // Starts FillLoop if not already running. FillLoop handles menu-open/menu-closed
    // and hideout transitions internally — we just need to ensure it's alive.
    function EnsureFillLoopRunning(root) {
        if (!Valid(root)) return;
        var token = ReadAttr(root, "qol_sr_fill_token", "");
        if (token) return; // already running
        // Clear stale hero→account mappings from previous match before starting
        ClearPublishedRanks(root);
        // Bump generation so the idle latch resets and rows are re-scanned
        var gen = parseInt(ReadAttr(root, "qol_sr_generation", "0"), 10) || 0;
        SetAttr(root, "qol_sr_generation", String(gen + 1));
        if (State) State.showRankEscapeDone = "";
        var newToken = "qol_sr_" + String(NowMs());
        SetAttr(root, "qol_sr_fill_token", newToken);
        DBG("update: starting FillLoop token=" + newToken + " gen=" + (gen + 1));
        FillLoop(root, newToken);
    }

    // ===================================================================
    // REGISTRATION (HUD context only — guarded by State availability)
    // ===================================================================

    if (State) {
    DBG("REGISTERING: showRank (bucket=7, phase=4)");
    QOL.register("showRank", {
        configKeys: ["SHOW_RANK", "SHOW_RANK_TOPBAR"],
        bucket: 7,
        phase: 4,
        requiresRoot: true,
        gate: function(cfg) {
            return IsCfgEnabled(cfg, "SHOW_RANK");
        },
        update: function(root, cfg) {
            try {
                ApplyConfigHotReload(root, cfg);
                if (IsShowRankEnabled()) {
                    EnsureFillLoopRunning(root);
                    EnsureTopBarPlayersInitialized(root);
                    ApplyPlayerListVisibility(root, true);   // re-apply every tick; AddClass is idempotent
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
    DBG("showRank registered OK");
    } else {
        DBG("SKIPPING registration: State is null (Settings context or not yet loaded)");
    } // if (State) — HUD context guard

    // ── Self-test ──
    try {
        DBG("SELF-TEST starting");
        if (typeof ApplyConfigHotReload !== "function") throw new Error("ApplyConfigHotReload is not a function");
        if (typeof FillLoop !== "function") throw new Error("FillLoop is not a function");
        if (typeof FillRow !== "function") throw new Error("FillRow is not a function");
        if (typeof EnsureFillLoopRunning !== "function") throw new Error("EnsureFillLoopRunning is not a function");
        if (typeof EnsureTopBarPlayersInitialized !== "function") throw new Error("EnsureTopBarPlayersInitialized is not a function");
        DBG("SELF-TEST passed: core functions installed");
    } catch(e) {
        DBG("SELF-TEST FAILED: " + (e && e.message ? e.message : String(e)));
        $.Msg("[QOLLock][ERROR][" + _featureId + "] self-test failed: " +
              (e && e.message ? e.message : String(e)));
    }

    DBG("=== script loaded OK ===");
})();

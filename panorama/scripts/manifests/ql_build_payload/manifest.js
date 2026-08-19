// manifests/ql_build_payload/manifest.js
// =============================================================================
// QOLLOCK — Build Category Payload Auto-Load
// =============================================================================
// OWNS:        Startup config load from Skyrunner storage build payload.
//              Hero switch, storage confirmation, build init, payload scan,
//              decode, merge/apply, hero return.
// DOES NOT OWN: Settings save pipeline (ql_feat_buildsave.js), config codec
//              (ql_core.js:1926-2075), bridge attributes (ql_bridge.js).
// DEPENDS ON:  QOL.core.FeatureRegistry, QOL.core.Scheduler,
//              QOL.* delegates (see _qol helper), bare-global codec symbols
// CONFIG KEYS: DEFAULT_HERO (dropdown), AUTO_CORRUPT_REPAIR (toggle)
// PANEL IDs:   ShopModsSelectedBuild, HeroBuildList, HeroBuildSelector
// PATTERN:     Polled state machine. Fast poll (200ms) while active,
//              slow poll (5s) when dormant after completion.
//              Uses only verified real game APIs — no fabricated names.
// =============================================================================

(function() {
    "use strict";
    var FR = QOL.core.FeatureRegistry;
    if (!FR) { $.Msg("[QOLLock] ql_build_payload: FeatureRegistry not found — aborting"); return; }

    // ── Constants ──
    var STORAGE_HERO = "hero_skyrunner";
    var FALLBACK_HERO = "hero_werewolf";
    var TOKEN_REGEX = /^\[QOL-(\d+-\d+-\d+)\]:([A-Za-z0-9\-_]+)$/i;
    var TOKEN_EXTRACT = /(\[QOL-\d+-\d+-\d+\]:[A-Za-z0-9\-_]+)/i;

    // Panel IDs (verified against Valve XML, Aug 2026)
    var PID_SELECTED_BUILD = "ShopModsSelectedBuild";
    var PID_BUILD_LIST = "HeroBuildList";
    var PID_CATEGORY_NAME = "BuildCategoryName";
    var CLASS_BUILD_ITEM = "HeroBuildListItem";
    var CLASS_CATEGORY_NAME = "CategoryName";

    // Bridge attrs (from ql_bridge.js:29-32)
    var BRIDGE_REQUEST = "QOL_BUILD_SAVE_REQUEST";
    var BRIDGE_STATE   = "QOL_BUILD_SAVE_STATE";
    var BRIDGE_MSG     = "QOL_BUILD_SAVE_MSG";
    var BRIDGE_TOKEN   = "QOL_BUILD_SAVE_TOKEN";
    var CORRUPT_ATTR   = "QOL_CORRUPT_REPAIR_PENDING";

    // Timing
    var SWITCH_SETTLE_MS    = 300;
    var CONFIRM_POLL_MS     = 200;
    var CONFIRM_TIMEOUT_MS  = 4000;
    var CONFIRM_MAX_RETRIES = 3;
    var CREATE_POLL_MS      = 200;
    var CREATE_MAX_RETRIES  = 15;
    var SCAN_POLL_MS        = 100;
    // Minimum gap between selecting one storage build and selecting the next.
    // Selecting a build is asynchronous — the engine re-renders #CategoryContainer
    // a few hundred ms later. Advancing faster than this means we never read any
    // build's categories at all.
    var SCAN_SETTLE_MS      = 400;
    // How long the storage build list must read as empty before we believe it.
    // Right after the hero switch the list has not rendered yet, and treating
    // that as "no builds exist" is what made a junk build appear on every boot.
    var LIST_CONFIRM_MS     = 1500;
    var CREATE_SETTLE_MS    = 800;
    var SCAN_TIMEOUT_MS     = 8000;
    var SAVE_WAIT_POLL_MS   = 250;
    var SAVE_WAIT_TIMEOUT_MS = 15000;
    var REPAIR_STEP_MS      = 150;
    var REPAIR_TIMEOUT_MS   = 15000;
    var OVERALL_TIMEOUT_MS  = 30000;
    var OVERALL_TIMEOUT_CAP_MS = 90000;
    var DORMANT_RATE_SEC    = 5.0;
    var ACTIVE_RATE_SEC     = 0.2;
    var SIGNATURE_HITS      = 2;

    // Identifiable title written by the save pipeline so the payload build can be
    // spotted without visiting every build. Best-effort only: build-name Labels
    // are dialog-variable backed in vanilla, so the title may not be readable at
    // all. Everything below still works when it isn't.
    var MARKER_TITLE = "QOLLOCK-Settings";

    // ── QOL delegate wrapper (Pattern 10) ──
    function _qol(name) {
        try {
            return (typeof QOL !== "undefined" && typeof QOL[name] !== "undefined") ? QOL[name] : undefined;
        } catch(e) { return undefined; }
    }
    function _callQol(name, fallback, args) {
        var fn = _qol(name);
        if (typeof fn === "function") {
            try { return fn.apply(null, args || []); } catch(e) { return fallback; }
        }
        return fallback;
    }

    // ── Panorama helpers ──
    function _alive(p) {
        return !!(p && typeof p.IsValid === "function" && p.IsValid());
    }
    function _find(root, id) {
        try { return (root && root.FindChildTraverse) ? root.FindChildTraverse(id) : null; } catch(e) { return null; }
    }
    function _findClass(root, cls) {
        try { return (root && root.FindChildrenWithClassTraverse) ? (root.FindChildrenWithClassTraverse(cls) || []) : []; } catch(e) { return []; }
    }
    function _readText(panel) {
        if (!_alive(panel)) return "";
        try {
            if (typeof panel.GetAttributeString === "function") {
                var t = panel.GetAttributeString("text", "");
                if (t) return String(t);
            }
            if (typeof panel.text !== "undefined") return String(panel.text);
        } catch(e) {}
        return "";
    }
    function _readAttr(panel, attr) {
        try { return (panel && typeof panel.GetAttributeString === "function") ? String(panel.GetAttributeString(attr, "") || "") : ""; } catch(e) { return ""; }
    }
    function _setAttr(panel, attr, val) {
        try { if (panel && typeof panel.SetAttributeString === "function") panel.SetAttributeString(attr, String(val)); } catch(e) {}
    }
    function _root() {
        try { return $.GetContextPanel(); } catch(e) { return null; }
    }
    function _now() {
        try { return Date.now ? Date.now() : (new Date()).getTime(); } catch(e) { return 0; }
    }

    // ── Context checks ──
    function _isShopOpen(root) {
        try { return _callQol("isHudClassActive", false, [root, "gShopOpen"]); } catch(e) { return false; }
    }
    function _inHideout(root) {
        try { return _callQol("isConnectedToHideout", false, [root]); } catch(e) { return false; }
    }
    function _isPopupOpen(root) {
        try { return _callQol("isBrowseBuildsPopupOpen", false, [root]); } catch(e) { return false; }
    }
    function _getAccountId(root) {
        // After Phase B cut-over, QOL.getAccountIdForBuildCategoryPayload is a
        // "" stub (real impl was in commented-out buildload). Read directly from
        // the party path + surviving State fields instead.
        try {
            var viaParty = _callQol("tryReadAccountIdFromKnownPartyPath", "", [root]);
            if (viaParty && String(viaParty).length > 0) return String(viaParty);
            var State = QOL.state;
            if (State) {
                if (State.accountPresetSessionLockId && String(State.accountPresetSessionLockId).length > 0) return String(State.accountPresetSessionLockId);
                if (State.accountPresetBootstrapAccountId && String(State.accountPresetBootstrapAccountId).length > 0) return String(State.accountPresetBootstrapAccountId);
                if (State.accountProbeFoundId && String(State.accountProbeFoundId).length > 0) return String(State.accountProbeFoundId);
            }
        } catch(e) {}
        return "";
    }

    // ── Storage helpers ──
    function _selectedBuild(root) {
        return _find(root, PID_SELECTED_BUILD);
    }
    function _countCategories(sb) {
        if (!_alive(sb)) return 0;
        var n = 0;
        try { if (sb.FindChildTraverse && sb.FindChildTraverse(PID_CATEGORY_NAME)) n++; } catch(e) {}
        try {
            var a = _findClass(sb, CLASS_CATEGORY_NAME);
            var b = _findClass(sb, "BuildCategoryName");
            if (a.length > n) n = a.length;
            if (b.length > n) n = b.length;
        } catch(e) {}
        return n;
    }
    function _storageBuildReady(root) {
        // Only consider a build "ready" if it has categories. FavoriteBuildEntry
        // containers are pre-populated by Deadlock for every hero — they don't
        // indicate a user-created storage build with a config payload.
        var sb = _selectedBuild(root);
        if (!_alive(sb)) return false;
        return _countCategories(sb) > 0;
    }
    // Multi-root search matching OLD's FindHeroBuildListPanel (ql_core.js:8694-8708):
    // searches context root, GetUIRoot, parent chain, CitadelHudHeroBuilds, and
    // cached panels — the build list may live outside the context root's subtree.
    function _buildList(root) {
        if (!root) return null;
        var seen = {};
        var roots = [root];
        // Walk parent chain
        var walk = root;
        var guard = 0;
        while (walk && typeof walk.GetParent === "function" && guard < 16) {
            try { var p = walk.GetParent(); if (p && !seen[String(p.id || "")]) { roots.push(p); seen[String(p.id || "")] = true; } } catch(e) {}
            walk = (walk.GetParent && typeof walk.GetParent === "function") ? walk.GetParent() : null;
            guard++;
        }
        // Add CitadelHudHeroBuilds if present
        try { var hb = root.FindChildTraverse ? root.FindChildTraverse("CitadelHudHeroBuilds") : null; if (hb) roots.push(hb); } catch(e) {}
        // Search each root
        for (var i = 0; i < roots.length; i++) {
            if (!roots[i]) continue;
            var panel = _find(roots[i], PID_BUILD_LIST);
            if (_alive(panel)) return panel;
        }
        return null;
    }
    function _buildListItems(root) {
        var list = _buildList(root);
        return (_alive(list) && list.FindChildrenWithClassTraverse) ? _findClass(list, CLASS_BUILD_ITEM) : [];
    }

    /**
     * Every storage build entry we could select, popup open or not.
     *
     * `_buildListItems` above only sees #HeroBuildList / .HeroBuildListItem, which
     * exist solely while the build browser popup is open — and the normal read path
     * never opens it (_openBuildBrowser is only reached from _stepRepair). That is
     * why the loader used to see nothing but whatever build the shop had already
     * selected.
     *
     * QOL.collectStorageBuildEntryPanels (ql_core.js:8682) is the enumeration the
     * old loader used: it sweeps .FavoriteBuildEntryContainer on the shop side as
     * well as .HeroBuildListItem, across several candidate roots, with a structural
     * fallback. Reuse it rather than re-deriving traversal here.
     */
    function _storageEntries(root) {
        var entries = _callQol("collectStorageBuildEntryPanels", null, [root, true]);
        if (entries && entries.length > 0) return entries;
        // Fall back to the popup list if the shared helper is unavailable.
        return _buildListItems(root);
    }

    // ── Payload text ──
    function _extractToken(text) {
        if (!text) return "";
        try {
            var fn = _qol("extractBuildCategoryPayloadToken");
            if (typeof fn === "function") return String(fn(text) || "");
        } catch(e) {}
        var m = text.match(TOKEN_EXTRACT);
        return m ? m[1] : "";
    }

    function _scanCategoryText(panel) {
        if (!_alive(panel)) return "";
        // Direct children with CategoryName class
        var cats = _findClass(panel, CLASS_CATEGORY_NAME);
        for (var i = 0; i < cats.length; i++) {
            var t = _extractToken(_readText(cats[i]));
            if (t) return t;
        }
        // BuildCategoryName panels
        cats = _findClass(panel, "BuildCategoryName");
        for (i = 0; i < cats.length; i++) {
            var t2 = _extractToken(_readText(cats[i]));
            if (t2) return t2;
        }
        // Direct traverse
        var direct = _find(panel, PID_CATEGORY_NAME);
        if (direct) {
            var t3 = _extractToken(_readText(direct));
            if (t3) return t3;
        }
        return "";
    }

    function _deepText(panel) {
        // Walk subtree text for token extraction (capped)
        if (!_alive(panel)) return "";
        var parts = [];
        var stack = [panel];
        var scanned = 0;
        while (stack.length > 0 && scanned < 80) {
            var cur = stack.pop();
            if (!cur) continue;
            scanned++;
            var t = _readText(cur);
            if (t) parts.push(t);
            var cc = 0;
            try { if (typeof cur.GetChildCount === "function") cc = cur.GetChildCount(); } catch(e) {}
            for (var i = cc - 1; i >= 0; i--) {
                try { var c = cur.GetChild(i); if (c) stack.push(c); } catch(e) {}
            }
        }
        return parts.join(" ");
    }

    /**
     * Look for the payload in whatever is currently on screen, and — when
     * `doAdvance` is set — step the selection to the next unvisited storage build.
     *
     * Advancing is rate-limited by SCAN_SETTLE_MS and each build is visited at
     * most once. The previous version selected `advances % items.length` up to
     * 4 times with no rate limit: at a 100ms poll that burned every attempt
     * inside 400ms, far faster than the engine re-renders #CategoryContainer, so
     * it read the same stale categories 4 times and could never reach index 4+.
     * (st.scanLastAdvanceMs was written but never read — the gate was dead code.)
     */
    function _scanPayloadText(root, doAdvance, st) {
        // 1. Scan selected build categories
        var sb = _selectedBuild(root);
        var token = _scanCategoryText(sb);
        if (token) return token;

        // 2. Scan build entries' own text (deep). Cheap, and it catches the case
        //    where an entry surfaces its category text directly.
        var items = _storageEntries(root);
        for (var i = 0; i < items.length; i++) {
            token = _extractToken(_deepText(items[i]));
            if (token) return token;
        }

        if (!doAdvance || !st) return "";

        // 3. Fast path: if a build advertises the marker title, go straight there
        //    instead of sweeping. Titles may be dialog-variable backed and thus
        //    unreadable, so this is opportunistic — the sweep below is the
        //    guarantee.
        if (!st.markerTried) {
            st.markerTried = true;
            for (var mi = 0; mi < items.length; mi++) {
                var itemText = _deepText(items[mi]);
                if (itemText && itemText.indexOf(MARKER_TITLE) !== -1) {
                    $.Msg("[QOLLock][ql_build_payload] scan: marker title found at entry " + mi);
                    st.markerIndex = mi;
                    if (_selectEntry(items[mi])) {
                        st.visited["m" + mi] = true;
                        st.scanLastAdvanceMs = _now();
                    }
                    return "";
                }
            }
        }

        // 4. Full sweep: visit every entry exactly once, honouring settle time.
        var now = _now();
        if (now - (st.scanLastAdvanceMs || 0) < SCAN_SETTLE_MS) return "";
        if (items.length === 0) return "";

        var cursor = st.scanCursor || 0;
        if (cursor >= items.length) return "";   // swept everything

        st.scanCursor = cursor + 1;
        st.scanLastAdvanceMs = now;
        if (_selectEntry(items[cursor])) {
            st.scanAdvances = (st.scanAdvances || 0) + 1;
        }
        return "";
    }

    /** Select a storage build entry so its categories render. */
    function _selectEntry(entry) {
        if (!_alive(entry)) return false;
        var fn = _qol("activatePanelSafe");
        if (typeof fn !== "function") return false;
        try { fn(entry); return true; } catch(e) { return false; }
    }

    /**
     * Time budget for a full sweep. Must scale with the number of builds or the
     * sweep gets guillotined partway through — the old fixed 8s was fine for the
     * 4 attempts it made and far too short for a real list.
     */
    function _scanBudgetMs(itemCount) {
        var n = Math.max(1, Number(itemCount) || 1);
        return Math.max(SCAN_TIMEOUT_MS, 2000 + n * SCAN_SETTLE_MS * 2);
    }

    // ── Token decode ──
    function _tryParse(rawText) {
        if (!rawText) return { ok: false, error: "empty" };
        var m = rawText.match(TOKEN_REGEX);
        if (!m) return { ok: false, error: "no_match" };

        var schemaVer = String(m[1] || "").replace(/-/g, ".");
        var payload = String(m[2] || "");
        if (!schemaVer || !payload) return { ok: false, error: "malformed" };

        // Verify schema exists in compact registry
        var registry = {};
        try {
            if (typeof QOL_COMPACT_SCHEMA_REGISTRY === "object") registry = QOL_COMPACT_SCHEMA_REGISTRY;
        } catch(e) {}
        if (!registry.hasOwnProperty(schemaVer)) return { ok: false, error: "unsupported_schema", schemaVersion: schemaVer };

        var binary = _callQol("buildPayloadFromBase64Url", null, [payload]);
        if (!binary) return { ok: false, error: "base64_decode_failed" };

        var parsed = _callQol("deserializeBuildPayloadCompact", null, [binary, schemaVer]);
        if (!parsed || typeof parsed !== "object") return { ok: false, error: "deserialize_failed" };

        return { ok: true, token: rawText, parsed: parsed, schemaVersion: schemaVer };
    }

    // ── Config apply ──
    function _buildAppliedConfig(rawCfg, parsed, schemaVersion) {
        // Merge order matches old loader (ql_feat_buildload.js:1493-1521):
        // raw → defaults overwrite → parsed payload → normalizers → migrations
        var base = _callQol("buildDefaultConfig", {}, []);
        if (typeof base !== "object" || !base) base = {};

        var merged = {};
        // 1. Copy raw
        if (rawCfg && typeof rawCfg === "object") {
            for (var k in rawCfg) {
                if (rawCfg.hasOwnProperty && rawCfg.hasOwnProperty(k)) merged[k] = rawCfg[k];
            }
        }
        // 2. Defaults OVERWRITE raw (unconditional, matching old loader:1498-1500)
        for (k in base) {
            if (base.hasOwnProperty && base.hasOwnProperty(k)) merged[k] = base[k];
        }
        // 3. Parsed payload overrides both
        if (parsed && typeof parsed === "object") {
            for (k in parsed) {
                if (parsed.hasOwnProperty && parsed.hasOwnProperty(k)) merged[k] = parsed[k];
            }
        }
        // 4. Preserve UI-only keys from raw
        if (rawCfg && typeof rawCfg === "object") {
            if (rawCfg.hasOwnProperty("DRAG_ENABLED")) merged.DRAG_ENABLED = rawCfg.DRAG_ENABLED;
            if (rawCfg.hasOwnProperty("PREVIEWS_ENABLED")) merged.PREVIEWS_ENABLED = rawCfg.PREVIEWS_ENABLED;
        }

        // 5. Run through mergeConfig normalize chain
        merged = _callQol("mergeConfig", merged, [merged]);

        // 6. Schema migrations that mergeConfig does NOT run.
        // These mutate merged in place and return undefined — do NOT
        // reassign. Keys are camelCase on the QOL namespace.
        var schemaVer = schemaVersion || "";
        try {
            var cfn = _qol("normalizeCompassSpeedSchemaMigration");
            if (typeof cfn === "function") cfn(merged, parsed, schemaVer);
        } catch(e) {}
        try {
            var lfn = _qol("normalizeLanguageSchemaMigration");
            if (typeof lfn === "function") lfn(merged, parsed, schemaVer);
        } catch(e) {}

        return merged;
    }

    function _resolveReturnHero(ctx, st) {
        // 1. Use the payload-applied DEFAULT_HERO (if this is a success path
        //    and we just applied config). st.appliedDefaultHero is set in
        //    apply_payload from the merged config — this matches the old
        //    loader's payload-derived return hero.
        if (st && st.appliedDefaultHero && st.appliedDefaultHero !== STORAGE_HERO) {
            return st.appliedDefaultHero;
        }

        // 2. Fall back to the running config's DEFAULT_HERO
        try {
            var State = (typeof QOL !== "undefined" && QOL.state) ? QOL.state : null;
            var lastCfg = State ? State.lastConfig : null;
            var dh = _callQol("getConfiguredDefaultHeroId", "", [lastCfg || {}]);
            if (dh && dh !== STORAGE_HERO) return dh;
        } catch(e) {}

        // 3. Fall back to the legacy base default
        var base = _callQol("getLoaderBaseDefaultHeroId", "", []);
        if (base && base !== STORAGE_HERO) return base;

        // 4. Manifest setting
        try {
            var mh = _callQol("normalizeHeroId", "", [String(ctx.config.get("DEFAULT_HERO") || "")]);
            if (mh && mh !== STORAGE_HERO) return mh;
        } catch(e) {}

        return FALLBACK_HERO;
    }

    // ── API calls (verified real APIs only) ──
    var _diagLastLogMs = 0;
    function _openBuildBrowser(root) {
        // DIAGNOSTIC (Aug 2026): the PopupBuildBrowser is native-wired with no
        // clean JS open hook. Try every candidate open method and log which one
        // (if any) makes the popup detectable. Throttled to 1 log/sec.
        var now = _now();
        var logThis = (now - _diagLastLogMs) >= 1000;
        var opened = false;
        var winner = "";

        // A — CitadelOpenBuildBrowser(0): int arg 0 (maybe "browse public" mode).
        try {
            if (typeof CitadelOpenBuildBrowser === "function") { CitadelOpenBuildBrowser(0); }
        } catch(e0) {}
        if (_isPopupOpen(root)) { winner = "CitadelOpenBuildBrowser(0)"; opened = true; }

        // B — CitadelOpenBuildBrowser(1): int arg 1 (maybe "my builds" mode).
        if (!opened) {
            try {
                if (typeof CitadelOpenBuildBrowser === "function") { CitadelOpenBuildBrowser(1); }
            } catch(e1) {}
            if (_isPopupOpen(root)) { winner = "CitadelOpenBuildBrowser(1)"; opened = true; }
        }

        // C — CitadelHudHeroBuildsToggleFavoriteSelector(): shop build-header toggle.
        if (!opened) {
            try {
                if (typeof CitadelHudHeroBuildsToggleFavoriteSelector === "function") { CitadelHudHeroBuildsToggleFavoriteSelector(); }
            } catch(e2) {}
            if (_isPopupOpen(root)) { winner = "ToggleFavoriteSelector"; opened = true; }
        }

        // D — Direct panel show: remove Hidden class + set visible + refresh.
        if (!opened) {
            try {
                var popup = _find(root, "PopupBuildBrowser");
                if (_alive(popup)) {
                    try { if (typeof popup.RemoveClass === "function") popup.RemoveClass("Hidden"); } catch(e3a) {}
                    try { popup.visible = true; } catch(e3b) {}
                    try { if (popup.style) popup.style.visibility = "visible"; } catch(e3c) {}
                    if (typeof CitadelBuildBrowserRefresh === "function") {
                        try { CitadelBuildBrowserRefresh(true); } catch(e3d) {}
                    }
                }
            } catch(e3) {}
            if (_isPopupOpen(root)) { winner = "direct-show"; opened = true; }
        }

        // E — Original QOL delegate (BrowseBuilds button click + more).
        if (!opened) {
            try {
                var fn = _qol("tryOpenBuildBrowserPopup");
                if (typeof fn === "function") { fn(root); }
            } catch(e4) {}
            if (_isPopupOpen(root)) { winner = "delegate"; opened = true; }
        }

        if (logThis) {
            _diagLastLogMs = now;
            var popupPanel = _find(root, "PopupBuildBrowser");
            var cls = "";
            try { cls = (popupPanel && _alive(popupPanel) && typeof popupPanel.GetAttributeString === "function") ? String(popupPanel.GetAttributeString("class", "") || "") : ""; } catch(eC) {}
            $.Msg("[QOLLock][ql_build_payload][DIAG] open result: opened=" + (opened ? "1" : "0") +
                " winner=" + (winner || "-") +
                " popupFound=" + (_alive(popupPanel) ? "1" : "0") +
                " popupClass=\"" + cls + "\"");
        }
        if (opened && winner) {
            $.Msg("[QOLLock][ql_build_payload][DIAG] POPUP OPENED via " + winner);
        }
        return opened;
    }
    function _callCreateNewBuild() {
        if (typeof CitadelHudHeroBuildsCreateNewBuild === "function") {
            try { CitadelHudHeroBuildsCreateNewBuild(); return true; } catch(e) {}
        }
        try { $.DispatchEvent("CitadelHudHeroBuildsCreateNewBuild"); return true; } catch(e) {}
        return false;
    }
    function _callDeleteSelectedBuild() {
        if (typeof CitadelHudHeroBuildsDeleteSelectedBuild === "function") {
            try { CitadelHudHeroBuildsDeleteSelectedBuild(); return true; } catch(e) {}
        }
        try { $.DispatchEvent("CitadelHudHeroBuildsDeleteSelectedBuild"); return true; } catch(e) {}
        return false;
    }

    // ── Hero switch + confirm ──
    function _switchToStorageHero() {
        return _callQol("selectHeroForBuildSave", false, [STORAGE_HERO, "ql_build_payload"]);
    }
    function _returnHero(hero) {
        return _callQol("queueDelayedHeroRestore", false, [hero, "ql_build_payload_return", 0.3]);
    }
    function _confirmStorageHero(root, now, st) {
        // Signature-ability confirmation (language-agnostic, 2 hits required)
        var result = _callQol("confirmStorageHeroSignatureAbilities", { confirmed: false, detail: "no_fn" }, [root, now, SIGNATURE_HITS]);
        if (result && result.confirmed) return true;

        // Relaxed fallback: resolve signal hero, check if it's Skyrunner
        var signal = _callQol("resolveBuildSaveStorageHeroSignal", { hero: "", source: "none" }, [root]);
        if (signal && signal.hero) {
            var h = _callQol("normalizeHeroId", "", [String(signal.hero || "")]);
            if (h === STORAGE_HERO && result && result.hits >= 1) return true;
        }

        return false;
    }

    // ── Build init ──
    /**
     * Make sure there is a storage build to read from.
     *
     * Returns true once the read stage may proceed.
     *
     * The hard rule: never create a build while any storage build already exists.
     * This used to fire CreateNewBuild on the very first tick after the hero
     * switch, before the build list had rendered — so "no payload visible yet"
     * was misread as "no builds exist", and a fresh empty build was added on
     * every single boot. Each one also steals the shop's selection, pushing the
     * real payload build further out of reach. That is the accumulation players
     * were clearing by hand.
     */
    function _ensureStorageBuild(root, now, st) {
        // Early success: a QOL payload token is already visible in the
        // selected build's categories.
        var existing = _scanPayloadText(root, false, null);
        if (existing) {
            $.Msg("[QOLLock][ql_build_payload] ensure: existing payload found, returning true");
            return true;
        }

        // Navigate to Favorites tab so Skyrunner builds are visible.
        if (!st._favTabDone) {
            try { _callQol("ensureStorageHeroFavoritesHeaderVisible", undefined, [root]); } catch(e) {}
            st._favTabDone = true;
        }

        // Any entries at all? If so there is something to sweep — go read.
        //
        // `_preexistingEntries` records only entries that were there BEFORE we
        // intervened. It must not count a build we created ourselves: doing so
        // made empty storage look like "a config exists but we could not read it",
        // which would block a new user's very first save.
        //
        // Note the count is entries, not builds — the selected build also appears
        // as a FavoriteBuildEntryContainer in the header, so one build can surface
        // as two entries. Harmless for sweeping; do not treat it as a build count.
        var entries = _storageEntries(root);
        if (entries.length > 0) {
            if (!st.createAttempted) st._preexistingEntries = true;
            if (!st._loggedEntries) {
                st._loggedEntries = true;
                $.Msg("[QOLLock][ql_build_payload] ensure: " + entries.length +
                      " storage entr(ies) present, proceeding to read (no create)");
            }
            return true;
        }

        // No entries yet. That may just mean the list has not rendered, so require
        // it to read empty for LIST_CONFIRM_MS — and cross-check against the
        // shared emptiness probe — before creating anything.
        if (!st.emptySince) {
            st.emptySince = now;
            return false;
        }
        if (now - st.emptySince < LIST_CONFIRM_MS) return false;

        var reportedEmpty = _callQol("isStorageBuildListEmpty", false, [root]);
        if (!reportedEmpty) {
            // Disagreement: entries are hidden rather than absent. Read, don't create.
            $.Msg("[QOLLock][ql_build_payload] ensure: list reads non-empty, proceeding to read (no create)");
            return true;
        }

        if (!st.createAttempted) {
            $.Msg("[QOLLock][ql_build_payload] ensure: no storage builds after " +
                  LIST_CONFIRM_MS + "ms — creating one");
            _callCreateNewBuild();
            st.createAttempted = true;
            st.createStarted = now;
            return false;
        }

        // Give the created build time to appear before reading.
        if (now - (st.createStarted || now) < CREATE_SETTLE_MS) return false;
        $.Msg("[QOLLock][ql_build_payload] ensure: fresh build requested, proceeding to read");
        return true;
    }

    // ── Corrupt repair sub-flow ──
    function _startRepair(root, st) {
        st.repairActive = true;
        st.repairStage = "clear";
        st.repairStarted = _now();
        st.repairDeleted = 0;
        try { _callQol("setStartupCorruptRepairPending", undefined, [root, true]); } catch(e) {}
    }

    function _stepRepair(root, now, st) {
        if (!st.repairActive) return true; // Not in repair

        if (now - (st.repairStarted || now) > REPAIR_TIMEOUT_MS) {
            // Timeout — give up, clear flag
            st.repairActive = false;
            try { _callQol("setStartupCorruptRepairPending", undefined, [root, false]); } catch(e) {}
            return true;
        }

        if (st.repairStage === "clear") {
            // Ensure popup is open
            if (!_isPopupOpen(root)) {
                _openBuildBrowser(root);
                return false;
            }

            var items = _buildListItems(root);
            if (items.length === 0) {
                // All builds cleared — queue a default rebuild
                st.repairStage = "rebuild";
                return false;
            }

            // Safety: select the first item before deleting. The game's
            // delete function operates on the SELECTED build — if we haven't
            // selected one, the delete is a no-op.
            var firstItem = items[0];
            var itemTitle = _deepText(firstItem).substring(0, 128);
            if (_alive(firstItem)) {
                var afn = _qol("activatePanelSafe");
                if (typeof afn === "function") {
                    try { afn(firstItem); } catch(e) {}
                }
            }

            // Track title to detect same-title repeat (native confirmation
            // popup was dismissed — no actual deletion occurred).
            if (st.repairLastTitle === itemTitle) {
                st.repairSameTitleHits = (st.repairSameTitleHits || 0) + 1;
                if (st.repairSameTitleHits >= 3) {
                    // Same build title 3x in a row — confirmation popup not
                    // clearing. Skip this build and move on.
                    st.repairSkippedTitles = (st.repairSkippedTitles || 0) + 1;
                    if (st.repairSkippedTitles >= 5) {
                        // Too many skips — repair can't clear
                        st.repairActive = false;
                        try { _callQol("setStartupCorruptRepairPending", undefined, [root, false]); } catch(e) {}
                        return true;
                    }
                    st.repairStage = "rebuild"; // Give up clearing, try rebuild
                    return false;
                }
            } else {
                st.repairLastTitle = itemTitle;
                st.repairSameTitleHits = 0;
            }

            // Delete selected build
            if (!_callDeleteSelectedBuild()) return false;
            st.repairDeleted++;
            st.repairNextMs = now + REPAIR_STEP_MS;
            return false;
        }

        if (st.repairStage === "rebuild") {
            // Create fresh build and queue default payload
            if (!_isPopupOpen(root)) {
                _openBuildBrowser(root);
                return false;
            }

            var rebuildItems = _buildListItems(root);
            if (rebuildItems.length === 0) {
                _callCreateNewBuild();
                return false;
            }

            var token = _callQol("buildDefaultPayloadToken", "", [{}]);
            if (token) {
                _callQol("queueBuildSaveRequestFromLoader", false, [root, token, now]);
                st.repairStage = "verify_rebuild";
                st.repairSaveStarted = now;
            }
            return false;
        }

        if (st.repairStage === "verify_rebuild") {
            var state = _readAttr(_root(), BRIDGE_STATE);
            if (state === "success" || state === "done") {
                // Clear repair flag
                st.repairActive = false;
                try { _callQol("setStartupCorruptRepairPending", undefined, [root, false]); } catch(e) {}
                return true; // Done — main loop will re-enter read_payload
            }
            if (now - (st.repairSaveStarted || now) > SAVE_WAIT_TIMEOUT_MS) {
                st.repairActive = false;
                return true;
            }
        }

        return false;
    }

    // ── State machine ──
    FR.register({
        id: "ql_build_payload",
        enabledByDefault: true,  // Phase B: manifest is the active loader
        settings: [
            { key: "DEFAULT_HERO", type: "dropdown",
              options: (typeof QOL_COMPACT_DEFAULT_HERO_OPTIONS === "object" && QOL_COMPACT_DEFAULT_HERO_OPTIONS.length > 0)
                       ? QOL_COMPACT_DEFAULT_HERO_OPTIONS : ["hero_werewolf"],
              default: "hero_werewolf" },
            { key: "AUTO_CORRUPT_REPAIR", type: "toggle", default: false }
        ],
        create: function(ctx) {
            var _loop = null;
            var _st = {};

            function _reset(accountId) {
                _st = {
                    stage: "idle",
                    nextAt: 0,
                    startedAt: _now(),
                    accountId: accountId || "",
                    confirmRetries: 0,
                    confirmStarted: 0,
                    scanAdvances: 0,
                    scanStarted: 0,
                    scanCursor: 0,
                    scanLastAdvanceMs: 0,
                    scanBudgetMs: 0,
                    visited: {},
                    markerTried: false,
                    markerIndex: -1,
                    emptySince: 0,
                    _preexistingEntries: false,
                    _loggedEntries: false,
                    payloadText: "",
                    lastApplied: "",
                    lastAccount: "",
                    doneAccount: "",
                    returnHero: "",
                    didSwitch: false,
                    createAttempted: false,
                    createStarted: 0,
                    selectAttempted: false,
                    saveQueued: false,
                    saveStarted: 0,
                    repairActive: false,
                    repairStage: "",
                    repairStarted: 0,
                    repairDeleted: 0,
                    repairNextMs: 0,
                    repairSaveStarted: 0
                };
            }
            _reset("");

            function _reschedule(rateSec) {
                if (_loop) _loop.reschedule(rateSec);
            }

            function _setStep(key, status, detail) {
                try { _callQol("setSettingsLoaderStepState", undefined, [key, status, detail || ""]); } catch(e) {}
            }

            /**
             * Record how conclusive this load was, for the save pipeline's
             * overwrite guard.
             *
             * The dangerous case is "default": no payload was found. That means
             * either storage is genuinely empty (nothing to lose — safe to save)
             * or a storage build exists whose payload we simply could not read
             * (real config may be sitting there, so a save would destroy it).
             * `_st._preexistingEntries` distinguishes the two: it is set only for
             * entries that were present before we created anything, so storage we
             * initialized ourselves is never mistaken for unread user data.
             */
            function _recordLoadState(code, detail) {
                var loadState = "failed";
                if (code === "success") {
                    loadState = "loaded";
                } else if (code === "default") {
                    loadState = _st._preexistingEntries ? "failed" : "loaded";
                }
                try {
                    var State = QOL.state;
                    if (State) {
                        State.configLoadState = loadState;
                        State.configLoadStateDetail = String(detail || code || "");
                        State.configLoadStateAtMs = _now();
                    }
                } catch(e) {}
                $.Msg("[QOLLock][ql_build_payload] configLoadState=" + loadState +
                      " (result=" + code + ", preexisting=" + (_st._preexistingEntries ? "1" : "0") + ")");
            }

            function _finish(code, detail) {
                // Restore hero on ALL terminal paths — even failure/default.
                // A switched hero leaks if we only restore in the return_hero stage.
                if (_st.didSwitch && _st.returnHero) {
                    _returnHero(_st.returnHero);
                } else if (_st.didSwitch) {
                    // No return hero resolved yet — use fallback
                    var fallback = _resolveReturnHero(ctx, _st);
                    _returnHero(fallback);
                }
                _recordLoadState(code, detail);
                _setStep("apply_config", code === "success" ? "done" : "skipped", detail || "");
                _setStep("return_hero", code === "success" ? "done" : "error", detail || "");
                _setStep("complete", "done", detail || "");
                try { _callQol("finalizeSettingsLoaderSession", undefined, [code, detail || "", _now()]); } catch(e) {}
                _st.stage = "done";
                _st.doneAccount = _st.accountId;
                // Write applied config to State for main loop pickup (success only)
                if (code === "success") {
                    try {
                        var State = QOL.state;
                        if (State && _st._appliedRaw) {
                            State.accountPresetRawOverride = _st._appliedRaw;
                        }
                    } catch(e) {}
                }
                _reschedule(DORMANT_RATE_SEC);
            }

            function _fail(reason) {
                _finish("failed", reason || "Unknown error");
            }

            function _tick() {
                try {
                    var root = _root();
                    if (!root) return;
                    var now = _now();
                    var enabled = Number(ctx.config.get("enabled")) === 1;
                    if (!enabled) return;

                    // Dormant re-arm checks
                    if (_st.stage === "done") {
                        _reschedule(DORMANT_RATE_SEC);
                        var acct = _getAccountId(root);
                        if (acct && acct !== _st.doneAccount) {
                            // If we completed without knowing the account (empty),
                            // and now a real account is available, just update
                            // the tracker — don't re-arm. Re-arm only on genuine
                            // account change (both tracks non-empty and differ).
                            if (_st.doneAccount && _st.doneAccount.length > 0) {
                                _reset(acct);
                                _st.stage = "idle";
                            } else {
                                _st.doneAccount = acct;
                                _st.accountId = acct;
                            }
                        } else {
                            // Check for corrupt repair pending
                            var rp = _readAttr(root, CORRUPT_ATTR);
                            if (rp === "1") {
                                _reset(acct || _st.doneAccount);
                                _st.stage = "idle";
                            }
                        }
                        if (_st.stage === "done") return;
                    }

                    _reschedule(ACTIVE_RATE_SEC);

                    // Overall timeout — must run BEFORE the save-pending guard so a
                    // stuck-pending save can't bypass the limit. Scales with the
                    // scan budget: a fixed 30s would cut a long sweep short and
                    // report "no payload" on exactly the crowded build lists that
                    // need the sweep most.
                    var overallBudget = OVERALL_TIMEOUT_MS;
                    if (_st.scanBudgetMs) {
                        overallBudget = Math.min(
                            OVERALL_TIMEOUT_CAP_MS,
                            Math.max(OVERALL_TIMEOUT_MS, _st.scanBudgetMs + 12000)
                        );
                    }
                    if (now - _st.startedAt > overallBudget && _st.stage !== "done") {
                        _fail("overall_timeout");
                        return;
                    }

                    // Account change mid-probe — abort and restart
                    var curAcct = _getAccountId(root);
                    if (curAcct && _st.accountId && curAcct !== _st.accountId) {
                        _fail("account_changed");
                        _reset(curAcct);
                        _st.stage = "idle";
                        _st.nextAt = now;
                        return;
                    }

                    // Per-stage timing guard
                    if (_st.nextAt > now) return;

                    // Trace stage transitions
                    if (_st._lastStage !== _st.stage) {
                        $.Msg("[QOLLock][ql_build_payload] stage: " + _st.stage);
                        _st._lastStage = _st.stage;
                    }

                    switch (_st.stage) {
                        case "idle":
                            _st.stage = "wait_hideout";
                            _st.nextAt = now;
                            break;

                        case "wait_hideout":
                            if (_inHideout(root)) {
                                try { _callQol("beginSettingsLoaderSession", undefined, [_st.accountId, now]); } catch(e) {}
                                _setStep("start", "done", "");
                                _setStep("switch_airheart", "active", "Switching to Skyrunner");
                                _st.stage = "switch_storage";
                                _st.nextAt = now;
                            } else {
                                _st.nextAt = now + 500;
                            }
                            break;

                        case "switch_storage":
                            if (_switchToStorageHero()) {
                                _st.didSwitch = true;
                                _setStep("switch_airheart", "done", "Skyrunner switch sent");
                                _st.stage = "confirm_storage";
                                _st.confirmStarted = now;
                                _st.confirmRetries = 0;
                                _st.nextAt = now + SWITCH_SETTLE_MS;
                            } else {
                                _st.nextAt = now + CONFIRM_POLL_MS;
                            }
                            break;

                        case "confirm_storage":
                            // Ensure shop is open — signature confirmation needs the
                            // shop panels visible. Try the CitadelOpenUpgradeShop JS
                            // action (verified callable, arg count 0) first, falling
                            // back to the open_item_shop client command.
                            if (!_isShopOpen(root) && !_st.shopOpenAttempted) {
                                var _openedShop = false;
                                try { if (typeof CitadelOpenUpgradeShop === "function") { CitadelOpenUpgradeShop(); _openedShop = true; } } catch(e) {}
                                if (!_openedShop) { try { _callQol("dispatchCitadelConCommand", undefined, ["open_item_shop"]); } catch(e) {} }
                                _st.shopOpenAttempted = true;
                            }
                            if (_confirmStorageHero(root, now, _st)) {
                                _setStep("confirm_airheart", "done", "Skyrunner confirmed");
                                // Write backward-compat State fields so the save
                                // pipeline (ql_feat_buildsave.js:337) and buildbridge
                                // (CanReuseLoaderConfirmedSkyrunnerContext) can skip
                                // locale-dependent text re-confirmation.
                                try {
                                    var State = QOL.state;
                                    if (State) {
                                        State.buildCategoryPayloadSkyrunnerHeaderConfirmed = true;
                                        State.buildCategoryPayloadSkyrunnerHeaderConfirmedMs = now;
                                    }
                                } catch(e) {}
                                _st.stage = "ensure_storage";
                                _st.nextAt = now;
                            } else if (now - _st.confirmStarted > CONFIRM_TIMEOUT_MS) {
                                _st.confirmRetries = (_st.confirmRetries || 0) + 1;
                                if (_st.confirmRetries > CONFIRM_MAX_RETRIES) {
                                    _fail("confirm_timeout");
                                } else {
                                    _st.stage = "switch_storage";
                                    _st.nextAt = now;
                                }
                            } else {
                                _setStep("confirm_airheart", "active", "Waiting for Skyrunner");
                                _st.nextAt = now + CONFIRM_POLL_MS;
                            }
                            break;

                        case "ensure_storage":
                            _setStep("read_payload", "active", "Initializing storage build");
                            if (_ensureStorageBuild(root, now, _st)) {
                                _st.stage = "read_payload";
                                _st.scanStarted = now;
                                _st.scanAdvances = 0;
                                _st.scanCursor = 0;
                                _st.visited = {};
                                _st.markerTried = false;
                                _st.scanLastAdvanceMs = 0;
                                // Budget the sweep against the list we actually have.
                                _st.scanBudgetMs = _scanBudgetMs(_storageEntries(root).length);
                                _st.nextAt = now;
                            } else {
                                _st.nextAt = now + CREATE_POLL_MS;
                            }
                            break;

                        case "read_payload":
                            _setStep("read_payload", "active", "Reading build payload");
                            var payload = _scanPayloadText(root, true, _st);
                            if (payload && payload !== _st.lastApplied) {
                                _st.payloadText = payload;
                                _st.stage = "apply_payload";
                                _st.nextAt = now;
                            } else if (now - _st.scanStarted > (_st.scanBudgetMs || SCAN_TIMEOUT_MS)) {
                                // Scan exhausted — apply defaults, no destructive repair unless explicitly enabled
                                $.Msg("[QOLLock][ql_build_payload] scan exhausted after " +
                                      (_st.scanAdvances || 0) + " advance(s) over " +
                                      _storageEntries(root).length + " entry(ies)");
                                if (Number(ctx.config.get("AUTO_CORRUPT_REPAIR")) === 1 && _isShopOpen(root) && _storageBuildReady(root)) {
                                    _startRepair(root, _st);
                                    _st.stage = "repair";
                                    _st.nextAt = now;
                                } else {
                                    _finish("default", "No payload found. Kept current config.");
                                }
                            } else {
                                _st.nextAt = now + SCAN_POLL_MS;
                            }
                            break;

                        case "apply_payload":
                            _setStep("decode_payload", "active", "Decoding");
                            var parsed = _tryParse(_st.payloadText);
                            if (!parsed.ok) {
                                _setStep("decode_payload", "error", parsed.error || "decode failed");
                                _fail("decode: " + (parsed.error || "unknown"));
                                return;
                            }
                            _setStep("decode_payload", "done", "Decoded");
                            _setStep("apply_config", "active", "Applying config");

                            // Build applied config. Note: deserializeBuildPayloadCompact
                            // already resolves DEFAULT_HERO from the compact DEFAULT_HERO_INDEX
                            // field — no manual index→hero conversion needed here.
                            var rawCfg = {};
                            try {
                                var State = QOL.state;
                                if (State && State.lastConfig) rawCfg = State.lastConfig;
                            } catch(e) {}
                            var applied = _buildAppliedConfig(rawCfg, parsed.parsed, parsed.schemaVersion);

                            // Wrap and write
                            var wrapped = {};
                            try {
                                if (typeof WrapConfigForStorage === "function") {
                                    wrapped = WrapConfigForStorage(applied);
                                } else {
                                    wrapped = applied;
                                }
                            } catch(e) { wrapped = applied; }

                            // Store for _resolveReturnHero — use payload-derived hero
                            // instead of stale State.lastConfig (agent 5-1 diff finding).
                            _st.appliedDefaultHero = applied.DEFAULT_HERO || "";
                            _st._appliedRaw = wrapped;
                            try {
                                _callQol("writeStorageConfigRawToUi", false, [root, wrapped]);
                            } catch(e) {}

                            _st.lastApplied = _st.payloadText;
                            _st.lastAccount = _st.accountId;

                            // Clear stale repair flag
                            try { _callQol("setStartupCorruptRepairPending", undefined, [root, false]); } catch(e) {}

                            _st.stage = "return_hero";
                            _st.nextAt = now;
                            break;

                        case "return_hero":
                            var returnHero = _resolveReturnHero(ctx, _st);
                            _st.returnHero = returnHero;
                            _setStep("return_hero", "active", "Returning to " + returnHero);
                            if (_st.didSwitch && returnHero) {
                                _returnHero(returnHero);
                            }
                            _finish("success", "Payload applied. Returned to " + returnHero);
                            break;

                        case "repair":
                            _setStep("read_payload", "active", "Repair — clearing corrupt builds");
                            if (_stepRepair(root, now, _st)) {
                                // Repair done (or gave up) — go back to read_payload
                                _st.stage = "read_payload";
                                _st.scanStarted = now;
                                _st.scanAdvances = 0;
                                _st.scanCursor = 0;
                                _st.scanLastAdvanceMs = 0;
                                _st.markerTried = false;
                                _st.visited = {};
                                _st.scanBudgetMs = _scanBudgetMs(_storageEntries(root).length);
                                _st.nextAt = now;
                            } else {
                                _st.nextAt = now + REPAIR_STEP_MS;
                            }
                            break;

                        default:
                            _st.stage = "idle";
                            _st.nextAt = now;
                            break;
                    }
                } catch(e) {
                    if (typeof QOL !== "undefined" && QOL.core && QOL.core.Logger) {
                        QOL.core.Logger.logError("ql_build_payload", "_tick: " + (e.message || e));
                    }
                    throw e;
                }
            }

            return {
                onEnable: function() {
                    var root = _root();
                    var acct = _getAccountId(root);
                    _reset(acct || "");
                    _st.stage = "idle";
                    var S = QOL.core.Scheduler;
                    _loop = S && S.createPollLoop ? S.createPollLoop(_tick, ACTIVE_RATE_SEC, "ql_build_payload") : null;
                },
                onDisable: function() {
                    if (_loop) { _loop.stop(); _loop = null; }
                    var S = QOL.core.Scheduler;
                    if (S) S.cancelAllForFeature("ql_build_payload");
                    _reset("");
                },
                onSettingsChanged: function() {
                    // No immediate action needed — _tick picks up changes on next poll
                }
            };
        },
        test: function(ctx) {
            try {
                var root = $.GetContextPanel();
                var asserts = [];
                // Verify required QOL delegates exist
                var required = [
                    "extractBuildCategoryPayloadToken", "buildPayloadFromBase64Url",
                    "deserializeBuildPayloadCompact", "selectHeroForBuildSave",
                    "confirmStorageHeroSignatureAbilities", "writeStorageConfigRawToUi",
                    "queueBuildSaveRequestFromLoader", "buildDefaultPayloadToken",
                    "isBrowseBuildsPopupOpen", "isConnectedToHideout",
                    "beginSettingsLoaderSession", "finalizeSettingsLoaderSession",
                    "mergeConfig", "buildDefaultConfig", "normalizeHeroId",
                    "getConfiguredDefaultHeroId", "getLoaderBaseDefaultHeroId",
                    "queueDelayedHeroRestore", "activatePanelSafe",
                    "setStartupCorruptRepairPending", "getAccountIdForBuildCategoryPayload",
                    "resolveBuildSaveStorageHeroSignal"
                ];
                for (var i = 0; i < required.length; i++) {
                    var ok = !!(typeof QOL !== "undefined" && typeof QOL[required[i]] === "function");
                    asserts.push({ passed: ok, name: "QOL." + required[i] + " exists" });
                }
                // Verify real game APIs
                var hasCreate = typeof CitadelHudHeroBuildsCreateNewBuild === "function";
                var hasDelete = typeof CitadelHudHeroBuildsDeleteSelectedBuild === "function";
                asserts.push({ passed: hasCreate || hasDelete, name: "CitadelHudHeroBuilds* APIs present" });
                // Verify key panels
                var shop = root ? root.FindChildTraverse("CitadelHudHeroShop") : null;
                asserts.push({ passed: !!shop, name: "CitadelHudHeroShop panel exists" });
                var all = asserts.every(function(a) { return a.passed; });
                return {
                    passed: all,
                    name: "ql_build_payload API surface",
                    message: all ? "" : asserts.filter(function(a) { return !a.passed; }).map(function(a) { return a.name; }).join(", "),
                    assertions: asserts
                };
            } catch(e) {
                return { passed: false, name: "ql_build_payload test", message: (e && e.message ? e.message : String(e)) };
            }
        }
    });
})();

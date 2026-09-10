// manifests/ql_build_storage/manifest.js
// =============================================================================
// QOLLOCK — Build Description Storage (read + write)
// =============================================================================
// OWNS:        The whole storage round trip. Config is carried in the storage
//              build's DESCRIPTION field, not its category name. Reading and
//              writing live in one manifest on purpose: both walk the identical
//              path (storage hero -> shop -> browser -> our build), and having
//              that path duplicated across ql_build_payload + ql_feat_buildsave
//              is what let them drift (the save stamps a marker title the load
//              never reads).
// DOES NOT OWN: config codec (ql_core.js:1926-2075), bridge attribute names
//              (ql_bridge.js:29-36), hero switching (QOL.selectHeroForBuildSave).
// DEPENDS ON:  QOL.core.FeatureRegistry, QOL.core.Scheduler, QOL.* delegates.
// CONFIG KEYS: enabled (kill switch), DEFAULT_HERO (dropdown)
// PANEL IDs:   BuildDescriptionTextEntry, BuildDetails, HeroBuildList,
//              HeroBuildSelector, CreateBuildButton, EditBuildButton,
//              SaveBuildButton, BrowseBuildsButton
// PATTERN:     Polled state machine, one stage per tick. Every wait is gated on
//              a CLASS the client sets (BuildsLoading / Selected /
//              gEditingBuilds), never on a bare timer — timeouts are only ever
//              the give-up bound, not the success signal.
//
// GROUND TRUTH (Panorama debugger, 2026-08-23 — see the block above each helper):
//   - Label.BuildDescription reports the RESOLVED user string, not the
//     {s:selected_hero_build_description} template. Payload is readable.
//   - One click on a .HeroBuildListItem adds class Selected and #BuildDetails
//     follows it. No double-click, no "Use Selected Build".
//   - Label.BuildName inside each list item carries the literal name, so
//     candidates are filtered WITHOUT clicking.
//
// NEVER DELETES A BUILD. There is no delete path in this file at all. A corrupt
// token needs no repair: the next save overwrites the description wholesale.
// =============================================================================

(function() {
    "use strict";
    const FR = QOL.core.FeatureRegistry;
    if (!FR) { $.Msg("[QOLLock] ql_build_storage: FeatureRegistry not found — aborting"); return; }

    const LOG_TAG = "[QOLLock][ql_build_storage] ";

    // ── Identity ──
    const STORAGE_HERO = "hero_skyrunner";
    const FALLBACK_HERO = "hero_werewolf";
    const BUILD_NAME = "QOLLOCK-Settings";

    // Written by the old pipeline too (ql_feat_buildsave.js:74), so a build made
    // before this manifest is still recognised by name.
    const TOKEN_EXTRACT = /(\[QOL-\d+-\d+-\d+\]:[A-Za-z0-9\-_]+)/i;

    // citadel_hud_hero_builds.xml:27 declares maxchars="512". Leave room rather
    // than discovering the cap by silent truncation — a truncated token decodes
    // to garbage, which is worse than a refused save.
    const MAX_TOKEN_LEN = 500;

    // ── Panel ids / classes (verified against Valve XML + live tree) ──
    // citadel_hud_hero_builds.xml:27 — our carrier. In #EditBuildSection, so it
    // only holds this build's text while the editor is open.
    const PID_DESC_ENTRY   = "BuildDescriptionTextEntry";
    const PID_NAME_ENTRY   = "BuildNameTextEntry";
    // citadel_ui_build_selector.xml — the popup's list, spinner and details pane.
    const PID_BUILD_LIST   = "HeroBuildList";
    const PID_SELECTOR     = "HeroBuildSelector";
    const PID_DETAILS      = "BuildDetails";
    const PID_CREATE_BTN   = "CreateBuildButton";
    const PID_BROWSE_BTN   = "BrowseBuildsButton";
    const PID_SAVE_BTN     = "SaveBuildButton";
    const PID_SELECTED_BUILD = "ShopModsSelectedBuild";
    // citadel_hud_hero_shop.xml:25 — the star tab. Activating it fires the XML's
    // CitadelShopModsActivate(EItemSlotType_Favorites), which is the only way to
    // reveal the build UI (see CLASS_SHOWING_FAVORITES).
    const PID_FAVORITES_NAV = "FavoritesNav";
    const CLASS_BUILD_ITEM = "HeroBuildListItem";
    const CLASS_BUILD_NAME = "BuildName";
    const CLASS_DESCRIPTION = "BuildDescription";
    // citadel_ui_build_selector.css:334 — set by the client on the clicked item.
    const CLASS_SELECTED   = "Selected";
    // citadel_ui_build_selector.css:46 — present while the GC reply is outstanding.
    const CLASS_LOADING    = "BuildsLoading";
    // citadel_hud_hero_builds.css — on CitadelHudHeroBuilds while the editor is open.
    const CLASS_EDITING    = "gEditingBuilds";
    // citadel_hud_hero_shop.css:1002 — #ShopModsSelectedBuild (which holds
    // BrowseBuildsButton) is revealed ONLY while the shop carries this class. On
    // every other tab the build UI sits at opacity 0, so Browse is present but
    // transparent and its C++ handler is inert. This class, on the shop panel, is
    // how we know the star tab is actually active.
    const CLASS_SHOWING_FAVORITES = "showingFavorites";
    // citadel_ui_build_details.xml — #BuildDetails carries this when the build is ours.
    const CLASS_CAN_EDIT   = "CanEditBuild";

    // ── Bridge attributes (mirror ql_bridge.js:29-36) ──
    const BRIDGE_REQUEST = "QOL_BUILD_SAVE_REQUEST";
    const BRIDGE_STATE   = "QOL_BUILD_SAVE_STATE";
    const BRIDGE_MSG     = "QOL_BUILD_SAVE_MSG";
    const BRIDGE_TOKEN   = "QOL_BUILD_SAVE_TOKEN";
    const BRIDGE_FORCE   = "QOL_BUILD_SAVE_FORCE";

    // ── Timing ──
    // Poll rates. Fast while a request is in flight, slow when idle.
    const ACTIVE_RATE_SEC  = 0.2;
    const DORMANT_RATE_SEC = 1.0;
    const STEP_MS          = 120;   // gap between two UI actions
    const SETTLE_MS        = 300;   // after a hero switch, before probing
    // Give-up bounds. These never signal success — a class does.
    const CONFIRM_TIMEOUT_MS = 4000;
    const LOADING_TIMEOUT_MS = 12000;  // GC round trip; generous on purpose
    const SELECT_TIMEOUT_MS  = 2000;
    const EDITOR_TIMEOUT_MS  = 4000;
    const COMMIT_TIMEOUT_MS  = 6000;
    const VERIFY_TIMEOUT_MS  = 4000;
    // A backstop, not a schedule. It must exceed the sum of the stage bounds below
    // or it becomes the thing that fires first, reporting "overall timeout" for a
    // stage that was still legitimately waiting.
    const OVERALL_TIMEOUT_MS = 120000;
    const SIGNATURE_HITS     = 2;
    // Consecutive polls the list count must hold before it counts as settled.
    const LIST_STABLE_HITS   = 3;
    // How many row names to print when NOTHING matched. Capped because a build
    // list is unbounded and the Panorama console has a finite scrollback that a
    // thirty-row dump would spend on a single line.
    const LIST_NAME_LOG_MAX  = 12;

    // ── Opening the shop ──
    // Verified in-game 2026-08-24: this is the command that works, and it TOGGLES —
    // sending it again while the shop is open closes it. So it is fired exactly once
    // per run and never retried; gShopOpen is what we wait on.
    //
    // This used to delegate to QOL.tryOpenHeroShopForHeroProbe. That helper's first
    // attempt is `open_item_shop`, which this build does not have, and
    // dispatchCitadelConCommand returns true whenever $.DispatchEvent did not throw
    // (ql_feat_buildbridge.js:56-65) — so the dead attempt reported success, the five
    // real fallbacks under it became unreachable, and its own 1s internal throttle
    // silently became the retry budget. Four throttled attempts against a 4s stage
    // bound is exactly the failure this manifest was reporting as "could not reach
    // the build list".
    const SHOP_OPEN_CMD = "citadel_open_hero_sheet";
    // Give-up bound for the shop appearing, deliberately generous: this lands right
    // after a hero switch, and a cold switch does blocking model/animgraph/particle
    // loads whose cost is entirely machine-dependent. A tight bound here is a coin
    // toss, not a give-up bound.
    const SHOP_OPEN_TIMEOUT_MS = 30000;
    // Same reasoning, smaller job: one button press and a popup inflate. Not as
    // small as it looks, which is why this is no longer 8s: the press lands right
    // after a hero switch and a shop open, so the client is in the middle of exactly
    // the blocking work the bound above allows for. The fuzzer produced an 8.9s
    // reveal, and against an 8s bound the read gave up — then passed on a retry only
    // because a leftover popup was still on screen for it, a success bought with a
    // modal stranded on the player. The longer bound is only ever paid out in the
    // case that was going to fail anyway.
    const BROWSER_OPEN_TIMEOUT_MS = 16000;
    // How long to insist on the Favorites tab before giving up and letting
    // open_browser be the real gate. Short: activating the tab is a local UI
    // toggle with no round trip, so it lands in a frame or two. This is a
    // best-effort nudge, not a hard gate — a client that never reports
    // showingFavorites (a reskin, a future rename) must not have every load
    // bricked by it, so the run proceeds and open_browser's own timeout catches a
    // genuinely unreachable button.
    const FAVORITES_CONFIRM_MS = 2500;
    // How long a Browse press stays our responsibility after the run gives up on it.
    // Giving up means WE stop waiting, not that the client stopped inflating: the
    // popup can still land, modal, on a player whose round trip is over. Held equal
    // to the bound above so no reveal the pipeline was willing to wait for can
    // outlive the cleanup that owns it — sweeping longer than that would start
    // dismissing browsers the PLAYER opened.
    const CLEANUP_SWEEP_MS = BROWSER_OPEN_TIMEOUT_MS;
    // Minimum gap between two presses of the same non-idempotent button. The waiting
    // stages call every STEP_MS, and none of these buttons is a no-op when pressed
    // again:
    //   Browse queues another popup reveal — a slow client returned ~20 popups one
    //     after another (fuzzer seed 54).
    //   Edit re-seeds the edit fields FROM THE BUILD, so a queued second open wipes
    //     the token we just typed and the commit saves 0 chars (fuzzer seed 52).
    //   Save commits again.
    // Not the full stage window either: a press really can be lost — sabotage
    // deletes the popup mid-inflate — and a stage that cannot press again inside its
    // own budget just fails instead.
    const REPRESS_MS = 1000;

    // ── Hiding the machinery ──
    // The round trip drives real game UI: the shop opens, the browser popup opens,
    // rows get clicked. All of that is visible, and there is no reason for the user
    // to watch it.
    //
    // 0.02 and not 0 or 0.01: IsPanelSuppressedMaybe (ql_core.js:2645-2651) treats
    // opacity <= 0.01 as SUPPRESSED, and TryCloseBrowseBuildsPopupForLoader
    // (ql_core.js:6566) refuses to activate a button it considers hidden. Dimming to
    // 0.01 would therefore disarm the old pipeline's own popup closer — invisible to
    // the eye either way, so take the value that does not booby-trap shared code.
    const HIDE_OPACITY = "0.02";

    // ── QOL delegate wrapper (MIGRATION_PATTERNS Pattern 10) ──
    function _qol(name) {
        try {
            return (typeof QOL !== "undefined" && typeof QOL[name] !== "undefined") ? QOL[name] : undefined;
        } catch(e) { return undefined; }
    }
    function _callQol(name, fallback, args) {
        const fn = _qol(name);
        if (typeof fn === "function") {
            try { return fn.apply(null, args || []); } catch(e) { return fallback; }
        }
        return fallback;
    }

    // ── 3.1.9 MIGRATION — delete with legacy_3_1_9.js ──
    /**
     * The old-carrier reader, or undefined when the file is gone.
     *
     * Resolved lazily on every use rather than captured at load, so deleting
     * legacy_3_1_9.js and its <include> cannot break this file at load time — the
     * migration simply stops happening, which is the intended end state.
     */
    function _legacy() {
        try {
            const L = (typeof QOL !== "undefined") ? QOL.legacy319 : undefined;
            return (L && typeof L.readCategoryToken === "function" &&
                    typeof L.isOwnBuildRow === "function") ? L : undefined;
        } catch(e) { return undefined; }
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
    function _hasClass(panel, cls) {
        if (!_alive(panel)) return false;
        try { return typeof panel.BHasClass === "function" && panel.BHasClass(cls); } catch(e) { return false; }
    }
    function _root() {
        try { return $.GetContextPanel(); } catch(e) { return null; }
    }
    function _now() {
        try { return Date.now ? Date.now() : (new Date()).getTime(); } catch(e) { return 0; }
    }
    function _log(msg) {
        try { $.Msg(LOG_TAG + msg); } catch(e) {}
    }

    /**
     * Read a panel's text.
     *
     * The "text" attribute is tried first because it survives on panels whose
     * .text accessor throws mid-teardown. Both are needed: Labels expose .text,
     * TextEntry exposes both, and a panel deleted between the two reads must not
     * take the tick down with it.
     */
    function _readText(panel) {
        if (!_alive(panel)) return "";
        try {
            if (typeof panel.GetAttributeString === "function") {
                const t = panel.GetAttributeString("text", "");
                if (t) return String(t);
            }
            if (typeof panel.text !== "undefined" && panel.text !== null) return String(panel.text);
        } catch(e) {}
        return "";
    }

    function _extractToken(text) {
        if (!text) return "";
        const m = TOKEN_EXTRACT.exec(String(text).replace(/\s+/g, ""));
        return m ? String(m[1]) : "";
    }

    // ── Context ──
    function _isShopOpen(root)  { return _callQol("isHudClassActive", false, [root, "gShopOpen"]); }
    function _inHideout(root)   { return _callQol("isConnectedToHideout", false, [root]); }
    function _activate(panel)   { return _callQol("activatePanelSafe", false, [panel]); }

    /**
     * Is the shop showing the Favorites (builds) tab?
     *
     * showingFavorites lives on the CitadelHudHeroShop panel itself, NOT on the
     * Hud root — so isHudClassActive (which only checks root / gameplayHud /
     * abilities) cannot see it. Read it off the shop panel directly. Several
     * CitadelHudHeroShop instances can exist with only one live, so any instance
     * carrying the class counts.
     */
    function _isFavoritesTab(root) {
        const shops = _findClass(root, "CitadelHudHeroShop");
        for (let i = 0; i < shops.length; i++) {
            if (_hasClass(shops[i], CLASS_SHOWING_FAVORITES)) return true;
        }
        const byId = _find(root, "CitadelHudHeroShop");
        return _hasClass(byId, CLASS_SHOWING_FAVORITES);
    }

    /**
     * Select the Favorites tab.
     *
     * FavoritesNav's onmouseactivate is CitadelShopModsActivate(Favorites)
     * (citadel_hud_hero_shop.xml:25). Pressed on every shop instance for the same
     * reason Browse is (only one is live), and a root-level fallback for a tree
     * that nests the nav differently. Selecting the tab already active is a no-op,
     * so this is safe to fire repeatedly.
     */
    function _selectFavoritesTab(root) {
        let pressed = false;
        const shops = _findClass(root, "CitadelHudHeroShop");
        for (let i = 0; i < shops.length; i++) {
            if (_activate(_find(shops[i], PID_FAVORITES_NAV))) pressed = true;
        }
        if (!pressed && _activate(_find(root, PID_FAVORITES_NAV))) pressed = true;
        return pressed;
    }

    /** Ask the client to open the shop. Fired at most once per run — see SHOP_OPEN_CMD. */
    function _fireShopOpen() {
        return _callQol("dispatchCitadelConCommand", false, [SHOP_OPEN_CMD]);
    }

    /**
     * Close the shop.
     *
     * CitadelExitUpgradeShop is the shop's OWN oncancel handler
     * (citadel_hud_hero_shop.xml:19), so this is the client's close path and not a
     * guess. Preferred over the console command for one reason: SHOP_OPEN_CMD is a
     * toggle, and a toggle sent at the wrong moment opens what it was meant to
     * shut.
     *
     * The toggle survives only as a fallback for a client with no such function,
     * and only while gShopOpen still says open. Deliberately NOT re-checked after
     * calling CitadelExitUpgradeShop: if the class clears asynchronously, a
     * "did it work?" probe reads stale-open and the fallback would re-open the shop
     * we just closed.
     */
    function _closeShop(root) {
        try {
            if (typeof CitadelExitUpgradeShop === "function") {
                CitadelExitUpgradeShop();
                return true;
            }
        } catch(e) {}
        if (_isShopOpen(root)) return _fireShopOpen();
        return false;
    }

    /**
     * The build browser popup root.
     *
     * PopupBuildBrowser carries no id in vanilla XML, so walk up from
     * #HeroBuildSelector (which does) until a .PopupPanel ancestor appears.
     */
    function _popup(root) {
        let node = _find(root, PID_SELECTOR);
        let guard = 0;
        while (_alive(node) && guard < 12) {
            if (_hasClass(node, "PopupPanel")) return node;
            try { node = node.GetParent ? node.GetParent() : null; } catch(e) { node = null; }
            guard++;
        }
        return null;
    }

    /**
     * Is the browser open?
     *
     * popups_shared.css:26 sets `.PopupPanel.Hidden { visibility: visible; }` — a
     * dismissed popup still reads as visible to the engine, so a visibility probe
     * reports true on a CLOSED browser. The `Hidden` class is the discriminator.
     */
    function _isBrowseOpen(root) {
        const popup = _popup(root);
        if (!_alive(popup)) return false;
        return !_hasClass(popup, "Hidden");
    }

    /**
     * Is the list still waiting on the GC?
     *
     * citadel_ui_build_selector.css:46 — the selector carries BuildsLoading while
     * the hero-build search is outstanding, which collapses #HeroBuildList and
     * reveals the spinner. This is the honest "not ready yet" flag, and it is why
     * this manifest needs no settle heuristics.
     *
     * #CreateBuildButton must NOT be used for this: it lives in the popup's
     * .Header, a SIBLING of the selector, so it exists the instant the popup
     * inflates regardless of the reply. Keying readiness on it is what made an
     * empty mid-round-trip list read as "this hero has no builds".
     */
    function _isListLoading(root) {
        return _hasClass(_find(root, PID_SELECTOR), CLASS_LOADING);
    }

    function _listItems(root) {
        const list = _find(root, PID_BUILD_LIST);
        return _alive(list) ? _findClass(list, CLASS_BUILD_ITEM) : [];
    }

    /** The literal build name shown in a list row — readable without clicking. */
    function _itemName(item) {
        if (!_alive(item)) return "";
        const labels = _findClass(item, CLASS_BUILD_NAME);
        for (let i = 0; i < labels.length; i++) {
            const t = _readText(labels[i]);
            if (t) return t;
        }
        return "";
    }

    /**
     * The description of whichever build is currently selected.
     *
     * Reads Label.BuildDescription under #BuildDetails. Verified in the debugger:
     * the client substitutes the resolved user string here, so this is a real
     * read and not the localization template.
     */
    function _selectedDescription(root) {
        const details = _find(root, PID_DETAILS);
        if (!_alive(details)) return "";
        const labels = _findClass(details, CLASS_DESCRIPTION);
        for (let i = 0; i < labels.length; i++) {
            const t = _readText(labels[i]);
            if (t) return t;
        }
        return "";
    }

    function _isOurBuildSelected(root) {
        return _hasClass(_find(root, PID_DETAILS), CLASS_CAN_EDIT);
    }

    /**
     * Press Browse Builds, on every copy of the button that exists.
     *
     * Unlike its neighbours in citadel_shop_mods_build.xml:42-44, BrowseBuildsButton
     * declares NO onactivate — C++ binds the handler by id at construction. The tree
     * carries several CitadelShopModsBuild panels and only one is live, so a single
     * FindChildTraverse can hand back an inert copy whose activation goes nowhere and
     * reports success. Press them all; opening an already-open browser is a no-op.
     */
    function _pressBrowse(root) {
        let pressed = false;
        const owners = _findClass(root, "shopModsBuild");
        for (let i = 0; i < owners.length; i++) {
            if (_activate(_find(owners[i], PID_BROWSE_BTN))) pressed = true;
        }
        // Root-level lookup is the FALLBACK for a tree with no shopModsBuild panel,
        // not an extra press. Unconditionally it re-pressed the button already
        // pressed above — the traverse finds that same live copy — and every press
        // queues its own popup reveal, so the stage was firing two per tick and ~80
        // per attempt. Only reached when the class-based sweep found nothing.
        if (!pressed && _activate(_find(root, PID_BROWSE_BTN))) pressed = true;
        return pressed;
    }

    /**
     * Dismiss the build browser popup.
     *
     * Identified by CLASS and HANDLER, never by label. Vanilla puts two buttons in
     * the popup's .ButtonRow (citadel_popup_build_browser.xml:17-22): confirm is
     * `SecondaryButton fill light` with onactivate
     * CitadelBuildBrowserPopupConfirmBuild(), cancel is `SecondaryButton outline`
     * with UIPopupButtonClicked(). Matching the word "Cancel" would break in every
     * non-English client, and pressing the WRONG one applies the selected build to
     * the player's loadout — so this excludes the confirm button explicitly and
     * gives up rather than guessing. `outline` is confirmed present in the live tree
     * (Panorama debugger, 2026-08-25).
     */
    function _closeBrowse(root) {
        const popup = _popup(root);
        if (!_alive(popup)) return false;

        let buttons = _findClass(popup, "SecondaryButton");
        if (!buttons || buttons.length === 0) {
            // Fallback: Valve removed SecondaryButton class. The buttons are inside .ButtonRow.
            buttons = [];
            const rows = _findClass(popup, "ButtonRow");
            for (let r = 0; r < rows.length; r++) {
                const row = rows[r];
                for (let c = 0; c < row.GetChildCount(); c++) {
                    const child = row.GetChild(c);
                    if (child) buttons.push(child);
                }
            }
        }

        let cancel = null;
        for (let i = 0; i < buttons.length; i++) {
            let handler = "";
            try {
                handler = String(buttons[i].GetAttributeString("onactivate", "") || "").toLowerCase();
            } catch(e) {}
            if (handler.indexOf("confirmbuild") !== -1) continue;   // never press confirm
            if (_hasClass(buttons[i], "fill")) continue;            // confirm is `fill light`
            if (_hasClass(buttons[i], "outline") || handler.indexOf("uipopupbuttonclicked") !== -1) {
                cancel = buttons[i];
                break;
            }
        }
        if (cancel && _activate(cancel)) return true;
        // PopupBuildBrowser declares oncancel="UIPopupButtonClicked()", so the
        // engine's own cancel path is a legitimate second try. (ESC does not reach
        // it — the popup does not take keyboard focus.)
        try { $.DispatchEvent("Cancelled", popup); return true; } catch(e) {}
        return false;
    }

    /**
     * Panels to dim while the round trip runs.
     *
     * Re-resolved on every call rather than remembered: the popup is created lazily
     * and the client rebuilds it (and the selector under it) when a build is
     * selected, so a style set once is gone by the next stage. Applying every tick
     * is idempotent and is the only thing that survives a rebuild.
     *
     * PopupManager itself is deliberately NOT dimmed even though it is the common
     * ancestor of both the popup and its backdrop. It hosts every other popup too,
     * so a run that died without restoring would leave the whole game unable to show
     * one. Dimming the two known children keeps the blast radius to our own UI.
     */
    function _hideTargets(root) {
        const out = [];
        const popup = _popup(root);
        if (_alive(popup)) out.push(popup);
        // The popup's dim backdrop, a sibling under PopupManager (seen in the live
        // tree 2026-08-25). Left alone it veils the screen on its own.
        const backdrop = _find(root, "DimBackground");
        if (_alive(backdrop)) out.push(backdrop);
        const spinner = _find(root, "HeroBuildListLoading");
        if (_alive(spinner)) out.push(spinner);
        // The shop is reached by class AND by id, because neither alone is dependable:
        // citadel_hud_hero_shop.xml:19 declares class="CitadelHudHeroShop" on the type
        // of the same name, but panel ids in this tree have already proven unreliable
        // (duplicate, C++-assigned instances) — so take whichever resolves and
        // de-duplicate.
        const shops = _findClass(root, "CitadelHudHeroShop");
        for (let i = 0; i < shops.length; i++) {
            if (_alive(shops[i]) && out.indexOf(shops[i]) === -1) out.push(shops[i]);
        }
        const shopById = _find(root, "CitadelHudHeroShop");
        if (_alive(shopById) && out.indexOf(shopById) === -1) out.push(shopById);
        return out;
    }

    /**
     * Describe a panel the way a log reader needs it: what it IS, not that it exists.
     *
     * There is no classList in Panorama — BHasClass only answers about a name you
     * already suspect — so this reports the id plus the handful of classes this file
     * makes decisions on. Enough to tell the live panel from an inert duplicate,
     * which is the distinction that has cost us the most.
     */
    function _describe(panel) {
        if (!_alive(panel)) return "MISSING";
        let out = "";
        try { out = "#" + (panel.id || "(no id)"); } catch(e) { out = "#?"; }
        const flags = [];
        const probe = ["PopupPanel", "Hidden", CLASS_LOADING, CLASS_SELECTED,
                       CLASS_CAN_EDIT, CLASS_EDITING, "shopModsBuild", "ShowMyBuilds"];
        for (let i = 0; i < probe.length; i++) {
            if (_hasClass(panel, probe[i])) flags.push(probe[i]);
        }
        if (flags.length) out += " ." + flags.join(".");
        // Read the inline opacity back. Panorama does not always return what was
        // written here, so an empty answer proves nothing — but a value does, and
        // that is what settles "did our dim actually land on this panel".
        try {
            const op = String(panel.style.opacity || "");
            if (op) out += " opacity=" + op;
        } catch(e) {}
        return out;
    }

    /**
     * One block per run, emitted once the list is ready: what the tree ACTUALLY gave
     * us, with the candidate counts.
     *
     * The counts are the point. Every hard bug in this file has been a lookup that
     * returned something plausible and wrong — a second CitadelShopModsBuild that is
     * not the live one, a HeroBuildSelector reached by id in a tree where ids are
     * C++-assigned and duplicated. "Found it" cannot distinguish those; "3 matched,
     * using the first" can.
     *
     * Also the only honest way to answer whether the dim landed: the manifest cannot
     * see the screen, but it can say which panels it aimed at.
     */
    function _reportTree(root, label) {
        const selectors = _findClass(root, "ShowMyBuilds");
        const shops = _findClass(root, "CitadelHudHeroShop");
        const owners = _findClass(root, "shopModsBuild");
        const editors = _findClass(root, "CitadelHudHeroBuilds");
        const editorById = _find(root, "CitadelHudHeroBuilds");
        _log("tree[" + label + "]: popup " + _describe(_popup(root)) +
             " | selector " + _describe(_find(root, PID_SELECTOR)) +
             " (ShowMyBuilds x" + selectors.length + ")");
        const details = _find(root, PID_DETAILS);
        _log("tree[" + label + "]: list " + _describe(_find(root, PID_BUILD_LIST)) +
             " | details " + _describe(details) +
             " | descEntry " + _describe(_find(root, PID_DESC_ENTRY)));
        if (details && _alive(details)) {
            const btns = _findClass(details, "ButtonRow");
            const btnPrimary = _findClass(details, "PrimaryButton");
            _log("tree[" + label + "]: details ButtonRow x" + (btns ? btns.length : 0) + " PrimaryButton x" + (btnPrimary ? btnPrimary.length : 0));
            if (btns && btns.length > 0) {
                let btnStr = "";
                for (let i = 0; i < btns[0].GetChildCount(); i++) {
                    const c = btns[0].GetChild(i);
                    let h = "";
                    try { h = c.GetAttributeString("onactivate", ""); } catch(e) {}
                    btnStr += (c.id || c.paneltype) + (h ? "[onactivate=" + h + "]" : "[]") + " ";
                }
                _log("tree[" + label + "]: details buttons: " + btnStr);
            }
        }
        _log("tree[" + label + "]: shop x" + shops.length + " " + _describe(shops[0]) +
             " | shopModsBuild x" + owners.length +
             " | heroBuilds byClass x" + editors.length + " byId " + _describe(editorById));
        const targets = _hideTargets(root);
        let dim = "";
        for (let i = 0; i < targets.length; i++) dim += (i ? ", " : "") + _describe(targets[i]);
        _log("tree[" + label + "]: dim targets x" + targets.length + ": " + (dim || "NONE"));

        const popup = _popup(root);
        const popupMgr = popup ? popup.GetParent() : null;
        if (popupMgr) {
            let chstr = "";
            for (let i = 0; i < popupMgr.GetChildCount(); i++) {
                const child = popupMgr.GetChild(i);
                if (child) {
                    let vis = child.BHasClass("Hidden") ? "hidden" : "visible";
                    let op = child.style.opacity || "none";
                    chstr += child.id + "[" + vis + ", op:" + op + "] ";
                }
            }
            _log("tree[" + label + "]: PopupManager children: " + chstr);
        }
    }

    function _setHidden(root, hidden) {
        // Opacity hiding removed per user request.
        return 0;
    }

    // ── Editor ──
    function _hudBuilds(root) {
        const byClass = _findClass(root, "shopModsBuild");
        for (let i = 0; i < byClass.length; i++) {
            if (_alive(byClass[i])) return byClass[i];
        }
        return _find(root, PID_SELECTED_BUILD);
    }

    /**
     * Is the build editor open?
     *
     * gEditingBuilds is set by the client on CitadelHudHeroBuilds. Only the
     * client can set or clear it, which makes it the one trustworthy signal for
     * both "editor opened" and "save committed" (it clears on commit).
     */
    function _isEditing(root) {
        // By ID first, because that is what actually exists: hud.xml:221 declares
        // <CitadelHudHeroBuilds id="CitadelHudHeroBuilds" hittest="false" /> with NO
        // class attribute, and a panel's TYPE is not a class in Panorama. So the class
        // sweep below matches nothing in the live client — the new tree trace reported
        // "heroBuilds x0" — and this function has always been running on its fallback.
        // Harmless, but a lookup that can never succeed is a lookup nobody can reason
        // about. Kept anyway: a future layout may add the class, and it costs one pass.
        if (_hasClass(_find(root, "CitadelHudHeroBuilds"), CLASS_EDITING)) return true;
        const panels = _findClass(root, "CitadelHudHeroBuilds");
        for (let i = 0; i < panels.length; i++) {
            if (_hasClass(panels[i], CLASS_EDITING)) return true;
        }
        // The class may sit on an ancestor of the edit section rather than on a
        // panel matching that class name, so fall back to the section's chain.
        let node = _find(root, PID_DESC_ENTRY);
        let guard = 0;
        while (_alive(node) && guard < 8) {
            if (_hasClass(node, CLASS_EDITING)) return true;
            try { node = node.GetParent ? node.GetParent() : null; } catch(e) { node = null; }
            guard++;
        }
        return false;
    }

    function _descEntry(root) { return _find(root, PID_DESC_ENTRY); }

    /**
     * Write into a TextEntry the way the client notices.
     *
     * SetText() is preferred because it honours the field's maxchars. Neither
     * entry declares an XML handler (the builds panel subscribes by id), so the
     * two dispatched events are what make C++ pick the change up.
     */
    function _setEntryText(entry, value) {
        if (!_alive(entry)) return false;
        let didSet = false;
        if (typeof entry.SetText === "function") {
            try { entry.SetText(value); didSet = true; } catch(e) {}
        }
        if (!didSet) {
            try { entry.text = value; didSet = true; } catch(e) {}
        }
        try { $.DispatchEvent("TextEntryChanged", entry); } catch(e) {}
        try { $.DispatchEvent("TextEntrySubmit", entry); } catch(e) {}
        return didSet;
    }

    function _triggerEdit(root) {
        let ok = false;
        // The browser's own Edit button confirms the popup selection first
        // (citadel_ui_build_details.xml:38 calls CitadelBuildBrowserPopupConfirmBuild
        // then CitadelHudHeroBuildsEditSelectedBuild), so prefer it while the
        // browser is open.
        const details = _find(root, PID_DETAILS);
        if (_alive(details)) {
            if (_activate(_find(details, "EditBuildButton"))) ok = true;
        }
        if (!ok) {
            try {
                if (typeof CitadelHudHeroBuildsEditSelectedBuild === "function") {
                    CitadelHudHeroBuildsEditSelectedBuild();
                    ok = true;
                }
            } catch(e) {}
        }
        return ok;
    }

    function _triggerSave(root) {
        let ok = false;
        try {
            if (typeof CitadelHudHeroBuildsSaveEdits === "function") {
                CitadelHudHeroBuildsSaveEdits();
                ok = true;
            }
        } catch(e) {}
        // Fallback, not a second press: CitadelHudHeroBuildsSaveEdits above already
        // committed, and pressing the button on top commits again. Same mistake the
        // Browse path made, with the same fix.
        if (!ok && _activate(_find(root, PID_SAVE_BTN))) ok = true;
        return ok;
    }

    /**
     * Leave edit mode WITHOUT committing.
     *
     * citadel_shop_mods_build.xml:30 —
     *   <Panel id="CancelChangesButton" class="... EditModeButton"
     *          onmouseactivate="CitadelHudHeroBuildsDiscardEdits()">
     * so the global and the button are one action; the global goes first for the
     * reason _triggerCreate explains.
     *
     * Save must not be the only way out. A run that dies anywhere between "enter the
     * editor" and "the commit landed" leaves a half-typed token in a visible field,
     * and pressing Save to tidy up would commit the very state we just decided not
     * to trust. Discard throws it away, which is the right end for every failure.
     */
    function _triggerDiscard(root) {
        try {
            if (typeof CitadelHudHeroBuildsDiscardEdits === "function") {
                CitadelHudHeroBuildsDiscardEdits();
                return true;
            }
        } catch(e) {}
        return _activate(_find(root, "CancelChangesButton"));
    }

    /**
     * Create the storage build.
     *
     * The global function is tried FIRST, and the button only as a fallback, which
     * is the opposite of the obvious order and the whole point of this function.
     * citadel_popup_build_browser.xml:11 declares
     *   onmouseactivate="CitadelHudHeroBuildsCreateNewBuild(); UIPopupButtonClicked();"
     * so pressing #CreateBuildButton creates the build AND DISMISSES THE POPUP. The
     * verify stage reads Label.BuildDescription under #BuildDetails, which lives
     * inside that popup, so a first-ever save wrote 214 chars to disk and then
     * reported "save not confirmed by the build (details read back 0 chars)" —
     * observed in-game 2026-08-25, exactly as predicted from the XML. Calling the
     * handler directly runs the create without the dismissal.
     *
     * Both are kept because the globals are the load-bearing half of this file
     * (CitadelHudHeroBuildsEditSelectedBuild and ...SaveEdits are how edit and
     * commit already work in-game), but a client that renames one should degrade to
     * a working-with-a-reopen save rather than no save at all.
     */
    function _triggerCreate(root) {
        try {
            if (typeof CitadelHudHeroBuildsCreateNewBuild === "function") {
                CitadelHudHeroBuildsCreateNewBuild();
                return true;
            }
        } catch(e) {}
        const popup = _popup(root);
        if (_alive(popup) && _activate(_find(popup, PID_CREATE_BTN))) return true;
        if (_activate(_find(root, PID_CREATE_BTN))) return true;
        return false;
    }

    // ── Hero switch ──
    // The old pipeline's post-restore shop pulse must be disarmed for our restores,
    // and this is how long to hold it off. HERO_RESTORE_BLIND_SUCCESS_MS is 800 and
    // HERO_RESTORE_MAX_WAIT_MS is 3200 (ql_core.js:667-669), on top of the 0.3s the
    // restore is queued with — so this is that worst case with room to spare, not a
    // number picked to feel safe.
    const SHOP_PULSE_SUPPRESS_MS = 10000;

    /**
     * Disarm the old pipeline's post-restore shop pulse.
     *
     * queueDelayedHeroRestore finishes at QueueShopPulseAfterHeroRestore
     * (ql_core.js:9196), which schedules PulseShopAfterBuildPayloadStartupReturn
     * (ql_core.js:6490). That helper closes the shop, then opens it
     * UNCONDITIONALLY (ql_core.js:6512-6535), then closes it again 0.05s later. It
     * is a deliberate refresh pulse that the old category-name carrier needed —
     * that carrier lived in the shop panel, so the shop had to be re-inflated to
     * show the committed value. This manifest reads from the browser popup and
     * needs none of it.
     *
     * Left armed it is the single most visible artefact of the whole round trip:
     * opacity has already been restored by the time it fires, so the user watches
     * the shop flash open by itself once the run is over. The fuzzer flagged it on
     * 228 of 300 runs — including runs where the shop was correctly closed first,
     * because the reopen is not conditional on anything.
     *
     * Suppressed through the helper's OWN throttle rather than by editing it: the
     * guard is `if (now < State.heroRestoreShopPulseNextMs) return`, so arming that
     * stamp is the sanctioned way to say "not this time" and leaves the old path
     * intact for any caller that still wants it.
     */
    function _suppressShopPulse() {
        try {
            const State = QOL.state;
            if (State) State.heroRestoreShopPulseNextMs = _now() + SHOP_PULSE_SUPPRESS_MS;
        } catch(e) {}
    }

    function _switchToStorageHero() {
        return _callQol("selectHeroForBuildSave", false, [STORAGE_HERO, "ql_build_storage"]);
    }
    function _returnHero(hero) {
        return _callQol("queueDelayedHeroRestore", false, [hero, "ql_build_storage_return", 0.3]);
    }
    /**
     * Ask whether the HUD is showing Skyrunner's signature abilities yet.
     *
     * Returns the whole result, not a boolean. ConfirmStorageHeroSignatureAbilities
     * (ql_core.js:7065) already distinguishes "the signature HUD is not there at
     * all" from "slot 1 says ENTANGLING BOLA, which is Billy's", and collapsing
     * that to true/false threw away the only description of what went wrong. The
     * 2026-09-05 reports are both confirm failures and neither says so: one shows
     * zero signature reads (HUD never found), the other shows a werewolf ability
     * held for the full 4s timeout, and both were reported as "could not reach the
     * build list" — a stage the run never got near.
     */
    function _confirmStorageHero(root, now) {
        return _callQol("confirmStorageHeroSignatureAbilities",
            { confirmed: false, detail: "confirm bridge unavailable" },
            [root, now, SIGNATURE_HITS]) || { confirmed: false, detail: "confirm returned nothing" };
    }
    /**
     * The hero the player is ACTUALLY on, read off the live ability HUD.
     *
     * ReadStorageHeroSignatureSlots hands back the normalized ability ids the
     * signature slots are showing — "ability_werewolf_netshot" when the player is
     * Billy, "ability_skyrunner_flakshot" when the switch has landed. The hero is
     * the middle token, and normalizeHeroId rejects anything that is not a real
     * playable hero (it goes through resolvePlayableHeroAlias), so a slot showing
     * something that is not an ability id contributes nothing rather than a
     * garbage hero.
     *
     * The pure reader is used rather than the confirm: the confirm mutates
     * State.storageHeroSignatureConfirmHits, and seeding that counter from a
     * capture-time probe is not this function's business.
     *
     * Returns "" when the HUD is not readable — an empty answer is honest and the
     * caller has a config fallback. Never returns STORAGE_HERO: callers use this
     * to decide where to put the player BACK, and "back to Skyrunner" is the one
     * answer that strands them.
     */
    function _liveHero(root) {
        const scan = _callQol("readStorageHeroSignatureSlots", null, [root]);
        if (!scan || !scan.normalized) return "";
        const votes = {};
        let best = "";
        let bestCount = 0;
        for (let i = 0; i < scan.normalized.length; i++) {
            const m = /^ability_([a-z0-9]+)_/.exec(String(scan.normalized[i] || ""));
            if (!m) continue;
            const hero = _callQol("normalizeHeroId", "", ["hero_" + m[1]]) || "";
            if (!hero || hero === STORAGE_HERO) continue;
            votes[hero] = (votes[hero] || 0) + 1;
            if (votes[hero] > bestCount) { bestCount = votes[hero]; best = hero; }
        }
        return best;
    }

    /**
     * Where to put the player back when the run is over.
     *
     * The live hero comes FIRST and DEFAULT_HERO is only a fallback. It used to be
     * the other way round — in fact DEFAULT_HERO was the only source — and that is
     * wrong by construction: DEFAULT_HERO is a dropdown the user sets in the
     * settings panel, so it answers "which hero should the storage build belong
     * to", not "which hero is this player currently playing". Nothing keeps the
     * two in sync, and on 2026-09-05 they diverged: the save's confirm stage read
     * Billy's ENTANGLING BOLA off the ability HUD for its whole 4s timeout while
     * the restore queued hero_punkgoat, so the player was hauled onto a character
     * they had never picked and sat through its load with an empty model
     * (SetParticleControlEnt on model ""). Changing the dropdown was enough to
     * teleport you on your next save.
     *
     * Callers must resolve this BEFORE switching — after the switch the ability
     * HUD reads Skyrunner, which _liveHero refuses to return, and the answer
     * silently degrades to the config value again.
     */
    function _resolveReturnHero(ctx, root) {
        const live = _liveHero(root || _root());
        if (live) return { hero: live, source: "live" };
        let hero = "";
        try { hero = String(ctx.config.get("DEFAULT_HERO") || ""); } catch(e) { hero = ""; }
        let source = "config";
        if (!hero) {
            hero = _callQol("getConfiguredDefaultHeroId", "", [null]) || "";
            source = "configuredDefault";
        }
        hero = _callQol("normalizeHeroId", hero, [hero]) || hero;
        if (!hero) return { hero: FALLBACK_HERO, source: "fallback" };
        return { hero: hero, source: source };
    }

    FR.register({
        id: "ql_build_storage",
        // Active. While this is on, ql_core.js's ProcessBuildRequestOrchestration
        // stands down and ql_build_payload is off (its enabledByDefault is false),
        // so this manifest owns the storage round trip alone. Turning it off
        // restores both, which is the whole rollback.
        enabledByDefault: true,
        settings: [
            { key: "DEFAULT_HERO", type: "dropdown",
              options: (typeof QOL_COMPACT_DEFAULT_HERO_OPTIONS === "object" && QOL_COMPACT_DEFAULT_HERO_OPTIONS.length > 0)
                       ? QOL_COMPACT_DEFAULT_HERO_OPTIONS : [FALLBACK_HERO],
              default: FALLBACK_HERO }
        ],
        create: function(ctx) {
            let _loop = null;
            let _st = {};

            function _reset() {
                // A Browse press outlives the session that made it, so the duty to
                // dismiss the popup it causes has to outlive the session too. Wiping
                // these along with everything else meant the NEXT session inherited a
                // popup already on its way up and threw away the only record that we
                // owed it a close: fuzzer seed 1093 pressed at 42.1s, gave up at
                // 42.7s, opened another session that cleared the stamp, and the popup
                // landed at 45s with nothing watching for it. Carried, not reset — the
                // debt belongs to the feature, not to the run.
                const priorPress = _st.browsePressedAt || 0;
                const priorSweep = _st.sweepUntil || 0;
                // The DEBT is carried; the PERMISSION is not. editPressedAt says "this
                // run opened the editor", which is what authorises discarding it —
                // carrying that made the next run believe it had opened an editor it
                // never touched, and cost eight saves that used to land. owesEditorClose
                // says "an editor opening late is ours to close", which really does
                // outlive the run that caused it. Two different facts, one of which
                // used to be doing both jobs.
                const priorOwesEditor = !!_st.owesEditorClose;
                _st = {
                    stage: "idle",
                    mode: "",            // "read" | "write"
                    nextAt: 0,
                    startedAt: 0,
                    stageAt: 0,          // when the current wait began
                    didSwitch: false,
                    shopCmdSent: false,  // the open command is a toggle — send it once
                    shopWasOpen: false,  // the shop was up before we arrived
                    shopRebindClosed: false, // we closed it once to force a rebind
                    favPressedAt: 0,     // gate for _selectFavoritesTab re-presses
                    returnHero: "",
                    returnHeroSource: "", // where returnHero came from, for the log
                    gateFail: "",        // why _advanceToList gave up, verbatim
                    confirmDetail: "",   // last thing the signature HUD said
                    cursor: 0,           // position within the candidate list
                    // Panels are never cached: selecting a build makes the client
                    // rebuild #HeroBuildList, so rows are re-resolved by index every
                    // tick (_candidateAt).
                    candidateCount: 0,
                    listCount: -1,       // last observed row count, for settle detection
                    listStableHits: 0,   // consecutive polls the count has held
                    targetChosen: false, // write mode: _pickWriteCursor has run
                    sweptAll: false,
                    sawAnyBuild: false,
                    createdBuild: false,
                    verifyReopened: false,  // verify had to reopen the browser to read back
                    treeReported: false,    // the one-shot tree snapshot has been logged
                    browsePressedAt: priorPress,  // outlives the run that pressed it
                    sweepUntil: priorSweep,       // ditto: the popup is still coming
                    editPressedAt: 0,    // gate for _openEditor, and permission to discard
                    owesEditorClose: priorOwesEditor,
                    savePressedAt: 0,    // gate for _pressSave
                    token: "",           // write mode: what we must persist
                    requestToken: "",    // write mode: bridge correlation id
                    // 3.1.9 MIGRATION — delete these three with legacy_3_1_9.js.
                    legacyPass: false,   // read mode: sweeping own builds for the old carrier
                    fromLegacy: false,   // the applied token came from a category name
                    silent: false,       // write mode: a migration, so answer no bridge
                    foundToken: ""       // read mode: what we recovered
                };
            }
            _reset();

            function _reschedule(rateSec) {
                const S = QOL.core.Scheduler;
                if (_loop && _loop.stop) _loop.stop();
                _loop = (S && S.createPollLoop) ? S.createPollLoop(_tick, rateSec, "ql_build_storage") : null;
            }

            /**
             * Drive the loader overlay — READ ONLY.
             *
             * The overlay belongs to the read session. _advanceToList is shared with
             * the write machine, and while it stamped these steps unconditionally a
             * save left the panel frozen on "Reading Build Payload / Opening the build
             * browser": write's _finish has no reason to complete read steps, so it sat
             * there until the user pressed SKIP — long after the save had succeeded and
             * the hero had been switched back. That is why a working save looked like a
             * hung read. A save reports through the bridge (_writeStatus), never here.
             */
            function _setStep(key, status, detail) {
                if (_st.mode !== "read") return;
                _callQol("setSettingsLoaderStepState", undefined, [key, status, detail || ""]);
            }

            /**
             * Drive the SAVE overlay's checklist — WRITE ONLY.
             *
             * Write mode had no checklist calls of any kind. The plate showed
             * "Start" active and the other eight rows pending for the whole run,
             * then jumped straight to complete, so the one question it exists to
             * answer — which stage is this waiting on — it could not. Driving it
             * off _go instead of scattering calls through the machine keeps it
             * complete by construction: _go is the only way the stage changes.
             *
             * Several stages map onto one row on purpose. Everything between the
             * shop opening and the editor being ready is "preparing the build UI"
             * as far as a person watching is concerned; splitting it into six rows
             * would say less, not more.
             */
            const WRITE_STAGE_STEPS = {
                switch_hero:       [["start", "done"], ["switch_airheart", "active"]],
                confirm_hero:      [["switch_airheart", "done"], ["confirm_airheart", "active"]],
                open_shop:         [["confirm_airheart", "done"], ["prepare_build", "active"]],
                select_favorites:  [["prepare_build", "active"]],
                open_browser:      [["prepare_build", "active"]],
                await_list:        [["prepare_build", "active"]],
                pick_target:       [["prepare_build", "active"]],
                await_selected:    [["prepare_build", "active"]],
                await_editor:      [["prepare_build", "active"]],
                write_description: [["prepare_build", "done"], ["write_payload", "active"]],
                commit:            [["write_payload", "done"], ["commit_save", "active"]],
                await_commit:      [["commit_save", "active"]],
                verify:            [["commit_save", "done"], ["verify_save", "active"]]
            };

            const WRITE_STAGE_DETAIL = {
                switch_hero:       "Switching to Skyrunner",
                confirm_hero:      "Confirming Skyrunner context",
                open_shop:         "Opening the shop",
                select_favorites:  "Opening the builds tab",
                open_browser:      "Opening the build browser",
                await_list:        "Waiting for the build list to settle",
                pick_target:       "Selecting the storage build",
                await_selected:    "Waiting for the selection to register",
                await_editor:      "Opening the build editor",
                write_description: "Writing the payload into the description",
                commit:            "Saving the build",
                await_commit:      "Waiting for the save to commit",
                verify:            "Verifying the saved payload"
            };

            function _stampWriteStage(root, stage) {
                const rows = WRITE_STAGE_STEPS[stage];
                if (!rows) return;
                const detail = WRITE_STAGE_DETAIL[stage] || "";
                for (let i = 0; i < rows.length; i++) {
                    _callQol("setSaveSettingsLoaderStepState", undefined,
                        [rows[i][0], rows[i][1], i === rows.length - 1 ? detail : ""]);
                }
                // The settings-side Save button correlates on this attribute and
                // showed "SAVING" for the whole run, because the only status the
                // write machine ever published before the terminal one was
                // "switching_to_storage_hero" — which ResolveBuildSavePendingLabel
                // does not know, so it fell through to the default label. Four and
                // a half seconds of an unchanging "SAVING" reads as a hang.
                _writeStatus(root, "pending", stage);
            }

            /** Enter a stage and stamp when its wait started, for the timeout bound. */
            function _go(stage, now, delayMs) {
                // One line per TRANSITION, with the time the previous stage actually
                // took. Not per tick: the loop runs at 5Hz and $.Msg is not free, so a
                // per-tick trace would move the very timings it exists to measure.
                //
                // Always on, deliberately. The whole round trip used to leave six lines
                // in a 2078-line engine log, so every in-game failure cost a repack and
                // a play session and came back with nothing to read. Fifteen lines per
                // run turns "it didn't work" into "await_list waited 12s and gave up".
                if (_st.stage && _st.stage !== stage) {
                    _log("stage: " + (_st.mode || "?") + " " + _st.stage + " -> " + stage +
                         " after " + Math.round(now - (_st.stageAt || now)) + "ms");
                }
                _st.stage = stage;
                _st.stageAt = now;
                _st.nextAt = now + (delayMs === undefined ? STEP_MS : delayMs);
                // Not for a silent write. A 3.1.9 migration flips mode to "write"
                // without ever beginning a save session (manifest.js:1548-1552),
                // and _SetLoaderStepState turns a session on as a side effect of
                // any "active" step (ql_core.js:5145-5150) — so stamping here would
                // put a "QOLLOCK SAVING..." plate on screen for a save the user
                // never asked for. _writeStatus guards on the same flag.
                if (_st.mode === "write" && !_st.silent) _stampWriteStage(_root(), stage);
            }

            function _expired(now, budgetMs) {
                return (now - (_st.stageAt || now)) > budgetMs;
            }

            /**
             * Record how conclusive the read was, for the save-side overwrite guard.
             *
             * "loaded" must mean one of exactly two things: we read our payload, or
             * we proved there is nothing to read. Anything else is "failed", because
             * a storage build we could not read may hold real config, and saving over
             * it destroys settings silently. `sweptAll` is the proof for the second
             * case: every candidate in a settled list was visited.
             */
            function _recordLoadState(code, detail) {
                let loadState = "failed";
                let why = "";
                if (code === "success") {
                    loadState = "loaded";
                    why = "payload applied";
                } else if (code === "default") {
                    if (!_st.sawAnyBuild) {
                        loadState = "loaded";
                        why = "storage was empty";
                    } else if (_st.sweptAll) {
                        loadState = "loaded";
                        why = "visited every candidate, none carried a payload";
                    } else {
                        why = "read did not complete";
                    }
                }
                try {
                    const State = QOL.state;
                    if (State) {
                        State.configLoadState = loadState;
                        State.configLoadStateDetail = String(detail || code || "");
                        State.configLoadStateAtMs = _now();
                    }
                } catch(e) {}
                _log("configLoadState=" + loadState + " (result=" + code + ", " + why + ")");
            }

            /**
             * Every panel the settings context might read the bridge from.
             *
             * ql_settings.js:1745-1760 ReadBuildSaveStatus prefers FindRootPanel()
             * — the ABSOLUTE root — and only falls back to its own context panel.
             * Writing to $.GetContextPanel() alone therefore left the settings UI
             * showing "pending" forever on a save that had already succeeded, which
             * is precisely the "it says it failed but the file is on disk" class of
             * bug. QueueBuildSaveRequest writes both surfaces, so both are answered.
             */
            function _bridgeSurfaces(root) {
                const out = [];
                if (root && root.SetAttributeString) out.push(root);
                try {
                    const ui = $.GetContextPanel ? $.GetContextPanel() : null;
                    if (ui && ui.SetAttributeString && out.indexOf(ui) === -1) out.push(ui);
                } catch(e) {}
                // Walk to the absolute root; that is what FindRootPanel() returns.
                let node = root;
                let guard = 0;
                while (node && guard < 24) {
                    let parent = null;
                    try { parent = node.GetParent ? node.GetParent() : null; } catch(e) { parent = null; }
                    if (!parent) break;
                    node = parent;
                    guard++;
                }
                if (node && node.SetAttributeString && out.indexOf(node) === -1) out.push(node);
                return out;
            }

            function _writeStatus(root, state, msg) {
                // 3.1.9 MIGRATION — remove this guard with legacy_3_1_9.js.
                // A migration write is nobody's request. The settings UI correlates
                // a save by the request token it sent, so publishing a state with no
                // token would surface as an unexplained "success"/"failed" against
                // whatever it last asked for.
                if (_st.silent) return;
                const panels = _bridgeSurfaces(root);
                for (let i = 0; i < panels.length; i++) {
                    try {
                        panels[i].SetAttributeString(BRIDGE_STATE, String(state));
                        panels[i].SetAttributeString(BRIDGE_MSG, String(msg || ""));
                        if (_st.requestToken) panels[i].SetAttributeString(BRIDGE_TOKEN, _st.requestToken);
                    } catch(e) {}
                }
            }

            function _clearRequest(root) {
                const panels = _bridgeSurfaces(root);
                for (let i = 0; i < panels.length; i++) {
                    try {
                        panels[i].SetAttributeString(BRIDGE_REQUEST, "");
                        // The token goes too. It is the settings context's to write,
                        // but _writeStatus echoes it onto every surface — including
                        // #Hud, which the settings side never writes and cannot
                        // correct. _readBridge returns the first non-empty surface, so
                        // #Hud kept answering with the FIRST save's token forever, and
                        // BeginSaveSettingsLoaderSession refuses a token it has
                        // already completed (ql_core.js:5111-5116). Every save after
                        // the first therefore ran with no session and no plate: the
                        // overlay only appeared at the end, off the one-second hold
                        // window that FinalizeSaveSettingsLoaderSession opens.
                        //
                        // The settings-side watcher treats an empty token as a match
                        // (ql_settings.js:1813), so clearing it does not break the
                        // correlation of the terminal status it is waiting on.
                        panels[i].SetAttributeString(BRIDGE_TOKEN, "");
                    } catch(e) {}
                }
            }

            /**
             * Terminal path for both modes.
             *
             * The hero is restored on EVERY exit, including failures — restoring
             * only on the success stage leaks a switched hero whenever anything
             * goes wrong, which strands the player on the storage hero.
             */
            /**
             * Report the outcome of a read to everything that is waiting on one.
             *
             * Split out of _finish so the 3.1.9 migration can say "the config is
             * loaded" and then keep the session alive to re-home it, instead of
             * tearing everything down and paying for a second round trip. Only ever
             * called while mode is still "read" — _setStep is a no-op otherwise.
             */
            function _reportReadOutcome(code, detail) {
                _recordLoadState(code, detail);
                _setStep("decode_payload", code === "success" ? "done" : "skipped", "");
                _setStep("apply_config", code === "success" ? "done" : "skipped", detail || "");
                _setStep("return_hero", "done", _st.returnHero || "");
                _setStep("complete", code === "success" ? "done" : "skipped", detail || "");
                
                // Do not finalize the session yet if we are migrating. If we do, ql_core.js
                // will close the browser and shop popup, which breaks the subsequent write pass.
                if (!(code === "success" && _st.fromLegacy && _st.mode === "read")) {
                    _callQol("finalizeSettingsLoaderSession", undefined, [code, detail || "", _now()]);
                }

                // The read's own terminal line belongs here, not in _finish. A 3.1.9
                // migration reports its read outcome and then keeps the session alive
                // to re-home the token, so a line emitted from _finish would never be
                // written for the one path where knowing the read succeeded matters
                // most — and it is the only trace saying which carrier the config came
                // from.
                _log("read: " + code + " — " + (detail || ""));
            }

            /**
             * Capture where to put the player back, once, at the top of a run.
             *
             * Logged here rather than at the restore. bridge:SwitchHero already
             * traces the hero going back, but by then the decision is made and the
             * trace cannot say whether it came from the live HUD or from a stale
             * dropdown — which is precisely the distinction the 2026-09-05 save
             * failure turned on.
             */
            function _captureReturnHero(root) {
                const r = _resolveReturnHero(ctx, root);
                _st.returnHero = r.hero;
                _st.returnHeroSource = r.source;
                _log("returnHero=" + r.hero + " via " + r.source);
                return r.hero;
            }

            function _finish(root, code, detail) {
                // Tear the machinery down while it is still dimmed, and restore
                // opacity as the very last act. Both halves of that order matter: the
                // user never sees the popup being dismissed or the shop closing, and
                // the un-dim runs unconditionally afterwards so no failure path can
                // leave a panel stranded at HIDE_OPACITY. An invisible shop left
                // behind is worse than the popup ever was — nothing on screen would
                // tell the user the game is stuck. Dimming to 0.02 rather than 0.01 is
                // what keeps the activations below legal at all: IsPanelSuppressedMaybe
                // (ql_core.js:2645-2651) counts <= 0.01 as hidden, and
                // ActivatePanelSafe refuses a button it reads as hidden.
                //
                // Close the browser popup first. WE opened it — the new carrier
                // (Label.BuildDescription) lives under #BuildDetails, which only exists
                // inside the browser popup, so reaching the payload REQUIRES the popup.
                // The old category-name carrier lived in the shop panel
                if (_closeBrowse(root)) {
                    _st.browsePressedAt = 0;
                }
                if (_st.editPressedAt && _isEditing(root)) {
                    _triggerDiscard(root);
                    _st.editPressedAt = 0;
                }
                // A press already fired but not yet honoured has nothing to close YET —
                // the client honours it editModeMs / browseRevealMs later, which on a
                // loaded machine is seconds. Keep watching for that long so whatever
                // opens gets closed the moment it appears, instead of landing on a
                // player whose run is already over. Costs one tick per pass and nothing
                // at all when no press was outstanding.
                if (_st.editPressedAt) _st.owesEditorClose = true;
                const lastPress = Math.max(_st.browsePressedAt || 0, _st.editPressedAt || 0);
                _st.sweepUntil = (lastPress && (_now() - lastPress) < CLEANUP_SWEEP_MS)
                    ? lastPress + CLEANUP_SWEEP_MS
                    : 0;
                // Close the shop only when WE opened it. shopCmdSent is exactly that
                // fact: the toggle is fired once, in open_shop, and only when the shop
                // was shut. A shop the user already had open is theirs to keep.
                //
                // Nothing here closed the shop before this, and the run still ended
                // tidy — by accident, which is the worst way for it to be true.
                // _returnHero below eventually reaches QueueShopPulseAfterHeroRestore
                // (ql_core.js:9196), and that old-pipeline helper closes the shop,
                // RE-OPENS it, then closes it again 0.05s later (ql_core.js:6490-6560).
                // By that point opacity has been restored, so its re-open is a
                // full-brightness flash of the very shop this run spent its whole life
                // hiding. Owning the close leaves the pulse nothing to do.
                if (_st.shopCmdSent) _closeShop(root);
                _setHidden(root, false);
                if (_st.didSwitch) {
                    // Disarm before queueing: the restore is what eventually reaches
                    // the pulse, so the stamp has to be in place first.
                    _suppressShopPulse();
                    // No late _resolveReturnHero fallback here. didSwitch is only
                    // ever set after a run began, and every run begins by capturing
                    // the hero, so an empty value at this point would mean the
                    // capture itself failed — and resolving NOW reads a HUD that has
                    // already been switched to Skyrunner, which _liveHero refuses,
                    // so the "fallback" is just the stale dropdown wearing a
                    // different hat. FALLBACK_HERO is at least honest about being a
                    // guess.
                    _returnHero(_st.returnHero || FALLBACK_HERO);
                }
                if (_st.mode === "read") {
                    _reportReadOutcome(code, detail);
                } else if (_st.mode === "write") {
                    _writeStatus(root, code === "success" ? "success" : "failed", detail || "");
                    _callQol("finalizeSaveSettingsLoaderSession", undefined, [
                        code === "success" ? "success" : "failed",
                        detail || "",
                        _now(),
                        _st.didSwitch
                    ]);
                    
                    if (_st.fromLegacy) {
                        _callQol("finalizeSettingsLoaderSession", undefined, [
                            code === "success" ? "success" : "failed",
                            detail || "",
                            _now()
                        ]);
                    }
                    
                    // 3.1.9 MIGRATION — remove this guard with legacy_3_1_9.js.
                    // A migration write has no request of its own to clear, and the
                    // attribute it would clear may by then hold a REAL save the user
                    // queued while the migration was running. Clearing it would drop
                    // that save on the floor.
                    if (!_st.silent) _clearRequest(root);
                    _log("write: " + code + " — " + (detail || ""));
                }
                _st.stage = "done";
                // Faster than dormant while a late popup may still be coming: at the
                // dormant rate the player would stare at it for up to a second.
                _reschedule(_st.sweepUntil ? ACTIVE_RATE_SEC : DORMANT_RATE_SEC);
            }

            // ── Shared: get to the storage hero with the browser list settled ──
            /**
             * Press Browse and remember that we did.
             *
             * The popup does not inflate on the press — it appears browseRevealMs
             * later, and on a loaded machine that is seconds. So a press outlives the
             * tick that made it, and if the run ends in between, _finish's
             * _closeBrowse finds nothing to close and the popup arrives on the
             * player's screen with the run already over and nobody left to dismiss
             * it. Modal, and only Cancel closes it. The stamp is what lets _finish
             * tell "no popup, nothing to do" apart from "no popup YET".
             *
             * Pressed at most once per REPRESS_MS, for the same reason the shop
             * toggle is fired once: the waiting stages call this every STEP_MS, and
             * every press queues its own reveal. The fuzzer showed what that costs —
             * with an 11.7s reveal, ~20 popups came back one after another and the
             * post-run sweep dismissed each only for the next to appear (seed 54).
             * One press already covers every copy of the button (_pressBrowse), so
             * re-pressing on the next tick buys nothing that waiting does not.
             */
            function _openBrowse(root) {
                const now = _now();
                if (_st.browsePressedAt && (now - _st.browsePressedAt) < REPRESS_MS) {
                    return true;
                }
                _st.browsePressedAt = now;
                return _pressBrowse(root);
            }

            /**
             * Open the editor, at most once per REPRESS_MS.
             *
             * Entering edit mode makes the client SEED the edit fields from the build
             * (buildDescEntry.text = build.description), and that seeding lands when
             * the editor opens, not when the button is pressed. await_editor was
             * pressing every STEP_MS while waiting for gEditingBuilds, so a run
             * queued four opens, typed its token into the field the first one
             * produced, and then watched the other three overwrite it with the
             * build's empty description. The commit saved 0 chars and the pipeline
             * reported "save not confirmed by the build (details read back 0 chars)"
             * — the same line the user hit in-game 2026-08-25, and the single largest
             * cause of write failure: 48 of 59 on a fast machine with no sabotage at
             * all (fuzzer seed 52).
             */
            function _openEditor(root) {
                const now = _now();
                if (_st.editPressedAt && (now - _st.editPressedAt) < REPRESS_MS) {
                    return true;
                }
                _st.editPressedAt = now;
                return _triggerEdit(root);
            }

            /** Commit, at most once per REPRESS_MS. Each press commits again. */
            function _pressSave(root) {
                const now = _now();
                if (_st.savePressedAt && (now - _st.savePressedAt) < REPRESS_MS) {
                    return true;
                }
                _st.savePressedAt = now;
                return _triggerSave(root);
            }


            /**
             * Returns "wait" (call again later), "ready", or "fail".
             * Every wait here is gated on a client-set class.
             *
             * Stages past await_list belong to the read/write machines, so this
             * reports "ready" for anything it does not own — falling through to
             * "fail" instead meant the very first post-list tick aborted the whole
             * run with "could not reach the build list", after the list had already
             * been reached and enumerated.
             */
            /**
             * Record WHY the gate gave up, then say so.
             *
             * Every "fail" out of _advanceToList used to reach the same three call
             * sites, which all logged the literal string "could not reach the build
             * list". That is true of exactly one of the six ways this can fail. Both
             * 2026-09-05 reports died in confirm_hero and both blamed the list, so
             * the reports pointed at the list machinery for a hero-switch problem.
             */
            function _gateFail(reason) {
                _st.gateFail = String(reason || "");
                return "fail";
            }

            function _advanceToList(root, now) {
                switch (_st.stage) {
                    case "switch_hero":
                        // Recorded BEFORE anything of ours touches the shop, because
                        // "was it already open?" decides whether it has to be rebound
                        // later (see open_shop). Nothing before this stage opens or
                        // closes it, so this is the honest reading.
                        _st.shopWasOpen = _isShopOpen(root);
                        if (!_switchToStorageHero()) {
                            return _gateFail("hero switch to " + STORAGE_HERO + " was refused");
                        }
                        _st.didSwitch = true;
                        // Overlay step keys come from ql_core.js:535 — the historical
                        // names say "airheart" where the hero is now Skyrunner.
                        _setStep("switch_airheart", "done", "");
                        _setStep("confirm_airheart", "active", "Confirming Skyrunner");
                        _go("confirm_hero", now, SETTLE_MS);
                        return "wait";

                    case "confirm_hero": {
                        const res = _confirmStorageHero(root, now);
                        // Carried so the timeout below can name the LAST thing the
                        // HUD said, which is the whole diagnosis: "signature HUD not
                        // found" and "slot 1 says Billy's ability" are different bugs
                        // with different fixes and used to produce identical reports.
                        _st.confirmDetail = res.detail || "";
                        if (res.confirmed) {
                            _log("confirm: " + STORAGE_HERO + " — " + (res.detail || "ok"));
                            _setStep("confirm_airheart", "done", "");
                            _setStep("read_payload", "active", "Opening the build browser");
                            _go("open_shop", now);
                            return "wait";
                        }
                        if (_expired(now, CONFIRM_TIMEOUT_MS)) {
                            return _gateFail("hero switch never took: " +
                                (_st.confirmDetail || "no signature reading at all"));
                        }
                        _st.nextAt = now + STEP_MS;
                        return "wait";
                    }

                    case "open_shop":
                        // A shop that was ALREADY open when the run began was inflated
                        // for the previous hero, and switching hero underneath it does
                        // not rebind it: #HeroBuildList keeps answering for whoever the
                        // panel was built with. On 2026-09-05 that produced the worst
                        // possible version of this failure — the confirm stage correctly
                        // saw Skyrunner on the ability HUD, the browser correctly
                        // opened, and the eleven rows inside it were all Billy's builds.
                        // The run then concluded the account had no QOLLOCK-Settings
                        // build and applied defaults, which is what authorises a save to
                        // overwrite the real ones.
                        //
                        // Close it once and let the normal open below rebuild it against
                        // the hero we just switched to. Costs a visible shop close on the
                        // one path where the shop was already up; the alternative is
                        // reading another hero's builds and believing them.
                        if (_st.shopWasOpen && !_st.shopRebindClosed) {
                            _st.shopRebindClosed = true;
                            _log("shop was already open — closing it so it rebinds to " + STORAGE_HERO);
                            _closeShop(root);
                            _st.nextAt = now + STEP_MS;
                            return "wait";
                        }
                        if (!_isShopOpen(root)) {
                            // Fire once, then only ever wait on the class. Re-sending
                            // a toggle closes what the previous tick opened, which is
                            // why a retry loop can never win on a slow machine.
                            if (!_st.shopCmdSent) {
                                _st.shopCmdSent = true;
                                _fireShopOpen();
                            }
                            if (_expired(now, SHOP_OPEN_TIMEOUT_MS)) {
                                return _gateFail("shop never opened (gShopOpen stayed clear after " +
                                    SHOP_OPEN_CMD + ")");
                            }
                            _st.nextAt = now + STEP_MS;
                            return "wait";
                        }
                        _go("select_favorites", now);
                        return "wait";

                    case "select_favorites":
                        // The shop is open, but BrowseBuildsButton only works under
                        // the Favorites tab (citadel_hud_hero_shop.css:1002 reveals
                        // #ShopModsSelectedBuild there and nowhere else). A shop that
                        // reopened on a remembered Weapon/Armor/Tech tab has a Browse
                        // button that is present but transparent and inert, and the
                        // run hangs at "Opening the build browser" until it times out
                        // — the 2026-09-06 report. Nudge the tab, then wait for the
                        // class to confirm.
                        if (_isFavoritesTab(root)) {
                            _go("open_browser", now);
                            return "wait";
                        }
                        if (!_st.favPressedAt || (now - _st.favPressedAt) >= REPRESS_MS) {
                            _st.favPressedAt = now;
                            _selectFavoritesTab(root);
                        }
                        // Best-effort, not a hard gate: proceed if the class never
                        // shows so a client that renders builds without it is not
                        // bricked. open_browser is the real gate — if Browse truly
                        // cannot be reached it fails there, with an honest message.
                        if (_expired(now, FAVORITES_CONFIRM_MS)) {
                            _log("favorites tab not confirmed after " + FAVORITES_CONFIRM_MS +
                                 "ms — proceeding, open_browser will be the gate");
                            _go("open_browser", now);
                            return "wait";
                        }
                        _st.nextAt = now + STEP_MS;
                        return "wait";

                    case "open_browser":
                        if (!_isBrowseOpen(root)) {
                            if (_expired(now, BROWSER_OPEN_TIMEOUT_MS)) {
                                return _gateFail("build browser popup never opened");
                            }
                            _openBrowse(root);
                            _st.nextAt = now + STEP_MS;
                            return "wait";
                        }
                        _go("await_list", now);
                        return "wait";

                    case "await_list": {
                        // BuildsLoading is the GC gate. Nothing about the list means
                        // anything while it is set — an empty list here is just an
                        // unfinished round trip.
                        //
                        // Its ABSENCE is ambiguous, which is the part worth guarding: a
                        // selector that has not been created yet carries no class either,
                        // so "gate clear" and "panel not there" are indistinguishable.
                        // Reading 0 items in that state produces a CONCLUSIVE "storage
                        // was empty" (_recordLoadState), and that is exactly what
                        // authorizes a save to overwrite — the one wrong answer that
                        // loses a user's settings instead of just failing. Require
                        // positive evidence: selector present, gate clear, count settled.
                        //
                        // Not the cause of any observed failure — in the 2026-08-24 logs
                        // the account genuinely had no builds and 0 was the right answer.
                        // This is here because that conflation has already destroyed data
                        // once through the prune path.
                        const selector = _find(root, PID_SELECTOR);
                        if (!_alive(selector) || _isListLoading(root)) {
                            if (_expired(now, LOADING_TIMEOUT_MS)) {
                                return _gateFail(_alive(selector)
                                    ? "build list never finished loading (BuildsLoading held)"
                                    : "#" + PID_SELECTOR + " never appeared");
                            }
                            _st.nextAt = now + STEP_MS;
                            return "wait";
                        }
                        const count = _listItems(root).length;
                        if (count !== _st.listCount) {
                            _st.listCount = count;
                            _st.listStableHits = 0;
                        } else {
                            _st.listStableHits++;
                        }
                        if (_st.listStableHits < LIST_STABLE_HITS) {
                            if (_expired(now, LOADING_TIMEOUT_MS)) {
                                return _gateFail("build list row count never settled (last " +
                                    count + ")");
                            }
                            _st.nextAt = now + STEP_MS;
                            return "wait";
                        }
                        // Whose builds are these? Defence in depth behind the shop
                        // rebind in open_shop: that fix removes the cause, this one
                        // refuses to act on the symptom if it ever returns by another
                        // route. Only a POSITIVE disagreement fails — a client that
                        // will not tell us the hero is left alone, because failing on
                        // silence would break every load on a tree where these panels
                        // carry no hero token, and no in-game evidence says whether
                        // that is common. The reading is logged either way
                        // (_collectCandidates), so the next report answers it.
                        const lh = _listHero(root);
                        if (lh.hero && lh.hero !== STORAGE_HERO) {
                            if (_expired(now, LOADING_TIMEOUT_MS)) {
                                return _gateFail("build list belongs to " + lh.hero +
                                    " (via " + lh.source + "), not " + STORAGE_HERO +
                                    " — refusing to read another hero's builds");
                            }
                            _st.nextAt = now + STEP_MS;
                            return "wait";
                        }
                        return "ready";
                    }
                }
                // Not one of this helper's stages — the read/write machine owns it.
                return "ready";
            }

            /**
             * Collect the rows worth clicking.
             *
             * Filtering by name is free — Label.BuildName holds the literal string —
             * so a player with thirty builds costs one click, not thirty.
             *
             * Returns INDICES, never panels. Selecting a build makes the client
             * rebuild #HeroBuildList, so any panel reference held across a tick is
             * already dangling by the time it is used. Holding them meant every
             * candidate read as dead, the cursor ran to the end without a single
             * click, and the sweep reported "none carried a payload" — a false
             * "storage is empty" that would then authorize overwriting real config.
             */
            function _candidateIndices(root) {
                const items = _listItems(root);
                const out = [];
                // 3.1.9 MIGRATION — remove this branch with legacy_3_1_9.js.
                // The legacy pass cannot filter by name: main never sets one
                // ("BuildNameTextEntry" appears 0 times in main), so a 3.1.9 build
                // is called whatever the client called it. Its only filter is
                // "mine" — #HeroBuildList carries other players' public builds too
                // and the tabs merely hide them with CSS.
                if (_st.legacyPass) {
                    const L = _legacy();
                    for (let i = 0; i < items.length; i++) {
                        if (L && L.isOwnBuildRow(items[i])) out.push(i);
                    }
                    return { total: items.length, indices: out };
                }
                for (let i = 0; i < items.length; i++) {
                    if (_itemName(items[i]) === BUILD_NAME) out.push(i);
                }
                return { total: items.length, indices: out };
            }

            /** Re-resolve one candidate row by its position in the live list. */
            function _candidateAt(root, cursor) {
                const items = _listItems(root);
                const found = _candidateIndices(root);
                if (cursor < 0 || cursor >= found.indices.length) return null;
                const idx = found.indices[cursor];
                return (idx >= 0 && idx < items.length) ? items[idx] : null;
            }

            /**
             * Which hero the client currently believes it is showing builds for.
             *
             * ResolveBuildSaveStorageHeroSignal (ql_core.js:9124) reads it off the
             * shop and build panels — #CitadelHudHeroBuilds, #HeroBuildSelector,
             * .shopModsBuild — which is a DIFFERENT surface from the signature
             * abilities the confirm stage watches. On 2026-09-05 those two disagreed:
             * the player HUD had flipped to Skyrunner (Flakshot read cleanly) while
             * the browser popup was still listing eleven Billy builds, so the run
             * concluded the account had no settings build and applied defaults.
             */
            function _listHero(root) {
                const sig = _callQol("resolveBuildSaveStorageHeroSignal",
                                     { hero: "", source: "none" }, [root]) || {};
                return {
                    hero: String(sig.hero || ""),
                    source: String(sig.source || "none")
                };
            }

            function _collectCandidates(root) {
                const found = _candidateIndices(root);
                _st.sawAnyBuild = found.total > 0;
                _st.candidateCount = found.indices.length;
                _st.cursor = 0;
                const lh = _listHero(root);
                _log("list: " + found.total + " build(s), " + found.indices.length +
                     (_st.legacyPass ? " of them mine (3.1.9 sweep)" : " named " + BUILD_NAME) +
                     " | listHero=" + (lh.hero || "?") + " via " + lh.source +
                     " (want " + STORAGE_HERO + ")");
                // Names, but only when nothing matched. A run that found its build
                // needs no inventory; a run that found NOTHING is about to decide the
                // account has no settings, and the names are what says whether that is
                // true. Both 2026-09-05 reports logged "0 named QOLLOCK-Settings" over
                // a list of Billy builds, and the row names alone would have named the
                // bug — instead it took the screen recording to see it.
                if (found.indices.length === 0 && found.total > 0) {
                    const items = _listItems(root);
                    const names = [];
                    for (let i = 0; i < items.length && i < LIST_NAME_LOG_MAX; i++) {
                        names.push(_itemName(items[i]) || "?");
                    }
                    _log("list rows: " + names.join(" / ") +
                         (items.length > LIST_NAME_LOG_MAX ? " / +" + (items.length - LIST_NAME_LOG_MAX) + " more" : ""));
                }
                // Once per run, here: this is the first moment everything the round trip
                // depends on exists at the same time — popup inflated, list replied,
                // details pane built — so it is the only point where a snapshot is worth
                // anything. Guarded because the 3.1.9 sweep collects a second time and
                // the tree has not changed in between.
                if (!_st.treeReported) {
                    _st.treeReported = true;
                    _reportTree(root, _st.mode || "run");
                }
            }

            // ── READ ──
            function _tickRead(root, now) {
                const gate = _advanceToList(root, now);
                if (gate === "fail") { _finish(root, "failed", _st.gateFail || "could not reach the build list"); return; }
                if (gate === "wait") return;

                switch (_st.stage) {
                    case "await_list":
                        _collectCandidates(root);
                        _setStep("read_payload", "active", "Scanning " + _st.candidateCount + " candidate build(s)");
                        _go("select_candidate", now, 0);
                        return;

                    case "select_candidate": {
                        if (_st.cursor >= _st.candidateCount) {
                            // 3.1.9 MIGRATION — remove this block with legacy_3_1_9.js.
                            // Before declaring the storage empty, sweep the player's
                            // OWN builds for the old category-name carrier. This has
                            // to happen here and not later: the "default" result below
                            // becomes configLoadState=loaded, which is precisely what
                            // authorizes the next save to overwrite. A 3.1.9 user's
                            // config would be declared absent and then destroyed.
                            //
                            // Runs at most once per session and only when the fast
                            // path came back empty-handed, so a migrated user (named
                            // build, token in the description) never pays for it.
                            if (!_st.legacyPass && _legacy()) {
                                _st.legacyPass = true;
                                _collectCandidates(root);
                                if (_st.candidateCount > 0) {
                                    _setStep("read_payload", "active",
                                             "Checking " + _st.candidateCount + " build(s) for a 3.1.9 config");
                                    _go("select_candidate", now, 0);
                                    return;
                                }
                            }
                            // Every candidate visited and none held a token. That is
                            // conclusive, which is what lets a first save proceed.
                            _st.sweptAll = true;
                            _finish(root, "default", "no payload in any description or 3.1.9 category name");
                            return;
                        }
                        const item = _candidateAt(root, _st.cursor);
                        if (!_alive(item)) { _st.cursor++; _st.nextAt = now; return; }
                        // Already selected (the client preselects one) — read it
                        // without spending a click.
                        if (!_hasClass(item, CLASS_SELECTED)) _activate(item);
                        _go("read_description", now);
                        return;
                    }

                    case "read_description": {
                        const item = _candidateAt(root, _st.cursor);
                        if (!_alive(item)) { _st.cursor++; _go("select_candidate", now, 0); return; }
                        // Wait for the client to mark the row Selected — #BuildDetails
                        // only follows once it has.
                        if (!_hasClass(item, CLASS_SELECTED)) {
                            if (_expired(now, SELECT_TIMEOUT_MS)) {
                                _log("read: candidate " + _st.cursor + " never became Selected, skipping");
                                _st.cursor++;
                                _go("select_candidate", now, 0);
                                return;
                            }
                            _activate(item);
                            _st.nextAt = now + STEP_MS;
                            return;
                        }
                        let token = _extractToken(_selectedDescription(root));
                        // 3.1.9 MIGRATION — remove with legacy_3_1_9.js.
                        // Tried on EVERY candidate, not only during the legacy pass:
                        // a user whose build got named by 3.2.0 but never saved still
                        // has an empty description and the token in the category. The
                        // description wins when both hold one — it is the newer write.
                        if (!token) {
                            const L = _legacy();
                            const legacyToken = L ? L.readCategoryToken(root) : "";
                            if (legacyToken) {
                                token = legacyToken;
                                _st.fromLegacy = true;
                                _log("read: found a 3.1.9 token in the category name of candidate " + _st.cursor);
                            }
                        }
                        if (!token) {
                            _st.cursor++;
                            _go("select_candidate", now, 0);
                            return;
                        }
                        _st.foundToken = token;
                        _setStep("decode_payload", "active", "Decoding");
                        _go("apply", now, 0);
                        return;
                    }

                    case "apply": {
                        const decoded = _decodeToken(_st.foundToken);
                        if (!decoded.ok) {
                            // Corrupt, and deliberately not fatal: the next save
                            // overwrites the description wholesale, so there is
                            // nothing to repair and no build to delete. Keep scanning
                            // in case another candidate carries a good token.
                            _log("read: corrupt token on candidate " + _st.cursor +
                                 " (" + decoded.error + ") — will be overwritten by the next save");
                            _st.cursor++;
                            _go("select_candidate", now, 0);
                            return;
                        }
                        _applyConfig(root, decoded);
                        // 3.1.9 MIGRATION — remove this block with legacy_3_1_9.js.
                        //
                        // Hand straight over to the write machine instead of finishing
                        // and queueing a second run. The first version did queue, and
                        // the fuzzer's post-conclusion shop-open check is what argued
                        // it down: a queued migration means the hero switch, the shop
                        // and the browser all happen TWICE on the first launch after
                        // upgrading — the exact visible churn this pipeline is being
                        // cleaned up to remove.
                        //
                        // Nothing needs setting up. We are already on the storage hero
                        // with the shop open, the browser open and the list settled;
                        // didSwitch and shopCmdSent stay as they are so the write's own
                        // _finish still performs exactly one teardown. The read's
                        // outcome is reported first, while mode is still "read", so the
                        // settings loader completes when the config actually goes live
                        // rather than after the extra editor trip.
                        if (_st.fromLegacy) {
                            _reportReadOutcome("success", "payload applied from 3.1.9 category name");
                            _log("read: 3.1.9 config recovered — re-homing it into the description");
                            _st.mode = "write";
                            _st.silent = true;          // nobody asked; answer no bridge
                            _st.token = _st.foundToken;
                            // Back to the named-candidate view: the migration writes to
                            // the 3.2.0 build, creating it if absent. The old build is
                            // left untouched, which is what keeps a 3.1.9 rollback
                            // working and the migration repeatable.
                            _st.legacyPass = false;
                            _st.targetChosen = false;
                            _st.createdBuild = false;
                            _st.cursor = 0;
                            _st.listCount = -1;
                            _st.listStableHits = 0;
                            _st.startedAt = now;        // its own overall-timeout budget
                            _go("await_list", now, 0);
                            return;
                        }
                        _finish(root, "success", "payload applied from build description");
                        return;
                    }
                }
            }

            function _decodeToken(rawText) {
                const m = /^\[QOL-(\d+-\d+-\d+)\]:([A-Za-z0-9\-_]+)$/i.exec(String(rawText || ""));
                if (!m) return { ok: false, error: "malformed" };
                const schemaVer = String(m[1] || "").replace(/-/g, ".");
                const payload = String(m[2] || "");
                // QOL.compactSchemaRegistry is a value, not a function.
                const registry = _qol("compactSchemaRegistry");
                if (registry && typeof registry === "object" &&
                    !Object.prototype.hasOwnProperty.call(registry, schemaVer)) {
                    return { ok: false, error: "unsupported_schema:" + schemaVer };
                }
                const binary = _callQol("buildPayloadFromBase64Url", null, [payload]);
                if (!binary) return { ok: false, error: "base64" };
                const parsed = _callQol("deserializeBuildPayloadCompact", null, [binary, schemaVer]);
                if (!parsed || typeof parsed !== "object") return { ok: false, error: "deserialize" };
                return { ok: true, parsed: parsed, schemaVersion: schemaVer };
            }

            /**
             * Merge the decoded payload over defaults and hand it to the runtime.
             *
             * Order mirrors the established loader: raw -> defaults overwrite ->
             * payload -> normalize chain -> the two migrations mergeConfig does not
             * run. Those migrations mutate in place and return undefined, so their
             * results must not be reassigned.
             */
            function _applyConfig(root, decoded) {
                let rawCfg = {};
                try {
                    const State = QOL.state;
                    if (State && State.lastConfig) rawCfg = State.lastConfig;
                } catch(e) {}

                const base = _callQol("buildDefaultConfig", {}, []) || {};
                let merged = {};
                for (const k in rawCfg) {
                    if (Object.prototype.hasOwnProperty.call(rawCfg, k)) merged[k] = rawCfg[k];
                }
                for (const k in base) {
                    if (Object.prototype.hasOwnProperty.call(base, k)) merged[k] = base[k];
                }
                for (const k in decoded.parsed) {
                    if (Object.prototype.hasOwnProperty.call(decoded.parsed, k)) merged[k] = decoded.parsed[k];
                }
                // UI-only keys live in the raw config, never in the payload.
                if (Object.prototype.hasOwnProperty.call(rawCfg, "DRAG_ENABLED")) merged.DRAG_ENABLED = rawCfg.DRAG_ENABLED;
                if (Object.prototype.hasOwnProperty.call(rawCfg, "PREVIEWS_ENABLED")) merged.PREVIEWS_ENABLED = rawCfg.PREVIEWS_ENABLED;

                merged = _callQol("mergeConfig", merged, [merged]) || merged;

                const cfn = _qol("normalizeCompassSpeedSchemaMigration");
                if (typeof cfn === "function") { try { cfn(merged, decoded.parsed, decoded.schemaVersion); } catch(e) {} }
                const lfn = _qol("normalizeLanguageSchemaMigration");
                if (typeof lfn === "function") { try { lfn(merged, decoded.parsed, decoded.schemaVersion); } catch(e) {} }

                let wrapped = merged;
                try {
                    if (typeof WrapConfigForStorage === "function") wrapped = WrapConfigForStorage(merged);
                } catch(e) { wrapped = merged; }

                // DELIBERATELY does not touch _st.returnHero. This used to read
                // `merged.DEFAULT_HERO || _resolveReturnHero(ctx)`, which threw away
                // the hero captured at the top of the run in favour of a value that
                // just came out of the payload. That is the same class of bug as
                // resolving the restore from the dropdown: loading a config whose
                // DEFAULT_HERO happened to be someone else moved the player onto
                // that hero. The payload says which hero OWNS the storage build; it
                // has no opinion on who the player is.
                _callQol("writeStorageConfigRawToUi", false, [root, wrapped]);
                try {
                    const State = QOL.state;
                    if (State) State.accountPresetRawOverride = wrapped;
                } catch(e) {}
            }

            // ── WRITE ──
            /**
             * Which candidate to overwrite when several carry our name.
             *
             * Valve resets build names, so the name is a filter and never an
             * identity — the token in the description is. Prefer whichever row
             * already shows one; writing to a different same-named row would leave
             * the real config sitting on a build nobody reads again. Only the
             * currently-selected row can be inspected without spending clicks, so
             * this is a cheap best-effort check that falls back to the first row.
             */
            function _pickWriteCursor(root) {
                const selfToken = _extractToken(_selectedDescription(root));
                if (selfToken) {
                    const items = _listItems(root);
                    const found = _candidateIndices(root);
                    for (let c = 0; c < found.indices.length; c++) {
                        const item = items[found.indices[c]];
                        if (_hasClass(item, CLASS_SELECTED)) return c;
                    }
                }
                return 0;
            }

            function _tickDump(root, now) {
                const gate = _advanceToList(root, now);
                if (gate === "fail") { _finish(root, "failed", _st.gateFail || "could not reach the build list"); return; }
                if (gate === "wait") return;

                switch (_st.stage) {
                    case "await_list":
                        _collectCandidates(root); // snapshot is taken here
                        _finish(root, "success", "tree dump complete");
                        return;
                }
            }

            function _tickWrite(root, now) {
                const gate = _advanceToList(root, now);
                if (gate === "fail") { _finish(root, "failed", _st.gateFail || "could not reach the build list"); return; }
                if (gate === "wait") return;

                switch (_st.stage) {
                    case "await_list":
                        _collectCandidates(root);
                        _go("pick_target", now, 0);
                        return;

                    case "pick_target": {
                        if (_st.candidateCount === 0) {
                            if (_st.createdBuild) {
                                _finish(root, "failed", "created a build but it never appeared in the list");
                                return;
                            }
                            _writeStatus(root, "pending", "creating_storage_build");
                            if (!_triggerCreate(root)) {
                                _finish(root, "failed", "CreateBuildButton unavailable");
                                return;
                            }
                            _st.createdBuild = true;
                            // A fresh build opens straight into the editor, so the
                            // name still has to be stamped before the description.
                            _go("await_editor", now, SETTLE_MS);
                            return;
                        }
                        // Prefer a candidate that already carries a token: that is the
                        // build holding the real config, and writing to a different
                        // same-named row would strand it. Falls back to the first.
                        if (!_st.targetChosen) {
                            _st.cursor = _pickWriteCursor(root);
                            _st.targetChosen = true;
                        }
                        const item = _candidateAt(root, _st.cursor);
                        if (!_alive(item)) { _finish(root, "failed", "target row vanished"); return; }
                        if (!_hasClass(item, CLASS_SELECTED)) _activate(item);
                        _go("await_selected", now);
                        return;
                    }

                    case "await_selected": {
                        const item = _candidateAt(root, _st.cursor);
                        if (!_alive(item)) { _finish(root, "failed", "target row vanished"); return; }
                        if (!_hasClass(item, CLASS_SELECTED)) {
                            if (_expired(now, SELECT_TIMEOUT_MS)) {
                                // Prefer another same-named row over guessing.
                                if (_st.cursor + 1 < _st.candidateCount) {
                                    _st.cursor++;
                                    _go("pick_target", now, 0);
                                    return;
                                }
                                _finish(root, "failed", "target never became Selected");
                                return;
                            }
                            _activate(item);
                            _st.nextAt = now + STEP_MS;
                            return;
                        }
                        // Refuse to edit a build that is not ours: CanEditBuild is the
                        // client's own answer to that question.
                        if (!_isOurBuildSelected(root)) {
                            if (_st.cursor + 1 < _st.candidateCount) {
                                _st.cursor++;
                                _go("pick_target", now, 0);
                                return;
                            }
                            _finish(root, "failed", "selected build is not editable by us");
                            return;
                        }

                        // If the text already matches, we are done!
                        const currentText = _selectedDescription(root);
                        if (_extractToken(currentText) === _st.token) {
                            _finish(root, "success", "already up to date");
                            return;
                        }

                        _writeStatus(root, "pending", "opening_edit_mode");
                        _triggerEdit(root);
                        _go("await_editor", now);
                        return;
                    }

                    case "await_editor":
                        if (!_isEditing(root)) {
                            if (_expired(now, EDITOR_TIMEOUT_MS)) {
                                _finish(root, "failed", "edit mode never opened");
                                return;
                            }
                            _openEditor(root);
                            _st.nextAt = now + STEP_MS;
                            return;
                        }
                        _go("write_description", now, 0);
                        return;

                    case "write_description": {
                        const entry = _descEntry(root);
                        if (!_alive(entry)) {
                            if (_expired(now, EDITOR_TIMEOUT_MS)) {
                                _finish(root, "failed", "no " + PID_DESC_ENTRY);
                                return;
                            }
                            _st.nextAt = now + STEP_MS;
                            return;
                        }
                        // Stamp the name first. It is only a convenience for
                        // filtering (the token in the description is the real
                        // identity), but writing it after the description would mean
                        // touching another field between the write and the commit.
                        _setEntryText(_find(root, PID_NAME_ENTRY), BUILD_NAME);
                        const dirtyText = _st.token + "\n\n[" + _now() + "]";
                        if (!_setEntryText(entry, dirtyText)) {
                            _finish(root, "failed", "description rejected the text");
                            return;
                        }
                        _writeStatus(root, "pending", "saving");
                        _log("write: put " + _st.token.length + " chars into the description");
                        _go("commit", now);
                        return;
                    }

                    case "commit": {
                        // Re-read the field we are about to commit. Entering edit mode
                        // seeds it from the build, and that seeding is asynchronous, so
                        // an open queued before we typed can land between
                        // write_description and here and silently replace our token
                        // with the build's empty description. Press-once discipline
                        // makes that rare; this makes committing 0 chars impossible,
                        // which matters more, because a wiped field commits happily and
                        // only the verify stage two steps later notices anything wrong.
                        const entry = _descEntry(root);
                        if (_alive(entry) && _extractToken(_readText(entry)) !== _st.token) {
                            if (_expired(now, EDITOR_TIMEOUT_MS)) {
                                _finish(root, "failed", "the editor kept clearing the description");
                                return;
                            }
                            _log("write: the editor cleared the description — typing it again");
                            _setEntryText(entry, _st.token);
                            _st.nextAt = now + STEP_MS;
                            return;
                        }
                        _pressSave(root);
                        _go("await_commit", now);
                        return;
                    }

                    case "await_commit":
                        // The editor closing IS the commit: only the client can clear
                        // gEditingBuilds, and SaveEdits is a no-op outside edit mode.
                        if (_isEditing(root)) {
                            if (_expired(now, COMMIT_TIMEOUT_MS)) {
                                _finish(root, "failed", "editor never closed after Save");
                                return;
                            }
                            _pressSave(root);
                            _st.nextAt = now + STEP_MS;
                            return;
                        }
                        _go("verify", now);
                        return;

                    case "verify": {
                        // Verify against the PERSISTED value, never against the field we
                        // typed into. BuildDescriptionTextEntry is the editor: it still
                        // holds our text whether or not the commit landed anywhere, so
                        // reading it back proves only that we can read our own input.
                        //
                        // Found by the fuzzer (seed 9): wipe the build list between the
                        // keystroke and the commit and the client accepts Save against a
                        // build that no longer exists — CitadelHudHeroBuildsSaveEdits
                        // clears gEditingBuilds either way — so await_commit passed, the
                        // entry still read back 214 chars, and the save reported
                        // "verified" with nothing on disk. That is precisely the
                        // "it says it saved but the data is gone" failure this carrier
                        // was chosen to eliminate.
                        //
                        // Label.BuildDescription under #BuildDetails is resolved by the
                        // client FROM THE BUILD (the same source the read path trusts),
                        // so it cannot show our token unless the build really holds it.
                        // Saving tears panels down and rebuilds them, so poll rather
                        // than deciding on the first look.
                        const persisted = _selectedDescription(root);
                        if (_extractToken(persisted) === _st.token) {
                            _finish(root, "success", "verified in the description");
                            return;
                        }
                        // The carrier is only READABLE through the browser popup, so a
                        // popup that is gone means we cannot verify — not that the save
                        // failed. Reopen and keep waiting instead of reporting a
                        // failure we have no evidence for; the write really did land in
                        // the in-game case that produced this (a first-ever save, where
                        // creating the build used to dismiss the popup).
                        //
                        // Costs a GC round trip, so the budget grows by exactly that
                        // once — tracked as a flag rather than a timestamp so a popup
                        // that keeps vanishing cannot extend the deadline forever.
                        if (!_isBrowseOpen(root)) {
                            if (!_st.verifyReopened) {
                                _st.verifyReopened = true;
                                _log("write: the browser closed before verification — reopening to read the build back");
                            }
                            // Deadline BEFORE the press, not after. The other order
                            // pressed Browse and gave up in the same tick, so the popup
                            // inflated seconds later with the run already concluded and
                            // nothing left to dismiss it — the fuzzer caught two runs
                            // ending with a modal on screen that no code owned.
                            if (_expired(now, VERIFY_TIMEOUT_MS + BROWSER_OPEN_TIMEOUT_MS + LOADING_TIMEOUT_MS)) {
                                _finish(root, "failed",
                                    "wrote the description but could not reopen the browser to confirm it");
                                return;
                            }
                            _openBrowse(root);
                            _st.nextAt = now + STEP_MS;
                            return;
                        }
                        const budget = _st.verifyReopened
                            ? (VERIFY_TIMEOUT_MS + BROWSER_OPEN_TIMEOUT_MS + LOADING_TIMEOUT_MS)
                            : VERIFY_TIMEOUT_MS;
                        if (_expired(now, budget)) {
                            // Deliberately a failure and not a shrug: an unverified save
                            // reported as success is the one outcome that loses data
                            // silently. The user can retry; a false success they cannot.
                            _finish(root, "failed",
                                "save not confirmed by the build (details read back " +
                                String(persisted).length + " chars)");
                            return;
                        }
                        // Re-select our row so #BuildDetails follows it again: the commit
                        // rebuilds the list and the details pane can be left showing
                        // nothing at all.
                        const row = _candidateAt(root, _st.cursor);
                        if (_alive(row) && !_hasClass(row, CLASS_SELECTED)) _activate(row);
                        _st.nextAt = now + STEP_MS;
                        return;
                    }
                }
            }

            // ── Request intake ──
            /**
             * A write request arrives as the payload token in QOL_BUILD_SAVE_REQUEST
             * (written by ql_settings.js:1722-1742). Refuse it when the read could
             * not conclude, unless the user has explicitly forced it — overwriting a
             * config we failed to read loses settings silently.
             */
            /**
             * Read a bridge attribute from wherever the settings context left it.
             *
             * The settings UI writes the request to its OWN context panel AND to
             * FindRootPanel() — the absolute root (ql_settings.js:1727-1741). In the
             * HUD context $.GetContextPanel() is #Hud, a CHILD of that root, and panel
             * attributes do not inherit. Reading only from `root` therefore never saw
             * a save request at all: pressing Save did nothing, not even a hero switch.
             * _writeStatus already answered all three surfaces, so this file was
             * reading one panel and writing three.
             *
             * The old path got this right without saying so: ql_core.js's root comes
             * from GetUIRoot() (ql_core.js:2210-2221), which walks to the absolute
             * root — the same panel the settings UI writes to.
             */
            function _readBridge(root, attr) {
                const panels = _bridgeSurfaces(root);
                for (let i = 0; i < panels.length; i++) {
                    try {
                        const v = String(panels[i].GetAttributeString(attr, "") || "");
                        if (v) return v;
                    } catch(e) {}
                }
                return "";
            }

            function _clearBridge(root, attr) {
                const panels = _bridgeSurfaces(root);
                for (let i = 0; i < panels.length; i++) {
                    try { panels[i].SetAttributeString(attr, ""); } catch(e) {}
                }
            }

            function _pendingWrite(root) {
                const token = _extractToken(_readBridge(root, BRIDGE_REQUEST));
                if (!token) return null;

                if (token.length > MAX_TOKEN_LEN) {
                    return { reject: "token too large for the build description (" + token.length + " chars)" };
                }

                let loadState = "pending";
                try {
                    const State = QOL.state;
                    if (State && State.configLoadState) loadState = String(State.configLoadState);
                } catch(e) {}
                if (loadState === "failed") {
                    if (_readBridge(root, BRIDGE_FORCE).trim() !== "1") {
                        return { reject: "blocked_unread_config" };
                    }
                    _clearBridge(root, BRIDGE_FORCE);
                    _log("write: force flag consumed, proceeding over an unread config");
                }
                return { token: token, requestToken: _readBridge(root, BRIDGE_TOKEN) };
            }

            function _tick() {
                try {
                    const root = _root();
                    if (!root) return;
                    if (Number(ctx.config.get("enabled")) !== 1) return;
                    const now = _now();

                    if (_st.stage !== "done" && _st.stage !== "idle" &&
                        (now - _st.startedAt) > OVERALL_TIMEOUT_MS) {
                        _finish(root, "failed", "overall timeout in stage " + _st.stage);
                        return;
                    }
                    if (_st.nextAt && now < _st.nextAt) return;

                    if (_st.stage === "idle" || _st.stage === "done") {
                        if (_readBridge(root, "QOL_BUILD_DUMP_TREE") === "1") {
                            _clearBridge(root, "QOL_BUILD_DUMP_TREE");
                            _reset();
                            _st.mode = "dump";
                            _st.startedAt = now;
                            _captureReturnHero(root);
                            _go("switch_hero", now, 0);
                            _reschedule(ACTIVE_RATE_SEC);
                            return;
                        }
                        // Finish what a late Browse press started. Only ever armed by
                        // _finish, and only when a press was still outstanding then, so
                        // an idle feature does no work here. A new run wipes it through
                        // _reset and owns the browser itself from that point.
                        if (_st.sweepUntil) {
                            if (now >= _st.sweepUntil) {
                                _st.sweepUntil = 0;
                                _reschedule(DORMANT_RATE_SEC);
                            } else if (_st.owesEditorClose && _isEditing(root)) {
                                // Same debt as the popup: an edit-open queued before we
                                // gave up lands afterwards and drops the player into a
                                // build editor they never asked for.
                                _log("cleanup: left an editor that opened after the run ended");
                                _triggerDiscard(root);
                            } else if (_isBrowseOpen(root)) {
                                // Keep sweeping rather than disarming on the first hit.
                                // A stage that waits on the popup presses Browse every
                                // STEP_MS, so several reveals can be in flight at once
                                // and closing one just lets the next one through — the
                                // fuzzer (seed 83) ended with the popup on screen after
                                // this had already dismissed it twice.
                                //
                                // Falls through rather than returning: this is cleanup,
                                // and letting it own the tick starved the state machine
                                // of the passes it needed to start the next session —
                                // four reads that used to load ended up failing.
                                _log("cleanup: dismissed a browser popup that opened after the run ended");
                                _closeBrowse(root);
                            }
                        }
                        // Writes win over reads: the user pressed Save and is waiting.
                        const req = _pendingWrite(root);
                        if (req && req.reject) {
                            _reset();
                            _st.mode = "write";
                            _st.stage = "done";
                            _writeStatus(root, "failed", req.reject);
                            _clearRequest(root);
                            _log("write refused: " + req.reject);
                            return;
                        }
                        if (req) {
                            _reset();
                            _st.mode = "write";
                            _st.token = req.token;
                            _st.requestToken = req.requestToken;
                            _st.startedAt = now;
                            _captureReturnHero(root);
                            _callQol("beginSaveSettingsLoaderSession", undefined, [req.requestToken, now]);
                            _writeStatus(root, "pending", "starting");
                            _go("switch_hero", now, 0);
                            _reschedule(ACTIVE_RATE_SEC);
                            return;
                        }
                        if (_st.stage === "done") return;   // read already ran
                        if (!_inHideout(root)) return;      // startup read only in the hideout
                        _reset();
                        _st.mode = "read";
                        _st.startedAt = now;
                        _captureReturnHero(root);
                        // BeginSettingsLoaderSession (ql_core.js:5332) bails on an empty
                        // id, so passing "" never started a session at all — the read
                        // plate appeared only because _SetLoaderStepState turns the
                        // session on as a side effect of the first "active" step
                        // (ql_core.js:5145-5150). That made every row before
                        // read_payload unreachable and left the whole overlay hanging
                        // off an implementation detail. The id is a de-dup key, not an
                        // account: one per run is what the machine wants, since the
                        // stage === "done" guard above is what stops a second read.
                        _callQol("beginSettingsLoaderSession", undefined, ["storage_read_" + now, now]);
                        _setStep("start", "done", "");
                        _go("switch_hero", now, 0);
                        _reschedule(ACTIVE_RATE_SEC);
                        return;
                    }

                    // Only reached while a run is in flight. Re-applied every tick
                    // because the popup is created lazily and rebuilt on selection —
                    // a style set once does not survive that.
                    _setHidden(root, true);

                    if (_st.mode === "read") _tickRead(root, now);
                    else if (_st.mode === "write") _tickWrite(root, now);
                    else if (_st.mode === "dump") _tickDump(root, now);
                } catch(e) {
                    _log("tick error: " + (e && e.message ? e.message : String(e)));
                    throw e;   // FeatureRegistry tracks and auto-disables after 10
                }
            }

            return {
                onEnable: function() {
                    _reset();
                    _reschedule(ACTIVE_RATE_SEC);
                },
                onDisable: function() {
                    if (_loop) { _loop.stop(); _loop = null; }
                    const S = QOL.core.Scheduler;
                    if (S) S.cancelAllForFeature("ql_build_storage");
                    // FeatureRegistry disables us after 10 consecutive throwing ticks,
                    // and a tick that threw mid-run never reached _finish — so this is
                    // the only place left to undo what the run had already done. Every
                    // step is guarded by the state that records we did it, so a disable
                    // from an idle feature (the user flipping the toggle off) is a
                    // no-op. Same order as _finish: tear down while dimmed, un-dim last.
                    try {
                        const root = _root();
                        if (_st.stage !== "idle" && _st.stage !== "done") {
                            _closeBrowse(root);
                            if (_st.shopCmdSent) _closeShop(root);
                        }
                        _setHidden(root, false);
                        // Stranding the player on the storage hero is the loudest way
                        // this can fail: they are standing in the hideout as the wrong
                        // character with no idea why, and nothing is left running to
                        // put them back.
                        if (_st.didSwitch) {
                            _suppressShopPulse();
                            _returnHero(_st.returnHero || FALLBACK_HERO);
                        }
                    } catch(e) {}
                    _reset();
                },
                onSettingsChanged: function() {
                    // _tick re-reads config every pass; nothing to do here.
                }
            };
        },
        test: function(ctx) {
            try {
                const root = $.GetContextPanel();
                const asserts = [];

                const required = [
                    "selectHeroForBuildSave", "queueDelayedHeroRestore",
                    "confirmStorageHeroSignatureAbilities", "normalizeHeroId",
                    "getConfiguredDefaultHeroId", "activatePanelSafe",
                    "buildPayloadFromBase64Url", "deserializeBuildPayloadCompact",
                    "buildDefaultConfig", "mergeConfig", "writeStorageConfigRawToUi",
                    "isConnectedToHideout", "isHudClassActive",
                    "beginSettingsLoaderSession", "finalizeSettingsLoaderSession",
                    "setSettingsLoaderStepState", "dispatchCitadelConCommand",
                    "beginSaveSettingsLoaderSession", "finalizeSaveSettingsLoaderSession"
                ];
                for (let i = 0; i < required.length; i++) {
                    asserts.push({
                        passed: !!(typeof QOL !== "undefined" && typeof QOL[required[i]] === "function"),
                        name: "QOL." + required[i] + " exists"
                    });
                }

                // Panels are only present with the shop open, so their absence is
                // reported rather than failed — this test must not depend on where
                // the player happens to be standing.
                const descEntry = _find(root, PID_DESC_ENTRY);
                const details = _find(root, PID_DETAILS);
                const note = "shop-dependent panels: " + PID_DESC_ENTRY + "=" + (descEntry ? "1" : "0") +
                             " " + PID_DETAILS + "=" + (details ? "1" : "0");

                // maxchars is the one hard constraint on the carrier: a token past
                // the cap is silently truncated and decodes to garbage.
                if (descEntry) {
                    let maxchars = "";
                    try { maxchars = String(descEntry.GetAttributeString("maxchars", "") || ""); } catch(e) {}
                    if (maxchars) {
                        asserts.push({
                            passed: Number(maxchars) >= MAX_TOKEN_LEN,
                            name: "description maxchars (" + maxchars + ") >= " + MAX_TOKEN_LEN
                        });
                    }
                }

                let failed = 0;
                for (let i = 0; i < asserts.length; i++) if (!asserts[i].passed) failed++;
                return {
                    passed: failed === 0,
                    name: "ql_build_storage delegates + carrier",
                    message: failed === 0 ? note : (failed + " assertion(s) failed; " + note),
                    assertions: asserts
                };
            } catch(e) {
                return { passed: false, name: "ql_build_storage", message: String(e && e.message ? e.message : e) };
            }
        }
    });
})();

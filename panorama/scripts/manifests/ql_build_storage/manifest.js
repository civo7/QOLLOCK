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
    const CLASS_BUILD_ITEM = "HeroBuildListItem";
    const CLASS_BUILD_NAME = "BuildName";
    const CLASS_DESCRIPTION = "BuildDescription";
    // citadel_ui_build_selector.css:334 — set by the client on the clicked item.
    const CLASS_SELECTED   = "Selected";
    // citadel_ui_build_selector.css:46 — present while the GC reply is outstanding.
    const CLASS_LOADING    = "BuildsLoading";
    // citadel_hud_hero_builds.css — on CitadelHudHeroBuilds while the editor is open.
    const CLASS_EDITING    = "gEditingBuilds";
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
    // Same reasoning, smaller job: one button press and a popup inflate.
    const BROWSER_OPEN_TIMEOUT_MS = 8000;

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
        if (_activate(_find(root, PID_BROWSE_BTN))) pressed = true;
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

        const buttons = _findClass(popup, "SecondaryButton");
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

    function _setHidden(root, hidden) {
        const Utils = _qol("utils");
        const targets = _hideTargets(root);
        for (let i = 0; i < targets.length; i++) {
            try {
                if (hidden) {
                    if (Utils && Utils.SetStyleSafe) Utils.SetStyleSafe(targets[i], "opacity", HIDE_OPACITY);
                    else targets[i].style.opacity = HIDE_OPACITY;
                } else if (Utils && Utils.ClearStyleSafe) {
                    Utils.ClearStyleSafe(targets[i], "opacity");
                } else {
                    targets[i].style.opacity = "1.0";
                }
            } catch(e) {}
        }
        return targets.length;
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
        if (_activate(_find(root, PID_SAVE_BTN))) ok = true;
        return ok;
    }

    function _triggerCreate(root) {
        const popup = _popup(root);
        if (_alive(popup) && _activate(_find(popup, PID_CREATE_BTN))) return true;
        if (_activate(_find(root, PID_CREATE_BTN))) return true;
        try {
            if (typeof CitadelHudHeroBuildsCreateNewBuild === "function") {
                CitadelHudHeroBuildsCreateNewBuild();
                return true;
            }
        } catch(e) {}
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
    function _confirmStorageHero(root, now) {
        const res = _callQol("confirmStorageHeroSignatureAbilities",
            { confirmed: false }, [root, now, SIGNATURE_HITS]);
        return !!(res && res.confirmed);
    }
    function _resolveReturnHero(ctx) {
        let hero = "";
        try { hero = String(ctx.config.get("DEFAULT_HERO") || ""); } catch(e) { hero = ""; }
        if (!hero) hero = _callQol("getConfiguredDefaultHeroId", "", [null]) || "";
        hero = _callQol("normalizeHeroId", hero, [hero]) || hero;
        return hero || FALLBACK_HERO;
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
                _st = {
                    stage: "idle",
                    mode: "",            // "read" | "write"
                    nextAt: 0,
                    startedAt: 0,
                    stageAt: 0,          // when the current wait began
                    didSwitch: false,
                    shopCmdSent: false,  // the open command is a toggle — send it once
                    returnHero: "",
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
                    token: "",           // write mode: what we must persist
                    requestToken: "",    // write mode: bridge correlation id
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

            /** Enter a stage and stamp when its wait started, for the timeout bound. */
            function _go(stage, now, delayMs) {
                _st.stage = stage;
                _st.stageAt = now;
                _st.nextAt = now + (delayMs === undefined ? STEP_MS : delayMs);
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
                    try { panels[i].SetAttributeString(BRIDGE_REQUEST, ""); } catch(e) {}
                }
            }

            /**
             * Terminal path for both modes.
             *
             * The hero is restored on EVERY exit, including failures — restoring
             * only on the success stage leaks a switched hero whenever anything
             * goes wrong, which strands the player on the storage hero.
             */
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
                // (citadel_shop_mods_build_category.xml:10) and needed no popup, which
                // is why main never had one to close and why this manifest must. Left
                // open it stays up indefinitely and only Cancel dismisses it — ESC does
                // not reach the popup's oncancel. Before the hero switch, too:
                // selecthero rebuilds the shop panel and can strand the popup.
                _closeBrowse(root);
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
                    _returnHero(_st.returnHero || _resolveReturnHero(ctx));
                }
                if (_st.mode === "read") {
                    _recordLoadState(code, detail);
                    _setStep("decode_payload", code === "success" ? "done" : "skipped", "");
                    _setStep("apply_config", code === "success" ? "done" : "skipped", detail || "");
                    _setStep("return_hero", "done", _st.returnHero || "");
                    _setStep("complete", code === "success" ? "done" : "skipped", detail || "");
                    _callQol("finalizeSettingsLoaderSession", undefined, [code, detail || "", _now()]);
                } else if (_st.mode === "write") {
                    _writeStatus(root, code === "success" ? "success" : "failed", detail || "");
                    _clearRequest(root);
                }
                _log(_st.mode + ": " + code + " — " + (detail || ""));
                _st.stage = "done";
                _reschedule(DORMANT_RATE_SEC);
            }

            // ── Shared: get to the storage hero with the browser list settled ──
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
            function _advanceToList(root, now) {
                switch (_st.stage) {
                    case "switch_hero":
                        if (!_switchToStorageHero()) {
                            return "fail";
                        }
                        _st.didSwitch = true;
                        // Overlay step keys come from ql_core.js:535 — the historical
                        // names say "airheart" where the hero is now Skyrunner.
                        _setStep("switch_airheart", "done", "");
                        _setStep("confirm_airheart", "active", "Confirming Skyrunner");
                        _go("confirm_hero", now, SETTLE_MS);
                        return "wait";

                    case "confirm_hero":
                        if (_confirmStorageHero(root, now)) {
                            _setStep("confirm_airheart", "done", "");
                            _setStep("read_payload", "active", "Opening the build browser");
                            _go("open_shop", now);
                            return "wait";
                        }
                        if (_expired(now, CONFIRM_TIMEOUT_MS)) return "fail";
                        _st.nextAt = now + STEP_MS;
                        return "wait";

                    case "open_shop":
                        if (!_isShopOpen(root)) {
                            // Fire once, then only ever wait on the class. Re-sending
                            // a toggle closes what the previous tick opened, which is
                            // why a retry loop can never win on a slow machine.
                            if (!_st.shopCmdSent) {
                                _st.shopCmdSent = true;
                                _fireShopOpen();
                            }
                            if (_expired(now, SHOP_OPEN_TIMEOUT_MS)) return "fail";
                            _st.nextAt = now + STEP_MS;
                            return "wait";
                        }
                        _go("open_browser", now);
                        return "wait";

                    case "open_browser":
                        if (!_isBrowseOpen(root)) {
                            if (_expired(now, BROWSER_OPEN_TIMEOUT_MS)) return "fail";
                            _pressBrowse(root);
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
                            if (_expired(now, LOADING_TIMEOUT_MS)) return "fail";
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
                            if (_expired(now, LOADING_TIMEOUT_MS)) return "fail";
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

            function _collectCandidates(root) {
                const found = _candidateIndices(root);
                _st.sawAnyBuild = found.total > 0;
                _st.candidateCount = found.indices.length;
                _st.cursor = 0;
                _log("list: " + found.total + " build(s), " + found.indices.length + " named " + BUILD_NAME);
            }

            // ── READ ──
            function _tickRead(root, now) {
                const gate = _advanceToList(root, now);
                if (gate === "fail") { _finish(root, "failed", "could not reach the build list"); return; }
                if (gate === "wait") return;

                switch (_st.stage) {
                    case "await_list":
                        _collectCandidates(root);
                        _setStep("read_payload", "active", "Scanning " + _st.candidateCount + " candidate build(s)");
                        _go("select_candidate", now, 0);
                        return;

                    case "select_candidate": {
                        if (_st.cursor >= _st.candidateCount) {
                            // Every candidate visited and none held a token. That is
                            // conclusive, which is what lets a first save proceed.
                            _st.sweptAll = true;
                            _finish(root, "default", "no payload on any " + BUILD_NAME + " build");
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
                        const token = _extractToken(_selectedDescription(root));
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

                _st.returnHero = merged.DEFAULT_HERO || _resolveReturnHero(ctx);
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

            function _tickWrite(root, now) {
                const gate = _advanceToList(root, now);
                if (gate === "fail") { _finish(root, "failed", "could not reach the build list"); return; }
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
                            _triggerEdit(root);
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
                        if (!_setEntryText(entry, _st.token)) {
                            _finish(root, "failed", "description rejected the text");
                            return;
                        }
                        _writeStatus(root, "pending", "saving");
                        _log("write: put " + _st.token.length + " chars into the description");
                        _go("commit", now);
                        return;
                    }

                    case "commit":
                        _triggerSave(root);
                        _go("await_commit", now);
                        return;

                    case "await_commit":
                        // The editor closing IS the commit: only the client can clear
                        // gEditingBuilds, and SaveEdits is a no-op outside edit mode.
                        if (_isEditing(root)) {
                            if (_expired(now, COMMIT_TIMEOUT_MS)) {
                                _finish(root, "failed", "editor never closed after Save");
                                return;
                            }
                            _triggerSave(root);
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
                        if (_expired(now, VERIFY_TIMEOUT_MS)) {
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
                        // Writes win over reads: the user pressed Save and is waiting.
                        const req = _pendingWrite(root);
                        if (req && req.reject) {
                            _reset();
                            _st.mode = "write";
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
                            _st.returnHero = _resolveReturnHero(ctx);
                            _writeStatus(root, "pending", "switching_to_storage_hero");
                            _go("switch_hero", now, 0);
                            _reschedule(ACTIVE_RATE_SEC);
                            return;
                        }
                        if (_st.stage === "done") return;   // read already ran
                        if (!_inHideout(root)) return;      // startup read only in the hideout
                        _reset();
                        _st.mode = "read";
                        _st.startedAt = now;
                        _st.returnHero = _resolveReturnHero(ctx);
                        _callQol("beginSettingsLoaderSession", undefined, ["", now]);
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
                            _returnHero(_st.returnHero || _resolveReturnHero(ctx));
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
                    "setSettingsLoaderStepState", "dispatchCitadelConCommand"
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

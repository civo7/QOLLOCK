// manifests/ql_build_storage/driver.js
// =============================================================================
// QOLLOCK — Build Description Storage UI Driver
// =============================================================================
// OWNS:        Low-level UI automation, DOM traversal, button activation,
//              shop controls, browser popup manipulation, editor actions,
//              hero switching, and signature probing.
// DOES NOT OWN: High-level state machine (manifest.js), config codec.
// DEPENDS ON:  QOL.* delegates, global Panorama ($).
// =============================================================================

(function() {
    "use strict";

    const LOG_TAG = "[QOLLock][ql_build_storage/driver] ";

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
    const HERO_WAIT_TIMEOUT_MS = 15000; // boot-time load waits for hero pawn/crosshair to spawn
    const CONFIRM_TIMEOUT_MS = 5000;    // generous to allow 2 nudges if command dropped
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
    const SHOP_OPEN_CMD = "citadel_open_hero_sheet";
    const SHOP_OPEN_TIMEOUT_MS = 30000;
    const BROWSER_OPEN_TIMEOUT_MS = 16000;
    const FAVORITES_CONFIRM_MS = 2500;
    const CLEANUP_SWEEP_MS = BROWSER_OPEN_TIMEOUT_MS;
    const REPRESS_MS = 1000;

    // ── Hiding the machinery ──
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
    function _legacy() {
        try {
            const L = (typeof QOL !== "undefined") ? QOL.legacy319 : undefined;
            return (L && typeof L.readCategoryToken === "function" &&
                    typeof L.isOwnBuildRow === "function") ? L : undefined;
        } catch(e) { return undefined; }
    }

    // ── Panorama helpers ──
    var _alive = QOL.utils.IsPanelValid;
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
    var _now = QOL.utils.PerfNowMs;
    function _log(msg) {
        try { $.Msg(LOG_TAG + msg); } catch(e) {}
    }

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

    function _isFavoritesTab(root) {
        const shops = _findClass(root, "CitadelHudHeroShop");
        for (let i = 0; i < shops.length; i++) {
            if (_hasClass(shops[i], CLASS_SHOWING_FAVORITES)) return true;
        }
        const byId = _find(root, "CitadelHudHeroShop");
        return _hasClass(byId, CLASS_SHOWING_FAVORITES);
    }

    function _selectFavoritesTab(root) {
        let pressed = false;
        const shops = _findClass(root, "CitadelHudHeroShop");
        for (let i = 0; i < shops.length; i++) {
            if (_activate(_find(shops[i], PID_FAVORITES_NAV))) pressed = true;
        }
        if (!pressed && _activate(_find(root, PID_FAVORITES_NAV))) pressed = true;
        return pressed;
    }

    function _fireShopOpen() {
        return _callQol("dispatchCitadelConCommand", false, [SHOP_OPEN_CMD]);
    }

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

    function _isBrowseOpen(root) {
        const popup = _popup(root);
        if (!_alive(popup)) return false;
        return !_hasClass(popup, "Hidden");
    }

    function _isListLoading(root) {
        return _hasClass(_find(root, PID_SELECTOR), CLASS_LOADING);
    }

    function _listItems(root) {
        const list = _find(root, PID_BUILD_LIST);
        return _alive(list) ? _findClass(list, CLASS_BUILD_ITEM) : [];
    }

    function _itemName(item) {
        if (!_alive(item)) return "";
        const labels = _findClass(item, CLASS_BUILD_NAME);
        for (let i = 0; i < labels.length; i++) {
            const t = _readText(labels[i]);
            if (t) return t;
        }
        return "";
    }

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

    function _pressBrowse(root) {
        let pressed = false;
        const owners = _findClass(root, "shopModsBuild");
        for (let i = 0; i < owners.length; i++) {
            if (_activate(_find(owners[i], PID_BROWSE_BTN))) pressed = true;
        }
        if (!pressed && _activate(_find(root, PID_BROWSE_BTN))) pressed = true;
        return pressed;
    }

    function _closeBrowse(root) {
        const popup = _popup(root);
        if (!_alive(popup)) return false;

        let buttons = _findClass(popup, "SecondaryButton");
        if (!buttons || buttons.length === 0) {
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
            if (handler.indexOf("confirmbuild") !== -1) continue;
            if (_hasClass(buttons[i], "fill")) continue;
            if (_hasClass(buttons[i], "outline") || handler.indexOf("uipopupbuttonclicked") !== -1) {
                cancel = buttons[i];
                break;
            }
        }
        if (cancel && _activate(cancel)) return true;
        try { $.DispatchEvent("Cancelled", popup); return true; } catch(e) {}
        return false;
    }

    function _hideTargets(root) {
        const out = [];
        const popup = _popup(root);
        if (_alive(popup)) out.push(popup);
        const backdrop = _find(root, "DimBackground");
        if (_alive(backdrop)) out.push(backdrop);
        const spinner = _find(root, "HeroBuildListLoading");
        if (_alive(spinner)) out.push(spinner);
        const shops = _findClass(root, "CitadelHudHeroShop");
        for (let i = 0; i < shops.length; i++) {
            if (_alive(shops[i]) && out.indexOf(shops[i]) === -1) out.push(shops[i]);
        }
        const shopById = _find(root, "CitadelHudHeroShop");
        if (_alive(shopById) && out.indexOf(shopById) === -1) out.push(shopById);
        return out;
    }

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
        try {
            const op = String(panel.style.opacity || "");
            if (op) out += " opacity=" + op;
        } catch(e) {}
        return out;
    }

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

    function _isEditing(root) {
        if (_hasClass(_find(root, "CitadelHudHeroBuilds"), CLASS_EDITING)) return true;
        const panels = _findClass(root, "CitadelHudHeroBuilds");
        for (let i = 0; i < panels.length; i++) {
            if (_hasClass(panels[i], CLASS_EDITING)) return true;
        }
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
        if (!ok && _activate(_find(root, PID_SAVE_BTN))) ok = true;
        return ok;
    }

    function _triggerDiscard(root) {
        try {
            if (typeof CitadelHudHeroBuildsDiscardEdits === "function") {
                CitadelHudHeroBuildsDiscardEdits();
                return true;
            }
        } catch(e) {}
        return _activate(_find(root, "CancelChangesButton"));
    }

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
    const SHOP_PULSE_SUPPRESS_MS = 10000;

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
        return _callQol("confirmStorageHeroSignatureAbilities",
            { confirmed: false, detail: "confirm bridge unavailable" },
            [root, now, SIGNATURE_HITS]) || { confirmed: false, detail: "confirm returned nothing" };
    }

    function _liveHero(root) {
        const crosshairHero = _callQol("readHeroFromCrosshair", "", [root]);
        if (crosshairHero) return crosshairHero;

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

    function _bridgeSurfaces(root) {
        const out = [];
        if (root && root.SetAttributeString) out.push(root);
        try {
            const ui = $.GetContextPanel ? $.GetContextPanel() : null;
            if (ui && ui.SetAttributeString && out.indexOf(ui) === -1) out.push(ui);
        } catch(e) {}
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

    // ── Export to QOL global ──
    globalThis.QOL = globalThis.QOL || {};
    globalThis.QOL.buildStorageDriver = {
        STORAGE_HERO, FALLBACK_HERO, BUILD_NAME, TOKEN_EXTRACT, MAX_TOKEN_LEN,
        PID_DESC_ENTRY, PID_NAME_ENTRY, PID_BUILD_LIST, PID_SELECTOR, PID_DETAILS,
        PID_CREATE_BTN, PID_BROWSE_BTN, PID_SAVE_BTN, PID_SELECTED_BUILD, PID_FAVORITES_NAV,
        CLASS_BUILD_ITEM, CLASS_BUILD_NAME, CLASS_DESCRIPTION, CLASS_SELECTED, CLASS_LOADING,
        CLASS_EDITING, CLASS_SHOWING_FAVORITES, CLASS_CAN_EDIT,
        BRIDGE_REQUEST, BRIDGE_STATE, BRIDGE_MSG, BRIDGE_TOKEN, BRIDGE_FORCE,
        ACTIVE_RATE_SEC, DORMANT_RATE_SEC, STEP_MS, SETTLE_MS,
        HERO_WAIT_TIMEOUT_MS, CONFIRM_TIMEOUT_MS, LOADING_TIMEOUT_MS, SELECT_TIMEOUT_MS, EDITOR_TIMEOUT_MS,
        COMMIT_TIMEOUT_MS, VERIFY_TIMEOUT_MS, OVERALL_TIMEOUT_MS, SIGNATURE_HITS,
        LIST_STABLE_HITS, LIST_NAME_LOG_MAX,
        SHOP_OPEN_CMD, SHOP_OPEN_TIMEOUT_MS, BROWSER_OPEN_TIMEOUT_MS, FAVORITES_CONFIRM_MS,
        CLEANUP_SWEEP_MS, REPRESS_MS, HIDE_OPACITY, SHOP_PULSE_SUPPRESS_MS,
        _qol, _callQol, _legacy, _alive, _find, _findClass, _hasClass, _root, _now, _log,
        _readText, _extractToken, _isShopOpen, _inHideout, _activate, _isFavoritesTab,
        _selectFavoritesTab, _fireShopOpen, _closeShop, _popup, _isBrowseOpen, _isListLoading,
        _listItems, _itemName, _selectedDescription, _isOurBuildSelected, _pressBrowse,
        _closeBrowse, _hideTargets, _describe, _reportTree, _setHidden, _hudBuilds, _isEditing,
        _descEntry, _setEntryText, _triggerEdit, _triggerSave, _triggerDiscard, _triggerCreate,
        _suppressShopPulse, _switchToStorageHero, _returnHero, _confirmStorageHero, _liveHero,
        _resolveReturnHero, _bridgeSurfaces
    };

    try { $.Msg(LOG_TAG + "driver loaded"); } catch(e) {}
})();

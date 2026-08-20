// scripts/simulator/game/builds.js
// =============================================================================
// Models the Deadlock client's hero-build UI: owns build state and mutates the
// panel tree the way the C++ side does.
// =============================================================================
// Every panel id/class below is transcribed from vanilla layout files in
// G:\GameTracking-Deadlock (paths cited inline). Panels that vanilla creates at
// runtime rather than declaring in XML are marked [C++] — those are modelled by
// hand, and modelling them faithfully IS the test.
//
// LATENCY IS LOAD-BEARING. The bug this simulator exists to reproduce is a race:
// the loader burns its scan budget faster than the engine can render a selected
// build's categories. A zero-latency model makes the bug vanish. Defaults below
// are deliberately non-zero; tests override them to fuzz the timing.
// =============================================================================

"use strict";

/** Default latency profile, in ms of virtual time. */
const DEFAULT_LATENCY = {
    heroSwitchMs: 1200,   // selecthero -> signature abilities readable
    shopOpenMs: 150,      // open_item_shop -> gShopOpen + shop panels
    selectBuildMs: 250,   // select a build entry -> its categories render
    createBuildMs: 400,   // CreateNewBuild -> new entry appears in the list
    editModeMs: 120,      // EditSelectedBuild -> gEditingBuilds
    saveEditsMs: 180,     // SaveEdits -> committed + gEditingBuilds cleared
    browseRevealMs: 250,  // Browse click -> popup shown (list still loading)
    buildsReplyMs: 900,   // GC hero-build search reply -> BuildsLoading clears
};

/**
 * How dialog-variable-backed Labels report their text.
 *
 *  "token"    — `.text` returns the raw localization token
 *               (`#Citadel_HeroBuilds_BuildName`), because vanilla backs these
 *               Labels with dialog variables:
 *               citadel_main_english.txt:2247 =
 *                 "{s:selected_hero_build_name}{s:obsolete_tag}"
 *  "resolved" — `.text` returns the actual build name.
 *
 * Which one the engine really does is UNVERIFIED. Any feature that reads such a
 * Label must be tested under BOTH modes, and must still work under "token".
 *
 * WHEN GUESSING, GUESS AGAINST OURSELVES. An optimistic default makes the test
 * suite weaker than the game, which is worse than having no test: a save-verify
 * regression shipped green at 14/14 because this model resolved text the engine
 * does not resolve. Unverified reads default to TOKEN.
 */
const TITLE_MODE = { TOKEN: "token", RESOLVED: "resolved" };

const TOKEN_BUILD_NAME = "#Citadel_HeroBuilds_BuildName";

// citadel_shop_mods_build_category.xml:10 declares
//   <Label id="BuildCategoryName" class="CategoryName"
//          text="#Citadel_HeroBuilds_CategoryName" />
// and citadel_main_english.txt:2230 defines that token as "{s:category_name}",
// so the rendered name lives in a dialog variable and `.text` holds the template.
// There is no readable GetDialogVariable in Panorama — the mod never calls one —
// so under TOKEN mode this text is unrecoverable from the label, by design.
const TOKEN_CATEGORY_NAME = "#Citadel_HeroBuilds_CategoryName";

// Signature-ability confirmation (ql_core.js:610-624). Slot 2 must resolve to
// this exact ability for the loader to accept that it is on Skyrunner.
const SIGNATURE_SLOT_IDS = ["slot_signature_1", "slot_signature_2", "slot_signature_3"];
const HERO_SIGNATURES = {
    hero_skyrunner: ["ability_skyrunner_flakshot", "ability_skyrunner_magic_beam", "ability_skyrunner_lifethread"],
    hero_werewolf: ["ability_werewolf_bite", "ability_werewolf_howl", "ability_werewolf_frenzy"],
};

class BuildsModel {
    /**
     * @param {object}   opts
     * @param {Sandbox}  opts.sandbox
     * @param {object}   [opts.latency]    partial override of DEFAULT_LATENCY
     * @param {string}   [opts.titleMode]  TITLE_MODE.*
     * @param {string}   [opts.hero]       starting hero
     * @param {boolean}  [opts.inHideout]
     */
    constructor({ sandbox, latency = {}, titleMode = TITLE_MODE.TOKEN, hero = "hero_werewolf", inHideout = true } = {}) {
        this.sandbox = sandbox;
        this.doc = sandbox.doc;
        this.clock = sandbox.clock;
        this.latency = { ...DEFAULT_LATENCY, ...latency };
        this.titleMode = titleMode;

        this.hero = hero;
        this.inHideout = inHideout;
        this.shopOpen = false;
        // The browser is a popup; .Hidden is the open/closed discriminator.
        this.browseOpen = false;
        // True while the GC hero-build search is outstanding.
        this.buildsLoading = false;
        this.editing = false;

        /** @type {{title:string, categories:{name:string}[]}[]} */
        this.builds = [];
        this.selectedIndex = -1;
        this.editingIndex = -1;

        // Observability — tests assert on these instead of guessing.
        this.log = [];
        this.counters = {
            createBuild: 0, deleteBuild: 0, selectBuild: 0,
            editMode: 0, saveEdits: 0, heroSwitch: 0, browserOpen: 0,
        };

        this._buildTree();
        this._wireGlobals();
        this._renderAll();
    }

    _trace(msg) {
        this.log.push(`[${this.clock.now()}] ${msg}`);
    }

    // ── Tree construction ─────────────────────────────────────────────────
    _buildTree() {
        const doc = this.doc;
        const root = doc.root; // #Hud
        const mk = (type, opts) => doc.create(type, opts);

        // --- Hero shop: citadel_hud_hero_shop.xml ---
        this.shopPanel = root.addChild(mk("CitadelHudHeroShop", { id: "CitadelHudHeroShop" }));

        // citadel_hud_hero_shop.xml:56
        this.selectedBuild = this.shopPanel.addChild(mk("CitadelShopModsBuild", { id: "ShopModsSelectedBuild" }));

        // citadel_shop_mods_build.xml:21-24
        const header = this.selectedBuild.addChild(mk("Panel", { classes: ["BuildHeader", "BuildHeaderShared"] }));
        const headerContainer = header.addChild(mk("Panel", { classes: ["BuildHeaderContainer"] }));
        headerContainer.addChild(mk("Panel", { classes: ["FavoriteBuildsSelector"] }));
        this.selectedBuildOuter = headerContainer.addChild(mk("Panel", { id: "SelectedBuildOuter" })); // [C++] filled

        // citadel_shop_mods_build.xml:26-48
        this.controlButtons = header.addChild(mk("Panel", { id: "ControlButtons" }));
        this.saveBuildButton = this.controlButtons.addChild(mk("Panel", { id: "SaveBuildButton", classes: ["EditModeButton"] }));
        this.editBuildButton = this.controlButtons.addChild(mk("Panel", { id: "EditHeroBuildButton" }));
        this.browseBuildsButton = this.controlButtons.addChild(mk("Panel", { id: "BrowseBuildsButton" }));
        this.saveBuildButton.SetPanelEvent("onmouseactivate", () => this.saveEdits());
        this.editBuildButton.SetPanelEvent("onactivate", () => this.editSelectedBuild());
        this.browseBuildsButton.SetPanelEvent("onactivate", () => this.openBuildBrowser());

        // Delete control. Vanilla exposes this through the build-details pane
        // (citadel_ui_build_details.xml:49) and it is only present while the shop
        // is genuinely open — the clear pipeline depends on exactly that, and its
        // shop gate exists because of it. Modelled as a panel whose activation is
        // ignored while the shop is closed rather than one that vanishes, so a
        // premature delete attempt is a no-op instead of a lookup failure.
        this.deleteBuildButton = this.controlButtons.addChild(mk("Panel", { id: "DeleteBuildButton" }));
        this.deleteBuildButton.SetPanelEvent("onmouseactivate", () => {
            if (!this.shopOpen) {
                this._trace("deleteBuildButton ignored (shop closed)");
                return;
            }
            this.deleteSelectedBuild();
        });

        // citadel_shop_mods_build.xml:50-51 — both empty in XML, [C++] fills
        this.categoryContainer = this.selectedBuild.addChild(mk("Panel", { id: "CategoryContainer" }));
        this.favoriteBuildList = this.selectedBuild.addChild(mk("Panel", { id: "FavoriteBuildList" }));

        // --- Build edit sidebar: citadel_hud_hero_builds.xml ---
        // Sibling of the shop under Hud (hud.xml:199 vs :221), NOT nested in it.
        this.heroBuildsPanel = root.addChild(mk("CitadelHudHeroBuilds", { id: "CitadelHudHeroBuilds" }));

        const editBuildSection = this.heroBuildsPanel.addChild(
            mk("Panel", { id: "EditBuildSection", classes: ["BuildEditSection"] })
        );
        // citadel_hud_hero_builds.xml:25 — note maxchars, absent on the category entry
        this.buildNameEntry = editBuildSection.addChild(
            mk("TextEntry", { id: "BuildNameTextEntry", classes: ["EditFieldTextEntry"], attributes: { maxchars: "50" } })
        );
        editBuildSection.addChild(
            mk("TextEntry", { id: "BuildDescriptionTextEntry", classes: ["EditFieldTextEntry"], attributes: { maxchars: "512" } })
        );

        const editCategorySection = this.heroBuildsPanel.addChild(
            mk("Panel", { id: "EditCategorySection", classes: ["BuildEditSection"] })
        );
        // citadel_hud_hero_builds.xml:40 — no maxchars, which is why the payload lives here
        this.categoryNameEntry = editCategorySection.addChild(
            mk("TextEntry", { id: "CategoryNameTextEntry", classes: ["EditFieldTextEntry"] })
        );
        editCategorySection.addChild(mk("TextEntry", { id: "CategoryDescriptionTextEntry", classes: ["EditFieldTextEntry"] }));

        // --- Signature ability HUD (drives Skyrunner confirmation) ---
        this.signatureHud = root.addChild(mk("Panel", { id: "CitadelHudAbilities" }));
        this.signatureSlots = SIGNATURE_SLOT_IDS.map((id) => {
            const slot = this.signatureHud.addChild(mk("Panel", { id }));
            const label = slot.addChild(mk("Label", { classes: ["ability_name"] }));
            return { slot, label };
        });

        // --- Local player hero panel ---
        // DetectGlobalIdleState (ql_core.js) treats a missing #HeroPanel as "not
        // in a match" and stretches every loop interval accordingly, which starves
        // the save state machine of ticks and trips its 12s budget. The hideout
        // does have a hero panel — it spawns a local server — so this belongs here.
        this.heroPanel = root.addChild(mk("Panel", { id: "HeroPanel" }));
    }

    /** Install the Citadel* globals and engine event routing into the sandbox. */
    _wireGlobals() {
        const g = this.sandbox.global;

        g.CitadelHudHeroBuildsCreateNewBuild = () => this.createNewBuild();
        g.CitadelHudHeroBuildsDeleteSelectedBuild = () => this.deleteSelectedBuild();
        g.CitadelHudHeroBuildsEditSelectedBuild = () => this.editSelectedBuild();
        g.CitadelHudHeroBuildsCopyAndEditSelectedBuild = () => this.editSelectedBuild();
        g.CitadelHudHeroBuildsSaveEdits = () => this.saveEdits();
        g.CitadelHudHeroBuildsDiscardEdits = () => this.discardEdits();
        g.CitadelHudHeroBuildsSelectBuild = (i) => this.selectBuild(i);
        g.CitadelHudHeroBuildsAddNewCategory = () => this.addCategory();
        g.CitadelHudHeroBuildsToggleFavoriteSelector = () => {};
        g.CitadelHudHeroBuildsFocusCategory = (i) => this.focusCategory(i);

        g.CitadelOpenBuildBrowser = () => this.openBuildBrowser();
        g.CitadelBuildBrowserRefresh = () => this._renderBuildList();
        g.CitadelBuildBrowserSetTabFilter = () => {};
        g.CitadelBuildBrowserPopupConfirmBuild = () => {};

        g.CitadelOpenUpgradeShop = () => this.openShop();
        g.CitadelEnterUpgradeShop = () => this.openShop();
        g.CitadelToggleUpgradeShop = () => (this.shopOpen ? this.closeShop() : this.openShop());
        g.CitadelExitUpgradeShop = () => this.closeShop();
        g.CitadelShopModsActivate = () => {};
        g.DismissAllContextMenus = () => {};

        // ActivatePanelSafe (ql_core.js:9015) fans out DispatchEvent("Activated", panel, ...)
        this.sandbox.onEvent("Activated", (panel) => {
            if (panel && typeof panel.activate === "function") panel.activate();
        });
        // SetBuildCategoryNameText (ql_feat_buildsave.js:547-558) fires these.
        this.sandbox.onEvent("TextEntryChanged", () => {});
        this.sandbox.onEvent("TextEntrySubmit", () => {});
        this.sandbox.onEvent("CitadelConCommand", (cmd) => this._conCommand(String(cmd || "")));
        this.sandbox.onEvent("CitadelHudHeroBuildsCreateNewBuild", () => this.createNewBuild());
        this.sandbox.onEvent("CitadelHudHeroBuildsDeleteSelectedBuild", () => this.deleteSelectedBuild());
    }

    _conCommand(cmd) {
        const hero = cmd.match(/^selecthero\s+(\S+)/);
        if (hero) return this.switchHero(hero[1]);
        if (cmd === "open_item_shop" || cmd.includes("openherosheet")) return this.openShop();
        return undefined;
    }

    // ── Scenario setup ────────────────────────────────────────────────────
    /**
     * Seed the build list. Categories default to the vanilla-ish placeholder so
     * a build without a payload still *has* a category — that distinction is
     * what `_storageBuildReady` gets wrong upstream.
     */
    seedBuilds(specs) {
        this.builds = specs.map((s, i) => ({
            title: s.title ?? `New Skyrunner Build`,
            categories: (s.categories ?? ["Core Items"]).map((name) => ({ name })),
            id: s.id ?? i + 1,
        }));
        this.selectedIndex = this.builds.length > 0 ? 0 : -1;
        this._renderAll();
        return this;
    }

    /** Convenience: N junk builds with the payload token in build index `at`. */
    seedWithPayloadAt(count, at, payloadToken) {
        const specs = [];
        for (let i = 0; i < count; i++) {
            specs.push({
                title: "New Skyrunner Build",
                categories: [i === at ? payloadToken : "Core Items"],
            });
        }
        return this.seedBuilds(specs);
    }

    get selectedBuildData() {
        return this.builds[this.selectedIndex] || null;
    }

    // ── Rendering (what C++ does to the tree) ─────────────────────────────
    // Titles get no "text" attribute mirror, unlike category names below. The
    // mirror is inferred for categories because loading demonstrably reaches the
    // payload through an attribute-first reader; nothing equivalent is known for
    // titles, so they stay unreadable under TOKEN mode. That is what keeps the
    // marker fast path honest — it must degrade to the full sweep, not rely on a
    // readability we have never observed.
    _titleTextFor(title) {
        return this.titleMode === TITLE_MODE.TOKEN ? TOKEN_BUILD_NAME : title;
    }

    /**
     * How the category-name Label reports its text.
     *
     * The earlier claim that category text is "known readable" was right about the
     * symptom and wrong about the mechanism, and the difference is the whole bug.
     *
     * citadel_shop_mods_build_category.xml:10 declares the label with
     * text="#Citadel_HeroBuilds_CategoryName", and citadel_main_english.txt:2230
     * defines that as "{s:category_name}". So `.text` holds the TEMPLATE, while the
     * value C++ pushed in is reachable as the "text" ATTRIBUTE — the two are
     * separate stores (see the fidelity note in panel.js).
     *
     * That asymmetry is why the two readers in this repo disagree in-game:
     *   - manifests/ql_build_payload/manifest.js:116 reads the attribute FIRST and
     *     falls through to `.text` → finds the payload → loading works.
     *   - ql_core.js:7146 ReadPanelTextMaybe reads `.text` first and RETURNS EARLY
     *     when it is non-empty. The template is non-empty, so it never reaches the
     *     attribute → save verification can never see the payload.
     *
     * Modelling only the resolved value hid that completely: both readers passed.
     * Under TOKEN mode we now model both stores, so an attribute-first reader still
     * works and a text-first reader fails exactly as it does in-game.
     */
    _applyCategoryText(label, name) {
        label.text = this.titleMode === TITLE_MODE.TOKEN ? TOKEN_CATEGORY_NAME : name;
        // What C++ pushed in. Readable via GetAttributeString("text"), never via
        // `.text` when the label is dialog-variable backed.
        label.SetAttributeString("text", name);
        label.SetDialogVariable("category_name", name);
    }

    _renderAll() {
        this._renderSignature();
        this._renderSelectedBuildHeader();
        this._renderCategories();
        this._renderBuildList();
    }

    _renderSignature() {
        const abilities = HERO_SIGNATURES[this.hero] || ["", "", ""];
        this.signatureSlots.forEach(({ label }, i) => {
            label.text = abilities[i] || "";
            label.SetDialogVariable("ability_name", abilities[i] || "");
        });
    }

    /** #SelectedBuildOuter -> FavoriteBuildEntryContainer -> .SelectedBuildName */
    _renderSelectedBuildHeader() {
        this.selectedBuildOuter.RemoveAndDeleteChildren();
        const data = this.selectedBuildData;
        if (!data) return;
        // citadel_shop_mods_build.xml snippet FavoriteBuildEntry:10-11
        const container = this.selectedBuildOuter.addChild(
            this.doc.create("Panel", { classes: ["FavoriteBuildEntryContainer"] })
        );
        const label = container.addChild(
            this.doc.create("Label", { classes: ["FavoriteBuildEntryLabel", "SelectedBuildName"] })
        );
        label.text = this._titleTextFor(data.title);
        label.SetDialogVariable("selected_hero_build_name", data.title);
    }

    /** #CategoryContainer -> CitadelShopModsBuildCategory* -> #BuildCategoryName */
    _renderCategories() {
        this.categoryContainer.RemoveAndDeleteChildren();
        const data = this.selectedBuildData;
        if (!data) return;
        data.categories.forEach((cat, i) => {
            // Vanilla generates these; probable id pattern ModCategory%d.
            const catPanel = this.categoryContainer.addChild(
                this.doc.create("CitadelShopModsBuildCategory", { id: `ModCategory${i}` })
            );
            if (i === this.focusedCategoryIndex) catPanel.AddClass("Focused");
            // citadel_shop_mods_build_category.xml:9-10
            const catHeader = catPanel.addChild(
                this.doc.create("Panel", { id: "BuildCategoryHeader", classes: ["BuildCategory"] })
            );
            const nameLabel = catHeader.addChild(
                this.doc.create("Label", { id: "BuildCategoryName", classes: ["CategoryName"] })
            );
            this._applyCategoryText(nameLabel, cat.name);
            catPanel.addChild(this.doc.create("Panel", { id: "ModsContainer" }));

            // Activating the header focuses the category: C++ marks the category
            // panel .Focused (the class citadel_shop_mods_build_category.css:196
            // reveals the edit header with) and seeds CategoryNameTextEntry from
            // it. Without this the save pipeline's wait_category_focus stage can
            // never satisfy HasFocusedBuildCategory and times out.
            const focus = () => this.focusCategory(i);
            catHeader.SetPanelEvent("onactivate", focus);
            catHeader.SetPanelEvent("onmouseactivate", focus);
            catPanel.SetPanelEvent("onactivate", focus);
        });
    }

    /**
     * #FavoriteBuildList — the shop header's single-entry strip.
     *
     * GROUND TRUTH (real game logs, 2026-08-20): this is NOT the build list. It
     * holds exactly ONE .FavoriteBuildEntryContainer — the selected build — however
     * many builds exist. Sweeping that class always reports 1, which is what made
     * an account with six builds log "1 storage entr(ies) present".
     *
     * The real list is #HeroBuildList / .HeroBuildListItem, revealed by clicking
     * BrowseBuildsButton. It appears INLINE — PopupBuildBrowser never exists — so
     * any gate keyed on a popup being open can never pass.
     */
    _renderBuildList() {
        // Stays empty: the single .FavoriteBuildEntryContainer in the tree is the
        // selected build's header strip, rendered by _renderSelectedBuildHeader.
        // Adding another here would double the class count and hide the very fact
        // this models — that sweeping the class always yields exactly one entry.
        this.favoriteBuildList.RemoveAndDeleteChildren();
        this._renderBrowseList();
    }

    /**
     * The build browser — a genuine POPUP
     * (popups/citadel_popup_build_browser.xml:8 declares
     * `<PopupBuildBrowser class="PopupPanel Hidden" popupbackground="dim">`).
     *
     * Three things this models that all bit us:
     *  - `.Hidden` is the open/closed discriminator, NOT visibility. popups_shared.css:26
     *    sets `.PopupPanel.Hidden { visibility: visible; }`, so a dismissed popup still
     *    reads as visible and IsPanelVisibleMaybe() returns true on a closed browser.
     *  - `#CreateBuildButton` lives in the popup's `#Header`, a SIBLING of
     *    `#HeroBuildSelector` (XML :11 vs :15). It exists the instant the popup
     *    inflates, with zero dependency on build data — so it is NOT a "list is
     *    ready" signal.
     *  - The list arrives over the network. While the search is outstanding the
     *    selector carries `BuildsLoading`, which collapses `#HeroBuildList` and
     *    reveals `#HeroBuildListLoading` (citadel_ui_build_selector.css:41-49).
     */
    _renderBrowseList() {
        // The popup is inflated on first open, not at HUD load — the engine logs
        // "Panel HeroBuildSelector has fill-parent-flow..." at the moment Browse is
        // clicked, so nothing in its subtree exists before that.
        if (!this.popupPanel || !this.popupPanel.IsValid()) {
            if (!this.browseOpen) return;
            this.popupPanel = this.doc.root.addChild(
                this.doc.create("PopupBuildBrowser", { classes: ["PopupPanel", "Hidden"] })
            );
            const header = this.popupPanel.addChild(this.doc.create("Panel", { id: "Header" }));
            // Sibling of the selector, and present from inflation onward — which is
            // why it is not a "list is ready" signal.
            this.createBuildButton = header.addChild(
                this.doc.create("Button", { id: "CreateBuildButton" })
            );
            this.createBuildButton.SetPanelEvent("onmouseactivate", () => this.createNewBuild());

            this.buildSelector = this.popupPanel.addChild(
                this.doc.create("CitadelHeroBuildsSelector", { id: "HeroBuildSelector" })
            );
            const main = this.buildSelector.addChild(
                this.doc.create("Panel", { classes: ["MainContainer"] })
            );
            this.buildListPanel = main.addChild(this.doc.create("Panel", { id: "HeroBuildList" }));
            this.listLoadingPanel = main.addChild(
                this.doc.create("Panel", { id: "HeroBuildListLoading" })
            );
        }

        this.popupPanel.SetHasClass("Hidden", !this.browseOpen);
        // Items are only revealed when the selector is showing a tab.
        this.buildSelector.SetHasClass("ShowMyBuilds", this.browseOpen);
        this.buildSelector.SetHasClass("BuildsLoading", this.browseOpen && this.buildsLoading);
        this.listLoadingPanel.style.visibility =
            (this.browseOpen && this.buildsLoading) ? "visible" : "collapse";

        this.buildListPanel.RemoveAndDeleteChildren();
        if (!this.browseOpen || this.buildsLoading) return;

        this.builds.forEach((build, i) => {
            const item = this.buildListPanel.addChild(
                this.doc.create("Panel", {
                    id: `HeroBuildListItem_${i}`,
                    classes: ["HeroBuildListItem", "MyBuild"],
                })
            );
            if (i === this.selectedIndex) item.AddClass("Selected");
            const label = item.addChild(this.doc.create("Label", { classes: ["BuildName"] }));
            label.text = this._titleTextFor(build.title);
            label.SetDialogVariable("selected_hero_build_name", build.title);
            item.SetPanelEvent("onactivate", () => this.selectBuild(i));
        });
    }

    /**
     * Open the browser. The popup appears immediately, but the list is empty and
     * flagged BuildsLoading until the simulated GC reply lands — which is exactly
     * the window a naive readiness check mistakes for "this hero has no builds".
     */
    openBuildBrowser() {
        this.counters.browserOpen++;
        if (this.browseOpen) return true;
        this._trace("openBuildBrowser (Browse clicked)");
        this.buildsLoading = true;
        this.clock.schedule(this.latency.browseRevealMs / 1000, () => {
            this.browseOpen = true;
            this._renderBrowseList();
            this._trace("browser popup shown, list loading");
            this.clock.schedule(this.latency.buildsReplyMs / 1000, () => {
                this.buildsLoading = false;
                this._renderBrowseList();
                this._trace(`builds reply arrived (${this.builds.length} build(s))`);
            });
        });
        return true;
    }

    // ── Actions ───────────────────────────────────────────────────────────
    switchHero(hero) {
        this.counters.heroSwitch++;
        this._trace(`switchHero -> ${hero}`);
        // Signature abilities go blank during the switch, then resolve. This is
        // what forces the loader's confirm_storage stage to actually wait.
        this.hero = "";
        this._renderSignature();
        this.clock.schedule(this.latency.heroSwitchMs / 1000, () => {
            this.hero = hero;
            this._renderSignature();
            this._trace(`switchHero settled -> ${hero}`);
        });
        return true;
    }

    openShop() {
        if (this.shopOpen) return true;
        this._trace("openShop");
        this.clock.schedule(this.latency.shopOpenMs / 1000, () => {
            this.shopOpen = true;
            // gShopOpen is a GLOBAL class: the engine sets it on the absolute root
            // and mirrors it onto panels with a matching <GlobalClassListener>
            // (citadel_hud_hero_builds.xml:21). Consumers resolve their root via
            // GetUIRoot(), which walks to the topmost panel — so setting it only
            // on #Hud leaves IsHudClassActive() blind and gates never open.
            this.doc.absRoot.AddClass("gShopOpen");
            this.doc.root.AddClass("gShopOpen");
            this.shopPanel.AddClass("gShopOpen");
            this.heroBuildsPanel.AddClass("gShopOpen");
            this._renderAll();
        });
        return true;
    }

    closeShop() {
        this.shopOpen = false;
        this.doc.absRoot.RemoveClass("gShopOpen");
        this.doc.root.RemoveClass("gShopOpen");
        this.shopPanel.RemoveClass("gShopOpen");
        this.heroBuildsPanel.RemoveClass("gShopOpen");
        return true;
    }

    /**
     * Selecting a build re-renders its categories after `selectBuildMs`. The
     * delay is the crux: a scanner that selects and immediately reads sees the
     * PREVIOUS build's categories.
     */
    selectBuild(index) {
        if (index < 0 || index >= this.builds.length) return false;
        this.counters.selectBuild++;
        this._trace(`selectBuild(${index}) requested`);
        this.clock.schedule(this.latency.selectBuildMs / 1000, () => {
            this.selectedIndex = index;
            this.focusedCategoryIndex = -1;
            this._renderAll();
            this._trace(`selectBuild(${index}) rendered`);
        });
        return true;
    }

    createNewBuild() {
        this.counters.createBuild++;
        this._trace("createNewBuild");
        this.clock.schedule(this.latency.createBuildMs / 1000, () => {
            this.builds.push({
                title: "New Skyrunner Build",
                categories: [{ name: "Core Items" }],
                id: this.builds.length + 1,
            });
            // A freshly created build becomes the selected one — this is why
            // junk builds steal the selection from the payload build.
            this.selectedIndex = this.builds.length - 1;
            this._renderAll();
            this._trace(`createNewBuild done, now ${this.builds.length} builds, selected ${this.selectedIndex}`);
        });
        return true;
    }

    deleteSelectedBuild() {
        if (this.selectedIndex < 0 || this.selectedIndex >= this.builds.length) return false;
        this.counters.deleteBuild++;
        const removed = this.builds[this.selectedIndex];
        this._trace(`deleteSelectedBuild(${this.selectedIndex}) "${removed.title}"`);
        this.builds.splice(this.selectedIndex, 1);
        if (this.selectedIndex >= this.builds.length) this.selectedIndex = this.builds.length - 1;
        this._renderAll();
        return true;
    }

    editSelectedBuild() {
        if (this.selectedIndex < 0) return false;
        this.counters.editMode++;
        this._trace(`editSelectedBuild(${this.selectedIndex})`);
        this.clock.schedule(this.latency.editModeMs / 1000, () => {
            this.editing = true;
            this.editingIndex = this.selectedIndex;
            this.heroBuildsPanel.AddClass("gEditingBuilds");
            const data = this.selectedBuildData;
            if (data) {
                // C++ seeds the edit fields from the build being edited.
                this.buildNameEntry.text = data.title;
                this.categoryNameEntry.text = data.categories[0] ? data.categories[0].name : "";
            }
        });
        return true;
    }

    /**
     * Commit the edit fields back into the model. Only writes while edit mode is
     * actually active — a save outside edit mode is a no-op in the client, which
     * is precisely the failure a verify step reading the editor buffer misses.
     */
    saveEdits() {
        this.counters.saveEdits++;
        if (!this.editing) {
            this._trace("saveEdits IGNORED (not in edit mode)");
            return false;
        }
        const idx = this.editingIndex;
        // Read what the fields actually hold. Panel.SetText already clamped the
        // title to maxchars=50, so a marker longer than that arrives truncated
        // here rather than being silently accepted.
        const title = String(this.buildNameEntry.text || "");
        const categoryName = String(this.categoryNameEntry.text || "");
        this._trace(`saveEdits(${idx}) title="${title}" category="${categoryName.slice(0, 40)}"`);
        this.clock.schedule(this.latency.saveEditsMs / 1000, () => {
            const data = this.builds[idx];
            if (data) {
                if (title) data.title = title;
                if (categoryName) {
                    if (data.categories.length === 0) data.categories.push({ name: categoryName });
                    else data.categories[0].name = categoryName;
                }
            }
            this.editing = false;
            this.editingIndex = -1;
            this.heroBuildsPanel.RemoveClass("gEditingBuilds");
            this._renderAll();
            this._trace(`saveEdits committed`);
        });
        return true;
    }

    discardEdits() {
        this.editing = false;
        this.editingIndex = -1;
        this.heroBuildsPanel.RemoveClass("gEditingBuilds");
        return true;
    }

    addCategory() {
        const data = this.selectedBuildData;
        if (!data) return false;
        data.categories.push({ name: "New Category" });
        this._renderCategories();
        return true;
    }

    /**
     * Focus a category. C++ marks the category panel .Focused and seeds
     * CategoryNameTextEntry with that category's current name, which is what the
     * save pipeline then overwrites.
     */
    focusCategory(index) {
        if (this.focusedCategoryIndex === index) return true;
        this.focusedCategoryIndex = index;
        const data = this.selectedBuildData;
        const cat = data && data.categories[index];
        if (cat) this.categoryNameEntry.text = cat.name;
        this._renderCategories();
        this._trace(`focusCategory(${index}) name="${cat ? cat.name : ""}"`);
        return true;
    }

    // ── Assertions helpers for tests ──────────────────────────────────────
    /** Index of the build whose category text contains a QOL payload token. */
    payloadBuildIndex() {
        const re = /\[QOL-\d+-\d+-\d+\]:[A-Za-z0-9\-_]+/;
        return this.builds.findIndex((b) => b.categories.some((c) => re.test(c.name)));
    }

    titles() {
        return this.builds.map((b) => b.title);
    }

    describe() {
        return this.builds
            .map((b, i) => `${i === this.selectedIndex ? ">" : " "} [${i}] "${b.title}" :: ${b.categories.map((c) => c.name).join(" | ")}`)
            .join("\n");
    }
}

module.exports = { BuildsModel, DEFAULT_LATENCY, TITLE_MODE, HERO_SIGNATURES, SIGNATURE_SLOT_IDS };

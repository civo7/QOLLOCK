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
        // Validated, not normalised. Every titleMode test is written as
        // `x === TITLE_MODE.TOKEN`, so ANY unrecognised value silently selects the
        // RESOLVED branch — the optimistic one this whole mechanism exists to guard
        // against. The fuzzer passed the literals "TOKEN"/"RESOLVED" (uppercase)
        // against values that are lowercase, so every one of its ~3000 cases ran
        // resolved while reporting titleMode=TOKEN in its failure output. A typo
        // must break the harness loudly, not quietly weaken it.
        if (titleMode !== TITLE_MODE.TOKEN && titleMode !== TITLE_MODE.RESOLVED) {
            throw new Error(
                `[simulator] unknown titleMode ${JSON.stringify(titleMode)}; ` +
                `expected TITLE_MODE.TOKEN (${JSON.stringify(TITLE_MODE.TOKEN)}) or ` +
                `TITLE_MODE.RESOLVED (${JSON.stringify(TITLE_MODE.RESOLVED)})`
            );
        }
        this.titleMode = titleMode;

        this.hero = hero;
        this.inHideout = inHideout;
        this.shopOpen = false;
        // The open command is a toggle, and the shop takes shopOpenMs to appear. Both
        // facts are needed together: a second toggle sent inside that window must
        // CANCEL the opening, not queue a second one, or the harness cannot see the
        // re-fire bug at all. _shopGen invalidates an in-flight open.
        this.shopOpenPending = false;
        this._shopGen = 0;
        // The browser is a popup; .Hidden is the open/closed discriminator.
        this.browseOpen = false;
        // True while the GC hero-build search is outstanding.
        this.buildsLoading = false;
        this.editing = false;
        // PopupGeneric#DeleteHeroBuildWarning while a delete is awaiting confirmation.
        this.deletePopup = null;

        /** @type {{title:string, categories:{name:string}[]}[]} */
        this.builds = [];
        this.selectedIndex = -1;
        this.editingIndex = -1;

        // Observability — tests assert on these instead of guessing.
        this.log = [];
        this.counters = {
            createBuild: 0, deleteBuild: 0, selectBuild: 0,
            editMode: 0, saveEdits: 0, heroSwitch: 0, browserOpen: 0, shopOpen: 0,
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
        // The XML declares class="CitadelHudHeroShop gShopOpen" on the type of the
        // same name, so the panel carries BOTH a type and a matching class. Modelling
        // only the type made FindChildrenWithClassTraverse("CitadelHudHeroShop") miss
        // it — a lookup that works in-game.
        this.shopPanel = root.addChild(mk("CitadelHudHeroShop", {
            id: "CitadelHudHeroShop", classes: ["CitadelHudHeroShop"]
        }));

        // citadel_hud_hero_shop.xml:56. `shopModsBuild` is declared on the type itself
        // (citadel_shop_mods_build.xml:20), so every instance carries it — which is the
        // only reliable handle on this panel, because its id is NOT dependable: the
        // Panorama debugger showed the live instance in-game under a different id than
        // the XML declares, and the mod's own build-payload manifest records duplicate
        // instances of which only one is live (manifest.js:317).
        this.selectedBuild = this.shopPanel.addChild(
            mk("CitadelShopModsBuild", { id: "ShopModsSelectedBuild", classes: ["shopModsBuild"] })
        );

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
        this.buildDescEntry = editBuildSection.addChild(
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

    /**
     * Console commands the client actually answers.
     *
     * `citadel_open_hero_sheet` is the real shop command and it TOGGLES — sending it
     * again while the shop is open closes it (verified in-game 2026-08-24). Modelling
     * it as open-only would hide the bug it exists to catch: a caller that re-sends
     * the command every tick until it sees gShopOpen keeps closing what the previous
     * tick opened, so it never converges on a machine where the shop takes longer to
     * appear than the retry interval.
     *
     * `open_item_shop` is NOT answered on purpose. It is a string in the client
     * binary and the engine logs RunConCommand for it, but it did not open the shop
     * in a live hideout session. The simulator used to treat it as working, which is
     * why a pipeline built on it passed headlessly and then failed in-game.
     */
    _conCommand(cmd) {
        const hero = cmd.match(/^selecthero\s+(\S+)/);
        if (hero) return this.switchHero(hero[1]);
        if (cmd === "citadel_open_hero_sheet") {
            return (this.shopOpen || this.shopOpenPending) ? this.closeShop() : this.openShop();
        }
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
            description: s.description ?? "",
            categories: (s.categories ?? ["Core Items"]).map((name) => ({ name })),
            id: s.id ?? i + 1,
            // Not the local player's. #HeroBuildList holds both — the My Builds /
            // Public tabs only switch visibility through CSS, and the row's own
            // class is the discriminator (Panorama debugger 2026-08-25):
            //   CitadelHeroBuildsSelector .HeroBuildListItem { visibility: collapse; }
            //   CitadelHeroBuildsSelector.ShowMyBuilds .HeroBuildListItem… { visible; }
            // Modelled as the presence or absence of MyBuild and nothing more. The
            // live row also carried HidePublic and ActiveBuild; what those mean is
            // unverified, so they are deliberately not modelled rather than guessed.
            isPublic: s.isPublic === true,
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
    // Governs the SHOP HEADER title label (.SelectedBuildName) only. Nothing has
    // ever handed that label's text back to us, so it stays unreadable under TOKEN
    // mode — guessing against ourselves.
    //
    // It deliberately does NOT govern the browser row's .BuildName label: the
    // Panorama debugger (2026-08-23) shows that one holding the literal build name,
    // so modelling it as unreadable would make the suite weaker than the game.
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
            // Real placement, from the Panorama debugger 2026-08-25:
            //   #Hud > PopupManager.PopupManager.HaveActivePopups
            //          ├─ Button#BlurBackground.Hidden
            //          ├─ Panel#DimBackground          <- popupbackground="dim"
            //          └─ PopupBuildBrowser#BrowseBuilds.PopupPanel
            // It was modelled as a bare child of #Hud with no id, which quietly made
            // two things untestable: the popup is reached by walking UP from the
            // selector to a .PopupPanel, and that walk now has a PopupManager above it;
            // and #DimBackground is a panel this mod dims by id, so a model without one
            // could never show it missing. The engine's own dim backdrop is also the
            // likeliest explanation for "everything else looks dimmed" — it veils the
            // screen behind the popup with no help from us.
            if (!this.popupManager || !this.popupManager.IsValid()) {
                this.popupManager = this.doc.root.addChild(
                    this.doc.create("PopupManager", {
                        id: "PopupManager",
                        classes: ["PopupManager", "HaveActivePopups"],
                    })
                );
                this.blurBackground = this.popupManager.addChild(
                    this.doc.create("Button", { id: "BlurBackground", classes: ["Hidden"] })
                );
                this.dimBackground = this.popupManager.addChild(
                    this.doc.create("Panel", { id: "DimBackground" })
                );
            }
            this.popupPanel = this.popupManager.addChild(
                this.doc.create("PopupBuildBrowser", { id: "BrowseBuilds", classes: ["PopupPanel", "Hidden"] })
            );
            const header = this.popupPanel.addChild(this.doc.create("Panel", { id: "Header" }));
            // Sibling of the selector, and present from inflation onward — which is
            // why it is not a "list is ready" signal.
            this.createBuildButton = header.addChild(
                this.doc.create("Button", { id: "CreateBuildButton" })
            );
            // citadel_popup_build_browser.xml:11 declares
            //   onmouseactivate="CitadelHudHeroBuildsCreateNewBuild(); UIPopupButtonClicked();"
            // The second call DISMISSES THE POPUP. Modelling only the create hid a
            // real bug completely: the verify stage reads Label.BuildDescription from
            // inside this popup, so a first-ever save wrote its 214 chars and then
            // reported "save not confirmed by the build (details read back 0 chars)".
            // Confirmed in-game 2026-08-25 with that exact wording.
            this.createBuildButton.SetPanelEvent("onmouseactivate", () => {
                this.createNewBuild();
                this.closeBuildBrowser();
            });

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
            // citadel_ui_build_selector.xml — the details pane is a SIBLING of the
            // list inside .MainContainer, and it follows the list's selection.
            this.buildDetailsPanel = main.addChild(
                this.doc.create("CitadelBuildDetails", { id: "BuildDetails" })
            );
            const detailsInfo = this.buildDetailsPanel.addChild(
                this.doc.create("Panel", { id: "BuildInfo" })
            );
            // citadel_ui_build_details.xml:29. Declared as
            // text="#Citadel_HeroBuilds_BuildDescription" -> {s:selected_hero_build_description},
            // BUT the live tree shows the RESOLVED user string here (Panorama
            // debugger, 2026-08-23). So .text is a real read on this label, unlike
            // the category-name label modelled under TITLE_MODE.TOKEN.
            this.buildDescriptionLabel = detailsInfo.addChild(
                this.doc.create("Label", { classes: ["BuildDescription"] })
            );
            this.editBuildButton = detailsInfo.addChild(
                this.doc.create("Button", { id: "EditBuildButton" })
            );
            this.editBuildButton.SetPanelEvent("onmouseactivate", () => this.editSelectedBuild());

            // citadel_popup_build_browser.xml:16-23 — the .ButtonRow. Two buttons that
            // differ ONLY by class and handler, never by anything language-independent
            // in their labels. Modelled because pressing the wrong one is the worst
            // outcome in this file: confirm applies the selected build to the player's
            // own loadout, silently, while trying to tidy up after a save.
            const buttonRow = this.popupPanel.addChild(
                this.doc.create("Panel", { classes: ["ButtonRow", "LeftRightFlow"] })
            );
            this.confirmBuildButton = buttonRow.addChild(
                this.doc.create("Button", { classes: ["SecondaryButton", "fill", "light"] })
            );
            this.confirmBuildButton.SetAttributeString(
                "onactivate", "CitadelBuildBrowserPopupConfirmBuild()"
            );
            this.confirmBuildButton.SetPanelEvent("onactivate", () => {
                this.confirmedBuildApplied = true;   // the mistake we assert never happens
                this._trace("CONFIRM pressed — build applied to the player");
                this.closeBuildBrowser();
            });
            this.cancelBuildButton = buttonRow.addChild(
                this.doc.create("Button", { classes: ["SecondaryButton", "outline"] })
            );
            this.cancelBuildButton.SetAttributeString("onactivate", "UIPopupButtonClicked()");
            this.cancelBuildButton.SetPanelEvent("onactivate", () => this.closeBuildBrowser());
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
            const rowClasses = ["HeroBuildListItem"];
            if (!build.isPublic) rowClasses.push("MyBuild");
            const item = this.buildListPanel.addChild(
                this.doc.create("Panel", {
                    id: `HeroBuildListItem_${i}`,
                    classes: rowClasses,
                })
            );
            if (i === this.selectedIndex) item.AddClass("Selected");
            const label = item.addChild(this.doc.create("Label", { classes: ["BuildName"] }));
            // Verified literal in the live tree: the debugger shows
            // text="QOLLOCK-Settings" on this label, so the name can be read
            // straight out of a list row without selecting it. This is NOT under
            // TITLE_MODE — that guard covers the category label, which stays
            // unverified.
            label.text = build.title;
            label.SetDialogVariable("selected_hero_build_name", build.title);
            item.SetPanelEvent("onactivate", () => this.selectBuild(i));
        });

        // The details pane mirrors whichever row is Selected. CanEditBuild is the
        // client's own "this build is yours" flag (every build here is the local
        // player's, so it is unconditional in the model).
        const selected = this.selectedBuildData;
        this.buildDescriptionLabel.text = selected ? String(selected.description || "") : "";
        this.buildDetailsPanel.SetHasClass("CanEditBuild", !!selected);
        this.buildDetailsPanel.SetHasClass("CanDeleteBuild", !!selected);
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

    /** Dismiss the popup — Cancel, oncancel, and the confirm path all route here. */
    closeBuildBrowser() {
        if (!this.browseOpen) return true;
        this._trace("closeBuildBrowser");
        this.browseOpen = false;
        this.buildsLoading = false;
        if (this.popupPanel && this.popupPanel.IsValid()) {
            this.popupPanel.SetHasClass("Hidden", true);
        }
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
        // Counted, not just flagged. A caller that closes the shop and reopens it is
        // invisible to a boolean but obvious in a counter, and reopening a shop the
        // player is no longer expecting is a full-brightness flash of UI they were
        // never meant to see.
        this.counters.shopOpen++;
        this._trace("openShop");
        this.shopOpenPending = true;
        const gen = ++this._shopGen;
        this.clock.schedule(this.latency.shopOpenMs / 1000, () => {
            // A toggle arrived while this open was in flight — it cancelled us.
            if (gen !== this._shopGen) return;
            this.shopOpenPending = false;
            this.shopOpen = true;
            // gShopOpen is a GLOBAL class, mirrored by the engine onto panels that
            // declare a <GlobalClassListener> (citadel_hud_hero_builds.xml:21).
            //
            // The absolute root is NOT one of them. Panorama-debugger capture
            // 2026-08-24: Panel#CitadelHudRoot carries the QOLLOCK theme classes and
            // no gShopOpen, while CitadelHud#Hud and #gameplay_hud both carry it.
            // Setting it on absRoot here made every root-level probe pass in the
            // simulator regardless of which panel the code under test looked at,
            // which is exactly the kind of miss this harness exists to catch.
            this.doc.root.AddClass("gShopOpen");
            this.shopPanel.AddClass("gShopOpen");
            this.heroBuildsPanel.AddClass("gShopOpen");
            this._renderAll();
        });
        return true;
    }

    closeShop() {
        this._shopGen++;              // invalidate any open still in flight
        this.shopOpenPending = false;
        this.shopOpen = false;
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
                description: "",
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

    /**
     * Delete the selected build — behind a confirm popup, as the client does.
     *
     * GROUND TRUTH (Panorama debugger, 2026-08-22): pressing #DeleteBuildButton in
     * the browser's #BuildDetails does NOT delete. It inflates
     * `PopupGeneric#DeleteHeroBuildWarning` titled "Delete Hero Build" with
     * `#Button0.PopupButton.IsAutoConfirm` (label "OK") and
     * `#Button1.PopupButton.IsAutoCancel`. The build goes away only once Button0 is
     * activated.
     *
     * Modelling the delete as immediate made the mod's two-step delete path
     * (TryTriggerBuildDeleteAction returns mode "confirm", then the pipeline runs the
     * reselect_after_delete stage) untestable: the model deleted on the first press,
     * so the confirm stage never ran in any test and a break there could not fail.
     *
     * IsAutoConfirm/IsAutoCancel appear nowhere in the vanilla layout or CSS dump, so
     * C++ applies them when it builds the popup — which is also why matching on that
     * class rather than the "OK" label is language-independent.
     */
    deleteSelectedBuild() {
        if (this.selectedIndex < 0 || this.selectedIndex >= this.builds.length) return false;
        if (this.deletePopup && this.deletePopup.IsValid()) return false;   // already asking
        const target = this.selectedIndex;
        this._trace(`deleteSelectedBuild(${target}) "${this.builds[target].title}" -> confirm popup`);

        this.deletePopup = this.doc.root.addChild(
            this.doc.create("PopupGeneric", { id: "DeleteHeroBuildWarning", classes: ["PopupPanel"] })
        );
        this.deletePopup.addChild(this.doc.create("Label", {
            classes: ["TitleLabel", "h2", "silvered_align_center"], text: "Delete Hero Build",
        }));
        const row = this.deletePopup.addChild(this.doc.create("Panel", { classes: ["PopupButtonRow"] }));
        const container = row.addChild(this.doc.create("Panel", { classes: ["ButtonContainer"] }));
        const confirm = container.addChild(this.doc.create("Button", {
            id: "Button0", classes: ["PopupButton", "IsAutoConfirm"],
        }));
        confirm.addChild(this.doc.create("Label", { text: "OK" }));
        const cancel = container.addChild(this.doc.create("Button", {
            id: "Button1", classes: ["PopupButton", "IsAutoCancel"],
        }));
        cancel.addChild(this.doc.create("Label", { text: "Cancel" }));

        confirm.SetPanelEvent("onactivate", () => this._commitDelete(target));
        confirm.SetPanelEvent("onmouseactivate", () => this._commitDelete(target));
        cancel.SetPanelEvent("onactivate", () => this._dismissDeletePopup());
        cancel.SetPanelEvent("onmouseactivate", () => this._dismissDeletePopup());
        return true;
    }

    _dismissDeletePopup() {
        if (this.deletePopup && this.deletePopup.IsValid()) this.deletePopup.DeleteAsync(0);
        this.deletePopup = null;
    }

    _commitDelete(index) {
        this._dismissDeletePopup();
        if (index < 0 || index >= this.builds.length) return false;
        this.counters.deleteBuild++;
        const removed = this.builds[index];
        this._trace(`confirmDelete(${index}) "${removed.title}"`);
        this.builds.splice(index, 1);
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
                this.buildDescEntry.text = String(data.description || "");
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
        // The description is written wholesale, so an empty field genuinely clears
        // it — unlike title/category below, which keep their old value when blank.
        const description = String(this.buildDescEntry.text || "");
        this._trace(`saveEdits(${idx}) title="${title}" category="${categoryName.slice(0, 40)}" desc=${description.length}ch`);
        this.clock.schedule(this.latency.saveEditsMs / 1000, () => {
            const data = this.builds[idx];
            if (data) {
                if (title) data.title = title;
                data.description = description;
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

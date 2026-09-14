// =============================================================================
// QOLLOCK — ui/arcade_tab.js
// =============================================================================
// OWNS:        Arcade and Custom Gamemodes (MOG) settings tab:
//              Arcade game launch triggers (Minesweeper, Blackjack, Flappy, etc.),
//              On-death game enable/disable toggles,
//              Difficulty buttongroup configuration,
//              MOG community server info card & website dispatch,
//              Arcade & MOG tab rendering and window registration.
// DOES NOT OWN: Game logic / Minigame modals (owned by arcade subsystem),
//               Config persistence (core/ql_persistence.js, core/ql_config_store.js).
// DEPENDS ON:  core/ql_namespace.js, ui/renderer.js
// USED BY:     hud_escape_menu.xml, ui/window.js, ql_settings.js
// =============================================================================

(() => {
    "use strict";

    const Q = (typeof globalThis !== "undefined" && globalThis.QOL)
        ? globalThis.QOL
        : (typeof QOL !== "undefined" ? QOL : (globalThis.QOL = {}));
    Q.ui = Q.ui || {};

    // =========================================================================
    // Arcade Configuration & Game Definitions
    // =========================================================================

    const ARCADE_DEFAULT_DIFFICULTY_OPTIONS = [
        { label: "Easy", id: "EASY", value: "EASY" },
        { label: "Medium", id: "MEDIUM", value: "MEDIUM" },
        { label: "Hard", id: "HARD", value: "HARD" }
    ];

    const ARCADE_GAMES = [
        {
            name: "Bebop Sweeper",
            actionKey: "OPEN_MINESWEEPER",
            onDeathKey: "ON_DEATH_GAME_MINESWEEPER",
            launch: () => {
                if (Q.arcade?.openMinesweeper) Q.arcade.openMinesweeper();
            }
        },
        {
            name: "Wraithjack",
            actionKey: "OPEN_BLACKJACK",
            onDeathKey: "ON_DEATH_GAME_BLACKJACK",
            launch: () => {
                if (Q.arcade?.openBlackjack) Q.arcade.openBlackjack();
            }
        },
        {
            name: "Flappy Bat",
            actionKey: "OPEN_FLAPPY_BIRD",
            onDeathKey: "ON_DEATH_GAME_FLAPPY_BAT",
            launch: () => {
                if (Q.arcade?.openFlappy) Q.arcade.openFlappy();
            }
        },
        {
            name: "Graves Trainer",
            actionKey: "OPEN_AIM_TRAINER",
            onDeathKey: "ON_DEATH_GAME_GRAVES_TRAINER",
            launch: () => {
                if (Q.arcade?.openAimTrainer) Q.arcade.openAimTrainer();
            }
        },
        {
            name: "Zerggy Mania",
            actionKey: "OPEN_TRAIN_TRACKING",
            onDeathKey: "ON_DEATH_GAME_ZERGGY_MANIA",
            launch: () => {
                if (Q.arcade?.openTrainTracking) Q.arcade.openTrainTracking();
            }
        },
        {
            name: "Whack a Rem",
            actionKey: "OPEN_WHACK_A_REM",
            onDeathKey: "ON_DEATH_GAME_WHACK_A_REM",
            launch: () => {
                if (Q.arcade?.openWhackRem) Q.arcade.openWhackRem();
            }
        }
    ];

    // =========================================================================
    // Game Row Builder
    // =========================================================================

    function createArcadeGameRow(parent, game) {
        if (!parent || !game) return null;

        const row = $.CreatePanel("Panel", parent, `ArcadeGameRow_${game.actionKey}`);
        row.AddClass("SettingRow");
        row.AddClass("RowTypeAction");
        row.AddClass("ArcadeGameRow");

        const labelContainer = $.CreatePanel("Panel", row, "");
        labelContainer.AddClass("SettingLabelContainer");

        const titleLabel = $.CreatePanel("Label", labelContainer, "");
        titleLabel.AddClass("SettingRowTitle");
        titleLabel.text = (typeof LocalizeSettingsText === "function")
            ? LocalizeSettingsText(game.name, true)
            : game.name;

        const actionGroup = $.CreatePanel("Panel", row, "");
        actionGroup.AddClass("SettingActionGroup");
        actionGroup.AddClass("SettingControlRoot");
        actionGroup.AddClass("ArcadePlayActionGroup");

        // 1. Play Button
        const playBtn = $.CreatePanel("Button", actionGroup, `PlayBtn_${game.actionKey}`);
        playBtn.AddClass("SettingActionBtn");
        playBtn.AddClass("ArcadePlayActionBtn");

        const btnInner = $.CreatePanel("Panel", playBtn, "");
        btnInner.AddClass("SettingActionBtnInner");

        const btnLabel = $.CreatePanel("Label", btnInner, "");
        btnLabel.AddClass("SettingActionBtnLabel");
        btnLabel.text = (typeof LocalizeSettingsText === "function")
            ? LocalizeSettingsText("Play", true)
            : "Play";

        playBtn.SetPanelEvent("onactivate", () => {
            if (typeof game.launch === "function") {
                game.launch();
            }
        });

        // 2. On Death Checkbox
        if (game.onDeathKey) {
            const onDeathKey = game.onDeathKey;
            const onDeathBtn = $.CreatePanel("ToggleButton", actionGroup, `OnDeath_${onDeathKey}`);
            onDeathBtn.AddClass("CitadelSettingsCheckbox");
            onDeathBtn.AddClass("MultiCheckboxBtn");
            onDeathBtn.AddClass("ArcadeOnDeathCheckBtn");

            const onDeathLbl = $.CreatePanel("Label", onDeathBtn, "");
            onDeathLbl.AddClass("MultiCheckboxLabel");
            onDeathLbl.AddClass("ArcadeOnDeathCheckLabel");
            onDeathLbl.text = (typeof LocalizeSettingsText === "function")
                ? LocalizeSettingsText("Play When On Death Enabled", true)
                : "Play When On Death Enabled";

            const syncVisual = () => {
                if (!onDeathBtn || !onDeathBtn.IsValid || !onDeathBtn.IsValid()) return;
                const val = (typeof globalThis.MOD_CONFIG === "object" && globalThis.MOD_CONFIG)
                    ? (Number(globalThis.MOD_CONFIG[onDeathKey]) === 1)
                    : false;
                try { onDeathBtn.SetSelected(val); } catch (_) {}
                onDeathBtn.SetHasClass("selected", val);
                onDeathBtn.SetHasClass("IsSelected", val);
                onDeathBtn.SetHasClass("Active", val);
            };
            syncVisual();

            onDeathBtn.SetPanelEvent("onactivate", () => {
                if (typeof globalThis.MOD_CONFIG === "object" && globalThis.MOD_CONFIG) {
                    const nextVal = (Number(globalThis.MOD_CONFIG[onDeathKey]) === 1) ? 0 : 1;
                    globalThis.MOD_CONFIG[onDeathKey] = nextVal;
                    if (typeof globalThis.SaveAndSync === "function") globalThis.SaveAndSync();
                }
                syncVisual();
            });
        }

        return row;
    }

    // =========================================================================
    // Arcade Tab Content Renderer
    // =========================================================================

    function renderArcadeTab(list) {
        if (!list) return;

        const createTitle = (typeof globalThis.CreateSectionTitle === "function")
            ? globalThis.CreateSectionTitle
            : ((p, t) => Q.ui?.renderer?.createSectionHeader?.(p, t));
        const createRow = (typeof globalThis.CreateRow === "function")
            ? globalThis.CreateRow
            : null;
        const createSep = (typeof globalThis.CreateSeparator === "function")
            ? globalThis.CreateSeparator
            : ((p) => Q.ui?.renderer?.createSeparator?.(p));

        // 1. Game Settings Section
        createTitle(list, "Game Settings");
        if (createRow) {
            createRow(list, "Game Audio", "ENABLE_GAME_AUDIO", "toggle", null, null, null, null, "Enable sounds in arcade games.");
            createRow(list, "Difficulty", "GAME_DEFAULT_DIFFICULTY", "buttongroup", null, null, null, ARCADE_DEFAULT_DIFFICULTY_OPTIONS, "Default difficulty when opening games.");
            createRow(list, "On Death", "ENABLE_ON_DEATH_GAMES", "toggle", null, null, null, null, "Randomly opens an enabled arcade game while dead.");
        }

        createSep(list);

        // 2. Games List Section
        createTitle(list, "Games");
        for (let i = 0; i < ARCADE_GAMES.length; i++) {
            createArcadeGameRow(list, ARCADE_GAMES[i]);
        }
    }

    // =========================================================================
    // MOG Tab Content Renderer
    // =========================================================================

    function renderMogTab(list) {
        if (!list) return;

        const createTitle = (typeof globalThis.CreateSectionTitle === "function")
            ? globalThis.CreateSectionTitle
            : ((p, t) => Q.ui?.renderer?.createSectionHeader?.(p, t));
        const createRow = (typeof globalThis.CreateRow === "function")
            ? globalThis.CreateRow
            : null;

        const mogNoteWrap = $.CreatePanel("Panel", list, "MogTabNoteWrap");
        mogNoteWrap.AddClass("ConsoleTabNoteWrap");
        mogNoteWrap.AddClass("MogTabNoteWrap");
        mogNoteWrap.AddClass("SupportHeroCard");

        const mogNoteTitle = $.CreatePanel("Label", mogNoteWrap, "MogTabNoteTitle");
        mogNoteTitle.AddClass("SupportTabSectionTitle");
        mogNoteTitle.AddClass("MogTabNoteTitle");
        mogNoteTitle.text = "MOGLOCK";

        const mogNoteList = $.CreatePanel("Panel", mogNoteWrap, "MogTabNoteList");
        mogNoteList.AddClass("SupportHeroBulletList");
        mogNoteList.AddClass("MogTabNoteList");

        const mogInfoRow = $.CreatePanel("Panel", mogNoteList, "");
        mogInfoRow.AddClass("SupportHeroBullet");
        mogInfoRow.AddClass("MogTabNoteBullet");

        const mogInfoMarker = $.CreatePanel("Panel", mogInfoRow, "");
        mogInfoMarker.AddClass("SupportHeroBulletMarker");
        mogInfoMarker.AddClass("MogTabNoteMarker");

        const mogNoteText = $.CreatePanel("Label", mogInfoRow, "MogTabNoteText");
        mogNoteText.AddClass("SupportTabText");
        mogNoteText.AddClass("SupportHeroBulletLabel");
        mogNoteText.AddClass("MogTabNoteText");
        mogNoteText.text = (typeof LocalizeSettingsText === "function")
            ? LocalizeSettingsText("MOG is Deadlock's first custom gamemode community server network.", true)
            : "MOG is Deadlock's first custom gamemode community server network.";

        const mogLinkRow = $.CreatePanel("Panel", mogNoteList, "");
        mogLinkRow.AddClass("SupportHeroBullet");
        mogLinkRow.AddClass("MogTabNoteBullet");
        mogLinkRow.AddClass("MogTabSiteLine");

        const mogLinkMarker = $.CreatePanel("Panel", mogLinkRow, "");
        mogLinkMarker.AddClass("SupportHeroBulletMarker");
        mogLinkMarker.AddClass("MogTabNoteMarker");

        const mogLinkContent = $.CreatePanel("Panel", mogLinkRow, "MogTabSiteLineContent");
        mogLinkContent.AddClass("MogTabSiteLineContent");

        const mogLinkPrefix = $.CreatePanel("Label", mogLinkContent, "MogTabSiteLinkPrefix");
        mogLinkPrefix.AddClass("SupportTabText");
        mogLinkPrefix.AddClass("SupportHeroBulletLabel");
        mogLinkPrefix.AddClass("MogTabSiteLinkPrefix");
        mogLinkPrefix.text = (typeof LocalizeSettingsText === "function")
            ? LocalizeSettingsText("Check out our site to join", true)
            : "Check out our site to join";

        const mogLinkBtn = $.CreatePanel("Button", mogLinkContent, "MogTabSiteLink");
        mogLinkBtn.AddClass("MogTabSiteLink");

        const mogLinkLbl = $.CreatePanel("Label", mogLinkBtn, "MogTabSiteLinkLabel");
        mogLinkLbl.AddClass("MogTabSiteLinkLabel");
        mogLinkLbl.text = "moglock.gg";

        mogLinkBtn.SetPanelEvent("onactivate", () => {
            if (typeof $.DispatchEvent === "function") {
                $.DispatchEvent("ExternalBrowserGoToURL", "https://moglock.gg");
            }
        });

        // Gamemodes Section
        createTitle(list, "Gamemodes");
        if (createRow) {
            createRow(list, "BHOP UI", "ENABLE_BHOP", "toggle", null, null, null, null, "For custom BHop gamemode UI changes.");
        }
    }

    // Register tab renderers with window manager
    if (Q.ui?.window?.registerTabRenderer) {
        Q.ui.window.registerTabRenderer("Arcade", renderArcadeTab);
        Q.ui.window.registerTabRenderer("MOG", renderMogTab);
    }

    // =========================================================================
    // Public API Export & Backwards Compatibility
    // =========================================================================

    const arcadeTabApi = {
        render: renderArcadeTab,
        renderArcadeTab,
        renderMogTab,
        createArcadeGameRow,
        ARCADE_DEFAULT_DIFFICULTY_OPTIONS,
        ARCADE_GAMES,
    };

    Q.ui.arcadeTab = arcadeTabApi;

    if (typeof globalThis === "object" && globalThis) {
        globalThis.ARCADE_DEFAULT_DIFFICULTY_OPTIONS = ARCADE_DEFAULT_DIFFICULTY_OPTIONS;
        globalThis.RenderArcadeTabContent = renderArcadeTab;
        globalThis.RenderMogTabContent = renderMogTab;
    }
})();

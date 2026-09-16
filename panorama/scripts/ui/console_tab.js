// =============================================================================
// QOLLOCK — ui/console_tab.js
// =============================================================================
// OWNS:        Console and Runtime CVars settings tab:
//              Engine ConCommand dispatching (CitadelConCommand),
//              Runtime slider state & execution for minimap engine cvars,
//              Runtime buttongroup state for statistics / hitmarkers cvars,
//              Console notes hero card and section reset actions,
//              Console tab rendering and window registration.
// DOES NOT OWN: Mod config persistence (runtime cvars are not saved in MOD_CONFIG),
//               Settings window lifecycle (handled by ui/window.js).
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
    // Options & Runtime Definitions
    // =========================================================================

    const HITMARKERS_RUNTIME_OPTIONS = [
        { label: "Off", command: "citadel_crosshair_hit_marker_duration 0.000000" },
        { label: "On", command: "citadel_crosshair_hit_marker_duration 0.100000" }
    ];

    const SHOW_MEMORY_RUNTIME_OPTIONS = [
        { label: "Off", command: "cl_showmem 0" },
        { label: "On", command: "cl_showmem 1" }
    ];

    const SHOW_POSITION_RUNTIME_OPTIONS = [
        { label: "Off", command: "cl_showpos 0" },
        { label: "On", command: "cl_showpos 1" }
    ];

    const SHOW_TICK_RUNTIME_OPTIONS = [
        { label: "Off", command: "cl_showtick 0" },
        { label: "On", command: "cl_showtick 1" }
    ];

    const SHOW_FPS_RUNTIME_OPTIONS = [
        { label: "Off", command: "cl_showfps 0" },
        { label: "On", command: "cl_showfps 1" }
    ];

    const SHOW_FRAME_RUNTIME_OPTIONS = [
        { label: "Off", command: "cl_showframenumber false" },
        { label: "On", command: "cl_showframenumber true" }
    ];

    const RUNTIME_SLIDER_DEFS = [
        {
            label: "Click Radius",
            key: "RUNTIME_MINIMAP_CLICK_RADIUS",
            command: "citadel_minimap_unit_click_radius",
            defaultValue: 200,
            min: 0,
            max: 1000,
            step: 25,
            description: "The click hitbox of your pings or clicks, this can help make pings more accurate."
        },
        {
            label: "Icon Shrink",
            key: "RUNTIME_MINIMAP_ICON_SHRINK",
            command: "citadel_minimap_max_icon_shrink",
            defaultValue: 0.7,
            min: 0,
            max: 3,
            step: 0.1,
            description: "How much icons will shrink when overlapping with others."
        },
        {
            label: "Hero Icon Size",
            key: "RUNTIME_MINIMAP_HERO_ICON_SIZE",
            command: "citadel_minimap_player_width",
            defaultValue: 6.5,
            min: 0,
            max: 24,
            step: 0.5,
            description: "The size of other players on the minimap."
        },
        {
            label: "Player Icon Size",
            key: "RUNTIME_MINIMAP_PLAYER_ICON_SIZE",
            command: "citadel_minimap_local_player_width",
            defaultValue: 12,
            min: 0,
            max: 24,
            step: 0.5,
            description: "The size of yourself on the minimap."
        },
        {
            label: "Shrink Distance",
            key: "RUNTIME_MINIMAP_SHRINK_DISTANCE",
            command: "citadel_minimap_overlap_scan_distance",
            defaultValue: 10,
            min: 0,
            max: 20,
            step: 1,
            description: "The distance threshold in which icons will start shrinking. Lower is more accurate positions, higher is easier visibility."
        },
        {
            label: "Zip Thickness",
            key: "RUNTIME_MINIMAP_ZIP_THICKNESS",
            command: "citadel_minimap_zip_line_thickness",
            defaultValue: 2,
            min: 0,
            max: 10,
            step: 0.5,
            description: "The thickness of the Zipline lines across the map."
        },
        {
            label: "Refresh Rate",
            key: "RUNTIME_MINIMAP_REFRESH_RATE",
            command: "minimap_update_rate_hz",
            defaultValue: 60,
            min: 15,
            max: 360,
            step: 15,
            description: "How fast the minimap refreshes."
        }
    ];

    // =========================================================================
    // ConCommand Dispatch
    // =========================================================================

    function runConsoleCommand(commandText) {
        if (!commandText || commandText.length === 0) return false;
        try {
            $.DispatchEvent("CitadelConCommand", commandText);
            return true;
        } catch (_) {
            return false;
        }
    }

    function runConsoleCommandBestEffort(commandText) {
        return runConsoleCommand(commandText);
    }

    // =========================================================================
    // Runtime State & Reset Handlers
    // =========================================================================

    const runtimeSliderState = {};
    const runtimeSliderResetters = {};
    const runtimeButtonGroupState = {
        HITMARKERS_RUNTIME: 1,
        RUNTIME_STATS_SHOWMEM: 0,
        RUNTIME_STATS_SHOWPOS: 0,
        RUNTIME_STATS_SHOWTICK: 0,
        RUNTIME_STATS_SHOWFPS: 0,
        RUNTIME_STATS_SHOWFRAME: 0
    };

    function resetRuntimeSlider(key) {
        const resetFn = runtimeSliderResetters[key];
        if (typeof resetFn === "function") {
            resetFn();
            return true;
        }
        return false;
    }

    function setRuntimeSliderValue(key, command, value) {
        runtimeSliderState[key] = value;
        runConsoleCommandBestEffort(`${command} ${value}`);
    }

    function resetSectionRuntimeRows(sectionKey) {
        let changed = 0;
        if (sectionKey === "Minimap") {
            for (const def of RUNTIME_SLIDER_DEFS) {
                if (runtimeSliderState[def.key] !== undefined && runtimeSliderState[def.key] !== def.defaultValue) {
                    resetRuntimeSlider(def.key);
                    changed++;
                }
            }
        } else if (sectionKey === "Statistics") {
            const statKeys = [
                { key: "RUNTIME_STATS_SHOWMEM", cmd: "cl_showmem 0" },
                { key: "RUNTIME_STATS_SHOWPOS", cmd: "cl_showpos 0" },
                { key: "RUNTIME_STATS_SHOWTICK", cmd: "cl_showtick 0" },
                { key: "RUNTIME_STATS_SHOWFPS", cmd: "cl_showfps 0" },
                { key: "RUNTIME_STATS_SHOWFRAME", cmd: "cl_showframenumber false" }
            ];
            for (const item of statKeys) {
                if (runtimeButtonGroupState[item.key] !== 0) {
                    runtimeButtonGroupState[item.key] = 0;
                    runConsoleCommandBestEffort(item.cmd);
                    changed++;
                }
            }
        } else if (sectionKey === "General") {
            if (runtimeButtonGroupState.HITMARKERS_RUNTIME !== 1) {
                runtimeButtonGroupState.HITMARKERS_RUNTIME = 1;
                runConsoleCommandBestEffort("citadel_crosshair_hit_marker_duration 0.100000");
                changed++;
            }
        }
        return changed;
    }

    // =========================================================================
    // UI Builders
    // =========================================================================

    function createConsoleNotesCard(container) {
        const noteWrap = $.CreatePanel("Panel", container, "ConsoleTabNoteWrap");
        noteWrap.AddClass("ConsoleTabNoteWrap");
        noteWrap.AddClass("SupportHeroCard");

        const noteTitle = $.CreatePanel("Label", noteWrap, "ConsoleTabNoteTitle");
        noteTitle.AddClass("SupportTabSectionTitle");
        noteTitle.AddClass("ConsoleTabNoteTitle");
        noteTitle.text = (typeof LocalizeSettingsText === "function")
            ? LocalizeSettingsText("Console Notes", true)
            : "Console Notes";

        const noteList = $.CreatePanel("Panel", noteWrap, "ConsoleTabNoteList");
        noteList.AddClass("SupportHeroBulletList");
        noteList.AddClass("ConsoleTabNoteList");

        const lines = [
            "These are easy access to common console commands and are not included in QOL settings.",
            "Use autoexec or other methods to load these automatically."
        ];

        for (let i = 0; i < lines.length; i++) {
            const row = $.CreatePanel("Panel", noteList, "");
            row.AddClass("SupportHeroBullet");
            row.AddClass("ConsoleTabNoteBullet");

            const marker = $.CreatePanel("Panel", row, "");
            marker.AddClass("SupportHeroBulletMarker");
            marker.AddClass("ConsoleTabNoteMarker");

            const label = $.CreatePanel("Label", row, "");
            label.AddClass("SupportTabText");
            label.AddClass("SupportHeroBulletLabel");
            label.AddClass("ConsoleTabNoteText");
            label.text = (typeof LocalizeSettingsText === "function")
                ? LocalizeSettingsText(lines[i], true)
                : lines[i];
        }
        return noteWrap;
    }

    function renderConsoleTab(list) {
        if (!list && !globalThis.gSearchCollectMode) return;

        const createRow = (typeof globalThis.CreateRow === "function")
            ? globalThis.CreateRow
            : null;
        const createSep = (typeof globalThis.CreateSeparator === "function")
            ? globalThis.CreateSeparator
            : ((p) => Q.ui?.renderer?.createSeparator?.(p));
        const createTitle = (typeof globalThis.CreateRuntimeSectionTitle === "function")
            ? globalThis.CreateRuntimeSectionTitle
            : ((p, t) => {
                if (typeof globalThis.CreateSectionTitle === "function") {
                    return globalThis.CreateSectionTitle(p, t);
                }
                return Q.ui?.renderer?.createSectionHeader?.(p, t);
            });

        // 1. Console Notes Hero Card
        if (!globalThis.gSearchCollectMode) createConsoleNotesCard(list);

        // 2. General Section (Hitmarkers)
        createTitle(list, "General");
        if (createRow) {
            createRow(list, "Hitmarkers", "HITMARKERS_RUNTIME", "runtime_buttongroup", null, null, null, HITMARKERS_RUNTIME_OPTIONS);
        }

        createSep(list);

        // 3. Minimap Section (Runtime Sliders)
        createTitle(list, "Minimap");
        if (createRow) {
            for (const def of RUNTIME_SLIDER_DEFS) {
                createRow(
                    list,
                    def.label,
                    def.key,
                    "runtime_slider",
                    def.min,
                    def.max,
                    def.step,
                    [{ command: def.command, defaultValue: def.defaultValue }],
                    def.description
                );
            }
        }

        createSep(list);

        // 4. Statistics Section (Runtime Buttongroups)
        createTitle(list, "Statistics");
        if (createRow) {
            createRow(list, "Show Memory", "RUNTIME_STATS_SHOWMEM", "runtime_buttongroup", null, null, null, SHOW_MEMORY_RUNTIME_OPTIONS, "RAM and GPU Memory real time usage statistics.");
            createRow(list, "Show Position", "RUNTIME_STATS_SHOWPOS", "runtime_buttongroup", null, null, null, SHOW_POSITION_RUNTIME_OPTIONS, "Position and Velocity real time statistics.");
            createRow(list, "Show Tick", "RUNTIME_STATS_SHOWTICK", "runtime_buttongroup", null, null, null, SHOW_TICK_RUNTIME_OPTIONS, "Shows real time tick information, mostly useless.");
            createRow(list, "Show FPS", "RUNTIME_STATS_SHOWFPS", "runtime_buttongroup", null, null, null, SHOW_FPS_RUNTIME_OPTIONS, "Shows raw FPS count.");
            createRow(list, "Show Frame", "RUNTIME_STATS_SHOWFRAME", "runtime_buttongroup", null, null, null, SHOW_FRAME_RUNTIME_OPTIONS, "Shows current frame count, mostly useless.");
        }
    }

    // Register tab with window manager if available
    if (Q.ui?.window?.registerTabRenderer) {
        Q.ui.window.registerTabRenderer("Console", renderConsoleTab);
    }

    // =========================================================================
    // Public API Export & Backwards Compatibility
    // =========================================================================

    const consoleTabApi = {
        runConsoleCommand,
        runConsoleCommandBestEffort,
        resetRuntimeSlider,
        setRuntimeSliderValue,
        resetSectionRuntimeRows,
        render: renderConsoleTab,
        createConsoleNotesCard,
        HITMARKERS_RUNTIME_OPTIONS,
        SHOW_MEMORY_RUNTIME_OPTIONS,
        SHOW_POSITION_RUNTIME_OPTIONS,
        SHOW_TICK_RUNTIME_OPTIONS,
        SHOW_FPS_RUNTIME_OPTIONS,
        SHOW_FRAME_RUNTIME_OPTIONS,
        RUNTIME_SLIDER_DEFS,
        runtimeSliderState,
        runtimeButtonGroupState,
    };

    Q.ui.consoleTab = consoleTabApi;

    if (typeof globalThis === "object" && globalThis) {
        globalThis.RunConsoleCommand = runConsoleCommand;
        globalThis.RunConsoleCommandBestEffort = runConsoleCommandBestEffort;
        globalThis.HITMARKERS_RUNTIME_OPTIONS = HITMARKERS_RUNTIME_OPTIONS;
        globalThis.SHOW_MEMORY_RUNTIME_OPTIONS = SHOW_MEMORY_RUNTIME_OPTIONS;
        globalThis.SHOW_POSITION_RUNTIME_OPTIONS = SHOW_POSITION_RUNTIME_OPTIONS;
        globalThis.SHOW_TICK_RUNTIME_OPTIONS = SHOW_TICK_RUNTIME_OPTIONS;
        globalThis.SHOW_FPS_RUNTIME_OPTIONS = SHOW_FPS_RUNTIME_OPTIONS;
        globalThis.SHOW_FRAME_RUNTIME_OPTIONS = SHOW_FRAME_RUNTIME_OPTIONS;
    }
})();

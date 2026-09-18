// tests/ui_tooltips.test.js
// =============================================================================
// Unit tests for Settings Tooltips subsystem (panorama/scripts/ql_settings_tooltips.js)
// =============================================================================

"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const { Document } = require("../scripts/simulator/panel.js");
const { Clock, makeVirtualDate } = require("../scripts/simulator/clock.js");

function createTestEnvironment() {
    const clock = new Clock(10000);
    const doc = new Document(clock);
    const rootPanel = doc.create("Panel", { id: "Root" });
    const settingsWin = doc.create("Panel", { id: "SettingsWindow" });
    const list = doc.create("Panel", { id: "SettingsList" });
    const scrollBar = doc.create("Panel", { id: "VerticalScrollBar" });
    const scrollThumb = doc.create("Panel", { id: "ScrollThumb" });
    scrollBar.addChild(scrollThumb);
    list.addChild(scrollBar);
    settingsWin.addChild(list);
    rootPanel.addChild(settingsWin);

    // Dimensions
    rootPanel.actuallayoutwidth = 1920;
    rootPanel.actuallayoutheight = 1080;
    settingsWin.actuallayoutwidth = 800;
    settingsWin.actuallayoutheight = 600;
    settingsWin.actualxoffset = 400;
    settingsWin.actualyoffset = 200;
    list.actuallayoutwidth = 600;
    list.actuallayoutheight = 500;
    list.actualxoffset = 100;
    list.actualyoffset = 50;

    const mockDollar = {
        Msg: () => {},
        Schedule: (delaySec, cb) => clock.schedule(delaySec, cb),
        CancelScheduled: (id) => clock.cancel(id),
        CreatePanel: (type, parent, id) => {
            const p = doc.create(type, { id: id || "" });
            p.style = {};
            if (id === "QOLSettingsRowFloatingTooltip") {
                p.actuallayoutwidth = 250;
                p.actuallayoutheight = 80;
            }
            if (parent && typeof parent.addChild === "function") {
                parent.addChild(p);
            }
            return p;
        },
        GetContextPanel: () => rootPanel,
        DispatchEvent: () => {},
        RegisterEventHandler: () => {},
        Localize: (s) => s
    };

    const ctx = {
        Date: makeVirtualDate(clock),
        $: mockDollar,
        QOL: {
            import: () => ({ utils: { WarnLog: () => {} } }),
            tooltip: {}
        },
        globalThis: null,
        window: {},
        FindRootPanel: () => rootPanel,
        LocalizeSettingsText: (s) => String(s || ""),
        WarnLog: () => {},
        GetPanelXOffsetWithinAncestor: (panel, ancestor) => {
            if (!panel || !ancestor) return 0;
            let total = 0;
            let cur = panel;
            while (cur && cur !== ancestor) {
                total += Number(cur.actualxoffset || 0);
                cur = cur.GetParent ? cur.GetParent() : null;
            }
            return total;
        },
        GetPanelYOffsetWithinAncestor: (panel, ancestor) => {
            if (!panel || !ancestor) return 0;
            let total = 0;
            let cur = panel;
            while (cur && cur !== ancestor) {
                total += Number(cur.actualyoffset || 0);
                cur = cur.GetParent ? cur.GetParent() : null;
            }
            return total;
        }
    };

    ctx.globalThis = ctx;
    require("./load_ui_helpers")(ctx);
    vm.createContext(ctx);

    // Load metadata first
    const metadataPath = path.resolve(__dirname, "../panorama/scripts/ui/ql_settings_metadata.js");
    vm.runInContext(fs.readFileSync(metadataPath, "utf8"), ctx);

    // Load tooltips
    const tooltipsPath = path.resolve(__dirname, "../panorama/scripts/ql_settings_tooltips.js");
    vm.runInContext(fs.readFileSync(tooltipsPath, "utf8"), ctx);

    return { ctx, doc, clock, rootPanel, settingsWin, list, scrollBar, scrollThumb };
}

test("ui/tooltips: exports required public API on QOL.tooltip", () => {
    const { ctx } = createTestEnvironment();
    const tooltip = ctx.QOL.tooltip;
    assert.strictEqual(typeof tooltip.showRowTooltip, "function");
    assert.strictEqual(typeof tooltip.hideRowTooltip, "function");
    assert.strictEqual(typeof tooltip.hideTooltipDeferred, "function");
    assert.strictEqual(typeof tooltip.cancelHide, "function");
    assert.strictEqual(typeof tooltip.isVisible, "function");
    assert.strictEqual(typeof tooltip.suppressForMs, "function");
    assert.strictEqual(typeof tooltip.isSuppressed, "function");
});

test("ui/tooltips: suppression blocks tooltips and expires after duration", () => {
    const { ctx, clock } = createTestEnvironment();
    const tooltip = ctx.QOL.tooltip;

    assert.strictEqual(tooltip.isSuppressed(), false);
    tooltip.suppressForMs(250, "test");
    assert.strictEqual(tooltip.isSuppressed(), true);

    clock.advance(300);
    assert.strictEqual(tooltip.isSuppressed(), false);
});

test("ui/tooltips: position places list row tooltip outside SettingsWindow to the right without scrollbar overlap", () => {
    const { ctx, doc, clock, rootPanel, settingsWin, list } = createTestEnvironment();
    const row = doc.create("Panel", { id: "TestRow" });
    row.actuallayoutwidth = 580;
    row.actuallayoutheight = 40;
    row.actualxoffset = 10;
    row.actualyoffset = 80;
    list.addChild(row);

    const tooltip = ctx.QOL.tooltip;
    tooltip.showRowTooltip(row, "", "Test tooltip description", "none", "Author");

    // Advance past cold-hover debounce (100ms)
    clock.advance(150);

    const floatingTooltip = rootPanel.FindChildTraverse("QOLSettingsRowFloatingTooltip");
    assert.ok(floatingTooltip, "Floating tooltip panel must be created");

    // Position check:
    // settingsWin: x = 400, width = 800 -> right edge is 1200
    // Tooltip should be at 1200 + gap(8) = 1208px
    assert.strictEqual(floatingTooltip.style.x, "1208px");
});

test("ui/tooltips: position flips to left of SettingsWindow when right edge does not fit", () => {
    const { ctx, doc, clock, rootPanel, settingsWin, list } = createTestEnvironment();
    // Move settingsWin close to right edge
    rootPanel.actuallayoutwidth = 1280;
    settingsWin.actualxoffset = 600;
    settingsWin.actuallayoutwidth = 650; // right edge is 1250px, only 30px remains on right

    const row = doc.create("Panel", { id: "TestRow" });
    row.actuallayoutwidth = 580;
    row.actuallayoutheight = 40;
    row.actualxoffset = 10;
    row.actualyoffset = 80;
    list.addChild(row);

    const tooltip = ctx.QOL.tooltip;
    tooltip.showRowTooltip(row, "", "Test tooltip description", "none", "Author");
    clock.advance(150);

    const floatingTooltip = rootPanel.FindChildTraverse("QOLSettingsRowFloatingTooltip");
    assert.ok(floatingTooltip);

    // xLeft = winX(600) - panelWidth(250) - gap(8) = 342px
    assert.strictEqual(floatingTooltip.style.x, "342px");
});

test("ui/tooltips: mouseout triggers deferred hide and cancelHide aborts pending hide", () => {
    const { ctx, doc, clock, list } = createTestEnvironment();
    const row = doc.create("Panel", { id: "TestRow" });
    row.actuallayoutwidth = 580;
    row.actuallayoutheight = 40;
    row.actualxoffset = 10;
    row.actualyoffset = 80;
    list.addChild(row);

    const tooltip = ctx.QOL.tooltip;
    tooltip.showRowTooltip(row, "", "Test tooltip description", "none", "Author");
    clock.advance(150);

    assert.strictEqual(tooltip.isVisible(), true);

    // Mouseout initiates deferred hide with 60ms grace period
    tooltip.hideTooltipDeferred("row_mouseout");
    assert.strictEqual(tooltip.isVisible(), true, "Tooltip remains visible during grace period");

    // Advance 30ms (within grace period) and cancel
    clock.advance(30);
    tooltip.cancelHide();
    clock.advance(60);
    assert.strictEqual(tooltip.isVisible(), true, "Tooltip remains visible when cancelHide is called");

    // Deferred hide completes when not cancelled
    tooltip.hideTooltipDeferred("row_mouseout");
    clock.advance(80);
    assert.strictEqual(tooltip.isVisible(), false, "Tooltip hides after deferred duration");
});

test("ui/tooltips: position flips to left of SettingsWindow when RightSide (Friends list) leaves insufficient space", () => {
    const { ctx, doc, clock, rootPanel, settingsWin, list } = createTestEnvironment();
    // 1080p layout: screen is 1920 wide, SettingsWindow is at x=600, w=720 (right edge=1320)
    rootPanel.actuallayoutwidth = 1920;
    settingsWin.actualxoffset = 600;
    settingsWin.actuallayoutwidth = 720;

    // Friends list begins at x=1480 (space on right is 1480 - 1320 = 160px < 250 + 8)
    const rightSide = doc.create("Panel", { id: "RightSide" });
    rightSide.actuallayoutwidth = 440;
    rightSide.actualxoffset = 1480;
    rootPanel.addChild(rightSide);

    const row = doc.create("Panel", { id: "TestRow" });
    row.actuallayoutwidth = 580;
    row.actuallayoutheight = 40;
    row.actualxoffset = 10;
    row.actualyoffset = 80;
    list.addChild(row);

    const tooltip = ctx.QOL.tooltip;
    tooltip.showRowTooltip(row, "", "Test tooltip description", "none", "Author");
    clock.advance(150);

    const floatingTooltip = rootPanel.FindChildTraverse("QOLSettingsRowFloatingTooltip");
    assert.ok(floatingTooltip);

    // Because space to right is less than tipW + gap, it places cleanly to the left:
    // x = winX(600) - tipW(250) - gap(8) = 342px
    assert.strictEqual(floatingTooltip.style.x, "342px");
});

test("ui/tooltips: rows outside visible list viewport cannot show tooltips", () => {
    const { ctx, doc, clock, list } = createTestEnvironment();
    // list is at Y = 250 in host (winY 200 + listY 50), height 500 -> visible range Y 250 to 750
    // row placed far below viewport
    const row = doc.create("Panel", { id: "OffscreenRow" });
    row.actuallayoutwidth = 580;
    row.actuallayoutheight = 40;
    row.actualxoffset = 10;
    row.actualyoffset = 900; // anchorY in host = 200 + 50 + 900 = 1150
    list.addChild(row);

    const tooltip = ctx.QOL.tooltip;
    tooltip.showRowTooltip(row, "", "Test tooltip description", "none", "Author");
    clock.advance(200);

    assert.strictEqual(tooltip.isVisible(), false, "Off-screen row must not show tooltip");
});

test("ui/tooltips: cold hover is debounced, warm hover transitions immediately", () => {
    const { ctx, doc, clock, list } = createTestEnvironment();
    const row1 = doc.create("Panel", { id: "Row1" });
    row1.actuallayoutwidth = 580;
    row1.actuallayoutheight = 40;
    row1.actualxoffset = 10;
    row1.actualyoffset = 60;
    list.addChild(row1);

    const row2 = doc.create("Panel", { id: "Row2" });
    row2.actuallayoutwidth = 580;
    row2.actuallayoutheight = 40;
    row2.actualxoffset = 10;
    row2.actualyoffset = 110;
    list.addChild(row2);

    const tooltip = ctx.QOL.tooltip;

    // Cold hover on Row1
    tooltip.showRowTooltip(row1, "", "Tooltip 1", "none", "Author");
    assert.strictEqual(tooltip.isVisible(), false, "Must not be visible immediately on cold hover");

    // Advance 50ms (less than 100ms debounce)
    clock.advance(50);
    assert.strictEqual(tooltip.isVisible(), false, "Must still be waiting for debounce");

    // Advance past 100ms
    clock.advance(60);
    assert.strictEqual(tooltip.isVisible(), true, "Must become visible after debounce");

    // Warm switch to Row2
    tooltip.showRowTooltip(row2, "", "Tooltip 2", "none", "Author");
    assert.strictEqual(tooltip.isVisible(), true, "Must switch immediately in warm mode");
});

test("ui/tooltips: scroll motion while visible automatically hides tooltip and sets suppression", () => {
    const { ctx, doc, clock, list, scrollThumb } = createTestEnvironment();
    const row = doc.create("Panel", { id: "ScrollTestRow" });
    row.actuallayoutwidth = 580;
    row.actuallayoutheight = 40;
    row.actualxoffset = 10;
    row.actualyoffset = 80;
    list.addChild(row);

    const tooltip = ctx.QOL.tooltip;
    tooltip.showRowTooltip(row, "", "Description", "none", "Author");
    clock.advance(150);
    assert.strictEqual(tooltip.isVisible(), true, "Tooltip should be visible initially");

    // Simulate scrolling by moving scroll thumb
    scrollThumb.actualyoffset = 50;

    // Advance past tracking interval (30ms)
    clock.advance(35);

    assert.strictEqual(tooltip.isVisible(), false, "Tooltip must hide when scroll motion occurs");
    assert.strictEqual(tooltip.isSuppressed(), true, "Scroll motion must trigger suppression");

    // During suppression, attempting to open another tooltip is blocked
    tooltip.showRowTooltip(row, "", "Description", "none", "Author");
    clock.advance(150);
    assert.strictEqual(tooltip.isVisible(), false, "Tooltip must not open while scroll-suppressed");

    // After suppression expires (250ms), tooltip can open again
    clock.advance(260);
    assert.strictEqual(tooltip.isSuppressed(), false, "Suppression must expire");
    tooltip.showRowTooltip(row, "", "Description", "none", "Author");
    clock.advance(150);
    assert.strictEqual(tooltip.isVisible(), true, "Tooltip can open after suppression expires");
});

test("ui/tooltips: hovering a row after scrolling opens tooltip reliably without being dropped", () => {
    const { ctx, doc, clock, list, scrollThumb } = createTestEnvironment();
    const row1 = doc.create("Panel", { id: "Row1" });
    row1.actuallayoutwidth = 580;
    row1.actuallayoutheight = 40;
    row1.actualxoffset = 10;
    row1.actualyoffset = 80;
    list.addChild(row1);

    const row2 = doc.create("Panel", { id: "Row2" });
    row2.actuallayoutwidth = 580;
    row2.actuallayoutheight = 40;
    row2.actualxoffset = 10;
    row2.actualyoffset = 140;
    list.addChild(row2);

    const tooltip = ctx.QOL.tooltip;

    // Show on row1, then hide
    tooltip.showRowTooltip(row1, "", "Tooltip 1", "none", "Author");
    clock.advance(150);
    assert.strictEqual(tooltip.isVisible(), true);
    tooltip.hideRowTooltip();
    assert.strictEqual(tooltip.isVisible(), false);

    // User scrolls the list while tooltip is closed
    scrollThumb.actualyoffset = 120;
    clock.advance(300); // 300ms passes after scroll stopped

    // Now user hovers row2: should show after cold-hover delay, NOT be discarded by stale scroll change
    tooltip.showRowTooltip(row2, "", "Tooltip 2", "none", "Author");
    clock.advance(150);
    assert.strictEqual(tooltip.isVisible(), true, "Tooltip on row2 must show after scroll has stopped");
});

test("ui/tooltips: elements inside SettingsWindow anchor outside the window, never on the scrollbar", () => {
    const { ctx, doc, clock, rootPanel, settingsWin, list } = createTestEnvironment();
    // Create an anchor at the far right of the list (e.g. a reset button or narrow control right beside scrollbar)
    const resetBtn = doc.create("Panel", { id: "ResetBtn" });
    resetBtn.actuallayoutwidth = 24;
    resetBtn.actuallayoutheight = 24;
    resetBtn.actualxoffset = 570; // far right of list (width 600)
    resetBtn.actualyoffset = 100;
    list.addChild(resetBtn);

    const tooltip = ctx.QOL.tooltip;
    tooltip.showRowTooltip(resetBtn, "", "Reset this setting", "none", "Author");
    clock.advance(150);

    const floatingTooltip = rootPanel.FindChildTraverse("QOLSettingsRowFloatingTooltip");
    assert.ok(floatingTooltip, "Tooltip must be created");

    // settingsWin: x = 400, width = 800 -> right edge is 1200
    // Tooltip must be outside SettingsWindow at 1200 + gap(8) = 1208px, NOT at anchorX + anchorW (570 + 24 = 594px)
    assert.strictEqual(floatingTooltip.style.x, "1208px", "Tooltip must anchor to SettingsWindow exterior, never the scrollbar");
});

test("ui/tooltips: scrolled row inside visible list viewport displays tooltip correctly", () => {
    const { ctx, doc, clock, rootPanel, list } = createTestEnvironment();
    // Simulate list scrolled down by 600px
    list.actualscrolloffset_y = 600;

    const row = doc.create("Panel", { id: "ScrolledRow" });
    row.actuallayoutwidth = 580;
    row.actuallayoutheight = 40;
    row.actualxoffset = 10;
    row.actualyoffset = 800; // un-scrolled layoutY = 200 + 50 + 800 = 1050; scrolled = 450 (inside 250..750)
    list.addChild(row);

    const tooltip = ctx.QOL.tooltip;
    tooltip.showRowTooltip(row, "", "Scrolled item description", "none", "Author");
    clock.advance(150);

    assert.strictEqual(tooltip.isVisible(), true, "Scrolled row must show tooltip");
    const floatingTooltip = rootPanel.FindChildTraverse("QOLSettingsRowFloatingTooltip");
    assert.ok(floatingTooltip);
    assert.strictEqual(floatingTooltip.style.y, "430px");
});

test("ui/tooltips: row tooltip aligns vertically with GameUI cursor position when available", () => {
    const { ctx, doc, clock, rootPanel, list } = createTestEnvironment();
    ctx.GameUI = {
        GetCursorPosition: () => ({ x: 800, y: 460 })
    };

    const row = doc.create("Panel", { id: "CursorRow" });
    row.actuallayoutwidth = 580;
    row.actuallayoutheight = 40;
    row.actualxoffset = 10;
    row.actualyoffset = 1200; // far below unscrolled fold
    list.addChild(row);

    const tooltip = ctx.QOL.tooltip;
    tooltip.showRowTooltip(row, "", "Cursor positioned item", "none", "Author");
    clock.advance(150);

    assert.strictEqual(tooltip.isVisible(), true, "Row hovered by cursor must show tooltip");
    const floatingTooltip = rootPanel.FindChildTraverse("QOLSettingsRowFloatingTooltip");
    assert.ok(floatingTooltip);
    // targetY = 460 - (80 * 0.5) = 420px
    assert.strictEqual(floatingTooltip.style.y, "420px");
});

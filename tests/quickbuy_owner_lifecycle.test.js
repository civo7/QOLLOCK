"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { Sandbox } = require("../scripts/simulator/sandbox");
const { parseLayoutScripts } = require("../scripts/simulator/layout");

function fixture({ enhanced = true, notify = true, missing = false } = {}) {
    const sandbox = new Sandbox({ name: "quickbuy owner" });
    const $ = sandbox.global.$;
    const add = (parent, id, type = "Panel", className = "") => {
        const panel = $.CreatePanel(type, parent, id);
        if (className) panel.AddClass(className);
        if (type === "Image") panel.SetImage = value => { panel.renderedImage = String(value); };
        return panel;
    };
    const hud = sandbox.doc.root, core = add(hud, "", "Panel", "HudCore");
    const stats = add(core, "StatsAndModsContainer"), lower = add(stats, "LowerLeft");
    const host = add(lower, "CitadelHudQuickbuy");
    if (enhanced) host.AddClass("enhanced_quickbuy_active");
    if (notify) host.AddClass("shop_click_to_notify_active");
    let context = add(host, "", "Panel", "HudQuickbuy");
    $.GetContextPanel = () => context;
    const retired = add(sandbox.doc.root, "RetiredNativeGeneration");
    const gold = add(core, "CurrentGoldAmount"), souls = add(gold, "hudCurGoldLabel", "Label"); souls.text = "100";
    const chat = () => {
        const panel = add(sandbox.doc.root, "Chat"), controls = add(panel, "ChatControls");
        const input = add(controls, "ChatInput", "TextEntry"), target = add(controls, "ChatTargetLabel", "Label");
        target.text = "To (TEAM):";
        return { panel, controls, input, target };
    };
    const initialChat = chat();
    const body = target => {
        const outer = add(target, "", "Panel", "QuickbuyQueueOuter");
        const queue = add(outer, "QuickbuyQueue"), sales = add(outer, "QuickbuySellQueue");
        const total = add(target, "QuickbuyShopTotalCostLabel", "Label");
        const next = add(target, "QuickbuyNextSoulsNeededLabel", "Label");
        const previewContainer = add(target, "QuickbuyUpcomingPreviewContainer");
        return { outer, queue, sales, total, next, previewContainer };
    };
    const initialBody = missing ? {} : body(context);
    const entry = (queue, { id = "", name = "Test item", cost = 500, iconPath = "source_icon" } = {}) => {
        const panel = add(queue, id, "CitadelHudQuickbuyEntry", "QuickbuyItem");
        const content = add(panel, "ItemContentPanel"), icon = add(content, "ModIcon", "CitadelModIcon"); icon.AddClass("isWeapon");
        const image = add(icon, "ModIconImage", "Image"); image.SetAttributeString("src", iconPath);
        const tier = add(icon, "mod_tier_label", "Label"); tier.AddClass("ModTierLevel2");
        const namePanel = add(content, "", "Panel", "NamePanel"), costs = add(namePanel, "", "Panel", "CostPanel");
        add(namePanel, "ModName", "Label").text = name;
        const costLabel = add(costs, "ModCost", "Label"); costLabel.text = String(cost);
        const remaining = add(costs, "QueueRemainingSoulsLabel", "Label");
        const divider = add(costs, "", "Label", "QueueRemainingSoulsDivider");
        const goldIcon = add(costs, "goldIcon", "Image");
        const controls = add(panel, "ControlIcons"), notify = add(controls, "NotifyButton"), reorder = add(controls, "ReorderButton");
        let nativeActivations = 0;
        const remove = add(controls, "DeleteButton"); remove.SetPanelEvent("onactivate", () => nativeActivations++);
        return { panel, content, icon, image, tier, namePanel, costs, costLabel, remaining, divider, goldIcon, controls, notify, reorder, remove,
            nativeActivations: () => nativeActivations };
    };
    const preview = (container, index) => {
        const root = add(container, `QuickbuyUpcomingPreview${index}`, "Panel", "QuickbuyUpcomingPreviewSlot");
        const amount = add(root, "", "Panel", "QuickbuyUpcomingPreviewSoulsNeeded");
        const label = add(amount, `QuickbuyUpcomingPreview${index}SoulsNeededLabel`, "Label");
        const mini = add(root, "", "Panel", "QuickbuyUpcomingMini");
        const target = entry(mini, { id: `QuickbuyPreview${index}Entry` });
        return { root, label, mini, ...target };
    };
    const events = [];
    const dispatch = $.DispatchEvent;
    $.DispatchEvent = (name, ...args) => { events.push({ name, args }); return dispatch(name, ...args); };
    const load = () => {
        const layout = parseLayoutScripts(path.resolve(__dirname, "../panorama/layout/hud_quickbuy.xml"));
        assert.deepEqual(layout.missing, []);
        for (const script of layout.scripts) sandbox.load(script.absPath);
        assert.deepEqual(sandbox.loadErrors, []);
        assert.equal(sandbox.global.QOL, undefined, "the native companion has its own context");
        sandbox.clock.advance(0);
    };
    const refresh = () => sandbox.dispatch("CitadelQuickbuyItemsChanged");
    const flags = (activeEnhanced, activeNotify) => {
        host.SetHasClass("enhanced_quickbuy_active", activeEnhanced);
        host.SetHasClass("shop_click_to_notify_active", activeNotify);
        refresh();
    };
    const clean = () => {
        $.GetContextPanel = () => null;
        refresh(); sandbox.clock.advance(1000);
        assert.equal(sandbox.clock.pendingCount(), 0);
        assert.deepEqual(sandbox.clock.errors, []);
        assert.deepEqual(sandbox.doc.eventErrors, []);
    };
    return { sandbox, $, clock: sandbox.clock, add, hud, core, lower, host, retired, souls, initialChat, chat, body, entry, preview,
        ...initialBody, context, setContext: value => { context = value; }, events, load, refresh, flags, clean };
}

test("quickbuy owns native cost styles only while notify is active and preserves native callbacks", () => {
    const e = fixture(); const row = e.entry(e.queue); e.load();
    assert.equal(row.costLabel.style.color, "#d64259");
    assert.equal(row.divider.style.color, "#d8d0c088", "class-only native divider is discovered through the cost panel");
    row.remove.activate(); assert.equal(row.nativeActivations(), 1);
    e.flags(true, false);
    for (const panel of [row.costLabel, row.remaining, row.divider, row.goldIcon]) {
        for (const property of ["color", "washColor", "fontSize", "fontWeight", "verticalAlign"]) assert.equal(panel.style[property], undefined);
    }
    assert.equal(row.remaining.text, "400", "enhanced cost summaries remain active independently");
    assert.equal(row.notify.BHasClass("CanClickToNotify"), false);
    const eventCount = e.events.length; row.notify.activate(); assert.equal(e.events.length, eventCount);
    row.remove.activate(); assert.equal(row.nativeActivations(), 2);
    e.flags(false, true);
    assert.equal(row.costLabel.style.color, "#d64259");
    e.clean(); assert.equal(row.costLabel.style.color, undefined);
});

test("quickbuy preserves upgrade recipe credits, aliases, sell credits and passive souls", () => {
    const e = fixture({ notify: false });
    const first = e.entry(e.queue, { name: "Basic Magazine", cost: 500 });
    const upgrade = e.entry(e.queue, { name: "Titanic Magazine", cost: 3500 });
    const extra = e.entry(e.queue, { name: "Extra Health", cost: 800 });
    e.entry(e.sales, { name: "Sold item", cost: 1200 });
    e.load();
    assert.equal(e.total.text, "3700", "queued alias component discounts the upgrade and sales credit half the source price");
    assert.equal(first.remaining.text, "0");
    assert.equal(upgrade.remaining.text, "2800");
    assert.equal(extra.remaining.text, "3600");
    e.souls.text = "1,600"; e.clock.advance(500);
    assert.equal(upgrade.remaining.text, "1300");
    assert.equal(e.total.text, "3700", "passive souls affect progress rather than the queue purchase total");
    e.clean();
});

test("quickbuy drag cleanup follows an entry reused by the native sell queue", () => {
    const e = fixture(); const row = e.entry(e.queue); e.load();
    row.panel.SetParent(e.sales); e.refresh();
    row.panel.AddClass("Dragging"); e.host.AddClass("DraggingOutside");
    e.sandbox.dispatch("DragEnd", [row.panel]); e.clock.advance(40);
    assert.equal(row.panel.BHasClass("Dragging"), false);
    assert.equal(e.host.BHasClass("DraggingOutside"), false);
    assert.ok(e.events.some(event => event.name === "DropInputFocus"));
    assert.equal(row.costLabel.style.color, undefined, "the sell queue does not retain buy-row notify styling");
    e.clean();
});

test("quickbuy releases live old queue rows and blocks retired notify/drag handlers before the next poll", () => {
    const e = fixture(); const row = e.entry(e.queue); e.load(); e.clock.advance(1200);
    row.panel.SetParent(e.retired);
    const count = e.events.length;
    row.notify.activate(); e.sandbox.dispatch("DragEnd", [row.panel]);
    e.clock.advance(40);
    assert.equal(e.events.length, count, "retired source callbacks cannot send chat or clear current drag state");
    e.refresh();
    assert.equal(row.panel.IsValid(), true);
    assert.equal(row.costLabel.style.color, undefined);
    assert.equal(row.remaining.text, "0");
    assert.equal(row.panel.BHasClass("HasRemainingSoulsNeeded"), false);
    assert.equal(row.notify.BHasClass("CanClickToNotify"), false);
    assert.equal(e.total.text, "0");
    e.clean();
});

test("quickbuy rebinds live style labels and notify buttons within an unchanged queue entry", () => {
    const e = fixture(); const row = e.entry(e.queue); e.load(); e.clock.advance(1200);
    row.costLabel.SetParent(e.retired); row.notify.SetParent(e.retired);
    const cost = e.add(row.costs, "ModCost", "Label"); cost.text = "800";
    const notify = e.add(row.controls, "NotifyButton");
    row.notify.activate(); assert.equal(e.events.some(event => event.name === "CitadelConCommand"), false);
    e.refresh();
    assert.equal(row.costLabel.style.color, undefined);
    assert.equal(cost.style.color, "#d64259");
    assert.equal(row.remaining.text, "700");
    notify.activate(); e.clock.advance(20);
    const submitted = e.events.filter(event => event.name === "CitadelChatInputSubmitted");
    assert.equal(submitted.length, 1);
    assert.equal(submitted[0].args[0], e.initialChat.input);
    e.clean();
});

test("quickbuy preview surfaces and images follow living replacement without stale output", () => {
    const e = fixture({ notify: false }); e.entry(e.queue); const source = e.entry(e.queue, { iconPath: "second_icon" });
    const target = e.preview(e.previewContainer, 2); e.load();
    assert.equal(target.root.BHasClass("HasPreviewItem"), true);
    assert.equal(target.image.renderedImage, "second_icon");
    target.root.SetParent(e.retired);
    const replacement = e.preview(e.previewContainer, 2); e.refresh();
    assert.equal(target.root.BHasClass("HasPreviewItem"), false);
    assert.equal(target.image.renderedImage, "");
    assert.equal(target.label.text, "0");
    assert.equal(replacement.root.BHasClass("HasPreviewItem"), true);
    assert.equal(replacement.image.renderedImage, "second_icon");
    replacement.image.SetParent(e.retired);
    const image = e.add(replacement.icon, "ModIconImage", "Image"); e.refresh();
    assert.equal(image.renderedImage, "second_icon");
    assert.equal(replacement.image.renderedImage, "");
    source.image.SetAttributeString("src", "native_refreshed_icon"); e.clock.advance(500);
    assert.equal(image.renderedImage, "native_refreshed_icon");
    e.clean();
});

test("quickbuy keeps one poll after transient native writes and retries partial cleanup", () => {
    const e = fixture(); const row = e.entry(e.queue);
    let attempts = 0; const styles = row.costLabel.style;
    row.costLabel.style = new Proxy(styles, { set(target, key, value) {
        if (key === "fontSize" && attempts++ === 0) throw new Error("modeled transient native style write");
        target[key] = value; return true;
    } });
    e.load(); assert.equal(e.clock.pendingCount(), 1);
    e.clock.advance(500);
    assert.ok(attempts >= 2); assert.equal(row.costLabel.style.fontSize, "16px");
    assert.equal(row.remaining.text, "400");
    const clear = row.costLabel.ClearPropertyFromCode; let clears = 0;
    row.costLabel.ClearPropertyFromCode = function(name) {
        if (name === "color" && clears++ === 0) return false;
        return clear.call(this, name);
    };
    e.flags(true, false); assert.equal(row.costLabel.style.color, "#d64259");
    e.clock.advance(500); assert.equal(row.costLabel.style.color, undefined);
    assert.ok(clears >= 2); assert.equal(e.clock.pendingCount(), 1);
    assert.ok(e.sandbox.messages.some(message => message.includes("modeled transient native style write")));
    e.clean();
});

test("quickbuy drag handlers stay bounded across settings changes and keep reorder cleanup", () => {
    const e = fixture(); const row = e.entry(e.queue); e.load();
    const count = () => Array.from(e.sandbox.eventHandlers.values()).reduce((sum, listeners) => sum + listeners.length, 0);
    const initial = count();
    for (let i = 0; i < 15; i++) { e.flags(false, false); e.flags(true, true); }
    assert.equal(count(), initial, "native DragEnd/DragDrop are installed once per panel");
    row.panel.AddClass("IsBeingDragged"); row.reorder.AddClass("IsDragSource");
    row.reorder._fire("onmouseup");
    e.clock.advance(31);
    assert.equal(row.panel.BHasClass("IsBeingDragged"), false);
    assert.equal(row.reorder.BHasClass("IsDragSource"), false);
    assert.equal(e.clock.pendingCount(), 1);
    e.flags(false, false);
    const before = e.events.length;
    e.sandbox.dispatch("DragDrop", [row.panel]); row.reorder._fire("onmouseup"); e.clock.advance(31);
    assert.equal(e.events.length, before, "inactive callbacks are retired without replacing native reorder/delete functions");
    e.clean();
});

test("quickbuy cancels pending chat on disable, source removal and destroyed context", () => {
    for (const reason of ["disable", "source", "context"]) {
        const e = fixture(); const row = e.entry(e.queue); e.load(); e.clock.advance(1200);
        row.notify.activate();
        assert.equal(e.events.some(event => event.name === "CitadelConCommand"), true);
        if (reason === "disable") e.flags(true, false);
        if (reason === "source") row.panel.SetParent(e.retired);
        if (reason === "context") e.$.GetContextPanel = () => null;
        e.clock.advance(50);
        assert.equal(e.events.some(event => event.name === "CitadelChatInputSubmitted"), false, reason);
        e.clean();
    }
});

test("quickbuy chat uses live replaced ChatControls inputs and target labels", () => {
    const e = fixture(); const row = e.entry(e.queue); e.load(); e.clock.advance(1200);
    row.notify.activate(); e.clock.advance(20);
    assert.equal(e.events.filter(event => event.name === "CitadelChatInputSubmitted").length, 1);
    e.initialChat.panel.SetParent(e.retired);
    const next = e.chat(); e.clock.advance(1100);
    let submittedText;
    const dispatch = e.$.DispatchEvent;
    e.$.DispatchEvent = (name, ...args) => {
        if (name === "CitadelChatInputSubmitted") submittedText = args[0].text;
        return dispatch(name, ...args);
    };
    row.notify.activate(); e.clock.advance(20);
    const submitted = e.events.filter(event => event.name === "CitadelChatInputSubmitted");
    assert.equal(submitted.length, 2);
    assert.equal(submitted[1].args[0], next.input);
    assert.equal(submittedText, "Need 400 more for Test item");
    next.input.SetParent(e.retired); next.target.SetParent(e.retired);
    const input = e.add(next.controls, "ChatInput", "TextEntry"), target = e.add(next.controls, "ChatTargetLabel", "Label"); target.text = "To (TEAM):";
    e.clock.advance(1100); row.notify.activate(); e.clock.advance(20);
    assert.equal(e.events.filter(event => event.name === "CitadelChatInputSubmitted").at(-1).args[0], input);
    e.clean();
});

test("quickbuy native context replacement releases the previous living generation", () => {
    const e = fixture(); const row = e.entry(e.queue); e.load(); e.clock.advance(1200);
    row.notify.activate();
    const context = e.add(e.host, "ReplacementQuickbuyContext");
    const next = e.body(context); const nextRow = e.entry(next.queue, { cost: 900 });
    e.context.SetParent(e.retired); e.setContext(context); e.refresh(); e.clock.advance(30);
    assert.equal(row.costLabel.style.color, undefined);
    assert.equal(row.notify.BHasClass("CanClickToNotify"), false);
    assert.equal(e.total.text, "0");
    assert.equal(next.total.text, "900"); assert.equal(nextRow.remaining.text, "800");
    assert.equal(e.events.some(event => event.name === "CitadelChatInputSubmitted"), false);
    assert.equal(e.clock.pendingCount(), 1);
    e.clean();
});

test("quickbuy shuts down a still-live detached context when the verified native host is replaced", () => {
    const e = fixture(); const row = e.entry(e.queue); e.load();
    e.host.SetParent(e.retired);
    const host = e.add(e.lower, "CitadelHudQuickbuy"); host.AddClass("enhanced_quickbuy_active");
    e.refresh(); e.clock.advance(1000);
    assert.equal(row.costLabel.style.color, undefined);
    assert.equal(row.panel.IsValid(), true);
    assert.equal(e.clock.pendingCount(), 0);
    const calls = e.events.length; row.notify.activate(); e.sandbox.dispatch("DragEnd", [row.panel]); e.refresh(); e.clock.advance(1000);
    assert.equal(e.clock.pendingCount(), 0); assert.equal(e.events.length, calls);
    e.clean();
});

test("quickbuy releases an orphaned host while the verified native slot is empty", () => {
    const e = fixture(); const row = e.entry(e.queue); e.load();
    e.host.SetParent(e.retired); e.refresh();
    assert.equal(row.costLabel.style.color, undefined);
    assert.equal(e.clock.pendingCount(), 0);
    assert.equal(row.panel.IsValid(), true);
    e.clean();
});

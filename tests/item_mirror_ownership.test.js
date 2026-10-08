"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createHud } = require("../scripts/simulator");
const ID = "ql_item_mirror";

function fixture(patch = {}) {
    const e = createHud({ inHideout: false }); e.assertLoaded();
    const { $, QOL: Q } = e.sandbox.global;
    Q.core.App.shutdown(); e.sandbox.eval("Math.random = () => 0;");
    Q.core.ConfigAdapter.loadFromFlat({ ...e.sandbox.evalJson("QOL.buildDefaultConfig()"),
        ENABLE_PASSIVE_COOLDOWN: 1, ENABLE_OLD_ITEM_COOLDOWNS: 0,
        ITEM_FILTER_DEF_PASSIVE: 1, ITEM_FILTER_OFF_PASSIVE: 1,
        ITEM_FILTER_DEF_ACTIVE: 1, ITEM_FILTER_OFF_ACTIVE: 1,
        PASSIVE_COOLDOWN_SIZE: 40, PASSIVE_COOLDOWN_OPACITY: 0.5,
        PASSIVE_COOLDOWN_X: 3, PASSIVE_COOLDOWN_Y: -2, ...patch });
    let context = e.root;
    $.GetContextPanel = () => context;
    const add = (parent, id = "", classes = [], type = "Panel") => {
        const panel = $.CreatePanel(type, parent, id);
        for (const cls of classes) panel.AddClass(cls);
        return panel;
    };
    function layout(hud) {
        hud.AddClass("joined_team");
        const core = add(hud, "", ["HudCore"]), gameplay = add(core, "gameplay_hud");
        const abilities = add(core, "AbilitiesContainer");
        add(abilities, "abilitiesContainer");
        const stats = add(core, "StatsAndModsContainer"), left = add(stats, "LowerLeft");
        const list = add(left, "ModsContainer", ["ModsContainer"]);
        return { hud, core, gameplay, abilities, stats, left, list };
    }
    const native = layout(e.root), retired = add(null, "RetiredItemGeneration");
    const create = () => Q.core.FeatureRegistry.getManifest(ID).create(Q.core.FeatureRegistry.createContext(ID));
    let feature = create();
    function buy(list = native.list, id = "ModIcon0", itemClass = "medicBullets", cooldown = "8") {
        const owner = add(list, id, ["hasAbility", "isWeapon", "isTier1", "isPassiveItem", cooldown ? "OnCooldown" : "OffCooldown"], "CitadelModIcon");
        const container = add(owner, "modIconContainer", ["mod_icon_single_container", itemClass]);
        const image = add(container, "ModIconImage", [], "Image");
        image.SetAttributeString("src", "file://{images}/items/weapon/restorative_shot.psd");
        const mask = add(container, "CooldownMask"); mask.style.clip = "radial(50% 50%, 0deg, 180deg)";
        const label = add(owner, "Countdown", ["Countdown"], "Label"); label.text = cooldown;
        return { owner, container, image, mask, label };
    }
    function set(patch) { Q.core.ConfigStore.load({ [ID]: patch }); feature.onSettingsChanged(); e.clock.advance(0); }
    function start() { feature.onEnable(); e.clock.advance(0); }
    function stop() { feature.onDisable(); e.clock.advance(0); }
    function replaceHud() {
        const hud = add(null, "Hud", [], "CitadelHud");
        const next = layout(hud); context = hud;
        return next;
    }
    const overlay = (hud = context) => hud.FindChildTraverse("QOLItemMirrorRoot");
    const slots = () => overlay()?.FindChildTraverse("QOLItemMirrorRow").Children().filter(panel => panel.style.visibility !== "collapse") || [];
    function ready(item) { item.owner.RemoveClass("OnCooldown"); item.owner.AddClass("OffCooldown"); item.mask.style.visibility = "collapse"; item.label.text = ""; }
    return { ...e, $, Q, native, retired, add, layout, buy, set, start, stop, replaceHud, overlay, slots, ready,
        recreate: () => { feature = create(); }, feature: () => feature };
}
const text = slot => slot.FindChildrenWithClassTraverse("QOLItemMirrorCooldownText")[0];
const readyPanel = slot => slot.FindChildrenWithClassTraverse("QOLItemMirrorReadyOverlay")[0];

test("Advanced mirror follows a new living HUD and reapplies accepted geometry", () => {
    const e = fixture(); e.buy(); e.start();
    const oldOverlay = e.overlay(), oldSlot = e.slots()[0];
    const next = e.replaceHud(); e.buy(next.list, "ModIcon0", "medicBullets", "21");
    e.clock.advance(130);
    assert.equal(oldOverlay.IsValid(), false); assert.equal(oldSlot.IsValid(), false);
    assert.equal(e.native.hud.IsValid(), true, "retired native HUD remains engine-owned");
    assert.equal(e.overlay().GetParent(), next.gameplay);
    assert.equal(e.overlay().style.marginLeft, "3%");
    assert.equal(e.overlay().FindChildTraverse("QOLItemMirrorRow").style.opacity, "0.50");
    assert.equal(text(e.slots()[0]).text, "21");
    e.stop(); assert.deepEqual(e.clock.errors, []);
});

test("Advanced mirror detects a living inventory owner replacement before its periodic scan", () => {
    const e = fixture(); const first = e.buy(); e.start();
    e.native.stats.SetParent(e.retired);
    const stats = e.add(e.native.core, "StatsAndModsContainer"), left = e.add(stats, "LowerLeft");
    const list = e.add(left, "ModsContainer", ["ModsContainer"]);
    e.buy(list, "ModIcon0", "medicBullets", "32");
    e.clock.advance(130);
    assert.equal(text(e.slots()[0]).text, "32");
    assert.equal(first.owner.IsValid(), true);
    first.label.text = "99"; e.clock.advance(130);
    assert.equal(text(e.slots()[0]).text, "32", "detached living sources cannot drive current presentation");
    e.stop(); assert.deepEqual(e.clock.errors, []);
});

test("Advanced mirror retires a living icon and binds its late native image and mask", () => {
    const e = fixture(); const first = e.buy(); e.start();
    first.owner.SetParent(e.retired);
    const current = e.buy(e.native.list, "ModIcon0", "medicBullets", "15"); e.clock.advance(130);
    assert.equal(text(e.slots()[0]).text, "15");
    current.mask.SetParent(e.retired);
    const mask = e.add(current.container, "CooldownMask"); mask.style.clip = "radial(50% 50%, 0deg, 300deg)";
    e.clock.advance(130);
    assert.equal(e.slots()[0].FindChildTraverse("CooldownMask").style.clip, mask.style.clip);
    current.image.SetParent(e.retired);
    const image = e.add(current.container, "ModIconImage", [], "Image");
    image.SetAttributeString("src", "file://{images}/items/weapon/restorative_shot.psd"); e.clock.advance(130);
    assert.equal(e.slots()[0].FindChildTraverse("ModIconImage").style.visibility, "visible");
    assert.equal(current.image.IsValid(), true); assert.equal(current.mask.IsValid(), true);
    e.stop(); assert.deepEqual(e.clock.errors, []);
});

for (const piece of ["gameplay", "row", "image", "mask", "text", "ready"]) {
    test("Advanced mirror rebuilds a living replaced " + piece + " without retaining old signatures", () => {
        const e = fixture(); e.buy(); e.start();
        const oldSlot = e.slots()[0], oldOverlay = e.overlay();
        const panels = { gameplay: e.native.gameplay, row: oldOverlay.FindChildTraverse("QOLItemMirrorRow"),
            image: oldSlot.FindChildTraverse("ModIconImage"), mask: oldSlot.FindChildTraverse("CooldownMask"),
            text: text(oldSlot), ready: readyPanel(oldSlot) };
        const replaced = panels[piece]; replaced.SetParent(e.retired);
        if (piece === "gameplay") e.add(e.native.core, "gameplay_hud");
        e.clock.advance(130);
        assert.notEqual(e.slots()[0], oldSlot); assert.equal(oldSlot.IsValid(), false);
        if (piece !== "gameplay") assert.equal(replaced.IsValid(), false, "reparented QOLLOCK children are still owned");
        assert.equal(text(e.slots()[0]).text, "8");
        assert.equal(e.overlay().style.marginLeft, "3%");
        assert.equal(e.overlay().FindChildTraverse("QOLItemMirrorRow").style.opacity, "0.50");
        e.stop(); assert.deepEqual(e.clock.errors, []);
    });
}

for (const phase of ["pending", "active"]) {
    for (const transition of ["disable", "shop", "filter"]) {
        test("Advanced mirror cancels " + phase + " ready feedback on " + transition, () => {
            const e = fixture(); const item = e.buy(); e.start();
            const observation = e.Q.core.Scheduler.startWorkObservation();
            const flash = readyPanel(e.slots()[0]);
            e.ready(item); e.clock.advance(120);
            if (phase === "active") e.clock.advance(20);
            assert.equal(observation.sample().pendingOnce, 1);
            if (phase === "active") assert.equal(flash.BHasClass("ready_flash"), true);
            if (transition === "disable") e.stop();
            else if (transition === "shop") { e.native.abilities.AddClass("gShopOpen"); e.clock.advance(130); }
            else e.set({ ITEM_FILTER_DEF_PASSIVE: 0 });
            assert.equal(observation.sample().pendingOnce, 0);
            if (flash.IsValid()) assert.equal(flash.BHasClass("ready_flash"), false);
            e.clock.advance(700);
            assert.equal(observation.sample().pendingOnce, 0);
            if (flash.IsValid()) assert.equal(flash.BHasClass("ready_flash"), false);
            e.stop(); observation.stop(); assert.deepEqual(e.clock.errors, []);
        });
    }
}

test("Advanced mirror applies settings immediately and retries incomplete style writes", () => {
    const e = fixture(); e.buy(); e.start(); const overlay = e.overlay();
    let remaining = 2;
    overlay.style = new Proxy(overlay.style, { set(target, key, value) {
        if (key === "marginLeft" && remaining-- > 0) throw new Error("native margin write rejected");
        target[key] = value; return true;
    } });
    e.set({ PASSIVE_COOLDOWN_X: 9, PASSIVE_COOLDOWN_Y: 5, PASSIVE_COOLDOWN_SIZE: 60, PASSIVE_COOLDOWN_OPACITY: 0.7 });
    assert.equal(overlay.style.uiScale, "150%");
    assert.equal(overlay.style.marginTop, "-5%");
    assert.equal(overlay.FindChildTraverse("QOLItemMirrorRow").style.opacity, "0.70");
    assert.equal(overlay.style.marginLeft, "3%");
    e.clock.advance(250); assert.equal(overlay.style.marginLeft, "9%");
    const writes = [];
    overlay.style = new Proxy(overlay.style, { set(target, key, value) { writes.push(key); target[key] = value; return true; } });
    e.clock.advance(600);
    assert.equal(writes.length, 0, "steady presentation avoids static/layout rewrites");
    e.stop(); assert.deepEqual(e.clock.errors, []);
});

test("Advanced mirror unwinds partial child creation and retries with one complete slot", () => {
    const e = fixture(); const item = e.buy();
    const create = e.$.CreatePanel; let reject = true;
    e.$.CreatePanel = (type, parent, id, ...args) => {
        if (reject && id === "CooldownMask" && parent.BHasClass("QOLItemMirrorViewport")) {
            reject = false; throw new Error("native mirror-mask creation rejected");
        }
        return create(type, parent, id, ...args);
    };
    assert.throws(() => e.start(), /mirror-mask creation rejected/);
    e.clock.advance(0);
    assert.equal(e.overlay().FindChildTraverse("QOLItemMirrorRow").GetChildCount(), 0);
    e.stop(); assert.equal(e.overlay(), null); assert.equal(item.owner.IsValid(), true);
    e.recreate(); e.start(); assert.equal(e.slots().length, 1);
    assert.equal(text(e.slots()[0]).text, "8");
    e.stop(); assert.deepEqual(e.clock.errors, []);
});

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const sim = require("../scripts/simulator");

function fixture(id, config, inHideout = false) {
    const hud = sim.createHud({ inHideout });
    hud.assertLoaded();
    const Q = hud.sandbox.global.QOL;
    const $ = hud.sandbox.global.$;
    let tick;
    const schedule = Q.core.Scheduler.createPollLoop;
    Q.core.Scheduler.createPollLoop = cb => { tick = cb; return { stop() {} }; };
    const instance = Q.core.FeatureRegistry.getManifest(id).create({ events: Q.core.EventBus, config: { view: () => config } });
    instance.onEnable();
    Q.core.Scheduler.createPollLoop = schedule;
    return { hud, Q, $, instance, tick: () => tick() };
}

test("urn hideout cleanup never searches for an absent owned panel", () => {
    const { hud, tick, instance } = fixture("ql_urn_timer", { ENABLE_URN_TIMER: 1 }, true);
    const find = hud.root.FindChildTraverse.bind(hud.root);
    const searches = [];
    hud.root.FindChildTraverse = id => { searches.push(id); return find(id); };
    for (let i = 0; i < 20; i++) tick();
    instance.onDisable();
    assert.equal(searches.includes("RiftTimer"), false);
    assert.equal(searches.includes("hud_minimap"), false);
    assert.equal(hud.clock.errors.length, 0);
});

test("urn retries missing minimap and restores replaced timer and hideout transitions", () => {
    const { hud, Q, $, tick, instance } = fixture("ql_urn_timer", { ENABLE_URN_TIMER: 1 });
    const core = $.CreatePanel("Panel", hud.root, ""); core.AddClass("HudCore");
    const top = $.CreatePanel("Panel", core, "TopBar");
    $.CreatePanel("Label", top, "GameTime").text = "12:00";
    const find = hud.root.FindChildTraverse.bind(hud.root);
    let searches = 0;
    hud.root.FindChildTraverse = id => { if (id === "hud_minimap") searches++; return find(id); };
    tick();
    assert.equal(searches, 0, "missing native owners never require a full-HUD lookup");
    const first = find("RiftTimer");
    const text = find("RiftTimerLabel").text;
    tick();
    assert.equal(searches, 0, "missing sources wait on their local breadcrumbs");
    const gameplay = $.CreatePanel("Panel", core, "gameplay_hud");
    let owner = $.CreatePanel("Panel", gameplay, ""); owner.AddClass("clamp_width");
    for (const id of ["minimap_persp", "minimap_container", "HudMinimapContainer"]) owner = $.CreatePanel("Panel", owner, id);
    const map = $.CreatePanel("Panel", owner, "hud_minimap");
    const cp = $.CreatePanel("Panel", map, "test_capture_point");
    cp.AddClass("map_button");
    cp.AddClass("capture_point");
    cp.AddClass("koth_warning");
    hud.clock.advance(2100);
    searches = 0;
    tick();
    assert.equal(find("RiftTimer").BHasClass("rift_warning"), true);
    assert.equal(searches, 0);
    cp.RemoveClass("koth_warning");
    hud.clock.advance(500);
    tick();
    const beforeReplacement = find("RiftTimerLabel").text;
    first.DeleteAsync(0);
    hud.clock.advance(1);
    tick();
    assert.notEqual(find("RiftTimer"), first);
    assert.equal(find("RiftTimerLabel").text, beforeReplacement);
    hud.root.AddClass("connectedToHideout");
    tick();
    assert.equal(find("RiftTimer").visible, false);
    Q.clearPanelCache();
    tick();
    hud.root.RemoveClass("connectedToHideout");
    tick();
    assert.equal(find("RiftTimer").visible, true);
    assert.equal(find("RiftTimerLabel").text, text);
    instance.onDisable();
    hud.clock.advance(1);
    assert.equal(find("RiftTimer"), null);
    instance.onEnable();
    instance.onSettingsChanged();
    hud.clock.advance(1);
    assert.equal(find("RiftTimer").visible, true);
    assert.equal(hud.clock.errors.length, 0);
});

test("urn discovers the native minimap through its owner and follows a living replacement", () => {
    const { hud, $, tick, instance } = fixture("ql_urn_timer", { ENABLE_URN_TIMER: 1 });
    const core = $.CreatePanel("Panel", hud.root, ""); core.AddClass("HudCore");
    const top = $.CreatePanel("Panel", core, "TopBar");
    $.CreatePanel("Label", top, "GameTime").text = "12:00";
    const gameplay = $.CreatePanel("Panel", core, "gameplay_hud");
    const clamp = $.CreatePanel("Panel", gameplay, ""); clamp.AddClass("clamp_width");
    const host = $.CreatePanel("Panel", clamp, "minimap_persp");
    const viewport = $.CreatePanel("Panel", host, "minimap_container");
    const native = $.CreatePanel("Panel", viewport, "HudMinimapContainer");
    const map = $.CreatePanel("Panel", native, "hud_minimap");
    for (let index = 0; index < 12; index++) $.CreatePanel("Panel", map, "").AddClass("map_button");
    const unrelated = $.CreatePanel("Panel", map, "");
    unrelated.AddClass("capture_point"); unrelated.AddClass("koth_warning");
    const warning = $.CreatePanel("Panel", map, "");
    for (const name of ["map_button", "capture_point", "koth_warning"]) warning.AddClass(name);
    const find = hud.root.FindChildTraverse.bind(hud.root);
    let searches = 0;
    hud.root.FindChildTraverse = id => { if (id === "hud_minimap") searches++; return find(id); };
    for (let i = 0; i < 4; i++) { tick(); hud.clock.advance(2100); }
    assert.equal(find("RiftTimer").BHasClass("rift_warning"), true);
    assert.equal(searches, 0, "periodic minimap refresh must not scan the whole HUD with a verified owner");
    warning.RemoveClass("koth_warning"); warning.AddClass("active"); tick();
    assert.equal(find("RiftTimer").BHasClass("rift_active"), true, "capture_point without map_button cannot become a native warning");
    warning.RemoveClass("active"); warning.AddClass("koth_warning"); tick();
    assert.equal(find("RiftTimer").BHasClass("rift_warning"), true);

    native.id = "RetiredMinimapContainer";
    const replacement = $.CreatePanel("Panel", viewport, "HudMinimapContainer");
    const nextMap = $.CreatePanel("Panel", replacement, "hud_minimap");
    const active = $.CreatePanel("Panel", nextMap, "");
    for (const name of ["map_button", "capture_point", "active"]) active.AddClass(name);
    tick();
    assert.equal(map.IsValid(), true, "the previous map remains alive with its old warning state");
    assert.equal(find("RiftTimer").BHasClass("rift_active"), true);
    assert.equal(find("RiftTimerLabel").text, "ACTIVE");
    assert.equal(searches, 0);
    instance.onDisable(); hud.clock.advance(1);
    assert.equal(find("RiftTimer"), null);
    assert.deepEqual(hud.clock.errors, []);
});

test("urn retries a missing timer parent without requiring a clock text change", () => {
    const { hud, $, tick } = fixture("ql_urn_timer", { ENABLE_URN_TIMER: 1 });
    const core = $.CreatePanel("Panel", hud.root, ""); core.AddClass("HudCore");
    $.CreatePanel("Label", hud.root, "GameTime").text = "12:00";
    const find = hud.root.FindChildTraverse.bind(hud.root);
    let searches = 0;
    hud.root.FindChildTraverse = id => { if (id === "TopBar") searches++; return find(id); };
    tick();
    const firstSearches = searches;
    assert.ok(firstSearches > 0);
    tick();
    assert.equal(searches, firstSearches, "missing native parent is not rescanned on the next callback");
    assert.equal(find("RiftTimer"), null);
    $.CreatePanel("Panel", core, "TopBar");
    hud.clock.advance(2100);
    tick();
    assert.ok(find("RiftTimer"));
    assert.equal(find("RiftTimerLabel").text, "0:00 - 1:20");
    assert.equal(hud.clock.errors.length, 0);
});

test("unsecured timer stays active in hideout and hero testing and follows source loss", () => {
    const { hud, $, tick, instance } = fixture("ql_unsecured_souls_timer", { ENABLE_UNSECURED_SOUL_TIMER: 1 }, true);
    const core = $.CreatePanel("Panel", hud.root, ""); core.AddClass("HudCore");
    $.CreatePanel("Panel", core, "gameplay_hud");
    let owner = core;
    for (const id of ["StatsAndModsContainer", "LowerLeft", "gold_and_ap_container", "hudGoldContainer"]) {
        owner = $.CreatePanel("Panel", owner, id);
    }
    const container = $.CreatePanel("Panel", owner, ""); container.AddClass("hudDeathGoldContainer");
    const source = $.CreatePanel("Label", container, "hudDeathGoldLabel");
    source.text = "500";
    tick();
    const overlay = hud.root.FindChildTraverse("QOLUnsecuredSoulsOverlay");
    const label = overlay.FindChildTraverse("QOLUnsecuredSoulsState");
    assert.equal(overlay.BHasClass("qol-hidden"), false);
    assert.match(label.text, /^\d+s$/);
    hud.root.AddClass("connectedToHeroTesting");
    tick();
    assert.equal(overlay.BHasClass("qol-hidden"), false);
    hud.root.RemoveClass("connectedToHeroTesting");
    hud.root.RemoveClass("connectedToHideout");
    tick();
    assert.match(label.text, /^\d+s$/);
    source.DeleteAsync(0);
    hud.clock.advance(1);
    tick();
    assert.equal(label.text, "--");
    const replacement = $.CreatePanel("Label", container, "hudDeathGoldLabel");
    replacement.text = "0";
    hud.clock.advance(1100);
    tick();
    assert.equal(label.text, "");
    instance.onDisable();
    hud.clock.advance(1);
    assert.equal(hud.root.FindChildTraverse("QOLUnsecuredSoulsOverlay"), null);
    assert.equal(hud.clock.errors.length, 0);
});

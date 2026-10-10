"use strict";

const test = require("node:test");

const assert = require("node:assert/strict");

const { createHud } = require("../scripts/simulator");

function setup(id, overrides = {}) {
    const env = createHud({ inHideout: false });
    env.assertLoaded();
    const { QOL: Q, $ } = env.sandbox.global;
    Q.core.App.shutdown();
    Q.core.ConfigAdapter.loadFromFlat({ ...env.sandbox.evalJson("QOL.buildDefaultConfig()"), ...overrides });
    const cfg = Q.core.ConfigStore.view(id);
    const feature = Q.core.FeatureRegistry.getManifest(id).create({ id, config: { view: () => cfg }, events: Q.core.EventBus });
    const core = $.CreatePanel("Panel", env.root, "");
    core.AddClass("HudCore");
    const stats = $.CreatePanel("Panel", core, "StatsAndModsContainer");
    const left = $.CreatePanel("Panel", stats, "LowerLeft");
    return { ...env, Q, $, cfg, feature, core, stats, left };
}

function retainNativePresentation(panel, properties) {
    const native = {};
    panel.style = new Proxy(panel.style, { set(target, property, value) {
        if (property === "washColor" && value === "") throw Error("invalid native color");
        if (properties.includes(property)) native[property] = value;
        target[property] = value;
        return true;
    } });
    // ClearPropertyFromCode releases the JS override in this fixture, while
    // resolved presentation retains the last explicit value until layout updates.
    return native;
}

for (const scenario of [
    { feature: "ql_souls", id: "gold_and_ap_container", parent: "left" },
    { feature: "ql_topbar", id: "TopBar", parent: "core" },
    { feature: "ql_items", id: "ModsContainer", parent: "left" },
    { feature: "ql_bottom_bar", id: "hud_signature", parent: "abilities" },
    { feature: "ql_passive_cooldown", id: "hud_passive_items", parent: "abilities", config: { ENABLE_PASSIVE_COOLDOWN: 1, ENABLE_OLD_ITEM_COOLDOWNS: 0 } }
]) {
    test(`${scenario.feature} preserves native code styles this instance never overrode`, () => {
        const env = setup(scenario.feature, scenario.config);
        const abilities = env.$.CreatePanel("Panel", env.core, "AbilitiesContainer");
        const panel = env.$.CreatePanel("Panel", scenario.parent === "abilities" ? abilities : env[scenario.parent], scenario.id);
        const native = { x: "4px", y: "12px", uiScale: "77%", preTransformScale2d: "0.8, 0.8", opacity: "0.8", washColor: "#ABCDEF" };
        Object.assign(panel.style, native);
        env.feature.onEnable();
        for (const [property, value] of Object.entries(native)) assert.equal(panel.style[property], value, property);
        env.feature.onDisable();
        for (const [property, value] of Object.entries(native)) assert.equal(panel.style[property], value, property);
        assert.deepEqual(env.clock.errors, []);
    });
}

test("souls resets the resolved native offsets, including hide and disable, rather than only deleting JS properties", () => {
    const env = setup("ql_souls", { SOULS_X_OFFSET: 80, SOULS_Y_OFFSET: -25 });
    const panel = env.$.CreatePanel("Panel", env.left, "gold_and_ap_container");
    const native = retainNativePresentation(panel, ["x", "y"]);
    env.feature.onEnable();
    assert.deepEqual(native, { x: "80px", y: "25px" });
    env.cfg.SOULS_X_OFFSET = env.cfg.SOULS_Y_OFFSET = 0;
    env.feature.onSettingsChanged();
    assert.deepEqual(native, { x: "0px", y: "0px" });
    env.cfg.SOULS_X_OFFSET = 55;
    env.feature.onSettingsChanged();
    env.cfg.HUD_SOULS_ENABLED = 0;
    env.feature.onSettingsChanged();
    assert.equal(native.x, "0px");
    env.cfg.HUD_SOULS_ENABLED = 1;
    env.feature.onSettingsChanged();
    assert.equal(native.x, "55px");
    env.feature.onDisable();
    assert.equal(native.x, "0px");
});

test("inventory tint reset uses a valid neutral color and clears resolved tint on default, hide and disable", () => {
    const env = setup("ql_items", { ITEMS_WASH_COLOR: 13 });
    const panel = env.$.CreatePanel("Panel", env.left, "ModsContainer");
    const native = retainNativePresentation(panel, ["washColor"]);
    env.feature.onEnable();
    assert.equal(native.washColor, env.Q.core.panel.resolvePaletteColor(13));
    env.cfg.ITEMS_WASH_COLOR = 0;
    env.feature.onSettingsChanged();
    assert.equal(native.washColor, "transparent");
    env.cfg.ITEMS_WASH_COLOR = 4;
    env.feature.onSettingsChanged();
    env.cfg.HUD_ITEMS_ENABLED = 0;
    env.feature.onSettingsChanged();
    assert.equal(native.washColor, "transparent");
    env.cfg.HUD_ITEMS_ENABLED = 1;
    env.feature.onSettingsChanged();
    assert.equal(native.washColor, env.Q.core.panel.resolvePaletteColor(4));
    env.feature.onDisable();
    assert.equal(native.washColor, "transparent");
});

test("souls visibility controller handles late panels, returns defaults to native CSS and releases its owner on disable", () => {
    const env = setup("ql_souls", { HUD_SOULS_ENABLED: 0, SOULS_X_OFFSET: 30, SOULS_Y_OFFSET: 15, SOULS_OPACITY: 0.4 });
    const sibling = env.$.CreatePanel("Panel", env.left, "SiblingFixture");
    sibling.style.opacity = "0.25";
    env.feature.onEnable();
    const panel = env.$.CreatePanel("Panel", env.left, "gold_and_ap_container");
    env.clock.advance(1100);
    assert.equal(panel.BHasClass("qol-hidden"), true);
    assert.equal(panel.style.x, undefined, "hidden presentation does not retain geometry overrides");
    env.cfg.HUD_SOULS_ENABLED = 1;
    env.feature.onSettingsChanged();
    assert.equal(panel.BHasClass("qol-hidden"), false);
    assert.equal(panel.style.x, "30px");
    assert.equal(panel.style.y, "-15px");
    assert.equal(panel.style.opacity, "0.40");
    env.cfg.SOULS_X_OFFSET = 0;
    env.cfg.SOULS_Y_OFFSET = 0;
    env.cfg.SOULS_OPACITY = 1;
    env.feature.onSettingsChanged();
    for (const key of ["x", "y", "opacity"]) assert.equal(panel.style[key], undefined);
    env.cfg.HUD_SOULS_ENABLED = 0;
    env.feature.onSettingsChanged();
    env.feature.onDisable();
    assert.equal(panel.BHasClass("qol-hidden"), false, "disable relinquishes class ownership");
    env.clock.advance(2100);
    assert.equal(panel.BHasClass("qol-hidden"), false);
    assert.equal(sibling.style.opacity, "0.25");
    assert.deepEqual(env.clock.errors, []);
});

test("souls retries partially rejected style writes and avoids deriving config during idle polling", () => {
    const env = setup("ql_souls", { SOULS_X_OFFSET: 25, SOULS_OPACITY: 0.5 });
    const panel = env.$.CreatePanel("Panel", env.left, "gold_and_ap_container");
    let rejected = true;
    panel.style = new Proxy({}, { set(target, key, value) {
        if (key === "opacity" && rejected) throw Error("temporary native rejection");
        target[key] = value;
        return true;
    } });
    const create = env.Q.core.FeatureRegistry.getManifest("ql_souls").create;
    let reads = 0;
    const feature = create({ id: "ql_souls", config: { view() { reads++; return env.cfg; } } });
    feature.onEnable();
    assert.equal(panel.style.x, "25px");
    assert.equal(panel.style.opacity, undefined);
    rejected = false;
    env.clock.advance(1100);
    assert.equal(panel.style.opacity, "0.50");
    env.clock.advance(5100);
    assert.equal(reads, 1, "unchanged config is derived on lifecycle/settings hooks");
    feature.onDisable();
    for (const key of ["x", "y", "opacity"]) assert.equal(panel.style[key], undefined);
});

test("topbar retries rejected opacity and clears the previous living owner when a native bar is replaced", () => {
    const env = setup("ql_topbar", { TOP_BAR_X_OFFSET: 50, TOP_BAR_OPACITY: 0.3 });
    const old = env.$.CreatePanel("Panel", env.core, "TopBar");
    let reject = true;
    old.style = new Proxy({}, { set(target, key, value) {
        if (key === "opacity" && reject) throw Error("temporary native rejection");
        target[key] = value;
        return true;
    } });
    env.feature.onEnable();
    assert.equal(old.style.opacity, undefined);
    reject = false;
    env.clock.advance(600);
    assert.equal(old.style.opacity, "0.30");
    const detached = env.$.CreatePanel("Panel", env.root, "DetachedFixture");
    old.SetParent(detached);
    const replacement = env.$.CreatePanel("Panel", env.core, "TopBar");
    env.clock.advance(600);
    for (const key of ["x", "opacity"]) assert.equal(old.style[key], undefined);
    assert.equal(replacement.style.x, "50px");
    assert.equal(replacement.style.opacity, "0.30");
    env.feature.onDisable();
    env.clock.advance(1100);
    for (const key of ["x", "opacity"]) assert.equal(replacement.style[key], undefined);
    assert.deepEqual(env.clock.errors, []);
});

test("items follow verified breadcrumbs and release moved icons without double-applying opacity", () => {
    const env = setup("ql_items", { ITEMS_OPACITY: 0.35, ITEMS_X_OFFSET: 75 });
    const panel = env.$.CreatePanel("Panel", env.left, "ModsContainer");
    panel.AddClass("ModsContainer");
    const section = env.$.CreatePanel("Panel", panel, "");
    section.AddClass("ModSection");
    const graph = env.$.CreatePanel("Panel", panel, "BarGraphContainer");
    const icon = env.$.CreatePanel("Panel", section, "");
    icon.AddClass("mod_icon_single_container");
    let wideSearches = 0;
    const find = env.stats.FindChildrenWithClassTraverse;
    env.stats.FindChildrenWithClassTraverse = function(className) {
        if (className === "ModsContainer") wideSearches++;
        return find.call(this, className);
    };
    let reject = true;
    icon.style = new Proxy({}, { set(target, key, value) {
        if (key === "opacity" && reject) throw Error("temporary native rejection");
        target[key] = value;
        return true;
    } });
    env.feature.onEnable();
    assert.equal(panel.style.opacity, undefined);
    assert.equal(section.style.opacity, undefined);
    assert.equal(graph.style.opacity, "0.35");
    assert.equal(icon.style.opacity, undefined);
    reject = false;
    env.clock.advance(1100);
    assert.equal(icon.style.opacity, "0.35");
    const unrelated = env.$.CreatePanel("Panel", env.root, "UnrelatedFixture");
    icon.SetParent(unrelated);
    const late = env.$.CreatePanel("Panel", section, "");
    late.AddClass("mod_icon_single_container");
    env.clock.advance(1100);
    assert.equal(icon.IsValid(), true);
    assert.equal(icon.style.opacity, undefined, "moved living icons relinquish owned overrides");
    assert.equal(late.style.opacity, "0.35");
    assert.equal(wideSearches, 0, "native container needs no recursive class lookup");
    env.cfg.HUD_ITEMS_ENABLED = 0;
    env.feature.onSettingsChanged();
    assert.equal(panel.BHasClass("qol-hidden"), true);
    assert.equal(late.style.opacity, undefined);
    assert.equal(graph.style.opacity, undefined);
    env.feature.onDisable();
    for (const key of ["x", "y", "washColor", "opacity"]) assert.equal(panel.style[key], undefined);
    assert.equal(panel.BHasClass("qol-hidden"), false);
    env.clock.advance(2100);
    assert.equal(late.style.opacity, undefined);
    assert.deepEqual(env.clock.errors, []);
});

test("bottom bar scopes AP tint, discovers late currency and releases living bar/slot replacements", () => {
    const env = setup("ql_bottom_bar", { BOTTOM_BAR_SCALE: 0.8, BOTTOM_BAR_X_OFFSET: 50, BOTTOM_BAR_WASH_COLOR: 13, ACTIVE_ITEMS_SCALE: 137, ACTIVE_ITEMS_X_OFFSET: 123 });
    const abilities = env.$.CreatePanel("Panel", env.core, "AbilitiesContainer");
    const bar = env.$.CreatePanel("Panel", abilities, "hud_signature");
    const slots = env.$.CreatePanel("Panel", abilities, "ActiveAbilitiesMenu");
    let reject = true;
    slots.style = new Proxy({}, { set(target, key, value) {
        if (key === "uiScale" && reject) throw Error("temporary native rejection");
        target[key] = value;
        return true;
    } });
    let wideScans = 0;
    const traverse = env.root.FindChildrenWithClassTraverse;
    env.root.FindChildrenWithClassTraverse = function(...args) { wideScans++; return traverse.apply(this, args); };
    env.feature.onEnable();
    assert.equal(bar.style.uiScale, "72%", "preserve the native 90% scale baseline");
    reject = false;
    const ap = env.$.CreatePanel("Panel", abilities, "APContainer");
    const icon = env.$.CreatePanel("Panel", ap, "");
    icon.AddClass("APCurrencyIcon");
    const amount = env.$.CreatePanel("Label", ap, "");
    amount.AddClass("APCurrencyAmount");
    const infinite = env.$.CreatePanel("Panel", ap, "hudAPInfinite");
    env.clock.advance(1100);
    const color = env.Q.core.panel.resolvePaletteColor(13);
    assert.equal(slots.style.uiScale, "137%");
    assert.equal(icon.style.washColor, color);
    assert.equal(amount.style.color, color);
    assert.equal(infinite.style.washColor, color);
    assert.equal(wideScans, 0, "currency traversal remains within verified owners");
    const detached = env.$.CreatePanel("Panel", null, "DetachedFixture");
    abilities.SetParent(detached);
    const replacementAbilities = env.$.CreatePanel("Panel", env.core, "AbilitiesContainer");
    const replacementBar = env.$.CreatePanel("Panel", replacementAbilities, "hud_signature");
    const replacementSlots = env.$.CreatePanel("Panel", replacementAbilities, "ActiveAbilitiesMenu");
    env.clock.advance(600);
    for (const panel of [bar, slots]) {
        assert.equal(panel.IsValid(), true);
        for (const key of ["x", "uiScale"]) assert.equal(panel.style[key], undefined);
    }
    assert.equal(icon.style.washColor, undefined);
    assert.equal(amount.style.color, undefined);
    assert.equal(infinite.style.washColor, undefined);
    assert.equal(replacementBar.style.x, "50px");
    assert.equal(replacementSlots.style.x, "123px");
    env.feature.onDisable();
    env.clock.advance(1100);
    for (const panel of [replacementBar, replacementSlots]) {
        for (const key of ["x", "uiScale", "washColor"]) assert.equal(panel.style[key], undefined);
    }
    assert.deepEqual(env.clock.errors, []);
});

test("default active-slot settings preserve native code properties until this instance owns an override", () => {
    const env = setup("ql_bottom_bar");
    const abilities = env.$.CreatePanel("Panel", env.core, "AbilitiesContainer");
    const slots = env.$.CreatePanel("Panel", abilities, "ActiveAbilitiesMenu");
    slots.style.uiScale = "77%";
    slots.style.x = "4px";
    slots.style.y = "12px";
    env.feature.onEnable();
    assert.equal(slots.style.uiScale, "77%");
    assert.equal(slots.style.x, "4px");
    assert.equal(slots.style.y, "12px");
    env.cfg.ACTIVE_ITEMS_SCALE = 137;
    env.feature.onSettingsChanged();
    assert.equal(slots.style.uiScale, "137%");
    assert.equal(slots.style.x, "4px");
    assert.equal(slots.style.y, "12px");
    env.cfg.ACTIVE_ITEMS_SCALE = 100;
    env.feature.onSettingsChanged();
    assert.equal(slots.style.uiScale, undefined, "the owned scale override returns to native CSS");
    env.feature.onDisable();
    assert.equal(slots.style.x, "4px");
    assert.equal(slots.style.y, "12px");
});

test("signature flash follows verified slot/binding breadcrumbs and resets held-key latches on binding replacement", () => {
    const env = setup("ql_sigflash", { ENABLE_PASSIVE_COOLDOWN: 1 });
    const abilities = env.$.CreatePanel("Panel", env.core, "AbilitiesContainer");
    const signature = env.$.CreatePanel("Panel", abilities, "hud_signature");
    const wrapper = env.$.CreatePanel("Panel", signature, "");
    wrapper.AddClass("hud_abilities");
    const list = env.$.CreatePanel("Panel", wrapper, "abilities");
    const slots = [];
    for (let i = 1; i <= 4; i++) {
        const icon = env.$.CreatePanel("Panel", list, "slot_signature_" + i);
        icon.AddClass("cooling_down");
        const button = env.$.CreatePanel("Panel", icon, "button_container");
        const keys = env.$.CreatePanel("Panel", button, "");
        keys.AddClass("ability_key_container");
        const binding = env.$.CreatePanel("Panel", keys, "ability_binding_component");
        slots.push({ icon, keys, binding });
    }
    let traversals = 0;
    for (const source of [env.root, signature, ...slots.map(slot => slot.icon)]) {
        const find = source.FindChildTraverse;
        source.FindChildTraverse = function(...args) { traversals++; return find.apply(this, args); };
    }
    env.feature.onEnable();
    const slot = slots[0];
    const flash = "qol_signature_cooldown_pressed";
    slot.binding.AddClass("IsPressed");
    env.clock.advance(200);
    assert.equal(slot.icon.BHasClass(flash), true);
    env.clock.advance(400);
    assert.equal(slot.icon.BHasClass(flash), false, "held key does not restart the flash");
    slot.binding.SetParent(env.$.CreatePanel("Panel", null, "DetachedFixture"));
    const replacement = env.$.CreatePanel("Panel", slot.keys, "ability_binding_component");
    replacement.AddClass("DownActivated");
    env.clock.advance(200);
    assert.equal(slot.icon.BHasClass(flash), true, "new binding receives a fresh press latch within one poll");
    assert.equal(traversals, 0, "signature, slots and bindings all have verified direct paths");
    env.feature.onDisable();
    env.clock.advance(1200);
    assert.equal(slot.icon.BHasClass(flash), false);
    env.feature.onEnable();
    assert.equal(slot.icon.BHasClass(flash), true);
    env.feature.onDisable();
    assert.equal(slot.icon.BHasClass(flash), false);
    assert.deepEqual(env.clock.errors, []);
});

test("passive cooldown owns Basic layout through late panels, shop gates, mode switches and living replacement", () => {
    const env = setup("ql_passive_cooldown", { ENABLE_PASSIVE_COOLDOWN: 1, ENABLE_OLD_ITEM_COOLDOWNS: 1, PASSIVE_COOLDOWN_SIZE: 50, PASSIVE_COOLDOWN_OPACITY: 0.35 });
    const abilities = env.$.CreatePanel("Panel", env.core, "AbilitiesContainer");
    env.feature.onEnable();
    const panel = env.$.CreatePanel("Panel", abilities, "hud_passive_items");
    let reject = true, writes = 0;
    panel.style = new Proxy({}, { set(target, key, value) {
        writes++;
        if (key === "opacity" && reject) throw Error("temporary native rejection");
        target[key] = value;
        return true;
    } });
    env.clock.advance(600);
    assert.equal(panel.style.uiScale, "138%");
    reject = false;
    env.clock.advance(600);
    assert.equal(panel.style.opacity, "0.35");
    const settledWrites = writes;
    env.clock.advance(1600);
    assert.equal(writes, settledWrites, "idle Basic mode does not reassert styles");
    abilities.AddClass("gShopOpen");
    env.clock.advance(600);
    assert.equal(panel.BHasClass("qol-hidden"), true);
    assert.equal(panel.style.visibility, "collapse", "native Basic visibility rules cannot outbid the shop gate");
    abilities.RemoveClass("gShopOpen");
    env.clock.advance(600);
    assert.equal(panel.BHasClass("qol-hidden"), false);
    assert.equal(panel.style.visibility, undefined, "leaving shop releases the owned visibility override");
    env.cfg.ENABLE_OLD_ITEM_COOLDOWNS = 0;
    env.feature.onSettingsChanged();
    assert.equal(env.root.BHasClass("passive_cooldown_basic_active"), false);
    assert.equal(env.root.BHasClass("passive_cooldown_advanced_active"), true);
    for (const key of ["uiScale", "x", "y", "marginLeft", "marginTop", "opacity"]) assert.equal(panel.style[key], undefined);
    env.cfg.ENABLE_OLD_ITEM_COOLDOWNS = 1;
    env.feature.onSettingsChanged();
    panel.SetParent(env.$.CreatePanel("Panel", null, "DetachedFixture"));
    const replacement = env.$.CreatePanel("Panel", abilities, "hud_passive_items");
    env.clock.advance(600);
    assert.equal(panel.style.uiScale, undefined);
    assert.equal(panel.BHasClass("passive_cooldown_basic_active"), false);
    assert.equal(replacement.style.opacity, "0.35");
    const flat = { ...env.sandbox.evalJson("QOL.buildDefaultConfig()"), ENABLE_PASSIVE_COOLDOWN: 1, ENABLE_OLD_ITEM_COOLDOWNS: 1 };
    env.Q.core.hud.applyRootClasses(env.root, flat, Date.now(), true);
    const audio = env.Q.core.FeatureRegistry.getManifest("ql_legacy_audio_passive").create(env.Q.core.FeatureRegistry.createContext("ql_legacy_audio_passive"));
    audio.onEnable();
    env.clock.advance(1600);
    audio.onDisable();
    assert.equal(replacement.style.opacity, "0.35", "audio runtime and its disable cannot write Basic styles");
    env.feature.onDisable();
    env.Q.core.hud.applyRootClasses(env.root, flat, Date.now(), true);
    env.clock.advance(1100);
    assert.equal(replacement.style.opacity, undefined);
    assert.equal(env.root.BHasClass("passive_cooldown_basic_active"), false, "core synchronization cannot revive disabled feature classes");
    assert.equal(replacement.BHasClass("passive_cooldown_basic_active"), false);
    assert.deepEqual(env.clock.errors, []);
});

test("ammo uses native gun breadcrumbs, retries text/container writes and releases removed living text", () => {
    const env = setup("ql_ammo", { AMMO_CURRENT_SCALE: 150, AMMO_PANEL_X_OFFSET: 37, AMMO_TEXT_COLOR: 13, AMMO_CLIP_ANGLE: 45 });
    let owner = env.core;
    for (const id of ["gameplay_hud", "gameplay_hud_alive", "crosshair", "gun", "gun_data"]) owner = env.$.CreatePanel("Panel", owner, id);
    const ammo = env.$.CreatePanel("Panel", owner, "ammo_panel");
    const current = env.$.CreatePanel("Label", ammo, "");
    current.AddClass("weapon_ammo");
    current.style.marginLeft = "7px";
    const clip = env.$.CreatePanel("Panel", owner, "clip_status");
    const ring = env.$.CreatePanel("CircularProgressBar", clip, "clip_progress_bar");
    let reject = true;
    ring.style.transform = "rotateZ(23deg)";
    for (const panel of [current, clip]) panel.style = new Proxy(panel.style, { set(target, key, value) {
        if ((key === "color" || key === "transform") && reject) throw Error("temporary native rejection");
        target[key] = value;
        return true;
    } });
    let rootSearches = 0;
    const find = env.root.FindChildTraverse;
    env.root.FindChildTraverse = function(id) {
        if (id === "ammo_panel" || id === "clip_status") rootSearches++;
        return find.call(this, id);
    };
    env.feature.onEnable();
    reject = false;
    env.clock.advance(600);
    assert.equal(current.style.fontSize, "24px");
    assert.equal(current.style.color, env.Q.core.panel.resolvePaletteColor(13));
    assert.equal(ammo.style.marginLeft, "37px");
    assert.equal(clip.style.transform, "rotateZ(-45deg)");
    assert.equal(ring.style.transform, "rotateZ(23deg)");
    const detached = env.$.CreatePanel("Panel", null, "DetachedFixture");
    current.SetParent(detached);
    ring.SetParent(detached);
    const infinite = env.$.CreatePanel("Panel", ammo, "");
    infinite.AddClass("weapon_ammo_infinite");
    infinite.style.width = "17px";
    infinite.style.fontSize = "19px";
    infinite.style.marginLeft = "3px";
    const lateRing = env.$.CreatePanel("CircularProgressBar", clip, "clip_progress_bar");
    env.clock.advance(600);
    for (const key of ["fontSize", "width", "color"]) assert.equal(current.style[key], undefined);
    assert.equal(current.style.marginLeft, "7px", "current-ammo margin was never feature-owned");
    assert.equal(ring.style.transform, "rotateZ(23deg)");
    assert.equal(infinite.style.color, env.Q.core.panel.resolvePaletteColor(13));
    assert.equal(infinite.style.width, "17px");
    assert.equal(infinite.style.fontSize, "19px");
    assert.equal(infinite.style.marginLeft, "3px");
    assert.equal(lateRing.style.transform, undefined);
    assert.equal(clip.style.transform, "rotateZ(-45deg)");
    assert.equal(rootSearches, 0, "both gun owners use the verified direct path");
    env.feature.onDisable();
    env.clock.advance(1100);
    assert.equal(ammo.style.x, undefined);
    assert.equal(ammo.style.y, undefined);
    assert.equal(ammo.style.marginLeft, undefined);
    assert.equal(ammo.style.opacity, undefined);
    assert.equal(infinite.style.color, undefined);
    assert.equal(infinite.style.width, "17px");
    assert.equal(infinite.style.fontSize, "19px");
    assert.equal(infinite.style.marginLeft, "3px");
    assert.equal(lateRing.style.transform, undefined);
    assert.deepEqual(env.clock.errors, []);
});

test("ammo preserves untouched native digit properties and restores owned RGB after native feedback", () => {
    const env = setup("ql_ammo", { ENABLE_AMMO_STATUS: 1 });
    const gunData = env.$.CreatePanel("Panel", env.core, "gun_data");
    const ammo = env.$.CreatePanel("Panel", gunData, "ammo_panel");
    const current = env.$.CreatePanel("Label", ammo, "");
    current.AddClass("weapon_ammo");
    current.text = "6";
    const maximum = env.$.CreatePanel("Label", ammo, "");
    maximum.AddClass("weapon_ammo_max");
    maximum.text = "8";
    const clip = env.$.CreatePanel("Panel", gunData, "clip_status");
    const native = { fontSize: "17px", width: "39px", color: "#998877", marginLeft: "5px" };
    Object.assign(current.style, native);
    env.feature.onEnable();
    for (const [property, value] of Object.entries(native)) assert.equal(current.style[property], value, property);
    const rgb = env.sandbox.global.QOL_UTILS.EncodeHexColor("#123ABC");
    env.cfg.AMMO_TEXT_COLOR = rgb;
    env.feature.onSettingsChanged();
    assert.equal(current.style.color, "#123ABC");
    const pip = clip.FindChildrenWithClassTraverse("qol-ammo-pip")[0];
    assert.equal(pip.style.borderColor, "#123ABC");
    current.style.color = "#000000";
    env.clock.advance(120);
    assert.equal(current.style.color, "#123ABC", "native ammo-state feedback cannot discard the user color");
    env.feature.onDisable();
    env.clock.advance(1);
    assert.equal(current.style.color, undefined);
    for (const property of ["fontSize", "width", "marginLeft"]) assert.equal(current.style[property], native[property], property);
    assert.equal(clip.FindChildrenWithClassTraverse("qol-ammo-pip").length, 0);
    assert.deepEqual(env.clock.errors, []);
});

test("audio caption owns a single managed deadline and cancels it immediately when reminders are disabled", () => {
    const env = setup("ql_legacy_audio_passive", { ENABLE_DL4D_REMINDERS: 1, ENABLE_DL4D_CAPTIONS: 1 });
    const time = env.$.CreatePanel("Label", env.core, "GameTime");
    time.text = "1:45";
    env.feature.onEnable();
    env.clock.advance(600);
    const caption = env.root.FindChildTraverse("QOLDL4DCaption");
    assert.ok(caption && !caption.BHasClass("qol-hidden"));
    const ownedWork = () => env.Q.core.Scheduler.getWorkSnapshot().find(row => row.id === "ql_legacy_audio_passive");
    assert.equal(ownedWork().once, 1);
    env.cfg.ENABLE_DL4D_REMINDERS = 0;
    env.feature.onSettingsChanged();
    assert.equal(caption.BHasClass("qol-hidden"), true);
    assert.equal(ownedWork().once, 0);
    env.feature.onDisable();
    env.clock.advance(5000);
    assert.equal(caption.IsValid(), false);
    assert.equal(ownedWork(), undefined);
    assert.deepEqual(env.clock.errors, []);
});


"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const load = require("./load_settings_environment");

const IDS = ["activeItems", "abilityPoints", "ammo", "stamina", "playerStats", "compass", "speed", "zipBoost",
    "statBonuses", "combatStatus", "unsecuredTimer", "unsecuredSouls", "keyboard", "damageReport", "chat"];
function setup() {
    const env = load(), q = env.hud.sandbox.global.QOL;
    q.core.App.shutdown();
    const cfg = q.buildDefaultConfig();
    const feature = q.core.FeatureRegistry.getManifest("ql_presentation_scale").create({
        id: "ql_presentation_scale", config: { view: () => cfg }
    });
    const add = (parent, id, classes = []) => parent.addChild(env.doc.create("Panel", { id, classes }));
    const owner = element => {
        let panel = env.hud.root;
        for (const segment of element.path) {
            let child = typeof segment === "string" ? panel.FindChild(segment) : panel.Children().find(item => item.BHasClass(segment.className));
            if (!child) child = add(panel, typeof segment === "string" ? segment : "", typeof segment === "string" ? [] : [segment.className]);
            panel = child;
        }
        return panel;
    };
    return { ...env, q, cfg, feature, add, owner };
}

test("all added opacity controls preserve untouched defaults, reapply native feedback, and release replacements", () => {
    const env = setup(), { q, cfg, feature, add, owner } = env;
    const entries = IDS.map(id => {
        const element = q.presentation.elements.find(item => item.id === id);
        const key = element.fields.find(field => field.label === "Opacity").key;
        const container = owner(element);
        const panel = id === "playerStats" ? add(container, "HudStatBlock") : container;
        panel.style.opacity = "0.37";
        panel.style.visibility = "collapse";
        panel.style.transform = "rotateZ(17deg)";
        assert.equal(cfg[key], 1);
        assert.equal(q.presentation.wireFields.get(key).step, 0.01);
        return { element, key, container, panel };
    });
    const resolver = q.presentation.resolve;
    const discoveries = [];
    q.presentation.resolve = (...args) => { discoveries.push(args[0].id); return resolver(...args); };
    feature.onEnable(); env.clock.advance(1600);
    assert.deepEqual(discoveries, [], "defaults own no opacity and trigger no surface discovery");
    for (const entry of entries) assert.equal(entry.panel.style.opacity, "0.37");
    for (const entry of entries) cfg[entry.key] = 0.42;
    feature.onSettingsChanged();
    for (const entry of entries) {
        assert.equal(entry.panel.style.opacity, "0.42", entry.element.id);
        assert.equal(entry.panel.style.visibility, "collapse");
        assert.equal(entry.panel.style.transform, "rotateZ(17deg)");
    }
    entries[0].panel.style.opacity = "0.9";
    env.clock.advance(700);
    assert.equal(entries[0].panel.style.opacity, "0.42", "native feedback invalidates readback");
    const old = entries.find(entry => entry.element.id === "chat").panel;
    const parent = old.GetParent(); old.SetParent(add(env.hud.root, "RetiredChatOwner"));
    const replacement = add(parent, "Chat");
    env.clock.advance(700);
    assert.equal(old.style.opacity, undefined);
    assert.equal(replacement.style.opacity, "0.42");
    for (const entry of entries) cfg[entry.key] = 1;
    discoveries.length = 0; feature.onSettingsChanged();
    assert.deepEqual(discoveries, [], "default clears existing ownership without new lookups");
    for (const entry of entries) assert.equal(entry.panel.style.opacity, undefined);
    assert.equal(replacement.style.opacity, undefined);
    feature.onDisable();
    assert.deepEqual(env.clock.errors, []);
});

test("Ammo opacity includes mirrored rings while compact stats keep their outer visibility owner", () => {
    const env = setup(), { q, cfg, feature, add, owner } = env;
    const ammo = owner(q.presentation.elements.find(item => item.id === "ammo"));
    const ring = add(ammo.GetParent(), "clip_status");
    const mirrored = add(ammo.GetParent(), "clip_status_mirrored");
    const current = add(ammo, "Current", ["weapon_ammo"]);
    const crosshair = add(ammo.GetParent(), "GunGrosshair");
    const stats = owner(q.presentation.elements.find(item => item.id === "playerStats"));
    stats.style.opacity = "0";
    cfg.STATS_POSITION_OPACITY = 0.35; cfg.AMMO_HUD_OPACITY = 0.35;
    feature.onEnable();
    assert.equal(stats.style.opacity, "0", "absent compact block never redirects opacity to the hidden wrapper");
    const block = add(stats, "HudStatBlock"); env.clock.advance(700);
    assert.equal(block.style.opacity, "0.35"); assert.equal(stats.style.opacity, "0");
    for (const panel of [ammo, ring, mirrored]) assert.equal(panel.style.opacity, "0.35");
    assert.equal(current.style.opacity, undefined, "digit labels inherit their parent's opacity once");
    assert.equal(crosshair.style.opacity, undefined);
    ammo.DeleteAsync(0); env.clock.advance(700);
    assert.equal(ring.style.opacity, "0.35", "ring-only owner remains configurable");
    feature.onDisable();
    for (const panel of [ring, mirrored, block]) assert.equal(panel.style.opacity, undefined);
    assert.equal(stats.style.opacity, "0"); assert.deepEqual(env.clock.errors, []);
});

test("opacity inspector uses percentages, keeps Cancel transient and Apply/import on the envelope", () => {
    const env = load(), g = env.global;
    g.QOL.ui.window.setOpen(true); env.clock.advance(500);
    const click = id => { const panel = env.em.FindChildTraverse(id); assert.ok(panel, id); panel._fire("onactivate"); };
    const submit = value => { const input = env.em.FindChildTraverse("QOLCustomize_CHAT_OPACITY"); input.text = String(value); input._fire("oninputsubmit"); };
    g.QOL.ui.customize.start(null, { elementId: "chat" });
    const slider = env.em.FindChildTraverse("QOLCustomizeSlider_CHAT_OPACITY");
    assert.equal(slider.min, 0); assert.equal(slider.max, 100); assert.equal(slider.value, 100);
    submit(42); env.clock.advance(1200);
    assert.equal(env.hud.sandbox.global.QOL.core.ConfigStore.get("ql_presentation_scale", "CHAT_OPACITY"), 0.42);
    assert.equal(g.MOD_CONFIG.CHAT_OPACITY, 1);
    click("QOLCustomizeUndo"); assert.equal(env.em.FindChildTraverse("QOLCustomize_CHAT_OPACITY").text, "100");
    submit(0); click("QOLCustomizeReset"); assert.equal(env.em.FindChildTraverse("QOLCustomize_CHAT_OPACITY").text, "100");
    submit(42); click("QOLCustomizeCancel"); env.clock.advance(1200);
    assert.equal(g.MOD_CONFIG.CHAT_OPACITY, 1);
    const cfg = { ...g.QOL_DEFAULT_CONFIG };
    for (const id of IDS) {
        const element = g.QOL.presentation.elements.find(item => item.id === id);
        const key = element.fields.find(field => field.label === "Opacity").key;
        cfg[key] = id === "chat" ? 0 : 0.42;
        assert.equal(g.QOL_COMPACT_SCHEMA_REGISTRY["4.0.5"].schema.some(field => field.key === key), false);
    }
    const token = g.QOL.persistence.serializeCompactV2(cfg);
    assert.ok(token.startsWith("{"));
    const decoded = g.QOL.persistence.deserializeCompactV2(token);
    Object.assign(g.MOD_CONFIG, cfg);
    const imported = g.QOL.ui.modal.tryApplyImportStringWithDiagnostics(g.QOL.ui.configTab.getCurrentExportSettingsString());
    assert.equal(imported.ok, true);
    for (const [key, value] of Object.entries(cfg).filter(([key]) => key.endsWith("OPACITY"))) {
        assert.equal(decoded[key], value, key); assert.equal(imported.candidateConfig[key], value, key);
    }
    g.QOL.ui.customize.start(null, { elementId: "chat" }); submit(42);
    g.QOL.core.storageBridge.saveSettings = (_cfg, callback) => callback(null);
    click("QOLCustomizeApply"); env.clock.advance(1200);
    assert.equal(g.MOD_CONFIG.CHAT_OPACITY, 0.42);
    assert.deepEqual(env.doc.eventErrors, []); assert.deepEqual(env.clock.errors, []);
});

test("opacity retries rejected writes, avoids idle writes and finishes retirement after disable", () => {
    const { q, cfg, feature, owner, clock } = setup();
    const panel = owner(q.presentation.elements.find(element => element.id === "chat"));
    let rejectedWrite = true, rejectedClear = true, writes = 0;
    panel.style = new Proxy(panel.style, { set(target, key, value) {
        if (key === "opacity") {
            writes++;
            if (rejectedWrite) throw Error("native opacity temporarily unavailable");
        }
        target[key] = value; return true;
    } });
    const clear = panel.ClearPropertyFromCode.bind(panel);
    panel.ClearPropertyFromCode = property => rejectedClear && property === "opacity" ? false : clear(property);
    cfg.CHAT_OPACITY = 0.6; feature.onEnable();
    assert.equal(panel.style.opacity, undefined);
    rejectedWrite = false; clock.advance(700); assert.equal(panel.style.opacity, "0.60");
    const stableWrites = writes; clock.advance(1500);
    assert.equal(writes, stableWrites, "stable native readback prevents repeated opacity writes");
    cfg.CHAT_OPACITY = 1; feature.onSettingsChanged(); feature.onDisable();
    assert.equal(panel.style.opacity, "0.60", "failed retirement remains tracked");
    rejectedClear = false; clock.advance(700);
    assert.equal(panel.style.opacity, undefined);
    assert.equal(panel.IsValid(), true); assert.deepEqual(clock.errors, []);
});

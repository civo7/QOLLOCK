"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createHud } = require("../scripts/simulator");
const { readStyleSource } = require("./helpers/style_source");

test("native keyboard components receive scaled glyph presentation without recurring glyph access", () => {
    const env = setup({ KEYBOARD_OVERLAY_SCALE: 150 }); env.feature.onEnable();
    const layout = env.box().FindChildrenWithClassTraverse("KeyboardLayoutBase")[0];
    const binding = layout.FindChildrenWithClassTraverse("Key").find(panel => panel.paneltype === "CitadelBinding");
    let parent = binding;
    for (const id of ["Contents", "KeyboardBindingComponent", "MainBind", "MainGlyph", "KeyboardKey"]) parent = env.add(parent, id);
    const letter = env.add(parent, "KeyboardLetter", [], "Label");
    let reads = 0, writes = 0;
    const children = binding.Children.bind(binding);
    binding.Children = () => { reads++; return children(); };
    letter.style = new Proxy({}, { set() { writes++; throw Error("glyph code styles must remain native"); } });
    const updates = env.feature.diagnostics.inspect().updates; reads = 0;
    env.clock.advance(2000);
    assert.equal(reads, 0, "ordinary lifetime observation must never enumerate the native glyph tree");
    assert.equal(writes, 0);
    assert.equal(env.feature.diagnostics.inspect().updates, updates, "idle keyboard has no scheduled reconciliation");
    assert.equal(layout.style.uiScale, "150%");
    assert.equal(env.feature.diagnostics.inspect().glyphsReady, true, "late deep payloads are ready through component CSS without a render pass");
    for (const entry of ["citadel_ui_binding.css", "citadel_ui_keyboard_glyph.css"]) {
        const css = readStyleSource("panorama/styles/" + entry);
        assert.match(css, /QOLKeyboardTheme5 CitadelBinding\.Key\.IsPressed Label/, entry + " receives the active theme cascade");
        assert.match(css, /CitadelKeyboardGlyph Label\s*\{[^}]*font-size:\s*16px;[^}]*line-height:\s*0px;/, entry);
    }
    env.feature.onDisable(); env.clock.advance(350); assert.deepEqual(env.clock.errors, []);
});

test("keyboard themes release their key, label and mouse colors even when DownActivated remains", () => {
    // Model only the theme class cascade, not native input or Panorama rendering.
    const css = readStyleSource("panorama/styles/features/ql_feat_keyboard.css");
    const rules = [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)]
        .flatMap(([, list, body]) => list.split(",").map(selector => ({ selector: selector.trim(), body })))
        .filter(rule => rule.selector.includes(".QOLKeyboardTheme"));
    const colors = (theme, state, target) => {
        const result = {}, weights = {};
        for (const { selector, body } of rules) {
            const parts = selector.split(/\s+/);
            if (!selector.includes(".QOLKeyboardTheme" + theme + " ")) continue;
            const binding = parts.findIndex(part => part.startsWith("CitadelBinding.Key"));
            if (parts.slice(binding + 1).join(" ") !== target) continue;
            const required = [...parts[binding].matchAll(/\.([\w-]+)/g)].map(match => match[1]);
            if (!required.every(name => ["Key", ...state].includes(name))) continue;
            const weight = (selector.match(/\./g) || []).length;
            for (const [, property, value] of body.matchAll(/(background-color|border-color|color|wash-color):\s*([^;]+);/g)) {
                if (weight >= (weights[property] ?? -1)) { result[property] = value; weights[property] = weight; }
            }
        }
        assert.ok(Object.keys(result).length, "theme declarations were exercised");
        return result;
    };
    for (let theme = 0; theme < 8; theme++) {
        let highlights = false;
        for (const target of ["", "Label", ".MouseButtonGlyph", ".KeyboardButtonGlyph"]) {
            const idle = colors(theme, [], target);
            const held = colors(theme, ["IsPressed"], target);
            if (JSON.stringify(held) !== JSON.stringify(idle)) highlights = true;
            assert.deepEqual(colors(theme, ["IsPressed", "DownActivated"], target), held);
            assert.deepEqual(colors(theme, ["DownActivated"], target), idle,
                `theme ${theme} ${target} releases after activation`);
        }
        assert.ok(highlights, `theme ${theme} highlights while held`);
    }
    assert.doesNotMatch(css, /\.Key\.DownActivated\s+\.KeyboardKeyGlyphContainer/,
        "the inner glyph must also release its persistent wash");
});

test("keyboard themes use positive binding selectors and exclude spacer panels in every layout", () => {
    const css = readStyleSource("panorama/styles/features/ql_feat_keyboard.css");
    const themeSelectors = css.split("\n").filter(line => line.startsWith(".keyboard_overlay_active") && line.includes(".QOLKeyboardTheme"));
    assert.ok(themeSelectors.length > 0);
    for (const selector of themeSelectors) {
        assert.doesNotMatch(selector, /:not\(/, "theme selectors must stay within the verified native positive-selector syntax");
        assert.match(selector, / CitadelBinding\.Key(?:[.\s,]|$)/);
    }
    const env = setup(); env.feature.onEnable();
    for (let layout = 0; layout < 3; layout++) {
        env.cfg.KEYBOARD_OVERLAY_LAYOUT = layout; env.feature.onSettingsChanged();
        const keys = env.box().FindChildrenWithClassTraverse("Key");
        assert.ok(keys.length > 0);
        for (const key of keys) {
            const spacer = key.BHasClass("EmptyKey") || key.BHasClass("EmptyKeyWide");
            assert.equal(key.paneltype === "CitadelBinding", !spacer);
        }
    }
    env.feature.onDisable();
});

function setup(overrides = {}) {
    const env = createHud({ inHideout: false }); env.assertLoaded();
    const { QOL: Q, $ } = env.sandbox.global;
    Q.core.App.shutdown();
    Q.core.ConfigAdapter.loadFromFlat({ ...env.sandbox.evalJson("QOL.buildDefaultConfig()"), ENABLE_KEYBOARD_OVERLAY: 1, ...overrides });
    const cfg = Q.core.ConfigStore.view("ql_keyboard");
    let reads = 0;
    const feature = Q.core.FeatureRegistry.getManifest("ql_keyboard").create({ events: Q.core.EventBus, id: "ql_keyboard", config: { view() { reads++; return cfg; } } });
    const add = (parent, id, classes = [], type = "Panel") => {
        const panel = $.CreatePanel(type, parent, id);
        for (const name of classes) panel.AddClass(name);
        return panel;
    };
    const core = add(env.root, "CoreFixture", ["HudCore"]);
    const gameplay = add(core, "gameplay_hud");
    const bindingActions = new Map(), creationProperties = new Map(), create = $.CreatePanel;
    $.CreatePanel = (type, parent, id, props) => {
        const panel = create(type, parent, id, props);
        creationProperties.set(panel, { ...props });
        if (type === "CitadelBinding") bindingActions.set(panel, props.action);
        return panel;
    };
    return { ...env, Q, $, cfg, feature, add, core, gameplay, reads: () => reads,
        bindingActions, creationProperties,
        overlay: () => gameplay.FindChild("QOLKeyboardOverlayRoot"),
        box: () => gameplay.FindChildTraverse("AllBindingsBox") };
}

test("keyboard diagnostic hiding preserves bindings across settings and restores full replacement controls", () => {
    const env = setup(); env.feature.onEnable();
    const original = env.overlay(), evidence = env.feature.diagnostics.inspect();
    const lease = env.feature.diagnostics.begin();
    const hidden = lease.apply({ hideRoot: true });
    assert.equal(hidden.rootVisible, false); assert.equal(hidden.stylesReady, true); assert.equal(hidden.ready, false);
    assert.equal(hidden.controls.hideRoot, true); assert.equal(hidden.controls.composition, "cache");
    env.cfg.KEYBOARD_OVERLAY_SCALE = 150; env.feature.onSettingsChanged(); env.clock.advance(600);
    assert.equal(env.overlay(), original); assert.equal(original.visible, false);
    assert.equal(env.box().FindChildrenWithClassTraverse("KeyboardLayoutBase")[0].style.uiScale, "150%");
    const beforeInspect = env.feature.diagnostics.inspect();
    assert.equal(beforeInspect.generation, evidence.generation);
    assert.ok(Number.isSafeInteger(beforeInspect.updates) && beforeInspect.updates > evidence.updates);
    assert.equal(env.feature.diagnostics.inspect().updates, beforeInspect.updates, "inspection cannot run the owner update");
    const restored = lease.apply({});
    assert.equal(restored.rootVisible, true); assert.equal(restored.ready, true); assert.equal(restored.controls.hideRoot, false);
    assert.equal(env.overlay(), original);
    lease.restore(); env.feature.onDisable(); env.clock.advance(350);
    assert.deepEqual(env.clock.errors, []);
});

test("keyboard diagnostic leases reject stale or invalid requests and cannot revive after disable", () => {
    const env = setup(); env.feature.onEnable();
    const old = env.feature.diagnostics.begin(); old.apply({ hideRoot: true });
    const current = env.feature.diagnostics.begin();
    assert.equal(env.overlay().visible, true);
    assert.throws(() => old.apply({ hideRoot: true }), /retired/);
    old.restore(); assert.equal(env.overlay().visible, true);
    for (const request of [{ hideRoot: 1 }, { composition: "layer" }, { other: true }]) {
        assert.throws(() => current.apply(request), /invalid/);
        assert.equal(env.feature.diagnostics.inspect().controls.hideRoot, false);
    }
    current.apply({ hideRoot: true }); env.feature.onDisable(); env.clock.advance(350);
    assert.throws(() => current.apply({}), /retired/); current.restore();
    assert.equal(env.overlay(), null);
    env.feature.onEnable();
    assert.equal(env.overlay().visible, true);
    assert.equal(env.feature.diagnostics.inspect().controls.hideRoot, false);
    assert.equal(env.feature.diagnostics.inspect().controls.composition, "cache");
    assert.throws(() => current.apply({ hideRoot: true }), /retired/); current.restore();
    assert.equal(env.overlay().visible, true);
    env.feature.onDisable(); env.clock.advance(350); assert.deepEqual(env.clock.errors, []);
});

test("keyboard composition requests recreate only its bounded binding box and restore ordinary creation", () => {
    const env = setup(); env.feature.onEnable();
    const first = env.overlay(), firstGeneration = env.feature.diagnostics.inspect().generation;
    assert.equal(env.creationProperties.get(env.box())["always-cache-composition-layer"], "true");
    assert.equal(env.creationProperties.get(first)["require-composition-layer"], undefined);
    const lease = env.feature.diagnostics.begin(); lease.apply({ composition: "none" }); env.clock.advance(350);
    const uncached = env.overlay(), evidence = env.feature.diagnostics.inspect();
    assert.notEqual(uncached, first); assert.equal(first.IsValid(), false);
    assert.notEqual(evidence.generation, firstGeneration); assert.equal(evidence.composition, "none");
    assert.equal(evidence.controls.composition, "none"); assert.equal(evidence.ready, true);
    assert.equal(env.creationProperties.get(env.box())["require-composition-layer"], undefined);
    lease.restore(); env.clock.advance(350);
    const cached = env.overlay(), box = env.box();
    assert.equal(uncached.IsValid(), false); assert.equal(env.feature.diagnostics.inspect().composition, "cache");
    assert.equal(env.feature.diagnostics.inspect().controls.composition, "cache");
    assert.equal(env.creationProperties.get(box)["require-composition-layer"], "true");
    assert.equal(env.creationProperties.get(box)["always-cache-composition-layer"], "true");
    assert.equal(env.creationProperties.get(cached)["require-composition-layer"], undefined);
    assert.equal(env.creationProperties.get(cached)["always-cache-composition-layer"], undefined);
    assert.equal(box.FindChildrenWithClassTraverse("Key").filter(panel => panel.paneltype === "CitadelBinding").length, 34);
    const next = env.feature.diagnostics.begin(); next.apply({ composition: "cache" }); next.restore();
    assert.equal(env.overlay(), cached, "restoring the ordinary policy must retain an already cached generation");
    assert.equal(env.gameplay.Children().filter(panel => panel.id === "QOLKeyboardOverlayRoot").length, 1);
    env.feature.onDisable(); env.clock.advance(350);
    assert.equal(env.feature.diagnostics.retirement().tree, true); assert.deepEqual(env.clock.errors, []);
});

test("keyboard diagnostic hiding reports a rejected native visibility write instead of success", () => {
    const env = setup(); env.feature.onEnable();
    const overlay = env.overlay(); let visible = true, reject = true;
    Object.defineProperty(overlay, "visible", { configurable: true, get: () => visible,
        set: value => { if (!reject || value) visible = value; } });
    const lease = env.feature.diagnostics.begin();
    assert.throws(() => lease.apply({ hideRoot: true }), /visibility/);
    const rejected = env.feature.diagnostics.inspect();
    assert.equal(rejected.rootVisible, true); assert.equal(rejected.controls.hideRoot, true);
    reject = false; env.clock.advance(350);
    assert.equal(env.feature.diagnostics.inspect().rootVisible, false);
    lease.restore(); assert.equal(overlay.visible, true);
    env.feature.onDisable(); env.clock.advance(350); assert.deepEqual(env.clock.errors, []);
});

test("keyboard diagnostic controls retire on living gameplay and HUD replacement without restoring the retired owner", () => {
    const env = setup(); env.feature.onEnable();
    const lease = env.feature.diagnostics.begin(); lease.apply({ hideRoot: true, composition: "cache" }); env.clock.advance(350);
    const old = env.overlay(); env.gameplay.SetParent(env.add(null, "DetachedGameplay"));
    const replacement = env.add(env.core, "gameplay_hud");
    assert.throws(() => lease.apply({}), /retired/); lease.restore();
    assert.equal(replacement.FindChild("QOLKeyboardOverlayRoot"), null, "stale restore cannot mount a successor");
    env.Q.features.keyboardOwnerLoaded(); env.clock.advance(350);
    assert.equal(old.IsValid(), false);
    assert.equal(env.feature.diagnostics.inspect().controls.hideRoot, false);
    assert.equal(env.feature.diagnostics.inspect().composition, "cache");
    const nextLease = env.feature.diagnostics.begin(); nextLease.apply({ hideRoot: true });
    const newHud = env.add(null, "Hud", [], "CitadelHud"), core = env.add(newHud, "", ["HudCore"]);
    const nextGameplay = env.add(core, "gameplay_hud"); env.doc.root = newHud;
    assert.equal(nextGameplay.FindChild("QOLKeyboardOverlayRoot"), null);
    env.Q.features.keyboardOwnerLoaded(); env.clock.advance(350);
    assert.equal(env.feature.diagnostics.inspect().controls.hideRoot, false);
    assert.equal(env.feature.diagnostics.inspect().rootVisible, true);
    const successor = nextGameplay.FindChild("QOLKeyboardOverlayRoot");
    assert.throws(() => nextLease.apply({ hideRoot: true }), /retired/); nextLease.restore();
    assert.equal(nextGameplay.FindChild("QOLKeyboardOverlayRoot"), successor);
    env.feature.onDisable(); env.clock.advance(350); assert.deepEqual(env.clock.errors, []);
});

test("keyboard diagnostic census follows late glyphs in both layouts without rendering or changing native classes", () => {
    const env = setup(); env.feature.onEnable();
    const base = env.box().FindChildrenWithClassTraverse("KeyboardLayoutBase")[0];
    const full = env.box().FindChildrenWithClassTraverse("KeyboardLayoutFull")[0];
    const selected = base.FindChildrenWithClassTraverse("Key").find(panel => panel.paneltype === "CitadelBinding");
    const hidden = full.FindChildrenWithClassTraverse("Key").find(panel => panel.paneltype === "CitadelBinding");
    selected.AddClass("HasHoldAction"); hidden.AddClass("IsPressed");
    const late = env.add(hidden, "UnboundImage", ["UnboundKeyboardGlyph"]);
    const evidence = env.feature.diagnostics.inspect();
    assert.equal(evidence.census.selected.bindings, 11); assert.equal(evidence.census.hidden.bindings, 23);
    assert.equal(evidence.census.selected.holdActions, 1); assert.equal(evidence.census.hidden.pressed, 1);
    assert.equal(evidence.census.selected.unbound, 0); assert.equal(evidence.census.hidden.unbound, 1);
    assert.equal(evidence.census.complete, true); assert.equal(late.style.width, undefined);
    assert.equal(hidden.BHasClass("IsPressed"), true);
    late.SetParent(selected);
    const moved = env.feature.diagnostics.inspect();
    assert.equal(moved.census.selected.unbound, 1); assert.equal(moved.census.hidden.unbound, 0);
    assert.equal(moved.updates, evidence.updates);
    let deep = hidden;
    for (let i = 0; i < 70; i++) deep = env.add(deep, "DeepGlyph" + i);
    assert.equal(env.feature.diagnostics.inspect().census.complete, false, "an incomplete bounded census cannot claim completeness");
    env.feature.onDisable(); env.clock.advance(350); assert.deepEqual(env.clock.errors, []);
});

test("keyboard glyph evidence follows native payloads immediately without claiming computed CSS", () => {
    const env = setup(); env.feature.onEnable();
    const inspect = () => env.feature.diagnostics.inspect();
    const binding = env.box().FindChildrenWithClassTraverse("Key").find(panel => panel.paneltype === "CitadelBinding");
    assert.equal(inspect().ready, true); assert.equal(inspect().glyphsReady, false);
    env.add(binding, "ModifierCombinerLabel", ["ModifierCombinerLabel"], "Label");
    assert.equal(inspect().glyphsReady, false, "an empty modifier alone is not payload evidence");
    const label = env.add(binding, "KeyboardLetter", [], "Label");
    const late = inspect();
    assert.equal(late.glyphsReady, true); assert.equal(late.census.selected.payloads, 1);
    assert.equal(label.style.fontSize, undefined, "component CSS needs no inline glyph writes");
    env.add(binding, "MouseButtonImage", ["MouseButtonGlyph"]);
    assert.equal(inspect().glyphsReady, true); assert.equal(inspect().census.selected.payloads, 2);
    assert.equal(inspect().updates, late.updates, "read-only receipts never render");
    env.feature.onDisable(); env.clock.advance(350); assert.deepEqual(env.clock.errors, []);
});

test("keyboard glyph fingerprints distinguish payload replacement from an equivalent composition generation", () => {
    const env = setup(); env.feature.onEnable();
    const layout = () => env.box().FindChildrenWithClassTraverse("KeyboardLayoutBase")[0];
    const binding = () => layout().FindChildrenWithClassTraverse("Key").find(panel => panel.paneltype === "CitadelBinding");
    const label = env.add(binding(), "KeyboardLetter", [], "Label"); env.clock.advance(350);
    const original = env.feature.diagnostics.inspect();
    assert.equal(original.glyphsReady, true);
    label.DeleteAsync(0); env.clock.advance(0);
    const replacement = env.add(binding(), "KeyboardLetter", [], "Label");
    const beforePoll = env.feature.diagnostics.inspect();
    assert.equal(beforePoll.glyphsReady, true, "replacement payload receives the same static stylesheet without a poll");
    assert.equal(beforePoll.glyphWorkload, original.glyphWorkload, "same native structure preserves the workload");
    assert.notEqual(beforePoll.glyphEpoch, original.glyphEpoch, "a new native payload handle changes the epoch before polling");
    assert.equal(replacement.style.fontSize, undefined);
    env.clock.advance(350);
    assert.equal(env.feature.diagnostics.inspect().glyphsReady, true);
    const lease = env.feature.diagnostics.begin(); lease.apply({ composition: "none" }); env.clock.advance(350);
    env.add(binding(), "KeyboardLetter", [], "Label"); env.clock.advance(350);
    const cached = env.feature.diagnostics.inspect();
    assert.equal(cached.glyphsReady, true); assert.equal(cached.glyphWorkload, original.glyphWorkload);
    assert.notEqual(cached.glyphEpoch, beforePoll.glyphEpoch);
    const full = env.box().FindChildrenWithClassTraverse("KeyboardLayoutFull")[0];
    const hiddenKey = full.FindChildrenWithClassTraverse("Key").find(panel => panel.paneltype === "CitadelBinding");
    env.add(hiddenKey, "KeyboardButtonImage", ["KeyboardButtonGlyph"]);
    const hiddenChanged = env.feature.diagnostics.inspect();
    assert.equal(hiddenChanged.glyphsReady, true, "hidden native imagery is counted without requiring hidden styling");
    assert.equal(hiddenChanged.census.hidden.payloads, 1);
    assert.notEqual(hiddenChanged.glyphWorkload, cached.glyphWorkload);
    assert.notEqual(hiddenChanged.glyphEpoch, cached.glyphEpoch);
    let deep = hiddenKey;
    for (let i = 0; i < 70; i++) deep = env.add(deep, "DeepPayload" + i);
    const incomplete = env.feature.diagnostics.inspect();
    assert.equal(incomplete.census.complete, false); assert.equal(incomplete.glyphsReady, false);
    lease.restore(); env.feature.onDisable(); env.clock.advance(350); assert.deepEqual(env.clock.errors, []);
});

test("keyboard evidence rejects a living retired gameplay owner before the next poll", () => {
    const env = setup(); env.feature.onEnable();
    const original = env.feature.diagnostics.inspect();
    assert.equal(original.ready, true);
    env.gameplay.SetParent(env.add(null, "DetachedGameplay"));
    const replacement = env.add(env.core, "gameplay_hud");
    const stale = env.feature.diagnostics.inspect();
    assert.equal(stale.rootPresent, true);
    assert.equal(stale.attached, false);
    assert.equal(stale.ready, false);
    env.Q.features.keyboardOwnerLoaded(); env.clock.advance(350);
    const current = env.feature.diagnostics.inspect();
    assert.equal(current.ready, true);
    assert.notEqual(current.generation, original.generation);
    assert.ok(replacement.FindChild("QOLKeyboardOverlayRoot"));
    env.feature.onDisable(); env.clock.advance(600);
    assert.equal(replacement.FindChild("QOLKeyboardOverlayRoot"), null);
    assert.deepEqual(env.clock.errors, []);
});

test("keyboard keeps both native binding layouts and reacts to geometry/palette/RGB settings without idle config reads", () => {
    const env = setup({ KEYBOARD_OVERLAY_SCALE: 150, KEYBOARD_OVERLAY_X_OFFSET: -1999, KEYBOARD_OVERLAY_Y_OFFSET: -1999, KEYBOARD_OVERLAY_WASH_COLOR: 4 });
    env.feature.onEnable();
    const box = env.box(), base = box.FindChildrenWithClassTraverse("KeyboardLayoutBase")[0], full = box.FindChildrenWithClassTraverse("KeyboardLayoutFull")[0];
    const actions = layout => layout.FindChildrenWithClassTraverse("Key").filter(panel => panel.paneltype === "CitadelBinding").map(panel => env.bindingActions.get(panel));
    assert.deepEqual(actions(base), ["AbilityMelee", "MoveForward", "Attack", "ADS", "Roll", "MoveLeft", "MoveBackwards", "MoveRight", "HeldItem", "Crouch", "Mantle"]);
    assert.deepEqual(actions(full), ["Ability1", "Ability2", "Ability3", "Ability4", "Attack", "ADS", "Scoreboard", "AbilityMelee", "MoveForward", "Cosmetic1", "Reload", "MoveLeft", "MoveBackwards", "MoveRight", "HeldItem", "Roll", "Item1", "Item2", "Item3", "Item4", "Crouch", "ExtraInfo", "Mantle"]);
    assert.equal(base.Children().length, 3); assert.equal(full.Children().length, 5);
    assert.equal(box.style.marginLeft, "150px"); assert.equal(box.style.x, "-1999px"); assert.equal(box.style.y, "1999px");
    assert.equal(base.style.uiScale, "150%");
    assert.equal(env.overlay().style.washColor, "#ff3b47");
    Object.assign(env.cfg, { ENABLE_FULL_KEYBOARD_LAYOUT: true, KEYBOARD_OVERLAY_SCALE: 70, KEYBOARD_OVERLAY_WASH_COLOR: env.Q.utils.EncodeHexColor("#010203") });
    env.feature.onSettingsChanged();
    assert.equal(box.style.marginLeft, "70px"); assert.equal(full.style.uiScale, "70%");
    assert.equal(env.overlay().style.washColor, "#010203");
    env.cfg.KEYBOARD_OVERLAY_WASH_COLOR = 0; env.feature.onSettingsChanged();
    assert.equal(env.overlay().style.washColor, undefined);
    env.clock.advance(2000); assert.equal(env.reads(), 3);
    env.feature.onDisable(); env.clock.advance(20); assert.equal(env.overlay(), null); assert.deepEqual(env.clock.errors, []);
});

test("keyboard leaves key geometry to CSS and scales only the owned layout on settings", () => {
    const env = setup(); env.feature.onEnable();
    const key = env.box().FindChildrenWithClassTraverse("SpaceKey")[0];
    const layout = env.box().FindChildrenWithClassTraverse("KeyboardLayoutBase")[0];
    assert.equal(key.style.width, undefined);
    const updates = env.feature.diagnostics.inspect().updates;
    env.clock.advance(2000);
    assert.equal(env.feature.diagnostics.inspect().updates, updates);
    assert.equal(env.Q.core.Scheduler.getWorkSnapshot().some(owner => owner.id === "ql_keyboard"), false);
    env.cfg.KEYBOARD_OVERLAY_SCALE = 150; env.feature.onSettingsChanged();
    assert.equal(key.style.width, undefined); assert.equal(layout.style.uiScale, "150%");
    env.feature.onDisable(); env.clock.advance(20); assert.deepEqual(env.clock.errors, []);
});

test("inactive keyboard glyphs stay native when their layout is selected", () => {
    const env = setup(); env.feature.onEnable();
    const base = env.box().FindChildrenWithClassTraverse("KeyboardLayoutBase")[0];
    const full = env.box().FindChildrenWithClassTraverse("KeyboardLayoutFull")[0];
    const hiddenKey = full.FindChildrenWithClassTraverse("Key").find(panel => panel.paneltype === "CitadelBinding");
    const glyph = env.add(hiddenKey, "KeyboardLetter", [], "Label");
    let reject = true, glyphWrites = 0, hiddenEnumerations = 0;
    glyph.style = new Proxy({}, { set(target, key, value) {
        glyphWrites++; if (reject && key === "fontSize") throw Error("hidden glyph not ready");
        target[key] = value; return true;
    } });
    const children = full.Children.bind(full);
    full.Children = () => { hiddenEnumerations++; return children(); };
    env.clock.advance(1000);
    assert.equal(hiddenEnumerations, 0, "hidden native glyph trees need no recurring enumeration");
    assert.equal(glyphWrites, 0);
    assert.equal(env.overlay().visible, true, "an unready hidden glyph must not suppress the active layout");
    assert.equal(base.IsValid(), true); assert.equal(full.IsValid(), true);
    env.cfg.ENABLE_FULL_KEYBOARD_LAYOUT = true; env.feature.onSettingsChanged();
    assert.equal(env.overlay().visible, true);
    reject = false; env.clock.advance(250);
    assert.equal(glyph.style.fontSize, undefined); assert.equal(glyphWrites, 0);
    assert.equal(env.box().FindChildrenWithClassTraverse("KeyboardLayoutBase")[0], base);
    assert.equal(env.box().FindChildrenWithClassTraverse("KeyboardLayoutFull")[0], full);
    env.feature.onDisable(); env.clock.advance(20);
    assert.deepEqual(env.clock.errors, []);
});

test("keyboard diagnostic retirement waits for actual native deletion rather than only disabled state", () => {
    const env = setup(); env.feature.onEnable();
    assert.ok(env.feature.diagnostics, "keyboard must expose read-only physical evidence");
    const active = env.feature.diagnostics.inspect();
    assert.equal(active.ready, true); assert.equal(active.rootPresent, true);
    const nativeDelete = env.overlay().DeleteAsync.bind(env.overlay());
    let reject = true;
    env.overlay().DeleteAsync = delay => { if (!reject) nativeDelete(delay); };
    env.feature.onDisable(); env.clock.advance(300);
    const pending = env.feature.diagnostics.retirement();
    assert.equal(pending.inactive, true); assert.equal(pending.tree, false); assert.equal(pending.rootPresent, true);
    reject = false; env.clock.advance(600);
    const retired = env.feature.diagnostics.retirement();
    assert.equal(retired.tree, true); assert.equal(retired.styles, true); assert.equal(retired.rootPresent, false);
    assert.deepEqual(env.clock.errors, []);
});

test("keyboard leaves private rows idle and retires moved created keys on disable", () => {
    const env = setup(); env.feature.onEnable();
    const row = env.box().FindChildrenWithClassTraverse("KeyboardRow")[0];
    assert.equal(row.hittest, false); assert.equal(row.hittestchildren, false);
    const children = row.Children.bind(row); let enumerations = 0;
    row.Children = () => { enumerations++; return children(); };
    env.clock.advance(2000); assert.equal(enumerations, 0);
    const key = children()[0]; key.SetParent(env.add(null, "DetachedKeys"));
    env.feature.onDisable(); env.clock.advance(350);
    assert.equal(key.IsValid(), false); assert.equal(env.overlay(), null); assert.deepEqual(env.clock.errors, []);
});

test("keyboard themes update in place and alternate layouts retain native actions and generation cleanup", () => {
    const env = setup(); env.feature.onEnable();
    const original = env.overlay();
    for (let theme = 0; theme < 8; theme++) {
        env.cfg.KEYBOARD_OVERLAY_THEME = theme; env.feature.onSettingsChanged();
        assert.equal(env.overlay(), original, "theme selection does not recreate native bindings");
        for (let other = 0; other < 8; other++) assert.equal(env.box().BHasClass("QOLKeyboardTheme" + other), other === theme);
    }
    env.cfg.KEYBOARD_OVERLAY_LAYOUT = 1; env.feature.onSettingsChanged(); env.clock.advance(250);
    const compact = env.box().FindChildrenWithClassTraverse("KeyboardLayoutAlternate")[0];
    assert.ok(compact);
    assert.equal(compact.style.width, "120px");
    const actions = () => env.box().FindChildrenWithClassTraverse("Key").map(p => env.bindingActions.get(p));
    assert.ok(actions().includes("MoveForward")); assert.ok(actions().includes("Mantle"));
    assert.equal(actions().includes("Ability1"), false);
    env.cfg.ENABLE_FULL_KEYBOARD_LAYOUT = true; env.feature.onSettingsChanged(); env.clock.advance(250);
    assert.ok(actions().includes("Ability1")); assert.ok(actions().includes("Item4"));
    env.cfg.KEYBOARD_OVERLAY_LAYOUT = 2; env.feature.onSettingsChanged(); env.clock.advance(250);
    const grid = env.box().FindChildrenWithClassTraverse("KeyboardLayoutAlternate")[0];
    assert.equal(grid.style.width, "240px");
    assert.equal(grid.style.height, "160px");
    env.cfg.KEYBOARD_OVERLAY_SCALE = 150; env.feature.onSettingsChanged();
    assert.equal(grid.style.width, "240px"); assert.equal(grid.style.height, "160px"); assert.equal(grid.style.uiScale, "150%");
    assert.equal(compact.IsValid(), false);
    env.cfg.KEYBOARD_OVERLAY_LAYOUT = 0; env.feature.onSettingsChanged(); env.clock.advance(250);
    assert.ok(env.box().FindChildrenWithClassTraverse("KeyboardLayoutFull")[0]);
    env.feature.onDisable(); env.clock.advance(20);
    assert.equal(env.overlay(), null); assert.deepEqual(env.clock.errors, []);
});

test("alternate keyboard geometry remains in native units while settings scale the whole layout", () => {
    const env = setup({ KEYBOARD_OVERLAY_LAYOUT: 1, ENABLE_FULL_KEYBOARD_LAYOUT: false, KEYBOARD_OVERLAY_SCALE: 100 });
    env.feature.onEnable();
    const compact = env.box().FindChildrenWithClassTraverse("KeyboardLayoutAlternate")[0];
    const binding = compact.FindChildrenWithClassTraverse("Key").find(panel => env.bindingActions.get(panel) === "MoveForward");
    assert.equal(binding.style.x, "42px"); assert.equal(binding.style.width, "36px");
    const label = env.add(binding, "KeyboardLetter", [], "Label");
    const original = env.overlay(); env.cfg.KEYBOARD_OVERLAY_SCALE = 150; env.feature.onSettingsChanged();
    assert.equal(env.overlay(), original); assert.equal(compact.style.uiScale, "150%");
    assert.equal(compact.style.width, "120px"); assert.equal(binding.style.x, "42px");
    assert.equal(label.style.fontSize, undefined);
    env.cfg.KEYBOARD_OVERLAY_LAYOUT = 2; env.feature.onSettingsChanged(); env.clock.advance(350);
    const grid = env.box().FindChildrenWithClassTraverse("KeyboardLayoutAlternate")[0];
    assert.equal(compact.IsValid(), false); assert.equal(grid.style.width, "240px"); assert.equal(grid.style.height, "80px");
    assert.equal(grid.style.uiScale, "150%");
    env.feature.onDisable(); env.clock.advance(20); assert.deepEqual(env.clock.errors, []);
});

test("keyboard scopes its shop visibility exception to the selected Customize sample and clears it on expiry", () => {
    const env = setup(); env.feature.onEnable();
    const { Q, root, clock } = env, preview = Q.presentation.preview;
    const canonical = Q.core.ConfigAdapter.exportToFlat();
    const stamp = Q.core.persistence.getConfigChangeStamp(Q.core.persistence.getUIRoot());
    root.AddClass("QOLCustomizeActive"); root.AddClass("gShopOpen");
    const select = id => {
        preview.write(root, {}, "keyboard-sample", stamp, id);
        preview.commit(preview.consume(root, canonical)); clock.advance(250);
    };
    select("ammo"); assert.equal(env.box().BHasClass("QOLCustomizeKeyboardSample"), false);
    select("keyboard"); assert.equal(env.box().BHasClass("QOLCustomizeKeyboardSample"), true);
    select("ammo"); assert.equal(env.box().BHasClass("QOLCustomizeKeyboardSample"), false, "selection change restores native shop visibility CSS");
    select("keyboard"); clock.advance(2600); preview.commit(preview.consume(root, canonical));
    assert.equal(env.box().BHasClass("QOLCustomizeKeyboardSample"), false, "expired lease cannot keep the scoped exception");
    select("keyboard"); preview.clear(root, "keyboard-sample"); preview.commit(preview.consume(root, canonical)); clock.advance(250);
    assert.equal(env.box().BHasClass("QOLCustomizeKeyboardSample"), false);
    env.feature.onDisable(); clock.advance(20); assert.equal(env.overlay(), null);
    assert.deepEqual(clock.errors, []);
});

test("keyboard never acquires native glyph code styles during late creation, replacement or reparenting", () => {
    const env = setup({ KEYBOARD_OVERLAY_SCALE: 150 }); env.feature.onEnable();
    const binding = env.box().FindChildrenWithClassTraverse("Key").find(panel => panel.paneltype === "CitadelBinding");
    const label = env.add(binding, "KeyboardLetter", [], "Label"), mouse = env.add(binding, "MouseButtonImage", ["MouseButtonGlyph"]);
    label.style.color = "#ABCDEF"; mouse.style.opacity = "0.6";
    env.clock.advance(600); assert.equal(label.style.fontSize, undefined); assert.equal(mouse.style.width, undefined);
    const detached = env.add(null, "RetiredNativeGlyphs"); label.SetParent(detached); mouse.SetParent(detached);
    const next = env.add(binding, "KeyboardLetter", [], "Label");
    assert.equal(env.feature.diagnostics.inspect().census.selected.payloads, 1);
    env.cfg.KEYBOARD_OVERLAY_SCALE = 200; env.feature.onSettingsChanged();
    env.feature.onDisable(); env.clock.advance(350);
    assert.equal(label.IsValid(), true); assert.equal(mouse.IsValid(), true); assert.equal(next.IsValid(), false);
    assert.equal(label.style.color, "#ABCDEF"); assert.equal(mouse.style.opacity, "0.6");
    assert.equal(label.style.fontSize, undefined); assert.equal(mouse.style.width, undefined); assert.deepEqual(env.clock.errors, []);
});

test("keyboard retries rejected owned wash writes and stops all work after success", () => {
    const env = setup({ KEYBOARD_OVERLAY_WASH_COLOR: 4 }); env.feature.onEnable();
    let reject = true, writes = 0; const overlay = env.overlay();
    overlay.style = new Proxy({}, { set(target, key, value) { writes++; if (key === "washColor" && reject) throw Error("native wash pending"); target[key] = value; return true; } });
    env.cfg.KEYBOARD_OVERLAY_WASH_COLOR = 5; env.feature.onSettingsChanged();
    assert.equal(overlay.style.washColor, undefined); assert.equal(overlay.visible, false);
    reject = false; env.clock.advance(350);
    assert.equal(overlay.style.washColor, "#ff6f61"); assert.equal(overlay.visible, true);
    const stableWrites = writes, updates = env.feature.diagnostics.inspect().updates;
    env.clock.advance(2000); assert.equal(writes, stableWrites); assert.equal(env.feature.diagnostics.inspect().updates, updates);
    assert.equal(env.Q.core.Scheduler.getWorkSnapshot().some(owner => owner.id === "ql_keyboard"), false);
    env.feature.onDisable(); env.clock.advance(20); assert.deepEqual(env.clock.errors, []);
});

test("keyboard keeps a failed wash reset hidden until native clearing succeeds", () => {
    const env = setup({ KEYBOARD_OVERLAY_WASH_COLOR: 4 }); env.feature.onEnable();
    const overlay = env.overlay(), clear = overlay.ClearPropertyFromCode.bind(overlay); let reject = true;
    overlay.ClearPropertyFromCode = property => property === "wash-color" && reject ? false : clear(property);
    env.cfg.KEYBOARD_OVERLAY_WASH_COLOR = 0; env.feature.onSettingsChanged();
    assert.equal(overlay.style.washColor, "#ff3b47"); assert.equal(overlay.visible, false);
    reject = false; env.clock.advance(350); assert.equal(overlay.style.washColor, undefined); assert.equal(overlay.visible, true);
    env.feature.onDisable(); env.clock.advance(20); assert.deepEqual(env.clock.errors, []);
});

test("keyboard cancels a pending write retry when a newer settings hook succeeds", () => {
    const env = setup({ KEYBOARD_OVERLAY_WASH_COLOR: 4 }); env.feature.onEnable();
    const overlay = env.overlay(), clear = overlay.ClearPropertyFromCode.bind(overlay); let reject = true;
    overlay.ClearPropertyFromCode = property => property === "wash-color" && reject ? false : clear(property);
    env.cfg.KEYBOARD_OVERLAY_WASH_COLOR = 0; env.feature.onSettingsChanged();
    assert.equal(overlay.visible, false);
    reject = false; env.feature.onSettingsChanged();
    assert.equal(overlay.visible, true);
    assert.equal(env.Q.core.Scheduler.getWorkSnapshot().some(owner => owner.id === "ql_keyboard"), false);
    env.feature.onDisable(); env.clock.advance(350); assert.deepEqual(env.clock.errors, []);
});

test("keyboard follows a still-living replacement gameplay owner and then a new HUD", () => {
    const env = setup(); env.feature.onEnable(); const old = env.overlay();
    env.gameplay.SetParent(env.add(null, "RetiredGameplay"));
    const current = env.add(env.core, "gameplay_hud"); env.Q.features.keyboardOwnerLoaded(); env.clock.advance(350);
    assert.equal(old.IsValid(), false); assert.ok(current.FindChild("QOLKeyboardOverlayRoot"));
    const newHud = env.add(null, "Hud", [], "CitadelHud"), newCore = env.add(newHud, "CoreFixture", ["HudCore"]), next = env.add(newCore, "gameplay_hud");
    const previous = current.FindChild("QOLKeyboardOverlayRoot"); env.doc.root = newHud; env.Q.features.keyboardOwnerLoaded(); env.clock.advance(350);
    assert.equal(previous.IsValid(), false); assert.ok(next.FindChild("QOLKeyboardOverlayRoot"));
    env.feature.onDisable(); env.clock.advance(20); assert.equal(next.FindChild("QOLKeyboardOverlayRoot"), null); assert.deepEqual(env.clock.errors, []);
});

test("keyboard settings retire an invalid owned layout and disable cleans every moved panel", () => {
    const env = setup(); env.feature.onEnable();
    const old = env.overlay(), row = env.box().FindChildrenWithClassTraverse("KeyboardRow")[0];
    const retired = env.add(null, "RetiredOwnPanels"); row.SetParent(retired); env.feature.onSettingsChanged(); env.clock.advance(500);
    assert.equal(old.IsValid(), false); assert.equal(row.IsValid(), false);
    const current = env.overlay(); assert.ok(current); assert.notEqual(current, old);
    const key = env.box().FindChildrenWithClassTraverse("Key")[0]; key.SetParent(retired);
    env.feature.onDisable(); env.clock.advance(20); assert.equal(key.IsValid(), false); assert.equal(current.IsValid(), false);
    env.feature.onSettingsChanged(); env.clock.advance(2000); assert.equal(env.overlay(), null); assert.deepEqual(env.clock.errors, []);
});

test("keyboard cleans partial construction before retry and failed registry enable leaves no overlay or callbacks", () => {
    const env = setup(); let reject = true; const create = env.$.CreatePanel;
    env.$.CreatePanel = (type, ...args) => { if (type === "CitadelBinding" && reject) throw Error("binding creation pending"); return create(type, ...args); };
    assert.throws(() => env.feature.onEnable(), /Keyboard overlay panel creation failed/); env.clock.advance(20); assert.equal(env.overlay(), null);
    reject = false; env.Q.features.keyboardOwnerLoaded(); env.Q.core.EventBus.emit("presentation:preview_changed");
    env.clock.advance(350); assert.equal(env.overlay() === null, true, "failed enable retires its lifecycle callbacks");
    env.feature.onEnable(); assert.ok(env.overlay()); env.feature.onDisable(); env.clock.advance(20);
    reject = true;
    env.Q.core.FeatureRegistry.enable("ql_keyboard");
    env.clock.advance(1000); assert.equal(env.overlay(), null); assert.equal(env.Q.core.FeatureRegistry.isEnabled("ql_keyboard"), false);
    assert.equal(env.Q.core.Scheduler.getWorkSnapshot().some(owner => owner.id === "ql_keyboard"), false);
    reject = false; env.Q.core.FeatureRegistry.enable("ql_keyboard"); assert.equal(env.Q.core.FeatureRegistry.isEnabled("ql_keyboard"), true);
    env.Q.core.FeatureRegistry.disable("ql_keyboard"); env.clock.advance(20); assert.equal(env.overlay(), null); assert.deepEqual(env.clock.errors, []);
});

test("keyboard waits for gameplay and ignores obsolete shared caches and helper aliases", () => {
    const env = setup(); env.gameplay.SetParent(env.add(null, "RetiredGameplay"));
    const foreign = env.add(env.root, "ForeignOverlay"); foreign.style.x = "20px";
    env.Q.panelCache.setPanel("keyboardOverlayRoot", foreign); env.Q.panelCache.setPanel("keyboardOverlayBox", foreign);
    env.feature.onEnable(); assert.equal(env.root.FindChild("QOLKeyboardOverlayRoot"), null);
    env.gameplay.SetParent(env.core); env.Q.features.keyboardOwnerLoaded(); env.clock.advance(600); assert.ok(env.overlay());
    for (const key of ["allBindingsBoxes", "keyboardBoxCaches", "keyboardOverlayWashSig"]) assert.equal(Object.hasOwn(env.Q.state, key), false);
    for (const key of ["buildKeyboardOverlayLayouts", "getKeyboardCachedPanels", "resetKeyboardOverlayCaches"]) assert.equal(Object.hasOwn(env.Q, key), false);
    env.feature.onDisable(); env.clock.advance(20); assert.equal(foreign.IsValid(), true); assert.equal(foreign.style.x, "20px"); assert.deepEqual(env.clock.errors, []);
});

test("keyboard retires a foreign previous root and waits for queued deletion during immediate re-enable", () => {
    const env = setup(), old = env.add(env.gameplay, "QOLKeyboardOverlayRoot");
    const child = env.add(old, "PreviousKeyboardChild"); env.feature.onEnable();
    assert.equal(env.overlay(), old); assert.equal(old.visible, false);
    env.clock.advance(350); assert.equal(old.IsValid(), false); assert.equal(child.IsValid(), false);
    const current = env.overlay(); assert.ok(current); assert.equal(current.visible, true);
    env.feature.onDisable(); env.feature.onEnable(); assert.equal(env.overlay(), current); assert.equal(current.visible, false);
    env.clock.advance(350); assert.equal(current.IsValid(), false);
    assert.equal(env.gameplay.Children().filter(panel => panel.id === "QOLKeyboardOverlayRoot").length, 1);
    assert.equal(env.box().FindChildrenWithClassTraverse("KeyboardLayoutBase").length, 1);
    assert.equal(env.box().FindChildrenWithClassTraverse("KeyboardLayoutFull").length, 1);
    env.feature.onDisable(); env.clock.advance(20); env.feature.onSettingsChanged(); env.clock.advance(600);
    assert.equal(env.overlay(), null); assert.deepEqual(env.clock.errors, []);
});

test("keyboard retries moved created-child deletion while preserving moved native glyph content", () => {
    const env = setup({ KEYBOARD_OVERLAY_SCALE: 150 }); env.feature.onEnable();
    const key = env.box().FindChildrenWithClassTraverse("Key").find(panel => panel.paneltype === "CitadelBinding");
    const glyph = env.add(key, "KeyboardLetter", [], "Label"); glyph.style.color = "#ABCDEF";
    env.clock.advance(350); assert.equal(glyph.style.fontSize, undefined);
    const detached = env.add(null, "MovedKeyboardContent"); glyph.SetParent(detached); key.SetParent(detached);
    const remove = key.DeleteAsync.bind(key); let reject = true;
    key.DeleteAsync = delay => { if (reject) throw Error("modeled created-key deletion failure"); remove(delay); };
    env.feature.onSettingsChanged(); env.clock.advance(700);
    assert.equal(key.IsValid(), true); assert.equal(key.visible, false); assert.ok(env.overlay());
    assert.equal(glyph.IsValid(), true); assert.equal(glyph.style.fontSize, undefined); assert.equal(glyph.style.color, "#ABCDEF");
    reject = false; env.clock.advance(350); assert.equal(key.IsValid(), false); assert.equal(glyph.IsValid(), true);
    env.feature.onDisable(); env.clock.advance(20); assert.deepEqual(env.clock.errors, []);
});

test("keyboard rejects a loading-root gameplay lookalike and mounts only the current real HUD", () => {
    const env = setup(); env.feature.onEnable(); const old = env.overlay();
    env.doc.root = env.add(null, "LoadingRoot");
    const loadingCore = env.add(env.doc.root, "", ["HudCore"]), loadingGameplay = env.add(loadingCore, "gameplay_hud");
    env.Q.features.keyboardOwnerLoaded(); env.clock.advance(350); assert.equal(old.IsValid(), false); assert.equal(loadingGameplay.FindChild("QOLKeyboardOverlayRoot"), null);
    const root = env.add(null, "Hud", [], "CitadelHud"), core = env.add(root, "", ["HudCore"]), gameplay = env.add(core, "gameplay_hud");
    env.doc.root = root; env.Q.features.keyboardOwnerLoaded(); env.clock.advance(350);
    assert.ok(gameplay.FindChild("QOLKeyboardOverlayRoot")); assert.equal(env.root.IsValid(), true); assert.equal(env.overlay(), null);
    env.feature.onDisable(); env.clock.advance(20); assert.equal(gameplay.FindChild("QOLKeyboardOverlayRoot"), null);
    assert.deepEqual(env.clock.errors, []);
});

test("keyboard scales the complete layout below original size and at the common upper bound", () => {
    const env = setup({ KEYBOARD_OVERLAY_SCALE: 50 }); env.feature.onEnable();
    const layout = env.box().FindChildrenWithClassTraverse("KeyboardLayoutBase")[0];
    assert.equal(layout.style.uiScale, "50%");
    env.cfg.KEYBOARD_OVERLAY_SCALE = 300; env.feature.onSettingsChanged();
    assert.equal(layout.style.uiScale, "300%"); env.feature.onDisable(); assert.deepEqual(env.clock.errors, []);
});

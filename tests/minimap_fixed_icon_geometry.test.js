"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const load = require("./load_settings_environment");
const startDrag = require("./customize_drag_fixture");

const fixedClass = "QOLFixedMinimapIcons";
const add = (env, parent, id, classes = []) => parent.addChild(env.doc.create("Panel", { id, classes }));
function setup({ mode = "base", fixed = 1, density = 1 } = {}) {
    const env = load();
    const g = env.global;
    g.QOL.ui.window.setOpen(true); env.clock.advance(500);
    Object.assign(g.MOD_CONFIG, {
        MINIMAP_FIXED_ICON_SIZE: fixed, MINIMAP_SMALL_SIZE: 650,
        MINIMAP_LARGE_SIZE_ALT: 800, MINIMAP_LARGE_SIZE_TAB: 1000,
        ENABLE_ALT_ZOOM: 1, ENABLE_TAB_ZOOM: 1
    });
    const core = add(env, env.hud.root, "", ["HudCore"]);
    const gameplay = add(env, core, "gameplay_hud");
    const clamp = add(env, gameplay, "", ["clamp_width"]);
    const host = add(env, clamp, "minimap_persp");
    const viewport = add(env, host, "minimap_container");
    const frame = add(env, viewport, "minimap_frame");
    const inner = add(env, viewport, "HudMinimapContainer");
    const renderer = add(env, inner, "hud_minimap", ["HudMinimap"]);
    const canvas = add(env, add(env, renderer, "MinimapBackgroundTest"), "canvas");
    if (mode !== "base") env.hud.root.AddClass(mode === "alt" ? "gDetailView" : "gScoreboardOpen");
    for (const panel of [env.hud.root, core, gameplay, clamp, host]) {
        panel.actualuiscale_x = density; panel.actualuiscale_y = density;
    }
    Object.assign(host, { actuallayoutwidth: 440 * density, actuallayoutheight: 520 * density });
    // Panorama performs native relayout. The model supplies only its reported
    // geometry, independently from assertions on the actual runtime outputs.
    const initial = mode === "base" ? 650 : mode === "alt" ? 800 : 1000;
    Object.assign(viewport, { actuallayoutwidth: initial * density, actuallayoutheight: initial * density,
        actualxoffset: 100 * density, actualyoffset: 150 * density });
    g.SaveAndSync(); env.clock.advance(1200);
    const store = env.hud.sandbox.global.QOL.core.ConfigStore;
    const find = id => env.em.FindChildTraverse(id);
    const click = id => { const panel = find(id); assert.ok(panel, id); panel._fire("onactivate"); };
    const clean = () => { if (find("QOLCustomizeCancel")) click("QOLCustomizeCancel"); env.clock.advance(1200);
        assert.deepEqual(env.doc.eventErrors, []); assert.deepEqual(env.clock.errors, []); };
    return { ...env, host, viewport, frame, inner, renderer, canvas, store, find, click, clean };
}

test("Customize exact Size previews and applies to the fixed-icon renderer in Base, Alt and Tab", () => {
    for (const [mode, id, key, next] of [["base", "minimap", "MINIMAP_SMALL_SIZE", 700],
        ["alt", "minimapAlt", "MINIMAP_LARGE_SIZE_ALT", 900], ["tab", "minimapTab", "MINIMAP_LARGE_SIZE_TAB", 1100]]) {
        const env = setup({ mode });
        const parent = env.host.GetParent(), rendererParent = env.renderer.GetParent();
        assert.equal(env.renderer.BHasClass(fixedClass), true);
        env.global.QOL.ui.customize.start(null, { elementId: id });
        const input = env.find("QOLCustomize_" + key);
        input.text = String(next); input._fire("ontextentrychange"); env.clock.advance(1200);
        assert.equal(env.store.get("ql_minimap_runtime", key), next);
        assert.equal(env.viewport.style.width, next + "px");
        assert.equal(env.viewport.style.height, next + "px");
        assert.equal(env.host.style.uiScale, "100%", "fixed-icon path does not magnify the HUD");
        assert.equal(env.host.style.width, undefined, "native non-square host survives");
        assert.equal(env.renderer.style.width, undefined, "CSS selects the native render-surface ratio");
        assert.equal(env.renderer.BHasClass(fixedClass), true);
        env.click("QOLCustomizeApply"); env.clock.advance(1200);
        assert.equal(env.global.MOD_CONFIG[key], next);
        const imported = env.global.QOL.ui.modal.tryApplyImportStringWithDiagnostics(env.global.QOL.ui.configTab.getCurrentExportSettingsString());
        assert.equal(imported.ok, true); assert.equal(imported.candidateConfig[key], next);
        assert.equal(imported.candidateConfig.MINIMAP_FIXED_ICON_SIZE, 1);
        assert.equal(env.host.GetParent(), parent); assert.equal(env.renderer.GetParent(), rendererParent);
        env.clean();
    }
});

test("fixed-icon corner scaling uses the existing size keys and completes after native relayout at both densities", () => {
    for (const density of [1, 2]) for (const mode of ["base", "alt", "tab"]) {
        const env = setup({ mode, density });
        const id = mode === "base" ? "minimap" : mode === "alt" ? "minimapAlt" : "minimapTab";
        const key = mode === "base" ? "MINIMAP_SMALL_SIZE" : "MINIMAP_LARGE_SIZE_" + mode.toUpperCase();
        const initial = env.global.MOD_CONFIG[key], next = env.global.QOL.presentation.normalize(key, initial * 1.1);
        env.global.QOL.ui.customize.start(null, { elementId: id });
        const overlay = env.find("QOLCustomizeEditor");
        Object.assign(overlay, { actuallayoutwidth: 1920 * density, actuallayoutheight: 1080 * density,
            actualuiscale_x: density, actualuiscale_y: density });
        const handle = env.find("QOLCustomizeResize_" + id);
        const proxy = startDrag(env, handle);
        proxy.actualxoffset += initial * 0.1 * density; proxy.actualyoffset += initial * 0.1 * density;
        env.global.$.DispatchEvent("DragEnd", handle, proxy); env.clock.advance(500);
        assert.equal(env.store.get("ql_minimap_runtime", key), next);
        assert.equal(env.viewport.style.width, next + "px");
        assert.equal(env.renderer.BHasClass(fixedClass), true);
        assert.equal(proxy.IsValid(), true, "preview ACK alone cannot finish the resize");
        Object.assign(env.viewport, { actuallayoutwidth: next * density, actuallayoutheight: next * density });
        env.clock.advance(350);
        assert.equal(proxy.IsValid(), false, "measured native layout completes the gesture");
        env.click("QOLCustomizeUndo"); env.clock.advance(1200);
        assert.equal(env.store.get("ql_minimap_runtime", key), initial);
        env.clean();
    }
});

test("fixed-icon toggle returns to native CSS and whole-map scale without disturbing saved view sizes", () => {
    const env = setup();
    const update = values => { Object.assign(env.global.MOD_CONFIG, values); env.global.SaveAndSync(); env.clock.advance(1200); };
    update({ MINIMAP_FIXED_ICON_SIZE: 0 });
    assert.equal(env.renderer.BHasClass(fixedClass), false);
    assert.equal(env.viewport.style.width, undefined); assert.equal(env.viewport.style.height, undefined);
    assert.equal(env.host.style.uiScale, "163%");
    update({ MINIMAP_FIXED_ICON_SIZE: 1 });
    assert.equal(env.viewport.style.width, "650px"); assert.equal(env.renderer.BHasClass(fixedClass), true);
    env.hud.root.AddClass("gDetailView"); env.clock.advance(600);
    assert.equal(env.viewport.style.width, "800px");
    env.hud.root.AddClass("gScoreboardOpen"); env.clock.advance(600);
    assert.equal(env.viewport.style.width, "800px", "Alt retains established priority while both states are active");
    env.hud.root.RemoveClass("gDetailView"); env.clock.advance(600);
    assert.equal(env.viewport.style.width, "1000px");
    env.hud.root.RemoveClass("gScoreboardOpen"); env.clock.advance(600);
    assert.equal(env.viewport.style.width, "650px");
    env.clean();
});

test("fixed-icon presentation rebinds replaced native owners and releases only owned properties", () => {
    const env = setup();
    const oldViewport = env.viewport, oldRenderer = env.renderer, parent = env.host.GetParent();
    const orphan = add(env, env.hud.root, "PreviousMinimapTree");
    oldViewport.SetParent(orphan);
    const viewport = add(env, env.host, "minimap_container");
    const frame = add(env, viewport, "minimap_frame");
    const inner = add(env, viewport, "HudMinimapContainer");
    const renderer = add(env, inner, "hud_minimap");
    renderer.style.transform = "rotateZ(180deg)";
    env.clock.advance(600);
    assert.equal(viewport.style.width, "650px"); assert.equal(frame.style.height, "650px");
    assert.equal(renderer.BHasClass(fixedClass), true);
    assert.equal(oldViewport.style.width, undefined); assert.equal(oldRenderer.BHasClass(fixedClass), false);
    assert.equal(renderer.style.transform, "rotateZ(180deg)", "rotation belongs to compass/native code");
    env.hud.sandbox.global.QOL.core.FeatureRegistry.disable("ql_minimap_runtime");
    assert.equal(viewport.style.width, undefined); assert.equal(frame.style.height, undefined);
    assert.equal(renderer.BHasClass(fixedClass), false); assert.equal(env.host.style.uiScale, undefined);
    assert.equal(env.host.style.preTransformScale2d, undefined);
    assert.equal(renderer.style.transform, "rotateZ(180deg)");
    assert.equal(env.host.GetParent(), parent);
    env.hud.sandbox.global.QOL.core.FeatureRegistry.enable("ql_minimap_runtime");
    env.clock.advance(600);
    assert.equal(renderer.BHasClass(fixedClass), true); assert.equal(viewport.style.width, "650px");
    env.clean();
});

test("replaced minimap host releases stacking without moving either native hierarchy", () => {
    const env = setup({ mode: "alt" });
    Object.assign(env.global.MOD_CONFIG, { ALT_ZOOM_DRAW_OVER_UI: 1 });
    env.global.SaveAndSync(); env.clock.advance(1200);
    assert.equal(env.host.style.zIndex, "2147483647");
    const oldHost = env.host, nativeParent = oldHost.GetParent();
    const orphan = add(env, env.hud.root, "PreviousMapHost"); oldHost.SetParent(orphan);
    const host = add(env, nativeParent, "minimap_persp");
    const viewport = add(env, host, "minimap_container");
    const renderer = add(env, add(env, viewport, "HudMinimapContainer"), "hud_minimap");
    env.clock.advance(600);
    assert.equal(oldHost.style.zIndex, undefined); assert.equal(oldHost.style.uiScale, undefined);
    assert.equal(env.renderer.BHasClass(fixedClass), false);
    assert.equal(host.style.zIndex, "2147483647"); assert.equal(viewport.style.width, "800px");
    assert.equal(renderer.BHasClass(fixedClass), true);
    assert.equal(host.GetParent(), nativeParent); assert.equal(oldHost.GetParent(), orphan);
    env.hud.sandbox.global.QOL.core.FeatureRegistry.disable("ql_minimap_runtime");
    assert.equal(host.style.zIndex, undefined); assert.equal(renderer.BHasClass(fixedClass), false);
    env.clean();
});

test("minimap edits preserve whole-HUD classes owned by another feature", () => {
    const env = setup();
    Object.assign(env.global.MOD_CONFIG, { ENABLE_OLD_ITEM_COOLDOWNS: 1, ENABLE_PASSIVE_COOLDOWN: 1 });
    env.global.SaveAndSync(); env.clock.advance(1200);
    const read = () => env.hud.root.BHasClass("passive_cooldown_basic_active");
    assert.equal(read(), true);
    env.hud.sandbox.global.QOL.core.ConfigStore.set("ql_minimap_runtime", "MINIMAP_SMALL_SIZE", 700);
    assert.equal(read(), true, "a minimap-only config slice must not reset the app's root classes");
    env.clean();
});

test("fixed-icon CSS scales each native render surface proportionally instead of replacing its zoom geometry", () => {
    const source = file => fs.readFileSync(path.join(__dirname, "..", "panorama", "styles", file), "utf8");
    const native = source("base/hud_minimap.css"), override = source("hud_minimap.css");
    const rules = css => [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)]
        .flatMap(match => match[1].trim().split(",").map(selector => [selector.trim(), match[2]]));
    const nativeRules = new Map(rules(native)), fixedRules = new Map(rules(override));
    const definitions = new Map([...native.matchAll(/@define\s+(\S+):\s*([\d.]+)px;/g)].map(match => [match[1], Number(match[2])]));
    const dimension = (block, property) => {
        assert.ok(block, "source rule exists");
        return [...block.matchAll(new RegExp("(?:^|;)\\s*" + property + "\\s*:\\s*([^;]+);", "g"))].at(-1)?.[1].trim();
    };
    const cases = [["#hud_minimap", "#hud_minimap.QOLFixedMinimapIcons"],
        [".useZoomedMinimap #hud_minimap", ".useZoomedMinimap #hud_minimap.QOLFixedMinimapIcons"]];
    for (const level of [-1, 0, 1, 2, 3, 4, 6, 7, 8, 9, 10, 11]) cases.push([
        `.useZoomedMinimap #hud_minimap.zoomLevel${level}`, `.useZoomedMinimap #hud_minimap.QOLFixedMinimapIcons.zoomLevel${level}`
    ]);
    cases.push([".useZoomedMinimap #hud_minimap.gScoreboardOpen", ".useZoomedMinimap #hud_minimap.QOLFixedMinimapIcons.gScoreboardOpen"]);
    for (const [nativeSelector, fixedSelector] of cases) for (const property of ["width", "height"]) {
        const baseline = dimension(nativeRules.get(nativeSelector), property);
        const pixels = definitions.get(baseline) ?? Number(baseline.replace("px", ""));
        const percent = dimension(fixedRules.get(fixedSelector), property);
        assert.match(percent, /^[\d.]+%$/);
        assert.equal(Number(percent.slice(0, -1)) * 4, pixels, nativeSelector + " " + property);
        assert.ok(Math.abs(Number(percent.slice(0, -1)) / 100 * 800 - pixels * 2) < 0.000001,
            "a doubled viewport keeps the native render/viewport ratio");
    }
});

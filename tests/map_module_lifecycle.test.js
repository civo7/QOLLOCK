"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createHud } = require("../scripts/simulator");

function fixture({ boot = true } = {}) {
    const env = createHud({ inHideout: false });
    env.assertLoaded();
    const Q = env.sandbox.global.QOL;
    const $ = env.sandbox.global.$;
    if (!boot) { Q.core.App.shutdown(); Q.core.FeatureRegistry.boot(); }
    const add = (parent, id, type = "Panel") => $.CreatePanel(type, parent, id);
    const core = add(env.root, "", "Panel"); core.AddClass("HudCore");
    const gameplay = add(core, "gameplay_hud");
    const clamp = add(gameplay, ""); clamp.AddClass("clamp_width");
    const map = () => {
        const host = add(clamp, "minimap_persp");
        const viewport = add(host, "minimap_container");
        const frame = add(viewport, "minimap_frame");
        const inner = add(viewport, "HudMinimapContainer");
        const renderer = add(inner, "hud_minimap");
        const canvas = add(renderer, "canvas");
        const render = add(renderer, "map_render");
        return { host, viewport, frame, inner, renderer, canvas, render };
    };
    const initial = map();
    const orphan = add(env.root, "PreviousNativeMap");
    const configure = values => Q.core.ConfigAdapter.loadFromFlat(values);
    const clean = () => {
        for (const id of ["ql_compass", "ql_minimap_timers", "ql_minimap_runtime"]) Q.core.FeatureRegistry.disable(id);
        env.clock.advance(1);
        assert.deepEqual(env.clock.errors, []);
    };
    return { ...env, ...initial, Q, $, add, gameplay, map, orphan, configure, clean };
}

function onceFailStyle(panel, property) {
    const original = panel.style;
    let failures = 0;
    panel.style = new Proxy(original, {
        set(target, key, value) {
            if (key === property && failures++ === 0) throw new Error("modeled transient native style failure");
            target[key] = value;
            return true;
        }
    });
    return () => failures;
}

test("minimap decoration rebinds canvas and map_render without a viewport change", () => {
    const e = fixture();
    e.canvas.style.transform = "native icon positioning";
    e.render.style.transform = "native zoom positioning";
    e.configure({ MINIMAL_MINIMAP: 1, MINIMAL_MINIMAP_OPACITY: 0.25, MINIMAP_ICON_COLOR: 13 });
    const color = e.Q.core.panel.resolvePaletteColor(13);
    assert.equal(e.canvas.style.washColor, color);
    assert.equal(e.render.style.opacity, "0.25");
    e.canvas.SetParent(e.orphan); e.render.SetParent(e.orphan);
    const canvas = e.add(e.renderer, "canvas"), render = e.add(e.renderer, "map_render");
    e.clock.advance(1200);
    assert.equal(canvas.style.washColor, color);
    assert.equal(render.style.opacity, "0.25");
    assert.equal(e.canvas.style.washColor, undefined);
    assert.equal(e.render.style.opacity, undefined);
    assert.equal(e.canvas.style.transform, "native icon positioning");
    assert.equal(e.render.style.transform, "native zoom positioning");
    e.configure({ MINIMAL_MINIMAP: 0, MINIMAP_ICON_COLOR: 0 });
    assert.equal(render.style.opacity, undefined);
    assert.equal(render.style.brightness, undefined);
    assert.equal(canvas.style.washColor, undefined);
    assert.equal(e.renderer.style.backgroundColor, undefined);
    e.clean();
});

test("minimap partial native writes retry without another settings change", () => {
    const e = fixture();
    const mapFailures = onceFailStyle(e.render, "opacity");
    const geometryFailures = onceFailStyle(e.host, "uiScale");
    e.configure({ MINIMAL_MINIMAP: 1, MINIMAL_MINIMAP_OPACITY: 0.4, MINIMAP_SMALL_SIZE: 600 });
    e.clock.advance(600);
    assert.ok(mapFailures() >= 2);
    assert.ok(geometryFailures() >= 2);
    assert.equal(e.render.style.opacity, "0.4");
    assert.equal(e.host.style.uiScale, "150%");
    e.clean();
});

test("minimap releases range overrides on default size, source removal and disable", () => {
    const e = fixture();
    const doorway = e.add(e.renderer, "door"); doorway.AddClass("doorman_doorway");
    const range = e.add(doorway, "CastRange");
    range.style.transform = "native range placement";
    e.configure({ MINIMAP_SMALL_SIZE: 600 });
    assert.equal(range.style.uiScale, "100%");
    e.configure({ MINIMAP_SMALL_SIZE: 400 });
    assert.equal(range.style.uiScale, undefined);
    assert.equal(range.style.preTransformScale2d, undefined);
    e.configure({ MINIMAP_SMALL_SIZE: 600 });
    range.SetParent(e.orphan);
    e.clock.advance(150);
    assert.equal(range.style.uiScale, undefined);
    const replacement = e.add(doorway, "CastRange");
    e.clock.advance(150);
    assert.equal(replacement.style.preTransformScale2d, "1.00, 1.00");
    e.Q.core.FeatureRegistry.disable("ql_minimap_runtime");
    assert.equal(replacement.style.uiScale, undefined);
    assert.equal(range.style.transform, "native range placement");
    e.clean();
});

test("crate and tunnel overlays follow a living replaced viewport and retry marker writes", () => {
    const e = fixture();
    e.Q.minimapCrateData = { dl_midtown: { crates: [{ u: 0.25, v: 0.75 }, { u: 0.8, v: 0.2 }] } };
    const create = e.$.CreatePanel;
    let markerFailures;
    e.$.CreatePanel = (...args) => {
        const panel = create(...args);
        if (args[3]?.class === "minimap_marker" && !markerFailures) markerFailures = onceFailStyle(panel, "position");
        return panel;
    };
    e.configure({ ENABLE_MINIMAP_CRATE_OVERLAY: 1, ENABLE_MINIMAP_REM_TUNNELS: 1, MINIMAP_REM_TUNNELS_OPACITY: 0.5 });
    e.clock.advance(1100);
    assert.ok(markerFailures() >= 2);
    const oldTunnel = e.viewport.FindChild("tunnel_overlay"), oldCrates = e.viewport.FindChild("minimap_overlay_root");
    assert.equal(oldTunnel.style.opacity, "0.50");
    assert.equal(oldCrates.FindChild("minimap_markers").GetChild(0).style.position, "25% 75% 0");
    e.viewport.SetParent(e.orphan);
    const viewport = e.add(e.host, "minimap_container");
    const inner = e.add(viewport, "HudMinimapContainer"); e.add(inner, "hud_minimap");
    e.clock.advance(1100);
    assert.equal(oldTunnel.IsValid(), false);
    assert.equal(oldCrates.IsValid(), false);
    assert.equal(viewport.FindChild("tunnel_overlay").style.opacity, "0.50");
    assert.equal(viewport.FindChild("minimap_overlay_root").FindChild("minimap_markers").GetChildCount(), 2);
    e.$.CreatePanel = create;
    e.clean();
});

test("fixed-icon objective bridge positions share Base/Alt/Tab size and Alt precedence", () => {
    const e = fixture();
    e.configure({ ENABLE_MINIMAP_BUFF_TIMER: 1, ENABLE_MINIMAP_BUFF_TIMER_ON_BRIDGE: 1,
        MINIMAP_FIXED_ICON_SIZE: 1, MINIMAP_SMALL_SIZE: 650, MINIMAP_LARGE_SIZE_ALT: 800, MINIMAP_LARGE_SIZE_TAB: 1000,
        ENABLE_ALT_ZOOM: 1, ENABLE_TAB_ZOOM: 1 });
    const check = size => {
        e.clock.advance(450);
        const root = e.viewport.FindChild("QOLMinimapTimersRoot");
        assert.equal(root.style.width, size + "px");
        assert.equal(root.FindChild("QOLMinimapBuffBridgeLeftTimer").style.marginLeft, -144 * size / 400 + "px");
        assert.equal(root.FindChild("QOLMinimapBuffBridgeRightTimer").style.marginLeft, 144 * size / 400 + "px");
        assert.equal(root.FindChild("QOLMinimapBuffBridgeRightTimer").style.width, "48px", "timer plate keeps its physical size");
    };
    check(650);
    e.root.AddClass("gDetailView"); check(800);
    e.root.AddClass("gScoreboardOpen"); check(800);
    e.root.RemoveClass("gDetailView"); check(1000);
    e.configure({ MINIMAP_FIXED_ICON_SIZE: 0 }); check(400);
    assert.equal(e.host.style.uiScale, "250%");
    e.clean();
});

test("objective timers rebind individual living labels and native anchors, and delete owned UI on disable", () => {
    const e = fixture();
    e.configure({ ENABLE_MINIMAP_BUFF_TIMER: 1, ENABLE_MINIMAP_BUFF_TIMER_ON_BRIDGE: 1 });
    e.clock.advance(400);
    const overlay = e.viewport.FindChild("QOLMinimapTimersRoot");
    const plate = overlay.FindChild("QOLMinimapBuffBridgeLeftTimer");
    const oldLabel = plate.FindChild("QOLMinimapBuffBridgeLeftTime");
    oldLabel.SetParent(e.orphan);
    const label = e.add(plate, "QOLMinimapBuffBridgeLeftTime", "Label");
    onceFailStyle(label, "fontSize");
    e.clock.advance(700);
    assert.equal(label.style.fontSize, "11px");
    assert.match(label.text, /^\d+:\d{2}$/);
    assert.equal(oldLabel.IsValid(), false);
    e.host.SetParent(e.orphan);
    const next = e.map();
    e.clock.advance(700);
    assert.equal(overlay.IsValid(), false);
    const replacement = next.viewport.FindChild("QOLMinimapTimersRoot");
    assert.ok(replacement);
    e.Q.core.FeatureRegistry.disable("ql_minimap_timers");
    e.clock.advance(1);
    assert.equal(replacement.IsValid(), false);
    e.clean();
});

function localPlayer(e, renderer, degrees, position = "50% 50% 0px") {
    const player = e.add(renderer, ""); player.AddClass("player"); player.AddClass("localplayer");
    player.style.position = position;
    const image = e.add(player, "MainImage", "Image"); image.style.preTransformRotate2d = degrees + "deg";
    return { player, image };
}

test("compass preserves native rotation until Spinny Mode owns it and retries failed rotation", () => {
    const e = fixture();
    e.renderer.style.preTransformRotate2d = "17deg";
    localPlayer(e, e.renderer, 20);
    e.configure({ ENABLE_COMPASS: 1, MINIMAP_ROTATE_WITH_PLAYER: 0, MINIMAP_FLIP: 0 });
    e.clock.advance(200);
    assert.equal(e.renderer.style.preTransformRotate2d, "17deg");
    assert.equal(e.root.FindChildTraverse("QOLCompassDegree").text, "20°");
    const failures = onceFailStyle(e.renderer, "preTransformRotate2d");
    e.configure({ MINIMAP_ROTATE_WITH_PLAYER: 1 });
    e.clock.advance(150);
    assert.ok(failures() >= 2);
    assert.ok(Number.parseFloat(e.renderer.style.preTransformRotate2d) < 0, "the established rotation smoothing advances after the failed write");
    e.clock.advance(1000);
    assert.equal(e.renderer.style.preTransformRotate2d, "-110.00deg");
    e.configure({ MINIMAP_ROTATE_WITH_PLAYER: 0 });
    assert.equal(e.renderer.style.preTransformRotate2d, undefined);
    e.clean();
});

test("compass rebinds replaced native map and local-player sources without carrying old motion", () => {
    const e = fixture();
    const first = localPlayer(e, e.renderer, 120, "10% 10% 0px");
    e.configure({ ENABLE_COMPASS: 1, ENABLE_COMPASS_SPEED: 1, MINIMAP_ROTATE_WITH_PLAYER: 1, MINIMAP_FLIP: 1 });
    e.clock.advance(250);
    first.player.SetParent(e.orphan);
    localPlayer(e, e.renderer, 40, "80% 80% 0px");
    e.clock.advance(100);
    assert.equal(e.root.FindChildTraverse("QOLCompassDegree").text, "40°");
    assert.equal(e.root.FindChildTraverse("QOLSpeedLabel").text, "--", "new player starts a new position sample window");
    e.host.SetParent(e.orphan);
    const replacement = e.map(); localPlayer(e, replacement.renderer, 90);
    e.clock.advance(250);
    assert.equal(e.renderer.style.preTransformRotate2d, undefined);
    assert.ok(replacement.renderer.style.preTransformRotate2d);
    assert.equal(e.root.FindChildTraverse("QOLCompassDegree").text, "90°");
    e.clean();
});

test("compass speed regression, quantization and calibration survive the module rewrite", () => {
    const e = fixture();
    const source = localPlayer(e, e.renderer, 10);
    e.configure({ ENABLE_COMPASS_SPEED: 1 });
    e.clock.advance(80);
    for (let i = 1; i <= 60; i++) {
        source.player.style.position = 50 + i * 0.5 + "% 50% 0px";
        e.clock.advance(50);
    }
    assert.equal(e.root.FindChildTraverse("QOLSpeedLabel").text, "2120");
    e.clean();
});

test("compass layout and tick writes retry and follow a replaced overlay parent", () => {
    const e = fixture();
    localPlayer(e, e.renderer, 120);
    const create = e.$.CreatePanel;
    let failures;
    e.$.CreatePanel = (...args) => {
        const panel = create(...args);
        if (panel.id === "QOLCompassTick0" && !failures) failures = onceFailStyle(panel, "height");
        return panel;
    };
    e.configure({ ENABLE_COMPASS: 1, COMPASS_SCALE: 130, COMPASS_STRETCH_X: 150, COMPASS_STRETCH_Y: 175 });
    e.clock.advance(200);
    assert.ok(failures() >= 2);
    const old = e.gameplay.FindChild("QOLCompassRoot");
    assert.equal(old.style.uiScale, "130%");
    assert.equal(old.FindChild("QOLCompassBox").style.width, "300px");
    const failed = onceFailStyle(old, "uiScale");
    e.configure({ COMPASS_SCALE: 140 }); e.clock.advance(150);
    assert.ok(failed() >= 2); assert.equal(old.style.uiScale, "140%");
    const core = e.gameplay.GetParent();
    e.gameplay.SetParent(e.orphan);
    const gameplay = e.add(core, "gameplay_hud");
    const clamp = e.add(gameplay, ""); clamp.AddClass("clamp_width");
    e.host.SetParent(clamp);
    e.clock.advance(1200);
    assert.equal(old.IsValid(), false);
    assert.equal(gameplay.FindChild("QOLCompassRoot").style.uiScale, "140%");
    e.$.CreatePanel = create;
    e.clean();
});

test("map modules bound absent native discovery and recover when sources mount", () => {
    const e = fixture({ boot: false });
    for (const id of e.Q.core.FeatureRegistry.getEnabledIds()) if (id !== "ql_minimap_runtime") e.Q.core.FeatureRegistry.disable(id);
    e.host.DeleteAsync(0); e.clock.advance(1);
    const original = e.root.FindChildTraverse;
    const counts = new Map();
    const tracked = new Set(["hud_minimap", "minimap_container", "minimap_persp", "map_render", "MainImage"]);
    e.root.FindChildTraverse = function(id) {
        if (tracked.has(id)) counts.set(id, (counts.get(id) || 0) + 1);
        return original.call(this, id);
    };
    e.configure({ ENABLE_COMPASS: 1, MINIMAP_ROTATE_WITH_PLAYER: 1, ENABLE_MINIMAP_BUFF_TIMER: 1, MINIMAP_SMALL_SIZE: 600 });
    e.clock.advance(3200);
    for (const [id, count] of counts) assert.ok(count <= 15, id + " full discovery exceeded bounded retry: " + count);
    assert.equal(counts.get("MainImage") || 0, 0, "heading sources stay inside a resolved minimap");
    const replacement = e.map(); localPlayer(e, replacement.renderer, 75);
    e.clock.advance(1400);
    assert.equal(replacement.host.style.uiScale, "150%");
    assert.equal(e.root.FindChildTraverse("QOLCompassDegree").text, "75°");
    assert.ok(replacement.viewport.FindChild("QOLMinimapTimersRoot"));
    e.root.FindChildTraverse = original;
    e.clean();
});

test("timer and compass rapid disable/re-enable retires old callbacks and recreates one owned overlay", () => {
    const e = fixture();
    localPlayer(e, e.renderer, 45);
    e.configure({ ENABLE_COMPASS: 1, ENABLE_MINIMAP_BUFF_TIMER: 1 });
    e.clock.advance(250);
    e.configure({ ENABLE_COMPASS: 0, ENABLE_MINIMAP_BUFF_TIMER: 0 });
    e.configure({ ENABLE_COMPASS: 1, ENABLE_MINIMAP_BUFF_TIMER: 1 });
    e.clock.advance(700);
    assert.equal(e.gameplay.Children().filter(panel => panel.id === "QOLCompassRoot").length, 1);
    assert.equal(e.viewport.Children().filter(panel => panel.id === "QOLMinimapTimersRoot").length, 1);
    assert.equal(e.root.FindChildTraverse("QOLCompassDegree").text, "45°");
    assert.equal(e.viewport.FindChild("QOLMinimapTimersRoot").BHasClass("qol-hidden"), false);
    e.clean();
});

test("compass resumes the same heading after its image is unavailable", () => {
    const e = fixture();
    const source = localPlayer(e, e.renderer, 40);
    e.configure({ ENABLE_COMPASS: 1 }); e.clock.advance(200);
    source.image.SetParent(e.orphan); e.clock.advance(150);
    assert.equal(e.root.FindChildTraverse("QOLCompassDegree").text, "N/A");
    source.image.SetParent(source.player); e.clock.advance(150);
    assert.equal(e.root.FindChildTraverse("QOLCompassDegree").text, "40°");
    e.clean();
});

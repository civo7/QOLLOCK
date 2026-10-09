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

function directMinimap(e) {
    e.Q.core.App.shutdown(); e.sandbox.eval("Math.random = () => 0;");
    e.configure({ ENABLE_MINIMAP_CRATE_OVERLAY: 1, ENABLE_MINIMAP_REM_TUNNELS: 1, MINIMAP_SMALL_SIZE: 600 });
    e.Q.minimapCrateData = { dl_midtown: { crates: [[0.25, 0.75], [0.8, 0.2], [0.5, 0.5]] } };
    const cfg = e.Q.core.ConfigStore.view("ql_minimap_runtime"), callbacks = new Map();
    let reads = 0;
    const create = () => e.Q.core.FeatureRegistry.getManifest("ql_minimap_runtime").create({
        id: "ql_minimap_runtime", config: { view() { reads++; return cfg; } },
        events: { on(name, fn) { callbacks.set(name, fn); }, off(name, fn) { if (callbacks.get(name) === fn) callbacks.delete(name); } }
    });
    return { feature: create(), create, cfg, callbacks, reads: () => reads };
}

test("crate ownership retires moved markers and shrinking data without rebuilding unaffected children", () => {
    const e = fixture(), { feature } = directMinimap(e); feature.onEnable();
    const crates = e.viewport.FindChild("minimap_overlay_root"), markers = crates.FindChild("minimap_markers");
    const moved = markers.GetChild(0), retained = markers.GetChild(1), removed = markers.GetChild(2);
    moved.SetParent(e.orphan); removed.SetParent(e.orphan); e.clock.advance(150);
    assert.equal(moved.IsValid(), false); assert.equal(removed.IsValid(), false);
    assert.equal(markers.GetChildCount(), 3); assert.equal(markers.FindChild("QOLMinimapCrateMarker1"), retained);
    const nextRemoved = markers.FindChild("QOLMinimapCrateMarker2"); nextRemoved.SetParent(e.orphan);
    e.Q.minimapCrateData = { dl_midtown: { crates: [[0.3, 0.4]] } }; e.clock.advance(150);
    assert.equal(retained.IsValid(), false); assert.equal(nextRemoved.IsValid(), false);
    assert.equal(markers.GetChildCount(), 1); assert.equal(markers.GetChild(0).style.position, "30% 40% 0");
    const last = markers.GetChild(0); last.SetParent(e.orphan); feature.onDisable(); e.clock.advance(20);
    assert.equal(last.IsValid(), false); assert.equal(crates.IsValid(), false); assert.equal(e.renderer.IsValid(), true); e.clean();
});

test("minimap hides partial crate and tunnel trees until construction and styles recover", () => {
    const e = fixture(), { feature } = directMinimap(e), create = e.$.CreatePanel;
    let reject = true;
    e.$.CreatePanel = (type, parent, id, properties) => {
        if (id === "QOLMinimapCrateMarker1" && reject) throw Error("modeled missing marker");
        const panel = create(type, parent, id, properties);
        if (id === "tunnel_overlay" || id === "QOLMinimapCrateMarker0") panel.style = new Proxy(panel.style, {
            set(target, key, value) {
                if (reject && (key === "opacity" || key === "position")) throw Error("modeled partial minimap style");
                target[key] = value; return true;
            }
        });
        return panel;
    };
    feature.onEnable();
    const crates = e.viewport.FindChild("minimap_overlay_root"), tunnel = e.viewport.FindChild("tunnel_overlay");
    assert.equal(crates.BHasClass("qol-hidden"), true); assert.equal(tunnel.BHasClass("qol-hidden"), true);
    assert.equal(tunnel.BHasClass("tunnel_locked_on"), false);
    reject = false; e.clock.advance(150);
    assert.equal(crates.BHasClass("qol-hidden"), false); assert.equal(tunnel.BHasClass("qol-hidden"), false);
    assert.equal(crates.FindChild("minimap_markers").GetChildCount(), 3);
    assert.equal(crates.FindChild("minimap_markers").GetChild(0).style.position, "25% 75% 0");
    feature.onDisable(); e.clock.advance(20); e.$.CreatePanel = create; e.clean();
});

test("minimap derives settings through active hooks and stopped callbacks cannot revive presentation", () => {
    const e = fixture(), { feature, cfg, callbacks, reads } = directMinimap(e); feature.onEnable();
    const scoreboard = callbacks.get("engine:scoreboard_toggle"); e.clock.advance(600); assert.equal(reads(), 1);
    cfg.MINIMAP_SMALL_SIZE = 800; feature.onSettingsChanged(); assert.equal(e.host.style.uiScale, "200%");
    feature.onDisable(); e.clock.advance(20);
    assert.equal(callbacks.size, 0); assert.equal(e.host.style.uiScale, undefined);
    feature.onSettingsChanged(); scoreboard(); e.clock.advance(1500);
    assert.equal(e.viewport.FindChild("minimap_overlay_root"), null); assert.equal(e.viewport.FindChild("tunnel_overlay"), null);
    assert.equal(e.host.style.uiScale, undefined);
    assert.equal(e.Q.core.Scheduler.getWorkSnapshot().some(record => record.id === "ql_minimap_runtime"), false); e.clean();
});

test("minimap rapid replacement waits for queued previous trees and leaves one current overlay", () => {
    const e = fixture(), { feature, create } = directMinimap(e); feature.onEnable();
    const old = e.viewport.FindChild("minimap_overlay_root"), moved = old.FindChildTraverse("QOLMinimapCrateMarker1");
    moved.SetParent(e.orphan); feature.onDisable();
    const replacement = create(); replacement.onEnable();
    assert.equal(e.viewport.FindChild("minimap_overlay_root"), old); assert.equal(old.visible, false);
    e.clock.advance(150);
    assert.equal(old.IsValid(), false); assert.equal(moved.IsValid(), false);
    assert.equal(e.viewport.Children().filter(panel => panel.id === "minimap_overlay_root").length, 1);
    assert.equal(e.viewport.Children().filter(panel => panel.id === "tunnel_overlay").length, 1);
    replacement.onDisable(); e.clock.advance(20); e.clean();
});

test("minimap releases a still living old HUD while waiting for the current native scene", () => {
    const e = fixture(), { feature } = directMinimap(e); e.host.style.transform = "native host transform"; feature.onEnable();
    const old = e.viewport.FindChild("minimap_overlay_root"), moved = old.FindChildTraverse("QOLMinimapCrateMarker0"); moved.SetParent(e.orphan);
    e.doc.root = e.add(null, "LoadingRoot"); e.clock.advance(150);
    assert.equal(old.IsValid(), false); assert.equal(moved.IsValid(), false); assert.equal(e.root.IsValid(), true);
    assert.equal(e.host.style.uiScale, undefined); assert.equal(e.host.style.transform, "native host transform");
    assert.equal(e.doc.root.GetChildCount(), 0);
    const root = e.add(null, "Hud", "CitadelHud"), core = e.add(root, ""); core.AddClass("HudCore");
    const gameplay = e.add(core, "gameplay_hud"), clamp = e.add(gameplay, ""); clamp.AddClass("clamp_width");
    const host = e.add(clamp, "minimap_persp"), viewport = e.add(host, "minimap_container"), inner = e.add(viewport, "HudMinimapContainer");
    e.add(inner, "hud_minimap"); e.doc.root = root; e.clock.advance(150);
    assert.equal(host.style.uiScale, "150%"); assert.ok(viewport.FindChild("minimap_overlay_root"));
    assert.equal(e.viewport.FindChild("minimap_overlay_root"), null); feature.onDisable(); e.clock.advance(20); e.clean();
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
    const foreign = e.add(plate, "QOLMinimapBuffBridgeLeftTime", "Label");
    const create = e.$.CreatePanel; let failures;
    e.$.CreatePanel = (...args) => {
        const panel = create(...args);
        if (panel.id === "QOLMinimapBuffBridgeLeftTime") failures = onceFailStyle(panel, "fontSize");
        return panel;
    };
    e.clock.advance(1000);
    const label = plate.FindChild("QOLMinimapBuffBridgeLeftTime");
    assert.equal(foreign.IsValid(), false); assert.notEqual(label, foreign); assert.ok(failures() >= 2);
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
    e.$.CreatePanel = create;
    e.clean();
});

function directTimer(e) {
    e.Q.core.App.shutdown();
    e.configure({ ENABLE_MINIMAP_BUFF_TIMER: 1, ENABLE_MINIMAP_BUFF_TIMER_ON_BRIDGE: 1 });
    const config = { view: () => e.Q.core.ConfigStore.view("ql_minimap_timers") };
    const create = () => e.Q.core.FeatureRegistry.getManifest("ql_minimap_timers").create({ id: "ql_minimap_timers", config });
    return { feature: create(), create };
}
function createdTimerChildren(overlay) {
    const children = [], queue = overlay.Children();
    while (queue.length) { const panel = queue.shift(); children.push(panel); queue.push(...panel.Children()); }
    return children;
}

test("objective timer hooks cannot construct UI outside their active lifetime and retire every moved child", () => {
    const e = fixture(), { feature } = directTimer(e);
    feature.onSettingsChanged(); assert.equal(e.viewport.FindChild("QOLMinimapTimersRoot"), null);
    feature.onEnable(); const overlay = e.viewport.FindChild("QOLMinimapTimersRoot");
    const children = createdTimerChildren(overlay); assert.equal(children.length, 12);
    for (const panel of children) panel.SetParent(e.orphan);
    e.clock.advance(650); for (const panel of children) assert.equal(panel.IsValid(), false, panel.id);
    assert.match(e.viewport.FindChildTraverse("QOLMinimapBuffBridgeLeftTime").text, /^\d+:\d{2}$/);
    const moved = e.viewport.FindChildTraverse("QOLMinimapBuffBridgeRightIcon"); moved.SetParent(e.orphan);
    feature.onDisable(); feature.onSettingsChanged(); e.clock.advance(650);
    assert.equal(moved.IsValid(), false); assert.equal(e.viewport.FindChild("QOLMinimapTimersRoot"), null);
    assert.equal(e.renderer.IsValid(), true); assert.equal(e.viewport.IsValid(), true); e.clean();
});

test("objective timers keep partial construction hidden and retire its moved children", () => {
    const e = fixture(), { feature } = directTimer(e), create = e.$.CreatePanel; let reject = true;
    e.$.CreatePanel = (...args) => {
        if (args[2] === "QOLMinimapBuffBridgeRightTime" && reject) throw Error("modeled late label");
        return create(...args);
    };
    feature.onEnable(); const overlay = e.viewport.FindChild("QOLMinimapTimersRoot");
    assert.equal(overlay.BHasClass("qol-hidden"), true);
    assert.equal(overlay.FindChildTraverse("QOLMinimapBuffBridgeRightTime"), null);
    const moved = overlay.FindChildTraverse("QOLMinimapBuffBridgeLeftIcon"); moved.SetParent(e.orphan);
    reject = false; e.clock.advance(650); assert.equal(moved.IsValid(), false);
    assert.equal(overlay.BHasClass("qol-hidden"), false);
    assert.match(overlay.FindChildTraverse("QOLMinimapBuffBridgeRightTime").text, /^\d+:\d{2}$/);
    feature.onDisable(); e.clock.advance(20); assert.equal(overlay.IsValid(), false); e.$.CreatePanel = create; e.clean();
});

test("objective timers wait for queued previous trees during immediate re-enable", () => {
    const e = fixture(), { feature, create } = directTimer(e); feature.onEnable();
    const previous = e.viewport.FindChild("QOLMinimapTimersRoot"); feature.onDisable();
    const next = create(); next.onEnable(); next.onSettingsChanged(); assert.equal(previous.visible, false);
    e.clock.advance(650); assert.equal(previous.IsValid(), false);
    const current = e.viewport.FindChild("QOLMinimapTimersRoot"); assert.ok(current); assert.notEqual(current, previous);
    assert.equal(current.BHasClass("qol-hidden"), false); assert.equal(e.viewport.Children().filter(panel => panel.id === current.id).length, 1);
    next.onDisable(); e.clock.advance(20); assert.equal(current.IsValid(), false); e.clean();
});

test("objective timers release a living HUD and loading roots before rebinding current native clocks", () => {
    const e = fixture(), { feature } = directTimer(e); feature.onEnable();
    const previous = e.viewport.FindChild("QOLMinimapTimersRoot"), moved = previous.FindChildTraverse("QOLMinimapRejuvTime");
    moved.SetParent(e.orphan);
    e.doc.root = e.add(null, "LoadingRoot"); const fake = e.add(e.doc.root, "minimap_container");
    feature.onSettingsChanged(); e.clock.advance(350);
    assert.equal(previous.IsValid(), false); assert.equal(moved.IsValid(), false);
    assert.equal(fake.FindChild("QOLMinimapTimersRoot"), null); assert.equal(e.root.IsValid(), true);
    e.doc.root = e.add(null, "Hud", "CitadelHud");
    const core = e.add(e.doc.root, ""); core.AddClass("HudCore");
    const top = e.add(core, "TopBar"); e.add(top, "GameTime", "Label").text = "12:00";
    const gameplay = e.add(core, "gameplay_hud"), clamp = e.add(gameplay, ""); clamp.AddClass("clamp_width");
    const host = e.add(clamp, "minimap_persp"), viewport = e.add(host, "minimap_container");
    const inner = e.add(viewport, "HudMinimapContainer"); e.add(inner, "hud_minimap");
    e.clock.advance(650); const current = viewport.FindChild("QOLMinimapTimersRoot");
    assert.ok(current); assert.equal(current.FindChildTraverse("QOLMinimapBuffBridgeLeftTime").text, "3:00");
    feature.onDisable(); e.clock.advance(20); assert.equal(current.IsValid(), false); e.clean();
});

function localPlayer(e, renderer, degrees, position = "50% 50% 0px") {
    const player = e.add(renderer, ""); player.AddClass("player"); player.AddClass("localplayer");
    player.style.position = position;
    const image = e.add(player, "MainImage", "Image"); image.style.preTransformRotate2d = degrees + "deg";
    return { player, image };
}

function directCompass(e, settings = {}) {
    e.Q.core.App.shutdown();
    e.configure({ ENABLE_COMPASS: 1, ENABLE_COMPASS_SPEED: 1, ...settings });
    let reads = 0;
    const config = { view() { reads++; return e.Q.core.ConfigStore.view("ql_compass"); } };
    const create = () => e.Q.core.FeatureRegistry.getManifest("ql_compass").create({ id: "ql_compass", config });
    return { feature: create(), create, reads: () => reads };
}

test("compass owns every moved tick/readout child and contains inactive settings hooks", () => {
    const e = fixture(), source = localPlayer(e, e.renderer, 40), { feature, reads } = directCompass(e);
    feature.onSettingsChanged(); assert.equal(e.gameplay.FindChild("QOLCompassRoot"), null);
    feature.onEnable();
    const compass = e.gameplay.FindChild("QOLCompassRoot"), speed = e.gameplay.FindChild("QOLSpeedRoot");
    const children = [...createdTimerChildren(compass), ...createdTimerChildren(speed)]; assert.equal(children.length, 25);
    for (const panel of children) panel.SetParent(e.orphan);
    e.clock.advance(150); for (const panel of children) assert.equal(panel.IsValid(), false, panel.id);
    assert.equal(compass.FindChildTraverse("QOLCompassDegree").text, "40°");
    e.clock.advance(1500); assert.equal(reads(), 2, "idle settings derivation is independent of native sampling");
    const moved = compass.FindChildTraverse("QOLCompassTick0"); moved.SetParent(e.orphan);
    feature.onDisable(); feature.onSettingsChanged(); e.clock.advance(150);
    assert.equal(moved.IsValid(), false); assert.equal(compass.IsValid(), false); assert.equal(speed.IsValid(), false);
    assert.equal(e.gameplay.FindChild("QOLCompassRoot"), null); assert.equal(source.image.style.preTransformRotate2d, "40deg"); e.clean();
});

test("compass rapid re-enable waits for both queued trees without reviving their former panels", () => {
    const e = fixture(); localPlayer(e, e.renderer, 45); const { feature, create } = directCompass(e);
    feature.onEnable(); const compass = e.gameplay.FindChild("QOLCompassRoot"), speed = e.gameplay.FindChild("QOLSpeedRoot");
    feature.onDisable(); const next = create(); next.onEnable(); next.onSettingsChanged();
    assert.equal(compass.visible, false); assert.equal(speed.visible, false);
    e.clock.advance(150); assert.equal(compass.IsValid(), false); assert.equal(speed.IsValid(), false);
    assert.equal(e.gameplay.Children().filter(panel => panel.id === "QOLCompassRoot").length, 1);
    assert.equal(e.gameplay.Children().filter(panel => panel.id === "QOLSpeedRoot").length, 1);
    assert.equal(e.gameplay.FindChildTraverse("QOLCompassDegree").text, "45°");
    next.onDisable(); e.clock.advance(20); e.clean();
});

test("compass partial tree construction hides both readouts and recovers independently of native rotation", () => {
    const e = fixture(); localPlayer(e, e.renderer, 40);
    const { feature } = directCompass(e, { MINIMAP_ROTATE_WITH_PLAYER: 1 }), create = e.$.CreatePanel; let reject = true;
    e.$.CreatePanel = (...args) => {
        if (args[2] === "QOLCompassTick0" && reject) throw Error("modeled pending tick");
        return create(...args);
    };
    feature.onEnable(); const compass = e.gameplay.FindChild("QOLCompassRoot"), speed = e.gameplay.FindChild("QOLSpeedRoot");
    assert.equal(compass.style.visibility, "collapse"); assert.equal(speed.style.visibility, "collapse");
    assert.equal(compass.FindChildTraverse("QOLCompassTick0"), null); assert.ok(e.renderer.style.preTransformRotate2d);
    reject = false; e.clock.advance(150); assert.equal(compass.style.visibility, "visible"); assert.equal(speed.style.visibility, "visible");
    assert.equal(compass.FindChildTraverse("QOLCompassDegree").text, "40°");
    feature.onDisable(); e.clock.advance(20); assert.equal(e.renderer.style.preTransformRotate2d, undefined); e.$.CreatePanel = create; e.clean();
});

test("compass waits for gameplay and releases living old HUD/native rotation before binding new sources", () => {
    const e = fixture(); localPlayer(e, e.renderer, 40);
    const external = e.add(null, "RetiredGameplay"), core = e.gameplay.GetParent(); e.gameplay.SetParent(external);
    const { feature } = directCompass(e, { MINIMAP_ROTATE_WITH_PLAYER: 1, MINIMAP_FLIP: 1 }); feature.onEnable();
    assert.equal(e.root.FindChildTraverse("QOLCompassRoot"), null); e.gameplay.SetParent(core); e.clock.advance(1200);
    const compass = e.gameplay.FindChild("QOLCompassRoot"); assert.ok(compass); assert.ok(e.renderer.style.preTransformRotate2d);
    e.doc.root = e.add(null, "LoadingRoot"); e.add(e.doc.root, "gameplay_hud"); e.clock.advance(150);
    assert.equal(compass.IsValid(), false); assert.equal(e.doc.root.FindChild("QOLCompassRoot"), null);
    assert.equal(e.renderer.style.preTransformRotate2d, undefined); assert.equal(e.renderer.BHasClass("qol_minimap_flip_active"), false);
    e.doc.root = e.add(null, "Hud", "CitadelHud");
    const nextCore = e.add(e.doc.root, ""); nextCore.AddClass("HudCore"); const gameplay = e.add(nextCore, "gameplay_hud");
    const clamp = e.add(gameplay, ""); clamp.AddClass("clamp_width"); const host = e.add(clamp, "minimap_persp");
    const viewport = e.add(host, "minimap_container"), inner = e.add(viewport, "HudMinimapContainer"), renderer = e.add(inner, "hud_minimap");
    localPlayer(e, renderer, 60); feature.onSettingsChanged();
    assert.equal(gameplay.FindChildTraverse("QOLCompassDegree").text, "60°");
    assert.equal(gameplay.FindChildTraverse("QOLSpeedLabel").text, "--"); assert.equal(renderer.style.preTransformRotate2d, "30.00deg");
    e.clock.advance(150); assert.equal(gameplay.FindChildTraverse("QOLSpeedLabel").text, "0");
    assert.equal(renderer.BHasClass("qol_minimap_flip_active"), false, "spin rotation already includes the configured flip");
    e.Q.core.ConfigStore.set("ql_compass", "MINIMAP_ROTATE_WITH_PLAYER", false); feature.onSettingsChanged();
    assert.equal(renderer.BHasClass("qol_minimap_flip_active"), true); assert.equal(e.root.IsValid(), true);
    feature.onDisable(); e.clock.advance(20); assert.equal(renderer.style.preTransformRotate2d, undefined);
    assert.equal(renderer.BHasClass("qol_minimap_flip_active"), false); e.clean();
});

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

"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createHud } = require("../scripts/simulator");
const load = require("./load_settings_environment");
const fs = require("node:fs");
const path = require("node:path");

test("loot text compensates native inversion only while the map is effectively flipped", () => {
    const css = fs.readFileSync(path.join(__dirname, "../panorama/styles/features/ql_feat_native_hud_minimap.css"), "utf8");
    assert.equal(/\.qol_minimap_flip_active\.HudMinimap\s*\{/.test(css), false,
        "the JS half-turn must not be duplicated by a renderer transform rule");
    assert.match(css, /\.invert_map #QOLMinimapLootRoot \.QOLMinimapLootText,\s*\.qol_minimap_flip_active #QOLMinimapLootRoot \.QOLMinimapLootText\s*\{\s*transform:\s*scaleX\(-1\) scaleY\(-1\);/);
    assert.match(css, /\.invert_map\.qol_minimap_flip_active #QOLMinimapLootRoot \.QOLMinimapLootText\s*\{\s*transform:\s*none;/);
});

test("ordinary crate styles load through the native renderer stylesheet", () => {
    const read = file => fs.readFileSync(path.join(__dirname, "../panorama/styles/", file), "utf8");
    assert.match(read("hud_minimap.css"), /@import url\("s2r:\/\/panorama\/styles\/features\/ql_feat_native_hud_minimap\.vcss_c"\)/);
    const native = read("features/ql_feat_native_hud_minimap.css");
    assert.match(native, /#hud_minimap #minimap_overlay_root\s*\{[^}]*width: 100%;[^}]*height: 100%;/);
    assert.match(native, /#hud_minimap #minimap_markers\s*\{/);
    assert.doesNotMatch(read("features/ql_feat_minimap.css"), /(?:#minimap_overlay_root|#minimap_markers|\.minimap_marker)\s*\{/);
});

test("viewport overlay flip rules belong to the HUD stylesheet, outside the native renderer context", () => {
    const read = file => fs.readFileSync(path.join(__dirname, "../panorama/styles/features/", file), "utf8");
    const hud = read("ql_feat_minimap.css"), renderer = read("ql_feat_native_hud_minimap.css");
    for (const id of ["tunnel_overlay", "QOLMinimapTimersRoot"]) {
        assert.equal(hud.includes(".qol_minimap_flip_active #" + id), true, id + " follows user Flip");
        assert.equal(hud.includes(".localPlayerTeam2 .qol_minimap_flip_active #" + id), true, id + " cancels two half-turns");
        assert.equal(renderer.includes("#" + id), false, id + " is a viewport child, not a renderer child");
    }
});

function fixture() {
    const env = createHud({ inHideout: false }); env.assertLoaded();
    const Q = env.sandbox.global.QOL, $ = env.sandbox.global.$;
    const add = (parent, id, classes = []) => {
        const panel = $.CreatePanel("Panel", parent, id); classes.forEach(cls => panel.AddClass(cls)); return panel;
    };
    const core = add(env.root, "", ["HudCore"]);
    const clamp = add(add(core, "gameplay_hud"), "", ["clamp_width"]);
    const viewport = add(add(clamp, "minimap_persp"), "minimap_container");
    const inner = add(viewport, "HudMinimapContainer");
    const map = () => add(inner, "hud_minimap", ["HudMinimap", "dl_midtown"]);
    const renderer = map();
    let second = 0;
    Q.core.time.readObservedGameTime = () => second;
    const configure = config => { Q.core.ConfigAdapter.loadFromFlat(config); env.clock.advance(1100); };
    const clean = () => {
        Q.core.FeatureRegistry.disable("ql_minimap_loot"); env.clock.advance(1000);
        assert.deepEqual(env.clock.errors, []);
        assert.equal(Q.core.FeatureRegistry.getErrorCounts().ql_minimap_loot || 0, 0);
    };
    return { ...env, Q, $, add, viewport, inner, renderer, map, configure, clean, setSecond: value => { second = value; } };
}

test("point references use one image per category instead of one panel per point", () => {
    const e = fixture();
    e.configure({ ENABLE_MINIMAP_CRATE_OVERLAY: 1, ENABLE_MINIMAP_TOUGH_CRATES: 1,
        ENABLE_MINIMAP_HEALING_SNACKS: 1, ENABLE_MINIMAP_STATUES: 1, MINIMAP_LOOT_OPACITY: 0.4 });
    const ordinary = e.renderer.FindChildTraverse("minimap_markers");
    assert.equal(ordinary.GetChildCount(), 1, "425 ordinary-crate panels become one image");
    assert.match(ordinary.GetChild(0).style.backgroundImage, /minimap_references_crates\.vsvg/);
    for (const kind of ["tough_crates", "snacks", "statues"]) {
        const group = e.renderer.FindChildTraverse("QOLMapLoot_" + kind);
        assert.equal(group.GetChildCount(), 1, kind + " has one retained image");
        assert.match(group.GetChild(0).style.backgroundImage, new RegExp("minimap_references_" + kind + "\\.vsvg"));
        assert.equal(group.GetChild(0).style.width, "100%");
        assert.equal(group.GetChild(0).style.height, "100%");
    }
    assert.equal(e.renderer.FindChild("QOLMinimapLootRoot").style.opacity, "0.4");
    e.clean();
});

test("independent loot images use native renderer ancestry, chosen marker size and appearance", () => {
    const e = fixture();
    e.configure({ ENABLE_MINIMAP_TOUGH_CRATES: 1, ENABLE_MINIMAP_HEALING_SNACKS: 1, ENABLE_MINIMAP_STATUES: 1,
        MINIMAP_CAMP_NAMES: 2, MINIMAP_LOOT_MARKER_SCALE: 150, MINIMAP_LOOT_OPACITY: 0.35 });
    const layer = e.renderer.FindChild("QOLMinimapLootRoot"); assert.ok(layer);
    assert.equal(layer.style.opacity, "0.35");
    for (const key of ["tough_crates", "snacks", "statues"]) {
        const group = layer.FindChild("QOLMapLoot_" + key);
        assert.equal(group.visible, true);
        assert.equal(group.GetChildCount(), 1);
        assert.equal(group.GetChild(0).style.backgroundImage,
            'url("s2r://panorama/images/qollock/minimap_references_' + key + '_150.vsvg")');
    }
    assert.equal(layer.FindChild("QOLMapLoot_tough_crates").GetChild(0).style.width, "100%");
    assert.equal(layer.FindChild("QOLMapLoot_names").GetChildCount(), 4);
    e.configure({ MINIMAP_CAMP_NAMES: 1 });
    assert.equal(e.renderer.FindChildTraverse("QOLMapLoot_names").GetChildCount(), 19);
    e.clean(); assert.ok(!e.renderer.FindChild("QOLMinimapLootRoot"), "retired renderer must not keep a loot tree");
});

test("loot opacity and toggles preserve marker trees while geometry refreshes only affected groups", () => {
    const e = fixture();
    e.configure({ ENABLE_MINIMAP_TOUGH_CRATES: 1, ENABLE_MINIMAP_HEALING_SNACKS: 1, ENABLE_MINIMAP_CRATE_ROUTES: 1,
        MINIMAP_CAMP_NAMES: 1, MINIMAP_LOOT_MARKER_SCALE: 100, MINIMAP_ROUTE_SCALE: 100 });
    const layer = e.renderer.FindChild("QOLMinimapLootRoot");
    const crates = layer.FindChild("QOLMapLoot_tough_crates"), names = layer.FindChild("QOLMapLoot_names");
    const routes = layer.FindChild("QOLMapLoot_runs"), dot = crates.GetChild(0), segment = routes.GetChild(0);
    let creates = 0;
    const create = e.$.CreatePanel;
    e.$.CreatePanel = (...args) => { creates++; return create(...args); };
    e.configure({ MINIMAP_LOOT_OPACITY: 0.35, ENABLE_MINIMAP_TOUGH_CRATES: 0 });
    assert.ok(e.renderer.FindChild("QOLMinimapLootRoot") === layer, "opacity updates retain the existing layer");
    assert.equal(layer.style.opacity, "0.35"); assert.equal(crates.visible, false);
    assert.equal(creates, 0, "appearance and group gates must not reconstruct static markers");
    e.configure({ MINIMAP_LOOT_MARKER_SCALE: 150 });
    assert.equal(dot.IsValid(), true); assert.equal(segment.IsValid(), true);
    assert.equal(segment.style.height, "2.00px", "marker scale leaves route geometry alone");
    e.configure({ ENABLE_MINIMAP_TOUGH_CRATES: 1 });
    assert.ok(crates.GetChild(0) === dot); assert.match(dot.style.backgroundImage, /_tough_crates_150\.vsvg/);
    e.configure({ MINIMAP_ROUTE_SCALE: 150 });
    assert.ok(routes.GetChild(0) === segment); assert.equal(segment.style.height, "3.00px");
    assert.ok(crates.GetChild(0) === dot); assert.equal(creates, 0);
    e.configure({ MINIMAP_CAMP_NAMES: 2 });
    assert.equal(layer.FindChild("QOLMapLoot_names").GetChildCount(), 4);
    assert.ok(layer.FindChild("QOLMapLoot_runs") === routes); assert.ok(layer.FindChild("QOLMapLoot_tough_crates") === crates);
    assert.equal(names.IsValid(), false, "name-set changes retire only the obsolete name group");
    e.clean();
});

test("route strokes tile once per straight leg with map-relative dash spacing and fixed pixel thickness", () => {
    const e = fixture();
    // One 3-4-5 triangle leg, followed by a duplicate stop. These assumed
    // native CSS values check our renderer inputs, not native rasterization.
    e.Q.minimapLootData.runs = [{ lane: "blue", stops: [[0.10, 0.20], [0.13, 0.24], [0.13, 0.24]] }];
    e.configure({ ENABLE_MINIMAP_CRATE_ROUTES: 1, MINIMAP_ROUTE_SCALE: 100 });
    const routes = e.renderer.FindChildTraverse("QOLMapLoot_runs");
    const strokes = routes.Children().filter(panel => panel.paneltype === "Panel");
    assert.equal(strokes.length, 1, "one nonempty leg must not retain a panel per dash");
    const stroke = strokes[0];
    assert.equal(stroke.style.position, "9.000% 22.000% 0px");
    assert.equal(stroke.style.width, "5.000%");
    assert.equal(stroke.style.height, "2.00px");
    assert.equal(stroke.style.marginTop, "-1.00px");
    assert.ok(Math.abs(Number(stroke.style.transform.match(/rotateZ\((.+)deg\)/)[1]) - 53.1301023542) < 1e-9);
    assert.equal(stroke.style.backgroundSize, "28.000% 100%");
    assert.equal(stroke.style.backgroundPosition, "0px 0px");
    assert.equal(stroke.style.backgroundRepeat, "repeat-x");
    assert.equal(stroke.style.washColor, "#29b1cc");
    assert.equal(stroke.style.opacity, "0.9");
    const imagePath = stroke.style.backgroundImage.match(/^url\("s2r:\/\/(.+)"\)$/)[1];
    const svg = fs.readFileSync(path.join(__dirname, "..", imagePath), "utf8");
    const tileSize = svg.match(/<svg width="(\d+)" height="(\d+)"/);
    const opaqueRect = svg.match(/<path fill="#FFFFFF" d="M0 0H(\d+)V(\d+)H0Z"/);
    assert.ok(tileSize && opaqueRect, "the shared white tile must have a transparent trailing gap");
    assert.equal(Number(opaqueRect[1]) / Number(tileSize[1]), 4 / 7);
    assert.equal(Number(opaqueRect[2]), Number(tileSize[2]));
    assert.equal(routes.Children().filter(panel => panel.paneltype === "Label").map(panel => panel.text).join(","), "3,2,1");
    // The 28% tile is 1.4% of the map; its opaque 4/7 is 0.8%.
    // At both sizes only length/spacing scale, never the stroke thickness.
    for (const mapWidth of [360, 1440]) {
        const legWidth = parseFloat(stroke.style.width) / 100 * mapWidth;
        const period = parseFloat(stroke.style.backgroundSize) / 100 * legWidth;
        assert.ok(Math.abs(period - mapWidth * 0.014) < 1e-9);
        assert.ok(Math.abs(period * 4 / 7 - mapWidth * 0.008) < 1e-9);
    }
    e.configure({ MINIMAP_ROUTE_SCALE: 150, MINIMAP_LOOT_OPACITY: 0.4 });
    assert.ok(routes.GetChild(0) === stroke, "appearance edits retain the leg");
    assert.equal(stroke.style.height, "3.00px");
    assert.equal(stroke.style.marginTop, "-1.50px");
    assert.equal(stroke.style.backgroundSize, "28.000% 100%");
    assert.equal(routes.GetParent().style.opacity, "0.4");
    e.clean();
});

test("crate routes and crates follow their toggles at every game time, ignoring retired minute windows", () => {
    const e = fixture();
    e.configure({ ENABLE_MINIMAP_TOUGH_CRATES: 1, ENABLE_MINIMAP_CRATE_OVERLAY: 1, ENABLE_MINIMAP_CRATE_ROUTES: 1,
        MINIMAP_ROUTE_FROM_MINUTE: 3, MINIMAP_ROUTE_UNTIL_MINUTE: 10, MINIMAP_CRATE_FROM_MINUTE: 2, MINIMAP_CRATE_UNTIL_MINUTE: 5 });
    for (const second of [-30, 0, 180, 600, 1800]) {
        e.setSecond(second); e.clock.advance(700);
        const routes = e.renderer.FindChildTraverse("QOLMapLoot_runs");
        assert.equal(routes.visible, true, `routes at ${second}s`);
        assert.equal(routes.Children().filter(panel => panel.paneltype === "Panel").length, 84,
            "the supplied routes retain straight legs instead of their former 238 separate dashes");
        assert.equal(routes.Children().filter(panel => panel.paneltype === "Label").length, 90);
        assert.equal(e.renderer.FindChildTraverse("QOLMapLoot_tough_crates").visible, true);
        assert.equal(e.renderer.FindChild("minimap_overlay_root").BHasClass("qol-hidden"), false);
    }
    e.configure({ ENABLE_MINIMAP_CRATE_ROUTES: 0 });
    assert.equal(e.renderer.FindChildTraverse("QOLMapLoot_runs").visible, false);
    e.configure({ ENABLE_MINIMAP_CRATE_ROUTES: 1 });
    assert.equal(e.renderer.FindChildTraverse("QOLMapLoot_runs").visible, true);
    e.clean();
});

test("Map References marker size and opacity also affect ordinary crates without enabling other loot", () => {
    const e = fixture();
    e.configure({ ENABLE_MINIMAP_CRATE_OVERLAY: 1, MINIMAP_LOOT_MARKER_SCALE: 150, MINIMAP_LOOT_OPACITY: 0.4 });
    const crates = e.renderer.FindChild("minimap_overlay_root");
    assert.equal(crates.style.opacity, "0.4");
    const image = crates.FindChild("minimap_markers").GetChild(0);
    assert.match(image.style.backgroundImage, /_crates_150\.vsvg/);
    assert.equal(e.Q.core.FeatureRegistry.isEnabled("ql_minimap_loot"), false);
    e.configure({ MINIMAP_LOOT_MARKER_SCALE: 75, MINIMAP_LOOT_OPACITY: 1 });
    assert.ok(crates.FindChild("minimap_markers").GetChild(0) === image);
    assert.match(image.style.backgroundImage, /_crates_75\.vsvg/);
    assert.equal(crates.style.opacity, "1");
    e.clean();
});

for (const stateClass of ["gamemode_streetbrawl", "connectedToHideout"]) {
    test(`static references and ordinary crates hide in ${stateClass} and recover on match return`, () => {
        const e = fixture();
        e.configure({ ENABLE_MINIMAP_HEALING_SNACKS: 1, ENABLE_MINIMAP_CRATE_OVERLAY: 1 });
        const layer = e.renderer.FindChild("QOLMinimapLootRoot"); assert.equal(layer.visible, true);
        const crates = e.renderer.FindChild("minimap_overlay_root"); assert.equal(crates.style.visibility, "visible");
        e.root.AddClass(stateClass); e.clock.advance(1200);
        assert.equal(layer.visible, false); assert.equal(crates.style.visibility, "collapse");
        e.root.RemoveClass(stateClass); e.clock.advance(1200);
        assert.equal(layer.visible, true); assert.equal(crates.style.visibility, "visible");
        e.clean();
    });
}

test("late native sources, living replacements, reparented children and re-enable retain one owned loot tree", () => {
    const e = fixture();
    e.renderer.SetParent(e.add(e.root, "OldMap"));
    e.configure({ ENABLE_MINIMAP_HEALING_SNACKS: 1 });
    assert.ok(!e.renderer.FindChild("QOLMinimapLootRoot"), "retired renderer must not keep a loot tree");
    const current = e.map(); e.clock.advance(1600);
    const layer = current.FindChild("QOLMinimapLootRoot"); assert.ok(layer);
    const first = layer.FindChild("QOLMapLoot_snacks").GetChild(0);
    first.SetParent(e.root); e.clock.advance(1200);
    assert.equal(first.IsValid(), false);
    assert.equal(current.FindChildTraverse("QOLMapLoot_snacks").GetChildCount(), 1);
    assert.match(current.FindChildTraverse("QOLMapLoot_snacks").GetChild(0).style.backgroundImage, /_snacks\.vsvg/);
    current.SetParent(e.add(e.root, "RetiredMap"));
    const replacement = e.map(); e.clock.advance(1600);
    assert.equal(layer.IsValid(), false);
    assert.ok(replacement.FindChild("QOLMinimapLootRoot"));
    e.Q.core.FeatureRegistry.disable("ql_minimap_loot"); e.clock.advance(1000);
    assert.ok(!replacement.FindChild("QOLMinimapLootRoot"), "disable removes the tree");
    e.Q.core.FeatureRegistry.enable("ql_minimap_loot"); e.clock.advance(1000);
    assert.equal(replacement.Children().filter(panel => panel.id === "QOLMinimapLootRoot").length, 1);
    replacement.RemoveClass("dl_midtown"); e.clock.advance(700);
    assert.equal(replacement.FindChild("QOLMinimapLootRoot").visible, false);
    e.clean();
});

test("map toggles and saved appearance values survive settings, HUD, export and import", () => {
    const e = load(), g = e.global, Q = g.QOL;
    Q.ui.window.setOpen(true); e.clock.advance(500);
    Q.ui.window.setActiveTabAndRefresh("Minimap"); e.clock.advance(300);
    for (const key of ["ENABLE_MINIMAP_TOUGH_CRATES", "ENABLE_MINIMAP_HEALING_SNACKS", "ENABLE_MINIMAP_STATUES",
        "ENABLE_MINIMAP_CRATE_ROUTES"]) {
        assert.ok(e.list.FindChildrenWithClassTraverse("SettingRow_" + key).length, key);
    }
    Object.assign(g.MOD_CONFIG, { MINIMAP_CAMP_NAMES: 2, ENABLE_MINIMAP_HEALING_SNACKS: 1, MINIMAP_ROUTE_SCALE: 137,
        MINIMAP_LOOT_MARKER_SCALE: 119, MINIMAP_LOOT_OPACITY: 0.43 });
    g.SaveAndSync(); e.clock.advance(1200);
    const store = e.hud.sandbox.global.QOL.core.ConfigStore;
    assert.equal(store.get("ql_minimap_loot", "MINIMAP_CAMP_NAMES"), 2);
    const imported = Q.ui.modal.tryApplyImportStringWithDiagnostics(Q.ui.configTab.getCurrentExportSettingsString());
    assert.equal(imported.ok, true);
    for (const key of ["MINIMAP_CAMP_NAMES", "ENABLE_MINIMAP_HEALING_SNACKS", "MINIMAP_ROUTE_SCALE", "MINIMAP_LOOT_MARKER_SCALE", "MINIMAP_LOOT_OPACITY"]) {
        assert.equal(imported.candidateConfig[key], g.MOD_CONFIG[key], key);
    }
    assert.deepEqual(e.doc.eventErrors, []); assert.deepEqual(e.clock.errors, []);
});

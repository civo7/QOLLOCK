"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const load = require("./load_settings_environment");
const startDrag = require("./customize_drag_fixture");
const setup = () => { const env = load(); env.global.QOL.ui.window.setOpen(true); env.clock.advance(500); return env; };
const activate = (env, id) => { const p = env.em.FindChildTraverse(id); assert.ok(p, id); p._fire("onactivate"); };
const add = (env, parent, id, classes = []) => parent.addChild(env.doc.create("Panel", { id, classes }));
const rect = (panel, width, height, x = 0, y = 0) => Object.assign(panel, {
    actuallayoutwidth: width, actuallayoutheight: height, actualxoffset: x, actualyoffset: y
});
const clean = env => { assert.deepEqual(env.doc.eventErrors, []); assert.deepEqual(env.clock.errors, []); };

test("captured coexisting stats owners select and move the visible modern compact block", () => {
    const env = setup();
    // The native October capture has both owners. Its legacy HudStatBlock is
    // collapsed by CSS; its active owner has the visible compact HudStatBlock.
    const capture = JSON.parse(fs.readFileSync(path.join(__dirname, "../captures/deadlock_hud_dump.json"), "utf8"));
    const find = (node, id) => node.id === id ? node : (node.children || []).map(child => find(child, id)).find(Boolean);
    for (const id of ["hudPlayerStats", "hudActivePlayerStats"]) {
        assert.ok(find(find(capture.domTree, id), "HudStatBlock"), "captured owner: " + id);
    }
    const core = add(env, env.hud.root, "", ["HudCore"]);
    const left = add(env, add(env, core, "StatsAndModsContainer"), "LowerLeft");
    const legacy = add(env, left, "hudPlayerStats");
    const collapsed = add(env, legacy, "HudStatBlock"); collapsed.style.visibility = "collapse";
    const active = rect(add(env, core, "hudActivePlayerStats"), 1920, 1080);
    const block = rect(add(env, active, "HudStatBlock"), 270, 80, 20, 720);
    const list = rect(add(env, active, "StatList"), 1920, 1080);
    rect(add(env, list, "", ["miniModifier"]), 1920, 1080);
    env.global.QOL.ui.customize.start();
    const frame = env.em.FindChildTraverse("QOLCustomizeFrame_playerStats");
    assert.equal(frame.visible, true);
    assert.equal(frame.style.width, "270px"); assert.equal(frame.style.height, "80px");
    activate(env, "QOLCustomizeFrame_playerStats");
    assert.ok(env.em.FindChildTraverse("QOLCustomize_STATS_POSITION_X_OFFSET"));
    const proxy = startDrag(env, frame);
    proxy.actualxoffset += 700; proxy.actualyoffset -= 650;
    env.global.$.DispatchEvent("DragEnd", frame, frame); env.clock.advance(1200);
    assert.equal(active.style.x, "700px"); assert.equal(active.style.y, "-650px");
    assert.equal(legacy.style.x, undefined);
    assert.equal(block.GetParent(), active);
    activate(env, "QOLCustomizeCancel"); env.clock.advance(1200);
    assert.equal(active.style.x, undefined); clean(env);
});

test("stamina is hoverable before catalog selection and never measures other ability charges", () => {
    const env = setup();
    const core = add(env, env.hud.root, "", ["HudCore"]);
    const gameplay = add(env, core, "gameplay_hud");
    const crosshair = add(env, add(env, gameplay, "gameplay_hud_alive"), "crosshair");
    const charges = add(env, add(env, crosshair, "dash", ["ability_element_charges", "active"]), "charges_container");
    rect(add(env, add(env, charges, "", ["charge", "has_charge"]), "progress", ["charge_fg"]), 125, 125, 850, 480);
    rect(add(env, add(env, core, "ActiveAbilitiesMenu"), "charges_container"), 600, 600);
    env.global.QOL.ui.customize.start();
    const frame = env.em.FindChildTraverse("QOLCustomizeFrame_stamina");
    assert.equal(frame.visible, true);
    assert.equal(frame.style.width, "125px");
    activate(env, "QOLCustomizeFrame_stamina");
    assert.ok(env.em.FindChildTraverse("QOLCustomize_STAMINA_CHARGE_ANGLE"));
    activate(env, "QOLCustomizeCancel"); clean(env);
});

test("settings-only owners cannot cover healthbar, top bar or left-side HUD with drag frames", () => {
    const env = setup();
    const core = add(env, env.hud.root, "", ["HudCore"]);
    const gameplay = add(env, core, "gameplay_hud");
    rect(add(env, gameplay, "health_and_abilities_container"), 300, 450, 315, 605);
    const left = add(env, add(env, core, "StatsAndModsContainer"), "LowerLeft");
    rect(add(env, left, "CitadelHudQuickbuy"), 365, 1080);
    rect(add(env, core, "TopBar"), 1920, 1080);
    env.global.QOL.ui.customize.start();
    for (const id of ["healthWarnings", "quickbuy", "objectives", "nicknames", "ranks", "ultimates", "topBarWarnings", "urn", "buffTimers", "abilities"]) {
        const frame = env.em.FindChildTraverse("QOLCustomizeFrame_" + id);
        assert.equal(frame.visible, false, id + " must not intercept input");
        assert.equal(frame.draggable, false, id + " has no native drag capability");
        const event = {}; env.global.$.DispatchEvent("DragStart", frame, event);
        assert.equal(event.displayPanel, undefined);
    }
    assert.equal(env.em.FindChildTraverse("QOLCustomizeFrame_healthbar").visible, true);
    activate(env, "QOLCustomizeSelect_healthWarnings");
    assert.ok(env.em.FindChildTraverse("QOLCustomize_ENABLE_COLOR_WARNING_25"), "controls remain available from the list");
    activate(env, "QOLCustomizeCancel"); clean(env);
});

test("minimap and shop corners edit existing size/scale fields without moving their native owners", () => {
    for (const mode of ["base", "alt", "tab", "shop"]) {
        const env = setup();
        const core = add(env, env.hud.root, "", ["HudCore"]);
        const gameplay = add(env, core, "gameplay_hud");
        let target, id, key, feature;
        if (mode === "shop") {
            target = rect(add(env, add(env, add(env, core, "CitadelHudHeroShop"), "Shop"), "MainPanel"), 400, 400);
            id = "shop"; key = "SHOP_SCALE"; feature = "ql_heroshop";
        } else {
            const host = add(env, add(env, gameplay, "", ["clamp_width"]), "minimap_persp");
            rect(add(env, host, "minimap_container"), 400, 400);
            if (mode !== "base") {
                env.global.MOD_CONFIG["ENABLE_" + mode.toUpperCase() + "_ZOOM"] = 1;
                host.AddClass(mode === "alt" ? "gDetailView" : "gScoreboardOpen");
            }
            target = host; id = mode === "base" ? "minimap" : "minimap" + (mode === "alt" ? "Alt" : "Tab");
            key = mode === "base" ? "MINIMAP_SMALL_SIZE" : "MINIMAP_LARGE_SIZE_" + mode.toUpperCase();
            feature = "ql_minimap_runtime";
        }
        const parent = target.GetParent(), initial = env.global.MOD_CONFIG[key];
        env.global.QOL.ui.customize.start(); activate(env, "QOLCustomizeSelect_" + id);
        const handle = env.em.FindChildTraverse("QOLCustomizeResize_" + id);
        assert.equal(handle.visible, true, mode);
        const frame = handle.GetParent();
        const proxy = startDrag(env, handle);
        proxy.actualxoffset += 80; proxy.actualyoffset += 80;
        env.global.$.DispatchEvent("DragEnd", handle, proxy); env.clock.advance(1200);
        const catalog = env.global.QOL.presentation;
        assert.equal(env.hud.sandbox.global.QOL.core.ConfigStore.get(feature, key), catalog.normalize(key, initial * 1.2), mode);
        assert.equal(target.GetParent(), parent);
        assert.equal(handle.GetParent(), frame);
        assert.equal(proxy.IsValid(), false);
        activate(env, "QOLCustomizeCancel"); clean(env);
    }
});

test("layout ratio supplies coordinate density when native actualuiscale properties are absent", () => {
    const env = setup();
    const g = env.global.QOL.ui.customizeGeometry;
    const host = rect(add(env, env.em, "DensityHost"), 400, 300);
    host.desiredlayoutwidth = 200; host.desiredlayoutheight = 100;
    host.actualuiscale_x = undefined; host.actualuiscale_y = undefined;
    const child = rect(add(env, host, "DensityChild"), 160, 90, 40, 60);
    const box = g.box(child, host);
    assert.equal(box.x, 20); assert.equal(box.y, 20);
    assert.equal(box.width, 80); assert.equal(box.height, 30);
    const element = env.global.QOL.presentation.elements.find(item => item.id === "souls");
    assert.deepEqual(Object.fromEntries(Object.entries(g.dragValues(element, child, env.global.MOD_CONFIG, { x: 40, y: 60 }))), {
        SOULS_X_OFFSET: 20, SOULS_Y_OFFSET: -20
    });
});

test("AP infinity has its own selectable surface and previews the existing shared currency color", () => {
    const env = setup();
    const core = add(env, env.hud.root, "", ["HudCore"]);
    const abilities = add(env, core, "AbilitiesContainer");
    const ap = rect(add(env, abilities, "APContainer"), 54, 24, 940, 1050);
    const icon = add(env, add(env, ap, "", ["APValues"]), "hudAPInfinite");
    env.global.QOL.ui.customize.start();
    const frame = env.em.FindChildTraverse("QOLCustomizeFrame_abilityPoints");
    assert.equal(frame.visible, true);
    assert.equal(frame.style.width, "54px");
    activate(env, "QOLCustomizeFrame_abilityPoints");
    activate(env, "QOLCustomizeColor_BOTTOM_BAR_WASH_COLOR_13"); env.clock.advance(1200);
    assert.equal(icon.style.washColor, env.global.QOL_UTILS.ResolveWashColorFromPalette(13));
    assert.equal(ap.style.x, undefined, "selecting AP must not apply the signature bar's offsets");
    activate(env, "QOLCustomizeCancel"); env.clock.advance(1200);
    assert.equal(icon.style.washColor, "", "main restores the native currency color with an empty wash");
    clean(env);
});

test("clicking the canvas or native background during customization preserves the editor and its draft", () => {
    const env = load();
    const background = add(env, env.em, "EscapeBackground");
    env.clock.advance(500); env.global.QOL.ui.window.setOpen(true); env.clock.advance(500);
    env.global.QOL.ui.customize.start();
    const overlay = env.em.FindChildTraverse("QOLCustomizeEditor");
    assert.equal(overlay.hittest, true);
    const input = env.em.FindChildTraverse("QOLCustomize_SOULS_X_OFFSET"); input.text = "150"; input._fire("oninputsubmit");
    overlay._fire("onactivate"); background._fire("onactivate");
    assert.equal(env.global.QOL.ui.customize.isRunning(), true);
    assert.equal(input.text, "150");
    activate(env, "QOLCustomizeCancel");
    background._fire("onactivate");
    assert.equal(env.global.QOL.ui.window.isOpen(), false, "ordinary settings keep their background-close behavior"); clean(env);
});

test("palette choices, typed HEX on blur, undo and default all edit the same draft", () => {
    const env = setup(); env.global.QOL.ui.customize.start(); activate(env, "QOLCustomizeSelect_ammo");
    const palette = env.em.FindChildTraverse("QOLCustomizePalette_AMMO_TEXT_COLOR");
    assert.equal(palette.Children().length, 29);
    activate(env, "QOLCustomizeColor_AMMO_TEXT_COLOR_13"); env.clock.advance(500);
    const store = env.hud.sandbox.global.QOL.core.ConfigStore;
    assert.equal(store.get("ql_ammo", "AMMO_TEXT_COLOR"), 13);
    const input = env.em.FindChildTraverse("QOLCustomize_AMMO_TEXT_COLOR");
    input.text = "#123ABC"; input._fire("onblur"); env.clock.advance(500);
    assert.equal(env.global.QOL_UTILS.DecodeHexColor(store.get("ql_ammo", "AMMO_TEXT_COLOR")), "#123ABC");
    activate(env, "QOLCustomizeUndo"); env.clock.advance(500);
    assert.equal(store.get("ql_ammo", "AMMO_TEXT_COLOR"), 13);
    activate(env, "QOLCustomizeDefault_AMMO_TEXT_COLOR"); env.clock.advance(500);
    assert.equal(store.get("ql_ammo", "AMMO_TEXT_COLOR"), 0);
    assert.equal(env.global.MOD_CONFIG.AMMO_TEXT_COLOR, 0);
    activate(env, "QOLCustomizeCancel"); clean(env);
});

test("ammo moves beyond its old box, resets its native baseline and round-trips screen-wide offsets", () => {
    const env = setup(); const { global: g } = env;
    const core = add(env, env.hud.root, "", ["HudCore"]);
    const gameplay = add(env, core, "gameplay_hud");
    const crosshair = add(env, add(env, gameplay, "gameplay_hud_alive"), "crosshair");
    const ammo = rect(add(env, add(env, add(env, crosshair, "gun"), "gun_data"), "ammo_panel"), 85, 20);
    g.QOL.ui.customize.start(); activate(env, "QOLCustomizeSelect_ammo");
    const frame = env.em.FindChildTraverse("QOLCustomizeFrame_ammo");
    const proxy = startDrag(env, frame); proxy.actualxoffset -= 900; proxy.actualyoffset += 350;
    g.$.DispatchEvent("DragEnd", frame, frame); env.clock.advance(1200);
    assert.equal(ammo.style.x, "-900px"); assert.equal(ammo.style.y, "430px");
    g.QOL.core.storageBridge.saveSettings = (_config, callback) => callback(null);
    activate(env, "QOLCustomizeApply"); env.clock.advance(500);
    const parsed = g.QOL.ui.modal.tryApplyImportStringWithDiagnostics(g.QOL.ui.configTab.getCurrentExportSettingsString());
    assert.equal(parsed.ok, true); assert.equal(parsed.candidateConfig.AMMO_PANEL_X_OFFSET, -900);
    assert.equal(parsed.candidateConfig.AMMO_PANEL_Y_OFFSET, -350);
    const historic = g.QOL_COMPACT_SCHEMA_REGISTRY["4.0.5"].schema.find(field => field.key === "AMMO_PANEL_X_OFFSET");
    assert.equal(historic.min, -200); assert.equal(historic.max, 200);
    g.QOL.ui.customize.start(); activate(env, "QOLCustomizeSelect_ammo"); activate(env, "QOLCustomizeReset"); env.clock.advance(1200);
    assert.equal(ammo.style.x, "0px"); assert.equal(ammo.style.y, "80px");
    activate(env, "QOLCustomizeCancel"); clean(env);
});

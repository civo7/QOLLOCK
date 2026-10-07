"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const load = require("./load_settings_environment");

const setup = () => { const env = load(); env.global.QOL.ui.window.setOpen(true); env.clock.advance(500); return env; };
const activate = (env, id) => { const p = env.em.FindChildTraverse(id); assert.ok(p, id); p._fire("onactivate"); };
const input = (env, key, value) => { const p = env.em.FindChildTraverse("QOLCustomize_" + key); assert.ok(p, key); p.text = String(value); p._fire("oninputsubmit"); return p; };
const add = (env, parent, id, classes = []) => parent.addChild(env.doc.create("Panel", { id, classes }));

test("catalog covers current visual manifest controls, with explicit compatibility and diagnostic exclusions", () => {
    const env = setup();
    const catalog = env.global.QOL.presentation;
    const hudCatalog = env.hud.sandbox.global.QOL.presentation;
    assert.deepEqual([...catalog.fieldMap.keys()], [...hudCatalog.fieldMap.keys()]);
    const registry = env.hud.sandbox.global.QOL.core.FeatureRegistry;
    const excludedOwners = new Set(["ql_lane_with_party", "ql_mouse_cursor", "ql_chat_translate", "ql_unspent", "ql_spm", "ql_sigflash", "ql_legacy_audio_passive"]);
    const excludedKeys = new Set([
        // These masters are derived by the existing threshold normalizers.
        "ENABLE_COLORED_HEALTHBAR", "ENABLE_ENEMY_COLORED_HEALTHBAR", "ENABLE_ALLY_COLORED_HEALTHBAR",
        // Split Alt/Tab fields own current map sizing; this is a legacy alias.
        "MINIMAP_LARGE_SIZE", "ENABLE_PERF_DEBUG", "ENABLE_PERF_DEBUG_DETAIL"
    ]);
    for (const id of registry.getRegisteredIds()) {
        if (excludedOwners.has(id)) continue;
        for (const setting of registry.getManifest(id).settings || []) {
            if (!catalog.wireFields.has(setting.key) || setting.type === "multitoggle" || excludedKeys.has(setting.key)) continue;
            assert.ok(catalog.fieldMap.has(setting.key), `${id}: missing visual setting ${setting.key}`);
        }
    }
    assert.ok(catalog.elements.some(item => item.id === "profileScreens" && item.context && !item.fields.length));
    assert.ok(catalog.elements.some(item => item.id === "mainMenu" && item.context && !item.fields.length));
    for (const element of catalog.elements) {
        env.global.QOL.ui.customize.start(null, { elementId: element.id });
        for (const field of element.fields) {
            assert.ok(field.key in env.global.QOL_DEFAULT_CONFIG);
            assert.notEqual(catalog.normalize(field.key, env.global.QOL_DEFAULT_CONFIG[field.key]), null);
            if (field.hidden) continue;
            const suffix = field.type === "enum" ? "_" + field.options[0][0] : "";
            assert.ok(env.em.FindChildTraverse("QOLCustomize_" + field.key + suffix), `missing inspector for ${field.key}`);
        }
        activate(env, "QOLCustomizeCancel");
        env.clock.advance(500);
    }
    assert.deepEqual(env.doc.eventErrors, []);
    assert.deepEqual(env.clock.errors, []);
});

test("search retains absent conditional features and matches localized field names", () => {
    const env = setup();
    env.global.MOD_CONFIG.LANGUAGE = env.global.QOL.ui.theme.SETTINGS_LANGUAGE_RUSSIAN;
    env.global.QOL.ui.customize.start();
    activate(env, "QOLCustomizeAllElements");
    const search = env.em.FindChildTraverse("QOLCustomizeSearch");
    search.text = "fire rate";
    search._fire("ontextentrychange");
    assert.equal(env.em.FindChildTraverse("QOLCustomizeSelect_activeStats").visible, true);
    assert.equal(env.em.FindChildTraverse("QOLCustomizeSelect_shop").visible, false);
    search.text = "компас";
    search._fire("ontextentrychange");
    assert.equal(env.em.FindChildTraverse("QOLCustomizeSelect_compass").visible, true);
    activate(env, "QOLCustomizeSelect_compass");
    assert.ok(env.em.FindChildTraverse("QOLCustomize_COMPASS_X_OFFSET"));
    activate(env, "QOLCustomizeCancel");
});

test("legacy root styles, threshold aliases and target-shape runtime receive drafts and restore on cancel", () => {
    const env = setup();
    const { global: g, hud, clock } = env;
    const core = add(env, hud.root, "", ["HudCore"]);
    const chat = add(env, core, "Chat");
    const report = add(env, core, "CitadelHudDamageReport");
    const shape = add(env, core, "", ["target_shape"]);
    const session = g.QOL.ui.customizeSession.create(g.QOL.core.persistence.getUIRoot(), hud.root, env.em.FindChildTraverse("SettingsWindow"));
    hud.root.AddClass("QOLCustomizeActive");
    session.edit({ CHAT_X_OFFSET: 175, CHAT_Y_OFFSET: 80, DAMAGE_REPORT_X_OFFSET: 125,
        ENABLE_COLOR_WARNING_25: 1, ENABLE_RED_DIAMOND: 1, UNIT_TARGET_OPACITY: 0.4 });
    clock.advance(2000);
    assert.equal(chat.style.x, "175px"); assert.equal(chat.style.y, "-80px");
    assert.equal(report.style.x, "125px");
    assert.equal(Number(shape.style.opacity), 0.4);
    assert.equal(hud.root.BHasClass("red_diamond_active"), true);
    assert.equal(hud.sandbox.global.QOL.core.ConfigStore.get("ql_color_warnings", "ENABLE_COLORED_HEALTHBAR"), true);
    assert.equal(g.MOD_CONFIG.ENABLE_COLOR_WARNING_25, 0);
    assert.equal(hud.sandbox.global.State.lastConfig.CHAT_X_OFFSET, 0);
    for (let tick = 0; tick < 3; tick++) { session.publish(); clock.advance(800); } // Keep the editor lease alive across periodic class synchronization.
    assert.equal(hud.root.BHasClass("red_diamond_active"), true);
    session.close(); hud.root.RemoveClass("QOLCustomizeActive"); clock.advance(2000);
    assert.equal(chat.style.x, "0px"); assert.equal(report.style.x, "0px");
    assert.equal(Number(shape.style.opacity), 1);
    assert.equal(hud.root.BHasClass("red_diamond_active"), false);
    assert.deepEqual(env.clock.errors, []);
});

test("breadcrumb fallback cannot select an unrelated generic MainPanel", () => {
    const env = setup();
    const core = add(env, env.hud.root, "", ["HudCore"]);
    const decoy = add(env, add(env, core, "UnrelatedScreen"), "MainPanel");
    const catalog = env.global.QOL.presentation;
    const shop = catalog.elements.find(item => item.id === "shop");
    assert.equal(catalog.resolve(shop, env.hud.root, env.global.MOD_CONFIG), null);
    const owner = add(env, core, "CitadelHudHeroShop");
    const native = add(env, add(env, owner, "Shop"), "MainPanel");
    assert.equal(catalog.resolve(shop, env.hud.root, env.global.MOD_CONFIG), native);
    assert.notEqual(native, decoy);
});

test("native empty opacity remains visible; collapsed ancestors suppress frames", () => {
    const env = setup();
    const parent = add(env, env.hud.root, "Owner");
    const child = add(env, parent, "Child");
    parent.style.opacity = ""; child.style.opacity = "";
    const geometry = env.global.QOL.ui.customizeGeometry;
    assert.equal(geometry.isShown(child), true);
    parent.style.visibility = "collapse";
    assert.equal(geometry.isShown(child), false);
    parent.style.visibility = "visible"; child.style.opacity = "0";
    assert.equal(geometry.isShown(child), false);
});

test("down-positive unsecured geometry and percentage cooldown units retain their own contracts", () => {
    const env = setup();
    const catalog = env.global.QOL.presentation;
    const better = catalog.elements.find(item => item.id === "unsecuredSouls");
    const panel = add(env, env.hud.root, "Target");
    const cfg = env.global.MOD_CONFIG;
    const values = env.global.QOL.ui.customizeGeometry.dragValues(better, panel, cfg, { x: 20, y: 30 });
    assert.equal(values.UNSECURED_SOULS_HUD_X_OFFSET, cfg.UNSECURED_SOULS_HUD_X_OFFSET + 20);
    assert.equal(values.UNSECURED_SOULS_HUD_Y_OFFSET, cfg.UNSECURED_SOULS_HUD_Y_OFFSET + 30);
    const cooldowns = catalog.elements.find(item => item.id === "cooldowns");
    assert.equal(catalog.canDrag(cooldowns), true);
    env.global.QOL.ui.customize.start(); activate(env, "QOLCustomizeSelect_cooldowns");
    input(env, "PASSIVE_COOLDOWN_X", 15); input(env, "PASSIVE_COOLDOWN_Y", -10);
    env.clock.advance(1000);
    const store = env.hud.sandbox.global.QOL.core.ConfigStore;
    assert.equal(store.get("ql_passive_cooldown", "PASSIVE_COOLDOWN_X"), 15);
    assert.equal(store.get("ql_item_mirror", "PASSIVE_COOLDOWN_Y"), -10);
    activate(env, "QOLCustomizeCancel");
});

test("minimap frames use the moving host and current mode, including Alt priority", () => {
    const env = setup();
    const core = add(env, env.hud.root, "", ["HudCore"]);
    const gameplay = add(env, core, "gameplay_hud");
    const clamp = add(env, gameplay, "", ["clamp_width"]);
    const host = add(env, clamp, "minimap_persp");
    const container = add(env, host, "minimap_container");
    Object.assign(container, { actuallayoutwidth: 400, actuallayoutheight: 400 });
    env.global.QOL.ui.customize.start();
    activate(env, "QOLCustomizeSelect_minimapAlt"); activate(env, "QOLCustomize_ENABLE_ALT_ZOOM");
    activate(env, "QOLCustomizeSelect_minimapTab"); activate(env, "QOLCustomize_ENABLE_TAB_ZOOM");
    host.AddClass("gDetailView"); host.AddClass("gScoreboardOpen"); env.clock.advance(300);
    assert.equal(env.em.FindChildTraverse("QOLCustomizeFrame_minimapAlt").visible, true);
    assert.equal(env.em.FindChildTraverse("QOLCustomizeFrame_minimapTab").visible, false);
    const catalog = env.global.QOL.presentation;
    assert.equal(catalog.resolve(catalog.elements.find(item => item.id === "minimapAlt"), env.hud.root, env.global.MOD_CONFIG), host);
    activate(env, "QOLCustomizeCancel");
});

test("ammo scale alias previews the same canonical scale that Apply saves", () => {
    const env = setup();
    const session = env.global.QOL.ui.customizeSession.create(env.global.QOL.core.persistence.getUIRoot(), env.hud.root, env.em.FindChildTraverse("SettingsWindow"));
    env.hud.root.AddClass("QOLCustomizeActive");
    session.edit({ AMMO_PANEL_SCALE: 180 }); env.clock.advance(800);
    const store = env.hud.sandbox.global.QOL.core.ConfigStore;
    assert.equal(store.get("ql_ammo", "AMMO_CURRENT_SCALE"), 180);
    assert.equal(store.get("ql_ammo", "AMMO_PANEL_SCALE"), 180);
    session.close();
    env.hud.root.RemoveClass("QOLCustomizeActive");
});

test("the whole catalog draft reaches registered HUD buckets and closing restores their canonical values", () => {
    const env = setup();
    const { global: g, hud, clock } = env;
    const catalog = g.QOL.presentation;
    // The HUD fixture boots with its own config; publish the settings baseline
    // through the production bridge before comparing restoration across isolates.
    g.SaveAndSync(); clock.advance(400);
    const baseline = { ...g.MOD_CONFIG };
    const configRoot = g.QOL.core.persistence.getUIRoot();
    const session = g.QOL.ui.customizeSession.create(configRoot, hud.root, env.em.FindChildTraverse("SettingsWindow"));
    const patch = {};
    for (const [key, field] of catalog.fieldMap) {
        const wire = catalog.wireFields.get(key);
        patch[key] = field.type === "color" || field.type === "palette" ? g.QOL_UTILS.EncodeHexColor("#124578")
            : Number(baseline[key]) === wire.max ? wire.min : wire.max;
    }
    hud.root.AddClass("QOLCustomizeActive");
    assert.equal(session.edit(patch), true);
    const expected = g.QOL.mergeConfig({ ...baseline, ...session.snapshot() });
    clock.advance(400);
    const registry = hud.sandbox.global.QOL.core.FeatureRegistry;
    const store = hud.sandbox.global.QOL.core.ConfigStore;
    const checkBuckets = config => {
        for (const id of registry.getRegisteredIds()) {
            for (const [key, value] of Object.entries(store.all(id))) {
                if (catalog.fieldMap.has(key)) assert.equal(Number(value), Number(config[key]), `${id}/${key}`);
            }
        }
    };
    checkBuckets(expected);
    const minimums = {};
    for (const [key, field] of catalog.fieldMap) minimums[key] = field.type === "color" || field.type === "palette" ? 0 : catalog.wireFields.get(key).min;
    minimums.HUD_INDICATOR_SIZE = 1; // Numeric HUD_ prefix must survive 0/1 coercion.
    assert.equal(session.edit(minimums), true);
    clock.advance(400);
    checkBuckets(g.QOL.mergeConfig({ ...baseline, ...session.snapshot() }));
    assert.equal(JSON.stringify(g.MOD_CONFIG), JSON.stringify(baseline));
    session.close(); hud.root.RemoveClass("QOLCustomizeActive"); clock.advance(400);
    checkBuckets(g.QOL.mergeConfig(baseline));
    assert.deepEqual(env.doc.eventErrors, []);
    assert.deepEqual(clock.errors, []);
});

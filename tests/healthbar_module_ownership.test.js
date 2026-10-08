"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createHud } = require("../scripts/simulator");

// Verified paths from hud.xml / hud_health_container.xml. These tests exercise
// source and lifecycle ownership, not Panorama composition or match timing.
function fixture() {
    const env = createHud({ inHideout: false });
    env.assertLoaded();
    const q = env.sandbox.global.QOL;
    q.core.App.shutdown();
    const add = (parent, id, classes = [], type = "Panel") => {
        const panel = env.doc.create(type, { id, classes });
        parent.addChild(panel);
        return panel;
    };
    const core = add(env.root, "", ["HudCore"]);
    const gameplay = add(core, "gameplay_hud");
    const other = add(env.root, "RetainedOldHud");
    function healthTree(parent = gameplay, hp = "500", maximum = "1000") {
        const health = add(parent, "health_and_abilities_container");
        Object.assign(health, { actuallayoutwidth: 300, actuallayoutheight: 456, actualuiscale_x: 1.2, actualuiscale_y: 1.2 });
        const canvas = add(health, "QOLHealthbarGeometry");
        const content = add(canvas, "HealthBarContent");
        const bars = add(content, "hud_health_bars");
        const border = add(bars, "", ["health_bar_border"]);
        const frame = add(border, "health_bar_frame");
        const shields = add(content, "HudShieldsContainer");
        const numbers = add(canvas, "HealthRegenAndTotal");
        const group = add(numbers, "", ["healthContainer"]);
        const backer = add(group, "", ["healthBacker"]);
        const current = add(group, "", ["currentHealthLabel"], "Label"); current.text = hp;
        const total = add(group, "", ["totalHealthLabel"], "Label"); total.text = "/ " + maximum;
        const bullet = add(numbers, "BulletShieldNumbers");
        const bulletCurrent = add(bullet, "", ["progress_bar_current"], "Label"); bulletCurrent.text = "250";
        const bulletMax = add(bullet, "", ["progress_bar_max"], "Label"); bulletMax.text = "/ 500";
        const heartsRoot = add(canvas, "MinecraftHeartsRoot");
        const shieldBox = add(heartsRoot, "MinecraftShieldHeartsContainer");
        const shieldHearts = add(shieldBox, "MinecraftShieldHearts");
        const heartBox = add(heartsRoot, "MinecraftHeartsContainer");
        const hearts = add(heartBox, "MinecraftHearts");
        const mcPercent = add(heartBox, "MinecraftHealthPercent", [], "Label");
        const food = add(heartBox, "MinecraftFoodContainer");
        for (let i = 0; i < 10; i++) add(food, "", ["FoodIcon"], "Image");
        const xp = add(heartsRoot, "MinecraftXPBarFill");
        const level = add(heartsRoot, "MinecraftXPLevelLabel", [], "Label");
        const totem = add(heartsRoot, "MinecraftTotemContainer");
        const progress = id => {
            const panel = add(bars, id);
            panel.actuallayoutheight = 400;
            const middle = add(panel, "", ["ProgressBarMiddle"]);
            middle.actuallayoutheight = 0;
            return middle;
        };
        const heal = progress("pending_incoming_heal"), damage = progress("pending_incoming_damage");
        return { health, canvas, numbers, group, current, total, frame, backer, bars, heartsRoot,
            hearts, food, shields, bulletCurrent, bulletMax, shieldBox, shieldHearts, xp, level, totem, mcPercent, heal, damage };
    }
    const tree = healthTree();
    return { ...env, q, add, tree, healthTree, gameplay, other };
}
function start(env, cfg) {
    const f = env.q.core.FeatureRegistry.getManifest("ql_healthbar").create({
        id: "ql_healthbar", config: { view: () => cfg }
    });
    f.onEnable();
    return f;
}
function fills(tree, className) { return tree.hearts.FindChildrenWithClassTraverse(className); }

test("healthbar factories have no panel, style, callback or shared-state side effects", () => {
    const env = fixture();
    const before = env.clock.pendingCount();
    const keys = Object.keys(env.q.state);
    const original = env.tree.current.style.color = "native-color";
    const instance = env.q.core.FeatureRegistry.getManifest("ql_healthbar").create({
        id: "ql_healthbar", config: { view: () => ({ HEALTHBAR_TYPE: 5 }) }
    });
    assert.equal(env.clock.pendingCount(), before);
    assert.equal(env.tree.hearts.GetChildCount(), 0);
    assert.equal(env.tree.current.style.color, original);
    assert.deepEqual(Object.keys(env.q.state), keys);
    instance.onDisable();
});

test("shared healthbar presentation retries partial writes and releases only its native properties", () => {
    const env = fixture(), { health, canvas } = env.tree;
    const cfg = { HEALTHBAR_TYPE: 0, PLAYER_HEALTHBAR_SCALE: 150, PLAYER_HEALTHBAR_OPACITY: 0.62,
        PLAYER_HEALTHBAR_X_OFFSET: 80, PLAYER_HEALTHBAR_Y_OFFSET: 30 };
    health.style.transform = "native-tilt";
    health.style.preTransformScale2d = "native-animation";
    let fail = true;
    canvas.style = new Proxy(canvas.style, { set(target, key, value) {
        if (key === "height" && fail) { fail = false; throw new Error("temporary native style rejection"); }
        target[key] = value; return true;
    } });
    const f = start(env, cfg);
    assert.equal(canvas.style.height, undefined);
    env.clock.advance(700);
    assert.equal(canvas.style.height, "380px");
    assert.equal(canvas.style.uiScale, "150%");
    cfg.PLAYER_HEALTHBAR_SCALE = 100; cfg.PLAYER_HEALTHBAR_OPACITY = 1;
    cfg.PLAYER_HEALTHBAR_X_OFFSET = 0; cfg.PLAYER_HEALTHBAR_Y_OFFSET = 0;
    f.onSettingsChanged();
    for (const key of ["x", "y", "opacity", "uiScale"]) assert.equal(health.style[key], undefined);
    for (const key of ["width", "height", "uiScale"]) assert.equal(canvas.style[key], undefined);
    assert.equal(health.style.transform, "native-tilt");
    assert.equal(health.style.preTransformScale2d, "native-animation");
    f.onDisable();
    assert.deepEqual(env.clock.errors, []);
});

test("healthbar rebinding restores a still-living former native owner and reapplies unchanged accent", () => {
    const env = fixture(), old = env.tree;
    const cfg = { HEALTHBAR_TYPE: 1, PLAYER_HEALTHBAR_SCALE: 150, PLAYER_HEALTHBAR_X_OFFSET: 80,
        PLAYER_HEALTHBAR_ACCENT_COLOR: 2 };
    const f = start(env, cfg); env.clock.advance(20);
    assert.ok(old.frame.style.washColor);
    old.health.SetParent(env.other);
    const replacement = env.healthTree();
    env.clock.advance(700);
    assert.equal(old.health.style.x, undefined);
    assert.equal(old.canvas.style.uiScale, undefined);
    assert.equal(old.frame.style.washColor, undefined);
    assert.equal(replacement.health.style.x, "80px");
    assert.equal(replacement.canvas.style.uiScale, "150%");
    assert.ok(replacement.frame.style.washColor);
    f.onDisable(); env.clock.advance(30);
    assert.equal(replacement.frame.style.washColor, undefined);
});

test("accent retries rejected writes and disable cancels its delayed generation", () => {
    const env = fixture(), { frame } = env.tree;
    let failed = false;
    frame.style = new Proxy(frame.style, { set(target, key, value) {
        if (key === "washColor" && !failed) { failed = true; throw new Error("transient wash rejection"); }
        target[key] = value; return true;
    } });
    const f = start(env, { PLAYER_HEALTHBAR_ACCENT_COLOR: 3 });
    env.clock.advance(20);
    assert.equal(frame.style.washColor, undefined);
    env.clock.advance(700);
    assert.ok(frame.style.washColor);
    f.onDisable();
    env.q.healthbar.accent.update(env.root, { PLAYER_HEALTHBAR_ACCENT_COLOR: 4 }, env.tree.health);
    env.q.healthbar.accent.release();
    env.clock.advance(20);
    assert.equal(frame.style.washColor, undefined);
});

test("retained Minimalist preset offsets and shared warning keys reach the actual dispatcher slice", () => {
    const env = fixture(), { q, tree } = env;
    q.core.ConfigAdapter.loadFromFlat({
        HEALTHBAR_TYPE: 1, PLAYER_HEALTHBAR_X_OFFSET: 10, PLAYER_HEALTHBAR_Y_OFFSET: 20,
        MINIMALIST_HEALTHBAR_X_OFFSET: 30, MINIMALIST_HEALTHBAR_Y_OFFSET: 40
    });
    q.core.FeatureRegistry.boot();
    assert.equal(tree.health.style.x, "40px");
    assert.equal(tree.health.style.y, "-60px");
    q.core.ConfigAdapter.loadFromFlat({ HEALTHBAR_TYPE: 4, ENABLE_COLOR_WARNING_65: 1 });
    env.clock.advance(200);
    assert.equal(tree.group.FindChild("HealthPercentLabel").text, "50%");
    assert.equal(tree.current.style.color, "rgb(255, 177, 0)");
    q.core.ConfigAdapter.loadFromFlat({ ENABLE_COLOR_WARNING_65: 0, ENABLE_COLORED_HEALTHBAR: 0 });
    env.clock.advance(200);
    assert.equal(tree.current.style.color, undefined);
    q.core.FeatureRegistry.disable("ql_healthbar");
    env.clock.advance(1);
    assert.equal(tree.group.FindChild("HealthPercentLabel"), null);
    assert.deepEqual(env.clock.errors, []);
});

test("Budhud binds replaced native labels, retries styles and releases its percentage on a mode change", () => {
    const env = fixture(), { tree } = env;
    const cfg = { HEALTHBAR_TYPE: 4, ENABLE_COLOR_WARNING_25: 1 };
    tree.current.text = "100";
    const f = start(env, cfg);
    assert.equal(tree.group.FindChild("HealthPercentLabel").text, "10%");
    const oldCurrent = tree.current;
    oldCurrent.SetParent(env.other);
    const replacement = env.add(tree.group, "", ["currentHealthLabel"], "Label"); replacement.text = "800";
    env.clock.advance(150);
    assert.equal(oldCurrent.style.color, undefined);
    assert.equal(tree.group.FindChild("HealthPercentLabel").text, "80%");
    cfg.HEALTHBAR_TYPE = 0; f.onSettingsChanged(); env.clock.advance(1);
    assert.equal(tree.group.FindChild("HealthPercentLabel"), null);
    assert.equal(replacement.style.color, undefined);
    f.onDisable();
    assert.deepEqual(env.clock.errors, []);
});

test("Budhud observes one warning color and never clears the warning owner's native label", () => {
    const env = fixture(), { q, tree } = env;
    tree.current.text = "100";
    q.core.ConfigAdapter.loadFromFlat({ HEALTHBAR_TYPE: 4, ENABLE_COLORED_HEALTHBAR: 0,
        ENABLE_COLOR_WARNING_25: 1, ENABLE_COLOR_WARNING_65: 0, ENABLE_COLOR_WARNING_75: 0 });
    q.core.FeatureRegistry.boot();
    const firstColor = tree.current.style.color;
    assert.equal(tree.group.FindChild("HealthPercentLabel").style.color, firstColor);
    q.core.FeatureRegistry.disable("ql_healthbar");
    env.clock.advance(1);
    assert.equal(tree.current.style.color, firstColor, "Budhud teardown cannot clear another owner's color");
    assert.equal(tree.group.FindChild("HealthPercentLabel"), null);
    assert.equal(q.core.FeatureRegistry.isEnabled("ql_color_warnings"), true);
    q.core.FeatureRegistry.enable("ql_healthbar");
    assert.equal(tree.group.FindChild("HealthPercentLabel").style.color, tree.current.style.color);
    q.core.ConfigAdapter.loadFromFlat({ ENABLE_COLOR_WARNING_25: 0 });
    env.clock.advance(200);
    assert.equal(tree.current.style.color, undefined);
    assert.equal(tree.group.FindChild("HealthPercentLabel").style.color, undefined);
    assert.deepEqual(env.clock.errors, []);
});

test("Minecraft reads verified native pending bars and keeps damage, healing and barrier feedback", () => {
    const env = fixture(), { tree } = env;
    tree.damage.actuallayoutheight = 40; // 10% pending damage -> true HP 400.
    tree.heal.actuallayoutheight = 80;   // 20% incoming heal -> target HP 700.
    tree.shields.AddClass("HasBulletShield");
    const f = start(env, { HEALTHBAR_TYPE: 5 });
    assert.equal(tree.mcPercent.text.trim(), "[50%]");
    assert.equal(fills(tree, "HeartFill").filter(panel => panel.BHasClass("full")).length, 4);
    assert.ok(fills(tree, "HeartDeferred").some(panel => panel.style.visibility === "visible"));
    assert.ok(fills(tree, "HeartHealing").some(panel => panel.style.visibility === "visible"));
    assert.equal(tree.shieldHearts.FindChildrenWithClassTraverse("HeartSlot").length, 5);
    assert.equal(env.q.healthbar.mc.inspect().healing, true);
    tree.bulletMax.text = "/ 300"; env.clock.advance(80);
    assert.equal(tree.shieldHearts.FindChildrenWithClassTraverse("HeartSlot").filter(panel => panel.style.visibility === "visible").length, 3);
    f.onDisable(); env.clock.advance(1);
    assert.equal(tree.hearts.GetChildCount(), 0);
    assert.equal(tree.shieldHearts.GetChildCount(), 0);
    assert.equal(tree.shieldBox.style.visibility, undefined);
});

test("Minecraft tracks grid/food/health source replacements while previous panels stay alive", () => {
    const env = fixture(), { tree } = env;
    tree.current.text = "100";
    const f = start(env, { HEALTHBAR_TYPE: 5 });
    assert.equal(env.q.healthbar.mc.inspect().lowHealth, true);
    tree.hearts.SetParent(env.other);
    const nextHearts = env.add(tree.heartsRoot, "MinecraftHearts");
    const nativeChild = env.add(nextHearts, "ForeignChild");
    env.clock.advance(100);
    assert.equal(tree.hearts.GetChildCount(), 0);
    assert.ok(nextHearts.FindChildrenWithClassTraverse("HeartSlot").length > 0);
    assert.equal(nativeChild.IsValid(), true, "only controller-owned rows are replaced");
    tree.health.SetParent(env.other);
    const next = env.healthTree();
    env.clock.advance(100);
    assert.equal(env.q.healthbar.mc.inspect().source, next.canvas);
    assert.equal(next.mcPercent.text.trim(), "[50%]");
    assert.equal(env.q.healthbar.mc.inspect().lowHealth, false);
    f.onDisable(); env.clock.advance(1);
    assert.equal(nativeChild.IsValid(), true);
    assert.equal(env.q.healthbar.mc.inspect().pendingAnimations, 0);
    assert.deepEqual(env.clock.errors, []);
});

test("Minecraft does not cache a partially rendered image and preserves native number bindings", () => {
    const env = fixture(), { tree, q } = env;
    const originalCreate = env.sandbox.global.$.CreatePanel;
    let failed = false;
    env.sandbox.global.$.CreatePanel = (...args) => {
        const panel = originalCreate(...args);
        if (args[0] === "Image") {
            const setImage = panel.SetImage;
            panel.SetImage = image => {
                if (panel.BHasClass("HeartFill") && !failed) { failed = true; throw new Error("transient image rejection"); }
                return setImage.call(panel, image);
            };
        }
        return panel;
    };
    const mc = q.healthbar.mc.create({ id: "ql_healthbar" });
    assert.throws(() => mc.update(env.root, { HEALTHBAR_TYPE: 5 }, env.clock.now(), true), /transient image rejection/);
    mc.update(env.root, { HEALTHBAR_TYPE: 5 }, env.clock.now() + 50, true);
    assert.equal(fills(tree, "HeartFill").filter(panel => panel.BHasClass("full")).length, 5);
    assert.equal(tree.current.text, "500");
    assert.equal(tree.total.text, "/ 1000");
    mc.release();
});

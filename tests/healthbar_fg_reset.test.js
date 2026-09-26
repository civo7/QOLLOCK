"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const loadSettingsEnvironment = require("./load_settings_environment");

// Only the ownership path from the shipped hud_health / gold XML is modeled.
// The fixture does not claim to validate native layout or hero data binding.
function fixture(env) {
    const { hud, doc } = env;
    function add(parent, id, cls) {
        const p = doc.create("Panel", { id });
        parent.addChild(p);
        if (cls) p.AddClass(cls);
        return p;
    }
    const health = add(hud.root, "health_and_abilities_container");
    const bars = add(health, "hud_health_bars");
    const border = add(bars, "", "health_bar_border");
    const gold = add(hud.root, "gold_and_ap_container");
    add(gold, "Before");
    const portrait = add(gold, "LevelAmount");
    add(portrait, "HeroImage");
    add(gold, "After");
    return { health, bars, border, gold, portrait, add };
}

for (const type of [0, 1, 2, 3, 4, 5]) {
    test(`healthbar ${type}: real size row reset releases the HUD scale`, () => {
        const env = loadSettingsEnvironment();
        const { global: g, list, clock, hud, doc } = env;
        const { health } = fixture(env);
        g.MOD_CONFIG.HEALTHBAR_TYPE = type;
        const row = g.CreateSliderRow(list, "Size", "PLAYER_HEALTHBAR_SCALE", "size_50_200");
        const input = row.FindChildrenWithClassTraverse("ValueInput")[0];
        const reset = row.FindChildrenWithClassTraverse("SettingRowResetBtn")[0];
        for (const scale of [156, 200]) {
            input.text = String(scale);
            input._fire("oninputsubmit");
            clock.advance(1200);
            assert.equal(health.style.uiScale, Math.round(120 * scale / 100) + "%");
            reset._fire("onactivate");
            clock.advance(1200);
            assert.equal(g.MOD_CONFIG.PLAYER_HEALTHBAR_SCALE, 100);
            assert.equal(hud.sandbox.global.QOL.core.ConfigStore.get("ql_healthbar", "PLAYER_HEALTHBAR_SCALE"), 100);
            assert.equal(health.style.uiScale, undefined, "native CSS owns scale again");
        }
        assert.deepEqual(doc.eventErrors, []);
        assert.deepEqual(clock.errors, []);
    });
}

test("FG portrait shares bar ancestry and restores order on switch / missing anchor / hideout", () => {
    const env = loadSettingsEnvironment();
    const { health, bars, border, gold, portrait, add } = fixture(env);
    const q = env.hud.sandbox.global.QOL;
    const cfg = { HEALTHBAR_TYPE: 2, PLAYER_HEALTHBAR_SCALE: 156, PLAYER_HEALTHBAR_X_OFFSET: 100 };
    q.healthbar.fg.update(env.hud.root, cfg);
    assert.equal(portrait.GetParent(), border);
    assert.equal(portrait.BHasClass("qol_fg_portrait"), true);
    assert.equal(portrait.style.uiScale, "100%", "neutral child scale inherits the bar scale");
    assert.equal(portrait.style.visibility, "visible", "override the source layout's collapsed panel");
    assert.equal(portrait.style.width, "48px");
    const hero = portrait.FindChildTraverse("HeroImage");
    assert.equal(hero.style.uiScale, "100%", "override the source image's half scale");
    assert.equal(hero.style.width, "100%");
    q.healthbar.fg.update(env.hud.root, { HEALTHBAR_TYPE: 1 });
    assert.equal(portrait.GetParent(), gold);
    assert.equal(gold.GetChild(1), portrait);
    assert.equal(portrait.BHasClass("qol_fg_portrait"), false);
    assert.equal(portrait.style.visibility, undefined);
    assert.equal(portrait.style.width, undefined);
    assert.equal(hero.style.uiScale, undefined);
    q.healthbar.fg.update(env.hud.root, cfg);
    bars.SetParent(gold);
    q.healthbar.fg.update(env.hud.root, cfg);
    assert.equal(portrait.GetParent(), gold);
    const replacement = add(health, "hud_health_bars");
    const nextBorder = add(replacement, "", "health_bar_border");
    q.healthbar.fg.update(env.hud.root, cfg);
    assert.equal(portrait.GetParent(), nextBorder);
    env.hud.root.AddClass("InHideout");
    q.healthbar.fg.update(env.hud.root, cfg);
    assert.equal(portrait.GetParent(), gold);
    assert.equal(gold.GetChild(1), portrait);
});

test("FG styles a replaced native HeroImage and avoids unchanged style writes", () => {
    const env = loadSettingsEnvironment();
    const { portrait, add } = fixture(env);
    const q = env.hud.sandbox.global.QOL;
    const cfg = { HEALTHBAR_TYPE: 2 };
    q.healthbar.fg.update(env.hud.root, cfg);
    let writes = 0;
    const previousStyle = portrait.style;
    portrait.style = new Proxy(previousStyle, {
        set(target, key, value) { writes++; target[key] = value; return true; }
    });
    q.healthbar.fg.update(env.hud.root, cfg);
    assert.equal(writes, 0);
    portrait.FindChildTraverse("HeroImage").DeleteAsync(0);
    env.clock.advance(1);
    const replacement = add(portrait, "HeroImage");
    q.healthbar.fg.update(env.hud.root, cfg);
    assert.equal(replacement.style.visibility, "visible");
    assert.equal(replacement.style.width, "100%");
    assert.equal(replacement.style.uiScale, "100%");
    q.healthbar.fg.update(env.hud.root, { HEALTHBAR_TYPE: 0 });
    assert.equal(replacement.style.visibility, undefined);
    assert.equal(replacement.style.width, undefined);
    assert.equal(replacement.style.uiScale, undefined);
});

test("both clear helpers pass native CSS property names", () => {
    const { hud, doc } = loadSettingsEnvironment();
    const p = doc.create("Panel", { id: "StrictNativeStyle" });
    const names = [];
    const nativeClear = p.ClearPropertyFromCode.bind(p);
    p.ClearPropertyFromCode = name => { names.push(name); return nativeClear(name); };
    const q = hud.sandbox.global.QOL;
    for (const clear of [q.utils.ClearStyleSafe, q.core.panel.clearStyleProperty]) {
        p.style.uiScale = "190%";
        p.style.preTransformScale2d = "1.5";
        clear(p, "uiScale");
        clear(p, "preTransformScale2d");
        assert.equal(p.style.uiScale, undefined);
        assert.equal(p.style.preTransformScale2d, undefined);
    }
    assert.deepEqual(names, ["ui-scale", "pre-transform-scale2d", "ui-scale", "pre-transform-scale2d"]);
});

for (const [key, id, expected] of [["TOP_BAR_SCALE", "TopBar", "150%"], ["BOTTOM_BAR_SCALE", "hud_signature", "135%"]]) {
    test(`${key}: row reset restores another HUD element's CSS scale`, () => {
        const { global: g, list, clock, hud, doc } = loadSettingsEnvironment();
        const panel = hud.root.FindChildTraverse(id) || doc.create("Panel", { id });
        if (!panel.GetParent()) hud.root.addChild(panel);
        const row = g.CreateSliderRow(list, "Size", key, "scale_0_5_1_5");
        const input = row.FindChildrenWithClassTraverse("ValueInput")[0];
        input.text = "1.5";
        input._fire("oninputsubmit");
        clock.advance(1200);
        assert.equal(panel.style.uiScale, expected);
        row.FindChildrenWithClassTraverse("SettingRowResetBtn")[0]._fire("onactivate");
        clock.advance(1200);
        assert.equal(g.MOD_CONFIG[key], 1);
        assert.equal(panel.style.uiScale, undefined);
        assert.deepEqual(doc.eventErrors, []);
        assert.deepEqual(clock.errors, []);
    });
}

test("FG keeps one portrait when gold contains two native LevelAmount subtrees", () => {
    const env = loadSettingsEnvironment();
    const { portrait, gold, border, add } = fixture(env);
    // citadel_hud_player_level.xml contains another ScalingStatImage/LevelAmount
    // with its own HeroImage, in addition to the mod's gold layout copy.
    const playerLevel = add(gold, "PlayerLevel");
    const duplicate = add(playerLevel, "LevelAmount", "ScalingStatImage");
    add(duplicate, "HeroImage");
    const q = env.hud.sandbox.global.QOL;
    const cfg = { HEALTHBAR_TYPE: 2 };
    let reparents = 0;
    for (const panel of [portrait, duplicate]) {
        const setParent = panel.SetParent.bind(panel);
        panel.SetParent = parent => { reparents++; setParent(parent); };
    }
    q.healthbar.fg.update(env.hud.root, cfg);
    assert.equal(reparents, 1);
    for (let i = 0; i < 100; i++) {
        cfg.PLAYER_HEALTHBAR_SCALE = i % 2 ? 156 : 100;
        q.healthbar.fg.update(env.hud.root, cfg);
        assert.equal(reparents, 1, "a second source must not cause a new attachment");
        assert.equal(portrait.GetParent(), border);
        assert.equal(duplicate.GetParent(), playerLevel);
        assert.equal(portrait.BHasClass("qol_fg_portrait"), true);
    }
    assert.equal(reparents, 1, "no restore/attach oscillation on later ticks");
    q.healthbar.fg.update(env.hud.root, { HEALTHBAR_TYPE: 0 });
    assert.equal(reparents, 2, "restore exactly once on disable");
    assert.equal(portrait.GetParent(), gold);
    assert.equal(gold.GetChild(1), portrait);
    assert.equal(duplicate.style.visibility, undefined);
});

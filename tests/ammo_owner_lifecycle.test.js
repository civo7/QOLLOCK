"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createHud } = require("../scripts/simulator");

function setup() {
    const env = createHud({ inHideout: false }); env.assertLoaded();
    const { QOL: Q, $ } = env.sandbox.global;
    Q.core.App.shutdown();
    const cfg = Q.buildDefaultConfig();
    cfg.AMMO_CURRENT_SCALE = 150; cfg.AMMO_CURRENT_X_OFFSET = 20;
    let reads = 0;
    const feature = Q.core.FeatureRegistry.getManifest("ql_ammo").create({ events: Q.core.EventBus,
        id: "ql_ammo", config: { view() { reads++; return cfg; } }
    });
    const add = (parent, id, type = "Panel") => $.CreatePanel(type, parent, id);
    const native = root => {
        const core = add(root, ""); core.AddClass("HudCore");
        let owner = core;
        for (const id of ["gameplay_hud", "gameplay_hud_alive", "crosshair"]) owner = add(owner, id);
        const weapon = add(owner, "gun", "Citadel_AbilityHUDElement_Gun"); weapon.AddClass("clip_style_chunks");
        const gun = add(weapon, "gun_data"), panel = add(gun, "ammo_panel");
        const current = add(panel, "CurrentAmmo", "Label"); current.AddClass("weapon_ammo"); current.text = "6";
        const maximum = add(panel, "MaxAmmo", "Label"); maximum.AddClass("weapon_ammo_max"); maximum.text = " / 8";
        current.style.transform = "rotateZ(9deg)";
        return { weapon, gun, panel, current, maximum };
    };
    return { ...env, Q, $, cfg, feature, add, native, reads: () => reads };
}

test("ammo font choices activate independently, preserve native colors and retire across layout replacement", () => {
    const env = setup(), source = env.native(env.root);
    const manifest = env.Q.core.FeatureRegistry.getManifest("ql_ammo");
    assert.equal(manifest.isEnabled({ AMMO_CURRENT_FONT_STYLE: 1 }), true);
    assert.equal(manifest.isEnabled({ AMMO_TOTAL_FONT_STYLE: 3 }), true);
    env.cfg.AMMO_CURRENT_FONT_STYLE = 1; env.cfg.AMMO_TOTAL_FONT_STYLE = 3;
    env.feature.onEnable();
    assert.match(source.current.style.fontFamily, /VALVEOracle/);
    assert.equal(source.current.style.fontSize, "24px");
    assert.equal(source.current.style.color, undefined, "native low-ammo colors stay authoritative");
    assert.equal(source.maximum.style.fontFamily, "Radiance");
    source.current.style.fontFamily = "native rewrite"; env.clock.advance(600);
    assert.match(source.current.style.fontFamily, /VALVEOracle/);
    env.cfg.AMMO_CURRENT_FONT_STYLE = 0; env.feature.onSettingsChanged();
    assert.equal(source.current.style.fontFamily, undefined);
    assert.equal(source.current.style.fontWeight, undefined);
    assert.equal(source.current.style.fontSize, "24px", "font release preserves the selected size");
    env.cfg.AMMO_TOTAL_FONT_STYLE = 2; env.cfg.AMMO_TEXT_COLOR = 0x1112233;
    env.feature.onSettingsChanged();
    assert.equal(source.maximum.style.color, "#112233");
    assert.equal(source.maximum.style.opacity, "0.95");
    source.weapon.GetParent().GetParent().GetParent().GetParent().SetParent(env.add(null, "OldHudCore"));
    const next = env.native(env.root); env.add(next.gun, "clip_status_mirrored"); env.clock.advance(600);
    assert.equal(source.maximum.style.opacity, undefined);
    assert.equal(next.maximum.style.opacity, "0.95");
    env.cfg.AMMO_TOTAL_FONT_STYLE = 0; env.cfg.AMMO_TEXT_COLOR = 0; env.feature.onSettingsChanged();
    assert.equal(next.maximum.style.opacity, undefined);
    assert.equal(next.maximum.style.textShadow, undefined);
    env.feature.onDisable(); env.feature.onEnable(); env.feature.onDisable();
    env.clock.advance(20); assert.deepEqual(env.clock.errors, []);
});

test("missing ammo breadcrumbs ignore unrelated templates and recover through the live owner", () => {
    const env = setup();
    const decoy = env.add(env.root, "gun_data");
    const clip = env.add(decoy, "clip_status");
    const element = env.Q.presentation.elements.find(item => item.id === "ammo");
    assert.equal(env.Q.presentation.resolve(element, env.root, env.cfg), null, "editor ignores unrelated templates too");
    env.cfg.AMMO_CLIP_ANGLE = 45;
    env.feature.onEnable(); env.clock.advance(1600);
    assert.equal(clip.style.transform, undefined, "missing breadcrumbs cannot style a retained template");
    const live = env.native(env.root), ring = env.add(live.gun, "clip_status");
    env.clock.advance(600);
    assert.equal(live.current.style.fontSize, "24px");
    assert.equal(ring.style.transform, "rotateZ(-45deg)");
    live.weapon.SetParent(decoy); env.clock.advance(600);
    assert.equal(live.current.style.fontSize, undefined, "a living owner outside the path is retired");
    assert.equal(ring.style.transform, undefined);
    env.feature.onDisable();
    assert.deepEqual(env.clock.errors, []);
});

test("ammo ignores a living HudCore nested outside the direct HUD owner", () => {
    const env = setup();
    const retired = env.native(env.root);
    const core = retired.weapon.GetParent().GetParent().GetParent().GetParent();
    core.SetParent(env.add(env.root, "RetiredHud"));
    let wideSearches = 0;
    const find = env.root.FindChildrenWithClassTraverse.bind(env.root);
    env.root.FindChildrenWithClassTraverse = className => { wideSearches++; return find(className); };
    env.feature.onEnable(); env.clock.advance(1100);
    assert.equal(retired.current.style.fontSize, undefined);
    assert.equal(wideSearches, 0, "missing direct HudCore does not trigger descendant discovery");
    const current = env.native(env.root);
    env.clock.advance(600);
    assert.equal(current.current.style.fontSize, "24px");
    assert.equal(retired.current.style.fontSize, undefined);
    env.feature.onDisable();
    assert.deepEqual(env.clock.errors, []);
});

test("magazine toggle drives native updates only on settings changes and restores the vanilla gate", () => {
    const env = setup(), source = env.native(env.root), clip = env.add(source.gun, "clip_status");
    const progress = env.add(clip, "clip_progress_bar", "CircularProgressBar");
    const bullet = env.add(clip, "clip_bullet"); bullet.AddClass("bullet_present");
    const commands = [];
    env.sandbox.onEvent("CitadelConCommand", command => commands.push(command));
    Object.defineProperty(source.current, "text", { get() { throw Error("native C++ owns current ammo"); } });
    progress.style.clip = "radial( 50% 50%, 135deg, 90deg )";
    env.cfg.ENABLE_AMMO_STATUS = 1; env.feature.onEnable();
    assert.deepEqual(commands, ["citadel_crosshair_enable_clip_status 1"]);
    for (const capacity of [12, 30, 40, 41, 66, 200]) {
        source.maximum.text = " / " + capacity; env.clock.advance(700);
        assert.equal(progress.style.opacityMask, undefined);
        assert.equal(progress.style.borderColor, undefined);
        assert.equal(bullet.style.borderColor, undefined);
        assert.equal(clip.GetChildCount(), 2, "only native panels render the magazine");
    }
    env.cfg.AMMO_TEXT_COLOR = 3; env.feature.onSettingsChanged();
    assert.deepEqual(commands, ["citadel_crosshair_enable_clip_status 1"], "unrelated edits and discovery do not resend commands");
    assert.equal(progress.style.borderColor, undefined, "the palette only owns ammo digits");
    env.cfg.ENABLE_AMMO_STATUS = 0; env.feature.onSettingsChanged();
    assert.deepEqual(commands, ["citadel_crosshair_enable_clip_status 1", "citadel_crosshair_enable_clip_status 0"]);
    env.feature.onDisable();
    assert.equal(commands.length, 2);
    env.cfg.ENABLE_AMMO_STATUS = 1; env.feature.onEnable(); env.feature.onDisable();
    assert.deepEqual(commands.slice(2), ["citadel_crosshair_enable_clip_status 1", "citadel_crosshair_enable_clip_status 0"]);
    const count = commands.length;
    env.feature.onSettingsChanged(); env.clock.advance(1000);
    assert.equal(commands.length, count, "stopped hooks cannot re-enable the native renderer");
    assert.equal(progress.style.clip, "radial( 50% 50%, 135deg, 90deg )");
    assert.deepEqual(env.clock.errors, []);
});

test("standard magazine rotation preserves the native downward arc at zero", () => {
    const env = setup(), source = env.native(env.root), clip = env.add(source.gun, "clip_status");
    const background = env.add(clip, "clip_bg_progress_bar", "CircularProgressBar");
    // Native C++ uses offset 180 - half the 90 degree span, not CSS's static 0..90.
    background.style.clip = "radial( 50% 50%, 135deg, 90deg )";
    env.cfg.ENABLE_AMMO_STATUS = 1;
    env.feature.onEnable();
    assert.equal(clip.style.transform, undefined, "zero must not rotate the already downward native arc");
    env.cfg.AMMO_CLIP_ANGLE = 45; env.feature.onSettingsChanged();
    assert.equal(clip.style.transform, "rotateZ(-45deg)");
    clip.style.transform = "rotateZ(0deg)"; env.clock.advance(700);
    assert.equal(clip.style.transform, "rotateZ(-45deg)", "native feedback cannot lose the selected rotation");
    env.cfg.ENABLE_AMMO_STATUS = 0; env.feature.onSettingsChanged();
    assert.equal(clip.style.transform, "rotateZ(-45deg)");
    env.cfg.AMMO_CLIP_ANGLE = 0; env.feature.onSettingsChanged();
    assert.equal(clip.style.transform, undefined);
    env.cfg.ENABLE_AMMO_STATUS = 1; env.feature.onSettingsChanged();
    assert.equal(clip.style.transform, undefined);
    assert.equal(background.style.clip, "radial( 50% 50%, 135deg, 90deg )");
    env.feature.onDisable();
    assert.equal(clip.style.transform, undefined);
    assert.deepEqual(env.clock.errors, []);
});

test("ammo restores customized digit fonts after native feedback without changing native text", () => {
    const env = setup(), source = env.native(env.root);
    env.feature.onEnable();
    assert.equal(source.current.style.fontSize, "24px");
    source.current.style.fontSize = "16px";
    env.clock.advance(700);
    assert.equal(source.current.style.fontSize, "24px");
    assert.equal(source.current.text, "6");
    assert.equal(source.maximum.text, " / 8");
    env.feature.onDisable();
    assert.equal(source.current.style.fontSize, undefined);
    assert.equal(source.current.style.transform, "rotateZ(9deg)");
    assert.deepEqual(env.clock.errors, []);
});

test("ammo derives both native digit plans from settings while preserving live layout and multi-role precedence", () => {
    const env = setup(), source = env.native(env.root);
    const mirrored = env.add(source.gun, "clip_status_mirrored");
    env.feature.onEnable();
    assert.equal(source.current.style.fontSize, "27px");
    assert.equal(source.current.style.width, undefined);
    assert.equal(source.current.style.marginLeft, "20px");
    env.sandbox.eval("globalThis.ammoRounds = 0; const originalRound = Math.round; Math.round = value => { ammoRounds++; return originalRound(value); };");
    source.current.style.fontSize = "native overwrite"; env.clock.advance(1600);
    assert.equal(source.current.style.fontSize, "27px", "native style feedback is still repaired");
    assert.equal(env.sandbox.eval("ammoRounds"), 0, "unchanged settings require no repeated font-size derivation");
    source.current.AddClass("weapon_ammo_max"); env.clock.advance(600);
    assert.equal(source.current.style.fontSize, undefined, "the later neutral Max role releases the earlier Current font");
    assert.equal(source.current.style.marginLeft, "20px", "the mirrored Max role has no native gap property to replace Current's margin");
    mirrored.DeleteAsync(0); env.clock.advance(600);
    assert.equal(source.current.style.fontSize, undefined);
    assert.equal(source.current.style.width, undefined);
    assert.equal(source.current.style.marginLeft, undefined, "the standard Max role's null gap releases the Current override");
    source.current.RemoveClass("weapon_ammo_max"); env.clock.advance(600);
    assert.equal(source.current.style.fontSize, "24px"); assert.equal(source.current.style.width, "48px");
    env.cfg.AMMO_TOTAL_SCALE = 175; env.feature.onSettingsChanged();
    source.current.AddClass("weapon_ammo_max"); env.clock.advance(600);
    assert.equal(source.current.style.fontSize, "28px"); assert.equal(source.current.style.width, "88px");
    assert.equal(source.current.style.marginLeft, "4px");
    env.sandbox.eval("ammoRounds = 0;"); env.add(source.gun, "clip_status_mirrored"); env.clock.advance(600);
    assert.equal(source.current.style.fontSize, "32px", "a late mirrored layout selects the current settings' alternate plan");
    assert.equal(source.current.style.width, undefined); assert.equal(source.current.style.marginLeft, "20px");
    assert.equal(env.sandbox.eval("ammoRounds"), 0);
    assert.equal(source.current.text, "6"); assert.equal(source.maximum.text, " / 8");
    env.feature.onDisable(); env.clock.advance(20); assert.deepEqual(env.clock.errors, []);
});

test("stopped ammo hooks cannot read settings or revive digit presentation", () => {
    const env = setup(), source = env.native(env.root);
    env.feature.onEnable(); env.feature.onDisable();
    const reads = env.reads();
    env.feature.onSettingsChanged(); env.clock.advance(1000);
    assert.equal(source.current.style.fontSize, undefined);
    assert.equal(source.current.style.x, undefined);
    assert.equal(env.reads(), reads);
    assert.deepEqual(env.clock.errors, []);
});

test("ammo waits for real HUD evidence and releases a still-living retired HUD", () => {
    const env = setup(), loading = env.add(null, "LoadingRoot");
    const decoy = env.native(loading), first = env.native(env.root);
    env.$.GetContextPanel = () => loading;
    env.feature.onEnable();
    assert.equal(decoy.current.style.fontSize, undefined);
    env.$.GetContextPanel = () => env.root;
    env.clock.advance(700); assert.equal(first.current.style.fontSize, "24px");
    const replacement = env.add(null, "Hud", "CitadelHud"), current = env.native(replacement);
    env.$.GetContextPanel = () => replacement;
    env.clock.advance(700);
    assert.equal(first.current.style.fontSize, undefined);
    assert.equal(first.current.style.x, undefined);
    assert.equal(current.current.style.fontSize, "24px");
    assert.equal(current.current.style.marginRight, "-20px");
    env.feature.onDisable();
    assert.deepEqual(env.clock.errors, []);
});

test("digit reset retains rejected font retirement after the observation loop stops", () => {
    const env = setup(), source = env.native(env.root), panel = source.current;
    env.feature.onEnable();
    const clear = panel.ClearPropertyFromCode.bind(panel);
    let reject = true;
    panel.ClearPropertyFromCode = key => key === "font" && reject ? false : clear(key);
    panel.style = new Proxy(panel.style, {
        deleteProperty(target, key) { if (key === "fontSize" && reject) throw Error("native retirement rejected"); return Reflect.deleteProperty(target, key); },
        set(target, key, value) { if (key === "fontSize" && reject && !value) throw Error("native retirement rejected"); target[key] = value; return true; }
    });
    env.cfg.AMMO_CURRENT_SCALE = 100;
    env.feature.onSettingsChanged(); env.feature.onDisable();
    assert.equal(panel.style.fontSize, "16px", "the neutral native font is restored while code-property release retries");
    reject = false; env.clock.advance(700);
    assert.equal(panel.style.fontSize, undefined);
    assert.equal(panel.style.x, undefined);
    assert.deepEqual(env.clock.errors, []);
});

test("digit margin retirement retries a rejected composite clear after Ammo stops", () => {
    const env = setup(), source = env.native(env.root), panel = source.current;
    const physical = { x: 0, y: 0 };
    let reject = false;
    const clear = panel.ClearPropertyFromCode.bind(panel);
    panel.ClearPropertyFromCode = key => {
        if (key === "margin") {
            if (reject) return false;
            physical.x = physical.y = 0;
        }
        return clear(key);
    };
    panel.style = new Proxy(panel.style, { set(target, key, value) {
        if (key === "marginRight") {
            physical.x = -parseFloat(value) || 0;
        }
        target[key] = value; return true;
    } });
    env.feature.onEnable();
    assert.deepEqual(physical, { x: 20, y: 0 });
    reject = true; env.feature.onDisable();
    assert.equal(panel.style.marginRight, "0px", "neutral margins remain owned until the composite clear succeeds");
    const reads = env.reads();
    reject = false; env.clock.advance(700);
    assert.deepEqual(physical, { x: 0, y: 0 });
    assert.equal(panel.style.marginRight, undefined);
    assert.equal(env.reads(), reads, "cleanup cannot revive settings observation");
    assert.deepEqual(env.clock.errors, []);
});

test("Ammo clip rotation observes native feedback and retries retirement after disable without clearing a new instance", () => {
    const env = setup(), source = env.native(env.root), clip = env.add(source.gun, "clip_status");
    env.cfg.AMMO_CLIP_ANGLE = 30;
    env.feature.onEnable(); assert.equal(clip.style.transform, "rotateZ(-30deg)");
    clip.style.transform = "rotateZ(12deg)";
    env.clock.advance(700); assert.equal(clip.style.transform, "rotateZ(-30deg)");
    const clear = clip.ClearPropertyFromCode.bind(clip); let reject = true;
    clip.ClearPropertyFromCode = key => reject && key === "transform" ? false : clear(key);
    env.feature.onDisable(); assert.equal(clip.style.transform, "rotateZ(0deg)");
    const next = env.Q.core.FeatureRegistry.getManifest("ql_ammo").create({ events: env.Q.core.EventBus, id: "ql_ammo", config: { view: () => ({ ...env.cfg, AMMO_CLIP_ANGLE: 45 }) } });
    next.onEnable(); assert.equal(clip.style.transform, "rotateZ(-45deg)");
    reject = false; env.clock.advance(700);
    assert.equal(clip.style.transform, "rotateZ(-45deg)");
    assert.equal(clip.BHasClass("qol-ammo-visual-disabled"), true);
    next.onDisable(); assert.equal(clip.style.transform, undefined);
    assert.deepEqual(env.clock.errors, []);
});

test("Ammo mirrored rotation returns each CSS baseline and retains a rejected reset until it succeeds", () => {
    const env = setup(), source = env.native(env.root), left = env.add(source.gun, "clip_status"), right = env.add(source.gun, "clip_status_mirrored");
    env.cfg.AMMO_CLIP_ANGLE = 20; env.feature.onEnable();
    assert.equal(left.style.transform, "rotateZ(70deg)"); assert.equal(right.style.transform, "rotateZ(160deg)");
    const clear = right.ClearPropertyFromCode.bind(right); let reject = true;
    right.ClearPropertyFromCode = key => reject && key === "transform" ? false : clear(key);
    env.cfg.AMMO_CLIP_ANGLE = 0; env.feature.onSettingsChanged();
    assert.equal(left.style.transform, undefined); assert.equal(right.style.transform, "rotateZ(180deg)");
    env.feature.onDisable(); reject = false; env.clock.advance(700);
    assert.equal(right.style.transform, undefined); assert.deepEqual(env.clock.errors, []);
});

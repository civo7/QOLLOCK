"use strict";
const { readStyleSource } = require("./helpers/style_source");

const test = require("node:test");
const assert = require("node:assert/strict");
const { createHud } = require("../scripts/simulator");
const loadSettings = require("./load_settings_environment");
const addGunData = require("./helpers/native_gun");

function addClipHalf($, root, id) {
    const half = $.CreatePanel("Panel", root, id);
    for (const ringId of ["clip_bg_progress_bar", "clip_bonus_progress_bar", "clip_progress_bar"])
        $.CreatePanel("CircularProgressBar", half, ringId);
    return half;
}

test("Default preset disables native magazine updates through the settings-to-HUD bridge", () => {
    const env = loadSettings(), commands = [];
    const { $ } = env.hud.sandbox.global;
    env.hud.sandbox.onEvent("CitadelConCommand", command => commands.push(command));
    const clip = addClipHalf($, addGunData($, env.hud.root), "clip_status");
    Object.assign(env.global.MOD_CONFIG, { ENABLE_AMMO_STATUS: 1, AMMO_CLIP_ANGLE: 45 });
    env.global.SaveAndSync(); env.clock.advance(1000);
    assert.deepEqual(commands, ["citadel_crosshair_enable_clip_status 1"]);
    assert.equal(clip.style.transform, "rotateZ(-45deg)");
    assert.equal(env.global.ApplyPresetByName("Default"), true); env.clock.advance(1000);
    assert.deepEqual(commands, ["citadel_crosshair_enable_clip_status 1", "citadel_crosshair_enable_clip_status 0"]);
    assert.equal(clip.style.transform, undefined);
    assert.deepEqual(env.clock.errors, []);
});

test("magazine rotation keeps both native half-rings together across hero layouts", () => {
    const hud = createHud({ inHideout: true });
    hud.assertLoaded();
    const { $, QOL: Q } = hud.sandbox.global;
    const gun = addGunData($, hud.root);
    const first = addClipHalf($, gun, "clip_status");
    Q.core.ConfigStore.set("ql_ammo", "AMMO_CLIP_ANGLE", 45);
    hud.clock.advance(600);
    assert.equal(first.style.transform, "rotateZ(-45deg)");
    assert.equal(first.Children()[0].style.transform, undefined, "native ring transforms stay engine-owned");

    first.DeleteAsync(0);
    hud.clock.advance(1);
    const left = addClipHalf($, gun, "clip_status");
    const right = addClipHalf($, gun, "clip_status_mirrored");
    hud.clock.advance(600);
    assert.equal(left.style.transform, "rotateZ(45deg)");
    assert.equal(right.style.transform, "rotateZ(135deg)");
    assert.ok(left.Children().every(ring => !ring.style.transform));
    assert.ok(right.Children().every(ring => !ring.style.transform));

    Q.core.ConfigStore.set("ql_ammo", "AMMO_CLIP_ANGLE", 0);
    hud.clock.advance(600);
    assert.equal(left.style.transform || "", "");
    assert.equal(right.style.transform || "", "");

    Q.core.ConfigStore.set("ql_ammo", "AMMO_CLIP_ANGLE", 45);
    right.DeleteAsync(0);
    hud.clock.advance(1);
    const newRight = addClipHalf($, gun, "clip_status_mirrored");
    hud.clock.advance(600);
    assert.equal(newRight.style.transform, "rotateZ(135deg)", "late mirrored half");

    left.DeleteAsync(0);
    newRight.DeleteAsync(0);
    hud.clock.advance(1);
    const standardAgain = addClipHalf($, gun, "clip_status");
    hud.clock.advance(600);
    assert.equal(standardAgain.style.transform, "rotateZ(-45deg)");
    assert.equal(standardAgain.Children()[0].style.transform, undefined);
    assert.deepEqual(hud.clock.errors, []);
});

test("native magazine enable follows settings while replaced clip panels retain native fill", () => {
    const css = readStyleSource("panorama/styles/ability_hud_elements/element_gun.css");
    assert.match(css, /#clip_status\.qol-ammo-visual-enabled[^}]*visibility:\s*visible;/s);
    assert.match(css, /#clip_status\.qol-ammo-visual-disabled[^}]*visibility:\s*collapse;/s);

    const hud = createHud({ inHideout: true });
    hud.assertLoaded();
    const { $, QOL: Q } = hud.sandbox.global;
    const commands = [];
    hud.sandbox.onEvent("CitadelConCommand", command => commands.push(command));
    const decoyOwner = $.CreatePanel("Panel", hud.root, "HiddenGunTemplate");
    const decoy = addClipHalf($, decoyOwner, "clip_status");
    const gunData = addGunData($, hud.root);
    const first = addClipHalf($, gunData, "clip_status");
    const ammoPanel = $.CreatePanel("Panel", gunData, "ammo_panel");
    const currentAmmo = $.CreatePanel("Label", ammoPanel, "CurrentAmmo");
    currentAmmo.AddClass("weapon_ammo"); currentAmmo.text = "6";
    Q.core.ConfigStore.set("ql_ammo", "ENABLE_AMMO_STATUS", true);
    assert.deepEqual(commands, ["citadel_crosshair_enable_clip_status 1"]);
    assert.equal(first.BHasClass("qol-ammo-visual-enabled"), true);
    assert.equal(decoy.BHasClass("qol-ammo-visual-enabled"), false, "a hidden duplicate is not the live clip owner");
    const progress = first.FindChild("clip_progress_bar");
    progress.style.clip = "radial( 50% 50%, 135deg, 56.25deg )";
    Q.core.ConfigStore.set("ql_ammo", "AMMO_TEXT_COLOR", 3);
    hud.clock.advance(600);
    assert.equal(progress.style.clip, "radial( 50% 50%, 135deg, 56.25deg )");
    assert.equal(progress.style.borderColor, undefined);
    assert.equal(progress.style.opacityMask, undefined);
    first.DeleteAsync(0); hud.clock.advance(1);
    const replacement = addClipHalf($, gunData, "clip_status");
    hud.clock.advance(600);
    assert.equal(replacement.BHasClass("qol-ammo-visual-enabled"), true);
    assert.equal(replacement.GetChildCount(), 3, "the game retains ownership of every rendered child");
    assert.equal(commands.length, 1, "source replacement must not resend the game command");
    Q.core.ConfigStore.set("ql_ammo", "AMMO_TEXT_COLOR", 0);
    Q.core.ConfigStore.set("ql_ammo", "ENABLE_AMMO_STATUS", false);
    assert.deepEqual(commands, ["citadel_crosshair_enable_clip_status 1", "citadel_crosshair_enable_clip_status 0"]);
    assert.equal(replacement.BHasClass("qol-ammo-visual-enabled"), false);
    assert.equal(replacement.BHasClass("qol-ammo-visual-disabled"), false, "disable releases owned classes");
    assert.deepEqual(hud.clock.errors, []);
});

test("reload countdown keeps one decimal when radial progress freezes then jumps", () => {
    const hud = createHud({ inHideout: false });
    hud.assertLoaded();
    const { $, QOL: Q } = hud.sandbox.global;
    const reticle = $.CreatePanel("Panel", addGunData($, hud.root), "reticle_status");
    const radial = $.CreatePanel("CircularProgressBar", reticle, "attack_delayed_progress_bar");
    radial.AddClass("has_active_reload");
    radial.style.clip = "radial( 50% 50%, 40deg, 90deg )";
    Q.core.ConfigStore.set("ql_reload_cooldown", "ENABLE_RELOAD_COOLDOWN", true);
    hud.clock.advance(60);
    radial.style.clip = "radial( 50% 50%, 37deg, 90deg )";
    hud.clock.advance(60);
    const label = reticle.FindChildTraverse("QOLReloadCooldownText");
    assert.equal(label.text, "0.6");

    hud.clock.advance(500);
    assert.equal(label.text, "0.6", "stalled progress must keep the displayed value");
    radial.style.clip = "radial( 50% 50%, 80deg, 90deg )";
    hud.clock.advance(60);
    assert.equal(label.text, "0.6", "a clip jump must not expose the raw floating-point lock");
    radial.RemoveClass("has_active_reload");
    radial.style.visibility = "collapse";
    hud.clock.advance(60);
    assert.equal(label.text, "", "finished reload hides the countdown");

    radial.AddClass("has_active_reload");
    radial.style.visibility = "visible";
    radial.style.clip = "radial( 50% 50%, 40deg, 90deg )";
    hud.clock.advance(550);
    radial.style.clip = "radial( 50% 50%, 38deg, 90deg )";
    hud.clock.advance(60);
    assert.equal(label.text, "1.0", "sub-second formatting at the rounding boundary");
    radial.style.clip = "radial( 50% 50%, 80deg, 90deg )";
    hud.clock.advance(60);
    assert.equal(label.text, "1.0", "rounding boundary stays in decimal mode");
    assert.deepEqual(hud.clock.errors, []);
});

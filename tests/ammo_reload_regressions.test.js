"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createHud } = require("../scripts/simulator");

function addClipHalf($, root, id) {
    const half = $.CreatePanel("Panel", root, id);
    for (const ringId of ["clip_bg_progress_bar", "clip_bonus_progress_bar", "clip_progress_bar"])
        $.CreatePanel("CircularProgressBar", half, ringId);
    return half;
}

test("magazine rotation keeps both native half-rings together across hero layouts", () => {
    const hud = createHud({ inHideout: true });
    hud.assertLoaded();
    const { $, QOL: Q } = hud.sandbox.global;
    const first = addClipHalf($, hud.root, "clip_status");
    Q.core.ConfigStore.set("ql_ammo", "AMMO_CLIP_ANGLE", 45);
    hud.clock.advance(600);
    assert.equal(first.Children()[0].style.transform, "rotateZ(-45deg)");

    first.DeleteAsync(0);
    hud.clock.advance(1);
    const left = addClipHalf($, hud.root, "clip_status");
    const right = addClipHalf($, hud.root, "clip_status_mirrored");
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
    const newRight = addClipHalf($, hud.root, "clip_status_mirrored");
    hud.clock.advance(600);
    assert.equal(newRight.style.transform, "rotateZ(135deg)", "late mirrored half");

    left.DeleteAsync(0);
    newRight.DeleteAsync(0);
    hud.clock.advance(1);
    const standardAgain = addClipHalf($, hud.root, "clip_status");
    hud.clock.advance(600);
    assert.equal(standardAgain.style.transform || "", "");
    assert.equal(standardAgain.Children()[0].style.transform, "rotateZ(-45deg)");
    assert.deepEqual(hud.clock.errors, []);
});

test("visual ammo state follows dynamically replaced native clip panels", () => {
    const css = fs.readFileSync(path.join(__dirname, "..", "panorama/styles/ability_hud_elements/element_gun.css"), "utf8");
    assert.match(css, /#clip_status\.qol-ammo-visual-enabled[^}]*visibility:\s*visible\s*!important;/s);
    assert.match(css, /#clip_status\.qol-ammo-visual-enabled #clip_progress_bar[^}]*visibility:\s*visible\s*!important;/s);
    assert.match(css, /\.has_bonus_clip #clip_status\.qol-ammo-visual-enabled #clip_bonus_progress_bar[^}]*visibility:\s*visible\s*!important;/s);
    assert.match(css, /#clip_status\.qol-ammo-visual-enabled\.qol-ammo-pips-populated #clip_progress_bar[^}]*visibility:\s*collapse\s*!important;/s);
    assert.match(css, /\.qol-ammo-pip\.qol-ammo-pip-live[^}]*border-color:\s*clipLiveBulletColor;/s);
    assert.match(css, /#clip_status\.qol-ammo-visual-disabled[^}]*visibility:\s*collapse;/s);

    const hud = createHud({ inHideout: true });
    hud.assertLoaded();
    const { $, QOL: Q } = hud.sandbox.global;
    const decoyOwner = $.CreatePanel("Panel", hud.root, "HiddenGunTemplate");
    const decoy = addClipHalf($, decoyOwner, "clip_status");
    const gunData = $.CreatePanel("Panel", hud.root, "gun_data");
    const first = addClipHalf($, gunData, "clip_status");
    const ammoPanel = $.CreatePanel("Panel", gunData, "ammo_panel");
    const currentAmmo = $.CreatePanel("Label", ammoPanel, "CurrentAmmo");
    currentAmmo.AddClass("weapon_ammo");
    currentAmmo.text = "6";
    const maxAmmo = $.CreatePanel("Label", ammoPanel, "MaxAmmo");
    maxAmmo.AddClass("weapon_ammo_max");
    maxAmmo.text = " / 8";
    Q.core.ConfigStore.set("ql_ammo", "ENABLE_AMMO_STATUS", true);
    assert.equal(first.BHasClass("qol-ammo-visual-enabled"), true);
    assert.equal(first.BHasClass("qol-ammo-visual-disabled"), false);
    assert.equal(decoy.BHasClass("qol-ammo-visual-enabled"), false, "hidden duplicate must not win clip resolution");
    assert.equal(first.BHasClass("qol-ammo-pips-populated"), true);
    assert.equal(first.FindChildrenWithClassTraverse("qol-ammo-pip").length, 8);
    assert.equal(first.FindChildrenWithClassTraverse("qol-ammo-pip-live").length, 6);

    currentAmmo.text = "5";
    hud.clock.advance(120);
    assert.equal(first.FindChildrenWithClassTraverse("qol-ammo-pip-live").length, 5, "pips follow the live ammo label");

    first.DeleteAsync(0);
    hud.clock.advance(1);
    const replacement = addClipHalf($, gunData, "clip_status");
    hud.clock.advance(600);
    assert.equal(replacement.BHasClass("qol-ammo-visual-enabled"), true);
    assert.equal(replacement.FindChildrenWithClassTraverse("qol-ammo-pip").length, 8, "replacement receives owned pips");

    Q.core.ConfigStore.set("ql_ammo", "ENABLE_AMMO_STATUS", false);
    hud.clock.advance(1);
    assert.equal(replacement.BHasClass("qol-ammo-visual-enabled"), false);
    assert.equal(replacement.BHasClass("qol-ammo-visual-disabled"), false, "disabled feature releases its owned classes");
    assert.equal(replacement.FindChildrenWithClassTraverse("qol-ammo-pip").length, 0, "disable removes owned pips");
    assert.deepEqual(hud.clock.errors, []);
});

test("reload countdown keeps one decimal when radial progress freezes then jumps", () => {
    const hud = createHud({ inHideout: false });
    hud.assertLoaded();
    const { $, QOL: Q } = hud.sandbox.global;
    const reticle = $.CreatePanel("Panel", hud.root, "reticle_status");
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

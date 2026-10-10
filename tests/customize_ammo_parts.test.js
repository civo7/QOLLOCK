"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createHud } = require("../scripts/simulator");
const loadSettings = require("./load_settings_environment");

function ring($, parent, id) {
    const panel = $.CreatePanel("Panel", parent, id);
    const progress = $.CreatePanel("CircularProgressBar", panel, "clip_progress_bar");
    progress.style.transform = "rotateZ(23deg)";
    return { panel, progress };
}

test("ammo group geometry follows sibling rings without changing crosshair or native ring transforms", () => {
    const hud = createHud({ inHideout: true });
    hud.assertLoaded();
    const { $, QOL: Q } = hud.sandbox.global;
    const gun = $.CreatePanel("Panel", hud.root, "gun_data");
    const crosshair = $.CreatePanel("Panel", gun, "GunGrosshair");
    const ammo = $.CreatePanel("Panel", gun, "ammo_panel");
    ammo.style.x = "50%";
    ammo.style.y = "85px";
    ammo.style.opacity = "0.6";
    ammo.style.preTransformScale2d = "1.2, 1.2";
    const current = $.CreatePanel("Label", ammo, ""); current.AddClass("weapon_ammo");
    const maximum = $.CreatePanel("Label", ammo, ""); maximum.AddClass("weapon_ammo_max");
    const first = ring($, gun, "clip_status");
    Q.core.ConfigStore.set("ql_ammo", "AMMO_CURRENT_SCALE", 150);
    Q.core.ConfigStore.set("ql_ammo", "AMMO_TOTAL_SCALE", 175);
    Q.core.ConfigStore.set("ql_ammo", "AMMO_PANEL_X_OFFSET", 37);
    Q.core.ConfigStore.set("ql_ammo", "AMMO_PANEL_Y_OFFSET", 26);
    Q.core.ConfigStore.set("ql_ammo", "AMMO_HUD_SCALE", 160);
    hud.clock.advance(600);
    assert.equal(current.style.fontSize, "24px");
    assert.equal(maximum.style.fontSize, "28px");
    assert.equal(ammo.style.uiScale, "160%");
    assert.equal(first.panel.style.uiScale, "160%");
    assert.equal(ammo.style.marginLeft, "37px");
    assert.equal(first.panel.style.x, "37px");
    assert.equal(ammo.style.marginTop, "-26px");
    assert.equal(first.panel.style.y, "-26px");
    assert.equal(ammo.style.x, "50%");
    assert.equal(ammo.style.y, "85px");
    assert.equal(first.progress.style.transform, "rotateZ(23deg)");
    assert.equal(ammo.style.opacity, "0.6");
    assert.equal(ammo.style.preTransformScale2d, "1.2, 1.2");
    for (const key of ["x", "y", "uiScale", "transform"]) assert.equal(crosshair.style[key], undefined);

    first.panel.DeleteAsync(0); hud.clock.advance(1);
    const next = ring($, gun, "clip_status");
    hud.clock.advance(600);
    assert.equal(next.panel.style.uiScale, "160%");
    assert.equal(next.panel.style.x, "37px");
    assert.equal(next.progress.style.transform, "rotateZ(23deg)");

    Q.core.ConfigStore.set("ql_ammo", "AMMO_HUD_SCALE", 100);
    Q.core.ConfigStore.set("ql_ammo", "AMMO_PANEL_X_OFFSET", 0);
    Q.core.ConfigStore.set("ql_ammo", "AMMO_PANEL_Y_OFFSET", 0);
    hud.clock.advance(600);
    assert.equal(ammo.style.uiScale, undefined);
    assert.equal(ammo.style.marginLeft, undefined);
    assert.equal(ammo.style.marginTop, undefined);
    assert.equal(ammo.style.x, "50%");
    assert.equal(ammo.style.y, "85px");
    assert.equal(ammo.style.opacity, "0.6");
    assert.equal(ammo.style.preTransformScale2d, "1.2, 1.2");
    for (const key of ["uiScale", "x", "y"]) assert.equal(next.panel.style[key], undefined);
    assert.equal(next.progress.style.transform, "rotateZ(23deg)");
    assert.deepEqual(hud.clock.errors, []);
});

test("ring-only mirrored hero layout accepts group geometry without ammo digits", () => {
    const hud = createHud({ inHideout: true });
    hud.assertLoaded();
    const { $, QOL: Q } = hud.sandbox.global;
    const gun = $.CreatePanel("Panel", hud.root, "gun_data");
    const first = ring($, gun, "clip_status");
    const mirrored = ring($, gun, "clip_status_mirrored");
    Q.core.ConfigStore.set("ql_ammo", "AMMO_HUD_SCALE", 140);
    Q.core.ConfigStore.set("ql_ammo", "AMMO_PANEL_X_OFFSET", -25);
    hud.clock.advance(600);
    for (const item of [first, mirrored]) {
        assert.equal(item.panel.style.uiScale, "140%");
        assert.equal(item.panel.style.x, "-25px");
        assert.equal(item.progress.style.transform, "rotateZ(23deg)");
    }
    Q.core.ConfigStore.set("ql_ammo", "AMMO_HUD_SCALE", 100);
    Q.core.ConfigStore.set("ql_ammo", "AMMO_PANEL_X_OFFSET", 0);
    hud.clock.advance(600);
    for (const item of [first, mirrored]) {
        assert.equal(item.panel.style.uiScale, undefined);
        assert.equal(item.panel.style.x, undefined);
    }
    assert.deepEqual(hud.clock.errors, []);
});

test("ammo selection frame measures only native digits and ring siblings", () => {
    for (const digits of [true, false]) {
        const env = loadSettings();
        const Q = env.global.QOL;
        const element = Q.presentation.elements.find(item => item.id === "ammo");
        let gun = env.hud.root;
        for (const segment of element.path.slice(0, -1)) {
            const id = typeof segment === "string" ? segment : "";
            const classes = typeof segment === "string" ? [] : [segment.className];
            gun = gun.addChild(env.doc.create("Panel", { id, classes }));
        }
        Object.assign(gun, { actualxoffset: 400, actualyoffset: 200, actuallayoutwidth: 1200, actuallayoutheight: 1000 });
        const add = (id, x, y, width, height) => {
            const panel = gun.addChild(env.doc.create("Panel", { id }));
            Object.assign(panel, { actualxoffset: x, actualyoffset: y, actuallayoutwidth: width, actuallayoutheight: height });
            return panel;
        };
        add("GunGrosshair", -300, -300, 1000, 1000);
        const first = add("clip_status", -50, -30, 100, 100);
        const mirrored = add("clip_status_mirrored", -80, -30, 100, 100);
        const ammo = digits ? add("ammo_panel", 20, 80, 90, 30) : null;
        const target = Q.presentation.resolve(element, env.hud.root, env.global.MOD_CONFIG);
        assert.equal(target, ammo || first);
        assert.deepEqual(Array.from(element.measurePanels(target), panel => panel.id),
            digits ? ["ammo_panel", "clip_status", "clip_status_mirrored"] : ["clip_status", "clip_status_mirrored"]);
        const frame = Q.ui.customizeGeometry.frameBox(element, target, env.hud.root);
        assert.deepEqual([frame.x, frame.y, frame.width, frame.height], digits
            ? [320, 170, 190, 140] : [320, 170, 130, 100]);
        assert.deepEqual(env.clock.errors, []);
    }
});

"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const load = require("./load_settings_environment");

function owner(env, element) {
    let panel = env.hud.root;
    for (const segment of element.path) {
        let next = typeof segment === "string" ? panel.FindChild(segment) : panel.Children().find(p => p.BHasClass(segment.className));
        if (!next) {
            next = env.doc.create("Panel", { id: typeof segment === "string" ? segment : "", classes: typeof segment === "string" ? [] : [segment.className] });
            panel.addChild(next);
        }
        panel = next;
    }
    if (element.id === "items") panel.AddClass("ModsContainer");
    if (element.id === "playerStats") panel = panel.addChild(env.doc.create("Panel", { id: "HudStatBlock" }));
    Object.assign(panel, { actuallayoutwidth: 160, actuallayoutheight: 60, actualxoffset: 200, actualyoffset: 100 });
    panel.style.transform = "rotateZ(9deg)";
    return panel;
}

for (const id of ["souls", "items", "stamina", "playerStats", "speed"]) {
    test(`${id}: scoped scale previews, measures, restores replacements and round-trips`, () => {
        const env = load();
        const { global: g, clock } = env;
        const element = g.QOL.presentation.elements.find(item => item.id === id);
        const key = element.postScaleKey;
        let panel = owner(env, element);
        const parent = panel.GetParent();
        g.QOL.ui.window.setOpen(true); clock.advance(500);
        assert.equal(g.QOL_DEFAULT_CONFIG[key], 100);
        assert.equal(g.QOL.ui.customize.start(null, { elementId: id }), true);
        for (const suffix of ["", "TopLeft", "TopRight", "BottomLeft"]) assert.ok(env.em.FindChildTraverse("QOLCustomizeResize_" + id + suffix));
        const input = env.em.FindChildTraverse("QOLCustomize_" + key);
        for (const percent of [50, 151, 200]) {
            input.text = String(percent); input._fire("oninputsubmit"); clock.advance(1200);
            assert.equal(panel.style.preTransformScale2d, String(percent / 100));
            assert.equal(panel.style.uiScale, undefined);
            assert.equal(panel.style.transform, "rotateZ(9deg)");
            assert.equal(g.MOD_CONFIG[key], 100, "preview remains transient");
            assert.equal(env.em.FindChildTraverse("QOLCustomizeFrame_" + id).style.width, Math.round(160 * percent / 100) + "px");
        }
        panel.DeleteAsync(0); clock.advance(1);
        if (id === "playerStats") {
            panel = parent.addChild(env.doc.create("Panel", { id: "HudStatBlock" }));
            Object.assign(panel, { actuallayoutwidth: 160, actuallayoutheight: 60 });
        } else panel = owner(env, element);
        clock.advance(1200);
        assert.equal(panel.style.preTransformScale2d, "2", "replacement invalidates the signature");
        env.em.FindChildTraverse("QOLCustomizeCancel")._fire("onactivate"); clock.advance(1200);
        assert.equal(panel.style.preTransformScale2d, undefined);
        g.QOL.ui.customize.start(null, { elementId: id });
        const pending = env.em.FindChildTraverse("QOLCustomize_" + key);
        pending.text = "151";
        g.QOL.core.storageBridge.saveSettings = (_cfg, callback) => callback(null);
        env.em.FindChildTraverse("QOLCustomizeApply")._fire("onactivate"); clock.advance(1200);
        const imported = g.QOL.ui.modal.tryApplyImportStringWithDiagnostics(g.QOL.ui.configTab.getCurrentExportSettingsString());
        assert.equal(imported.ok, true);
        assert.equal(imported.candidateConfig[key], 151);
        env.hud.sandbox.global.QOL.core.FeatureRegistry.disable("ql_presentation_scale");
        assert.equal(panel.style.preTransformScale2d, undefined);
        assert.deepEqual(env.doc.eventErrors, []);
        assert.deepEqual(clock.errors, []);
    });
}

test("native HP scale leaves descendants' layout and animations under their existing owners", () => {
    const env = load();
    const q = env.hud.sandbox.global.QOL;
    const panel = env.doc.create("Panel", { id: "health_and_abilities_container" });
    const bar = panel.addChild(env.doc.create("Panel", { id: "health_bar" }));
    const numbers = panel.addChild(env.doc.create("Panel", { id: "current_health" }));
    bar.style.transform = "rotateZ(-9deg)";
    numbers.style.preTransformScale2d = "1.08";
    q.healthbar.applyPlayerStyleToPanel(panel, q.healthbar.buildPlayerHealthbarStyleState({ PLAYER_HEALTHBAR_SCALE: 200 }, false, false));
    assert.equal(panel.style.preTransformScale2d, "2");
    assert.equal(panel.style.uiScale, undefined);
    assert.equal(bar.style.transform, "rotateZ(-9deg)");
    assert.equal(numbers.style.preTransformScale2d, "1.08");
    q.healthbar.resetPlayerStyle(panel);
    assert.equal(panel.style.preTransformScale2d, undefined);
});

"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const load = require("./load_settings_environment");

test("every opacity uses one-percent precision and preserves 73 percent across the full sharing path", () => {
    const { global: g } = load(); const cfg = { ...g.MOD_CONFIG };
    const fields = g.QOL.settingsFields.filter(f => f.role === "opacity");
    assert.ok(fields.length > 20);
    for (const field of fields) {
        assert.equal(field.min, 0, field.key); assert.equal(field.max, 1, field.key); assert.equal(field.step, .01, field.key);
        assert.equal(g.QOL.settings.normalize(field.key, .73), .73, field.key); cfg[field.key] = .73;
    }
    const decoded = g.QOL.persistence.deserializeSettings(g.QOL.persistence.serializeSettings(cfg));
    const imported = g.QOL.ui.modal.tryApplyImportStringWithDiagnostics(g.QOL.ui.configTab.getCurrentExportSettingsString(cfg));
    assert.equal(imported.ok, true);
    for (const field of fields) {
        assert.equal(decoded[field.key], .73, field.key);
        assert.equal(imported.candidateConfig[field.key], .73, field.key);
    }
});

test("overall scale and axis scale have explicit percentage conversion and one-percent precision", () => {
    const env = load(), g = env.global;
    for (const element of g.QOL.presentation.elements) {
        for (const f of element.fields) {
            const field = g.QOL.settings.get(f.key);
            if (f.label !== "Scale" && field.role !== "axisScale") continue;
            assert.equal(field.unit, "%", field.key);
            assert.equal(field.step * field.displayFactor, 1, field.key);
            assert.equal(field.min * field.displayFactor, 50, field.key);
            assert.equal(field.max * field.displayFactor, 300, field.key);
            assert.equal(g.QOL.settings.toDisplayValue(field.key, 100 / field.displayFactor) * field.displayFactor, 100, field.key);
        }
    }
    g.QOL.ui.window.setOpen(true); env.clock.advance(500);
    g.QOL.ui.customize.start(null, { elementId: "compass" });
    for (const key of ["COMPASS_STRETCH_X", "COMPASS_STRETCH_Y"]) {
        const input = env.em.FindChildTraverse("QOLCustomize_" + key); assert.equal(input.text, "100");
        input.text = "123"; input._fire("oninputsubmit");
    }
    env.em.FindChildTraverse("QOLCustomizeApply")._fire("onactivate");
    assert.equal(g.MOD_CONFIG.COMPASS_STRETCH_X, 123); assert.equal(g.MOD_CONFIG.COMPASS_STRETCH_Y, 123);
});

test("ordinary numeric blur, wheel and row refresh preserve exact accepted values outside slider travel", () => {
    const { global: g, list, clock } = load();
    const row = g.CreateSliderRow(list, "X", "SOULS_X_OFFSET", "offset_n1500_1500");
    const input = row.FindChildrenWithClassTraverse("ValueInput")[0];
    input.text = "9000"; input._fire("onblur"); clock.advance(1200);
    assert.equal(g.MOD_CONFIG.SOULS_X_OFFSET, 9000); assert.equal(input.text, "9000");
    assert.equal(input._events.get("onmousewheel")(1), true); clock.advance(1200);
    assert.equal(g.MOD_CONFIG.SOULS_X_OFFSET, 9001); assert.equal(input.text, "9001");
});

test("all relative scales retain the common upper boundary in both exchange formats", () => {
    const { global: g } = load(), cfg = { ...g.MOD_CONFIG };
    const fields = g.QOL.settingsFields.filter(field => ["scale", "axisScale", "fontScale"].includes(field.role));
    for (const field of fields) cfg[field.key] = 300 / field.displayFactor;
    const imported = g.QOL.ui.modal.tryApplyImportStringWithDiagnostics(g.QOL.ui.configTab.getCurrentExportSettingsString(cfg));
    assert.equal(imported.ok, true); assert.equal(imported.source, "json");
    const compact = g.QOL.persistence.deserializeSettings(g.QOL.persistence.serializeSettingsCode(cfg));
    for (const field of fields) {
        assert.equal(imported.candidateConfig[field.key], cfg[field.key], field.key);
        assert.equal(compact[field.key], cfg[field.key], field.key);
    }
});

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const loadSettingsEnvironment = require("./load_settings_environment");

test("removed icon scale has no UI or runtime owner while 4.0.1 presets remain readable", () => {
    const { global: g, hud, list } = loadSettingsEnvironment();
    const key = "MINIMAP_ICON_SCALE";
    assert.equal(Object.hasOwn(g.MOD_CONFIG, key), false);
    const manifest = hud.sandbox.global.QOL.core.FeatureRegistry.getManifest("ql_minimap_runtime");
    assert.equal(manifest.settings.some(field => field.key === key), false);
    g.QOL.ui.gameplayTabs.renderMinimapTab(list);
    assert.equal(list.Children().some(p => p.GetAttributeString("QOL_ROW_RESET_KEYS", "") === key), false);
    const schema = g.QOL_COMPACT_SCHEMA_UTILS.GetSchema("4.0.1");
    const config = { ...g.MOD_CONFIG, [key]: 0.8, MINIMAP_SMALL_SIZE: 650 };
    const code = "[QOL-4-0-1]:" + g.QOL_CODEC.ToBase64Url(g.QOL_CODEC.SerializeCompactBinary(config, schema, 2));
    const result = g.QOL.ui.modal.tryApplyImportStringWithDiagnostics(code);
    assert.equal(result.ok, true);
    assert.equal(result.candidateConfig.MINIMAP_SMALL_SIZE, 650);
    assert.equal(result.candidateConfig.MINIMAP_FIXED_ICON_SIZE, 0);
    const current = g.QOL_COMPACT_SCHEMA_UTILS.GetSchema(g.QOL_SCHEMA_SEMVER);
    assert.equal(current.some(field => field.key === key), false);
});

test("fixed icon size changes Base/Alt/Tab geometry and survives export/import", () => {
    const { global: g, hud, doc, clock, list } = loadSettingsEnvironment();
    const map = doc.create("Panel", { id: "minimap_persp" });
    hud.root.addChild(map);
    // The captured HUD hierarchy has fixed-size inner containers in QOL CSS.
    const inner = [];
    let parent = map;
    for (const id of ["minimap_container", "HudMinimapContainer", "hud_minimap"]) {
        const panel = doc.create("Panel", { id });
        parent.addChild(panel);
        inner.push(panel);
        parent = panel;
    }
    const frame = doc.create("Panel", { id: "minimap_frame" });
    inner[0].addChild(frame);
    inner.push(frame);
    const update = values => {
        Object.assign(g.MOD_CONFIG, values);
        g.SaveAndSync();
        clock.advance(1200);
    };
    const geometry = (size, scale) => {
        assert.equal(map.style.width, size);
        assert.equal(map.style.height, size);
        assert.equal(map.style.uiScale, scale);
        for (const panel of inner) {
            const expected = g.MOD_CONFIG.MINIMAP_FIXED_ICON_SIZE === 1 ? size : undefined;
            assert.equal(panel.style.width, expected, panel.id + " width");
            assert.equal(panel.style.height, expected, panel.id + " height");
        }
    };
    update({ MINIMAP_SMALL_SIZE: 650, MINIMAP_LARGE_SIZE_ALT: 800, MINIMAP_LARGE_SIZE_TAB: 1000,
        ENABLE_ALT_ZOOM: 1, ENABLE_TAB_ZOOM: 1 });
    geometry("400px", "163%");
    update({ MINIMAP_FIXED_ICON_SIZE: 1 });
    geometry("650px", "100%");
    hud.root.AddClass("gDetailView");
    clock.advance(600);
    geometry("800px", "100%");
    hud.root.RemoveClass("gDetailView");
    hud.root.AddClass("gScoreboardOpen");
    clock.advance(600);
    geometry("1000px", "100%");
    const exported = g.QOL.ui.configTab.getCurrentExportSettingsString();
    const imported = g.QOL.ui.modal.tryApplyImportStringWithDiagnostics(exported);
    assert.equal(imported.ok, true);
    assert.equal(imported.candidateConfig.MINIMAP_FIXED_ICON_SIZE, 1);
    update({ MINIMAP_FIXED_ICON_SIZE: 0 });
    geometry("400px", "250%");
    hud.root.RemoveClass("gScoreboardOpen");
    clock.advance(600);
    geometry("400px", "163%");
    for (const [language, caption] of [[0, "Fixed Icon Size"], [1, "Фиксированный размер иконок"], [13, "Fixed Icon Size"]]) {
        list.RemoveAndDeleteChildren();
        g.MOD_CONFIG.LANGUAGE = language;
        g.QOL.ui.gameplayTabs.renderMinimapTab(list);
        const row = list.Children().find(p => p.GetAttributeString("QOL_ROW_RESET_KEYS", "") === "MINIMAP_SMALL_SIZE,MINIMAP_FIXED_ICON_SIZE");
        assert.ok(row);
        const checkbox = row.FindChildrenWithClassTraverse("SectionTitleCheckboxToggle")[0];
        assert.ok(checkbox.GetParent().BHasClass("SliderValueGroup"));
        assert.equal(checkbox.GetParent().Children().at(-1), checkbox, "checkbox sits after the size input");
        assert.equal(checkbox.FindChildrenWithClassTraverse("SectionTitleCheckboxLabel")[0].text, caption);
        checkbox._fire("onactivate");
        clock.advance(1200);
        assert.equal(g.MOD_CONFIG.MINIMAP_FIXED_ICON_SIZE, 1);
        geometry("650px", "100%");
        row.FindChildrenWithClassTraverse("SettingRowResetBtn")[0]._fire("onactivate");
        clock.advance(1200);
        assert.equal(g.MOD_CONFIG.MINIMAP_FIXED_ICON_SIZE, 0);
        assert.equal(g.MOD_CONFIG.MINIMAP_SMALL_SIZE, 400);
        assert.equal(checkbox.BHasClass("selected"), false);
        update({ MINIMAP_SMALL_SIZE: 650 });
    }
    assert.deepEqual(clock.errors, []);
    assert.deepEqual(doc.eventErrors, []);
});

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const loadSettingsEnvironment = require("./load_settings_environment");

for (const method of ["drag", "type"]) {
    for (const [key, feature, shape, rawValues, expectedValues] of [
        ["TOP_BAR_SCALE", "ql_topbar", "scale_0_5_1_5", [1.23, -9, 9], [1.25, 0.5, 1.5]],
        ["SOULS_X_OFFSET", "ql_souls", "offset_n1500_1500", [123, -9000, 9000], [125, -1500, 1500]],
    ]) {
        test(`settings ${method} ${key}: live values survive real export/import including bounds`, () => {
            const env = loadSettingsEnvironment();
            const { global: g, list, clock, doc, hud } = env;
            const row = g.CreateSliderRow(list, key, key, shape);
            const slider = row.FindChildrenWithClassTraverse("HorizontalSlider")[0];
            const input = row.FindChildrenWithClassTraverse("ValueInput")[0];
            assert.ok(slider && input);
            for (let i = 0; i < rawValues.length; i++) {
                if (method === "drag") {
                    slider.value = rawValues[i] * (key === "TOP_BAR_SCALE" ? 100 : 1);
                    assert.equal(slider._fire("onvaluechanged"), true);
                } else {
                    input.text = String(rawValues[i]);
                    assert.equal(input._fire("oninputsubmit"), true);
                }
                clock.advance(1200);
                const expected = expectedValues[i];
                assert.equal(g.MOD_CONFIG[key], expected, "UI commits a wire-representable value");
                assert.equal(hud.sandbox.global.QOL.core.ConfigStore.get(feature, key), expected);
                assert.equal(hud.sandbox.global.State.lastConfig[key], expected);
                const code = g.QOL.ui.configTab.getCurrentExportSettingsString();
                const result = g.QOL.ui.modal.tryApplyImportStringWithDiagnostics(code);
                assert.equal(result.ok, true);
                assert.equal(result.candidateConfig[key], expected, "preview matches live setting");
                g.MOD_CONFIG[key] = -9999;
                g.QOL.persistence.applyParsedConfigWithDiagnostics(result.parsedConfig, result.schemaVersion);
                g.SaveAndSync();
                clock.advance(1200);
                assert.equal(g.MOD_CONFIG[key], expected, "confirmed import restores exact value");
                assert.equal(hud.sandbox.global.QOL.core.ConfigStore.get(feature, key), expected);
            }
            assert.deepEqual(doc.eventErrors, []);
            assert.deepEqual(clock.errors, []);
        });
    }
}

test("typed invalid slider input preserves current settings", () => {
    const { global: g, list, doc } = loadSettingsEnvironment();
    const row = g.CreateSliderRow(list, "Scale", "TOP_BAR_SCALE", "scale_0_5_1_5");
    const input = row.FindChildrenWithClassTraverse("ValueInput")[0];
    const before = g.MOD_CONFIG.TOP_BAR_SCALE;
    for (const value of ["", "not a number", "Infinity"]) {
        input.text = value;
        assert.equal(input._fire("oninputsubmit"), true);
        assert.equal(g.MOD_CONFIG.TOP_BAR_SCALE, before);
    }
    assert.deepEqual(doc.eventErrors, []);
});

test("typed settings edit invalidates HUD startup restore before the save debounce", async () => {
    const { global: g, list, hud, clock, doc } = loadSettingsEnvironment();
    const hudGlobal = hud.sandbox.global;
    const bridge = hudGlobal.QOL.core.storageBridge;
    const panel = bridge.getPanel();
    assert.ok(panel);
    // Only the CEF transport is simulated: production request creation,
    // response handling, dirty marking and cross-isolate persistence run.
    let requestUrl = "";
    panel.SetURL = (url) => { requestUrl = url; };
    bridge.enableAutoload(true);
    bridge._onHtmlTitle(panel, "QOL_BRIDGE_READY:frag1");
    assert.ok(requestUrl.startsWith("https://predi-i.github.io/qollock-updates/bridge.html#"));
    const request = JSON.parse(decodeURIComponent(requestUrl.slice(requestUrl.indexOf("#") + 1)));
    assert.equal(request.f, "load");
    const requestId = request.a[1];
    assert.match(requestId, /^qol_\d+_\d+$/, "startup load is actually pending");
    const rawBefore = hud.root.GetAttributeString("Deadlock_Mod_Settings_v1", "");
    const stampBefore = hudGlobal.QOL.core.persistence.getConfigChangeStamp(hud.root);

    const row = g.CreateSliderRow(list, "Scale", "TOP_BAR_SCALE", "scale_0_5_1_5");
    const input = row.FindChildrenWithClassTraverse("ValueInput")[0];
    input.text = "1.23";
    assert.equal(input._fire("oninputsubmit"), true);
    assert.equal(g.MOD_CONFIG.TOP_BAR_SCALE, 1.25);
    assert.notEqual(hudGlobal.QOL.core.persistence.getConfigChangeStamp(hud.root), stampBefore,
        "real MarkConfigDirty publishes an edit stamp visible in the HUD isolate immediately");
    assert.equal(hud.root.GetAttributeString("Deadlock_Mod_Settings_v1", ""), rawBefore,
        "SaveAndSync has not run yet");

    bridge._onHtmlTitle(panel, "QOL_RES:" + JSON.stringify({
        id: requestId, ok: true,
        data: hudGlobal.WrapConfigForStorage({ TOP_BAR_SCALE: 0.5 }),
    }));
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(hud.root.GetAttributeString("Deadlock_Mod_Settings_v1", ""), rawBefore,
        "late startup response must not publish stale settings during debounce");
    clock.advance(299);
    assert.equal(hud.root.GetAttributeString("Deadlock_Mod_Settings_v1", ""), rawBefore);
    assert.equal(g.MOD_CONFIG.TOP_BAR_SCALE, 1.25);
    clock.advance(901);
    assert.equal(hudGlobal.QOL.core.ConfigStore.get("ql_topbar", "TOP_BAR_SCALE"), 1.25);
    assert.equal(JSON.parse(hud.root.GetAttributeString("Deadlock_Mod_Settings_v1", "")).data.TOP_BAR_SCALE, 1.25);
    assert.deepEqual(doc.eventErrors, []);
    assert.deepEqual(clock.errors, []);
});

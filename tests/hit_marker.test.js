// tests/hit_marker.test.js
// =============================================================================
// Custom Hit Marker: ql_hit_marker manifest, the generated block in element_gun.css,
// compact schema fields and the Crosshair tab sliders. The simulator cannot show how
// Panorama renders the rules; it only proves the classes, rules and persistence
// agree with each other.
// =============================================================================

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createHud } = require("../scripts/simulator");
const loadSettingsEnvironment = require("./load_settings_environment");
const generator = require("../scripts/generate_hit_marker_css.js");

const ROOT = path.join(__dirname, "..");
const GUN_CSS = fs.readFileSync(generator.TARGET, "utf8");
const BLOCK = GUN_CSS.slice(GUN_CSS.indexOf(generator.BEGIN), GUN_CSS.indexOf(generator.END) + generator.END.length);
const MANIFEST_SOURCE = fs.readFileSync(path.join(ROOT, "panorama", "scripts", "manifests", "ql_hit_marker", "manifest.js"), "utf8");

const RANGE_KEYS = {
    CUSTOM_HITMARKER_SIZE: generator.RANGES.length,
    CUSTOM_HITMARKER_CRIT_SIZE: generator.RANGES.length,
    CUSTOM_HITMARKER_THICKNESS: generator.RANGES.thickness,
    CUSTOM_HITMARKER_OFFSET: generator.RANGES.offset
};

function hitMarkerClasses(root) {
    return String(root.GetClasses()).split(" ").filter((c) => c === "qol-hm" || c.indexOf("qol-hm-") === 0).sort();
}

function createHitMarkerHud() {
    const hud = createHud({ inHideout: false });
    hud.assertLoaded();
    return hud;
}

function hasRuleFor(className) {
    return BLOCK.indexOf("." + className + " ") >= 0 || BLOCK.indexOf("." + className + ".") >= 0;
}

test("the generated block in element_gun.css matches the generator", () => {
    assert.ok(BLOCK.length > generator.BEGIN.length, "block present");
    assert.equal(generator.apply(GUN_CSS, generator.build()), GUN_CSS, "run: node scripts/generate_hit_marker_css.js");
});

test("rules live in the gun element's own stylesheet, not in a separately imported sheet", () => {
    // The repo's global stylesheet warns that !important in sheets attached higher up was dropped.
    // element_gun.css already ships !important rules of its own, so the rules belong there.
    assert.equal(fs.existsSync(path.join(ROOT, "panorama", "styles", "features", "ql_feat_hit_marker.css")), false);
    assert.equal(fs.readFileSync(path.join(ROOT, "panorama", "styles", "hud.css"), "utf8").indexOf("hit_marker"), -1);
});

test("manifest, schema, defaults and generator agree on every range and step", () => {
    const hud = createHitMarkerHud();
    const { QOL: Q } = hud.sandbox.global;
    const manifest = Q.core.FeatureRegistry.getManifest("ql_hit_marker");
    assert.ok(manifest, "ql_hit_marker is registered from hud.xml");
    const defaults = Q.buildDefaultConfig();
    const schema = hud.sandbox.global.QOL_COMPACT_SCHEMA_UTILS.GetSchema(hud.sandbox.global.QOL_SCHEMA_SEMVER);
    const schemaByKey = {};
    for (const field of schema) schemaByKey[field.key] = field;

    for (const setting of manifest.settings) {
        const field = schemaByKey[setting.key];
        assert.ok(field, setting.key + " is in the latest compact schema");
        assert.equal(defaults[setting.key], setting.type === "toggle" ? Number(setting.default) : setting.default, setting.key + " default");
        if (setting.type === "slider") {
            assert.equal(field.min, setting.min, setting.key + " schema min");
            assert.equal(field.max, setting.max, setting.key + " schema max");
            assert.equal(field.step, setting.step, setting.key + " schema step");
        }
        if (setting.type === "palette") assert.deepEqual([field.min, field.max], [0, 29], setting.key + " palette range");
    }
    for (const [key, range] of Object.entries(RANGE_KEYS)) {
        const setting = manifest.settings.find((s) => s.key === key);
        assert.equal(setting.min, range.min, key + " generator min");
        assert.equal(setting.max, range.max, key + " generator max");
        assert.equal(setting.step, range.step, key + " generator step");
        assert.equal(defaults[key], range.native, key + " default is the native hit marker value");
        assert.equal((range.native - range.min) % range.step, 0, key + " native value is on the step grid");
    }
    assert.equal(defaults.ENABLE_CUSTOM_HITMARKER, 0, "off by default");
    for (const name of ["SIZE", "CRIT_SIZE", "THICKNESS", "OFFSET"]) {
        const shape = hud.sandbox.global.QOL_COMPACT_SCHEMA_UTILS ? null : null;
        assert.equal(shape, null);
        assert.ok(MANIFEST_SOURCE.indexOf("CUSTOM_HITMARKER_" + name) >= 0);
    }
});

test("native values: enabling with untouched settings changes no style, and no rule exists for them", () => {
    const hud = createHitMarkerHud();
    const { QOL: Q } = hud.sandbox.global;
    Q.core.ConfigStore.set("ql_hit_marker", "ENABLE_CUSTOM_HITMARKER", true);
    hud.clock.advance(100);
    assert.deepEqual(hitMarkerClasses(hud.root), ["qol-hm"], "only the marker class; every value is native");
    for (const native of ["qol-hm-len-20", "qol-hm-clen-20", "qol-hm-th-2", "qol-hm-off-40", "qol-hm-col-0", "qol-hm-ccol-0"]) {
        assert.equal(hasRuleFor(native), false, "no rule restating the native value: " + native);
    }
    assert.ok(hasRuleFor("qol-hm-len-18") && hasRuleFor("qol-hm-off-38"), "neighbouring values do have rules");
});

test("enabling applies root classes, changes follow settings, disabling removes every class", () => {
    const hud = createHitMarkerHud();
    const { QOL: Q } = hud.sandbox.global;
    const store = Q.core.ConfigStore;
    assert.deepEqual(hitMarkerClasses(hud.root), [], "nothing applied while disabled");

    store.set("ql_hit_marker", "ENABLE_CUSTOM_HITMARKER", true);
    hud.clock.advance(100);
    store.set("ql_hit_marker", "CUSTOM_HITMARKER_SIZE", 12);
    store.set("ql_hit_marker", "CUSTOM_HITMARKER_CRIT_SIZE", 30);
    store.set("ql_hit_marker", "CUSTOM_HITMARKER_THICKNESS", 5);
    store.set("ql_hit_marker", "CUSTOM_HITMARKER_OFFSET", 18);
    store.set("ql_hit_marker", "CUSTOM_HITMARKER_COLOR", 4);
    store.set("ql_hit_marker", "CUSTOM_HITMARKER_CRIT_COLOR", 8);
    store.set("ql_hit_marker", "ENABLE_CUSTOM_HITMARKER_SHADOW", true);
    store.set("ql_hit_marker", "ENABLE_CUSTOM_HITMARKER_HIDE_GLOW", true);
    hud.clock.advance(100);
    assert.deepEqual(hitMarkerClasses(hud.root), [
        "qol-hm", "qol-hm-ccol-8", "qol-hm-clen-30", "qol-hm-col-4", "qol-hm-len-12",
        "qol-hm-noglow", "qol-hm-off-18", "qol-hm-shadow", "qol-hm-th-5"
    ], "old value classes are replaced, not accumulated");

    store.set("ql_hit_marker", "CUSTOM_HITMARKER_SIZE", 20);
    store.set("ql_hit_marker", "CUSTOM_HITMARKER_COLOR", 0);
    hud.clock.advance(100);
    const afterReset = hitMarkerClasses(hud.root);
    assert.equal(afterReset.indexOf("qol-hm-len-12"), -1, "returning to the native value drops its class");
    assert.equal(afterReset.indexOf("qol-hm-col-4"), -1);

    store.set("ql_hit_marker", "ENABLE_CUSTOM_HITMARKER", false);
    hud.clock.advance(100);
    assert.deepEqual(hitMarkerClasses(hud.root), [], "disable restores the native hit marker");
    assert.deepEqual(hud.clock.errors, []);
});

test("every integer a caller could send maps to a class that has a rule, or to no class", () => {
    const hud = createHitMarkerHud();
    const { QOL: Q } = hud.sandbox.global;
    const store = Q.core.ConfigStore;
    const seen = new Set();
    function record() {
        hud.clock.advance(50);
        for (const c of hitMarkerClasses(hud.root)) seen.add(c);
    }
    store.set("ql_hit_marker", "ENABLE_CUSTOM_HITMARKER_SHADOW", true);
    store.set("ql_hit_marker", "ENABLE_CUSTOM_HITMARKER_HIDE_GLOW", true);
    store.set("ql_hit_marker", "ENABLE_CUSTOM_HITMARKER", true);
    record();
    for (const [key, range] of Object.entries(RANGE_KEYS)) {
        for (let n = range.min - 2; n <= range.max + 2; n++) {
            store.set("ql_hit_marker", key, n);
            record();
        }
    }
    for (const key of ["CUSTOM_HITMARKER_COLOR", "CUSTOM_HITMARKER_CRIT_COLOR"]) {
        for (let i = -1; i <= 30; i++) {
            store.set("ql_hit_marker", key, i);
            record();
        }
    }
    assert.ok(seen.size > 100, "exercised the whole range");
    for (const name of seen) assert.ok(name === "qol-hm" || hasRuleFor(name), "stylesheet has a rule for ." + name);
    // and the reverse: no rule exists that the manifest can never switch on
    const ruleClasses = new Set((BLOCK.match(/\.qol-hm[a-z0-9-]*/g) || []).map((c) => c.slice(1)));
    for (const name of ruleClasses) assert.ok(seen.has(name), "manifest can produce ." + name);
    assert.deepEqual(hud.clock.errors, []);
});

test("out-of-range, off-grid and invalid values are clamped and snapped to a class with a rule", () => {
    const hud = createHitMarkerHud();
    const { QOL: Q } = hud.sandbox.global;
    const manifest = Q.core.FeatureRegistry.getManifest("ql_hit_marker");
    const root = hud.root;
    const feature = manifest.create({
        id: "ql_hit_marker",
        config: { all: () => ({
            ENABLE_CUSTOM_HITMARKER: 1,
            CUSTOM_HITMARKER_SIZE: 999,
            CUSTOM_HITMARKER_CRIT_SIZE: -4,
            CUSTOM_HITMARKER_THICKNESS: "banana",
            CUSTOM_HITMARKER_OFFSET: 23.6,
            CUSTOM_HITMARKER_COLOR: 77,
            CUSTOM_HITMARKER_CRIT_COLOR: -1
        }) }
    });
    feature.onEnable();
    assert.deepEqual(hitMarkerClasses(root), ["qol-hm", "qol-hm-clen-4", "qol-hm-len-40", "qol-hm-off-24"]);
    feature.onDisable();
    assert.deepEqual(hitMarkerClasses(root), []);
});

test("the manifest does no recurring work: no timers, polls or panel searches", () => {
    // Settings changes arrive through onSettingsChanged; a poll would run for the whole match.
    for (const forbidden of ["createPollLoop", "$.Schedule", "Scheduler", "FindChild", "setInterval", "setTimeout"]) {
        assert.equal(MANIFEST_SOURCE.indexOf(forbidden), -1, "manifest must not use " + forbidden);
    }
});

for (const [key, shape, rawValues, expectedValues] of [
    ["CUSTOM_HITMARKER_SIZE", "hitmarker_size_4_40", [18, -9, 99], [18, 4, 40]],
    ["CUSTOM_HITMARKER_CRIT_SIZE", "hitmarker_size_4_40", [34, -9, 99], [34, 4, 40]],
    ["CUSTOM_HITMARKER_THICKNESS", "hitmarker_thickness_1_8", [5, -9, 99], [5, 1, 8]],
    ["CUSTOM_HITMARKER_OFFSET", "hitmarker_offset_4_40", [22, -9, 99], [22, 4, 40]]
]) {
    test(`settings slider ${key}: values survive export/import including bounds`, () => {
        const env = loadSettingsEnvironment();
        const { global: g, list, clock, doc, hud } = env;
        const row = g.CreateSliderRow(list, key, key, shape);
        const input = row.FindChildrenWithClassTraverse("ValueInput")[0];
        assert.ok(input);
        for (let i = 0; i < rawValues.length; i++) {
            input.text = String(rawValues[i]);
            assert.equal(input._fire("oninputsubmit"), true);
            clock.advance(1200);
            const expected = expectedValues[i];
            assert.equal(g.MOD_CONFIG[key], expected);
            assert.equal(hud.sandbox.global.QOL.core.ConfigStore.get("ql_hit_marker", key), expected);
            const code = g.QOL.ui.configTab.getCurrentExportSettingsString();
            const result = g.QOL.ui.modal.tryApplyImportStringWithDiagnostics(code);
            assert.equal(result.ok, true);
            assert.equal(result.candidateConfig[key], expected);
            g.MOD_CONFIG[key] = -9999;
            g.QOL.persistence.applyParsedConfigWithDiagnostics(result.parsedConfig, result.schemaVersion);
            g.SaveAndSync();
            clock.advance(1200);
            assert.equal(g.MOD_CONFIG[key], expected);
        }
        assert.deepEqual(doc.eventErrors, []);
        assert.deepEqual(clock.errors, []);
    });
}

test("hit marker fields are appended after every 4.0.5 field so older exports keep their meaning", () => {
    const hud = createHitMarkerHud();
    const utils = hud.sandbox.global.QOL_COMPACT_SCHEMA_UTILS;
    const previous = utils.GetSchema("4.0.5");
    const latest = utils.GetSchema("4.0.6");
    // The schemas come from the simulator's script realm; compare plain JSON copies.
    const plain = (value) => JSON.parse(JSON.stringify(value));
    assert.deepEqual(plain(latest.slice(0, previous.length)), plain(previous));
    assert.deepEqual(plain(latest.slice(previous.length).map((f) => f.key)), [
        "ENABLE_CUSTOM_HITMARKER", "ENABLE_CUSTOM_HITMARKER_SHADOW", "ENABLE_CUSTOM_HITMARKER_HIDE_GLOW",
        "CUSTOM_HITMARKER_SIZE", "CUSTOM_HITMARKER_CRIT_SIZE", "CUSTOM_HITMARKER_THICKNESS",
        "CUSTOM_HITMARKER_OFFSET", "CUSTOM_HITMARKER_COLOR", "CUSTOM_HITMARKER_CRIT_COLOR"
    ]);
});

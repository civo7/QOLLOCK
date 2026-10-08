"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createHud } = require("../scripts/simulator");

test("every shipped manifest declares persisted settings through the shared catalog", () => {
    const hud = createHud({ boot: false, inHideout: false });
    const declarations = [];
    let registry = null;
    // Observe the actual XML include graph before registration resolves defaults.
    // This also covers computed declarations and nested multitoggle options.
    for (const script of hud.scripts.scripts) {
        const current = hud.sandbox.global.QOL?.core?.FeatureRegistry;
        if (current && typeof current.register === "function" && typeof current.getRegisteredIds === "function" && !registry) {
            registry = current;
            const register = registry.register;
            registry.register = manifest => {
                declarations.push(manifest);
                return register(manifest);
            };
        }
        hud.sandbox.load(script.absPath);
    }
    hud.assertLoaded();
    const defaults = hud.sandbox.global.QOL_DEFAULT_CONFIG;
    const fields = new Map(hud.sandbox.global.QOL.settingsFields.map(field => [field.key, field]));
    assert.deepEqual(declarations.map(manifest => manifest.id), Array.from(registry.getRegisteredIds()));
    assert.ok(declarations.length >= 49);
    const observed = new Set();
    for (const manifest of declarations) {
        for (const setting of manifest.settings || []) {
            const entries = setting.type === "multitoggle" ? setting.options : [setting];
            for (const entry of entries) {
                if (!Object.prototype.hasOwnProperty.call(defaults, entry.key)) continue;
                observed.add(entry.key);
                const name = `${manifest.id}.${entry.key}`;
                assert.equal(Object.prototype.hasOwnProperty.call(entry, "default"), false, `${name} repeats the persisted default`);
                if (fields.has(entry.key) && ["number", "slider"].includes(entry.type)) {
                    for (const key of ["min", "max", "step", "decimals"]) {
                        assert.equal(Object.prototype.hasOwnProperty.call(entry, key), false, `${name} repeats ${key}`);
                    }
                }
                const expected = entry.type === "toggle" || setting.type === "multitoggle" ? !!defaults[entry.key] : defaults[entry.key];
                const registered = registry.getManifest(manifest.id).settings.find(field => field.key === setting.key);
                const definition = setting.type === "multitoggle" ? registered.options.find(option => option.key === entry.key) : registered;
                assert.equal(definition.default, expected, `${name} registered default`);
                assert.equal(hud.sandbox.global.QOL.core.ConfigStore.get(manifest.id, entry.key), expected, `${name} initial value`);
            }
        }
    }
    assert.ok(observed.size >= 300, "the check covers the current persisted feature graph");
});

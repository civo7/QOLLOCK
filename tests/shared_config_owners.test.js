"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createHud } = require("../scripts/simulator");

function setup() {
    const env = createHud({ inHideout: false });
    env.assertLoaded();
    const Q = env.sandbox.global.QOL;
    const defaults = env.sandbox.global.QOL_DEFAULT_CONFIG;
    const owners = new Map();
    for (const id of Q.core.FeatureRegistry.getRegisteredIds()) {
        const manifest = Q.core.FeatureRegistry.getManifest(id);
        for (const setting of manifest.settings || []) {
            const fields = setting.type === "multitoggle" ? (setting.options || []).map(option => ({ ...option, type: "toggle" })) : [setting];
            for (const field of fields) {
                if (!Object.prototype.hasOwnProperty.call(defaults, field.key)) continue;
                if (!owners.has(field.key)) owners.set(field.key, []);
                owners.get(field.key).push({ id, field });
            }
        }
    }
    return { ...env, Q, defaults, owners, store: Q.core.ConfigStore, adapter: Q.core.ConfigAdapter };
}

test("setting minimap size directly updates its renderer, timers and flat export together", () => {
    const { store, adapter } = setup();
    assert.equal(store.set("ql_minimap_runtime", "MINIMAP_SMALL_SIZE", 650), true);
    assert.equal(store.get("ql_minimap_runtime", "MINIMAP_SMALL_SIZE"), 650);
    assert.equal(store.get("ql_minimap_timers", "MINIMAP_SMALL_SIZE"), 650);
    assert.equal(adapter.exportToFlat().MINIMAP_SMALL_SIZE, 650);
});

test("Basic cooldown settings reach all four current observers from any declared owner", () => {
    const { store, adapter, owners } = setup();
    const key = "ENABLE_PASSIVE_COOLDOWN";
    const group = owners.get(key);
    assert.deepEqual(group.map(owner => owner.id), ["ql_passive_cooldown", "ql_sigflash", "ql_legacy_audio_passive", "ql_item_mirror"]);
    assert.equal(store.set("ql_sigflash", key, true), true);
    for (const { id } of group) assert.equal(store.get(id, key), true, id);
    assert.equal(adapter.exportToFlat()[key], 1);
    assert.equal(store.set("ql_item_mirror", key, false), true);
    for (const { id } of group) assert.equal(store.get(id, key), false, id);
    assert.equal(adapter.exportToFlat()[key], 0);
});

test("all shared approved keys publish one accepted value before any owner receives its event", () => {
    const { Q, store, adapter, owners } = setup();
    const shared = [...owners].filter(([, group]) => group.length > 1);
    assert.equal(shared.length, 26, "inventory comes from the actual registered HUD manifests");
    for (const [key, group] of shared) {
        const field = group[0].field;
        const previous = store.get(group[0].id, key);
        const next = field.type === "toggle" ? !previous : previous + field.step <= field.max ? previous + field.step : previous - field.step;
        const delivered = [];
        const observe = payload => {
            if (!(payload.changes ? Object.prototype.hasOwnProperty.call(payload.changes, key) : payload.key === key)) return;
            // EventBus catches subscriber errors. Capture observations here and
            // assert outside the handler so an assertion cannot be swallowed.
            delivered.push({ id: payload.featureId, values: group.map(owner => [owner.id, store.get(owner.id, key)]) });
        };
        Q.core.EventBus.on("config:changed", observe);
        assert.equal(store.set(group[0].id, key, next), true, key);
        Q.core.EventBus.off("config:changed", observe);
        for (const { id } of group) assert.equal(store.get(id, key), next, key + " " + id);
        assert.deepEqual(delivered.map(event => event.id).sort(), group.map(owner => owner.id).sort(), "one event per changed owner: " + key);
        for (const event of delivered) for (const [id, value] of event.values) {
            assert.equal(value, next, key + " observed from " + event.id + " at " + id);
        }
        assert.equal(adapter.exportToFlat()[key], field.type === "toggle" ? (next ? 1 : 0) : next, key + " exported value");
    }
});

test("invalid shared numeric input leaves every owner unchanged and produces no config event", () => {
    const { Q, store, owners } = setup();
    const key = "MINIMAP_SMALL_SIZE", group = owners.get(key);
    assert.equal(store.set("ql_minimap_runtime", key, 650), true);
    let events = 0;
    const observe = () => { events++; };
    Q.core.EventBus.on("config:changed", observe);
    for (const value of [1500, 50, NaN, Infinity, "700"]) assert.equal(store.set("ql_minimap_runtime", key, value), false);
    Q.core.EventBus.off("config:changed", observe);
    for (const { id } of group) assert.equal(store.get(id, key), 650, id);
    assert.equal(events, 0);
});

test("synthetic enable state and undeclared feature-local keys never fan out", () => {
    const { Q, store } = setup();
    const before = store.get("ql_minimap_timers", "enabled");
    assert.equal(store.set("ql_minimap_runtime", "enabled", false), true);
    assert.equal(store.get("ql_minimap_runtime", "enabled"), false);
    assert.equal(store.get("ql_minimap_timers", "enabled"), before);
    assert.equal(Q.core.FeatureRegistry.register({ id: "ql_shared_config_local_a", settings: [{ key: "LOCAL_ONLY", type: "number", default: 1 }],
        create() { return { onEnable() {} }; } }), true);
    assert.equal(Q.core.FeatureRegistry.register({ id: "ql_shared_config_local_b", settings: [{ key: "LOCAL_ONLY", type: "number", default: 2 }],
        create() { return { onEnable() {} }; } }), true);
    assert.equal(store.set("ql_shared_config_local_a", "LOCAL_ONLY", 3), true);
    assert.equal(store.get("ql_shared_config_local_a", "LOCAL_ONLY"), 3);
    assert.equal(store.get("ql_shared_config_local_b", "LOCAL_ONLY"), 2);
});

test("shared batch conflicts are rejected for all observers while other valid settings commit", () => {
    const { Q, store, adapter } = setup();
    store.set("ql_minimap_runtime", "MINIMAP_SMALL_SIZE", 650);
    const observations = [];
    Q.core.EventBus.on("config:changed", payload => observations.push(payload));
    store.load({ ql_minimap_runtime: { MINIMAP_SMALL_SIZE: 700 }, ql_minimap_timers: { MINIMAP_SMALL_SIZE: 800 },
        ql_passive_cooldown: { ENABLE_PASSIVE_COOLDOWN: true } });
    for (const id of ["ql_minimap_runtime", "ql_minimap_timers"]) assert.equal(store.get(id, "MINIMAP_SMALL_SIZE"), 650);
    assert.equal(adapter.exportToFlat().MINIMAP_SMALL_SIZE, 650);
    assert.equal(adapter.exportToFlat().ENABLE_PASSIVE_COOLDOWN, 1);
    assert.equal(observations.some(payload => Object.prototype.hasOwnProperty.call(payload.changes, "MINIMAP_SMALL_SIZE")), false);
    store.syncFromExternal({ ql_minimap_runtime: { MINIMAP_SMALL_SIZE: 750 }, ql_minimap_timers: { MINIMAP_SMALL_SIZE: Infinity } });
    assert.equal(adapter.exportToFlat().MINIMAP_SMALL_SIZE, 650, "an invalid observer value rejects the same shared key atomically");
    store.syncFromExternal({ ql_minimap_timers: { MINIMAP_SMALL_SIZE: 725 } });
    assert.equal(adapter.exportToFlat().MINIMAP_SMALL_SIZE, 725);
    assert.equal(store.get("ql_minimap_runtime", "MINIMAP_SMALL_SIZE"), 725);
});

test("late subscribers start from the current shared value and incompatible declarations leave no partial owner", () => {
    const { Q, store } = setup();
    store.set("ql_minimap_runtime", "MINIMAP_SMALL_SIZE", 650);
    const registry = Q.core.FeatureRegistry;
    assert.equal(registry.register({ id: "ql_late_shared_observer", settings: [
        { key: "MINIMAP_SMALL_SIZE", type: "number", default: 400 }
    ], create() { return { onEnable() {}, onDisable() {} }; } }), true);
    assert.equal(store.get("ql_late_shared_observer", "MINIMAP_SMALL_SIZE"), 650);
    assert.equal(registry.getManifest("ql_late_shared_observer").settings[0].type, "slider");
    assert.equal(registry.register({ id: "ql_incompatible_shared_observer", settings: [
        { key: "MINIMAP_SMALL_SIZE", type: "toggle", default: false }
    ], create() { return { onEnable() {}, onDisable() {} }; } }), false);
    assert.equal(store.hasSchema("ql_incompatible_shared_observer"), false);
    assert.equal(registry.isRegistered("ql_incompatible_shared_observer"), false);
    store.set("ql_late_shared_observer", "MINIMAP_SMALL_SIZE", 700);
    for (const id of ["ql_minimap_runtime", "ql_minimap_timers"]) assert.equal(store.get(id, "MINIMAP_SMALL_SIZE"), 700);
});

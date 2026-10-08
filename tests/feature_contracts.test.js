"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const sim = require("../scripts/simulator");

function setup() {
    const hud = sim.createHud({ inHideout: false });
    hud.assertLoaded();
    const { QOL: Q } = hud.sandbox.global;
    return { hud, Q, store: Q.core.ConfigStore, registry: Q.core.FeatureRegistry, bus: Q.core.EventBus };
}

test("every active manifest shares persisted defaults and slider metadata", () => {
    const { hud, Q, store, registry } = setup();
    const defaults = hud.sandbox.global.QOL_DEFAULT_CONFIG;
    const fields = new Map(Q.settingsFields.map(field => [field.key, field]));
    assert.ok(registry.getRegisteredIds().length >= 49);
    for (const id of registry.getRegisteredIds()) {
        for (const setting of registry.getManifest(id).settings) {
            if (Object.prototype.hasOwnProperty.call(defaults, setting.key)) {
                const expected = setting.type === "toggle" ? defaults[setting.key] === 1 || defaults[setting.key] === true : defaults[setting.key];
                assert.equal(setting.default, expected, `${id}.${setting.key} default`);
                assert.equal(store.get(id, setting.key), expected, `${id}.${setting.key} initial bucket`);
            }
            if (setting.type === "slider" && fields.has(setting.key)) {
                for (const property of ["min", "max", "step"]) assert.equal(setting[property], fields.get(setting.key)[property], `${id}.${setting.key}.${property}`);
            }
            if (setting.type === "multitoggle") for (const option of setting.options) {
                if (Object.prototype.hasOwnProperty.call(defaults, option.key)) assert.equal(store.get(id, option.key), !!defaults[option.key], `${id}.${option.key}`);
            }
        }
    }
});

test("flat loads publish complete owner buckets once and preserve their input", () => {
    const { Q, store, registry } = setup();
    const observations = [];
    for (const id of ["contract_first", "contract_second"]) registry.register({
        id, enabledByDefault: true,
        settings: [{ key: id + "_X", type: "number", default: 0 }, { key: id + "_Y", type: "number", default: 0 }],
        create() { return { onEnable() {}, onDisable() {}, onSettingsChanged(payload) {
            observations.push({ id, keys: Object.keys(payload.changes), first: store.get("contract_first", "contract_first_X"), second: store.get("contract_second", "contract_second_Y") });
        } }; }
    });
    registry.enable("contract_first"); registry.enable("contract_second");
    const flat = { contract_first_X: 30, contract_first_Y: 40, contract_second_X: 50, contract_second_Y: 60, ENABLE_MIN_SOULS: 1, DEFAULT_HERO: "retired" };
    const original = { ...flat };
    Q.core.ConfigAdapter.loadFromFlat(flat);
    assert.deepEqual(flat, original);
    assert.equal(observations.length, 2);
    for (const observation of observations) {
        assert.equal(observation.first, 30); assert.equal(observation.second, 60);
        assert.equal(observation.keys.length, 2);
    }
    Q.core.ConfigAdapter.loadFromFlat(flat);
    assert.equal(observations.length, 2, "unchanged values do not re-run owners");
});

test("batch enable changes are honored even when not the first changed key", () => {
    const { store, registry } = setup();
    let enabled = 0, disabled = 0;
    registry.register({ id: "contract_enable", enableKey: "CONTRACT_ENABLED", settings: [
        { key: "CONTRACT_X", type: "number", default: 0 }, { key: "CONTRACT_ENABLED", type: "toggle", default: false }
    ], create() { return { onEnable() { enabled++; }, onDisable() { disabled++; } }; } });
    store.load({ contract_enable: { CONTRACT_X: 5, CONTRACT_ENABLED: 1 } });
    assert.equal(enabled, 1); assert.equal(registry.isEnabled("contract_enable"), true);
    store.load({ contract_enable: { CONTRACT_X: 6, CONTRACT_ENABLED: 0 } });
    assert.equal(disabled, 1); assert.equal(registry.isEnabled("contract_enable"), false);
});

test("load and set use the same finite-value and precision contract", () => {
    const { store, bus } = setup();
    assert.equal(store.registerSchema("contract_values", { settings: [
        { key: "SCALE", type: "slider", min: 0, max: 2, decimals: 1, default: 0 },
        { key: "FLAG", type: "toggle", default: false }, { key: "NUMBER", type: "number", default: 5 }
    ] }), true);
    let calls = 0;
    bus.on("config:changed", payload => { if (payload.featureId === "contract_values") calls++; });
    store.load({ contract_values: { SCALE: 1.234, FLAG: 1, NUMBER: Infinity } });
    assert.equal(store.get("contract_values", "SCALE"), 1.2);
    assert.equal(store.get("contract_values", "FLAG"), true);
    assert.equal(store.get("contract_values", "NUMBER"), 5);
    assert.equal(calls, 1);
    assert.equal(store.set("contract_values", "SCALE", 1.234), true);
    assert.equal(calls, 1);
    assert.equal(store.set("contract_values", "NUMBER", Infinity), false);
});

test("failed factories release context events and schedules before retry", () => {
    const { hud, Q, registry, bus } = setup();
    let calls = 0, attempt = 0;
    registry.register({ id: "contract_factory", create(ctx) {
        ctx.events.on("contract:signal", () => { calls++; });
        Q.core.Scheduler.scheduleOnce(() => { calls += 100; }, 0.1, ctx.id);
        if (++attempt === 1) throw new Error("partial factory");
        return { onEnable() {}, onDisable() {} };
    } });
    registry.enable("contract_factory");
    bus.emit("contract:signal"); hud.clock.advance(200);
    assert.equal(calls, 0); assert.equal(registry.isEnabled("contract_factory"), false);
    registry.enable("contract_factory");
    bus.emit("contract:signal");
    assert.equal(calls, 1);
    registry.disable("contract_factory"); hud.clock.advance(200);
    assert.equal(calls, 1);
});

test("partial enable and throwing disable release events without reviving callbacks", () => {
    const { registry, bus, store } = setup();
    let calls = 0, external = 0, failedContext;
    bus.on("contract:partial", () => { external++; });
    registry.register({ id: "contract_partial", create(ctx) {
        failedContext = ctx;
        return { onEnable() { ctx.events.on("contract:partial", () => { calls++; }); throw new Error("enable"); },
            onDisable() { ctx.events.emit("cleanup"); ctx.events.on("contract:partial", () => { calls += 10; }); throw new Error("disable"); } };
    } });
    registry.enable("contract_partial"); failedContext.events.off("contract:partial");
    assert.equal(failedContext.config.set("enabled", true), false, "a retired context cannot revive a feature through settings");
    assert.equal(store.get("contract_partial", "enabled"), false);
    bus.emit("contract:partial");
    assert.equal(calls, 0); assert.equal(external, 1);
    registry.register({ id: "contract_disable", create(ctx) {
        return { onEnable() { ctx.events.on("contract:partial", () => { calls++; }); }, onDisable() { throw new Error("disable"); } };
    } });
    registry.enable("contract_disable"); registry.disable("contract_disable"); bus.emit("contract:partial");
    assert.equal(calls, 0); assert.equal(external, 2);
});

test("a disabled event generation cannot run from an in-flight EventBus snapshot", () => {
    const { registry, bus } = setup();
    let calls = 0;
    bus.on("contract:generation", () => { registry.disable("contract_generation"); registry.enable("contract_generation"); });
    registry.register({ id: "contract_generation", create(ctx) {
        return { onEnable() { ctx.events.on("contract:generation", () => { calls++; }); }, onDisable() {} };
    } });
    registry.enable("contract_generation"); bus.emit("contract:generation");
    assert.equal(calls, 0, "retired snapshot listener is inactive; newly registered listener waits for a later emit");
});

test("invalid settings never leave a partially registered manifest", () => {
    const { registry, store } = setup();
    assert.equal(registry.register({ id: "contract_invalid", settings: [{ key: "BAD", type: "unknown", default: 0 }], create() {} }), false);
    assert.equal(registry.isRegistered("contract_invalid"), false);
    assert.equal(store.hasSchema("contract_invalid"), false);
});

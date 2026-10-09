"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createHud } = require("../scripts/simulator");

function setup() {
    const env = createHud({ inHideout: false }); env.assertLoaded();
    const { QOL: Q, $ } = env.sandbox.global;
    Q.core.App.shutdown();
    env.clock.advance(1);
    // The independent storage bridge watchdog remains outside App ownership.
    const baselinePending = env.clock.pendingCount();
    const add = id => $.CreatePanel("Panel", env.root, id);
    return { ...env, Q, $, add, P: Q.core.panel, baselinePending };
}

test("native style ownership preserves unowned properties and native classes and caches normalized readback", () => {
    const env = setup(), panel = env.add("NativeSource");
    Object.assign(panel.style, { opacity: "0.4", transform: "translateX(3px)" }); panel.AddClass("native_feedback");
    const scope = env.P.createNativeStyleOwner({ resetValues: { x: "0px", washColor: "transparent" } });
    assert.equal(scope.apply(panel, {}), true); assert.equal(scope.clear(), true);
    assert.equal(panel.style.opacity, "0.4");
    let writes = 0;
    panel.style = new Proxy(panel.style, { set(target, key, value) { writes++; target[key] = String(value).toUpperCase(); return true; } });
    assert.equal(scope.apply(panel, { x: "10px" }, { QOLTestHidden: true }), true);
    const initial = writes;
    assert.equal(scope.apply(panel, { x: "10px" }, { QOLTestHidden: true }), true);
    assert.equal(writes, initial, "native string normalization cannot trigger redundant style writes");
    panel.style.x = "20px";
    scope.apply(panel, { x: "10px" }, { QOLTestHidden: true }); assert.equal(panel.style.x, "10PX");
    assert.equal(scope.clear(), true);
    assert.equal(panel.style.x, undefined);
    assert.equal(panel.style.opacity, "0.4"); assert.equal(panel.style.transform, "translateX(3px)");
    assert.equal(panel.BHasClass("native_feedback"), true); assert.equal(panel.BHasClass("QOLTestHidden"), false);
});

test("native style ownership retries rejected writes and each failed clear without losing retired panels", () => {
    const env = setup(), old = env.add("OldNative"), current = env.add("CurrentNative");
    const scope = env.P.createNativeStyleOwner({ resetValues: { x: "0px", washColor: "transparent" } });
    let writeRejected = true, clearRejected = true, classRejected = true;
    old.style = new Proxy({}, { set(target, key, value) {
        if (writeRejected && key === "opacity") throw Error("native opacity unavailable");
        target[key] = value; return true;
    } });
    assert.equal(scope.apply(old, { x: "12px", opacity: "0.3", washColor: "#123ABC" }, { QOLTestHidden: true }), false);
    writeRejected = false;
    assert.equal(scope.apply(old, { x: "12px", opacity: "0.3", washColor: "#123ABC" }, { QOLTestHidden: true }), true);
    const clear = old.ClearPropertyFromCode.bind(old), setClass = old.SetHasClass.bind(old);
    old.ClearPropertyFromCode = property => clearRejected && property === "opacity" ? false : clear(property);
    old.SetHasClass = (name, value) => { if (classRejected && !value) throw Error("native class unavailable"); setClass(name, value); };
    assert.equal(scope.retain([current]), false);
    assert.equal(old.style.x, undefined); assert.equal(old.style.washColor, undefined);
    assert.equal(old.style.opacity, "0.3"); assert.equal(old.BHasClass("QOLTestHidden"), true);
    assert.equal(scope.apply(current, { x: "25px" }), true);
    clearRejected = classRejected = false;
    assert.equal(scope.retain([current]), true);
    assert.equal(old.style.opacity, undefined); assert.equal(old.BHasClass("QOLTestHidden"), false);
    assert.equal(current.style.x, "25px", "retired cleanup cannot release the replacement");
    scope.clear(); assert.equal(current.style.x, undefined);
});

test("native style ownership retries rejected neutral writes and same-panel removed properties", () => {
    const env = setup(), panel = env.add("NativeSource");
    const scope = env.P.createNativeStyleOwner({ resetValues: { x: "0px" } });
    scope.apply(panel, { x: "35px", opacity: "0.5" });
    let reject = true;
    panel.style = new Proxy(panel.style, { set(target, key, value) {
        if (reject && key === "x" && value === "0px") throw Error("native neutral write unavailable");
        target[key] = value; return true;
    } });
    assert.equal(scope.apply(panel, { opacity: "0.2" }), false);
    assert.equal(panel.style.x, "35px"); assert.equal(panel.style.opacity, "0.2");
    reject = false; assert.equal(scope.apply(panel, { opacity: "0.2" }), true);
    assert.equal(panel.style.x, undefined); assert.equal(panel.style.opacity, "0.2");
    panel.DeleteAsync(0); env.clock.advance(1);
    assert.equal(scope.clear(), true, "destroyed native handles cannot retain cleanup records");
});

test("native style ownership retries class application and never deletes engine-owned panels", () => {
    const env = setup(), panel = env.add("NativeSource"), scope = env.P.createNativeStyleOwner();
    const set = panel.SetHasClass.bind(panel); let reject = true;
    panel.SetHasClass = (name, value) => { if (reject) throw Error("class unavailable"); set(name, value); };
    assert.equal(scope.apply(panel, {}, { QOLTestHidden: true }), false);
    reject = false; assert.equal(scope.apply(panel, {}, { QOLTestHidden: true }), true);
    assert.equal(panel.BHasClass("QOLTestHidden"), true);
    assert.equal(scope.clear(), true); env.clock.advance(1); assert.equal(panel.IsValid(), true);
});

test("native style retirement survives controller disposal and cannot clear a new owner's property lease", () => {
    const env = setup(), panel = env.add("NativeSource"); env.clock.advance(1);
    const first = env.P.createNativeStyleOwner({ resetValues: { x: "0px" } });
    first.apply(panel, { x: "35px", opacity: "0.2" }, { QOLTestHidden: true });
    const clear = panel.ClearPropertyFromCode.bind(panel); let reject = true;
    panel.ClearPropertyFromCode = property => reject ? false : clear(property);
    assert.equal(first.clear(), false);
    const second = env.P.createNativeStyleOwner({ resetValues: { x: "0px" } });
    second.apply(panel, { x: "80px" }, { QOLTestHidden: true });
    reject = false; env.clock.advance(500);
    assert.equal(panel.style.x, "80px", "retired cleanup cannot release a property claimed by the next instance");
    assert.equal(panel.style.opacity, undefined, "unclaimed retired properties still reach native CSS without another first-owner call");
    assert.equal(panel.BHasClass("QOLTestHidden"), true);
    second.clear(); env.clock.advance(500);
    assert.equal(panel.style.x, undefined); assert.equal(panel.BHasClass("QOLTestHidden"), false);
    assert.equal(env.clock.pendingCount(), env.baselinePending, "cleanup retries finish instead of becoming a second presentation loop");
    assert.deepEqual(env.clock.errors, []);
});

test("same-owner reapplication cancels the retired property's intent without allowing stale cleanup to undo it", () => {
    const env = setup(), panel = env.add("NativeSource"), scope = env.P.createNativeStyleOwner();
    scope.apply(panel, { opacity: "0.2" });
    const clear = panel.ClearPropertyFromCode.bind(panel); let reject = true;
    panel.ClearPropertyFromCode = property => reject ? false : clear(property);
    assert.equal(scope.apply(panel, {}), false);
    scope.apply(panel, { opacity: "0.7" }); reject = false; env.clock.advance(500);
    assert.equal(panel.style.opacity, "0.7"); scope.clear(); env.clock.advance(500);
    assert.equal(panel.style.opacity, undefined); assert.equal(env.clock.pendingCount(), env.baselinePending);
});

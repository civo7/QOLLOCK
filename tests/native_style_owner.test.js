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

test("settled native style owners tolerate temporary readback failure and recover", () => {
    const env = setup(), panel = env.add("ReadbackFailure"), owner = env.P.createNativeStyleOwner();
    assert.equal(owner.apply(panel, { opacity: "0.8" }), true);
    let reject = true;
    panel.style = new Proxy(panel.style, { get(target, key) {
        if (reject && key === "opacity") throw Error("native readback unavailable");
        return target[key];
    } });
    assert.equal(owner.apply(panel, { opacity: "0.8" }), false);
    reject = false;
    assert.equal(owner.apply(panel, { opacity: "0.8" }), true);
    owner.clear();
    assert.equal(panel.style.opacity, undefined);
});

test("settled native style owners ignore inherited presentation keys", () => {
    const env = setup(), panel = env.add("OwnKeys"), owner = env.P.createNativeStyleOwner();
    owner.apply(panel, { opacity: "0.8" });
    const inherited = Object.defineProperty({}, "width", { enumerable: true, get() { throw Error("inherited style read"); } });
    const styles = Object.assign(Object.create(inherited), { opacity: "0.8" });
    assert.equal(owner.apply(panel, styles), true);
    owner.clear();
});

test("read-only native ownership evidence detects overwritten values/leases and waits for actual tree retirement", () => {
    const env = setup(), panel = env.add("DiagnosticNative"), owner = env.P.createNativeStyleOwner();
    assert.equal(owner.isReleased(), true);
    owner.apply(panel, { opacity: "0.8" }, { DiagnosticClass: true });
    assert.equal(owner.verify(), true);
    panel.style.opacity = "0.2";
    assert.equal(owner.verify(), false);
    assert.equal(panel.style.opacity, "0.2", "verification cannot reconcile the overwritten style");
    owner.apply(panel, { opacity: "0.8" }, { DiagnosticClass: true });
    const next = env.P.createNativeStyleOwner(); next.apply(panel, { opacity: "0.8" });
    assert.equal(owner.verify(), false, "same-value foreign lease is not this owner's proof");
    owner.clear(); assert.equal(owner.isReleased(), true); next.clear();
    const tree = env.P.createOwnedTree(), child = tree.create("Panel", panel, "DiagnosticChild"), remove = child.DeleteAsync;
    child.DeleteAsync = () => {};
    tree.dispose(); env.clock.advance(1000);
    assert.equal(tree.isReleased(), false);
    child.DeleteAsync = remove; env.clock.advance(1000);
    assert.equal(tree.isReleased(), true);
});

test("border tint retirement cannot clear the next owner's composite border lease", () => {
    const env = setup(), panel = env.add("NativeBorder");
    const tint = env.P.createNativeStyleOwner(), next = env.P.createNativeStyleOwner();
    tint.apply(panel, { borderColor: "#44e3ff" });
    next.apply(panel, { border: "4px solid white" });
    tint.clear();
    assert.equal(panel.style.border, "4px solid white");
    next.clear();
    assert.equal(panel.style.borderColor, undefined, "the native composite code property retires as a whole");
    assert.equal(panel.style.border, undefined);
    assert.deepEqual(env.clock.errors, []);
});

for (const [property, sibling, value, nextValue, original, originalValue] of [
    ["fontSize", "fontWeight", "32px", "bold", "fontFamily", "serif"],
    ["marginLeft", "marginTop", "80px", "-40px", "marginBottom", "12px"]
]) test(`${property} retirement releases the native composite and preserves a current sibling`, () => {
    const env = setup(), panel = env.add("NativeComposite");
    panel.style[original] = originalValue;
    const owner = env.P.createNativeStyleOwner();
    owner.apply(panel, { [property]: value, [sibling]: nextValue });
    owner.apply(panel, { [sibling]: nextValue });
    assert.equal(panel.style[property], undefined, "removed component returns to native CSS");
    assert.equal(panel.style[sibling], nextValue, "still-customized component survives composite retirement");
    owner.clear();
    assert.equal(panel.style[sibling], undefined);
    assert.equal(panel.style[original], originalValue, "unowned original code component survives retirement");
    const first = env.P.createNativeStyleOwner(), next = env.P.createNativeStyleOwner();
    first.apply(panel, { [property]: value }); next.apply(panel, { [sibling]: nextValue });
    first.clear();
    assert.equal(panel.style[sibling], nextValue, "older cleanup cannot retire a new composite lease");
    next.clear();
    assert.equal(panel.style[property], undefined); assert.equal(panel.style[sibling], undefined);
    assert.equal(panel.style[original], originalValue, "original code survives instance handoff too");
    assert.deepEqual(env.clock.errors, []);
});

test("preserved native class baselines survive rejected retirement and instance handoff", () => {
    const env = setup(), panel = env.add("ClassHandoff");
    panel.AddClass("nativePresent");
    const first = env.P.createNativeStyleOwner({ preserveClasses: true });
    first.apply(panel, {}, { nativePresent: false, injected: true });
    assert.equal(panel.BHasClass("nativePresent"), true);
    const set = panel.SetHasClass.bind(panel);
    let reject = true;
    panel.SetHasClass = (name, value) => { if (reject && !value) throw Error("class restore blocked"); set(name, value); };
    assert.equal(first.clear(), false);
    const next = env.P.createNativeStyleOwner({ preserveClasses: true });
    next.apply(panel, {}, { nativePresent: false, injected: true });
    reject = false; env.clock.advance(300);
    assert.equal(panel.BHasClass("injected"), true, "old cleanup cannot remove the current class lease");
    next.clear();
    assert.equal(panel.BHasClass("injected"), false, "handoff inherits the original false baseline");
    assert.equal(panel.BHasClass("nativePresent"), true);
    assert.deepEqual(env.clock.errors, []);
});

test("preserved native code transform baseline is restored as code across instance handoff", () => {
    const env = setup(), panel = env.add("CodeHandoff");
    panel.style.transform = "translateX(8px)";
    const first = env.P.createNativeStyleOwner({ preserveStyles: ["transform"] });
    assert.equal(first.baseline(panel, "transform"), "translateX(8px)");
    panel.style.transform = "translateX(10px)";
    assert.equal(first.baseline(panel, "transform"), "translateX(10px)", "reading alone cannot retain an unowned native baseline");
    panel.style.transform = "translateX(8px)";
    first.apply(panel, { transform: "translateX(8px) rotateZ(45deg)" });
    let reject = true;
    panel.style = new Proxy(panel.style, { set(target, key, value) {
        if (reject && key === "transform" && value === "translateX(8px)") throw Error("restore blocked");
        target[key] = value; return true;
    } });
    assert.equal(first.clear(), false);
    const next = env.P.createNativeStyleOwner({ preserveStyles: ["transform"] });
    assert.equal(next.baseline(panel, "transform"), "translateX(8px)", "previous rotation is not part of native baseline");
    next.apply(panel, { transform: "translateX(8px) rotateZ(90deg)" });
    reject = false; env.clock.advance(300);
    assert.equal(panel.style.transform, "translateX(8px) rotateZ(90deg)");
    next.clear(); assert.equal(panel.style.transform, "translateX(8px)");
    assert.deepEqual(env.clock.errors, []);
});

test("disposed owned trees retry rejected deletion while a new instance waits for the same ID", () => {
    const env = setup(), parent = env.add("TreeParent");
    const first = env.P.createOwnedTree(), old = first.child(parent, "Panel", "OwnedChild");
    const remove = old.DeleteAsync.bind(old);
    let reject = true;
    old.DeleteAsync = delay => { if (reject) throw Error("delete blocked"); remove(delay); };
    first.dispose();
    const next = env.P.createOwnedTree();
    assert.equal(next.child(parent, "Panel", "OwnedChild"), null);
    assert.equal(old.visible, false);
    reject = false; env.clock.advance(300);
    assert.equal(old.IsValid(), false);
    const current = next.child(parent, "Panel", "OwnedChild");
    assert.ok(current); assert.notEqual(current, old);
    env.clock.advance(300); assert.equal(current.IsValid(), true);
    next.dispose(); env.clock.advance(300); assert.deepEqual(env.clock.errors, []);
});

test("fresh owned-tree handles retire anonymous and moved children without adopting native siblings", () => {
    const env = setup(), parent = env.add("AnonymousParent"), detached = env.add("DetachedAnonymous");
    const native = env.$.CreatePanel("Panel", parent, "");
    const tree = env.P.createOwnedTree();
    const create = env.$.CreatePanel; let creationProperties = null;
    env.$.CreatePanel = (type, owner, id, properties) => {
        creationProperties = properties; return create(type, owner, id, properties);
    };
    const root = tree.create("Panel", parent), child = tree.create("ToggleButton", root, "", { hittest: "true" });
    assert.notEqual(root, native); assert.equal(creationProperties.hittest, "true");
    assert.notEqual(child.hittest, false, "fresh controls cannot receive reconciled overlay hit-test suppression");
    child.SetParent(detached);
    let reject = true;
    const remove = child.DeleteAsync.bind(child);
    child.DeleteAsync = delay => { if (reject) throw Error("anonymous deletion blocked"); remove(delay); };
    tree.remove(root); env.clock.advance(20);
    assert.equal(root.IsValid(), false); assert.equal(child.IsValid(), true); assert.equal(child.visible, false);
    assert.equal(native.IsValid(), true);
    tree.dispose(); reject = false; env.clock.advance(300);
    assert.equal(child.IsValid(), false); assert.equal(native.IsValid(), true);
    assert.deepEqual(env.clock.errors, []);
});

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

for (const property of ["color", "washColor", "borderColor", "backgroundColor"]) test(`unchanged ${property} validates native readback once and still recovers from native overwrites`, () => {
    const env = setup(), panel = env.add("NativeColor"), owner = env.P.createNativeStyleOwner();
    let reads = 0, writes = 0;
    panel.style = new Proxy(panel.style, {
        get(target, key) { if (key === property) reads++; return target[key]; },
        set(target, key, value) { if (key === property) writes++; target[key] = String(value).toUpperCase(); return true; }
    });
    owner.apply(panel, { [property]: "#abcdef" });
    reads = writes = 0;
    assert.equal(owner.apply(panel, { [property]: "#abcdef" }), true);
    assert.equal(reads, 1, "unchanged presentation needs one native validation, not a second snapshot");
    assert.equal(writes, 0);
    panel.style[property] = "#000000";
    owner.apply(panel, { [property]: "#abcdef" });
    assert.equal(panel.style[property], "#ABCDEF");
    owner.clear();
    assert.equal(panel.style[property], undefined);
    assert.deepEqual(env.clock.errors, []);
});

test("unchanged native classes need one validation and still recover after feedback or ownership transfer", () => {
    const env = setup(), panel = env.add("NativeClass"), owner = env.P.createNativeStyleOwner();
    const hasClass = panel.BHasClass.bind(panel);
    let reads = 0;
    panel.BHasClass = name => { reads++; return hasClass(name); };
    owner.apply(panel, { width: "40px" }, { QOLActive: true });
    reads = 0;
    assert.equal(owner.apply(panel, { width: "40px" }, { QOLActive: true }), true);
    assert.equal(reads, 1, "stable native presentation needs one class validation");
    panel.RemoveClass("QOLActive");
    owner.apply(panel, { width: "40px" }, { QOLActive: true });
    assert.equal(hasClass("QOLActive"), true);
    const other = env.P.createNativeStyleOwner();
    other.apply(panel, { width: "60px" }, { QOLActive: true });
    owner.apply(panel, { width: "40px" }, { QOLActive: true });
    other.clear();
    assert.equal(panel.style.width, "40px");
    assert.equal(hasClass("QOLActive"), true);
    owner.clear();
    assert.equal(panel.style.width, undefined);
    assert.equal(hasClass("QOLActive"), false);
    assert.deepEqual(env.clock.errors, []);
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

test("same-value reapplication cancels a rejected retain retirement before its cleanup retry", () => {
    const env = setup(), panel = env.add("RetainedSource"), owner = env.P.createNativeStyleOwner();
    owner.apply(panel, { opacity: "0.2" });
    const clear = panel.ClearPropertyFromCode.bind(panel);
    let reject = true;
    panel.ClearPropertyFromCode = property => reject ? false : clear(property);
    assert.equal(owner.retain([]), false);
    assert.equal(owner.apply(panel, { opacity: "0.2" }), true);
    reject = false; env.clock.advance(500);
    assert.equal(panel.style.opacity, "0.2");
    owner.clear();
    assert.equal(panel.style.opacity, undefined);
    assert.deepEqual(env.clock.errors, []);
});

test("composite position retirement retries rejection and respects another owner's axis lease", () => {
    const env = setup(), panel = env.add("NativePosition");
    const first = env.P.createNativeStyleOwner({ resetValues: { x: "0px", y: "0px" }, releasePosition: true });
    first.apply(panel, { x: "35px", y: "12px" });
    const clear = panel.ClearPropertyFromCode.bind(panel);
    let reject = true, compositeClears = 0;
    panel.ClearPropertyFromCode = key => {
        if (key === "position") { compositeClears++; if (reject) return false; }
        return clear(key);
    };
    assert.equal(first.clear(), false);
    const second = env.P.createNativeStyleOwner({ resetValues: { y: "0px" }, releasePosition: true });
    second.apply(panel, { y: "80px" });
    const attempts = compositeClears;
    reject = false; env.clock.advance(500);
    assert.equal(panel.style.y, "80px");
    assert.equal(compositeClears, attempts, "retired x cannot clear a new owner's composite y");
    second.clear();
    assert.ok(compositeClears > attempts);
    assert.equal(panel.style.y, undefined);
    assert.deepEqual(env.clock.errors, []);
});

test("reclaiming a normalized unchanged opacity still writes before taking another owner's lease", () => {
    const env = setup(), panel = env.add("OpacityOwner");
    let writes = 0;
    panel.style = new Proxy(panel.style, { set(target, key, value) {
        if (key === "opacity") writes++;
        target[key] = value; return true;
    } });
    const first = env.P.createNativeStyleOwner(), second = env.P.createNativeStyleOwner();
    first.apply(panel, { opacity: "0.50" }); second.apply(panel, { opacity: "0.50" });
    const previous = writes;
    first.apply(panel, { opacity: "0.50" });
    assert.equal(writes, previous + 1, "native ownership transfer invalidates the old signature even for equal values");
    second.clear(); assert.equal(panel.style.opacity, "0.50");
    first.clear(); assert.equal(panel.style.opacity, undefined);
});

test("retired compound position cannot neutralize the next owner's coordinates", () => {
    const env = setup(), panel = env.add("DigitPosition");
    const digit = env.P.createNativeStyleOwner({ resetValues: { position: "0px 0px 0px" } });
    const next = env.P.createNativeStyleOwner({ resetValues: { x: "0px" }, releasePosition: true });
    digit.apply(panel, { position: "35px -12px 0px" });
    next.apply(panel, { x: "80px" });
    const clear = panel.ClearPropertyFromCode.bind(panel); let compoundClears = 0;
    panel.ClearPropertyFromCode = key => { if (key === "position") compoundClears++; return clear(key); };
    digit.clear();
    assert.equal(panel.style.x, "80px"); assert.equal(compoundClears, 0);
    assert.equal(panel.style.y, undefined, "the unclaimed component retires independently");
    next.clear(); assert.equal(panel.style.x, undefined);
});

test("native compound retirement releases its unclaimed coordinate while preserving a later axis", () => {
    const env = setup(), panel = env.add("TransferredPosition");
    panel.style = new Proxy(panel.style, { set(target, key, value) {
        if (key === "position") {
            const [x, y] = String(value).split(/\s+/); target.x = x; target.y = y;
        }
        target[key] = value; return true;
    } });
    const first = env.P.createNativeStyleOwner({ resetValues: { position: "0px 0px 0px" } });
    const second = env.P.createNativeStyleOwner({ resetValues: { y: "0px" } });
    first.apply(panel, { position: "40px 50px 0px" }); second.apply(panel, { y: "30px" });
    first.clear();
    assert.equal(panel.style.x, undefined, "the first owner's remaining coordinate returns to CSS");
    assert.equal(panel.style.y, "30px", "retiring the compound owner preserves the new axis");
    second.clear(); assert.equal(panel.style.position, undefined); assert.equal(panel.style.y, undefined);
});

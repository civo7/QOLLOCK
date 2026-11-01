"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const load = require("./load_settings_environment");

test("preview notifies reactive owners only after commit and after reset", () => {
    const env = load(), q = env.hud.sandbox.global.QOL;
    q.core.App.shutdown();
    const root = env.hud.root, preview = q.presentation.preview, canonical = q.buildDefaultConfig();
    const stamp = q.core.persistence.getConfigChangeStamp(q.getUIRoot());
    const selected = [];
    q.core.EventBus.on("presentation:preview_changed", () => selected.push(preview.selected(root, "reload")));
    root.AddClass("QOLCustomizeActive");
    preview.write(root, {}, "notify", stamp, "reload");
    const rejected = preview.consume(root, canonical);
    assert.deepEqual(selected, [], "staged delivery must not notify owners");
    preview.reject(rejected);
    assert.deepEqual(selected, [], "rejected delivery must not notify owners");
    const accepted = preview.consume(root, canonical);
    assert.equal(preview.commit(accepted), true);
    assert.deepEqual(selected, [true], "notification observes the accepted sample");
    assert.equal(preview.commit(accepted), false);
    assert.deepEqual(selected, [true], "duplicate commits do not notify again");
    preview.reset(root);
    assert.deepEqual(selected, [true, false], "reset notification observes cleared sample state");
    assert.deepEqual(env.clock.errors, []);
});

test("sample selection is leased metadata and stays stable only across matching pending geometry edits", () => {
    const env = load(), q = env.hud.sandbox.global.QOL;
    q.core.App.shutdown();
    const root = env.hud.root, preview = q.presentation.preview, canonical = q.buildDefaultConfig();
    const stamp = q.core.persistence.getConfigChangeStamp(q.getUIRoot());
    root.AddClass("QOLCustomizeActive");
    preview.write(root, {}, "sample", stamp, "reload");
    assert.equal(preview.selected(root, "reload"), false, "unvalidated metadata cannot create content");
    preview.commit(preview.consume(root, canonical));
    assert.equal(preview.selected(root, "reload"), true);
    preview.write(root, { RELOAD_COOLDOWN_X_OFFSET: 120 }, "sample", stamp, "reload");
    assert.equal(preview.selected(root, "reload"), true, "a same-selection pending edit cannot remove its measured sample");
    preview.write(root, {}, "sample", stamp, "souls");
    assert.equal(preview.selected(root, "reload"), false, "a new selection withdraws the old sample before the next app poll");
    assert.equal(preview.selected(root, "souls"), false);
    preview.commit(preview.consume(root, canonical));
    assert.equal(preview.selected(root, "souls"), true);
    preview.write(root, {}, "sample", stamp, "unknown");
    const invalid = preview.consume(root, canonical); preview.commit(invalid);
    assert.equal(preview.selected(root, "souls"), false);
    preview.write(root, {}, "sample", stamp, "reload");
    preview.commit(preview.consume(root, canonical));
    env.clock.advance(2600);
    assert.equal(preview.selected(root, "reload"), false);
    assert.equal(env.hud.sandbox.global.State.lastConfig.RELOAD_COOLDOWN_X_OFFSET, 0);
    assert.deepEqual(env.clock.errors, []);
});

test("preview ACK follows successful runtime delivery; a failed delivery retries without killing config polling", () => {
    const env = load();
    const { clock, hud } = env;
    clock.advance(1000);
    const q = hud.sandbox.global.QOL;
    const preview = q.presentation.preview;
    const adapter = q.core.ConfigAdapter;
    const loadFromFlat = adapter.loadFromFlat;
    const duringDelivery = [];
    let fail = true;
    adapter.loadFromFlat = (...args) => {
        duringDelivery.push(preview.ack(hud.root));
        if (fail) { fail = false; throw new Error("injected delivery failure"); }
        return loadFromFlat(...args);
    };
    hud.root.AddClass("QOLCustomizeActive");
    const stamp = q.core.persistence.getConfigChangeStamp(q.getUIRoot());
    preview.write(hud.root, { SOULS_X_OFFSET: 125 }, "delivery", stamp);
    clock.advance(600);
    assert.deepEqual(duringDelivery, ["", ""], "no success ACK during either delivery attempt");
    assert.equal(preview.ack(hud.root), "delivery");
    assert.equal(q.core.ConfigStore.get("ql_souls", "SOULS_X_OFFSET"), 125);
    assert.equal(hud.sandbox.global.State.lastConfig.SOULS_X_OFFSET, 0);
    preview.clear(hud.root, "delivery");
    clock.advance(600);
    assert.equal(q.core.ConfigStore.get("ql_souls", "SOULS_X_OFFSET"), 0);
    assert.equal(preview.ack(hud.root), "");
    assert.deepEqual(clock.errors, []);
    q.core.App.shutdown();
});

test("blocking a leased preview forces redelivery when the benchmark block ends", () => {
    const env = load();
    const q = env.hud.sandbox.global.QOL;
    q.core.App.shutdown();
    const root = env.hud.root, preview = q.presentation.preview;
    root.AddClass("QOLCustomizeActive");
    const canonical = q.buildDefaultConfig();
    preview.write(root, { SOULS_X_OFFSET: 125 }, "blocked", q.core.persistence.getConfigChangeStamp(q.getUIRoot()));
    const first = preview.consume(root, canonical);
    q.core.ConfigAdapter.loadFromFlat(first.config); assert.equal(preview.commit(first), true);
    assert.equal(preview.effective(canonical).SOULS_X_OFFSET, 125);
    preview.consume(root, canonical, true); // App leaves benchmark buckets alone.
    assert.equal(preview.ack(root), "");
    const resumed = preview.consume(root, canonical);
    assert.equal(resumed.changed, true);
    assert.equal(resumed.config.SOULS_X_OFFSET, 125);
    q.core.ConfigAdapter.loadFromFlat(resumed.config); assert.equal(preview.commit(resumed), true);
    assert.equal(preview.ack(root), "blocked");
});

test("a rejected withdrawal ACK remains retryable until the native attributes accept it", () => {
    const env = load();
    const q = env.hud.sandbox.global.QOL;
    q.core.App.shutdown();
    const root = env.hud.root, preview = q.presentation.preview, canonical = q.buildDefaultConfig();
    root.AddClass("QOLCustomizeActive");
    preview.write(root, { SOULS_X_OFFSET: 125 }, "withdraw", q.core.persistence.getConfigChangeStamp(q.getUIRoot()));
    const draft = preview.consume(root, canonical);
    q.core.ConfigAdapter.loadFromFlat(draft.config); assert.equal(preview.commit(draft), true);
    preview.clear(root, "withdraw");
    const set = root.SetAttributeString.bind(root);
    let reject = true;
    root.SetAttributeString = (key, value) => {
        if (reject && key.startsWith("QOL_CUSTOMIZE_ACK")) throw Error("rejected ACK clear");
        return set(key, value);
    };
    const withdrawal = preview.consume(root, canonical);
    q.core.ConfigAdapter.loadFromFlat(withdrawal.config);
    assert.equal(preview.commit(withdrawal), false); preview.reject(withdrawal);
    reject = false;
    const retry = preview.consume(root, canonical);
    assert.equal(retry.changed, true); q.core.ConfigAdapter.loadFromFlat(retry.config);
    assert.equal(preview.commit(retry), true);
    assert.equal(preview.ack(root), "");
    assert.equal(q.core.ConfigStore.get("ql_souls", "SOULS_X_OFFSET"), 0);
});

test("a partially accepted ACK cannot report a settled preview", () => {
    const env = load(), q = env.hud.sandbox.global.QOL;
    q.core.App.shutdown();
    const root = env.hud.root, preview = q.presentation.preview, canonical = q.buildDefaultConfig();
    root.AddClass("QOLCustomizeActive");
    preview.write(root, { SOULS_X_OFFSET: 125 }, "partial", q.core.persistence.getConfigChangeStamp(q.getUIRoot()));
    const set = root.SetAttributeString.bind(root);
    root.SetAttributeString = (key, value) => {
        if (key === "QOL_CUSTOMIZE_ACK") throw Error("rejected token ACK");
        return set(key, value);
    };
    const layer = preview.consume(root, canonical); q.core.ConfigAdapter.loadFromFlat(layer.config);
    assert.equal(preview.commit(layer), false);
    assert.equal(preview.settled(root), false);
    preview.reject(layer); root.SetAttributeString = set;
    const retry = preview.consume(root, canonical); q.core.ConfigAdapter.loadFromFlat(retry.config);
    assert.equal(preview.commit(retry), true); assert.equal(preview.settled(root), true);
});


test("gesture delivery cadence is leased metadata and returns to idle without a config edit", () => {
    const env = load(), q = env.hud.sandbox.global.QOL, preview = q.presentation.preview;
    const root = env.hud.root, canonical = q.buildDefaultConfig();
    root.AddClass("QOLCustomizeActive");
    const stamp = q.core.persistence.getConfigChangeStamp(q.getUIRoot());
    preview.write(root, {}, "gesture", stamp, "souls", true);
    assert.equal(preview.interacting(root), true);
    preview.commit(preview.consume(root, canonical));
    preview.write(root, {}, "gesture", stamp, "souls", false);
    assert.equal(preview.interacting(root), false);
    preview.write(root, {}, "gesture", stamp, "souls", true);
    env.clock.advance(2600);
    assert.equal(preview.interacting(root), false);
    assert.equal(env.hud.sandbox.global.State.lastConfig.SOULS_X_OFFSET, 0);
    assert.deepEqual(env.clock.errors, []);
});


test("HUD preview visibility expires and retries rejected cleanup on a living former HUD", () => {
    const env = load(), q = env.hud.sandbox.global.QOL, preview = q.presentation.preview;
    q.core.App.shutdown();
    const root = env.hud.root, canonical = q.buildDefaultConfig();
    root.AddClass("QOLCustomizeActive");
    const stamp = q.core.persistence.getConfigChangeStamp(q.getUIRoot());
    preview.write(root, {}, "visible", stamp, "souls");
    preview.commit(preview.consume(root, canonical));
    assert.equal(root.BHasClass("QOLCustomizeLiveHud"), true);
    const set = root.SetHasClass; let reject = true;
    root.SetHasClass = (name, enabled) => name === "QOLCustomizeLiveHud" && !enabled && reject ? false : set.call(root, name, enabled);
    const next = env.doc.create("Panel", { id: "ReplacementHud" }); root.addChild(next); next.AddClass("QOLCustomizeActive");
    preview.write(next, {}, "next", stamp, "souls");
    preview.commit(preview.consume(next, canonical));
    assert.equal(root.BHasClass("QOLCustomizeLiveHud"), true, "rejected cleanup is retained");
    assert.equal(next.BHasClass("QOLCustomizeLiveHud"), true);
    reject = false; env.clock.advance(300);
    assert.equal(root.BHasClass("QOLCustomizeLiveHud"), false);
    env.clock.advance(2600);
    preview.commit(preview.consume(next, canonical));
    assert.equal(next.BHasClass("QOLCustomizeLiveHud"), false);
    assert.deepEqual(env.clock.errors, []);
});

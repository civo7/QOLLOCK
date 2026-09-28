"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { quickbuyEnvironment, measure } = require("../scripts/audit_runtime_lifecycle");

test("unchanged quickbuy preview does not clear/refill classes, text or images", () => {
    const env = quickbuyEnvironment(true);
    const phase = measure(env, "steady-preview");
    assert.equal(phase.operations.classWritesChanged, 0);
    assert.equal(phase.operations.textWritesChanged, 0);
    assert.equal(phase.images.changed, 0);
    assert.equal(phase.pending, 1);
    const host = env.context.GetParent();
    host.RemoveClass("enhanced_quickbuy_active");
    env.clock.advance(500);
    const disabled = measure(env, "disabled-preview");
    assert.equal(disabled.images.changed, 0);
    assert.equal(disabled.operations.classWritesChanged, 0);
    assert.deepEqual(env.clock.errors, []);
});

test("quickbuy preview follows source changes, clearing, re-enable and image replacement", () => {
    const env = quickbuyEnvironment(true);
    const $ = env.sandbox.global.$;
    const preview = env.context.FindChildTraverse("QuickbuyUpcomingPreview2");
    const targetIcon = preview.FindChildTraverse("ModIcon");
    let image = targetIcon.FindChildTraverse("ModIconImage");
    const sourceIcon = env.context.FindChildTraverse("QuickbuyQueue").GetChild(1).FindChildTraverse("ModIcon");
    const sourceImage = sourceIcon.FindChildTraverse("ModIconImage");
    const paths = [];
    image.SetImage = value => paths.push(value);
    sourceImage.SetAttributeString("src", "new_item");
    sourceIcon.AddClass("isArmor");
    env.sandbox.dispatch("CitadelQuickbuyItemsChanged");
    assert.deepEqual(paths, ["new_item"]);
    assert.equal(targetIcon.BHasClass("isArmor"), true);
    paths.length = 0;
    // A native refresh may overwrite the same instance: keep reasserting the
    // desired final path, without an intervening clear or an assumed sole writer.
    env.clock.advance(500);
    assert.deepEqual(paths, ["new_item"]);
    env.context.GetParent().RemoveClass("enhanced_quickbuy_active");
    env.clock.advance(500);
    assert.equal(preview.BHasClass("HasPreviewItem"), false);
    assert.equal(preview.FindChildTraverse("QuickbuyUpcomingPreview2SoulsNeededLabel").text, "0");
    assert.equal(paths.at(-1), "");
    env.context.GetParent().AddClass("enhanced_quickbuy_active");
    env.clock.advance(500);
    assert.equal(preview.BHasClass("HasPreviewItem"), true);
    assert.equal(paths.at(-1), "new_item");
    image.DeleteAsync(0);
    env.clock.advance(0);
    image = $.CreatePanel("Image", targetIcon, "ModIconImage");
    const replacementPaths = [];
    image.SetImage = value => replacementPaths.push(value);
    env.clock.advance(500);
    assert.deepEqual(replacementPaths, ["new_item"], "same path must be applied to a replacement target");
    sourceIcon.GetParent().DeleteAsync(0);
    env.clock.advance(0);
    env.sandbox.dispatch("CitadelQuickbuyItemsChanged");
    assert.equal(preview.BHasClass("HasPreviewItem"), false);
    assert.equal(replacementPaths.at(-1), "");
    assert.deepEqual(env.clock.errors, []);
    assert.deepEqual(env.sandbox.doc.eventErrors, []);
});

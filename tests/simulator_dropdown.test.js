"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { Document, Clock } = require("../scripts/simulator");

test("simulator dropdown registers options, selects IDs and discards deleted selections", () => {
    const clock = new Clock();
    const doc = new Document(clock);
    const dropdown = doc.create("DropDown", { id: "Language" });
    const first = doc.create("Label", { id: "en" });
    const second = doc.create("Label", { id: "ru" });
    dropdown.AddOption(first);
    dropdown.AddOption(second);
    assert.equal(dropdown.GetSelected(), null);
    dropdown.SetSelected("ru");
    assert.equal(dropdown.GetSelected(), second);
    assert.equal(second.GetParent(), dropdown);
    dropdown.SetSelected("en");
    assert.equal(dropdown.GetSelected(), first);
    first.DeleteAsync(0);
    clock.advance(1);
    assert.equal(dropdown.GetSelected(), null);
    const toggle = doc.create("ToggleButton", {});
    toggle.SetSelected(true);
    assert.equal(toggle.BHasClass("Selected"), true);
    assert.throws(() => toggle.AddOption(second), /DropDown/);
});

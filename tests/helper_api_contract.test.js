"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const sim = require("../scripts/simulator");

test("helper decision map recommends callable production exports", () => {
    const hud = sim.createHud();
    hud.assertLoaded();
    const settings = require("./load_settings_environment")();
    const doc = fs.readFileSync(path.join(__dirname, "../docs/HELPERS.md"), "utf8");
    const references = new Set(Array.from(doc.matchAll(/`((?:QOL|QOL_UTILS)\.[\w.]+)\(/g), match => match[1]));
    assert.ok(references.size > 0, "decision map must contain callable API references");
    for (const reference of references) {
        const context = reference.startsWith("QOL.ui.theme.") ? settings.global : hud.sandbox.global;
        const exported = reference.split(".").reduce((owner, key) => owner && owner[key], context);
        assert.equal(typeof exported, "function", `${reference} documented but not exported in its owning context`);
    }
});

test("documented validity aliases reject stale and throwing native handles", () => {
    const hud = sim.createHud();
    hud.assertLoaded();
    const { QOL, QOL_UTILS } = hud.sandbox.global;
    const valid = QOL_UTILS.IsPanelValid;
    assert.equal(QOL.utils.IsPanelValid, valid);
    assert.equal(QOL.core.panel.isAlive, valid);
    assert.equal(QOL.core.panel.isPanelAlive, valid);
    assert.equal(valid(null), false);
    assert.equal(valid({ IsValid: () => false }), false);
    assert.equal(valid({ IsValid() { throw new Error("native handle freed"); } }), false);
    assert.equal(valid({ IsValid: true }), false);
    assert.equal(valid({ IsValid: () => true }), true);
});

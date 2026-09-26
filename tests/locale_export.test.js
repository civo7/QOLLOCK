"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawnSync } = require("node:child_process");

test("locale export preserves community text and refuses malformed merge inputs before writing", t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "qollock-locale-"));
    t.after(() => {
        assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
        fs.rmSync(root, { recursive: true });
    });
    const file = path.join(root, "ru", "translation.json");
    fs.mkdirSync(path.dirname(file));
    fs.writeFileSync(file, JSON.stringify({ Back: "Community translation", retired: "Preserve me" }));
    const run = () => spawnSync(process.execPath, [path.resolve(__dirname, "../scripts/export_locales_json.js"), root], { encoding: "utf8" });
    assert.equal(run().status, 0);
    const merged = JSON.parse(fs.readFileSync(file, "utf8"));
    assert.equal(merged.Back, "Community translation");
    assert.equal(merged.retired, "Preserve me");
    assert.equal(merged["HUD settings walkthrough"], "Пошаговая проверка HUD");
    const enFile = path.join(root, "en", "translation.json");
    const before = fs.readFileSync(enFile, "utf8");
    for (const malformed of ["{broken", "[]", '{"Back":null}']) {
        fs.writeFileSync(file, malformed);
        assert.notEqual(run().status, 0);
        assert.equal(fs.readFileSync(file, "utf8"), malformed);
        assert.equal(fs.readFileSync(enFile, "utf8"), before);
    }
});

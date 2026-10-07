"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { LANGUAGES, loadLocaleMaps } = require("../scripts/locales_helper");
const { readFlat, readCatalogs, planImport, validateTranslation, applyWrites } = require("../scripts/translation_io");
const { parseCsv, readCsv } = require("../scripts/import_translations");
const ROOT = path.resolve(__dirname, "..");
function fixture(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "qollock import with spaces "));
    t.after(() => {
        assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
        fs.rmSync(root, { recursive: true });
    });
    fs.mkdirSync(path.join(root, "scripts"));
    for (const file of ["locales_helper.js", "translation_io.js", "import_locales_json.js", "import_translations.js", "sync_translations.js", "export_locales_json.js"]) {
        fs.copyFileSync(path.join(ROOT, "scripts", file), path.join(root, "scripts", file));
    }
    fs.mkdirSync(path.join(root, "panorama/scripts"), { recursive: true });
    fs.cpSync(path.join(ROOT, "panorama/scripts/ql_settings_loc"), path.join(root, "panorama/scripts/ql_settings_loc"), { recursive: true });
    fs.mkdirSync(path.join(root, "translations"));
    return root;
}
function catalog(root, code, values) {
    const file = path.join(root, code, "translation.json");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, typeof values === "string" ? values : JSON.stringify(values));
    return file;
}
function run(root, file, args) { return spawnSync(process.execPath, [path.join(root, "scripts", file), ...args], { encoding: "utf8", cwd: root }); }

test("JSON importer preflights every supported input and never partially writes", t => {
    const root = fixture(t), input = path.join(root, "input");
    const ruFile = path.join(root, "panorama/scripts/ql_settings_loc/ql_settings_loc_ru.js");
    const before = fs.readFileSync(ruFile, "utf8");
    catalog(input, "ru", { Back: "Updated" });
    for (const broken of ["{broken", "[]", '{"Back":null}', '{"Back":{"nested":"text"}}', '{"Back":"one","Back":"two"}']) {
        catalog(input, "fr", broken);
        const result = run(root, "import_locales_json.js", [input]);
        assert.notEqual(result.status, 0, broken);
        assert.equal(fs.readFileSync(ruFile, "utf8"), before);
    }
});

test("JSON importer handles spaces, punctuation, blanks, retired keys and dry run without shell commands", t => {
    const root = fixture(t);
    const file = catalog(path.join(root, "input"), "ru", { Back: "New text ", "Ready": "Ready translation", "Ready.": "Ready dot", Settings: "  ", retired: "Skip" });
    const ruFile = path.join(root, "panorama/scripts/ql_settings_loc/ql_settings_loc_ru.js");
    const before = fs.readFileSync(ruFile, "utf8");
    assert.equal(run(root, "import_locales_json.js", [file, "--dry-run"]).status, 0);
    assert.equal(fs.readFileSync(ruFile, "utf8"), before);
    const applied = run(root, "import_locales_json.js", [file]);
    assert.equal(applied.status, 0, applied.stderr);
    const { maps } = loadLocaleMaps(path.join(root, "panorama/scripts/ql_settings_loc"));
    assert.equal(maps.ru.Back, "New text ");
    assert.equal(maps.ru.Ready, "Ready translation");
    assert.equal(maps.ru["Ready."], "Ready dot");
    assert.equal(Object.hasOwn(maps.ru, "retired"), false);
    assert.notEqual(maps.ru.Settings, "  ");
    assert.match(applied.stdout, /1 retired/);
    assert.equal(run(root, "import_locales_json.js", [file, "--dry-run", "--json"]).status, 0);
});

test("Chinese alias selects the reviewed website catalog and rejects other duplicate language inputs", t => {
    const root = fixture(t), input = path.join(root, "input");
    catalog(input, "zh", { Back: "Old" });
    catalog(input, "zh-CN", { Back: "New" });
    catalog(input, "de", { Back: "External" });
    const { catalogs, warnings } = readCatalogs(input);
    assert.equal(catalogs.zh.Back, "New");
    assert.equal(Object.hasOwn(catalogs, "de"), false);
    assert.equal(warnings.length, 2);
    catalog(path.join(input, "other"), "zh-CN", { Back: "Duplicate" });
    assert.throws(() => readCatalogs(input), /Duplicate language/);
});

test("three-way integration preserves local edits, accepts community changes, blocks conflicts and is repeatable", () => {
    const maps = Object.fromEntries(LANGUAGES.map(lang => [lang.code, {}]));
    maps.en = { Back: "Back", Settings: "Settings", Ready: "Ready" };
    maps.ru = { Back: "Local correction", Settings: "Original", Ready: "Both local" };
    const keyOrders = Object.fromEntries(LANGUAGES.map(lang => [lang.code, Object.keys(maps[lang.code])]));
    const baseline = { ru: { Back: "Original", Settings: "Original", Ready: "Original" } };
    const incoming = { ru: { Back: "Original", Settings: "Community", Ready: "Both remote" } };
    const plan = planImport({ maps, keyOrders }, incoming, { baseline });
    assert.equal(plan.blocked, true);
    assert.equal(plan.conflicts.length, 1);
    assert.deepEqual(plan.changes.map(change => change.key), ["Settings"]);
    assert.equal(plan.keptLocal.length, 1);
    const resolved = planImport({ maps, keyOrders }, incoming, { baseline, resolve: "local" });
    assert.equal(resolved.blocked, false);
    assert.equal(resolved.changes.length, 1);
    maps.ru.Settings = "Community";
    assert.equal(planImport({ maps, keyOrders }, incoming, { baseline: incoming }).changes.length, 0);
});

test("sync CLI blocks conflicts without dictionaries or baseline changing", t => {
    const root = fixture(t), input = path.join(root, "input"), base = path.join(root, "translations/locales");
    catalog(base, "ru", { Back: "Ancestor" });
    catalog(input, "ru", { Back: "Community", retired: "Skip" });
    const ru = path.join(root, "panorama/scripts/ql_settings_loc/ql_settings_loc_ru.js");
    const before = fs.readFileSync(ru, "utf8");
    const state = path.join(root, "translations/import-baseline.json");
    assert.notEqual(run(root, "sync_translations.js", [input]).status, 0);
    assert.equal(fs.readFileSync(ru, "utf8"), before);
    assert.equal(fs.existsSync(state), false);
    assert.equal(run(root, "sync_translations.js", [input, "--resolve=local", "--dry-run"]).status, 0);
    assert.equal(fs.existsSync(state), false);
    assert.equal(run(root, "sync_translations.js", [input, "--resolve=local"]).status, 0);
    const next = fs.readFileSync(state, "utf8");
    const repeat = run(root, "sync_translations.js", [input]);
    assert.equal(repeat.status, 0, repeat.stderr);
    assert.match(repeat.stdout, /0 changes/);
    assert.equal(fs.readFileSync(state, "utf8"), next);
});

test("CSV parsing rejects truncated quotes, duplicate keys/headers and wrong row width; preserves newline values", () => {
    assert.deepEqual(parseCsv('\uFEFFEnglish,Russian\r\nBack,"one, two\nthree"\r\n'), [["English", "Russian"], ["Back", "one, two\nthree"]]);
    for (const text of ['English,Russian\nBack,"broken', 'English,Russian\nBack,x\nBack,y', 'English,Russian,Russian\nBack,x,y', 'English,Russian\nBack,x,y']) {
        assert.throws(() => readCsv(text));
    }
    assert.equal(readCsv("English,Russian\nBack,Updated ").catalogs.ru.Back, "Updated ");
});

test("translation validation preserves named placeholders and balanced markup", () => {
    assert.throws(() => validateTranslation("Count: {count}", "Количество"), /placeholders/);
    assert.throws(() => validateTranslation("Count: {{ count }}", "{{different}}"), /placeholders/);
    assert.throws(() => validateTranslation('<font color="#abc">Text</font>', '</font>Текст<font color="#abc">'), /Unbalanced/);
    assert.doesNotThrow(() => validateTranslation("Count: {{ count }}", "{{count}}"));
});

test("write failure rolls back files already replaced", t => {
    const root = fixture(t), file = path.join(root, "first");
    fs.writeFileSync(file, "before");
    assert.throws(() => applyWrites([{ file, content: "after" }, { file: path.join(root, "missing/second"), content: "failure" }]));
    assert.equal(fs.readFileSync(file, "utf8"), "before");
});

test("export propagates local corrections only when the community still matches the integrated ancestor", t => {
    const root = fixture(t), output = path.join(root, "output");
    const { maps } = loadLocaleMaps(path.join(root, "panorama/scripts/ql_settings_loc"));
    fs.writeFileSync(path.join(root, "translations/import-baseline.json"), JSON.stringify({ revision: "reviewed", catalogs: { ru: { Back: "Ancestor", Settings: "Ancestor" } } }));
    const file = catalog(output, "ru", { Back: "Ancestor", Settings: "Newer community", retired: "Keep", Ready: "" });
    const result = run(root, "export_locales_json.js", [output]);
    assert.equal(result.status, 0, result.stderr);
    const values = readFlat(file);
    assert.equal(values.Back, maps.ru.Back);
    assert.equal(values.Settings, "Newer community");
    assert.equal(values.retired, "Keep");
    assert.equal(values.Ready, maps.ru.Ready);
    assert.equal(readFlat(path.join(output, "en/translation.json")).Back, "Back");
});

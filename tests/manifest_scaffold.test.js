"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { parseArgs, generate, scaffold } = require("../panorama/scripts/tools/scaffold");
const { createHud } = require("../scripts/simulator");

function options(type, extra = []) {
    return parseArgs(["ql_scaffold_fixture", "Fixture", "Fixture appearance", `--type=${type}`,
        '--settings=[{"key":"OFFSET","type":"slider","min":0,"max":100,"step":1,"default":3,"caption":"Quoted \\"caption\\""}]',
        ...(type === "css-only" ? [] : ["--panel-id=SourceFixture", '--owner-path=[{"className":"CoreFixture"}]']), ...extra]);
}

function setup(opts, transform = s => s) {
    const env = createHud();
    env.assertLoaded();
    const Q = env.sandbox.global.QOL;
    Q.core.App.shutdown();
    env.sandbox.eval(transform(generate(opts)));
    const manifest = Q.core.FeatureRegistry.getManifest(opts.id);
    const cfg = { OFFSET: 3 };
    const feature = manifest.create({ id: opts.id, config: { view: () => cfg } });
    return { ...env, Q, feature, manifest, cfg };
}

test("scaffold output uses active directories/includes, dry run creates nothing, existing outputs are preserved", t => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "qollock-scaffold-"));
    assert.equal(path.dirname(path.resolve(temp)), path.resolve(os.tmpdir()), "cleanup target stays in the temporary directory");
    t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
    const opts = options("style-only", ["--css", "--dry-run"]);
    const preview = scaffold(opts, temp);
    assert.match(preview.include, /scripts\/manifests\/ql_scaffold_fixture\/manifest.vjs_c/);
    assert.deepEqual(fs.readdirSync(temp), []);
    opts.dryRun = false;
    const output = scaffold(opts, temp);
    assert.match(output.files[0].path, /scripts[\\/]manifests[\\/]/);
    const existing = fs.readFileSync(output.files[0].path, "utf8");
    assert.throws(() => scaffold(opts, temp), /Refusing to overwrite/);
    assert.equal(fs.readFileSync(output.files[0].path, "utf8"), existing);
    fs.unlinkSync(output.files[0].path);
    assert.throws(() => scaffold(opts, temp), /Refusing to overwrite/);
    assert.equal(fs.existsSync(output.files[0].path), false, "CSS collision must be detected before writing the manifest");
});

test("scaffold rejects invalid discovery/schema/interval choices before creating code", () => {
    assert.throws(() => generate(parseArgs(["../outside", "Name", "--type=css-only"])), /Feature ID/);
    assert.throws(() => generate(parseArgs(["ql_fixture", "Name"])), /verified native/);
    assert.throws(() => generate(options("polling", ["--poll-rate=NaN"])), /positive seconds/);
    assert.throws(() => generate(options("polling", ["--settings={}"])), /JSON array/);
    assert.throws(() => generate(options("polling", ["--enable-key=MISSING"])), /declared toggle/);
    assert.throws(() => parseArgs(["ql_fixture", "Name", "--typo"]), /Unknown flag/);
    assert.throws(() => parseArgs(["ql_fixture", "Name", "--dry-run=maybe"]), /only true or false/);
    assert.throws(() => generate(options("style-only", ['--settings=[{"key":"OFFSET","type":"slider","min":100,"max":0,"step":1,"default":3}]'])), /ordered bounds/);
    assert.throws(() => generate(options("style-only", ['--settings=[{"key":"OFFSET","type":"text","default":3}]'])), /must be a string/);
    assert.equal(parseArgs(["ql_fixture", "Name", "--css=true", "--dry-run=false"]).css, true);
});

test("style scaffold registers metadata and handles late native sources, reactive settings, replacement and cleanup", () => {
    const env = setup(options("style-only"), source => source.replace("return {};", 'return {x: cfg.OFFSET + "px"};'));
    assert.equal(env.manifest.settings[0].caption, 'Quoted "caption"');
    env.feature.onEnable();
    const core = env.sandbox.global.$.CreatePanel("Panel", env.root, "");
    core.AddClass("CoreFixture");
    const first = env.sandbox.global.$.CreatePanel("Panel", core, "SourceFixture");
    env.clock.advance(600);
    assert.equal(first.style.x, "3px");
    env.cfg.OFFSET = 22;
    env.feature.onSettingsChanged();
    assert.equal(first.style.x, "22px");
    first.SetParent(env.sandbox.global.$.CreatePanel("Panel", null, "OutsideFixture"));
    const next = env.sandbox.global.$.CreatePanel("Panel", core, "SourceFixture");
    env.clock.advance(600);
    assert.equal(first.style.x, undefined);
    assert.equal(next.style.x, "22px");
    env.feature.onDisable();
    assert.equal(next.style.x, undefined);
    env.cfg.OFFSET = 41;
    env.clock.advance(1100);
    assert.equal(next.style.x, undefined, "disabled loops cannot reacquire ownership");
    env.feature.onEnable();
    assert.equal(next.style.x, "41px");
    env.feature.onDisable();
    assert.deepEqual(env.clock.errors, []);
});

test("generated style lifecycle releases properties removed from the model and preserves unrelated native state", () => {
    const env = setup(options("style-only"), source => source.replace("return {};", 'return cfg.OFFSET ? { x: cfg.OFFSET + "px", opacity: "0.5" } : {};'));
    const core = env.sandbox.global.$.CreatePanel("Panel", env.root, ""); core.AddClass("CoreFixture");
    const panel = env.sandbox.global.$.CreatePanel("Panel", core, "SourceFixture"); panel.style.transform = "rotateZ(45deg)";
    env.feature.onEnable();
    assert.equal(panel.style.x, "3px"); assert.equal(panel.style.opacity, "0.5");
    env.cfg.OFFSET = 0; env.feature.onSettingsChanged();
    assert.equal(panel.style.x, undefined); assert.equal(panel.style.opacity, undefined);
    assert.equal(panel.style.transform, "rotateZ(45deg)");
    env.feature.onDisable(); assert.equal(panel.style.transform, "rotateZ(45deg)");
    assert.deepEqual(env.clock.errors, []);
});

test("scaffold registration follows canonical existing defaults and ranges without changing the source definitions", () => {
    const opts = options("style-only", ['--settings=[{"key":"SOULS_SCALE","type":"slider","min":0,"max":1000,"step":10,"default":3},{"key":"HUD_SOULS_ENABLED","type":"toggle","default":false}]']);
    const env = setup(opts);
    const manifest = env.manifest;
    const field = env.Q.settingsFields.find(field => field.key === "SOULS_SCALE");
    assert.equal(manifest.settings[0].default, env.sandbox.global.QOL_DEFAULT_CONFIG.SOULS_SCALE);
    assert.equal(manifest.settings[0].min, field.min); assert.equal(manifest.settings[0].max, field.max);
    assert.equal(manifest.settings[0].step, field.step);
    assert.equal(manifest.settings[1].default, true);
    assert.equal(opts.settings[0].default, 3, "registry normalization does not mutate the descriptor source");
    assert.equal(opts.settings[1].default, false);
});

test("registry unwinds generated styles after a partial enable failure and retries the same feature cleanly", () => {
    const opts = options("style-only");
    const env = setup(opts, source => source.replace("return {};", 'return {x: cfg.OFFSET + "px"};'));
    const core = env.sandbox.global.$.CreatePanel("Panel", env.root, ""); core.AddClass("CoreFixture");
    const panel = env.sandbox.global.$.CreatePanel("Panel", core, "SourceFixture");
    const registry = env.Q.core.FeatureRegistry;
    registry.boot();
    const scheduler = env.Q.core.Scheduler, createLoop = scheduler.createPollLoop;
    scheduler.createPollLoop = () => { throw new Error("scaffold fixture scheduler failure"); };
    registry.enable(opts.id);
    assert.equal(registry.isEnabled(opts.id), false); assert.equal(panel.style.x, undefined);
    scheduler.createPollLoop = createLoop;
    registry.enable(opts.id);
    assert.equal(registry.isEnabled(opts.id), true); assert.equal(panel.style.x, "3px");
    env.Q.core.ConfigStore.set(opts.id, "OFFSET", 22);
    assert.equal(panel.style.x, "22px", "real config event applies the generated cached model synchronously");
    registry.disable(opts.id);
    env.clock.advance(1100); assert.equal(panel.style.x, undefined);
    assert.deepEqual(env.clock.errors, []);
});

test("CSS scaffold owns the context class and cleans it on disable", () => {
    const env = setup(options("css-only"));
    env.feature.onEnable();
    assert.equal(env.root.BHasClass("ql_scaffold_fixture_active"), true);
    env.feature.onSettingsChanged();
    env.feature.onDisable();
    env.clock.advance(1100);
    assert.equal(env.root.BHasClass("ql_scaffold_fixture_active"), false);
});

test("polling scaffold reads the live slice and leaves unexpected failures observable", () => {
    const env = setup(options("polling"), source => source.replace("// TODO: update content;", 'if (cfg.OFFSET < 0) throw Error("fixture failure");\n                panel.text = String(cfg.OFFSET);\n                // TODO: update content;'));
    const source = env.sandbox.global.$.CreatePanel("Panel", env.root, "SourceFixture");
    env.feature.onEnable();
    assert.equal(source.text, "3");
    env.cfg.OFFSET = 9;
    env.clock.advance(600);
    assert.equal(source.text, "9");
    env.cfg.OFFSET = -1;
    assert.throws(() => env.feature.onSettingsChanged(), /fixture failure/);
    env.feature.onDisable();
});

"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { scanSource } = require("../scripts/validate_game_api_usage.js");
const registry = {
    concommands: { say: { isCheat: false }, noclip: { isCheat: true } },
    convars: { volume: { isCheat: false } },
    citadelEvents: { CitadelConCommand: {}, Activated: {} },
    citadelFunctions: {}
};

test("API validator catches static commands, multiline calls, chains and invented Citadel events", () => {
    const result = scanSource(`
        $.DispatchEvent(
            "CitadelConCommand", "say hi; invented_command 1"
        );
        $.DispatchEvent("CitadelCompletelyInvented");
        DispatchCitadelConCommand("another_fake");
        obj.dispatchCitadelConCommand("third_fake");
        $.DispatchEvent("CitadelConCommand", "volume " + "0.5");
    `, registry);
    assert.deepEqual(result.issues.filter(x => x.severity === "error").map(x => x.token), [
        "invented_command", "CitadelCompletelyInvented", "another_fake", "third_fake"
    ]);
    assert.equal(result.counts.commands, 5);
});

test("API validator ignores comments and quoted semicolons, checks template and optional calls", () => {
    const result = scanSource(`
        // $.DispatchEvent("InventedInComment");
        const example = '$.DispatchEvent("InventedInString")';
        $.DispatchEvent?.("CitadelConCommand", 'say "hello; everyone"');
        $["DispatchEvent"]("Activated");
        $.DispatchEvent("CitadelConCommand", \`volume 0.5\`);
    `, registry);
    assert.deepEqual(result.issues, []);
    assert.equal(result.counts.commands, 2);
});

test("API validator reports dynamic expressions and cheat restrictions without claiming verification", () => {
    const result = scanSource(`
        $.DispatchEvent("CitadelConCommand", commandText);
        $.DispatchEvent(eventName);
        $.DispatchEvent("CitadelConCommand", "noclip");
        $.RegisterForUnhandledEvent("InventedListener", callback);
    `, registry);
    assert.deepEqual(result.issues.map(x => x.type), [
        "UNVERIFIED_DYNAMIC_CONCOMMAND", "UNVERIFIED_DYNAMIC_EVENT", "CHEAT_CONCOMMAND", "UNKNOWN_PANORAMA_EVENT"
    ]);
    assert.equal(result.counts.dynamic, 2);
    assert.equal(result.issues[3].severity, "error");
});

test("API validator CLI fails on unknown APIs, parse failures, missing registry and empty scope", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qollock-api-"));
    const scripts = path.join(dir, "scripts");
    fs.mkdirSync(scripts);
    const data = path.join(dir, "registry.json");
    fs.writeFileSync(data, JSON.stringify(registry));
    const fixture = path.join(scripts, "fixture.js");
    const checker = path.resolve(__dirname, "../scripts/validate_game_api_usage.js");
    const run = (registryPath = data) => spawnSync(process.execPath, [checker, "--scripts-dir", scripts, "--registry", registryPath], { encoding: "utf8" });
    try {
        fs.writeFileSync(fixture, '$.DispatchEvent("CitadelConCommand", "totally_fake");');
        let result = run();
        assert.equal(result.status, 1, result.stdout + result.stderr);
        assert.match(result.stdout, /UNKNOWN_CONCOMMAND.*totally_fake/);
        fs.writeFileSync(fixture, '$.DispatchEvent("CitadelFakeEvent");');
        assert.equal(run().status, 1);
        fs.writeFileSync(fixture, 'const invalid = ;');
        assert.match(run().stdout, /PARSE_ERROR/);
        assert.equal(run().status, 1);
        fs.writeFileSync(fixture, '$.DispatchEvent("CitadelConCommand", "say hello");');
        assert.equal(run().status, 0);
        assert.equal(run(path.join(dir, "missing.json")).status, 1);
        fs.unlinkSync(fixture);
        assert.equal(run().status, 1);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test("API compatibility exception is limited to the existing listener and file", () => {
    const listener = '$.RegisterForUnhandledEvent("CitadelUserMsg_ForceShopClosed", callback);';
    const appPath = "panorama/scripts/core/ql_app.js";
    assert.equal(scanSource(listener, registry, appPath).issues[0].type, "UNVERIFIED_COMPATIBILITY_PROBE");
    assert.equal(scanSource(listener, registry, "new_feature.js").issues[0].severity, "error");
    assert.equal(scanSource('$.DispatchEvent("CitadelUserMsg_ForceShopClosed");', registry, appPath).issues[0].severity, "error");
});

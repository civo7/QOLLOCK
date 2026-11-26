"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const TOOL = path.join(ROOT, "tools", "update_hit_kill_soundevents.ps1");
const EVENTS = path.join("soundevents", "world_ambient_emitters.vsndevts");
const BUILD_SCRIPT = fs.readFileSync(path.join(ROOT, "build_mod", "build_mod.ps1"), "utf8");

// PowerShell is optional for the offline tests: the tool-running tests skip without it.
function findPowerShell() {
    for (const name of ["pwsh", "powershell"]) {
        const probe = spawnSync(name, ["-NoProfile", "-Command", "exit 0"], { stdio: "ignore" });
        if (!probe.error && probe.status === 0) return name;
    }
    return null;
}
const POWERSHELL = findPowerShell();

function copyRepoPieces() {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "qol-soundtool-"));
    fs.mkdirSync(path.join(temp, "soundevents"), { recursive: true });
    fs.mkdirSync(path.join(temp, "panorama", "scripts"), { recursive: true });
    fs.copyFileSync(path.join(ROOT, EVENTS), path.join(temp, EVENTS));
    fs.copyFileSync(path.join(ROOT, "panorama", "scripts", "ql_shared_presets.js"), path.join(temp, "panorama", "scripts", "ql_shared_presets.js"));
    fs.cpSync(path.join(ROOT, "sounds", "hitsounds"), path.join(temp, "sounds", "hitsounds"), { recursive: true });
    fs.cpSync(path.join(ROOT, "sounds", "killsounds"), path.join(temp, "sounds", "killsounds"), { recursive: true });
    return temp;
}

function runTool(temp) {
    return spawnSync(POWERSHELL, ["-NoProfile", "-File", TOOL, "-RepoRoot", temp], { encoding: "utf8" });
}

function listedFiles(eventsText, eventName) {
    const body = eventsText.match(new RegExp(`${eventName.replace(".", "\\.")} = \\n\\t\\{([^{}]*)\\}`))[1];
    return Array.from(body.matchAll(/"(sounds\/[^"]+)\.vsnd"/g), match => match[1]);
}

test("the build runs the sound events tool before it hashes and compiles anything", () => {
    const toolCall = BUILD_SCRIPT.indexOf("update_hit_kill_soundevents.ps1");
    assert.ok(toolCall > 0, "build_mod.ps1 calls the tool");
    assert.ok(toolCall < BUILD_SCRIPT.indexOf("Step 1/3: Checking for modified files"), "it runs before the hashing step");
});

test("the sound events tool leaves the committed events file unchanged", { skip: !POWERSHELL && "PowerShell not installed" }, () => {
    const temp = copyRepoPieces();
    const before = fs.readFileSync(path.join(temp, EVENTS), "utf8");
    const run = runTool(temp);
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /up to date/);
    assert.equal(fs.readFileSync(path.join(temp, EVENTS), "utf8"), before, "the committed file is exactly what the tool writes");
});

test("extra clips in an option's folder are all listed in every volume step, and removing them restores the list", { skip: !POWERSHELL && "PowerShell not installed" }, () => {
    const temp = copyRepoPieces();
    const original = fs.readFileSync(path.join(temp, EVENTS), "utf8");
    const folder = path.join(temp, "sounds", "hitsounds", "quake3");
    for (const number of ["01", "02", "42"]) fs.copyFileSync(path.join(folder, "quake300.wav"), path.join(folder, `quake3${number}.wav`));
    const run = runTool(temp);
    assert.equal(run.status, 0, run.stderr);
    const updated = fs.readFileSync(path.join(temp, EVENTS), "utf8");
    for (const volume of [0, 10, 100]) {
        assert.deepEqual(listedFiles(updated, `QOL.Hitsound.Quake3_V${volume}`).map(file => path.basename(file)),
            ["quake300", "quake301", "quake302", "quake342"], `Hitsound.Quake3_V${volume}`);
    }
    assert.deepEqual(listedFiles(updated, "QOL.Killsound.Quake3_V10").map(file => path.basename(file)), ["quake300"], "other sounds are untouched");
    for (const number of ["01", "02", "42"]) fs.rmSync(path.join(folder, `quake3${number}.wav`));
    assert.equal(runTool(temp).status, 0);
    assert.equal(fs.readFileSync(path.join(temp, EVENTS), "utf8"), original);
});

test("Custom always lists its 100 pack slots, whatever files are or are not in its folder", { skip: !POWERSHELL && "PowerShell not installed" }, () => {
    const temp = copyRepoPieces();
    const original = fs.readFileSync(path.join(temp, EVENTS), "utf8");
    assert.ok(!fs.existsSync(path.join(temp, "sounds", "hitsounds", "custom")), "the repo ships no Custom clips");
    // Stray local files in the folder, even misnamed ones, must not change or break the Custom events.
    const folder = path.join(temp, "sounds", "hitsounds", "custom");
    fs.mkdirSync(folder, { recursive: true });
    fs.copyFileSync(path.join(temp, "sounds", "hitsounds", "quake3", "quake300.wav"), path.join(folder, "mine1.wav"));
    const run = runTool(temp);
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /Hitsound\.Custom: 100 pack slot/);
    assert.equal(fs.readFileSync(path.join(temp, EVENTS), "utf8"), original);
});

test("a misnamed clip stops the tool with a clear message instead of being skipped", { skip: !POWERSHELL && "PowerShell not installed" }, () => {
    const temp = copyRepoPieces();
    const folder = path.join(temp, "sounds", "killsounds", "quake3");
    fs.copyFileSync(path.join(folder, "quake300.wav"), path.join(folder, "quake31.wav"));
    const before = fs.readFileSync(path.join(temp, EVENTS), "utf8");
    const run = runTool(temp);
    assert.notEqual(run.status, 0);
    assert.match(`${run.stdout}${run.stderr}`, /quake31\.wav: clips must be named quake300\.wav to quake399\.wav/);
    assert.equal(fs.readFileSync(path.join(temp, EVENTS), "utf8"), before, "nothing is written when a clip is misnamed");
});

test("a Windows (CRLF) events file keeps its line endings", { skip: !POWERSHELL && "PowerShell not installed" }, () => {
    const temp = copyRepoPieces();
    const file = path.join(temp, EVENTS);
    const lf = fs.readFileSync(file, "utf8");
    fs.writeFileSync(file, lf.replace(/\n/g, "\r\n"));
    const folder = path.join(temp, "sounds", "hitsounds", "quake3");
    fs.copyFileSync(path.join(folder, "quake300.wav"), path.join(folder, "quake301.wav"));
    assert.equal(runTool(temp).status, 0);
    const updated = fs.readFileSync(file, "utf8");
    assert.ok(!/[^\r]\n/.test(updated), "every line still ends in CRLF");
    assert.deepEqual(listedFiles(updated.replace(/\r\n/g, "\n"), "QOL.Hitsound.Quake3_V10").map(entry => path.basename(entry)), ["quake300", "quake301"]);
});

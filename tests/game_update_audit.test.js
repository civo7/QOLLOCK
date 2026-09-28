"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { xmlSymbols, cssSymbols, scanSource, compare } = require("../scripts/audit_game_update");

const source = (xml, css = "") => ({ version: 1, files: {
    "layout/hud.xml": { hash: xml, symbols: xmlSymbols(xml) },
    "styles/hud.css": { hash: css, symbols: cssSymbols(css) }
} });

test("update audit parses native multiline/computed calls and lexical helper aliases, ignoring comments", () => {
    const result = scanSource(`
        // p.FindChildTraverse("Comment");
        const example = 'p.FindChildTraverse("String")';
        const NAME = "Health" + "Bar";
        p["FindChildTraverse"]?.(
            NAME
        );
        const Panel = QOL.core.panel;
        const lookup = Panel.findTraverse;
        lookup(root, "Health");
        const resolve = QOL.resolveCachedPanel;
        resolve(root, "cache-key", "Health");
        QOL_UTILS.FindPanelsByClass(root, "Team");
        p.BHasClass("Visible");
        $.CreatePanel("Panel", root, "OwnPanel");
        obj.toString(); obj.constructor(); obj.hasOwnProperty("NotAPanel");
    `);
    assert.deepEqual(result.lookups.map(x => x.token), ["HealthBar", "Health", "Health", "Team", "Visible"]);
    assert.equal(result.dynamic.length, 0);
    assert.equal(result.created[0].token, "OwnPanel");
    assert.equal(result.lookups[0].line, 5);
});

test("mutable names, runtime concatenation and parameters stay unverified; shadowed aliases are not helpers", () => {
    const result = scanSource(`
        let id = "Old"; id = getId(); p.FindChildTraverse(id);
        p.FindChildTraverse("TopBarPlayer" + i);
        function f(id) { p.FindChildTraverse(id); }
        function g(QOL) { QOL.core.panel.findTraverse(root, "NotKnownHelper"); }
        const Panel = QOL.core.panel;
        function h(Panel) { Panel.findTraverse(root, "Shadowed"); }
    `);
    assert.equal(result.lookups.length, 0);
    assert.equal(result.dynamic.length, 3);
});

test("XML evidence ignores comments, tracks ancestry and accepts single quotes; CSS is only reference evidence", () => {
    const symbols = xmlSymbols(`<!-- <Panel id="Ghost"/> -->\n<root><Panel id='Parent' class='Team'><Label id="Health" /></Panel></root>`);
    assert.equal(symbols.some(x => x.token === "Ghost"), false);
    assert.equal(symbols.find(x => x.token === "Health").ancestry, "root/Panel#Parent.Team");
    assert.equal(symbols.find(x => x.token === "Health").line, 2);
    const css = cssSymbols("/* #Ghost {} */ @define color: #FFFFFF; .Alive #Health { color: #FF0000; }");
    assert.deepEqual(css.map(x => [x.token, x.evidence]), [["Alive", "css"], ["Health", "css"]]);
});

test("a Valve rename is reported even when stale mod XML still declares the old ID", () => {
    const before = source('<Panel id="Health"/>');
    const after = source('<Panel id="NewHealth"/>');
    const result = compare(before, after, scanSource('p.FindChildTraverse("Health");'), xmlSymbols('<Panel id="Health"/>'), ["layout/hud.xml"]);
    assert.equal(result.findings[0].status, "SOURCE_REMOVED");
    assert.equal(result.findings[0].modEvidence.length, 1);
    assert.deepEqual(result.changedOverrides, ["layout/hud.xml"]);
});

test("declaration loss is reported when an old CSS reference or a duplicate ID elsewhere survives", () => {
    const before = source('<Panel id="A"><Label id="Health"/></Panel><Panel id="B"><Label id="Health"/></Panel>', "#Health {}");
    const after = source('<Panel id="B"><Label id="Health"/></Panel>', "#Health {}");
    const result = compare(before, after, scanSource('p.FindChildTraverse("Health");'));
    assert.equal(result.findings[0].status, "SOURCE_CHANGED");
    const onlyCSS = compare(before, source('<Panel/>', "#Health {}"), scanSource('p.FindChildTraverse("Health");'));
    assert.equal(onlyCSS.findings[0].status, "SOURCE_CHANGED");
});

test("moved panels and removed native class references are mapped to their JS consumers", () => {
    const before = source('<Panel id="A"><Label id="Health"/></Panel>', ".NativeAlive {}");
    const after = source('<Panel id="B"><Label id="Health"/></Panel>');
    const result = compare(before, after, scanSource('p.FindChildTraverse("Health"); p.BHasClass("NativeAlive");'));
    assert.deepEqual(result.findings.map(x => [x.token, x.status]), [["Health", "SOURCE_CHANGED"], ["NativeAlive", "SOURCE_REMOVED"]]);
});

test("unchanged sources, C++ candidates and mod-created panels are kept separate", () => {
    const base = source('<Panel id="Health"/>');
    const scanned = scanSource('p.FindChildTraverse("Health"); p.FindChildTraverse("NativeDynamic"); $.CreatePanel("Panel", root, "Own"); p.FindChildTraverse("Own");');
    const result = compare(base, base, scanned);
    assert.equal(result.findings.length, 0);
    assert.equal(result.summary.unchanged, 1);
    assert.equal(result.summary.modOnly, 1);
    assert.equal(result.unresolved[0].token, "NativeDynamic");
});

test("CLI preserves baseline, rejects missing/empty sources and malformed inputs", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qollock-update-"));
    const cli = path.resolve(__dirname, "../scripts/audit_game_update.js");
    const baseline = path.join(dir, "before.json");
    const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: "utf8" });
    try {
        fs.mkdirSync(path.join(dir, "layout"));
        fs.mkdirSync(path.join(dir, "styles"));
        assert.equal(run("snapshot", "--vanilla", dir, "--baseline", baseline).status, 2);
        assert.equal(fs.existsSync(baseline), false);
        fs.writeFileSync(path.join(dir, "layout/hud.xml"), '<Panel id="Health"/>');
        fs.writeFileSync(path.join(dir, "styles/hud.css"), "#Health {}");
        let result = run("snapshot", "--vanilla", dir, "--baseline", baseline);
        assert.equal(result.status, 0, result.stderr);
        const saved = fs.readFileSync(baseline, "utf8");
        assert.equal(run("snapshot", "--vanilla", dir, "--baseline", baseline).status, 2);
        assert.equal(fs.readFileSync(baseline, "utf8"), saved);
        assert.equal(run("check", "--vanilla", dir, "--baseline", baseline, "--unknown").status, 2);
        fs.writeFileSync(baseline, "{}");
        assert.equal(run("check", "--vanilla", dir, "--baseline", baseline).status, 2);
        fs.writeFileSync(baseline, saved);
        result = run("check", "--vanilla", dir, "--baseline", baseline, "--json");
        assert.equal(result.status, 0, result.stderr);
        assert.equal(JSON.parse(result.stdout).summary.findings, 0);
        fs.writeFileSync(path.join(dir, "layout/hud.xml"), '<Panel id="Renamed"/>');
        result = run("check", "--vanilla", dir, "--baseline", baseline, "--fail-on-change");
        assert.equal(result.status, 1, result.stderr);
        assert.equal(fs.readFileSync(baseline, "utf8"), saved);
    } finally {
        assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir()));
        assert.ok(path.basename(dir).startsWith("qollock-update-"));
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { scanSource, scanDirectory } = require("../scripts/validate_panorama_styles.js");

test("style check catches extra parentheses in extracted color and gradient declarations", () => {
    for (const body of [
        "background-color: rgba(0, 0, 0, 0.80));",
        "opacity-brush: gradient( linear, 80% 0%, 100% 0%, from( rgb(255, 142, 110) ), to(rgb(240, 78, 49)) ) );"
    ]) {
        const [issue] = scanSource(`Panel {\n\t${body}\n}`, "native.css");
        assert.equal(issue.file, "native.css");
        assert.equal(issue.line, 2);
        assert.match(issue.message, /Unexpected '\)'/);
    }
});

test("style check accepts Panorama imports, defines, keyframes, nested functions and escaped strings", () => {
    const source = String.raw`
        @import url("s2r://panorama/styles/native.vcss_c");
        @define accent: #abcd;
        /* braces and quotes inside comments: } ) ] ' " */
        @keyframes 'Pulse' { 0% { transform: translateX(2px) rotateZ(-3deg); } }
        Panel:disabled:not(.Hidden) {
            background-color: gradient( linear, 0% 0%, 100% 100%, from( rgba(1, 2, 3, 0.5) ), to( accent ) );
            background-image: url("s2r://panorama/images/a{b}([c]).vtex");
            font-family: "quoted\"font";
            width: fill-parent-flow(1);
        }
    `;
    assert.deepEqual(scanSource(source), []);
});

test("style check reports mixed, missing and unmatched delimiters at their source location", () => {
    for (const source of ["Panel { color: rgb(1, 2, 3]; }", "Panel {", ")"]) {
        assert.equal(scanSource(source).length, 1);
    }
    assert.deepEqual(scanSource("\nPanel {"), [{ file: "<source>", line: 2, column: 7, message: "Unclosed '{'" }]);
});

test("style check rejects unterminated comments and strings instead of masking the remaining file", () => {
    assert.match(scanSource("Panel {}\n/* trailing comment")[0].message, /Unterminated block comment/);
    assert.match(scanSource('Panel { background-image: url("unterminated); }')[0].message, /Unterminated quoted string/);
});

test("style check enforces the complete selector-list buffer, including the terminating byte", () => {
    // Every individual selector is short; only their comma-separated list exceeds
    // the reader's buffer, as in the former combined Emo/Ocean rule.
    const selectors = Array.from({ length: 64 }, (_,index) => ".entry" + String(index).padStart(2, "0") + "a".repeat(23));
    const header = selectors.join(",");
    assert.equal(Buffer.byteLength(header), 2047);
    assert.deepEqual(scanSource(header + " { color: #fff; }"), []);
    const [issue] = scanSource(header + "a { color: #fff; }");
    assert.match(issue.message, /Selector list is 2048 bytes/);
    assert.equal(issue.line, 1);
    assert.equal(issue.column, 1);
    const split = [selectors.slice(0, 32), selectors.slice(32)]
        .map(group => group.join(",") + " { color: #fff; }").join("\n");
    assert.deepEqual(scanSource(split), []);
});

test("selector budget counts UTF-8 bytes, skips comments and does not cap property strings", () => {
    const header = Array.from({ length: 64 }, (_,index) => ".entry" + String(index).padStart(2, "0") + "a".repeat(23)).join(",");
    assert.match(scanSource(header.replace("a", "я") + " { color: #fff; }")[0].message, /Selector list is 2048 bytes/);
    assert.deepEqual(scanSource("/*" + "x".repeat(4000) + "*/" + header + " { color: #fff; }"), []);
    assert.deepEqual(scanSource('Panel { background-image: url("' + "x".repeat(4000) + '"); }'), []);
});

test("all shipped styles pass the lexical gate, including imported native base styles", () => {
    const result = scanDirectory(path.join(__dirname, "..", "panorama", "styles"));
    assert.ok(result.files.some(file => file.endsWith(path.join("base", "citadel_base_styles.css"))));
    assert.deepEqual(result.issues, []);
});

test("style CLI fails for malformed, empty and missing sources and accepts repaired sources", t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "qollock-styles-"));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const tool = path.join(__dirname, "..", "scripts", "validate_panorama_styles.js");
    const run = target => spawnSync(process.execPath, [tool, target], { encoding: "utf8" });
    assert.equal(run(directory).status, 1);
    assert.equal(run(path.join(directory, "missing")).status, 1);
    const nested = path.join(directory, "base");
    fs.mkdirSync(nested);
    const file = path.join(nested, "native.css");
    fs.writeFileSync(file, "Panel { color: rgba(0, 0, 0, 0.80)); }");
    const failed = run(directory);
    assert.equal(failed.status, 1);
    assert.match(failed.stderr, /native\.css:1:\d+: Unexpected/);
    fs.writeFileSync(file, "Panel { color: rgba(0, 0, 0, 0.80); }");
    assert.equal(run(directory).status, 0);
});

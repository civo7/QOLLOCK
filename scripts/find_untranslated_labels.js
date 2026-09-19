// find_untranslated_labels.js — find dropdown/option `label:` strings missing from the language maps.
//
// Statically harvests `label: "..."` literals across UI scripts (controls.js, gameplay_tabs.js, etc.)
// and reports the ones with no locale map entry.

"use strict";

const fs = require("fs");
const path = require("path");
const { PROJECT_ROOT, loadLocaleMaps } = require("./locales_helper");

function unq(s) {
    try {
        return JSON.parse('"' + s + '"');
    } catch (_) {
        return s;
    }
}

function main() {
    const uiDir = path.join(PROJECT_ROOT, "panorama", "scripts", "ui");
    const files = fs.readdirSync(uiDir).filter(f => f.endsWith(".js"));

    const labels = new Set();
    const re = /\blabel\s*:\s*"((?:\\.|[^"\\])*)"/g;

    for (const f of files) {
        const src = fs.readFileSync(path.join(uiDir, f), "utf8");
        let m;
        while ((m = re.exec(src))) {
            const val = unq(m[1]).trim();
            if (val) labels.add(val);
        }
    }

    const { maps } = loadLocaleMaps();
    const enMap = maps.en || {};

    const missing = [...labels].filter(l => !Object.prototype.hasOwnProperty.call(enMap, l)).sort();

    if (process.argv.includes("--json")) {
        console.log(JSON.stringify(missing, null, 2));
    } else {
        console.log("Total distinct option labels: " + labels.size);
        console.log("Labels NOT in English map:    " + missing.length);
        missing.forEach(l => console.log("  • " + l));
    }
}

main();

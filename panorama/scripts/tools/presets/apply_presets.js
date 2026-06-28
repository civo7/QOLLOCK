// One-shot: replace the 8 updated player preset blocks in ql_shared_presets.js
// with freshly-decoded diff-from-default objects (from decoded_presets.json).
const fs = require("fs");
const path = require("path");

const sharedPath = path.join(__dirname, "..", "..", "ql_shared_presets.js");
const decoded = JSON.parse(fs.readFileSync(path.join(__dirname, "decoded_presets.json"), "utf8"));
let src = fs.readFileSync(sharedPath, "utf8");

function fmtVal(v) {
    if (typeof v === "string") return JSON.stringify(v);
    return String(v);
}

function bodyLines(obj, indent) {
    const keys = Object.keys(obj).sort();
    return keys.map(function(k) { return indent + k + ": " + fmtVal(obj[k]); });
}

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

// form: "assign" -> QOL_PRESETS["KEY"] = { ... };   "member" -> indented  "KEY": { ... },
const TARGETS = [
    { key: "Synthronix",   form: "assign" },
    { key: "munchkinman",  form: "assign" },
    { key: "Xavier",       form: "member" },
    { key: "Jared",        form: "member" },
    { key: "Basil",        form: "member" },
    { key: "Neonvoid",     form: "member" },
    { key: "ninjabladeJr", form: "assign" },
    { key: "BSQTT",        form: "member" }
];

TARGETS.forEach(function(t) {
    const obj = decoded[t.key];
    if (!obj) { console.error("no decoded data for " + t.key); process.exit(1); }
    let re, replacement;
    if (t.form === "assign") {
        re = new RegExp("QOL_PRESETS\\[\"" + escapeRe(t.key) + "\"\\] = \\{[\\s\\S]*?\\n\\};");
        replacement = "QOL_PRESETS[\"" + t.key + "\"] = {\n" + bodyLines(obj, "    ").join(",\n") + "\n};";
    } else {
        re = new RegExp("^ {4}\"" + escapeRe(t.key) + "\": \\{[\\s\\S]*?\\n {4}\\},", "m");
        replacement = "    \"" + t.key + "\": {\n" + bodyLines(obj, "        ").join(",\n") + "\n    },";
    }
    const m = src.match(re);
    if (!m) { console.error("NO MATCH for " + t.key + " (" + t.form + ")"); process.exit(1); }
    src = src.replace(re, function() { return replacement; });
    console.log("replaced " + t.key + " (" + Object.keys(obj).length + " keys, " + t.form + ")");
});

fs.writeFileSync(sharedPath, src);
console.log("Wrote ql_shared_presets.js");

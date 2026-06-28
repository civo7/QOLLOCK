// find_untranslated_labels.js — find dropdown/option `label:` strings missing from the language maps.
//
// Complements find_untranslated.js. That finder runs at settings-BUILD time, so it misses strings
// that are only localized on hover or when a dropdown is expanded (palette color names, healthbar
// style names, option labels rendered raw at the option-list level). This script statically harvests
// every `label: "..."` literal in ql_settings.js and reports the ones with no map entry.
const fs = require("fs");
const path = require("path");
const settingsPath = path.resolve(__dirname, "..", "panorama", "scripts", "ql_settings.js");
const src = fs.readFileSync(settingsPath, "utf8");

function unq(s) { return JSON.parse('"' + s + '"'); }

// Harvest `label: "..."` literals (option arrays).
const labels = new Set();
const re = /\blabel\s*:\s*"((?:\\.|[^"\\])*)"/g;
let m;
while ((m = re.exec(src))) labels.add(unq(m[1]));

// Map keys of the RU map (all maps share the same key set after import).
function mapKeys(varName) {
  const start = src.indexOf("const " + varName + " = {");
  const end = src.indexOf("\n};", start);
  const body = src.slice(start, end);
  const kre = /^\s*"((?:\\.|[^"\\])*)"\s*:/gm;
  const keys = new Set();
  let mm;
  while ((mm = kre.exec(body))) keys.add(unq(mm[1]));
  return keys;
}
const ru = mapKeys("SETTINGS_RU_TEXT");

const missing = [...labels].filter(l => l.trim() && !ru.has(l)).sort();
if (process.argv.includes("--json")) {
  console.log(JSON.stringify(missing, null, 0));
} else {
  console.log("total distinct option labels: " + labels.size);
  console.log("labels NOT in maps:           " + missing.length);
  missing.forEach(l => console.log("  • " + l));
}

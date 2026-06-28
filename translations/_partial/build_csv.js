// build_csv.js — assemble the supplemental translator CSV from the per-language partial JSONs.
// One row per missing English key, one column per language, in import_translations.js header order.
const fs = require("fs");
const path = require("path");
const here = __dirname;
const keys = require(path.join(here, "..", "..", "missing.tmp.json"));
const LANGS = [
  ["English", null], ["Russian", "SETTINGS_RU_TEXT"], ["Ukrainian", "SETTINGS_UK_TEXT"],
  ["Polish", "SETTINGS_PL_TEXT"], ["Bulgarian", "SETTINGS_BG_TEXT"], ["Belarusian", "SETTINGS_BY_TEXT"],
  ["Japanese", "SETTINGS_JA_TEXT"], ["Chinese", "SETTINGS_ZH_TEXT"], ["French", "SETTINGS_FR_TEXT"],
  ["Portuguese", "SETTINGS_PT_TEXT"], ["BR Portuguese", "SETTINGS_PT_BR_TEXT"], ["Spanish", "SETTINGS_ES_TEXT"]
];
const maps = {};
for (const [, v] of LANGS) if (v) maps[v] = require(path.join(here, v + ".json"));
function cell(s) {
  s = String(s == null ? "" : s);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
const lines = [];
lines.push(LANGS.map(l => cell(l[0])).join(","));
for (const k of keys) {
  const row = [cell(k)];
  for (const [, v] of LANGS) { if (!v) continue; row.push(cell(maps[v][k] == null ? "" : maps[v][k])); }
  lines.push(row.join(","));
}
fs.writeFileSync(path.join(here, "supplemental.csv"), "﻿" + lines.join("\r\n") + "\r\n", "utf8");
console.log("wrote supplemental.csv with " + keys.length + " rows, " + LANGS.length + " cols");

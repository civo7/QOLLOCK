// build_csv.js — assemble the supplemental CSV (round 2: color names + minimap camp labels).
const fs = require("fs");
const path = require("path");
const here = __dirname;
const s = require(path.join(here, "strings.json"));
const keys = [...s.colors, ...s.camps];
const LANGS = [
  ["English", null], ["Russian", "SETTINGS_RU_TEXT"], ["Ukrainian", "SETTINGS_UK_TEXT"],
  ["Polish", "SETTINGS_PL_TEXT"], ["Bulgarian", "SETTINGS_BG_TEXT"], ["Belarusian", "SETTINGS_BY_TEXT"],
  ["Japanese", "SETTINGS_JA_TEXT"], ["Chinese", "SETTINGS_ZH_TEXT"], ["French", "SETTINGS_FR_TEXT"],
  ["Portuguese", "SETTINGS_PT_TEXT"], ["BR Portuguese", "SETTINGS_PT_BR_TEXT"], ["Spanish", "SETTINGS_ES_TEXT"]
];
const maps = {};
for (const [, v] of LANGS) if (v) maps[v] = require(path.join(here, v + ".json"));
function cell(x) { x = String(x == null ? "" : x); return /[",\r\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; }
const lines = [LANGS.map(l => cell(l[0])).join(",")];
for (const k of keys) {
  const row = [cell(k)];
  for (const [, v] of LANGS) { if (!v) continue; row.push(cell(maps[v][k] == null ? "" : maps[v][k])); }
  lines.push(row.join(","));
}
fs.writeFileSync(path.join(here, "supplemental2.csv"), "﻿" + lines.join("\r\n") + "\r\n", "utf8");
console.log("wrote supplemental2.csv with " + keys.length + " rows, " + LANGS.length + " cols");

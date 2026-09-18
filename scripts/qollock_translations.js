// scripts/qollock_translations.js — CLI wrapper delegating to export/import translation scripts.

"use strict";

const { spawnSync } = require("child_process");
const path = require("path");

const mode = String(process.argv[2] || "export").toLowerCase();
const scriptName = (mode === "import" || mode === "--import")
    ? "import_translations.js"
    : "export_translations.js";

const scriptPath = path.join(__dirname, scriptName);
const args = process.argv.slice(3);

const res = spawnSync(process.execPath, [scriptPath, ...args], { stdio: "inherit" });
process.exit(res.status || 0);

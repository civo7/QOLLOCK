"use strict";
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const modes = { export: "export_translations.js", import: "import_translations.js", "json-export": "export_locales_json.js", "json-import": "import_locales_json.js", sync: "sync_translations.js" };
const mode = String(process.argv[2] || "export").replace(/^--/, "").toLowerCase();
if (!modes[mode]) { console.error("Expected export, import, json-export, json-import or sync"); process.exitCode = 1; }
else {
    const result = spawnSync(process.execPath, [path.join(__dirname, modes[mode]), ...process.argv.slice(3)], { stdio: "inherit" });
    if (result.error) console.error(result.error.message);
    process.exitCode = result.status ?? 1;
}


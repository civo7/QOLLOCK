// scripts/simulator/layout.js
// =============================================================================
// Reads script load order straight out of the real Panorama layout files.
// =============================================================================
// Why this exists: the old harness (panorama/scripts/tools/qollock_smoke_test.js)
// hardcoded a 22-entry load order array that drifted from panorama/layout/hud.xml
// — it listed a phantom ql_update_checker.js, put ql_core.js last instead of
// before the features, never loaded core/ql_app.js at all (so nothing was ever
// booted), and loaded ~20 deliberately commented-out includes. Deriving the
// order from the XML makes that class of drift impossible.
// =============================================================================

"use strict";

const fs = require("node:fs");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..", "..");

/**
 * Strip XML comments before scanning for includes.
 *
 * This is the whole reason to preprocess rather than regex the raw text: hud.xml
 * carries ~20 cut-over includes that are commented out and MUST NOT load. A
 * naive /<include src=.../> sweep picks them all up.
 *
 * Comments are replaced with equal-length whitespace so reported line numbers
 * still match the source file.
 */
function stripXmlComments(xml) {
    return xml.replace(/<!--[\s\S]*?-->/g, (match) => match.replace(/[^\n]/g, " "));
}

/** s2r://panorama/scripts/foo/bar.vjs_c  ->  <repo>/panorama/scripts/foo/bar.js */
function resolveScriptSrc(src) {
    const cleaned = String(src).replace(/^s2r:\/\//, "");
    if (!cleaned.startsWith("panorama/scripts/")) return null;
    const asSource = cleaned.replace(/\.vjs_c$/, ".js");
    return path.join(REPO_ROOT, asSource.split("/").join(path.sep));
}

/**
 * Ordered list of script paths from a layout's <scripts> block.
 * Returns { scripts: [{src, absPath, line, exists}], missing: [...] }.
 *
 * Missing files are reported rather than thrown so the caller decides — a
 * layout referencing a deleted script is a real bug we want surfaced loudly,
 * but the caller may want the rest of the list anyway for diagnostics.
 */
function parseLayoutScripts(layoutPath) {
    const raw = fs.readFileSync(layoutPath, "utf8");
    const stripped = stripXmlComments(raw);

    // Narrow to the <scripts> block so a <styles> include can never leak in.
    const blockMatch = stripped.match(/<scripts>([\s\S]*?)<\/scripts>/);
    if (!blockMatch) {
        throw new Error(`[layout] no <scripts> block in ${layoutPath}`);
    }
    const blockStart = stripped.indexOf(blockMatch[1]);
    const block = blockMatch[1];

    const scripts = [];
    const missing = [];
    const includeRe = /<include\s+src\s*=\s*"([^"]+)"\s*\/?>/g;
    let m;
    while ((m = includeRe.exec(block)) !== null) {
        const absPath = resolveScriptSrc(m[1]);
        if (!absPath) continue;
        const line = stripped.slice(0, blockStart + m.index).split("\n").length;
        const exists = fs.existsSync(absPath);
        const entry = { src: m[1], absPath, line, exists };
        scripts.push(entry);
        if (!exists) missing.push(entry);
    }

    return { scripts, missing, layoutPath };
}

const HUD_LAYOUT = path.join(REPO_ROOT, "panorama", "layout", "hud.xml");
const SETTINGS_LAYOUT = path.join(REPO_ROOT, "panorama", "layout", "hud_escape_menu.xml");

function hudScripts() {
    return parseLayoutScripts(HUD_LAYOUT);
}

function settingsScripts() {
    return parseLayoutScripts(SETTINGS_LAYOUT);
}

module.exports = {
    REPO_ROOT,
    HUD_LAYOUT,
    SETTINGS_LAYOUT,
    stripXmlComments,
    resolveScriptSrc,
    parseLayoutScripts,
    hudScripts,
    settingsScripts,
};

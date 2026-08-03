#!/usr/bin/env node
// cutover_manifest.js — Apply dual-dispatch cut-over for a FeatureRegistry manifest.
//
// Usage: node tools/cutover_manifest.js <manifest_id>
// Example: node tools/cutover_manifest.js ql_urn_timer
//
// Applies three changes:
//   A. Dual-dispatch guard in old feature file (FR.isEnabled check)
//   B. Gate guard in ql_core.js ResolveRuntimeGates()
//   C. Comments out old <include> in hud.xml
//
// Skips any step already applied. Runs smoke test after all changes.

"use strict";

var fs = require("fs");
var path = require("path");
var child_process = require("child_process");

var ROOT = path.resolve(__dirname, "..");
var FEATURES_DIR = path.join(ROOT, "panorama", "scripts", "features");
var CORE_JS = path.join(ROOT, "panorama", "scripts", "ql_core.js");
var HUD_XML = path.join(ROOT, "panorama", "layout", "hud.xml");
var SMOKE_TEST = path.join(ROOT, "panorama", "scripts", "tools", "qollock_smoke_test.js");

// ── Mapping table: manifest ID → { featFile, regName, includeSrc, gateLine (in ql_core.js) }
//     gateLine: the line pattern to find in ResolveRuntimeGates to add the guard BEFORE.
var MANIFEST_MAP = {
    "ql_urn_timer": {
        featFile: "ql_feat_urntimer.js",
        regName: "urnTimer",
        includeSrc: "ql_feat_urntimer.vjs_c",
        gateLine: "gates.urnTimer",
        gateVar: "_urnManifestActive",
        updateSig: "update: function(root, cfg, nowMs)"
    },
    "ql_unsecured_souls_timer": {
        featFile: "ql_feat_unsecuredsouls.js",
        regName: "unsecuredSoulsTimer",
        includeSrc: "ql_feat_unsecuredsouls.vjs_c",
        gateLine: "gates.unsecuredSouls = (gates.unsecuredSoulsActive",
        gateVar: "_unsecuredSoulsManifestActive"
    },
    "ql_better_unsecured_hud": {
        featFile: "ql_feat_betterunsecuredhud.js",
        regName: "betterUnsecuredHud",
        includeSrc: "ql_feat_betterunsecuredhud.vjs_c",
        gateLine: "gates.betterUnsecuredHud = gates.betterUnsecuredHudActive",
        gateVar: "_betterUnsecuredHudManifestActive"
    },
    "ql_color_warnings": {
        featFile: "ql_feat_colorwarnings.js",
        regName: "colorWarning",
        includeSrc: "ql_feat_colorwarnings.vjs_c",
        // Three registrations in one file — gate all three
        gateLine: "gates.colorWarning = gates.colorWarningActive",
        gateVar: "_colorWarningsManifestActive",
        multiGate: ["colorWarning", "enemyColorWarning", "allyColorWarning"]
    },
    "ql_ammo": {
        featFile: "ql_feat_ammo.js",
        regName: "ammo",
        includeSrc: "ql_feat_ammo.vjs_c",
        gateLine: "gates.ammo = gates.ammoActive",
        gateVar: "_ammoManifestActive",
        updateSig: "update: function(root, cfg)"
    },
    "ql_bottom_bar": {
        featFile: "ql_feat_bottombar.js",
        regName: "bottomBarRuntime",
        includeSrc: "ql_feat_bottombar.vjs_c",
        gateLine: "gates.bottomBarRuntime = ",
        gateVar: "_bottomBarManifestActive",
        updateSig: "update: function(root, cfg)"
    },
    "ql_damage_impact": {
        featFile: "ql_feat_damageimpact.js",
        regName: "damageImpactRuntime",
        includeSrc: "ql_feat_damageimpact.vjs_c",
        gateLine: "gates.damageImpactRuntime = gates.damageImpactRuntimeActive",
        gateVar: "_damageImpactManifestActive",
        updateSig: "update: function(root, cfg)"
    },
    "ql_items": {
        featFile: "ql_feat_items.js",
        regName: "itemsRuntime",
        includeSrc: "ql_feat_items.vjs_c",
        gateLine: "gates.itemsRuntime = gates.itemsRuntimeActive",
        gateVar: "_itemsManifestActive",
        updateSig: "update: function(root, cfg)"
    },
    "ql_souls": {
        featFile: "ql_feat_souls.js",
        regName: "soulsRuntime",
        includeSrc: "ql_feat_souls.vjs_c",
        gateLine: "gates.soulsRuntime = gates.soulsRuntimeActive",
        gateVar: "_soulsManifestActive",
        updateSig: "update: function(root, cfg)"
    },
    "ql_stamina": {
        featFile: "ql_feat_stamina.js",
        regName: "staminaChargeColorRuntime",
        includeSrc: "ql_feat_stamina.vjs_c",
        gateLine: "gates.staminaChargeColorRuntime = ",
        gateVar: "_staminaManifestActive",
        updateSig: "update: function(root, cfg)"
    },
    "ql_topbar": {
        featFile: "ql_feat_topbar.js",
        regName: "topBarRuntime",
        includeSrc: "ql_feat_topbar.vjs_c",
        gateLine: "gates.topBarRuntime = gates.topBarRuntimeActive",
        gateVar: "_topbarManifestActive",
        updateSig: "update: function(root, cfg)"
    },
    "ql_minimap_runtime": {
        featFile: "ql_feat_minimapruntime.js",
        regName: "minimapRuntime",
        includeSrc: "ql_feat_minimapruntime.vjs_c",
        gateLine: "gates.minimapRuntime = ",
        gateVar: "_minimapManifestActive",
        updateSig: "update: function(root, cfg, nowMs, State, hideoutConnected, raw)"
    },
    "ql_recent_purchases": {
        featFile: "ql_feat_recentpurchases.js",
        regName: "recentPurchases",
        includeSrc: "ql_feat_recentpurchases.vjs_c",
        gateLine: "gates.recentPurchases = gates.recentPurchasesActive",
        gateVar: "_recentPurchasesManifestActive",
        updateSig: "update: function(root, cfg)"
    }
};

// Default update signature
function defaultUpdateSig(featFile) {
    return "update: function(root, cfg";
}

// ── Helpers ──

function backup(filePath) {
    var bak = filePath + ".cutover_bak";
    if (!fs.existsSync(bak)) {
        fs.copyFileSync(filePath, bak);
        console.log("  Backup: " + path.basename(filePath) + " → " + path.basename(bak));
    }
}

function smokeTest() {
    console.log("\n── Running smoke test ──");
    try {
        child_process.execSync("node " + SMOKE_TEST, { cwd: ROOT, stdio: "inherit", timeout: 30000 });
        console.log("  Smoke test: PASS");
        return true;
    } catch (e) {
        console.error("  Smoke test: FAILED!");
        console.error(e.stderr ? e.stderr.toString() : String(e.message));
        return false;
    }
}

// ── Step A: Dual-dispatch guard in old feature file ──

function stepA_dualDispatchGuard(manifestId, info) {
    var featPath = path.join(FEATURES_DIR, info.featFile);
    if (!fs.existsSync(featPath)) {
        console.log("  SKIP Step A: old feature file not found: " + info.featFile);
        return true;
    }

    var content = fs.readFileSync(featPath, "utf8");

    // Check if guard already present
    if (content.indexOf("FR.isEnabled(\"" + manifestId + "\")") !== -1) {
        console.log("  SKIP Step A: dual-dispatch guard already present in " + info.featFile);
        return true;
    }

    backup(featPath);

    // Find the update function body and insert guard after the opening try {
    // Pattern: /update:\s*function\([^)]*\)\s*\{[\s\S]*?try\s*\{/
    var updateSig = info.updateSig || defaultUpdateSig(info.featFile);
    var sigIdx = content.indexOf(updateSig);
    if (sigIdx === -1) {
        console.error("  ERROR: Could not find update signature '" + updateSig + "' in " + info.featFile);
        return false;
    }

    // Find the `try {` after the update signature
    var afterSig = content.substring(sigIdx);
    var tryIdx = afterSig.indexOf("try {");
    if (tryIdx === -1) {
        // No try/catch — insert guard before the first line of the function body
        var openBrace = afterSig.indexOf("{");
        var insertPos = sigIdx + openBrace + 1;
        var guard = "\n                // P1: skip when new manifest is active to prevent dual execution\n" +
            "                var _mfActive = false;\n" +
            "                try { if (typeof QOL !== \"undefined\" && QOL.core && QOL.core.FeatureRegistry) { _mfActive = QOL.core.FeatureRegistry.isEnabled(\"" + manifestId + "\"); } } catch(e) {}\n" +
            "                if (_mfActive) return;";
        content = content.substring(0, insertPos) + guard + content.substring(insertPos);
    } else {
        // Insert right after `try {`
        var insertPos = sigIdx + tryIdx + 6; // after "try {"
        var guard = "\n                    // P1: skip when new manifest is active to prevent dual execution\n" +
            "                    var _mfActive = false;\n" +
            "                    try { if (typeof QOL !== \"undefined\" && QOL.core && QOL.core.FeatureRegistry) { _mfActive = QOL.core.FeatureRegistry.isEnabled(\"" + manifestId + "\"); } } catch(e) {}\n" +
            "                    if (_mfActive) return;";
        content = content.substring(0, insertPos) + guard + content.substring(insertPos);
    }

    fs.writeFileSync(featPath, content, "utf8");
    console.log("  Step A: Added dual-dispatch guard to " + info.featFile);
    return true;
}

// ── Step B: Gate guard in ql_core.js ResolveRuntimeGates() ──

function stepB_gateGuard(manifestId, info) {
    var content = fs.readFileSync(CORE_JS, "utf8");

    var gateVar = info.gateVar || ("_" + info.regName + "ManifestActive");

    // Check if guard already present
    if (content.indexOf(gateVar) !== -1) {
        console.log("  SKIP Step B: gate guard '" + gateVar + "' already present in ql_core.js");
        return true;
    }

    // Find the gate line
    var gateLine = info.gateLine;
    if (!gateLine) {
        console.log("  SKIP Step B: no gateLine defined for " + manifestId);
        return true;
    }

    var lineIdx = content.indexOf(gateLine);
    if (lineIdx === -1) {
        console.error("  ERROR: Could not find gate line '" + gateLine + "' in ql_core.js");
        return false;
    }

    backup(CORE_JS);

    // Find the start of this line (go back to previous newline)
    var lineStart = content.lastIndexOf("\n", lineIdx) + 1;
    var indent = "";
    var i = lineStart;
    while (content[i] === " " || content[i] === "\t") { indent += content[i]; i++; }

    // Build the gate guard block
    var guardBlock = "// P1: skip when new manifest is active to prevent dual execution\n" +
        indent + "var " + gateVar + " = false;\n" +
        indent + "try { if (typeof QOL !== \"undefined\" && QOL.core && QOL.core.FeatureRegistry) { " + gateVar + " = QOL.core.FeatureRegistry.isEnabled(\"" + manifestId + "\"); } } catch(e) {}\n" +
        indent + "if (!" + gateVar + ") { ";

    // Insert guard + wrap closing
    // Find the end of the gate assignment line (semicolon)
    var afterGate = content.substring(lineIdx);
    var semicolonIdx = afterGate.indexOf(";");
    if (semicolonIdx === -1) {
        console.error("  ERROR: Could not find end of gate assignment");
        return false;
    }

    var endPos = lineIdx + semicolonIdx + 1;
    var before = content.substring(0, lineStart);
    var gateAssign = content.substring(lineStart, endPos);
    var after = content.substring(endPos);

    content = before + guardBlock + gateAssign + " }" + after;

    fs.writeFileSync(CORE_JS, content, "utf8");
    console.log("  Step B: Added gate guard for " + manifestId + " in ql_core.js");
    return true;
}

// ── Step C: Comment out old <include> in hud.xml ──

function stepC_hudXml(manifestId, info) {
    var content = fs.readFileSync(HUD_XML, "utf8");

    var includeSrc = info.includeSrc;
    if (!includeSrc) {
        console.log("  SKIP Step C: no includeSrc defined for " + manifestId);
        return true;
    }

    // Check if already commented out
    if (content.indexOf("<!-- CUT-OVER:") !== -1 && content.indexOf(includeSrc) !== -1) {
        // Check if it's already in a comment
        var idx = content.indexOf(includeSrc);
        var before = content.substring(Math.max(0, idx - 50), idx);
        if (before.indexOf("<!--") !== -1) {
            console.log("  SKIP Step C: old include already commented out in hud.xml");
            return true;
        }
    }

    // Find the include line
    var includeLine = "<include src=\"s2r://panorama/scripts/features/" + includeSrc + "\" />";
    var lineIdx = content.indexOf(includeLine);
    if (lineIdx === -1) {
        console.error("  ERROR: Could not find include line for " + includeSrc + " in hud.xml");
        return false;
    }

    backup(HUD_XML);

    var cutoverComment = "<!-- CUT-OVER: old " + info.regName + " disabled, see manifests/" + manifestId + "/ -->";
    var commentedLine = "<!-- " + includeLine + " -->";

    content = content.replace(includeLine, cutoverComment + "\n\t\t" + commentedLine);

    fs.writeFileSync(HUD_XML, content, "utf8");
    console.log("  Step C: Commented out old include in hud.xml");
    return true;
}

// ── Main ──

var manifestId = process.argv[2];
if (!manifestId) {
    console.error("Usage: node tools/cutover_manifest.js <manifest_id>");
    console.error("Example: node tools/cutover_manifest.js ql_urn_timer");
    process.exit(1);
}

var info = MANIFEST_MAP[manifestId];
if (!info) {
    console.error("ERROR: Unknown manifest ID: " + manifestId);
    console.error("Available manifest IDs:");
    Object.keys(MANIFEST_MAP).sort().forEach(function(k) { console.error("  " + k); });
    process.exit(1);
}

console.log("=== QOLLOCK Cut-Over: " + manifestId + " ===");
console.log("  Old feature: " + info.featFile);
console.log("  Registration: " + info.regName);
console.log("");

var ok = true;

ok = stepA_dualDispatchGuard(manifestId, info) && ok;
ok = stepB_gateGuard(manifestId, info) && ok;
ok = stepC_hudXml(manifestId, info) && ok;

if (!ok) {
    console.error("\nCut-over FAILED. Restore from .cutover_bak files and fix issues manually.");
    process.exit(1);
}

console.log("\nAll three steps applied. Running validation...");
if (!smokeTest()) {
    console.error("\nSmoke test FAILED after cut-over. Restore from .cutover_bak files.");
    process.exit(1);
}

console.log("\n=== Cut-over complete: " + manifestId + " ===");
console.log("Next steps:");
console.log("  1. Repack and test in-game");
console.log("  2. Verify feature works with only the new manifest");
console.log("  3. Run preset cycle");
console.log("  4. Commit with: git commit -m 'cutover: " + manifestId + " manifest'");

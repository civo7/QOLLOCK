#!/usr/bin/env node
/**
 * qollock_smoke_test.js — Phase 0.2 Smoke Test Harness
 *
 * Loads all QOLLOCK JS files in dependency order, creates mock Panorama
 * globals, runs self-test blocks, and reports pass/fail per file.
 *
 * Usage: node panorama/scripts/tools/qollock_smoke_test.js
 *
 * Does NOT require the game — catches syntax errors, missing imports,
 * and basic reference errors without needing Deadlock.
 */

"use strict";

var fs = require("fs");
var path = require("path");
var vm = require("vm");

var SCRIPTS_DIR = path.resolve(__dirname, "..");
var FEATURES_DIR = path.join(SCRIPTS_DIR, "features");
var MANIFESTS_DIR = path.join(SCRIPTS_DIR, "manifests");

// ── Mock Panorama globals ──
var mockLog = [];
global.$ = {
    Msg: function() { mockLog.push("[Msg] " + Array.prototype.join.call(arguments, " ")); },
    Schedule: function(delay, cb) { return setTimeout(cb, delay * 1000); },
    CancelScheduled: function(h) { clearTimeout(h); },
    GetContextPanel: function() { return { id: "Hud", FindChildTraverse: function() { return null; }, FindChildrenWithClassTraverse: function() { return []; }, BHasClass: function() { return false; }, SetHasClass: function() {}, AddClass: function() {}, RemoveClass: function() {}, SetAttributeString: function() {}, GetAttributeString: function() { return ""; }, IsValid: function() { return true; }, GetParent: function() { return null; }, Children: function() { return []; }, GetChild: function() { return null; }, GetChildCount: function() { return 0; }, SetPanelEvent: function() {}, style: {} }; },
    DispatchEvent: function() {},
    DispatchEventAsync: function() {},
    RegisterEventHandler: function() {},
    RegisterForUnhandledEvent: function() {},
    FindChildInContext: function() { return null; },
    CreatePanel: function(type, parent, id) { return { id: id || "mockPanel", FindChildTraverse: function() { return null; }, BHasClass: function() { return false; }, SetHasClass: function() {}, AddClass: function() {}, RemoveClass: function() {}, style: {} }; },
    Localize: function(t) { return t; },
    Language: function() { return "english"; },
    FrameTime: function() { return Date.now() / 1000; },
    DbgIsReloadingScript: function() { return false; },
    HTMLEscape: function(t) { return t; },
    Warning: function() {},
    AssertHelper: function() {},
    Each: function() {},
    MousePosition: function() { return { x: 0, y: 0 }; },
    BImageFileExists: function() { return false; },
    LogChannel: function() { return {}; },
    AsyncWebRequest: function() { return {}; }
};
global.GameUI = { CustomUIConfig: function() { return null; } };
global.Game = { GetMapInfo: function() { throw new Error("Not available"); } };
global.Date = Date;
global.window = global;
global.globalThis = global;

// ── HUD context load order (from hud.xml) ──
var HUD_LOAD_ORDER = [
    // Core modules (Phase 1+ infrastructure — loaded first)
    path.join("core", "ql_namespace.js"),
    path.join("core", "ql_logger.js"),
    path.join("core", "ql_event_bus.js"),
    path.join("core", "ql_scheduler.js"),
    path.join("core", "ql_panel_helpers.js"),
    path.join("core", "ql_hud.js"),
    path.join("core", "ql_time.js"),
    path.join("core", "ql_config_store.js"),
    path.join("core", "ql_config_adapter.js"),
    path.join("core", "ql_feature_registry.js"),
    path.join("core", "ql_manifest_tests.js"),
    path.join("core", "ql_hero_probe.js"),
    path.join("core", "ql_persistence.js"),
    path.join("core", "ql_codec.js"),
    // Transitional runtime infrastructure
    "ql_utils.js",
    "ql_shared_presets.js",
    "ql_bridge.js",
    "ql_state.js",
    "ql_panelcache.js",
    "ql_config.js",
    "ql_update_checker.js",
    "ql_recent_purchases_data.js",
    "ql_minimap_crate_data.js",
    "ql_perf_overlay.js",
    path.join("core", "ql_settings_loader.js"),
    path.join("features", "ql_feat_buildbridge.js"),
    "ql_locale_lookup.js",
    "ql_core.js",
    path.join("manifests", "ql_build_storage", "legacy_3_1_9.js"),
    path.join("manifests", "ql_build_storage", "driver.js"),
    path.join("manifests", "ql_healthbar", "shared.js"),
    path.join("manifests", "ql_healthbar", "variants", "accent.js"),
    path.join("manifests", "ql_healthbar", "variants", "minimalist.js"),
    path.join("manifests", "ql_healthbar", "variants", "budhud.js"),
    path.join("manifests", "ql_healthbar", "variants", "fg.js"),
    path.join("manifests", "ql_healthbar", "variants", "mc.js")
];

// ── Feature files (loaded after core) ──
function getFeatureFiles() {
    function walk(dir) {
        var entries = fs.readdirSync(dir, { withFileTypes: true });
        var result = [];
        for (var i = 0; i < entries.length; i++) {
            var entry = entries[i];
            var full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                result = result.concat(walk(full));
            } else if (entry.isFile() && /^ql_feat_.*\.js$/.test(entry.name) && entry.name !== "ql_feat_buildbridge.js") {
                result.push(full);
            }
        }
        return result;
    }
    var files = walk(FEATURES_DIR);
    // Root files first (alphabetically), then subdirectory files (alphabetically)
    files.sort(function(a, b) {
        var aRel = path.relative(FEATURES_DIR, a);
        var bRel = path.relative(FEATURES_DIR, b);
        var aIsRoot = aRel.indexOf(path.sep) === -1;
        var bIsRoot = bRel.indexOf(path.sep) === -1;
        if (aIsRoot && !bIsRoot) return -1;
        if (!aIsRoot && bIsRoot) return 1;
        return aRel.localeCompare(bRel);
    });
    return files.map(function(f) { return path.relative(SCRIPTS_DIR, f); });
}

// ── Manifest files (Phase 9+ FeatureRegistry manifests) ──
function getManifestFiles() {
    function walk(dir) {
        var entries = fs.readdirSync(dir, { withFileTypes: true });
        var result = [];
        for (var i = 0; i < entries.length; i++) {
            var entry = entries[i];
            var full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                result = result.concat(walk(full));
            } else if (entry.isFile() && entry.name === "manifest.js") {
                result.push(full);
            }
        }
        return result;
    }
    var files = walk(MANIFESTS_DIR);
    files.sort();
    return files.map(function(f) { return path.relative(SCRIPTS_DIR, f); });
}

// ── Run a single file ──
function runFile(filePath) {
    var fullPath = path.join(SCRIPTS_DIR, filePath);
    if (!fs.existsSync(fullPath)) {
        return { file: filePath, status: "SKIP", error: "File not found" };
    }
    var src = fs.readFileSync(fullPath, "utf8");
    try {
        vm.runInNewContext(src, global, { filename: filePath, timeout: 5000 });
        return { file: filePath, status: "PASS" };
    } catch (e) {
        return { file: filePath, status: "FAIL", error: e.message, stack: e.stack && e.stack.split("\n").slice(0, 3).join("\n") };
    }
}

// ── Run all ──
console.log("=== QOLLOCK Smoke Test ===");
console.log("Mock Panorama: $.Msg, $.Schedule, $.GetContextPanel, etc.\n");

var results = [];
var passCount = 0, failCount = 0, skipCount = 0;

// Load HUD infrastructure in order
console.log("── HUD Infrastructure ──");
HUD_LOAD_ORDER.forEach(function(file) {
    var r = runFile(file);
    results.push(r);
    if (r.status === "PASS") { passCount++; console.log("  PASS " + file); }
    else if (r.status === "SKIP") { skipCount++; console.log("  SKIP " + file + " (" + r.error + ")"); }
    else { failCount++; console.log("  FAIL " + file + ": " + r.error); }
});

// Load feature files
console.log("\n── Feature Files ──");
getFeatureFiles().forEach(function(file) {
    var r = runFile(file);
    results.push(r);
    if (r.status === "PASS") { passCount++; console.log("  PASS " + file); }
    else { failCount++; console.log("  FAIL " + file + ": " + r.error); }
});

// Load manifest files
console.log("\n── Manifest Files ──");
getManifestFiles().forEach(function(file) {
    var r = runFile(file);
    results.push(r);
    if (r.status === "PASS") { passCount++; console.log("  PASS " + file); }
    else { failCount++; console.log("  FAIL " + file + ": " + r.error); }
});

// ── Structural check: manifest test hooks ──
console.log("\n── Manifest Test Hooks (structural) ──");
try {
    var QOL = global.QOL || (typeof QOL !== "undefined" ? QOL : null);
    if (QOL && QOL.core && QOL.core.FeatureRegistry) {
        var FR = QOL.core.FeatureRegistry;
        var ids = FR.getRegisteredIds();
        var withTest = 0, withoutTest = 0;
        ids.forEach(function(id) {
            var m = FR.getManifest(id);
            if (m && typeof m.test === "function") {
                withTest++;
                console.log("  TEST " + id);
            } else {
                withoutTest++;
                console.log("  noop " + id + " (no test hook)");
            }
        });
        console.log("  " + ids.length + " manifests: " + withTest + " with test(), " + withoutTest + " without");
    } else {
        console.log("  FeatureRegistry not available — skipping");
    }
} catch(e) {
    console.log("  FAIL manifest test hook enumeration: " + e.message);
}

// ── Summary ──
console.log("\n=== Summary ===");
console.log("Total: " + results.length + " | Pass: " + passCount + " | Fail: " + failCount + " | Skip: " + skipCount);

if (failCount > 0) {
    console.log("\n── Failures ──");
    results.filter(function(r) { return r.status === "FAIL"; }).forEach(function(r) {
        console.log("  " + r.file + ": " + r.error);
        if (r.stack) console.log("    " + r.stack.replace(/\n/g, "\n    "));
    });
    process.exit(1);
} else {
    console.log("All tests passed.");
    process.exit(0);
}

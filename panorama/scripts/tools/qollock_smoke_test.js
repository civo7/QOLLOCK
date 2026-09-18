#!/usr/bin/env node
/**
 * qollock_smoke_test.js — HUD script-load smoke check
 *
 * Loads the scripts included by hud.xml in their actual order with mock
 * Panorama globals, then checks manifest test-hook registration.
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
var layout = require("../../../scripts/simulator/layout.js");

var SCRIPTS_DIR = path.resolve(__dirname, "..");

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

// The layout owns load order, including feature helpers and the app entry point.
var HUD_LOAD_ORDER = layout.hudScripts().scripts.map(function(entry) {
    return path.relative(SCRIPTS_DIR, entry.absPath);
});

// ── Run a single file ──
function runFile(filePath) {
    var fullPath = path.join(SCRIPTS_DIR, filePath);
    if (!fs.existsSync(fullPath)) {
        return { file: filePath, status: "FAIL", error: "Included script not found" };
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
var passCount = 0, failCount = 0;

// Load exactly what the game loads, including core/ql_app.js.
console.log("── HUD Layout Scripts ──");
HUD_LOAD_ORDER.forEach(function(file) {
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
        failCount++;
        console.log("  FAIL FeatureRegistry not available");
    }
} catch(e) {
    failCount++;
    console.log("  FAIL manifest test hook enumeration: " + e.message);
}

// ── Summary ──
console.log("\n=== Summary ===");
console.log("Total: " + results.length + " | Pass: " + passCount + " | Fail: " + failCount);

if (failCount > 0) {
    console.log("\n── Failures ──");
    results.filter(function(r) { return r.status === "FAIL"; }).forEach(function(r) {
        console.log("  " + r.file + ": " + r.error);
        if (r.stack) console.log("    " + r.stack.replace(/\n/g, "\n    "));
    });
    process.exit(1);
} else {
    console.log("HUD script loading and manifest registration passed (runtime hooks not exercised).");
    process.exit(0);
}

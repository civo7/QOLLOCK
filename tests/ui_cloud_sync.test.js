// tests/ui_cloud_sync.test.js
// =============================================================================
// Unit tests for Cloud Sync / Build Storage subsystem (panorama/scripts/ui/cloud_sync.js)
// =============================================================================

"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const { Document } = require("../scripts/simulator/panel.js");
const { Clock } = require("../scripts/simulator/clock.js");

function createTestEnvironment() {
    const clock = new Clock(1000);
    const doc = new Document(clock);
    const rootPanel = doc.create("Panel", { id: "Root" });
    const contextPanel = doc.create("Panel", { id: "SettingsContext" });
    rootPanel.addChild(contextPanel);

    const attributes = new Map();

    const addAttrMethods = (p) => {
        p.SetAttributeString = (name, val) => attributes.set(`${p.id || ""}:${name}`, String(val));
        p.GetAttributeString = (name, fallback) => {
            const key = `${p.id || ""}:${name}`;
            return attributes.has(key) ? attributes.get(key) : fallback;
        };
    };
    addAttrMethods(rootPanel);
    addAttrMethods(contextPanel);

    const mockDollar = {
        Msg: () => {},
        Schedule: (delaySec, cb) => setTimeout(cb, delaySec * 1000),
        CancelScheduled: (id) => clearTimeout(id),
        CreatePanel: (type, parent, id) => {
            const p = doc.create(type, { id: id || "" });
            addAttrMethods(p);
            if (parent && typeof parent.addChild === "function") {
                parent.addChild(p);
            }
            return p;
        },
        GetContextPanel: () => contextPanel,
        DispatchEvent: () => {},
        Localize: (s) => s,
        ForceCloseModSettings: () => {},
    };

    const sandbox = {
        $: mockDollar,
        QOL: {
            VERSION: "3.2.0",
            core: {
                panel: {
                    isAlive: (p) => !!(p && p.IsValid && p.IsValid()),
                    create: (type, parent, id) => mockDollar.CreatePanel(type, parent, id),
                    findRoot: () => rootPanel,
                },
            },
            ui: {
                configTab: {
                    getCurrentExportSettingsString: () => "[QOL-3-2-0]:valid_export_token",
                    setLocalizedConfigFeedbackMessage: () => {},
                },
            },
        },
        globalThis: {
            BUILD_SAVE_REQUEST_ATTR: "QOL_BUILD_SAVE_REQUEST",
            BUILD_SAVE_TOKEN_ATTR: "QOL_BUILD_SAVE_TOKEN",
            BUILD_SAVE_MSG_ATTR: "QOL_BUILD_SAVE_MSG",
            BUILD_SAVE_STATE_ATTR: "QOL_BUILD_SAVE_STATE",
            BUILD_CLEAR_REQUEST_ATTR: "QOL_BUILD_CLEAR_REQUEST",
            BUILD_CLEAR_TOKEN_ATTR: "QOL_BUILD_CLEAR_TOKEN",
            BUILD_CLEAR_MSG_ATTR: "QOL_BUILD_CLEAR_MSG",
            BUILD_CLEAR_STATE_ATTR: "QOL_BUILD_CLEAR_STATE",
            LocalizeSettingsText: (t) => t,
            FindRootPanel: () => rootPanel,
        },
        setTimeout,
        clearTimeout,
    };
    sandbox.globalThis.QOL = sandbox.QOL;
    sandbox.globalThis.$ = mockDollar;

    const cloudSyncCode = fs.readFileSync(
        path.resolve(__dirname, "../panorama/scripts/ui/cloud_sync.js"),
        "utf8"
    );
    vm.runInNewContext(cloudSyncCode, sandbox);

    return {
        sandbox,
        doc,
        rootPanel,
        contextPanel,
        attributes,
    };
}

test("ui/cloud_sync: exports public API on QOL.ui.cloudSync and globalThis", () => {
    const { sandbox } = createTestEnvironment();
    const cloudSync = sandbox.QOL.ui.cloudSync;

    assert.ok(cloudSync, "QOL.ui.cloudSync exists");
    assert.strictEqual(typeof cloudSync.queueBuildSaveRequest, "function");
    assert.strictEqual(typeof cloudSync.readBuildSaveStatus, "function");
    assert.strictEqual(typeof cloudSync.resolveBuildSavePendingLabel, "function");
    assert.strictEqual(typeof cloudSync.watchBuildSaveStatus, "function");
    assert.strictEqual(typeof cloudSync.activateBuildSaveFromUi, "function");
    assert.strictEqual(typeof cloudSync.queueBuildClearRequest, "function");
    assert.strictEqual(typeof cloudSync.readBuildClearStatus, "function");
    assert.strictEqual(typeof cloudSync.resolveBuildClearPendingLabel, "function");
    assert.strictEqual(typeof cloudSync.isBuildClearUserPromptStage, "function");
    assert.strictEqual(typeof cloudSync.watchBuildClearStatus, "function");

    // Backward compatibility globals
    assert.strictEqual(sandbox.globalThis.QueueBuildSaveRequest, cloudSync.queueBuildSaveRequest);
    assert.strictEqual(sandbox.globalThis.ReadBuildSaveStatus, cloudSync.readBuildSaveStatus);
    assert.strictEqual(sandbox.globalThis.ResolveBuildSavePendingLabel, cloudSync.resolveBuildSavePendingLabel);
    assert.strictEqual(sandbox.globalThis.WatchBuildSaveStatus, cloudSync.watchBuildSaveStatus);
    assert.strictEqual(sandbox.globalThis.ActivateBuildSaveFromUi, cloudSync.activateBuildSaveFromUi);
    assert.strictEqual(sandbox.globalThis.QueueBuildClearRequest, cloudSync.queueBuildClearRequest);
    assert.strictEqual(sandbox.globalThis.ReadBuildClearStatus, cloudSync.readBuildClearStatus);
    assert.strictEqual(sandbox.globalThis.ResolveBuildClearPendingLabel, cloudSync.resolveBuildClearPendingLabel);
    assert.strictEqual(sandbox.globalThis.IsBuildClearUserPromptStage, cloudSync.isBuildClearUserPromptStage);
    assert.strictEqual(sandbox.globalThis.WatchBuildClearStatus, cloudSync.watchBuildClearStatus);
});

test("ui/cloud_sync: resolveBuildSavePendingLabel maps internal stages to UI labels", () => {
    const { sandbox } = createTestEnvironment();
    const { resolveBuildSavePendingLabel } = sandbox.QOL.ui.cloudSync;

    assert.strictEqual(resolveBuildSavePendingLabel("starting"), "START");
    assert.strictEqual(resolveBuildSavePendingLabel("switching_to_skyrunner"), "SKYRUNNER");
    assert.strictEqual(resolveBuildSavePendingLabel("switch_hero"), "SKYRUNNER");
    assert.strictEqual(resolveBuildSavePendingLabel("waiting_for_shop"), "OPEN SHOP");
    assert.strictEqual(resolveBuildSavePendingLabel("open_shop"), "OPEN SHOP");
    assert.strictEqual(resolveBuildSavePendingLabel("initializing_storage_build"), "INIT BUILD");
    assert.strictEqual(resolveBuildSavePendingLabel("open_browser"), "INIT BUILD");
    assert.strictEqual(resolveBuildSavePendingLabel("opening_edit_mode"), "EDITING");
    assert.strictEqual(resolveBuildSavePendingLabel("writing_category_name"), "WRITING");
    assert.strictEqual(resolveBuildSavePendingLabel("saving"), "SAVING");
    assert.strictEqual(resolveBuildSavePendingLabel("commit"), "SAVING");
    assert.strictEqual(resolveBuildSavePendingLabel("verifying"), "VERIFY");
    assert.strictEqual(resolveBuildSavePendingLabel("unknown_stage"), "SAVING");
});

test("ui/cloud_sync: resolveBuildClearPendingLabel and isBuildClearUserPromptStage handle clear flow", () => {
    const { sandbox } = createTestEnvironment();
    const { resolveBuildClearPendingLabel, isBuildClearUserPromptStage } = sandbox.QOL.ui.cloudSync;

    assert.strictEqual(resolveBuildClearPendingLabel("starting"), "START");
    assert.strictEqual(resolveBuildClearPendingLabel("switching_to_skyrunner"), "SKYRUNNER");
    assert.strictEqual(resolveBuildClearPendingLabel("await_user_open_shop"), "OPEN SHOP");
    assert.strictEqual(resolveBuildClearPendingLabel("opening_builds_list"), "BROWSE");
    assert.strictEqual(resolveBuildClearPendingLabel("deleting_build"), "CLEARING");
    assert.strictEqual(resolveBuildClearPendingLabel("confirming_delete"), "CONFIRM");
    assert.strictEqual(resolveBuildClearPendingLabel("verifying_clear"), "VERIFY");

    assert.strictEqual(isBuildClearUserPromptStage("await_user_open_shop"), true);
    assert.strictEqual(isBuildClearUserPromptStage("waiting_for_shop"), true);
    assert.strictEqual(isBuildClearUserPromptStage("deleting_build"), false);
});

test("ui/cloud_sync: queueBuildSaveRequest validates payload and sets attributes", () => {
    const { sandbox, rootPanel } = createTestEnvironment();
    const { queueBuildSaveRequest, readBuildSaveStatus } = sandbox.QOL.ui.cloudSync;

    // Invalid format
    assert.strictEqual(queueBuildSaveRequest(""), "");
    assert.strictEqual(queueBuildSaveRequest("invalid_token_no_brackets"), "");

    // Valid format [QOL-3-2-0]:payload
    const token = queueBuildSaveRequest("[QOL-3-2-0]:valid_export_token");
    assert.ok(token);
    assert.ok(token.includes("_"));

    const status = readBuildSaveStatus();
    assert.strictEqual(status.state, "pending");
    assert.strictEqual(status.msg, "queued");
    assert.strictEqual(status.token, token);
});

test("ui/cloud_sync: queueBuildClearRequest sets clear request attributes", () => {
    const { sandbox } = createTestEnvironment();
    const { queueBuildClearRequest, readBuildClearStatus } = sandbox.QOL.ui.cloudSync;

    const token = queueBuildClearRequest();
    assert.ok(token);

    const status = readBuildClearStatus();
    assert.strictEqual(status.state, "pending");
    assert.strictEqual(status.msg, "queued");
    assert.strictEqual(status.token, token);
});

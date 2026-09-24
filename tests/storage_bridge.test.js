// tests/storage_bridge.test.js
// =============================================================================
// Unit tests for Chromium Embedded Framework (CEF) Local Storage Bridge
// (panorama/scripts/core/ql_storage_bridge.js)
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
    const hudPanel = doc.create("Panel", { id: "Hud" });
    rootPanel.addChild(hudPanel);

    const attributes = new Map();
    const eventHandlers = new Map();
    let lastSetUrl = "";

    const addPanelMethods = (p) => {
        p.SetAttributeString = (name, val) => attributes.set(`${p.id || ""}:${name}`, String(val));
        p.GetAttributeString = (name, fallback) => {
            const key = `${p.id || ""}:${name}`;
            return attributes.has(key) ? attributes.get(key) : fallback;
        };
        p.SetURL = (url) => {
            lastSetUrl = url;
        };
    };

    addPanelMethods(rootPanel);
    addPanelMethods(hudPanel);

    const mockDollar = {
        Msg: () => {},
        Schedule: (delaySec, cb) => setTimeout(cb, delaySec * 1000),
        CancelScheduled: (id) => clearTimeout(id),
        CreatePanel: (type, parent, id) => {
            const p = doc.create(type, { id: id || "" });
            addPanelMethods(p);
            if (parent && typeof parent.addChild === "function") {
                parent.addChild(p);
            }
            return p;
        },
        GetContextPanel: () => hudPanel,
        RegisterEventHandler: (eventName, panel, callback) => {
            const key = `${panel.id || ""}:${eventName}`;
            eventHandlers.set(key, callback);
        },
        DispatchEvent: () => {},
        Localize: (s) => s,
    };

    const sandbox = {
        $: mockDollar,
        QOL: {
            core: {
                panel: {
                    isAlive: (p) => !!(p && p.IsValid && p.IsValid()),
                    create: (type, parent, id) => mockDollar.CreatePanel(type, parent, id),
                    findRoot: () => rootPanel,
                },
                persistence: {
                    writeStorageConfigRawToUi: (root, raw) => {
                        root.SetAttributeString("Deadlock_Mod_Settings_v1", raw);
                    },
                    readStorageConfigRawFromUi: (root) => {
                        return root.GetAttributeString("Deadlock_Mod_Settings_v1", "");
                    },
                },
            },
        },
        globalThis: {},
        WrapConfigForStorage: (cfg) => JSON.stringify({ schema: "4.0.0", data: cfg }),
        UnwrapConfigFromStorage: (raw) => {
            try {
                const parsed = JSON.parse(raw);
                if (parsed && parsed.data) return { config: parsed.data, schema: parsed.schema };
            } catch (_) {}
            return null;
        },
        SafeParseConfig: (raw) => {
            try {
                const parsed = JSON.parse(raw);
                return parsed.data || parsed;
            } catch (_) {
                return null;
            }
        },
        MOD_CONFIG: {
            LANGUAGE: "english",
            PREVIEWS_ENABLED: 1,
            MINIMAP_SCALE: 1.0,
        },
        State: {
            lastConfig: null,
        },
        setTimeout,
        clearTimeout,
    };

    sandbox.globalThis.QOL = sandbox.QOL;
    sandbox.globalThis.$ = mockDollar;
    sandbox.globalThis.MOD_CONFIG = sandbox.MOD_CONFIG;
    sandbox.globalThis.State = sandbox.State;

    const bridgeCode = fs.readFileSync(
        path.resolve(__dirname, "../panorama/scripts/core/ql_storage_bridge.js"),
        "utf8"
    );
    vm.runInNewContext(bridgeCode, sandbox);
    if (sandbox.QOL?.core?.storageBridge) {
        sandbox.QOL.core.storageBridge.enableAutoload(false);
    }

    return {
        sandbox,
        doc,
        rootPanel,
        hudPanel,
        attributes,
        getLastSetUrl: () => lastSetUrl,
        fireTitleEvent: (panel, title) => {
            const key = `${panel.id || ""}:HTMLTitle`;
            const handler = eventHandlers.get(key);
            if (handler) {
                handler(panel, title);
            }
        },
    };
}

test("storage_bridge: exports public API on QOL.core.storageBridge, QOL.core.storage, and globalThis", () => {
    const { sandbox } = createTestEnvironment();
    const bridge = sandbox.QOL.core.storageBridge;

    assert.ok(bridge, "QOL.core.storageBridge exists");
    assert.strictEqual(sandbox.QOL.core.storage, bridge);
    assert.strictEqual(sandbox.globalThis.QOLStorageBridge, bridge);

    assert.strictEqual(typeof bridge.init, "function");
    assert.strictEqual(typeof bridge.isReady, "function");
    assert.strictEqual(typeof bridge.getPanel, "function");
    assert.strictEqual(typeof bridge.save, "function");
    assert.strictEqual(typeof bridge.load, "function");
    assert.strictEqual(typeof bridge.remove, "function");
    assert.strictEqual(typeof bridge.saveSettings, "function");
    assert.strictEqual(typeof bridge.loadSettings, "function");
    assert.strictEqual(typeof bridge.clearSettings, "function");
});

test("storage_bridge: init creates and styles CitadelHTMLPanel", () => {
    const { sandbox, hudPanel, getLastSetUrl } = createTestEnvironment();
    const bridge = sandbox.QOL.core.storageBridge;

    const panel = bridge.getPanel();
    assert.ok(panel, "Bridge panel was created");
    assert.strictEqual(panel.id, "QOLStorageBridge");
    assert.ok(panel.BHasClass("QOLStorageBridge"), "Has CSS class QOLStorageBridge");
    assert.strictEqual(panel.style.visibility, "visible");
    assert.strictEqual(panel.hittest, false);
    assert.strictEqual(panel.acceptsfocus, false);
    assert.strictEqual(getLastSetUrl(), "https://predi-i.github.io/qollock-updates/bridge.html");
});

test("storage_bridge: handshake injects script and marks ready", () => {
    const { sandbox, getLastSetUrl, fireTitleEvent } = createTestEnvironment();
    const bridge = sandbox.QOL.core.storageBridge;
    const panel = bridge.getPanel();

    assert.strictEqual(bridge.isReady(), false);

    // 1. Directory page loads
    fireTitleEvent(panel, "Index of C:/");
    assert.ok(getLastSetUrl().startsWith("javascript:"), "Script injected on page load");
    assert.ok(getLastSetUrl().includes("__qolSave"));
    assert.ok(getLastSetUrl().includes("__qolLoad"));

    // 2. Ready notification arrives
    fireTitleEvent(panel, "QOL_BRIDGE_READY:" + Date.now());
    assert.strictEqual(bridge.isReady(), true, "Bridge is now marked ready");
});

test("storage_bridge: save and load round trip through CEF title responses", async () => {
    const { sandbox, getLastSetUrl, fireTitleEvent } = createTestEnvironment();
    const bridge = sandbox.QOL.core.storageBridge;
    const panel = bridge.getPanel();

    // Establish ready
    fireTitleEvent(panel, "Index of C:/");
    fireTitleEvent(panel, "QOL_BRIDGE_READY:" + Date.now());

    // 1. Save operation
    let savePromise = bridge.save("test_key", "test_value");
    const saveUrl = getLastSetUrl();
    assert.ok(saveUrl.includes("window.__qolSave"));
    assert.ok(saveUrl.includes("dGVzdF9rZXk="), "Key is Base64 encoded");
    assert.ok(saveUrl.includes("dGVzdF92YWx1ZQ=="), "Value is Base64 encoded");

    const saveReqMatch = saveUrl.match(/'(qol_\d+_\d+)'/);
    assert.ok(saveReqMatch, "Request ID matched");
    const saveReqId = saveReqMatch[1];

    // Simulate CEF response
    fireTitleEvent(panel, `QOL_RES:{"id":"${saveReqId}","ok":true}`);
    const saveResult = await savePromise;
    assert.strictEqual(saveResult, true);

    // 2. Load operation
    let loadPromise = bridge.load("test_key");
    const loadUrl = getLastSetUrl();
    assert.ok(loadUrl.includes("window.__qolLoad"));
    assert.ok(loadUrl.includes("dGVzdF9rZXk="), "Load key is Base64 encoded");
    const loadReqMatch = loadUrl.match(/'(qol_\d+_\d+)'/);
    assert.ok(loadReqMatch, "Request ID matched");
    const loadReqId = loadReqMatch[1];

    fireTitleEvent(panel, `QOL_RES:{"id":"${loadReqId}","ok":true,"data":"test_value"}`);
    const loadResult = await loadPromise;
    assert.strictEqual(loadResult, "test_value");
});

test("storage_bridge: saveSettings wraps config and writes to UI attributes and CEF", async () => {
    const { sandbox, getLastSetUrl, fireTitleEvent, rootPanel } = createTestEnvironment();
    const bridge = sandbox.QOL.core.storageBridge;
    const panel = bridge.getPanel();

    fireTitleEvent(panel, "Index of C:/");
    fireTitleEvent(panel, "QOL_BRIDGE_READY:" + Date.now());

    const testConfig = { LANGUAGE: "russian", PREVIEWS_ENABLED: 0 };
    let savePromise = bridge.saveSettings(testConfig);

    const setUrl = getLastSetUrl();
    assert.ok(setUrl.includes("window.__qolSave"));
    assert.ok(setUrl.includes("cW9sbG9ja19zZXR0aW5ncw=="), "Key is Base64 encoded");

    // Check UI panel attribute was also updated immediately
    const uiAttr = rootPanel.GetAttributeString("Deadlock_Mod_Settings_v1", "");
    assert.ok(uiAttr.includes('"schema":"4.0.0"'));
    assert.ok(uiAttr.includes('"LANGUAGE":"russian"'));

    const reqMatch = setUrl.match(/'(qol_\d+_\d+)'/);
    fireTitleEvent(panel, `QOL_RES:{"id":"${reqMatch[1]}","ok":true}`);

    const res = await savePromise;
    assert.strictEqual(res.ok, true);
});

test("storage_bridge: loadSettings unwraps and updates MOD_CONFIG", async () => {
    const { sandbox, getLastSetUrl, fireTitleEvent } = createTestEnvironment();
    const bridge = sandbox.QOL.core.storageBridge;
    const panel = bridge.getPanel();

    fireTitleEvent(panel, "Index of C:/");
    fireTitleEvent(panel, "QOL_BRIDGE_READY:" + Date.now());

    let loadPromise = bridge.loadSettings();
    const loadUrl = getLastSetUrl();
    const reqMatch = loadUrl.match(/'(qol_\d+_\d+)'/);

    const savedPayload = JSON.stringify({
        schema: "4.0.0",
        data: { LANGUAGE: "german", PREVIEWS_ENABLED: 1, MINIMAP_SCALE: 1.5 }
    });

    fireTitleEvent(panel, `QOL_RES:{"id":"${reqMatch[1]}","ok":true,"data":${JSON.stringify(savedPayload)}}`);

    const res = await loadPromise;
    assert.strictEqual(res.ok, true);
    assert.strictEqual(sandbox.MOD_CONFIG.LANGUAGE, "german");
    assert.strictEqual(sandbox.MOD_CONFIG.MINIMAP_SCALE, 1.5);
    assert.strictEqual(sandbox.State.lastConfig.LANGUAGE, "german");
});

test("storage_bridge: clearSettings calls __qolRemove", async () => {
    const { sandbox, getLastSetUrl, fireTitleEvent } = createTestEnvironment();
    const bridge = sandbox.QOL.core.storageBridge;
    const panel = bridge.getPanel();

    fireTitleEvent(panel, "Index of C:/");
    fireTitleEvent(panel, "QOL_BRIDGE_READY:" + Date.now());

    let clearPromise = bridge.clearSettings();
    const clearUrl = getLastSetUrl();
    assert.ok(clearUrl.includes("window.__qolRemove"));
    assert.ok(clearUrl.includes("cW9sbG9ja19zZXR0aW5ncw=="), "Key is Base64 encoded");

    const reqMatch = clearUrl.match(/'(qol_\d+_\d+)'/);
    fireTitleEvent(panel, `QOL_RES:{"id":"${reqMatch[1]}","ok":true}`);

    const res = await clearPromise;
    assert.strictEqual(res.ok, true);
});

test("storage_bridge: chunked response transfers and reassembles across multiple HTMLTitle events", async () => {
    const { sandbox, getLastSetUrl, fireTitleEvent } = createTestEnvironment();
    const bridge = sandbox.QOL.core.storageBridge;
    const panel = bridge.getPanel();

    fireTitleEvent(panel, "Index of C:/");
    fireTitleEvent(panel, "QOL_BRIDGE_READY:" + Date.now());

    const loadPromise = bridge.load("large_data");
    const loadUrl = getLastSetUrl();
    const reqMatch = loadUrl.match(/'(qol_\d+_\d+)'/);
    assert.ok(reqMatch, "Request ID matched");
    const reqId = reqMatch[1];

    const chunk0 = "A".repeat(1500);
    const chunk1 = "B".repeat(1500);
    const chunk2 = "C".repeat(1000);

    // 1. Part 0 arrives
    fireTitleEvent(panel, `QOL_RES:{"id":"${reqId}","ok":true,"data":"${chunk0}","chunked":true,"part":0,"total":3}`);
    assert.ok(getLastSetUrl().includes(`__qolNextChunk('${reqId}', 1)`), "Requested part 1");

    // 2. Part 1 arrives
    fireTitleEvent(panel, `QOL_RES:{"id":"${reqId}","ok":true,"data":"${chunk1}","chunked":true,"part":1,"total":3}`);
    assert.ok(getLastSetUrl().includes(`__qolNextChunk('${reqId}', 2)`), "Requested part 2");

    // 3. Part 2 (final) arrives
    fireTitleEvent(panel, `QOL_RES:{"id":"${reqId}","ok":true,"data":"${chunk2}","chunked":true,"part":2,"total":3}`);

    const result = await loadPromise;
    assert.strictEqual(result, chunk0 + chunk1 + chunk2);
    assert.strictEqual(result.length, 4000);
});

test("storage_bridge: loadSettings correctly applies large >9KB chunked configuration", async () => {
    const { sandbox, getLastSetUrl, fireTitleEvent } = createTestEnvironment();
    const bridge = sandbox.QOL.core.storageBridge;
    const panel = bridge.getPanel();

    fireTitleEvent(panel, "Index of C:/");
    fireTitleEvent(panel, "QOL_BRIDGE_READY:" + Date.now());

    const loadSettingsPromise = bridge.loadSettings();
    const loadUrl = getLastSetUrl();
    const reqMatch = loadUrl.match(/'(qol_\d+_\d+)'/);
    assert.ok(reqMatch, "Request ID matched");
    const reqId = reqMatch[1];

    // Build a large config payload (>9000 bytes, similar to real Deadlock config)
    const largeCfg = {
        LANGUAGE: "korean",
        PREVIEWS_ENABLED: 1,
        MINIMAP_SCALE: 2.0,
    };
    for (let i = 0; i < 300; i++) {
        largeCfg[`FEATURE_KEY_${i}`] = i * 2;
    }
    const fullPayloadStr = JSON.stringify({
        schema: "4.0.0",
        data: largeCfg,
    });
    assert.ok(fullPayloadStr.length > 5000, `Payload must be large: ${fullPayloadStr.length} chars`);

    // Slice into 1500 char chunks
    const CHUNK_SIZE = 1500;
    const chunks = [];
    for (let i = 0; i < fullPayloadStr.length; i += CHUNK_SIZE) {
        chunks.push(fullPayloadStr.slice(i, i + CHUNK_SIZE));
    }

    // Stream each chunk sequentially
    for (let i = 0; i < chunks.length; i++) {
        const respPayload = {
            id: reqId,
            ok: true,
            data: chunks[i],
            chunked: true,
            part: i,
            total: chunks.length,
        };
        fireTitleEvent(panel, `QOL_RES:${JSON.stringify(respPayload)}`);
    }

    const res = await loadSettingsPromise;
    assert.strictEqual(res.ok, true);
    assert.strictEqual(sandbox.MOD_CONFIG.LANGUAGE, "korean");
    assert.strictEqual(sandbox.MOD_CONFIG.MINIMAP_SCALE, 2.0);
    assert.strictEqual(sandbox.MOD_CONFIG.FEATURE_KEY_299, 598);
});

test("storage_bridge: special characters (# and %) are Base64 encoded and never contain '#' in SetURL", async () => {
    const { sandbox, getLastSetUrl, fireTitleEvent } = createTestEnvironment();
    const bridge = sandbox.QOL.core.storageBridge;
    const panel = bridge.getPanel();

    fireTitleEvent(panel, "Index of C:/");
    fireTitleEvent(panel, "QOL_BRIDGE_READY:" + Date.now());

    const hexColorVal = '{"CROSSHAIR_COLOR":"#00FF00","AMMO_TEXT_COLOR":"#FFAA00","PERCENT":"100%"}';
    const savePromise = bridge.save("color_key", hexColorVal);
    const saveUrl = getLastSetUrl();

    // Verify that '#' is completely absent from the URL (bypasses Chromium URL fragment truncation)
    assert.strictEqual(saveUrl.includes("#"), false, "URL must not contain '#' character");
    const reqMatch = saveUrl.match(/'(qol_\d+_\d+)'/);
    fireTitleEvent(panel, `QOL_RES:{"id":"${reqMatch[1]}","ok":true}`);

    const res = await savePromise;
    assert.strictEqual(res, true);
});

test("storage_bridge: large save payloads (>1500 chars) are streamed via __qolSaveChunk", async () => {
    const { sandbox, getLastSetUrl, fireTitleEvent } = createTestEnvironment();
    const bridge = sandbox.QOL.core.storageBridge;
    const panel = bridge.getPanel();

    fireTitleEvent(panel, "Index of C:/");
    fireTitleEvent(panel, "QOL_BRIDGE_READY:" + Date.now());

    const largeData = "X".repeat(3500); // 3500 chars -> 3 chunks (1500 + 1500 + 500)
    const savePromise = bridge.save("large_save", largeData);

    // Part 0 sent
    let saveUrl = getLastSetUrl();
    assert.ok(saveUrl.includes("window.__qolSaveChunk"), "Uses __qolSaveChunk");
    assert.ok(saveUrl.includes(", 0, 3,"), "Part 0 of 3");
    const reqId = saveUrl.match(/'(qol_\d+_\d+)'/)[1];

    // CEF acks part 0
    fireTitleEvent(panel, `QOL_RES:{"id":"${reqId}","ok":true,"savePartAck":0}`);
    saveUrl = getLastSetUrl();
    assert.ok(saveUrl.includes(", 1, 3,"), "Part 1 of 3");

    // CEF acks part 1
    fireTitleEvent(panel, `QOL_RES:{"id":"${reqId}","ok":true,"savePartAck":1}`);
    saveUrl = getLastSetUrl();
    assert.ok(saveUrl.includes(", 2, 3,"), "Part 2 of 3");

    // CEF confirms full save complete
    fireTitleEvent(panel, `QOL_RES:{"id":"${reqId}","ok":true}`);

    const res = await savePromise;
    assert.strictEqual(res, true);
});

test("storage_bridge: FIFO request queue serializes concurrent calls without dropping", async () => {
    const { sandbox, getLastSetUrl, fireTitleEvent } = createTestEnvironment();
    const bridge = sandbox.QOL.core.storageBridge;
    const panel = bridge.getPanel();

    fireTitleEvent(panel, "Index of C:/");
    fireTitleEvent(panel, "QOL_BRIDGE_READY:" + Date.now());

    // Dispatch 2 save requests concurrently
    const p1 = bridge.save("key1", "val1");
    const url1 = getLastSetUrl();
    const req1Id = url1.match(/'(qol_\d+_\d+)'/)[1];

    const p2 = bridge.save("key2", "val2");
    // url should STILL be url1 because p2 is queued!
    assert.strictEqual(getLastSetUrl(), url1, "Request 2 waits in FIFO queue");

    // Resolve req 1
    fireTitleEvent(panel, `QOL_RES:{"id":"${req1Id}","ok":true}`);
    const res1 = await p1;
    assert.strictEqual(res1, true);

    // Now request 2 has been dispatched
    const url2 = getLastSetUrl();
    assert.notStrictEqual(url2, url1, "Request 2 was dispatched after Request 1 finished");
    const req2Id = url2.match(/'(qol_\d+_\d+)'/)[1];

    fireTitleEvent(panel, `QOL_RES:{"id":"${req2Id}","ok":true}`);
    const res2 = await p2;
    assert.strictEqual(res2, true);
});

test("storage_bridge: rejects when incoming chunks arrive out of order", async () => {
    const { sandbox, getLastSetUrl, fireTitleEvent } = createTestEnvironment();
    const bridge = sandbox.QOL.core.storageBridge;
    const panel = bridge.getPanel();

    fireTitleEvent(panel, "Index of C:/");
    fireTitleEvent(panel, "QOL_BRIDGE_READY:" + Date.now());

    const loadPromise = bridge.load("strict_order");
    const reqId = getLastSetUrl().match(/'(qol_\d+_\d+)'/)[1];

    // Fire part 1 first instead of part 0!
    fireTitleEvent(panel, `QOL_RES:{"id":"${reqId}","ok":true,"data":"foo","chunked":true,"part":1,"total":2}`);

    await assert.rejects(loadPromise, /Out of order chunk/);
});

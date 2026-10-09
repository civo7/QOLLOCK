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
const os = require("node:os");
const { URL } = require("node:url");

const BRIDGE_URL = "https://predi-i.github.io/qollock-updates/bridge.html";
// Verbatim mirror of the hosted qollock-updates/bridge.html, not a test protocol.
const PAGE_SCRIPT = fs.readFileSync(path.join(__dirname, "fixtures/qollock_bridge.html"), "utf8")
    .match(/<script>([\s\S]*?)<\/script>/)[1];

function fragmentMessage(url) {
    assert.ok(url.startsWith(BRIDGE_URL + "#"), "Commands use the HTTPS page fragment");
    return JSON.parse(decodeURIComponent(url.slice(url.indexOf("#") + 1)));
}

function requestId(url) {
    return fragmentMessage(url).a.find(value => typeof value === "string" && /^qol_\d+_\d+$/.test(value));
}

function diskStorage(t) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "qollock-storage-"));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const filename = path.join(directory, "localStorage.json");
    fs.writeFileSync(filename, "{}");
    return () => ({
        has: key => Object.hasOwn(JSON.parse(fs.readFileSync(filename, "utf8")), key),
        get: key => JSON.parse(fs.readFileSync(filename, "utf8"))[key],
        set: (key, value) => {
            const data = JSON.parse(fs.readFileSync(filename, "utf8"));
            data[key] = String(value);
            fs.writeFileSync(filename, JSON.stringify(data));
        },
        delete: key => {
            const data = JSON.parse(fs.readFileSync(filename, "utf8"));
            delete data[key];
            fs.writeFileSync(filename, JSON.stringify(data));
        },
    });
}

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
    const urls = [];
    const logs = [];

    const addPanelMethods = (p) => {
        p.SetAttributeString = (name, val) => attributes.set(`${p.id || ""}:${name}`, String(val));
        p.GetAttributeString = (name, fallback) => {
            const key = `${p.id || ""}:${name}`;
            return attributes.has(key) ? attributes.get(key) : fallback;
        };
        p.SetURL = (url) => {
            lastSetUrl = url;
            urls.push(url);
        };
    };

    addPanelMethods(rootPanel);
    addPanelMethods(hudPanel);

    const mockDollar = {
        Msg: message => logs.push(message),
        Schedule: (delaySec, cb) => clock.schedule(delaySec, cb),
        CancelScheduled: (id) => clock.cancel(id),
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
            if (!eventHandlers.has(panel)) eventHandlers.set(panel, new Map());
            eventHandlers.get(panel).set(eventName, callback);
        },
        DispatchEvent: () => {},
        Localize: (s) => s,
    };

    const sandbox = {
        $: mockDollar,
        QOL: {},
        globalThis: {},
        MOD_CONFIG: {
            LANGUAGE: "english",
            PREVIEWS_ENABLED: 1,
            TOP_BAR_SCALE: 1.0,
        },
        State: {
            lastConfig: null,
        },
        setTimeout,
        clearTimeout,
    };

    sandbox.globalThis = sandbox;
    for (const name of ["core/ql_namespace.js", "ql_utils.js", "core/ql_panel_helpers.js", "ql_shared_presets.js", "ql_config.js", "core/ql_persistence.js"]) {
        const filename = path.resolve(__dirname, "../panorama/scripts", name);
        vm.runInNewContext(fs.readFileSync(filename, "utf8"), sandbox, { filename });
    }

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
        urls,
        logs,
        doc,
        clock,
        rootPanel,
        hudPanel,
        attributes,
        getLastSetUrl: () => lastSetUrl,
        fireTitleEvent: (panel, title) => {
            const handler = eventHandlers.get(panel)?.get("HTMLTitle");
            if (handler) {
                handler(panel, title);
            }
        },
    };
}

// Execute the real hosted page in a separate realm. Model only CEF navigation,
// hashchange, title delivery and origin storage, including the new HTTPS filter.
function connectEmbeddedPage(env, storage = new Map(), options = {}) {
    const panel = env.sandbox.QOL.core.storageBridge.getPanel();
    const recordURL = panel.SetURL;
    let currentPage = null;
    let currentURL = "";
    let loads = 0;
    panel.SetURL = url => {
        recordURL(url);
        if (!/^https:\/\//i.test(url)) {
            currentPage = null;
            currentURL = "about:blank";
            return;
        }
        const parsed = new URL(url);
        if (currentPage && currentURL.split("#")[0] === url.split("#")[0] && parsed.hash) {
            const page = currentPage;
            const changed = page.location.hash !== parsed.hash;
            page.location.hash = parsed.hash;
            currentURL = url;
            if (changed) env.clock.schedule(0, () => {
                if (currentPage === page) page.hashchange?.();
            });
            return;
        }
        loads++;
        const browser = {
            localStorage: {
                getItem: key => storage.has(key) ? storage.get(key) : null,
                setItem: (key, value) => storage.set(key, String(value)),
                removeItem: key => storage.delete(key),
            },
            atob: value => Buffer.from(value, "base64").toString("binary"),
            setTimeout: (fn, ms) => env.clock.schedule(ms / 1000, () => {
                if (currentPage === browser) fn();
            }),
            navigator: {},
            location: { hash: parsed.hash },
            document: {},
            addEventListener: (name, handler) => {
                assert.equal(name, "hashchange");
                browser.hashchange = handler;
            },
        };
        browser.window = browser.self = browser.top = browser;
        Object.defineProperty(browser.document, "title", {
            set: title => {
                for (let i = 0; i < (options.duplicateTitles ? 2 : 1); i++) {
                    env.clock.schedule(0, () => {
                        if (currentPage === browser) env.fireTitleEvent(panel, title);
                    });
                }
            },
        });
        currentPage = browser;
        currentURL = url;
        vm.createContext(browser);
        // A cache-first old page has the same functions but no fragment listener.
        const script = loads <= (options.oldPageLoads || 0)
            ? PAGE_SCRIPT.slice(0, PAGE_SCRIPT.indexOf("    // Deadlock's")) +
                "document.title = 'QOL_BRIDGE_READY'; })();"
            : PAGE_SCRIPT;
        vm.runInContext(script, browser, { filename: "qollock_bridge.html" });
    };
    env.cef = {
        get page() { return currentPage; },
        get url() { return currentURL; },
        get loads() { return loads; },
    };
    panel.SetURL(options.initialURL || env.getLastSetUrl());
    env.clock.advance(0);
    assert.deepEqual(env.clock.errors, []);
    return currentPage;
}

test("storage_bridge: actual embedded page preserves Unicode across chunk boundaries", async () => {
    const env = createTestEnvironment();
    const storage = new Map();
    connectEmbeddedPage(env, storage);
    const bridge = env.sandbox.QOL.core.storageBridge;
    const value = "a".repeat(1499) + "😀" + "я#%".repeat(1500);
    const saving = bridge.save("unicode", value);
    env.clock.advance(0);
    await saving;
    assert.equal(storage.get("unicode"), value);
    const loading = bridge.load("unicode");
    env.clock.advance(0);
    assert.equal(await loading, value);
    assert.deepEqual(env.clock.errors, []);
});

test("storage_bridge: disk-backed saved buff lead 15 survives simulated restart and startup restore", async t => {
    const reopenStorage = diskStorage(t);
    const storage = reopenStorage();
    const first = createTestEnvironment();
    connectEmbeddedPage(first, storage);
    const saving = first.sandbox.QOL.core.storageBridge.saveSettings({ BRIDGE_BUFF_START: 15 });
    first.clock.advance(0);
    assert.equal((await saving).ok, true);
    assert.equal(JSON.parse(storage.get("qollock_settings")).data.BRIDGE_BUFF_START, 15);
    const next = createTestEnvironment();
    next.sandbox.QOL.core.storageBridge.enableAutoload(true);
    connectEmbeddedPage(next, reopenStorage());
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(next.sandbox.MOD_CONFIG.BRIDGE_BUFF_START, 15);
    const raw = next.hudPanel.GetAttributeString("Deadlock_Mod_Settings_v1", "");
    assert.equal(next.sandbox.QOL.safeParseConfig(raw).BRIDGE_BUFF_START, 15);
    assert.deepEqual(next.clock.errors, []);
});

test("storage_bridge: quota failure reaches callback and Promise without replacing stored data", async () => {
    const env = createTestEnvironment();
    const storage = new Map([["qollock_settings", "previous"]]);
    const browser = connectEmbeddedPage(env, storage);
    browser.localStorage.setItem = () => { throw new Error("QuotaExceededError"); };
    let callbackCount = 0;
    const saving = env.sandbox.QOL.core.storageBridge.saveSettings({ BRIDGE_BUFF_START: 15 }, err => {
        callbackCount++;
        assert.match(err.message, /QuotaExceededError/);
    });
    env.clock.advance(0);
    await assert.rejects(saving, /QuotaExceededError/);
    assert.equal(callbackCount, 1);
    assert.equal(storage.get("qollock_settings"), "previous");
    assert.deepEqual(env.clock.errors, []);
});

test("storage_bridge: validated config is canonicalized before the HUD parser receives it", async () => {
    const env = createTestEnvironment();
    const storage = new Map([["qollock_settings", '{"schema":"4.0.0","data":{"BRIDGE_BUFF_START":15,"hasOwnProperty":0}}']]);
    connectEmbeddedPage(env, storage);
    const loading = env.sandbox.QOL.core.storageBridge.loadSettings();
    env.clock.advance(0);
    const result = await loading;
    assert.equal(result.config.BRIDGE_BUFF_START, 15);
    const raw = env.hudPanel.GetAttributeString("Deadlock_Mod_Settings_v1", "");
    assert.equal(result.raw, raw);
    assert.equal(env.sandbox.QOL.safeParseConfig(raw).BRIDGE_BUFF_START, 15);
    assert.equal(Object.hasOwn(JSON.parse(raw).data, "hasOwnProperty"), false);
});

test("storage_bridge: legacy flat settings retain existing zoom and shop migrations", async () => {
    const env = createTestEnvironment();
    const legacy = { MINIMAP_LARGE_SIZE: 850, ZOOM_X_OFFSET: 125, ENABLE_SHOP_CLICK_TO_NOTIFY: 1, BRIDGE_BUFF_START: 15 };
    connectEmbeddedPage(env, new Map([["qollock_settings", JSON.stringify(legacy)]]));
    const loading = env.sandbox.QOL.core.storageBridge.loadSettings();
    env.clock.advance(0);
    const { config } = await loading;
    assert.equal(config.MINIMAP_LARGE_SIZE_ALT, 850);
    assert.equal(config.MINIMAP_LARGE_SIZE_TAB, 850);
    assert.equal(config.ZOOM_X_OFFSET_ALT, 125);
    assert.equal(config.ENABLE_SHOP_ITEM_NOTIFICATIONS, 1);
    assert.equal(config.BRIDGE_BUFF_START, 15);
});



// The injected-script handshake test was removed: SetURL cannot execute scripts,
// and the directory-listing fallback no longer exists. Exercise the hosted page.
test("storage_bridge: hosted page save/load/remove round trip uses Base64 fragment commands", async () => {
    const env = createTestEnvironment();
    const storage = new Map();
    connectEmbeddedPage(env, storage);
    const bridge = env.sandbox.QOL.core.storageBridge;
    assert.equal(bridge.isReady(), true);
    const key = "color#%я";
    const value = '{"CROSSHAIR_COLOR":"#00FF00","PERCENT":"100%","UNICODE":"😀"}';
    const saving = bridge.save(key, value);
    const message = fragmentMessage(env.getLastSetUrl());
    assert.equal(message.f, "save");
    assert.equal(message.a[0], Buffer.from(key).toString("base64"));
    assert.equal(message.a[1], Buffer.from(value).toString("base64"));
    assert.equal(message.a[3], true);
    env.clock.advance(0);
    assert.equal(await saving, true);
    const loading = bridge.load(key);
    env.clock.advance(0);
    assert.equal(await loading, value);
    const removing = bridge.remove(key);
    env.clock.advance(0);
    assert.equal(await removing, true);
    const missing = bridge.load(key);
    env.clock.advance(0);
    assert.equal(await missing, null);
    assert.equal(env.cef.loads, 1, "Commands must not reload the page");
    assert.ok(env.urls.every(url => !url.startsWith("javascript:")));
});

test("storage_bridge: settings save publishes attributes and clear removes disk data", async () => {
    const env = createTestEnvironment();
    const storage = new Map();
    connectEmbeddedPage(env, storage);
    const bridge = env.sandbox.QOL.core.storageBridge;
    const saving = bridge.saveSettings({ LANGUAGE: "russian", PREVIEWS_ENABLED: 0 });
    const raw = env.rootPanel.GetAttributeString("Deadlock_Mod_Settings_v1", "");
    assert.equal(JSON.parse(raw).schema, env.sandbox.QOL_SCHEMA_SEMVER);
    assert.equal(JSON.parse(raw).data.LANGUAGE, "russian");
    env.clock.advance(0);
    assert.equal((await saving).ok, true);
    assert.equal(storage.get("qollock_settings"), raw);
    const clearing = bridge.clearSettings();
    assert.equal(fragmentMessage(env.getLastSetUrl()).f, "remove");
    env.clock.advance(0);
    assert.equal((await clearing).ok, true);
    assert.equal(storage.has("qollock_settings"), false);
});

test("storage_bridge: >30 KB settings save/load is chunked with unique fragments and duplicate titles", async () => {
    const env = createTestEnvironment();
    const storage = new Map();
    connectEmbeddedPage(env, storage, { duplicateTitles: true });
    const bridge = env.sandbox.QOL.core.storageBridge;
    const largeCfg = { LANGUAGE: "korean", TOP_BAR_SCALE: 1.25 };
    for (let i = 0; i < 1800; i++) largeCfg[`FEATURE_KEY_${i}`] = i * 2;
    const raw = JSON.stringify({ schema: "4.0.0", data: largeCfg });
    assert.ok(raw.length > 30000);
    const saving = bridge.save("qollock_settings", raw);
    env.clock.advance(0);
    assert.equal(await saving, true);
    assert.equal(storage.get("qollock_settings"), raw);
    const loading = bridge.loadSettings();
    env.clock.advance(0);
    const result = await loading;
    assert.equal(result.ok, true);
    assert.equal(env.sandbox.MOD_CONFIG.LANGUAGE, "korean");
    assert.equal(env.sandbox.MOD_CONFIG.TOP_BAR_SCALE, 1.25);
    assert.equal(env.sandbox.State.lastConfig.LANGUAGE, "korean");
    assert.equal(env.sandbox.MOD_CONFIG.FEATURE_KEY_1799, undefined);
    const commands = env.urls.filter(url => url.includes("#")).map(fragmentMessage);
    const saves = commands.filter(msg => msg.f === "saveChunk");
    const pulls = commands.filter(msg => msg.f === "next");
    assert.equal(saves.length, Math.ceil(raw.length / 1500));
    assert.equal(pulls.length, saves.length - 1);
    assert.deepEqual(saves.map(msg => msg.a[1]), saves.map((_, i) => i));
    assert.ok(saves.every(msg => Buffer.from(msg.a[3], "base64").toString("utf8").length <= 1500));
    assert.ok(commands.every(msg => typeof msg.q === "string"));
    assert.equal(new Set(commands.map(msg => msg.q)).size, commands.length);
    assert.equal(env.cef.loads, 1);
    assert.ok(env.urls.every(url => !url.startsWith("javascript:")));
    assert.deepEqual(env.clock.errors, []);
});

test("storage_bridge: old cached page is not ready and short re-navigation releases queued save", async () => {
    const env = createTestEnvironment();
    const storage = new Map();
    connectEmbeddedPage(env, storage, { oldPageLoads: 1, duplicateTitles: true });
    const bridge = env.sandbox.QOL.core.storageBridge;
    assert.equal(bridge.isReady(), false);
    const saving = bridge.save("queued", "saved");
    assert.equal(storage.has("queued"), false);
    env.clock.advance(2000);
    assert.equal(bridge.isReady(), true);
    assert.equal(await saving, true);
    assert.equal(storage.get("queued"), "saved");
    assert.equal(env.cef.loads, 2);
    assert.equal(env.logs.filter(message => /cached|outdated/i.test(message)).length, 1);
    assert.deepEqual(env.clock.errors, []);
});

test("storage_bridge: permanently cached page retries at most five attempts and fails queued work", async () => {
    const env = createTestEnvironment();
    connectEmbeddedPage(env, new Map(), { oldPageLoads: Infinity, duplicateTitles: true });
    const bridge = env.sandbox.QOL.core.storageBridge;
    // Queue just before exhaustion to exercise the watchdog failure, not timeout.
    env.clock.advance(4000);
    const failure = assert.rejects(bridge.save("never", "written"), /initialization failed after 5 attempts/);
    env.clock.advance(100000);
    await failure;
    assert.equal(bridge.isReady(), false);
    assert.equal(env.cef.loads, 5, "Initial navigation plus four retries");
    assert.equal(env.logs.filter(message => /cached|outdated/i.test(message)).length, 1);
    assert.ok(env.logs.some(message => /failed to initialize after 5 attempts/.test(message)));
    assert.deepEqual(env.clock.errors, []);
});

test("storage_bridge: readiness rejects plain and unsupported fragment versions", () => {
    const env = createTestEnvironment();
    const bridge = env.sandbox.QOL.core.storageBridge;
    for (const title of ["Index of C:/", "Directory listing", "QOL_BRIDGE_READY", "QOL_BRIDGE_READY:frag2", "QOL_BRIDGE_READY:frag10"]) {
        env.fireTitleEvent(bridge.getPanel(), title);
        assert.equal(bridge.isReady(), false, title);
    }
    assert.equal(env.getLastSetUrl(), BRIDGE_URL);
    env.fireTitleEvent(bridge.getPanel(), "QOL_BRIDGE_READY:frag1");
    assert.equal(bridge.isReady(), true);
});

test("storage_bridge: initial fragment is ignored, repeated identical fragment does not execute", () => {
    const env = createTestEnvironment();
    const storage = new Map();
    const msg = { q: "initial", f: "save", a: ["aw==", "dg==", "qol_1_1", true] };
    const url = BRIDGE_URL + "#" + encodeURIComponent(JSON.stringify(msg));
    connectEmbeddedPage(env, storage, { initialURL: url });
    assert.equal(storage.has("k"), false, "Initial hash must not replay a request");
    const panel = env.sandbox.QOL.core.storageBridge.getPanel();
    panel.SetURL(url);
    env.clock.advance(0);
    assert.equal(storage.has("k"), false);
    msg.q = "new";
    const changed = BRIDGE_URL + "#" + encodeURIComponent(JSON.stringify(msg));
    panel.SetURL(changed);
    env.clock.advance(0);
    assert.equal(storage.get("k"), "v");
    storage.delete("k");
    panel.SetURL(changed);
    env.clock.advance(0);
    assert.equal(storage.has("k"), false);
    assert.equal(env.cef.loads, 1);
});

test("storage_bridge: CEF fake destroys page for blocked schemes and accepts 30 KB HTTPS fragments", () => {
    const env = createTestEnvironment();
    const storage = new Map();
    connectEmbeddedPage(env, storage);
    const panel = env.sandbox.QOL.core.storageBridge.getPanel();
    for (const url of ["javascript:window.__qolRemove('k', 'qol_1_1');", "file:///C:/", "http://example.com"]) {
        panel.SetURL(url);
        assert.equal(env.cef.url, "about:blank");
        assert.equal(env.cef.page, null);
        panel.SetURL(BRIDGE_URL);
        env.clock.advance(0);
    }
    const loads = env.cef.loads;
    const value = "x".repeat(31000);
    const msg = { q: "large-url", f: "save", a: ["aw==", Buffer.from(value).toString("base64"), "qol_1_1", true] };
    panel.SetURL(BRIDGE_URL + "#" + encodeURIComponent(JSON.stringify(msg)));
    env.clock.advance(0);
    assert.equal(storage.get("k"), value);
    assert.equal(env.cef.loads, loads);
});

test("storage_bridge: FIFO serializes concurrent calls, ignores stale titles and repeats get fresh fragments", async () => {
    const env = createTestEnvironment();
    const storage = new Map();
    connectEmbeddedPage(env, storage, { duplicateTitles: true });
    const bridge = env.sandbox.QOL.core.storageBridge;
    const first = bridge.save("key", "first");
    const firstURL = env.getLastSetUrl();
    const second = bridge.save("key", "second");
    assert.equal(env.getLastSetUrl(), firstURL);
    env.clock.advance(0);
    await Promise.all([first, second]);
    assert.equal(storage.get("key"), "second");
    const loading = bridge.load("key");
    env.fireTitleEvent(bridge.getPanel(), "QOL_RES:" + JSON.stringify({ id: requestId(firstURL), ok: true, data: "obsolete" }));
    env.clock.advance(0);
    assert.equal(await loading, "second");
    const again = bridge.load("key");
    env.clock.advance(0);
    assert.equal(await again, "second");
    const messages = env.urls.filter(url => url.includes("#")).map(fragmentMessage);
    assert.equal(new Set(messages.map(msg => msg.q)).size, messages.length);
});

test("storage_bridge: expired queued saves never execute when the bridge connects later", async () => {
    const env = createTestEnvironment();
    const bridge = env.sandbox.QOL.core.storageBridge;
    const expired = assert.rejects(bridge.save("settings", "obsolete"), /timed out/);
    env.clock.advance(5000);
    await expired;
    const storage = new Map();
    connectEmbeddedPage(env, storage);
    assert.equal(storage.has("settings"), false);
    const fresh = bridge.save("settings", "current");
    env.clock.advance(0);
    assert.equal(await fresh, true);
    assert.equal(storage.get("settings"), "current");
});

test("storage_bridge: rejects when incoming chunks arrive out of order", async () => {
    const env = createTestEnvironment();
    const bridge = env.sandbox.QOL.core.storageBridge;
    env.fireTitleEvent(bridge.getPanel(), "QOL_BRIDGE_READY:frag1");
    const loading = bridge.load("strict_order");
    env.fireTitleEvent(bridge.getPanel(), "QOL_RES:" + JSON.stringify({
        id: requestId(env.getLastSetUrl()), ok: true, data: "foo", chunked: true, part: 1, total: 2,
    }));
    await assert.rejects(loading, /Out of order chunk/);
});

test("storage_bridge: request timeout resets on chunk progress and ignores late chunks", async () => {
    const env = createTestEnvironment();
    const bridge = env.sandbox.QOL.core.storageBridge;
    env.fireTitleEvent(bridge.getPanel(), "QOL_BRIDGE_READY:frag1");
    const loading = bridge.load("slow");
    const id = requestId(env.getLastSetUrl());
    const failure = assert.rejects(loading, /timed out/);
    env.clock.advance(4000);
    env.fireTitleEvent(bridge.getPanel(), "QOL_RES:" + JSON.stringify({
        id, ok: true, _seq: 1, data: "first", chunked: true, part: 0, total: 3,
    }));
    const nextURL = env.getLastSetUrl();
    env.clock.advance(4000);
    // Duplicate/stale sequence cannot request another chunk or renew the timer.
    env.fireTitleEvent(bridge.getPanel(), "QOL_RES:" + JSON.stringify({
        id, ok: true, _seq: 1, data: "first", chunked: true, part: 0, total: 3,
    }));
    assert.equal(env.getLastSetUrl(), nextURL);
    env.clock.advance(1000);
    await failure;
    env.fireTitleEvent(bridge.getPanel(), "QOL_RES:" + JSON.stringify({
        id, ok: true, _seq: 2, data: "late", chunked: true, part: 1, total: 3,
    }));
    assert.equal(env.getLastSetUrl(), nextURL);
    const fresh = bridge.save("fresh", "value");
    replyToCurrentRequest(env);
    assert.equal(await fresh, true);
});

test("storage_bridge: runtime has no blocked script transport or injection API", () => {
    const code = fs.readFileSync(path.resolve(__dirname, "../panorama/scripts/core/ql_storage_bridge.js"), "utf8");
    assert.equal(code.includes("javascript:"), false);
    assert.equal(createTestEnvironment().sandbox.QOL.core.storageBridge._injectBridgeScript, undefined);
});

test("storage_bridge: QOL_BRIDGE_ERROR marks ready as false", () => {
    const { sandbox, fireTitleEvent } = createTestEnvironment();
    const bridge = sandbox.QOL.core.storageBridge;
    const panel = bridge.getPanel();

    fireTitleEvent(panel, "QOL_BRIDGE_READY:frag1");
    assert.strictEqual(bridge.isReady(), true);

    fireTitleEvent(panel, "QOL_BRIDGE_ERROR:StorageAccessDenied");
    assert.strictEqual(bridge.isReady(), false, "Bridge ready reset to false on error");
});

test("storage_bridge: HUD initialization does not adopt a descendant EscapeMenu realm bridge", () => {
    const { sandbox, hudPanel, doc, clock, fireTitleEvent } = createTestEnvironment();
    const hudBridge = sandbox.QOL.core.storageBridge;
    hudBridge.getPanel().DeleteAsync(0);
    clock.advance(0);
    const escapeMenu = doc.create("Panel", { id: "EscapeMenu" });
    hudPanel.addChild(escapeMenu);
    const em = {
        ...sandbox,
        QOL: { core: { panel: sandbox.QOL.core.panel } },
        $: { ...sandbox.$, GetContextPanel: () => escapeMenu }
    };
    em.globalThis = em;
    vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, "../panorama/scripts/core/ql_storage_bridge.js"), "utf8"), em);
    const emBridge = em.QOL.core.storageBridge;
    const emPanel = emBridge.getPanel();
    const hudBridgePanel = hudBridge.init(hudPanel);
    assert.notStrictEqual(hudBridgePanel, emPanel, "Each realm must own its native event source");
    assert.strictEqual(hudBridgePanel.GetParent(), hudPanel);
    assert.strictEqual(emPanel.GetParent(), escapeMenu);
    fireTitleEvent(emPanel, "QOL_BRIDGE_READY:frag1");
    assert.strictEqual(emBridge.isReady(), true);
    assert.strictEqual(hudBridge.isReady(), false, "A sibling realm's handshake must not mark the HUD ready");
});



function replyToCurrentRequest(env, data, error) {
    const id = requestId(env.getLastSetUrl());
    assert.ok(id, "A real bridge request must have been sent");
    env.fireTitleEvent(env.sandbox.QOL.core.storageBridge.getPanel(), "QOL_RES:" + JSON.stringify({
        id, ok: !error, data, error
    }));
}

function publishEdit(env, value = 15) {
    const raw = env.sandbox.WrapConfigForStorage({ BRIDGE_BUFF_START: value, LANGUAGE: 1 });
    env.sandbox.QOL.core.persistence.writeStorageConfigRawToUi(env.rootPanel, raw);
    return raw;
}

test("storage_bridge: startup restore preserves edits made before readiness and during a pending load", async () => {
    for (const editBeforeReady of [true, false]) {
        const env = createTestEnvironment();
        const bridge = env.sandbox.QOL.core.storageBridge;
        bridge.enableAutoload(true);
        let fresh;
        if (editBeforeReady) fresh = publishEdit(env);
        env.fireTitleEvent(bridge.getPanel(), "QOL_BRIDGE_READY:frag1");
        if (!editBeforeReady) fresh = publishEdit(env);
        if (env.getLastSetUrl().includes("#") && fragmentMessage(env.getLastSetUrl()).f === "load") {
            replyToCurrentRequest(env, env.sandbox.WrapConfigForStorage({ BRIDGE_BUFF_START: 30, LANGUAGE: 0 }));
        }
        await Promise.resolve();
        assert.equal(env.rootPanel.GetAttributeString("Deadlock_Mod_Settings_v1", ""), fresh);
        assert.equal(env.hudPanel.GetAttributeString("Deadlock_Mod_Settings_v1", ""), fresh);
        assert.equal(env.rootPanel.GetAttributeString("QOL_USER_EDIT_REV", ""), "1");
    }
});

test("storage_bridge: startup retry cannot reacquire permission to overwrite a user edit", async () => {
    const env = createTestEnvironment();
    const bridge = env.sandbox.QOL.core.storageBridge;
    bridge.enableAutoload(true);
    env.fireTitleEvent(bridge.getPanel(), "QOL_BRIDGE_READY:frag1");
    replyToCurrentRequest(env, null, "temporary read error");
    await Promise.resolve();
    await Promise.resolve();
    const fresh = publishEdit(env);
    const failedUrl = env.getLastSetUrl();
    env.clock.advance(6000);
    assert.equal(env.getLastSetUrl(), failedUrl, "Do not start a retry after user edits");
    assert.equal(env.rootPanel.GetAttributeString("Deadlock_Mod_Settings_v1", ""), fresh);
    assert.equal(env.clock.errors.length, 0);
});

test("storage_bridge: an unflushed dirty edit invalidates a pending restore", async () => {
    const env = createTestEnvironment();
    const bridge = env.sandbox.QOL.core.storageBridge;
    env.fireTitleEvent(bridge.getPanel(), "QOL_BRIDGE_READY:frag1");
    const fresh = publishEdit(env);
    const pending = bridge.loadSettings();
    env.sandbox.QOL.core.persistence.markConfigEdited(env.rootPanel);
    replyToCurrentRequest(env, env.sandbox.WrapConfigForStorage({ BRIDGE_BUFF_START: 30 }));
    const result = await pending;
    assert.equal(result.applied, false);
    assert.equal(result.skipped, "newer-edits");
    assert.equal(env.rootPanel.GetAttributeString("Deadlock_Mod_Settings_v1", ""), fresh);
});

test("storage_bridge: invalid restores reject without changing live raw, revision, config or state", async () => {
    for (const raw of ['{"broken', '[]', '5', '"wrong"', '{"schema":"4.0.0","data":null}', '{"schema":"4.0.0","data":[]}', '{"unrelated":1}', '{"LANGUAGE":{}}']) {
        const env = createTestEnvironment();
        const bridge = env.sandbox.QOL.core.storageBridge;
        env.fireTitleEvent(bridge.getPanel(), "QOL_BRIDGE_READY:frag1");
        const fresh = publishEdit(env);
        const beforeConfig = JSON.stringify(env.sandbox.MOD_CONFIG);
        const revision = env.rootPanel.GetAttributeString("QOL_USER_EDIT_REV", "");
        const pending = bridge.loadSettings();
        replyToCurrentRequest(env, raw);
        await assert.rejects(pending, /stored|Stored|settings|setting/);
        assert.equal(env.rootPanel.GetAttributeString("Deadlock_Mod_Settings_v1", ""), fresh, raw);
        assert.equal(env.rootPanel.GetAttributeString("QOL_USER_EDIT_REV", ""), revision, raw);
        assert.equal(JSON.stringify(env.sandbox.MOD_CONFIG), beforeConfig, raw);
        assert.equal(env.sandbox.State.lastConfig, null, raw);
    }
});

test("storage_bridge: explicit load replaces preceding edits, but missing storage keeps them", async () => {
    const env = createTestEnvironment();
    const bridge = env.sandbox.QOL.core.storageBridge;
    env.fireTitleEvent(bridge.getPanel(), "QOL_BRIDGE_READY:frag1");
    publishEdit(env, 30);
    const load = bridge.loadSettings();
    replyToCurrentRequest(env, env.sandbox.WrapConfigForStorage({ BRIDGE_BUFF_START: 15 }));
    assert.equal((await load).applied, true);
    assert.equal(env.sandbox.MOD_CONFIG.BRIDGE_BUFF_START, 15);
    const fresh = publishEdit(env, 20);
    const missing = bridge.loadSettings();
    replyToCurrentRequest(env, null);
    assert.equal((await missing).notFound, true);
    assert.equal(env.rootPanel.GetAttributeString("Deadlock_Mod_Settings_v1", ""), fresh);
});

// tests/storage_bridge.test.js
// =============================================================================
// Unit tests for Chromium Embedded Framework (CEF) Local Storage Bridge
// (panorama/scripts/core/ql_storage_bridge.js)
// =============================================================================

"use strict";

const test = require("node:test");
const { setImmediate: flush } = require("node:timers/promises");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const os = require("node:os");
const { URL } = require("node:url");

const BRIDGE_URL = "https://predi-i.github.io/qollock-updates/bridge.html";
// Verbatim mirror of the hosted qollock-updates/bridge.html, not a test protocol.
const pageScript = file => fs.readFileSync(path.join(__dirname, "fixtures", file), "utf8")
    .match(/<script>([\s\S]*?)<\/script>/)[1];
const PAGE_SCRIPT = pageScript("qollock_bridge.html");
// The previously hosted page (fragment protocol v1 without the write token), kept verbatim
// so a current client is checked against pages players may still have cached.
const UNTOKENED_PAGE_SCRIPT = pageScript("qollock_bridge_untokened.html");
const TOKEN_KEY = "__qol_bridge_token__";
const LOCK_KEY = "__qol_bridge_locked__";

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
            LANGUAGE: 0,
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
    for (const name of ["core/ql_namespace.js", "ql_utils.js", "core/ql_panel_helpers.js", "ql_shared_presets.js", "ql_settings_contract.js", "ql_legacy_compact.js", "ql_config.js", "core/ql_persistence.js"]) {
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
            crypto: require("node:crypto").webcrypto,
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
            : options.pageScript || PAGE_SCRIPT;
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

test("Auto-Save: production settings edits reach the embedded page and restore in a fresh realm", async () => {
    const e = require("./load_settings_environment")(), g = e.global;
    e.hud.sandbox.global.QOL.core.App.shutdown();
    const panel = g.QOL.core.storageBridge.getPanel();
    assert.ok(panel);
    panel.SetURL = () => {};
    const env = {
        sandbox: g, clock: e.clock,
        getLastSetUrl: () => BRIDGE_URL,
        fireTitleEvent: (target, title) => e.settings.dispatch("HTMLTitle", [target, title]),
    };
    const storage = new Map();
    connectEmbeddedPage(env, storage);
    assert.equal(g.QOL.core.storageBridge.isReady(), true);
    g.MOD_CONFIG.AUTO_SAVE_CHANGES = 1;
    g.SaveAndSync();
    g.MOD_CONFIG.SOULS_X_OFFSET = 87;
    g.MarkConfigDirty();
    e.clock.advance(1200);
    // The production personal-preset save performs additional asynchronous
    // storage requests. Pump transport and JS jobs without replacing any owner.
    for (let i = 0; i < 20; i++) { await flush(); e.clock.advance(0); }
    const stored = storage.get("qollock_settings");
    assert.ok(stored, "live attributes alone are not a durable save");
    assert.equal(JSON.parse(stored).data.SOULS_X_OFFSET, 87);
    assert.equal(JSON.parse(stored).data.AUTO_SAVE_CHANGES, 1);
    assert.equal(Object.hasOwn(JSON.parse(stored).data, "PREVIEWS_ENABLED"), false);
    const fresh = createTestEnvironment();
    fresh.sandbox.QOL.core.storageBridge.enableAutoload(true);
    connectEmbeddedPage(fresh, storage);
    for (let i = 0; i < 10; i++) { await flush(); fresh.clock.advance(0); }
    assert.equal(fresh.sandbox.MOD_CONFIG.SOULS_X_OFFSET, 87);
    assert.equal(fresh.sandbox.MOD_CONFIG.AUTO_SAVE_CHANGES, 1);
    assert.deepEqual(e.clock.errors, []); assert.deepEqual(e.doc.eventErrors, []);
    assert.deepEqual(fresh.clock.errors, []);
});

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

test("storage_bridge: selected startup snapshot leaves this session unchanged and restores after simulated restart", async t => {
    const reopenStorage = diskStorage(t), env = createTestEnvironment();
    connectEmbeddedPage(env, reopenStorage());
    const before = JSON.stringify(env.sandbox.MOD_CONFIG);
    const published = env.rootPanel.GetAttributeString("Deadlock_Mod_Settings_v1", "");
    const saving = env.sandbox.QOL.core.storageBridge.saveStartupSettings({ BRIDGE_BUFF_START: 15 });
    assert.equal(reopenStorage().has("qollock_settings"), false, "not saved before CEF acknowledgment");
    env.clock.advance(0);
    assert.equal((await saving).ok, true);
    assert.equal(JSON.stringify(env.sandbox.MOD_CONFIG), before);
    assert.equal(env.rootPanel.GetAttributeString("Deadlock_Mod_Settings_v1", ""), published);
    const next = createTestEnvironment();
    next.sandbox.QOL.core.storageBridge.enableAutoload(true);
    connectEmbeddedPage(next, reopenStorage());
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(next.sandbox.MOD_CONFIG.BRIDGE_BUFF_START, 15);
    assert.deepEqual(next.clock.errors, []);
});

test("storage_bridge: startup selection rejects invalid data and quota failures without altering this session", async () => {
    const env = createTestEnvironment(), bridge = env.sandbox.QOL.core.storageBridge;
    const storage = new Map([["qollock_settings", "previous"]]);
    const browser = connectEmbeddedPage(env, storage);
    const before = JSON.stringify(env.sandbox.MOD_CONFIG);
    const published = env.rootPanel.GetAttributeString("Deadlock_Mod_Settings_v1", "");
    await assert.rejects(bridge.saveStartupSettings("broken"));
    assert.equal(storage.get("qollock_settings"), "previous");
    browser.localStorage.setItem = () => { throw Error("QuotaExceededError"); };
    const saving = bridge.saveStartupSettings({ BRIDGE_BUFF_START: 15 });
    env.clock.advance(0);
    await assert.rejects(saving, /QuotaExceededError/);
    assert.equal(storage.get("qollock_settings"), "previous");
    assert.equal(JSON.stringify(env.sandbox.MOD_CONFIG), before);
    assert.equal(env.rootPanel.GetAttributeString("Deadlock_Mod_Settings_v1", ""), published);
});

test("storage_bridge: choosing a startup snapshot invalidates a preceding pending restore", async () => {
    const env = createTestEnvironment(), bridge = env.sandbox.QOL.core.storageBridge;
    const storage = new Map([["qollock_settings", env.sandbox.WrapConfigForStorage({ BRIDGE_BUFF_START: 30 })]]);
    connectEmbeddedPage(env, storage);
    const before = JSON.stringify(env.sandbox.MOD_CONFIG);
    const loading = bridge.loadSettings();
    const saving = bridge.saveStartupSettings({ BRIDGE_BUFF_START: 15 });
    env.clock.advance(0);
    assert.equal((await loading).skipped, "newer-edits");
    assert.equal((await saving).ok, true);
    assert.equal(JSON.stringify(env.sandbox.MOD_CONFIG), before);
    assert.equal(JSON.parse(storage.get("qollock_settings")).data.BRIDGE_BUFF_START, 15);
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

// The bridge page runs whatever request is in its URL fragment, and any page the player opens in Steam's
// browser or overlay shares the game's CEF storage, so another site can navigate to it with its own request.
// It cannot read the replies (they only reach this page's title), but it could delete or replace saved data.
// Ways the write token can fail: a token-less, wrong-token or reserved-key request still changes storage after
// QOLLOCK has used the page; the token or lock keys can be planted or cleared before that; the token is not
// stable across a restart, so the player's own saves stop working; a client from before the token, or the
// current client against a cached older page, can no longer save.
function sendForeign(env, f, a) {
    const panel = env.sandbox.QOL.core.storageBridge.getPanel();
    sendForeign.serial = (sendForeign.serial || 0) + 1;
    panel.SetURL(BRIDGE_URL + "#" + encodeURIComponent(JSON.stringify({ q: "foreign" + sendForeign.serial, f, a })));
    env.clock.advance(0);
}
const b64 = text => Buffer.from(text).toString("base64");

test("storage_bridge: once QOLLOCK has used the page, other pages cannot change or delete saved data", async () => {
    const env = createTestEnvironment();
    const storage = new Map();
    connectEmbeddedPage(env, storage);
    const bridge = env.sandbox.QOL.core.storageBridge;
    const saving = bridge.save("qollock_settings", "mine");
    const token = storage.get(TOKEN_KEY);
    assert.match(token, /^[0-9a-f]{32}$/, "the page keeps a random per-install token");
    assert.equal(fragmentMessage(env.getLastSetUrl()).a.at(-1), token, "QOLLOCK's writes carry the token");
    env.clock.advance(0);
    assert.equal(await saving, true);
    const big = "x".repeat(4000);
    for (const [f, a] of [
        ["remove", [b64("qollock_settings"), "qol_9_1", true]],
        ["save", [b64("qollock_settings"), b64("theirs"), "qol_9_2", true]],
        ["saveChunk", [b64("qollock_settings"), 0, 1, b64("theirs"), "qol_9_3", true]],
        ["save", [b64("qollock_settings"), b64("theirs"), "qol_9_4", true, "f".repeat(32)]],
        ["remove", [b64("qollock_settings"), "qol_9_5", true, null]],
        ["saveChunk", [b64("qollock_settings"), 0, 2, b64(big.slice(0, 1500)), "qol_9_6", true]],
        ["saveChunk", [b64("qollock_settings"), 1, 2, b64(big.slice(1500)), "qol_9_6", true]],
        ["remove", [b64(LOCK_KEY), "qol_9_7", true]],
        ["save", [b64(TOKEN_KEY), b64("0".repeat(32)), "qol_9_8", true]],
    ]) sendForeign(env, f, a);
    assert.equal(storage.get("qollock_settings"), "mine");
    assert.equal(storage.get(TOKEN_KEY), token);
    assert.equal(storage.get(LOCK_KEY), "1");
    const again = bridge.save("qollock_settings", "mine again");
    env.clock.advance(0);
    assert.equal(await again, true, "QOLLOCK keeps saving");
    assert.equal(storage.get("qollock_settings"), "mine again");
});

test("storage_bridge: the token and lock keys cannot be planted, read or cleared through requests", async () => {
    const env = createTestEnvironment();
    const storage = new Map();
    connectEmbeddedPage(env, storage);
    const token = storage.get(TOKEN_KEY);
    assert.match(token, /^[0-9a-f]{32}$/);
    sendForeign(env, "save", [b64(TOKEN_KEY), b64("0".repeat(32)), "qol_9_1", true]);
    sendForeign(env, "saveChunk", [b64(TOKEN_KEY), 0, 1, b64("0".repeat(32)), "qol_9_2", true]);
    sendForeign(env, "save", [b64(LOCK_KEY), b64("0"), "qol_9_3", true]);
    sendForeign(env, "remove", [b64(TOKEN_KEY), "qol_9_4", true]);
    assert.equal(storage.get(TOKEN_KEY), token, "before any lock, the token still cannot be replaced");
    assert.equal(storage.has(LOCK_KEY), false);
    const bridge = env.sandbox.QOL.core.storageBridge;
    for (const key of [TOKEN_KEY, LOCK_KEY]) {
        const reading = bridge.load(key);
        env.clock.advance(0);
        await assert.rejects(reading, /reserved/i, key);
    }
});

test("storage_bridge: the token survives a restart, so saved data stays writable by QOLLOCK only", async t => {
    const disk = diskStorage(t)();
    const first = createTestEnvironment();
    connectEmbeddedPage(first, disk);
    const saving = first.sandbox.QOL.core.storageBridge.save("qollock_settings", "before restart");
    first.clock.advance(0);
    assert.equal(await saving, true);
    const token = disk.get(TOKEN_KEY);
    const second = createTestEnvironment();
    connectEmbeddedPage(second, disk);
    assert.equal(disk.get(TOKEN_KEY), token, "a reload reuses the stored token");
    const bridge = second.sandbox.QOL.core.storageBridge;
    const loading = bridge.load("qollock_settings");
    second.clock.advance(0);
    assert.equal(await loading, "before restart");
    const after = bridge.save("qollock_settings", "after restart");
    second.clock.advance(0);
    assert.equal(await after, true);
    sendForeign(second, "remove", [b64("qollock_settings"), "qol_9_1", true]);
    assert.equal(disk.get("qollock_settings"), "after restart");
});

test("storage_bridge: older clients and older cached pages keep working until the token is in use", async () => {
    // A client from before the token sends no token: accepted while no token-aware client has used the page.
    const legacy = createTestEnvironment();
    const storage = new Map();
    connectEmbeddedPage(legacy, storage);
    sendForeign(legacy, "save", [b64("qollock_settings"), b64("legacy"), "qol_9_1", true]);
    assert.equal(storage.get("qollock_settings"), "legacy");
    sendForeign(legacy, "remove", [b64("qollock_settings"), "qol_9_2", true]);
    assert.equal(storage.has("qollock_settings"), false);
    // The current client against the previously hosted page: no token in the ready title, none sent.
    const env = createTestEnvironment();
    const old = new Map();
    connectEmbeddedPage(env, old, { pageScript: UNTOKENED_PAGE_SCRIPT });
    const bridge = env.sandbox.QOL.core.storageBridge;
    assert.equal(bridge.isReady(), true);
    const saving = bridge.save("qollock_settings", "on the old page");
    assert.equal(fragmentMessage(env.getLastSetUrl()).a.length, 4, "no token without a token-aware page");
    env.clock.advance(0);
    assert.equal(await saving, true);
    const loading = bridge.load("qollock_settings");
    env.clock.advance(0);
    assert.equal(await loading, "on the old page");
});

test("storage_bridge: settings save publishes attributes and clear removes disk data", async () => {
    const env = createTestEnvironment();
    const storage = new Map();
    connectEmbeddedPage(env, storage);
    const bridge = env.sandbox.QOL.core.storageBridge;
    const saving = bridge.saveSettings({ LANGUAGE: 1, PREVIEWS_ENABLED: 0 });
    const raw = env.rootPanel.GetAttributeString("Deadlock_Mod_Settings_v1", "");
    assert.equal(JSON.parse(raw).schema, env.sandbox.QOL_SCHEMA_SEMVER);
    assert.equal(JSON.parse(raw).data.LANGUAGE, 1);
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
    const largeCfg = { LANGUAGE: 12, TOP_BAR_SCALE: 1.25 };
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
    assert.equal(env.sandbox.MOD_CONFIG.LANGUAGE, 12);
    assert.equal(env.sandbox.MOD_CONFIG.TOP_BAR_SCALE, 1.25);
    assert.equal(env.sandbox.State.lastConfig.LANGUAGE, 12);
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

for (const cancellation of ["ignored", "throw"]) for (const zeroHandle of [false, true]) {
    test(`storage_bridge: retired watchdog cannot navigate a replacement with cancellation=${cancellation}, zero=${zeroHandle}`, () => {
        const env = createTestEnvironment(), bridge = env.sandbox.QOL.core.storageBridge;
        const initial = bridge.getPanel();
        env.fireTitleEvent(initial, "QOL_BRIDGE_READY:frag1");
        const schedule = env.sandbox.$.Schedule;
        let zeroNativeHandle = null;
        const cancellations = [];
        env.sandbox.$.Schedule = (delay, callback) => {
            const handle = schedule(delay, callback);
            if (zeroHandle && zeroNativeHandle === null) { zeroNativeHandle = handle; return 0; }
            return handle;
        };
        env.sandbox.$.CancelScheduled = handle => {
            cancellations.push(handle);
            if (cancellation === "throw") throw Error("modeled cancellation failure");
        };
        initial.IsValid = () => false;
        const first = bridge.init(env.hudPanel, { autoload: false });
        env.clock.advance(10000);
        first.IsValid = () => false;
        const replacement = bridge.init(env.hudPanel, { autoload: false });
        const before = env.urls.length;
        env.clock.advance(10000);
        assert.equal(env.urls.length, before, "the retired watchdog cannot consume the new panel's retry budget");
        assert.equal(bridge.getPanel(), replacement);
        assert.equal(bridge.isReady(), false);
        env.clock.advance(10000);
        assert.equal(env.urls.length, before + 1, "the replacement owns its full twenty-second startup interval");
        if (zeroHandle) assert.ok(cancellations.includes(0));
        assert.deepEqual(env.clock.errors, []);
    });
}

test("storage_bridge: retired cached-page watchdogs cannot repeat exhausted initialization", async () => {
    const env = createTestEnvironment(), bridge = env.sandbox.QOL.core.storageBridge;
    env.sandbox.$.CancelScheduled = () => {};
    connectEmbeddedPage(env, new Map(), { oldPageLoads: 100, duplicateTitles: true });
    env.clock.advance(4000);
    const rejected = assert.rejects(bridge.save("pending", "payload"), /Bridge initialization failed/);
    env.clock.advance(1000);
    await rejected;
    const loads = env.cef.loads;
    assert.equal(loads, 5);
    assert.equal(env.logs.filter(message => /failed to initialize after 5 attempts/.test(message)).length, 1);
    env.clock.advance(25000);
    assert.equal(env.cef.loads, loads);
    assert.equal(env.logs.filter(message => /failed to initialize after 5 attempts/.test(message)).length, 1,
        "cancelled startup/cached-page callbacks remain retired after exhaustion");
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

test("storage_bridge: low-level callbacks retain their request receiver and run before Promise reactions", async () => {
    const env = createTestEnvironment(), bridge = env.sandbox.QOL.core.storageBridge;
    connectEmbeddedPage(env, new Map(), { duplicateTitles: true });
    const callbacks = [];
    let reacted = false;
    const first = bridge.save("first", "one", function(error, data) {
        callbacks.push({ receiver: this, error, data });
    });
    const sentId = requestId(env.getLastSetUrl());
    first.then(() => { reacted = true; });
    env.clock.advance(0);
    assert.equal(callbacks.length, 1);
    assert.equal(callbacks[0].receiver.id, sentId);
    assert.equal(callbacks[0].error, null);
    assert.equal(callbacks[0].data, true);
    assert.equal(reacted, false, "the transport callback stays synchronous, independently of Promise delivery");
    assert.equal(await first, true);
    assert.equal(reacted, true);
    assert.deepEqual(env.clock.errors, []);
});

for (const failure of [false, true]) {
    test(`storage_bridge: throwing low-level callbacks stay observable and release FIFO after error=${failure}`, async () => {
        const env = createTestEnvironment(), bridge = env.sandbox.QOL.core.storageBridge;
        const storage = new Map(), store = storage.set.bind(storage);
        storage.set = (key, value) => {
            if (failure && key === "first") throw Error("modeled storage rejection");
            return store(key, value);
        };
        connectEmbeddedPage(env, storage, { duplicateTitles: true });
        const callbacks = [];
        let reacted = false;
        const first = bridge.save("first", "one", function(error, data) {
            callbacks.push({ receiver: this, error, data });
            throw Error("modeled callback failure");
        });
        const sentId = requestId(env.getLastSetUrl());
        const outcome = first.then(data => { reacted = true; return { data }; }, error => { reacted = true; return { error }; });
        const queued = bridge.save("successor", "two", () => callbacks.push({ successor: true }));
        env.clock.advance(0);
        assert.ok(env.logs.some(message => message.includes("modeled callback failure")));
        assert.equal(callbacks.length, 2);
        assert.equal(callbacks[0].receiver.id, sentId);
        assert.equal(callbacks[1].successor, true);
        assert.equal(reacted, false);
        const result = await outcome;
        if (failure) {
            assert.match(callbacks[0].error.message, /modeled storage rejection/);
            assert.equal(callbacks[0].data, null);
            assert.match(result.error.message, /modeled storage rejection/);
        } else {
            assert.equal(callbacks[0].error, null);
            assert.equal(callbacks[0].data, true);
            assert.equal(result.data, true);
        }
        assert.equal(await queued, true);
        assert.equal(storage.get("successor"), "two");
        assert.deepEqual(env.clock.errors, []);
    });
}

test("storage_bridge: a rejected initial timeout arm cannot leave a save queued for later dispatch", async () => {
    const env = createTestEnvironment(), bridge = env.sandbox.QOL.core.storageBridge;
    const schedule = env.sandbox.$.Schedule, callbacks = [];
    env.sandbox.$.Schedule = () => { throw Error("modeled initial timer failure"); };
    const failed = bridge.save("failed-key", "rejected payload", (error, data) => callbacks.push({ error, data }));
    const notifiedBeforeReadiness = callbacks.length;
    await assert.rejects(failed, /modeled initial timer failure/);
    env.sandbox.$.Schedule = schedule;
    const storage = new Map();
    connectEmbeddedPage(env, storage);
    assert.equal(storage.has("failed-key"), false, "a rejected operation cannot write after a later handshake");
    assert.equal(notifiedBeforeReadiness, 1, "the low-level error callback settles synchronously");
    assert.equal(callbacks.length, 1);
    assert.match(callbacks[0].error.message, /modeled initial timer failure/);
    assert.equal(callbacks[0].data, null);
    const fresh = bridge.save("fresh-key", "accepted payload");
    env.clock.advance(0);
    assert.equal(await fresh, true);
    assert.equal(storage.get("fresh-key"), "accepted payload");
    assert.deepEqual(env.clock.errors, []);
});

test("storage_bridge: a rejected dispatch timeout arm releases FIFO before callback-enqueued work", async () => {
    const env = createTestEnvironment(), bridge = env.sandbox.QOL.core.storageBridge;
    const callbacks = [], outcomes = [];
    let reentrant;
    const failed = bridge.save("failed-key", "rejected payload", (error, data) => {
        callbacks.push({ key: "failed", error, data });
        reentrant = bridge.save("callback-key", "callback payload", (nextError, nextData) => {
            callbacks.push({ key: "callback", error: nextError, data: nextData });
        });
    });
    const queued = bridge.save("queued-key", "queued payload", (error, data) => callbacks.push({ key: "queued", error, data }));
    failed.then(() => outcomes.push("failed:success"), () => outcomes.push("failed:error"));
    queued.then(() => outcomes.push("queued:success"), () => outcomes.push("queued:error"));
    const schedule = env.sandbox.$.Schedule;
    let reject = true;
    env.sandbox.$.Schedule = (delay, callback) => {
        if (reject) { reject = false; throw Error("modeled dispatch timer failure"); }
        return schedule(delay, callback);
    };
    const storage = new Map();
    connectEmbeddedPage(env, storage);
    await Promise.resolve();
    assert.deepEqual(outcomes, ["failed:error", "queued:success"], "failure cannot leave the active FIFO slot occupied");
    await assert.rejects(failed, /modeled dispatch timer failure/);
    assert.equal(await queued, true);
    assert.equal(await reentrant, true);
    assert.deepEqual(callbacks.map(result => result.key), ["failed", "queued", "callback"]);
    assert.match(callbacks[0].error.message, /modeled dispatch timer failure/);
    assert.equal(callbacks[0].data, null);
    for (const result of callbacks.slice(1)) { assert.equal(result.error, null); assert.equal(result.data, true); }
    assert.equal(storage.has("failed-key"), false);
    assert.equal(storage.get("queued-key"), "queued payload");
    assert.equal(storage.get("callback-key"), "callback payload");
    assert.deepEqual(env.clock.errors, []);
});

for (const operation of ["save", "load"]) {
    test(`storage_bridge: failed ${operation} chunk timeout arm retires partial transport and releases FIFO`, async () => {
        const env = createTestEnvironment(), bridge = env.sandbox.QOL.core.storageBridge;
        const payload = JSON.stringify({ schema: "4.0.0", data: { LANGUAGE: 12, TOP_BAR_SCALE: 1.25, padding: "x".repeat(4000) } });
        const previous = JSON.stringify({ schema: "4.0.0", data: { LANGUAGE: 0 } });
        const stored = operation === "save" ? previous : payload;
        const storage = new Map([["qollock_settings", stored]]);
        connectEmbeddedPage(env, storage, { duplicateTitles: true });
        const rawBefore = env.hudPanel.GetAttributeString("Deadlock_Mod_Settings_v1", "");
        const configBefore = { ...env.sandbox.MOD_CONFIG }, stateBefore = env.sandbox.State.lastConfig;
        const callbacks = [], outcomes = [];
        const callback = (error, data) => callbacks.push({ error, data });
        const failed = operation === "save" ? bridge.save("qollock_settings", payload, callback) : bridge.loadSettings(callback);
        const queued = bridge.save("successor", "accepted payload");
        failed.then(() => outcomes.push("failed:success"), () => outcomes.push("failed:error"));
        queued.then(() => outcomes.push("queued:success"), () => outcomes.push("queued:error"));
        const schedule = env.sandbox.$.Schedule;
        let reject = true;
        env.sandbox.$.Schedule = (delay, fn) => {
            if (reject) { reject = false; throw Error("modeled chunk timer failure"); }
            return schedule(delay, fn);
        };
        env.clock.advance(0);
        await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
        assert.deepEqual(outcomes.sort(), ["failed:error", "queued:success"], "partial chunk transport cannot retain the active request");
        await assert.rejects(failed, /Failed to (send save|request) chunk 1: modeled chunk timer failure/);
        assert.equal(await queued, true);
        assert.equal(callbacks.length, 1);
        assert.match(callbacks[0].error.message, /modeled chunk timer failure/);
        assert.equal(callbacks[0].data, null);
        assert.equal(storage.get("qollock_settings"), stored, "an incomplete save cannot replace previous disk data");
        assert.equal(storage.get("successor"), "accepted payload");
        assert.equal(env.hudPanel.GetAttributeString("Deadlock_Mod_Settings_v1", ""), rawBefore);
        assert.deepEqual(env.sandbox.MOD_CONFIG, configBefore);
        assert.equal(env.sandbox.State.lastConfig, stateBefore);
        assert.deepEqual(env.clock.errors, []);
    });
}

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

test("storage_bridge: rejected native publication cannot replace live config or report an applied restore", async () => {
    for (const rejectedKey of ["Deadlock_Mod_Settings_v1", "QOL_USER_EDIT_REV"]) {
        const env = createTestEnvironment(), bridge = env.sandbox.QOL.core.storageBridge;
        env.fireTitleEvent(bridge.getPanel(), "QOL_BRIDGE_READY:frag1");
        const fresh = publishEdit(env), before = JSON.stringify(env.sandbox.MOD_CONFIG);
        const revision = env.rootPanel.GetAttributeString("QOL_USER_EDIT_REV", "");
        const hud = env.sandbox.QOL.core.persistence.resolveHudPanel(env.rootPanel);
        for (const host of new Set([env.rootPanel, hud])) {
            const write = host.SetAttributeString.bind(host);
            host.SetAttributeString = (key, value) => key === rejectedKey ? false : write(key, value);
        }
        const pending = bridge.loadSettings();
        replyToCurrentRequest(env, env.sandbox.WrapConfigForStorage({ BRIDGE_BUFF_START: 30 }));
        await assert.rejects(pending, /publication rejected/);
        assert.equal(env.rootPanel.GetAttributeString("Deadlock_Mod_Settings_v1", ""), fresh);
        assert.equal(env.rootPanel.GetAttributeString("QOL_USER_EDIT_REV", ""), revision);
        assert.equal(JSON.stringify(env.sandbox.MOD_CONFIG), before);
        assert.equal(env.sandbox.State.lastConfig, null);
        assert.equal(env.clock.errors.length, 0);
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

test("storage_bridge: a pending restore cannot cross a HUD replacement with matching revisions", async () => {
    const env = createTestEnvironment(), bridge = env.sandbox.QOL.core.storageBridge;
    const persistence = env.sandbox.QOL.core.persistence;
    env.fireTitleEvent(bridge.getPanel(), "QOL_BRIDGE_READY:frag1");
    env.sandbox.$.GetContextPanel = () => env.rootPanel;
    const pending = bridge.loadSettings(), stamp = persistence.getConfigChangeStamp(env.rootPanel);
    const beforeConfig = JSON.stringify(env.sandbox.MOD_CONFIG);
    env.hudPanel.SetParent(env.doc.create("Panel", { id: "RetiredRoot" }));
    const nextHud = env.doc.create("Panel", { id: "Hud" }); env.rootPanel.addChild(nextHud);
    const fresh = env.sandbox.WrapConfigForStorage({ BRIDGE_BUFF_START: 15 });
    nextHud.SetAttributeString("QOL_CONFIG_EDIT_REV", "1");
    nextHud.SetAttributeString("Deadlock_Mod_Settings_v1", fresh);
    assert.notEqual(persistence.resolveHudPanel(env.rootPanel), env.hudPanel);
    assert.equal(persistence.getConfigChangeStamp(env.rootPanel), stamp, "numeric revisions alone cannot identify the HUD generation");
    replyToCurrentRequest(env, env.sandbox.WrapConfigForStorage({ BRIDGE_BUFF_START: 30 }));
    const result = await pending;
    assert.equal(result.applied, false);
    assert.equal(result.skipped, "newer-edits");
    assert.equal(nextHud.GetAttributeString("Deadlock_Mod_Settings_v1", ""), fresh);
    assert.equal(JSON.stringify(env.sandbox.MOD_CONFIG), beforeConfig);
    assert.equal(env.sandbox.State.lastConfig, null);
    assert.equal(env.clock.errors.length, 0);
});

test("storage_bridge: Clear prevents an older Load from restoring the deleted settings", async () => {
    const env = createTestEnvironment(), bridge = env.sandbox.QOL.core.storageBridge;
    const storage = new Map([["qollock_settings", env.sandbox.WrapConfigForStorage({ BRIDGE_BUFF_START: 30 })]]);
    connectEmbeddedPage(env, storage);
    const fresh = publishEdit(env, 15);
    const beforeConfig = JSON.stringify(env.sandbox.MOD_CONFIG);
    const loading = bridge.loadSettings();
    const clearing = bridge.clearSettings();
    env.clock.advance(0);
    const result = await loading;
    assert.equal(result.applied, false);
    assert.equal(result.skipped, "newer-edits");
    assert.equal((await clearing).ok, true);
    assert.equal(storage.has("qollock_settings"), false);
    assert.equal(env.rootPanel.GetAttributeString("Deadlock_Mod_Settings_v1", ""), fresh);
    assert.equal(JSON.stringify(env.sandbox.MOD_CONFIG), beforeConfig);
    assert.equal(env.sandbox.State.lastConfig, null);
    assert.deepEqual(env.clock.errors, []);
});

test("storage_bridge: a later Save invalidates an older Load even when all native writes are rejected", async () => {
    const env = createTestEnvironment(), bridge = env.sandbox.QOL.core.storageBridge;
    env.fireTitleEvent(bridge.getPanel(), "QOL_BRIDGE_READY:frag1");
    const fresh = publishEdit(env, 15);
    env.sandbox.MOD_CONFIG.BRIDGE_BUFF_START = 15;
    const pending = bridge.loadSettings();
    const writes = [env.rootPanel.SetAttributeString, env.hudPanel.SetAttributeString];
    env.rootPanel.SetAttributeString = env.hudPanel.SetAttributeString = () => false;
    const saving = bridge.saveSettings({ BRIDGE_BUFF_START: 15 });
    [env.rootPanel.SetAttributeString, env.hudPanel.SetAttributeString] = writes;
    replyToCurrentRequest(env, env.sandbox.WrapConfigForStorage({ BRIDGE_BUFF_START: 30 }));
    const result = await pending;
    assert.equal(result.applied, false);
    assert.equal(result.skipped, "newer-edits");
    replyToCurrentRequest(env, true);
    assert.equal((await saving).ok, true, "CEF save acknowledgment still settles the later operation");
    assert.equal(env.sandbox.MOD_CONFIG.BRIDGE_BUFF_START, 15);
    assert.equal(env.rootPanel.GetAttributeString("Deadlock_Mod_Settings_v1", ""), fresh);
    assert.equal(env.sandbox.State.lastConfig, null);
    assert.equal(env.clock.errors.length, 0);
});

for (const rejectCancellation of [false, true]) {
    test(`storage_bridge: chunk progress retires a zero-handle timeout with cancellation rejected=${rejectCancellation}`, async () => {
        const env = createTestEnvironment(), bridge = env.sandbox.QOL.core.storageBridge;
        env.fireTitleEvent(bridge.getPanel(), "QOL_BRIDGE_READY:frag1");
        const schedule = env.sandbox.$.Schedule, cancel = env.sandbox.$.CancelScheduled;
        let zeroHandle, zeroCancels = 0;
        env.sandbox.$.Schedule = (delay, callback) => {
            const handle = schedule(delay, callback);
            if (zeroHandle === undefined) { zeroHandle = handle; return 0; }
            return handle;
        };
        env.sandbox.$.CancelScheduled = handle => {
            if (handle === 0) zeroCancels++;
            if (rejectCancellation) throw Error("modeled native cancellation failure");
            cancel(handle === 0 ? zeroHandle : handle);
        };
        let settled = false;
        const pending = bridge.load("slow-chunks");
        pending.then(() => { settled = true; }, () => { settled = true; });
        const id = requestId(env.getLastSetUrl());
        env.clock.advance(4000);
        env.fireTitleEvent(bridge.getPanel(), "QOL_RES:" + JSON.stringify({
            id, ok: true, _seq: 1, data: "a", chunked: true, part: 0, total: 2
        }));
        env.clock.advance(1000); await Promise.resolve();
        assert.equal(settled, false, "the pre-progress deadline must be inert even if native cancellation fails");
        assert.ok(zeroCancels > 0, "zero is a valid native cancellation handle");
        env.fireTitleEvent(bridge.getPanel(), "QOL_RES:" + JSON.stringify({
            id, ok: true, _seq: 2, data: "b", chunked: true, part: 1, total: 2
        }));
        assert.equal(await pending, "ab");
        env.clock.advance(5000);
        assert.equal(env.clock.errors.length, 0);
    });
}

test("storage_bridge: Default view updates only after acknowledged main saves", async () => {
    const env = createTestEnvironment(), bridge = env.sandbox.QOL.core.storageBridge;
    const storage = new Map(), browser = connectEmbeddedPage(env, storage), updates = [];
    env.sandbox.QOL.ui = { presets: { onDefaultSaved: raw => updates.push(raw) } };
    const saving = bridge.saveSettings({ BRIDGE_BUFF_START: 15 });
    assert.equal(updates.length, 0);
    env.clock.advance(0); await saving;
    assert.equal(updates.length, 1);
    assert.equal(JSON.parse(updates[0]).data.BRIDGE_BUFF_START, 15);
    browser.localStorage.setItem = () => { throw Error("QuotaExceededError"); };
    const failed = bridge.saveSettings({ BRIDGE_BUFF_START: 20 });
    env.clock.advance(0); await assert.rejects(failed, /QuotaExceededError/);
    assert.equal(updates.length, 1);
    const clearing = bridge.clearSettings();
    env.clock.advance(0); await clearing;
    assert.equal(updates.length, 2);
    assert.equal(updates[1], null);
});


test("storage_bridge: footer Save awaits personal capture and startup selection does not create an original", async () => {
    const env = createTestEnvironment(), bridge = env.sandbox.QOL.core.storageBridge;
    connectEmbeddedPage(env, new Map());
    const calls = [];
    let finishCapture;
    env.sandbox.QOL.ui = { presets: { onDefaultSaved: (raw, mainSave) => {
        calls.push(mainSave);
        if (mainSave) return new Promise(resolve => { finishCapture = resolve; });
    } } };
    const saving = bridge.saveSettings({ BRIDGE_BUFF_START: 15 });
    let completed = false;
    const completion = (async () => { await saving; completed = true; })();
    env.clock.advance(0);
    await flush();
    assert.equal(completed, false);
    assert.equal(typeof finishCapture, "function");
    finishCapture();
    await completion;
    assert.equal(completed, true);
    const startup = bridge.saveStartupSettings({ BRIDGE_BUFF_START: 20 });
    env.clock.advance(0); await startup;
    assert.deepEqual(calls, [true, false]);
});


test("storage_bridge: footer save retains its personal target if selection changes before acknowledgment", async () => {
    const env = createTestEnvironment(), bridge = env.sandbox.QOL.core.storageBridge;
    connectEmbeddedPage(env, new Map());
    let selected = "First", received;
    env.sandbox.QOL.ui = { presets: {
        getSaveTarget: () => ({ name: selected, revision: 7, explicit: true }),
        onDefaultSaved: (_raw, _mainSave, targetName) => { received = targetName; }
    } };
    const saving = bridge.saveSettings({ BRIDGE_BUFF_START: 15 });
    selected = "Second";
    env.clock.advance(0); await saving;
    assert.deepEqual(received, { name: "First", revision: 7, explicit: true });
});

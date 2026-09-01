// scripts/probe_minimap_timers.js
// =============================================================================
// Evidence harness for the minimap objective timers manifest.
// =============================================================================
// Loads panorama/scripts/manifests/ql_minimap_timers/manifest.js against the
// simulator's Panel model with stubbed QOL dependencies, then drives one tick
// per toggle combination and dumps the resulting panel state.
//
// Not a test — a probe. Run it, read the table, compare against what the
// settings toggles claim they do.
//
//   node scripts/probe_minimap_timers.js
// =============================================================================

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const { Clock } = require("../scripts/simulator/clock.js");
const { Document } = require("../scripts/simulator/panel.js");

const REPO_ROOT = path.resolve(__dirname, "..");
const MANIFEST = path.join(REPO_ROOT, "panorama", "scripts", "manifests",
    "ql_minimap_timers", "manifest.js");

// ── Panel tree: the slice of hud.xml the feature actually touches ────────────
function buildTree() {
    const clock = new Clock(1000);
    const doc = new Document(clock);
    const root = doc.root;                                  // stands in for #Hud
    const persp = doc.create("Panel", { id: "minimap_persp" });
    root.addChild(persp);
    const container = doc.create("Panel", { id: "minimap_container" });
    persp.addChild(container);
    return { doc, root, container };
}

// ── QOL dependency stubs ────────────────────────────────────────────────────
function makeDeps(root) {
    const cache = {};
    const State = {
        minimapObjectiveBuffClassCache: { panel: null, values: {} },
        minimapObjectiveBuffBridgeLeftClassCache: { panel: null, values: {} },
        minimapObjectiveBuffBridgeRightClassCache: { panel: null, values: {} },
        minimapObjectiveRejuvClassCache: { panel: null, values: {} },
        minimapObjectiveScaleSig: "",
        rejuvState: { counter: 137, spawnWaiting: false },
    };

    return {
        state: State,
        utils: {
            // Faithful copy of ql_utils.js IsCfgEnabled.
            IsCfgEnabled: (cfg, key) => !!cfg && Number(cfg[key]) === 1,
            IsPanelValid: (p) => !!p && (!p.IsValid || p.IsValid()),
        },
        getCachedPanel: (k) => cache[k] || null,
        setCachedPanel: (k, v) => { cache[k] = v; },
        resolveCachedPanel: (r, key, id) => {
            if (cache[key]) return cache[key];
            const p = r && r.FindChildTraverse ? r.FindChildTraverse(id) : null;
            cache[key] = p;
            return p;
        },
        // Faithful copy of ql_core.js EnsureMinimapOverlayAnchor.
        ensureMinimapOverlayAnchor: (r) => {
            if (!r || !r.FindChildTraverse) return null;
            let anchor = cache.minimapObjectiveTimersAnchor;
            if (!anchor) {
                anchor = r.FindChildTraverse("minimap_container")
                    || r.FindChildTraverse("minimap_persp");
                cache.minimapObjectiveTimersAnchor = anchor;
            }
            return anchor || null;
        },
        // Faithful copy of ql_core.js SetPanelClassCached + EnsurePanelClassCache.
        setPanelClassCached: (panel, cacheObj, className, enabled) => {
            if (!panel || !cacheObj || !className) return false;
            if (cacheObj.panel !== panel) { cacheObj.panel = panel; cacheObj.values = {}; }
            const value = !!enabled;
            if (cacheObj.values[className] === value) return false;
            panel.SetHasClass(className, value);
            cacheObj.values[className] = value;
            return true;
        },
        getGameSecondsForUrn: () => 421,      // 7:01 into the match
        hasClassInHierarchy: () => false,
        isConnectedToHideout: () => false,
        isHudClassActive: () => false,
        isStreetBrawlModeActive: () => false,
        _cache: cache,
        _state: State,
    };
}

// ── Load the manifest, capture its tick callback ─────────────────────────────
function loadManifest(root, deps) {
    let captured = null;
    let tick = null;
    const messages = [];

    const QOL = {
        import: (names) => {
            const out = {};
            for (const n of names) out[n] = deps[n];
            return out;
        },
        core: {
            FeatureRegistry: { register: (m) => { captured = m; return true; } },
            Scheduler: {
                createPollLoop: (fn) => { tick = fn; return { stop() { tick = null; } }; },
                cancelAllForFeature: () => {},
            },
        },
    };

    const sandbox = {
        QOL,
        $: {
            Msg: (m) => messages.push(String(m)),
            GetContextPanel: () => root,
            CreatePanel: (type, parent, id, props) => {
                const p = root.doc ? root.doc.create(type, { id }) : null;
                const panel = p || new (require("../scripts/simulator/panel.js").Panel)(
                    type, { id, doc: parent.doc });
                parent.addChild(panel);
                if (props) for (const k in props) panel[k] = props[k];
                return panel;
            },
            Schedule: () => 0,
            CancelScheduled: () => {},
        },
        Math, Number, String, Object, Array, JSON, isFinite,
    };
    sandbox.globalThis = sandbox;

    const code = fs.readFileSync(MANIFEST, "utf8");
    vm.runInNewContext(code, sandbox, { filename: MANIFEST });

    if (!captured) throw new Error("manifest did not register");
    const instance = captured.create({ config: { view: () => currentCfg } });
    instance.onEnable();
    if (!tick) throw new Error("manifest did not create a poll loop");
    return { manifest: captured, instance, tick: () => tick(), messages };
}

// ── Config under test ───────────────────────────────────────────────────────
let currentCfg = {};

const KEYS = [
    "ENABLE_MINIMAP_BUFF_TIMER",
    "ENABLE_MINIMAP_BUFF_TIMER_ON_BRIDGE",
    "ENABLE_MINIMAP_REJUV_TIMER",
    "ENABLE_MINIMAP_ALWAYS_ON_MID_BOSS",
];

const WATCH = [
    ["overlay", "QOLMinimapTimersRoot", null],
    ["buffPlate", "QOLMinimapBuffTimer", "QOLMinimapBuffTime"],
    ["bridgeL", "QOLMinimapBuffBridgeLeftTimer", "QOLMinimapBuffBridgeLeftTime"],
    ["bridgeR", "QOLMinimapBuffBridgeRightTimer", "QOLMinimapBuffBridgeRightTime"],
    ["rejuvPlate", "QOLMinimapRejuvTimer", "QOLMinimapRejuvTime"],
];

function snapshot(root) {
    const out = {};
    for (const [label, id, textId] of WATCH) {
        const p = root.FindChildTraverse(id);
        if (!p) { out[label] = "ABSENT"; continue; }
        const hidden = p.BHasClass("qol-hidden");
        const t = textId ? p.FindChildTraverse(textId) : null;
        const colour = p.BHasClass("red") ? " red" : (p.BHasClass("yellow") ? " yellow" : "");
        out[label] = (hidden ? "hidden" : "SHOWN") + (t ? ` "${t.text}"` : "") + colour;
    }
    return out;
}

// ── Run ─────────────────────────────────────────────────────────────────────

// Pass A — cold start per combination. A fresh tree each time, so every value
// printed was produced by THAT config and nothing carried over.
console.log("game clock 421s -> bridge remaining = " + (300 - (421 % 300)) + "s (2:59)");
console.log("State.rejuvState.counter = 137 -> rejuv text should be 2:17\n");
console.log("=== PASS A: cold start, fresh panels per config ===\n");

const pad = (s, n) => String(s).padEnd(n);
const header = pad("toggles", 58) + pad("overlay", 8) + pad("buffPlate", 18) +
               pad("bridgeL", 18) + pad("bridgeR", 18) + "rejuvPlate";
console.log(header);
console.log("-".repeat(140));

let allMessages = [];
for (let mask = 0; mask < 16; mask++) {
    const cfg = {};
    for (let b = 0; b < KEYS.length; b++) cfg[KEYS[b]] = (mask >> b) & 1;
    currentCfg = cfg;

    const { root } = buildTree();
    const deps = makeDeps(root);
    const h = loadManifest(root, deps);
    h.tick();          // creates panels
    h.tick();          // steady state
    allMessages = allMessages.concat(h.messages);

    const s = snapshot(root);
    const toggles = `buff=${cfg.ENABLE_MINIMAP_BUFF_TIMER} onBridge=${cfg.ENABLE_MINIMAP_BUFF_TIMER_ON_BRIDGE}` +
                    ` rejuv=${cfg.ENABLE_MINIMAP_REJUV_TIMER} onMidBoss=${cfg.ENABLE_MINIMAP_ALWAYS_ON_MID_BOSS}`;
    console.log(pad(toggles, 58) + pad(s.overlay, 8) + pad(s.buffPlate, 18) +
                pad(s.bridgeL, 18) + pad(s.bridgeR, 18) + s.rejuvPlate);
}

// Pass B — live toggling on one tree, which is what a player actually does.
// Stale state from the previous config is the whole point here.
console.log("\n=== PASS B: live toggling on one tree (player flow) ===\n");
const seq = [
    ["baseline: buff+onBridge, rejuv+onMidBoss", { ENABLE_MINIMAP_BUFF_TIMER: 1, ENABLE_MINIMAP_BUFF_TIMER_ON_BRIDGE: 1, ENABLE_MINIMAP_REJUV_TIMER: 1, ENABLE_MINIMAP_ALWAYS_ON_MID_BOSS: 1 }],
    ["uncheck On Bridge",                        { ENABLE_MINIMAP_BUFF_TIMER: 1, ENABLE_MINIMAP_BUFF_TIMER_ON_BRIDGE: 0, ENABLE_MINIMAP_REJUV_TIMER: 1, ENABLE_MINIMAP_ALWAYS_ON_MID_BOSS: 1 }],
    ["re-check On Bridge",                       { ENABLE_MINIMAP_BUFF_TIMER: 1, ENABLE_MINIMAP_BUFF_TIMER_ON_BRIDGE: 1, ENABLE_MINIMAP_REJUV_TIMER: 1, ENABLE_MINIMAP_ALWAYS_ON_MID_BOSS: 1 }],
    ["turn Bridge Buff Timer OFF",               { ENABLE_MINIMAP_BUFF_TIMER: 0, ENABLE_MINIMAP_BUFF_TIMER_ON_BRIDGE: 1, ENABLE_MINIMAP_REJUV_TIMER: 1, ENABLE_MINIMAP_ALWAYS_ON_MID_BOSS: 1 }],
    ["turn Mid Boss Timer OFF too (all off)",    { ENABLE_MINIMAP_BUFF_TIMER: 0, ENABLE_MINIMAP_BUFF_TIMER_ON_BRIDGE: 1, ENABLE_MINIMAP_REJUV_TIMER: 0, ENABLE_MINIMAP_ALWAYS_ON_MID_BOSS: 1 }],
];
{
    const { root } = buildTree();
    const deps = makeDeps(root);
    const h = loadManifest(root, deps);
    console.log(pad("step", 44) + pad("overlay", 8) + pad("buffPlate", 18) +
                pad("bridgeL", 18) + pad("bridgeR", 18) + "rejuvPlate");
    console.log("-".repeat(126));
    for (const [label, cfg] of seq) {
        currentCfg = cfg;
        h.tick();
        h.tick();
        const s = snapshot(root);
        console.log(pad(label, 44) + pad(s.overlay, 8) + pad(s.buffPlate, 18) +
                    pad(s.bridgeL, 18) + pad(s.bridgeR, 18) + s.rejuvPlate);
    }
    allMessages = allMessages.concat(h.messages);
}

if (allMessages.length) {
    console.log("\nmod messages:");
    for (const m of new Set(allMessages)) console.log("  " + m);
}

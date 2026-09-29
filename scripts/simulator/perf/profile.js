// scripts/simulator/perf/profile.js
// =============================================================================
// Runs the real mod against an instrumented, realistic in-match HUD and reports
// which feature asks the engine to do how much work per second.
// =============================================================================
// The harness answers one question: if a player's frame time gets worse when
// QOLLOCK is installed, WHICH part of QOLLOCK is asking for the work? It does
// that by counting engine-facing operations (see counters.js) and attributing
// each to the feature on the call stack at the time.
//
// ATTRIBUTION MECHANISM
//
// Two wrappers, installed after the scripts load but before the clock advances
// (which is when the mod's boot sequence and every poll loop first run):
//
//   * Old system — every entry in QOL_FEATURE_REGISTRY has its `update` replaced
//     by a wrapper that pushes "feat:<name>" onto the attribution stack. The
//     core dispatch loop calls these, so per-feature cost falls out directly.
//   * New system — QOL.core.Scheduler.createPollLoop is replaced by a version
//     that wraps the callback with "mf:<featureId>". Every manifest's poll loop
//     goes through it (raw $.Schedule is banned in feature code), so manifests
//     are covered too.
//
// Everything else — the core loop body, ql_app's config bridge, boot code, engine
// callbacks — lands in "<unattributed>". That bucket is not noise to be ignored:
// the core loop's own per-tick work (config read, gate resolution, root classes)
// is some of the most expensive code in the mod, and it shows up there.
//
// CONFIG
//
// Features only run when enabled, and the mod reads its config from a panel
// attribute. `enableAll` writes a config with every ENABLE_*/HUD_*_ENABLED key
// set to 1 so the profile covers the whole surface — that is the worst case, and
// it is also what a user running a maximal preset actually experiences. Pass
// `configOverrides` to profile a narrower setup.
// =============================================================================

"use strict";

const path = require("node:path");
const { install, counters, silently } = require("./instrument.js");
const { buildMatchHud, buildCapturedHud } = require("./hud_tree.js");

// Install before requiring the simulator so index.js sees patched classes.
install();

const { Clock } = require("../clock.js");
const { Document } = require("../panel.js");
const { Sandbox } = require("../sandbox.js");
const layout = require("../layout.js");
const { BuildsModel, TITLE_MODE } = require("../game/builds.js");

// Matches QOL_STORAGE_KEY / QOL_USER_EDIT_REV_ATTR in ql_shared_presets.js.
const STORAGE_KEY = "Deadlock_Mod_Settings_v1";
const USER_EDIT_REV_ATTR = "QOL_USER_EDIT_REV";

/**
 * Build a config string the mod will accept, with everything switched on.
 *
 * Rather than hand-writing a config (which would drift from the schema on every
 * settings change), ask the mod itself for its defaults via buildDefaultConfig,
 * then flip every boolean-looking key to 1. Keys are identified by name prefix
 * because that is the same convention ConfigStore uses to decide what to coerce
 * to a boolean.
 */
function makeMaximalConfig(sandbox, overrides = {}) {
    const defaults = sandbox.evalJson("(function(){ try { return QOL.buildDefaultConfig(); } catch(e) { return null; } })()");
    if (!defaults) return null;

    const cfg = { ...defaults };
    for (const key of Object.keys(cfg)) {
        if (/^(ENABLE_|DISABLE_|HUD_.*_ENABLED$|SUPPORT_)/.test(key)) {
            // DISABLE_* keys turn features OFF when set — leave them at their
            // default so "everything on" means what it says.
            if (key.indexOf("DISABLE_") === 0) continue;
            cfg[key] = 1;
        }
    }
    Object.assign(cfg, overrides);
    return cfg;
}

/**
 * Wrap every registered old-system feature's update() for attribution.
 * Returns the number wrapped, so a zero can be reported as a harness failure
 * rather than silently producing an empty profile.
 */
function wrapOldFeatures(sandbox) {
    return sandbox.eval(`
        (function () {
            if (typeof QOL_FEATURE_REGISTRY === "undefined" || !QOL_FEATURE_REGISTRY) return 0;
            var n = 0;
            for (var name in QOL_FEATURE_REGISTRY) {
                if (!Object.prototype.hasOwnProperty.call(QOL_FEATURE_REGISTRY, name)) continue;
                var entry = QOL_FEATURE_REGISTRY[name];
                if (!entry || typeof entry.update !== "function" || entry.__profWrapped) continue;
                (function (entry, name) {
                    var inner = entry.update;
                    entry.update = function () {
                        __profEnter("feat:" + name);
                        try { return inner.apply(this, arguments); }
                        finally { __profExit(); }
                    };
                    entry.__profWrapped = true;
                })(entry, name);
                n++;
            }
            return n;
        })()
    `);
}

/** Wrap Scheduler.createPollLoop so each manifest poll tick is attributed. */
function wrapPollLoops(sandbox) {
    return sandbox.eval(`
        (function () {
            if (!QOL || !QOL.core || !QOL.core.Scheduler) return false;
            var S = QOL.core.Scheduler;
            if (S.__profWrapped) return true;
            var orig = S.createPollLoop;
            S.createPollLoop = function (callback, rateSec, featureId) {
                var label = "mf:" + (featureId || "anonymous");
                var wrapped = function () {
                    __profEnter(label);
                    try { return callback.apply(this, arguments); }
                    finally { __profExit(); }
                };
                __profNoteLoop(label, rateSec);
                return orig.call(S, wrapped, rateSec, featureId);
            };
            S.__profWrapped = true;
            return true;
        })()
    `);
}

/**
 * Attribute work done directly by the mod's own scheduled loops.
 *
 * Without this, everything the core loop does in its own body — reading the
 * config out of a panel attribute, resolving gates, the always-on coreRoot
 * work, and the whole of the 20Hz compassLoop — lands in one
 * "<unattributed>" bucket that is far too large to act on. Those functions are
 * module-private inside an IIFE, so they cannot be wrapped by name from outside.
 *
 * What CAN be recovered is the identity of the scheduled callback: the mod
 * schedules named function declarations (`$.Schedule(delay, loop)`,
 * `compassLoop`, `buildRequestLoop`), and a function's `.name` survives. So
 * patch $.Schedule to label each callback with its own name. Anonymous
 * callbacks (the many `$.Schedule(0.01, function() {...})` one-shots) keep the
 * generic label, which is honest — we genuinely cannot tell them apart.
 *
 * Nesting is handled by the label stack: when the core loop calls a wrapped
 * feature, the feature's label is on top and gets charged; only work the loop
 * does itself stays charged to the loop.
 */
function wrapScheduledLoops(sandbox) {
    return sandbox.eval(`
        (function () {
            if (!$ || typeof $.Schedule !== "function" || $.__profSchedWrapped) return false;
            var orig = $.Schedule;
            $.Schedule = function (delaySec, cb) {
                if (typeof cb !== "function") return orig.apply($, arguments);
                var name = cb.name || "";
                if (!name || name === "wrapped" || name === "tick") return orig.call($, delaySec, cb);
                var label = "loop:" + name;
                var wrapped = function () {
                    __profEnter(label);
                    try { return cb.apply(this, arguments); }
                    finally { __profExit(); }
                };
                return orig.call($, delaySec, wrapped);
            };
            $.__profSchedWrapped = true;
            return true;
        })()
    `);
}

/**
 * Boot a profiled HUD.
 *
 * @param {object}  opts
 * @param {number}  [opts.players=12]
 * @param {boolean} [opts.enableAll=true]
 * @param {object}  [opts.configOverrides]
 * @param {number}  [opts.warmupMs=8000]  virtual ms to run before counting
 * @param {object}  [opts.capturedTree]   full per-panel output of
 *                                        scripts/import_tree_dump.js (not an
 *                                        aggregate summary); replaces the
 *                                        modelled composition
 */
function createProfiledHud({
    players = 12,
    damageNumbers = 24,
    enableAll = true,
    configOverrides = {},
    warmupMs = 8000,
    capturedTree = null,
    beforeLoad = null,
} = {}) {
    const clock = new Clock(1000);
    const doc = new Document(clock);
    const sandbox = new Sandbox({ clock, doc, name: "hud" });
    if (beforeLoad) beforeLoad(sandbox);

    // Attribution hooks the wrappers call from inside the VM.
    sandbox.global.__profEnter = (label) => counters.enter(label);
    sandbox.global.__profExit = () => counters.exit();
    const pollRates = new Map();
    sandbox.global.__profNoteLoop = (label, rate) => {
        pollRates.set(label, Number(rate) || 0.2);
    };

    const game = new BuildsModel({ sandbox, titleMode: TITLE_MODE.RESOLVED, hero: "hero_werewolf", inHideout: false });

    // Build the tree BEFORE the mod loads: in-engine the HUD exists before the
    // mod's scripts run, and several features cache panel refs at boot.
    let tree;
    silently(() => {
        // A live match: connected, not in the hideout.
        doc.root.SetHasClass("connectedToHideout", false);
        // A captured tree wins over the modelled one: it is the same HUD the engine
        // actually built, so nothing about it depends on our composition guesses.
        tree = capturedTree
            ? buildCapturedHud(doc, capturedTree)
            : buildMatchHud(doc, { players, damageNumbers });
    });

    const scripts = layout.hudScripts();
    if (scripts.missing.length > 0) {
        const list = scripts.missing.map((m) => `${m.src} (hud.xml:${m.line})`).join(", ");
        throw new Error(`[profiler] hud.xml references missing scripts: ${list}`);
    }
    silently(() => {
        for (const s of scripts.scripts) sandbox.load(s.absPath);
    });

    if (sandbox.loadErrors.length > 0) {
        const first = sandbox.loadErrors[0];
        const err = new Error(
            `[profiler] ${sandbox.loadErrors.length} script(s) failed to load. ` +
            `First: ${path.basename(first.file)} (${first.phase}): ${first.error.message}`
        );
        err.cause = first.error;
        throw err;
    }

    // Seed config. Written to BOTH root and Hud because ReadStorageConfigRawFromUi
    // reads both and picks by revision; writing one only would exercise a
    // fallback path rather than the normal one.
    //
    // The wire format is the storage envelope UnwrapConfigFromStorage expects
    // (ql_shared_presets.js:60): {"schema":"<semver>","data":{...}}. Plain JSON is
    // also accepted as the legacy shape, but writing the envelope keeps the
    // profile on the same code path a real install takes.
    let configApplied = false;
    let configBytes = 0;
    silently(() => {
        if (!enableAll && Object.keys(configOverrides).length === 0) return;
        const cfg = makeMaximalConfig(sandbox, configOverrides);
        if (!cfg) return;
        const schema = sandbox.eval(
            `(function(){ try { return String(QOL_SCHEMA_VERSION || QOL_CONFIG_SCHEMA_VERSION || ""); } catch(e) { return ""; } })()`
        );
        const raw = JSON.stringify({ schema: schema || "3.1.9", data: cfg });
        configBytes = raw.length;
        doc.root.SetAttributeString(STORAGE_KEY, raw);
        doc.root.SetAttributeString(USER_EDIT_REV_ATTR, "1");
        const hud = doc.absRoot.FindChildTraverse("Hud");
        if (hud) {
            hud.SetAttributeString(STORAGE_KEY, raw);
            hud.SetAttributeString(USER_EDIT_REV_ATTR, "1");
        }
        configApplied = true;
    });

    const wrappedFeatures = wrapOldFeatures(sandbox);
    const wrappedScheduler = wrapPollLoops(sandbox);
    const wrappedLoops = wrapScheduledLoops(sandbox);

    // Warm up with counting OFF: boot, first-run panel discovery and one-shot
    // work are not what we are profiling, and they would swamp the steady state.
    silently(() => clock.advance(warmupMs));

    return {
        clock,
        doc,
        sandbox,
        game,
        tree,
        counters,
        pollRates,
        meta: {
            players, damageNumbers, configApplied, configBytes,
            healthbarType: Number(configOverrides.HEALTHBAR_TYPE) || 0,
            wrappedFeatures, wrappedScheduler, wrappedLoops, warmupMs,
            // Which tree the numbers describe. A modelled run and a captured run are
            // not comparable, so this has to travel with the results.
            treeSource: capturedTree ? "captured" : "modelled",
            capturedFrom: capturedTree ? (capturedTree.capturedFrom || "unknown") : null,
        },

        /** Count for `ms` of virtual time and return a snapshot. */
        measure(ms) {
            counters.reset();
            counters.enabled = true;
            clock.advance(ms);
            counters.enabled = false;
            return counters.snapshot(ms / 1000);
        },

        diagnose() {
            const lines = [];
            lines.push(`tree: ${tree.panels} panels`);
            if (tree.notes.length > 0) lines.push(`tree notes:\n  ${tree.notes.join("\n  ")}`);
            lines.push(`features wrapped: ${wrappedFeatures}, scheduler wrapped: ${wrappedScheduler}`);
            lines.push(`clock: ${clock.now()}ms, ${clock.pendingCount()} pending`);
            if (clock.errors.length > 0) {
                lines.push(`scheduled-callback errors (${clock.errors.length}):`);
                lines.push(clock.errors.slice(0, 5).map((e) => `  @${e.at}ms ${e.error.message}`).join("\n"));
            }
            lines.push(`mod messages (last 20):\n  ${sandbox.messages.slice(-20).join("\n  ")}`);
            return lines.join("\n");
        },
    };
}

module.exports = { createProfiledHud, makeMaximalConfig, STORAGE_KEY };

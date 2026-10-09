// scripts/simulator/sandbox.js
// =============================================================================
// Builds a vm context that looks like a Panorama JS isolate.
// =============================================================================
// Modelled on the sandbox in scripts/validate_compact_schema.js (which is much
// closer to reality than the smoke test's): explicit builtin allowlist, a stable
// context panel, Map-backed $.persistentStorage. Extended here with a real
// panel tree, a virtual clock, and a working event dispatch table.
//
// HUD and Settings are genuinely separate isolates in the engine and get
// separate contexts here. They share nothing but panel attributes on the Hud
// root — which is exactly the constraint the mod's bridge is built around, so
// making it a hard boundary in the simulator keeps that honest.
// =============================================================================

"use strict";

const vm = require("node:vm");
const fs = require("node:fs");
const { Clock } = require("./clock.js");
const { Document } = require("./panel.js");

/**
 * Chainable no-op proxy for whole game-API surfaces we don't model
 * (Entities, Abilities, ...). Any property access returns another proxy, and
 * calling it returns another proxy, so deep chains never throw.
 * Lifted from validate_compact_schema.js:70-88.
 */
function makeNoopProxy() {
    const fn = function () {};
    return new Proxy(fn, {
        get(target, prop) {
            if (prop === Symbol.toPrimitive) return () => "";
            if (prop === "toString") return () => "";
            if (prop === "valueOf") return () => 0;
            if (prop === "length") return 0;
            if (prop === "name") return "";
            if (prop === "then") return undefined; // don't look thenable
            return makeNoopProxy();
        },
        apply() {
            return makeNoopProxy();
        },
        construct() {
            return makeNoopProxy();
        },
    });
}

class Sandbox {
    /**
     * @param {object}  opts
     * @param {Clock}   opts.clock     shared clock (pass the same one to both isolates)
     * @param {Document} opts.doc      shared panel tree (the Hud root is shared in-engine)
     * @param {string}  opts.name      "hud" | "settings", used in log prefixes
     * @param {object}  opts.localization  token -> string map for $.Localize
     */
    constructor({ clock, doc, name = "hud", localization = {} } = {}) {
        this.name = name;
        this.clock = clock || new Clock();
        this.doc = doc || new Document(this.clock);
        this.localization = localization;

        // Captured $.Msg output. The old harness pushed into an array nobody
        // ever read; tests here assert against this and dump it on failure.
        this.messages = [];
        this.eventHandlers = new Map();   // event name -> [handler]
        this.unhandledHandlers = new Map();
        this.loadErrors = [];
        this.loaded = [];

        this.global = this._buildGlobal();
        this.context = vm.createContext(this.global);
        vm.runInContext(this._bootstrapSource(), this.context, { filename: "<simulator-bootstrap>" });
    }

    // ── $ implementation ──────────────────────────────────────────────────
    _buildDollar() {
        const clock = this.clock;
        const doc = this.doc;
        const self = this;

        const storage = new Map();

        return {
            Msg: (...args) => {
                self.messages.push(args.map((a) => String(a)).join(" "));
            },

            Schedule: (delaySec, cb) => clock.schedule(delaySec, cb),
            CancelScheduled: (handle) => clock.cancel(handle),
            FrameTime: () => clock.nowSeconds(),

            GetContextPanel: () => doc.root,
            FindChildInContext: (id) => doc.root.FindChildTraverse(id),
            GetHoveredPanel: () => doc.focused || null,

            CreatePanel: (type, parent, id, props = {}) => {
                const panel = doc.create(type, { id: id || "", ...props });
                if (parent && typeof parent.addChild === "function") parent.addChild(panel);
                return panel;
            },

            DispatchEvent: (name, ...args) => self.dispatch(name, args),
            DispatchEventAsync: (delaySec, name, ...args) =>
                clock.schedule(delaySec, () => self.dispatch(name, args)),

            RegisterEventHandler: (name, panel, handler) => {
                const list = self.eventHandlers.get(name) || [];
                // Model panel-scoped delivery, not a broadcast to every
                // DragStart/HTMLTitle handler registered on unrelated panels.
                const scoped = (...args) => {
                    if (!panel?.IsValid() || (args[0] !== panel && args[0] !== panel.id)) return;
                    return handler(...args);
                };
                scoped.targetPanel = panel;
                list.push(scoped);
                self.eventHandlers.set(name, list);
                return list.length;
            },
            RegisterForUnhandledEvent: (name, handler) => {
                const list = self.unhandledHandlers.get(name) || [];
                list.push(handler);
                self.unhandledHandlers.set(name, list);
                return list.length;
            },
            UnregisterForUnhandledEvent: () => {},
            UnregisterEventHandler: () => {},

            Localize: (token, _panel) => {
                const key = String(token).replace(/^#/, "");
                if (Object.prototype.hasOwnProperty.call(self.localization, key)) {
                    return self.localization[key];
                }
                // The engine returns the token unchanged when unknown.
                return String(token);
            },
            LocalizePlural: (token) => String(token),

            // 12 call sites in the mod. Absent from the smoke test entirely.
            persistentStorage: {
                getItem: (k) => (storage.has(k) ? storage.get(k) : null),
                setItem: (k, v) => storage.set(String(k), String(v)),
                removeItem: (k) => storage.delete(k),
                clear: () => storage.clear(),
                get length() {
                    return storage.size;
                },
                key: (i) => Array.from(storage.keys())[i] ?? null,
            },

            Language: () => "english",
            GetFullscreen: () => false,
            AsyncWebRequest: () => {},
            PlaySoundEvent: () => {},
            DispatchEventToPanel: (name, panel, ...args) => self.dispatch(name, [panel, ...args]),

            // Mod-defined entry points called across contexts.
            ForceCloseModSettings: () => {},
            BuildUI: () => {},
            ShowRankCardLoaded: () => {},
            ToggleSettingsWindow: () => {},
        };
    }

    /**
     * Route an event. Panel-targeted engine events (TextEntrySubmit and friends)
     * carry the panel as the first arg; game-side listeners registered via
     * onEvent() get everything.
     */
    dispatch(name, args = []) {
        let handled = false;
        const direct = this.eventHandlers.get(name);
        if (direct) {
            for (const h of direct) {
                if (h.targetPanel && (!h.targetPanel.IsValid() || (args[0] !== h.targetPanel && args[0] !== h.targetPanel.id))) continue;
                try {
                    h(...args);
                    handled = true;
                } catch (err) {
                    this.doc.eventErrors.push({ panel: "", name, error: err });
                }
            }
        }
        if (!handled) {
            const unhandled = this.unhandledHandlers.get(name);
            if (unhandled) {
                for (const h of unhandled) {
                    try {
                        h(...args);
                        handled = true;
                    } catch (err) {
                        this.doc.eventErrors.push({ panel: "", name, error: err });
                    }
                }
            }
        }
        return handled;
    }

    /** Register a simulator-side listener (used by the game model). */
    onEvent(name, handler) {
        const list = this.eventHandlers.get(name) || [];
        list.push(handler);
        this.eventHandlers.set(name, list);
    }

    // ── Global object ─────────────────────────────────────────────────────
    //
    // CRITICAL: do NOT inject host intrinsics (Array, Object, JSON, Date, ...).
    // vm.createContext() gives the context its own realm with its own intrinsics.
    // If you put the *host's* `Array` on the sandbox, then inside the context an
    // array literal's prototype is the context's Array.prototype while the global
    // `Array` binding is the host's — so `[1,2] instanceof Array` is FALSE.
    //
    // That silently broke ConfigStore.registerSchema (core/ql_config_store.js),
    // which gates on `schema.settings instanceof Array` and returns false with no
    // warning. Every manifest schema failed to register, so `config.get("enabled")`
    // returned undefined and every manifest's poll loop bailed on its first line.
    // The symptom looked like a mod bug; it was purely a harness artifact.
    //
    // Anything time-related is patched from *inside* the context instead (see
    // _bootstrapSource), which keeps intrinsic identity intact.
    _buildGlobal() {
        const g = {
            console: {
                log: (...a) => this.messages.push(a.map(String).join(" ")),
                warn: (...a) => this.messages.push(a.map(String).join(" ")),
                error: (...a) => this.messages.push(a.map(String).join(" ")),
            },
            // Host bridge for the in-context time patch.
            __hostNowMs: () => this.clock.now(),
        };

        g.$ = this._buildDollar();

        // GameInterfaceAPI and $.persistentStorage-in-settings are confirmed
        // absent in the real contexts; leaving them undefined is faithful and
        // exercises the mod's guards.
        g.GameUI = { CustomUIConfig: () => ({}) };
        g.Game = {
            GetMapInfo: () => ({}),
            Time: () => this.clock.nowSeconds(),
            IsInToolsMode: () => false,
        };
        g.GameEvents = { Subscribe: () => 0, SendCustomGameEventToServer: () => {} };
        for (const api of [
            "GameStateAPI", "Players", "Entities", "Abilities", "Buffs",
            "GameModeAPI", "MatchDetailsAPI", "PartyListAPI", "SteamOverlayAPI",
            "FriendsUI", "HeroList", "ItemList", "AbilityList",
        ]) {
            g[api] = makeNoopProxy();
        }

        return g;
    }

    /**
     * Runs inside the context right after creation. Patching here (rather than
     * injecting replacements) preserves intrinsic identity, so `instanceof`
     * still works and `Date` is still the context's own Date.
     *
     * Math.random is made deterministic because core/ql_scheduler.js:120 jitters
     * the first poll tick by `Math.random() * rate * 0.5` — without a fixed seed
     * every test run would start its state machine at a different virtual ms.
     */
    _bootstrapSource() {
        return `
            (function () {
                "use strict";
                var host = __hostNowMs;
                var _RealDate = Date;
                Date.now = function () { return host(); };
                var _origDate = Date;
                // new Date() with no args should read virtual time.
                globalThis.Date = new Proxy(_origDate, {
                    construct: function (T, args) {
                        return args.length === 0 ? new T(host()) : new T(...args);
                    },
                    get: function (T, p, r) {
                        if (p === "now") return function () { return host(); };
                        return Reflect.get(T, p, r);
                    }
                });
                globalThis.performance = { now: function () { return host(); } };

                // Panorama has no timers — surface accidental use loudly.
                globalThis.setTimeout = function () {
                    throw new Error("setTimeout is unavailable in Panorama — use $.Schedule");
                };
                globalThis.setInterval = function () {
                    throw new Error("setInterval is unavailable in Panorama — use $.Schedule");
                };
                globalThis.clearTimeout = function () {};
                globalThis.clearInterval = function () {};

                // Deterministic PRNG (mulberry32) so scheduler jitter is stable.
                var _seed = 0x9e3779b9;
                Math.random = function () {
                    _seed |= 0; _seed = (_seed + 0x6D2B79F5) | 0;
                    var t = Math.imul(_seed ^ (_seed >>> 15), 1 | _seed);
                    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
                    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
                };

                globalThis.window = globalThis;
            })();
        `;
    }

    /** Run one script file in this context, recording any throw. */
    load(absPath, { trailer = "" } = {}) {
        let src;
        try {
            src = fs.readFileSync(absPath, "utf8");
        } catch (err) {
            this.loadErrors.push({ file: absPath, error: err, phase: "read" });
            return false;
        }

        return this.loadSource(src, absPath, { trailer });
    }

    /** Run source read from a Git object without changing the checkout. */
    loadSource(src, absPath, { trailer = "" } = {}) {
        if (trailer) src = injectIntoIife(src, trailer);

        try {
            vm.runInContext(src, this.context, { filename: absPath, timeout: 20000 });
            this.loaded.push(absPath);
            return true;
        } catch (err) {
            this.loadErrors.push({ file: absPath, error: err, phase: "run" });
            return false;
        }
    }

    /** Evaluate an expression inside the context. */
    eval(expr) {
        return vm.runInContext(expr, this.context, { timeout: 20000 });
    }

    /** Structured-clone an in-context value out across the realm boundary. */
    evalJson(expr) {
        const raw = vm.runInContext(`JSON.stringify(${expr})`, this.context, { timeout: 20000 });
        return raw === undefined ? undefined : JSON.parse(raw);
    }

    /** Messages matching a substring — for asserting on mod log output. */
    grepMessages(needle) {
        return this.messages.filter((m) => m.includes(needle));
    }
}

/**
 * Splice `trailer` in just before a file's closing `})();` so it runs inside the
 * IIFE and can hoist module-private symbols onto globalThis. Same trick as
 * validate_compact_schema.js:176-180 — it's how we reach state that the mod
 * deliberately keeps private, without editing the mod.
 */
function injectIntoIife(source, trailer) {
    const close = source.lastIndexOf("})();");
    if (close < 0) return source + "\n" + trailer + "\n";
    return source.slice(0, close) + "\n" + trailer + "\n" + source.slice(close);
}

module.exports = { Sandbox, makeNoopProxy, injectIntoIife };

// scripts/simulator/index.js
// =============================================================================
// Public entry point: build a booted HUD context with the game model attached.
// =============================================================================

"use strict";

const { Clock, makeVirtualDate } = require("./clock.js");
const { Panel, Document } = require("./panel.js");
const { Sandbox, makeNoopProxy, injectIntoIife } = require("./sandbox.js");
const layout = require("./layout.js");
const { BuildsModel, DEFAULT_LATENCY, TITLE_MODE } = require("./game/builds.js");

/**
 * Create a HUD isolate with the real mod loaded and the game model wired.
 *
 * Order matters: the game model must install its Citadel* globals BEFORE the mod
 * scripts run, because several files probe `typeof CitadelX === "function"` at
 * load time and cache the answer.
 *
 * @param {object}  opts
 * @param {number}  [opts.startMs]    initial virtual time
 * @param {object}  [opts.latency]    latency profile override
 * @param {string}  [opts.titleMode]  TITLE_MODE.TOKEN | TITLE_MODE.RESOLVED
 * @param {string}  [opts.hero]
 * @param {boolean} [opts.inHideout]
 * @param {boolean} [opts.boot]       run the mod's boot sequence (default true)
 */
function createHud({
    startMs = 1000,
    latency = {},
    titleMode = TITLE_MODE.RESOLVED,
    hero = "hero_werewolf",
    inHideout = true,
    shopOpensTab = "favorites",
    boot = true,
} = {}) {
    const clock = new Clock(startMs);
    const doc = new Document(clock);
    const sandbox = new Sandbox({ clock, doc, name: "hud" });

    const game = new BuildsModel({ sandbox, latency, titleMode, hero, inHideout, shopOpensTab });

    // Hideout connection is what gates the loader's wait_hideout stage.
    setHideout(doc, inHideout);

    const scripts = layout.hudScripts();
    if (scripts.missing.length > 0) {
        const list = scripts.missing.map((m) => `${m.src} (hud.xml:${m.line})`).join(", ");
        throw new Error(`[simulator] hud.xml references missing scripts: ${list}`);
    }

    if (boot) {
        for (const s of scripts.scripts) sandbox.load(s.absPath);
    }

    return {
        clock,
        doc,
        sandbox,
        game,
        scripts,
        root: doc.root,
        /** Throw if the mod failed to load, with the real error attached. */
        assertLoaded() {
            if (sandbox.loadErrors.length === 0) return;
            const first = sandbox.loadErrors[0];
            const err = new Error(
                `[simulator] ${sandbox.loadErrors.length} script(s) failed to load. ` +
                `First: ${first.file} (${first.phase}): ${first.error.message}`
            );
            err.cause = first.error;
            throw err;
        },
        /** Combined diagnostics dump — call this in a failing assertion message. */
        diagnose() {
            const lines = [];
            lines.push(`--- virtual time: ${clock.now()}ms (${clock.pendingCount()} pending) ---`);
            lines.push(`--- builds (${game.builds.length}) ---`);
            lines.push(game.describe());
            lines.push(`--- game counters ---`);
            lines.push(JSON.stringify(game.counters));
            lines.push(`--- game trace (last 25) ---`);
            lines.push(game.log.slice(-25).join("\n"));
            lines.push(`--- mod messages (last 30) ---`);
            lines.push(sandbox.messages.slice(-30).join("\n"));
            if (clock.errors.length > 0) {
                lines.push(`--- scheduled-callback errors (${clock.errors.length}) ---`);
                lines.push(clock.errors.slice(0, 5).map((e) => `@${e.at}ms ${e.error.stack || e.error.message}`).join("\n"));
            }
            const problems = doc.assertClean();
            if (problems.length > 0) {
                lines.push(`--- tree anomalies ---`);
                lines.push(problems.join("\n"));
            }
            return lines.join("\n");
        },
    };
}

/**
 * Toggle hideout connection the way the engine signals it.
 *
 * IsConnectedToHideout (ql_core.js:3208) checks for class "connectedToHideout"
 * or "InHideout", first on the #Hud panel and then on the passed root. Note it
 * caches the Hud panel in "cachedHudPanel", so flipping this after the loader
 * has already looked will hit the cache — set it before booting.
 */
function setHideout(doc, connected) {
    doc.root.SetHasClass("connectedToHideout", !!connected);
}

module.exports = {
    createHud,
    setHideout,
    Clock,
    makeVirtualDate,
    Panel,
    Document,
    Sandbox,
    makeNoopProxy,
    injectIntoIife,
    layout,
    BuildsModel,
    DEFAULT_LATENCY,
    TITLE_MODE,
};

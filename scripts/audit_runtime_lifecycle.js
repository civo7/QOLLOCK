"use strict";

const path = require("node:path");
const vm = require("node:vm");
const { execFileSync } = require("node:child_process");
const { install, counters } = require("./simulator/perf/instrument");
const { installScheduleProbe } = require("./simulator/perf/schedules");
const { createProfiledHud } = require("./simulator/perf/profile");
const { Sandbox } = require("./simulator/sandbox");
const { parseLayoutScripts } = require("./simulator/layout");
const ROOT = path.resolve(__dirname, "..");
const QUICKBUY = "panorama/scripts/hud_quickbuy_total_summary.js";
install();

function measure(env, name, ms = 5000) {
    counters.reset();
    env.probe.resetWindow();
    if (env.resetImages) env.resetImages();
    counters.enabled = true;
    try { env.clock.advance(ms); }
    finally { counters.enabled = false; }
    const operations = counters.snapshot(ms / 1000);
    const schedules = env.probe.snapshot();
    return { name, seconds: ms / 1000, pending: schedules.reduce((n, r) => n + r.pending, 0),
        fired: schedules.reduce((n, r) => n + r.fired, 0), schedules,
        operations: operations.total, topMisses: operations.misses.slice(0, 5),
        images: env.readImages ? env.readImages() : null };
}

function errors(env) {
    return [
        ...env.sandbox.loadErrors.map(e => `load: ${e.error.message}`),
        ...env.clock.errors.map(e => `schedule: ${e.error.message}`),
        ...env.sandbox.doc.eventErrors.map(e => `event: ${e.error.message}`),
        ...env.sandbox.messages.filter(line => /\[ERROR\]|Error in|auto-disabled/i.test(line))
    ];
}

function quickbuyEnvironment(active, source) {
    const sandbox = new Sandbox({ name: "quickbuy-audit" });
    const $ = sandbox.global.$;
    const probe = installScheduleProbe(sandbox);
    const host = $.CreatePanel("Panel", sandbox.doc.root, "CitadelHudQuickbuy");
    const context = $.CreatePanel("Panel", host, "");
    $.GetContextPanel = () => context;
    if (active) host.AddClass("enhanced_quickbuy_active");
    $.CreatePanel("Label", context, "QuickbuyShopTotalCostLabel");
    $.CreatePanel("Label", context, "QuickbuyNextSoulsNeededLabel");
    const queue = $.CreatePanel("Panel", context, "QuickbuyQueue");
    let images = { calls: 0, changed: 0 };
    // Reduced fixture using shipped quickbuy layout IDs. Native composition and
    // asset loading are deliberately not simulated. Two queue items fill one preview.
    for (let i = 0; i < 2; i++) {
        const item = $.CreatePanel("Panel", queue, "");
        item.AddClass("QuickbuyItem");
        $.CreatePanel("Label", item, "ModCost").text = "500";
        $.CreatePanel("Label", item, "ModName").text = `Audit item ${i}`;
        const icon = $.CreatePanel("Panel", item, "ModIcon");
        icon.AddClass("isWeapon");
        $.CreatePanel("Image", icon, "ModIconImage").SetAttributeString("src", `audit_${i}`);
    }
    for (let i = 2; i <= 5; i++) {
        const preview = $.CreatePanel("Panel", context, `QuickbuyUpcomingPreview${i}`);
        $.CreatePanel("Label", preview, `QuickbuyUpcomingPreview${i}SoulsNeededLabel`);
        const entry = $.CreatePanel("Panel", preview, `QuickbuyPreview${i}Entry`);
        const icon = $.CreatePanel("Panel", entry, "ModIcon");
        const image = $.CreatePanel("Image", icon, "ModIconImage");
        let previous = "";
        image.SetImage = value => {
            images.calls++;
            if (value !== previous) images.changed++;
            previous = value;
        };
    }
    const layout = parseLayoutScripts(path.join(ROOT, "panorama/layout/hud_quickbuy.xml"));
    if (layout.missing.length) throw new Error("Missing quickbuy layout scripts");
    for (const script of layout.scripts) {
        if (source && script.absPath === path.join(ROOT, QUICKBUY)) {
            vm.runInContext(source, sandbox.context, { filename: script.absPath });
        } else sandbox.load(script.absPath);
    }
    sandbox.clock.advance(1000);
    return { sandbox, probe, context, clock: sandbox.clock,
        resetImages: () => { images = { calls: 0, changed: 0 }; }, readImages: () => ({ ...images }) };
}

function auditQuickbuy({ cycles = 3, active = true, source } = {}) {
    const env = quickbuyEnvironment(active, source);
    const phases = [measure(env, "fresh-queue")];
    for (let cycle = 1; cycle <= cycles; cycle++) {
        env.sandbox.doc.root.RemoveClass("connectedToHideout");
        for (let event = 0; event < 20; event++) {
            env.clock.advance(75);
            env.sandbox.dispatch("CitadelQuickbuyItemsChanged");
        }
        // Deliberately retain a valid hidden context, instead of assuming it is destroyed.
        env.sandbox.doc.root.AddClass("connectedToHideout");
        phases.push(measure(env, `retained-hideout-${cycle}`));
    }
    env.context.DeleteAsync(0);
    env.clock.advance(1000);
    phases.push(measure(env, "destroyed-context"));
    const failures = errors(env);
    for (const phase of phases) {
        const expected = phase.name === "destroyed-context" ? 0 : 1;
        if (phase.pending !== expected) failures.push(`${phase.name}: ${phase.pending} pending (expected ${expected})`);
    }
    return { context: active ? "quickbuy-active" : "quickbuy-disabled", phases, failures };
}

function auditHud(cycles = 3) {
    let probe;
    const env = createProfiledHud({ enableAll: false, beforeLoad: sandbox => { probe = installScheduleProbe(sandbox); } });
    env.probe = probe;
    const Q = env.sandbox.global.QOL;
    env.doc.root.AddClass("connectedToHideout");
    env.clock.advance(5000);
    const phases = [measure(env, "fresh-hideout")];
    for (let cycle = 1; cycle <= cycles; cycle++) {
        env.doc.root.RemoveClass("connectedToHideout");
        Q.core.EventBus.emit("engine:game_state_changed");
        env.clock.advance(3000);
        for (let event = 0; event < 10; event++) {
            env.doc.root.SetHasClass("gScoreboardOpen", event % 2 === 0);
            if (!env.sandbox.dispatch("CitadelScoreboardToggle")) throw new Error("HUD scoreboard listener was not exercised");
            env.clock.advance(100);
        }
        env.doc.root.AddClass("connectedToHideout");
        Q.core.EventBus.emit("engine:game_state_changed");
        env.clock.advance(5000);
        phases.push(measure(env, `retained-hideout-${cycle}`));
    }
    const enabled = Q.core.FeatureRegistry.getEnabledIds();
    const failures = errors(env);
    // HUD counts have legitimate delayed work. Report growth for investigation,
    // without asserting a universal one-loop-per-feature rule.
    return { context: "hud-defaults-modelled-tree", enabled, phases, failures };
}

function main(args) {
    let cycles = 3;
    let ref = "";
    let json = false;
    for (let i = 0; i < args.length; i++) {
        if (args[i] === "--cycles") cycles = Number(args[++i]);
        else if (args[i] === "--quickbuy-ref") ref = args[++i] || "";
        else if (args[i] === "--json") json = true;
        else throw new Error(`Unknown argument: ${args[i]}`);
    }
    if (!Number.isInteger(cycles) || cycles < 1 || cycles > 10) throw new Error("--cycles must be 1..10");
    const source = ref ? execFileSync("git", ["show", `${ref}:${QUICKBUY}`], { cwd: ROOT, encoding: "utf8" }) : undefined;
    const report = { scope: "Modelled JS lifecycle and operation counts; no native timing, FPS or proof of actual hideout panel retention.",
        quickbuySource: ref || "working-tree", cycles,
        results: [auditQuickbuy({ cycles, source }), auditQuickbuy({ cycles, active: false, source }), auditHud(cycles)] };
    if (json) console.log(JSON.stringify(report, null, 2));
    else {
        console.log(report.scope);
        for (const result of report.results) {
            console.log(`\n${result.context}`);
            for (const p of result.phases) {
                console.log(`${p.name}: pending=${p.pending}, fired/${p.seconds}s=${p.fired}, nodes=${p.operations.traverseNodes}, changed classes=${p.operations.classWritesChanged}, changed text=${p.operations.textWritesChanged}, images=${p.images ? `${p.images.changed}/${p.images.calls} changed/calls` : "unmeasured"}`);
            }
            for (const failure of new Set(result.failures)) console.log(`FAIL: ${failure}`);
        }
    }
    if (report.results.some(result => result.failures.length)) process.exitCode = 1;
}

if (require.main === module) {
    try { main(process.argv.slice(2)); }
    catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { auditQuickbuy, auditHud, quickbuyEnvironment, measure };

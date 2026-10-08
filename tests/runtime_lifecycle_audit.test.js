"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { auditQuickbuy, auditHud } = require("../scripts/audit_runtime_lifecycle");
const { installScheduleProbe } = require("../scripts/simulator/perf/schedules");
const { Sandbox } = require("../scripts/simulator/sandbox");

test("schedule probe accounts for cancellation, completed callbacks and errors", () => {
    const sandbox = new Sandbox();
    const probe = installScheduleProbe(sandbox);
    const $ = sandbox.global.$;
    const cancelled = $.Schedule(0, () => { throw new Error("must not run"); });
    $.CancelScheduled(cancelled);
    $.CancelScheduled(cancelled);
    $.Schedule(0, () => { $.Schedule(1, () => {}); throw new Error("count this"); });
    sandbox.clock.advance(0);
    const row = probe.snapshot()[0];
    assert.equal(row.cancelled, 1);
    assert.equal(row.errors, 1);
    assert.equal(row.fired, 1);
    assert.equal(row.pending, 1);
    probe.resetWindow();
    sandbox.clock.advance(1000);
    assert.equal(probe.snapshot()[0].fired, 1);
    assert.equal(probe.snapshot()[0].pending, 0);
});

for (const active of [true, false]) {
    test(`quickbuy repeated events and retained hideout keep bounded work (active=${active})`, () => {
        const report = auditQuickbuy({ cycles: 3, active });
        assert.deepEqual(report.failures, []);
        for (const phase of report.phases.slice(0, -1)) {
            assert.equal(phase.pending, 1);
            assert.equal(phase.fired, 10);
        }
        assert.equal(report.phases.at(-1).fired, 0);
    });
}

test("lifecycle audit rejects a deliberately reintroduced quickbuy event scheduling leak", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "../panorama/scripts/hud_quickbuy_total_summary.js"), "utf8");
    // Fault injection: lose the pending handle at event entry, as the old bug did.
    const eventEntry = /(function update\(\)\s*\{\s*if \(!running\) return;\s*)cancelPoll\(\);/;
    const broken = source.replace(eventEntry, "$1pollHandle = null;");
    assert.notEqual(broken, source, "fault injection must actually change production source");
    const report = auditQuickbuy({ cycles: 1, source: broken });
    assert.equal(report.phases[1].pending, 21);
    assert.equal(report.phases[1].fired, 210);
    assert.ok(report.failures.some(message => message.includes("expected 1")));
});

test("HUD lifecycle audit exercises the real scoreboard bridge and collects callback errors", () => {
    const report = auditHud(2);
    assert.deepEqual(report.failures, []);
    assert.ok(report.enabled.length > 0);
    const baseline = report.phases[0];
    for (const phase of report.phases.slice(1)) assert.equal(phase.pending, baseline.pending);
    assert.ok(baseline.schedules.some(row => row.origin.includes("panorama/scripts/")));
});

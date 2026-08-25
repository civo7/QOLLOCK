// scripts/simulator/fuzz_build_storage.js
// =============================================================================
// Adversarial fuzzer for the ql_build_storage round trip.
// =============================================================================
// Runs the REAL manifest against the simulated client many times, each time with
// randomised engine latencies and a stream of hostile events injected mid-run:
// panels destroyed, the browser slammed shut, the shop closed, the build list
// rebuilt, the hero yanked out from under it.
//
// It does NOT assert what the pipeline achieves. Under hostile conditions failing
// is a correct outcome. It asserts what must NEVER happen regardless — the
// invariants where being wrong costs the user real data or leaves the UI broken.
//
// Every case is seeded and the seed is printed, so a failure is replayable:
//   node scripts/simulator/fuzz_build_storage.js            (default 200 cases)
//   node scripts/simulator/fuzz_build_storage.js 2000       (more cases)
//   node scripts/simulator/fuzz_build_storage.js --seed 123 (replay one case)
// =============================================================================

const sim = require("./index.js");

// ── Seeded PRNG (mulberry32) ──
// Math.random() would make a failure unreproducible, which is the one thing a
// fuzzer cannot afford.
function rng(seed) {
    let a = seed >>> 0;
    return function () {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const LATENCY_KEYS = [
    "heroSwitchMs", "shopOpenMs", "selectBuildMs", "createBuildMs",
    "editModeMs", "saveEditsMs", "browseRevealMs", "buildsReplyMs",
];

// Deliberately includes 1ms (everything instant) and multi-second values, because
// the bug that started this whole effort was a 4s budget that happened to fit one
// machine. Machine speed is an input, not a constant.
function randomLatency(rand) {
    const out = {};
    for (const k of LATENCY_KEYS) {
        const roll = rand();
        if (roll < 0.15) out[k] = 1;                              // instant
        else if (roll < 0.75) out[k] = 20 + Math.floor(rand() * 800);
        else if (roll < 0.95) out[k] = 1000 + Math.floor(rand() * 3000);
        else out[k] = 6000 + Math.floor(rand() * 9000);           // pathological
    }
    return out;
}

// ── Hostile events ──
const SABOTAGE = [
    ["destroy popup", (g) => { if (g.popupPanel && g.popupPanel.IsValid()) g.popupPanel.DeleteAsync(0); }],
    ["destroy build list", (g) => { if (g.buildListPanel && g.buildListPanel.IsValid()) g.buildListPanel.DeleteAsync(0); }],
    ["destroy details pane", (g) => { if (g.buildDetailsPanel && g.buildDetailsPanel.IsValid()) g.buildDetailsPanel.DeleteAsync(0); }],
    ["destroy description entry", (g) => { if (g.descriptionEntry && g.descriptionEntry.IsValid()) g.descriptionEntry.DeleteAsync(0); }],
    ["slam the browser shut", (g) => g.closeBuildBrowser()],
    ["close the shop", (g) => g.closeShop()],
    ["reopen the shop", (g) => g.openShop()],
    ["yank the hero", (g) => g.switchHero("hero_infernus")],
    ["stall the GC reply", (g) => { g.buildsLoading = true; }],
    ["wipe the build list", (g) => g.seedBuilds([])],
    ["duplicate our build", (g) => g.seedBuilds([
        { title: "QOLLOCK-Settings", description: "" },
        { title: "QOLLOCK-Settings", description: "" },
    ])],
];

function buildScenario(rand, token) {
    const roll = rand();
    if (roll < 0.25) return [];                                             // empty storage
    if (roll < 0.5) return [{ title: "QOLLOCK-Settings", description: token }];
    if (roll < 0.65) return [{ title: "QOLLOCK-Settings", description: "" }];
    if (roll < 0.8) return [                                                // payload on the 2nd
        { title: "QOLLOCK-Settings", description: "" },
        { title: "QOLLOCK-Settings", description: token },
    ];
    if (roll < 0.9) return [{ title: "Someone else's build", description: "not a token" }];
    return [                                                                // corrupt token
        { title: "QOLLOCK-Settings", description: "[QOL-3-2-0]:!!!!not-base64!!!!" },
    ];
}

function opacityOf(panel) {
    try {
        if (!panel || !panel.IsValid()) return null;
        const v = String(panel.style.opacity || "");
        return v === "" ? null : v;
    } catch (e) { return null; }
}

function runCase(seed, mode) {
    const rand = rng(seed);
    const latency = randomLatency(rand);
    const titleMode = rand() < 0.5 ? sim.TITLE_MODE.TOKEN : sim.TITLE_MODE.RESOLVED;

    const h = sim.createHud({ latency, titleMode, inHideout: true });
    if (h.sandbox.loadErrors.length) {
        return { seed, mode, fatal: "mod failed to load: " + h.sandbox.loadErrors[0].error };
    }
    const QOL = h.sandbox.global.QOL;
    const token = QOL.buildDefaultPayloadToken();
    const g = h.game;
    g.seedBuilds(buildScenario(rand, token));

    const applied = [];
    if (mode === "write") {
        // Let the startup read settle first, then queue a save the way the settings
        // context does: on the ABSOLUTE root, not on #Hud.
        h.clock.advanceBy(30000, 200);
        h.doc.absRoot.SetAttributeString("QOL_BUILD_SAVE_REQUEST", token);
        h.doc.absRoot.SetAttributeString("QOL_BUILD_SAVE_TOKEN", "fuzz_" + seed);
    }

    // Drive the clock in slices, injecting sabotage at random points.
    const events = 1 + Math.floor(rand() * 5);
    const totalMs = 90000;
    const sliceMs = 250;
    let nextSabotageAt = Math.floor(rand() * 40) * sliceMs;
    let fired = 0;
    let thrown = null;
    // Sampled every slice. The final state of the build list is NOT evidence about a
    // read that ran earlier — sabotage rewrites it on purpose — so anything the
    // invariants need to know about mid-run has to be observed mid-run.
    let sawPayloadDuringRun = g.builds.some((b) => b.description === token);
    let payloadSeenAfterWrite = false;

    for (let elapsed = 0; elapsed < totalMs; elapsed += sliceMs) {
        if (fired < events && elapsed >= nextSabotageAt) {
            const pick = SABOTAGE[Math.floor(rand() * SABOTAGE.length)];
            try { pick[1](g); } catch (e) { /* sabotage itself may fail; fine */ }
            applied.push(pick[0]);
            fired++;
            nextSabotageAt = elapsed + Math.floor(rand() * 30) * sliceMs;
        }
        try {
            h.clock.advance(sliceMs);
        } catch (e) {
            thrown = e && e.message ? e.message : String(e);
            break;
        }
        if (g.builds.some((b) => b.description === token)) {
            sawPayloadDuringRun = true;
            payloadSeenAfterWrite = true;
        }
    }
    // Quiet tail: give every terminal path room to run its cleanup.
    try { h.clock.advanceBy(30000, 200); } catch (e) { thrown = thrown || String(e); }

    const State = QOL.state || {};
    const msgs = h.sandbox.messages;
    const grep = (s) => msgs.filter((m) => m.indexOf(s) !== -1);

    return {
        seed, mode, latency, titleMode, sabotage: applied, thrown,
        confirmPressed: !!g.confirmedBuildApplied,
        shopOpacity: opacityOf(g.shopPanel),
        popupOpacity: opacityOf(g.popupPanel),
        loadState: State.configLoadState || "(unset)",
        loadDetail: State.configLoadStateDetail || "",
        readLines: grep("] read: "),
        writeLines: grep("] write: "),
        stateLines: grep("configLoadState="),
        tickErrors: grep("tick error:"),
        createCount: g.counters.createBuild,
        deleteCount: g.counters.deleteBuild,
        builds: g.builds.map((b) => b.description || ""),
        sawPayloadDuringRun, payloadSeenAfterWrite,
        token,
    };
}

// ── Invariants: things that must hold no matter how hostile the run was ──
function checkInvariants(r) {
    const fails = [];

    if (r.fatal) { fails.push(r.fatal); return fails; }

    // 1. Pressing Confirm applies the selected build to the PLAYER'S loadout. It is
    //    silent, it touches data the user cares about, and no failure justifies it.
    if (r.confirmPressed) fails.push("pressed Confirm — applied a build to the player");

    // 2. A dimmed panel left behind is worse than the visible popup ever was:
    //    nothing on screen tells the user the game is stuck.
    if (r.shopOpacity === "0.02") fails.push("left the shop dimmed");
    if (r.popupOpacity === "0.02") fails.push("left the popup dimmed");

    // 3. A throwing tick is tracked by FeatureRegistry, but the manifest should not
    //    be reaching engine errors through hostile-but-legal panel teardown.
    if (r.thrown) fails.push("threw out of the clock: " + r.thrown);
    if (r.tickErrors.length) fails.push("tick error: " + r.tickErrors[0]);

    // 4. THE important one. "loaded" is what authorizes a save to overwrite, so it
    //    may only mean "we read our payload" or "we proved there is nothing to
    //    read". Claiming it after being sabotaged mid-read would silently destroy a
    //    real config on the next save.
    //
    //    Both halves are judged from what the manifest LOGGED at the time, never
    //    from the final state of the build list: sabotage deliberately wipes and
    //    rewrites builds after the fact, and a read that was correct when it ran
    //    does not become wrong because the list changed afterwards. Getting this
    //    wrong the first time produced 18 "failures" that were all the harness.
    if (r.loadState === "loaded") {
        const readOk = r.readLines.some((l) => l.indexOf("read: success") !== -1);
        // The justification is logged on the configLoadState line, not the read line.
        const provedEmpty = r.stateLines.some((l) =>
            /storage was empty|visited every candidate/.test(l));
        if (!readOk && !provedEmpty) {
            fails.push("claimed loaded without reading or proving empty (detail=" + r.loadDetail + ")");
        }
        // A claimed success must correspond to a payload the run actually saw. The
        // manifest logs that separately from whatever is on disk at the end.
        if (readOk && !r.sawPayloadDuringRun) {
            fails.push("claimed a payload was applied but never observed one");
        }
    }

    // 5. Never delete a user's build. There is no delete path in this manifest at
    //    all, so any delete means something reached one by accident.
    if (r.deleteCount > 0) fails.push("deleted " + r.deleteCount + " build(s)");

    // 6. Junk builds pile up if a create is retried. One run creates at most one.
    if (r.createCount > 1) fails.push("created " + r.createCount + " builds in one run");

    // 7. A save that reports success must have put the payload somewhere. Judged
    //    against what was on disk when the write verified, not at the very end —
    //    sabotage rewrites the list afterwards.
    if (r.writeLines.some((l) => l.indexOf("write: success") !== -1) && !r.payloadSeenAfterWrite) {
        fails.push("reported write success but no build ever held the payload");
    }

    return fails;
}

function main() {
    const args = process.argv.slice(2);
    let cases = 200;
    let onlySeed = null;
    for (let i = 0; i < args.length; i++) {
        if (args[i] === "--seed") onlySeed = Number(args[++i]);
        else if (!isNaN(Number(args[i]))) cases = Number(args[i]);
    }

    const seeds = onlySeed !== null ? [onlySeed] : Array.from({ length: cases }, (_, i) => i + 1);
    const modes = ["read", "write"];
    let run = 0, failed = 0;
    const failures = [];

    for (const seed of seeds) {
        for (const mode of modes) {
            run++;
            let r;
            try {
                r = runCase(seed, mode);
            } catch (e) {
                r = { seed, mode, fatal: "harness crashed: " + (e && e.stack ? e.stack : e) };
            }
            const fails = checkInvariants(r);
            if (fails.length) {
                failed++;
                failures.push({ r, fails });
                if (failures.length <= 10) {
                    console.log(`\nFAIL seed=${seed} mode=${mode}`);
                    for (const f of fails) console.log("   - " + f);
                    console.log("   sabotage : " + (r.sabotage || []).join(" -> "));
                    console.log("   latency  : " + JSON.stringify(r.latency));
                    console.log("   titleMode: " + r.titleMode);
                    console.log("   loadState: " + r.loadState + " / " + r.loadDetail);
                    console.log("   read     : " + (r.readLines || []).join(" ; "));
                    console.log("   write    : " + (r.writeLines || []).join(" ; "));
                    console.log("   sawPayload during run=" + r.sawPayloadDuringRun +
                                " afterWrite=" + r.payloadSeenAfterWrite);
                    console.log("   builds   : " + JSON.stringify(r.builds));
                    console.log("   replay   : node scripts/simulator/fuzz_build_storage.js --seed " + seed);
                }
            }
        }
    }

    console.log(`\n${run} run(s), ${failed} violated an invariant.`);
    if (failures.length > 10) console.log(`(${failures.length - 10} further failures not printed)`);
    process.exit(failed ? 1 : 0);
}

main();

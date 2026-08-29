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

// Returns the builds to seed AND every token that counts as "ours" for the
// payload invariants. A migration writes the token it RECOVERED, which for a
// 3.1.9 build is a 3.1.9 token, not the default one — checking only the default
// would report "wrote success but no build holds the payload" on a migration that
// worked perfectly.
function buildScenario(rand, token) {
    // Same payload, stamped with the version 3.1.9 wrote. The schema is still in
    // the registry (ql_shared_presets.js:2030), so this really does decode.
    const legacyToken = token.replace("[QOL-3-2-0]", "[QOL-3-1-9]");
    const both = [token, legacyToken];
    const roll = rand();
    if (roll < 0.20) return { specs: [], tokens: both };                     // empty storage
    if (roll < 0.40) return { specs: [{ title: "QOLLOCK-Settings", description: token }], tokens: both };
    if (roll < 0.52) return { specs: [{ title: "QOLLOCK-Settings", description: "" }], tokens: both };
    if (roll < 0.64) return {                                               // payload on the 2nd
        specs: [
            { title: "QOLLOCK-Settings", description: "" },
            { title: "QOLLOCK-Settings", description: token },
        ], tokens: both };
    if (roll < 0.72) return { specs: [{ title: "Someone else's build", description: "not a token" }], tokens: both };
    if (roll < 0.80) return {                                               // corrupt token
        specs: [{ title: "QOLLOCK-Settings", description: "[QOL-3-2-0]:!!!!not-base64!!!!" }],
        tokens: both };
    // ── 3.1.9 MIGRATION scenarios — drop with legacy_3_1_9.js ──
    if (roll < 0.90) return {                                               // straight 3.1.9 user
        specs: [{ title: "New Skyrunner Build", description: "", categories: [legacyToken] }],
        tokens: both };
    if (roll < 0.96) return {                                               // 3.1.9 among clutter
        specs: [
            { title: "My real build", description: "", categories: ["Core Items"] },
            { title: "New Skyrunner Build", description: "", categories: [legacyToken] },
            { title: "Another build", description: "", categories: ["Late Game"] },
        ], tokens: both };
    return {                                                                // a STRANGER's token
        // The trap the MyBuild filter exists for: a public build carrying a
        // QOLLOCK token. Reading it would import someone else's settings.
        specs: [
            { title: "Pro player build", description: "", categories: [legacyToken], isPublic: true },
            { title: "New Skyrunner Build", description: "", categories: ["Core Items"] },
        ], tokens: both };
}

function opacityOf(panel) {
    try {
        if (!panel || !panel.IsValid()) return null;
        const v = String(panel.style.opacity || "");
        return v === "" ? null : v;
    } catch (e) { return null; }
}

// Set by --events; null means "randomise 1-5 as usual".
let forcedEvents = null;

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
    if (process.env.FUZZ_TRACE_SHOP) {
        const realOpen = g.openShop.bind(g);
        g.openShop = function () {
            console.log("[trace] openShop @" + Math.round(h.clock.now()) +
                        " loadState=" + (QOL.state && QOL.state.configLoadState || "-"));
            console.log(new Error().stack.split("\n").slice(2, 9).join("\n"));
            return realOpen();
        };
    }
    const scenario = buildScenario(rand, token);
    // Any of these, in a description OR in a category name, counts as our payload
    // being present. Both places matter: 3.1.9 stored it in the category, so a
    // legacy read that succeeds has observed a real payload even though no
    // description holds one yet. Checking descriptions alone reported 25 false
    // "claimed a payload was applied but never observed one" failures.
    const ourTokens = scenario.tokens;
    const holdsOurPayload = () => g.builds.some((b) =>
        ourTokens.indexOf(b.description) !== -1 ||
        (b.categories || []).some((c) => ourTokens.indexOf(c.name) !== -1));
    g.seedBuilds(scenario.specs);

    const applied = [];
    if (mode === "write") {
        // Let the startup read settle first, then queue a save the way the settings
        // context does: on the ABSOLUTE root, not on #Hud.
        h.clock.advanceBy(30000, 200);
        h.doc.absRoot.SetAttributeString("QOL_BUILD_SAVE_REQUEST", token);
        h.doc.absRoot.SetAttributeString("QOL_BUILD_SAVE_TOKEN", "fuzz_" + seed);
    }

    // Drive the clock in slices, injecting sabotage at random points.
    //
    // At least one event, always — until --events made it configurable there was no
    // way to run this harness WITHOUT sabotage, so it could report "552 successes in
    // 3000 runs" and nobody could tell whether that meant the pipeline is broken or
    // that it was being actively attacked in every single run. It was the latter, but
    // the harness had no way to say so. `--events 0` is the control group.
    const events = forcedEvents !== null ? forcedEvents : (1 + Math.floor(rand() * 5));
    const totalMs = 90000;
    const sliceMs = 250;
    let nextSabotageAt = Math.floor(rand() * 40) * sliceMs;
    let fired = 0;
    let thrown = null;
    // Sampled every slice. The final state of the build list is NOT evidence about a
    // read that ran earlier — sabotage rewrites it on purpose — so anything the
    // invariants need to know about mid-run has to be observed mid-run.
    let sawPayloadDuringRun = holdsOurPayload();
    let payloadSeenAfterWrite = false;
    // Latched the moment the run promises it is over, so anything that happens
    // AFTER that promise can be told apart from the run doing its job. Without
    // this, cleanup that fires late is indistinguishable from cleanup that fired
    // on time — and "late" is what the user perceives as the mod glitching.
    let shopOpensAtConclusion = -1;
    // Counted against a baseline taken after the pre-roll, not tested as a boolean.
    // A 3.1.9 migration finishes a write of its own during the pre-roll, so a
    // boolean would already read "concluded" before the fuzzer's save request was
    // even queued, and every shop open the real save then performs would be blamed
    // on post-run cleanup.
    const concludedBaseline = terminalLineCount(h, mode);
    const latchConclusion = () => {
        if (shopOpensAtConclusion !== -1) return;
        if (terminalLineCount(h, mode) <= concludedBaseline) return;
        shopOpensAtConclusion = g.counters.shopOpen;
    };

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
        if (holdsOurPayload()) {
            sawPayloadDuringRun = true;
            payloadSeenAfterWrite = true;
        }
        latchConclusion();
    }
    // Quiet tail: give every terminal path room to run its cleanup.
    try {
        for (let i = 0; i < 150; i++) { h.clock.advance(200); latchConclusion(); }
    } catch (e) { thrown = thrown || String(e); }

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
        // 3.1.9 MIGRATION — drop with legacy_3_1_9.js.
        migrated: grep("3.1.9 config recovered").length > 0,
        legacySwept: grep("3.1.9 sweep").length > 0,
        deleteCount: g.counters.deleteBuild,
        builds: g.builds.map((b) => b.description || ""),
        sawPayloadDuringRun, payloadSeenAfterWrite,
        token,
        // ── Exit state ──
        // What the player is actually looking at once the dust settles. Every one
        // of these was unobserved while 3000 cases passed, which is how a pipeline
        // that never closed the shop it opened read as clean.
        //
        // "Concluded" gates the lot: a run still legitimately in flight at the end
        // of the window has not promised anything yet.
        concluded: terminalLineCount(h, mode) > concludedBaseline,
        shopOpen: !!g.shopOpen,
        // How many times the shop was opened after the run said it was finished.
        // Zero is the only acceptable answer: the player is looking at the game
        // again by then, and a shop that pops up on its own is exactly the
        // "why did my screen just flash" report this pipeline generates.
        shopOpensAfterConclusion: shopOpensAtConclusion === -1
            ? 0 : (g.counters.shopOpen - shopOpensAtConclusion),
        shopOpensTotal: g.counters.shopOpen,
        shopOpensAtConclusion,
        hero: g.hero,
        editing: !!g.editing,
        // The popup counts as left on screen only if it still EXISTS and is not
        // Hidden. Sabotage deletes it outright, and a model flag pointing at a
        // deleted panel is not something the user can see.
        popupOnScreen: !!(g.browseOpen && g.popupPanel && g.popupPanel.IsValid() &&
                          !g.popupPanel.BHasClass("Hidden")),
    };
}

// _finish is the only thing that logs "<mode>: <code> — ", and code is one of
// success/failed/default. Nothing else in the manifest emits that shape, so it is
// the one honest "this run has promised it is over" signal.
//
// Matched PER MODE on purpose. In write mode the startup read runs first, inside
// the pre-roll, and its own terminal line would otherwise mark the write as already
// concluded before the write had done anything at all.
//
// State.configLoadState is NOT usable for this, which is what made the first
// version of these checks wrong: ql_state.js:562 seeds it to the string "pending",
// so a truthiness test latches on the very first tick and every later shop open
// looks like it happened after the run finished. The bridge attribute has the same
// flaw in reverse — _writeStatus writes "pending" to it mid-run.
function terminalLineCount(h, mode) {
    const re = mode === "read"
        ? /\] read: (success|failed|default) — /
        // "write refused" is terminal too: the request is answered and cleared
        // without ever entering _finish.
        : /\] write: (success|failed|default) — |\] write refused: /;
    try { return h.sandbox.messages.filter((m) => re.test(m)).length; }
    catch (e) { return 0; }
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

    // 6. Junk builds pile up if a create is retried. One write run creates at most
    //    one — and a 3.1.9 migration legitimately runs two writes: the migration
    //    itself, then the save the fuzzer queued. Budgeted, not exempted, so a
    //    retry loop still fails.
    const createBudget = r.migrated ? 2 : 1;
    if (r.createCount > createBudget) {
        fails.push("created " + r.createCount + " builds in one run (budget " + createBudget + ")");
    }

    // 7. A save that reports success must have put the payload somewhere. Judged
    //    against what was on disk when the write verified, not at the very end —
    //    sabotage rewrites the list afterwards.
    if (r.writeLines.some((l) => l.indexOf("write: success") !== -1) && !r.payloadSeenAfterWrite) {
        fails.push("reported write success but no build ever held the payload");
    }

    // ── 8-11. Exit state. Only meaningful once the run has concluded; one still in
    //    flight has not promised to have cleaned up yet.
    if (r.concluded) {
        // 8. Leave the shop as we found it. The run opens the shop to reach the
        //    build list, and a shop left standing open afterwards is the whole of
        //    what the user perceives as "the mod did something weird" — the
        //    machinery is dimmed while it runs, so this is the only part they see.
        //    Skipped when sabotage reopened the shop: then it is open because the
        //    simulated user opened it, which is theirs to keep.
        if (r.shopOpen && r.sabotage.indexOf("reopen the shop") === -1) {
            fails.push("left the shop open");
        }

        // 8b. And never reopen it once finished. This is the half a boolean cannot
        //     see: for a long time nothing in the manifest closed the shop at all
        //     and the runs still ended with it shut, because the hero restore
        //     reaches an old-pipeline helper that closes the shop, REOPENS it, and
        //     closes it again 0.05s later (ql_core.js:6490-6560). Opacity has
        //     already been restored by then, so that reopen is a full-brightness
        //     flash of the UI the run spent its whole life hiding — and the end
        //     state looks perfectly clean either way.
        //
        //     Budgeted, not forbidden, for the same reason invariant 6 budgets two
        //     creates: the latch fires at the FIRST terminal line, and a 3.1.9
        //     migration legitimately runs a second write session afterwards (the
        //     migration, then the save queued while it ran). That session opens the
        //     shop for its own round trip, dimmed, exactly as intended — blaming it
        //     on post-run cleanup reported four failures that were the pipeline
        //     working. One open per session past the first; a stray flash on top of
        //     that still fails.
        const writeSessions = (r.writeLines || [])
            .filter((l) => /write: (success|failed)/.test(l)).length;
        const reopenBudget = Math.max(0, writeSessions - 1);
        if (r.shopOpensAfterConclusion > reopenBudget && r.sabotage.indexOf("reopen the shop") === -1) {
            fails.push("reopened the shop " + r.shopOpensAfterConclusion +
                       "x after the run concluded (budget " + reopenBudget + ")");
        }

        // 9. Never strand the player on the storage hero. No sabotage selects
        //    Skyrunner, so this can only be our own hero switch left unreversed —
        //    the player stands in the hideout as the wrong character with nothing
        //    running to put them back. An empty hero is a switch still in flight.
        if (r.hero === "hero_skyrunner") {
            fails.push("left the player on the storage hero");
        }

        // 10. The browser popup is modal and only Cancel dismisses it — ESC does
        //     not reach its oncancel. Left up, the player cannot get back to the
        //     game without finding that button.
        if (r.popupOnScreen) fails.push("left the build browser open on screen");

        // 11. The build editor holds our token in a visible text field. Left open,
        //     the user is sitting in edit mode on a build they never opened.
        if (r.editing) fails.push("left the build editor open");
    }

    return fails;
}

function main() {
    const args = process.argv.slice(2);
    let cases = 200;
    let onlySeed = null;
    let listAll = false;
    for (let i = 0; i < args.length; i++) {
        if (args[i] === "--seed") onlySeed = Number(args[++i]);
        else if (args[i] === "--list") listAll = true;
        else if (args[i] === "--events") forcedEvents = Number(args[++i]);
        else if (!isNaN(Number(args[i]))) cases = Number(args[i]);
    }

    const seeds = onlySeed !== null ? [onlySeed] : Array.from({ length: cases }, (_, i) => i + 1);
    if (forcedEvents !== null) console.log(`sabotage events forced to ${forcedEvents} per run`);
    const modes = ["read", "write"];
    let run = 0, failed = 0;
    const failures = [];
    // Tallied by kind, because the printed sample stops at 10 and "21 violated an
    // invariant" tells you nothing about whether that is one bug or four. The
    // message text is the key, minus its parenthetical detail.
    const byKind = new Map();
    const firstSeedOfKind = new Map();
    const outcomes = new Map();
    const tally = (k) => outcomes.set(k, (outcomes.get(k) || 0) + 1);

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
            if (r.fatal) {
                tally("harness crashed");
            } else {
                tally("read: " + (r.loadState || "none"));
                // Joined rather than counted separately because a run can write twice
                // (a 3.1.9 migration, then the queued save) and "success+failed" is a
                // different story from two runs that each did one of them.
                const w = (r.writeLines || [])
                    .filter((l) => /write: (success|failed)/.test(l))
                    .map((l) => (l.indexOf("write: success") !== -1 ? "success" : "failed"));
                tally("write: " + (w.length ? w.join("+") : "none"));
                if (r.migrated) tally("3.1.9 migration ran");
            }
            if (fails.length) {
                failed++;
                failures.push({ r, fails });
                for (const f of fails) {
                    const kind = String(f).replace(/\s*\(.*$/, "").slice(0, 70);
                    byKind.set(kind, (byKind.get(kind) || 0) + 1);
                    if (!firstSeedOfKind.has(kind)) firstSeedOfKind.set(kind, `${seed}/${mode}`);
                }
                if (failures.length <= 10) {
                    console.log(`\nFAIL seed=${seed} mode=${mode}`);
                    for (const f of fails) console.log("   - " + f);
                    console.log("   sabotage : " + (r.sabotage || []).join(" -> "));
                    console.log("   latency  : " + JSON.stringify(r.latency));
                    console.log("   titleMode: " + r.titleMode);
                    console.log("   loadState: " + r.loadState + " / " + r.loadDetail);
                    console.log("   exit     : concluded=" + r.concluded + " shopOpen=" + r.shopOpen +
                                " hero=" + JSON.stringify(r.hero) + " editing=" + r.editing +
                                " popupOnScreen=" + r.popupOnScreen);
                    console.log("   shopOpens: total=" + r.shopOpensTotal + " atConclusion=" +
                                r.shopOpensAtConclusion + " after=" + r.shopOpensAfterConclusion);
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
    // Outcome tally. The invariants only say "nothing was broken", which a pipeline
    // that achieves nothing at all satisfies perfectly. This is the other half:
    // how often the round trip actually worked. Needed to judge whether a change
    // that removes failures also removed the successes that justified it.
    if (outcomes.size > 0) {
        console.log("\noutcomes:");
        for (const [k, n] of [...outcomes.entries()].sort()) {
            console.log(`  ${String(n).padStart(5)}  ${k}`);
        }
    }
    // --list prints every failure on one line. The totals alone cannot answer the
    // only question that matters after a code change: are these the SAME failures
    // as before, or did I trade four old ones for four new ones? Diffing two
    // --list runs answers it; comparing two counts does not.
    if (listAll && failures.length) {
        console.log("\nall failures (seed/mode: kinds):");
        for (const { r, fails } of failures) {
            console.log(`  ${r.seed}/${r.mode}: ${fails.map((f) => String(f).replace(/\s*\(.*$/, "")).join(" ; ")}`);
        }
    }
    if (byKind.size > 0) {
        console.log("\nby kind:");
        const sorted = [...byKind.entries()].sort((a, b) => b[1] - a[1]);
        for (const [kind, n] of sorted) {
            console.log(`  ${String(n).padStart(5)}  ${kind}   (first: --seed ${firstSeedOfKind.get(kind)})`);
        }
    }
    process.exit(failed ? 1 : 0);
}

main();

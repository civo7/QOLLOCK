// scripts/probe_build_save_overlay.js
// =============================================================================
// Evidence harness for the three loader overlays (load / save / clear).
// =============================================================================
// Boots the real mod in the simulator, lets the startup read run, then queues a
// save exactly the way the settings context does, and samples on every slice:
//
//   - State.settingsLoaderSession{Active,Completed}      (load overlay)
//   - State.saveSettingsLoaderSession{Active,Completed}  (save overlay)
//   - whether the overlay panels exist and are visible
//   - the per-step checklist state of whichever overlay claims to be showing
//   - the QOL_BUILD_SAVE_* bridge attributes the settings UI polls
//
// Not a test — a probe. Run it and read the transitions.
//
//   node scripts/probe_build_save_overlay.js
// =============================================================================

"use strict";

const sim = require("./simulator/index.js");

const LOAD_OVERLAY = "QOLSettingsLoaderOverlay";
const SAVE_OVERLAY = "QOLSaveSettingsLoaderOverlay";

const LOAD_STEPS = ["start", "switch_airheart", "confirm_airheart", "read_payload",
                    "decode_payload", "apply_config", "return_hero", "complete"];
const SAVE_STEPS = ["start", "switch_airheart", "confirm_airheart", "prepare_build",
                    "write_payload", "commit_save", "verify_save", "return_hero", "complete"];

function vis(root, id) {
    const p = root.FindChildTraverse ? root.FindChildTraverse(id) : null;
    if (!p) return "absent";
    let v = "";
    try { v = String(p.style.visibility || ""); } catch (e) { v = "?"; }
    return v === "collapse" ? "collapse" : (v || "(unset)");
}

function stepsOf(State, prefix, keys) {
    const st = State[prefix + "StepStates"];
    if (!st || typeof st !== "object") return "(no stepStates)";
    const short = { pending: ".", active: ">", done: "x", error: "!", skipped: "-" };
    return keys.map((k) => short[String(st[k] || "pending")] || "?").join("");
}

function bridge(absRoot) {
    const g = (a) => {
        try { return String(absRoot.GetAttributeString(a, "") || ""); } catch (e) { return "?"; }
    };
    return {
        state: g("QOL_BUILD_SAVE_STATE"),
        msg: g("QOL_BUILD_SAVE_MSG"),
        token: g("QOL_BUILD_SAVE_TOKEN"),
        request: g("QOL_BUILD_SAVE_REQUEST") ? "set" : "",
    };
}

function row(h, QOL, label) {
    const State = QOL.state || {};
    const abs = h.doc.absRoot;
    const b = bridge(abs);
    const f = (a, c) => (a ? "A" : "") + (c ? "C" : "") || "-";
    return {
        t: Math.round(h.clock.now()),
        label,
        load: f(State.settingsLoaderSessionActive, State.settingsLoaderSessionCompleted),
        loadPanel: vis(abs, LOAD_OVERLAY),
        loadSteps: stepsOf(State, "settingsLoader", LOAD_STEPS),
        save: f(State.saveSettingsLoaderSessionActive, State.saveSettingsLoaderSessionCompleted),
        savePanel: vis(abs, SAVE_OVERLAY),
        saveSteps: stepsOf(State, "saveSettingsLoader", SAVE_STEPS),
        br: b.state + (b.msg ? "/" + b.msg : "") + (b.request ? " req" : ""),
    };
}

const pad = (s, n) => String(s).padEnd(n);
function printRows(rows) {
    console.log(pad("t(ms)", 8) + pad("phase", 22) +
                pad("load", 6) + pad("loadPanel", 11) + pad("loadSteps", 11) +
                pad("save", 6) + pad("savePanel", 11) + pad("saveSteps", 12) + "bridge");
    console.log("-".repeat(120));
    for (const r of rows) {
        console.log(pad(r.t, 8) + pad(r.label, 22) +
                    pad(r.load, 6) + pad(r.loadPanel, 11) + pad(r.loadSteps, 11) +
                    pad(r.save, 6) + pad(r.savePanel, 11) + pad(r.saveSteps, 12) + r.br);
    }
}

function run() {
    const h = sim.createHud({ inHideout: true, titleMode: sim.TITLE_MODE.RESOLVED });
    h.assertLoaded();
    const QOL = h.sandbox.global.QOL;
    const token = QOL.buildDefaultPayloadToken();
    h.game.seedBuilds([{ title: "QOLLOCK-Settings", description: token }]);

    const rows = [];
    let last = "";
    const sample = (label) => {
        const r = row(h, QOL, label);
        const sig = r.load + r.loadPanel + r.loadSteps + r.save + r.savePanel + r.saveSteps + r.br;
        if (sig !== last) { rows.push(r); last = sig; }
    };

    // ── Phase 1: startup read ──
    sample("boot");
    for (let i = 0; i < 200; i++) { h.clock.advance(200); sample("startup read"); }

    console.log("=== PHASE 1: startup read (this is the overlay the user DID see) ===\n");
    printRows(rows);

    const readMsgs = h.sandbox.messages.filter((m) => m.indexOf("load:") !== -1 || m.indexOf("stage: read") !== -1);
    console.log("\nload traces: " + (readMsgs.length ? "" : "(none)"));
    for (const m of readMsgs) console.log("  " + m);

    // ── Phase 2: queue a save the way the settings UI does ──
    // Stale the stored copy first, otherwise the machine short-circuits on
    // "already up to date" and never reaches write_description / commit / verify.
    h.game.builds[0].description = "";
    rows.length = 0; last = "";
    const msgBase = h.sandbox.messages.length;
    h.doc.absRoot.SetAttributeString("QOL_BUILD_SAVE_REQUEST", token);
    h.doc.absRoot.SetAttributeString("QOL_BUILD_SAVE_TOKEN", "probe_tok_1");
    h.doc.absRoot.SetAttributeString("QOL_BUILD_SAVE_MSG", "queued");
    h.doc.absRoot.SetAttributeString("QOL_BUILD_SAVE_STATE", "pending");
    sample("save queued");
    for (let i = 0; i < 250; i++) { h.clock.advance(200); sample("saving"); }

    console.log("\n\n=== PHASE 2: save (the overlay the user did NOT see) ===\n");
    printRows(rows);

    const writeMsgs = h.sandbox.messages.slice(msgBase)
        .filter((m) => m.indexOf("save:") !== -1 || m.indexOf("stage: write") !== -1 || m.indexOf("write:") !== -1);
    console.log("\nsave traces:");
    for (const m of writeMsgs) console.log("  " + m);

    const State = QOL.state || {};
    console.log("\nfinal: saveActive=" + !!State.saveSettingsLoaderSessionActive +
                " saveCompleted=" + !!State.saveSettingsLoaderSessionCompleted +
                " saveResult=" + (State.saveSettingsLoaderResult || "(unset)") +
                " saveDetail=" + JSON.stringify(State.saveSettingsLoaderDetail || ""));
    console.log("final bridge: " + JSON.stringify(bridge(h.doc.absRoot)));
    console.log("save overlay panel: " + vis(h.doc.absRoot, SAVE_OVERLAY));
    console.log("load overlay panel: " + vis(h.doc.absRoot, LOAD_OVERLAY));
}

run();

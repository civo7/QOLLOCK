"use strict";
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const { decodePackets, digest } = require("./analyze_minimap_frames");
const stable = value => JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item) ?
    Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const hash = value => digest(stable(value));
const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const scope = { QOL: { core: {} } };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../panorama/scripts/core/ql_config_investigation.js"), "utf8"), scope);

function analyzeConfig(meta, frames, focus, summarizeWindow) {
    const { packets, errors: packetErrors } = decodePackets(meta.packets, meta.session), context = packets.get("context");
    const setupFailure = packets.get("setup-failure");
    if (setupFailure?.kind === "config-suite" && setupFailure.reason === "setup-error" && !context) return {
        kind: "config-suite", reason: "setup-error", setupFailure, rows: [], sourceIdentity: meta.sourceIdentity,
        packetErrors: Object.fromEntries(packetErrors), restoration: { configRestored: !!setupFailure.expectedConfig &&
            stable(setupFailure.expectedConfig) === stable(setupFailure.actualConfig) } };
    if (!context || context.kind !== "config-suite") throw Error("Configuration context/coverage ledger unavailable: " + (packetErrors.get("context") || "missing context"));
    if (!Array.isArray(context.manifests) || context.manifests.length > 500 || !Array.isArray(context.selectedIds) || !Array.isArray(context.registeredKeys) ||
        !context.baseline || !context.canonical || !context.plan) throw Error("Invalid configuration context");
    const expectedPlan = scope.QOL.core.ConfigInvestigation.plan(context);
    if (stable(expectedPlan) !== stable(context.plan)) throw Error("Configuration coverage ledger does not match its source contract; use the matching analyzer revision");
    const registeredKeys = [...new Set(context.manifests.flatMap(owner => owner.keys))].filter(key => Object.prototype.hasOwnProperty.call(context.baseline, key)).sort();
    if (stable(registeredKeys) !== stable(context.registeredKeys)) throw Error("Configuration registered-key coverage does not match the manifest inventory");
    const { plan } = context;
    if (plan.conditions.some(row => row.keyboard) && context.keyboardEvidence !== true) throw Error("Keyboard mechanism evidence is required by this plan");
    const windows = (meta.windows || []).filter(window => window.session === meta.session);
    if (windows.some(window => !plan.blocks.some(block => block.trial === window.trial))) throw Error("Native window outside configuration coverage ledger");
    const ordered = windows.slice().sort((a, b) => a.startAt - b.startAt);
    if (ordered.some((window, i) => i && window.startAt < ordered[i - 1].endAt)) throw Error("Overlapping native configuration windows");
    const glyphReference = ordered.filter(window => plan.conditions.find(row => row.id === window.conditionId)?.keyboard)
        .map(window => packets.get(window.beforeProof)?.keyboard?.observed)
        .find(state => state?.glyphsReady === true && /^[0-9a-f]{8}$/.test(state.glyphWorkload || ""))?.glyphWorkload;
    const blocks = plan.blocks.map(block => {
        const condition = plan.conditions.find(row => row.id === block.conditionId), errors = [];
        const observed = windows.filter(window => window.trial === block.trial);
        if (observed.length !== 4) errors.push("missing/incomplete planned windows");
        const phases = new Set();
        const summaries = observed.map(window => {
            if (!Number.isInteger(window.phase) || window.phase < 0 || window.phase > 3 || phases.has(window.phase) ||
                window.side !== block.order[window.phase] || window.conditionId !== condition.id || window.repeat !== block.repeat ||
                !Number.isFinite(window.startAt) || !Number.isFinite(window.endAt) || window.endAt - window.startAt < plan.sampleMs - 1 ||
                window.endAt - window.startAt > plan.sampleMs + 1500) { errors.push("window identity/order/duration mismatch"); return null; }
            phases.add(window.phase);
            const config = { ...context.baseline, ...(window.side === "B" ? condition.patch : {}) };
            const instrumented = !(condition.id === "benchmark-instrumentation" && window.side === "B");
            const proofs = [window.beforeProof, window.afterProof].map(id => packets.get(id));
            for (const [index, proof] of proofs.entries()) {
                const key = index ? window.afterProof : window.beforeProof;
                if (!proof) { errors.push("missing proof " + key + ": " + (packetErrors.get(key) || "missing packet")); continue; }
                const overrides = proof.registeredOverrides || {};
                const ownerConfig = Object.fromEntries(context.registeredKeys.map(key => [key, Object.prototype.hasOwnProperty.call(overrides, key) ? overrides[key] : config[key]]));
                if (!proof.verified || proof.failures?.length || proof.work?.errors || proof.configHash !== hash(config) ||
                    proof.ownerConfigHash !== hash(ownerConfig) || proof.benchmarkActive !== instrumented || !Array.isArray(proof.enabledIds) ||
                    !Array.isArray(proof.scene) || proof.scene.length !== 4 || proof.scene.some(Boolean) || !proof.errorTotals || !context.initialErrors ||
                    Object.entries(proof.errorTotals || {}).some(([id, count]) => count > (context.initialErrors?.[id] || 0)) ||
                    Object.keys(overrides).some(key => !context.registeredKeys.includes(key))) errors.push("configuration/registry/instrumentation proof failed: " + key);
                if (context.keyboardEvidence) {
                    const expected = Number(config.ENABLE_KEYBOARD_OVERLAY) === 1;
                    const keyboard = proof.keyboard, state = keyboard?.observed;
                    const controls = condition.keyboard?.[window.side], hidden = controls?.hideRoot || false;
                    if (keyboard?.expectedEnabled !== expected || (expected ? state?.active !== true || state.rootPresent !== true || state.rootVisible !== !hidden ||
                        state.attached !== true || state.ready !== !hidden || !Number.isSafeInteger(state.generation) || state.generation <= 0 ||
                        state.full !== (Number(config.ENABLE_FULL_KEYBOARD_LAYOUT) === 1) :
                        state?.inactive !== true || state.tree !== true || state.styles !== true || state.rootPresent !== false)) errors.push("keyboard native presence/retirement proof failed: " + key);
                    if (controls && (keyboard?.pollingPaused !== controls.pausePolling || expected && (state?.stylesReady !== true ||
                        state.controls?.hideRoot !== hidden || state.controls?.composition !== controls.composition || state.composition !== controls.composition ||
                        !Number.isSafeInteger(state.updates) || state.updates < 0 || !hidden && (state.glyphsReady !== true ||
                        !/^[0-9a-f]{8}$/.test(glyphReference || "") || keyboard.glyphReference !== glyphReference || state.glyphWorkload !== glyphReference) ||
                        !/^[0-9a-f]{8}$/.test(state.glyphWorkload || "") ||
                        !/^[0-9a-f]{8}$/.test(state.glyphEpoch || "") || state.census?.complete !== true ||
                        !["selected", "hidden"].every(side => ["bindings", "payloads", "unbound", "holdActions", "pressed"].every(key =>
                            Number.isSafeInteger(state.census[side]?.[key]) && state.census[side][key] >= 0)) || state.census.selected.bindings <= 0 ||
                        !hidden && state.census.selected.payloads <= 0))) errors.push("keyboard diagnostic controls proof failed: " + key);
                }
                if (!Number.isFinite(proof.at) || (index ? proof.at < window.endAt || proof.at - window.endAt > 1500 : proof.at > window.startAt || window.startAt - proof.at > 1500)) errors.push("state proof outside window boundary");
            }
            if (proofs.every(Boolean) && (stable(proofs[0].enabledIds) !== stable(proofs[1].enabledIds) || proofs[0].ownerConfigHash !== proofs[1].ownerConfigHash)) errors.push("owner coverage/config changed inside sampling window");
            if (context.keyboardEvidence && proofs.every(Boolean) && proofs[0].keyboard?.expectedEnabled &&
                proofs[0].keyboard?.observed?.generation !== proofs[1].keyboard?.observed?.generation) errors.push("keyboard generation changed inside sampling window");
            if (condition.keyboard && proofs.every(Boolean) && proofs[0].keyboard?.expectedEnabled) {
                const start = proofs[0].keyboard?.observed, end = proofs[1].keyboard?.observed;
                if (!start || !end || start.glyphEpoch !== end.glyphEpoch || start.glyphWorkload !== end.glyphWorkload ||
                    (condition.keyboard[window.side].pausePolling ? start.updates !== end.updates : end.updates <= start.updates)) {
                    errors.push("keyboard update counter proof failed inside sampling window");
                }
            }
            const summary = { ...summarizeWindow(frames, focus, window, meta.processId), side: window.side,
                beforeProof: window.beforeProof, afterProof: window.afterProof,
                enabledIds: proofs[0]?.enabledIds, registeredOverrides: proofs[0]?.registeredOverrides, work: proofs[1]?.work,
                ...(context.keyboardEvidence ? { keyboard: { before: proofs[0]?.keyboard, after: proofs[1]?.keyboard } } : {}) };
            if (summary.quality !== "comparable") errors.push(summary.quality);
            return summary;
        }).filter(Boolean).sort((a, b) => a.phase - b.phase);
        const a = summaries.filter(window => window.side === "A"), b = summaries.filter(window => window.side === "B");
        const referenceMs = mean(a.map(window => window.meanMs)), excludedMs = mean(b.map(window => window.meanMs));
        const pairDrift = (windows, average) => ({ meansMs: windows.map(window => window.meanMs),
            percent: windows.length === 2 && average > 0 ? Math.abs(windows[0].meanMs - windows[1].meanMs) / average * 100 : null });
        const withinBlockDrift = { A: pairDrift(a, referenceMs), B: pairDrift(b, excludedMs) };
        if (a.length === 2 && b.length === 2 && [referenceMs, excludedMs].every(value => value > 0) &&
            (Math.abs(a[0].meanMs - a[1].meanMs) / referenceMs > 0.1 || Math.abs(b[0].meanMs - b[1].meanMs) / excludedMs > 0.1)) errors.push("within-block drift exceeds 10%");
        return { ...block, status: errors.length ? observed.length ? "invalid" : "not_run" : "valid", errors: [...new Set(errors)],
            windows: summaries, referenceMs, excludedMs, withinBlockDrift, effectMs: errors.length ? null : referenceMs - excludedMs };
    });
    const shams = blocks.filter(block => block.conditionId === "sham" && block.status === "valid");
    const noiseMs = shams.length >= 2 ? Math.max(...shams.map(block => Math.abs(block.effectMs))) : null;
    const rows = plan.conditions.map(condition => {
        const own = blocks.filter(block => block.conditionId === condition.id), valid = own.filter(block => block.status === "valid");
        const effects = valid.map(block => block.effectMs), effectMs = mean(effects), referenceMs = mean(valid.map(block => block.referenceMs)), excludedMs = mean(valid.map(block => block.excludedMs));
        const margin = valid.length === 3 && noiseMs !== null ? 4.303 * Math.sqrt(effects.reduce((sum, value) => sum + (value - effectMs) ** 2, 0) / 2 / 3) + noiseMs : null;
        const lowerMs = margin === null ? null : effectMs - margin, upperMs = margin === null ? null : effectMs + margin;
        const drift = valid.length > 1 && (Math.max(...valid.map(block => block.referenceMs)) - Math.min(...valid.map(block => block.referenceMs))) / referenceMs > 0.15;
        const status = !valid.length ? own.every(block => block.status === "not_run") ? "not_run" : "invalid" :
            margin === null || drift ? "inconclusive" : lowerMs > 0 && effects.every(value => value > 0) ? "effect_detected" :
                upperMs < 0 && effects.every(value => value < 0) ? "regression_detected" : "inconclusive";
        return { ...condition, blocks: own, validBlocks: valid.length, status, effectMs, lowerMs, upperMs, drift, referenceMs, excludedMs,
            referenceFps: referenceMs ? 1000 / referenceMs : null, excludedFps: excludedMs ? 1000 / excludedMs : null };
    });
    const app = packets.get("app-restoration"), runner = packets.get("runner-restoration");
    const restoration = { runner, app, configRestored: !app?.expectedConfig || !app.actualConfig || app.status === "successor-owned" ? null :
        !app.successorActive && !app.stressLeaseActive && stable(app.expectedConfig) === stable(app.actualConfig) };
    const loaded = context.loadedFunctionFingerprints || {}, local = meta.sourceIdentity?.loadedFunctionFingerprints || {};
    const matches = Object.fromEntries(Object.entries(loaded).map(([key, value]) => [key, local[key] ? local[key] === value : null]));
    return { kind: "config-suite", reason: meta.reason, context, rows, noiseMs, restoration, packetErrors: Object.fromEntries(packetErrors),
        sourceIdentity: meta.sourceIdentity, gameIdentity: meta.gameIdentity, sourceMatches: matches,
        coverage: { plannedBlocks: blocks.length, validBlocks: blocks.filter(block => block.status === "valid").length,
            invalidBlocks: blocks.filter(block => block.status === "invalid").length, notRun: blocks.filter(block => block.status === "not_run").length } };
}

function formatConfig(result) {
    if (result.setupFailure) return ["=== QOLLOCK native Expanded Config preflight FAILED ===", result.setupFailure.error,
        "No trial windows were accepted. Fix the baseline before starting a long capture.",
        "Restoration: configRestored=" + result.restoration.configRestored,
        "Failure evidence=" + JSON.stringify(result.setupFailure), "Source=" + JSON.stringify(result.sourceIdentity || null)].join("\n");
    const f = value => value === null || value === undefined ? "n/a" : value.toFixed(3);
    const { context } = result;
    const lines = ["=== QOLLOCK native Expanded Config investigation ===", "Result=" + result.reason,
        `Process=${result.processId}; swap chain=${result.swapChain}; native frames=${result.nativeFrames}; clock drift=${f(result.clockDriftMs)}ms`,
        "PresentMon graphics Present events, not UI dispatch cadence. Display FPS and CPU/GPU busy are context, not code attribution.",
        "A/B: Expanded settings with quiet benchmark accounting; only the listed settings, accounting or explicit keyboard diagnostic controls change.",
        "Every selected condition has three separated ABBA/BAAB blocks; positive ms means B is faster. Bounds: exploratory t95 across blocks + worst sham A/A effect; not familywise confidence.",
        "Conditional effects overlap and must not be summed. Changed visual workload is part of each intervention.",
        "An inactive gameplay path or inconclusive effect never clears a feature. Canonical config is not vanilla.",
        "Proof scope: " + context.proofScope,
        "Keyboard native root/retirement evidence=" + !!context.keyboardEvidence,
        ...(context.plan.conditions.some(row => row.keyboard) ? [
            "Keyboard visibility measures visible-dependent native work; collapse can affect native binding updates as well as rendering.",
            "Keyboard composition is a creation request on the bounded box, not proof of a hardware cache hit.",
            "Keyboard census is sampled outside windows; unbound glyphs may carry the native infinite animation. Counts alone do not attribute frame cost."
        ] : []),
        "Coverage=" + JSON.stringify(result.coverage) + "; sham noise=" + f(result.noiseMs) + "ms",
        "Source=" + JSON.stringify(result.sourceIdentity ? { git: result.sourceIdentity.git, sha256: result.sourceIdentity.sha256 } : null),
        "Loaded selected function matches=" + JSON.stringify(result.sourceMatches), "Game=" + JSON.stringify(result.gameIdentity || null),
        "Restoration: configRestored=" + result.restoration.configRestored + "; runner=" + JSON.stringify(result.restoration.runner),
        "Packet errors=" + JSON.stringify(result.packetErrors), "Expanded=" + JSON.stringify(context.baseline), "canonical=" + JSON.stringify(context.canonical),
        "No canonical value; not intervened=" + context.plan.unavailableKeys.join(","), ""];
    const detected = result.rows.filter(row => row.id !== "sham" && row.status === "effect_detected").sort((a, b) => b.effectMs - a.effectMs);
    lines.push("Detected native improvements: " + (detected.map(row => row.id + " " + f(row.effectMs) + "ms; " + row.keys.join(",")).join(" | ") || "none confirmed; inspect invalid/inconclusive coverage"));
    if (Object.values(result.sourceMatches).some(value => value === false)) lines.push("SOURCE MISMATCH: do not attribute the observed runtime effect to the current local implementation.");
    for (const row of result.rows.slice().sort((a, b) => (b.effectMs ?? -Infinity) - (a.effectMs ?? -Infinity))) {
        lines.push(`${row.status.toUpperCase()} ${row.id}: ${f(row.effectMs)}ms [${f(row.lowerMs)},${f(row.upperMs)}]; Present FPS ${f(row.referenceFps)} -> ${f(row.excludedFps)}; valid=${row.validBlocks}/3; drift=${row.drift}`,
            "  " + row.question, "  Keys=" + JSON.stringify(row.patch) + "; Expanded values=" + JSON.stringify(Object.fromEntries(row.keys.map(key => [key, context.baseline[key]]))),
            "  Consumers=" + (row.owners.join(",") || "unregistered/shared whole-configuration control") + "; source=" + row.sources.join(","));
        if (row.consumerGroups) lines.push("  Consumer groups=" + JSON.stringify(row.consumerGroups),
            "  Mean Present interval: Expanded=" + f(row.referenceMs) + "ms; B=" + f(row.excludedMs) + "ms");
        if (row.keyboard) lines.push("  Keyboard intervention=" + JSON.stringify(row.keyboard));
        const observed = row.blocks.find(block => block.status === "valid");
        if (observed) {
            const a = observed.windows.find(window => window.side === "A").enabledIds;
            const b = observed.windows.find(window => window.side === "B").enabledIds;
            lines.push("  Observed registry: A=" + a.length + " B=" + b.length + "; disabled in B=" + a.filter(id => !b.includes(id)).join(",") +
                "; enabled in B=" + b.filter(id => !a.includes(id)).join(","));
        }
        for (const block of row.blocks) {
            lines.push(`  repeat=${block.repeat + 1} ${block.order.join("")} ${block.status} effect=${f(block.effectMs)}ms; ${block.errors.join("; ")}; A drift=${f(block.withinBlockDrift?.A.percent)}% B drift=${f(block.withinBlockDrift?.B.percent)}%`);
            for (const window of block.windows) lines.push(`    ${window.side} n=${window.samples} Present=${f(window.fps)}fps mean=${f(window.meanMs)}ms p95=${f(window.p95Ms)}ms displayed=${f(window.displayFps)}fps CPU busy=${f(window.cpuBusyMs)}ms GPU busy=${f(window.gpuBusyMs)}ms; ${window.quality}; normalized registered overrides=${JSON.stringify(window.registeredOverrides || {})}` +
                (context.keyboardEvidence ? "; keyboard=" + JSON.stringify(window.keyboard) : "") +
                (row.keyboard ? "; managed JS=" + JSON.stringify(window.work || null) : ""));
        }
    }
    lines.push("Available refinements (already compiled; no repack):");
    for (const row of context.plan.available) lines.push("  " + row.id + ": " + row.keys.join(",") + "; " + row.owners.join(","));
    lines.push("Repeat invalid/inconclusive IDs: " + result.rows.filter(row => row.id !== "sham" && !["effect_detected", "regression_detected"].includes(row.status)).map(row => row.id).join(","),
        ...(context.caveats || []));
    return lines.join("\n");
}
module.exports = { analyzeConfig, formatConfig };

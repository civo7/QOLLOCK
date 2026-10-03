"use strict";

// One capture contract for import, static audits and simulated HUD replay.
const crypto = require("node:crypto");

function inspectCapture(capture, { requireHud = false, allowSummary = false } = {}) {
    if (capture?.kind === "summary" && allowSummary) {
        if (!Number.isInteger(capture.panels) || capture.panels < 1 || !capture.byId || typeof capture.byId !== "object") {
            throw new Error("invalid aggregate capture");
        }
        const ids = new Map(Object.entries(capture.byId).map(([id, count]) => {
            if (!Number.isInteger(count) || count < 1) throw new Error("invalid aggregate ID count");
            return [id, Array.from({ length: Math.min(count, 3) }, () => ({ id, path: null, type: null, count }))];
        }));
        return { ids, classes: new Map(), panels: capture.panels,
            fidelity: { format: "summary", scope: capture.root, panels: capture.panels, classCoverage: "unavailable",
                scenario: capture.capturedFrom || null },
            notes: [...(capture.warnings || []), "aggregate inventory only; no ancestry or class data", ...(capture.end?.idsCapped ? ["ID inventory is capped; absence is unknown"] : [])] };
    }
    const root = capture && (capture.domTree || (typeof capture.root === "object" && capture.root));
    if (!capture || capture.kind === "summary" || !root || Array.isArray(root)) {
        throw new Error("a full per-panel tree is required; aggregate summaries contain no ancestry");
    }
    const meta = capture.meta || {};
    if (capture.format === "debugger-rows-v1" && (capture.version !== "4.0.0" ||
        meta.debuggerRowsComplete !== true || meta.treeValid !== true || meta.forestValid !== true ||
        meta.classCoverage !== "Debugger-rendered" || typeof meta.fullHudCapture !== "boolean")) {
        throw new Error("capture reports invalid native descriptions or incomplete reconstruction metadata; rebuild with the HUD-Dumper receiver before use");
    }
    if (meta.treeValid === false || meta.forestValid === false || meta.descriptionParseErrors?.length) {
        throw new Error("capture reports invalid native descriptions; rebuild with the HUD-Dumper receiver before use");
    }
    if (requireHud && !["Hud", "CitadelHudRoot"].includes(root.id)) {
        throw new Error("whole-HUD replay requires Hud or CitadelHudRoot; a focused subtree is only suitable for inspection");
    }
    const notes = (capture.warnings || []).map(w => "capture warning: " + w);
    const ids = new Map(), classes = new Map(), seen = new Set();
    const stack = [{ node: root, path: "0", depth: 0 }];
    let panels = 0, missingText = 0, incompleteClasses = 0, maxDepth = 0;
    let missingFlags = 0;
    while (stack.length) {
        const { node, path, depth } = stack.pop();
        if (!node || typeof node !== "object" || Array.isArray(node) || seen.has(node)) {
            throw new Error("capture has an invalid, repeated or cyclic panel");
        }
        seen.add(node);
        if (depth > 256 || ++panels > 100000) throw new Error("capture exceeds supported hierarchy limits");
        maxDepth = Math.max(maxDepth, depth);
        if (node.id !== undefined && typeof node.id !== "string" ||
            node.type !== undefined && typeof node.type !== "string" ||
            node.children !== undefined && !Array.isArray(node.children) ||
            node.classes !== undefined && (!Array.isArray(node.classes) || node.classes.some(c => typeof c !== "string")) ||
            node.text !== undefined && typeof node.text !== "string") {
            throw new Error("invalid panel fields at " + path);
        }
        if (node.attributes !== undefined && (!node.attributes || typeof node.attributes !== "object" || Array.isArray(node.attributes))) {
            throw new Error("invalid runtime attributes at " + path);
        }
        const location = { path, id: node.id || "", type: node.type || "Panel" };
        const add = (map, key) => {
            if (!key) return;
            if (!map.has(key)) map.set(key, []);
            map.get(key).push(location);
        };
        add(ids, node.id);
        for (const name of new Set(node.classes || [])) add(classes, name);
        if (!Array.isArray(node.classes) || node.classesStatus && !["read", "Debugger-rendered"].includes(node.classesStatus)) incompleteClasses++;
        if (["Label", "TextEntry"].includes(node.type) && typeof node.text !== "string") missingText++;
        if (["visible", "enabled"].some(key => typeof node[key] !== "boolean")) missingFlags++;
        if (node.childCount !== undefined && node.childCount !== (node.children || []).length) {
            notes.push("child-count mismatch at " + path + "; descendants are missing");
        }
        const children = node.children || [];
        for (let i = children.length - 1; i >= 0; i--) stack.push({ node: children[i], path: path + "/" + i, depth: depth + 1 });
    }
    if (capture.summary?.totalPanels !== undefined && capture.summary.totalPanels !== panels ||
        capture.panels !== undefined && capture.panels !== panels) {
        throw new Error("capture panel count differs from the selected hierarchy");
    }
    if (root.id === "CitadelHudRoot" && (root.children || []).filter(c => c.id === "Hud").length !== 1) {
        throw new Error("CitadelHudRoot capture has no direct Hud context or has ambiguous Hud contexts");
    }
    for (const key of ["truncated", "clipped", "skippedDestroyed", "repeatedPanels", "textTruncated", "remainingCollapsed", "unrepresentedBranches"]) {
        if (meta[key]) notes.push("capture " + key + ": " + meta[key]);
    }
    if (Object.values(meta.readErrors || {}).some(n => n > 0)) notes.push("native reads failed; inspect capture meta.readErrors");
    if (missingText) notes.push(missingText + " captured Labels/TextEntries lack text; value-dependent paths use empty model text");
    if (missingFlags) notes.push(missingFlags + " panels lack some visible/enabled state; replay uses simulator defaults");
    if (incompleteClasses || meta.classesIncomplete || meta.classCoverage === "partial") notes.push("class inventory is incomplete; absence of a class is unknown");
    if (capture.version === "2.0.0") notes.push("HUD-Dumper v2 class inventory may be limited to its probe whitelist; absent classes are not authoritative");
    if (capture.format === "debugger-rows-v1") {
        notes.push("Debugger-rendered descriptions; freshness and full live HUD coverage are unverified");
    }
    if (capture.durationMs !== undefined) notes.push("capture collection interval: " + capture.durationMs + "ms; values may come from different frames");
    notes.push("static hierarchy snapshot; native bindings, commands, gameplay, computed layout and CSS are not replayed");
    const fidelity = {
        format: capture.format || "panel-tree", version: capture.version || null,
        scope: root.id || root.type || "Panel", panels, maxDepth,
        classCoverage: meta.classCoverage || "unspecified", incompleteClasses, missingText, missingFlags,
        fullHudCapture: meta.fullHudCapture ?? null,
        descriptionFreshness: meta.descriptionFreshness || "unverified",
        durationMs: capture.durationMs ?? null, timestampUtc: capture.timestampUtc || null,
        scenario: capture.scenario || capture.label || capture.capturedFrom || null,
        fingerprint: crypto.createHash("sha256").update(JSON.stringify(root)).digest("hex"),
    };
    return { root, ids, classes, panels, maxDepth, notes: [...new Set(notes)], fidelity };
}

function comparisonIssues(current, previous) {
    const issues = [];
    const a = current.meta || {}, b = previous.meta || {};
    for (const key of ["treeSource", "treeFingerprint", "configMode", "configFingerprint", "warmupMs"]) {
        if (a[key] === undefined || b[key] === undefined || a[key] !== b[key]) issues.push("different or unknown " + key);
    }
    if (a.treeSource === "captured") {
        if (!a.captureFidelity?.fingerprint || a.captureFidelity.fingerprint !== b.captureFidelity?.fingerprint) issues.push("different or unknown captured hierarchy/state");
    } else {
        for (const key of ["players", "damageNumbers"]) if (a[key] !== b[key]) issues.push("different " + key);
    }
    for (const run of [current, previous]) {
        if (run.callbackErrors?.length || Object.values(run.registryErrorsEnd || {}).some(n => n > 0)) issues.push("run contains callback/registry errors");
    }
    if (JSON.stringify([...(current.enabledEnd || [])].sort()) !== JSON.stringify([...(previous.enabledEnd || [])].sort())) issues.push("different enabled feature coverage");
    return [...new Set(issues)];
}

module.exports = { inspectCapture, comparisonIssues };

// scripts/simulator/perf/counters.js
// =============================================================================
// Attributed operation counters for the Panorama simulator.
// =============================================================================
// WHY THIS EXISTS
//
// We cannot measure real GPU/C++ frame time from Node. What we CAN measure
// exactly is the thing that drives it: how much work the mod asks the engine to
// do, and who asks for it. Every finding in a Panorama perf investigation
// reduces to one of a handful of engine operations, and each has a known cost
// shape:
//
//   traverseNodes   — nodes visited by FindChildTraverse /
//                     FindChildrenWithClassTraverse. This is the headline
//                     number. Each is a C++ virtual call plus a string compare
//                     on the panel id, and a MISS visits the ENTIRE subtree.
//                     A miss on the HUD root is thousands of nodes.
//   styleWrites     — assignments to panel.style.*. In Panorama a style write
//                     marks the panel dirty and queues a re-layout of its
//                     subtree EVEN IF THE VALUE IS UNCHANGED. We therefore
//                     split these into `changed` and `redundant`; redundant
//                     writes are pure waste and the easiest win in the codebase.
//   classWrites     — AddClass/RemoveClass/SetHasClass. A class change on a
//                     panel forces style re-matching for it and its subtree.
//                     Also split changed/redundant.
//   attrReads/Writes— GetAttributeString/SetAttributeString, tracked with BYTES.
//                     The mod stores its whole serialized config in a panel
//                     attribute; reading a multi-KB string 20x/sec is a real
//                     cost that no call-count metric would expose.
//   textWrites      — label text assignment (changed/redundant). A changed text
//                     re-measures the font and re-lays out; a redundant one is
//                     free to avoid.
//   panelCreates /
//   panelDeletes    — runtime panel churn. Allocating C++ panels mid-teamfight
//                     is the most expensive single thing on this list per op.
//
// ATTRIBUTION
//
// Every op is charged to whatever label is currently on the stack (see
// `enter`/`exit`). The profiler wraps each old-system feature's update() and
// each manifest poll-loop callback, so the report reads "this feature did N
// tree-node visits per second", which is directly actionable. Ops that happen
// outside any wrapper land in "<unattributed>" — boot code, engine callbacks,
// and the core loop's own body.
//
// COST UNITS
//
// `costUnits` is a single composite number so we can say "this change made it
// 40% cheaper" and diff two runs. The weights are ESTIMATES, documented in
// WEIGHTS below, expressed in "one visited tree node" units. They are not
// measured against the engine and must not be presented as milliseconds. Their
// only job is to keep the ranking stable and honest: raw counters are always
// reported alongside, and any conclusion that flips when you nudge a weight is
// a conclusion you should draw from the raw counters instead.
// =============================================================================

"use strict";

/**
 * Relative cost of each op, in units of "one node visited during a tree walk".
 *
 * Rationale for each, so these can be argued with rather than trusted:
 *  - traverseNode 1: the baseline. A pointer deref + id string compare.
 *  - styleWriteChanged 25: dirties layout for the panel's subtree. Much more
 *    expensive than a tree-node visit but not catastrophic on its own.
 *  - styleWriteRedundant 20: nearly the same cost, because Panorama does not
 *    compare the old value before marking dirty. Slightly lower only because
 *    some property setters early-out on identical strings.
 *  - classWriteChanged 30: style re-match is more expensive than a layout dirty.
 *  - classWriteRedundant 2: SetHasClass with an unchanged value is cheap — the
 *    engine's class set is a hash lookup and it does not re-match on a no-op.
 *    (This is why "redundant class toggle" is a much weaker finding than
 *    "redundant style write", and the weights say so.)
 *  - attrRead/Write 5 + 0.02/byte: attribute maps are string-keyed hash lookups;
 *    the per-byte term captures the multi-KB config blob.
 *  - textWriteChanged 40: re-measures text with the font metrics, then re-lays
 *    out. One of the most expensive per-op items.
 *  - textWriteRedundant 2: the engine early-outs on an identical string.
 *  - panelCreate 400 / panelDelete 200: C++ object construction, style
 *    matching, and a layout pass for the new subtree.
 */
const WEIGHTS = {
    traverseNode: 1,
    styleWriteChanged: 25,
    styleWriteRedundant: 20,
    classWriteChanged: 30,
    classWriteRedundant: 2,
    attrRead: 5,
    attrWrite: 5,
    attrByte: 0.02,
    textWriteChanged: 40,
    textWriteRedundant: 2,
    panelCreate: 400,
    panelDelete: 200,
};

const OP_KEYS = [
    "traverseCalls",
    "traverseNodes",
    "traverseMisses",
    "classTraverseCalls",
    "classTraverseNodes",
    "styleWritesChanged",
    "styleWritesRedundant",
    "classWritesChanged",
    "classWritesRedundant",
    "attrReads",
    "attrReadBytes",
    "attrWrites",
    "attrWriteBytes",
    "textWritesChanged",
    "textWritesRedundant",
    "panelCreates",
    "panelDeletes",
];

const UNATTRIBUTED = "<unattributed>";

function blankBucket() {
    const b = { label: "", calls: 0 };
    for (const k of OP_KEYS) b[k] = 0;
    return b;
}

class Counters {
    constructor() {
        this.enabled = false;
        this.buckets = new Map();       // label -> bucket
        this._stack = [];
        /**
         * Traversals that missed, keyed by the id searched for, with the node
         * count they burned. A miss is the single most valuable thing this
         * harness can surface: it means the mod is walking the entire HUD tree
         * to find a panel that is not there, every single tick. Usually the fix
         * is "cache the negative result" or "stop looking when not in a match".
         */
        this.missesById = new Map();    // id -> {count, nodes, labels:Set}
        /** Style properties written redundantly, keyed "label|prop". */
        this.redundantStyleProps = new Map();
    }

    reset() {
        this.buckets.clear();
        this._stack.length = 0;
        this.missesById.clear();
        this.redundantStyleProps.clear();
    }

    /** Current attribution label. */
    get label() {
        return this._stack.length > 0 ? this._stack[this._stack.length - 1] : UNATTRIBUTED;
    }

    enter(label) {
        this._stack.push(label);
    }

    exit() {
        this._stack.pop();
    }

    /**
     * Run `fn` attributed to `label`. Restores the stack even if `fn` throws,
     * because the mod's own error boundaries swallow exceptions and we must not
     * leak a label into the next feature's budget.
     */
    around(label, fn) {
        this._stack.push(label);
        try {
            return fn();
        } finally {
            this._stack.pop();
        }
    }

    bucket(label) {
        let b = this.buckets.get(label);
        if (!b) {
            b = blankBucket();
            b.label = label;
            this.buckets.set(label, b);
        }
        return b;
    }

    add(key, n = 1) {
        if (!this.enabled) return;
        const b = this.bucket(this.label);
        b[key] += n;
    }

    /** Record a completed id traversal. */
    recordTraverse(id, nodes, hit) {
        if (!this.enabled) return;
        const b = this.bucket(this.label);
        b.traverseCalls += 1;
        b.traverseNodes += nodes;
        if (!hit) {
            b.traverseMisses += 1;
            const key = String(id);
            let m = this.missesById.get(key);
            if (!m) {
                m = { id: key, count: 0, nodes: 0, labels: new Set() };
                this.missesById.set(key, m);
            }
            m.count += 1;
            m.nodes += nodes;
            m.labels.add(this.label);
        }
    }

    recordClassTraverse(nodes) {
        if (!this.enabled) return;
        const b = this.bucket(this.label);
        b.classTraverseCalls += 1;
        b.classTraverseNodes += nodes;
    }

    recordStyleWrite(prop, changed) {
        if (!this.enabled) return;
        const b = this.bucket(this.label);
        if (changed) {
            b.styleWritesChanged += 1;
            return;
        }
        b.styleWritesRedundant += 1;
        const key = this.label + "|" + prop;
        this.redundantStyleProps.set(key, (this.redundantStyleProps.get(key) || 0) + 1);
    }

    /** Composite cost for one bucket, in "visited node" units. See WEIGHTS. */
    static costOf(b) {
        return (
            (b.traverseNodes + b.classTraverseNodes) * WEIGHTS.traverseNode +
            b.styleWritesChanged * WEIGHTS.styleWriteChanged +
            b.styleWritesRedundant * WEIGHTS.styleWriteRedundant +
            b.classWritesChanged * WEIGHTS.classWriteChanged +
            b.classWritesRedundant * WEIGHTS.classWriteRedundant +
            b.attrReads * WEIGHTS.attrRead +
            b.attrWrites * WEIGHTS.attrWrite +
            (b.attrReadBytes + b.attrWriteBytes) * WEIGHTS.attrByte +
            b.textWritesChanged * WEIGHTS.textWriteChanged +
            b.textWritesRedundant * WEIGHTS.textWriteRedundant +
            b.panelCreates * WEIGHTS.panelCreate +
            b.panelDeletes * WEIGHTS.panelDelete
        );
    }

    /** Flat, JSON-serializable snapshot. `seconds` normalizes to per-second. */
    snapshot(seconds) {
        const secs = seconds > 0 ? seconds : 1;
        const rows = [];
        const total = blankBucket();
        total.label = "<TOTAL>";

        for (const b of this.buckets.values()) {
            for (const k of OP_KEYS) total[k] += b[k];
            total.calls += b.calls;
            const cost = Counters.costOf(b);
            rows.push({ ...b, costUnits: cost, costPerSec: cost / secs });
        }
        rows.sort((x, y) => y.costUnits - x.costUnits);

        const misses = Array.from(this.missesById.values())
            .map((m) => ({ id: m.id, count: m.count, nodes: m.nodes, labels: Array.from(m.labels) }))
            .sort((a, b) => b.nodes - a.nodes);

        const redundant = Array.from(this.redundantStyleProps.entries())
            .map(([key, count]) => {
                const cut = key.lastIndexOf("|");
                return { label: key.slice(0, cut), prop: key.slice(cut + 1), count };
            })
            .sort((a, b) => b.count - a.count);

        return {
            seconds: secs,
            total: { ...total, costUnits: Counters.costOf(total), costPerSec: Counters.costOf(total) / secs },
            rows,
            misses,
            redundantStyleProps: redundant,
            weights: WEIGHTS,
        };
    }
}

module.exports = { Counters, WEIGHTS, OP_KEYS, UNATTRIBUTED };

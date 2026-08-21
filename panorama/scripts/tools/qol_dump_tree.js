// panorama/scripts/tools/qol_dump_tree.js
// =============================================================================
// QOLLOCK — real panel tree dump, for feeding the headless profiler real data
// =============================================================================
// WHY THIS EXISTS
//
// scripts/simulator/perf/hud_tree.js assembles its tree from layout XML plus
// hand-modelled guesses about what C++ creates at runtime. Every cost number the
// profiler reports is relative to that guess, and the guesses have been wrong in
// both directions: it ranked ql_nicknames at ~1% of mod cost while the in-game perf
// overlay measured it as the single most expensive feature (2.4ms avg, 9ms peak),
// and it ranked ql_showrank at 13.5% while the game measured 1-3ms total.
//
// A model built from our assumptions cannot falsify those assumptions. So capture
// the tree from a live match instead of modelling it.
//
// HOW IT IS USED
//
//   1. Dev Panel -> "Dump Tree" (the Panorama JS console is read-only, so the
//      trigger has to be a button; it rides the same QOL_DiagRequest token bridge
//      as Manifest Tests, with a "dt_" prefix).
//   2. Play a real match, press it, save the console log.
//   3. node scripts/import_tree_dump.js <log> -> writes a captured tree JSON.
//   4. node scripts/profile_hud.js --tree <json> profiles against the real thing.
//
// OUTPUT FORMAT — depth-first pre-order, tab separated:
//
//   [QOLTREE]\t<depth>\t<id>\t<paneltype>\t<classes>\t<childCount>
//
// Pre-order matters: a node's parent is the most recent line at depth-1, which makes
// the tree reconstructible from depth alone. A breadth-first dump is NOT
// reconstructible — sibling groups at the same depth cannot be attributed to their
// parents. Do not "optimise" this into a queue.
//
// Fields are tab separated because a class list is space separated, and "-" stands
// in for empty so every line has the same arity. childCount is emitted so the
// importer can detect a truncated or depth-clipped capture rather than silently
// producing a smaller tree.
// =============================================================================

(function() {
    "use strict";

    // A full HUD is tens of thousands of panels and every line is a $.Msg, so both
    // limits are real protection against a multi-hundred-MB log, not ceremony.
    var DEFAULT_MAX_DEPTH = 60;
    var HARD_MAX_DEPTH = 120;
    var DEFAULT_MAX_PANELS = 60000;
    var HARD_MAX_PANELS = 200000;

    function _alive(panel) {
        if (!panel) return false;
        try { return panel.IsValid ? panel.IsValid() : true; } catch (e) { return false; }
    }

    function _clamp(value, fallback, hardMax) {
        var n = Number(value);
        if (!isFinite(n) || n <= 0) n = fallback;
        if (n > hardMax) n = hardMax;
        return Math.floor(n);
    }

    /**
     * Walk the tree depth-first pre-order and emit one line per panel.
     *
     * @param {Panel}  root      Panel to start from. Defaults to the context panel,
     *                           which in the HUD context is #Hud itself.
     * @param {number} maxDepth  Depth cap (default 60, hard cap 120).
     * @param {number} maxPanels Panel cap (default 60000, hard cap 200000).
     * @returns {object} { panels, maxDepth, truncated, clipped }
     */
    function DumpTree(root, maxDepth, maxPanels) {
        var start = _alive(root) ? root : null;
        if (!start) {
            try { start = $.GetContextPanel(); } catch (e) { start = null; }
        }
        if (!_alive(start)) {
            $.Msg("[QOLTREE:ERROR] no valid root panel to dump");
            return { panels: 0, maxDepth: 0, truncated: false, clipped: false };
        }

        var depthCap = _clamp(maxDepth, DEFAULT_MAX_DEPTH, HARD_MAX_DEPTH);
        var panelCap = _clamp(maxPanels, DEFAULT_MAX_PANELS, HARD_MAX_PANELS);

        var emitted = 0;
        var deepest = 0;
        var truncated = false;
        var clipped = false;

        var rootId = "";
        try { rootId = start.id || "-"; } catch (e) { rootId = "-"; }
        $.Msg("[QOLTREE:START]\troot=" + (rootId || "-") +
              "\tdepthCap=" + depthCap +
              "\tpanelCap=" + panelCap);

        // Explicit stack, pre-order. Children are pushed in reverse so they pop in
        // document order, which is what makes the output match the visual tree.
        var stack = [[start, 0]];
        while (stack.length > 0) {
            if (emitted >= panelCap) { truncated = true; break; }

            var frame = stack.pop();
            var panel = frame[0];
            var depth = frame[1];
            if (!_alive(panel)) continue;

            if (depth > deepest) deepest = depth;

            var id = "";
            try { id = panel.id || ""; } catch (e) { id = ""; }

            var type = "";
            try { type = panel.paneltype || ""; } catch (e) { type = ""; }

            var classes = "";
            try {
                // GetClasses() returns a space-joined string — ql_core.js:1285 reads it
                // the same way. There is no GetClassNames(); do not reintroduce one.
                if (panel.GetClasses) classes = String(panel.GetClasses() || "");
            } catch (e) { classes = ""; }

            var childCount = 0;
            try { if (panel.GetChildCount) childCount = panel.GetChildCount(); } catch (e) { childCount = 0; }

            $.Msg("[QOLTREE]\t" + depth +
                  "\t" + (id || "-") +
                  "\t" + (type || "-") +
                  "\t" + (classes || "-") +
                  "\t" + childCount);
            emitted++;

            if (depth >= depthCap) {
                if (childCount > 0) clipped = true;
                continue;
            }
            for (var i = childCount - 1; i >= 0; i--) {
                var child = null;
                try { child = panel.GetChild(i); } catch (e) { child = null; }
                if (_alive(child)) stack.push([child, depth + 1]);
            }
        }

        $.Msg("[QOLTREE:END]\tpanels=" + emitted +
              "\tmaxDepth=" + deepest +
              "\ttruncated=" + (truncated ? "1" : "0") +
              "\tclipped=" + (clipped ? "1" : "0"));

        return { panels: emitted, maxDepth: deepest, truncated: truncated, clipped: clipped };
    }

    /**
     * Aggregate summary — the mode you actually want on a real HUD.
     *
     * GROUND TRUTH, 2026-08-21: a live match HUD is 37,524 panels. A full per-panel
     * dump of that is ~3MB of console output, and the game's console log is a rolling
     * buffer — the capture arrived with 2,152 of 37,524 lines and even the START line
     * had scrolled out. A full dump is therefore only usable on small subtrees.
     *
     * What the profiler actually needs is not every panel: it needs the SIZE of the
     * tree, its depth profile, and the id distribution — because a FindChildTraverse
     * hit stops at its target while a miss visits every node, so the cost of a lookup
     * is decided by how many panels exist and whether the id exists at all.
     *
     * All of that is a few hundred lines instead of tens of thousands.
     *
     * Per-id output is capped and sorted by count, because a real tree has thousands
     * of distinct ids and the long tail of unique ones tells us nothing a total does
     * not. The cap being hit is reported rather than hidden.
     */
    function DumpTreeSummary(root, maxIds) {
        var start = _alive(root) ? root : null;
        if (!start) {
            try { start = $.GetContextPanel(); } catch (e) { start = null; }
        }
        if (!_alive(start)) {
            $.Msg("[QOLSUM:ERROR] no valid root panel to summarise");
            return null;
        }

        var idCap = _clamp(maxIds, 400, 4000);

        var total = 0;
        var deepest = 0;
        var noId = 0;
        var byDepth = {};
        var byId = {};
        var byType = {};

        var stack = [[start, 0]];
        while (stack.length > 0) {
            var frame = stack.pop();
            var panel = frame[0];
            var depth = frame[1];
            if (!_alive(panel)) continue;

            total++;
            if (depth > deepest) deepest = depth;
            byDepth[depth] = (byDepth[depth] || 0) + 1;

            var id = "";
            try { id = panel.id || ""; } catch (e) { id = ""; }
            if (id) byId[id] = (byId[id] || 0) + 1; else noId++;

            var type = "";
            try { type = panel.paneltype || ""; } catch (e) { type = ""; }
            if (type) byType[type] = (byType[type] || 0) + 1;

            var childCount = 0;
            try { if (panel.GetChildCount) childCount = panel.GetChildCount(); } catch (e) { childCount = 0; }
            for (var i = childCount - 1; i >= 0; i--) {
                var child = null;
                try { child = panel.GetChild(i); } catch (e) { child = null; }
                if (_alive(child)) stack.push([child, depth + 1]);
            }
        }

        var rootId = "";
        try { rootId = start.id || "-"; } catch (e) { rootId = "-"; }

        $.Msg("[QOLSUM:START]\troot=" + (rootId || "-") +
              "\tpanels=" + total +
              "\tmaxDepth=" + deepest +
              "\tanonymous=" + noId);

        for (var d = 0; d <= deepest; d++) {
            $.Msg("[QOLSUM:DEPTH]\t" + d + "\t" + (byDepth[d] || 0));
        }

        // Sort descending by count so the cap keeps what matters.
        function sortedPairs(map) {
            var keys = [];
            for (var k in map) { if (map.hasOwnProperty(k)) keys.push(k); }
            keys.sort(function(a, b) { return map[b] - map[a]; });
            return keys;
        }

        var typeKeys = sortedPairs(byType);
        for (var t = 0; t < typeKeys.length && t < idCap; t++) {
            $.Msg("[QOLSUM:TYPE]\t" + typeKeys[t] + "\t" + byType[typeKeys[t]]);
        }

        var idKeys = sortedPairs(byId);
        var idsEmitted = Math.min(idKeys.length, idCap);
        for (var n = 0; n < idsEmitted; n++) {
            $.Msg("[QOLSUM:ID]\t" + idKeys[n] + "\t" + byId[idKeys[n]]);
        }

        $.Msg("[QOLSUM:END]\tpanels=" + total +
              "\tdistinctIds=" + idKeys.length +
              "\tidsEmitted=" + idsEmitted +
              "\tidsCapped=" + (idKeys.length > idsEmitted ? "1" : "0") +
              "\tdistinctTypes=" + typeKeys.length);

        return { panels: total, maxDepth: deepest, distinctIds: idKeys.length, idsEmitted: idsEmitted };
    }

    if (typeof QOL !== "undefined" && QOL) {
        QOL.dumpTree = DumpTree;
        QOL.dumpTreeSummary = DumpTreeSummary;
    } else {
        $.Msg("[QOLTREE:ERROR] QOL namespace missing — load order is wrong, tree dump unavailable");
    }
})();

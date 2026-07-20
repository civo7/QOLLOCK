// ql_perf_overlay.js — Performance HUD overlay for QOLLOCK
// Loaded AFTER ql_utils.js and BEFORE ql_core.js via hud.xml
(function () {
    "use strict";

    // ---- dependency guards ----
    if (typeof $ === "undefined" || typeof $.CreatePanel !== "function") return;
    if (typeof Date === "undefined" || typeof Date.now !== "function") return;

    // QOL.import() available — ql_shared_presets.js loads before us in hud.xml
    var _deps = QOL.import(["utils"]);
    if (!_deps.utils || typeof _deps.utils.IsPanelValid !== "function") return;

    var IsPanelValid = _deps.utils.IsPanelValid;
    var SetPanelVisibility = _deps.utils.SetPanelVisibility;

    // ---- module-scoped state ----
    var _overlayPanel = null;
    var _titleLabel = null;
    var _bodyLabel = null;
    var _wasVisible = false;
    var _alertCooldowns = {};

    // ---- 60-second rolling window ----
    var ROLLING_WINDOW_MS = 60000;
    var MAX_SNAPSHOTS = 12; // 12 × ~5s = 60s
    var _windowSnapshots = [];   // [{ timeMs, entries: { name: {total, count, max} } }]
    var _prevTotalCount = -1;    // total count across all features last tick
    var _prevEntries = null;     // shallow copy of perfStats entries from last tick

    // ---- helpers ----

    /**
     * Walk up from $.GetContextPanel() to find the "Hud" root panel.
     * Adapted from QLC's _resolveHud() and QoL Lock's GetUIRoot() pattern.
     */
    function _resolveHud() {
        try {
            if (typeof $.GetContextPanel !== "function") return null;
            var ctx = $.GetContextPanel();
            if (!ctx || !IsPanelValid(ctx)) return null;

            // Walk to absolute root
            while (ctx.GetParent && typeof ctx.GetParent === "function") {
                var parent = ctx.GetParent();
                if (!parent || !IsPanelValid(parent)) break;
                ctx = parent;
            }

            // Find the Hud panel by traversal
            if (ctx.FindChildTraverse && typeof ctx.FindChildTraverse === "function") {
                return ctx.FindChildTraverse("Hud") || null;
            }
            return null;
        } catch (e) {
            return null;
        }
    }

    /**
     * Lazy-create the overlay panel tree:
     *   Hud
     *    └── QOL_PerfOverlay (Panel)    ← container, dark bg, positioned top-left
     *         ├── QOL_PerfTitle (Label)  ← "Perf" header
     *         └── QOL_PerfBody (Label)   ← multi-line perf data
     *
     * Returns the container panel, or null if creation fails.
     */
    function _ensureOverlay() {
        // Return cached if still alive
        if (_overlayPanel && IsPanelValid(_overlayPanel)) {
            return _overlayPanel;
        }

        // Stale — null out children too
        _overlayPanel = null;
        _titleLabel = null;
        _bodyLabel = null;

        var hud = _resolveHud();
        if (!hud) return null;

        try {
            // Container panel
            _overlayPanel = $.CreatePanel("Panel", hud, "QOL_PerfOverlay", {
                hittest: "false",
                hittestchildren: "false"
            });
            if (!_overlayPanel || !IsPanelValid(_overlayPanel)) {
                _overlayPanel = null;
                return null;
            }

            // Inline styling — matches QoL Lock convention (no CSS file)
            _overlayPanel.style.x = "10px";
            _overlayPanel.style.y = "80px";
            _overlayPanel.style.width = "fit-children";
            _overlayPanel.style.flowChildren = "down";
            // Phase 8.6: Use class toggle — inline style would override SetPanelVisibility.
            if (_overlayPanel.SetHasClass) _overlayPanel.SetHasClass("qol-hidden", true); else _overlayPanel.style.visibility = "collapse";
            _overlayPanel.style.zIndex = "1000";
            _overlayPanel.style.backgroundColor = "rgba(0, 0, 0, 0.65)";
            _overlayPanel.style.padding = "8px 10px 6px 10px";
            _overlayPanel.style.borderRadius = "4px";
            _overlayPanel.style.boxShadow = "fill rgba(0, 0, 0, 0.30) 0px 2px 8px 0px";

            // Title label
            _titleLabel = $.CreatePanel("Label", _overlayPanel, "QOL_PerfTitle", {
                text: "Perf"
            });
            if (_titleLabel && IsPanelValid(_titleLabel)) {
                _titleLabel.style.fontSize = "14px";
                _titleLabel.style.fontWeight = "bold";
                _titleLabel.style.color = "#ffcc00";
                _titleLabel.style.marginBottom = "4px";
            }

            // Body label (multi-line)
            _bodyLabel = $.CreatePanel("Label", _overlayPanel, "QOL_PerfBody", {
                text: ""
            });
            if (_bodyLabel && IsPanelValid(_bodyLabel)) {
                _bodyLabel.style.fontSize = "12px";
                _bodyLabel.style.color = "#cccccc";
                _bodyLabel.style.lineHeight = "1.4";
                _bodyLabel.style.whiteSpace = "normal";
                _bodyLabel.style.fontFamily = "oracle";
            }

            return _overlayPanel;
        } catch (e) {
            _overlayPanel = null;
            _titleLabel = null;
            _bodyLabel = null;
            return null;
        }
    }

    /**
     * Sum the .count of every entry in a perfStats-like object.
     * Used to detect 5s window resets: within a window counts only increase,
     * so a drop means a new window started.
     */
    function _sumFeatureCallCounts(stats) {
        if (!stats) return 0;
        var keys = Object.keys(stats);
        var total = 0;
        for (var i = 0; i < keys.length; i++) {
            var entry = stats[keys[i]];
            if (entry && entry.count > 0) total += entry.count;
        }
        return total;
    }

    /**
     * Shallow-copy each entry from a perfStats-like object so we own the values.
     * Returns null when stats is empty.
     */
    function _copyEntries(stats) {
        if (!stats) return null;
        var keys = Object.keys(stats);
        if (keys.length === 0) return null;
        var copy = {};
        for (var i = 0; i < keys.length; i++) {
            var k = keys[i];
            var entry = stats[k];
            if (entry && entry.count > 0) {
                copy[k] = { total: entry.total, count: entry.count, max: entry.max };
            }
        }
        return Object.keys(copy).length > 0 ? copy : null;
    }

    /**
     * Detect whether the 5s perf window just reset and, if so, push the
     * previous window's completed snapshot into the ring buffer.
     */
    function _captureWindowSnapshots(stats, nowMs) {
        var curTotal = _sumFeatureCallCounts(stats);
        var curEntries = _copyEntries(stats);

        // Detect reset: total count dropped → previous window is complete
        if (_prevTotalCount > 0 && curTotal < _prevTotalCount && _prevEntries) {
            _windowSnapshots.push({ timeMs: nowMs, entries: _prevEntries });
            // Keep buffer bounded
            while (_windowSnapshots.length > MAX_SNAPSHOTS) {
                _windowSnapshots.shift();
            }
        }

        _prevTotalCount = curTotal;
        _prevEntries = curEntries;

        // Prune snapshots older than ROLLING_WINDOW_MS
        var cutoff = nowMs - ROLLING_WINDOW_MS;
        while (_windowSnapshots.length > 0 && _windowSnapshots[0].timeMs < cutoff) {
            _windowSnapshots.shift();
        }
    }

    /**
     * Merge all snapshots in the ring buffer + the current live window
     * into a single flat { name: {total, count, max} } map.
     * Returns null when there is no data at all.
     */
    function _mergeRollingStats(curStats) {
        var merged = {};

        // Helper: add one entry into merged
        function _add(name, entry) {
            var m = merged[name];
            if (!m) {
                m = { total: 0, count: 0, max: 0 };
                merged[name] = m;
            }
            m.total += entry.total;
            m.count += entry.count;
            if (entry.max > m.max) m.max = entry.max;
        }

        // Add completed snapshots
        for (var i = 0; i < _windowSnapshots.length; i++) {
            var snap = _windowSnapshots[i];
            var snapKeys = Object.keys(snap.entries);
            for (var j = 0; j < snapKeys.length; j++) {
                var name = snapKeys[j];
                _add(name, snap.entries[name]);
            }
        }

        // Add current live window
        if (curStats) {
            var liveKeys = Object.keys(curStats);
            for (var k = 0; k < liveKeys.length; k++) {
                var liveName = liveKeys[k];
                var liveEntry = curStats[liveName];
                if (liveEntry && liveEntry.count > 0) {
                    _add(liveName, liveEntry);
                }
            }
        }

        return Object.keys(merged).length > 0 ? merged : null;
    }

    // ---- export ----

    /**
     * Update the performance overlay. Called from ql_core.js loop() every tick (~5Hz).
     *
     * When ENABLE_PERF_OVERLAY=0: collapses the overlay panel (near-zero cost).
     * When ENABLE_PERF_OVERLAY=1:
     *   - Creates/locates the overlay panel
     *   - Applies opacity from PERF_OVERLAY_OPACITY
     *   - Accumulates 5s window snapshots into a 60s rolling buffer
     *   - Builds top-8 entries from the merged rolling stats, sorted by avg descending
     *   - Renders multi-line label text
     *   - Logs spike alerts to $.Msg when max > PERF_ALERT_THRESHOLD_MS (5s cooldown per feature)
     *
     * @param {object} root      - The HUD root panel (unused, kept for API consistency)
     * @param {object} cfg       - The current config object (key → value)
     * @param {object} perfStats - State.perfStats: { name: { count, total, max, slow } }
     */
    function UpdateOverlay(root, cfg, perfStats) {
        try {
            var visible = !!(cfg && Number(cfg.ENABLE_PERF_OVERLAY) === 1);
            var stats = perfStats || {};
            var nowMs = Date.now();

            // Always track rolling window — even when overlay is hidden —
            // so data is current when the user re-enables it.
            _captureWindowSnapshots(stats, nowMs);

            // ---- hide path ----
            if (!visible) {
                if (_overlayPanel && IsPanelValid(_overlayPanel)) {
                    SetPanelVisibility(_overlayPanel, false);
                }
                _wasVisible = false;
                return;
            }

            // ---- show path ----
            var overlay = _ensureOverlay();
            if (!overlay) return;

            // Show if transitioning from hidden
            if (!_wasVisible) {
                SetPanelVisibility(overlay, true);
                _wasVisible = true;
            }

            // Apply opacity
            var opacity = (cfg && cfg.PERF_OVERLAY_OPACITY != null)
                ? Number(cfg.PERF_OVERLAY_OPACITY)
                : 0.75;
            var opacityStr = (opacity < 0.3 ? 0.3 : opacity > 1.0 ? 1.0 : opacity).toFixed(2);
            overlay.style.opacity = opacityStr;

            // Read alert threshold
            var threshold = (cfg && cfg.PERF_ALERT_THRESHOLD_MS != null)
                ? Number(cfg.PERF_ALERT_THRESHOLD_MS)
                : 10;

            // ---- merge rolling 60s window ----
            var merged = _mergeRollingStats(stats);

            if (!merged) {
                if (_titleLabel && IsPanelValid(_titleLabel)) {
                    _titleLabel.text = "Perf";
                }
                if (_bodyLabel && IsPanelValid(_bodyLabel)) {
                    _bodyLabel.text = "(no perf data)";
                }
                return;
            }

            // Compute avg for each entry and sort descending
            var mergedKeys = Object.keys(merged);
            var entries = [];
            for (var i = 0; i < mergedKeys.length; i++) {
                var k = mergedKeys[i];
                var entry = merged[k];
                if (!entry || entry.count <= 0) continue;
                var avg = entry.total / entry.count;
                entries.push({
                    name: k,
                    avg: avg,
                    max: entry.max,
                    count: entry.count
                });
            }
            entries.sort(function (a, b) {
                return b.avg - a.avg;
            });

            var topN = Math.min(8, entries.length);
            if (topN === 0) {
                if (_titleLabel && IsPanelValid(_titleLabel)) {
                    _titleLabel.text = "Perf";
                }
                if (_bodyLabel && IsPanelValid(_bodyLabel)) {
                    _bodyLabel.text = "(no perf data)";
                }
                return;
            }

            var lines = [];
            var topAvg = entries[0].avg;

            for (var j = 0; j < topN; j++) {
                var item = entries[j];

                // Truncate long names (>22 chars → 19 + "...")
                var shortName = item.name;
                if (shortName.length > 22) {
                    shortName = shortName.substring(0, 19) + "...";
                }

                // Render line: "name: avg X.Xms  max X.Xms  n=N"
                lines.push(
                    shortName + ": avg " + item.avg.toFixed(1) + "ms" +
                    "  max " + item.max.toFixed(1) + "ms" +
                    "  n=" + item.count
                );

                // ---- spike alert (throttled 5s per feature) ----
                if (item.max > threshold) {
                    var lastAlert = _alertCooldowns[item.name] || 0;
                    if (nowMs - lastAlert >= 5000) {
                        _alertCooldowns[item.name] = nowMs;
                        $.Msg(
                            "[QOLLock][Perf] ALERT: " + item.name +
                            " spiked to " + item.max.toFixed(1) + "ms" +
                            " (threshold=" + threshold + "ms)"
                        );
                    }
                }
            }

            // Update labels
            if (_titleLabel && IsPanelValid(_titleLabel)) {
                var titleText = "Perf  (" + topAvg.toFixed(1) + "ms avg";
                if (_windowSnapshots.length > 0) {
                    var windowSec = Math.min(60, Math.round((nowMs - _windowSnapshots[0].timeMs) / 1000));
                    titleText += ", " + windowSec + "s";
                }
                titleText += ")";
                _titleLabel.text = titleText;
            }
            if (_bodyLabel && IsPanelValid(_bodyLabel)) {
                _bodyLabel.text = lines.join("\n");
            }

        } catch (e) {
            // Never let a rendering error crash the main loop
            try {
                if (typeof $ !== "undefined" && $.Msg) {
                    $.Msg("[QOLLock][PerfOverlay] render error: " + (e && e.message ? e.message : String(e)));
                }
            } catch (ignore) {
                // absolutely silent
            }
        }
    }

    // ---- module export ----
    var exports = {
        UpdateOverlay: UpdateOverlay
    };

    if (typeof window !== "undefined") {
        window.QOL_PERF_OVERLAY = exports;
    } else if (typeof globalThis !== "undefined") {
        globalThis.QOL_PERF_OVERLAY = exports;
    }
})();

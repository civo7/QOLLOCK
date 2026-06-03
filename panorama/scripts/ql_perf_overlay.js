// ql_perf_overlay.js — Performance HUD overlay for QOLLOCK
// Loaded AFTER ql_utils.js and BEFORE ql_core.js via hud.xml
(function () {
    "use strict";

    // ---- dependency guards ----
    if (typeof $ === "undefined" || typeof $.CreatePanel !== "function") return;
    if (typeof QOL_UTILS === "undefined" || typeof QOL_UTILS.IsPanelValid !== "function") return;
    if (typeof Date === "undefined" || typeof Date.now !== "function") return;

    var IsPanelValid = QOL_UTILS.IsPanelValid;
    var SetPanelVisibility = QOL_UTILS.SetPanelVisibility;

    // ---- module-scoped state ----
    var _overlayPanel = null;
    var _titleLabel = null;
    var _bodyLabel = null;
    var _wasVisible = false;
    var _alertCooldowns = {};

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
            _overlayPanel.style.visibility = "collapse";
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

    // ---- export ----

    /**
     * Update the performance overlay. Called from ql_core.js loop() every tick (~5Hz).
     *
     * When ENABLE_PERF_OVERLAY=0: collapses the overlay panel (near-zero cost).
     * When ENABLE_PERF_OVERLAY=1:
     *   - Creates/locates the overlay panel
     *   - Applies opacity from PERF_OVERLAY_OPACITY
     *   - Builds top-8 entries from perfStats, sorted by avg descending
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

            // Build perf text from State.perfStats
            var stats = perfStats || {};
            var keys = Object.keys(stats);

            if (keys.length === 0) {
                if (_titleLabel && IsPanelValid(_titleLabel)) {
                    _titleLabel.text = "Perf";
                }
                if (_bodyLabel && IsPanelValid(_bodyLabel)) {
                    _bodyLabel.text = "(no perf data)";
                }
                return;
            }

            // Compute avg for each entry and sort descending
            var entries = [];
            for (var i = 0; i < keys.length; i++) {
                var k = keys[i];
                var entry = stats[k];
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
            var nowMs = Date.now();
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
                _titleLabel.text = "Perf  (" + topAvg.toFixed(1) + "ms avg)";
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

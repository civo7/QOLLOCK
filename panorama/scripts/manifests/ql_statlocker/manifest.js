// features/ql_statlocker/manifest.js
// =============================================================================
// QOLLOCK — Statlocker Profile Link Buttons
// =============================================================================
// OWNS:        "STAT" buttons on coreRating panels, account ID extraction,
//              statlocker.gg URL dispatch
// DOES NOT OWN: coreRating panels (Valve), statlocker.gg website
// DEPENDS ON:  QOL.core.FeatureRegistry, QOL.core.Scheduler
// CONFIG KEYS: ENABLE_STATLOCKER (toggle)
// PATTERN:     Polling (~1.2Hz). Scans for coreRating panels, injects
//              "STAT" buttons that open statlocker.gg profile pages.
// =============================================================================

(function() {
    "use strict";
    var FR = QOL.core.FeatureRegistry;
    if (!FR) { $.Msg("[QOLLock] statlocker: FeatureRegistry not found — aborting"); return; }

    FR.register({
        id: "ql_statlocker",
        enabledByDefault: false,
        settings: [
            { key: "ENABLE_STATLOCKER", type: "toggle", default: false }
        ],
        create: function(ctx) {
            var _loop = null;
            var SCAN_INTERVAL_MS = 1200;
            var SCAN_IDLE_MAX_MS = 6000;

            var _corePanels = [];
            var _buttons = [];
            var _scanMisses = 0;
            var _nextScanMs = 0;
            var _wasEnabled = false;

            function _alive(p) {
                return !!(p && typeof p.IsValid === "function" && p.IsValid());
            }

            function _listValid(list) {
                if (!list || list.length === 0) return false;
                for (var i = 0; i < list.length; i++) {
                    if (!_alive(list[i])) return false;
                }
                return true;
            }

            function _isLikelyAccountId(digits) {
                if (typeof digits !== "string" || digits.length < 7 || digits.length > 19) return false;
                return /^\d{7,19}$/.test(digits);
            }

            function _parseAccountId(text) {
                if (text === undefined || text === null) return "";
                var digits = String(text).replace(/[^0-9]/g, "");
                return _isLikelyAccountId(digits) ? digits : "";
            }

            function _findAccountIdInPanel(panel) {
                if (!panel || !panel.FindChildrenWithClassTraverse) return "";
                var labels = panel.FindChildrenWithClassTraverse("AccountID") || [];
                for (var i = 0; i < labels.length; i++) {
                    if (!labels[i]) continue;
                    var t = "";
                    try { t = labels[i].text ? String(labels[i].text) : ""; } catch(e) { t = ""; }
                    var id = _parseAccountId(t);
                    if (id) return id;
                }
                return "";
            }

            function _resolveAccountId(anchorPanel, root) {
                // Walk up ancestry from anchor
                var cur = anchorPanel, depth = 0;
                while (cur && depth < 10) {
                    var id = _findAccountIdInPanel(cur);
                    if (id) return id;
                    cur = cur.GetParent ? cur.GetParent() : null;
                    depth++;
                }
                // Try root and context panel
                var roots = [];
                if (_alive(root)) roots.push(root);
                var ctx = null;
                try { ctx = $.GetContextPanel ? $.GetContextPanel() : null; } catch(e) {}
                if (_alive(ctx)) roots.push(ctx);
                for (var r = 0; r < roots.length; r++) {
                    var rid = _findAccountIdInPanel(roots[r]);
                    if (rid) return rid;
                }
                // Fallback: build category payload
                try {
                    if (typeof QOL !== "undefined" && QOL.getAccountIdForBuildCategoryPayload) {
                        var payId = _parseAccountId(QOL.getAccountIdForBuildCategoryPayload(root));
                        if (payId) return payId;
                    }
                } catch(e) {}
                return "";
            }

            function _findDirectChild(parent, className) {
                if (!parent || !className || !parent.GetChildCount || !parent.GetChild) return null;
                var count = 0;
                try { count = parent.GetChildCount(); } catch(e) { count = 0; }
                for (var i = 0; i < count; i++) {
                    var child = null;
                    try { child = parent.GetChild(i); } catch(e) { child = null; }
                    if (!child || !child.BHasClass) continue;
                    if (child.BHasClass(className)) return child;
                }
                return null;
            }

            function _isTargetPanel(panel) {
                if (!panel || !panel.BHasClass || !panel.BHasClass("coreRating")) return false;
                var parent = panel.GetParent ? panel.GetParent() : null;
                if (parent && parent.FindChildTraverse && parent.FindChildTraverse("HeroRowBackground")) return true;
                if (panel.FindChildTraverse && panel.FindChildTraverse("HeroRowBackground")) return true;
                return false;
            }

            function _collectCorePanels(root) {
                var scanRoots = [];
                if (_alive(root)) scanRoots.push(root);
                var ctx = null;
                try { ctx = $.GetContextPanel ? $.GetContextPanel() : null; } catch(e) {}
                if (_alive(ctx) && scanRoots.indexOf(ctx) === -1) scanRoots.push(ctx);
                // Walk up ancestry to find broader scan roots (matches old behavior)
                var ancestor = ctx;
                for (var d = 0; d < 8 && ancestor; d++) {
                    ancestor = ancestor.GetParent ? ancestor.GetParent() : null;
                    if (!_alive(ancestor)) break;
                    if (scanRoots.indexOf(ancestor) === -1) scanRoots.push(ancestor);
                }
                var out = [];
                for (var i = 0; i < scanRoots.length; i++) {
                    var sr = scanRoots[i];
                    if (!sr || !sr.FindChildrenWithClassTraverse) continue;
                    var found = sr.FindChildrenWithClassTraverse("coreRating") || [];
                    for (var j = 0; j < found.length; j++) {
                        if (!_alive(found[j])) continue;
                        if (!_isTargetPanel(found[j])) continue;
                        if (out.indexOf(found[j]) === -1) out.push(found[j]);
                    }
                }
                return out;
            }

            function _styleButton(button, label) {
                if (!button) return;
                try {
                    button.style.flowChildren = "none";
                    button.style.horizontalAlign = "right";
                    button.style.verticalAlign = "center";
                    button.style.height = "22px";
                    button.style.minWidth = "44px";
                    button.style.marginLeft = "6px";
                    button.style.padding = "0px 8px";
                    button.style.backgroundColor = "gradient( linear, 0% 0%, 0% 100%, from( #171717 ), to( #111111 ) )";
                    button.style.border = "1px solid #66cc9930";
                    button.style.borderRadius = "4px";
                    button.style.boxShadow = "fill #66cc9920 0px 0px 4px 0px";
                } catch(e) {}
                if (!label) return;
                try {
                    label.style.horizontalAlign = "center";
                    label.style.verticalAlign = "center";
                    label.style.textAlign = "center";
                    label.style.fontSize = "14px";
                    label.style.fontWeight = "bold";
                    label.style.color = "#66cc99";
                    label.style.letterSpacing = "1px";
                    label.style.textShadow = "0px 0px 4px #66cc9930";
                } catch(e) {}
            }

            function _ensureButton(corePanel, root) {
                if (!_alive(corePanel)) return null;
                var btn = _findDirectChild(corePanel, "QOLStatlockerButton");
                if (!btn && $.CreatePanel) {
                    try {
                        btn = $.CreatePanel("Button", corePanel, "", { hittest: "true", hittestchildren: "false", acceptsfocus: "true" });
                    } catch(e) { btn = null; }
                    if (btn && btn.AddClass) btn.AddClass("QOLStatlockerButton");
                }
                if (!_alive(btn)) return null;

                var label = _findDirectChild(btn, "QOLStatlockerLabel");
                if (!label && $.CreatePanel) {
                    try { label = $.CreatePanel("Label", btn, ""); } catch(e) { label = null; }
                    if (label && label.AddClass) label.AddClass("QOLStatlockerLabel");
                }
                if (label && label.text !== "STAT") label.text = "STAT";
                _styleButton(btn, label);

                try {
                    btn.SetPanelEvent("onactivate", function() {
                        // Resolve root fresh at click time (panel tree may have changed since scan)
                        var clickRoot = $.GetContextPanel();
                        if (!_alive(clickRoot)) clickRoot = root;
                        var accountId = _resolveAccountId(corePanel, clickRoot);
                        if (accountId) $.DispatchEvent("ExternalBrowserGoToURL", "https://statlocker.gg/profile/" + accountId);
                    });
                } catch(e) {}

                return btn;
            }

            function _removeAll(root) {
                for (var i = 0; i < _buttons.length; i++) {
                    if (_alive(_buttons[i])) { try { _buttons[i].DeleteAsync(0); } catch(e) {} }
                }
                // Also scan for orphans on known panels
                for (var j = 0; j < _corePanels.length; j++) {
                    if (!_alive(_corePanels[j])) continue;
                    var child = _findDirectChild(_corePanels[j], "QOLStatlockerButton");
                    if (_alive(child)) { try { child.DeleteAsync(0); } catch(e) {} }
                }
                _buttons = []; _corePanels = []; _nextScanMs = 0; _scanMisses = 0;
            }

            function _getScanDelay(foundCount) {
                if (foundCount > 0) { _scanMisses = 0; return SCAN_INTERVAL_MS; }
                _scanMisses = Math.min(4, _scanMisses + 1);
                return Math.min(SCAN_IDLE_MAX_MS, SCAN_INTERVAL_MS * (1 + _scanMisses));
            }

            function _tick() {
                var enabled = Number(ctx.config.get("ENABLE_STATLOCKER")) === 1;
                if (!enabled) {
                    if (_wasEnabled) { _removeAll($.GetContextPanel()); }
                    _wasEnabled = false;
                    return;
                }

                var now = Date.now ? Date.now() : (new Date()).getTime();
                var root = $.GetContextPanel();
                if (!_alive(root)) return;

                // Re-scan when cache invalid OR timer expired
                var cacheValid = _listValid(_corePanels);
                if (!cacheValid || now >= _nextScanMs) {
                    _corePanels = _collectCorePanels(root);
                    _nextScanMs = now + _getScanDelay(_corePanels.length);
                }

                // Always ensure buttons on current panels (every tick)
                var liveButtons = [];
                for (var i = 0; i < _corePanels.length; i++) {
                    if (!_alive(_corePanels[i])) continue;
                    var btn = _ensureButton(_corePanels[i], root);
                    if (_alive(btn)) liveButtons.push(btn);
                }
                _buttons = liveButtons;
                _wasEnabled = true;
            }

            return {
                onEnable: function() {
                    var S = QOL.core.Scheduler;
                    _loop = S && S.createPollLoop ? S.createPollLoop(_tick, 1.2, "ql_statlocker") : null;
                },
                onDisable: function() {
                    if (_loop) { _loop.stop(); _loop = null; }
                    _removeAll($.GetContextPanel());
                    _wasEnabled = false;
                },
                onSettingsChanged: function() {}
            };
        }
    });
})();

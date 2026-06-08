// ql_feat_statlocker.js — Statlocker profile link buttons on coreRating panels
// Extracted from ql_core.js, Phase 9 Step 2c
(function() {
    'use strict';
    var _dk = "ql_feat_statlocker";
    var _deps = QOL.import(["getAccountIdForBuildCategoryPayload","getCachedPanel","getUIRoot","isPanelListValid","isStartupLoaderInActiveMatchContext","state","setCachedPanel","utils"]);
    var GC = _deps.getCachedPanel;
    var GUIR = _deps.getUIRoot;
    var S = _deps.state;
    var SC = _deps.setCachedPanel;
    var U = _deps.utils;
    var IsCfgEnabled = U.IsCfgEnabled;
    var IsPanelValid = U.IsPanelValid;
    var IsPanelListValid = U.IsPanelListValid;

    function ParseAccountIdDigitsFromText(rawText) {
        if (rawText === undefined || rawText === null) return "";
        var digits = String(rawText).replace(/[^0-9]/g, "");
        if (!digits || digits.length <= 0) return "";
        if (!IsLikelyAccountId(digits)) return "";
        return digits;
    }

    function FindStatlockerAccountIdLabelInPanel(panel) {
        if (!panel || !panel.FindChildrenWithClassTraverse) return "";
        var labels = panel.FindChildrenWithClassTraverse("AccountID") || [];
        for (var i = 0; i < labels.length; i++) {
            var label = labels[i];
            if (!label) continue;
            var text = "";
            try { text = label.text ? String(label.text) : ""; } catch (e0) { text = ""; }
            var accountId = ParseAccountIdDigitsFromText(text);
            if (accountId) return accountId;
        }
        return "";
    }

    function TryResolveStatlockerAccountId(anchorPanel, root) {
        var cur = anchorPanel;
        var depth = 0;
        while (cur && depth < 10) {
            var accountFromCur = FindStatlockerAccountIdLabelInPanel(cur);
            if (accountFromCur) return accountFromCur;
            cur = cur.GetParent ? cur.GetParent() : null;
            depth++;
        }

        var roots = [];
        if (IsPanelValid(root)) roots.push(root);
        var ctx = null;
        try { ctx = $.GetContextPanel ? $.GetContextPanel() : null; } catch (e1) { ctx = null; }
        if (IsPanelValid(ctx)) roots.push(ctx);
        var parent = ctx;
        for (var r = 0; r < 8 && parent; r++) {
            parent = parent.GetParent ? parent.GetParent() : null;
            if (!IsPanelValid(parent)) break;
            var duplicate = false;
            for (var k = 0; k < roots.length; k++) {
                if (roots[k] === parent) {
                    duplicate = true;
                    break;
                }
            }
            if (!duplicate) roots.push(parent);
        }

        for (var iRoot = 0; iRoot < roots.length; iRoot++) {
            var accountFromRoot = FindStatlockerAccountIdLabelInPanel(roots[iRoot]);
            if (accountFromRoot) return accountFromRoot;
        }

        var payloadAccountId = ParseAccountIdDigitsFromText(GetAccountIdForBuildCategoryPayload(root));
        if (payloadAccountId) return payloadAccountId;
        return "";
    }

    function FindDirectChildByClassName(parent, className) {
        if (!parent || !className || !parent.GetChildCount || !parent.GetChild) return null;
        var count = 0;
        try { count = parent.GetChildCount(); } catch (e0) { count = 0; }
        for (var i = 0; i < count; i++) {
            var child = null;
            try { child = parent.GetChild(i); } catch (e1) { child = null; }
            if (!child || !child.BHasClass) continue;
            if (child.BHasClass(className)) return child;
        }
        return null;
    }

    function IsStatlockerTargetPanel(panel) {
        if (!panel || !panel.BHasClass || !panel.BHasClass("coreRating")) return false;
        var parent = panel.GetParent ? panel.GetParent() : null;
        if (parent && parent.FindChildTraverse && parent.FindChildTraverse("HeroRowBackground")) return true;
        if (panel.FindChildTraverse && panel.FindChildTraverse("HeroRowBackground")) return true;
        return false;
    }

    function HasStatlockerContextHintInAncestry(panel) {
        var cur = panel;
        for (var depth = 0; depth < 8 && cur; depth++) {
            try {
                if (cur.BHasClass && (cur.BHasClass("coreRating") || cur.BHasClass("HeroRowBackground"))) return true;
            } catch (eClass) {}
            var idText = "";
            try { idText = cur.id ? String(cur.id).toLowerCase() : ""; } catch (eId) { idText = ""; }
            if (
                idText.indexOf("profile") !== -1 ||
                idText.indexOf("heroprofile") !== -1 ||
                idText.indexOf("hero_profile") !== -1 ||
                idText.indexOf("core_rating") !== -1 ||
                idText.indexOf("corerating") !== -1
            ) {
                return true;
            }
            cur = cur.GetParent ? cur.GetParent() : null;
        }
        return false;
    }

    function IsStatlockerDiscoveryContextActive(root) {
        if (IsPanelListValid(S.statlockerCorePanels) || IsPanelListValid(S.statlockerButtons)) return true;

        var ctx = null;
        try { ctx = $.GetContextPanel ? $.GetContextPanel() : null; } catch (eCtx) { ctx = null; }
        if (HasStatlockerContextHintInAncestry(ctx)) return true;
        if (HasStatlockerContextHintInAncestry(root)) return true;

        if (IsStartupLoaderInActiveMatchContext(root)) return false;
        return true;
    }

    function GetStatlockerScanDelay(foundCount) {
        var count = Number(foundCount) || 0;
        if (count > 0) {
            S.statlockerScanMisses = 0;
            return STATLOCKER_SCAN_INTERVAL_MS;
        }
        var misses = Math.min(4, (Number(S.statlockerScanMisses) || 0) + 1);
        S.statlockerScanMisses = misses;
        return Math.min(STATLOCKER_SCAN_IDLE_MAX_MS, STATLOCKER_SCAN_INTERVAL_MS * (1 + misses));
    }

    function CollectStatlockerCorePanels(root) {
        var scanRoots = [];
        if (IsPanelValid(root)) scanRoots.push(root);
        var ctx = null;
        try { ctx = $.GetContextPanel ? $.GetContextPanel() : null; } catch (e0) { ctx = null; }
        if (IsPanelValid(ctx) && scanRoots.indexOf(ctx) === -1) scanRoots.push(ctx);
        var ancestor = ctx;
        for (var d = 0; d < 8 && ancestor; d++) {
            ancestor = ancestor.GetParent ? ancestor.GetParent() : null;
            if (!IsPanelValid(ancestor)) break;
            if (scanRoots.indexOf(ancestor) === -1) scanRoots.push(ancestor);
        }

        var out = [];
        for (var iRoot = 0; iRoot < scanRoots.length; iRoot++) {
            var scanRoot = scanRoots[iRoot];
            if (!scanRoot || !scanRoot.FindChildrenWithClassTraverse) continue;
            var found = scanRoot.FindChildrenWithClassTraverse("coreRating") || [];
            for (var i = 0; i < found.length; i++) {
                var panel = found[i];
                if (!IsPanelValid(panel)) continue;
                if (!IsStatlockerTargetPanel(panel)) continue;
                if (out.indexOf(panel) === -1) out.push(panel);
            }
        }
        return out;
    }

    function ApplyStatlockerButtonStyle(button, label) {
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
        } catch (e0) {}
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
        } catch (e1) {}
    }

    function EnsureStatlockerButton(corePanel, root) {
        if (!IsPanelValid(corePanel)) return null;
        var button = FindDirectChildByClassName(corePanel, "QOLStatlockerButton");
        if (!button && $.CreatePanel) {
            try {
                button = $.CreatePanel("Button", corePanel, "", { hittest: "true", hittestchildren: "false", acceptsfocus: "true" });
            } catch (e0) {
                button = null;
            }
            if (button && button.AddClass) {
                button.AddClass("QOLStatlockerButton");
            }
        }
        if (!IsPanelValid(button)) return null;

        var label = FindDirectChildByClassName(button, "QOLStatlockerLabel");
        if (!label && $.CreatePanel) {
            try {
                label = $.CreatePanel("Label", button, "");
            } catch (e1) {
                label = null;
            }
            if (label && label.AddClass) label.AddClass("QOLStatlockerLabel");
        }
        if (label && label.text !== "STAT") label.text = "STAT";

        ApplyStatlockerButtonStyle(button, label);
        try {
            button.SetPanelEvent("onactivate", function() {
                var runtimeRoot = GetUIRoot();
                if (!IsPanelValid(runtimeRoot)) runtimeRoot = root;
                var accountId = TryResolveStatlockerAccountId(corePanel, runtimeRoot);
                if (!accountId) return;
                $.DispatchEvent("ExternalBrowserGoToURL", "https://statlocker.gg/profile/" + accountId);
            });
        } catch (e2) {}

        return button;
    }

    function RemoveStatlockerButtons(root) {
        var knownButtons = Array.isArray(S.statlockerButtons) ? S.statlockerButtons : [];
        for (var i = 0; i < knownButtons.length; i++) {
            var button = knownButtons[i];
            if (!IsPanelValid(button)) continue;
            try { button.DeleteAsync(0); } catch (e0) {}
        }

        var knownPanels = Array.isArray(S.statlockerCorePanels) ? S.statlockerCorePanels : [];
        var cleanupPanels = [];
        for (var kp = 0; kp < knownPanels.length; kp++) {
            if (IsPanelValid(knownPanels[kp]) && cleanupPanels.indexOf(knownPanels[kp]) === -1) cleanupPanels.push(knownPanels[kp]);
        }
        if (cleanupPanels.length === 0 && IsStatlockerDiscoveryContextActive(root)) {
            cleanupPanels = CollectStatlockerCorePanels(root);
        }

        for (var c = 0; c < cleanupPanels.length; c++) {
            var panel = cleanupPanels[c];
            if (!IsPanelValid(panel)) continue;
            var child = FindDirectChildByClassName(panel, "QOLStatlockerButton");
            if (!IsPanelValid(child)) continue;
            try { child.DeleteAsync(0); } catch (e1) {}
        }
        S.statlockerButtons = [];
        S.statlockerCorePanels = [];
        S.statlockerNextScanMs = 0;
        S.statlockerScanMisses = 0;
    }

    function UpdateStatlockerButtons(root, nowMs, cfg) {
        if (!root) return;
        var enabled = IsCfgEnabled(cfg, "ENABLE_STATLOCKER");
        if (!enabled) {
            if (S.statlockerWasEnabled) {
                RemoveStatlockerButtons(root);
            }
            S.statlockerWasEnabled = false;
            return;
        }

        if (!isFinite(Number(nowMs))) {
            nowMs = Date.now ? Date.now() : (new Date()).getTime();
        }
        if (!Array.isArray(S.statlockerCorePanels)) S.statlockerCorePanels = [];
        var cacheValid = IsPanelListValid(S.statlockerCorePanels);
        if (!cacheValid || nowMs >= (S.statlockerNextScanMs || 0)) {
            if (!cacheValid && !IsStatlockerDiscoveryContextActive(root)) {
                S.statlockerCorePanels = [];
                S.statlockerButtons = [];
                S.statlockerNextScanMs = nowMs + GetStatlockerScanDelay(0);
                S.statlockerWasEnabled = true;
                return;
            }
            var corePanels = CollectStatlockerCorePanels(root);
            S.statlockerCorePanels = corePanels;
            S.statlockerNextScanMs = nowMs + GetStatlockerScanDelay(corePanels.length);
        }

        var liveButtons = [];
        var panels = S.statlockerCorePanels || [];
        for (var iPanel = 0; iPanel < panels.length; iPanel++) {
            var corePanel = panels[iPanel];
            if (!IsPanelValid(corePanel)) continue;
            var button = EnsureStatlockerButton(corePanel, root);
            if (IsPanelValid(button)) liveButtons.push(button);
        }
        S.statlockerButtons = liveButtons;
        S.statlockerWasEnabled = true;
    }

    // ── Registration ──
    QOL.register("statlocker", {
        configKeys: ["ENABLE_STATLOCKER"],
        bucket: 2, phase: 1,
        gate: function(cfg) {
            return IsCfgEnabled(cfg, "ENABLE_STATLOCKER");
        },
        update: function(root, cfg, nowMs, State, hideoutConnected) {
                        try {
                UpdateStatlockerButtons(root, nowMs, cfg);
            } catch(e) {
                $.Msg("[QOLLock][ERROR][" + _dk + "] " + (e && e.message ? e.message : String(e)) + "\n" + (e && e.stack ? String(e.stack) : ""));
                throw e;
            }
        },
        stateKeys: ["statlockerWasEnabled", "statlockerNextScanMs",
                    "statlockerScanMisses", "statlockerCorePanels",
                    "statlockerButtons"]
    });

    // Self-test: verify update function exists at load time
    try {
        if (typeof UpdateStatlockerButtons !== "function") throw new Error("UpdateStatlockerButtons is not a function");
    } catch(e) {
        $.Msg("[QOLLock][ERROR][" + _dk + "] self-test failed: " + (e && e.message ? e.message : String(e)));
    }

})();

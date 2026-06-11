// ql_feat_unspent.js — Unspent Souls display on top bar player panels
// Extracted from ql_core.js, Phase 9 Step 2c
(function() {
    'use strict';
    var _featureId = "ql_feat_unspent";
    var _deps = QOL.import(["getCachedPanel","getSoulValueFromLabels","getTopBarPlayerPanel","state","setCachedPanel","utils","isConnectedToHideout"]);
    var GC = _deps.getCachedPanel;
    var S = _deps.state;
    var SC = _deps.setCachedPanel;
    var U = _deps.utils;
    var IsCfgEnabled = U.IsCfgEnabled;
    var IsPanelValid = U.IsPanelValid;
    var GetSoulValueFromLabels = _deps.getSoulValueFromLabels;
    var GetTopBarPlayerPanel = _deps.getTopBarPlayerPanel;
    var isConnectedToHideout = _deps.isConnectedToHideout;

    // ── Constants ──
    var UNSPENT_MAX_PLAYERS = 13;
    var UNSPENT_SAMPLE_INTERVAL_MS = 200;
    var UNSPENT_PLAYER_BATCH_SIZE = 1;
    var UNSPENT_PANEL_CACHE_REFRESH_MS = 9000;
    var UNSPENT_TIER_SCAN_INTERVAL_MS = 3000;
    var UNSPENT_TIER_SCAN_STABLE_INTERVAL_MS = 5000;
    var UNSPENT_TIER_SCAN_STAGGER_MS = 250;
    var UNSPENT_TIER_SCAN_MAX_PANELS = 300;
    var UNSPENT_TIER_SIG_MAX_DEPTH = 2;
    var UNSPENT_TIER_SIG_MAX_NODES = 48;
    var UNSPENT_TIER_COST = { 1: 800, 2: 1600, 3: 3200, 4: 6400 };

    // ── Private helpers ──

    function EnsureUnspentState() {
        if (!S.unspentPlayerPanels) S.unspentPlayerPanels = new Array(UNSPENT_MAX_PLAYERS);
        if (!S.unspentModsContainers) S.unspentModsContainers = new Array(UNSPENT_MAX_PLAYERS);
        if (!S.unspentDisplayLabels) S.unspentDisplayLabels = new Array(UNSPENT_MAX_PLAYERS);
        if (!S.unspentSoulValueLabelsPrimary) S.unspentSoulValueLabelsPrimary = new Array(UNSPENT_MAX_PLAYERS);
        if (!S.unspentSoulValueLabelsFallback) S.unspentSoulValueLabelsFallback = new Array(UNSPENT_MAX_PLAYERS);
        if (!S.unspentCachedSpentSouls) S.unspentCachedSpentSouls = new Array(UNSPENT_MAX_PLAYERS);
        if (!S.unspentModsChildCount) S.unspentModsChildCount = new Array(UNSPENT_MAX_PLAYERS);
        if (!S.unspentModsStructureSig) S.unspentModsStructureSig = new Array(UNSPENT_MAX_PLAYERS);
        if (!S.unspentNextTierScanMs) S.unspentNextTierScanMs = new Array(UNSPENT_MAX_PLAYERS);
        if (!S.unspentLastDisplayText) S.unspentLastDisplayText = new Array(UNSPENT_MAX_PLAYERS);
    }

    function IsUnspentPanelCacheValid() {
        if (!S.unspentPlayerPanels || !S.unspentModsContainers || !S.unspentDisplayLabels) return false;
        return true;
    }

    function RefreshUnspentPanelCache(root, nowMs, createDisplays) {
        if (!root) return;
        EnsureUnspentState();
        var shouldRefresh = !IsUnspentPanelCacheValid() || nowMs >= (S.unspentPanelCacheNextMs || 0);
        if (!shouldRefresh) return;

        for (var i = 0; i < UNSPENT_MAX_PLAYERS; i++) {
            var playerPanel = GetTopBarPlayerPanel(root, i, nowMs, true);
            var panelChanged = (S.unspentPlayerPanels[i] !== (playerPanel || null));
            S.unspentPlayerPanels[i] = playerPanel || null;

            var modsContainer = playerPanel && playerPanel.FindChildTraverse ? playerPanel.FindChildTraverse("PlayerModsContainer") : null;
            var modsChanged = (S.unspentModsContainers[i] !== (modsContainer || null));
            S.unspentModsContainers[i] = modsContainer || null;
            S.unspentSoulValueLabelsPrimary[i] = playerPanel && playerPanel.FindChildTraverse ? (playerPanel.FindChildTraverse("HiddenGoldValue") || null) : null;
            S.unspentSoulValueLabelsFallback[i] = playerPanel && playerPanel.FindChildTraverse ? (playerPanel.FindChildTraverse("SoulsValue") || null) : null;

            var display = playerPanel && playerPanel.FindChildTraverse ? playerPanel.FindChildTraverse("SpentSoulDisplay") : null;
            if (!display && createDisplays && playerPanel) {
                display = $.CreatePanel("Label", playerPanel, "SpentSoulDisplay");
                if (display) display.AddClass("SpentSoulDisplay");
            }
            S.unspentDisplayLabels[i] = display || null;

            if (panelChanged || modsChanged) {
                S.unspentCachedSpentSouls[i] = 0;
                S.unspentModsChildCount[i] = -1;
                S.unspentModsStructureSig[i] = "";
                S.unspentLastDisplayText[i] = "";
                S.unspentNextTierScanMs[i] = nowMs + (i * UNSPENT_TIER_SCAN_STAGGER_MS);
            }
        }

        S.unspentPanelCacheNextMs = nowMs + UNSPENT_PANEL_CACHE_REFRESH_MS + 311;
    }

    function ScanTierCountsOnModsContainer(modsContainer) {
        var result = { t1: 0, t2: 0, t3: 0, t4: 0 };
        if (!modsContainer) return result;

        var stack = [modsContainer];
        var scanned = 0;
        while (stack.length > 0 && scanned < UNSPENT_TIER_SCAN_MAX_PANELS) {
            var panel = stack.pop();
            if (!panel) continue;
            scanned++;

            if (panel !== modsContainer && panel.BHasClass) {
                if (panel.BHasClass("isTier1") || panel.BHasClass("IsTier1")) result.t1++;
                else if (panel.BHasClass("isTier2") || panel.BHasClass("IsTier2")) result.t2++;
                else if (panel.BHasClass("isTier3") || panel.BHasClass("IsTier3")) result.t3++;
                else if (panel.BHasClass("isTier4") || panel.BHasClass("IsTier4")) result.t4++;
            }

            var childCount = 0;
            try { childCount = panel.GetChildCount ? panel.GetChildCount() : 0; } catch (e0) { childCount = 0; }
            for (var i = 0; i < childCount; i++) {
                var child = null;
                try { child = panel.GetChild(i); } catch (e1) { child = null; }
                if (child) stack.push(child);
            }
        }

        return result;
    }

    function BuildUnspentModsStructureSignature(modsContainer) {
        if (!modsContainer) return "";
        var sig = [];
        var stack = [{ panel: modsContainer, depth: 0 }];
        var scanned = 0;
        while (stack.length > 0 && scanned < UNSPENT_TIER_SIG_MAX_NODES) {
            var entry = stack.pop();
            var panel = entry ? entry.panel : null;
            var depth = entry ? Number(entry.depth) || 0 : 0;
            if (!panel) continue;
            scanned++;

            var childCount = 0;
            try { childCount = panel.GetChildCount ? panel.GetChildCount() : 0; } catch (e0) { childCount = 0; }
            var panelId = "";
            try { panelId = String(panel.id || ""); } catch (e1) { panelId = ""; }
            var panelType = "";
            try { panelType = String(panel.paneltype || ""); } catch (e2) { panelType = ""; }
            var classAttr = "";
            try { classAttr = panel.GetAttributeString ? String(panel.GetAttributeString("class", "") || "") : ""; } catch (e3) { classAttr = ""; }
            sig.push(depth + ":" + panelId + ":" + panelType + ":" + childCount + ":" + classAttr);

            if (depth >= UNSPENT_TIER_SIG_MAX_DEPTH || !panel.GetChild) continue;
            for (var i = childCount - 1; i >= 0; i--) {
                var child = null;
                try { child = panel.GetChild(i); } catch (e4) { child = null; }
                if (child) stack.push({ panel: child, depth: depth + 1 });
            }
        }
        return sig.join("|");
    }

    function ClearUnspentDisplayValues(root, nowMs) {
        if (!root) return;
        RefreshUnspentPanelCache(root, nowMs, false);
        for (var i = 0; i < UNSPENT_MAX_PLAYERS; i++) {
            var display = IsPanelValid(S.unspentDisplayLabels[i]) ? S.unspentDisplayLabels[i] : null;
            if (!display) continue;
            if (display.text !== "") display.text = "";
            S.unspentLastDisplayText[i] = "";
        }
    }

    // ── Update ──

    function UpdateUnspentSouls(root, nowMs, cfg) {
        if (!root) return;
        EnsureUnspentState();

        if (!isFinite(nowMs)) {
            nowMs = Date.now ? Date.now() : (new Date()).getTime();
        }
        var enabled = !cfg || IsCfgEnabled(cfg, "ENABLE_UNSPENT_SOULS");
        if (!enabled || isConnectedToHideout(root)) {
            if (!S.unspentWasDisabled) {
                ClearUnspentDisplayValues(root, nowMs);
                S.unspentWasDisabled = true;
            }
            S.unspentNextSampleMs = 0;
            return;
        }
        S.unspentWasDisabled = false;

        if (nowMs < (S.unspentNextSampleMs || 0)) return;
        S.unspentNextSampleMs = nowMs + UNSPENT_SAMPLE_INTERVAL_MS;
        RefreshUnspentPanelCache(root, nowMs, true);

        // Stagger per-player work: process a batch each sample, rotate cursor.
        var cursor = Number(S.unspentPlayerCursor);
        if (!isFinite(cursor) || cursor < 0 || cursor >= UNSPENT_MAX_PLAYERS) cursor = 0;
        var batchEnd = Math.min(cursor + UNSPENT_PLAYER_BATCH_SIZE, UNSPENT_MAX_PLAYERS);
        for (var i = cursor; i < batchEnd; i++) {
            var playerPanel = IsPanelValid(S.unspentPlayerPanels[i]) ? S.unspentPlayerPanels[i] : null;
            if (!playerPanel) continue;

            var totalNetWorth = GetSoulValueFromLabels(
                S.unspentSoulValueLabelsPrimary ? S.unspentSoulValueLabelsPrimary[i] : null,
                S.unspentSoulValueLabelsFallback ? S.unspentSoulValueLabelsFallback[i] : null
            );
            if (!isFinite(totalNetWorth)) totalNetWorth = 0;

            var modsContainer = IsPanelValid(S.unspentModsContainers[i]) ? S.unspentModsContainers[i] : null;
            if (!modsContainer && playerPanel && playerPanel.FindChildTraverse) {
                modsContainer = playerPanel.FindChildTraverse("PlayerModsContainer");
                S.unspentModsContainers[i] = modsContainer || null;
            }

            var spentSouls = Number(S.unspentCachedSpentSouls[i]) || 0;
            var needsTierScan = false;
            if (modsContainer && modsContainer.GetChildCount) {
                var childCount = -1;
                try { childCount = modsContainer.GetChildCount(); } catch (e2) { childCount = -1; }
                var prevChildCount = Number(S.unspentModsChildCount[i]);
                if (!isFinite(prevChildCount)) prevChildCount = -1;
                if (childCount !== prevChildCount) {
                    S.unspentModsChildCount[i] = childCount;
                    needsTierScan = true;
                }
                var structureSig = BuildUnspentModsStructureSignature(modsContainer);
                var prevStructureSig = String(S.unspentModsStructureSig[i] || "");
                var structureChanged = (structureSig !== prevStructureSig);
                if (structureChanged) {
                    S.unspentModsStructureSig[i] = structureSig;
                    needsTierScan = true;
                }
                if (nowMs >= (S.unspentNextTierScanMs[i] || 0)) {
                    needsTierScan = true;
                }
                if (needsTierScan) {
                    var tierCounts = ScanTierCountsOnModsContainer(modsContainer);
                    spentSouls =
                        (tierCounts.t1 * UNSPENT_TIER_COST[1]) +
                        (tierCounts.t2 * UNSPENT_TIER_COST[2]) +
                        (tierCounts.t3 * UNSPENT_TIER_COST[3]) +
                        (tierCounts.t4 * UNSPENT_TIER_COST[4]);
                    S.unspentCachedSpentSouls[i] = spentSouls;
                    var nextTierDelayMs = ((childCount !== prevChildCount) || structureChanged)
                        ? UNSPENT_TIER_SCAN_INTERVAL_MS
                        : UNSPENT_TIER_SCAN_STABLE_INTERVAL_MS;
                    S.unspentNextTierScanMs[i] = nowMs + nextTierDelayMs + (i * UNSPENT_TIER_SCAN_STAGGER_MS);
                }
            } else {
                spentSouls = 0;
                S.unspentCachedSpentSouls[i] = 0;
                S.unspentModsChildCount[i] = -1;
                S.unspentModsStructureSig[i] = "";
                S.unspentNextTierScanMs[i] = nowMs + UNSPENT_TIER_SCAN_INTERVAL_MS + (i * UNSPENT_TIER_SCAN_STAGGER_MS);
            }

            var unspentSouls = totalNetWorth - spentSouls;
            if (!isFinite(unspentSouls)) unspentSouls = 0;

            var display = IsPanelValid(S.unspentDisplayLabels[i]) ? S.unspentDisplayLabels[i] : null;
            if (!display && playerPanel && playerPanel.FindChildTraverse) {
                display = playerPanel.FindChildTraverse("SpentSoulDisplay");
            }
            if (!display && playerPanel) {
                display = $.CreatePanel("Label", playerPanel, "SpentSoulDisplay");
                if (display) display.AddClass("SpentSoulDisplay");
            }
            S.unspentDisplayLabels[i] = display || null;
            if (!display) continue;

            var nextText = unspentSouls >= 1000 ? (unspentSouls / 1000).toFixed(1) + "k" : String(Math.round(unspentSouls));
            var prevText = String(S.unspentLastDisplayText[i] || "");
            if (nextText !== prevText) {
                display.text = nextText;
                S.unspentLastDisplayText[i] = nextText;
            }
            var hasSpent = unspentSouls > 0;
            if (display.BHasClass("hasSpent") !== hasSpent) {
                if (hasSpent) display.AddClass("hasSpent"); else display.RemoveClass("hasSpent");
            }
            var hasNegative = unspentSouls < 0;
            if (display.BHasClass("negative") !== hasNegative) {
                if (hasNegative) display.AddClass("negative"); else display.RemoveClass("negative");
            }
        }

        var nextCursor = cursor + UNSPENT_PLAYER_BATCH_SIZE;
        if (nextCursor >= UNSPENT_MAX_PLAYERS) nextCursor = 0;
        S.unspentPlayerCursor = nextCursor;
    }

    // ── Registration ──

    QOL.register("unspent", {
        configKeys: ["ENABLE_UNSPENT_SOULS"],
        bucket: 2, phase: -1,
        gate: function(cfg) {
            return IsCfgEnabled(cfg, "ENABLE_UNSPENT_SOULS");
        },
        update: function(root, cfg, nowMs) {
            try {
                UpdateUnspentSouls(root, nowMs, cfg);
            } catch(e) {
                $.Msg("[QOLLock][ERROR][" + _featureId + "] update: " + (e && e.message ? e.message : String(e)) + "\n" + (e && e.stack ? String(e.stack) : ""));
                throw e;
            }
        },
        stateKeys: ["unspentNextSampleMs", "unspentPanelCacheNextMs", "unspentPlayerPanels",
                    "unspentModsContainers", "unspentDisplayLabels",
                    "unspentSoulValueLabelsPrimary", "unspentSoulValueLabelsFallback",
                    "unspentCachedSpentSouls", "unspentModsChildCount",
                    "unspentNextTierScanMs", "unspentLastDisplayText", "unspentWasDisabled"]
    });

    // ── Self-test ──
    try {
        if (typeof UpdateUnspentSouls !== "function") throw new Error("UpdateUnspentSouls is not a function");
    } catch(e) {
        $.Msg("[QOLLock][ERROR][" + _featureId + "] self-test failed: " + (e && e.message ? e.message : String(e)));
    }
})();

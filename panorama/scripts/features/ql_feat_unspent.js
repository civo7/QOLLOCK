// ql_feat_unspent.js — Unspent Souls display on top bar player panels
// Extracted from ql_core.js, Phase 9 Step 2c
(function() {
    'use strict';
    var _featureId = "ql_feat_unspent";
    // DEPENDS: getCachedPanel, getSoulValueFromLabels, getTopBarPlayerPanel, state, setCachedPanel, utils, isConnectedToHideout
    var _deps = QOL.import(["getCachedPanel","getSoulValueFromLabels","getTopBarPlayerPanel","state","setCachedPanel","utils","isConnectedToHideout"]);
    var GetCachedPanel = _deps.getCachedPanel;
    var State = _deps.state;
    var SetCachedPanel = _deps.setCachedPanel;
    var Utils = _deps.utils;
    var IsCfgEnabled = Utils.IsCfgEnabled;
    var IsPanelValid = Utils.IsPanelValid;
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
    // GAME_VERSION_DEPENDENT: Item tier costs. If spent-souls calculation is wrong
    // after a game patch, check if tier costs changed. Last verified: 2026-07-20.
    var UNSPENT_TIER_COST = { 1: 800, 2: 1600, 3: 3200, 4: 6400 };

    // ── Private helpers ──

    function EnsureUnspentState() {
        if (!State.unspentPlayerPanels) State.unspentPlayerPanels = new Array(UNSPENT_MAX_PLAYERS);
        if (!State.unspentModsContainers) State.unspentModsContainers = new Array(UNSPENT_MAX_PLAYERS);
        if (!State.unspentDisplayLabels) State.unspentDisplayLabels = new Array(UNSPENT_MAX_PLAYERS);
        if (!State.unspentSoulValueLabelsPrimary) State.unspentSoulValueLabelsPrimary = new Array(UNSPENT_MAX_PLAYERS);
        if (!State.unspentSoulValueLabelsFallback) State.unspentSoulValueLabelsFallback = new Array(UNSPENT_MAX_PLAYERS);
        if (!State.unspentCachedSpentSouls) State.unspentCachedSpentSouls = new Array(UNSPENT_MAX_PLAYERS);
        if (!State.unspentModsChildCount) State.unspentModsChildCount = new Array(UNSPENT_MAX_PLAYERS);
        if (!State.unspentModsStructureSig) State.unspentModsStructureSig = new Array(UNSPENT_MAX_PLAYERS);
        if (!State.unspentNextTierScanMs) State.unspentNextTierScanMs = new Array(UNSPENT_MAX_PLAYERS);
        if (!State.unspentLastDisplayText) State.unspentLastDisplayText = new Array(UNSPENT_MAX_PLAYERS);
    }

    function IsUnspentPanelCacheValid() {
        if (!State.unspentPlayerPanels || !State.unspentModsContainers || !State.unspentDisplayLabels) return false;
        return true;
    }

    function RefreshUnspentPanelCache(root, nowMs, createDisplays) {
        if (!root) return;
        EnsureUnspentState();
        var shouldRefresh = !IsUnspentPanelCacheValid() || nowMs >= (State.unspentPanelCacheNextMs || 0);
        if (!shouldRefresh) return;

        for (var i = 0; i < UNSPENT_MAX_PLAYERS; i++) {
            var playerPanel = GetTopBarPlayerPanel(root, i, nowMs, true);
            var panelChanged = (State.unspentPlayerPanels[i] !== (playerPanel || null));
            State.unspentPlayerPanels[i] = playerPanel || null;

            var modsContainer = playerPanel && playerPanel.FindChildTraverse ? playerPanel.FindChildTraverse("PlayerModsContainer") : null;
            var modsChanged = (State.unspentModsContainers[i] !== (modsContainer || null));
            State.unspentModsContainers[i] = modsContainer || null;
            State.unspentSoulValueLabelsPrimary[i] = playerPanel && playerPanel.FindChildTraverse ? (playerPanel.FindChildTraverse("HiddenGoldValue") || null) : null;
            State.unspentSoulValueLabelsFallback[i] = playerPanel && playerPanel.FindChildTraverse ? (playerPanel.FindChildTraverse("SoulsValue") || null) : null;

            var display = playerPanel && playerPanel.FindChildTraverse ? playerPanel.FindChildTraverse("SpentSoulDisplay") : null;
            if (!display && createDisplays && playerPanel) {
                display = $.CreatePanel("Label", playerPanel, "SpentSoulDisplay");
                if (display) display.AddClass("SpentSoulDisplay");
            }
            State.unspentDisplayLabels[i] = display || null;

            if (panelChanged || modsChanged) {
                State.unspentCachedSpentSouls[i] = 0;
                State.unspentModsChildCount[i] = -1;
                State.unspentModsStructureSig[i] = "";
                State.unspentLastDisplayText[i] = "";
                State.unspentNextTierScanMs[i] = nowMs + (i * UNSPENT_TIER_SCAN_STAGGER_MS);
            }
        }

        State.unspentPanelCacheNextMs = nowMs + UNSPENT_PANEL_CACHE_REFRESH_MS + 311;
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
            var display = IsPanelValid(State.unspentDisplayLabels[i]) ? State.unspentDisplayLabels[i] : null;
            if (!display) continue;
            if (display.text !== "") display.text = "";
            State.unspentLastDisplayText[i] = "";
        }
    }

    // ── Per-player slot processing (extracted from UpdateUnspentSouls loop body)

    function ProcessUnspentPlayerSlot(nowMs, i, playerPanel) {
        var totalNetWorth = GetSoulValueFromLabels(
            State.unspentSoulValueLabelsPrimary ? State.unspentSoulValueLabelsPrimary[i] : null,
            State.unspentSoulValueLabelsFallback ? State.unspentSoulValueLabelsFallback[i] : null
        );
        if (!isFinite(totalNetWorth)) totalNetWorth = 0;

        var modsContainer = IsPanelValid(State.unspentModsContainers[i]) ? State.unspentModsContainers[i] : null;
        if (!modsContainer && playerPanel && playerPanel.FindChildTraverse) {
            modsContainer = playerPanel.FindChildTraverse("PlayerModsContainer");
            State.unspentModsContainers[i] = modsContainer || null;
        }

        var spentSouls = Number(State.unspentCachedSpentSouls[i]) || 0;
        var needsTierScan = false;
        if (modsContainer && modsContainer.GetChildCount) {
            var childCount = -1;
            try { childCount = modsContainer.GetChildCount(); } catch (e2) { childCount = -1; }
            var prevChildCount = Number(State.unspentModsChildCount[i]);
            if (!isFinite(prevChildCount)) prevChildCount = -1;
            if (childCount !== prevChildCount) {
                State.unspentModsChildCount[i] = childCount;
                needsTierScan = true;
            }
            var structureSig = BuildUnspentModsStructureSignature(modsContainer);
            var prevStructureSig = String(State.unspentModsStructureSig[i] || "");
            var structureChanged = (structureSig !== prevStructureSig);
            if (structureChanged) {
                State.unspentModsStructureSig[i] = structureSig;
                needsTierScan = true;
            }
            if (nowMs >= (State.unspentNextTierScanMs[i] || 0)) {
                needsTierScan = true;
            }
            if (needsTierScan) {
                var tierCounts = ScanTierCountsOnModsContainer(modsContainer);
                spentSouls =
                    (tierCounts.t1 * UNSPENT_TIER_COST[1]) +
                    (tierCounts.t2 * UNSPENT_TIER_COST[2]) +
                    (tierCounts.t3 * UNSPENT_TIER_COST[3]) +
                    (tierCounts.t4 * UNSPENT_TIER_COST[4]);
                State.unspentCachedSpentSouls[i] = spentSouls;
                var nextTierDelayMs = ((childCount !== prevChildCount) || structureChanged)
                    ? UNSPENT_TIER_SCAN_INTERVAL_MS
                    : UNSPENT_TIER_SCAN_STABLE_INTERVAL_MS;
                State.unspentNextTierScanMs[i] = nowMs + nextTierDelayMs + (i * UNSPENT_TIER_SCAN_STAGGER_MS);
            }
        } else {
            spentSouls = 0;
            State.unspentCachedSpentSouls[i] = 0;
            State.unspentModsChildCount[i] = -1;
            State.unspentModsStructureSig[i] = "";
            State.unspentNextTierScanMs[i] = nowMs + UNSPENT_TIER_SCAN_INTERVAL_MS + (i * UNSPENT_TIER_SCAN_STAGGER_MS);
        }

        var unspentSouls = totalNetWorth - spentSouls;
        if (!isFinite(unspentSouls)) unspentSouls = 0;

        var display = IsPanelValid(State.unspentDisplayLabels[i]) ? State.unspentDisplayLabels[i] : null;
        if (!display && playerPanel && playerPanel.FindChildTraverse) {
            display = playerPanel.FindChildTraverse("SpentSoulDisplay");
        }
        if (!display && playerPanel) {
            display = $.CreatePanel("Label", playerPanel, "SpentSoulDisplay");
            if (display) display.AddClass("SpentSoulDisplay");
        }
        State.unspentDisplayLabels[i] = display || null;
        if (!display) return;

        var nextText = unspentSouls >= 1000 ? (unspentSouls / 1000).toFixed(1) + "k" : String(Math.round(unspentSouls));
        var prevText = String(State.unspentLastDisplayText[i] || "");
        if (nextText !== prevText) {
            display.text = nextText;
            State.unspentLastDisplayText[i] = nextText;
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

    // ── Update ──

    function UpdateUnspentSouls(root, nowMs, cfg) {
        if (!root) return;
        EnsureUnspentState();

        if (!isFinite(nowMs)) {
            nowMs = Date.now ? Date.now() : (new Date()).getTime();
        }
        var enabled = !cfg || IsCfgEnabled(cfg, "ENABLE_UNSPENT_SOULS");
        if (!enabled || isConnectedToHideout(root)) {
            if (!State.unspentWasDisabled) {
                ClearUnspentDisplayValues(root, nowMs);
                State.unspentWasDisabled = true;
            }
            State.unspentNextSampleMs = 0;
            return;
        }
        State.unspentWasDisabled = false;

        if (nowMs < (State.unspentNextSampleMs || 0)) return;
        State.unspentNextSampleMs = nowMs + UNSPENT_SAMPLE_INTERVAL_MS;
        RefreshUnspentPanelCache(root, nowMs, true);

        // Stagger per-player work: process a batch each sample, rotate cursor.
        var cursor = Number(State.unspentPlayerCursor);
        if (!isFinite(cursor) || cursor < 0 || cursor >= UNSPENT_MAX_PLAYERS) cursor = 0;
        var batchEnd = Math.min(cursor + UNSPENT_PLAYER_BATCH_SIZE, UNSPENT_MAX_PLAYERS);
        for (var i = cursor; i < batchEnd; i++) {
            var playerPanel = IsPanelValid(State.unspentPlayerPanels[i]) ? State.unspentPlayerPanels[i] : null;
            if (!playerPanel) continue;
            ProcessUnspentPlayerSlot(nowMs, i, playerPanel);
        }

        var nextCursor = cursor + UNSPENT_PLAYER_BATCH_SIZE;
        if (nextCursor >= UNSPENT_MAX_PLAYERS) nextCursor = 0;
        State.unspentPlayerCursor = nextCursor;
    }

    // ── Registration ──

    QOL.register("unspent", {
        configKeys: ["ENABLE_UNSPENT_SOULS"],
        bucket: 2, phase: -1,
        gate: function(cfg) {
            return !cfg || IsCfgEnabled(cfg, "ENABLE_UNSPENT_SOULS");
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

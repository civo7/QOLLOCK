// ql_feat_recentpurchases.js — Recent purchases panel + quick purchase popups
// Extracted from ql_core.js, Phase 9 Step 2c
(function() {
    'use strict';
    var _featureId = "ql_feat_recentpurchases";
    // DEPENDS: getCachedPanel, isHudClassActive, isPanelVisibleMaybe, resolveCachedPanel, state, setCachedPanel, setPanelClassCached, utils, isConnectedToHideout, normalizeHudOffsetNumber, normalizeHudScaleNumber
    var _deps = QOL.import(["getCachedPanel", "isHudClassActive", "isPanelVisibleMaybe", "resolveCachedPanel", "state", "setCachedPanel", "setPanelClassCached", "utils", "isConnectedToHideout", "normalizeHudOffsetNumber", "normalizeHudScaleNumber"]);
    var GetCachedPanel = _deps.getCachedPanel;
    var State = _deps.state;
    var SetCachedPanel = _deps.setCachedPanel;
    var Utils = _deps.utils;
    var IsHudClassActive = _deps.isHudClassActive;
    var IsCfgEnabled = Utils.IsCfgEnabled;
    var IsPanelValid = Utils.IsPanelValid;
    var SetPanelOpacitySafe = Utils.SetPanelOpacitySafe;
    var NormalizeOpacityNumber = Utils.NormalizeOpacityNumber;
    var NormalizeHudOffsetNumber = _deps.normalizeHudOffsetNumber;
    var NormalizeHudScaleNumber = _deps.normalizeHudScaleNumber;
    var SetPanelClassCached = _deps.setPanelClassCached;
    var isConnectedToHideout = _deps.isConnectedToHideout;
    var IsPanelVisibleMaybe = QOL.isPanelVisibleMaybe || function() { return false; };

    var RECENT_PURCHASE_QUICK_FADE_SEC = 0.4;
    var RECENT_PURCHASE_MAX_ITEMS = 50;
    // Phase 1.5: Missing constants — defined locally.
    var RECENT_PURCHASE_QUICK_MAX_DEFAULT = 3;
    var RECENT_PURCHASE_QUICK_DISPLAY_SEC_DEFAULT = 5;
    var PANEL_ID_TOP_BAR = "TopBar";
    var CLASS_ULTIMATE_UNLOCKED = "UltimateUnlocked";
    var CLASS_RECENT_PURCHASE = "recentPurchase";
    var RECENT_PURCHASE_FILTERS = [
        { id: "Tier1Toggle", label: "T1", group: "tier", active: true, invert: true,
          ShouldHideItem: function(p) { return p.BHasClass("isTier1Purchase"); } },
        { id: "Tier2Toggle", label: "T2", group: "tier", active: true, invert: true,
          ShouldHideItem: function(p) { return p.BHasClass("isTier2Purchase"); } },
        { id: "Tier3Toggle", label: "T3", group: "tier", active: true, invert: true,
          ShouldHideItem: function(p) { return p.BHasClass("isTier3Purchase"); } },
        { id: "Tier4Toggle", label: "T4", group: "tier", active: true, invert: true,
          ShouldHideItem: function(p) { return p.BHasClass("isTier4Purchase"); } },
        { id: "Team1OnlyToggle", label: "Hidden King", group: "team", active: true, invert: true,
          ShouldShowToggle: function(ctx) { return ctx.isSpectator; },
          ShouldHideItem: function(p) { return p.BHasClass("isTeam1Purchase"); } },
        { id: "Team2OnlyToggle", label: "Archmother", group: "team", active: true, invert: true,
          ShouldShowToggle: function(ctx) { return ctx.isSpectator; },
          ShouldHideItem: function(p) { return p.BHasClass("isTeam2Purchase"); } },
        { id: "MyTeamToggle", label: "My Team", group: "team", active: true, invert: true,
          ShouldShowToggle: function(ctx) { return !ctx.isSpectator; },
          ShouldHideItem: function(p, ctx) {
              if (ctx.localTeam === 1) return p.BHasClass("isTeam1Purchase");
              if (ctx.localTeam === 2) return p.BHasClass("isTeam2Purchase");
              return false;
          } },
        { id: "EnemyTeamToggle", label: "Enemy Team", group: "team", active: true, invert: true,
          ShouldShowToggle: function(ctx) { return !ctx.isSpectator; },
          ShouldHideItem: function(p, ctx) {
              if (ctx.localTeam === 1) return p.BHasClass("isTeam2Purchase");
              if (ctx.localTeam === 2) return p.BHasClass("isTeam1Purchase");
              return false;
          } }
    ];
function GetRecentPurchaseName(panel) {
        var labels = panel.FindChildrenWithClassTraverse("recentModPurchaseName");
        return (labels && labels.length > 0) ? labels[0].text.trim() : "";
    }
// HasAncestorClass replaced by Utils.HasClassInHierarchy (canonical version from ql_utils.js).
function GetRecentPurchaseTimeText(panel) {
        var labels = panel.FindChildrenWithClassTraverse("recentTimePurchased");
        return (labels && labels.length > 0) ? labels[0].text.trim() : "";
    }
    var PANEL_ID_ABILITIES_CONTAINER = "AbilitiesContainer";
    var PANEL_ID_GAMEPLAY_HUD = "gameplay_hud";
    var RECENT_PURCHASE_QUICK_CLASSES = [
        "isTier1Purchase", "isTier2Purchase", "isTier3Purchase", "isTier4Purchase",
        "isWeaponPurchase", "isArmorPurchase", "isTechPurchase",
        "isTeam1Purchase", "isTeam2Purchase"
    ];
// Phase 5.2: Removed dead local IsPanelVisibleMaybe (overwritten by line 21 import).
// ResolveCachedPanel now uses shared version from QOL.import().
var ResolveCachedPanel = _deps.resolveCachedPanel || function(parent, cacheKey, traverseId) {
    var panel = IsPanelValid(State.cachedPanels[cacheKey]) ? State.cachedPanels[cacheKey] : null;
    if (!panel && parent && parent.FindChildTraverse) {
        panel = parent.FindChildTraverse(traverseId);
        State.cachedPanels[cacheKey] = panel || null;
    }
    return panel;
};
    function GetRecentPurchaseHeroName(panel) {
        var labels = panel.FindChildrenWithClassTraverse("recentModPurchaserHero");
        return (labels && labels.length > 0) ? labels[0].text.trim() : "";
    }

    function UpdateModIconsRP(container, purchases) {
        if (!container || !IsPanelValid(container)) return;
        if (!purchases) purchases = container.FindChildrenWithClassTraverse(CLASS_RECENT_PURCHASE);
        for (var i = 0; i < purchases.length; i++) {
            var purchase = purchases[i];
            var icons = purchase.FindChildrenWithClassTraverse("mod_icon");
            if (!icons || icons.length === 0) continue;
            var icon = icons[0];
            if (icon.BHasClass("iconSet")) continue;
            var itemName = GetRecentPurchaseName(purchase);
            if (!itemName) continue;
            var image = MOD_ICONS[itemName];
            if (!image) continue;
            icon.style.backgroundImage = image;
            icon.style.washColor = "none";
            icon.AddClass("iconSet");
        }
    }

    function BuildContextRP(container) {
        var ctx = { isSpectator: false, localTeam: 0 };
        var p = $.GetContextPanel();
        while (p) {
            if (p.BHasClass("TeamSpectator")) { ctx.isSpectator = true; break; }
            p = p.GetParent();
        }
        if (!ctx.isSpectator && container && IsPanelValid(container)) {
            if (Utils.HasClassInHierarchy(container, "localPlayerTeam1")) ctx.localTeam = 1;
            else if (Utils.HasClassInHierarchy(container, "localPlayerTeam2")) ctx.localTeam = 2;
        }
        return ctx;
    }

    function GetFilterSigRP(ctx, container) {
        var sig = (ctx.isSpectator ? "1" : "0") + ctx.localTeam + container.GetChildCount();
        for (var i = 0; i < RECENT_PURCHASE_FILTERS.length; i++) sig += RECENT_PURCHASE_FILTERS[i].active ? "1" : "0";
        return sig;
    }

    function CreateFilterCheckboxesRP(root) {
        if (State.recentPurchaseFiltersCreated) return;
        var panel = root.FindChildTraverse("RecentPurchasesPanel");
        if (!panel) return;

        var collapseToggle = $.CreatePanel("ToggleButton", panel, "FiltersCollapseToggle");
        collapseToggle.AddClass("PurchaseFilterToggle");
        collapseToggle.checked = true;
        var collapseLabel = $.CreatePanel("Label", collapseToggle, "");
        collapseLabel.text = "Show Filters";

        var filtersPanel = $.CreatePanel("Panel", panel, "PurchaseFiltersContainer");
        var filtersVisible = true;
        $.RegisterEventHandler("Activated", collapseToggle, function() {
            filtersVisible = !filtersVisible;
            if (filtersVisible) filtersPanel.RemoveClass("filterButtonHidden");
            else filtersPanel.AddClass("filterButtonHidden");
        });

        var groupPanels = {};
        for (var i = 0; i < RECENT_PURCHASE_FILTERS.length; i++) {
            var filter = RECENT_PURCHASE_FILTERS[i];
            if (filter.group) {
                if (!groupPanels[filter.group]) {
                    groupPanels[filter.group] = $.CreatePanel("Panel", filtersPanel, "FilterGroup_" + filter.group);
                    groupPanels[filter.group].AddClass("PurchaseFilterGroup");
                }
            }
            var parent = filter.group ? groupPanels[filter.group] : filtersPanel;
            var toggle = $.CreatePanel("ToggleButton", parent, filter.id);
            toggle.AddClass("PurchaseFilterToggle");
            toggle.checked = filter.active;
            var label = $.CreatePanel("Label", toggle, "");
            label.text = filter.label;
            let capturedFilter = filter;
            $.RegisterEventHandler("Activated", toggle, function() { capturedFilter.active = !capturedFilter.active; });
        }

        var existingLabel = panel.FindChild("RecentPurchases");
        var container = panel.FindChild("RecentPurchasesContainer");
        if (existingLabel) existingLabel.SetParent(panel);
        if (container) container.SetParent(panel);

        State.recentPurchaseFiltersCreated = true;
    }

    function UpdateFilterVisibilityRP(root, ctx) {
        var visSig = ctx.isSpectator ? "1" : "0";
        if (visSig === State.recentPurchaseLastVisibilitySig) return;
        State.recentPurchaseLastVisibilitySig = visSig;
        for (var i = 0; i < RECENT_PURCHASE_FILTERS.length; i++) {
            var filter = RECENT_PURCHASE_FILTERS[i];
            if (!filter.ShouldShowToggle) continue;
            var toggle = root.FindChildTraverse(filter.id);
            if (!toggle) continue;
            if (filter.ShouldShowToggle(ctx)) toggle.RemoveClass("filterButtonHidden");
            else toggle.AddClass("filterButtonHidden");
        }
    }

    function CapContainerRP(container) {
        if (!container || !IsPanelValid(container)) return;
        var count = container.GetChildCount();
        while (count > RECENT_PURCHASE_MAX_ITEMS) {
            container.GetChild(count - 1).DeleteAsync(0);
            count--;
        }
    }

    function ApplyFiltersRP(container, ctx, purchases) {
        if (!container || !IsPanelValid(container)) return;
        var sig = GetFilterSigRP(ctx, container);
        var firstChild = container.GetChildCount() > 0 ? container.GetChild(0) : null;
        if (sig === State.recentPurchaseLastFilterSig && firstChild === State.recentPurchaseLastFirstChild) return;
        State.recentPurchaseLastFilterSig = sig;
        State.recentPurchaseLastFirstChild = firstChild;

        if (!purchases) purchases = container.FindChildrenWithClassTraverse(CLASS_RECENT_PURCHASE);
        for (var i = 0; i < purchases.length; i++) {
            var purchase = purchases[i];
            var hidden = false;
            for (var j = 0; j < RECENT_PURCHASE_FILTERS.length; j++) {
                var filter = RECENT_PURCHASE_FILTERS[j];
                if (filter.ShouldShowToggle && !filter.ShouldShowToggle(ctx)) continue;
                var shouldApply = filter.invert ? !filter.active : filter.active;
                if (shouldApply && filter.ShouldHideItem(purchase, ctx)) { hidden = true; break; }
            }
            if (hidden) purchase.AddClass("filterHidden");
            else purchase.RemoveClass("filterHidden");
        }
    }

    function QuickRemoveEntryRP(entry) {
        var entries = State.recentPurchaseQuickActiveEntries;
        State.recentPurchaseQuickActiveEntries = entries.filter(function(e) { return e !== entry; });
        if (!IsPanelValid(entry)) return;
        entry.AddClass("quickFading");
        $.Schedule(RECENT_PURCHASE_QUICK_FADE_SEC, function() {
            if (IsPanelValid(entry)) entry.DeleteAsync(0);
        });
    }

    function QuickEvictEntryRP(entry) {
        var entries = State.recentPurchaseQuickActiveEntries;
        State.recentPurchaseQuickActiveEntries = entries.filter(function(e) { return e !== entry; });
        if (IsPanelValid(entry)) entry.DeleteAsync(0);
    }

    function AddQuickEntryRP(sourcePurchase, quickPanel, nameText, quickMax, quickDisplaySec) {
        while (State.recentPurchaseQuickActiveEntries.length >= quickMax) {
            QuickEvictEntryRP(State.recentPurchaseQuickActiveEntries[0]);
        }

        var entry = $.CreatePanel("Panel", quickPanel, "");
        entry.AddClass("quickPurchase");

        for (var i = 0; i < RECENT_PURCHASE_QUICK_CLASSES.length; i++) {
            if (sourcePurchase.BHasClass(RECENT_PURCHASE_QUICK_CLASSES[i])) {
                entry.AddClass(RECENT_PURCHASE_QUICK_CLASSES[i]);
            }
        }

        var heroIcon = $.CreatePanel("Panel", entry, "");
        heroIcon.AddClass("quickHeroIcon");
        (function(p, src) {
            function trySet(attempts) {
                if (!IsPanelValid(p)) return;
                var heroName = GetRecentPurchaseHeroName(src);
                var url = heroName ? HERO_IMAGES[heroName] : null;
                if (url) {
                    p.style.backgroundImage = url;
                    p.style.backgroundSize = "100% 100%";
                } else if (attempts > 0) {
                    $.Schedule(0.05, function() { trySet(attempts - 1); });
                }
            }
            $.Schedule(0, function() { trySet(10); });
        })(heroIcon, sourcePurchase);

        var itemInfo = $.CreatePanel("Panel", entry, "");
        itemInfo.AddClass("quickItemInfo");

        var texture = $.CreatePanel("Panel", itemInfo, "");
        texture.AddClass("quickItemTexture");

        var iconUrl = MOD_ICONS[nameText];
        if (iconUrl) {
            var icon = $.CreatePanel("Panel", itemInfo, "");
            icon.AddClass("mod_icon");
            var capturedIcon = icon;
            var capturedIconUrl = iconUrl;
            $.Schedule(0, function() { if (IsPanelValid(capturedIcon)) { capturedIcon.style.backgroundImage = capturedIconUrl; capturedIcon.style.backgroundSize = "100% 100%"; } });
        }

        var nameLabel = $.CreatePanel("Label", itemInfo, "");
        nameLabel.AddClass("quickPurchaseName");
        nameLabel.text = nameText;

        State.recentPurchaseQuickActiveEntries.push(entry);

        $.Schedule(quickDisplaySec, function() {
            if (IsPanelValid(entry)) QuickRemoveEntryRP(entry);
        });
    }

    function GetOrCreateQuickPanelRP(root) {
        if (GetCachedPanel("quickPurchasesPanel")) return GetCachedPanel("quickPurchasesPanel");
        if (!GetCachedPanel("quickPurchasesHostPanel")) {
            SetCachedPanel("quickPurchasesHostPanel", root.FindChildTraverse(PANEL_ID_TOP_BAR));
        }
        var topBar = GetCachedPanel("quickPurchasesHostPanel");
        if (!topBar) return null;
        var qp = $.CreatePanel("Panel", topBar, "QuickPurchasesPanel");
        SetCachedPanel("quickPurchasesPanel", qp);
        return qp;
    }

    function UpdateQuickPurchasesRP(root, container, quickMax, quickDisplaySec, purchases) {
        var quickPanel = GetOrCreateQuickPanelRP(root);
        if (!quickPanel || !container || !IsPanelValid(container)) return;

        if (!purchases) purchases = container.FindChildrenWithClassTraverse(CLASS_RECENT_PURCHASE);

        if (!State.recentPurchaseQuickInitialized) {
            for (var i = 0; i < purchases.length; i++) {
                var n = GetRecentPurchaseName(purchases[i]);
                var t = GetRecentPurchaseTimeText(purchases[i]);
                if (n && t) State.recentPurchaseQuickSeenKeys[n + "|" + t] = true;
            }
            State.recentPurchaseQuickInitialized = true;
            return;
        }

        for (var i = 0; i < purchases.length; i++) {
            var name = GetRecentPurchaseName(purchases[i]);
            var time = GetRecentPurchaseTimeText(purchases[i]);
            if (!name || !time) continue;
            var key = name + "|" + time;
            if (!State.recentPurchaseQuickSeenKeys[key]) {
                State.recentPurchaseQuickSeenKeys[key] = true;
                CapRecentPurchaseSeenKeys();
                if (!purchases[i].BHasClass("filterHidden")) {
                    AddQuickEntryRP(purchases[i], quickPanel, name, quickMax, quickDisplaySec);
                }
            }
        }
    }

    function CapRecentPurchaseSeenKeys() {
        var obj = State.recentPurchaseQuickSeenKeys;
        var count = 0;
        for (var k in obj) { if (obj.hasOwnProperty(k)) count++; }
        if (count <= 300) return;
        // Exceeded cap — reset the dedup log. Worst case: a purchase
        // flashes twice, which is far better than unbounded memory growth.
        State.recentPurchaseQuickSeenKeys = {};
    }

    function SyncRejuvClassRP(rejuvEnabled) {
        var quickPanel = GetCachedPanel("quickPurchasesPanel");
        if (!IsPanelValid(quickPanel)) return;
        quickPanel.SetHasClass("rp_quick_rejuv_active", !!rejuvEnabled);
        if (!GetCachedPanel("cachedRejuvTimer")) {
            var _ctxPanel = $.GetContextPanel();
            var _ctxParent = _ctxPanel && _ctxPanel.GetParent ? _ctxPanel.GetParent() : null;
            SetCachedPanel("cachedRejuvTimer", _ctxParent ?
                _ctxParent.FindChildTraverse("RejuvenatorTimer") : null);
        }
        var timer = GetCachedPanel("cachedRejuvTimer");
        if (!timer) return;
        if (timer.BHasClass("has_rejuv")) quickPanel.AddClass("has_rejuv");
        else quickPanel.RemoveClass("has_rejuv");
    }

    function GetTopBarOverlayBottomRP(panel, fallbackBottom) {
        if (!IsPanelValid(panel) || !IsPanelVisibleMaybe(panel)) return 0;
        var bottom = 0;
        try {
            var y = Number(panel.actualyoffset) || 0;
            var h = Number(panel.actuallayoutheight) || 0;
            if (isFinite(y) && isFinite(h) && h > 0) bottom = y + h;
        } catch(eRecentPurchaseOverlayLayout) { if (typeof Utils !== "undefined" && Utils.WarnLog) Utils.WarnLog("ql_feat_recentpurchases", (eRecentPurchaseOverlayLayout && eRecentPurchaseOverlayLayout.message ? eRecentPurchaseOverlayLayout.message : String(eRecentPurchaseOverlayLayout || ""))); }
        if (bottom > 0) return bottom;
        return Number(fallbackBottom) || 0;
    }

    function ComputeQuickPurchasesMarginTopRP(root, cfg, rejuvEnabled, scoreboardEnabled) {
        var isScoreboardOpen = false;
        try { isScoreboardOpen = scoreboardEnabled && IsHudClassActive(root, "gScoreboardOpen"); } catch(eRecentPurchaseScoreboard) { if (typeof Utils !== "undefined" && Utils.WarnLog) Utils.WarnLog("ql_feat_recentpurchases", (eRecentPurchaseScoreboard && eRecentPurchaseScoreboard.message ? eRecentPurchaseScoreboard.message : String(eRecentPurchaseScoreboard || ""))); }

        var marginTop = 90;
        if (isScoreboardOpen) marginTop = 175;
        else {
            var quickPanel = GetCachedPanel("quickPurchasesPanel");
            var hasRejuv = IsPanelValid(quickPanel) && quickPanel.BHasClass && quickPanel.BHasClass("has_rejuv");
            if (rejuvEnabled && hasRejuv) marginTop = 153;
        }

        var occupiedBottom = 0;
        if (IsCfgEnabled(cfg, "ENABLE_OBJ_MAP")) {
            var objectiveMap = root && root.FindChildTraverse ? root.FindChildTraverse("ObjectivesMap") : null;
            occupiedBottom = Math.max(occupiedBottom, GetTopBarOverlayBottomRP(objectiveMap, 112));
        }
        if (IsCfgEnabled(cfg, "ENABLE_URN_DIFF")) {
            var urnTracker = root && root.FindChildTraverse ? root.FindChildTraverse("UrnTracker") : null;
            occupiedBottom = Math.max(occupiedBottom, GetTopBarOverlayBottomRP(urnTracker, 96));
        }

        if (occupiedBottom > 0) {
            marginTop = Math.max(marginTop, Math.round(occupiedBottom + 12));
        }
        return marginTop;
    }

    function ClearContainerRP(root) {
        var container = GetCachedPanel("recentPurchasesContainer")
            ? GetCachedPanel("recentPurchasesContainer")
            : root.FindChildTraverse("RecentPurchasesContainer");
        if (container && IsPanelValid(container)) {
            var count = container.GetChildCount();
            for (var i = 0; i < count; i++) container.GetChild(i).DeleteAsync(0);
        }
        State.recentPurchaseQuickSeenKeys = {};
        State.recentPurchaseQuickInitialized = false;
        ResetHeroPopupState();
    }

    // ── Hero Purchase Popups (per-hero panel system) ──────────────────────

    var HERO_MAP_IDLE = 0;
    var HERO_MAP_BUILDING = 1;
    var HERO_MAP_BUILT = 2;
    var QUICK_ROW_UI_SCALE = 0.75;
    var QUICK_OVERLAP_GAP = 0;

    function BuildHeroPlayerCardMap(root) {
        if (State.heroPopup.mapState === HERO_MAP_BUILDING) return;
        State.heroPopup.mapState = HERO_MAP_BUILDING;
        State.heroPopup.buildGen++;
        var myGen = State.heroPopup.buildGen;
        var labels = root.FindChildrenWithClassTraverse("HeroNameHidden");
        if (!labels || labels.length === 0) {
            State.heroPopup.mapState = HERO_MAP_IDLE;
            return;
        }
        var pending = labels.length;
        function onDone() {
            pending--;
            if (pending === 0 && State.heroPopup.buildGen === myGen) {
                State.heroPopup.mapState = HERO_MAP_BUILT;
            }
        }
        for (var i = 0; i < labels.length; i++) {
            (function(label) {
                var playerPanel = label.GetParent();
                var badge = null;
                var badgeWalkGuard = 0;
                while (playerPanel && IsPanelValid(playerPanel) && badgeWalkGuard < 64) {
                    badge = playerPanel.FindChildTraverse("HeroBadge");
                    if (badge) break;
                    playerPanel = playerPanel.GetParent();
                    badgeWalkGuard++;
                }
                if (badgeWalkGuard >= 64) Utils.WarnLog("ql_feat_recentpurchases", "BuildHeroPlayerCardMap: badge parent walk hit guard limit");
                if (!badge || !playerPanel) { onDone(); return; }
                var heroId = badge.heroid;
                if (typeof heroId !== "number" || heroId <= 0) { onDone(); return; }
                playerPanel.SetDialogVariableInt("hero_id", heroId);
                $.Schedule(0.3, function() {
                    if (State.heroPopup.buildGen !== myGen) return;
                    if (IsPanelValid(label)) {
                        var name = label.text.trim().toUpperCase();
                        if (name) {
                            State.heroPopup.playerCardCache[name] = playerPanel;
                        }
                    }
                    onDone();
                });
            })(labels[i]);
        }
    }

    function IsHeroPlayerCardMapStale() {
        if (State.heroPopup.mapState !== HERO_MAP_BUILT) return false;
        for (var hero in State.heroPopup.playerCardCache) {
            if (!Object.prototype.hasOwnProperty.call(State.heroPopup.playerCardCache, hero)) continue;
            var parentPanel = State.heroPopup.playerCardCache[hero];
            if (!parentPanel || !IsPanelValid(parentPanel)) return true;
        }
        return false;
    }

    function GetOrCreateHeroPopupPanel(heroNameUpper) {
        if (State.heroPopup.panelsByHero[heroNameUpper] &&
            IsPanelValid(State.heroPopup.panelsByHero[heroNameUpper])) {
            return State.heroPopup.panelsByHero[heroNameUpper];
        }
        var playerPanel = State.heroPopup.playerCardCache[heroNameUpper];
        if (!playerPanel || !IsPanelValid(playerPanel)) {
            if (State.heroPopup.mapState !== HERO_MAP_BUILDING) {
                State.heroPopup.mapState = HERO_MAP_IDLE;
            }
            return null;
        }
        var panel = $.CreatePanel("Panel", playerPanel, "");
        panel.AddClass("QuickPurchasesPanel");
        State.heroPopup.panelsByHero[heroNameUpper] = panel;
        return panel;
    }

    function GetPanelLeftInTopBar(panel) {
        var topBar = GetCachedPanel("topBarPanel");
        if (!topBar) {
            try {
                var root = $.GetContextPanel();
                var rootGuard = 0;
                while (root && root.GetParent && root.GetParent() !== null && rootGuard < 64) {
                    root = root.GetParent();
                    rootGuard++;
                }
                if (rootGuard >= 64) Utils.WarnLog("ql_feat_recentpurchases", "GetPanelLeftInTopBar: root walk hit guard limit");
                if (root) topBar = root.FindChildTraverse(PANEL_ID_TOP_BAR);
            } catch(e) { if (typeof Utils !== "undefined" && Utils.WarnLog) Utils.WarnLog("ql_feat_recentpurchases", (e && e.message ? e.message : String(e || ""))); }
        }
        var x = 0;
        var current = panel;
        var walkGuard = 0;
        while (current && IsPanelValid(current) && current !== topBar && walkGuard < 64) {
            x += Utils.ReadSafePanelLayoutOffset(current.actualxoffset) || 0;
            current = current.GetParent();
            walkGuard++;
        }
        if (walkGuard >= 64) Utils.WarnLog("ql_feat_recentpurchases", "GetPanelLeftInTopBar: X-offset parent walk hit guard limit");
        return x;
    }

    function ScheduleResolveHeroPopupOverlaps(delay) {
        if (State.heroPopup.overlapPending) return;
        State.heroPopup.overlapPending = true;
        $.Schedule(delay || 0, function() {
            try {
                ResolveHeroPopupOverlaps();
            } finally {
                State.heroPopup.overlapPending = false;
            }
        });
    }

    // ResolveHeroPopupOverlaps — prevent hero purchase popups from overlapping.
    // Sorts panels newest-first (by purchase time text), then pairwise checks
    // for horizontal overlap (aLeft < bRight && aRight > bLeft). When overlap
    // is detected, the older (right-side) panel is offset downward by the
    // left panel's height plus a margin, cascading to avoid stacking issues.
    function ResolveHeroPopupOverlaps() {
        var active = [];
        for (var hero in State.heroPopup.panelsByHero) {
            if (!Object.prototype.hasOwnProperty.call(State.heroPopup.panelsByHero, hero)) continue;
            var p = State.heroPopup.panelsByHero[hero];
            if (!p || !IsPanelValid(p)) continue;
            var entries = State.heroPopup.activeEntriesByHero[hero];
            if (!entries || entries.length === 0) continue;
            active.push({ hero: hero, panel: p });
        }

        for (var i = 0; i < active.length; i++) {
            var margin = 125;
            var parentPanel = active[i].panel.GetParent();
            if (parentPanel && IsPanelValid(parentPanel) && parentPanel.BHasClass(CLASS_ULTIMATE_UNLOCKED)) {
                if (State.heroPopup.ultCooldownsEnabled && !parentPanel.BHasClass("UltimateCooldownReady")) {
                    margin = 172; // ult on cooldown — cooldown text pushes popup down
                } else {
                    margin = 152; // ult ready (or cooldowns disabled) — less space needed
                }
            }
            active[i].baseMargin = margin;
        }

        if (active.length === 0) return;
        if (active.length < 2) {
            // Single panel: apply base margin directly
            active[0].panel.style.marginTop = active[0].baseMargin + "px";
            return;
        }

        for (var i = 0; i < active.length; i++) {
            active[i].leftX = GetPanelLeftInTopBar(active[i].panel);
            active[i].width = Math.max(1, Number(active[i].panel.actuallayoutwidth) || 0);
        }

        // Sort newest first
        active.sort(function(a, b) {
            var ta = State.heroPopup.lastEntryTime[a.hero] || 0;
            var tb = State.heroPopup.lastEntryTime[b.hero] || 0;
            return tb - ta;
        });

        var margins = [];
        for (var i = 0; i < active.length; i++) margins[i] = active[i].baseMargin;

        for (var i = 1; i < active.length; i++) {
            var aLeft = active[i].leftX;
            var aRight = aLeft + active[i].width;
            if (active[i].width <= 0) continue;
            for (var j = 0; j < i; j++) {
                if (active[j].width <= 0) continue;
                var bLeft = active[j].leftX;
                var bRight = bLeft + active[j].width;
                if (aLeft < bRight && aRight > bLeft) {
                    var needed = margins[j] + (Number(active[j].panel.contentheight) || 0) * QUICK_ROW_UI_SCALE + QUICK_OVERLAP_GAP;
                    if (needed > margins[i]) margins[i] = needed;
                }
            }
        }

        for (var i = 0; i < active.length; i++) {
            active[i].panel.style.marginTop = margins[i] + "px";
        }
    }

    function RemoveHeroPurchaseEntry(entry, heroNameUpper) {
        var arr = State.heroPopup.activeEntriesByHero[heroNameUpper];
        if (arr) {
            var filtered = [];
            for (var fi = 0; fi < arr.length; fi++) { if (arr[fi] !== entry) filtered.push(arr[fi]); }
            State.heroPopup.activeEntriesByHero[heroNameUpper] = filtered;
        }
        if (!IsPanelValid(entry)) return;
        entry.AddClass("quickFading");
        $.Schedule(RECENT_PURCHASE_QUICK_FADE_SEC, function() {
            if (IsPanelValid(entry)) entry.DeleteAsync(0);
            ScheduleResolveHeroPopupOverlaps(0);
        });
    }

    function EvictHeroPurchaseEntry(entry, heroNameUpper) {
        var arr = State.heroPopup.activeEntriesByHero[heroNameUpper];
        if (arr) {
            var filtered = [];
            for (var fi = 0; fi < arr.length; fi++) { if (arr[fi] !== entry) filtered.push(arr[fi]); }
            State.heroPopup.activeEntriesByHero[heroNameUpper] = filtered;
        }
        if (IsPanelValid(entry)) entry.DeleteAsync(0);
        ScheduleResolveHeroPopupOverlaps(0);
    }

    function AddHeroPurchaseEntry(sourcePurchase, nameText, quickMax, quickDisplaySec) {
        var heroNameUpper = GetRecentPurchaseHeroName(sourcePurchase).toUpperCase();
        var quickPanel = GetOrCreateHeroPopupPanel(heroNameUpper);
        if (!quickPanel) return;

        if (!State.heroPopup.activeEntriesByHero[heroNameUpper]) {
            State.heroPopup.activeEntriesByHero[heroNameUpper] = [];
        }
        State.heroPopup.lastEntryTime[heroNameUpper] = $.FrameTime();

        while (State.heroPopup.activeEntriesByHero[heroNameUpper].length >= quickMax) {
            EvictHeroPurchaseEntry(State.heroPopup.activeEntriesByHero[heroNameUpper][0], heroNameUpper);
        }

        var entry = $.CreatePanel("Panel", quickPanel, "");
        entry.AddClass("quickPurchase");

        for (var i = 0; i < RECENT_PURCHASE_QUICK_CLASSES.length; i++) {
            if (sourcePurchase.BHasClass(RECENT_PURCHASE_QUICK_CLASSES[i])) {
                entry.AddClass(RECENT_PURCHASE_QUICK_CLASSES[i]);
            }
        }

        var itemInfo = $.CreatePanel("Panel", entry, "");
        itemInfo.AddClass("quickItemInfo");

        var iconUrl = (typeof MOD_ICONS !== "undefined") ? MOD_ICONS[nameText] : null;
        if (iconUrl) {
            var icon = $.CreatePanel("Panel", itemInfo, "");
            icon.AddClass("mod_icon");
            (function(p, url) {
                $.Schedule(0, function() {
                    if (IsPanelValid(p)) {
                        p.style.backgroundImage = url;
                        p.style.backgroundSize = "100% 100%";
                    }
                });
            })(icon, iconUrl);
        }

        var nameLabel = $.CreatePanel("Label", itemInfo, "");
        nameLabel.AddClass("quickPurchaseName");
        nameLabel.text = nameText;

        State.heroPopup.activeEntriesByHero[heroNameUpper].push(entry);

        ScheduleResolveHeroPopupOverlaps(0.1);

        $.Schedule(quickDisplaySec, function() {
            if (IsPanelValid(entry)) RemoveHeroPurchaseEntry(entry, heroNameUpper);
        });
    }

    function ResetHeroPopupState() {
        for (var hero in State.heroPopup.panelsByHero) {
            if (!Object.prototype.hasOwnProperty.call(State.heroPopup.panelsByHero, hero)) continue;
            var panel = State.heroPopup.panelsByHero[hero];
            if (panel && IsPanelValid(panel)) panel.DeleteAsync(0);
        }
        var ultSetting = State.heroPopup.ultCooldownsEnabled;
        State.heroPopup = {
            panelsByHero: {},
            activeEntriesByHero: {},
            lastEntryTime: {},
            playerCardCache: {},
            overlapPending: false,
            mapState: HERO_MAP_IDLE,
            buildGen: 0,
            ultCooldownsEnabled: ultSetting
        };
    }

    function UpdateHeroPurchasePopups(root, container, quickMax, quickDisplaySec, purchases) {
        if (IsHeroPlayerCardMapStale()) ResetHeroPopupState();
        if (State.heroPopup.mapState !== HERO_MAP_BUILT) {
            BuildHeroPlayerCardMap(root);
            return;
        }
        if (!container || !IsPanelValid(container)) return;

        if (!purchases) purchases = container.FindChildrenWithClassTraverse(CLASS_RECENT_PURCHASE);

        if (!State.recentPurchaseQuickInitialized) {
            for (var i = 0; i < purchases.length; i++) {
                var n = GetRecentPurchaseName(purchases[i]);
                var t = GetRecentPurchaseTimeText(purchases[i]);
                if (n && t) State.recentPurchaseQuickSeenKeys[n + "|" + t] = true;
            }
            State.recentPurchaseQuickInitialized = true;
            return;
        }

        for (var i = 0; i < purchases.length; i++) {
            var purchase = purchases[i];
            if (!purchase || !IsPanelValid(purchase)) continue;
            var name = GetRecentPurchaseName(purchase);
            var time = GetRecentPurchaseTimeText(purchase);
            if (!name || !time) continue;
            var key = name + "|" + time;
            if (!State.recentPurchaseQuickSeenKeys[key]) {
                State.recentPurchaseQuickSeenKeys[key] = true;
                CapRecentPurchaseSeenKeys();
                if (!purchase.BHasClass("filterHidden")) {
                    AddHeroPurchaseEntry(purchase, name, quickMax, quickDisplaySec);
                }
            }
        }
    }

    function HandleHideoutRP(root) {
        var isInHideout = isConnectedToHideout(root);
        if (State.recentPurchaseWasInHideout === null || isInHideout !== State.recentPurchaseWasInHideout) {
            ClearContainerRP(root);
            $.Schedule(0.5, function() { ClearContainerRP(root); });
        }
        State.recentPurchaseWasInHideout = isInHideout;
    }

    function UpdateRecentPurchases(root, cfg) {
        var shopEnabled   = IsCfgEnabled(cfg, "ENABLE_SHOP_RECENT_PURCHASES");
        var notifyEnabled = IsCfgEnabled(cfg, "ENABLE_SHOP_ITEM_NOTIFICATIONS");

        // Early-return when both features are disabled.
        // Visibility is handled by CSS via top-level root classes
        // (shop_recent_purchases_active, shop_item_notifications_active).
        if (!shopEnabled && !notifyEnabled) {
            return;
        }

        if (!GetCachedPanel("recentPurchasesPanel")) {
            SetCachedPanel("recentPurchasesPanel", root.FindChildTraverse("RecentPurchasesPanel"));
        }
        var rpPanel = GetCachedPanel("recentPurchasesPanel");
        if (rpPanel) {
            var panelOffsetX = NormalizeHudOffsetNumber(cfg && cfg.RECENT_PURCHASES_PANEL_X_OFFSET, 0);
            var panelOffsetY = NormalizeHudOffsetNumber(cfg && cfg.RECENT_PURCHASES_PANEL_Y_OFFSET, 0);
            var panelOpacityText = NormalizeOpacityNumber(cfg && cfg.RECENT_PURCHASES_PANEL_OPACITY, 1.0).toFixed(2);
            var panelScaleText = NormalizeHudScaleNumber(cfg && cfg.RECENT_PURCHASES_PANEL_SCALE, 1.0).toFixed(2);
            rpPanel.style.x = String(panelOffsetX) + "px";
            rpPanel.style.y = String(-panelOffsetY) + "px";
            SetPanelOpacitySafe(rpPanel, panelOpacityText, 1.0);
            rpPanel.style.preTransformScale2d = panelScaleText + ", " + panelScaleText;
        }

        var quickMax = Math.round(Number(cfg && cfg.RECENT_PURCHASES_QUICK_MAX) || RECENT_PURCHASE_QUICK_MAX_DEFAULT);
        var quickDisplaySec = Math.round(Number(cfg && cfg.RECENT_PURCHASES_QUICK_DISPLAY_SEC) || RECENT_PURCHASE_QUICK_DISPLAY_SEC_DEFAULT);
        if (quickMax < 1 || quickMax > 5) quickMax = RECENT_PURCHASE_QUICK_MAX_DEFAULT;
        if (quickDisplaySec < 3 || quickDisplaySec > 15) quickDisplaySec = RECENT_PURCHASE_QUICK_DISPLAY_SEC_DEFAULT;

        if (!GetCachedPanel("recentPurchasesContainer")) {
            SetCachedPanel("recentPurchasesContainer", root.FindChildTraverse("RecentPurchasesContainer"));
        }
        var container = GetCachedPanel("recentPurchasesContainer");
        if (!container) return;

        HandleHideoutRP(root);
        CapContainerRP(container);

        var purchases = null;
        if (shopEnabled || notifyEnabled) {
            purchases = container.FindChildrenWithClassTraverse(CLASS_RECENT_PURCHASE);
        }

        if (shopEnabled) {
            UpdateModIconsRP(container, purchases);
            var ctx = BuildContextRP(container);
            CreateFilterCheckboxesRP(root);
            UpdateFilterVisibilityRP(root, ctx);
            ApplyFiltersRP(container, ctx, purchases);
        }

        if (notifyEnabled) {
            var heroPopupsEnabled = IsCfgEnabled(cfg, "ENABLE_HERO_PURCHASE_POPUPS");

            if (heroPopupsEnabled) {
                // Per-hero popup panels on player cards.
                // Centralized QuickPurchasesPanel is hidden by CSS
                // (.shop_recent_purchases_redux #QuickPurchasesPanel).
                State.heroPopup.ultCooldownsEnabled = IsCfgEnabled(cfg, "ENABLE_ULT_COOLDOWNS");
                UpdateHeroPurchasePopups(root, container, quickMax, quickDisplaySec, purchases);
            } else {
                // Default: centralized popup panel.
                // Visibility is handled by CSS via top-level root class
                // (.shop_item_notifications_active #QuickPurchasesPanel).
                UpdateQuickPurchasesRP(root, container, quickMax, quickDisplaySec, purchases);
                var rejuvEnabled      = Number(cfg && cfg.RECENT_PURCHASES_QUICK_REJUV)      !== 0;
                var scoreboardEnabled = Number(cfg && cfg.RECENT_PURCHASES_QUICK_SCOREBOARD) !== 0;
                var quickOffsetX   = NormalizeHudOffsetNumber(cfg && cfg.RECENT_PURCHASES_QUICK_X_OFFSET, 0);
                var quickOffsetY   = NormalizeHudOffsetNumber(cfg && cfg.RECENT_PURCHASES_QUICK_Y_OFFSET, 0);
                var quickOpacityText = NormalizeOpacityNumber(cfg && cfg.RECENT_PURCHASES_QUICK_OPACITY, 1.0).toFixed(2);
                var quickScaleText = NormalizeHudScaleNumber(cfg && cfg.RECENT_PURCHASES_QUICK_SCALE, 1.0).toFixed(2);
                SyncRejuvClassRP(rejuvEnabled);
                var quickPanel = GetCachedPanel("quickPurchasesPanel");
                if (IsPanelValid(quickPanel)) {
                    quickPanel.SetHasClass("rp_quick_scoreboard_active", scoreboardEnabled);
                    quickPanel.style.marginTop = String(ComputeQuickPurchasesMarginTopRP(root, cfg, rejuvEnabled, scoreboardEnabled)) + "px";
                    quickPanel.style.x = String(quickOffsetX) + "px";
                    quickPanel.style.y = String(-quickOffsetY) + "px";
                    SetPanelOpacitySafe(quickPanel, quickOpacityText, 1.0);
                    quickPanel.style.preTransformScale2d = quickScaleText + ", " + quickScaleText;
                }
            }
        }
    }

    // ── Registration ──
    QOL.register("recentPurchases", {
        configKeys: ["ENABLE_SHOP_RECENT_PURCHASES", "ENABLE_SHOP_ITEM_NOTIFICATIONS"],
        bucket: 7, phase: -1,
        requiresRoot: true,
        gate: function(cfg) {
            return IsCfgEnabled(cfg, "ENABLE_SHOP_RECENT_PURCHASES") ||
                   IsCfgEnabled(cfg, "ENABLE_SHOP_ITEM_NOTIFICATIONS");
        },
        update: function(root, cfg) { UpdateRecentPurchases(root, cfg); },
        stateKeys: ["cachedPanels.recentPurchasesPanel",
                    "cachedPanels.recentPurchasesContainer",
                    "cachedPanels.quickPurchasesPanel",
                    "recentPurchaseFiltersCreated", "recentPurchaseLastVisibilitySig",
                    "recentPurchaseLastFilterSig", "recentPurchaseQuickActiveEntries"]
    });

    // Self-test: verify update function exists at load time
    try {
        if (typeof UpdateRecentPurchases !== "function") throw new Error("UpdateRecentPurchases is not a function");
    } catch(e) {
        $.Msg("[QOLLock][ERROR][" + _featureId + "] self-test failed: " + (e && e.message ? e.message : String(e)));
    }

})();

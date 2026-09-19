// manifests/ql_recent_purchases/manifest.js
// =============================================================================
// QOLLOCK — Recent Purchases & Item Buy Notifications
// =============================================================================
// OWNS:        Recent Purchases shop panel filters/icons, Centralized Quick
//              Purchases popup, and Per-Hero purchase popup overlays.
// DOES NOT OWN: CitadelShop core, native purchase event stream
// DEPENDS ON:  QOL.core.FeatureRegistry, QOL.core.Scheduler, QOL.core.Hud
// CONFIG KEYS: ENABLE_SHOP_RECENT_PURCHASES, ENABLE_SHOP_ITEM_NOTIFICATIONS,
//              ENABLE_HERO_PURCHASE_POPUPS, RECENT_PURCHASES_PANEL_X_OFFSET,
//              RECENT_PURCHASES_PANEL_Y_OFFSET, RECENT_PURCHASES_PANEL_OPACITY,
//              RECENT_PURCHASES_PANEL_SCALE, RECENT_PURCHASES_QUICK_X_OFFSET,
//              RECENT_PURCHASES_QUICK_Y_OFFSET, RECENT_PURCHASES_QUICK_OPACITY,
//              RECENT_PURCHASES_QUICK_SCALE, RECENT_PURCHASES_QUICK_MAX,
//              RECENT_PURCHASES_QUICK_DISPLAY_SEC, RECENT_PURCHASES_QUICK_REJUV,
//              RECENT_PURCHASES_QUICK_SCOREBOARD
// CSS:         shop_recent_purchases_active, shop_recent_purchases_redux,
//              shop_item_notifications_active
// PATTERN:     Polling (~5Hz, 0.2s). Self-scheduling via Scheduler.
// =============================================================================

(function() {
    "use strict";

    var FR = QOL.core.FeatureRegistry;
    if (!FR) {
        $.Msg("[QOLLock] ql_recent_purchases: FeatureRegistry not found — aborting");
        return;
    }

    var RECENT_PURCHASE_QUICK_FADE_SEC = 0.4;
    var RECENT_PURCHASE_MAX_ITEMS = 50;
    var RECENT_PURCHASE_QUICK_MAX_DEFAULT = 3;
    var RECENT_PURCHASE_QUICK_DISPLAY_SEC_DEFAULT = 5;
    var PANEL_ID_TOP_BAR = "TopBar";
    var CLASS_ULTIMATE_UNLOCKED = "UltimateUnlocked";
    var CLASS_RECENT_PURCHASE = "recentPurchase";

    var HERO_MAP_IDLE = 0;
    var HERO_MAP_BUILDING = 1;
    var HERO_MAP_BUILT = 2;
    var QUICK_ROW_UI_SCALE = 0.75;
    var QUICK_OVERLAP_GAP = 0;

    var RECENT_PURCHASE_QUICK_CLASSES = [
        "isTier1Purchase", "isTier2Purchase", "isTier3Purchase", "isTier4Purchase",
        "isWeaponPurchase", "isArmorPurchase", "isTechPurchase",
        "isTeam1Purchase", "isTeam2Purchase"
    ];

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

    var isPanelValid = QOL.utils.IsPanelValid;

    function setPanelOpacitySafe(panel, opacityText, fallback) {
        if (!isPanelValid(panel)) return;
        try {
            var target = String(opacityText || fallback);
            if (panel.style.opacity !== target) panel.style.opacity = target;
        } catch(e) {}
    }

    function setStyleIfChanged(panel, prop, val) {
        if (!isPanelValid(panel)) return;
        try {
            if (panel.style[prop] !== val) panel.style[prop] = val;
        } catch(e) {}
    }

    function normalizeOpacityNumber(val, def) {
        var n = Number(val);
        return isFinite(n) && n >= 0 && n <= 1 ? n : (def !== undefined ? def : 1);
    }

    function normalizeHudOffsetNumber(val, def) {
        var n = Number(val);
        return isFinite(n) ? n : (def || 0);
    }

    function normalizeHudScaleNumber(val, def) {
        var n = Number(val);
        return isFinite(n) && n > 0 ? n : (def || 1);
    }

    function hasClassInHierarchy(p, cls) {
        if (typeof QOL_UTILS !== "undefined" && QOL_UTILS.HasClassInHierarchy) {
            return QOL_UTILS.HasClassInHierarchy(p, cls);
        }
        while (p) {
            if (p.BHasClass && p.BHasClass(cls)) return true;
            p = p.GetParent ? p.GetParent() : null;
        }
        return false;
    }

    function getRecentPurchaseName(panel) {
        if (!isPanelValid(panel)) return "";
        var labels = panel.FindChildrenWithClassTraverse("recentModPurchaseName");
        return (labels && labels.length > 0) ? labels[0].text.trim() : "";
    }

    function getRecentPurchaseTimeText(panel) {
        if (!isPanelValid(panel)) return "";
        var labels = panel.FindChildrenWithClassTraverse("recentTimePurchased");
        return (labels && labels.length > 0) ? labels[0].text.trim() : "";
    }

    function getRecentPurchaseHeroName(panel) {
        if (!isPanelValid(panel)) return "";
        var labels = panel.FindChildrenWithClassTraverse("recentModPurchaserHero");
        return (labels && labels.length > 0) ? labels[0].text.trim() : "";
    }

    function getModIcons() {
        if (typeof QOL !== "undefined" && QOL.recentPurchasesIcons) return QOL.recentPurchasesIcons;
        if (typeof MOD_ICONS !== "undefined") return MOD_ICONS;
        return {};
    }

    function getHeroImages() {
        if (typeof HERO_IMAGES !== "undefined") return HERO_IMAGES;
        return {};
    }

    FR.register({
        id: "ql_recent_purchases",
        enabledByDefault: false,
        settings: [
            { key: "ENABLE_SHOP_RECENT_PURCHASES", type: "toggle", default: false },
            { key: "ENABLE_SHOP_ITEM_NOTIFICATIONS", type: "toggle", default: false },
            { key: "ENABLE_HERO_PURCHASE_POPUPS", type: "toggle", default: false },
            { key: "RECENT_PURCHASES_PANEL_X_OFFSET", type: "number", default: 0 },
            { key: "RECENT_PURCHASES_PANEL_Y_OFFSET", type: "number", default: 0 },
            { key: "RECENT_PURCHASES_PANEL_OPACITY", type: "number", default: 1.0 },
            { key: "RECENT_PURCHASES_PANEL_SCALE", type: "number", default: 1.0 },
            { key: "RECENT_PURCHASES_QUICK_X_OFFSET", type: "number", default: 0 },
            { key: "RECENT_PURCHASES_QUICK_Y_OFFSET", type: "number", default: 0 },
            { key: "RECENT_PURCHASES_QUICK_OPACITY", type: "number", default: 1.0 },
            { key: "RECENT_PURCHASES_QUICK_SCALE", type: "number", default: 1.0 },
            { key: "RECENT_PURCHASES_QUICK_MAX", type: "number", default: 3 },
            { key: "RECENT_PURCHASES_QUICK_DISPLAY_SEC", type: "number", default: 5 },
            { key: "RECENT_PURCHASES_QUICK_REJUV", type: "toggle", default: false },
            { key: "RECENT_PURCHASES_QUICK_SCOREBOARD", type: "toggle", default: false }
        ],
        create: function(ctx) {
            var _loop = null;

            // Runtime state
            var _filtersCreated = false;
            var _lastVisibilitySig = null;
            var _lastFilterSig = null;
            var _lastFirstChild = null;
            var _wasInHideout = null;
            var _quickSeenKeys = {};
            var _quickInitialized = false;
            var _quickActiveEntries = [];
            var _rpPanelStyleSig = "";
            var _quickPanelStyleSig = "";

            // Cached panel references
            var _rpPanel = null;
            var _rpContainer = null;
            var _quickPurchasesHostPanel = null;
            var _quickPurchasesPanel = null;
            var _cachedRejuvTimer = null;
            var _topBarPanel = null;

            // Hero popup state
            var _heroPopup = {
                panelsByHero: {},
                activeEntriesByHero: {},
                lastEntryTime: {},
                playerCardCache: {},
                overlapPending: false,
                mapState: HERO_MAP_IDLE,
                buildGen: 0,
                ultCooldownsEnabled: false,
                style: null
            };

            function _buildContextRP(container) {
                var c = { isSpectator: false, localTeam: 0 };
                var p = $.GetContextPanel();
                while (p) {
                    if (p.BHasClass && p.BHasClass("TeamSpectator")) { c.isSpectator = true; break; }
                    p = p.GetParent ? p.GetParent() : null;
                }
                if (!c.isSpectator && container && isPanelValid(container)) {
                    if (hasClassInHierarchy(container, "localPlayerTeam1")) c.localTeam = 1;
                    else if (hasClassInHierarchy(container, "localPlayerTeam2")) c.localTeam = 2;
                }
                return c;
            }

            function _getFilterSigRP(c, container) {
                var sig = (c.isSpectator ? "1" : "0") + c.localTeam + container.GetChildCount();
                for (var i = 0; i < RECENT_PURCHASE_FILTERS.length; i++) {
                    sig += RECENT_PURCHASE_FILTERS[i].active ? "1" : "0";
                }
                return sig;
            }

            function _updateModIconsRP(container, purchases) {
                if (!container || !isPanelValid(container)) return;
                if (!purchases) purchases = container.FindChildrenWithClassTraverse(CLASS_RECENT_PURCHASE);
                var iconsMap = getModIcons();
                for (var i = 0; i < purchases.length; i++) {
                    var purchase = purchases[i];
                    var icons = purchase.FindChildrenWithClassTraverse("mod_icon");
                    if (!icons || icons.length === 0) continue;
                    var icon = icons[0];
                    if (icon.BHasClass("iconSet")) continue;
                    var itemName = getRecentPurchaseName(purchase);
                    if (!itemName) continue;
                    var image = iconsMap[itemName];
                    if (!image) continue;
                    icon.style.backgroundImage = image;
                    icon.style.washColor = "none";
                    icon.AddClass("iconSet");
                }
            }

            function _createFilterCheckboxesRP(root) {
                if (_filtersCreated) return;
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
                    (function(capturedFilter) {
                        $.RegisterEventHandler("Activated", toggle, function() {
                            capturedFilter.active = !capturedFilter.active;
                        });
                    })(filter);
                }

                var existingLabel = panel.FindChild("RecentPurchases");
                var container = panel.FindChild("RecentPurchasesContainer");
                if (existingLabel) existingLabel.SetParent(panel);
                if (container) container.SetParent(panel);

                _filtersCreated = true;
            }

            function _updateFilterVisibilityRP(root, c) {
                var visSig = c.isSpectator ? "1" : "0";
                if (visSig === _lastVisibilitySig) return;
                _lastVisibilitySig = visSig;
                for (var i = 0; i < RECENT_PURCHASE_FILTERS.length; i++) {
                    var filter = RECENT_PURCHASE_FILTERS[i];
                    if (!filter.ShouldShowToggle) continue;
                    var toggle = root.FindChildTraverse(filter.id);
                    if (!toggle) continue;
                    if (filter.ShouldShowToggle(c)) toggle.RemoveClass("filterButtonHidden");
                    else toggle.AddClass("filterButtonHidden");
                }
            }

            function _capContainerRP(container) {
                if (!container || !isPanelValid(container)) return;
                var count = container.GetChildCount();
                while (count > RECENT_PURCHASE_MAX_ITEMS) {
                    container.GetChild(count - 1).DeleteAsync(0);
                    count--;
                }
            }

            function _applyFiltersRP(container, c, purchases) {
                if (!container || !isPanelValid(container)) return;
                var sig = _getFilterSigRP(c, container);
                var firstChild = container.GetChildCount() > 0 ? container.GetChild(0) : null;
                if (sig === _lastFilterSig && firstChild === _lastFirstChild) return;
                _lastFilterSig = sig;
                _lastFirstChild = firstChild;

                if (!purchases) purchases = container.FindChildrenWithClassTraverse(CLASS_RECENT_PURCHASE);
                for (var i = 0; i < purchases.length; i++) {
                    var purchase = purchases[i];
                    var hidden = false;
                    for (var j = 0; j < RECENT_PURCHASE_FILTERS.length; j++) {
                        var filter = RECENT_PURCHASE_FILTERS[j];
                        if (filter.ShouldShowToggle && !filter.ShouldShowToggle(c)) continue;
                        var shouldApply = filter.invert ? !filter.active : filter.active;
                        if (shouldApply && filter.ShouldHideItem(purchase, c)) { hidden = true; break; }
                    }
                    if (hidden) purchase.AddClass("filterHidden");
                    else purchase.RemoveClass("filterHidden");
                }
            }

            function _quickRemoveEntryRP(entry) {
                _quickActiveEntries = _quickActiveEntries.filter(function(e) { return e !== entry; });
                if (!isPanelValid(entry)) return;
                entry.AddClass("quickFading");
                $.Schedule(RECENT_PURCHASE_QUICK_FADE_SEC, function() {
                    if (isPanelValid(entry)) entry.DeleteAsync(0);
                });
            }

            function _quickEvictEntryRP(entry) {
                _quickActiveEntries = _quickActiveEntries.filter(function(e) { return e !== entry; });
                if (isPanelValid(entry)) entry.DeleteAsync(0);
            }

            function _capRecentPurchaseSeenKeys() {
                var count = 0;
                for (var k in _quickSeenKeys) {
                    if (Object.prototype.hasOwnProperty.call(_quickSeenKeys, k)) count++;
                }
                if (count <= 300) return;
                _quickSeenKeys = {};
            }

            function _addQuickEntryRP(sourcePurchase, quickPanel, nameText, quickMax, quickDisplaySec) {
                while (_quickActiveEntries.length >= quickMax) {
                    _quickEvictEntryRP(_quickActiveEntries[0]);
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
                        if (!isPanelValid(p)) return;
                        var heroName = getRecentPurchaseHeroName(src);
                        var heroImages = getHeroImages();
                        var url = heroName ? heroImages[heroName] : null;
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

                var iconsMap = getModIcons();
                var iconUrl = iconsMap[nameText];
                if (iconUrl) {
                    var icon = $.CreatePanel("Panel", itemInfo, "");
                    icon.AddClass("mod_icon");
                    var capturedIcon = icon;
                    var capturedIconUrl = iconUrl;
                    $.Schedule(0, function() {
                        if (isPanelValid(capturedIcon)) {
                            capturedIcon.style.backgroundImage = capturedIconUrl;
                            capturedIcon.style.backgroundSize = "100% 100%";
                        }
                    });
                }

                var nameLabel = $.CreatePanel("Label", itemInfo, "");
                nameLabel.AddClass("quickPurchaseName");
                nameLabel.text = nameText;

                _quickActiveEntries.push(entry);

                $.Schedule(quickDisplaySec, function() {
                    if (isPanelValid(entry)) _quickRemoveEntryRP(entry);
                });
            }

            function _getOrCreateQuickPanelRP(root) {
                if (isPanelValid(_quickPurchasesPanel)) return _quickPurchasesPanel;
                if (!isPanelValid(_quickPurchasesHostPanel)) {
                    _quickPurchasesHostPanel = root.FindChildTraverse(PANEL_ID_TOP_BAR);
                }
                var topBar = _quickPurchasesHostPanel;
                if (!topBar) return null;
                _quickPurchasesPanel = $.CreatePanel("Panel", topBar, "QuickPurchasesPanel");
                return _quickPurchasesPanel;
            }

            function _updateQuickPurchasesRP(root, container, quickMax, quickDisplaySec, purchases) {
                var quickPanel = _getOrCreateQuickPanelRP(root);
                if (!quickPanel || !container || !isPanelValid(container)) return;

                if (!purchases) purchases = container.FindChildrenWithClassTraverse(CLASS_RECENT_PURCHASE);

                if (!_quickInitialized) {
                    for (var i = 0; i < purchases.length; i++) {
                        var n = getRecentPurchaseName(purchases[i]);
                        var t = getRecentPurchaseTimeText(purchases[i]);
                        if (n && t) _quickSeenKeys[n + "|" + t] = true;
                    }
                    _quickInitialized = true;
                    return;
                }

                for (var i = 0; i < purchases.length; i++) {
                    var name = getRecentPurchaseName(purchases[i]);
                    var time = getRecentPurchaseTimeText(purchases[i]);
                    if (!name || !time) continue;
                    var key = name + "|" + time;
                    if (!_quickSeenKeys[key]) {
                        _quickSeenKeys[key] = true;
                        _capRecentPurchaseSeenKeys();
                        if (!purchases[i].BHasClass("filterHidden")) {
                            _addQuickEntryRP(purchases[i], quickPanel, name, quickMax, quickDisplaySec);
                        }
                    }
                }
            }

            function _syncRejuvClassRP(rejuvEnabled) {
                var quickPanel = _quickPurchasesPanel;
                if (!isPanelValid(quickPanel)) return;
                quickPanel.SetHasClass("rp_quick_rejuv_active", !!rejuvEnabled);
                if (!isPanelValid(_cachedRejuvTimer)) {
                    var _ctxPanel = $.GetContextPanel();
                    var _ctxParent = _ctxPanel && _ctxPanel.GetParent ? _ctxPanel.GetParent() : null;
                    _cachedRejuvTimer = _ctxParent ? _ctxParent.FindChildTraverse("RejuvenatorTimer") : null;
                }
                var timer = _cachedRejuvTimer;
                if (!timer) return;
                if (timer.BHasClass("has_rejuv")) quickPanel.AddClass("has_rejuv");
                else quickPanel.RemoveClass("has_rejuv");
            }

            function _getTopBarOverlayBottomRP(panel, fallbackBottom) {
                if (!isPanelValid(panel)) return 0;
                var bottom = 0;
                try {
                    var y = Number(panel.actualyoffset) || 0;
                    var h = Number(panel.actuallayoutheight) || 0;
                    if (isFinite(y) && isFinite(h) && h > 0) bottom = y + h;
                } catch(e) {}
                if (bottom > 0) return bottom;
                return Number(fallbackBottom) || 0;
            }

            function _computeQuickPurchasesMarginTopRP(root, cfg, rejuvEnabled, scoreboardEnabled) {
                var isScoreboardOpen = false;
                try {
                    isScoreboardOpen = scoreboardEnabled && root && root.BHasClass && root.BHasClass("gScoreboardOpen");
                } catch(e) {}

                var marginTop = 90;
                if (isScoreboardOpen) marginTop = 175;
                else {
                    var quickPanel = _quickPurchasesPanel;
                    var hasRejuv = isPanelValid(quickPanel) && quickPanel.BHasClass && quickPanel.BHasClass("has_rejuv");
                    if (rejuvEnabled && hasRejuv) marginTop = 153;
                }

                var occupiedBottom = 0;
                if (Number(cfg.ENABLE_OBJ_MAP) === 1) {
                    var objectiveMap = root && root.FindChildTraverse ? root.FindChildTraverse("ObjectivesMap") : null;
                    occupiedBottom = Math.max(occupiedBottom, _getTopBarOverlayBottomRP(objectiveMap, 112));
                }
                if (Number(cfg.ENABLE_URN_DIFF) === 1) {
                    var urnTracker = root && root.FindChildTraverse ? root.FindChildTraverse("UrnTracker") : null;
                    occupiedBottom = Math.max(occupiedBottom, _getTopBarOverlayBottomRP(urnTracker, 96));
                }

                if (occupiedBottom > 0) {
                    marginTop = Math.max(marginTop, Math.round(occupiedBottom + 12));
                }
                return marginTop;
            }

            function _clearContainerRP(root) {
                var container = isPanelValid(_rpContainer)
                    ? _rpContainer
                    : (root ? root.FindChildTraverse("RecentPurchasesContainer") : null);
                if (container && isPanelValid(container)) {
                    var count = container.GetChildCount();
                    for (var i = 0; i < count; i++) container.GetChild(i).DeleteAsync(0);
                }
                _quickSeenKeys = {};
                _quickInitialized = false;
                _resetHeroPopupState();
            }

            // ── Hero Purchase Popups ──────────────────────────────────────────

            function _buildHeroPlayerCardMap(root) {
                if (_heroPopup.mapState === HERO_MAP_BUILDING) return;
                _heroPopup.mapState = HERO_MAP_BUILDING;
                _heroPopup.buildGen++;
                var myGen = _heroPopup.buildGen;
                var labels = root.FindChildrenWithClassTraverse("HeroNameHidden");
                if (!labels || labels.length === 0) {
                    _heroPopup.mapState = HERO_MAP_IDLE;
                    return;
                }
                var pending = labels.length;
                function onDone() {
                    pending--;
                    if (pending === 0 && _heroPopup.buildGen === myGen) {
                        _heroPopup.mapState = HERO_MAP_BUILT;
                    }
                }
                for (var i = 0; i < labels.length; i++) {
                    (function(label) {
                        var playerPanel = label.GetParent();
                        var badge = null;
                        var badgeWalkGuard = 0;
                        while (playerPanel && isPanelValid(playerPanel) && badgeWalkGuard < 64) {
                            badge = playerPanel.FindChildTraverse("HeroBadge");
                            if (badge) break;
                            playerPanel = playerPanel.GetParent();
                            badgeWalkGuard++;
                        }
                        if (!badge || !playerPanel) { onDone(); return; }
                        var heroId = badge.heroid;
                        if (typeof heroId !== "number" || heroId <= 0) { onDone(); return; }
                        playerPanel.SetDialogVariableInt("hero_id", heroId);
                        $.Schedule(0.3, function() {
                            if (_heroPopup.buildGen !== myGen) return;
                            if (isPanelValid(label)) {
                                var name = label.text.trim().toUpperCase();
                                if (name) {
                                    _heroPopup.playerCardCache[name] = playerPanel;
                                }
                            }
                            onDone();
                        });
                    })(labels[i]);
                }
            }

            function _isHeroPlayerCardMapStale() {
                if (_heroPopup.mapState !== HERO_MAP_BUILT) return false;
                for (var hero in _heroPopup.playerCardCache) {
                    if (!Object.prototype.hasOwnProperty.call(_heroPopup.playerCardCache, hero)) continue;
                    var parentPanel = _heroPopup.playerCardCache[hero];
                    if (!parentPanel || !isPanelValid(parentPanel)) return true;
                }
                return false;
            }

            function _applyHeroPopupStyle(panel) {
                var st = _heroPopup.style;
                if (!st || !isPanelValid(panel)) return;
                setStyleIfChanged(panel, "x", st.x);
                setStyleIfChanged(panel, "y", st.y);
                setStyleIfChanged(panel, "uiScale", st.uiScale);
                setPanelOpacitySafe(panel, st.opacity, 1.0);
            }

            function _getOrCreateHeroPopupPanel(heroNameUpper) {
                if (_heroPopup.panelsByHero[heroNameUpper] &&
                    isPanelValid(_heroPopup.panelsByHero[heroNameUpper])) {
                    return _heroPopup.panelsByHero[heroNameUpper];
                }
                var playerPanel = _heroPopup.playerCardCache[heroNameUpper];
                if (!playerPanel || !isPanelValid(playerPanel)) {
                    if (_heroPopup.mapState !== HERO_MAP_BUILDING) {
                        _heroPopup.mapState = HERO_MAP_IDLE;
                    }
                    return null;
                }
                var panel = $.CreatePanel("Panel", playerPanel, "");
                panel.AddClass("QuickPurchasesPanel");
                _heroPopup.panelsByHero[heroNameUpper] = panel;
                _applyHeroPopupStyle(panel);
                return panel;
            }

            function _syncHeroPopupStyle(offsetX, offsetY, opacityText, scale) {
                var sig = offsetX + "|" + offsetY + "|" + opacityText + "|" + scale;
                if (_heroPopup.style && _heroPopup.style.sig === sig) return;
                _heroPopup.style = {
                    sig: sig,
                    x: String(offsetX) + "px",
                    y: String(-offsetY) + "px",
                    opacity: opacityText,
                    uiScale: Math.round(scale * 100) + "%",
                    scale: scale
                };
                for (var hero in _heroPopup.panelsByHero) {
                    if (!Object.prototype.hasOwnProperty.call(_heroPopup.panelsByHero, hero)) continue;
                    _applyHeroPopupStyle(_heroPopup.panelsByHero[hero]);
                }
                _scheduleResolveHeroPopupOverlaps(0.1);
            }

            function _getHeroPopupScale() {
                var st = _heroPopup.style;
                var n = st ? Number(st.scale) : 1;
                return isFinite(n) && n > 0 ? n : 1;
            }

            function _getPanelLeftInTopBar(panel) {
                var topBar = isPanelValid(_topBarPanel) ? _topBarPanel : null;
                if (!topBar) {
                    try {
                        var root = $.GetContextPanel();
                        var rootGuard = 0;
                        while (root && root.GetParent && root.GetParent() !== null && rootGuard < 64) {
                            root = root.GetParent();
                            rootGuard++;
                        }
                        if (root) {
                            topBar = root.FindChildTraverse(PANEL_ID_TOP_BAR);
                            _topBarPanel = topBar;
                        }
                    } catch(e) {}
                }
                var x = 0;
                var current = panel;
                var walkGuard = 0;
                while (current && isPanelValid(current) && current !== topBar && walkGuard < 64) {
                    var n = Number(current.actualxoffset);
                    x += isFinite(n) ? n : 0;
                    current = current.GetParent();
                    walkGuard++;
                }
                return x;
            }

            function _scheduleResolveHeroPopupOverlaps(delay) {
                if (_heroPopup.overlapPending) return;
                _heroPopup.overlapPending = true;
                $.Schedule(delay || 0, function() {
                    try {
                        _resolveHeroPopupOverlaps();
                    } finally {
                        _heroPopup.overlapPending = false;
                    }
                });
            }

            function _resolveHeroPopupOverlaps() {
                var active = [];
                for (var hero in _heroPopup.panelsByHero) {
                    if (!Object.prototype.hasOwnProperty.call(_heroPopup.panelsByHero, hero)) continue;
                    var p = _heroPopup.panelsByHero[hero];
                    if (!p || !isPanelValid(p)) continue;
                    var entries = _heroPopup.activeEntriesByHero[hero];
                    if (!entries || entries.length === 0) continue;
                    active.push({ hero: hero, panel: p });
                }

                for (var i = 0; i < active.length; i++) {
                    var margin = 125;
                    var parentPanel = active[i].panel.GetParent();
                    if (parentPanel && isPanelValid(parentPanel) && parentPanel.BHasClass(CLASS_ULTIMATE_UNLOCKED)) {
                        if (_heroPopup.ultCooldownsEnabled && !parentPanel.BHasClass("UltimateCooldownReady")) {
                            margin = 172;
                        } else {
                            margin = 152;
                        }
                    }
                    active[i].baseMargin = margin;
                }

                if (active.length === 0) return;
                if (active.length < 2) {
                    active[0].panel.style.marginTop = active[0].baseMargin + "px";
                    return;
                }

                var popupScale = _getHeroPopupScale();
                for (var i = 0; i < active.length; i++) {
                    var rawWidth = Math.max(1, Number(active[i].panel.actuallayoutwidth) || 0);
                    active[i].centerX = _getPanelLeftInTopBar(active[i].panel) + rawWidth / 2;
                    active[i].halfWidth = rawWidth * popupScale / 2;
                }

                active.sort(function(a, b) {
                    var ta = _heroPopup.lastEntryTime[a.hero] || 0;
                    var tb = _heroPopup.lastEntryTime[b.hero] || 0;
                    return tb - ta;
                });

                var margins = [];
                for (var i = 0; i < active.length; i++) margins[i] = active[i].baseMargin;

                for (var i = 1; i < active.length; i++) {
                    if (active[i].halfWidth <= 0) continue;
                    for (var j = 0; j < i; j++) {
                        if (active[j].halfWidth <= 0) continue;
                        var gap = Math.abs(active[i].centerX - active[j].centerX);
                        if (gap < active[i].halfWidth + active[j].halfWidth) {
                            var rowsHeight = (Number(active[j].panel.contentheight) || 0) * QUICK_ROW_UI_SCALE * popupScale;
                            var needed = margins[j] + rowsHeight + QUICK_OVERLAP_GAP;
                            if (needed > margins[i]) margins[i] = needed;
                        }
                    }
                }

                for (var i = 0; i < active.length; i++) {
                    active[i].panel.style.marginTop = margins[i] + "px";
                }
            }

            function _removeHeroPurchaseEntry(entry, heroNameUpper) {
                var arr = _heroPopup.activeEntriesByHero[heroNameUpper];
                if (arr) {
                    var filtered = [];
                    for (var fi = 0; fi < arr.length; fi++) {
                        if (arr[fi] !== entry) filtered.push(arr[fi]);
                    }
                    _heroPopup.activeEntriesByHero[heroNameUpper] = filtered;
                }
                if (!isPanelValid(entry)) return;
                entry.AddClass("quickFading");
                $.Schedule(RECENT_PURCHASE_QUICK_FADE_SEC, function() {
                    if (isPanelValid(entry)) entry.DeleteAsync(0);
                    _scheduleResolveHeroPopupOverlaps(0);
                });
            }

            function _evictHeroPurchaseEntry(entry, heroNameUpper) {
                var arr = _heroPopup.activeEntriesByHero[heroNameUpper];
                if (arr) {
                    var filtered = [];
                    for (var fi = 0; fi < arr.length; fi++) {
                        if (arr[fi] !== entry) filtered.push(arr[fi]);
                    }
                    _heroPopup.activeEntriesByHero[heroNameUpper] = filtered;
                }
                if (isPanelValid(entry)) entry.DeleteAsync(0);
                _scheduleResolveHeroPopupOverlaps(0);
            }

            function _addHeroPurchaseEntry(sourcePurchase, nameText, quickMax, quickDisplaySec) {
                var heroNameUpper = getRecentPurchaseHeroName(sourcePurchase).toUpperCase();
                var quickPanel = _getOrCreateHeroPopupPanel(heroNameUpper);
                if (!quickPanel) return;

                if (!_heroPopup.activeEntriesByHero[heroNameUpper]) {
                    _heroPopup.activeEntriesByHero[heroNameUpper] = [];
                }
                _heroPopup.lastEntryTime[heroNameUpper] = $.FrameTime();

                while (_heroPopup.activeEntriesByHero[heroNameUpper].length >= quickMax) {
                    _evictHeroPurchaseEntry(_heroPopup.activeEntriesByHero[heroNameUpper][0], heroNameUpper);
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

                var iconsMap = getModIcons();
                var iconUrl = iconsMap[nameText];
                if (iconUrl) {
                    var icon = $.CreatePanel("Panel", itemInfo, "");
                    icon.AddClass("mod_icon");
                    (function(p, url) {
                        $.Schedule(0, function() {
                            if (isPanelValid(p)) {
                                p.style.backgroundImage = url;
                                p.style.backgroundSize = "100% 100%";
                            }
                        });
                    })(icon, iconUrl);
                }

                var nameLabel = $.CreatePanel("Label", itemInfo, "");
                nameLabel.AddClass("quickPurchaseName");
                nameLabel.text = nameText;

                _heroPopup.activeEntriesByHero[heroNameUpper].push(entry);

                _scheduleResolveHeroPopupOverlaps(0.1);

                $.Schedule(quickDisplaySec, function() {
                    if (isPanelValid(entry)) _removeHeroPurchaseEntry(entry, heroNameUpper);
                });
            }

            function _resetHeroPopupState() {
                for (var hero in _heroPopup.panelsByHero) {
                    if (!Object.prototype.hasOwnProperty.call(_heroPopup.panelsByHero, hero)) continue;
                    var panel = _heroPopup.panelsByHero[hero];
                    if (panel && isPanelValid(panel)) panel.DeleteAsync(0);
                }
                var ultSetting = _heroPopup.ultCooldownsEnabled;
                var styleSetting = _heroPopup.style || null;
                _heroPopup = {
                    panelsByHero: {},
                    activeEntriesByHero: {},
                    lastEntryTime: {},
                    playerCardCache: {},
                    overlapPending: false,
                    mapState: HERO_MAP_IDLE,
                    buildGen: 0,
                    ultCooldownsEnabled: ultSetting,
                    style: styleSetting
                };
            }

            function _updateHeroPurchasePopups(root, container, quickMax, quickDisplaySec, purchases) {
                if (_isHeroPlayerCardMapStale()) _resetHeroPopupState();
                if (_heroPopup.mapState !== HERO_MAP_BUILT) {
                    _buildHeroPlayerCardMap(root);
                    return;
                }
                if (!container || !isPanelValid(container)) return;

                if (!purchases) purchases = container.FindChildrenWithClassTraverse(CLASS_RECENT_PURCHASE);

                if (!_quickInitialized) {
                    for (var i = 0; i < purchases.length; i++) {
                        var n = getRecentPurchaseName(purchases[i]);
                        var t = getRecentPurchaseTimeText(purchases[i]);
                        if (n && t) _quickSeenKeys[n + "|" + t] = true;
                    }
                    _quickInitialized = true;
                    return;
                }

                for (var i = 0; i < purchases.length; i++) {
                    var purchase = purchases[i];
                    if (!purchase || !isPanelValid(purchase)) continue;
                    var name = getRecentPurchaseName(purchase);
                    var time = getRecentPurchaseTimeText(purchase);
                    if (!name || !time) continue;
                    var key = name + "|" + time;
                    if (!_quickSeenKeys[key]) {
                        _quickSeenKeys[key] = true;
                        _capRecentPurchaseSeenKeys();
                        if (!purchase.BHasClass("filterHidden")) {
                            _addHeroPurchaseEntry(purchase, name, quickMax, quickDisplaySec);
                        }
                    }
                }
            }

            function _handleHideoutRP(root) {
                var hud = QOL.core && QOL.core.Hud;
                var isInHideout = hud && hud.isInHideout ? hud.isInHideout(root) : (root && root.BHasClass && root.BHasClass("hideout_active"));
                if (_wasInHideout === null || isInHideout !== _wasInHideout) {
                    _clearContainerRP(root);
                    $.Schedule(0.5, function() { _clearContainerRP(root); });
                }
                _wasInHideout = isInHideout;
            }

            function _tick() {
                var root = $.GetContextPanel();
                if (!root) return;

                var cfg = ctx.config.view();
                var shopEnabled   = Number(cfg.ENABLE_SHOP_RECENT_PURCHASES) === 1;
                var notifyEnabled = Number(cfg.ENABLE_SHOP_ITEM_NOTIFICATIONS) === 1;

                // Sync root classes
                var heroPopupsEnabled = Number(cfg.ENABLE_HERO_PURCHASE_POPUPS) === 1;
                if (root.SetHasClass) {
                    root.SetHasClass("shop_recent_purchases_active", shopEnabled);
                    root.SetHasClass("shop_recent_purchases_redux", heroPopupsEnabled);
                    root.SetHasClass("shop_item_notifications_active", notifyEnabled);
                }

                if (!shopEnabled && !notifyEnabled) return;

                if (!isPanelValid(_rpPanel)) {
                    _rpPanel = root.FindChildTraverse("RecentPurchasesPanel");
                }
                if (_rpPanel) {
                    var panelOffsetX = normalizeHudOffsetNumber(cfg.RECENT_PURCHASES_PANEL_X_OFFSET, 0);
                    var panelOffsetY = normalizeHudOffsetNumber(cfg.RECENT_PURCHASES_PANEL_Y_OFFSET, 0);
                    var panelOpacityText = normalizeOpacityNumber(cfg.RECENT_PURCHASES_PANEL_OPACITY, 1.0).toFixed(2);
                    var panelScaleText = normalizeHudScaleNumber(cfg.RECENT_PURCHASES_PANEL_SCALE, 1.0).toFixed(2);
                    var rpSig = panelOffsetX + "|" + panelOffsetY + "|" + panelOpacityText + "|" + panelScaleText;
                    if (_rpPanelStyleSig !== rpSig) {
                        setStyleIfChanged(_rpPanel, "x", String(panelOffsetX) + "px");
                        setStyleIfChanged(_rpPanel, "y", String(-panelOffsetY) + "px");
                        setPanelOpacitySafe(_rpPanel, panelOpacityText, 1.0);
                        setStyleIfChanged(_rpPanel, "preTransformScale2d", "1.00, 1.00");
                        setStyleIfChanged(_rpPanel, "uiScale", Math.round(Number(panelScaleText) * 100) + "%");
                        _rpPanelStyleSig = rpSig;
                    }
                }

                var quickMax = Math.round(Number(cfg.RECENT_PURCHASES_QUICK_MAX) || RECENT_PURCHASE_QUICK_MAX_DEFAULT);
                var quickDisplaySec = Math.round(Number(cfg.RECENT_PURCHASES_QUICK_DISPLAY_SEC) || RECENT_PURCHASE_QUICK_DISPLAY_SEC_DEFAULT);
                if (quickMax < 1 || quickMax > 5) quickMax = RECENT_PURCHASE_QUICK_MAX_DEFAULT;
                if (quickDisplaySec < 3 || quickDisplaySec > 15) quickDisplaySec = RECENT_PURCHASE_QUICK_DISPLAY_SEC_DEFAULT;

                if (!isPanelValid(_rpContainer)) {
                    _rpContainer = root.FindChildTraverse("RecentPurchasesContainer");
                }
                var container = _rpContainer;
                if (!container) return;

                _handleHideoutRP(root);
                _capContainerRP(container);

                var purchases = null;
                if (shopEnabled || notifyEnabled) {
                    purchases = container.FindChildrenWithClassTraverse(CLASS_RECENT_PURCHASE);
                }

                if (shopEnabled) {
                    _updateModIconsRP(container, purchases);
                    var c = _buildContextRP(container);
                    _createFilterCheckboxesRP(root);
                    _updateFilterVisibilityRP(root, c);
                    _applyFiltersRP(container, c, purchases);
                }

                if (notifyEnabled) {
                    var quickOffsetX     = normalizeHudOffsetNumber(cfg.RECENT_PURCHASES_QUICK_X_OFFSET, 0);
                    var quickOffsetY     = normalizeHudOffsetNumber(cfg.RECENT_PURCHASES_QUICK_Y_OFFSET, 0);
                    var quickOpacityText = normalizeOpacityNumber(cfg.RECENT_PURCHASES_QUICK_OPACITY, 1.0).toFixed(2);
                    var quickScale       = normalizeHudScaleNumber(cfg.RECENT_PURCHASES_QUICK_SCALE, 1.0);
                    var quickScaleText   = quickScale.toFixed(2);

                    if (heroPopupsEnabled) {
                        _heroPopup.ultCooldownsEnabled = Number(cfg.ENABLE_ULT_COOLDOWNS) === 1;
                        _syncHeroPopupStyle(quickOffsetX, quickOffsetY, quickOpacityText, quickScale);
                        _updateHeroPurchasePopups(root, container, quickMax, quickDisplaySec, purchases);
                    } else {
                        _updateQuickPurchasesRP(root, container, quickMax, quickDisplaySec, purchases);
                        var rejuvEnabled      = Number(cfg.RECENT_PURCHASES_QUICK_REJUV) !== 0;
                        var scoreboardEnabled = Number(cfg.RECENT_PURCHASES_QUICK_SCOREBOARD) !== 0;
                        _syncRejuvClassRP(rejuvEnabled);
                        var quickPanel = _quickPurchasesPanel;
                        if (isPanelValid(quickPanel)) {
                            quickPanel.SetHasClass("rp_quick_scoreboard_active", scoreboardEnabled);
                            var mTop = _computeQuickPurchasesMarginTopRP(root, cfg, rejuvEnabled, scoreboardEnabled);
                            var quickSig = mTop + "|" + quickOffsetX + "|" + quickOffsetY + "|" + quickOpacityText + "|" + quickScaleText;
                            if (_quickPanelStyleSig !== quickSig) {
                                setStyleIfChanged(quickPanel, "marginTop", String(mTop) + "px");
                                setStyleIfChanged(quickPanel, "x", String(quickOffsetX) + "px");
                                setStyleIfChanged(quickPanel, "y", String(-quickOffsetY) + "px");
                                setPanelOpacitySafe(quickPanel, quickOpacityText, 1.0);
                                setStyleIfChanged(quickPanel, "preTransformScale2d", "1.00, 1.00");
                                setStyleIfChanged(quickPanel, "uiScale", Math.round(Number(quickScaleText) * 100) + "%");
                                _quickPanelStyleSig = quickSig;
                            }
                        }
                    }
                }
            }

            return {
                onEnable: function() {
                    var S = QOL.core.Scheduler;
                    _loop = S && S.createPollLoop ? S.createPollLoop(_tick, 0.2, "ql_recent_purchases") : null;
                },
                onDisable: function() {
                    if (_loop) {
                        _loop.stop();
                        _loop = null;
                    }
                    var S = QOL.core.Scheduler;
                    if (S) S.cancelAllForFeature("ql_recent_purchases");
                    if (isPanelValid(_quickPurchasesPanel)) {
                        try { _quickPurchasesPanel.DeleteAsync(0); } catch(e) {}
                        _quickPurchasesPanel = null;
                    }
                    _resetHeroPopupState();
                    _filtersCreated = false;
                    _lastVisibilitySig = null;
                    _lastFilterSig = null;
                    _lastFirstChild = null;
                    _quickSeenKeys = {};
                    _quickInitialized = false;
                    _quickActiveEntries = [];
                    _rpPanel = null;
                    _rpContainer = null;
                    _quickPurchasesHostPanel = null;
                    _cachedRejuvTimer = null;
                    _topBarPanel = null;
                },
                onSettingsChanged: function() {
                    _lastVisibilitySig = null;
                    _lastFilterSig = null;
                    _tick();
                }
            };
        },
        test: function(ctx) {
            try {
                var root = $.GetContextPanel();
                var shop = root ? root.FindChildTraverse("CitadelShop") : null;
                if (!shop) return null;
                return {
                    passed: true,
                    name: "Shop panel exists for recent purchases",
                    message: "",
                    assertions: [{ passed: true, name: "CitadelShop panel exists" }]
                };
            } catch(e) {
                return {
                    passed: false,
                    name: "Recent purchases panel check",
                    message: (e && e.message ? e.message : String(e))
                };
            }
        }
    });
})();

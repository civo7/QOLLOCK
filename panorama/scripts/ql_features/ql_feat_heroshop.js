// ql_feat_heroshop.js — Hero shop HUD customization (offset, scale, opacity, simplify)
// Extracted from ql_core.js, Phase 9 Step 2c
(function() {
    'use strict';
    var _featureId = "ql_feat_heroshop";
    // DEPENDS: getCachedPanel, state, setCachedPanel, setPanelClassCached, utils, normalizeHudOffsetNumber, normalizeHudScaleNumber
    var _deps = QOL.import(["getCachedPanel", "state", "setCachedPanel", "setPanelClassCached", "utils", "normalizeHudOffsetNumber", "normalizeHudScaleNumber"]);
    var GetCachedPanel = _deps.getCachedPanel;
    var State = _deps.state;
    var SetCachedPanel = _deps.setCachedPanel;
    var Utils = _deps.utils;
    var IsCfgEnabled = Utils.IsCfgEnabled;
    var SetPanelOpacitySafe = Utils.SetPanelOpacitySafe;
    var NormalizeOpacityNumber = Utils.NormalizeOpacityNumber;
    var NormalizeHudOffsetNumber = _deps.normalizeHudOffsetNumber;
    var NormalizeHudScaleNumber = _deps.normalizeHudScaleNumber;
    var SetPanelClassCached = _deps.setPanelClassCached;
    var PANEL_ID_HERO_SHOP = "CitadelHudHeroShop";
    // Phase 1.3: HERO_SHOP_PANEL_SEARCH_MS was referenced but never defined.
    var HERO_SHOP_PANEL_SEARCH_MS = 2000;

    function UpdateHeroShopRuntime(root, cfg, nowMs) {
        var shopOffsetXRaw = NormalizeHudOffsetNumber(cfg.SHOP_OFFSET_X, 0);
        var shopOffsetYRaw = NormalizeHudOffsetNumber(cfg.SHOP_OFFSET_Y, 0);
        var shopOpacityText = NormalizeOpacityNumber(cfg.SHOP_OPACITY, 1.0).toFixed(2);
        var shopScaleText = NormalizeHudScaleNumber(cfg.SHOP_SCALE, 1.0).toFixed(2);
        var shopEnabled = IsCfgEnabled(cfg, "HUD_SHOP_ENABLED");
        var simplifyShopStats = IsCfgEnabled(cfg, "ENABLE_SHOP_STATS") && IsCfgEnabled(cfg, "ENABLE_SIMPLIFY_SHOP_STATS");
        var shopRecentPurchases = IsCfgEnabled(cfg, "ENABLE_SHOP_RECENT_PURCHASES");
        var needsHeroShopFeatures =
            simplifyShopStats ||
            shopRecentPurchases ||
            cfg.ENABLE_SIMPLIFY_SHOP === 1 ||
            cfg.ENABLE_SIMPLIFY_ITEMS === 1 ||
            cfg.DISABLE_SHOP_BLUE === 1 ||
            !shopEnabled ||
            shopOffsetXRaw !== 0 ||
            shopOffsetYRaw !== 0 ||
            shopOpacityText !== "1.00" ||
            shopScaleText !== "1.00";

        var heroShop = GetCachedPanel("heroShop");
        if (heroShop && needsHeroShopFeatures) {
            try {
                var shopVis = heroShop.style && heroShop.style.visibility;
                if (shopVis === "collapse") return;
            } catch(eVis) { if (typeof Utils !== "undefined" && Utils.WarnLog) Utils.WarnLog("ql_feat_heroshop", (eVis && eVis.message ? eVis.message : String(eVis || ""))); }
        }
        if (needsHeroShopFeatures && !heroShop && nowMs >= (State.heroShopNextSearchMs || 0)) {
            heroShop = root.FindChildTraverse(PANEL_ID_HERO_SHOP);
            SetCachedPanel("heroShop", heroShop);
            State.heroShopNextSearchMs = heroShop ? 0 : (nowMs + HERO_SHOP_PANEL_SEARCH_MS);
        }
        if (needsHeroShopFeatures) {
            if (heroShop) {
                SetPanelClassCached(heroShop, State.heroShopClassCache, "simplify_shop_stats_active", simplifyShopStats);
                SetPanelClassCached(heroShop, State.heroShopClassCache, "simplify_shop_active", cfg.ENABLE_SIMPLIFY_SHOP === 1);
                SetPanelClassCached(heroShop, State.heroShopClassCache, "simplify_items_active", cfg.ENABLE_SIMPLIFY_ITEMS === 1);
                SetPanelClassCached(heroShop, State.heroShopClassCache, "disable_shop_blue_active", cfg.DISABLE_SHOP_BLUE === 1);
                SetPanelClassCached(heroShop, State.heroShopClassCache, "shop_recent_purchases_active", shopRecentPurchases);

                var heroShopMainPanel = GetCachedPanel("heroShopMainPanel");
                if (!heroShopMainPanel) {
                    heroShopMainPanel = heroShop.FindChildTraverse("MainPanel");
                    SetCachedPanel("heroShopMainPanel", heroShopMainPanel);
                }
                if (heroShopMainPanel) {
                    var marginLeftText = String(shopOffsetXRaw) + "px";
                    var marginRightText = String(-shopOffsetXRaw) + "px";
                    var marginTopText = String(-shopOffsetYRaw) + "px";
                    var marginBottomText = String(shopOffsetYRaw) + "px";
                    var styleSig = marginLeftText + "|" + marginRightText + "|" + marginTopText + "|" + marginBottomText + "|" + shopOpacityText + "|" + shopScaleText + "|" + (shopEnabled ? "1" : "0");
                    if (State.heroShopMainPanelStyleSig !== styleSig) {
                        heroShopMainPanel.style.marginLeft = marginLeftText;
                        heroShopMainPanel.style.marginRight = marginRightText;
                        heroShopMainPanel.style.marginTop = marginTopText;
                        heroShopMainPanel.style.marginBottom = marginBottomText;
                        heroShopMainPanel.style.x = "0px";
                        heroShopMainPanel.style.y = "0px";
                        heroShopMainPanel.style.preTransformScale2d = shopScaleText + ", " + shopScaleText;
                        heroShopMainPanel.style.visibility = shopEnabled ? "visible" : "collapse";
                        SetPanelOpacitySafe(heroShopMainPanel, shopOpacityText, 1.0);
                        State.heroShopMainPanelStyleSig = styleSig;
                    }
                }
            } else {
                SetCachedPanel("heroShopMainPanel", null);
                State.heroShopMainPanelStyleSig = "";
            }
        } else if (heroShop) {
            SetPanelClassCached(heroShop, State.heroShopClassCache, "simplify_shop_stats_active", false);
            SetPanelClassCached(heroShop, State.heroShopClassCache, "simplify_shop_active", false);
            SetPanelClassCached(heroShop, State.heroShopClassCache, "simplify_items_active", false);
            SetPanelClassCached(heroShop, State.heroShopClassCache, "disable_shop_blue_active", false);
            SetPanelClassCached(heroShop, State.heroShopClassCache, "shop_recent_purchases_active", false);

            var resetMainPanel = GetCachedPanel("heroShopMainPanel");
            if (!resetMainPanel) {
                resetMainPanel = heroShop.FindChildTraverse("MainPanel");
                SetCachedPanel("heroShopMainPanel", resetMainPanel);
            }
            if (resetMainPanel) {
                var resetSig = "0px|0px|0px|0px|1.00|1.00|1";
                if (State.heroShopMainPanelStyleSig !== resetSig) {
                    resetMainPanel.style.marginLeft = "0px";
                    resetMainPanel.style.marginRight = "0px";
                    resetMainPanel.style.marginTop = "0px";
                    resetMainPanel.style.marginBottom = "0px";
                    resetMainPanel.style.x = "0px";
                    resetMainPanel.style.y = "0px";
                    resetMainPanel.style.preTransformScale2d = "1.00, 1.00";
                    resetMainPanel.style.visibility = "visible";
                    SetPanelOpacitySafe(resetMainPanel, 1.0, 1.0);
                }
            }
            SetCachedPanel("heroShop", null);
            SetCachedPanel("heroShopMainPanel", null);
            State.heroShopMainPanelStyleSig = "";
        }
    }

    // ── Registration ──
    QOL.register("heroShop", {
        configKeys: ["HUD_SHOP_ENABLED", "SHOP_OFFSET_X", "SHOP_OFFSET_Y",
                     "SHOP_OPACITY", "SHOP_SCALE", "ENABLE_SHOP_STATS",
                     "ENABLE_SIMPLIFY_SHOP_STATS", "ENABLE_SHOP_RECENT_PURCHASES",
                     "ENABLE_SIMPLIFY_SHOP", "ENABLE_SIMPLIFY_ITEMS", "DISABLE_SHOP_BLUE"],
        bucket: 4, phase: 4,
        requiresRoot: true,
        gate: function(cfg) {
            return IsCfgEnabled(cfg, "ENABLE_SHOP_STATS") ||
                   IsCfgEnabled(cfg, "ENABLE_SHOP_RECENT_PURCHASES") ||
                   cfg.ENABLE_SIMPLIFY_SHOP === 1 ||
                   cfg.ENABLE_SIMPLIFY_ITEMS === 1 ||
                   cfg.DISABLE_SHOP_BLUE === 1 ||
                   !IsCfgEnabled(cfg, "HUD_SHOP_ENABLED") ||
                   NormalizeHudOffsetNumber(cfg.SHOP_OFFSET_X, 0) !== 0 ||
                   NormalizeHudOffsetNumber(cfg.SHOP_OFFSET_Y, 0) !== 0 ||
                   NormalizeOpacityNumber(cfg.SHOP_OPACITY, 1.0) !== 1.0 ||
                   NormalizeHudScaleNumber(cfg.SHOP_SCALE, 1.0) !== 1.0;
        },
        update: function(root, cfg, nowMs, State, hideoutConnected) {
                        try {
                UpdateHeroShopRuntime(root, cfg, nowMs);
            } catch(e) {
                $.Msg("[QOLLock][ERROR][" + _featureId + "] " + (e && e.message ? e.message : String(e)) + "\n" + (e && e.stack ? String(e.stack) : ""));
                throw e;
            }
        },
        stateKeys: ["heroShopNextSearchMs", "heroShopClassCache",
                    "heroShopMainPanelStyleSig"]
    });

    // Self-test: verify update function exists at load time
    try {
        if (typeof UpdateHeroShopRuntime !== "function") throw new Error("UpdateHeroShopRuntime is not a function");
    } catch(e) {
        $.Msg("[QOLLock][ERROR][" + _featureId + "] self-test failed: " + (e && e.message ? e.message : String(e)));
    }

})();

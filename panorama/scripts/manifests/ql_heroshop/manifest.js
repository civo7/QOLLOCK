// features/ql_heroshop/manifest.js
// =============================================================================
// QOLLOCK — Hero Shop HUD customization (offset, scale, opacity, simplify)
// =============================================================================
// OWNS:        Shop MainPanel layout, simplify/discount classes, recent purchases
// DOES NOT OWN: Shop content, build system
// DEPENDS ON:  QOL.core.FeatureRegistry, QOL.core.Scheduler
// CONFIG KEYS: HUD_SHOP_ENABLED, SHOP_OFFSET_X/Y, SHOP_OPACITY, SHOP_SCALE,
//              ENABLE_SIMPLIFY_SHOP, ENABLE_SIMPLIFY_ITEMS, DISABLE_SHOP_BLUE,
//              ENABLE_SHOP_STATS, ENABLE_SIMPLIFY_SHOP_STATS, ENABLE_SHOP_RECENT_PURCHASES
// PATTERN:     Polling (~20Hz). Panel caching with lazy discovery.
//              Signature diffing to skip redundant style writes.
// =============================================================================

(function() {
    "use strict";
    var FR = QOL.core.FeatureRegistry;
    if (!FR) { $.Msg("[QOLLock] heroshop: FeatureRegistry not found — aborting"); return; }

    FR.register({
        id: "ql_heroshop",
        enabledByDefault: false,
        settings: [
            { key: "HUD_SHOP_ENABLED", type: "toggle", default: true },
            { key: "SHOP_OFFSET_X", type: "slider", min: -500, max: 500, step: 5, default: 0 },
            { key: "SHOP_OFFSET_Y", type: "slider", min: -500, max: 500, step: 5, default: 0 },
            { key: "SHOP_OPACITY", type: "slider", min: 0, max: 1, step: 0.05, default: 1 },
            { key: "SHOP_SCALE", type: "slider", min: 0.5, max: 1.5, step: 0.05, default: 1 },
            { key: "ENABLE_SIMPLIFY_SHOP", type: "toggle", default: false },
            { key: "ENABLE_SIMPLIFY_ITEMS", type: "toggle", default: false },
            { key: "DISABLE_SHOP_BLUE", type: "toggle", default: false },
            { key: "ENABLE_SHOP_STATS", type: "toggle", default: false },
            { key: "ENABLE_SIMPLIFY_SHOP_STATS", type: "toggle", default: false },
            { key: "ENABLE_SHOP_RECENT_PURCHASES", type: "toggle", default: false }
        ],
        create: function(ctx) {
            var PANEL_ID = "CitadelHudHeroShop";
            var PANEL_SEARCH_MS = 2000;
            var _loop = null;
            var _shopPanel = null;
            var _mainPanel = null;
            var _classCache = {};
            var _styleSig = "";
            var _nextSearchMs = 0;

            function _isAlive(p) { return p && typeof p.IsValid === "function" && p.IsValid(); }

            function _normOffset(v, d) { var n = Math.round(Number(v)); return isFinite(n) ? n : d; }
            function _normOpacity(v, d) { var n = Number(v); return isFinite(n) && n >= 0 && n <= 1 ? n : d; }
            function _normScale(v, d) { var n = Number(v); return isFinite(n) && n >= 0.5 && n <= 1.5 ? n : d; }
            function _isOn(cfg, k) { return Number(cfg[k]) === 1; }

            function _setClass(panel, cls, on) {
                if (!_isAlive(panel)) return;
                if (_classCache[cls] === on) return;
                _classCache[cls] = on;
                try { panel.SetHasClass(cls, on); } catch(e) {}
            }

            function _needsFeatures(cfg) {
                var simplifyStats = _isOn(cfg, "ENABLE_SHOP_STATS") && _isOn(cfg, "ENABLE_SIMPLIFY_SHOP_STATS");
                var recentPurchases = _isOn(cfg, "ENABLE_SHOP_RECENT_PURCHASES");
                return simplifyStats || recentPurchases ||
                    Number(cfg.ENABLE_SIMPLIFY_SHOP) === 1 || Number(cfg.ENABLE_SIMPLIFY_ITEMS) === 1 ||
                    Number(cfg.DISABLE_SHOP_BLUE) === 1 || !_isOn(cfg, "HUD_SHOP_ENABLED") ||
                    _normOffset(cfg.SHOP_OFFSET_X, 0) !== 0 || _normOffset(cfg.SHOP_OFFSET_Y, 0) !== 0 ||
                    _normOpacity(cfg.SHOP_OPACITY, 1.0) !== 1.0 || _normScale(cfg.SHOP_SCALE, 1.0) !== 1.0;
            }

            function _tick() {
                try {
                    var root = $.GetContextPanel();
                    if (!root) return;
                    var now = Date.now ? Date.now() : (new Date()).getTime();
                    var cfg = ctx.config.all();

                    var shopOffsetX = _normOffset(cfg.SHOP_OFFSET_X, 0);
                    var shopOffsetY = _normOffset(cfg.SHOP_OFFSET_Y, 0);
                    var shopOpacity = _normOpacity(cfg.SHOP_OPACITY, 1.0);
                    var shopScale = _normScale(cfg.SHOP_SCALE, 1.0);
                    var shopEnabled = _isOn(cfg, "HUD_SHOP_ENABLED");
                    var simplifyStats = _isOn(cfg, "ENABLE_SHOP_STATS") && _isOn(cfg, "ENABLE_SIMPLIFY_SHOP_STATS");
                    var recentPurchases = _isOn(cfg, "ENABLE_SHOP_RECENT_PURCHASES");
                    var needsFeatures = _needsFeatures(cfg);

                    // ── Hidden guard ──
                    if (_isAlive(_shopPanel) && needsFeatures) {
                        try { if (_shopPanel.BHasClass && _shopPanel.BHasClass("qol-hidden")) return; } catch(e) {}
                    }

                    // ── Panel discovery ──
                    if (needsFeatures && !_isAlive(_shopPanel) && now >= _nextSearchMs) {
                        _shopPanel = root.FindChildTraverse ? root.FindChildTraverse(PANEL_ID) : null;
                        _mainPanel = _isAlive(_shopPanel) && _shopPanel.FindChildTraverse ? _shopPanel.FindChildTraverse("MainPanel") : null;
                        _nextSearchMs = _isAlive(_shopPanel) ? 0 : (now + PANEL_SEARCH_MS);
                        _classCache = {};
                        _styleSig = "";
                    }

                    // ── Apply ──
                    if (needsFeatures && _isAlive(_shopPanel)) {
                        _setClass(_shopPanel, "simplify_shop_stats_active", simplifyStats);
                        _setClass(_shopPanel, "simplify_shop_active", Number(cfg.ENABLE_SIMPLIFY_SHOP) === 1);
                        _setClass(_shopPanel, "simplify_items_active", Number(cfg.ENABLE_SIMPLIFY_ITEMS) === 1);
                        _setClass(_shopPanel, "disable_shop_blue_active", Number(cfg.DISABLE_SHOP_BLUE) === 1);
                        _setClass(_shopPanel, "shop_recent_purchases_active", recentPurchases);

                        // Refresh main panel cache if needed
                        if (!_isAlive(_mainPanel) && _shopPanel.FindChildTraverse) {
                            _mainPanel = _shopPanel.FindChildTraverse("MainPanel");
                        }
                        if (_isAlive(_mainPanel)) {
                            var marginLeftText = shopOffsetX + "px";
                            var marginRightText = (-shopOffsetX) + "px";
                            var marginTopText = (-shopOffsetY) + "px";
                            var marginBottomText = shopOffsetY + "px";
                            var opacityText = shopOpacity.toFixed(2);
                            var scaleText = shopScale.toFixed(2);
                            var sig = marginLeftText + "|" + marginRightText + "|" + marginTopText + "|" + marginBottomText + "|" + opacityText + "|" + scaleText + "|" + (shopEnabled ? "1" : "0");
                            if (_styleSig !== sig) {
                                _mainPanel.style.marginLeft = marginLeftText;
                                _mainPanel.style.marginRight = marginRightText;
                                _mainPanel.style.marginTop = marginTopText;
                                _mainPanel.style.marginBottom = marginBottomText;
                                _mainPanel.style.x = "0px";
                                _mainPanel.style.y = "0px";
                                _mainPanel.style.preTransformScale2d = scaleText + ", " + scaleText;
                                if (_mainPanel.SetHasClass) _mainPanel.SetHasClass("qol-hidden", !shopEnabled);
                                else _mainPanel.style.visibility = shopEnabled ? "visible" : "collapse";
                                try {
                                    if (typeof Utils !== "undefined" && Utils.SetPanelOpacitySafe) {
                                        Utils.SetPanelOpacitySafe(_mainPanel, opacityText, 1.0);
                                    } else {
                                        _mainPanel.style.opacity = opacityText;
                                    }
                                } catch(e) {}
                                _styleSig = sig;
                            }
                        }
                        // Write State for cross-feature compat
                        try {
                            if (typeof QOL !== "undefined" && QOL.state) {
                                var st = QOL.state;
                                st.heroShopMainPanelStyleSig = _styleSig;
                                st.heroShopNextSearchMs = _nextSearchMs;
                            }
                        } catch(e) {}
                    } else if (!needsFeatures && _isAlive(_shopPanel)) {
                        // ── Cleanup: reset all classes + styles ──
                        _setClass(_shopPanel, "simplify_shop_stats_active", false);
                        _setClass(_shopPanel, "simplify_shop_active", false);
                        _setClass(_shopPanel, "simplify_items_active", false);
                        _setClass(_shopPanel, "disable_shop_blue_active", false);
                        _setClass(_shopPanel, "shop_recent_purchases_active", false);

                        if (!_isAlive(_mainPanel) && _shopPanel.FindChildTraverse) {
                            _mainPanel = _shopPanel.FindChildTraverse("MainPanel");
                        }
                        if (_isAlive(_mainPanel)) {
                            var resetSig = "0px|0px|0px|0px|1.00|1.00|1";
                            if (_styleSig !== resetSig) {
                                _mainPanel.style.marginLeft = "0px";
                                _mainPanel.style.marginRight = "0px";
                                _mainPanel.style.marginTop = "0px";
                                _mainPanel.style.marginBottom = "0px";
                                _mainPanel.style.x = "0px";
                                _mainPanel.style.y = "0px";
                                _mainPanel.style.preTransformScale2d = "1.00, 1.00";
                                if (_mainPanel.SetHasClass) _mainPanel.SetHasClass("qol-hidden", false);
                                else _mainPanel.style.visibility = "visible";
                                try {
                                    if (typeof Utils !== "undefined" && Utils.SetPanelOpacitySafe) {
                                        Utils.SetPanelOpacitySafe(_mainPanel, 1.0, 1.0);
                                    } else {
                                        _mainPanel.style.opacity = "1.00";
                                    }
                                } catch(e) {}
                            }
                        }
                        _shopPanel = null;
                        _mainPanel = null;
                        _classCache = {};
                        _styleSig = "";
                        _nextSearchMs = 0;
                        try {
                            if (typeof QOL !== "undefined" && QOL.state) {
                                QOL.state.heroShopMainPanelStyleSig = "";
                            }
                        } catch(e) {}
                    }
                } catch(e) {
                    if (typeof QOL !== "undefined" && QOL.core && QOL.core.Logger) {
                        QOL.core.Logger.logError("ql_heroshop", "_tick: " + (e.message || e));
                    }
                    throw e;
                }
            }

            return {
                onEnable: function() {
                    var S = QOL.core.Scheduler;
                    _loop = S && S.createPollLoop ? S.createPollLoop(_tick, 0.05, "ql_heroshop") : null;
                },
                onDisable: function() {
                    if (_loop) { _loop.stop(); _loop = null; }
                    // Reset panels to default
                    if (_isAlive(_shopPanel)) {
                        _setClass(_shopPanel, "simplify_shop_stats_active", false);
                        _setClass(_shopPanel, "simplify_shop_active", false);
                        _setClass(_shopPanel, "simplify_items_active", false);
                        _setClass(_shopPanel, "disable_shop_blue_active", false);
                        _setClass(_shopPanel, "shop_recent_purchases_active", false);
                    }
                    if (_isAlive(_mainPanel)) {
                        try {
                            _mainPanel.style.marginLeft = "0px";
                            _mainPanel.style.marginRight = "0px";
                            _mainPanel.style.marginTop = "0px";
                            _mainPanel.style.marginBottom = "0px";
                            _mainPanel.style.x = "0px";
                            _mainPanel.style.y = "0px";
                            _mainPanel.style.preTransformScale2d = "1.00, 1.00";
                            if (_mainPanel.SetHasClass) _mainPanel.SetHasClass("qol-hidden", false);
                            try { _mainPanel.style.opacity = "1.00"; } catch(e2) {}
                        } catch(e) {}
                    }
                    _shopPanel = null; _mainPanel = null; _classCache = {}; _styleSig = ""; _nextSearchMs = 0;
                },
                onSettingsChanged: function() { _styleSig = ""; }
            };
        },
    test: function(ctx) {
        try {
            var root = $.GetContextPanel();
            var shop = root ? root.FindChildTraverse("CitadelShop") : null;
            if (!shop) return null;  // Skip — not in a match context
            return { passed: true, name: "Hero shop panel exists", message: "", assertions: [{ passed: true, name: "CitadelShop panel exists" }] };
        } catch(e) { return { passed: false, name: "Hero shop panel check", message: (e && e.message ? e.message : String(e)) }; }
    }
    });
})();

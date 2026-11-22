// OWNS: Shop MainPanel and permanent stats geometry, visibility and local appearance classes.
// DOES NOT OWN: Native shop/build content, recent-purchase data or the quickbuy context.
// Source: hud.xml > .HudCore > CitadelHudHeroShop; citadel_hud_hero_shop.xml > Shop > MainPanel.
(() => {
    "use strict";
    QOL.core.FeatureRegistry.register({
        id: "ql_heroshop",
        // A hidden or closed shop still needs reactive settings and replacement discovery.
        enabledByDefault: true,
        settings: [
            ...QOL.presentation.stateSettings("ql_heroshop"),
            { key: "HUD_SHOP_ENABLED", type: "toggle" },
            { key: "ENABLE_HERO_SCENE_PANEL", type: "toggle", label: "Hero", description: "Shows your character in the shop menu." },
            { key: "DISABLE_QUICK_BUY", type: "toggle", invert: true, label: "Quick Buy", description: "The item buying auto queue system in the shop menu." },
            { key: "ENABLE_ENHANCED_QUICKBUY", type: "toggle" },
            { key: "ENHANCED_QUICKBUY_COUNT", type: "slider", label: "Enhanced Count", description: "Controls how many enhanced quickbuy preview items are shown." },
            { key: "ENABLE_QUICKBUY_CLICK_TO_NOTIFY", type: "toggle", label: "Click to Notify", description: "Notify your teammates in chat about how close you are to a quickbuy purchase." },
            { key: "SHOP_OFFSET_X", type: "slider" },
            { key: "SHOP_OFFSET_Y", type: "slider" },
            { key: "SHOP_OPACITY", type: "slider" },
            { key: "SHOP_SCALE", type: "slider" },
            { key: "ENABLE_SIMPLIFY_SHOP", type: "toggle" },
            { key: "ENABLE_SIMPLIFY_ITEMS", type: "toggle" },
            { key: "DISABLE_SHOP_BLUE", type: "toggle" },
            { key: "ENABLE_SHOP_STATS", type: "toggle" },
            { key: "ENABLE_SIMPLIFY_SHOP_STATS", type: "toggle" },
            { key: "SHOP_STATS_X_OFFSET", type: "slider" },
            { key: "SHOP_STATS_Y_OFFSET", type: "slider" },
            { key: "SHOP_STATS_SCALE", type: "slider" },
            { key: "SHOP_STATS_OPACITY", type: "slider" },
            { key: "ENABLE_SHOP_RECENT_PURCHASES", type: "toggle" }
        ],
        create(ctx) {
            const P = QOL.core.panel;
            const U = QOL.utils;
            const S = QOL.core.Scheduler;
            const shopResolver = QOL.panelCache.createIdResolver("CitadelHudHeroShop", {
                retryMs: 2000, ownerPath: [{ id: "Hud", optional: true }, { className: "HudCore" }]
            });
            const mainResolver = QOL.panelCache.createIdResolver("MainPanel", {
                retryMs: 2000, ownerPath: ["Shop"]
            });
            const owners = P.createNativeStyleOwner();
            let shop = null, main = null, stats = null, model = null, loop = null, pending = null, enabled = false;

            const number = (cfg, key) => QOL.settings.readNumber(key, cfg[key]);

            function on(cfg, key) {
                const value = cfg[key] === undefined ? QOL_DEFAULT_CONFIG[key] : cfg[key];
                return Number(value) === 1;
            }

            function readModel() {
                const cfg = QOL.presentation.captureVisibility(ctx, ctx.config.view());
                const x = number(cfg, "SHOP_OFFSET_X"), y = number(cfg, "SHOP_OFFSET_Y");
                const scale = number(cfg, "SHOP_SCALE"), opacity = U.NormalizeOpacityNumber(cfg.SHOP_OPACITY ?? 1, 1);
                const hidden = !on(cfg, "HUD_SHOP_ENABLED");
                const styles = {};
                // Preserve paired-margin offset units. At zero, release the override
                // so native/training/simplified shop CSS remains authoritative.
                if (x !== 0) { styles.marginLeft = x + "px"; styles.marginRight = -x + "px"; }
                if (y !== 0) { styles.marginTop = -y + "px"; styles.marginBottom = y + "px"; }
                if (scale !== 1) styles.uiScale = Math.round(scale * 100) + "%";
                if (opacity !== 1) styles.opacity = opacity.toFixed(2);
                if (hidden) styles.visibility = "collapse";
                const statsEnabled = on(cfg, "ENABLE_SHOP_STATS");
                const statsStyles = {};
                if (statsEnabled) {
                    const statsX = number(cfg, "SHOP_STATS_X_OFFSET"), statsY = number(cfg, "SHOP_STATS_Y_OFFSET");
                    const statsScale = number(cfg, "SHOP_STATS_SCALE"), statsOpacity = number(cfg, "SHOP_STATS_OPACITY");
                    if (statsX !== 0) statsStyles.x = statsX + "px";
                    if (statsY !== 0) statsStyles.y = -statsY + "px";
                    if (statsScale !== 100) statsStyles.uiScale = statsScale + "%";
                    if (statsOpacity !== 1) statsStyles.opacity = statsOpacity.toFixed(2);
                }
                return { hidden, styles, statsStyles: Object.keys(statsStyles).length ? statsStyles : null, classes: {
                    simplify_shop_stats_active: statsEnabled && on(cfg, "ENABLE_SIMPLIFY_SHOP_STATS"),
                    simplify_shop_active: on(cfg, "ENABLE_SIMPLIFY_SHOP"),
                    simplify_items_active: on(cfg, "ENABLE_SIMPLIFY_ITEMS"),
                    disable_shop_blue_active: on(cfg, "DISABLE_SHOP_BLUE"),
                    shop_recent_purchases_active: on(cfg, "ENABLE_SHOP_RECENT_PURCHASES")
                } };
            }

            function discover(force) {
                const root = P.findHud($.GetContextPanel());
                const currentShop = P.isAlive(root) && (root.id === "Hud" || root.paneltype === "CitadelHud") ? shopResolver.resolve(root, force) : null;
                if (currentShop !== shop) {
                    shop = currentShop; main = null;
                    mainResolver.reset();
                }
                main = mainResolver.resolve(shop, force);
                const nav = model.statsStyles ? P.findChild(P.findChild(shop, "Shop"), "NavPanel") : null;
                stats = P.findChild(nav, "TestPanel");
                owners.retain([shop, main, stats].filter(P.isAlive));
                return root;
            }

            function render(root) {
                if (P.isAlive(shop)) owners.apply(shop, {}, Object.fromEntries(Object.entries(model.classes).filter(([, active]) => active)));
                if (P.isAlive(main)) owners.apply(main, QOL.presentation.visibilityStyles("shop", QOL.presentation.visibilityConfig(ctx), root, model.styles), { "qol-hidden": model.hidden });
                if (P.isAlive(stats)) owners.apply(stats, model.statsStyles);
            }

            function update(force = false) {
                if (!enabled || !model) return;
                render(discover(force));
            }

            function refreshSettings() {
                if (!enabled) return;
                model = readModel();
                QOL.core.hud.refreshRootClasses($.GetContextPanel());
                update(true);
            }

            function onShopTransition() {
                if (!enabled || pending) return;
                pending = S.scheduleOnce(() => { pending = null; update(true); }, 0, ctx.id);
            }

            return QOL.presentation.bindVisibility(ctx, {
                onEnable() {
                    enabled = true;
                    ctx.events?.on("engine:shop_opened", onShopTransition);
                    ctx.events?.on("engine:shop_closed", onShopTransition);
                    refreshSettings();
                    loop = S.createPollLoop(update, 1, ctx.id);
                },
                onSettingsChanged: refreshSettings,
                onDisable() {
                    enabled = false;
                    ctx.events?.off("engine:shop_opened", onShopTransition);
                    ctx.events?.off("engine:shop_closed", onShopTransition);
                    if (pending) { pending.stop(); pending = null; }
                    if (loop) { loop.stop(); loop = null; }
                    owners.clear();
                    shop = null; main = null; stats = null; model = null;
                    shopResolver.reset(); mainResolver.reset();
                }
            }, update);
        },
        test() {
            try {
                const shop = QOL.core.panel.findTraverse($.GetContextPanel(), "CitadelHudHeroShop");
                if (!shop) return null;
                return { passed: true, name: "Hero shop panel exists", message: "",
                    assertions: [{ passed: true, name: "CitadelHudHeroShop panel exists" }] };
            } catch (e) {
                return { passed: false, name: "Hero shop panel check", message: e.message || String(e) };
            }
        }
    });
})();

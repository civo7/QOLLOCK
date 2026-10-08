// OWNS: Shop MainPanel offsets, scale, opacity, visibility and local appearance classes.
// DOES NOT OWN: Native shop/build content, recent-purchase data or the quickbuy context.
// Source: hud.xml > .HudCore > CitadelHudHeroShop; citadel_hud_hero_shop.xml > Shop > MainPanel.
(() => {
    "use strict";
    QOL.core.FeatureRegistry.register({
        id: "ql_heroshop",
        // A hidden or closed shop still needs reactive settings and replacement discovery.
        enabledByDefault: true,
        settings: [
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
            { key: "ENABLE_SHOP_RECENT_PURCHASES", type: "toggle" }
        ],
        create(ctx) {
            const P = QOL.core.panel;
            const U = QOL.utils;
            const S = QOL.core.Scheduler;
            const fields = new Map(QOL.settingsFields.map(field => [field.key, field]));
            const shopResolver = QOL.panelCache.createIdResolver("CitadelHudHeroShop", {
                retryMs: 2000, ownerPath: [{ id: "Hud", optional: true }, { className: "HudCore" }]
            });
            const mainResolver = QOL.panelCache.createIdResolver("MainPanel", {
                retryMs: 2000, ownerPath: ["Shop"]
            });
            const owners = new Map();
            let shop = null, main = null, model = null, loop = null, pending = null, enabled = false;

            function number(cfg, key, round = false) {
                const field = fields.get(key);
                return U.ClampConfigNumber(cfg[key] ?? QOL_DEFAULT_CONFIG[key], QOL_DEFAULT_CONFIG[key], field.min, field.max, round);
            }

            function on(cfg, key) {
                const value = cfg[key] === undefined ? QOL_DEFAULT_CONFIG[key] : cfg[key];
                return Number(value) === 1;
            }

            function readModel() {
                const cfg = ctx.config.view();
                const x = number(cfg, "SHOP_OFFSET_X", true), y = number(cfg, "SHOP_OFFSET_Y", true);
                const scale = number(cfg, "SHOP_SCALE"), opacity = number(cfg, "SHOP_OPACITY");
                const hidden = !on(cfg, "HUD_SHOP_ENABLED");
                const styles = {};
                // Preserve paired-margin offset units. At zero, release the override
                // so native/training/simplified shop CSS remains authoritative.
                if (x !== 0) { styles.marginLeft = x + "px"; styles.marginRight = -x + "px"; }
                if (y !== 0) { styles.marginTop = -y + "px"; styles.marginBottom = y + "px"; }
                if (scale !== 1) styles.uiScale = Math.round(scale * 100) + "%";
                if (opacity !== 1) styles.opacity = opacity.toFixed(2);
                if (hidden) styles.visibility = "collapse";
                return { hidden, styles, classes: {
                    simplify_shop_stats_active: on(cfg, "ENABLE_SHOP_STATS") && on(cfg, "ENABLE_SIMPLIFY_SHOP_STATS"),
                    simplify_shop_active: on(cfg, "ENABLE_SIMPLIFY_SHOP"),
                    simplify_items_active: on(cfg, "ENABLE_SIMPLIFY_ITEMS"),
                    disable_shop_blue_active: on(cfg, "DISABLE_SHOP_BLUE"),
                    shop_recent_purchases_active: on(cfg, "ENABLE_SHOP_RECENT_PURCHASES")
                } };
            }

            function owner(panel) {
                if (!owners.has(panel)) owners.set(panel, { styles: new Set(), classes: new Set(), signature: null });
                return owners.get(panel);
            }

            function clearClass(panel, name, record) {
                P.setClass(panel, name, false);
                // setClass returns false for both an unchanged class and a failed
                // write; read the native result before retiring ownership.
                try { if (!panel.BHasClass(name)) record.classes.delete(name); } catch (_) {}
            }

            function release(panel) {
                const record = owners.get(panel);
                if (!record) return;
                if (!P.isAlive(panel)) { owners.delete(panel); return; }
                for (const property of record.styles) {
                    if (P.clearStyleProperty(panel, property)) record.styles.delete(property);
                }
                for (const name of record.classes) clearClass(panel, name, record);
                record.signature = null;
                if (!record.styles.size && !record.classes.size) owners.delete(panel);
            }

            function discover(force) {
                const currentShop = shopResolver.resolve($.GetContextPanel(), force);
                if (currentShop !== shop) {
                    release(main); release(shop);
                    shop = currentShop; main = null;
                    mainResolver.reset();
                }
                const currentMain = mainResolver.resolve(shop, force);
                if (currentMain !== main) { release(main); main = currentMain; }
                // Failed cleanup of a living old generation retries independently
                // of discovery and settings signatures.
                for (const panel of owners.keys()) if (panel !== shop && panel !== main) release(panel);
            }

            function renderClasses(panel, classes) {
                if (!P.isAlive(panel)) return;
                const record = owner(panel);
                for (const [name, active] of Object.entries(classes)) {
                    if (active) {
                        record.classes.add(name);
                        P.setClass(panel, name, true);
                    } else if (record.classes.has(name)) clearClass(panel, name, record);
                }
            }

            function render() {
                renderClasses(shop, model.classes);
                if (!P.isAlive(main)) return;
                const record = owner(main);
                for (const property of record.styles) {
                    if (!(property in model.styles)) {
                        if (P.clearStyleProperty(main, property)) record.styles.delete(property);
                        record.signature = null;
                    }
                }
                // Record attempted writes too: a partly applied native map must
                // still be released, and syncStyles leaves a failed signature null.
                for (const property of Object.keys(model.styles)) record.styles.add(property);
                record.signature = P.syncStyles(main, model.styles, record.signature).sig;
                renderClasses(main, { "qol-hidden": model.hidden });
            }

            function update(force = false) {
                if (!enabled || !model) return;
                discover(force);
                render();
            }

            function refreshSettings() {
                model = readModel();
                QOL.core.hud.refreshRootClasses($.GetContextPanel());
                update(true);
            }

            function onShopTransition() {
                if (!enabled || pending) return;
                pending = S.scheduleOnce(() => { pending = null; update(true); }, 0, ctx.id);
            }

            return {
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
                    for (const panel of owners.keys()) release(panel);
                    owners.clear();
                    shop = null; main = null; model = null;
                    shopResolver.reset(); mainResolver.reset();
                }
            };
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

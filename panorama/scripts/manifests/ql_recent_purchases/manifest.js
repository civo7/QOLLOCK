// OWNS: Shop purchase filters/icons, central feed and per-hero purchase overlays.
// DOES NOT OWN: Native purchase history, shop layout, top-bar cards or root CSS policy.
// Sources: hud.xml > .HudCore > CitadelHudHeroShop > Shop > NavPanel;
// citadel_hud_top_bar.xml and citadel_hud_top_bar_player.xml (HeroNameHidden/HeroBadge).
(() => {
    "use strict";
    const Q = QOL;
    const P = Q.core.panel;
    const S = Q.core.Scheduler;
    const FADE_SEC = 0.4;
    const QUICK_ROW_SCALE = 0.75;
    // CSS baselines, not persistent setting defaults.
    const SHOP_SCALE = 130;
    const SCOREBOARD_SCALE = 85;
    const PURCHASE_CLASSES = [
        "isTier1Purchase", "isTier2Purchase", "isTier3Purchase", "isTier4Purchase",
        "isWeaponPurchase", "isArmorPurchase", "isTechPurchase", "isTeam1Purchase", "isTeam2Purchase"
    ];
    const FILTERS = [
        { id: "Tier1Toggle", label: "T1", group: "tier", purchaseClass: "isTier1Purchase" },
        { id: "Tier2Toggle", label: "T2", group: "tier", purchaseClass: "isTier2Purchase" },
        { id: "Tier3Toggle", label: "T3", group: "tier", purchaseClass: "isTier3Purchase" },
        { id: "Tier4Toggle", label: "T4", group: "tier", purchaseClass: "isTier4Purchase" },
        { id: "Team1OnlyToggle", label: "Hidden King", group: "team", spectator: true, purchaseClass: "isTeam1Purchase" },
        { id: "Team2OnlyToggle", label: "Archmother", group: "team", spectator: true, purchaseClass: "isTeam2Purchase" },
        { id: "MyTeamToggle", label: "My Team", group: "team", spectator: false, localTeam: true },
        { id: "EnemyTeamToggle", label: "Enemy Team", group: "team", spectator: false, localTeam: false }
    ];
    const enabled = value => Number(value) === 1;
    const number = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
    const scale = value => number(value, 1) > 0 ? number(value, 1) : 1;
    const opacity = value => Q.utils.NormalizeOpacityNumber(value, 1);
    function purchaseText(row, className) {
        const labels = row.FindChildrenWithClassTraverse(className);
        return labels.length ? P.readText(labels[0]).trim() : "";
    }
    const PURCHASE_TEXT_PARTS = ["recentModPurchaseName", "recentTimePurchased", "recentModPurchaserHero"];
    const PURCHASE_SHOP_PARTS = ["recentModPurchaseName", "mod_icon"];
    const PURCHASE_ALL_PARTS = [...PURCHASE_TEXT_PARTS, "mod_icon"];
    function purchaseParts(row, shop, notifications) {
        // RecentPurchase XML places these leaves directly under the row.
        // Snapshot siblings once; never retain native handles across polls.
        const names = shop ? (notifications ? PURCHASE_ALL_PARTS : PURCHASE_SHOP_PARTS) : PURCHASE_TEXT_PARTS;
        const parts = {};
        for (const child of row.Children()) {
            if (!P.isAlive(child)) continue;
            for (const name of names) if (!parts[name] && child.BHasClass(name)) parts[name] = child;
        }
        // Retain compatibility with nested layouts and partially-created rows.
        for (const name of names) if (!parts[name]) parts[name] = row.FindChildrenWithClassTraverse(name)[0] || null;
        return parts;
    }
    function belongsTo(panel, owner) {
        for (let depth = 0; P.isAlive(panel) && depth < 64; depth++) {
            if (panel === owner) return true;
            panel = panel.GetParent();
        }
        return false;
    }
    function icons() {
        return Q.recentPurchasesIcons || (typeof MOD_ICONS !== "undefined" ? MOD_ICONS : {});
    }
    Q.core.FeatureRegistry.register({
        id: "ql_recent_purchases", enabledByDefault: false,
        enableKeys: ["ENABLE_SHOP_RECENT_PURCHASES", "ENABLE_SHOP_ITEM_NOTIFICATIONS", "ENABLE_HERO_PURCHASE_POPUPS"],
        settings: [
            ...QOL.presentation.stateSettings("ql_recent_purchases"),
            { key: "ENABLE_SHOP_RECENT_PURCHASES", type: "toggle" },
            { key: "ENABLE_SHOP_ITEM_NOTIFICATIONS", type: "toggle" },
            { key: "ENABLE_HERO_PURCHASE_POPUPS", type: "toggle" },
            { key: "RECENT_PURCHASES_PANEL_X_OFFSET", type: "number" },
            { key: "RECENT_PURCHASES_PANEL_Y_OFFSET", type: "number" },
            { key: "RECENT_PURCHASES_PANEL_OPACITY", type: "number" },
            { key: "RECENT_PURCHASES_PANEL_SCALE", type: "number" },
            { key: "RECENT_PURCHASES_QUICK_X_OFFSET", type: "number" },
            { key: "RECENT_PURCHASES_QUICK_Y_OFFSET", type: "number" },
            { key: "RECENT_PURCHASES_QUICK_OPACITY", type: "number" },
            { key: "RECENT_PURCHASES_QUICK_SCALE", type: "number" },
            { key: "RECENT_PURCHASES_QUICK_MAX", type: "number" },
            { key: "RECENT_PURCHASES_QUICK_DISPLAY_SEC", type: "number" },
            { key: "RECENT_PURCHASES_QUICK_REJUV", type: "toggle" },
            { key: "RECENT_PURCHASES_QUICK_SCOREBOARD", type: "toggle" },
            // Observe the existing owners' canonical settings for shared top-bar geometry.
            { key: "ENABLE_ULT_COOLDOWNS", type: "toggle" },
            { key: "ENABLE_OBJ_MAP", type: "toggle" },
            { key: "ENABLE_URN_DIFF", type: "toggle" }
        ],
        create(ctx) {
            const featureId = ctx.id || "ql_recent_purchases";
            const corePath = [{ id: "Hud", optional: true }, { className: "HudCore" }];
            const resolver = (id, ownerPath) => Q.panelCache.createIdResolver(id, { ownerPath, retryMs: 2000, refreshMs: 2000 });
            const shopSource = resolver("RecentPurchasesPanel", [...corePath, "CitadelHudHeroShop", "Shop", "NavPanel"]);
            const topSource = resolver("TopBar", corePath);
            const rejuvSource = resolver("RejuvenatorTimer", ["RejuvenatorCharges"]);
            const objectiveSource = resolver("ObjectivesMap", []);
            const urnSource = resolver("UrnTracker", []);
            const filters = FILTERS.map(filter => ({ ...filter, active: true }));
            const nativeStyles = P.createNativeStyleOwner({ resetValues: { x: "0px", y: "0px" } });
            const nativeClasses = P.createNativeStyleOwner({ preserveClasses: true });
            const notificationTree = P.createOwnedTree(), controlTree = P.createOwnedTree();
            const overlayStyles = new Map();
            const tasks = new Set();
            const toggles = new Map();
            const heroPanels = new Map();
            const cardMap = new Map();
            let running = false, loop = null, model = null, generation = 0, controlsGeneration = 0;
            let shop = null, container = null, topBar = null, rootPanel = null, hideout = null, mode = 0;
            let quickPanel = null, quickEntries = [], history = new Map(), historyReady = false, pendingPurchases = [];
            let sampleHost = null, sampleRows = [];
            let cards = [], cardsReady = false, mapping = false, filterControlsReady = false, filtersVisible = true;
            let forceSearch = false, overlapPending = false;

            function readModel() {
                const cfg = QOL.presentation.captureVisibility(ctx, ctx.config.view());
                const max = Math.round(number(cfg.RECENT_PURCHASES_QUICK_MAX, 3));
                const display = Math.round(number(cfg.RECENT_PURCHASES_QUICK_DISPLAY_SEC, 5));
                return {
                    shop: enabled(cfg.ENABLE_SHOP_RECENT_PURCHASES),
                    mode: enabled(cfg.ENABLE_SHOP_ITEM_NOTIFICATIONS) ? (enabled(cfg.ENABLE_HERO_PURCHASE_POPUPS) ? 2 : 1) : 0,
                    shopX: number(cfg.RECENT_PURCHASES_PANEL_X_OFFSET, 0), shopY: number(cfg.RECENT_PURCHASES_PANEL_Y_OFFSET, 0),
                    shopOpacity: opacity(cfg.RECENT_PURCHASES_PANEL_OPACITY), shopScale: scale(cfg.RECENT_PURCHASES_PANEL_SCALE),
                    x: number(cfg.RECENT_PURCHASES_QUICK_X_OFFSET, 0), y: number(cfg.RECENT_PURCHASES_QUICK_Y_OFFSET, 0),
                    opacity: opacity(cfg.RECENT_PURCHASES_QUICK_OPACITY), scale: scale(cfg.RECENT_PURCHASES_QUICK_SCALE),
                    max: max >= 1 && max <= 5 ? max : 3, display: display >= 3 && display <= 15 ? display : 5,
                    rejuv: Number(cfg.RECENT_PURCHASES_QUICK_REJUV) !== 0,
                    scoreboard: Number(cfg.RECENT_PURCHASES_QUICK_SCOREBOARD) !== 0,
                    ult: enabled(cfg.ENABLE_ULT_COOLDOWNS), objectives: enabled(cfg.ENABLE_OBJ_MAP), urn: enabled(cfg.ENABLE_URN_DIFF)
                };
            }

            // Created notification panels are retired with their entire owned tree.
            // Keep partial presentation writes retryable until that deletion.
            function renderStyles(records, panel, styles) {
                if (!P.isAlive(panel)) return false;
                let record = records.get(panel);
                if (!record) { record = { properties: new Set(), sig: null }; records.set(panel, record); }
                let cleared = true;
                for (const property of record.properties) {
                    if (Object.prototype.hasOwnProperty.call(styles, property)) continue;
                    if (property === "x" || property === "y") P.syncStyles(panel, { [property]: "0px" }, null);
                    if (P.clearStyleProperty(panel, property)) record.properties.delete(property);
                    else cleared = false;
                    record.sig = null;
                }
                for (const property of Object.keys(styles)) record.properties.add(property);
                record.sig = P.syncStyles(panel, styles, record.sig).sig;
                return cleared && record.sig !== null;
            }
            function nativeClass(panel, className, active) { nativeClasses.apply(panel, {}, { [className]: active }); }
            function releaseNative(usedStyles = new Set(), usedClasses = new Set()) {
                nativeStyles.retain(usedStyles);
                nativeClasses.retain(usedClasses);
            }
            function schedule(delay, callback) {
                const current = generation;
                const task = S.scheduleOnce(() => {
                    tasks.delete(task);
                    if (!running || current !== generation || (Q.core.hud.isInHideout($.GetContextPanel()) &&
                        !Q.presentation.preview.selected(rootPanel, "purchaseNotifications"))) return;
                    callback();
                }, delay, featureId);
                tasks.add(task);
                return task;
            }
            function resetNotifications() {
                generation++;
                for (const task of tasks) task.stop();
                tasks.clear();
                notificationTree.clear();
                quickPanel = null; quickEntries = []; heroPanels.clear(); overlayStyles.clear();
                sampleHost = null; sampleRows = [];
                history = new Map(); historyReady = false; pendingPurchases = [];
                cards = []; cardMap.clear(); cardsReady = false; mapping = false; overlapPending = false;
            }
            function removeControls() {
                controlsGeneration++;
                controlTree.clear(); toggles.clear(); filterControlsReady = false;
            }
            function releaseShop() { removeControls(); releaseNative(); }
            function resetSources() {
                for (const source of [shopSource, topSource, rejuvSource, objectiveSource, urnSource]) source.reset();
            }
            function resolveSources(root) {
                const nextShop = shopSource.resolve(root, forceSearch);
                const nextContainer = P.findChild(nextShop, "RecentPurchasesContainer");
                const nextTop = model.mode ? topSource.resolve(root, forceSearch) : null;
                forceSearch = false;
                if (nextShop !== shop || nextContainer !== container) {
                    releaseShop(); resetNotifications();
                    shop = nextShop; container = nextContainer;
                }
                if (nextTop !== topBar) {
                    resetNotifications(); topBar = nextTop;
                    rejuvSource.reset(); objectiveSource.reset(); urnSource.reset();
                }
            }
            function readPurchases() {
                if (!P.isAlive(container)) return [];
                // RecentPurchase snippets are direct container children. Inspect
                // every row's live content, including recycled rows and late labels,
                // without traversing the native hero-image subtree for row discovery.
                return container.Children().filter(row => P.isAlive(row) && row.BHasClass("recentPurchase")).map(row => {
                    const parts = purchaseParts(row, model.shop, model.mode);
                    return { row, name: P.readText(parts.recentModPurchaseName).trim(),
                        time: model.mode ? P.readText(parts.recentTimePurchased).trim() : "",
                        hero: model.mode ? P.readText(parts.recentModPurchaserHero).trim() : "", icon: parts.mod_icon };
                });
            }
            function filterContext() {
                return {
                    spectator: Q.utils.HasClassInHierarchy(container, "TeamSpectator"),
                    team: Q.utils.HasClassInHierarchy(container, "Team1") ? 1 : Q.utils.HasClassInHierarchy(container, "Team2") ? 2 : null
                };
            }
            const showFilter = (filter, context) => filter.spectator === undefined || filter.spectator === context.spectator;
            function createControls() {
                if (filterControlsReady || !P.isAlive(shop)) return;
                // Clear partially-created owned roots before retrying creation.
                removeControls();
                const current = controlsGeneration;
                try {
                    const collapse = controlTree.create("ToggleButton", shop, "FiltersCollapseToggle");
                    collapse.AddClass("PurchaseFilterToggle"); collapse.checked = filtersVisible;
                    controlTree.create("Label", collapse).text = "Show Filters";
                    const host = controlTree.create("Panel", shop, "PurchaseFiltersContainer");
                    collapse.SetPanelEvent("onactivate", () => {
                        if (!running || current !== controlsGeneration) return;
                        filtersVisible = !filtersVisible; collapse.checked = filtersVisible;
                        P.setClass(host, "filterButtonHidden", !filtersVisible);
                    });
                    const groups = new Map();
                    for (const filter of filters) {
                        if (!groups.has(filter.group)) {
                            const group = controlTree.create("Panel", host, "FilterGroup_" + filter.group);
                            group.AddClass("PurchaseFilterGroup"); groups.set(filter.group, group);
                        }
                        const toggle = controlTree.create("ToggleButton", groups.get(filter.group), filter.id);
                        toggle.AddClass("PurchaseFilterToggle"); toggle.checked = filter.active;
                        controlTree.create("Label", toggle).text = filter.label;
                        toggle.SetPanelEvent("onactivate", () => {
                            if (!running || current !== controlsGeneration) return;
                            filter.active = !filter.active; toggle.checked = filter.active;
                            update();
                        });
                        toggles.set(filter.id, toggle);
                    }
                    P.setClass(host, "filterButtonHidden", !filtersVisible);
                    // Move only our controls. Native header/history retain their order and parent.
                    const first = shop.GetChild(0);
                    if (first && first !== collapse) { shop.MoveChildBefore(collapse, first); shop.MoveChildBefore(host, first); }
                    filterControlsReady = true;
                } catch (error) { removeControls(); throw error; }
            }
            function geometry(x, y, alpha, ratio, baseline) {
                const styles = {};
                if (x) styles.x = x + "px";
                if (y) styles.y = -y + "px";
                if (alpha !== 1) styles.opacity = alpha.toFixed(2);
                if (ratio !== 1) styles.uiScale = Math.round(baseline * ratio) + "%";
                return styles;
            }
            function renderShop(purchases) {
                const usedStyles = new Set(), usedClasses = new Set();
                if (model.shop && P.isAlive(shop)) {
                    nativeStyles.apply(shop, Q.presentation.visibilityStyles("recentPurchases", QOL.presentation.visibilityConfig(ctx), rootPanel, geometry(model.shopX, model.shopY, model.shopOpacity, model.shopScale, SHOP_SCALE)));
                    usedStyles.add(shop);
                    createControls();
                    const context = filterContext();
                    const hiddenClasses = [];
                    for (const filter of filters) {
                        const shown = showFilter(filter, context);
                        P.setClass(toggles.get(filter.id), "filterButtonHidden", !shown);
                        if (!filter.active && shown) {
                            const cls = filter.purchaseClass || (context.team ? "isTeam" + (filter.localTeam ? context.team : 3 - context.team) + "Purchase" : null);
                            if (cls) hiddenClasses.push(cls);
                        }
                    }
                    const imageMap = icons();
                    for (const purchase of purchases) {
                        nativeClass(purchase.row, "filterHidden", hiddenClasses.some(cls => purchase.row.BHasClass(cls)));
                        usedClasses.add(purchase.row);
                        const icon = purchase.icon;
                        const image = imageMap[purchase.name];
                        if (!P.isAlive(icon) || !image) continue;
                        const complete = nativeStyles.apply(icon, { backgroundImage: image, washColor: "none" });
                        nativeClass(icon, "iconSet", complete);
                        usedStyles.add(icon); usedClasses.add(icon);
                    }
                } else removeControls();
                releaseNative(usedStyles, usedClasses);
            }
            function collectNew(purchases) {
                const next = new Map(), fresh = [];
                for (const purchase of purchases) {
                    if (!purchase.name || !purchase.time) continue;
                    const previous = history.get(purchase.row);
                    // Row identity distinguishes simultaneous purchases with equal item/time.
                    // A late hero label fills the same event rather than replaying it.
                    const same = previous && previous.name === purchase.name && previous.time === purchase.time &&
                        (!previous.hero || !purchase.hero || previous.hero === purchase.hero);
                    if (historyReady && !same && !purchase.row.BHasClass("filterHidden")) {
                        fresh.push({ ...purchase, classes: PURCHASE_CLASSES.filter(cls => purchase.row.BHasClass(cls)),
                            observedAt: Q.utils.PerfNowMs() });
                    }
                    next.set(purchase.row, { name: purchase.name, time: purchase.time, hero: purchase.hero || (previous && previous.hero) || "" });
                }
                history = next; historyReady = true;
                return fresh;
            }
            function laterImage(panel, readImage, attempts = 10) {
                schedule(0, () => {
                    if (!P.isAlive(panel)) return;
                    const image = readImage();
                    const complete = image && renderStyles(overlayStyles, panel, { backgroundImage: image, backgroundSize: "100% 100%" });
                    if (!complete && attempts > 0) schedule(0.05, () => laterImage(panel, readImage, attempts - 1));
                });
            }
            function forgetOverlay(panel) {
                for (const source of overlayStyles.keys()) if (!P.isAlive(source) || belongsTo(source, panel)) overlayStyles.delete(source);
                notificationTree.remove(panel);
            }
            function retireEntry(entry, list, fade) {
                const index = list.indexOf(entry);
                if (index >= 0) list.splice(index, 1);
                if (!P.isAlive(entry)) return;
                if (fade) {
                    entry.AddClass("quickFading");
                    schedule(FADE_SEC, () => { forgetOverlay(entry); queueOverlaps(0); });
                } else { forgetOverlay(entry); queueOverlaps(0); }
            }
            function trimEntries(list) {
                for (let index = list.length - 1; index >= 0; index--) if (!P.isAlive(list[index])) list.splice(index, 1);
                while (list.length > model.max) retireEntry(list[0], list, false);
            }
            function createEntry(purchase, host, central) {
                const entry = notificationTree.create("Panel", host);
                try {
                    entry.AddClass("quickPurchase");
                    for (const cls of purchase.classes) entry.AddClass(cls);
                    if (central) {
                        const heroIcon = notificationTree.create("Panel", entry); heroIcon.AddClass("quickHeroIcon");
                        laterImage(heroIcon, () => {
                            const name = purchase.hero || (P.isAlive(purchase.row) ? purchaseText(purchase.row, "recentModPurchaserHero") : "");
                            return typeof HERO_IMAGES !== "undefined" ? HERO_IMAGES[name] : null;
                        });
                    }
                    const info = notificationTree.create("Panel", entry); info.AddClass("quickItemInfo");
                    if (central) notificationTree.create("Panel", info).AddClass("quickItemTexture");
                    const image = icons()[purchase.name];
                    if (image) {
                        const icon = notificationTree.create("Panel", info); icon.AddClass("mod_icon");
                        laterImage(icon, () => image);
                    }
                    const label = notificationTree.create("Label", info); label.AddClass("quickPurchaseName"); label.text = purchase.name;
                    return entry;
                } catch (error) { forgetOverlay(entry); throw error; }
            }
            function addEntry(purchase, host, list, central) {
                while (list.length >= model.max) retireEntry(list[0], list, false);
                const entry = createEntry(purchase, host, central);
                list.push(entry);
                schedule(model.display, () => retireEntry(entry, list, true));
            }
            function clearSample() {
                if (P.isAlive(sampleHost)) sampleHost.RemoveClass("QOLCustomizePurchasePreview");
                for (const row of sampleRows) forgetOverlay(row);
                sampleHost = null; sampleRows = [];
            }
            function renderSample(root) {
                if (!mode || !Q.presentation.preview.selected(root, "purchaseNotifications")) { clearSample(); return; }
                const host = mode === 1 ? quickPanel : heroPanel(cardMap.keys().next().value)?.panel;
                if (!P.isAlive(host)) { clearSample(); return; }
                if (host !== sampleHost || sampleRows.some(row => !P.isAlive(row) || row.GetParent() !== host)) {
                    clearSample(); sampleHost = host;
                }
                host.AddClass("QOLCustomizePurchasePreview");
                while (sampleRows.length > model.max) forgetOverlay(sampleRows.pop());
                while (sampleRows.length < model.max) {
                    // External item/hero names and assets come from the shipped
                    // purchase dictionaries. Samples never enter native history
                    // or real notification lists and have no expiry deadline.
                    const row = createEntry({ name: "Mystic Burst", hero: "Bebop", classes: ["isTier1Purchase", "isTechPurchase"] }, host, mode === 1);
                    row.AddClass("QOLCustomizePurchaseSample");
                    sampleRows.push(row);
                }
            }
            function overlayBottom(panel, fallback) {
                if (!P.isAlive(panel)) return 0;
                const height = Number(panel.actuallayoutheight), y = number(panel.actualyoffset, 0);
                return height > 0 ? y + height : fallback;
            }
            function renderCentral(purchases, root) {
                if (!P.isAlive(topBar)) return;
                if (!P.isAlive(quickPanel) || quickPanel.GetParent() !== topBar) {
                    resetNotifications(); quickPanel = notificationTree.create("Panel", topBar, "QuickPurchasesPanel");
                }
                const timer = rejuvSource.resolve(topBar);
                const hasRejuv = P.isAlive(timer) && timer.BHasClass("has_rejuv");
                P.setClass(quickPanel, "rp_quick_rejuv_active", model.rejuv);
                P.setClass(quickPanel, "has_rejuv", hasRejuv);
                P.setClass(quickPanel, "rp_quick_scoreboard_active", model.scoreboard);
                const scoreboard = model.scoreboard && Q.core.hud.isScoreboardOpen(root);
                let margin = scoreboard ? 175 : model.rejuv && hasRejuv ? 153 : 90;
                let bottom = 0;
                if (model.objectives) bottom = Math.max(bottom, overlayBottom(objectiveSource.resolve(topBar), 112));
                if (model.urn) bottom = Math.max(bottom, overlayBottom(urnSource.resolve(topBar), 96));
                if (bottom > 0) margin = Math.max(margin, Math.round(bottom + 12));
                const styles = geometry(model.x, model.y, model.opacity, model.scale, scoreboard ? SCOREBOARD_SCALE : 100);
                styles.marginTop = margin + "px";
                renderStyles(overlayStyles, quickPanel, Q.presentation.visibilityStyles("purchaseNotifications", QOL.presentation.visibilityConfig(ctx), root, styles));
                trimEntries(quickEntries);
                if (P.isAlive(container)) pendingPurchases.push(...collectNew(purchases));
                while (pendingPurchases.length) {
                    addEntry(pendingPurchases[0], quickPanel, quickEntries, true);
                    pendingPurchases.shift();
                }
            }
            function readCards() {
                if (!P.isAlive(topBar)) return [];
                const result = [];
                const teams = P.findChild(topBar, "TeamsContainer");
                const nativeLabels = [];
                if (P.isAlive(teams)) {
                    // Current topbar/team/player XML: inspect roster membership
                    // and direct hidden labels without walking inventory/glyph trees.
                    for (const team of teams.Children()) {
                        const contents = P.findChild(team, "PlayerContents");
                        const players = P.findChild(contents, "PlayersContainer");
                        if (!P.isAlive(players)) continue;
                        for (const player of players.Children()) {
                            if (!P.isAlive(player)) continue;
                            const label = player.Children().find(child => P.isAlive(child) && child.BHasClass("HeroNameHidden"));
                            if (label) nativeLabels.push(label);
                        }
                    }
                }
                // Keep the earlier non-roster layout path where native team
                // containers are absent; never use it for a temporarily empty roster.
                const labels = P.isAlive(teams) ? nativeLabels : topBar.FindChildrenWithClassTraverse("HeroNameHidden");
                for (const label of labels) {
                    let card = label.GetParent(), badge = null;
                    if (P.isAlive(teams)) {
                        const details = P.findChild(card, "PlayerDetailsContainer");
                        const hero = P.findChild(details, "HeroContents");
                        const image = P.findChild(hero, "HeroImageArea");
                        const icon = P.isAlive(image) && image.Children().find(child => P.isAlive(child) && child.BHasClass("HeroIconContainer"));
                        badge = P.findChild(icon, "HeroBadge");
                    } else {
                        for (let depth = 0; P.isAlive(card) && card !== topBar && depth < 64; depth++) {
                            badge = P.findTraverse(card, "HeroBadge");
                            if (P.isAlive(badge)) break;
                            card = card.GetParent();
                        }
                    }
                    if (!P.isAlive(card) || card === topBar || !P.isAlive(badge)) continue;
                    const id = badge.heroid;
                    result.push({ label, card, badge, id: typeof id === "number" ? id : 0, name: P.readText(label).trim().toUpperCase() });
                }
                return result;
            }
            function sameCards(next) {
                return next.length === cards.length && next.every((item, index) => {
                    const previous = cards[index];
                    return item.label === previous.label && item.card === previous.card && item.badge === previous.badge && item.id === previous.id &&
                        (!cardsReady || item.name === previous.name);
                });
            }
            function syncCards() {
                const next = readCards();
                if (!sameCards(next)) { resetNotifications(); cards = next; }
                if (cardsReady || mapping || !cards.length) return;
                mapping = true;
                for (const item of cards) if (item.id > 0) item.card.SetDialogVariableInt("hero_id", item.id);
                schedule(0.3, () => {
                    cardMap.clear();
                    for (const item of cards) {
                        if (item.id <= 0 || !belongsTo(item.card, topBar) || !P.isAlive(item.label) ||
                            !P.isAlive(item.badge) || item.badge.heroid !== item.id) continue;
                        item.name = P.readText(item.label).trim().toUpperCase();
                        if (item.name) cardMap.set(item.name, item.card);
                    }
                    mapping = false; cardsReady = cardMap.size > 0;
                });
            }
            function heroPanel(name) {
                const card = cardMap.get(name);
                if (!P.isAlive(card) || !belongsTo(card, topBar)) return null;
                let item = heroPanels.get(name);
                if (item && (!P.isAlive(item.panel) || item.panel.GetParent() !== card)) {
                    forgetOverlay(item.panel); heroPanels.delete(name); item = null;
                }
                if (!item) {
                    const panel = notificationTree.create("Panel", card);
                    item = { panel, entries: [], latest: 0 }; heroPanels.set(name, item);
                    panel.AddClass("QuickPurchasesPanel");
                }
                return item;
            }
            function panelLeft(panel) {
                let x = 0;
                for (let depth = 0; P.isAlive(panel) && panel !== topBar && depth < 64; depth++) {
                    x += number(panel.actualxoffset, 0); panel = panel.GetParent();
                }
                return x;
            }
            function renderHeroOverlaps() {
                const active = [];
                const styles = Q.presentation.visibilityStyles("purchaseNotifications", QOL.presentation.visibilityConfig(ctx), rootPanel, geometry(model.x, model.y, model.opacity, model.scale, 100));
                for (const item of heroPanels.values()) {
                    if (!P.isAlive(item.panel)) continue;
                    P.setClass(item.panel, "QuickPurchasesPanel", true);
                    trimEntries(item.entries);
                    let margin = 125;
                    const card = item.panel.GetParent();
                    if (card.BHasClass("UltimateUnlocked")) margin = model.ult && !card.BHasClass("UltimateCooldownReady") ? 172 : 152;
                    if (item.entries.length) active.push({ item, margin });
                    else renderStyles(overlayStyles, item.panel, { ...styles, marginTop: margin + "px" });
                }
                active.sort((a, b) => b.item.latest - a.item.latest);
                for (let index = 0; index < active.length; index++) {
                    const current = active[index];
                    const width = Math.max(1, number(current.item.panel.actuallayoutwidth, 0));
                    current.center = panelLeft(current.item.panel) + width / 2;
                    current.halfWidth = width * model.scale / 2;
                    for (let previous = 0; previous < index; previous++) {
                        const other = active[previous];
                        if (Math.abs(current.center - other.center) >= current.halfWidth + other.halfWidth) continue;
                        const height = number(other.item.panel.contentheight, 0) * QUICK_ROW_SCALE * model.scale;
                        current.margin = Math.max(current.margin, other.margin + height);
                    }
                    renderStyles(overlayStyles, current.item.panel, { ...styles, marginTop: current.margin + "px" });
                }
            }
            function queueOverlaps(delay) {
                if (mode !== 2 || overlapPending) return;
                overlapPending = true;
                schedule(delay, () => {
                    try { renderHeroOverlaps(); } finally { overlapPending = false; }
                });
            }
            function renderHeroes(purchases) {
                syncCards();
                if (!cardsReady) return;
                if (P.isAlive(container)) pendingPurchases.push(...collectNew(purchases));
                for (let index = 0; index < pendingPurchases.length;) {
                    const purchase = pendingPurchases[index];
                    if (!purchase.hero && belongsTo(purchase.row, container) &&
                        purchaseText(purchase.row, "recentModPurchaseName") === purchase.name &&
                        purchaseText(purchase.row, "recentTimePurchased") === purchase.time) {
                        purchase.hero = purchaseText(purchase.row, "recentModPurchaserHero");
                    }
                    const item = purchase.hero ? heroPanel(purchase.hero.toUpperCase()) : null;
                    if (!item) {
                        if (Q.utils.PerfNowMs() - purchase.observedAt >= model.display * 1000) pendingPurchases.splice(index, 1);
                        else index++;
                        continue;
                    }
                    addEntry(purchase, item.panel, item.entries, false); item.latest = $.FrameTime();
                    pendingPurchases.splice(index, 1);
                    queueOverlaps(0.1);
                }
                renderHeroOverlaps();
            }
            function update() {
                if (!running || !model) return;
                const root = $.GetContextPanel();
                if (!P.isAlive(root)) return;
                const inHideout = Q.core.hud.isInHideout(root);
                if (root !== rootPanel || inHideout !== hideout) {
                    releaseShop(); resetNotifications(); resetSources();
                    shop = null; container = null; topBar = null; rootPanel = root; hideout = inHideout;
                }
                if (loop) loop.reschedule(inHideout ? 0.5 : 0.2);
                const preview = Q.presentation.preview.selected(root, "purchaseNotifications");
                if (inHideout && !preview) { clearSample(); releaseNative(); return; }
                if (mode !== model.mode) { resetNotifications(); mode = model.mode; }
                if (!model.shop && !mode) { releaseShop(); return; }
                resolveSources(root);
                const purchases = readPurchases();
                renderShop(purchases);
                if (!P.isAlive(container) && !preview) { clearSample(); return; }
                if (mode === 1) renderCentral(purchases, root);
                else if (mode === 2) renderHeroes(purchases);
                renderSample(root);
            }
            function shopOpened() { forceSearch = true; }
            function refreshSettings() {
                if (!running) return;
                model = readModel(); forceSearch = true;
                Q.core.hud.refreshRootClasses($.GetContextPanel());
                update();
            }
            return QOL.presentation.bindVisibility(ctx, {
                onEnable() {
                    running = true;
                    if (ctx.events && ctx.events.on) ctx.events.on("engine:shop_opened", shopOpened);
                    refreshSettings();
                    loop = S.createPollLoop(update, 0.2, featureId);
                },
                onSettingsChanged: refreshSettings,
                onDisable() {
                    running = false;
                    if (ctx.events && ctx.events.off) ctx.events.off("engine:shop_opened", shopOpened);
                    if (loop) loop.stop();
                    loop = null; resetNotifications(); releaseShop(); resetSources();
                    notificationTree.dispose(); controlTree.dispose();
                    shop = null; container = null; topBar = null; rootPanel = null; hideout = null; mode = 0; model = null; forceSearch = false;
                    for (const filter of filters) filter.active = true;
                    filtersVisible = true;
                    Q.core.hud.refreshRootClasses($.GetContextPanel());
                }
            }, update);
        },
        test() {
            const shop = P.findTraverse($.GetContextPanel(), "CitadelShop");
            if (!shop) return null;
            return { passed: true, name: "Shop panel exists for recent purchases", message: "",
                assertions: [{ passed: true, name: "CitadelShop panel exists" }] };
        }
    });
})();

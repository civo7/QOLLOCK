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
    const opacity = value => {
        const result = number(value, 1);
        return result >= 0 && result <= 1 ? result : 1;
    };
    function purchaseText(row, className) {
        const labels = row.FindChildrenWithClassTraverse(className);
        return labels.length ? P.readText(labels[0]).trim() : "";
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
            const nativeStyles = new Map();
            const nativeClasses = new Map();
            const overlayStyles = new Map();
            const tasks = new Set();
            const controls = new Set();
            const toggles = new Map();
            const heroPanels = new Map();
            const cardMap = new Map();
            let running = false, loop = null, model = null, generation = 0, controlsGeneration = 0;
            let shop = null, container = null, topBar = null, rootPanel = null, hideout = null, mode = 0;
            let quickPanel = null, quickEntries = [], history = new Map(), historyReady = false, pendingPurchases = [];
            let cards = [], cardsReady = false, mapping = false, filterControlsReady = false, filtersVisible = true;
            let forceSearch = false, overlapPending = false;

            function readModel() {
                const cfg = ctx.config.view();
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

            // Track attempted writes as well as successful signatures. A partial native
            // write stays retryable, and defaults release the code override back to CSS.
            function renderStyles(records, panel, styles, observeNative = false) {
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
                if (observeNative && Object.keys(styles).some(property => panel.style[property] !== styles[property])) record.sig = null;
                record.sig = P.syncStyles(panel, styles, record.sig).sig;
                return cleared && record.sig !== null;
            }
            function releaseStyles(records, panel) {
                if (!P.isAlive(panel) || renderStyles(records, panel, {})) records.delete(panel);
            }
            function nativeClass(panel, className, active) {
                let record = nativeClasses.get(panel);
                if (!record) { record = new Map(); nativeClasses.set(panel, record); }
                if (!record.has(className)) record.set(className, panel.BHasClass(className));
                P.setClass(panel, className, record.get(className) || active);
            }
            function releaseClass(panel, className, baseline) {
                if (P.isAlive(panel)) P.setClass(panel, className, baseline);
                return !P.isAlive(panel) || panel.BHasClass(className) === baseline;
            }
            function releaseNative(usedStyles = new Set(), usedClasses = new Set()) {
                for (const panel of nativeStyles.keys()) if (!usedStyles.has(panel)) releaseStyles(nativeStyles, panel);
                for (const [panel, record] of nativeClasses) {
                    if (usedClasses.has(panel)) continue;
                    for (const [className, baseline] of record) if (releaseClass(panel, className, baseline)) record.delete(className);
                    if (!record.size) nativeClasses.delete(panel);
                }
            }
            function schedule(delay, callback) {
                const current = generation;
                const task = S.scheduleOnce(() => {
                    tasks.delete(task);
                    if (!running || current !== generation || Q.core.hud.isInHideout($.GetContextPanel())) return;
                    callback();
                }, delay, featureId);
                tasks.add(task);
                return task;
            }
            function resetNotifications() {
                generation++;
                for (const task of tasks) task.stop();
                tasks.clear();
                P.delete(quickPanel);
                for (const item of heroPanels.values()) P.delete(item.panel);
                quickPanel = null; quickEntries = []; heroPanels.clear(); overlayStyles.clear();
                history = new Map(); historyReady = false; pendingPurchases = [];
                cards = []; cardMap.clear(); cardsReady = false; mapping = false; overlapPending = false;
            }
            function removeControls() {
                controlsGeneration++;
                for (const panel of controls) P.delete(panel);
                controls.clear(); toggles.clear(); filterControlsReady = false;
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
                return container.FindChildrenWithClassTraverse("recentPurchase").filter(P.isAlive).map(row => ({
                    row, name: purchaseText(row, "recentModPurchaseName"), time: purchaseText(row, "recentTimePurchased"),
                    hero: purchaseText(row, "recentModPurchaserHero"), classes: PURCHASE_CLASSES.filter(cls => row.BHasClass(cls))
                }));
            }
            function filterContext() {
                return {
                    spectator: Q.utils.HasClassInHierarchy(container, "TeamSpectator"),
                    team: Q.utils.HasClassInHierarchy(container, "Team1") ? 1 : Q.utils.HasClassInHierarchy(container, "Team2") ? 2 : null
                };
            }
            const showFilter = (filter, context) => filter.spectator === undefined || filter.spectator === context.spectator;
            function filterHides(filter, purchase, context) {
                let cls = filter.purchaseClass;
                if (!cls && context.team) cls = "isTeam" + (filter.localTeam ? context.team : 3 - context.team) + "Purchase";
                return !filter.active && showFilter(filter, context) && !!cls && purchase.classes.indexOf(cls) >= 0;
            }
            function createControls() {
                if (filterControlsReady || !P.isAlive(shop)) return;
                // Clear partially-created owned roots before retrying creation.
                removeControls();
                const current = controlsGeneration;
                try {
                    const collapse = $.CreatePanel("ToggleButton", shop, "FiltersCollapseToggle");
                    controls.add(collapse); collapse.AddClass("PurchaseFilterToggle"); collapse.checked = filtersVisible;
                    $.CreatePanel("Label", collapse, "").text = "Show Filters";
                    const host = $.CreatePanel("Panel", shop, "PurchaseFiltersContainer");
                    controls.add(host);
                    collapse.SetPanelEvent("onactivate", () => {
                        if (!running || current !== controlsGeneration) return;
                        filtersVisible = !filtersVisible; collapse.checked = filtersVisible;
                        P.setClass(host, "filterButtonHidden", !filtersVisible);
                    });
                    const groups = new Map();
                    for (const filter of filters) {
                        if (!groups.has(filter.group)) {
                            const group = $.CreatePanel("Panel", host, "FilterGroup_" + filter.group);
                            group.AddClass("PurchaseFilterGroup"); groups.set(filter.group, group);
                        }
                        const toggle = $.CreatePanel("ToggleButton", groups.get(filter.group), filter.id);
                        toggle.AddClass("PurchaseFilterToggle"); toggle.checked = filter.active;
                        $.CreatePanel("Label", toggle, "").text = filter.label;
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
                    renderStyles(nativeStyles, shop, geometry(model.shopX, model.shopY, model.shopOpacity, model.shopScale, SHOP_SCALE));
                    usedStyles.add(shop);
                    createControls();
                    const context = filterContext();
                    for (const filter of filters) P.setClass(toggles.get(filter.id), "filterButtonHidden", !showFilter(filter, context));
                    const imageMap = icons();
                    for (const purchase of purchases) {
                        nativeClass(purchase.row, "filterHidden", filters.some(filter => filterHides(filter, purchase, context)));
                        usedClasses.add(purchase.row);
                        const icon = purchase.row.FindChildrenWithClassTraverse("mod_icon")[0];
                        const image = imageMap[purchase.name];
                        if (!P.isAlive(icon) || !image) continue;
                        const complete = renderStyles(nativeStyles, icon, { backgroundImage: image, washColor: "none" }, true);
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
                        fresh.push({ ...purchase, observedAt: Q.utils.PerfNowMs() });
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
                P.delete(panel);
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
            function addEntry(purchase, host, list, central) {
                while (list.length >= model.max) retireEntry(list[0], list, false);
                const entry = $.CreatePanel("Panel", host, "");
                try {
                    entry.AddClass("quickPurchase");
                    for (const cls of purchase.classes) entry.AddClass(cls);
                    if (central) {
                        const heroIcon = $.CreatePanel("Panel", entry, ""); heroIcon.AddClass("quickHeroIcon");
                        laterImage(heroIcon, () => {
                            const name = purchase.hero || (P.isAlive(purchase.row) ? purchaseText(purchase.row, "recentModPurchaserHero") : "");
                            return typeof HERO_IMAGES !== "undefined" ? HERO_IMAGES[name] : null;
                        });
                    }
                    const info = $.CreatePanel("Panel", entry, ""); info.AddClass("quickItemInfo");
                    if (central) $.CreatePanel("Panel", info, "").AddClass("quickItemTexture");
                    const image = icons()[purchase.name];
                    if (image) {
                        const icon = $.CreatePanel("Panel", info, ""); icon.AddClass("mod_icon");
                        laterImage(icon, () => image);
                    }
                    const label = $.CreatePanel("Label", info, ""); label.AddClass("quickPurchaseName"); label.text = purchase.name;
                    list.push(entry);
                    schedule(model.display, () => retireEntry(entry, list, true));
                } catch (error) { forgetOverlay(entry); throw error; }
            }
            function overlayBottom(panel, fallback) {
                if (!P.isAlive(panel)) return 0;
                const height = Number(panel.actuallayoutheight), y = number(panel.actualyoffset, 0);
                return height > 0 ? y + height : fallback;
            }
            function renderCentral(purchases, root) {
                if (!P.isAlive(topBar)) return;
                if (!P.isAlive(quickPanel) || quickPanel.GetParent() !== topBar) {
                    resetNotifications(); quickPanel = $.CreatePanel("Panel", topBar, "QuickPurchasesPanel");
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
                renderStyles(overlayStyles, quickPanel, styles);
                trimEntries(quickEntries);
                pendingPurchases.push(...collectNew(purchases));
                while (pendingPurchases.length) {
                    addEntry(pendingPurchases[0], quickPanel, quickEntries, true);
                    pendingPurchases.shift();
                }
            }
            function readCards() {
                if (!P.isAlive(topBar)) return [];
                const result = [];
                for (const label of topBar.FindChildrenWithClassTraverse("HeroNameHidden")) {
                    let card = label.GetParent(), badge = null;
                    for (let depth = 0; P.isAlive(card) && card !== topBar && depth < 64; depth++) {
                        badge = P.findTraverse(card, "HeroBadge");
                        if (P.isAlive(badge)) break;
                        card = card.GetParent();
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
                    const panel = $.CreatePanel("Panel", card, "");
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
                const styles = geometry(model.x, model.y, model.opacity, model.scale, 100);
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
                pendingPurchases.push(...collectNew(purchases));
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
                if (inHideout) { releaseNative(); return; }
                if (mode !== model.mode) { resetNotifications(); mode = model.mode; }
                if (!model.shop && !mode) { releaseShop(); return; }
                resolveSources(root);
                const purchases = readPurchases();
                renderShop(purchases);
                if (!P.isAlive(container)) return;
                if (mode === 1) renderCentral(purchases, root);
                else if (mode === 2) renderHeroes(purchases);
            }
            function shopOpened() { forceSearch = true; }
            function refreshSettings() {
                model = readModel(); forceSearch = true;
                Q.core.hud.refreshRootClasses($.GetContextPanel());
                update();
            }
            return {
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
                    shop = null; container = null; topBar = null; rootPanel = null; hideout = null; mode = 0; model = null; forceSearch = false;
                    for (const filter of filters) filter.active = true;
                    filtersVisible = true;
                    Q.core.hud.refreshRootClasses($.GetContextPanel());
                }
            };
        },
        test() {
            const shop = P.findTraverse($.GetContextPanel(), "CitadelShop");
            if (!shop) return null;
            return { passed: true, name: "Shop panel exists for recent purchases", message: "",
                assertions: [{ passed: true, name: "CitadelShop panel exists" }] };
        }
    });
})();

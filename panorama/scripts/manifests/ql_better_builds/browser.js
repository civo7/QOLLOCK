"use strict";

(() => {
    const panel = QOL.core.panel;
    const feature = QOL.features.betterBuilds;
    const {
        PREFIX, child, show, snippet, tooltip, authorOf, visibleBuilds, renderRow, nativeBadge,
        forEachRow, rowIdentity, buildKey, createSelection, createRelay
    } = feature;
    const SORTS = ["best", "recent", "most", "newest"];
    const REGIONS = ["NA", "EU"];
    const MEMORY = "qol_better_builds_view";
    const STOCK_HIDDEN = PREFIX + "Active";
    const MAX_HERO_SCANS = 10;

    const readObject = raw => {
        try { return JSON.parse(raw); } catch (_) { return null; }
    };
    const record = value => value && typeof value === "object" && !Array.isArray(value);
    const account = value => Number.isSafeInteger(Number(value)) && Number(value) > 0 && Number(value) <= 0xffffffff;
    const timestamp = value => Number.isFinite(value) && value >= 0 && value <= 8640000000000;
    const authors = data => record(data) && Object.entries(data).every(([id, a]) =>
        account(id) && Array.isArray(a) && a.length >= 7 && typeof a[0] === "string" &&
        Number.isInteger(a[1]) && Number.isInteger(a[2]) && Number.isInteger(a[3]) && typeof a[4] === "string" &&
        Number.isInteger(a[5]));
    const registryAnswer = data => authors(data.authors) && Array.isArray(data.heroes) &&
        data.heroes.length > 0 && data.heroes.every(h => Number.isInteger(h?.id) && h.id > 0 &&
            typeof h.name === "string" && /^hero_[a-z0-9_]+$/.test(h.cls));
    const changes = value => Array.isArray(value) && Number.isInteger(value[0]) && Number.isInteger(value[1]) &&
        Array.isArray(value[2]) && value[2].every(line => Array.isArray(line) && timestamp(line[0])) &&
        Array.isArray(value[3]) && value[3].every(item => Array.isArray(item) && Number.isInteger(item[1]) && timestamp(item[2])) &&
        Array.isArray(value[4]);
    const validBuild = build => Number.isSafeInteger(build?.id) && build.id > 0 && account(build.a) &&
        typeof build.n === "string" && timestamp(build.u) &&
        (!build.c || changes(build.c)) && (!build.w || (Array.isArray(build.w) && build.w.every(player =>
            Array.isArray(player) && account(player[0]) && timestamp(player[1]) &&
            Number.isFinite(player[2]) && Number.isFinite(player[3]))));

    function createBrowser(popup, native, language, isCurrent) {
        const text = (key, values) => QOL.ui.theme.FormatSettingsText(key, values, language);
        const owned = [];
        const stockTabs = [];
        const badges = new Map();
        const favourites = new Set();
        const settling = new Map();
        const memory = popup.GetParent();
        const selection = createSelection(native, () => active && isCurrent());
        const relay = createRelay(popup, isCurrent);
        const data = { groups: REGIONS, authors: {}, ranks: [], items: [], usageDays: 14, windowDays: 90,
            circles: { top: { position: 100 }, dlns: { regularEvents: 3, events: 30 } } };
        let tab, host, list, scope, status, freshness;
        let groupChips, tierChips, sortChips;
        let active = false;
        let group = -1;
        let tier = 0;
        let sort = "best";
        let selectedId = 0;
        let activeKey = null;
        let rendered = [];
        let dirty = true;
        let phase = "registry";
        let failure = "";
        let hero = null;
        let heroNames = null;
        let heroScans = 0;
        let builds = [];
        let fetched = 0;
        let nextScan = 0;

        function ownSnippet(parent, name) {
            const created = snippet(parent, name, true);
            owned.push(created);
            return created;
        }
        function remember() {
            if (panel.isAlive(memory)) memory.SetAttributeString(MEMORY, JSON.stringify({ active, group, tier, sort }));
        }
        function pill(parent, title, tip, select) {
            const chip = snippet(parent, "Chip");
            child(chip, "ChipLabel").text = title;
            if (tip) tooltip(chip, [tip]);
            chip.SetPanelEvent("onactivate", select);
            return chip;
        }
        function filter(update) {
            update();
            remember();
            redraw();
        }
        function mountControls() {
            const groups = child(host, "Groups");
            const tiers = child(host, "Tiers");
            const sorts = child(host, "Sorts");
            groupChips = [text("All regions"), ...REGIONS].map((title, index) =>
                pill(groups, title, text("Filter by leaderboard region."), () => filter(() => { group = index - 1; })));
            tierChips = ["Trusted", "Top 100", "DLNS"].map((key, index) =>
                pill(tiers, text(key), "", () => filter(() => { tier = index; })));
            const sortOptions = [
                [text("Best"), text("Sort by author rank and trusted player usage.")],
                [text("Last used"), text("Sort by when a trusted player last used the build.")],
                [text("Most used"), text("Sort by games played by trusted players, with more weight for recent games.")],
                [text("Newest"), text("Sort by when the build was last updated.")]
            ];
            sortChips = sortOptions.map(([title, tip], index) =>
                pill(sorts, title, tip, () => filter(() => { sort = SORTS[index]; })));
            updateTierTips();
        }
        function updateTierTips() {
            const { top, dlns } = data.circles;
            const tips = [
                text("Leaderboard players, Night Shift players and hand-picked accounts."),
                text("Players in the top {count} of their leaderboard.", { count: top.position }),
                text("Players who played at least {count} of the last {total} Night Shift editions.", {
                    count: dlns.regularEvents, total: dlns.events
                })
            ];
            tierChips.forEach((chip, index) => tooltip(chip, [tips[index]]));
        }
        function addStockTab(nativeTab, icon, tabFilter) {
            const proxy = ownSnippet(native.tabBar, "StockTab");
            stockTabs.push(proxy);
            proxy.AddClass(PREFIX + icon);
            const label = panel.findChildByClass(nativeTab, "TabLabel");
            child(proxy, "StockTabLabel").text = label?.text || "";
            native.tabBar.MoveChildBefore(proxy, nativeTab);
            proxy.SetPanelEvent("onactivate", () => {
                if (!active || !isCurrent()) return;
                deactivate({ tabFilter });
            });
        }
        function mount() {
            const kept = panel.isAlive(memory) ? readObject(memory.GetAttributeString(MEMORY, "")) : null;
            if (Number.isInteger(kept?.group) && kept.group >= -1 && kept.group < REGIONS.length) group = kept.group;
            if (Number.isInteger(kept?.tier) && kept.tier >= 0 && kept.tier < 3) tier = kept.tier;
            if (SORTS.includes(kept?.sort)) sort = kept.sort;
            tab = ownSnippet(native.tabBar, "Tab");
            child(tab, "TabLabel").text = text("High Elo");
            tab.SetPanelEvent("onactivate", activate);
            addStockTab(native.myTab, "MyTab", 1);
            addStockTab(native.publicTab, "PublicTab", 2);
            host = ownSnippet(native.main, "Host");
            native.main.MoveChildBefore(host, native.details);
            list = child(host, "List");
            scope = child(host, "Scope");
            status = child(host, "Status");
            freshness = child(host, "Freshness");
            child(host, "FavouritesHeading").text = text("Favourites");
            child(host, "UpdatedHeading").text = text("Updated");
            freshness.SetPanelEvent("onactivate", retry);
            tooltip(freshness, [text("Build data comes from builds.braydendwyer.com and deadlock-api.com.")]);
            mountControls();
            if (kept?.active) activate();
            startRegistry();
        }

        function setStatus(message, error = false) {
            if (status.text !== message) status.text = message;
            panel.setClass(status, PREFIX + "Error", error);
        }
        function updateFreshness() {
            let message = failure ? text("{reason} Click to retry.", { reason: text(failure) }) : text("Loading live build data…");
            if (phase === "identify" && !failure) message = text("Waiting for the game's build list…");
            if (phase === "ready") {
                const minutes = Math.max(0, Math.floor((Date.now() - fetched) / 60000));
                message = minutes
                    ? text("Live build data · Updated {count} min ago", { count: minutes })
                    : text("Live build data · Just updated");
            }
            if (freshness.text !== message) freshness.text = message;
            panel.setClass(freshness, PREFIX + "Live", phase === "ready");
            panel.setClass(freshness, PREFIX + "LiveLoading", !failure && phase !== "ready");
            panel.setClass(freshness, PREFIX + "LiveFailed", !!failure);
        }
        function decorate(entry) {
            panel.setClass(entry.row, PREFIX + "Selected", entry.id === selectedId);
            panel.setClass(entry.row, PREFIX + "Favourite", favourites.has(entry.key));
            panel.setClass(entry.row, PREFIX + "IsActive", entry.key === activeKey);
        }
        function emptyMessage() {
            if (failure) return text(failure);
            if (phase !== "ready") return text("Loading builds…");
            if (!builds.length) return text("No builds found for this hero in the last {days} days.", { days: data.windowDays });
            return text("No builds match these filters.");
        }
        function redraw() {
            dirty = true;
            if (!active) return;
            list.RemoveAndDeleteChildren();
            rendered = [];
            groupChips.forEach((chip, index) => panel.setClass(chip, PREFIX + "ChipOn", index === group + 1));
            tierChips.forEach((chip, index) => panel.setClass(chip, PREFIX + "ChipOn", index === tier));
            sortChips.forEach((chip, index) => panel.setClass(chip, PREFIX + "ChipOn", SORTS[index] === sort));
            scope.text = group < 0 ? text("Builds written or played by trusted players") :
                text("Builds written or played by {region} leaderboard players", { region: REGIONS[group] });
            const region = group < 0 ? -1 : data.groups.indexOf(REGIONS[group]);
            const visible = phase === "ready" && (group < 0 || region >= 0)
                ? visibleBuilds(data, builds, region, tier, sort) : [];
            if (visible.length) {
                rendered = visible.map((entry, index) => renderRow(list, entry, index, data, hero, text, beginAction));
                rendered.forEach(decorate);
            } else {
                const label = $.CreatePanel("Label", list, "", { class: PREFIX + "Empty", hittest: false });
                label.text = emptyMessage();
            }
            dirty = false;
        }

        function activate() {
            if (active || !isCurrent()) return;
            selection.enter();
            active = true;
            panel.setClass(native.selector, STOCK_HIDDEN, true);
            panel.setClass(tab, PREFIX + "TabOn", true);
            for (const proxy of stockTabs) show(proxy, true);
            show(host, true);
            remember();
            updateFreshness();
            if (dirty) redraw();
        }
        function deactivate(options) {
            if (!active) return;
            active = false;
            panel.setClass(tab, PREFIX + "TabOn", false);
            for (const proxy of stockTabs) show(proxy, false);
            show(host, false);
            panel.setClass(native.selector, STOCK_HIDDEN, false);
            selection.leave(options);
            selectedId = 0;
            rendered.forEach(decorate);
            setStatus("");
            remember();
        }

        function beginAction(build, kind) {
            if (!active || !isCurrent()) return;
            const key = buildKey(build.a, build.n);
            if (kind === "use" && key === activeKey) {
                setStatus(text("That build is already active."));
                return;
            }
            selectedId = build.id;
            rendered.forEach(decorate);
            setStatus(text("Loading {build}…", { build: build.n }));
            selection.select(build, row => {
                if (!row) {
                    setStatus(text("Could not load that build. Try again in a moment."), true);
                    return;
                }
                setStatus("");
                if (kind === "use") selection.use(row);
                if (kind !== "favourite") return;
                if (!selection.favourite(row)) {
                    setStatus(text("Could not reach the favourite button."), true);
                    return;
                }
                const add = !favourites.has(key);
                settling.set(key, Date.now() + 5000);
                if (add) favourites.add(key);
                else favourites.delete(key);
                rendered.forEach(decorate);
                setStatus(text(add ? "Added to favourites." : "Removed from favourites."));
            }, () => setStatus(text("Could not load that build. Try again in a moment."), true));
        }

        function applyFeedMetadata(answer) {
            if (answer.circles?.top?.position > 0 && answer.circles?.dlns?.regularEvents > 0) data.circles = answer.circles;
            if (Array.isArray(answer.ranks)) data.ranks = answer.ranks;
            if (answer.usageDays > 0) data.usageDays = answer.usageDays;
            if (answer.windowDays > 0) data.windowDays = answer.windowDays;
            // The author tuples refer to the group order in the relay answer.
            if (Array.isArray(answer.groups) && answer.groups.every(group => REGIONS.includes(group?.label))) {
                data.groups = answer.groups.map(group => group.label);
            }
            Object.assign(data.authors, answer.authors || {});
            updateTierTips();
        }
        function setFailure(reason) {
            failure = reason;
            updateFreshness();
            redraw();
        }
        function buildHeroNames(heroes) {
            const probe = $.CreatePanel("Panel", popup, "", { visible: false, hittest: false });
            const names = new Map();
            try {
                for (const entry of heroes) {
                    const name = $.Localize("#" + entry.cls);
                    if (!name || name.startsWith("#")) continue;
                    probe.SetDialogVariable("hero_name", name);
                    for (const token of ["#Citadel_HeroBuilds_DefaultHeroBuild", "#Citadel_HeroBuilds_BeginnerHeroBuild"]) {
                        const buildName = $.Localize(token, probe);
                        if (buildName && !buildName.startsWith("#")) names.set(buildName, entry);
                    }
                }
            } finally {
                panel.delete(probe);
            }
            return names;
        }
        function startRegistry() {
            relay.start("registry", null, registryAnswer, answer => {
                applyFeedMetadata(answer);
                heroNames = buildHeroNames(answer.heroes);
                phase = "identify";
                nextScan = 0;
                updateFreshness();
            }, setFailure);
        }
        function startHero() {
            phase = "hero";
            updateFreshness();
            relay.start("hero", hero, answer => answer.hero?.id === hero.id && Array.isArray(answer.hero.builds) &&
                answer.hero.builds.every(validBuild) && (!answer.authors || authors(answer.authors)),
            (answer, time) => {
                applyFeedMetadata(answer);
                builds = answer.hero.builds;
                if (Array.isArray(answer.items)) data.items = answer.items;
                fetched = time;
                phase = "ready";
                nextScan = 0;
                updateFreshness();
                redraw();
            }, setFailure);
        }
        function retry() {
            if (!failure || !isCurrent()) return;
            failure = "";
            if (phase === "registry") startRegistry();
            else if (phase === "hero") startHero();
            else {
                heroScans = 0;
                nextScan = 0;
            }
            updateFreshness();
            redraw();
        }

        function syncRows(now) {
            const seen = active ? null : new Set();
            let changed = false;
            let rows = 0;
            let detected = null;
            forEachRow(native.list, row => {
                rows++;
                const info = rowIdentity(row);
                const key = buildKey(info.author, info.name);
                const favourite = row.BHasClass("Favorite");
                const inUse = row.BHasClass("ActiveBuild");
                if (!info.author && !detected && phase === "identify") detected = heroNames.get(info.name);
                if ((settling.get(key) || 0) <= now) {
                    settling.delete(key);
                    if (favourite !== favourites.has(key)) {
                        if (favourite) favourites.add(key);
                        else favourites.delete(key);
                        changed = true;
                    }
                }
                if (activeKey === null && inUse) {
                    activeKey = key;
                    changed = true;
                }
                if (!seen) return;
                seen.add(row);
                const author = authorOf(data, info.author);
                const previous = badges.get(row);
                if (previous?.key === key && previous.author === author && previous.inUse === inUse &&
                    (previous.badge === null || (panel.isAlive(previous.badge) &&
                        QOL_UTILS.FindAncestorWithClass(previous.badge, "HeroBuildListItem") === row))) return;
                panel.delete(previous?.badge);
                const badge = nativeBadge(row, data, author, inUse, text);
                badges.set(row, { key, author, inUse, badge });
            });
            if (seen) {
                for (const [row, entry] of badges) {
                    if (seen.has(row)) continue;
                    panel.delete(entry.badge);
                    badges.delete(row);
                }
            }
            if (changed && active) rendered.forEach(decorate);
            if (phase !== "identify" || failure || !rows) return;
            if (detected) {
                hero = detected;
                startHero();
            } else if (++heroScans >= MAX_HERO_SCANS) {
                relay.cancel();
                setFailure("Could not identify the hero from the game's default builds.");
            }
        }

        function update() {
            if (active && selection.manualSearch()) deactivate({ keepPublic: true });
            if (phase === "registry") return;
            const now = Date.now();
            if (now >= nextScan && !selection.loading()) {
                nextScan = now + 800;
                syncRows(now);
            }
        }
        function dispose() {
            relay.cancel();
            if (active) {
                panel.setClass(native.selector, STOCK_HIDDEN, false);
                selection.leave({ refreshSearch: panel.isVisible(popup) && panel.isAlive(native.selector) &&
                    native.selector.GetParent()?.GetParent() === popup });
                active = false;
            }
            for (const entry of badges.values()) panel.delete(entry.badge);
            badges.clear();
            for (const created of owned) panel.delete(created);
            owned.length = 0;
        }
        return { mount, update, dispose };
    }

    feature.createBrowser = createBrowser;
})();

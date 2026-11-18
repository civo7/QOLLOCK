"use strict";

(() => {
    const panel = QOL.core.panel;
    const { findChild, findChildByClass, activate, isAlive } = panel;
    const { ParseAccountId } = QOL_UTILS;
    const Scheduler = QOL.core.Scheduler;
    const OWNER = "ql_better_builds_selection";
    const normalizeId = value => Number(String(value).replace(/\D/g, ""));
    const buildKey = (author, name) => String(author) + "|" + name;

    function discover(popup) {
        const selector = findChild(findChild(popup, "BuildsContent"), "HeroBuildSelector");
        const header = findChildByClass(selector, "HeroSelectorHeader");
        const tabBar = findChildByClass(header, "HeroSelectorTabContainer");
        const search = findChildByClass(header, "SearchContainer");
        const main = findChildByClass(selector, "MainContainer");
        const list = findChild(main, "HeroBuildList");
        const details = findChild(main, "BuildDetails");
        const entry = findChild(findChild(search, "SearchBox"), "SearchTextEntry");
        const myTab = findChildByClass(tabBar, "MyBuilds");
        const publicTab = findChildByClass(tabBar, "PublicBuilds");
        if (!list || !details || !entry || !myTab || !publicTab) return null;
        return { selector, header, tabBar, search, entry, main, list, details, myTab, publicTab };
    }

    function forEachRow(list, visit) {
        const count = list.GetChildCount();
        for (let i = 0; i < count; i++) {
            const row = list.GetChild(i);
            if (isAlive(row) && row.BHasClass("HeroBuildListItem")) visit(row);
        }
    }

    function rowIdentity(row) {
        const authorText = $.Localize("{d:build_creator}", row);
        return {
            author: Number(ParseAccountId(authorText)),
            name: $.Localize("{s:selected_hero_build_name}", row)
        };
    }

    function createSelection(native, isCurrent) {
        const { selector, list, details, entry } = native;
        let action = null;
        let waitTask = null;
        let lastSearchAt = -Infinity;
        let previousText = null;
        let ownedText = null;
        let initialText = null;
        let originalTab = null;
        let preview = null;

        const loading = () => selector.BHasClass("BuildsLoading");
        const shownId = () => normalizeId($.Localize("{d:selected_hero_build_id}", details));
        const current = candidate => candidate === action && isCurrent();

        function invalidate() {
            action = null;
            if (waitTask) {
                waitTask.handle.stop();
                waitTask.resolve();
                waitTask = null;
            }
        }

        function pause(seconds) {
            return new Promise(resolve => {
                const handle = Scheduler.scheduleOnce(() => {
                    waitTask = null;
                    resolve();
                }, seconds, OWNER);
                waitTask = { handle, resolve };
            });
        }

        async function waitFor(candidate, predicate, seconds) {
            const deadline = Date.now() + seconds * 1000;
            while (current(candidate)) {
                if (predicate()) return true;
                if (Date.now() >= deadline) return false;
                await pause(0.05);
            }
            return false;
        }

        function enter() {
            originalTab = {
                my: selector.BHasClass("ShowMyBuilds"),
                public: selector.BHasClass("ShowPublicBuilds")
            };
            initialText = entry.text;
            // A native row click only previews the build while the selector is in Public mode.
            panel.setClass(selector, "ShowPublicBuilds", true);
            panel.setClass(selector, "ShowMyBuilds", false);
        }

        function leave({ keepPublic = false, refreshSearch = true } = {}) {
            invalidate();
            preview = null;
            if (originalTab && isAlive(selector) && !keepPublic) {
                panel.setClass(selector, "ShowPublicBuilds", originalTab.public);
                panel.setClass(selector, "ShowMyBuilds", originalTab.my);
            }
            originalTab = null;
            if (!keepPublic && ownedText !== null && isAlive(entry) && isAlive(selector) && entry.text === ownedText) {
                if (previousText !== ownedText) {
                    entry.text = previousText;
                    if (refreshSearch) {
                        if (previousText) $.DispatchEvent("CitadelBuildBrowserRefresh", selector, true);
                        else $.DispatchEvent("CitadelBuildBrowserClearSearch", selector);
                    }
                }
            }
            previousText = ownedText = initialText = null;
        }

        function matchingRows(build, exactOnly) {
            const exact = [];
            const other = [];
            forEachRow(list, row => {
                const info = rowIdentity(row);
                if (info.author !== Number(build.a)) return;
                if (info.name === build.n) exact.push(row);
                else if (!exactOnly) other.push(row);
            });
            return exact.concat(other);
        }

        async function pick(build, candidate, exactOnly) {
            for (const row of matchingRows(build, exactOnly)) {
                if (!current(candidate)) return null;
                if (!isAlive(row) || row.GetParent() !== list) continue;
                const previous = shownId();
                if (previous === build.id && row.BHasClass("Selected")) return row;
                if (!selector.BHasClass("ShowPublicBuilds") || !activate(row)) return null;
                const found = await waitFor(candidate, () => {
                    const id = shownId();
                    return (id !== 0 && id !== previous) || (id === build.id && row.BHasClass("Selected"));
                }, 1.5);
                if (found && current(candidate) && shownId() === build.id && isAlive(row) && row.GetParent() === list) return row;
                if (!current(candidate)) return null;
            }
            return null;
        }

        async function load(build, candidate) {
            if (loading() && !await waitFor(candidate, () => !loading(), 8)) return null;
            if (!current(candidate)) return null;
            if (preview?.id === build.id && isAlive(preview.row) && preview.row.GetParent() === list && shownId() === build.id) {
                const { author, name } = rowIdentity(preview.row);
                if (author === preview.author && name === preview.name) return preview.row;
            }
            preview = null;
            const hit = await pick(build, candidate, true);
            if (hit || !current(candidate)) return hit;
            const remaining = 800 - (Date.now() - lastSearchAt);
            if (remaining > 0) await pause(remaining / 1000);
            if (!current(candidate)) return null;
            if (ownedText === null || entry.text !== ownedText) previousText = entry.text;
            ownedText = String(build.id);
            entry.text = ownedText;
            lastSearchAt = Date.now();
            $.DispatchEvent("CitadelBuildBrowserRefresh", selector, true);
            await waitFor(candidate, loading, 0.6);
            if (!await waitFor(candidate, () => !loading(), 8)) return null;
            await pause(0.05);
            return current(candidate) ? pick(build, candidate, false) : null;
        }

        async function select(build, onRow, onError) {
            invalidate();
            const candidate = {};
            action = candidate;
            try {
                const row = await load(build, candidate);
                if (!current(candidate)) return;
                if (row) preview = { id: build.id, row, ...rowIdentity(row) };
                onRow(row);
            } catch (error) {
                $.Msg("[QOLLock][Better Builds] Build selection failed: " + error);
                if (current(candidate)) onError();
            } finally {
                if (action === candidate) action = null;
            }
        }

        function use(row) {
            // Prefer the stock row's own button. The native confirmation event also uses the preview.
            const area = findChild(row, "BuildNameArea");
            if (area) {
                const count = area.GetChildCount();
                for (let i = 0; i < count; i++) {
                    const child = area.GetChild(i);
                    if (isAlive(child) && child.paneltype === "CitadelButton" && activate(child)) return;
                }
            }
            $.DispatchEvent("CitadelBuildBrowserPopupConfirmBuild", selector);
        }

        function favourite(row) {
            const info = findChildByClass(findChild(row, "RightPanel"), "InfoContainer");
            return activate(findChild(info, "FavoriteIcon"));
        }

        return { enter, leave, loading, select, use, favourite,
            manualSearch: () => loading() && entry.text !== (ownedText ?? initialText) };
    }

    Object.assign(QOL.features.betterBuilds, { discover, forEachRow, rowIdentity, buildKey, createSelection });
})();

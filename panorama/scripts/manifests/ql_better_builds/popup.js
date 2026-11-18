"use strict";

(() => {
    const { panel, Scheduler } = QOL.core;
    const { discover, readLanguage, createBrowser } = QOL.features.betterBuilds;
    let popup = $.GetContextPanel();
    while (panel.isAlive(popup) && popup.paneltype !== "PopupBuildBrowser") popup = popup.GetParent();
    if (!panel.isAlive(popup)) return;

    const interval = 0.25;
    const idleInterval = 0.75;
    let session = null;
    let discoverAt = 0;
    let loop = null;

    function release() {
        const old = session;
        session = null;
        old?.browser.dispose();
    }

    function ownsNative(native) {
        return panel.isAlive(native.list) && native.list.GetParent() === native.main &&
            panel.isAlive(native.loadingList) && native.loadingList.GetParent() === native.main &&
            panel.isAlive(native.details) && native.details.GetParent() === native.main &&
            panel.isAlive(native.main) && native.main.GetParent() === native.selector &&
            panel.isAlive(native.tabBar) && native.tabBar.GetParent() === native.header &&
            panel.isAlive(native.header) && native.header.GetParent() === native.selector &&
            panel.isAlive(native.entry) && panel.isAlive(native.selector) &&
            native.selector.GetParent()?.GetParent() === popup;
    }

    function sameSource(previous, current) {
        return current && Object.keys(previous).every(key => previous[key] === current[key]);
    }

    function update() {
        if (!panel.isVisible(popup)) {
            release();
            discoverAt = 0;
            loop?.reschedule(idleInterval);
            return;
        }
        loop?.reschedule(interval);
        const root = panel.findRoot(popup);
        const language = readLanguage(root);
        if (!language) {
            release();
            discoverAt = 0;
            loop?.reschedule(idleInterval);
            return;
        }
        if (session && (session.root !== root || session.language !== language || !ownsNative(session.native))) {
            release();
            discoverAt = 0;
        }
        const now = Date.now();
        if (now >= discoverAt) {
            discoverAt = now + 800;
            const native = discover(popup);
            if (session && !sameSource(session.native, native)) release();
            if (!session && native) {
                const next = { root, language, native, browser: null };
                next.browser = createBrowser(popup, native, Number(language), () =>
                    session === next && panel.isVisible(popup) && readLanguage(root) === language &&
                    ownsNative(native) && panel.findRoot(popup) === root);
                session = next;
                try {
                    next.browser.mount();
                } catch (error) {
                    release();
                    throw error;
                }
            }
        }
        session?.browser.update();
    }

    loop = Scheduler.createPollLoop(update, interval, "ql_better_builds_popup");
})();

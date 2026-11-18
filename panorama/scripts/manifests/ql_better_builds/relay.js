"use strict";

(() => {
    const { isAlive, delete: deletePanel } = QOL.core.panel;
    const { SafeGetAttribute, SafeSetAttribute } = QOL_UTILS;
    const Scheduler = QOL.core.Scheduler;
    const URL = "https://builds.braydendwyer.com/";
    const MAX_PARTS = 2048;
    const CACHE_LIFETIME = { registry: 1800, hero: 600 };
    const OWNER = "ql_better_builds_relay";
    let nextId = Date.now();

    function parseAnswer(json) {
        try {
            const answer = JSON.parse(json);
            return answer && typeof answer === "object" ? answer : null;
        } catch (_) {
            return null;
        }
    }

    // BG1 frames carry JSON only. Never pass a relay response to Panorama as code, HTML or a URL.
    function createRelay(popup, isCurrent) {
        const cache = popup.GetParent();
        let holder = null;
        let view = null;
        let request = null;
        let watchdog = null;

        function cancel() {
            request = null;
            watchdog?.stop();
            watchdog = null;
            deletePanel(holder);
            holder = view = null;
        }

        function fail(current, reason, detail) {
            cancel();
            if (detail) $.Msg("[QOLLock][Better Builds] " + detail);
            if (isCurrent()) current.onFailure(reason);
        }

        function navigate(command) {
            view.SetURL(URL + "#bg=" + encodeURIComponent(JSON.stringify(command)));
        }

        function receive(owner, title) {
            const current = request;
            if (!current || owner !== view || !isCurrent()) return;
            const frame = /^BG1\|(\d+)\|(s|e|\d+\/\d+)\|([\s\S]*)$/.exec(title);
            if (!frame) return;
            const [, sender, kind, payload] = frame;
            if (kind === "s" && (Number(sender) === 0 || Number(sender) === current.id)) {
                current.lastAt = Date.now();
                return;
            }
            if (Number(sender) !== current.id) return;
            if (kind === "e") {
                fail(current, "The build feed reported an error.", payload.slice(0, 300));
                return;
            }
            const [index, count] = kind.split("/").map(Number);
            if (!Number.isInteger(index) || !Number.isInteger(count) || count < 1 ||
                count > MAX_PARTS || index >= count || payload.length > 4096) return;
            if (!current.parts) current.parts = new Array(count);
            if (current.parts.length !== count || current.parts[index] !== undefined) return;
            current.parts[index] = payload;
            current.lastAt = Date.now();
            if (++current.received !== count) return;

            const json = current.parts.join("");
            const answer = parseAnswer(json);
            if (!answer || !current.accept(answer)) {
                fail(current, "The build feed sent an incomplete response.");
                return;
            }
            const fetched = Date.now();
            // Keep CEF between registry and hero requests so fragment navigation can reuse the page.
            request = null;
            watchdog?.stop();
            watchdog = null;
            if (current.kind === "hero") cancel();
            if (isAlive(cache)) SafeSetAttribute(cache, current.cacheKey, JSON.stringify({ fetched, json }));
            current.onResult(answer, fetched);
        }

        function check() {
            const current = request;
            if (!current || !isCurrent()) {
                cancel();
                return;
            }
            const now = Date.now();
            const idle = now - current.lastAt;
            if (now - current.startedAt > 150000 || (!current.parts && idle > 25000)) {
                fail(current, "The build feed took too long to respond.");
            } else if (current.parts && idle > 3000) {
                if (current.retries === 3) {
                    fail(current, "The build feed sent an incomplete response.");
                    return;
                }
                const missing = [];
                for (let i = 0; i < current.parts.length && missing.length < 50; i++) {
                    if (current.parts[i] === undefined) missing.push(i);
                }
                current.retries++;
                current.lastAt = now;
                navigate({ v: 1, id: ++nextId, cmd: "resend", of: current.id, parts: missing });
            }
        }

        function start(kind, hero, accept, onResult, onFailure) {
            const cacheKey = kind === "registry" ? "qol_better_builds_registry" : "qol_better_builds_hero_" + hero.id;
            const kept = isAlive(cache) ? parseAnswer(SafeGetAttribute(cache, cacheKey, "")) : null;
            const now = Date.now();
            if (kept && now >= kept.fetched && now - kept.fetched < CACHE_LIFETIME[kind] * 1000) {
                const answer = parseAnswer(kept.json);
                if (answer && accept(answer)) {
                    if (kind === "hero") cancel();
                    onResult(answer, kept.fetched);
                    return;
                }
            }
            const id = ++nextId;
            const current = { id, kind, cacheKey, accept, onResult, onFailure, startedAt: now,
                lastAt: now, parts: null, received: 0, retries: 0 };
            request = current;
            try {
                if (!isAlive(view)) {
                    holder = $.CreatePanel("Panel", popup, "", { class: "QolBetterBuildsRelay", hittest: false, hittestchildren: false });
                    view = $.CreatePanel("CitadelHTMLPanel", holder, "");
                    view.style.width = "100%";
                    view.style.height = "100%";
                    // These handlers belong to the owned CEF panel and retire with it.
                    $.RegisterEventHandler("HTMLTitle", view, receive);
                }
                const command = { v: 1, id, cmd: kind, regions: ["NA", "EU"],
                    now: Math.floor(now / 1000), chunk: 3800, delay: 10 };
                if (hero) command.hero = { id: hero.id, name: hero.name, cls: hero.cls };
                watchdog = Scheduler.createPollLoop(check, 1, OWNER);
                navigate(command);
            } catch (error) {
                fail(current, "Could not open the build feed.", error);
            }
        }
        return { start, cancel };
    }

    QOL.features.betterBuilds.createRelay = createRelay;
})();

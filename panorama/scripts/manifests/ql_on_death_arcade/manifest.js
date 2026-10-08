// OWNS: Respawn-timer observation, arcade launch requests and owned Escape classes.
// DOES NOT OWN: Native respawn UI, manually opened menus or settings-side games.
(() => {
    "use strict";
    const FEATURE_ID = "ql_on_death_arcade";
    const COOLDOWN_MS = 5000;
    const GAMES = [
        ["ON_DEATH_GAME_MINESWEEPER", "minesweeper"], ["ON_DEATH_GAME_BLACKJACK", "blackjack"],
        ["ON_DEATH_GAME_FLAPPY_BAT", "flappy_bat"], ["ON_DEATH_GAME_GRAVES_TRAINER", "graves_trainer"],
        ["ON_DEATH_GAME_ZERGGY_MANIA", "zerggy_mania"], ["ON_DEATH_GAME_WHACK_A_REM", "whack_a_rem"]
    ];
    // Identity spans registry instance generations in this HUD context. Settings
    // remembers the last token even after a feature disable/enable cycle.
    let requestSerial = 0;

    function parseSeconds(text) {
        const match = String(text || "").trim().match(/-?\d+(?:[.,]\d+)?/);
        const seconds = match ? Number(match[0].replace(",", ".")) : NaN;
        return Number.isFinite(seconds) ? seconds : null;
    }

    QOL.core.FeatureRegistry.register({
        id: FEATURE_ID,
        enableKey: "ENABLE_ON_DEATH_GAMES",
        enabledByDefault: false,
        settings: [{ key: "ENABLE_ON_DEATH_GAMES", type: "toggle" }, ...GAMES.map(([key]) => ({ key, type: "toggle" }))],
        create(ctx) {
            const P = QOL.core.panel;
            const B = QOL.bridge;
            const activeAttr = B.channels.onDeathArcadeActive.attr;
            const gameAttr = B.channels.onDeathArcadeRequest.attr;
            const tokenAttr = B.channels.onDeathArcadeToken.attr;
            const escapeAttr = B.channels.onDeathArcadeEscapeOwned.attr;
            const respawnResolver = QOL.panelCache.createIdResolver("respawn_timer", {
                retryMs: 1000, ownerPath: [{ id: "Hud", optional: true }, { className: "HudCore" }, "gameplay_hud_dead"]
            });
            const escapeResolver = QOL.panelCache.createIdResolver("EscapeMenu", { retryMs: 1000 });
            const hudResolver = QOL.panelCache.createIdResolver("Hud", { retryMs: 1000 });
            let root = null, bridgeTargets = [], loop = null, pool = [], wasDead = false, lastTrigger = null, request = null;
            let fallbackTimer = null, nextFallbackScan = 0;
            const ownedEscape = new Set();

            function clearBridge(target) {
                if (!P.isAlive(target)) return;
                // Readers reject an uncommitted request before payload cleanup.
                for (const attr of [activeAttr, gameAttr, tokenAttr]) {
                    if (B.readAttr(target, attr, "") !== "") B.writeAttr(target, attr, "");
                }
            }

            function closeOwnedEscape(target) {
                if (!P.isAlive(target)) { ownedEscape.delete(target); return; }
                if (B.readAttr(target, escapeAttr, "") === "1") {
                    P.setClass(target, "ShowEscapeMenu", false);
                    if (target.BHasClass("ShowEscapeMenu")) return;
                    if (!B.writeAttr(target, escapeAttr, "")) return;
                }
                ownedEscape.delete(target);
            }

            function releasePresentation() {
                for (const target of bridgeTargets) clearBridge(target);
                for (const target of ownedEscape) closeOwnedEscape(target);
            }

            function clearSession() {
                releasePresentation();
                request = null; wasDead = false;
            }

            function discover(force) {
                const currentRoot = P.findRoot($.GetContextPanel());
                if (root !== currentRoot) {
                    releasePresentation();
                    root = currentRoot; bridgeTargets = [];
                    respawnResolver.reset(); escapeResolver.reset(); hudResolver.reset();
                    fallbackTimer = null; nextFallbackScan = 0;
                }
                if (!P.isAlive(root)) return [];
                const hud = root.id === "Hud" ? root : hudResolver.resolve(root, force);
                const next = [...new Set([root, hud].filter(P.isAlive))];
                for (const target of bridgeTargets) if (!next.includes(target)) clearBridge(target);
                bridgeTargets = next;
                const escape = escapeResolver.resolve(root, force);
                const targets = [...new Set([root, hud, escape, P.isAlive(escape) ? escape.GetParent() : null].filter(P.isAlive))];
                for (const target of ownedEscape) if (!targets.includes(target)) closeOwnedEscape(target);
                return targets;
            }

            function belongsToRoot(panel) {
                for (let depth = 0; depth < 64 && P.isAlive(panel); depth++) {
                    if (panel === root) return true;
                    panel = panel.GetParent();
                }
                return false;
            }

            function readLife(force) {
                const hud = bridgeTargets.find(panel => panel.id === "Hud") || root;
                const source = respawnResolver.resolve(hud, force);
                let timer = P.isAlive(source) ? QOL.utils.FindFirstPanelByClass(source, "respawn_number") : null;
                if (!timer) {
                    const now = QOL.utils.PerfNowMs();
                    if (!P.isAlive(fallbackTimer) || !belongsToRoot(fallbackTimer)) {
                        if (fallbackTimer) nextFallbackScan = 0;
                        fallbackTimer = null;
                    }
                    if (force || now >= nextFallbackScan) {
                        nextFallbackScan = now + 1000;
                        fallbackTimer = QOL.utils.FindPanelsByClass(root, "RespawnTimer").find(P.isVisible) || null;
                    }
                    timer = fallbackTimer;
                }
                if (!P.isAlive(timer)) return "unknown";
                const hidden = panel => !P.isVisible(panel) || ["collapse", "collapsed", "hidden"].includes(String(panel.style.visibility || "").toLowerCase());
                if (hidden(timer) || hidden(source || timer)) return "alive";
                const seconds = parseSeconds(P.readText(timer));
                return seconds === null ? "unknown" : seconds > 0 ? "dead" : "alive";
            }

            function publish(target) {
                if (B.readAttr(target, activeAttr, "") === "1" && B.readAttr(target, gameAttr, "") === request.game && B.readAttr(target, tokenAttr, "") === request.token) return true;
                // Active is the commit flag. Never publish it with a partial
                // game/token pair; retry the same request on the next tick.
                if (!B.writeAttr(target, activeAttr, "")) return false;
                const gameWritten = B.writeAttr(target, gameAttr, request.game);
                const tokenWritten = B.writeAttr(target, tokenAttr, request.token);
                return gameWritten && tokenWritten && B.writeAttr(target, activeAttr, "1");
            }

            function openEscape(targets) {
                for (const target of targets) {
                    if (request.opened.has(target)) continue;
                    if (!target.BHasClass("ShowEscapeMenu")) {
                        if (!B.writeAttr(target, escapeAttr, "1")) continue;
                        ownedEscape.add(target);
                        P.setClass(target, "ShowEscapeMenu", true);
                        if (!target.BHasClass("ShowEscapeMenu")) continue;
                    }
                    request.opened.add(target);
                }
            }

            function update(force = false) {
                const targets = discover(force);
                if (!P.isAlive(root)) return;
                if (!pool.length || QOL.core.hud.isInHideout(root)) { clearSession(); return; }
                const life = readLife(force);
                if (life === "alive") { clearSession(); return; }
                if (life === "dead" && !wasDead) {
                    const now = QOL.utils.PerfNowMs();
                    if (lastTrigger === null || now - lastTrigger >= COOLDOWN_MS) {
                        lastTrigger = now;
                        request = { game: pool[Math.floor(Math.random() * pool.length)], token: String(++requestSerial), opened: new Set() };
                    }
                    wasDead = true;
                }
                if (!request) return;
                let published = false;
                for (const target of bridgeTargets) published = publish(target) || published;
                if (published) openEscape(targets);
            }

            function refreshSettings() {
                const cfg = ctx.config.view();
                pool = Number(cfg.ENABLE_ON_DEATH_GAMES) === 1 ? GAMES.filter(([key]) => Number(cfg[key]) === 1).map(([, id]) => id) : [];
                update(true);
            }

            return {
                onEnable() {
                    refreshSettings();
                    loop = QOL.core.Scheduler.createPollLoop(update, 0.2, ctx.id);
                },
                onSettingsChanged: refreshSettings,
                onDisable() {
                    if (loop) { loop.stop(); loop = null; }
                    clearSession(); root = null; bridgeTargets = []; pool = []; lastTrigger = null;
                    fallbackTimer = null; nextFallbackScan = 0;
                    respawnResolver.reset(); escapeResolver.reset(); hudResolver.reset();
                }
            };
        },
        test() {
            const root = $.GetContextPanel();
            const timer = QOL.core.panel.findTraverse(root, "respawn_timer");
            const escape = QOL.core.panel.findTraverse(root, "EscapeMenu");
            return { passed: !!(timer && escape), name: "On-death arcade panels exist",
                message: [!timer && "respawn_timer not found", !escape && "EscapeMenu not found"].filter(Boolean).join("; "),
                assertions: [{ passed: !!timer, name: "respawn_timer exists" }, { passed: !!escape, name: "EscapeMenu exists" }] };
        }
    });
})();

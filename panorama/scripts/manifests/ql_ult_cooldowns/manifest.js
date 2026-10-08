// OWNS: QOL ultimate cooldown labels and ult_cooldowns_active presentation.
// DOES NOT OWN: Native ultimate status classes, cooldown bindings or player data.
// Paths: citadel_hud_top_bar{,_team,_player}.xml; fallback supports sandbox slots.
(() => {
    "use strict";
    const FEATURE_ID = "ql_ult_cooldowns";
    const CLASS_NAME = "ult_cooldowns_active";
    QOL.core.FeatureRegistry.register({
        id: FEATURE_ID,
        enableKey: "ENABLE_ULT_COOLDOWNS",
        enabledByDefault: false,
        settings: [{ key: "ENABLE_ULT_COOLDOWNS", type: "toggle" }],
        create(ctx) {
            const P = QOL.core.panel;
            const resolver = (id, ownerPath = []) => QOL.panelCache.createIdResolver(id, { ownerPath, retryMs: 1000, refreshMs: 2000 });
            const topResolver = resolver("TopBar");
            const legacyTopResolver = resolver("CitadelHudTopBar");
            const teamsResolver = resolver("TeamsContainer");
            const teamResolvers = new Map();
            const slotResolvers = new Map();
            let active = false, enabled = false, loop = null, root = null, topBar = null;
            let ownedPlayers = new Set();
            let nextFallback = 0, fallbackPlayers = [];

            function releasePlayer(player) {
                P.setClass(player, CLASS_NAME, false);
                const slot = slotResolvers.get(player);
                if (slot) clearShown(slot.shownPanel);
                slotResolvers.delete(player);
            }

            function clearShown(panel) {
                if (!P.isAlive(panel)) return;
                try { if (panel.text !== "") panel.text = ""; } catch (_) { /* owner may disappear during cleanup */ }
            }

            function release() {
                for (const player of ownedPlayers) releasePlayer(player);
                ownedPlayers.clear();
                P.setClass(topBar, CLASS_NAME, false);
                teamResolvers.clear(); slotResolvers.clear();
                fallbackPlayers = []; nextFallback = 0;
                for (const owner of [topResolver, legacyTopResolver, teamsResolver]) owner.reset();
                topBar = null;
            }

            function readPlayers(top) {
                const teams = teamsResolver.resolve(top);
                const list = [];
                const currentTeams = new Set();
                if (P.isAlive(teams)) {
                    for (let i = 0; i < Math.min(4, teams.GetChildCount()); i++) {
                        const team = teams.GetChild(i);
                        if (!P.isAlive(team)) continue;
                        currentTeams.add(team);
                        if (!teamResolvers.has(team)) teamResolvers.set(team, resolver("PlayersContainer", ["PlayerContents"]));
                        const players = teamResolvers.get(team).resolve(team);
                        if (!P.isAlive(players)) continue;
                        for (let j = 0; j < Math.min(12, players.GetChildCount()); j++) {
                            const player = players.GetChild(j);
                            if (P.isAlive(player) && !list.includes(player)) list.push(player);
                        }
                    }
                }
                for (const team of teamResolvers.keys()) if (!currentTeams.has(team)) teamResolvers.delete(team);
                if (list.length) return list;
                const now = QOL.utils.PerfNowMs();
                if (now >= nextFallback || fallbackPlayers.some(player => !belongsTo(player, top))) {
                    nextFallback = now + 2000;
                    fallbackPlayers = [];
                    for (let i = 0; i <= 12; i++) {
                        const player = P.findTraverse(top, "TopBarPlayer" + i);
                        if (P.isAlive(player) && !fallbackPlayers.includes(player)) fallbackPlayers.push(player);
                    }
                }
                return fallbackPlayers;
            }

            function belongsTo(panel, ancestor) {
                for (let depth = 0; depth < 64 && P.isAlive(panel); depth++) {
                    if (panel === ancestor) return true;
                    panel = panel.GetParent();
                }
                return false;
            }

            function readSlot(player) {
                if (!slotResolvers.has(player)) {
                    const status = ["PlayerDetailsContainer", "StatusRow"];
                    slotResolvers.set(player, {
                        hidden: resolver("UltimateCooldownTextHidden", [...status, "UltimateStatus", "UltimateStatusBG"]),
                        shown: resolver("UltimateCooldownTextShown", status),
                        shownPanel: null
                    });
                }
                const slot = slotResolvers.get(player);
                const hidden = slot.hidden.resolve(player);
                const shown = slot.shown.resolve(player);
                if (shown !== slot.shownPanel) clearShown(slot.shownPanel);
                slot.shownPanel = shown;
                if (!P.isAlive(shown)) return;
                const raw = P.isAlive(hidden) ? hidden.text : "";
                const text = raw === null || raw === undefined ? "" : String(raw).trim();
                const content = text === "0" ? "" : text;
                if (shown.text !== content) shown.text = content;
            }

            function update() {
                if (!active) return;
                const currentRoot = $.GetContextPanel();
                const currentTop = topResolver.resolve(currentRoot) || legacyTopResolver.resolve(currentRoot);
                if (currentRoot !== root || currentTop !== topBar) {
                    release(); root = currentRoot; topBar = currentTop;
                }
                if (!enabled || !P.isAlive(topBar)) return;
                const players = readPlayers(topBar);
                const currentPlayers = new Set(players);
                for (const player of ownedPlayers) if (!currentPlayers.has(player)) releasePlayer(player);
                ownedPlayers = currentPlayers;
                P.setClass(topBar, CLASS_NAME, true);
                for (const player of players) {
                    P.setClass(player, CLASS_NAME, true);
                    readSlot(player);
                }
            }

            function refreshSettings() {
                enabled = Number(ctx.config.view().ENABLE_ULT_COOLDOWNS) === 1;
                QOL.core.hud.refreshRootClasses($.GetContextPanel());
                if (!enabled) release();
                update();
            }

            return {
                onEnable() {
                    active = true;
                    refreshSettings();
                    loop = QOL.core.Scheduler.createPollLoop(update, 0.25, FEATURE_ID);
                },
                onSettingsChanged: refreshSettings,
                onDisable() {
                    active = false;
                    if (loop) { loop.stop(); loop = null; }
                    release(); root = null;
                }
            };
        },
        test() {
            const root = $.GetContextPanel();
            const top = QOL.core.panel.findTraverse(root, "TopBar") || QOL.core.panel.findTraverse(root, "CitadelHudTopBar");
            if (!top) return null;
            return { passed: true, name: "Ult cooldown top bar check", message: "", assertions: [{ passed: true, name: "TopBar exists" }] };
        }
    });
})();

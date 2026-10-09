// OWNS: Urn/networth difference source selection and the created UrnTracker tree.
// DOES NOT OWN: Native scores, topbar geometry, the match clock or the rift timer.
// Evidence: hud.xml > HudCore > TopBar; citadel_hud_top_bar.xml TeamNetworth,
// TeamScoreFriendly/TeamScoreEnemy > ScoreLabel. Retains the per-player fallback.
(() => {
    "use strict";
    QOL.core.FeatureRegistry.register({
        id: "ql_urn_tracker",
        enableKey: "ENABLE_URN_DIFF",
        enabledByDefault: false,
        settings: [{ key: "ENABLE_URN_DIFF", type: "toggle" }],
        create(ctx) {
            const P = QOL.core.panel, U = QOL.utils, model = QOL.features.urnDifferenceModel;
            const topResolver = QOL.panelCache.createIdResolver("TopBar", {
                ownerPath: [{ id: "Hud", optional: true }, { className: "HudCore" }]
            });
            const tree = P.createOwnedTree();
            let running = false, enabled = false, loop = null, root = null;
            let parent = null, overlay = null, label = null, icon = null;

            function clearOverlay() {
                tree.clear();
                parent = overlay = label = icon = null;
            }
            function release() { clearOverlay(); topResolver.reset(); root = null; }
            function hideOverlay() {
                if (P.isAlive(overlay) && overlay.visible !== false) P.setVisible(overlay, false);
            }
            function ensure(nextParent) {
                tree.sweep();
                if (parent !== nextParent || (P.isAlive(overlay) && overlay.GetParent() !== nextParent)) clearOverlay();
                parent = nextParent;
                const previous = overlay;
                overlay = tree.child(parent, "Panel", "UrnTracker", { "class": "UrnTracker" });
                if (previous !== overlay) hideOverlay();
                label = tree.child(overlay, "Label", "UrnTrackerLabel", { "class": "UrnTrackerLabel" });
                icon = tree.child(overlay, "Panel", "UrnTrackerSoulIcon", { "class": "UrnTrackerSoulIcon" });
                return P.isAlive(overlay) && P.isAlive(label) && P.isAlive(icon);
            }
            function readSource(top) {
                // Reconcile live descendants at the sampling cadence. A living old
                // label, removed class or late preferred score is not a valid cache.
                const labels = (owner, className) => P.isAlive(owner) ? U.FindPanelsByClass(owner, className) : [];
                const friendly = labels(P.findTraverse(top, "TeamScoreFriendly"), "ScoreLabel");
                const enemy = labels(P.findTraverse(top, "TeamScoreEnemy"), "ScoreLabel");
                if (friendly.length && enemy.length) return { friendly, enemy };
                const teams = P.findTraverse(top, "TeamsContainer");
                const team = (preferred, fallback) => U.FindFirstPanelByClass(teams, preferred) || U.FindFirstPanelByClass(teams, fallback);
                return { friendly: labels(team("friend", "team1"), "hiddenGoldValue"),
                    enemy: labels(team("enemy", "team2"), "hiddenGoldValue") };
            }
            function render(result) {
                if (label.text !== result.display) label.text = result.display;
                for (const mood of ["good", "bad", "neutral"]) P.setClass(overlay, mood, result.mood === mood);
                P.setClass(overlay, "show", true);
                if (overlay.visible !== true) P.setVisible(overlay, true);
            }
            function update() {
                if (!running) return;
                const nextRoot = P.findHud($.GetContextPanel());
                if (root !== nextRoot) { release(); root = nextRoot; }
                if (!enabled || !P.isAlive(root) || (root.id !== "Hud" && root.paneltype !== "CitadelHud") ||
                    QOL.core.hud.isInHideout(root)) { clearOverlay(); return; }
                const top = topResolver.resolve(root);
                if (!P.isAlive(top)) { clearOverlay(); return; }
                const nextParent = U.FindFirstPanelByClass(top, "TeamNetworth") || top;
                const source = readSource(top);
                const total = values => values.reduce((sum, panel) => sum + model.parse(panel.text), 0);
                const result = model.derive(total(source.friendly), total(source.enemy), QOL.core.time.readGameTime(top));
                if (ensure(nextParent)) render(result);
                else hideOverlay();
            }
            function refresh() {
                enabled = U.IsCfgEnabled(ctx.config.view(), "ENABLE_URN_DIFF");
                update();
            }
            return {
                onEnable() {
                    running = true; refresh();
                    loop = QOL.core.Scheduler.createPollLoop(update, 0.3, ctx.id);
                },
                onSettingsChanged: refresh,
                onDisable() {
                    running = enabled = false;
                    if (loop) loop.stop(); loop = null;
                    release(); tree.dispose();
                }
            };
        }
    });
})();

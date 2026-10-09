// OWNS: Text combat-status overlay, private phase history and created panel tree.
// DOES NOT OWN: Native combat evidence or independent healthbar indicator classes.
// Source/parent: hud.xml HudCore > gameplay_hud; combat evidence delegates to core/hud.
(() => {
    "use strict";
    QOL.core.FeatureRegistry.register({
        id: "ql_combat_status",
        enableKey: "ENABLE_COMBAT_STATUS",
        enabledByDefault: false,
        settings: [
            { key: "ENABLE_COMBAT_STATUS", type: "toggle" },
            { key: "COMBAT_STATUS_SCALE", type: "slider" },
            { key: "COMBAT_STATUS_X_OFFSET", type: "slider" },
            { key: "COMBAT_STATUS_Y_OFFSET", type: "slider" }
        ],
        create(ctx) {
            const P = QOL.core.panel, hud = QOL.core.hud;
            const resolver = QOL.panelCache.createIdResolver("gameplay_hud", {
                ownerPath: [{ id: "Hud", optional: true }, { className: "HudCore" }]
            });
            const tree = P.createOwnedTree();
            let running = false, root = null, parent = null, model = null, loop = null;
            let overlay = null, stateLabel = null, timerLabel = null, signature = null;
            let lastCombatMs = null, combatStartMs = null, signalActive = false;
            function resetPhase() { lastCombatMs = combatStartMs = null; signalActive = false; }
            function clearOverlay() {
                tree.clear();
                overlay = stateLabel = timerLabel = parent = signature = null;
            }
            function release() { clearOverlay(); resetPhase(); resolver.reset(); root = null; }
            function ensure(currentParent) {
                tree.sweep();
                if (parent !== currentParent || (P.isAlive(overlay) && overlay.GetParent() !== currentParent)) clearOverlay();
                parent = currentParent;
                const previous = overlay;
                overlay = tree.child(parent, "Panel", "QOLCombatStatusOverlay");
                if (overlay !== previous) signature = null;
                stateLabel = tree.child(overlay, "Label", "QOLCombatStatusState");
                timerLabel = tree.child(overlay, "Label", "QOLCombatStatusTimer");
                return P.isAlive(overlay) && P.isAlive(stateLabel) && P.isAlive(timerLabel);
            }
            function phase(now) {
                const signal = hud.isCombatSignalActive(root) === true;
                if (signal) { if (!signalActive || combatStartMs === null) combatStartMs = now; lastCombatMs = now; }
                signalActive = signal;
                const elapsed = lastCombatMs === null ? Infinity : now - lastCombatMs;
                const recovering = !signal && lastCombatMs !== null && elapsed <= 3000;
                if (!signal && !recovering) combatStartMs = null;
                return { signal, recovering,
                    state: signal ? "IN COMBAT" : recovering ? "RECOVERING" : "OUT OF COMBAT",
                    timer: signal ? (Math.max(0, now - combatStartMs) / 1000).toFixed(1) + "s" :
                        recovering ? (Math.max(0, 3000 - elapsed) / 1000).toFixed(1) + "s" : "--" };
            }
            function update() {
                if (!running) return;
                const currentRoot = P.findHud($.GetContextPanel());
                if (root !== currentRoot) { release(); root = currentRoot; }
                if (!P.isAlive(root) || (root.id !== "Hud" && root.paneltype !== "CitadelHud") || !model.enabled) { clearOverlay(); resetPhase(); return; }
                const currentParent = resolver.resolve(root);
                if (!P.isAlive(currentParent)) { clearOverlay(); resetPhase(); return; }
                const next = phase(QOL.utils.PerfNowMs());
                if (!ensure(currentParent)) return;
                signature = P.syncStyles(overlay, model.styles, signature).sig;
                P.setClass(overlay, "qol-hidden", false);
                P.setClass(overlay, "phase_combat", next.signal);
                P.setClass(overlay, "phase_recover", next.recovering);
                P.setClass(overlay, "phase_idle", !next.signal && !next.recovering);
                if (stateLabel.text !== next.state) stateLabel.text = next.state;
                if (timerLabel.text !== next.timer) timerLabel.text = next.timer;
            }
            function refresh() {
                const cfg = ctx.config.view();
                model = { enabled: QOL.utils.IsCfgEnabled(cfg, "ENABLE_COMBAT_STATUS"), styles: {
                    uiScale: Math.round(Number(cfg.COMBAT_STATUS_SCALE) || 100) + "%",
                    marginLeft: (Math.round(Number(cfg.COMBAT_STATUS_X_OFFSET)) || 0) + "px",
                    marginBottom: (165 + (Math.round(Number(cfg.COMBAT_STATUS_Y_OFFSET)) || 0)) + "px",
                    visibility: "visible"
                } };
                hud.refreshRootClasses($.GetContextPanel()); update();
            }
            return {
                onEnable() { running = true; refresh(); loop = QOL.core.Scheduler.createPollLoop(update, 0.2, ctx.id); },
                onSettingsChanged: refresh,
                onDisable() { running = false; if (loop) loop.stop(); loop = null; release(); model = null; tree.dispose(); }
            };
        },
        test() {
            const root = QOL.core.panel.findHud($.GetContextPanel());
            const parent = QOL.core.panel.findTraverse(root, "gameplay_hud");
            if (!parent) return null;
            return { passed: true, name: "Combat status anchor panel exists", message: "",
                assertions: [{ passed: true, name: "gameplay_hud panel exists" }] };
        }
    });
})();

// OWNS: Accent wash on the current health frame and health-number backers.
// DOES NOT OWN: Native health fill, warning colors, or unrelated healthbars.
(() => {
    "use strict";
    const H = QOL.healthbar;
    const P = QOL.core.panel;
    const readIndex = cfg => P.normalizePaletteIndex(cfg && cfg.PLAYER_HEALTHBAR_ACCENT_COLOR);

    H.registerVariant("accent", function(ctx) {
        let targets = [], signature = null, pending = null, generation = 0;
        const owned = new Set();
        const featureId = ctx && ctx.id || "ql_healthbar";

        function cancel() {
            generation++;
            if (pending) pending.stop();
            pending = null;
        }

        function clear(panel) {
            if (!P.isAlive(panel) || P.clearStyleProperty(panel, "washColor")) owned.delete(panel);
        }

        function release() {
            cancel();
            for (const panel of Array.from(owned)) clear(panel);
            targets = [];
            signature = null;
        }

        function discover(health) {
            if (!P.isAlive(health)) return [];
            const panels = new Set();
            const frame = P.findTraverse(health, "health_bar_frame");
            if (P.isAlive(frame)) panels.add(frame);
            for (const backer of QOL.utils.FindPanelsByClass(health, "healthBacker") || []) {
                if (P.isAlive(backer)) panels.add(backer);
            }
            return Array.from(panels);
        }

        function update(root, cfg, health) {
            const current = discover(health);
            const color = P.resolvePaletteColor(readIndex(cfg));
            const same = current.length === targets.length && current.every((panel, index) => panel === targets[index]);
            if (same && signature === color && (color || owned.size === 0)) return;
            cancel();
            for (const panel of Array.from(owned)) if (!current.includes(panel) || !color) clear(panel);
            targets = current;
            signature = null;
            if (!color || current.length === 0) { if (owned.size === 0) signature = color; return; }
            // Preserve the existing native wash refresh delay. It belongs to this
            // generation and is cancelled on replacement, settings change or disable.
            const token = generation;
            pending = QOL.core.Scheduler.scheduleOnce(() => {
                pending = null;
                if (token !== generation) return;
                let complete = true;
                for (const panel of current) {
                    owned.add(panel);
                    if (!P.setWashColor(panel, color)) complete = false;
                }
                if (complete) signature = color;
            }, 0.01, featureId);
        }
        return { update, release, isActive: () => owned.size > 0 || pending !== null };
    });
    H.accent.readIndex = readIndex;
    QOL.resolvePlayerHealthbarAccentColorIndex = readIndex;
    QOL.applyPlayerHealthbarAccentColor = (...args) => H.accent.update(...args);
})();

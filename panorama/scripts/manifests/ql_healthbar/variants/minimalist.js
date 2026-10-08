// OWNS: Shared healthbar offsets, canvas scale and opacity in every variant.
// DOES NOT OWN: Variant CSS, health values, accents or native child animations.
// Source: Hud > .HudCore > gameplay_hud > health_and_abilities_container.
(() => {
    "use strict";
    const H = QOL.healthbar;
    const P = QOL.core.panel;
    H.registerVariant("minimalist", function(ctx) {
        const resolver = QOL.panelCache.createIdResolver("health_and_abilities_container", {
            retryMs: 400,
            ownerPath: [{ id: "Hud", optional: true }, { className: "HudCore" }, "gameplay_hud"]
        });
        const styles = H.createPlayerStyle();
        const accent = ctx && ctx.accent || H.accent;
        H.bindPlayerStyle(styles);
        let panel = null;

        function release() {
            styles.release();
            accent.release();
            panel = null;
            resolver.reset();
        }

        function update(root, cfg, enabled) {
            const current = resolver.resolve(root);
            if (current !== panel) {
                if (panel) styles.release(panel);
                accent.release();
                panel = current;
            }
            if (!P.isAlive(panel)) return;
            const classActive = root && root.BHasClass("minimalist_healthbar_active");
            const model = H.buildPlayerHealthbarStyleState(cfg, enabled, classActive, root);
            styles.apply(panel, model, true, H.playerScaleGeometry(panel));
            accent.update(root, cfg, panel);
        }
        return { update, release, isActive: () => styles.isActive() || accent.isActive() };
    });
})();

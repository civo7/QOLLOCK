// OWNS: Budhud percentage label, mirroring the native current-health color.
// DOES NOT OWN: Health bindings, native warning colors or variant CSS.
(() => {
    "use strict";
    const H = QOL.healthbar;
    const P = QOL.core.panel;
    const U = QOL.utils;
    H.registerVariant("budhud", function() {
        const resolver = QOL.panelCache.createIdResolver("health_and_abilities_container", {
            retryMs: 400,
            ownerPath: [{ id: "Hud", optional: true }, { className: "HudCore" }, "gameplay_hud"]
        });
        let source = null, current = null, total = null, percent = null;
        let created = false, nextUpdateMs = 0;
        let textSignature = null, styleSignature = null;

        function releaseLabels() {
            if (P.isAlive(percent)) {
                if (created) { percent.visible = false; P.delete(percent); }
                else {
                    P.clearStyleProperty(percent, "visibility");
                    P.clearStyleProperty(percent, "color");
                }
            }
            current = null; total = null; percent = null;
            created = false;
            textSignature = null; styleSignature = null;
        }

        function release() {
            releaseLabels();
            source = null; nextUpdateMs = 0;
            resolver.reset();
        }

        function resolve(root) {
            const health = resolver.resolve(root);
            // HealthRegenAndTotal is a sibling of native bars inside the canvas.
            const numbers = P.findTraverse(health, "HealthRegenAndTotal");
            const group = U.FindFirstPanelByClass(numbers, "healthContainer");
            const nextCurrent = U.FindFirstPanelByClass(group || numbers, "currentHealthLabel");
            const nextTotal = U.FindFirstPanelByClass(group || numbers, "totalHealthLabel");
            if (source !== health || current !== nextCurrent || total !== nextTotal ||
                P.isAlive(percent) && percent.GetParent() !== group) {
                releaseLabels();
                source = health; current = nextCurrent; total = nextTotal;
                nextUpdateMs = 0;
            }
            if (!P.isAlive(current) || !P.isAlive(total) || !P.isAlive(group)) return false;
            if (!P.isAlive(percent)) {
                percent = P.findChild(group, "HealthPercentLabel");
                created = !P.isAlive(percent);
                if (created) percent = P.create("Label", group, "HealthPercentLabel");
                textSignature = null; styleSignature = null;
                if (P.isAlive(percent)) percent.hittest = false;
            }
            return P.isAlive(percent);
        }

        function readModel(cfg) {
            return {
                warningEnabled: QOL.isColorWarningEnabled(cfg)
            };
        }

        function readHealth() {
            const parse = text => {
                const digits = String(text || "").replace(/[^0-9]/g, "");
                return digits ? Number(digits) : NaN;
            };
            const hp = parse(current.text), max = parse(total.text);
            return Number.isFinite(hp) && Number.isFinite(max) && max > 0 ? Math.max(0, hp / max * 100) : null;
        }

        function render(value, model) {
            const text = Math.floor(value) + "%";
            if (textSignature !== text) { percent.text = text; textSignature = text; }
            const styles = { visibility: "visible" };
            // ql_color_warnings is the sole native color writer and pulse model.
            // Reading its current presentation prevents a second animation phase.
            if (model.warningEnabled) styles.color = current.style.color || U.ToRgbString(U.COLORED_HEALTHBAR_COLOR_WHITE);
            else P.clearStyleProperty(percent, "color");
            styleSignature = P.syncStyles(percent, styles, styleSignature).sig;
        }

        function update(root, cfg, type, nowMs) {
            if (Number(type) !== 4 || !P.isAlive(root)) { release(); return; }
            if (!resolve(root)) { nextUpdateMs = Number(nowMs) + 400; return; }
            if (Number(nowMs) < nextUpdateMs) return;
            const value = readHealth();
            if (value === null) { nextUpdateMs = Number(nowMs) + 200; return; }
            render(value, readModel(cfg));
            nextUpdateMs = Number(nowMs) + 100;
        }
        return { update, release, isActive: () => P.isAlive(percent) };
    });
})();

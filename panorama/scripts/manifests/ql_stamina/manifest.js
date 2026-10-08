// Relative stamina rotation and ready/drained pip border color.
// Preserve main's native baseline and feedback contract (11e0434).
// Source: element_charges.xml; captured crosshair > dash > charges_container.
(() => {
    "use strict";
    const Q = QOL;
    const P = Q.core.panel;
    const element = Q.presentation.elements.find(item => item.id === "stamina");
    function findCharges(root) {
        const direct = Q.presentation.resolve(element, root);
        if (direct) return direct;
        // Compatibility with a native stamina wrapper outside the named path;
        // active-ability/roll charge containers have no drained stamina pips.
        for (const wrapper of QOL_UTILS.FindPanelsByClass(root, "ability_element_charges")) {
            const candidate = P.findTraverse(wrapper, "charges_container");
            if (QOL_UTILS.FindPanelsByClass(candidate, "charge_drained").length) return candidate;
        }
        return null;
    }
    Q.core.FeatureRegistry.register({
        id: "ql_stamina", enabledByDefault: true,
        settings: [
            { key: "STAMINA_CHARGE_ANGLE", type: "slider" },
            { key: "STAMINA_CHARGE_COLOR", type: "palette" }
        ],
        create(ctx) {
            const colored = new Map();
            let panel = null, signature = null, model = null, loop = null;
            let nativeTransform = "", rotationApplied = false;
            function releaseRotation() {
                if (rotationApplied && P.isAlive(panel)) {
                    if (nativeTransform) panel.style.transform = nativeTransform;
                    else QOL_UTILS.ClearStyleSafe(panel, "transform");
                }
                rotationApplied = false;
                signature = null;
            }
            function release() {
                for (const target of colored.keys()) QOL_UTILS.ClearStyleSafe(target, "borderColor");
                colored.clear();
                releaseRotation();
                panel = null;
                nativeTransform = "";
            }
            function renderColor() {
                const targets = new Set();
                if (model.color) {
                    for (const target of QOL_UTILS.FindPanelsByClass(panel, "charge_fg")) {
                        const charge = target.GetParent();
                        if (P.hasClassToken(charge, "has_charge") &&
                            !["charging", "draining", "disabled", "drained"].some(state => P.hasClassToken(charge, state))) targets.add(target);
                    }
                    for (const target of QOL_UTILS.FindPanelsByClass(panel, "charge_drained")) targets.add(target);
                }
                for (const target of colored.keys()) {
                    if (!targets.has(target)) { QOL_UTILS.ClearStyleSafe(target, "borderColor"); colored.delete(target); }
                }
                for (const target of targets) {
                    // Native state changes can replace a code-written border.
                    const previous = target.style.borderColor === model.color ? colored.get(target) : null;
                    colored.set(target, P.syncStyles(target, { borderColor: model.color }, previous).sig);
                }
            }
            function update() {
                if (!model.active) { release(); return; }
                const current = findCharges($.GetContextPanel());
                if (current !== panel) {
                    release(); panel = current;
                    if (panel) {
                        const value = String(panel.style.transform || "");
                        nativeTransform = value === "none" ? "" : value;
                    }
                }
                if (!P.isAlive(panel)) return;
                if (!model.rotation) releaseRotation();
                else {
                    const transform = (nativeTransform ? nativeTransform + " " : "") + "rotateZ(" + model.rotation + "deg)";
                    rotationApplied = true;
                    signature = P.syncStyles(panel, { transform }, signature).sig;
                }
                renderColor();
            }
            function refreshSettings() {
                const cfg = ctx.config.view();
                const raw = Math.round(Number(cfg.STAMINA_CHARGE_ANGLE));
                const angle = QOL_UTILS.NormalizeDegrees360(Number.isFinite(raw) ? raw : 45);
                const color = P.resolvePaletteColor(cfg.STAMINA_CHARGE_COLOR);
                model = { active: angle !== 45 || !!color, color, rotation: angle - 45 };
                signature = null;
                update();
            }
            return {
                onEnable() { refreshSettings(); loop = Q.core.Scheduler.createPollLoop(update, 0.5, ctx.id); },
                onSettingsChanged: refreshSettings,
                onDisable() { if (loop) loop.stop(); loop = null; release(); model = null; }
            };
        },
        test() {
            const panel = findCharges($.GetContextPanel());
            return panel ? { passed: true, name: "Stamina charges panel exists", message: "",
                assertions: [{ passed: true, name: "charges_container panel exists" }] } : null;
        }
    });
})();

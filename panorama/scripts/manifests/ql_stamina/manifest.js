// Native-relative stamina rotation and ready/drained pip border color.
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
            const colored = new Map(), rotations = new Map();
            let panel = null, root = null, model = null, loop = null, active = false;
            function releaseColor(target) {
                if (!P.isAlive(target) || P.clearStyleProperty(target, "borderColor")) colored.delete(target);
            }
            function releaseRotation(target) {
                const record = rotations.get(target);
                if (!record) return;
                if (!P.isAlive(target)) { rotations.delete(target); return; }
                try {
                    if (record.nativeTransform) target.style.transform = record.nativeTransform;
                    else if (!P.clearStyleProperty(target, "transform")) return;
                    rotations.delete(target);
                } catch (_) { /* Retain a rejected native restore for retry. */ }
            }
            function release() {
                for (const target of colored.keys()) releaseColor(target);
                for (const target of rotations.keys()) releaseRotation(target);
                panel = null;
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
                    if (!targets.has(target)) releaseColor(target);
                }
                for (const target of targets) {
                    // Native state changes can replace a code-written border.
                    const previous = target.style.borderColor === model.color ? colored.get(target) : null;
                    colored.set(target, P.syncStyles(target, { borderColor: model.color }, previous).sig);
                }
            }
            function update() {
                if (!active) return;
                const currentRoot = P.findHud($.GetContextPanel());
                if (currentRoot !== root) { release(); root = currentRoot; }
                if (!model.active || !P.isAlive(root) || (root.id !== "Hud" && root.paneltype !== "CitadelHud")) { release(); return; }
                const current = findCharges(root);
                if (current !== panel) {
                    release(); panel = current;
                }
                for (const target of rotations.keys()) if (target !== panel) releaseRotation(target);
                if (!P.isAlive(panel)) return;
                if (!model.rotation) releaseRotation(panel);
                else {
                    let record = rotations.get(panel);
                    if (!record) {
                        const value = String(panel.style.transform || "");
                        record = { nativeTransform: value === "none" ? "" : value, signature: null, readback: null };
                        rotations.set(panel, record);
                    }
                    const transform = (record.nativeTransform ? record.nativeTransform + " " : "") + "rotateZ(" + model.rotation + "deg)";
                    const previous = String(panel.style.transform || "") === record.readback ? record.signature : null;
                    record.signature = P.syncStyles(panel, { transform }, previous).sig;
                    if (record.signature !== null) record.readback = String(panel.style.transform || "");
                }
                renderColor();
            }
            function refreshSettings() {
                if (!active) return;
                const cfg = ctx.config.view();
                const raw = Math.round(Number(cfg.STAMINA_CHARGE_ANGLE));
                const stored = Number.isFinite(raw) ? raw : QOL_DEFAULT_CONFIG.STAMINA_CHARGE_ANGLE;
                const rotation = QOL_UTILS.ShortestDegreesDelta(0, Q.presentation.toDisplayValue("STAMINA_CHARGE_ANGLE", stored));
                const color = P.resolvePaletteColor(cfg.STAMINA_CHARGE_COLOR);
                model = { active: !!rotation || !!color, color, rotation };
                for (const record of rotations.values()) record.signature = null;
                update();
            }
            return {
                onEnable() { active = true; refreshSettings(); loop = Q.core.Scheduler.createPollLoop(update, 0.5, ctx.id); },
                onSettingsChanged: refreshSettings,
                onDisable() { active = false; if (loop) loop.stop(); loop = null; release(); root = model = null; }
            };
        },
        test() {
            const panel = findCharges($.GetContextPanel());
            return panel ? { passed: true, name: "Stamina charges panel exists", message: "",
                assertions: [{ passed: true, name: "charges_container panel exists" }] } : null;
        }
    });
})();

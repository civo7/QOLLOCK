// OWNS: Healthbar variant registration and instance-scoped presentation styles.
// DOES NOT OWN: Native health values, variant animations or root CSS projection.
(() => {
    "use strict";
    const H = QOL.healthbar = QOL.healthbar || {};
    const P = QOL.core.panel;

    // Compatibility calls delegate to the dispatcher-owned instance. Registration
    // and factory construction never mutate panels or start work.
    H.registerVariant = function(name, factory) {
        let current = null;
        const api = {
            create(ctx) {
                current = factory(ctx);
                return current;
            },
            update(...args) {
                if (!current) current = factory();
                return current.update(...args);
            },
            release() { if (current) current.release(); },
            reset() { if (current) current.release(); },
            isActive() { return !!current && current.isActive(); },
            inspect() { return current && current.inspect ? current.inspect() : null; }
        };
        H[name] = api;
        return api;
    };

    H.getPlayerScalePanel = panel => P.findChild(panel, "QOLHealthbarGeometry");
    H.playerScaleGeometry = function(panel) {
        if (!P.isAlive(panel)) return { target: null, width: 0, height: 0 };
        const logicalSize = (axis, dimension) => {
            const actual = Number(panel["actuallayout" + dimension]);
            const scale = Number(panel["actualuiscale_" + axis]);
            return actual > 0 && scale > 0 ? Number((actual / scale).toFixed(2)) : 0;
        };
        return { target: H.getPlayerScalePanel(panel), width: logicalSize("x", "width"), height: logicalSize("y", "height") };
    };

    H.buildPlayerHealthbarStyleState = function(cfg, minimalistEnabled, minimalistClassActive, root) {
        const number = key => QOL.settings.readNumber(key, cfg && cfg[key]);
        const x = number("PLAYER_HEALTHBAR_X_OFFSET");
        const y = number("PLAYER_HEALTHBAR_Y_OFFSET");
        const scale = number("PLAYER_HEALTHBAR_SCALE");
        const opacity = QOL.utils.NormalizeOpacityNumber(cfg && cfg.PLAYER_HEALTHBAR_OPACITY != null ? cfg.PLAYER_HEALTHBAR_OPACITY : 1, 1);
        const minimalist = minimalistEnabled && minimalistClassActive;
        const mx = minimalist ? number("MINIMALIST_HEALTHBAR_X_OFFSET") : 0;
        const my = minimalist ? number("MINIMALIST_HEALTHBAR_Y_OFFSET") : 0;
        // The outer container has native CSS scale/aspect-ratio baselines. This
        // fallback is only used by a previously loaded layout without the canvas.
        const hud = P.findHud(root);
        const hidden = QOL.presentation.shouldHide("healthbar", cfg, hud);
        const has = cls => P.isAlive(hud) && hud.BHasClass(cls);
        let baseline = has("support_16_10_active") ? 104 : 120;
        if (has("minecraft_healthbar_active")) baseline = 130;
        if (has("fg_healthbar_active")) baseline = 120;
        if (has("support_16_10_active")) {
            if (has("klutz_healthbar_active")) baseline = 125;
            if (has("minimalist_healthbar_active") && has("AspectRatio16x10")) baseline = 110;
        }
        return {
            finalOffsetX: x + mx, finalOffsetY: -y - my,
            finalScale: scale / 100, scaleText: Number((baseline * scale / 100).toFixed(2)) + "%",
            hidden, playerOpacity: opacity, opacityText: opacity.toFixed(2),
            scaleActive: scale !== 100, opacityActive: opacity !== 1,
            scaleOpacityActive: scale !== 100 || opacity !== 1 || hidden
        };
    };

    H.createPlayerStyle = function() {
        const owners = new Map();
        const entry = panel => {
            let record = owners.get(panel);
            if (!record) {
                record = {
                    offsets: P.createNativeStyleOwner({ resetValues: { x: "0px", y: "0px" }, releasePosition: true }),
                    appearance: P.createNativeStyleOwner(),
                    canvas: P.createNativeStyleOwner(),
                    moved: false, styled: false
                };
                owners.set(panel, record);
            }
            return record;
        };
        function releaseScaleOpacity(panel) {
            const record = owners.get(panel);
            if (!record) return;
            record.appearance.clear(); record.canvas.clear();
            record.styled = false;
        }
        function releaseOffsets(panel) {
            const record = owners.get(panel);
            if (!record) return;
            record.offsets.clear(); record.moved = false;
        }
        function release(panel) {
            const targets = panel ? [panel] : Array.from(owners.keys());
            for (const target of targets) {
                releaseScaleOpacity(target); releaseOffsets(target);
                owners.delete(target);
            }
        }
        function apply(panel, model, includeOffsets = true, geometry = null) {
            if (!P.isAlive(panel) || !model) return false;
            for (const owner of owners.keys()) if (!P.isAlive(owner)) release(owner);
            const record = entry(panel), offsets = {}, appearance = {}, canvas = {};
            if (includeOffsets) {
                if (model.finalOffsetX !== 0) offsets.x = model.finalOffsetX + "px";
                if (model.finalOffsetY !== 0) offsets.y = model.finalOffsetY + "px";
            }
            if (model.opacityActive) appearance.opacity = model.opacityText;
            if (model.hidden) appearance.visibility = "collapse";

            // Default scale releases geometry overrides without layout reads.
            const target = model.scaleActive ? (P.isAlive(geometry?.target) ? geometry.target : H.getPlayerScalePanel(panel)) : null;
            const retired = record.canvas.retain(target ? [target] : []);
            if (target) {
                const geo = geometry || H.playerScaleGeometry(panel);
                if (geo.width > 0 && geo.height > 0) {
                    canvas.width = geo.width + "px";
                    canvas.height = geo.height + "px";
                    canvas.uiScale = Math.round(model.finalScale * 100) + "%";
                }
            } else if (model.scaleActive) appearance.uiScale = model.scaleText;
            record.moved = Object.keys(offsets).length > 0;
            record.styled = Object.keys(appearance).length > 0 || Object.keys(canvas).length > 0;
            // Run all owners even after a rejected write so unrelated retirement
            // can finish; each shared owner retains its own cleanup-only retry.
            const positioned = record.offsets.apply(panel, offsets);
            const styled = record.appearance.apply(panel, appearance);
            const scaled = target ? record.canvas.apply(target, canvas) : true;
            return positioned && styled && scaled && retired;
        }
        return { apply, release, releaseScaleOpacity, releaseOffsets,
            isActive: () => Array.from(owners.values()).some(record => record.moved || record.styled) };
    };

    // Public presentation helpers always address the dispatcher's sole style owner.
    let playerStyle = null;
    H.bindPlayerStyle = owner => { playerStyle = owner; };
    const styleOwner = () => playerStyle || (playerStyle = H.createPlayerStyle());
    H.applyPlayerStyleToPanel = (...args) => styleOwner().apply(...args);
    H.resetPlayerStyle = panel => styleOwner().release(panel);
    H.resetPlayerScaleOpacity = panel => styleOwner().releaseScaleOpacity(panel);
    H.resetMinimalistOffsetRuntime = panel => styleOwner().releaseOffsets(panel);
    H.resetMinimalistOffsetRuntimeAll = () => styleOwner().release();
})();

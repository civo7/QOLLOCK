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
        const logicalSize = (axis, dimension) => {
            const actual = Number(panel && panel["actuallayout" + dimension]);
            const scale = Number(panel && panel["actualuiscale_" + axis]);
            return actual > 0 && scale > 0 ? Number((actual / scale).toFixed(2)) : 0;
        };
        return { target: H.getPlayerScalePanel(panel), width: logicalSize("x", "width"), height: logicalSize("y", "height") };
    };

    H.buildPlayerHealthbarStyleState = function(cfg, minimalistEnabled, minimalistClassActive, root) {
        const number = (key, fallback, min, max, round = false) => {
            let value = Number(cfg && cfg[key]);
            if (!Number.isFinite(value) || !cfg || cfg[key] === undefined || cfg[key] === null) value = fallback;
            if (round) value = Math.round(value);
            return Math.max(min, Math.min(max, value));
        };
        const x = number("PLAYER_HEALTHBAR_X_OFFSET", 0, -1000, 1000, true);
        const y = number("PLAYER_HEALTHBAR_Y_OFFSET", 0, -1000, 1000, true);
        const scale = number("PLAYER_HEALTHBAR_SCALE", 100, 50, 200, true);
        const opacity = number("PLAYER_HEALTHBAR_OPACITY", 1, 0, 1);
        const minimalist = minimalistEnabled && minimalistClassActive;
        const mx = minimalist ? number("MINIMALIST_HEALTHBAR_X_OFFSET", 0, -300, 300, true) : 0;
        const my = minimalist ? number("MINIMALIST_HEALTHBAR_Y_OFFSET", 0, -300, 300, true) : 0;
        // The outer container has native CSS scale/aspect-ratio baselines. This
        // fallback is only used by a previously loaded layout without the canvas.
        const hud = P.findHud(root);
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
            finalScale: scale / 100, scaleText: Math.round(baseline * scale / 100) + "%",
            playerOpacity: opacity, opacityText: opacity.toFixed(2),
            scaleActive: scale !== 100, opacityActive: opacity !== 1,
            scaleOpacityActive: scale !== 100 || opacity !== 1
        };
    };

    H.createPlayerStyle = function() {
        const owners = new Map();
        const canvases = new Map();

        function clear(panel, property) {
            if (!P.isAlive(panel)) return true;
            if (property === "x" || property === "y") {
                try { panel.style[property] = "0px"; } catch (_) { return false; }
            }
            return P.clearStyleProperty(panel, property);
        }

        function releaseProperties(panel, properties) {
            const record = owners.get(panel);
            if (!record) return;
            let offsets = false;
            for (const property of Array.from(record.owned)) {
                if (properties && !properties.has(property)) continue;
                if (clear(panel, property)) {
                    record.owned.delete(property);
                    offsets = offsets || property === "x" || property === "y";
                }
            }
            if (offsets) P.clearStyleProperty(panel, "position");
            record.signature = null;
            if (record.owned.size === 0) owners.delete(panel);
        }

        function sync(panel, styles) {
            if (!P.isAlive(panel)) return false;
            let record = owners.get(panel);
            if (!record && Object.keys(styles).length === 0) return true;
            if (!record) { record = { owned: new Set(), signature: null }; owners.set(panel, record); }
            let cleared = true;
            for (const property of Array.from(record.owned)) {
                if (Object.prototype.hasOwnProperty.call(styles, property)) continue;
                if (clear(panel, property)) {
                    record.owned.delete(property);
                    if (property === "x" || property === "y") P.clearStyleProperty(panel, "position");
                } else cleared = false;
                record.signature = null;
            }
            // Track attempted properties before writing so partial failures can
            // still be cleaned up, and cache only a complete successful map.
            for (const property of Object.keys(styles)) record.owned.add(property);
            const result = P.syncStyles(panel, styles, record.signature);
            record.signature = cleared ? result.sig : null;
            if (record.owned.size === 0) owners.delete(panel);
            return result.sig !== null && cleared;
        }

        function releaseScaleOpacity(panel) {
            const canvas = canvases.get(panel);
            if (canvas) releaseProperties(canvas);
            canvases.delete(panel);
            releaseProperties(panel, new Set(["uiScale", "opacity"]));
        }

        function release(panel) {
            if (panel) {
                releaseScaleOpacity(panel);
                releaseProperties(panel);
                return;
            }
            for (const owner of Array.from(owners.keys())) releaseProperties(owner);
            canvases.clear();
        }

        function apply(panel, model, includeOffsets = true, geometry = H.playerScaleGeometry(panel)) {
            if (!P.isAlive(panel) || !model) return false;
            for (const owner of owners.keys()) if (!P.isAlive(owner)) owners.delete(owner);
            for (const owner of canvases.keys()) if (!P.isAlive(owner)) canvases.delete(owner);
            const styles = {};
            if (includeOffsets) {
                if (model.finalOffsetX !== 0) styles.x = model.finalOffsetX + "px";
                if (model.finalOffsetY !== 0) styles.y = model.finalOffsetY + "px";
            }
            if (model.opacityActive) styles.opacity = model.opacityText;
            const previous = canvases.get(panel);
            if (previous && previous !== geometry.target) releaseProperties(previous);
            let complete = true;
            if (P.isAlive(geometry.target)) {
                canvases.set(panel, geometry.target);
                const canvasStyles = {};
                if (model.scaleActive && geometry.width > 0 && geometry.height > 0) {
                    canvasStyles.width = geometry.width + "px";
                    canvasStyles.height = geometry.height + "px";
                    canvasStyles.uiScale = Math.round(model.finalScale * 100) + "%";
                }
                complete = sync(geometry.target, canvasStyles);
            } else {
                canvases.delete(panel);
                if (model.scaleActive) styles.uiScale = model.scaleText;
            }
            return sync(panel, styles) && complete;
        }
        return { apply, release, releaseScaleOpacity,
            releaseOffsets: panel => releaseProperties(panel, new Set(["x", "y"])),
            isActive: () => owners.size > 0 };
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

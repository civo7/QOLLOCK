// Actual layout offsets are screen pixels. Convert them into the overlay's UI
// units, and drag deltas into the native owner's parent units, independently.
(() => {
    "use strict";
    const Q = globalThis.QOL;
    const alive = Q.core.panel.isAlive;
    const scale = (panel, axis) => {
        const value = Number(panel?.["actualuiscale_" + axis]);
        if (Number.isFinite(value) && value > 0) return value;
        // Match the settings tooltip's fallback when native UI scale is absent.
        const dimension = axis === "x" ? "width" : "height";
        const actual = Number(panel?.["actuallayout" + dimension]);
        const desired = Number(panel?.["desiredlayout" + dimension]);
        return actual > 0 && desired > 0 ? actual / desired : 1;
    };
    function absolute(panel) {
        const point = { x: 0, y: 0 };
        let node = panel;
        let depth = 0;
        while (alive(node) && depth++ < 64) {
            point.x += Number(node.actualxoffset) || 0;
            point.y += Number(node.actualyoffset) || 0;
            const parent = node.GetParent();
            point.x -= Number(parent?.scrolloffset_x ?? parent?.actualscrolloffset_x) || 0;
            point.y -= Number(parent?.scrolloffset_y ?? parent?.actualscrolloffset_y) || 0;
            node = parent;
        }
        return point;
    }
    function box(target, host) {
        if (!alive(target) || !alive(host) || target.visible === false) return null;
        const width = Number(target.actuallayoutwidth);
        const height = Number(target.actuallayoutheight);
        if (!(width > 0 && height > 0)) return null;
        const origin = absolute(target);
        const hostOrigin = absolute(host);
        return {
            x: (origin.x - hostOrigin.x) / scale(host, "x"), y: (origin.y - hostOrigin.y) / scale(host, "y"),
            width: width / scale(host, "x"), height: height / scale(host, "y"), origin
        };
    }
    function viewport(host) {
        if (!alive(host)) return null;
        const width = Number(host.actuallayoutwidth) / scale(host, "x");
        const height = Number(host.actuallayoutheight) / scale(host, "y");
        return width > 0 && height > 0 ? { x: 0, y: 0, width, height } : null;
    }
    const canvasDelta = (delta, host) => ({ x: delta.x / scale(host, "x"), y: delta.y / scale(host, "y") });
    const screenDelta = (delta, host) => ({ x: delta.x * scale(host, "x"), y: delta.y * scale(host, "y") });
    function hitBox(bounds, view) {
        const width = Math.max(64, bounds.width), height = Math.max(56, bounds.height);
        const x = bounds.x - (width - bounds.width) / 2, y = bounds.y - (height - bounds.height) / 2;
        return { x: view ? Math.max(0, Math.min(view.width - width, x)) : x,
            y: view ? Math.max(0, Math.min(view.height - height, y)) : y, width, height };
    }
    const points = (bounds, axis) => {
        const size = axis === "x" ? bounds.width : bounds.height;
        return [bounds[axis], bounds[axis] + size / 2, bounds[axis] + size];
    };
    // Pure canvas math. Consumers decide whether native layout has acknowledged
    // the resulting draft before displaying a guide.
    function snap(bounds, delta, view, neighbors, axes = ["x", "y"], threshold = 8) {
        const adjusted = { ...delta }, guides = {};
        for (const axis of axes) {
            const moving = points(bounds, axis).map(value => value + delta[axis]);
            const candidates = [];
            if (view) points(view, axis).forEach((value, index) => candidates.push({ value, indices: index === 1 ? [1] : [0, 2] }));
            for (const neighbor of neighbors) points(neighbor, axis).forEach((value, index) => candidates.push({
                value, indices: index === 1 ? [1] : [0, 2]
            }));
            let nearest = null;
            for (const candidate of candidates) for (const index of candidate.indices) {
                const distance = candidate.value - moving[index];
                if (Math.abs(distance) <= threshold && (!nearest || Math.abs(distance) < Math.abs(nearest.distance))) {
                    nearest = { ...candidate, index, distance };
                }
            }
            if (nearest) {
                adjusted[axis] += nearest.distance;
                guides[axis] = { value: nearest.value, index: nearest.index };
            }
        }
        return { delta: adjusted, guides };
    }
    function alignDelta(bounds, view, action) {
        if (!bounds || !view) return null;
        const actions = { left: ["x", 0], center: ["x", 1], right: ["x", 2], top: ["y", 0], middle: ["y", 1], bottom: ["y", 2] };
        const selected = actions[action];
        if (!selected) return null;
        const [axis, index] = selected;
        return { x: 0, y: 0, [axis]: points(view, axis)[index] - points(bounds, axis)[index] };
    }
    function isShown(panel) {
        let node = panel;
        let depth = 0;
        if (!alive(panel)) return false;
        while (alive(node) && depth++ < 64) {
            const opacity = node.style.opacity;
            if (node.visible === false || node.BHasClass("qol-hidden") || node.style.visibility === "collapse" ||
                (opacity !== "" && opacity !== undefined && opacity !== null && Number(opacity) === 0)) return false;
            node = node.GetParent();
        }
        return true;
    }
    function union(panels, host) {
        const boxes = panels.filter(isShown).map(panel => box(panel, host)).filter(Boolean);
        if (!boxes.length) return null;
        const x = Math.min(...boxes.map(item => item.x));
        const y = Math.min(...boxes.map(item => item.y));
        return { x, y, width: Math.max(...boxes.map(item => item.x + item.width)) - x,
            height: Math.max(...boxes.map(item => item.y + item.height)) - y };
    }
    function frameBox(element, target, host) {
        const P = Q.core.panel;
        if (!alive(target)) return null;
        if (target.id === "TopBar") {
            // Native TopBar and PlayersContainer deliberately span the screen.
            // Only content from the extracted citadel_hud_top_bar*.xml is used.
            const panels = [];
            const teams = P.findChild(target, "TeamsContainer");
            for (const id of ["TeamFriendly", "TeamEnemy"]) {
                const team = P.findChild(teams, id);
                const players = P.findChild(P.findChild(team, "PlayerContents"), "PlayersContainer");
                if (alive(players)) for (const player of players.Children()) panels.push(P.findChild(player, "PlayerDetailsContainer"));
            }
            for (const child of target.Children()) {
                if (["ObjectivesMap", "RejuvenatorCharges", "StretBrawlContainer", "KothCashInMeter"].includes(child.id) ||
                    ["GameClock", "TeamNetworth", "KillsAndAbilityPointsContainer"].some(cls => child.BHasClass(cls))) panels.push(child);
            }
            return union(panels, host);
        }
        if (["hudActivePlayerStats", "hudPlayerStats"].includes(target.id)) {
            const block = P.findChild(target, "HudStatBlock");
            // Compact stats are the block. Expanded modifier rows belong to the
            // detail/scoreboard presentation and must not enlarge this hit box.
            return union([block], host) ||
                (target.id === "hudPlayerStats" && !alive(block) ? box(target, host) : null);
        }
        if (element.id === "stamina") {
            // The visible pips are clipped arcs inside concentric circles. A
            // rotateZ on their shared owner must not rotate a rectangular hit
            // box's origin; measure the unrotated circles around that center.
            const foregrounds = QOL_UTILS.FindPanelsByClass(target, "charge_fg");
            if (!foregrounds.length) for (const child of target.Children()) {
                const progress = P.findChild(child, "progress");
                if (progress) foregrounds.push(progress);
            }
            return union(foregrounds, host) || box(target, host);
        }
        if (element.id === "healthbar") return box(P.findChild(target, "QOLHealthbarGeometry") || target, host);
        const measured = element.measureId ? (P.findChild(target, element.measureId) || P.findTraverse(target, element.measureId)) : null;
        return (measured ? box(measured, host) : null) || box(target, host);
    }
    function resizeValues(element, startValues, startBox, delta, host, corner = { x: 1, y: 1 }) {
        const field = Q.presentation.resizeField(element);
        if (!field || !startBox || !(startBox.width > 0 && startBox.height > 0)) return {};
        // Project the corner movement onto the original diagonal: one uniform
        // scale, stable for tall/narrow frames and independent of UI density.
        const { width, height } = startBox;
        const ratio = Math.max(0.1, 1 + (corner.x * delta.x / scale(host, "x") * width + corner.y * delta.y / scale(host, "y") * height) /
            (width * width + height * height));
        return { [field.key]: Q.presentation.normalize(field.key, Number(startValues[field.key]) * ratio) };
    }
    function anchorValues(element, target, startBox, currentBox, currentValues, host, corner) {
        const values = {};
        if (!startBox || !currentBox) return values;
        for (const field of element.fields) {
            if (!field.axis) continue;
            const axis = field.axis;
            const size = axis === "x" ? "width" : "height";
            const opposite = corner[axis] < 0 ? 1 : 0;
            const correction = startBox[axis] + opposite * startBox[size] - currentBox[axis] - opposite * currentBox[size];
            if (field.unit === "%") {
                const parent = target.GetParent();
                const dim = Number(axis === "x" ? parent?.actuallayoutwidth : parent?.actuallayoutheight);
                if (!(dim > 0)) continue;
                const deltaPct = (correction * scale(host, axis) / dim) * 100;
                values[field.key] = Q.presentation.normalize(field.key, Number(currentValues[field.key]) + deltaPct * (field.direction || 1));
            } else {
                values[field.key] = Q.presentation.normalize(field.key, Number(currentValues[field.key]) +
                    correction * scale(host, axis) / scale(target.GetParent(), axis) * (field.direction || 1));
            }
        }
        return values;
    }
    function dragValues(element, target, startValues, delta) {
        const parent = target.GetParent();
        const values = {};
        for (const field of element.fields) {
            if (!field.axis) continue;
            const axis = field.axis;
            const dir = field.direction || 1;
            if (field.unit === "%") {
                const dim = Number(axis === "x" ? parent?.actuallayoutwidth : parent?.actuallayoutheight);
                if (!(dim > 0)) continue;
                // Both reported parent dimensions and cursor deltas are physical
                // pixels; dividing by parent UI scale again halves the movement.
                const deltaPct = (delta[axis] / dim) * 100;
                values[field.key] = Q.presentation.normalize(field.key,
                    Number(startValues[field.key]) + deltaPct * dir);
            } else {
                values[field.key] = Q.presentation.normalize(field.key,
                    Number(startValues[field.key]) + delta[axis] / scale(parent, axis) * dir);
            }
        }
        return values;
    }
    Q.ui.customizeGeometry = { scale, absolute, box, frameBox, dragValues, resizeValues, anchorValues, isShown,
        viewport, canvasDelta, screenDelta, hitBox, points, snap, alignDelta };
})();

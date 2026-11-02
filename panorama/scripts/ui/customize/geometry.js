// Actual layout offsets are screen pixels. Convert them into the overlay's UI
// units, and drag deltas into the native owner's parent units, independently.
(() => {
    "use strict";
    const Q = globalThis.QOL;
    // Reject native pending/sentinel coordinates, while admitting every stored
    // layout coordinate at ordinary parent densities. This is not a viewport.
    const coordinateCeiling = Q.settingLimits.coordinate * 64;
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
    function windowPoint(panel) {
        if (!alive(panel)) return null;
        let point;
        try {
            // Compositor drag visuals have no usable layout offsets in native
            // Panorama. Never substitute FLT_MAX or a pending render position.
            point = typeof panel.GetPositionWithinWindow === "function" ? panel.GetPositionWithinWindow() : absolute(panel);
        } catch (_) { return null; }
        const x = Array.isArray(point) ? point[0] : point?.x;
        const y = Array.isArray(point) ? point[1] : point?.y;
        return Number.isFinite(x) && Number.isFinite(y) && Math.abs(x) < coordinateCeiling && Math.abs(y) < coordinateCeiling ? { x, y } : null;
    }
    function cursorPoint() {
        try {
            const point = typeof GameUI !== "undefined" && GameUI.GetCursorPosition?.();
            const x = Array.isArray(point) ? point[0] : point?.x;
            const y = Array.isArray(point) ? point[1] : point?.y;
            return Number.isFinite(x) && Number.isFinite(y) && Math.abs(x) < coordinateCeiling && Math.abs(y) < coordinateCeiling ? { x, y } : null;
        } catch (_) { return null; }
    }
    function windowDelta(delta, host, probe) {
        // Window pixels and layout pixels need not have the same density.
        // The owned probe is exactly 100 CSS units from the canvas origin.
        const a = typeof host?.GetPositionWithinWindow === "function" && windowPoint(host);
        const b = typeof probe?.GetPositionWithinWindow === "function" && windowPoint(probe);
        const result = {};
        for (const axis of ["x", "y"]) {
            const density = a && b && (b[axis] - a[axis]) / 100;
            result[axis] = delta[axis] / (density > 0.1 && density < 10 ? density : scale(host, axis));
        }
        return result;
    }
    function box(target, host) {
        if (!alive(target) || !alive(host) || target.visible === false) return null;
        const width = Number(target.actuallayoutwidth);
        const height = Number(target.actuallayoutheight);
        if (!(width > 0 && height > 0) || !Number.isFinite(width) || !Number.isFinite(height) || width > 100000 || height > 100000) return null;
        const origin = absolute(target);
        const hostOrigin = absolute(host);
        if (![origin.x, origin.y, hostOrigin.x, hostOrigin.y].every(value => Number.isFinite(value) && Math.abs(value) < coordinateCeiling)) return null;
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
        const width = view ? Math.min(view.width, Math.max(64, bounds.width)) : Math.max(64, bounds.width);
        const height = view ? Math.min(view.height, Math.max(56, bounds.height)) : Math.max(56, bounds.height);
        const x = bounds.x - (width - bounds.width) / 2, y = bounds.y - (height - bounds.height) / 2;
        return { x: view ? Math.max(0, Math.min(view.width - width, x)) : x,
            y: view ? Math.max(0, Math.min(view.height - height, y)) : y, width, height };
    }
    // Pad small targets without extending through another disjoint surface's
    // real content. Overlapping/contained families retain their native z-order.
    function inputBox(measured, view, neighbors = []) {
        const padded = hitBox(measured, view);
        let left = padded.x, top = padded.y, right = left + padded.width, bottom = top + padded.height;
        for (const other of neighbors) {
            const nearby = hitBox(other, view);
            if (padded.y < nearby.y + nearby.height && nearby.y < padded.y + padded.height) {
                if (measured.x + measured.width <= other.x) right = Math.min(right, (measured.x + measured.width + other.x) / 2);
                if (other.x + other.width <= measured.x) left = Math.max(left, (other.x + other.width + measured.x) / 2);
            }
            if (padded.x < nearby.x + nearby.width && nearby.x < padded.x + padded.width) {
                if (measured.y + measured.height <= other.y) bottom = Math.min(bottom, (measured.y + measured.height + other.y) / 2);
                if (other.y + other.height <= measured.y) top = Math.max(top, (other.y + other.height + measured.y) / 2);
            }
        }
        // Off-screen content retains the bounded recovery target from hitBox.
        return right > left && bottom > top ? { x: left, y: top, width: right - left, height: bottom - top } : padded;
    }
    const points = (bounds, axis) => {
        const size = axis === "x" ? bounds.width : bounds.height;
        return [bounds[axis], bounds[axis] + size * (axis === "x" ? bounds.centerRatioX ?? 0.5 : 0.5), bounds[axis] + size];
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
        if (action === "recover") return {
            x: Math.max(view.x, Math.min(view.x + Math.max(0, view.width - bounds.width), bounds.x)) - bounds.x,
            y: Math.max(view.y, Math.min(view.y + Math.max(0, view.height - bounds.height), bounds.y)) - bounds.y
        };
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
        if (typeof element.measurePanels === "function") return union(element.measurePanels(target), host);
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
            const bounds = union(panels, host);
            const owner = box(target, host);
            // Card counts and conditional indicators can be asymmetric. Keep
            // content edges, but align the native bar's central axis to center.
            if (bounds && owner) bounds.centerRatioX = (owner.x + owner.width / 2 - bounds.x) / bounds.width;
            return bounds;
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
    function scaleBoundsMatch(measured, before, ratio, sizes = ["width", "height"]) {
        if (!measured || !before || !(ratio > 0)) return false;
        // Native renderers round ui-scale percentages and font dimensions.
        // A fixed two-pixel threshold rejects that normal quantization on a
        // large surface, leaving the next gesture blocked indefinitely.
        return sizes.every(size => {
            const expected = before[size] * ratio;
            return Math.abs(measured[size] - expected) <= Math.max(2, expected * 0.01);
        });
    }
    function anchorValues(element, target, startBox, currentBox, currentValues, host, corner) {
        if (!startBox || !currentBox) return {};
        const delta = {};
        for (const field of element.fields) {
            if (!field.axis) continue;
            const axis = field.axis;
            const size = axis === "x" ? "width" : "height";
            const opposite = corner[axis] < 0 ? 1 : 0;
            const correction = startBox[axis] + opposite * startBox[size] - currentBox[axis] - opposite * currentBox[size];
            delta[axis] = correction * scale(host, axis);
        }
        return dragValues(element, target, currentValues, delta);
    }
    const positionUnitPixels = (field, parent) => (field.unit === "%"
        ? Number(parent?.[field.axis === "x" ? "actuallayoutwidth" : "actuallayoutheight"]) / 100
        : scale(parent, field.axis)) * (field.movementRatio ?? 1);
    function dragValues(element, target, startValues, delta) {
        const parent = target.GetParent();
        const values = {};
        for (const field of element.fields) {
            if (!field.axis) continue;
            const axis = field.axis;
            const dir = field.direction || 1;
            const pixels = positionUnitPixels(field, parent);
            if (!(pixels > 0)) continue;
            values[field.key] = Q.presentation.normalize(field.key,
                Number(startValues[field.key]) + delta[axis] / pixels * dir);
        }
        return values;
    }
    function positionSliderBounds(field, observation) {
        if (!field.axis || !observation || !alive(observation.target) || !alive(observation.host)) return null;
        const { target, host, bounds, values, view } = observation;
        const parent = target.GetParent(), axis = field.axis;
        const size = axis === "x" ? "width" : "height";
        if (!alive(parent) || !bounds || !view || !(view[size] > 0)) return null;
        const density = scale(host, axis);
        const divisor = positionUnitPixels(field, parent);
        if (!(divisor > 0)) return null;
        // Full containment collapses travel for screen-sized content. Include
        // center travel, oversized edge alignments and the accepted position.
        const center = points(bounds, axis)[1];
        const endpoints = [0, view[axis] - center, view[axis] + view[size] - center,
            view[axis] - bounds[axis], view[axis] + view[size] - bounds[axis] - bounds[size]]
            .map(delta => Number(values[field.key]) + delta * density / divisor * (field.direction || 1));
        const limits = Q.settings.get(field.key);
        const min = Math.max(limits.min, Math.min(...endpoints)), max = Math.min(limits.max, Math.max(...endpoints));
        return Number.isFinite(min) && Number.isFinite(max) && min <= max ? { min, max } : null;
    }
    Q.ui.customizeGeometry = { scale, absolute, windowPoint, windowDelta, cursorPoint, box, frameBox, positionUnitPixels, dragValues, resizeValues, scaleBoundsMatch, anchorValues, isShown,
        viewport, canvasDelta, screenDelta, hitBox, inputBox, points, snap, alignDelta, positionSliderBounds };
})();

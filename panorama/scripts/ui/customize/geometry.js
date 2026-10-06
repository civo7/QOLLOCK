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
            return union(QOL_UTILS.FindPanelsByClass(target, "charge_fg"), host) || box(target, host);
        }
        return box(element.measureId ? P.findChild(target, element.measureId) : target, host);
    }
    function resizeValues(element, startValues, startBox, delta, host) {
        const field = Q.presentation.resizeField(element);
        if (!field || !startBox || !(startBox.width > 0 && startBox.height > 0)) return {};
        // Project the corner movement onto the original diagonal: one uniform
        // scale, stable for tall/narrow frames and independent of UI density.
        const { width, height } = startBox;
        const ratio = Math.max(0.1, 1 + (delta.x / scale(host, "x") * width + delta.y / scale(host, "y") * height) /
            (width * width + height * height));
        return { [field.key]: Q.presentation.normalize(field.key, Number(startValues[field.key]) * ratio) };
    }
    function dragValues(element, target, startValues, delta) {
        const parent = target.GetParent();
        const values = {};
        for (const field of element.fields) {
            if (!field.axis) continue;
            values[field.key] = Q.presentation.normalize(field.key,
                Number(startValues[field.key]) + delta[field.axis] / scale(parent, field.axis) * (field.direction || 1));
        }
        return values;
    }
    Q.ui.customizeGeometry = { scale, absolute, box, frameBox, dragValues, resizeValues, isShown };
})();

// Shared presentation capabilities. These bind existing settings to verified
// HUD owners; gameplay content and feature rendering remain in the manifests.
(() => {
    "use strict";
    const Q = globalThis.QOL;
    const core = [{ className: "HudCore" }];
    const lower = [...core, "StatsAndModsContainer", "LowerLeft"];
    const abilities = [...core, "AbilitiesContainer"];
    const crosshair = [...core, "gameplay_hud", "gameplay_hud_alive", "crosshair"];
    const geometry = (prefix, scale = false) => [
        { key: prefix + "X_OFFSET", label: "Horizontal Offset", axis: "x" },
        { key: prefix + "Y_OFFSET", label: "Vertical Offset", axis: "y", direction: -1 },
        ...(scale ? [{ key: prefix + "SCALE", label: "Scale", resize: true }] : [])
    ];
    const opacity = prefix => ({ key: prefix + "OPACITY", label: "Opacity" });
    const toggle = key => ({ key, label: "Enable", type: "toggle" });
    const color = key => ({ key, label: "Color", type: "color" });
    const elements = [];
    const nativeElements = [
        { id: "souls", name: "Souls", path: [...lower, "gold_and_ap_container"], fields: [toggle("HUD_SOULS_ENABLED"), ...geometry("SOULS_"), opacity("SOULS_")] },
        { id: "items", name: "Items", path: [...lower, "ModsContainer"], fields: [toggle("HUD_ITEMS_ENABLED"), ...geometry("ITEMS_"), opacity("ITEMS_"), color("ITEMS_WASH_COLOR")] },
        { id: "topBar", name: "Top Bar", path: [...core, "TopBar"], fields: [toggle("HUD_TOP_BAR_ENABLED"), ...geometry("TOP_BAR_", true), opacity("TOP_BAR_")] },
        { id: "bottomBar", name: "Bottom Bar", path: [...abilities, "hud_signature"], fields: [toggle("HUD_BOTTOM_BAR_ENABLED"), ...geometry("BOTTOM_BAR_", true), opacity("BOTTOM_BAR_"), { key: "BOTTOM_BAR_WASH_COLOR", label: "Color", type: "palette" }] },
        { id: "activeItems", name: "Active Items", path: [...abilities, "ActiveAbilitiesMenu"], fields: [...geometry("ACTIVE_ITEMS_", true)] },
        { id: "abilityPoints", name: "Ability Points (AP)", path: [...abilities, "APContainer"], frame: true,
            note: "Color is shared with Bottom Bar. Position follows the native parent.",
            fields: [{ key: "BOTTOM_BAR_WASH_COLOR", label: "Color", type: "palette" }] },
        { id: "ammo", name: "Ammo", path: [...crosshair, "gun", "gun_data", "ammo_panel"], fields: [
            toggle("ENABLE_AMMO_STATUS"), { key: "ENABLE_HIDE_MAGAZINE", label: "Hide Magazine", type: "toggle" }, { key: "ENABLE_HIDE_AMMO_ALL", label: "Hide Ammo", type: "toggle" },
            ...geometry("AMMO_PANEL_"), { key: "AMMO_PANEL_SCALE", label: "Current Ammo", hidden: true }, { key: "AMMO_CURRENT_SCALE", label: "Current Ammo" },
            { key: "AMMO_TOTAL_SCALE", label: "Total Ammo" }, { key: "AMMO_CLIP_ANGLE", label: "Rotation" }, color("AMMO_TEXT_COLOR")
        ] },
        { id: "stamina", name: "Stamina", path: [...crosshair, "dash", "charges_container"], frame: true, fields: [
            { key: "STAMINA_SCALE", label: "Scale", resize: true }, { key: "STAMINA_CHARGE_ANGLE", label: "Rotation" }, color("STAMINA_CHARGE_COLOR")
        ] },
        { id: "playerStats", name: "Player Stats", path: [...lower, "hudPlayerStats"], fallbackPath: [...core, "hudActivePlayerStats"],
            resolve(hud) { return chooseStatsPanel(findPath(hud, [...lower, "hudPlayerStats"]), findPath(hud, [...core, "hudActivePlayerStats"])); }, fields: [
            toggle("ENABLE_STATS_POSITION"), ...geometry("STATS_POSITION_"),
            { key: "STATS_POSITION_SIDE", label: "Side", type: "side" },
            { key: "STATS_POSITION_HIDE_NORMAL", label: "Hide (Normal)", type: "toggle" },
            { key: "STATS_POSITION_HIDE_SCOREBOARD", label: "Hide (Scoreboard)", type: "toggle" }
        ] }
    ];
    const fieldMap = new Map();
    const wireFields = new Map(QOL_COMPACT_SCHEMA_REGISTRY[QOL_SCHEMA_SEMVER].schema.map(field => [field.key, field]));
    function register(additions) {
        for (const element of additions) {
            if (elements.some(existing => existing.id === element.id)) throw new Error("Duplicate customization owner: " + element.id);
            for (const field of element.fields) {
                if (!wireFields.has(field.key) || !(field.key in QOL_DEFAULT_CONFIG)) throw new Error("Unknown customization setting: " + field.key);
                fieldMap.set(field.key, field);
            }
            elements.push(element);
        }
    }
    for (const [id, prefix] of [["souls", "SOULS_"], ["items", "ITEMS_"], ["playerStats", "STATS_POSITION_"], ["ammo", "AMMO_HUD_"], ["abilityPoints", "AP_"]]) {
        const element = nativeElements.find(item => item.id === id);
        element.fields.push({ key: prefix + "SCALE", label: "Scale", resize: true });
        element.scaleKey = prefix + "SCALE";
    }
    nativeElements.find(item => item.id === "stamina").scaleKey = "STAMINA_SCALE";
    register(nativeElements);

    function normalize(key, value) {
        const field = fieldMap.get(key);
        const wire = wireFields.get(key);
        if (!field || !wire || typeof value !== "number" || !Number.isFinite(value)) return null;
        if (field.type === "color" || field.type === "palette") {
            return Number.isInteger(value) && ((value >= 0 && value <= 29) || (QOL_UTILS.SupportsCustomColor(key) && QOL_UTILS.IsCustomColor(value))) ? value : null;
        }
        const bounded = Math.max(wire.min, Math.min(wire.max, value));
        return Number(Math.max(wire.min, Math.min(wire.max, wire.min + Math.round((bounded - wire.min) / wire.step) * wire.step)).toFixed(6));
    }
    function findPath(hud, path) {
        let panel = hud;
        for (const segment of path) {
            panel = typeof segment === "string" ? Q.core.panel.findChild(panel, segment)
                : QOL_UTILS.FindFirstPanelByClass(panel, segment.className);
            if (!Q.core.panel.isAlive(panel)) return null;
        }
        return panel;
    }
    function resolve(element, hud, config) {
        if (!element.path || element.context) return null;
        if (element.resolve) return element.resolve(hud, config);
        const direct = findPath(hud, element.path);
        if (direct) return direct;
        // Scope compatibility discovery to the nearest named owner. Generic
        // leaves such as MainPanel must never match another screen's subtree.
        const path = element.path;
        const leaf = path[path.length - 1];
        for (let index = path.length - 2; index >= 0; index--) {
            if (typeof path[index] !== "string") continue;
            const owner = Q.core.panel.findTraverse(hud, path[index]);
            if (owner) {
                const candidate = Q.core.panel.findTraverse(owner, leaf);
                if (candidate) return candidate;
                break;
            }
        }
        return (path.length === 1 ? Q.core.panel.findTraverse(hud, leaf) : null) ||
            (element.fallbackPath ? findPath(hud, element.fallbackPath) : null);
    }
    const canDrag = element => element.fields.some(field => field.axis) && element.fields.filter(field => field.axis).every(field => !field.unit || field.unit === "px");
    function chooseStatsPanel(legacy, active) {
        const hasContent = panel => ["HudStatBlock", "StatList"].some(id => {
            const content = Q.core.panel.findChild(panel, id);
            return content && content.visible !== false && content.style.visibility !== "collapse" &&
                content.actuallayoutwidth > 0 && content.actuallayoutheight > 0;
        });
        // Native compact stats now live in the active owner. The coexisting
        // legacy owner may have no layout while its HudStatBlock is collapsed.
        return hasContent(legacy) ? legacy : hasContent(active) ? active : legacy || active;
    }
    const resizeField = element => element.fields.find(field => field.resize) || null;
    const scaleTarget = (element, target) => element.id === "playerStats"
        ? Q.core.panel.findChild(target, "HudStatBlock") || target : target;
    const hasFrame = element => element.frame !== false && (element.frame === true || canDrag(element) || !!resizeField(element));
    const field = (key, label, type, extra = {}) => Object.assign({ key, label, ...(type ? { type } : {}) }, extra);
    Q.presentation = { elements, fieldMap, wireFields, normalize, resolve, findPath, register, canDrag, resizeField, hasFrame, chooseStatsPanel, scaleTarget,
        paths: { core, lower, abilities, crosshair, gameplay: [...core, "gameplay_hud"] },
        fields: { geometry, opacity, toggle, color, field } };
})();

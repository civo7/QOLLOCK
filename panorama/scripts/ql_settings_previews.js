// ql_settings_previews.js — Settings preview panels (minimap size, zoom, zipboost,
// crosshair stats, unsecured souls, compass, speed, keyboard overlay, item cooldown,
// ammo, reload cooldown, unit target, damage report, shop, unsecured plus)
// OWNS: Complete settings preview trees and cancelable, context-bound hide deadlines.
// DOES NOT OWN: Gameplay surfaces, persistent defaults or settings publication.
(function() {
    'use strict';

    const Utils = QOL.utils;
    var WarnLog = QOL_UTILS.WarnLog;

    // ── Helper functions for preview panel DOM, context & styles ──


    function FindRootPanel() {
        var root = $.GetContextPanel ? $.GetContextPanel() : null;
        while (root && root.GetParent && root.GetParent()) {
            root = root.GetParent();
        }
        return root;
    }

    function IsSettingsWindowVisible() {
        if (typeof globalThis.IsSettingsWindowVisible === "function") {
            return globalThis.IsSettingsWindowVisible();
        }
        var win = null;
        try {
            var ctx = $.GetContextPanel ? $.GetContextPanel() : null;
            win = ctx ? ctx.FindChildTraverse("SettingsWindow") : null;
        } catch (_) {}
        return !!(win && win.BHasClass && win.BHasClass("Visible"));
    }

    var SetPanelOpacitySafe = (Utils && Utils.SetPanelOpacitySafe) ? Utils.SetPanelOpacitySafe : function(panel, opacityValue, fallbackValue) {
        if (panel && panel.style) {
            try {
                var v = Number(opacityValue);
                if (!isFinite(v)) v = Number(fallbackValue);
                if (!isFinite(v)) v = 1.0;
                panel.style.opacity = v.toFixed(2);
            } catch(e) {
                WarnLog("settings", "op failed: " + (e && e.message ? e.message : String(e || "")));
            }
        }
    };

    function GetPanelRectRelativeToContext(panel) {
        if (!panel || !panel.IsValid || !panel.IsValid()) return null;
        var context = $.GetContextPanel ? $.GetContextPanel() : null;
        var root = FindRootPanel();
        if (!context || !root) return null;
        var getX = (typeof globalThis.GetPanelXOffsetWithinAncestor === "function")
            ? globalThis.GetPanelXOffsetWithinAncestor
            : (QOL.ui && QOL.ui.drag && QOL.ui.drag.getPanelXOffsetWithinAncestor);
        var getY = (typeof globalThis.GetPanelYOffsetWithinAncestor === "function")
            ? globalThis.GetPanelYOffsetWithinAncestor
            : (QOL.ui && QOL.ui.drag && QOL.ui.drag.getPanelYOffsetWithinAncestor);
        if (!getX || !getY) return null;
        var panelX = getX(panel, root);
        var panelY = getY(panel, root);
        var contextX = getX(context, root);
        var contextY = getY(context, root);
        if (!isFinite(panelX) || !isFinite(panelY) || !isFinite(contextX) || !isFinite(contextY)) return null;
        var width = Number(panel.actuallayoutwidth);
        var height = Number(panel.actuallayoutheight);
        if (!isFinite(width) || width < 0) width = 0;
        if (!isFinite(height) || height < 0) height = 0;
        return {
            x: Math.round(panelX - contextX),
            y: Math.round(panelY - contextY),
            width: Math.round(width),
            height: Math.round(height)
        };
    }

    function LocalizeSettingsText(text, force) {
        if (typeof globalThis.LocalizeSettingsText === "function") {
            return globalThis.LocalizeSettingsText(text, force);
        }
        return String(text || "");
    }

    function SaveAndSync() {
        if (typeof globalThis.SaveAndSync === "function") {
            globalThis.SaveAndSync();
        }
    }

    // ── Preview globals ──

var gMinimapSizePreviewPanel = null;
var gMinimapSizePreviewCircle = null;
var gMinimapSizePreviewLabel = null;
var gMinimapPreviewBaseRight = 30;
var gMinimapPreviewBaseBottom = 30;

var gZoomMinimapPreviewPanel = null;
var gZoomMinimapPreviewCircle = null;
var gZoomMinimapPreviewLabel = null;
var gZoomPreviewBaseX = 0;
var gZoomPreviewBaseY = 0;
var gZoomPreviewMode = "ALT";
var gZipBoostPreviewPanel = null;
var gZipBoostPreviewBox = null;
var gZipBoostPreviewLabel = null;
var gZipBoostPreviewBaseX = -520;
var gZipBoostPreviewBaseY = 20;
var gCrosshairStatsPreviewPanel = null;
var gCrosshairStatsPreviewBox = null;
var gCrosshairStatsPreviewLabel = null;
var gCrosshairStatsPreviewBaseX = 130;
var gCrosshairStatsPreviewBaseY = 0;
var gUnsecuredSoulsPreviewPanel = null;
var gUnsecuredSoulsPreviewLabel = null;
var gUnsecuredSoulsPreviewBaseX = -520;
var gUnsecuredSoulsPreviewBaseY = 110;
var gCompassPreviewPanel = null;
var gCompassPreviewBox = null;
var gCompassPreviewLabel = null;
var gCompassPreviewBaseX = 0;
var gCompassPreviewBaseY = 120;
// Speed has its own independent preview panel (mirrors the in-game QOLSpeedRoot,
// a sibling of the compass root — not a child of it).
var gSpeedPreviewPanel = null;
var gSpeedPreviewLabel = null;
var gKeyboardOverlayPreviewPanel = null;
var gKeyboardOverlayPreviewBox = null;
var gKeyboardOverlayPreviewLabel = null;
var gKeyboardOverlayPreviewBaseX = 150;
var gKeyboardOverlayPreviewBaseY = 300;
var gItemCooldownPreviewPanel = null;
var gItemCooldownPreviewRow = null;
var gItemCooldownPreviewIcon = null;
var gItemCooldownPreviewLabel = null;
var gAmmoPreviewPanel = null;
var gAmmoPreviewCurrentLabel = null;
var gAmmoPreviewTotalLabel = null;
var gReloadCooldownPreviewPanel = null;
var gReloadCooldownPreviewRing = null;
var gReloadCooldownPreviewLabel = null;
var gUnitTargetPreviewPanel = null;
var gUnitTargetPreviewImage = null;
var gUnitTargetPreviewBinding = null;
var gDamageReportPreviewPanel = null;
var gDamageReportPreviewBox = null;
var gDamageReportPreviewLabel = null;
var gShopPreviewPanel = null;
var gShopPreviewBox = null;
var gShopPreviewLabel = null;
var gUnsecuredPlusPreviewPanel = null;
var gUnsecuredPlusPreviewIcon = null;
var gUnsecuredPlusPreviewText = null;
var gUnsecuredPlusPreviewValue = null;

    // ── Preview helpers ──

function SetPreviewPanelPosition(panel, x, y) {
    if (!panel || !panel.style) return;
    var px = Math.round(Number(x) || 0);
    var py = Math.round(Number(y) || 0);
    panel.style.marginLeft = String(px) + "px";
    panel.style.marginTop = String(py) + "px";
}

function GetPreviewHostScale(host) {
    var scaleX = 1.0;
    var scaleY = 1.0;
    if (!host) return { x: scaleX, y: scaleY };

    if (typeof host.actualuiscale_x === "number" && isFinite(host.actualuiscale_x) && host.actualuiscale_x > 0) {
        scaleX = host.actualuiscale_x;
    } else {
        var actW = Number(host.actuallayoutwidth);
        var desW = Number(host.desiredlayoutwidth);
        if (isFinite(actW) && actW > 0 && isFinite(desW) && desW > 0) {
            scaleX = actW / desW;
        }
    }

    if (typeof host.actualuiscale_y === "number" && isFinite(host.actualuiscale_y) && host.actualuiscale_y > 0) {
        scaleY = host.actualuiscale_y;
    } else {
        var actH = Number(host.actuallayoutheight);
        var desH = Number(host.desiredlayoutheight);
        if (isFinite(actH) && actH > 0 && isFinite(desH) && desH > 0) {
            scaleY = actH / desH;
        }
    }
    return { x: scaleX, y: scaleY };
}

function GetPanelOffsetInAncestorSafe(panel, ancestor, axis) {
    if (!panel || !ancestor) return 0;
    if (axis === "x" && typeof globalThis.GetPanelXOffsetWithinAncestor === "function") {
        return Number(globalThis.GetPanelXOffsetWithinAncestor(panel, ancestor)) || 0;
    }
    if (axis === "y" && typeof globalThis.GetPanelYOffsetWithinAncestor === "function") {
        return Number(globalThis.GetPanelYOffsetWithinAncestor(panel, ancestor)) || 0;
    }
    var total = 0;
    var cur = panel;
    var guard = 0;
    while (cur && cur !== ancestor && guard < 32) {
        var off = (axis === "y") ? Number(cur.actualyoffset || 0) : Number(cur.actualxoffset || 0);
        if (isFinite(off)) total += off;
        cur = (cur.GetParent && typeof cur.GetParent === "function") ? cur.GetParent() : null;
        guard++;
    }
    return total;
}

function GetMinimapPreviewAnchorParent() {
    var contextRoot = $.GetContextPanel();
    return contextRoot || null;
}

function GetMinimapPreviewRightInsetPx() {
    var contextRoot = $.GetContextPanel();
    var searchRoot = FindRootPanel() || contextRoot;
    if (!contextRoot || !searchRoot || !searchRoot.FindChildTraverse) return 0;

    var minimapPersp = searchRoot.FindChildTraverse("minimap_persp");
    if (!minimapPersp || !minimapPersp.GetParent) return 0;
    var minimapParent = minimapPersp.GetParent();
    if (!minimapParent) return 0;

    var hostScale = GetPreviewHostScale(contextRoot);
    var scaleX = (hostScale && hostScale.x > 0) ? hostScale.x : 1.0;

    var insetByOffset = Number(minimapParent.actualxoffset);
    if (isFinite(insetByOffset) && insetByOffset > 0) {
        return Math.round(insetByOffset / scaleX);
    }

    var rootWidth = Number(contextRoot.actuallayoutwidth);
    var parentWidth = Number(minimapParent.actuallayoutwidth);
    if (!isFinite(rootWidth) || !isFinite(parentWidth) || rootWidth <= parentWidth || parentWidth <= 0) {
        return 0;
    }
    return Math.round(((rootWidth - parentWidth) * 0.5) / scaleX);
}


    // ── Preview panel constructors + config detection ──


    const P = QOL.core.panel;
    const previewTree = P.createOwnedTree();
    const previewPanels = new Map();
    const hideDeadlines = new Map();
    let previewContext = null;
    const previewParts = {
        MinimapSize: [["circle","Panel","Circle"],["label","Label","Label"]],
        ZoomMinimap: [["circle","Panel","Circle"],["label","Label","Label"]],
        ZipBoost: [["box","Panel","Box"],["label","Label","Label","box"]],
        CrosshairStats: [["box","Panel","Box"],["label","Label","Label","box"]],
        UnsecuredSouls: [["label","Label","Label"]],
        Compass: [["box","Panel","Box"],["label","Label","Label"]],
        Speed: [["label","Label","Label"]],
        KeyboardOverlay: [["box","Panel","Box"],["sample","Panel","Sample","box"],["label","Label","Label","box"]],
        ItemCooldown: [["row","Panel","Row"],["icon","Panel","Icon","row"],["modContainer","Panel","ModContainer","icon"],["bg","Panel","Bg","modContainer"],["image","Panel","Image","modContainer"],["mask","Panel","Mask","modContainer"],["label","Label","Label","icon"]],
        Ammo: [["currentLabel","Label","Current"],["totalLabel","Label","Total"]],
        ReloadCooldown: [["ring","Panel","Ring"],["label","Label","Label","ring"]],
        UnitTarget: [["image","Panel","Image"],["binding","Label","Binding"]],
        DamageReport: [["box","Panel","Box"],["label","Label","Label","box"]],
        Shop: [["box","Panel","Box"],["label","Label","Label","box"]],
        UnsecuredPlus: [["icon","Panel","Icon"],["text","Label","Text"],["value","Label","Value"]],
    };

    function cancelPreviewHide(kind) {
        const deadline = hideDeadlines.get(kind);
        hideDeadlines.delete(kind); // Invalidate before native cancellation, including handle zero.
        if (deadline && deadline.handle !== null) {
            try { $.CancelScheduled(deadline.handle); } catch (_) {}
        }
    }
    function hidePreviews() {
        for (const kind of hideDeadlines.keys()) cancelPreviewHide(kind);
        for (const panel of previewPanels.values()) P.setClass(panel, "Visible", false);
        previewTree.clear();
        previewPanels.clear();
    }
    function schedulePreviewHide(kind, delaySec) {
        cancelPreviewHide(kind);
        const panel = previewPanels.get(kind), context = previewContext;
        if (!P.isAlive(panel) || !P.isAlive(context)) return;
        const deadline = { handle: null };
        hideDeadlines.set(kind, deadline);
        deadline.handle = $.Schedule(delaySec, () => {
            if (hideDeadlines.get(kind) !== deadline) return;
            hideDeadlines.delete(kind);
            if (!P.isAlive(context) || $.GetContextPanel() !== context) {
                if (previewContext === context) { hidePreviews(); previewContext = null; }
                return;
            }
            if (previewPanels.get(kind) === panel) {
                P.setClass(panel, "Visible", false);
                previewTree.remove(kind + "Preview");
                previewPanels.delete(kind);
            }
        });
    }
    function buildPreview(kind) {
        const context = $.GetContextPanel();
        if (context !== previewContext) { hidePreviews(); previewContext = context; }
        if (!P.isAlive(context)) return {};
        cancelPreviewHide(kind);
        previewTree.sweep();
        const id = kind + "Preview", nodes = { ready: true };
        const add = (name, type, suffix, parent = "panel", classes = [], text) => {
            const panel = previewTree.child(name === "panel" ? context : nodes[parent], type, id + suffix);
            nodes[name] = panel;
            if (!P.isAlive(panel)) { nodes.ready = false; return; }
            for (const className of classes) {
                P.setClass(panel, className, true);
                if (!panel.BHasClass(className)) nodes.ready = false;
            }
            if (text !== undefined && panel.text !== text) panel.text = text;
        };
        try {
            add("panel", "Panel", "");
            if (!P.isAlive(nodes.panel)) return nodes;
            previewPanels.set(kind, nodes.panel);
            for (const part of previewParts[kind]) add(...part);
            if (kind === "CrosshairStats") {
                for (const [name, icon, text, mood] of [["fireRate", "FireRate", "−15%", "isDebuff"], ["moveSpeed", "MoveSpeed", "−1.8 m/s", "isDebuff"], ["bulletResist", "ResistBullet", "+20%", "isBuff"]]) {
                    add("statRow", "Panel", "Row_" + name, "box", ["QOLCrosshairStatRow", mood]);
                    add("statIcon", "Panel", "Icon_" + name, "statRow", ["QOLCrosshairStatIcon", "statIcon", "PropertiesIcon", icon]);
                    add("statValue", "Label", "Value_" + name, "statRow", ["QOLCrosshairStatValue"], text);
                }
            }
            if (kind === "KeyboardOverlay") {
                P.setClass(nodes.sample, "KeyboardOverlayPreviewRow", true);
                if (!nodes.sample?.BHasClass("KeyboardOverlayPreviewRow")) nodes.ready = false;
                for (let index = 1; index <= 5; index++) add("key", "Panel", "Key" + index, "sample", ["KeyboardOverlayPreviewKey", ...(index === 1 || index === 4 ? ["Wide"] : index === 5 ? ["Spacer"] : [])]);
            }
            if (kind === "UnitTarget" && nodes.binding) nodes.binding.text = "Q";
            if (kind === "UnsecuredPlus" && nodes.text) nodes.text.text = LocalizeSettingsText("UNSECURED", true);
        } catch (_) { nodes.ready = false; }
        if (!nodes.ready) P.setClass(nodes.panel, "Visible", false);
        return nodes;
    }

function EnsureMinimapSizePreviewPanel() {
    const nodes = buildPreview("MinimapSize");
    gMinimapSizePreviewPanel = nodes.panel || null;
    gMinimapSizePreviewCircle = nodes.circle || null;
    gMinimapSizePreviewLabel = nodes.label || null;
    return nodes.ready ? nodes.panel : null;
}

function EnsureZoomMinimapPreviewPanel() {
    const nodes = buildPreview("ZoomMinimap");
    gZoomMinimapPreviewPanel = nodes.panel || null;
    gZoomMinimapPreviewCircle = nodes.circle || null;
    gZoomMinimapPreviewLabel = nodes.label || null;
    return nodes.ready ? nodes.panel : null;
}

function EnsureZipBoostPreviewPanel() {
    const nodes = buildPreview("ZipBoost");
    gZipBoostPreviewPanel = nodes.panel || null;
    gZipBoostPreviewBox = nodes.box || null;
    gZipBoostPreviewLabel = nodes.label || null;
    return nodes.ready ? nodes.panel : null;
}

function EnsureCrosshairStatsPreviewPanel() {
    const nodes = buildPreview("CrosshairStats");
    gCrosshairStatsPreviewPanel = nodes.panel || null;
    gCrosshairStatsPreviewBox = nodes.box || null;
    gCrosshairStatsPreviewLabel = nodes.label || null;
    return nodes.ready ? nodes.panel : null;
}

function EnsureUnsecuredSoulsPreviewPanel() {
    const nodes = buildPreview("UnsecuredSouls");
    gUnsecuredSoulsPreviewPanel = nodes.panel || null;
    gUnsecuredSoulsPreviewLabel = nodes.label || null;
    return nodes.ready ? nodes.panel : null;
}

function EnsureCompassPreviewPanel() {
    const nodes = buildPreview("Compass");
    gCompassPreviewPanel = nodes.panel || null;
    gCompassPreviewBox = nodes.box || null;
    gCompassPreviewLabel = nodes.label || null;
    return nodes.ready ? nodes.panel : null;
}

function EnsureSpeedPreviewPanel() {
    const nodes = buildPreview("Speed");
    gSpeedPreviewPanel = nodes.panel || null;
    gSpeedPreviewLabel = nodes.label || null;
    return nodes.ready ? nodes.panel : null;
}

function EnsureKeyboardOverlayPreviewPanel() {
    const nodes = buildPreview("KeyboardOverlay");
    gKeyboardOverlayPreviewPanel = nodes.panel || null;
    gKeyboardOverlayPreviewBox = nodes.box || null;
    gKeyboardOverlayPreviewLabel = nodes.label || null;
    return nodes.ready ? nodes.panel : null;
}

function EnsureItemCooldownPreviewPanel() {
    const nodes = buildPreview("ItemCooldown");
    gItemCooldownPreviewPanel = nodes.panel || null;
    gItemCooldownPreviewRow = nodes.row || null;
    gItemCooldownPreviewIcon = nodes.icon || null;
    gItemCooldownPreviewLabel = nodes.label || null;
    return nodes.ready ? nodes.panel : null;
}

function EnsureAmmoPreviewPanel() {
    const nodes = buildPreview("Ammo");
    gAmmoPreviewPanel = nodes.panel || null;
    gAmmoPreviewCurrentLabel = nodes.currentLabel || null;
    gAmmoPreviewTotalLabel = nodes.totalLabel || null;
    return nodes.ready ? nodes.panel : null;
}

function EnsureReloadCooldownPreviewPanel() {
    const nodes = buildPreview("ReloadCooldown");
    gReloadCooldownPreviewPanel = nodes.panel || null;
    gReloadCooldownPreviewRing = nodes.ring || null;
    gReloadCooldownPreviewLabel = nodes.label || null;
    return nodes.ready ? nodes.panel : null;
}

function EnsureUnitTargetPreviewPanel() {
    const nodes = buildPreview("UnitTarget");
    gUnitTargetPreviewPanel = nodes.panel || null;
    gUnitTargetPreviewImage = nodes.image || null;
    gUnitTargetPreviewBinding = nodes.binding || null;
    return nodes.ready ? nodes.panel : null;
}

function EnsureDamageReportPreviewPanel() {
    const nodes = buildPreview("DamageReport");
    gDamageReportPreviewPanel = nodes.panel || null;
    gDamageReportPreviewBox = nodes.box || null;
    gDamageReportPreviewLabel = nodes.label || null;
    return nodes.ready ? nodes.panel : null;
}

function EnsureShopPreviewPanel() {
    const nodes = buildPreview("Shop");
    gShopPreviewPanel = nodes.panel || null;
    gShopPreviewBox = nodes.box || null;
    gShopPreviewLabel = nodes.label || null;
    return nodes.ready ? nodes.panel : null;
}

function EnsureUnsecuredPlusPreviewPanel() {
    const nodes = buildPreview("UnsecuredPlus");
    gUnsecuredPlusPreviewPanel = nodes.panel || null;
    gUnsecuredPlusPreviewIcon = nodes.icon || null;
    gUnsecuredPlusPreviewText = nodes.text || null;
    gUnsecuredPlusPreviewValue = nodes.value || null;
    return nodes.ready ? nodes.panel : null;
}

function GetMinimapPreviewDiameter(sizePx) {
    return Math.round(Math.max(50, Math.min(1200, Number(sizePx) || 0)));
}

function IsMinimapPreviewConfig(configId) {
    return configId === "MINIMAP_SMALL_SIZE" ||
        configId === "MINIMAP_X_OFFSET" ||
        configId === "MINIMAP_Y_OFFSET" ||
        configId === "MINIMAP_BASE_OPACITY" ||
        configId === "MINIMAL_MINIMAP_OPACITY";
}

function IsZoomMinimapPreviewConfig(configId) {
    return configId === "MINIMAP_LARGE_SIZE" ||
        configId === "ZOOM_X_OFFSET" ||
        configId === "ZOOM_Y_OFFSET" ||
        configId === "MINIMAP_LARGE_SIZE_ALT" ||
        configId === "ZOOM_X_OFFSET_ALT" ||
        configId === "ZOOM_Y_OFFSET_ALT" ||
        configId === "MINIMAP_LARGE_SIZE_TAB" ||
        configId === "ZOOM_X_OFFSET_TAB" ||
        configId === "ZOOM_Y_OFFSET_TAB" ||
        configId === "ALT_ZOOM_OPACITY" ||
        configId === "TAB_ZOOM_OPACITY";
}

function GetZoomPreviewModeForConfigId(configId) {
    if (configId === "TAB_ZOOM_OPACITY" ||
        configId === "MINIMAP_LARGE_SIZE_TAB" ||
        configId === "ZOOM_X_OFFSET_TAB" ||
        configId === "ZOOM_Y_OFFSET_TAB") {
        return "TAB";
    }
    return "ALT";
}

function GetZoomConfigKeysForMode(mode) {
    if (mode === "TAB") {
        return {
            size: "MINIMAP_LARGE_SIZE_TAB",
            x: "ZOOM_X_OFFSET_TAB",
            y: "ZOOM_Y_OFFSET_TAB",
            opacity: "TAB_ZOOM_OPACITY"
        };
    }
    return {
        size: "MINIMAP_LARGE_SIZE_ALT",
        x: "ZOOM_X_OFFSET_ALT",
        y: "ZOOM_Y_OFFSET_ALT",
        opacity: "ALT_ZOOM_OPACITY"
    };
}


function ResolveCustomAnnouncerMetaField(source, keyList) {
    if (!source || !keyList || !keyList.length) return "";
    for (var i = 0; i < keyList.length; i++) {
        var key = String(keyList[i] || "");
        if (!key) continue;
        if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
        var value = String(source[key] == null ? "" : source[key]).trim();
        if (value.length > 0) return value;
    }
    return "";
}

function ResolveCustomAnnouncerSlotScriptMetadata(slotIndex) {
    var safeIndex = Math.max(1, Math.min(5, Math.round(Number(slotIndex) || 1)));
    var source = null;
    var globalKey = "QOL_CUSTOM_ANNOUNCER_SLOT" + String(safeIndex) + "_META";
    var registryKey = String(safeIndex);

    try {
        if (typeof globalThis === "object" && globalThis) {
            var registry = globalThis.QOL_CUSTOM_ANNOUNCER_PACK_SLOTS;
            if (registry && typeof registry === "object") {
                if (Object.prototype.hasOwnProperty.call(registry, registryKey)) {
                    source = registry[registryKey];
                } else if (Object.prototype.hasOwnProperty.call(registry, safeIndex)) {
                    source = registry[safeIndex];
                }
            }
            if (!source) {
                source = globalThis[globalKey];
            }
        }
    } catch (e0) {
        source = null;
    }

    return {
        name: ResolveCustomAnnouncerMetaField(source, ["name", "Name", "NAME"]),
        author: ResolveCustomAnnouncerMetaField(source, ["author", "Author", "AUTHOR"]),
        voiceActor: ResolveCustomAnnouncerMetaField(source, ["voiceActor", "voice_actor", "VoiceActor", "Voice_Actor", "voice actor", "Voice Actor", "VOICE_ACTOR"])
    };
}



function IsZipBoostPreviewConfig(configId) {
    return configId === "ENABLE_ZIP_BOOST" ||
        configId === "ZIP_BOOST_X_OFFSET" ||
        configId === "ZIP_BOOST_Y_OFFSET" ||
        configId === "ZIP_BOOST_SCALE";
}

function IsCrosshairStatsPreviewConfig(configId) {
    return configId === "ENABLE_CROSSHAIR_STATS" ||
        configId === "CROSSHAIR_STATS_X_OFFSET" ||
        configId === "CROSSHAIR_STATS_Y_OFFSET" ||
        configId === "CROSSHAIR_STATS_SCALE" ||
        configId === "CROSSHAIR_STATS_OPACITY";
}

function IsUnsecuredSoulsPreviewConfig(configId) {
    return configId === "ENABLE_UNSECURED_SOUL_TIMER" ||
        configId === "UNSECURED_SOUL_TIMER_X_OFFSET" ||
        configId === "UNSECURED_SOUL_TIMER_Y_OFFSET" ||
        configId === "UNSECURED_SOUL_TIMER_SCALE";
}

function IsCompassPreviewConfig(configId) {
    return configId === "ENABLE_COMPASS" ||
        configId === "COMPASS_SCALE" ||
        configId === "COMPASS_X_OFFSET" ||
        configId === "COMPASS_Y_OFFSET" ||
        configId === "COMPASS_STRETCH_X" ||
        configId === "COMPASS_STRETCH_Y";
}

function IsSpeedPreviewConfig(configId) {
    return configId === "ENABLE_COMPASS_SPEED" ||
        configId === "COMPASS_SPEED_X_OFFSET" ||
        configId === "COMPASS_SPEED_Y_OFFSET";
}

function IsKeyboardOverlayPreviewConfig(configId) {
    return configId === "ENABLE_KEYBOARD_OVERLAY" ||
        configId === "KEYBOARD_OVERLAY_SCALE" ||
        configId === "KEYBOARD_OVERLAY_X_OFFSET" ||
        configId === "KEYBOARD_OVERLAY_Y_OFFSET" ||
        configId === "ENABLE_FULL_KEYBOARD_LAYOUT";
}

function IsItemCooldownPreviewConfig(configId) {
    return configId === "ENABLE_PASSIVE_COOLDOWN" ||
        configId === "ENABLE_OLD_ITEM_COOLDOWNS" ||
        configId === "PASSIVE_COOLDOWN_SIZE" ||
        configId === "PASSIVE_COOLDOWN_X" ||
        configId === "PASSIVE_COOLDOWN_Y" ||
        configId === "PASSIVE_COOLDOWN_OPACITY";
}

function IsAdvancedItemCooldownModeEnabled() {
    return Number(MOD_CONFIG.ENABLE_OLD_ITEM_COOLDOWNS) !== 1;
}

const ENABLE_AMMO_PREVIEW = false;
function IsAmmoPreviewConfig(configId) {
    if (!ENABLE_AMMO_PREVIEW) return false;
    return configId === "AMMO_CURRENT_SCALE" ||
        configId === "AMMO_TOTAL_SCALE" ||
        configId === "AMMO_PANEL_X_OFFSET" ||
        configId === "AMMO_PANEL_Y_OFFSET";
}

function IsReloadCooldownPreviewConfig(configId) {
    return configId === "RELOAD_COOLDOWN_SIZE" ||
        configId === "RELOAD_COOLDOWN_OPACITY" ||
        configId === "RELOAD_COOLDOWN_X_OFFSET" ||
        configId === "RELOAD_COOLDOWN_Y_OFFSET";
}

function IsUnitTargetPreviewConfig(configId) {
    return configId === "UNIT_TARGET_SIZE" ||
        configId === "UNIT_TARGET_OPACITY" ||
        configId === "UNIT_TARGET_HINT_SIZE" ||
        configId === "ENABLE_RED_DIAMOND" ||
        configId === "ENABLE_IMPROVED_HINT";
}

function IsDamageReportPreviewConfig(configId) {
    return configId === "DAMAGE_REPORT_X_OFFSET" ||
        configId === "DAMAGE_REPORT_Y_OFFSET" ||
        configId === "DISABLE_DAMAGE_REPORT";
}

function IsShopPreviewConfig(configId) {
    return configId === "SHOP_OFFSET_X" ||
        configId === "SHOP_OFFSET_Y" ||
        configId === "SHOP_OPACITY" ||
        configId === "SHOP_SCALE";
}

function IsUnsecuredPlusPreviewConfig(configId) {
    return configId === "ENABLE_BETTER_UNSECURED" ||
        configId === "UNSECURED_SOULS_HUD_SCALE" ||
        configId === "UNSECURED_SOULS_HUD_X_OFFSET" ||
        configId === "UNSECURED_SOULS_HUD_Y_OFFSET" ||
        configId === "ENABLE_BETTER_UNSECURED_SHOW_ICON" ||
        configId === "ENABLE_BETTER_UNSECURED_SHOW_TEXT";
}

    // ── Preview hide/show functions ──

function HideMinimapSizePreview() { hidePreviews(); }

function ScheduleHideMinimapSizePreview(delaySec) { schedulePreviewHide("MinimapSize", delaySec); }
function ScheduleHideZoomMinimapPreview(delaySec) { schedulePreviewHide("ZoomMinimap", delaySec); }
function ScheduleHideZipBoostPreview(delaySec) { schedulePreviewHide("ZipBoost", delaySec); }
function ScheduleHideCrosshairStatsPreview(delaySec) { schedulePreviewHide("CrosshairStats", delaySec); }
function ScheduleHideUnsecuredSoulsPreview(delaySec) { schedulePreviewHide("UnsecuredSouls", delaySec); }
function ScheduleHideCompassPreview(delaySec) { schedulePreviewHide("Compass", delaySec); }
function ScheduleHideSpeedPreview(delaySec) { schedulePreviewHide("Speed", delaySec); }
function ScheduleHideKeyboardOverlayPreview(delaySec) { schedulePreviewHide("KeyboardOverlay", delaySec); }
function ScheduleHideItemCooldownPreview(delaySec) { schedulePreviewHide("ItemCooldown", delaySec); }
function ScheduleHideAmmoPreview(delaySec) { schedulePreviewHide("Ammo", delaySec); }
function ScheduleHideReloadCooldownPreview(delaySec) { schedulePreviewHide("ReloadCooldown", delaySec); }
function ScheduleHideUnitTargetPreview(delaySec) { schedulePreviewHide("UnitTarget", delaySec); }
function ScheduleHideDamageReportPreview(delaySec) { schedulePreviewHide("DamageReport", delaySec); }
function ScheduleHideShopPreview(delaySec) { schedulePreviewHide("Shop", delaySec); }
function ScheduleHideUnsecuredPlusPreview(delaySec) { schedulePreviewHide("UnsecuredPlus", delaySec); }

function ShowMinimapSizePreview(sizePx) {
    if (MOD_CONFIG.PREVIEWS_ENABLED !== 1) {
        HideMinimapSizePreview();
        return;
    }
    if (!IsSettingsWindowVisible()) return;
    var panel = EnsureMinimapSizePreviewPanel();
    if (!panel || !gMinimapSizePreviewCircle || !gMinimapSizePreviewLabel) return;

    var sizeVal = Math.round(Number(sizePx) || 0);
    if (sizeVal <= 0) sizeVal = Math.round(Number(MOD_CONFIG.MINIMAP_SMALL_SIZE) || 0);
    if (sizeVal <= 0) return;
    var xOffset = Math.round(Number(MOD_CONFIG.MINIMAP_X_OFFSET) || 0);
    var yOffset = Math.round(Number(MOD_CONFIG.MINIMAP_Y_OFFSET) || 0);
    var opacityVal = Number(MOD_CONFIG.MINIMAP_BASE_OPACITY);
    if (!isFinite(opacityVal)) opacityVal = 1.0;
    opacityVal = Math.max(0, Math.min(1, opacityVal));

    var previewDiameter = GetMinimapPreviewDiameter(sizeVal);
    gMinimapSizePreviewCircle.style.width = previewDiameter + "px";
    gMinimapSizePreviewCircle.style.height = previewDiameter + "px";
    gMinimapSizePreviewCircle.style.opacity = opacityVal.toFixed(2);

    var contextRoot = $.GetContextPanel ? $.GetContextPanel() : null;
    var searchRoot = FindRootPanel() || contextRoot;
    var minimapPersp = (searchRoot && searchRoot.FindChildTraverse) ? searchRoot.FindChildTraverse("minimap_persp") : null;
    var alignedToLiveMinimap = false;

    if (minimapPersp && (!minimapPersp.IsValid || minimapPersp.IsValid()) && contextRoot) {
        var hostScale = GetPreviewHostScale(contextRoot);
        var rootW = Number(contextRoot.actuallayoutwidth);
        var rootH = Number(contextRoot.actuallayoutheight);
        var mmW = Number(minimapPersp.actuallayoutwidth);
        var mmH = Number(minimapPersp.actuallayoutheight);

        if (isFinite(rootW) && rootW > 0 && isFinite(rootH) && rootH > 0 && isFinite(mmW) && mmW > 0 && isFinite(mmH) && mmH > 0) {
            var mmX = GetPanelOffsetInAncestorSafe(minimapPersp, searchRoot, "x");
            var mmY = GetPanelOffsetInAncestorSafe(minimapPersp, searchRoot, "y");
            var ctxX = GetPanelOffsetInAncestorSafe(contextRoot, searchRoot, "x");
            var ctxY = GetPanelOffsetInAncestorSafe(contextRoot, searchRoot, "y");
            var relX = mmX - ctxX;
            var relY = mmY - ctxY;

            var actualRightDist = rootW - (relX + mmW);
            var actualBottomDist = rootH - (relY + mmH);

            if (isFinite(actualRightDist) && isFinite(actualBottomDist)) {
                var virtualRight = Math.round(actualRightDist / (hostScale.x || 1.0));
                var virtualBottom = Math.round(actualBottomDist / (hostScale.y || 1.0));
                panel.style.marginRight = virtualRight + "px";
                panel.style.marginBottom = virtualBottom + "px";
                alignedToLiveMinimap = true;
            }
        }
    }

    if (!alignedToLiveMinimap) {
        var rightInset = GetMinimapPreviewRightInsetPx();
        panel.style.marginRight = (gMinimapPreviewBaseRight - xOffset + rightInset) + "px";
        panel.style.marginBottom = (gMinimapPreviewBaseBottom + yOffset) + "px";
    }

    gMinimapSizePreviewLabel.text = sizeVal + " px";
    panel.AddClass("Visible");
    ScheduleHideMinimapSizePreview(1.5);
}

function ShowZoomMinimapPreview(mode, sizePx) {
    if (MOD_CONFIG.PREVIEWS_ENABLED !== 1) {
        HideMinimapSizePreview();
        return;
    }
    if (!IsSettingsWindowVisible()) return;
    if (typeof mode !== "string") {
        sizePx = mode;
        mode = gZoomPreviewMode;
    }
    mode = (mode === "TAB") ? "TAB" : "ALT";
    gZoomPreviewMode = mode;
    var keys = GetZoomConfigKeysForMode(mode);

    var panel = EnsureZoomMinimapPreviewPanel();
    if (!panel || !gZoomMinimapPreviewCircle || !gZoomMinimapPreviewLabel) return;

    var sizeVal = Math.round(Number(sizePx) || 0);
    if (sizeVal <= 0) sizeVal = Math.round(Number(MOD_CONFIG[keys.size]) || 0);
    if (sizeVal <= 0) sizeVal = Math.round(Number(MOD_CONFIG.MINIMAP_LARGE_SIZE) || 0);
    if (sizeVal <= 0) return;

    var zoomX = Math.round(Number(MOD_CONFIG[keys.x]) || 0);
    var zoomY = Math.round(Number(MOD_CONFIG[keys.y]) || 0);

    var opacityVal = Number(MOD_CONFIG[keys.opacity]);
    if (!isFinite(opacityVal)) opacityVal = 1.0;
    opacityVal = Math.max(0, Math.min(1, opacityVal));

    var previewDiameter = GetMinimapPreviewDiameter(sizeVal);
    gZoomMinimapPreviewCircle.style.width = previewDiameter + "px";
    gZoomMinimapPreviewCircle.style.height = previewDiameter + "px";
    gZoomMinimapPreviewCircle.style.opacity = opacityVal.toFixed(2);
    panel.style.marginLeft = (gZoomPreviewBaseX + zoomX) + "px";
    panel.style.marginTop = (gZoomPreviewBaseY - zoomY) + "px";
    gZoomMinimapPreviewLabel.text = sizeVal + " px";
    panel.AddClass("Visible");
    ScheduleHideZoomMinimapPreview(1.5);
}

function ShowZipBoostPreview() {
    if (MOD_CONFIG.PREVIEWS_ENABLED !== 1) {
        HideMinimapSizePreview();
        return;
    }
    if (Number(MOD_CONFIG.ENABLE_ZIP_BOOST) === 0) {
        if (gZipBoostPreviewPanel && gZipBoostPreviewPanel.IsValid && gZipBoostPreviewPanel.IsValid()) {
            gZipBoostPreviewPanel.RemoveClass("Visible");
        }
        return;
    }
    if (!IsSettingsWindowVisible()) return;
    var panel = EnsureZipBoostPreviewPanel();
    if (!panel || !gZipBoostPreviewBox || !gZipBoostPreviewLabel) return;

    var xOffset = Math.round(Number(MOD_CONFIG.ZIP_BOOST_X_OFFSET) || 0);
    var yOffset = Math.round(Number(MOD_CONFIG.ZIP_BOOST_Y_OFFSET) || 0);
    var scale = Math.round(Number(MOD_CONFIG.ZIP_BOOST_SCALE) || 100);

    if (xOffset < -2000) xOffset = -2000;
    if (xOffset > 2000) xOffset = 2000;
    if (yOffset < 0) yOffset = 0;
    if (yOffset > 1000) yOffset = 1000;
    if (scale < 50) scale = 50;
    if (scale > 200) scale = 200;

    panel.style.marginLeft = (gZipBoostPreviewBaseX + xOffset) + "px";
    panel.style.marginBottom = (gZipBoostPreviewBaseY + yOffset) + "px";
    gZipBoostPreviewBox.style.uiScale = scale + "%";
    gZipBoostPreviewLabel.text = LocalizeSettingsText("ZIP BOOST", true) + " " + scale + "%";
    panel.AddClass("Visible");
    ScheduleHideZipBoostPreview(1.5);
}

function ShowCrosshairStatsPreview() {
    if (MOD_CONFIG.PREVIEWS_ENABLED !== 1) {
        HideMinimapSizePreview();
        return;
    }
    if (Number(MOD_CONFIG.ENABLE_CROSSHAIR_STATS) === 0) {
        if (gCrosshairStatsPreviewPanel && gCrosshairStatsPreviewPanel.IsValid && gCrosshairStatsPreviewPanel.IsValid()) {
            gCrosshairStatsPreviewPanel.RemoveClass("Visible");
        }
        return;
    }
    if (!IsSettingsWindowVisible()) return;
    var panel = EnsureCrosshairStatsPreviewPanel();
    if (!panel || !gCrosshairStatsPreviewBox || !gCrosshairStatsPreviewLabel) return;

    var xOffset = Math.round(Number(MOD_CONFIG.CROSSHAIR_STATS_X_OFFSET) || 0);
    var yOffset = Math.round(Number(MOD_CONFIG.CROSSHAIR_STATS_Y_OFFSET) || 0);
    var scale = Math.round(Number(MOD_CONFIG.CROSSHAIR_STATS_SCALE) || 100);
    var opacity = Number(MOD_CONFIG.CROSSHAIR_STATS_OPACITY);
    if (isNaN(opacity)) opacity = 1;

    if (xOffset < -500) xOffset = -500;
    if (xOffset > 500) xOffset = 500;
    if (yOffset < -500) yOffset = -500;
    if (yOffset > 500) yOffset = 500;
    if (scale < 50) scale = 50;
    if (scale > 200) scale = 200;
    if (opacity < 0) opacity = 0;
    if (opacity > 1) opacity = 1;

    panel.style.marginLeft = (gCrosshairStatsPreviewBaseX + xOffset) + "px";
    // Subtract yOffset so the preview moves the same way the runtime overlay does
    // (positive Vertical Offset = up). Keeps showcase honest to in-game behaviour.
    panel.style.marginTop = (gCrosshairStatsPreviewBaseY - yOffset) + "px";
    gCrosshairStatsPreviewBox.style.uiScale = scale + "%";
    gCrosshairStatsPreviewBox.style.opacity = opacity.toFixed(2);
    gCrosshairStatsPreviewLabel.text = LocalizeSettingsText("ACTIVE STATS", true);
    panel.AddClass("Visible");
    ScheduleHideCrosshairStatsPreview(1.5);
}

function ShowUnsecuredSoulsPreview() {
    if (MOD_CONFIG.PREVIEWS_ENABLED !== 1) {
        HideMinimapSizePreview();
        return;
    }
    if (Number(MOD_CONFIG.ENABLE_UNSECURED_SOUL_TIMER) === 0) {
        if (gUnsecuredSoulsPreviewPanel && gUnsecuredSoulsPreviewPanel.IsValid && gUnsecuredSoulsPreviewPanel.IsValid()) {
            gUnsecuredSoulsPreviewPanel.RemoveClass("Visible");
        }
        return;
    }
    if (!IsSettingsWindowVisible()) return;
    var panel = EnsureUnsecuredSoulsPreviewPanel();
    if (!panel || !gUnsecuredSoulsPreviewLabel) return;

    var xOffset = Math.round(Number(MOD_CONFIG.UNSECURED_SOUL_TIMER_X_OFFSET) || 0);
    var yOffset = Math.round(Number(MOD_CONFIG.UNSECURED_SOUL_TIMER_Y_OFFSET) || 0);
    var scale = Math.round(Number(MOD_CONFIG.UNSECURED_SOUL_TIMER_SCALE) || 100);
    var enabled = Number(MOD_CONFIG.ENABLE_UNSECURED_SOUL_TIMER) === 1;

    if (xOffset < -1500) xOffset = -1500;
    if (xOffset > 1500) xOffset = 1500;
    if (yOffset < -100) yOffset = -100;
    if (yOffset > 1000) yOffset = 1000;
    if (scale < 50) scale = 50;
    if (scale > 200) scale = 200;
    var fontPx = Math.round(16 * (scale / 100));
    if (fontPx < 8) fontPx = 8;
    if (fontPx > 72) fontPx = 72;
    var fontSize = fontPx + "px";

    panel.style.marginLeft = (gUnsecuredSoulsPreviewBaseX + xOffset) + "px";
    panel.style.marginBottom = (gUnsecuredSoulsPreviewBaseY + yOffset) + "px";
    if (panel.style.preTransformScale2d !== "1.00") {
        panel.style.preTransformScale2d = "1.00";
    }
    if (gUnsecuredSoulsPreviewLabel.style.fontSize !== fontSize) {
        gUnsecuredSoulsPreviewLabel.style.fontSize = fontSize;
    }
    gUnsecuredSoulsPreviewLabel.text = enabled ? "23s" : LocalizeSettingsText("SAFE", true);
    panel.AddClass("Visible");
    ScheduleHideUnsecuredSoulsPreview(1.5);
}

function ShowConfigPreviewForConfigId(configId) {
    if (MOD_CONFIG.PREVIEWS_ENABLED !== 1) { HideMinimapSizePreview(); return; }
    if (!IsSettingsWindowVisible()) { HideMinimapSizePreview(); return; }
    try { DispatchConfigPreview(configId); }
    catch (error) {
        hidePreviews();
        WarnLog("settings", "preview failed: " + (error?.message || String(error)));
    }
}

function DispatchConfigPreview(configId) {
    if (IsMinimapPreviewConfig(configId)) {
        ShowMinimapSizePreview(MOD_CONFIG.MINIMAP_SMALL_SIZE);
    }
    if (IsZoomMinimapPreviewConfig(configId)) {
        gZoomPreviewMode = GetZoomPreviewModeForConfigId(configId);
        ShowZoomMinimapPreview(gZoomPreviewMode);
    }
    if (IsZipBoostPreviewConfig(configId)) {
        ShowZipBoostPreview();
    }
    if (IsCrosshairStatsPreviewConfig(configId)) {
        ShowCrosshairStatsPreview();
    }
    if (IsUnsecuredSoulsPreviewConfig(configId)) {
        ShowUnsecuredSoulsPreview();
    }
    if (IsCompassPreviewConfig(configId)) {
        ShowCompassPreview();
    }
    if (IsSpeedPreviewConfig(configId)) {
        ShowSpeedPreview();
    }
    if (IsKeyboardOverlayPreviewConfig(configId)) {
        ShowKeyboardOverlayPreview();
    }
    if (IsItemCooldownPreviewConfig(configId)) {
        ShowItemCooldownPreview();
    }
    if (IsAmmoPreviewConfig(configId)) {
        ShowAmmoPreview();
    }
    if (IsReloadCooldownPreviewConfig(configId)) {
        ShowReloadCooldownPreview();
    }
    if (IsUnitTargetPreviewConfig(configId)) {
        ShowUnitTargetPreview();
    }
    if (IsDamageReportPreviewConfig(configId)) {
        ShowDamageReportPreview();
    }
    if (IsShopPreviewConfig(configId)) {
        ShowShopPreview();
    }
    if (IsUnsecuredPlusPreviewConfig(configId)) {
        ShowUnsecuredPlusPreview();
    }
}

function ShowCompassPreview() {
    if (MOD_CONFIG.PREVIEWS_ENABLED !== 1) {
        HideMinimapSizePreview();
        return;
    }
    if (MOD_CONFIG.ENABLE_COMPASS === 0) {
        if (gCompassPreviewPanel && gCompassPreviewPanel.IsValid && gCompassPreviewPanel.IsValid()) {
            gCompassPreviewPanel.RemoveClass("Visible");
        }
        return;
    }
    if (!IsSettingsWindowVisible()) return;
    var panel = EnsureCompassPreviewPanel();
    if (!panel || !gCompassPreviewBox) return;

    var scale = Math.round(Number(MOD_CONFIG.COMPASS_SCALE) || 100);
    var stretchX = Math.round(Number(MOD_CONFIG.COMPASS_STRETCH_X) || 100);
    var stretchY = Math.round(Number(MOD_CONFIG.COMPASS_STRETCH_Y) || 100);
    var xOffset = Math.round(Number(MOD_CONFIG.COMPASS_X_OFFSET) || 0);
    var yOffset = Math.round(Number(MOD_CONFIG.COMPASS_Y_OFFSET) || 120);
    var showSpeed = (MOD_CONFIG.ENABLE_COMPASS_SPEED !== 0);

    if (scale < 50) scale = 50;
    if (scale > 200) scale = 200;
    if (stretchX < 50) stretchX = 50;
    if (stretchX > 200) stretchX = 200;
    if (stretchY < 50) stretchY = 50;
    if (stretchY > 200) stretchY = 200;
    if (xOffset < -2000) xOffset = -2000;
    if (xOffset > 2000) xOffset = 2000;
    if (yOffset < -1000) yOffset = -1000;
    if (yOffset > 300) yOffset = 300;

    panel.style.marginLeft = (gCompassPreviewBaseX + xOffset) + "px";
    var compassBaselineY = Number(DEFAULT_CONFIG.COMPASS_Y_OFFSET);
    if (!isFinite(compassBaselineY)) compassBaselineY = 120;
    panel.style.marginTop = String((2 * compassBaselineY) - yOffset) + "px";

    var boxWidth = Math.round(200 * (scale / 100) * (stretchX / 100));
    var boxHeight = Math.round(50 * (scale / 100) * (stretchY / 100));
    if (boxWidth < 80) boxWidth = 80;
    if (boxHeight < 20) boxHeight = 20;

    gCompassPreviewBox.style.width = boxWidth + "px";
    gCompassPreviewBox.style.height = boxHeight + "px";
    gCompassPreviewBox.style.visibility = "visible";

    if (gCompassPreviewLabel) {
        gCompassPreviewLabel.text = boxWidth + "x" + boxHeight;
    }

    // Speed gets its own preview panel (ShowSpeedPreview) so it isn't trapped in
    // the compass box — mirroring the in-game split. When the compass shares the
    // screen we show that speed preview alongside this one for reference.
    if (showSpeed) ShowSpeedPreview();

    panel.AddClass("Visible");
    ScheduleHideCompassPreview(1.5);
}

// Independent speed preview — mirrors core's UpdateCompassOverlay exactly:
// with the compass on, the speed sits in the RIGHT half of the box, a touch
// below the degree readout; alone, it's screen-centered at the compass
// baseline. Then the speed offset sliders nudge it from there.
function ShowSpeedPreview() {
    if (MOD_CONFIG.PREVIEWS_ENABLED !== 1) {
        HideMinimapSizePreview();
        return;
    }
    if (MOD_CONFIG.ENABLE_COMPASS_SPEED === 0) {
        if (gSpeedPreviewPanel && gSpeedPreviewPanel.IsValid && gSpeedPreviewPanel.IsValid()) {
            gSpeedPreviewPanel.RemoveClass("Visible");
        }
        return;
    }
    if (!IsSettingsWindowVisible()) return;
    var panel = EnsureSpeedPreviewPanel();
    if (!panel || !gSpeedPreviewLabel) return;

    var showCompass = (MOD_CONFIG.ENABLE_COMPASS !== 0);

    // Compass geometry — unscaled box dims, matching how core anchors the speed
    // (the speed root isn't scaled, so it uses the unscaled box width/height).
    var stretchX = Math.round(Number(MOD_CONFIG.COMPASS_STRETCH_X) || 100);
    if (stretchX < 50) stretchX = 50;
    if (stretchX > 200) stretchX = 200;
    var stretchY = Math.round(Number(MOD_CONFIG.COMPASS_STRETCH_Y) || 100);
    if (stretchY < 50) stretchY = 50;
    if (stretchY > 200) stretchY = 200;
    var compassOffsetX = Math.round(Number(MOD_CONFIG.COMPASS_X_OFFSET) || 0);
    if (compassOffsetX < -2000) compassOffsetX = -2000;
    if (compassOffsetX > 2000) compassOffsetX = 2000;
    var compassOffsetY = Math.round(Number(MOD_CONFIG.COMPASS_Y_OFFSET) || 120);
    if (compassOffsetY < -1000) compassOffsetY = -1000;
    if (compassOffsetY > 300) compassOffsetY = 300;

    var compassBaselineY = Number(DEFAULT_CONFIG.COMPASS_Y_OFFSET);
    if (!isFinite(compassBaselineY)) compassBaselineY = 120;
    var appliedCompassOffsetY = (2 * compassBaselineY) - compassOffsetY;
    var boxWidth = Math.round(200 * (stretchX / 100));
    if (boxWidth < 100) boxWidth = 100;
    var boxHeight = Math.round(50 * (stretchY / 100));
    if (boxHeight < 25) boxHeight = 25;

    var speedOffsetX = Math.round(Number(MOD_CONFIG.COMPASS_SPEED_X_OFFSET) || 0);
    var speedOffsetY = Math.round(Number(MOD_CONFIG.COMPASS_SPEED_Y_OFFSET) || 0);
    if (speedOffsetX < -2000) speedOffsetX = -2000;
    if (speedOffsetX > 2000) speedOffsetX = 2000;
    if (speedOffsetY < -2000) speedOffsetY = -2000;
    if (speedOffsetY > 2000) speedOffsetY = 2000;

    gSpeedPreviewLabel.style.width = "100%";
    gSpeedPreviewLabel.style.height = "100%";
    gSpeedPreviewLabel.style.textAlign = "center";
    gSpeedPreviewLabel.style.horizontalAlign = "center";
    gSpeedPreviewLabel.style.verticalAlign = "center";

    var speedBaseX = showCompass ? compassOffsetX : 0;
    var speedBaseY = showCompass ? (appliedCompassOffsetY + boxHeight + 14) : compassBaselineY;

    panel.style.width = "50px";
    panel.style.height = "50px";
    panel.style.marginLeft = Math.round(speedBaseX + speedOffsetX) + "px";
    panel.style.marginTop = Math.round(speedBaseY - speedOffsetY) + "px";
    gSpeedPreviewLabel.text = LocalizeSettingsText("SPD", true);

    panel.AddClass("Visible");
    ScheduleHideSpeedPreview(1.5);
}

function ShowKeyboardOverlayPreview() {
    if (MOD_CONFIG.PREVIEWS_ENABLED !== 1) {
        HideMinimapSizePreview();
        return;
    }
    if (Number(MOD_CONFIG.ENABLE_KEYBOARD_OVERLAY) === 0) {
        if (gKeyboardOverlayPreviewPanel && gKeyboardOverlayPreviewPanel.IsValid && gKeyboardOverlayPreviewPanel.IsValid()) {
            gKeyboardOverlayPreviewPanel.RemoveClass("Visible");
        }
        return;
    }
    if (!IsSettingsWindowVisible()) return;
    var panel = EnsureKeyboardOverlayPreviewPanel();
    if (!panel || !gKeyboardOverlayPreviewBox || !gKeyboardOverlayPreviewLabel) return;

    var scale = Math.round(Number(MOD_CONFIG.KEYBOARD_OVERLAY_SCALE) || 100);
    var xOffset = Math.round(Number(MOD_CONFIG.KEYBOARD_OVERLAY_X_OFFSET) || 0);
    var yOffset = Math.round(Number(MOD_CONFIG.KEYBOARD_OVERLAY_Y_OFFSET) || 0);
    var kbFullLayout = Number(MOD_CONFIG.ENABLE_FULL_KEYBOARD_LAYOUT) === 1;

    if (scale < 70) scale = 70;
    if (scale > 150) scale = 150;
    if (xOffset < -1500) xOffset = -1500;
    if (xOffset > 1500) xOffset = 1500;
    if (yOffset < -400) yOffset = -400;
    if (yOffset > 1000) yOffset = 1000;

    var kbBaseMarginLeft = kbFullLayout ? 70 : gKeyboardOverlayPreviewBaseX;
    var kbScaleFactor = scale / 100;
    var rowDefs = kbFullLayout ? [
        [40, 40, 40, 40, 40, 40, 40],
        [53, 40, 40, 40, 40],
        [60, 40, 40, 40, 40],
        [80, 40, 40, 40, 40],
        [60, 60, 133]
    ] : [
        [80, 40, 40, 40, 40],
        [80, 40, 40, 40, 40],
        [60, 192]
    ];
    var kbScaledHeight = Math.max(1, Math.round(40 * kbScaleFactor));
    var kbScaledGap = Math.max(1, Math.round(1 * kbScaleFactor));
    var kbRowCount = rowDefs.length;
    var kbScaledWidth = 0;
    for (var r = 0; r < rowDefs.length; r++) {
        var row = rowDefs[r];
        var rowWidth = 0;
        for (var k = 0; k < row.length; k++) {
            rowWidth += Math.max(1, Math.round(row[k] * kbScaleFactor)) + (kbScaledGap * 2);
        }
        if (rowWidth > kbScaledWidth) kbScaledWidth = rowWidth;
    }
    var kbTotalHeight = Math.round(kbRowCount * (kbScaledHeight + (kbScaledGap * 2)));

    panel.style.marginLeft = (kbBaseMarginLeft + xOffset) + "px";
    panel.style.marginBottom = (gKeyboardOverlayPreviewBaseY + yOffset) + "px";
    gKeyboardOverlayPreviewBox.style.preTransformScale2d = "1.00";
    gKeyboardOverlayPreviewBox.style.width = kbScaledWidth + "px";
    gKeyboardOverlayPreviewBox.style.height = kbTotalHeight + "px";
    gKeyboardOverlayPreviewLabel.text = kbScaledWidth + "x" + kbTotalHeight;
    panel.AddClass("Visible");
    ScheduleHideKeyboardOverlayPreview(1.5);
}

function ShowItemCooldownPreview() {
    if (MOD_CONFIG.PREVIEWS_ENABLED !== 1) {
        HideMinimapSizePreview();
        return;
    }
    if (!IsSettingsWindowVisible()) return;
    var panel = EnsureItemCooldownPreviewPanel();
    if (!panel || !gItemCooldownPreviewRow || !gItemCooldownPreviewIcon) return;

    var size = Number(MOD_CONFIG.PASSIVE_COOLDOWN_SIZE);
    if (!isFinite(size)) size = 40;
    if (size < 30) size = 30;
    if (size > 60) size = 60;

    var xOffset = Math.round(Number(MOD_CONFIG.PASSIVE_COOLDOWN_X) || 0);
    var yOffset = Math.round(Number(MOD_CONFIG.PASSIVE_COOLDOWN_Y) || 0);
    if (xOffset < -50) xOffset = -50;
    if (xOffset > 50) xOffset = 50;
    if (yOffset < -50) yOffset = -50;
    if (yOffset > 50) yOffset = 50;

    var opacity = Number(MOD_CONFIG.PASSIVE_COOLDOWN_OPACITY);
    if (!isFinite(opacity)) opacity = 0.5;
    if (opacity < 0) opacity = 0;
    if (opacity > 1) opacity = 1;

    var scale = size / 40;
    if (!isFinite(scale) || scale <= 0) scale = 1.0;
    if (scale < 0.75) scale = 0.75;
    if (scale > 1.5) scale = 1.5;
    var previewBaseSizePx = 45;
    var previewSizePx = Math.round(previewBaseSizePx * scale);
    if (previewSizePx < 34) previewSizePx = 34;
    if (previewSizePx > 68) previewSizePx = 68;

    panel.style.marginLeft = xOffset + "%";
    panel.style.marginTop = (-yOffset) + "%";
    gItemCooldownPreviewIcon.style.width = previewSizePx + "px";
    gItemCooldownPreviewIcon.style.height = previewSizePx + "px";
    gItemCooldownPreviewRow.style.opacity = opacity.toFixed(2);
    if (gItemCooldownPreviewLabel) gItemCooldownPreviewLabel.text = "7";

    panel.AddClass("Visible");
    ScheduleHideItemCooldownPreview(1.5);
}

function ShowAmmoPreview() {
    if (MOD_CONFIG.PREVIEWS_ENABLED !== 1) {
        HideMinimapSizePreview();
        return;
    }
    var panel = EnsureAmmoPreviewPanel();
    if (!panel || !gAmmoPreviewCurrentLabel || !gAmmoPreviewTotalLabel) return;
    if (!IsSettingsWindowVisible()) return;

    var currentScale = Math.round(Number(MOD_CONFIG.AMMO_CURRENT_SCALE));
    if (!isFinite(currentScale)) currentScale = 100;
    if (currentScale < 100) currentScale = 100;
    if (currentScale > 300) currentScale = 300;

    var totalScale = Math.round(Number(MOD_CONFIG.AMMO_TOTAL_SCALE));
    if (!isFinite(totalScale)) totalScale = 100;
    if (totalScale < 100) totalScale = 100;
    if (totalScale > 300) totalScale = 300;

    var xOffset = Math.round(Number(MOD_CONFIG.AMMO_PANEL_X_OFFSET));
    if (!isFinite(xOffset)) xOffset = 0;
    if (xOffset < -200) xOffset = -200;
    if (xOffset > 200) xOffset = 200;

    var yOffset = Math.round(Number(MOD_CONFIG.AMMO_PANEL_Y_OFFSET));
    if (!isFinite(yOffset)) yOffset = 0;
    if (yOffset < -200) yOffset = -200;
    if (yOffset > 200) yOffset = 200;

    var currentScaleFactor = currentScale / 100.0;
    var totalScaleFactor = totalScale / 100.0;
    var currentFontPx = Math.max(12, Math.round(16 * currentScaleFactor));
    var currentWidthPx = Math.max(24, Math.round(32 * currentScaleFactor));
    var totalFontPx = Math.max(12, Math.round(16 * totalScaleFactor));
    var totalWidthPx = Math.max(32, Math.round(50 * totalScaleFactor));
    var totalMarginLeftPx = Math.max(0, Math.round(2 * totalScaleFactor));

    var baseX = 980;
    var baseY = 820;
    var anchoredToLive = false;
    var root = FindRootPanel();
    var liveAmmo = root && root.FindChildTraverse ? root.FindChildTraverse("ammo_panel") : null;
    var liveRect = GetPanelRectRelativeToContext(liveAmmo);
    if (liveRect) {
        baseX = liveRect.x;
        baseY = liveRect.y;
        anchoredToLive = true;
    }

    var targetX = anchoredToLive ? baseX : (baseX + xOffset);
    var targetY = anchoredToLive ? baseY : (baseY - yOffset);
    SetPreviewPanelPosition(panel, targetX, targetY);
    gAmmoPreviewCurrentLabel.style.fontSize = String(currentFontPx) + "px";
    gAmmoPreviewCurrentLabel.style.width = String(currentWidthPx) + "px";
    gAmmoPreviewCurrentLabel.text = "62";
    gAmmoPreviewTotalLabel.style.fontSize = String(totalFontPx) + "px";
    gAmmoPreviewTotalLabel.style.width = String(totalWidthPx) + "px";
    gAmmoPreviewTotalLabel.style.marginLeft = String(totalMarginLeftPx) + "px";
    gAmmoPreviewTotalLabel.text = "/180";

    panel.AddClass("Visible");
    ScheduleHideAmmoPreview(1.2);
}

function ShowReloadCooldownPreview() {
    if (MOD_CONFIG.PREVIEWS_ENABLED !== 1) {
        HideMinimapSizePreview();
        return;
    }
    var panel = EnsureReloadCooldownPreviewPanel();
    if (!panel || !gReloadCooldownPreviewRing || !gReloadCooldownPreviewLabel) return;
    if (!IsSettingsWindowVisible()) return;

    var opacity = Number(MOD_CONFIG.RELOAD_COOLDOWN_OPACITY);
    if (!isFinite(opacity)) opacity = 0.6;
    if (opacity < 0) opacity = 0;
    if (opacity > 1) opacity = 1;

    var size = Math.round(Number(MOD_CONFIG.RELOAD_COOLDOWN_SIZE));
    if (!isFinite(size)) size = 28;
    if (size < 16) size = 16;
    if (size > 60) size = 60;

    var offsetX = Math.round(Number(MOD_CONFIG.RELOAD_COOLDOWN_X_OFFSET));
    if (!isFinite(offsetX)) offsetX = 0;
    if (offsetX < -75) offsetX = -75;
    if (offsetX > 75) offsetX = 75;

    var offsetY = Math.round(Number(MOD_CONFIG.RELOAD_COOLDOWN_Y_OFFSET));
    if (!isFinite(offsetY)) offsetY = 0;
    if (offsetY < -75) offsetY = -75;
    if (offsetY > 75) offsetY = 75;

    var context = $.GetContextPanel();
    var fallbackX = 950;
    var fallbackY = 510;
    var contextW = Number(context && context.actuallayoutwidth);
    var contextH = Number(context && context.actuallayoutheight);
    if (isFinite(contextW) && contextW > 0) fallbackX = Math.round(contextW * 0.5);
    if (isFinite(contextH) && contextH > 0) fallbackY = Math.round(contextH * 0.52);

    var baseX = fallbackX;
    var baseY = fallbackY;
    var anchoredToLive = false;
    var root = FindRootPanel();
    var liveReticle = null;
    if (root && root.FindChildTraverse) {
        liveReticle = root.FindChildTraverse("reticle_status") || root.FindChildTraverse("ReticleStatus");
    }
    var liveRect = GetPanelRectRelativeToContext(liveReticle);
    if (liveRect) {
        baseX = liveRect.x + Math.round(liveRect.width * 0.5);
        baseY = liveRect.y + Math.round(liveRect.height * 0.5);
    }

    var ringSize = Math.max(36, Math.round(size * 2.2));
    SetPreviewPanelPosition(panel, baseX + offsetX - Math.round(ringSize * 0.5), baseY - offsetY - Math.round(ringSize * 0.5));
    gReloadCooldownPreviewRing.style.width = String(ringSize) + "px";
    gReloadCooldownPreviewRing.style.height = String(ringSize) + "px";
    SetPanelOpacitySafe(gReloadCooldownPreviewRing, opacity, 0.6);
    gReloadCooldownPreviewLabel.style.fontSize = String(size) + "px";
    gReloadCooldownPreviewLabel.text = "1.3";

    panel.AddClass("Visible");
    ScheduleHideReloadCooldownPreview(1.2);
}

function ShowUnitTargetPreview() {
    if (MOD_CONFIG.PREVIEWS_ENABLED !== 1) {
        HideMinimapSizePreview();
        return;
    }
    var panel = EnsureUnitTargetPreviewPanel();
    if (!panel || !gUnitTargetPreviewImage || !gUnitTargetPreviewBinding) return;
    if (!IsSettingsWindowVisible()) return;

    var size = Math.round(Number(MOD_CONFIG.UNIT_TARGET_SIZE));
    if (!isFinite(size)) size = 150;
    if (size < 50) size = 50;
    if (size > 300) size = 300;

    var opacity = Number(MOD_CONFIG.UNIT_TARGET_OPACITY);
    if (!isFinite(opacity)) opacity = 1.0;
    if (opacity < 0) opacity = 0;
    if (opacity > 1) opacity = 1;

    var redDiamond = Number(MOD_CONFIG.ENABLE_RED_DIAMOND) === 1;
    var improvedHint = Number(MOD_CONFIG.ENABLE_IMPROVED_HINT) === 1;

    var previewSizePx = Math.max(28, Math.round(size * 0.56));
    var context = $.GetContextPanel();
    var fallbackX = 930;
    var fallbackY = 470;
    var contextW = Number(context && context.actuallayoutwidth);
    var contextH = Number(context && context.actuallayoutheight);
    if (isFinite(contextW) && contextW > 0) fallbackX = Math.round(contextW * 0.5);
    if (isFinite(contextH) && contextH > 0) fallbackY = Math.round(contextH * 0.44);

    var baseX = fallbackX;
    var baseY = fallbackY;
    var root = FindRootPanel();
    var liveHint = null;
    if (root && root.FindChildTraverse) {
        liveHint = root.FindChildTraverse("Citadel_AbilityHudButtonHintPanel") || root.FindChildTraverse("ability_image");
    }
    var liveRect = GetPanelRectRelativeToContext(liveHint);
    if (liveRect) {
        baseX = liveRect.x + Math.round(liveRect.width * 0.5);
        baseY = liveRect.y + Math.round(liveRect.height * 0.5);
    }

    SetPreviewPanelPosition(panel, baseX - Math.round(previewSizePx * 0.5), baseY - Math.round(previewSizePx * 0.5));
    gUnitTargetPreviewImage.style.width = String(previewSizePx) + "px";
    gUnitTargetPreviewImage.style.height = String(previewSizePx) + "px";
    SetPanelOpacitySafe(gUnitTargetPreviewImage, opacity, 1.0);
    gUnitTargetPreviewImage.SetHasClass("RedDiamond", redDiamond);
    gUnitTargetPreviewImage.SetHasClass("ImprovedHint", improvedHint);
    gUnitTargetPreviewBinding.SetHasClass("ImprovedHint", improvedHint);

    panel.AddClass("Visible");
    ScheduleHideUnitTargetPreview(1.2);
}

function ShowDamageReportPreview() {
    if (MOD_CONFIG.PREVIEWS_ENABLED !== 1) {
        HideMinimapSizePreview();
        return;
    }
    var panel = EnsureDamageReportPreviewPanel();
    if (!panel || !gDamageReportPreviewBox || !gDamageReportPreviewLabel) return;
    if (!IsSettingsWindowVisible()) return;

    var offsetX = Math.round(Number(MOD_CONFIG.DAMAGE_REPORT_X_OFFSET));
    if (!isFinite(offsetX)) offsetX = 0;
    if (offsetX < 0) offsetX = 0;
    if (offsetX > 2000) offsetX = 2000;
    var offsetY = Math.round(Number(MOD_CONFIG.DAMAGE_REPORT_Y_OFFSET));
    if (!isFinite(offsetY)) offsetY = 0;
    if (offsetY < -200) offsetY = -200;
    if (offsetY > 1000) offsetY = 1000;
    var isDisabled = Number(MOD_CONFIG.DISABLE_DAMAGE_REPORT) === 1;

    var context = $.GetContextPanel();
    var fallbackX = 1120;
    var fallbackY = 390;
    var contextW = Number(context && context.actuallayoutwidth);
    var contextH = Number(context && context.actuallayoutheight);
    if (isFinite(contextW) && contextW > 0) fallbackX = Math.round(contextW * 0.58);
    if (isFinite(contextH) && contextH > 0) fallbackY = Math.round(contextH * 0.36);

    var baseX = fallbackX;
    var baseY = fallbackY;
    var anchoredToLive = false;
    var root = FindRootPanel();
    var livePanel = root && root.FindChildTraverse ? root.FindChildTraverse("CitadelHudDamageReport") : null;
    var liveRect = GetPanelRectRelativeToContext(livePanel);
    if (liveRect) {
        baseX = liveRect.x;
        baseY = liveRect.y;
        anchoredToLive = true;
    }

    var targetX = anchoredToLive ? baseX : (baseX + offsetX);
    var targetY = anchoredToLive ? baseY : (baseY - offsetY);
    SetPreviewPanelPosition(panel, targetX, targetY);
    gDamageReportPreviewBox.SetHasClass("Disabled", isDisabled);
    gDamageReportPreviewLabel.text = LocalizeSettingsText(isDisabled ? "HIDDEN" : "DAMAGE REPORT", true);
    panel.AddClass("Visible");
    ScheduleHideDamageReportPreview(1.2);
}

function ShowShopPreview() {
    if (MOD_CONFIG.PREVIEWS_ENABLED !== 1) {
        HideMinimapSizePreview();
        return;
    }
    var panel = EnsureShopPreviewPanel();
    if (!panel || !gShopPreviewBox || !gShopPreviewLabel) return;
    if (!IsSettingsWindowVisible()) return;

    var offsetX = Math.round(Number(MOD_CONFIG.SHOP_OFFSET_X));
    if (!isFinite(offsetX)) offsetX = 0;
    if (offsetX < -500) offsetX = -500;
    if (offsetX > 500) offsetX = 500;
    var offsetY = Math.round(Number(MOD_CONFIG.SHOP_OFFSET_Y));
    if (!isFinite(offsetY)) offsetY = 0;
    if (offsetY < -500) offsetY = -500;
    if (offsetY > 500) offsetY = 500;
    var opacity = Number(MOD_CONFIG.SHOP_OPACITY);
    if (!isFinite(opacity)) opacity = 1.0;
    if (opacity < 0) opacity = 0;
    if (opacity > 1) opacity = 1;
    var scale = Number(MOD_CONFIG.SHOP_SCALE);
    if (!isFinite(scale)) scale = 1.0;
    if (scale < 0.5) scale = 0.5;
    if (scale > 1.5) scale = 1.5;

    var context = $.GetContextPanel();
    var fallbackX = 240;
    var fallbackY = 120;
    var contextW = Number(context && context.actuallayoutwidth);
    var contextH = Number(context && context.actuallayoutheight);
    if (isFinite(contextW) && contextW > 0) fallbackX = Math.round(contextW * 0.08);
    if (isFinite(contextH) && contextH > 0) fallbackY = Math.round(contextH * 0.12);

    var baseX = fallbackX;
    var baseY = fallbackY;
    var anchoredToLive = false;
    var root = FindRootPanel();
    var heroShop = root && root.FindChildTraverse ? root.FindChildTraverse("CitadelHudHeroShop") : null;
    var mainPanel = heroShop && heroShop.FindChildTraverse ? heroShop.FindChildTraverse("MainPanel") : null;
    var liveRect = GetPanelRectRelativeToContext(mainPanel || heroShop);
    if (liveRect) {
        baseX = liveRect.x;
        baseY = liveRect.y;
        anchoredToLive = true;
    }

    var targetX = baseX + offsetX;
    var targetY = baseY - offsetY;
    SetPreviewPanelPosition(panel, targetX, targetY);
    SetPanelOpacitySafe(panel, opacity, 1.0);
    panel.style.preTransformScale2d = "1.00, 1.00";
    panel.style.uiScale = Math.round(scale * 100) + "%";
    gShopPreviewLabel.text = LocalizeSettingsText("SHOP", true);
    panel.AddClass("Visible");
    ScheduleHideShopPreview(1.2);
}

function ShowUnsecuredPlusPreview() {
    if (MOD_CONFIG.PREVIEWS_ENABLED !== 1) {
        HideMinimapSizePreview();
        return;
    }
    var panel = EnsureUnsecuredPlusPreviewPanel();
    if (!panel || !gUnsecuredPlusPreviewIcon || !gUnsecuredPlusPreviewText || !gUnsecuredPlusPreviewValue) return;
    if (!IsSettingsWindowVisible()) return;

    var scale = Math.round(Number(MOD_CONFIG.UNSECURED_SOULS_HUD_SCALE));
    if (!isFinite(scale)) scale = 100;
    if (scale < 50) scale = 50;
    if (scale > 200) scale = 200;
    var xOffset = Math.round(Number(MOD_CONFIG.UNSECURED_SOULS_HUD_X_OFFSET));
    if (!isFinite(xOffset)) xOffset = 0;
    if (xOffset < -1000) xOffset = -1000;
    if (xOffset > 2000) xOffset = 2000;
    var yOffset = Math.round(Number(MOD_CONFIG.UNSECURED_SOULS_HUD_Y_OFFSET));
    if (!isFinite(yOffset)) yOffset = 0;
    if (yOffset < 800) yOffset = 800;
    if (yOffset > 2000) yOffset = 2000;

    var showIcon = Number(MOD_CONFIG.ENABLE_BETTER_UNSECURED_SHOW_ICON) === 1;
    var showText = Number(MOD_CONFIG.ENABLE_BETTER_UNSECURED_SHOW_TEXT) === 1;
    var fontPx = Math.max(8, Math.min(72, Math.round(14 * (scale / 100))));

    var context = $.GetContextPanel();
    var fallbackX = 780;
    var fallbackY = 120;
    var contextW = Number(context && context.actuallayoutwidth);
    if (isFinite(contextW) && contextW > 0) fallbackX = Math.round(contextW * 0.42);

    var baseX = fallbackX;
    var baseY = fallbackY;
    var anchoredToLive = false;
    var root = FindRootPanel();
    var liveOverlay = root && root.FindChildTraverse ? root.FindChildTraverse("QOLBetterUnsecuredOverlay") : null;
    var liveRect = GetPanelRectRelativeToContext(liveOverlay);
    if (liveRect) {
        baseX = liveRect.x;
        baseY = liveRect.y;
        anchoredToLive = true;
    }

    var targetX = anchoredToLive ? baseX : (baseX + xOffset);
    var unsecuredHudBaselineY = Number(DEFAULT_CONFIG.UNSECURED_SOULS_HUD_Y_OFFSET);
    if (!isFinite(unsecuredHudBaselineY)) unsecuredHudBaselineY = 0;
    var reflectedYOffset = (2 * unsecuredHudBaselineY) - yOffset;
    var targetY = anchoredToLive ? baseY : (baseY + reflectedYOffset);
    SetPreviewPanelPosition(panel, targetX, targetY);
    gUnsecuredPlusPreviewIcon.style.visibility = showIcon ? "visible" : "collapse";
    gUnsecuredPlusPreviewText.style.visibility = showText ? "visible" : "collapse";
    gUnsecuredPlusPreviewText.style.fontSize = String(fontPx) + "px";
    gUnsecuredPlusPreviewValue.style.fontSize = String(fontPx) + "px";
    gUnsecuredPlusPreviewValue.text = "538";

    panel.AddClass("Visible");
    ScheduleHideUnsecuredPlusPreview(1.2);
}


    // ── Preview toggle button wiring ──

function EnsurePreviewToggleButtonContent(btn) {
    if (!btn) return;
    btn.hittest = true;
    btn.hittestchildren = true;
    var hasSwitch = !!btn.FindChildTraverse("PreviewToggleSwitch");
    var hasLabel = !!btn.FindChildTraverse("PreviewToggleLabel");
    if (!hasSwitch || !hasLabel) {
        btn.RemoveAndDeleteChildren();
        var switchPanel = $.CreatePanel("Panel", btn, "PreviewToggleSwitch");
        switchPanel.AddClass("PreviewToggleSwitch");
        switchPanel.hittest = false;
        switchPanel.hittestchildren = false;
        var switchKnob = $.CreatePanel("Panel", switchPanel, "PreviewToggleSwitchKnob");
        switchKnob.AddClass("PreviewToggleSwitchKnob");
        switchKnob.hittest = false;
        switchKnob.hittestchildren = false;
        var label = $.CreatePanel("Label", btn, "PreviewToggleLabel");
        label.text = LocalizeSettingsText("Preview", true);
        label.hittest = false;
        return;
    }
    var switchPanelExisting = btn.FindChildTraverse("PreviewToggleSwitch");
    if (switchPanelExisting) {
        switchPanelExisting.hittest = false;
        switchPanelExisting.hittestchildren = false;
    }
    var switchKnobExisting = btn.FindChildTraverse("PreviewToggleSwitchKnob");
    if (switchKnobExisting) {
        switchKnobExisting.hittest = false;
        switchKnobExisting.hittestchildren = false;
    }
    var labelExisting = btn.FindChildTraverse("PreviewToggleLabel");
    if (labelExisting) {
        labelExisting.text = LocalizeSettingsText("Preview", true);
        labelExisting.hittest = false;
    }
}

function WirePreviewToggleButton(btn) {
    if (!btn) return;
    EnsurePreviewToggleButtonContent(btn);
    btn.SetHasClass("Active", MOD_CONFIG.PREVIEWS_ENABLED === 1);
    btn.SetPanelEvent("onmouseover", function() {
        $.DispatchEvent("UIShowTextTooltip", btn, LocalizeSettingsText("Preview setting changes in realtime.", true));
    });
    btn.SetPanelEvent("onmouseout", function() {
        $.DispatchEvent("UIHideTextTooltip");
    });
    btn.SetPanelEvent("onactivate", function() {
        MOD_CONFIG.PREVIEWS_ENABLED = (MOD_CONFIG.PREVIEWS_ENABLED === 1 ? 0 : 1);
        btn.SetHasClass("Active", MOD_CONFIG.PREVIEWS_ENABLED === 1);
        if (MOD_CONFIG.PREVIEWS_ENABLED !== 1) {
            HideMinimapSizePreview();
        }
        SaveAndSync();
    });
}


    // ── Public API ──
    QOL.preview = {
        // Hide all previews — called from close paths, search render, toggle handlers
        hideAll: HideMinimapSizePreview,
        dispose() { hidePreviews(); previewTree.dispose(); previewContext = null; },
        // Show preview for a config ID — dispatcher called from CreateRow, toggle handlers
        showForConfigId: ShowConfigPreviewForConfigId,
        // Wire a preview toggle button — called from settings UI build
        wirePreviewToggleButton: WirePreviewToggleButton,
        // Schedule hide helpers (used externally)
        scheduleHideMinimapSize: ScheduleHideMinimapSizePreview,
        scheduleHideZoomMinimap: ScheduleHideZoomMinimapPreview,
        scheduleHideZipBoost: ScheduleHideZipBoostPreview,
        scheduleHideCrosshairStats: ScheduleHideCrosshairStatsPreview,
        scheduleHideUnsecuredSouls: ScheduleHideUnsecuredSoulsPreview,
        scheduleHideCompass: ScheduleHideCompassPreview,
        scheduleHideSpeed: ScheduleHideSpeedPreview,
        scheduleHideKeyboardOverlay: ScheduleHideKeyboardOverlayPreview,
        scheduleHideItemCooldown: ScheduleHideItemCooldownPreview,
        // Detection helpers (used by CreateRow)
        isMinimapPreviewConfig: IsMinimapPreviewConfig,
        isZoomMinimapPreviewConfig: IsZoomMinimapPreviewConfig,
        isCrosshairStatsPreviewConfig: IsCrosshairStatsPreviewConfig,
        isCompassPreviewConfig: IsCompassPreviewConfig,
        isSpeedPreviewConfig: IsSpeedPreviewConfig,
        isKeyboardOverlayPreviewConfig: IsKeyboardOverlayPreviewConfig,
        isItemCooldownPreviewConfig: IsItemCooldownPreviewConfig,
        isAmmoPreviewConfig: IsAmmoPreviewConfig,
        isReloadCooldownPreviewConfig: IsReloadCooldownPreviewConfig,
        isUnitTargetPreviewConfig: IsUnitTargetPreviewConfig,
        isDamageReportPreviewConfig: IsDamageReportPreviewConfig,
        isShopPreviewConfig: IsShopPreviewConfig,
        isUnsecuredPlusPreviewConfig: IsUnsecuredPlusPreviewConfig,
        isAdvancedItemCooldownModeEnabled: IsAdvancedItemCooldownModeEnabled
    };
})();

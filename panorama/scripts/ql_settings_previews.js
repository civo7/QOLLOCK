// ql_settings_previews.js — Settings preview panels (minimap size, zoom, zipboost,
// crosshair stats, unsecured souls, compass, speed, keyboard overlay, item cooldown,
// ammo, reload cooldown, unit target, damage report, shop, unsecured plus)
// Extracted from ql_settings.js, Phase 3
(function() {
    'use strict';

    var _deps = QOL.import(["utils"]);
    var Utils = _deps.utils;
    var WarnLog = (Utils && Utils.WarnLog) ? Utils.WarnLog : function(cat, msg) { $.Msg("[QOLLock][WARN][" + cat + "] " + msg); };

    // ── Preview globals ──

var gMinimapSizePreviewPanel = null;
var gMinimapSizePreviewCircle = null;
var gMinimapSizePreviewLabel = null;
var gMinimapSizePreviewHideToken = 0;
var gMinimapPreviewBaseRight = 30;
var gMinimapPreviewBaseBottom = 30;

var gZoomMinimapPreviewPanel = null;
var gZoomMinimapPreviewCircle = null;
var gZoomMinimapPreviewLabel = null;
var gZoomMinimapPreviewHideToken = 0;
var gZoomPreviewBaseX = 0;
var gZoomPreviewBaseY = 0;
var gZoomPreviewMode = "ALT";
var gZipBoostPreviewPanel = null;
var gZipBoostPreviewBox = null;
var gZipBoostPreviewLabel = null;
var gZipBoostPreviewHideToken = 0;
var gZipBoostPreviewBaseX = -520;
var gZipBoostPreviewBaseY = 20;
var gCrosshairStatsPreviewPanel = null;
var gCrosshairStatsPreviewBox = null;
var gCrosshairStatsPreviewLabel = null;
var gCrosshairStatsPreviewHideToken = 0;
var gCrosshairStatsPreviewBaseX = 130;
var gCrosshairStatsPreviewBaseY = 0;
var gUnsecuredSoulsPreviewPanel = null;
var gUnsecuredSoulsPreviewLabel = null;
var gUnsecuredSoulsPreviewHideToken = 0;
var gUnsecuredSoulsPreviewBaseX = -520;
var gUnsecuredSoulsPreviewBaseY = 110;
var gCompassPreviewPanel = null;
var gCompassPreviewBox = null;
var gCompassPreviewLabel = null;
var gCompassPreviewHideToken = 0;
var gCompassPreviewBaseX = 0;
var gCompassPreviewBaseY = 120;
// Speed has its own independent preview panel (mirrors the in-game QOLSpeedRoot,
// a sibling of the compass root — not a child of it).
var gSpeedPreviewPanel = null;
var gSpeedPreviewLabel = null;
var gSpeedPreviewHideToken = 0;
var gKeyboardOverlayPreviewPanel = null;
var gKeyboardOverlayPreviewBox = null;
var gKeyboardOverlayPreviewLabel = null;
var gKeyboardOverlayPreviewHideToken = 0;
var gKeyboardOverlayPreviewBaseX = 150;
var gKeyboardOverlayPreviewBaseY = 300;
var gItemCooldownPreviewPanel = null;
var gItemCooldownPreviewRow = null;
var gItemCooldownPreviewIcon = null;
var gItemCooldownPreviewLabel = null;
var gItemCooldownPreviewHideToken = 0;
var gAmmoPreviewPanel = null;
var gAmmoPreviewCurrentLabel = null;
var gAmmoPreviewTotalLabel = null;
var gAmmoPreviewHideToken = 0;
var gReloadCooldownPreviewPanel = null;
var gReloadCooldownPreviewRing = null;
var gReloadCooldownPreviewLabel = null;
var gReloadCooldownPreviewHideToken = 0;
var gUnitTargetPreviewPanel = null;
var gUnitTargetPreviewImage = null;
var gUnitTargetPreviewBinding = null;
var gUnitTargetPreviewHideToken = 0;
var gDamageReportPreviewPanel = null;
var gDamageReportPreviewBox = null;
var gDamageReportPreviewLabel = null;
var gDamageReportPreviewHideToken = 0;
var gShopPreviewPanel = null;
var gShopPreviewBox = null;
var gShopPreviewLabel = null;
var gShopPreviewHideToken = 0;
var gUnsecuredPlusPreviewPanel = null;
var gUnsecuredPlusPreviewIcon = null;
var gUnsecuredPlusPreviewText = null;
var gUnsecuredPlusPreviewValue = null;
var gUnsecuredPlusPreviewHideToken = 0;

    // ── Preview helpers ──

function SetPreviewPanelPosition(panel, x, y) {
    if (!panel || !panel.style) return;
    var px = Math.round(Number(x) || 0);
    var py = Math.round(Number(y) || 0);
    panel.style.marginLeft = String(px) + "px";
    panel.style.marginTop = String(py) + "px";
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

    var insetByOffset = Number(minimapParent.actualxoffset);
    if (isFinite(insetByOffset) && insetByOffset > 0) {
        return Math.round(insetByOffset);
    }

    var rootWidth = Number(contextRoot.actuallayoutwidth);
    var parentWidth = Number(minimapParent.actuallayoutwidth);
    if (!isFinite(rootWidth) || !isFinite(parentWidth) || rootWidth <= parentWidth || parentWidth <= 0) {
        return 0;
    }
    return Math.round((rootWidth - parentWidth) * 0.5);
}


    // ── Preview panel constructors + config detection ──

function EnsureMinimapSizePreviewPanel() {
    if (gMinimapSizePreviewPanel && gMinimapSizePreviewPanel.IsValid && gMinimapSizePreviewPanel.IsValid()) {
        var anchorParent = GetMinimapPreviewAnchorParent();
        if (anchorParent && gMinimapSizePreviewPanel.GetParent && gMinimapSizePreviewPanel.GetParent() !== anchorParent) {
            gMinimapSizePreviewPanel.SetParent(anchorParent);
        }
        SetPanelNonInteractive(gMinimapSizePreviewPanel);
        SetPanelNonInteractive(gMinimapSizePreviewCircle);
        SetPanelNonInteractive(gMinimapSizePreviewLabel);
        return gMinimapSizePreviewPanel;
    }
    var parent = GetMinimapPreviewAnchorParent();
    if (!parent) return null;

    var panel = parent.FindChildTraverse("MinimapSizePreview");
    if (!panel) {
        panel = $.CreatePanel("Panel", parent, "MinimapSizePreview");
    }
    if (!panel) return null;

    var circle = panel.FindChildTraverse("MinimapSizePreviewCircle");
    if (!circle) {
        circle = $.CreatePanel("Panel", panel, "MinimapSizePreviewCircle");
    }
    var label = panel.FindChildTraverse("MinimapSizePreviewLabel");
    if (!label) {
        label = $.CreatePanel("Label", panel, "MinimapSizePreviewLabel");
    }
    SetPanelNonInteractive(panel);
    SetPanelNonInteractive(circle);
    SetPanelNonInteractive(label);

    gMinimapSizePreviewPanel = panel;
    gMinimapSizePreviewCircle = circle;
    gMinimapSizePreviewLabel = label;
    return panel;
}

function EnsureZoomMinimapPreviewPanel() {
    if (gZoomMinimapPreviewPanel && gZoomMinimapPreviewPanel.IsValid && gZoomMinimapPreviewPanel.IsValid()) {
        SetPanelNonInteractive(gZoomMinimapPreviewPanel);
        SetPanelNonInteractive(gZoomMinimapPreviewCircle);
        SetPanelNonInteractive(gZoomMinimapPreviewLabel);
        return gZoomMinimapPreviewPanel;
    }
    var root = $.GetContextPanel();
    if (!root) return null;

    var panel = root.FindChildTraverse("ZoomMinimapPreview");
    if (!panel) {
        panel = $.CreatePanel("Panel", root, "ZoomMinimapPreview");
    }
    if (!panel) return null;

    var circle = panel.FindChildTraverse("ZoomMinimapPreviewCircle");
    if (!circle) {
        circle = $.CreatePanel("Panel", panel, "ZoomMinimapPreviewCircle");
    }
    var label = panel.FindChildTraverse("ZoomMinimapPreviewLabel");
    if (!label) {
        label = $.CreatePanel("Label", panel, "ZoomMinimapPreviewLabel");
    }
    SetPanelNonInteractive(panel);
    SetPanelNonInteractive(circle);
    SetPanelNonInteractive(label);

    gZoomMinimapPreviewPanel = panel;
    gZoomMinimapPreviewCircle = circle;
    gZoomMinimapPreviewLabel = label;
    return panel;
}

function EnsureZipBoostPreviewPanel() {
    if (gZipBoostPreviewPanel && gZipBoostPreviewPanel.IsValid && gZipBoostPreviewPanel.IsValid()) {
        SetPanelNonInteractive(gZipBoostPreviewPanel);
        SetPanelNonInteractive(gZipBoostPreviewBox);
        SetPanelNonInteractive(gZipBoostPreviewLabel);
        return gZipBoostPreviewPanel;
    }
    var root = $.GetContextPanel();
    if (!root) return null;

    var panel = root.FindChildTraverse("ZipBoostPreview");
    if (!panel) {
        panel = $.CreatePanel("Panel", root, "ZipBoostPreview");
    }
    if (!panel) return null;

    var box = panel.FindChildTraverse("ZipBoostPreviewBox");
    if (!box) {
        box = $.CreatePanel("Panel", panel, "ZipBoostPreviewBox");
    }
    var label = panel.FindChildTraverse("ZipBoostPreviewLabel");
    if (!label) {
        label = $.CreatePanel("Label", box, "ZipBoostPreviewLabel");
        label.text = LocalizeSettingsText("ZIP BOOST", true);
    }
    SetPanelNonInteractive(panel);
    SetPanelNonInteractive(box);
    SetPanelNonInteractive(label);

    gZipBoostPreviewPanel = panel;
    gZipBoostPreviewBox = box;
    gZipBoostPreviewLabel = label;
    return panel;
}

// Build one preview row that is a structural clone of an in-game crosshair-overlay row, using the
// overlay's own classes (styled via the ql_feat_crosshair_stats import in ql_settings.css) so it
// matches pixel-for-pixel: a dark pill with a colored left accent, a property icon, and a value.
function CreateCrosshairStatsPreviewStatRow(box, idSuffix, iconClass, valueText, isDebuff) {
    var row = box.FindChildTraverse("CrosshairStatsPreviewRow_" + idSuffix);
    if (!row) {
        row = $.CreatePanel("Panel", box, "CrosshairStatsPreviewRow_" + idSuffix);
        row.AddClass("QOLCrosshairStatRow");
        row.AddClass(isDebuff ? "isDebuff" : "isBuff");
        var icon = $.CreatePanel("Panel", row, "CrosshairStatsPreviewIcon_" + idSuffix);
        icon.AddClass("QOLCrosshairStatIcon");
        icon.AddClass("statIcon");
        icon.AddClass("PropertiesIcon");
        icon.AddClass(iconClass);
        var value = $.CreatePanel("Label", row, "CrosshairStatsPreviewValue_" + idSuffix);
        value.AddClass("QOLCrosshairStatValue");
        value.text = valueText;
    }
    SetPanelNonInteractive(row);
    return row;
}

function EnsureCrosshairStatsPreviewPanel() {
    if (gCrosshairStatsPreviewPanel && gCrosshairStatsPreviewPanel.IsValid && gCrosshairStatsPreviewPanel.IsValid()) {
        SetPanelNonInteractive(gCrosshairStatsPreviewPanel);
        SetPanelNonInteractive(gCrosshairStatsPreviewBox);
        SetPanelNonInteractive(gCrosshairStatsPreviewLabel);
        return gCrosshairStatsPreviewPanel;
    }
    var root = $.GetContextPanel();
    if (!root) return null;

    var panel = root.FindChildTraverse("CrosshairStatsPreview");
    if (!panel) {
        panel = $.CreatePanel("Panel", root, "CrosshairStatsPreview");
    }
    if (!panel) return null;

    var box = panel.FindChildTraverse("CrosshairStatsPreviewBox");
    if (!box) {
        box = $.CreatePanel("Panel", panel, "CrosshairStatsPreviewBox");
    }
    var label = panel.FindChildTraverse("CrosshairStatsPreviewLabel");
    if (!label) {
        label = $.CreatePanel("Label", box, "CrosshairStatsPreviewLabel");
        label.text = LocalizeSettingsText("ACTIVE STATS", true);
    }
    // Real copy of the in-game overlay rows (ql_feat_crosshairstats.js builds the same structure):
    //   .QOLCrosshairStatRow[.isDebuff|.isBuff] > .QOLCrosshairStatIcon.statIcon.PropertiesIcon.<Stat> + .QOLCrosshairStatValue
    CreateCrosshairStatsPreviewStatRow(box, "fireRate",     "FireRate",     "−15%", true);
    CreateCrosshairStatsPreviewStatRow(box, "moveSpeed",    "MoveSpeed",    "−1.8 m/s", true);
    CreateCrosshairStatsPreviewStatRow(box, "bulletResist", "ResistBullet", "+20%", false);
    SetPanelNonInteractive(panel);
    SetPanelNonInteractive(box);
    SetPanelNonInteractive(label);

    gCrosshairStatsPreviewPanel = panel;
    gCrosshairStatsPreviewBox = box;
    gCrosshairStatsPreviewLabel = label;
    return panel;
}

function EnsureUnsecuredSoulsPreviewPanel() {
    if (gUnsecuredSoulsPreviewPanel && gUnsecuredSoulsPreviewPanel.IsValid && gUnsecuredSoulsPreviewPanel.IsValid()) {
        SetPanelNonInteractive(gUnsecuredSoulsPreviewPanel);
        SetPanelNonInteractive(gUnsecuredSoulsPreviewLabel);
        return gUnsecuredSoulsPreviewPanel;
    }
    var root = $.GetContextPanel();
    if (!root) return null;

    var panel = root.FindChildTraverse("UnsecuredSoulsPreview");
    if (!panel) {
        panel = $.CreatePanel("Panel", root, "UnsecuredSoulsPreview");
    }
    if (!panel) return null;

    var label = panel.FindChildTraverse("UnsecuredSoulsPreviewLabel");
    if (!label) {
        label = $.CreatePanel("Label", panel, "UnsecuredSoulsPreviewLabel");
        label.text = "23s";
    }
    SetPanelNonInteractive(panel);
    SetPanelNonInteractive(label);

    gUnsecuredSoulsPreviewPanel = panel;
    gUnsecuredSoulsPreviewLabel = label;
    return panel;
}

function EnsureCompassPreviewPanel() {
    if (gCompassPreviewPanel && gCompassPreviewPanel.IsValid && gCompassPreviewPanel.IsValid()) {
        SetPanelNonInteractive(gCompassPreviewPanel);
        SetPanelNonInteractive(gCompassPreviewBox);
        SetPanelNonInteractive(gCompassPreviewLabel);
        return gCompassPreviewPanel;
    }
    var root = $.GetContextPanel();
    if (!root) return null;

    var panel = root.FindChildTraverse("CompassPreview");
    if (!panel) {
        panel = $.CreatePanel("Panel", root, "CompassPreview");
    }
    if (!panel) return null;

    var box = panel.FindChildTraverse("CompassPreviewBox");
    if (!box) {
        box = $.CreatePanel("Panel", panel, "CompassPreviewBox");
    }

    var label = panel.FindChildTraverse("CompassPreviewLabel");
    if (!label) {
        label = $.CreatePanel("Label", panel, "CompassPreviewLabel");
    }

    SetPanelNonInteractive(panel);
    SetPanelNonInteractive(box);
    SetPanelNonInteractive(label);

    gCompassPreviewPanel = panel;
    gCompassPreviewBox = box;
    gCompassPreviewLabel = label;
    return panel;
}

// Speed preview — an independent panel (sibling of the compass preview),
// mirroring the in-game QOLSpeedRoot which is its own root panel under the
// gameplay HUD, NOT a child of the compass. Keeping the two previews separate
// is what makes the speed offset behave consistently with the compass offset.
function EnsureSpeedPreviewPanel() {
    if (gSpeedPreviewPanel && gSpeedPreviewPanel.IsValid && gSpeedPreviewPanel.IsValid()) {
        SetPanelNonInteractive(gSpeedPreviewPanel);
        SetPanelNonInteractive(gSpeedPreviewLabel);
        return gSpeedPreviewPanel;
    }
    var root = $.GetContextPanel();
    if (!root) return null;

    var panel = root.FindChildTraverse("SpeedPreview");
    if (!panel) {
        panel = $.CreatePanel("Panel", root, "SpeedPreview");
    }
    if (!panel) return null;

    var label = panel.FindChildTraverse("SpeedPreviewLabel");
    if (!label) {
        label = $.CreatePanel("Label", panel, "SpeedPreviewLabel");
    }

    SetPanelNonInteractive(panel);
    SetPanelNonInteractive(label);

    gSpeedPreviewPanel = panel;
    gSpeedPreviewLabel = label;
    return panel;
}

function EnsureKeyboardOverlayPreviewPanel() {
    if (gKeyboardOverlayPreviewPanel && gKeyboardOverlayPreviewPanel.IsValid && gKeyboardOverlayPreviewPanel.IsValid()) {
        SetPanelNonInteractive(gKeyboardOverlayPreviewPanel);
        SetPanelNonInteractive(gKeyboardOverlayPreviewBox);
        SetPanelNonInteractive(gKeyboardOverlayPreviewLabel);
        return gKeyboardOverlayPreviewPanel;
    }
    var root = $.GetContextPanel();
    if (!root) return null;

    var panel = root.FindChildTraverse("KeyboardOverlayPreview");
    if (!panel) {
        panel = $.CreatePanel("Panel", root, "KeyboardOverlayPreview");
    }
    if (!panel) return null;

    var box = panel.FindChildTraverse("KeyboardOverlayPreviewBox");
    if (!box) {
        box = $.CreatePanel("Panel", panel, "KeyboardOverlayPreviewBox");
    }

    var sample = panel.FindChildTraverse("KeyboardOverlayPreviewSample");
    if (!sample) {
        sample = $.CreatePanel("Panel", box, "KeyboardOverlayPreviewSample");
        sample.AddClass("KeyboardOverlayPreviewRow");

        var k1 = $.CreatePanel("Panel", sample, "");
        k1.AddClass("KeyboardOverlayPreviewKey");
        k1.AddClass("Wide");

        var k2 = $.CreatePanel("Panel", sample, "");
        k2.AddClass("KeyboardOverlayPreviewKey");

        var k3 = $.CreatePanel("Panel", sample, "");
        k3.AddClass("KeyboardOverlayPreviewKey");

        var k4 = $.CreatePanel("Panel", sample, "");
        k4.AddClass("KeyboardOverlayPreviewKey");
        k4.AddClass("Wide");

        var k5 = $.CreatePanel("Panel", sample, "");
        k5.AddClass("KeyboardOverlayPreviewKey");
        k5.AddClass("Spacer");
    }

    var label = panel.FindChildTraverse("KeyboardOverlayPreviewLabel");
    if (!label) {
        label = $.CreatePanel("Label", box, "KeyboardOverlayPreviewLabel");
    }
    SetPanelNonInteractive(panel);
    SetPanelNonInteractive(box);
    SetPanelNonInteractive(sample);
    SetPanelNonInteractive(label);

    gKeyboardOverlayPreviewPanel = panel;
    gKeyboardOverlayPreviewBox = box;
    gKeyboardOverlayPreviewLabel = label;
    return panel;
}

function EnsureItemCooldownPreviewPanel() {
    if (gItemCooldownPreviewPanel && gItemCooldownPreviewPanel.IsValid && gItemCooldownPreviewPanel.IsValid()) {
        SetPanelNonInteractive(gItemCooldownPreviewPanel);
        SetPanelNonInteractive(gItemCooldownPreviewRow);
        SetPanelNonInteractive(gItemCooldownPreviewIcon);
        SetPanelNonInteractive(gItemCooldownPreviewLabel);
        return gItemCooldownPreviewPanel;
    }
    var root = $.GetContextPanel();
    if (!root) return null;

    var panel = root.FindChildTraverse("ItemCooldownPreview");
    if (!panel) {
        panel = $.CreatePanel("Panel", root, "ItemCooldownPreview");
    }
    if (!panel) return null;

    var row = panel.FindChildTraverse("ItemCooldownPreviewRow");
    if (!row) {
        row = $.CreatePanel("Panel", panel, "ItemCooldownPreviewRow");
    }

    var icon = panel.FindChildTraverse("ItemCooldownPreviewIcon");
    if (!icon) {
        icon = $.CreatePanel("Panel", row, "ItemCooldownPreviewIcon");
    }

    var modContainer = panel.FindChildTraverse("ItemCooldownPreviewModContainer");
    if (!modContainer) {
        modContainer = $.CreatePanel("Panel", icon, "ItemCooldownPreviewModContainer");
    }

    var bg = panel.FindChildTraverse("ItemCooldownPreviewBg");
    if (!bg) {
        bg = $.CreatePanel("Panel", modContainer, "ItemCooldownPreviewBg");
    }

    var image = panel.FindChildTraverse("ItemCooldownPreviewImage");
    if (!image) {
        image = $.CreatePanel("Panel", modContainer, "ItemCooldownPreviewImage");
    }

    var mask = panel.FindChildTraverse("ItemCooldownPreviewMask");
    if (!mask) {
        mask = $.CreatePanel("Panel", modContainer, "ItemCooldownPreviewMask");
    }

    var label = panel.FindChildTraverse("ItemCooldownPreviewLabel");
    if (!label) {
        label = $.CreatePanel("Label", icon, "ItemCooldownPreviewLabel");
        label.text = "7";
    }
    SetPanelNonInteractive(panel);
    SetPanelNonInteractive(row);
    SetPanelNonInteractive(icon);
    SetPanelNonInteractive(modContainer);
    SetPanelNonInteractive(bg);
    SetPanelNonInteractive(image);
    SetPanelNonInteractive(mask);
    SetPanelNonInteractive(label);

    gItemCooldownPreviewPanel = panel;
    gItemCooldownPreviewRow = row;
    gItemCooldownPreviewIcon = icon;
    gItemCooldownPreviewLabel = label;
    return panel;
}

function EnsureAmmoPreviewPanel() {
    if (gAmmoPreviewPanel && gAmmoPreviewPanel.IsValid && gAmmoPreviewPanel.IsValid()) {
        SetPanelNonInteractive(gAmmoPreviewPanel);
        SetPanelNonInteractive(gAmmoPreviewCurrentLabel);
        SetPanelNonInteractive(gAmmoPreviewTotalLabel);
        return gAmmoPreviewPanel;
    }
    var root = $.GetContextPanel();
    if (!root) return null;

    var panel = root.FindChildTraverse("AmmoPreview");
    if (!panel) panel = $.CreatePanel("Panel", root, "AmmoPreview");
    if (!panel) return null;

    var currentLabel = panel.FindChildTraverse("AmmoPreviewCurrent");
    if (!currentLabel) currentLabel = $.CreatePanel("Label", panel, "AmmoPreviewCurrent");
    var totalLabel = panel.FindChildTraverse("AmmoPreviewTotal");
    if (!totalLabel) totalLabel = $.CreatePanel("Label", panel, "AmmoPreviewTotal");

    SetPanelNonInteractive(panel);
    SetPanelNonInteractive(currentLabel);
    SetPanelNonInteractive(totalLabel);

    gAmmoPreviewPanel = panel;
    gAmmoPreviewCurrentLabel = currentLabel;
    gAmmoPreviewTotalLabel = totalLabel;
    return panel;
}

function EnsureReloadCooldownPreviewPanel() {
    if (gReloadCooldownPreviewPanel && gReloadCooldownPreviewPanel.IsValid && gReloadCooldownPreviewPanel.IsValid()) {
        SetPanelNonInteractive(gReloadCooldownPreviewPanel);
        SetPanelNonInteractive(gReloadCooldownPreviewRing);
        SetPanelNonInteractive(gReloadCooldownPreviewLabel);
        return gReloadCooldownPreviewPanel;
    }
    var root = $.GetContextPanel();
    if (!root) return null;

    var panel = root.FindChildTraverse("ReloadCooldownPreview");
    if (!panel) panel = $.CreatePanel("Panel", root, "ReloadCooldownPreview");
    if (!panel) return null;

    var ring = panel.FindChildTraverse("ReloadCooldownPreviewRing");
    if (!ring) ring = $.CreatePanel("Panel", panel, "ReloadCooldownPreviewRing");
    var label = panel.FindChildTraverse("ReloadCooldownPreviewLabel");
    if (!label) label = $.CreatePanel("Label", ring, "ReloadCooldownPreviewLabel");
    if (label && !label.text) label.text = "1.3";

    SetPanelNonInteractive(panel);
    SetPanelNonInteractive(ring);
    SetPanelNonInteractive(label);

    gReloadCooldownPreviewPanel = panel;
    gReloadCooldownPreviewRing = ring;
    gReloadCooldownPreviewLabel = label;
    return panel;
}

function EnsureUnitTargetPreviewPanel() {
    if (gUnitTargetPreviewPanel && gUnitTargetPreviewPanel.IsValid && gUnitTargetPreviewPanel.IsValid()) {
        SetPanelNonInteractive(gUnitTargetPreviewPanel);
        SetPanelNonInteractive(gUnitTargetPreviewImage);
        SetPanelNonInteractive(gUnitTargetPreviewBinding);
        return gUnitTargetPreviewPanel;
    }
    var root = $.GetContextPanel();
    if (!root) return null;

    var panel = root.FindChildTraverse("UnitTargetPreview");
    if (!panel) panel = $.CreatePanel("Panel", root, "UnitTargetPreview");
    if (!panel) return null;

    var image = panel.FindChildTraverse("UnitTargetPreviewImage");
    if (!image) image = $.CreatePanel("Panel", panel, "UnitTargetPreviewImage");
    var binding = panel.FindChildTraverse("UnitTargetPreviewBinding");
    if (!binding) binding = $.CreatePanel("Label", panel, "UnitTargetPreviewBinding");
    if (binding) binding.text = "Q";

    SetPanelNonInteractive(panel);
    SetPanelNonInteractive(image);
    SetPanelNonInteractive(binding);

    gUnitTargetPreviewPanel = panel;
    gUnitTargetPreviewImage = image;
    gUnitTargetPreviewBinding = binding;
    return panel;
}

function EnsureDamageReportPreviewPanel() {
    if (gDamageReportPreviewPanel && gDamageReportPreviewPanel.IsValid && gDamageReportPreviewPanel.IsValid()) {
        SetPanelNonInteractive(gDamageReportPreviewPanel);
        SetPanelNonInteractive(gDamageReportPreviewBox);
        SetPanelNonInteractive(gDamageReportPreviewLabel);
        return gDamageReportPreviewPanel;
    }
    var root = $.GetContextPanel();
    if (!root) return null;

    var panel = root.FindChildTraverse("DamageReportPreview");
    if (!panel) panel = $.CreatePanel("Panel", root, "DamageReportPreview");
    if (!panel) return null;

    var box = panel.FindChildTraverse("DamageReportPreviewBox");
    if (!box) box = $.CreatePanel("Panel", panel, "DamageReportPreviewBox");
    var label = panel.FindChildTraverse("DamageReportPreviewLabel");
    if (!label) label = $.CreatePanel("Label", box, "DamageReportPreviewLabel");
    if (label && !label.text) label.text = "DAMAGE REPORT";

    SetPanelNonInteractive(panel);
    SetPanelNonInteractive(box);
    SetPanelNonInteractive(label);

    gDamageReportPreviewPanel = panel;
    gDamageReportPreviewBox = box;
    gDamageReportPreviewLabel = label;
    return panel;
}

function EnsureShopPreviewPanel() {
    if (gShopPreviewPanel && gShopPreviewPanel.IsValid && gShopPreviewPanel.IsValid()) {
        SetPanelNonInteractive(gShopPreviewPanel);
        SetPanelNonInteractive(gShopPreviewBox);
        SetPanelNonInteractive(gShopPreviewLabel);
        return gShopPreviewPanel;
    }
    var root = $.GetContextPanel();
    if (!root) return null;

    var panel = root.FindChildTraverse("ShopPreview");
    if (!panel) panel = $.CreatePanel("Panel", root, "ShopPreview");
    if (!panel) return null;

    var box = panel.FindChildTraverse("ShopPreviewBox");
    if (!box) box = $.CreatePanel("Panel", panel, "ShopPreviewBox");
    var label = panel.FindChildTraverse("ShopPreviewLabel");
    if (!label) label = $.CreatePanel("Label", box, "ShopPreviewLabel");
    if (label && !label.text) label.text = "SHOP";

    SetPanelNonInteractive(panel);
    SetPanelNonInteractive(box);
    SetPanelNonInteractive(label);

    gShopPreviewPanel = panel;
    gShopPreviewBox = box;
    gShopPreviewLabel = label;
    return panel;
}

function EnsureUnsecuredPlusPreviewPanel() {
    if (gUnsecuredPlusPreviewPanel && gUnsecuredPlusPreviewPanel.IsValid && gUnsecuredPlusPreviewPanel.IsValid()) {
        SetPanelNonInteractive(gUnsecuredPlusPreviewPanel);
        SetPanelNonInteractive(gUnsecuredPlusPreviewIcon);
        SetPanelNonInteractive(gUnsecuredPlusPreviewText);
        SetPanelNonInteractive(gUnsecuredPlusPreviewValue);
        return gUnsecuredPlusPreviewPanel;
    }
    var root = $.GetContextPanel();
    if (!root) return null;

    var panel = root.FindChildTraverse("UnsecuredPlusPreview");
    if (!panel) panel = $.CreatePanel("Panel", root, "UnsecuredPlusPreview");
    if (!panel) return null;

    var icon = panel.FindChildTraverse("UnsecuredPlusPreviewIcon");
    if (!icon) icon = $.CreatePanel("Panel", panel, "UnsecuredPlusPreviewIcon");
    var text = panel.FindChildTraverse("UnsecuredPlusPreviewText");
    if (!text) text = $.CreatePanel("Label", panel, "UnsecuredPlusPreviewText");
    var value = panel.FindChildTraverse("UnsecuredPlusPreviewValue");
    if (!value) value = $.CreatePanel("Label", panel, "UnsecuredPlusPreviewValue");
    if (text && !text.text) text.text = "UNSECURED";
    if (value && !value.text) value.text = "538";

    SetPanelNonInteractive(panel);
    SetPanelNonInteractive(icon);
    SetPanelNonInteractive(text);
    SetPanelNonInteractive(value);

    gUnsecuredPlusPreviewPanel = panel;
    gUnsecuredPlusPreviewIcon = icon;
    gUnsecuredPlusPreviewText = text;
    gUnsecuredPlusPreviewValue = value;
    return panel;
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
    return configId === "ZIP_BOOST_X_OFFSET" ||
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
    return configId === "COMPASS_SCALE" ||
        configId === "COMPASS_X_OFFSET" ||
        configId === "COMPASS_Y_OFFSET" ||
        configId === "COMPASS_STRETCH_X" ||
        configId === "COMPASS_STRETCH_Y";
}

function IsSpeedPreviewConfig(configId) {
    return configId === "COMPASS_SPEED_X_OFFSET" ||
        configId === "COMPASS_SPEED_Y_OFFSET";
}

function IsKeyboardOverlayPreviewConfig(configId) {
    return configId === "KEYBOARD_OVERLAY_SCALE" ||
        configId === "KEYBOARD_OVERLAY_X_OFFSET" ||
        configId === "KEYBOARD_OVERLAY_Y_OFFSET";
}

function IsItemCooldownPreviewConfig(configId) {
    return configId === "PASSIVE_COOLDOWN_SIZE" ||
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
    return configId === "UNSECURED_SOULS_HUD_SCALE" ||
        configId === "UNSECURED_SOULS_HUD_X_OFFSET" ||
        configId === "UNSECURED_SOULS_HUD_Y_OFFSET" ||
        configId === "ENABLE_BETTER_UNSECURED_SHOW_ICON" ||
        configId === "ENABLE_BETTER_UNSECURED_SHOW_TEXT";
}

    // ── Preview hide/show functions ──

function HideMinimapSizePreview() {
    if (gMinimapSizePreviewPanel && gMinimapSizePreviewPanel.IsValid && gMinimapSizePreviewPanel.IsValid()) {
        gMinimapSizePreviewPanel.RemoveClass("Visible");
    }
    if (gZoomMinimapPreviewPanel && gZoomMinimapPreviewPanel.IsValid && gZoomMinimapPreviewPanel.IsValid()) {
        gZoomMinimapPreviewPanel.RemoveClass("Visible");
    }
    if (gZipBoostPreviewPanel && gZipBoostPreviewPanel.IsValid && gZipBoostPreviewPanel.IsValid()) {
        gZipBoostPreviewPanel.RemoveClass("Visible");
    }
    if (gCrosshairStatsPreviewPanel && gCrosshairStatsPreviewPanel.IsValid && gCrosshairStatsPreviewPanel.IsValid()) {
        gCrosshairStatsPreviewPanel.RemoveClass("Visible");
    }
    if (gUnsecuredSoulsPreviewPanel && gUnsecuredSoulsPreviewPanel.IsValid && gUnsecuredSoulsPreviewPanel.IsValid()) {
        gUnsecuredSoulsPreviewPanel.RemoveClass("Visible");
    }
    if (gCompassPreviewPanel && gCompassPreviewPanel.IsValid && gCompassPreviewPanel.IsValid()) {
        gCompassPreviewPanel.RemoveClass("Visible");
    }
    if (gSpeedPreviewPanel && gSpeedPreviewPanel.IsValid && gSpeedPreviewPanel.IsValid()) {
        gSpeedPreviewPanel.RemoveClass("Visible");
    }
    if (gKeyboardOverlayPreviewPanel && gKeyboardOverlayPreviewPanel.IsValid && gKeyboardOverlayPreviewPanel.IsValid()) {
        gKeyboardOverlayPreviewPanel.RemoveClass("Visible");
    }
    if (gItemCooldownPreviewPanel && gItemCooldownPreviewPanel.IsValid && gItemCooldownPreviewPanel.IsValid()) {
        gItemCooldownPreviewPanel.RemoveClass("Visible");
    }
    if (gAmmoPreviewPanel && gAmmoPreviewPanel.IsValid && gAmmoPreviewPanel.IsValid()) {
        gAmmoPreviewPanel.RemoveClass("Visible");
    }
    if (gReloadCooldownPreviewPanel && gReloadCooldownPreviewPanel.IsValid && gReloadCooldownPreviewPanel.IsValid()) {
        gReloadCooldownPreviewPanel.RemoveClass("Visible");
    }
    if (gUnitTargetPreviewPanel && gUnitTargetPreviewPanel.IsValid && gUnitTargetPreviewPanel.IsValid()) {
        gUnitTargetPreviewPanel.RemoveClass("Visible");
    }
    if (gDamageReportPreviewPanel && gDamageReportPreviewPanel.IsValid && gDamageReportPreviewPanel.IsValid()) {
        gDamageReportPreviewPanel.RemoveClass("Visible");
    }
    if (gShopPreviewPanel && gShopPreviewPanel.IsValid && gShopPreviewPanel.IsValid()) {
        gShopPreviewPanel.RemoveClass("Visible");
    }
    if (gUnsecuredPlusPreviewPanel && gUnsecuredPlusPreviewPanel.IsValid && gUnsecuredPlusPreviewPanel.IsValid()) {
        gUnsecuredPlusPreviewPanel.RemoveClass("Visible");
    }
}

function ScheduleHideMinimapSizePreview(delaySec) {
    gMinimapSizePreviewHideToken++;
    var token = gMinimapSizePreviewHideToken;
    $.Schedule(delaySec, function() {
        if (token !== gMinimapSizePreviewHideToken) return;
        HideMinimapSizePreview();
    });
}

function ScheduleHideZoomMinimapPreview(delaySec) {
    gZoomMinimapPreviewHideToken++;
    var token = gZoomMinimapPreviewHideToken;
    $.Schedule(delaySec, function() {
        if (token !== gZoomMinimapPreviewHideToken) return;
        if (gZoomMinimapPreviewPanel && gZoomMinimapPreviewPanel.IsValid && gZoomMinimapPreviewPanel.IsValid()) {
            gZoomMinimapPreviewPanel.RemoveClass("Visible");
        }
    });
}

function ScheduleHideZipBoostPreview(delaySec) {
    gZipBoostPreviewHideToken++;
    var token = gZipBoostPreviewHideToken;
    $.Schedule(delaySec, function() {
        if (token !== gZipBoostPreviewHideToken) return;
        if (gZipBoostPreviewPanel && gZipBoostPreviewPanel.IsValid && gZipBoostPreviewPanel.IsValid()) {
            gZipBoostPreviewPanel.RemoveClass("Visible");
        }
    });
}

function ScheduleHideCrosshairStatsPreview(delaySec) {
    gCrosshairStatsPreviewHideToken++;
    var token = gCrosshairStatsPreviewHideToken;
    $.Schedule(delaySec, function() {
        if (token !== gCrosshairStatsPreviewHideToken) return;
        if (gCrosshairStatsPreviewPanel && gCrosshairStatsPreviewPanel.IsValid && gCrosshairStatsPreviewPanel.IsValid()) {
            gCrosshairStatsPreviewPanel.RemoveClass("Visible");
        }
    });
}

function ScheduleHideUnsecuredSoulsPreview(delaySec) {
    gUnsecuredSoulsPreviewHideToken++;
    var token = gUnsecuredSoulsPreviewHideToken;
    $.Schedule(delaySec, function() {
        if (token !== gUnsecuredSoulsPreviewHideToken) return;
        if (gUnsecuredSoulsPreviewPanel && gUnsecuredSoulsPreviewPanel.IsValid && gUnsecuredSoulsPreviewPanel.IsValid()) {
            gUnsecuredSoulsPreviewPanel.RemoveClass("Visible");
        }
    });
}

function ScheduleHideCompassPreview(delaySec) {
    gCompassPreviewHideToken++;
    var token = gCompassPreviewHideToken;
    $.Schedule(delaySec, function() {
        if (token !== gCompassPreviewHideToken) return;
        if (gCompassPreviewPanel && gCompassPreviewPanel.IsValid && gCompassPreviewPanel.IsValid()) {
            gCompassPreviewPanel.RemoveClass("Visible");
        }
    });
}

function ScheduleHideSpeedPreview(delaySec) {
    gSpeedPreviewHideToken++;
    var token = gSpeedPreviewHideToken;
    $.Schedule(delaySec, function() {
        if (token !== gSpeedPreviewHideToken) return;
        if (gSpeedPreviewPanel && gSpeedPreviewPanel.IsValid && gSpeedPreviewPanel.IsValid()) {
            gSpeedPreviewPanel.RemoveClass("Visible");
        }
    });
}

function ScheduleHideKeyboardOverlayPreview(delaySec) {
    gKeyboardOverlayPreviewHideToken++;
    var token = gKeyboardOverlayPreviewHideToken;
    $.Schedule(delaySec, function() {
        if (token !== gKeyboardOverlayPreviewHideToken) return;
        if (gKeyboardOverlayPreviewPanel && gKeyboardOverlayPreviewPanel.IsValid && gKeyboardOverlayPreviewPanel.IsValid()) {
            gKeyboardOverlayPreviewPanel.RemoveClass("Visible");
        }
    });
}

function ScheduleHideItemCooldownPreview(delaySec) {
    gItemCooldownPreviewHideToken++;
    var token = gItemCooldownPreviewHideToken;
    $.Schedule(delaySec, function() {
        if (token !== gItemCooldownPreviewHideToken) return;
        if (gItemCooldownPreviewPanel && gItemCooldownPreviewPanel.IsValid && gItemCooldownPreviewPanel.IsValid()) {
            gItemCooldownPreviewPanel.RemoveClass("Visible");
        }
    });
}

function ScheduleHideAmmoPreview(delaySec) {
    gAmmoPreviewHideToken++;
    var token = gAmmoPreviewHideToken;
    $.Schedule(delaySec, function() {
        if (token !== gAmmoPreviewHideToken) return;
        if (gAmmoPreviewPanel && gAmmoPreviewPanel.IsValid && gAmmoPreviewPanel.IsValid()) {
            gAmmoPreviewPanel.RemoveClass("Visible");
        }
    });
}

function ScheduleHideReloadCooldownPreview(delaySec) {
    gReloadCooldownPreviewHideToken++;
    var token = gReloadCooldownPreviewHideToken;
    $.Schedule(delaySec, function() {
        if (token !== gReloadCooldownPreviewHideToken) return;
        if (gReloadCooldownPreviewPanel && gReloadCooldownPreviewPanel.IsValid && gReloadCooldownPreviewPanel.IsValid()) {
            gReloadCooldownPreviewPanel.RemoveClass("Visible");
        }
    });
}

function ScheduleHideUnitTargetPreview(delaySec) {
    gUnitTargetPreviewHideToken++;
    var token = gUnitTargetPreviewHideToken;
    $.Schedule(delaySec, function() {
        if (token !== gUnitTargetPreviewHideToken) return;
        if (gUnitTargetPreviewPanel && gUnitTargetPreviewPanel.IsValid && gUnitTargetPreviewPanel.IsValid()) {
            gUnitTargetPreviewPanel.RemoveClass("Visible");
        }
    });
}

function ScheduleHideDamageReportPreview(delaySec) {
    gDamageReportPreviewHideToken++;
    var token = gDamageReportPreviewHideToken;
    $.Schedule(delaySec, function() {
        if (token !== gDamageReportPreviewHideToken) return;
        if (gDamageReportPreviewPanel && gDamageReportPreviewPanel.IsValid && gDamageReportPreviewPanel.IsValid()) {
            gDamageReportPreviewPanel.RemoveClass("Visible");
        }
    });
}

function ScheduleHideShopPreview(delaySec) {
    gShopPreviewHideToken++;
    var token = gShopPreviewHideToken;
    $.Schedule(delaySec, function() {
        if (token !== gShopPreviewHideToken) return;
        if (gShopPreviewPanel && gShopPreviewPanel.IsValid && gShopPreviewPanel.IsValid()) {
            gShopPreviewPanel.RemoveClass("Visible");
        }
    });
}

function ScheduleHideUnsecuredPlusPreview(delaySec) {
    gUnsecuredPlusPreviewHideToken++;
    var token = gUnsecuredPlusPreviewHideToken;
    $.Schedule(delaySec, function() {
        if (token !== gUnsecuredPlusPreviewHideToken) return;
        if (gUnsecuredPlusPreviewPanel && gUnsecuredPlusPreviewPanel.IsValid && gUnsecuredPlusPreviewPanel.IsValid()) {
            gUnsecuredPlusPreviewPanel.RemoveClass("Visible");
        }
    });
}

function ShowMinimapSizePreview(sizePx) {
    if (MOD_CONFIG.PREVIEWS_ENABLED !== 1) {
        HideMinimapSizePreview();
        return;
    }
    var panel = EnsureMinimapSizePreviewPanel();
    if (!panel || !gMinimapSizePreviewCircle || !gMinimapSizePreviewLabel) return;

    var win = $.GetContextPanel().FindChildTraverse("SettingsWindow");
    if (!win || !win.BHasClass || !win.BHasClass("Visible")) return;

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
    var rightInset = GetMinimapPreviewRightInsetPx();
    panel.style.marginRight = (gMinimapPreviewBaseRight - xOffset + rightInset) + "px";
    panel.style.marginBottom = (gMinimapPreviewBaseBottom + yOffset) + "px";
    gMinimapSizePreviewLabel.text = sizeVal + " px";
    panel.AddClass("Visible");
    ScheduleHideMinimapSizePreview(1.2);
}

function ShowZoomMinimapPreview(mode, sizePx) {
    if (MOD_CONFIG.PREVIEWS_ENABLED !== 1) {
        HideMinimapSizePreview();
        return;
    }
    if (typeof mode !== "string") {
        sizePx = mode;
        mode = gZoomPreviewMode;
    }
    mode = (mode === "TAB") ? "TAB" : "ALT";
    gZoomPreviewMode = mode;
    var keys = GetZoomConfigKeysForMode(mode);

    var panel = EnsureZoomMinimapPreviewPanel();
    if (!panel || !gZoomMinimapPreviewCircle || !gZoomMinimapPreviewLabel) return;

    var win = $.GetContextPanel().FindChildTraverse("SettingsWindow");
    if (!win || !win.BHasClass || !win.BHasClass("Visible")) return;

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
    ScheduleHideZoomMinimapPreview(1.2);
}

function ShowZipBoostPreview() {
    if (MOD_CONFIG.PREVIEWS_ENABLED !== 1) {
        HideMinimapSizePreview();
        return;
    }
    var panel = EnsureZipBoostPreviewPanel();
    if (!panel || !gZipBoostPreviewBox || !gZipBoostPreviewLabel) return;

    var win = $.GetContextPanel().FindChildTraverse("SettingsWindow");
    if (!win || !win.BHasClass || !win.BHasClass("Visible")) return;

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
    ScheduleHideZipBoostPreview(1.2);
}

function ShowCrosshairStatsPreview() {
    if (MOD_CONFIG.PREVIEWS_ENABLED !== 1) {
        HideMinimapSizePreview();
        return;
    }
    var panel = EnsureCrosshairStatsPreviewPanel();
    if (!panel || !gCrosshairStatsPreviewBox || !gCrosshairStatsPreviewLabel) return;

    var win = $.GetContextPanel().FindChildTraverse("SettingsWindow");
    if (!win || !win.BHasClass || !win.BHasClass("Visible")) return;

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
    ScheduleHideCrosshairStatsPreview(1.2);
}

function ShowUnsecuredSoulsPreview() {
    if (MOD_CONFIG.PREVIEWS_ENABLED !== 1) {
        HideMinimapSizePreview();
        return;
    }
    var panel = EnsureUnsecuredSoulsPreviewPanel();
    if (!panel || !gUnsecuredSoulsPreviewLabel) return;

    var win = $.GetContextPanel().FindChildTraverse("SettingsWindow");
    if (!win || !win.BHasClass || !win.BHasClass("Visible")) return;

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
    gUnsecuredSoulsPreviewLabel.text = enabled ? "23s" : "SAFE";
    panel.AddClass("Visible");
    ScheduleHideUnsecuredSoulsPreview(1.2);
}

function ShowConfigPreviewForConfigId(configId) {
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
    var panel = EnsureCompassPreviewPanel();
    if (!panel || !gCompassPreviewBox) return;

    var win = $.GetContextPanel().FindChildTraverse("SettingsWindow");
    if (!win || !win.BHasClass || !win.BHasClass("Visible")) return;

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
    ScheduleHideCompassPreview(1.2);
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
    var panel = EnsureSpeedPreviewPanel();
    if (!panel || !gSpeedPreviewLabel) return;

    var win = $.GetContextPanel().FindChildTraverse("SettingsWindow");
    if (!win || !win.BHasClass || !win.BHasClass("Visible")) return;

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

    // Right half / right-aligned when the compass shares the screen; full-width
    // centered when alone. Same as core's speedLabel layout.
    gSpeedPreviewLabel.style.width = showCompass ? "50%" : "100%";
    gSpeedPreviewLabel.style.textAlign = showCompass ? "right" : "center";
    gSpeedPreviewLabel.style.horizontalAlign = showCompass ? "right" : "center";

    // Root spans the box width and centers on it, so "right half" maps to the
    // box's right half — no boxWidth/2 shift. +Y moves up (marginTop = base - y).
    var rootWidth = (showCompass ? boxWidth : 200) + "px";
    var speedBaseX = showCompass ? compassOffsetX : 0;
    var speedBaseY = showCompass ? (appliedCompassOffsetY + boxHeight + 14) : compassBaselineY;

    panel.style.width = rootWidth;
    panel.style.marginLeft = Math.round(speedBaseX + speedOffsetX) + "px";
    panel.style.marginTop = Math.round(speedBaseY - speedOffsetY) + "px";
    gSpeedPreviewLabel.text = "SPD";

    panel.AddClass("Visible");
    ScheduleHideSpeedPreview(1.2);
}

function ShowKeyboardOverlayPreview() {
    if (MOD_CONFIG.PREVIEWS_ENABLED !== 1) {
        HideMinimapSizePreview();
        return;
    }
    var panel = EnsureKeyboardOverlayPreviewPanel();
    if (!panel || !gKeyboardOverlayPreviewBox || !gKeyboardOverlayPreviewLabel) return;

    var win = $.GetContextPanel().FindChildTraverse("SettingsWindow");
    if (!win || !win.BHasClass || !win.BHasClass("Visible")) return;

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
    ScheduleHideKeyboardOverlayPreview(1.2);
}

function ShowItemCooldownPreview() {
    if (MOD_CONFIG.PREVIEWS_ENABLED !== 1) {
        HideMinimapSizePreview();
        return;
    }
    var panel = EnsureItemCooldownPreviewPanel();
    if (!panel || !gItemCooldownPreviewRow || !gItemCooldownPreviewIcon) return;

    var win = $.GetContextPanel().FindChildTraverse("SettingsWindow");
    if (!win || !win.BHasClass || !win.BHasClass("Visible")) return;

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
    ScheduleHideItemCooldownPreview(1.2);
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
    gDamageReportPreviewLabel.text = isDisabled ? "HIDDEN" : "DAMAGE REPORT";
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
    panel.style.preTransformScale2d = scale.toFixed(2) + ", " + scale.toFixed(2);
    gShopPreviewLabel.text = "SHOP";
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

    // ── Hero hint publisher ──

function PublishHeroHintFromSettings() {
    // GameInterfaceAPI confirmed absent — hero hint publishing from settings unavailable.
    // Hero detection relies on HUD-side UI panel scanning.
}

function StartHeroHintPublisher() {
    function tick() {
        // Only publish hero hints while the settings window is open.
        // No point running this poll when the player can't see the settings UI.
        if (IsSettingsWindowVisible()) {
            try { PublishHeroHintFromSettings(); } catch(e0) { WarnLog("settings", "op failed: " + (e0 && e0.message ? e0.message : String(e0 || ""))); }
        }
        $.Schedule(HERO_HINT_PUBLISH_INTERVAL_SEC, tick);
    }
    tick();
}

    // ── Public API ──
    QOL.preview = {
        // Hide all previews — called from close paths, search render, toggle handlers
        hideAll: HideMinimapSizePreview,
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
        isAdvancedItemCooldownModeEnabled: IsAdvancedItemCooldownModeEnabled,
        // Hero hint
        startHeroHintPublisher: StartHeroHintPublisher
    };
})();

// ==========================================================================
// ql_bridge.js — QOLLOCK typed cross-context channel descriptors
// ==========================================================================
// Provides: single source of truth for all HUD↔Settings panel attribute channels.
// 18 constants previously duplicated across ql_core.js and ql_settings.js are
// now defined ONCE here, plus a typed channel descriptor map and safe
// read/write helpers with uniform error handling.
//
// Publishes to: QOL.bridge, bare globals
// Loads AFTER:  ql_utils.js, ql_shared_presets.js
// Loads BEFORE: ql_state.js, ql_config.js, ql_core.js, ql_settings.js
// Depends on:  QOL_STORAGE_KEY, QOL_USER_EDIT_REV_ATTR, QOL_PANEL_ID_HUD
//              (all from ql_shared_presets.js)
// ==========================================================================

'use strict';

// ── Bare-global constants (file scope — visible to both HUD and Settings contexts) ──

var STORAGE_KEY = QOL_STORAGE_KEY;
var PLAYER_HEALTHBAR_ACCENT_COLOR_STORAGE_KEY = "qol_player_healthbar_accent_color";
var PLAYER_HEALTHBAR_ACCENT_COLOR_ATTR = "QOL_PLAYER_HEALTHBAR_ACCENT_COLOR";
var BOTTOM_BAR_WASH_COLOR_ATTR = "QOL_BOTTOM_BAR_WASH_COLOR";
var KEYBOARD_OVERLAY_WASH_COLOR_ATTR = "QOL_KEYBOARD_OVERLAY_WASH_COLOR";
var STAMINA_CHARGE_COLOR_ATTR = "QOL_STAMINA_CHARGE_COLOR";
var AMMO_TEXT_COLOR_ATTR = "QOL_AMMO_TEXT_COLOR";
var MINIMAP_ICON_COLOR_ATTR = "QOL_MINIMAP_ICON_COLOR";
var USER_EDIT_REV_ATTR = QOL_USER_EDIT_REV_ATTR;
var BUILD_SAVE_REQUEST_ATTR = "QOL_BUILD_SAVE_REQUEST";
var BUILD_SAVE_STATE_ATTR = "QOL_BUILD_SAVE_STATE";
var BUILD_SAVE_MSG_ATTR = "QOL_BUILD_SAVE_MSG";
var BUILD_SAVE_TOKEN_ATTR = "QOL_BUILD_SAVE_TOKEN";
// Set to "1" by the settings UI to authorize a save even though this session
// could not read the stored config. Consumed on use — see
// IsBuildSaveAllowedByLoadState in features/ql_feat_buildsave.js.
var BUILD_SAVE_FORCE_ATTR = "QOL_BUILD_SAVE_FORCE";
var BUILD_CLEAR_REQUEST_ATTR = "QOL_BUILD_CLEAR_REQUEST";
var BUILD_CLEAR_STATE_ATTR = "QOL_BUILD_CLEAR_STATE";
var BUILD_CLEAR_MSG_ATTR = "QOL_BUILD_CLEAR_MSG";
var BUILD_CLEAR_TOKEN_ATTR = "QOL_BUILD_CLEAR_TOKEN";
var HERO_HINT_ATTR = "QOL_LAST_SELECTED_HERO_HINT";

// ── Channel descriptor map (single source of truth for all cross-context channels) ──

var QOL_BRIDGE_CHANNELS = {
    "config":              { attr: STORAGE_KEY,                               type: "json",        desc: "Full config envelope {schema, data}" },
    "configRev":           { attr: USER_EDIT_REV_ATTR,                        type: "int",         desc: "Monotonic revision counter" },
    "buildSaveRequest":    { attr: BUILD_SAVE_REQUEST_ATTR,                   type: "string",      desc: "Build category payload" },
    "buildSaveState":      { attr: BUILD_SAVE_STATE_ATTR,                     type: "string",      desc: "Pending or empty" },
    "buildSaveMsg":        { attr: BUILD_SAVE_MSG_ATTR,                       type: "string",      desc: "Progress message" },
    "buildSaveToken":      { attr: BUILD_SAVE_TOKEN_ATTR,                     type: "string",      desc: "Correlation token" },
    "buildSaveForce":      { attr: BUILD_SAVE_FORCE_ATTR,                     type: "flag",        desc: "1 to overwrite an unread config" },
    "buildClearRequest":   { attr: BUILD_CLEAR_REQUEST_ATTR,                  type: "flag",        desc: "1 to trigger" },
    "buildClearState":     { attr: BUILD_CLEAR_STATE_ATTR,                    type: "string",      desc: "Pending or empty" },
    "buildClearMsg":       { attr: BUILD_CLEAR_MSG_ATTR,                      type: "string",      desc: "Progress message" },
    "buildClearToken":     { attr: BUILD_CLEAR_TOKEN_ATTR,                    type: "string",      desc: "Correlation token" },
    "heroHint":            { attr: HERO_HINT_ATTR,                            type: "string",      desc: "Hero ID" },
    "healthbarAccentColor":{ attr: PLAYER_HEALTHBAR_ACCENT_COLOR_ATTR,        type: "paletteIndex", customRgb: true, desc: "palette index or tagged RGB" },
    "bottomBarWashColor":  { attr: BOTTOM_BAR_WASH_COLOR_ATTR,                type: "paletteIndex", customRgb: true, desc: "palette index or tagged RGB" },
    "keyboardOverlayWashColor": { attr: KEYBOARD_OVERLAY_WASH_COLOR_ATTR,     type: "paletteIndex", customRgb: true, desc: "palette index or tagged RGB" },
    "staminaChargeColor":  { attr: STAMINA_CHARGE_COLOR_ATTR,                 type: "paletteIndex", customRgb: true, desc: "palette index or tagged RGB" },
    "ammoTextColor":       { attr: AMMO_TEXT_COLOR_ATTR,                      type: "paletteIndex", customRgb: true, desc: "palette index or tagged RGB" },
    "minimapIconColor":    { attr: MINIMAP_ICON_COLOR_ATTR,                   type: "paletteIndex", customRgb: true, desc: "palette index or tagged RGB" },
    "healthbarAccentColorStorage": { attr: PLAYER_HEALTHBAR_ACCENT_COLOR_STORAGE_KEY, type: "string", desc: "Accent color storage key" }
};

// ── Reverse lookup (attr name → channel name) ──

var QOL_BRIDGE_ATTR_TO_CHANNEL = {};
(function() {
    for (var _ch in QOL_BRIDGE_CHANNELS) {
        if (QOL_BRIDGE_CHANNELS.hasOwnProperty(_ch)) {
            QOL_BRIDGE_ATTR_TO_CHANNEL[QOL_BRIDGE_CHANNELS[_ch].attr] = _ch;
        }
    }
})();

// ── Low-level safe attribute read/write ──

function QOLBridgeReadAttr(panel, attrName, fallback) {
    if (typeof QOL_UTILS !== "undefined" && QOL_UTILS.SafeGetAttribute) {
        return QOL_UTILS.SafeGetAttribute(panel, attrName, fallback);
    }
    if (!panel || !panel.GetAttributeString) return fallback !== undefined ? fallback : "";
    try {
        return String(panel.GetAttributeString(attrName, fallback !== undefined ? String(fallback) : "") || "");
    } catch (e) { return fallback !== undefined ? fallback : ""; }
}

function QOLBridgeWriteAttr(panel, attrName, value) {
    if (typeof QOL_UTILS !== "undefined" && QOL_UTILS.SafeSetAttribute) {
        return QOL_UTILS.SafeSetAttribute(panel, attrName, value);
    }
    if (!panel || !panel.SetAttributeString) return false;
    try {
        panel.SetAttributeString(attrName, String(value != null ? value : ""));
        return true;
    } catch (e) { return false; }
}

// ── Typed channel read (channel name → typed value) ──

function QOLBridgeRead(channelName, rootPanel) {
    var chan = QOL_BRIDGE_CHANNELS[channelName];
    if (!chan) return null;
    var raw = "";
    if (rootPanel) {
        raw = QOLBridgeReadAttr(rootPanel, chan.attr);
        if (!raw) {
            var hud = (rootPanel.FindChildTraverse) ? rootPanel.FindChildTraverse(QOL_PANEL_ID_HUD) : null;
            if (hud) raw = QOLBridgeReadAttr(hud, chan.attr);
        }
    }
    // Type coercion
    if (chan.type === "int") {
        var n = Number(raw);
        return isFinite(n) ? Math.floor(n) : 0;
    }
    if (chan.type === "flag") return raw === "1";
    if (chan.type === "paletteIndex") {
        var pi = Math.round(Number(raw));
        return (isFinite(pi) && pi >= 0) ? pi : 0;
    }
    return String(raw || "");
}

// ── Typed channel write (channel name + value → writes to root + hud) ──

function QOLBridgeWrite(channelName, value, rootPanel) {
    var chan = QOL_BRIDGE_CHANNELS[channelName];
    if (!chan) return false;
    var outVal = "";
    if (chan.type === "int") {
        var n = Math.floor(Number(value));
        outVal = isFinite(n) ? String(n) : "0";
    } else if (chan.type === "flag") {
        outVal = value ? "1" : "";
    } else if (chan.type === "paletteIndex") {
        var pi = Math.round(Number(value));
        if (!isFinite(pi) || pi < 0) pi = 0;
        if (pi > 29 && !(chan.customRgb && QOL_UTILS.IsCustomColor(pi))) pi = 29;
        outVal = String(pi);
    } else {
        outVal = String(value != null ? value : "");
    }
    var wrote = 0;
    if (rootPanel && rootPanel.SetAttributeString) {
        if (QOLBridgeWriteAttr(rootPanel, chan.attr, outVal)) wrote++;
        var hud = null;
        try { hud = rootPanel.FindChildTraverse ? rootPanel.FindChildTraverse(QOL_PANEL_ID_HUD) : null; } catch (e) { hud = null; }
        if (hud && hud.SetAttributeString && QOLBridgeWriteAttr(hud, chan.attr, outVal)) wrote++;
    }
    return wrote > 0;
}

// ── Publish to QOL namespace ──

if (typeof QOL === "undefined") { var QOL = {}; }
QOL.bridge = {
    channels: QOL_BRIDGE_CHANNELS,
    attrToChannel: QOL_BRIDGE_ATTR_TO_CHANNEL,
    read: QOLBridgeRead,
    write: QOLBridgeWrite,
    readAttr: QOLBridgeReadAttr,
    writeAttr: QOLBridgeWriteAttr
};

if (typeof QOL_UTILS === "object" && QOL_UTILS) {
    QOL.readKeyboardOverlayWashColorIndex = QOL_UTILS.ReadKeyboardOverlayWashColorIndex;
    QOL.readMinimapIconColorIndex = QOL_UTILS.ReadMinimapIconColorIndex;
    QOL.readPlayerHealthbarAccentColorIndex = QOL_UTILS.ReadPlayerHealthbarAccentColorIndex;
    QOL.readBottomBarWashColorIndex = QOL_UTILS.ReadBottomBarWashColorIndex;
    QOL.readStaminaChargeColorIndex = QOL_UTILS.ReadStaminaChargeColorIndex;
    QOL.readAmmoTextColorIndex = QOL_UTILS.ReadAmmoTextColorIndex;
    QOL.readPaletteColorIndexWithPanelAttr = QOL_UTILS.ReadPaletteColorIndexWithPanelAttr;
    QOL.normalizePaletteColorIndex = QOL_UTILS.NormalizePaletteColorIndex;
    QOL.resolveWashColorFromPalette = QOL_UTILS.ResolveWashColorFromPalette;
    QOL.washColorPalette = QOL_UTILS.QOL_WASH_COLOR_PALETTE;
}

// ── Self-test ──

(function() {
    try {
        if (typeof STORAGE_KEY !== "string" || STORAGE_KEY.length === 0) throw new Error("STORAGE_KEY not defined");
        if (typeof BUILD_SAVE_REQUEST_ATTR !== "string") throw new Error("BUILD_SAVE_REQUEST_ATTR not defined");
        if (typeof HERO_HINT_ATTR !== "string") throw new Error("HERO_HINT_ATTR not defined");
        if (typeof QOL_BRIDGE_CHANNELS !== "object" || QOL_BRIDGE_CHANNELS === null) throw new Error("QOL_BRIDGE_CHANNELS not defined");
        if (typeof QOLBridgeReadAttr !== "function") throw new Error("QOLBridgeReadAttr not defined");
        if (typeof QOLBridgeWriteAttr !== "function") throw new Error("QOLBridgeWriteAttr not defined");
        if (typeof QOLBridgeRead !== "function") throw new Error("QOLBridgeRead not defined");
        if (typeof QOLBridgeWrite !== "function") throw new Error("QOLBridgeWrite not defined");
        if (typeof QOL.bridge !== "object" || QOL.bridge === null) throw new Error("QOL.bridge not published");
        // Verify every channel has attr + type + desc
        var _channelCount = 0;
        for (var _ch2 in QOL_BRIDGE_CHANNELS) {
            if (QOL_BRIDGE_CHANNELS.hasOwnProperty(_ch2)) {
                _channelCount++;
                var _c = QOL_BRIDGE_CHANNELS[_ch2];
                if (typeof _c.attr !== "string" || _c.attr.length === 0) throw new Error("Channel '" + _ch2 + "' missing attr");
                if (typeof _c.type !== "string") throw new Error("Channel '" + _ch2 + "' missing type");
                if (typeof _c.desc !== "string") throw new Error("Channel '" + _ch2 + "' missing desc");
            }
        }
        if (_channelCount !== 19) throw new Error("Expected 19 channels, got " + _channelCount);

        if (typeof $ !== "undefined" && $.Msg) {
            $.Msg("[QOL DEBUG] ql_bridge.js self-test passed: " + _channelCount + " channels");
        }
    } catch (e) {
        if (typeof $ !== "undefined" && $.Msg) {
            $.Msg("[QOLLock][ERROR][ql_bridge] self-test failed: " + (e && e.message ? e.message : String(e)));
        }
    }
})();

// ql_feat_healthbar_accent.js — Player healthbar accent color subsystem
// Extracted from ql_feat_healthbar.js, Phase 11 Step 3a
(function() {
    'use strict';
    var _featureId = "ql_feat_healthbar_accent";
    // DEPENDS: state, utils, getCachedPanel, setCachedPanel, resolveWashColorFromPalette, setWashColorSafe, normalizePaletteColorIndex
    var _deps = QOL.import(["state", "utils", "getCachedPanel", "setCachedPanel",
        "resolveWashColorFromPalette", "setWashColorSafe",
        "normalizePaletteColorIndex"
    ]);

    var State = _deps.state;
    var Utils = _deps.utils;
    var GetCachedPanel = _deps.getCachedPanel;
    var SetCachedPanel = _deps.setCachedPanel;
    var IsPanelValid = Utils.IsPanelValid;
    var SetStyleSafe = Utils.SetStyleSafe;
    var SetWashColorSafe = _deps.setWashColorSafe;
    var NormalizePaletteColorIndex = _deps.normalizePaletteColorIndex;
    var ResolveWashColorFromPalette = _deps.resolveWashColorFromPalette;

    // ── Functions ──

    function ReadPlayerHealthbarAccentColorIndex(cfg) {
        return NormalizePaletteColorIndex(cfg && cfg.PLAYER_HEALTHBAR_ACCENT_COLOR);
    }

    function ResetPlayerHealthbarAccentColorRuntime() {
        State.playerHealthbarAccentColorToken = (Number(State.playerHealthbarAccentColorToken) || 0) + 1;
        var panels = State.playerHealthbarAccentColorPanels || [];
        for (var i = 0; i < panels.length; i++) {
            if (IsPanelValid(panels[i])) {
                SetWashColorSafe(panels[i], "");
            }
        }
        State.playerHealthbarAccentColorPanels = [];
        State.playerHealthbarAccentColorSig = "";
    }

    function PushAccentColorTarget(list, panel) {
        if (!IsPanelValid(panel)) return;
        for (var i = 0; i < list.length; i++) {
            if (list[i] === panel) return;
        }
        list.push(panel);
    }

    function FindPlayerHealthbarAccentColorPanels(root, healthContainer) {
        var targets = [];
        if (healthContainer && healthContainer.FindChildTraverse) {
            PushAccentColorTarget(targets, healthContainer.FindChildTraverse("health_bar_frame"));
        }
        if (healthContainer && healthContainer.FindChildrenWithClassTraverse) {
            var backers = healthContainer.FindChildrenWithClassTraverse("healthBacker") || [];
            for (var i = 0; i < backers.length; i++) {
                PushAccentColorTarget(targets, backers[i]);
            }
        }
        if (targets.length === 0 && root && root.FindChildTraverse) {
            PushAccentColorTarget(targets, root.FindChildTraverse("health_bar_frame"));
        }
        if (targets.length <= 1 && root && root.FindChildrenWithClassTraverse) {
            var rootBackers = root.FindChildrenWithClassTraverse("healthBacker") || [];
            for (var j = 0; j < rootBackers.length; j++) {
                PushAccentColorTarget(targets, rootBackers[j]);
            }
        }
        return targets;
    }

    function ApplyPlayerHealthbarAccentColor(root, cfg, healthContainer) {
        var panels = FindPlayerHealthbarAccentColorPanels(root, healthContainer);
        var colorIndex = ReadPlayerHealthbarAccentColorIndex(cfg);
        var color = ResolveWashColorFromPalette(colorIndex);
        var idParts = [];
        for (var i = 0; i < panels.length; i++) {
            idParts.push(String(panels[i].id || "healthBacker"));
        }
        var styleSig = idParts.join(",") + "|" + color;

        var oldPanels = State.playerHealthbarAccentColorPanels || [];
        for (var oldIndex = 0; oldIndex < oldPanels.length; oldIndex++) {
            var stillTargeted = false;
            for (var newIndex = 0; newIndex < panels.length; newIndex++) {
                if (oldPanels[oldIndex] === panels[newIndex]) {
                    stillTargeted = true;
                    break;
                }
            }
            if (!stillTargeted && IsPanelValid(oldPanels[oldIndex])) {
                SetWashColorSafe(oldPanels[oldIndex], "");
            }
        }

        if (panels.length === 0) {
            State.playerHealthbarAccentColorToken = (Number(State.playerHealthbarAccentColorToken) || 0) + 1;
            State.playerHealthbarAccentColorPanels = [];
            State.playerHealthbarAccentColorSig = "";
            return;
        }

        if (State.playerHealthbarAccentColorSig === styleSig) {
            return;
        }
        State.playerHealthbarAccentColorToken = (Number(State.playerHealthbarAccentColorToken) || 0) + 1;
        var applyToken = State.playerHealthbarAccentColorToken;
        for (var applyIndex = 0; applyIndex < panels.length; applyIndex++) {
            SetWashColorSafe(panels[applyIndex], "");
        }
        State.playerHealthbarAccentColorPanels = panels;
        State.playerHealthbarAccentColorSig = styleSig;
        if (color) {
            $.Schedule(0.01, function() {
                if (State.playerHealthbarAccentColorToken !== applyToken || State.playerHealthbarAccentColorSig !== styleSig) {
                    return;
                }
                for (var delayedIndex = 0; delayedIndex < panels.length; delayedIndex++) {
                    if (IsPanelValid(panels[delayedIndex])) {
                        SetWashColorSafe(panels[delayedIndex], color);
                    }
                }
            });
        }
    }

    // ── Publish bridge functions for coreRoot access (moved from ql_feat_healthbar.js) ──
    try {
        QOL.resolvePlayerHealthbarAccentColorIndex = ReadPlayerHealthbarAccentColorIndex;
    } catch(e) { $.Msg("[QOLLock][WARN][" + _featureId + "] could not publish resolvePlayerHealthbarAccentColorIndex"); }
    try {
        QOL.applyPlayerHealthbarAccentColor = ApplyPlayerHealthbarAccentColor;
    } catch(e) { $.Msg("[QOLLock][WARN][" + _featureId + "] could not publish applyPlayerHealthbarAccentColor"); }

    // ── QOL.healthbar.accent module ──
    try {
        QOL.healthbar = QOL.healthbar || {};
        QOL.healthbar.accent = {
            update: ApplyPlayerHealthbarAccentColor,
            reset: ResetPlayerHealthbarAccentColorRuntime,
            readIndex: ReadPlayerHealthbarAccentColorIndex
        };
    } catch(e) { $.Msg("[QOLLock][WARN][" + _featureId + "] could not publish QOL.healthbar.accent"); }

    // ── Self-test ──
    try {
        if (typeof ApplyPlayerHealthbarAccentColor !== "function") throw new Error("ApplyPlayerHealthbarAccentColor missing");
        if (typeof ResetPlayerHealthbarAccentColorRuntime !== "function") throw new Error("ResetPlayerHealthbarAccentColorRuntime missing");
        if (typeof QOL.healthbar.accent !== "object") throw new Error("QOL.healthbar.accent not published");
    } catch(e) {
        $.Msg("[QOLLock][ERROR][" + _featureId + "] self-test: " + (e && e.message ? e.message : String(e)));
    }
})();

// ql_feat_betterunsecuredhud.js — Unsecured Plus live-panel runtime
(function() {
    "use strict";

    var FEATURE_ID = "ql_feat_betterunsecuredhud";
    var runtime = {
        panel: null,
        host: null,
        originalParent: null,
        originalPreviousSibling: null,
        originalNextSibling: null,
        originalPanelStyle: null,
        icon: null,
        originalIconVisibility: "",
        text: null,
        originalTextVisibility: "",
        lastSig: ""
    };
    var PANEL_STYLE_NAMES = [
        "horizontalAlign", "verticalAlign", "ignoreParentFlow",
        "marginLeft", "marginRight", "marginTop", "marginBottom",
        "x", "y", "uiScale", "zIndex"
    ];

    function IsPanelValid(panel) {
        try {
            if (QOL.utils && QOL.utils.IsPanelValid) return QOL.utils.IsPanelValid(panel);
        } catch(e) {}
        return !!(panel && panel.IsValid && panel.IsValid());
    }

    function IsCfgEnabled(cfg, key) {
        return Number(cfg && cfg[key]) === 1;
    }

    function ClampNumber(value, fallback, min, max) {
        var number = Number(value);
        if (!isFinite(number)) number = fallback;
        number = Math.round(number);
        if (number < min) number = min;
        if (number > max) number = max;
        return number;
    }

    function IsDescendantOf(panel, ancestor) {
        if (!IsPanelValid(panel) || !IsPanelValid(ancestor)) return false;
        var current = panel;
        var guard = 0;
        while (current && guard < 96) {
            if (current === ancestor) return true;
            current = current.GetParent ? current.GetParent() : null;
            guard++;
        }
        return false;
    }

    function FindGameplayHud(root) {
        try {
            if (QOL.getGameplayHudPanel) {
                var delegated = QOL.getGameplayHudPanel(root);
                if (IsPanelValid(delegated)) return delegated;
            }
        } catch(e) {}
        if (!root || !root.FindChildTraverse) return null;
        var host = root.FindChildTraverse("gameplay_hud");
        return IsPanelValid(host) ? host : null;
    }

    function FindLiveUnsecuredPanel(root, host) {
        if (IsPanelValid(runtime.panel) && runtime.host === host && IsDescendantOf(runtime.panel, host)) {
            return runtime.panel;
        }
        var searchRoot = IsPanelValid(host) ? host : root;
        if (!searchRoot || !searchRoot.FindChildTraverse) return null;

        var panel = searchRoot.FindChildTraverse("HudUnsecuredLabelContainer");
        if (IsPanelValid(panel)) return panel;

        var label = searchRoot.FindChildTraverse("HudUnsecuredLabel");
        if (!IsPanelValid(label)) label = searchRoot.FindChildTraverse("hudUnsecuredLabel");
        if (IsPanelValid(label) && label.GetParent) {
            panel = label.GetParent();
            if (IsPanelValid(panel)) return panel;
        }
        return null;
    }

    function CapturePanelStyle(panel) {
        var result = {};
        for (var i = 0; i < PANEL_STYLE_NAMES.length; i++) {
            var name = PANEL_STYLE_NAMES[i];
            try { result[name] = panel.style[name]; } catch(e) { result[name] = ""; }
        }
        return result;
    }

    function RestorePanelStyle(panel, values) {
        if (!IsPanelValid(panel) || !values) return;
        for (var i = 0; i < PANEL_STYLE_NAMES.length; i++) {
            var name = PANEL_STYLE_NAMES[i];
            try { panel.style[name] = values[name] == null ? "" : values[name]; } catch(e) {}
        }
    }

    function CaptureSiblings(panel, parent) {
        var result = { previous: null, next: null };
        if (!parent || !parent.GetChildCount || !parent.GetChild) return result;
        var count = Number(parent.GetChildCount()) || 0;
        for (var i = 0; i < count; i++) {
            if (parent.GetChild(i) !== panel) continue;
            if (i > 0) result.previous = parent.GetChild(i - 1);
            if (i + 1 < count) result.next = parent.GetChild(i + 1);
            break;
        }
        return result;
    }

    function FindOptionalChild(panel, ids) {
        if (!panel || !panel.FindChildTraverse) return null;
        for (var i = 0; i < ids.length; i++) {
            var child = panel.FindChildTraverse(ids[i]);
            if (IsPanelValid(child)) return child;
        }
        return null;
    }

    function ClearRuntime() {
        runtime.panel = null;
        runtime.host = null;
        runtime.originalParent = null;
        runtime.originalPreviousSibling = null;
        runtime.originalNextSibling = null;
        runtime.originalPanelStyle = null;
        runtime.icon = null;
        runtime.originalIconVisibility = "";
        runtime.text = null;
        runtime.originalTextVisibility = "";
        runtime.lastSig = "";
    }

    function RestoreNativePanel() {
        var panel = runtime.panel;
        var parent = runtime.originalParent;
        if (IsPanelValid(panel)) {
            if (IsPanelValid(parent) && panel.GetParent && panel.GetParent() !== parent && panel.SetParent) {
                try { panel.SetParent(parent); } catch(e) {}
            }
            if (IsPanelValid(parent) && panel.GetParent && panel.GetParent() === parent) {
                var next = runtime.originalNextSibling;
                var previous = runtime.originalPreviousSibling;
                if (IsPanelValid(next) && next.GetParent && next.GetParent() === parent && parent.MoveChildBefore) {
                    try { parent.MoveChildBefore(panel, next); } catch(e0) {}
                } else if (IsPanelValid(previous) && previous.GetParent && previous.GetParent() === parent && parent.MoveChildAfter) {
                    try { parent.MoveChildAfter(panel, previous); } catch(e1) {}
                }
            }
            RestorePanelStyle(panel, runtime.originalPanelStyle);
        }
        if (IsPanelValid(runtime.icon)) {
            try { runtime.icon.style.visibility = runtime.originalIconVisibility; } catch(e2) {}
        }
        if (IsPanelValid(runtime.text)) {
            try { runtime.text.style.visibility = runtime.originalTextVisibility; } catch(e3) {}
        }
        ClearRuntime();
    }

    function MoveNativePanel(panel, host) {
        if (!IsPanelValid(panel) || !IsPanelValid(host) || !panel.GetParent || !panel.SetParent) return false;
        if (runtime.panel === panel && runtime.host === host && panel.GetParent() === host) return true;

        RestoreNativePanel();

        var originalParent = panel.GetParent();
        if (!IsPanelValid(originalParent)) return false;
        var siblings = CaptureSiblings(panel, originalParent);
        var originalStyle = CapturePanelStyle(panel);
        var icon = FindOptionalChild(panel, ["hudDeathGoldIcon", "HudUnsecuredIcon", "hudUnsecuredIcon"]);
        var text = FindOptionalChild(panel, ["hudUnsecuredLabel"]);
        var iconVisibility = "";
        var textVisibility = "";
        if (IsPanelValid(icon)) {
            try { iconVisibility = icon.style.visibility; } catch(e0) {}
        }
        if (IsPanelValid(text)) {
            try { textVisibility = text.style.visibility; } catch(e1) {}
        }

        try { panel.SetParent(host); } catch(e2) { return false; }
        if (panel.GetParent && panel.GetParent() !== host) return false;

        runtime.panel = panel;
        runtime.host = host;
        runtime.originalParent = originalParent;
        runtime.originalPreviousSibling = siblings.previous;
        runtime.originalNextSibling = siblings.next;
        runtime.originalPanelStyle = originalStyle;
        runtime.icon = icon;
        runtime.originalIconVisibility = iconVisibility;
        runtime.text = text;
        runtime.originalTextVisibility = textVisibility;
        runtime.lastSig = "";

        if (host.MoveChildAfter && host.GetChildCount && host.GetChild) {
            var count = Number(host.GetChildCount()) || 0;
            if (count > 0) {
                var last = host.GetChild(count - 1);
                if (last && last !== panel) {
                    try { host.MoveChildAfter(panel, last); } catch(e3) {}
                }
            }
        }
        return true;
    }

    function RemoveObsoleteMirror(root) {
        var mirror = root && root.FindChildTraverse ? root.FindChildTraverse("QOLBetterUnsecuredOverlay") : null;
        if (IsPanelValid(mirror)) mirror.DeleteAsync(0);
        if (root && root.SetHasClass) root.SetHasClass("better_unsecured_ready", false);
    }

    function ApplyLayout(panel, cfg) {
        var scale = ClampNumber(cfg.UNSECURED_SOULS_HUD_SCALE, 100, 50, 200);
        var x = ClampNumber(cfg.UNSECURED_SOULS_HUD_X_OFFSET, 120, -1000, 2000);
        var y = ClampNumber(cfg.UNSECURED_SOULS_HUD_Y_OFFSET, 925, 800, 2000);
        var showBoth = IsCfgEnabled(cfg, "ENABLE_BETTER_UNSECURED_SHOW_ICON_TEXT");
        var showIcon = showBoth || IsCfgEnabled(cfg, "ENABLE_BETTER_UNSECURED_SHOW_ICON");
        var showText = showBoth || IsCfgEnabled(cfg, "ENABLE_BETTER_UNSECURED_SHOW_TEXT");
        var sig = [scale, x, y, showIcon ? 1 : 0, showText ? 1 : 0].join("|");
        if (sig === runtime.lastSig) return;

        panel.style.ignoreParentFlow = "true";
        panel.style.horizontalAlign = "left";
        panel.style.verticalAlign = "top";
        panel.style.marginLeft = "0px";
        panel.style.marginRight = "0px";
        panel.style.marginTop = "0px";
        panel.style.marginBottom = "0px";
        panel.style.x = x + "px";
        panel.style.y = y + "px";
        panel.style.uiScale = scale + "%";
        panel.style.zIndex = "50";
        if (IsPanelValid(runtime.icon)) runtime.icon.style.visibility = showIcon ? "visible" : "collapse";
        if (IsPanelValid(runtime.text)) runtime.text.style.visibility = showText ? "visible" : "collapse";
        runtime.lastSig = sig;
    }

    function Update(root, cfg) {
        RemoveObsoleteMirror(root);
        if (!IsCfgEnabled(cfg, "ENABLE_BETTER_UNSECURED")) {
            RestoreNativePanel();
            return;
        }

        var host = FindGameplayHud(root);
        if (!IsPanelValid(host)) {
            RestoreNativePanel();
            return;
        }
        if (runtime.panel && (!IsPanelValid(runtime.panel) || runtime.host !== host || !IsDescendantOf(runtime.panel, host))) {
            RestoreNativePanel();
        }

        var panel = FindLiveUnsecuredPanel(root, host);
        if (!IsPanelValid(panel)) return;
        if (!MoveNativePanel(panel, host)) return;
        ApplyLayout(panel, cfg);
    }

    function NeedsWork(cfg) {
        return IsCfgEnabled(cfg, "ENABLE_BETTER_UNSECURED") || IsPanelValid(runtime.panel);
    }

    QOL.register("betterUnsecuredHud", {
        configKeys: [
            "ENABLE_BETTER_UNSECURED",
            "UNSECURED_SOULS_HUD_SCALE",
            "UNSECURED_SOULS_HUD_X_OFFSET",
            "UNSECURED_SOULS_HUD_Y_OFFSET",
            "ENABLE_BETTER_UNSECURED_SHOW_ICON_TEXT",
            "ENABLE_BETTER_UNSECURED_SHOW_ICON",
            "ENABLE_BETTER_UNSECURED_SHOW_TEXT"
        ],
        bucket: 7,
        phase: -1,
        perfLabel: "loop.unsecured_souls_hud",
        gate: function(cfg) { return NeedsWork(cfg); },
        update: function(root, cfg) {
            try {
                Update(root, cfg);
            } catch(e) {
                $.Msg("[QOLLock][ERROR][" + FEATURE_ID + "] " + (e && e.message ? e.message : String(e)));
                throw e;
            }
        },
        cleanup: function() { RestoreNativePanel(); },
        stateKeys: []
    });
})();

// ql_feat_crosshairstats.js — Crosshair Active Stats (debuff/buff mirror near crosshair)
// New feature (3.1.7): mirrors the game's CitadelHudActivePlayerStats (#hudPlayerStats)
// active modifiers into a vertical overlay positioned next to the crosshair, so firerate,
// slow, antiheal, resists, etc. are actually visible mid-fight instead of bottom-left.
(function() {
    'use strict';
    var _featureId = "ql_feat_crosshairstats";
    var _deps = QOL.import(["state", "utils", "getCachedPanel", "setCachedPanel", "getGameplayHudPanel"]);
    var State = _deps.state;
    var Utils = _deps.utils;
    var GetCachedPanel = _deps.getCachedPanel;
    var SetCachedPanel = _deps.setCachedPanel;
    var GetGameplayHudPanel = _deps.getGameplayHudPanel;
    var IsCfgEnabled = Utils.IsCfgEnabled;
    var IsPanelValid = Utils.IsPanelValid;

    // ── Constants ──
    // Base placement: to the RIGHT of the crosshair (overlay is screen-centered, margin pushes it).
    var BASE_X = 130;
    var BASE_Y = 0;
    var VALUE_BFS_LIMIT = 200;

    // Game container id -> { key, icon, signed } where `icon` is the PropertiesIcon class
    // variant used by ability_property_icons.vcss_c (spelling mirrors the game XML exactly).
    //
    // `signed: true`  -> the value label is a signed percentage delta (e.g. "-15%", "+20%").
    //                    For these we classify buff/debuff straight from the sign of the value,
    //                    which is ALWAYS correct regardless of the scoreboard/detail-view bug
    //                    that flips the game's isNegative/isPositive classes off-scoreboard.
    // `signed: false` -> the value is an absolute reading (m/s, /sec, raw number) with no usable
    //                    sign, so we fall back to the game's class (best-effort) for those.
    var STAT_DEFS = [
        { id: "fireRateContainer",        key: "fireRate",      icon: "FireRate",                signed: true },
        { id: "speedDisplayContainer",    key: "moveSpeed",     icon: "MoveSpeed",               signed: false },
        { id: "healingAmpContainer",      key: "healAmp",       icon: "HealAmplifcation",        signed: true },
        { id: "bulletResistContainer",    key: "bulletResist",  icon: "ResistBullet",            signed: true },
        { id: "techResistContainer",      key: "techResist",    icon: "ResistSpirit",            signed: true },
        { id: "bulletLifeStealContainer", key: "bulletLifesteal", icon: "HealthStealingBullets", signed: true },
        { id: "techLifeStealContainer",   key: "techLifesteal", icon: "HealthStealingSpirit",    signed: true },
        { id: "weaponPowerContainer",     key: "weaponPower",   icon: "DamageWeapon",            signed: true },
        { id: "spiritContainer",          key: "spirit",        icon: "Spirit",                  signed: false },
        { id: "abilityRangeContainer",    key: "range",         icon: "Range",                   signed: true },
        { id: "abilityDurationContainer", key: "duration",      icon: "Duration",                signed: true },
        { id: "damageAmpContainer",       key: "damageAmp",     icon: "DamageAmplification",     signed: true },
        { id: "clipSizeContainer",        key: "clipSize",      icon: "AmmoClipSize",            signed: false },
        { id: "regenPerSecondContainer",  key: "regen",         icon: "HealthRegen",             signed: false },
        { id: "bulletEvasionContainer",   key: "bulletEvasion", icon: "MoveDodge",               signed: true }
    ];

    function EnsureState() {
        if (!State.crosshairStats) {
            State.crosshairStats = {
                built: false,
                lastLayoutSig: "",
                lastContentSig: "",
                lastVisibleCount: -1,
                rowPanels: {},
                rowValues: {},
                sourceContainers: {}
            };
        }
        return State.crosshairStats;
    }

    // ── Source resolution ──
    function GetPlayerStatsPanel(root) {
        var panel = GetCachedPanel("crosshairStatsSource");
        if (IsPanelValid(panel)) return panel;
        panel = (root && root.FindChildTraverse) ? root.FindChildTraverse("hudPlayerStats") : null;
        SetCachedPanel("crosshairStatsSource", panel);
        return panel;
    }

    function GetSourceContainer(source, def) {
        var st = State.crosshairStats;
        var c = st.sourceContainers[def.key];
        if (IsPanelValid(c)) return c;
        c = (source && source.FindChildTraverse) ? source.FindChildTraverse(def.id) : null;
        st.sourceContainers[def.key] = c || null;
        return c;
    }

    // Read the resolved value text from a modifier container (first non-empty,
    // non-loc-token descendant Label text). Returns "" if none.
    function ReadModifierValueText(container) {
        if (!IsPanelValid(container)) return "";
        var queue = [];
        try { if (container.Children) queue = container.Children() || []; } catch(e) { return ""; }
        queue = queue.slice();
        var guard = 0;
        while (queue.length && guard < VALUE_BFS_LIMIT) {
            var node = queue.shift();
            guard++;
            if (!node) continue;
            try {
                if (typeof node.text === "string") {
                    var t = node.text;
                    if (t && t.length && t.charAt(0) !== "#") return t;
                }
            } catch(e) {}
            try {
                if (node.Children) {
                    var kids = node.Children() || [];
                    for (var i = 0; i < kids.length; i++) queue.push(kids[i]);
                }
            } catch(e) {}
        }
        return "";
    }

    // Classify a value string by its leading sign. Returns -1 (debuff), +1 (buff), 0 (no sign).
    // Handles both ASCII "-" and the Unicode minus "−" (U+2212) the game can emit.
    function ClassifyBySign(valueText) {
        if (!valueText) return 0;
        for (var i = 0; i < valueText.length; i++) {
            var ch = valueText.charAt(i);
            if (ch === "-" || ch === "−") return -1;
            if (ch === "+") return 1;
            if (ch >= "0" && ch <= "9") return 0; // first magnitude digit, no explicit sign
        }
        return 0;
    }

    // Fallback classification from the game's own classes. The game uses both `isNegative`/
    // `isPositive` (generic modifiers) and `IsNegative`/`IsPositive` (speed). This is the
    // signal that misbehaves off-scoreboard, so we only use it for absolute (unsigned) stats.
    function ClassifyByGameClass(container) {
        try {
            if (container.BHasClass("isNegative") || container.BHasClass("IsNegative")) return -1;
            if (container.BHasClass("isPositive") || container.BHasClass("IsPositive")) return 1;
        } catch(e) {}
        return 0;
    }

    // ── Overlay construction ──
    function EnsureOverlay(root) {
        var st = EnsureState();
        var overlay = GetCachedPanel("crosshairStatsOverlay");
        if (IsPanelValid(overlay) && st.built) return overlay;

        overlay = (root && root.FindChildTraverse) ? root.FindChildTraverse("QOLCrosshairStatsOverlay") : null;
        if (!overlay) {
            var parent = GetGameplayHudPanel(root);
            if (!parent) return null;
            overlay = $.CreatePanel("Panel", parent, "QOLCrosshairStatsOverlay", {
                hittest: "false",
                hittestchildren: "false"
            });
        }

        st.rowPanels = {};
        st.rowValues = {};
        for (var s = 0; s < STAT_DEFS.length; s++) {
            var def = STAT_DEFS[s];
            var rowId = "QOLCrosshairStatRow_" + def.key;
            var row = overlay.FindChildTraverse(rowId);
            if (!row) {
                row = $.CreatePanel("Panel", overlay, rowId);
                row.AddClass("QOLCrosshairStatRow");
                var icon = $.CreatePanel("Panel", row, rowId + "_icon");
                icon.AddClass("QOLCrosshairStatIcon");
                icon.AddClass("statIcon");
                icon.AddClass("PropertiesIcon");
                icon.AddClass(def.icon);
                var value = $.CreatePanel("Label", row, rowId + "_value");
                value.AddClass("QOLCrosshairStatValue");
                value.text = "";
            }
            row.style.visibility = "collapse";
            st.rowPanels[def.key] = row;
            st.rowValues[def.key] = row.FindChildTraverse(rowId + "_value");
        }

        st.built = true;
        st.lastLayoutSig = "";
        st.lastContentSig = "";
        st.lastVisibleCount = -1;
        st.sourceContainers = {};
        SetCachedPanel("crosshairStatsOverlay", overlay);
        return overlay;
    }

    function RemoveOverlay(root) {
        var st = EnsureState();
        var overlay = GetCachedPanel("crosshairStatsOverlay");
        if (!IsPanelValid(overlay) && root && root.FindChildTraverse) {
            overlay = root.FindChildTraverse("QOLCrosshairStatsOverlay");
        }
        if (IsPanelValid(overlay)) {
            try { overlay.DeleteAsync(0); } catch(e) {}
        }
        SetCachedPanel("crosshairStatsOverlay", null);
        SetCachedPanel("crosshairStatsSource", null);
        st.built = false;
        st.rowPanels = {};
        st.rowValues = {};
        st.sourceContainers = {};
        st.lastLayoutSig = "";
        st.lastContentSig = "";
        st.lastVisibleCount = -1;
    }

    // ── Update ──
    function UpdateCrosshairStats(root, cfg) {
        var st = EnsureState();

        if (!IsCfgEnabled(cfg, "ENABLE_CROSSHAIR_STATS")) {
            if (st.built || GetCachedPanel("crosshairStatsOverlay")) RemoveOverlay(root);
            return;
        }

        var overlay = EnsureOverlay(root);
        if (!overlay) return;

        var showDebuffs = IsCfgEnabled(cfg, "CROSSHAIR_STATS_SHOW_DEBUFFS");
        var showBuffs = IsCfgEnabled(cfg, "CROSSHAIR_STATS_SHOW_BUFFS");

        // ── Layout (offset / scale / opacity) ──
        var offX = Utils.ClampConfigNumber(cfg.CROSSHAIR_STATS_X_OFFSET, 0, -500, 500, true);
        var offY = Utils.ClampConfigNumber(cfg.CROSSHAIR_STATS_Y_OFFSET, 0, -500, 500, true);
        var scale = Utils.ClampConfigNumber(cfg.CROSSHAIR_STATS_SCALE, 100, 50, 200, true);
        var opacity = Utils.ClampConfigNumber(cfg.CROSSHAIR_STATS_OPACITY, 1, 0, 1, false);
        var layoutSig = offX + "|" + offY + "|" + scale + "|" + opacity;
        if (layoutSig !== st.lastLayoutSig) {
            try { overlay.style.marginLeft = (BASE_X + offX) + "px"; } catch(e) {}
            // Subtract offY so a positive "Vertical Offset" raises the overlay (matches the
            // slider's intuitive up = more direction; previously inverted).
            try { overlay.style.marginTop = (BASE_Y - offY) + "px"; } catch(e) {}
            try { overlay.style.preTransformScale2d = (scale / 100).toFixed(2); } catch(e) {}
            Utils.SetPanelOpacitySafe(overlay, opacity, 1);
            st.lastLayoutSig = layoutSig;
        }

        // ── Content: mirror active modifiers ──
        var source = GetPlayerStatsPanel(root);
        var contentParts = [];
        var visibleCount = 0;
        for (var s = 0; s < STAT_DEFS.length; s++) {
            var def = STAT_DEFS[s];
            var container = source ? GetSourceContainer(source, def) : null;
            var active = false, valueText = "";
            if (IsPanelValid(container)) {
                try { active = container.BHasClass("shouldShow"); } catch(e) { active = false; }
            }
            if (!active) { contentParts.push(""); continue; }

            valueText = ReadModifierValueText(container);
            // Determine buff/debuff. Prefer the value's own sign (scoreboard-bug-proof) for
            // signed-percentage stats; fall back to the game class for absolute stats; default
            // to buff when nothing is conclusive.
            var cls = def.signed ? ClassifyBySign(valueText) : 0;
            if (cls === 0) cls = ClassifyByGameClass(container);
            if (cls === 0) cls = 1;
            var isNeg = (cls < 0);

            var show = isNeg ? showDebuffs : showBuffs;
            if (!show) { contentParts.push(""); continue; }
            visibleCount++;
            contentParts.push(def.key + (isNeg ? "-" : "+") + valueText);
        }
        var contentSig = contentParts.join("|");
        if (contentSig !== st.lastContentSig) {
            for (var r = 0; r < STAT_DEFS.length; r++) {
                var rdef = STAT_DEFS[r];
                var part = contentParts[r];
                var rowPanel = st.rowPanels[rdef.key];
                if (!IsPanelValid(rowPanel)) continue;
                if (!part) {
                    try { rowPanel.style.visibility = "collapse"; } catch(e) {}
                    continue;
                }
                var neg = part.indexOf(rdef.key + "-") === 0;
                try {
                    rowPanel.SetHasClass("isDebuff", neg);
                    rowPanel.SetHasClass("isBuff", !neg);
                    rowPanel.style.visibility = "visible";
                } catch(e) {}
                var valueLabel = st.rowValues[rdef.key];
                if (IsPanelValid(valueLabel)) {
                    var txt = part.substring((rdef.key + "-").length);
                    try { valueLabel.text = txt; } catch(e) {}
                }
            }
            st.lastContentSig = contentSig;
        }

        // Collapse whole overlay when nothing is active (avoids an empty background box).
        if (visibleCount !== st.lastVisibleCount) {
            try { overlay.style.visibility = (visibleCount > 0) ? "visible" : "collapse"; } catch(e) {}
            st.lastVisibleCount = visibleCount;
        }
    }

    // ── Registration ──
    QOL.register("crosshairStats", {
        configKeys: [
            "ENABLE_CROSSHAIR_STATS",
            "CROSSHAIR_STATS_SHOW_DEBUFFS",
            "CROSSHAIR_STATS_SHOW_BUFFS",
            "CROSSHAIR_STATS_X_OFFSET",
            "CROSSHAIR_STATS_Y_OFFSET",
            "CROSSHAIR_STATS_SCALE",
            "CROSSHAIR_STATS_OPACITY"
        ],
        bucket: 5, phase: -1,
        requiresRoot: true,
        gate: function(cfg) {
            return IsCfgEnabled(cfg, "ENABLE_CROSSHAIR_STATS") ||
                   !!(State.crosshairStats && State.crosshairStats.built);
        },
        update: function(root, cfg, nowMs) {
            try { UpdateCrosshairStats(root, cfg); }
            catch(e) {
                $.Msg("[QOLLock][ERROR][" + _featureId + "] " + e.message + "\n" + e.stack);
                throw e;
            }
        },
        stateKeys: ["crosshairStats"]
    });

    // ── Self-test ──
    try {
        if (typeof UpdateCrosshairStats !== "function") throw new Error("UpdateCrosshairStats is not a function");
    } catch(e) {
        $.Msg("[QOLLock][ERROR][" + _featureId + "] self-test failed: " + (e && e.message ? e.message : String(e)));
    }
})();

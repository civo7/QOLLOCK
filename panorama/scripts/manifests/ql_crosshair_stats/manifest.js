// features/ql_crosshair_stats/manifest.js
// =============================================================================
// QOLLOCK — Crosshair Active Stats Mirror
// =============================================================================
// OWNS:        Crosshair stat overlay mirroring #hudPlayerStats modifiers.
//              15 stat rows with icons, debuff/buff classification,
//              caster-consensus sign correction, layout/opacity/scale.
// DOES NOT OWN: #hudPlayerStats source panel (Valve), stat values (game)
// DEPENDS ON:  QOL.core.FeatureRegistry, QOL.core.Scheduler, QOL delegates
// CONFIG KEYS: ENABLE_CROSSHAIR_STATS, CROSSHAIR_STATS_SHOW_DEBUFFS/BUFFS,
//              X/Y_OFFSET, SCALE, OPACITY, + 15 per-stat toggles
// PATTERN:     Polling (~5Hz). Creates QOLCrosshairStatsOverlay with 15 rows.
// STATE KEYS:  crosshairStats (built, lastLayoutSig, lastContentSig,
//              lastVisibleCount, rowPanels, rowValues, sourceContainers)
// =============================================================================

(function() {
    "use strict";
    var FR = QOL.core.FeatureRegistry;
    if (!FR) { $.Msg("[QOLLock] crosshair_stats: FeatureRegistry not found — aborting"); return; }

    FR.register({
        id: "ql_crosshair_stats",
        enableKey: "ENABLE_CROSSHAIR_STATS",
        enabledByDefault: false,
        settings: [
            { key: "ENABLE_CROSSHAIR_STATS", type: "toggle", default: false },
            { key: "CROSSHAIR_STATS_SHOW_DEBUFFS", type: "toggle", default: true },
            { key: "CROSSHAIR_STATS_SHOW_BUFFS", type: "toggle", default: true },
            { key: "CROSSHAIR_STATS_SCALE", type: "slider", min: 50, max: 200, step: 5, default: 100 },
            { key: "CROSSHAIR_STATS_OPACITY", type: "slider", min: 0, max: 1, step: 0.05, default: 1 },
            { key: "CROSSHAIR_STATS_X_OFFSET", type: "slider", min: -500, max: 500, step: 5, default: 0 },
            { key: "CROSSHAIR_STATS_Y_OFFSET", type: "slider", min: -500, max: 500, step: 5, default: 0 },
            { key: "CROSSHAIR_STATS_SHOW_FIRERATE", type: "toggle", default: true },
            { key: "CROSSHAIR_STATS_SHOW_MOVESPEED", type: "toggle", default: true },
            { key: "CROSSHAIR_STATS_SHOW_HEALAMP", type: "toggle", default: true },
            { key: "CROSSHAIR_STATS_SHOW_BULLETRESIST", type: "toggle", default: true },
            { key: "CROSSHAIR_STATS_SHOW_TECHRESIST", type: "toggle", default: true },
            { key: "CROSSHAIR_STATS_SHOW_BULLETLIFESTEAL", type: "toggle", default: true },
            { key: "CROSSHAIR_STATS_SHOW_TECHLIFESTEAL", type: "toggle", default: true },
            { key: "CROSSHAIR_STATS_SHOW_WEAPONPOWER", type: "toggle", default: true },
            { key: "CROSSHAIR_STATS_SHOW_SPIRIT", type: "toggle", default: true },
            { key: "CROSSHAIR_STATS_SHOW_RANGE", type: "toggle", default: true },
            { key: "CROSSHAIR_STATS_SHOW_DURATION", type: "toggle", default: true },
            { key: "CROSSHAIR_STATS_SHOW_DAMAGEAMP", type: "toggle", default: true },
            { key: "CROSSHAIR_STATS_SHOW_CLIPSIZE", type: "toggle", default: true },
            { key: "CROSSHAIR_STATS_SHOW_REGEN", type: "toggle", default: true },
            { key: "CROSSHAIR_STATS_SHOW_BULLETEVASION", type: "toggle", default: true }
        ],
        create: function(ctx) {
            var BASE_X = 130, BASE_Y = 0, VALUE_BFS_LIMIT = 200;
            var _loop = null;

            var STAT_DEFS = [
                { id: "fireRateContainer",        key: "fireRate",      icon: "FireRate",                cfg: "CROSSHAIR_STATS_SHOW_FIRERATE" },
                { id: "speedDisplayContainer",    key: "moveSpeed",     icon: "MoveSpeed",               cfg: "CROSSHAIR_STATS_SHOW_MOVESPEED" },
                { id: "healingAmpContainer",      key: "healAmp",       icon: "HealAmplifcation",        cfg: "CROSSHAIR_STATS_SHOW_HEALAMP" },
                { id: "bulletResistContainer",    key: "bulletResist",  icon: "ResistBullet",            cfg: "CROSSHAIR_STATS_SHOW_BULLETRESIST" },
                { id: "techResistContainer",      key: "techResist",    icon: "ResistSpirit",            cfg: "CROSSHAIR_STATS_SHOW_TECHRESIST" },
                { id: "bulletLifeStealContainer", key: "bulletLifesteal", icon: "HealthStealingBullets", cfg: "CROSSHAIR_STATS_SHOW_BULLETLIFESTEAL" },
                { id: "techLifeStealContainer",   key: "techLifesteal", icon: "HealthStealingSpirit",    cfg: "CROSSHAIR_STATS_SHOW_TECHLIFESTEAL" },
                { id: "weaponPowerContainer",     key: "weaponPower",   icon: "DamageWeapon",            cfg: "CROSSHAIR_STATS_SHOW_WEAPONPOWER" },
                { id: "spiritContainer",          key: "spirit",        icon: "Spirit",                  cfg: "CROSSHAIR_STATS_SHOW_SPIRIT" },
                { id: "abilityRangeContainer",    key: "range",         icon: "Range",                   cfg: "CROSSHAIR_STATS_SHOW_RANGE" },
                { id: "abilityDurationContainer", key: "duration",      icon: "Duration",                cfg: "CROSSHAIR_STATS_SHOW_DURATION" },
                { id: "damageAmpContainer",       key: "damageAmp",     icon: "DamageWeapon",            cfg: "CROSSHAIR_STATS_SHOW_DAMAGEAMP" },
                { id: "clipSizeContainer",        key: "clipSize",      icon: "AmmoClipSize",            cfg: "CROSSHAIR_STATS_SHOW_CLIPSIZE" },
                { id: "regenPerSecondContainer",  key: "regen",         icon: "HealthRegen",             cfg: "CROSSHAIR_STATS_SHOW_REGEN" },
                { id: "bulletEvasionContainer",   key: "bulletEvasion", icon: "MoveDodge",               cfg: "CROSSHAIR_STATS_SHOW_BULLETEVASION" }
            ];

            // ── QOL delegates ──
            var _getPanel = QOL.getCachedPanel;
            var _setPanel = QOL.setCachedPanel;
            var _isAlive = QOL.utils.IsPanelValid;
            function _isOn(cfg, k) { return Number(cfg[k]) === 1; }
            function _clamp(cfg, key, fallback, min, max) { var v = Number(cfg[key]); if (!isFinite(v)) v = fallback; if (v < min) v = min; if (v > max) v = max; return v; }
            function _getGameplayHud(root) { try { if (typeof QOL !== "undefined" && QOL.getGameplayHudPanel) return QOL.getGameplayHudPanel(root); } catch(e) {} return root; }
            function _isHudClassActive(root, cls) { try { if (typeof QOL !== "undefined" && QOL.isHudClassActive) return QOL.isHudClassActive(root, cls); } catch(e) {} return false; }
            var _setOpacitySafe = QOL.utils.SetPanelOpacitySafe;

            // ── State helpers ──
            function _ensureState() {
                try {
                    if (typeof QOL !== "undefined" && QOL.state) {
                        var st = QOL.state;
                        if (!st.crosshairStats) {
                            st.crosshairStats = { built: false, lastLayoutSig: "", lastContentSig: "", lastVisibleCount: -1, rowPanels: {}, rowValues: {}, sourceContainers: {} };
                        }
                        return st.crosshairStats;
                    }
                } catch(e) {}
                return { built: false, lastLayoutSig: "", lastContentSig: "", lastVisibleCount: -1, rowPanels: {}, rowValues: {}, sourceContainers: {} };
            }
            function _getSourcePanel(root) {
                var panel = _getPanel("crosshairStatsSource");
                if (_isAlive(panel)) return panel;
                panel = (root && root.FindChildTraverse) ? root.FindChildTraverse("hudPlayerStats") : null;
                _setPanel("crosshairStatsSource", panel);
                return panel;
            }
            function _getSourceContainer(st, source, def) {
                var c = st.sourceContainers[def.key];
                if (_isAlive(c)) return c;
                c = (source && source.FindChildTraverse) ? source.FindChildTraverse(def.id) : null;
                st.sourceContainers[def.key] = c || null;
                return c;
            }

            // ── Value text extraction (ported from old feature) ──
            function _stripHtml(s) {
                if (!s) return "";
                var out = "", inTag = false;
                for (var i = 0; i < s.length; i++) { var ch = s.charAt(i); if (ch === "<") { inTag = true; continue; } if (ch === ">") { inTag = false; continue; } if (!inTag) out += ch; }
                out = out.split("&nbsp;").join(" ").split("&amp;").join("&");
                var parts = out.split(/\s+/), clean = [];
                for (var p = 0; p < parts.length; p++) { if (parts[p]) clean.push(parts[p]); }
                return clean.join(" ");
            }
            function _readBfs(root) {
                var queue = []; try { if (root.Children) queue = (root.Children() || []).slice(); } catch(e) { return ""; }
                var guard = 0;
                while (queue.length && guard < VALUE_BFS_LIMIT) { var node = queue.shift(); guard++; if (!node) continue;
                    try { if (node.id === "casterList") continue; } catch(e) {}
                    try { if (typeof node.text === "string") { var t = node.text; if (t && t.length && t.charAt(0) !== "#") return t; } } catch(e) {}
                    try { if (node.Children) { var kids = node.Children() || []; for (var i = 0; i < kids.length; i++) queue.push(kids[i]); } } catch(e) {}
                }
                return "";
            }
            function _readModifierValue(container) {
                if (!_isAlive(container)) return "";
                var core = null; try { core = container.FindChildTraverse("miniModifierCore"); } catch(e) {}
                if (!_isAlive(core)) return _readBfs(container);
                return _readBfs(core);
            }
            function _classifyBySign(txt) {
                if (!txt) return 0;
                for (var i = 0; i < txt.length; i++) { var ch = txt.charAt(i); if (ch === "-" || ch === "−") return -1; if (ch === "+") return 1; if (ch >= "0" && ch <= "9") return 0; }
                return 0;
            }
            function _classifyByGameClass(container) {
                try { if (container.BHasClass("isNegative") || container.BHasClass("IsNegative")) return -1; if (container.BHasClass("isPositive") || container.BHasClass("IsPositive")) return 1; } catch(e) {}
                return 0;
            }
            function _classifyByCasterConsensus(container) {
                if (!_isAlive(container)) return 0;
                var list = null; try { list = container.FindChildTraverse("casterList"); } catch(e) {}
                if (!_isAlive(list)) return 0;
                var queue = []; try { if (list.Children) queue = (list.Children() || []).slice(); } catch(e) { return 0; }
                var guard = 0, enemy = 0, friend = 0;
                while (queue.length && guard < VALUE_BFS_LIMIT) { var node = queue.shift(); guard++; if (!node) continue;
                    try { if (node.BHasClass && node.BHasClass("casterAndModifiers")) { if (node.BHasClass("enemy")) enemy++; else if (node.BHasClass("friend")) friend++; } } catch(e) {}
                    try { if (node.Children) { var kids = node.Children() || []; for (var i = 0; i < kids.length; i++) queue.push(kids[i]); } } catch(e) {}
                }
                if (enemy > 0 && friend === 0) return -1; if (friend > 0 && enemy === 0) return 1; return 0;
            }
            function _applySign(txt, isNeg) {
                if (!txt) return txt; var i = 0;
                while (i < txt.length) { var ch = txt.charAt(i); if (ch === " " || ch === "+" || ch === "-" || ch === "−") { i++; continue; } break; }
                return (isNeg ? "−" : "+") + txt.substring(i);
            }

            // ── Overlay lifecycle ──
            function _ensureOverlay(root) {
                var st = _ensureState();
                var overlay = _getPanel("crosshairStatsOverlay");
                if (_isAlive(overlay) && st.built) return overlay;
                overlay = (root && root.FindChildTraverse) ? root.FindChildTraverse("QOLCrosshairStatsOverlay") : null;
                if (!overlay) { var parent = _getGameplayHud(root); if (!parent) return null;
                    overlay = $.CreatePanel("Panel", parent, "QOLCrosshairStatsOverlay", { hittest: "false", hittestchildren: "false" }); }
                st.rowPanels = {}; st.rowValues = {};
                for (var s = 0; s < STAT_DEFS.length; s++) {
                    var def = STAT_DEFS[s], rowId = "QOLCrosshairStatRow_" + def.key;
                    var row = overlay.FindChildTraverse(rowId);
                    if (!row) { row = $.CreatePanel("Panel", overlay, rowId); row.AddClass("QOLCrosshairStatRow");
                        var icon = $.CreatePanel("Panel", row, rowId + "_icon"); icon.AddClass("QOLCrosshairStatIcon"); icon.AddClass("statIcon"); icon.AddClass("PropertiesIcon"); icon.AddClass(def.icon);
                        var value = $.CreatePanel("Label", row, rowId + "_value"); value.AddClass("QOLCrosshairStatValue"); value.text = ""; }
                    if (row.SetHasClass) row.SetHasClass("qol-hidden", true); else row.style.visibility = "collapse";
                    st.rowPanels[def.key] = row; st.rowValues[def.key] = row.FindChildTraverse(rowId + "_value");
                }
                st.built = true; st.lastLayoutSig = ""; st.lastContentSig = ""; st.lastVisibleCount = -1; st.sourceContainers = {};
                _setPanel("crosshairStatsOverlay", overlay); return overlay;
            }
            function _removeOverlay(root) {
                var st = _ensureState(); var overlay = _getPanel("crosshairStatsOverlay");
                if (!_isAlive(overlay) && root && root.FindChildTraverse) overlay = root.FindChildTraverse("QOLCrosshairStatsOverlay");
                if (_isAlive(overlay)) { try { overlay.DeleteAsync(0); } catch(e) {} }
                _setPanel("crosshairStatsOverlay", null); _setPanel("crosshairStatsSource", null);
                st.built = false; st.rowPanels = {}; st.rowValues = {}; st.sourceContainers = {};
                st.lastLayoutSig = ""; st.lastContentSig = ""; st.lastVisibleCount = -1;
            }

            // ── Main tick ──
            function _tick() {
                try {
                    var root = $.GetContextPanel(); if (!root) return;
                    var cfg = ctx.config.view(); var st = _ensureState();

                    if (!_isOn(cfg, "ENABLE_CROSSHAIR_STATS")) {
                        if (st.built || _getPanel("crosshairStatsOverlay")) _removeOverlay(root);
                        return;
                    }
                    var overlay = _ensureOverlay(root); if (!overlay) return;

                    // Hide while scoreboard is open
                    if (_isHudClassActive(root, "gScoreboardOpen")) {
                        if (overlay.SetHasClass) { overlay.SetHasClass("qol-hidden", true); try { overlay.style.visibility = "collapse"; } catch(e) {} }
                        else try { overlay.style.visibility = "collapse"; } catch(e) {}
                        st.lastVisibleCount = -1; return;
                    }

                    var showDebuffs = _isOn(cfg, "CROSSHAIR_STATS_SHOW_DEBUFFS");
                    var showBuffs = _isOn(cfg, "CROSSHAIR_STATS_SHOW_BUFFS");

                    // Layout
                    var offX = _clamp(cfg, "CROSSHAIR_STATS_X_OFFSET", 0, -500, 500);
                    var offY = _clamp(cfg, "CROSSHAIR_STATS_Y_OFFSET", 0, -500, 500);
                    var scale = _clamp(cfg, "CROSSHAIR_STATS_SCALE", 100, 50, 200);
                    var opacity = Number(cfg.CROSSHAIR_STATS_OPACITY); if (!isFinite(opacity) || opacity < 0) opacity = 1; if (opacity > 1) opacity = 1;
                    var layoutSig = offX + "|" + offY + "|" + scale + "|" + opacity;
                    if (layoutSig !== st.lastLayoutSig) {
                        try { overlay.style.marginLeft = (BASE_X + offX) + "px"; } catch(e) {}
                        try { overlay.style.marginTop = (BASE_Y - offY) + "px"; } catch(e) {}
                        // Keep a future manifest cut-over crisp as well: ui-scale is
                        // layout-time scaling, unlike the blurry transform raster.
                        try { overlay.style.uiScale = scale + "%"; } catch(e) {}
                        _setOpacitySafe(overlay, opacity, 1); st.lastLayoutSig = layoutSig;
                    }

                    // Content
                    var source = _getSourcePanel(root); var contentParts = []; var visibleCount = 0;
                    for (var s = 0; s < STAT_DEFS.length; s++) {
                        var def = STAT_DEFS[s];
                        if (def.cfg && !_isOn(cfg, def.cfg)) { contentParts.push(""); continue; }
                        var container = source ? _getSourceContainer(st, source, def) : null;
                        var active = false;
                        if (_isAlive(container)) { try { active = container.BHasClass("shouldShow"); } catch(e) { active = false; } }
                        if (!active) { contentParts.push(""); continue; }
                        var valueText = _stripHtml(_readModifierValue(container));
                        var consensus = _classifyByCasterConsensus(container);
                        var cls, displayValue = valueText;
                        if (consensus < 0) { cls = -1; displayValue = _applySign(valueText, true); }
                        else { cls = _classifyByGameClass(container); if (cls === 0) cls = _classifyBySign(valueText); }
                        var isNeg = (cls < 0);
                        if (isNeg ? !showDebuffs : !showBuffs) { contentParts.push(""); continue; }
                        visibleCount++; contentParts.push(def.key + (isNeg ? "-" : "+") + displayValue);
                    }
                    var contentSig = contentParts.join("|");
                    if (contentSig !== st.lastContentSig) {
                        for (var r = 0; r < STAT_DEFS.length; r++) {
                            var rdef = STAT_DEFS[r], part = contentParts[r];
                            var rowPanel = st.rowPanels[rdef.key]; if (!_isAlive(rowPanel)) continue;
                            if (!part) {
                                if (rowPanel.SetHasClass) rowPanel.SetHasClass("qol-hidden", true); else try { rowPanel.style.visibility = "collapse"; } catch(e) {}
                                continue;
                            }
                            var neg = part.indexOf(rdef.key + "-") === 0;
                            try { rowPanel.SetHasClass("isDebuff", neg); rowPanel.SetHasClass("isBuff", !neg);
                                if (rowPanel.SetHasClass) rowPanel.SetHasClass("qol-hidden", false); else rowPanel.style.visibility = "visible"; } catch(e) {}
                            var valueLabel = st.rowValues[rdef.key];
                            if (_isAlive(valueLabel)) { var txt = part.substring((rdef.key + "-").length); try { valueLabel.text = txt; } catch(e) {} }
                        }
                        st.lastContentSig = contentSig;
                    }
                    if (visibleCount !== st.lastVisibleCount) {
                        if (overlay.SetHasClass) { overlay.SetHasClass("qol-hidden", visibleCount <= 0); try { overlay.style.visibility = (visibleCount > 0) ? "visible" : "collapse"; } catch(e) {} }
                        else try { overlay.style.visibility = (visibleCount > 0) ? "visible" : "collapse"; } catch(e) {}
                        st.lastVisibleCount = visibleCount;
                    }
                } catch(e) {
                    if (typeof QOL !== "undefined" && QOL.core && QOL.core.Logger) { QOL.core.Logger.logError("ql_crosshair_stats", "_tick: " + (e.message || e)); }
                    throw e;
                }
            }

            return {
                onEnable: function() { var S = QOL.core.Scheduler; _loop = S && S.createPollLoop ? S.createPollLoop(_tick, 0.1, "ql_crosshair_stats") : null; },
                onDisable: function() {
                    if (_loop) { _loop.stop(); _loop = null; }
                    var root = $.GetContextPanel(); _removeOverlay(root);
                },
                onSettingsChanged: function() {}
            };
        },
    test: function(ctx) {
        try {
            var root = $.GetContextPanel();
            var stats = root ? root.FindChildTraverse("hudPlayerStats") : null;
            return { passed: !!stats, name: "Crosshair stats panel exists", message: stats ? "" : "hudPlayerStats not found", assertions: [{ passed: !!stats, name: "hudPlayerStats panel exists" }] };
        } catch(e) { return { passed: false, name: "Crosshair stats panel check", message: (e && e.message ? e.message : String(e)) }; }
    }
    });
})();

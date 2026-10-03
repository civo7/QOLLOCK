// features/ql_crosshair_stats/manifest.js
// =============================================================================
// QOLLOCK — Crosshair Active Stats Mirror
// =============================================================================
// OWNS:        Crosshair stat overlay mirroring #hudActivePlayerStats modifiers.
//              15 stat rows with icons, debuff/buff classification,
//              native polarity, layout/opacity/scale.
// DOES NOT OWN: #hudActivePlayerStats source panel (Valve), stat values (game)
// DEPENDS ON:  QOL.core.FeatureRegistry, QOL.core.Scheduler,
//              QOL.core.panel.findHud, QOL.panelCache.resolve, QOL delegates
// CONFIG KEYS: ENABLE_CROSSHAIR_STATS, CROSSHAIR_STATS_SHOW_DEBUFFS/BUFFS,
//              X/Y_OFFSET, SCALE, OPACITY, + 15 per-stat toggles
// PATTERN:     Polling (10Hz). Creates QOLCrosshairStatsOverlay with 15 rows.
// STATE KEYS:  crosshairStats (built, lastLayoutSig, lastContentSig,
//              lastVisibleCount, rowPanels, rowValues, sourceContainers,
//              sourceValueRefs, sourcePanel)
// =============================================================================

(function() {
    "use strict";
    var FR = QOL.core.FeatureRegistry;
    if (!FR) { $.Msg("[QOLLock] crosshair_stats: FeatureRegistry not found — aborting"); return; }
    var SOURCE_PANEL_ID = "hudActivePlayerStats";

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
            var BASE_X = 135, BASE_Y = 0, VALUE_BFS_LIMIT = 200;
            var _loop = null;

            var STAT_DEFS = [
                { id: "fireRateContainer",        key: "fireRate",      icon: "FireRate",                cfg: "CROSSHAIR_STATS_SHOW_FIRERATE", expectsPostfix: true },
                { id: "speedDisplayContainer",    key: "moveSpeed",     icon: "MoveSpeed",               cfg: "CROSSHAIR_STATS_SHOW_MOVESPEED", expectsPostfix: true },
                { id: "healingAmpContainer",      key: "healAmp",       icon: "HealingReduction",        cfg: "CROSSHAIR_STATS_SHOW_HEALAMP", expectsPostfix: true },
                { id: "bulletResistContainer",    key: "bulletResist",  icon: "ResistBullet",            cfg: "CROSSHAIR_STATS_SHOW_BULLETRESIST", expectsPostfix: true },
                { id: "techResistContainer",      key: "techResist",    icon: "ResistSpirit",            cfg: "CROSSHAIR_STATS_SHOW_TECHRESIST", expectsPostfix: true },
                { id: "bulletLifeStealContainer", key: "bulletLifesteal", icon: "HealthStealingBullets", cfg: "CROSSHAIR_STATS_SHOW_BULLETLIFESTEAL", expectsPostfix: true },
                { id: "techLifeStealContainer",   key: "techLifesteal", icon: "HealthStealingSpirit",    cfg: "CROSSHAIR_STATS_SHOW_TECHLIFESTEAL", expectsPostfix: true },
                { id: "weaponPowerContainer",     key: "weaponPower",   icon: "DamageWeapon",            cfg: "CROSSHAIR_STATS_SHOW_WEAPONPOWER", deltaSelector: true, deltaPostfix: "%" },
                { id: "spiritContainer",          key: "spirit",        icon: "Spirit",                  cfg: "CROSSHAIR_STATS_SHOW_SPIRIT", deltaSelector: true, deltaPrefix: "+" },
                { id: "abilityRangeContainer",    key: "range",         icon: "Range",                   cfg: "CROSSHAIR_STATS_SHOW_RANGE", expectsPostfix: true },
                { id: "abilityDurationContainer", key: "duration",      icon: "Duration",                cfg: "CROSSHAIR_STATS_SHOW_DURATION", expectsPostfix: true },
                { id: "damageAmpContainer",       key: "damageAmp",     icon: "DamageAmplification",     cfg: "CROSSHAIR_STATS_SHOW_DAMAGEAMP" },
                { id: "clipSizeContainer",        key: "clipSize",      icon: "AmmoClipSize",            cfg: "CROSSHAIR_STATS_SHOW_CLIPSIZE" },
                { id: "regenPerSecondContainer",  key: "regen",         icon: "HealthRegen",             cfg: "CROSSHAIR_STATS_SHOW_REGEN", expectsPostfix: true },
                { id: "bulletEvasionContainer",   key: "bulletEvasion", icon: "MoveDodge",               cfg: "CROSSHAIR_STATS_SHOW_BULLETEVASION" }
            ];

            // ── QOL delegates ──
            var _getPanel = QOL.getCachedPanel;
            var _setPanel = QOL.setCachedPanel;
            var _isAlive = QOL.utils.IsPanelValid;
            var _findHud = QOL.core.panel && QOL.core.panel.findHud;
            var _resolvePanel = QOL.panelCache && QOL.panelCache.resolve;
            const _findChild = QOL.core.panel.findChild;
            // Verified against active-player-stats XML and the native Debugger capture.
            const SOURCE_PATHS = [
                ["StatList", "WeaponColumn"],
                ["StatList", "SpiritColumn"],
                ["StatList", "VitalityColumn"],
                ["HudStatBlock", "CoreStats", "Weapon"],
                ["HudStatBlock", "CoreStats", "Spirit"]
            ];
            const SOURCE_OWNER = {
                fireRate: "WeaponColumn", clipSize: "WeaponColumn", bulletLifesteal: "WeaponColumn",
                range: "SpiritColumn", duration: "SpiritColumn", techLifesteal: "SpiritColumn",
                moveSpeed: "VitalityColumn", healAmp: "VitalityColumn", bulletResist: "VitalityColumn",
                techResist: "VitalityColumn", regen: "VitalityColumn", weaponPower: "Weapon", spirit: "Spirit"
            };
            const DISCOVERY_RETRY_MS = 800;
            let sourceScopes = {}, sourceParents = {}, discoveryNextMs = {};
            let scopeParents = {}, scopeNextMs = {};
            let sourceOwner = null, sourceNextMs = 0, hudSuppressed = false;

            function _resetDiscovery() {
                sourceScopes = {}; sourceParents = {}; discoveryNextMs = {};
                scopeParents = {}; scopeNextMs = {};
            }
            function _isDirectChild(panel, parent) {
                if (!_isAlive(panel) || !_isAlive(parent)) return false;
                try { return panel.GetParent() === parent; } catch (_) { return false; }
            }
            function _belongsToSource(panel, source) {
                try {
                    for (let depth = 0; depth < 64 && _isAlive(panel); depth++) {
                        if (panel === source) return true;
                        panel = panel.GetParent();
                    }
                } catch (_) {}
                return false;
            }
            function _getSourceOwners(st, source, nowMs) {
                const owners = [];
                const checked = {};
                let changed = false;
                for (const path of SOURCE_PATHS) {
                    let parent = source;
                    for (const id of path) {
                        if (!checked[id]) {
                            const previous = sourceScopes[id];
                            let panel = previous;
                            if (!_isDirectChild(panel, parent)) {
                                if (previous || scopeParents[id] !== parent) scopeNextMs[id] = 0;
                                panel = null;
                                if (nowMs >= (scopeNextMs[id] || 0)) {
                                    panel = _findChild(parent, id);
                                    scopeNextMs[id] = nowMs + DISCOVERY_RETRY_MS;
                                }
                            }
                            if ((previous || null) !== (panel || null)) changed = true;
                            sourceScopes[id] = panel || null;
                            scopeParents[id] = parent;
                            checked[id] = true;
                        }
                        parent = sourceScopes[id];
                    }
                    if (_isAlive(parent)) owners.push(parent);
                }
                if (changed) {
                    st.sourceContainers = {}; st.sourceValueRefs = {};
                    sourceParents = {}; discoveryNextMs = {};
                    st.lastContentSig = "";
                }
                return owners;
            }
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
                            st.crosshairStats = { built: false, lastLayoutSig: "", lastContentSig: "", lastVisibleCount: -1, rowPanels: {}, rowValues: {}, sourceContainers: {}, sourceValueRefs: {}, sourcePanel: null };
                        }
                        if (!st.crosshairStats.sourceValueRefs) st.crosshairStats.sourceValueRefs = {};
                        return st.crosshairStats;
                    }
                } catch(e) {}
                return { built: false, lastLayoutSig: "", lastContentSig: "", lastVisibleCount: -1, rowPanels: {}, rowValues: {}, sourceContainers: {}, sourceValueRefs: {}, sourcePanel: null };
            }
            function _getSourcePanel(root, st) {
                var owner = root;
                try { if (_findHud) owner = _findHud(root) || root; } catch(e) { owner = root; }
                if (sourceOwner !== owner) { sourceOwner = owner; sourceNextMs = 0; }
                if (_isAlive(st.sourcePanel) && st.sourcePanel.id === SOURCE_PANEL_ID && _belongsToSource(st.sourcePanel, owner)) return st.sourcePanel;
                if (st.sourcePanel) sourceNextMs = 0;
                const nowMs = Date.now();
                if (nowMs < sourceNextMs) return null;
                sourceNextMs = nowMs + DISCOVERY_RETRY_MS;
                var panel = null;
                if (_resolvePanel && _isAlive(owner)) {
                    panel = _resolvePanel(owner, "crosshairStatsSource", SOURCE_PANEL_ID);
                } else {
                    panel = _getPanel("crosshairStatsSource");
                    var reusable = false;
                    if (_isAlive(panel)) {
                        try { reusable = panel.id === SOURCE_PANEL_ID; } catch(e) { reusable = false; }
                    }
                    if (!reusable) {
                        panel = (owner && owner.FindChildTraverse) ? owner.FindChildTraverse(SOURCE_PANEL_ID) : null;
                        _setPanel("crosshairStatsSource", panel);
                    }
                }
                if (panel !== st.sourcePanel) {
                    _resetDiscovery();
                    st.sourcePanel = panel;
                    st.sourceContainers = {};
                    st.sourceValueRefs = {};
                    st.lastContentSig = "";
                }
                return panel;
            }
            function _getSourceContainer(st, source, def, owners, nowMs) {
                var c = st.sourceContainers[def.key];
                const preferred = sourceScopes[SOURCE_OWNER[def.key]];
                if (_isDirectChild(c, sourceParents[def.key]) && _belongsToSource(c, source)) {
                    // A compatibility result must not mask a row later created
                    // at its verified path (old native generations may stay alive).
                    let current = null;
                    if (preferred && sourceParents[def.key] !== preferred && nowMs >= (discoveryNextMs[def.key] || 0)) {
                        current = _findChild(preferred, def.id);
                        discoveryNextMs[def.key] = nowMs + DISCOVERY_RETRY_MS;
                    }
                    if (!current || current === c) return c;
                    c = current;
                    st.sourceContainers[def.key] = c;
                    sourceParents[def.key] = preferred;
                    st.sourceValueRefs[def.key] = null;
                    return c;
                }
                // A replaced/reparented row must bypass an earlier negative-cache deadline.
                if (c) discoveryNextMs[def.key] = 0;
                if (nowMs < (discoveryNextMs[def.key] || 0)) return null;
                discoveryNextMs[def.key] = nowMs + DISCOVERY_RETRY_MS;
                c = _findChild(preferred, def.id);
                // Do not assign an unverified column to conditional/C++-created rows.
                if (!c) c = _findChild(source, def.id);
                if (!c) {
                    for (const owner of owners) {
                        if (owner === preferred) continue;
                        c = _findChild(owner, def.id);
                        if (c) break;
                    }
                }
                if (!c) {
                    c = source.FindChildTraverse ? source.FindChildTraverse(def.id) : null;
                }
                st.sourceContainers[def.key] = c || null;
                sourceParents[def.key] = c ? c.GetParent() : null;
                st.sourceValueRefs[def.key] = null;
                return c;
            }

            // ── Value text extraction (ported from old feature) ──
            function _stripHtml(s) {
                if (!s) return "";
                var out = "", inTag = false;
                for (var i = 0; i < s.length; i++) { var ch = s.charAt(i); if (ch === "<") { inTag = true; continue; } if (ch === ">") { inTag = false; continue; } if (!inTag) out += ch; }
                out = out.split("&nbsp;").join(" ").split("&amp;").join("&").split("&lt;").join("<").split("&gt;").join(">");
                var parts = out.split(/\s+/), clean = [];
                for (var p = 0; p < parts.length; p++) { if (parts[p]) clean.push(parts[p]); }
                return clean.join(" ");
            }
            function _readBfs(root) {
                var queue = []; try { if (root.Children) queue = (root.Children() || []).slice(); } catch(e) { return ""; }
                var guard = 0;
                while (guard < queue.length && guard < VALUE_BFS_LIMIT) { var node = queue[guard]; guard++; if (!node) continue;
                    try { if (node.id === "casterList") continue; } catch(e) {}
                    try { if (typeof node.text === "string") { var t = node.text; if (t && t.length && t.charAt(0) !== "#") return t; } } catch(e) {}
                    try { if (node.Children) { var kids = node.Children() || []; for (var i = 0; i < kids.length; i++) queue.push(kids[i]); } } catch(e) {}
                }
                return "";
            }
            function _firstByClass(panel, className) {
                if (!_isAlive(panel) || !panel.FindChildrenWithClassTraverse) return null;
                try {
                    var matches = panel.FindChildrenWithClassTraverse(className) || [];
                    return matches.length ? matches[0] : null;
                } catch(e) { return null; }
            }
            function _readPanelText(panel) {
                if (!_isAlive(panel)) return "";
                try { return (typeof panel.text === "string") ? panel.text : ""; } catch(e) { return ""; }
            }
            function _getSourceValueRefs(st, container, def) {
                var refs = st.sourceValueRefs[def.key];
                var current = refs && refs.container === container && _isAlive(refs.core);
                if (current && def.deltaSelector) current = _isAlive(refs.statNumberDelta);
                else if (current) {
                    current = _isAlive(refs.statNumber);
                    if (current && def.expectsPostfix) current = _isAlive(refs.statPostfix);
                    else if (current && refs.statPostfix) current = _isAlive(refs.statPostfix);
                }
                if (current) return refs;
                var core = _firstByClass(container, "miniModifierCore");
                refs = {
                    container: container,
                    core: core,
                    statNumber: core ? _firstByClass(core, "statNumber") : null,
                    statPostfix: core ? _firstByClass(core, "statPostfix") : null,
                    statNumberDelta: core ? _firstByClass(core, "statNumberDelta") : null
                };
                st.sourceValueRefs[def.key] = refs;
                return refs;
            }
            function _formatDelta(def, value) {
                if (!value) return "";
                var first = value.charAt(0);
                var prefix = (def.deltaPrefix && first !== "+" && first !== "-" && first !== "−") ? def.deltaPrefix : "";
                return prefix + value + (def.deltaPostfix || "");
            }
            function _readModifierValue(st, container, def) {
                if (!_isAlive(container)) return "";
                var refs = _getSourceValueRefs(st, container, def);
                if (!refs.core) return _readBfs(container);
                if (def.deltaSelector) {
                    var hasDelta = false;
                    try { hasDelta = container.BHasClass("has_delta"); } catch(e) { hasDelta = false; }
                    if (!hasDelta) return "";
                    return _formatDelta(def, _stripHtml(_readPanelText(refs.statNumberDelta)));
                }
                var number = _stripHtml(_readPanelText(refs.statNumber));
                var postfix = _stripHtml(_readPanelText(refs.statPostfix));
                return number || postfix ? number + postfix : _readBfs(refs.core);
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
                st.built = true; st.lastLayoutSig = ""; st.lastContentSig = ""; st.lastVisibleCount = -1; st.sourceContainers = {}; st.sourceValueRefs = {};
                _resetDiscovery();
                sourceOwner = null; sourceNextMs = 0; hudSuppressed = false;
                _setPanel("crosshairStatsOverlay", overlay); return overlay;
            }
            function _removeOverlay(root) {
                var st = _ensureState(); var overlay = _getPanel("crosshairStatsOverlay");
                if (!_isAlive(overlay) && root && root.FindChildTraverse) overlay = root.FindChildTraverse("QOLCrosshairStatsOverlay");
                if (_isAlive(overlay)) { try { overlay.DeleteAsync(0); } catch(e) {} }
                _setPanel("crosshairStatsOverlay", null); _setPanel("crosshairStatsSource", null);
                st.built = false; st.rowPanels = {}; st.rowValues = {}; st.sourceContainers = {}; st.sourceValueRefs = {}; st.sourcePanel = null;
                _resetDiscovery();
                sourceOwner = null; sourceNextMs = 0; hudSuppressed = false;
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
                    if (!QOL.core.hud.isGameplayHudShown(root)) {
                        const hiddenOverlay = _getPanel("crosshairStatsOverlay");
                        if (_isAlive(hiddenOverlay) && !hudSuppressed) {
                            hiddenOverlay.SetHasClass("qol-hidden", true);
                            hiddenOverlay.style.visibility = "collapse";
                        }
                        hudSuppressed = true;
                        return;
                    }
                    if (hudSuppressed) {
                        hudSuppressed = false;
                        st.lastContentSig = ""; st.lastVisibleCount = -1;
                        discoveryNextMs = {}; scopeNextMs = {}; sourceNextMs = 0;
                    }
                    var overlay = _ensureOverlay(root); if (!overlay) return;

                    // Hide while scoreboard is open
                    if (QOL.core.hud.isScoreboardOpen(root)) {
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
                    var source = _getSourcePanel(root, st); var contentParts = []; var visibleCount = 0;
                    const nowMs = Date.now();
                    const owners = source ? _getSourceOwners(st, source, nowMs) : [];
                    for (var s = 0; s < STAT_DEFS.length; s++) {
                        var def = STAT_DEFS[s];
                        if (def.cfg && !_isOn(cfg, def.cfg)) { contentParts.push(""); continue; }
                        var container = source ? _getSourceContainer(st, source, def, owners, nowMs) : null;
                        var active = false;
                        if (_isAlive(container)) { try { active = container.BHasClass("shouldShow"); } catch(e) { active = false; } }
                        if (!active) { contentParts.push(""); continue; }
                        var valueText = _stripHtml(_readModifierValue(st, container, def));
                        if (!valueText) { contentParts.push(""); continue; }
                        var cls = _classifyByGameClass(container); if (cls === 0) cls = _classifyBySign(valueText);
                        var displayValue = valueText;
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
                onEnable: function() {
                    var S = QOL.core.Scheduler;
                    // rate-exempt: 10Hz (0.1s) required for responsive crosshair stats
                    _loop = S && S.createPollLoop ? S.createPollLoop(_tick, 0.1, "ql_crosshair_stats") : null;
                },
                onDisable: function() {
                    if (_loop) { _loop.stop(); _loop = null; }
                    var root = $.GetContextPanel(); _removeOverlay(root);
                },
                onSettingsChanged: function() {
                    var st = _ensureState();
                    if (st) {
                        st.lastLayoutSig = "";
                        st.lastContentSig = "";
                        discoveryNextMs = {}; scopeNextMs = {}; sourceNextMs = 0;
                    }
                    _tick();
                }
            };
        },
    test: function(ctx) {
        try {
            var root = $.GetContextPanel();
            var stats = root ? root.FindChildTraverse(SOURCE_PANEL_ID) : null;
            var modifier = stats && stats.FindChildTraverse ? stats.FindChildTraverse("fireRateContainer") : null;
            var passed = !!stats && !!modifier;
            return { passed: passed, name: "Crosshair stats source exists", message: passed ? "" : (!stats ? "hudActivePlayerStats not found" : "fireRateContainer not found"), assertions: [{ passed: !!stats, name: "hudActivePlayerStats panel exists" }, { passed: !!modifier, name: "active modifier rows exist" }] };
        } catch(e) { return { passed: false, name: "Crosshair stats panel check", message: (e && e.message ? e.message : String(e)) }; }
    }
    });
})();

// OWNS: Crosshair modifier mirror rows, layout and native-polarity filtering.
// DOES NOT OWN: hudActivePlayerStats or gameplay values and native feedback.
// Verified owners: active-player-stats XML plus the current Debugger capture.
(() => {
    "use strict";
    const SOURCE_PANEL_ID = "hudActivePlayerStats";
    QOL.core.FeatureRegistry.register({
        id: "ql_crosshair_stats",
        enableKey: "ENABLE_CROSSHAIR_STATS",
        enabledByDefault: false,
        settings: [
            { key: "ENABLE_CROSSHAIR_STATS", type: "toggle" },
            { key: "CROSSHAIR_STATS_SHOW_DEBUFFS", type: "toggle" },
            { key: "CROSSHAIR_STATS_SHOW_BUFFS", type: "toggle" },
            { key: "CROSSHAIR_STATS_SCALE", type: "slider" },
            { key: "CROSSHAIR_STATS_OPACITY", type: "slider" },
            { key: "CROSSHAIR_STATS_X_OFFSET", type: "slider" },
            { key: "CROSSHAIR_STATS_Y_OFFSET", type: "slider" },
            { key: "CROSSHAIR_STATS_SHOW_FIRERATE", type: "toggle" },
            { key: "CROSSHAIR_STATS_SHOW_MOVESPEED", type: "toggle" },
            { key: "CROSSHAIR_STATS_SHOW_HEALAMP", type: "toggle" },
            { key: "CROSSHAIR_STATS_SHOW_BULLETRESIST", type: "toggle" },
            { key: "CROSSHAIR_STATS_SHOW_TECHRESIST", type: "toggle" },
            { key: "CROSSHAIR_STATS_SHOW_BULLETLIFESTEAL", type: "toggle" },
            { key: "CROSSHAIR_STATS_SHOW_TECHLIFESTEAL", type: "toggle" },
            { key: "CROSSHAIR_STATS_SHOW_WEAPONPOWER", type: "toggle" },
            { key: "CROSSHAIR_STATS_SHOW_SPIRIT", type: "toggle" },
            { key: "CROSSHAIR_STATS_SHOW_RANGE", type: "toggle" },
            { key: "CROSSHAIR_STATS_SHOW_DURATION", type: "toggle" },
            { key: "CROSSHAIR_STATS_SHOW_DAMAGEAMP", type: "toggle" },
            { key: "CROSSHAIR_STATS_SHOW_CLIPSIZE", type: "toggle" },
            { key: "CROSSHAIR_STATS_SHOW_REGEN", type: "toggle" },
            { key: "CROSSHAIR_STATS_SHOW_BULLETEVASION", type: "toggle" }
        ],
        create(ctx) {
            const P = QOL.core.panel;
            const _isAlive = P.isAlive;
            const _findChild = P.findChild;
            const BASE_X = 135, BASE_Y = 0, VALUE_BFS_LIMIT = 200;
            const DISCOVERY_RETRY_MS = 800;
            const STAT_DEFS = [
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

            const sourceResolver = QOL.panelCache.createIdResolver(SOURCE_PANEL_ID, { retryMs: 800, refreshMs: 800 });
            const gameplayResolver = QOL.panelCache.createIdResolver("gameplay_hud", {
                retryMs: 800, ownerPath: [{ id: "Hud", optional: true }, { className: "HudCore" }]
            });
            const tree = P.createOwnedTree();
            let active = false, rootOwner = null, model = null, loop = null, overlay = null, overlayParent = null;
            const rows = new Map();
            let layoutSignature = null;
            let sourceScopes = {}, sourceParents = {}, discoveryNextMs = {};
            let scopeParents = {}, scopeNextMs = {};
            const state = { sourcePanel: null, sourceContainers: {}, sourceValueRefs: {} };

            function readModel() {
                const cfg = ctx.config.view();
                const number = (key, fallback) => Number.isFinite(Number(cfg[key])) ? Number(cfg[key]) : fallback;
                return {
                    enabled: Number(cfg.ENABLE_CROSSHAIR_STATS) === 1,
                    showBuffs: Number(cfg.CROSSHAIR_STATS_SHOW_BUFFS) === 1,
                    showDebuffs: Number(cfg.CROSSHAIR_STATS_SHOW_DEBUFFS) === 1,
                    rows: new Set(STAT_DEFS.filter(def => Number(cfg[def.cfg]) === 1).map(def => def.key)),
                    styles: {
                        marginLeft: (BASE_X + number("CROSSHAIR_STATS_X_OFFSET", 0)) + "px",
                        marginTop: (BASE_Y - number("CROSSHAIR_STATS_Y_OFFSET", 0)) + "px",
                        uiScale: number("CROSSHAIR_STATS_SCALE", 100) + "%",
                        opacity: Math.max(0, Math.min(1, number("CROSSHAIR_STATS_OPACITY", 1))).toFixed(2)
                    }
                };
            }

            function _resetDiscovery() {
                sourceScopes = {}; sourceParents = {}; discoveryNextMs = {};
                scopeParents = {}; scopeNextMs = {};
                state.sourceContainers = {}; state.sourceValueRefs = {};
            }

            function _isDirectChild(panel, parent) {
                if (!_isAlive(panel) || !_isAlive(parent)) return false;
                try { return panel.GetParent() === parent && P.findChild(parent, panel.id) === panel; } catch (_) { return false; }
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

            function readSource(root) {
                const source = sourceResolver.resolve(P.findHud(root) || root);
                if (source !== state.sourcePanel) {
                    _resetDiscovery();
                    state.sourcePanel = source;
                }
                return source;
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
                }
                return owners;
            }
            function _getSourceContainer(st, source, def, owners, nowMs) {
                let c = st.sourceContainers[def.key];
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

            function _stripHtml(s) {
                if (!s) return "";
                let out = "", inTag = false;
                for (let i = 0; i < s.length; i++) { let ch = s.charAt(i); if (ch === "<") { inTag = true; continue; } if (ch === ">") { inTag = false; continue; } if (!inTag) out += ch; }
                out = out.split("&nbsp;").join(" ").split("&amp;").join("&").split("&lt;").join("<").split("&gt;").join(">");
                let parts = out.split(/\s+/), clean = [];
                for (let p = 0; p < parts.length; p++) { if (parts[p]) clean.push(parts[p]); }
                return clean.join(" ");
            }
            function _readBfs(root) {
                let queue = []; try { if (root.Children) queue = (root.Children() || []).slice(); } catch(e) { return ""; }
                let guard = 0;
                while (guard < queue.length && guard < VALUE_BFS_LIMIT) { let node = queue[guard]; guard++; if (!node) continue;
                    try { if (node.id === "casterList") continue; } catch(e) {}
                    try { if (typeof node.text === "string") { let t = node.text; if (t && t.length && t.charAt(0) !== "#") return t; } } catch(e) {}
                    try { if (node.Children) { let kids = node.Children() || []; for (let i = 0; i < kids.length; i++) queue.push(kids[i]); } } catch(e) {}
                }
                return "";
            }
            function _firstByClass(panel, className) {
                if (!_isAlive(panel) || !panel.FindChildrenWithClassTraverse) return null;
                try {
                    let matches = panel.FindChildrenWithClassTraverse(className) || [];
                    return matches.find(match => _isAlive(match) && _belongsToSource(match, panel)) || null;
                } catch(e) { return null; }
            }
            function _readPanelText(panel) {
                if (!_isAlive(panel)) return "";
                try { return (typeof panel.text === "string") ? panel.text : ""; } catch(e) { return ""; }
            }
            function _getSourceValueRefs(st, container, def) {
                let refs = st.sourceValueRefs[def.key];
                let current = refs && refs.container === container && _isAlive(refs.core) && refs.core.BHasClass("miniModifierCore");
                if (current && def.deltaSelector) current = _isAlive(refs.statNumberDelta) && refs.statNumberDelta.BHasClass("statNumberDelta");
                else if (current) {
                    current = _isAlive(refs.statNumber) && refs.statNumber.BHasClass("statNumber");
                    if (current && def.expectsPostfix) current = _isAlive(refs.statPostfix) && refs.statPostfix.BHasClass("statPostfix");
                    else if (current && refs.statPostfix) current = _isAlive(refs.statPostfix) && refs.statPostfix.BHasClass("statPostfix");
                }
                if (current && _belongsToSource(refs.core, container) && (!refs.statNumber || _belongsToSource(refs.statNumber, refs.core)) && (!refs.statPostfix || _belongsToSource(refs.statPostfix, refs.core)) && (!refs.statNumberDelta || _belongsToSource(refs.statNumberDelta, refs.core)) && Date.now() < refs.nextRefresh) return refs;
                let core = _firstByClass(container, "miniModifierCore");
                refs = {
                    container: container, nextRefresh: Date.now() + DISCOVERY_RETRY_MS,
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
                let first = value.charAt(0);
                let prefix = (def.deltaPrefix && first !== "+" && first !== "-" && first !== "−") ? def.deltaPrefix : "";
                return prefix + value + (def.deltaPostfix || "");
            }
            function _readModifierValue(st, container, def) {
                if (!_isAlive(container)) return "";
                let refs = _getSourceValueRefs(st, container, def);
                if (!refs.core) return _readBfs(container);
                if (def.deltaSelector) {
                    let hasDelta = false;
                    try { hasDelta = container.BHasClass("has_delta"); } catch(e) { hasDelta = false; }
                    if (!hasDelta) return "";
                    return _formatDelta(def, _stripHtml(_readPanelText(refs.statNumberDelta)));
                }
                let number = _stripHtml(_readPanelText(refs.statNumber));
                let postfix = _stripHtml(_readPanelText(refs.statPostfix));
                return number || postfix ? number + postfix : _readBfs(refs.core);
            }
            function _classifyBySign(txt) {
                if (!txt) return 0;
                for (let i = 0; i < txt.length; i++) { let ch = txt.charAt(i); if (ch === "-" || ch === "−") return -1; if (ch === "+") return 1; if (ch >= "0" && ch <= "9") return 0; }
                return 0;
            }
            function _classifyByGameClass(container) {
                try { if (container.BHasClass("isNegative") || container.BHasClass("IsNegative")) return -1; if (container.BHasClass("isPositive") || container.BHasClass("IsPositive")) return 1; } catch(e) {}
                return 0;
            }

            function removeOverlay() {
                hideOverlay();
                tree.clear();
                overlay = null; overlayParent = null; rows.clear(); layoutSignature = null;
            }

            function ensureOverlay(root) {
                tree.sweep();
                const parent = gameplayResolver.resolve(root);
                if (!_isAlive(parent)) { removeOverlay(); return false; }
                if (overlayParent !== parent || !_isDirectChild(overlay, parent)) {
                    removeOverlay();
                    overlayParent = parent;
                }
                const previous = overlay;
                overlay = tree.child(parent, "Panel", "QOLCrosshairStatsOverlay");
                if (previous !== overlay) { rows.clear(); layoutSignature = null; }
                if (!_isAlive(overlay)) return false;
                let complete = true;
                for (const def of STAT_DEFS) {
                    const id = "QOLCrosshairStatRow_" + def.key;
                    const row = tree.child(overlay, "Panel", id);
                    if (!_isAlive(row)) { complete = false; continue; }
                    P.setClass(row, "QOLCrosshairStatRow", true);
                    const icon = tree.child(row, "Panel", id + "_icon");
                    const value = tree.child(row, "Label", id + "_value");
                    if (!_isAlive(icon) || !_isAlive(value)) { complete = false; continue; }
                    for (const name of ["QOLCrosshairStatIcon", "statIcon", "PropertiesIcon", def.icon]) P.setClass(icon, name, true);
                    P.setClass(value, "QOLCrosshairStatValue", true);
                    rows.set(def.key, { row, value });
                }
                // Retain partial construction for the next tick, but never show
                // an incomplete overlay or cache it as completely rendered.
                return complete;
            }

            function readContent(source) {
                const now = Date.now();
                const owners = source ? _getSourceOwners(state, source, now) : [];
                const content = new Map();
                for (const def of STAT_DEFS) {
                    if (!model.rows.has(def.key)) continue;
                    const container = source ? _getSourceContainer(state, source, def, owners, now) : null;
                    if (!_isAlive(container) || !container.BHasClass("shouldShow")) continue;
                    const text = _stripHtml(_readModifierValue(state, container, def));
                    if (!text) continue;
                    const polarity = _classifyByGameClass(container) || _classifyBySign(text);
                    const negative = polarity < 0;
                    if (negative ? !model.showDebuffs : !model.showBuffs) continue;
                    content.set(def.key, { text, negative });
                }
                return content;
            }

            function render(content) {
                layoutSignature = P.syncStyles(overlay, model.styles, layoutSignature).sig;
                for (const [key, panels] of rows) {
                    const entry = content.get(key);
                    P.setClass(panels.row, "qol-hidden", !entry);
                    if (!entry) continue;
                    P.setClass(panels.row, "isDebuff", entry.negative);
                    P.setClass(panels.row, "isBuff", !entry.negative);
                    if (panels.value.text !== entry.text) panels.value.text = entry.text;
                }
                hideOverlay(content.size === 0);
            }

            function hideOverlay(hidden = true) {
                if (!_isAlive(overlay)) return;
                P.setClass(overlay, "qol-hidden", hidden);
                QOL.utils.SetStyleIfChanged(overlay, "visibility", hidden ? "collapse" : "visible");
            }

            function update() {
                if (!active || !model) return;
                const root = P.findHud($.GetContextPanel());
                if (root !== rootOwner) {
                    removeOverlay(); _resetDiscovery(); state.sourcePanel = null;
                    sourceResolver.reset(); gameplayResolver.reset(); rootOwner = root;
                }
                if (!_isAlive(root) || (root.id !== "Hud" && root.paneltype !== "CitadelHud")) { removeOverlay(); return; }
                if (!model.enabled) { removeOverlay(); return; }
                if (!QOL.core.hud.isGameplayHudShown(root) || QOL.core.hud.isScoreboardOpen(root)) {
                    tree.sweep();
                    hideOverlay();
                    return;
                }
                if (!ensureOverlay(root)) { hideOverlay(); return; }
                render(readContent(readSource(root)));
            }

            function refreshSettings() {
                model = readModel();
                discoveryNextMs = {}; scopeNextMs = {};
                update();
            }

            return {
                onEnable() {
                    active = true;
                    model = readModel();
                    // rate-exempt: 10Hz preserves responsive live crosshair modifiers.
                    loop = QOL.core.Scheduler.createPollLoop(update, 0.1, "ql_crosshair_stats");
                },
                onSettingsChanged: refreshSettings,
                onDisable() {
                    active = false;
                    if (loop) { loop.stop(); loop = null; }
                    removeOverlay(); _resetDiscovery();
                    state.sourcePanel = null; model = null;
                    sourceResolver.reset(); gameplayResolver.reset();
                    tree.dispose(); rootOwner = null;
                }
            };
        },
        test() {
            const stats = QOL.core.panel.findTraverse($.GetContextPanel(), SOURCE_PANEL_ID);
            if (!stats) return null;
            const modifier = QOL.core.panel.findTraverse(stats, "fireRateContainer");
            return { passed: !!modifier, name: "Crosshair stats source exists",
                message: modifier ? "" : "fireRateContainer not found",
                assertions: [{ passed: true, name: "hudActivePlayerStats panel exists" }, { passed: !!modifier, name: "active modifier rows exist" }] };
        }
    });
})();

// features/ql_color_warnings/manifest.js
// =============================================================================
// QOLLOCK — Color-Coded Healthbar Warnings (Self/Enemy/Ally)
// =============================================================================
// OWNS:        Healthbar color warnings for self (health_and_abilities_container),
//              enemy top-bar health bars, ally top-bar health bars.
//              Color blending + pulse animation at low HP thresholds.
// DOES NOT OWN: Healthbar panels (Valve), health values (game)
// DEPENDS ON:  QOL.core.FeatureRegistry, QOL.core.Scheduler,
//              QOL delegates: state, getCachedPanel, setCachedPanel, utils
//              + Utils.BlendRgb, Utils.ToRgbString, Utils.SetWashColorSafe,
//                Utils.HasClassInHierarchy, Utils.SetStyleSafe, Utils.ClearStyleSafe
//              + Utils.COLORED_HEALTHBAR_* constants
// CONFIG KEYS: Self: ENABLE_COLORED_HEALTHBAR, ENABLE_COLOR_WARNING_25/65/75
//              Enemy: ENABLE_ENEMY_COLORED_HEALTHBAR,
//                     ENABLE_TOPBAR_ENEMY_HP_WARNING_25/65/75
//              Ally:  ENABLE_ALLY_COLORED_HEALTHBAR,
//                     ENABLE_TOPBAR_ALLY_HP_WARNING_25/65/75
// PATTERN:     Polling (~6Hz). Old system registers 3 features in 1 file
//              (colorWarning, enemyColorWarning, allyColorWarning).
//              New manifest combines all 3 into a single poll loop.
//              Healthbar wash-color manipulation via SetWashColorSafe.
//              Panel cache with descendant validation.
// STATE KEYS:  Self: coloredHealthbarLastColor, coloredHealthbarEnabledPrev,
//                    coloredHealthbarPulseDir, coloredHealthbarPulseVal,
//                    coloredHealthbarZeroHeightStreak
//              Enemy: enemyColoredHealthPanelCache, enemyColoredHealthPanelCacheNextMs,
//                     enemyColoredHealthNextUpdateMs, enemyColoredHealthEnabledPrev,
//                     enemyColoredHealthPulseDir, enemyColoredHealthPulseVal
//              Ally:  allyColoredHealthPanelCache, allyColoredHealthPanelCacheNextMs,
//                     allyColoredHealthNextUpdateMs, allyColoredHealthEnabledPrev,
//                     allyColoredHealthPulseDir, allyColoredHealthPulseVal
//              (written for backward compat — Pattern 7)
// =============================================================================

(function() {
    "use strict";
    var FR = QOL.core.FeatureRegistry;
    if (!FR) { $.Msg("[QOLLock] color_warnings: FeatureRegistry not found — aborting"); return; }
    var logger = QOL.core.Logger;

    FR.register({
        id: "ql_color_warnings",
        enableKey: "ENABLE_COLORED_HEALTHBAR",
        enabledByDefault: false,
        settings: [
            { key: "ENABLE_COLORED_HEALTHBAR", type: "toggle", default: false },
            { key: "ENABLE_COLOR_WARNING_25", type: "toggle", default: false },
            { key: "ENABLE_COLOR_WARNING_65", type: "toggle", default: false },
            { key: "ENABLE_COLOR_WARNING_75", type: "toggle", default: false },
            { key: "ENABLE_ENEMY_COLORED_HEALTHBAR", type: "toggle", default: false },
            { key: "ENABLE_TOPBAR_ENEMY_HP_WARNING_25", type: "toggle", default: false },
            { key: "ENABLE_TOPBAR_ENEMY_HP_WARNING_65", type: "toggle", default: false },
            { key: "ENABLE_TOPBAR_ENEMY_HP_WARNING_75", type: "toggle", default: false },
            { key: "ENABLE_ALLY_COLORED_HEALTHBAR", type: "toggle", default: false },
            { key: "ENABLE_TOPBAR_ALLY_HP_WARNING_25", type: "toggle", default: false },
            { key: "ENABLE_TOPBAR_ALLY_HP_WARNING_65", type: "toggle", default: false },
            { key: "ENABLE_TOPBAR_ALLY_HP_WARNING_75", type: "toggle", default: false }
        ],
        create: function(ctx) {
            // ── QOL delegate wrappers (Pattern 10) ──
            function _getState() {
                try { if (typeof QOL !== "undefined" && QOL.state) return QOL.state; } catch(e) {}
                return null;
            }
            function _getCachedPanel(key) {
                try { if (typeof QOL !== "undefined" && QOL.getCachedPanel) return QOL.getCachedPanel(key); } catch(e) {}
                return null;
            }
            function _setCachedPanel(key, val) {
                try { if (typeof QOL !== "undefined" && QOL.setCachedPanel) QOL.setCachedPanel(key, val); } catch(e) {}
            }
            function _isCfgEnabled(cfg, key) {
                try { if (typeof QOL !== "undefined" && QOL.utils && QOL.utils.IsCfgEnabled) return QOL.utils.IsCfgEnabled(cfg, key); } catch(e) {}
                return Number(cfg[key]) === 1;
            }
            function _isPanelValid(p) {
                try { if (typeof QOL !== "undefined" && QOL.utils && QOL.utils.IsPanelValid) return QOL.utils.IsPanelValid(p); } catch(e) {}
                return !!(p && typeof p.IsValid === "function" && p.IsValid());
            }
            function _setStyleSafe(panel, prop, value) {
                try { if (typeof QOL !== "undefined" && QOL.utils && QOL.utils.SetStyleSafe) QOL.utils.SetStyleSafe(panel, prop, value); } catch(e) {}
            }
            function _clearStyleSafe(panel, prop) {
                try { if (typeof QOL !== "undefined" && QOL.utils && QOL.utils.ClearStyleSafe) QOL.utils.ClearStyleSafe(panel, prop); } catch(e) {}
            }
            function _setWashColorSafe(panel, color) {
                try { if (typeof QOL !== "undefined" && QOL.utils && QOL.utils.SetWashColorSafe) QOL.utils.SetWashColorSafe(panel, color); } catch(e) {}
            }
            function _toRgbString(rgb) {
                try { if (typeof QOL !== "undefined" && QOL.utils && QOL.utils.ToRgbString) return QOL.utils.ToRgbString(rgb); } catch(e) {}
                if (Array.isArray(rgb) && rgb.length === 3) return "rgb(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + ")";
                return "rgb(255,255,255)";
            }
            function _blendRgb(a, b, t) {
                try { if (typeof QOL !== "undefined" && QOL.utils && QOL.utils.BlendRgb) return QOL.utils.BlendRgb(a, b, t); } catch(e) {}
                if (!Array.isArray(a) || !Array.isArray(b)) return [255,255,255];
                return [Math.round(a[0]+(b[0]-a[0])*t), Math.round(a[1]+(b[1]-a[1])*t), Math.round(a[2]+(b[2]-a[2])*t)];
            }
            function _hasClassInHierarchy(panel, cls) {
                try { if (typeof QOL !== "undefined" && QOL.utils && QOL.utils.HasClassInHierarchy) return QOL.utils.HasClassInHierarchy(panel, cls); } catch(e) {}
                return !!(panel && panel.BHasClass && panel.BHasClass(cls));
            }
            function _getUtilsConst(name) {
                try { if (typeof QOL !== "undefined" && QOL.utils && QOL.utils[name] !== undefined) return QOL.utils[name]; } catch(e) {}
                return undefined;
            }

            // ── Constants ──
            var PANEL_ID_HEALTH_CONTAINER = "health_and_abilities_container";
            var ENEMY_COLORED_HEALTH_UPDATE_MS = 160;
            var ENEMY_COLORED_HEALTH_PANEL_SCAN_MS = 1200;
            var ENEMY_COLORED_HEALTH_MID_COLOR = [255, 123, 0];
            var ENEMY_COLORED_HEALTH_NEUTRAL_COLOR = [91, 239, 181];
            var ENEMY_COLORED_HEALTH_PULSE_COLOR = [225, 97, 97];
            var ENEMY_COLORED_HEALTH_PULSE_DARK_COLOR = [85, 28, 28];
            var ENEMY_COLORED_HEALTH_TEAM1_COLOR = [255, 201, 97];
            var ENEMY_COLORED_HEALTH_TEAM2_COLOR = [100, 133, 252];
            var ENEMY_TOPBAR_HEALTH_DEFAULT_COLOR = [255, 86, 86];

            // Pull through Utils constants (may be undefined if QOL not loaded)
            var COLORED_HEALTHBAR_LOW_HP_THRESHOLD = _getUtilsConst("COLORED_HEALTHBAR_LOW_HP_THRESHOLD");
            var COLORED_HEALTHBAR_MID_HP_THRESHOLD = _getUtilsConst("COLORED_HEALTHBAR_MID_HP_THRESHOLD");
            var COLORED_HEALTHBAR_HIGH_HP_THRESHOLD = _getUtilsConst("COLORED_HEALTHBAR_HIGH_HP_THRESHOLD");
            var COLORED_HEALTHBAR_COLOR_WHITE = _getUtilsConst("COLORED_HEALTHBAR_COLOR_WHITE");
            var COLORED_HEALTHBAR_COLOR_RED = _getUtilsConst("COLORED_HEALTHBAR_COLOR_RED");
            var COLORED_HEALTHBAR_COLOR_DARK_RED = _getUtilsConst("COLORED_HEALTHBAR_COLOR_DARK_RED");
            var COLORED_HEALTHBAR_COLOR_ORANGE = _getUtilsConst("COLORED_HEALTHBAR_COLOR_ORANGE");
            var COLORED_HEALTHBAR_COLOR_YELLOW = _getUtilsConst("COLORED_HEALTHBAR_COLOR_YELLOW");
            var COLORED_HEALTHBAR_PULSE_STEP = _getUtilsConst("COLORED_HEALTHBAR_PULSE_STEP");
            var ALLY_TOPBAR_HEALTH_DEFAULT_COLOR = COLORED_HEALTHBAR_COLOR_WHITE;

            // Fallback defaults for constants if Utils aren't loaded
            if (COLORED_HEALTHBAR_LOW_HP_THRESHOLD === undefined) COLORED_HEALTHBAR_LOW_HP_THRESHOLD = 25;
            if (COLORED_HEALTHBAR_MID_HP_THRESHOLD === undefined) COLORED_HEALTHBAR_MID_HP_THRESHOLD = 65;
            if (COLORED_HEALTHBAR_HIGH_HP_THRESHOLD === undefined) COLORED_HEALTHBAR_HIGH_HP_THRESHOLD = 75;
            if (COLORED_HEALTHBAR_COLOR_WHITE === undefined) COLORED_HEALTHBAR_COLOR_WHITE = [255, 255, 255];
            if (COLORED_HEALTHBAR_COLOR_RED === undefined) COLORED_HEALTHBAR_COLOR_RED = [255, 0, 0];
            if (COLORED_HEALTHBAR_COLOR_DARK_RED === undefined) COLORED_HEALTHBAR_COLOR_DARK_RED = [139, 0, 0];
            if (COLORED_HEALTHBAR_COLOR_ORANGE === undefined) COLORED_HEALTHBAR_COLOR_ORANGE = [255, 165, 0];
            if (COLORED_HEALTHBAR_COLOR_YELLOW === undefined) COLORED_HEALTHBAR_COLOR_YELLOW = [255, 255, 0];
            if (COLORED_HEALTHBAR_PULSE_STEP === undefined) COLORED_HEALTHBAR_PULSE_STEP = 0.05;

            var _loop = null;

            // ── Shared Helpers ──
            function _isDescendantOf(panel, ancestor) {
                if (!panel || !ancestor) return false;
                var current = panel;
                while (current) {
                    if (current === ancestor) return true;
                    current = current.GetParent ? current.GetParent() : null;
                }
                return false;
            }

            function _isColorWarningEnabled(cfg) {
                if (!cfg) return false;
                return _isCfgEnabled(cfg, "ENABLE_COLOR_WARNING_25") ||
                    _isCfgEnabled(cfg, "ENABLE_COLOR_WARNING_65") ||
                    _isCfgEnabled(cfg, "ENABLE_COLOR_WARNING_75");
            }

            function _resolveFriendlyTopBarTeamClass(root, nowMs) {
                var State = _getState();
                if (!State) return "";
                var now = Number(nowMs) || (Date.now ? Date.now() : (new Date()).getTime());
                if (State.enemyColoredHealthFriendlyTeamClass && now < (State.enemyColoredHealthFriendlyTeamNextMs || 0)) {
                    return State.enemyColoredHealthFriendlyTeamClass;
                }
                var friendlyTeamClass = "";
                var friendlyPanel = root && root.FindChildTraverse ? (root.FindChildTraverse("TeamFriendly") || null) : null;
                if (friendlyPanel && _isPanelValid(friendlyPanel)) {
                    if (_hasClassInHierarchy(friendlyPanel, "team1")) friendlyTeamClass = "team1";
                    else if (_hasClassInHierarchy(friendlyPanel, "team2")) friendlyTeamClass = "team2";
                }
                State.enemyColoredHealthFriendlyTeamClass = friendlyTeamClass;
                State.enemyColoredHealthFriendlyTeamNextMs = now + 1500;
                return friendlyTeamClass;
            }

            function _resolveEnemyTeamClass(panel) {
                if (!panel) return "";
                if (_hasClassInHierarchy(panel, "team1")) return "team1";
                if (_hasClassInHierarchy(panel, "team2")) return "team2";
                if (_hasClassInHierarchy(panel, "team_neutral") || _hasClassInHierarchy(panel, "neutral")) return "neutral";
                return "";
            }

            function _estimateHealthPercentFromBarHeight(entry) {
                if (!entry) return NaN;
                var fillPanel = entry.healthBar || null;
                var fillSize = fillPanel && _isPanelValid(fillPanel) ? Number(fillPanel.actuallayoutheight) : NaN;
                if (!isFinite(fillSize) || fillSize < 0) return NaN;
                var pct = (fillSize / 60) * 100;
                if (!isFinite(pct)) return NaN;
                if (pct < 0) pct = 0;
                if (pct > 100) pct = 100;
                return pct;
            }

            // ═══════════════════════════════════════════════
            // SELF HEALTHBAR (colorWarning)
            // ═══════════════════════════════════════════════

            function _resetSelfStyles() {
                var State = _getState();
                var healthBar = _getCachedPanel("coloredHealthbarHealthBar");
                var progressLeft = _getCachedPanel("coloredHealthbarProgressLeft");
                var currentHealth = _getCachedPanel("coloredHealthbarCurrentHealth");
                if (healthBar) _setWashColorSafe(healthBar, "white");
                if (progressLeft) _setWashColorSafe(progressLeft, "white");
                if (currentHealth) {
                    _setStyleSafe(currentHealth, "color", "white");
                    _setWashColorSafe(currentHealth, "white");
                }
                if (State) {
                    State.coloredHealthbarLastColor = "";
                    State.coloredHealthbarPulseDir = 1;
                    State.coloredHealthbarPulseVal = 0;
                    State.coloredHealthbarZeroHeightStreak = 0;
                }
            }

            function _resetSelfPanelCache() {
                _setCachedPanel("coloredHealthbarHealthBar", null);
                _setCachedPanel("coloredHealthbarProgressLeft", null);
                _setCachedPanel("coloredHealthbarCurrentHealth", null);
            }

            function _resolveSelfPanels(root) {
                var liveHealthContainer = (root && root.FindChildTraverse) ? root.FindChildTraverse(PANEL_ID_HEALTH_CONTAINER) : null;
                var healthContainer = _isPanelValid(liveHealthContainer) ? liveHealthContainer : _getCachedPanel("healthContainer");
                if (healthContainer !== _getCachedPanel("healthContainer")) {
                    _setCachedPanel("healthContainer", healthContainer);
                    _resetSelfPanelCache();
                }
                if (!healthContainer) return null;

                var healthBar = _getCachedPanel("coloredHealthbarHealthBar");
                if (healthBar && !_isDescendantOf(healthBar, healthContainer)) { _resetSelfPanelCache(); healthBar = null; }
                if (!healthBar) {
                    var hudHealthBars = healthContainer.FindChildTraverse ? healthContainer.FindChildTraverse("hud_health_bars") : null;
                    healthBar = hudHealthBars && hudHealthBars.FindChildTraverse ? hudHealthBars.FindChildTraverse("health_bar") : null;
                    if (!healthBar && healthContainer.FindChildTraverse) healthBar = healthContainer.FindChildTraverse("health_bar");
                    _setCachedPanel("coloredHealthbarHealthBar", healthBar);
                }
                if (!healthBar) return null;

                var progressLeft = _getCachedPanel("coloredHealthbarProgressLeft");
                if (progressLeft && !_isDescendantOf(progressLeft, healthBar)) { _setCachedPanel("coloredHealthbarProgressLeft", null); progressLeft = null; }
                if (!progressLeft) {
                    progressLeft = healthBar.FindChild ? healthBar.FindChild("health_bar_left") : null;
                    if (!progressLeft && healthBar.GetChildCount && healthBar.GetChild) {
                        var childCount = healthBar.GetChildCount();
                        for (var i = 0; i < childCount; i++) {
                            var child = null;
                            try { child = healthBar.GetChild(i); } catch(e) { child = null; }
                            if (child && child.BHasClass && child.BHasClass("ProgressBarLeft")) { progressLeft = child; break; }
                        }
                    }
                    _setCachedPanel("coloredHealthbarProgressLeft", progressLeft);
                }
                if (!progressLeft) return null;

                var currentHealth = _getCachedPanel("coloredHealthbarCurrentHealth");
                if (currentHealth && !_isDescendantOf(currentHealth, healthBar)) { _setCachedPanel("coloredHealthbarCurrentHealth", null); currentHealth = null; }
                if (!currentHealth) {
                    currentHealth = healthBar.FindChildTraverse ? healthBar.FindChildTraverse("current_health") : null;
                    _setCachedPanel("coloredHealthbarCurrentHealth", currentHealth);
                }
                return { healthBar: healthBar, progressLeft: progressLeft, currentHealth: currentHealth };
            }

            function _resolveSelfColor(pct, cfg) {
                var State = _getState();
                if (!State) return _toRgbString(COLORED_HEALTHBAR_COLOR_WHITE);
                var use25 = _isCfgEnabled(cfg, "ENABLE_COLOR_WARNING_25");
                var use65 = _isCfgEnabled(cfg, "ENABLE_COLOR_WARNING_65");
                var use75 = _isCfgEnabled(cfg, "ENABLE_COLOR_WARNING_75");
                if (use25 && pct <= COLORED_HEALTHBAR_LOW_HP_THRESHOLD) {
                    State.coloredHealthbarPulseVal += (State.coloredHealthbarPulseDir * COLORED_HEALTHBAR_PULSE_STEP);
                    if (State.coloredHealthbarPulseVal >= 1) { State.coloredHealthbarPulseVal = 1; State.coloredHealthbarPulseDir = -1; }
                    else if (State.coloredHealthbarPulseVal <= 0) { State.coloredHealthbarPulseVal = 0; State.coloredHealthbarPulseDir = 1; }
                    return _toRgbString(_blendRgb(COLORED_HEALTHBAR_COLOR_RED, COLORED_HEALTHBAR_COLOR_DARK_RED, State.coloredHealthbarPulseVal));
                }
                if (use65 && pct <= COLORED_HEALTHBAR_MID_HP_THRESHOLD) return _toRgbString(COLORED_HEALTHBAR_COLOR_ORANGE);
                if (use75 && pct <= COLORED_HEALTHBAR_HIGH_HP_THRESHOLD) return _toRgbString(COLORED_HEALTHBAR_COLOR_YELLOW);
                return _toRgbString(COLORED_HEALTHBAR_COLOR_WHITE);
            }

            function _updateSelf(root, cfg) {
                try {
                    var State = _getState();
                    if (!State) return;
                    var enabled = _isCfgEnabled(cfg, "ENABLE_COLORED_HEALTHBAR") ||
                        _isCfgEnabled(cfg, "ENABLE_COLOR_WARNING_25") ||
                        _isCfgEnabled(cfg, "ENABLE_COLOR_WARNING_65") ||
                        _isCfgEnabled(cfg, "ENABLE_COLOR_WARNING_75");

                    if (State.coloredHealthbarEnabledPrev === null) State.coloredHealthbarEnabledPrev = enabled;
                    else if (State.coloredHealthbarEnabledPrev !== enabled) {
                        if (!enabled) _resetSelfStyles();
                        else { State.coloredHealthbarLastColor = ""; State.coloredHealthbarPulseDir = 1; State.coloredHealthbarPulseVal = 0; State.coloredHealthbarZeroHeightStreak = 0; }
                        _resetSelfPanelCache();
                        State.coloredHealthbarEnabledPrev = enabled;
                    }
                    if (!enabled) {
                        if (State.coloredHealthbarLastColor !== "" || _getCachedPanel("coloredHealthbarHealthBar") || _getCachedPanel("coloredHealthbarProgressLeft") || _getCachedPanel("coloredHealthbarCurrentHealth")) {
                            _resetSelfStyles(); _resetSelfPanelCache();
                        }
                        return;
                    }
                    var panels = _resolveSelfPanels(root);
                    if (!panels || !panels.progressLeft) return;
                    var progressLeft = panels.progressLeft;
                    var parent = progressLeft.GetParent ? progressLeft.GetParent() : null;
                    var pH = Number(progressLeft.actuallayoutheight);
                    var cH = parent ? Number(parent.actuallayoutheight) : 0;
                    if (!isFinite(pH) || !isFinite(cH) || cH <= 0) {
                        State.coloredHealthbarZeroHeightStreak += 1;
                        if (State.coloredHealthbarZeroHeightStreak >= 4) _resetSelfPanelCache();
                        return;
                    }
                    State.coloredHealthbarZeroHeightStreak = 0;
                    var pct = (pH / cH) * 100;
                    var color = _resolveSelfColor(pct, cfg);
                    if (panels.healthBar) _setWashColorSafe(panels.healthBar, color);
                    if (panels.progressLeft) _setWashColorSafe(panels.progressLeft, color);
                    if (panels.currentHealth) { _setStyleSafe(panels.currentHealth, "color", color); _setWashColorSafe(panels.currentHealth, color); }
                    State.coloredHealthbarLastColor = color;
                } catch(e) {
                    _resetSelfStyles(); _resetSelfPanelCache();
                    var State2 = _getState(); if (State2) State2.coloredHealthbarEnabledPrev = null;
                    throw e;
                }
            }

            // ═══════════════════════════════════════════════
            // ENEMY TOP-BAR HEALTHBAR (enemyColorWarning)
            // ═══════════════════════════════════════════════

            function _isEnemyColorWarningEnabled(cfg) {
                if (!cfg) return false;
                return _isCfgEnabled(cfg, "ENABLE_ENEMY_COLORED_HEALTHBAR") ||
                    _isCfgEnabled(cfg, "ENABLE_TOPBAR_ENEMY_HP_WARNING_25") ||
                    _isCfgEnabled(cfg, "ENABLE_TOPBAR_ENEMY_HP_WARNING_65") ||
                    _isCfgEnabled(cfg, "ENABLE_TOPBAR_ENEMY_HP_WARNING_75");
            }

            function _resolveEnemyTeamColor(entry) {
                if (entry && entry.baseColorRgb && entry.baseColorRgb.length === 3) return entry.baseColorRgb;
                var panel = entry && entry.windowRoot ? entry.windowRoot : (entry && entry.healthBar ? entry.healthBar : null);
                if (!panel) return ENEMY_COLORED_HEALTH_TEAM1_COLOR;
                if (_hasClassInHierarchy(panel, "team_neutral") || _hasClassInHierarchy(panel, "neutral")) return ENEMY_COLORED_HEALTH_NEUTRAL_COLOR;
                if (_hasClassInHierarchy(panel, "team2")) return ENEMY_COLORED_HEALTH_TEAM2_COLOR;
                if (_hasClassInHierarchy(panel, "team1")) return ENEMY_COLORED_HEALTH_TEAM1_COLOR;
                return ENEMY_COLORED_HEALTH_TEAM1_COLOR;
            }

            function _resetEnemyStyles() {
                var State = _getState();
                if (!State) return;
                var entries = Array.isArray(State.enemyColoredHealthPanelCache) ? State.enemyColoredHealthPanelCache : [];
                for (var i = 0; i < entries.length; i++) {
                    var entry = entries[i];
                    if (!entry) continue;
                    var teamColor = _toRgbString(_resolveEnemyTeamColor(entry));
                    if (entry.healthBar && _isPanelValid(entry.healthBar)) {
                        _setWashColorSafe(entry.healthBar, "");
                        _setStyleSafe(entry.healthBar, "backgroundColor", teamColor);
                    }
                    entry.lastColor = teamColor;
                }
                State.enemyColoredHealthPulseDir = 1;
                State.enemyColoredHealthPulseVal = 0;
                State.enemyColoredHealthNextUpdateMs = 0;
            }

            function _refreshEnemyPanelCache(root, nowMs) {
                var State = _getState();
                if (!State || !root) return;
                if (nowMs < (State.enemyColoredHealthPanelCacheNextMs || 0)) return;
                var previous = Array.isArray(State.enemyColoredHealthPanelCache) ? State.enemyColoredHealthPanelCache : [];
                var next = [];
                var friendlyTeamClass = _resolveFriendlyTopBarTeamClass(root, nowMs);
                function findPrevious(windowRoot, healthBar) {
                    for (var pi = 0; pi < previous.length; pi++) {
                        var prev = previous[pi];
                        if (prev && (prev.windowRoot === windowRoot || prev.healthBar === healthBar)) return prev;
                    }
                    return null;
                }
                var progressLeftPanels = root.FindChildrenWithClassTraverse ? (root.FindChildrenWithClassTraverse("ProgressBarLeft") || []) : [];
                for (var pli = 0; pli < progressLeftPanels.length; pli++) {
                    var progressLeft = progressLeftPanels[pli];
                    if (!progressLeft || !_isPanelValid(progressLeft)) continue;
                    if (String(progressLeft.id || "") !== "HeroHealth_Left") continue;
                    if (!_hasClassInHierarchy(progressLeft, "enemy")) continue;
                    var heroHealthParent = progressLeft.GetParent ? progressLeft.GetParent() : null;
                    if (!heroHealthParent || !_isPanelValid(heroHealthParent)) continue;
                    if (String(heroHealthParent.id || "") !== "HeroHealth") continue;
                    var healthBarRoot = heroHealthParent.GetParent ? heroHealthParent.GetParent() : null;
                    if (!healthBarRoot || !_isPanelValid(healthBarRoot)) continue;
                    if (String(healthBarRoot.id || "") !== "HealthBar") continue;
                    var prevEntry = findPrevious(healthBarRoot, progressLeft);
                    next.push({
                        windowRoot: healthBarRoot, unitStatusPanel: null, healthBar: progressLeft,
                        healthBarParent: heroHealthParent, ultIcon: null, barId: "HeroHealth_Left",
                        teamClass: _resolveEnemyTeamClass(progressLeft) || "enemy",
                        baseColorRgb: ENEMY_TOPBAR_HEALTH_DEFAULT_COLOR,
                        lastColor: prevEntry ? String(prevEntry.lastColor || "") : ""
                    });
                }
                State.enemyColoredHealthPanelCache = next;
                State.enemyColoredHealthPanelCacheNextMs = nowMs + ENEMY_COLORED_HEALTH_PANEL_SCAN_MS;
            }

            function _resolveEnemyColor(pct, cfg, teamColorRgb) {
                var State = _getState();
                if (!State) return _toRgbString(teamColorRgb || ENEMY_TOPBAR_HEALTH_DEFAULT_COLOR);
                var use25 = _isCfgEnabled(cfg, "ENABLE_TOPBAR_ENEMY_HP_WARNING_25");
                var use65 = _isCfgEnabled(cfg, "ENABLE_TOPBAR_ENEMY_HP_WARNING_65");
                var use75 = _isCfgEnabled(cfg, "ENABLE_TOPBAR_ENEMY_HP_WARNING_75");
                if (use25 && pct <= COLORED_HEALTHBAR_LOW_HP_THRESHOLD)
                    return _toRgbString(_blendRgb(ENEMY_COLORED_HEALTH_PULSE_COLOR, ENEMY_COLORED_HEALTH_PULSE_DARK_COLOR, State.enemyColoredHealthPulseVal));
                if (use65 && pct <= COLORED_HEALTHBAR_MID_HP_THRESHOLD) return _toRgbString(ENEMY_COLORED_HEALTH_MID_COLOR);
                if (use75 && pct <= COLORED_HEALTHBAR_HIGH_HP_THRESHOLD) return _toRgbString(COLORED_HEALTHBAR_COLOR_YELLOW);
                return _toRgbString(teamColorRgb || ENEMY_TOPBAR_HEALTH_DEFAULT_COLOR);
            }

            function _updateEnemy(root, cfg, nowMs) {
                if (!root || !cfg) return;
                var State = _getState();
                if (!State) return;
                var enabled = _isEnemyColorWarningEnabled(cfg);
                if (State.enemyColoredHealthEnabledPrev === null) State.enemyColoredHealthEnabledPrev = enabled;
                else if (State.enemyColoredHealthEnabledPrev !== enabled) {
                    if (!enabled) _resetEnemyStyles();
                    else { State.enemyColoredHealthPulseDir = 1; State.enemyColoredHealthPulseVal = 0; State.enemyColoredHealthNextUpdateMs = 0; }
                    State.enemyColoredHealthEnabledPrev = enabled;
                }
                if (!enabled) {
                    if (Array.isArray(State.enemyColoredHealthPanelCache) && State.enemyColoredHealthPanelCache.length > 0) {
                        _resetEnemyStyles(); State.enemyColoredHealthPanelCache = [];
                    }
                    State.enemyColoredHealthPanelCacheNextMs = 0;
                    return;
                }
                var now = Number(nowMs) || Date.now();
                if (now < (State.enemyColoredHealthNextUpdateMs || 0)) return;
                _refreshEnemyPanelCache(root, now);
                var entries = Array.isArray(State.enemyColoredHealthPanelCache) ? State.enemyColoredHealthPanelCache : [];
                if (entries.length <= 0) { State.enemyColoredHealthNextUpdateMs = now + ENEMY_COLORED_HEALTH_UPDATE_MS; return; }
                var pulseAdvanced = false;
                var use25 = _isCfgEnabled(cfg, "ENABLE_TOPBAR_ENEMY_HP_WARNING_25");
                for (var i = 0; i < entries.length; i++) {
                    var entry = entries[i];
                    if (!entry || !entry.healthBar || !entry.healthBarParent) continue;
                    if (!_isPanelValid(entry.healthBar) || !_isPanelValid(entry.healthBarParent)) continue;
                    var pct = _estimateHealthPercentFromBarHeight(entry);
                    if (!isFinite(pct)) continue;
                    if (!pulseAdvanced && use25 && pct <= COLORED_HEALTHBAR_LOW_HP_THRESHOLD) {
                        State.enemyColoredHealthPulseVal += (State.enemyColoredHealthPulseDir * COLORED_HEALTHBAR_PULSE_STEP);
                        if (State.enemyColoredHealthPulseVal >= 1) { State.enemyColoredHealthPulseVal = 1; State.enemyColoredHealthPulseDir = -1; }
                        else if (State.enemyColoredHealthPulseVal <= 0) { State.enemyColoredHealthPulseVal = 0; State.enemyColoredHealthPulseDir = 1; }
                        pulseAdvanced = true;
                    }
                    var teamColor = _resolveEnemyTeamColor(entry);
                    var nextColor = _resolveEnemyColor(pct, cfg, teamColor);
                    if (String(entry.lastColor || "") === nextColor) continue;
                    if (entry.healthBar && _isPanelValid(entry.healthBar)) {
                        _setWashColorSafe(entry.healthBar, "");
                        _setStyleSafe(entry.healthBar, "backgroundColor", nextColor);
                    }
                    entry.lastColor = nextColor;
                }
                State.enemyColoredHealthNextUpdateMs = now + ENEMY_COLORED_HEALTH_UPDATE_MS;
            }

            // ═══════════════════════════════════════════════
            // ALLY TOP-BAR HEALTHBAR (allyColorWarning)
            // ═══════════════════════════════════════════════

            function _isAllyColorWarningEnabled(cfg) {
                if (!cfg) return false;
                return _isCfgEnabled(cfg, "ENABLE_ALLY_COLORED_HEALTHBAR") ||
                    _isCfgEnabled(cfg, "ENABLE_TOPBAR_ALLY_HP_WARNING_25") ||
                    _isCfgEnabled(cfg, "ENABLE_TOPBAR_ALLY_HP_WARNING_65") ||
                    _isCfgEnabled(cfg, "ENABLE_TOPBAR_ALLY_HP_WARNING_75");
            }

            function _resetAllyStyles() {
                var State = _getState();
                if (!State) return;
                var entries = Array.isArray(State.allyColoredHealthPanelCache) ? State.allyColoredHealthPanelCache : [];
                for (var i = 0; i < entries.length; i++) {
                    var entry = entries[i];
                    if (!entry) continue;
                    var teamColor = _toRgbString(ALLY_TOPBAR_HEALTH_DEFAULT_COLOR);
                    if (entry.healthBar && _isPanelValid(entry.healthBar)) {
                        _setWashColorSafe(entry.healthBar, "");
                        _setStyleSafe(entry.healthBar, "backgroundColor", teamColor);
                    }
                    entry.lastColor = teamColor;
                }
                State.allyColoredHealthPulseDir = 1;
                State.allyColoredHealthPulseVal = 0;
                State.allyColoredHealthNextUpdateMs = 0;
            }

            function _refreshAllyPanelCache(root, nowMs) {
                var State = _getState();
                if (!State || !root) return;
                if (nowMs < (State.allyColoredHealthPanelCacheNextMs || 0)) return;
                var previous = Array.isArray(State.allyColoredHealthPanelCache) ? State.allyColoredHealthPanelCache : [];
                var next = [];
                function findPrevious(windowRoot, healthBar) {
                    for (var pi = 0; pi < previous.length; pi++) {
                        var prev = previous[pi];
                        if (prev && (prev.windowRoot === windowRoot || prev.healthBar === healthBar)) return prev;
                    }
                    return null;
                }
                var progressLeftPanels = root.FindChildrenWithClassTraverse ? (root.FindChildrenWithClassTraverse("ProgressBarLeft") || []) : [];
                for (var pli = 0; pli < progressLeftPanels.length; pli++) {
                    var progressLeft = progressLeftPanels[pli];
                    if (!progressLeft || !_isPanelValid(progressLeft)) continue;
                    if (String(progressLeft.id || "") !== "HeroHealth_Left") continue;
                    if (!_hasClassInHierarchy(progressLeft, "friend")) continue;
                    var heroHealthParent = progressLeft.GetParent ? progressLeft.GetParent() : null;
                    if (!heroHealthParent || !_isPanelValid(heroHealthParent)) continue;
                    if (String(heroHealthParent.id || "") !== "HeroHealth") continue;
                    var healthBarRoot = heroHealthParent.GetParent ? heroHealthParent.GetParent() : null;
                    if (!healthBarRoot || !_isPanelValid(healthBarRoot)) continue;
                    if (String(healthBarRoot.id || "") !== "HealthBar") continue;
                    var prevEntry = findPrevious(healthBarRoot, progressLeft);
                    next.push({
                        windowRoot: healthBarRoot, unitStatusPanel: null, healthBar: progressLeft,
                        healthBarParent: heroHealthParent, ultIcon: null, barId: "HeroHealth_Left",
                        teamClass: "friend", baseColorRgb: ALLY_TOPBAR_HEALTH_DEFAULT_COLOR,
                        lastColor: prevEntry ? String(prevEntry.lastColor || "") : ""
                    });
                }
                State.allyColoredHealthPanelCache = next;
                State.allyColoredHealthPanelCacheNextMs = nowMs + ENEMY_COLORED_HEALTH_PANEL_SCAN_MS;
            }

            function _resolveAllyColor(pct, cfg, teamColorRgb) {
                var State = _getState();
                if (!State) return _toRgbString(teamColorRgb || ALLY_TOPBAR_HEALTH_DEFAULT_COLOR);
                var use25 = _isCfgEnabled(cfg, "ENABLE_TOPBAR_ALLY_HP_WARNING_25");
                var use65 = _isCfgEnabled(cfg, "ENABLE_TOPBAR_ALLY_HP_WARNING_65");
                var use75 = _isCfgEnabled(cfg, "ENABLE_TOPBAR_ALLY_HP_WARNING_75");
                if (use25 && pct <= COLORED_HEALTHBAR_LOW_HP_THRESHOLD)
                    return _toRgbString(_blendRgb(COLORED_HEALTHBAR_COLOR_RED, COLORED_HEALTHBAR_COLOR_DARK_RED, State.allyColoredHealthPulseVal));
                if (use65 && pct <= COLORED_HEALTHBAR_MID_HP_THRESHOLD) return _toRgbString(COLORED_HEALTHBAR_COLOR_ORANGE);
                if (use75 && pct <= COLORED_HEALTHBAR_HIGH_HP_THRESHOLD) return _toRgbString(COLORED_HEALTHBAR_COLOR_YELLOW);
                return _toRgbString(teamColorRgb || ALLY_TOPBAR_HEALTH_DEFAULT_COLOR);
            }

            function _updateAlly(root, cfg, nowMs) {
                if (!root || !cfg) return;
                var State = _getState();
                if (!State) return;
                var enabled = _isAllyColorWarningEnabled(cfg);
                if (State.allyColoredHealthEnabledPrev === null) State.allyColoredHealthEnabledPrev = enabled;
                else if (State.allyColoredHealthEnabledPrev !== enabled) {
                    if (!enabled) _resetAllyStyles();
                    else { State.allyColoredHealthPulseDir = 1; State.allyColoredHealthPulseVal = 0; State.allyColoredHealthNextUpdateMs = 0; }
                    State.allyColoredHealthEnabledPrev = enabled;
                }
                if (!enabled) {
                    if (Array.isArray(State.allyColoredHealthPanelCache) && State.allyColoredHealthPanelCache.length > 0) {
                        _resetAllyStyles(); State.allyColoredHealthPanelCache = [];
                    }
                    State.allyColoredHealthPanelCacheNextMs = 0;
                    return;
                }
                var now = Number(nowMs) || Date.now();
                if (now < (State.allyColoredHealthNextUpdateMs || 0)) return;
                _refreshAllyPanelCache(root, now);
                var entries = Array.isArray(State.allyColoredHealthPanelCache) ? State.allyColoredHealthPanelCache : [];
                if (entries.length <= 0) { State.allyColoredHealthNextUpdateMs = now + ENEMY_COLORED_HEALTH_UPDATE_MS; return; }
                var pulseAdvanced = false;
                var use25 = _isCfgEnabled(cfg, "ENABLE_TOPBAR_ALLY_HP_WARNING_25");
                for (var i = 0; i < entries.length; i++) {
                    var entry = entries[i];
                    if (!entry || !entry.healthBar || !entry.healthBarParent) continue;
                    if (!_isPanelValid(entry.healthBar) || !_isPanelValid(entry.healthBarParent)) continue;
                    var pct = _estimateHealthPercentFromBarHeight(entry);
                    if (!isFinite(pct)) continue;
                    if (!pulseAdvanced && use25 && pct <= COLORED_HEALTHBAR_LOW_HP_THRESHOLD) {
                        State.allyColoredHealthPulseVal += (State.allyColoredHealthPulseDir * COLORED_HEALTHBAR_PULSE_STEP);
                        if (State.allyColoredHealthPulseVal >= 1) { State.allyColoredHealthPulseVal = 1; State.allyColoredHealthPulseDir = -1; }
                        else if (State.allyColoredHealthPulseVal <= 0) { State.allyColoredHealthPulseVal = 0; State.allyColoredHealthPulseDir = 1; }
                        pulseAdvanced = true;
                    }
                    var nextColor = _resolveAllyColor(pct, cfg, ALLY_TOPBAR_HEALTH_DEFAULT_COLOR);
                    if (String(entry.lastColor || "") === nextColor) continue;
                    if (entry.healthBar && _isPanelValid(entry.healthBar)) {
                        _setWashColorSafe(entry.healthBar, "");
                        _setStyleSafe(entry.healthBar, "backgroundColor", nextColor);
                    }
                    entry.lastColor = nextColor;
                }
                State.allyColoredHealthNextUpdateMs = now + ENEMY_COLORED_HEALTH_UPDATE_MS;
            }

            // ═══════════════════════════════════════════════
            // MAIN TICK
            // ═══════════════════════════════════════════════

            function _tick() {
                try {
                    var cfg = ctx.config.all();
                    var root = $.GetContextPanel();
                    if (!_isPanelValid(root)) return;

                    var nowMs = Date.now ? Date.now() : (new Date()).getTime();

                    // Self healthbar
                    var anySelf = _isCfgEnabled(cfg, "ENABLE_COLORED_HEALTHBAR") ||
                        _isCfgEnabled(cfg, "ENABLE_COLOR_WARNING_25") ||
                        _isCfgEnabled(cfg, "ENABLE_COLOR_WARNING_65") ||
                        _isCfgEnabled(cfg, "ENABLE_COLOR_WARNING_75");
                    if (anySelf) _updateSelf(root, cfg);

                    // Enemy top-bar
                    var anyEnemy = _isCfgEnabled(cfg, "ENABLE_ENEMY_COLORED_HEALTHBAR") ||
                        _isCfgEnabled(cfg, "ENABLE_TOPBAR_ENEMY_HP_WARNING_25") ||
                        _isCfgEnabled(cfg, "ENABLE_TOPBAR_ENEMY_HP_WARNING_65") ||
                        _isCfgEnabled(cfg, "ENABLE_TOPBAR_ENEMY_HP_WARNING_75");
                    if (anyEnemy) _updateEnemy(root, cfg, nowMs);

                    // Ally top-bar
                    var anyAlly = _isCfgEnabled(cfg, "ENABLE_ALLY_COLORED_HEALTHBAR") ||
                        _isCfgEnabled(cfg, "ENABLE_TOPBAR_ALLY_HP_WARNING_25") ||
                        _isCfgEnabled(cfg, "ENABLE_TOPBAR_ALLY_HP_WARNING_65") ||
                        _isCfgEnabled(cfg, "ENABLE_TOPBAR_ALLY_HP_WARNING_75");
                    if (anyAlly) _updateAlly(root, cfg, nowMs);
                } catch(e) {
                    logger.logError("ql_color_warnings", "_tick threw: " + (e.message || e));
                    throw e;
                }
            }

            return {
                onEnable: function() {
                    var S = QOL.core.Scheduler;
                    _loop = S && S.createPollLoop ? S.createPollLoop(_tick, 0.16, "ql_color_warnings") : null;
                },
                onDisable: function() {
                    if (_loop) { _loop.stop(); _loop = null; }
                    var S = QOL.core.Scheduler;
                    if (S) S.cancelAllForFeature("ql_color_warnings");
                    logger.clearThrottle("ql_color_warnings");
                    // Reset all three subsystems
                    _resetSelfStyles(); _resetSelfPanelCache();
                    _resetEnemyStyles();
                    _resetAllyStyles();
                    var State = _getState();
                    if (State) {
                        State.coloredHealthbarEnabledPrev = null;
                        State.enemyColoredHealthEnabledPrev = null;
                        State.enemyColoredHealthPanelCache = [];
                        State.enemyColoredHealthPanelCacheNextMs = 0;
                        State.allyColoredHealthEnabledPrev = null;
                        State.allyColoredHealthPanelCache = [];
                        State.allyColoredHealthPanelCacheNextMs = 0;
                    }
                },
                onSettingsChanged: function() {}
            };
        },
        test: function(ctx) {
            try {
                var root = $.GetContextPanel();
                if (!root || typeof root.FindChildrenWithClassTraverse !== "function") return null;
                var bars = root.FindChildrenWithClassTraverse("ProgressBarLeft") || [];
                if (bars.length === 0) return null;
                return { passed: true, name: "Color warning progress bars found", message: "Found " + bars.length + " ProgressBarLeft panels", assertions: [{ passed: true, name: "ProgressBarLeft traversal succeeded (" + bars.length + " found)" }] };
            } catch(e) { return { passed: false, name: "Color warnings panel check", message: (e && e.message ? e.message : String(e)) }; }
        }
    });
})();

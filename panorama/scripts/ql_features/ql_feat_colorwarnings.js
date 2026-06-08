// ql_feat_colorwarnings.js — Color-coded healthbar warnings (self/enemy/ally)
// Bundles 3 features that share IsColorWarningEnabled logic
// Extracted from ql_core.js, Phase 9 Step 2c
(function() {
    'use strict';
    $.Msg("[QOL DEBUG] Feature loaded: colorWarnings");
    var S = typeof QOL_STATE !== "undefined" ? QOL_STATE : undefined;
    var GC = typeof QOL_GetCachedPanel !== "undefined" ? QOL_GetCachedPanel : undefined;
    var SC = typeof QOL_SetCachedPanel !== "undefined" ? QOL_SetCachedPanel : undefined;
    var U = typeof QOL_UTILS !== "undefined" ? QOL_UTILS : undefined;
    var SetStyleSafe = U ? U.SetStyleSafe : function() {};
    var ClearStyleSafe = U ? U.ClearStyleSafe : function() {};
    var IsPanelValid = U ? U.IsPanelValid : function() { return false; };
    var IsCfgEnabled = U ? U.IsCfgEnabled : function() { return false; };
    var IsColorWarningEnabled = typeof QOL_IsColorWarningEnabled !== "undefined" ? QOL_IsColorWarningEnabled : function() { return false; };

    if (typeof window !== "undefined" && !window._qol_feat_deps_logged) {
        window._qol_feat_deps_logged = {};
    }
    var _dk = "ql_feat_colorwarnings";
    if (typeof window !== "undefined" && window._qol_feat_deps_logged && !window._qol_feat_deps_logged[_dk]) {
        var _m = [];
        if (typeof QOL_STATE === "undefined") _m.push("QOL_STATE");
        if (typeof QOL_GetCachedPanel === "undefined") _m.push("QOL_GetCachedPanel");
        if (typeof QOL_SetCachedPanel === "undefined") _m.push("QOL_SetCachedPanel");
        if (typeof QOL_UTILS === "undefined") _m.push("QOL_UTILS");
        if (typeof QOL_IsColorWarningEnabled === "undefined") _m.push("QOL_IsColorWarningEnabled");
        if (_m.length > 0) {
            $.Msg("[QOLLock] WARNING: " + _dk + " missing " + _m.length + " bridge(s): " + _m.join(", ") + " — feature will fail");
        }
        window._qol_feat_deps_logged[_dk] = true;
    }

    var ENEMY_COLORED_HEALTH_UPDATE_MS = 160;
    var COLORED_HEALTHBAR_LOW_HP_THRESHOLD = 25;
    var COLORED_HEALTHBAR_COLOR_WHITE = [255, 255, 255];
    var COLORED_HEALTHBAR_PULSE_STEP = 0.1;
    var ALLY_TOPBAR_HEALTH_DEFAULT_COLOR = COLORED_HEALTHBAR_COLOR_WHITE;
function ResetColoredHealthbarRuntimeStyles() {
        var healthBar = GetCachedPanel("coloredHealthbarHealthBar");
        var progressLeft = GetCachedPanel("coloredHealthbarProgressLeft");
        var currentHealth = GetCachedPanel("coloredHealthbarCurrentHealth");

        if (healthBar) SetWashColorSafe(healthBar, "white");
        if (progressLeft) SetWashColorSafe(progressLeft, "white");
        if (currentHealth) {
            SetStyleSafe(currentHealth, "color", "white");
            SetWashColorSafe(currentHealth, "white");
        }

        S.coloredHealthbarLastColor = "";
        S.coloredHealthbarPulseDir = 1;
        S.coloredHealthbarPulseVal = 0;
        S.coloredHealthbarZeroHeightStreak = 0;
    }
function ResetColoredHealthbarPanelCache() {
        SetCachedPanel("coloredHealthbarHealthBar", null);
        SetCachedPanel("coloredHealthbarProgressLeft", null);
        SetCachedPanel("coloredHealthbarCurrentHealth", null);
    }
function ResolveColoredHealthbarPanels(root) {
        var liveHealthContainer = (root && root.FindChildTraverse) ? root.FindChildTraverse(PANEL_ID_HEALTH_CONTAINER) : null;
        var healthContainer = IsPanelValid(liveHealthContainer) ? liveHealthContainer : (GetCachedPanel("healthContainer"));
        if (healthContainer !== GetCachedPanel("healthContainer")) {
            SetCachedPanel("healthContainer", healthContainer);
            ResetColoredHealthbarPanelCache();
        }
        if (!healthContainer) return null;

        var healthBar = GetCachedPanel("coloredHealthbarHealthBar");
        if (healthBar && !IsDescendantOf(healthBar, healthContainer)) {
            ResetColoredHealthbarPanelCache();
            healthBar = null;
        }
        if (!healthBar) {
            var hudHealthBars = healthContainer.FindChildTraverse ? healthContainer.FindChildTraverse("hud_health_bars") : null;
            healthBar = hudHealthBars && hudHealthBars.FindChildTraverse ? hudHealthBars.FindChildTraverse("health_bar") : null;
            if (!healthBar && healthContainer.FindChildTraverse) {
                healthBar = healthContainer.FindChildTraverse("health_bar");
            }
            SetCachedPanel("coloredHealthbarHealthBar", healthBar);
        }
        if (!healthBar) return null;

        var progressLeft = GetCachedPanel("coloredHealthbarProgressLeft");
        if (progressLeft && !IsDescendantOf(progressLeft, healthBar)) {
            SetCachedPanel("coloredHealthbarProgressLeft", null);
            progressLeft = null;
        }
        if (!progressLeft) {
            progressLeft = healthBar.FindChild ? healthBar.FindChild("health_bar_left") : null;
            if (!progressLeft && healthBar.GetChildCount && healthBar.GetChild) {
                var childCount = healthBar.GetChildCount();
                for (var i = 0; i < childCount; i++) {
                    var child = null;
                    try {
                        child = healthBar.GetChild(i);
                    } catch (e) {
                        child = null;
                    }
                    if (child && child.BHasClass && child.BHasClass("ProgressBarLeft")) {
                        progressLeft = child;
                        break;
                    }
                }
            }
            SetCachedPanel("coloredHealthbarProgressLeft", progressLeft);
        }
        if (!progressLeft) return null;

        var currentHealth = GetCachedPanel("coloredHealthbarCurrentHealth");
        if (currentHealth && !IsDescendantOf(currentHealth, healthBar)) {
            SetCachedPanel("coloredHealthbarCurrentHealth", null);
            currentHealth = null;
        }
        if (!currentHealth) {
            currentHealth = healthBar.FindChildTraverse ? healthBar.FindChildTraverse("current_health") : null;
            SetCachedPanel("coloredHealthbarCurrentHealth", currentHealth);
        }

        return {
            healthBar: healthBar,
            progressLeft: progressLeft,
            currentHealth: currentHealth
        };
    }
function ResolveColoredHealthbarColor(pct, cfg) {
        var use25 = IsCfgEnabled(cfg, "ENABLE_COLOR_WARNING_25");
        var use65 = IsCfgEnabled(cfg, "ENABLE_COLOR_WARNING_65");
        var use75 = IsCfgEnabled(cfg, "ENABLE_COLOR_WARNING_75");

        if (use25 && pct <= COLORED_HEALTHBAR_LOW_HP_THRESHOLD) {
            S.coloredHealthbarPulseVal += (S.coloredHealthbarPulseDir * COLORED_HEALTHBAR_PULSE_STEP);
            if (S.coloredHealthbarPulseVal >= 1) {
                S.coloredHealthbarPulseVal = 1;
                S.coloredHealthbarPulseDir = -1;
            } else if (S.coloredHealthbarPulseVal <= 0) {
                S.coloredHealthbarPulseVal = 0;
                S.coloredHealthbarPulseDir = 1;
            }
            return ToRgbString(BlendRgb(COLORED_HEALTHBAR_COLOR_RED, COLORED_HEALTHBAR_COLOR_DARK_RED, S.coloredHealthbarPulseVal));
        }
        if (use65 && pct <= COLORED_HEALTHBAR_MID_HP_THRESHOLD) return ToRgbString(COLORED_HEALTHBAR_COLOR_ORANGE);
        if (use75 && pct <= COLORED_HEALTHBAR_HIGH_HP_THRESHOLD) return ToRgbString(COLORED_HEALTHBAR_COLOR_YELLOW);
        return ToRgbString(COLORED_HEALTHBAR_COLOR_WHITE);
    }
function IsEnemyColorWarningEnabled(cfg) {
        if (!cfg) return false;
        return IsColorWarningEnabled(cfg) ||
            IsCfgEnabled(cfg, "ENABLE_TOPBAR_ENEMY_HP_WARNING_75");
    }
function ResetEnemyColoredHealthRuntimeStyles() {
        var entries = Array.isArray(S.enemyColoredHealthPanelCache) ? S.enemyColoredHealthPanelCache : [];
        for (var i = 0; i < entries.length; i++) {
            var entry = entries[i];
            if (!entry) continue;
            var teamColor = ToRgbString(ResolveEnemyColoredHealthTeamColor(entry));
            if (entry.healthBar && IsPanelValid(entry.healthBar)) {
                SetWashColorSafe(entry.healthBar, "");
                SetStyleSafe(entry.healthBar, "backgroundColor", teamColor);
            }
            entry.lastColor = teamColor;
        }
        S.enemyColoredHealthPulseDir = 1;
        S.enemyColoredHealthPulseVal = 0;
        S.enemyColoredHealthNextUpdateMs = 0;
    }
function RefreshEnemyColoredHealthPanelCache(root, nowMs) {
        if (!root) return;
        if (nowMs < (S.enemyColoredHealthPanelCacheNextMs || 0)) {
            return;
        }

        var previous = Array.isArray(S.enemyColoredHealthPanelCache) ? S.enemyColoredHealthPanelCache : [];
        var next = [];
        var stats = {
            roots: 0,
            unitStatus: 0,
            unitStatusOld: 0,
            candidates: 0,
            foundLagging: 0,
            foundState: 0,
            skippedNoEnemy: 0,
            inferredByTeam: 0,
            friendlyTeamClass: "",
            topbarFound: 0,
            entries: 0
        };
        var friendlyTeamClass = ResolveFriendlyTopBarTeamClass(root, nowMs);
        stats.friendlyTeamClass = friendlyTeamClass || "";

        function findPrevious(windowRoot, healthBar) {
            for (var pi = 0; pi < previous.length; pi++) {
                var prev = previous[pi];
                if (prev && (prev.windowRoot === windowRoot || prev.healthBar === healthBar)) return prev;
            }
            return null;
        }

        var teamEnemy = root.FindChildTraverse ? (root.FindChildTraverse("TeamEnemy") || null) : null;
        stats.roots = teamEnemy && IsPanelValid(teamEnemy) ? 1 : 0;
        var progressLeftPanels = root.FindChildrenWithClassTraverse ? (root.FindChildrenWithClassTraverse("ProgressBarLeft") || []) : [];
        stats.candidates = progressLeftPanels.length;
        for (var pli = 0; pli < progressLeftPanels.length; pli++) {
            var progressLeft = progressLeftPanels[pli];
            if (!progressLeft || !IsPanelValid(progressLeft)) continue;

            var progressLeftId = progressLeft.id ? String(progressLeft.id) : "";
            if (progressLeftId !== "HeroHealth_Left") continue;
            if (!hasClassInHierarchy(progressLeft, "enemy")) continue;

            var heroHealthParent = progressLeft.GetParent ? progressLeft.GetParent() : null;
            if (!heroHealthParent || !IsPanelValid(heroHealthParent)) continue;
            var heroHealthId = heroHealthParent.id ? String(heroHealthParent.id) : "";
            if (heroHealthId !== "HeroHealth") continue;

            var healthBarRoot = heroHealthParent.GetParent ? heroHealthParent.GetParent() : null;
            if (!healthBarRoot || !IsPanelValid(healthBarRoot)) continue;
            var healthBarId = healthBarRoot.id ? String(healthBarRoot.id) : "";
            if (healthBarId !== "HealthBar") continue;

            var prevEntry = findPrevious(healthBarRoot, progressLeft);
            next.push({
                windowRoot: healthBarRoot,
                unitStatusPanel: null,
                healthBar: progressLeft,
                healthBarParent: heroHealthParent,
                ultIcon: null,
                barId: "HeroHealth_Left",
                teamClass: ResolveEnemyColoredHealthTeamClass(progressLeft) || "enemy",
                baseColorRgb: ENEMY_TOPBAR_HEALTH_DEFAULT_COLOR,
                lastColor: prevEntry ? String(prevEntry.lastColor || "") : ""
            });
        }
        stats.topbarFound = next.length;
        if (next.length > 0) stats.foundLagging = next.length;

        EnemyColoredHealthDebugLogThrottled(
            "cache|" + String(stats.topbarFound) + "|" + String(stats.entries),
            "cache teamEnemy=" + (teamEnemy ? "1" : "0") +
                " progressLeftPanels=" + String(progressLeftPanels.length) +
                " enemyHeroHealthLefts=" + String(next.length) +
                " entries=" + String(next.length),
            nowMs
        );

        S.enemyColoredHealthPanelCache = next;
        S.enemyColoredHealthPanelCacheNextMs = nowMs + ENEMY_COLORED_HEALTH_PANEL_SCAN_MS;
        stats.entries = next.length;
        S.enemyColoredHealthLastScanStats = stats;
    }
function EnemyColoredHealthDebugLogThrottled(sig, msg, nowMs) {
        if (!ENEMY_COLORED_HEALTH_DEBUG) return;
        var now = Number(nowMs) || (Date.now ? Date.now() : (new Date()).getTime());
        var sameSig = sig && sig === S.enemyColoredHealthDebugLastSig;
        if (sameSig && now < (S.enemyColoredHealthDebugNextMs || 0)) return;
        S.enemyColoredHealthDebugLastSig = sig || "";
        S.enemyColoredHealthDebugNextMs = now + ENEMY_COLORED_HEALTH_DEBUG_THROTTLE_MS;
        EnemyColoredHealthDebugLog(msg);
    }
function ResolveTopBarHealthPct(entry) {
        if (!entry) return NaN;
        var fillPanel = entry.healthBar || null;
        var fillSize = fillPanel && IsPanelValid(fillPanel) ? Number(fillPanel.actuallayoutheight) : NaN;
        if (!isFinite(fillSize) || fillSize < 0) return NaN;
        var pct = (fillSize / 60) * 100;
        if (!isFinite(pct)) return NaN;
        if (pct < 0) pct = 0;
        if (pct > 100) pct = 100;
        return pct;
    }
function ResolveEnemyColoredHealthTeamColor(entry) {
        if (entry && entry.baseColorRgb && entry.baseColorRgb.length === 3) {
            return entry.baseColorRgb;
        }
        var panel = entry && entry.windowRoot ? entry.windowRoot : (entry && entry.healthBar ? entry.healthBar : null);
        if (!panel) return ENEMY_COLORED_HEALTH_TEAM1_COLOR;
        if (hasClassInHierarchy(panel, "team_neutral") || hasClassInHierarchy(panel, "neutral")) {
            return ENEMY_COLORED_HEALTH_NEUTRAL_COLOR;
        }
        if (hasClassInHierarchy(panel, "team2")) return ENEMY_COLORED_HEALTH_TEAM2_COLOR;
        if (hasClassInHierarchy(panel, "team1")) return ENEMY_COLORED_HEALTH_TEAM1_COLOR;
        return ENEMY_COLORED_HEALTH_TEAM1_COLOR;
    }
function ResolveEnemyColoredHealthColor(pct, cfg, teamColorRgb) {
        var use25 = IsCfgEnabled(cfg, "ENABLE_TOPBAR_ENEMY_HP_WARNING_25");
        var use65 = IsCfgEnabled(cfg, "ENABLE_TOPBAR_ENEMY_HP_WARNING_65");
        var use75 = IsCfgEnabled(cfg, "ENABLE_TOPBAR_ENEMY_HP_WARNING_75");

        if (use25 && pct <= COLORED_HEALTHBAR_LOW_HP_THRESHOLD) {
            return ToRgbString(BlendRgb(
                ENEMY_COLORED_HEALTH_PULSE_COLOR,
                ENEMY_COLORED_HEALTH_PULSE_DARK_COLOR,
                S.enemyColoredHealthPulseVal
            ));
        }
        if (use65 && pct <= COLORED_HEALTHBAR_MID_HP_THRESHOLD) {
            return ToRgbString(ENEMY_COLORED_HEALTH_MID_COLOR);
        }
        if (use75 && pct <= COLORED_HEALTHBAR_HIGH_HP_THRESHOLD) {
            return ToRgbString(COLORED_HEALTHBAR_COLOR_YELLOW);
        }
        return ToRgbString(teamColorRgb || ENEMY_TOPBAR_HEALTH_DEFAULT_COLOR);
    }
function IsAllyColorWarningEnabled(cfg) {
        if (!cfg) return false;
        return IsColorWarningEnabled(cfg) ||
            IsCfgEnabled(cfg, "ENABLE_TOPBAR_ALLY_HP_WARNING_75");
    }
function ResetAllyColoredHealthRuntimeStyles() {
        var entries = Array.isArray(S.allyColoredHealthPanelCache) ? S.allyColoredHealthPanelCache : [];
        for (var i = 0; i < entries.length; i++) {
            var entry = entries[i];
            if (!entry) continue;
            var teamColor = ToRgbString(ALLY_TOPBAR_HEALTH_DEFAULT_COLOR);
            if (entry.healthBar && IsPanelValid(entry.healthBar)) {
                SetWashColorSafe(entry.healthBar, "");
                SetStyleSafe(entry.healthBar, "backgroundColor", teamColor);
            }
            entry.lastColor = teamColor;
        }
        S.allyColoredHealthPulseDir = 1;
        S.allyColoredHealthPulseVal = 0;
        S.allyColoredHealthNextUpdateMs = 0;
    }
function RefreshAllyColoredHealthPanelCache(root, nowMs) {
        if (!root) return;
        if (nowMs < (S.allyColoredHealthPanelCacheNextMs || 0)) {
            return;
        }

        var previous = Array.isArray(S.allyColoredHealthPanelCache) ? S.allyColoredHealthPanelCache : [];
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
            if (!progressLeft || !IsPanelValid(progressLeft)) continue;

            var progressLeftId = progressLeft.id ? String(progressLeft.id) : "";
            if (progressLeftId !== "HeroHealth_Left") continue;
            if (!hasClassInHierarchy(progressLeft, "friend")) continue;

            var heroHealthParent = progressLeft.GetParent ? progressLeft.GetParent() : null;
            if (!heroHealthParent || !IsPanelValid(heroHealthParent)) continue;
            if (String(heroHealthParent.id || "") !== "HeroHealth") continue;

            var healthBarRoot = heroHealthParent.GetParent ? heroHealthParent.GetParent() : null;
            if (!healthBarRoot || !IsPanelValid(healthBarRoot)) continue;
            if (String(healthBarRoot.id || "") !== "HealthBar") continue;

            var prevEntry = findPrevious(healthBarRoot, progressLeft);
            next.push({
                windowRoot: healthBarRoot,
                unitStatusPanel: null,
                healthBar: progressLeft,
                healthBarParent: heroHealthParent,
                ultIcon: null,
                barId: "HeroHealth_Left",
                teamClass: "friend",
                baseColorRgb: ALLY_TOPBAR_HEALTH_DEFAULT_COLOR,
                lastColor: prevEntry ? String(prevEntry.lastColor || "") : ""
            });
        }

        S.allyColoredHealthPanelCache = next;
        S.allyColoredHealthPanelCacheNextMs = nowMs + ENEMY_COLORED_HEALTH_PANEL_SCAN_MS;
    }
function ResolveAllyColoredHealthColor(pct, cfg, teamColorRgb) {
        var use25 = IsCfgEnabled(cfg, "ENABLE_TOPBAR_ALLY_HP_WARNING_25");
        var use65 = IsCfgEnabled(cfg, "ENABLE_TOPBAR_ALLY_HP_WARNING_65");
        var use75 = IsCfgEnabled(cfg, "ENABLE_TOPBAR_ALLY_HP_WARNING_75");

        if (use25 && pct <= COLORED_HEALTHBAR_LOW_HP_THRESHOLD) {
            return ToRgbString(BlendRgb(
                COLORED_HEALTHBAR_COLOR_RED,
                COLORED_HEALTHBAR_COLOR_DARK_RED,
                S.allyColoredHealthPulseVal
            ));
        }
        if (use65 && pct <= COLORED_HEALTHBAR_MID_HP_THRESHOLD) {
            return ToRgbString(COLORED_HEALTHBAR_COLOR_ORANGE);
        }
        if (use75 && pct <= COLORED_HEALTHBAR_HIGH_HP_THRESHOLD) {
            return ToRgbString(COLORED_HEALTHBAR_COLOR_YELLOW);
        }
        return ToRgbString(teamColorRgb || ALLY_TOPBAR_HEALTH_DEFAULT_COLOR);
    }
    var COLORED_HEALTHBAR_COLOR_DARK_RED = [222, 0, 0];
    var COLORED_HEALTHBAR_COLOR_ORANGE = [255, 177, 0];
    var COLORED_HEALTHBAR_COLOR_RED = [255, 0, 0];
    var COLORED_HEALTHBAR_COLOR_YELLOW = [255, 240, 120];
    var COLORED_HEALTHBAR_HIGH_HP_THRESHOLD = 75;
    var COLORED_HEALTHBAR_MID_HP_THRESHOLD = 65;
    var ENEMY_COLORED_HEALTH_DEBUG = false;
    var ENEMY_COLORED_HEALTH_DEBUG_THROTTLE_MS = 700;
    var ENEMY_COLORED_HEALTH_MID_COLOR = [255, 123, 0];
    var ENEMY_COLORED_HEALTH_NEUTRAL_COLOR = [91, 239, 181];
    var ENEMY_COLORED_HEALTH_PANEL_SCAN_MS = 1200;
    var ENEMY_COLORED_HEALTH_PULSE_COLOR = [225, 97, 97];
    var ENEMY_COLORED_HEALTH_PULSE_DARK_COLOR = [85, 28, 28];
    var ENEMY_COLORED_HEALTH_TEAM1_COLOR = [255, 201, 97];
    var ENEMY_COLORED_HEALTH_TEAM2_COLOR = [100, 133, 252];
    var ENEMY_TOPBAR_HEALTH_DEFAULT_COLOR = [255, 86, 86];
    var PANEL_ID_HEALTH_CONTAINER = "health_and_abilities_container";
function BlendRgb(a, b, t) {
        return [
            Math.round(a[0] + ((b[0] - a[0]) * t)),
            Math.round(a[1] + ((b[1] - a[1]) * t)),
            Math.round(a[2] + ((b[2] - a[2]) * t))
        ];
    }
function EnemyColoredHealthDebugLog(msg) {
        if (!ENEMY_COLORED_HEALTH_DEBUG) return;
        $.Msg("[QOLLock][EnemyColoredHealthDbg] " + msg);
    }
var GetCachedPanel = function(k) {
        var p = S.cachedPanels[k];
        if (IsPanelValid(p)) return p;
        S.cachedPanels[k] = null;
        return null;
    };
function IsColorWarningEnabled(cfg) {
        if (!cfg) return false;
        return IsCfgEnabled(cfg, "ENABLE_COLOR_WARNING_25") ||
            IsCfgEnabled(cfg, "ENABLE_COLOR_WARNING_65") ||
            IsCfgEnabled(cfg, "ENABLE_COLOR_WARNING_75");
    }
function IsDescendantOf(panel, ancestor) {
        if (!panel || !ancestor) return false;
        var current = panel;
        while (current) {
            if (current === ancestor) return true;
            current = current.GetParent ? current.GetParent() : null;
        }
        return false;
    }
function ResolveEnemyColoredHealthTeamClass(panel) {
        if (!panel) return "";
        if (hasClassInHierarchy(panel, "team1")) return "team1";
        if (hasClassInHierarchy(panel, "team2")) return "team2";
        if (hasClassInHierarchy(panel, "team_neutral") || hasClassInHierarchy(panel, "neutral")) return "neutral";
        return "";
    }
function ResolveFriendlyTopBarTeamClass(root, nowMs) {
        var now = Number(nowMs) || (Date.now ? Date.now() : (new Date()).getTime());
        if (S.enemyColoredHealthFriendlyTeamClass && now < (S.enemyColoredHealthFriendlyTeamNextMs || 0)) {
            return S.enemyColoredHealthFriendlyTeamClass;
        }
        var friendlyTeamClass = "";
        var friendlyPanel = root && root.FindChildTraverse ? (root.FindChildTraverse("TeamFriendly") || null) : null;
        if (friendlyPanel && IsPanelValid(friendlyPanel)) {
            if (hasClassInHierarchy(friendlyPanel, "team1")) friendlyTeamClass = "team1";
            else if (hasClassInHierarchy(friendlyPanel, "team2")) friendlyTeamClass = "team2";
        }
        S.enemyColoredHealthFriendlyTeamClass = friendlyTeamClass;
        S.enemyColoredHealthFriendlyTeamNextMs = now + 1500;
        return friendlyTeamClass;
    }
var SetCachedPanel = function(k, p) {
        S.cachedPanels[k] = IsPanelValid(p) ? p : null;
    };
function SetWashColorSafe(panel, color) {
        if (color) {
            SetStyleSafe(panel, "washColor", String(color));
        } else {
            ClearStyleSafe(panel, "washColor");
        }
    }
function ToRgbString(rgb) {
        return "rgb(" + rgb[0] + ", " + rgb[1] + ", " + rgb[2] + ")";
    }
    var hasClassInHierarchy = function(panel, className) {
        var current = panel;
        while (current) {
            if (current.BHasClass(className)) return true;
            current = current.GetParent();
        }
        return false;
    };

    function UpdateColoredHealthbarRuntime(root, cfg) {
        try {
        var enabled = IsColorWarningEnabled(cfg);
        if (State.coloredHealthbarEnabledPrev === null) {
            State.coloredHealthbarEnabledPrev = enabled;
        } else if (State.coloredHealthbarEnabledPrev !== enabled) {
            if (!enabled) {
                ResetColoredHealthbarRuntimeStyles();
            } else {
                S.coloredHealthbarLastColor = "";
                S.coloredHealthbarPulseDir = 1;
                S.coloredHealthbarPulseVal = 0;
                S.coloredHealthbarZeroHeightStreak = 0;
            }
            ResetColoredHealthbarPanelCache();
            S.coloredHealthbarEnabledPrev = enabled;
        }

        if (!enabled) {
            if (S.coloredHealthbarLastColor !== "" ||
                GC("coloredHealthbarHealthBar") ||
                GC("coloredHealthbarProgressLeft") ||
                GC("coloredHealthbarCurrentHealth")) {
                ResetColoredHealthbarRuntimeStyles();
                ResetColoredHealthbarPanelCache();
            }
            return;
        }

        var panels = ResolveColoredHealthbarPanels(root);
        if (!panels || !panels.progressLeft) return;

        var progressLeft = panels.progressLeft;
        var parent = progressLeft.GetParent ? progressLeft.GetParent() : null;
        var pH = Number(progressLeft.actuallayoutheight);
        var cH = parent ? Number(parent.actuallayoutheight) : 0;
        if (!isFinite(pH) || !isFinite(cH) || cH <= 0) {
            S.coloredHealthbarZeroHeightStreak += 1;
            if (S.coloredHealthbarZeroHeightStreak >= 4) {
                ResetColoredHealthbarPanelCache();
            }
            return;
        }
        S.coloredHealthbarZeroHeightStreak = 0;

        var pct = (pH / cH) * 100;
        var color = ResolveColoredHealthbarColor(pct, cfg);
        if (panels.healthBar) SetWashColorSafe(panels.healthBar, color);
        if (panels.progressLeft) SetWashColorSafe(panels.progressLeft, color);
        if (panels.currentHealth) {
            SetStyleSafe(panels.currentHealth, "color", color);
            SetWashColorSafe(panels.currentHealth, color);
        }
        S.coloredHealthbarLastColor = color;
        } catch (e) {
            ResetColoredHealthbarRuntimeStyles();
            ResetColoredHealthbarPanelCache();
            S.coloredHealthbarEnabledPrev = null;
        }
    }

    function UpdateEnemyColoredHealthRuntime(root, cfg, nowMs) {
        if (!root || !cfg) return;
        var enabled = IsEnemyColorWarningEnabled(cfg);
        if (S.enemyColoredHealthEnabledPrev === null) {
            S.enemyColoredHealthEnabledPrev = enabled;
        } else if (S.enemyColoredHealthEnabledPrev !== enabled) {
            if (!enabled) {
                ResetEnemyColoredHealthRuntimeStyles();
            } else {
                S.enemyColoredHealthPulseDir = 1;
                S.enemyColoredHealthPulseVal = 0;
                S.enemyColoredHealthNextUpdateMs = 0;
            }
            S.enemyColoredHealthEnabledPrev = enabled;
        }

        if (!enabled) {
            if (Array.isArray(S.enemyColoredHealthPanelCache) && S.enemyColoredHealthPanelCache.length > 0) {
                ResetEnemyColoredHealthRuntimeStyles();
                S.enemyColoredHealthPanelCache = [];
            }
            S.enemyColoredHealthPanelCacheNextMs = 0;
            return;
        }

        var now = Number(nowMs) || Date.now();
        if (now < (S.enemyColoredHealthNextUpdateMs || 0)) return;

        RefreshEnemyColoredHealthPanelCache(root, now);
        var entries = Array.isArray(S.enemyColoredHealthPanelCache) ? S.enemyColoredHealthPanelCache : [];
        var scanStats = S.enemyColoredHealthLastScanStats || null;
        var use25dbg = IsCfgEnabled(cfg, "ENABLE_TOPBAR_ENEMY_HP_WARNING_25") ? 1 : 0;
        var use65dbg = IsCfgEnabled(cfg, "ENABLE_TOPBAR_ENEMY_HP_WARNING_65") ? 1 : 0;
        var use75dbg = IsCfgEnabled(cfg, "ENABLE_TOPBAR_ENEMY_HP_WARNING_75") ? 1 : 0;
        var sampleBar = "-";
        var sampleTeam = "-";
        if (entries.length > 0 && entries[0]) sampleBar = String(entries[0].barId || "-");
        if (entries.length > 0 && entries[0]) sampleTeam = String(entries[0].teamClass || "-");
        var scanSig =
            "en=" + (enabled ? "1" : "0") +
            "|t=" + use25dbg + use65dbg + use75dbg +
            "|e=" + entries.length +
            "|bar=" + sampleBar +
            "|team=" + sampleTeam +
            "|friendlyTeam=" + (scanStats ? (scanStats.friendlyTeamClass || "-") : "-") +
            "|r=" + (scanStats ? scanStats.roots : -1) +
            "|us=" + (scanStats ? scanStats.unitStatus : -1) +
            "|uo=" + (scanStats ? scanStats.unitStatusOld : -1) +
            "|c=" + (scanStats ? scanStats.candidates : -1) +
            "|lag=" + (scanStats ? scanStats.foundLagging : -1) +
            "|state=" + (scanStats ? scanStats.foundState : -1) +
            "|skipEnemy=" + (scanStats ? scanStats.skippedNoEnemy : -1) +
            "|inferTeam=" + (scanStats ? scanStats.inferredByTeam : -1);
        EnemyColoredHealthDebugLogThrottled(
            scanSig,
            "enabled=" + (enabled ? "1" : "0") +
                " thresholds=" + use25dbg + "/" + use65dbg + "/" + use75dbg +
                " entries=" + entries.length +
                " sampleBar=" + sampleBar +
                " sampleTeam=" + sampleTeam +
                " friendlyTeam=" + (scanStats ? (scanStats.friendlyTeamClass || "-") : "-") +
                " roots=" + (scanStats ? scanStats.roots : -1) +
                " unitStatus=" + (scanStats ? scanStats.unitStatus : -1) +
                " unitStatusOld=" + (scanStats ? scanStats.unitStatusOld : -1) +
                " candidates=" + (scanStats ? scanStats.candidates : -1) +
                " foundLagging=" + (scanStats ? scanStats.foundLagging : -1) +
                " foundState=" + (scanStats ? scanStats.foundState : -1) +
                " skippedNoEnemy=" + (scanStats ? scanStats.skippedNoEnemy : -1) +
                " inferredByTeam=" + (scanStats ? scanStats.inferredByTeam : -1),
            now
        );
        if (entries.length <= 0) {
            S.enemyColoredHealthNextUpdateMs = now + ENEMY_COLORED_HEALTH_UPDATE_MS;
            return;
        }

        var pulseAdvanced = false;
        var use25 = IsCfgEnabled(cfg, "ENABLE_TOPBAR_ENEMY_HP_WARNING_25");
        for (var i = 0; i < entries.length; i++) {
            var entry = entries[i];
            if (!entry || !entry.healthBar || !entry.healthBarParent) continue;
            if (!IsPanelValid(entry.healthBar) || !IsPanelValid(entry.healthBarParent)) continue;

            var pct = ResolveTopBarHealthPct(entry);
            if (!isFinite(pct)) continue;

            if (!pulseAdvanced && use25 && pct <= COLORED_HEALTHBAR_LOW_HP_THRESHOLD) {
                S.enemyColoredHealthPulseVal += (S.enemyColoredHealthPulseDir * COLORED_HEALTHBAR_PULSE_STEP);
                if (S.enemyColoredHealthPulseVal >= 1) {
                    S.enemyColoredHealthPulseVal = 1;
                    S.enemyColoredHealthPulseDir = -1;
                } else if (S.enemyColoredHealthPulseVal <= 0) {
                    S.enemyColoredHealthPulseVal = 0;
                    S.enemyColoredHealthPulseDir = 1;
                }
                pulseAdvanced = true;
            }

            var teamColor = ResolveEnemyColoredHealthTeamColor(entry);
            var nextColor = ResolveEnemyColoredHealthColor(pct, cfg, teamColor);

            EnemyColoredHealthDebugLogThrottled(
                "apply|" + String(Math.round(Number(entry.healthBar.actuallayoutheight))) + "|" + String(Math.round(pct)) + "|" + nextColor,
                "apply bar=" + String(entry.barId || "-") +
                    " height=" + String(Number(entry.healthBar.actuallayoutheight)) +
                    " pct=" + String(pct.toFixed ? pct.toFixed(2) : pct) +
                    " use25=" + (IsCfgEnabled(cfg, "ENABLE_TOPBAR_ENEMY_HP_WARNING_25") ? "1" : "0") +
                    " use65=" + (IsCfgEnabled(cfg, "ENABLE_TOPBAR_ENEMY_HP_WARNING_65") ? "1" : "0") +
                    " use75=" + (IsCfgEnabled(cfg, "ENABLE_TOPBAR_ENEMY_HP_WARNING_75") ? "1" : "0") +
                    " color=" + nextColor,
                now
            );

            if (String(entry.lastColor || "") === nextColor) continue;

            if (entry.healthBar && IsPanelValid(entry.healthBar)) {
                SetWashColorSafe(entry.healthBar, "");
                SetStyleSafe(entry.healthBar, "backgroundColor", nextColor);
            }
            entry.lastColor = nextColor;
        }

        S.enemyColoredHealthNextUpdateMs = now + ENEMY_COLORED_HEALTH_UPDATE_MS;
    }

    function UpdateAllyColoredHealthRuntime(root, cfg, nowMs) {
        if (!root || !cfg) return;
        var enabled = IsAllyColorWarningEnabled(cfg);
        if (S.allyColoredHealthEnabledPrev === null) {
            S.allyColoredHealthEnabledPrev = enabled;
        } else if (S.allyColoredHealthEnabledPrev !== enabled) {
            if (!enabled) {
                ResetAllyColoredHealthRuntimeStyles();
            } else {
                S.allyColoredHealthPulseDir = 1;
                S.allyColoredHealthPulseVal = 0;
                S.allyColoredHealthNextUpdateMs = 0;
            }
            S.allyColoredHealthEnabledPrev = enabled;
        }

        if (!enabled) {
            if (Array.isArray(S.allyColoredHealthPanelCache) && S.allyColoredHealthPanelCache.length > 0) {
                ResetAllyColoredHealthRuntimeStyles();
                S.allyColoredHealthPanelCache = [];
            }
            S.allyColoredHealthPanelCacheNextMs = 0;
            return;
        }

        var now = Number(nowMs) || Date.now();
        if (now < (S.allyColoredHealthNextUpdateMs || 0)) return;

        RefreshAllyColoredHealthPanelCache(root, now);
        var entries = Array.isArray(S.allyColoredHealthPanelCache) ? S.allyColoredHealthPanelCache : [];
        if (entries.length <= 0) {
            S.allyColoredHealthNextUpdateMs = now + ENEMY_COLORED_HEALTH_UPDATE_MS;
            return;
        }

        var pulseAdvanced = false;
        var use25 = IsCfgEnabled(cfg, "ENABLE_TOPBAR_ALLY_HP_WARNING_25");
        for (var i = 0; i < entries.length; i++) {
            var entry = entries[i];
            if (!entry || !entry.healthBar || !entry.healthBarParent) continue;
            if (!IsPanelValid(entry.healthBar) || !IsPanelValid(entry.healthBarParent)) continue;

            var pct = ResolveTopBarHealthPct(entry);
            if (!isFinite(pct)) continue;

            if (!pulseAdvanced && use25 && pct <= COLORED_HEALTHBAR_LOW_HP_THRESHOLD) {
                S.allyColoredHealthPulseVal += (S.allyColoredHealthPulseDir * COLORED_HEALTHBAR_PULSE_STEP);
                if (S.allyColoredHealthPulseVal >= 1) {
                    S.allyColoredHealthPulseVal = 1;
                    S.allyColoredHealthPulseDir = -1;
                } else if (S.allyColoredHealthPulseVal <= 0) {
                    S.allyColoredHealthPulseVal = 0;
                    S.allyColoredHealthPulseDir = 1;
                }
                pulseAdvanced = true;
            }

            var nextColor = ResolveAllyColoredHealthColor(pct, cfg, ALLY_TOPBAR_HEALTH_DEFAULT_COLOR);
            if (String(entry.lastColor || "") === nextColor) continue;

            if (entry.healthBar && IsPanelValid(entry.healthBar)) {
                SetWashColorSafe(entry.healthBar, "");
                SetStyleSafe(entry.healthBar, "backgroundColor", nextColor);
            }
            entry.lastColor = nextColor;
        }

        S.allyColoredHealthNextUpdateMs = now + ENEMY_COLORED_HEALTH_UPDATE_MS;
    }

    $.Msg("[QOL DEBUG] colorWarnings: all functions defined, starting registrations");
    // ── Registrations (3 features, 1 file) ──

    $.Msg("[QOL DEBUG] Registering colorWarning");
    QOL_REGISTER_FEATURE("colorWarning", {
        configKeys: ["ENABLE_COLORED_HEALTHBAR", "ENABLE_COLOR_WARNING_25",
                     "ENABLE_COLOR_WARNING_65", "ENABLE_COLOR_WARNING_75"],
        bucket: 5, phase: -1,
        gate: function(cfg) {
            return IsCfgEnabled(cfg, "ENABLE_COLORED_HEALTHBAR") ||
                   IsCfgEnabled(cfg, "ENABLE_COLOR_WARNING_25") ||
                   IsCfgEnabled(cfg, "ENABLE_COLOR_WARNING_65") ||
                   IsCfgEnabled(cfg, "ENABLE_COLOR_WARNING_75");
        },
        update: function(root, cfg) {
            try { UpdateColoredHealthbarRuntime(root, cfg); } catch(e) {
                $.Msg("[QOLLock][ERROR][colorWarning] " + (e && e.message ? e.message : String(e)) + "\n" + (e && e.stack ? String(e.stack) : ""));
                throw e;
            }
        },
        stateKeys: ["coloredHealthbarLastColor", "coloredHealthbarEnabledPrev",
                    "coloredHealthbarPulseDir", "coloredHealthbarPulseVal",
                    "coloredHealthbarZeroHeightStreak"]
    });

    $.Msg("[QOL DEBUG] Registering enemyColorWarning");
    QOL_REGISTER_FEATURE("enemyColorWarning", {
        configKeys: ["ENABLE_ENEMY_COLORED_HEALTHBAR", "ENABLE_ENEMY_COLOR_WARNING_25",
                     "ENABLE_ENEMY_COLOR_WARNING_65", "ENABLE_ENEMY_COLOR_WARNING_75"],
        bucket: 5, phase: -1,
        gate: function(cfg) {
            return IsCfgEnabled(cfg, "ENABLE_ENEMY_COLORED_HEALTHBAR") ||
                   IsCfgEnabled(cfg, "ENABLE_ENEMY_COLOR_WARNING_25") ||
                   IsCfgEnabled(cfg, "ENABLE_ENEMY_COLOR_WARNING_65") ||
                   IsCfgEnabled(cfg, "ENABLE_ENEMY_COLOR_WARNING_75");
        },
        update: function(root, cfg, nowMs) {
            try { UpdateEnemyColoredHealthRuntime(root, cfg, nowMs); } catch(e) {
                $.Msg("[QOLLock][ERROR][enemyColorWarning] " + (e && e.message ? e.message : String(e)) + "\n" + (e && e.stack ? String(e.stack) : ""));
                throw e;
            }
        },
        stateKeys: ["enemyColoredHealthPanelCache", "enemyColoredHealthPanelCacheNextMs",
                    "enemyColoredHealthNextUpdateMs", "enemyColoredHealthEnabledPrev",
                    "enemyColoredHealthPulseDir", "enemyColoredHealthPulseVal"]
    });

    $.Msg("[QOL DEBUG] Registering allyColorWarning");
    QOL_REGISTER_FEATURE("allyColorWarning", {
        configKeys: ["ENABLE_ALLY_COLORED_HEALTHBAR", "ENABLE_ALLY_COLOR_WARNING_25",
                     "ENABLE_ALLY_COLOR_WARNING_65", "ENABLE_ALLY_COLOR_WARNING_75"],
        bucket: 5, phase: -1,
        gate: function(cfg) {
            return IsCfgEnabled(cfg, "ENABLE_ALLY_COLORED_HEALTHBAR") ||
                   IsCfgEnabled(cfg, "ENABLE_ALLY_COLOR_WARNING_25") ||
                   IsCfgEnabled(cfg, "ENABLE_ALLY_COLOR_WARNING_65") ||
                   IsCfgEnabled(cfg, "ENABLE_ALLY_COLOR_WARNING_75");
        },
        update: function(root, cfg, nowMs) {
            try { UpdateAllyColoredHealthRuntime(root, cfg, nowMs); } catch(e) {
                $.Msg("[QOLLock][ERROR][allyColorWarning] " + (e && e.message ? e.message : String(e)) + "\n" + (e && e.stack ? String(e.stack) : ""));
                throw e;
            }
        },
        stateKeys: ["allyColoredHealthPanelCache", "allyColoredHealthPanelCacheNextMs",
                    "allyColoredHealthNextUpdateMs", "allyColoredHealthEnabledPrev",
                    "allyColoredHealthPulseDir", "allyColoredHealthPulseVal"]
    });

    try {
        if (typeof UpdateColoredHealthbarRuntime !== "function") throw new Error("UpdateColoredHealthbarRuntime is not a function");
    } catch(e) {
        $.Msg("[QOLLock][ERROR][" + _dk + "] self-test failed: " + (e && e.message ? e.message : String(e)));
    }

})();

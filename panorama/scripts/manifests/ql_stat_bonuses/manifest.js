// manifests/ql_stat_bonuses/manifest.js
// =============================================================================
// QOLLOCK — Stat Bonuses Overlay (Golden Statue bonuses)
// =============================================================================
// OWNS:        Stat bonuses overlay: fire rate, cooldown, spirit, clip, damage, health
// DOES NOT OWN: Golden statue mechanics, stat calculations
// DEPENDS ON:  QOL.core.FeatureRegistry, QOL.core.Scheduler, QOL.core.Hud
// CONFIG KEYS: ENABLE_STAT_BONUSES, STAT_BONUSES_SCALE, STAT_BONUSES_X_OFFSET, STAT_BONUSES_Y_OFFSET
// PATTERN:     Polling (~5Hz). Creates overlay with 6 stat labels.
// =============================================================================

(function() {
    "use strict";

    var FR = QOL.core.FeatureRegistry;
    if (!FR) {
        $.Msg("[QOLLock] stat_bonuses: FeatureRegistry not found — aborting");
        return;
    }

    var STAT_BONUSES_SOURCE_SEARCH_MS = 500;
    var STAT_BONUSES_SOURCE_SEARCH_MAX_MS = 8000;
    var STAT_BONUSES_TOOLTIP_SCAN_MS = 250;
    var STAT_BONUSES_TOOLTIP_BREAKDOWN_ID = "StatsBreakdownContainer";
    var STAT_BONUSES_GOLDEN_ROW_KEYS = [
        "#citadel_shopstats_goldenstatues",
        "golden statues",
        "#citadel_shopstats_boons",
        "boons"
    ];

    var STAT_DEFS = [
        {
            key: "fireRate",
            candidateIds: ["StatContainer_FireRate"],
            labelId: "QOLStatBonusesFireRate",
            labelPrefix: "Fire Rate: "
        },
        {
            key: "abilityCooldown",
            candidateIds: [
                "StatContainer_TechCooldown", "StatContainer_AbilityCooldown",
                "StatContainer_AbilityCooldownReduction", "StatContainer_CooldownReduction",
                "StatContainer_Cooldown", "StatContainer_CooldownDecrease", "StatContainer_AbilityCD"
            ],
            labelId: "QOLStatBonusesAbilityCooldown",
            labelPrefix: "Ability Cooldown %: "
        },
        {
            key: "spiritPower",
            candidateIds: ["StatContainer_TechPower", "StatContainer_SpiritPower", "StatContainer_Spirit"],
            labelId: "QOLStatBonusesSpiritPower",
            labelPrefix: "Spirit Power: "
        },
        {
            key: "clipSize",
            candidateIds: ["StatContainer_ClipSizeIncrease", "StatContainer_ClipSize", "StatContainer_ClipSizeBonus", "StatContainer_AmmoCapacity"],
            labelId: "QOLStatBonusesClipSize",
            labelPrefix: "Clip Size % Increase: "
        },
        {
            key: "weaponDamage",
            candidateIds: ["StatContainer_BaseWeaponDamage", "StatContainer_BonusBaseWeaponDamage", "StatContainer_BaseAttackDamagePercent", "StatContainer_BulletDamage"],
            labelId: "QOLStatBonusesWeaponDamage",
            labelPrefix: "Weapon Damage %: "
        },
        {
            key: "maxHealth",
            candidateIds: ["StatContainer_MaxHealth", "StatContainer_BaseHealth", "StatContainer_ArmorPower"],
            labelId: "QOLStatBonusesMaxHealth",
            labelPrefix: "Max Health: "
        }
    ];

    function isAlive(p) {
        return !!(p && typeof p.IsValid === "function" && p.IsValid());
    }

    function extractFirstNumericToken(text) {
        if (!text || typeof text !== "string") return "";
        var trimmed = text.trim();
        if (trimmed.length === 0) return "";
        var match = /([+\-]?\d+(?:\.\d+)?%?)/.exec(trimmed);
        return (match && match[1]) ? match[1] : "";
    }

    function getFirstPanelTextByClass(panel, className) {
        if (!panel || !panel.FindChildrenWithClassTraverse || !className) return "";
        var list = panel.FindChildrenWithClassTraverse(className);
        if (!list || list.length === 0) return "";
        var first = list[0];
        if (!first || typeof first.text !== "string") return "";
        return first.text;
    }

    function getFirstPanelTextById(panel, idName) {
        if (!panel || !panel.FindChildTraverse || !idName) return "";
        var p = panel.FindChildTraverse(idName);
        if (!p || typeof p.text !== "string") return "";
        return p.text;
    }

    function normalizeStatBonusKeyText(text) {
        if (text === undefined || text === null) return "";
        return String(text).toLowerCase().replace(/[^a-z0-9#]+/g, "");
    }

    function textMatchesAnyStatBonusKey(text, keys) {
        var normalized = normalizeStatBonusKeyText(text);
        if (!normalized || !keys || keys.length === 0) return false;
        for (var i = 0; i < keys.length; i++) {
            var key = normalizeStatBonusKeyText(keys[i]);
            if (!key) continue;
            if (normalized.indexOf(key) !== -1) return true;
        }
        return false;
    }

    function tryExtractNumericTokenFromPanelTree(panel, maxNodes) {
        if (!panel || !panel.Children) return "";
        var queue = [panel];
        var visited = 0;
        var limit = Math.max(10, Number(maxNodes) || 120);
        while (queue.length > 0 && visited < limit) {
            var current = queue.shift();
            visited++;
            if (!current) continue;
            if (typeof current.text === "string") {
                var token = extractFirstNumericToken(current.text);
                if (token) return token;
            }
            var kids = current.Children ? current.Children() : [];
            for (var i = 0; i < kids.length; i++) queue.push(kids[i]);
        }
        return "";
    }

    function extractStatDisplayText(sourcePanel) {
        if (!sourcePanel) return "";
        var idCandidates = ["AttributeLabel", "ScalingStatLabel", "Value", "StatValue"];
        for (var i = 0; i < idCandidates.length; i++) {
            var rawById = getFirstPanelTextById(sourcePanel, idCandidates[i]);
            var tokenById = extractFirstNumericToken(rawById);
            if (tokenById) return tokenById;
        }
        var classCandidates = ["ModifiedValue", "AttributeValue", "StatValue", "Value", "Label"];
        for (var j = 0; j < classCandidates.length; j++) {
            var rawByClass = getFirstPanelTextByClass(sourcePanel, classCandidates[j]);
            var tokenByClass = extractFirstNumericToken(rawByClass);
            if (tokenByClass) return tokenByClass;
        }
        return tryExtractNumericTokenFromPanelTree(sourcePanel, 40);
    }

    function isStatBonusTokenZero(token) {
        if (!token || token === "--") return false;
        var raw = String(token).trim();
        var match = raw.match(/^([+\-]?)(\d+(?:\.\d+)?)(%?)$/);
        if (!match) return false;
        var val = parseFloat(match[2]);
        return isFinite(val) && val === 0;
    }

    function parseSignedNumberToken(token) {
        if (!token) return null;
        var raw = String(token).trim();
        var match = raw.match(/^([+\-]?)(\d+(?:\.\d+)?)(%?)$/);
        if (!match) return null;
        var value = parseFloat(match[2]);
        if (!isFinite(value)) return null;
        if (match[1] === "-") value = -value;
        return { value: value, suffix: match[3] || "", raw: raw };
    }

    function formatSignedNumberToken(value, suffix) {
        if (!isFinite(value)) return "";
        var absVal = Math.abs(value);
        var decimals = 2;
        if (absVal >= 100) decimals = 0;
        else if (absVal >= 10) decimals = 1;
        var rounded = value.toFixed(decimals).replace(/\.?0+$/, "");
        if (rounded === "-0") rounded = "0";
        return rounded + (suffix || "");
    }

    function deriveGoldenStatuesValueFromSource(sourcePanel) {
        if (!sourcePanel) return "";
        var modifiedToken = extractFirstNumericToken(getFirstPanelTextById(sourcePanel, "ModifiedLabel"));
        if (!modifiedToken) modifiedToken = extractStatDisplayText(sourcePanel);
        var baseToken = extractFirstNumericToken(getFirstPanelTextById(sourcePanel, "BaseLabel"));
        var modsToken = extractFirstNumericToken(getFirstPanelTextById(sourcePanel, "ValueFromModsLabel"));
        var scalingToken = extractFirstNumericToken(getFirstPanelTextById(sourcePanel, "StatScalingLabel"));

        var modified = parseSignedNumberToken(modifiedToken);
        var base = parseSignedNumberToken(baseToken);
        if (!modified || !base) return "";

        var derived = modified.value - base.value;
        var mods = parseSignedNumberToken(modsToken);
        var scaling = parseSignedNumberToken(scalingToken);
        if (mods) derived -= mods.value;
        if (scaling) derived -= scaling.value;
        if (!isFinite(derived)) return "";
        if (Math.abs(derived) < 0.0001) derived = 0;

        var suffix = modified.suffix || (base ? base.suffix : "");
        return formatSignedNumberToken(derived, suffix);
    }

    function extractGoldenStatuesValueFromBreakdownContainer(container) {
        if (!container || !container.Children) return "";
        var rows = container.Children();
        for (var i = 0; i < rows.length; i++) {
            var row = rows[i];
            if (!row) continue;
            var rowName = getFirstPanelTextByClass(row, "StatName");
            if (!textMatchesAnyStatBonusKey(rowName, STAT_BONUSES_GOLDEN_ROW_KEYS)) continue;
            var rowValue = getFirstPanelTextByClass(row, "StatValue");
            var token = extractFirstNumericToken(rowValue);
            if (!token) token = tryExtractNumericTokenFromPanelTree(row, 60);
            if (token) return token;
        }
        return "";
    }

    function isLikelyStatBreakdownRow(panel) {
        if (!panel) return false;
        var statName = getFirstPanelTextByClass(panel, "StatName");
        if (!statName || statName.length === 0) return false;
        var statValue = getFirstPanelTextByClass(panel, "StatValue");
        if (statValue && statValue.length > 0) return true;
        var token = tryExtractNumericTokenFromPanelTree(panel, 40);
        return !!(token && token.length > 0);
    }

    function isLikelyStatBreakdownContainer(panel) {
        if (!panel || !panel.Children) return false;
        var rows = panel.Children() || [];
        var matchedRows = 0;
        for (var i = 0; i < rows.length; i++) {
            if (isLikelyStatBreakdownRow(rows[i])) {
                matchedRows++;
                if (matchedRows >= 2) return true;
            }
        }
        return false;
    }

    function findAncestorLikelyStatBreakdownContainer(panel, maxDepth) {
        var current = panel;
        var depth = 0;
        var limit = Math.max(1, Number(maxDepth) || 8);
        while (current && depth < limit) {
            if (isLikelyStatBreakdownContainer(current)) return current;
            current = current.GetParent ? current.GetParent() : null;
            depth++;
        }
        return null;
    }

    function resolveStatBonusesTooltipBreakdownPanel(root) {
        if (!root) return null;
        var byId = root.FindChildTraverse ? root.FindChildTraverse(STAT_BONUSES_TOOLTIP_BREAKDOWN_ID) : null;
        if (byId && isLikelyStatBreakdownContainer(byId)) return byId;

        var subRows = root.FindChildrenWithClassTraverse ? (root.FindChildrenWithClassTraverse("SubStatValue") || []) : [];
        for (var i = 0; i < subRows.length; i++) {
            var fromSub = findAncestorLikelyStatBreakdownContainer(subRows[i], 6);
            if (fromSub) return fromSub;
        }

        var mainRows = root.FindChildrenWithClassTraverse ? (root.FindChildrenWithClassTraverse("MainStatValue") || []) : [];
        for (var j = 0; j < mainRows.length; j++) {
            var fromMain = findAncestorLikelyStatBreakdownContainer(mainRows[j], 6);
            if (fromMain) return fromMain;
        }
        return null;
    }

    function findStatContainerIdFromPanel(panel) {
        var current = panel;
        while (current) {
            if (current.id && String(current.id).indexOf("StatContainer_") === 0) {
                return String(current.id);
            }
            current = current.GetParent ? current.GetParent() : null;
        }
        return "";
    }

    function getStatBonusesKeyFromContainerId(containerId) {
        if (!containerId) return "";
        for (var i = 0; i < STAT_DEFS.length; i++) {
            if (STAT_DEFS[i].candidateIds.indexOf(containerId) !== -1) {
                return STAT_DEFS[i].key;
            }
        }
        return "";
    }

    FR.register({
        id: "ql_stat_bonuses",
        enabledByDefault: false,
        enableKey: "ENABLE_STAT_BONUSES",
        settings: [
            { key: "ENABLE_STAT_BONUSES", type: "toggle", default: false },
            { key: "STAT_BONUSES_SCALE", type: "slider", min: 50, max: 200, step: 1, default: 100 },
            { key: "STAT_BONUSES_X_OFFSET", type: "slider", min: -1000, max: 1000, step: 5, default: 0 },
            { key: "STAT_BONUSES_Y_OFFSET", type: "slider", min: 0, max: 1000, step: 5, default: 0 }
        ],
        create: function(ctx) {
            var _loop = null;
            var _overlay = null;
            var _titleLabel = null;
            var _statLabels = {};
            var _sourcePanels = {};
            var _goldenValues = {};
            var _lastLayoutSig = "";
            var _lastClassSig = "";
            var _lastTitleText = "";
            var _lastValues = {};
            var _nextSourceSearchByKey = {};
            var _sourceSearchBackoffMs = 0;
            var _lastShopOpen = null;
            var _nextTooltipScanMs = 0;

            function _ensureOverlay(root) {
                if (isAlive(_overlay)) return _overlay;

                var gameplayHud = root.FindChildTraverse ? root.FindChildTraverse("gameplay_hud") : null;
                if (!gameplayHud) return null;

                _overlay = root.FindChildTraverse("QOLStatBonusesOverlay");
                if (!_overlay) {
                    _overlay = $.CreatePanel("Panel", gameplayHud, "QOLStatBonusesOverlay", {
                        hittest: "false",
                        hittestchildren: "false"
                    });
                    _titleLabel = $.CreatePanel("Label", _overlay, "QOLStatBonusesTitle");
                    _titleLabel.text = "Stat Bonuses (Golden Statues)";

                    for (var i = 0; i < STAT_DEFS.length; i++) {
                        var def = STAT_DEFS[i];
                        var lbl = $.CreatePanel("Label", _overlay, def.labelId);
                        lbl.AddClass("QOLStatBonusesLine");
                        lbl.text = def.labelPrefix + "--";
                        _statLabels[def.key] = lbl;
                    }
                } else {
                    _titleLabel = _overlay.FindChildTraverse("QOLStatBonusesTitle");
                    for (var j = 0; j < STAT_DEFS.length; j++) {
                        var d = STAT_DEFS[j];
                        _statLabels[d.key] = _overlay.FindChildTraverse(d.labelId);
                    }
                }
                return _overlay;
            }

            function _resolveSource(root, def, nowMs) {
                var cached = _sourcePanels[def.key];
                if (isAlive(cached)) return cached;

                var nextSearch = _nextSourceSearchByKey[def.key] || 0;
                if (nowMs < nextSearch) return null;

                var found = null;
                for (var i = 0; i < def.candidateIds.length; i++) {
                    var cid = def.candidateIds[i];
                    if (root.FindChildTraverse) {
                        found = root.FindChildTraverse(cid);
                        if (found) break;
                    }
                }
                if (!found && root.FindChildrenWithClassTraverse) {
                    var containers = root.FindChildrenWithClassTraverse("statAttributeContainer") || [];
                    for (var c = 0; c < containers.length; c++) {
                        var panel = containers[c];
                        if (panel && def.candidateIds.indexOf(panel.id) !== -1) {
                            found = panel;
                            break;
                        }
                    }
                }

                if (found) {
                    _sourcePanels[def.key] = found;
                    _sourceSearchBackoffMs = 0;
                    _nextSourceSearchByKey[def.key] = 0;
                } else {
                    _sourceSearchBackoffMs = _sourceSearchBackoffMs > 0
                        ? Math.min(_sourceSearchBackoffMs * 2, STAT_BONUSES_SOURCE_SEARCH_MAX_MS)
                        : STAT_BONUSES_SOURCE_SEARCH_MS;
                    _nextSourceSearchByKey[def.key] = nowMs + _sourceSearchBackoffMs;
                }
                return found;
            }

            function _resolveGoldenValue(statKey, sourcePanel) {
                if (sourcePanel && sourcePanel.FindChildTraverse) {
                    var sourceBreakdown = sourcePanel.FindChildTraverse(STAT_BONUSES_TOOLTIP_BREAKDOWN_ID);
                    if (sourceBreakdown) {
                        var fromSource = extractGoldenStatuesValueFromBreakdownContainer(sourceBreakdown);
                        if (fromSource) {
                            _goldenValues[statKey] = fromSource;
                            return fromSource;
                        }
                    }
                }

                var cached = _goldenValues[statKey];
                if (cached && cached.length > 0) return cached;

                var derived = deriveGoldenStatuesValueFromSource(sourcePanel);
                if (derived && derived.length > 0) {
                    _goldenValues[statKey] = derived;
                    return derived;
                }
                return "--";
            }

            function _harvestTooltip(root, nowMs) {
                if (nowMs < _nextTooltipScanMs) return;
                _nextTooltipScanMs = nowMs + STAT_BONUSES_TOOLTIP_SCAN_MS;

                var breakdown = resolveStatBonusesTooltipBreakdownPanel(root);
                if (!breakdown) return;

                var goldenToken = extractGoldenStatuesValueFromBreakdownContainer(breakdown);
                if (goldenToken) {
                    var containerId = findStatContainerIdFromPanel(breakdown);
                    var statKey = getStatBonusesKeyFromContainerId(containerId);
                    if (statKey) {
                        _goldenValues[statKey] = goldenToken;
                    }
                }
            }

            function _tick() {
                var root = $.GetContextPanel();
                if (!root) return;

                var cfg = ctx.config.view();
                var enabled = Number(cfg.ENABLE_STAT_BONUSES) === 1;

                if (!enabled) {
                    if (_overlay) {
                        if (_overlay.SetHasClass) _overlay.SetHasClass("qol-hidden", true);
                        else _overlay.style.visibility = "collapse";
                    }
                    return;
                }

                var hud = QOL.core && QOL.core.Hud;
                var inHideout = hud && hud.isInHideout ? hud.isInHideout(root) : false;
                if (inHideout) {
                    if (_overlay) {
                        if (_overlay.SetHasClass) _overlay.SetHasClass("qol-hidden", true);
                        else _overlay.style.visibility = "collapse";
                    }
                    return;
                }

                var overlay = _ensureOverlay(root);
                if (!overlay) return;

                if (overlay.SetHasClass) overlay.SetHasClass("qol-hidden", false);
                overlay.style.visibility = "visible";

                // Layout / offsets
                var sc = Number(cfg.STAT_BONUSES_SCALE) / 100;
                var ox = Math.round(Number(cfg.STAT_BONUSES_X_OFFSET)) || 0;
                var oy = Math.round(Number(cfg.STAT_BONUSES_Y_OFFSET)) || 0;
                var layoutSig = sc + "|" + ox + "|" + oy;
                if (layoutSig !== _lastLayoutSig) {
                    overlay.style.marginLeft = (-520 + ox) + "px";
                    overlay.style.marginBottom = (70 + oy) + "px";
                    overlay.style.preTransformScale2d = "1.00, 1.00";
                    overlay.style.uiScale = Math.round(sc * 100) + "%";
                    _lastLayoutSig = layoutSig;
                }

                var nowMs = Date.now ? Date.now() : (new Date()).getTime();

                // Detect shop context change to reset negative search backoffs
                var shopOpen = !!(root.BHasClass && root.BHasClass("gShopOpen"));
                if (shopOpen !== _lastShopOpen) {
                    _lastShopOpen = shopOpen;
                    _sourceSearchBackoffMs = 0;
                    _nextSourceSearchByKey = {};
                }

                // Resolve sources and values
                for (var s = 0; s < STAT_DEFS.length; s++) {
                    var def = STAT_DEFS[s];
                    var source = _resolveSource(root, def, nowMs);
                    def.source = source;
                    def.value = _resolveGoldenValue(def.key, source);
                }

                _harvestTooltip(root, nowMs);

                // Zero-value class update and label text update
                var classSigParts = [];
                for (var z = 0; z < STAT_DEFS.length; z++) {
                    var zd = STAT_DEFS[z];
                    var zero = isStatBonusTokenZero(zd.value) || !!(zd.source && zd.source.BHasClass && zd.source.BHasClass("isZeroValue"));
                    classSigParts.push(zero ? "1" : "0");

                    var lbl = _statLabels[zd.key];
                    if (lbl) {
                        lbl.SetHasClass("is_zero", zero);
                        var displayText = zd.labelPrefix + zd.value;
                        if (displayText !== _lastValues[zd.key]) {
                            lbl.text = displayText;
                            _lastValues[zd.key] = displayText;
                        }
                    }
                }
            }

            return {
                onEnable: function() {
                    var S = QOL.core.Scheduler;
                    _loop = S && S.createPollLoop ? S.createPollLoop(_tick, 0.2, "ql_stat_bonuses") : null;
                },
                onDisable: function() {
                    if (_loop) {
                        _loop.stop();
                        _loop = null;
                    }
                    if (_overlay) {
                        try { _overlay.DeleteAsync(0); } catch(e) {}
                        _overlay = null;
                    }
                    _statLabels = {};
                    _sourcePanels = {};
                    _goldenValues = {};
                    _lastValues = {};
                    _lastLayoutSig = "";
                },
                onSettingsChanged: function() {}
            };
        },
        test: function(ctx) {
            try {
                var r = $.GetContextPanel();
                var gp = r ? r.FindChildTraverse("gameplay_hud") : null;
                return {
                    passed: !!gp,
                    name: "Stat bonuses anchor panel exists",
                    message: gp ? "" : "gameplay_hud not found",
                    assertions: [{ passed: !!gp, name: "gameplay_hud panel exists" }]
                };
            } catch(e) {
                return {
                    passed: false,
                    name: "Stat bonuses panel check",
                    message: (e && e.message ? e.message : String(e))
                };
            }
        }
    });
})();

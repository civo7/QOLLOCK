// ql_feat_statbonuses.js — Stat bonuses overlay
// Extracted from ql_core.js, Phase 9 Step 2b
(function() {
    'use strict';
    var _featureId = "ql_feat_statbonuses";
    var _deps = QOL.import(["extractStatDisplayText","getCachedPanel","getGameplayHudPanel","harvestGoldenStatuesTooltipValue","isCustomHudContextActive","isStatBonusTokenZero","resolveGoldenStatBonusesValue","resolveStatBonusesSource","state","setCachedPanel","statBonusesDebugLogThrottled","utils","isConnectedToHideout"]);
    var GetCachedPanel = _deps.getCachedPanel;
    var GGHP = _deps.getGameplayHudPanel;
    var State = _deps.state;
    var SetCachedPanel = _deps.setCachedPanel;
    var Utils = _deps.utils;
    var IsCfgEnabled = Utils.IsCfgEnabled;
    var IsPanelValid = Utils.IsPanelValid;
    var IsCustomHudContextActive = _deps.isCustomHudContextActive;
    var ExtractStatDisplayText = _deps.extractStatDisplayText;
    var GetGameplayHudPanel = _deps.getGameplayHudPanel;
    var HarvestGoldenStatuesTooltipValue = _deps.harvestGoldenStatuesTooltipValue;
    var IsStatBonusTokenZero = _deps.isStatBonusTokenZero;
    var ResolveGoldenStatBonusesValue = _deps.resolveGoldenStatBonusesValue;
    var ResolveStatBonusesSource = _deps.resolveStatBonusesSource;
    var StatBonusesDebugLogThrottled = _deps.statBonusesDebugLogThrottled;
    var isConnectedToHideout = _deps.isConnectedToHideout;
    var CLASS_IS_ZERO_VALUE = "isZeroValue";
    var STAT_BONUSES_DEBUG = false;
    var STAT_BONUSES_FIRE_RATE_IDS = ["StatContainer_FireRate"];
    var STAT_BONUSES_ABILITY_COOLDOWN_IDS = ["StatContainer_TechCooldown", "StatContainer_AbilityCooldown", "StatContainer_AbilityCooldownReduction", "StatContainer_CooldownReduction", "StatContainer_Cooldown", "StatContainer_CooldownDecrease", "StatContainer_AbilityCD"];
    var STAT_BONUSES_SPIRIT_POWER_IDS = ["StatContainer_TechPower", "StatContainer_SpiritPower", "StatContainer_Spirit"];
    var STAT_BONUSES_CLIP_SIZE_IDS = ["StatContainer_ClipSizeIncrease", "StatContainer_ClipSize", "StatContainer_ClipSizeBonus", "StatContainer_AmmoCapacity"];
    var STAT_BONUSES_WEAPON_DAMAGE_IDS = ["StatContainer_BaseWeaponDamage", "StatContainer_BonusBaseWeaponDamage", "StatContainer_BaseAttackDamagePercent", "StatContainer_BulletDamage"];
    var STAT_BONUSES_MAX_HEALTH_IDS = ["StatContainer_MaxHealth", "StatContainer_BaseHealth", "StatContainer_ArmorPower"];
    // ── Stat definitions: drives the 6-stat processing loop (deduplicates 6× repeated code)
    var STAT_DEFS = [
        { key: "fireRate",       sourceCacheKey: "statBonusesFireRateSource",       labelCacheKey: "statBonusesFireRate",       candidateIds: STAT_BONUSES_FIRE_RATE_IDS,        labelPrefix: "Fire Rate: ",             stateTextKey: "lastFireRateText" },
        { key: "abilityCooldown", sourceCacheKey: "statBonusesAbilityCooldownSource", labelCacheKey: "statBonusesAbilityCooldown", candidateIds: STAT_BONUSES_ABILITY_COOLDOWN_IDS, labelPrefix: "Ability Cooldown %: ",     stateTextKey: "lastAbilityCooldownText" },
        { key: "spiritPower",    sourceCacheKey: "statBonusesSpiritPowerSource",    labelCacheKey: "statBonusesSpiritPower",    candidateIds: STAT_BONUSES_SPIRIT_POWER_IDS,    labelPrefix: "Spirit Power: ",           stateTextKey: "lastSpiritPowerText" },
        { key: "clipSize",       sourceCacheKey: "statBonusesClipSizeSource",       labelCacheKey: "statBonusesClipSize",       candidateIds: STAT_BONUSES_CLIP_SIZE_IDS,       labelPrefix: "Clip Size % Increase: ",   stateTextKey: "lastClipSizeText" },
        { key: "weaponDamage",   sourceCacheKey: "statBonusesWeaponDamageSource",   labelCacheKey: "statBonusesWeaponDamage",   candidateIds: STAT_BONUSES_WEAPON_DAMAGE_IDS,   labelPrefix: "Weapon Damage %: ",        stateTextKey: "lastWeaponDamageText" },
        { key: "maxHealth",      sourceCacheKey: "statBonusesMaxHealthSource",      labelCacheKey: "statBonusesMaxHealth",      candidateIds: STAT_BONUSES_MAX_HEALTH_IDS,      labelPrefix: "Max Health: ",             stateTextKey: "lastMaxHealthText" }
    ];
    function EnsureStatBonusesOverlay(root) {
        var overlay = GetCachedPanel("statBonusesOverlay");
        if (IsPanelValid(overlay)) {
            return overlay;
        }

        overlay = root.FindChildTraverse("QOLStatBonusesOverlay");
        if (!overlay) {
            var parent = GetGameplayHudPanel(root);
            if (!parent) return null;
            overlay = $.CreatePanel("Panel", parent, "QOLStatBonusesOverlay", {
                hittest: "false",
                hittestchildren: "false"
            });
            var title = $.CreatePanel("Label", overlay, "QOLStatBonusesTitle");
            title.text = "Stat Bonuses";
            var fireRate = $.CreatePanel("Label", overlay, "QOLStatBonusesFireRate");
            fireRate.AddClass("QOLStatBonusesLine");
            fireRate.text = "Fire Rate: --";
            var abilityCd = $.CreatePanel("Label", overlay, "QOLStatBonusesAbilityCooldown");
            abilityCd.AddClass("QOLStatBonusesLine");
            abilityCd.text = "Ability Cooldown %: --";
            var spiritPower = $.CreatePanel("Label", overlay, "QOLStatBonusesSpiritPower");
            spiritPower.AddClass("QOLStatBonusesLine");
            spiritPower.text = "Spirit Power: --";
            var clipSize = $.CreatePanel("Label", overlay, "QOLStatBonusesClipSize");
            clipSize.AddClass("QOLStatBonusesLine");
            clipSize.text = "Clip Size % Increase: --";
            var weaponDamage = $.CreatePanel("Label", overlay, "QOLStatBonusesWeaponDamage");
            weaponDamage.AddClass("QOLStatBonusesLine");
            weaponDamage.text = "Weapon Damage %: --";
            var maxHealth = $.CreatePanel("Label", overlay, "QOLStatBonusesMaxHealth");
            maxHealth.AddClass("QOLStatBonusesLine");
            maxHealth.text = "Max Health: --";
        }

        SetCachedPanel("statBonusesOverlay", overlay);
        SetCachedPanel("statBonusesTitle", overlay ? overlay.FindChildTraverse("QOLStatBonusesTitle") : null);
        SetCachedPanel("statBonusesFireRate", overlay ? overlay.FindChildTraverse("QOLStatBonusesFireRate") : null);
        SetCachedPanel("statBonusesAbilityCooldown", overlay ? overlay.FindChildTraverse("QOLStatBonusesAbilityCooldown") : null);
        SetCachedPanel("statBonusesSpiritPower", overlay ? overlay.FindChildTraverse("QOLStatBonusesSpiritPower") : null);
        SetCachedPanel("statBonusesClipSize", overlay ? overlay.FindChildTraverse("QOLStatBonusesClipSize") : null);
        SetCachedPanel("statBonusesWeaponDamage", overlay ? overlay.FindChildTraverse("QOLStatBonusesWeaponDamage") : null);
        SetCachedPanel("statBonusesMaxHealth", overlay ? overlay.FindChildTraverse("QOLStatBonusesMaxHealth") : null);
        return overlay;
    }

    function RemoveStatBonusesOverlay(root) {
        var overlay = GetCachedPanel("statBonusesOverlay");
        if (!IsPanelValid(overlay)) {
            overlay = root.FindChildTraverse("QOLStatBonusesOverlay");
        }
        if (IsPanelValid(overlay)) {
            overlay.DeleteAsync(0);
        }
        SetCachedPanel("statBonusesOverlay", null);
        SetCachedPanel("statBonusesTitle", null);
        SetCachedPanel("statBonusesFireRate", null);
        SetCachedPanel("statBonusesAbilityCooldown", null);
        SetCachedPanel("statBonusesSpiritPower", null);
        SetCachedPanel("statBonusesClipSize", null);
        SetCachedPanel("statBonusesWeaponDamage", null);
        SetCachedPanel("statBonusesMaxHealth", null);
        SetCachedPanel("statBonusesFireRateSource", null);
        SetCachedPanel("statBonusesAbilityCooldownSource", null);
        SetCachedPanel("statBonusesSpiritPowerSource", null);
        SetCachedPanel("statBonusesClipSizeSource", null);
        SetCachedPanel("statBonusesWeaponDamageSource", null);
        SetCachedPanel("statBonusesMaxHealthSource", null);
        SetCachedPanel("statBonusesIdolCountSource", null);
        SetCachedPanel("statBonusesTooltipBreakdown", null);
        State.statBonuses = {
            displayMode: "",
            lastLayoutSig: "",
            lastClassSig: "",
            lastTitleText: "",
            lastFireRateText: "",
            lastAbilityCooldownText: "",
            lastSpiritPowerText: "",
            lastClipSizeText: "",
            lastWeaponDamageText: "",
            lastMaxHealthText: "",
            nextSourceSearchMs: 0,
            nextSourceSearchByKey: {},
            nextIdolCountSearchMs: 0,
            nextTooltipScanMs: 0,
            goldenValues: {},
            debugLastSig: "",
            debugNextMs: 0
        };
    }

    function UpdateStatBonusesOverlay(root, cfg, hideoutOverride) {
        // ── Gate: custom HUD context ──
        if (!IsCustomHudContextActive(root)) {
            if (State.statBonuses.displayMode !== "context_off") {
                RemoveStatBonusesOverlay(root);
                State.statBonuses.displayMode = "context_off";
            }
            return;
        }

        // ── Gate: feature disabled ──
        var enabled = cfg.ENABLE_STAT_BONUSES === 1;
        if (!enabled) {
            if (State.statBonuses.displayMode !== "disabled") {
                RemoveStatBonusesOverlay(root);
                State.statBonuses.displayMode = "disabled";
            }
            return;
        }

        // ── Ensure overlay ──
        var overlay = EnsureStatBonusesOverlay(root);
        if (!overlay) return;

        // ── Hideout check ──
        var hideout = (typeof hideoutOverride === "boolean") ? hideoutOverride : isConnectedToHideout(root);
        if (hideout) {
            if (State.statBonuses.displayMode !== "hideout") {
                overlay.style.visibility = "collapse";
                for (var h = 0; h < STAT_DEFS.length; h++) {
                    var hLabel = GetCachedPanel(STAT_DEFS[h].labelCacheKey);
                    if (hLabel) hLabel.SetHasClass("is_zero", false);
                }
                State.statBonuses.lastClassSig = "";
            }
            State.statBonuses.displayMode = "hideout";
            return;
        }

        // ── Activate ──
        if (State.statBonuses.displayMode !== "active" || overlay.style.visibility !== "visible") {
            overlay.style.visibility = "visible";
        }
        State.statBonuses.displayMode = "active";

        // ── Layout config ──
        var statOffsetX = Utils.ClampConfigNumber(cfg.STAT_BONUSES_X_OFFSET, 0, -1000, 1000, true);
        var statOffsetY = Utils.ClampConfigNumber(cfg.STAT_BONUSES_Y_OFFSET, 0, 0, 1000, true);
        var statScale = Utils.ClampConfigNumber(cfg.STAT_BONUSES_SCALE, 100, 50, 200, true);
        var layoutSig = [
            String(statOffsetX),
            String(statOffsetY),
            String(statScale)
        ].join("|");
        if (layoutSig !== State.statBonuses.lastLayoutSig) {
            overlay.style.marginLeft = (-520 + statOffsetX) + "px";
            overlay.style.marginBottom = (70 + statOffsetY) + "px";
            overlay.style.preTransformScale2d = (statScale / 100).toFixed(2);
            State.statBonuses.lastLayoutSig = layoutSig;
        }

        // ── Resolve source panels + golden statue values ──
        var statBonusSourcesByKey = {};
        for (var s = 0; s < STAT_DEFS.length; s++) {
            var def = STAT_DEFS[s];
            def.source = ResolveStatBonusesSource(root, def.sourceCacheKey, def.candidateIds, Date.now ? Date.now() : (new Date()).getTime());
            def.value = ResolveGoldenStatBonusesValue(def.key, def.source);
            statBonusSourcesByKey[def.key] = def.source;
        }
        HarvestGoldenStatuesTooltipValue(root, Date.now ? Date.now() : (new Date()).getTime(), statBonusSourcesByKey);

        // ── Debug logging (guarded; never runs in production) ──
        if (STAT_BONUSES_DEBUG) {
            var nowMs = Date.now ? Date.now() : (new Date()).getTime();
            var unresolved = [];
            for (var ud = 0; ud < STAT_DEFS.length; ud++) {
                if (STAT_DEFS[ud].value === "--") unresolved.push(STAT_DEFS[ud].key);
            }
            if (unresolved.length > 0) {
                var srcSig = "srcIds(";
                for (var us = 0; us < STAT_DEFS.length; us++) {
                    srcSig += (us > 0 ? "," : "") + (STAT_DEFS[us].source ? String(STAT_DEFS[us].source.id || "?") : "-");
                }
                srcSig += ")";
                var totalsSig = "totals(";
                for (var ut = 0; ut < STAT_DEFS.length; ut++) {
                    totalsSig += (ut > 0 ? "," : "") + (STAT_DEFS[ut].source ? (ExtractStatDisplayText(STAT_DEFS[ut].source) || "-") : "-");
                }
                totalsSig += ")";
                var cacheSig = "cache(";
                var cacheKeys = ["fireRate","abilityCooldown","spiritPower","clipSize","weaponDamage","maxHealth"];
                var cacheLabels = ["fr","cd","sp","cl","wd","hp"];
                for (var uc = 0; uc < cacheKeys.length; uc++) {
                    cacheSig += (uc > 0 ? "," : "") + cacheLabels[uc] + "=" + (State.statBonuses.goldenValues[cacheKeys[uc]] || "-");
                }
                cacheSig += ")";
                var unresolvedKey = unresolved.join(",");
                StatBonusesDebugLogThrottled(
                    "overlay_unresolved|" + unresolvedKey + "|" + srcSig + "|" + totalsSig + "|" + cacheSig,
                    "overlay unresolved=" + unresolvedKey + " " + srcSig + " " + totalsSig + " " + cacheSig,
                    nowMs
                );
                var statContainerIds = [];
                if (root && root.FindChildrenWithClassTraverse) {
                    var statContainers = root.FindChildrenWithClassTraverse("statAttributeContainer") || [];
                    var seen = {};
                    for (var c = 0; c < statContainers.length; c++) {
                        var panel = statContainers[c];
                        if (!panel || !panel.id) continue;
                        var id = String(panel.id);
                        if (seen[id]) continue;
                        seen[id] = true;
                        statContainerIds.push(id);
                        if (statContainerIds.length >= 30) break;
                    }
                }
                StatBonusesDebugLogThrottled(
                    "overlay_containers|" + statContainerIds.join(","),
                    "visible stat containers: " + (statContainerIds.join(",") || "(none)"),
                    nowMs
                );
            } else {
                var resolvedParts = [];
                for (var rv = 0; rv < STAT_DEFS.length; rv++) {
                    resolvedParts.push(STAT_DEFS[rv].value);
                }
                var resolvedSig = resolvedParts.join("|");
                StatBonusesDebugLogThrottled(
                    "overlay_resolved|" + resolvedSig,
                    "overlay resolved values=fr:" + STAT_DEFS[0].value +
                        " cd:" + STAT_DEFS[1].value +
                        " sp:" + STAT_DEFS[2].value +
                        " cl:" + STAT_DEFS[3].value +
                        " wd:" + STAT_DEFS[4].value +
                        " hp:" + STAT_DEFS[5].value,
                    nowMs
                );
            }
        }

        // ── Zero-value detection ──
        for (var z = 0; z < STAT_DEFS.length; z++) {
            var zd = STAT_DEFS[z];
            zd.zero = IsStatBonusTokenZero(zd.value) || !!(zd.source && zd.source.BHasClass && zd.source.BHasClass(CLASS_IS_ZERO_VALUE));
        }

        // ── Title text ──
        var titleText = "Stat Bonuses (Golden Statues)";
        var titleLabel = GetCachedPanel("statBonusesTitle");
        if (titleLabel && titleText !== State.statBonuses.lastTitleText) {
            titleLabel.text = titleText;
            State.statBonuses.lastTitleText = titleText;
        }

        // ── Build display strings ──
        for (var d = 0; d < STAT_DEFS.length; d++) {
            STAT_DEFS[d].displayText = STAT_DEFS[d].labelPrefix + STAT_DEFS[d].value;
        }

        // ── CSS class signature + update ──
        var classSigParts = [];
        for (var cs = 0; cs < STAT_DEFS.length; cs++) {
            classSigParts.push(STAT_DEFS[cs].zero ? "1" : "0");
        }
        var classSig = classSigParts.join("|");
        if (classSig !== State.statBonuses.lastClassSig) {
            for (var cl = 0; cl < STAT_DEFS.length; cl++) {
                var clLabel = GetCachedPanel(STAT_DEFS[cl].labelCacheKey);
                if (clLabel) clLabel.SetHasClass("is_zero", STAT_DEFS[cl].zero);
            }
            State.statBonuses.lastClassSig = classSig;
        }

        // ── Label text updates ──
        for (var t = 0; t < STAT_DEFS.length; t++) {
            var td = STAT_DEFS[t];
            var labelPanel = GetCachedPanel(td.labelCacheKey);
            if (labelPanel && td.displayText !== State.statBonuses[td.stateTextKey]) {
                labelPanel.text = td.displayText;
                State.statBonuses[td.stateTextKey] = td.displayText;
            }
        }
    }

    // ── Registration ──
    QOL.register("statBonuses", {
        configKeys: ["ENABLE_STAT_BONUSES"],
        bucket: 6, phase: 4,
        gate: function(cfg) { return IsCfgEnabled(cfg, "ENABLE_STAT_BONUSES") || !!(State.statBonuses && State.statBonuses.displayMode && State.statBonuses.displayMode !== ""); },
        update: function(root, cfg, nowMs, State, hideoutConnected) {
            UpdateStatBonusesOverlay(root, cfg, hideoutConnected);
        },
        stateKeys: ["statBonuses"]
    });

    // ── Self-test ──
    try {
        if (typeof UpdateStatBonusesOverlay !== "function") throw new Error("UpdateStatBonusesOverlay is not a function");
    } catch(e) {
        $.Msg("[QOLLock][ERROR][" + _featureId + "] self-test failed: " + (e && e.message ? e.message : String(e)));
    }
})();

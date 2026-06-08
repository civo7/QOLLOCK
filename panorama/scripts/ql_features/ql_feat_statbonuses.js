// ql_feat_statbonuses.js — Stat bonuses overlay
// Extracted from ql_core.js, Phase 9 Step 2b
(function() {
    'use strict';
    var _dk = "ql_feat_statbonuses";
    var _deps = QOL.import(["extractStatDisplayText","getCachedPanel","getGameplayHudPanel","harvestGoldenStatuesTooltipValue","isCustomHudContextActive","isStatBonusTokenZero","resolveGoldenStatBonusesValue","resolveStatBonusesSource","state","setCachedPanel","statBonusesDebugLogThrottled","utils","isConnectedToHideout"]);
    var GC = _deps.getCachedPanel;
    var GGHP = _deps.getGameplayHudPanel;
    var S = _deps.state;
    var SC = _deps.setCachedPanel;
    var U = _deps.utils;
    var IsCfgEnabled = U.IsCfgEnabled;
    var IsPanelValid = U.IsPanelValid;
    var IsCustomHudContextActive = _deps.isCustomHudContextActive;
    var ExtractStatDisplayText = _deps.extractStatDisplayText;
    var GetGameplayHudPanel = _deps.getGameplayHudPanel;
    var HarvestGoldenStatuesTooltipValue = _deps.harvestGoldenStatuesTooltipValue;
    var IsStatBonusTokenZero = _deps.isStatBonusTokenZero;
    var ResolveGoldenStatBonusesValue = _deps.resolveGoldenStatBonusesValue;
    var ResolveStatBonusesSource = _deps.resolveStatBonusesSource;
    var StatBonusesDebugLogThrottled = _deps.statBonusesDebugLogThrottled;
    var isConnectedToHideout = _deps.isConnectedToHideout;
    var STAT_BONUSES_FIRE_RATE_IDS = ["StatContainer_FireRate"];
    function EnsureStatBonusesOverlay(root) {
        var overlay = GC("statBonusesOverlay");
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

        SC("statBonusesOverlay", overlay);
        SC("statBonusesTitle", overlay ? overlay.FindChildTraverse("QOLStatBonusesTitle") : null);
        SC("statBonusesFireRate", overlay ? overlay.FindChildTraverse("QOLStatBonusesFireRate") : null);
        SC("statBonusesAbilityCooldown", overlay ? overlay.FindChildTraverse("QOLStatBonusesAbilityCooldown") : null);
        SC("statBonusesSpiritPower", overlay ? overlay.FindChildTraverse("QOLStatBonusesSpiritPower") : null);
        SC("statBonusesClipSize", overlay ? overlay.FindChildTraverse("QOLStatBonusesClipSize") : null);
        SC("statBonusesWeaponDamage", overlay ? overlay.FindChildTraverse("QOLStatBonusesWeaponDamage") : null);
        SC("statBonusesMaxHealth", overlay ? overlay.FindChildTraverse("QOLStatBonusesMaxHealth") : null);
        return overlay;
    }

    function RemoveStatBonusesOverlay(root) {
        var overlay = GC("statBonusesOverlay");
        if (!IsPanelValid(overlay)) {
            overlay = root.FindChildTraverse("QOLStatBonusesOverlay");
        }
        if (IsPanelValid(overlay)) {
            overlay.DeleteAsync(0);
        }
        SC("statBonusesOverlay", null);
        SC("statBonusesTitle", null);
        SC("statBonusesFireRate", null);
        SC("statBonusesAbilityCooldown", null);
        SC("statBonusesSpiritPower", null);
        SC("statBonusesClipSize", null);
        SC("statBonusesWeaponDamage", null);
        SC("statBonusesMaxHealth", null);
        SC("statBonusesFireRateSource", null);
        SC("statBonusesAbilityCooldownSource", null);
        SC("statBonusesSpiritPowerSource", null);
        SC("statBonusesClipSizeSource", null);
        SC("statBonusesWeaponDamageSource", null);
        SC("statBonusesMaxHealthSource", null);
        SC("statBonusesIdolCountSource", null);
        SC("statBonusesTooltipBreakdown", null);
        S.statBonuses = {
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
        var nowMs = Date.now ? Date.now() : (new Date()).getTime();
        if (!IsCustomHudContextActive(root)) {
            if (S.statBonuses.displayMode !== "context_off") {
                RemoveStatBonusesOverlay(root);
                S.statBonuses.displayMode = "context_off";
            }
            return;
        }

        var enabled = cfg.ENABLE_STAT_BONUSES === 1;
        if (!enabled) {
            if (S.statBonuses.displayMode !== "disabled") {
                RemoveStatBonusesOverlay(root);
                S.statBonuses.displayMode = "disabled";
            }
            return;
        }

        var overlay = EnsureStatBonusesOverlay(root);
        if (!overlay) return;

        var hideout = (typeof hideoutOverride === "boolean") ? hideoutOverride : isConnectedToHideout(root);
        if (hideout) {
            if (S.statBonuses.displayMode !== "hideout") {
                overlay.style.visibility = "collapse";
                var fireRateHideout = GC("statBonusesFireRate");
                var abilityHideout = GC("statBonusesAbilityCooldown");
                var spiritHideout = GC("statBonusesSpiritPower");
                var clipHideout = GC("statBonusesClipSize");
                var weaponHideout = GC("statBonusesWeaponDamage");
                var healthHideout = GC("statBonusesMaxHealth");
                if (fireRateHideout) fireRateHideout.SetHasClass("is_zero", false);
                if (abilityHideout) abilityHideout.SetHasClass("is_zero", false);
                if (spiritHideout) spiritHideout.SetHasClass("is_zero", false);
                if (clipHideout) clipHideout.SetHasClass("is_zero", false);
                if (weaponHideout) weaponHideout.SetHasClass("is_zero", false);
                if (healthHideout) healthHideout.SetHasClass("is_zero", false);
                S.statBonuses.lastClassSig = "";
            }
            S.statBonuses.displayMode = "hideout";
            return;
        }

        if (S.statBonuses.displayMode !== "active" || overlay.style.visibility !== "visible") {
            overlay.style.visibility = "visible";
        }
        S.statBonuses.displayMode = "active";

        var statOffsetX = Number(cfg.STAT_BONUSES_X_OFFSET);
        var statOffsetY = Number(cfg.STAT_BONUSES_Y_OFFSET);
        var statScale = Number(cfg.STAT_BONUSES_SCALE);
        if (!isFinite(statOffsetX)) statOffsetX = 0;
        if (!isFinite(statOffsetY)) statOffsetY = 0;
        if (!isFinite(statScale)) statScale = 100;
        statOffsetX = Math.round(statOffsetX);
        statOffsetY = Math.round(statOffsetY);
        statScale = Math.round(statScale);
        if (statOffsetX < -1000) statOffsetX = -1000;
        if (statOffsetX > 1000) statOffsetX = 1000;
        if (statOffsetY < 0) statOffsetY = 0;
        if (statOffsetY > 1000) statOffsetY = 1000;
        if (statScale < 50) statScale = 50;
        if (statScale > 200) statScale = 200;
        var layoutSig = [
            String(statOffsetX),
            String(statOffsetY),
            String(statScale)
        ].join("|");
        if (layoutSig !== S.statBonuses.lastLayoutSig) {
            overlay.style.marginLeft = (-520 + statOffsetX) + "px";
            overlay.style.marginBottom = (70 + statOffsetY) + "px";
            overlay.style.preTransformScale2d = (statScale / 100).toFixed(2);
            S.statBonuses.lastLayoutSig = layoutSig;
        }

        var sourceFireRate = ResolveStatBonusesSource(root, "statBonusesFireRateSource", STAT_BONUSES_FIRE_RATE_IDS, nowMs);
        var sourceAbilityCooldown = ResolveStatBonusesSource(root, "statBonusesAbilityCooldownSource", STAT_BONUSES_ABILITY_COOLDOWN_IDS, nowMs);
        var sourceSpiritPower = ResolveStatBonusesSource(root, "statBonusesSpiritPowerSource", STAT_BONUSES_SPIRIT_POWER_IDS, nowMs);
        var sourceClipSize = ResolveStatBonusesSource(root, "statBonusesClipSizeSource", STAT_BONUSES_CLIP_SIZE_IDS, nowMs);
        var sourceWeaponDamage = ResolveStatBonusesSource(root, "statBonusesWeaponDamageSource", STAT_BONUSES_WEAPON_DAMAGE_IDS, nowMs);
        var sourceMaxHealth = ResolveStatBonusesSource(root, "statBonusesMaxHealthSource", STAT_BONUSES_MAX_HEALTH_IDS, nowMs);

        var statBonusSourcesByKey = {
            fireRate: sourceFireRate,
            abilityCooldown: sourceAbilityCooldown,
            spiritPower: sourceSpiritPower,
            clipSize: sourceClipSize,
            weaponDamage: sourceWeaponDamage,
            maxHealth: sourceMaxHealth
        };
        HarvestGoldenStatuesTooltipValue(root, nowMs, statBonusSourcesByKey);

        var fireRateValue = ResolveGoldenStatBonusesValue("fireRate", sourceFireRate);
        var abilityCooldownValue = ResolveGoldenStatBonusesValue("abilityCooldown", sourceAbilityCooldown);
        var spiritPowerValue = ResolveGoldenStatBonusesValue("spiritPower", sourceSpiritPower);
        var clipSizeValue = ResolveGoldenStatBonusesValue("clipSize", sourceClipSize);
        var weaponDamageValue = ResolveGoldenStatBonusesValue("weaponDamage", sourceWeaponDamage);
        var maxHealthValue = ResolveGoldenStatBonusesValue("maxHealth", sourceMaxHealth);

        if (STAT_BONUSES_DEBUG) {
            var unresolved = [];
            if (fireRateValue === "--") unresolved.push("fireRate");
            if (abilityCooldownValue === "--") unresolved.push("abilityCooldown");
            if (spiritPowerValue === "--") unresolved.push("spiritPower");
            if (clipSizeValue === "--") unresolved.push("clipSize");
            if (weaponDamageValue === "--") unresolved.push("weaponDamage");
            if (maxHealthValue === "--") unresolved.push("maxHealth");

            if (unresolved.length > 0) {
                var srcSig = "srcIds(" +
                    (sourceFireRate ? String(sourceFireRate.id || "?") : "-") + "," +
                    (sourceAbilityCooldown ? String(sourceAbilityCooldown.id || "?") : "-") + "," +
                    (sourceSpiritPower ? String(sourceSpiritPower.id || "?") : "-") + "," +
                    (sourceClipSize ? String(sourceClipSize.id || "?") : "-") + "," +
                    (sourceWeaponDamage ? String(sourceWeaponDamage.id || "?") : "-") + "," +
                    (sourceMaxHealth ? String(sourceMaxHealth.id || "?") : "-") + ")";
                var totalsSig = "totals(" +
                    (sourceFireRate ? (ExtractStatDisplayText(sourceFireRate) || "-") : "-") + "," +
                    (sourceAbilityCooldown ? (ExtractStatDisplayText(sourceAbilityCooldown) || "-") : "-") + "," +
                    (sourceSpiritPower ? (ExtractStatDisplayText(sourceSpiritPower) || "-") : "-") + "," +
                    (sourceClipSize ? (ExtractStatDisplayText(sourceClipSize) || "-") : "-") + "," +
                    (sourceWeaponDamage ? (ExtractStatDisplayText(sourceWeaponDamage) || "-") : "-") + "," +
                    (sourceMaxHealth ? (ExtractStatDisplayText(sourceMaxHealth) || "-") : "-") + ")";
                var cacheSig = "cache(" +
                    "fr=" + (S.statBonuses.goldenValues.fireRate || "-") + "," +
                    "cd=" + (S.statBonuses.goldenValues.abilityCooldown || "-") + "," +
                    "sp=" + (S.statBonuses.goldenValues.spiritPower || "-") + "," +
                    "cl=" + (S.statBonuses.goldenValues.clipSize || "-") + "," +
                    "wd=" + (S.statBonuses.goldenValues.weaponDamage || "-") + "," +
                    "hp=" + (S.statBonuses.goldenValues.maxHealth || "-") + ")";
                var unresolvedKey = unresolved.join(",");
                var unresolvedSig = "overlay_unresolved|" + unresolvedKey + "|" + srcSig + "|" + totalsSig + "|" + cacheSig;
                StatBonusesDebugLogThrottled(
                    unresolvedSig,
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
                var containersSig = statContainerIds.join(",");
                StatBonusesDebugLogThrottled(
                    "overlay_containers|" + containersSig,
                    "visible stat containers: " + (containersSig || "(none)"),
                    nowMs
                );
            } else {
                var resolvedSig = [
                    fireRateValue,
                    abilityCooldownValue,
                    spiritPowerValue,
                    clipSizeValue,
                    weaponDamageValue,
                    maxHealthValue
                ].join("|");
                StatBonusesDebugLogThrottled(
                    "overlay_resolved|" + resolvedSig,
                    "overlay resolved values=fr:" + fireRateValue +
                        " cd:" + abilityCooldownValue +
                        " sp:" + spiritPowerValue +
                        " cl:" + clipSizeValue +
                        " wd:" + weaponDamageValue +
                        " hp:" + maxHealthValue,
                    nowMs
                );
            }
        }

        var fireRateZero = IsStatBonusTokenZero(fireRateValue) || !!(sourceFireRate && sourceFireRate.BHasClass && sourceFireRate.BHasClass(CLASS_IS_ZERO_VALUE));
        var abilityCooldownZero = IsStatBonusTokenZero(abilityCooldownValue) || !!(sourceAbilityCooldown && sourceAbilityCooldown.BHasClass && sourceAbilityCooldown.BHasClass(CLASS_IS_ZERO_VALUE));
        var spiritPowerZero = IsStatBonusTokenZero(spiritPowerValue) || !!(sourceSpiritPower && sourceSpiritPower.BHasClass && sourceSpiritPower.BHasClass(CLASS_IS_ZERO_VALUE));
        var clipSizeZero = IsStatBonusTokenZero(clipSizeValue) || !!(sourceClipSize && sourceClipSize.BHasClass && sourceClipSize.BHasClass(CLASS_IS_ZERO_VALUE));
        var weaponDamageZero = IsStatBonusTokenZero(weaponDamageValue) || !!(sourceWeaponDamage && sourceWeaponDamage.BHasClass && sourceWeaponDamage.BHasClass(CLASS_IS_ZERO_VALUE));
        var maxHealthZero = IsStatBonusTokenZero(maxHealthValue) || !!(sourceMaxHealth && sourceMaxHealth.BHasClass && sourceMaxHealth.BHasClass(CLASS_IS_ZERO_VALUE));

        var titleText = "Stat Bonuses (Golden Statues)";
        var titleLabel = GC("statBonusesTitle");
        if (titleLabel && titleText !== S.statBonuses.lastTitleText) {
            titleLabel.text = titleText;
            S.statBonuses.lastTitleText = titleText;
        }

        var fireRateText = "Fire Rate: " + fireRateValue;
        var abilityCooldownText = "Ability Cooldown %: " + abilityCooldownValue;
        var spiritPowerText = "Spirit Power: " + spiritPowerValue;
        var clipSizeText = "Clip Size % Increase: " + clipSizeValue;
        var weaponDamageText = "Weapon Damage %: " + weaponDamageValue;
        var maxHealthText = "Max Health: " + maxHealthValue;

        var classSig = (fireRateZero ? "1" : "0") +
            "|" + (abilityCooldownZero ? "1" : "0") +
            "|" + (spiritPowerZero ? "1" : "0") +
            "|" + (clipSizeZero ? "1" : "0") +
            "|" + (weaponDamageZero ? "1" : "0") +
            "|" + (maxHealthZero ? "1" : "0");
        if (classSig !== S.statBonuses.lastClassSig) {
            var fireRateLabelForClass = GC("statBonusesFireRate");
            var abilityLabelForClass = GC("statBonusesAbilityCooldown");
            var spiritLabelForClass = GC("statBonusesSpiritPower");
            var clipLabelForClass = GC("statBonusesClipSize");
            var weaponLabelForClass = GC("statBonusesWeaponDamage");
            var healthLabelForClass = GC("statBonusesMaxHealth");
            if (fireRateLabelForClass) fireRateLabelForClass.SetHasClass("is_zero", fireRateZero);
            if (abilityLabelForClass) abilityLabelForClass.SetHasClass("is_zero", abilityCooldownZero);
            if (spiritLabelForClass) spiritLabelForClass.SetHasClass("is_zero", spiritPowerZero);
            if (clipLabelForClass) clipLabelForClass.SetHasClass("is_zero", clipSizeZero);
            if (weaponLabelForClass) weaponLabelForClass.SetHasClass("is_zero", weaponDamageZero);
            if (healthLabelForClass) healthLabelForClass.SetHasClass("is_zero", maxHealthZero);
            S.statBonuses.lastClassSig = classSig;
        }

        var fireRateLabel = GC("statBonusesFireRate");
        if (fireRateLabel && fireRateText !== S.statBonuses.lastFireRateText) {
            fireRateLabel.text = fireRateText;
            S.statBonuses.lastFireRateText = fireRateText;
        }
        var abilityCooldownLabel = GC("statBonusesAbilityCooldown");
        if (abilityCooldownLabel && abilityCooldownText !== S.statBonuses.lastAbilityCooldownText) {
            abilityCooldownLabel.text = abilityCooldownText;
            S.statBonuses.lastAbilityCooldownText = abilityCooldownText;
        }
        var spiritPowerLabel = GC("statBonusesSpiritPower");
        if (spiritPowerLabel && spiritPowerText !== S.statBonuses.lastSpiritPowerText) {
            spiritPowerLabel.text = spiritPowerText;
            S.statBonuses.lastSpiritPowerText = spiritPowerText;
        }
        var clipSizeLabel = GC("statBonusesClipSize");
        if (clipSizeLabel && clipSizeText !== S.statBonuses.lastClipSizeText) {
            clipSizeLabel.text = clipSizeText;
            S.statBonuses.lastClipSizeText = clipSizeText;
        }
        var weaponDamageLabel = GC("statBonusesWeaponDamage");
        if (weaponDamageLabel && weaponDamageText !== S.statBonuses.lastWeaponDamageText) {
            weaponDamageLabel.text = weaponDamageText;
            S.statBonuses.lastWeaponDamageText = weaponDamageText;
        }
        var maxHealthLabel = GC("statBonusesMaxHealth");
        if (maxHealthLabel && maxHealthText !== S.statBonuses.lastMaxHealthText) {
            maxHealthLabel.text = maxHealthText;
            S.statBonuses.lastMaxHealthText = maxHealthText;
        }
    }

    // ── Registration ──
    QOL.register("statBonuses", {
        configKeys: ["ENABLE_STAT_BONUSES"],
        bucket: 6, phase: 4,
        gate: function(cfg) { return IsCfgEnabled(cfg, "ENABLE_STAT_BONUSES") || !!(S.statBonuses && S.statBonuses.displayMode && S.statBonuses.displayMode !== ""); },
        update: function(root, cfg, nowMs, State, hideoutConnected) {
            UpdateStatBonusesOverlay(root, cfg, hideoutConnected);
        },
        stateKeys: ["statBonuses"]
    });

})();

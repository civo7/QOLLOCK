// ql_feat_statbonuses.js — Stat bonuses overlay
// Extracted from ql_core.js, Phase 9 Step 2b
(function() {
    'use strict';
    var S = typeof QOL_STATE !== "undefined" ? QOL_STATE : undefined;
    var GC = typeof QOL_GetCachedPanel !== "undefined" ? QOL_GetCachedPanel : undefined;
    var SC = typeof QOL_SetCachedPanel !== "undefined" ? QOL_SetCachedPanel : undefined;
    var U = typeof QOL_UTILS !== "undefined" ? QOL_UTILS : undefined;
    var IsPanelValid = U ? U.IsPanelValid : function() { return false; };
    var IsCfgEnabled = U ? U.IsCfgEnabled : function() { return false; };

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
        var nowMs = Date.now ? Date.now() : (new Date()).getTime();
        if (!IsCustomHudContextActive(root)) {
            if (State.statBonuses.displayMode !== "context_off") {
                RemoveStatBonusesOverlay(root);
                State.statBonuses.displayMode = "context_off";
            }
            return;
        }

        var enabled = cfg.ENABLE_STAT_BONUSES === 1;
        if (!enabled) {
            if (State.statBonuses.displayMode !== "disabled") {
                RemoveStatBonusesOverlay(root);
                State.statBonuses.displayMode = "disabled";
            }
            return;
        }

        var overlay = EnsureStatBonusesOverlay(root);
        if (!overlay) return;

        var hideout = (typeof hideoutOverride === "boolean") ? hideoutOverride : isConnectedToHideout(root);
        if (hideout) {
            if (State.statBonuses.displayMode !== "hideout") {
                overlay.style.visibility = "collapse";
                var fireRateHideout = GetCachedPanel("statBonusesFireRate");
                var abilityHideout = GetCachedPanel("statBonusesAbilityCooldown");
                var spiritHideout = GetCachedPanel("statBonusesSpiritPower");
                var clipHideout = GetCachedPanel("statBonusesClipSize");
                var weaponHideout = GetCachedPanel("statBonusesWeaponDamage");
                var healthHideout = GetCachedPanel("statBonusesMaxHealth");
                if (fireRateHideout) fireRateHideout.SetHasClass("is_zero", false);
                if (abilityHideout) abilityHideout.SetHasClass("is_zero", false);
                if (spiritHideout) spiritHideout.SetHasClass("is_zero", false);
                if (clipHideout) clipHideout.SetHasClass("is_zero", false);
                if (weaponHideout) weaponHideout.SetHasClass("is_zero", false);
                if (healthHideout) healthHideout.SetHasClass("is_zero", false);
                State.statBonuses.lastClassSig = "";
            }
            State.statBonuses.displayMode = "hideout";
            return;
        }

        if (State.statBonuses.displayMode !== "active" || overlay.style.visibility !== "visible") {
            overlay.style.visibility = "visible";
        }
        State.statBonuses.displayMode = "active";

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
        if (layoutSig !== State.statBonuses.lastLayoutSig) {
            overlay.style.marginLeft = (-520 + statOffsetX) + "px";
            overlay.style.marginBottom = (70 + statOffsetY) + "px";
            overlay.style.preTransformScale2d = (statScale / 100).toFixed(2);
            State.statBonuses.lastLayoutSig = layoutSig;
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
                    "fr=" + (State.statBonuses.goldenValues.fireRate || "-") + "," +
                    "cd=" + (State.statBonuses.goldenValues.abilityCooldown || "-") + "," +
                    "sp=" + (State.statBonuses.goldenValues.spiritPower || "-") + "," +
                    "cl=" + (State.statBonuses.goldenValues.clipSize || "-") + "," +
                    "wd=" + (State.statBonuses.goldenValues.weaponDamage || "-") + "," +
                    "hp=" + (State.statBonuses.goldenValues.maxHealth || "-") + ")";
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
        var titleLabel = GetCachedPanel("statBonusesTitle");
        if (titleLabel && titleText !== State.statBonuses.lastTitleText) {
            titleLabel.text = titleText;
            State.statBonuses.lastTitleText = titleText;
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
        if (classSig !== State.statBonuses.lastClassSig) {
            var fireRateLabelForClass = GetCachedPanel("statBonusesFireRate");
            var abilityLabelForClass = GetCachedPanel("statBonusesAbilityCooldown");
            var spiritLabelForClass = GetCachedPanel("statBonusesSpiritPower");
            var clipLabelForClass = GetCachedPanel("statBonusesClipSize");
            var weaponLabelForClass = GetCachedPanel("statBonusesWeaponDamage");
            var healthLabelForClass = GetCachedPanel("statBonusesMaxHealth");
            if (fireRateLabelForClass) fireRateLabelForClass.SetHasClass("is_zero", fireRateZero);
            if (abilityLabelForClass) abilityLabelForClass.SetHasClass("is_zero", abilityCooldownZero);
            if (spiritLabelForClass) spiritLabelForClass.SetHasClass("is_zero", spiritPowerZero);
            if (clipLabelForClass) clipLabelForClass.SetHasClass("is_zero", clipSizeZero);
            if (weaponLabelForClass) weaponLabelForClass.SetHasClass("is_zero", weaponDamageZero);
            if (healthLabelForClass) healthLabelForClass.SetHasClass("is_zero", maxHealthZero);
            State.statBonuses.lastClassSig = classSig;
        }

        var fireRateLabel = GetCachedPanel("statBonusesFireRate");
        if (fireRateLabel && fireRateText !== State.statBonuses.lastFireRateText) {
            fireRateLabel.text = fireRateText;
            State.statBonuses.lastFireRateText = fireRateText;
        }
        var abilityCooldownLabel = GetCachedPanel("statBonusesAbilityCooldown");
        if (abilityCooldownLabel && abilityCooldownText !== State.statBonuses.lastAbilityCooldownText) {
            abilityCooldownLabel.text = abilityCooldownText;
            State.statBonuses.lastAbilityCooldownText = abilityCooldownText;
        }
        var spiritPowerLabel = GetCachedPanel("statBonusesSpiritPower");
        if (spiritPowerLabel && spiritPowerText !== State.statBonuses.lastSpiritPowerText) {
            spiritPowerLabel.text = spiritPowerText;
            State.statBonuses.lastSpiritPowerText = spiritPowerText;
        }
        var clipSizeLabel = GetCachedPanel("statBonusesClipSize");
        if (clipSizeLabel && clipSizeText !== State.statBonuses.lastClipSizeText) {
            clipSizeLabel.text = clipSizeText;
            State.statBonuses.lastClipSizeText = clipSizeText;
        }
        var weaponDamageLabel = GetCachedPanel("statBonusesWeaponDamage");
        if (weaponDamageLabel && weaponDamageText !== State.statBonuses.lastWeaponDamageText) {
            weaponDamageLabel.text = weaponDamageText;
            State.statBonuses.lastWeaponDamageText = weaponDamageText;
        }
        var maxHealthLabel = GetCachedPanel("statBonusesMaxHealth");
        if (maxHealthLabel && maxHealthText !== State.statBonuses.lastMaxHealthText) {
            maxHealthLabel.text = maxHealthText;
            State.statBonuses.lastMaxHealthText = maxHealthText;
        }
    }

    // ── Registration ──
    QOL_REGISTER_FEATURE("statBonuses", {
        configKeys: ["ENABLE_STAT_BONUSES"],
        bucket: 6, phase: 4,
        gate: function(cfg) { return IsCfgEnabled(cfg, "ENABLE_STAT_BONUSES") || !!(S.statBonuses && S.statBonuses.displayMode && S.statBonuses.displayMode !== ""); },
        update: function(root, cfg, nowMs, State, hideoutConnected) {
            UpdateStatBonusesOverlay(root, cfg, hideoutConnected);
        },
        stateKeys: ["statBonuses"]
    });

})();

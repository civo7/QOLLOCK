// manifests/ql_item_mirror/manifest.js
// =============================================================================
// QOLLOCK — Crosshair Active Item Cooldown Mirror
// =============================================================================
// OWNS:        Crosshair active/passive item cooldown HUD overlay (QOLItemMirrorRoot,
//              QOLItemMirrorRow), item icon mirroring, radial clip sync, and countdowns.
// DOES NOT OWN: Base ability icons, shop purchasing logic
// DEPENDS ON:  QOL.core.FeatureRegistry, QOL.core.Scheduler
// CONFIG KEYS: ENABLE_PASSIVE_COOLDOWN, ENABLE_OLD_ITEM_COOLDOWNS,
//              PASSIVE_COOLDOWN_SIZE, PASSIVE_COOLDOWN_X, PASSIVE_COOLDOWN_Y,
//              PASSIVE_COOLDOWN_OPACITY
// PATTERN:     Adaptive Polling (50ms fast / 120ms idle). Self-scheduling via Scheduler.
// =============================================================================

(function () {
    "use strict";

    var FR = QOL.core && QOL.core.FeatureRegistry;
    if (!FR) {
        $.Msg("[QOLLock] ql_item_mirror: FeatureRegistry not found — aborting");
        return;
    }

    var FEATURE_ID = "ql_item_mirror";
    var ITEM_MIRROR_ICON_BASE_SIZE_PX = 45;
    // rate-exempt: 20Hz (50ms) active cadence during item drag mirror operation
    var ITEM_MIRROR_RENDER_INTERVAL_MS_ACTIVE = 50;
    var ITEM_MIRROR_RENDER_INTERVAL_MS_IDLE = 120;
    var ITEM_MIRROR_TEXT_PROBE_INTERVAL_MS = 80;
    var ITEM_MIRROR_EMPTY_TEXT_PROBE_INTERVAL_MS = 1000;
    var INLINE_STYLE_PATTERNS = {
        clip: /(?:^|;)\s*clip\s*:\s*([^;]+)/i,
        opacity: /(?:^|;)\s*opacity\s*:\s*([^;]+)/i,
        visibility: /(?:^|;)\s*visibility\s*:\s*([^;]+)/i
    };
    var ITEM_MIRROR_PROBE_SCAN_MS = 1630;
    var ITEM_MIRROR_RAPID_RETRIGGER_WINDOW_MS = 1300;
    var ITEM_MIRROR_RAPID_RETRIGGER_SUPPRESS_MS = 900;
    var ITEM_MIRROR_READY_OVERLAY_FLASH_MS = 420;

    var T2_BULLET_SHIELD_PAIR_GROUP = "tier2BulletShieldPair";
    var EXPRESS_SHOT_EXCLUDED_MOD_CLASSES = ["explosiveBullets", "rapidRounds", "highVelocityMag"];
    var BACKSTABBER_EXCLUDED_MOD_CLASSES = ["meleeCharge", "crushingFists"];

    var ITEM_MIRROR_TARGETS = [
        { className: "acolytesGlove", itemKind: "tech", tier: 1, iconSrc: "file://{images}/items/spirit/spirit_strike.psd" },
        { className: "medicBullets", itemKind: "weapon", tier: 1, style: "defensive", iconSrc: "file://{images}/items/weapon/restorative_shot.psd" },
        { className: "fireRatePlus", itemKind: "tech", tier: 2, iconSrc: "file://{images}/items/spirit/quicksilver_reload.psd" },
        { className: "fireRatePlus", itemKind: "tech", tier: 4, iconSrc: "file://{images}/items/spirit/mercurial_magnum.psd" },

        // Armor (vitality) targets
        { className: "vexBarrier", itemKind: "armor", tier: 2, iconSrc: "file://{images}/items/vitality/reactive_barrier.psd" },
        { className: "parryRebuttal", itemKind: "armor", tier: 3, iconSrc: "file://{images}/items/vitality/counterspell.psd" },
        { className: "tormentAura", itemKind: "armor", tier: 4, iconSrc: "file://{images}/items/vitality/cheat_death.psd" },
        { className: "bulletShield", itemKind: "armor", tier: 4, iconSrc: "file://{images}/items/vitality/diviners_kevlar.psd" },
        { className: "veilWalker", itemKind: "armor", tier: 3, iconSrc: "file://{images}/items/vitality/veil_walker.psd" },
        { className: "lifestrikeGauntlets", itemKind: "armor", tier: 1, style: "offensive", iconSrc: "file://{images}/items/vitality/melee_lifesteal.psd" },
        { className: "boxingGlove", itemKind: "armor", tier: 3, style: "offensive", iconSrc: "file://{images}/items/vitality/lifestrike.psd" },
        { className: "stimPak", itemKind: "armor", tier: 1, iconSrc: "file://{images}/items/vitality/healing_rite.psd" },
        { className: "savior", itemKind: "armor", tier: 2, iconSrc: "file://{images}/items/vitality/guardian_ward.psd" },
        { className: "restorativeLocket", itemKind: "armor", tier: 2, iconSrc: "file://{images}/items/vitality/restorative_locket.psd" },
        { className: "lastStand", itemKind: "armor", tier: 2, iconSrc: "file://{images}/items/vitality/return_fire.psd" },
        { className: "spiritShieldingT2", itemKind: "armor", tier: 2, style: "defensive", iconSrc: "file://{images}/items/vitality/spirit_shielding.psd", skipClassMatch: true, skipIconMatch: true, requireModClass: "bulletShield", requirePassiveItem: true, requireCooldownState: true, exceptionGroup: T2_BULLET_SHIELD_PAIR_GROUP },
        { className: "weaponShieldingT2", itemKind: "armor", tier: 2, style: "defensive", iconSrc: "file://{images}/items/vitality/weapon_shielding.psd", skipClassMatch: true, skipIconMatch: true, requireModClass: "bulletShield", requirePassiveItem: true, requireCooldownState: true, exceptionGroup: T2_BULLET_SHIELD_PAIR_GROUP },
        { className: "debuffRemover", itemKind: "armor", tier: 3, iconSrc: "file://{images}/items/vitality/debuff_remover.psd" },
        { className: "healthNova", itemKind: "armor", tier: 3, iconSrc: "file://{images}/items/vitality/healing_nova.psd" },
        { className: "metalSkin", itemKind: "armor", tier: 3, iconSrc: "file://{images}/items/vitality/metal_skin.psd" },
        { className: "medicBeam", itemKind: "armor", tier: 3, iconSrc: "file://{images}/items/vitality/rescue_beam.psd" },
        { className: "warpStone", itemKind: "armor", tier: 3, iconSrc: "file://{images}/items/vitality/warp_stone.psd" },
        { className: "colossus", itemKind: "armor", tier: 4, iconSrc: "file://{images}/items/vitality/colossus.psd" },
        { className: "savior", itemKind: "armor", tier: 4, iconSrc: "file://{images}/items/vitality/divine_barrier.psd" },
        { className: "infuser", itemKind: "armor", tier: 4, style: "offensive", iconSrc: "file://{images}/items/vitality/infuser.psd" },
        { className: "unstoppable", itemKind: "armor", tier: 4, iconSrc: "file://{images}/items/vitality/unstoppable.psd" },
        { className: "surgingPower", itemKind: "armor", tier: 4, style: "offensive", iconSrc: "file://{images}/items/vitality/vampiric_burst.psd" },
        { className: "surgingPower", itemKind: "armor", tier: 3, style: "offensive", iconSrc: "file://{images}/items/vitality/fury_trance.psd" },
        { className: "rocketBooster", itemKind: "armor", tier: 3, style: "offensive", iconSrc: "file://{images}/items/vitality/majestic_leap.psd" },
        { className: "phantomStrike", itemKind: "armor", tier: 4, style: "offensive", iconSrc: "file://{images}/items/vitality/phantom_strike.psd" },

        // Weapon targets
        { className: "headshotBooster", itemKind: "weapon", tier: 1, iconSrc: "file://{images}/items/weapon/headshot_booster.psd" },
        { className: "activeReload", itemKind: "weapon", tier: 2, iconSrc: "file://{images}/items/weapon/active_reload.psd" },
        { className: "meleeCharge", itemKind: "weapon", tier: 2, iconSrc: "file://{images}/items/weapon/melee_charge.psd" },
        { className: "explosiveBullets", itemKind: "weapon", tier: 2, iconSrc: "file://{images}/items/weapon/mystic_shot.psd" },
        { className: "backstabber", itemKind: "weapon", tier: 2, style: "offensive", iconSrc: "file://{images}/items/weapon/backstabber.psd", skipClassMatch: true, skipIconMatch: true, requirePassiveItem: true, requireCooldownState: true, excludedModClasses: BACKSTABBER_EXCLUDED_MOD_CLASSES },
        { className: "techGrenade", itemKind: "weapon", tier: 3, iconSrc: "file://{images}/items/weapon/alchemical_fire.psd" },
        { className: "fireRatePlusPlus", itemKind: "weapon", tier: 3, iconSrc: "file://{images}/items/weapon/burst_fire.psd" },
        { className: "headhunter", itemKind: "weapon", tier: 3, iconSrc: "file://{images}/items/weapon/headhunter.psd" },
        { className: "expressShot", itemKind: "weapon", tier: 3, style: "offensive", iconSrc: "file://{images}/items/weapon/express_shot.psd", skipClassMatch: true, skipIconMatch: true, requirePassiveItem: true, requireCooldownState: true, excludedModClasses: EXPRESS_SHOT_EXCLUDED_MOD_CLASSES },
        { className: "meleeCharge", itemKind: "weapon", tier: 4, iconSrc: "file://{images}/items/weapon/crushing_fists.psd" },
        { className: "fleetfootBoots", itemKind: "weapon", tier: 2, iconSrc: "file://{images}/items/weapon/fleetfoot.psd" },
        { className: "titanicMagazine", itemKind: "weapon", tier: 2, requireCooldownCarrier: true, iconSrc: "file://{images}/items/weapon/split_shot.psd" },
        { className: "electrifiedBullets", itemKind: "weapon", tier: 4, iconSrc: "file://{images}/items/weapon/capacitor.psd" },
        { className: "cloakingDevice", itemKind: "weapon", tier: 4, iconSrc: "file://{images}/items/weapon/shadow_weave.psd" },
        { className: "bulletDamageAura", itemKind: "weapon", tier: 3, style: "offensive", iconSrc: "file://{images}/items/weapon/heroic_aura.psd" },
        { className: "item_gadget_enemy", itemKind: "weapon", tier: 3, iconSrc: "file://{images}/items/weapon/cultist_sacrifice.psd" },
        { className: "absorbingArmor", itemKind: "weapon", tier: 2, iconSrc: "file://{images}/items/weapon/recharging_rounds.psd" },

        // Tech (spirit) targets
        { className: "megaSpirit", itemKind: "tech", tier: 3, style: "defensive", iconSrc: "file://{images}/items/spirit/radiant_regeneration.psd" },
        { className: "magicBurst", itemKind: "tech", tier: 1, iconSrc: "file://{images}/items/spirit/mystic_burst.psd" },
        { className: "spiritSnatch", itemKind: "tech", tier: 3, iconSrc: "file://{images}/items/spirit/spirit_snatch.psd" },
        { className: "magicStorm", itemKind: "tech", tier: 3, iconSrc: "file://{images}/items/spirit/surge_of_power.psd" },
        { className: "magicShock", itemKind: "tech", tier: 3, iconSrc: "file://{images}/items/spirit/tankbuster.psd" },
        { className: "magicReverb", itemKind: "tech", tier: 4, iconSrc: "file://{images}/items/spirit/mystic_reverb.psd" },
        { className: "escalatingExposure", itemKind: "tech", tier: 4, requireCooldownCarrier: true, iconSrc: "file://{images}/items/spirit/spirit_burn.psd" },
        { className: "iceBlast", itemKind: "tech", tier: 2, iconSrc: "file://{images}/items/spirit/cold_front.psd" },
        { className: "focusedSilence", itemKind: "tech", tier: 2, iconSrc: "file://{images}/items/spirit/spirit_sap.psd" },
        { className: "rupture", itemKind: "tech", tier: 3, iconSrc: "file://{images}/items/spirit/decay.psd" },
        { className: "knockdown", itemKind: "tech", tier: 3, iconSrc: "file://{images}/items/spirit/knockdown.psd" },
        { className: "rupture", itemKind: "tech", tier: 4, iconSrc: "file://{images}/items/spirit/scourge.psd" },
        { className: "focusedSilence", itemKind: "tech", tier: 4, iconSrc: "file://{images}/items/spirit/focus_lens.psd" },
        { className: "abilityRefresher", itemKind: "tech", tier: 4, iconSrc: "file://{images}/items/spirit/refresher.psd" },
        { className: "iceBlast", itemKind: "tech", tier: 4, iconSrc: "file://{images}/items/spirit/arctic_blast.psd" },
        { className: "powerShard", itemKind: "tech", tier: 4, iconSrc: "file://{images}/items/spirit/echo_shard.psd" },
        { className: "glitch", itemKind: "tech", tier: 4, iconSrc: "file://{images}/items/spirit/curse.psd" },
        { className: "areaImmobilize", itemKind: "tech", tier: 4, iconSrc: "file://{images}/items/spirit/vortex_web.psd" },
        { className: "slowingTech", itemKind: "tech", tier: 1, style: "defensive", iconSrc: "file://{images}/items/spirit/rusted_barrel.psd" },
        { className: "immobilize", itemKind: "tech", tier: 2, style: "defensive", iconSrc: "file://{images}/items/spirit/slowing_hex.psd" },
        { className: "disarm", itemKind: "tech", tier: 3, style: "defensive", iconSrc: "file://{images}/items/spirit/disarming_hex.psd" },
        { className: "targetedSilence", itemKind: "tech", tier: 3, style: "defensive", iconSrc: "file://{images}/items/spirit/silence_glyph.psd" },
        { className: "magicCarpet", itemKind: "tech", tier: 4, style: "defensive", iconSrc: "file://{images}/items/spirit/magic_carpet.psd" },
        { className: "shiftingShroud", itemKind: "tech", tier: 4, style: "defensive", iconSrc: "file://{images}/items/spirit/ethereal_shift.psd" }
    ];

    var ITEM_MIRROR_FORCED_IMAGE_BY_CLASS = {
        acolytesGlove: "file://{images}/items/spirit/spirit_strike.psd",
        medicBullets: "file://{images}/items/weapon/restorative_shot.psd",
        fireRatePlus: "file://{images}/items/spirit/quicksilver_reload.psd"
    };

    var _nowMs = QOL.utils.PerfNowMs;

    var _isAlive = QOL.utils.IsPanelValid;

    function _getPanelClassTokens(panel) {
        if (!panel || !panel.GetAttributeString) return [];
        var classAttr = panel.GetAttributeString("class", "");
        if (!classAttr || classAttr.length === 0) return [];
        var split = classAttr.split(/\s+/);
        var out = [];
        for (var i = 0; i < split.length; i++) {
            if (split[i]) out.push(split[i]);
        }
        return out;
    }

    function _syncPanelClasses(source, target, cache, cacheKey, seedClasses) {
        if (!source || !target) return;
        var prior = cache[cacheKey] || [];
        var map = {};
        for (var i = 0; i < prior.length; i++) if (prior[i]) map[prior[i]] = true;
        if (seedClasses) {
            for (var s = 0; s < seedClasses.length; s++) if (seedClasses[s]) map[seedClasses[s]] = true;
        }
        var fromAttr = _getPanelClassTokens(source);
        for (var a = 0; a < fromAttr.length; a++) if (fromAttr[a]) map[fromAttr[a]] = true;

        var tokens = Object.keys(map);
        for (var t = 0; t < tokens.length; t++) {
            var cls = tokens[t];
            target.SetHasClass(cls, source.BHasClass && source.BHasClass(cls));
        }
        cache[cacheKey] = tokens;
    }

    function _parseRadialClipEndDeg(clipText) {
        if (!clipText || clipText.length === 0) return null;
        var m = /,\s*([+\-]?\d+(?:\.\d+)?)\s*deg\s*\)/i.exec(String(clipText));
        if (!m || !m[1]) return null;
        var v = parseFloat(m[1]);
        return isFinite(v) ? v : null;
    }

    function _parseRadialClipStartDeg(clipText) {
        if (!clipText || clipText.length === 0) return null;
        var text = String(clipText);
        var m = /radial\s*\(\s*[^,]+,\s*([+\-]?\d+(?:\.\d+)?)\s*deg\s*,/i.exec(text);
        if ((!m || !m[1]) && text.indexOf(",") >= 0) {
            m = /,\s*([+\-]?\d+(?:\.\d+)?)\s*deg\s*,/i.exec(text);
        }
        if (!m || !m[1]) return null;
        var v = parseFloat(m[1]);
        return isFinite(v) ? v : null;
    }

    function _resolveRadialProgressDeg(clipText, previousDeg) {
        var startDeg = _parseRadialClipStartDeg(clipText);
        var endDeg = _parseRadialClipEndDeg(clipText);
        if (startDeg === null && endDeg === null) return null;
        if (startDeg === null) return endDeg;
        if (endDeg === null) return startDeg;
        if (!isFinite(startDeg) && !isFinite(endDeg)) return null;
        if (!isFinite(startDeg)) return endDeg;
        if (!isFinite(endDeg)) return startDeg;
        if (Math.abs(startDeg) <= 0.01 && endDeg > 0.01) return endDeg;
        if (Math.abs(endDeg) <= 0.01 && startDeg > 0.01) return startDeg;
        if (previousDeg !== null && isFinite(previousDeg)) {
            var ds = Math.abs(startDeg - previousDeg);
            var de = Math.abs(endDeg - previousDeg);
            if (ds < de) return startDeg;
            if (de < ds) return endDeg;
        }
        return (Math.abs(startDeg) >= Math.abs(endDeg)) ? startDeg : endDeg;
    }

    function _formatDerivedCooldownSeconds(sec) {
        if (!isFinite(sec) || sec <= 0) return "";
        if (sec >= 1) return String(Math.ceil(sec));
        var rounded = Math.round(sec * 10) / 10;
        return rounded.toFixed(1);
    }

    function _triggerReadyFlash(overlayPanel) {
        if (!_isAlive(overlayPanel)) return;
        try {
            if (overlayPanel.SetHasClass) overlayPanel.SetHasClass("ready_flash", false);
            overlayPanel.style.visibility = "visible";
        } catch (e) {}
        $.Schedule(0.01, function () {
            if (!_isAlive(overlayPanel)) return;
            try {
                if (overlayPanel.SetHasClass) overlayPanel.SetHasClass("ready_flash", true);
            } catch (e1) {}
            $.Schedule((ITEM_MIRROR_READY_OVERLAY_FLASH_MS + 40) / 1000.0, function () {
                if (!_isAlive(overlayPanel)) return;
                try {
                    if (overlayPanel.SetHasClass) overlayPanel.SetHasClass("ready_flash", false);
                } catch (e2) {}
            });
        });
    }


    function _findFirstExcludedModClassHit(iconContainer, ownerIcon, excludedModClasses) {
        if (!excludedModClasses || !excludedModClasses.length) return "";
        for (var i = 0; i < excludedModClasses.length; i++) {
            var cls = excludedModClasses[i];
            if (iconContainer && iconContainer.BHasClass && iconContainer.BHasClass(cls)) return cls;
            if (ownerIcon && ownerIcon.BHasClass && ownerIcon.BHasClass(cls)) return cls;
        }
        return "";
    }


    function _getFirstPanelTextByClass(parent, className) {
        if (!parent || !parent.FindChildrenWithClassTraverse) return "";
        var list = parent.FindChildrenWithClassTraverse(className);
        if (!list || !list.length) return "";
        for (var i = 0; i < list.length; i++) {
            var p = list[i];
            if (p && p.text) return String(p.text);
        }
        return "";
    }

    function _getFirstPanelTextById(parent, id) {
        if (!parent || !parent.FindChildTraverse) return "";
        var p = parent.FindChildTraverse(id);
        return (p && p.text) ? String(p.text) : "";
    }


    FR.register({
        id: FEATURE_ID,
        enableKey: "ENABLE_PASSIVE_COOLDOWN",
        enabledByDefault: false,
        settings: [
            { key: "ENABLE_PASSIVE_COOLDOWN", type: "toggle", default: false },
            { key: "ENABLE_OLD_ITEM_COOLDOWNS", type: "toggle", default: false },
            { key: "ITEM_FILTER_DEF_PASSIVE", type: "toggle", default: true },
            { key: "ITEM_FILTER_OFF_PASSIVE", type: "toggle", default: true },
            { key: "ITEM_FILTER_DEF_ACTIVE", type: "toggle", default: false },
            { key: "ITEM_FILTER_OFF_ACTIVE", type: "toggle", default: false },
            { key: "PASSIVE_COOLDOWN_SIZE", type: "slider", min: 30, max: 60, step: 1, default: 40 },
            { key: "PASSIVE_COOLDOWN_Y", type: "slider", min: -50, max: 50, step: 1, default: 0 },
            { key: "PASSIVE_COOLDOWN_X", type: "slider", min: -50, max: 50, step: 1, default: 0 },
            { key: "PASSIVE_COOLDOWN_OPACITY", type: "slider", min: 0, max: 1, step: 0.05, default: 0.5 }
        ],
        create: function(ctx) {
            var _loop = null, _overlay = null, _row = null;
            var _slots = [];
            var _abilities = null, _abilitiesHud = null;
            var _mirror = { sources: [], slotStates: {}, classCache: {}, runtimePanelIds: [], exceptionGroupAssignments: {}, nextSourceId: 0, nextAcquireOrder: 0 };
            var _nextScanMs = 0, _lastSignature = '', _lastLayoutSig = '', _lastShopOpen = false;
            var ITEM_MIRROR_FLASH_DEBUG = false, ITEM_MIRROR_COOLDOWN_DEBUG = false;
            var ITEM_MIRROR_EXPRESS_DEBUG = false, ITEM_MIRROR_EXCEPTION_DEBUG = false;
            var ITEM_MIRROR_COOLDOWN_DEBUG_THROTTLE_MS = 350;
            function _findItemOwnerFromContainer(iconContainer) {
                    var current = iconContainer;
                    while (current) {
                        if (current.BHasClass) {
                            if (current.BHasClass("isWeapon") || current.BHasClass("isArmor") || current.BHasClass("isTech")) return current;
                            if (current.BHasClass("isTier1") || current.BHasClass("isTier2") || current.BHasClass("isTier3") || current.BHasClass("isTier4")) return current;
                        }
                        current = current.GetParent ? current.GetParent() : null;
                    }
                    return null;
                }
            
            function _getInlineStyleProperty(panel, propName) {
                    if (!panel || !panel.GetAttributeString || !propName) return "";
                    var styleText = panel.GetAttributeString("style", "");
                    if (!styleText || styleText.length === 0) return "";
                    var pattern = INLINE_STYLE_PATTERNS[propName];
                    var match = pattern ? pattern.exec(styleText) : null;
                    return match && match[1] ? match[1].trim() : "";
                }
            
            function _normalizeCooldownNumberText(text) {
                    if (!text || typeof text !== "string") return "";
                    var trimmed = text.trim();
                    if (trimmed.length === 0) return "";
                    var exact = /^(\d+(?:\.\d+)?)(?:s)?$/i.exec(trimmed);
                    if (exact && exact[1]) return exact[1];
                    var contains = /(\d+(?:\.\d+)?)/.exec(trimmed);
                    if (contains && contains[1]) return contains[1];
                    return "";
                }
            
            function _isItemMirrorCooldownProbeExcludedPanel(panel) {
                    if (!panel) return false;
                    var panelId = "";
                    try { panelId = String(panel.id || ""); } catch(e0) { QOL.core.Logger.logWarn("core", "op failed: " + (e0 && e0.message ? e0.message : String(e0 || ""))); }
                    if (
                        panelId === "UpgradeLevelContainer" ||
                        panelId === "UpgradeLevel" ||
                        panelId === "TierContainer" ||
                        panelId === "mod_tier_label" ||
                        panelId === "ItemHidden" ||
                        panelId === "embedded_active_tag" ||
                        panelId === "ActiveTagContainer"
                    ) {
                        return true;
                    }
                    if (panel.BHasClass) {
                        try {
                            if (
                                panel.BHasClass("tier_bg") ||
                                panel.BHasClass("mod_icon_background_container")
                            ) {
                                return true;
                            }
                        } catch(e1) { QOL.core.Logger.logWarn("core", "op failed: " + (e1 && e1.message ? e1.message : String(e1 || ""))); }
                    }
                    return false;
                }
            
            function _findNumericLabelTextInTree(panel) {
                    if (!panel || !panel.Children) return "";
                    var queue = [panel];
                    var best = "";
                    for (var cursor = 0; cursor < queue.length; cursor++) {
                        var current = queue[cursor];
                        if (!current) continue;
            
                        if (_isItemMirrorCooldownProbeExcludedPanel(current)) continue;
            
                        if (typeof current.text === "string") {
                            var t = current.text.trim();
                            var norm = _normalizeCooldownNumberText(t);
                            if (norm && norm.length > 0) {
                                if (!best || norm.length <= best.length) {
                                    best = norm;
                                    if (t.length <= 2) return best;
                                }
                            }
                        }
            
                        var kids = current.Children ? current.Children() : [];
                        for (var i = 0; i < kids.length; i++) queue.push(kids[i]);
                    }
                    return best;
                }
            
            function _probeCooldownTextFromSourceIcon(sourceIcon) {
                    var classCandidates = ["Countdown", "cooldown_text", "CooldownText", "CooldownLabel"];
                    var idCandidates = ["Countdown", "cooldown_text", "CooldownText", "CooldownLabel"];
                    var byClass = {};
                    var byId = {};
                    var chosen = "";
                    var chosenSource = "";
            
                    if (!sourceIcon) {
                        return { chosen: "", chosenSource: "", byClass: byClass, byId: byId, numeric: "" };
                    }
            
                    for (var i = 0; i < classCandidates.length; i++) {
                        var cls = classCandidates[i];
                        var rawByClass = _getFirstPanelTextByClass(sourceIcon, cls);
                        var normByClass = _normalizeCooldownNumberText(rawByClass);
                        byClass[cls] = normByClass || "";
                        if (!chosen && normByClass) {
                            chosen = normByClass;
                            chosenSource = "class:" + cls;
                            return { chosen: chosen, chosenSource: chosenSource };
                        }
                    }
            
                    for (var j = 0; j < idCandidates.length; j++) {
                        var id = idCandidates[j];
                        var rawById = _getFirstPanelTextById(sourceIcon, id);
                        var normById = _normalizeCooldownNumberText(rawById);
                        byId[id] = normById || "";
                        if (!chosen && normById) {
                            chosen = normById;
                            chosenSource = "id:" + id;
                            return { chosen: chosen, chosenSource: chosenSource };
                        }
                    }
            
                    var numeric = _findNumericLabelTextInTree(sourceIcon);
                    if (!chosen && numeric) {
                        chosen = numeric;
                        chosenSource = "numeric";
                    }
            
                    return {
                        chosen: chosen || "",
                        chosenSource: chosenSource || "",
                        byClass: byClass,
                        byId: byId,
                        numeric: numeric || ""
                    };
                }
            
            function _findFirstImageSrcInTree(panel) {
                    if (!panel || !panel.Children) return "";
                    var queue = [panel];
                    while (queue.length > 0) {
                        var current = queue.shift();
                        if (!current) continue;
                        if (current.GetAttributeString) {
                            var src = current.GetAttributeString("src", "");
                            if (src && src !== "none") return src;
                            var def = current.GetAttributeString("defaultsrc", "");
                            if (def && def !== "none") return def;
                        }
                        var bg = "";
                        try {
                            bg = (current.style && current.style.backgroundImage) ? String(current.style.backgroundImage) : "";
                        } catch (e) {
                            bg = "";
                        }
                        var fromBg = _extractUrlFromBackgroundImage(bg);
                        if (fromBg && fromBg !== "none") return fromBg;
                        var kids = current.Children ? current.Children() : [];
                        for (var i = 0; i < kids.length; i++) queue.push(kids[i]);
                    }
                    return "";
                }
            
            function _extractUrlFromBackgroundImage(styleValue) {
                    if (!styleValue) return "";
                    var s = String(styleValue).trim();
                    if (!s || s === "none") return "";
                    // Panorama commonly stores image styles as: url("file://{images}/...")
                    var match = s.match(/url\((['"]?)(.*?)\1\)/i);
                    if (match && match[2]) {
                        return String(match[2]).trim();
                    }
                    return "";
                }
            
            function _getImageSrc(panel) {
                    if (!panel || !panel.GetAttributeString) return "";
                    var src = panel.GetAttributeString("src", "");
                    if (src && src !== "none") return src;
                    var def = panel.GetAttributeString("defaultsrc", "");
                    if (def && def !== "none") return def;
                    var bg = "";
                    try {
                        bg = (panel.style && panel.style.backgroundImage) ? String(panel.style.backgroundImage) : "";
                    } catch (e) {
                        bg = "";
                    }
                    var fromBg = _extractUrlFromBackgroundImage(bg);
                    if (fromBg && fromBg !== "none") return fromBg;
                    return "";
                }
            
            function _normalizeIconPath(path) {
                    if (!path) return "";
                    var s = String(path).trim().toLowerCase();
                    if (s.indexOf("panorama:") === 0) s = s.substring(9);
                    s = s.replace(/\\/g, "/");
                    s = s.replace(/\s+/g, "");
                    return s;
                }
            
            function _extractImagePathTail(path) {
                    var s = _normalizeIconPath(path);
                    if (!s) return "";
                    var idx = s.indexOf("{images}/");
                    if (idx >= 0) return s.substring(idx);
                    idx = s.indexOf("images/");
                    if (idx >= 0) return s.substring(idx);
                    return s;
                }
            
            function _stripKnownImageExt(path) {
                    if (!path) return "";
                    return path.replace(/\.(psd|vtex|vsvg|png|jpg|jpeg)$/, "");
                }
            
            function _iconSourceMatchesTarget(foundSrc, expectedSrc) {
                    if (!expectedSrc || expectedSrc.length === 0) return true;
                    var foundNorm = _normalizeIconPath(foundSrc);
                    var expectedNorm = _normalizeIconPath(expectedSrc);
                    if (!foundNorm || !expectedNorm) return false;
                    if (foundNorm === expectedNorm) return true;
            
                    var foundTail = _extractImagePathTail(foundNorm);
                    var expectedTail = _extractImagePathTail(expectedNorm);
                    if (!foundTail || !expectedTail) return false;
                    if (foundTail === expectedTail) return true;
                    if (foundTail.indexOf(expectedTail) !== -1 || expectedTail.indexOf(foundTail) !== -1) return true;
            
                    var foundNoExt = _stripKnownImageExt(foundTail);
                    var expectedNoExt = _stripKnownImageExt(expectedTail);
                    if (foundNoExt === expectedNoExt) return true;
                    return (foundNoExt.indexOf(expectedNoExt) !== -1 || expectedNoExt.indexOf(foundNoExt) !== -1);
                }
            
            function _ownerMatchesItemKind(ownerIcon, itemKind) {
                    if (!itemKind || itemKind.length === 0) return true;
                    if (!ownerIcon || !ownerIcon.BHasClass) return false;
                    var kind = String(itemKind).toLowerCase();
                    if (kind === "weapon") return ownerIcon.BHasClass("isWeapon");
                    if (kind === "armor" || kind === "vitality") return ownerIcon.BHasClass("isArmor");
                    if (kind === "tech" || kind === "spirit") return ownerIcon.BHasClass("isTech");
                    return true;
                }
            
            function _detectOwnerTier(ownerIcon) {
                    if (!ownerIcon || !ownerIcon.BHasClass) return null;
            
                    // Prefer the highest tier class present on owner icon.
                    for (var t = 4; t >= 1; t--) {
                        if (ownerIcon.BHasClass("isTier" + String(t))) return t;
                    }
            
                    // Fallback: read explicit tier label classes if owner tier class is missing.
                    var tierLabel = ownerIcon.FindChildTraverse ? ownerIcon.FindChildTraverse("mod_tier_label") : null;
                    if (tierLabel && tierLabel.BHasClass) {
                        for (var lt = 4; lt >= 1; lt--) {
                            if (tierLabel.BHasClass("ModTierLevel" + String(lt))) return lt;
                        }
                    }
            
                    return null;
                }
            
            function _ownerMatchesTier(ownerIcon, tier) {
                    if (tier === undefined || tier === null || tier === "") return true;
                    if (!ownerIcon || !ownerIcon.BHasClass) return false;
                    var tierNum = parseInt(tier, 10);
                    if (!isFinite(tierNum)) return true;
                    if (tierNum < 1 || tierNum > 4) return true;
                    var detected = _detectOwnerTier(ownerIcon);
                    if (detected !== null) return detected === tierNum;
                    return ownerIcon.BHasClass("isTier" + String(tierNum));
                }
            
            function _ownerMatchesExtraClass(ownerIcon, ownerClassName) {
                    if (!ownerClassName || ownerClassName.length === 0) return true;
                    if (!ownerIcon || !ownerIcon.BHasClass) return false;
                    return ownerIcon.BHasClass(ownerClassName);
                }
            
            function _ownerMatchesCooldownCarrier(ownerIcon, requireCooldownCarrier) {
                    if (!requireCooldownCarrier) return true;
                    if (!ownerIcon || !ownerIcon.BHasClass) return false;
                    var hasCooldownState = ownerIcon.BHasClass("OnCooldown") || ownerIcon.BHasClass("OffCooldown");
                    if (!hasCooldownState) return false;
                    var cooldownMask = ownerIcon.FindChildTraverse ? ownerIcon.FindChildTraverse("CooldownMask") : null;
                    return !!cooldownMask;
                }
            
            function _ownerMatchesCooldownState(ownerIcon, requireCooldownState) {
                    if (!requireCooldownState) return true;
                    if (!ownerIcon || !ownerIcon.BHasClass) return false;
                    return ownerIcon.BHasClass("OnCooldown") || ownerIcon.BHasClass("OffCooldown");
                }
            
            function _ownerMatchesUseType(ownerIcon, requirePassiveItem, requireActiveItem) {
                    if (!ownerIcon || !ownerIcon.BHasClass) return false;
                    var isActiveItem = ownerIcon.BHasClass("isActiveItem");
                    if (requirePassiveItem && isActiveItem) return false;
                    if (requireActiveItem && !isActiveItem) return false;
                    return true;
                }
            
            function _entryHasClass(entry, className) {
                    if (!entry || !className) return false;
                    var iconContainer = entry.iconContainer;
                    var ownerIcon = entry.ownerIcon;
                    if (iconContainer && iconContainer.BHasClass && iconContainer.BHasClass(className)) return true;
                    return !!(ownerIcon && ownerIcon.BHasClass && ownerIcon.BHasClass(className));
                }

            function _entryMatchesExcludedModClasses(entry, excludedModClasses) {
                    return _findFirstExcludedModClassHit(entry && entry.iconContainer, entry && entry.ownerIcon, excludedModClasses).length === 0;
                }
            
            function _resolveTargetStyle(target) {
                    if (target && target.style) {
                        var explicitStyle = String(target.style).toLowerCase();
                        if (explicitStyle === "offensive" || explicitStyle === "defensive") {
                            return explicitStyle;
                        }
                    }
                    var kind = target && target.itemKind ? String(target.itemKind).toLowerCase() : "";
                    if (kind === "weapon" || kind === "tech" || kind === "spirit") {
                        return "offensive";
                    }
                    return "defensive";
                }
            
            function _isOwnerActiveUse(ownerIcon) {
                    if (!ownerIcon || !ownerIcon.BHasClass) return false;
                    if (ownerIcon.BHasClass("isActiveItem")) return true;
                    if (ownerIcon.BHasClass("isPassiveItem")) return false;
                    return false;
                }
            
            function _ownerMatchesMirrorCategory(ownerIcon, target, cfg) {
                    if (!cfg) return true;
                    var style = _resolveTargetStyle(target);
                    var isActiveUse = _isOwnerActiveUse(ownerIcon);
                    var key = "";
                    if (style === "offensive") {
                        key = isActiveUse ? "ITEM_FILTER_OFF_ACTIVE" : "ITEM_FILTER_OFF_PASSIVE";
                    } else {
                        key = isActiveUse ? "ITEM_FILTER_DEF_ACTIVE" : "ITEM_FILTER_DEF_PASSIVE";
                    }
                    if (!cfg.hasOwnProperty(key)) return true;
                    return Number(cfg[key]) === 1;
                }
            
            function _collectItemMirrorModsContainers(root) {
                    var out = [];
                    if (!root || !root.FindChildTraverse || !root.FindChildrenWithClassTraverse) {
                        return out;
                    }
            
                    function PushUnique(panel) {
                        if (!_isAlive(panel)) return;
                        for (var i = 0; i < out.length; i++) {
                            if (out[i] === panel) return;
                        }
                        out.push(panel);
                    }
            
                    function CollectFromSubtree(parent) {
                        if (!_isAlive(parent) || !parent.FindChildrenWithClassTraverse) return;
                        var found = parent.FindChildrenWithClassTraverse("ModsContainer") || [];
                        for (var i = 0; i < found.length; i++) {
                            PushUnique(found[i]);
                        }
                    }
            
                    var focusedRoots = [
                        "StatsAndModsContainer",
                        "LowerLeft",
                        "ModPurchasedPanelUniversal",
                        "ModPurchasedPanelUniversalLocked"
                    ];
                    for (var fr = 0; fr < focusedRoots.length; fr++) {
                        var subtree = root.FindChildTraverse(focusedRoots[fr]);
                        if (!_isAlive(subtree)) continue;
                        CollectFromSubtree(subtree);
                    }
            
                    // Do not perform exhaustive full-DOM scan when focused mod roots are absent/collapsed
                    return out;
                }
            
            function _buildItemMirrorSourceIndex(root) {
                    var modsContainers = _collectItemMirrorModsContainers(root);
                    var entries = [];
                    var scannedCount = 0;
                    var seenOwnerIcons = [];
                    var seenOwnerIds = [];
                    for (var mc = 0; mc < modsContainers.length; mc++) {
                        var modsContainer = modsContainers[mc];
                        if (!modsContainer) continue;
                        var nestedIcons = modsContainer.FindChildrenWithClassTraverse("mod_icon_single_container") || [];
                        for (var ni = 0; ni < nestedIcons.length; ni++) {
                            var nested = nestedIcons[ni];
                            if (!nested || nested.id !== "modIconContainer") continue;
                            scannedCount++;
            
                            var ownerIcon = _findItemOwnerFromContainer(nested);
                            if (!ownerIcon || !ownerIcon.BHasClass || !ownerIcon.BHasClass("hasAbility")) continue;
            
                            var ownerId = ownerIcon.id ? String(ownerIcon.id) : "";
            
                            // Dedup: skip entries for the same owner icon (same item appearing
                            // under multiple ModsContainers, e.g. Universal + Locked Universal panels).
                            // Check by both panel identity AND ownerId string, since different
                            // ModsContainers may produce distinct panel instances for the same item.
                            // Dynamic CitadelModIcon panels can have no ID; an empty ID is not identity.
                            var isDuplicateOwner = false;
                            for (var si = 0; si < seenOwnerIcons.length; si++) {
                                if (seenOwnerIcons[si] === ownerIcon) { isDuplicateOwner = true; break; }
                            }
                            if (!isDuplicateOwner && ownerId.length > 0) {
                                for (var sj = 0; sj < seenOwnerIds.length; sj++) {
                                    if (seenOwnerIds[sj] === ownerId) { isDuplicateOwner = true; break; }
                                }
                            }
                            if (isDuplicateOwner) continue;
                            seenOwnerIcons.push(ownerIcon);
                            if (ownerId.length > 0) seenOwnerIds.push(ownerId);
                            var cooldownState = ownerIcon.BHasClass("OffCooldown") ? "off" : "on";
                            var sourceImage = nested.FindChildTraverse ? nested.FindChildTraverse("ModIconImage") : null;
                            if (!sourceImage && ownerIcon.FindChildTraverse) sourceImage = ownerIcon.FindChildTraverse("ModIconImage");
                            var cooldownMask = ownerIcon.FindChildTraverse ? ownerIcon.FindChildTraverse("CooldownMask") : null;
                            var iconSrc = _getImageSrc(sourceImage) || _findFirstImageSrcInTree(nested) || _findFirstImageSrcInTree(ownerIcon);
                            if (ITEM_MIRROR_EXPRESS_DEBUG &&
                                ownerIcon.BHasClass("isWeapon") &&
                                ownerIcon.BHasClass("isPassiveItem") &&
                                _ownerMatchesTier(ownerIcon, 3)) {
                                var rawSrc = (sourceImage && sourceImage.GetAttributeString) ? sourceImage.GetAttributeString("src", "") : "";
                                var rawDefaultSrc = (sourceImage && sourceImage.GetAttributeString) ? sourceImage.GetAttributeString("defaultsrc", "") : "";
                                var exclusionHit = _findFirstExcludedModClassHit(nested, ownerIcon, EXPRESS_SHOT_EXCLUDED_MOD_CLASSES);
                                _expressShotLog(
                                    "candidate ownerId=" + ownerId +
                                    " state=" + cooldownState +
                                    " hasAbility=" + (ownerIcon.BHasClass("hasAbility") ? "1" : "0") +
                                    " src=" + iconSrc +
                                    " rawSrc=" + rawSrc +
                                    " rawDefaultSrc=" + rawDefaultSrc +
                                    " exclusionHit=" + (exclusionHit.length > 0 ? exclusionHit : "none")
                                );
                            }
            
                            entries.push({
                                ownerIcon: ownerIcon,
                                iconContainer: nested,
                                ownerId: ownerId,
                                cooldownState: cooldownState,
                                iconSrc: iconSrc,
                                sourceImage: sourceImage,
                                cooldownMask: cooldownMask
                            });
                        }
                    }
                    return {
                        modsContainersCount: modsContainers.length,
                        scannedCount: scannedCount,
                        entries: entries
                    };
                }
            
            function _sourceEntryMatchesTarget(entry, target, cfg) {
                    if (!entry || !target) return false;
                    var isExpressTarget = (target.className === "expressShot");
                    var itemClassName = target.className || "";
                    var modClassName = target.modClassName || itemClassName;
                    var skipClassMatch = !!target.skipClassMatch;
                    var skipIconMatch = !!target.skipIconMatch;
                    if (!skipClassMatch && (!itemClassName || !modClassName)) return false;
            
                    var ownerIcon = entry.ownerIcon;
                    var iconContainer = entry.iconContainer;
                    var ownerClassName = target.ownerClassName ? target.ownerClassName : ((!skipClassMatch && target.modClassName) ? itemClassName : "");
                    var requireModClass = target.requireModClass ? String(target.requireModClass) : "";
                    var requireCooldownCarrier = !!target.requireCooldownCarrier;
                    var requireCooldownState = !!target.requireCooldownState;
                    var requirePassiveItem = !!target.requirePassiveItem;
                    var requireActiveItem = !!target.requireActiveItem;
                    var excludedModClasses = target.excludedModClasses || null;
                    var itemKind = target.itemKind || "";
                    var itemTier = (target.tier === undefined) ? null : target.tier;
            
                    if (!iconContainer || !iconContainer.BHasClass) {
                        if (isExpressTarget) _expressShotLog("reject ownerId=" + String(entry.ownerId || "") + " reason=no_icon_container");
                        return false;
                    }
                    if (requireModClass.length > 0 && !_entryHasClass(entry, requireModClass)) return false;
                    if (skipClassMatch) {
                        if (!skipIconMatch) {
                            if (!_iconSourceMatchesTarget(entry.iconSrc, target.iconSrc)) {
                                if (isExpressTarget) {
                                    _expressShotLog(
                                        "reject ownerId=" + String(entry.ownerId || "") +
                                        " reason=icon_mismatch expected=" + String(target.iconSrc || "") +
                                        " got=" + String(entry.iconSrc || "")
                                    );
                                }
                                return false;
                            }
                        }
                    } else {
                        if (!_entryHasClass(entry, modClassName)) {
                            if (isExpressTarget) _expressShotLog("reject ownerId=" + String(entry.ownerId || "") + " reason=class_mismatch expectedClass=" + String(modClassName || ""));
                            return false;
                        }
                    }
                    if (!_entryMatchesExcludedModClasses(entry, excludedModClasses)) {
                        if (isExpressTarget) {
                            var excludedHit = _findFirstExcludedModClassHit(iconContainer, ownerIcon, excludedModClasses);
                            _expressShotLog("reject ownerId=" + String(entry.ownerId || "") + " reason=excluded_mod_class class=" + String(excludedHit || ""));
                        }
                        return false;
                    }
                    if (!ownerIcon || !ownerIcon.BHasClass || !ownerIcon.BHasClass("hasAbility")) {
                        if (isExpressTarget) _expressShotLog("reject ownerId=" + String(entry.ownerId || "") + " reason=missing_hasAbility");
                        return false;
                    }
                    if (!_ownerMatchesExtraClass(ownerIcon, ownerClassName)) {
                        if (isExpressTarget) _expressShotLog("reject ownerId=" + String(entry.ownerId || "") + " reason=owner_class_mismatch expectedOwnerClass=" + String(ownerClassName || ""));
                        return false;
                    }
                    if (!_ownerMatchesCooldownCarrier(ownerIcon, requireCooldownCarrier)) {
                        if (isExpressTarget) _expressShotLog("reject ownerId=" + String(entry.ownerId || "") + " reason=cooldown_carrier_missing");
                        return false;
                    }
                    if (!_ownerMatchesCooldownState(ownerIcon, requireCooldownState)) {
                        if (isExpressTarget) _expressShotLog("reject ownerId=" + String(entry.ownerId || "") + " reason=cooldown_state_missing");
                        return false;
                    }
                    if (!_ownerMatchesUseType(ownerIcon, requirePassiveItem, requireActiveItem)) {
                        if (isExpressTarget) _expressShotLog("reject ownerId=" + String(entry.ownerId || "") + " reason=use_type_mismatch needsPassive=" + (requirePassiveItem ? "1" : "0") + " needsActive=" + (requireActiveItem ? "1" : "0"));
                        return false;
                    }
                    if (!_ownerMatchesItemKind(ownerIcon, itemKind)) {
                        if (isExpressTarget) _expressShotLog("reject ownerId=" + String(entry.ownerId || "") + " reason=item_kind_mismatch expected=" + String(itemKind || ""));
                        return false;
                    }
                    if (!_ownerMatchesTier(ownerIcon, itemTier)) {
                        if (isExpressTarget) _expressShotLog("reject ownerId=" + String(entry.ownerId || "") + " reason=tier_mismatch expected=" + String(itemTier));
                        return false;
                    }
                    if (!_ownerMatchesMirrorCategory(ownerIcon, target, cfg)) {
                        if (isExpressTarget) _expressShotLog("reject ownerId=" + String(entry.ownerId || "") + " reason=filter_bucket_disabled style=" + _resolveTargetStyle(target));
                        return false;
                    }
                    if (isExpressTarget) _expressShotLog("match ownerId=" + String(entry.ownerId || "") + " src=" + String(entry.iconSrc || "") + " state=" + String(entry.cooldownState || ""));
                    return true;
                }
            
            function _getStableRuntimePanelId(panel) {
                    if (!panel) return 0;
                    var pool = _mirror.runtimePanelIds || [];
                    // Prune dead panel references on each lookup to prevent unbounded
                    // growth across shop open/close cycles during a long match.
                    var cleaned = [];
                    var found = 0;
                    for (var i = 0; i < pool.length; i++) {
                        var rec = pool[i];
                        if (!rec || !_isAlive(rec.panel)) continue;
                        cleaned.push(rec);
                        if (rec.panel === panel) found = Number(rec.id) || 0;
                    }
                    _mirror.runtimePanelIds = cleaned;
                    if (found) return found;
                    var nextId = Number(_mirror.nextRuntimePanelId) || 1;
                    cleaned.push({ panel: panel, id: nextId });
                    _mirror.runtimePanelIds = cleaned;
                    _mirror.nextRuntimePanelId = nextId + 1;
                    return nextId;
                }
            
            function _getExceptionEntryKey(entry) {
                    if (!entry) return "p0";
                    var pid = _getStableRuntimePanelId(entry.iconContainer || entry.ownerIcon);
                    return "p" + String(pid);
                }
            
            function _buildGroupedExceptionMatches(entries, usedEntryIndices, groupedExceptionTargets, cfg) {
                    var out = [];
                    if (!entries || !entries.length || !groupedExceptionTargets || !groupedExceptionTargets.length) return out;
            
                    var grouped = {};
                    for (var g = 0; g < groupedExceptionTargets.length; g++) {
                        var gm = groupedExceptionTargets[g];
                        if (!gm || !gm.target) continue;
                        var groupName = gm.target.exceptionGroup ? String(gm.target.exceptionGroup) : "__default__";
                        if (!grouped[groupName]) grouped[groupName] = [];
                        grouped[groupName].push(gm);
                    }
            
                    var groupNames = Object.keys(grouped);
                    var assignments = _mirror.exceptionGroupAssignments || {};
            
                    for (var gn = 0; gn < groupNames.length; gn++) {
                        var group = groupNames[gn];
                        var metas = grouped[group];
                        var candidates = [];
                        var targetUsed = {};
                        var candidateAssigned = {};
            
                        for (var ei = 0; ei < entries.length; ei++) {
                            if (usedEntryIndices[ei]) continue;
                            var entry = entries[ei];
                            var matchedTargets = [];
                            for (var mt = 0; mt < metas.length; mt++) {
                                var meta = metas[mt];
                                if (!_sourceEntryMatchesTarget(entry, meta.target, cfg)) continue;
                                matchedTargets.push(meta);
                            }
                            if (matchedTargets.length > 0) {
                                candidates.push({ entryIndex: ei, entry: entry, matchedTargets: matchedTargets });
                            }
                        }
            
                        function assignCandidate(candidateIndex, targetMeta, reason) {
                            if (candidateAssigned[candidateIndex]) return;
                            if (!targetMeta || targetUsed[targetMeta.targetIndex]) return;
                            var c = candidates[candidateIndex];
                            if (!c) return;
                            candidateAssigned[candidateIndex] = true;
                            targetUsed[targetMeta.targetIndex] = true;
                            usedEntryIndices[c.entryIndex] = true;
            
                            var assignKey = group + "|" + _getExceptionEntryKey(c.entry);
                            assignments[assignKey] = targetMeta.targetIndex;
                            _itemMirrorExceptionLog(
                                "group=" + group +
                                " ownerId=" + String(c.entry.ownerId || "") +
                                " -> " + String(targetMeta.target.className || "") +
                                " via=" + String(reason || "unknown")
                            );
            
                            out.push({
                                ownerIcon: c.entry.ownerIcon,
                                iconContainer: c.entry.iconContainer,
                                ownerId: c.entry.ownerId,
                                cooldownState: c.entry.cooldownState,
                                iconSrc: c.entry.iconSrc,
                                sourceImage: c.entry.sourceImage,
                                cooldownMask: c.entry.cooldownMask,
                                itemClassName: targetMeta.target.className,
                                targetIconSrc: targetMeta.target.iconSrc,
                                targetIndex: targetMeta.targetIndex
                            });
                        }
            
                        // Pass A: candidates that map to exactly one target.
                        for (var ca = 0; ca < candidates.length; ca++) {
                            if (candidateAssigned[ca]) continue;
                            var candA = candidates[ca];
                            if (!candA || candA.matchedTargets.length !== 1) continue;
                            assignCandidate(ca, candA.matchedTargets[0], "single_match");
                        }
            
                        // Pass B: icon-src tie-break when available.
                        for (var cb = 0; cb < candidates.length; cb++) {
                            if (candidateAssigned[cb]) continue;
                            var candB = candidates[cb];
                            if (!candB || candB.matchedTargets.length <= 1) continue;
                            var src = String(candB.entry.iconSrc || "");
                            if (!src) continue;
                            var iconHits = [];
                            for (var ih = 0; ih < candB.matchedTargets.length; ih++) {
                                var metaHit = candB.matchedTargets[ih];
                                if (_iconSourceMatchesTarget(src, metaHit.target.iconSrc)) iconHits.push(metaHit);
                            }
                            if (iconHits.length === 1 && !targetUsed[iconHits[0].targetIndex]) {
                                assignCandidate(cb, iconHits[0], "icon_tiebreak");
                            }
                        }
            
                        // Pass C: sticky assignment by panel identity.
                        for (var cc = 0; cc < candidates.length; cc++) {
                            if (candidateAssigned[cc]) continue;
                            var candC = candidates[cc];
                            if (!candC) continue;
                            var stickyKey = group + "|" + _getExceptionEntryKey(candC.entry);
                            var preferredTargetIndex = assignments.hasOwnProperty(stickyKey) ? Number(assignments[stickyKey]) : -1;
                            if (preferredTargetIndex < 0) continue;
                            var stickyMeta = null;
                            for (var sm = 0; sm < candC.matchedTargets.length; sm++) {
                                var metaSticky = candC.matchedTargets[sm];
                                if (metaSticky.targetIndex === preferredTargetIndex) {
                                    stickyMeta = metaSticky;
                                    break;
                                }
                            }
                            if (stickyMeta && !targetUsed[stickyMeta.targetIndex]) {
                                assignCandidate(cc, stickyMeta, "sticky_panel");
                            }
                        }
            
                        // Pass D: deterministic fallback by declaration order.
                        var availableTargets = [];
                        for (var at = 0; at < metas.length; at++) {
                            if (!targetUsed[metas[at].targetIndex]) availableTargets.push(metas[at]);
                        }
                        availableTargets.sort(function(a, b) { return a.targetIndex - b.targetIndex; });
            
                        for (var cd = 0; cd < candidates.length; cd++) {
                            if (candidateAssigned[cd]) continue;
                            var candD = candidates[cd];
                            if (!candD) continue;
                            var chosen = null;
                            for (var ad = 0; ad < availableTargets.length; ad++) {
                                var possible = availableTargets[ad];
                                if (targetUsed[possible.targetIndex]) continue;
                                for (var md = 0; md < candD.matchedTargets.length; md++) {
                                    if (candD.matchedTargets[md].targetIndex === possible.targetIndex) {
                                        chosen = possible;
                                        break;
                                    }
                                }
                                if (chosen) break;
                            }
                            if (chosen) assignCandidate(cd, chosen, "deterministic_fallback");
                        }
                    }
            
                    _mirror.exceptionGroupAssignments = assignments;
                    return out;
                }
            
            function _buildItemMirrorSourcesMulti(root, cfg) {
                    var outMatches = [];
                    var sourceIndex = _buildItemMirrorSourceIndex(root);
                    var entries = sourceIndex.entries || [];
                    var usedEntryIndices = {};
                    var normalTargets = [];
                    var groupedExceptionTargets = [];
                    var exceptionTargets = [];
            
                    for (var tiSplit = 0; tiSplit < ITEM_MIRROR_TARGETS.length; tiSplit++) {
                        var splitTarget = ITEM_MIRROR_TARGETS[tiSplit];
                        if (splitTarget && splitTarget.skipClassMatch && splitTarget.exceptionGroup) {
                            groupedExceptionTargets.push({ target: splitTarget, targetIndex: tiSplit });
                        } else if (splitTarget && splitTarget.skipClassMatch) {
                            exceptionTargets.push({ target: splitTarget, targetIndex: tiSplit });
                        } else {
                            normalTargets.push({ target: splitTarget, targetIndex: tiSplit });
                        }
                    }
            
                    // Pass 1: strict class-based targets take priority.
                    for (var mi = 0; mi < entries.length; mi++) {
                        var entry = entries[mi];
                        for (var nt = 0; nt < normalTargets.length; nt++) {
                            var normal = normalTargets[nt];
                            var normalTarget = normal.target;
                            if (!_sourceEntryMatchesTarget(entry, normalTarget, cfg)) continue;
                            outMatches.push({
                                ownerIcon: entry.ownerIcon,
                                iconContainer: entry.iconContainer,
                                ownerId: entry.ownerId,
                                cooldownState: entry.cooldownState,
                                iconSrc: entry.iconSrc,
                                sourceImage: entry.sourceImage,
                                cooldownMask: entry.cooldownMask,
                                itemClassName: normalTarget.className,
                                targetIconSrc: normalTarget.iconSrc,
                                targetIndex: normal.targetIndex
                            });
                            usedEntryIndices[mi] = true;
                            break;
                        }
                    }
            
                    // Pass 2: grouped classless exceptions (structural twins).
                    var groupedMatches = _buildGroupedExceptionMatches(entries, usedEntryIndices, groupedExceptionTargets, cfg);
                    for (var gmIdx = 0; gmIdx < groupedMatches.length; gmIdx++) {
                        outMatches.push(groupedMatches[gmIdx]);
                    }
            
                    // Pass 3: remaining classless exceptions.
                    for (var miEx = 0; miEx < entries.length; miEx++) {
                        if (usedEntryIndices[miEx]) continue;
                        var exceptionEntry = entries[miEx];
                        var exceptionMatchCount = 0;
                        var exceptionChosen = null;
                        for (var et = 0; et < exceptionTargets.length; et++) {
                            var exceptionMeta = exceptionTargets[et];
                            if (!_sourceEntryMatchesTarget(exceptionEntry, exceptionMeta.target, cfg)) continue;
                            exceptionMatchCount++;
                            exceptionChosen = exceptionMeta;
                        }
                        if (exceptionMatchCount === 1 && exceptionChosen) {
                            outMatches.push({
                                ownerIcon: exceptionEntry.ownerIcon,
                                iconContainer: exceptionEntry.iconContainer,
                                ownerId: exceptionEntry.ownerId,
                                cooldownState: exceptionEntry.cooldownState,
                                iconSrc: exceptionEntry.iconSrc,
                                sourceImage: exceptionEntry.sourceImage,
                                cooldownMask: exceptionEntry.cooldownMask,
                                itemClassName: exceptionChosen.target.className,
                                targetIconSrc: exceptionChosen.target.iconSrc,
                                targetIndex: exceptionChosen.targetIndex
                            });
                            usedEntryIndices[miEx] = true;
                        } else if (exceptionMatchCount > 1) {
                            _itemMirrorExceptionLog(
                                "reject ownerId=" + String(exceptionEntry.ownerId || "") +
                                " reason=exception_ambiguous count=" + String(exceptionMatchCount)
                            );
                        }
                    }
            
                    var summary = [];
                    var structureSummary = [];
                    for (var si = 0; si < outMatches.length; si++) {
                        var match = outMatches[si];
                        summary.push(match.itemClassName + "::" + match.ownerId + "|" + match.cooldownState + "|" + match.iconSrc);
                        // Cooldown state changes are read from the live panel during render.
                        // They should not force a structural rescan of every owned item.
                        structureSummary.push(match.itemClassName + "::" + match.ownerId + "|" + match.iconSrc);
                    }
            
                    return {
                        modsContainersCount: sourceIndex.modsContainersCount,
                        scannedCount: sourceIndex.scannedCount,
                        matches: outMatches,
                        summary: summary,
                        structureSummary: structureSummary
                    };
                }
            
            function _getItemMirrorSemanticKey(sourceLike) {
                    if (!sourceLike) return "||";
                    var cls = sourceLike.itemClassName ? String(sourceLike.itemClassName) : "";
                    var icon = sourceLike.iconSrc ? String(sourceLike.iconSrc) : "";
                    var targetIcon = sourceLike.targetIconSrc ? String(sourceLike.targetIconSrc) : "";
                    return cls + "|" + icon + "|" + targetIcon;
                }
            
            function _getItemMirrorClassKey(sourceLike) {
                    if (!sourceLike) return "";
                    return sourceLike.itemClassName ? String(sourceLike.itemClassName) : "";
                }
            
            function _reconcileItemMirrorSourcesMulti(scannedMatches) {
                    var previous = _mirror.sources || [];
                    var usedPrev = {};
                    var next = [];
                    var semanticBuckets = {};
                    var classBuckets = {};
            
                    for (var pb = 0; pb < previous.length; pb++) {
                        var prevSource = previous[pb];
                        if (!prevSource) continue;
                        var semanticKey = _getItemMirrorSemanticKey(prevSource);
                        if (!semanticBuckets[semanticKey]) semanticBuckets[semanticKey] = [];
                        semanticBuckets[semanticKey].push({ idx: pb, src: prevSource });
            
                        var classKey = _getItemMirrorClassKey(prevSource);
                        if (classKey.length > 0) {
                            if (!classBuckets[classKey]) classBuckets[classKey] = [];
                            classBuckets[classKey].push({ idx: pb, src: prevSource });
                        }
                    }
            
                    var semanticKeys = Object.keys(semanticBuckets);
                    for (var sk = 0; sk < semanticKeys.length; sk++) {
                        var semanticBucket = semanticBuckets[semanticKeys[sk]];
                        semanticBucket.sort(function(a, b) {
                            var ao = (a && a.src && a.src.acquisitionOrder !== undefined && a.src.acquisitionOrder !== null) ? Number(a.src.acquisitionOrder) : 999999;
                            var bo = (b && b.src && b.src.acquisitionOrder !== undefined && b.src.acquisitionOrder !== null) ? Number(b.src.acquisitionOrder) : 999999;
                            return ao - bo;
                        });
                    }
                    var classKeys = Object.keys(classBuckets);
                    for (var ck = 0; ck < classKeys.length; ck++) {
                        var classBucket = classBuckets[classKeys[ck]];
                        classBucket.sort(function(a, b) {
                            var ao = (a && a.src && a.src.acquisitionOrder !== undefined && a.src.acquisitionOrder !== null) ? Number(a.src.acquisitionOrder) : 999999;
                            var bo = (b && b.src && b.src.acquisitionOrder !== undefined && b.src.acquisitionOrder !== null) ? Number(b.src.acquisitionOrder) : 999999;
                            return ao - bo;
                        });
                    }
            
                    for (var i = 0; i < scannedMatches.length; i++) {
                        var match = scannedMatches[i];
                        var existing = null;
            
                        // 1) Strongest match: same panel objects.
                        for (var p = 0; p < previous.length; p++) {
                            if (usedPrev[p]) continue;
                            var prev = previous[p];
                            if (!prev) continue;
                            if (prev.ownerIcon === match.ownerIcon &&
                                prev.iconContainer === match.iconContainer &&
                                prev.itemClassName === match.itemClassName) {
                                existing = prev;
                                usedPrev[p] = true;
                                break;
                            }
                        }
            
                        // 2) Fallback: same semantic identity (class + icon srcs), for rebuilt/reordered trees.
                        if (!existing) {
                            var semKey = _getItemMirrorSemanticKey(match);
                            var semBucket = semanticBuckets[semKey] || null;
                            if (semBucket) {
                                while (semBucket.length > 0) {
                                    var semCandidate = semBucket.shift();
                                    if (!semCandidate) continue;
                                    if (usedPrev[semCandidate.idx]) continue;
                                    existing = semCandidate.src;
                                    usedPrev[semCandidate.idx] = true;
                                    break;
                                }
                            }
                        }
            
                        // 3) Last fallback: same class when icon src is unstable/late-loaded.
                        if (!existing) {
                            var clsKey = _getItemMirrorClassKey(match);
                            var clsBucket = clsKey.length > 0 ? (classBuckets[clsKey] || null) : null;
                            if (clsBucket) {
                                while (clsBucket.length > 0) {
                                    var clsCandidate = clsBucket.shift();
                                    if (!clsCandidate) continue;
                                    if (usedPrev[clsCandidate.idx]) continue;
                                    existing = clsCandidate.src;
                                    usedPrev[clsCandidate.idx] = true;
                                    break;
                                }
                            }
                        }
            
                        var key = existing && existing.key ? existing.key : ("item_src_" + String(_mirror.nextSourceId++));
                        var acquisitionOrder = (existing && isFinite(Number(existing.acquisitionOrder)))
                            ? Number(existing.acquisitionOrder)
                            : Number(_mirror.nextAcquireOrder++);
                        next.push({
                            key: key,
                            acquisitionOrder: acquisitionOrder,
                            ownerIcon: match.ownerIcon,
                            iconContainer: match.iconContainer,
                            itemClassName: match.itemClassName,
                            targetIconSrc: match.targetIconSrc,
                            targetIndex: match.targetIndex,
                            ownerId: match.ownerId,
                            cooldownState: match.cooldownState,
                            iconSrc: match.iconSrc,
                            sourceImage: match.sourceImage,
                            cooldownMask: match.cooldownMask
                        });
                    }
            
                    next.sort(function(a, b) {
                        var ao = (a.acquisitionOrder === undefined || a.acquisitionOrder === null) ? 999999 : Number(a.acquisitionOrder);
                        var bo = (b.acquisitionOrder === undefined || b.acquisitionOrder === null) ? 999999 : Number(b.acquisitionOrder);
                        if (ao !== bo) return ao - bo;
                        var ai = (a.targetIndex === undefined || a.targetIndex === null) ? 9999 : Number(a.targetIndex);
                        var bi = (b.targetIndex === undefined || b.targetIndex === null) ? 9999 : Number(b.targetIndex);
                        if (ai !== bi) return ai - bi;
                        var av = String(a.ownerId || "") + "|" + String(a.iconSrc || "");
                        var bv = String(b.ownerId || "") + "|" + String(b.iconSrc || "");
                        if (av < bv) return -1;
                        if (av > bv) return 1;
                        return 0;
                    });
            
                    _mirror.sources = next;
                    return next;
                }
            
            function _syncItemMirrorStaticSlotState(slotObj, source, sourceIcon, sourceMod, slotState) {
                    if (!slotObj || !source || !sourceIcon || !slotState) return;
                    var mirrorIcon = slotObj.icon;
                    var mirrorSlot = slotObj.modContainer;
                    if (!mirrorIcon || !mirrorSlot) return;
            
                    var sourceItemClassName = source.itemClassName || "";
                    var sourceSig = [
                        source.key || "",
                        String(_getStableRuntimePanelId(sourceIcon)),
                        String(_getStableRuntimePanelId(sourceMod)),
                        String(sourceItemClassName),
                        String(source.iconSrc || ""),
                        String(source.targetIconSrc || "")
                    ].join("|");
                    if (slotState.staticSyncSig === sourceSig) return;
            
                    if (sourceMod) {
                        _syncPanelClasses(sourceMod, mirrorSlot, _mirror.classCache, "itemMirrorSlotFromContainer:" + source.key, ["mod_icon_single_container"]);
                    }
                    if (sourceItemClassName && sourceItemClassName.length > 0 && sourceMod && sourceMod.BHasClass) {
                        var hasItemClass = sourceMod.BHasClass(sourceItemClassName);
                        mirrorSlot.SetHasClass(sourceItemClassName, hasItemClass);
                        if (slotObj.background) slotObj.background.SetHasClass(sourceItemClassName, hasItemClass);
                        if (slotObj.iconInner) slotObj.iconInner.SetHasClass(sourceItemClassName, hasItemClass);
                        if (slotObj.image) slotObj.image.SetHasClass(sourceItemClassName, hasItemClass);
                    }
            
                    _syncPanelClasses(sourceIcon, mirrorIcon, _mirror.classCache, "itemMirrorIconOwner:" + source.key, ["OnCooldown", "OffCooldown", "VerticalCooldown", "isWeapon", "isArmor", "isTech"]);
                    _syncPanelClasses(sourceIcon, mirrorSlot, _mirror.classCache, "itemMirrorSlotFromOwner:" + source.key, ["OnCooldown", "OffCooldown", "VerticalCooldown", "isWeapon", "isArmor", "isTech"]);
                    slotState.staticSyncSig = sourceSig;
                }
            
            function _syncMirrorItemFromSourceMulti(slotObj, source) {
                    if (!slotObj || !source || !source.ownerIcon) return;
                    var sourceIcon = source.ownerIcon;
                    var sourceModContainer = source.iconContainer;
                    var sourceItemClassName = source.itemClassName;
                    var sourceTargetIconSrc = source.targetIconSrc;
            
                    var mirrorIcon = slotObj.icon;
                    var mirrorSlot = slotObj.modContainer;
                    var mirrorMask = slotObj.cooldownMask;
                    var mirrorCooldownText = slotObj.cooldownText;
                    var mirrorReadyOverlay = slotObj.readyOverlay;
                    var mirrorIconInner = slotObj.iconInner;
                    var mirrorImage = slotObj.image;
                    if (!mirrorSlot || !sourceIcon || !mirrorIcon) return;
            
                    var slotState = _mirror.slotStates[source.key];
                    if (!slotState) {
                        slotState = {
                            lastSrc: "",
                            lastClip: "",
                            lastMaskScaleSig: "",
                            wasOnCooldown: false,
                            cdLastDeg: null,
                            cdLastMs: 0,
                            cdSlopeEma: null,
                            cdDirection: 0,
                            cdDisplayLock: null,
                            lastSizeSig: "",
                            staticSyncSig: "",
                            lastCooldownClassSig: "",
                            lastMirrorImagePanel: null,
                            cooldownTextStyled: false,
                            nextCooldownTextProbeMs: 0,
                            lastProbeCooldownText: "",
                            wasCooldownTextVisible: false,
                            lastCooldownEndMs: 0,
                            rapidRetriggerSuppressUntilMs: 0
                        };
                        _mirror.slotStates[source.key] = slotState;
                    }
                    // A semantic source key can survive replacement of the native panel.
                    if (slotState.probeSourceIcon !== sourceIcon) {
                        slotState.probeSourceIcon = sourceIcon;
                        slotState.nextCooldownTextProbeMs = 0;
                        slotState.lastProbeCooldownText = "";
                    }
                    var wasOnCooldownBefore = !!slotState.wasOnCooldown;
            
                    var sourceMod = _isAlive(sourceModContainer) ? sourceModContainer : (sourceIcon.FindChildTraverse ? sourceIcon.FindChildTraverse("modIconContainer") : null);
                    if (sourceMod && sourceMod !== source.iconContainer) source.iconContainer = sourceMod;
                    var sourceImage = _isAlive(source.sourceImage) ? source.sourceImage : null;
                    if (!sourceImage && sourceMod && sourceMod.FindChildTraverse) sourceImage = sourceMod.FindChildTraverse("ModIconImage");
                    if (!sourceImage && sourceIcon.FindChildTraverse) sourceImage = sourceIcon.FindChildTraverse("ModIconImage");
                    source.sourceImage = sourceImage || null;
                    var size = _resolveMirrorItemSize(sourceIcon, sourceMod);
                    var sizeSig = size.width + "|" + size.height;
                    if (mirrorIcon.style.margin !== "2px 6px 2px 6px") {
                        mirrorIcon.style.margin = "2px 6px 2px 6px";
                    }
                    if (mirrorCooldownText) {
                        if (!slotState.cooldownTextStyled) {
                            mirrorCooldownText.style.width = "fit-children";
                            mirrorCooldownText.style.height = "fit-children";
                            mirrorCooldownText.style.fontSize = "20px";
                            mirrorCooldownText.style.fontWeight = "bold";
                            mirrorCooldownText.style.margin = "0px";
                            mirrorCooldownText.style.padding = "0px";
                            mirrorCooldownText.style.horizontalAlign = "center";
                            mirrorCooldownText.style.verticalAlign = "center";
                            mirrorCooldownText.style.textAlign = "center";
                            mirrorCooldownText.style.textOverflow = "clip";
                            mirrorCooldownText.style.y = "0px";
                            slotState.cooldownTextStyled = true;
                        }
                    }
            
                    _syncItemMirrorStaticSlotState(slotObj, source, sourceIcon, sourceMod, slotState);
            
                    // Keep mirror icon sizing deterministic regardless of source panel classes/style.
                    if (slotState.lastSizeSig !== sizeSig ||
                        mirrorIcon.style.width !== size.width ||
                        mirrorIcon.style.height !== size.height ||
                        mirrorSlot.style.width !== size.width ||
                        mirrorSlot.style.height !== size.height) {
                        mirrorIcon.style.width = size.width;
                        mirrorIcon.style.height = size.height;
                        mirrorSlot.style.width = size.width;
                        mirrorSlot.style.height = size.height;
                        slotState.lastSizeSig = sizeSig;
                    }
            
                    if (mirrorSlot.style.visibility !== "visible") mirrorSlot.style.visibility = "visible";
                    if (mirrorSlot.style.backgroundColor !== "none") mirrorSlot.style.backgroundColor = "none";
            
                    var hasImageSrc = false;
                    if (mirrorImage && sourceImage) {
                        if (slotState.lastMirrorImagePanel !== mirrorImage) {
                            slotState.lastMirrorImagePanel = mirrorImage;
                            slotState.lastSrc = "";
                        }
                        var forcedSrc = "";
                        if (sourceTargetIconSrc && sourceTargetIconSrc.length > 0) {
                            forcedSrc = sourceTargetIconSrc;
                        } else if (sourceItemClassName && ITEM_MIRROR_FORCED_IMAGE_BY_CLASS.hasOwnProperty(sourceItemClassName)) {
                            forcedSrc = ITEM_MIRROR_FORCED_IMAGE_BY_CLASS[sourceItemClassName];
                        }
            
                        var srcVal = forcedSrc;
                        if (!srcVal || srcVal.length === 0) {
                            srcVal = sourceImage.GetAttributeString ? sourceImage.GetAttributeString("src", "") : "";
                            if ((!srcVal || srcVal === "none") && sourceImage.GetAttributeString) {
                                srcVal = sourceImage.GetAttributeString("defaultsrc", "");
                            }
                        }
                        if (srcVal && srcVal !== "none") {
                            try {
                                if (slotState.lastSrc !== srcVal) {
                                    if (mirrorImage.SetImage) {
                                        mirrorImage.SetImage(srcVal);
                                    } else {
                                        mirrorImage.style.backgroundImage = 'url("' + srcVal + '")';
                                    }
                                    slotState.lastSrc = srcVal;
                                }
                                hasImageSrc = true;
                            } catch(e) { QOL.core.Logger.logWarn("core", "op failed: " + (e && e.message ? e.message : String(e || ""))); }
                        }
                    }
            
                    if (mirrorImage) {
                        var imageVisibility = hasImageSrc ? "visible" : "collapse";
                        if (mirrorImage.style.visibility !== imageVisibility) mirrorImage.style.visibility = imageVisibility;
                        if (mirrorImage.style.zIndex !== "5") mirrorImage.style.zIndex = "5";
                    }
                    if (mirrorIconInner) {
                        var iconInnerVisibility = hasImageSrc ? "collapse" : "visible";
                        if (mirrorIconInner.style.visibility !== iconInnerVisibility) mirrorIconInner.style.visibility = iconInnerVisibility;
                        if (mirrorIconInner.style.zIndex !== "4") mirrorIconInner.style.zIndex = "4";
                    }
            
                    if (!mirrorMask) return;
                    var sourceMask = _isAlive(source.cooldownMask) ? source.cooldownMask : null;
                    if (!sourceMask && sourceIcon.FindChildTraverse) sourceMask = sourceIcon.FindChildTraverse("CooldownMask");
                    source.cooldownMask = sourceMask || null;
                    var isOnCooldown = sourceIcon.BHasClass && sourceIcon.BHasClass("OnCooldown");
                    var isVerticalCooldown = sourceIcon.BHasClass && sourceIcon.BHasClass("VerticalCooldown");
                    var nowMs = Date.now ? Date.now() : (new Date()).getTime();
            
                    var startedCooldownCycle = (!wasOnCooldownBefore && !!isOnCooldown);
                    if (startedCooldownCycle) {
                        slotState.nextCooldownTextProbeMs = 0;
                        slotState.lastProbeCooldownText = "";
                        var sinceEndMs = (slotState.lastCooldownEndMs > 0) ? (nowMs - slotState.lastCooldownEndMs) : 999999;
                        if (sinceEndMs <= ITEM_MIRROR_RAPID_RETRIGGER_WINDOW_MS) {
                            slotState.rapidRetriggerSuppressUntilMs = nowMs + ITEM_MIRROR_RAPID_RETRIGGER_SUPPRESS_MS;
                            _itemMirrorFlashLog(source.key + " rapid suppress ON (" + String(ITEM_MIRROR_RAPID_RETRIGGER_SUPPRESS_MS) + "ms)");
                        } else {
                            slotState.rapidRetriggerSuppressUntilMs = 0;
                        }
                        slotState.cdLastDeg = null;
                        slotState.cdLastMs = 0;
                        slotState.cdSlopeEma = null;
                        slotState.cdDirection = 0;
                        slotState.cdDisplayLock = null;
                    }
            
                    var cooldownClassSig = (isOnCooldown ? "1" : "0") + "|" + (isVerticalCooldown ? "1" : "0");
                    if (slotState.lastCooldownClassSig !== cooldownClassSig) {
                        mirrorIcon.SetHasClass("just_ready", false);
                        mirrorSlot.SetHasClass("just_ready", false);
                        mirrorIcon.SetHasClass("OnCooldown", !!isOnCooldown);
                        mirrorIcon.SetHasClass("OffCooldown", !isOnCooldown);
                        mirrorIcon.SetHasClass("VerticalCooldown", !!isVerticalCooldown);
                        mirrorSlot.SetHasClass("OnCooldown", !!isOnCooldown);
                        mirrorSlot.SetHasClass("OffCooldown", !isOnCooldown);
                        mirrorSlot.SetHasClass("VerticalCooldown", !!isVerticalCooldown);
                        slotState.lastCooldownClassSig = cooldownClassSig;
                    }
            
                    var maskClip = "";
                    var maskOpacity = "";
                    var maskVisibility = "";
                    if (sourceMask && sourceMask.style) {
                        var clipVal = sourceMask.style.clip;
                        var opacityVal = sourceMask.style.opacity;
                        var visibilityVal = sourceMask.style.visibility;
            
                        if (clipVal !== undefined && clipVal !== null && clipVal !== "") maskClip = clipVal;
                        if (opacityVal !== undefined && opacityVal !== null && opacityVal !== "") maskOpacity = opacityVal;
                        if (visibilityVal !== undefined && visibilityVal !== null && visibilityVal !== "") maskVisibility = visibilityVal;
                    }
            
                    if (!maskClip && sourceMask) maskClip = _getInlineStyleProperty(sourceMask, "clip");
                    if (!maskOpacity && sourceMask) maskOpacity = _getInlineStyleProperty(sourceMask, "opacity");
                    if (!maskVisibility && sourceMask) maskVisibility = _getInlineStyleProperty(sourceMask, "visibility");
            
                    if (maskClip && maskClip.length > 0) {
                        if (slotState.lastClip !== maskClip) {
                            try {
                                mirrorMask.style.clip = maskClip;
                                slotState.lastClip = maskClip;
                            } catch(e1) { QOL.core.Logger.logWarn("core", "op failed: " + (e1 && e1.message ? e1.message : String(e1 || ""))); }
                        }
                    } else if (slotState.lastClip && slotState.lastClip.length > 0) {
                        try {
                            if (mirrorMask.style.clip !== slotState.lastClip) {
                                mirrorMask.style.clip = slotState.lastClip;
                            }
                        } catch(e2) { QOL.core.Logger.logWarn("core", "op failed: " + (e2 && e2.message ? e2.message : String(e2 || ""))); }
                    }
                    if (maskOpacity && maskOpacity.length > 0) {
                        QOL_UTILS.SetPanelOpacitySafe(mirrorMask, maskOpacity, 1.0);
                    }
            
                    var maskScaleSig = isVerticalCooldown ? "1.00, 1.00" : "-1.00, 1.00";
                    if (slotState.lastMaskScaleSig !== maskScaleSig) {
                        try {
                            mirrorMask.style.preTransformScale2d = maskScaleSig;
                            slotState.lastMaskScaleSig = maskScaleSig;
                        } catch(e4) { QOL.core.Logger.logWarn("core", "op failed: " + (e4 && e4.message ? e4.message : String(e4 || ""))); }
                    }
                    var showMask = !!isOnCooldown;
                    if (!showMask && maskVisibility) showMask = (maskVisibility === "visible");
                    try { mirrorMask.style.visibility = showMask ? "visible" : "collapse"; } catch(e5) { QOL.core.Logger.logWarn("core", "op failed: " + (e5 && e5.message ? e5.message : String(e5 || ""))); }
            
                    var isCooldownTextVisible = false;
                    if (mirrorCooldownText) {
                        var cooldownText = "";
                        var cooldownTextFromDerived = false;
                        var cooldownTextDerivedNum = null;
                        if (isOnCooldown) {
                            if (nowMs >= slotState.nextCooldownTextProbeMs) {
                                var cooldownProbe = _probeCooldownTextFromSourceIcon(sourceIcon);
                                slotState.lastProbeCooldownText = cooldownProbe.chosen || "";
                                // Retry missing text: C++ may add a label after the initial scan.
                                slotState.nextCooldownTextProbeMs = nowMs + (cooldownProbe.chosen
                                    ? ITEM_MIRROR_TEXT_PROBE_INTERVAL_MS : ITEM_MIRROR_EMPTY_TEXT_PROBE_INTERVAL_MS);
                            }
                            cooldownText = slotState.lastProbeCooldownText || "";
                            if (cooldownText && cooldownText.length > 0) {
                                slotState.rapidRetriggerSuppressUntilMs = 0;
                            }
                        }
                        if ((!cooldownText || cooldownText.length === 0) && isOnCooldown) {
                            var calcClip = maskClip && maskClip.length > 0 ? maskClip : slotState.lastClip;
                            var currentDeg = _resolveRadialProgressDeg(calcClip, slotState.cdLastDeg);
                            if (isFinite(currentDeg)) {
                                if (currentDeg < 0) currentDeg = 0;
                                if (currentDeg > 360 && currentDeg <= 720) currentDeg = currentDeg % 360;
                                if (currentDeg > 360) currentDeg = 360;
                            } else {
                                currentDeg = null;
                            }
                            if (currentDeg !== null) {
                                if (slotState.cdLastDeg !== null && slotState.cdLastMs > 0) {
                                    var dtSec = (nowMs - slotState.cdLastMs) / 1000.0;
                                    var dDeg = slotState.cdLastDeg - currentDeg;
                                    if (dDeg < -180 || dDeg > 360) {
                                        slotState.cdSlopeEma = null;
                                        slotState.cdDisplayLock = null;
                                        slotState.cdDirection = 0;
                                    } else if (dtSec > 0.01 && dtSec < 1.0 && Math.abs(dDeg) > 0.01) {
                                        if (slotState.cdDirection === 0 && Math.abs(dDeg) >= 0.05) {
                                            slotState.cdDirection = (dDeg > 0) ? 1 : -1;
                                        }
                                        var signedDelta = 0;
                                        if (slotState.cdDirection >= 0 && dDeg > 0) {
                                            signedDelta = dDeg;
                                        } else if (slotState.cdDirection <= 0 && dDeg < 0) {
                                            signedDelta = -dDeg;
                                        }
                                        if (signedDelta > 0) {
                                            var slope = signedDelta / dtSec;
                                            if (isFinite(slope) && slope > 0.001 && slope < 5000) {
                                                slotState.cdSlopeEma = (slotState.cdSlopeEma === null) ? slope : ((slotState.cdSlopeEma * 0.75) + (slope * 0.25));
                                            }
                                        }
                                    }
                                }
                                slotState.cdLastDeg = currentDeg;
                                slotState.cdLastMs = nowMs;
                                if (slotState.cdSlopeEma !== null && slotState.cdSlopeEma > 0.001) {
                                    var remainingDeg = currentDeg;
                                    if (slotState.cdDirection < 0) {
                                        remainingDeg = 360 - currentDeg;
                                    }
                                    if (!isFinite(remainingDeg) || remainingDeg < 0) remainingDeg = 0;
                                    var remainingSec = remainingDeg / slotState.cdSlopeEma;
                                    var displayRaw = _formatDerivedCooldownSeconds(remainingSec);
                                    var n = parseFloat(displayRaw);
                                    if (isFinite(n)) {
                                        if (n >= 1) {
                                            var intVal = Math.ceil(n);
                                            if (slotState.cdDisplayLock !== null && isFinite(slotState.cdDisplayLock)) {
                                                intVal = Math.min(intVal, slotState.cdDisplayLock);
                                            }
                                            slotState.cdDisplayLock = intVal;
                                            cooldownText = String(intVal);
                                            cooldownTextFromDerived = true;
                                            cooldownTextDerivedNum = intVal;
                                        } else {
                                            if (slotState.cdDisplayLock !== null && isFinite(slotState.cdDisplayLock)) {
                                                n = Math.min(n, slotState.cdDisplayLock);
                                            }
                                            slotState.cdDisplayLock = n;
                                            cooldownText = (Math.round(n * 10) / 10).toFixed(1);
                                            cooldownTextFromDerived = true;
                                            cooldownTextDerivedNum = n;
                                        }
                                    } else {
                                        cooldownText = displayRaw;
                                        cooldownTextFromDerived = true;
                                        cooldownTextDerivedNum = parseFloat(displayRaw);
                                    }
                                }
                            }
                        }
            
                        if (cooldownTextFromDerived && isFinite(cooldownTextDerivedNum) && cooldownTextDerivedNum > 0 && cooldownTextDerivedNum < 1) {
                            if (slotState.rapidRetriggerSuppressUntilMs > nowMs) {
                                cooldownText = "";
                            }
                        }
            
                        if (cooldownText && cooldownText.length > 0) {
                            if (mirrorCooldownText.text !== cooldownText) mirrorCooldownText.text = cooldownText;
                            if (mirrorCooldownText.style.visibility !== "visible") mirrorCooldownText.style.visibility = "visible";
                            isCooldownTextVisible = true;
                        } else {
                            if (mirrorCooldownText.style.visibility !== "collapse") mirrorCooldownText.style.visibility = "collapse";
                            if (!isOnCooldown) slotState.lastProbeCooldownText = "";
                        }
                    } else {
                        isCooldownTextVisible = false;
                    }
            
                    if (ITEM_MIRROR_COOLDOWN_DEBUG && isOnCooldown) {
                        var probeShort = slotState.lastProbeCooldownText || "-";
                        var clipShort = maskClip || slotState.lastClip || "";
                        var currentDegText = (currentDeg === null || currentDeg === undefined || !isFinite(currentDeg)) ? "-" : currentDeg.toFixed(2);
                        var slopeText = (slotState.cdSlopeEma === null || slotState.cdSlopeEma === undefined || !isFinite(slotState.cdSlopeEma)) ? "-" : slotState.cdSlopeEma.toFixed(3);
                        if (clipShort.length > 96) clipShort = clipShort.slice(0, 96) + "...";
                        var cooldownDebugSig =
                            String(source.key) + "|" +
                            String(isVerticalCooldown ? 1 : 0) + "|" +
                            currentDegText + "|" +
                            String(slotState.cdDirection || 0) + "|" +
                            slopeText + "|" +
                            String(slotState.cdDisplayLock === null ? "-" : slotState.cdDisplayLock) + "|" +
                            String(cooldownText || "-") + "|" +
                            probeShort + "|" +
                            clipShort;
                        _itemMirrorCooldownDebugLogThrottled(
                            cooldownDebugSig,
                            "src=" + String(source.key) +
                            " item=" + String(sourceItemClassName || "-") +
                            " on=1 vertical=" + (isVerticalCooldown ? "1" : "0") +
                            " deg=" + currentDegText +
                            " dir=" + String(slotState.cdDirection || 0) +
                            " slope=" + slopeText +
                            " lock=" + (slotState.cdDisplayLock === null ? "-" : String(slotState.cdDisplayLock)) +
                            " probe=" + probeShort +
                            " text=" + (cooldownText || "-") +
                            " clip=" + clipShort,
                            nowMs
                        );
                    }
            
                    // Trigger ready flash on true cooldown end, with cooldown-text fallback.
                    var becameReadyFromState = wasOnCooldownBefore && !isOnCooldown;
                    var becameReadyFromText = slotState.wasCooldownTextVisible && !isCooldownTextVisible && !isOnCooldown;
                    if (becameReadyFromState || becameReadyFromText) {
                        if (mirrorReadyOverlay) _triggerReadyFlash(mirrorReadyOverlay, source.key);
                        slotState.lastCooldownEndMs = nowMs;
                        slotState.rapidRetriggerSuppressUntilMs = 0;
                    }
                    slotState.wasCooldownTextVisible = isCooldownTextVisible;
                    slotState.wasOnCooldown = !!isOnCooldown;
            
                    if (!isOnCooldown) {
                        slotState.cdLastDeg = null;
                        slotState.cdLastMs = 0;
                        slotState.cdSlopeEma = null;
                        slotState.cdDirection = 0;
                        slotState.cdDisplayLock = null;
                        slotState.nextCooldownTextProbeMs = 0;
                        slotState.lastProbeCooldownText = "";
                    } else {
                        _mirror.fastModeUntilMs = nowMs + 500;
                    }
                }
            
            function _itemMirrorFlashLog(msg) {
                if (!ITEM_MIRROR_FLASH_DEBUG) return;
                $.Msg("[QOLLock][ItemMirrorFlash] " + msg);
            }
            
            function _itemMirrorCooldownDebugLog(msg) {
                if (!ITEM_MIRROR_COOLDOWN_DEBUG) return;
                $.Msg("[QOLLock][ItemMirrorCooldown] " + msg);
            }
            
            function _itemMirrorCooldownDebugLogThrottled(sig, msg, nowMs) {
                if (!ITEM_MIRROR_COOLDOWN_DEBUG) return;
                var now = Number(nowMs) || (Date.now ? Date.now() : (new Date()).getTime());
                var sameSig = sig && sig === _mirror.debugLastSig;
                if (sameSig && now < (_mirror.debugLastMs || 0)) return;
                _mirror.debugLastSig = sig || "";
                _mirror.debugLastMs = now + ITEM_MIRROR_COOLDOWN_DEBUG_THROTTLE_MS;
                _itemMirrorCooldownDebugLog(msg);
            }
            
            function _expressShotLog(msg) {
                if (!ITEM_MIRROR_EXPRESS_DEBUG) return;
                $.Msg("[QOLLock][ItemExpressShot] " + msg);
                }
            
            function _itemMirrorExceptionLog(msg) {
                    if (!ITEM_MIRROR_EXCEPTION_DEBUG) return;
                    $.Msg("[QOLLock][ItemMirrorException] " + msg);
                }
            
            function _resolveMirrorItemSize(sourceIcon, sourceMod) {
                    var sizePx = Math.round(Number(ITEM_MIRROR_ICON_BASE_SIZE_PX));
                    if (!isFinite(sizePx) || sizePx <= 0) sizePx = 45;
                    var sizeText = String(sizePx) + "px";
                    return { width: sizeText, height: sizeText };
                }
            
            function _getHud() {
                return QOL.core?.panel?.findHud ? QOL.core.panel.findHud() : (QOL.core?.hud?.findHud ? QOL.core.hud.findHud() : null);
            }
            
            function _ensureOverlay(hud) {
                            if (!_isAlive(_overlay)) {
                                var parent = hud.FindChildTraverse ? (hud.FindChildTraverse("gameplay_hud") || hud) : hud;
                                if (!parent) return null;
                                _overlay = parent.FindChildTraverse("QOLItemMirrorRoot");
                                if (!_overlay) {
                                    _overlay = $.CreatePanel("Panel", parent, "QOLItemMirrorRoot", {
                                        hittest: "false",
                                        hittestchildren: "false"
                                    });
                                }
                            }
                            if (!_overlay) return null;
            
                            _overlay.style.horizontalAlign = "center";
                            _overlay.style.verticalAlign = "center";
                            _overlay.style.flowChildren = "down";
                            _overlay.style.overflow = "noclip";
                            _overlay.style.x = "0px";
                            _overlay.style.y = "150px";
            
                            _overlay.style.visibility = "collapse";
            
                            if (!_isAlive(_row)) {
                                _row = _overlay.FindChildTraverse("QOLItemMirrorRow");
                                if (!_row) {
                                    _row = $.CreatePanel("Panel", _overlay, "QOLItemMirrorRow", {
                                        hittest: "false",
                                        hittestchildren: "false"
                                    });
                                }
                            }
                            if (_row) {
                                _row.style.flowChildren = "right";
                                _row.style.horizontalAlign = "center";
                                _row.style.verticalAlign = "center";
                                _row.style.width = "fit-children";
                                _row.style.height = "fit-children";
                                _row.style.overflow = "noclip";
                            }
                            return _overlay;
                        }
            
            function _ensureSlot(slotIndex) {
                    var row = _row;
                    if (!_isAlive(row)) return null;
                    if (!_slots) _slots = [];
            
                    var slots = _slots || [];
                    var slotObj = slots[slotIndex];
                    if (slotObj && _isAlive(slotObj.icon) && _isAlive(slotObj.modContainer)) {
                        return slotObj;
                    }
            
                    var mirrorIcon = $.CreatePanel("Panel", row, "QOLItemMirrorIcon_" + String(slotIndex), {
                        hittest: "false",
                        hittestchildren: "false"
                    });
                    mirrorIcon.AddClass("QOLItemMirrorIcon");
                    var baseSizeText = String(Math.max(1, Math.round(Number(ITEM_MIRROR_ICON_BASE_SIZE_PX) || 45))) + "px";
                    mirrorIcon.style.width = baseSizeText;
                    mirrorIcon.style.height = baseSizeText;
                    mirrorIcon.style.flowChildren = "none";
                    mirrorIcon.style.padding = "0px";
                    mirrorIcon.style.margin = "2px 6px 2px 6px";
                    mirrorIcon.style.overflow = "noclip";
                    mirrorIcon.style.borderRadius = "0px";
                    mirrorIcon.style.horizontalAlign = "center";
                    mirrorIcon.style.verticalAlign = "center";
            
                    var mirrorSlot = $.CreatePanel("Panel", mirrorIcon, "modIconContainer", {
                        hittest: "false",
                        hittestchildren: "false"
                    });
                    mirrorSlot.AddClass("mod_icon_single_container");
                    mirrorSlot.AddClass("QOLItemMirrorModContainer");
                    mirrorSlot.style.width = baseSizeText;
                    mirrorSlot.style.height = baseSizeText;
                    mirrorSlot.style.flowChildren = "none";
                    mirrorSlot.style.backgroundColor = "none";
                    mirrorSlot.style.padding = "0px";
                    mirrorSlot.style.margin = "0px";
                    mirrorSlot.style.overflow = "noclip";
                    mirrorSlot.style.borderRadius = "0px";
                    mirrorSlot.style.opacityMask = "none";
                    mirrorSlot.style.horizontalAlign = "center";
                    mirrorSlot.style.verticalAlign = "center";
            
                    var viewport = $.CreatePanel("Panel", mirrorSlot, "", {
                        hittest: "false",
                        hittestchildren: "false"
                    });
                    viewport.AddClass("QOLItemMirrorViewport");
                    viewport.style.width = "100%";
                    viewport.style.height = "100%";
                    viewport.style.padding = "0px";
                    viewport.style.margin = "0px";
                    viewport.style.horizontalAlign = "center";
                    viewport.style.verticalAlign = "center";
                    viewport.style.borderRadius = "50%";
                    viewport.style.overflow = "clip clip";
            
                    var bg = $.CreatePanel("Panel", viewport, "mod_icon_background", {
                        hittest: "false",
                        hittestchildren: "false"
                    });
                    bg.AddClass("mod_icon_background_container");
                    bg.AddClass("QOLItemMirrorBackground");
                    bg.style.width = "100%";
                    bg.style.height = "100%";
                    bg.style.backgroundColor = "none";
                    bg.style.padding = "0px";
                    bg.style.margin = "0px";
                    bg.style.overflow = "clip clip";
                    bg.style.borderRadius = "0px";
                    bg.style.visibility = "collapse";
                    QOL_UTILS.SetPanelOpacitySafe(bg, 0, 0);
                    bg.style.width = "0px";
                    bg.style.height = "0px";
                    bg.style.horizontalAlign = "center";
                    bg.style.verticalAlign = "center";
            
                    var iconInner = $.CreatePanel("Panel", viewport, "mod_icon", {
                        hittest: "false",
                        hittestchildren: "false"
                    });
                    iconInner.AddClass("mod_icon");
                    iconInner.AddClass("ability_icon");
                    iconInner.AddClass("QOLItemMirrorIconInner");
                    iconInner.style.width = "100%";
                    iconInner.style.height = "100%";
                    iconInner.style.padding = "0px";
                    iconInner.style.margin = "0px";
                    iconInner.style.overflow = "clip clip";
                    iconInner.style.borderRadius = "0px";
                    iconInner.style.horizontalAlign = "center";
                    iconInner.style.verticalAlign = "center";
            
                    var img = $.CreatePanel("Image", viewport, "ModIconImage", {
                        hittest: "false",
                        hittestchildren: "false",
                        scaling: "stretch",
                        defaultsrc: "none"
                    });
                    img.AddClass("QOLItemMirrorImage");
                    img.style.width = "100%";
                    img.style.height = "100%";
                    img.style.visibility = "collapse";
                    img.style.padding = "0px";
                    img.style.margin = "0px";
                    img.style.overflow = "clip clip";
                    img.style.borderRadius = "0px";
                    img.style.horizontalAlign = "center";
                    img.style.verticalAlign = "center";
            
                    var mask = $.CreatePanel("Panel", viewport, "CooldownMask", {
                        hittest: "false",
                        hittestchildren: "false"
                    });
                    mask.AddClass("QOLItemMirrorCooldownMask");
                    mask.style.width = "100%";
                    mask.style.height = "100%";
                    mask.style.padding = "0px";
                    mask.style.margin = "0px";
                    mask.style.horizontalAlign = "center";
                    mask.style.verticalAlign = "center";
                    mask.style.borderRadius = "0px";
                    mask.style.clip = "radial(50% 50%, 0deg, 0deg)";
                    mask.style.opacityMask = "none";
                    mask.style.overflow = "clip clip";
                    mask.style.zIndex = "10";
            
                    var cdText = $.CreatePanel("Label", mirrorIcon, "", {
                        hittest: "false",
                        hittestchildren: "false"
                    });
                    cdText.AddClass("QOLItemMirrorCooldownText");
                    cdText.style.visibility = "collapse";
                    cdText.style.width = "100%";
                    cdText.style.height = "100%";
                    cdText.style.horizontalAlign = "center";
                    cdText.style.verticalAlign = "center";
                    cdText.style.zIndex = "20";
            
                    var readyOverlay = $.CreatePanel("Panel", viewport, "", {
                        hittest: "false",
                        hittestchildren: "false"
                    });
                    readyOverlay.AddClass("QOLItemMirrorReadyOverlay");
                    readyOverlay.style.width = "100%";
                    readyOverlay.style.height = "100%";
                    readyOverlay.style.horizontalAlign = "center";
                    readyOverlay.style.verticalAlign = "center";
                    readyOverlay.style.overflow = "clip clip";
                    readyOverlay.style.zIndex = "30";
            
                    slotObj = {
                        icon: mirrorIcon,
                        modContainer: mirrorSlot,
                        background: bg,
                        iconInner: iconInner,
                        image: img,
                        viewport: viewport,
                        cooldownMask: mask,
                        cooldownText: cdText,
                        readyOverlay: readyOverlay,
                        sourceKey: ""
                    };
                    slots[slotIndex] = slotObj;
                    return slotObj;
                }
            
            
            function _hideOverlay() {
                if (_isAlive(_overlay)) _overlay.DeleteAsync(0);
                _overlay = null;
                _row = null;
                _slots = [];
                _mirror = { sources: [], slotStates: {}, classCache: {}, runtimePanelIds: [], exceptionGroupAssignments: {}, nextSourceId: 0, nextAcquireOrder: 0 };
                _nextScanMs = 0;
                _lastSignature = "";
                _lastLayoutSig = "";
                _lastShopOpen = false;
                _abilities = null;
                _abilitiesHud = null;
            }
            function _update(hud, cfg) {
                var enabled = Number(cfg.ENABLE_PASSIVE_COOLDOWN) === 1 && Number(cfg.ENABLE_OLD_ITEM_COOLDOWNS) !== 1;
                if (!enabled) {
                    if (_overlay) _hideOverlay();
                    if (_loop) _loop.reschedule(ITEM_MIRROR_RENDER_INTERVAL_MS_IDLE / 1000);
                    return;
                }
                var inHideout = QOL.core.hud.isInHideout(hud);
                if (inHideout) {
                    if (_overlay) _hideOverlay();
                    if (_loop) _loop.reschedule(ITEM_MIRROR_RENDER_INTERVAL_MS_IDLE / 1000);
                    return;
                }
                var nowMs = _nowMs();
                if (_abilitiesHud !== hud || !_isAlive(_abilities)) {
                    _abilitiesHud = hud;
                    _abilities = hud.FindChildTraverse('abilitiesContainer');
                }
                var shopOpen = !!(_abilities && _abilities.BHasClass('gShopOpen'));
                var shopJustClosed = _lastShopOpen && !shopOpen;
                _lastShopOpen = shopOpen;
                if (shopOpen) {
                    if (_isAlive(_overlay) && _overlay.style.visibility !== 'collapse') _overlay.style.visibility = 'collapse';
                    if (_loop) _loop.reschedule(ITEM_MIRROR_RENDER_INTERVAL_MS_IDLE / 1000);
                    return;
                }
                var sources = _mirror.sources;
                var sourcesValid = sources.length > 0 && sources.every(function(s) { return _isAlive(s.ownerIcon) && _isAlive(s.iconContainer); });
                var needsScan = shopJustClosed || (nowMs >= _nextScanMs);
                if (needsScan) {
                    var scan = _buildItemMirrorSourcesMulti(hud, cfg);
                    var signature = 'modsContainers=' + scan.modsContainersCount + ';scan=' + scan.scannedCount + ';found=' + scan.matches.length + ';' + scan.structureSummary.join(';');
                    var stable = signature === _lastSignature && sourcesValid && sources.length > 0 && scan.matches.length > 0;
                    _nextScanMs = nowMs + (stable && !shopJustClosed ? 5270 : (scan.matches.length === 0 ? 1500 : ITEM_MIRROR_PROBE_SCAN_MS));
                    _lastSignature = signature;
                    sources = _reconcileItemMirrorSourcesMulti(scan.matches);
                }
                var root = _ensureOverlay(hud);
                if (!root) return;
                var pScale = Number(cfg.PASSIVE_COOLDOWN_SIZE) / 40;
                if (!isFinite(pScale) || pScale <= 0) pScale = 1;
                pScale = Math.max(0.75, Math.min(1.5, pScale));
                var offX = Number(cfg.PASSIVE_COOLDOWN_X);
                if (!isFinite(offX)) offX = 0;
                var offY = Number(cfg.PASSIVE_COOLDOWN_Y);
                if (!isFinite(offY)) offY = -2;
                var opacity = Number(cfg.PASSIVE_COOLDOWN_OPACITY);
                if (!isFinite(opacity)) opacity = 0.5;
                opacity = Math.max(0, Math.min(1, opacity));
                var layoutSig = [pScale, offX, offY, opacity].join('|');
                if (_lastLayoutSig !== layoutSig) {
                    root.style.uiScale = Math.round(pScale * 100) + '%';
                    root.style.marginLeft = offX + '%';
                    root.style.marginTop = -offY + '%';
                    if (_row) _row.style.opacity = opacity.toFixed(2);
                    _mirror.visualOpacityText = opacity.toFixed(2);
                    _lastLayoutSig = layoutSig;
                }
                var rootVis = sources.length ? 'visible' : 'collapse';
                if (root.style.visibility !== rootVis) root.style.visibility = rootVis;
                var activeKeys = {};
                for (var i = 0; i < sources.length; i++) {
                    var slot = _ensureSlot(i);
                    if (!slot) continue;
                    if (slot.icon && slot.icon.style && slot.icon.style.visibility !== 'visible') {
                        slot.icon.style.visibility = 'visible';
                    }
                    slot.sourceKey = sources[i].key;
                    activeKeys[sources[i].key] = true;
                    _syncMirrorItemFromSourceMulti(slot, sources[i]);
                }
                for (var j = sources.length; j < _slots.length; j++) {
                    if (_isAlive(_slots[j].icon) && _slots[j].icon.style && _slots[j].icon.style.visibility !== 'collapse') {
                        _slots[j].icon.style.visibility = 'collapse';
                    }
                }
                for (var key of Object.keys(_mirror.slotStates)) {
                    if (!activeKeys[key]) delete _mirror.slotStates[key];
                }
                if (_loop) _loop.reschedule((nowMs < (_mirror.fastModeUntilMs || 0) ? ITEM_MIRROR_RENDER_INTERVAL_MS_ACTIVE : ITEM_MIRROR_RENDER_INTERVAL_MS_IDLE) / 1000);
            }
            function _tick() {
                var hud = _getHud();
                if (hud) _update(hud, ctx.config.view ? ctx.config.view() : ctx.config.all());
            }
            return {
                onEnable: function() {
                    _nextScanMs = 0;
                    _loop = QOL.core.Scheduler.createPollLoop(_tick, ITEM_MIRROR_RENDER_INTERVAL_MS_ACTIVE / 1000, FEATURE_ID);
                },
                onDisable: function() {
                    if (_loop) { _loop.stop(); _loop = null; }
                    _hideOverlay();
                },
                onSettingsChanged: function() {
                    _nextScanMs = 0;
                    _tick();
                }
            };
        },
        test: function (ctx) {
            try {
                var passed = (ctx && ctx.id === FEATURE_ID);
                return {
                    passed: passed,
                    name: "ql_item_mirror manifest check",
                    message: passed ? "" : "Invalid feature ID",
                    assertions: [{ passed: passed, name: "Feature ID matches" }]
                };
            } catch (e) {
                return { passed: false, name: "ql_item_mirror manifest check", message: (e && e.message ? e.message : String(e)) };
            }
        }
    });
})();

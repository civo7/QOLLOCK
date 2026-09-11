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
    var ITEM_MIRROR_RENDER_INTERVAL_MS_ACTIVE = 50;
    var ITEM_MIRROR_RENDER_INTERVAL_MS_IDLE = 120;
    var ITEM_MIRROR_TEXT_PROBE_INTERVAL_MS = 80;
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

    function _nowMs() {
        return Date.now ? Date.now() : (new Date()).getTime();
    }

    function _isAlive(p) {
        return !!(p && typeof p.IsValid === "function" && p.IsValid());
    }

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

    function _findItemOwnerFromContainer(iconContainer) {
        if (!iconContainer) return null;
        var cur = iconContainer;
        for (var i = 0; i < 6; i++) {
            if (!cur) break;
            if (cur.BHasClass && cur.BHasClass("itemOwner")) return cur;
            cur = cur.GetParent ? cur.GetParent() : null;
        }
        return null;
    }

    function _findFirstExcludedModClassHit(iconContainer, excludedModClasses) {
        if (!iconContainer || !excludedModClasses || !excludedModClasses.length) return "";
        for (var i = 0; i < excludedModClasses.length; i++) {
            var cls = excludedModClasses[i];
            if (iconContainer.BHasClass && iconContainer.BHasClass(cls)) return cls;
        }
        return "";
    }

    function _normalizeCooldownNumberText(text) {
        if (!text || typeof text !== "string") return "";
        var trimmed = text.trim();
        if (!trimmed) return "";
        var m = /^\d+(\.\d+)?$/.exec(trimmed);
        return m ? trimmed : "";
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

    function _probeCooldownTextFromSourceIcon(sourceIcon) {
        var classCandidates = ["Countdown", "cooldown_text", "CooldownText", "CooldownLabel"];
        var idCandidates = ["Countdown", "cooldown_text", "CooldownText", "CooldownLabel"];
        var chosen = "";
        if (!sourceIcon) return { chosen: "" };

        for (var i = 0; i < classCandidates.length; i++) {
            var rawC = _getFirstPanelTextByClass(sourceIcon, classCandidates[i]);
            var normC = _normalizeCooldownNumberText(rawC);
            if (normC) { chosen = normC; break; }
        }
        if (!chosen) {
            for (var j = 0; j < idCandidates.length; j++) {
                var rawId = _getFirstPanelTextById(sourceIcon, idCandidates[j]);
                var normId = _normalizeCooldownNumberText(rawId);
                if (normId) { chosen = normId; break; }
            }
        }
        return { chosen: chosen };
    }

    FR.register({
        id: FEATURE_ID,
        enableKeys: ["ENABLE_PASSIVE_COOLDOWN", "ENABLE_OLD_ITEM_COOLDOWNS"],
        enabledByDefault: false,
        settings: [
            { key: "ENABLE_PASSIVE_COOLDOWN", type: "toggle", default: false },
            { key: "ENABLE_OLD_ITEM_COOLDOWNS", type: "toggle", default: false },
            { key: "PASSIVE_COOLDOWN_SIZE", type: "slider", min: 30, max: 60, step: 1, default: 40 },
            { key: "PASSIVE_COOLDOWN_Y", type: "slider", min: -50, max: 50, step: 1, default: 0 },
            { key: "PASSIVE_COOLDOWN_X", type: "slider", min: -50, max: 50, step: 1, default: 0 },
            { key: "PASSIVE_COOLDOWN_OPACITY", type: "slider", min: 0, max: 1, step: 0.05, default: 0.5 }
        ],
        create: function (ctx) {
            var _loop = null;
            var _overlay = null;
            var _row = null;
            var _slots = [];
            var _sources = [];
            var _slotStates = {};
            var _classCache = {};
            var _nextSourceId = 1;
            var _lastScanMs = 0;
            var _lastSignature = "";
            var _fastModeUntilMs = 0;
            var _lastLayoutSig = "";
            var _lastShopOpen = false;

            function _getHud() {
                if (QOL.core && QOL.core.hud && QOL.core.hud.findHud) {
                    return QOL.core.hud.findHud();
                }
                var c = $.GetContextPanel();
                if (!c) return null;
                return c.id === "Hud" ? c : (c.FindChildTraverse ? c.FindChildTraverse("Hud") : null);
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
                _overlay.style.uiScale = "100%";
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
                if (!_isAlive(_row)) return null;
                var slotObj = _slots[slotIndex];
                if (slotObj && _isAlive(slotObj.icon) && _isAlive(slotObj.modContainer)) {
                    return slotObj;
                }

                var baseSize = String(ITEM_MIRROR_ICON_BASE_SIZE_PX) + "px";
                var mirrorIcon = $.CreatePanel("Panel", _row, "QOLItemMirrorIcon_" + String(slotIndex), {
                    hittest: "false",
                    hittestchildren: "false"
                });
                mirrorIcon.AddClass("QOLItemMirrorIcon");
                mirrorIcon.style.width = baseSize;
                mirrorIcon.style.height = baseSize;
                mirrorIcon.style.flowChildren = "none";
                mirrorIcon.style.margin = "2px 6px 2px 6px";
                mirrorIcon.style.overflow = "noclip";

                var mirrorSlot = $.CreatePanel("Panel", mirrorIcon, "modIconContainer", {
                    hittest: "false",
                    hittestchildren: "false"
                });
                mirrorSlot.AddClass("mod_icon_single_container");
                mirrorSlot.AddClass("QOLItemMirrorModContainer");
                mirrorSlot.style.width = baseSize;
                mirrorSlot.style.height = baseSize;
                mirrorSlot.style.flowChildren = "none";
                mirrorSlot.style.overflow = "noclip";

                var viewport = $.CreatePanel("Panel", mirrorSlot, "", {
                    hittest: "false",
                    hittestchildren: "false"
                });
                viewport.AddClass("QOLItemMirrorViewport");
                viewport.style.width = "100%";
                viewport.style.height = "100%";
                viewport.style.borderRadius = "50%";
                viewport.style.overflow = "clip clip";

                var img = $.CreatePanel("Image", viewport, "ModIconImage", {
                    hittest: "false",
                    hittestchildren: "false",
                    scaling: "stretch"
                });
                img.AddClass("QOLItemMirrorImage");
                img.style.width = "100%";
                img.style.height = "100%";
                img.style.visibility = "collapse";

                var mask = $.CreatePanel("Panel", viewport, "CooldownMask", {
                    hittest: "false",
                    hittestchildren: "false"
                });
                mask.AddClass("QOLItemMirrorCooldownMask");
                mask.style.width = "100%";
                mask.style.height = "100%";
                mask.style.clip = "radial(50% 50%, 0deg, 0deg)";
                mask.style.zIndex = "10";

                var cdText = $.CreatePanel("Label", mirrorIcon, "", {
                    hittest: "false",
                    hittestchildren: "false"
                });
                cdText.AddClass("QOLItemMirrorCooldownText");
                cdText.style.visibility = "collapse";
                cdText.style.width = "fit-children";
                cdText.style.height = "fit-children";
                cdText.style.fontSize = "20px";
                cdText.style.fontWeight = "bold";
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
                readyOverlay.style.zIndex = "30";

                slotObj = {
                    icon: mirrorIcon,
                    modContainer: mirrorSlot,
                    image: img,
                    viewport: viewport,
                    cooldownMask: mask,
                    cooldownText: cdText,
                    readyOverlay: readyOverlay,
                    sourceKey: ""
                };
                _slots[slotIndex] = slotObj;
                return slotObj;
            }

            function _collectModsContainers(hud) {
                var out = [];
                if (!hud || !hud.FindChildrenWithClassTraverse) return out;
                var focused = ["StatsAndModsContainer", "LowerLeft", "ModPurchasedPanelUniversal"];
                for (var f = 0; f < focused.length; f++) {
                    var sub = hud.FindChildTraverse ? hud.FindChildTraverse(focused[f]) : null;
                    if (sub && sub.FindChildrenWithClassTraverse) {
                        var found = sub.FindChildrenWithClassTraverse("ModsContainer") || [];
                        for (var i = 0; i < found.length; i++) {
                            if (found[i] && out.indexOf(found[i]) === -1) out.push(found[i]);
                        }
                    }
                }
                if (out.length === 0) {
                    var all = hud.FindChildrenWithClassTraverse("ModsContainer") || [];
                    for (var j = 0; j < all.length; j++) {
                        if (all[j] && out.indexOf(all[j]) === -1) out.push(all[j]);
                    }
                }
                return out;
            }

            function _sourceEntryMatchesTarget(entry, target) {
                if (!entry || !target) return false;
                if (!target.skipClassMatch && target.className) {
                    if (!entry.iconContainer || !entry.iconContainer.BHasClass || !entry.iconContainer.BHasClass(target.className)) {
                        return false;
                    }
                }
                if (target.requireModClass) {
                    if (!entry.iconContainer || !entry.iconContainer.BHasClass || !entry.iconContainer.BHasClass(target.requireModClass)) {
                        return false;
                    }
                }
                return true;
            }

            function _scanSources(hud) {
                var containers = _collectModsContainers(hud);
                var entries = [];
                var seenIcons = [];

                for (var c = 0; c < containers.length; c++) {
                    var mc = containers[c];
                    if (!mc || !mc.FindChildrenWithClassTraverse) continue;
                    var icons = mc.FindChildrenWithClassTraverse("mod_icon_single_container") || [];
                    for (var i = 0; i < icons.length; i++) {
                        var nested = icons[i];
                        if (!nested || nested.id !== "modIconContainer") continue;
                        var owner = _findItemOwnerFromContainer(nested);
                        if (!owner || !owner.BHasClass || !owner.BHasClass("hasAbility")) continue;
                        if (seenIcons.indexOf(owner) !== -1) continue;
                        seenIcons.push(owner);

                        var img = nested.FindChildTraverse ? nested.FindChildTraverse("ModIconImage") : null;
                        var src = img && img.GetAttributeString ? img.GetAttributeString("src", "") : "";
                        var mask = owner.FindChildTraverse ? owner.FindChildTraverse("CooldownMask") : null;

                        entries.push({
                            ownerIcon: owner,
                            iconContainer: nested,
                            ownerId: owner.id || "unknown",
                            sourceImage: img,
                            iconSrc: src,
                            cooldownMask: mask
                        });
                    }
                }

                var matches = [];
                for (var e = 0; e < entries.length; e++) {
                    var entry = entries[e];
                    for (var t = 0; t < ITEM_MIRROR_TARGETS.length; t++) {
                        var target = ITEM_MIRROR_TARGETS[t];
                        if (_sourceEntryMatchesTarget(entry, target)) {
                            matches.push({
                                ownerIcon: entry.ownerIcon,
                                iconContainer: entry.iconContainer,
                                ownerId: entry.ownerId,
                                sourceImage: entry.sourceImage,
                                iconSrc: entry.iconSrc,
                                cooldownMask: entry.cooldownMask,
                                itemClassName: target.className,
                                targetIconSrc: target.iconSrc
                            });
                            break;
                        }
                    }
                }

                // Reconcile with previous sources
                var nextSources = [];
                for (var m = 0; m < matches.length; m++) {
                    var match = matches[m];
                    var existing = null;
                    for (var p = 0; p < _sources.length; p++) {
                        if (_sources[p].ownerId === match.ownerId) {
                            existing = _sources[p];
                            break;
                        }
                    }
                    var key = existing ? existing.key : ("item_src_" + String(_nextSourceId++));
                    match.key = key;
                    nextSources.push(match);
                }
                _sources = nextSources;
            }

            function _syncSlot(slotObj, source, nowMs) {
                var mirrorIcon = slotObj.icon;
                var mirrorSlot = slotObj.modContainer;
                var mirrorImage = slotObj.image;
                var mirrorMask = slotObj.cooldownMask;
                var mirrorText = slotObj.cooldownText;
                var mirrorReady = slotObj.readyOverlay;
                var sourceIcon = source.ownerIcon;
                var sourceMod = source.iconContainer;

                if (!_isAlive(mirrorIcon) || !_isAlive(mirrorSlot) || !_isAlive(sourceIcon)) return;

                var state = _slotStates[source.key];
                if (!state) {
                    state = {
                        wasOnCooldown: false,
                        cdLastDeg: null,
                        cdLastMs: 0,
                        cdSlopeEma: null,
                        cdDirection: 0,
                        cdDisplayLock: null,
                        lastProbeText: "",
                        nextProbeMs: 0
                    };
                    _slotStates[source.key] = state;
                }

                _syncPanelClasses(sourceIcon, mirrorIcon, _classCache, "icon:" + source.key, ["OnCooldown", "OffCooldown", "VerticalCooldown", "isWeapon", "isArmor", "isTech"]);
                _syncPanelClasses(sourceIcon, mirrorSlot, _classCache, "slot:" + source.key, ["OnCooldown", "OffCooldown", "VerticalCooldown", "isWeapon", "isArmor", "isTech"]);

                var isOnCooldown = sourceIcon.BHasClass && sourceIcon.BHasClass("OnCooldown");
                var isVertical = sourceIcon.BHasClass && sourceIcon.BHasClass("VerticalCooldown");

                // Update icon image
                var srcVal = source.targetIconSrc || "";
                if (!srcVal && source.itemClassName && ITEM_MIRROR_FORCED_IMAGE_BY_CLASS[source.itemClassName]) {
                    srcVal = ITEM_MIRROR_FORCED_IMAGE_BY_CLASS[source.itemClassName];
                }
                if (!srcVal && source.iconSrc) srcVal = source.iconSrc;
                if (srcVal && mirrorImage) {
                    try {
                        if (mirrorImage.SetImage) mirrorImage.SetImage(srcVal);
                        else mirrorImage.style.backgroundImage = 'url("' + srcVal + '")';
                        mirrorImage.style.visibility = "visible";
                    } catch (eImg) {}
                }

                // Sync mask
                var maskClip = "";
                var sourceMask = source.cooldownMask;
                if (_isAlive(sourceMask) && sourceMask.style && sourceMask.style.clip) {
                    maskClip = String(sourceMask.style.clip);
                }
                if (maskClip && mirrorMask) {
                    try { mirrorMask.style.clip = maskClip; } catch (eCl) {}
                }
                if (mirrorMask) {
                    mirrorMask.style.visibility = isOnCooldown ? "visible" : "collapse";
                    mirrorMask.style.preTransformScale2d = isVertical ? "1.00, 1.00" : "-1.00, 1.00";
                }

                // Countdown label
                var cooldownText = "";
                if (isOnCooldown && mirrorText) {
                    if (nowMs >= state.nextProbeMs) {
                        var pr = _probeCooldownTextFromSourceIcon(sourceIcon);
                        state.lastProbeText = pr.chosen || "";
                        state.nextProbeMs = nowMs + ITEM_MIRROR_TEXT_PROBE_INTERVAL_MS;
                    }
                    cooldownText = state.lastProbeText || "";

                    if (!cooldownText && maskClip) {
                        var currentDeg = _resolveRadialProgressDeg(maskClip, state.cdLastDeg);
                        if (currentDeg !== null && state.cdLastDeg !== null && state.cdLastMs > 0) {
                            var dtSec = (nowMs - state.cdLastMs) / 1000.0;
                            var dDeg = state.cdLastDeg - currentDeg;
                            if (dtSec > 0.01 && dtSec < 1.0 && Math.abs(dDeg) > 0.01) {
                                var slope = Math.abs(dDeg) / dtSec;
                                if (slope > 0.001 && slope < 5000) {
                                    state.cdSlopeEma = (state.cdSlopeEma === null) ? slope : ((state.cdSlopeEma * 0.75) + (slope * 0.25));
                                }
                            }
                        }
                        state.cdLastDeg = currentDeg;
                        state.cdLastMs = nowMs;

                        if (state.cdSlopeEma !== null && state.cdSlopeEma > 0.001 && currentDeg !== null) {
                            var remSec = currentDeg / state.cdSlopeEma;
                            cooldownText = _formatDerivedCooldownSeconds(remSec);
                        }
                    }

                    if (cooldownText) {
                        if (mirrorText.text !== cooldownText) mirrorText.text = cooldownText;
                        mirrorText.style.visibility = "visible";
                    } else {
                        mirrorText.style.visibility = "collapse";
                    }
                } else if (mirrorText) {
                    mirrorText.style.visibility = "collapse";
                }

                // Ready flash
                if (state.wasOnCooldown && !isOnCooldown) {
                    if (mirrorReady) _triggerReadyFlash(mirrorReady);
                }
                state.wasOnCooldown = !!isOnCooldown;
                if (isOnCooldown) _fastModeUntilMs = nowMs + 500;
            }

            function _hideOverlay() {
                if (_isAlive(_overlay)) _overlay.style.visibility = "collapse";
                _sources = [];
                _slotStates = {};
                _classCache = {};
            }

            function _update(hud, cfg) {
                var masterOn = (cfg.ENABLE_PASSIVE_COOLDOWN === 1 || cfg.ENABLE_PASSIVE_COOLDOWN === true);
                var oldModeOn = (Number(cfg.ENABLE_OLD_ITEM_COOLDOWNS) === 1);
                var enabled = masterOn && !oldModeOn;

                if (!enabled) {
                    _hideOverlay();
                    if (_loop) _loop.reschedule(ITEM_MIRROR_RENDER_INTERVAL_MS_IDLE / 1000.0);
                    return;
                }

                var root = _ensureOverlay(hud);
                if (!root) return;

                var nowMs = _nowMs();
                var abilitiesContainer = hud.FindChildTraverse ? hud.FindChildTraverse("abilitiesContainer") : null;
                var shopOpen = !!(abilitiesContainer && abilitiesContainer.BHasClass && abilitiesContainer.BHasClass("gShopOpen"));
                var shopJustClosed = _lastShopOpen && !shopOpen;
                _lastShopOpen = shopOpen;

                var shouldScan = (nowMs - _lastScanMs >= ITEM_MIRROR_PROBE_SCAN_MS) || shopJustClosed;
                if (shouldScan) {
                    _scanSources(hud);
                    _lastScanMs = nowMs;
                }

                // Apply layout styling
                var baseSize = 40;
                var pScale = Number(cfg.PASSIVE_COOLDOWN_SIZE) / baseSize;
                if (!isFinite(pScale) || pScale <= 0) pScale = 1.0;
                var offX = Number(cfg.PASSIVE_COOLDOWN_X) || 0;
                var offY = (cfg.PASSIVE_COOLDOWN_Y !== undefined && cfg.PASSIVE_COOLDOWN_Y !== null) ? Number(cfg.PASSIVE_COOLDOWN_Y) : -2;
                var rowOpacity = (cfg.PASSIVE_COOLDOWN_OPACITY !== undefined && cfg.PASSIVE_COOLDOWN_OPACITY !== null) ? Number(cfg.PASSIVE_COOLDOWN_OPACITY) : 0.5;

                var layoutSig = pScale.toFixed(3) + "|" + offX + "|" + offY + "|" + rowOpacity.toFixed(2);
                if (_lastLayoutSig !== layoutSig) {
                    root.style.uiScale = Math.round(pScale * 100) + "%";
                    root.style.marginLeft = offX + "%";
                    root.style.marginTop = (-offY) + "%";
                    if (_row) {
                        try { _row.style.opacity = String(rowOpacity); } catch (eOp) {}
                    }
                    _lastLayoutSig = layoutSig;
                }

                if (_sources.length === 0) {
                    root.style.visibility = "collapse";
                    if (_loop) _loop.reschedule(ITEM_MIRROR_RENDER_INTERVAL_MS_IDLE / 1000.0);
                    return;
                }

                root.style.visibility = "visible";

                // Update up to 4 items in the row
                var maxSlots = Math.min(_sources.length, 4);
                for (var s = 0; s < maxSlots; s++) {
                    var slot = _ensureSlot(s);
                    if (!slot) continue;
                    slot.icon.style.visibility = "visible";
                    _syncSlot(slot, _sources[s], nowMs);
                }

                // Collapse unused slots
                for (var u = maxSlots; u < _slots.length; u++) {
                    if (_slots[u] && _isAlive(_slots[u].icon)) {
                        _slots[u].icon.style.visibility = "collapse";
                    }
                }

                var intervalMs = (nowMs < _fastModeUntilMs) ? ITEM_MIRROR_RENDER_INTERVAL_MS_ACTIVE : ITEM_MIRROR_RENDER_INTERVAL_MS_IDLE;
                if (_loop) _loop.reschedule(intervalMs / 1000.0);
            }

            function _tick() {
                var hud = _getHud();
                if (!hud) return;
                var cfg = ctx.config.view ? ctx.config.view() : ctx.config.all();
                _update(hud, cfg);
            }

            return {
                onEnable: function () {
                    var S = QOL.core && QOL.core.Scheduler;
                    if (S && S.createPollLoop) {
                        _loop = S.createPollLoop(_tick, ITEM_MIRROR_RENDER_INTERVAL_MS_ACTIVE / 1000.0, FEATURE_ID);
                    }
                },
                onDisable: function () {
                    if (_loop) { _loop.stop(); _loop = null; }
                    _hideOverlay();
                },
                onSettingsChanged: function () {
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

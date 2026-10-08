// OWNS: Authoritative Advanced item/tier/category/image/exception mapping and timing constants.
(() => {
    "use strict";
    const FEATURE_ID = "ql_item_mirror";
    const ITEM_MIRROR_ICON_BASE_SIZE_PX = 45;
    // rate-exempt: 20Hz (50ms) active cadence during item drag mirror operation
    const ITEM_MIRROR_RENDER_INTERVAL_MS_ACTIVE = 50;
    const ITEM_MIRROR_RENDER_INTERVAL_MS_IDLE = 120;
    const ITEM_MIRROR_TEXT_PROBE_INTERVAL_MS = 80;
    const ITEM_MIRROR_EMPTY_TEXT_PROBE_INTERVAL_MS = 1000;
    const INLINE_STYLE_PATTERNS = {
        clip: /(?:^|;)\s*clip\s*:\s*([^;]+)/i,
        opacity: /(?:^|;)\s*opacity\s*:\s*([^;]+)/i,
        visibility: /(?:^|;)\s*visibility\s*:\s*([^;]+)/i
    };
    const ITEM_MIRROR_PROBE_SCAN_MS = 1630;
    const ITEM_MIRROR_RAPID_RETRIGGER_WINDOW_MS = 1300;
    const ITEM_MIRROR_RAPID_RETRIGGER_SUPPRESS_MS = 900;
    const ITEM_MIRROR_READY_OVERLAY_FLASH_MS = 420;

    const T2_BULLET_SHIELD_PAIR_GROUP = "tier2BulletShieldPair";
    const EXPRESS_SHOT_EXCLUDED_MOD_CLASSES = ["explosiveBullets", "rapidRounds", "highVelocityMag"];
    const BACKSTABBER_EXCLUDED_MOD_CLASSES = ["meleeCharge", "crushingFists"];

    const ITEM_MIRROR_TARGETS = [
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

    const ITEM_MIRROR_FORCED_IMAGE_BY_CLASS = {
        acolytesGlove: "file://{images}/items/spirit/spirit_strike.psd",
        medicBullets: "file://{images}/items/weapon/restorative_shot.psd",
        fireRatePlus: "file://{images}/items/spirit/quicksilver_reload.psd"
    };

    QOL.features.itemMirror = { data: Object.freeze({ FEATURE_ID, ITEM_MIRROR_ICON_BASE_SIZE_PX, ITEM_MIRROR_RENDER_INTERVAL_MS_ACTIVE, ITEM_MIRROR_RENDER_INTERVAL_MS_IDLE, ITEM_MIRROR_TEXT_PROBE_INTERVAL_MS, ITEM_MIRROR_EMPTY_TEXT_PROBE_INTERVAL_MS, INLINE_STYLE_PATTERNS, ITEM_MIRROR_PROBE_SCAN_MS, ITEM_MIRROR_RAPID_RETRIGGER_WINDOW_MS, ITEM_MIRROR_RAPID_RETRIGGER_SUPPRESS_MS, ITEM_MIRROR_READY_OVERLAY_FLASH_MS, T2_BULLET_SHIELD_PAIR_GROUP, EXPRESS_SHOT_EXCLUDED_MOD_CLASSES, BACKSTABBER_EXCLUDED_MOD_CLASSES, ITEM_MIRROR_TARGETS, ITEM_MIRROR_FORCED_IMAGE_BY_CLASS }) };
})();

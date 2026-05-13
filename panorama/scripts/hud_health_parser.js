"use strict";
(function () {

    // ─── CONSTANTS ────────────────────────────────────────────────────────────

    // Used in the hunger bar code to get partial stamina values.
    const CHARGE_MAX_ANGLES = {
        1: 90,
        2: 42,
        3: 26,
        4: 20,
        5: 15.5,
        6: 13,
        7: 10.86
    };

    const PANELS = {
        MINECRAFT_HEARTS:            "MinecraftHearts",
        MINECRAFT_BARRIER_HEARTS:    "MinecraftShieldHearts",
        MINECRAFT_BARRIER_CONTAINER: "MinecraftShieldHeartsContainer",
        MINECRAFT_FOOD:              "MinecraftFoodContainer",
        MINECRAFT_XP_FILL:           "MinecraftXPBarFill",
        MINECRAFT_XP_LEVEL:          "MinecraftXPLevelLabel",
        MINECRAFT_TOTEM:             "MinecraftTotemContainer",
        HUD_HEALTH_BARS:             "hud_health_bars",
        HUD_BARRIERS:                "HudShieldsContainer",
        HEALTH_CONTAINER:            "healthContainer",
        CURRENT_HEALTH_LABEL:        "currentHealthLabel",
        TOTAL_HEALTH_LABEL:          "totalHealthLabel",
        BULLET_BARRIER_NUMBERS:      "BulletShieldNumbers",
        PENDING_DAMAGE:              "pending_incoming_damage_Middle",
        PENDING_HEAL:                "pending_incoming_heal_Middle",
        GOLD_AP_CONTAINER:           "gold_and_ap_container",
        SOULS_FILL:                  "SoulsFill",
        PLAYER_LEVEL:                "PlayerLevelNumber",
        CHARGES_CONTAINER:           "charges_container",
    };

    const CONFIG = {
        // Health / heart sizing
        HP_PER_HALF_SEGMENT:      50,    // Each half-heart represents this much HP. (1 row = 50 * 20 = 1,000 HP)
        LOW_HEALTH_HALF_SEGMENTS:  4,    // The low-health heart jiggle animation will play at or below this health value. (2 hearts/200 HP)

        // Heart grid layout
        HEARTS_PER_ROW:           10,       
        MAX_HEART_ROWS:            5,    // Above this value, the heart rows will start squeezing to save space.
        HEART_ROW_HEIGHT_PX:      22,    // 18px for the heart image + 2px for the top margin + 2px for the bottom margin

        // Health bar pixel scale (converts bar element height to a percentage of max HP)
        HEALTH_BAR_PIXEL_HEIGHT: 367,
        HEALTH_BAR_SCALE:    52 / 30,

        // Souls / XP bar
        SOULS_BAR_MAX_HEIGHT_PX:  52,

        // Food bar
        FOOD_PERCENT_PER_HALF:     5,   // Each half food-icon is equal to this percentage of total stamina.

        // Timing (seconds)
        TICK_INTERVAL_S:          0.05, // Update interval of the main ParseHealthValues polling loop.
        STARTUP_DELAY_S:          0.1,  // Delay before the very first tick.
        BLINK_INTERVAL_S:         0.1,  // Time between blink phase steps.
        BLINK_PHASE_COUNT:        4,    // The healthbar will alternate this many times when the displayed health changes. (4 = 2 white flashes)
        JIGGLE_INTERVAL_S:        0.05, // The time between low-health jiggle movements.
        JIGGLE_CHANCE:     0.5,  // The chance that any given heart will jiggle in a given jiggle interval.
        HEALING_WAVE_STEP_S:      0.05, // The time between each heart raising in the health regeneration wave animation.
        HEALING_WAVE_PAUSE_S:     0.5,  // The length of the pause at the end before the health regeneration wave animation repeats.
    };

    // ─── STATE ────────────────────────────────────────────────────────────────

    const state = {
        // ── Timers & intervals ────────────────────────────────────────────────
        healthParseInterval:          null,
        heartsBlinkTimer:             null,
        lowHealthJiggleTimer:         null,
        healingWaveTimer:             null,

        // ── Animation flags ───────────────────────────────────────────────────
        lastBlinkHalfSegments:        null,
        heartsBlinking:               false,
        heartsBlinkPhase:             0,
        lowHealthJiggleActive:        false,
        healingWaveActive:            false,
        healingWaveCurrentIndex:      0,
        isAfflicted:                  false,

        // ── Cached panel references (populated on first tick) ─────────────────
        cachedUIRootPanel:            null,
        cachedHudHealthBars:          null,
        cachedTotemContainer:         null,
        cachedBarriersContainer:      null,
        cachedHeartsContainer:        null,
        cachedHeartsParentContainer:  null,
        cachedBarrierHeartsContainer: null,
        cachedBarrierHearts:          null,
        cachedFoodContainer:          null,

        // ── Cached DOM arrays (rebuilt when capacity changes) ─────────────────
        cachedFoodIcons:                 [],
        minecraftHeartSlots:             [],
        minecraftHeartContainerImages:   [],
        minecraftHeartHealingImages:     [],
        minecraftHeartDeferredImages:    [],
        minecraftHeartFillImages:        [],
        minecraftHeartsCapacity:         0,
        minecraftHeartsRowCount:         0,
        lastVisibleHeartsCount:          0,
        barrierHeartsPanels:             [],
        barrierHeartContainerImages:     [],
        barrierHeartFillImages:          [],
        barrierHeartsCapacity:           0,

        // ── Render diff cache (skip DOM writes when nothing changed) ──────────
        lastIsBlinkOn:               null,
        lastContainerHeartsNeeded:   -1,
        lastContainerLastSlotIsHalf: null,
        lastFillFullHearts:          -1,
        lastFillHasHalf:             null,
        lastFillAfflicted:           null,
        lastDeferredFullHearts:      -1,
        lastDeferredHasHalf:         null,
        lastDeferredStartSlots:      -1,
        lastHealingFullHearts:       -1,
        lastHealingHasHalf:          null,
        lastHealingStartSlots:       -1,
    };

    // ─── ANIMATION ───────────────────────────────────────────────────────────
    // StartHeartsBlink, LowHealthJiggleTick, ResetAllHeartsPosition,
    // SetLowHealthJiggleEnabled, HealingWaveTick, SetHealingWaveEnabled

    /**
     * Starts a short blink animation on the heart container images.
     * Fires BLINK_PHASE_COUNT phases at BLINK_INTERVAL_S apart, alternating
     * between normal and blinking container textures on even/odd phases.
     * Safe to call while a blink is already in progress and restarts cleanly.
     */
    function StartHeartsBlink() {
        if (state.heartsBlinkTimer !== null) {
            $.CancelScheduled(state.heartsBlinkTimer);
            state.heartsBlinkTimer = null
        }
        state.heartsBlinking = true;
        state.heartsBlinkPhase = 0;

        function scheduleNextPhase() {
            state.heartsBlinkTimer = $.Schedule(CONFIG.BLINK_INTERVAL_S, function () {
                if (!state.heartsBlinking) {
                    state.heartsBlinkTimer = null;
                    return
                }
                state.heartsBlinkPhase += 1;
                if (state.heartsBlinkPhase >= CONFIG.BLINK_PHASE_COUNT) {
                    state.heartsBlinking = false;
                    state.heartsBlinkTimer = null;
                    return
                }
                scheduleNextPhase()
            })
        }
        scheduleNextPhase()
    }

    /**
     * Randomly toggles the LoweredHeart CSS class on each visible heart slot,
     * creating a shaking effect. Called every JIGGLE_INTERVAL_S while at low health.
     * Each heart has a JIGGLE_CHANCE probability of jiggling per tick.
     */
    function LowHealthJiggleTick() {
        try {
            const hearts = state.minecraftHeartSlots;
            if (!hearts || hearts.length === 0) {
                return
            }
            const visibleCount = Math.min(state.lastVisibleHeartsCount, hearts.length);
            for (let i = 0; i < visibleCount; i += 1) {
                const heart = hearts[i];
                if (Math.random() < CONFIG.JIGGLE_CHANCE) {
                    if (heart.BHasClass("LoweredHeart")) {
                        heart.RemoveClass("LoweredHeart")
                    } else {
                        heart.AddClass("LoweredHeart")
                    }
                }
            }
        } catch (e) {
            $.Msg("[HealthParser] Error in LowHealthJiggleTick: " + e)
        }
    }

    /**
     * Removes both RaisedHeart and LoweredHeart classes from every heart slot,
     * returning all hearts to their default vertical position.
     */
    function ResetAllHeartsPosition() {
        try {
            if (!state.minecraftHeartSlots || state.minecraftHeartSlots.length === 0) {
                return
            }
            for (let i = 0; i < state.minecraftHeartSlots.length; i += 1) {
                state.minecraftHeartSlots[i].RemoveClass("RaisedHeart");
                state.minecraftHeartSlots[i].RemoveClass("LoweredHeart")
            }
        } catch (e) {
            $.Msg("[HealthParser] Error in ResetAllHeartsPosition: " + e)
        }
    }

    /**
     * Starts or stops the low-health jiggle animation loop.
     * Starting while already active (or stopping while already inactive) is a no-op.
     * Stopping also resets all heart positions via ResetAllHeartsPosition.
     * @param {boolean} enabled
     */
    function SetLowHealthJiggleEnabled(enabled) {
        if (enabled) {
            if (state.lowHealthJiggleActive) {
                return
            }
            state.lowHealthJiggleActive = true;

            function scheduleNext() {
                state.lowHealthJiggleTimer = $.Schedule(CONFIG.JIGGLE_INTERVAL_S, function () {
                    if (!state.lowHealthJiggleActive) {
                        state.lowHealthJiggleTimer = null;
                        return
                    }
                    LowHealthJiggleTick();
                    scheduleNext()
                })
            }
            scheduleNext()
        } else {
            if (!state.lowHealthJiggleActive) {
                return
            }
            state.lowHealthJiggleActive = false;
            if (state.lowHealthJiggleTimer !== null) {
                $.CancelScheduled(state.lowHealthJiggleTimer);
                state.lowHealthJiggleTimer = null
            }
            ResetAllHeartsPosition()
        }
    }

    /**
     * Searches the UI root panel for a label with class "modifier_name" whose
     * text contains the given modifier name (case-insensitive). Used to detect
     * active status effects. This is currently only used for Pocket's Affliction.
     * @param {string} name  Modifier name to search for (upper-case).
     * @returns {boolean}
     */
    function CheckModifierActive(name) {
        try {
            if (!state.cachedUIRootPanel) {
                let rootPanel = $.GetContextPanel();
                if (!rootPanel) {
                    return false
                }
                state.cachedUIRootPanel = rootPanel;
                while (state.cachedUIRootPanel.GetParent()) {
                    state.cachedUIRootPanel = state.cachedUIRootPanel.GetParent()
                }
            }
            const modifierLabels = state.cachedUIRootPanel.FindChildrenWithClassTraverse("modifier_name");
            if (!modifierLabels || modifierLabels.length === 0) {
                return false
            }
            for (let i = 0; i < modifierLabels.length; i += 1) {
                const label = modifierLabels[i];
                if (label.text && label.text.toUpperCase().indexOf(name) !== -1) {
                    return true
                }
            }
            return false
        } catch (e) {
            $.Msg("[HealthParser] Error in CheckModifierActive: " + e);
            return false
        }
    }

    /**
     * Advances the healing wave animation by one step: lowers the previous heart,
     * raises the current heart, then schedules the next step after HEALING_WAVE_STEP_S.
     * When the wave reaches the last visible heart it pauses for HEALING_WAVE_PAUSE_S
     * before restarting from index 0.
     */
    function HealingWaveTick() {
        try {
            const hearts = state.minecraftHeartSlots;
            if (!hearts || hearts.length === 0) {
                return
            }
            const visibleCount = Math.min(state.lastVisibleHeartsCount, hearts.length);
            if (visibleCount === 0) {
                return
            }
            if (state.healingWaveCurrentIndex > visibleCount) {
                state.healingWaveCurrentIndex = 0
            }
            if (state.healingWaveCurrentIndex > 0) {
                hearts[state.healingWaveCurrentIndex - 1].RemoveClass("RaisedHeart")
            }
            if (state.healingWaveCurrentIndex >= visibleCount) {
                state.healingWaveTimer = $.Schedule(CONFIG.HEALING_WAVE_PAUSE_S, function () {
                    if (!state.healingWaveActive) {
                        state.healingWaveTimer = null;
                        return
                    }
                    state.healingWaveCurrentIndex = 0;
                    HealingWaveTick()
                });
                return
            }
            const heart = hearts[state.healingWaveCurrentIndex];
            heart.AddClass("RaisedHeart");
            state.healingWaveCurrentIndex += 1;
            state.healingWaveTimer = $.Schedule(CONFIG.HEALING_WAVE_STEP_S, function () {
                if (!state.healingWaveActive) {
                    state.healingWaveTimer = null;
                    return
                }
                HealingWaveTick()
            })
        } catch (e) {
            $.Msg("[HealthParser] Error in HealingWaveTick: " + e)
        }
    }

    /**
     * Starts or stops the healing wave animation loop.
     * Will not start if the low-health jiggle animation is already active.
     * Stopping resets all heart positions via ResetAllHeartsPosition.
     * @param {boolean} enabled
     */
    function SetHealingWaveEnabled(enabled) {
        if (enabled) {
            if (state.healingWaveActive) {
                return
            }
            if (state.lowHealthJiggleActive) {
                return
            }
            state.healingWaveActive = true;
            state.healingWaveCurrentIndex = 0;
            ResetAllHeartsPosition();
            HealingWaveTick()
        } else {
            if (!state.healingWaveActive) {
                return
            }
            state.healingWaveActive = false;
            if (state.healingWaveTimer !== null) {
                $.CancelScheduled(state.healingWaveTimer);
                state.healingWaveTimer = null
            }
            ResetAllHeartsPosition()
        }
    }

    // ─── HEART CAPACITY ──────────────────────────────────────────────────────
    // EnsureMinecraftHeartsCapacity, EnsureBarrierHeartsCapacity

    /**
     * Ensures the MinecraftHearts container has at least `heartsNeeded` heart slots
     * built and cached. Rebuilds from scratch when the required count or row count
     * changes. Each slot contains four layered images: container background, healing
     * overlay (green), deferred-damage overlay (orange), and the fill (red/poisoned).
     * Also resets all render-diff state after a rebuild so the next tick does a full
     * DOM update.
     * @param {object} rootPanel
     * @param {number} heartsNeeded
     * @returns {boolean}  false if the container panel could not be found.
     */
    function EnsureMinecraftHeartsCapacity(rootPanel, heartsNeeded) {
        if (heartsNeeded <= 0) {
            return false
        }
        if (!state.cachedHeartsContainer) {
            state.cachedHeartsContainer = rootPanel.FindChildTraverse(PANELS.MINECRAFT_HEARTS);
            if (!state.cachedHeartsContainer) {
                $.Msg("[HealthParser] MinecraftHearts container not found");
                return false
            }
        }
        const heartsNeededRowCount = Math.ceil(heartsNeeded / CONFIG.HEARTS_PER_ROW);
        if (state.minecraftHeartsCapacity >= heartsNeeded && state.minecraftHeartSlots.length >= state.minecraftHeartsCapacity && state.minecraftHeartsRowCount === heartsNeededRowCount) {
            return true
        }
        state.cachedHeartsContainer.RemoveAndDeleteChildren();
        state.minecraftHeartSlots = [];
        state.minecraftHeartContainerImages = [];
        state.minecraftHeartHealingImages = [];
        state.minecraftHeartDeferredImages = [];
        state.minecraftHeartFillImages = [];
        state.minecraftHeartsCapacity = heartsNeeded;
        state.lastVisibleHeartsCount = 0;

        // Reset render-diff cache so the next tick forces a full DOM update
        state.lastIsBlinkOn = null;
        state.lastContainerHeartsNeeded = -1;
        state.lastContainerLastSlotIsHalf = null;
        state.lastFillFullHearts = -1;
        state.lastFillHasHalf = null;
        state.lastFillAfflicted = null;
        state.lastDeferredFullHearts = -1;
        state.lastDeferredHasHalf = null;
        state.lastDeferredStartSlots = -1;
        state.lastHealingFullHearts = -1;
        state.lastHealingHasHalf = null;
        state.lastHealingStartSlots = -1;

        let currentRow = null;
        let heartsInCurrentRow = 0;
        const rowPanels = [];

        function ensureRow() {
            if (currentRow === null || heartsInCurrentRow >= CONFIG.HEARTS_PER_ROW) {
                currentRow = $.CreatePanel("Panel", state.cachedHeartsContainer, "");
                currentRow.AddClass("HeartsRow");
                const firstChild = state.cachedHeartsContainer.GetChild(0);
                if (firstChild && firstChild !== currentRow) {
                    state.cachedHeartsContainer.MoveChildBefore(currentRow, firstChild)
                }
                rowPanels.push(currentRow);
                heartsInCurrentRow = 0
            }
        }
        for (let i = 0; i < heartsNeeded; i += 1) {
            ensureRow();
            const slot = $.CreatePanel("Panel", currentRow, "");
            slot.AddClass("HeartSlot");
            const containerImg = $.CreatePanel("Image", slot, "");
            containerImg.AddClass("HeartContainer");
            containerImg.SetImage("s2r://panorama/images/minecraft/container_8x.vtex");
            const healingImg = $.CreatePanel("Image", slot, "");
            healingImg.AddClass("HeartHealing");
            healingImg.style.visibility = "collapse";
            const frozenImg = $.CreatePanel("Image", slot, "");
            frozenImg.AddClass("HeartDeferred");
            frozenImg.style.visibility = "collapse";
            const fillImg = $.CreatePanel("Image", slot, "");
            fillImg.AddClass("HeartFill");
            fillImg.style.visibility = "collapse";
            state.minecraftHeartSlots.push(slot);
            state.minecraftHeartContainerImages.push(containerImg);
            state.minecraftHeartHealingImages.push(healingImg);
            state.minecraftHeartDeferredImages.push(frozenImg);
            state.minecraftHeartFillImages.push(fillImg);
            heartsInCurrentRow += 1
        }

        state.minecraftHeartsRowCount = rowPanels.length;

        // When rows exceed MAX_HEART_ROWS, compress them vertically with negative margin top values
        if (rowPanels.length > CONFIG.MAX_HEART_ROWS) {
            const marginTop = ((CONFIG.MAX_HEART_ROWS * CONFIG.HEART_ROW_HEIGHT_PX) / rowPanels.length) - CONFIG.HEART_ROW_HEIGHT_PX;
            for (let i = 0; i < rowPanels.length - 1; i += 1) {
                rowPanels[i].style.marginTop = marginTop + "px";
            }
        }

        return true
    }

    /**
     * Ensures the MinecraftBarrierHearts container has exactly `heartsNeeded` heart slots.
     * Rebuilds from scratch whenever the count changes. Barrier hearts use only two image
     * layers: container background and fill (absorption/yellow).
     * @param {object} rootPanel
     * @param {number} heartsNeeded
     * @returns {boolean}  false if either barrier panel could not be found.
     */
    function EnsureBarrierHeartsCapacity(rootPanel, heartsNeeded) {
        if (heartsNeeded <= 0) {
            return false
        }
        if (!state.cachedBarrierHeartsContainer) {
            state.cachedBarrierHeartsContainer = rootPanel.FindChildTraverse(PANELS.MINECRAFT_BARRIER_CONTAINER);
            if (!state.cachedBarrierHeartsContainer) {
                $.Msg("[HealthParser] MinecraftBarrierHeartsContainer not found");
                return false
            }
        }
        if (!state.cachedBarrierHearts) {
            state.cachedBarrierHearts = rootPanel.FindChildTraverse(PANELS.MINECRAFT_BARRIER_HEARTS);
            if (!state.cachedBarrierHearts) {
                $.Msg("[HealthParser] MinecraftBarrierHearts not found");
                return false
            }
        }
        if (state.barrierHeartsCapacity === heartsNeeded && state.barrierHeartsPanels.length === state.barrierHeartsCapacity) {
            return true
        }
        state.cachedBarrierHearts.RemoveAndDeleteChildren();
        state.barrierHeartsPanels = [];
        state.barrierHeartContainerImages = [];
        state.barrierHeartFillImages = [];
        state.barrierHeartsCapacity = heartsNeeded;
        let currentRow = null;
        let heartsInCurrentRow = 0;

        function ensureRow() {
            if (currentRow === null || heartsInCurrentRow >= CONFIG.HEARTS_PER_ROW) {
                currentRow = $.CreatePanel("Panel", state.cachedBarrierHearts, "");
                currentRow.AddClass("HeartsRow");
                const firstChild = state.cachedBarrierHearts.GetChild(0);
                if (firstChild && firstChild !== currentRow) {
                    state.cachedBarrierHearts.MoveChildBefore(currentRow, firstChild)
                }
                heartsInCurrentRow = 0
            }
        }
        for (let i = 0; i < heartsNeeded; i += 1) {
            ensureRow();
            const slot = $.CreatePanel("Panel", currentRow, "");
            slot.AddClass("HeartSlot");
            const containerImg = $.CreatePanel("Image", slot, "");
            containerImg.AddClass("HeartContainer");
            containerImg.SetImage("s2r://panorama/images/minecraft/container_8x.vtex");
            const fillImg = $.CreatePanel("Image", slot, "");
            fillImg.AddClass("HeartFill");
            fillImg.style.visibility = "collapse";
            state.barrierHeartsPanels.push(slot);
            state.barrierHeartContainerImages.push(containerImg);
            state.barrierHeartFillImages.push(fillImg);
            heartsInCurrentRow += 1
        }
        return true
    }

    // ─── HEART RENDERING ─────────────────────────────────────────────────────
    // UpdateMinecraftHearts, UpdateDeferredHearts, UpdateHealingHearts,
    // UpdateBarrierHearts

    /**
     * Updates the main (red/poisoned) heart fill images and container background images
     * to reflect the player's current true HP and total HP.
     * Skips the container loop when blink state and layout are unchanged.
     * Skips the fill loop when fill count, half-heart state, and affliction are unchanged.
     * @param {number}  currentHealth  True current HP (after subtracting deferred damage).
     * @param {number}  totalHealth    Maximum HP.
     * @param {boolean} afflicted      When true, uses poisoned (green) textures.
     */
    function UpdateMinecraftHearts(currentHealth, totalHealth, afflicted) {
        try {
            const rootPanel = $.GetContextPanel();
            if (!rootPanel) {
                return
            }
            const isBlinkOn = state.heartsBlinking && (state.heartsBlinkPhase % 2 === 0);
            const totalHalfSegments = Math.max(0, Math.ceil(totalHealth / CONFIG.HP_PER_HALF_SEGMENT));
            const heartsNeeded = Math.max(1, Math.ceil(totalHalfSegments / 2));
            let currentHalfSegments = Math.ceil(currentHealth / CONFIG.HP_PER_HALF_SEGMENT);
            if (currentHalfSegments < 0) {
                currentHalfSegments = 0
            }
            if (currentHalfSegments > totalHalfSegments) {
                currentHalfSegments = totalHalfSegments
            }
            const fullHearts = Math.floor(currentHalfSegments / 2);
            const hasHalfHeart = (currentHalfSegments % 2) === 1;
            if (!EnsureMinecraftHeartsCapacity(rootPanel, heartsNeeded)) {
                return
            }
            const lastSlotIsHalf = (totalHalfSegments % 2) === 1;

            // Container images and slot visibility: only update when blink state or layout changes
            if (isBlinkOn !== state.lastIsBlinkOn || heartsNeeded !== state.lastContainerHeartsNeeded || lastSlotIsHalf !== state.lastContainerLastSlotIsHalf) {
                state.lastIsBlinkOn = isBlinkOn;
                state.lastContainerHeartsNeeded = heartsNeeded;
                state.lastContainerLastSlotIsHalf = lastSlotIsHalf;
                for (let i = 0; i < state.minecraftHeartSlots.length; i += 1) {
                    const slot = state.minecraftHeartSlots[i];
                    const container = state.minecraftHeartContainerImages[i];
                    if (i >= heartsNeeded) {
                        slot.style.visibility = "collapse";
                        continue
                    }
                    slot.style.visibility = "visible";
                    const isLastSlot = lastSlotIsHalf && (i === heartsNeeded - 1);
                    if (isLastSlot) {
                        container.SetImage(isBlinkOn ? "s2r://panorama/images/minecraft/container_blinking_half_8x.vtex" : "s2r://panorama/images/minecraft/container_half_8x.vtex")
                    } else {
                        container.SetImage(isBlinkOn ? "s2r://panorama/images/minecraft/container_blinking_8x.vtex" : "s2r://panorama/images/minecraft/container_8x.vtex")
                    }
                }
            }

            // Fill images: only update when fill state changes
            if (fullHearts !== state.lastFillFullHearts || hasHalfHeart !== state.lastFillHasHalf || afflicted !== state.lastFillAfflicted) {
                state.lastFillFullHearts = fullHearts;
                state.lastFillHasHalf = hasHalfHeart;
                state.lastFillAfflicted = afflicted;
                const texturePrefix = afflicted ? "poisoned_" : "";
                for (let i = 0; i < state.minecraftHeartFillImages.length; i += 1) {
                    const fill = state.minecraftHeartFillImages[i];
                    fill.RemoveClass("full");
                    fill.RemoveClass("half");
                    fill.RemoveClass("empty");
                    if (i < fullHearts) {
                        fill.AddClass("full");
                        fill.style.visibility = "visible";
                        fill.SetImage("s2r://panorama/images/minecraft/" + texturePrefix + "full_8x.vtex")
                    } else if (i === fullHearts && hasHalfHeart) {
                        fill.AddClass("half");
                        fill.style.visibility = "visible";
                        fill.SetImage("s2r://panorama/images/minecraft/" + texturePrefix + "half_8x.vtex")
                    } else {
                        fill.AddClass("empty");
                        fill.style.visibility = "collapse"
                    }
                }
            }

            state.lastVisibleHeartsCount = heartsNeeded
        } catch (error) {
            $.Msg("[HealthParser] Error updating Minecraft hearts: " + error)
        }
    }

    /**
     * Updates the orange deferred-damage overlay hearts.
     * Deferred hearts span from trueCurrentHealth up to trueCurrentHealth + deferredDamage,
     * showing HP that is "pending" removal by the damage flash bar.
     * Skips all DOM writes when the computed heart count is unchanged.
     * @param {number} trueCurrentHealth  HP after deferred damage is subtracted.
     * @param {number} deferredDamage     HP currently in the pending-damage zone.
     * @param {number} totalHealth        Maximum HP.
     */
    function UpdateDeferredHearts(trueCurrentHealth, deferredDamage, totalHealth) {
        try {
            if (state.minecraftHeartDeferredImages.length === 0) {
                return
            }
            const totalHalfSegments = Math.max(0, Math.ceil(totalHealth / CONFIG.HP_PER_HALF_SEGMENT));
            const trueHalfSegs = Math.ceil(trueCurrentHealth / CONFIG.HP_PER_HALF_SEGMENT);
            const deferredHalfSegs = deferredDamage > 0 ? Math.ceil(deferredDamage / CONFIG.HP_PER_HALF_SEGMENT) : 0;
            let orangeHalfSegments = trueHalfSegs + deferredHalfSegs;
            if (orangeHalfSegments < 0) {
                orangeHalfSegments = 0
            }
            if (orangeHalfSegments > totalHalfSegments) {
                orangeHalfSegments = totalHalfSegments
            }
            const fullHearts = Math.floor(orangeHalfSegments / 2);
            const hasHalfHeart = (orangeHalfSegments % 2) === 1;
            // Slots below fillFullSlots are completely covered by the fill layer, so we collapse them.
            const fillFullSlots = Math.floor(Math.ceil(trueCurrentHealth / CONFIG.HP_PER_HALF_SEGMENT) / 2);
            if (fullHearts === state.lastDeferredFullHearts && hasHalfHeart === state.lastDeferredHasHalf && fillFullSlots === state.lastDeferredStartSlots) {
                return
            }
            state.lastDeferredFullHearts = fullHearts;
            state.lastDeferredHasHalf = hasHalfHeart;
            state.lastDeferredStartSlots = fillFullSlots;
            for (let i = 0; i < state.minecraftHeartDeferredImages.length; i += 1) {
                const deferred = state.minecraftHeartDeferredImages[i];
                if (i < fillFullSlots) {
                    deferred.style.visibility = "collapse";
                    continue
                }
                deferred.RemoveClass("full");
                deferred.RemoveClass("half");
                deferred.RemoveClass("empty");
                if (i < fullHearts) {
                    deferred.AddClass("full");
                    deferred.style.visibility = "visible";
                    deferred.SetImage("s2r://panorama/images/minecraft/orange_full_8x.vtex")
                } else if (i === fullHearts && hasHalfHeart) {
                    deferred.AddClass("half");
                    deferred.style.visibility = "visible";
                    deferred.SetImage("s2r://panorama/images/minecraft/orange_half_8x.vtex")
                } else {
                    deferred.AddClass("empty");
                    deferred.style.visibility = "collapse"
                }
            }
        } catch (error) {
            $.Msg("[HealthParser] Error updating deferred hearts: " + error)
        }
    }

    /**
     * Updates the green incoming-heal overlay hearts.
     * Healing hearts represent HP that will be restored by the pending-heal bar,
     * displayed on top of the current fill so the player can see how much they will recover.
     * Only renders in slots above currentHealth; slots below are covered by fill or deferred.
     * Skips all DOM writes when the computed heart count is unchanged.
     * @param {number} currentHealth  Current HP (upper bound of the fill + deferred range).
     * @param {number} healingHealth  Projected HP after incoming heal is applied.
     * @param {number} totalHealth    Maximum HP.
     */
    function UpdateHealingHearts(currentHealth, healingHealth, totalHealth) {
        try {
            if (state.minecraftHeartHealingImages.length === 0) {
                return
            }
            const totalHalfSegments = Math.max(0, Math.ceil(totalHealth / CONFIG.HP_PER_HALF_SEGMENT));
            let healingHalfSegments = Math.ceil(healingHealth / CONFIG.HP_PER_HALF_SEGMENT);
            if (healingHalfSegments < 0) {
                healingHalfSegments = 0
            }
            if (healingHalfSegments > totalHalfSegments) {
                healingHalfSegments = totalHalfSegments
            }
            const fullHearts = Math.floor(healingHalfSegments / 2);
            const hasHalfHeart = (healingHalfSegments % 2) === 1;
            // Slots below healingStartSlots are covered by fill or deferred, so we collapse them.
            const healingStartSlots = Math.floor(Math.ceil(currentHealth / CONFIG.HP_PER_HALF_SEGMENT) / 2);
            if (fullHearts === state.lastHealingFullHearts && hasHalfHeart === state.lastHealingHasHalf && healingStartSlots === state.lastHealingStartSlots) {
                return
            }
            state.lastHealingFullHearts = fullHearts;
            state.lastHealingHasHalf = hasHalfHeart;
            state.lastHealingStartSlots = healingStartSlots;
            for (let i = 0; i < state.minecraftHeartHealingImages.length; i += 1) {
                const healing = state.minecraftHeartHealingImages[i];
                if (i < healingStartSlots) {
                    healing.style.visibility = "collapse";
                    continue
                }
                healing.RemoveClass("full");
                healing.RemoveClass("half");
                healing.RemoveClass("empty");
                if (i < fullHearts) {
                    healing.AddClass("full");
                    healing.style.visibility = "visible";
                    healing.SetImage("s2r://panorama/images/minecraft/green_full_8x.vtex")
                } else if (i === fullHearts && hasHalfHeart) {
                    healing.AddClass("half");
                    healing.style.visibility = "visible";
                    healing.SetImage("s2r://panorama/images/minecraft/green_half_8x.vtex")
                } else {
                    healing.AddClass("empty");
                    healing.style.visibility = "collapse"
                }
            }
        } catch (error) {
            $.Msg("[HealthParser] Error updating healing hearts: " + error)
        }
    }

    /**
     * Updates the yellow absorption (bullet barrier) hearts.
     * Hides the barrier container entirely when hasBarrier is false.
     * @param {number}  currentBarrier   Current barrier HP.
     * @param {number}  totalBarrier     Maximum barrier HP.
     * @param {boolean} hasBarrier Whether the player currently has a bullet barrier.
     */
    function UpdateBarrierHearts(currentBarrier, totalBarrier, hasBarrier) {
        try {
            const rootPanel = $.GetContextPanel();
            if (!rootPanel) {
                return
            }
            if (!hasBarrier) {
                if (state.cachedBarrierHeartsContainer) {
                    state.cachedBarrierHeartsContainer.style.visibility = "collapse"
                }
                return
            }
            const totalHalfSegments = Math.ceil(totalBarrier / CONFIG.HP_PER_HALF_SEGMENT);
            const heartsNeeded = Math.ceil(totalHalfSegments / 2);
            if (!EnsureBarrierHeartsCapacity(rootPanel, heartsNeeded)) {
                return
            }
            state.cachedBarrierHeartsContainer.style.visibility = "visible";
            const lastSlotIsHalf = (totalHalfSegments % 2) === 1;
            const currentHalfSegments = Math.ceil(currentBarrier / CONFIG.HP_PER_HALF_SEGMENT);
            const fullHearts = Math.floor(currentHalfSegments / 2);
            const hasHalfHeart = (currentHalfSegments % 2) === 1;
            for (let i = 0; i < state.barrierHeartsPanels.length; i += 1) {
                const container = state.barrierHeartContainerImages[i];
                const fill = state.barrierHeartFillImages[i];
                const isLastSlot = lastSlotIsHalf && (i === heartsNeeded - 1);
                container.SetImage(isLastSlot
                    ? "s2r://panorama/images/minecraft/container_half_8x.vtex"
                    : "s2r://panorama/images/minecraft/container_8x.vtex");
                fill.RemoveClass("full");
                fill.RemoveClass("half");
                fill.RemoveClass("empty");
                if (i < fullHearts) {
                    fill.AddClass("full");
                    fill.style.visibility = "visible";
                    fill.SetImage("s2r://panorama/images/minecraft/absorption_full_8x.vtex")
                } else if (i === fullHearts && hasHalfHeart) {
                    fill.AddClass("half");
                    fill.style.visibility = "visible";
                    fill.SetImage("s2r://panorama/images/minecraft/absorption_half_8x.vtex")
                } else {
                    fill.AddClass("empty");
                    fill.style.visibility = "collapse"
                }
            }
        } catch (error) {
            $.Msg("[HealthParser] Error updating barrier hearts: " + error)
        }
    }

    // ─── HEALTH BAR PARSING ──────────────────────────────────────────────────
    // ParseDeferredDamage, ParseIncomingHeal, ReadHealthValues, ComputeHealthState

    /**
     * Reads the pixel height of the pending-damage bar element and converts it
     * to a fraction of total HP (0–1). Returns 0 if the panel is not found.
     * @param {object} rootPanel
     * @returns {number}
     */
    function ParseDeferredDamage(rootPanel) {
        try {
            const damageBar = rootPanel.FindChildTraverse(PANELS.PENDING_DAMAGE);
            if (!damageBar) {
                return 0
            }
            const heightStr = damageBar.style && damageBar.style.height ? damageBar.style.height.toString() : "";
            const heightValue = parseFloat(heightStr) || 0;
            return heightValue / CONFIG.HEALTH_BAR_PIXEL_HEIGHT * CONFIG.HEALTH_BAR_SCALE;
        } catch (e) {
            $.Msg("[HealthParser] Error in ParseDeferredDamage: " + e);
            return 0
        }
    }

    /**
     * Reads the pixel height of the pending-heal bar element and converts it
     * to a fraction of total HP (0–1). Returns 0 if the panel is not found.
     * @param {object} rootPanel
     * @returns {number}
     */
    function ParseIncomingHeal(rootPanel) {
        try {
            const healBar = rootPanel.FindChildTraverse(PANELS.PENDING_HEAL);
            if (!healBar) {
                return 0
            }
            const heightStr = healBar.style && healBar.style.height ? healBar.style.height.toString() : "";
            const heightValue = parseFloat(heightStr) || 0;
            return (heightValue / CONFIG.HEALTH_BAR_PIXEL_HEIGHT) * CONFIG.HEALTH_BAR_SCALE
        } catch (e) {
            $.Msg("[HealthParser] Error in ParseIncomingHeal: " + e);
            return 0
        }
    }

    /**
     * Reads current and total health from the hidden original health bar labels.
     * @param {object} rootPanel
     * @returns {{ currentHealth: number, totalHealth: number } | null}
     *   null if the required labels cannot be found.
     */
    function ReadHealthValues(rootPanel) {
        let healthContainer = rootPanel.FindChildTraverse(PANELS.HEALTH_CONTAINER);
        if (!healthContainer) {
            const allPanels = rootPanel.FindChildrenWithClassTraverse(PANELS.HEALTH_CONTAINER);
            if (allPanels && allPanels.length > 0) {
                healthContainer = allPanels[0]
            } else {
                $.Msg("[HealthParser] Health container panel not found");
                return null
            }
        }
        let currentHealthLabel = healthContainer.FindChildTraverse(PANELS.CURRENT_HEALTH_LABEL);
        if (!currentHealthLabel) {
            const labels = healthContainer.FindChildrenWithClassTraverse(PANELS.CURRENT_HEALTH_LABEL);
            if (labels && labels.length > 0) {
                currentHealthLabel = labels[0]
            } else {
                $.Msg("[HealthParser] Current health label not found");
                return null
            }
        }
        let totalHealthLabel = healthContainer.FindChildTraverse(PANELS.TOTAL_HEALTH_LABEL);
        if (!totalHealthLabel) {
            const labels = healthContainer.FindChildrenWithClassTraverse(PANELS.TOTAL_HEALTH_LABEL);
            if (labels && labels.length > 0) {
                totalHealthLabel = labels[0]
            } else {
                $.Msg("[HealthParser] Total health label not found");
                return null
            }
        }
        const currentHealth = parseInt(currentHealthLabel.text.replace(/[^0-9]/g, "")) || 0;
        const totalHealth = parseInt(totalHealthLabel.text.replace(/[^0-9]/g, "")) || 0;
        return { currentHealth, totalHealth }
    }

    /**
     * Derives all health values needed for rendering from raw currentHealth and totalHealth.
     * - deferredDamage: HP currently in the pending-damage zone, displayed as orange hearts.
     * - trueCurrentHealth: currentHealth minus deferred damage, displayed as red hearts.
     * - healingHealth: currentHealth plus pending incoming healing, displayed as green hearts.
     * - currentHalfSegments: half-heart count of trueCurrentHealth, used for the low-health threshold.
     * - effectiveHalfSegments: half-heart count of currentHealth including deferred, used for blink detection.
     * @param {number} currentHealth
     * @param {number} totalHealth
     * @param {Panel}  rootPanel
     * @returns {{ deferredDamage, trueCurrentHealth, healingHealth, currentHalfSegments, effectiveHalfSegments, hasIncomingHeal }}
     */
    function ComputeHealthState(currentHealth, totalHealth, rootPanel) {
        const deferredFraction = ParseDeferredDamage(rootPanel);
        const deferredDamage = Math.round(deferredFraction * totalHealth);
        const trueCurrentHealth = Math.max(0, currentHealth - deferredDamage);
        const incomingHealFraction = ParseIncomingHeal(rootPanel);
        const incomingHealAmount = Math.round(incomingHealFraction * totalHealth);
        const healingHealth = Math.min(totalHealth, currentHealth + incomingHealAmount);
        const currentHalfSegments = Math.ceil(trueCurrentHealth / CONFIG.HP_PER_HALF_SEGMENT);
        const effectiveHalfSegments = Math.ceil(currentHealth / CONFIG.HP_PER_HALF_SEGMENT);
        const hasIncomingHeal = incomingHealAmount > 0;
        return { deferredDamage, trueCurrentHealth, healingHealth, currentHalfSegments, effectiveHalfSegments, hasIncomingHeal }
    }

    // ─── FOOD & HUNGER ───────────────────────────────────────────────────────
    // ParseChargesForHunger, UpdateMinecraftFood

    /**
     * Reads the ability charge UI to derive a hunger percentage (0–100).
     * Each charge arc's fill angle is divided by CHARGE_MAX_ANGLES[maxCharges] to get
     * a 0–1 value per charge; these are averaged across all active charges.
     * Returns null when the charges_container panel is absent or has no active charges.
     * @returns {{ percent: number, chargesFilled: number, maxCharges: number } | null}
     */
    function ParseChargesForHunger() {
        try {
            if (!state.cachedUIRootPanel) {
                const rootPanel = $.GetContextPanel();
                if (!rootPanel) {
                    return null
                }
                state.cachedUIRootPanel = rootPanel;
                while (state.cachedUIRootPanel.GetParent()) {
                    state.cachedUIRootPanel = state.cachedUIRootPanel.GetParent()
                }
            }
            const chargesContainer = state.cachedUIRootPanel.FindChildTraverse(PANELS.CHARGES_CONTAINER);
            if (!chargesContainer) {
                return null
            }
            const allCharges = chargesContainer.FindChildrenWithClassTraverse("charge");
            if (!allCharges || allCharges.length === 0) {
                return null
            }
            let maxCharges = 0;
            let activeCharges = [];
            for (let i = 0; i < allCharges.length; i += 1) {
                const charge = allCharges[i];
                if (charge.BHasClass("has_charge")) {
                    maxCharges += 1;
                    activeCharges.push(charge)
                }
            }
            if (maxCharges === 0) {
                return null
            }
            const maxAngle = CHARGE_MAX_ANGLES[maxCharges] || 26;
            let totalChargeValue = 0;
            for (let i = 0; i < activeCharges.length; i += 1) {
                const charge = activeCharges[i];
                const chargeFgElements = charge.FindChildrenWithClassTraverse("charge_fg");
                if (!chargeFgElements || chargeFgElements.length === 0) {
                    continue
                }
                const chargeFg = chargeFgElements[0];
                if (chargeFg.BHasClass("finished")) {
                    totalChargeValue += 1.0
                } else {
                    const clipStyle = chargeFg.style && chargeFg.style.clip ? chargeFg.style.clip.toString() : "";
                    const match = clipStyle.match(/radial\([^,]+,[^,]+,\s*([\d.]+)deg\s*\)/);
                    if (match) {
                        const extentAngle = parseFloat(match[1]) || 0;
                        const chargePercent = Math.min(extentAngle / maxAngle, 1.0);
                        totalChargeValue += chargePercent
                    }
                }
            }
            const hungerPercent = Math.round((totalChargeValue / maxCharges) * 100);
            return {
                percent: hungerPercent,
                chargesFilled: totalChargeValue,
                maxCharges: maxCharges
            }
        } catch (e) {
            $.Msg("[HealthParser] Error in ParseChargesForHunger: " + e);
            return null
        }
    }

    /**
     * Updates the 10 food icons in MinecraftFoodContainer based on a 0–100 hunger percent.
     * Icons are filled right-to-left (rightmost = hungriest). Each icon can be full,
     * half, or empty. FOOD_PERCENT_PER_HALF percent of hunger = one half-icon.
     * @param {number} hungerPercent  0 = empty, 100 = full.
     */
    function UpdateMinecraftFood(hungerPercent) {
        try {
            const rootPanel = $.GetContextPanel();
            if (!rootPanel) {
                return
            }
            if (!state.cachedFoodContainer) {
                state.cachedFoodContainer = rootPanel.FindChildTraverse(PANELS.MINECRAFT_FOOD);
                if (!state.cachedFoodContainer) {
                    $.Msg("[HealthParser] MinecraftFoodContainer not found");
                    return
                }
                const children = state.cachedFoodContainer.Children();
                state.cachedFoodIcons = [];
                for (let i = 0; i < children.length; i += 1) {
                    if (children[i].BHasClass("FoodIcon")) {
                        state.cachedFoodIcons.push(children[i])
                    }
                }
            }
            if (state.cachedFoodIcons.length === 0) {
                return
            }
            if (hungerPercent < 0) {
                hungerPercent = 0
            }
            if (hungerPercent > 100) {
                hungerPercent = 100
            }
            const totalHalfSegments = Math.round(hungerPercent / CONFIG.FOOD_PERCENT_PER_HALF);
            const fullIcons = Math.floor(totalHalfSegments / 2);
            const hasHalfIcon = (totalHalfSegments % 2) === 1;
            const iconCount = state.cachedFoodIcons.length;
            for (let i = 0; i < iconCount; i += 1) {
                const icon = state.cachedFoodIcons[i];
                const reverseIndex = iconCount - 1 - i;
                if (reverseIndex < fullIcons) {
                    icon.SetImage("s2r://panorama/images/minecraft/food_8x.vtex")
                } else if (reverseIndex === fullIcons && hasHalfIcon) {
                    icon.SetImage("s2r://panorama/images/minecraft/food_half_8x.vtex")
                } else {
                    icon.SetImage("s2r://panorama/images/minecraft/food_empty_8x.vtex")
                }
            }
        } catch (e) {
            $.Msg("[HealthParser] Error in UpdateMinecraftFood: " + e)
        }
    }

    // ─── XP & SOULS ──────────────────────────────────────────────────────────
    // ParseSoulsAndLevel

    /**
     * Reads the SoulsFill bar height and PlayerLevelNumber label from the game HUD,
     * then mirrors them to the Minecraft XP bar fill clip rect and level label.
     * Uses cachedUIRootPanel (populated on first call) to avoid repeated root traversals.
     */
    function ParseSoulsAndLevel() {
        try {
            if (!state.cachedUIRootPanel) {
                const rootPanel = $.GetContextPanel();
                if (!rootPanel) {
                    return
                }
                state.cachedUIRootPanel = rootPanel;
                while (state.cachedUIRootPanel.GetParent()) {
                    state.cachedUIRootPanel = state.cachedUIRootPanel.GetParent()
                }
            }
            const playerLevelContainer = state.cachedUIRootPanel.FindChildTraverse(PANELS.GOLD_AP_CONTAINER);
            if (!playerLevelContainer) {
                $.Msg("[HealthParser] gold_and_ap_container not found");
                return
            }
            const soulsFill = playerLevelContainer.FindChildTraverse(PANELS.SOULS_FILL);
            if (soulsFill) {
                const heightStr = soulsFill.style && soulsFill.style.height ? soulsFill.style.height.toString() : "";
                const heightValue = parseFloat(heightStr) || 0;
                let percent = CONFIG.SOULS_BAR_MAX_HEIGHT_PX > 0 ? Math.round((heightValue / CONFIG.SOULS_BAR_MAX_HEIGHT_PX) * 100) : 0;
                if (percent < 0) {
                    percent = 0
                } else if (percent > 100) {
                    percent = 100
                }
                const xpBarFill = state.cachedUIRootPanel.FindChildTraverse(PANELS.MINECRAFT_XP_FILL);
                if (xpBarFill && xpBarFill.style) {
                    xpBarFill.style.clip = "rect( 0px, " + percent + "%, " + 100 + "%, 0px )"
                }
            } else {
                $.Msg("[HealthParser] SoulsFill panel not found")
            }
            const levelLabel = playerLevelContainer.FindChildTraverse(PANELS.PLAYER_LEVEL);
            if (levelLabel) {
                const levelText = levelLabel.text || "";
                const levelValue = parseInt(levelText.replace(/[^0-9]/g, "")) || 0;
                const xpLevelLabel = state.cachedUIRootPanel.FindChildTraverse(PANELS.MINECRAFT_XP_LEVEL);
                if (xpLevelLabel) {
                    xpLevelLabel.text = levelValue.toString()
                }
            } else {
                $.Msg("[HealthParser] PlayerLevelNumber label not found")
            }
        } catch (error) {
            $.Msg("[HealthParser] Error parsing souls/level: " + error)
        }
    }

    // ─── MAIN LOOP ───────────────────────────────────────────────────────────
    // UpdateAnimationState, UpdateTotem, UpdateBulletBarrier,
    // ParseHealthValues, StartHealthParsing, StopHealthParsing

    /**
     * Drives the blink, low-health jiggle, and healing-wave animations each tick.
     * - Blink fires whenever effectiveHalfSegments changes (any HP change).
     * - Jiggle plays when trueCurrentHealth ≤ LOW_HEALTH_HALF_SEGMENTS half-segments.
     * - Healing wave plays when there is pending incoming healing and the player is not at low health.
     * @param {number}  currentHalfSegments   Half-heart count of true HP (after deferred subtraction).
     * @param {number}  effectiveHalfSegments  Half-heart count of HP including deferred.
     * @param {boolean} hasIncomingHeal        Whether the pending-heal bar is non-zero.
     */
    function UpdateAnimationState(currentHalfSegments, effectiveHalfSegments, hasIncomingHeal) {
        if (state.lastBlinkHalfSegments !== null && effectiveHalfSegments !== state.lastBlinkHalfSegments) {
            StartHeartsBlink()
        }
        state.lastBlinkHalfSegments = effectiveHalfSegments;
        const isLowHealth = currentHalfSegments <= CONFIG.LOW_HEALTH_HALF_SEGMENTS;
        SetLowHealthJiggleEnabled(isLowHealth);
        SetHealingWaveEnabled(!isLowHealth && hasIncomingHeal)
    }

    /**
     * Shows or hides the Totem of Undying icon based on whether the player
     * has the Rejuvenator buff (indicated by the HasRejuvenator CSS class on hud_health_bars).
     */
    function UpdateTotem() {
        if (!state.cachedTotemContainer) return;
        const hasRejuvenator = state.cachedHudHealthBars ? state.cachedHudHealthBars.BHasClass("HasRejuvenator") : false;
        state.cachedTotemContainer.style.visibility = hasRejuvenator ? "visible" : "collapse"
    }

    /**
     * Reads bullet barrier current/max values from the HUD and updates barrier hearts.
     * Barrier presence is detected via the HasBulletShield CSS class on HudShieldsContainer.
     * @param {object} rootPanel
     * @returns {{ hasBarrier: boolean, bulletBarrierCurrent: number, bulletBarrierMax: number }}
     */
    function UpdateBulletBarrier(rootPanel) {
        let hasBarrier = false;
        let bulletBarrierCurrent = 0;
        let bulletBarrierMax = 0;
        if (state.cachedBarriersContainer) {
            hasBarrier = state.cachedBarriersContainer.BHasClass("HasBulletShield")
        }
        if (hasBarrier) {
            const bulletBarrierPanel = rootPanel.FindChildTraverse(PANELS.BULLET_BARRIER_NUMBERS);
            if (bulletBarrierPanel) {
                const currentLabels = bulletBarrierPanel.FindChildrenWithClassTraverse("progress_bar_current");
                if (currentLabels && currentLabels.length > 0) {
                    bulletBarrierCurrent = parseInt(currentLabels[0].text.replace(/[^0-9]/g, "")) || 0
                }
                const maxLabels = bulletBarrierPanel.FindChildrenWithClassTraverse("progress_bar_max");
                if (maxLabels && maxLabels.length > 0) {
                    bulletBarrierMax = parseInt(maxLabels[0].text.replace(/[^0-9]/g, "")) || 0
                }
                UpdateBarrierHearts(bulletBarrierCurrent, bulletBarrierMax, true)
            } else {
                $.Msg("[HealthParser] BulletBarrierNumbers panel not found");
                UpdateBarrierHearts(0, 0, false)
            }
        } else {
            UpdateBarrierHearts(0, 0, false)
        }
        return { hasBarrier, bulletBarrierCurrent, bulletBarrierMax }
    }

    /**
     * Main tick function. Runs every TICK_INTERVAL_S to read game state and update
     * all Minecraft UI elements: hearts, barrier hearts, food bar, XP bar, and totem icon.
     * One-time panel lookups are cached on the first tick to avoid repeated traversals.
     * @returns {{ current, total, percentage, hasBarrier, bulletBarrier } | undefined}
     */
    function ParseHealthValues() {
        try {
            const rootPanel = $.GetContextPanel();
            if (!rootPanel) {
                $.Msg("[HealthParser] Root panel not found");
                return
            }

            // Cache one-time panel lookups on first tick
            if (!state.cachedHudHealthBars) state.cachedHudHealthBars = rootPanel.FindChildTraverse(PANELS.HUD_HEALTH_BARS);
            if (!state.cachedTotemContainer) state.cachedTotemContainer = rootPanel.FindChildTraverse(PANELS.MINECRAFT_TOTEM);
            if (!state.cachedBarriersContainer) {
                state.cachedBarriersContainer = rootPanel.FindChildTraverse(PANELS.HUD_BARRIERS);
                if (!state.cachedBarriersContainer) $.Msg("[HealthParser] HudBarriersContainer not found")
            }

            const healthValues = ReadHealthValues(rootPanel);
            if (!healthValues) return;
            const { currentHealth, totalHealth } = healthValues;

            const healthState = ComputeHealthState(currentHealth, totalHealth, rootPanel);
            const { deferredDamage, trueCurrentHealth, healingHealth, currentHalfSegments, effectiveHalfSegments, hasIncomingHeal } = healthState;

            UpdateAnimationState(currentHalfSegments, effectiveHalfSegments, hasIncomingHeal);

            state.isAfflicted = CheckModifierActive("AFFLICTED");
            UpdateMinecraftHearts(trueCurrentHealth, totalHealth, state.isAfflicted);
            UpdateHealingHearts(currentHealth, healingHealth, totalHealth);
            UpdateDeferredHearts(trueCurrentHealth, deferredDamage, totalHealth);
            UpdateTotem();

            const barrierData = UpdateBulletBarrier(rootPanel);

            ParseSoulsAndLevel();
            const hungerData = ParseChargesForHunger();
            if (hungerData !== null) {
                UpdateMinecraftFood(hungerData.percent)
            }

            return {
                current: currentHealth,
                total: totalHealth,
                percentage: totalHealth > 0 ? (currentHealth / totalHealth * 100).toFixed(2) : 0,
                hasBarrier: barrierData.hasBarrier,
                bulletBarrier: {
                    current: barrierData.bulletBarrierCurrent,
                    max: barrierData.bulletBarrierMax,
                    percentage: barrierData.bulletBarrierMax > 0 ? (barrierData.bulletBarrierCurrent / barrierData.bulletBarrierMax * 100).toFixed(2) : 0
                }
            }
        } catch (error) {
            $.Msg("[HealthParser] Error parsing health values: " + error)
        }
    }

    /**
     * Starts the TICK_INTERVAL_S polling loop. Logs a warning and exits early
     * if parsing is already running. Runs one immediate tick before scheduling.
     */
    function StartHealthParsing() {
        if (state.healthParseInterval !== null) {
            $.Msg("[HealthParser] Health parsing already started");
            return
        }
        $.Msg("[HealthParser] Starting health parsing...");
        ParseHealthValues();

        function scheduleNext() {
            state.healthParseInterval = $.Schedule(CONFIG.TICK_INTERVAL_S, function () {
                ParseHealthValues();
                scheduleNext()
            })
        }
        scheduleNext()
    }

    /**
     * Cancels the active polling loop started by StartHealthParsing.
     * Safe to call when parsing is not running (no-op).
     */
    function StopHealthParsing() {
        if (state.healthParseInterval !== null) {
            $.CancelScheduled(state.healthParseInterval);
            state.healthParseInterval = null;
            $.Msg("[HealthParser] Health parsing stopped")
        }
    }

    $.Schedule(CONFIG.STARTUP_DELAY_S, function () {
        StartHealthParsing()
    });

    window.ParseHealthValues = ParseHealthValues;
    window.StartHealthParsing = StartHealthParsing;
    window.StopHealthParsing = StopHealthParsing;
    window.UpdateMinecraftHearts = UpdateMinecraftHearts;
    window.UpdateBarrierHearts = UpdateBarrierHearts;
    window.ParseChargesForHunger = ParseChargesForHunger;
    window.UpdateMinecraftFood = UpdateMinecraftFood
})();

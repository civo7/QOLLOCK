// ql_feat_healthbar_mc.js — Minecraft healthbar runtime
// Extracted from ql_feat_healthbar.js, Phase 12
(function() {
    'use strict';
    var _featureId = "ql_feat_healthbar_mc";
    var Panel = (QOL.core && QOL.core.panel) ? QOL.core.panel : {};
    var State = QOL.state || (typeof globalThis !== "undefined" && globalThis.State) || {};
    var Utils = QOL.utils;
    var GetCachedPanel = QOL.getCachedPanel;
    var SetCachedPanel = QOL.setCachedPanel;
    var IsPanelValid = QOL.utils.IsPanelValid;
    var runtimeRoot = null;

    // ── Minecraft healthbar constants ──
    var MC_CHARGE_MAX_ANGLES = { 1: 90, 2: 42, 3: 26, 4: 20, 5: 15.5, 6: 13, 7: 10.86 };
    var MC_HP_PER_HALF_SEGMENT = 50;
    var MC_LOW_HEALTH_HALF_SEGMENTS = 4;
    var MC_HEARTS_PER_ROW = 10;
    var MC_MAX_HEART_ROWS = 5;
    var MC_HEART_ROW_HEIGHT_PX = 22;
    var MC_HEALTH_BAR_PIXEL_HEIGHT = 367;
    var MC_HEALTH_BAR_SCALE = 52 / 30;
    var MC_SOULS_BAR_MAX_HEIGHT_PX = 52;
    var MC_FOOD_PERCENT_PER_HALF = 5;
    var MC_TICK_INTERVAL_MS = 50;
    var MC_MODIFIER_THROTTLE_MS = 500;
    var MC_BLINK_INTERVAL_S = 0.1;
    var MC_BLINK_PHASE_COUNT = 4;
    var MC_JIGGLE_INTERVAL_S = 0.05;
    var MC_JIGGLE_CHANCE = 0.5;
    var MC_HEALING_WAVE_STEP_S = 0.05;
    var MC_HEALING_WAVE_PAUSE_S = 0.5;

    // ── Minecraft Healthbar ──

    function McResolveHudRoot(root) {
        var cached = GetCachedPanel("mcHudRoot");
        if (cached) return cached;
        var heartsRoot = root && root.FindChildTraverse ? root.FindChildTraverse("MinecraftHeartsRoot") : null;
        var panel = (heartsRoot && heartsRoot.GetParent) ? heartsRoot.GetParent() : null;
        SetCachedPanel("mcHudRoot", IsPanelValid(panel) ? panel : null);
        return GetCachedPanel("mcHudRoot");
    }

    function McResetRuntime() {
        if (State.mcHeartsBlinkTimer !== null) {
            $.CancelScheduled(State.mcHeartsBlinkTimer);
            State.mcHeartsBlinkTimer = null;
        }
        if (State.mcLowHealthJiggleTimer !== null) {
            $.CancelScheduled(State.mcLowHealthJiggleTimer);
            State.mcLowHealthJiggleTimer = null;
        }
        if (State.mcHealingWaveTimer !== null) {
            $.CancelScheduled(State.mcHealingWaveTimer);
            State.mcHealingWaveTimer = null;
        }
        State.mcHeartsBlinking = false;
        State.mcHeartsBlinkPhase = 0;
        State.mcLowHealthJiggleActive = false;
        State.mcHealingWaveActive = false;
        State.mcHealingWaveCurrentIndex = 0;
        State.mcLastBlinkHalfSegments = null;
        State.mcLastIsBlinkOn = null;
        State.mcLastContainerHeartsNeeded = -1;
        State.mcLastContainerLastSlotIsHalf = null;
        State.mcLastFillFullHearts = -1;
        State.mcLastFillHasHalf = null;
        State.mcLastFillAfflicted = null;
        State.mcLastDeferredFullHearts = -1;
        State.mcLastDeferredHasHalf = null;
        State.mcLastDeferredStartSlots = -1;
        State.mcLastHealingFullHearts = -1;
        State.mcLastHealingHasHalf = null;
        State.mcLastHealingStartSlots = -1;
        State.mcLastBarrierFullHearts = -1;
        State.mcLastBarrierHasHalf = null;
        State.mcLastBarrierLastSlotIsHalf = null;
        State.mcLastBarrierHeartsNeeded = -1;
        State.mcWasEnabled = false;
        runtimeRoot = null;
        State.mcNextUpdateMs = 0;
        State.mcHeartSlots = [];
        State.mcHeartContainerImages = [];
        State.mcHeartHealingImages = [];
        State.mcHeartDeferredImages = [];
        State.mcHeartFillImages = [];
        State.mcHeartsCapacity = 0;
        State.mcHeartsRowCount = 0;
        State.mcLastVisibleHeartsCount = 0;
        State.mcBarrierHeartsPanels = [];
        State.mcBarrierHeartContainerImages = [];
        State.mcBarrierHeartFillImages = [];
        State.mcBarrierHeartsCapacity = 0;
        // Array capacities/signatures belong to the source tree, not the next
        // match's equally sized heart grid. Clear only this variant's caches.
        ["mcHudRoot", "mcHeartsContainer", "mcHudHealthBars", "mcTotemContainer",
            "mcBarriersContainer", "mcBarrierHearts", "mcBarrierHeartsContainer",
            "mcBulletBarrierNumbers", "mcBulletBarrierCurrentLabel", "mcBulletBarrierMaxLabel",
            "mcGoldApContainer", "mcSoulsFill", "mcXpBarFill", "mcPlayerLevelLabel",
            "mcXpLevelLabel", "mcPendingDamageMiddle", "mcPendingHealMiddle"
        ].forEach(function(key) { SetCachedPanel(key, null); });
        SetCachedPanel("mcHealthPercentLabel", null);
        SetCachedPanel("mcCurrentHealthLabel", null);
        SetCachedPanel("mcTotalHealthLabel", null);
        SetCachedPanel("mcHealthRegenAndTotal", null);
        SetCachedPanel("mcNumCurrent", null);
        SetCachedPanel("mcNumTotal", null);
        SetCachedPanel("mcHealthContainer", null);
        SetCachedPanel("mcChargesContainer", null);
        SetCachedPanel("mcFoodContainer", null);
        State.mcCachedFoodIcons = [];
        State.mcLoggedHealthContainerMiss = false;
    }

    function McCanAnimate() {
        if (IsPanelValid(runtimeRoot) && !QOL.core.hud.isInHideout(runtimeRoot)) return true;
        McResetRuntime();
        return false;
    }

    function McStartHeartsBlink() {
        if (State.mcHeartsBlinkTimer !== null) {
            $.CancelScheduled(State.mcHeartsBlinkTimer);
            State.mcHeartsBlinkTimer = null;
        }
        State.mcHeartsBlinking = true;
        State.mcHeartsBlinkPhase = 0;
        function scheduleNextPhase() {
            State.mcHeartsBlinkTimer = $.Schedule(MC_BLINK_INTERVAL_S, function () {
                if (!State.mcHeartsBlinking) { State.mcHeartsBlinkTimer = null; return; }
                if (!McCanAnimate()) return;
                State.mcHeartsBlinkPhase += 1;
                if (State.mcHeartsBlinkPhase >= MC_BLINK_PHASE_COUNT) {
                    State.mcHeartsBlinking = false;
                    State.mcHeartsBlinkTimer = null;
                    return;
                }
                scheduleNextPhase();
            });
        }
        scheduleNextPhase();
    }

    function McLowHealthJiggleTick() {
        try {
            var hearts = State.mcHeartSlots;
            if (!hearts || hearts.length === 0) return;
            var visibleCount = Math.min(State.mcLastVisibleHeartsCount, hearts.length);
            for (var i = 0; i < visibleCount; i += 1) {
                var heart = hearts[i];
                if (Math.random() < MC_JIGGLE_CHANCE) {
                    if (heart.BHasClass("LoweredHeart")) heart.RemoveClass("LoweredHeart");
                    else heart.AddClass("LoweredHeart");
                }
            }
        } catch (e) { $.Msg("[QOLLock][MC] Error in McLowHealthJiggleTick: " + e); }
    }

    function McResetAllHeartsPosition() {
        try {
            if (!State.mcHeartSlots || State.mcHeartSlots.length === 0) return;
            for (var i = 0; i < State.mcHeartSlots.length; i += 1) {
                State.mcHeartSlots[i].RemoveClass("RaisedHeart");
                State.mcHeartSlots[i].RemoveClass("LoweredHeart");
            }
        } catch (e) { $.Msg("[QOLLock][MC] Error in McResetAllHeartsPosition: " + e); }
    }

    function McSetLowHealthJiggleEnabled(enabled) {
        if (enabled) {
            if (State.mcLowHealthJiggleActive) return;
            State.mcLowHealthJiggleActive = true;
            function scheduleNext() {
                State.mcLowHealthJiggleTimer = $.Schedule(MC_JIGGLE_INTERVAL_S, function () {
                    if (!State.mcLowHealthJiggleActive) { State.mcLowHealthJiggleTimer = null; return; }
                    if (!McCanAnimate()) return;
                    McLowHealthJiggleTick();
                    scheduleNext();
                });
            }
            scheduleNext();
        } else {
            if (!State.mcLowHealthJiggleActive) return;
            State.mcLowHealthJiggleActive = false;
            if (State.mcLowHealthJiggleTimer !== null) {
                $.CancelScheduled(State.mcLowHealthJiggleTimer);
                State.mcLowHealthJiggleTimer = null;
            }
            McResetAllHeartsPosition();
        }
    }

    function McHealingWaveTick() {
        if (!McCanAnimate()) return;
        try {
            var hearts = State.mcHeartSlots;
            if (!hearts || hearts.length === 0) return;
            var visibleCount = Math.min(State.mcLastVisibleHeartsCount, hearts.length);
            if (visibleCount === 0) return;
            if (State.mcHealingWaveCurrentIndex > visibleCount) State.mcHealingWaveCurrentIndex = 0;
            if (State.mcHealingWaveCurrentIndex > 0) hearts[State.mcHealingWaveCurrentIndex - 1].RemoveClass("RaisedHeart");
            if (State.mcHealingWaveCurrentIndex >= visibleCount) {
                State.mcHealingWaveTimer = $.Schedule(MC_HEALING_WAVE_PAUSE_S, function () {
                    if (!State.mcHealingWaveActive) { State.mcHealingWaveTimer = null; return; }
                    State.mcHealingWaveCurrentIndex = 0;
                    McHealingWaveTick();
                });
                return;
            }
            hearts[State.mcHealingWaveCurrentIndex].AddClass("RaisedHeart");
            State.mcHealingWaveCurrentIndex += 1;
            State.mcHealingWaveTimer = $.Schedule(MC_HEALING_WAVE_STEP_S, function () {
                if (!State.mcHealingWaveActive) { State.mcHealingWaveTimer = null; return; }
                McHealingWaveTick();
            });
        } catch (e) { $.Msg("[QOLLock][MC] Error in McHealingWaveTick: " + e); }
    }

    function McSetHealingWaveEnabled(enabled) {
        if (enabled) {
            if (State.mcHealingWaveActive) return;
            if (State.mcLowHealthJiggleActive) return;
            State.mcHealingWaveActive = true;
            State.mcHealingWaveCurrentIndex = 0;
            McResetAllHeartsPosition();
            McHealingWaveTick();
        } else {
            if (!State.mcHealingWaveActive) return;
            State.mcHealingWaveActive = false;
            if (State.mcHealingWaveTimer !== null) {
                $.CancelScheduled(State.mcHealingWaveTimer);
                State.mcHealingWaveTimer = null;
            }
            McResetAllHeartsPosition();
        }
    }

    function McCheckModifierActive(root, name) {
        try {
            var modifierLabels = root && root.FindChildrenWithClassTraverse ? root.FindChildrenWithClassTraverse("modifier_name") : null;
            if (!modifierLabels || modifierLabels.length === 0) return false;
            for (var i = 0; i < modifierLabels.length; i += 1) {
                var label = modifierLabels[i];
                if (label.text && label.text.toUpperCase().indexOf(name) !== -1) return true;
            }
            return false;
        } catch (e) { $.Msg("[QOLLock][MC] Error in McCheckModifierActive: " + e); return false; }
    }

    function McEnsureHeartsCapacity(hudRoot, heartsNeeded) {
        if (heartsNeeded <= 0) return false;
        if (!GetCachedPanel("mcHeartsContainer")) {
            SetCachedPanel("mcHeartsContainer", hudRoot.FindChildTraverse ? (hudRoot.FindChildTraverse("MinecraftHearts") || null) : null);
            if (!GetCachedPanel("mcHeartsContainer")) {
                $.Msg("[QOLLock][MC] MinecraftHearts container not found");
                return false;
            }
        }
        var heartsNeededRowCount = Math.ceil(heartsNeeded / MC_HEARTS_PER_ROW);
        if (State.mcHeartsCapacity >= heartsNeeded && State.mcHeartSlots.length >= State.mcHeartsCapacity && State.mcHeartsRowCount === heartsNeededRowCount) return true;
        GetCachedPanel("mcHeartsContainer").RemoveAndDeleteChildren();
        State.mcHeartSlots = [];
        State.mcHeartContainerImages = [];
        State.mcHeartHealingImages = [];
        State.mcHeartDeferredImages = [];
        State.mcHeartFillImages = [];
        State.mcHeartsCapacity = heartsNeeded;
        State.mcLastVisibleHeartsCount = 0;
        State.mcLastIsBlinkOn = null;
        State.mcLastContainerHeartsNeeded = -1;
        State.mcLastContainerLastSlotIsHalf = null;
        State.mcLastFillFullHearts = -1;
        State.mcLastFillHasHalf = null;
        State.mcLastFillAfflicted = null;
        State.mcLastDeferredFullHearts = -1;
        State.mcLastDeferredHasHalf = null;
        State.mcLastDeferredStartSlots = -1;
        State.mcLastHealingFullHearts = -1;
        State.mcLastHealingHasHalf = null;
        State.mcLastHealingStartSlots = -1;
        var currentRow = null;
        var heartsInCurrentRow = 0;
        var rowPanels = [];
        function ensureRow() {
            if (currentRow === null || heartsInCurrentRow >= MC_HEARTS_PER_ROW) {
                currentRow = $.CreatePanel("Panel", GetCachedPanel("mcHeartsContainer"), "");
                currentRow.AddClass("HeartsRow");
                var firstChild = GetCachedPanel("mcHeartsContainer").GetChild(0);
                if (firstChild && firstChild !== currentRow) GetCachedPanel("mcHeartsContainer").MoveChildBefore(currentRow, firstChild);
                rowPanels.push(currentRow);
                heartsInCurrentRow = 0;
            }
        }
        for (var i = 0; i < heartsNeeded; i += 1) {
            ensureRow();
            var slot = $.CreatePanel("Panel", currentRow, "");
            slot.AddClass("HeartSlot");
            var containerImg = $.CreatePanel("Image", slot, "");
            containerImg.AddClass("HeartContainer");
            containerImg.SetImage("s2r://panorama/images/minecraft/container_8x_png.vtex");
            var healingImg = $.CreatePanel("Image", slot, "");
            healingImg.AddClass("HeartHealing");
            healingImg.style.visibility = "collapse";
            var frozenImg = $.CreatePanel("Image", slot, "");
            frozenImg.AddClass("HeartDeferred");
            frozenImg.style.visibility = "collapse";
            var fillImg = $.CreatePanel("Image", slot, "");
            fillImg.AddClass("HeartFill");
            fillImg.style.visibility = "collapse";
            State.mcHeartSlots.push(slot);
            State.mcHeartContainerImages.push(containerImg);
            State.mcHeartHealingImages.push(healingImg);
            State.mcHeartDeferredImages.push(frozenImg);
            State.mcHeartFillImages.push(fillImg);
            heartsInCurrentRow += 1;
        }
        State.mcHeartsRowCount = rowPanels.length;
        if (rowPanels.length > MC_MAX_HEART_ROWS) {
            var marginTop = ((MC_MAX_HEART_ROWS * MC_HEART_ROW_HEIGHT_PX) / rowPanels.length) - MC_HEART_ROW_HEIGHT_PX;
            for (var j = 0; j < rowPanels.length - 1; j += 1) rowPanels[j].style.marginTop = marginTop + "px";
        }
        return true;
    }

    function McEnsureBarrierHeartsCapacity(hudRoot, heartsNeeded) {
        if (heartsNeeded <= 0) return false;
        if (!GetCachedPanel("mcBarrierHeartsContainer")) {
            SetCachedPanel("mcBarrierHeartsContainer", hudRoot.FindChildTraverse ? (hudRoot.FindChildTraverse("MinecraftShieldHeartsContainer") || null) : null);
            if (!GetCachedPanel("mcBarrierHeartsContainer")) {
                $.Msg("[QOLLock][MC] MinecraftBarrierHeartsContainer not found");
                return false;
            }
        }
        if (!GetCachedPanel("mcBarrierHearts")) {
            SetCachedPanel("mcBarrierHearts", hudRoot.FindChildTraverse ? (hudRoot.FindChildTraverse("MinecraftShieldHearts") || null) : null);
            if (!GetCachedPanel("mcBarrierHearts")) {
                $.Msg("[QOLLock][MC] MinecraftBarrierHearts not found");
                return false;
            }
        }
        // >=, not ==. heartsNeeded here is derived from total BARRIER, parsed off the
        // shield bar's max label — and unlike total health that is not stable: bullet
        // armour and shield items change it, and it can differ per shield application.
        // With an equality test, a max that oscillates between two values ran
        // RemoveAndDeleteChildren plus 3 CreatePanel per heart on every oscillation,
        // up to 5 times a second. Panel construction is the most expensive single
        // operation in Panorama, and shields are churning hardest mid-teamfight.
        //
        // The main heart path already gets this right (McEnsureHeartsCapacity uses
        // >=), and over-allocated slots are harmless: the render loop collapses any
        // slot past fullHearts, and isLastSlot compares against heartsNeeded rather
        // than the array length, so a longer array still indexes correctly.
        if (State.mcBarrierHeartsCapacity >= heartsNeeded && State.mcBarrierHeartsPanels.length >= State.mcBarrierHeartsCapacity) return true;
        GetCachedPanel("mcBarrierHearts").RemoveAndDeleteChildren();
        State.mcBarrierHeartsPanels = [];
        State.mcBarrierHeartContainerImages = [];
        State.mcBarrierHeartFillImages = [];
        State.mcBarrierHeartsCapacity = heartsNeeded;
        var currentRow = null;
        var heartsInCurrentRow = 0;
        function ensureRow() {
            if (currentRow === null || heartsInCurrentRow >= MC_HEARTS_PER_ROW) {
                currentRow = $.CreatePanel("Panel", GetCachedPanel("mcBarrierHearts"), "");
                currentRow.AddClass("HeartsRow");
                var firstChild = GetCachedPanel("mcBarrierHearts").GetChild(0);
                if (firstChild && firstChild !== currentRow) GetCachedPanel("mcBarrierHearts").MoveChildBefore(currentRow, firstChild);
                heartsInCurrentRow = 0;
            }
        }
        for (var i = 0; i < heartsNeeded; i += 1) {
            ensureRow();
            var slot = $.CreatePanel("Panel", currentRow, "");
            slot.AddClass("HeartSlot");
            var containerImg = $.CreatePanel("Image", slot, "");
            containerImg.AddClass("HeartContainer");
            containerImg.SetImage("s2r://panorama/images/minecraft/container_8x_png.vtex");
            var fillImg = $.CreatePanel("Image", slot, "");
            fillImg.AddClass("HeartFill");
            fillImg.style.visibility = "collapse";
            State.mcBarrierHeartsPanels.push(slot);
            State.mcBarrierHeartContainerImages.push(containerImg);
            State.mcBarrierHeartFillImages.push(fillImg);
            heartsInCurrentRow += 1;
        }
        return true;
    }

    function McUpdateHearts(trueHp, totalHp, afflicted) {
        try {
            var hudRoot = GetCachedPanel("mcHudRoot");
            if (!hudRoot) return;
            var isBlinkOn = State.mcHeartsBlinking && (State.mcHeartsBlinkPhase % 2 === 0);
            var totalHalfSegments = Math.max(0, Math.ceil(totalHp / MC_HP_PER_HALF_SEGMENT));
            var heartsNeeded = Math.max(1, Math.ceil(totalHalfSegments / 2));
            var currentHalfSegments = Math.ceil(trueHp / MC_HP_PER_HALF_SEGMENT);
            if (currentHalfSegments < 0) currentHalfSegments = 0;
            if (currentHalfSegments > totalHalfSegments) currentHalfSegments = totalHalfSegments;
            var fullHearts = Math.floor(currentHalfSegments / 2);
            var hasHalfHeart = (currentHalfSegments % 2) === 1;
            if (!McEnsureHeartsCapacity(hudRoot, heartsNeeded)) return;
            var lastSlotIsHalf = (totalHalfSegments % 2) === 1;
            if (isBlinkOn !== State.mcLastIsBlinkOn || heartsNeeded !== State.mcLastContainerHeartsNeeded || lastSlotIsHalf !== State.mcLastContainerLastSlotIsHalf) {
                State.mcLastIsBlinkOn = isBlinkOn;
                State.mcLastContainerHeartsNeeded = heartsNeeded;
                State.mcLastContainerLastSlotIsHalf = lastSlotIsHalf;
                for (var i = 0; i < State.mcHeartSlots.length; i += 1) {
                    var slot = State.mcHeartSlots[i];
                    var container = State.mcHeartContainerImages[i];
                    if (i >= heartsNeeded) { slot.style.visibility = "collapse"; continue; }
                    slot.style.visibility = "visible";
                    var isLastSlot = lastSlotIsHalf && (i === heartsNeeded - 1);
                    if (isLastSlot) container.SetImage(isBlinkOn ? "s2r://panorama/images/minecraft/container_blinking_half_8x_png.vtex" : "s2r://panorama/images/minecraft/container_half_8x_png.vtex");
                    else container.SetImage(isBlinkOn ? "s2r://panorama/images/minecraft/container_blinking_8x_png.vtex" : "s2r://panorama/images/minecraft/container_8x_png.vtex");
                }
            }
            if (fullHearts !== State.mcLastFillFullHearts || hasHalfHeart !== State.mcLastFillHasHalf || afflicted !== State.mcLastFillAfflicted) {
                State.mcLastFillFullHearts = fullHearts;
                State.mcLastFillHasHalf = hasHalfHeart;
                State.mcLastFillAfflicted = afflicted;
                var texturePrefix = afflicted ? "poisoned_" : "";
                for (var i = 0; i < State.mcHeartFillImages.length; i += 1) {
                    var fill = State.mcHeartFillImages[i];
                    fill.RemoveClass("full"); fill.RemoveClass("half"); fill.RemoveClass("empty");
                    if (i < fullHearts) {
                        fill.AddClass("full"); fill.style.visibility = "visible";
                        fill.SetImage("s2r://panorama/images/minecraft/" + texturePrefix + "full_8x_png.vtex");
                    } else if (i === fullHearts && hasHalfHeart) {
                        fill.AddClass("half"); fill.style.visibility = "visible";
                        fill.SetImage("s2r://panorama/images/minecraft/" + texturePrefix + "half_8x_png.vtex");
                    } else {
                        fill.AddClass("empty"); fill.style.visibility = "collapse";
                    }
                }
            }
            State.mcLastVisibleHeartsCount = heartsNeeded;
        } catch (error) { $.Msg("[QOLLock][MC] Error in McUpdateHearts: " + error); }
    }

    function McUpdateDeferredHearts(trueHp, deferredDamage, totalHp) {
        try {
            if (State.mcHeartDeferredImages.length === 0) return;
            var totalHalfSegments = Math.max(0, Math.ceil(totalHp / MC_HP_PER_HALF_SEGMENT));
            var trueHalfSegs = Math.ceil(trueHp / MC_HP_PER_HALF_SEGMENT);
            var deferredHalfSegs = deferredDamage > 0 ? Math.ceil(deferredDamage / MC_HP_PER_HALF_SEGMENT) : 0;
            var orangeHalfSegments = trueHalfSegs + deferredHalfSegs;
            if (orangeHalfSegments < 0) orangeHalfSegments = 0;
            if (orangeHalfSegments > totalHalfSegments) orangeHalfSegments = totalHalfSegments;
            var fullHearts = Math.floor(orangeHalfSegments / 2);
            var hasHalfHeart = (orangeHalfSegments % 2) === 1;
            var fillFullSlots = Math.floor(Math.ceil(trueHp / MC_HP_PER_HALF_SEGMENT) / 2);
            if (fullHearts === State.mcLastDeferredFullHearts && hasHalfHeart === State.mcLastDeferredHasHalf && fillFullSlots === State.mcLastDeferredStartSlots) return;
            State.mcLastDeferredFullHearts = fullHearts;
            State.mcLastDeferredHasHalf = hasHalfHeart;
            State.mcLastDeferredStartSlots = fillFullSlots;
            for (var i = 0; i < State.mcHeartDeferredImages.length; i += 1) {
                var deferred = State.mcHeartDeferredImages[i];
                if (i < fillFullSlots) { deferred.style.visibility = "collapse"; continue; }
                deferred.RemoveClass("full"); deferred.RemoveClass("half"); deferred.RemoveClass("empty");
                if (i < fullHearts) {
                    deferred.AddClass("full"); deferred.style.visibility = "visible";
                    deferred.SetImage("s2r://panorama/images/minecraft/orange_full_8x_png.vtex");
                } else if (i === fullHearts && hasHalfHeart) {
                    deferred.AddClass("half"); deferred.style.visibility = "visible";
                    deferred.SetImage("s2r://panorama/images/minecraft/orange_half_8x_png.vtex");
                } else {
                    deferred.AddClass("empty"); deferred.style.visibility = "collapse";
                }
            }
        } catch (error) { $.Msg("[QOLLock][MC] Error in McUpdateDeferredHearts: " + error); }
    }

    function McUpdateHealingHearts(currentHp, healingHp, totalHp) {
        try {
            if (State.mcHeartHealingImages.length === 0) return;
            var totalHalfSegments = Math.max(0, Math.ceil(totalHp / MC_HP_PER_HALF_SEGMENT));
            var healingHalfSegments = Math.ceil(healingHp / MC_HP_PER_HALF_SEGMENT);
            if (healingHalfSegments < 0) healingHalfSegments = 0;
            if (healingHalfSegments > totalHalfSegments) healingHalfSegments = totalHalfSegments;
            var fullHearts = Math.floor(healingHalfSegments / 2);
            var hasHalfHeart = (healingHalfSegments % 2) === 1;
            var healingStartSlots = Math.floor(Math.ceil(currentHp / MC_HP_PER_HALF_SEGMENT) / 2);
            if (fullHearts === State.mcLastHealingFullHearts && hasHalfHeart === State.mcLastHealingHasHalf && healingStartSlots === State.mcLastHealingStartSlots) return;
            State.mcLastHealingFullHearts = fullHearts;
            State.mcLastHealingHasHalf = hasHalfHeart;
            State.mcLastHealingStartSlots = healingStartSlots;
            for (var i = 0; i < State.mcHeartHealingImages.length; i += 1) {
                var healing = State.mcHeartHealingImages[i];
                if (i < healingStartSlots) { healing.style.visibility = "collapse"; continue; }
                healing.RemoveClass("full"); healing.RemoveClass("half"); healing.RemoveClass("empty");
                if (i < fullHearts) {
                    healing.AddClass("full"); healing.style.visibility = "visible";
                    healing.SetImage("s2r://panorama/images/minecraft/green_full_8x_png.vtex");
                } else if (i === fullHearts && hasHalfHeart) {
                    healing.AddClass("half"); healing.style.visibility = "visible";
                    healing.SetImage("s2r://panorama/images/minecraft/green_half_8x_png.vtex");
                } else {
                    healing.AddClass("empty"); healing.style.visibility = "collapse";
                }
            }
        } catch (error) { $.Msg("[QOLLock][MC] Error in McUpdateHealingHearts: " + error); }
    }

    function McUpdateBarrierHearts(currentBarrier, totalBarrier, hasBarrier) {
        try {
            var hudRoot = GetCachedPanel("mcHudRoot");
            if (!hudRoot) return;
            if (!hasBarrier) {
                if (GetCachedPanel("mcBarrierHeartsContainer")) GetCachedPanel("mcBarrierHeartsContainer").style.visibility = "collapse";
                State.mcLastBarrierFullHearts = -1;
                State.mcLastBarrierHasHalf = null;
                State.mcLastBarrierLastSlotIsHalf = null;
                State.mcLastBarrierHeartsNeeded = -1;
                return;
            }
            var totalHalfSegments = Math.ceil(totalBarrier / MC_HP_PER_HALF_SEGMENT);
            var heartsNeeded = Math.ceil(totalHalfSegments / 2);
            if (!McEnsureBarrierHeartsCapacity(hudRoot, heartsNeeded)) return;
            GetCachedPanel("mcBarrierHeartsContainer").style.visibility = "visible";
            var lastSlotIsHalf = (totalHalfSegments % 2) === 1;
            var currentHalfSegments = Math.ceil(currentBarrier / MC_HP_PER_HALF_SEGMENT);
            var fullHearts = Math.floor(currentHalfSegments / 2);
            var hasHalfHeart = (currentHalfSegments % 2) === 1;
            // heartsNeeded belongs in this signature because the loop below uses it to
            // decide which slots are surplus and must be collapsed. It was left out
            // while capacity was rebuilt on every change of it — the teardown masked
            // the omission. Now that capacity only grows, a barrier maximum that drops
            // within the existing capacity (500→300 while the barrier is empty) leaves
            // fullHearts, hasHalfHeart and lastSlotIsHalf all unchanged, so the early
            // return fires and the two surplus heart outlines stay on screen. The main
            // heart path already includes its own count for the same reason
            // (McUpdateHearts / mcLastContainerHeartsNeeded).
            if (fullHearts === State.mcLastBarrierFullHearts &&
                hasHalfHeart === State.mcLastBarrierHasHalf &&
                lastSlotIsHalf === State.mcLastBarrierLastSlotIsHalf &&
                heartsNeeded === State.mcLastBarrierHeartsNeeded) return;
            State.mcLastBarrierFullHearts = fullHearts;
            State.mcLastBarrierHasHalf = hasHalfHeart;
            State.mcLastBarrierLastSlotIsHalf = lastSlotIsHalf;
            State.mcLastBarrierHeartsNeeded = heartsNeeded;
            for (var i = 0; i < State.mcBarrierHeartsPanels.length; i += 1) {
                var container = State.mcBarrierHeartContainerImages[i];
                var fill = State.mcBarrierHeartFillImages[i];
                // Capacity only grows now (see McEnsureBarrierHeartsCapacity), so the
                // array can be longer than heartsNeeded. Collapse the whole surplus
                // slot: collapsing only its fill would leave a visible empty heart
                // outline from a barrier maximum the player no longer has.
                var slot = State.mcBarrierHeartsPanels[i];
                if (i >= heartsNeeded) {
                    if (slot) slot.style.visibility = "collapse";
                    continue;
                }
                if (slot) slot.style.visibility = "visible";
                var isLastSlot = lastSlotIsHalf && (i === heartsNeeded - 1);
                container.SetImage(isLastSlot ? "s2r://panorama/images/minecraft/container_half_8x_png.vtex" : "s2r://panorama/images/minecraft/container_8x_png.vtex");
                fill.RemoveClass("full"); fill.RemoveClass("half"); fill.RemoveClass("empty");
                if (i < fullHearts) {
                    fill.AddClass("full"); fill.style.visibility = "visible";
                    fill.SetImage("s2r://panorama/images/minecraft/absorption_full_8x_png.vtex");
                } else if (i === fullHearts && hasHalfHeart) {
                    fill.AddClass("half"); fill.style.visibility = "visible";
                    fill.SetImage("s2r://panorama/images/minecraft/absorption_half_8x_png.vtex");
                } else {
                    fill.AddClass("empty"); fill.style.visibility = "collapse";
                }
            }
        } catch (error) { $.Msg("[QOLLock][MC] Error in McUpdateBarrierHearts: " + error); }
    }

    // Resolve a pending-bar panel by id, caching both hits and misses.
    //
    // These two ids miss on every call: neither "pending_incoming_damage_Middle"
    // nor "pending_incoming_heal_Middle" appears in any mod layout or in any of
    // Valve's 457 layout files. The layouts declare
    // <ProgressBarWithMiddle id="pending_incoming_damage"> (hud_health.xml:25) and
    // vanilla CSS addresses the generated child by CLASS —
    // "#pending_incoming_damage .ProgressBarMiddle" (hud_health.css:483) — so the
    // "<parentId>Middle" id convention assumed here does not exist in Panorama.
    //
    // A FindChildTraverse miss is not a cheap null: it walks every descendant of
    // the panel it was called on before returning. Called from McComputeHealthState
    // on every MC tick, these two were ~10 whole-HUD walks a second for the length
    // of a match, and the walk is longest exactly during a teamfight when the tree
    // is at its largest.
    //
    // This is the perf fix only, and it deliberately preserves current behaviour:
    // both functions still return 0, which means the deferred-damage and
    // incoming-heal heart overlays stay non-functional as they have always been.
    // Resolving them by class would switch on visuals users have never seen, so
    // that belongs in its own change with its own in-game verification.
    var MC_PENDING_BAR_PROBE_MS = 2000;

    function McResolvePendingBar(hudRoot, cacheKey, panelId, nowMs) {
        var cached = GetCachedPanel(cacheKey);
        if (cached) return cached;
        if (!hudRoot || !hudRoot.FindChildTraverse) return null;

        var probe = State.mcPendingBarProbeNextMs || (State.mcPendingBarProbeNextMs = {});
        if (nowMs < (Number(probe[cacheKey]) || 0)) return null;

        var found = null;
        try { found = hudRoot.FindChildTraverse(panelId); } catch (e) { found = null; }
        if (found) {
            SetCachedPanel(cacheKey, found);
            probe[cacheKey] = 0;
        } else {
            probe[cacheKey] = nowMs + MC_PENDING_BAR_PROBE_MS;
        }
        return found;
    }

    function McParseDeferredDamage(hudRoot, nowMs) {
        try {
            var damageBar = McResolvePendingBar(hudRoot, "mcPendingDamageMiddle", "pending_incoming_damage_Middle", nowMs);
            if (!damageBar) return 0;
            var heightStr = damageBar.style && damageBar.style.height ? damageBar.style.height.toString() : "";
            var heightValue = parseFloat(heightStr) || 0;
            return heightValue / MC_HEALTH_BAR_PIXEL_HEIGHT * MC_HEALTH_BAR_SCALE;
        } catch (e) { $.Msg("[QOLLock][MC] Error in McParseDeferredDamage: " + e); return 0; }
    }

    function McParseIncomingHeal(hudRoot, nowMs) {
        try {
            var healBar = McResolvePendingBar(hudRoot, "mcPendingHealMiddle", "pending_incoming_heal_Middle", nowMs);
            if (!healBar) return 0;
            var heightStr = healBar.style && healBar.style.height ? healBar.style.height.toString() : "";
            var heightValue = parseFloat(heightStr) || 0;
            return (heightValue / MC_HEALTH_BAR_PIXEL_HEIGHT) * MC_HEALTH_BAR_SCALE;
        } catch (e) { $.Msg("[QOLLock][MC] Error in McParseIncomingHeal: " + e); return 0; }
    }

    function McReadHealthValues(hudRoot) {
        if (!hudRoot) return null;

        var regenTotal = GetCachedPanel("mcHealthRegenAndTotal");
        if (!IsPanelValid(regenTotal)) {
            regenTotal = hudRoot.FindChildTraverse ? hudRoot.FindChildTraverse("HealthRegenAndTotal") : null;
            if (regenTotal) SetCachedPanel("mcHealthRegenAndTotal", regenTotal);
        }

        var currentLbl = GetCachedPanel("mcCurrentHealthLabel");
        if (!IsPanelValid(currentLbl)) {
            if (regenTotal) {
                try {
                    if (typeof QOL !== "undefined" && QOL.utils && QOL.utils.FindFirstPanelByClass) {
                        currentLbl = QOL.utils.FindFirstPanelByClass(regenTotal, "currentHealthLabel");
                    }
                } catch (e1) {}
            }
            if (!currentLbl && hudRoot.FindChildrenWithClassTraverse) {
                var cPanels = hudRoot.FindChildrenWithClassTraverse("currentHealthLabel") || [];
                for (var ci = 0; ci < cPanels.length; ci++) {
                    if (cPanels[ci] && String(cPanels[ci].id || "") !== "currentHealthOverHearts") {
                        currentLbl = cPanels[ci];
                        break;
                    }
                }
            }
            if (!currentLbl) {
                currentLbl = hudRoot.FindChildTraverse ? (hudRoot.FindChildTraverse("currentHealthLabel") || hudRoot.FindChildTraverse("current_health") || hudRoot.FindChildTraverse("currentHealthOverHearts")) : null;
            }
            if (currentLbl) SetCachedPanel("mcCurrentHealthLabel", currentLbl);
        }

        var totalLbl = GetCachedPanel("mcTotalHealthLabel");
        if (!IsPanelValid(totalLbl)) {
            if (regenTotal) {
                try {
                    if (typeof QOL !== "undefined" && QOL.utils && QOL.utils.FindFirstPanelByClass) {
                        totalLbl = QOL.utils.FindFirstPanelByClass(regenTotal, "totalHealthLabel");
                    }
                } catch (e2) {}
            }
            if (!totalLbl && hudRoot.FindChildrenWithClassTraverse) {
                var tPanels = hudRoot.FindChildrenWithClassTraverse("totalHealthLabel") || [];
                for (var ti = 0; ti < tPanels.length; ti++) {
                    if (tPanels[ti] && String(tPanels[ti].id || "") !== "totalHealthOverHearts") {
                        totalLbl = tPanels[ti];
                        break;
                    }
                }
            }
            if (!totalLbl) {
                totalLbl = hudRoot.FindChildTraverse ? (hudRoot.FindChildTraverse("totalHealthLabel") || hudRoot.FindChildTraverse("max_health") || hudRoot.FindChildTraverse("totalHealthOverHearts")) : null;
            }
            if (totalLbl) SetCachedPanel("mcTotalHealthLabel", totalLbl);
        }

        if (!currentLbl || !totalLbl) {
            if (!State.mcLoggedHealthContainerMiss) {
                $.Msg("[QOLLock][MC] Health label panels not found");
                State.mcLoggedHealthContainerMiss = true;
            }
            return null;
        }
        State.mcLoggedHealthContainerMiss = false;

        var currentText = currentLbl.text ? String(currentLbl.text) : "";
        var totalText = totalLbl.text ? String(totalLbl.text) : "";
        var currentHealth = parseInt(currentText.replace(/[^0-9]/g, ""), 10) || 0;
        var totalHealth = parseInt(totalText.replace(/[^0-9]/g, ""), 10) || 0;
        return { currentHealth: currentHealth, totalHealth: totalHealth };
    }

    function McComputeHealthState(currentHealth, totalHealth, hudRoot, nowMs) {
        var deferredFraction = McParseDeferredDamage(hudRoot, nowMs);
        var deferredDamage = Math.round(deferredFraction * totalHealth);
        var trueCurrentHealth = Math.max(0, currentHealth - deferredDamage);
        var incomingHealFraction = McParseIncomingHeal(hudRoot, nowMs);
        var incomingHealAmount = Math.round(incomingHealFraction * totalHealth);
        var healingHealth = Math.min(totalHealth, currentHealth + incomingHealAmount);
        var currentHalfSegments = Math.ceil(trueCurrentHealth / MC_HP_PER_HALF_SEGMENT);
        var effectiveHalfSegments = Math.ceil(currentHealth / MC_HP_PER_HALF_SEGMENT);
        var hasIncomingHeal = incomingHealAmount > 0;
        return { deferredDamage: deferredDamage, trueCurrentHealth: trueCurrentHealth, healingHealth: healingHealth, currentHalfSegments: currentHalfSegments, effectiveHalfSegments: effectiveHalfSegments, hasIncomingHeal: hasIncomingHeal };
    }

    function McResolveChargesContainer(root) {
        var cached = GetCachedPanel("mcChargesContainer");
        if (IsPanelValid(cached)) return cached;

        var searchRoot = root;
        try {
            var top = root;
            while (top && top.GetParent && top.GetParent()) {
                top = top.GetParent();
            }
            if (top) searchRoot = top;
        } catch (e) {}

        var container = null;

        // Method 1: Find .ability_element_charges (Valve stamina reticle element)
        if (searchRoot && searchRoot.FindChildrenWithClassTraverse) {
            var elements = searchRoot.FindChildrenWithClassTraverse("ability_element_charges");
            if (elements && elements.length > 0) {
                for (var k = 0; k < elements.length; k++) {
                    var c = elements[k].FindChildTraverse ? elements[k].FindChildTraverse("charges_container") : null;
                    if (!c && elements[k].id === "charges_container") c = elements[k];
                    if (c && c.FindChildrenWithClassTraverse && c.FindChildrenWithClassTraverse("charge").length > 0) {
                        container = c;
                        break;
                    }
                }
            }
        }

        // Method 2: Search for .charge pips and take their parent
        if (!container && searchRoot && searchRoot.FindChildrenWithClassTraverse) {
            var allChargePips = searchRoot.FindChildrenWithClassTraverse("charge");
            if (allChargePips && allChargePips.length > 0) {
                for (var j = 0; j < allChargePips.length; j++) {
                    var p = allChargePips[j].GetParent ? allChargePips[j].GetParent() : null;
                    if (p && p.id === "charges_container") {
                        container = p;
                        break;
                    }
                }
                if (!container && allChargePips[0].GetParent) {
                    container = allChargePips[0].GetParent();
                }
            }
        }

        // Method 3: Direct traversal on searchRoot verifying it has .charge children
        if (!container && searchRoot && searchRoot.FindChildTraverse) {
            var direct = searchRoot.FindChildTraverse("charges_container");
            if (direct && direct.FindChildrenWithClassTraverse && direct.FindChildrenWithClassTraverse("charge").length > 0) {
                container = direct;
            }
        }

        if (container) {
            SetCachedPanel("mcChargesContainer", container);
        }
        return container;
    }

    function McParseChargesForHunger(root) {
        try {
            var container = McResolveChargesContainer(root);
            if (!container) return null;

            var allCharges = container.FindChildrenWithClassTraverse ? container.FindChildrenWithClassTraverse("charge") : null;
            if (!allCharges || allCharges.length === 0) return null;

            var maxCharges = 0;
            var activeCharges = [];
            for (var i = 0; i < allCharges.length; i += 1) {
                if (allCharges[i].BHasClass("has_charge")) {
                    maxCharges += 1;
                    activeCharges.push(allCharges[i]);
                }
            }
            if (maxCharges === 0) return null;

            var maxAngle = MC_CHARGE_MAX_ANGLES[maxCharges] || 26;
            var totalChargeValue = 0;

            for (var i = 0; i < activeCharges.length; i += 1) {
                var charge = activeCharges[i];
                var isCharging = charge.BHasClass("charging");
                var isDraining = charge.BHasClass("draining") || charge.BHasClass("drained");
                var isDisabled = charge.BHasClass("disabled");

                if (!isCharging && !isDraining && !isDisabled) {
                    // Ready / full dash charge
                    totalChargeValue += 1.0;
                } else if (isCharging) {
                    // Actively recharging
                    var chargeFgElements = charge.FindChildrenWithClassTraverse ? charge.FindChildrenWithClassTraverse("charge_fg") : null;
                    var chargeFg = (chargeFgElements && chargeFgElements.length > 0) ? chargeFgElements[0] : null;
                    var clipStyle = (chargeFg && chargeFg.style && chargeFg.style.clip) ? chargeFg.style.clip.toString() : "";
                    var match = clipStyle.match(/radial\([^,]+,[^,]+,\s*([\d.]+)deg\s*\)/);
                    if (match) {
                        var extentAngle = parseFloat(match[1]) || 0;
                        var progress = (extentAngle > maxAngle) ? (extentAngle / 360) : (extentAngle / maxAngle);
                        totalChargeValue += Math.min(Math.max(progress, 0.0), 1.0);
                    } else {
                        // Recharging
                        totalChargeValue += 0.2;
                    }
                }
                // isDraining || isDisabled -> 0.0
            }

            var hungerPercent = Math.round((totalChargeValue / maxCharges) * 100);
            if (hungerPercent < 0) hungerPercent = 0;
            if (hungerPercent > 100) hungerPercent = 100;

            return { percent: hungerPercent, chargesFilled: totalChargeValue, maxCharges: maxCharges };
        } catch (e) {
            $.Msg("[QOLLock][MC] Error in McParseChargesForHunger: " + e);
            return null;
        }
    }

    function McUpdateFood(percent) {
        try {
            var hudRoot = GetCachedPanel("mcHudRoot");
            if (!hudRoot) return;
            var foodContainer = GetCachedPanel("mcFoodContainer");
            if (!IsPanelValid(foodContainer)) {
                foodContainer = hudRoot.FindChildTraverse ? (hudRoot.FindChildTraverse("MinecraftFoodContainer") || null) : null;
                SetCachedPanel("mcFoodContainer", foodContainer);
                if (!foodContainer) { $.Msg("[QOLLock][MC] MinecraftFoodContainer not found"); return; }
                var children = foodContainer.Children ? foodContainer.Children() : [];
                State.mcCachedFoodIcons = [];
                for (var i = 0; i < children.length; i += 1) { if (children[i].BHasClass("FoodIcon")) State.mcCachedFoodIcons.push(children[i]); }
            }
            if (!State.mcCachedFoodIcons || State.mcCachedFoodIcons.length === 0) return;
            if (percent < 0) percent = 0;
            if (percent > 100) percent = 100;
            var totalHalfSegments = Math.round(percent / MC_FOOD_PERCENT_PER_HALF);
            var fullIcons = Math.floor(totalHalfSegments / 2);
            var hasHalfIcon = (totalHalfSegments % 2) === 1;
            var iconCount = State.mcCachedFoodIcons.length;
            for (var i = 0; i < iconCount; i += 1) {
                var reverseIndex = iconCount - 1 - i;
                if (reverseIndex < fullIcons) State.mcCachedFoodIcons[i].SetImage("s2r://panorama/images/minecraft/food_8x_png.vtex");
                else if (reverseIndex === fullIcons && hasHalfIcon) State.mcCachedFoodIcons[i].SetImage("s2r://panorama/images/minecraft/food_half_8x_png.vtex");
                else State.mcCachedFoodIcons[i].SetImage("s2r://panorama/images/minecraft/food_empty_8x_png.vtex");
            }
        } catch (e) { $.Msg("[QOLLock][MC] Error in McUpdateFood: " + e); }
    }

    function McParseSoulsAndLevel(root) {
        try {
            if (!GetCachedPanel("mcGoldApContainer")) {
                var panel = root && root.FindChildTraverse ? (root.FindChildTraverse("gold_and_ap_container") || null) : null;
                if (!panel) {
                    if (!State.mcLoggedGoldApMiss) { $.Msg("[QOLLock][MC] gold_and_ap_container not found"); State.mcLoggedGoldApMiss = true; }
                    return;
                }
                State.mcLoggedGoldApMiss = false;
                SetCachedPanel("mcGoldApContainer", panel);
            }
            if (!GetCachedPanel("mcSoulsFill")) SetCachedPanel("mcSoulsFill", GetCachedPanel("mcGoldApContainer").FindChildTraverse ? (GetCachedPanel("mcGoldApContainer").FindChildTraverse("SoulsFill") || null) : null);
            if (GetCachedPanel("mcSoulsFill")) {
                var heightStr = GetCachedPanel("mcSoulsFill").style && GetCachedPanel("mcSoulsFill").style.height ? GetCachedPanel("mcSoulsFill").style.height.toString() : "";
                var heightValue = parseFloat(heightStr) || 0;
                if (heightValue <= 0) {
                    var actualHeight = Number(GetCachedPanel("mcSoulsFill").actuallayoutheight);
                    if (isFinite(actualHeight) && actualHeight > 0) heightValue = actualHeight;
                }
                var percent = MC_SOULS_BAR_MAX_HEIGHT_PX > 0 ? Math.round((heightValue / MC_SOULS_BAR_MAX_HEIGHT_PX) * 100) : 0;
                if (percent < 0) percent = 0; else if (percent > 100) percent = 100;
                if (!GetCachedPanel("mcXpBarFill")) SetCachedPanel("mcXpBarFill", root && root.FindChildTraverse ? (root.FindChildTraverse("MinecraftXPBarFill") || null) : null);
                if (GetCachedPanel("mcXpBarFill") && GetCachedPanel("mcXpBarFill").style) { try { GetCachedPanel("mcXpBarFill").style.clip = "rect( 0px, " + percent + "%, 100%, 0px )"; } catch(e) {} }
            }
            if (!GetCachedPanel("mcPlayerLevelLabel")) SetCachedPanel("mcPlayerLevelLabel", GetCachedPanel("mcGoldApContainer").FindChildTraverse ? (GetCachedPanel("mcGoldApContainer").FindChildTraverse("PlayerLevelNumber") || null) : null);
            if (GetCachedPanel("mcPlayerLevelLabel")) {
                var levelValue = parseInt((GetCachedPanel("mcPlayerLevelLabel").text || "").replace(/[^0-9]/g, ""), 10) || 0;
                if (!GetCachedPanel("mcXpLevelLabel")) SetCachedPanel("mcXpLevelLabel", root && root.FindChildTraverse ? (root.FindChildTraverse("MinecraftXPLevelLabel") || null) : null);
                if (GetCachedPanel("mcXpLevelLabel")) GetCachedPanel("mcXpLevelLabel").text = levelValue.toString();
            }
        } catch (error) { $.Msg("[QOLLock][MC] Error in McParseSoulsAndLevel: " + error); }
    }

    function McUpdateAnimationState(currentHalfSegments, effectiveHalfSegments, hasIncomingHeal) {
        if (State.mcLastBlinkHalfSegments !== null && effectiveHalfSegments !== State.mcLastBlinkHalfSegments) McStartHeartsBlink();
        State.mcLastBlinkHalfSegments = effectiveHalfSegments;
        var isLowHealth = currentHalfSegments <= MC_LOW_HEALTH_HALF_SEGMENTS;
        McSetLowHealthJiggleEnabled(isLowHealth);
        McSetHealingWaveEnabled(!isLowHealth && hasIncomingHeal);
    }

    function McUpdateTotem() {
        if (!GetCachedPanel("mcTotemContainer")) return;
        var hasRejuvenator = GetCachedPanel("mcHudHealthBars") ? GetCachedPanel("mcHudHealthBars").BHasClass("HasRejuvenator") : false;
        GetCachedPanel("mcTotemContainer").style.visibility = hasRejuvenator ? "visible" : "collapse";
    }

    function McUpdateBulletBarrier(hudRoot) {
        var hasBarrier = false;
        var bulletBarrierCurrent = 0;
        var bulletBarrierMax = 0;
        if (GetCachedPanel("mcBarriersContainer")) hasBarrier = GetCachedPanel("mcBarriersContainer").BHasClass("HasBulletShield");
        if (hasBarrier) {
            if (!GetCachedPanel("mcBulletBarrierNumbers")) SetCachedPanel("mcBulletBarrierNumbers", hudRoot.FindChildTraverse ? (hudRoot.FindChildTraverse("BulletShieldNumbers") || null) : null);
            if (GetCachedPanel("mcBulletBarrierNumbers")) {
                if (!GetCachedPanel("mcBulletBarrierCurrentLabel")) {
                    var lbls = GetCachedPanel("mcBulletBarrierNumbers").FindChildrenWithClassTraverse ? GetCachedPanel("mcBulletBarrierNumbers").FindChildrenWithClassTraverse("progress_bar_current") : null;
                    if (lbls && lbls.length > 0) SetCachedPanel("mcBulletBarrierCurrentLabel", lbls[0]);
                }
                if (!GetCachedPanel("mcBulletBarrierMaxLabel")) {
                    var lbls = GetCachedPanel("mcBulletBarrierNumbers").FindChildrenWithClassTraverse ? GetCachedPanel("mcBulletBarrierNumbers").FindChildrenWithClassTraverse("progress_bar_max") : null;
                    if (lbls && lbls.length > 0) SetCachedPanel("mcBulletBarrierMaxLabel", lbls[0]);
                }
                if (GetCachedPanel("mcBulletBarrierCurrentLabel")) bulletBarrierCurrent = parseInt(GetCachedPanel("mcBulletBarrierCurrentLabel").text.replace(/[^0-9]/g, ""), 10) || 0;
                if (GetCachedPanel("mcBulletBarrierMaxLabel")) bulletBarrierMax = parseInt(GetCachedPanel("mcBulletBarrierMaxLabel").text.replace(/[^0-9]/g, ""), 10) || 0;
                McUpdateBarrierHearts(bulletBarrierCurrent, bulletBarrierMax, true);
            } else {
                if (!State.mcLoggedBulletBarrierMiss) { $.Msg("[QOLLock][MC] BulletBarrierNumbers panel not found"); State.mcLoggedBulletBarrierMiss = true; }
                McUpdateBarrierHearts(0, 0, false);
            }
        } else {
            McUpdateBarrierHearts(0, 0, false);
        }
        return { hasBarrier: hasBarrier, bulletBarrierCurrent: bulletBarrierCurrent, bulletBarrierMax: bulletBarrierMax };
    }

    function UpdateMinecraftHealthbar(root, cfg, nowMs, enabled) {
        if (!enabled) {
            if (runtimeRoot || State.mcWasEnabled) McResetRuntime();
            return;
        }
        if (runtimeRoot && !IsPanelValid(runtimeRoot)) McResetRuntime();
        var nowMsNum = Number(nowMs) || 0;
        if (nowMsNum < (Number(State.mcNextUpdateMs) || 0)) return;

        var hudRoot = McResolveHudRoot(root);
        if (!hudRoot) { State.mcNextUpdateMs = nowMsNum + 400; return; }
        runtimeRoot = hudRoot;

        State.mcNextUpdateMs = nowMsNum + MC_TICK_INTERVAL_MS;

        if (!GetCachedPanel("mcHudHealthBars")) SetCachedPanel("mcHudHealthBars", hudRoot.FindChildTraverse ? (hudRoot.FindChildTraverse("hud_health_bars") || null) : null);
        if (!GetCachedPanel("mcTotemContainer")) SetCachedPanel("mcTotemContainer", hudRoot.FindChildTraverse ? (hudRoot.FindChildTraverse("MinecraftTotemContainer") || null) : null);
        if (!GetCachedPanel("mcBarriersContainer")) {
            SetCachedPanel("mcBarriersContainer", hudRoot.FindChildTraverse ? (hudRoot.FindChildTraverse("HudShieldsContainer") || null) : null);
            if (!GetCachedPanel("mcBarriersContainer")) $.Msg("[QOLLock][MC] HudBarriersContainer not found");
        }

        var hv = McReadHealthValues(hudRoot);
        if (!hv) return;
        var currentHealth = hv.currentHealth;
        var totalHealth = hv.totalHealth;

        if (!GetCachedPanel("mcHealthPercentLabel")) {
            SetCachedPanel("mcHealthPercentLabel", hudRoot.FindChildTraverse ? (hudRoot.FindChildTraverse("MinecraftHealthPercent") || null) : null);
        }
        var mcPercentLabel = GetCachedPanel("mcHealthPercentLabel");
        if (IsPanelValid(mcPercentLabel) && totalHealth > 0) {
            var mcPercent = (currentHealth / totalHealth) * 100;
            if (!isFinite(mcPercent)) mcPercent = 0;
            if (mcPercent < 0) mcPercent = 0;
            mcPercentLabel.text = "  [" + String(Math.floor(mcPercent)) + "%]";
        }

        var numCurrent = GetCachedPanel("mcNumCurrent");
        if (!IsPanelValid(numCurrent)) {
            numCurrent = hudRoot.FindChildTraverse ? hudRoot.FindChildTraverse("currentHealthOverHearts") : null;
            if (numCurrent) SetCachedPanel("mcNumCurrent", numCurrent);
        }
        if (IsPanelValid(numCurrent)) numCurrent.text = String(currentHealth);

        var numTotal = GetCachedPanel("mcNumTotal");
        if (!IsPanelValid(numTotal)) {
            numTotal = hudRoot.FindChildTraverse ? hudRoot.FindChildTraverse("totalHealthOverHearts") : null;
            if (numTotal) SetCachedPanel("mcNumTotal", numTotal);
        }
        if (IsPanelValid(numTotal)) numTotal.text = "/ " + String(totalHealth);

        var nowMsForMod = Date.now();
        var hs = McComputeHealthState(currentHealth, totalHealth, hudRoot, nowMsForMod);

        McUpdateAnimationState(hs.currentHalfSegments, hs.effectiveHalfSegments, hs.hasIncomingHeal);

        if (nowMsForMod >= (Number(State.mcCheckModifierNextMs) || 0)) {
            State.mcLastModifierResult = McCheckModifierActive(root, "AFFLICTED");
            State.mcCheckModifierNextMs = nowMsForMod + MC_MODIFIER_THROTTLE_MS;
        }
        State.mcIsAfflicted = State.mcLastModifierResult;

        McUpdateHearts(hs.trueCurrentHealth, totalHealth, State.mcIsAfflicted);
        McUpdateHealingHearts(currentHealth, hs.healingHealth, totalHealth);
        McUpdateDeferredHearts(hs.trueCurrentHealth, hs.deferredDamage, totalHealth);
        McUpdateTotem();
        McUpdateBulletBarrier(hudRoot);
        McParseSoulsAndLevel(root);
        var hungerData = McParseChargesForHunger(root);
        if (hungerData !== null) McUpdateFood(hungerData.percent);

        State.mcWasEnabled = true;
    }

    // ── Export ──
    QOL.healthbar = QOL.healthbar || {};
    QOL.healthbar.mc = { update: UpdateMinecraftHealthbar };

    // ── Self-test ──
    try {
        if (typeof UpdateMinecraftHealthbar !== "function") throw new Error("not defined");
    } catch(e) {
        $.Msg("[QOLLock][ERROR][" + _featureId + "] self-test: " + (e && e.message ? e.message : String(e)));
    }
})();

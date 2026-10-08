// OWNS: Minecraft heart grids, gameplay-derived overlays and their animation schedules.
// DOES NOT OWN: Native health/shield bindings, root CSS or other healthbar variants.
(() => {
    "use strict";
    const H = QOL.healthbar, P = QOL.core.panel, U = QOL.utils;
    H.registerVariant("mc", function(ctx) {
        const state = {
            mcHeartsBlinkTimer: null,
            mcLowHealthJiggleTimer: null,
            mcHealingWaveTimer: null,
            mcHeartsBlinking: false,
            mcHeartsBlinkPhase: 0,
            mcLowHealthJiggleActive: false,
            mcHealingWaveActive: false,
            mcHealingWaveCurrentIndex: 0,
            mcLastBlinkHalfSegments: null,
            mcLastIsBlinkOn: null,
            mcLastContainerHeartsNeeded: -1,
            mcLastContainerLastSlotIsHalf: null,
            mcLastFillFullHearts: -1,
            mcLastFillHasHalf: null,
            mcLastFillAfflicted: null,
            mcLastDeferredFullHearts: -1,
            mcLastDeferredHasHalf: null,
            mcLastDeferredStartSlots: -1,
            mcLastHealingFullHearts: -1,
            mcLastHealingHasHalf: null,
            mcLastHealingStartSlots: -1,
            mcLastBarrierFullHearts: -1,
            mcLastBarrierHasHalf: null,
            mcLastBarrierLastSlotIsHalf: null,
            mcLastBarrierHeartsNeeded: -1,
            mcWasEnabled: false,
            mcNextUpdateMs: 0,
            mcHeartSlots: [],
            mcHeartContainerImages: [],
            mcHeartHealingImages: [],
            mcHeartDeferredImages: [],
            mcHeartFillImages: [],
            mcHeartsCapacity: 0,
            mcHeartsRowCount: 0,
            mcLastVisibleHeartsCount: 0,
            mcBarrierHeartsPanels: [],
            mcBarrierHeartContainerImages: [],
            mcBarrierHeartFillImages: [],
            mcBarrierHeartsCapacity: 0,
            mcCheckModifierNextMs: 0,
            mcLastModifierResult: false,
        };
        const createdRows = new Set();
        const ownedStyles = new Map(), ownedText = new Map(), imageSignatures = new Map(), foodOwners = new Set();
        const goldResolver = QOL.panelCache.createIdResolver("gold_and_ap_container", {
            retryMs: 400, ownerPath: [{ id: "Hud", optional: true }, { className: "HudCore" }, "gameplay_hud", "gameplay_hud_alive"]
        });
        function setImage(panel, image) {
            if (!P.isAlive(panel) || imageSignatures.get(panel) === image) return;
            panel.SetImage(image);
            imageSignatures.set(panel, image);
        }
        function ownText(panel, text) {
            if (!P.isAlive(panel)) return;
            if (!ownedText.has(panel)) ownedText.set(panel, panel.text);
            if (panel.text !== text) panel.text = text;
        }
        let runtimeRoot = null, contextRoot = null, sourceGeneration = [], sources = null, generation = 0;
        const featureId = ctx && ctx.id || 'ql_healthbar';
        const rootResolver = QOL.panelCache.createIdResolver('MinecraftHeartsRoot', {
            retryMs: 400, ownerPath: [{ id: 'Hud', optional: true }, { className: 'HudCore' },
                'gameplay_hud', 'health_and_abilities_container', 'QOLHealthbarGeometry']
        });
        const IsPanelValid = P.isAlive;
        function belongs(panel, root) {
            try {
                for (let depth = 0; depth < 64 && P.isAlive(panel); depth++) {
                    if (panel === root) return true;
                    panel = panel.GetParent();
                }
            } catch (_) {}
            return false;
        }


        function ownStyle(panel, property, value) {
            if (!P.isAlive(panel)) return;
            let properties = ownedStyles.get(panel);
            if (!properties) { properties = new Set(); ownedStyles.set(panel, properties); }
            properties.add(property);
            if (panel.style[property] !== value) panel.style[property] = value;
        }
        function later(delay, callback) {
            const token = generation;
            return QOL.core.Scheduler.scheduleOnce(() => {
                if (token === generation) callback();
            }, delay, featureId);
        }

        // ── Minecraft healthbar constants ──
        const MC_CHARGE_MAX_ANGLES = { 1: 90, 2: 42, 3: 26, 4: 20, 5: 15.5, 6: 13, 7: 10.86 };
        const MC_HP_PER_HALF_SEGMENT = 50;
        const MC_LOW_HEALTH_HALF_SEGMENTS = 4;
        const MC_HEARTS_PER_ROW = 10;
        const MC_MAX_HEART_ROWS = 5;
        const MC_HEART_ROW_HEIGHT_PX = 22;
        const MC_SOULS_BAR_MAX_HEIGHT_PX = 52;
        const MC_FOOD_PERCENT_PER_HALF = 5;
        const MC_TICK_INTERVAL_MS = 50;
        const MC_MODIFIER_THROTTLE_MS = 500;
        const MC_BLINK_INTERVAL_S = 0.1;
        const MC_BLINK_PHASE_COUNT = 4;
        const MC_JIGGLE_INTERVAL_S = 0.05;
        const MC_JIGGLE_CHANCE = 0.5;
        const MC_HEALING_WAVE_STEP_S = 0.05;
        const MC_HEALING_WAVE_PAUSE_S = 0.5;

        // ── Minecraft Healthbar ──

        function readSources(root) {
            const heartsRoot = rootResolver.resolve(root);
            const canvas = P.isAlive(heartsRoot) ? heartsRoot.GetParent() : null;
            if (!P.isAlive(canvas)) return null;
            const heartsBox = P.findChild(heartsRoot, "MinecraftHeartsContainer");
            const shieldBox = P.findChild(heartsRoot, "MinecraftShieldHeartsContainer");
            const xpBox = P.findChild(heartsRoot, "MinecraftXPBarContainer");
            const hotbar = P.findChild(heartsRoot, "MinecraftHotbarContainer");
            const content = P.findChild(canvas, "HealthBarContent");
            const numbersBox = P.findChild(heartsBox, "MinecraftHeartsHealthNumbersContainer");
            const numbers = P.findChild(numbersBox, "MinecraftHeartsHealthNumbers");
            return {
                canvas, heartsRoot, heartsBox, shieldBox,
                hearts: P.findChild(heartsBox, "MinecraftHearts") || P.findChild(heartsRoot, "MinecraftHearts"),
                shieldHearts: P.findChild(shieldBox, "MinecraftShieldHearts"),
                food: P.findChild(heartsBox, "MinecraftFoodContainer") || P.findChild(heartsRoot, "MinecraftFoodContainer"),
                nativeNumbers: P.findChild(canvas, "HealthRegenAndTotal"),
                bars: P.findChild(content || canvas, "hud_health_bars"),
                shields: P.findChild(content || canvas, "HudShieldsContainer"),
                percent: P.findChild(numbers || heartsBox || canvas, "MinecraftHealthPercent"),
                xpFill: P.findChild(xpBox || heartsRoot, "MinecraftXPBarFill"),
                xpLevel: P.findChild(xpBox || heartsRoot, "MinecraftXPLevelLabel"),
                totem: P.findChild(hotbar || canvas, "MinecraftTotemContainer") || P.findChild(heartsRoot, "MinecraftTotemContainer")
            };
        }

        function McResolveHudRoot(root) {
            const currentSources = readSources(root);
            if (!currentSources) return null;
            const current = Object.values(currentSources);
            if (current.some((owner, index) => owner !== sourceGeneration[index]) ||
                state.mcHeartSlots.some(slot => !P.isAlive(slot)) ||
                state.mcBarrierHeartsPanels.some(slot => !P.isAlive(slot))) {
                McResetRuntime();
                contextRoot = root;
                sourceGeneration = current;
            }
            sources = currentSources;
            return sources.canvas;
        }

        function McResetRuntime() {
            generation++;
            if (state.mcHeartsBlinkTimer !== null) {
                state.mcHeartsBlinkTimer.stop();
                state.mcHeartsBlinkTimer = null;
            }
            if (state.mcLowHealthJiggleTimer !== null) {
                state.mcLowHealthJiggleTimer.stop();
                state.mcLowHealthJiggleTimer = null;
            }
            if (state.mcHealingWaveTimer !== null) {
                state.mcHealingWaveTimer.stop();
                state.mcHealingWaveTimer = null;
            }
            for (const row of createdRows) {
                if (P.isAlive(row)) row.visible = false;
                P.delete(row);
            }
            createdRows.clear();
            for (const [panel, text] of ownedText) if (P.isAlive(panel)) panel.text = text;
            ownedText.clear();
            for (const panel of foodOwners) if (P.isAlive(panel)) panel.SetImage("s2r://panorama/images/minecraft/food_8x_png.vtex");
            foodOwners.clear();
            imageSignatures.clear();
            goldResolver.reset();
            rootResolver.reset();
            for (const [owner, properties] of ownedStyles) {
                for (const property of properties) P.clearStyleProperty(owner, property);
            }
            ownedStyles.clear();
            sourceGeneration = [];
            sources = null;
            contextRoot = null;
            state.mcCheckModifierNextMs = 0;
            state.mcLastModifierResult = false;
            state.mcHeartsBlinking = false;
            state.mcHeartsBlinkPhase = 0;
            state.mcLowHealthJiggleActive = false;
            state.mcHealingWaveActive = false;
            state.mcHealingWaveCurrentIndex = 0;
            state.mcLastBlinkHalfSegments = null;
            state.mcLastIsBlinkOn = null;
            state.mcLastContainerHeartsNeeded = -1;
            state.mcLastContainerLastSlotIsHalf = null;
            state.mcLastFillFullHearts = -1;
            state.mcLastFillHasHalf = null;
            state.mcLastFillAfflicted = null;
            state.mcLastDeferredFullHearts = -1;
            state.mcLastDeferredHasHalf = null;
            state.mcLastDeferredStartSlots = -1;
            state.mcLastHealingFullHearts = -1;
            state.mcLastHealingHasHalf = null;
            state.mcLastHealingStartSlots = -1;
            state.mcLastBarrierFullHearts = -1;
            state.mcLastBarrierHasHalf = null;
            state.mcLastBarrierLastSlotIsHalf = null;
            state.mcLastBarrierHeartsNeeded = -1;
            state.mcWasEnabled = false;
            runtimeRoot = null;
            state.mcNextUpdateMs = 0;
            state.mcHeartSlots = [];
            state.mcHeartContainerImages = [];
            state.mcHeartHealingImages = [];
            state.mcHeartDeferredImages = [];
            state.mcHeartFillImages = [];
            state.mcHeartsCapacity = 0;
            state.mcHeartsRowCount = 0;
            state.mcLastVisibleHeartsCount = 0;
            state.mcBarrierHeartsPanels = [];
            state.mcBarrierHeartContainerImages = [];
            state.mcBarrierHeartFillImages = [];
            state.mcBarrierHeartsCapacity = 0;
        }

        function McCanAnimate() {
            if (IsPanelValid(runtimeRoot) && belongs(runtimeRoot, contextRoot) &&
                !QOL.core.hud.isInHideout(contextRoot) &&
                sourceGeneration.every(panel => !panel || belongs(panel, runtimeRoot)) &&
                sources && rootResolver.resolve(contextRoot) === sources.heartsRoot) return true;
            McResetRuntime();
            return false;
        }

        function McStartHeartsBlink() {
            if (state.mcHeartsBlinkTimer !== null) {
                state.mcHeartsBlinkTimer.stop();
                state.mcHeartsBlinkTimer = null;
            }
            state.mcHeartsBlinking = true;
            state.mcHeartsBlinkPhase = 0;
            function scheduleNextPhase() {
                state.mcHeartsBlinkTimer = later(MC_BLINK_INTERVAL_S, function () {
                    state.mcHeartsBlinkTimer = null;
                    if (!state.mcHeartsBlinking) { state.mcHeartsBlinkTimer = null; return; }
                    if (!McCanAnimate()) return;
                    state.mcHeartsBlinkPhase += 1;
                    if (state.mcHeartsBlinkPhase >= MC_BLINK_PHASE_COUNT) {
                        state.mcHeartsBlinking = false;
                        state.mcHeartsBlinkTimer = null;
                        return;
                    }
                    scheduleNextPhase();
                });
            }
            scheduleNextPhase();
        }

        function McLowHealthJiggleTick() {
                    let hearts = state.mcHeartSlots;
            if (!hearts || hearts.length === 0) return;
            let visibleCount = Math.min(state.mcLastVisibleHeartsCount, hearts.length);
            for (let i = 0; i < visibleCount; i += 1) {
                let heart = hearts[i];
                if (Math.random() < MC_JIGGLE_CHANCE) {
                    if (heart.BHasClass("LoweredHeart")) heart.RemoveClass("LoweredHeart");
                    else heart.AddClass("LoweredHeart");
                }
            }
        }

        function McResetAllHeartsPosition() {
                    if (!state.mcHeartSlots || state.mcHeartSlots.length === 0) return;
            for (let i = 0; i < state.mcHeartSlots.length; i += 1) {
                state.mcHeartSlots[i].RemoveClass("RaisedHeart");
                state.mcHeartSlots[i].RemoveClass("LoweredHeart");
            }
        }

        function McSetLowHealthJiggleEnabled(enabled) {
            if (enabled) {
                if (state.mcLowHealthJiggleActive) return;
                state.mcLowHealthJiggleActive = true;
                function scheduleNext() {
                    state.mcLowHealthJiggleTimer = later(MC_JIGGLE_INTERVAL_S, function () {
                        state.mcLowHealthJiggleTimer = null;
                        if (!state.mcLowHealthJiggleActive) { state.mcLowHealthJiggleTimer = null; return; }
                        if (!McCanAnimate()) return;
                        McLowHealthJiggleTick();
                        scheduleNext();
                    });
                }
                scheduleNext();
            } else {
                if (!state.mcLowHealthJiggleActive) return;
                state.mcLowHealthJiggleActive = false;
                if (state.mcLowHealthJiggleTimer !== null) {
                    state.mcLowHealthJiggleTimer.stop();
                    state.mcLowHealthJiggleTimer = null;
                }
                McResetAllHeartsPosition();
            }
        }

        function McHealingWaveTick() {
            if (!McCanAnimate()) return;
                    let hearts = state.mcHeartSlots;
            if (!hearts || hearts.length === 0) return;
            let visibleCount = Math.min(state.mcLastVisibleHeartsCount, hearts.length);
            if (visibleCount === 0) return;
            if (state.mcHealingWaveCurrentIndex > visibleCount) state.mcHealingWaveCurrentIndex = 0;
            if (state.mcHealingWaveCurrentIndex > 0) hearts[state.mcHealingWaveCurrentIndex - 1].RemoveClass("RaisedHeart");
            if (state.mcHealingWaveCurrentIndex >= visibleCount) {
                state.mcHealingWaveTimer = later(MC_HEALING_WAVE_PAUSE_S, function () {
                    state.mcHealingWaveTimer = null;
                    if (!state.mcHealingWaveActive) { state.mcHealingWaveTimer = null; return; }
                    state.mcHealingWaveCurrentIndex = 0;
                    McHealingWaveTick();
                });
                return;
            }
            hearts[state.mcHealingWaveCurrentIndex].AddClass("RaisedHeart");
            state.mcHealingWaveCurrentIndex += 1;
            state.mcHealingWaveTimer = later(MC_HEALING_WAVE_STEP_S, function () {
                state.mcHealingWaveTimer = null;
                if (!state.mcHealingWaveActive) { state.mcHealingWaveTimer = null; return; }
                McHealingWaveTick();
            });
        }

        function McSetHealingWaveEnabled(enabled) {
            if (enabled) {
                if (state.mcHealingWaveActive) return;
                if (state.mcLowHealthJiggleActive) return;
                state.mcHealingWaveActive = true;
                state.mcHealingWaveCurrentIndex = 0;
                McResetAllHeartsPosition();
                McHealingWaveTick();
            } else {
                if (!state.mcHealingWaveActive) return;
                state.mcHealingWaveActive = false;
                if (state.mcHealingWaveTimer !== null) {
                    state.mcHealingWaveTimer.stop();
                    state.mcHealingWaveTimer = null;
                }
                McResetAllHeartsPosition();
            }
        }

        function McCheckModifierActive(root, name) {
                    let modifierLabels = root && root.FindChildrenWithClassTraverse ? root.FindChildrenWithClassTraverse("modifier_name") : null;
            if (!modifierLabels || modifierLabels.length === 0) return false;
            for (let i = 0; i < modifierLabels.length; i += 1) {
                let label = modifierLabels[i];
                if (label.text && label.text.toUpperCase().indexOf(name) !== -1) return true;
            }
            return false;
        }

        function McEnsureHeartsCapacity(hudRoot, heartsNeeded) {
            const container = sources && sources.hearts;
            if (heartsNeeded <= 0 || !P.isAlive(container)) return false;
            let heartsNeededRowCount = Math.ceil(heartsNeeded / MC_HEARTS_PER_ROW);
            if (state.mcHeartsCapacity >= heartsNeeded && state.mcHeartSlots.length >= state.mcHeartsCapacity && state.mcHeartsRowCount === heartsNeededRowCount) return true;
            for (const row of Array.from(createdRows)) {
                if (P.isAlive(row) && row.GetParent() === container) {
                    row.visible = false; P.delete(row); createdRows.delete(row);
                }
            }
            state.mcHeartSlots = [];
            state.mcHeartContainerImages = [];
            state.mcHeartHealingImages = [];
            state.mcHeartDeferredImages = [];
            state.mcHeartFillImages = [];
            state.mcHeartsCapacity = heartsNeeded;
            state.mcLastVisibleHeartsCount = 0;
            state.mcLastIsBlinkOn = null;
            state.mcLastContainerHeartsNeeded = -1;
            state.mcLastContainerLastSlotIsHalf = null;
            state.mcLastFillFullHearts = -1;
            state.mcLastFillHasHalf = null;
            state.mcLastFillAfflicted = null;
            state.mcLastDeferredFullHearts = -1;
            state.mcLastDeferredHasHalf = null;
            state.mcLastDeferredStartSlots = -1;
            state.mcLastHealingFullHearts = -1;
            state.mcLastHealingHasHalf = null;
            state.mcLastHealingStartSlots = -1;
            let currentRow = null;
            let heartsInCurrentRow = 0;
            let rowPanels = [];
            function ensureRow() {
                if (currentRow === null || heartsInCurrentRow >= MC_HEARTS_PER_ROW) {
                    currentRow = $.CreatePanel("Panel", container, "");
                    createdRows.add(currentRow);
                    currentRow.AddClass("HeartsRow");
                    let firstChild = container.GetChild(0);
                    if (firstChild && firstChild !== currentRow) container.MoveChildBefore(currentRow, firstChild);
                    rowPanels.push(currentRow);
                    heartsInCurrentRow = 0;
                }
            }
            for (let i = 0; i < heartsNeeded; i += 1) {
                ensureRow();
                let slot = $.CreatePanel("Panel", currentRow, "");
                slot.AddClass("HeartSlot");
                let containerImg = $.CreatePanel("Image", slot, "");
                containerImg.AddClass("HeartContainer");
                setImage(containerImg, "s2r://panorama/images/minecraft/container_8x_png.vtex");
                let healingImg = $.CreatePanel("Image", slot, "");
                healingImg.AddClass("HeartHealing");
                healingImg.style.visibility = "collapse";
                let frozenImg = $.CreatePanel("Image", slot, "");
                frozenImg.AddClass("HeartDeferred");
                frozenImg.style.visibility = "collapse";
                let fillImg = $.CreatePanel("Image", slot, "");
                fillImg.AddClass("HeartFill");
                fillImg.style.visibility = "collapse";
                state.mcHeartSlots.push(slot);
                state.mcHeartContainerImages.push(containerImg);
                state.mcHeartHealingImages.push(healingImg);
                state.mcHeartDeferredImages.push(frozenImg);
                state.mcHeartFillImages.push(fillImg);
                heartsInCurrentRow += 1;
            }
            state.mcHeartsRowCount = rowPanels.length;
            if (rowPanels.length > MC_MAX_HEART_ROWS) {
                let marginTop = ((MC_MAX_HEART_ROWS * MC_HEART_ROW_HEIGHT_PX) / rowPanels.length) - MC_HEART_ROW_HEIGHT_PX;
                for (let j = 0; j < rowPanels.length - 1; j += 1) rowPanels[j].style.marginTop = marginTop + "px";
            }
            return true;
        }

        function McEnsureBarrierHeartsCapacity(hudRoot, heartsNeeded) {
            const container = sources && sources.shieldHearts;
            if (heartsNeeded <= 0 || !P.isAlive(container) || !P.isAlive(sources.shieldBox)) return false;
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
            if (state.mcBarrierHeartsCapacity >= heartsNeeded && state.mcBarrierHeartsPanels.length >= state.mcBarrierHeartsCapacity) return true;
            for (const row of Array.from(createdRows)) {
                if (P.isAlive(row) && row.GetParent() === container) {
                    row.visible = false; P.delete(row); createdRows.delete(row);
                }
            }
            state.mcBarrierHeartsPanels = [];
            state.mcBarrierHeartContainerImages = [];
            state.mcBarrierHeartFillImages = [];
            state.mcBarrierHeartsCapacity = heartsNeeded;
            let currentRow = null;
            let heartsInCurrentRow = 0;
            function ensureRow() {
                if (currentRow === null || heartsInCurrentRow >= MC_HEARTS_PER_ROW) {
                    currentRow = $.CreatePanel("Panel", container, "");
                    createdRows.add(currentRow);
                    currentRow.AddClass("HeartsRow");
                    let firstChild = container.GetChild(0);
                    if (firstChild && firstChild !== currentRow) container.MoveChildBefore(currentRow, firstChild);
                    heartsInCurrentRow = 0;
                }
            }
            for (let i = 0; i < heartsNeeded; i += 1) {
                ensureRow();
                let slot = $.CreatePanel("Panel", currentRow, "");
                slot.AddClass("HeartSlot");
                let containerImg = $.CreatePanel("Image", slot, "");
                containerImg.AddClass("HeartContainer");
                setImage(containerImg, "s2r://panorama/images/minecraft/container_8x_png.vtex");
                let fillImg = $.CreatePanel("Image", slot, "");
                fillImg.AddClass("HeartFill");
                fillImg.style.visibility = "collapse";
                state.mcBarrierHeartsPanels.push(slot);
                state.mcBarrierHeartContainerImages.push(containerImg);
                state.mcBarrierHeartFillImages.push(fillImg);
                heartsInCurrentRow += 1;
            }
            return true;
        }

        function McUpdateHearts(trueHp, totalHp, afflicted) {
                    let hudRoot = runtimeRoot;
            if (!hudRoot) return;
            let isBlinkOn = state.mcHeartsBlinking && (state.mcHeartsBlinkPhase % 2 === 0);
            let totalHalfSegments = Math.max(0, Math.ceil(totalHp / MC_HP_PER_HALF_SEGMENT));
            let heartsNeeded = Math.max(1, Math.ceil(totalHalfSegments / 2));
            let currentHalfSegments = Math.ceil(trueHp / MC_HP_PER_HALF_SEGMENT);
            if (currentHalfSegments < 0) currentHalfSegments = 0;
            if (currentHalfSegments > totalHalfSegments) currentHalfSegments = totalHalfSegments;
            let fullHearts = Math.floor(currentHalfSegments / 2);
            let hasHalfHeart = (currentHalfSegments % 2) === 1;
            if (!McEnsureHeartsCapacity(hudRoot, heartsNeeded)) return;
            let lastSlotIsHalf = (totalHalfSegments % 2) === 1;
            if (isBlinkOn !== state.mcLastIsBlinkOn || heartsNeeded !== state.mcLastContainerHeartsNeeded || lastSlotIsHalf !== state.mcLastContainerLastSlotIsHalf) {
                state.mcLastIsBlinkOn = isBlinkOn;
                state.mcLastContainerHeartsNeeded = heartsNeeded;
                state.mcLastContainerLastSlotIsHalf = lastSlotIsHalf;
                for (let i = 0; i < state.mcHeartSlots.length; i += 1) {
                    let slot = state.mcHeartSlots[i];
                    let container = state.mcHeartContainerImages[i];
                    if (i >= heartsNeeded) { slot.style.visibility = "collapse"; continue; }
                    slot.style.visibility = "visible";
                    let isLastSlot = lastSlotIsHalf && (i === heartsNeeded - 1);
                    if (isLastSlot) setImage(container, isBlinkOn ? "s2r://panorama/images/minecraft/container_blinking_half_8x_png.vtex" : "s2r://panorama/images/minecraft/container_half_8x_png.vtex");
                    else setImage(container, isBlinkOn ? "s2r://panorama/images/minecraft/container_blinking_8x_png.vtex" : "s2r://panorama/images/minecraft/container_8x_png.vtex");
                }
            }
            if (fullHearts !== state.mcLastFillFullHearts || hasHalfHeart !== state.mcLastFillHasHalf || afflicted !== state.mcLastFillAfflicted) {
                state.mcLastFillFullHearts = fullHearts;
                state.mcLastFillHasHalf = hasHalfHeart;
                state.mcLastFillAfflicted = afflicted;
                let texturePrefix = afflicted ? "poisoned_" : "";
                for (let i = 0; i < state.mcHeartFillImages.length; i += 1) {
                    let fill = state.mcHeartFillImages[i];
                    fill.RemoveClass("full"); fill.RemoveClass("half"); fill.RemoveClass("empty");
                    if (i < fullHearts) {
                        fill.AddClass("full"); fill.style.visibility = "visible";
                        setImage(fill, "s2r://panorama/images/minecraft/" + texturePrefix + "full_8x_png.vtex");
                    } else if (i === fullHearts && hasHalfHeart) {
                        fill.AddClass("half"); fill.style.visibility = "visible";
                        setImage(fill, "s2r://panorama/images/minecraft/" + texturePrefix + "half_8x_png.vtex");
                    } else {
                        fill.AddClass("empty"); fill.style.visibility = "collapse";
                    }
                }
            }
            state.mcLastVisibleHeartsCount = heartsNeeded;
        }

        function McUpdateDeferredHearts(trueHp, deferredDamage, totalHp) {
                    if (state.mcHeartDeferredImages.length === 0) return;
            let totalHalfSegments = Math.max(0, Math.ceil(totalHp / MC_HP_PER_HALF_SEGMENT));
            let trueHalfSegs = Math.ceil(trueHp / MC_HP_PER_HALF_SEGMENT);
            let deferredHalfSegs = deferredDamage > 0 ? Math.ceil(deferredDamage / MC_HP_PER_HALF_SEGMENT) : 0;
            let orangeHalfSegments = trueHalfSegs + deferredHalfSegs;
            if (orangeHalfSegments < 0) orangeHalfSegments = 0;
            if (orangeHalfSegments > totalHalfSegments) orangeHalfSegments = totalHalfSegments;
            let fullHearts = Math.floor(orangeHalfSegments / 2);
            let hasHalfHeart = (orangeHalfSegments % 2) === 1;
            let fillFullSlots = Math.floor(Math.ceil(trueHp / MC_HP_PER_HALF_SEGMENT) / 2);
            if (fullHearts === state.mcLastDeferredFullHearts && hasHalfHeart === state.mcLastDeferredHasHalf && fillFullSlots === state.mcLastDeferredStartSlots) return;
            state.mcLastDeferredFullHearts = fullHearts;
            state.mcLastDeferredHasHalf = hasHalfHeart;
            state.mcLastDeferredStartSlots = fillFullSlots;
            for (let i = 0; i < state.mcHeartDeferredImages.length; i += 1) {
                let deferred = state.mcHeartDeferredImages[i];
                if (i < fillFullSlots) { deferred.style.visibility = "collapse"; continue; }
                deferred.RemoveClass("full"); deferred.RemoveClass("half"); deferred.RemoveClass("empty");
                if (i < fullHearts) {
                    deferred.AddClass("full"); deferred.style.visibility = "visible";
                    setImage(deferred, "s2r://panorama/images/minecraft/orange_full_8x_png.vtex");
                } else if (i === fullHearts && hasHalfHeart) {
                    deferred.AddClass("half"); deferred.style.visibility = "visible";
                    setImage(deferred, "s2r://panorama/images/minecraft/orange_half_8x_png.vtex");
                } else {
                    deferred.AddClass("empty"); deferred.style.visibility = "collapse";
                }
            }
        }

        function McUpdateHealingHearts(currentHp, healingHp, totalHp) {
                    if (state.mcHeartHealingImages.length === 0) return;
            let totalHalfSegments = Math.max(0, Math.ceil(totalHp / MC_HP_PER_HALF_SEGMENT));
            let healingHalfSegments = Math.ceil(healingHp / MC_HP_PER_HALF_SEGMENT);
            if (healingHalfSegments < 0) healingHalfSegments = 0;
            if (healingHalfSegments > totalHalfSegments) healingHalfSegments = totalHalfSegments;
            let fullHearts = Math.floor(healingHalfSegments / 2);
            let hasHalfHeart = (healingHalfSegments % 2) === 1;
            let healingStartSlots = Math.floor(Math.ceil(currentHp / MC_HP_PER_HALF_SEGMENT) / 2);
            if (fullHearts === state.mcLastHealingFullHearts && hasHalfHeart === state.mcLastHealingHasHalf && healingStartSlots === state.mcLastHealingStartSlots) return;
            state.mcLastHealingFullHearts = fullHearts;
            state.mcLastHealingHasHalf = hasHalfHeart;
            state.mcLastHealingStartSlots = healingStartSlots;
            for (let i = 0; i < state.mcHeartHealingImages.length; i += 1) {
                let healing = state.mcHeartHealingImages[i];
                if (i < healingStartSlots) { healing.style.visibility = "collapse"; continue; }
                healing.RemoveClass("full"); healing.RemoveClass("half"); healing.RemoveClass("empty");
                if (i < fullHearts) {
                    healing.AddClass("full"); healing.style.visibility = "visible";
                    setImage(healing, "s2r://panorama/images/minecraft/green_full_8x_png.vtex");
                } else if (i === fullHearts && hasHalfHeart) {
                    healing.AddClass("half"); healing.style.visibility = "visible";
                    setImage(healing, "s2r://panorama/images/minecraft/green_half_8x_png.vtex");
                } else {
                    healing.AddClass("empty"); healing.style.visibility = "collapse";
                }
            }
        }

        function McUpdateBarrierHearts(currentBarrier, totalBarrier, hasBarrier) {
                    let hudRoot = runtimeRoot;
            if (!hudRoot) return;
            if (!hasBarrier) {
                if ((sources && sources.shieldBox)) ownStyle((sources && sources.shieldBox), 'visibility', "collapse");
                state.mcLastBarrierFullHearts = -1;
                state.mcLastBarrierHasHalf = null;
                state.mcLastBarrierLastSlotIsHalf = null;
                state.mcLastBarrierHeartsNeeded = -1;
                return;
            }
            let totalHalfSegments = Math.ceil(totalBarrier / MC_HP_PER_HALF_SEGMENT);
            let heartsNeeded = Math.ceil(totalHalfSegments / 2);
            if (!McEnsureBarrierHeartsCapacity(hudRoot, heartsNeeded)) return;
            ownStyle((sources && sources.shieldBox), 'visibility', "visible");
            let lastSlotIsHalf = (totalHalfSegments % 2) === 1;
            let currentHalfSegments = Math.ceil(currentBarrier / MC_HP_PER_HALF_SEGMENT);
            let fullHearts = Math.floor(currentHalfSegments / 2);
            let hasHalfHeart = (currentHalfSegments % 2) === 1;
            // heartsNeeded belongs in this signature because the loop below uses it to
            // decide which slots are surplus and must be collapsed. It was left out
            // while capacity was rebuilt on every change of it — the teardown masked
            // the omission. Now that capacity only grows, a barrier maximum that drops
            // within the existing capacity (500→300 while the barrier is empty) leaves
            // fullHearts, hasHalfHeart and lastSlotIsHalf all unchanged, so the early
            // return fires and the two surplus heart outlines stay on screen. The main
            // heart path already includes its own count for the same reason
            // (McUpdateHearts / mcLastContainerHeartsNeeded).
            if (fullHearts === state.mcLastBarrierFullHearts &&
                hasHalfHeart === state.mcLastBarrierHasHalf &&
                lastSlotIsHalf === state.mcLastBarrierLastSlotIsHalf &&
                heartsNeeded === state.mcLastBarrierHeartsNeeded) return;
            state.mcLastBarrierFullHearts = fullHearts;
            state.mcLastBarrierHasHalf = hasHalfHeart;
            state.mcLastBarrierLastSlotIsHalf = lastSlotIsHalf;
            state.mcLastBarrierHeartsNeeded = heartsNeeded;
            for (let i = 0; i < state.mcBarrierHeartsPanels.length; i += 1) {
                let container = state.mcBarrierHeartContainerImages[i];
                let fill = state.mcBarrierHeartFillImages[i];
                // Capacity only grows now (see McEnsureBarrierHeartsCapacity), so the
                // array can be longer than heartsNeeded. Collapse the whole surplus
                // slot: collapsing only its fill would leave a visible empty heart
                // outline from a barrier maximum the player no longer has.
                let slot = state.mcBarrierHeartsPanels[i];
                if (i >= heartsNeeded) {
                    if (slot) slot.style.visibility = "collapse";
                    continue;
                }
                if (slot) slot.style.visibility = "visible";
                let isLastSlot = lastSlotIsHalf && (i === heartsNeeded - 1);
                setImage(container, isLastSlot ? "s2r://panorama/images/minecraft/container_half_8x_png.vtex" : "s2r://panorama/images/minecraft/container_8x_png.vtex");
                fill.RemoveClass("full"); fill.RemoveClass("half"); fill.RemoveClass("empty");
                if (i < fullHearts) {
                    fill.AddClass("full"); fill.style.visibility = "visible";
                    setImage(fill, "s2r://panorama/images/minecraft/absorption_full_8x_png.vtex");
                } else if (i === fullHearts && hasHalfHeart) {
                    fill.AddClass("half"); fill.style.visibility = "visible";
                    setImage(fill, "s2r://panorama/images/minecraft/absorption_half_8x_png.vtex");
                } else {
                    fill.AddClass("empty"); fill.style.visibility = "collapse";
                }
            }
        }

        // Source: ProgressBarWithMiddle native parents in hud_health.xml and
        // their .ProgressBarMiddle children in native hud_health.css. Historical
        // guessed "*_Middle" IDs are not a Panorama contract.
        function readPendingFraction(hudRoot, id) {
            const bar = P.findChild(sources && sources.bars, id);
            const middle = U.FindFirstPanelByClass(bar, "ProgressBarMiddle");
            if (!P.isAlive(bar) || !P.isAlive(middle)) return 0;
            const part = Number(middle.actuallayoutheight);
            const whole = Number(bar.actuallayoutheight);
            if (part >= 0 && whole > 0) return Math.max(0, Math.min(1, part / whole));
            const height = String(middle.style && middle.style.height || "");
            if (height.endsWith("%")) return Math.max(0, Math.min(1, parseFloat(height) / 100 || 0));
            return 0;
        }
        function McParseDeferredDamage(hudRoot) { return readPendingFraction(hudRoot, "pending_incoming_damage"); }
        function McParseIncomingHeal(hudRoot) { return readPendingFraction(hudRoot, "pending_incoming_heal"); }

        function McReadHealthValues(hudRoot) {
            const numbers = sources && sources.nativeNumbers || P.findChild(hudRoot, "HealthRegenAndTotal");
            const group = U.FindFirstPanelByClass(numbers, "healthContainer");
            function label(className, outputId, ids) {
                const native = U.FindFirstPanelByClass(group || numbers, className);
                if (P.isAlive(native)) return native;
                const candidates = U.FindPanelsByClass(hudRoot, className) || [];
                const candidate = candidates.find(panel => P.isAlive(panel) && panel.id !== outputId);
                if (candidate) return candidate;
                for (const id of ids) {
                    const panel = P.findTraverse(hudRoot, id);
                    if (P.isAlive(panel)) return panel;
                }
                return P.findTraverse(hudRoot, outputId);
            }
            const current = label("currentHealthLabel", "currentHealthOverHearts", ["currentHealthLabel", "current_health"]);
            const total = label("totalHealthLabel", "totalHealthOverHearts", ["totalHealthLabel", "max_health"]);
            if (!P.isAlive(current) || !P.isAlive(total)) return null;
            const parse = panel => {
                const text = String(panel.text || "").replace(/[^0-9]/g, "");
                return text ? Number(text) : NaN;
            };
            const hp = parse(current), max = parse(total);
            return Number.isFinite(hp) && Number.isFinite(max) && max > 0
                ? { currentHealth: hp, totalHealth: max } : null;
        }

        function McComputeHealthState(currentHealth, totalHealth, hudRoot, nowMs) {
            let deferredFraction = McParseDeferredDamage(hudRoot, nowMs);
            let deferredDamage = Math.round(deferredFraction * totalHealth);
            let trueCurrentHealth = Math.max(0, currentHealth - deferredDamage);
            let incomingHealFraction = McParseIncomingHeal(hudRoot, nowMs);
            let incomingHealAmount = Math.round(incomingHealFraction * totalHealth);
            let healingHealth = Math.min(totalHealth, currentHealth + incomingHealAmount);
            let currentHalfSegments = Math.ceil(trueCurrentHealth / MC_HP_PER_HALF_SEGMENT);
            let effectiveHalfSegments = Math.ceil(currentHealth / MC_HP_PER_HALF_SEGMENT);
            let hasIncomingHeal = incomingHealAmount > 0;
            return { deferredDamage: deferredDamage, trueCurrentHealth: trueCurrentHealth, healingHealth: healingHealth, currentHalfSegments: currentHalfSegments, effectiveHalfSegments: effectiveHalfSegments, hasIncomingHeal: hasIncomingHeal };
        }

        function McResolveChargesContainer(root) {
            // Prefer the live crosshair; a settings preview must not become the
            // player's stamina source. The class/ID pair is verified native markup.
            const crosshair = P.findTraverse(root, "crosshair");
            const search = P.isAlive(crosshair) ? crosshair : root;
            const elements = U.FindPanelsByClass(search, "ability_element_charges") || [];
            for (const element of elements) {
                const container = element.id === "charges_container" ? element : P.findTraverse(element, "charges_container");
                if (P.isAlive(container) && (U.FindPanelsByClass(container, "charge") || []).length) return container;
            }
            const direct = P.findTraverse(search, "charges_container");
            return P.isAlive(direct) && (U.FindPanelsByClass(direct, "charge") || []).length ? direct : null;
        }

        function McParseChargesForHunger(root) {
                    let container = McResolveChargesContainer(root);
            if (!container) return null;

            let allCharges = container.FindChildrenWithClassTraverse ? container.FindChildrenWithClassTraverse("charge") : null;
            if (!allCharges || allCharges.length === 0) return null;

            let maxCharges = 0;
            let activeCharges = [];
            for (let i = 0; i < allCharges.length; i += 1) {
                if (allCharges[i].BHasClass("has_charge")) {
                    maxCharges += 1;
                    activeCharges.push(allCharges[i]);
                }
            }
            if (maxCharges === 0) return null;

            let maxAngle = MC_CHARGE_MAX_ANGLES[maxCharges] || 26;
            let totalChargeValue = 0;

            for (let i = 0; i < activeCharges.length; i += 1) {
                let charge = activeCharges[i];
                let isCharging = charge.BHasClass("charging");
                let isDraining = charge.BHasClass("draining") || charge.BHasClass("drained");
                let isDisabled = charge.BHasClass("disabled");

                if (!isCharging && !isDraining && !isDisabled) {
                    // Ready / full dash charge
                    totalChargeValue += 1.0;
                } else if (isCharging) {
                    // Actively recharging
                    let chargeFgElements = charge.FindChildrenWithClassTraverse ? charge.FindChildrenWithClassTraverse("charge_fg") : null;
                    let chargeFg = (chargeFgElements && chargeFgElements.length > 0) ? chargeFgElements[0] : null;
                    let clipStyle = (chargeFg && chargeFg.style && chargeFg.style.clip) ? chargeFg.style.clip.toString() : "";
                    let match = clipStyle.match(/radial\([^,]+,[^,]+,\s*([\d.]+)deg\s*\)/);
                    if (match) {
                        let extentAngle = parseFloat(match[1]) || 0;
                        let progress = (extentAngle > maxAngle) ? (extentAngle / 360) : (extentAngle / maxAngle);
                        totalChargeValue += Math.min(Math.max(progress, 0.0), 1.0);
                    } else {
                        // Recharging
                        totalChargeValue += 0.2;
                    }
                }
                // isDraining || isDisabled -> 0.0
            }

            let hungerPercent = Math.round((totalChargeValue / maxCharges) * 100);
            if (hungerPercent < 0) hungerPercent = 0;
            if (hungerPercent > 100) hungerPercent = 100;

            return { percent: hungerPercent, chargesFilled: totalChargeValue, maxCharges: maxCharges };
        }

        function McUpdateFood(percent) {
            const food = sources && sources.food;
            if (!P.isAlive(food)) return;
            const icons = food.Children().filter(panel => P.isAlive(panel) && panel.BHasClass("FoodIcon"));
            for (const previous of Array.from(foodOwners)) {
                if (icons.includes(previous)) continue;
                if (P.isAlive(previous)) previous.SetImage("s2r://panorama/images/minecraft/food_8x_png.vtex");
                foodOwners.delete(previous); imageSignatures.delete(previous);
            }
            const half = Math.round(Math.max(0, Math.min(100, percent)) / MC_FOOD_PERCENT_PER_HALF);
            const full = Math.floor(half / 2), hasHalf = half % 2 === 1;
            for (let index = 0; index < icons.length; index++) {
                const reverse = icons.length - 1 - index;
                const asset = reverse < full ? "food_8x_png" : reverse === full && hasHalf ? "food_half_8x_png" : "food_empty_8x_png";
                setImage(icons[index], "s2r://panorama/images/minecraft/" + asset + ".vtex");
                foodOwners.add(icons[index]);
            }
        }

        function readExperience(root) {
            const gold = goldResolver.resolve(root);
            const fill = P.findTraverse(gold, "SoulsFill");
            const label = P.findTraverse(gold, "PlayerLevelNumber");
            let percent = null, level = null;
            if (P.isAlive(fill)) {
                const value = Number(fill.actuallayoutheight), scale = Number(fill.actualuiscale_y);
                let height = value > 0 && scale > 0 ? value / scale : parseFloat(fill.style.height) || 0;
                percent = Math.max(0, Math.min(100, Math.round(height / MC_SOULS_BAR_MAX_HEIGHT_PX * 100)));
            }
            if (P.isAlive(label)) level = String(parseInt(String(label.text || "").replace(/[^0-9]/g, ""), 10) || 0);
            return { percent, level };
        }

        function McUpdateAnimationState(currentHalfSegments, effectiveHalfSegments, hasIncomingHeal) {
            if (state.mcLastBlinkHalfSegments !== null && effectiveHalfSegments !== state.mcLastBlinkHalfSegments) McStartHeartsBlink();
            state.mcLastBlinkHalfSegments = effectiveHalfSegments;
            let isLowHealth = currentHalfSegments <= MC_LOW_HEALTH_HALF_SEGMENTS;
            McSetLowHealthJiggleEnabled(isLowHealth);
            McSetHealingWaveEnabled(!isLowHealth && hasIncomingHeal);
        }

        function renderTotem(hasRejuvenator) {
            ownStyle(sources && sources.totem, "visibility", hasRejuvenator ? "visible" : "collapse");
        }

        function readBarrier(hudRoot) {
            const shields = sources && sources.shields;
            const numbers = P.findChild(sources && sources.nativeNumbers, "BulletShieldNumbers") || P.findChild(hudRoot, "BulletShieldNumbers");
            const current = U.FindFirstPanelByClass(numbers, "progress_bar_current");
            const maximum = U.FindFirstPanelByClass(numbers, "progress_bar_max");
            const parse = panel => parseInt(String(panel && panel.text || "").replace(/[^0-9]/g, ""), 10) || 0;
            return {
                hasBarrier: P.isAlive(shields) && shields.BHasClass("HasBulletShield") && P.isAlive(current) && P.isAlive(maximum),
                current: parse(current), maximum: parse(maximum)
            };
        }

        function readModel(root, hudRoot, nowMs) {
            const health = McReadHealthValues(hudRoot);
            if (!health) return null;
            const hp = McComputeHealthState(health.currentHealth, health.totalHealth, hudRoot, nowMs);
            if (nowMs >= state.mcCheckModifierNextMs) {
                state.mcLastModifierResult = McCheckModifierActive(root, "AFFLICTED");
                state.mcCheckModifierNextMs = nowMs + MC_MODIFIER_THROTTLE_MS;
            }
            const bars = sources && sources.bars;
            return { ...health, ...hp, afflicted: state.mcLastModifierResult,
                barrier: readBarrier(hudRoot), experience: readExperience(root),
                hunger: McParseChargesForHunger(root),
                hasRejuvenator: P.isAlive(bars) && bars.BHasClass("HasRejuvenator") };
        }

        function render(model) {
            // currentHealthOverHearts / totalHealthOverHearts retain their native
            // dialog-variable bindings; only the derived percentage is our text.
            const percent = sources && sources.percent;
            ownText(percent, "  [" + Math.floor(model.currentHealth / model.totalHealth * 100) + "%]");
            McUpdateHearts(model.trueCurrentHealth, model.totalHealth, model.afflicted);
            McUpdateHealingHearts(model.currentHealth, model.healingHealth, model.totalHealth);
            McUpdateDeferredHearts(model.trueCurrentHealth, model.deferredDamage, model.totalHealth);
            McUpdateBarrierHearts(model.barrier.current, model.barrier.maximum, model.barrier.hasBarrier);
            renderTotem(model.hasRejuvenator);
            if (model.experience.percent !== null) {
                ownStyle(sources && sources.xpFill, "clip",
                    "rect( 0px, " + model.experience.percent + "%, 100%, 0px )");
            }
            if (model.experience.level !== null) ownText(sources && sources.xpLevel, model.experience.level);
            if (model.hunger) McUpdateFood(model.hunger.percent);
            McUpdateAnimationState(model.currentHalfSegments, model.effectiveHalfSegments, model.hasIncomingHeal);
        }

        function invalidateSignatures() {
            for (const key of Object.keys(state)) {
                if (key.startsWith("mcLast") && key !== "mcLastModifierResult" && key !== "mcLastVisibleHeartsCount") state[key] = null;
            }
            imageSignatures.clear();
        }

        function UpdateMinecraftHealthbar(root, cfg, nowMs, enabled) {
            if (!enabled || !P.isAlive(root) || QOL.core.hud.isInHideout(root)) { McResetRuntime(); return; }
            if (runtimeRoot && (!P.isAlive(runtimeRoot) || !belongs(runtimeRoot, root))) McResetRuntime();
            contextRoot = root;
            const hudRoot = McResolveHudRoot(root);
            const now = Number(nowMs) || 0;
            if (now < state.mcNextUpdateMs) return;
            if (!P.isAlive(hudRoot)) { state.mcNextUpdateMs = now + 400; return; }
            runtimeRoot = hudRoot;
            contextRoot = root;
            const model = readModel(root, hudRoot, now);
            if (!model) {
                McSetLowHealthJiggleEnabled(false);
                McSetHealingWaveEnabled(false);
                state.mcNextUpdateMs = now + 200;
                return;
            }
            try {
                render(model);
                state.mcWasEnabled = true;
                state.mcNextUpdateMs = now + MC_TICK_INTERVAL_MS;
            } catch (error) {
                invalidateSignatures();
                throw error;
            }
        }


        return { update: UpdateMinecraftHealthbar, release: McResetRuntime,
            isActive: () => state.mcWasEnabled || runtimeRoot !== null,
            inspect: () => ({ active: state.mcWasEnabled, source: runtimeRoot,
                hearts: state.mcHeartSlots.filter(P.isAlive).length,
                blinking: state.mcHeartsBlinking, lowHealth: state.mcLowHealthJiggleActive,
                healing: state.mcHealingWaveActive,
                pendingAnimations: [state.mcHeartsBlinkTimer, state.mcLowHealthJiggleTimer, state.mcHealingWaveTimer]
                    .filter(timer => timer !== null).length }) };
    });
})();

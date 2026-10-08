// features/ql_healthbar/manifest.js
// =============================================================================
// QOLLOCK — Healthbar Runtime
// =============================================================================
// OWNS:        Healthbar type dispatcher with variant routing
// DOES NOT OWN: TODO
// DEPENDS ON:  QOL.core.FeatureRegistry, QOL.core.Scheduler
// CONFIG KEYS: HEALTHBAR_TYPE, PLAYER_HEALTHBAR_SCALE, PLAYER_HEALTHBAR_OPACITY, PLAYER_HEALTHBAR_X_OFFSET, PLAYER_HEALTHBAR_Y_OFFSET, PLAYER_HEALTHBAR_ACCENT_COLOR
// CSS:         none
// PATTERN:     Polling (0.1Hz). Self-scheduling via Scheduler.
// =============================================================================

(function() {
    "use strict";

    var FR = QOL.core.FeatureRegistry;
    if (!FR) { $.Msg("[QOLLock] ql_healthbar: FeatureRegistry not found — aborting"); return; }
    var logger = QOL.core.Logger;

    var State = (typeof QOL !== "undefined" && QOL.state) ? QOL.state : {};

    function _hasNonDefaultPlayerHealthbar(cfg) {
        if (!cfg) return false;
        var ox = (cfg.PLAYER_HEALTHBAR_X_OFFSET === undefined || cfg.PLAYER_HEALTHBAR_X_OFFSET === null) ? 0 : Math.round(Number(cfg.PLAYER_HEALTHBAR_X_OFFSET));
        var oy = (cfg.PLAYER_HEALTHBAR_Y_OFFSET === undefined || cfg.PLAYER_HEALTHBAR_Y_OFFSET === null) ? 0 : Math.round(Number(cfg.PLAYER_HEALTHBAR_Y_OFFSET));
        var sc = (cfg.PLAYER_HEALTHBAR_SCALE === undefined || cfg.PLAYER_HEALTHBAR_SCALE === null) ? 100 : Math.round(Number(cfg.PLAYER_HEALTHBAR_SCALE));
        var op = (cfg.PLAYER_HEALTHBAR_OPACITY === undefined || cfg.PLAYER_HEALTHBAR_OPACITY === null) ? 1.0 : Number(cfg.PLAYER_HEALTHBAR_OPACITY);
        var ac = (cfg.PLAYER_HEALTHBAR_ACCENT_COLOR === undefined || cfg.PLAYER_HEALTHBAR_ACCENT_COLOR === null) ? 0 : Math.round(Number(cfg.PLAYER_HEALTHBAR_ACCENT_COLOR));
        if (!isFinite(ox)) ox = 0;
        if (!isFinite(oy)) oy = 0;
        if (!isFinite(sc)) sc = 100;
        if (!isFinite(op)) op = 1.0;
        if (!isFinite(ac)) ac = 0;
        return (ox !== 0 || oy !== 0 || sc !== 100 || Math.abs(op - 1.0) > 0.0001 || ac !== 0);
    }

    FR.register({
        id: "ql_healthbar",
        enabledByDefault: true,
        stateKeys: [
            // Dispatcher (35 keys from ql_feat_healthbar.js)
            "minimalistHealthbarOffsetSig", "minimalistHealthbarOffsetApplied",
            "minimalistHealthbarOffsetPanel", "playerHealthbarScalePanel", "playerHealthbarScaleOpacityRuntimeApplied",
            "budhudWasEnabled", "budhudNextUpdateMs",
            "budhudLastColor", "budhudLastPercentText",
            "budhudCurrentLabelBaseColor", "budhudCurrentLabelBaseColorCaptured",
            "mcWasEnabled", "mcNextUpdateMs",
            "mcHeartsBlinkTimer", "mcLowHealthJiggleTimer", "mcHealingWaveTimer",
            "mcIsAfflicted", "mcCheckModifierNextMs",
            "mcHeartSlots", "mcHeartContainerImages", "mcHeartHealingImages",
            "mcHeartDeferredImages", "mcHeartFillImages",
            "mcHeartsCapacity", "mcHeartsRowCount", "mcLastVisibleHeartsCount",
            "mcBarrierHeartsPanels", "mcBarrierHeartContainerImages",
            "mcBarrierHeartFillImages", "mcBarrierHeartsCapacity",
            "mcCachedFoodIcons", "mcLoggedHealthContainerMiss",
            "coloredHealthbarBridgeValue", "playerHealthbarAccentColorSig",
            "playerHealthbarAccentColorPanels", "playerHealthbarAccentColorToken",
            // Budhud orphans (2)
            "coloredHealthbarPulseVal", "coloredHealthbarPulseDir",
            // FG orphans (13)
            "fgHeroImageOriginalParent", "fgHeroImageOriginalIndex",
            "fgHeroImageSwapCandidateSig", "fgHeroImageSwapCandidateHits",
            "fgHeroImageSwapCandidatePanel", "fgHeroImageMoved",
            "fgHeroImageRuntimeStyleSig", "fgHeroRuntimeLevelPanel",
            "fgHeroRuntimeHeroPanel", "fgHeroImageCurrentSig",
            "fgHeroImagePendingAttachMs", "fgHeroImageSourceProbeNextMs",
            // MC orphans (24)
            "mcLoggedGoldApMiss", "mcLoggedBulletBarrierMiss",
            "mcLastModifierResult", "mcLastBlinkHalfSegments", "mcLastIsBlinkOn",
            "mcLastContainerHeartsNeeded", "mcLastContainerLastSlotIsHalf",
            "mcLastFillFullHearts", "mcLastFillHasHalf", "mcLastFillAfflicted",
            "mcLastDeferredFullHearts", "mcLastDeferredHasHalf", "mcLastDeferredStartSlots",
            "mcLastHealingFullHearts", "mcLastHealingHasHalf", "mcLastHealingStartSlots",
            "mcLastBarrierFullHearts", "mcLastBarrierHasHalf", "mcLastBarrierLastSlotIsHalf",
            "mcHeartsBlinking", "mcHeartsBlinkPhase",
            "mcLowHealthJiggleActive", "mcHealingWaveActive", "mcHealingWaveCurrentIndex"
        ],
        settings: [
            { key: "HEALTHBAR_TYPE", type: "dropdown", options: [0,1,2,3,4,5], default: 0 },
            { key: "ENABLE_MINECRAFT_HEALTH_NUMBERS", type: "toggle", default: false, label: "Health Numbers", description: "Show current / max HP numbers over the Minecraft hearts." },
            { key: "PLAYER_HEALTHBAR_SCALE", type: "slider", min: 50, max: 200, step: 1, default: 100 },
            { key: "PLAYER_HEALTHBAR_OPACITY", type: "slider", min: 0, max: 1, step: 0.05, default: 1 },
            { key: "PLAYER_HEALTHBAR_X_OFFSET", type: "slider", min: -1000, max: 1000, step: 5, default: 0 },
            { key: "PLAYER_HEALTHBAR_Y_OFFSET", type: "slider", min: -1000, max: 1000, step: 5, default: 0 },
            { key: "PLAYER_HEALTHBAR_ACCENT_COLOR", type: "palette", default: 0 }
        ],
        create: function(ctx) {
            var _loop = null;

            function _tick() {
                try { _update(); } catch(e) {
                    if (logger && logger.logError) {
                        logger.logError("ql_healthbar", "_tick threw: " + (e.message || e));
                    }
                }
            }

            function _update() {
                var root = $.GetContextPanel();
                if (!root) return;
                var cfg = (ctx && ctx.config && ctx.config.all) ? ctx.config.all() : ((typeof State !== "undefined" && State.lastConfig) ? State.lastConfig : {});
                if (QOL.core.hud.isInHideout(root)) {
                    // The HUD can survive a match exit. Stop variant-owned raw
                    // schedules before idling; Scheduler only owns this poll.
                    QOL.healthbar.mc.update(root, {}, 0, false);
                    QOL.healthbar.budhud.update(root, {}, 0, 0);
                    var hideoutType = Number(cfg.HEALTHBAR_TYPE) || 0;
                    var runNativeStyle = hideoutType === 1 || _hasNonDefaultPlayerHealthbar(cfg) ||
                        !!State.playerHealthbarAccentColorSig || State.minimalistHealthbarOffsetApplied ||
                        State.playerHealthbarScaleOpacityRuntimeApplied;
                    if (runNativeStyle && QOL.healthbar.minimalist && QOL.healthbar.minimalist.update) {
                        QOL.healthbar.minimalist.update(root, cfg, hideoutType === 1);
                    }
                    QOL.healthbar.fg.update(root, cfg);
                    if (_loop) _loop.reschedule(0.5);
                    return;
                }
                if (_loop) _loop.reschedule(0.05);
                var nowMs = Date.now ? Date.now() : (new Date()).getTime();
                var healthbarType = Number(cfg.HEALTHBAR_TYPE) || 0;
                var minimalistHealthbarEnabled = (healthbarType === 1);
                var fgHealthbarEnabled = (healthbarType === 2);

                var shouldRunMinimalistRuntime =
                    minimalistHealthbarEnabled ||
                    _hasNonDefaultPlayerHealthbar(cfg) ||
                    !!(State.playerHealthbarAccentColorSig && String(State.playerHealthbarAccentColorSig).length > 0) ||
                    State.minimalistHealthbarOffsetApplied ||
                    State.playerHealthbarScaleOpacityRuntimeApplied;
                if (shouldRunMinimalistRuntime && QOL.healthbar && QOL.healthbar.minimalist && QOL.healthbar.minimalist.update) {
                    QOL.healthbar.minimalist.update(root, cfg, minimalistHealthbarEnabled);
                }

                var shouldRunBudhudRuntime = (healthbarType === 4) || State.budhudWasEnabled;
                if (shouldRunBudhudRuntime && QOL.healthbar && QOL.healthbar.budhud && QOL.healthbar.budhud.update) {
                    QOL.healthbar.budhud.update(root, cfg, healthbarType, nowMs);
                }

                var shouldRunFgRuntime = fgHealthbarEnabled || QOL.healthbar.fg.isActive();
                if (shouldRunFgRuntime && QOL.healthbar && QOL.healthbar.fg && QOL.healthbar.fg.update) {
                    QOL.healthbar.fg.update(root, cfg);
                }

                var shouldRunMinecraftRuntime = (healthbarType === 5) || State.mcWasEnabled;
                if (shouldRunMinecraftRuntime && QOL.healthbar && QOL.healthbar.mc && QOL.healthbar.mc.update) {
                    QOL.healthbar.mc.update(root, cfg, nowMs, healthbarType === 5);
                }
            }

            return {
                onEnable: function() {
                    var S = QOL.core.Scheduler;
                    // rate-exempt: 20Hz (0.05s) required for custom animated healthbars (budhud/minecraft)
                    _loop = S && S.createPollLoop ? S.createPollLoop(_tick, 0.05, "ql_healthbar") : null;
                    _update();
                },
                onDisable: function() {
                    if (_loop) { _loop.stop(); _loop = null; }
                    var S = QOL.core.Scheduler;
                    if (S) S.cancelAllForFeature("ql_healthbar");
                    if (logger && logger.clearThrottle) logger.clearThrottle("ql_healthbar");
                    try {
                        var root = $.GetContextPanel();
                        var hc = root ? root.FindChildTraverse("health_and_abilities_container") : null;
                        if (QOL.healthbar && QOL.healthbar.resetPlayerStyle && hc) {
                            QOL.healthbar.resetPlayerStyle(hc);
                        }
                        if (QOL.healthbar && QOL.healthbar.accent && QOL.healthbar.accent.reset) {
                            QOL.healthbar.accent.reset();
                        }
                        if (QOL.healthbar && QOL.healthbar.resetMinimalistOffsetRuntimeAll) {
                            QOL.healthbar.resetMinimalistOffsetRuntimeAll(root, null, null);
                        }
                        if (QOL.healthbar && QOL.healthbar.budhud && QOL.healthbar.budhud.update) {
                            QOL.healthbar.budhud.update(root, {}, 0, Date.now ? Date.now() : 0);
                        }
                        if (QOL.healthbar && QOL.healthbar.fg && QOL.healthbar.fg.update) {
                            QOL.healthbar.fg.update(root, {});
                        }
                        if (QOL.healthbar && QOL.healthbar.mc && QOL.healthbar.mc.update) {
                            QOL.healthbar.mc.update(root, {}, Date.now ? Date.now() : 0, false);
                        }
                        State.minimalistHealthbarOffsetSig = "";
                        State.minimalistHealthbarOffsetApplied = false;
                        State.minimalistHealthbarOffsetPanel = null;
                        State.playerHealthbarScalePanel = null;
                        State.playerHealthbarScaleOpacityRuntimeApplied = false;
                    } catch(e) {}
                },
                onSettingsChanged: function() {
                    _update();
                    var root = $.GetContextPanel ? $.GetContextPanel() : null;
                    if (root && QOL.core && QOL.core.hud && QOL.core.hud.refreshRootClasses) {
                        QOL.core.hud.refreshRootClasses(root);
                    }
                }
            };
        },
    test: function(ctx) {
        try {
            var root = $.GetContextPanel();
            var container = root ? root.FindChildTraverse("health_and_abilities_container") : null;
            return { passed: !!container, name: "Healthbar container panel exists", message: container ? "" : "health_and_abilities_container not found", assertions: [{ passed: !!container, name: "health_and_abilities_container panel exists" }] };
        } catch(e) { return { passed: false, name: "Healthbar panel check", message: (e && e.message ? e.message : String(e)) }; }
    }
    });
})();

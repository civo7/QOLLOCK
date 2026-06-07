// ql_feat_zipboost.js — Zip boost HUD overlay
// Extracted from ql_core.js, Phase 9 Step 2b
(function() {
    'use strict';
    var S = typeof QOL_STATE !== "undefined" ? QOL_STATE : undefined;
    var GC = typeof QOL_GetCachedPanel !== "undefined" ? QOL_GetCachedPanel : undefined;
    var SC = typeof QOL_SetCachedPanel !== "undefined" ? QOL_SetCachedPanel : undefined;
    var U = typeof QOL_UTILS !== "undefined" ? QOL_UTILS : undefined;
    var IsPanelValid = U ? U.IsPanelValid : function() { return false; };
    var IsCfgEnabled = U ? U.IsCfgEnabled : function() { return false; };
    var IsCustomHudContextActive = typeof QOL_IsCustomHudContextActive !== "undefined" ? QOL_IsCustomHudContextActive : function() { return true; };

    function EnsureZipBoostOverlay(root) {
        var overlay = GetCachedPanel("zipBoostOverlay");
        if (IsPanelValid(overlay)) {
            return overlay;
        }

        overlay = root.FindChildTraverse("QOLZipBoostOverlay");
        if (!overlay) {
            var parent = GetGameplayHudPanel(root);
            if (!parent) return null;
            overlay = $.CreatePanel("Panel", parent, "QOLZipBoostOverlay", {
                hittest: "false",
                hittestchildren: "false"
            });
            $.CreatePanel("Panel", overlay, "QOLZipBoostIcon");
            var textContainer = $.CreatePanel("Panel", overlay, "QOLZipBoostTextContainer");
            var label = $.CreatePanel("Label", textContainer, "QOLZipBoostLabel");
            label.text = "Zip Boost";
            var state = $.CreatePanel("Label", textContainer, "QOLZipBoostState");
            state.text = "Ready";
        }

        SetCachedPanel("zipBoostOverlay", overlay);
        SetCachedPanel("zipBoostLabel", overlay ? overlay.FindChildTraverse("QOLZipBoostLabel") : null);
        SetCachedPanel("zipBoostState", overlay ? overlay.FindChildTraverse("QOLZipBoostState") : null);
        return overlay;
    }

    function RemoveZipBoostOverlay(root) {
        var overlay = GetCachedPanel("zipBoostOverlay");
        if (!IsPanelValid(overlay)) {
            overlay = root.FindChildTraverse("QOLZipBoostOverlay");
        }
        if (IsPanelValid(overlay)) {
            overlay.DeleteAsync(0);
        }
        SetCachedPanel("zipBoostOverlay", null);
        SetCachedPanel("zipBoostLabel", null);
        SetCachedPanel("zipBoostState", null);
        SetCachedPanel("zipBoostSource", null);
        SetCachedPanel("zipBoostAbilityName", null);
        SetCachedPanel("zipBoostCountdown", null);
        State.zipBoostDisplayMode = "";
        State.zipBoostLastLayoutSig = "";
        State.zipBoostLastClassSig = "";
        State.zipBoostLastTitle = "";
        State.zipBoostLastStatus = "";
        State.zipBoostNextSourceSearchMs = 0;
        State.zipBoostWasInUse = false;
        State.zipBoostActiveEndMs = 0;
    }

    function UpdateZipBoostOverlay(root, cfg, hideoutOverride) {
        var nowMs = Date.now ? Date.now() : (new Date()).getTime();
        if (!IsCustomHudContextActive(root)) {
            if (State.zipBoostDisplayMode !== "context_off") {
                RemoveZipBoostOverlay(root);
                State.zipBoostDisplayMode = "context_off";
            }
            return;
        }

        var enabled = cfg.ENABLE_ZIP_BOOST === 1;
        if (!enabled) {
            if (State.zipBoostDisplayMode !== "disabled") {
                RemoveZipBoostOverlay(root);
                State.zipBoostDisplayMode = "disabled";
            }
            State.zipBoostLastState = null;
            State.zipBoostReadyFlashUntilMs = 0;
            return;
        }

        var overlay = EnsureZipBoostOverlay(root);
        if (!overlay) return;

        var hideout = (typeof hideoutOverride === "boolean") ? hideoutOverride : isConnectedToHideout(root);
        if (!enabled || hideout) {
            if (State.zipBoostDisplayMode !== "hideout") {
                overlay.style.visibility = "collapse";
                overlay.SetHasClass("on_cooldown", false);
                overlay.SetHasClass("in_use", false);
                overlay.SetHasClass("ready_flash", false);
                State.zipBoostLastClassSig = "";
            }
            State.zipBoostDisplayMode = "hideout";
            State.zipBoostLastState = null;
            State.zipBoostReadyFlashUntilMs = 0;
            return;
        }

        if (State.zipBoostDisplayMode !== "active" || overlay.style.visibility !== "visible") {
            overlay.style.visibility = "visible";
        }
        State.zipBoostDisplayMode = "active";

        var zipOffsetX = Number(cfg.ZIP_BOOST_X_OFFSET);
        var zipOffsetY = Number(cfg.ZIP_BOOST_Y_OFFSET);
        var zipScale = Number(cfg.ZIP_BOOST_SCALE);
        if (!isFinite(zipOffsetX)) zipOffsetX = 0;
        if (!isFinite(zipOffsetY)) zipOffsetY = 0;
        if (!isFinite(zipScale)) zipScale = 100;
        zipOffsetX = Math.round(zipOffsetX);
        zipOffsetY = Math.round(zipOffsetY);
        zipScale = Math.round(zipScale);
        if (zipOffsetX < -2000) zipOffsetX = -2000;
        if (zipOffsetX > 2000) zipOffsetX = 2000;
        if (zipOffsetY < 0) zipOffsetY = 0;
        if (zipOffsetY > 1000) zipOffsetY = 1000;
        if (zipScale < 50) zipScale = 50;
        if (zipScale > 200) zipScale = 200;
        var layoutSig = [
            String(zipOffsetX),
            String(zipOffsetY),
            String(zipScale)
        ].join("|");
        if (layoutSig !== State.zipBoostLastLayoutSig) {
            overlay.style.marginLeft = (-520 + zipOffsetX) + "px";
            overlay.style.marginBottom = (20 + zipOffsetY) + "px";
            overlay.style.preTransformScale2d = (zipScale / 100).toFixed(2);
            State.zipBoostLastLayoutSig = layoutSig;
        }

        var source = GetCachedPanel("zipBoostSource");
        if (!IsPanelValid(source)) {
            source = null;
            if (nowMs >= (State.zipBoostNextSourceSearchMs || 0)) {
                source = FindZipBoostSource(root);
                State.zipBoostNextSourceSearchMs = source ? 0 : (nowMs + ZIP_BOOST_SOURCE_SEARCH_MS);
                SetCachedPanel("zipBoostSource", source);
                SetCachedPanel("zipBoostAbilityName", null);
                SetCachedPanel("zipBoostCountdown", null);
            }
        }

        var title = "Zip Boost";
        var status = "READY";
        var isCooldown = false;
        var isInUse = false;

        if (source) {
            isCooldown = source.BHasClass && source.BHasClass("on_cooldown");
            isInUse = source.BHasClass && source.BHasClass("in_use");

            if (isInUse && !State.zipBoostWasInUse) {
                State.zipBoostActiveEndMs = nowMs + 32000;
            }

            var abilityNamePanel = GetCachedPanel("zipBoostAbilityName");
            if (!IsPanelValid(abilityNamePanel) && source.FindChildrenWithClassTraverse) {
                var abilityNames = source.FindChildrenWithClassTraverse("AbilityName") || [];
                abilityNamePanel = abilityNames.length > 0 ? abilityNames[0] : null;
                SetCachedPanel("zipBoostAbilityName", abilityNamePanel);
            }
            var abilityName = (abilityNamePanel && typeof abilityNamePanel.text === "string") ? abilityNamePanel.text : "";
            if (abilityName && abilityName.length > 0) title = abilityName;

            var countdownPanel = GetCachedPanel("zipBoostCountdown");
            if (!IsPanelValid(countdownPanel) && source.FindChildrenWithClassTraverse) {
                var countdowns = source.FindChildrenWithClassTraverse("Countdown") || [];
                countdownPanel = countdowns.length > 0 ? countdowns[0] : null;
                SetCachedPanel("zipBoostCountdown", countdownPanel);
            }
            var countdown = (countdownPanel && typeof countdownPanel.text === "string") ? countdownPanel.text : "";

            if (isCooldown && (!countdown || countdown.trim() === "")) {
                countdown = FindNumericLabelTextInTree(source);
                if (countdown && !countdown.endsWith("s")) countdown += "s";
            }

            if (isInUse) {
                var timeLeft = Math.ceil((State.zipBoostActiveEndMs - nowMs) / 1000);
                if (timeLeft < 0) timeLeft = 0;
                status = "ACTIVE " + timeLeft + "s";
            } else if (isCooldown) {
                status = countdown && countdown.length > 0 ? ("COOLDOWN " + countdown) : "COOLDOWN";
            }

            State.zipBoostWasInUse = isInUse;
        }

        var currentState = isInUse ? "in_use" : (isCooldown ? "cooldown" : "ready");
        if (currentState === "ready" && State.zipBoostLastState !== "ready") {
            State.zipBoostReadyFlashUntilMs = nowMs + ZIP_BOOST_READY_FLASH_MS;
        }
        State.zipBoostLastState = currentState;
        var readyFlashActive = (currentState === "ready") && nowMs < State.zipBoostReadyFlashUntilMs;

        var classSig = (isCooldown ? "1" : "0") + "|" + (isInUse ? "1" : "0") + "|" + (readyFlashActive ? "1" : "0");
        if (classSig !== State.zipBoostLastClassSig) {
            overlay.SetHasClass("on_cooldown", isCooldown);
            overlay.SetHasClass("in_use", isInUse);
            overlay.SetHasClass("ready_flash", readyFlashActive);
            State.zipBoostLastClassSig = classSig;
        }

        var label = GetCachedPanel("zipBoostLabel");
        var state = GetCachedPanel("zipBoostState");
        if (label && title !== State.zipBoostLastTitle) {
            label.text = title;
            State.zipBoostLastTitle = title;
        }
        if (state && status !== State.zipBoostLastStatus) {
            state.text = status;
            State.zipBoostLastStatus = status;
        }
    }

    // ── Registration ──
    QOL_REGISTER_FEATURE("zipBoost", {
        configKeys: ["ENABLE_ZIP_BOOST"],
        bucket: 6, phase: -1,
        gate: function(cfg) {
            return IsCfgEnabled(cfg, "ENABLE_ZIP_BOOST") || !!(S.zipBoostDisplayMode && S.zipBoostDisplayMode !== "");
        },
        update: function(root, cfg, nowMs, State, hideoutConnected) {
            UpdateZipBoostOverlay(root, cfg, hideoutConnected);
        },
        stateKeys: ["zipBoostLastState", "zipBoostReadyFlashUntilMs", "zipBoostDisplayMode",
                    "zipBoostLastLayoutSig", "zipBoostLastClassSig", "zipBoostLastTitle",
                    "zipBoostLastStatus", "zipBoostNextSourceSearchMs", "zipBoostActiveEndMs"]
    });

})();

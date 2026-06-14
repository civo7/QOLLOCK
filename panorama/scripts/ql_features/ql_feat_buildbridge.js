// ql_feat_buildbridge.js — Shared build bridge: hero switch, storage confirm, dispatch helpers
// Extracted from ql_core.js, Step 2
(function() {
    'use strict';
    var _featureId = "ql_feat_buildbridge";
    // Note: this file loads before ql_core.js populates the QOL namespace,
    // so we access State and other globals at call time, not via QOL.import().
    // Functions that need QOL symbols should use direct global access.

    // ── Constants (from ql_core.js) ──
    var BUILD_CATEGORY_PAYLOAD_STORAGE_HERO_ID = "hero_airheart";
    var BUILD_SAVE_CLEAR_REUSE_AIRHEART_MAX_AGE_MS = 15000;
    var BUILD_SAVE_MSG_ATTR = "QOL_BUILD_SAVE_MSG";
    var BUILD_SAVE_RETURN_HERO_ID = "hero_werewolf";
    var BUILD_SAVE_STATE_ATTR = "QOL_BUILD_SAVE_STATE";
    var BUILD_SAVE_STORAGE_HERO_ID = "hero_airheart";
    var BUILD_SAVE_STORAGE_SETTLE_DELAY_MS = 300;
    var BUILD_SAVE_STORAGE_SIGNATURE_CONFIRM_HITS = 2;
    var BUILD_SAVE_TOKEN_ATTR = "QOL_BUILD_SAVE_TOKEN";
    var HERO_RESTORE_VERIFY_DELAY_MS = 450;
    var SETTINGS_LOADER_DEBUG = false;

    // ── Bridge functions ──

    function NormalizeHeroId(heroId) {
        if (!heroId) return "";
        var text = String(heroId).trim().toLowerCase();
        if (!/^hero_[a-z0-9_]+$/.test(text)) return "";
        var alias = QOL.resolvePlayableHeroAlias(text.slice(5));
        if (!alias) return "";
        return "hero_" + alias;
    }

    function GetConfiguredDefaultHeroId(cfg) {
        var rawHero = "";
        if (cfg && cfg.hasOwnProperty("DEFAULT_HERO")) {
            rawHero = String(cfg.DEFAULT_HERO || "");
        } else if (State.lastConfig && State.lastConfig.hasOwnProperty("DEFAULT_HERO")) {
            rawHero = String(State.lastConfig.DEFAULT_HERO || "");
        } else {
            var defaults = QOL.buildDefaultConfig();
            rawHero = defaults && defaults.hasOwnProperty("DEFAULT_HERO")
                ? String(defaults.DEFAULT_HERO || "")
                : "";
        }
        var normalized = NormalizeHeroId(rawHero);
        if (normalized) return normalized;
        return BUILD_SAVE_RETURN_HERO_ID;
    }

    function DispatchCitadelConCommand(command) {
        if (!command || command.length === 0) return false;
        try {
            $.DispatchEvent("CitadelConCommand", String(command));
            return true;
        } catch (e) {
            $.Msg("[QOLLock][WARN][" + _featureId + "] DispatchCitadelConCommand failed: " + (e && e.message ? String(e.message) : String(e)));
        }
        return false;
    }

    function SelectHeroForBuildSave(heroId, reason) {
        if (!heroId || heroId.length === 0) return false;
        var target = String(heroId);
        var now = Date.now ? Date.now() : (new Date()).getTime();
        if (State.selectHeroLastTarget === target && (State.selectHeroLastMs || 0) > now - 1000) {
            return true;
        }
        State.selectHeroLastTarget = target;
        State.selectHeroLastMs = now;
        var ok = DispatchCitadelConCommand("selecthero " + target);
        if (SETTINGS_LOADER_DEBUG) {
            var now2 = Date.now ? Date.now() : (new Date()).getTime();
            var inLoaderContext =
                !!State.settingsLoaderSessionActive ||
                (State.settingsLoaderSessionCompleted && now2 < (State.settingsLoaderShowUntilMs || 0));
            if (!inLoaderContext) return ok;
            var why = reason ? String(reason) : "-";
            QOL.settingsLoaderDebugLogThrottled(
                "selecthero|" + target + "|" + why + "|" + (ok ? "1" : "0"),
                "selecthero target=" + target + " reason=" + why + " ok=" + (ok ? "1" : "0") +
                    " stage=" + (State.buildCategoryPayloadHeroProbeStage || "-"),
                now2
            );
            QOL.setSettingsLoaderDebugOverlayLine(
                "cmd=selecthero target=" + target +
                " reason=" + why +
                " ok=" + (ok ? "1" : "0") +
                " stage=" + (State.buildCategoryPayloadHeroProbeStage || "-")
            );
        }
        _TLog("bridge:SwitchHero", "hero=" + target + " reason=" + (reason || "-") + " ok=" + (ok ? "1" : "0"));
        return ok;
    }

    function CanReuseLoaderConfirmedAirheartContext(root, nowMs) {
        if (!root) return false;
        if (!State.settingsLoaderSessionActive) return false;
        if (!State.buildCategoryPayloadAirheartHeaderConfirmed) return false;
        var now = Number(nowMs) || (Date.now ? Date.now() : (new Date()).getTime());
        var confirmedAtMs = Number(State.buildCategoryPayloadAirheartHeaderConfirmedMs) || 0;
        if (confirmedAtMs > 0 && (now - confirmedAtMs) > BUILD_SAVE_CLEAR_REUSE_AIRHEART_MAX_AGE_MS) {
            return false;
        }
        var signal = QOL.tryReadBuildCategoryPayloadStorageHeroFromFavoritesHeader(root);
        var hero = NormalizeHeroId(signal && signal.hero ? signal.hero : "");
        if (hero !== BUILD_SAVE_STORAGE_HERO_ID) return false;
        var signature = QOL.confirmStorageHeroSignatureAbilities(root, now, BUILD_SAVE_STORAGE_SIGNATURE_CONFIRM_HITS);
        return !!(signature && signature.confirmed);
    }

    function BeginHeroRestoreWithVerification(targetHero, contextLabel, nowMs) {
        var hero = NormalizeHeroId(targetHero);
        if (!hero || hero === BUILD_CATEGORY_PAYLOAD_STORAGE_HERO_ID) {
            QOL.heroReturnDebugLog("restore begin skipped invalidTarget=" + (targetHero ? String(targetHero) : "-") + " ctx=" + (contextLabel ? String(contextLabel) : "-"));
            return false;
        }
        var now = Number(nowMs) || (Date.now ? Date.now() : (new Date()).getTime());
        var switched = SelectHeroForBuildSave(hero);
        State.heroRestorePendingTarget = hero;
        State.heroRestorePendingStartedMs = now;
        State.heroRestorePendingNextMs = now + HERO_RESTORE_VERIFY_DELAY_MS;
        State.heroRestorePendingRetries = 0;
        State.heroRestorePendingContext = contextLabel ? String(contextLabel) : "";
        QOL.heroReturnDebugLog("restore begin target=" + hero + " ctx=" + (State.heroRestorePendingContext || "-") + " switchOk=" + (switched ? "1" : "0"));
        return switched;
    }

    function QueueDelayedHeroRestore(targetHero, contextLabel, delaySec) {
        var hero = NormalizeHeroId(targetHero);
        if (!hero || hero === BUILD_CATEGORY_PAYLOAD_STORAGE_HERO_ID) return false;
        var delay = Number(delaySec);
        if (!isFinite(delay) || delay < 0) delay = 0;
        if (typeof $.Schedule !== "function") {
            var switchedImmediate = BeginHeroRestoreWithVerification(hero, contextLabel || "build_save_finish", Date.now ? Date.now() : (new Date()).getTime());
            return switchedImmediate;
        }
        $.Schedule(delay, function() {
            var switched = BeginHeroRestoreWithVerification(hero, contextLabel || "build_save_finish", Date.now ? Date.now() : (new Date()).getTime());
        });
        _TLog("bridge:QueueRestore", "hero=" + hero + " delayMs=" + (delay * 1000));
        return true;
    }

    function TryAdvanceStorageSwitchStage(root, nowMs, requestToken, options) {
        if (!options || !options.stageKey || !options.nextActionKey) return false;
        if (State[options.stageKey] !== "switch_to_storage") return false;
        _TLog("save:SwitchStorage", "hero=" + BUILD_SAVE_STORAGE_HERO_ID);

        var switchedToStorage = SelectHeroForBuildSave(BUILD_SAVE_STORAGE_HERO_ID);
        if (switchedToStorage && options.didSwitchFlagKey) {
            State[options.didSwitchFlagKey] = true;
        }
        if (switchedToStorage && typeof options.onSwitchSuccess === "function") {
            try { options.onSwitchSuccess(nowMs); } catch (e0) {
                $.Msg("[QOLLock][ERROR][" + _featureId + "] onSwitchSuccess callback failed: " + (e0 && e0.message ? String(e0.message) : String(e0)));
            }
        }

        if (typeof options.debugLog === "function") {
            options.debugLog("switch to " + BUILD_SAVE_STORAGE_HERO_ID + " ok=" + (switchedToStorage ? "1" : "0"));
        }
        if (typeof options.setOverlayLine === "function") {
            options.setOverlayLine("switch_airheart ok=" + (switchedToStorage ? "1" : "0"));
        }

        State[options.stageKey] = "wait_storage_switch";
        State[options.nextActionKey] = nowMs + BUILD_SAVE_STORAGE_SETTLE_DELAY_MS;

        if (typeof options.setStatus === "function") {
            options.setStatus(root, requestToken);
        }
        _TLog("bridge:SwitchStage", "switch_to_storage → wait_storage_switch");
        return true;
    }

    function TryAdvanceStorageSwitchSettleStage(nowMs, options) {
        if (!options || !options.stageKey || !options.nextActionKey || !options.nextStage) return false;
        if (State[options.stageKey] !== "wait_storage_switch") return false;

        if (typeof options.debugLog === "function") {
            options.debugLog(String(options.debugMessage || ""));
        }
        if (typeof options.onEnterNextStage === "function") {
            try { options.onEnterNextStage(nowMs); } catch (e0) {
                $.Msg("[QOLLock][ERROR][" + _featureId + "] onEnterNextStage callback failed: " + (e0 && e0.message ? String(e0.message) : String(e0)));
            }
        }

        var nextStage = options.nextStage;
        State[options.stageKey] = nextStage;
        State[options.nextActionKey] = nowMs;
        _TLog("bridge:SwitchSettle", "wait_storage_switch → " + nextStage);
        return true;
    }

    function SetBuildSaveStatus(root, state, message, token) {
        if (!root || !root.SetAttributeString) return;
        var st = state ? String(state) : "";
        var msg = message ? String(message) : "";
        var tok = token ? String(token) : "";
        var prevState = String(root.GetAttributeString(BUILD_SAVE_STATE_ATTR, "") || "-");
        _TLog("save:SetStatus", "state=" + (st || "empty") + " prevState=" + prevState + " msg=" + String(msg || "-").slice(0, 24) + " tok=" + String(tok || "-").slice(0, 8));
        root.SetAttributeString(BUILD_SAVE_STATE_ATTR, st);
        root.SetAttributeString(BUILD_SAVE_MSG_ATTR, msg);
        if (tok.length > 0) {
            root.SetAttributeString(BUILD_SAVE_TOKEN_ATTR, tok);
        }
    }

    // ── Bridge: QOL exports ──
    QOL.normalizeHeroId = NormalizeHeroId;
    QOL.getConfiguredDefaultHeroId = GetConfiguredDefaultHeroId;
    QOL.dispatchCitadelConCommand = DispatchCitadelConCommand;
    QOL.selectHeroForBuildSave = SelectHeroForBuildSave;
    QOL.queueDelayedHeroRestore = QueueDelayedHeroRestore;
    QOL.beginHeroRestoreWithVerification = BeginHeroRestoreWithVerification;
    QOL.tryAdvanceStorageSwitchStage = TryAdvanceStorageSwitchStage;
    QOL.tryAdvanceStorageSwitchSettleStage = TryAdvanceStorageSwitchSettleStage;
    QOL.setBuildSaveStatus = SetBuildSaveStatus;
    QOL.canReuseLoaderConfirmedAirheartContext = CanReuseLoaderConfirmedAirheartContext;

    // ── Registration ──
    QOL.register("buildBridge", {
        configKeys: [],
        bucket: 0, phase: -1,
        gate: function(cfg) { return true; },
        update: function(root, cfg, nowMs) {
            // Bridge functions are called directly; no per-frame update needed.
        },
        stateKeys: [
            "selectHeroLastTarget", "selectHeroLastMs",
            "buildRequestHeroRestoreTarget", "buildRequestHeroRestoreAtMs"
        ]
    });

    // ── Self-test ──
    try {
        if (typeof NormalizeHeroId !== "function") throw new Error("NormalizeHeroId missing");
        if (typeof GetConfiguredDefaultHeroId !== "function") throw new Error("GetConfiguredDefaultHeroId missing");
        if (typeof DispatchCitadelConCommand !== "function") throw new Error("DispatchCitadelConCommand missing");
        if (typeof SelectHeroForBuildSave !== "function") throw new Error("SelectHeroForBuildSave missing");
        if (typeof QueueDelayedHeroRestore !== "function") throw new Error("QueueDelayedHeroRestore missing");
        if (typeof BeginHeroRestoreWithVerification !== "function") throw new Error("BeginHeroRestoreWithVerification missing");
        if (typeof TryAdvanceStorageSwitchStage !== "function") throw new Error("TryAdvanceStorageSwitchStage missing");
        if (typeof TryAdvanceStorageSwitchSettleStage !== "function") throw new Error("TryAdvanceStorageSwitchSettleStage missing");
        if (typeof SetBuildSaveStatus !== "function") throw new Error("SetBuildSaveStatus missing");
        if (typeof CanReuseLoaderConfirmedAirheartContext !== "function") throw new Error("CanReuseLoaderConfirmedAirheartContext missing");
    } catch(e) {
        $.Msg("[QOLLock][ERROR][" + _featureId + "] self-test: " + e.message);
    }
})();

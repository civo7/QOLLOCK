// ql_feat_sigflash.js — Signature ability cooldown press flash
// Extracted from ql_core.js, Phase 9 Step 2b
(function() {
    'use strict';
    var _featureId = "ql_feat_sigflash";
    var _deps = QOL.import(["getCachedPanel","panelIdSignature","state","setCachedPanel","utils"]);
    var GetCachedPanel = _deps.getCachedPanel;
    var State = _deps.state;
    var SetCachedPanel = _deps.setCachedPanel;
    var Utils = _deps.utils;
    var IsCfgEnabled = Utils.IsCfgEnabled;
    var IsPanelValid = Utils.IsPanelValid;
    var SIGNATURE_COOLDOWN_PRESS_FLASH_CLASS = "qol_signature_cooldown_pressed";
    var SIGNATURE_COOLDOWN_PRESS_FLASH_MS = 220;
    var SIGNATURE_COOLDOWN_PRESS_SCAN_MS = 1000;
    var PANEL_ID_SIGNATURE = _deps.panelIdSignature;
    function RefreshSignatureCooldownFlashSlots(root, nowMs) {
        var now = Number(nowMs) || (Date.now ? Date.now() : (new Date()).getTime());
        var slots = State.signatureCooldownFlashSlots;
        var needsRescan = false;
        if (!slots || !slots.length) {
            needsRescan = true;
        } else if (now >= (State.signatureCooldownFlashNextScanMs || 0)) {
            needsRescan = true;
        } else {
            for (var i = 0; i < slots.length; i++) {
                var entry = slots[i];
                if (!entry || !IsPanelValid(entry.icon) || !IsPanelValid(entry.binding)) {
                    needsRescan = true;
                    break;
                }
            }
        }
        if (!needsRescan) return slots;

        var refreshed = [];
        var hudSignature = root && root.FindChildTraverse ? root.FindChildTraverse(PANEL_ID_SIGNATURE) : null;
        if (IsPanelValid(hudSignature) && hudSignature.FindChildTraverse) {
            for (var s = 1; s <= 4; s++) {
                var slotId = "slot_signature_" + String(s);
                var icon = hudSignature.FindChildTraverse(slotId);
                if (!IsPanelValid(icon)) continue;
                var binding = icon.FindChildTraverse ? icon.FindChildTraverse("ability_binding_component") : null;
                if (!IsPanelValid(binding)) continue;
                refreshed.push({
                    id: slotId,
                    icon: icon,
                    binding: binding
                });
            }
        }

        State.signatureCooldownFlashSlots = refreshed;
        State.signatureCooldownFlashNextScanMs = now + SIGNATURE_COOLDOWN_PRESS_SCAN_MS;
        return refreshed;
    }

    function UpdateSignatureCooldownPressFlash(root, nowMs) {
        var now = Number(nowMs) || (Date.now ? Date.now() : (new Date()).getTime());
        var slots = RefreshSignatureCooldownFlashSlots(root, now);
        var seen = {};
        for (var i = 0; i < slots.length; i++) {
            var entry = slots[i];
            if (!entry || !IsPanelValid(entry.icon)) continue;
            if (!IsPanelValid(entry.binding) && entry.icon.FindChildTraverse) {
                entry.binding = entry.icon.FindChildTraverse("ability_binding_component");
            }
            if (!IsPanelValid(entry.binding)) continue;

            var key = entry.id || ("slot_" + String(i));
            seen[key] = true;

            var icon = entry.icon;
            var binding = entry.binding;
            var cooling = !!(icon.BHasClass && (icon.BHasClass("cooling_down") || icon.BHasClass("ability_not_ready")));
            var pressed = !!(binding.BHasClass && (binding.BHasClass("IsPressed") || binding.BHasClass("DownActivated")));
            var wasPressed = !!State.signatureCooldownFlashPressById[key];

            if (cooling && pressed && !wasPressed) {
                State.signatureCooldownFlashUntilById[key] = now + SIGNATURE_COOLDOWN_PRESS_FLASH_MS;
            }
            State.signatureCooldownFlashPressById[key] = pressed;

            var activeUntil = Number(State.signatureCooldownFlashUntilById[key]) || 0;
            var active = activeUntil > now;
            if (!cooling && !active) {
                State.signatureCooldownFlashUntilById[key] = 0;
            }
            icon.SetHasClass(SIGNATURE_COOLDOWN_PRESS_FLASH_CLASS, active);
        }

        for (var pressKey in State.signatureCooldownFlashPressById) {
            if (!State.signatureCooldownFlashPressById.hasOwnProperty(pressKey)) continue;
            if (seen[pressKey]) continue;
            delete State.signatureCooldownFlashPressById[pressKey];
        }
        for (var untilKey in State.signatureCooldownFlashUntilById) {
            if (!State.signatureCooldownFlashUntilById.hasOwnProperty(untilKey)) continue;
            if (seen[untilKey]) continue;
            delete State.signatureCooldownFlashUntilById[untilKey];
        }
    }

    function ResetSignatureCooldownPressFlashRuntime() {
        var slots = State.signatureCooldownFlashSlots || [];
        for (var i = 0; i < slots.length; i++) {
            var entry = slots[i];
            if (!entry || !IsPanelValid(entry.icon) || !entry.icon.SetHasClass) continue;
            try { entry.icon.SetHasClass(SIGNATURE_COOLDOWN_PRESS_FLASH_CLASS, false); } catch (e0) {}
        }
        State.signatureCooldownFlashSlots = [];
        State.signatureCooldownFlashNextScanMs = 0;
        State.signatureCooldownFlashUntilById = {};
        State.signatureCooldownFlashPressById = {};
    }

    function UpdateSignatureCooldownPressFlashRuntime(root, cfg, nowMs) {
        var enabled = IsCfgEnabled(cfg, "ENABLE_PASSIVE_COOLDOWN");
        if (!enabled) {
            if (State.signatureCooldownFlashWasEnabled) {
                ResetSignatureCooldownPressFlashRuntime();
                State.signatureCooldownFlashWasEnabled = false;
            }
            return;
        }
        State.signatureCooldownFlashWasEnabled = true;
        UpdateSignatureCooldownPressFlash(root, nowMs);
    }

    // ── Registration ──
    QOL.register("signatureFlash", {
        configKeys: ["ENABLE_PASSIVE_COOLDOWN"],
        bucket: 2, phase: -1,
        requiresRoot: true,
        gate: function(cfg) { return IsCfgEnabled(cfg, "ENABLE_PASSIVE_COOLDOWN") || !!State.signatureCooldownFlashWasEnabled; },
        update: function(root, cfg, nowMs, State, hideoutConnected) {
            UpdateSignatureCooldownPressFlashRuntime(root, cfg, nowMs);
        },
        stateKeys: ["signatureCooldownFlashWasEnabled",
                    "signatureCooldownFlashSlots",
                    "signatureCooldownFlashNextScanMs"]
    });

    // ── Self-test ──
    try {
        if (typeof UpdateSignatureCooldownPressFlashRuntime !== "function") throw new Error("UpdateSignatureCooldownPressFlashRuntime is not a function");
    } catch(e) {
        $.Msg("[QOLLock][ERROR][" + _featureId + "] self-test failed: " + (e && e.message ? e.message : String(e)));
    }
})();

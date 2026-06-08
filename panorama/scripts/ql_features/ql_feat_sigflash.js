// ql_feat_sigflash.js — Signature ability cooldown press flash
// Extracted from ql_core.js, Phase 9 Step 2b
(function() {
    'use strict';
    var _dk = "ql_feat_sigflash";
    var _deps = QOL.import(["getCachedPanel","panelIdSignature","signatureCooldownPressFlashClass","signatureCooldownPressFlashMs","signatureCooldownPressScanMs","state","setCachedPanel","utils"]);
    var GC = _deps.getCachedPanel;
    var S = _deps.state;
    var SC = _deps.setCachedPanel;
    var U = _deps.utils;
    var IsCfgEnabled = U.IsCfgEnabled;
    var IsPanelValid = U.IsPanelValid;
    var SIGNATURE_COOLDOWN_PRESS_FLASH_CLASS = _deps.signatureCooldownPressFlashClass;
    var SIGNATURE_COOLDOWN_PRESS_FLASH_MS = _deps.signatureCooldownPressFlashMs;
    var SIGNATURE_COOLDOWN_PRESS_SCAN_MS = _deps.signatureCooldownPressScanMs;
    var PANEL_ID_SIGNATURE = _deps.panelIdSignature;
    function RefreshSignatureCooldownFlashSlots(root, nowMs) {
        var now = Number(nowMs) || (Date.now ? Date.now() : (new Date()).getTime());
        var slots = S.signatureCooldownFlashSlots;
        var needsRescan = false;
        if (!slots || !slots.length) {
            needsRescan = true;
        } else if (now >= (S.signatureCooldownFlashNextScanMs || 0)) {
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

        S.signatureCooldownFlashSlots = refreshed;
        S.signatureCooldownFlashNextScanMs = now + SIGNATURE_COOLDOWN_PRESS_SCAN_MS;
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
            var wasPressed = !!S.signatureCooldownFlashPressById[key];

            if (cooling && pressed && !wasPressed) {
                S.signatureCooldownFlashUntilById[key] = now + SIGNATURE_COOLDOWN_PRESS_FLASH_MS;
            }
            S.signatureCooldownFlashPressById[key] = pressed;

            var activeUntil = Number(S.signatureCooldownFlashUntilById[key]) || 0;
            var active = activeUntil > now;
            if (!cooling && !active) {
                S.signatureCooldownFlashUntilById[key] = 0;
            }
            icon.SetHasClass(SIGNATURE_COOLDOWN_PRESS_FLASH_CLASS, active);
        }

        for (var pressKey in S.signatureCooldownFlashPressById) {
            if (!S.signatureCooldownFlashPressById.hasOwnProperty(pressKey)) continue;
            if (seen[pressKey]) continue;
            delete S.signatureCooldownFlashPressById[pressKey];
        }
        for (var untilKey in S.signatureCooldownFlashUntilById) {
            if (!S.signatureCooldownFlashUntilById.hasOwnProperty(untilKey)) continue;
            if (seen[untilKey]) continue;
            delete S.signatureCooldownFlashUntilById[untilKey];
        }
    }

    function ResetSignatureCooldownPressFlashRuntime() {
        var slots = S.signatureCooldownFlashSlots || [];
        for (var i = 0; i < slots.length; i++) {
            var entry = slots[i];
            if (!entry || !IsPanelValid(entry.icon) || !entry.icon.SetHasClass) continue;
            try { entry.icon.SetHasClass(SIGNATURE_COOLDOWN_PRESS_FLASH_CLASS, false); } catch (e0) {}
        }
        S.signatureCooldownFlashSlots = [];
        S.signatureCooldownFlashNextScanMs = 0;
        S.signatureCooldownFlashUntilById = {};
        S.signatureCooldownFlashPressById = {};
    }

    function UpdateSignatureCooldownPressFlashRuntime(root, cfg, nowMs) {
        var enabled = IsCfgEnabled(cfg, "ENABLE_PASSIVE_COOLDOWN");
        if (!enabled) {
            if (S.signatureCooldownFlashWasEnabled) {
                ResetSignatureCooldownPressFlashRuntime();
                S.signatureCooldownFlashWasEnabled = false;
            }
            return;
        }
        S.signatureCooldownFlashWasEnabled = true;
        UpdateSignatureCooldownPressFlash(root, nowMs);
    }

    // ── Registration ──
    QOL.register("signatureFlash", {
        configKeys: ["ENABLE_PASSIVE_COOLDOWN"],
        bucket: 2, phase: -1,
        gate: function(cfg) { return IsCfgEnabled(cfg, "ENABLE_PASSIVE_COOLDOWN") || !!S.signatureCooldownFlashWasEnabled; },
        update: function(root, cfg, nowMs, State, hideoutConnected) {
            UpdateSignatureCooldownPressFlashRuntime(root, cfg, nowMs);
        },
        stateKeys: ["signatureCooldownFlashWasEnabled",
                    "signatureCooldownFlashSlots",
                    "signatureCooldownFlashNextScanMs"]
    });

})();

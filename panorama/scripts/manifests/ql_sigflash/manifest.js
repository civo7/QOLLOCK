// features/ql_sigflash/manifest.js
// =============================================================================
// QOLLOCK — Signature Cooldown Press Flash
// =============================================================================
// OWNS:        Flash effect on signature ability icons when pressed during cooldown
// DOES NOT OWN: Signature abilities, cooldown logic
// DEPENDS ON:  QOL.core.FeatureRegistry, QOL.core.Scheduler
// CONFIG KEYS: ENABLE_PASSIVE_COOLDOWN (toggle)
// PATTERN:     Polling (1Hz scan for slot changes). Flash active for 220ms.
// =============================================================================

(function() {
    "use strict";
    var FR = QOL.core.FeatureRegistry;
    if (!FR) { $.Msg("[QOLLock] sigflash: FeatureRegistry not found — aborting"); return; }

    FR.register({
        id: "ql_sigflash",
        enableKey: "ENABLE_PASSIVE_COOLDOWN",
        enabledByDefault: false,
        settings: [
            { key: "ENABLE_PASSIVE_COOLDOWN", type: "toggle", default: false }
        ],
        create: function(ctx) {
            var FLASH_CLASS = "qol_signature_cooldown_pressed";
            var FLASH_MS = 220;
            var SCAN_MS = 1000;
            var _loop = null;
            var _wasEnabled = false;
            var _slots = [];
            var _nextScanMs = 0;
            var _pressById = {};
            var _untilById = {};

            function _isAlive(p) { return p && typeof p.IsValid === "function" && p.IsValid(); }

            function _scanSlots(root) {
                var now = Date.now ? Date.now() : (new Date()).getTime();
                if (_slots.length && now < _nextScanMs) {
                    var allAlive = true;
                    for (var i = 0; i < _slots.length; i++) {
                        if (!_isAlive(_slots[i].icon) || !_isAlive(_slots[i].binding)) { allAlive = false; break; }
                    }
                    if (allAlive) return;
                }
                _slots = [];
                // Use the same panel path as the old feature: hud_signature, not bottomBarPanel.
                // PANEL_ID_SIGNATURE = "hud_signature" (ql_core.js line 446).
                var sig = root.FindChildTraverse("hud_signature");
                if (!_isAlive(sig)) return;
                for (var s = 1; s <= 4; s++) {
                    var icon = sig.FindChildTraverse("slot_signature_" + s);
                    if (!_isAlive(icon)) continue;
                    var binding = icon.FindChildTraverse ? icon.FindChildTraverse("ability_binding_component") : null;
                    // Binding re-fetch fallback: if binding went invalid, try to re-fetch from icon.
                    if (!_isAlive(binding) && icon.FindChildTraverse) {
                        binding = icon.FindChildTraverse("ability_binding_component");
                    }
                    if (!_isAlive(binding)) continue;
                    _slots.push({ id: "slot_signature_" + s, icon: icon, binding: binding });
                }
                _nextScanMs = now + SCAN_MS;
            }

            function _tick() {
                var root = $.GetContextPanel();
                var now = Date.now ? Date.now() : (new Date()).getTime();

                if (!Number(ctx.config.get("ENABLE_PASSIVE_COOLDOWN"))) {
                    if (_wasEnabled) { _cleanup(); _wasEnabled = false; }
                    return;
                }
                _wasEnabled = true;
                _scanSlots(root);

                var seen = {};
                for (var i = 0; i < _slots.length; i++) {
                    var entry = _slots[i];
                    if (!_isAlive(entry.icon) || !_isAlive(entry.binding)) continue;
                    var key = entry.id;
                    seen[key] = true;
                    var cooling = !!(entry.icon.BHasClass && (entry.icon.BHasClass("cooling_down") || entry.icon.BHasClass("ability_not_ready")));
                    var pressed = !!(entry.binding.BHasClass && (entry.binding.BHasClass("IsPressed") || entry.binding.BHasClass("DownActivated")));
                    var wasPressed = !!_pressById[key];
                    if (cooling && pressed && !wasPressed) { _untilById[key] = now + FLASH_MS; }
                    _pressById[key] = pressed;
                    var activeUntil = Number(_untilById[key]) || 0;
                    var active = activeUntil > now;
                    if (!cooling && !active) { _untilById[key] = 0; }
                    try { entry.icon.SetHasClass(FLASH_CLASS, active); } catch(e) {}
                }
                for (var pk in _pressById) { if (!seen[pk]) delete _pressById[pk]; }
                for (var uk in _untilById) { if (!seen[uk]) delete _untilById[uk]; }
            }

            function _cleanup() {
                for (var i = 0; i < _slots.length; i++) {
                    var e = _slots[i];
                    try { if (e && e.icon && e.icon.SetHasClass) e.icon.SetHasClass(FLASH_CLASS, false); } catch(ex) {}
                }
                _slots = []; _nextScanMs = 0; _pressById = {}; _untilById = {};
            }

            return {
                onEnable: function() {
                    var S = QOL.core.Scheduler;
                    _loop = S && S.createPollLoop ? S.createPollLoop(_tick, 0.2, "ql_sigflash") : null;
                    // Fallback: if Scheduler not loaded (old system still active), no-op
                    // Feature will work through existing central dispatch until wired in
                },
                onDisable: function() {
                    if (_loop) { _loop.stop(); _loop = null; }
                    _cleanup(); _wasEnabled = false;
                },
                onSettingsChanged: function() {}
            };
        }
    });
})();

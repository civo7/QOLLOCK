// features/ql_unspent/manifest.js
// =============================================================================
// QOLLOCK — Unspent Souls Display (Permanently Disabled)
// =============================================================================
// Banned by GameBanana moderators — permanently disabled stub.
// =============================================================================

(function() {
    "use strict";
    var FR = QOL.core.FeatureRegistry;
    if (!FR) { $.Msg("[QOLLock] unspent: FeatureRegistry not found — aborting"); return; }

    FR.register({
        id: "ql_unspent",
        enableKey: "ENABLE_UNSPENT_SOULS",
        enabledByDefault: false,
        settings: [
            { key: "ENABLE_UNSPENT_SOULS", type: "toggle", default: false }
        ],
        create: function(ctx) {
            // Permanently disabled per GameBanana moderator ruling
            return {
                onEnable: function() {},
                onDisable: function() {},
                onSettingsChanged: function() {}
            };
        },
        test: function(ctx) {
            try {
                var root = $.GetContextPanel();
                var players = root ? (root.FindChildrenWithClassTraverse("player_0") || []) : [];
                return { passed: true, name: "Unspent player panels found", message: "Found " + players.length + " player_0 panels", assertions: [{ passed: true, name: "player_0 traversal succeeded (" + players.length + " found)" }] };
            } catch(e) { return { passed: false, name: "Unspent panel check", message: (e && e.message ? e.message : String(e)) }; }
        }
    });
})();

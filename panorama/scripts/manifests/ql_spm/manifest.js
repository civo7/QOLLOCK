// features/ql_spm/manifest.js
// =============================================================================
// QOLLOCK — Souls Per Minute (SPM) Display (Permanently Disabled)
// =============================================================================
// Banned by GameBanana moderators — permanently disabled stub.
// =============================================================================

(function() {
    "use strict";
    var FR = QOL.core.FeatureRegistry;
    if (!FR) { $.Msg("[QOLLock] spm: FeatureRegistry not found — aborting"); return; }

    FR.register({
        id: "ql_spm",
        enableKey: "ENABLE_MIN_SOULS",
        enabledByDefault: false,
        settings: [
            { key: "ENABLE_MIN_SOULS", type: "toggle" }
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
                var topBar = root ? root.FindChildTraverse("TopBar") : null;
                return {
                    passed: !!topBar,
                    name: "SPM top bar panel exists",
                    message: topBar ? "" : "TopBar not found",
                    assertions: [{ passed: !!topBar, name: "TopBar panel exists" }]
                };
            } catch(e) { return { passed: false, name: "SPM panel check", message: (e && e.message ? e.message : String(e)) }; }
        }
    });
})();

// Intentionally inactive compatibility owner: retains saved-config routing.
// The removed feature must never acquire native panels, callbacks or schedules.
(() => {
    "use strict";
    QOL.core.FeatureRegistry.register({
        id: "ql_spm",
        enableKey: "ENABLE_MIN_SOULS",
        enabledByDefault: false,
        settings: [{ key: "ENABLE_MIN_SOULS", type: "toggle" }],
        create() {
            return { onEnable() {}, onSettingsChanged() {}, onDisable() {} };
        }
    });
})();

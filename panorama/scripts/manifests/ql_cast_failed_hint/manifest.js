// OWNS: Cast-failed hint settings and reactive root-class refresh.
// DOES NOT OWN: Native failed-cast children or their event-driven text.
// Root classes are projected by QOL.core.hud from the complete configuration.
(() => {
    "use strict";
    QOL.core.FeatureRegistry.register({
        id: "ql_cast_failed_hint",
        enableKey: "ENABLE_HIDE_FAILED_HINT",
        enabledByDefault: false,
        settings: [{ key: "ENABLE_HIDE_FAILED_HINT", type: "toggle", default: false }],
        create() {
            const update = () => QOL.core.hud.refreshRootClasses($.GetContextPanel());
            return { onEnable: update, onSettingsChanged: update, onDisable: update };
        },
        test() {
            try {
                const hud = QOL.core.panel.findHud();
                if (!hud) return null;
                return { passed: true, name: "Hud panel exists for class toggle", message: "",
                    assertions: [{ passed: true, name: "Hud root panel exists" }] };
            } catch (e) {
                return { passed: false, name: "Cast failed hint panel check", message: e.message || String(e) };
            }
        }
    });
})();

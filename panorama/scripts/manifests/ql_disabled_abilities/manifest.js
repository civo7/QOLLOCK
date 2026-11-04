// OWNS: Disabled-ability presentation setting and reactive root-class refresh.
// DOES NOT OWN: Native disabled state, icon lifetime, cooldown masks or ability input.
// Component CSS decorates the native active_toggle; the game supplies both icon layouts.
(() => {
    "use strict";
    QOL.core.FeatureRegistry.register({
        id: "ql_disabled_abilities",
        enableKey: "ENABLE_BETTER_DISABLED_ABILITIES",
        enabledByDefault: false,
        settings: [{ key: "ENABLE_BETTER_DISABLED_ABILITIES", type: "toggle" }],
        create() {
            const update = () => QOL.core.hud.refreshRootClasses($.GetContextPanel());
            return { onEnable: update, onSettingsChanged: update, onDisable: update };
        }
    });
})();

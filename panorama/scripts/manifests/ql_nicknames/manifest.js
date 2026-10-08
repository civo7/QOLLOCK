// OWNS: Top-bar nickname settings and reactive root-class refresh.
// DOES NOT OWN: Native player panels, names or {s:player_name} bindings.
// The Hud root class reaches existing and replacement player labels through CSS.
(() => {
    "use strict";
    QOL.core.FeatureRegistry.register({
        id: "ql_nicknames",
        enableKey: "ENABLE_NICKNAMES",
        enabledByDefault: false,
        settings: [{ key: "ENABLE_NICKNAMES", type: "toggle" }],
        create() {
            const update = () => QOL.core.hud.refreshRootClasses($.GetContextPanel());
            return { onEnable: update, onSettingsChanged: update, onDisable: update };
        },
        test() {
            try {
                const root = $.GetContextPanel();
                const topBar = QOL.core.panel.findTraverse(root, "TopBar");
                return { passed: !!topBar, name: "Top bar nicknames check",
                    message: topBar ? "TopBar found" : "TopBar not found",
                    assertions: [{ passed: !!topBar, name: "TopBar exists" }] };
            } catch (e) {
                return { passed: false, name: "Nicknames test", message: e.message || String(e) };
            }
        }
    });
})();

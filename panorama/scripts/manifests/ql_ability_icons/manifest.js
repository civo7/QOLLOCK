// OWNS: Ability presentation settings and reactive root-class refresh.
// DOES NOT OWN: Native ability icons, stacks, suggestions or gameplay state.
// The shared projector preserves Dev-mode and Minecraft-specific class gates.
(() => {
    "use strict";
    QOL.core.FeatureRegistry.register({
        id: "ql_ability_icons",
        enabledByDefault: false,
        enableKeys: ["ENABLE_SIMPLIFY_ABILITY_ICONS", "ENABLE_HIDE_COSMETIC_ABILITY",
            "ENABLE_HIDE_ABILITY_SUGGESTION", "ENABLE_CLEAN_STACKS"],
        settings: [
            { key: "ENABLE_SIMPLIFY_ABILITY_ICONS", type: "toggle", default: false },
            { key: "ENABLE_HIDE_COSMETIC_ABILITY", type: "toggle", default: false },
            { key: "ENABLE_HIDE_ABILITY_SUGGESTION", type: "toggle", invert: true, default: false,
                label: "Ability Suggestion", description: "Highlighted abilities showing you what you should upgrade depending on build." },
            { key: "ENABLE_CLEAN_STACKS", type: "toggle", default: false,
                label: "Clean Stacks", description: "Move ability stacks to bottom-center of ability icon" }
        ],
        create() {
            const update = () => QOL.core.hud.refreshRootClasses($.GetContextPanel());
            return { onEnable: update, onSettingsChanged: update, onDisable: update };
        },
        test() {
            try {
                const hud = QOL.core.panel.findHud();
                if (!hud) return null;
                return { passed: true, name: "Ability icons Hud panel exists", message: "",
                    assertions: [{ passed: true, name: "Hud panel exists" }] };
            } catch (e) {
                return { passed: false, name: "Ability icons panel check", message: e.message || String(e) };
            }
        }
    });
})();

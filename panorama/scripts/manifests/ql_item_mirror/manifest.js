// OWNS: Advanced item-mirror settings and lifecycle registration.
// Source selection/model/rendering/release are delegated to instance-local feature modules.
(() => {
    "use strict";
    const FR = QOL.core.FeatureRegistry;
    const { FEATURE_ID } = QOL.features.itemMirror.data;
    FR.register({
        id: FEATURE_ID,
        enableKey: "ENABLE_PASSIVE_COOLDOWN",
        enabledByDefault: false,
        settings: [
            { key: "ENABLE_PASSIVE_COOLDOWN", type: "toggle" },
            { key: "ENABLE_OLD_ITEM_COOLDOWNS", type: "toggle" },
            { key: "ITEM_FILTER_DEF_PASSIVE", type: "toggle" },
            { key: "ITEM_FILTER_OFF_PASSIVE", type: "toggle" },
            { key: "ITEM_FILTER_DEF_ACTIVE", type: "toggle" },
            { key: "ITEM_FILTER_OFF_ACTIVE", type: "toggle" },
            { key: "PASSIVE_COOLDOWN_SIZE", type: "slider" },
            { key: "PASSIVE_COOLDOWN_Y", type: "slider" },
            { key: "PASSIVE_COOLDOWN_X", type: "slider" },
            { key: "PASSIVE_COOLDOWN_OPACITY", type: "slider" }
        ],
        create: ctx => QOL.features.itemMirror.createController(ctx),
        test: function (ctx) {
            try {
                const passed = (ctx && ctx.id === FEATURE_ID);
                return {
                    passed: passed,
                    name: "ql_item_mirror manifest check",
                    message: passed ? "" : "Invalid feature ID",
                    assertions: [{ passed: passed, name: "Feature ID matches" }]
                };
            } catch (e) {
                return { passed: false, name: "ql_item_mirror manifest check", message: (e && e.message ? e.message : String(e)) };
            }
        }
    });
})();

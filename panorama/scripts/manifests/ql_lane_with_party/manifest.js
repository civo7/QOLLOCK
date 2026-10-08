// OWNS: Automatic party lane selection and its retry policy.
// DOES NOT OWN: Native dropdowns, options or shared runtime state.
(() => {
    "use strict";
    const Q = QOL, P = Q.core.panel;
    const optionId = "lanepreference_1";
    const intervals = { apply: 650, hidden: 2630, selected: 4870 };

    Q.core.FeatureRegistry.register({
        id: "ql_lane_with_party",
        enableKey: "ENABLE_LANE_WITH_PARTY",
        enabledByDefault: false,
        settings: [{ key: "ENABLE_LANE_WITH_PARTY", type: "toggle" }],
        create(ctx) {
            const selectorResolver = Q.panelCache.createIdResolver("LanePreferenceSelector", { retryMs: intervals.hidden });
            const optionResolver = Q.panelCache.createIdResolver(optionId, { retryMs: intervals.apply });
            const popupResolver = Q.panelCache.createIdResolver(optionId, { retryMs: intervals.apply });
            let selector = null, model = null, nextApplyMs = 0, loop = null;

            const readModel = () => ({ enabled: Q.utils.IsCfgEnabled(ctx.config.view(), "ENABLE_LANE_WITH_PARTY") });
            const isSelected = panel => {
                if (!P.isAlive(panel) || typeof panel.GetSelected !== "function") return false;
                const selected = panel.GetSelected();
                return P.readId(selected) === optionId || P.readTextDeep(selected, 24).toLowerCase().includes("with party");
            };
            const select = (panel, id) => {
                if (typeof panel.SetSelected === "function") panel.SetSelected(id);
            };
            const applySelection = root => {
                select(selector, optionId);
                P.activate(selector);
                const option = optionResolver.resolve(selector) || popupResolver.resolve(root);
                if (!P.isAlive(option)) return false;
                const id = P.readId(option) || optionId;
                select(selector, id);
                P.activate(option);
                select(selector, id);
                $.DispatchEvent("Activated", selector);
                return true;
            };
            const release = () => {
                selector = null;
                nextApplyMs = 0;
                selectorResolver.reset();
                optionResolver.reset();
                popupResolver.reset();
            };
            const update = () => {
                if (!model?.enabled) { release(); return; }
                const root = $.GetContextPanel();
                const current = selectorResolver.resolve(root);
                // A live replacement must bypass the old selector's long retry deadline.
                if (selector !== current) {
                    selector = current;
                    nextApplyMs = 0;
                    optionResolver.reset();
                    popupResolver.reset();
                }
                const now = Q.utils.PerfNowMs();
                if (now < nextApplyMs) return;
                if (!P.isAlive(selector) || !P.isVisible(selector)) {
                    nextApplyMs = now + intervals.hidden;
                    return;
                }
                if (isSelected(selector)) {
                    nextApplyMs = now + intervals.selected;
                    return;
                }
                const hasOption = applySelection(root);
                nextApplyMs = now + (isSelected(selector) ? intervals.selected : hasOption ? intervals.apply : intervals.hidden);
            };
            return {
                onEnable() {
                    model = readModel();
                    loop = Q.core.Scheduler.createPollLoop(update, 0.5, ctx.id);
                },
                onSettingsChanged() {
                    model = readModel();
                    nextApplyMs = 0;
                    update();
                },
                onDisable() {
                    if (loop) loop.stop();
                    loop = null;
                    release();
                    model = null;
                }
            };
        },
        test() {
            const selector = P.findTraverse($.GetContextPanel(), "LanePreferenceSelector");
            if (!selector) return null;
            return { passed: true, name: "Lane preference selector exists", message: "",
                assertions: [{ passed: true, name: "LanePreferenceSelector exists" }] };
        }
    });
})();

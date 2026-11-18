"use strict";

(() => {
    const panel = QOL.core.panel;
    const { readLanguage, writeLanguage } = QOL.features.betterBuilds;

    QOL.core.FeatureRegistry.register({
        id: "ql_better_builds",
        name: "Better Builds",
        enableKey: "ENABLE_BETTER_BUILDS",
        settings: [
            { key: "ENABLE_BETTER_BUILDS", type: "toggle" },
            { key: "LANGUAGE", type: "slider" }
        ],
        create(ctx) {
            let publishedRoot = null;
            function release() {
                if (panel.isAlive(publishedRoot)) writeLanguage(publishedRoot, "");
                publishedRoot = null;
            }
            function publish() {
                const root = panel.findRoot();
                if (root !== publishedRoot) release();
                if (!root) return;
                const language = String(ctx.config.get("LANGUAGE"));
                if (readLanguage(root) !== language && !writeLanguage(root, language)) {
                    throw Error("Could not publish the build browser settings");
                }
                publishedRoot = root;
            }
            return { onEnable: publish, onSettingsChanged: publish, onDisable: release };
        }
    });
})();

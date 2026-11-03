// OWNS: Passive cooldown mode classes and Basic native layout/shop visibility.
// DOES NOT OWN: Advanced item mirror panels, audio reminders or native cooldown values.
// Source: hud.xml (Hud > .HudCore > AbilitiesContainer > hud_passive_items).
(() => {
    "use strict";
    QOL.core.FeatureRegistry.register({
        id: "ql_passive_cooldown",
        enableKey: "ENABLE_PASSIVE_COOLDOWN",
        enabledByDefault: false,
        settings: [
            ...QOL.presentation.stateSettings("ql_passive_cooldown"),
            { key: "ENABLE_PASSIVE_COOLDOWN", type: "toggle" },
            { key: "ENABLE_OLD_ITEM_COOLDOWNS", type: "toggle" },
            { key: "PASSIVE_COOLDOWN_SIZE", type: "slider" },
            { key: "PASSIVE_COOLDOWN_Y", type: "slider" },
            { key: "PASSIVE_COOLDOWN_X", type: "slider" },
            { key: "PASSIVE_COOLDOWN_OPACITY", type: "slider" }
        ],
        create(ctx) {
            const panelAPI = QOL.core.panel;
            const resolver = QOL.panelCache.createIdResolver("hud_passive_items", {
                retryMs: 500,
                ownerPath: [{ id: "Hud", optional: true }, { className: "HudCore" }, "AbilitiesContainer"]
            });
            const styles = panelAPI.createNativeStyleOwner({ resetValues: { x: "0px", y: "0px" } });
            const sampleTree = panelAPI.createOwnedTree();
            const sampleStyles = (target, values) => {
                for (const [key, value] of Object.entries(values)) QOL.utils.SetStyleIfChanged(target, key, value);
            };
            let root = null;
            let panel = null;
            let model = null;
            let loop = null, active = false;

            function presentationMode() {
                return model.mode === "advanced" && !QOL.core.FeatureRegistry.isPresentationAvailable("ql_item_mirror") ? "default" : model.mode;
            }

            function readModel() {
                const cfg = QOL.presentation.captureVisibility(ctx, ctx.config.view());
                const mode = QOL.core.hud.resolvePassiveCooldownMode(cfg);
                const size = QOL.settings.readNumber("PASSIVE_COOLDOWN_SIZE", cfg.PASSIVE_COOLDOWN_SIZE);
                const scale = Number((size / 40 * 110).toFixed(2));
                const x = QOL.settings.readNumber("PASSIVE_COOLDOWN_X", cfg.PASSIVE_COOLDOWN_X);
                const y = QOL.settings.readNumber("PASSIVE_COOLDOWN_Y", cfg.PASSIVE_COOLDOWN_Y);
                const opacity = QOL.utils.NormalizeOpacityNumber(cfg.PASSIVE_COOLDOWN_OPACITY, 0.5);
                return { mode, styles: {
                    uiScale: scale + "%", x: "11px", y: "30px",
                    // Opposing margins retain the available canvas size and
                    // make centered horizontal placement track the full offset.
                    marginLeft: x.toFixed(2) + "%", marginRight: (-x).toFixed(2) + "%",
                    marginTop: (-6 - y).toFixed(2) + "%", marginBottom: (6 + y).toFixed(2) + "%",
                    opacity: opacity.toFixed(2)
                } };
            }

            function releaseRoot(target) {
                styles.apply(target, {});
            }

            function releasePanel(target) {
                styles.apply(target, {});
            }

            function update() {
                if (!active) return;
                const currentRoot = QOL.core.hud.findHud();
                if (currentRoot !== root) {
                    sampleTree.clear();
                    releaseRoot(root);
                    root = currentRoot;
                    resolver.reset();
                }
                if (!panelAPI.isAlive(root) || (root.id !== "Hud" && root.paneltype !== "CitadelHud")) {
                    sampleTree.clear();
                    releasePanel(panel); panel = null; return;
                }
                const mode = presentationMode();
                const basic = mode === "basic";
                styles.apply(root, {}, { passive_cooldown_basic_active: basic, passive_cooldown_advanced_active: mode === "advanced" });
                const current = resolver.resolve(root);
                if (current !== panel) {
                    sampleTree.clear();
                    releasePanel(panel);
                    panel = current;
                }
                if (!panel) return;
                const preview = basic && QOL.presentation.preview.selected(root, "cooldowns");
                const desired = basic ? { ...model.styles } : {};
                if (preview) desired.visibility = "visible";
                styles.apply(panel, basic ? QOL.presentation.visibilityStyles("cooldowns", QOL.presentation.visibilityConfig(ctx), root, desired) : desired,
                    { passive_cooldown_basic_active: basic, QOLCustomizeBasicCooldownPreview: preview });
                if (preview) {
                    const sample = sampleTree.child(panel, "Panel", "QOLCustomizeBasicCooldownSample", { hittest: "false", hittestchildren: "false" });
                    if (!panelAPI.isAlive(sample)) return;
                    sample.AddClass("QOLCustomizeSample");
                    sampleStyles(sample, { width: "45px", height: "45px", horizontalAlign: "center", overflow: "noclip", zIndex: "20" });
                    const image = sampleTree.child(sample, "Image", "QOLCustomizeBasicCooldownImage");
                    const text = sampleTree.child(sample, "Label", "QOLCustomizeBasicCooldownText");
                    if (panelAPI.isAlive(image)) {
                        if (!image.BHasClass("QOLCustomizeSample")) {
                            image.SetImage("s2r://panorama/images/items/spirit/mystic_burst_psd.vtex");
                            image.AddClass("QOLCustomizeSample");
                        }
                        sampleStyles(image, { width: "100%", height: "100%", opacity: "0.5", borderRadius: "50%" });
                    }
                    if (panelAPI.isAlive(text)) {
                        text.AddClass("cooldown_timer");
                        if (text.text !== "8") text.text = "8";
                        sampleStyles(text, { visibility: "visible", horizontalAlign: "center" });
                    }
                } else sampleTree.clear();
            }

            function refreshSettings() {
                if (!active) return;
                model = readModel();
                resolver.reset();
                update();
            }
            function presentationChanged(payload) {
                if (payload?.featureId === "ql_item_mirror" && model) update();
            }

            return QOL.presentation.bindVisibility(ctx, {
                onEnable() {
                    active = true;
                    ctx.events?.on("feature:presentation_changed", presentationChanged);
                    ctx.events?.on("presentation:preview_changed", update);
                    refreshSettings();
                    loop = QOL.core.Scheduler.createPollLoop(update, 0.5, ctx.id);
                },
                onSettingsChanged: refreshSettings,
                onDisable() {
                    active = false;
                    ctx.events?.off("feature:presentation_changed", presentationChanged);
                    ctx.events?.off("presentation:preview_changed", update);
                    if (loop) { loop.stop(); loop = null; }
                    QOL.core.Scheduler.cancelAllForFeature(ctx.id);
                    styles.clear();
                    sampleTree.dispose();
                    root = panel = model = null;
                    resolver.reset();
                }
            }, update);
        },
        test() {
            try {
                const hud = QOL.core.hud.findHud();
                if (!hud) return null;
                return { passed: true, name: "Passive cooldown Hud panel exists", message: "", assertions: [{ passed: true, name: "Hud panel exists" }] };
            } catch (e) { return { passed: false, name: "Passive cooldown panel check", message: (e && e.message ? e.message : String(e)) }; }
        }
    });
})();

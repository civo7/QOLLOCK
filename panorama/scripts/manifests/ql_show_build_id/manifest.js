// manifests/ql_show_build_id/manifest.js
// =============================================================================
// QOLLOCK — Show Build ID
// =============================================================================
// OWNS:        Build ID & title HUD label display for content creators
// DOES NOT OWN: Build storage logic, hero shop
// DEPENDS ON:  QOL.core.FeatureRegistry, QOL.core.Scheduler
// CONFIG KEYS: ENABLE_SHOW_BUILD_ID, ENABLE_SHOW_BUILD_ID_TITLE
// PATTERN:     Polling (1Hz). Displays build ID under LowerLeft panel.
// =============================================================================

(() => {
    "use strict";

    const FR = QOL.core && QOL.core.FeatureRegistry;
    if (!FR) {
        $.Msg("[QOLLock] show_build_id: FeatureRegistry not found — aborting");
        return;
    }

    FR.register({
        id: "ql_show_build_id",
        enableKey: "ENABLE_SHOW_BUILD_ID",
        enabledByDefault: false,
        settings: [
            { key: "ENABLE_SHOW_BUILD_ID", type: "toggle", default: false },
            { key: "ENABLE_SHOW_BUILD_ID_TITLE", type: "toggle", default: false }
        ],
        create: (ctx) => {
            let _loop = null;
            let _lastSig = "";

            const _parseSelectedBuildInfoText = (rawText) => {
                const raw = String(rawText || "").trim();
                if (!raw || raw.length === 0) return null;
                const parts = raw.split(" - ");
                const buildId = String(parts[0] || "").replace(/,/g, "").trim();
                const buildName = String(parts[1] || "").trim();
                const buildVersion = parseInt(String(parts[2] || "0").replace(/,/g, ""), 10);
                if (!buildId || buildId === "0") return null;
                return {
                    id: buildId,
                    name: buildName || "Unknown",
                    visibility: buildVersion > 0 ? "Public" : "Private"
                };
            };

            const _ensurePanel = (root) => {
                if (!root || !$.CreatePanel) return null;
                const lowerLeft = root.FindChildTraverse ? root.FindChildTraverse("LowerLeft") : null;
                if (!lowerLeft) return null;

                let panel = lowerLeft.FindChildTraverse ? lowerLeft.FindChildTraverse("selected_build_info") : null;
                if (!panel) {
                    try {
                        panel = $.CreatePanel("Panel", lowerLeft, "selected_build_info", { hittest: "false", hittestchildren: "false" });
                    } catch (_) {
                        panel = null;
                    }
                }
                if (!panel) return null;

                let label = panel.FindChildTraverse ? panel.FindChildTraverse("build_info") : null;
                if (!label) {
                    try {
                        label = $.CreatePanel("Label", panel, "build_info", { hittest: "false" });
                    } catch (_) {
                        label = null;
                    }
                }
                return label ? { panel, label } : null;
            };

            const _collapse = () => {
                const root = $.GetContextPanel();
                if (!root) return;
                const lowerLeft = root.FindChildTraverse ? root.FindChildTraverse("LowerLeft") : null;
                if (!lowerLeft) return;
                const panel = lowerLeft.FindChildTraverse ? lowerLeft.FindChildTraverse("selected_build_info") : null;
                if (panel && panel.style) {
                    panel.style.visibility = "collapse";
                }
                _lastSig = "";
            };

            const _tick = () => {
                const root = $.GetContextPanel();
                if (!root) return;
                const cfg = (ctx && ctx.config && ctx.config.all) ? ctx.config.all() : {};
                const enabled = cfg.ENABLE_SHOW_BUILD_ID === true || Number(cfg.ENABLE_SHOW_BUILD_ID) === 1;
                if (!enabled) {
                    _collapse();
                    return;
                }

                const source = root.FindChildTraverse ? root.FindChildTraverse("SelectedBuildInfoTitle") : null;
                const rawText = (source && typeof source.text === "string") ? source.text : "";
                const parsed = _parseSelectedBuildInfoText(rawText);
                if (!parsed) {
                    _collapse();
                    return;
                }

                const target = _ensurePanel(root);
                if (!target) return;

                const showTitle = cfg.ENABLE_SHOW_BUILD_ID_TITLE === true || Number(cfg.ENABLE_SHOW_BUILD_ID_TITLE) === 1;
                const displayText = `${parsed.visibility} Build: ${parsed.id}${showTitle ? " - " + parsed.name : ""}`;
                const sig = `${displayText}|${showTitle ? "1" : "0"}`;

                if (target.panel && target.panel.style) {
                    target.panel.style.visibility = "visible";
                }

                if (_lastSig === sig) return;
                _lastSig = sig;

                if (target.panel && target.panel.style) {
                    target.panel.style.marginLeft = "26px";
                    target.panel.style.verticalAlign = "bottom";
                    target.panel.style.height = "24px";
                    target.panel.style.flowChildren = "right";
                    target.panel.style.zIndex = "5";
                }
                if (target.label && target.label.style) {
                    try { target.label.text = displayText; } catch (_) {}
                    try { target.label.html = true; } catch (_) {}
                    target.label.style.whiteSpace = "nowrap";
                    target.label.style.fontSize = "16px";
                    target.label.style.fontWeight = "bold";
                    target.label.style.fontFamily = "oracle, blocky, sans-serif";
                    target.label.style.color = "offWhite";
                    target.label.style.textShadow = "0px 1px 3px 3.0 #000000cc";
                }
            };

            return {
                onEnable: () => {
                    const Scheduler = QOL.core && QOL.core.Scheduler;
                    if (Scheduler && Scheduler.createPollLoop) {
                        _loop = Scheduler.createPollLoop(_tick, 1.0, "ql_show_build_id");
                    }
                    _tick();
                },
                onDisable: () => {
                    if (_loop) {
                        _loop.stop();
                        _loop = null;
                    }
                    _collapse();
                },
                onSettingsChanged: () => {
                    _tick();
                }
            };
        },
        test: (_ctx) => {
            try {
                const root = $.GetContextPanel();
                const lowerLeft = root ? root.FindChildTraverse("LowerLeft") : null;
                if (!lowerLeft) return null; // Skip — not in a match/hud context
                return {
                    passed: true,
                    name: "LowerLeft panel exists",
                    message: "",
                    assertions: [{ passed: true, name: "LowerLeft exists" }]
                };
            } catch (e) {
                return { passed: false, name: "ShowBuildId check", message: (e && e.message ? e.message : String(e)) };
            }
        }
    });
})();

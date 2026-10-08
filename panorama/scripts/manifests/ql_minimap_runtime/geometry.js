// Minimap presentation owns the viewport geometry, not the native map model.
// The fixed-icon renderer class preserves native zoom-surface proportions in CSS.
(() => {
    "use strict";
    const Q = globalThis.QOL;
    const P = Q.core.panel;
    const fixedClass = "QOLFixedMinimapIcons";
    function create() {
        const resolver = Q.panelCache.createIdResolver("minimap_persp", {
            ownerPath: [{ id: "Hud", optional: true }, { className: "HudCore" }, "gameplay_hud", { className: "clamp_width" }]
        });
        let host = null;
        let panels = [];
        let drawOverUi = false;
        const owned = new Map();

        function releasePanel(panel) {
            const record = owned.get(panel);
            if (record && P.isAlive(panel)) {
                for (const property of Object.keys(record.styles)) Q.utils.ClearStyleSafe(panel, property);
                if (panel.id === "hud_minimap") P.setClass(panel, fixedClass, false);
            }
            owned.delete(panel);
        }

        function resolve(root) {
            host = resolver.resolve(root);
            const container = P.findChild(host, "minimap_container");
            const nativeContainer = P.findChild(container, "HudMinimapContainer");
            // Retain the previous discovery path for a renderer in the viewport.
            const renderer = P.findChild(nativeContainer, "hud_minimap") || P.findChild(container, "hud_minimap");
            const next = [host, container, P.findChild(container, "minimap_frame"), nativeContainer, renderer].filter(P.isAlive);
            const changed = next.length !== panels.length || next.some((panel, index) => panel !== panels[index]);
            if (changed) {
                for (const panel of panels) if (!next.includes(panel)) releasePanel(panel);
                panels = next;
            }
            return { host, panels, renderer, changed };
        }

        function apply({ size, fixedIcons, zoomed, x, y, opacity }) {
            const sizeText = Math.round(size) + "px";
            for (const panel of panels) {
                let styles = {};
                if (panel === host) {
                    const marginRight = zoomed ? 0 : 30 - x;
                    const marginBottom = zoomed ? 0 : 30 + y;
                    const marginTop = zoomed ? -y : 0;
                    const marginLeft = zoomed ? x : 0;
                    styles = {
                        uiScale: fixedIcons ? "100%" : Math.round(size / 400 * 100) + "%",
                        preTransformScale2d: "1.00, 1.00", transformOrigin: zoomed ? "50% 50%" : "100% 100%",
                        horizontalAlign: zoomed ? "center" : "right", verticalAlign: zoomed ? "center" : "bottom",
                        align: zoomed ? "center center" : "right bottom",
                        margin: `${marginTop}px ${marginRight}px ${marginBottom}px ${marginLeft}px`,
                        marginTop: marginTop + "px", marginRight: marginRight + "px",
                        marginBottom: marginBottom + "px", marginLeft: marginLeft + "px", opacity: String(opacity)
                    };
                    if (drawOverUi) styles.zIndex = "2147483647";
                } else if (panel.id !== "hud_minimap" && fixedIcons) {
                    styles = { width: sizeText, height: sizeText };
                }
                const previous = owned.get(panel);
                if (previous) for (const property of Object.keys(previous.styles)) {
                    if (!Object.prototype.hasOwnProperty.call(styles, property)) Q.utils.ClearStyleSafe(panel, property);
                }
                const signature = P.syncStyles(panel, styles, previous?.signature).sig;
                owned.set(panel, { styles, signature });
                if (panel.id === "hud_minimap") P.setClass(panel, fixedClass, fixedIcons);
            }
        }

        function setDrawOverUi(active) {
            drawOverUi = active;
            if (!P.isAlive(host)) return;
            const record = owned.get(host);
            if (active) {
                Q.utils.SetStyleIfChanged(host, "zIndex", "2147483647");
                if (record?.styles.zIndex === "2147483647") return;
                owned.set(host, { styles: { ...record?.styles, zIndex: "2147483647" }, signature: null });
            } else if (record?.styles.zIndex !== undefined) {
                Q.utils.ClearStyleSafe(host, "zIndex");
                delete record.styles.zIndex;
                record.signature = null;
            }
        }

        function release() {
            for (const panel of owned.keys()) releasePanel(panel);
            panels = [];
            host = null;
            drawOverUi = false;
            resolver.reset();
        }
        return { resolve, apply, setDrawOverUi, release, resetDiscovery: () => resolver.reset() };
    }
    Q.features.minimapGeometry = { create };
})();

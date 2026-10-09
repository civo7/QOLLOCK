// OWNS: Private performance overlay panel tree, styles and successful write signatures.
// DOES NOT OWN: Timing collection, config, rolling statistics or feature schedules.
(() => {
    "use strict";
    QOL.features.performanceOverlay = {
        create() {
            const P = QOL.core.panel;
            const owned = new Set(), signatures = new Map();
            let root = null, overlay = null, title = null, body = null;
            const deleted = new Set();
            const containerStyle = { x: "10px", y: "80px", width: "fit-children", flowChildren: "down", zIndex: "1000",
                backgroundColor: "rgba(0, 0, 0, 0.65)", padding: "8px 10px 6px 10px", borderRadius: "4px",
                boxShadow: "fill rgba(0, 0, 0, 0.30) 0px 2px 8px 0px" };
            const titleStyle = { fontSize: "14px", fontWeight: "bold", color: "#ffcc00", marginBottom: "4px" };
            const bodyStyle = { fontSize: "12px", color: "#cccccc", lineHeight: "1.4", whiteSpace: "normal", fontFamily: "oracle" };
            function remove(panel) {
                if (P.isAlive(panel)) { P.delete(panel); deleted.add(panel); }
                owned.delete(panel); signatures.delete(panel);
            }
            function clear() {
                for (const panel of [...owned.keys()].reverse()) remove(panel);
                root = overlay = title = body = null;
            }
            function child(parent, id, current, type) {
                if (!P.isAlive(parent)) return null;
                const next = P.findChild(parent, id);
                if (next !== current && current) remove(current);
                if (P.isAlive(next) && deleted.has(next)) return null;
                const panel = next || P.create(type, parent, id, { hittest: "false", hittestchildren: "false" });
                if (P.isAlive(panel)) owned.add(panel);
                return panel;
            }
            function ensure(nextRoot) {
                for (const panel of deleted) {
                    if (!P.isAlive(panel)) deleted.delete(panel);
                    else P.delete(panel);
                }
                if (root !== nextRoot || (P.isAlive(overlay) && overlay.GetParent() !== nextRoot)) clear();
                root = nextRoot;
                overlay = child(root, "QOL_PerfOverlay", overlay, "Panel");
                title = child(overlay, "QOL_PerfTitle", title, "Label");
                body = child(overlay, "QOL_PerfBody", body, "Label");
                return P.isAlive(overlay) && P.isAlive(title) && P.isAlive(body);
            }
            function apply(panel, styles) { signatures.set(panel, P.syncStyles(panel, styles, signatures.get(panel)).sig); }
            function render(nextRoot, opacity, content) {
                if (!ensure(nextRoot)) return false;
                apply(overlay, { ...containerStyle, opacity }); apply(title, titleStyle); apply(body, bodyStyle);
                P.setClass(overlay, "qol-hidden", false);
                if (title.text !== content.title) title.text = content.title;
                if (body.text !== content.body) body.text = content.body;
                return true;
            }
            return { render, clear };
        }
    };
})();

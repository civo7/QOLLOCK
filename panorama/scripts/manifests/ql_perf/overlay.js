// OWNS: Private performance overlay panel tree, styles and successful write signatures.
// DOES NOT OWN: Timing collection, config, rolling statistics or feature schedules.
(() => {
    "use strict";
    QOL.features.performanceOverlay = {
        create() {
            const P = QOL.core.panel;
            const tree = P.createOwnedTree(), signatures = new Map();
            let root = null, overlay = null, title = null, body = null;
            const containerStyle = { x: "10px", y: "80px", width: "fit-children", flowChildren: "down", zIndex: "1000",
                backgroundColor: "rgba(0, 0, 0, 0.65)", padding: "8px 10px 6px 10px", borderRadius: "4px",
                boxShadow: "fill rgba(0, 0, 0, 0.30) 0px 2px 8px 0px" };
            const titleStyle = { fontSize: "14px", fontWeight: "bold", color: "#ffcc00", marginBottom: "4px" };
            const bodyStyle = { fontSize: "12px", color: "#cccccc", lineHeight: "1.4", whiteSpace: "normal", fontFamily: "oracle" };
            function clear() {
                tree.clear(); signatures.clear();
                root = overlay = title = body = null;
            }
            function hide() {
                if (P.isAlive(overlay) && overlay.visible !== false) P.setVisible(overlay, false);
            }
            function ensure(nextRoot) {
                tree.sweep();
                if (!P.isAlive(nextRoot) || (nextRoot.id !== "Hud" && nextRoot.paneltype !== "CitadelHud")) { clear(); return false; }
                if (root !== nextRoot || (P.isAlive(overlay) && overlay.GetParent() !== nextRoot)) clear();
                root = nextRoot;
                const previous = overlay;
                overlay = tree.child(root, "Panel", "QOL_PerfOverlay");
                if (previous !== overlay) hide();
                title = tree.child(overlay, "Label", "QOL_PerfTitle");
                body = tree.child(overlay, "Label", "QOL_PerfBody");
                for (const panel of signatures.keys()) if (panel !== overlay && panel !== title && panel !== body) signatures.delete(panel);
                return P.isAlive(overlay) && P.isAlive(title) && P.isAlive(body);
            }
            function apply(panel, styles) { signatures.set(panel, P.syncStyles(panel, styles, signatures.get(panel)).sig); }
            function render(nextRoot, opacity, content) {
                if (!ensure(nextRoot)) { hide(); return false; }
                apply(overlay, { ...containerStyle, opacity }); apply(title, titleStyle); apply(body, bodyStyle);
                P.setClass(overlay, "qol-hidden", false);
                if (title.text !== content.title) title.text = content.title;
                if (body.text !== content.body) body.text = content.body;
                if (overlay.visible !== true) P.setVisible(overlay, true);
                return true;
            }
            function dispose() { clear(); tree.dispose(); }
            return { render, clear, dispose };
        }
    };
})();

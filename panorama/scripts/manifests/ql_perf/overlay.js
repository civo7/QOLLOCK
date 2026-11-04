// OWNS: Private performance overlay panel tree, styles and successful write signatures.
// DOES NOT OWN: Timing collection, config, rolling statistics or feature schedules.
(() => {
    "use strict";
    QOL.features.performanceOverlay = {
        create() {
            const P = QOL.core.panel;
            const tree = P.createOwnedTree();
            let signature = null;
            let root = null, overlay = null, title = null, body = null;
            function clear() {
                tree.clear(); signature = null;
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
                if (previous !== overlay) { signature = null; hide(); }
                title = tree.child(overlay, "Label", "QOL_PerfTitle");
                body = tree.child(overlay, "Label", "QOL_PerfBody");
                return P.isAlive(overlay) && P.isAlive(title) && P.isAlive(body);
            }
            function render(nextRoot, opacity, content) {
                if (!ensure(nextRoot)) { hide(); return false; }
                signature = P.syncStyles(overlay, { opacity }, signature).sig;
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

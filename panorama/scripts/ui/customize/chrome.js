// Session-only editor window positions. Only a compositor proxy is reparented.
(() => {
    "use strict";
    const Q = globalThis.QOL;
    const P = Q.core.panel;
    const G = Q.ui.customizeGeometry;
    function create(overlay, enabled) {
        const windows = [];
        let gesture = null;
        let timer = null;
        let disposed = false;
        const clamp = (bounds, view) => ({
            x: Math.max(0, Math.min(Math.max(0, view.width - bounds.width), bounds.x)),
            y: Math.max(0, Math.min(Math.max(0, view.height - bounds.height), bounds.y))
        });
        function finish() {
            if (timer !== null) $.CancelScheduled(timer);
            timer = null;
            P.delete(gesture?.proxy);
            gesture = null;
        }
        function update(ending = false) {
            if (!gesture || disposed) return;
            const { panel, proxy, bounds } = gesture;
            const view = G.viewport(overlay);
            if (!enabled() || !P.isAlive(panel) || !G.isShown(panel) || !P.isAlive(proxy) || !view) { finish(); return; }
            const point = G.absolute(proxy);
            if (!gesture.origin) gesture.origin = point;
            const delta = G.canvasDelta({ x: point.x - gesture.origin.x, y: point.y - gesture.origin.y }, overlay);
            const position = clamp({ ...bounds, x: bounds.x + delta.x, y: bounds.y + delta.y }, view);
            gesture.item.position = position;
            gesture.item.signature = P.syncStyles(panel, {
                align: "left top", margin: "0px", x: `${Math.round(position.x)}px`, y: `${Math.round(position.y)}px`
            }, gesture.item.signature).sig;
            if (ending) finish();
            else timer = $.Schedule(0.016, () => update());
        }
        function header(panel, id, title) {
            const handle = P.create("Button", panel, id, { draggable: "true" });
            handle.AddClass("QOLCustomizeChromeHandle");
            handle.hittestchildren = false;
            Q.ui.customizeInspector.label(handle, title, "ModalTitle");
            const item = { panel, handle, position: null, signature: null };
            windows.push(item);
            $.RegisterEventHandler("DragStart", handle, (_panel, event) => {
                if (disposed || gesture || !enabled() || !G.isShown(panel)) return;
                const bounds = G.box(panel, overlay);
                if (!bounds || !G.viewport(overlay)) return;
                const proxy = P.create("Panel", overlay, "QOLCustomizeChromeProxy");
                if (!P.isAlive(proxy)) return;
                proxy.style.width = "16px"; proxy.style.height = "16px";
                proxy.style.align = "left top";
                proxy.hittest = false; proxy.hittestchildren = false;
                gesture = { item, panel, proxy, bounds, origin: null };
                event.displayPanel = proxy;
                event.removePositionBeforeDrop = false;
                timer = $.Schedule(0, () => update());
            });
            $.RegisterEventHandler("DragEnd", handle, () => {
                if (gesture?.panel === panel) update(true);
            });
            return handle;
        }
        function refresh() {
            if (disposed || gesture) return;
            const view = G.viewport(overlay);
            if (!view) return;
            for (const item of windows) {
                if (!item.position || !P.isAlive(item.panel) || !G.isShown(item.panel)) continue;
                const bounds = G.box(item.panel, overlay);
                if (!bounds) continue;
                item.position = clamp({ ...bounds, ...item.position }, view);
                item.signature = P.syncStyles(item.panel, {
                    align: "left top", margin: "0px", x: `${Math.round(item.position.x)}px`, y: `${Math.round(item.position.y)}px`
                }, item.signature).sig;
            }
        }
        return { header, refresh, isDragging: () => !!gesture,
            dispose() { disposed = true; finish(); } };
    }
    Q.ui.customizeChrome = { create };
})();

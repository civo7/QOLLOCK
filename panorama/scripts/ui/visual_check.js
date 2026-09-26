// Manual visual checks: temporary config publication, never a disk/profile save.
(() => {
    "use strict";
    const Q = globalThis.QOL;
    const P = Q.core.panel;
    const persistence = Q.core.persistence;
    const localize = text => Q.ui.theme.LocalizeSettingsText(text, true);
    let session = null;

    // Explicit scenarios use existing setting keys. X/Y are one operation.
    const groups = [
        ["Top Bar", { HUD_TOP_BAR_ENABLED: 1, TOP_BAR_OPACITY: 1, TOP_BAR_SCALE: 1, TOP_BAR_X_OFFSET: 0, TOP_BAR_Y_OFFSET: 0 },
            { TOP_BAR_X_OFFSET: 100, TOP_BAR_Y_OFFSET: 80, TOP_BAR_SCALE: 0.8 }, "Right and down, smaller"],
        ["Bottom Bar", { HUD_BOTTOM_BAR_ENABLED: 1, BOTTOM_BAR_OPACITY: 1, BOTTOM_BAR_SCALE: 1, BOTTOM_BAR_X_OFFSET: 0, BOTTOM_BAR_Y_OFFSET: 0 },
            { BOTTOM_BAR_X_OFFSET: 100, BOTTOM_BAR_Y_OFFSET: -80, BOTTOM_BAR_SCALE: 0.8 }, "Right and up, smaller"],
        ["Souls", { HUD_SOULS_ENABLED: 1, SOULS_OPACITY: 1, SOULS_X_OFFSET: 0, SOULS_Y_OFFSET: 0 },
            { SOULS_X_OFFSET: 100, SOULS_Y_OFFSET: -80, SOULS_OPACITY: 0.5 }, "Right and up, more transparent"],
        ["Items", { HUD_ITEMS_ENABLED: 1, ITEMS_OPACITY: 1, ITEMS_X_OFFSET: 0, ITEMS_Y_OFFSET: 0 },
            { ITEMS_X_OFFSET: 100, ITEMS_Y_OFFSET: -80, ITEMS_OPACITY: 0.5 }, "Right and up, more transparent; equip items first"],
        ["Ammo", { ENABLE_AMMO_STATUS: 1, ENABLE_HIDE_AMMO_ALL: 0, ENABLE_HIDE_MAGAZINE: 0, AMMO_PANEL_SCALE: 100, AMMO_PANEL_X_OFFSET: 0, AMMO_PANEL_Y_OFFSET: 0 },
            { AMMO_PANEL_X_OFFSET: 80, AMMO_PANEL_Y_OFFSET: -80, AMMO_PANEL_SCALE: 150 }, "Right and up, larger"],
        ["Minimap", { MINIMAP_BASE_OPACITY: 1, MINIMAP_SMALL_SIZE: 400, MINIMAP_X_OFFSET: 0, MINIMAP_Y_OFFSET: 0, ENABLE_ALT_ZOOM: 0, ENABLE_TAB_ZOOM: 0 },
            { MINIMAP_SMALL_SIZE: 300, MINIMAP_BASE_OPACITY: 0.5 }, "Smaller, more transparent"],
    ];
    const steps = [];
    for (const [name, normal, changed, expected] of groups) {
        steps.push({ name, values: normal, expected: "Reference position and size" });
        steps.push({ name, values: Object.assign({}, normal, changed), expected });
    }

    function publish(values) {
        Object.assign(globalThis.MOD_CONFIG, values);
        persistence.markConfigEdited(session.root);
        persistence.writeStorageConfigRawToUi(session.root, globalThis.WrapConfigForStorage(globalThis.MOD_CONFIG));
    }

    function stop() {
        if (!session) return;
        const current = session;
        if (current.timer) $.CancelScheduled(current.timer);
        try { publish(current.original); }
        finally {
            session = null;
            for (const [panel, visibility] of current.hidden) {
                if (!P.isAlive(panel)) continue;
                if (visibility) panel.style.visibility = visibility;
                else P.clearStyleProperty(panel, "visibility");
            }
            if (P.isAlive(current.context)) {
                if (current.background) current.context.style.backgroundColor = current.background;
                else P.clearStyleProperty(current.context, "background-color");
            }
            P.delete(current.overlay);
            if (current.onStop) current.onStop();
        }
    }

    function applyStep(index) {
        if (!session) return;
        if (index >= steps.length) { stop(); return; }
        session.index = Math.max(0, index);
        const step = steps[session.index];
        // Restore the previous group before applying the next; unrelated settings
        // stay as they are. Use the normal HUD revision bridge, not direct styles.
        publish(Object.assign({}, session.original, step.values));
        session.label.text = `${session.index + 1}/${steps.length} — ${localize(step.name)}\n${localize(step.expected)}\n` +
            localize("Observe the HUD; this is not an automatic pass.") + "\n" +
            Object.entries(step.values).map(([key, value]) => `${key} = ${value}`).join("  |  ");
    }

    function watch(current) {
        if (session !== current) return;
        if (!P.isAlive(current.overlay) || !P.isAlive(current.hud) || !P.isAlive(current.window) || !current.window.BHasClass("Visible")) {
            stop();
            return;
        }
        current.timer = $.Schedule(0.5, () => watch(current));
    }

    function start(onStop) {
        if (session) return false;
        const context = $.GetContextPanel();
        const root = persistence.getUIRoot();
        const hud = persistence.resolveHudPanel(root);
        const window = P.findTraverse(context, "SettingsWindow");
        if (!P.isAlive(hud) || !P.isAlive(window) || !window.BHasClass("Visible")) return false;
        // Finish the user's prior pending edit before taking ownership of the
        // temporary values. No SaveAndSync calls are made during the check.
        globalThis.FlushPendingSave();
        const original = {};
        for (const step of steps) for (const key of Object.keys(step.values)) {
            if (!Object.prototype.hasOwnProperty.call(globalThis.MOD_CONFIG, key)) return false;
            original[key] = globalThis.MOD_CONFIG[key];
        }
        const overlay = P.create("Panel", context, "QOLVisualCheck");
        if (!P.isAlive(overlay)) return false;
        session = { root, hud, window, context, background: context.style.backgroundColor || "", original, overlay, hidden: [], index: 0, timer: null, onStop };
        try {
            context.style.backgroundColor = "#00000000";
            Object.assign(overlay.style, { width: "620px", horizontalAlign: "left", verticalAlign: "top", marginLeft: "20px", marginTop: "140px", flowChildren: "down", backgroundColor: "#111b24f5", padding: "16px", borderRadius: "8px", zIndex: "1000" });
            overlay.hittest = true;
            const label = P.create("Label", overlay, "QOLVisualCheckText");
            Object.assign(label.style, { color: "#ffffff", fontSize: "16px", whiteSpace: "normal", width: "100%" });
            session.label = label;
            const buttons = P.create("Panel", overlay, "");
            buttons.style.flowChildren = "right";
            const owner = session;
            function button(id, text, action) {
                const panel = P.create("Button", buttons, id);
                Object.assign(panel.style, { backgroundColor: "#304658", padding: "10px", marginRight: "8px", marginTop: "12px" });
                const caption = P.create("Label", panel, "");
                caption.text = localize(text);
                caption.style.color = "#ffffff";
                panel.SetPanelEvent("onactivate", () => { if (session === owner) action(); });
            }
            button("QOLVisualCheckBack", "Back", () => applyStep(session.index - 1));
            button("QOLVisualCheckRepeat", "Compare A/B", () => applyStep(session.index % 2 ? session.index - 1 : session.index + 1));
            button("QOLVisualCheckNext", "Next", () => applyStep(session.index + 1));
            button("QOLVisualCheckStop", "Stop", stop);
            // Only direct menu children: do not traverse native HUD subtrees.
            // The CEF bridge remains visible so pending real saves can complete.
            for (const child of context.Children()) {
                if (child === overlay || child.id === "QOLStorageBridge") continue;
                session.hidden.push([child, child.style.visibility || ""]);
                child.style.visibility = "collapse";
            }
            Q.preview?.hideAll?.();
            Q.tooltip?.hideRowTooltip?.();
            applyStep(0);
            watch(session);
            return true;
        } catch (error) {
            stop();
            $.Msg("[QOLLock][VisualCheck] " + error.message);
            return false;
        }
    }

    Q.ui.visualCheck = { start, stop, next: () => { if (session) applyStep(session.index + 1); }, isRunning: () => !!session };
})();

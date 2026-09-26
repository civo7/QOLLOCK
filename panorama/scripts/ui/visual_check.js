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
            { TOP_BAR_X_OFFSET: 100, TOP_BAR_Y_OFFSET: -80, TOP_BAR_SCALE: 0.8, TOP_BAR_OPACITY: 0.5 }, "Right and down, smaller and more transparent"],
        ["Bottom Bar", { HUD_BOTTOM_BAR_ENABLED: 1, BOTTOM_BAR_OPACITY: 1, BOTTOM_BAR_SCALE: 1, BOTTOM_BAR_X_OFFSET: 0, BOTTOM_BAR_Y_OFFSET: 0 },
            { BOTTOM_BAR_X_OFFSET: 100, BOTTOM_BAR_Y_OFFSET: 80, BOTTOM_BAR_SCALE: 0.8, BOTTOM_BAR_OPACITY: 0.5 }, "Right and up, smaller and more transparent"],
        ["Souls", { HUD_SOULS_ENABLED: 1, SOULS_OPACITY: 1, SOULS_X_OFFSET: 0, SOULS_Y_OFFSET: 0 },
            { SOULS_X_OFFSET: 100, SOULS_Y_OFFSET: 80, SOULS_OPACITY: 0.5 }, "Right and up, more transparent"],
        ["Items", { HUD_ITEMS_ENABLED: 1, ITEMS_OPACITY: 1, ITEMS_X_OFFSET: 0, ITEMS_Y_OFFSET: 0 },
            { ITEMS_X_OFFSET: 100, ITEMS_Y_OFFSET: 80, ITEMS_OPACITY: 0.5 }, "Right and up, more transparent; equip items first"],
        ["Ammo", { ENABLE_AMMO_STATUS: 1, ENABLE_HIDE_AMMO_ALL: 0, ENABLE_HIDE_MAGAZINE: 0, AMMO_PANEL_SCALE: 100, AMMO_PANEL_X_OFFSET: 0, AMMO_PANEL_Y_OFFSET: 0 },
            { AMMO_PANEL_X_OFFSET: 80, AMMO_PANEL_Y_OFFSET: -80, AMMO_PANEL_SCALE: 150 }, "Right and up, larger"],
        ["Minimap", { MINIMAP_BASE_OPACITY: 1, MINIMAP_SMALL_SIZE: 400, MINIMAP_X_OFFSET: 0, MINIMAP_Y_OFFSET: 0, ENABLE_ALT_ZOOM: 0, ENABLE_TAB_ZOOM: 0 },
            { MINIMAP_SMALL_SIZE: 300, MINIMAP_BASE_OPACITY: 0.5 }, "Smaller, more transparent"],
        ["Keyboard", { ENABLE_KEYBOARD_OVERLAY: 1, ENABLE_FULL_KEYBOARD_LAYOUT: 0, KEYBOARD_OVERLAY_SCALE: 100, KEYBOARD_OVERLAY_X_OFFSET: 0, KEYBOARD_OVERLAY_Y_OFFSET: 0 },
            { ENABLE_FULL_KEYBOARD_LAYOUT: 1, KEYBOARD_OVERLAY_SCALE: 130, KEYBOARD_OVERLAY_X_OFFSET: 100, KEYBOARD_OVERLAY_Y_OFFSET: 80 }, "Inspect the changed layout, size and offsets; test inputs in game."],
        ["Zipline Boost", { ENABLE_ZIP_BOOST: 1, ZIP_BOOST_SCALE: 100, ZIP_BOOST_X_OFFSET: 0, ZIP_BOOST_Y_OFFSET: 0 },
            { ZIP_BOOST_SCALE: 130, ZIP_BOOST_X_OFFSET: 100, ZIP_BOOST_Y_OFFSET: 80 }, "Inspect the changed size and offsets; use a zipline in game."],
        ["Speed", { ENABLE_COMPASS_SPEED: 1, COMPASS_SPEED_X_OFFSET: 0, COMPASS_SPEED_Y_OFFSET: 0 },
            { COMPASS_SPEED_X_OFFSET: 100, COMPASS_SPEED_Y_OFFSET: 80 }, "Inspect the changed offsets; move in game."],
        ["Compass", { ENABLE_COMPASS: 1, ENABLE_SIMPLIFY_COMPASS: 0, COMPASS_SCALE: 100, COMPASS_STRETCH_X: 100, COMPASS_STRETCH_Y: 100, COMPASS_X_OFFSET: 0, COMPASS_Y_OFFSET: 120 },
            { ENABLE_SIMPLIFY_COMPASS: 1, COMPASS_SCALE: 130, COMPASS_X_OFFSET: 100, COMPASS_Y_OFFSET: 200 }, "Inspect the changed layout, size and offsets; turn in game."],
        ["Active Stats", { ENABLE_CROSSHAIR_STATS: 1, CROSSHAIR_STATS_SHOW_BUFFS: 1, CROSSHAIR_STATS_SHOW_DEBUFFS: 1, CROSSHAIR_STATS_SCALE: 100, CROSSHAIR_STATS_OPACITY: 1, CROSSHAIR_STATS_X_OFFSET: 0, CROSSHAIR_STATS_Y_OFFSET: 0 },
            { CROSSHAIR_STATS_SCALE: 130, CROSSHAIR_STATS_OPACITY: 0.5, CROSSHAIR_STATS_X_OFFSET: 100, CROSSHAIR_STATS_Y_OFFSET: 80 }, "Inspect size, opacity and offsets while buffs or debuffs are active."],
        ["Shop Display", { SHOP_OFFSET_X: 0, SHOP_OFFSET_Y: 0, SHOP_OPACITY: 1, SHOP_SCALE: 1 },
            { SHOP_OFFSET_X: 100, SHOP_OFFSET_Y: 80, SHOP_OPACITY: 0.5, SHOP_SCALE: 0.8 }, "Open the shop in game; inspect size, opacity and offsets."],
        ["Recent Purchases", { ENABLE_SHOP_RECENT_PURCHASES: 1, RECENT_PURCHASES_PANEL_X_OFFSET: 0, RECENT_PURCHASES_PANEL_Y_OFFSET: 0, RECENT_PURCHASES_PANEL_OPACITY: 1, RECENT_PURCHASES_PANEL_SCALE: 1 },
            { RECENT_PURCHASES_PANEL_X_OFFSET: 100, RECENT_PURCHASES_PANEL_Y_OFFSET: 80, RECENT_PURCHASES_PANEL_OPACITY: 0.5, RECENT_PURCHASES_PANEL_SCALE: 0.8 }, "Buy items in game; inspect purchase history size, opacity and offsets."],
        ["Item Buy Notifications", { ENABLE_SHOP_ITEM_NOTIFICATIONS: 1, ENABLE_HERO_PURCHASE_POPUPS: 0, RECENT_PURCHASES_QUICK_REJUV: 0, RECENT_PURCHASES_QUICK_SCOREBOARD: 0, RECENT_PURCHASES_QUICK_MAX: 5, RECENT_PURCHASES_QUICK_DISPLAY_SEC: 15, RECENT_PURCHASES_QUICK_X_OFFSET: 0, RECENT_PURCHASES_QUICK_Y_OFFSET: 0, RECENT_PURCHASES_QUICK_OPACITY: 1, RECENT_PURCHASES_QUICK_SCALE: 1 },
            { RECENT_PURCHASES_QUICK_X_OFFSET: 100, RECENT_PURCHASES_QUICK_Y_OFFSET: 80, RECENT_PURCHASES_QUICK_OPACITY: 0.5, RECENT_PURCHASES_QUICK_SCALE: 0.8 }, "Trigger a new purchase notification in game; inspect size, opacity and offsets."],
        ["Per-Hero Popups", { ENABLE_SHOP_ITEM_NOTIFICATIONS: 1, ENABLE_HERO_PURCHASE_POPUPS: 0, HUD_TOP_BAR_ENABLED: 1, TOP_BAR_OPACITY: 1, RECENT_PURCHASES_QUICK_REJUV: 0, RECENT_PURCHASES_QUICK_SCOREBOARD: 0, RECENT_PURCHASES_QUICK_DISPLAY_SEC: 15, RECENT_PURCHASES_QUICK_X_OFFSET: 0, RECENT_PURCHASES_QUICK_Y_OFFSET: 0, RECENT_PURCHASES_QUICK_OPACITY: 1, RECENT_PURCHASES_QUICK_SCALE: 1 },
            { ENABLE_HERO_PURCHASE_POPUPS: 1 }, "Trigger a new purchase notification in game; compare center and per-hero placement."],
        ["Healthbar", { HEALTHBAR_TYPE: 1, PLAYER_HEALTHBAR_SCALE: 100, PLAYER_HEALTHBAR_OPACITY: 1, PLAYER_HEALTHBAR_X_OFFSET: 0, PLAYER_HEALTHBAR_Y_OFFSET: 0 },
            { PLAYER_HEALTHBAR_SCALE: 130, PLAYER_HEALTHBAR_OPACITY: 0.5, PLAYER_HEALTHBAR_X_OFFSET: 100, PLAYER_HEALTHBAR_Y_OFFSET: 80 }, "Inspect size, opacity and offsets during gameplay."],
        ["Damage Impact", { ENABLE_DAMAGE_IMPACT: 1, DAMAGE_IMPACT_SCALE: 1, DAMAGE_IMPACT_OPACITY: 1, DAMAGE_IMPACT_X_OFFSET: 0, DAMAGE_IMPACT_Y_OFFSET: 0 },
            { DAMAGE_IMPACT_SCALE: 1.3, DAMAGE_IMPACT_OPACITY: 0.5, DAMAGE_IMPACT_X_OFFSET: 100, DAMAGE_IMPACT_Y_OFFSET: 80 }, "Deal damage in game; inspect size, opacity and offsets."],
        ["Unsecured Souls Timer", { ENABLE_UNSECURED_SOUL_TIMER: 1, UNSECURED_SOUL_TIMER_SCALE: 100, UNSECURED_SOUL_TIMER_X_OFFSET: 0, UNSECURED_SOUL_TIMER_Y_OFFSET: 0 },
            { UNSECURED_SOUL_TIMER_SCALE: 130, UNSECURED_SOUL_TIMER_X_OFFSET: 100, UNSECURED_SOUL_TIMER_Y_OFFSET: 80 }, "Collect unsecured souls in game; inspect size and offsets."],
        ["Unsecured Souls", { ENABLE_BETTER_UNSECURED: 1, ENABLE_BETTER_UNSECURED_SHOW_ICON: 1, ENABLE_BETTER_UNSECURED_SHOW_TEXT: 1, UNSECURED_SOULS_HUD_SCALE: 100, UNSECURED_SOULS_HUD_X_OFFSET: 0, UNSECURED_SOULS_HUD_Y_OFFSET: 1095 },
            { UNSECURED_SOULS_HUD_SCALE: 130, UNSECURED_SOULS_HUD_X_OFFSET: 100, UNSECURED_SOULS_HUD_Y_OFFSET: 1175 }, "Collect unsecured souls in game; inspect size and offsets."],
        ["Chat", { CHAT_SCALE: 100, CHAT_X_OFFSET: 0, CHAT_Y_OFFSET: 0 },
            { CHAT_SCALE: 130, CHAT_X_OFFSET: 100, CHAT_Y_OFFSET: 80 }, "Open chat in game; inspect size and offsets."],
        ["Reload Cooldown", { ENABLE_RELOAD_COOLDOWN: 1, ENABLE_HIDE_RELOAD_ICON: 0, ENABLE_HIDE_RELOAD_CIRCLE: 0, RELOAD_COOLDOWN_SIZE: 28, RELOAD_COOLDOWN_OPACITY: 1, RELOAD_COOLDOWN_X_OFFSET: 0, RELOAD_COOLDOWN_Y_OFFSET: 0 },
            { RELOAD_COOLDOWN_SIZE: 42, RELOAD_COOLDOWN_OPACITY: 0.5, RELOAD_COOLDOWN_X_OFFSET: 50, RELOAD_COOLDOWN_Y_OFFSET: 50 }, "Reload in game; inspect size, opacity and offsets."],
    ];
    const steps = [];
    for (const [name, normal, changed, expected] of groups) {
        steps.push({ name, values: normal, expected: "Reference position and size", action: expected });
        steps.push({ name, values: Object.assign({}, normal, changed), expected, action: expected });
    }

    function publish(values, target = session) {
        Object.assign(globalThis.MOD_CONFIG, values);
        persistence.markConfigEdited(target.root);
        persistence.writeStorageConfigRawToUi(target.root, globalThis.WrapConfigForStorage(globalThis.MOD_CONFIG));
    }

    function stop(restoreFocus = true) {
        if (!session) return;
        const current = session;
        session = null;
        // A failed/deleted handle must not prevent the rest of the menu from
        // recovering. Never restore native visibility through inline CSS APIs.
        const cleanup = action => {
            try { action(); }
            catch (error) { $.Msg("[QOLLock][VisualCheck] cleanup: " + error.message); }
        };
        cleanup(() => { if (current.timer !== null) $.CancelScheduled(current.timer); });
        cleanup(() => publish(current.original, current));
        for (const panel of current.hidden) {
            cleanup(() => { if (P.isAlive(panel)) panel.RemoveClass("QOLVisualCheckHidden"); });
        }
        for (const panel of [current.hud, current.context]) {
            cleanup(() => { if (P.isAlive(panel)) panel.RemoveClass("QOLVisualCheckActive"); });
        }
        cleanup(() => P.delete(current.overlay));
        cleanup(() => { if (restoreFocus && P.isAlive(current.window) && current.window.BHasClass("Visible")) current.window.SetFocus(); });
        cleanup(() => { if (current.onStop) current.onStop(); });
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
            localize("Test in game, then reopen QOLLOCK settings to continue this step.") + "\n" +
            (session.index % 2 === 0 ? localize(step.action) + "\n" : "") +
            Object.entries(step.values).map(([key, value]) => `${key} = ${value}`).join("  |  ");
    }

    function play() {
        if (!session || session.playing) return;
        session.playing = true;
        session.overlay.visible = false;
        // Restore native menu navigation, including its entry back into QOLLOCK.
        for (const panel of session.hidden) if (P.isAlive(panel)) panel.RemoveClass("QOLVisualCheckHidden");
        for (const panel of [session.hud, session.context]) panel.RemoveClass("QOLVisualCheckActive");
        Q.ui.window.setOpen(false);
        $.DispatchEvent("CitadelResumePlaying", session.context);
    }

    function onMenuOpened() {
        if (!session?.playing) return;
        session.playing = false;
        for (const panel of session.hidden) if (P.isAlive(panel)) panel.AddClass("QOLVisualCheckHidden");
        for (const panel of [session.hud, session.context]) panel.AddClass("QOLVisualCheckActive");
        session.overlay.visible = true;
        session.overlay.SetFocus();
    }

    function watch(current) {
        if (session !== current) return;
        if (!P.isAlive(current.overlay) || !P.isAlive(current.hud) || !P.isAlive(current.window) || (!current.playing && !current.window.BHasClass("Visible"))) {
            stop();
            return;
        }
        if (current.playing && current.window.BHasClass("Visible")) {
            onMenuOpened();
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
        session = { root, hud, window, context, original, overlay, hidden: [], index: 0, timer: null, playing: false, onStop };
        try {
            hud.AddClass("QOLVisualCheckActive");
            context.AddClass("QOLVisualCheckActive");
            Object.assign(overlay.style, { width: "620px", horizontalAlign: "left", verticalAlign: "top", marginLeft: "20px", marginTop: "140px", flowChildren: "down", backgroundColor: "#111b24f5", padding: "16px", borderRadius: "8px", zIndex: "1000" });
            overlay.hittest = true;
            overlay.acceptsfocus = true;
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
            const playRow = P.create("Panel", overlay, "");
            playRow.style.flowChildren = "right";
            const playButton = P.create("Button", playRow, "QOLVisualCheckPlay");
            Object.assign(playButton.style, { backgroundColor: "#304658", padding: "10px", marginTop: "12px" });
            const playCaption = P.create("Label", playButton, "");
            playCaption.text = localize("Test in game");
            playCaption.style.color = "#ffffff";
            playButton.SetPanelEvent("onactivate", () => { if (session === owner) play(); });
            // Only direct menu children: do not traverse native HUD subtrees.
            // The CEF bridge remains visible so pending real saves can complete.
            for (const child of context.Children()) {
                if (child === overlay || child.id === "QOLStorageBridge" || child.id === "EscapeButton" || child.id === "EscapeBackground") continue;
                session.hidden.push(child);
                child.AddClass("QOLVisualCheckHidden");
            }
            Q.preview?.hideAll?.();
            Q.tooltip?.hideRowTooltip?.();
            applyStep(0);
            overlay.SetFocus();
            watch(session);
            return true;
        } catch (error) {
            stop();
            $.Msg("[QOLLock][VisualCheck] " + error.message);
            return false;
        }
    }

    Q.ui.visualCheck = { start, stop, onMenuOpened, onMenuClosed: () => { if (!session?.playing) stop(false); }, next: () => { if (session) applyStep(session.index + 1); }, isRunning: () => !!session };
})();

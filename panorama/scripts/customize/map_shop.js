// Minimap states share a native owner, but keep distinct persisted settings.
// Shop and purchase surfaces are measured only when their native context exists.
(() => {
    "use strict";
    const C = QOL.presentation;
    const { core, lower } = C.paths;
    const { geometry, opacity, toggle, field: f, content } = C.fields;
    const t = (key, label, extra = {}) => content(key, label, "toggle", extra);
    const mapHost = [...C.paths.gameplay, { className: "clamp_width" }, "minimap_persp"];
    const mapPath = [...mapHost, "minimap_container"];
    function activeMapMode(hud, config) {
        const host = C.findPath(hud, mapHost) || QOL.core.panel.findTraverse(hud, "minimap_persp");
        const active = cls => QOL_UTILS.HasClassInHierarchy(host, cls) || hud.BHasClass(cls);
        if (Number(config.ENABLE_ALT_ZOOM) === 1 && active("gDetailView")) return "alt";
        if (Number(config.ENABLE_TAB_ZOOM) === 1 && active("gScoreboardOpen")) return "tab";
        return "base";
    }
    const minimap = (id, name, fields, state = "base") => ({ id, name, group: "Minimap", path: mapHost, measureId: "minimap_container", fields,
        available: (hud, config) => activeMapMode(hud, config) === state });
    const zoomFields = mode => [
        toggle("ENABLE_" + mode + "_ZOOM"), f("MINIMAP_LARGE_SIZE_" + mode, "Size", null, { resize: true }),
        // Center alignment halves one-sided margins; preserve persisted units.
        f("ZOOM_X_OFFSET_" + mode, "Horizontal Offset", null, { axis: "x", movementRatio: 0.5 }),
        f("ZOOM_Y_OFFSET_" + mode, "Vertical Offset", null, { axis: "y", direction: -1, movementRatio: 0.5 }),
        f(mode + "_ZOOM_OPACITY", "Opacity"), t(mode + "_ZOOM_DRAW_OVER_UI", "Draw Over UI"),
        t("ENABLE_" + mode + "_ZOOM_REM_TUNNELS", "Rem Tunnels"),
        f(mode + "_ZOOM_REM_TUNNELS_OPACITY", "Tunnel Opacity", null, { when: session => Number(session.value("ENABLE_" + mode + "_ZOOM_REM_TUNNELS")) === 1 })
    ];
    C.register([
        minimap("minimap", "Base Minimap", [
            ...geometry("MINIMAP_"), f("MINIMAP_SMALL_SIZE", "Size", null, { resize: true }),
            f("MINIMAP_BASE_OPACITY", "Opacity"),
            t("MINIMAL_MINIMAP", "Minimalist"),
            f("MINIMAL_MINIMAP_OPACITY", "Minimalist Opacity", null, { when: session => Number(session.value("MINIMAL_MINIMAP")) === 1 }),
            t("MINIMAP_FIXED_ICON_SIZE", "Fixed Icon Size"), f("MINIMAP_ICON_COLOR", "Icons", "palette"),
            t("MINIMAP_FLIP", "Flip"), t("MINIMAP_ROTATE_WITH_PLAYER", "Spinny Mode"),
            t("ENABLE_MINIMAP_ELEVATION_MARKERS", "Elevation Markers"),
            t("ENABLE_MINIMAP_BUFF_TIMER", "Bridge Buff Timer"),
            t("ENABLE_MINIMAP_BUFF_TIMER_ON_BRIDGE", "On Bridge", { when: session => Number(session.value("ENABLE_MINIMAP_BUFF_TIMER")) === 1 }),
            t("ENABLE_MINIMAP_REJUV_TIMER", "Mid Boss Timer"),
            t("ENABLE_MINIMAP_ALWAYS_ON_MID_BOSS", "On Mid Boss", { when: session => Number(session.value("ENABLE_MINIMAP_REJUV_TIMER")) === 1 })
        ]),
        minimap("minimapAlt", "Minimap: Alt", zoomFields("ALT"), "alt"),
        minimap("minimapTab", "Minimap: Tab", zoomFields("TAB"), "tab"),
        ...[
            ["midBossTimer", "Mid Boss Timer", "Rejuv", "MINIMAP_MID_BOSS_", "ENABLE_MINIMAP_REJUV_TIMER"],
            ["buffTimer", "Buff Timer", "Buff", "MINIMAP_BUFF_", "ENABLE_MINIMAP_BUFF_TIMER"],
            ["bridgeBuffLeft", "Left Bridge Buff Timer", "BuffBridgeLeft", "MINIMAP_BRIDGE_LEFT_", "ENABLE_MINIMAP_BUFF_TIMER"],
            ["bridgeBuffRight", "Right Bridge Buff Timer", "BuffBridgeRight", "MINIMAP_BRIDGE_RIGHT_", "ENABLE_MINIMAP_BUFF_TIMER"]
        ].map(([id, name, suffix, prefix, enable]) => ({ id, name, group: "Minimap",
            path: [...mapPath, "QOLMinimapTimersRoot", ...(["midBossTimer", "buffTimer"].includes(id) ? ["QOLMinimapDockedTimers"] : []), "QOLMinimap" + suffix + "Timer"],
            resolve(hud) {
                const root = C.findPath(hud, [...mapPath, "QOLMinimapTimersRoot"]);
                const owner = id === "midBossTimer" || id === "buffTimer" ? QOL.core.panel.findChild(root, "QOLMinimapDockedTimers") : root;
                return QOL.core.panel.findChild(owner, "QOLMinimap" + suffix + "Timer");
            },
            available: (_hud, config) => id === "midBossTimer" ||
                (id === "buffTimer" ? Number(config.ENABLE_MINIMAP_BUFF_TIMER_ON_BRIDGE) !== 1 : Number(config.ENABLE_MINIMAP_BUFF_TIMER_ON_BRIDGE) === 1),
            fields: [toggle(enable),
                t(id === "midBossTimer" ? "ENABLE_MINIMAP_ALWAYS_ON_MID_BOSS" : "ENABLE_MINIMAP_BUFF_TIMER_ON_BRIDGE", id === "midBossTimer" ? "On Mid Boss" : "On Bridge"),
                ...geometry(prefix, true), opacity(prefix)]
        })),
        { id: "mapLoot", name: "Map References", group: "Minimap",
            path: [...mapPath, "HudMinimapContainer", "hud_minimap", "QOLMinimapLootRoot"],
            resolve(hud) {
                const renderer = C.findPath(hud, [...mapPath, "HudMinimapContainer", "hud_minimap"]);
                return QOL.core.panel.findChild(renderer, "QOLMinimapLootRoot") || QOL.core.panel.findChild(renderer, "minimap_overlay_root");
            }, fields: [
                f("MINIMAP_LOOT_MARKER_SCALE", "Marker Size"), opacity("MINIMAP_LOOT_"), f("MINIMAP_ROUTE_SCALE", "Route Size"),
                ...[["ENABLE_MINIMAP_CRATE_OVERLAY", "Show Crates"], ["ENABLE_MINIMAP_TOUGH_CRATES", "Tough Crates"],
                    ["ENABLE_MINIMAP_HEALING_SNACKS", "Healing Snacks"], ["ENABLE_MINIMAP_STATUES", "Statues"],
                    ["ENABLE_MINIMAP_CRATE_ROUTES", "Crate Routes"], ["ENABLE_MINIMAP_REM_TUNNELS", "Rem Tunnels"]].map(([key, label]) => t(key, label)),
                f("MINIMAP_REM_TUNNELS_OPACITY", "Tunnel Opacity", null, { when: session => Number(session.value("ENABLE_MINIMAP_REM_TUNNELS")) === 1 }),
                f("MINIMAP_CAMP_NAMES", "Camp Names", null, { hidden: true })
            ] },
        { id: "shop", name: "Shop", group: "Shop", path: [...core, "CitadelHudHeroShop", "Shop", "MainPanel"], fields: [
            toggle("HUD_SHOP_ENABLED"), f("SHOP_OFFSET_X", "Horizontal Offset", null, { axis: "x" }),
            f("SHOP_OFFSET_Y", "Vertical Offset", null, { axis: "y", direction: -1 }), f("SHOP_SCALE", "Scale", null, { resize: true }), opacity("SHOP_"),
            t("ENABLE_HERO_SCENE_PANEL", "Hero"), t("ENABLE_SIMPLIFY_SHOP", "Simplify Shop"), t("ENABLE_SIMPLIFY_ITEMS", "Simplify Items"),
            t("DISABLE_SHOP_BLUE", "Blur", { inverted: true }), t("ENABLE_SHOP_STATS", "Shop Stats"),
            t("ENABLE_SIMPLIFY_SHOP_STATS", "Simplify Shop Stats", { when: session => Number(session.value("ENABLE_SHOP_STATS")) === 1 })
        ] },
        { id: "quickbuy", name: "Quick Buy", group: "Shop", path: [...lower, "CitadelHudQuickbuy"], fields: [
            t("DISABLE_QUICK_BUY", "Quick Buy", { inverted: true }),
            t("ENABLE_ENHANCED_QUICKBUY", "Enhanced", { when: session => Number(session.value("DISABLE_QUICK_BUY")) !== 1 }),
            content("ENHANCED_QUICKBUY_COUNT", "Enhanced Count", null, { when: session => Number(session.value("DISABLE_QUICK_BUY")) !== 1 && Number(session.value("ENABLE_ENHANCED_QUICKBUY")) === 1 }),
            t("ENABLE_QUICKBUY_CLICK_TO_NOTIFY", "Click to Notify")
        ] },
        { id: "recentPurchases", name: "Recent Purchases", group: "Shop", path: [...core, "CitadelHudHeroShop", "Shop", "NavPanel", "RecentPurchasesPanel"], fields: [
            toggle("ENABLE_SHOP_RECENT_PURCHASES"), ...geometry("RECENT_PURCHASES_PANEL_", true), opacity("RECENT_PURCHASES_PANEL_")
        ] },
        { id: "purchaseNotifications", name: "Item Notifications", group: "Shop", path: [...core, "TopBar", "QuickPurchasesPanel"], fields: [
            toggle("ENABLE_SHOP_ITEM_NOTIFICATIONS"), t("ENABLE_HERO_PURCHASE_POPUPS", "Per-Hero Popups"),
            ...geometry("RECENT_PURCHASES_QUICK_", true), opacity("RECENT_PURCHASES_QUICK_"),
            content("RECENT_PURCHASES_QUICK_MAX", "Max Notifications", null), content("RECENT_PURCHASES_QUICK_DISPLAY_SEC", "Duration", null),
            t("RECENT_PURCHASES_QUICK_REJUV", "Rejuvenator"), t("RECENT_PURCHASES_QUICK_SCOREBOARD", "Scoreboard")
        ], resolve(hud, config) {
            const top = C.findPath(hud, [...core, "TopBar"]);
            if (!QOL.core.panel.isAlive(top)) return null;
            const sample = top.FindChildrenWithClassTraverse("QOLCustomizePurchaseSample").find(QOL.core.panel.isAlive);
            if (sample) return sample.GetParent();
            if (Number(config.ENABLE_HERO_PURCHASE_POPUPS) !== 1) return QOL.core.panel.findChild(top, "QuickPurchasesPanel");
            return top.FindChildrenWithClassTraverse("QuickPurchasesPanel").find(panel =>
                QOL.core.panel.isAlive(panel) && panel.Children().some(QOL.core.panel.isAlive)) || null;
        } }
    ]);
})();

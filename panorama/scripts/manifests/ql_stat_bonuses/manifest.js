// OWNS: Golden-statue/boon stat readout, source caches and owned overlay labels.
// DOES NOT OWN: Native stat calculations, shop widgets or tooltip content.
// Explicit native Golden Statues/Boons rows take precedence over derived values.
// Overlay parent: native hud.xml HudCore > gameplay_hud.
(() => {
    "use strict";
    const P = QOL.core.panel;
    const BREAKDOWN_ID = "StatsBreakdownContainer";
    const GOLDEN_KEYS = ["#citadel_shopstats_goldenstatues", "golden statues", "#citadel_shopstats_boons", "boons"];
    const STAT_DEFS = [
        { key: "fireRate", ids: ["StatContainer_FireRate"], labelId: "QOLStatBonusesFireRate", prefix: "Fire Rate: " },
        { key: "abilityCooldown", ids: ["StatContainer_TechCooldown", "StatContainer_AbilityCooldown",
            "StatContainer_AbilityCooldownReduction", "StatContainer_CooldownReduction", "StatContainer_Cooldown",
            "StatContainer_CooldownDecrease", "StatContainer_AbilityCD"], labelId: "QOLStatBonusesAbilityCooldown", prefix: "Ability Cooldown %: " },
        { key: "spiritPower", ids: ["StatContainer_TechPower", "StatContainer_SpiritPower", "StatContainer_Spirit"],
            labelId: "QOLStatBonusesSpiritPower", prefix: "Spirit Power: " },
        { key: "clipSize", ids: ["StatContainer_ClipSizeIncrease", "StatContainer_ClipSize", "StatContainer_ClipSizeBonus", "StatContainer_AmmoCapacity"],
            labelId: "QOLStatBonusesClipSize", prefix: "Clip Size % Increase: " },
        { key: "weaponDamage", ids: ["StatContainer_BaseWeaponDamage", "StatContainer_BonusBaseWeaponDamage", "StatContainer_BaseAttackDamagePercent", "StatContainer_BulletDamage"],
            labelId: "QOLStatBonusesWeaponDamage", prefix: "Weapon Damage %: " },
        { key: "maxHealth", ids: ["StatContainer_MaxHealth", "StatContainer_BaseHealth", "StatContainer_ArmorPower"],
            labelId: "QOLStatBonusesMaxHealth", prefix: "Max Health: " }
    ];
    const token = text => {
        const match = typeof text === "string" ? text.match(/([+\-]?\d+(?:\.\d+)?%?)/) : null;
        return match ? match[1] : "";
    };
    const text = panel => P.isAlive(panel) && typeof panel.text === "string" ? panel.text : "";
    const textById = (panel, id) => text(P.findTraverse(panel, id));
    const textByClass = (panel, cls) => text(QOL.utils.FindFirstPanelByClass(panel, cls));
    const normalizeKey = value => String(value || "").toLowerCase().replace(/[^a-z0-9#]+/g, "");
    const goldenRow = row => GOLDEN_KEYS.some(key => normalizeKey(textByClass(row, "StatName")).includes(normalizeKey(key)));

    function tokenFromTree(panel, maxNodes = 25) {
        const queue = [panel];
        let visited = 0;
        while (queue.length && visited++ < Math.max(8, Math.min(30, maxNodes))) {
            const current = queue.shift();
            if (!P.isAlive(current)) continue;
            const found = token(text(current));
            if (found) return found;
            for (const child of current.Children()) queue.push(child);
        }
        return "";
    }

    function displayToken(panel) {
        for (const id of ["AttributeLabel", "ScalingStatLabel", "Value", "StatValue"]) {
            const value = token(textById(panel, id));
            if (value) return value;
        }
        for (const cls of ["ModifiedValue", "AttributeValue", "StatValue", "Value", "Label"]) {
            const value = token(textByClass(panel, cls));
            if (value) return value;
        }
        return tokenFromTree(panel);
    }

    function parsedToken(value) {
        const match = String(value || "").trim().match(/^([+\-]?)(\d+(?:\.\d+)?)(%?)$/);
        if (!match) return null;
        return { value: Number(match[2]) * (match[1] === "-" ? -1 : 1), suffix: match[3] };
    }

    function derivedValue(panel) {
        const modified = parsedToken(token(textById(panel, "ModifiedLabel")) || displayToken(panel));
        const base = parsedToken(token(textById(panel, "BaseLabel")));
        if (!modified || !base) return "";
        const mods = parsedToken(token(textById(panel, "ValueFromModsLabel")));
        const scaling = parsedToken(token(textById(panel, "StatScalingLabel")));
        let value = modified.value - base.value - (mods ? mods.value : 0) - (scaling ? scaling.value : 0);
        if (!Number.isFinite(value)) return "";
        if (Math.abs(value) < 0.0001) value = 0;
        const decimals = Math.abs(value) >= 100 ? 0 : Math.abs(value) >= 10 ? 1 : 2;
        let formatted = value.toFixed(decimals);
        // Trim decimal padding only; integer zeros are part of the value.
        if (formatted.includes(".")) formatted = formatted.replace(/\.?0+$/, "");
        if (formatted === "-0") formatted = "0";
        return formatted + (modified.suffix || base.suffix);
    }

    function breakdownValue(container) {
        if (!P.isAlive(container)) return "";
        for (const row of container.Children()) {
            if (!goldenRow(row)) continue;
            const value = token(textByClass(row, "StatValue")) || tokenFromTree(row);
            if (value) return value;
        }
        return "";
    }

    function likelyBreakdown(panel) {
        if (!P.isAlive(panel)) return false;
        let rows = 0;
        for (const row of panel.Children()) {
            if (textByClass(row, "StatName") && (textByClass(row, "StatValue") || tokenFromTree(row, 20))) rows++;
            if (rows >= 2) return true;
        }
        return false;
    }

    function statKeyForPanel(panel) {
        let current = panel;
        for (let depth = 0; depth < 64 && P.isAlive(current); depth++, current = current.GetParent()) {
            const def = STAT_DEFS.find(item => item.ids.includes(current.id));
            if (def) return def.key;
        }
        return "";
    }

    function underOwner(panel, owner) {
        let current = panel;
        for (let depth = 0; depth < 64 && P.isAlive(current); depth++, current = current.GetParent()) {
            if (current === owner) return true;
        }
        return false;
    }

    QOL.core.FeatureRegistry.register({
        id: "ql_stat_bonuses",
        enableKey: "ENABLE_STAT_BONUSES",
        enabledByDefault: false,
        settings: [
            { key: "ENABLE_STAT_BONUSES", type: "toggle" },
            { key: "STAT_BONUSES_SCALE", type: "slider" },
            { key: "STAT_BONUSES_X_OFFSET", type: "slider" },
            { key: "STAT_BONUSES_Y_OFFSET", type: "slider" }
        ],
        create(ctx) {
            const tree = P.createOwnedTree();
            const parentResolver = QOL.panelCache.createIdResolver("gameplay_hud", {
                retryMs: 500, ownerPath: [{ id: "Hud", optional: true }, { className: "HudCore" }]
            });
            const statsResolvers = [
                QOL.panelCache.createIdResolver("HeroStatsDisplay", { retryMs: 3000 }),
                QOL.panelCache.createIdResolver("HeroStatsWeapon", { retryMs: 3000 }),
                QOL.panelCache.createIdResolver("CitadelHudHeroShop", {
                    retryMs: 1500, ownerPath: [{ id: "Hud", optional: true }, { className: "HudCore" }]
                })
            ];
            let running = false, loop = null, rootOwner = null, model = null, overlay = null, signature = null, statsOwner = null;
            let nextTooltipScanMs = 0, lastShopOpen = null;
            const labels = new Map(), sources = new Map(), goldenValues = new Map();

            function readModel() {
                const cfg = ctx.config.view();
                return { enabled: Number(cfg.ENABLE_STAT_BONUSES) === 1, styles: {
                    x: (Math.round(Number(cfg.STAT_BONUSES_X_OFFSET)) || 0) + "px",
                    y: -(Math.round(Number(cfg.STAT_BONUSES_Y_OFFSET)) || 0) + "px",
                    uiScale: Math.round(Number(cfg.STAT_BONUSES_SCALE) || 100) + "%"
                } };
            }

            function release(resetSources = true) {
                tree.clear();
                overlay = null; signature = null; labels.clear();
                if (resetSources) {
                    rootOwner = null; statsOwner = null; nextTooltipScanMs = 0; lastShopOpen = null;
                    sources.clear(); goldenValues.clear();
                    parentResolver.reset();
                    for (const resolver of statsResolvers) resolver.reset();
                }
            }

            function ensureOverlay(root) {
                tree.sweep();
                const parent = parentResolver.resolve(root);
                if (!P.isAlive(parent)) { release(false); return false; }
                if (!P.isAlive(overlay) || overlay.GetParent() !== parent) {
                    release(false);
                }
                overlay = tree.child(parent, "Panel", "QOLStatBonusesOverlay");
                if (!P.isAlive(overlay)) return false;
                const title = tree.child(overlay, "Label", "QOLStatBonusesTitle");
                if (!P.isAlive(title)) return false;
                if (title && title.text !== "Stat Bonuses (Golden Statues)") title.text = "Stat Bonuses (Golden Statues)";
                for (const def of STAT_DEFS) {
                    const label = tree.child(overlay, "Label", def.labelId);
                    if (!P.isAlive(label)) return false;
                    P.setClass(label, "QOLStatBonusesLine", true);
                    labels.set(def.key, label);
                }
                return true;
            }

            function resolveStatsOwner(root) {
                let current = null;
                for (const resolver of statsResolvers) {
                    current = resolver.resolve(root);
                    if (current) break;
                }
                if (current !== statsOwner) {
                    statsOwner = current;
                    sources.clear(); goldenValues.clear(); nextTooltipScanMs = 0;
                }
            }

            function resolveSource(def, now) {
                const record = sources.get(def.key) || { panel: null, nextSearchMs: 0, delay: 0 };
                if (P.isAlive(record.panel) && underOwner(record.panel, statsOwner) && now < record.nextSearchMs) return record.panel;
                const previous = record.panel;
                record.panel = null;
                if (!statsOwner || (!previous && now < record.nextSearchMs)) return null;
                for (const id of def.ids) {
                    record.panel = P.findTraverse(statsOwner, id);
                    if (record.panel) break;
                }
                record.delay = record.panel ? 0 : Math.min(record.delay ? record.delay * 2 : 500, 3000);
                record.nextSearchMs = now + (record.panel ? 1500 : record.delay);
                if (previous && record.panel !== previous) goldenValues.delete(def.key);
                sources.set(def.key, record);
                return record.panel;
            }

            function harvestTooltip(root, now) {
                if (now < nextTooltipScanMs) return;
                const breakdown = P.findTraverse(root, BREAKDOWN_ID);
                const valid = likelyBreakdown(breakdown);
                nextTooltipScanMs = now + (valid ? 250 : 3000);
                if (!valid) return;
                const value = breakdownValue(breakdown);
                const key = statKeyForPanel(breakdown);
                if (value && key) goldenValues.set(key, value);
            }

            function update() {
                if (!running) return;
                const root = P.findHud($.GetContextPanel());
                if (!P.isAlive(root) || (root.id !== "Hud" && root.paneltype !== "CitadelHud") || !model.enabled) { release(); return; }
                if (rootOwner !== root) { release(); rootOwner = root; }
                if (QOL.core.hud.isInHideout(root)) {
                    P.setClass(overlay, "qol-hidden", true);
                    QOL.utils.SetStyleIfChanged(overlay, "visibility", "collapse");
                    return;
                }
                if (!ensureOverlay(root)) return;
                P.setClass(overlay, "qol-hidden", false);
                QOL.utils.SetStyleIfChanged(overlay, "visibility", "visible");
                signature = P.syncStyles(overlay, model.styles, signature).sig;
                const now = QOL.utils.PerfNowMs();
                const shopOpen = root.BHasClass("gShopOpen");
                if (shopOpen !== lastShopOpen) {
                    lastShopOpen = shopOpen;
                    sources.clear();
                    for (const resolver of statsResolvers) resolver.reset();
                }
                resolveStatsOwner(root);
                harvestTooltip(root, now);
                for (const def of STAT_DEFS) {
                    const source = resolveSource(def, now);
                    const explicit = breakdownValue(P.findTraverse(source, BREAKDOWN_ID));
                    if (explicit) goldenValues.set(def.key, explicit);
                    const value = explicit || goldenValues.get(def.key) || derivedValue(source) || "--";
                    const parsed = parsedToken(value);
                    const zero = (parsed && parsed.value === 0) || (P.isAlive(source) && source.BHasClass("isZeroValue"));
                    const label = labels.get(def.key);
                    P.setClass(label, "is_zero", !!zero);
                    const rendered = def.prefix + value;
                    if (label.text !== rendered) label.text = rendered;
                }
            }

            function refreshSettings() {
                model = readModel();
                update();
            }

            return {
                onEnable() {
                    running = true;
                    refreshSettings();
                    loop = QOL.core.Scheduler.createPollLoop(update, 0.2, ctx.id);
                },
                onSettingsChanged: refreshSettings,
                onDisable() {
                    running = false;
                    if (loop) { loop.stop(); loop = null; }
                    release();
                    model = null;
                    tree.dispose();
                }
            };
        },
        test() {
            try {
                const gp = P.findTraverse($.GetContextPanel(), "gameplay_hud");
                return { passed: !!gp, name: "Stat bonuses anchor panel exists", message: gp ? "" : "gameplay_hud not found",
                    assertions: [{ passed: !!gp, name: "gameplay_hud panel exists" }] };
            } catch (e) {
                return { passed: false, name: "Stat bonuses panel check", message: e.message || String(e) };
            }
        }
    });
})();

// OWNS: Estimated unsecured-souls countdown, private samples and overlay labels.
// DOES NOT OWN: Native soul conversion, native amount labels or Better Unsecured state.
// Sources and danger classes follow verified current/legacy native HUD contracts.
// This timer intentionally stays active in hideout and hero testing.
(() => {
    "use strict";
    const P = QOL.core.panel;
    const MIN_SAMPLE_MS = 250, STALE_RATE_MS = 12000, EMA_ALPHA = 0.35, SEARCH_MS = 1000;

    function parseSouls(text) {
        const value = Number(String(text || "").replace(/[^0-9.-]/g, ""));
        return Number.isFinite(value) && value >= 0 ? Math.round(value) : 0;
    }

    function fallbackEta(souls, gameMinutes) {
        const remaining = Math.max(0, Number(souls) || 0);
        const rate = remaining * 0.02 + 15 * (1 + Math.max(0, Number(gameMinutes) || 0) * 0.05);
        return remaining > 0 && rate > 0 ? remaining / rate : 0;
    }

    function findFallbackSource(root, gold) {
        const underGold = QOL.utils.FindFirstPanelByClass(gold, "death_penalty_gold");
        if (underGold) return underGold;
        for (const candidate of QOL.utils.FindPanelsByClass(root, "death_penalty_gold") || []) {
            if (QOL.utils.FindAncestorWithClass(candidate, "hudDeathGoldContainer")) return candidate;
        }
        return null;
    }

    function dangerLevel(source, souls) {
        let current = source;
        for (let depth = 0; depth < 64 && P.isAlive(current); depth++, current = current.GetParent()) {
            for (let level = 4; level > 0; level--) {
                if (current.BHasClass("death_penalty_gold_danger_level_" + level)) return level;
            }
        }
        return souls >= 1000 ? 3 : souls >= 400 ? 2 : souls > 0 ? 1 : 0;
    }

    QOL.core.FeatureRegistry.register({
        id: "ql_unsecured_souls_timer",
        enableKey: "ENABLE_UNSECURED_SOUL_TIMER",
        enabledByDefault: false,
        settings: [
            { key: "ENABLE_UNSECURED_SOUL_TIMER", type: "toggle", default: false },
            { key: "UNSECURED_SOUL_TIMER_X_OFFSET", type: "slider", min: -1500, max: 1500, default: 0 },
            { key: "UNSECURED_SOUL_TIMER_Y_OFFSET", type: "slider", min: -100, max: 1000, default: 0 },
            { key: "UNSECURED_SOUL_TIMER_SCALE", type: "slider", min: 50, max: 200, default: 100 }
        ],
        create(ctx) {
            const modernResolver = QOL.panelCache.createIdResolver("HudUnsecuredLabel", { retryMs: SEARCH_MS });
            const goldResolver = QOL.panelCache.createIdResolver("gold_and_ap_container", { retryMs: SEARCH_MS });
            const amountResolver = QOL.panelCache.createIdResolver("hudDeathGoldLabel", { retryMs: SEARCH_MS });
            const rootAmountResolver = QOL.panelCache.createIdResolver("hudDeathGoldLabel", { retryMs: SEARCH_MS });
            let loop = null, rootOwner = null, model = null, overlay = null, stateLabel = null, signature = null;
            let source = null, fallbackSource = null, nextSourceSearchMs = 0;
            let lastSouls = -1, lastSampleMs = 0, rateEma = 0, rateUpdateMs = 0, etaEndMs = 0;

            function readModel() {
                const cfg = ctx.config.view();
                const scale = QOL.utils.ClampConfigNumber(cfg.UNSECURED_SOUL_TIMER_SCALE, QOL_DEFAULT_CONFIG.UNSECURED_SOUL_TIMER_SCALE, 50, 200, true);
                const x = QOL.utils.ClampConfigNumber(cfg.UNSECURED_SOUL_TIMER_X_OFFSET, QOL_DEFAULT_CONFIG.UNSECURED_SOUL_TIMER_X_OFFSET, -1500, 1500, true);
                const y = QOL.utils.ClampConfigNumber(cfg.UNSECURED_SOUL_TIMER_Y_OFFSET, QOL_DEFAULT_CONFIG.UNSECURED_SOUL_TIMER_Y_OFFSET, -100, 1000, true);
                return { enabled: Number(cfg.ENABLE_UNSECURED_SOUL_TIMER) === 1,
                    styles: { marginLeft: (-520 + x) + "px", marginBottom: (110 + y) + "px" },
                    fontSize: Math.max(8, Math.min(72, Math.round(16 * scale / 100))) + "px" };
            }

            function resetSamples() {
                lastSouls = -1; lastSampleMs = 0; rateEma = 0; rateUpdateMs = 0; etaEndMs = 0;
            }

            function release(resetSource = true) {
                P.delete(overlay);
                overlay = null; stateLabel = null; signature = null;
                if (resetSource) {
                    source = null; fallbackSource = null; nextSourceSearchMs = 0; rootOwner = null;
                    modernResolver.reset(); goldResolver.reset(); amountResolver.reset(); rootAmountResolver.reset();
                    resetSamples();
                }
            }

            function resolveSource(root, now) {
                const modern = modernResolver.resolve(root);
                if (modern) return modern;
                const gold = goldResolver.resolve(root);
                const amount = amountResolver.resolve(gold || root) || rootAmountResolver.resolve(root);
                if (amount) return amount;
                if (now >= nextSourceSearchMs) {
                    fallbackSource = findFallbackSource(root, gold);
                    nextSourceSearchMs = now + SEARCH_MS;
                }
                return P.isAlive(fallbackSource) ? fallbackSource : null;
            }

            function ensureOverlay(root) {
                const parent = QOL.core.hud.getGameplayHudPanel(root);
                if (!P.isAlive(parent)) return false;
                if (!P.isAlive(overlay) || overlay.GetParent() !== parent) {
                    release(false);
                    overlay = P.findChild(parent, "QOLUnsecuredSoulsOverlay") ||
                        P.create("Panel", parent, "QOLUnsecuredSoulsOverlay", { hittest: "false", hittestchildren: "false" });
                }
                if (!P.isAlive(overlay)) return false;
                if (!P.findChild(overlay, "QOLUnsecuredSoulsIcon")) P.create("Panel", overlay, "QOLUnsecuredSoulsIcon");
                const text = P.findChild(overlay, "QOLUnsecuredSoulsTextContainer") ||
                    P.create("Panel", overlay, "QOLUnsecuredSoulsTextContainer");
                const title = P.findChild(text, "QOLUnsecuredSoulsLabel") || P.create("Label", text, "QOLUnsecuredSoulsLabel");
                if (P.isAlive(title) && title.text !== "Unsecured Souls") title.text = "Unsecured Souls";
                stateLabel = P.findChild(text, "QOLUnsecuredSoulsState") || P.create("Label", text, "QOLUnsecuredSoulsState");
                return P.isAlive(stateLabel);
            }

            function sample(souls, now) {
                if (lastSouls < 0 || souls > lastSouls) {
                    if (souls > lastSouls) { rateEma = 0; rateUpdateMs = 0; }
                    lastSouls = souls; lastSampleMs = now;
                    return;
                }
                const elapsed = now - lastSampleMs;
                if (elapsed < MIN_SAMPLE_MS) return;
                const delta = lastSouls - souls;
                if (delta > 0) {
                    const rate = delta / (elapsed / 1000);
                    if (Number.isFinite(rate) && rate > 0.01) {
                        rateEma = rateEma > 0 ? rateEma + (rate - rateEma) * EMA_ALPHA : rate;
                        rateUpdateMs = now;
                    }
                }
                lastSouls = souls; lastSampleMs = now;
            }

            function estimate(souls, unresolved, root, now) {
                let eta = 0;
                if (!unresolved && souls > 0) {
                    const fallback = fallbackEta(souls, QOL.core.time.readGameTime(root) / 60);
                    if (rateUpdateMs > 0 && now - rateUpdateMs <= STALE_RATE_MS && rateEma > 0.01) eta = souls / rateEma;
                    if (!Number.isFinite(eta) || eta <= 0 || (fallback > 0 && eta > fallback * 2)) eta = fallback;
                    eta = Math.min(999, eta);
                    if (eta > 0) etaEndMs = now + Math.round(eta * 1000);
                } else if (souls <= 0) { etaEndMs = 0; rateEma = 0; rateUpdateMs = 0; }
                const remaining = etaEndMs > now ? (etaEndMs - now) / 1000 : eta;
                return unresolved ? "--" : souls <= 0 ? "" : Math.max(1, Math.ceil(remaining)) + "s";
            }

            function update() {
                const root = $.GetContextPanel();
                if (!P.isAlive(root) || !model || !model.enabled || !QOL.core.hud.isCustomHudContextActive(root)) { release(); return; }
                if (rootOwner !== root) { release(); rootOwner = root; }
                if (!ensureOverlay(root)) return;
                P.setClass(overlay, "qol-hidden", false);
                signature = P.syncStyles(overlay, model.styles, signature).sig;
                QOL.utils.SetStyleIfChanged(stateLabel, "fontSize", model.fontSize);
                const now = QOL.utils.PerfNowMs();
                const current = resolveSource(root, now);
                if (current !== source) { resetSamples(); source = current; }
                const rawText = source && typeof source.text === "string" ? source.text : "";
                const unresolved = !rawText || rawText.charAt(0) === "{";
                const souls = unresolved ? 0 : parseSouls(rawText);
                if (!unresolved) sample(souls, now);
                const status = estimate(souls, unresolved, root, now);
                const danger = dangerLevel(source, souls);
                for (let level = 1; level <= 4; level++) P.setClass(overlay, "danger_" + level, danger === level);
                P.setClass(overlay, "has_souls", souls > 0);
                P.setClass(overlay, "is_safe", souls <= 0 && !unresolved);
                P.setClass(overlay, "is_syncing", unresolved);
                if (stateLabel.text !== status) stateLabel.text = status;
            }

            function refreshSettings() {
                model = readModel();
                update();
            }

            return {
                onEnable() {
                    model = readModel();
                    loop = QOL.core.Scheduler.createPollLoop(update, 0.2, ctx.id);
                },
                onSettingsChanged: refreshSettings,
                onDisable() {
                    if (loop) { loop.stop(); loop = null; }
                    release();
                    model = null;
                }
            };
        },
        test() {
            try {
                const gp = P.findTraverse($.GetContextPanel(), "gameplay_hud");
                if (!gp) return null;
                return { passed: true, name: "Unsecured souls anchor panel exists", message: "",
                    assertions: [{ passed: true, name: "gameplay_hud panel exists" }] };
            } catch (e) {
                return { passed: false, name: "Unsecured souls panel check", message: e.message || String(e) };
            }
        }
    });
})();

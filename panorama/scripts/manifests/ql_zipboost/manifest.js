// OWNS: Zip Boost overlay, cooldown/ready/active state and ready flash.
// DOES NOT OWN: Native hints, status effects or the zipline ability itself.
// A visible ready hint is readiness evidence, never active-boost evidence.
// Overlay parent: native hud.xml HudCore > gameplay_hud.
(() => {
    "use strict";
    const SEARCH_MS = 1500;
    const READY_FLASH_MS = 2000;
    QOL.core.FeatureRegistry.register({
        id: "ql_zipboost",
        enableKey: "ENABLE_ZIP_BOOST",
        enabledByDefault: false,
        settings: [
            { key: "ENABLE_ZIP_BOOST", type: "toggle" },
            { key: "ZIP_BOOST_SCALE", type: "slider" },
            { key: "ZIP_BOOST_X_OFFSET", type: "slider" },
            { key: "ZIP_BOOST_Y_OFFSET", type: "slider" }
        ],
        create(ctx) {
            const P = QOL.core.panel;
            const H = QOL.core.hud;
            const gameplayResolver = QOL.panelCache.createIdResolver("gameplay_hud", {
                retryMs: SEARCH_MS, ownerPath: [{ id: "Hud", optional: true }, { className: "HudCore" }]
            });
            const tree = P.createOwnedTree();
            const hintResolvers = ["citadel_ability_zipline_boost_", "citadel_ability_zipline_boost"].map(id =>
                QOL.panelCache.createIdResolver(id, { retryMs: SEARCH_MS }));
            const effectsResolver = QOL.panelCache.createIdResolver("StatusEffects", { retryMs: SEARCH_MS });
            const rootEffectsResolver = QOL.panelCache.createIdResolver("StatusEffects", { retryMs: SEARCH_MS });
            let running = false, rootOwner = null, loop = null, model = null, overlay = null, titleLabel = null, stateLabel = null, signature = null;
            let source = null, sourceScope = null, fallbackSource = null, statusEffects = null, nextSourceSearchMs = 0;
            let activeEndMs = 0, cooldownEndMs = 0, wasInUse = false, lastState = null, readyFlashUntilMs = 0;

            function readModel() {
                const cfg = ctx.config.view();
                return { enabled: Number(cfg.ENABLE_ZIP_BOOST) === 1, styles: {
                    x: (Math.round(Number(cfg.ZIP_BOOST_X_OFFSET)) || 0) + "px",
                    y: -(Math.round(Number(cfg.ZIP_BOOST_Y_OFFSET)) || 0) + "px",
                    uiScale: Math.round(Number(cfg.ZIP_BOOST_SCALE) || 100) + "%"
                } };
            }

            function findSource(scope, now) {
                if (scope !== sourceScope) { sourceScope = scope; fallbackSource = null; nextSourceSearchMs = 0; }
                for (const resolver of hintResolvers) {
                    const current = resolver.resolve(scope);
                    if (current) return current;
                }
                if (now >= nextSourceSearchMs) {
                    fallbackSource = QOL.utils.FindFirstPanelByClass(scope, "citadel_ability_zipline_boost");
                    nextSourceSearchMs = now + SEARCH_MS;
                }
                return P.isAlive(fallbackSource) ? fallbackSource : null;
            }

            function findNumericText(panel) {
                const queue = [panel];
                let best = "", visited = 0;
                while (queue.length && visited++ < 15) {
                    const current = queue.shift();
                    if (!P.isAlive(current)) continue;
                    const text = typeof current.text === "string" ? current.text.trim() : "";
                    const match = text.match(/(\d+(?:\.\d+)?)/);
                    if (match && (!best || match[1].length <= best.length)) {
                        best = match[1];
                        if (text.length <= 2) return best;
                    }
                    for (const child of current.Children()) queue.push(child);
                }
                return best;
            }

            function cooldownSeconds(panel) {
                if (!P.isAlive(panel)) return null;
                for (const candidate of [P.findTraverse(panel, "context_label"), panel]) {
                    if (!P.isAlive(candidate) || typeof candidate.text !== "string") continue;
                    const match = candidate.text.match(/Countdown[^>]*>\s*(\d+(?:\.\d+)?)/i) ||
                        candidate.text.match(/\b(\d+(?:\.\d+)?)\s*s\b/i) || candidate.text.match(/\b(\d{1,4})\b/);
                    const value = match ? Number(match[1]) : NaN;
                    if (value > 0 && value <= 600) return value;
                }
                const value = Number(findNumericText(panel));
                return value > 0 && value <= 600 ? value : null;
            }

            function release(resetTracking = true) {
                tree.clear();
                overlay = null; titleLabel = null; stateLabel = null; signature = null;
                if (resetTracking) {
                    rootOwner = null; source = null; sourceScope = null; fallbackSource = null; statusEffects = null; nextSourceSearchMs = 0;
                    gameplayResolver.reset(); effectsResolver.reset(); rootEffectsResolver.reset();
                    for (const resolver of hintResolvers) resolver.reset();
                    activeEndMs = 0; cooldownEndMs = 0; wasInUse = false; lastState = null; readyFlashUntilMs = 0;
                }
            }

            function ensureOverlay(root) {
                tree.sweep();
                const parent = gameplayResolver.resolve(root);
                if (!P.isAlive(parent)) { release(false); return false; }
                if (!P.isAlive(overlay) || overlay.GetParent() !== parent) {
                    release(false);
                }
                overlay = tree.child(parent, "Panel", "QOLZipBoostOverlay");
                if (!P.isAlive(overlay)) return false;
                const icon = tree.child(overlay, "Panel", "QOLZipBoostIcon");
                const text = tree.child(overlay, "Panel", "QOLZipBoostTextContainer");
                titleLabel = tree.child(text, "Label", "QOLZipBoostLabel");
                stateLabel = tree.child(text, "Label", "QOLZipBoostState");
                return P.isAlive(icon) && P.isAlive(titleLabel) && P.isAlive(stateLabel);
            }

            function update() {
                if (!running) return;
                const root = P.findHud($.GetContextPanel());
                if (!P.isAlive(root) || (root.id !== "Hud" && root.paneltype !== "CitadelHud") || !model.enabled) { release(); return; }
                if (rootOwner !== root) { release(); rootOwner = root; }
                if (!ensureOverlay(root)) return;
                const inHideout = H.isInHideout(root);
                P.setClass(overlay, "qol-hidden", inHideout);
                if (inHideout) {
                    for (const cls of ["on_cooldown", "in_use", "ready_flash"]) P.setClass(overlay, cls, false);
                    lastState = null; readyFlashUntilMs = 0;
                    return;
                }
                signature = P.syncStyles(overlay, model.styles, signature).sig;
                const now = QOL.utils.PerfNowMs();
                const gameplay = gameplayResolver.resolve(root) || root;
                source = findSource(gameplay, now);
                statusEffects = effectsResolver.resolve(gameplay) || rootEffectsResolver.resolve(root);
                const buff = P.findTraverse(statusEffects, "status_citadel_ability_zipline_boost");
                const buttonReady = P.isAlive(source) && source.BHasClass("active");
                const buttonInUse = P.isAlive(source) && source.BHasClass("in_use");
                const buttonCooldown = P.isAlive(source) && (source.BHasClass("on_cooldown") || source.BHasClass("cooling_down"));
                const inUse = P.isAlive(buff) || buttonInUse;
                let onCooldown = false, status = "READY";
                if (buttonReady && !buttonCooldown && !inUse) cooldownEndMs = 0;
                if (inUse) {
                    if (!wasInUse) { activeEndMs = now + 32000; cooldownEndMs = now + 360000; }
                    status = "ACTIVE " + Math.max(0, Math.ceil((activeEndMs - now) / 1000)) + "s";
                }
                if (buttonCooldown) {
                    const seconds = cooldownSeconds(source);
                    if (seconds !== null) cooldownEndMs = now + seconds * 1000;
                    else if (!cooldownEndMs || cooldownEndMs <= now) cooldownEndMs = now + 360000;
                }
                if (!inUse) {
                    if (cooldownEndMs > now) {
                        onCooldown = true;
                        status = "COOLDOWN " + Math.ceil((cooldownEndMs - now) / 1000) + "s";
                    } else if (buttonCooldown) { onCooldown = true; status = "COOLDOWN"; }
                }
                wasInUse = inUse;
                const state = inUse ? "in_use" : onCooldown ? "cooldown" : "ready";
                if (state === "ready" && lastState !== "ready") readyFlashUntilMs = now + READY_FLASH_MS;
                lastState = state;
                P.setClass(overlay, "on_cooldown", onCooldown);
                P.setClass(overlay, "in_use", inUse);
                P.setClass(overlay, "ready_flash", state === "ready" && now < readyFlashUntilMs);
                if (titleLabel.text !== "Zip Boost") titleLabel.text = "Zip Boost";
                if (stateLabel.text !== status) stateLabel.text = status;
            }

            function refreshSettings() {
                model = readModel();
                update();
            }

            return {
                onEnable() {
                    running = true;
                    refreshSettings();
                    loop = QOL.core.Scheduler.createPollLoop(update, 0.4, ctx.id);
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
                const gp = QOL.core.panel.findTraverse($.GetContextPanel(), "gameplay_hud");
                return { passed: !!gp, name: "ZipBoost anchor panel exists", message: gp ? "" : "gameplay_hud not found in HUD tree",
                    assertions: [{ passed: !!gp, name: "gameplay_hud panel exists" }] };
            } catch (e) {
                return { passed: false, name: "ZipBoost panel check", message: e.message || String(e) };
            }
        }
    });
})();

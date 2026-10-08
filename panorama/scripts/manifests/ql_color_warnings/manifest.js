// OWNS: Self and top-bar health warning colors, pulse phases and native source binding.
// DOES NOT OWN: Native health values, healthbar geometry or shared runtime state.
(() => {
    "use strict";
    const Q = QOL, P = Q.core.panel, U = Q.utils;
    const channels = {
        self: { enabled: "ENABLE_COLORED_HEALTHBAR", warnings: ["ENABLE_COLOR_WARNING_25", "ENABLE_COLOR_WARNING_65", "ENABLE_COLOR_WARNING_75"],
            base: U.COLORED_HEALTHBAR_COLOR_WHITE, mid: U.COLORED_HEALTHBAR_COLOR_ORANGE,
            pulse: U.COLORED_HEALTHBAR_COLOR_RED, dark: U.COLORED_HEALTHBAR_COLOR_DARK_RED },
        enemy: { enabled: "ENABLE_ENEMY_COLORED_HEALTHBAR", warnings: ["ENABLE_TOPBAR_ENEMY_HP_WARNING_25", "ENABLE_TOPBAR_ENEMY_HP_WARNING_65", "ENABLE_TOPBAR_ENEMY_HP_WARNING_75"],
            base: [255, 86, 86], mid: [255, 123, 0], pulse: [225, 97, 97], dark: [85, 28, 28] },
        ally: { enabled: "ENABLE_ALLY_COLORED_HEALTHBAR", warnings: ["ENABLE_TOPBAR_ALLY_HP_WARNING_25", "ENABLE_TOPBAR_ALLY_HP_WARNING_65", "ENABLE_TOPBAR_ALLY_HP_WARNING_75"],
            base: U.COLORED_HEALTHBAR_COLOR_WHITE, mid: U.COLORED_HEALTHBAR_COLOR_ORANGE,
            pulse: U.COLORED_HEALTHBAR_COLOR_RED, dark: U.COLORED_HEALTHBAR_COLOR_DARK_RED }
    };
    const thresholds = [U.COLORED_HEALTHBAR_LOW_HP_THRESHOLD, U.COLORED_HEALTHBAR_MID_HP_THRESHOLD, U.COLORED_HEALTHBAR_HIGH_HP_THRESHOLD];
    const readModel = cfg => Object.fromEntries(Object.entries(channels).map(([name, channel]) => {
        const warnings = channel.warnings.map(key => U.IsCfgEnabled(cfg, key));
        return [name, { enabled: U.IsCfgEnabled(cfg, channel.enabled) || warnings.some(Boolean), warnings }];
    }));
    const createPulse = () => {
        let value = 0, direction = 1;
        return {
            advance() {
                value = Math.max(0, Math.min(1, value + direction * U.COLORED_HEALTHBAR_PULSE_STEP));
                if (value === 1) direction = -1;
                else if (value === 0) direction = 1;
            },
            reset() { value = 0; direction = 1; },
            color(channel, model, percent) {
                if (model.warnings[0] && percent <= thresholds[0]) return U.ToRgbString(U.BlendRgb(channel.pulse, channel.dark, value));
                if (model.warnings[1] && percent <= thresholds[1]) return U.ToRgbString(channel.mid);
                if (model.warnings[2] && percent <= thresholds[2]) return U.ToRgbString(U.COLORED_HEALTHBAR_COLOR_YELLOW);
                return U.ToRgbString(channel.base);
            }
        };
    };
    const createPresentation = () => {
        const owners = new Map();
        const release = panel => {
            const owner = owners.get(panel);
            if (owner && P.isAlive(panel)) for (const property of owner.properties) U.ClearStyleSafe(panel, property);
            owners.delete(panel);
        };
        return {
            render(desired) {
                for (const panel of owners.keys()) if (!desired.has(panel)) release(panel);
                for (const [panel, styles] of desired) {
                    if (!P.isAlive(panel)) continue;
                    const previous = owners.get(panel);
                    const properties = new Set(Object.keys(styles));
                    if (previous) for (const property of previous.properties) {
                        if (!properties.has(property)) U.ClearStyleSafe(panel, property);
                    }
                    owners.set(panel, { properties, signature: P.syncStyles(panel, styles, previous?.signature).sig });
                }
            },
            release() { for (const panel of owners.keys()) release(panel); }
        };
    };
    const createSelfWarnings = () => {
        const containerResolver = Q.panelCache.createIdResolver("health_and_abilities_container");
        const ids = ["HealthRegenAndTotal", "currentHealthLabel", "current_health", "totalHealthLabel", "max_health",
            "hud_health_bars_stacked", "hud_health_bars", "health_bars_container", "health_bar"];
        const resolvers = Object.fromEntries(ids.map(id => [id, Q.panelCache.createIdResolver(id)]));
        const pulse = createPulse(), presentation = createPresentation();
        let container = null;
        const release = () => {
            presentation.release();
            pulse.reset();
            container = null;
            containerResolver.reset();
            for (const resolver of Object.values(resolvers)) resolver.reset();
        };
        const readSources = root => {
            const current = containerResolver.resolve(root);
            if (current !== container) {
                presentation.release();
                pulse.reset();
                container = current;
                for (const resolver of Object.values(resolvers)) resolver.reset();
            }
            if (!P.isAlive(container)) return null;
            const find = id => resolvers[id].resolve(container);
            const regen = find("HealthRegenAndTotal");
            const currentHealth = U.FindFirstPanelByClass(regen, "currentHealthLabel") || find("currentHealthLabel") || find("current_health");
            const totalHealth = U.FindFirstPanelByClass(regen, "totalHealthLabel") || find("totalHealthLabel") || find("max_health");
            const bars = find("hud_health_bars_stacked") || find("hud_health_bars");
            const bar = find("health_bars_container") || find("health_bar");
            return { currentHealth, totalHealth, bars, bar, fill: P.findChild(bar, "health_bar_left") };
        };
        const readPercent = sources => {
            const current = parseInt(P.readTextDeep(sources.currentHealth, 0).replace(/[^0-9]/g, ""), 10);
            const total = parseInt(P.readTextDeep(sources.totalHealth, 0).replace(/[^0-9]/g, ""), 10);
            if (Number.isFinite(current) && Number.isFinite(total) && total > 0) return current / total * 100;
            const progress = P.isAlive(sources.fill) ? sources.fill.GetParent() : null;
            const value = Number(progress?.value), max = Number(progress?.max);
            return Number.isFinite(value) && Number.isFinite(max) && max > 0 ? value / max * 100 : NaN;
        };
        return {
            update(root, model) {
                if (!model.enabled) { release(); return; }
                const sources = readSources(root);
                const percent = sources ? readPercent(sources) : NaN;
                if (!Number.isFinite(percent)) { presentation.release(); return; }
                if (model.warnings[0] && percent <= thresholds[0]) pulse.advance();
                const color = pulse.color(channels.self, model, Math.max(0, Math.min(100, percent)));
                const desired = new Map();
                for (const panel of [sources.bars, sources.bar, sources.fill]) if (P.isAlive(panel)) desired.set(panel, { washColor: color });
                if (P.isAlive(sources.currentHealth)) desired.set(sources.currentHealth, { color, washColor: color });
                presentation.render(desired);
            },
            release
        };
    };
    const belongsTo = (panel, root) => {
        for (let depth = 0; depth < 64 && P.isAlive(panel); depth++) {
            if (panel === root) return true;
            panel = panel.GetParent();
        }
        return false;
    };
    const createTopbarWarnings = () => {
        const presentation = createPresentation();
        const pulses = { enemy: createPulse(), ally: createPulse() };
        let rootOwner = null, entries = [], nextScanMs = 0;
        const release = () => {
            presentation.release();
            for (const pulse of Object.values(pulses)) pulse.reset();
            rootOwner = null;
            entries = [];
            nextScanMs = 0;
        };
        const isCurrent = (entry, root) => P.isAlive(entry.parent) && entry.parent.id === "HeroHealth" &&
            P.isAlive(entry.owner) && entry.owner.id === "HealthBar" && P.findChild(entry.parent, "HeroHealth_Left") === entry.fill &&
            entry.fill.BHasClass("ProgressBarLeft") && entry.parent.GetParent() === entry.owner && belongsTo(entry.owner, root);
        const discover = (root, now, force) => {
            if (rootOwner !== root) { release(); rootOwner = root; }
            if (!force && now < nextScanMs && entries.every(entry => isCurrent(entry, root))) return;
            entries = [];
            for (const fill of U.FindPanelsByClass(root, "ProgressBarLeft")) {
                if (!P.isAlive(fill) || fill.id !== "HeroHealth_Left") continue;
                const parent = fill.GetParent(), owner = P.isAlive(parent) ? parent.GetParent() : null;
                if (!P.isAlive(parent) || parent.id !== "HeroHealth" || !P.isAlive(owner) || owner.id !== "HealthBar") continue;
                entries.push({ fill, parent, owner });
            }
            nextScanMs = now + (entries.length ? 1200 : 2000);
        };
        const readPercent = entry => {
            const value = Number(entry.parent.value), max = Number(entry.parent.max);
            if (Number.isFinite(value) && Number.isFinite(max) && max > 0) return Math.max(0, Math.min(100, value / max * 100));
            const height = Number(entry.parent.actuallayoutheight), filled = Number(entry.fill.actuallayoutheight);
            return Number.isFinite(height) && Number.isFinite(filled) && height > 0 ? Math.max(0, Math.min(100, filled / height * 100)) : NaN;
        };
        return {
            update(root, model, now, force) {
                if (!model.enemy.enabled && !model.ally.enabled) { release(); return; }
                discover(root, now, force);
                const values = { enemy: [], ally: [] };
                for (const entry of entries) {
                    if (!isCurrent(entry, root)) continue;
                    const enemy = U.HasClassInHierarchy(entry.fill, "enemy"), ally = U.HasClassInHierarchy(entry.fill, "friend");
                    if (enemy === ally) continue;
                    const name = enemy ? "enemy" : "ally", percent = readPercent(entry);
                    if (Number.isFinite(percent)) values[name].push({ panel: entry.fill, percent });
                }
                const desired = new Map();
                for (const name of ["enemy", "ally"]) {
                    const channelModel = model[name], pulse = pulses[name];
                    if (channelModel.enabled) {
                        if (channelModel.warnings[0] && values[name].some(value => value.percent <= thresholds[0])) pulse.advance();
                        for (const value of values[name]) desired.set(value.panel, { backgroundColor: pulse.color(channels[name], channelModel, value.percent) });
                    } else pulse.reset();
                }
                presentation.render(desired);
            },
            release
        };
    };

    Q.core.FeatureRegistry.register({
        id: "ql_color_warnings",
        enableKeys: Object.values(channels).flatMap(channel => [channel.enabled, ...channel.warnings]),
        enabledByDefault: false,
        settings: Object.values(channels).flatMap(channel => [channel.enabled, ...channel.warnings]).map(key => ({ key, type: "toggle" })),
        create(ctx) {
            const self = createSelfWarnings(), topbar = createTopbarWarnings();
            let model = null, loop = null;
            const update = force => {
                const root = $.GetContextPanel();
                if (!model || !P.isAlive(root)) { self.release(); topbar.release(); return; }
                self.update(root, model.self);
                topbar.update(root, model, U.PerfNowMs(), force);
            };
            const refresh = () => { model = readModel(ctx.config.view()); update(true); };
            return {
                onEnable() {
                    refresh();
                    // rate-exempt: warning pulses retain their native 0.16s update cadence.
                    loop = Q.core.Scheduler.createPollLoop(() => update(false), 0.16, ctx.id);
                },
                onSettingsChanged: refresh,
                onDisable() {
                    if (loop) loop.stop();
                    loop = null;
                    self.release();
                    topbar.release();
                    model = null;
                }
            };
        },
        test() {
            const bars = U.FindPanelsByClass($.GetContextPanel(), "ProgressBarLeft");
            if (!bars.length) return null;
            return { passed: true, name: "Color warning progress bars found", message: "Found " + bars.length + " ProgressBarLeft panels",
                assertions: [{ passed: true, name: "ProgressBarLeft traversal succeeded (" + bars.length + " found)" }] };
        }
    });
})();

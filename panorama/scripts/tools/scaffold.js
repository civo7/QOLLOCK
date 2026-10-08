#!/usr/bin/env node
"use strict";

// Development tool, never included by Panorama XML. See docs/MANIFEST_STYLE.md.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

let settingCatalog = null;
function getSettingCatalog() {
    if (settingCatalog) return settingCatalog;
    // Use the shipped setting resolver in a data-only isolate. No HUD app,
    // game model, callbacks or filesystem writes are started here.
    const context = vm.createContext({ QOL: {}, $: { Msg() {} } });
    for (const file of ["ql_utils.js", "ql_shared_presets.js", "core/ql_namespace.js", "core/ql_event_bus.js", "core/ql_config_store.js"]) {
        const sourcePath = path.resolve(__dirname, "..", file);
        vm.runInContext(fs.readFileSync(sourcePath, "utf8"), context, { filename: sourcePath, timeout: 1000 });
    }
    settingCatalog = {
        defaults: context.QOL_DEFAULT_CONFIG,
        fields: new Map(context.QOL.settingsFields.map(field => [field.key, field])),
        resolve: context.QOL.core.ConfigStore.canonicalSetting
    };
    return settingCatalog;
}

function settingDeclaration(setting) {
    const catalog = getSettingCatalog();
    const declaration = { ...setting };
    if (Object.prototype.hasOwnProperty.call(catalog.defaults, setting.key)) {
        delete declaration.default;
        if (catalog.fields.has(setting.key) && ["slider", "number"].includes(setting.type)) {
            for (const key of ["min", "max", "step", "decimals"]) delete declaration[key];
        }
    }
    return declaration;
}

function parseArgs(args) {
    const positional = [];
    const flags = {};
    const allowed = new Set(["type", "settings", "css", "poll-rate", "enabled-by-default", "dry-run", "panel-id", "enable-key", "owner-path"]);
    for (const arg of args) {
        if (!arg.startsWith("--")) { positional.push(arg); continue; }
        const [key, ...value] = arg.slice(2).split("=");
        if (!allowed.has(key)) throw new Error(`Unknown flag --${key}`);
        flags[key] = value.length ? value.join("=") : true;
    }
    const boolean = key => {
        if (flags[key] === undefined || flags[key] === "false") return false;
        if (flags[key] === true || flags[key] === "true") return true;
        throw new Error(`--${key} accepts only true or false`);
    };
    if (positional.length < 2 || positional.length > 3) {
        throw new Error('Usage: node panorama/scripts/tools/scaffold.js <id> "Name" "Ownership" --type=css-only|style-only|polling [--panel-id=VERIFIED_ID] [--settings=JSON] [--enable-key=KEY] [--poll-rate=seconds] [--css] [--dry-run]');
    }
    return {
        id: positional[0], name: positional[1], description: positional[2] || "TODO: describe owned state",
        type: flags.type || "style-only", settings: JSON.parse(flags.settings || "[]"),
        panelId: flags["panel-id"] || null, enableKey: flags["enable-key"] || null,
        ownerPath: JSON.parse(flags["owner-path"] || "[]"),
        pollRate: Number(flags["poll-rate"] ?? 0.5),
        enabled: boolean("enabled-by-default"), css: boolean("css"), dryRun: boolean("dry-run")
    };
}

function validate(options) {
    if (!/^[a-z0-9_]+$/.test(options.id)) throw new Error("Feature ID must contain lowercase letters, numbers and underscores");
    if (!["css-only", "style-only", "polling"].includes(options.type)) throw new Error("Unknown feature type");
    if (!Number.isFinite(options.pollRate) || options.pollRate <= 0) throw new Error("Poll interval must be positive seconds");
    if (options.type === "style-only" && !options.panelId) throw new Error("style-only requires --panel-id from verified native XML/debugger evidence");
    if (options.panelId && (typeof options.panelId !== "string" || !options.panelId.trim())) throw new Error("Panel ID must be a nonempty string");
    if (!Array.isArray(options.settings)) throw new Error("Settings must be a JSON array");
    if (!Array.isArray(options.ownerPath) || options.ownerPath.some(step =>
        !(typeof step === "string" && step) && !(step && typeof step === "object" &&
            ((typeof step.id === "string" && step.id) || (typeof step.className === "string" && step.className))))) {
        throw new Error("Owner path must contain verified ID strings or {id}/{className} steps");
    }
    if (options.ownerPath.length && !options.panelId) throw new Error("--owner-path requires --panel-id");
    const keys = new Set();
    for (const descriptor of options.settings) {
        if (!descriptor || typeof descriptor.key !== "string" || !descriptor.key || keys.has(descriptor.key) || descriptor.key === "enabled") throw new Error("Setting keys must be unique; enabled is registry-owned");
        const catalog = getSettingCatalog();
        const persisted = Object.prototype.hasOwnProperty.call(catalog.defaults, descriptor.key);
        const setting = catalog.resolve(descriptor);
        if (!["toggle", "slider", "dropdown", "palette", "text", "number"].includes(setting.type) || !Object.prototype.hasOwnProperty.call(setting, "default")) throw new Error(`Invalid setting descriptor: ${setting.key}`);
        if (setting.type === "toggle" && ![true, false, 0, 1].includes(setting.default)) throw new Error(`Toggle default must be boolean: ${setting.key}`);
        if (["slider", "number", "palette"].includes(setting.type) && !Number.isFinite(setting.default)) throw new Error(`Numeric default must be finite: ${setting.key}`);
        if (setting.type === "slider" && (!(Number.isFinite(setting.min) && Number.isFinite(setting.max) && setting.min < setting.max) ||
            !(Number.isFinite(setting.step) && setting.step > 0) || setting.default < setting.min || setting.default > setting.max)) {
            throw new Error(`Slider requires ordered bounds, a positive step and an in-range default: ${setting.key}`);
        }
        if (setting.type === "dropdown" && !(persisted && setting.options === undefined) && (!Array.isArray(setting.options) || !setting.options.length ||
            !setting.options.some(option => String(option) === String(setting.default)))) throw new Error(`Dropdown requires options containing its default: ${setting.key}`);
        if (setting.type === "palette" && (!Number.isInteger(setting.default) || setting.default < 0 || setting.default > 29)) throw new Error(`Palette default must be an index: ${setting.key}`);
        if (setting.type === "text" && typeof setting.default !== "string") throw new Error(`Text default must be a string: ${setting.key}`);
        keys.add(setting.key);
    }
    if (options.enableKey && !options.settings.some(s => s.key === options.enableKey && s.type === "toggle")) throw new Error("--enable-key must name a declared toggle");
}

function generate(options) {
    validate(options);
    const json = JSON.stringify;
    const comment = value => String(value).replace(/[\r\n]/g, " ");
    const cssOnly = options.type === "css-only";
    const styleOnly = options.type === "style-only";
    const needsPoll = !!options.panelId || options.type === "polling";
    const className = `${options.id}_active`;
    const declaration = options.settings.map(s => `            ${json(settingDeclaration(s))}`).join(",\n");
    const source = options.panelId
        ? `            const resolver = QOL.panelCache.createIdResolver(${json(options.panelId)}, { retryMs: ${Math.round(options.pollRate * 1000)}, ownerPath: ${json(options.ownerPath)} });\n`
        : "";
    const render = cssOnly
        ? `                QOL.core.panel.setClass(panel, ${json(className)}, true);`
        : styleOnly
            ? `                for (const property of ownedStyles) {
                    if (!Object.prototype.hasOwnProperty.call(model, property)) QOL.utils.ClearStyleSafe(panel, property);
                }
                ownedStyles = new Set(Object.keys(model));
                signature = QOL.core.panel.syncStyles(panel, model, signature).sig;`
            : "                updateContent(panel, cfg);";
    const implementation = cssOnly ? "" : styleOnly
        ? "\n            function stylesForConfig(cfg) {\n                // TODO: return ONLY owned style properties derived from current settings.\n                return {};\n            }\n"
        : "\n            function updateContent(panel, cfg) {\n                // TODO: update content; guard expected missing native children.\n                // Scheduler must observe unexpected callback errors.\n            }\n";
    const cleanup = cssOnly
        ? `                QOL.core.panel.setClass(panel, ${json(className)}, false);`
        : styleOnly
            ? `                for (const property of ownedStyles) QOL.utils.ClearStyleSafe(panel, property);
                ownedStyles.clear();
                // TODO: remove any additional feature-owned classes/panels here.`
            : "                // TODO: release exactly the styles, classes and children owned by updateContent.\n                // ClearStyleSafe releases code overrides so native CSS takes over.";
    return `// manifests/${options.id}/manifest.js
// ${comment(options.name)}
// OWNS: ${comment(options.description)}
// DOES NOT OWN: TODO: identify neighboring/native state that must be preserved.
// Source hierarchy: TODO: record verified XML/debugger evidence and narrow discovery.
(() => {
    "use strict";
    QOL.core.FeatureRegistry.register({
        id: ${json(options.id)},
        enabledByDefault: ${options.enabled},
${options.enableKey ? `        enableKey: ${json(options.enableKey)},\n` : ""}        settings: [
${declaration}
        ],
        create(ctx) {
${source}            let panel = null;
${needsPoll ? "            let loop = null;\n" : ""}${styleOnly ? "            let signature = null;\n            let model = {};\n            let ownedStyles = new Set();\n" : ""}${implementation}
            function release() {
                if (!QOL.core.panel.isAlive(panel)) {${styleOnly ? " ownedStyles.clear();" : ""} return; }
${cleanup}
            }

            function update() {
                const current = ${options.panelId ? "resolver.resolve($.GetContextPanel())" : "$.GetContextPanel()"};
                if (current !== panel) {
                    release();
                    panel = current;
${styleOnly ? "                    signature = null;\n" : ""}                }
                if (!QOL.core.panel.isAlive(panel)) return;
${!cssOnly && !styleOnly ? "                const cfg = ctx.config.view();\n" : ""}${render}
            }

            function refreshSettings() {
${styleOnly ? "                model = stylesForConfig(ctx.config.view());\n                signature = null;\n" : ""}${options.panelId ? "                resolver.reset();\n" : ""}                update();
            }

            return {
                onEnable() {
                    refreshSettings();
${needsPoll ? `                    loop = QOL.core.Scheduler.createPollLoop(update, ${options.pollRate}, ctx.id);\n` : ""}                },
                onSettingsChanged: refreshSettings,
                onDisable() {
${needsPoll ? "                    if (loop) { loop.stop(); loop = null; }\n                    QOL.core.Scheduler.cancelAllForFeature(ctx.id);\n" : ""}                    // ctx.events subscriptions are scoped to this registry instance.
                    release();
                    panel = null;
${styleOnly ? "                    signature = null;\n                    model = {};\n                    ownedStyles.clear();\n" : ""}${options.panelId ? "                    resolver.reset();\n" : ""}                }
            };
        }
    });
})();
`;
}

function scaffold(options, repoRoot = path.resolve(__dirname, "../../..")) {
    const manifest = generate(options);
    const files = [{ path: path.join(repoRoot, "panorama/scripts/manifests", options.id, "manifest.js"), text: manifest }];
    if (options.css) files.push({ path: path.join(repoRoot, "panorama/styles/features", `${options.id}.css`), text: `/* TODO: selectors scoped to .${options.id}_active when using css-only. */\n` });
    // Check every output before writing anything. Never overwrite existing work.
    for (const file of files) if (fs.existsSync(file.path)) throw new Error(`Refusing to overwrite ${file.path}`);
    if (!options.dryRun) {
        for (const file of files) {
            fs.mkdirSync(path.dirname(file.path), { recursive: true });
            fs.writeFileSync(file.path, file.text, { flag: "wx" });
        }
    }
    return { files, include: `<include src="s2r://panorama/scripts/manifests/${options.id}/manifest.vjs_c" />`, cssImport: options.css ? `@import url("s2r://panorama/styles/features/${options.id}.vcss_c");` : null };
}

if (require.main === module) {
    try {
        const options = parseArgs(process.argv.slice(2));
        const result = scaffold(options);
        for (const file of result.files) console.log(`${options.dryRun ? "Would create" : "Created"}: ${file.path}${options.dryRun ? "\n" + file.text : ""}`);
        console.log("Add the manifest include in hud.xml before core/ql_app.vjs_c:");
        console.log(result.include);
        if (result.cssImport) console.log(`Add to the appropriate CSS manifest:\n${result.cssImport}`);
        console.log("Complete ownership/cleanup TODOs and the settings/localization path. New persistent defaults need the maintainer's decision.");
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}

module.exports = { parseArgs, generate, scaffold };

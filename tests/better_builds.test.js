"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createHud, Sandbox, layout } = require("../scripts/simulator");
const loadSettings = require("./load_settings_environment");

const popupLayout = path.resolve(__dirname, "../panorama/layout/popups/citadel_popup_build_browser.xml");
const prefix = "QolBetterBuilds";
const localeAttr = "QOL_BETTER_BUILDS_LANGUAGE";
const build = { id: 42, n: "Ascendant Ivy", a: 200, u: 100, s: 300, f: 22, w: [[200, 100, 3, 20, 1, 75]] };
const hero = { id: 20, name: "Ivy", cls: "hero_ivy" };
const registry = { authors: { "200": ["Player", 103, 0, 9, "", 5, 1] }, heroes: [hero] };

function setup() {
    const hud = createHud();
    hud.assertLoaded();
    const { clock, doc } = hud;
    const context = new Sandbox({ clock, doc, name: "build browser popup" });
    const $ = context.global.$;
    const add = (parent, id, type = "Panel", classes = "") => {
        const p = $.CreatePanel(type, parent, id || "");
        for (const cls of classes.split(/\s+/).filter(Boolean)) p.AddClass(cls);
        return p;
    };
    const manager = add(doc.absRoot, "PopupManager");
    const popup = add(manager, "BuildPopup", "PopupBuildBrowser");
    const snippets = new Map(Array.from(fs.readFileSync(popupLayout, "utf8")
        .matchAll(/<snippet name="([^"]+)">([\s\S]+?)<\/snippet>/g), m => [m[1], m[2]]));
    const requests = [];
    const create = $.CreatePanel;
    $.GetContextPanel = () => popup;
    $.CreatePanelWithCurrentContext = parent => $.CreatePanel("Panel", parent, "");
    $.CreatePanel = (type, parent, id, props) => {
        const p = create(type, parent, id, props);
        if (props?.class) for (const cls of props.class.split(" ")) p.AddClass(cls);
        if (type === "CitadelAvatarImage") p.SetAccountID = () => {};
        if (type === "CitadelHTMLPanel") p.SetURL = url => {
            const command = JSON.parse(decodeURIComponent(url.split("#bg=")[1]));
            assert.match(url, /^https:\/\/builds\.braydendwyer\.com\/\#bg=/);
            requests.push({ p, command });
        };
        p.BLoadLayoutSnippet = name => {
            const stack = [];
            for (const [, close, tag, attrs, end] of snippets.get(name).matchAll(/<(\/?)(\w+)([^>]*?)(\/?)>/g)) {
                if (close) { stack.pop(); continue; }
                const attr = Object.fromEntries(Array.from(attrs.matchAll(/([\w-]+)="([^"]*)"/g), m => [m[1], m[2]]));
                const item = stack.length ? add(stack.at(-1), attr.id, tag, attr.class) : p;
                if (item === p && attr.class) for (const cls of attr.class.split(" ")) p.AddClass(cls);
                if (attr.text) item.text = attr.text;
                if (!end) stack.push(item);
            }
            return true;
        };
        return p;
    };
    const nativeLocalize = $.Localize;
    $.Localize = (key, source) => {
        if (key === "#hero_ivy") return "Ivy";
        if (key === "#Citadel_HeroBuilds_DefaultHeroBuild") return "Default " + source.GetDialogVariable("hero_name") + " Build";
        if (key.startsWith("{")) return source.GetAttributeString(key, key);
        return nativeLocalize(key, source);
    };
    context.onEvent("Activated", target => target.activate());

    const content = add(popup, "BuildsContent");
    const tabFilters = [];
    context.onEvent("CitadelBuildBrowserSetTabFilter", (selector, filter) => {
        assert.equal(selector.GetParent(), content);
        assert.ok(!selector.BHasClass(prefix + "Active"), "stock visibility is restored before the filter event");
        assert.equal(selector.BHasClass("ShowMyBuilds"), filter === 1);
        assert.equal(selector.BHasClass("ShowPublicBuilds"), filter === 2);
        tabFilters.push(filter);
    });

    function mount() {
        const selector = add(content, "HeroBuildSelector", "CitadelHeroBuildsSelector", "ShowMyBuilds");
        const header = add(selector, "", "Panel", "HeroSelectorHeader");
        const tabs = add(header, "", "Panel", "HeroSelectorTabContainer");
        const my = add(tabs, "", "Panel", "HeroSelectorTab MyBuilds");
        const publicTab = add(tabs, "", "Panel", "HeroSelectorTab PublicBuilds");
        add(my, "", "Label", "TabLabel").text = "My Builds";
        add(publicTab, "", "Label", "TabLabel").text = "Public Builds";
        const search = add(header, "", "Panel", "SearchContainer");
        const entry = add(add(search, "SearchBox"), "SearchTextEntry", "TextEntry");
        const main = add(selector, "", "Panel", "MainContainer");
        const list = add(main, "HeroBuildList");
        const loadingList = add(main, "HeroBuildListLoading");
        const details = add(main, "BuildDetails");
        const defaultRow = add(list, "", "Panel", "HeroBuildListItem DefaultBuild");
        defaultRow.SetAttributeString("{s:selected_hero_build_name}", "Default Ivy Build");
        defaultRow.SetAttributeString("{d:build_creator}", "0");
        const row = add(list, "", "Panel", "HeroBuildListItem");
        row.SetAttributeString("{s:selected_hero_build_name}", build.n);
        row.SetAttributeString("{d:build_creator}", String(build.a));
        row.SetPanelEvent("onactivate", () => {
            assert.ok(selector.BHasClass("ShowPublicBuilds"), "stock row must preview in Public mode");
            details.SetAttributeString("{d:selected_hero_build_id}", String(build.id));
            row.AddClass("Selected");
        });
        const right = add(row, "RightPanel");
        const star = add(add(right, "", "Panel", "InfoContainer"), "FavoriteIcon");
        star.SetPanelEvent("onactivate", () => row.AddClass("Favorite"));
        const nameArea = add(row, "BuildNameArea");
        const use = add(nameArea, "", "CitadelButton");
        use.SetPanelEvent("onactivate", () => popup.AddClass("Hidden"));
        add(nameArea, "", "Panel", "nameRow");
        return { selector, entry, list, loadingList, details, my, publicTab, row };
    }
    const scripts = layout.parseLayoutScripts(popupLayout);
    assert.deepEqual(scripts.missing, []);
    for (const { absPath } of scripts.scripts) context.load(absPath);
    assert.deepEqual(context.loadErrors, []);
    const config = hud.sandbox.global.QOL.buildDefaultConfig();
    function configure(value, language = 0) {
        hud.root.SetAttributeString("Deadlock_Mod_Settings_v1", JSON.stringify({
            schema: "3.1.9", data: { ...config, ENABLE_BETTER_BUILDS: value, LANGUAGE: language }
        }));
    }
    function reply(index, answer, part = null) {
        const { p, command } = requests[index];
        const raw = JSON.stringify(answer);
        const middle = Math.floor(raw.length / 2);
        if (part === null) context.dispatch("HTMLTitle", [p, "BG1|" + command.id + "|0/1|" + raw]);
        else context.dispatch("HTMLTitle", [p, "BG1|" + command.id + "|" + part + "/2|" +
            (part === 0 ? raw.slice(0, middle) : raw.slice(middle))]);
    }
    function find(name) { return popup.FindChildTraverse(prefix + name); }
    function byClass(name) { return popup.FindChildrenWithClassTraverse(prefix + name); }
    function assertClean() {
        assert.deepEqual(clock.errors, []);
        assert.deepEqual(doc.eventErrors, []);
        assert.deepEqual(context.messages.filter(message => message.includes("[ERROR]")), []);
    }
    return { doc, clock, context, popup, mount, requests, tabFilters, configure, reply, find, byClass, assertClean };
}

const stockVisibility = native =>
    [native.my, native.publicTab, native.list, native.loadingList].map(target => target.style.visibility);
const released = Array(4).fill(undefined);

test("Shop setting round-trips through the current clipboard codec with a default of off", () => {
    const { global: g, hud } = loadSettings();
    const config = g.QOL.buildDefaultConfig();
    assert.equal(config.ENABLE_BETTER_BUILDS, 0);
    const code = g.QOL.ui.configTab.getCurrentExportSettingsString({ ...config, ENABLE_BETTER_BUILDS: 1 });
    const raw = g.QOL.persistence.fromBase64Url(code.split(":")[1]);
    assert.equal(hud.sandbox.global.QOL.core.codec.deserializeSettings(raw).ENABLE_BETTER_BUILDS, 1);
    assert.equal(g.QOL.ui.modal.tryApplyImportStringWithDiagnostics(code).candidateConfig.ENABLE_BETTER_BUILDS, 1);
});

test("Better Builds waits for its native selector, renders live data and delegates preview, favourite and stock tabs", async () => {
    const e = setup();
    e.clock.advance(1000);
    assert.equal(e.find("TabLabel"), null);
    assert.equal(e.requests.length, 0);

    e.configure(1);
    e.clock.advance(1800);
    assert.equal(e.doc.absRoot.GetAttributeString(localeAttr, ""), "0");
    assert.equal(e.requests.length, 0, "no relay until the native selector exists");
    const native = e.mount();
    native.my.style.visibility = "visible";
    e.clock.advance(1200);
    assert.equal(e.find("TabLabel").text, "High Elo");
    assert.equal(e.requests[0].command.cmd, "registry");
    e.reply(0, registry, 1);
    e.reply(0, registry, 1);
    e.clock.advance(200);
    assert.equal(e.requests.length, 1);
    e.reply(0, registry, 0);
    e.clock.advance(1100);
    assert.equal(e.requests[1].command.hero.id, hero.id);
    e.reply(1, { hero: { ...hero, builds: [build] } });
    e.clock.advance(10);
    assert.equal(e.byClass("NativeChip").length, 1);
    assert.ok(e.byClass("StockTab").every(tab => !tab.BHasClass(prefix + "Shown")));
    e.byClass("Tab")[0].activate();
    assert.equal(e.find("Name").text, build.n);
    assert.ok(native.selector.BHasClass(prefix + "Active"));
    assert.deepEqual(stockVisibility(native), ["visible", undefined, undefined, undefined]);
    assert.equal(native.details.style.visibility, undefined);
    assert.ok(e.byClass("StockTab").every(tab => tab.BHasClass(prefix + "Shown")));
    assert.ok(e.byClass("Host")[0].BHasClass(prefix + "Shown"));
    const row = e.byClass("Row")[0];
    row.activate();
    await Promise.resolve();
    await Promise.resolve();
    assert.ok(native.row.BHasClass("Selected"));
    e.find("Star").activate();
    for (let i = 0; i < 5; i++) await Promise.resolve();
    assert.ok(native.row.BHasClass("Favorite"));
    assert.ok(row.BHasClass(prefix + "Favourite"));
    e.byClass("PublicTab")[0].activate();
    assert.ok(native.selector.BHasClass("ShowPublicBuilds"));
    assert.ok(!native.selector.BHasClass(prefix + "Active"));
    assert.deepEqual(stockVisibility(native), ["visible", undefined, undefined, undefined]);
    assert.ok(e.byClass("StockTab").every(tab => !tab.BHasClass(prefix + "Shown")));
    assert.ok(!e.byClass("Host")[0].BHasClass(prefix + "Shown"));
    e.byClass("Tab")[0].activate();
    e.byClass("MyTab")[0].activate();
    assert.ok(native.selector.BHasClass("ShowMyBuilds"));
    assert.ok(!native.selector.BHasClass("ShowPublicBuilds"));
    assert.ok(!native.selector.BHasClass(prefix + "Active"));
    assert.deepEqual(e.tabFilters, [2, 1]);
    e.assertClean();
});

test("Use Build performs the native ID search, retires on close and reopens using cached feed data", async () => {
    const e = setup();
    const native = e.mount();
    native.row.SetParent(e.doc.create("Panel"));
    e.configure(1);
    e.clock.advance(1400);
    e.reply(0, registry);
    e.clock.advance(1000);
    e.reply(1, { hero: { ...hero, builds: [build] } });
    e.byClass("Tab")[0].activate();
    let searched = false;
    e.context.onEvent("CitadelBuildBrowserRefresh", selector => {
        assert.equal(selector, native.selector);
        assert.equal(native.entry.text, "42");
        searched = true;
        selector.AddClass("BuildsLoading");
        e.clock.schedule(0.1, () => {
            native.row.SetParent(native.list);
            selector.RemoveClass("BuildsLoading");
        });
    });
    e.find("Use").activate();
    for (let i = 0; i < 4; i++) await Promise.resolve();
    assert.ok(searched);
    for (let i = 0; i < 8; i++) {
        e.clock.advance(80);
        for (let turn = 0; turn < 4; turn++) await Promise.resolve();
    }
    assert.ok(e.popup.BHasClass("Hidden"), "stock Use Build button closed the popup");
    e.clock.advance(1000);
    assert.equal(e.find("TabLabel"), null);
    assert.equal(native.entry.text, "");
    assert.ok(!native.selector.BHasClass(prefix + "Active"));
    assert.deepEqual(stockVisibility(native), released);
    e.popup.RemoveClass("Hidden");
    e.clock.advance(1500);
    assert.equal(e.find("Name").text, build.n);
    assert.equal(e.requests.length, 2, "registry and hero reused during the same session");
    e.assertClean();
});

test("disable and a still-live selector replacement retire pending relay results and restore native state", () => {
    const e = setup();
    const old = e.mount();
    e.configure(1, 1);
    e.clock.advance(1400);
    assert.equal(e.find("TabLabel").text, "Высокий рейтинг");
    e.byClass("Tab")[0].activate();
    const oldTab = e.byClass("Tab")[0];
    const oldView = e.requests[0].p;
    old.selector.SetParent(e.doc.create("Panel"));
    const replacement = e.mount();
    e.clock.advance(1400);
    assert.ok(old.selector.IsValid());
    assert.equal(oldTab.IsValid(), false);
    assert.equal(oldView.IsValid(), false);
    assert.ok(old.selector.BHasClass("ShowMyBuilds"));
    assert.ok(!old.selector.BHasClass(prefix + "Active"));
    assert.ok(replacement.selector.BHasClass(prefix + "Active"));
    assert.deepEqual(stockVisibility(old), released);
    assert.deepEqual(stockVisibility(replacement), released);
    e.reply(0, registry);
    assert.equal(e.requests.length, 2, "old reply did not start a hero request");
    e.configure(0);
    e.clock.advance(1400);
    assert.equal(e.find("TabLabel"), null);
    assert.ok(replacement.selector.BHasClass("ShowMyBuilds"));
    assert.ok(!replacement.selector.BHasClass(prefix + "Active"));
    assert.deepEqual(stockVisibility(replacement), released);
    assert.equal(e.requests[1].p.IsValid(), false);
    e.reply(1, registry);
    assert.equal(e.requests.length, 2);
    e.assertClean();
});

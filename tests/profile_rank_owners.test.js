"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { createHud, Sandbox } = require("../scripts/simulator");
const source = file => path.resolve(__dirname, "../panorama/scripts", file);
const rankUrl = account => "https://api.deadlock-api.com/v1/players/" + account + "/rank-predict/image?format=webp&size=small";

function fixture() {
    const hud = createHud({ inHideout: false });
    hud.assertLoaded(); hud.sandbox.eval("Math.random = () => 0;");
    const { $, QOL: Q } = hud.sandbox.global;
    const add = (parent, id, classes = [], type = "Panel") => {
        const panel = $.CreatePanel(type, parent, id);
        for (const name of classes) panel.AddClass(name);
        if (type === "Image") { panel.images = []; panel.SetImage = value => { panel.images.push(value); panel.currentImage = value; }; }
        return panel;
    };
    const text = (parent, id, value, classes = []) => { const panel = add(parent, id, classes, "Label"); panel.text = value; return panel; };
    const retired = add(hud.doc.absRoot, "RetiredTestGeneration");
    const config = patch => Q.core.ConfigAdapter.loadFromFlat(patch);
    const urls = []; hud.sandbox.onEvent("ExternalBrowserGoToURL", url => urls.push(url));
    return { hud, Q, $, add, text, retired, config, urls };
}
function isolate(env, context, files) {
    const sandbox = new Sandbox({ clock: env.hud.clock, doc: env.hud.doc, name: "profile" });
    sandbox.global.$.GetContextPanel = () => context;
    sandbox.load(source("ql_utils.js"));
    for (const file of files) sandbox.load(source(file));
    assert.deepEqual(sandbox.loadErrors, []);
    sandbox.onEvent("ExternalBrowserGoToURL", url => env.urls.push(url));
    return sandbox;
}
function topPlayer(env, name, hero = "") {
    let top = env.hud.root.FindChildTraverse("TopBar");
    if (!top) top = env.add(env.hud.root, "TopBar");
    let teams = top.FindChild("TeamsContainer");
    if (!teams) {
        teams = env.add(top, "TeamsContainer");
        const team = env.add(teams, "TeamFriendly");
        env.add(env.add(team, "PlayerContents"), "PlayersContainer");
    }
    const container = teams.GetChild(0).FindChild("PlayerContents").FindChild("PlayersContainer");
    const player = env.add(container, "Player");
    const nameLabel = env.text(player, "", name, ["PlayerName"]);
    const heroLabel = env.text(player, "", hero, ["HeroNameHidden"]);
    const account = env.text(player, "", "", ["PlayerAccountHiddenTopBar"]);
    const base = env.add(player, "RankPredictionBadgeTopBar", [], "Image");
    const overlay = env.add(player, "RankPredictionBadgeTopBarOverlay", [], "Image");
    return { top, player, nameLabel, heroLabel, account, base, overlay };
}
function row(env, name, hero = "") {
    let escape = env.hud.root.FindChildTraverse("EscapeMenu");
    if (!escape) escape = env.add(env.hud.root, "EscapeMenu");
    let list = escape.FindChild("PlayersList");
    if (!list) list = env.add(escape, "PlayersList");
    const entry = env.add(list, "", [], "CitadelPlayersListEntry");
    const contents = env.add(entry, "MainContents");
    const nameLabel = env.text(contents, "", name, ["PlayerName"]);
    const heroLabel = env.text(contents, "", hero, ["PlayerHeroHidden"]);
    const account = env.text(contents, "", "", ["PlayerAccountHidden"]);
    const base = env.add(contents, "RankPredictionBadge", [], "Image");
    const overlay = env.add(contents, "RankPredictionBadgeOverlay", [], "Image");
    return { entry, contents, nameLabel, heroLabel, account, base, overlay };
}
function card(env, account, companions = false) {
    const panel = env.add(env.hud.doc.absRoot, "", [], "CitadelProfileCard");
    const binding = env.text(panel, "QOLProfileCardAccountID", account, ["HiddenAccountID"]);
    const link = env.add(panel, "QOLStatlockerProfileCardLink", [], "Button");
    const display = env.text(link, "QOLStatlockerProfileCardLabel", "Friend ID:", ["AccountID"]);
    const sandbox = isolate(env, panel, companions ? ["ql_profile_card_statlocker.js", "features/ql_feat_showrank_card.js"] : ["features/ql_feat_showrank_card.js"]);
    return { panel, binding, link, display, sandbox };
}
function openRanks(env, accounts) {
    const cards = [];
    env.hud.sandbox.onEvent("Activated", target => {
        const current = card(env, accounts.get(target) || ""); cards.push(current);
        current.sandbox.global.$.ShowRankCardLoaded();
    });
    env.hud.root.AddClass("ShowEscapeMenu");
    env.config({ SHOW_RANK: 1, SHOW_RANK_TOPBAR: 1 });
    return cards;
}

test("shared account parser preserves verified Steam IDs and ordinary punctuation", () => {
    const env = fixture(), parse = env.Q.utils.ParseAccountId;
    assert.equal(parse("[U:1:345]"), "345");
    assert.equal(parse("Steam ID: [u:1:1234567890]"), "1234567890");
    assert.equal(parse("[U:1:12345678901]"), "");
    assert.equal(parse("[U:2:345]"), "");
    assert.equal(parse("[X:1:345]"), "");
    assert.equal(parse("[U:1:bad]"), "");
    assert.equal(parse(12345), "12345");
    assert.equal(parse("Friend ID: 123,456"), "123456");
    assert.equal(parse("[123]"), "123");
    assert.equal(parse("12345678901"), "");
    assert.equal(parse(null), "");
});

test("rank owners preserve player-name fallback, escape names and reactive topbar gating", () => {
    const env = fixture(), list = row(env, "a|b%"), top = topPlayer(env, "a|b%");
    openRanks(env, new Map([[list.contents, "12345"]]));
    env.hud.clock.advance(4000);
    assert.equal(list.account.text, "12345");
    assert.equal(list.overlay.currentImage, rankUrl("12345"));
    assert.equal(top.account.text, "12345");
    assert.equal(top.overlay.currentImage, rankUrl("12345"));
    assert.equal(env.hud.doc.absRoot.GetAttributeString("qol_sr_ranked_names", ""), "a%7Cb%25");
    env.config({ SHOW_RANK_TOPBAR: 0 });
    assert.equal(top.base.BHasClass("ShowRankVisible"), false);
    assert.equal(list.base.BHasClass("ShowRankVisible"), true);
    env.config({ SHOW_RANK_TOPBAR: 1 });
    assert.equal(top.overlay.BHasClass("ShowRankVisible"), true);
    env.config({ SHOW_RANK: 0 });
    assert.equal(list.account.text, ""); assert.equal(top.account.text, "");
    assert.equal(env.hud.doc.absRoot.GetAttributeString("qol_sr_rankp_a%7Cb%25", ""), "");
    assert.equal(env.hud.doc.absRoot.GetAttributeString("qol_sr_probe_token", ""), "");
    assert.equal(env.Q.core.Scheduler.getWorkSnapshot().some(owner => owner.id === "ql_showrank"), false);
    assert.deepEqual(env.hud.clock.errors, []);
});

test("rank publication keeps three duplicate player names ambiguous", () => {
    const env = fixture(), rows = [row(env, "duplicate", "hero1"), row(env, "duplicate", "hero2"), row(env, "duplicate", "hero3")];
    const top = topPlayer(env, "duplicate");
    openRanks(env, new Map(rows.map((entry, index) => [entry.contents, String(100 + index)])));
    env.hud.clock.advance(5000);
    assert.deepEqual(rows.map(entry => entry.account.text), ["100", "101", "102"]);
    assert.equal(env.hud.doc.absRoot.GetAttributeString("qol_sr_rankp_duplicate", ""), "");
    assert.equal(top.account.text, "");
});

test("rank badges follow alive roster replacement and reused player identity", () => {
    const env = fixture(), list = row(env, "Alice", "Infernus"), top = topPlayer(env, "Alice", "Infernus");
    openRanks(env, new Map([[list.contents, "321"]])); env.hud.clock.advance(4000);
    top.player.SetParent(env.retired);
    const replacement = topPlayer(env, "Alice", "Infernus");
    env.hud.clock.advance(1000);
    assert.equal(top.overlay.currentImage, ""); assert.equal(top.account.text, "");
    assert.equal(replacement.overlay.currentImage, rankUrl("321"));
    replacement.nameLabel.text = "Bob"; replacement.heroLabel.text = "Haze";
    env.hud.clock.advance(500);
    assert.equal(replacement.account.text, ""); assert.equal(replacement.overlay.currentImage, "");
    replacement.overlay.SetParent(env.retired);
    const overlay = env.add(replacement.player, "RankPredictionBadgeTopBarOverlay", [], "Image");
    replacement.nameLabel.text = "Alice"; replacement.heroLabel.text = "Infernus";
    env.hud.clock.advance(500);
    assert.equal(overlay.currentImage, rankUrl("321"));
});

test("rank probe rejects late cards and aborts immediately when scoreboard identity changes", () => {
    const env = fixture(), list = row(env, "Alice", "Infernus");
    const cards = [];
    env.hud.sandbox.onEvent("Activated", () => cards.push(card(env, "")));
    env.hud.root.AddClass("ShowEscapeMenu"); env.config({ SHOW_RANK: 1 });
    env.hud.clock.advance(250); assert.equal(cards.length, 1);
    const old = cards[0];
    list.nameLabel.text = "Bob"; list.heroLabel.text = "Haze";
    env.hud.clock.advance(500); assert.equal(cards.length, 2);
    old.binding.text = "111"; old.sandbox.global.$.ShowRankCardLoaded();
    assert.equal(env.hud.doc.absRoot.GetAttributeString("qol_sr_probe_account", ""), "");
    cards[1].binding.text = "222"; cards[1].sandbox.global.$.ShowRankCardLoaded();
    env.hud.clock.advance(250);
    assert.equal(list.account.text, "222");
    assert.equal(env.hud.doc.absRoot.GetAttributeString("qol_sr_rankp_alice", ""), "");
    assert.equal(env.hud.doc.absRoot.GetAttributeString("qol_sr_rankp_bob", ""), "222");
    env.hud.root.AddClass("InHideout"); env.hud.clock.advance(500);
    assert.equal(list.account.text, "");
    assert.equal(env.hud.doc.absRoot.GetAttributeString("qol_sr_rankp_bob", ""), "");
});

test("rank card bridge tolerates late canonical binding and fails closed while blank", () => {
    const env = fixture(), list = row(env, "Alice");
    let current;
    env.hud.sandbox.onEvent("Activated", () => {
        current = card(env, ""); current.display.text = "Friend ID: 999";
        current.sandbox.global.$.ShowRankCardLoaded();
    });
    env.hud.root.AddClass("ShowEscapeMenu"); env.config({ SHOW_RANK: 1 }); env.hud.clock.advance(600);
    assert.equal(list.account.text, "");
    current.binding.text = "[U:1:345]"; env.hud.clock.advance(200);
    assert.equal(list.account.text, "345");
    assert.deepEqual(env.hud.clock.errors, []);
});

test("rank correlated fallback works without synthetic onload and native image failures retry", () => {
    const env = fixture(), list = row(env, "Alice"), top = topPlayer(env, "Alice");
    let fail = true;
    top.overlay.SetImage = value => { if (value && fail) { fail = false; throw Error("temporary asset failure"); } top.overlay.currentImage = value; };
    env.hud.sandbox.onEvent("Activated", () => card(env, "456"));
    env.hud.root.AddClass("ShowEscapeMenu"); env.config({ SHOW_RANK: 1, SHOW_RANK_TOPBAR: 1 });
    env.hud.clock.advance(4000);
    assert.equal(list.account.text, "456"); assert.equal(top.overlay.currentImage, rankUrl("456"));
    env.config({ SHOW_RANK: 0 }); env.hud.clock.advance(50);
    env.config({ SHOW_RANK: 1 }); env.hud.clock.advance(4000);
    assert.equal(list.account.text, "456");
});

test("rank shutdown invalidates an in-flight probe and supports late scoreboard rows", () => {
    const env = fixture(); topPlayer(env, "Late");
    const cards = [];
    env.hud.sandbox.onEvent("Activated", () => cards.push(card(env, "")));
    env.hud.root.AddClass("ShowEscapeMenu"); env.config({ SHOW_RANK: 1, SHOW_RANK_TOPBAR: 1 });
    env.hud.clock.advance(600); assert.equal(cards.length, 0);
    const list = row(env, "Late"); env.hud.clock.advance(600); assert.equal(cards.length, 1);
    cards[0].sandbox.global.$.ShowRankCardLoaded();
    env.config({ SHOW_RANK: 0 }); cards[0].binding.text = "888";
    cards[0].sandbox.global.$.ShowRankCardLoaded(); env.hud.clock.advance(2200);
    assert.equal(list.account.text, "");
    assert.equal(env.hud.doc.absRoot.GetAttributeString("qol_sr_probe_account", ""), "");
    assert.equal(env.Q.core.Scheduler.getWorkSnapshot().some(owner => owner.id === "ql_showrank"), false);
    env.config({ SHOW_RANK: 1 }); env.hud.clock.advance(250);
    cards[0].sandbox.global.$.ShowRankCardLoaded(); assert.equal(list.account.text, "");
    cards.at(-1).binding.text = "777"; cards.at(-1).sandbox.global.$.ShowRankCardLoaded();
    env.hud.clock.advance(200); assert.equal(list.account.text, "777");
});

function profile(env, account, active = true) {
    const panel = env.add(env.hud.doc.absRoot, "", active ? ["DashboardPage", "active"] : ["DashboardPage"], "CitadelProfilePage");
    const binding = env.text(panel, "QOLProfileAccountID", account, ["HiddenAccountID"]);
    const tools = env.add(panel, "QOLFriendProfileTools");
    const image = env.add(tools, "QOLFriendRankImage", [], "Image");
    const button = env.add(tools, "QOLProfileStatlockerButton", [], "Button");
    return { panel, binding, tools, image, button };
}
function heroRow(env, owner) {
    const row = env.add(owner, "", ["heroRow"]); env.add(row, "HeroRowBackground");
    const core = env.add(row, "", ["coreRating"]);
    return { row, core };
}

test("HUD Statlocker follows native rows and resolves canonical account at click time", () => {
    const env = fixture(), page = profile(env, "100"), first = heroRow(env, page.panel);
    env.config({ ENABLE_STATLOCKER: 1 });
    let button = first.core.FindChildrenWithClassTraverse("QOLStatlockerButton")[0];
    button._fire("onactivate"); assert.equal(env.urls.at(-1), "https://statlocker.gg/profile/100");
    page.binding.text = ""; env.text(page.panel, "", "999", ["AccountID"]);
    button._fire("onactivate"); assert.equal(env.urls.length, 1);
    page.binding.text = "200"; button._fire("onactivate"); assert.equal(env.urls.at(-1), "https://statlocker.gg/profile/200");
    first.core.SetParent(env.retired);
    const second = heroRow(env, page.panel); env.hud.clock.advance(1300);
    assert.equal(button.IsValid(), false);
    button = second.core.FindChildrenWithClassTraverse("QOLStatlockerButton")[0]; assert.ok(button);
    const handler = button._events.get("onactivate");
    env.config({ ENABLE_STATLOCKER: 0 }); handler(); assert.equal(env.urls.length, 2);
    env.hud.clock.advance(1); assert.equal(button.IsValid(), false);
    assert.deepEqual(env.hud.clock.errors, []);
});

test("HUD Statlocker retries partial label creation and style writes", () => {
    const env = fixture(), page = profile(env, "123"), row = heroRow(env, page.panel);
    const create = env.$.CreatePanel;
    let failLabel = true, failStyle = true;
    env.$.CreatePanel = (type, parent, id, props) => {
        if (type === "Label" && parent.BHasClass("QOLStatlockerButton") && failLabel) { failLabel = false; throw Error("temporary label failure"); }
        const panel = create(type, parent, id, props);
        if (type === "Button" && parent === row.core) panel.style = new Proxy(panel.style, { set(target, key, value) {
            if (key === "height" && failStyle) { failStyle = false; throw Error("temporary style failure"); }
            target[key] = value; return true;
        } });
        return panel;
    };
    env.config({ ENABLE_STATLOCKER: 1 }); env.hud.clock.advance(2500);
    const button = row.core.FindChildrenWithClassTraverse("QOLStatlockerButton")[0];
    assert.equal(button.style.height, "22px");
    assert.equal(button.FindChildrenWithClassTraverse("QOLStatlockerLabel")[0].text, "STAT");
    button._fire("onactivate"); assert.equal(env.urls.at(-1), "https://statlocker.gg/profile/123");
});

test("profile page remains independent of HUD toggles and rejects stale account bindings", () => {
    const env = fixture(), page = profile(env, "123");
    const sandbox = isolate(env, page.panel, ["ql_profile_statlocker.js"]);
    assert.equal(sandbox.global.QOL, undefined);
    assert.equal(page.image.currentImage, rankUrl("123"));
    page.binding.text = "456"; page.button._fire("onactivate");
    assert.equal(env.urls.at(-1), "https://statlocker.gg/profile/456");
    page.binding.text = ""; env.text(page.panel, "", "999", ["HiddenAccountID"]);
    page.button._fire("onactivate"); assert.equal(env.urls.length, 1);
    env.hud.clock.advance(400); assert.equal(page.tools.BHasClass("QOLProfileToolsVisible"), false);
    assert.equal(page.image.currentImage, "");
    page.binding.SetParent(env.retired);
    const binding = env.text(page.panel, "QOLProfileAccountID", "789", ["HiddenAccountID"]);
    env.hud.clock.advance(500); assert.equal(page.image.currentImage, rankUrl("789"));
    page.tools.SetParent(env.retired);
    const tools = env.add(page.panel, "QOLFriendProfileTools"), image = env.add(tools, "QOLFriendRankImage", [], "Image");
    const button = env.add(tools, "QOLProfileStatlockerButton", [], "Button");
    env.hud.clock.advance(700);
    assert.equal(page.tools.BHasClass("QOLProfileToolsVisible"), false);
    assert.equal(image.currentImage, rankUrl(binding.text));
    page.button._fire("onactivate"); assert.equal(env.urls.length, 1);
    button._fire("onactivate"); assert.equal(env.urls.at(-1), "https://statlocker.gg/profile/789");
});

test("profile page retries image failures and releases tools when inactive or destroyed", () => {
    const env = fixture(), page = profile(env, "123");
    let fail = true;
    page.image.SetImage = value => { if (value && fail) { fail = false; throw Error("temporary image failure"); } page.image.currentImage = value; };
    const sandbox = isolate(env, page.panel, ["ql_profile_statlocker.js"]);
    env.hud.clock.advance(1100); assert.equal(page.image.currentImage, rankUrl("123"));
    page.panel.RemoveClass("active"); env.hud.clock.advance(400);
    assert.equal(page.tools.BHasClass("QOLProfileToolsVisible"), false);
    page.button._fire("onactivate"); assert.equal(env.urls.length, 0);
    page.panel.DeleteAsync(0); env.hud.clock.advance(1200);
    assert.ok(sandbox.messages.some(message => message.includes("temporary image failure")));
    assert.deepEqual(env.hud.clock.errors, []);
});

test("known profile bindings fail closed when temporarily missing instead of taking another account", () => {
    const env = fixture(), page = profile(env, "123"), row = heroRow(env, page.panel);
    isolate(env, page.panel, ["ql_profile_statlocker.js"]);
    env.config({ ENABLE_STATLOCKER: 1 });
    const button = row.core.FindChildrenWithClassTraverse("QOLStatlockerButton")[0];
    page.binding.SetParent(env.retired);
    env.text(page.panel, "", "999", ["AccountID", "HiddenAccountID"]);
    page.button._fire("onactivate"); button._fire("onactivate");
    assert.equal(env.urls.length, 0);
    env.hud.clock.advance(400); assert.equal(page.tools.BHasClass("QOLProfileToolsVisible"), false);
    assert.equal(page.image.currentImage, "");
});

test("profile card reuses current account, replaces alive bindings and has bounded idle work", () => {
    const env = fixture(), current = card(env, "123", true);
    assert.equal(current.display.text, "Friend ID: 123");
    current.binding.text = "456"; current.link._fire("onactivate");
    assert.equal(env.urls.at(-1), "https://statlocker.gg/profile/456");
    current.binding.text = ""; current.link._fire("onactivate"); assert.equal(env.urls.length, 1);
    assert.equal(current.display.text, "Friend ID:");
    current.link.SetParent(env.retired); current.binding.SetParent(env.retired);
    env.text(current.panel, "QOLProfileCardAccountID", "789", ["HiddenAccountID"]);
    const link = env.add(current.panel, "QOLStatlockerProfileCardLink", [], "Button");
    const display = env.text(link, "QOLStatlockerProfileCardLabel", "Friend ID:", ["AccountID"]);
    current.sandbox.global.$.ShowRankCardLoaded();
    assert.equal(display.text, "Friend ID: 789");
    current.link._fire("onactivate"); assert.equal(env.urls.length, 1);
    link._fire("onactivate"); assert.equal(env.urls.at(-1), "https://statlocker.gg/profile/789");
    const empty = card(env, "", true), dollar = empty.sandbox.global.$;
    let scheduled = 0;
    const schedule = dollar.Schedule; dollar.Schedule = (seconds, callback) => { scheduled++; return schedule(seconds, callback); };
    env.hud.clock.advance(12000); const settledCount = scheduled;
    env.hud.clock.advance(12000); assert.equal(scheduled, settledCount);
    empty.binding.text = "555"; empty.link._fire("onmouseover"); assert.equal(empty.display.text, "Friend ID: 555");
});

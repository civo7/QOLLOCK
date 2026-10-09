// tests/ui_friends.test.js
// =============================================================================
// Unit tests for friends list search filter (panorama/scripts/ui/friends.js)
// =============================================================================

"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const { Document } = require("../scripts/simulator/panel.js");
const { Clock } = require("../scripts/simulator/clock.js");

function createFriendsTestEnvironment() {
    const clock = new Clock(1000);
    const doc = new Document(clock);

    const root = doc.create("Panel", { id: "RootPanel" });
    const escapeMenu = doc.create("CitadelHudEscapeMenu", { id: "EscapeMenu" });
    root.addChild(escapeMenu);
    const list = doc.create("CitadelFriendsList", { id: "FriendsList" });
    root.addChild(list);

    const searchContainer = doc.create("Panel", { id: "FriendSearchContainer" });
    const searchInput = doc.create("TextEntry", { id: "FriendSearchInput" });
    searchInput.text = "";
    const searchClear = doc.create("Button", { id: "FriendSearchClear" });
    searchContainer.addChild(searchInput);
    searchContainer.addChild(searchClear);
    list.addChild(searchContainer);

    const categories = doc.create("Panel", { id: "FriendsCategories" });
    list.addChild(categories);

    // Category 1: Playing
    const cat1 = doc.create("Panel", { id: "CatPlaying" });
    const entries1 = doc.create("Panel", { id: "FriendEntries" });
    cat1.addChild(entries1);

    // Player 1: "Alice"
    const p1 = doc.create("Panel", { id: "Player1" });
    const userHost1 = doc.create("Panel", { id: "UserName" });
    const label1 = doc.create("Label", { id: "NameLabel1", text: "Alice In Wonderland" });
    userHost1.addChild(label1);
    p1.addChild(userHost1);
    entries1.addChild(p1);

    // Player 2: "Bob"
    const p2 = doc.create("Panel", { id: "Player2" });
    const userHost2 = doc.create("Panel", { id: "UserName" });
    const label2 = doc.create("Label", { id: "NameLabel2", text: "Bob The Builder" });
    userHost2.addChild(label2);
    p2.addChild(userHost2);
    entries1.addChild(p2);

    categories.addChild(cat1);

    const scheduled = [];
    const mockDollar = {
        Msg: () => {},
        Schedule: (delaySec, cb) => {
            scheduled.push({ delaySec, cb });
            return clock.schedule(delaySec, cb);
        },
        CancelScheduled: handle => clock.cancel(handle),
        GetContextPanel: () => escapeMenu,
    };

    const sandbox = {
        $: mockDollar,
        QOL: {
            ui: {}, core: {},
        },
        globalThis: null,
    };
    sandbox.globalThis = sandbox;

    vm.createContext(sandbox);
    for (const file of ["ql_utils.js", "core/ql_panel_helpers.js", "ui/friends.js"]) {
        vm.runInContext(fs.readFileSync(path.resolve(__dirname, "../panorama/scripts/", file), "utf8"), sandbox);
    }

    return {
        sandbox,
        doc,
        root,
        escapeMenu,
        list,
        searchContainer,
        clock,
        searchInput,
        searchClear,
        categories,
        p1,
        p2,
        scheduled,
    };
}

test("ui/friends: exports public API on QOL.ui.friends and globalThis", () => {
    const env = createFriendsTestEnvironment();
    const { friends } = env.sandbox.QOL.ui;

    assert.ok(friends, "QOL.ui.friends should exist");
    assert.strictEqual(typeof friends.filterFriendsList, "function");
    assert.strictEqual(typeof friends.clearFriendsSearch, "function");
    assert.strictEqual(typeof friends.bindFriendsSearchHandlers, "function");
    assert.strictEqual(typeof friends.ensureFriendsSearchHandlers, "function");

    assert.strictEqual(env.sandbox.QOLFilterFriendsList, friends.filterFriendsList);
    assert.strictEqual(env.sandbox.QOLClearFriendsSearch, friends.clearFriendsSearch);
    assert.strictEqual(env.sandbox.QOLBindFriendsSearchHandlers, friends.bindFriendsSearchHandlers);
    assert.strictEqual(env.sandbox.QOLEnsureFriendsSearchHandlers, friends.ensureFriendsSearchHandlers);
});

test("ui/friends: filterFriendsList matches player names and toggles clear button", () => {
    const env = createFriendsTestEnvironment();
    const { friends } = env.sandbox.QOL.ui;

    // Initially both visible
    friends.filterFriendsList();
    assert.strictEqual(env.p1.BHasClass("QOLFriendSearchHidden"), false);
    assert.strictEqual(env.p2.BHasClass("QOLFriendSearchHidden"), false);
    assert.strictEqual(env.searchContainer.BHasClass("showSearchClearButton"), false);

    // Search "Alice"
    env.searchInput.text = "Alice";
    friends.filterFriendsList();
    assert.strictEqual(env.p1.BHasClass("QOLFriendSearchHidden"), false);
    assert.strictEqual(env.p2.BHasClass("QOLFriendSearchHidden"), true);
    assert.strictEqual(env.searchContainer.BHasClass("showSearchClearButton"), true);

    // Search "Bob"
    env.searchInput.text = "bob";
    friends.filterFriendsList();
    assert.strictEqual(env.p1.BHasClass("QOLFriendSearchHidden"), true);
    assert.strictEqual(env.p2.BHasClass("QOLFriendSearchHidden"), false);
    assert.strictEqual(env.searchContainer.BHasClass("showSearchClearButton"), true);

    // Search non-matching
    env.searchInput.text = "charlie";
    friends.filterFriendsList();
    assert.strictEqual(env.p1.BHasClass("QOLFriendSearchHidden"), true);
    assert.strictEqual(env.p2.BHasClass("QOLFriendSearchHidden"), true);
    assert.strictEqual(env.searchContainer.BHasClass("showSearchClearButton"), true);
});

test("ui/friends: clearFriendsSearch resets query and restores visibility", () => {
    const env = createFriendsTestEnvironment();
    const { friends } = env.sandbox.QOL.ui;

    let clearedSelection = false;
    env.searchInput.ClearSelection = () => { clearedSelection = true; };

    env.searchInput.text = "Alice";
    friends.filterFriendsList();
    assert.strictEqual(env.p2.BHasClass("QOLFriendSearchHidden"), true);

    friends.clearFriendsSearch();
    assert.strictEqual(env.searchInput.text, "");
    assert.strictEqual(clearedSelection, true);
    assert.strictEqual(env.p1.BHasClass("QOLFriendSearchHidden"), false);
    assert.strictEqual(env.p2.BHasClass("QOLFriendSearchHidden"), false);
    assert.strictEqual(env.searchContainer.BHasClass("showSearchClearButton"), false);
});

test("ui/friends: bindFriendsSearchHandlers attaches event handlers", () => {
    const env = createFriendsTestEnvironment();
    const { friends } = env.sandbox.QOL.ui;

    const bound = friends.bindFriendsSearchHandlers();
    assert.strictEqual(bound, true);

    // Simulate typing
    env.searchInput.text = "alice";
    env.searchInput._fire("ontextentrychange");
    assert.strictEqual(env.p1.BHasClass("QOLFriendSearchHidden"), false);
    assert.strictEqual(env.p2.BHasClass("QOLFriendSearchHidden"), true);

    // Simulate clicking clear
    env.searchClear.activate();
    assert.strictEqual(env.searchInput.text, "");
    assert.strictEqual(env.p1.visible, true);
    assert.strictEqual(env.p2.visible, true);
});

test("friend search preserves native visibility and drives the actual clear-button CSS gate", () => {
    const env = createFriendsTestEnvironment(), api = env.sandbox.QOL.ui.friends;
    env.p1.visible = false;
    env.searchInput.text = "alice";
    api.filterFriendsList();
    assert.equal(env.p1.visible, false);
    assert.equal(env.p2.visible, true, "filtering owns a CSS class instead of the native visible flag");
    assert.equal(env.p2.BHasClass("QOLFriendSearchHidden"), true);
    assert.equal(env.searchClear.visible, true);
    assert.equal(env.searchContainer.BHasClass("showSearchClearButton"), true);
    const css = fs.readFileSync(path.resolve(__dirname, "../panorama/styles/friends_list_search.css"), "utf8");
    assert.match(css, /\.showSearchClearButton #FriendSearchClear\s*\{\s*visibility: visible;/);
    assert.match(css, /\.QOLFriendSearchHidden\s*\{\s*visibility: collapse;/);
    api.clearFriendsSearch();
    assert.equal(env.p1.visible, false, "clearing a query cannot reveal a natively hidden entry");
    assert.equal(env.p2.BHasClass("QOLFriendSearchHidden"), false);
});

function replaceFriendsList(env) {
    const retired = env.doc.create("Panel", { id: "RetiredFriends" });
    env.list.SetParent(retired);
    const list = env.doc.create("CitadelFriendsList", { id: "CurrentFriends" }); env.root.addChild(list);
    const host = env.doc.create("Panel", { classes: ["friendSearchContainer"] }); list.addChild(host);
    const input = env.doc.create("TextEntry", { id: "FriendSearchInput", text: "alice" }); host.addChild(input);
    const clear = env.doc.create("Button", { id: "FriendSearchClear" }); host.addChild(clear);
    const categories = env.doc.create("Panel", { id: "FriendsCategories" }); list.addChild(categories);
    const category = env.doc.create("Panel"); categories.addChild(category);
    const entries = env.doc.create("Panel", { id: "FriendEntries" }); category.addChild(entries);
    const entry = env.doc.create("Panel"); entries.addChild(entry);
    const name = env.doc.create("CitadelUserName", { id: "UserName" }); entry.addChild(name);
    const label = env.doc.create("Label", { text: "Bob" }); name.addChild(label);
    return { list, host, input, clear, entries, entry, label, retired };
}

test("friend search keeps one loop, follows live replacement and rejects retired callbacks", () => {
    const env = createFriendsTestEnvironment(), api = env.sandbox.QOL.ui.friends;
    env.searchInput.text = "alice";
    for (let i = 0; i < 5; i++) api.ensureFriendsSearchHandlers();
    assert.equal(env.clock.pendingCount(), 1);
    const oldClear = env.searchClear._events.get("onactivate"), oldChange = env.searchInput._events.get("ontextentrychange");
    const next = replaceFriendsList(env);
    oldClear(); oldChange();
    assert.equal(env.searchInput.text, "alice");
    assert.equal(next.input.text, "alice");
    env.clock.advance(500);
    assert.equal(env.p2.BHasClass("QOLFriendSearchHidden"), false);
    assert.equal(env.searchContainer.BHasClass("showSearchClearButton"), false);
    assert.equal(next.entry.BHasClass("QOLFriendSearchHidden"), true);
    assert.equal(next.host.BHasClass("showSearchClearButton"), true);
    assert.equal(env.clock.pendingCount(), 1);
    oldClear(); assert.equal(next.input.text, "alice");
    next.clear.activate();
    assert.equal(next.input.text, "");
    assert.equal(next.entry.BHasClass("QOLFriendSearchHidden"), false);
    api.dispose();
    assert.equal(env.clock.pendingCount(), 0);
    next.input.text = "z"; next.input._fire("ontextentrychange");
    assert.equal(next.entry.BHasClass("QOLFriendSearchHidden"), false);
    assert.equal(next.host.BHasClass("showSearchClearButton"), false);
    assert.equal(api.filterFriendsList(), false);
});

test("friend search discovers late lists and names and retries failed class writes and retirement", () => {
    const env = createFriendsTestEnvironment(), api = env.sandbox.QOL.ui.friends;
    const retired = env.doc.create("Panel"); env.list.SetParent(retired);
    api.ensureFriendsSearchHandlers();
    assert.equal(env.clock.pendingCount(), 1);
    env.list.SetParent(env.root); env.searchInput.text = "alice";
    const nativeSet = env.p2.SetHasClass.bind(env.p2);
    let fail = true;
    env.p2.SetHasClass = (name, value) => { if (fail) throw Error("native class rejected"); return nativeSet(name, value); };
    env.clock.advance(500);
    assert.equal(env.p2.BHasClass("QOLFriendSearchHidden"), false);
    fail = false; env.clock.advance(500);
    assert.equal(env.p2.BHasClass("QOLFriendSearchHidden"), true);
    env.p2.FindChildTraverse("NameLabel2").text = "Alice too";
    env.clock.advance(500);
    assert.equal(env.p2.BHasClass("QOLFriendSearchHidden"), false, "native name rebinding is observed with the same query");
    env.p2.FindChildTraverse("NameLabel2").text = "Bob"; env.clock.advance(500);
    fail = true;
    const next = replaceFriendsList(env); env.clock.advance(500);
    assert.equal(env.p2.BHasClass("QOLFriendSearchHidden"), true, "rejected retirement stays tracked");
    assert.equal(next.entry.BHasClass("QOLFriendSearchHidden"), true);
    fail = false; env.clock.advance(500);
    assert.equal(env.p2.BHasClass("QOLFriendSearchHidden"), false);
    next.label.text = ""; env.clock.advance(500);
    assert.equal(next.entry.BHasClass("QOLFriendSearchHidden"), false, "unknown native names remain readable until evidence arrives");
    next.label.text = "Bob"; env.clock.advance(500);
    assert.equal(next.entry.BHasClass("QOLFriendSearchHidden"), true);
    api.dispose(); assert.equal(env.clock.pendingCount(), 0);
    assert.deepEqual(env.clock.errors, []);
});

test("friend search stops with its escape context and reload releases the previous controller", () => {
    const env = createFriendsTestEnvironment(), old = env.sandbox.QOL.ui.friends;
    env.searchInput.text = "alice"; old.ensureFriendsSearchHandlers();
    const oldHandler = env.searchInput._events.get("ontextentrychange");
    vm.runInContext(fs.readFileSync(path.resolve(__dirname, "../panorama/scripts/ui/friends.js"), "utf8"), env.sandbox);
    assert.equal(env.clock.pendingCount(), 0);
    assert.equal(env.p2.BHasClass("QOLFriendSearchHidden"), false);
    oldHandler(); assert.equal(env.p2.BHasClass("QOLFriendSearchHidden"), false);
    const api = env.sandbox.QOL.ui.friends; api.ensureFriendsSearchHandlers();
    assert.equal(env.clock.pendingCount(), 1);
    env.escapeMenu.DeleteAsync(0); env.clock.advance(500);
    assert.equal(env.clock.pendingCount(), 0);
    assert.equal(env.p2.BHasClass("QOLFriendSearchHidden"), false);
    assert.equal(api.ensureFriendsSearchHandlers(), false);
    assert.deepEqual(env.clock.errors, []);
});

test("friend search rejects unrelated same-ID inputs instead of mixing native list sources", () => {
    const env = createFriendsTestEnvironment(), api = env.sandbox.QOL.ui.friends;
    env.searchContainer.SetParent(env.escapeMenu);
    env.searchInput.text = "alice";
    assert.equal(api.bindFriendsSearchHandlers(), false);
    assert.equal(env.p2.BHasClass("QOLFriendSearchHidden"), false);
    assert.equal(env.searchInput._events.size, 0);
});

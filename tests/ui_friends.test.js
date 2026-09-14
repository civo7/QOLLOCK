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

const { Panel, Document } = require("../scripts/simulator/panel.js");
const { Clock } = require("../scripts/simulator/clock.js");

function createFriendsTestEnvironment() {
    const clock = new Clock(1000);
    const doc = new Document(clock);

    const root = doc.create("Panel", { id: "RootPanel" });
    const escapeMenu = doc.create("CitadelHudEscapeMenu", { id: "EscapeMenu" });
    root.addChild(escapeMenu);

    const searchContainer = doc.create("Panel", { id: "FriendSearchContainer" });
    const searchInput = doc.create("TextEntry", { id: "FriendSearchInput" });
    searchInput.text = "";
    const searchClear = doc.create("Button", { id: "FriendSearchClear" });
    searchClear.visible = false;
    searchContainer.addChild(searchInput);
    searchContainer.addChild(searchClear);
    escapeMenu.addChild(searchContainer);

    const categories = doc.create("Panel", { id: "FriendsCategories" });
    escapeMenu.addChild(categories);

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
        },
        GetContextPanel: () => escapeMenu,
    };

    const sandbox = {
        $: mockDollar,
        QOL: {
            ui: {},
        },
        globalThis: null,
    };
    sandbox.globalThis = sandbox;

    const fullPath = path.resolve(__dirname, "../panorama/scripts/ui/friends.js");
    const code = fs.readFileSync(fullPath, "utf8");
    vm.runInNewContext(code, sandbox);

    return {
        sandbox,
        doc,
        root,
        escapeMenu,
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
    assert.strictEqual(env.p1.visible, true);
    assert.strictEqual(env.p2.visible, true);
    assert.strictEqual(env.searchClear.visible, false);

    // Search "Alice"
    env.searchInput.text = "Alice";
    friends.filterFriendsList();
    assert.strictEqual(env.p1.visible, true);
    assert.strictEqual(env.p2.visible, false);
    assert.strictEqual(env.searchClear.visible, true);

    // Search "Bob"
    env.searchInput.text = "bob";
    friends.filterFriendsList();
    assert.strictEqual(env.p1.visible, false);
    assert.strictEqual(env.p2.visible, true);
    assert.strictEqual(env.searchClear.visible, true);

    // Search non-matching
    env.searchInput.text = "charlie";
    friends.filterFriendsList();
    assert.strictEqual(env.p1.visible, false);
    assert.strictEqual(env.p2.visible, false);
    assert.strictEqual(env.searchClear.visible, true);
});

test("ui/friends: clearFriendsSearch resets query and restores visibility", () => {
    const env = createFriendsTestEnvironment();
    const { friends } = env.sandbox.QOL.ui;

    let clearedSelection = false;
    env.searchInput.ClearSelection = () => { clearedSelection = true; };

    env.searchInput.text = "Alice";
    friends.filterFriendsList();
    assert.strictEqual(env.p2.visible, false);

    friends.clearFriendsSearch();
    assert.strictEqual(env.searchInput.text, "");
    assert.strictEqual(clearedSelection, true);
    assert.strictEqual(env.p1.visible, true);
    assert.strictEqual(env.p2.visible, true);
    assert.strictEqual(env.searchClear.visible, false);
});

test("ui/friends: bindFriendsSearchHandlers attaches event handlers", () => {
    const env = createFriendsTestEnvironment();
    const { friends } = env.sandbox.QOL.ui;

    const bound = friends.bindFriendsSearchHandlers();
    assert.strictEqual(bound, true);

    // Simulate typing
    env.searchInput.text = "alice";
    env.searchInput._fire("ontextentrychange");
    assert.strictEqual(env.p1.visible, true);
    assert.strictEqual(env.p2.visible, false);

    // Simulate clicking clear
    env.searchClear.activate();
    assert.strictEqual(env.searchInput.text, "");
    assert.strictEqual(env.p1.visible, true);
    assert.strictEqual(env.p2.visible, true);
});

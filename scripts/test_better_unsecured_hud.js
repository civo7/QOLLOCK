"use strict";

var assert = require("assert");
var path = require("path");

function Panel(id, parent) {
    this.id = id;
    this.parent = null;
    this.children = [];
    this.style = {};
    this.valid = true;
    this.classes = {};
    if (parent) this.SetParent(parent);
}

Panel.prototype.IsValid = function() { return this.valid; };
Panel.prototype.GetParent = function() { return this.parent; };
Panel.prototype.GetChildCount = function() { return this.children.length; };
Panel.prototype.GetChild = function(index) { return this.children[index] || null; };
Panel.prototype.SetParent = function(parent) {
    if (this.parent) {
        var oldIndex = this.parent.children.indexOf(this);
        if (oldIndex >= 0) this.parent.children.splice(oldIndex, 1);
    }
    this.parent = parent;
    if (parent) parent.children.push(this);
};
Panel.prototype.FindChildTraverse = function(id) {
    for (var i = 0; i < this.children.length; i++) {
        if (this.children[i].id === id) return this.children[i];
        var nested = this.children[i].FindChildTraverse(id);
        if (nested) return nested;
    }
    return null;
};
Panel.prototype.MoveChildBefore = function(panel, anchor) {
    panel.SetParent(this);
    this.children.splice(this.children.indexOf(panel), 1);
    this.children.splice(this.children.indexOf(anchor), 0, panel);
};
Panel.prototype.MoveChildAfter = function(panel, anchor) {
    panel.SetParent(this);
    this.children.splice(this.children.indexOf(panel), 1);
    this.children.splice(this.children.indexOf(anchor) + 1, 0, panel);
};
Panel.prototype.SetHasClass = function(name, enabled) { this.classes[name] = !!enabled; };
Panel.prototype.DeleteAsync = function() {
    this.valid = false;
    if (this.parent) {
        var index = this.parent.children.indexOf(this);
        if (index >= 0) this.parent.children.splice(index, 1);
    }
    this.parent = null;
};

function invalidateTree(panel) {
    panel.valid = false;
    for (var i = 0; i < panel.children.length; i++) invalidateTree(panel.children[i]);
}

function createHud(root, suffix) {
    var host = new Panel("gameplay_hud", root);
    var nativeParent = new Panel("NativeCurrencyParent" + suffix, host);
    var before = new Panel("Before" + suffix, nativeParent);
    var unsecured = new Panel("HudUnsecuredLabelContainer", nativeParent);
    var label = new Panel("HudUnsecuredLabel", unsecured);
    var after = new Panel("After" + suffix, nativeParent);
    unsecured.style.horizontalAlign = "right";
    unsecured.style.verticalAlign = "bottom";
    unsecured.style.x = "7px";
    unsecured.style.y = "9px";
    unsecured.style.uiScale = "87%";
    unsecured.style.visibility = "collapse";
    return {
        host: host,
        nativeParent: nativeParent,
        before: before,
        unsecured: unsecured,
        label: label,
        after: after
    };
}

var registered = null;
var pollTick = null;
var root = new Panel("Root", null);
var first = createHud(root, "One");
var config = {
    ENABLE_BETTER_UNSECURED: 1,
    UNSECURED_SOULS_HUD_SCALE: 120,
    UNSECURED_SOULS_HUD_X_OFFSET: 120,
    UNSECURED_SOULS_HUD_Y_OFFSET: 925
};

global.QOL = {
    utils: { IsPanelValid: function(panel) { return !!(panel && panel.IsValid()); } },
    getGameplayHudPanel: function(panel) { return panel.FindChildTraverse("gameplay_hud"); },
    core: {
        FeatureRegistry: { register: function(definition) { registered = definition; } },
        Logger: { logError: function() {}, clearThrottle: function() {} },
        Scheduler: {
            createPollLoop: function(tick) {
                pollTick = tick;
                tick();
                return { stop: function() {} };
            },
            cancelAllForFeature: function() {}
        }
    }
};
global.$ = {
    GetContextPanel: function() { return root; },
    Msg: function() {}
};

require(path.join(__dirname, "..", "panorama", "scripts", "manifests", "ql_better_unsecured_hud", "manifest.js"));
assert(registered, "manifest should register");

var feature = registered.create({ config: { all: function() { return config; } } });
feature.onEnable();

assert.strictEqual(first.unsecured.GetParent(), first.host, "live panel should move under gameplay_hud");
assert.strictEqual(first.unsecured.style.x, "120px");
assert.strictEqual(first.unsecured.style.y, "925px");
assert.strictEqual(first.unsecured.style.uiScale, "120%");
assert.strictEqual(first.unsecured.style.visibility, "collapse", "game visibility must remain native-controlled");

config.UNSECURED_SOULS_HUD_X_OFFSET = 500;
config.UNSECURED_SOULS_HUD_Y_OFFSET = 1000;
config.UNSECURED_SOULS_HUD_SCALE = 150;
feature.onSettingsChanged();
assert.strictEqual(first.unsecured.style.x, "500px");
assert.strictEqual(first.unsecured.style.y, "1000px");
assert.strictEqual(first.unsecured.style.uiScale, "150%");

feature.onDisable();
assert.strictEqual(first.unsecured.GetParent(), first.nativeParent, "disable should restore native parent");
assert.deepStrictEqual(first.nativeParent.children, [first.before, first.unsecured, first.after], "disable should restore sibling order");
assert.strictEqual(first.unsecured.style.horizontalAlign, "right");
assert.strictEqual(first.unsecured.style.verticalAlign, "bottom");
assert.strictEqual(first.unsecured.style.x, "7px");
assert.strictEqual(first.unsecured.style.y, "9px");
assert.strictEqual(first.unsecured.style.uiScale, "87%");
assert.strictEqual(first.unsecured.style.visibility, "collapse");

config.ENABLE_BETTER_UNSECURED = 1;
feature.onEnable();
invalidateTree(first.host);
first.host.parent = null;
root.children.splice(root.children.indexOf(first.host), 1);
var second = createHud(root, "Two");
pollTick();
assert.strictEqual(second.unsecured.GetParent(), second.host, "replacement HUD panel should be adopted");
assert.strictEqual(second.unsecured.style.x, "500px");
assert.strictEqual(second.unsecured.style.y, "1000px");

feature.onDisable();
assert.strictEqual(second.unsecured.GetParent(), second.nativeParent, "replacement panel should also restore");

console.log("Unsecured Plus regression test passed.");

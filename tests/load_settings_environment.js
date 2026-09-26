"use strict";

const assert = require("node:assert/strict");
const { createHud, Sandbox, layout } = require("../scripts/simulator");

// Production XML script order, two JS isolates, shared bridge attributes.
// Panels/events remain a model; this does not validate Panorama rendering.
module.exports = function loadSettingsEnvironment() {
    const hud = createHud({ inHideout: false });
    hud.assertLoaded();
    const { doc, clock } = hud;
    const em = doc.create("CitadelHudEscapeMenu", { id: "EscapeMenu" });
    doc.root.addChild(em);
    const win = doc.create("Panel", { id: "SettingsWindow" });
    em.addChild(win);
    const header = doc.create("Panel", { id: "SettingsHeader" });
    win.addChild(header);
    header.addChild(doc.create("Button", { id: "CloseBtn" }));
    const body = doc.create("Panel", { id: "SettingsBody" });
    win.addChild(body);
    const list = doc.create("Panel", { id: "SettingsList" });
    body.addChild(list);
    const settings = new Sandbox({ clock, doc, name: "settings" });
    settings.global.$.GetContextPanel = () => em;
    const includes = layout.settingsScripts();
    assert.deepEqual(includes.missing, []);
    for (const script of includes.scripts) settings.load(script.absPath);
    assert.deepEqual(settings.loadErrors, []);
    return { hud, settings, global: settings.global, doc, clock, em, list };
};

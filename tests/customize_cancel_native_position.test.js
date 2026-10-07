"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const load = require("./load_settings_environment");
const startDrag = require("./customize_drag_fixture");

function fixture(id = "healthbar") {
    const env = load();
    const element = env.global.QOL.presentation.elements.find(item => item.id === id);
    let panel = env.hud.root;
    for (const segment of element.path) {
        panel = panel.addChild(env.doc.create("Panel", { id: typeof segment === "string" ? segment : "", classes: typeof segment === "string" ? [] : [segment.className] }));
    }
    Object.assign(panel, { actuallayoutwidth: 300, actuallayoutheight: 456, actualuiscale_x: 1.2, actualuiscale_y: 1.2 });
    const physical = { x: 0, y: 0 };
    const clears = [];
    panel.style = new Proxy(panel.style, {
        set(target, key, value) {
            target[key] = value;
            if (key === "x" || key === "y") physical[key] = parseFloat(value) || 0;
            return true;
        }
    });
    const clear = panel.ClearPropertyFromCode.bind(panel);
    panel.ClearPropertyFromCode = key => {
        clears.push(key);
        // Fault injection: removing JS x/y records must not be considered
        // evidence that native position actually relaid out. Composite position
        // is visible in the captured native computed style; no CSS renderer is
        // implemented by this fixture.
        if (key === "position") physical.x = physical.y = 0;
        return clear(key);
    };
    env.global.QOL.ui.window.setOpen(true); env.clock.advance(500);
    const raw = env.hud.root.GetAttributeString("Deadlock_Mod_Settings_v1", "");
    const canonical = JSON.stringify(env.global.MOD_CONFIG);
    env.global.QOL.ui.customize.start(null, { elementId: id });
    return { env, panel, physical, clears, raw, canonical };
}

function move(env, id = "healthbar") {
    const frame = env.em.FindChildTraverse("QOLCustomizeFrame_" + id);
    const proxy = startDrag(env, frame);
    proxy.actualxoffset += 160; proxy.actualyoffset -= 90;
    env.global.$.DispatchEvent("DragEnd", frame, proxy); env.clock.advance(1200);
}

test("Souls Cancel also restores layout when removing x/y records does not relayout", () => {
    const { env, physical, canonical } = fixture("souls");
    move(env, "souls");
    assert.deepEqual(physical, { x: 160, y: -90 });
    env.em.FindChildTraverse("QOLCustomizeCancel")._fire("onactivate"); env.clock.advance(1200);
    assert.deepEqual(physical, { x: 0, y: 0 });
    assert.equal(JSON.stringify(env.global.MOD_CONFIG), canonical);
    assert.deepEqual(env.doc.eventErrors, []);
    assert.deepEqual(env.clock.errors, []);
});
function nativeHandlers() {
    const xml = fs.readFileSync(path.join(__dirname, "../panorama/layout/hud_escape_menu.xml"), "utf8");
    return {
        root: xml.match(/<CitadelHudEscapeMenu oncancel="([^"]+)"/)[1].replace(/&amp;/g, "&"),
        binding: xml.match(/<CitadelBindingButton id="EscapeButton"[^>]*onactivate="([^"]+)"/)[1].replace(/&amp;/g, "&")
    };
}

for (const exit of ["Cancel", "overlay", "window", "binding", "root"]) {
    test(`HP drag ${exit}: restores physical position and canonical config, cancels pending input`, () => {
        const { env, panel, physical, clears, raw, canonical } = fixture();
        const { global: g, clock } = env;
        move(env);
        assert.deepEqual(physical, { x: 160, y: -90 });
        const pending = env.em.FindChildTraverse("QOLCustomize_PLAYER_HEALTHBAR_X_OFFSET");
        pending.text = "777";
        let resumes = 0;
        const callNative = source => vm.runInNewContext(source, { $: g.$, CitadelResumePlaying: () => { resumes++; } });
        const handlers = nativeHandlers();
        if (exit === "Cancel") env.em.FindChildTraverse("QOLCustomizeCancel")._fire("onactivate");
        else if (exit === "overlay") env.em.FindChildTraverse("QOLCustomizeEditor")._fire("oncancel");
        else if (exit === "window") env.em.FindChildTraverse("SettingsWindow")._fire("oncancel");
        else callNative(handlers[exit]);
        assert.equal(g.QOL.ui.customize.isRunning(), false);
        assert.equal(g.QOL.ui.window.isOpen(), true, "first Escape returns to settings");
        if (exit !== "Cancel") {
            // The same native MenuBack can reach all three targets in one frame.
            env.em.FindChildTraverse("SettingsWindow")._fire("oncancel");
            callNative(handlers.binding); callNative(handlers.root);
            assert.equal(g.QOL.ui.window.isOpen(), true);
            assert.equal(resumes, 0);
        }
        pending._fire("onblur"); clock.advance(1200);
        assert.deepEqual(physical, { x: 0, y: 0 });
        assert.ok(clears.includes("position"), "release the composite native position");
        assert.equal(panel.style.x, undefined);
        assert.equal(panel.style.y, undefined);
        assert.equal(JSON.stringify(g.MOD_CONFIG), canonical);
        assert.equal(env.hud.root.GetAttributeString("Deadlock_Mod_Settings_v1", ""), raw);
        assert.equal(env.hud.sandbox.global.QOL.core.ConfigStore.get("ql_healthbar", "PLAYER_HEALTHBAR_X_OFFSET"), 0);
        if (exit !== "Cancel") {
            env.em.FindChildTraverse("SettingsWindow")._fire("oncancel");
            assert.equal(g.QOL.ui.window.isOpen(), false, "next Escape closes settings");
            clock.advance(150); callNative(handlers.root);
            assert.equal(resumes, 1, "native menu can still resume after customization");
        }
        assert.deepEqual(env.doc.eventErrors, []);
        assert.deepEqual(clock.errors, []);
    });
}

test("HP reset and Undo restore layout; Cancel restores a previously saved nonzero position", () => {
    const { env, physical } = fixture();
    const { global: g, clock } = env;
    g.QOL.ui.customize.stop(); clock.advance(1200);
    g.MOD_CONFIG.PLAYER_HEALTHBAR_X_OFFSET = 60;
    g.MarkConfigDirty(); g.FlushPendingSave(); clock.advance(1200);
    assert.equal(physical.x, 60);
    g.QOL.ui.customize.start(null, { elementId: "healthbar" }); move(env);
    env.em.FindChildTraverse("QOLCustomizeReset")._fire("onactivate"); clock.advance(1200);
    assert.deepEqual(physical, { x: 0, y: 0 });
    env.em.FindChildTraverse("QOLCustomizeUndo")._fire("onactivate"); clock.advance(1200);
    assert.equal(physical.x, 220);
    env.em.FindChildTraverse("QOLCustomizeCancel")._fire("onactivate"); clock.advance(1200);
    assert.deepEqual(physical, { x: 60, y: 0 });
    assert.equal(g.MOD_CONFIG.PLAYER_HEALTHBAR_X_OFFSET, 60);
});

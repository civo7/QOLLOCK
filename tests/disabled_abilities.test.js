"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createHud } = require("../scripts/simulator");

const read = file => fs.readFileSync(path.join(__dirname, "../panorama", file), "utf8");
const gate = "better_disabled_abilities_active";

test("disabled presentation follows settings and registry exclusion without observing native icons", () => {
    const env = createHud({ inHideout: false }); env.assertLoaded();
    const Q = env.sandbox.global.QOL, registry = Q.core.FeatureRegistry;
    Q.core.ConfigAdapter.loadFromFlat({ ...Q.buildDefaultConfig(), ENABLE_BETTER_DISABLED_ABILITIES: 1,
        ENABLE_HIDE_MAGAZINE: 1 });
    assert.equal(registry.isEnabled("ql_disabled_abilities"), true);
    assert.equal(env.root.BHasClass(gate), true);
    assert.equal(env.root.BHasClass("hide_magazine_active"), true, "project the complete config");
    assert.equal(Q.core.Scheduler.getWorkSnapshot().some(owner => owner.id === "ql_disabled_abilities"), false);
    registry.disable("ql_disabled_abilities");
    assert.equal(env.root.BHasClass(gate), false, "diagnostic exclusion releases CSS presentation");
    assert.equal(Q.core.ConfigStore.get("ql_disabled_abilities", "ENABLE_BETTER_DISABLED_ABILITIES"), true);
    registry.enable("ql_disabled_abilities");
    assert.equal(env.root.BHasClass(gate), true);
    Q.core.ConfigStore.set("ql_disabled_abilities", "ENABLE_BETTER_DISABLED_ABILITIES", false);
    assert.equal(env.root.BHasClass(gate), false);
    Q.core.ConfigStore.set("ql_disabled_abilities", "ENABLE_BETTER_DISABLED_ABILITIES", true);
    assert.equal(env.root.BHasClass(gate), true);
    const nextRoot = env.sandbox.global.$.CreatePanel("CitadelHud", null, "Hud");
    env.doc.root = nextRoot;
    Q.core.hud.refreshRootClasses(nextRoot);
    assert.equal(nextRoot.BHasClass(gate), true, "a new HUD inherits the accepted setting before icons exist");
    assert.equal(env.root.BHasClass(gate), false, "a still-live old HUD releases the presentation gate");
    env.clock.advance(1500);
    assert.equal(Q.core.Scheduler.getWorkSnapshot().some(owner => owner.id === "ql_disabled_abilities"), false);
    assert.deepEqual(env.clock.errors, []);
});

test("native templates carry a noninteractive cross beside their image and preserve native masks and bindings", () => {
    for (const [file, host] of [["hud_ability_icon.xml", "image_container"], ["hud_ability_icon_active.xml", "iconContainer"]]) {
        assert.ok(fs.existsSync(path.join(__dirname, "../panorama/layout", file)), "native template override exists");
        const xml = read("layout/" + file);
        const imageHost = xml.match(new RegExp(`<Panel class="${host}">((?:(?!</Panel>)[\\s\\S])*?)</Panel>`));
        assert.ok(imageHost, "image host exists");
        assert.match(imageHost[1], /<Image id="ability_image"[^>]+\/>/);
        assert.match(imageHost[1], /<!-- ==== QOLLOCK disabled ability cross ==== -->\s*<Panel id="QOLDisabledXOverlay" hittest="false" hittestchildren="false">\s*<Panel id="QOLDisabledXBar0" hittest="false"\s*\/>\s*<Panel id="QOLDisabledXBar1" hittest="false"\s*\/>/);
        assert.equal((xml.match(/id="QOLDisabledXOverlay"/g) || []).length, 1);
        assert.match(xml, /<Panel id="cooldown_mask"\s*\/>/);
        assert.match(xml, /<CitadelBinding id="ability_binding_component" show_single_bind="true" compact="true"\s*\/>/);
        assert.match(xml, new RegExp(`panorama/styles/${file.replace(".xml", "")}\\.vcss`));
    }
});

test("disabled CSS stays in component chains and scopes native disabled effects to HUD signature and active-item owners", () => {
    for (const file of ["hud_ability_icon.css", "hud_ability_icon_active.css"]) {
        assert.match(read("styles/" + file), /@import url\("s2r:\/\/panorama\/styles\/features\/ql_feat_disabled_abilities\.vcss_c"\)/);
    }
    const css = read("styles/features/ql_feat_disabled_abilities.css");
    const effects = [...css.matchAll(/([^{}]+)\{([^{}]+)\}/g)].filter(([, , body]) => /wash-color|visibility:\s*visible/.test(body));
    assert.equal(effects.length, 3);
    for (const [, selectors] of effects) {
        for (const selector of selectors.trim().split(",")) {
            assert.match(selector, /\.better_disabled_abilities_active #AbilitiesContainer (?:#hud_signature #abilities > CitadelAbilityIcon|#ActiveAbilitiesMenu #abilitiesContainer > DraggableAbilityIcon)\.disabled/);
        }
    }
    assert.doesNotMatch(css, /cooldown_mask|!important|qol-better-disabled/);
    assert.match(css, /box-shadow:\s*0px 0px 6px 2px black/);
    assert.match(css, /height:\s*14px/);
    assert.match(css, /height:\s*12px/);
});

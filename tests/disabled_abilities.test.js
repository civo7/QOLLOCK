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

test("disabled decoration leaves native ability layouts supplied by the game", () => {
    const upstream = JSON.parse(fs.readFileSync(path.join(__dirname, "../upstream.json"), "utf8"));
    for (const file of ["hud_ability_icon.xml", "hud_ability_icon_active.xml"]) {
        assert.equal(fs.existsSync(path.join(__dirname, "../panorama/layout", file)), false);
        assert.equal(upstream.files["layout/" + file], undefined, "sync must not restore the retired override");
    }
});

test("disabled CSS stays in component chains and scopes native disabled effects to HUD signature and active-item owners", () => {
    for (const file of ["hud_ability_icon.css", "hud_ability_icon_active.css"]) {
        assert.match(read("styles/" + file), /@import url\("s2r:\/\/panorama\/styles\/features\/ql_feat_disabled_abilities\.vcss_c"\)/);
    }
    const css = read("styles/features/ql_feat_disabled_abilities.css").replace(/\/\*[\s\S]*?\*\//g, "");
    const effects = [...css.matchAll(/([^{}]+)\{([^{}]+)\}/g)];
    assert.ok(effects.length > 0);
    for (const [, selectors] of effects) {
        for (const selector of selectors.trim().split(",")) {
            assert.match(selector, /\.better_disabled_abilities_active(?:\.minecraft_healthbar_active)? #AbilitiesContainer (?:#hud_signature #abilities > CitadelAbilityIcon|#ActiveAbilitiesMenu #abilitiesContainer > DraggableAbilityIcon)\.disabled/);
        }
    }
    assert.doesNotMatch(css, /cooldown_mask|corruptedBorder|!important|QOLDisabledX|pre-transform-scale2d\s*:/,
        "cooldown, corruption and the native toggle scale stay with their owners");
    for (const [, , body] of effects) for (const [, resource] of body.matchAll(/url\("s2r:\/\/panorama\/([^" ]+)\.vsvg"\)/g)) {
        assert.ok(fs.existsSync(path.join(__dirname, "../panorama", resource + ".svg")), "cross resource exists");
    }
});

test("disabled crosses share the native toggle surface without hiding an enabled toggle border", () => {
    // Exercise the emitted state selectors only; this does not model Panorama rendering/cascade.
    const css = read("styles/features/ql_feat_disabled_abilities.css").replace(/\/\*[\s\S]*?\*\//g, "");
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]+)\}/g)]
        .flatMap(([, selectors, body]) => selectors.split(",").map(selector => ({ selector: selector.trim(), body })))
        .filter(rule => rule.selector.endsWith(" #active_toggle"));
    for (const type of ["CitadelAbilityIcon", "DraggableAbilityIcon"]) {
        for (const toggled of [false, true]) {
            const applicable = rules.filter(({ selector }) => selector.includes(type + ".disabled") &&
                !selector.includes(".minecraft_healthbar_active") && (toggled ? !selector.includes(":not(.toggled_on)") : true));
            const body = applicable.map(rule => rule.body).join("\n");
            assert.match(body, /opacity:\s*1;/);
            assert.match(body, /background-image:\s*url\(/);
            assert.match(body, /z-index:\s*500;/, "cross paints above the native ability image");
            if (toggled) assert.doesNotMatch(body, /\bborder(?:-color)?:|\bbox-shadow:/,
                "disabled+toggled preserves the native yellow border and glow");
            else {
                assert.match(body, /border-color:\s*transparent;/);
                assert.match(body, /box-shadow:\s*none;/);
            }
        }
    }
});

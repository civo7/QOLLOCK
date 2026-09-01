// tests/healthbar_style.test.js
// =============================================================================
// The player-healthbar runtime must not clobber the game's own ui-scale.
// =============================================================================
// base/hud.css:420 declares `#health_and_abilities_container { ui-scale: 120% }`
// (104% under .support_16_10_active, features/ql_feat_aspect_ratio.css:179).
//
// The runtime helper only runs when at least one player-healthbar key is
// non-default (HasNonDefaultPlayerHealthbarRuntimeConfig, ql_core.js:2720), so
// moving the Opacity slider is what makes it run for the first time. If it then
// writes ui-scale itself, the bar silently drops to 100/120 = 83% and — because
// the panel is centred off a 1290px right margin — visibly shifts. Reported
// in-game as "small opacity makes the healthbar small and shifted left".
//
// ui-scale belongs to CSS. The mod's own scale factor goes through
// pre-transform-scale2d, which composes with it instead of replacing it.
// =============================================================================

"use strict";

const test = require("node:test");
const assert = require("node:assert");

const sim = require("../scripts/simulator/index.js");

/** Panel stand-in that records every style write, including clears. */
function recordingPanel() {
    const writes = [];
    const style = new Proxy({}, {
        set(target, prop, value) {
            writes.push({ prop: String(prop), value: value });
            target[prop] = value;
            return true;
        },
        deleteProperty(target, prop) {
            writes.push({ prop: String(prop), value: "(deleted)" });
            delete target[prop];
            return true;
        },
    });
    return {
        style,
        writes,
        /** Last value written for a property, or undefined if never written. */
        last(prop) {
            for (let i = writes.length - 1; i >= 0; i--) {
                if (writes[i].prop === prop) return writes[i].value;
            }
            return undefined;
        },
        touched(prop) { return writes.some((w) => w.prop === prop); },
        /** True when the property was written and left holding a real value. */
        forced(prop) {
            const v = this.last(prop);
            return v !== undefined && v !== "" && v !== null && v !== "(deleted)";
        },
    };
}

function healthbarApi() {
    const h = sim.createHud({ inHideout: true });
    h.assertLoaded();
    const QOL = h.sandbox.global.QOL;
    assert.ok(QOL.healthbar, "QOL.healthbar namespace missing after boot");
    return {
        build: QOL.healthbar.buildPlayerHealthbarStyleState,
        apply: QOL.healthbar.applyPlayerStyleToPanel,
        resetScaleOpacity: QOL.healthbar.resetPlayerScaleOpacity,
    };
}

const DEFAULTS = {
    PLAYER_HEALTHBAR_SCALE: 100,
    PLAYER_HEALTHBAR_OPACITY: 1.0,
    PLAYER_HEALTHBAR_X_OFFSET: 0,
    PLAYER_HEALTHBAR_Y_OFFSET: 0,
};

test("opacity alone never writes ui-scale", () => {
    const api = healthbarApi();
    const panel = recordingPanel();
    const cfg = Object.assign({}, DEFAULTS, { PLAYER_HEALTHBAR_OPACITY: 0.63 });

    api.apply(panel, api.build(cfg, false, false), true);

    assert.ok(!panel.forced("uiScale"),
        `ui-scale was forced to ${JSON.stringify(panel.last("uiScale"))}; ` +
        "the game's 120% must survive an opacity-only change");
    assert.strictEqual(panel.last("opacity"), "0.63", "opacity should still be applied");
});

test("size 100 leaves scale untouched, size 150 goes through pre-transform-scale2d", () => {
    const api = healthbarApi();

    const at100 = recordingPanel();
    api.apply(at100, api.build(Object.assign({}, DEFAULTS, { PLAYER_HEALTHBAR_OPACITY: 0.5 }), false, false), true);
    assert.ok(!at100.forced("preTransformScale2d"),
        "at size 100 the mod must not force a scale either");

    const at150 = recordingPanel();
    api.apply(at150, api.build(Object.assign({}, DEFAULTS, { PLAYER_HEALTHBAR_SCALE: 150 }), false, false), true);
    assert.ok(!at150.forced("uiScale"),
        `size 150 wrote ui-scale ${JSON.stringify(at150.last("uiScale"))}; ` +
        "the mod's factor belongs in pre-transform-scale2d");
    assert.strictEqual(at150.last("preTransformScale2d"), "1.50, 1.50",
        "size 150 should scale via pre-transform-scale2d");
});

test("all-default config forces nothing", () => {
    const api = healthbarApi();
    const panel = recordingPanel();

    api.apply(panel, api.build(Object.assign({}, DEFAULTS), false, false), true);

    for (const prop of ["uiScale", "preTransformScale2d", "opacity", "x", "y"]) {
        assert.ok(!panel.forced(prop),
            `default config forced ${prop}=${JSON.stringify(panel.last(prop))}`);
    }
});

test("reset hands ui-scale and opacity back to CSS", () => {
    const api = healthbarApi();
    const panel = recordingPanel();

    api.resetScaleOpacity(panel);

    assert.ok(!panel.forced("uiScale"),
        `reset forced ui-scale to ${JSON.stringify(panel.last("uiScale"))} instead of clearing it`);
    assert.ok(!panel.forced("preTransformScale2d"),
        `reset forced pre-transform-scale2d to ${JSON.stringify(panel.last("preTransformScale2d"))}`);
    assert.ok(!panel.forced("opacity"),
        `reset forced opacity to ${JSON.stringify(panel.last("opacity"))}`);
});

// tests/hud_scale_style.test.js
// =============================================================================
// The mod's scale sliders ride on ui-scale, and ui-scale belongs to CSS first.
// =============================================================================
// Every scale in the mod goes through ui-scale rather than pre-transform-scale2d,
// because ui-scale re-lays out (vector) where pre-transform-scale2d resamples
// (raster). The catch is that an inline ui-scale REPLACES the CSS one instead of
// multiplying with it, and Panorama will not report a computed value back — so
// the runtime has to know the base it is overriding:
//
//   #health_and_abilities_container  base/hud.css:422            120%
//                                    .support_16_10_active       104%
//   #hud_signature                   base/hud.css:1824            90%
//                                    .gShopOpen                   75%
//
// Two rules follow, and this file pins both:
//
//   1. A slider at its default writes nothing at all, so an untouched HUD keeps
//      whichever CSS rule applies. This is what made "lower the opacity" resize
//      the healthbar: the runtime only starts on the first non-default key, and
//      it wrote a flat ui-scale: 100% the moment it did.
//   2. A slider that has been moved writes base x slider, not slider.
// =============================================================================

"use strict";

const test = require("node:test");
const assert = require("node:assert");

const sim = require("../scripts/simulator/index.js");

const HEALTHBAR_BASE_PCT = 120;
const SIGNATURE_BASE_PCT = 90;

/** Panel stand-in that records every style write, including clears. */
function recordingPanel(extra) {
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
    return Object.assign({
        style,
        writes,
        last(prop) {
            for (let i = writes.length - 1; i >= 0; i--) {
                if (writes[i].prop === prop) return writes[i].value;
            }
            return undefined;
        },
        /** True when the property was written and left holding a real value. */
        forced(prop) {
            const v = this.last(prop);
            return v !== undefined && v !== "" && v !== null && v !== "(deleted)";
        },
    }, extra || {});
}

function boot() {
    const h = sim.createHud({ inHideout: true });
    h.assertLoaded();
    return h;
}

// ── Player healthbar ────────────────────────────────────────────────────────

const HB_DEFAULTS = {
    PLAYER_HEALTHBAR_SCALE: 100,
    PLAYER_HEALTHBAR_OPACITY: 1.0,
    PLAYER_HEALTHBAR_X_OFFSET: 0,
    PLAYER_HEALTHBAR_Y_OFFSET: 0,
};

function healthbarApi(h) {
    const QOL = h.sandbox.global.QOL;
    assert.ok(QOL.healthbar, "QOL.healthbar namespace missing after boot");
    return {
        build: QOL.healthbar.buildPlayerHealthbarStyleState,
        apply: QOL.healthbar.applyPlayerStyleToPanel,
        resetScaleOpacity: QOL.healthbar.resetPlayerScaleOpacity,
    };
}

function applyHealthbar(h, cfg) {
    const api = healthbarApi(h);
    const panel = recordingPanel();
    api.apply(panel, api.build(Object.assign({}, HB_DEFAULTS, cfg), false, false), true);
    return panel;
}

test("healthbar: opacity alone never touches ui-scale", () => {
    const panel = applyHealthbar(boot(), { PLAYER_HEALTHBAR_OPACITY: 0.63 });

    assert.ok(!panel.forced("uiScale"),
        `ui-scale was forced to ${JSON.stringify(panel.last("uiScale"))}; ` +
        `the game's ${HEALTHBAR_BASE_PCT}% must survive an opacity-only change`);
    assert.strictEqual(panel.last("opacity"), "0.63", "opacity should still be applied");
});

test("healthbar: a moved size slider scales the CSS base, not 100", () => {
    const panel = applyHealthbar(boot(), { PLAYER_HEALTHBAR_SCALE: 150 });

    assert.strictEqual(panel.last("uiScale"), (HEALTHBAR_BASE_PCT * 1.5) + "%",
        "size 150 should be 1.5x the CSS base");
    assert.ok(!panel.forced("preTransformScale2d"),
        "scale belongs on ui-scale (vector), not pre-transform-scale2d (raster)");
});

test("healthbar: all-default config forces nothing", () => {
    const panel = applyHealthbar(boot(), {});

    for (const prop of ["uiScale", "preTransformScale2d", "opacity", "x", "y"]) {
        assert.ok(!panel.forced(prop),
            `default config forced ${prop}=${JSON.stringify(panel.last(prop))}`);
    }
});

test("healthbar: reset hands every property back to CSS", () => {
    const panel = recordingPanel();
    healthbarApi(boot()).resetScaleOpacity(panel);

    for (const prop of ["uiScale", "preTransformScale2d", "opacity"]) {
        assert.ok(!panel.forced(prop),
            `reset forced ${prop}=${JSON.stringify(panel.last(prop))} instead of clearing it`);
    }
});

// ── Bottom bar (#hud_signature) ─────────────────────────────────────────────
//
// Driven through the registered feature rather than a helper, because the bottom
// bar has no shared style module — the write is inline in its update().

const BB_DEFAULTS = {
    HUD_BOTTOM_BAR_ENABLED: 1,
    BOTTOM_BAR_OPACITY: 1.0,
    BOTTOM_BAR_SCALE: 1.0,
    BOTTOM_BAR_X_OFFSET: 0,
    BOTTOM_BAR_Y_OFFSET: 0,
};

function runBottomBar(cfg) {
    const h = boot();
    const QOL = h.sandbox.global.QOL;
    const entry = h.sandbox.global.QOL_FEATURE_REGISTRY && h.sandbox.global.QOL_FEATURE_REGISTRY.bottomBarRuntime;

    const panel = recordingPanel({
        id: "hud_signature",
        IsValid: () => true,
        SetHasClass: () => {},
        FindChildTraverse: () => null,
        FindChildrenWithClassTraverse: () => [],
    });

    if (entry) {
        // The feature resolves the panel through the cache, so seed it there and skip
        // needing #hud_signature to exist in the modelled tree.
        QOL.setCachedPanel("bottomBarPanel", panel);
        QOL.state.bottomBarRuntimeStyleSig = "";
        entry.update(h.doc.root, Object.assign({}, BB_DEFAULTS, cfg), 1000);
        return panel;
    }

    const FR = QOL.core && QOL.core.FeatureRegistry;
    const manifest = FR && FR.getManifest && FR.getManifest("ql_bottom_bar");
    if (manifest) {
        const origFindChild = h.doc.root.FindChildTraverse;
        h.doc.root.FindChildTraverse = (id) => {
            if (id === "hud_signature") return panel;
            return origFindChild ? origFindChild.call(h.doc.root, id) : null;
        };
        const fullCfg = Object.assign({}, BB_DEFAULTS, cfg);
        const ctx = {
            id: "ql_bottom_bar",
            config: {
                all: () => fullCfg,
                get: (k) => fullCfg[k],
                set: (k, v) => { fullCfg[k] = v; }
            },
            events: { on: () => {}, off: () => {}, emit: () => {} }
        };
        const inst = manifest.create(ctx);
        inst.onEnable();
        return panel;
    }

    assert.fail("neither bottomBarRuntime nor ql_bottom_bar manifest is registered");
}

test("bottom bar: default config forces nothing on #hud_signature", () => {
    const panel = runBottomBar({});

    for (const prop of ["uiScale", "preTransformScale2d", "opacity", "x", "y"]) {
        assert.ok(!panel.forced(prop),
            `default config forced ${prop}=${JSON.stringify(panel.last(prop))}; ` +
            `that pins the panel and kills the .gShopOpen rule`);
    }
});

test("bottom bar: opacity alone never touches ui-scale", () => {
    const panel = runBottomBar({ BOTTOM_BAR_OPACITY: 0.6 });

    assert.ok(!panel.forced("uiScale"),
        `ui-scale was forced to ${JSON.stringify(panel.last("uiScale"))}; ` +
        `the game's ${SIGNATURE_BASE_PCT}% must survive an opacity-only change`);
    assert.strictEqual(panel.last("opacity"), "0.60", "opacity should still be applied");
});

test("bottom bar: a moved size slider scales the CSS base, not 100", () => {
    const panel = runBottomBar({ BOTTOM_BAR_SCALE: 1.5 });

    assert.strictEqual(panel.last("uiScale"), Math.round(SIGNATURE_BASE_PCT * 1.5) + "%",
        "scale 1.5 should be 1.5x the CSS base");
    assert.ok(!panel.forced("preTransformScale2d"),
        "scale belongs on ui-scale (vector), not pre-transform-scale2d (raster)");
});

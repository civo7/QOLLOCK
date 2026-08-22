// tests/hero_popup_geometry.test.js
// =============================================================================
// Acceptance tests for the Item Buy Notifications geometry sliders.
// =============================================================================
// Reproduces the field bug reported 2026-08-22 (Alex): with Per-Hero Popups
// enabled, the Horizontal Offset / Vertical Offset / Opacity / Scale sliders had
// no effect. The four values were read inside the centralized-popup branch of
// UpdateRecentPurchases, so the per-hero branch never saw them.
//
// The test drives the real feature file through the simulator: it builds the top
// bar player cards the popups attach to, feeds a purchase into
// RecentPurchasesContainer the way the game does, and then inspects the styles
// that actually landed on the created panel. Asserting on styles rather than on
// "the function was called" is the point — the bug was a value that never
// reached a panel, and only the panel can testify to that.
//
// Run: node --test tests/
// =============================================================================

"use strict";

const test = require("node:test");
const assert = require("node:assert");
const sim = require("../scripts/simulator/index.js");

const STORAGE_KEY = "Deadlock_Mod_Settings_v1";
const USER_EDIT_REV_ATTR = "QOL_USER_EDIT_REV";

const HEROES = ["LASH", "SEVEN", "HAZE"];

/**
 * Config for a HUD where Item Buy Notifications is on in per-hero mode with
 * non-default geometry. Built by merging over the mod's own defaults so every
 * unrelated key keeps a legal value — a hand-written partial config trips
 * normalization and the feature gates off for the wrong reason.
 */
function seedConfig(h, overrides) {
    const cfg = h.sandbox.evalJson("(function(){ try { return QOL.buildDefaultConfig(); } catch(e) { return null; } })()");
    assert.ok(cfg && typeof cfg === "object", "could not build a default config");
    Object.assign(cfg, overrides);
    const schema = h.sandbox.eval(
        `(function(){ try { return String(QOL_SCHEMA_VERSION || QOL_CONFIG_SCHEMA_VERSION || ""); } catch(e) { return ""; } })()`
    );
    const raw = JSON.stringify({ schema: schema || "3.1.9", data: cfg });
    for (const p of [h.doc.root, h.doc.absRoot.FindChildTraverse("Hud")]) {
        if (!p) continue;
        p.SetAttributeString(STORAGE_KEY, raw);
        p.SetAttributeString(USER_EDIT_REV_ATTR, String(++REV));
    }
}
let REV = 0;

/**
 * Minimum viable top bar: one player card per hero, each carrying the
 * HeroNameHidden label and HeroBadge that BuildHeroPlayerCardMap keys off.
 */
function seedTopBar(h, heroes) {
    const hud = h.doc.absRoot.FindChildTraverse("Hud") || h.doc.root;
    let topBar = hud.FindChildTraverse("TopBar");
    if (!topBar) {
        topBar = h.doc.create("Panel", { id: "TopBar", classes: [] });
        hud.addChild(topBar);
    }
    const cards = [];
    heroes.forEach((hero, i) => {
        const card = h.doc.create("Panel", { id: `TopBarPlayer${i + 1}`, classes: [] });
        topBar.addChild(card);
        const badge = h.doc.create("Panel", { id: "HeroBadge", classes: [] });
        badge.heroid = i + 1;
        card.addChild(badge);
        const label = h.doc.create("Label", { id: "", classes: ["HeroNameHidden"], text: hero });
        card.addChild(label);
        cards.push(card);
    });
    return { topBar, cards };
}

/** The RecentPurchasesContainer the game inflates, created on demand. */
function ensureContainer(h) {
    const hud = h.doc.absRoot.FindChildTraverse("Hud") || h.doc.root;
    let container = hud.FindChildTraverse("RecentPurchasesContainer");
    if (!container) {
        const panel = h.doc.create("Panel", { id: "RecentPurchasesPanel", classes: [] });
        hud.addChild(panel);
        container = h.doc.create("Panel", { id: "RecentPurchasesContainer", classes: [] });
        panel.addChild(container);
    }
    return container;
}

/** A purchase row shaped like the one the game inflates. */
function pushPurchase(h, hero, item, timeText) {
    const container = ensureContainer(h);
    const row = h.doc.create("Panel", { id: "", classes: ["recentPurchase", "isTier2Purchase", "isWeaponPurchase"] });
    container.addChild(row);
    row.addChild(h.doc.create("Label", { id: "", classes: ["recentModPurchaseName"], text: item }));
    row.addChild(h.doc.create("Label", { id: "", classes: ["recentTimePurchased"], text: timeText }));
    row.addChild(h.doc.create("Label", { id: "", classes: ["recentModPurchaserHero"], text: hero }));
    return row;
}

/** Boot, configure, build the tree, then let the feature run and settle. */
function runPopups(overrides, { heroes = [HEROES[0]], purchases = null } = {}) {
    const h = sim.createHud({ inHideout: false, boot: true });
    h.assertLoaded();
    seedConfig(h, Object.assign({
        ENABLE_SHOP_ITEM_NOTIFICATIONS: 1,
        ENABLE_HERO_PURCHASE_POPUPS: 1,
        ENABLE_SHOP_RECENT_PURCHASES: 0,
    }, overrides));
    seedTopBar(h, heroes);

    // Three phases, in the order the real HUD goes through them. Collapsing any
    // two of them makes the test silently measure nothing:
    //  1. the container has to exist before the feature does anything at all —
    //     UpdateRecentPurchases returns early without it;
    //  2. the first pass that sees the container records every row already in it
    //     as "seen" (so a mid-match reload does not replay the whole game's
    //     purchases), and the pass after that builds the hero→card map;
    //  3. only purchases arriving after that produce a popup.
    ensureContainer(h);
    h.clock.advance(3000);
    if (Number(overrides.ENABLE_HERO_PURCHASE_POPUPS) !== 0) {
        assert.strictEqual(h.sandbox.eval("QOL.state.heroPopup.mapState"), 2,
            `hero→card map never built — the fixture is wrong, not the mod\n${h.diagnose()}`);
    }

    const list = purchases || [[heroes[0], "Basic Magazine", "1:00"]];
    for (const [hero, item, timeText] of list) pushPurchase(h, hero, item, timeText);
    h.clock.advance(3000);

    return h;
}

/** The per-hero popup panel the feature created for `hero`, or null. */
function popupPanel(h, hero) {
    return h.sandbox.eval(`(function(){
        var s = QOL.state && QOL.state.heroPopup;
        return s && s.panelsByHero ? s.panelsByHero[${JSON.stringify(hero)}] || null : null;
    })()`);
}

function popupStyle(h, hero) {
    const p = popupPanel(h, hero);
    return p ? p.style : null;
}

test("the harness produces a per-hero popup at all", () => {
    const h = runPopups({});
    const panel = popupPanel(h, HEROES[0]);
    assert.ok(panel, `no popup panel was created\n${h.diagnose()}`);
    assert.ok(panel.BHasClass("QuickPurchasesPanel"), "popup is missing its class");
    assert.ok(panel.GetChildCount() > 0, "popup has no entry rows");
    assert.strictEqual(h.clock.errors.length, 0, `poll loop threw\n${h.diagnose()}`);
});

test("REGRESSION: offset, opacity and scale reach the per-hero popup", () => {
    // The reporter's own settings: -205 / -135 / 13% / 0.22. Scale is below the
    // slider's 0.5 floor and normalizes up to 0.5 — asserting on 0.5 rather than
    // 0.22 documents that clamp instead of pretending it is not there.
    const h = runPopups({
        RECENT_PURCHASES_QUICK_X_OFFSET: -205,
        RECENT_PURCHASES_QUICK_Y_OFFSET: -135,
        RECENT_PURCHASES_QUICK_OPACITY: 0.13,
        RECENT_PURCHASES_QUICK_SCALE: 0.22,
    });
    const style = popupStyle(h, HEROES[0]);
    assert.ok(style, `no popup panel was created\n${h.diagnose()}`);
    assert.strictEqual(style.x, "-205px", "horizontal offset did not reach the popup");
    assert.strictEqual(style.y, "135px", "vertical offset did not reach the popup (Y is inverted)");
    assert.strictEqual(style.opacity, "0.13", "opacity did not reach the popup");
    assert.strictEqual(style.uiScale, "50%", "scale did not reach the popup");
});

test("a slider moved mid-match re-styles the live popup", () => {
    const h = runPopups({ RECENT_PURCHASES_QUICK_X_OFFSET: 0 });
    assert.strictEqual(popupStyle(h, HEROES[0]).x, "0px", "precondition: popup starts unshifted");

    seedConfig(h, {
        ENABLE_SHOP_ITEM_NOTIFICATIONS: 1,
        ENABLE_HERO_PURCHASE_POPUPS: 1,
        ENABLE_SHOP_RECENT_PURCHASES: 0,
        RECENT_PURCHASES_QUICK_X_OFFSET: 120,
    });
    h.clock.advance(3000);

    assert.strictEqual(popupStyle(h, HEROES[0]).x, "120px",
        `a live slider change must re-style existing popups\n${h.diagnose()}`);
});

test("a popup created after the sliders were set is styled on creation", () => {
    // Panels are created lazily, one per hero, on that hero's first purchase. The
    // sig guard only re-applies styles on change, so a panel born later has to be
    // styled by its constructor or it stays at the CSS default forever.
    const h = runPopups(
        { RECENT_PURCHASES_QUICK_X_OFFSET: 77 },
        { heroes: HEROES, purchases: [[HEROES[0], "Basic Magazine", "1:00"]] }
    );
    assert.strictEqual(popupStyle(h, HEROES[0]).x, "77px", "precondition: first popup is styled");

    pushPurchase(h, HEROES[1], "Headshot Booster", "2:00");
    h.clock.advance(3000);

    const late = popupStyle(h, HEROES[1]);
    assert.ok(late, `second hero never got a popup\n${h.diagnose()}`);
    assert.strictEqual(late.x, "77px", "a later popup was left unstyled");
});

test("the centralized popup still gets its geometry when per-hero is off", () => {
    // Guard against fixing one branch by breaking the other.
    const h = runPopups({
        ENABLE_HERO_PURCHASE_POPUPS: 0,
        RECENT_PURCHASES_QUICK_X_OFFSET: -60,
        RECENT_PURCHASES_QUICK_OPACITY: 0.5,
        RECENT_PURCHASES_QUICK_SCALE: 1.25,
    });
    const central = h.sandbox.eval(`(function(){
        var p = QOL.getCachedPanel ? QOL.getCachedPanel("quickPurchasesPanel") : null;
        return p || null;
    })()`);
    assert.ok(central, `centralized panel was not resolved\n${h.diagnose()}`);
    assert.strictEqual(central.style.x, "-60px", "centralized horizontal offset regressed");
    assert.strictEqual(central.style.opacity, "0.50", "centralized opacity regressed");
    assert.strictEqual(central.style.uiScale, "125%", "centralized scale regressed");
    assert.strictEqual(popupPanel(h, HEROES[0]), null, "per-hero popups must not exist when the mode is off");
});

test("styles are not rewritten every tick once settled", () => {
    // This runs on the 20Hz loop across up to 12 panels, and Panorama re-lays out
    // a subtree on every style write including a write of the value already held.
    const h = runPopups({ RECENT_PURCHASES_QUICK_X_OFFSET: 15 });
    const panel = popupPanel(h, HEROES[0]);
    assert.ok(panel, "no popup panel was created");

    const before = h.sandbox.eval(`(function(){
        var s = QOL.state && QOL.state.heroPopup;
        return s && s.style ? s.style.sig : null;
    })()`);
    assert.ok(before, "geometry sig was never recorded");

    let writes = 0;
    const style = panel.style;
    const seen = { x: style.x, y: style.y, uiScale: style.uiScale, opacity: style.opacity };
    const probe = new Proxy(style, {
        set(target, prop, value) {
            if (Object.prototype.hasOwnProperty.call(seen, prop)) writes++;
            target[prop] = value;
            return true;
        },
    });
    panel.style = probe;
    h.clock.advance(5000);
    panel.style = style;

    assert.strictEqual(writes, 0,
        `steady state rewrote geometry ${writes} time(s) in 5s\n${h.diagnose()}`);
});

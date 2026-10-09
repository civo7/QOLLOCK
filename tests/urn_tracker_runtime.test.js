"use strict";
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const { createHud } = require("../scripts/simulator");

function setup() {
    const env = createHud({ inHideout: false }); env.assertLoaded();
    const { $, QOL: Q } = env.sandbox.global;
    Q.core.App.shutdown();
    Q.core.ConfigAdapter.loadFromFlat({ ...env.sandbox.evalJson("QOL.buildDefaultConfig()"), ENABLE_URN_DIFF: 1 });
    let reads = 0;
    const cfg = Q.core.ConfigStore.view("ql_urn_tracker");
    const feature = Q.core.FeatureRegistry.getManifest("ql_urn_tracker").create({ id: "ql_urn_tracker", config: { view() { reads++; return cfg; } } });
    const add = (parent, id, type = "Panel", className = "") => {
        const panel = $.CreatePanel(type, parent, id); if (className) panel.AddClass(className); return panel;
    };
    function top(root = env.doc.root) {
        return add(add(root, "", "Panel", "HudCore"), "TopBar");
    }
    function native(topbar, friendly = "3k", enemy = "2k") {
        const networth = add(topbar, "", "Panel", "TeamNetworth");
        const score = (id, text) => {
            const team = add(networth, id), container = add(team, "", "Panel", "ScoreContainer");
            const label = add(container, "", "Label", "ScoreLabel"); label.text = text; return label;
        };
        return { networth, friendly: score("TeamScoreFriendly", friendly), enemy: score("TeamScoreEnemy", enemy) };
    }
    function legacy(topbar, friendlyClass = "friend", enemyClass = "enemy") {
        const teams = add(topbar, "TeamsContainer");
        for (const [className, values] of [[friendlyClass, ["1,000", "2,000"]], [enemyClass, ["1,000", "1,000"]]]) {
            const team = add(teams, "", "Panel", className);
            for (const value of values) add(team, "", "Label", "hiddenGoldValue").text = value;
        }
        return teams;
    }
    const overlay = () => env.doc.root.FindChildTraverse("UrnTracker");
    const display = () => overlay()?.FindChild("UrnTrackerLabel")?.text;
    function stop() { feature.onDisable(); env.clock.advance(20); assert.equal(overlay(), null); assert.deepEqual(env.clock.errors, []); }
    return { ...env, $, Q, cfg, feature, add, top, native, legacy, overlay, display, reads: () => reads, stop };
}

test("urn difference reads native totals before contradictory legacy player totals and observes text immediately", () => {
    const env = setup(), top = env.top();
    const source = env.native(top, '3<span class="demote">.0k</span>', "2,000");
    const legacy = env.legacy(top, "team1", "team2");
    for (const label of legacy.FindChildrenWithClassTraverse("hiddenGoldValue")) label.text = "100";
    env.feature.onEnable(); assert.equal(env.display(), "+33.3%"); assert.equal(env.overlay().BHasClass("good"), true);
    source.friendly.text = "1.5k"; source.enemy.text = "3k"; env.clock.advance(350);
    assert.equal(env.display(), "-50.0%"); assert.equal(env.overlay().BHasClass("bad"), true);
    assert.equal(env.reads(), 1); env.stop();
});

test("urn difference keeps both legacy team class fallbacks and upgrades when preferred native scores arrive", () => {
    for (const [friendly, enemy] of [["friend", "enemy"], ["team1", "team2"]]) {
        const env = setup(), top = env.top(); env.legacy(top, friendly, enemy);
        env.feature.onEnable(); assert.equal(env.display(), "+33.3%");
        env.native(top, "2k", "4k"); env.clock.advance(350); assert.equal(env.display(), "-50.0%");
        env.stop();
    }
});

test("urn difference retries late topbar and rebinds living native source labels and changed source roles", () => {
    const env = setup(); env.feature.onEnable(); assert.equal(env.overlay(), null);
    const top = env.top(), source = env.native(top); env.clock.advance(1200); assert.equal(env.display(), "+33.3%");
    source.friendly.SetParent(env.add(null, "RetiredSource"));
    const replacement = env.add(source.networth.FindChild("TeamScoreFriendly").GetChild(0), "", "Label", "ScoreLabel");
    replacement.text = "1k"; env.clock.advance(350); assert.equal(env.display(), "-50.0%");
    assert.equal(source.friendly.IsValid(), true); // Native sources are read-only.
    env.legacy(top); replacement.RemoveClass("ScoreLabel"); env.clock.advance(350); assert.equal(env.display(), "+33.3%");
    replacement.AddClass("ScoreLabel"); env.clock.advance(350); assert.equal(env.display(), "-50.0%"); env.stop();
});

test("urn difference reapplies an unchanged result to living replacements and releases moved owned children", () => {
    const env = setup(), top = env.top(); env.native(top); env.feature.onEnable();
    const old = env.overlay(), oldLabel = old.FindChild("UrnTrackerLabel");
    old.SetParent(env.add(null, "RetiredOverlay")); env.clock.advance(350);
    assert.equal(old.IsValid(), false); assert.equal(oldLabel.IsValid(), false); assert.equal(env.display(), "+33.3%");
    const moved = env.overlay().FindChild("UrnTrackerLabel"); moved.SetParent(env.add(null, "RetiredLabels")); env.clock.advance(350);
    assert.equal(moved.IsValid(), false); assert.equal(env.display(), "+33.3%");
    const oldHud = env.doc.root, oldOverlay = env.overlay();
    env.doc.root = env.add(null, "Hud", "CitadelHud"); env.native(env.top(), "1k", "2k"); env.clock.advance(350);
    assert.equal(oldHud.IsValid(), true); assert.equal(oldOverlay.IsValid(), false); assert.equal(env.display(), "-50.0%"); env.stop();
});

test("urn difference releases hideout and disabled UI without mutating native scores or reviving stopped work", () => {
    const env = setup(), top = env.top(), source = env.native(top); env.feature.onEnable();
    const first = env.overlay(); env.doc.root.AddClass("InHideout"); env.clock.advance(350); assert.equal(first.IsValid(), false);
    env.doc.root.RemoveClass("InHideout"); env.clock.advance(350); assert.equal(env.display(), "+33.3%");
    env.cfg.ENABLE_URN_DIFF = false; env.feature.onSettingsChanged(); env.clock.advance(20); assert.equal(env.overlay(), null);
    env.cfg.ENABLE_URN_DIFF = true; env.feature.onSettingsChanged(); assert.equal(env.display(), "+33.3%");
    env.stop(); env.feature.onSettingsChanged(); env.clock.advance(1200); assert.equal(env.overlay(), null);
    assert.equal(source.friendly.text, "3k"); assert.equal(source.enemy.text, "2k");
    assert.equal(env.Q.core.Scheduler.getWorkSnapshot().some(owner => owner.id === "ql_urn_tracker"), false);
});

test("urn difference retires every moved child and never adopts a prior instance awaiting deletion", () => {
    const env = setup(), top = env.top(), source = env.native(top); env.feature.onEnable();
    const retired = env.add(null, "RetiredOwnedChildren"), children = env.overlay().Children();
    for (const panel of children) panel.SetParent(retired);
    env.clock.advance(350);
    for (const panel of children) assert.equal(panel.IsValid(), false, panel.id);
    assert.equal(env.display(), "+33.3%");
    const previous = env.overlay(), moved = previous.FindChild("UrnTrackerSoulIcon"); moved.SetParent(retired);
    env.feature.onDisable();
    let writes = 0;
    previous.style = new Proxy(previous.style, { set(target, key, value) { writes++; target[key] = value; return true; } });
    const next = env.Q.core.FeatureRegistry.getManifest("ql_urn_tracker").create({ id: "ql_urn_tracker", config: { view: () => env.cfg } });
    next.onEnable(); next.onSettingsChanged(); assert.equal(writes, 0); assert.equal(previous.visible, false);
    env.clock.advance(350); assert.equal(previous.IsValid(), false); assert.equal(moved.IsValid(), false);
    assert.notEqual(env.overlay(), previous); assert.equal(env.display(), "+33.3%");
    assert.equal(source.friendly.IsValid(), true); assert.equal(source.enemy.text, "2k");
    next.onDisable(); env.clock.advance(20); assert.equal(env.overlay(), null); assert.deepEqual(env.clock.errors, []);
});

test("urn difference waits for a real HUD when a loading root contains similar native IDs", () => {
    const env = setup(), top = env.top(); env.native(top); env.feature.onEnable(); const previous = env.overlay();
    env.doc.root = env.add(null, "LoadingRoot"); env.native(env.top()); env.clock.advance(350);
    assert.equal(previous.IsValid(), false); assert.equal(env.overlay(), null);
    env.doc.root = env.add(null, "Hud", "CitadelHud"); env.native(env.top(), "1k", "2k"); env.clock.advance(350);
    assert.equal(env.display(), "-50.0%"); env.stop();
});

test("urn difference takes its mood threshold from the current living topbar clock", () => {
    const env = setup(), top = env.top(); env.native(top, "100", "88");
    env.add(top, "GameTime", "Label").text = "14:59"; env.feature.onEnable();
    assert.equal(env.overlay().BHasClass("neutral"), true);
    top.GetParent().SetParent(env.add(null, "RetiredHudCore"));
    const next = env.top(); env.native(next, "100", "88"); env.add(next, "GameTime", "Label").text = "15:00";
    env.clock.advance(350); assert.equal(env.display(), "+12.0%"); assert.equal(env.overlay().BHasClass("good"), true); env.stop();
});

test("urn difference retries partial construction and rejected text without rewriting stable content", () => {
    const env = setup(), top = env.top(); env.native(top);
    const create = env.$.CreatePanel; let reject = true, text = "", writes = 0;
    env.$.CreatePanel = (type, parent, id, properties) => {
        if (id === "UrnTrackerSoulIcon" && reject) throw Error("modeled partial construction");
        const panel = create(type, parent, id, properties);
        if (id === "UrnTrackerLabel") Object.defineProperty(panel, "text", { configurable: true, get() { return text; }, set(value) { writes++; text = value; } });
        return panel;
    };
    env.feature.onEnable(); assert.equal(env.overlay().FindChild("UrnTrackerSoulIcon"), null); assert.equal(env.overlay().visible, false);
    reject = false; env.clock.advance(350); assert.equal(env.display(), "+33.3%"); assert.equal(writes, 1);
    env.clock.advance(1000); assert.equal(writes, 1);
    const label = env.overlay().FindChild("UrnTrackerLabel"); let rejectText = true;
    Object.defineProperty(label, "text", { configurable: true, get() { return text; }, set(value) { if (rejectText) throw Error("modeled text rejection"); text = value; } });
    const friendly = top.FindChildTraverse("TeamScoreFriendly").FindChildrenWithClassTraverse("ScoreLabel")[0]; friendly.text = "1k";
    env.clock.advance(350); assert.equal(env.display(), "+33.3%"); rejectText = false; env.clock.advance(350); assert.equal(env.display(), "-50.0%");
    env.stop();
});

test("urn difference registry cleans partial enable and exposes one canonical setting owner", () => {
    const env = setup(), top = env.top(); env.native(top);
    const registry = env.Q.core.FeatureRegistry, create = env.$.CreatePanel; let reject = true;
    env.$.CreatePanel = (type, parent, id, properties) => {
        const panel = create(type, parent, id, properties);
        if (id === "UrnTrackerLabel" && reject) Object.defineProperty(panel, "text", { get() { return ""; }, set() { throw Error("modeled enable failure"); } });
        return panel;
    };
    registry.enable("ql_urn_tracker"); env.clock.advance(20); assert.equal(registry.isEnabled("ql_urn_tracker"), false); assert.equal(env.overlay(), null);
    reject = false; registry.enable("ql_urn_tracker"); assert.equal(env.display(), "+33.3%");
    registry.disable("ql_urn_tracker"); env.clock.advance(20); assert.equal(env.overlay(), null);
    assert.equal(env.Q.state.urnTrackerCachedState, undefined);
    assert.equal(env.Q.core.hud.computeUrnTrackerState, undefined);
    assert.equal(env.Q.core.ConfigStore.get("ql_urn_tracker", "ENABLE_URN_DIFF"), true);
    assert.deepEqual(env.clock.errors, []);
});

test("urn difference parser and display preserve localized/native formats and the late-match threshold", () => {
    const env = setup(), model = env.Q.features.urnDifferenceModel;
    for (const [input, value] of [["3<span>.0k</span>", 3000], ["1,5k", 1500], ["2,000", 2000],
        ["1&#8239;234", 1234], ["1\u00a0234", 1234], ["2m", 2000000], ["1.2B", 1200000000], ["-4k", 0], ["--", 0]]) {
        assert.equal(model.parse(input), value, input);
    }
    for (const [friendly, enemy, seconds, display, mood] of [[0, 0, 0, "--", "neutral"], [5, 0, 0, "100%", "good"],
        [0, 5, 0, "-100.0%", "bad"], [100, 100, 0, "0.0%", "neutral"], [100, 88, 899, "+12.0%", "neutral"],
        [100, 88, 900, "+12.0%", "good"], [88, 100, 900, "-12.0%", "bad"]]) {
        const result = model.derive(friendly, enemy, seconds); assert.equal(result.display, display); assert.equal(result.mood, mood);
    }
});

test("urn difference hidden fallback follows the current string gold binding", () => {
    const layout = fs.readFileSync(path.join(__dirname, "..", "panorama/layout/citadel_hud_top_bar_player.xml"), "utf8").replace(/<!--[\s\S]*?-->/g, "");
    const tag = layout.match(/<Label\b(?=[^>]*\bid="HiddenGoldValue")[^>]*>/)?.[0] || "";
    assert.match(tag, /\bclass="[^"]*\bhiddenGoldValue\b[^"]*"/); assert.match(tag, /\bhtml="true"/); assert.match(tag, /\btext="\{s:gold\}"/);
});

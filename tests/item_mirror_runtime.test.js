"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createHud } = require("../scripts/simulator");

function setup() {
    const env = createHud({ inHideout: false });
    env.assertLoaded();
    env.root.AddClass("joined_team"); // Current native combat-HUD visibility gate.
    const { $, QOL: Q } = env.sandbox.global;
    const imageRequests = new Map();
    const create = $.CreatePanel;
    $.CreatePanel = function(...args) {
        const panel = create.apply(this, args);
        if (args[0] === "Image") {
            const setImage = panel.SetImage;
            panel.SetImage = function(value) { imageRequests.set(this, value); setImage.call(this, value); };
        }
        return panel;
    };
    const core = $.CreatePanel("Panel", env.root, "");
    core.AddClass("HudCore");
    $.CreatePanel("Panel", core, "gameplay_hud");
    const abilities = $.CreatePanel("Panel", core, "AbilitiesContainer");
    $.CreatePanel("Panel", abilities, "abilitiesContainer"); // Native inner icon ID is a decoy for shop detection.
    $.CreatePanel("CitadelHudPassiveAbilities", abilities, "hud_passive_items");
    const stats = $.CreatePanel("Panel", core, "StatsAndModsContainer");
    const left = $.CreatePanel("Panel", stats, "LowerLeft");
    const lists = ["Universal", "Locked"].map(id => {
        const list = $.CreatePanel("Panel", left, "ModsContainer" + id);
        list.AddClass("ModsContainer");
        return list;
    });
    const config = { ...env.sandbox.evalJson("QOL.buildDefaultConfig()"), ENABLE_PASSIVE_COOLDOWN: 1,
        ENABLE_OLD_ITEM_COOLDOWNS: 0, ITEM_FILTER_DEF_PASSIVE: 1, ITEM_FILTER_OFF_PASSIVE: 1,
        ITEM_FILTER_DEF_ACTIVE: 1, ITEM_FILTER_OFF_ACTIVE: 1 };
    function apply(changes) { Object.assign(config, changes); Q.core.ConfigAdapter.loadFromFlat({ ...config }); env.clock.advance(150); }
    function buy(list, id, itemClass, kind, tier, use, image, cooldown = "") {
        const owner = $.CreatePanel("CitadelModIcon", list, id);
        for (const cls of ["hasAbility", kind, "isTier" + tier, use, cooldown ? "OnCooldown" : "OffCooldown"]) owner.AddClass(cls);
        const container = $.CreatePanel("Panel", owner, "modIconContainer");
        container.AddClass("mod_icon_single_container");
        container.AddClass(itemClass);
        const img = $.CreatePanel("Image", container, "ModIconImage");
        img.SetAttributeString("src", "file://{images}/items/" + image + ".psd");
        const mask = $.CreatePanel("Panel", container, "CooldownMask");
        mask.style.clip = "radial(50% 50%, 0deg, " + (cooldown ? "180" : "0") + "deg)";
        const label = $.CreatePanel("Label", owner, "Countdown");
        label.AddClass("Countdown");
        label.text = cooldown;
        return { owner, container, mask, label };
    }
    function slots() {
        const row = env.root.FindChildTraverse("QOLItemMirrorRow");
        return row ? row.Children().filter(p => p.style.visibility !== "collapse") : [];
    }
    const root = () => env.root.FindChildTraverse("QOLItemMirrorRoot");
    return { ...env, $, Q, core, abilities, lists, apply, buy, slots, imageRequests, overlay: root };
}

test("Advanced mirrors survive category filters, same local IDs in different lists, purchases, sales and shop transitions", () => {
    const env = setup();
    const offPassive = env.buy(env.lists[0], "ModIcon0", "acolytesGlove", "isTech", 1, "isPassiveItem", "spirit/spirit_strike");
    const defPassive = env.buy(env.lists[0], "ModIcon1", "medicBullets", "isWeapon", 1, "isPassiveItem", "weapon/restorative_shot", "9");
    const offActive = env.buy(env.lists[1], "ModIcon0", "iceBlast", "isTech", 2, "isActiveItem", "spirit/cold_front");
    env.buy(env.lists[1], "ModIcon1", "slowingTech", "isTech", 1, "isActiveItem", "spirit/rusted_barrel", "4");
    env.apply({});
    assert.equal(env.slots().length, 4, "same IDs in two native lists are different items");
    assert.equal(env.overlay().style.visibility, "visible");
    const sourceKeys = env.slots().map(p => env.imageRequests.get(p.FindChildTraverse("ModIconImage")));
    assert.equal(new Set(sourceKeys).size, 4);
    env.apply({ ITEM_FILTER_DEF_PASSIVE: 0 });
    assert.equal(env.slots().length, 3);
    let second = env.slots()[1];
    assert.equal(second.FindChildTraverse("modIconContainer").BHasClass("iceBlast"), true);
    assert.equal(second.FindChildTraverse("modIconContainer").BHasClass("medicBullets"), false);
    assert.equal(second.BHasClass("OnCooldown"), false, "a moved ready item cannot inherit the old slot's cooldown");
    env.apply({ ITEM_FILTER_OFF_PASSIVE: 0 });
    assert.equal(env.slots().length, 2);
    env.apply({ ITEM_FILTER_OFF_ACTIVE: 0, ITEM_FILTER_DEF_ACTIVE: 0 });
    assert.equal(env.slots().length, 0);
    assert.equal(env.overlay().style.visibility, "collapse");
    env.apply({ ITEM_FILTER_DEF_PASSIVE: 1, ITEM_FILTER_OFF_PASSIVE: 1, ITEM_FILTER_DEF_ACTIVE: 1, ITEM_FILTER_OFF_ACTIVE: 1 });
    assert.equal(env.slots().length, 4);
    second = env.slots()[1];
    assert.equal(second.FindChildTraverse("modIconContainer").BHasClass("medicBullets"), true);
    assert.equal(second.FindChildTraverse("modIconContainer").BHasClass("iceBlast"), false);
    assert.equal(second.BHasClass("OnCooldown"), true);
    assert.equal(second.FindChildrenWithClassTraverse("QOLItemMirrorCooldownText")[0].text, "9");
    offPassive.owner.DeleteAsync(0);
    env.clock.advance(1);
    const newItem = env.buy(env.lists[0], "ModIcon0", "magicBurst", "isTech", 1, "isPassiveItem", "spirit/mystic_burst", "12");
    env.clock.advance(1800);
    assert.equal(env.slots().length, 4, "new purchase appears without erasing the other three sources");
    assert.ok(env.slots().some(p => p.FindChildTraverse("modIconContainer").BHasClass("magicBurst")));
    assert.ok(env.slots().some(p => p.FindChildTraverse("modIconContainer").BHasClass("medicBullets")));
    const itemSlot = env.slots().find(p => p.FindChildTraverse("modIconContainer").BHasClass("magicBurst"));
    assert.equal(itemSlot.FindChildrenWithClassTraverse("QOLItemMirrorCooldownText")[0].text, "12");
    env.abilities.AddClass("gShopOpen");
    env.clock.advance(150);
    assert.equal(env.overlay().style.visibility, "collapse");
    env.abilities.RemoveClass("gShopOpen");
    env.clock.advance(150);
    assert.equal(env.overlay().style.visibility, "visible");
    assert.equal(env.slots().length, 4);
    offActive.owner.DeleteAsync(0);
    defPassive.owner.DeleteAsync(0);
    newItem.owner.DeleteAsync(0);
    env.clock.advance(1800);
    assert.equal(env.slots().length, 1, "sale removes only the sold sources");
    env.apply({ ENABLE_OLD_ITEM_COOLDOWNS: 1 });
    env.clock.advance(1);
    assert.equal(env.overlay(), null, "Basic mode releases the Advanced overlay");
    env.apply({ ENABLE_OLD_ITEM_COOLDOWNS: 0 });
    assert.equal(env.slots().length, 1);
    env.apply({ ENABLE_PASSIVE_COOLDOWN: 0 });
    env.clock.advance(1);
    assert.equal(env.overlay(), null);
    assert.deepEqual(env.clock.errors, []);
});

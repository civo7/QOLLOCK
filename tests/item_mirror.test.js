"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { parseLayoutScripts } = require("../scripts/simulator/layout");

function fixture() {
    let manifest;
    let now = 10000;
    let gameplayShown = true;
    const code = fs.readFileSync(path.join(__dirname, "../panorama/scripts/manifests/ql_item_mirror/controller.js"), "utf8");
    // Expose private operations only in this VM, while executing the active modules.
    const instrumented = code.replace("onEnable: function() {", `
        sync: renderer._syncMirrorItemFromSourceMulti,
        reconcile: native._reconcileItemMirrorSourcesMulti,
        discover: native._buildItemMirrorSourcesMulti,
        gameplayShown: _isItemMirrorGameplayShown,
        style: native._getInlineStyleProperty,
        onEnable: function() {`);
    assert.notEqual(instrumented, code, "private fixture hook must match the current controller lifecycle");
    const scheduled = [];
    const sandbox = {
        Date: { now: () => now },
        QOL: {
            features: {},
            panelCache: { createIdResolver: () => ({ resolve: () => null, reset() {} }) },
            core: {
                FeatureRegistry: { register: m => { manifest = m; } },
                Logger: { logWarn: m => { throw new Error(m); } },
                Scheduler: { scheduleOnce: (callback, delay) => {
                    const entry = { delay, callback, cancelled: false };
                    scheduled.push(entry);
                    return { stop: () => { entry.cancelled = true; } };
                } },
                hud: { isGameplayHudShown: () => gameplayShown }
            },
            utils: { PerfNowMs: () => now, IsPanelValid: p => !!p && p.valid !== false }
        },
        QOL_UTILS: { SetPanelOpacitySafe: (p, value) => { p.style.opacity = value; } },
        $: { Schedule: (delay, callback) => { scheduled.push({ delay, callback }); } }
    };
    const layout = parseLayoutScripts(path.resolve(__dirname, "../panorama/layout/hud.xml"));
    const modules = layout.scripts.filter(script => script.src.includes("/manifests/ql_item_mirror/"));
    assert.equal(modules.length, 5, "load the complete active owner graph");
    for (const script of modules) {
        const source = script.absPath.endsWith("controller.js") ? instrumented : fs.readFileSync(script.absPath, "utf8");
        vm.runInNewContext(source, sandbox);
    }
    const api = manifest.create({});
    let searches = 0;
    let text = "";
    let cooling = true;
    const panel = () => ({ style: {}, SetHasClass() {}, BHasClass: () => false, GetAttributeString: (_key, fallback) => fallback });
    const owner = () => ({
        ...panel(),
        BHasClass: cls => cls === "OnCooldown" && cooling,
        FindChildrenWithClassTraverse: cls => { searches++; return cls === "Countdown" && text ? [{ text }] : []; },
        FindChildTraverse: () => { searches++; return null; },
        Children: () => { searches++; return []; }
    });
    const source = { key: "test", ownerIcon: owner(), iconContainer: panel(), sourceImage: panel(), cooldownMask: panel() };
    source.cooldownMask.style.clip = "radial(50% 50%, 0deg, 180deg)";
    const makeSlot = () => ({ icon: panel(), modContainer: panel(), cooldownMask: panel(), cooldownText: panel(), readyOverlay: panel() });
    const slot = makeSlot();
    return {
        api, source, slot, owner, makeSlot, scheduled,
        tick: ms => { now += ms; api.sync(slot, source); },
        searches: () => searches,
        setGameplayShown: value => { gameplayShown = value; },
        setText: value => { text = value; },
        setCooling: value => { cooling = value; }
    };
}

test("item mirror follows combat HUD visibility in the Hero Testing combat room", () => {
    const f = fixture();
    const connectedHeroTestingHud = { classes: ["connectedToHideout", "connectedToHeroTesting"] };
    f.setGameplayShown(true);
    assert.equal(f.api.gameplayShown(connectedHeroTestingHud), true, "connectedToHideout alone must not suppress combat UI");
    f.setGameplayShown(false);
    assert.equal(f.api.gameplayShown(connectedHeroTestingHud), false, "the initial InHideout room remains suppressed by the shared HUD gate");
});

function makeTreePanel(id, classes = [], attributes = {}) {
    const panel = {
        id,
        valid: true,
        style: {},
        children: [],
        parent: null,
        classes: new Set(classes),
        attributes,
        BHasClass(className) { return this.classes.has(className); },
        GetParent() { return this.parent; },
        Children() { return this.children; },
        GetAttributeString(key, fallback) { return Object.hasOwn(this.attributes, key) ? this.attributes[key] : fallback; },
        FindChildTraverse(childId) {
            const queue = [...this.children];
            while (queue.length) {
                const child = queue.shift();
                if (child.id === childId) return child;
                queue.push(...child.children);
            }
            return null;
        },
        FindChildrenWithClassTraverse(className) {
            const matches = [];
            const queue = [...this.children];
            while (queue.length) {
                const child = queue.shift();
                if (child.BHasClass(className)) matches.push(child);
                queue.push(...child.children);
            }
            return matches;
        },
        add(child) {
            child.parent = this;
            this.children.push(child);
            return child;
        }
    };
    return panel;
}

function addPurchasedItem(parent, { itemClass, kindClass, tier, cooldownClass }) {
    const owner = parent.add(makeTreePanel("", ["hasAbility", kindClass, itemClass, cooldownClass]));
    const iconContainer = owner.add(makeTreePanel("modIconContainer", ["mod_icon_single_container"]));
    iconContainer.add(makeTreePanel("ModIconImage", [], { src: `file://{images}/${itemClass}.psd` }));
    iconContainer.add(makeTreePanel("CooldownMask"));
    iconContainer.add(makeTreePanel("mod_tier_label", [`ModTierLevel${tier}`]));
    return owner;
}

test("item mirror backs off empty text probes and discovers a late native label", () => {
    const f = fixture();
    f.tick(0);
    const initial = f.searches();
    assert.ok(initial > 0);
    f.setText("12s");
    for (let i = 0; i < 19; i++) f.tick(50);
    assert.equal(f.searches(), initial, "no repeated tree searches during the empty-probe delay");
    f.tick(50);
    assert.equal(f.slot.cooldownText.text, "12");
    assert.equal(f.searches(), initial + 1, "a named label bypasses remaining ID and BFS searches");
    f.setText("11s");
    f.tick(100);
    assert.equal(f.slot.cooldownText.text, "11", "successful probes retain the fast cadence");
});

test("multiple item mirrors keep independent cooldown histories after discovery and reset", () => {
    const f = fixture();
    const coolingItem = { ...f.source, itemClassName: "fireRatePlus" };
    const readyItem = { ...f.source, ownerIcon: f.owner(), itemClassName: "magicBurst" };
    readyItem.ownerIcon.BHasClass = () => false;

    for (let cycle = 0; cycle < 2; cycle++) {
        f.setCooling(true);
        f.setText("12s");
        const sources = f.api.reconcile([coolingItem, readyItem]);
        const slots = [f.makeSlot(), f.makeSlot()];
        const before = f.scheduled.length;
        for (let tick = 0; tick < 5; tick++) {
            for (let i = 0; i < sources.length; i++) f.api.sync(slots[i], sources[i]);
        }
        assert.equal(f.scheduled.length, before, "a ready neighbor must not trigger completion flashes");
        assert.equal(slots[0].cooldownText.text, "12");
        assert.equal(slots[1].cooldownText.style.visibility, "collapse");
        assert.notEqual(sources[0].key, sources[1].key);
        assert.ok(sources.every(s => Number.isFinite(s.acquisitionOrder)));
        assert.ok(sources[0].acquisitionOrder < sources[1].acquisitionOrder);

        const rescanned = f.api.reconcile([readyItem, coolingItem]);
        assert.deepEqual(Array.from(rescanned, s => s.key), Array.from(sources, s => s.key), "rescan preserves acquisition order and identities");
        f.setCooling(false);
        for (let i = 0; i < sources.length; i++) f.api.sync(slots[i], sources[i]);
        assert.equal(f.scheduled.length, before + 1, "only the item that finished cooling down flashes once");
        for (let i = 0; i < sources.length; i++) f.api.sync(slots[i], sources[i]);
        assert.equal(f.scheduled.length, before + 1);
        f.api.onDisable();
    }
});

test("item mirror retries immediately on source replacement or a new cooldown", () => {
    const f = fixture();
    f.tick(0);
    f.setText("8s");
    f.source.ownerIcon = f.owner();
    f.tick(50);
    assert.equal(f.slot.cooldownText.text, "8");
    f.setCooling(false);
    f.tick(50);
    assert.equal(f.slot.cooldownText.style.visibility, "collapse");
    f.setText("20s");
    f.setCooling(true);
    f.tick(50);
    assert.equal(f.slot.cooldownText.text, "20");
});

test("item mirror inline style fallback matches whole properties and can be reused", () => {
    const f = fixture();
    const panel = { GetAttributeString: () => "background-clip: border-box; OPACITY: 0.5; clip: radial(50% 50%, 0deg, 90deg); visibility: visible;" };
    for (let i = 0; i < 3; i++) {
        assert.equal(f.api.style(panel, "clip"), "radial(50% 50%, 0deg, 90deg)");
        assert.equal(f.api.style(panel, "opacity"), "0.5");
        assert.equal(f.api.style(panel, "visibility"), "visible");
    }
    assert.equal(f.api.style({ GetAttributeString: () => "background-clip: border-box" }, "clip"), "");
});

for (const direction of [-1, 1]) {
    test("item mirror estimates radial cooldown in direction " + direction + " and prioritizes late native text", () => {
        const f = fixture(); f.tick(0);
        f.source.cooldownMask.style.clip = `radial(50% 50%, 0deg, ${180 + direction * 20}deg)`;
        f.tick(200);
        assert.equal(f.slot.cooldownText.text, "2");
        f.source.cooldownMask.style.clip = `radial(50% 50%, 0deg, ${180 + direction * 100}deg)`;
        f.tick(800);
        assert.equal(f.slot.cooldownText.text, "0.8");
        f.setText("19s"); f.tick(1000);
        assert.equal(f.slot.cooldownText.text, "19", "numeric native text overrides the radial estimate");
        f.api.onDisable();
    });
}

test("item mirror discards radial speed when a semantic item's native mask is replaced", () => {
    const f = fixture(); f.tick(0);
    f.source.cooldownMask.style.clip = "radial(50% 50%, 0deg, 160deg)";
    f.tick(200); assert.equal(f.slot.cooldownText.text, "2");
    f.source.cooldownMask = { style: { clip: "radial(50% 50%, 0deg, 350deg)" }, GetAttributeString: (_key, fallback) => fallback };
    f.tick(200);
    assert.equal(f.slot.cooldownText.style.visibility, "collapse", "a new mask needs its own velocity samples");
    assert.equal(f.scheduled.length, 0, "source replacement is not a completion event");
    f.source.cooldownMask.style.clip = "radial(50% 50%, 0deg, 345deg)";
    f.tick(200);
    assert.equal(f.slot.cooldownText.text, "14", "old display locks and velocity cannot cap the new estimate");
    f.api.onDisable();
});

test("item mirror discovers every purchased item when native classes live on anonymous owner panels", () => {
    const f = fixture();
    const root = makeTreePanel("Hud");
    const stats = root.add(makeTreePanel("StatsAndModsContainer"));
    const lowerLeft = stats.add(makeTreePanel("LowerLeft"));
    const mods = lowerLeft.add(makeTreePanel("ModsContainer", ["ModsContainer"]));
    addPurchasedItem(mods, { itemClass: "activeReload", kindClass: "isWeapon", tier: 2, cooldownClass: "OffCooldown" });
    addPurchasedItem(mods, { itemClass: "magicBurst", kindClass: "isTech", tier: 1, cooldownClass: "OnCooldown" });
    addPurchasedItem(mods, { itemClass: "unclassifiedPassive", kindClass: "isWeapon", tier: 2, cooldownClass: "OffCooldown" });
    addPurchasedItem(mods, { itemClass: "explosiveBullets", kindClass: "isWeapon", tier: 3, cooldownClass: "OffCooldown" });

    const scan = f.api.discover(root, {
        ITEM_FILTER_DEF_PASSIVE: 1,
        ITEM_FILTER_OFF_PASSIVE: 1,
        ITEM_FILTER_DEF_ACTIVE: 1,
        ITEM_FILTER_OFF_ACTIVE: 1
    });

    assert.equal(scan.scannedCount, 4);
    assert.deepEqual(
        Array.from(scan.matches, match => match.itemClassName),
        ["activeReload", "magicBurst", "backstabber"],
        "classless passive exceptions should work without isPassiveItem, while owner-carried exclusions still apply"
    );
});

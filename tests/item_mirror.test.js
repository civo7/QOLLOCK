"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function fixture() {
    let manifest;
    let now = 10000;
    const code = fs.readFileSync(path.join(__dirname, "../panorama/scripts/manifests/ql_item_mirror/manifest.js"), "utf8");
    // Expose private operations only in this VM, while executing the real manifest.
    const instrumented = code.replace("onEnable: function() {", `
        sync: _syncMirrorItemFromSourceMulti,
        reconcile: _reconcileItemMirrorSourcesMulti,
        style: _getInlineStyleProperty,
        onEnable: function() {`);
    const scheduled = [];
    const sandbox = {
        Date: { now: () => now },
        QOL: {
            core: { FeatureRegistry: { register: m => { manifest = m; } }, Logger: { logWarn: m => { throw new Error(m); } } },
            utils: { PerfNowMs: () => now, IsPanelValid: p => !!p && p.valid !== false }
        },
        QOL_UTILS: { SetPanelOpacitySafe: (p, value) => { p.style.opacity = value; } },
        $: { Schedule: (delay, callback) => { scheduled.push({ delay, callback }); } }
    };
    vm.runInNewContext(instrumented, sandbox);
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
        setText: value => { text = value; },
        setCooling: value => { cooling = value; }
    };
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

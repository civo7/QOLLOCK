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
        style: _getInlineStyleProperty,
        onEnable: function() {`);
    const sandbox = {
        Date: { now: () => now },
        QOL: {
            core: { FeatureRegistry: { register: m => { manifest = m; } }, Logger: { logWarn: m => { throw new Error(m); } } },
            utils: { PerfNowMs: () => now, IsPanelValid: p => !!p && p.valid !== false }
        },
        QOL_UTILS: { SetPanelOpacitySafe: (p, value) => { p.style.opacity = value; } },
        $: { Schedule: () => {} }
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
    const slot = { icon: panel(), modContainer: panel(), cooldownMask: panel(), cooldownText: panel() };
    return {
        api, source, slot, owner,
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

"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createHud } = require("../scripts/simulator");

const ROOT = path.resolve(__dirname, "..");
const SOUND_SOURCE = fs.readFileSync(path.join(ROOT, "soundevents/world_ambient_emitters.vsndevts"), "utf8");

function setup(overrides = {}) {
    const e = createHud({ inHideout: false }); e.assertLoaded();
    const { QOL: Q, $ } = e.sandbox.global; Q.core.App.shutdown();
    const manifest = Q.core.FeatureRegistry.getManifest("ql_hit_kill_sounds"); assert.ok(manifest);
    Q.core.ConfigAdapter.loadFromFlat({ ...Q.buildDefaultConfig(), ...overrides });
    const feature = manifest.create({ id: manifest.id, events: Q.core.EventBus,
        config: { view: () => Q.core.ConfigStore.view(manifest.id) } });
    const played = [];
    const dispatch = $.DispatchEvent;
    $.DispatchEvent = (event, ...args) => { if (event === "PlaySoundEffect") played.push(args[0]); return dispatch.call($, event, ...args); };
    const add = (parent, id, cls) => { const panel = $.CreatePanel("Panel", parent, id || ""); if (cls) panel.AddClass(cls); return panel; };

    // Native gun path used by the hit marker, and the Damage Impact popups.
    const core = add(e.root, "", "HudCore");
    let gun = core;
    for (const id of ["gameplay_hud", "gameplay_hud_alive", "crosshair", "gun"]) gun = add(gun, id);
    add(add(gun, "gun_data"), "hit_markers");
    // Native Damage Impact panel: HudCore > damage_impact > #damageImpactInfo holds one
    // .damageImpactInstance per popup (see hud_damage_impact.xml).
    const impact = add(core, "damage_impact", "damageImpactContainer");
    const info = add(impact, "damageImpactInfo");
    const instance = (classes = "") => {
        const popup = add(info, "", "damageImpactInstance");
        for (const name of classes.split(" ")) if (name) popup.AddClass(name);
        return popup;
    };
    const kill = () => instance("killed fadeIn");
    const set = (key, value) => { Q.core.ConfigStore.set(manifest.id, key, value); feature.onSettingsChanged(); };
    const tick = (ms = 300) => e.clock.advance(ms);
    return { ...e, Q, feature, gun, info, instance, kill, played, set, tick };
}

// One short hit: the marker turns on briefly and off again.
const shortHit = (e) => { e.gun.AddClass("show_hit_marker"); e.tick(60); e.gun.RemoveClass("show_hit_marker"); e.tick(60); };

test("hitsound plays on a native hit marker activation, for normal and critical hits", () => {
    const e = setup({ ENABLE_HITSOUND: 1 }); e.feature.onEnable(); e.tick(1200);
    assert.deepEqual(e.played, []);
    e.gun.AddClass("show_hit_marker"); e.tick(60);
    assert.deepEqual(e.played, ["QOL.Hitsound.Quake3_V10"]);
    e.gun.RemoveClass("show_hit_marker"); e.tick(60);
    assert.equal(e.played.length, 1, "a short marker is a single hit");
    e.gun.AddClass("show_crit_hit_marker"); e.tick(60);
    assert.equal(e.played.length, 2);
    e.feature.onDisable();
});

test("hitsound keeps playing, overlapping, while the hit marker stays on during fast fire", () => {
    const e = setup({ ENABLE_HITSOUND: 1 }); e.feature.onEnable(); e.tick(1200);
    e.gun.AddClass("show_hit_marker");
    e.tick(1000);
    assert.ok(e.played.length >= 9 && e.played.length <= 11, `about ten sounds per second, got ${e.played.length}`);
    assert.ok(e.played.every(name => name === "QOL.Hitsound.Quake3_V10"));
    const before = e.played.length;
    e.gun.RemoveClass("show_hit_marker"); e.tick(500);
    assert.equal(e.played.length, before, "stops as soon as hits stop registering");
    e.feature.onDisable();
});

test("each hitsound and killsound option dispatches its own event", () => {
    const e = setup({ ENABLE_HITSOUND: 1, ENABLE_KILLSOUND: 1 }); e.feature.onEnable(); e.tick(1200);
    for (const [key, prefix] of [["HITSOUND_TYPE", "QOL.Hitsound."], ["KILLSOUND_TYPE", "QOL.Killsound."]]) {
        for (const [value, label] of e.Q.settings.get(key).options) {
            e.set(key, value); e.played.length = 0;
            if (key === "HITSOUND_TYPE") shortHit(e);
            else { e.kill(); e.tick(); }
            assert.deepEqual(e.played, [`${prefix}${label.replace(/[^A-Za-z0-9]/g, "")}_V10`], `${key}=${value}`);
        }
    }
    e.feature.onDisable();
});

test("killsound plays for a hero kill popup, not for crit, crowd control, heal, assist or damage popups", () => {
    const e = setup({ ENABLE_KILLSOUND: 1, KILLSOUND_TYPE: 2 }); e.feature.onEnable(); e.tick(1200);
    assert.deepEqual(e.played, [], "nothing on screen at the start");
    e.instance("fadeIn"); e.instance("Critical fadeIn"); e.instance("Stunned ShowStatusEffect fadeIn");
    e.instance("is_heal fadeIn"); e.instance("assist fadeIn"); e.instance("killed assist fadeIn");
    e.tick();
    assert.deepEqual(e.played, [], "only a kill that is not an assist plays");
    e.kill(); e.tick();
    assert.deepEqual(e.played, ["QOL.Killsound.Minecraft_V10"]);
    e.tick(); assert.equal(e.played.length, 1, "a popup that stays on is one kill");
    e.feature.onDisable();
});

test("a popup that becomes a kill after it appears plays when it does", () => {
    const e = setup({ ENABLE_KILLSOUND: 1 }); e.feature.onEnable(); e.tick(1200);
    const popup = e.instance("fadeIn"); e.tick();
    assert.equal(e.played.length, 0, "damage popup on its own");
    popup.AddClass("killed"); e.tick();
    assert.deepEqual(e.played, ["QOL.Killsound.Quake3_V10"]);
    e.feature.onDisable();
});

test("an assist flag set just after the kill flag keeps the killsound quiet", () => {
    const e = setup({ ENABLE_KILLSOUND: 1 }); e.feature.onEnable(); e.tick(1200);
    const popup = e.instance("fadeIn");
    popup.AddClass("killed"); e.tick(20); // under one poll: the kill has not been confirmed yet
    popup.AddClass("assist"); e.tick(500);
    assert.deepEqual(e.played, [], "killed + assist is the ASSIST popup");
    e.feature.onDisable();
});

test("popups already showing when the killsound starts do not play, and later kills do", () => {
    const e = setup({ ENABLE_KILLSOUND: 1 });
    e.kill();
    e.feature.onEnable(); e.tick(1200);
    assert.deepEqual(e.played, [], "an old kill popup is only a baseline");
    e.kill(); e.tick();
    assert.equal(e.played.length, 1);
    e.feature.onDisable();
});

test("each later kill plays, a reused popup plays again, and two popups for one kill play once", () => {
    const e = setup({ ENABLE_KILLSOUND: 1 }); e.feature.onEnable(); e.tick(1200);
    const first = e.kill(); e.tick();
    assert.equal(e.played.length, 1);
    first.RemoveClass("killed"); e.tick();
    first.AddClass("killed"); e.tick();
    assert.equal(e.played.length, 2, "the same popup killing again plays again");
    first.DeleteAsync(0); e.kill(); e.tick();
    assert.equal(e.played.length, 3, "a fresh popup after the old one is gone plays");
    e.kill(); e.kill(); e.tick();
    assert.equal(e.played.length, 4, "two popups at once play once");
    e.feature.onDisable();
});

test("hitsound and killsound enable independently", () => {
    const e = setup({ ENABLE_KILLSOUND: 1 }); e.feature.onEnable(); e.tick(1200);
    shortHit(e);
    assert.deepEqual(e.played, [], "hit marker is ignored while Hitsound is off");
    e.kill(); e.tick();
    assert.deepEqual(e.played, ["QOL.Killsound.Quake3_V10"]);
    e.set("ENABLE_HITSOUND", true); e.set("ENABLE_KILLSOUND", false); e.tick(1200); e.played.length = 0;
    e.gun.RemoveClass("show_hit_marker"); e.tick(60); shortHit(e);
    e.kill(); e.tick();
    assert.deepEqual(e.played, ["QOL.Hitsound.Quake3_V10"], "only the enabled sound plays");
    e.feature.onDisable();
    shortHit(e);
    assert.equal(e.played.length, 1, "nothing plays after the feature is disabled");
});

test("volume settings select the matching volume rung for hits and kills", () => {
    const e = setup({ ENABLE_HITSOUND: 1, ENABLE_KILLSOUND: 1 }); e.feature.onEnable(); e.tick(1200);
    for (const volume of [0, 1, 37, 50, 100]) {
        e.set("HITSOUND_VOLUME", volume); e.set("KILLSOUND_VOLUME", 100 - volume); e.played.length = 0;
        shortHit(e);
        e.kill(); e.tick();
        assert.deepEqual(e.played, [`QOL.Hitsound.Quake3_V${volume}`, `QOL.Killsound.Quake3_V${100 - volume}`]);
    }
    e.feature.onDisable();
});

test("each option is a folder of numbered clips listed by every volume step, in its own hit or kill folder", () => {
    const e = setup();
    const events = new Map();
    for (const [, name, body] of SOUND_SOURCE.matchAll(/^\s*(QOL\.(?:Hitsound|Killsound)\.\w+)\s*=\s*\{([^{}]*)\}/gm)) {
        assert.equal(events.has(name), false, `duplicate ${name}`);
        events.set(name, { volume: Number(body.match(/\bvolume\s*=\s*([\d.]+)/)[1]),
            files: Array.from(body.matchAll(/"(sounds\/[^"]+)\.vsnd"/g), match => match[1] + ".wav") });
    }
    assert.equal(events.size, 2 * 6 * 101, "no stray hit/kill events");
    for (const [key, prefix, group] of [["HITSOUND_TYPE", "QOL.Hitsound.", "hitsounds"], ["KILLSOUND_TYPE", "QOL.Killsound.", "killsounds"]]) {
        const options = e.Q.settings.get(key).options;
        assert.equal(options.length, 6, `${key} offers a choice`);
        for (const [, label] of options) {
            const slug = label.replace(/[^A-Za-z0-9]/g, "");
            const name = slug.toLowerCase();
            const folder = `sounds/${group}/${name}/`;
            // Custom has no clips in this repo: a pack from the QOL Lock Audio Pack Builder supplies all 100.
            const onDisk = name === "custom"
                ? Array.from({ length: 100 }, (_, slot) => `custom${String(slot).padStart(2, "0")}.wav`)
                : fs.readdirSync(path.join(ROOT, folder)).filter(file => file.endsWith(".wav")).sort();
            assert.ok(onDisk.length >= 1 && onDisk.length <= 100, `${folder} needs 1 to 100 clips`);
            for (const file of onDisk) assert.match(file, new RegExp(`^${name}\\d\\d\\.wav$`), `${folder}${file} must be named ${name}NN.wav`);
            for (let volume = 0; volume <= 100; volume++) {
                const entry = events.get(`${prefix}${slug}_V${volume}`);
                assert.ok(entry, `missing ${prefix}${slug}_V${volume}`);
                assert.ok(Math.abs(entry.volume - volume / 10) < 1e-6, `${prefix}${slug}_V${volume} volume`);
                assert.deepEqual(entry.files, onDisk.map(file => folder + file),
                    `${prefix}${slug}_V${volume} must list exactly the clips in ${folder}; run tools/update_hit_kill_soundevents.ps1`);
            }
        }
    }
});

test("Custom lists all 100 pack slots in its own hit or kill folder, with no clips in the repo", () => {
    for (const [prefix, group] of [["QOL.Hitsound.Custom", "hitsounds"], ["QOL.Killsound.Custom", "killsounds"]]) {
        const slots = Array.from({ length: 100 }, (_, slot) => `sounds/${group}/custom/custom${String(slot).padStart(2, "0")}`);
        for (const volume of [0, 10, 100]) {
            const body = SOUND_SOURCE.match(new RegExp(`${prefix}_V${volume} = \\n\\t\\{([^{}]*)\\}`))[1];
            assert.deepEqual(Array.from(body.matchAll(/"(sounds\/[^"]+)\.vsnd"/g), match => match[1]), slots, `${prefix}_V${volume}`);
            assert.ok(!/vsnd_duration/.test(body), "a pack's clip length is unknown, so no duration is declared");
        }
        assert.equal(fs.existsSync(path.join(ROOT, "sounds", group, "custom", "custom00.wav")), false, `${group}/custom clips come from a pack`);
    }
});

test("the Custom metadata placeholders fill in empty entries but never overwrite a pack's values", () => {
    const vm = require("node:vm");
    const load = (file, sandbox) => vm.runInNewContext(fs.readFileSync(path.join(ROOT, "panorama/scripts", file), "utf8"), sandbox);
    const bare = { globalThis: {} };
    load("ql_custom_hit_sound_pack_meta.js", bare);
    load("ql_custom_kill_sound_pack_meta.js", bare);
    assert.deepEqual(JSON.parse(JSON.stringify(bare.globalThis.QOL_HIT_KILL_SOUND_CUSTOM)),
        { hit: { name: "", description: "", credit: "" }, kill: { name: "", description: "", credit: "" } });
    const packed = { globalThis: { QOL_HIT_KILL_SOUND_CUSTOM: { hit: { name: "Boom", description: "d", credit: "me" } } } };
    load("ql_custom_hit_sound_pack_meta.js", packed);
    load("ql_custom_kill_sound_pack_meta.js", packed);
    assert.equal(packed.globalThis.QOL_HIT_KILL_SOUND_CUSTOM.hit.name, "Boom", "a pack's hit entry is kept");
    assert.equal(packed.globalThis.QOL_HIT_KILL_SOUND_CUSTOM.kill.name, "", "the missing kill entry is created empty");
});

test("the layout loads both Custom metadata scripts next to the announcer metadata", () => {
    const xml = fs.readFileSync(path.join(ROOT, "panorama/layout/hud_escape_menu.xml"), "utf8");
    const order = ["ql_custom_announcer_pack_meta", "ql_custom_hit_sound_pack_meta", "ql_custom_kill_sound_pack_meta"].map(name => xml.indexOf(`scripts/${name}.vjs_c`));
    assert.ok(order.every(index => index > 0) && order[0] < order[1] && order[1] < order[2]);
});

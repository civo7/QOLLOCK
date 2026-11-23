"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const loadSettings = require("./load_settings_environment");

const ROOT = path.resolve(__dirname, "..");
const OWNER = "ql_legacy_audio_passive";
const SOUND_SOURCE = path.join(ROOT, "soundevents/world_ambient_emitters.vsndevts");
const VOICES = [[4, "Beep"], [0, "Custom_Slot1"], [5, "Custom_Slot2"],
    [6, "Custom_Slot3"], [7, "Custom_Slot4"], [8, "Custom_Slot5"]];
// Independent boundary examples, not the manifest's private reminder table.
const DL4D = [
    [105, "SmallCampsBoxes", "tt_small_camps_and_boxes_normal"],
    [285, "RuneMeleeTroopers", "tt_rune_and_melee_troopers_normal"],
    [290, "MediumCamps", "tt_medium_camps_normal"],
    [465, "BigCampsSinners", "tt_big_camps_and_sinners_normal"],
    [585, "MidbossUrnGoldRune", "tt_midboss_urn_gold_rune_normal"],
    [720, "LaneGuardianWeak", "tt_lane_guardian_weak_normal"],
    [885, "Rune", "tt_rune_normal"],
    [1080, "WalkerWeak", "tt_walker_weak_normal"],
    [1185, "RuneFastTroopers", "tt_rune_and_fast_troopers_normal"],
    [1785, "RuneGoldBuffs", "tt_rune_and_gold_buffs_normal"],
    [2085, "RuneTroopers20Hp", "tt_rune_troopers20_hp_normal"]
];

function soundDefinitions() {
    // Only QOLLOCK's flat reminder records, not a general KV3/native-event parser.
    // Preserve quoted paths when removing comments; commented events cannot pass.
    const source = fs.readFileSync(SOUND_SOURCE, "utf8").replace(
        /"(?:\\.|[^"\\])*"|<!--[\s\S]*?-->|\/\/[^\r\n]*|\/\*[\s\S]*?\*\//g,
        token => token.startsWith('"') ? token : ""
    );
    const base = source.match(/^\s*QOL\.BuffReminderBase\s*=\s*\{([^{}]*)\}/m);
    assert.ok(base, "missing QOL.BuffReminderBase sound event");
    assert.match(base[1], /\bbase\s*=\s*"Base\.UI"/, "reminder base must retain the native UI sound base");
    const definitions = new Map();
    for (const [, name, body] of source.matchAll(/^\s*((?:BuffReminder|QOL\.DL4D)\.[\w.]+)\s*=\s*\{([^{}]*)\}/gm)) {
        assert.equal(definitions.has(name), false, `duplicate sound event: ${name}`);
        const files = body.match(/\bvsnd_files\s*=\s*\[([^\]]*)\]/);
        assert.ok(files, `${name}: expected a flat vsnd_files array`);
        definitions.set(name, {
            base: body.match(/\bbase\s*=\s*"([^"]+)"/)?.[1],
            volume: Number(body.match(/\bvolume\s*=\s*([\d.e+-]+)/i)?.[1]),
            files: Array.from(files[1].matchAll(/"([^"]+)"/g), match => match[1])
        });
    }
    const headers = [...source.matchAll(/^\s*(?:BuffReminder|QOL\.DL4D)\.[\w.]+\s*=/gm)];
    assert.ok(headers.length > 0, "no reminder sound definitions found");
    assert.equal(definitions.size, headers.length, "unsupported or incomplete reminder record; update the reader explicitly");
    return definitions;
}

function assertBinding(definitions, actual, expected, wave, volume, optionalPack = false) {
    assert.equal(actual, expected, "production dispatch must select the requested reminder/voice/volume");
    const definition = definitions.get(actual);
    assert.ok(definition, `undefined PlaySoundEffect event: ${actual}`);
    assert.equal(definition.base, "QOL.BuffReminderBase", `${actual}: reminder base`);
    assert.deepEqual(definition.files, [wave.replace(/\.wav$/, ".vsnd")], `${actual}: wrong sound resource`);
    assert.ok(Number.isFinite(definition.volume) && definition.volume >= 0, `${actual}: invalid gain`);
    assert.equal(definition.volume === 0, volume === 0, `${actual}: mute/positive gain`);
    // Custom slots are supplied separately. Their event/path routing is covered,
    // but this source checkout cannot establish that a pack is installed.
    if (!optionalPack) assert.ok(fs.existsSync(path.join(ROOT, wave)), `${actual}: missing shipped source ${wave}`);
}

function audioEnvironment() {
    const env = loadSettings();
    const { QOL: Q, $ } = env.hud.sandbox.global;
    Q.core.App.shutdown();
    const clockLabel = $.CreatePanel("Label", env.hud.root, "HudGameTime");
    const dispatched = [];
    const observe = dollar => {
        const dispatch = dollar.DispatchEvent;
        dollar.DispatchEvent = (event, ...args) => {
            if (event === "PlaySoundEffect") dispatched.push(args[0]);
            return dispatch(event, ...args);
        };
    };
    observe($);
    observe(env.global.$);
    const quiet = { ENABLE_INTERVAL: 0, ENABLE_ONE_TIME: 0, ENABLE_ONE_TIME_TIER1: 0,
        ENABLE_ONE_TIME_TIER2: 0, ENABLE_ONE_TIME_TIER3: 0, ENABLE_MINIMAP_REMINDER: 0,
        ENABLE_DL4D_REMINDERS: 0, ENABLE_DL4D_CAPTIONS: 0 };
    return {
        ...env,
        run(config, seconds) {
            Q.core.FeatureRegistry.disable(OWNER);
            Q.core.ConfigAdapter.loadFromFlat({ ...quiet, ...config });
            Q.core.FeatureRegistry.enable(OWNER);
            dispatched.length = 0;
            for (const second of seconds) {
                clockLabel.text = `${Math.floor(second / 60)}:${String(second % 60).padStart(2, "0")}`;
                env.clock.advance(500);
            }
            Q.core.FeatureRegistry.disable(OWNER);
            return dispatched.splice(0);
        },
        preview(button) {
            dispatched.length = 0;
            assert.equal(button._fire("onactivate"), true, "real Audio preview button must handle activation");
            return dispatched.splice(0);
        },
        assertClean() {
            assert.deepEqual(env.clock.errors, []);
            assert.deepEqual(env.doc.eventErrors, []);
            assert.equal(Q.core.FeatureRegistry.getErrorCounts()[OWNER] || 0, 0);
            assert.deepEqual(env.hud.sandbox.messages.filter(message => message.includes("[ERROR]")), []);
        }
    };
}

test("announcer HUD reminders and Audio buttons resolve real events at every selectable volume and voice", () => {
    const definitions = soundDefinitions();
    const env = audioEnvironment();
    const audio = env.global.QOL.ui.audio;
    audio.render(env.list);
    assert.deepEqual(Array.from(audio.buildVoiceDropdownOptions(), option => option.value), VOICES.map(([value]) => value));
    const voiceButton = env.list.FindChildTraverse("VoiceDropdownTestBtn");
    const bridgeButtons = env.list.FindChildrenWithClassTraverse("AnnouncerBuffFilterTestBtn");
    assert.ok(voiceButton);
    assert.equal(bridgeButtons.length, 3);
    for (const [voice, token] of VOICES) for (let volume = 0; volume <= 100; volume++) {
        env.global.MOD_CONFIG.VOICE_TYPE = voice;
        env.global.MOD_CONFIG.VOICE_VOLUME = volume;
        const binding = (actual, kind) => {
            const beep = token === "Beep";
            const base = beep ? "BuffReminder.Beep" : `BuffReminder.${kind}_${token}`;
            const wave = beep ? "sounds/mods/beep_normal.wav" : `sounds/mods/${kind.toLowerCase()}_${token.toLowerCase()}.wav`;
            assertBinding(definitions, actual, `${base}_V${volume}`, wave, volume, !beep);
        };
        const tiers = env.run({ VOICE_TYPE: voice, VOICE_VOLUME: volume, ENABLE_ONE_TIME: 1,
            ENABLE_ONE_TIME_TIER1: 1, ENABLE_ONE_TIME_TIER2: 1, ENABLE_ONE_TIME_TIER3: 1 }, [120, 300, 480]);
        assert.equal(tiers.length, 3, `voice ${voice}, volume ${volume}: one event per tier`);
        tiers.forEach((event, index) => binding(event, `Tier${index + 1}`));
        const preview = env.preview(voiceButton);
        assert.equal(preview.length, 1);
        binding(preview[0], "Bridge1");
        for (let variant = 1; variant <= 3; variant++) {
            const events = env.run({ VOICE_TYPE: voice, VOICE_VOLUME: volume, ENABLE_INTERVAL: 1,
                BRIDGE_BUFF_START: 0, ENABLE_BUFF_SOUND_1: +(variant === 1),
                ENABLE_BUFF_SOUND_2: +(variant === 2), ENABLE_BUFF_SOUND_3: +(variant === 3) }, [300]);
            assert.equal(events.length, 1, `voice ${voice}, volume ${volume}, bridge ${variant}`);
            binding(events[0], `Bridge${variant}`);
            const bridgePreview = env.preview(bridgeButtons[variant - 1]);
            assert.equal(bridgePreview.length, 1);
            binding(bridgePreview[0], `Bridge${variant}`);
        }
    }
    env.assertClean();
});

test("DL4D and minimap HUD dispatches bind shipped WAVs, including real DL4D preview buttons", () => {
    const definitions = soundDefinitions();
    const env = audioEnvironment();
    env.global.QOL.ui.audio.render(env.list);
    const buttons = env.list.FindChildrenWithClassTraverse("DL4DReminderTestBtn").filter(button => !button.BHasClass("SoundPreviewBtn"));
    assert.equal(buttons.length, DL4D.length);
    for (let volume = 0; volume <= 100; volume++) {
        env.global.MOD_CONFIG.DL4D_VOLUME = volume;
        const events = env.run({ ENABLE_DL4D_REMINDERS: 1, DL4D_VOLUME: volume }, DL4D.map(([second]) => second));
        assert.equal(events.length, DL4D.length, `DL4D volume ${volume}: each reminder must dispatch`);
        DL4D.forEach(([, name, file], index) => {
            const expected = `QOL.DL4D.${name}_V${volume}`;
            const wave = `sounds/dl4d/${file}.wav`;
            assertBinding(definitions, events[index], expected, wave, volume);
            const preview = env.preview(buttons[index]);
            assert.equal(preview.length, 1);
            assertBinding(definitions, preview[0], expected, wave, volume);
        });
        const minimap = env.run({ ENABLE_MINIMAP_REMINDER: 1, VOICE_VOLUME: volume }, [15]);
        assert.equal(minimap.length, 1);
        assertBinding(definitions, minimap[0], `BuffReminder.Minimap_V${volume}`, "sounds/mods/minimap_normal.wav", volume);
    }
    env.assertClean();
});

test("Deadlock For Dummies per-reminder mutes silence only that reminder and its preview", () => {
    const env = audioEnvironment();
    env.global.QOL.ui.audio.render(env.list);
    const buttons = env.list.FindChildrenWithClassTraverse("DL4DReminderTestBtn").filter(button => !button.BHasClass("SoundPreviewBtn"));
    const seconds = DL4D.map(([second]) => second);
    const cfg = env.global.MOD_CONFIG;
    const reminders = env.global.QOL.ui.audio.DL4D_REMINDER_OPTIONS;
    const setMutes = (value, only = reminders) => { for (const reminder of only) cfg[reminder.muteKey] = value; };
    const mutes = () => Object.fromEntries(reminders.map(reminder => [reminder.muteKey, cfg[reminder.muteKey]]));
    setMutes(0);
    assert.equal(env.run({ ENABLE_DL4D_REMINDERS: 1, ...mutes() }, seconds).length, DL4D.length);
    // Mute one reminder: only its own sound and preview go quiet.
    cfg[reminders[0].muteKey] = 1;
    const partial = env.run({ ENABLE_DL4D_REMINDERS: 1, ENABLE_DL4D_CAPTIONS: 1, ...mutes() }, seconds);
    assert.equal(partial.length, DL4D.length - 1);
    assert.ok(!partial.some(name => name.startsWith("QOL.DL4D.SmallCampsBoxes_")), "the muted reminder stays silent");
    assert.deepEqual(env.preview(buttons[0]), [], "its preview is silent");
    assert.equal(env.preview(buttons[1]).length, 1, "other previews still play");
    // The main Mute alone does not silence anything; it only sets the per-reminder mutes.
    setMutes(0); cfg.MUTE_DL4D = 1;
    assert.equal(env.run({ ENABLE_DL4D_REMINDERS: 1, MUTE_DL4D: 1, ...mutes() }, seconds).length, DL4D.length);
    cfg.MUTE_DL4D = 0;
    env.assertClean();
});

test("the main Deadlock For Dummies Mute mutes every reminder, and each can then be unmuted on its own", () => {
    const env = audioEnvironment();
    env.global.QOL.ui.audio.render(env.list);
    const seconds = DL4D.map(([second]) => second);
    const cfg = env.global.MOD_CONFIG;
    const reminders = env.global.QOL.ui.audio.DL4D_REMINDER_OPTIONS;
    const mutes = () => Object.fromEntries(reminders.map(reminder => [reminder.muteKey, cfg[reminder.muteKey]]));
    const main = env.list.FindChildTraverse("MUTE_DL4DSectionTitleCheckbox");
    assert.ok(main, "the main Mute checkbox sits in the volume slider row");
    cfg.MUTE_DL4D = 0; for (const reminder of reminders) cfg[reminder.muteKey] = 0;

    assert.equal(main._fire("onactivate"), true);
    assert.equal(cfg.MUTE_DL4D, 1);
    assert.ok(reminders.every(reminder => cfg[reminder.muteKey] === 1), "turning the main Mute on mutes every reminder");
    assert.deepEqual(env.run({ ENABLE_DL4D_REMINDERS: 1, ...mutes() }, seconds), [], "everything is silent");

    cfg[reminders[6].muteKey] = 0; // Rune, which fires several times
    const runeOnly = env.run({ ENABLE_DL4D_REMINDERS: 1, ...mutes() }, seconds);
    assert.ok(runeOnly.length > 0 && runeOnly.every(name => name.startsWith("QOL.DL4D.Rune_")), "only the unmuted reminder is heard");
    assert.equal(cfg.MUTE_DL4D, 1, "the main Mute stays on while individual reminders are unmuted");

    assert.equal(main._fire("onactivate"), true);
    assert.equal(cfg.MUTE_DL4D, 0);
    assert.ok(reminders.every(reminder => cfg[reminder.muteKey] === 0), "turning the main Mute off unmutes every reminder");
    assert.equal(env.run({ ENABLE_DL4D_REMINDERS: 1, ...mutes() }, seconds).length, DL4D.length);
    env.assertClean();
});

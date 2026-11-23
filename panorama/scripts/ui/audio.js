// =============================================================================
// QOLLOCK — ui/audio.js
// =============================================================================
// OWNS:        Audio and Announcer settings subsystem:
//              Custom announcer pack slots metadata & tooltip/hover resolution,
//              Announcer & DL4D reminder sound preview playback,
//              DL4D reminder options & interactive sound test row controls,
//              Audio tab rendering and registration.
// DOES NOT OWN: Low-level slider/dropdown DOM creation (ui/renderer.js),
//               Config persistence (core/ql_persistence.js, core/ql_config_store.js),
//               Core sound playback engine (handled via Panorama PlaySoundEffect).
// DEPENDS ON:  core/ql_namespace.js, core/ql_config.js
// USED BY:     hud_escape_menu.xml, ui/window.js, ql_settings.js
// =============================================================================

(() => {
    "use strict";

    const Q = (typeof globalThis !== "undefined" && globalThis.QOL)
        ? globalThis.QOL
        : (typeof QOL !== "undefined" ? QOL : (globalThis.QOL = {}));
    Q.ui = Q.ui || {};

    // =========================================================================
    // Announcer Pack & Slot Metadata Resolution
    // =========================================================================

    function getAnnouncerVoiceToken(rawVoiceType) {
        const utils = (typeof GetSharedSchemaUtils === "function") ? GetSharedSchemaUtils() : null;
        if (utils && typeof utils.GetAnnouncerVoiceToken === "function") {
            return utils.GetAnnouncerVoiceToken(rawVoiceType);
        }
        const normalize = (typeof NormalizeVoiceTypeValue === "function")
            ? NormalizeVoiceTypeValue
            : (Q.normalizeVoiceTypeValue || ((v) => Math.round(Number(v) || 0)));
        const normalized = normalize(rawVoiceType);
        switch (normalized) {
            case 4: return "Beep";
            case 5: return "Custom_Slot2";
            case 6: return "Custom_Slot3";
            case 7: return "Custom_Slot4";
            case 8: return "Custom_Slot5";
            case 0:
            default:
                break;
        }
        return "Custom_Slot1";
    }

    function resolveCustomAnnouncerMetaField(source, keys) {
        if (!source || typeof source !== "object") return "";
        for (let k = 0; k < keys.length; k++) {
            const val = source[keys[k]];
            if (val && typeof val === "string" && val.trim().length > 0) return val.trim();
        }
        return "";
    }

    function resolveCustomAnnouncerSlotScriptMetadata(slotIndex) {
        const safeIndex = Math.max(1, Math.min(5, Math.round(Number(slotIndex) || 1)));
        let source = null;
        const globalKey = `QOL_CUSTOM_ANNOUNCER_SLOT${safeIndex}_META`;
        const registryKey = String(safeIndex);
        try {
            if (typeof globalThis === "object" && globalThis) {
                const registry = globalThis.QOL_CUSTOM_ANNOUNCER_PACK_SLOTS;
                if (registry && typeof registry === "object") {
                    if (Object.prototype.hasOwnProperty.call(registry, registryKey)) {
                        source = registry[registryKey];
                    } else if (Object.prototype.hasOwnProperty.call(registry, safeIndex)) {
                        source = registry[safeIndex];
                    }
                }
                if (!source) source = globalThis[globalKey];
            }
        } catch (_) { source = null; }
        return {
            name: resolveCustomAnnouncerMetaField(source, ["name", "Name", "NAME"]),
            author: resolveCustomAnnouncerMetaField(source, ["author", "Author", "AUTHOR"]),
            voiceActor: resolveCustomAnnouncerMetaField(source, [
                "voiceActor", "voice_actor", "VoiceActor", "Voice_Actor", "voice actor", "Voice Actor", "VOICE_ACTOR"
            ])
        };
    }

    function resolveCustomAnnouncerSlotLabel(slotIndex, fallbackLabel) {
        const safeIndex = Math.max(1, Math.min(5, Math.round(Number(slotIndex) || 1)));
        const scriptMeta = resolveCustomAnnouncerSlotScriptMetadata(safeIndex);
        if (scriptMeta && scriptMeta.name) return scriptMeta.name;
        return String(fallbackLabel || `Custom Slot ${safeIndex}`);
    }

    function resolveCustomAnnouncerSlotMetadata(slotIndex) {
        const safeIndex = Math.max(1, Math.min(5, Math.round(Number(slotIndex) || 1)));
        const scriptMeta = resolveCustomAnnouncerSlotScriptMetadata(safeIndex);
        return {
            name: String(scriptMeta?.name || ""),
            author: String(scriptMeta?.author || ""),
            voiceActor: String(scriptMeta?.voiceActor || "")
        };
    }

    function getCustomAnnouncerSlotIndexFromVoiceType(rawVoiceType) {
        const normalize = (typeof NormalizeVoiceTypeValue === "function")
            ? NormalizeVoiceTypeValue
            : (Q.normalizeVoiceTypeValue || ((v) => Math.round(Number(v) || 0)));
        const voiceType = normalize(rawVoiceType);
        if (voiceType === 0) return 1;
        if (voiceType === 5) return 2;
        if (voiceType === 6) return 3;
        if (voiceType === 7) return 4;
        if (voiceType === 8) return 5;
        return 0;
    }

    function getCustomAnnouncerSlotIndexFromOptionValue(optionValue) {
        const asInt = Math.round(Number(optionValue));
        if (!Number.isFinite(asInt)) return 0;
        if (asInt === 0) return 1;
        if (asInt === 5) return 2;
        if (asInt === 6) return 3;
        if (asInt === 7) return 4;
        if (asInt === 8) return 5;
        return 0;
    }

    function buildCustomAnnouncerSlotMetadataTooltipText(slotIndex) {
        const safeIndex = Math.max(1, Math.min(5, Math.round(Number(slotIndex) || 1)));
        const slotMeta = resolveCustomAnnouncerSlotMetadata(safeIndex);
        const authorText = String(slotMeta?.author || "").trim();
        const voiceActorText = String(slotMeta?.voiceActor || "").trim();
        const lines = [];
        if (authorText.length > 0) lines.push(`Author: ${authorText}`);
        if (voiceActorText.length > 0) lines.push(`Voice Actor: ${voiceActorText}`);
        return lines.join("\n");
    }

    function buildCustomAnnouncerSlotMetadataHoverInfo(slotIndex) {
        const safeIndex = Math.max(1, Math.min(5, Math.round(Number(slotIndex) || 1)));
        const slotMeta = resolveCustomAnnouncerSlotMetadata(safeIndex);
        return {
            author: String(slotMeta?.author || "").trim(),
            voiceActor: String(slotMeta?.voiceActor || "").trim()
        };
    }

    function buildCustomAnnouncerVoiceDescription(baseDescription, rawVoiceType) {
        const base = String(baseDescription || "");
        const slotIndex = getCustomAnnouncerSlotIndexFromVoiceType(rawVoiceType);
        if (slotIndex <= 0) return base;

        const lines = [];
        if (base) lines.push(base);
        const slotMetaText = buildCustomAnnouncerSlotMetadataTooltipText(slotIndex);
        if (slotMetaText) lines.push(slotMetaText);
        return lines.join("\n");
    }

    function buildVoiceDropdownOptions() {
        return [
            { label: "Beep", value: 4 },
            { label: resolveCustomAnnouncerSlotLabel(1, "Custom Slot 1"), value: 0 },
            { label: resolveCustomAnnouncerSlotLabel(2, "Custom Slot 2"), value: 5 },
            { label: resolveCustomAnnouncerSlotLabel(3, "Custom Slot 3"), value: 6 },
            { label: resolveCustomAnnouncerSlotLabel(4, "Custom Slot 4"), value: 7 },
            { label: resolveCustomAnnouncerSlotLabel(5, "Custom Slot 5"), value: 8 }
        ];
    }

    // =========================================================================
    // Sound Preview Events & Playback
    // =========================================================================

    function buildAnnouncerPreviewEventName() {
        const voiceType = (typeof globalThis.MOD_CONFIG === "object" && globalThis.MOD_CONFIG) ? globalThis.MOD_CONFIG.VOICE_TYPE : 0;
        const voiceToken = getAnnouncerVoiceToken(voiceType);
        if (voiceToken === "Beep") return "BuffReminder.Beep";
        return `BuffReminder.Bridge1_${voiceToken}`;
    }

    function buildAnnouncerBridgeVariantPreviewEventName(variantIndex) {
        const voiceType = (typeof globalThis.MOD_CONFIG === "object" && globalThis.MOD_CONFIG) ? globalThis.MOD_CONFIG.VOICE_TYPE : 0;
        const voiceToken = getAnnouncerVoiceToken(voiceType);
        let variant = Math.round(Number(variantIndex) || 1);
        if (!Number.isFinite(variant) || variant < 1 || variant > 3) variant = 1;
        if (voiceToken === "Beep") return "BuffReminder.Beep";
        return `BuffReminder.Bridge${variant}_${voiceToken}`;
    }

    function resolveAnnouncerEventForVolume(baseEventName) {
        const baseName = String(baseEventName || "");
        if (!baseName) return "";
        const normalize = (typeof NormalizeVoiceVolumeValue === "function")
            ? NormalizeVoiceVolumeValue
            : (Q.normalizeVoiceVolumeValue || ((v) => Math.round(Number(v) || 50)));
        const volume = (typeof globalThis.MOD_CONFIG === "object" && globalThis.MOD_CONFIG) ? globalThis.MOD_CONFIG.VOICE_VOLUME : 50;
        const voiceVolume = normalize(volume);
        return `${baseName}_V${voiceVolume}`;
    }

    function playAnnouncerPreviewSound() {
        const eventName = resolveAnnouncerEventForVolume(buildAnnouncerPreviewEventName());
        if (eventName && typeof $.DispatchEvent === "function") {
            $.DispatchEvent("PlaySoundEffect", eventName);
        }
    }

    function playAnnouncerBridgeVariantPreviewSound(variantIndex) {
        const eventName = resolveAnnouncerEventForVolume(buildAnnouncerBridgeVariantPreviewEventName(variantIndex));
        if (eventName && typeof $.DispatchEvent === "function") {
            $.DispatchEvent("PlaySoundEffect", eventName);
        }
    }

    function resolveDl4dReminderEventForVolume(eventBase) {
        const baseName = String(eventBase || "");
        if (!baseName) return "";
        const normalize = (typeof NormalizeVoiceVolumeValue === "function")
            ? NormalizeVoiceVolumeValue
            : (Q.normalizeVoiceVolumeValue || ((v) => Math.round(Number(v) || 50)));
        const volume = (typeof globalThis.MOD_CONFIG === "object" && globalThis.MOD_CONFIG) ? globalThis.MOD_CONFIG.DL4D_VOLUME : 50;
        return `${baseName}_V${normalize(volume)}`;
    }

    function playDl4dReminderPreviewSound(eventBase, muteKey) {
        const cfg = (typeof globalThis.MOD_CONFIG === "object" && globalThis.MOD_CONFIG) ? globalThis.MOD_CONFIG : null;
        if (muteKey && cfg && Number(cfg[muteKey]) === 1) return; // a muted reminder's preview stays silent too
        const eventName = resolveDl4dReminderEventForVolume(eventBase);
        if (!eventName) return;
        if (typeof $.DispatchEvent === "function") {
            $.DispatchEvent("PlaySoundEffect", eventName);
        }
    }

    // =========================================================================
    // Announcer & Reminder Filter Options
    // =========================================================================

    const NEUTRAL_CAMP_TIER_OPTIONS = [
        { label: "Tier 1", key: "ENABLE_ONE_TIME_TIER1" },
        { label: "Tier 2", key: "ENABLE_ONE_TIME_TIER2" },
        { label: "Tier 3", key: "ENABLE_ONE_TIME_TIER3" },
        { label: "Buff", key: "ENABLE_INTERVAL" }
    ];

    const BRIDGE_BUFF_FILTER_OPTIONS = [
        { label: "1st", key: "ENABLE_BUFF_SOUND_1" },
        { label: "2nd", key: "ENABLE_BUFF_SOUND_2" },
        { label: "3rd", key: "ENABLE_BUFF_SOUND_3" }
    ];

    const DL4D_REMINDER_OPTIONS = [
        { label: "Small Camps + Boxes", key: "ENABLE_DL4D_SMALL_CAMPS_BOXES", muteKey: "MUTE_DL4D_SMALL_CAMPS_BOXES", eventBase: "QOL.DL4D.SmallCampsBoxes" },
        { label: "Rune + Melee Troopers", key: "ENABLE_DL4D_RUNE_MELEE_TROOPERS", muteKey: "MUTE_DL4D_RUNE_MELEE_TROOPERS", eventBase: "QOL.DL4D.RuneMeleeTroopers" },
        { label: "Medium Camps", key: "ENABLE_DL4D_MEDIUM_CAMPS", muteKey: "MUTE_DL4D_MEDIUM_CAMPS", eventBase: "QOL.DL4D.MediumCamps" },
        { label: "Big Camps + Sinners", key: "ENABLE_DL4D_BIG_CAMPS_SINNERS", muteKey: "MUTE_DL4D_BIG_CAMPS_SINNERS", eventBase: "QOL.DL4D.BigCampsSinners" },
        { label: "Urn + Gold Rune", key: "ENABLE_DL4D_MIDBOSS_URN_GOLD_RUNE", muteKey: "MUTE_DL4D_MIDBOSS_URN_GOLD_RUNE", eventBase: "QOL.DL4D.MidbossUrnGoldRune" },
        { label: "Lane Guardian Weak", key: "ENABLE_DL4D_LANE_GUARDIAN_WEAK", muteKey: "MUTE_DL4D_LANE_GUARDIAN_WEAK", eventBase: "QOL.DL4D.LaneGuardianWeak" },
        { label: "Rune", key: "ENABLE_DL4D_RUNE", muteKey: "MUTE_DL4D_RUNE", eventBase: "QOL.DL4D.Rune" },
        { label: "Walker Weak", key: "ENABLE_DL4D_WALKER_WEAK", muteKey: "MUTE_DL4D_WALKER_WEAK", eventBase: "QOL.DL4D.WalkerWeak" },
        { label: "Rune + Fast Troopers", key: "ENABLE_DL4D_RUNE_FAST_TROOPERS", muteKey: "MUTE_DL4D_RUNE_FAST_TROOPERS", eventBase: "QOL.DL4D.RuneFastTroopers" },
        { label: "Rune + Gold Buffs", key: "ENABLE_DL4D_RUNE_GOLD_BUFFS", muteKey: "MUTE_DL4D_RUNE_GOLD_BUFFS", eventBase: "QOL.DL4D.RuneGoldBuffs" },
        { label: "Rune + Troopers 20s HP", key: "ENABLE_DL4D_RUNE_TROOPERS20_HP", muteKey: "MUTE_DL4D_RUNE_TROOPERS20_HP", eventBase: "QOL.DL4D.RuneTroopers20Hp" }
    ];

    // Icon-only "play sound" button appended to a settings row. The label feeds the tooltip.
    function attachSoundTestButton(row, label, playSound, extraClass) {
        const testBtn = $.CreatePanel("Button", row, "");
        testBtn.AddClass("SectionTitleActionBtn");
        testBtn.AddClass("DL4DReminderTestBtn");
        if (extraClass) testBtn.AddClass(extraClass);
        const testIcon = $.CreatePanel("Image", testBtn, "", {
            src: "s2r://panorama/images/icons/icon_sound_on.vsvg",
            defaultsrc: "",
            scaling: "contain"
        });
        testIcon.AddClass("SectionTitleActionIcon");
        testIcon.AddClass("DL4DReminderTestIcon");

        testBtn.SetPanelEvent("onmouseover", () => {
            if (Q.tooltip) {
                try {
                    Q.tooltip.hideTextTooltip();
                    Q.tooltip.cancelHide();
                    const playText = (typeof LocalizeSettingsText === "function")
                        ? `${LocalizeSettingsText("Play Sound", true)} ${LocalizeSettingsText(label || "", true)}`
                        : `Play Sound ${label || ""}`;
                    Q.tooltip.showRowTooltip(testBtn, "", playText, "none", "");
                } catch (_) {}
            }
        });
        testBtn.SetPanelEvent("onmouseout", () => {
            if (Q.tooltip) {
                try { Q.tooltip.hideTooltipDeferred("dl4d_reminder_test_mouseout"); } catch (_) {}
            }
        });
        testBtn.SetPanelEvent("onactivate", () => {
            playSound();
            testBtn.AddClass("SuccessState");
            $.Schedule(0.28, () => {
                if (testBtn && typeof testBtn.IsValid === "function" && testBtn.IsValid()) {
                    testBtn.RemoveClass("SuccessState");
                }
            });
        });
        return testBtn;
    }

    function createDl4dReminderRow(parent, reminder) {
        if (!reminder || !reminder.key) return null;
        let row = null;
        if (typeof globalThis.CreateRow === "function") {
            row = globalThis.CreateRow(parent, reminder.label, reminder.key, "toggle", null, null, null, null);
        } else if (Q.ui?.renderer?.createToggle) {
            const val = (typeof globalThis.MOD_CONFIG === "object" && globalThis.MOD_CONFIG) ? globalThis.MOD_CONFIG[reminder.key] : 0;
            const res = Q.ui.renderer.createToggle(parent, { key: reminder.key, label: reminder.label }, val, (k, v) => {
                if (typeof globalThis.MOD_CONFIG === "object" && globalThis.MOD_CONFIG) globalThis.MOD_CONFIG[k] = v;
                if (typeof globalThis.SaveAndSync === "function") globalThis.SaveAndSync();
            });
            row = res?.row || null;
        }
        if (!row || (row.IsValid && !row.IsValid())) return row;
        row.AddClass("DL4DReminderRow");

        // Per-reminder Mute checkbox, before the preview button.
        if (reminder.muteKey && typeof globalThis.CreateSectionTitleCheckboxToggle === "function") {
            globalThis.CreateSectionTitleCheckboxToggle(row, "Mute", reminder.muteKey, {
                description: "Mute the sound for this reminder. Its caption still shows."
            });
        }
        attachSoundTestButton(row, reminder.label, () => playDl4dReminderPreviewSound(reminder.eventBase, reminder.muteKey));
        return row;
    }

    // =========================================================================
    // Hitsound / Killsound Options
    // =========================================================================

    const HIT_KILL_DEFAULT_VOLUME = 10; // matches the HITSOUND_VOLUME / KILLSOUND_VOLUME defaults

    // Event and folder names drop everything but letters and digits ("Quake 3" -> "Quake3").
    function soundEventSlug(label) {
        return String(label).replace(/[^A-Za-z0-9]/g, "");
    }

    // Option labels come from the shared catalog, which also owns the stored values.
    // Name / Description / Credit of the Custom option, set by an installed pack from the QOL Lock
    // Audio Pack Builder (see ql_custom_hit_sound_pack_meta.js). Without a pack it stays "Custom".
    function resolveCustomSoundInfo(kind) {
        const all = (typeof globalThis === "object" && globalThis) ? globalThis.QOL_HIT_KILL_SOUND_CUSTOM : null;
        const info = (all && typeof all === "object") ? all[kind] : null;
        const text = (value) => (typeof value === "string" ? value.trim() : "");
        return { name: text(info && info.name), description: text(info && info.description), credit: text(info && info.credit) };
    }

    // The Custom option shows the pack's Name in the dropdown, with its Description and Credit on hover.
    function buildSoundTypeOptions(typeKey, kind, title) {
        const custom = resolveCustomSoundInfo(kind);
        return Q.settings.get(typeKey).options.map(([value, label]) => {
            if (label !== "Custom") return { value, label };
            return {
                value,
                label: custom.name || label,
                description: custom.description || `Make your own ${title} with the QOL Lock Audio Pack Builder (up to 100 clips)`,
                createdBy: custom.credit
            };
        });
    }

    // Mirrors the runtime: <prefix>.<option name>_V<volume>, using the live settings values.
    function resolveHitKillPreviewEvent(prefix, typeKey, volumeKey) {
        const cfg = (typeof globalThis.MOD_CONFIG === "object" && globalThis.MOD_CONFIG) ? globalThis.MOD_CONFIG : {};
        const options = Q.settings.get(typeKey).options;
        const picked = options.find(([value]) => value === Math.round(Number(cfg[typeKey]))) || options[0];
        const rawVolume = cfg[volumeKey] === undefined ? HIT_KILL_DEFAULT_VOLUME : cfg[volumeKey];
        const volume = Q.normalizeVoiceVolumeValue ? Q.normalizeVoiceVolumeValue(rawVolume) : Math.round(Number(rawVolume) || HIT_KILL_DEFAULT_VOLUME);
        return `${prefix}.${soundEventSlug(picked[1])}_V${volume}`;
    }

    // =========================================================================
    // Audio Tab Content Renderer
    // =========================================================================

    function renderAudioTab(list) {
        if (!list && !globalThis.gSearchCollectMode) return;

        const createTitle = (typeof globalThis.CreateSectionTitle === "function")
            ? globalThis.CreateSectionTitle
            : ((p, t) => Q.ui?.renderer?.createSectionHeader?.(p, t));
        const createRow = (typeof globalThis.CreateRow === "function")
            ? globalThis.CreateRow
            : null;
        const createSlider = (typeof globalThis.CreateSliderRow === "function")
            ? globalThis.CreateSliderRow
            : null;
        const createSep = (typeof globalThis.CreateSeparator === "function")
            ? globalThis.CreateSeparator
            : ((p) => Q.ui?.renderer?.createSeparator?.(p));
        const createToggleSec = (typeof globalThis.CreateAnimatedInlineToggleSection === "function")
            ? globalThis.CreateAnimatedInlineToggleSection
            : ((p, t, k, d, cb) => Q.ui?.renderer?.createAnimatedInlineToggleSection?.(p, t, k, d, cb));

        // 1. Announcer Section
        createTitle(list, "Announcer");
        if (createRow) {
            createRow(list, "Voice", "VOICE_TYPE", "dropdown", null, null, null, buildVoiceDropdownOptions());
            if (createSlider) createSlider(list, "Volume", "VOICE_VOLUME", "volume_0_100");
            const announcerTypeRow = createRow(list, "Type", null, "multitoggle", null, null, null, NEUTRAL_CAMP_TIER_OPTIONS);
            if (announcerTypeRow && typeof announcerTypeRow.IsValid === "function" && announcerTypeRow.IsValid()) {
                announcerTypeRow.AddClass("AnnouncerTypeFilterRow");
            }
            const announcerBuffFilterRow = createRow(list, "Buff Filter", null, "multitoggle", null, null, null, BRIDGE_BUFF_FILTER_OPTIONS);
            if (announcerBuffFilterRow && typeof announcerBuffFilterRow.IsValid === "function" && announcerBuffFilterRow.IsValid()) {
                announcerBuffFilterRow.AddClass("AnnouncerTypeFilterRow");
            }
            if (createSlider) createSlider(list, "Buff Delay", "BRIDGE_BUFF_START", "sec_0_60", "In Seconds");
        }

        createSep(list);

        // 2. Minimap Reminder Section
        createToggleSec(list, "Minimap Reminder", "ENABLE_MINIMAP_REMINDER", "Ding to Check Minimap", (sectionParent) => {
            if (createSlider) createSlider(sectionParent, "Timer", "MINIMAP_REMINDER_INTERVAL", "sec_5_60", "In Seconds");
        });

        createSep(list);

        // 3. Deadlock For Dummies Section
        createToggleSec(list, "Deadlock For Dummies", "ENABLE_DL4D_REMINDERS", "Timed audio reminders from Deadlock For Dummies.", (sectionParent) => {
            if (createSlider) {
                // The main Mute sets every reminder's own Mute; reminders can then be unmuted one by one.
                createSlider(sectionParent, "Volume", "DL4D_VOLUME", "volume_0_100", null, false, {
                    label: "Mute",
                    key: "MUTE_DL4D",
                    description: "Mute every Deadlock For Dummies reminder sound. Turn off Mute on a reminder to hear just that one.",
                    refreshListOnChange: true,
                    onToggle: (muted, config) => {
                        for (const reminder of DL4D_REMINDER_OPTIONS) config[reminder.muteKey] = muted ? 1 : 0;
                    }
                });
            }
            if (createRow) createRow(sectionParent, "Captions", "ENABLE_DL4D_CAPTIONS", "toggle", null, null, null, null);
            for (let dl4dIndex = 0; dl4dIndex < DL4D_REMINDER_OPTIONS.length; dl4dIndex++) {
                createDl4dReminderRow(sectionParent, DL4D_REMINDER_OPTIONS[dl4dIndex]);
            }
        });

        // 4. Hitsound and Killsound Sections (each toggles independently)
        for (const [title, enableKey, typeKey, volumeKey, prefix, description, kind] of [
            ["Hitsound", "ENABLE_HITSOUND", "HITSOUND_TYPE", "HITSOUND_VOLUME", "QOL.Hitsound", "Play a sound each time you land a hit.", "hit"],
            ["Killsound", "ENABLE_KILLSOUND", "KILLSOUND_TYPE", "KILLSOUND_VOLUME", "QOL.Killsound", "Play a sound when you kill an enemy hero.", "kill"]
        ]) {
            createSep(list);
            createToggleSec(list, title, enableKey, description, (sectionParent) => {
                const soundRow = createRow
                    ? createRow(sectionParent, "Sound", typeKey, "dropdown", null, null, null, buildSoundTypeOptions(typeKey, kind, title))
                    : null;
                if (soundRow && !(soundRow.IsValid && !soundRow.IsValid())) {
                    attachSoundTestButton(soundRow, title, () => {
                        const eventName = resolveHitKillPreviewEvent(prefix, typeKey, volumeKey);
                        if (eventName && typeof $.DispatchEvent === "function") $.DispatchEvent("PlaySoundEffect", eventName);
                    }, "SoundPreviewBtn");
                }
                if (createSlider) createSlider(sectionParent, "Volume", volumeKey, "volume_0_100");
            });
        }
    }

    // Register custom tab renderer with window manager if available
    if (Q.ui?.window?.registerTabRenderer) {
        Q.ui.window.registerTabRenderer("Audio", renderAudioTab);
    }

    // =========================================================================
    // Public API Export & Backwards Compatibility
    // =========================================================================

    const audioApi = {
        getAnnouncerVoiceToken,
        resolveCustomAnnouncerMetaField,
        resolveCustomAnnouncerSlotScriptMetadata,
        resolveCustomAnnouncerSlotLabel,
        resolveCustomAnnouncerSlotMetadata,
        getCustomAnnouncerSlotIndexFromVoiceType,
        getCustomAnnouncerSlotIndexFromOptionValue,
        buildCustomAnnouncerSlotMetadataTooltipText,
        buildCustomAnnouncerSlotMetadataHoverInfo,
        buildCustomAnnouncerVoiceDescription,
        buildVoiceDropdownOptions,
        buildAnnouncerPreviewEventName,
        buildAnnouncerBridgeVariantPreviewEventName,
        resolveAnnouncerEventForVolume,
        playAnnouncerPreviewSound,
        playAnnouncerBridgeVariantPreviewSound,
        resolveDl4dReminderEventForVolume,
        playDl4dReminderPreviewSound,
        createDl4dReminderRow,
        render: renderAudioTab,
        DL4D_REMINDER_OPTIONS,
        NEUTRAL_CAMP_TIER_OPTIONS,
        BRIDGE_BUFF_FILTER_OPTIONS,
    };

    Q.ui.audio = audioApi;

    // Transitional global bindings
    if (typeof globalThis === "object" && globalThis) {
        globalThis.GetAnnouncerVoiceToken = getAnnouncerVoiceToken;
        globalThis.ResolveCustomAnnouncerMetaField = resolveCustomAnnouncerMetaField;
        globalThis.ResolveCustomAnnouncerSlotScriptMetadata = resolveCustomAnnouncerSlotScriptMetadata;
        globalThis.ResolveCustomAnnouncerSlotLabel = resolveCustomAnnouncerSlotLabel;
        globalThis.ResolveCustomAnnouncerSlotMetadata = resolveCustomAnnouncerSlotMetadata;
        globalThis.GetCustomAnnouncerSlotIndexFromVoiceType = getCustomAnnouncerSlotIndexFromVoiceType;
        globalThis.GetCustomAnnouncerSlotIndexFromOptionValue = getCustomAnnouncerSlotIndexFromOptionValue;
        globalThis.BuildCustomAnnouncerSlotMetadataTooltipText = buildCustomAnnouncerSlotMetadataTooltipText;
        globalThis.BuildCustomAnnouncerSlotMetadataHoverInfo = buildCustomAnnouncerSlotMetadataHoverInfo;
        globalThis.BuildCustomAnnouncerVoiceDescription = buildCustomAnnouncerVoiceDescription;
        globalThis.BuildVoiceDropdownOptions = buildVoiceDropdownOptions;
        globalThis.BuildAnnouncerPreviewEventName = buildAnnouncerPreviewEventName;
        globalThis.BuildAnnouncerBridgeVariantPreviewEventName = buildAnnouncerBridgeVariantPreviewEventName;
        globalThis.ResolveAnnouncerEventForVolume = resolveAnnouncerEventForVolume;
        globalThis.PlayAnnouncerPreviewSound = playAnnouncerPreviewSound;
        globalThis.PlayAnnouncerBridgeVariantPreviewSound = playAnnouncerBridgeVariantPreviewSound;
        globalThis.ResolveDl4dReminderEventForVolume = resolveDl4dReminderEventForVolume;
        globalThis.PlayDl4dReminderPreviewSound = playDl4dReminderPreviewSound;
        globalThis.CreateDl4dReminderRow = createDl4dReminderRow;
        globalThis.DL4D_REMINDER_OPTIONS = DL4D_REMINDER_OPTIONS;
        if (!globalThis.NEUTRAL_CAMP_TIER_OPTIONS) globalThis.NEUTRAL_CAMP_TIER_OPTIONS = NEUTRAL_CAMP_TIER_OPTIONS;
        if (!globalThis.BRIDGE_BUFF_FILTER_OPTIONS) globalThis.BRIDGE_BUFF_FILTER_OPTIONS = BRIDGE_BUFF_FILTER_OPTIONS;
    }
})();

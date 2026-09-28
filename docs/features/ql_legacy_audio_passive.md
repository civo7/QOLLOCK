# Legacy announcer, DL4D reminders, and basic passive cooldown layout

Runtime: `panorama/scripts/manifests/ql_legacy_audio_passive/manifest.js`.
Audio controls: `panorama/scripts/ui/audio.js`. Shared flat defaults and ranges:
`panorama/scripts/ql_shared_presets.js`.

## Configuration and timing

The always-enabled manifest reads its own ConfigStore bucket through
`ctx.config.view()`. Every setting it consumes must be registered in its
`settings` array so that flat config imports, live edits, and exports reach it.

| Setting | Existing default | Behavior |
| --- | --- | --- |
| `ENABLE_INTERVAL` | `false` | Enables repeating bridge buff announcements. |
| `BRIDGE_BUFF_START` | `30` | Seconds before each five-minute boundary to announce; zero announces at the boundary. The Audio UI/shared schema exposes 0–60 seconds. |
| `ENABLE_MINIMAP_REMINDER` | `false` | Enables the recurring minimap sound. |
| `MINIMAP_REMINDER_INTERVAL` | `15` | Seconds between minimap reminders, from 5 to 60 in steps of 1. |
| `VOICE_TYPE` | `"0"` | Selects the announcer voice token. |
| `VOICE_VOLUME` | `70` | Selects the sound-event volume variant. |
| `ENABLE_DL4D_REMINDERS` | `false` | Enables the independent fixed timetable of Deadlock For Dummies reminders. |
| `ENABLE_DL4D_CAPTIONS` | `false` | Displays captions for enabled DL4D reminders. |
| `DL4D_VOLUME` | `70` | Selects DL4D sound-event volume variants. |

The complete settings list, including camp tiers, sound variants, DL4D event
filters, and shared passive cooldown settings, is in the manifest. This module
also applies size, position, opacity, and shop visibility to the basic passive
items HUD; advanced item mirroring is implemented separately.

`BRIDGE_BUFF_START` controls the repeating announcer only. DL4D reminders use
their own fixed times and are not moved by this slider. For example, a
15-second lead schedules the repeating bridge sound at 04:45 and 09:45.

## Lifecycle and native boundary

`onEnable()` starts a scheduler loop with a 0.5-second interval (2 Hz). Fully idle
work backs off to one second. The runtime reads the existing `HudGameTime` or
`GameTime` label; it emits `$.DispatchEvent("PlaySoundEffect", eventName)` in a
two-second alert window and tracks fired boundaries to prevent duplicates.
`onSettingsChanged()` refreshes fallback config; the live feature view is read
on the next tick. `onDisable()` stops feature tasks and resets trigger/caption
state. Street Brawl suppresses reminder audio. Hideout cleans a visible caption
once and exits before clock discovery/reading or reminder dispatch. A cached
hidden caption does not count as pending cleanup and can be reused next match.

DL4D captions create/reuse `QOLDL4DCaption` and use a token-guarded scheduled hide.
The manifest diagnostic checks for the game clock panel, not audio playback.

## Regression coverage and limits

`tests/audio_runtime.test.js` loads the real config adapter/store and manifest,
supplies a controlled game clock, and observes emitted sound events. It checks
the configured minimap interval across export/reload, the unchanged 15-second
default, duplicate suppression, and bridge lead times of 0, 15, 30, and 60 seconds
across two cycles. It does not prove native sound asset playback or persistence
through the game's storage boundary. In-game checks require the maintainer's
fresh VPK build.

Transition regressions retain a valid clock across both known hideout classes,
after first displaying a DL4D caption. They verify no further clock reads,
caption writes or audio in hideout and normal caption reuse after re-entry.
Disabling reminders also returns to idle even with a cached hidden caption.
Before the fix, caption cleanup could fall through in the same tick and show a
new reminder from the retained clock. This is a reproduced JS logic defect;
whether a particular client retains that clock, or whether this caused its
stutters, still requires native evidence.

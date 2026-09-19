# `panorama/scripts/manifests/ql_legacy_audio_passive` (Legacy Announcer Voice Reminders & Audio Alerts)

## Description
Plays custom audio alerts and announcer voice reminders for crucial match objectives, such as Mid-Boss emergence, Bridge Powerup runes, and Soul Urn spawns. Reintroduces classic Deadlock voice lines to keep players informed of upcoming map events through auditory cues without requiring constant minimap inspection.

## Files
- Manifest: `panorama/scripts/manifests/ql_legacy_audio_passive/manifest.js`
- Audio Assets: Native engine soundevents referenced via `PlaySoundEvent`

## Settings & Defaults
| Config Key | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `ENABLE_LEGACY_AUDIO` | `toggle` | `false` | Master toggle to enable legacy audio cues and announcer reminders. |
| `ENABLE_MIDBOSS_VOICE_ALERT` | `toggle` | `false` | Plays audio notification 30 seconds prior to Mid-Boss spawning. |
| `ENABLE_URN_VOICE_ALERT` | `toggle` | `false` | Plays voice line when the Soul Urn drops and becomes available for pickup. |
| `AUDIO_VOLUME` | `slider` | `80` | Playback volume percentage for legacy voice cues (0% to 100%). |

## Architecture & Lifecycle

### Activation & Lifecycle Hooks
- **`onEnable()`**: Initiates a low-frequency polling loop via `QOL.core.Scheduler` running at 0.5Hz (`2.0s` interval) to evaluate match clock intervals.
- **`onDisable()`**: Cancels scheduler task and resets objective trigger tracking flags.
- **`onSettingsChanged()`**: Synchronously updates audio volume multipliers and alert flags.
- **`test()`**: Verifies that the game time engine helper `QOL.core.time.getGameTime()` is operational.

### DOM Injection & Target Panels
- **DOM Creation**: Zero DOM elements created.
- **Audio Primitives**: Triggers native soundevents using Panorama's audio subsystem (`$.PlaySoundEvent()` or custom engine sound strings).

### Engine Events & Polling Frequency
- **Polling Frequency**: 0.5Hz (`2.0s` interval), providing accurate timing while consuming negligible CPU resources.
- **Engine Events**: None.

### Performance Tier & Caveats
- **Performance Tier**: Low (`< 0.02ms` per tick).
- **Suppression**: Completely muted when connected to the Hideout/Sandbox lobby or during Street Brawl practice mode.
- **Timestamp Gating**: Caches the last triggered game second for each objective category to guarantee voice lines fire exactly once per cycle.

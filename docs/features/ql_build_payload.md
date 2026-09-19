# `panorama/scripts/manifests/ql_build_payload` (Legacy Build Payload Storage & Recovery)

## Description
Provides legacy build payload storage and migration for QOLLOCK settings. Prior to the build description storage format, settings payloads were serialized, split, and stored in community item build category headers using the pattern `[QOL-x-x-x]:base64`. This feature runs a state machine to scan, reconstruct, and migrate these legacy chunks, ensuring seamless migration to current storage mechanisms without data loss.

> [!NOTE]
> This feature is superseded by `ql_build_storage` (which stores settings in build description fields). It remains maintained for backward compatibility and payload recovery.

## Files
- Manifest: `panorama/scripts/manifests/ql_build_payload/manifest.js`
- Styles: None (interacts programmatically with build category text fields)

## Settings & Defaults
| Config Key | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `DEFAULT_HERO` | `dropdown` | `"hero_skyrunner"` | Fallback hero identifier used when scanning and repairing category builds. |
| `AUTO_CORRUPT_REPAIR` | `toggle` | `true` | Automatically identifies and sanitizes corrupted or orphaned legacy category chunks. |

## Architecture & Lifecycle

### Activation & Lifecycle Hooks
- **`onEnable()`**: Starts a state machine task in `QOL.core.Scheduler` running at 5Hz (`0.2s` interval) during active scans, dropping to `5.0s` when idle.
- **`onDisable()`**: Cancels scheduler loops, restores original hero selection if swapped during category inspection, and flushes temporary buffers.
- **`onSettingsChanged()`**: Synchronizes hero defaults and auto-repair policies.
- **`test()`**: Verifies that `#CitadelHudHeroShop` or build modification panels can be queried.

### DOM Injection & Target Panels
- **DOM Creation**: Zero permanent UI panels.
- **Target Panels**:
  - `CitadelHudHeroShop`: Monitored to detect shop and build editor state.
  - Category containers within the build browser (`#Categories`, `#CategoryHeader`, edit text inputs).

### Engine Events & Polling Frequency
- **Polling Frequency**: Adaptive polling—`0.2s` during hero swap, shop opening, and category scanning sequences; backs off to `5.0s` once synchronized or idle.
- **Engine Events**: Observes shop open/close states and build editing view toggles.

### Performance Tier & Caveats
- **Performance Tier**: Low (runs transiently during boot and shop loading, consuming negligible CPU; drops to 0ms impact once sync completes).
- **Safety**: Uses guarded hero swapping (`hero_skyrunner`) to avoid disrupting player hero selection. Restores the player's active hero immediately after reading or writing category chunks.
- **Deprecation**: Maintained solely as a fallback recovery path for legacy QOLLOCK installations.

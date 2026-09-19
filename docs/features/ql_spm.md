# `panorama/scripts/manifests/ql_spm` (Souls Per Minute Display)

## Description
Originally designed to calculate and display live Souls Per Minute (SPM) farming benchmarks on the HUD. This feature has been permanently disabled and converted into a harmless stub to comply with GameBanana community moderation guidelines regarding competitive telemetry advantages.

## Files
- Manifest: `panorama/scripts/manifests/ql_spm/manifest.js`

## Settings & Defaults
| Config Key | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `ENABLE_MIN_SOULS` | `toggle` | `false` | Deprecated setting toggle (inactive stub). |

## Architecture & Lifecycle

### Activation & Lifecycle Hooks
- **`onEnable()`**: No-op stub.
- **`onDisable()`**: No-op stub.
- **`onSettingsChanged()`**: No-op stub.
- **`test()`**: Verifies that the `#TopBar` panel exists in the context tree.

### DOM Injection & Target Panels
- **DOM Creation**: Zero DOM elements created.
- **Target Panels**: None.

### Engine Events & Polling Frequency
- **Polling Frequency**: Zero polling (0Hz).
- **Engine Events**: None.

### Performance Tier & Caveats
- **Performance Tier**: None (`0ms` runtime impact).
- **Moderator Compliance**: Retained purely for configuration backwards compatibility and schema stability.

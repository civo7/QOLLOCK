# `panorama/scripts/manifests/ql_unspent` (Unspent Souls Display)

## Description
Originally designed to calculate and display live unspent soul count badges directly on Top Bar hero portraits, showing how much unspent currency opponents and allies were carrying. This feature has been permanently disabled and converted to a harmless stub in compliance with GameBanana moderation policy regarding unapproved competitive information advantages.

## Files
- Manifest: `panorama/scripts/manifests/ql_unspent/manifest.js`

## Settings & Defaults
| Config Key | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `ENABLE_UNSPENT_SOULS` | `toggle` | `false` | Deprecated setting toggle (inactive stub). |

## Architecture & Lifecycle

### Activation & Lifecycle Hooks
- **`onEnable()`**: No-op stub.
- **`onDisable()`**: No-op stub.
- **`onSettingsChanged()`**: No-op stub.
- **`test()`**: Verifies that `.player_0` class elements can be traversed in the context tree.

### DOM Injection & Target Panels
- **DOM Creation**: Zero DOM elements created.
- **Target Panels**: None.

### Engine Events & Polling Frequency
- **Polling Frequency**: Zero polling (0Hz).
- **Engine Events**: None.

### Performance Tier & Caveats
- **Performance Tier**: None (`0ms` runtime impact).
- **Moderator Compliance**: Retained purely to prevent schema breaks and configuration deserialization errors.

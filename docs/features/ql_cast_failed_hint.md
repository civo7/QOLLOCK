# `panorama/scripts/manifests/ql_cast_failed_hint` (Hide Cast Failed Warning)

## Description
Suppresses the intrusive native "Cast Failed" error notification box that appears in the center of the screen when players attempt to activate abilities during cooldown, out of stamina, or while crowd-controlled (stunned, silenced). This eliminates visual distraction and screen obstruction during rapid-fire ability casting.

## Files
- Manifest: `panorama/scripts/manifests/ql_cast_failed_hint/manifest.js`
- Styles: `panorama/styles/features/ql_feat_cast_failed.css`

## Settings & Defaults
| Config Key | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `HIDE_CAST_FAILED_HINT` | `toggle` | `false` | Completely hides the native "Cast Failed" error prompt box on the HUD. |

## Architecture & Lifecycle

### Activation & Lifecycle Hooks
- **`onEnable()`**: Inspects `HIDE_CAST_FAILED_HINT` and applies the `hide_failed_hint_active` CSS class to the root `#Hud` panel via `QOL.core.hud.syncRootClass`.
- **`onDisable()`**: Strips the `hide_failed_hint_active` CSS class from the root `#Hud` panel.
- **`onSettingsChanged()`**: Synchronously toggles the `hide_failed_hint_active` class based on setting value (0ms latency).
- **`test()`**: Verifies that the `#Hud` container is accessible in the current Panorama context.

### DOM Injection & Target Panels
- **DOM Creation**: Zero DOM elements created.
- **Target Panels**:
  - `#Hud` (resolved via `QOL.core.hud.findHud()` or `$.GetContextPanel()`): Receives the root modifier class `hide_failed_hint_active`.
  - `#cast_failed_box`: Native warning container hidden by CSS rule `.hide_failed_hint_active #cast_failed_box { visibility: collapse; }`.

### Engine Events & Polling Frequency
- **Polling Frequency**: Zero polling (0Hz).
- **Engine Events**: None.

### Performance Tier & Caveats
- **Performance Tier**: None (0ms CPU execution time).
- **Suppression**: None needed; pure CSS class switch.
- **Style Optimization**: Direct class binding on the root HUD eliminates runtime overhead and layout recalculations.

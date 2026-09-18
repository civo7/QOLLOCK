# `panorama/scripts/manifests/ql_damage_report` (Post-Death Damage Report Customization)

## Description
Customizes or completely disables the native post-death damage breakdown report panel (`CitadelHudDamageReport`). Allows players to shift or rescale the recap card, or suppress it entirely to maintain an unobstructed view of the battlefield while spectating teammates after death.

## Files
- Manifest: `panorama/scripts/manifests/ql_damage_report/manifest.js`
- Styles: `panorama/styles/features/ql_feat_damage_report.css`

## Settings & Defaults
| Config Key | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `DISABLE_DAMAGE_REPORT` | `toggle` | `false` | Completely hides and disables the post-death damage report panel. |
| `DAMAGE_REPORT_SCALE` | `slider` | `1.0` | Uniform scale multiplier applied to the damage report card (0.5 to 2.0). |
| `DAMAGE_REPORT_X_OFFSET` | `slider` | `0` | Horizontal pixel offset shifting the damage report card position. |
| `DAMAGE_REPORT_Y_OFFSET` | `slider` | `0` | Vertical pixel offset shifting the damage report card position. |

## Architecture & Lifecycle

### Activation & Lifecycle Hooks
- **`onEnable()`**: Locates `CitadelHudDamageReport`, attaches the `disable_damage_report_active` root class if configured, and applies scale and margin offsets via `_apply()`.
- **`onDisable()`**: Removes root modifier classes and restores native damage report dimensions and positioning.
- **`onSettingsChanged()`**: Synchronously runs `_apply()` on configuration updates (0ms latency).
- **`test()`**: Verifies that `#Hud` is mounted in the current window.

### DOM Injection & Target Panels
- **DOM Creation**: Zero DOM elements created.
- **Target Panels**:
  - `#Hud` (resolved via `QOL.core.hud.findHud()`): Receives the root class `disable_damage_report_active`.
  - `Panel#CitadelHudDamageReport`: Native post-death recap container adjusted via transforms.

### Engine Events & Polling Frequency
- **Polling Frequency**: Zero polling (0Hz). The feature is purely reactive to configuration dispatches.
- **Engine Events**: None.

### Performance Tier & Caveats
- **Performance Tier**: None (`< 0.02ms` on setting update).
- **Suppression**: None required; pure CSS class and style gating.
- **Style Optimization**: Style signatures ensure transforms are only pushed when layout offsets change.

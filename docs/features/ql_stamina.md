# `panorama/scripts/manifests/ql_stamina` (Stamina Charge Color + Rotation)

## Description
Customizes the rotation angle and wash tint color of the reticle stamina charge indicators (`#charges_container`). Players can rotate the radial stamina ring (0° to 360°) to fit custom crosshair layouts and apply palette wash colors to active and drained stamina pips.

## Files
- Manifest: `panorama/scripts/manifests/ql_stamina/manifest.js`

## Settings & Defaults
| Config Key | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `STAMINA_CHARGE_ANGLE` | `slider` | `45` | Rotation angle in degrees for the stamina charges ring (range: 0° to 360°). |
| `STAMINA_CHARGE_COLOR` | `palette` | `0` | Palette color index applied as a wash tint over stamina pips (0 = default/uncolored). |

*Note: The feature is active by default (`enabledByDefault: true`).*

## Architecture & Lifecycle

### Activation & Lifecycle Hooks
- **`onEnable()`**: Applies initial transform and color rules and initiates a 2Hz (`0.5s` interval) polling loop via `QOL.core.Scheduler.createPollLoop(_tick, 0.5, "ql_stamina")`.
- **`onDisable()`**: Terminates the poll loop, restores the default rotation angle (`rotateZ(45deg)`), resets `washColor` to `"transparent"` on all cached charge pips, and clears internal panel arrays.
- **`onSettingsChanged()`**: Synchronously evaluates `_apply()` to write updated rotation transforms or wash colors.
- **`test()`**: Verifies that `#charges_container` exists within the HUD tree.

### DOM Injection & Target Panels
- **DOM Creation**: Zero DOM panels created.
- **Target Panel**:
  - `.ability_element_charges #charges_container` containing `.charge_drained` pips: stamina ring from Valve's `element_charges.xml`. Ability icons and `element_roll.xml` share ids/classes but are not stamina tint targets. Receives `style.transform = "rotateZ(" + angle + "deg)"`.
- **Target Charge Pips**:
  - `charge_fg.finished`: Active/ready stamina charge pips.
  - `charge_drained`: Spent stamina pips.
  - Receives `style.washColor = paletteColor`.

### Engine Events & Polling Frequency
- **Polling Frequency**: 2Hz (`0.5s` interval).
- **Rationale for Polling**: In Deadlock, stamina charge elements are dynamically reconstructed and alternate classes (`finished`, `charge_drained`) as stamina is expended and regenerated in combat, requiring periodic re-collection of active pip elements.

### Performance Tier & Caveats
- **Performance Tier**: Low.
- **Default State Bypass**: Skips work at defaults only after restoring any previous color/rotation overrides. Switching presets back to defaults must remove the previous preset's appearance.
- **Signature Optimization**: Transform caching includes panel identity. Each active color tick recollects eligible pips, restores native wash on pips leaving the set, and colors newly ready/recreated pips even when the palette index is unchanged. Unchanged pips are not rewritten.
- **Palette Resolution**: Resolves colors via `QOL.core.panel.resolvePaletteColor` or fallback `QOL.washColorPalette`.
- **Verification**: Offline regressions cover recovery of a third pip, preset reset, and ring recreation with a colliding ability-icon id. They do not verify in-game rendering.

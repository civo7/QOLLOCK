# `panorama/scripts/manifests/ql_souls` (Souls HUD)

## Description
Customizes the position, opacity, and visibility of the native Souls, Gold, and Ability Points HUD container (`#gold_and_ap_container`). Enables players to reposition the economy readout anywhere on their screen or adjust its transparency for minimal visual obstruction.

## Files
- Manifest: `panorama/scripts/manifests/ql_souls/manifest.js`

## Settings & Defaults
| Config Key | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `HUD_SOULS_ENABLED` | `toggle` | `true` | Master toggle to show or hide the Souls HUD element (`enabledByDefault: true`). |
| `SOULS_OPACITY` | `slider` | `1.0` | Opacity multiplier for the Souls container (range: 0.0 to 1.0). |
| `SOULS_X_OFFSET` | `slider` | `0` | Horizontal pixel offset (range: -1500px to +1500px). |
| `SOULS_Y_OFFSET` | `slider` | `0` | Vertical pixel offset (range: -500px to +500px). |

## Architecture & Lifecycle

### Activation & Lifecycle Hooks
- **`onEnable()`**: Attempts an immediate style application via `_apply()`. If the panel is not yet mounted in the DOM hierarchy, creates a temporary 1Hz (`1.0s` interval) poll loop via `QOL.core.Scheduler.createPollLoop(_tick, 1.0, "ql_souls")` that self-terminates as soon as the panel is resolved.
- **`onDisable()`**: Terminates any pending discovery loop, resets `_lastSig`, clears inline styles (`x`, `y`, `opacity`), restores visibility, and invalidates the cached panel pointer.
- **`onSettingsChanged()`**: Synchronously updates inline styles according to new configuration values.
- **`test()`**: Verifies that `#gold_and_ap_container` can be located within the HUD context.

### DOM Injection & Target Panels
- **DOM Creation**: Zero DOM elements created.
- **Target Panel**:
  - `Panel#gold_and_ap_container`: Native container holding player gold and AP counts.
  - Styles modified: `style.x`, `style.y` (inverted offset), and `style.opacity`.
  - Classes applied: `qol-hidden` when `HUD_SOULS_ENABLED` is toggled off.

### Engine Events & Polling Frequency
- **Polling Frequency**: 0Hz during normal gameplay (zero-polling event-driven design). Uses a 1Hz poll loop exclusively during early-game boot if the panel has not yet spawned.
- **Engine Events**: None hooked; responds directly to configuration changes.

### Performance Tier & Caveats
- **Performance Tier**: None (`0ms` runtime impact).
- **Self-Terminating Poller**: The moment `_apply()` locates and styles the panel, the scheduler loop is cleanly unregistered.
- **Signature Optimization**: State signature `_lastSig` (`offsetX|offsetY|opacityText|enabled|active`) prevents redundant style writes when settings are identical.
- **Clean Fallback**: Uses `QOL.utils.ClearStyleSafe` to reset properties to engine defaults rather than leaving empty inline overrides.

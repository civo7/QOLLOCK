# `panorama/scripts/manifests/ql_sigflash` (Signature Cooldown Press Flash)

## Description
Provides immediate tactile feedback when attempting to cast signature abilities that are currently on cooldown. When the player presses an ability key while that ability is cooling down or not ready, the feature applies a temporary 220ms visual flash animation (`qol_signature_cooldown_pressed`) to the ability's HUD slot, confirming key registration even when the cast is rejected by cooldown restrictions.

## Files
- Manifest: `panorama/scripts/manifests/ql_sigflash/manifest.js`
- Styles: `panorama/styles/hud_ability_icon.css` (defines `#hud_signature CitadelAbilityIcon.signature.qol_signature_cooldown_pressed .button_container`)

## Settings & Defaults
| Config Key | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `ENABLE_PASSIVE_COOLDOWN` | `toggle` | `false` | Master enable toggle for the signature cooldown press flash effect. |

## Architecture & Lifecycle

### Activation & Lifecycle Hooks
- **`onEnable()`**: Starts a 5Hz (`0.2s` interval) polling loop via `QOL.core.Scheduler.createPollLoop(_tick, 0.2, "ql_sigflash")`.
- **`onDisable()`**: Halts the poll loop, removes active flash classes from all ability slots, and clears cached panel references via `_cleanup()`.
- **`onSettingsChanged()`**: Resets all active flashes and executes `_tick()` immediately.
- **`test()`**: Verifies that the native `#hud_signature` container exists within the HUD tree.

### DOM Injection & Target Panels
- **DOM Creation**: Zero DOM panels created; operates entirely via dynamic class toggling on native ability slots.
- **Target Panels**:
  - Container: `#hud_signature`
  - Slots: `slot_signature_1` through `slot_signature_4`
  - Binding Sub-components: `ability_binding_component` within each signature slot
- **State Classes Monitored**:
  - `cooling_down` or `ability_not_ready` on slot icons.
  - `IsPressed` or `DownActivated` on `ability_binding_component`.
- **CSS Class Injected**:
  - `qol_signature_cooldown_pressed`: Injected on the ability icon panel for exactly 220ms (`FLASH_MS`).

### Engine Events & Polling Frequency
- **Polling Frequency**: 5Hz (`0.2s` interval) to detect button press transitions.
- **Slot Discovery Frequency**: Throttled to 1Hz (`1000ms` interval) to avoid repeated tree traversals while abilities are static.
- **Engine Events**: None hooked; monitors button and cooldown classes on Panorama panels.

### Performance Tier & Caveats
- **Performance Tier**: Low.
- **Panel Health Check**: Reuses cached slot references (`_slots`) and only triggers a re-scan if a panel pointer becomes invalid.
- **Garbage Cleanup**: Dynamic tracking dictionaries (`_pressById`, `_untilById`) prune stale slot keys each tick to prevent memory retention across hero respawns or upgrades.

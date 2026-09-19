# `panorama/scripts/manifests/ql_lane_with_party` (Automatic Party Lane Preference Selection)

## Description
Automatically selects the "Lane with Party" option in the pre-match lobby interface (`LanePreferenceSelector`). When queuing with party members, Deadlock requires players to manually click the party lane preference before the match countdown ends; this feature automatically activates that selection as soon as the dialog appears, ensuring party members are placed together in duo lanes.

## Files
- Manifest: `panorama/scripts/manifests/ql_lane_with_party/manifest.js`
- Styles: None

## Settings & Defaults
| Config Key | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `AUTO_LANE_WITH_PARTY` | `toggle` | `false` | Master toggle to automatically select "Lane with Party" during pre-match setup. |

## Architecture & Lifecycle

### Activation & Lifecycle Hooks
- **`onEnable()`**: Initiates an adaptive multi-tier polling task via `QOL.core.Scheduler` to monitor pre-match lobby mounting.
- **`onDisable()`**: Cancels scheduler loops and resets internal selection flags.
- **`onSettingsChanged()`**: Synchronously runs an immediate check.
- **`test()`**: Verifies that the root menu or lobby context panel is accessible.

### DOM Injection & Target Panels
- **DOM Creation**: Zero DOM elements created.
- **Target Panels**:
  - `Panel#LanePreferenceSelector`: Native pre-match dialog container.
  - `RadioButton#lanepreference_1`: The specific radio button corresponding to "Lane with Party".

### Engine Events & Polling Frequency
- **Polling Frequency**: 3-tier adaptive polling—runs at `650ms` while actively looking for the selector dialog; backs off to `2630ms` if hidden; relaxes to `4870ms` once successfully selected.
- **Engine Events**: Observes game state transitions to shut down once match clock starts.

### Performance Tier & Caveats
- **Performance Tier**: Low (`< 0.02ms` per tick).
- **Suppression**: Completely inactive once live gameplay begins or inside the Sandbox/Hideout.
- **Idempotency**: Flags the selection as confirmed once triggered to prevent spamming click events against the UI.

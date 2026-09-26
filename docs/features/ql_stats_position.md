# `panorama/scripts/manifests/ql_stats_position` (Stats Position)

## Description
Customizes the screen anchoring, offsets, and contextual visibility of the hero core statistics and modifier block (`#hudPlayerStats`). Players can swap the stats display between the left and right sides of the HUD, apply custom horizontal/vertical pixel offsets, or configure independent hiding rules during standard gameplay or while inspecting the Scoreboard.

## Files
- Manifest: `panorama/scripts/manifests/ql_stats_position/manifest.js`
- Styles: `panorama/styles/features/ql_feat_stats_position.css` (defines rules for `#hudPlayerStats.QolStatsRight`, `.miniModifier`, etc.)

## Settings & Defaults
| Config Key | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `ENABLE_STATS_POSITION` | `toggle` | `true` | Master toggle to enable stats position customization (`enabledByDefault: true`). |
| `STATS_POSITION_SIDE` | `buttongroup` | `0` | Horizontal anchor side (`0` = Left, `1` = Right). Toggles `.QolStatsRight`. |
| `STATS_POSITION_X_OFFSET` | `number` | `0` | Horizontal pixel offset (clamped to [-500px, 500px]). |
| `STATS_POSITION_Y_OFFSET` | `number` | `0` | Vertical pixel offset (clamped to [-500px, 500px]). |
| `STATS_POSITION_HIDE_NORMAL` | `toggle` | `false` | Hide the stats panel during normal match gameplay. |
| `STATS_POSITION_HIDE_SCOREBOARD` | `toggle` | `false` | Hide the stats panel when the Scoreboard (Tab) is active. |

## Architecture & Lifecycle

### Activation & Lifecycle Hooks
- **Enable Key**: Registered with `enableKey: "ENABLE_STATS_POSITION"`.
- **`onEnable()`**: Subscribes to the native `engine:scoreboard_toggle` event bus channel, boots a 1Hz (`1.0s` interval) baseline polling task via `QOL.core.Scheduler.createPollLoop()`, and applies initial coordinates.
- **`onDisable()`**: Detaches from `engine:scoreboard_toggle`, halts the scheduler loop, and invokes `resetStatsPanel()` to strip `.QolStatsRight` and clear inline `x`, `y`, and `opacity` overrides.
- **`onSettingsChanged()`**: Clears internal style signatures (`_sig = ""`) and synchronizes loop state and coordinates immediately.
- **`test()`**: Verifies that the native `#hudPlayerStats` panel exists in the HUD hierarchy.

### DOM Injection & Target Panels
- **DOM Creation**: Zero DOM elements created; operates on the native stats container.
- **Target Panel**:
  - `Panel#hudPlayerStats`: Native container displaying hero stat pips, sprint speed, and modifier badges.
  - Class applied: `QolStatsRight` when `STATS_POSITION_SIDE` is set to 1.
  - Styles applied: `style.opacity = "0"|"1"`, `style.x`, and `style.y` (-offY).

### Engine Events & Polling Frequency
- **Polling Frequency**: 1Hz (`1.0s` interval) baseline.
- **Engine Event Subscription**:
  - Listens to `engine:scoreboard_toggle` via `ctx.events.on()` and queues `$.Schedule(0, _tick)` to re-evaluate visibility. Scheduling zero seconds is not a guarantee of zero latency or final native layout state.

### Performance Tier & Caveats
- **Performance Tier**: Low (1Hz baseline combined with event reactivity).
- **Default Value Guard**: `hasStatsPositionWork(cfg)` checks whether any setting differs from defaults and whether `ENABLE_STATS_POSITION` is enabled. If the feature is disabled or all settings are at factory defaults, the panel is reset and style mutation is bypassed entirely.
- **Hideout Suppression**: In Hideout/Sandbox lobby (`QOL.core.hud.isInHideout`), any applied offsets or classes are reset, restoring native stats layout, and restored upon match reentry.
- **Signature Optimization**: Guards style writes with `_sig = hidden ? "hidden" : ("show|" + side + "|" + offX + "|" + offY)`.
- **Clamping**: Coordinate offsets are safely clamped to `[-500, 500]` pixels.

Scoreboard visibility now uses `QOL.core.hud.isScoreboardOpen`, including the native GlobalClassListener fallback. The toggle event is a refresh trigger, not a boolean state payload.

Event-triggered deferred refreshes use `Scheduler.scheduleOnce` with the feature ID, so disabling the feature cancels pending callbacks as well as its recurring loop. Event unsubscription remains explicit.

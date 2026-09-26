# ql_unsecured_souls_timer

Estimated unsecured-souls conversion countdown, separate from the amount overlay.

Source: [manifest.js](../../panorama/scripts/manifests/ql_unsecured_souls_timer/manifest.js),
loaded by the HUD layout. The general [lifecycle contract](../core/feature_registry.md)
and [architecture](../../ARCHITECTURE.md) explain context and configuration routing.

## Runtime and ownership

Starts a 0.2-second loop and estimates conversion time from native
unsecured-souls observations. Do not present the estimate as a native exact timer.
This is distinct from `ql_better_unsecured_hud`, which renders amount/icon state.
Preserve source-loss and reset handling; a stale sample must not masquerade as
a current countdown.

The enabled timer is available in matches, hideout and hero testing without
mode-specific suppression. Hero testing no longer needs an exception to a
hideout gate. Native source availability determines the display: a missing
source shows `--`, zero souls clears the countdown, and a positive amount
produces an estimated countdown. Native parent visibility still applies.

## Declared settings

- `ENABLE_UNSECURED_SOUL_TIMER` (toggle)
- `UNSECURED_SOUL_TIMER_X_OFFSET` (slider)
- `UNSECURED_SOUL_TIMER_Y_OFFSET` (slider)
- `UNSECURED_SOUL_TIMER_SCALE` (slider)

Defaults/ranges belong to the linked schema, flat `QOL_DEFAULT_CONFIG` and
versioned codec definitions, not a duplicated table here. They are separate
representations; a declared field is not automatically a visible control or
proof of active runtime behavior. See [adding settings](../ADDING_SETTINGS.md).

## Verification boundary

The statements above describe source behavior. Native panel identity, binding
values, rendering and transitions need the maintainer's Panorama Debugger and
a repacked client scenario; neither a schema nor a read-only manifest hook
proves the whole feature works. See [verification](../TESTING.md).

Numeric label parsing uses the existing local numeric-character extraction. The unreachable optional `QOL_UTILS.ParseNumber` branch was removed because that helper is not exported; parsing behavior is otherwise unchanged.

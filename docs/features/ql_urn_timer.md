# ql_urn_timer

Urn/rift state and spawn-window display derived from game clock/minimap signals.

Source: [manifest.js](../../panorama/scripts/manifests/ql_urn_timer/manifest.js),
loaded by the HUD layout. The general [lifecycle contract](../core/feature_registry.md)
and [architecture](../../ARCHITECTURE.md) explain context and configuration routing.

## Runtime and ownership

Starts a 0.5-second loop. Uses game-clock and minimap/native signals to
track urn/rift state and the relevant spawn window. Keep the state transitions
and source identity intact rather than replacing them with a single generic
periodic countdown. Validate carry/return/spawn transitions in the client.

Hideout detection uses `QOL.core.hud.isInHideout`. Hiding only touches the
owned/cached timer panel; it never traverses the HUD to find a nonexistent
overlay. Missing minimap and timer-parent searches retry after two seconds.
Leaving hideout or re-enabling allows immediate discovery again. A rebuilt
timer invalidates its text signature so identical countdown text is reapplied.
The two-second retry delay applies only to discovery misses; an existing
minimap retains its 500 ms state sampling.

## Declared settings

- `ENABLE_URN_TIMER` (toggle)

Defaults/ranges belong to the linked schema, flat `QOL_DEFAULT_CONFIG` and
versioned codec definitions, not a duplicated table here. They are separate
representations; a declared field is not automatically a visible control or
proof of active runtime behavior. See [adding settings](../ADDING_SETTINGS.md).

## Verification boundary

The statements above describe source behavior. Native panel identity, binding
values, rendering and transitions need the maintainer's Panorama Debugger and
a repacked client scenario; neither a schema nor a read-only manifest hook
proves the whole feature works. See [verification](../TESTING.md).

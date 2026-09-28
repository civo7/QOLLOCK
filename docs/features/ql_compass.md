# ql_compass

Compass tape, speed display, minimap rotation/flip and player-heading discovery.

Source: [manifest.js](../../panorama/scripts/manifests/ql_compass/manifest.js),
loaded by the HUD layout. The general [lifecycle contract](../core/feature_registry.md)
and [architecture](../../ARCHITECTURE.md) explain context and configuration routing.

## Runtime and ownership

Owns heading discovery, compass tape, the speed readout and minimap
rotation/flip integration. It can be active for minimap settings even when the
visible compass is off. Its bounded, ordered panel/heading selection is more
specific than a generic class search. Preserve heading normalization, source
backoff and cleanup when no valid player source exists. `COMPASS_INTERVAL_SEC`
and the runtime's rescheduling paths define its cadence.

The shared hideout predicate gates the whole tick, including minimap rotation
and flip discovery. On entry, the feature hides its overlays, clears owned
rotation/flip overrides using cached handles only, and discards player/heading
history. It then polls at the existing 0.5-second idle interval without searching
for minimap panels. Returning to a match restores 0.05-second polling and fresh
source discovery. Disable uses the same cached-handle cleanup. Already-hidden
overlays do not receive repeated visibility writes or repeated state allocation.

Previously, only the visible compass path checked hideout; the minimap path
still ran, even with rotation disabled. A missing minimap could cause ten
root searches per tick (2,000 in a ten-second offline fixture). This is a
confirmed operation-count defect, not proof of the cause of a client's stutter.
The built-in `7eventy7` preset currently leaves compass, speed, flip and rotation
off; this fix does not explain that preset's reported post-match stutter.

`tests/hideout_runtime.test.js` checks both hideout classes, rotation/static flip/
overlay-only modes, retained and destroyed minimap sources, idle style writes,
cold startup, and recovery into another match. After maintainer compile/repack,
verify these transitions in the client and compare actual frame times separately.

## Declared settings

- `ENABLE_COMPASS` (toggle)
- `ENABLE_SIMPLIFY_COMPASS` (toggle)
- `ENABLE_COMPASS_SPEED` (toggle)
- `COMPASS_SCALE` (slider)
- `COMPASS_STRETCH_X` (slider)
- `COMPASS_STRETCH_Y` (slider)
- `COMPASS_X_OFFSET` (slider)
- `COMPASS_Y_OFFSET` (slider)
- `COMPASS_SPEED_X_OFFSET` (slider)
- `COMPASS_SPEED_Y_OFFSET` (slider)
- `MINIMAP_FLIP` (toggle)
- `MINIMAP_ROTATE_WITH_PLAYER` (toggle)

Defaults/ranges belong to the linked schema, flat `QOL_DEFAULT_CONFIG` and
versioned codec definitions, not a duplicated table here. They are separate
representations; a declared field is not automatically a visible control or
proof of active runtime behavior. See [adding settings](../ADDING_SETTINGS.md).

## Verification boundary

The statements above describe source behavior. Native panel identity, binding
values, rendering and transitions need the maintainer's Panorama Debugger and
a repacked client scenario; neither a schema nor a read-only manifest hook
proves the whole feature works. See [verification](../TESTING.md).

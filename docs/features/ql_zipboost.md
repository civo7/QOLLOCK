# ql_zipboost

Zip boost state/countdown; preserve distinction between hint visibility and active boost.

Source: [manifest.js](../../panorama/scripts/manifests/ql_zipboost/manifest.js),
loaded by the HUD layout. The general [lifecycle contract](../core/feature_registry.md)
and [architecture](../../ARCHITECTURE.md) explain context and configuration routing.

## Runtime and ownership

Performs an initial tick and starts a 0.4-second loop. Derives boost state
and countdown from native signals; visible boost hints are not identical to
active boost state. Preserve source caching/invalidation and reset on feature
or match transitions. It does not change movement physics or the game's boost
activation window.

## Declared settings

- `ENABLE_ZIP_BOOST` (toggle)
- `ZIP_BOOST_SCALE` (slider)
- `ZIP_BOOST_X_OFFSET` (slider)
- `ZIP_BOOST_Y_OFFSET` (slider)

Defaults/ranges belong to the linked schema, flat `QOL_DEFAULT_CONFIG` and
versioned codec definitions, not a duplicated table here. They are separate
representations; a declared field is not automatically a visible control or
proof of active runtime behavior. See [adding settings](../ADDING_SETTINGS.md).

## Verification boundary

The statements above describe source behavior. Native panel identity, binding
values, rendering and transitions need the maintainer's Panorama Debugger and
a repacked client scenario; neither a schema nor a read-only manifest hook
proves the whole feature works. See [verification](../TESTING.md).

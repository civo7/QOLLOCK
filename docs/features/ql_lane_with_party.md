# ql_lane_with_party

Automatic party lane preference selection; key is ENABLE_LANE_WITH_PARTY.

Source: [manifest.js](../../panorama/scripts/manifests/ql_lane_with_party/manifest.js),
loaded by the HUD layout. The general [lifecycle contract](../core/feature_registry.md)
and [architecture](../../ARCHITECTURE.md) explain context and configuration routing.

## Runtime and ownership

Selects the existing native party lane-preference control when appropriate;
it does not merely display lane-assignment indicators. The setting is
`ENABLE_LANE_WITH_PARTY`, not `AUTO_LANE_WITH_PARTY`. Starts a 0.5-second loop;
disable stops work and clears the cached selector. Native control creation and
actual activation must be checked in the client.

## Declared settings

- `ENABLE_LANE_WITH_PARTY` (toggle)

Defaults/ranges belong to the linked schema, flat `QOL_DEFAULT_CONFIG` and
versioned codec definitions, not a duplicated table here. They are separate
representations; a declared field is not automatically a visible control or
proof of active runtime behavior. See [adding settings](../ADDING_SETTINGS.md).

## Verification boundary

The statements above describe source behavior. Native panel identity, binding
values, rendering and transitions need the maintainer's Panorama Debugger and
a repacked client scenario; neither a schema nor a read-only manifest hook
proves the whole feature works. See [verification](../TESTING.md).

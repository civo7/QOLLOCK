# ql_statlocker

Statlocker profile link buttons and account-ID resolution; not a stat-locking engine.

Source: [manifest.js](../../panorama/scripts/manifests/ql_statlocker/manifest.js),
loaded by the HUD layout. The general [lifecycle contract](../core/feature_registry.md)
and [architecture](../../ARCHITECTURE.md) explain context and configuration routing.

## Runtime and ownership

Creates Statlocker profile links using resolved account IDs. Starts a
1.2-second loop; disable removes owned links and resets runtime state. Profile
page/card scripts also participate through their special-context XML layouts.
It neither locks hero stats nor implements a generic comparison HUD. Preserve
authoritative account-ID parsing and avoid linking stale player identities.

## Declared settings

- `ENABLE_STATLOCKER` (toggle)

Defaults/ranges belong to the linked schema, flat `QOL_DEFAULT_CONFIG` and
versioned codec definitions, not a duplicated table here. They are separate
representations; a declared field is not automatically a visible control or
proof of active runtime behavior. See [adding settings](../ADDING_SETTINGS.md).

## Verification boundary

The statements above describe source behavior. Native panel identity, binding
values, rendering and transitions need the maintainer's Panorama Debugger and
a repacked client scenario; neither a schema nor a read-only manifest hook
proves the whole feature works. See [verification](../TESTING.md).

# ql_chat_translate

Account-gated translation experiment; no general ENABLE_CHAT_TRANSLATE setting.

Source: [manifest.js](../../panorama/scripts/manifests/ql_chat_translate/manifest.js),
loaded by the HUD layout. The general [lifecycle contract](../core/feature_registry.md)
and [architecture](../../ARCHITECTURE.md) explain context and configuration routing.

## Runtime and ownership

This manifest registers enabled by default but gates useful work by account
inside its runtime. It declares no settings array entries: there is no public
`ENABLE_CHAT_TRANSLATE` contract here. Its loop starts at 0.2 seconds, not five
seconds. See `tools/local_chat_translation/README.md` for the separate optional
service. Do not remove the gate or claim general availability during a refactor.

## Declared settings

No user-setting entries are declared by this manifest.

Defaults/ranges belong to the linked schema, flat `QOL_DEFAULT_CONFIG` and
versioned codec definitions, not a duplicated table here. They are separate
representations; a declared field is not automatically a visible control or
proof of active runtime behavior. See [adding settings](../ADDING_SETTINGS.md).

## Verification boundary

The statements above describe source behavior. Native panel identity, binding
values, rendering and transitions need the maintainer's Panorama Debugger and
a repacked client scenario; neither a schema nor a read-only manifest hook
proves the whole feature works. See [verification](../TESTING.md).

# ql_showrank

Rank badges and cross-context profile-card probing.

Source: [manifest.js](../../panorama/scripts/manifests/ql_showrank/manifest.js),
loaded by the HUD layout. The general [lifecycle contract](../core/feature_registry.md)
and [architecture](../../ARCHITECTURE.md) explain context and configuration routing.

## Runtime and ownership

Starts a 0.5-second loop and uses lifecycle tokens for deferred work.
Profile-card callbacks run in their own context via
`panorama/scripts/features/ql_feat_showrank_card.js`. Preserve tokens, account
identity and source invalidation; a valid panel from a previous player is not
a valid current rank source. Disable must prevent late work from recreating UI.

## Declared settings

- `SHOW_RANK` (toggle)
- `SHOW_RANK_TOPBAR` (toggle)

Defaults/ranges belong to the linked schema, flat `QOL_DEFAULT_CONFIG` and
versioned codec definitions, not a duplicated table here. They are separate
representations; a declared field is not automatically a visible control or
proof of active runtime behavior. See [adding settings](../ADDING_SETTINGS.md).

## Verification boundary

The statements above describe source behavior. Native panel identity, binding
values, rendering and transitions need the maintainer's Panorama Debugger and
a repacked client scenario; neither a schema nor a read-only manifest hook
proves the whole feature works. See [verification](../TESTING.md).

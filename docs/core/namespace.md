# Namespace bootstrap

Source: `panorama/scripts/core/ql_namespace.js`. See [architecture](../../ARCHITECTURE.md)
for context boundaries and actual XML load order.

This first-loaded script establishes `QOL.core`, `QOL.ui`, `QOL.features` and
`QOL.adapters`, preserving an existing initialized namespace. It initializes
`QOL.VERSION` only when absent and sets `QOL.ROLE` to `em` when the context ID is
exactly `EscapeMenu`, otherwise `hud` (also the fallback on detection failure).
Role is a bootstrap hint, not proof of gameplay state or API availability.

It creates initial aliases for panel/HUD/time/Scheduler/registry/logger/app
buckets. Later modules publish their real APIs; an empty namespace bucket does
not mean the subsystem has loaded. There is no `QOL.BUILD` export here.

`QOL.import(names)` has a transitional fallback for root exports, utilities,
state and old cache accessors. `ql_shared_presets.js` subsequently supplies the
shared bridge/export layer. Reuse the API available in the consumer's real layout;
do not create another alias layer or rely on a fallback to conceal load-order bugs.

HUD and settings get separate namespace objects. Native panel attributes and
existing bridges, not JS object identity, connect their state. Reload protection
is local to the JS context and does not establish native panel lifetime.

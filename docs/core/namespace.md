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

Consumers access their declared helpers directly through the namespace. The
transitional `QOL.import` implementations and settings-side HUD/cache stubs are
removed. `ql_shared_presets.js` publishes shared defaults, codec/schema data and
the utilities loaded earlier by XML; it does not fabricate gameplay APIs for
other contexts. Reuse the API available in the consumer's real layout; do not
conceal missing includes with another fallback or alias layer.

HUD and settings get separate namespace objects. Native panel attributes and
existing bridges, not JS object identity, connect their state. Reload protection
is local to the JS context and does not establish native panel lifetime.

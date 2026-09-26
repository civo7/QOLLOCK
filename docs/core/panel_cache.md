# Typed panel cache

Source: `panorama/scripts/ql_panelcache.js`; export `QOL.panelCache`.

`getPanel` validates handles; `getList` validates a nonempty array of handles.
Data entries have no panel validation. Keys share a context-wide namespace.

`resolve(parent, cacheKey, traverseId)` associates the resolved handle with both
parent and ID, validates ancestry on reuse, and re-resolves moved/replaced panels.
Invalid parents and failed lookups clear that entry. Misses are not backoff-cached.
`setPanel` invalidates the resolver association. `clear` resets entries and
associations. Features must clear only their own keys and still invalidate any
style signatures derived from replaced panels.

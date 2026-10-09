# Typed panel cache

Source: `panorama/scripts/ql_panelcache.js`; export `QOL.panelCache`.

`getPanel` validates handles; `getList` validates a nonempty array of handles.
Data entries have no panel validation. Keys share a context-wide namespace.

This is the sole panel-cache storage. `ql_state.js` publishes only shared runtime
snapshots, without a second panel dictionary or exposed cache internals. The
retained root `QOL` access names delegate to this cache; `setCachedPanel(key, null)`
clears that key across categories. Typed callers select their category explicitly.
Core HUD's bounded-miss resolvers retain private discovery records and publish
resolved handles here; their miss deadlines reset when the root or ID changes.

`resolve(parent, cacheKey, traverseId)` associates the resolved handle with both
parent and ID, validates ancestry on reuse, and re-resolves moved/replaced panels.
It also checks the selected panel against its current direct parent/ID.
Invalid parents and failed lookups clear that entry. Misses are not backoff-cached.
`setPanel` invalidates the resolver association. `clear` resets entries and
associations. Features must clear only their own keys and still invalidate any
style signatures derived from replaced panels.

`createIdResolver(id, options?)` returns a feature-owned `{resolve(root, force?),
reset()}` without using shared cache keys. It discovers the parent through the
existing descendant search, then checks that parent's direct child and ancestry
on reuse. A replaced child or detached parent prompts discovery immediately.
Periodic full refreshes preserve first-match search priority when an earlier
duplicate ID appears while the old subtree stays alive. Missing results retry
at a bounded interval; a root change or `force` bypasses that deadline. Optional
`refreshMs` and `retryMs` are runtime timing controls, not persistent settings.
Native access failures return null and remain retryable.

`ownerPath` supplies verified direct-child breadcrumbs before generic discovery.
Steps are ID strings or `{className}` selectors of immediate children. An
`{id, optional: true}` step can account for a known outer wrapper; a step naming
the current panel is already satisfied. The final ID is searched directly under
the selected owner. Check the path every call to follow native replacements and
prefer the current layout over a retained fallback handle. Missing paths still
use the lifecycle-aware descendant fallback with bounded missing-result retries.
Do not infer mandatory paths from the absence of panels in a single capture.

Call `reset()` on disable and invalidate caller-owned style/content signatures
when the resolved handle changes. The resolver neither restores styles nor
proves player identity. Supply breadcrumbs only from verified source/captures;
the fallback parent comes from the observed panel. An absent panel remains a conditional discovery
case; no panel IDs should be removed based on a missing capture.

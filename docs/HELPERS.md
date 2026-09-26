# Choosing existing helpers

Before adding a generic helper, search this map and its implementation. Prefer
an existing helper when its behavior matches the requirement. Keep feature
selection rules local: a generic tree walk cannot decide which player's panel,
which numeric label, or which live HUD instance is authoritative.

## Decision map

| Need | Existing callable API | Source / limits |
| --- | --- | --- |
| Validate a native handle | `QOL_UTILS.IsPanelValid(panel)` or `QOL.core.panel.isAlive(panel)` | `ql_utils.js`; same function via aliases, including `QOL.utils.IsPanelValid`. |
| Validate a panel list | `QOL_UTILS.IsPanelListValid(list)` | Empty lists are false; distinguish an empty cached result separately if needed. |
| Create / delete panels | `QOL.core.panel.create(type, parent, id, properties)` / `QOL.core.panel.delete(panel)` | `core/ql_panel_helpers.js`; deletion is asynchronous. |
| Find a known direct-child ID | `QOL.core.panel.findChild(parent, id)` | Does not search arbitrary descendants. |
| Find a known descendant ID | `QOL.core.panel.findTraverse(root, id)` | Supply the narrowest authoritative root; duplicate IDs in other subtrees are possible. |
| Find descendants by class | `QOL_UTILS.FindPanelsByClass(root, className)` / `QOL_UTILS.FindFirstPanelByClass(root, className)` | Native class traversal; the latter filters for valid handles. |
| Find a parent-chain match | `QOL_UTILS.FindAncestorWithClass(panel, className)` / `QOL_UTILS.HasClassInHierarchy(panel, className)` | Includes starting panel; uncapped parent walk, not a bounded or fully exception-safe replacement. |
| Resolve context root / HUD | `QOL.core.panel.findRoot()` / `QOL.core.panel.findHud(preferredRoot)` | See [panel API](core/panel_helpers.md); root fallback does not establish gameplay state. |
| Read first descendant text | `QOL.core.panel.readTextDeep(panel, maxDepth)` | Bounded search, unsuitable when another nonempty label can precede the desired one. |
| Change one style if different | `QOL_UTILS.SetStyleIfChanged(panel, property, value)` | Only when native read-back semantics suit comparison. |
| Normalize opacity / clear style | `QOL_UTILS.SetPanelOpacitySafe(panel, value, fallback)` / `QOL.core.panel.clearStyleProperty(panel, property)` | Opacity clamps and formats; clearing uses native ClearPropertyFromCode. |
| Apply a style map | `QOL.core.panel.syncStyles(panel, styles, lastSig)` | Caller owns signature and invalidation; writes the whole map when signature changes. |
| Cache a handle / list | `QOL.panelCache.getPanel(key)` / `QOL.panelCache.setPanel(key, panel)` / `QOL.panelCache.getList(key)` / `QOL.panelCache.setList(key, list)` | `ql_panelcache.js`; getters reject invalid handles/lists. |
| Resolve cached ID | `QOL.panelCache.resolve(parent, cacheKey, traverseId)` | Returns cached live handle or native descendant lookup; does not check that cached handle still belongs to supplied parent. |
| Cache non-panel state | `QOL.panelCache.getData(key)` / `QOL.panelCache.setData(key, value)` | No panel validation. Do not mix data and handle categories. |

## Load order and names

`ql_utils.js` publishes `QOL_UTILS`; the shared preset bridge exposes the same
object as `QOL.utils`. Panel helpers require that leaf module and the QOL
namespace. The typed cache is loaded after utilities and state. Check the actual
XML include list for the context being changed: a helper available in HUD need
not be loaded in an isolated profile/card context.

Use [the panel API reference](core/panel_helpers.md) for exact exported names.
The production export contract is checked by `tests/helper_api_contract.test.js`
against the callable references in this decision map.

## Cache and lifecycle contract

- Cache keys are shared within a script context. Use a feature-specific key or
  explicitly share ownership; never silently replace another feature's entry.
- Validity says the handle is live, not that it belongs to the current match,
  player, root, or selection. Clear/rebind your entries on relevant transitions.
- `getPanel` validates handles. `resolve` does not provide a root-aware cache,
  missing-result backoff, or feature lifecycle cleanup; callers own those rules.
- Clear only your owned keys with `setPanel(key, null)` / `setList(key, null)`.
  Whole-cache clearing belongs to the subsystem owner, not individual features.
- Reset style signatures and other panel-derived state when replacing a cached
  handle. A signature from panel A must not suppress initial writes to panel B.
- Deleting a panel asynchronously does not immediately invalidate it. Prevent
  pending callbacks from reviving feature UI after disable using cancellation or
  a generation token where needed.

## When local traversal is appropriate

Native `FindChildTraverse`, `Children`, and explicit parent walks are allowed.
Keep local logic when it needs bounded work, short-circuiting, child ordering,
multiple fallback IDs, verified player identity, or narrower lifetime handling.
For example, the compass/reload parent walks enforce depth limits that the leaf
`HasClassInHierarchy` helper does not. Do not erase such differences merely to
reduce duplicate-looking code.

Generic helpers cannot verify native IDs or classes. Use existing authoritative
layouts/dumps and maintainer Panorama Debugger evidence; do not invent a panel
hierarchy. Add a shared helper only after identifying a repeated contract and
its failure behavior, then document it here and test the player-visible behavior
that motivated it.

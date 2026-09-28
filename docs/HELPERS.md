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
| Find a parent-chain match | `QOL_UTILS.FindAncestorWithClass(panel, className)` / `QOL_UTILS.HasClassInHierarchy(panel, className)` | Includes starting panel; catches native class/parent access failures, but the walk is uncapped. |
| Resolve context root / HUD | `QOL.core.panel.findRoot(panel?)` / `QOL.core.panel.findHud(preferredRoot)` | See [panel API](core/panel_helpers.md); root fallback does not establish gameplay state. |
| Read first descendant text | `QOL.core.panel.readTextDeep(panel, maxDepth)` | Bounded search, unsuitable when another nonempty label can precede the desired one. |
| Read / write a panel attribute | `QOL_UTILS.SafeGetAttribute(panel, key, fallback)` / `QOL_UTILS.SafeSetAttribute(panel, key, value)` | Generic string access, not revision-aware config publication. |
| Change one style if different | `QOL_UTILS.SetStyleIfChanged(panel, property, value)` | Only when native read-back semantics suit comparison. |
| Reassert one style | `QOL_UTILS.SetStyleSafe(panel, property, value)` | Use when a native owner may overwrite the value; do not make deliberate reassertion conditional. |
| Normalize opacity / clear style | `QOL_UTILS.SetPanelOpacitySafe(panel, value, fallback)` / `QOL.core.panel.clearStyleProperty(panel, property)` | Opacity clamps and formats; clearing uses native ClearPropertyFromCode. |
| Apply a style map | `QOL.core.panel.syncStyles(panel, styles, lastSig)` | Caller owns signature and invalidation; writes the whole map when signature changes. |
| Set a class / visibility | `QOL.core.panel.setClass(panel, className, active)` / `QOL.core.panel.setVisible(panel, visible)` | Class setter compares before writing; visible setter does not. |
| Resolve a palette color | `QOL.core.panel.normalizePaletteIndex(value)` / `QOL.core.panel.resolvePaletteColor(value)` | Both delegate to `QOL_UTILS`; read the palette from the leaf utility. |
| Cache a handle / list | `QOL.panelCache.getPanel(key)` / `QOL.panelCache.setPanel(key, panel)` / `QOL.panelCache.getList(key)` / `QOL.panelCache.setList(key, list)` | `ql_panelcache.js`; getters reject invalid handles/lists. |
| Resolve cached ID | `QOL.panelCache.resolve(parent, cacheKey, traverseId)` | Keys resolution by parent and ID, validates live ancestry, and re-resolves after reparenting. |
| Cache non-panel state | `QOL.panelCache.getData(key)` / `QOL.panelCache.setData(key, value)` | No panel validation. Do not mix data and handle categories. |
| Check an enabled config key | `QOL_UTILS.IsCfgEnabled(cfg, key)` | Uses numeric `1`, not general JavaScript truthiness. |
| Clamp a config number | `QOL_UTILS.ClampConfigNumber(value, fallback, min, max, shouldRound)` | Optional rounding before clamp, not schema-step snapping. |
| Format an offset / scale | `QOL_UTILS.FormatHudPx(value, fallback)` / `QOL_UTILS.NormalizeHudScaleNumber(value, fallback)` | Pixel offsets are integers; the scale helper has its own bounds. |
| Angle / layout math | `QOL_UTILS.ShortestDegreesDelta(fromDeg, toDeg)` / `QOL_UTILS.GetPanelPositionRelativeToAncestor(panel, ancestor)` | Validate input and ancestor identity; this is not universal DPI conversion. |
| Read / format match time | `QOL.core.time.readGameTime(topBar)` / `QOL.core.time.formatSeconds(seconds)` | Missing or unreadable clock can return zero. |
| Parse an account ID | `QOL_UTILS.ParseAccountId(value)` | Parsing does not establish which player owns the source. |
| Read the current clock | `QOL_UTILS.PerfNowMs()` | Date-based milliseconds, not a high-resolution frame clock. |
| Log runtime errors | `QOL.core.Logger.logError(featureId, message)` | Throttled and bounded; format expensive debug data only when enabled. |

## Load order and names

`ql_utils.js` publishes `QOL_UTILS`; the shared preset bridge exposes the same
object as `QOL.utils`. Panel helpers require that leaf module and the QOL
namespace. The typed cache is loaded after utilities and state. Check the actual
XML include list for the context being changed: a helper available in HUD need
not be loaded in an isolated profile/card context.

Use [the panel API reference](core/panel_helpers.md) for exact exported names.
The production export contract is checked by `tests/helper_api_contract.test.js`
against the callable references in this decision map.

For HUD mode/class detection use [core HUD state](core/hud.md); for hero evidence
use [heroProbe](core/hero_probe.md). Both report observations, not authoritative
local-player identity.

## Cache and lifecycle contract

- Cache keys are shared within a script context. Use a feature-specific key or
  explicitly share ownership; never silently replace another feature's entry.
- Validity says the handle is live, not that it belongs to the current match,
  player, root, or selection. Clear/rebind your entries on relevant transitions.
- `getPanel` validates handles without checking ancestry. `resolve` additionally
  validates parent/ID ownership; it has no missing-result backoff or feature lifecycle cleanup.
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

## Native style restoration

`QOL_UTILS.ClearStyleSafe(panel, property)` in `ql_utils.js` first calls native
`ClearPropertyFromCode` and returns on success. If unavailable or throwing, it
retains the legacy delete/null/empty-string fallbacks. Callers restoring default
geometry or opacity must release the native override, not just mutate a JS
property. `QOL.core.panel.clearStyleProperty` remains the stricter boolean API
without legacy fallback writes. Neither helper forces a new default value.

## Shared HUD state and deferred work

- `QOL.core.hud.isInHideout(root)` checks `connectedToHideout` / `InHideout`
  on the cached HUD and supplied root. Use it for that shared predicate;
  feature-specific intro handling or visibility policy remains with the caller.
- `QOL.core.hud.isScoreboardOpen(root, anchor)` reads `gScoreboardOpen` from
  HUD/ancestor state, an optional feature anchor, or the native `minimap_persp`
  GlobalClassListener. Engine toggle events prompt a refresh; they carry no
  app-provided visibility payload.
- `QOL.core.hud.readHudLifeState(root)` returns `alive`, `dead`, or `unknown`.
  This is HUD presentation evidence, not verified local-player entity identity.
  Spectating, replay, hideout and ambiguous classes return `unknown`.
- `QOL.core.Scheduler.scheduleOnce(callback, delaySec, featureId)` owns a
  one-shot callback, cancelled on feature disable. `schedule` remains recurring.
  Event handlers must still be explicitly unsubscribed.

See [the audit scope and remaining native checks](HELPER_AUDIT.md).

Native clears normalize camelCase style aliases to CSS names before calling
`ClearPropertyFromCode`: `uiScale` becomes `ui-scale`, for example. The simulator
models this boundary separately from JS style writes; accepting camelCase in
both places would conceal a failed return to CSS defaults.

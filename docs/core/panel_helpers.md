# Panel helpers

Source: `panorama/scripts/core/ql_panel_helpers.js`.
Start with the [helper decision map](../HELPERS.md) when choosing an API.
Load `ql_utils.js` and the QOL namespace before this module. The same panel API
object is exposed as `QOL.core.panel`, `QOL.core.PanelHelpers`, and
`QOL.ui.PanelHelpers`.

## Public interface

| Export on `QOL.core.panel` | Contract |
| --- | --- |
| `isAlive(panel)`, `isPanelAlive(panel)` | Aliases of `QOL_UTILS.IsPanelValid`: false for absent, invalid, or throwing handles. |
| `create(type, parent, id, properties)`, `createPanel(...)` | Guard parent validity and catch creation errors; return panel or null. |
| `delete(panel)`, `deletePanel(panel)` | Schedule `DeleteAsync(0)` on a valid panel; catch deletion errors. |
| `createOwnedTree()` | Own exclusively QOL-created IDs through instance-local child reconciliation and complete tree retirement. See below. |
| `createNativeStyleOwner({resetValues}?)` | Own attempted native code properties/classes with readback invalidation and retried retirement. Does not create/delete panels or discover sources. See below. |
| `findHud(preferredRoot)` | Search context/ancestors for Hud; no-argument calls cache real HUD matches per context, never loading-root fallbacks. Can return the context/top root as a fallback, so this alone does not prove active gameplay. |
| `findRoot(panel?)` | Walk ancestors of the supplied panel, defaulting to the current context; return null on native traversal failure. |
| `findChild(parent, id)` | Safe native `FindChild` wrapper for direct children. |
| `findTraverse(root, id)` | Safe native `FindChildTraverse` wrapper. |
| `setClass(panel, className, active)` | Compare current class membership before changing it; return whether changed. |
| `setVisible(panel, visible)` | Set the panel's `visible` property; this does not compare before assignment. |
| `syncStyles(panel, styleMap, lastSig)` | Compare serialized style map with caller-owned signature; if changed, write the whole map. Return `{changed, sig}`. |
| `clearStyleProperty(panel, property)` | Try native `ClearPropertyFromCode`; return success. |
| `activate(panel)` | Dispatch native Activated event, returning success/failure. |
| `isVisible(panel)` | Check validity, local visible flag, and a few local hidden classes; does not compute CSS or ancestor visibility. |
| `readText(panel)` | Read string text, then text attribute fallback; return empty string on failure. |
| `readTextDeep(panel, maxDepth = 4)` | First nonempty text from a bounded descendant search; not necessarily the desired numeric/gameplay label. |
| `readId(panel)` | Safely read an ID string. |
| `hasClassToken(panel, token)` | Safe local class membership test. |
| `setWashColor(panel, color)`, `setWashColorFromPalette(panel, value)` | Apply wash color directly or through the palette. |
| `normalizePaletteIndex(value)`, `resolvePaletteColor(value)` | Normalize an index or resolve its palette color. |
| `washColorPalette` | Exported palette array (not a function). |

## Styles and ownership

`createNativeStyleOwner()` returns `apply(panel, styles, classes?)`,
`retain(panels)` and `clear()`. These return whether the requested writes or
retirement completed. Supply desired maps to `apply`; properties/classes removed
from those maps are released. `retain` releases tracked handles absent from the
supplied iterable; `clear` releases all. Only attempted fields are owned, including
partially rejected writes. Unrelated native properties/classes remain untouched.
Classes must be reserved for the caller's presentation; retiring a class removes
it rather than restoring an earlier native membership.

Successful style maps cache actual native readback as well as their desired
signature, avoiding redundant writes after string normalization and reapplying
after native feedback overwrites. Optional caller-supplied `resetValues` writes
neutral values before strict native property clearing. Rejected retirement remains
recorded, with one cleanup-only scheduled retry until successful or destroyed.
This retry may finish after feature disable; it never derives settings or reapplies
presentation. Private property/class leases prevent an old retiring instance from
clearing fields claimed by a new instance. Reapplication in the same instance also
cancels a field's retirement intent. Discovery, current-HUD selection, settings,
active guards and presentation polling remain the caller's responsibilities.
Inventory, souls, stats placement and top/bottom bar geometry use this contract;
it is separate from created-tree ownership and specialized native animation restoration.

`createOwnedTree()` returns `child(parent, type, id, properties?)`, `sweep()`,
`remove(id)`, `clear()` and `dispose()`. Each nonempty ID must be unique within that instance
and reserved for QOL-created content; never use this helper to adopt native
panels. Child reconciliation retains expected ancestry, so moved children are
still retired with their former owner. `remove(id)` retires one recorded branch,
including its moved descendants, while retaining unrelated branches; unknown
IDs are ignored. `sweep()` releases moved/replaced nodes
and retries pending asynchronous deletion. It returns whether no recorded node
was retired during that pass, allowing a caller to invalidate a complete layout
without running another ancestry scan. Retried deletion of previously retired
nodes does not invalidate surviving nodes. `clear()` retires all nodes while
retaining deletion retries. Final `dispose()` also drops those retry records.
Partial construction can be retried through the same child calls. A new
instance retires an existing foreign tree instead of adopting UI that the
previous instance may already have queued for deletion. Default creation
properties disable hit testing on each child.
Owned false hit-test flags are also reconciled through native properties; a
partial flag write keeps the node recorded for retry and cleanup.

Native parent discovery, active-instance guards, content/history, style
signatures and schedules remain the manifest's responsibilities. This helper
does not establish gameplay availability or run a controller loop.

`syncStyles` compares signatures, not each property against its current value.
Retain its returned signature only for the same panel instance; reset it when the
panel changes or when another owner may have changed those styles. Passing no
previous signature rewrites the full map each call.

For a single property with stable read-back, use
`QOL_UTILS.SetStyleIfChanged(panel, property, value)`. For normalized opacity use
`QOL_UTILS.SetPanelOpacitySafe(panel, value, fallback)`. The unconditional
`QOL_UTILS.SetStyleSafe(panel, property, value)` serves cases requiring reassertion.
Native normalization can make read-back comparison unsuitable; preserve a
feature's intentional reassertion behavior.

`safeCreatePanel` and `safeDeletePanel` are private implementation names, not
exports. `setStyleIfChanged` and `setPanelOpacitySafe` are not methods of
`QOL.core.panel`; use the leaf helpers named above.

The leaf `QOL_UTILS.ClearStyleSafe` used by HUD manifests also tries native
`ClearPropertyFromCode` first, then legacy assignments only if native clearing
is unavailable, reports `false`, or throws. The core boolean helper above remains strict.

A partial native style-write failure returns `sig: null` from `syncStyles`, so a later call retries the map. `readTextDeep` returns empty text when native child enumeration fails. Panel validity (`isAlive`) is unrelated to player life state.

Both clear helpers translate JavaScript-style property names (for example
`uiScale`, `preTransformScale2d`, `washColor`) to native CSS names (`ui-scale`,
`pre-transform-scale2d`, `wash-color`) before `ClearPropertyFromCode`. Already
hyphenated names are accepted unchanged. This is shared by HUD features, so a
scale reset must release the override for every caller, not only healthbars.

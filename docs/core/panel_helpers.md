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
is unavailable or throws. The core boolean helper above remains strict.

A partial native style-write failure returns `sig: null` from `syncStyles`, so a later call retries the map. `readTextDeep` returns empty text when native child enumeration fails. Panel validity (`isAlive`) is unrelated to player life state.

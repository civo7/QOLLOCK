# `panorama/scripts/core/ql_panel_helpers.js`

## Purpose
Provides low-level panel safety primitives, DOM traversal, and zero-waste style manipulation to prevent C++ layout invalidation.

## Dependencies
- `panorama/scripts/core/ql_namespace.js` (`QOL.core.panel`, `QOL.ui.PanelHelpers`)

## Interface (`QOL.core.panel`)
- `isPanelAlive(panel)`: Safe panel validity check (`panel && panel.IsValid()`). Guards against accessing destroyed or freed C++ panels.
- `safeCreatePanel(type, parent, id, properties)`: Exception-safe wrapper around `$.CreatePanel`.
- `safeDeletePanel(panel)`: Safely destroys a panel via `DeleteAsync(0)` without throwing if already destroyed.
- `findHud(preferredRoot)`: Traverses the panel hierarchy to locate the root Deadlock `#Hud` or `CitadelHud` panel with internal caching.
- `findRoot()`: Walks parent nodes up to the topmost window root.
- `setStyleIfChanged(panel, property, value)`: Writes `panel.style[property] = value` **only** if the property has actually changed, eliminating redundant C++ style cache invalidation and layout recalculations.
- `setPanelOpacitySafe(panel, opacity, fallback)`: Safely updates panel opacity without redundant writes.
- `syncStyles(panel, styleMap)`: Batch applies an object of styles to a panel, writing only changed attributes.

## Architectural Rule
- Never write `panel.style.prop = val` repeatedly in a high-frequency polling loop without checking if the current value differs. In Source 2, redundant style assignments force layout recalculation across the panel subtree.

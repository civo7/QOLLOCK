# `panorama/scripts/core/ql_namespace.js`

## Purpose
Initializes the root `QOL` and `QOL.core` namespace hierarchy, establishes environment role detection (`hud` vs `em` escape menu), and sets up compatibility aliases.

## Dependencies
- Must load 1st among core scripts (defined in `hud.xml` and `hud_escape_menu.xml`).

## Interface (`QOL.core`)
- `QOL.VERSION`: Current mod semantic version string (e.g. `4.0.0`).
- `QOL.BUILD`: Build identifier timestamp.
- `QOL.ROLE`: Active execution context role (`"hud"` in gameplay HUD, `"em"` in Escape Menu settings window).
- `QOL.core.panel`: Alias for panel helpers.
- `QOL.core.PanelHelpers`: Backward-compatibility alias.
- `QOL.core.hud`: Alias for HUD helper subsystem.
- `QOL.core.time`: Alias for match clock subsystem.
- `QOL.core.perf` / `QOL.core.Scheduler`: Aliases for scheduler subsystem.
- `QOL.core.registry` / `QOL.core.FeatureRegistry`: Aliases for feature registry.
- `QOL.core.logger` / `QOL.core.Logger`: Aliases for logger.
- `QOL.core.app` / `QOL.core.App`: Aliases for boot coordinator.

## Architectural Notes
- Provides a safe `QOL.import()` polyfill for transitional features during refactoring.
- Avoids overwriting existing global state if scripts are reloaded dynamically.

# `panorama/scripts/core/ql_hud.js`

## Purpose
Provides Deadlock-specific HUD element discovery, match mode detection (Hideout, Sandbox, Street Brawl), and root CSS class synchronization.

## Dependencies
- `panorama/scripts/core/ql_namespace.js` (`QOL.core.hud`)
- `panorama/scripts/core/ql_panel_helpers.js` (`QOL.core.panel`)

## Interface (`QOL.core.hud`)
- `findHud(preferredRoot)`: Resolves and returns the main `#Hud` panel (delegates to `QOL.core.panel.findHud`).
- `isInHideout(root)`: Checks if player is in sandbox/testing/hideout mode (`connectedToHideout` / `InHideout` classes).
- `isStreetBrawl(root)`: Checks if active match is in Street Brawl mode (`gamemode_streetbrawl`).
- `isClassActive(className)`: Checks if a given class token is active on the HUD root.
- `applyRootClasses(root, config, timestamp, force)`: Synchronizes feature CSS classes onto the root container based on active configuration settings.

## Engine Reality Note
- Over 95% of in-game panels are created dynamically at runtime by C++ code. The HUD root undergoes structural changes during match phase transitions (draft, spawn, hideout, game active). Always use `findHud()` or cache panel references with `isPanelAlive()` validation.

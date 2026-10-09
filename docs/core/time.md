# `panorama/scripts/core/ql_time.js`

## Purpose
Provides parsing and formatting helpers for Deadlock match time and cooldown clocks.

## Dependencies
- `panorama/scripts/core/ql_namespace.js` (`QOL.core`)
- `panorama/scripts/core/ql_panel_helpers.js` (`QOL.core.panel.isAlive`, `findHud`)
- `panorama/scripts/ql_panelcache.js` (private scoped ID resolvers, created lazily after HUD includes)

## Interface (`QOL.core.time`)
- `formatSeconds(seconds)`: Formats finite seconds into an `M:SS` string (e.g. `65` -> `"1:05"`). Non-finite or negative inputs clamp to `0`.
- `readGameTime(topBar)`: Reads the native `GameTime` label under `TopBar` and converts `"MM:SS"` text to total elapsed seconds. Private ID resolvers follow verified `HudCore > TopBar` and `GameClock > GameTime` owners, current direct children and ancestry; missing sources back off. A construction clock under the supplied root remains a fallback until the preferred native clock arrives. Returns `0` on parse failure or missing panel.
- `parseClockSeconds(str)`: Parses `"MM:SS"` or `"M:SS"` strings into integer seconds. Clamps seconds to modulo 60.
- `getGameSecondsForUrn(topBar)`: Alias for `readGameTime`.
- `subscribeGameSecond(callback, priority)`: Starts a shared 100 ms observation while subscribed. Calls listeners on a changed second or source/root generation, ordered by ascending priority, and returns an unsubscribe function. Equal seconds on a replacement source still notify consumers. Rejuvenator state updates before minimap consumers.
- `readObservedGameTime(topBar)`: Returns the last shared sample for the observed root/topbar; reads directly before the first sample or when the requested/current root differs.

Backward-compatibility aliases on root `QOL`: `QOL.getGameSecondsForUrn`, `QOL.parseClockSeconds`, `QOL.formatSeconds`.

## Invariants & Architectural Notes
- Polls only while a feature has a game-second subscription. The slower feature loops still handle native state changes between seconds, using the last observed second for countdowns.
- Label lookup is cached to prevent redundant C++ DOM traversal every frame.
- The final unsubscribe cancels shared observation and resets its private source
  records. Listener mutation is safe; new subscriptions join the next dispatch.
- Native layout/binding timing requires maintainer client verification; the
  offline tests establish source selection and subscriber coordination only.

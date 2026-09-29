# `panorama/scripts/core/ql_time.js`

## Purpose
Provides parsing and formatting helpers for Deadlock match time and cooldown clocks.

## Dependencies
- `panorama/scripts/core/ql_namespace.js` (`QOL.core`)
- `panorama/scripts/core/ql_panel_helpers.js` (`QOL.core.panel.isAlive`, `findHud`)

## Interface (`QOL.core.time`)
- `formatSeconds(seconds)`: Formats finite seconds into an `M:SS` string (e.g. `65` -> `"1:05"`). Non-finite or negative inputs clamp to `0`.
- `readGameTime(topBar)`: Reads the native `GameTime` label under `TopBar` and converts `"MM:SS"` text to total elapsed seconds. Reuses live TopBar/label references only while they remain under the supplied HUD, and backs off missing-panel searches. Falls back to a clock directly under the supplied root during panel construction. Returns `0` on parse failure or missing panel.
- `parseClockSeconds(str)`: Parses `"MM:SS"` or `"M:SS"` strings into integer seconds. Clamps seconds to modulo 60.
- `getGameSecondsForUrn(topBar)`: Alias for `readGameTime`.
- `subscribeGameSecond(callback, priority)`: Starts a shared 100 ms observation of the native GameTime label while subscribed. Calls listeners on a changed second, ordered by ascending priority, and returns an unsubscribe function. Rejuvenator state updates before minimap consumers.
- `readObservedGameTime(topBar)`: Returns the last shared sample while observing, or reads the label directly before the first sample.

Backward-compatibility aliases on root `QOL`: `QOL.getGameSecondsForUrn`, `QOL.parseClockSeconds`, `QOL.formatSeconds`.

## Invariants & Architectural Notes
- Polls only while a feature has a game-second subscription. The slower feature loops still handle native state changes between seconds, using the last observed second for countdowns.
- Label lookup is cached to prevent redundant C++ DOM traversal every frame.

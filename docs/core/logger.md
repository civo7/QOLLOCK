# `panorama/scripts/core/ql_logger.js`

## Purpose
Provides leveled, throttled diagnostic logging with error streak tracking and console spam suppression.

## Dependencies
- `panorama/scripts/core/ql_namespace.js` (`QOL.core`)

## Interface (`QOL.core.Logger`)
- `logDebug(tag, message)`: Emits debug log if debug logging is enabled.
- `logInfo(tag, message)`: Emits informational log with `[QOLLock][INFO][<tag>]` prefix.
- `logWarn(tag, message)`: Emits warning log, throttled to prevent console flooding.
- `logError(tag, message)`: Emits error log with streak counting. Disables runaway features if error streak exceeds threshold.
- `getStreak(featureId)`: Returns current consecutive error count for a feature.
- `resetStreak(featureId)`: Resets consecutive error count to zero.

## Architectural Notes
- Load order: 2nd (after `ql_namespace.js`).
- Never throws exceptions from logging methods; all I/O is wrapped in error boundaries.

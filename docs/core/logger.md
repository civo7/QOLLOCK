# Diagnostic logger

Source: `panorama/scripts/core/ql_logger.js`; exports the same API as
`QOL.core.Logger` and `QOL.core.logger`. Uses `QOL_UTILS.PerfNowMs`.

- `logError(tag, message)` / `error(...)` and `logWarn` / `warn` require strings
  and throttle separately by tag and level (currently two seconds). Different
  messages under the same tag can therefore be suppressed.
- `logInfo` / `info` emit immediately; `logDebug` / `debug` emit only after
  `setDebug(true)`. Debug logging starts off.
- `clearThrottle(tag)` resets warning/error throttling for a tag.
- `getReport()` joins the retained log buffer; `getErrors(n = 20)` returns recent
  error/warning entries, newest first; `getCount()` reports retained count.
- `clear()` clears the buffer, not the throttle map. The buffer retains up to
  500 messages; it is not a durable or complete session audit log.

Logger does not track feature error streaks or disable features. There are no
`getStreak`/`resetStreak` methods; FeatureRegistry owns that behavior. Nor are
all logging operations wrapped in a native I/O exception boundary.

Guard expensive debug argument construction before calling the logger. Do not
use unthrottled per-tick messages for expected absent-panel conditions. See
[performance guardrails](../PERF_GUARDRAILS.md).

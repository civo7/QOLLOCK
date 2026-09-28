# HUD state recording

Owners: `ui/dev_tab.js`, `core/ql_manifest_tests.js`, `core/ql_app.js`.

After compiling/repacking, open Dev and start **Record HUD states**. Settings
close and gameplay resumes. Over 60 seconds, open/close Tab, die and respawn;
repeat separately for spectating/death replay as available. Reopen Dev and use
**Copy HUD report**. The report is also printed to the console at completion.

The collector reads state every 250ms and immediately on scoreboard events.
It records state changes plus event samples (at most 128 rows, with a dropped
count). An event may precede its corresponding class update; both observations
are useful. The report includes relative timestamps, scoreboard state, life
classification and raw HUD/ancestor classes. Local-player identity and rendered
visibility remain unverified by the collector itself.

Recording is opt-in and changes no settings. Completion, replacement, explicit
`ManifestTests.cancel()` and registry shutdown cancel managed callbacks and
unsubscribe the event listener. The last report remains in diagnostic memory;
it is not a saved configuration or persistent history. Destroying the whole JS
context can lose an unfinished report. Copying occurs only on explicit action.

`runEngineAudit()` also includes a single HUD state snapshot. It is not a
replacement for transition recording or visual verification.

## Stutter investigation

The same recording now samples managed Scheduler work about once per second
(at most 64 windows), with per-owner totals bounded to 128 rows. No extra
recording loop is created. The existing 250ms observer takes the samples.
The English/Russian Dev descriptions explain this additional coverage.

Compare a recording in a fresh hideout with another after buying an item and
returning to hideout, using the same settings. A third capture can span Tab
open/close. Include the exact source commit/repacked build and configuration
with reports. Keep the game focused for this comparison; test focus loss
separately and label it. Repeat identical conditions before drawing conclusions.

- `callbackMs`, `maxCallbackMs`, `slowestFeature`: timed synchronous managed
  callbacks; Date.now() resolution, not FPS or deferred rendering cost.
- `maxDelayMs`: late delivery relative to scheduled time, separately from callback
  execution. Loading, focus changes and engine stalls can all cause this.
- `activePolls`, `pendingOnce`: outstanding managed work at each sample.
- `workFeatures`: completed poll/one-shot counts, elapsed time, errors, and
  sampled start/peak/end tasks for each owner. Multiple polls are not automatically
  a bug; look for growth across equivalent warmed-up states.
- `enabledStart` / `enabledEnd`: changing feature coverage can explain lower
  work, particularly alongside errors. Recorder work itself is included.

Windows carry actual duration; a late callback does not fabricate one-second
samples for time that was not observed. Peak task counts between samples can be
missed. Samples and totals are frozen on completion/cancellation. No settings
are toggled, saved or automatically bisected. Raw schedules/event handlers and
the separate quickbuy, settings and profile contexts are excluded. A quiet
report cannot establish that QOLLOCK is innocent. Context destruction can lose
the report; capture before and after separately if recording cannot survive a
transition. Report printing occurs after measurement and can itself cost time.
The existing diagnostic bridge also serializes its snapshot every five seconds,
including the retained report after recording ends. This bounded extra payload
is an observer effect; use a fresh session without recording for clean frame-time
comparisons rather than assuming that stopping collection removes all overhead.

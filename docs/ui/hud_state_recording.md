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

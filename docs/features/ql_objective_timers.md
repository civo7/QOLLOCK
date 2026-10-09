# Objective timer producer and consumers

[Rejuv HUD](../../panorama/scripts/manifests/ql_rejuv_hud/manifest.js) is the sole
rejuvenator phase/capture tracker. Its phase model, source handles, charge
history and render state belong to its feature instance.

The published `QOL.state.rejuvState` is a read-only scalar snapshot containing
`running`, `spawnWaiting` and `counter`. The
[minimap timer owner](../../panorama/scripts/manifests/ql_minimap_timers/manifest.js)
reads the phase display from this snapshot and owns its own panels and geometry.
It must not mutate the snapshot or retain the producer's native handles.
The minimap rejuvenator toggle also enables the producer when its HUD toggles
are off; root presentation classes govern those HUD panels independently.
Hideout, Street Brawl, disable and a new match reset the published phase.

The minimap timer instance derives geometry settings in its settings hooks and
reconciles native objective/clock evidence at its existing cadence. It waits for
the current real HUD and owns every created child through the shared tree
helper. Partial construction stays hidden; moved children and prior instances
awaiting asynchronous deletion are retired. Stopped settings hooks cannot
recreate timer UI. The native map and the producer's scalar snapshot remain
outside that tree's ownership.

Capture countdowns distinguish missing native sources from explicit cleared
signals. Source replacement must not terminate a running capture merely because
the new charge subtree has not appeared. Native charge tokens and the native
buff signal retain their established precedence; the feature still ends at its
capture duration even while a charge token remains.

[Rift/urn timer](../../panorama/scripts/manifests/ql_urn_timer/manifest.js) has an
independent instance-local warning/spawn-window model derived from the observed
match clock and native minimap capture-point classes. It does not publish shared
timer state. A native source or topbar replacement rebinds the readout while
retaining an active warning deadline. A new match or hideout resets that model.
Its dynamic QOL-created readout and all tracked children are removed on disable
or parent replacement, including children moved outside their former container.
Partial construction stays hidden until reconciliation succeeds.
Hideout temporarily hides the current readout; re-enable creates a fresh owner
instead of adopting a generation queued for asynchronous deletion.
Living HUD replacement resets private clock/source bindings and the warning
model even when the next HUD reports the same match time.

The production lifecycle regressions in
[information_manifest_lifecycle.test.js](../../tests/information_manifest_lifecycle.test.js)
cover source gaps, retained old generations, partial creation/writes, scalar
publication and shutdown. Native phase feedback and layout still require the
maintainer's compile/repack and client scenario.

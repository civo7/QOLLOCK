# Compass and heading contracts

The [manifest](../../panorama/scripts/manifests/ql_compass/manifest.js)
owns heading discovery, compass tape, speed readout and minimap rotation/flip.
It may need to run for minimap settings while the visible compass is off.
Source selection is bounded and ordered; a generic first matching class can
select the wrong player. Preserve heading normalization, retry backoff and
panel replacement invalidation.

Heading samples, motion history and presentation signatures belong to the
feature instance. A replacement renderer, local-player image or overlay parent
starts a new binding generation. Speed-only mode still samples the native
player position; flipping does not require an available heading image. Native
rotation is untouched until Spinny Mode owns it, and partial layout/rotation
writes remain retryable. The HUD root projector owns only the related classes,
not another compass/speed visibility writer.

Hideout gates the entire tick, including minimap discovery. Entry hides owned
overlays, clears rotation/flip overrides through cached handles and discards
heading history. Idle polling must avoid searching for missing minimap panels;
returning to a match rediscovers current sources. Offline operation counts do
not establish native frame-time improvement.

Geometry and enable choices are derived in settings hooks; live heading and
position sampling retain their established cadence and calibration. The instance
binds the current real HUD, and its readouts wait for native gameplay instead of
using a loading/HUD-root fallback. A new HUD releases the previous readouts and
native rotation/flip bindings before sampling current sources.

Both readout trees use complete created-child ownership, including moved ticks
and labels. Partial construction hides both readouts while native rotation keeps
its independent lifetime. Immediate re-enable waits for previous asynchronous
deletion, and inactive settings hooks cannot create panels or resume polling.
`map_module_lifecycle.test.js` covers these cases alongside the preserved speed,
rotation, source replacement and Base/Alt/Tab geometry regressions. Native
composition and timing still require maintainer client verification.

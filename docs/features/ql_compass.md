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

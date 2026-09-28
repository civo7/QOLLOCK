# Compass and heading contracts

The [manifest](../../panorama/scripts/manifests/ql_compass/manifest.js)
owns heading discovery, compass tape, speed readout and minimap rotation/flip.
It may need to run for minimap settings while the visible compass is off.
Source selection is bounded and ordered; a generic first matching class can
select the wrong player. Preserve heading normalization, retry backoff and
panel replacement invalidation.

Hideout gates the entire tick, including minimap discovery. Entry hides owned
overlays, clears rotation/flip overrides through cached handles and discards
heading history. Idle polling must avoid searching for missing minimap panels;
returning to a match rediscovers current sources. Offline operation counts do
not establish native frame-time improvement.

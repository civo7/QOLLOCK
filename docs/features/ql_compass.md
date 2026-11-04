# Compass and heading contracts

The [manifest](../../panorama/scripts/manifests/ql_compass/manifest.js)
owns heading discovery, compass tape, speed readout and minimap rotation/flip.
It may need to run for minimap settings while the visible compass is off.
Source selection is bounded and ordered; a generic first matching class can
select the wrong player. Preserve heading normalization, retry backoff and
panel replacement invalidation.

When the native renderer exists, heading/player discovery stays inside
`hud_minimap`, excluding its viewport frame and decorations. Renderer replacement
also invalidates the player binding and motion samples.
Player/FOV roots are immediate native renderer children, as confirmed by the
map snippets and captured tree. Discovery samples those children in order,
preferring the first active cone over the first local-player fallback, without
walking nested marker/overlay content. A living marker moved out of that direct
owner invalidates its cached binding immediately.

Heading samples, motion history and presentation signatures belong to the
feature instance. A replacement renderer, local-player image or overlay parent
starts a new binding generation. Speed-only mode still samples the native
player position; flipping does not require an available heading image. Native
rotation is untouched until Flip or Spinny Mode owns it, and partial layout/rotation
writes remain retryable. The HUD root projector owns only the related classes,
not another compass/speed visibility writer.
Static Flip adds a half-turn through `pre-transform-rotate2d`, leaving the native
team transform intact. Renderer CSS compensates marker and reference-label
orientation without applying a second map half-turn. The native-style owner
reasserts overwritten rotation and retries retirement after disable/replacement.
Tunnel and objective-timer orientation rules load in the HUD stylesheet because
those overlays are viewport children outside the native renderer context.

Hideout gates the entire tick, including minimap discovery. Entry hides owned
overlays, clears rotation/flip overrides through cached handles and discards
heading history. Idle polling must avoid searching for missing minimap panels;
returning to a match rediscovers current sources. A valid Customize selection of
a retained minimap permits map rotation/flip preview in hideout, while compass
and speed readouts remain hidden. Withdrawing that preview restores the idle
hideout gate. Offline operation counts do
not establish native frame-time improvement.

Geometry and enable choices are derived in settings hooks; live heading and
position sampling retain their established cadence and calibration. The instance
binds the current real HUD, and its readouts wait for native gameplay instead of
using a loading/HUD-root fallback. A new HUD releases the previous readouts and
native rotation/flip bindings before sampling current sources.

Both readout trees use complete created-child ownership, including moved ticks
and labels. The ownership sweep validates the retained tree before heading work;
construction is reconciled again only after an incomplete tree or ownership
change. Between graduations, one tape transform supplies the fractional heading
shift. Tick geometry and major/cardinal classes update on graduation, geometry
or panel changes. The stationary compass box clips the translating tape. Partial
class/style writes remain retryable before the heading is retained. Partial
construction hides both readouts while native rotation keeps
its independent lifetime. Immediate re-enable waits for previous asynchronous
deletion, and inactive settings hooks cannot create panels or resume polling.
`map_module_lifecycle.test.js` covers these cases alongside the preserved speed,
rotation, source replacement and Base/Alt/Tab geometry regressions. Native
composition and timing still require maintainer client verification.
Check tape clipping, graduation transitions and the 360-degree wrap after
compile/repack; effective positions preserve the previous geometry within its
subpixel rounding precision.

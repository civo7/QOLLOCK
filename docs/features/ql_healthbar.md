# Player healthbar contracts

[Dispatcher](../../panorama/scripts/manifests/ql_healthbar/manifest.js),
[shared styles](../../panorama/scripts/manifests/ql_healthbar/shared.js),
[variants](../../panorama/scripts/manifests/ql_healthbar/variants/) and
[hero probe](../core/hero_probe.md) are separate owners. Read the active HUD
includes before changing their load order.

`HEALTHBAR_TYPE` selects numeric modes 0–5. The dispatcher must tear down the
previous variant's owned panels, classes, schedules and inline styles when the
mode changes or turns off. Shared accent and position cleanup can still matter
when a replacement variant is inactive. Returning to mode 0 must restore native
layout.

The dispatcher owns the derived configuration and one instance of each variant
controller. Controllers expose `update`, `release` and `isActive`; all mutable
source references, signatures, pulse state and animation state belong to those
instances. Public `QOL.healthbar` variant/style entry points delegate to the same
current controllers, without a second engine or poll loop. Root variant classes
remain the complete-config HUD projector's responsibility. The dispatcher reads
the retained Minimalist preset offsets and shared warning policy through its own
declared ConfigStore slice; settings hooks reproject classes before rendering.

Source discovery follows the current native health container and the explicit
canvas children in the shipped XML. Still-living former owners are released on
replacement, including an independently replaced heart grid, number group or
food container. Budhud deletes its owned percentage label when its source or
mode changes. Native current-health color and warning pulse belong exclusively
to `ql_color_warnings`; Budhud observes that color for its percentage readout
instead of running another pulse or clearing the native label. Presentation and accent
signatures are cached only after successful writes; partial writes remain
retryable. Default presentation never clears unrelated native transforms.

Fighting Game (FG) creates its own portrait under the current health bar.
Native gold and level portraits are unreliable identity sources. FG uses the
verified pregame hero signal when applicable, then live crosshair evidence;
missing or conflicting evidence hides the portrait. A replaced source panel
must reset image and style signatures. Hideout can still display FG in hero
testing. Shared native healthbar position, scale, opacity and accent settings
also apply there, while animated variant work that needs match health data stops.
Replaced native frame panels must receive the current accent even when its value
is unchanged.

Minecraft Hearts has a different layout and animation path from the native
bar. Do not generalize geometry or performance results from mode 0 to it.
Its generated rows are the controller's property; rebuilding or disabling does
not remove foreign children from the static containers. Blink, low-health jiggle
and healing waves use feature-owned managed one-shots with generation guards.
Hideout, source loss, replacement and disable cancel them and reset their state.
`mc.inspect()` reports the current source, live heart count and animation status
for runtime diagnostics, without exposing mutable controller bookkeeping.

Deferred-damage and incoming-heal fractions use the verified native
`ProgressBarWithMiddle` parents and their `.ProgressBarMiddle` children. The
fraction is the child's measured height divided by its parent height (or a
percentage height before layout). Historical guessed `*_Middle` IDs are no longer
queried. Verify both overlays and their healing/blink timing after compilation;
offline tests prove source routing and lifecycle, not native progress rendering.
Native current/max number bindings remain native; only derived percentage and
experience labels are written by Minecraft.
For native layout, hero switching and fill alignment, follow
[client verification](../TESTING.md) after maintainer compile/repack.

Shared overall scale uses `ui-scale` on the static `QOLHealthbarGeometry` canvas
in `hud_health_container.xml`. Bars, regen/health numbers and Minecraft content
are siblings inside that canvas. The layout root merges into the engine-owned
health container; it must not be treated as an extra static panel. The outer
container retains native CSS scale, variant dimensions and aspect-ratio rules.
At nondefault scale, the shared owner fixes the canvas's logical dimensions from
the outer container's actual layout size divided by its native cumulative UI
scale. This keeps percentage-sized bar content and fixed-size number groups in
the same coordinate space. Missing measurements defer scaling; changed native
dimensions or a replaced canvas invalidate the style signature. Old loaded
layouts without the canvas retain the outer-scale compatibility path.
The default, Reset and teardown release canvas dimensions and scale. The shared
owner does not replace rotations or variant-owned child animations. Customize
measures the scaled canvas but moves the outer container. Owned offsets are
returned to zero before releasing the composite native `position` property;
clearing only the JS x/y records must not be treated as proof of relayout.
Cancel, Reset, history and teardown use the same shared restoration path.
Client checks must cover the default bar and each variant at both scale limits,
including health changes, barriers, regen and the aspect-ratio option. Verify
alignment between tilted bar content and health numbers in the client; simulator
style assertions cannot establish native composition.

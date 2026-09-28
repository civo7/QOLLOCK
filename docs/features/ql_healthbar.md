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

Fighting Game (FG) creates its own portrait under the current health bar.
Native gold and level portraits are unreliable identity sources. FG uses the
verified pregame hero signal when applicable, then live crosshair evidence;
missing or conflicting evidence hides the portrait. A replaced source panel
must reset image and style signatures. Hideout can still display FG in hero
testing, while other variant animation work must stop.

Minecraft Hearts has a different layout and animation path from the native
bar. Do not generalize geometry or performance results from mode 0 to it.
For native layout, hero switching and fill alignment, follow
[client verification](../TESTING.md) after maintainer compile/repack.

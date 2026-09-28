# Passive cooldown mode contracts

The [manifest](../../panorama/scripts/manifests/ql_passive_cooldown/manifest.js)
selects Basic or Advanced mode using HUD classes. Basic styles the native
`hud_passive_items` panel; Advanced delegates item matching and overlay panels
to [ql_item_mirror](ql_item_mirror.md). The
[legacy audio manifest](ql_legacy_audio_passive.md) also works on Basic layout.
Inspect all owners when changing their shared settings.

Mode switches and disable must remove owned classes and inline overrides so
native CSS can take over. Basic cooldown labels are visible only while their
native item ancestor has `cooling_down`; retained dialog text alone is not
evidence of an active cooldown. Native death and respawn class timing needs
client verification.

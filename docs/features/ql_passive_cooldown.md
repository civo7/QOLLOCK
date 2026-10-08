# Passive cooldown mode contracts

The [manifest](../../panorama/scripts/manifests/ql_passive_cooldown/manifest.js)
selects Basic or Advanced mode using HUD classes. Basic styles the native
`hud_passive_items` panel; Advanced delegates item matching and overlay panels
to [ql_item_mirror](ql_item_mirror.md). This manifest is the sole owner of Basic
geometry, opacity, mode classes and shop visibility. Core root synchronization
and the [legacy audio manifest](ql_legacy_audio_passive.md) do not write that
presentation. Shared setting declarations route configuration to interested
features; they do not grant additional style ownership.

Advanced mode also observes transient item-mirror availability. A retired or
failed mirror releases the Advanced mode class immediately through the registry
presentation event; re-enable restores it from the accepted mode. Basic remains
independent. Stored mode settings are unchanged.

Mode switches and disable must remove owned classes and inline overrides so
native CSS can take over. Basic cooldown labels are visible only while their
native item ancestor has `cooling_down`; retained dialog text alone is not
evidence of an active cooldown. Native death and respawn class timing needs
client verification.

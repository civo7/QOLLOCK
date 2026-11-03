# Passive cooldown mode contracts

The [manifest](../../panorama/scripts/manifests/ql_passive_cooldown/manifest.js)
selects Basic or Advanced mode using HUD classes. Basic styles the native
`hud_passive_items` panel; Advanced delegates item matching and overlay panels
to [ql_item_mirror](ql_item_mirror.md). This manifest is the sole owner of Basic
geometry, opacity, mode classes and shop visibility.
Both renderers pair each percentage margin with its opposite negative margin:
placement does not consume the row's available width/height, and a centered
owner moves by the full parent percentage. Customize measures visible icon
content and its owned sample, while moving the existing native/custom owner;
the Basic placement canvas is not the selection frame.
Selecting Item Cooldowns in a leased Customize session allows Basic visibility
through the shop gate and creates a representative owned icon/readout under its
native geometry owner. Advanced mode uses its production slot constructor under
the mirror row, independently of inventory and ready-flash timers, and permits
that selected sample across Escape/shop gates. Native item state is untouched.
Selection/lease withdrawal, owner replacement and disable remove these samples
and restore ordinary visibility and inventory rendering.

Core root synchronization and the [legacy audio manifest](ql_legacy_audio_passive.md) do not write that
presentation. Shared setting declarations route configuration to interested
features; they do not grant additional style ownership.

Advanced mode also observes transient item-mirror availability. A retired or
failed mirror releases the Advanced mode class immediately through the registry
presentation event; re-enable restores it from the accepted mode. Basic remains
independent. Stored mode settings are unchanged.

Mode switches and disable must remove owned classes and inline overrides so
native CSS can take over. Native styles and reserved mode/preview classes use the
shared native-style owner: feedback invalidates cached presentation, and rejected
retirement continues through cleanup-only retries after disable. Basic keeps its
existing pixel placement and percentage margins; native axis overrides release
their composite position as well. Stopped settings hooks do not derive or restore
presentation. Basic cooldown labels are visible only while their
native item ancestor has `cooling_down`; retained dialog text alone is not
evidence of an active cooldown. Native death and respawn class timing needs
client verification.

Shop suppression follows the existing native `gShopOpen` listener in CSS; it does not read shop ancestry or write inline visibility on every tick. Customize preview supplies an owned exception class and refreshes through the accepted preview event. Independent normal/TAB hiding retains its existing visibility policy.

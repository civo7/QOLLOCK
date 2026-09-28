# Item cooldown mirror (`ql_item_mirror`)

The Advanced Item Cooldowns mode mirrors purchased items into `QOLItemMirrorRoot`
under the HUD. It reads native item classes and cooldown masks and estimates seconds
from radial movement when no numeric cooldown label is available.

## Configuration

The feature uses `ENABLE_PASSIVE_COOLDOWN` (default `false`) and runs in Advanced
mode when `ENABLE_OLD_ITEM_COOLDOWNS` is `false` (default). The four category filters
are `ITEM_FILTER_DEF_PASSIVE` and `ITEM_FILTER_OFF_PASSIVE` (default `true`), and
`ITEM_FILTER_DEF_ACTIVE` and `ITEM_FILTER_OFF_ACTIVE` (default `false`).

Layout settings are `PASSIVE_COOLDOWN_SIZE` (default `40`, range 30–60),
`PASSIVE_COOLDOWN_X` and `PASSIVE_COOLDOWN_Y` (default `0`, range -50–50), and
`PASSIVE_COOLDOWN_OPACITY` (default `0.5`, range 0–1).

## Lifecycle and performance

- The scheduler renders at 50 ms during cooldowns and 120 ms when idle. Settings
  changes request a source rescan and update immediately. Disable destroys the
  overlay and clears its tracking state.
- Sources are discovered beneath native `ModsContainer` panels. Stable inventories
  are rescanned after 5270 ms; changed inventories after 1630 ms; empty results
  after 1500 ms. Matching also considers tier, category, images and exception
  groups: a single class-to-item map cannot replace those rules.
- Source IDs and acquisition-order counters start at zero on creation and every
  overlay reset. Each item owns a distinct cooldown history and style cache;
  rescans preserve its key and acquisition order. Uninitialized counters produced
  the shared key `item_src_NaN`, allowing a ready item to trigger repeated false
  completion flashes while a different item was cooling down.
- The native `abilitiesContainer` reference is cached, revalidated each update,
  and replaced when the HUD changes. Opening the shop collapses the overlay and
  uses the idle cadence; closing it requests a source rescan. Hideout suppresses
  the overlay.
- Numeric text probes return immediately after finding a usable named class/ID.
  Otherwise they retain the existing filtered breadth-first fallback. Missing
  text is retried after 1000 ms instead of every 80 ms; successful probes retain
  the 80 ms interval. A new cooldown or replacement source panel resets this
  delay. This allows C++ to insert labels dynamically without permanently caching
  their absence. A newly inserted label may take up to one second plus one render
  tick to be detected; radial estimation continues during that time.
- Inline style fallback uses precompiled, property-bounded expressions. Normal
  style reads remain preferred. Disabled cooldown debugging does not format its
  per-item diagnostic strings.
- Active render cadence and source matching rules are unchanged. Runtime cost
  depends on inventory and native panel structure; no in-game timing reduction
  has been measured for these changes.

## Validation limits

Node tests exercise probe retry, dynamic text discovery, source replacement,
style parsing, and independent cooldown histories across multiple items, rescans
and overlay resets using mocked panels. After repacking, check Advanced mode with
all four category filters and several active/passive items: triggering an
ability-linked item must not flash an unrelated ready item. Native death/respawn
behavior and C++ dialog variable updates require the maintainer's Panorama
Debugger and a fresh VPK repack. This feature does not assume that death removes
a particular cooldown class or always freezes a native mask.

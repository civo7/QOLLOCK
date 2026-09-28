# ql_heroshop

Shop layout, simplification and quickbuy behavior; quickbuy has a special-context companion.

Source: [manifest.js](../../panorama/scripts/manifests/ql_heroshop/manifest.js),
loaded by the HUD layout. The general [lifecycle contract](../core/feature_registry.md)
and [architecture](../../ARCHITECTURE.md) explain context and configuration routing.

## Runtime and ownership

Subscribes to `engine:shop_opened` and `engine:shop_closed`, starts a
1-second fallback loop and performs an initial tick. Disable removes those
listeners and resets owned native-panel state. Quickbuy also has a separate
`hud_quickbuy.xml` context; inspect its included script before assuming HUD
globals are available there. Recent-purchase settings overlap another owner.

### Quickbuy companion timer ownership

`panorama/scripts/hud_quickbuy_total_summary.js` runs in the quickbuy XML
context without the HUD Scheduler. It owns one raw `$.Schedule` callback at a
time. `CitadelQuickbuyItemsChanged` refreshes synchronously, cancels the pending
poll, and schedules its replacement. A timer callback clears its handle before
refreshing. Missing, destroyed, or throwing context handles stop this loop.

Both enabled and disabled modes poll every `0.5s`; queue events must never add
independent recurring loops. Previously the event refresh discarded the handle
without cancelling its callback. An offline reproduction with 20 queue events
left 21 loops and fired 420 callbacks over 10 seconds, even with quickbuy
enhancements disabled. With cancellation, the same interval fires 20 callbacks
and retains one loop. Disabling recent-purchase notifications does not affect
this separate context.

Preview updates apply the final state directly. They no longer clear a populated
slot's text, classes and image and immediately restore them on each poll.
The final image path is still reasserted once per slot update: the Image is a
child of a native `CitadelModIcon`, whose C++ code could update the same instance.
A JS-only last-path signature would not detect such an update. Empty/disabled
slots still clear, and re-enable restores the current queue. Native preview
binding/rendering should be checked after repacking.

The lifecycle audit's unchanged two-item queue used to produce 40 changed class
writes, 20 changed text writes and 20 image-path changes (50 SetImage calls) per
five seconds. The same fixture now has zero of these changes and 40 SetImage
calls after warm-up. Polling and lookups remain: this is a reduction in requested
operations, not a measured FPS improvement. `tests/quickbuy_preview.test.js`
covers stable/disabled previews, source changes, clearing, re-enable and target
image replacement.

`tests/quickbuy_lifecycle.test.js` loads the actual quickbuy XML script includes
in an isolated sandbox. It covers events before the startup callback, event
bursts in enabled/disabled modes, context destruction, immediate queue changes,
and passive soul updates. The leak is reproducible JavaScript behavior; whether
it explains a player's purchase-to-hideout stutter still requires a repacked
client test. The HUD Scheduler benchmark does not measure this raw timer.

## Declared settings

- `HUD_SHOP_ENABLED` (toggle)
- `ENABLE_HERO_SCENE_PANEL` (toggle)
- `DISABLE_QUICK_BUY` (toggle)
- `ENHANCED_QUICKBUY_COUNT` (slider)
- `ENABLE_QUICKBUY_CLICK_TO_NOTIFY` (toggle)
- `SHOP_OFFSET_X` (slider)
- `SHOP_OFFSET_Y` (slider)
- `SHOP_OPACITY` (slider)
- `SHOP_SCALE` (slider)
- `ENABLE_SIMPLIFY_SHOP` (toggle)
- `ENABLE_SIMPLIFY_ITEMS` (toggle)
- `DISABLE_SHOP_BLUE` (toggle)
- `ENABLE_SHOP_STATS` (toggle)
- `ENABLE_SIMPLIFY_SHOP_STATS` (toggle)
- `ENABLE_SHOP_RECENT_PURCHASES` (toggle)

Defaults/ranges belong to the linked schema, flat `QOL_DEFAULT_CONFIG` and
versioned codec definitions, not a duplicated table here. They are separate
representations; a declared field is not automatically a visible control or
proof of active runtime behavior. See [adding settings](../ADDING_SETTINGS.md).

## Verification boundary

The statements above describe source behavior. Native panel identity, binding
values, rendering and transitions need the maintainer's Panorama Debugger and
a repacked client scenario; neither a schema nor a read-only manifest hook
proves the whole feature works. See [verification](../TESTING.md).

Event-triggered deferred refreshes use `Scheduler.scheduleOnce` with the feature ID, so disabling the feature cancels pending callbacks as well as its recurring loop. Event unsubscription remains explicit.

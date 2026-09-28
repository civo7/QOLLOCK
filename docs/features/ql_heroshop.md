# Shop and quickbuy contracts

The [HUD shop manifest](../../panorama/scripts/manifests/ql_heroshop/manifest.js)
owns shop styling and reacts to shop open/close events. Recent-purchase filters
and notifications have a separate [owner](ql_recent_purchases.md).

The [quickbuy companion](../../panorama/scripts/hud_quickbuy_total_summary.js)
runs under `hud_quickbuy.xml`, outside the HUD JavaScript context and its
Scheduler. It owns one raw `$.Schedule` callback at a time. A queue event
refreshes immediately, cancels the pending poll and schedules one replacement;
disable and destroyed context handles stop the loop. Never let an event burst
create parallel polls.

Quickbuy previews apply the final state directly. Their image path is
reasserted because the native `CitadelModIcon` may update the same Image
instance; a JavaScript-only path signature cannot detect that. Empty or disabled
slots still clear. Check native preview binding in a repacked client.

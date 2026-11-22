# Shop and quickbuy contracts

The [HUD shop manifest](../../panorama/scripts/manifests/ql_heroshop/manifest.js)
owns shop styling and reacts to shop open/close events. Recent-purchase filters
and notifications have a separate [owner](ql_recent_purchases.md).

Its settings model, discovery, renderer and release state belong to each feature
instance. The verified owner is `Hud > .HudCore > CitadelHudHeroShop > Shop > MainPanel`;
bounded discovery also supports conditional native layouts. Closed or hidden shop
panels still receive settings changes and replacement checks. A living replaced
owner releases its QOLLOCK code styles and local classes before the current model
is applied to the new generation. The common native-style owner observes native
readback and retains rejected cleanup, including after disable, without requiring
another settings change. Stopped hooks and temporary loading roots cannot resume
shop presentation.

Offsets retain their existing paired-margin units, and scale applies to the
native `MainPanel`. Default geometry and opacity release code overrides so native
training-page layout, simplified-shop CSS and shop animation remain authoritative.
The owner preserves the native content and navigation hierarchy. Hero-scene,
shop-stat and quickbuy root flags use the complete HUD configuration projection;
the existing enhanced-quickbuy toggle is declared here so config load/export keeps
that mode alongside its preview count and click-to-notify setting. Shop event
bursts share one managed deferred refresh, cancelled with the discovery poll on
disable.

Permanent shop stat children remain declared in `citadel_hud_hero_shop.xml`.
Their container at `Shop/NavPanel/TestPanel` owns independent position, scale
and opacity. The shop manifest releases those overrides when stats are disabled,
the settings return to defaults, or the native container is replaced.
Their normal appearance follows the shop's existing `gShopOpen` listener through
`CitadelHudHeroShop.gShopOpen` selectors; armor/tech/weapon component XML copies
are unnecessary. Native component layouts keep their detail-view listeners and
bound values. Simplification and stat visibility still use their existing
settings and stylesheet owners, with no additional polling or listeners.

The [quickbuy companion](../../panorama/scripts/hud_quickbuy_total_summary.js)
runs under `hud_quickbuy.xml`, outside the HUD JavaScript context and its
Scheduler. It owns one raw polling callback at a time. A queue event
refreshes immediately, cancels the pending poll and schedules one replacement;
that replacement also catches native leaves updated after the event. Nonempty
enhanced queues refresh live values more often; empty/disabled queues, notify-only
mode and hideout use the idle cadence. Destroyed context handles stop the loop. Never let an event
burst create parallel polls.

The HUD presentation owner applies in-shop Quick Buy placement, scale and
opacity to the queue container and summary while the shop is open. It releases
them when the shop closes or Quick Buy is disabled. Compact gameplay placement
continues to apply to the native Quick Buy root in its own view.

The companion has private discovery, settings/queue calculations, presentation
records and release paths. Verified native host membership, rather than a living
handle alone, identifies its current generation. Departed hosts, queues, entries,
controls and ChatControls release owned code styles/classes/handlers; native
queue contents and unrelated activation callbacks remain intact. Optional
chat/focus/drag work uses separately tracked, generation-guarded raw schedules.
Mode changes and shutdown cancel those tasks; old entry callbacks cannot send
messages or clear current drag state. Native drag handlers are registered once
per panel and retired through private guards because their unregister signature
has not been verified. The verified unhandled queue-event subscription is removed
at shutdown. Partial writes and missing native children remain retryable.

Quickbuy previews apply the final state directly. Their image path is
reasserted because the native `CitadelModIcon` may update the same Image
instance; a JavaScript-only path signature cannot detect that. Empty or disabled
slots still clear. Check native preview binding in a repacked client.
The quickbuy layout also loads the shared read-only item-image catalog from
`ql_recent_purchases_data.js`. Preview images prefer a native `src` or `defaultsrc`
other than `none`, then use the localized catalog name instead of guessing an
asset filename from display text. Only manually populated preview images receive
an owned visibility override; disabling or clearing the slot releases it.

`tests/heroshop_module_lifecycle.test.js` exercises native baseline preservation,
closed-shop reactivity, late and living replacement, partial native writes,
config load/export, event bursts and disable/re-enable through the production
registry. Shop CSS, quickbuy companion and Customize-corner regressions complement
those checks. Native shop composition, training-page margins, animation, preview
binding and input still require maintainer compilation/repacking and client checks.

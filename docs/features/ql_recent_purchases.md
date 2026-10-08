# Recent-purchase ownership contracts

The [manifest](../../panorama/scripts/manifests/ql_recent_purchases/manifest.js)
owns shop filters, a floating purchase feed and top-bar hero popups. It shares
shop surfaces with [ql_heroshop](ql_heroshop.md) and top-bar surfaces with
other overlays; inspect those owners before changing a shared parent.

Settings, filters, source generations, history observations and managed callbacks
belong to each manifest instance. The factory does not mutate panels or start work.
The native shop source is `Hud > .HudCore > CitadelHudHeroShop > Shop > NavPanel >
RecentPurchasesPanel`, as declared in the active XML. Top-bar cards are identified
by the existing `HeroNameHidden` labels and native `HeroBadge.heroid` evidence.
Living replacements of the shop, purchase container, top bar, card or hero identity
release the retired generation and invalidate its pending work.

The engine owns `RecentPurchasesContainer` and its purchase rows. The mod
may read and style them but must not delete or cap native history. Disable clears
owned native code styles and filter/icon classes, then removes only mod-created
controls, notifications and popups. Turning off the shop surface also releases
its native styling while an enabled notification surface keeps working. Controls
are ordered before the native header without reparenting native history. Hideout and mode
transitions invalidate pending expiry and hero-mapping callbacks so old work
cannot recreate UI later. Re-entry should seed current native history without
replaying old purchases.

History observations follow native row identity and item/time/hero evidence;
simultaneous equal item/time purchases remain separate events. Recycled rows
refresh their filters and icons even when the list length and first row are
unchanged. A late hero label completes its existing event. Hero popups keep
unresolved purchaser evidence within the existing display window while other
purchases continue. Evidence from a recycled row cannot fill the earlier event. Notification limits
apply only to owned entries, whose existing expiry and fading behavior remain.
Failed child creation retains the pending purchase for the next poll, and partial
style writes retain an unsuccessful signature for retry.

The HUD poll retries a missing native shop panel at a bounded interval instead
of walking the full HUD on every tick. The existing `engine:shop_opened` signal
retries discovery on the next poll; periodic retry remains the fallback when
that event arrives before native layout or is unavailable. Once found, the
purchase container is resolved directly under its native panel.

Scoreboard positioning reads the current state through
`QOL.core.hud.isScoreboardOpen`. Default appearance releases code overrides back
to CSS; nondefault scales compose the active shop and scoreboard CSS baselines.
Native feedback transforms remain engine-owned. The manifest observes the existing
ultimate-cooldown, objective-map and urn settings through canonical shared config
inputs when positioning notifications; it does not write those owners' panels.
Shared root classes are projected by the core HUD owner from the complete config.

`tests/recent_purchases_owner.test.js` exercises living replacement, recycled rows,
independent filters, shared geometry, default restoration and failed-write retry;
`tests/recent_purchases_lifecycle.test.js` retains history, hideout and missing-source
regressions. Native rendering and reported client stutter
require client evidence separate from Node lifecycle checks.

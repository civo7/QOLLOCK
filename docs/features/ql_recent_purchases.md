# Recent-purchase ownership contracts

The [manifest](../../panorama/scripts/manifests/ql_recent_purchases/manifest.js)
owns shop filters, a floating purchase feed and top-bar hero popups. It shares
shop surfaces with [ql_heroshop](ql_heroshop.md) and top-bar surfaces with
other overlays; inspect those owners before changing a shared parent.

The engine owns `RecentPurchasesContainer` and its purchase rows. The mod
may read and style them but must not delete or cap native history. Disable
removes only mod-created controls, notifications and popups. Hideout and mode
transitions invalidate pending expiry and hero-mapping callbacks so old work
cannot recreate UI later. Re-entry should seed current native history without
replaying old purchases.

Scoreboard positioning reads the current state through
`QOL.core.hud.isScoreboardOpen`. Native rendering and reported client stutter
require client evidence separate from Node lifecycle checks.

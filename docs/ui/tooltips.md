# Settings tooltip ownership

`panorama/scripts/ql_settings_tooltips.js` owns the settings tooltip's complete
created tree, hover/show/hide deadlines, layout-settle callback and scroll
tracking. It uses `QOL.core.panel.createOwnedTree()` from the settings XML context;
HUD manifests do not share this state.

Each request reconciles every child, including metadata rows and labels.
Partial construction remains hidden and can retry on a later request. Tracking
detects moved/replaced children and hides the invalidated tooltip. Final
`QOL.tooltip.dispose()` retires every owned child, including children moved
outside the tooltip. Ordinary `hideRowTooltip()` cancels work and hides the
reusable tree without deleting native hosts or the settings row.

Show, deferred hide, tracking and layout-settle tasks each own one cancelable
handle. Zero is a valid handle. Cancellation invalidates callback identity before
calling the native API; a rejected cancellation cannot revive an old hover or
hide a later one. Tasks retain the selected context, host and SettingsWindow
generation. Show/tracking/settle also validate anchor ancestry. A living retired
window or moved row cannot transfer its hover to a new window. Owner replacement
retires old children and does not transfer warm-hover or scroll-suppression state.

The existing coordinate conversion, list clipping, cursor positioning, warm/cold
hover policy and scroll suppression remain in this owner. Metadata and prefixes
continue through the settings localization catalogs. The tests cover lifecycle
failures and modeled positioning; maintainer compilation/repacking and native
checks remain required for actual cursor/scroll/layout behavior.

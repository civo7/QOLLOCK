# Reload countdown ownership

`ql_reload_cooldown` estimates remaining reload time from the established native
radial clip and bounded reload-class ancestry. It observes the native progress
without changing its clip, classes or visibility. Icon/circle visibility remains
part of the complete HUD root-class projection.

The instance owns scoped reticle/progress discovery, the smoothing model and its
dynamic text label. A living reticle or progress replacement invalidates velocity
and countdown history. Unknown/inactive progress starts a new estimate; a single
angle cannot establish velocity. Both increasing and decreasing radial progress
retain the existing smoothing and monotonically decreasing display policy.

Missing sources use bounded idle retries; active reloads retain their animation
sampling cadence. Accepted settings apply immediately. Failed label creation and
partial style writes remain retryable, while disable deletes the owned label and
stops its schedules. The label uses shared created-tree ownership: rapid re-enable
waits for the previous asynchronous deletion, and moved labels remain owned even
while sampling is paused. Current real-HUD replacement resets source/estimate
bindings; loading roots and stopped hooks cannot create a readout. Retirement
hides/deletes the label without depending on a successful native text setter.
`tests/reload_owner_lifecycle.test.js` covers those production
transitions; native timing, composition and input require maintainer compilation
and client verification.

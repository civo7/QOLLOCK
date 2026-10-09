# Performance display ownership

`ql_perf` coordinates collection enablement, periodic console reports and its
private display lifetime. `model.js` owns rolling report snapshots/alert throttles;
`overlay.js` owns the created panel tree and successful style signatures. The HUD
loads those two modules immediately before the manifest. No global singleton
renderer or duplicate settings snapshot remains.

The Scheduler retains its shared `State.perfStats` collector contract. The manifest
publishes collection enable/detail flags in settings hooks and reads live samples
at its display/report cadence. Disabling the feature removes its created panels
and cancels its poll; it does not clear Scheduler samples or another benchmark.
Turning off only the overlay removes that tree while configured console collection
continues. Settings are derived reactively, including opacity.

The renderer follows the current preferred HUD and waits for a real HUD instead
of creating display panels in a loading root. Configured console collection stays
enabled while that display is unavailable. The shared created-tree helper owns
all children, including moved labels, and retires a previous instance awaiting
asynchronous deletion instead of adopting it. Partial construction stays hidden.
A living replaced root/label releases its retired panels; late/partially created children and
rejected styles retry. Stable text and styles avoid redundant native writes. Each
new instance has its own display history; a root change resets that history, while
the live Scheduler sample object remains owned by the Scheduler.

Rolling reports retain the previous count-drop snapshot behavior, bounded completed
windows, total-time ranking, manifest section, averages/maxima and throttled alerts.
Console reports retain average-time ranking and the detailed count/max/slow fields.
These are synchronous callback measurements; deferred layout/rendering and total
engine frame time are outside their scope. See [profiling](../PROFILING.md).

`performance_owner_lifecycle.test.js` covers reactive settings, retained samples,
living root/label replacement, moved children, rapid re-enable, loading-root
suppression, partial construction/writes, overlay-only disable,
registry failure/reboot cleanup and rolling report behavior. Native display,
rendering cost and actual frame performance require a maintainer client build.

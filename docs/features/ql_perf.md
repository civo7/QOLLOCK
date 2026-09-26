# ql_perf

Scheduler diagnostics/overlay; not a measurement of total engine frame time.

Source: [manifest.js](../../panorama/scripts/manifests/ql_perf/manifest.js),
loaded by the HUD layout. The general [lifecycle contract](../core/feature_registry.md)
and [architecture](../../ARCHITECTURE.md) explain context and configuration routing.

## Runtime and ownership

Starts a 0.2-second loop and an initial tick to update diagnostics.
Scheduler statistics cover observed synchronous callback work; they are not
whole-frame CPU/GPU time or FPS. Date-based milliseconds do not imply
sub-millisecond precision. Keep the diagnostic overlay's own work separate from
claims about the feature being measured. See `docs/PROFILING.md`.

## Declared settings

- `ENABLE_PERF_DEBUG` (toggle)
- `ENABLE_PERF_DEBUG_DETAIL` (toggle)
- `ENABLE_PERF_OVERLAY` (toggle)
- `PERF_OVERLAY_OPACITY` (slider)

Defaults/ranges belong to the linked schema, flat `QOL_DEFAULT_CONFIG` and
versioned codec definitions, not a duplicated table here. They are separate
representations; a declared field is not automatically a visible control or
proof of active runtime behavior. See [adding settings](../ADDING_SETTINGS.md).

## Verification boundary

The statements above describe source behavior. Native panel identity, binding
values, rendering and transitions need the maintainer's Panorama Debugger and
a repacked client scenario; neither a schema nor a read-only manifest hook
proves the whole feature works. See [verification](../TESTING.md).

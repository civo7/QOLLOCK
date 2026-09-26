# ql_crosshair_stats

Selected stat/buff/debuff readouts near the crosshair.

Source: [manifest.js](../../panorama/scripts/manifests/ql_crosshair_stats/manifest.js),
loaded by the HUD layout. The general [lifecycle contract](../core/feature_registry.md)
and [architecture](../../ARCHITECTURE.md) explain context and configuration routing.

## Runtime and ownership

Starts a 0.1-second loop. The selected stat rows and buff/debuff display
are driven by the declared settings below. Preserve authoritative native source
selection; the first numeric descendant is not necessarily the requested stat.
Disable stops the loop and removes the overlay.

## Declared settings

- `ENABLE_CROSSHAIR_STATS` (toggle)
- `CROSSHAIR_STATS_SHOW_DEBUFFS` (toggle)
- `CROSSHAIR_STATS_SHOW_BUFFS` (toggle)
- `CROSSHAIR_STATS_SCALE` (slider)
- `CROSSHAIR_STATS_OPACITY` (slider)
- `CROSSHAIR_STATS_X_OFFSET` (slider)
- `CROSSHAIR_STATS_Y_OFFSET` (slider)
- `CROSSHAIR_STATS_SHOW_FIRERATE` (toggle)
- `CROSSHAIR_STATS_SHOW_MOVESPEED` (toggle)
- `CROSSHAIR_STATS_SHOW_HEALAMP` (toggle)
- `CROSSHAIR_STATS_SHOW_BULLETRESIST` (toggle)
- `CROSSHAIR_STATS_SHOW_TECHRESIST` (toggle)
- `CROSSHAIR_STATS_SHOW_BULLETLIFESTEAL` (toggle)
- `CROSSHAIR_STATS_SHOW_TECHLIFESTEAL` (toggle)
- `CROSSHAIR_STATS_SHOW_WEAPONPOWER` (toggle)
- `CROSSHAIR_STATS_SHOW_SPIRIT` (toggle)
- `CROSSHAIR_STATS_SHOW_RANGE` (toggle)
- `CROSSHAIR_STATS_SHOW_DURATION` (toggle)
- `CROSSHAIR_STATS_SHOW_DAMAGEAMP` (toggle)
- `CROSSHAIR_STATS_SHOW_CLIPSIZE` (toggle)
- `CROSSHAIR_STATS_SHOW_REGEN` (toggle)
- `CROSSHAIR_STATS_SHOW_BULLETEVASION` (toggle)

Defaults/ranges belong to the linked schema, flat `QOL_DEFAULT_CONFIG` and
versioned codec definitions, not a duplicated table here. They are separate
representations; a declared field is not automatically a visible control or
proof of active runtime behavior. See [adding settings](../ADDING_SETTINGS.md).

## Verification boundary

The statements above describe source behavior. Native panel identity, binding
values, rendering and transitions need the maintainer's Panorama Debugger and
a repacked client scenario; neither a schema nor a read-only manifest hook
proves the whole feature works. See [verification](../TESTING.md).

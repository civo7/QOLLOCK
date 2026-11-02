# Feature ownership catalog

Use this table to find the owner and a boundary worth checking before editing.
Links go directly to source. Confirm loading in the active XML includes and read
the source for current settings, defaults, panel IDs and implementation details.
Registration does not establish active or verified gameplay behavior; some
manifests are intentionally inactive or account-gated. General lifecycle rules
live in [FeatureRegistry](../core/feature_registry.md).

A separate feature note is useful only for a stable, non-obvious contract across
files, contexts or native panels. Do not create one per manifest or copy setting
tables, CSS values, test history or general verification caveats into it.

| Reference | Responsibility / boundary |
| --- | --- |
| [ql_cast_failed_hint](../../panorama/scripts/manifests/ql_cast_failed_hint/manifest.js) | Hide the native cast-failed hint; key is ENABLE_HIDE_FAILED_HINT. |
| [ql_mouse_cursor](../../panorama/scripts/manifests/ql_mouse_cursor/manifest.js) | Custom cursor overlay; disabled registration default. Hideout cleanup needs its scheduled callbacks to run. |
| [ql_statlocker](../../panorama/scripts/manifests/ql_statlocker/manifest.js) | Statlocker profile link buttons and account-ID resolution; not a stat-locking engine. |
| [ql_nicknames](../../panorama/scripts/manifests/ql_nicknames/manifest.js) | Persistent top-bar nickname visibility through native binding/CSS gates. |
| [ql_ult_cooldowns](../../panorama/scripts/manifests/ql_ult_cooldowns/manifest.js) | Mirror top-bar ultimate cooldown text; keep source and visible labels distinct. |
| [ql_unspent](../../panorama/scripts/manifests/ql_unspent/manifest.js) | Intentionally inactive unspent-souls compatibility manifest; do not reactivate as cleanup. |
| [ql_disabled_abilities](../../panorama/scripts/manifests/ql_disabled_abilities/manifest.js) | Component CSS paints red-cross backgrounds on native `active_toggle` panels, scoped to HUD signature abilities and active items. Native disabled/toggled classes drive presentation without icon discovery, repair observers or ability XML overrides. Toggle borders and cooldown masks retain their native responsibilities. |
| [ql_hit_marker](../../panorama/scripts/manifests/ql_hit_marker/manifest.js) | Independent normal/critical marker geometry, colors, shadow and glow inside the native gun marker host. Native hit classes and host opacity retain hit timing. Customize uses a temporary sample lease; disable/source replacement restores the native markers. |
| [ql_ability_icons](../../panorama/scripts/manifests/ql_ability_icons/manifest.js) | Ability simplification, cosmetic borders, suggestions and stack classes. |
| [ql_damage_report](../../panorama/scripts/manifests/ql_damage_report/manifest.js) | Damage-report visibility/offsets; no DAMAGE_REPORT_SCALE schema field. |
| [ql_passive_cooldown](../../panorama/scripts/manifests/ql_passive_cooldown/manifest.js) | Passive cooldown mode classes and Basic native-panel layout. |
| [ql_chat_geometry](../../panorama/scripts/manifests/ql_chat_geometry/manifest.js) | Native chat visibility/offset/scale with independent lifecycle; does not depend on embedding. |
| [ql_chat_images](../../panorama/scripts/manifests/ql_chat_images/manifest.js) | URL image embedding beside native source text; external image requests retain their existing proxy. |
| [ql_chat_translate](../../panorama/scripts/manifests/ql_chat_translate/manifest.js) | Account-gated translation experiment; no public `ENABLE_CHAT_TRANSLATE` setting. The optional service is separate. |
| [ql_lane_with_party](../../panorama/scripts/manifests/ql_lane_with_party/manifest.js) | Automatic party lane preference selection; key is ENABLE_LANE_WITH_PARTY. |
| [ql_ui_controls](../../panorama/scripts/manifests/ql_ui_controls/manifest.js) | Global layout/support classes and UI settings metadata; not the control factory module. |
| [ql_unsecured_souls_timer](../../panorama/scripts/manifests/ql_unsecured_souls_timer/manifest.js) | Estimated unsecured-souls conversion countdown, separate from the amount overlay. Reads compact or full amounts through native gold-owner breadcrumbs; missing owners remain syncing without a full-HUD compatibility search. Forecasts complete conversion using the extracted `citadel_secure_gold_*` rule and match time, including the shrinking balance and time growth. Counts down between amount updates; gains, source replacement and match-clock resets rebase the forecast. Saved position offsets retain their centered-margin meaning. |
| [ql_urn_timer](../../panorama/scripts/manifests/ql_urn_timer/manifest.js) | Urn/rift state and spawn-window display derived from game clock/minimap signals; preserve state and source identity. |
| [ql_urn_tracker](../../panorama/scripts/manifests/ql_urn_tracker/manifest.js) | Urn/networth difference, native total selection and private readout lifetime; separate from the rift timer and topbar geometry. |
| [ql_on_death_arcade](../../panorama/scripts/manifests/ql_on_death_arcade/manifest.js) | [Respawn/request/menu coordination](ql_on_death_arcade.md); games execute in the settings context. |
| [ql_minimap_loot](../../panorama/scripts/manifests/ql_minimap_loot/manifest.js) | Static Midtown loot, localized district labels and crate routes from the supplied MapHunter table; no live loot tracking. |
| [ql_minimap_runtime](../../panorama/scripts/manifests/ql_minimap_runtime/manifest.js) | Base/Alt/Tab geometry, opacity, crates, tunnels and minimap presentation. |
| [ql_recent_purchases](../../panorama/scripts/manifests/ql_recent_purchases/manifest.js) | Shop filters, floating purchase feed and top-bar purchase popups. |
| [ql_target_shapes](../../panorama/scripts/manifests/ql_target_shapes/manifest.js) | Size/opacity of native target shapes and both native hint branches, with independent default-state cleanup and discovery for shapes/hints; no XML class extension. Direct breadcrumbs follow `HudCore > gameplay_hud > gameplay_hud_alive > crosshair > unit_target_container`, verified by XML, the October 3 capture and October 26 live Debugger target. Missing/replaced hosts stay local; only descendants of the current host receive overrides. |
| [ql_souls](../../panorama/scripts/manifests/ql_souls/manifest.js) | Native gold/AP container geometry and visibility, not a second economy model. |
| [ql_stats_position](../../panorama/scripts/manifests/ql_stats_position/manifest.js) | Native stats placement and separate normal/scoreboard visibility. |
| [ql_damage_impact](../../panorama/scripts/manifests/ql_damage_impact/manifest.js) | Native directional damage indicator styling. |
| [ql_sigflash](../../panorama/scripts/manifests/ql_sigflash/manifest.js) | Flash on pressing an unavailable signature ability; shares `ENABLE_PASSIVE_COOLDOWN` and has no public Sigflash toggle. |
| [ql_zipboost](../../panorama/scripts/manifests/ql_zipboost/manifest.js) | Zip boost state/countdown; preserve distinction between hint visibility and active boost. Hints stay within the current `gameplay_hud_alive > crosshair > button_hints_container`; effects use the same alive owner's direct `StatusEffects`. Directional/priority placement remains dynamic, and living retired hint/effect components cannot supply evidence. |
| [ql_spm](../../panorama/scripts/manifests/ql_spm/manifest.js) | Intentionally inactive souls-per-minute compatibility manifest. |
| [ql_combat_status](../../panorama/scripts/manifests/ql_combat_status/manifest.js) | Text combat status/timer, independent of the healthbar indicator. |
| [ql_combat_indicator](../../panorama/scripts/manifests/ql_combat_indicator/manifest.js) | Native healthbar/root indicator classes with private recovery history and source retirement. |
| [ql_heroshop](../../panorama/scripts/manifests/ql_heroshop/manifest.js) | Shop layout, simplification and quickbuy behavior; quickbuy has a special-context companion. |
| [ql_keyboard](ql_keyboard.md) | Private keyboard/binding overlay generations and reactive geometry/color; native glyphs remain engine-owned. |
| [ql_damage_numbers](ql_damage_numbers.md) | Native combat indicator presentation, visibility filters and scoped Damage Fountain variants. |
| [ql_topbar](../../panorama/scripts/manifests/ql_topbar/manifest.js) | Top-bar geometry/visibility and shared warning/objective settings. |
| [ql_crosshair_stats](../../panorama/scripts/manifests/ql_crosshair_stats/manifest.js) | Selected stat/buff/debuff readouts near the crosshair. Retired Damage Amp and Bullet Evasion controls/rows are excluded from current settings and native discovery; their published clipboard IDs and frozen compact fields remain import-compatible. |
| [ql_better_unsecured_hud](../../panorama/scripts/manifests/ql_better_unsecured_hud/manifest.js) | Unsecured-souls amount/icon overlay; separate from decay estimation. Amount and caption follow the current `HudCore > StatsAndModsContainer > LowerLeft > gold_and_ap_container > hudGoldContainer > .hudDeathGoldContainer` owner directly. Missing sources never borrow another component's amount or caption; a selected Customize sample remains mirror-owned. |
| [ql_color_warnings](../../panorama/scripts/manifests/ql_color_warnings/manifest.js) | Sole native self/ally/enemy health color owner; instance-local pulse and threshold policy. Budhud observes the self color. |
| [ql_showrank](../../panorama/scripts/manifests/ql_showrank/manifest.js) | Rank badges and a separate profile-card context; reject late callbacks and stale player identity. |
| [ql_rejuv_hud](../../panorama/scripts/manifests/ql_rejuv_hud/manifest.js) | Rejuvenator/bridge-buff state and HUD; publishes `State.rejuvState` consumed by minimap timers. |
| [ql_minimap_timers](../../panorama/scripts/manifests/ql_minimap_timers/manifest.js) | Minimap objective overlays; consume `State.rejuvState` instead of running another phase engine. |
| [ql_legacy_audio_passive](../../panorama/scripts/manifests/ql_legacy_audio_passive/manifest.js) | Announcer, DL4D and minimap reminder audio; Basic cooldown layout belongs to ql_passive_cooldown. |
| [ql_ammo](../../panorama/scripts/manifests/ql_ammo/manifest.js) | Ammo digits and sibling-ring overall scale/offsets, text size, font choices, visibility and palette; customized values can enable it without the master toggle. Native digit placement and ring-child transforms remain intact. Read defaults from source. |
| [ql_presentation_scale](../../panorama/scripts/manifests/ql_presentation_scale/manifest.js) | Independent scale and additional opacity controls from the shared presentation catalog. Opacity uses the existing poll, preserves feature visibility, and releases native overrides at default/disable/replacement. Compact-stats opacity remains inside the outer visibility owner; Ammo opacity reaches digit and ring siblings. |
| [ql_bottom_bar](../../panorama/scripts/manifests/ql_bottom_bar/manifest.js) | Abilities bar layout/tint and independent active-item slot geometry. Ability Points retain native colors. |
| [ql_items](../../panorama/scripts/manifests/ql_items/manifest.js) | Native inventory layout, opacity and wash color; late/replaced icons need reapplication. |
| [ql_stamina](../../panorama/scripts/manifests/ql_stamina/manifest.js) | Stamina charge rotation/wash; distinguish stamina ring from colliding ability IDs. |
| [ql_compass](../../panorama/scripts/manifests/ql_compass/manifest.js) | Compass tape, speed display, minimap rotation/flip and player-heading discovery. |
| [ql_reload_cooldown](../../panorama/scripts/manifests/ql_reload_cooldown/manifest.js) | Reload countdown estimated from native radial progress; [source/label lifetime](ql_reload_cooldown.md), icon/circle hiding settings. |
| [ql_item_mirror](../../panorama/scripts/manifests/ql_item_mirror/manifest.js) | Advanced item cooldown matching/mirroring; not a replacement for Basic mode styling. |
| [ql_healthbar](../../panorama/scripts/manifests/ql_healthbar/manifest.js) | Numeric healthbar-type dispatcher plus shared/variant modules; PLAYER_HEALTHBAR_* settings. |
| [ql_perf](ql_perf.md) | Private report/overlay owners observing Scheduler samples; not a measurement of total engine frame time. |
| [ql_show_build_id](ql_show_build_id.md) | Read current native shop build metadata through a private created-tree owner; unrelated to settings storage. |

## Settings-only utility

[Update checker](../../panorama/scripts/ql_update_checker.js) runs from `ql_update_checker.js` in the
escape-menu context. It is not a HUD manifest. The `ql_ui_controls` manifest
contains its setting metadata but does not own the network probe.

## Focused contracts

Read only the note relevant to the change: [healthbar](ql_healthbar.md),
[shop and quickbuy](ql_heroshop.md), [item cooldown mirror](ql_item_mirror.md),
[passive cooldowns](ql_passive_cooldown.md),
[legacy audio](ql_legacy_audio_passive.md), [minimap](ql_minimap_runtime.md),
[compass](ql_compass.md), [objective timer producer/consumers](ql_objective_timers.md), [recent purchases](ql_recent_purchases.md), or
[rank/profile/Statlocker](ql_profile_rank.md), [chat translation](ql_chat_translation.md),
or [update checker](ql_update_checker.md).

## Editing a feature

- Read actual XML includes before assuming an on-disk module is loaded.
- Check shared-key owners before changing activation or normalization.
- Preserve native-source identity, replacement invalidation and owned cleanup.
- Reuse [helpers](../HELPERS.md), controls and [localization](../LOCALIZATION.md)
  when their contracts match. See [testing](../TESTING.md) for evidence limits.

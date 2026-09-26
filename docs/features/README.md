# Feature ownership catalog

Start with the [architecture guide](../../ARCHITECTURE.md#11-feature-ownership-atlas).
The active HUD layout currently registers 48 manifests. A registration can be
intentionally inactive, account-gated or active only for particular settings;
this table is an ownership index, not a list of verified gameplay behavior.

Each linked reference points to its implementation. The source's settings and
enable predicates are authoritative; UI renderers, flat defaults and codecs
still require separate changes. General lifecycle rules live in
[FeatureRegistry](../core/feature_registry.md).

| Reference | Responsibility / boundary |
| --- | --- |
| [ql_cast_failed_hint](ql_cast_failed_hint.md) | Hide the native cast-failed hint; key is ENABLE_HIDE_FAILED_HINT. |
| [ql_mouse_cursor](ql_mouse_cursor.md) | Custom cursor overlay; no declared user-setting keys; disabled registration default. |
| [ql_statlocker](ql_statlocker.md) | Statlocker profile link buttons and account-ID resolution; not a stat-locking engine. |
| [ql_nicknames](ql_nicknames.md) | Persistent top-bar nickname visibility through native binding/CSS gates. |
| [ql_ult_cooldowns](ql_ult_cooldowns.md) | Mirror top-bar ultimate cooldown text; keep source and visible labels distinct. |
| [ql_unspent](ql_unspent.md) | Intentionally inactive unspent-souls compatibility manifest; do not reactivate as cleanup. |
| [ql_ability_icons](ql_ability_icons.md) | Ability simplification, cosmetic borders, suggestions and stack classes. |
| [ql_damage_report](ql_damage_report.md) | Damage-report visibility/offsets; no DAMAGE_REPORT_SCALE schema field. |
| [ql_passive_cooldown](ql_passive_cooldown.md) | Passive cooldown mode classes and Basic native-panel layout. |
| [ql_chat_images](ql_chat_images.md) | Chat image embedding and chat geometry; external image requests are not local-only. |
| [ql_chat_translate](ql_chat_translate.md) | Account-gated translation experiment; no general ENABLE_CHAT_TRANSLATE setting. |
| [ql_lane_with_party](ql_lane_with_party.md) | Automatic party lane preference selection; key is ENABLE_LANE_WITH_PARTY. |
| [ql_ui_controls](ql_ui_controls.md) | Global layout/support classes and UI settings metadata; not the control factory module. |
| [ql_unsecured_souls_timer](ql_unsecured_souls_timer.md) | Estimated unsecured-souls conversion countdown, separate from the amount overlay. |
| [ql_urn_timer](ql_urn_timer.md) | Urn/rift state and spawn-window display derived from game clock/minimap signals. |
| [ql_on_death_arcade](ql_on_death_arcade.md) | HUD death detection and launch bridge; games execute in the settings context. |
| [ql_minimap_runtime](ql_minimap_runtime.md) | Base/Alt/Tab geometry, opacity, crates, tunnels and minimap presentation. |
| [ql_recent_purchases](ql_recent_purchases.md) | Shop filters, floating purchase feed and top-bar purchase popups. |
| [ql_target_shapes](ql_target_shapes.md) | Size/opacity of native target and hint shapes, including default-state cleanup. |
| [ql_souls](ql_souls.md) | Native gold/AP container geometry and visibility, not a second economy model. |
| [ql_stat_bonuses](ql_stat_bonuses.md) | Golden-statue/boon stat bonus readout from native stat sources. |
| [ql_stats_position](ql_stats_position.md) | Native stats placement and separate normal/scoreboard visibility. |
| [ql_damage_impact](ql_damage_impact.md) | Native directional damage indicator styling. |
| [ql_sigflash](ql_sigflash.md) | Flash on pressing a signature ability while unavailable; not an ability-ready alert. |
| [ql_zipboost](ql_zipboost.md) | Zip boost state/countdown; preserve distinction between hint visibility and active boost. |
| [ql_spm](ql_spm.md) | Intentionally inactive souls-per-minute compatibility manifest. |
| [ql_combat_status](ql_combat_status.md) | Combat status/timer and combat indicator settings. |
| [ql_heroshop](ql_heroshop.md) | Shop layout, simplification and quickbuy behavior; quickbuy has a special-context companion. |
| [ql_keyboard](ql_keyboard.md) | Keyboard/input display; settings use KEYBOARD_OVERLAY_* names. |
| [ql_damage_numbers](ql_damage_numbers.md) | Native combat indicator presentation; settings use DAMAGE_NUMBER_OPACITY and HUD_INDICATOR_SIZE. |
| [ql_topbar](ql_topbar.md) | Top-bar geometry/visibility and shared warning/objective settings. |
| [ql_crosshair_stats](ql_crosshair_stats.md) | Selected stat/buff/debuff readouts near the crosshair. |
| [ql_better_unsecured_hud](ql_better_unsecured_hud.md) | Unsecured-souls amount/icon overlay; separate from decay estimation. |
| [ql_color_warnings](ql_color_warnings.md) | Player/ally/enemy health warning classes and colors; shared threshold keys. |
| [ql_showrank](ql_showrank.md) | Rank badges and cross-context profile-card probing. |
| [ql_rejuv_hud](ql_rejuv_hud.md) | Rejuvenator/bridge-buff state and HUD; publishes state consumed by minimap timers. |
| [ql_minimap_timers](ql_minimap_timers.md) | Minimap objective overlays; consumes Rejuvenator state instead of owning another phase engine. |
| [ql_legacy_audio_passive](ql_legacy_audio_passive.md) | Announcer, DL4D, minimap reminders and shared Basic cooldown layout work. |
| [ql_ammo](ql_ammo.md) | Ammo digits/ring geometry, visibility and palette; custom-value enable predicate matters. |
| [ql_bottom_bar](ql_bottom_bar.md) | Signature/AP/bottom HUD layout and wash palette. |
| [ql_items](ql_items.md) | Native inventory layout, opacity and wash color; late/replaced icons need reapplication. |
| [ql_stamina](ql_stamina.md) | Stamina charge rotation/wash; distinguish stamina ring from colliding ability IDs. |
| [ql_compass](ql_compass.md) | Compass tape, speed display, minimap rotation/flip and player-heading discovery. |
| [ql_reload_cooldown](ql_reload_cooldown.md) | Reload countdown estimated from native radial progress; icon/circle hiding settings. |
| [ql_item_mirror](ql_item_mirror.md) | Advanced item cooldown matching/mirroring; not a replacement for Basic mode styling. |
| [ql_healthbar](ql_healthbar.md) | Numeric healthbar-type dispatcher plus shared/variant modules; PLAYER_HEALTHBAR_* settings. |
| [ql_perf](ql_perf.md) | Scheduler diagnostics/overlay; not a measurement of total engine frame time. |
| [ql_show_build_id](ql_show_build_id.md) | Read and display selected shop build metadata; unrelated to settings storage. |

## Settings-only utility

[Update checker](ql_update_checker.md) runs from `ql_update_checker.js` in the
escape-menu context. It is not a 49th HUD manifest. The `ql_ui_controls` manifest
contains its setting metadata but does not own the network probe.

## Editing a feature

- Read actual XML includes before assuming an on-disk module is loaded.
- Check shared-key owners before changing activation or normalization.
- Preserve native-source identity, replacement invalidation and owned cleanup.
- Reuse [helpers](../HELPERS.md), controls and [localization](../LOCALIZATION.md).
- Report offline evidence separately from client rendering/lifecycle validation.

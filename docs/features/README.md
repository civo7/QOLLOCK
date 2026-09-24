# QOLLOCK Feature Manifest Catalog

QOLLOCK contains 48 isolated feature manifests located under `panorama/scripts/manifests/<feature_id>/manifest.js`.
Each manifest registers with `QOL.core.FeatureRegistry` and owns its lifecycle (`onEnable`, `onDisable`, `onSettingsChanged`, `test`).

---

## Feature Index by Category

### 1. HUD & Top Bar (`category: hud`)
- `ql_topbar`: Top bar player styling, status, and layout enhancements.
- `ql_nicknames`: Custom player nicknames displayed over hero portraits.
- `ql_unspent`: Unspent souls count badges on player portraits.
- `ql_ult_cooldowns`: Ultimate ability cooldown timers and readiness indicators.
- `ql_recent_purchases`: Real-time notification feed of ally/enemy item purchases.
- `ql_bottom_bar`: Bottom ability and item bar layout customizations.
- `ql_ability_icons`: Ability icon styling, borders, and readability tweaks.
- `ql_show_build_id`: Active build ID and title overlay in shop/HUD.
- `ql_showrank`: Rank tier badges on top bar and escape menu.
- `ql_stats_position`: Custom positioning for hero core stats HUD.

### 2. Combat & Crosshair (`category: crosshair`, `combat`)
- `ql_ammo`: Custom ammo counter display, reload indicator, and clip alerts.
- `ql_stamina`: Custom stamina pip counter and dash cooldown indicator.
- `ql_crosshair_stats`: Live hero stats (DPS, fire rate, bullet resist) around crosshair.
- `ql_target_shapes`: Target lock-on shapes, hit confirmation Reticles.
- `ql_damage_numbers`: Floating damage text formatting, sizing, and color overrides.
- `ql_damage_impact`: Directional damage taken indicators and vignette flash.
- `ql_damage_report`: Post-death or post-combat damage breakdown panel.
- `ql_combat_status`: In-combat / out-of-combat timer indicator.
- `ql_sigflash`: Signature ability ready screen flash notification.
- `ql_cast_failed_hint`: Audio/visual hint when ability cast fails (out of mana, silenced).

### 3. Healthbar & Floating UI (`category: healthbar`)
- `ql_healthbar`: Custom player and enemy floating healthbar styling.
- `ql_better_unsecured_hud`: Unsecured souls bar with threshold highlights.
- `ql_color_warnings`: Low health and low stamina screen border color alerts.

### 4. Minimap & Objectives (`category: minimap`)
- `ql_minimap_runtime`: Minimap scale, hero icon sizing, and neutral camp indicators.
- `ql_minimap_timers`: Objective respawn timers directly over minimap icons.
- `ql_urn_timer`: Soul Urn spawn countdown and carrier tracking.
- `ql_rejuv_hud`: Mid Boss Rejuvenator timer and active buff countdown HUD.
- `ql_unsecured_souls_timer`: Unsecured souls loss countdown timer.
- `ql_compass`: Heading compass tape at the top of the screen.

### 5. Economy & Items (`category: items`)
- `ql_souls`: Total souls, net worth tracking, and soul pickup stats.
- `ql_spm`: Souls Per Minute (SPM) live calculation and benchmark tracker.
- `ql_items`: Active item cooldowns, charge counters, and active slot styling.
- `ql_item_mirror`: Mirrored inventory HUD for quick situational awareness.
- `ql_stat_bonuses`: Item passive stat bonus breakdown overlay.
- `ql_statlocker`: Stat locking and quick-compare HUD.
- `ql_passive_cooldown`: Cooldown timers for passive items (Return Fire, Metal Skin).
- `ql_reload_cooldown`: Active reload timing bar and bonus indicator.
- `ql_heroshop`: Quickbuy queue optimizations, price difference alerts.

### 6. Movement & Traversal (`category: movement`)
- `ql_zipboost`: Zipline speed boost timing window and jump indicator.
- `ql_keyboard`: On-screen movement key visualizer (WASD display).
- `ql_mouse_cursor`: Custom hardware/software crosshair cursor override.

### 7. Audio & Announcements (`category: audio`)
- `ql_legacy_audio_passive`: Announcer voice pack triggers, DL4D audio cues.

### 8. System, Social & Utilities (`category: ui`)
- `ql_chat_images`: Dynamic chat emoji and image rendering.
- `ql_chat_translate`: In-game chat translation overlay.
- `ql_lane_with_party`: Party member lane assignment indicators.
- `ql_on_death_arcade`: Mini-games (Minesweeper, Flappy, Aim Trainer) on death screen.
- `ql_ui_controls`: UI control primitives and interactive widgets.
- `ql_perf`: In-game performance and scheduler FPS overlay.
- `ql_update_checker`: Release update checker and version notifications.

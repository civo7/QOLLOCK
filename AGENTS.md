# AGENTS.md

## Truth First

- Do not agree with the user by default. Verify claims against the code, docs, build output, logs, or Source 2/Panorama constraints.
- Start evaluations of claims, diagnoses, plans, or risky technical assumptions with a verdict: `Correct`, `Incorrect`, `Partially correct`, `Unknown`, `Bad approach`, or `Better approach available`.
- If the user is wrong, say so directly and explain the evidence. Do not implement a bad request silently.
- Prefer the smallest correct fix over broad rewrites. If a wider change is truly needed, explain why before editing.

## Project Scope

QOLLOCK is a Deadlock Source 2 Panorama mod. The runtime surface is mostly:

- `panorama/layout/*.xml`: Panorama layout overrides and injected mod panels.
- `panorama/styles/*.css`: live mod CSS override layers.
- `panorama/styles/base/**`: decompiled or baseline-style CSS. Treat as reference unless the task explicitly targets baseline parity.
- `panorama/scripts/ql_shared_presets.js`: shared schema semver, codec helpers, defaults, presets, and account preset bindings.
- `panorama/scripts/ql_settings.js`: settings UI, translations, export/import, schema registry, preset UI, save/load controls.
- `panorama/scripts/ql_core.js`: in-game runtime behavior, polling, panel scans, class/style writes, build payload save/load schema.
- `panorama/scripts/showrank_web_media_bridge.js`: ShowRank/Statlocker rank media bridge for profile cards, player list rows, context menu, and top bar rank images.
- `scripts/*.js` and `build_qollock.ps1`: validation, minification, schema checks, compile, pack, and deploy helpers.

This repo may contain user work in progress. Check `git status --short --branch` before editing. Do not revert user changes unless explicitly asked.

## Current Mod Style

- Keep Panorama code conservative. Browser DOM APIs are not available; use Panorama panel APIs and guard globals such as `$`, `GameUI`, `Game`, `Players`, `Entities`, and `SteamOverlayAPI`.
- Prefer existing naming patterns: `QOL_*` for shared config/schema, `ENABLE_*` for settings, `ShowRank*` for rank-media bridge hooks, and root classes such as `minecraft_healthbar_active`, `clean_stacks_active`, or `ShowRankTopBarRankVisible`.
- Layout XML normally includes compiled assets through `s2r://panorama/.../*.vjs_c` and `*.vcss_c`.
- New XML event hooks should be guarded, for example `if ($.ShowRankRegisterTopBarPlayer) ...` or `if (typeof CitadelResumePlaying === 'function') ...`.
- CSS should use Panorama-compatible properties and existing Source 2 idioms: `visibility: collapse`, `opacity`, `ignore-parent-flow`, `overflow: noclip`, `horizontal-align`, `vertical-align`, and fixed dimensions where layout stability matters.
- Avoid web-only CSS assumptions. When in doubt, mirror nearby working Panorama CSS.
- Keep debug logging disabled by default. Temporary debug flags must be throttled and turned off before release.

## Performance Rules

- Feature OFF should mean zero or near-zero runtime work.
- Cache stable panel handles and re-query only on invalidation or bounded refresh windows.
- Avoid frequent full-tree `FindChildTraverse` or `FindChildrenWithClassTraverse` scans in hot loops.
- Gate class/style/text writes with signature checks when the value may not have changed.
- Do not add duplicate timers, unbounded schedules, or high-frequency polling without a visible active feature gate.
- In `ql_core.js`, review scheduler constants and existing gated sections before adding work to the main loop.

## Settings And Schema Rules

For any saved user-facing setting:

1. Add the default in `panorama/scripts/ql_shared_presets.js`.
2. Add UI metadata and rows in `panorama/scripts/ql_settings.js`.
3. Add runtime behavior in `panorama/scripts/ql_core.js` if the setting affects in-game UI.
4. If it must export/import or save/load through build payloads, update compact schemas in both `ql_settings.js` and `ql_core.js`.
5. Bump schema semver when saved shape or meaning changes. Do not reinterpret an existing released schema version.
6. Update `scripts/validate_compact_schema.js` when new schema versions or targeted regression keys are needed.

`QOL_SCHEMA_SEMVER` and `QOL_SCHEMA_WIRE_VERSION` currently come from `ql_shared_presets.js`; keep settings and core registries aligned with it.

## ShowRank / Statlocker Surface

Current working-tree changes add ShowRank media into:

- `panorama/layout/citadel_hud_top_bar.xml`
- `panorama/layout/citadel_hud_top_bar_player.xml`
- `panorama/layout/hud_escape_menu.xml`
- `panorama/layout/profile_card.xml`
- `panorama/layout/players_list_entry.xml`
- `panorama/layout/citadel_ui_context_menu_player.xml`
- `panorama/styles/showrank_*.css`
- `panorama/scripts/showrank_web_media_bridge.js`

The bridge uses guarded wrappers on `$`, role checks, shared root cache attributes, bounded retries, and rank image URLs from `api.deadlock-api.com` plus Statlocker profile links. Preserve those guards. Do not make profile simulation more aggressive without checking mismatch quarantine, duplicate account handling, top-bar/player-list matching, and escape-menu preload behavior.

## Build And Validation

Use the checkout-local build script unless you have verified another pipeline path:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\build_qollock.ps1
```

Useful targeted checks:

```powershell
node --check panorama/scripts/ql_shared_presets.js
node --check panorama/scripts/ql_settings.js
node --check panorama/scripts/ql_core.js
node --check panorama/scripts/showrank_web_media_bridge.js
node --check scripts/validate_compact_schema.js
node scripts/validate_compact_schema.js
```

`scripts/qollock_pipeline.ps1` contains hardcoded `C:\Users\civ\...` paths. Do not run it from this checkout unless those paths are intentionally valid or the script has been updated.

`build_qollock.ps1` validates key XML, minifies Panorama JS, compiles batches, packs `pak47_dir.vpk`, and deploys to `G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons\pak47_dir.vpk`. Its full schema guard may warn when `G:\MIRROR_QOLLOCK` is absent; treat that as a warning only if the rest of the build proves the intended assets compiled and packed.

## Manual Validation

Automated validation is not enough for this mod. After runtime, XML, or CSS changes, state what still needs in-game validation:

- HUD loads without Panorama error spam.
- ESC menu opens QOL LOCK settings.
- Settings update `MOD_CONFIG` and persist/export/import when schema-backed.
- Presets and account-bound settings remain manually changeable.
- Minecraft healthbar, quickbuy, minimap, keyboard overlay, shop, top bar, and profile surfaces still render without layout overlap.
- ShowRank rank media populates from ESC/player-list/profile/context-menu flows and does not show mismatched accounts.
- The pack launches Deadlock once at the end when using the full intended pipeline.

## Documentation Notes

Read these first when relevant:

- `docs/ADDING_SETTINGS.md`
- `docs/KNOWN_GOTCHAS.md`
- `docs/PERF_GUARDRAILS.md`
- `docs/PRESET_BINDINGS.md`
- `docs/TEST_CHECKLIST.md`

The README may mention docs that are not present in this checkout, such as `docs/CHANGELOG_MEMORY.md` or `docs/ROLLBACK_POINTS.md`. Do not rely on missing files.

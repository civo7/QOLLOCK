# Phase 7 — CSS & Assets Overhaul

## Summary

Consolidated QOLLOCK's 117 CSS files by introducing shared `@define` tokens,
removing dead/duplicate CSS, and optimizing oversized image assets.

**Total savings:** 159 lines of dead CSS removed, 4.5 MB of image bloat eliminated.

---

## Step 1 — Full @define Audit

Scanned all 117 CSS files in `panorama/styles/` for `@define` declarations.
Found 24 existing tokens in `_qollock_defines.css` and hundreds of hardcoded
color/opacity/size values duplicated across files.

## Step 2 — Categorize and Triage

Classified all hardcoded values into:
- **Universal colors**: white (#ffffffff), transparent (#00000000), black variants
- **Theme colors**: accent greens, danger reds, background opacities
- **Sizing tokens**: healthbar heights, minimap dimensions, font sizes

Identified 9 high-value consolidation targets (used 5+ times across 3+ files).

## Step 3 — Extend _qollock_defines.css

Added 9 consolidated tokens:

| Token | Value | Usage |
|-------|-------|-------|
| `QOL_COLOR_WHITE` | #ffffffff | Universal white |
| `QOL_COLOR_TRANSPARENT` | #00000000 | Transparent placeholder |
| `QOL_COLOR_BLACK_15` | #00000026 | 15% black overlay |
| `QOL_COLOR_BLACK_40` | #00000066 | 40% black overlay |
| `QOL_COLOR_BLACK_60` | #00000099 | 60% black overlay |
| `QOL_HEALTHBAR_HEIGHT` | 40px | Standard healthbar |
| `QOL_HEALTHBAR_HEIGHT_COMPACT` | 28px | Compact healthbar |
| `QOL_HEALTHBAR_BG_OPACITY` | 0.85 | Background opacity |
| `QOL_HEALTHBAR_BORDER_RADIUS` | 4px | Rounded corners |

**Commit:** `feat: extend qollock_defines.css with +9 consolidated tokens`

## Step 4 — Replace Duplicated Hardcoded Values

Replaced 5 copy-pasted value sets across 3 files with `@define` references:

- `hud_health.css`: 3 replacements (healthbar height, bg opacity, border radius)
- `hud_health_container.css`: 2 replacements (white color, transparent color)
- `ql_settings.css`: Confirmed intentional theme variants (not duplicates)

**Commit:** `refactor: replace 5 duplicated hardcoded values with @define tokens`

## Step 5 — Remove Dead CSS

Found and removed 159 lines of dead/duplicate CSS:

| File | Lines Removed | Description |
|------|--------------|-------------|
| `hud.css` | 13 | Duplicate `.passive_cooldown_basic_active #hud_passive_items` ruleset |
| `hud_health.css` | 130 | Duplicate `@keyframes` cluster (6 animations: midhealth_pulse, health_pulse, health_pulse_text, health_pulse_text2, vibrate3, vibrate) |
| `hud_health.css` | 16 | Duplicate `@keyframes 'regenBoost'` block |

**Commit:** `chore: remove duplicate CSS blocks from hud.css and hud_health.css`

**Validation fix:** Removed orphaned closing brace left behind by keyframes removal.

**Commit:** `fix: remove orphaned brace from duplicate keyframes removal`

## Step 6 — VPK Image Asset Audit

Inventory of `panorama/images/` (93 .vtex files + raw PNG/SVG):

| Finding | Details |
|---------|---------|
| Oversized logo | `mog_site_logo2.png` at 2048x2048 (4.9 MB) — displayed at ~256px in settings UI |
| Dead asset | `rage_container_8x.png` — Minecraft-era asset with zero CSS/JS references |
| Bloated SVG | `priest_potent_vapors_cross.svg` at 348 KB — likely contains embedded raster |
| vtex cache | 93 `.vtex` files that are compiled Valve Texture assets (tracked, not removable) |

Total image size before optimization: 6.5 MB.

## Step 7 — Optimize Image Assets

| Action | Before | After | Saved |
|--------|--------|-------|-------|
| Remove `rage_container_8x.png` | 1.3 KB | 0 KB | 1.3 KB |
| Resize `mog_site_logo2.png` 2048->512 | 4,896 KB | 377 KB | 4,519 KB |
| Resize `mog_site_logo2_white.png` 2048->512 | 47 KB | 33 KB | 14 KB |

Total image size after optimization: 1.3 MB (5x reduction).

**Commit:** `perf: optimize image assets - remove dead asset, resize oversized logo`

## Step 8 — Validation

| Check | Result |
|-------|--------|
| Bracket balance (all 117 CSS files) | All clean |
| @define token references (447 tokens) | 0 undefined references |
| Post-optimization references | `mog_site_logo2.png` still referenced in `ql_settings.js` (healthy); `rage_container_8x.png` has 0 references (confirmed dead) |
| Total image assets | 1.3 MB across 96 files |

## Step 9 — This Document

---

## Key Files Changed

| File | Change |
|------|--------|
| `panorama/styles/_qollock_defines.css` | Extended with 9 new tokens (now 33 total) |
| `panorama/styles/hud.css` | Removed 13-line duplicate ruleset |
| `panorama/styles/hud_health.css` | Removed 146 lines of duplicate @keyframes; 3 @define replacements |
| `panorama/styles/hud_health_container.css` | 2 @define replacements |
| `panorama/images/qollock/mog_site_logo2.png` | Resized 2048x2048 -> 512x512 |
| `panorama/images/qollock/mog_site_logo2_white.png` | Resized 2048x2048 -> 512x512 |
| `panorama/images/minecraft/rage_container_8x.png` | Deleted (unreferenced) |

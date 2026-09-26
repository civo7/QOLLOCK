# Phase 0: Canonical Type Mapping

> **Historical design snapshot.** Counts and removal candidates below describe
> that analysis, not the current key inventory or authorization to delete state.
> Re-establish live ownership from source before acting. Current contracts are
> in [ARCHITECTURE.md](../../ARCHITECTURE.md) and
> [ConfigStore](../core/config_store.md).

## Summary
- 334 config keys mapped to typed equivalents
- 95 dead State keys identified for removal
- 120 undeclared dynamic State keys documented
- 1 dual-ownership bug found (coloredHealthbarPulseDir)
- 10 type conflicts (dropdowns stored as numeric ranges)
- 111 keys never set by any preset (feature-internal candidates)

## Type Distribution
| Type | Count |
|------|-------|
| toggle | 185 |
| slider | 116 |
| palette | 7 |
| dropdown/enum | 7 |
| string | 3 |

## State Key Classification
| Classification | Count |
|----------------|-------|
| Dead (safe to delete) | 95 |
| Dynamic (undeclared) | 120 |
| Single-owner (→ feature closure) | 250 |
| Shared (must stay) | 75 |

## Key Decisions
1. HEALTHBAR_TYPE, VOICE_TYPE, SETTINGS_THEME, LANGUAGE, GAME_DEFAULT_DIFFICULTY → typed as enum/dropdown, not slider
2. Palette keys (7 total) → typed as palette, not slider
3. All 334 keys keep their current names — backward compatibility
4. 111 feature-internal keys identified for potential future removal from presets

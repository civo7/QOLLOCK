# AGENTS.md — QOLLOCK AI Agent Onboarding

## Quick Start

Read these in order on first session:
1. `README.md` — project overview, build/pack/launch
2. `TRANSFER.md` — architecture, completed phases, patterns
3. `docs/KNOWN_GOTCHAS.md` — Panorama CSS/runtime pitfalls

## Available Tools & Skills

| Tool | Skill Doc | Purpose |
|------|-----------|---------|
| `scripts/find_dead_funcs.py` | (self-documenting) | Cross-file dead function detector — O(functions) pass, 3.2s for full scan. Understands QOL.import(), QOL_* bridges, bare globals. |
| Fallow (`npx fallow`) | `docs/FALLOW_SKILL.md` | Duplication detection (dupes) + health scoring. Dead-code does NOT work — no imports in codebase. |
| `trace_deps.py` | `panorama/scripts/tools/` | Per-feature dependency tracer for extraction planning. |
| `validate_compact_schema.js` | `scripts/` | Schema round-trip fuzzer — 393 tests. Run after schema changes. |

## Architecture (30 seconds)

```
ql_utils.js → ql_shared_presets.js → data files → ql_perf_overlay.js
→ ql_core.js (~23K lines, ES5 IIFE, 2 remaining features)
→ ql_features/*.js (30 files, 1 feature each, loaded via XML <include>)

Module system: QOL.import(["state","utils"]) + QOL.register("name", {...})
Bridge:     _qolExportDefs[] in ql_core.js → QOL.* namespace
Compat:     QOL_* bare globals for ql_settings.js, ql_perf_overlay.js
State:      Global State singleton → QOL.state in feature files
```

## Key Constraints

- **ES5 only** — no let/const/arrow/template literals in production JS
- **Panorama runtime** — `$.Schedule()`, `$.Msg()`, Panel API, no HTTP
- **VPK compilation** — `.js` source → `.vjs_c` compiled → `pak47.vpk`
- **Repack required** after any JS change before testing in-game
- **XML `<include>`** in `hud.xml` controls script load order
- **IIFE** wraps all files — no bare `var` leaks between files except explicit globals

## Common Bug Patterns

1. **Extraction caller**: Function defined in feature IIFE, called as bare global from `ql_core.js`. Fix: use `QOL_FEATURE_REGISTRY[name].gate()` or move to `ql_utils.js`.
2. **Missing bridge export**: Feature imports via `QOL.import()` but symbol not in `_qolExportDefs`. Fix: add to the data-driven array.
3. **VPK stale**: Changed `.js` but didn't repack → old `.vjs_c` runs. Symptom: "feature is in dispatch order but not registered" for all features.
4. **Panel deleted mid-frame**: `try { panel.style.x = "0px"; } catch(e) {}` — don't log these.

## Commit Style

```
Author: bzihnali <bzihnali@users.noreply.github.com>
One logical change per commit.
node --check after each JS change.
```

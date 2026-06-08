# Fallow Skill — QOLLOCK Codebase

## What This Is
A skill file teaching AI agents how to use [Fallow](https://github.com/fallow-rs/fallow)
(v2.89.0+) productively with the QOLLOCK Panorama ES5 codebase. Commit this file so
future agent sessions can pick it up without re-discovering the limitations.

## Quick Reference

```bash
# Duplication detection (primary use — works without import graph)
npx fallow dupes --format json 2>/dev/null | python3 -c "
import sys, json
d = json.load(sys.stdin)
cross = [cg for cg in d['clone_groups']
         if len(set(i['file'] for i in cg['instances'])) > 1]
print(f'{len(cross)} cross-file clone groups out of {len(d[\"clone_groups\"])} total')
for cg in cross:
    files = sorted(set(i['file'].replace('panorama/scripts/','') for i in cg['instances']))
    print(f'  {cg[\"line_count\"]} lines across {len(files)} files: {\" + \".join(files)}')
"

# Health score (works — complexity, maintainability, hotspots)
npx fallow health 2>/dev/null

# Full health JSON (machine-readable)
npx fallow health --format json 2>/dev/null
```

## What Works

| Command | Status | Notes |
|---------|--------|-------|
| `fallow dupes` | ✅ Works | Token-based suffix-array detection. No import graph needed. |
| `fallow health` | ✅ Works | Complexity, maintainability, LOC stats. |
| `fallow list` | ✅ Works | File discovery, entry points, plugins. |
| `fallow dead-code` | ⚠️ Noisy | Needs ESM/CJS imports. Only works if all files are marked as entry points, which makes everything "used." Use `find_dead_funcs.py` instead. |
| `fallow audit` | ❌ N/A | Scoped to changed-files diff; needs git integration. |
| `fallow fix` | ❌ N/A | Depends on dead-code analysis. |

## Configuration

A `.fallowrc.json` is already present in the repo root:

```json
{
  "entry": [
    "panorama/scripts/*.js",
    "panorama/scripts/ql_features/*.js",
    "panorama/scripts/tools/*.js",
    "scripts/*.js"
  ],
  "ignorePatterns": [
    "**/ql_recent_purchases_data.js",
    "**/ql_minimap_crate_data.js",
    "**/ql_settings.js",
    "**/ql_legacy_cooldowns.js"
  ],
  "rules": {
    "unused-files": "off",
    "unused-exports": "warn",
    "circular-dependencies": "warn",
    "unresolved-imports": "off",
    "unlisted-dependencies": "off"
  }
}
```

**Why these rules:**
- `unused-files: off` — all files are entry points, so nothing is "unused"
- `unresolved-imports: off` — no import/export statements exist; every "import" would be unresolved
- `unlisted-dependencies: off` — no package.json/npm ecosystem
- `circular-dependencies: warn` — still useful if fallow detects accidental cycles

**Do not** add `node_modules` or `package.json` just to make fallow happy. QOLLOCK doesn't use npm.

## Interpreting dupes Output

Fallow's duplication detector is suffix-array-based. It finds **identical token sequences**
(not semantic duplicates). This means:

**Real finds (fix these):**
- Cross-file duplicates of utility functions (e.g., percent normalizer, semver comparator)
  → Extract to `ql_utils.js` or `ql_shared_presets.js`

**Intentional duplicates (suppress or ignore):**
- Preset definitions in `ql_shared_presets.js` (structurally similar but semantically different)
- Test cases in `validate_compact_schema.js` (parameterized tests)
- Translation entries in `qollock_translations.js`

**How to suppress:**
```js
// fallow-ignore-next-line code-duplication
function myIntentionalDuplicate() { ... }
```

## Interpreting health Output

The health score (72/B for QOLLOCK) is a rough guide. Key metrics to watch:

| Metric | QOLLOCK's Value | Threshold |
|--------|----------------|-----------|
| Health score | 72 B | < 60 needs attention |
| Dead files | 0% | Keep at 0% |
| Duplication | 0.8% | < 3% is fine |
| Avg cyclomatic | 8.7 | < 10 is good |
| p90 cyclomatic | 18 | < 20 is good |
| Unit size > 60 LOC | 147 functions | These are mostly feature updates — complexity is inherent |

**Do not** refactor feature update functions to reduce complexity scores.
Panorama's ES5 constraint limits abstraction patterns, and feature update functions
are naturally complex (read config → find panels → apply styles → handle edge cases).

## Known Limitations for QOLLOCK

1. **No dead-code detection.** Fallow traces import/export graphs. QOLLOCK uses
   XML `<include>` tags, IIFEs, `QOL.import()`, and bare globals. Use
   `scripts/find_dead_funcs.py` for dead function detection instead.

2. **IIFEs show as giant anonymous functions.** `ql_core.js`'s IIFE reports as
   a 23,797-line anonymous function. This is correct but not actionable.

3. **No CSS duplication detection for Panorama.** Fallow's CSS tracking works
   for Tailwind/SCSS/CSS Modules but not Panorama's `.css` files referenced from
   XML layout files.

4. **`fallow audit` requires git diffs.** Useful for PR review but QOLLOCK isn't
   a PR-based project.

## Workflow: Periodic Cleanup

Run this after each extraction session or before repacking:

```bash
# 1. Duplication check
npx fallow dupes --format json 2>/dev/null | python3 -c "
import sys, json
d = json.load(sys.stdin)
cross = [cg for cg in d['clone_groups']
         if len(set(i['file'] for i in cg['instances'])) > 1]
if cross:
    print(f'WARNING: {len(cross)} cross-file clone groups need extraction')
    for cg in cross:
        fs = sorted(set(i['file'].replace('panorama/scripts/','') for i in cg['instances']))
        print(f'  {cg[\"line_count\"]}L: {\" + \".join(fs)} → {cg.get(\"suggested_name\",\"?\")}')
else:
    print('OK: no cross-file duplicates')
"

# 2. Dead function check (our tool, not fallow)
python3 scripts/find_dead_funcs.py panorama/scripts/ql_core.js

# 3. Health trend (compare to last run)
npx fallow health 2>/dev/null | grep 'Health score'
```

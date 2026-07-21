---
name: validate-qollock
description: Run all QOLLOCK validation tools — smoke test, bridge checker, import validator
---

# Validate QOLLOCK

Run all validation tools in sequence. If any fails, fix the issues before committing.

```bash
# 1. Bridge safety check (are all QOL.import() symbols exported?)
cd /home/bytenode/Documents/DeadlockModMaking/Reduced_CSDK_12/content/citadel_addons/qollock/panorama/scripts
bash tools/check_bridges.sh

# 2. Import validation (do QOL.import() symbols exist on QOL namespace?)
bash tools/validate_imports.sh

# 3. Smoke test (do all files load without syntax errors?)
node tools/qollock_smoke_test.js
```

Expected output: all three should exit 0 with no issues.

**IMPORTANT:** These tools catch syntax errors and import mismatches, but NOT runtime
bugs (panel deletion, timing, context differences). After validation passes, you MUST
repack the VPK and test in-game:
- Run `QOL_DumpDiagnostics()` in the Panorama console → verify 40+ features loaded
- Run the Preset Cycle (Settings → Dev → "Preset Cycle") → verify 94/94 pass
- Check for runtime errors in the Panorama console

If any tool fails:
- **Bridge checker fails:** A feature file imports a symbol not exported anywhere. Check _qolExportDefs or the publishing infrastructure file.
- **Import validator fails:** A feature file imports a symbol via QOL.import() that isn't on the QOL namespace. The fix is usually to use `Utils.Xxx` instead of `QOL.import("xxx")`.
- **Smoke test fails:** A file has a syntax error, missing import, or undefined reference. The error message will show which file and line.

Run this BEFORE every commit that changes .js files.

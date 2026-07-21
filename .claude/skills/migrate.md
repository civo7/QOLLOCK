---
name: migrate-qollock
description: Migrate a file from the old bridge pattern (typeof QOL_X guards) to QOL.import()
---

# Migrate to QOL.import()

Convert a file using the old bridge pattern to the modern `QOL.import()` pattern.

## Old Pattern (deprecated)
```js
var S = typeof QOL_STATE !== "undefined" ? QOL_STATE : undefined;
var GC = typeof QOL_GetCachedPanel !== "undefined" ? QOL_GetCachedPanel : undefined;
var IsCfgEnabled = U ? U.IsCfgEnabled : function() { return false; };
```

## New Pattern
```js
var _deps = QOL.import(["state", "getCachedPanel", "utils"]);
var State = _deps.state;
var GetCachedPanel = _deps.getCachedPanel;
var Utils = _deps.utils;
var IsCfgEnabled = Utils.IsCfgEnabled;
```

## Steps

1. **Identify all external symbols** the file uses — grep for bare `QOL_` globals, `typeof QOL_` guards, and `.` access on legacy aliases
2. **Map each symbol** to its QOL.import() name:
   - State → `"state"`
   - GetCachedPanel → `"getCachedPanel"`
   - Anything from ql_utils.js → access via `Utils.Xxx`, NOT `QOL.import("xxx")`
   - Bridge exports from ql_core.js → check `_qolExportDefs` for the correct key
3. **Add QOL.import()** with all needed names
4. **Add DEPENDS comment** matching the array
5. **Replace all usages** — bare globals → destructured locals
6. **Remove old typeof guards** and legacy aliases
7. **Run validate-qollock** — the bridge checker will validate your DEPENDS comment accuracy and the import validator will confirm all QOL.import() symbols resolve
8. **Spawn 2 adversarial reviewers** using the `Agent` tool

## Common Mistakes

- **QOL.import("isCfgEnabled")** — returns undefined. Use `Utils.IsCfgEnabled`.
- **QOL.import("isPanelValid")** — returns undefined. Use `Utils.IsPanelValid`.
- **QOL.import("setStyleSafe")** — returns undefined. Use `Utils.SetStyleSafe`.
- **Forgetting DEPENDS comment** — triggers bridge checker warning.
- **Keeping old typeof guards** — dead code after migration. Remove them.

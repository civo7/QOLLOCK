---
name: extract-qollock
description: Extract a section of code from ql_core.js or ql_settings.js into a standalone feature file
args: source_file, target_file, section_description
---

# Extract Feature from Monolith

Extract a section of code from a large file into a standalone feature file following the QOLLOCK extraction pattern.

## Pattern

```js
// ql_feat_NAME.js — Description
// Extracted from ql_core.js, Phase X
(function() {
    'use strict';
    var _featureId = "ql_feat_NAME";
    // DEPENDS: dep1, dep2, ...
    var _deps = QOL.import(["dep1", "dep2", ...]);
    var Dep1 = _deps.dep1;
    // ... destructure ...

    // ── Constants ──
    // ... copied constants ...

    // ── Code ──
    // ... copied functions ...

    // ── Registration ──
    QOL.register("featureName", {
        configKeys: [...],
        bucket: N, phase: N,
        gate: function(cfg) { ... },
        update: function(root, cfg, nowMs) { ... },
        stateKeys: [...]
    });

    // ── Self-test ──
    try {
        if (typeof updateFn !== "function") throw new Error("updateFn missing");
    } catch(e) {
        $.Msg("[QOLLock][ERROR][" + _featureId + "] self-test: " + (e && e.message ? e.message : String(e)));
    }
})();
```

## Checklist

1. Verify all extracted functions have ZERO remaining callers in the source file
2. Verify all used State fields are in stateKeys — AND check for collisions:
   `grep -rn "State\.fieldName" panorama/scripts/` across ALL feature files
3. Add QOL.import() for every external symbol used
4. Add DEPENDS comment matching QOL.import() array exactly (same names, same order)
5. After extraction, verify DEPENDS didn't drift: run `bash tools/check_bridges.sh`
6. Add any missing bridge symbols to `_qolExportDefs` in ql_core.js
7. Add self-test that checks typeof for key functions AND bridge exports
8. Bucket/phase: start with `bucket: 0, phase: 0` unless the feature depends on
   another feature's update having run first (then use a later bucket/phase)
9. Add include to hud.xml if HUD context
10. Run smoke test + bridge checker + import validator
11. Spawn 2 adversarial reviewers

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
2. Verify all used State fields are in stateKeys
3. Add QOL.import() for every external symbol used
4. Add DEPENDS comment matching QOL.import() array
5. Add self-test that checks typeof for key functions
6. Add include to hud.xml if HUD context
7. Run smoke test + bridge checker + import validator
8. Spawn 2 adversarial reviewers

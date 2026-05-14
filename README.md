# QOLLOCK (Deadlock Panorama Source 2 Mod)

This repository contains the source for the QOLLOCK HUD/UI mod for Deadlock, built on Panorama (XML/CSS/JS) in Source 2.

## Context Docs (Read First In New Sessions)

1. `AGENTS.md`
- Project scope, priorities, performance rules, and key architecture notes.

2. `docs/CHANGELOG_MEMORY.md`
- High-signal timeline of important changes and lessons learned.

3. `docs/KNOWN_GOTCHAS.md`
- Common pitfalls (Panorama CSS/runtime behavior, exception matching, bindings).

4. `docs/PERF_GUARDRAILS.md`
- Runtime performance constraints and implementation guardrails.

5. `docs/TEST_CHECKLIST.md`
- Smoke/regression checklist to run after feature changes.

6. `docs/PRESET_BINDINGS.md`
- Preset/binding tracking notes and maintenance flow.

7. `docs/ADDING_SETTINGS.md`
- Checklist for adding settings safely, including schema/version rules.

8. `docs/ROLLBACK_POINTS.md`
- Recent known pack milestones and rollback procedure.

## Build / Pack / Launch

Use:

`scripts/qollock_pipeline.ps1`

Project expectation:
- close Deadlock
- compile changed files
- pack
- launch Deadlock once at the end

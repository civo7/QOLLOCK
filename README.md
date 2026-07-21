# QOLLOCK (Deadlock Panorama Source 2 Mod)

This repository contains the source for the QOLLOCK HUD/UI mod for Deadlock, built on Panorama (XML/CSS/JS) in Source 2.

## Context Docs (Read First In New Sessions)

1. `AGENTS.md`
- Project scope, priorities, performance rules, and key architecture notes.

2. `docs/KNOWN_GOTCHAS.md`
- Common pitfalls (Panorama CSS/runtime behavior, exception matching, bindings).

3. `docs/PERF_GUARDRAILS.md`
- Runtime performance constraints and implementation guardrails.

4. `docs/TEST_CHECKLIST.md`
- Smoke/regression checklist to run after feature changes.

5. `docs/PRESET_BINDINGS.md`
- Preset/binding tracking notes and maintenance flow.

6. `docs/ADDING_SETTINGS.md`
- Checklist for adding settings safely, including schema/version rules.

## Build / Pack / Launch

### First-time setup
After cloning, run once to install git pre-commit hooks:
```bash
bash setup-hooks.sh
```
This validates JS imports and runs the smoke test before every commit.
Skip with: `QOLLOCK_SKIP_HOOKS=true git commit ...`

### Regular workflow
Use:

`scripts/qollock_pipeline.ps1`

Project expectation:
- close Deadlock
- compile changed files
- pack
- launch Deadlock once at the end

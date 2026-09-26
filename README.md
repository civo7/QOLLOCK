# QOLLOCK (Deadlock Panorama Source 2 Mod)

This repository contains the source for the QOLLOCK HUD/UI mod for Deadlock, built on Panorama (XML/CSS/JS) in Source 2.

## Context Docs (Read First In New Sessions)

1. `D:\GitHub2\AGENTS.md` (for work under `D:\GitHub2`)
- Maintainer instructions. Do not read repository/nested `AGENTS.md` files unless the maintainer explicitly authorizes the exact file in the current conversation.

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

7. [Existing helpers and their contracts](docs/HELPERS.md)
8. [Localization contract and translation workflow](docs/LOCALIZATION.md) — read before adding UI text, including Dev tools. Use locale dictionaries and the runtime localizer; never inline bilingual captions.
- Choose existing validity, traversal, style, and cache APIs before adding a helper. Read their scope and invalidation rules before substituting them.

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

`build_mod/build_mod.bat` (Windows), or `build_mod/build_mod.ps1` directly.

Project expectation:
- close Deadlock
- compile changed files
- pack
- launch Deadlock once at the end

## Publishing a public release

QOLLOCK's Settings version does not change for every release, so it is **not**
used to detect updates. Before publishing a build to GitHub, Discord or another
public channel, use the public [qollock-updates](https://github.com/Predi-i/qollock-updates)
repository:

1. Read its **Current release marker** and choose the next whole number.
2. Set `QOL_UPDATE_MARKER` in `panorama/scripts/ql_update_checker.js` to that
   same number.
3. In the public repository's **Actions** tab, run **Publish QOLLOCK update
   marker** with that number. Leave `Dry run` off.
4. Wait for the workflow's green checkmark, then pack and publish QOLLOCK.

The Action creates the new current marker, retires all old markers and updates
its README automatically. No image editing or manual upload is required. Do
this for every public release, even when the Settings version remains `4.0.0`.

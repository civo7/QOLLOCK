# QOLLOCK (Deadlock Panorama Source 2 Mod)

This repository contains the source for the QOLLOCK HUD/UI mod for Deadlock, built on Panorama (XML/CSS/JS) in Source 2.

## Context Docs (Read First In New Sessions)

1. `D:\GitHub2\AGENTS.md` — maintainer instructions for work under `D:\GitHub2`.
   Do not read repository/nested `AGENTS.md` files unless the maintainer explicitly
   authorizes the exact file in the current conversation.
2. [Architecture and AI contributor guide](ARCHITECTURE.md) — start here for
   runtime contexts, file ownership, helper selection, localization, settings,
   persistence, feature lifecycle, verification limits and task checklists.

The architecture guide is the consolidated entry point. Use these focused
references for implementation details; historical migration notes are not the
current runtime contract:

- [Existing helpers and their contracts](docs/HELPERS.md)
- [Localization contract and translation workflow](docs/LOCALIZATION.md)
- [Adding settings](docs/ADDING_SETTINGS.md)
- [Preset and binding maintenance](docs/PRESET_BINDINGS.md)
- [Panorama pitfalls](docs/KNOWN_GOTCHAS.md)
- [Performance guardrails](docs/PERF_GUARDRAILS.md)
- [Offline checks and their limits](docs/TESTING.md)
- [Maintainer release checklist](docs/TEST_CHECKLIST.md)

## Build / Pack / Launch

**Compilation, VPK repacking and game installation are maintainer-only.** Agents
must not run the build scripts or `resourcecompiler.exe`, modify game `addons`,
or create/modify VPKs. The commands below document the maintainer's workflow;
they are not permission for an agent to execute it.

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

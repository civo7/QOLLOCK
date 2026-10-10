# Contributing to QOLLOCK

QOLLOCK runs in Source 2 Panorama. Its XML, CSS and JavaScript are game resources;
Node.js is used for development checks, not for the in-game runtime.

## Development Setup

Use Node.js 24, matching CI, and install the development dependencies:

```sh
npm ci
npm test
```

Optionally install the Git hook with `bash setup-hooks.sh`. It runs the complete
`npm test` gate before commits. Do not commit local captures, credentials or
generated build artifacts.

## Find the Right Owner

Start with [ARCHITECTURE.md](ARCHITECTURE.md), then read the focused reference
for the subsystem you are changing. Inspect current source and active XML includes.
HUD and settings run in separate JavaScript contexts.
The [documentation index](docs/README.md) separates current references from
snapshot reports and outstanding acceptance work.

- [Helpers](docs/HELPERS.md): shared APIs and their contracts.
- [Settings](docs/ADDING_SETTINGS.md): defaults, metadata, rendering and persistence.
- [Localization](docs/LOCALIZATION.md): visible text and translation workflows.
- [Feature catalog](docs/features/README.md): implementation ownership.
- [Testing](docs/TESTING.md): offline checks and their limits.
- [Release checklist](docs/TEST_CHECKLIST.md): client verification.
- [Releases and automation](docs/RELEASING.md): packaging, publication and upstream monitoring.

Keep changes focused. Reuse helpers with matching semantics, clean up owned work
and handle replaced panels. Agree new persistent setting defaults with a maintainer.
Localize visible mod text through the current catalogs. Write documentation in English.
Update documentation when behavior or a contract changes, rather than recording
every implementation step. Agent-specific instructions live in [AGENTS.md](AGENTS.md).

## Build and Verify

Compilation, VPK repacking and game installation belong to the maintainer.
Agents must not run build scripts or `resourcecompiler.exe`, modify game addons,
or create or modify VPK files.

For maintainers, `build_mod/build_mod.bat` opens the Windows build tool.
Choose `1` for a local VPK or `2` for game addons; add `f` or `-f` for a clean
rebuild. Enter `s` to start Deadlock, `r` to restart it, or `0` for tool settings.
The tool also compiles SVG sources into game assets.

Close Deadlock, compile and pack the changes, then verify them in the client.
A passing simulator suite does not establish native rendering, FPS or persistence
after a full game restart. Report offline results and remaining client checks separately.

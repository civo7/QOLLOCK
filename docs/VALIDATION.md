# API validation and offline CI

`npm run check:api` parses runtime JavaScript with the installed ESLint parser and compares static command/event names against `scripts/data/game_api_registry.json`. It needs only the checked-in registry and npm development dependencies, not game binaries or a game installation.

## What fails the gate

- Unknown static commands, including the second argument of `$.DispatchEvent("CitadelConCommand", "...")` and the first argument of `DispatchCitadelConCommand` / `dispatchCitadelConCommand` wrappers.
- Unknown static names in `$.DispatchEvent`, `$.RegisterEventHandler`, and `$.RegisterForUnhandledEvent`. A `Citadel` prefix does not grant acceptance.
- JavaScript parse errors, missing or malformed registry sections, an unreadable scan directory, or a scan with no JavaScript files.

These cases return exit status 1. Static string concatenations, expression-free template literals, multiline calls, optional calls, and string-key member access are inspected. Command chains separated by semicolons/newlines are checked individually; separators inside quoted console arguments are preserved. Comments and string examples are not treated as executable calls.

## Warnings and limits

Dynamic command/event expressions are reported as `UNVERIFIED_DYNAMIC_*`, not successful validation. The checker does not resolve variables, arbitrary wrappers/aliases, nested console command languages (such as bind/alias payloads), or template expressions. It does not scan XML handlers, generated JavaScript, or excluded `tools`, `legacy`, and `node_modules` directories. Known cheat commands are warnings because a sandbox-only call can be intentional; callers still need context review.

A registry match establishes only that a name appears in the stored source evidence. Some registry entries come from DLL strings or official global functions, which do not prove that an event can be dispatched, that its signature matches, or that it is available in the running game version. The checker never claims complete engine verification. It does not inspect arbitrary direct engine function calls.

One existing compatibility probe remains explicitly unverified: `$.RegisterForUnhandledEvent("CitadelUserMsg_ForceShopClosed", ...)` in `panorama/scripts/core/ql_app.js`. The local client dump contains `CCitadelUserMsg_ForceShopClosed` at `strings_dump/client.dll.strings.txt:13225`, which is a protocol/C++ type and does **not** verify a Panorama event. This existing optional listener reports `UNVERIFIED_COMPATIBILITY_PROBE`. The exception does not cover dispatches or another file. The normal `CitadelExitUpgradeShop` listener remains separate.

`HTMLTitle` was added with exact-name evidence from `strings_dump/panoramauiclient.dll.strings.txt:1752` on 2026-09-26. The extractor now includes this name when present in that dump; previously it loaded but ignored this DLL's strings. The rest of the registry retains its original extraction metadata. Registry generation via `scripts/extract_game_api.js` is a maintainer task using local game data; CI never runs it.

## Regression tests and CI

`node --test tests/game_api_validator.test.js` checks known/unknown calls, comments, multiline calls, dynamic warnings, the scoped compatibility exception, and real CLI exit statuses. CLI fixtures use an isolated temporary registry/directory and do not require `G:` or `D:` game data.

`.github/workflows/test.yml` runs `npm ci` and `npm test` on pushes, pull requests, and manual dispatch with read-only repository permissions. Node 24 satisfies the checked-in ESLint 10 engine requirement (`^20.19.0 || ^22.13.0 || >=24`). Dependency installation needs the npm registry; the checks themselves need no running game, DLL extraction, VPK build, or publishing credentials. Local passage does not establish that the hosted workflow has run.

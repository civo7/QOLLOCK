# Duplication and dead-code analysis in QOLLOCK

This is a tooling reference, not an additional source of agent instructions.
Start with [ARCHITECTURE.md](../ARCHITECTURE.md) and the maintainer's rules.

## Current project model

QOLLOCK uses npm for offline tools and tests, but its shipped Panorama JavaScript
is loaded by XML includes, IIFEs, namespace registration and callback exports.
There is no ESM/CommonJS import graph for the in-game code. An analyzer that only
follows JavaScript imports cannot determine runtime reachability correctly.

Current feature code is under `panorama/scripts/manifests/`; core services are in
`panorama/scripts/core/`, settings modules in `panorama/scripts/ui/`. References
to the removed `ql_core.js` or `ql_features/` tree are historical, not edit targets.

## Fallow: useful signals, not deletion authority

Fallow is optional tooling, not a dependency installed by this repository's
`package.json` and not part of `npm test`. Check the installed version and its
help before using a command; do not assume the old document's version-specific
CLI or scores are current.

Token-duplication and complexity reports can help identify code worth reading.
They do not prove that two callers have the same semantics or that an apparently
unreferenced callback is unused. Do not run an automatic dead-code fix against
Panorama globals or XML entry points.

The checked-in `.fallowrc.json` is a historical configuration: it still names
`panorama/scripts/ql_features/*.js` and does not enumerate the current nested
core/manifests/UI entry points. Its exclusions and discovery scope must be
reviewed before interpreting a result. Zero reported unused files or duplicates
is not evidence of complete coverage. This guide does not claim that the config
has been repaired or that Fallow has been run on the current checkout.

## Repository dead-function helper

`scripts/find_dead_funcs.py` is a regex/name-counting investigation tool. It does
not resolve lexical scope, shadowing, indirect callbacks, XML handlers or native
consumers. Use its output as candidate locations, not a proof that a function can
be deleted. A same-named function in another IIFE is not necessarily a caller.

## Safe investigation workflow

1. Derive active script entry points from each relevant XML layout. The existing
   `scripts/simulator/layout.js` parses includes while ignoring XML comments.
   HUD loading alone does not cover profile, quickbuy or settings contexts.
2. Follow actual namespace exports, XML callbacks and registration objects.
   Distinguish closure-local functions from cross-context/bare globals.
3. Compare candidate duplicates by behavior: validity failures, lookup root,
   ordering/depth limits, style normalization, cache ownership and invalidation.
   Reuse [existing helpers](HELPERS.md) only when their contracts match.
4. Preserve intentionally similar data/schema entries and translation keys.
   Preserve supported historical decoders and explicitly disabled features;
   neither is obsolete merely because it is not exercised in the default scene.
5. For a real extraction, migrate callers and remove the old implementation in
   the same change. Check every affected layout's dependency order.
6. Exercise the actual changed behavior and current offline checks. Use
   [PROFILING.md](PROFILING.md) for runtime-work claims and the maintainer's
   repacked client for native rendering/lifecycle claims.

Complexity, line count and token similarity are prioritization signals. Do not
split a feature simply to lower a score, add fallback copies to satisfy a tool,
or claim an FPS improvement from deleting code that never executed.

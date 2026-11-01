# QOLLOCK contributor instructions

QOLLOCK is a Deadlock HUD/UI mod running in Source 2 Panorama. This file defines
contributor rules; [ARCHITECTURE.md](ARCHITECTURE.md) owns the technical contracts.
Do not copy API examples from historical migration notes into runtime code.

## Reading order

1. Use [ARCHITECTURE.md](ARCHITECTURE.md) as a map. Before changing runtime code,
   settings or visible text, read the relevant sections and identify the owning
   files and script context. Do not read the entire guide by default.
2. Read focused references only when the task touches their contract: `docs/core/`,
   `docs/features/`, `docs/ui/`, [settings](docs/ADDING_SETTINGS.md),
   [localization](docs/LOCALIZATION.md), or [testing](docs/TESTING.md).
3. When selecting or changing a shared helper, read [docs/HELPERS.md](docs/HELPERS.md),
   its implementation, and a real caller in the same context.

## Choosing diagnostic tools

Use [docs/TOOLS.md](docs/TOOLS.md) to choose the tool and its input before running
an audit. It distinguishes capture-based lookup traces, simulator regressions,
static inventories and client measurements. Capture identity and limitations are
recorded in [tests/fixtures/hud/README.md](tests/fixtures/hud/README.md).

For HUD optimization, use `scripts/profile_hud.js` to locate investigation
candidates, `scripts/trace_feature_hud.js` to inspect search roots, and
`scripts/compare_hud_refs.js` for before/after checks with matching inputs and
observed outputs. Commands and measurement limits are documented in
[docs/TOOLS.md](docs/TOOLS.md) and [docs/PROFILING.md](docs/PROFILING.md).
Use verified direct-child breadcrumbs for runtime HUD discovery by default.
Eliminate full-HUD searches in the normal path; treat them as a rare exception,
not an automatic fallback after a breadcrumb miss. Check current extracted XML
and native Debugger evidence before choosing a path. Keep ID/class searches
inside the narrowest verified owner, and follow late or replaced panels through
that owner. A broader compatibility search needs specific native evidence and a
documented reason; old code or a simulator fixture alone does not justify it.
Do not replace a global search with a JavaScript walk over the same whole tree
or merely lengthen its retry interval and call that the completed optimization.
Use `scripts/trace_styles_hud.js` for per-panel inline-style writer/value traces.
When replacing native searches with JavaScript walks, inspect the profiler's
explicit child-enumeration counters as well as native-search visits.
Repeated reads or identical writes are not proof of unnecessary work, and
offline operation counts do not measure native frame time or FPS.

## Finding related code

1. For a general concept, use semantic search when available; otherwise narrow
   the search with the architecture ownership map and `rg --files` path searches.
2. Use `rg` for exact error messages, function names, setting keys, panel IDs and
   CSS classes. Follow definitions and callers rather than editing the first hit.
3. Follow active XML includes, CSS imports and namespace registrations to confirm
   the loading context, dependency order and affected consumers.
4. Read the relevant existing tests and an analogous implementation before
   changing behavior or introducing another helper or test structure.

## Code quality

These requirements apply to every change; the linked documentation supplies
subsystem contracts and examples, not additional permission to bypass them.

### Readability and proportionate design

- Treat readability as an acceptance requirement. Make the normal runtime path,
  state transitions and resource ownership easy to follow. Prefer explicit
  control flow and clear names over dense expressions and nested conditionals.
- Use the simplest design that meets the current requirements. Reuse suitable
  helpers and native capabilities; introduce new layers, wrappers or abstractions
  only when they solve a concrete present need. Do not build speculative
  infrastructure or duplicate an existing mechanism.
- Keep manifests focused on registration, settings and lifecycle coordination.
  Small features may remain self-contained. Substantial diagnostic collection,
  experiment controls or reporting belong behind a narrow feature-local boundary
  so they do not obscure ordinary rendering and updates. Avoid replacing a long
  function with a generic framework or a large bag of callbacks.
- Before finishing, review the normal call path as a maintainer would: remove
  redundant indirection and obsolete scaffolding, and split mixed responsibilities
  where doing so improves understanding. A refactor must reduce conceptual
  complexity, not merely move lines between files. Preserve required validation,
  cleanup, failure visibility and regression coverage when simplifying.

### JavaScript and module boundaries

- Use modern JavaScript in new and rewritten code: `const` by default, `let`
  for reassignment, and no new `var` declarations. Use arrow callbacks when
  lexical `this` matches the API. Preserve existing cross-file globals and
  callback semantics; do not mechanically replace legacy declarations.
- Use syntax and APIs supported by the actual Panorama context. ESLint accepting
  syntax does not prove engine support. Runtime scripts use IIFEs and existing
  namespaces with explicit XML includes, not Node imports or ES modules.
- Prefer `async`/`await` over `.then()` chains for Promise-based control flow.
  Keep synchronous Promise executors where adapting callback APIs requires them;
  never use an async Promise executor. Preserve callback adapters that deliberately
  return the original Promise, intentional concurrency and rejection handling.
  Do not wrap an existing Promise in another Promise unnecessarily. Native
  helpers such as `Async` require verified loading in the target context even
  when the engine supports the syntax.
- Keep each feature's settings, state and presentation with its owning module.
  Put a new independent feature in its own owner rather than extending whichever
  manifest is convenient. Share behavior through explicit APIs, not another
  feature's private state or storage keys.
- Treat config views and shared defaults as read-only. Change configuration
  through its owning API so validation, shared-key propagation and notifications
  remain intact. Keep transient feature state outside configuration objects.
- A small feature may live entirely in `manifest.js`. Split complex features
  along useful responsibilities such as source discovery, estimation, rendering
  or variants. Keep registration and lifecycle coordination clear; do not split
  files merely to meet a line limit or add a generic abstraction for one caller.
- Read an analogous current implementation before adding a pattern. Reuse helpers
  with matching semantics instead of copying logic. Keep feature-specific policy
  with the feature; promote helpers only when their shared contract is clear.
- Use descriptive names and small functions with clear inputs and effects.
  Comments should explain native evidence, ownership or non-obvious decisions,
  rather than restating code or copying lists that can drift from source.

### Styles and native resources

- Keep native stylesheet import wrappers as import wrappers. Put QOLLOCK rules
  in the matching context's feature stylesheet and load them through `@import`.
  Preserve the native baseline, resource paths and cascade order. Import into the
  actual owning style chain; loading a rule from HUD CSS is not equivalent to
  loading it in an independently created native component.
- Scope selectors to the intended feature and native component. Generic native
  classes can occur in unrelated UI. Edit the existing owning rule instead of
  appending another override to hide an earlier mistake; do not increase
  specificity or add `!important` without a verified cascade need.
- Preserve documented full stylesheet replacements and custom sheets that have
  no native baseline. Do not modify extracted `base/` styles to implement a mod
  feature or assume browser CSS behavior applies to Panorama.

### Runtime behavior and regression coverage

- React to setting changes through the owning hook and derive settings-only
  values there. Poll only for live data or native lifetime discovery that requires
  it. Reuse the scheduler, bound each discovery pass and throttle missing-source
  retries while preserving recovery when native sources appear later. Avoid
  redundant panel searches, allocations and style writes in recurring callbacks.
- Keep Scheduler callbacks and feature lifecycle hooks synchronous: they do not
  await returned Promises. Start asynchronous work through an explicitly owned
  operation with rejection handling and stale-result guards.
- Before applying a delayed or asynchronous result, verify that its operation
  and owning context are still current. Cancellation and panel validity alone
  do not establish ownership. Use request identity or a generation guard where
  results can outlive disable, replacement or newer user intent.
- Own every created panel, style, class, event subscription and schedule. Release
  them on disable, source replacement and partial enable failure. Invalidate
  panel-dependent caches and signatures even when an old panel remains alive.
- Keep unexpected failures observable. Treat missing native sources as expected
  retry states, but do not blanket-catch programming errors or mark a partial
  render as successfully applied.
- Test changed behavior through existing production paths and relevant suites.
  Cover applicable settings, disable/re-enable, late sources and replacement
  cases. Source-text assertions are appropriate for structural rules; they do
  not replace behavior tests. Avoid assertions that only repeat the implementation
  or pass regardless of the result.

## Development rules

- Keep changes focused. Preserve unrelated uncommitted work and avoid incidental
  reformatting. Before finishing, remove temporary files, scripts and helper files
  created for iteration; preserve pre-existing user files. A replacement must not
  leave a duplicate active implementation, include or watcher.
- Make small, meaningful commits after completing logical changes. Run and
  verify `npm test` before every commit. The command includes smoke tests,
  stylesheet checks, Node regressions, compact-schema validation, API checks and lint.
- Never push without an explicit user request. Never create pull requests.
- Review relevant documentation when changing source. Update it in the same
  commit only if the change invalidates documented behavior, settings, data
  format, cross-module contract, ownership boundary or verification procedure.
  Do not edit documentation solely because JavaScript changed. Keep current
  defaults, ranges, key lists and CSS values in source instead of duplicating
  them in prose. Write project documentation in English.
- An implementation change does not authorize weakening contributor rules,
  removing acceptance checks or redefining a documented contract to fit the
  patch. Identify proposed policy or contract changes explicitly and obtain
  maintainer agreement before implementing them. Update documentation to describe
  the agreed behavior.
- Do not bump mod/package versions, config schemas, wire formats or public
  update markers without explicit maintainer authorization. Approval of a feature
  or its defaults alone is not version-bump approval.
- Use current source exports and active XML includes as the technical authority.
  HUD and settings use separate JavaScript contexts; do not assume shared globals.
- In overrides of native Panorama XML, surround QOLLOCK additions and changed
  native elements with `<!-- ==== -->` separator comments that name the change.
  Keep unchanged native markup outside those marked blocks.
- Reuse helpers with matching semantics. Keep settings changes reactive, guard
  redundant style writes, and clean up owned styles, panels, events and schedules.
- Handle destroyed/replaced panels and invalidate panel-dependent signatures.
  A successful simulator test does not prove native layout or gameplay behavior.
- Ask the maintainer for new persistent setting defaults. Follow the entire
  setting path (defaults, manifest, actual UI renderer, localization, normalization,
  persistence and codec) described in the architecture/settings guides.
- Localize visible text, including developer tools, through the current runtime
  English-source-key catalogs. Follow the localization guide for new text.
- Do not guess engine commands, events, panel IDs or hierarchy. Use verified
  calls, extracted game resources and maintainer Panorama Debugger captures.

## Verification and packaging

Compilation and repacking belong to the maintainer. Agents must not run
`build_mod` scripts or `resourcecompiler.exe`, modify game `addons`, or create
or modify VPK files. Source changes require a maintainer compile/repack before
in-game verification. Report offline results and remaining client checks
separately; do not claim rendering, FPS or restart durability from a simulator.

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

## Development rules

- Make small, meaningful commits after completing logical changes. Run and
  verify `npm test` before every commit. The command includes smoke tests,
  Node regressions, compact-schema validation, API checks and lint.
- Never push without an explicit user request. Never create pull requests.
- Review relevant documentation when changing source. Update it in the same
  commit only if the change invalidates documented behavior, settings, data
  format, cross-module contract, ownership boundary or verification procedure.
  Do not edit documentation solely because JavaScript changed. Keep current
  defaults, ranges, key lists and CSS values in source instead of duplicating
  them in prose. Write project documentation in English.
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

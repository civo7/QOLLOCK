# QOLLOCK contributor instructions

QOLLOCK is a Deadlock HUD/UI mod running in Source 2 Panorama. This file defines
contributor rules; [ARCHITECTURE.md](ARCHITECTURE.md) owns the technical contracts.
Do not copy API examples from historical migration notes into runtime code.

## Reading order

1. Read [ARCHITECTURE.md](ARCHITECTURE.md) before changing runtime code, settings
   or visible text. Identify the owning files and script context first.
2. Before changing runtime code, read [docs/HELPERS.md](docs/HELPERS.md), the
   relevant helper implementation, and a real caller in the same context.
3. Read only the focused references needed for the task: `docs/core/`,
   `docs/features/`, `docs/ui/`, [settings](docs/ADDING_SETTINGS.md),
   [localization](docs/LOCALIZATION.md), or [testing](docs/TESTING.md).
   There is no requirement to read every document on every task.

## Development rules

- Make small, meaningful commits after completing logical changes. Run and
  verify `npm test` before every commit. The command includes smoke tests,
  Node regressions, compact-schema validation, API checks and lint.
- Never push without an explicit user request. Never create pull requests.
- Update the corresponding documentation in `docs/` in the same commit as
  JavaScript changes. Write project documentation in English.
- Use current source exports and active XML includes as the technical authority.
  HUD and settings use separate JavaScript contexts; do not assume shared globals.
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

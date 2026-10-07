# Localization and translation maintenance

Read this before changing visible text, including Dev and diagnostic screens.
The shipped source inventory is the English identity map in
`panorama/scripts/ql_settings_loc/ql_settings_loc_en.js`. Other runtime
dictionaries may omit translations, but must not introduce source keys.

## Runtime text

`ui/theme.js` owns `LocalizeSettingsText(text, force)`. English phrases are
opaque keys, including punctuation and whitespace. Missing or blank translations
fall back to the original phrase. Translations retain Unicode accents and
punctuation; ASCII normalization is not a display operation. Valve `#tokens`
remain a separate mechanism.

The boolean `force` bypasses the Presets-tab exemption. Use it for dynamic
statuses, overlays and tools. `QOL.ui.theme.FormatSettingsText(source, values)`
localizes a whole sentence, then substitutes named `{name}` placeholders once.
It preserves unknown placeholders and does not reinterpret braces in inserted
values. Use catalog sentences rather than Russian/English branches or grammatical
fragments. Raw feature IDs, reports, player names and external content are data.

For new text, reuse an appropriate key or add its English identity and Russian
translation. Other languages fall back to English until a reviewed translation
exists. Do not fill gaps with copied English to inflate coverage. Pass source
keys to factories that own localization; do not translate their arguments twice.
Verify actual displayed English/Russian text and an incomplete-locale fallback.

Arcade uses the injected settings localizer; its pre-init fallback delegates to
the same theme owner. HUD and settings are separate contexts: this API is not
available to gameplay manifests merely because it exists in the settings UI.

## Repository boundary

- QOLLOCK owns runtime dictionaries and the English source inventory.
- `Predi-i/QOLLOCK-translations` holds public exchange JSON in
  `locales/<code>/translation.json`.
- `Predi-i/qollock-translate` saves drafts and submits public catalog PRs.
  A website draft or merged PR does not change the installed mod.
- Compilation, repacking and client verification belong to the maintainer.

Use `scripts/locales_helper.js` for code mapping. Chinese uses `zh` at runtime
and `zh-CN` in exchange catalogs; the historical `zh` catalog remains readable.
When both exist, the importer explicitly reports that `zh-CN` wins. Brazilian
Portuguese uses runtime `pt-br`, filename suffix `pt_br`, and catalog `pt-BR`.
Belarusian uses runtime `by` and catalog `be`. Unsupported website languages
remain external, with a warning; importing them does not register a new language.

## Reviewed integration

Review and merge translation PRs in the public repository, then update that
checkout explicitly. No translation command performs a hidden pull, push,
commit, PR creation, deployment or game build.

From QOLLOCK, preview a reviewed public checkout:

```text
npm run translations:sync -- ../QOLLOCK-translations/locales --dry-run
npm run translations:sync -- ../QOLLOCK-translations/locales --dry-run --json
```

With no path, sync uses the sibling `QOLLOCK-translations/locales` checkout.

The three-way plan compares the incoming catalog, current runtime text and the
last integrated public snapshot. Incoming text unchanged from that snapshot
cannot revert a local correction. Community changes apply when the local value
still matches the ancestor; independent edits to both sides are conflicts.
Conflicts block every write. After inspecting them, an explicit
`--resolve=local` or `--resolve=incoming` resolves the reported conflicts.
Use single-language input to narrow a resolution.

Apply the reviewed plan with the same command without `--dry-run`, inspect
the dictionary diff, run `npm test`, and commit. Repacking is a separate
maintainer action. Repeating the same integration produces no dictionary changes.

`translations/import-baseline.json` records the incoming catalog values and
checkout revision for subsequent comparison. This is an exchange ancestor, not
another runtime catalog. If no baseline exists, bootstrap uses the checked-in
exchange snapshot and reports that no previous public revision is established.
A baseline must be retained alongside dictionary changes.

Low-level JSON and CSV imports are explicit reviewed overrides:
`translations:json:import` and `translations:import`. Both accept `--dry-run`
and `--json`. Prefer three-way sync for routine public integration.
All supported inputs are validated before any dictionary is written: flat string
JSON, duplicate inputs/keys, English identity, CSV quoting/column counts, markup
and placeholders. Retired English keys are reported and skipped; blank values
preserve existing text. Values retain significant whitespace. Proposed JS is
evaluated before replacement; I/O failures roll back touched files. A failing
input exits nonzero instead of reporting partial success. Nested JSON is rejected:
English punctuation keys must remain flat.

## Export and automation

```text
npm run translations:export
npm run translations:json:export
npm run translations:context
```

CSV exports to `translations/qollock_settings_translations.csv`, with a UTF-8
BOM. JSON exports to `translations/locales`, or to an explicit output directory.
Only the English catalog supplies source keys. Coverage counts current nonblank
keys, excludes retired keys, and prints one decimal place.

Normal JSON export preserves community changes and external retired keys. It
fills missing/blank entries and propagates a runtime correction only if the
community still matches the recorded integrated ancestor. A newer community
value survives and is reported. `--replace` deliberately writes the runtime
snapshot; use it only to regenerate the local exchange artifacts, never for an
automatic public export. `source-manifest.json` records the source revision,
dirty-source status, source digest, code mapping and integrated public revision.

The BAT wrappers are thin adapters: export always exports; import uses three-way
sync. With no argument they use the sibling public checkout, without pulling it.
Their exit status is the actual operation's exit status.

`.github/workflows/sync-translations.yml` exports main to the public repository
on its configured source-change, daily and manual triggers. It needs
`PUBLIC_REPO_PAT` with Contents write there. Local unpushed changes cannot
reach this workflow. Automatic reverse integration is deliberately not enabled;
the local command provides the reviewed return path.

## Website context

`scripts/export_translation_context.js` owns the context artifact, derived from
actual settings XML includes, current tab definitions/registered renderers,
rendered localization calls, delayed literal keys and metadata. It covers every
English catalog key; unknown locations use a generic Settings breadcrumb.
This is navigation assistance, not proof that every key remains visible.

The website's context consumer accepts the complete QOLLOCK root or an exported
context JSON. Its updater checks out one full main revision and calls the owned
exporter. The consumer rejects empty/invalid context and an unexpected loss of
previous keys before replacing its last good artifact. Review intentional source
removals before using its explicit override. The old single-file
`ql_settings.js` extraction is unsupported and must fail visibly.
Website fixes must be pushed separately before its hosted updater changes.

## Verification limits

`npm test` covers catalog loading, identity/orphans, safe JSON/CSV import,
three-way conflicts and repeat integration, failed-write rollback, punctuation
keys, markup/placeholders and community-preserving export. Settings regressions
observe rendered Dev text, dynamic status localization, Unicode display and
fallback. These checks do not establish native font glyphs or layout.

`translations:missing -- --lang=ru` reports missing English source and selected
language translations separately, using current settings owners.
`translations:labels` also scans nested UI directories. Explicit proper names
are classified in `translations/intentional-names.json`; numbers/aspect ratios
are data. Neither scanner is an exhaustive audit of dynamic user-facing copy.

For client verification, compile/repack first, then check language switching,
Dev actions, Config import feedback, arcade results, accented Latin text and an
incomplete locale. No simulator result proves in-game rendering or persistence.

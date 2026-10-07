# Translation exchange artifacts

The shipped dictionaries in `panorama/scripts/ql_settings_loc/` are authoritative.
Files here are generated exchange snapshots, never Panorama runtime inputs.
For the complete workflow and safety rules, read
[Localization](../docs/LOCALIZATION.md).

- `qollock_settings_translations.csv`: BOM-prefixed translator spreadsheet.
- `locales/`: flat JSON snapshots; punctuation in English keys is opaque.
- `import-baseline.json`: last integrated public ancestor for three-way sync.
- `qollock-context.json`: generated website breadcrumbs.
- `intentional-names.json`: reviewed proper names excluded from missing-copy reports.

Review public catalog PRs, update the public checkout explicitly, then run:

```text
npm run translations:sync -- ../QOLLOCK-translations/locales --dry-run
npm run translations:sync -- ../QOLLOCK-translations/locales
npm test
```

Conflicting edits block writes until explicitly resolved. Unsupported languages
stay in the public repository. Blank translations preserve runtime text; retired
source keys are skipped. A merged PR is not shipped until runtime import and the
maintainer's compile/repack.

Regenerate local snapshots after integration/source changes:

```text
npm run translations:export
npm run translations:json:export -- --replace
npm run translations:context
```

The explicit local `--replace` is for generated snapshots. The automatic public
export uses a merge that preserves newer community work. No local command pulls,
pushes, deploys or builds the mod. Legacy `_partial`/`_partial2` files and
`docs/translations/` CSV are historical input snapshots, not current import
sources.

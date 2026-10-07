# Flat locale exchange snapshots

These JSON catalogs are generated from the shipped JS dictionaries; they are not
runtime files. English sentences are opaque keys, so `Ready` and `Ready.` must
remain distinct. Nested JSON is rejected during import.

The public repository is
[Predi-i/QOLLOCK-translations](https://github.com/Predi-i/QOLLOCK-translations).
The [translation website](https://github.com/Predi-i/qollock-translate) submits
PRs there. Its drafts and merges are not automatically installed in the mod.

Use [the localization workflow](../../docs/LOCALIZATION.md) for reviewed sync,
dry-run reports, conflict resolution, language aliases and snapshot regeneration.
`source-manifest.json` records export provenance; it does not mark translations
as reviewed or guarantee native rendering.

# Game update dependency audit

`scripts/audit_game_update.js` compares pre-update and post-update extracted
Panorama resources and maps changed ID/class evidence to QOLLOCK JavaScript
call sites. It does not load the game, alter runtime files, compile or pack.

## Before updating the extracted resources

Set `QOLLOCK_VANILLA` to the extracted game's **panorama** directory (containing
`layout/` and `styles/`), or pass `--vanilla <directory>` on each command.

```text
node scripts/audit_game_update.js snapshot --label before-major-update
```

This saves `scripts/game_update_runs/before.json`. Snapshots contain XML IDs,
classes, panel types and ancestor paths, CSS selector references, file hashes,
a timestamp and the source Git HEAD when available. HEAD identifies the checkout;
the snapshot records actual file contents, including any local changes.
Snapshots are local and ignored by Git. Preserve this file through the update.
Existing snapshots are never overwritten; use `--baseline <another.json>` for
another update cycle. Do not regenerate the before snapshot from updated files.

## After updating the extracted resources

```text
node scripts/audit_game_update.js check
node scripts/audit_game_update.js check --json
```

Both commands are read-only. The JSON report includes all findings, unresolved
dependencies and dynamic calls; the text report prints all change findings and
limits the unverified/dynamic lists to 20 entries each. Each finding includes
mod source files and line numbers, old/new source evidence and mod declarations.

- `SOURCE_REMOVED`: a used ID/class had source evidence before and has none now.
- `SOURCE_CHANGED`: at least one old declaration/reference location disappeared
  or its XML type/ancestor path changed. This includes an ID that survives in
  another file or only in CSS. Extra new evidence alone is not a warning.
- `UNVERIFIED`: no evidence in either extract or recognized mod creation/XML/CSS.
  This can be a C++-created panel, a conditional panel, or an unresolved source
  dependency. It is not a confirmed missing panel.
- `modOnly`: evidence only in mod XML/CSS or recognized literal panel creation.
  This does not establish runtime availability or correctness of native bindings.
  The copied `styles/base/` is excluded from mod evidence; stale overrides are
  still only references, not proof that the engine creates a panel.
- `dynamic`: the argument cannot be safely reduced to a constant string.

Old mod XML never suppresses an upstream change finding. The report separately
lists changed vanilla XML files that QOLLOCK overrides, even if no recognized JS
lookup uses them. Review these layouts for new bindings, callbacks and includes.
Snapshot hashes ignore comments and normalize line endings; other formatting
changes may still flag a layout for review.

Default exit code 0 means the report completed, not that the game is compatible.
`--fail-on-change` returns 1 for source findings or changed overridden layouts.
Invalid inputs, missing/empty source directories and JS parse errors return 2.

## Coverage and limits

The scanner uses the installed JavaScript parser and lexical scopes, not a text
search. It recognizes native `FindChild`, `FindChildTraverse`,
`FindChildInLayoutFile`, `FindChildrenWithClassTraverse`, `BHasClass`, panel helper
`findChild`/`findTraverse`, utility class searches/ancestor checks, and the
`QOL.panelCache.resolve` / `QOL.resolveCachedPanel` / core HUD resolver APIs.
Simple immutable variable aliases, helper aliases, constant string concatenation,
computed method names and optional calls are supported. Mutable values,
parameters, generated names and arbitrary wrappers are not resolved. Destructured
aliases and calls hidden behind unrecognized wrappers are not inventoried.
Recognized wrapper internals may appear as dynamic calls without the feature's
constant argument. Method-name matching on native calls is conservative and may
include unrelated objects exposing the same method name.

All JS under `panorama/scripts/` except `tools/` is scanned, including inactive
scripts. This avoids hiding special-context dependencies but is not a load-graph
or execution-path proof. Mod creation evidence covers literal `$.CreatePanel`
and recognized panel helper creation calls; it is not a whole-program analysis.

XML scanning inventories source declarations, not instantiated snippets or the
native tree. CSS scanning inventories simple ID/class selector references, not
panel existence. It does not evaluate the CSS cascade, native method signatures,
label bindings, game mechanics, runtime ownership, sibling order, or resource
availability. No rename is automatically guessed or applied. A still-present ID
can have changed semantics; absence from sources cannot prove absence in C++.

After addressing source changes, run `npm test`. The maintainer then compiles and
repacks and runs the Engine Audit in relevant client states (gameplay, shop,
death/respawn, hideout and re-entry). Use `audit_lookups_vs_capture.js` with a fresh
imported capture for additional literal-lookup evidence. An absence in one live
capture is only an observation for that state; captures may be incomplete/capped.
See [testing](TESTING.md) for collection and verification limits.

`tests/game_update_audit.test.js` covers renamed and moved IDs, stale mod XML,
duplicate IDs/CSS references masking removed declarations, class dependencies,
lexical aliases, dynamic expressions and baseline preservation. These are offline
tool regressions, not native compatibility tests.

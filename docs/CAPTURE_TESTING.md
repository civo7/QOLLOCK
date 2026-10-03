# Testing QOLLOCK against native captures

Use this workflow to find structural mismatches and repeated JavaScript lookup
work. It does not measure native traversal time, layout, GPU work or FPS.

## Capture and import

The standalone [HUD-Dumper](https://github.com/Predi-i/Deadlock-UI-Mods/tree/main/HUD-Dumper)
owns native collection, transport and reconstruction. Follow its native Debugger
export procedure after maintainer compilation/repacking. Keep the target and
expansion state unchanged until collection and cleanup finish. Keep match,
hero-testing, hideout and shop states separately labeled.

Use a completed receiver JSON, not a packet journal or a raw descriptions file:

```text
node scripts/import_tree_dump.js <receiver-capture.json> -o captures/<new-scenario>.json --stats
node scripts/audit_lookups_vs_capture.js captures/<new-scenario>.json --json
node scripts/trace_feature_hud.js --capture captures/<new-scenario>.json --all --seconds 10
node scripts/profile_hud.js --tree captures/<new-scenario>.json --seconds 10 --json
```

Both the audit and tracer accept `--vanilla <extracted-panorama-dir>` to add current
native XML evidence. Without it they inspect QOLLOCK layouts only. Overrides take
precedence over same-path native layouts. The reports state their XML scope.

The receiver selects the unique `CitadelHudRoot` from its native window forest.
QOLLOCK uses only that selected hierarchy, not unrelated windows or a synthetic
common parent. ID/class inventories are derived from nodes rather than trusted
cached `unique*` tables. Invalid native descriptions, panel-count mismatches and
ambiguous HUD contexts are rejected. A focused subtree supports static inspection
but cannot stand in for the complete HUD in either replay tool.

Import preserves literal text, raw debugger rows, the forest and metadata.
Existing files are never overwritten. New JSON snapshots/reports under `captures/`
are local evidence; the historical tracked fixture is retained. Both replay tools
still default to that historical fixture unless an explicit capture is selected.

## Read fidelity before findings

- `treeValid`/`forestValid` establish reconstruction, not live coverage.
- `Debugger-rendered` classes describe native inspector output. They do not
  establish that every description was refreshed during collection.
- `fullHudCapture: false`, collection duration, collapsed/unrepresented branches,
  failed reads and incomplete classes must remain visible in reports.
- Missing Label/TextEntry text and missing visibility/enabled flags use simulator
  defaults. Value/state-dependent paths therefore have incomplete evidence.
- `debuggerRowVisible` belongs to the inspector. `debuggerAttributes` describe
  displayed fields; they are not inserted into `GetAttributeString` storage.
- Native commands, bindings, gameplay changes, computed layout and CSS are not
  replayed. Captured replay does not bind commands to the synthetic build model.
  QOLLOCK's own startup and feature code can create additional panels.

The direct HUD v4 collector can have complete transport with unavailable classes.
Historical v2 classes may be a whitelist. Neither source establishes native
class absence. A valid native Debugger export can still span many frames and
retain earlier descriptions.

## Interpret the two reports

The static audit scans actual active HUD includes, excluding diagnostic tools.
It covers native ID/class reads and supported helper aliases through the existing
source dependency scanner. Comments are excluded; multiline calls, constant
aliases and constant strings are supported. Unresolved dynamic arguments are
counted and retained in JSON. It does not claim complete helper or context coverage.

`OBSERVED` means the token occurs somewhere in this selected tree. It does not
prove that a caller's search scope reaches it. `NOT_OBSERVED` means unknown
outside this state/scope; it is not a reason to remove a lookup. Source creation
evidence identifies some QOLLOCK-owned IDs whose availability depends on config
and lifecycle. `XML_DECLARED` identifies a source declaration, including snippets
that may be instantiated conditionally. `XML_REFERENCED` is weaker evidence, such
as a GlobalClassListener subscription. `SOURCE_UNVERIFIED` does not establish
nonexistence: C++ can create panels outside XML. A panel declared in XML but absent
from the JSON remains a state/scope investigation, never a failed existence test.
This is especially relevant to optional active stats and recent purchase rows.
Duplicate ID examples use child-index paths to retain identity.
Aggregate QOLSUM captures remain usable for ID inventory only, without ancestry
or class coverage.

The tracer runs production HUD JavaScript over the supplied static hierarchy.
It counts calls, modeled visits and misses only inside the measurement window.
The feature argument filters attribution; other enabled features keep running.
`searches` groups feature, method, target and actual simulated search root.
Child-index paths distinguish repeated IDs/anonymous panels; class searches retain
the first matching result alongside the match count. Callback errors and enabled
coverage must be read alongside counts.

## Use for optimization

1. Identify frequent broad searches, repeated misses or redundant writes using
   the actual config and an appropriate captured state. Expanded mode increases
   coverage but does not exercise every feature or variant.
2. Verify the intended owner and search scope in native evidence. A missing
   optional panel can appear later; a duplicate ID can refer to another instance.
3. Make a small change, then cover missing/appearing/removed/replaced panels and
   owner replacement. Compare operations with the same capture, config, warm-up
   and enabled coverage. The profiler refuses incompatible or failed baselines.
4. After maintainer compile/repack, verify native behavior and repeat comparable
   frame-time measurements separately from capture/debugger overhead.

Captures substantially improve the inputs to the simulator. They make lookup
investigations more useful, but a green structural test cannot prove that a
feature works in all client states or that an optimization improves FPS.

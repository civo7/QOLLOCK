# Investigating stutters after returning to hideout

This is a diagnostic plan, not a claim that the reported client stutters are
fixed. Source changes need the maintainer's compile/repack before client tests.

## Evidence and working hypotheses

Reports describe a clean startup followed by periodic stutters after gameplay,
sometimes after purchasing items or opening the scoreboard. One player reports
that returning without purchasing does not trigger the problem, and that
disabling purchase notifications/recent purchases did not prevent it. Reports
span different GPUs and include Linux/Proton. These observations prioritize
work retained across transitions and event-triggered work over a simple GPU
capacity explanation; they do not establish a single cause shared by everyone.

Confirmed source defects and their actual evidence:

| Path | Evidence | Remaining uncertainty |
| --- | --- | --- |
| Quickbuy polling, fixed in `607b1ef` | Queue events lost the pending handle and started additional polling chains. Historical source produces 21/41/61 pending tasks after three batches of 20 events; fixed source retains one. Also occurs with enhancements disabled. | Whether real client contexts and event rates explain each player's stutter. |
| Quickbuy preview writes | An unchanged two-item fixture previously cleared/refilled a preview every tick: 40 class changes, 20 text changes, 20 image-path changes per five seconds. Final-state updates reduce these to zero after warm-up. | Native binding/asset/rendering cost and appearance after repack. Polling/searching still occurs. |
| DL4D caption cleanup | A cached hidden caption kept cleanup active. A retained clock let hideout cleanup fall through to a second reminder in the same tick. Regression fails before the guard fix and passes after it. | Whether the affected player's hideout retains that clock and whether this materially affects frame times. |

Earlier compass/healthbar/timer-cache/purchase-history fixes remove other
specific redundant work or ownership mistakes. They are useful independently,
but none substitutes for reproducing the player's exact scenario. Buying an
item exercises more than the purchase notification feature. Turning that
feature off does not unload the separate quickbuy layout script. Likewise,
turning a setting off after a stutter starts does not undo already retained
native state or prove the setting was uninvolved.

## First client test: one affected player, one configuration

Keep the QOLLOCK build, other mods, graphics settings, hero, mode and actions
fixed. Record the exact source commit/build, OS/rendering backend and an exported
QOLLOCK configuration. Do not change or save settings during the initial test.
Exporting a config records the inputs; it is not proof of disk-save durability.

1. Fully restart the client with the maintainer's repacked candidate. In a fresh
   hideout, use **Dev → Record HUD states**, leave it focused for 60 seconds,
   then **Copy HUD state report**. Label this `fresh`.
2. Enter the same sandbox/bot scenario and return without buying. Observe the
   hideout for the same time. Label a recording `no-purchase`.
3. Fully restart again, repeat that route but buy one item, then return to
   hideout. Record the same 60 seconds and label it `after-purchase`. Note the
   item, queue contents, use of Tab/shop, and when the stutter begins.
4. If the purchase route stays clean, test Tab open/close separately. Test focus
   loss separately too; do not mix those triggers in the first comparison.
5. If one cycle is clean, repeat the route several times without restarting to
   look for accumulation. Repeat the positive/negative pair before concluding.

Settings close when recording starts. A whole HUD context may be destroyed on
transition, losing an unfinished recording; separate before/after captures avoid
depending on recorder survival. Reports print only at the end. Evaluate the
measurement interval, not the brief report-printing interval. Compare with an
otherwise equivalent run without recording to check observer effects.

For performance claims, also retain comparable frame-time captures using the
player's existing capture/overlay tooling. Average FPS alone can hide periodic
spikes. A 60-second callback report is not a frame-time graph. Once the route is
reliable, repeat it with QOLLOCK absent and with the candidate, starting a fresh
client for each condition; a past no-mod comparison does not validate a new build.

## Reading the reports

- Growing `activePolls`/owner `peakPolls` in equivalent states suggests retained
  managed work. Several legitimate polls under one owner are not themselves a bug.
- High `maxCallbackMs` with a named owner identifies a synchronous work candidate.
  It includes native calls made synchronously by that callback.
- High `maxDelayMs` with small callback times means callback delivery was late;
  loading, focus throttling, other JS or engine work can cause this. The report
  cannot attribute the delay to a particular feature.
- Increasing errors or changed `enabledStart`/`enabledEnd` can explain falling
  work: a failed/disabled feature must not be mistaken for a successful optimization.
- Stable or zero managed counters do **not** clear QOLLOCK. Quickbuy, raw timers,
  other contexts, event handlers and deferred native layout/rendering are outside
  this live collector. See [recording scope](ui/hud_state_recording.md).

If the candidate still stutters, use the reports to choose a focused experiment.
For a purchase-only route with quiet managed counters, prioritize quickbuy and
retained native UI over another broad HUD rewrite. The next useful Panorama
Debugger evidence is the quickbuy host and its ancestor classes, queue children
and QOL preview image children in fresh versus affected hideout; note whether
old instances remain after repeated transitions. For reminder-specific evidence,
capture `QOLDL4DCaption`, the live `HudGameTime`/`GameTime` source and their
ancestors before/after the transition. An absent ID in static XML is not proof
that a native C++ panel does not exist.

If a setting or subsystem needs isolation, use fresh restarts for each condition
and change one variable (or a recorded group for bisection) at a time. Do not
automatically mutate the player's saved configuration or use live disable as
proof that all native side effects have been removed. Keep storage/CEF/save
experiments separate until there is evidence linking them to the trigger.

## Offline regression tools

```
node scripts/audit_runtime_lifecycle.js --cycles 10
node scripts/audit_runtime_lifecycle.js --cycles 3 --json
node scripts/audit_runtime_lifecycle.js --quickbuy-ref 607b1ef^ --cycles 3
npm test
```

The historical quickbuy command is expected to fail and is a negative control
for the detector, not a checkout change. The audit covers retained-valid and
destroyed contexts and reports raw schedule origins plus modeled operation
counts. Tests also inject the old scheduling fault. Add new reproducing paths
as focused scenarios; do not call the current fixture universal coverage.
See [profiling](PROFILING.md) for full scope and output interpretation.

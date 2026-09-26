# QOLLOCK 4.0.0 release-readiness audit

Date: 2026-09-26. Code reviewed: `b715bb2`.

The findings and line references below describe that baseline. See the
implementation status at the end for subsequent authorized changes; the
baseline descriptions are retained as evidence, not claims that fixes are absent.

## Recommendation

Freeze new features. Fix the two restore defects below before publishing, then
fix the small audio and slider-contract defects with focused regressions. Repair
the misleading test gates and run a short maintainer-owned test of the actual
repacked release candidate. More simulation volume or a broad rewrite is not
needed to address these findings.

This was a bounded pre-release review by the main reviewer and three parallel
reviewers (core/storage, gameplay features, settings/UI). Findings were checked
against source and reproduced offline with production JavaScript. They are not
claims of reproduced native rendering or game timing.

## Confirmed player-facing defects

All five are P2 correctness issues. Storage has the highest release priority
because it can replace settings the player has already chosen.

### R1: Late startup restore overwrites a newer user edit

- `panorama/scripts/core/ql_storage_bridge.js:378` starts startup loading on READY.
- `panorama/scripts/core/ql_storage_bridge.js:737` publishes the asynchronous
  response without checking whether user edits happened meanwhile.
- `panorama/scripts/core/ql_persistence.js:222` gives that stale data a newer
  revision, making it authoritative for the HUD.
- Reproduction used the real startup handler and production persistence: user
  edit revision 1 became saved-data revision 2 and the new setting was replaced.
- Fix direction: make automatic restoration conditional on an unchanged session
  revision; define explicit user-requested Load separately. Guard startup retries
  as well as the first request.
- Regression: pending startup load -> user edit -> old reply; preserve the edit.

### R2: Malformed saved data replaces valid state and reports success

- `panorama/scripts/core/ql_storage_bridge.js:737` writes raw data before checking
  the parsed result; line 799 returns success even with `config: null`.
- Reproduction: valid UI settings + saved response `{"broken` -> UI raw becomes
  malformed and result is `{ok:true, config:null}`. The app's parse fallback at
  `panorama/scripts/core/ql_app.js:242` can then apply defaults.
- Fix direction: validate before any publication; preserve known-good state on
  failure and report an error. Do not silently overwrite the recoverable stored
  data with defaults.
- Regression: malformed/truncated/wrong-shape response must leave live settings
  unchanged and produce a failure result.

### R3: Minimap Reminder ignores its interval setting

- UI: `panorama/scripts/ui/audio.js:363`.
- Runtime: `panorama/scripts/manifests/ql_legacy_audio_passive/manifest.js:440`.
- `MINIMAP_REMINDER_INTERVAL` is absent from the manifest settings array, so the
  feature-local configuration lacks it and runtime always uses 15 seconds.
- Reproduction with real ConfigAdapter/ConfigStore: requested 60 seconds;
  recorded sound dispatches at 00:15, 00:30, 00:45 and 01:00.
- Fix direction: declare the existing setting contract (default 15, range 5–60,
  step 1) and test the path from flat configuration to observable sound events.

### R4: Buff Delay zero is replaced with 30

- `panorama/scripts/manifests/ql_legacy_audio_passive/manifest.js:472` uses
  `cfg.BRIDGE_BUFF_START || 30`, treating the supported value zero as missing.
- Reproduction: setting zero produced the announcement at 04:30, not 05:00.
- Fix direction: distinguish absent/invalid values from zero; cover both endpoints.

### R5: UI values do not round-trip through compact export

- `panorama/scripts/ui/controls.js:1609` ignores the declared step for float
  dragging; lines 1636–1640 do so for typed values.
- The UI accepts values between wire-format increments. The codec legitimately
  quantizes them according to its schema, changing the exported result.
- Reproduction used the real separate settings/HUD contexts, controls, sync,
  codec and importer, with no recorded event or clock errors:
  - `TOP_BAR_SCALE`: UI/store/runtime 1.23 -> imported 1.25.
  - `SOULS_X_OFFSET`: UI/store/runtime 123 -> imported 125.
- Fix direction: reconcile UI, runtime and wire value contracts. If preserving
  arbitrary values is desired instead, that is a codec-version decision; do not
  silently change the existing wire schema.
- Regression: actual control input -> HUD sync -> export -> import, asserting
  equality of accepted user values. Include typed and dragged controls.

## What the green suite actually establishes

The unchanged baseline passed `npm test`: 252 Node tests, HUD loading smoke,
58 schema versions, 98 config states, 463 reported fuzz cases, API checker and
ESLint. That establishes only the assertions these tools actually execute.

### Confirmed false-confidence gaps

1. **API validation is not a release gate.**
   `scripts/validate_game_api_usage.js:70` accepts every `Citadel*` event, line
   106 fails to match an ordinary static DispatchEvent console-command call,
   and the issue branch still exits zero. Isolated synthetic input proved:
   - Invented Citadel event: success and “100% verified”.
   - Invented console command: zero commands checked, success.
   - Invented ordinary event: issue printed, exit zero.
   Fix extraction, distinguish unknown from verified, and fail on actionable
   issues. Keep any justified exceptions explicit and evidenced. Add negative
   fixture tests of the validator itself.

2. **The purported full UI walk exercises zero buttons.**
   `tests/matrix_invariant.test.js:310` searches for the CSS class `Button` rather
   than selecting actual controls. Instrumenting the unchanged test reported
   zero selected buttons in all 14 named tabs, while the test passed. It also
   does not assert the key-binding claim made in its title. Assert nonempty
   expected interaction coverage, then assert changes and collected errors.

3. **Some assertions stop before the behavior claimed.**
   `tests/ui_config_tab.test.js:234` calls the feedback helper but has no
   assertions. The preset matrix checks nonempty valid JSON, not preservation
   of all values. Stubbing serializers and control builders is valid for small
   unit tests, but does not verify the real save/import path.

4. **The simulator is permissive and incomplete.**
   Missing engine APIs may become chainable no-op proxies. Event/callback errors
   are collected, so `doesNotThrow` alone does not establish clean execution.
   Styles do not perform native layout or enforce all dead-panel behavior.
   A real settings-script render pass reached missing simulator `DropDown.AddOption`
   for Config/Healthbar/Audio. That is a harness limitation, not an in-game bug.
   Tests should identify required boundaries and assert error collections;
   unsupported operations should not masquerade as exercised behavior.

### Evidence that existing tests are useful

An in-memory mutation changed TopBar's horizontal offset assignment to `0px`.
Two existing tests in `tests/super_simulation.test.js` failed at the expected
value assertions (120px and 250px). The source file was never changed on disk.
The suite therefore contains real regression protection; wholesale replacement
would throw away useful checks.

Codec checks are useful for self-contained transformations, but generated legal
schema values do not cover every value the UI currently accepts. Add cross-layer
boundary cases rather than merely increasing the random case count.

## Highest-value project additions

1. A small release evidence sheet: exact commit/build, scenario, expected result,
   observed result, and unresolved risks. Link evidence to player outcomes.
2. Contract checks across UI keys/ranges/steps, feature ownership and codec
   fields, with deliberate exceptions documented. Move toward a shared source
   of truth gradually after release, not a last-minute architecture rewrite.
3. Focused sequence tests: delayed startup versus edit, invalid restore,
   failure/retry, disable/enable, and replacement of an observed source panel.
4. A dependable test gate. The only checked-in GitHub workflow currently handles
   translations; none runs `npm test`. Add CI for the offline checks, with actual
   nonzero failure statuses. Local hooks and documents should describe the same
   supported commands and checks.
5. A concise upgrade/recovery note: export old settings, install 4.0.0, verify
   restore, and explain recovery. Check the supported path for users whose last
   released version saved settings in builds; automatic migration was not proven
   by this review and its absence is not asserted as a confirmed defect.

## Maintainer release-candidate checks

After the fixes, run the offline suite once and repack using the maintainer's
normal process. On that exact build, record these checks:

- Fresh settings and one real old exported configuration.
- Change nondefault settings, save, fully close/restart the game, verify values.
- Delayed/unavailable storage and retry; no false success or silent reset.
- Enter match -> die/respawn -> return to menu -> enter another match.
- Open/close shop and settings; disable/re-enable affected features.
- Boundary audio intervals, Basic/Advanced cooldowns and representative settings
  presets on the screen sizes/languages claimed as supported.

Native panel classes, death transitions, rendering and FPS still require client
observations. No build script, compiler, VPK, game addons, publication or push was
performed during this review.

## Scope limits and lower-confidence follow-ups

The review inventoried 54 manifest JS files and prioritized lifecycle/config
paths across core, gameplay and settings. This is not a line-by-line proof over
all assets, all CSS/XML, all languages, every configuration combination, external
services or native C++ behavior.

Panel replacement may invalidate style-signature assumptions in stats/reload/
minimap features; real recreation scenarios need debugger evidence. An
account-restricted chat translation path hides original text before confirming
its local-helper image loaded; this is a limited follow-up, not a broad release
blocker. These were not promoted to confirmed gameplay findings.

Reproduction scripts were temporary local audit tools. Assertions in the audio
and storage probes describe current buggy behavior; permanent regression tests
must assert the corrected behavior instead. No runtime or test-suite files were
modified during the initial audit. The implementation phase below followed
explicit authorization to fix the findings.

## Implementation status after authorization

This section describes the source implementation, not a repacked client
verification. The complete offline gate passed on 2026-09-26: 282 Node tests,
HUD script smoke, 58 schema versions / 98 config states / 463 schema fuzz cases,
API validation and ESLint. API validation retains four explicit warnings
(three dynamic command expressions and one unverified optional listener).

Persistence tests execute the production embedded bridge JavaScript in a second
VM realm with modeled localStorage. They cover Unicode chunk boundaries, quota
failure, canonical parser handoff, legacy flat configuration migration, and
Buff Delay 15 surviving a new JS session. The UI regression additionally checks
a real typed edit across HUD/settings isolates before the 300ms debounce.
None of these checks establishes disk durability after a real game restart.

| Finding | Implemented change | Focused coverage / remaining boundary |
| --- | --- | --- |
| R1: late restore | Capture config change stamps, including edits before debounced publication; preserve the original startup stamp through retries. Explicit Load establishes a new request boundary but does not overwrite edits made while waiting. | `tests/storage_bridge.test.js`: delayed readiness/reply, dirty edits, retry and explicit-load sequences. Real restart remains a maintainer check. |
| R2: malformed restore | Parse and normalize stored settings before publishing live attributes/configuration. Reject malformed or wrong-shaped data without clearing valid state; missing storage preserves current settings. | Production-parser restore regressions in `tests/storage_bridge.test.js`; real CEF storage and recovery require separate evidence. |
| R3: reminder interval | Register the existing interval setting in the audio manifest with its existing 15-second default and 5–60 range. | `tests/audio_runtime.test.js`: 60-second sound timing, default timing, config export/reload and duplicate suppression. |
| R4: zero lead time | Distinguish zero from absent/invalid Buff Delay values. | Audio runtime checks for 0, 15, 30 and 60 seconds across two cycles and config export/reload. |
| R5: slider round-trip | Snap accepted values to the existing compact-schema step rather than changing the wire format. | `tests/ui_slider_roundtrip.test.js`: actual controls, configuration sync and codec round-trip. |

The reported **Buff Delay 15 behaving as 30** is not established as a distinct
fixed root cause. Fifteen already produced 04:45 and 09:45 on the real
adapter/manifest path before the zero-value patch. The restore race is a
confirmed independent defect, but linking it to that observation needs client
evidence. DL4D reminders follow a separate fixed timetable. Follow the
[release checklist](TEST_CHECKLIST.md) to distinguish persisted values, runtime
dispatch timing and spoken content.

### Test gates and helper reuse

- API validation now has explicit validation/failure behavior and negative
  fixtures in `tests/game_api_validator.test.js`; unknown identifiers must not
  become verified merely because they start with `Citadel`.
- The vacuous UI walk was replaced with bounded real rendered-control coverage,
  assertions that interactions actually occurred, and checks of collected event
  and callback errors. It does not claim to exercise every action in every tab.
- Config-tab feedback now has assertions. Missing simulator dropdown methods
  were added for the exercised UI path; this does not turn the model into the
  native Panorama engine.
- [HELPERS.md](HELPERS.md) maps actual validity, creation, style, traversal and
  cache APIs. The panel reference no longer advertises private/nonexistent
  exports. `tests/helper_api_contract.test.js` resolves documented callable
  references against production exports and checks validity aliases.
- No blanket traversal rewrite was performed. Root ownership, depth limits,
  ordering and panel lifetime remain legitimate reasons for local logic.

The testing guide now matches the `npm test` entry point; the checklist no
longer names an absent pipeline and reserves compilation/repacking for the
maintainer. These changes improve evidence quality without claiming live HUD
rendering, CEF durability, native panel recreation, FPS, or automatic migration
from historical build-based settings storage. No release publication or push
is implied by implementation completion.

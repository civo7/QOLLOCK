# Helper audit — September 2026

Scope: exported helper names and static callers across 129 runtime JS files
(excluding tools), plus targeted behavior checks for utilities, panel helpers,
typed caches, EventBus, Scheduler, registry cleanup and HUD state consumers.
The scanner resolves lexical aliases and destructuring against actual loaded
HUD exports. Run `node scripts/audit_helper_calls.js` for current counts and
missing names. This is not exhaustive path coverage of every feature or isolate.

## Confirmed issues addressed

- HUD loading-root fallbacks no longer mask a HUD created later; cache follows
  the calling context. Explicit root traversal honors its panel argument.
- Cache resolution validates parent, ID and reparenting, rather than merely
  accepting a live handle. Partial style-map failures leave no accepted signature.
- Class/parent/child/layout traversal and style getter races in the changed
  safety wrappers return their documented fallback instead of throwing.
- Event dispatch snapshots listeners; self-unsubscription cannot skip a peer.
- Managed one-shots cannot revive disabled minimap/stats/shop feature work.
  Failed feature startup unwinds partial cleanup and managed schedules.
- Six scoreboard consumers share persistent class-based state. The native
  toggle event remains a refresh hint, without an invented visibility payload.
- An unreachable `ParseNumber` helper reference was removed. The manual hit
  profiler now divides counts by its actual interval instead of 60 seconds.
- Corresponding helper/app documents now match these contracts. Reading the
  architecture and helper map is already required by contributor instructions.

## Native evidence and remaining checks

Extracted native `hud.xml` declares `minimap_persp` as a GlobalClassListener for
`gScoreboardOpen`. Native `hud.css` uses `alive`, `dead`, `deathReplayActive`,
`spec_mode` and `replay_playback`. DLL strings contain names such as `IsAlive`
and `LocalPlayerDead`, but strings alone establish neither callable Panorama
APIs nor their receiver/signature/semantics. No such DLL API was invented here.

`readHudLifeState` therefore returns HUD evidence with an explicit `unknown`
state. The death arcade still uses its existing respawn-timer policy. Its timer
identity, especially during spectating, requires client evidence before changing
that behavior. Helpers should grow around proven shared contracts, not a target
function count.

After a fresh repack, use the [HUD state recorder](ui/hud_state_recording.md) for
Tab open/close, death/respawn, spectating and replay. Also visually check the
walkthrough's forward/backward restoration, shop purchase notifications and
topbar transforms/opacity. Native ClearPropertyFromCode restoration, hierarchy,
rendering and frame cost cannot be established by simulator tests. Existing API
checker compatibility warnings remain; a successful offline run does not
resolve them.

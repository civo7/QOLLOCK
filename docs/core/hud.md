# `panorama/scripts/core/ql_hud.js`

## Purpose
Provides Deadlock-specific HUD element discovery, match mode detection (Hideout, Sandbox, Street Brawl), and root CSS class synchronization.

## Dependencies
- `panorama/scripts/core/ql_namespace.js` (`QOL.core.hud`)
- `panorama/scripts/core/ql_panel_helpers.js` (`QOL.core.panel`)

## Interface (`QOL.core.hud`)
- `findHud(preferredRoot)`: Resolves and returns the main `#Hud` panel (delegates to `QOL.core.panel.findHud`).
- `isInHideout(root)`: Checks if player is in sandbox/testing/hideout mode (`connectedToHideout` / `InHideout` classes).
- `isGameplayHudShown(root)`: Reports native combat-HUD presentation evidence; requires a real Hud, joined-team state and a visible native `gameplay_hud` ancestry.
- `isStreetBrawl(root)`: Checks if active match is in Street Brawl mode (`gamemode_streetbrawl`).
- `isClassActive(className)`: Checks if a given class token is active on the HUD root.
- `applyRootClasses(root, config, timestamp, hideoutConnected)`: Synchronizes feature CSS classes onto the root container based on the complete active configuration and live HUD evidence.
- `refreshRootClasses(root)`: Projects the complete current flat config from ConfigAdapter. Feature hooks use this entry point; passing a local settings slice to `applyRootClasses` would reset unrelated classes.

The core projector owns shared root class decisions. Basic cooldown classes and
native item layout belong solely to the passive-cooldown manifest; damage-report
offsets belong solely to the damage-report manifest. These native owners release
their code properties independently of shared root-class projection.

Core also owns native quickbuy mode/count projection and the self-warning bridge
attribute. Their scoped resolvers follow current verified hosts; a living retired
host releases QOLLOCK classes/attributes without changing native content or
animation. A new host receives the complete accepted configuration even when its
values equal the previous generation. Failed writes/retirement remain retryable,
and the root quickbuy count is published before a conditional native queue exists.
These presentation/retirement records are private to the core owner.

Complete-config CSS projection also observes transient registry presentation
availability. Explicit disable, failed enable and auto-disable release the
affected central presentation rules to native/CSS policy while retaining the
accepted config. A successful enable restores those rules before/after the new
owner hook. The release map belongs to core; features do not fight the projector
with a second writer or reset persistent values to make cleanup work.

Use `QOL.core.hud.isInHideout(root)` for the shared two-class predicate.
Compass, cursor, zipboost, urn timer, Rejuvenator, minimap timers, legacy passive
audio, item mirror, stat bonuses, stats position and recent purchases call this
helper directly or through a local function reference. HUD discovery is cached;
the helper reads current classes on each call rather than caching mode state.
Do not duplicate the predicate through two `isClassActive` calls or legacy
fallbacks. Feature-specific intro/visibility rules remain separate, and the
unsecured-souls timer intentionally has no hideout suppression.

## Combat HUD visibility

`isGameplayHudShown(root)` is separate from the hideout connection predicate and
top-bar visibility policy. `InHideout` is the native area gate for the first
hideout room; `connectedToHideout` alone also applies in the combat room and
must not suppress combat UI. The helper follows native `hud.css` gates for
unjoined, Escape-menu, takeover, post-game and shop presentation, and rejects
explicitly hidden/transparent native panels or ancestors. Unset inline opacity
does not establish transparency. This is observed presentation state, not
computed CSS visibility or local-player identity.

The helper reads current ancestor state rather than retaining an ancestor list.
Its native panel cache is rebound after destruction, reparenting or a changed
Hud. Missing native gameplay panels are retried at the discovery interval in
source. Crosshair stats uses this gate before source discovery/value reads;
its scoped `InHideout` row CSS also suppresses presentation between ticks.

## Engine Reality Note
- Many in-game panels are created dynamically at runtime by C++ code. The HUD root undergoes structural changes during match phase transitions (draft, spawn, hideout, game active). Always use `findHud()` or cache panel references with `isPanelAlive()` validation.
## Top-bar visibility contract

`isHudVisibleForTopBarRuntime(root, topBar)` checks the actual ancestors of
TopBar, excluding TopBar's own configurable opacity. In the native HUD XML,
`gameplay_hud` and `TopBar` are siblings; hiding the former must not suppress
geometry updates to the latter. Empty/null inline opacity means unknown, not
zero. Explicitly hidden or transparent ancestors remain suppression evidence.

Normal Escape-menu, hideout and takeover suppression remains in force. The
manual walkthrough's `QOLVisualCheckActive` class relaxes only the Escape-menu
gate, matching its scoped HudCore presentation rule. Panel visibility uses the
core panel helper directly rather than a mutable legacy alias.

## Scoreboard and life evidence

`isScoreboardOpen(root, anchor)` reads persistent `gScoreboardOpen` class state
from HUD ancestors, a supplied live anchor, or the cached native `minimap_persp`
GlobalClassListener. It does not infer visibility by counting toggle events.

`readHudLifeState(root)` requires a real Hud/CitadelHud and exactly one of `alive`
or `dead`. It returns `unknown` for missing/ambiguous classes, `spec_mode`,
`replay_playback`, `deathReplayActive`, `InHideout`, or `connectedToHideout`.
This is deliberately HUD evidence, not an entity API or local-player guarantee.
The death arcade's respawn-timer policy has not been replaced with this helper.
Use the [HUD recorder](../ui/hud_state_recording.md) to collect client evidence.

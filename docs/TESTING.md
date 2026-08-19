# Testing QOLLOCK

Two layers, and they catch different things.

## Layer 1 — static/load checks (pre-existing)

```
node panorama/scripts/tools/qollock_smoke_test.js   # every file loads, in order
bash panorama/scripts/tools/check_bridges.sh        # QOL.import symbols are exported
bash panorama/scripts/tools/validate_imports.sh     # imported symbols exist
bash panorama/scripts/tools/check_manifests.sh      # manifest shape + hud.xml wiring
node scripts/validate_compact_schema.js             # config codec round-trips
```

These prove the code *loads*. They cannot catch a logic bug: the 2026-08 settings
loader failure passed all of them 107/107.

## Layer 2 — behavioral tests

```
node --test "tests/**/*.test.js"
node --test --watch "tests/**/*.test.js"           # while iterating
node --test "tests/build_payload_load.test.js"     # one file
```

Node's built-in runner. **No npm dependencies** — nothing to install, no
`node_modules`, nothing that could end up in the VPK.

### What it actually runs

The mod's real source, unmodified, inside a `vm` context, against a simulated
panel tree driven by a virtual clock. Load order is parsed out of
`panorama/layout/hud.xml`, so the tests exercise exactly what ships. Boot output
matches the real game line for line — same `3/29 features enabled`, same
`ReadStorageConfig: source=none`.

### Writing a test

```js
const sim = require("../scripts/simulator/index.js");

const h = sim.createHud({ inHideout: true });
h.assertLoaded();                       // throws with the real error if a file failed

h.game.seedBuilds([                     // set up game state
    { title: "New Skyrunner Build", categories: ["Core Items"] },
]);
h.game.openShop();
h.clock.advance(45000);                 // 45s of virtual time, instantly

assert.match(
    h.sandbox.grepMessages("load:FinalizeSession").pop(),
    /Payload applied/,
    `\n${h.diagnose()}`                 // always attach this — see below
);
```

`h.diagnose()` dumps virtual time, the build list, game-action counters, the
game trace, recent mod log lines, scheduled-callback errors and tree anomalies.
Put it in every failure message; it turns "assertion failed" into an answer.

### The pieces

| File | Responsibility |
|---|---|
| `scripts/simulator/clock.js` | Virtual clock. One time source for `Date.now`, `performance.now`, `$.FrameTime`, `$.Schedule`. `advance()` is bounded, so a runaway poll loop fails loudly. |
| `scripts/simulator/panel.js` | Panel object model + `Document`. Real tree, DFS pre-order `FindChildTraverse`, `Set`-backed classes, `Map`-backed attributes, `maxchars`-aware `SetText`, duplicate-id detection. |
| `scripts/simulator/layout.js` | Reads script load order from the layout XML, stripping comments so cut-over includes stay out. |
| `scripts/simulator/sandbox.js` | The `vm` context: `$` API, event dispatch, `$.persistentStorage`, deterministic `Math.random`. |
| `scripts/simulator/game/builds.js` | `BuildsModel` — owns build state and mutates the tree the way the C++ client does. |
| `scripts/simulator/index.js` | `createHud()`, `diagnose()`. Start here. |

### Latency is load-bearing

`BuildsModel` models the engine's asynchrony: selecting a build re-renders its
categories ~250ms later, creating one takes ~400ms, the hero switch ~1200ms.
Override per test:

```js
sim.createHud({ latency: { selectBuildMs: 600 } })
```

**Do not set these to zero.** The bug this suite exists for is a race between the
loader's scan rate and the engine's render latency. At zero latency it does not
reproduce at all.

### Title fidelity is a deliberate unknown

Vanilla renders build titles from a dialog variable
(`{s:selected_hero_build_name}`), so `panel.text` may hand back the raw
localization token instead of the name. **Whether titles are readable from JS is
unverified.** Rather than assume, the simulator makes it an axis:

```js
const { TITLE_MODE } = require("../scripts/simulator/game/builds.js");
sim.createHud({ titleMode: TITLE_MODE.TOKEN })     // titles unreadable
sim.createHud({ titleMode: TITLE_MODE.RESOLVED })  // titles readable
```

Anything that reads a build title must be tested in **both** and must still work
in `TOKEN`. Category names are *not* affected by this switch — they are known
readable, since the payload has always lived there.

## What this cannot catch

Be honest about the boundary:

- **No rendering.** `style` is a plain object. No CSS parsing, no layout, no
  sizes. It cannot tell you a panel is off-screen, invisible, or that
  `overflow: hidden` is not a Panorama value.
- **No real engine.** Every `Citadel*` function is a model of what we believe the
  client does. Where that belief is wrong, tests pass and the game still breaks.
- **Runtime-created panels are hand-modelled.** `HeroBuildListItem_%d`,
  `FavoriteBuildEntryContainer`, the per-category panels — none appear in vanilla
  XML. They are transcribed from observation, with source citations in
  `game/builds.js`.
- **No input, focus or animation semantics.**

So a green suite means "the logic is right given our model of the engine". It is
not a substitute for a repack and an in-game check.

## Keeping the model honest

When a test fails, first ask whether the *simulator* is wrong. Several fidelity
bugs were found this way, each initially looking like a mod bug:

- Host intrinsics injected into the `vm` context made `[] instanceof Array` false
  across the realm boundary, silently breaking `ConfigStore.registerSchema` so
  every manifest looked disabled.
- `gShopOpen` set only on `#Hud` rather than the absolute root left
  `IsHudClassActive()` blind, because consumers resolve their root via
  `GetUIRoot()`.
- A missing `#HeroPanel` made `DetectGlobalIdleState` report "not in a match",
  stretching every loop interval until the save machine tripped its own timeout.

When vanilla Deadlock updates, panel ids in `game/builds.js` are the first thing
to re-check against `G:\GameTracking-Deadlock`; each is cited inline.

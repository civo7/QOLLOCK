# Player healthbar variants

This document tracks the layout and lifecycle contracts for the alternate
player healthbars implemented in QOLLOCK:
- `0`: Default (gameplay HUD standard)
- `1`: Minimalist
- `2`: Fighting Game (FG)
- `3`: Budhud
- `4`: Klutz
- `5`: Minecraft Hearts

The dispatcher is owned by `panorama/scripts/manifests/ql_healthbar/manifest.js`
and runs on every `hud_health_bars` tick via `updateDispatcher()`. Style-specific
motion/geometry adjustments are encapsulated under
`panorama/scripts/manifests/ql_healthbar/variants/`.

## Shared state and timing

The active variant is selected by `MOD_CONFIG.HEALTHBAR_TYPE`. Each variant's
lifecycle must respect three standard states:
1. Normal gameplay: active variant updates dynamically every tick (20 Hz).
2. Variant switch / disable: previous variant must completely tear down any
   custom panels, inline style overrides, and classes before the new variant
   takes effect.
3. Pause / escape / hideout: variants must not leak active frame loops or stale
   geometry when the player is not in live gameplay.

Variant CSS rules are scoped behind body/root classes:
- `.minimalist_healthbar_active`
- `.fg_healthbar_active`
- `.budhud_healthbar_active`
- `.klutz_healthbar_active`
- `.minecraft_healthbar_active`

### Minecraft Hearts specifics

Minecraft Hearts (`HEALTHBAR_TYPE === 5`) renders heart pips across up to 3
rows (20 pips per row, 2 HP per pip) inside `#MinecraftHeartsContainer`. Each pip
has an outline, a background backer, a damage-absorbed overlay (golden hearts),
and a primary health fill. Absorption hearts render in gold directly over the
base hearts when active.

The heart layout relies on standard Minecraft HUD sizing: each pip is 9x9
pixels, spaced by 8 horizontal pixels (1px overlap). When total HP exceeds the
current row's capacity, additional rows stack upward. The health readout numbers
are optionally displayed to the right of the heart rows based on
`MINECRAFT_HEALTH_NUMBERS` configuration.

Because Minecraft Hearts replaces the progress bar entirely, tests covering
default-style measurements do not characterize Minecraft.

Hideout handling uses the shared `connectedToHideout` / `InHideout` predicate.
Before switching to a 0.5-second idle poll, the dispatcher stops Minecraft's
raw animation schedules and resets Budhud state. FG continues refreshing its
portrait because the FG bar is visible in hero testing hideout.
The previous early return cleaned up only FG, leaving Minecraft's low-health or
healing animation running after a match. Normal 0.05-second updates resume on
match entry.

### Klutz healthbar specifics

Klutz (`HEALTHBAR_TYPE === 4`) uses a customized vertical layout where health
numbers and bar bounds are heavily offset. Its position contracts require that
health numbers maintain their vertical offset even when scaling changes.

### Minimalist & Budhud specifics

Minimalist (`HEALTHBAR_TYPE === 1`) and Budhud (`HEALTHBAR_TYPE === 3`) rely
primarily on CSS classes toggled by the dispatcher. Their geometry contracts
require:
- Clean collapse of default health borders and backgrounds.
- Repositioning of status effect indicators and damage counters.
- Preservation of native shield bar visibility when shields are active.

## Verification rules

- Unit tests for healthbar reset and scale lifecycle live in
  `tests/healthbar_fg_reset.test.js`.
- Always verify that switching from any variant back to Default (`HEALTHBAR_TYPE = 0`)
  leaves zero orphaned styles or leftover panels.
- Do not run `resourcecompiler.exe` or modify VPK packages. A passing simulator test
  does not prove native layout or binding. See [verification](../TESTING.md).

## Fighting Game geometry and lifecycle

FG owns an `Image` named `QOLFGPortrait` under the `health_bar_border` inside
`hud_health_bars`. Native gold and PlayerLevel `LevelAmount` / `HeroImage` panels
remain in their original parents. Their duplicate IDs and native binding after
reparenting are not a reliable source for the FG portrait.

On each existing healthbar tick, FG first checks the native pregame reveal's
`#Pregame #HeroAbilities` panel for `ShowingHero hero_<codename>` while the HUD
is in pregame or hero testing. The Panorama Debugger showed this signal for
Frank before the crosshair existed. During normal gameplay FG reads hero classes
from the crosshair and its dash indicators. Missing or conflicting evidence
hides the portrait, including a transition with both old and new dash
indicators. No default hero or previous hero is displayed when signals are
missing. This remains UI evidence, not an entity identity API; hero switching,
respawn and spectating need a client check.

The explicit `heroIcons` table in `variants/fg.js` comes from
`m_strIconImageSmall` in the extracted `scripts/heroes.vdata`. It preserves both
resource aliases and extensions (Abrams: `bull_sm_psd`, Sinclair:
`magician_sm_psd`, Vindicta: `hornet_sm_png`). Unmapped heroes stay hidden.
Update the table from game resources when adding a hero; do not guess filenames.

The portrait is a sibling of the tinted frame, inherits the bar's scale/offsets
and opacity, and counter-rotates its 90-degree turn. Style and image writes are
suppressed when unchanged. Destroyed/replaced panels reset both signatures.
Style switch, disable or anchor loss hides it immediately before deferred
deletion. Hideout keeps FG active at a 0.5-second poll. Anchor recovery creates
and initializes a new image even for the same hero.

Regen sits above the portrait end of the bar, rotated clockwise by 30 degrees,
at local `x: 6px; y: -28px`. Recent damage, healing, and status effects occupy
three distinct, non-overlapping horizontal lanes shifted to `margin-left: 36px`
beside the portrait hexagon, running parallel to the bar:
- Damage counters (`recentDamageCounters`): `margin-top: 39px;`
- Healing counters (`#RecentHealContainer`): `margin-top: 63px;`
- Status effects (`CitadelStatusEffect`): `margin-top: 99px;`
Counter entries participate in flow with spacing; FG overrides their native
inline position so fading and new entries do not add native offsets to flow layout.
Native visibility and opacity still control their lifetime.

Current and maximum HP share a content-sized horizontal row (`flow-children: right`)
anchored inside the right end of the frame (`horizontal-align: right; vertical-align: center; margin-top: -1px; margin-right: 54px;`).
Current HP uses `font-size: 26px; font-weight: bold;` and `/ max` uses `font-size: 11px; margin-left: 3px; margin-bottom: 3px; vertical-align: bottom;`.
Both numbers sit on the same bottom baseline, never colliding with each other regardless of digit count.
The rectangular `healthBacker` is collapsed.
The frame `#health_bar_frame` uses `background-image: url("s2r://panorama/images/qollock/qol_fg_healthbar_border_png.vtex")`
with `background-size: cover; width: 75px; height: 400px;`.
The fill `#health_bar` and both pending tracks use `height: 224px; margin: 0px;
y: 21px`, centered against the same parent as the frame. The 396x2048 source
texture's slit spans approximately y=560..1704 across its slanted ends. At a
400px frame height that is -90.625..132.8125 relative to the frame center;
the enclosing track is -91..133. Explicit `background-position: center` fixes
the frame texture origin; explicit zero margins remove inherited native margins.

These are bounds of the entire opening, not just its center line. A rectangular
native fill intersects the slanted ends gradually, so visible area is not exactly
linear near 0/100%. The 1870/1946 case must retain a visible unfilled tip; 100%
must cover the whole opening. The alpha-geometry regression checks source pixels
and CSS coordinates offline; it does not render Panorama or verify its layout.
All labels use `sansMono` and remain upright. Shared scale reset clears the
native `ui-scale` override to restore the active CSS base.

`tests/healthbar_fg_reset.test.js` drives real settings row resets at 156/200
through all six healthbar modes and checks owned portrait cleanup and native-panel preservation.
It also checks top/bottom bar resets and native CSS property-name conversion.
These are offline lifecycle/propagation checks. After compile/repack, verify
100/156/200 scales, both offsets, opacity, reset, hero switching, death/respawn,
style switching, and hideout return; inspect hero-class updates, the unfilled tip at 1870/1946, full fill, and text geometry.

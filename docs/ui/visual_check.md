# Manual visual settings check

Dev -> HUD settings walkthrough is a manual A/B inspection of the real HUD.
It offers 21 groups / 42 steps: top bar, bottom bar, souls, items, ammo, minimap,
keyboard, zipline boost, speed, compass, active stats, shop, purchase history,
purchase notifications, per-hero purchase placement, healthbar, damage impact,
unsecured-souls timer, unsecured-souls HUD, chat and reload cooldown.

Each group has a reference and changed state. Back, Next and Compare A/B let
the operator repeat transitions; Stop restores the original settings. Related
X/Y changes are published together. Top/bottom/souls/items invert configured Y
when writing panel positions, so their instructions account for that sign.
The card gives exact temporary values and describes the required gameplay
trigger. This is not exhaustive coverage of every setting, variant or game mode,
and it never awards an automatic pass.

## Gameplay and shop access

Use **Test in game** to keep the current step active while closing settings and
dispatching the existing `CitadelResumePlaying` event. The card is hidden and
native menu presentation/navigation is restored. Open the shop with your normal
binding, buy items, move, reload or trigger the effect under inspection. Reopen
QOLLOCK settings to return to the same card and step; Back/A/B remain available.
Normal closing/resuming from the card stops the check. Only the explicit Test in
game action retains the session while settings are closed.

Purchase notifications need new native purchase records; the tool does not
fabricate them or buy items automatically. Buffs, damage and unsecured-souls
indicators likewise require real gameplay data. An absent indicator without its
trigger is not a passing check. Feature restrictions in hideout/sandbox still
apply. The healthbar scenario selects variant 1, not every healthbar variant.

## Ownership and restoration

`ui/visual_check.js` loads before `ui/dev_tab.js` in the settings context and
reuses panel helpers plus the persistence root/HUD resolver. While showing the
card, scoped classes hide direct menu children and expose HudCore through the
Escape-menu opacity rule. Native escape controls and the CEF bridge remain
available. Code does not overwrite native visibility/background style values;
removing the owned classes restores normal presentation.

Before starting, a pending real user edit is flushed normally. The tool snapshots
its owned setting keys, then restores that baseline before applying every step.
It publishes through the normal root/HUD revision bridge; the ConfigAdapter and
feature lifecycle apply the values. The walkthrough never styles native HUD
panels directly. Temporary settings do not call SaveAndSync, profile persistence
or CEF save, and unrelated configuration values are preserved.

The shared `QOL_UTILS.ClearStyleSafe` now releases native overrides with
`ClearPropertyFromCode` before legacy delete/null/empty fallbacks. This matters
when returning offsets, scale and opacity to their original CSS values: removing
a JavaScript property alone need not clear the engine's code-applied style.

Completion, Stop and ordinary settings close/resume restore owned values. A
session-only 0.5-second watchdog handles a deleted card/HUD/window and detects
reopening after gameplay; window open callbacks restore the card immediately.
There is no loop while idle. Destruction of the entire JS context cannot run
cleanup; test values have not been saved to disk, but startup restore remains
subject to the game's lifecycle.

## Localization and verification

Captions and scenario instructions use `LocalizeSettingsText` with English and
Russian catalog entries; incomplete locales use the existing English fallback.
Technical config keys and numeric values remain literal diagnostics.

`tests/ui_visual_check.test.js` loads real HUD/settings includes in separate
simulated contexts. It checks bridge propagation, repeated A/B/back style resets
with native-like style storage, completion/restart, close/deletion cleanup,
prior pending edits, localization, and gameplay/reopen without persistent saves.
These are modeled JS checks, not proof of C++ rendering, cursor routing or shop
interaction. Compile/repack as maintainer before client verification.

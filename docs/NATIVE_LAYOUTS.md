# Native layout ownership

QOLLOCK overrides XML when it changes a native hierarchy, adds binding sources,
loads an independent script context or supplies custom children. Style changes
alone should extend a stylesheet already loaded by the native layout instead of
adding an include through an otherwise identical XML copy. Native C++ panel types
can load a layout without an explicit reference in another mod XML, so an absent
HUD include is not proof of an unused layout.

Before removing an override, inspect the current extracted game layout, all active
includes, snippets, callbacks, script lookups and stylesheet imports. Preserve
conditional bindings and native controls. Mark changed native elements and QOLLOCK
additions with the contributor separator comments. The current game extract and
live debugger remain the authority for native structure; a simulator tree cannot
prove that a removed override is safe.

The hero-testing override was byte-identical to the current extracted native XML
after CRLF/LF normalization. It contained no scripts block or QOLLOCK changes.
The removed `ql_hero_testing.js` extension had no active include, no XML callbacks
and no HTPP panels in the current layouts. Native testing controls continue to use
the game layout; `hero_testing_menu.css` and HUD settings still extend visibility
and placement. Removing this inactive script does not establish an FPS gain.

The party XML formerly existed only to append a placement stylesheet. Its native
hierarchy, bindings and callbacks were unchanged. The game layout already loads
`citadel_party.css`, so that stylesheet now imports the extracted baseline and
applies the same friends-count placement. The XML override and separate
`qollock_party.css` are removed; native party members, invites, context-menu
callbacks and animations continue to belong to the game layout/base stylesheet.

The unit-target XML formerly added `qol_hint_target` to both native hint
containers. No stylesheet used that class; its only runtime consumer was target
geometry discovery. That owner now resolves the native `UnitTarget` snippet's
`.unit_target_instance > unscaled_panel > hint_container` and its second
`scaled_panel > hint_container` directly. Both branches retain independent size
application and replacement cleanup; unrelated same-ID hints are excluded.
The native layout, bindings, snippet creation and targeting animations remain
with the game, and the class-only XML override is removed.

The armor, tech and weapon stat XML copies only appended `gShopOpen` to each
native `gDetailView` listener. Permanent shop stat panels already descend from
`CitadelHudHeroShop`, whose native listener includes `gShopOpen`. Shop appearance
selectors now address that existing ancestor directly; the redundant listener
copies and their blanket listener-root collapse rule are removed. Native stat
snippets, bindings, detail-view listeners and component styles remain supplied
by the game. The shop-owned stat children and normal/simplified styles remain.

The native bar layout `hud_health.xml` only added a token stylesheet and a
permanently collapsed Fortitude block with a constant zero label. No active
script updated that label or consumed its panels. The inactive block and its
unused CSS are removed; design tokens are imported directly by `hud_health.css`
before the extracted baseline. The game supplies the unchanged health/shield/
pending-heal/pending-damage bar layout. `hud_health_container.xml` still owns
the shared scaling canvas, native number bindings and Minecraft containers.

Remaining overrides have the following source-level responsibilities. This map
explains the additions, not a claim that every native entry point was exercised
in the client. Inspect the marked blocks and current owner before retiring one.

| Layout(s) under `panorama/layout` | QOLLOCK addition / owning boundary |
| --- | --- |
| `hud.xml` | HUD script load graph, shared styles and class listeners used by HUD owners. |
| `hud_escape_menu.xml` | Independent settings script/style context and settings controls. |
| `hud_health_container.xml` | Shared healthbar scaling canvas, Minecraft containers, native number bindings and regen/damage presentation. |
| `hud_gold_and_ap_container.xml` | Native `CitadelHeroImage` child inside the level amount; it is not FG's authoritative hero source. |
| `citadel_hud_hero_shop.xml` | Recent-purchaser hero-name binding and permanent native shop stat children. |
| `citadel_hud_hero_builds.xml` | Hidden selected-build ID/name/version binding consumed by the build readout. |
| `citadel_hud_top_bar.xml` | Buff/rejuvenator display surfaces and retained compatibility score wrappers. |
| `citadel_hud_top_bar_player.xml`, `players_list_entry.xml` | Native player/hero evidence, rank badges and topbar nickname/objective/ultimate displays; restricted SPM/unspent markup remains compatibility content. |
| `hud_quickbuy.xml`, `hud_quickbuy_entry.xml` | Independent quickbuy companion, summary/preview/queue children and native pointer-input changes. |
| `citadel_db_page_profile.xml`, `profile_card.xml` | Independent profile/card callbacks, bound account evidence, rank and Statlocker children. |
| `friends_list.xml` | Search input/clear button children and their local stylesheet. |
| `hud_paused.xml` | Pause glyph plus localized pause text alongside native countdown controls. |
| `ability_hud_elements/element_progress_bar_text.xml` | Legacy cast-bar children with native progress context and bound ability name. |
| `citadel_db_page_learn.xml` | Changed native sandbox-card activation. |
| `citadel_db_page_training.xml` | Additional dashboard cards/actions in the menu context. |
| `citadel_db_play_menu.xml` | Practice-versus child in a historical menu override. No matching current extracted layout was found; C++ reachability remains unverified, so absence from HUD includes alone cannot justify deletion. |

An XML with one change can still be the source of an engine-bound value or an
independent context. Prefer native selectors/existing styles where those suffice;
do not replace bound data or menu callbacks with an unverified polling API merely
to reduce the file count.

Source deletion does not update an already packed mod. The incremental pipeline's
stale-artifact list removes the old testing XML/script outputs when the maintainer
runs it, together with the retired party XML/style, unit-target XML and three
stat XML copies and native bar XML; the full builder already prunes outputs
without source files. Agents do
not compile/repack or change installed addons. After a maintainer build, verify
native testing controls, practice-area visibility and the force/hide settings in
the client. Offline gates cover source loading, existing CSS contracts and API
usage, not this native rendering/input check.
Also verify the friends count in the party button slot, party invites, menu
opening and party-code context-menu behavior after the party XML retirement.
Verify both target hint branches, Improved Hint, target-size/opacity controls and
ability targeting after the unit-target XML retirement.
Verify shop stats in both normal and simplified modes, shop open/close and
detail-view stat tooltips after retiring the three stat component overrides.
Verify each healthbar variant, shields, pending heal/damage overlays and reset
after the native bar XML retirement.

# Native layout ownership

QOLLOCK overrides XML when it changes a native hierarchy, adds binding sources,
loads an independent script context or supplies custom children. Style changes
alone do not justify keeping an otherwise identical copy. Native C++ panel types
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

Remaining layouts include actual native hierarchy/binding changes: healthbar
canvases and source values, shop purchase evidence, quickbuy input/summary sources,
profile/card contexts, dashboard cards, friend search and cast-bar/target children.
They need an owner-by-owner review before any further XML retirement.

Source deletion does not update an already packed mod. The incremental pipeline's
stale-artifact list removes the old testing XML/script outputs when the maintainer
runs it; the full builder already prunes outputs without source files. Agents do
not compile/repack or change installed addons. After a maintainer build, verify
native testing controls, practice-area visibility and the force/hide settings in
the client. Offline gates cover source loading, existing CSS contracts and API
usage, not this native rendering/input check.

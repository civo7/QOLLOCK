# Settings controls and export precision

`panorama/scripts/ui/controls.js` builds the procedural settings rows. Slider
changes and typed submissions commit values on the existing compact-schema
field's step grid, restricted to the intersection of the UI and schema bounds.
Values are snapped relative to the schema minimum; floating-point arithmetic
is rounded before committing. A row without a compact field uses its declared
UI bounds and step. The schema field map is built once when controls load.

This keeps live settings representable in shared settings codes and cloud
backups without changing the schema or defaults. For example, a scale input of
1.23 commits 1.25 when its wire step is 0.05; an offset input of 123 commits 125
when its step is 5. Invalid text preserves the previous value. The existing
debounced save and preview flow remains in use.

## Automated checks and their limits

`tests/ui_slider_roundtrip.test.js` loads the production HUD and settings XML
script lists into separate simulator isolates sharing panel attributes. It
drives real slider and text-entry handlers, waits for save/config propagation,
and checks the UI value, ConfigStore, runtime snapshot, export preview, and
confirmed import. Dragged/typed floating-point and integer values, bounds, and
invalid text are covered.

`tests/matrix_invariant.test.js` renders twelve actual settings tabs, checks
their reset-key bindings against defaults, and requires three specific local
configuration interactions to run. It checks captured callback/event failures
as well as thrown exceptions. It does not randomly activate commands, clear
buttons, links, presets, or games, and is not an exhaustive interaction test.

The simulator implements only dropdown option registration and selection by
ID, including invalid/deleted selection handling. It does not model dropdown
popup layout, native input routing, or automatic submit events. That narrow
contract is tested in `tests/simulator_dropdown.test.js`. These tests cannot
verify in-game geometry, focus, C++-created panel hierarchies, or compiled VPK
behavior; the maintainer still needs to check the repacked mod in Deadlock.

# Advanced item cooldown mirror contracts

The [item mirror](../../panorama/scripts/manifests/ql_item_mirror/manifest.js)
owns Advanced mode overlay panels. [Passive cooldown styling](ql_passive_cooldown.md)
and [legacy audio/basic layout](ql_legacy_audio_passive.md) have separate owners
despite shared settings.

The manifest registers existing settings and creates an instance-local
controller. `data.js` retains the authoritative item mapping; `sources.js`
owns inventory selection/reconciliation and numeric-text observation;
`renderer.js` owns slot construction, per-source radial estimates and render
signatures; `controller.js` owns the derived settings model and coordinated
native/overlay lifetime. These modules load explicitly before the manifest in
the HUD XML. They do not publish mutable inventory state through `State`.

Item matching uses native inventory sources, tier, category, images and
exceptions. Do not replace it with a single class-to-item lookup. Each item
needs independent source identity, acquisition order and cooldown history;
rescans must preserve valid identities and discard replaced panels. A ready
item must not inherit another item's cooldown or completion flash.

Presentation filters operate on the reconciled source set, so hiding a category
does not discard its history. Native IDs are local to each inventory list;
deduplication uses panel identity. A slot changing occupants invalidates rendered
images, classes, masks and feedback signatures while preserving source history.

The mirror prefers numeric native cooldown text, then estimates remaining
time from radial movement. Missing text can appear later, so source replacement
and retry paths must recover without searching every frame. The mirror follows
the shared combat-HUD visibility gate: the initial `InHideout` room suppresses
it, while `connectedToHideout` alone must not suppress the playable Hero Testing
combat room. Shop, other suppressed gameplay states, disable and HUD replacement
must clear or rebuild owned overlays and signatures. Verify the affected
category filters and transitions in the client after maintainer compile/repack.

Current HUD selection passes the current context to the shared HUD resolver.
Scoped inventory/gameplay/abilities owners validate live replacement; retained
native children must still belong to their current source. Rebuilt sources keep
acquisition identity, but radial velocity, text samples and completion feedback
cannot cross a native icon/container/mask generation. Retired native panels
remain engine-owned. Every mirror child remains renderer-owned even when
reparented; incomplete construction is deleted and remains retryable.

Ready feedback uses managed Scheduler one-shots. Shop suppression, category
hiding, slot replacement and disable cancel pending/active feedback. Successful
layout signatures belong separately to the overlay and row so a partial write
or a replacement cannot suppress retry. Rendering and native radial timing still
require the maintainer's client checks.

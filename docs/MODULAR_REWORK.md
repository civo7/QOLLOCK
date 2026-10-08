# Modular rewrite acceptance plan

The target is the complete active QOLLOCK load graph, including HUD, settings,
profile/card, quickbuy and hero-testing contexts. Registration or consistent
manifest metadata alone does not complete that target. Use the actual XML
includes through `scripts/simulator/layout.js` and the
[architecture map](../ARCHITECTURE.md); retain conditional and account-gated
behavior until its owning implementation has been audited.

## Completed foundations

- One canonical persisted setting catalog and atomic updates of shared keys.
- Generation-scoped feature contexts, managed schedules and partial-enable cleanup.
- Measured Customize geometry, placement, corner gestures, magnets, guides and
  draggable editor windows; current [client acceptance](ui/customize-rework.md).
- Native presentation owners and content overlays with distinct settings,
  discovery, rendering and release paths.
- Healthbar variant controllers, independent warning presentation, scoped map
  content/geometry, compass and objective/stat readouts with private lifetime state.

Frozen main-config fixtures preserve all healthbar variants and both minimap
scale methods. Published versions, compact layouts and persistent defaults stay
unchanged, apart from the already approved native-origin AP/stamina offsets.

## Remaining implementation and audit

1. Rewrite the remaining legacy HUD owners: shop/quickbuy integration, recent
   purchases, Advanced item mirror, reload estimate, profile/rank/statlocker,
   translation and on-death launch coordination. Preserve their established
   source selection, filtering, identity and context boundaries.
2. Audit already modernized owners for remaining shared mutable bookkeeping,
   duplicate native style writers and missing release paths. Remove obsolete
   global state only after identifying all real consumers.
3. Reconcile centrally projected CSS with explicitly disabled content owners.
   Synthetic registry disable must not leave a custom-only layout with its
   content removed; root-class policy remains owned by core.
4. Audit core services and the settings, profile/card, quickbuy and hero-testing
   companions against the same lifetime/settings contracts. Keep verified
   native APIs and cross-context bridges; remove unreachable migration layers.
5. Run the complete offline gate before each logical commit and retain the
   frozen compatibility fixtures. After maintainer compilation/repacking,
   perform the native visual/input, gameplay-transition and restart checks.

Each owner must react immediately to accepted settings, bind replacement and
late native sources, retry partial writes, preserve unrelated native behavior,
and release its owned panels/properties/events/schedules. Separate controllers
are justified by distinct responsibility, rather than by file length alone.
Existing gameplay and presentation remain the acceptance baseline.

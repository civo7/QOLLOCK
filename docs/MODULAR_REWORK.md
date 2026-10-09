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
  content/geometry, compass, reload estimates and objective/stat readouts with
  private lifetime state; generation-safe on-death launch/menu coordination.
- Reactive shop presentation with native baseline release and the retained
  Enhanced Quickbuy config/catalog control.
- Private recent-purchase history/filter/feed owners with living source retirement,
  retryable late purchaser evidence and preserved native history.
- Private HUD rank/Statlocker owners and independent profile/card companions;
  correlated account probes and current-account activation replace stale closures.
- Quickbuy companion with scoped native generations, retained pricing/preview
  rules, retired input callbacks and tracked poll/chat/focus/drag work.
- Account-gated translation owner with private native message generations,
  bounded retry/cache state and readable source text when the helper is absent.
- Transient registry presentation availability reconciles central CSS with
  disabled/failed content owners without rewriting accepted configuration.
- Advanced item mirror separates authoritative data, native sources, slot rendering
  and lifetime coordination; current generations, estimator reset, partial-write
  retries and managed ready feedback preserve matching/filter/purchase behavior.
- Native chat geometry has one independent owner. Image embedding and translation
  share a read-only native label selector while retaining separate private caches,
  source generations and cleanup; disabling images preserves chat geometry.
- Audio reminders retain private announcement/caption history across their own
  lifetime, and damage indicators retain private native-label ownership instead
  of publishing duplicate mutable cache snapshots.
- Keyboard overlay construction, native glyph reconciliation and geometry/color
  rendering retain private generations; late/replaced glyphs and partial native
  writes no longer inherit a stale whole-layout signature.
- Native hero-testing layout is supplied by the game; the identical override and
  unreachable JavaScript extension are removed while its active CSS/settings
  behavior remains. Incremental packaging retires their former compiled artifacts.
- Target/hint rendering no longer exports private caches or accepts meaningless
  core invalidation writes. Unused shared fields left by retired implementations
  are removed after checking current consumers; real cross-owner snapshots remain.
- Performance diagnostics separate private report/model and native renderer
  lifetimes from the Scheduler collector. Living replacement and disabled overlays
  release owned panels without clearing shared samples or benchmark state.
- Urn/networth difference has one manifest owner for current native sources and
  its created readout. Pure parsing/display rules retain native formats and
  late-match thresholds; core no longer runs a second content writer or publishes
  overlay caches. The existing persisted toggle and player-total fallback remain.
- Shared panel caching has one typed storage owner; retained accessor names
  delegate there. Core lookup misses are private and generation scoped, while
  panel configuration caches bind both root/HUD identity and actual read-back.
  Living replacements and rejected publication no longer reuse stale payloads.

Frozen main-config fixtures preserve all healthbar variants and both minimap
scale methods. Published versions, compact layouts and persistent defaults stay
unchanged, apart from the already approved native-origin AP/stamina offsets.

## Remaining implementation and audit

1. Audit already modernized owners for remaining shared mutable bookkeeping,
   duplicate native style writers and missing release paths. Remove obsolete
   global state only after identifying all real consumers.
2. Audit core services and the settings, profile/card, quickbuy and hero-testing
   companions against the same lifetime/settings contracts. Keep verified
   native APIs and cross-context bridges; remove unreachable migration layers.
3. Run the complete offline gate before each logical commit and retain the
   frozen compatibility fixtures. After maintainer compilation/repacking,
   perform the native visual/input, gameplay-transition and restart checks.

Each owner must react immediately to accepted settings, bind replacement and
late native sources, retry partial writes, preserve unrelated native behavior,
and release its owned panels/properties/events/schedules. Separate controllers
are justified by distinct responsibility, rather than by file length alone.
Existing gameplay and presentation remain the acceptance baseline.

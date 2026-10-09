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
- Shared game-time observation follows private verified source generations,
  replaces construction fallbacks and notifies ordered consumers when the source
  changes even at the same second. Requested roots cannot inherit another root's
  observed time; the final unsubscribe releases observation and source records.
- Combat indicator classes/recovery have an independent manifest owner, so
  disabling the text readout preserves them. Core combat/reload evidence and
  mode observations follow current native sources; private core class records
  retire old living owners and retry partial ability writes. The unconsumed
  legacy cooldown attribute bridge is removed while its CSS settings remain.
- Text combat status owns all created children and a scoped gameplay parent;
  moving/replacing labels retires the previous children, new HUDs reset phase
  history, and stopped hooks cannot recreate the readout. Same-HUD replacement
  retains the observed combat period and partial construction/styles retry.
- Runtime registration and flat-key ownership use current manifests alone. The
  empty dispatch registry and its ID translation table are removed; historical
  configuration parsers/codecs remain independent and the offline profiler
  attributes active polls through Scheduler.
- Created combat/zip/unsecured/stat readouts share an instance-local tree helper
  for complete child ownership and asynchronous retirement. Native parent and
  source/history rules remain explicit in each manifest; loading roots no longer
  become fallback gameplay anchors. Stopped hooks cannot recreate UI, and new
  HUDs reset private observation history.
- Hero observation retains the two read-only native evidence paths used by FG;
  unconsumed signature/shop/build loader implementations and shared confirmation
  fields are removed. Compact/envelope codec adapters remain pure and preserve
  historical decoding, without UI-action or loader-queue ownership.
- Settings consumers use explicit utility exports. Transitional import layers
  and settings-side HUD/cache stubs are removed; shared data publication no
  longer overwrites real panel helpers or fabricates gameplay APIs.
- The optional pre-commit template shares the complete canonical offline gate.
  Retired grep validators for removed core/import/feature layouts are removed;
  CSS/XML changes no longer bypass that template's checks.
- The custom cursor owns both its container and image through the shared tree
  helper. Active-instance guards, current HUD binding and retryable root-class
  release preserve native pointer fallback during construction/render failures
  and rapid re-enable; stopped hooks cannot create cursor UI.
- Rift Timer and Crosshair Stats share complete created-child ownership and
  retire moved children or pending previous instances. Both bind current HUD
  generations; Crosshair Stats waits for native gameplay instead of anchoring
  to a loading root. Same-HUD topbar replacement retains the Rift warning
  deadline, and stat filters/native value selection remain unchanged.
- Urn Difference and the performance renderer use the same complete-tree helper;
  the duplicate local creation/retirement implementations are removed. Partial
  construction stays hidden, rapid re-enable waits for prior asynchronous
  deletion, and loading roots do not become display parents. Native networth
  parsing and shared Scheduler collection remain independent of panel lifetime.
- Minimap objective timers derive geometry settings reactively and use complete
  created-child ownership. Partial construction, moved labels/icons, retired
  callbacks and rapid re-enable no longer leave or revive orphaned timer trees;
  current HUD/native clock rebinding preserves fixed-icon Base/Alt/Tab geometry.
- Selected Build ID uses a reactive settings model, current native source/parent
  resolvers and complete created-tree ownership. Partial content/style failures
  retry, living HUD replacements release the previous readout, and stopped hooks
  cannot recreate it. Existing parsing, native title fallback and hideout support
  remain; disable now removes the tree instead of retaining an inert writer.
- Compass/speed readouts derive settings reactively and own both complete trees,
  including moved ticks/labels. Native gameplay is required for those readouts;
  current HUD replacement releases previous native rotation/flip and sampling
  bindings. Partial construction and queued previous instances cannot expose
  incomplete or retired readouts; heading/speed calibration remains unchanged.
- Reload Countdown uses the shared created-label lifetime, waits for pending
  previous IDs and guards inactive hooks. Current HUD replacement resets its
  private estimate, and cleanup no longer depends on writing retired text;
  native radial signals and the established smoothing remain unchanged.
- Minimap content derives settings in lifecycle hooks and binds the current HUD;
  stopped hooks cannot revive polling. Crates/tunnels own their complete trees,
  including moved markers and shrinking coordinate data. Partial construction
  and style failures remain hidden until retry; native geometry, Fixed Icon Size
  and the shipped map-coordinate source remain with their existing owners.
- Party placement extends the native stylesheet instead of retaining a full XML
  copy solely for one stylesheet include. Native hierarchy, bindings/callbacks
  and baseline animations remain supplied by the game; stale packed outputs
  are retired by the maintainer pipeline.
- Target hint geometry resolves both native snippet branches through their
  existing IDs/classes; the class-only unit-target XML override is removed.
  Native bindings/animations and unrelated hint containers stay untouched, and
  inactive hooks/loading roots cannot acquire native geometry overrides.
- Shop stat appearance uses the existing native shop class listener. Three
  armor/tech/weapon XML copies containing only a listener extension are removed;
  native component content/detail-view bindings, permanent shop stat children
  and normal/simplified styling retain their owners.
- Native bars use the game's health layout and the existing stylesheet extension;
  the permanently collapsed Fortitude zero block and its unused rules are
  removed. The shared scale canvas, all healthbar variants and native value
  bindings remain supplied by their current owners.
- Keyboard creation/retirement uses the shared complete-tree helper instead of a
  second private ownership implementation. Foreign previous roots, queued
  re-enable and rejected moved-child deletion no longer strand the overlay;
  partial renders/loading-root lookalikes stay hidden while native bindings,
  glyph content and both action layouts remain with their existing owners.
- The XML-composition profiler selects current mod sources or native fallback
  directly, so retiring an override does not omit its native subtree from the
  model. A duplicate mod-owned composition flag list is removed; missing native
  sources still produce explicit notes, and captured-hierarchy replay is unchanged.

Frozen main-config fixtures preserve all healthbar variants and both minimap
scale methods. Published versions, compact layouts and persistent defaults stay
unchanged, apart from the already approved native-origin AP/stamina offsets.

The escape-context friends search has one controller for native source selection,
handlers, filter classes and retries. Living replacement, late names and rejected
class writes are reconciled; context destruction/reload retires callbacks and
deferred work. Filtering preserves native visible flags, and the clear button
uses its existing stylesheet gate instead of a conflicting visible-property write.

Stamina rotation uses native-zero degrees in both UI paths and a shared conversion
at the presentation boundary for the published legacy field. The renderer no
longer treats that encoding sentinel as a native angle; it preserves observed
native transforms, follows current HUD/ring generations and retries rejected
restoration of living retired pips/transforms while active. Stopped hooks cannot
reapply rotation. Persistent defaults, schema layouts and saved values are unchanged.

Inventory and stats placement share native style/class ownership instead of
duplicating applied-property bookkeeping. Attempted writes remain tracked through
rejected clears, living source replacement and disable; cleanup-only retries
cannot overwrite a new instance's claims. Current HUD selection, reactive settings
and native inventory leaf opacity stay with their manifests. Other native style
owners still require the same audit before using this contract.

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

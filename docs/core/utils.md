# Leaf utility contracts

Source: `panorama/scripts/ql_utils.js`; export `QOL_UTILS`, with a later
`QOL.utils` compatibility alias. Read [HELPERS](../HELPERS.md) before choosing one.

`IsPanelValid` and `IsPanelListValid` describe native handles, never player life.
Lists must be actual nonempty arrays. `PanelHasClass` returns false if the native
class lookup throws. `FindAncestorWithClass` includes the starting panel and
returns null when native class/parent access fails; `HasClassInHierarchy`
delegates to that walk. These walks are uncapped and assume a normal parent tree.

`NormalizeDegrees180` uses the existing interval (-180, 180], including mapping
-180 to 180. This documentation correction does not change angle behavior.
Other leaf functions retain their individual contracts; this module does not
promise exception safety for every arbitrary native property access.

Style safety wrappers also catch access to the native `style` getter itself.
`GetPanelPositionRelativeToAncestor` returns null on failed native layout/parent
reads, preserving its 64-step bound and existing unscrolled layout semantics.

The optional manual call profiler counts hits since the previous dump, with a
minimum 10-second dump interval. Rates divide by the actual elapsed time, not
an assumed 60-second window. Enable/disable transitions reset counts/time.
It is distinct from Scheduler callback timing and does not measure rendering.

# Rank and Statlocker profile owners

The HUD owners are [ql_showrank](../../panorama/scripts/manifests/ql_showrank/manifest.js)
and [ql_statlocker](../../panorama/scripts/manifests/ql_statlocker/manifest.js).
They use their existing persisted toggles. The profile page and profile card
companions are separate native script contexts with only `ql_utils.js` loaded;
their existing profile tools remain available independently of those HUD toggles.
The active includes and QOL account bindings are in `citadel_db_page_profile.xml`
and `profile_card.xml`.

## Rank discovery and publication

Show Rank reads the current TopBar roster through the native team/player
containers and discovers escape-menu `CitadelPlayersListEntry` panels under
`PlayersList`. Each native source has private identity, presentation and resolver
state. A living handle does not preserve its account when its player identity or
native membership changes. The XML badge panels belong to the layout: retirement
clears QOL images, visibility classes and hidden account labels rather than
deleting those panels.

Opening the scoreboard starts serialized profile-card probes through the existing
native `Activated` call. There is one managed deferred HUD probe at a time. Native
row replacement, identity changes, scoreboard closure, hideout entry and feature
shutdown invalidate outstanding work. Missing identities remain retryable;
failed activation and expired probes retain the existing failed-row sentinel.

The shared document's `qol_sr_generation`, hero publications and escaped player
name publications remain the bridge for TopBar badges. Player-name keys escape
percent signs and list separators before publication. Conflicting accounts for
one name remain ambiguous, including three or more duplicates. TopBar can use a
player name when its hidden hero binding is empty.

Probe correlation uses temporary document attributes: `qol_sr_probe_token` and
`qol_sr_probe_result_token`, alongside the existing probe name, hero, account and
fill attributes. The profile-card script captures the active request when its
context is created and stamps `qol_sr_card_probe_token` on that card. Its native
onload callback and bounded late-binding retries publish only for that captured
request. The HUD's HiddenAccountID fallback likewise accepts only a card stamped
for the current request. A retained card from another request cannot publish an
account into the current row. These attributes are ephemeral runtime state, not
persistent configuration or a codec revision.

## Statlocker and profile companions

The HUD Statlocker owner discovers native hero-row `coreRating` sources and owns
only its dynamically created STAT buttons. Discovery includes the document
ancestor because profile pages are outside the HUD subtree. Each source retains
its own button, label, event and successful style signatures. Departed sources
retire their buttons, and disable invalidates activation before asynchronous
deletion. Activations resolve the current viewed account rather than a captured
account from an earlier scan.

Canonical QOL profile account bindings take precedence, including a blank
binding while native data is loading. A known profile binding that disappears
also fails closed. Older account lookup fallbacks are retained only where there
is no authoritative profile binding. The shared account parser supports the
verified Steam `[U:1:<account>]` representation as well as the existing punctuated
numeric labels; invalid Steam tags and oversized account IDs are rejected.

The profile-page companion owns the friend rank image, tools visibility class
and Statlocker activation handler. It refreshes native source generations and
reads the current account at click time. Inactive pages hide tools and reject
activation; destroyed contexts stop scheduled work. The card companion owns its
existing link and label handlers, with bounded initial retries. Retained cards
refresh through hover, click or the existing onload callback. The same-context
`$.RefreshStatlockerProfileCard` hook starts one bounded retry chain and is called
by the rank onload bridge; it is not a HUD global.

## Verification

`tests/profile_rank_owners.test.js` drives production HUD lifecycle and separate
profile/card isolates. It covers identity changes, living replacement, duplicate
names, escaped names, late and stale callbacks, correlated onload fallback,
canonical loading states, partial native writes, owned-button deletion, reactive
gating and bounded card work. Helper API and safety regressions check the shared
parser/helper boundary.

After maintainer compilation/repacking, verify native scoreboard activation and
dismissal, card context attachment at script initialization, per-probe card
creation/reuse, late account binding, remote rank image loading, profile navigation
and Statlocker links. A reused card JS context belonging to an earlier probe
fails closed; client behavior must establish whether fresh context creation is
available for subsequent probes. Simulator results do not establish rendering,
native input/focus behavior, remote availability or FPS.

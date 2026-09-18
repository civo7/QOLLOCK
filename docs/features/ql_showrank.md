# `panorama/scripts/manifests/ql_showrank` (Show Rank)

## Description
Fetches and displays rank prediction badges for players in the match using the Deadlock public API (`deadlock-api.com`). Rank tier badges are attached directly to player hero portraits on the Top Bar as well as player rows inside the Escape Menu scoreboard. It coordinates across different Panorama execution contexts (HUD and profile cards) through a document root attribute bridge, allowing players to view opponent and teammate skill tiers at a glance.

## Files
- Manifest: `panorama/scripts/manifests/ql_showrank/manifest.js`
- Card Script: `panorama/scripts/features/ql_feat_showrank_card.js` (profile card context probe handler)
- Styles: `panorama/styles/showrank.css` (defines rules for `#RankPredictionBadgeTopBar.ShowRankVisible`, `.HideShowRankTopBar`, etc.)

## Settings & Defaults
| Config Key | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `SHOW_RANK` | `toggle` | `false` | Master toggle to enable rank prediction badge fetching and display. |
| `SHOW_RANK_TOPBAR` | `toggle` | `true` | Display rank badges directly over hero portraits on the Top Bar. |

## Architecture & Lifecycle

### Activation & Lifecycle Hooks
- **`onEnable()`**: Increments generation and lifecycle tokens, resets top-bar initialization backoff, and registers a 2Hz (`0.5s` interval) polling loop via `QOL.core.Scheduler.createPollLoop(_tick, 0.5, "ql_showrank")`.
- **`onDisable()`**: Halts the polling loop, clears active probe attributes on `_docRoot`, removes badges via `_clearTopBarBadges()` and `_clearPlayerListBadges()`, adds `HideShowRankTopBar` class to context root, and resets internal caches.
- **`onSettingsChanged()`**: Synchronously runs `_tick()` to refresh visibility classes and trigger badge population.
- **`test()`**: Verifies that both `#Hud` and `#TopBar` panels are present and accessible.

### DOM Injection & Target Panels
- **Top Bar Badges**:
  - `Image#RankPredictionBadgeTopBar`: Displays the base rank tier icon (`s2r://panorama/images/ranked/badges/...`).
  - `Image#RankPredictionBadgeTopBarOverlay`: Displays sub-tier Roman numeral or laurel embellishments.
  - Injected inside player card panels retrieved from `PlayersContainer`.
- **Escape Menu Scoreboard Badges**:
  - `Image#RankPredictionBadge` and `Image#RankPredictionBadgeOverlay` injected into player list rows in the Escape Menu.
- **Context Bridge Attributes**:
  - Communicates via `_docRoot` attributes (`qol_sr_probe_name`, `qol_sr_probe_hero`, `qol_sr_probe_account`, `qol_sr_fill_token`) to trigger profile card lookups without DOM coupling.

### Engine Events & Polling Frequency
- **Polling Frequency**: 2Hz (`0.5s` interval).
- **Secondary Fill Loop**: Triggers only when the Escape Menu is actively opened.
- **Engine Events**: Monitors Escape Menu visibility classes (`ShowEscapeMenu`) on HUD root.

### Performance Tier & Caveats
- **Performance Tier**: Medium (API lookups and top-bar hierarchy traversal).
- **Suppression**: Fully suppressed in Hideout/Sandbox lobbies (`InHideout`, `inHideoutIntro`, `connectedToHideout`).
- **Hierarchy Caching**: Caches the intermediate container chain (`_playerContainersCache`: TopBar -> TeamsContainer -> Team -> PlayerContents -> PlayersContainer) while dynamically iterating child player elements, avoiding expensive repeated deep tree searches (~15k nodes/sec saved).
- **Safe Delimiter Escaping**: Player names containing separator characters (`|` or `%`) are encoded via `_rankNameKeyPart` to prevent token corruption and attribute bloat across match transitions.

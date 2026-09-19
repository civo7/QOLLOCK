# `panorama/scripts/manifests/ql_statlocker` (Statlocker Profile Link Buttons)

## Description
Integrates external matchmaking statistics into Deadlock by injecting convenient "STAT" buttons into hero rating and performance rows (`coreRating` panels across player profile screens). Clicking the button dynamically resolves the player's 32-bit Steam Account ID and opens their full match and hero profile on `statlocker.gg` via the Steam overlay browser.

## Files
- Manifest: `panorama/scripts/manifests/ql_statlocker/manifest.js`

## Settings & Defaults
| Config Key | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `ENABLE_STATLOCKER` | `toggle` | `false` | Master toggle to inject "STAT" profile buttons onto hero performance rows. |

## Architecture & Lifecycle

### Activation & Lifecycle Hooks
- **`onEnable()`**: Initiates a polling loop running at ~0.83Hz (`1.2s` interval) via `QOL.core.Scheduler.createPollLoop(_tick, 1.2, "ql_statlocker")`.
- **`onDisable()`**: Halts the poll loop, deletes all injected button panels via `_removeAll()`, and clears panel arrays and discovery cache.
- **`onSettingsChanged()`**: Resets the discovery timer (`_nextScanMs = 0`) and triggers `_tick()` immediately.
- **`test()`**: Evaluates traversal success for `.coreRating` panels within the current context.

### DOM Injection & Target Panels
- **Target Panels**: `.coreRating` panels with an associated `HeroRowBackground` container.
- **Injected Elements**:
  - `Button.QOLStatlockerButton`: Right-aligned pill button styled with dark gradient background (`#171717` to `#111111`) and emerald border (`#66cc9930`).
  - `Label.QOLStatlockerLabel`: Displays `"STAT"` in emerald font (`#66cc99`).
- **Interaction Hook**:
  - Sets `onactivate` handler that calls `$.DispatchEvent("ExternalBrowserGoToURL", "https://statlocker.gg/profile/" + accountId)`.
- **Account ID Resolution Hierarchy**:
  1. Authoritative canonical binding: `#QOLProfileAccountID`
  2. Ancestor traversal for `.AccountID` label text
  3. Parent panel attributes (`accountid`, `account_id`)
  4. Build payload fallback (`QOL.getAccountIdForBuildCategoryPayload`)

### Engine Events & Polling Frequency
- **Polling Frequency**: Base interval of 1.2s (`0.83Hz`).
- **Adaptive Discovery Backoff**: Full-tree discovery scans execute every 3000ms (`SCAN_INTERVAL_MS`), backing off incrementally up to 6000ms (`SCAN_IDLE_MAX_MS`) when no profile cards are active.
- **Engine Events**: Dispatches `ExternalBrowserGoToURL` when clicked.

### Performance Tier & Caveats
- **Performance Tier**: Low (1.2s polling with backoff).
- **Single Ancestor Scan**: Scans from the topmost live ancestor rather than rescanning intermediate subtrees, avoiding redundant nested passes.
- **Initialization Caching**: Injected buttons are tagged with attribute `_qol_statlocker_initialized = "1"`. Subsequent ticks skip style and event reapplications on existing buttons.

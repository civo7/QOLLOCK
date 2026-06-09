# Variable Name Audit — QOLLOCK Codebase

**Date:** 2026-06-08  
**Scope:** All `.js` files in `panorama/scripts/` (~71K lines total)  
**Method:** Systematic grep for single-letter vars, 2-letter abbreviations, misleading names, and inconsistent naming

---

## SEVERE — Real bug risk or major confusion

### 1. `hc` = two completely different meanings (ql_core.js)

| Line | Meaning | Code |
|------|---------|------|
| 5827 | **h**ealth**C**ontainer | `var hc = hudRoot.FindChildTraverse("healthContainer")` |
| 8956 | **h**int**C**ontainers index | `for (var hc = 0; hc < hintContainers.length; hc++)` |

**Fix:** Rename line 5827 to `healthContainer`, line 8956 to `hi` or `hintIdx`.

### 2. Same array `next` iterated with FIVE different index names in one function (ql_core.js ~18428-18474)

```js
for (var hi = 0; hi < next.length; hi++)    // "hinted index"?
for (var ni = 0; ni < next.length; ni++)    // "name index"?
for (var ei = 0; ei < next.length; ei++)    // "entry index"?
for (var tbi = 0; tbi < next.length; tbi++) // "top bar index"?
for (var mi = 0; mi < next.length; mi++)    // "match index"?
```

All five loop over the same `next` array in the same function body. Each loop uses a different cryptic index name. Extremely confusing to read and fragile to refactor.

**Fix:** Use descriptive names like `hintedIdx`, `nameIdx`, `entryIdx`, `topBarIdx`, `matchIdx` — or better, use `for...of` with `next.entries()`.

### 3. `cd` = three different meanings (ql_core.js)

| Line | Meaning | Code |
|------|---------|------|
| 7635 | **c**ount**d**own display | `var cd = String(Number(slot.elHidden.text) + 1)` |
| 11491 | **c**ool**d**own (ms) | `var cd = Number(cooldownMs)` |
| 19864 | **c**andi**d**ates index | `for (var cd = 0; cd < candidates.length; cd++)` |

**Fix:** Rename to `countdownText`, `cooldownMs`, and `candIdx` respectively.

---

## HIGH — Significantly impairs readability

### ql_core.js

| Line | Name | Meaning | Suggested Fix |
|------|------|---------|---------------|
| 18016 | `nm` | **n**a**m**e (hero/player name) | `playerName` or `heroName` |
| 18131 | `rp` | **r**ow **p**anel (StatusRow) | `statusRow` or `rowPanel` |
| 2800 | `pd` | **p**arent **d**epth | `parentDepth` |
| 14422 | `cc` | **c**hild **c**ount | `childCount` (consistent with rest of codebase) |
| 6741 | `ds` | **d**elta **s**tart (degrees) | `deltaStart` |
| 6742 | `de` | **d**elta **e**nd (degrees) | `deltaEnd` |
| 7086 | `mm` | **m**inute **m**atch (regex) | `minMatch` |
| 7087 | `ss` | **s**econd **m**atch (regex) | `secMatch` |
| 15860 | `ev` | **e**vent name | `eventName` |
| 14425 | `ch` | **c**hild (panel) | `child` |
| 18428-18474 | `tbi` | **t**op**b**ar**i**ndex | `topBarIdx` or `topBarIndex` |

### ql_settings.js

| Line | Name | Meaning | Suggested Fix |
|------|------|---------|---------------|
| 12738 | `ek` | **e**nable **k**ey | `enableKey` |
| 12906 | `gc` | **g**roup **c**hildren index | `groupChildIdx` — **critical:** `GC` means `GetCachedPanel` everywhere else |
| 19030-19031 | `mi`/`mk` | **m**enu **i**ndex/**k**ey | `itemIdx`/`itemKey` |
| 20939-20951 | `mt`/`mr`/`ms` | **m**atched**T**abs/**R**ows/**S**ections — all in same scope | `tabIdx`/`sectionIdx`/`rowIdx` (or use `for...of`) |
| 17153, 22355, 22405 | `so` | **s**croll **o**ffset (3 separate functions!) | `scrollOffset` |

### ql_utils.js

| Line | Name | Meaning | Suggested Fix |
|------|------|---------|---------------|
| 322-323 | `ox`/`oy` | **o**ffset **x**/**y** | `offsetX`/`offsetY` (tight scope but shared utility) |

---

## MODERATE — Widespread cryptic loop-index convention

The codebase uses a consistent but cryptic pattern: iterate collection `X` → index `xi` (first letter + `i`). Over **57 instances** in `ql_core.js` and **30+** in `ql_settings.js`.

### The full `xi` catalog (ql_core.js)

| Index | Collection | Instances |
|-------|-----------|-----------|
| `ri` / `rr` | `roots` | ~8 |
| `ci` | `children` / `classNames` / `candidates` / `cachedPanels` | ~12 |
| `pi` | `panels` / `panelRoots` / `previous` | ~6 |
| `ai` | `attrKeys` | ~4 |
| `si` | `enemyIndices` / `samples` / `styleKeys` | ~4 |
| `qi` | `queue` | ~2 |
| `li` | `labels` | ~2 |
| `fi` | `found` | ~1 |
| `wi` | `windows` | ~1 |
| `gi` | `generalEntries` | ~1 |
| `ni` | `nodes` / `next` | ~3 |
| `hi` | `next` (hinted) | ~1 |
| `ei` | `next` (entries) | ~1 |
| `mi` | `next` (matched, capped at 10) | ~1 |
| `di` | `disabledFeatures` (ql_settings) | ~2 |
| `oi` | `options` (ql_settings) | ~2 |
| `ti` | `tabs`/`targets` (ql_settings) | ~2 |
| `bi` | buttons (minimap) | ~1 |

### Multi-meaning problem

Several of these cryptic indices mean DIFFERENT things in different functions:
- **`si`**: sample index / slot index / search index
- **`hi`**: hole index / hinted-next index
- **`ci`**: child index / candidate index / cached-panel index / className index
- **`mi`**: match-next index / menu-item index

**Recommendation:** Not urgent to change, but if refactoring a function anyway, expand to `childIdx`/`panelIdx`/`rootIdx`, or use `for...of` / `.forEach()`.

---

## MINOR — Borderline but worth noting

### Across all files

| File | Line | Name | Issue |
|------|------|------|-------|
| ql_core.js | 14073 | `st` | Ambiguous: means `status` at line 9675 but `state` at line 14071 |
| ql_core.js | 11711 | `why` | Quirky: parameter is already named `reason` — this is just a string coercion of it. `reasonStr` clearer. |
| ql_core.js | 12157 | `low` | Means "lowercase version" — `lower` or `lowerText` would be clearer |
| ql_core.js | 14438 | `vis` | Means "visibility" — `visibility` clearer |
| ql_core.js | 14794-14795 | `cls`/`typ` | "class"/"type" — common abbreviations but `classText`/`typeText` already exist as params |
| ql_core.js | 16001 | `pid` | "panel ID" — `panelId` clearer |
| ql_core.js | 17993 | `lbl` | "label" — common but `label` is only 2 more chars |
| ql_core.js | 3872-3876 | `aa`/`bb`/`av`/`bv` | Version comparison: `aParts`/`bParts`/`aVal`/`bVal` clearer. Same pattern duplicated in ql_shared_presets.js:463-469 and ql_settings.js:10399-10403 |
| ql_core.js | 7582 | `bg` | "background" — common in UI, borderline |
| ql_feat_damagenumbers.js | 147 | `em` | "existing meta" index |
| ql_feat_damagenumbers.js | 246 | `im` | "indicator meta" index |
| ql_feat_rejuvtimers.js | 701 | `tt` | "total time" — `totalTime` clearer |
| ql_utils.js | 605 | `fi` | "frame index" — loop index, acceptable |
| ql_utils.js | 631 | `si` | "sample index" — loop index, acceptable |
| ql_settings.js | 9575 | `py` | "position y" — acceptable alongside `px` |
| ql_settings.js | 15698 | `hi` | "hole index" in Whack-a-Rem — OK in game-specific context |

---

## Summary Statistics

| Severity | Count | Files Affected |
|----------|-------|---------------|
| SEVERE | 3 issues (affecting ~10 variable sites) | ql_core.js |
| HIGH | 16 variables | ql_core.js (10), ql_settings.js (5), ql_utils.js (1) |
| MODERATE | ~87 instances of `xi` pattern | ql_core.js (~57), ql_settings.js (~30) |
| MINOR | 18 instances | 5 files |

**Total actionable findings:** ~124 variable name issues across ~71K lines.

## Quick Wins (highest impact per effort)

1. **Rename `hc` (healthContainer)** at line 5827 → `healthContainer` (prevents confusion with `hc` at 8956)
2. **Rename `gc`** at ql_settings.js:12906 → `groupChildIdx` (prevents collision with `GC` = GetCachedPanel convention)
3. **Rename `cd` (candidates index)** at line 19864 → `candIdx` (prevents confusion with cooldown)
4. **Rename `cc`** at line 14422 → `childCount` (consistency)
5. **Rename `ek`** at ql_settings.js:12738 → `enableKey`
